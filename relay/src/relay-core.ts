import { DEFAULT_RELAY_LIMITS, type RelayLimits, type RelayRateBucket } from './limits.js';
import type { RelayRateLimiter } from './rate-limiter.js';
import type { RelaySessionStore } from './session-store.js';

export interface RelayHttpRequest {
  method: string;
  /** URL path without query string, exactly as received. */
  path: string;
  clientKey: string;
  body: string | null;
}

export interface RelayHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string | null;
}

export interface RelayCore {
  handle(request: RelayHttpRequest): Promise<RelayHttpResponse>;
}

export interface RelayCoreDependencies {
  store: RelaySessionStore;
  rateLimiter: RelayRateLimiter;
  nowMs: () => number;
  limits?: RelayLimits;
  basePath?: string;
}

type RelayErrorCode =
  | 'bad_request'
  | 'not_found'
  | 'method_not_allowed'
  | 'conflict'
  | 'expired'
  | 'payload_too_large'
  | 'rate_limited'
  | 'request_timeout'
  | 'unavailable'
  | 'internal';

type RelayRoute = { kind: 'sessions' } | { kind: 'ciphertext'; rawSessionId: string };

const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const BASE_PATH_PATTERN = /^(\/[A-Za-z0-9._~-]+)*\/?$/;
const CIPHERTEXT_ROUTE = /^\/v1\/pairing\/sessions\/([^/]+)\/ciphertext$/;
const BASE_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'access-control-allow-origin': '*',
});

export function normalizeRelayBasePath(raw: string | undefined): string {
  const value = raw ?? '';
  if (value !== '' && !BASE_PATH_PATTERN.test(value)) {
    throw new Error('Relay base path must be empty or an absolute path.');
  }
  return value.replace(/\/+$/, '');
}

/** CORS preflight answer for relay paths; adapters may return it without reaching the store. */
export function relayPreflightResponse(): RelayHttpResponse {
  return emptyResponse(204, {
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'access-control-max-age': '600',
  });
}

export function relayErrorResponse(
  status: number,
  code: RelayErrorCode,
  extraHeaders: Record<string, string> = {},
): RelayHttpResponse {
  return jsonResponse(status, { error: code }, extraHeaders);
}

function jsonResponse(status: number, value: unknown, extraHeaders: Record<string, string> = {}): RelayHttpResponse {
  return {
    status,
    headers: { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', ...extraHeaders },
    body: JSON.stringify(value),
  };
}

function emptyResponse(status: number, extraHeaders: Record<string, string> = {}): RelayHttpResponse {
  return { status, headers: { ...BASE_HEADERS, ...extraHeaders }, body: null };
}

function matchRoute(path: string, basePath: string): RelayRoute | null {
  if (basePath !== '' && !path.startsWith(`${basePath}/`)) return null;
  const rest = path.slice(basePath.length);
  if (rest === '/v1/pairing/sessions') return { kind: 'sessions' };
  const match = CIPHERTEXT_ROUTE.exec(rest);
  return match === null ? null : { kind: 'ciphertext', rawSessionId: match[1] as string };
}

function decodeSessionId(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return SESSION_ID_PATTERN.test(decoded) ? decoded : null;
}

type ParsedBody = { ok: true; value: Record<string, unknown> } | { ok: false; response: RelayHttpResponse };

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function createRelayCore(deps: RelayCoreDependencies): RelayCore {
  const limits = deps.limits ?? DEFAULT_RELAY_LIMITS;
  const basePath = normalizeRelayBasePath(deps.basePath);
  const encoder = new TextEncoder();

  function parseBody(body: string | null, keys: readonly string[]): ParsedBody {
    if (body === null) return { ok: false, response: relayErrorResponse(400, 'bad_request') };
    if (encoder.encode(body).byteLength > limits.maxBodyBytes) {
      return { ok: false, response: relayErrorResponse(413, 'payload_too_large') };
    }
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      return { ok: false, response: relayErrorResponse(400, 'bad_request') };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, response: relayErrorResponse(400, 'bad_request') };
    }
    const record = value as Record<string, unknown>;
    if (!hasExactKeys(record, keys)) return { ok: false, response: relayErrorResponse(400, 'bad_request') };
    return { ok: true, value: record };
  }

  async function miss(clientKey: string, nowMs: number): Promise<RelayHttpResponse> {
    await deps.rateLimiter.consume('miss', clientKey, nowMs);
    return relayErrorResponse(404, 'not_found');
  }

  async function createSession(body: string | null, clientKey: string, nowMs: number): Promise<RelayHttpResponse> {
    const parsed = parseBody(body, ['sessionId', 'expiresAtMs']);
    if (!parsed.ok) return parsed.response;
    const { sessionId, expiresAtMs } = parsed.value;
    // The client expiry is shape-checked only: the relay owns the TTL because TV clocks may be skewed.
    if (
      typeof sessionId !== 'string'
      || !SESSION_ID_PATTERN.test(sessionId)
      || typeof expiresAtMs !== 'number'
      || !Number.isFinite(expiresAtMs)
    ) {
      return relayErrorResponse(400, 'bad_request');
    }
    const result = await deps.store.create(sessionId, clientKey, nowMs);
    if (result.outcome === 'created') return emptyResponse(204);
    if (result.outcome === 'exists') return relayErrorResponse(409, 'conflict');
    if (result.outcome === 'client_limit') {
      const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      return relayErrorResponse(429, 'rate_limited', { 'retry-after': String(retryAfterSeconds) });
    }
    return relayErrorResponse(503, 'unavailable');
  }

  async function putCiphertext(
    sessionId: string,
    body: string | null,
    clientKey: string,
    nowMs: number,
  ): Promise<RelayHttpResponse> {
    const parsed = parseBody(body, ['ciphertext']);
    if (!parsed.ok) return parsed.response;
    const { ciphertext } = parsed.value;
    if (typeof ciphertext !== 'string' || ciphertext.length === 0 || ciphertext.length > limits.maxCiphertextLength) {
      return relayErrorResponse(400, 'bad_request');
    }
    const outcome = await deps.store.put(sessionId, ciphertext, nowMs);
    if (outcome === 'stored') return emptyResponse(204);
    if (outcome === 'missing') return miss(clientKey, nowMs);
    if (outcome === 'expired') return relayErrorResponse(410, 'expired');
    if (outcome === 'full') return relayErrorResponse(503, 'unavailable');
    return relayErrorResponse(409, 'conflict');
  }

  async function poll(sessionId: string, clientKey: string, nowMs: number): Promise<RelayHttpResponse> {
    const outcome = await deps.store.take(sessionId, nowMs);
    if (outcome.kind === 'missing') return miss(clientKey, nowMs);
    if (outcome.kind === 'ready') return jsonResponse(200, { status: 'ready', ciphertext: outcome.ciphertext });
    return jsonResponse(200, { status: outcome.kind });
  }

  async function route(request: RelayHttpRequest): Promise<RelayHttpResponse> {
    const matched = matchRoute(request.path, basePath);
    if (matched === null) return relayErrorResponse(404, 'not_found');

    if (request.method === 'OPTIONS') return relayPreflightResponse();

    const methods = matched.kind === 'sessions' ? ['POST'] : ['GET', 'POST'];
    if (!methods.includes(request.method)) {
      return relayErrorResponse(405, 'method_not_allowed', { allow: [...methods, 'OPTIONS'].join(', ') });
    }

    const nowMs = deps.nowMs();
    const probing = await deps.rateLimiter.peek('miss', request.clientKey, nowMs);
    if (!probing.allowed) {
      return relayErrorResponse(429, 'rate_limited', { 'retry-after': String(probing.retryAfterSeconds) });
    }

    const bucket: RelayRateBucket = matched.kind === 'sessions' ? 'create' : request.method === 'POST' ? 'put' : 'poll';
    const decision = await deps.rateLimiter.consume(bucket, request.clientKey, nowMs);
    if (!decision.allowed) {
      return relayErrorResponse(429, 'rate_limited', { 'retry-after': String(decision.retryAfterSeconds) });
    }

    if (matched.kind === 'sessions') return createSession(request.body, request.clientKey, nowMs);

    const sessionId = decodeSessionId(matched.rawSessionId);
    if (sessionId === null) return miss(request.clientKey, nowMs);
    if (request.method === 'POST') return putCiphertext(sessionId, request.body, request.clientKey, nowMs);
    return poll(sessionId, request.clientKey, nowMs);
  }

  return {
    async handle(request: RelayHttpRequest): Promise<RelayHttpResponse> {
      try {
        return await route(request);
      } catch {
        return relayErrorResponse(500, 'internal');
      }
    },
  };
}
