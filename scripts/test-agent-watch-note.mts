// The note of a met watch (api/_lib/agent/watch-note.ts), its place in the worker's tick and the door's "thesis".
// Nothing here calls a provider, a market source, Apple or a database: the provider's replies are SCRIPTED.
//   npm run test:agent-watch-note
import assert from 'node:assert/strict';

process.env.BOBBY_SUPABASE_URL = 'https://test.invalid'; process.env.BOBBY_SUPABASE_ANON_KEY = 'test'; process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.RATE_LIMIT_SALT = 'test-salt-test-salt-test-salt';

const note = await import('../api/_lib/agent/watch-note.ts');
const { watchResult, watchView } = await import('../api/_lib/agent/watch.ts');
const { MemoryWatchStore } = await import('../api/_lib/agent/watch-store.ts');
const { runWatchTick, watchWorkerDeps, NOTE_NEED_MS } = await import('../api/_lib/agent/watch-worker.ts');
type Watch = import('../api/_lib/agent/watch.ts').Watch;
type NewWatch = import('../api/_lib/agent/watch-store.ts').NewWatch;
type AppLanguage = import('../src/lib/app-language.ts').AppLanguage;
type NoteReply = import('../api/_lib/agent/watch-note.ts').NoteReply;

let checks = 0;
const ok = (value: unknown, what: string) => { assert.ok(value, what); checks++; };
const eq = <T>(actual: T, expected: T, what: string) => { assert.deepEqual(actual, expected, what); checks++; };
const DAY = 86_400_000, T0 = Date.parse('2026-11-07T12:00:00Z');
const LANGUAGES: AppLanguage[] = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const ANA = '11111111-1111-4111-8111-111111111111', BEN = '22222222-2222-4222-8222-222222222222';
const ID = 'watch_0123456789abcdef0123456789abcdef';
const base = (language: AppLanguage = 'es'): Pick<Watch, 'id' | 'symbol' | 'language' | 'locale' | 'reference'> => ({ id: ID, symbol: 'NVDA', language, locale: null, reference: { day: '2026-11-06', close: 200, currency: 'USD' } });
const MET = { day: '2026-11-12', close: 187.6, changePct: -6.2 };
const logged: string[] = [];
const realError = console.error; console.error = (...args: unknown[]) => { logged.push(args.map(String).join(' ')); };

// ---------- the question and the money ----------
{
  const question = note.noteQuestion(base(), MET);
  ok(/NVIDIA \(NVDA\)/.test(question) && /fell/.test(question) && /2026-11-06/.test(question) && /2026-11-12/.test(question) && /Spanish/.test(question), 'the question names the asset, the direction, the two days and the language');
  ok(!question.includes(ID) && !question.includes(ANA) && !/6[.,]2|187|200/.test(question), '…and neither the watch, the account nor a number of the move: those are code\'s');
  ok(/rose/.test(note.noteQuestion(base('en'), { ...MET, changePct: 5.4 })), 'a rise is asked as a rise');
  const reserve = note.noteReserveUsd('claude-sonnet-5-5');
  ok(reserve > 0.1 && reserve < 0.25, `a note reserves its worst case, searches included (${reserve})`);
  ok(note.thesisReserveUsd('claude-sonnet-5-5') < 0.05, 'the thesis paragraph reserves a few cents at most');
  ok(note.NOTE_SYSTEM.includes(note.NOTE_SENTINEL) && /not instructions/.test(note.NOTE_SYSTEM) && /never an advisor/.test(note.NOTE_SYSTEM), 'the instructions carry the sentinel, the rule about pages and the analyst rule');
  for (const text of ['Deberías vender antes del viernes.', 'You should wait for a pullback.', 'Te recomiendo comprar.', 'Tu devrais vendre.', 'Dovresti aspettare.', 'Du solltest verkaufen.', 'Você deveria comprar.', 'Bom momento para entrar.'])
    ok(note.givesAdvice(text), `advice is recognised: ${text}`);
  for (const text of ['Reuters informó que la empresa recortó su previsión de ingresos.', 'CNBC reported a broad sell-off in chip makers after new export rules.', 'Analysts at the bank lowered their rating, Bloomberg reported.'])
    ok(!note.givesAdvice(text), `a report is not advice: ${text}`);
}

// ---------- one request, read strictly ----------
const cite = (url: string, title = 'A headline') => ({ type: 'web_search_result_location', url, title, cited_text: 'x', encrypted_index: 'e' });
const reply = (content: unknown[], over: Record<string, unknown> = {}) => ({ stop_reason: 'end_turn', content, usage: { input_tokens: 20_000, output_tokens: 400, server_tool_use: { web_search_requests: 2 } }, ...over });
const searched = [{ type: 'text', text: 'Let me look.' }, { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'nvidia' } }, { type: 'web_search_tool_result', tool_use_id: 's1', content: [] }];
const realFetch = globalThis.fetch;
const requests: Array<Record<string, any>> = [];
const answerWith = (status: number, body: unknown) => { globalThis.fetch = (async (_url: unknown, init: { body: string }) => { requests.push(JSON.parse(init.body)); return { status, json: async () => { if (body === 'broken') throw new Error('x'); return body; } }; }) as never; };
const ask = (search = true) => note.callNoteOnce({ model: 'claude-sonnet-5-5', system: note.NOTE_SYSTEM, user: 'q', maxTokens: note.NOTE_MAX_TOKENS, timeoutMs: 1000, search });
{
  delete process.env.ANTHROPIC_API_KEY;
  eq((await ask() as { code: string }).code, 'not_configured', 'without a key no request leaves');
  process.env.ANTHROPIC_API_KEY = 'test-key';
  answerWith(200, reply([...searched,
    { type: 'text', text: 'Reuters informó que la empresa recortó su previsión. ', citations: [cite('https://www.reuters.com/a', '  Nvidia   cuts\nforecast '), cite('https://www.reuters.com/a')] },
    { type: 'text', text: 'CNBC añadió que el sector cayó tras nuevas reglas.', citations: [cite('https://cnbc.com/b', 'Chips fall'), cite('http://cnbc.com/insecure'), cite('https://evil.example/c'), cite('https://reuters.com.evil.example/d')] }]));
  const good = await ask();
  ok(good.ok, 'a cited answer is usable');
  if (good.ok) {
    eq(good.value.text, 'Reuters informó que la empresa recortó su previsión. CNBC añadió que el sector cayó tras nuevas reglas.', 'the answer is the text after the last search: what was said before searching is not it');
    eq(good.value.sources, [{ url: 'https://www.reuters.com/a', host: 'reuters.com', title: 'Nvidia cuts forecast' }, { url: 'https://cnbc.com/b', host: 'cnbc.com', title: 'Chips fall' }], 'sources are the allowed sites over https, once each: a look-alike host, plain http and any other site are dropped');
    eq(good.usd, Number((20_000 * 2 / 1e6 + 400 * 10 / 1e6 + 2 * 0.01).toFixed(6)), 'the cost is the tokens at list price plus each search');
  }
  const sentRequest = requests.at(-1)!;
  eq([sentRequest.model, sentRequest.tools.length, sentRequest.tools[0].type, sentRequest.tools[0].max_uses, JSON.stringify(sentRequest.tools[0].allowed_domains) === JSON.stringify(note.NOTE_DOMAINS), sentRequest.messages.length, sentRequest.output_config.effort],
    ['claude-sonnet-5-5', 1, 'web_search_20260209', note.NOTE_MAX_SEARCHES, true, 1, 'low'], 'one tool, search, with its ceiling and its list of sites; one message; low effort');
  ok(!('tool_choice' in sentRequest) && !('thinking' in sentRequest) && !('temperature' in sentRequest), 'nothing this model refuses is sent');

  answerWith(200, reply([...searched, { type: 'text', text: 'La acción cayó por temores del mercado.' }]));
  eq([(await ask() as { outcome: string }).outcome, (await ask() as { code: string }).code], ['charged', 'uncited'], 'a sentence nobody can trace is not kept, and it was paid for');
  answerWith(200, reply([...searched, { type: 'text', text: 'Algo pasó.', citations: [cite('https://evil.example/c')] }]));
  eq((await ask() as { code: string }).code, 'uncited', 'a source outside the list is no source');
  answerWith(200, reply([...searched, { type: 'text', text: 'NONE' }]));
  const none = await ask();
  ok(none.ok && none.value.text === 'NONE' && none.value.sources.length === 0, 'the sentinel alone needs no source');
  for (const [stop, code] of [['pause_turn', 'stop_pause_turn'], ['max_tokens', 'stop_max_tokens'], ['refusal', 'stop_refusal']] as const) {
    answerWith(200, reply([...searched, { type: 'text', text: 'x', citations: [cite('https://reuters.com/a')] }], { stop_reason: stop }));
    eq((await ask() as { code: string }).code, code, `a turn that ended in ${stop} is no note, and it is not asked again`);
  }
  answerWith(529, {}); eq((await ask() as { outcome: string }).outcome, 'no_charge', 'a refusal by status costs nothing');
  answerWith(200, 'broken'); eq((await ask() as { outcome: string }).outcome, 'unknown', 'a 200 nobody can read may have cost money: unknown');
  globalThis.fetch = (async () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; }) as never;
  eq((await ask() as { code: string }).code, 'timeout', 'a timeout is unknown too');
  answerWith(200, reply([{ type: 'text', text: 'Toca lo que escribiste sobre los márgenes.' }], { usage: { input_tokens: 900, output_tokens: 200 } }));
  const plain = await ask(false);
  ok(plain.ok && !('tools' in requests.at(-1)!), 'the thesis paragraph is asked with no tool at all, and needs no citation');
  globalThis.fetch = realFetch;
}

// ---------- the note ----------
const reserved: Array<{ workRef: string; reserveUsd: number; kind: string }> = [];
const passThrough = (async (p: { workRef: string; reserveUsd: number; kind: string }, call: () => Promise<any>) => { reserved.push(p); const r = await call(); return r.ok ? { ok: true, value: r.value } : { ok: false, code: 'provider_failed' }; }) as never;
const scripted = (value: NoteReply | Error | null) => (async () => { if (value instanceof Error) throw value; return value ? { ok: true, value, usd: 0.05, estimated: false, usage: { tokensIn: 1, tokensOut: 1, latencyMs: 1 } } : { ok: false, outcome: 'charged', code: 'uncited', status: 200, latencyMs: 1, usd: 0.05, estimated: false, usage: { tokensIn: 1, tokensOut: 1, latencyMs: 1 } }; }) as never;
const deps = (value: NoteReply | Error | null, over: Record<string, unknown> = {}) => note.noteDeps({ call: scripted(value), reserve: passThrough, model: () => 'claude-sonnet-5-5', now: () => T0, ...over });
const SOURCE = { url: 'https://www.reuters.com/a', host: 'reuters.com', title: 'Nvidia cuts forecast' };
const WHY = 'Reuters informó que la empresa recortó su previsión de ingresos para el trimestre.';
{
  const written = await note.writeWatchNote(base(), MET, deps({ text: WHY, sources: [SOURCE] }));
  eq(written, { version: 1, why: WHY, sources: [SOURCE], found: true, model: 'claude-sonnet-5-5', writtenAt: new Date(T0).toISOString() }, 'a cited note is kept as it was written');
  eq([reserved.at(-1)!.workRef, reserved.at(-1)!.kind, reserved.at(-1)!.reserveUsd], [`watch-note:${ID}`, 'llm', note.noteReserveUsd('claude-sonnet-5-5')], 'its money is reserved first, under the watch, at the worst case');
  for (const language of LANGUAGES) {
    const nothing = await note.writeWatchNote(base(language), MET, deps({ text: 'NONE', sources: [] }));
    ok(nothing && nothing.found === false && nothing.sources.length === 0 && nothing.why.length > 20 && nothing.why !== 'NONE', `${language}: "nothing explains it" is said by code, in the watch's language`);
  }
  eq(await note.writeWatchNote(base(), MET, deps({ text: 'Reuters informó de una caída. Deberías vender ya.', sources: [SOURCE] })), null, 'a note that tells the person what to do is dropped whole');
  eq(await note.writeWatchNote(base(), MET, deps({ text: 'x'.repeat(note.NOTE_MAX_CHARS + 1), sources: [SOURCE] })), null, 'a note longer than the screen is dropped');
  eq(await note.writeWatchNote(base(), MET, deps({ text: WHY, sources: [] })), null, 'a note with no source is dropped');
  eq(await note.writeWatchNote(base(), MET, deps(null)), null, 'a reply the reader refused is no note');
  eq(await note.writeWatchNote(base(), MET, deps(new Error('boom'))), null, 'a call that throws is no note, and nothing is thrown at the tick');
  eq(await note.writeWatchNote(base(), MET, deps({ text: WHY, sources: [SOURCE] }, { reserve: (async () => ({ ok: false, code: 'budget_exhausted' })) as never })), null, 'with the day\'s money spent, no call is made and there is no note');
}

// ---------- its place in the tick ----------
const newWatch = (id: string, identity: string, over: Partial<NewWatch> = {}): NewWatch => ({
  id, identity, requestId: id, bodyDigest: 'd', symbol: 'BTC', direction: 'falls', percent: 5, days: 7, language: 'es', locale: null,
  reference: { day: '2026-11-06', close: 100, currency: 'USDT' }, createdAt: new Date(T0).toISOString(), expiresAt: new Date(T0 + 7 * DAY).toISOString(), ...over,
});
function okx(closes: number[], last: string) {
  const end = Date.parse(`${last}T00:00:00Z`);
  const rows = closes.map((close, i) => { const ts = end - (closes.length - 1 - i) * DAY, open = i ? closes[i - 1] : close; return [String(ts), String(open), String(Math.max(open, close) * 1.01), String(Math.min(open, close) * 0.99), String(close), '10', '1000', '1000', '1']; });
  return { code: '0', data: rows.reverse() };
}
{
  // Forty-five calm closes ending at 100 on November 6, then one at 93 on the 7th: a fall of 7%.
  const closes = [...Array.from({ length: 44 }, (_, i) => Number((100 + 2 * Math.sin(i * 0.9 + 0.6)).toFixed(4))), 100, 93];
  let now = T0 + DAY;
  const asked: string[] = [];
  const world = (noteOf: ((watch: Watch) => Promise<any>) | null, store: InstanceType<typeof MemoryWatchStore>) => watchWorkerDeps(store, {
    now: () => now, worker: 'w',
    tools: { retryMs: 1, now: () => new Date(now), fetchJson: async (url: string) => /instId=BTC-USDT/.test(decodeURIComponent(url)) ? okx(closes, '2026-11-07') : null } as never,
    apnsConfig: () => null, pushMasterKey: () => null, close: () => undefined, logger: { error: () => undefined },
    note: noteOf ? (async (watch: Watch) => { asked.push(watch.id); return noteOf(watch); }) : null,
  });
  const A = 'watch_' + 'a'.repeat(32), B = 'watch_' + 'b'.repeat(32);
  const written = { version: 1, why: WHY, sources: [SOURCE], found: true, model: 'claude-sonnet-5-5', writtenAt: new Date(now).toISOString() };

  let store = new MemoryWatchStore();
  await store.create(newWatch(A, ANA), 3, T0);
  let report = await runWatchTick(world(null, store), now + 45_000);
  eq([report.met, report.noted, report.deferred], [1, 0, 0], 'notes off: a met watch ends as it always did');
  eq((watchView((await store.get(ANA, A))!).result as { note: unknown }).note, null, '…and its view says there is no note');

  store = new MemoryWatchStore();
  await store.create(newWatch(A, ANA), 3, T0);
  report = await runWatchTick(world(async () => written, store), now + 45_000);
  eq([report.met, report.noted, asked], [1, 1, [A]], 'notes on: the met watch gets its note in the write that ends it');
  const view = watchView((await store.get(ANA, A))!);
  eq((view.result as { note: unknown }).note, { why: WHY, found: true, sources: [SOURCE] }, 'a client sees the sentences and where they were read');
  ok(!JSON.stringify(view).includes('claude-') && !JSON.stringify(view).includes('writtenAt'), '…never the model');
  ok(String((view.result as { text: string }).text).length > 20 && !(view.result as { text: string }).text.includes('Reuters'), 'what code wrote about the move stays its own text');

  store = new MemoryWatchStore(); asked.length = 0;
  await store.create(newWatch(A, ANA), 3, T0);
  report = await runWatchTick(world(async () => null, store), now + 45_000);
  eq([report.met, report.noted], [1, 0], 'a note that could not be written changes nothing else: the watch is met and owed its notification');
  eq((await store.get(ANA, A))!.push, 'pending', '…with its push pending');

  store = new MemoryWatchStore(); asked.length = 0;
  await store.create(newWatch(A, ANA), 3, T0); await store.create(newWatch(B, BEN), 3, T0);
  // The first note takes the tick's time: the clock moves while it is written.
  report = await runWatchTick(world(async () => { now += 30_000; return written; }, store), now + 45_000);
  eq([report.met, report.noted, report.deferred, asked.length], [1, 1, 1, 1], 'with no time left for a second note, the second met watch waits: it is not ended without one');
  const waiting = [(await store.get(ANA, A))!, (await store.get(BEN, B))!].filter((watch) => watch.state === 'active');
  eq(waiting.length, 1, '…and it is still looking');
  now += 15 * 60_000;
  report = await runWatchTick(world(async () => written, store), now + 45_000);
  eq([report.met, report.noted, report.deferred], [1, 1, 0], 'the next tick meets it, with its note');
  ok(NOTE_NEED_MS > note.NOTE_TIMEOUT_MS && NOTE_NEED_MS < 45_000, 'a note fits in a tick with room to write it down');
}

// ---------- the door: what it means for the thesis ----------
{
  const { default: handler, __setWatchTestDeps } = await import('../api/agent-watch.ts');
  const store = new MemoryWatchStore();
  const met = 'watch_' + 'c'.repeat(32), active = 'watch_' + 'd'.repeat(32);
  await store.create(newWatch(met, ANA, { symbol: 'NVDA', reference: { day: '2026-11-06', close: 200, currency: 'USD' } }), 3, T0);
  await store.create(newWatch(active, ANA), 3, T0);
  const claim = (await store.claimDue('w', 60_000, 10, T0 + 1)).find((c) => c.watch.id === met)!;
  await store.met(met, claim.fence, MET, { ...watchResult((await store.get(ANA, met))!, MET, null), note: { version: 1, why: WHY, sources: [SOURCE], found: true, model: 'm', writtenAt: 'x' } } as never, T0 + 2);
  let who = ANA, said: string | null | Error = 'Esto toca lo que escribiste: «si recortan la previsión, me equivoqué».';
  const users: string[] = [];
  __setWatchTestDeps({ store, account: async () => ({ id: who, authUserId: 'u', wallet: null, via: 'supabase', provider: 'apple' }), isPro: async () => false, limit: async () => undefined,
    note: { reserve: passThrough, model: () => 'claude-sonnet-5-5', now: () => T0, call: (async (c: { user: string; search: boolean; system: string }) => { users.push(c.user); if (said instanceof Error) throw said; return said ? { ok: true, value: { text: said, sources: [] }, usd: 0.01, estimated: false, usage: { tokensIn: 1, tokensOut: 1, latencyMs: 1 } } : { ok: false, outcome: 'no_charge', code: 'http_529', status: 529, latencyMs: 1 }; }) as never } });
  const call = async (body: unknown) => {
    const res = { statusCode: 200, body: null as any, setHeader() { /* not read */ }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; return this; } };
    await handler({ method: 'POST', query: {}, headers: { origin: 'https://bobbyprotocol.xyz' }, body } as never, res as never);
    return res;
  };
  const SECRET = 'Creo que sus márgenes aguantan; zanahoria-7731';
  const thesis = (over: Record<string, unknown> = {}) => ({ op: 'thesis', watchId: met, thesis: { hypothesis: SECRET, changeMind: 'Si recortan la previsión, me equivoqué.' }, ...over });
  process.env.BOBBY_AGENT_WATCHES = 'on'; process.env.BOBBY_AGENT_ENGINE = 'on';
  delete process.env.BOBBY_AGENT_WATCH_NOTES;
  eq([(await call(thesis())).statusCode, users.length], [404, 0], 'with notes off the question does not exist, and no model is asked');
  process.env.BOBBY_AGENT_WATCH_NOTES = 'on';
  logged.length = 0;
  const answered = await call(thesis());
  eq([answered.statusCode, answered.body], [200, { version: 1, watchId: met, paragraph: said }], 'with a met watch and a thesis, one paragraph comes back');
  ok(users[0].includes(SECRET) && users[0].includes(WHY) && users[0].includes('-6.2%') && /Spanish/.test(users[0]) && !users[0].includes(ANA), 'the model is given the move, what was reported and the thesis: not the account');
  ok(reserved.at(-1)!.workRef.startsWith(`watch-thesis:${met}:`), 'its money is reserved under the watch');
  ok(!JSON.stringify(await store.get(ANA, met)).includes('zanahoria') && !logged.join('\n').includes('zanahoria'), 'the thesis is neither stored nor logged');
  eq([(await call(thesis({ watchId: active }))).statusCode, (await call(thesis({ watchId: 'watch_' + 'e'.repeat(32) }))).statusCode], [404, 404], 'a watch that was not met, or does not exist, has nothing to say');
  who = BEN; eq((await call(thesis())).statusCode, 404, 'another account\'s watch is the same answer');
  who = ANA;
  eq([(await call(thesis({ thesis: { hypothesis: '' } }))).statusCode, (await call(thesis({ thesis: { hypothesis: 'x'.repeat(601) } }))).statusCode, (await call(thesis({ thesis: { hypothesis: 'a', model: 'opus' } }))).statusCode, (await call(thesis({ language: 'en' }))).statusCode], [400, 400, 400, 400], 'an empty or oversized thesis, and any field that is not the thesis, are refused');
  said = 'Toca tu preocupación. Deberías vender.';
  eq((await call(thesis())).body.error.code, 'watch_note_unavailable', 'a paragraph that tells the person what to do is not shown');
  said = null; eq((await call(thesis())).statusCode, 503, 'a provider that does not answer is said plainly');
  said = new Error('boom'); eq((await call(thesis())).statusCode, 503, 'and so is a call that throws');
  __setWatchTestDeps(null);
}

console.error = realError;
console.log(`agent watch notes: ${checks} checks passed`);
