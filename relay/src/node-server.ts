import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { normalizeClientAddress } from './client-address.js';
import { normalizeRelayBasePath, relayErrorResponse, type RelayCore, type RelayHttpResponse } from './relay-core.js';

export { normalizeClientAddress };

export interface RelayNodeServerOptions {
  core: RelayCore;
  maxBodyBytes: number;
  /**
   * Number of reverse proxies in front of the relay that append to X-Forwarded-For.
   * 0 keys clients by socket address; N takes the N-th address from the right.
   */
  trustedProxyHops: number;
  /** Deadline for receiving a request body, so slow uploads cannot hold connection slots. */
  bodyTimeoutMs?: number;
  headersTimeoutMs?: number;
  requestTimeoutMs?: number;
  connectionsCheckingIntervalMs?: number;
  maxConnections?: number;
}

export interface RelayServerConfig {
  host: string;
  port: number;
  basePath: string;
  trustedProxyHops: number;
}

type BodyRead = { ok: true; body: string } | { ok: false; reason: 'too_large' | 'timeout' };

const DEFAULT_BODY_TIMEOUT_MS = 3_000;
const DEFAULT_HEADERS_TIMEOUT_MS = 5_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECTIONS_CHECKING_INTERVAL_MS = 1_000;
const DEFAULT_MAX_CONNECTIONS = 2_048;
const MAX_TRUSTED_PROXY_HOPS = 10;

export function readRelayServerConfig(env: Record<string, string | undefined>): RelayServerConfig {
  const rawPort = env.PORT ?? '8787';
  const port = /^\d+$/.test(rawPort) ? Number(rawPort) : Number.NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  let basePath: string;
  try {
    basePath = normalizeRelayBasePath(env.RELAY_BASE_PATH);
  } catch {
    throw new Error('RELAY_BASE_PATH must be empty or an absolute path such as /relay.');
  }

  const rawHops = env.RELAY_TRUSTED_PROXY_HOPS || '0';
  const trustedProxyHops = /^\d+$/.test(rawHops) ? Number(rawHops) : Number.NaN;
  if (!Number.isInteger(trustedProxyHops) || trustedProxyHops > MAX_TRUSTED_PROXY_HOPS) {
    throw new Error(`RELAY_TRUSTED_PROXY_HOPS must be an integer between 0 and ${MAX_TRUSTED_PROXY_HOPS}.`);
  }

  return { host: env.RELAY_HOST || '127.0.0.1', port, basePath, trustedProxyHops };
}

function clientKeyOf(request: IncomingMessage, trustedProxyHops: number): string {
  const socketKey = normalizeClientAddress(request.socket.remoteAddress) ?? 'unknown';
  if (trustedProxyHops === 0) return socketKey;
  const header = request.headers['x-forwarded-for'];
  const joined = Array.isArray(header) ? header.join(',') : header;
  if (!joined) return socketKey;
  const hops = joined.split(',').map((entry) => entry.trim()).filter((entry) => entry !== '');
  return normalizeClientAddress(hops[hops.length - trustedProxyHops]) ?? socketKey;
}

function pathOf(url: string | undefined): string {
  return new URL(url ?? '/', 'http://relay.invalid').pathname;
}

/** Buffers at most maxBodyBytes within timeoutMs; larger bodies are drained without being kept in memory. */
function readBody(request: IncomingMessage, maxBodyBytes: number, timeoutMs: number): Promise<BodyRead> {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > maxBodyBytes) {
    request.resume();
    return Promise.resolve({ ok: false, reason: 'too_large' });
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      clearTimeout(timer);
      return true;
    };
    const timer = setTimeout(() => {
      if (!settle()) return;
      chunks.length = 0;
      resolve({ ok: false, reason: 'timeout' });
    }, timeoutMs);

    request.on('data', (chunk: Buffer) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        settle();
        chunks.length = 0;
        resolve({ ok: false, reason: 'too_large' });
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (settle()) resolve({ ok: true, body: Buffer.concat(chunks).toString('utf8') });
    });
    request.on('close', () => {
      if (settle()) reject(new Error('Request closed before its body completed.'));
    });
    request.on('error', () => {
      if (settle()) reject(new Error('Request body failed.'));
    });
  });
}

function send(response: ServerResponse, relayResponse: RelayHttpResponse): void {
  if (response.headersSent || response.destroyed) return;
  response.writeHead(relayResponse.status, relayResponse.headers);
  response.end(relayResponse.body ?? undefined);
}

async function serve(request: IncomingMessage, response: ServerResponse, options: RelayNodeServerOptions): Promise<void> {
  try {
    const method = request.method ?? 'GET';
    let body: string | null = null;
    if (method === 'POST') {
      const read = await readBody(request, options.maxBodyBytes, options.bodyTimeoutMs ?? DEFAULT_BODY_TIMEOUT_MS);
      if (!read.ok && read.reason === 'timeout') {
        response.once('finish', () => request.socket.destroy());
        send(response, relayErrorResponse(408, 'request_timeout', { connection: 'close' }));
        return;
      }
      if (!read.ok) {
        send(response, relayErrorResponse(413, 'payload_too_large', { connection: 'close' }));
        return;
      }
      body = read.body;
    } else {
      request.resume();
    }

    send(response, await options.core.handle({
      method,
      path: pathOf(request.url),
      clientKey: clientKeyOf(request, options.trustedProxyHops),
      body,
    }));
  } catch {
    send(response, relayErrorResponse(500, 'internal'));
  }
}

export function createRelayNodeServer(options: RelayNodeServerOptions): Server {
  const server = createServer(
    {
      headersTimeout: options.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS,
      requestTimeout: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
      // Node only enforces the two timeouts above on this interval (30 s by default).
      connectionsCheckingInterval: options.connectionsCheckingIntervalMs ?? DEFAULT_CONNECTIONS_CHECKING_INTERVAL_MS,
    },
    (request, response) => {
      void serve(request, response, options);
    },
  );
  server.maxConnections = options.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  return server;
}
