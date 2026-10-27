import assert from 'node:assert/strict';
import { FinalTtsError, generateSpeech, hedged, speechChunks } from '../api/_lib/tts.js';

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
  // No punctuation at all (or only dashes): still cut between words, so no piece outlasts its timeout.
  const flat = Array.from({ length: 160 }, (_, i) => `palabra${i}`).join(' ');
  const flatPieces = speechChunks(flat);
  assert.ok(flatPieces.length > 1 && flatPieces.length <= 6, `unpunctuated text splits, got ${flatPieces.length}`);
  assert.ok(Math.max(...flatPieces.map((p) => p.length)) <= 300, 'no unpunctuated piece is oversized');
  assert.equal(flatPieces.join(' '), flat);
  const dashed = Array.from({ length: 30 }, (_, i) => `la idea número ${i} sigue`).join(' — ');
  assert.equal(speechChunks(dashed).join(' '), dashed);
  assert.ok(speechChunks(dashed).length > 1, 'dashes are split points');
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
  // ...and is never hedged or retried: a failed or slow Telegram note costs one call, as before.
  inputs.length = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    inputs.push(JSON.parse(String(init.body)).input);
    return new Response('upstream', { status: 500 });
  }) as typeof fetch;
  assert.equal(await generateSpeech(READ_LINE, { voice: 'cio', lang: 'en', format: 'opus', preservePersona: true }), null);
  assert.equal(inputs.length, 1, 'a failed Opus note is one call');
  console.log('ok - Opus stays a single unhedged call');

  // One failed piece fails the persona voice as a whole (no half-spoken line).
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)).input;
    if (input === pieces[1]) return new Response('upstream', { status: 500 });
    return new Response(new Uint8Array(600), { status: 200 });
  }) as typeof fetch;
  assert.equal(await generateSpeech(READ_LINE, { voice: 'cio', lang: 'en', format: 'mp3', preservePersona: true }), null);
  console.log('ok - a failed piece never yields a partial line');

  // A 4xx is final: no retry of that piece, and every other pending piece is cancelled at once.
  const perPiece = new Map<string, number>();
  let cancelled = 0;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body)).input as string;
    perPiece.set(input, (perPiece.get(input) ?? 0) + 1);
    if (input === pieces[0]) return new Response('{"error":{"code":"insufficient_quota"}}', { status: 400 });
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => { cancelled++; reject(new Error('aborted')); });
    });
  }) as typeof fetch;
  const t0 = Date.now();
  assert.equal(await generateSpeech(READ_LINE, { voice: 'cio', lang: 'en', format: 'mp3', preservePersona: true }), null);
  assert.ok(Date.now() - t0 < 1_000, 'a 4xx fails the line at once');
  assert.equal(perPiece.get(pieces[0]), 1, 'a 4xx piece is not retried');
  assert.equal(cancelled, pieces.length - 1, 'every other pending piece is cancelled');
  const launched = [...perPiece.values()].reduce((a, b) => a + b, 0);
  await new Promise((r) => setTimeout(r, 3_700));
  assert.equal([...perPiece.values()].reduce((a, b) => a + b, 0), launched, 'no hedge launches after the line failed');
  console.log('ok - a 4xx is final and cancels the rest of the line');
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
  // A fast failure is replaced at once; six failures reject.
  calls = 0;
  assert.equal(await hedged(async () => { if (++calls === 1) throw new Error('500'); return 'ok'; }, 10_000), 'ok');
  calls = 0;
  await assert.rejects(hedged(async () => { calls++; throw new Error('down'); }, 10_000), /down/);
  assert.equal(calls, 6, 'never more than six requests per piece');
  // A fast answer never launches the hedge.
  calls = 0;
  assert.equal(await hedged(async () => { calls++; return 'fast'; }, 50), 'fast');
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, 1);
    // Two stalled requests: the third, launched two hedge intervals in, still answers.
  calls = 0;
  const third = await hedged(async (cancel) => { const n = ++calls; await wait(n < 3 ? 1_000 : 5, cancel); return n; }, 20);
  assert.equal(third, 3);
  // FinalTtsError rejects at once; a synchronous throw is a normal failure; an outer abort stops everything.
  calls = 0;
  await assert.rejects(hedged(async () => { calls++; throw new FinalTtsError('400'); }, 10_000), FinalTtsError);
  assert.equal(calls, 1);
  calls = 0;
  assert.equal(await hedged((() => { if (++calls === 1) throw new Error('sync'); return Promise.resolve('ok'); }) as (s: AbortSignal) => Promise<string>, 10_000), 'ok');
  const outer = new AbortController();
  calls = 0;
  const stopped = hedged((cancel) => { calls++; return wait(5_000, cancel).then(() => 'late'); }, 20, 4, outer.signal);
  setTimeout(() => outer.abort(new Error('line failed')), 30);
  await assert.rejects(stopped, /line failed/);
  const atAbort = calls;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(calls, atAbort, 'nothing launches after the outer abort');
  console.log('ok - stalled pieces are hedged up to six times, failed ones replaced, fast ones sent once');
} finally {
  globalThis.fetch = oldFetch;
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
}

console.log('6/6 TTS latency checks passed');
