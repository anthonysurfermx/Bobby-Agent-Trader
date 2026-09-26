import assert from 'node:assert/strict';
import { Communicate } from 'edge-tts-universal';
import { generateSpeech } from '../api/_lib/tts.js';

// Exercise the public endpoint with paid credentials present. A failed free
// provider must return to the client's device voice, never spend on OpenAI.
process.env.OPENAI_API_KEY = 'test-paid-key-must-not-be-used';
process.env.TTS_PROVIDER = 'openai';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-db-key';
let paidCalls = 0;
globalThis.fetch = async (input) => {
  if (String(input).startsWith('https://db.test/')) throw new Error('Simulated quota store outage');
  if (String(input) === 'https://api.openai.com/v1/audio/speech') paidCalls++;
  throw new Error('Unexpected paid request');
};
const { default: handler } = await import('../api/bobby-voice-free.js');
const original = Communicate.prototype.stream;
let status = 0;
const headers: Record<string, string> = {};
const res = {
  setHeader(name: string, value: string) { headers[name] = value; },
  status(code: number) { status = code; return this; },
  json() {}, send() {},
};
const req = { method: 'POST', headers: {}, socket: {}, body: { text: 'BTC sigue en observación.', voice: 'coral', lang: 'es', mode: 'free' } };
try {
  Communicate.prototype.stream = async function* () { yield { type: 'audio', data: new Uint8Array(1024) }; } as typeof original;
  await handler(req as any, res as any);
  assert.equal(status, 200);
  assert.equal(headers['X-TTS-Provider'], 'edge');
  assert.equal(paidCalls, 0);
  Communicate.prototype.stream = async function* () {
    yield* [];
    throw new Error('Simulated free provider outage');
  };
  await handler(req as any, res as any);
  assert.equal(status, 502);
  assert.equal(paidCalls, 0, 'Free provider failure must not spend the OpenAI balance');
  Communicate.prototype.stream = async function* () { yield { type: 'audio', data: new Uint8Array(1024) }; } as typeof original;
  req.body.mode = 'paid';
  await handler(req as any, res as any);
  assert.equal(status, 200);
  assert.equal(headers['X-TTS-Provider'], 'edge');
  assert.equal(paidCalls, 0, 'Unavailable quota store must degrade to free Edge even in paid mode');

  Communicate.prototype.stream = async function* () { await new Promise(() => {}); } as typeof original;
  const edgeStart = Date.now();
  assert.equal(await generateSpeech('A stalled free voice.', { provider: 'edge', timeoutMs: 60 }), null);
  assert(Date.now() - edgeStart < 500, 'A stalled Edge stream must respect the deadline');
  assert.equal(paidCalls, 0, 'A stalled free voice must not trigger paid synthesis');

  let paidAborted = false;
  globalThis.fetch = async (_input, init) => {
    paidCalls++;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        paidAborted = true;
        reject(init.signal?.reason);
      }, { once: true });
    });
  };
  Communicate.prototype.stream = async function* () { yield { type: 'audio', data: new Uint8Array(1024) }; } as typeof original;
  const paidStart = Date.now();
  const fallback = await generateSpeech('A stalled paid voice.', { provider: 'openai', timeoutMs: 120 });
  assert.equal(fallback?.provider, 'edge', 'A stalled paid voice must fall back to Edge');
  assert(paidAborted && Date.now() - paidStart < 500, 'A stalled paid fetch must be aborted within the deadline');
  assert.equal(paidCalls, 1);
  console.log('Free voice endpoint: Edge success, outage, quota fallback, and provider deadlines passed.');
} finally { Communicate.prototype.stream = original; }
