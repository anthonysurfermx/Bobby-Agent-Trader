import assert from 'node:assert/strict';
import { Communicate } from 'edge-tts-universal';
import handler from '../api/bobby-voice-free.js';

// Exercise the public endpoint with paid credentials present. A failed free
// provider must return to the client's device voice, never spend on OpenAI.
process.env.OPENAI_API_KEY = 'test-paid-key-must-not-be-used';
process.env.TTS_PROVIDER = 'openai';
let paidCalls = 0;
globalThis.fetch = async () => { paidCalls++; throw new Error('Unexpected paid request'); };
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
  console.log('Free voice endpoint: Edge success, outage, and zero paid-provider requests passed.');
} finally { Communicate.prototype.stream = original; }
