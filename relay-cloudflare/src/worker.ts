import { normalizeClientAddress } from '../../relay/src/client-address.js';
import { DEFAULT_RELAY_LIMITS } from '../../relay/src/limits.js';
import { relayErrorResponse, relayPreflightResponse, type RelayHttpResponse } from '../../relay/src/relay-core.js';
import { RelayShard } from './relay-shard.js';

export { RelayShard };

const RELAY_PATH = '/v1/pairing/sessions';
const SHARD_NAME = 'shard-0';

type BodyRead = { ok: true; body: string | null } | { ok: false };

function toResponse(relayResponse: RelayHttpResponse): Response {
  return new Response(relayResponse.body, { status: relayResponse.status, headers: relayResponse.headers });
}

/** Reads at most maxBytes; a larger body is cancelled instead of buffered. */
async function readLimitedBody(request: Request, maxBytes: number): Promise<BodyRead> {
  const declared = Number(request.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false };
  if (request.body === null) return { ok: true, body: null };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return { ok: false };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: new TextDecoder().decode(bytes) };
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    // Everything the Worker can answer alone stays off the Durable Object's request budget.
    // Non-relay paths are the phone pairing page; delegating keeps them correct even when the
    // platform routes a request to the Worker before the asset layer.
    if (path !== RELAY_PATH && !path.startsWith(`${RELAY_PATH}/`)) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return toResponse(relayPreflightResponse());

    let body: string | null = null;
    if (request.method === 'POST') {
      const read = await readLimitedBody(request, DEFAULT_RELAY_LIMITS.maxBodyBytes);
      if (!read.ok) return toResponse(relayErrorResponse(413, 'payload_too_large'));
      body = read.body;
    }

    try {
      const relayResponse = await env.RELAY.getByName(SHARD_NAME).handle({
        method: request.method,
        path,
        clientKey: normalizeClientAddress(request.headers.get('CF-Connecting-IP')) ?? 'unknown',
        body,
      });
      return toResponse(relayResponse);
    } catch {
      return toResponse(relayErrorResponse(503, 'unavailable'));
    }
  },
} satisfies ExportedHandler<Cloudflare.Env>;
