import { env, listDurableObjectIds, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import worker from '../src/worker.js';

const SESSIONS = 'https://relay.example.invalid/v1/pairing/sessions';

// This file never lets a request reach the Durable Object, so the namespace must stay empty.
describe('RELAY-CF Worker edge handling', () => {
  it('answers preflight, unknown paths and oversized bodies without a Durable Object request', async () => {
    const preflight = await SELF.fetch(SESSIONS, { method: 'OPTIONS' });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-methods')).toBe('GET, POST, OPTIONS');

    const unknown = await SELF.fetch('https://relay.example.invalid/v1/other');
    expect(unknown.status).toBe(404);
    await unknown.arrayBuffer();

    const declared = await SELF.fetch(SESSIONS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(40_000) }),
    });
    expect(declared.status).toBe(413);
    expect(await declared.json()).toEqual({ error: 'payload_too_large' });

    const encoder = new TextEncoder();
    const streamed = await SELF.fetch(SESSIONS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let index = 0; index < 8; index += 1) controller.enqueue(encoder.encode('x'.repeat(8_192)));
          controller.close();
        },
      }),
    });
    expect(streamed.status).toBe(413);

    expect(await listDurableObjectIds(env.RELAY)).toHaveLength(0);
  });

  it('serves the phone pairing page from static assets under /babustv/', async () => {
    const page = await SELF.fetch('https://relay.example.invalid/babustv/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(await page.text()).toContain('/babustv/assets/');
  });

  it('turns a failing Durable Object call into a fixed 503', async () => {
    const failingEnv = {
      ASSETS: { fetch: async () => new Response('asset') },
      RELAY: {
        getByName: () => ({
          handle: async () => {
            throw new Error('provider-password-canary');
          },
        }),
      },
    } as unknown as Cloudflare.Env;
    const response = await worker.fetch(
      new Request(`${SESSIONS}/FailingSessionAbcdefgh/ciphertext`),
      failingEnv,
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toBe('{"error":"unavailable"}');
  });
});
