import assert from 'node:assert/strict';
import { generateSpeech } from '../api/_lib/tts.js';

const oldFetch = globalThis.fetch;
const oldKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-only';
let attempts = 0;
try {
  globalThis.fetch = async (_url, init) => {
    attempts++;
    assert.ok(init?.signal, 'TTS must bound a stalled provider');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.voice, 'echo', 'The ballad persona retains its configured voice');
    assert.equal(body.response_format, 'mp3');
    return new Response(Buffer.alloc(1000), { status: 200 });
  };
  const speech = await generateSpeech('A calm market reading.', { voice: 'ballad', lang: 'en', format: 'mp3', preservePersona: true });
  assert.equal(speech?.provider, 'openai');
  assert.equal(attempts, 1);
  globalThis.fetch = async () => { attempts++; throw new Error('Simulated provider failure'); };
  attempts = 0;
  assert.equal(await generateSpeech('A calm market reading.', { voice: 'ballad', preservePersona: true }), null);
  assert.equal(attempts, 1, 'Persona mode never falls through to a different voice provider');
  console.log('Persona voice success, identity, bounded request and failure checks passed');
} finally {
  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
}
