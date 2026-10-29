import assert from 'node:assert/strict';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { guardWrite } from '../api/_lib/write-guard.js';

// write-guard's byte cap holds whatever the headers say: without Content-Length (a chunked upload), and on a body the
// runtime already parsed. Those requests reached the schema before, and zod 3 validates every element of an array
// even after .max() has failed (GHSA-mrhx-c7xc-m3w5), so a refused body must never be walked. The in-memory per-IP
// limit runs before the body is measured or parsed, so a payload the schema refuses still spends the caller's budget.

function responseRecorder() {
  const state: { status?: number; body?: any; headers: Record<string, string> } = { headers: {} };
  const response = {
    status(code: number) {
      state.status = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
    setHeader(name: string, value: string | number) {
      state.headers[name.toLowerCase()] = String(value);
      return response;
    },
  } as unknown as VercelResponse;
  return { response, state };
}

function request(body: unknown, headers: Record<string, string> = {}): VercelRequest {
  return { method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.20', ...headers }, query: {} } as unknown as VercelRequest;
}

const CAP = 1024;
let walked = 0;
const Body = z.object({
  events: z.array(z.preprocess((value) => { walked += 1; return value; }, z.object({ id: z.string() }))).max(50),
  note: z.string().max(2_000).optional(),
});

async function guard(req: VercelRequest, perIp = { limit: 1_000, windowSec: 60 }) {
  walked = 0;
  const { response, state } = responseRecorder();
  const result = await guardWrite(req, response, {
    methods: ['POST'], scope: 'test-write-guard', schema: Body, auth: 'none', allowNoOrigin: true,
    perIp, maxBodyBytes: CAP,
  });
  return { result, state, walked };
}

const originalFetch = globalThis.fetch;
const previousFreeze = { protocol: process.env.PROTOCOL_CUTOVER_FREEZE, write: process.env.BOBBY_WRITE_FREEZE, source: process.env.BOBBY_CONTROL_SOURCE };
let checks = 0;
try {
  delete process.env.PROTOCOL_CUTOVER_FREEZE;
  delete process.env.BOBBY_WRITE_FREEZE;
  delete process.env.BOBBY_CONTROL_SOURCE;
  // The persistent limiter is the only network caller; offline it lets the request through, as in production.
  globalThis.fetch = (async () => { throw new Error('offline test: no network'); }) as typeof fetch;

  const oversized = { events: Array.from({ length: 2_000 }, () => ({})) };
  assert.ok(JSON.stringify(oversized).length > CAP);

  {
    const r = await guard(request(oversized));
    assert.equal(r.state.status, 413, 'an already-parsed body over the cap without Content-Length is refused');
    assert.equal(r.walked, 0, 'a refused body is never walked by the schema');
    checks += 2;
  }
  {
    const r = await guard(request(JSON.stringify(oversized)));
    assert.equal(r.state.status, 413, 'a text body over the cap without Content-Length is refused');
    assert.equal(r.walked, 0);
    checks += 2;
  }
  {
    const r = await guard(request(Buffer.from(JSON.stringify(oversized))));
    assert.equal(r.state.status, 413, 'a raw-bytes body over the cap is refused');
    checks += 1;
  }
  {
    // 600 characters, 1,200 bytes: the cap is on bytes, as Content-Length is.
    const text = JSON.stringify({ events: [], note: 'é'.repeat(600) });
    assert.ok(text.length < CAP && Buffer.byteLength(text) > CAP);
    const r = await guard(request(text));
    assert.equal(r.state.status, 413, 'the cap counts bytes, not UTF-16 units');
    checks += 1;
  }
  {
    const r = await guard(request({ events: [] }, { 'content-length': String(CAP + 1) }));
    assert.equal(r.state.status, 413, 'a declared Content-Length over the cap is still refused first');
    checks += 1;
  }
  {
    const r = await guard(request({ events: [{}, {}, {}] }));
    assert.equal(r.state.status, 400, 'a body under the cap reaches the schema');
    assert.equal(r.walked, 3);
    checks += 2;
  }
  {
    const body = { events: [{ id: 'a' }], note: 'é'.repeat(100) };
    const r = await guard(request(body));
    assert.equal(r.state.status, undefined, 'a valid body under the cap is accepted');
    assert.deepEqual(r.result?.body, body);
    const again = await guard(request(JSON.stringify(body)));
    assert.deepEqual(again.result?.body, body, 'the same body as text is accepted too');
    checks += 3;
  }
  {
    const limited = { limit: 3, windowSec: 60 };
    const from = { 'x-forwarded-for': '203.0.113.21' };
    for (let i = 0; i < limited.limit; i += 1) {
      const r = await guard(request({ events: [{}] }, from), limited);
      assert.equal(r.state.status, 400, 'invalid payloads within the limit are answered by the schema');
    }
    const over = await guard(request({ events: [{}] }, from), limited);
    assert.equal(over.state.status, 429, 'an invalid payload over the per-IP limit is refused before the parse');
    assert.equal(over.walked, 0, 'a rate-limited body is never walked by the schema');
    assert.equal(over.state.headers['retry-after'], '60');
    const big = await guard(request(oversized, from), limited);
    assert.equal(big.state.status, 429, 'the limit is checked before the body is measured');
    const elsewhere = await guard(request({ events: [{}] }, { 'x-forwarded-for': '203.0.113.22' }), limited);
    assert.equal(elsewhere.state.status, 400, 'another address keeps its own budget');
    checks += 6;
  }

  console.log(`write-guard: ${checks} checks passed`);
} finally {
  globalThis.fetch = originalFetch;
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore('PROTOCOL_CUTOVER_FREEZE', previousFreeze.protocol);
  restore('BOBBY_WRITE_FREEZE', previousFreeze.write);
  restore('BOBBY_CONTROL_SOURCE', previousFreeze.source);
}
