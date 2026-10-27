import assert from 'node:assert/strict';
import { generateSpeech, hedged, speechChunks } from '../api/_lib/tts.js';

// A read's spoken line as the Núcleo builds it: the CIO's sentences (~600 chars) plus the close.
const READ_LINE = 'The 1H evidence for ETH-USDT as of 2026-10-27 13:00 UTC shows a lateral trend with neutral momentum and RSI14 at 50.9, so there is no clear directional signal. Price at 2326 sits between its average of the last hours (EMA20 2319.4, 0.28% below the price) and its longer average (EMA50 2327.7, 0.07% above). Support at 2296.1 and resistance at 2344.5 frame a narrow range. Only the last few days are visible here, so longer trends and news are missing from this evidence. My call: wait.';

const oldFetch = globalThis.fetch;
const oldKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = 'test-only';

try {
  // Chunking: bounded count, sentence-sized pieces, nothing lost.
  const pieces = speechChunks(READ_LINE);
  assert.ok(pieces.length >= 3 && pieces.length <= 6, `a read line splits into 3-6 pieces, got ${pieces.length}`);
  assert.equal(pieces.join(' '), READ_LINE.replace(/\s+/g, ' ').trim());
  for (const piece of pieces) assert.ok(piece.length <= 260, `piece too long for a fast call: ${piece.length}`);
  assert.deepEqual(speechChunks('My call: wait.'), ['My call: wait.']);
  assert.deepEqual(speechChunks('   '), []);
  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
  assert.ok(speechChunks(long).length <= 6, 'never more than six parallel calls');
  assert.equal(speechChunks(long).join(' '), long);
  const runOn = 'This is one very long sentence without a full stop, which keeps going, adding clause after clause, '.repeat(5) + 'and finally ends.';
  assert.ok(Math.max(...speechChunks(runOn).map((p) => p.length)) < runOn.length, 'a run-on sentence still splits at commas');
  console.log('ok - read lines split into a few sentence-sized pieces with nothing lost');

  // MP3: the pieces are synthesized in parallel and joined in reading order, even when they finish out of order.
  const inputs: string[] = [];
  let inFlight = 0, peak = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    inputs.push(body.input);
    inFlight++; peak = Math.max(peak, inFlight);
    const index = pieces.indexOf(body.input);
    await new Promise((r) => setTimeout(r, (pieces.length - index) * 15));   // the first piece finishes last
    inFlight--;
    return new Response(new Uint8Array(600).fill(index + 1), { status: 200, headers: { 'Content-Type': 'audio/mpeg' } });
  }) as typeof fetch;
  const mp3 = await generateSpeech(READ_LINE, { voice: 'cio', lang: 'en', format: 'mp3', preservePersona: true });
  assert.ok(mp3, 'speech returned');
  assert.equal(mp3!.provider, 'openai');
  assert.equal(inputs.length, pieces.length);
  assert.equal(peak, pieces.length, 'every piece is requested at once');
  assert.equal(mp3!.audio.length, 600 * pieces.length);
  for (let i = 0; i < pieces.length; i++) assert.equal(mp3!.audio[i * 600], i + 1, `piece ${i} lands in reading order`);
  console.log('ok - MP3 pieces are synthesized in parallel and joined in reading order');

  // Opus (Telegram voice notes) cannot be joined: it stays one call with the whole text.
  inputs.length = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    inputs.push(JSON.parse(String(init.body)).input);
    return new Response(new Uint8Array(600), { status: 200 });
  }) as typeof fetch;
  const opus = await generateSpeech(READ_LINE, { voice: 'cio', lang: 'en', format: 'opus', preservePersona: true });
  assert.ok(opus);
  assert.deepEqual(inputs, [READ_LINE]);
  console.log('ok - Opus stays a single call');

  // One failed piece fails the persona voice as a whole (no half-spoken line).
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)).input;
    if (input === pieces[1]) return new Response('upstream', { status: 500 });
    return new Response(new Uint8Array(600), { status: 200 });
  }) as typeof fetch;
  assert.equal(await generateSpeech(READ_LINE, { voice: 'cio', lang: 'en', format: 'mp3', preservePersona: true }), null);
  console.log('ok - a failed piece never yields a partial line');
  // Hedging: a slow first request gets a twin and the first answer wins; the loser is cancelled.
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
  });
  let calls = 0, aborted = 0;
  const winner = await hedged(async (cancel) => {
    const n = ++calls;
    cancel.addEventListener('abort', () => aborted++);
    await wait(n === 1 ? 500 : 20, cancel);
    return n;
  }, 30);
  assert.equal(winner, 2, 'the hedge answered first');
  assert.equal(calls, 2);
  assert.equal(aborted, 1, 'the slow request is cancelled');
  // A fast failure is replaced at once; three failures reject.
  calls = 0;
  assert.equal(await hedged(async () => { if (++calls === 1) throw new Error('500'); return 'ok'; }, 10_000), 'ok');
  calls = 0;
  await assert.rejects(hedged(async () => { calls++; throw new Error('down'); }, 10_000), /down/);
  assert.equal(calls, 3, 'never more than three requests per piece');
  // A fast answer never launches the hedge.
  calls = 0;
  assert.equal(await hedged(async () => { calls++; return 'fast'; }, 50), 'fast');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, 1);
    // Two stalled requests: the third, launched two hedge intervals in, still answers.
  calls = 0;
  const third = await hedged(async (cancel) => { const n = ++calls; await wait(n < 3 ? 1_000 : 5, cancel); return n; }, 20);
  assert.equal(third, 3);
  console.log('ok - stalled pieces are hedged up to three times, failed ones replaced, fast ones sent once');
} finally {
  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
}

console.log('5/5 TTS latency checks passed');
