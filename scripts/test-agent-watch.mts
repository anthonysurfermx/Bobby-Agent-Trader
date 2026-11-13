// Watches (api/_lib/agent/watch*.ts, door api/agent-watch.ts): the arithmetic, the words, the store's invariants,
// the worker's tick and the door, with SYNTHETIC series. Nothing here calls a provider, a market source or Apple.
//   npm run test:agent-watch
// With DATABASE_URL (a LOCAL scratch database: it drops and recreates agent_watches and two stand-in tables) the
// store's invariants also run against docs/agent-engine/agent-watches.sql, with real concurrent transactions.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

process.env.BOBBY_SUPABASE_URL = 'https://test.invalid'; process.env.BOBBY_SUPABASE_ANON_KEY = 'test'; process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.RATE_LIMIT_SALT = 'test-salt-test-salt-test-salt';

const { checkWatch, watchLabel, watchResult, watchPushCopy, watchPayload, watchView, WATCH_LIMIT, WATCH_KEEP_DAYS } = await import('../api/_lib/agent/watch.ts');
const { MemoryWatchStore, PgWatchStore } = await import('../api/_lib/agent/watch-store.ts');
const { LOOK_AGAIN_MS } = await import('../api/_lib/agent/watch-worker.ts');
const { readAssets } = await import('../api/_lib/agent/tools.ts');
type Watch = import('../api/_lib/agent/watch.ts').Watch;
type NewWatch = import('../api/_lib/agent/watch-store.ts').NewWatch;
type WatchStore = import('../api/_lib/agent/watch-store.ts').WatchStore;
type DailyBar = import('../api/_lib/harness/bars.ts').DailyBar;
type AppLanguage = import('../src/lib/app-language.ts').AppLanguage;

let checks = 0;
const ok = (value: unknown, what: string) => { assert.ok(value, what); checks++; };
const eq = <T>(actual: T, expected: T, what: string) => { assert.deepEqual(actual, expected, what); checks++; };

const DAY = 86_400_000;
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const LANGUAGES: AppLanguage[] = ['en', 'es', 'fr', 'pt', 'it', 'de'];
const ANA = '11111111-1111-4111-8111-111111111111', BEN = '22222222-2222-4222-8222-222222222222';

// ---------- 1. when a watch is met ----------
const bars = (closes: number[], first = '2026-10-01'): DailyBar[] => closes.map((close, i) => ({ day: dayOf(Date.parse(`${first}T00:00:00Z`) + i * DAY), open: close, high: close, low: close, close, volume: 1, closedAt: '' }));
const ref = { day: '2026-10-03', close: 100, currency: 'USDT' };
{
  const run = bars([90, 95, 100, 98, 96, 94, 93]);   // the reference is the third day
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, run), { kind: 'met', met: { day: '2026-10-06', close: 94, changePct: 100 * (94 / 100 - 1) } }, 'a fall is met on the FIRST close far enough below the reference, never a later one');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 10 }, run), { kind: 'quiet', through: '2026-10-07' }, 'not met: quiet, and it says the last day it looked at');
  eq(checkWatch({ reference: ref, direction: 'rises', percent: 3 }, run).kind, 'quiet', 'a fall does not meet a watch for a rise');
  eq(checkWatch({ reference: ref, direction: 'moves', percent: 5 }, run).kind, 'met', 'either way is met by a fall');
  eq(checkWatch({ reference: ref, direction: 'moves', percent: 5 }, bars([90, 95, 100, 102, 105.5])).kind, 'met', '…and by a rise');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, bars([90, 95, 100, 95])).kind, 'met', 'exactly the size asked is met');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, bars([80, 85, 100])).kind, 'quiet', 'the days before the reference never count, however low');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, null).kind, 'unreadable', 'no series: unreadable, never met');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, bars([50, 50], '2026-10-04')).kind, 'unreadable', 'a series that no longer holds the reference day is unreadable');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, bars([45, 47.5, 50, 40])).kind, 'unreadable', 'a reference close the source now shows as another number (a split) is unreadable, never a fall of sixty percent');
  eq(checkWatch({ reference: ref, direction: 'falls', percent: 5 }, bars([90, 95, 100.3, 94])).kind, 'met', 'a reference restated by a rounding still counts, measured from the close the watch was made with');
}

// ---------- 2. the words ----------
const sample = (language: AppLanguage, over: Partial<Watch> = {}): Watch => ({
  id: 'watch_0123456789abcdef0123456789abcdef', identity: ANA, requestId: 'r1', bodyDigest: 'd', symbol: 'NVDA', direction: 'falls', percent: 5, days: 7,
  language, locale: null, reference: { day: '2026-11-06', close: 200, currency: 'USD' }, createdAt: '2026-11-07T12:00:00.000Z', expiresAt: '2026-11-14T12:00:00.000Z',
  state: 'active', endedAt: null, checkedThrough: null, unreadable: false, met: null, result: null, seenAt: null, push: 'none', ...over,
});
{
  eq(watchLabel(sample('es')), 'NVIDIA · cierra 5% abajo · hasta el 14 de noviembre', 'the card is one line: the asset, the condition at a close, the last day');
  eq(watchLabel(sample('en')), 'NVIDIA · closes 5% lower · until November 14', 'the same line in English');
  eq(watchLabel(sample('it', { expiresAt: '2026-11-08T12:00:00.000Z' })), 'NVIDIA · chiude 5% più in basso · fino all’8 novembre', 'Italian takes the article its number is said with');
  for (const language of LANGUAGES) for (const direction of ['falls', 'rises', 'moves'] as const) {
    const line = watchLabel(sample(language, { direction }));
    ok(line.split(' · ').length === 3 && !/[{}]|undefined|NaN/.test(line) && line.length < 80, `a whole short line in ${language} for ${direction}`);
  }
  const met = { day: '2026-11-12', close: 187.6, changePct: -6.2 };
  eq(watchResult(sample('es'), met, null).presentation.text, 'NVIDIA: -6.2% desde el cierre en que empecé a vigilar. Cierre del 12 de noviembre frente al del 6 de noviembre.', 'met, with no read behind it: the two closes and the distance, written by code');
  for (const language of LANGUAGES) {
    const told = watchResult(sample(language), met, null).presentation;
    ok(told.composedByCode && told.kind === 'analysis' && told.next === null && told.text.startsWith(told.gist) && /6[.,]2/.test(told.text) && !/[{}]|undefined/.test(told.text), `code's own sentences in ${language}, the first one standing alone`);
    const push = watchPushCopy(language, null);
    ok(push.title === 'Bobby' && !/NVIDIA|NVDA|\d|%/.test(push.body), `the lock screen carries no asset and no number in ${language}`);
  }
  ok(watchPushCopy('pt', 'pt-BR').body.includes('você') && !watchPushCopy('pt', 'pt-PT').body.includes('você'), 'Brazil and Portugal are each addressed their own way');
  eq(watchResult(sample('it', { reference: { day: '2026-11-08', close: 200, currency: 'USD' } }), { ...met, day: '2026-11-11' }, null).presentation.text.includes('Chiusura dell’11 novembre rispetto a quella dell’8 novembre'), true, 'Italian dates take dell’ before 8 and 11');
  const payload = watchPayload(sample('es')) as { aps: { alert: { body: string } }; watchId: string; screen: string };
  eq([payload.watchId, payload.screen], ['watch_0123456789abcdef0123456789abcdef', 'watch'], 'the notification says which watch to open, and nothing about it');
  const view = watchView(sample('es', { state: 'expired', endedAt: '2026-11-14T12:10:00.000Z' })) as Record<string, unknown>;
  ok(!('identity' in view) && !('requestId' in view) && view.notice === 'No pasó: NVIDIA · cierra 5% abajo · hasta el 14 de noviembre.', 'a client is never told the account, and an expired watch has its one sentence');
  ok(String((watchView(sample('es', { state: 'expired', endedAt: '2026-11-14T12:10:00.000Z', unreadable: true })) as Record<string, unknown>).notice).startsWith('No pude seguirlo'), 'a watch that could not be read at the end says so instead of "it did not happen"');
}

// ---------- 3. the store ----------
const T0 = Date.parse('2026-11-07T12:00:00Z');
const fresh = (identity: string, key: string, over: Partial<NewWatch> = {}): NewWatch => ({
  id: `watch_${createHexId(identity + key)}`, identity, requestId: key, bodyDigest: 'd1', symbol: 'BTC', direction: 'falls', percent: 5, days: 7, language: 'es', locale: null,
  reference: { day: '2026-11-06', close: 100, currency: 'USDT' }, createdAt: new Date(T0).toISOString(), expiresAt: new Date(T0 + 7 * DAY).toISOString(), ...over,
});
function createHexId(seed: string): string { return createHash('sha256').update(seed).digest('hex').slice(0, 32); }
const result = () => watchResult(sample('es'), { day: '2026-11-08', close: 94, changePct: -6 }, null);

async function storeInvariants(store: WatchStore, name: string) {
  const made = await store.create(fresh(ANA, 'k1'), 3, T0);
  ok(made.state === 'new' && made.watch.state === 'active' && made.watch.push === 'none' && made.watch.createdAt === new Date(T0).toISOString(), `${name}: a watch is made active`);
  const again = await store.create(fresh(ANA, 'k1', { id: `watch_${createHexId('other')}` }), 3, T0 + 5);
  ok(again.state === 'replay' && again.watch.id === (made as { watch: Watch }).watch.id, `${name}: the same request is the same watch`);
  eq((await store.create(fresh(ANA, 'k1', { bodyDigest: 'd2' }), 3, T0)).state, 'mismatch', `${name}: the same request id with other values is refused`);
  eq(await store.get(BEN, fresh(ANA, 'k1').id), null, `${name}: another account's watch does not exist`);
  eq([await store.cancel(BEN, fresh(ANA, 'k1').id, T0), await store.seen(BEN, fresh(ANA, 'k1').id, T0)], [false, false], `${name}: …and cannot be cancelled or marked by it`);
  // Ten at once against a limit of three: three.
  const many = await Promise.all(Array.from({ length: 10 }, (_, i) => store.create(fresh(BEN, `m${i}`), 3, T0)));
  eq([many.filter((r) => r.state === 'new').length, many.filter((r) => r.state === 'limit').length], [3, 7], `${name}: ten creates at once against a limit of three make three`);
  // One worker at a time.
  const first = await store.claimDue('w1', 60_000, 50, T0 + 1000), second = await store.claimDue('w2', 60_000, 50, T0 + 1000);
  eq([first.length, second.length], [4, 0], `${name}: what one worker holds, another is not given`);
  const mine = first.find((c) => c.watch.identity === ANA)!;
  eq(await store.quiet(mine.watch.id, mine.fence + 1, '2026-11-07', false, T0 + LOOK_AGAIN_MS), false, `${name}: a write with another fence is refused`);
  eq(await store.quiet(mine.watch.id, mine.fence, '2026-11-07', false, T0 + LOOK_AGAIN_MS), true, `${name}: the holder's write goes in`);
  eq(await store.quiet(mine.watch.id, mine.fence, '2026-11-08', false, T0 + LOOK_AGAIN_MS), false, `${name}: …once: the lease went with it`);
  eq((await store.get(ANA, mine.watch.id))!.checkedThrough, '2026-11-07', `${name}: it remembers the last day looked at`);
  eq((await store.claimDue('w3', 60_000, 50, T0 + 2000)).length, 0, `${name}: nothing is due before its next look`);
  // A lease that ran out is taken over, and the old holder writes nothing.
  const stale = first.find((c) => c.watch.identity === BEN)!;
  const taken = await store.claimDue('w4', 60_000, 50, T0 + 61_000 + 1000);
  ok(taken.some((c) => c.watch.id === stale.watch.id && c.fence === stale.fence + 1), `${name}: a lease that ran out is taken over with a higher fence`);
  eq(await store.met(stale.watch.id, stale.fence, { day: '2026-11-08', close: 94, changePct: -6 }, result(), T0 + 62_000), false, `${name}: the stale worker's "met" is refused`);
  // A cancel beats the worker.
  const racing = taken.find((c) => c.watch.id === stale.watch.id)!;
  eq(await store.cancel(BEN, racing.watch.id, T0 + 63_000), true, `${name}: the person cancels while a worker holds the watch`);
  eq(await store.met(racing.watch.id, racing.fence, { day: '2026-11-08', close: 94, changePct: -6 }, result(), T0 + 64_000), false, `${name}: …and the worker's "met" after it is refused`);
  eq(await store.cancel(BEN, racing.watch.id, T0 + 65_000), true, `${name}: a cancel said twice is the same cancel`);
  ok(!(await store.list(BEN)).some((w) => w.id === racing.watch.id), `${name}: a cancelled watch leaves the list`);
  eq((await store.create(fresh(BEN, 'after-cancel'), 3, T0 + 66_000)).state, 'new', `${name}: cancelling one makes room for another`);
  // Met, and its one notification.
  const due = await store.claimDue('w5', 60_000, 50, T0 + LOOK_AGAIN_MS + 1000);
  const hit = due.find((c) => c.watch.identity === ANA)!;
  eq(await store.met(hit.watch.id, hit.fence, { day: '2026-11-08', close: 94, changePct: -6 }, result(), T0 + DAY), true, `${name}: met`);
  const after = (await store.get(ANA, hit.watch.id))!;
  eq([after.state, after.push, after.endedAt, after.met?.day, after.result?.presentation.composedByCode, after.seenAt], ['met', 'pending', new Date(T0 + DAY).toISOString(), '2026-11-08', true, null], `${name}: a met watch holds what was written and owes one notification`);
  eq(await store.cancel(ANA, hit.watch.id, T0 + DAY), false, `${name}: a met watch cannot be cancelled`);
  const claims = await Promise.all(Array.from({ length: 8 }, () => store.claimPushes(10, T0 + DAY)));
  eq(claims.flat().filter((w) => w.id === hit.watch.id).length, 1, `${name}: eight claims of one notification give it once`);
  await store.pushed(hit.watch.id, 'sent'); await store.pushed(hit.watch.id, 'failed');
  eq((await store.get(ANA, hit.watch.id))!.push, 'sent', `${name}: its outcome is written once`);
  eq([await store.seen(ANA, hit.watch.id, T0 + DAY + 5), await store.seen(ANA, hit.watch.id, T0 + DAY + 9), (await store.get(ANA, hit.watch.id))!.seenAt], [true, true, new Date(T0 + DAY + 5).toISOString()], `${name}: seen keeps the first time`);
  // Expired, and the purge.
  const rest = due.filter((c) => c.watch.identity === BEN);
  eq(await store.expire(rest[0].watch.id, rest[0].fence, true, T0 + 7 * DAY), true, `${name}: expired`);
  eq((await store.get(BEN, rest[0].watch.id))!.unreadable, true, `${name}: …keeping whether it could be read at the end`);
  eq(await store.purge(T0 + (7 + WATCH_KEEP_DAYS) * DAY - 1000, WATCH_KEEP_DAYS, 500), 2, `${name}: what ended more than the keeping time ago goes (the cancelled one and the met one), not what ended later`);
  eq([await store.get(ANA, hit.watch.id), (await store.list(BEN)).filter((w) => w.state === 'active').length], [null, 2], `${name}: an active watch is never purged`);
  eq((await store.create(fresh(ANA, 'k1'), 3, T0 + 20 * DAY)).state, 'new', `${name}: a purged request id is free again`);
}
await storeInvariants(new MemoryWatchStore(), 'memory');

// ---------- 4. the worker and the door, on synthetic closes ----------
/** OKX candles as its public API sends them: newest first, numbers as text, a last column saying the day is complete. */
function okx(closes: number[], last: string) {
  const end = Date.parse(`${last}T00:00:00Z`);
  const rows = closes.map((close, i) => { const ts = end - (closes.length - 1 - i) * DAY, open = i ? closes[i - 1] : close; return [String(ts), String(open), String(Math.max(open, close) * 1.01), String(Math.min(open, close) * 0.99), String(close), '10', '1000', '1000', '1']; });
  return { code: '0', data: rows.reverse() };
}
const world = { now: Date.parse('2026-11-07T12:00:00Z'), closes: Array.from({ length: 45 }, (_, i) => Number((100 + 2 * Math.sin(i * 0.9 + 0.6)).toFixed(4))), down: false, fetched: 0, scale: 1 };
world.closes[world.closes.length - 1] = 100;
/** A new day: the clock moves on and the source has one more completed close. */
const nextDay = (close: number) => { world.now += DAY; world.closes.push(close); };
const sent: Array<{ token: string; payload: Record<string, unknown>; apnsId: string }> = [];
const apns = { on: true };
const workerOver = {
  now: () => world.now, worker: 'test-worker',
  tools: { retryMs: 1, now: () => new Date(world.now), fetchJson: async (url: string) => { world.fetched++; return world.down || !/instId=BTC-USDT/.test(decodeURIComponent(url)) ? null : okx(world.closes.slice(-70).map((close) => close * world.scale), dayOf(world.now - DAY)); } },
  apnsConfig: () => (apns.on ? { keyId: 'K', teamId: 'T', privateKey: 'P', topic: 'xyz.bobbyprotocol.bobby', environments: new Set(['production'] as const) } : null) as never,
  pushMasterKey: () => Buffer.alloc(32, 1), decryptToken: (sealed: string) => { if (sealed === 'broken') throw new Error('unreadable'); return sealed.replace('sealed:', ''); },
  send: async (_cfg: unknown, n: { token: string; apnsId: string }, payload: Record<string, unknown>) => { sent.push({ token: n.token, payload, apnsId: n.apnsId }); return { outcome: 'accepted' as const, status: 200, reason: null }; },
  close: () => undefined, logger: { error: () => undefined },
};
{
  const { default: handler, __setWatchTestDeps } = await import('../api/agent-watch.ts');
  const store = new MemoryWatchStore();
  store.deviceList.set(ANA, [{ tokenCiphertext: 'sealed:aa11', environment: 'production', topic: 'xyz.bobbyprotocol.bobby' }, { tokenCiphertext: 'broken', environment: 'production', topic: 'xyz.bobbyprotocol.bobby' }]);
  let who = { id: ANA, provider: 'google' as string | null }, pro = false;
  __setWatchTestDeps({ store, account: async () => ({ id: who.id, authUserId: 'u', wallet: null, via: 'supabase', provider: who.provider }), isPro: async () => pro, limit: async () => undefined, worker: workerOver as never });
  const response = () => ({ statusCode: 200, body: null as any, headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; }, status(n: number) { this.statusCode = n; return this; }, json(v: unknown) { this.body = v; return this; } });
  const call = async (method: string, body: unknown = null, over: { origin?: string | null; query?: Record<string, string>; authorization?: string } = {}) => {
    const res = response();
    await handler({ method, query: over.query ?? {}, headers: { ...(over.origin === null ? {} : { origin: over.origin ?? 'https://bobbyprotocol.xyz' }), ...(over.authorization ? { authorization: over.authorization } : {}) }, body } as never, res as never);
    return res;
  };
  const tick = async () => (await call('GET', null, { query: { tick: '1' }, authorization: 'Bearer cron-secret', origin: null })).body as Record<string, unknown>;
  const create = (over: Record<string, unknown> = {}) => ({ op: 'create', requestId: '5a5a5a5a-0000-4000-8000-000000000001', symbol: 'BTC', direction: 'falls', percent: 5, days: 7, language: 'es', ...over });

  // Who the door exists for.
  process.env.CRON_SECRET = 'cron-secret';
  delete process.env.BOBBY_AGENT_WATCHES; process.env.BOBBY_AGENT_ENGINE = 'on';
  eq([(await call('GET')).statusCode, (await call('POST', create())).statusCode], [404, 404], 'unset, the door is not there, whatever the engine says');
  eq(await tick(), { enabled: false }, '…and the scheduler is told so: nothing is read or sent');
  process.env.BOBBY_AGENT_WATCHES = 'on'; delete process.env.BOBBY_AGENT_ENGINE;
  eq((await call('GET')).statusCode, 404, 'on, with the engine off: still not there');
  process.env.BOBBY_AGENT_ENGINE = 'pilot'; process.env.BOBBY_AGENT_PILOT = '';
  eq((await call('GET')).statusCode, 404, 'on, in a pilot the caller is not on: not there');
  process.env.BOBBY_AGENT_ENGINE = 'on';
  eq((await call('GET', null, { origin: null })).statusCode, 403, 'a request from no origin of Bobby is refused');
  eq((await call('GET', null, { query: { tick: '1' }, origin: null })).statusCode, 401, 'a tick without the scheduler\'s secret is refused');
  who = { id: ANA, provider: null };
  eq((await call('GET')).body.error.code, 'signin_required', 'a session that is not Apple or Google has no watches: there is no device to tell');
  who = { id: ANA, provider: 'google' };

  // Making one.
  eq(world.fetched, 0, 'nothing was asked of a source so far');
  eq([(await call('POST', create({ symbol: 'DOGE' }))).body.error.code, (await call('POST', create({ percent: 4 }))).statusCode, (await call('POST', create({ identity: BEN }))).statusCode, (await call('POST', create({ days: 90 }))).statusCode], ['watch_unknown_asset', 400, 400, 400], 'an asset outside the universe, a size or a length that is not offered, and a body that names an account are refused');
  world.down = true;
  eq((await call('POST', create())).body.error.code, 'watch_unreadable', 'an asset that cannot be read now is refused, never watched blind');
  world.down = false;
  const made = await call('POST', create());
  eq([made.statusCode, made.body.watches.length, made.body.active, made.body.limit, made.body.watches[0].reference, made.body.watches[0].label, made.body.watches[0].state],
    [201, 1, 1, WATCH_LIMIT.free, { day: '2026-11-06', close: 100, currency: 'USDT' }, 'Bitcoin · cierra 5% abajo · hasta el 14 de noviembre', 'active'], 'a watch is made from the last completed close, read by the server');
  const id = made.body.watches[0].id as string;
  world.closes[world.closes.length - 1] = 104;
  const replay = await call('POST', create());
  eq([replay.statusCode, replay.body.watches.length, replay.body.watches[0].reference.close], [200, 1, 100], 'the same request again is the same watch, with the reference it was made with');
  world.closes[world.closes.length - 1] = 100;
  eq((await call('POST', create({ percent: 10 }))).body.error.code, 'request_id_reused', 'the same request id with another size is refused');
  for (const n of [2, 3]) await call('POST', create({ requestId: `5a5a5a5a-0000-4000-8000-00000000000${n}`, direction: n === 2 ? 'rises' : 'moves', percent: 10 }));
  eq((await call('POST', create({ requestId: '5a5a5a5a-0000-4000-8000-000000000004' }))).body.error.code, 'watch_limit', 'a fourth active watch is refused');
  pro = true;
  eq((await call('POST', create({ requestId: '5a5a5a5a-0000-4000-8000-000000000004', direction: 'rises' }))).statusCode, 201, 'Bobby Pro has room for more');
  pro = false;
  who = { id: BEN, provider: 'apple' };
  eq([(await call('GET')).body.watches.length, (await call('POST', { op: 'cancel', watchId: id })).statusCode], [0, 404], 'another account sees none of them and cannot cancel one');
  who = { id: ANA, provider: 'google' };
  const fourth = (await call('GET')).body.watches.find((w: { direction: string; percent: number }) => w.direction === 'rises' && w.percent === 5).id;
  eq((await call('POST', { op: 'cancel', watchId: fourth })).body.watches.length, 3, 'a cancelled watch leaves the list');

  // Looking.
  const before = world.fetched;
  const quiet = await tick();
  eq([quiet.enabled, quiet.looked, quiet.quiet, quiet.met, quiet.notified, world.fetched - before], [true, 3, 3, 0, 0, 1], 'a tick looks at every due watch and asks the source ONCE for the three that watch the same asset');
  eq((await tick()).looked, 0, 'nothing is looked at again before its time');
  nextDay(97);
  eq([(await tick()).quiet, (await store.get(ANA, id))!.checkedThrough], [3, '2026-11-07'], 'a fall smaller than asked: quiet, and it knows the day it looked at');
  world.down = true; world.now += LOOK_AGAIN_MS + 1000;
  eq([(await tick()).unreadable, (await store.get(ANA, id))!.state], [3, 'active'], 'a source that does not answer: unreadable, still watching');
  world.down = false; world.scale = 0.5; world.now += LOOK_AGAIN_MS + 1000;
  eq([(await tick()).unreadable, sent.length], [3, 0], 'every close halved (a split): unreadable, never "it fell fifty percent"');
  world.scale = 1;
  nextDay(93.9);
  const hit = await tick();
  eq([hit.met, hit.quiet, hit.notified, hit.undelivered, hit.codes], [1, 2, 1, 0, 'token_unreadable'], 'the day it closes far enough below: met, and the account is notified on the device whose token can be read');
  const told = (await call('GET')).body.watches.find((w: { id: string }) => w.id === id);
  ok(told.state === 'met' && told.met.day === '2026-11-08' && told.result.composedByCode && told.result.text.startsWith('Bitcoin: -6.1% desde el cierre en que empecé a vigilar. Cierre del 8 de noviembre frente al del 6 de noviembre.') && told.result.figures.length > 0 && told.result.references.length === 1 && told.seen === false, 'the answer is already written, by code: the two closes, then the reading of the last thirty days with its source');
  const again = (await readAssets({ symbols: ['BTC'], windowDays: 30 }, workerOver.tools)).analysis!;
  eq(told.result.analysis.figures.find((f: { id: string }) => f.id === 'return_BTC').value, again.figures.find((f) => f.id === 'return_BTC')!.value, '…and its figures are the ones read_assets computes');
  eq([sent.length, sent[0].token, sent[0].payload.watchId, JSON.stringify(sent[0].payload).includes('Bitcoin'), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/.test(sent[0].apnsId)], [1, 'aa11', id, false, true], 'one notification, naming the watch and not the asset');
  world.now += LOOK_AGAIN_MS + 1000;
  eq([(await tick()).notified, sent.length, (await store.get(ANA, id))!.push], [0, 1, 'sent'], 'it is never sent twice');
  eq((await call('POST', { op: 'seen', watchId: id })).body.watches.find((w: { id: string }) => w.id === id).seen, true, 'opening it marks it seen');

  // A notification that cannot be sent yet stays owed; a watch whose last day passes ends with its sentence.
  apns.on = false;
  nextDay(111);
  const rise = await tick();
  eq([rise.met, rise.notified, rise.codes, (await store.list(ANA)).filter((w) => w.push === 'pending').length], [2, 0, 'apns_unconfigured', 2], 'met without APNs credentials: the answer is there and the notification stays owed');
  apns.on = true; world.now += LOOK_AGAIN_MS + 1000;
  eq([(await tick()).notified, sent.length], [2, 3], '…and is sent when they are back');
  who = { id: BEN, provider: 'apple' };
  await call('POST', create({ requestId: '5a5a5a5a-0000-4000-8000-0000000000b1', percent: 10 }));
  for (let d = 0; d < 7; d++) nextDay(111);
  world.now += 1000;
  const over = await tick();
  const ended = (await call('GET')).body.watches[0];
  eq([over.expired, over.notified, ended.state, ended.notice.startsWith('No pasó: Bitcoin · cierra 10% abajo'), sent.length], [1, 0, 'expired', true, 3], 'its last day passes without the condition: it ends with one sentence and no notification');
  world.now += (WATCH_KEEP_DAYS + 1) * DAY;
  eq([Number((await tick()).purged) > 0, (await store.list(ANA)).length, (await store.list(BEN)).length], [true, 0, 0], 'everything that ended is removed after the keeping time');
  __setWatchTestDeps(null);
}

// ---------- 5. the contract and its migration ----------
{
  const body = (file: string) => { const text = readFileSync(new URL(file, import.meta.url), 'utf8'); return text.slice(text.indexOf('create table if not exists agent_watches (')); };
  ok(body('../docs/agent-engine/agent-watches.sql') === body('../supabase/bobby-protocol/supabase/migrations/20261113004301_agent_watches.sql') && body('../docs/agent-engine/agent-watches.sql').includes('create or replace function agent_watch_purge('), 'the migration holds the same statements as the contract the database test runs');
  const cron = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).crons as Array<{ path: string }>;
  ok(cron.some((job) => job.path === '/api/agent-watch?tick=1'), 'the scheduler calls the tick');
}

// ---------- 6. the same invariants on Postgres ----------
if (process.env.DATABASE_URL) {
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must be a local scratch database');
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 12 });
  await pool.query('drop table if exists agent_watches cascade');
  for (const role of ['anon', 'authenticated', 'service_role']) await pool.query(`do $$ begin if not exists (select 1 from pg_roles where rolname = '${role}') then create role ${role} nologin; end if; end $$`);
  await pool.query('alter default privileges in schema public grant all on functions to anon, authenticated; alter default privileges in schema public grant all on tables to anon, authenticated');
  await pool.query(`do $$ declare f regprocedure; begin for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'agent\\_watch\\_%' loop execute format('drop function %s cascade', f); end loop; end $$`);
  // Stand-ins for the two tables of the product the watches lean on: only the columns they read.
  await pool.query(`drop table if exists bobby_push_devices, bobby_identities cascade; create table bobby_identities (id uuid primary key);
    create table bobby_push_devices (id serial primary key, identity_id uuid not null references bobby_identities(id) on delete cascade, token_ciphertext text not null, environment text not null, topic text not null, permission text not null, status text not null default 'active', last_seen_at timestamptz not null default now())`);
  await pool.query('insert into bobby_identities values ($1), ($2)', [ANA, BEN]);
  const sql = readFileSync(new URL('../docs/agent-engine/agent-watches.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  await pool.query(sql);   // applying it twice changes nothing
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const keys = Object.keys(args);
    const { rows } = await pool.query(`select ${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(', ')}) as v`, keys.map((key) => { const value = args[key]; return value !== null && typeof value === 'object' ? JSON.stringify(value) : value; }));
    return rows[0].v;
  };
  const store = new PgWatchStore(rpc);
  await storeInvariants(store, 'postgres');
  await pool.query(`insert into bobby_push_devices (identity_id, token_ciphertext, environment, topic, permission, status) values ($1,'t-ok','production','x','authorized','active'), ($1,'t-denied','production','x','denied','active'), ($1,'t-revoked','production','x','authorized','revoked'), ($2,'t-ben','sandbox','x','provisional','active')`, [ANA, BEN]);
  eq(await store.devices(ANA), [{ tokenCiphertext: 't-ok', environment: 'production', topic: 'x' }], 'postgres: only an active device with the system\'s permission, of that account, may be notified');
  const open = (await pool.query(`select count(*)::int as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname like 'agent\\_watch\\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`)).rows[0].n;
  const tables = (await pool.query(`select has_table_privilege('anon', 'agent_watches', 'select') or has_table_privilege('authenticated', 'agent_watches', 'select') as open, has_table_privilege('service_role', 'agent_watches', 'select') as service, (select relrowsecurity from pg_class where relname = 'agent_watches') as rls`)).rows[0];
  eq([open, tables.open, tables.service, tables.rls], [0, false, true, true], 'postgres: no function and no row is open to anon or authenticated; the service role can; RLS is on');
  await pool.query('delete from bobby_identities where id = $1', [BEN]);
  eq((await store.list(BEN)).length, 0, 'postgres: an account that is deleted takes its watches with it');
  await pool.end();
  console.log('  (store invariants also checked on Postgres)');
}

console.log(`agent watches: ${checks} checks passed`);
