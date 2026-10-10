// The agent engine's store on a real Postgres: docs/agent-engine/agent-engine.sql applied to a LOCAL scratch
// database, PgAgentStore in front of it, and the same invariants as the memory store with real concurrent
// transactions. Then one whole errand through the loop on that store, with a scripted model and synthetic series.
//   DATABASE_URL=postgres://postgres@127.0.0.1:54329/agent_engine_test npm run test:agent-engine-pg
// Local scratch databases only: it drops and recreates the engine's own four tables.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

process.env.BOBBY_SUPABASE_URL = 'https://test.invalid'; process.env.BOBBY_SUPABASE_ANON_KEY = 'test'; process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.RATE_LIMIT_SALT = 'test-salt-test-salt-test-salt';
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set (a local scratch PostgreSQL)'); process.exit(2); }
if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL must point to a local scratch PostgreSQL');

const { PgAgentStore } = await import('../api/_lib/agent/store-pg.ts');
const { waitingApproval } = await import('../api/_lib/agent/store.ts');
const { taskState, taskResult, taskUsage } = await import('../api/_lib/agent/state.ts');
const { createTask, runTask, scopeDigest } = await import('../api/_lib/agent/loop.ts');
type ModelAttempt = import('../api/_lib/agent/provider.ts').ModelAttempt;
type ModelRequest = import('../api/_lib/agent/provider.ts').ModelRequest;
type Block = import('../api/_lib/agent/provider.ts').Block;
type Deps = import('../api/_lib/agent/loop.ts').Deps;

let checks = 0;
const eq = <T>(actual: T, expected: T, what: string) => { assert.deepEqual(actual, expected, what); checks++; };
const ok = (value: unknown, what: string) => { assert.ok(value, what); checks++; };

const pool = new pg.Pool({ connectionString: url, max: 12 });
await pool.query('drop table if exists agent_steps, agent_reads, agent_attempts, agent_tasks cascade');
const sql = readFileSync(new URL('../docs/agent-engine/agent-engine.sql', import.meta.url), 'utf8');
await pool.query(sql);
await pool.query(sql);   // applying it twice changes nothing
/** Calls a function the way PostgREST does: named arguments, objects as JSON, the function's value returned. */
const rpc = async (name: string, args: Record<string, unknown>) => {
  const keys = Object.keys(args);
  const { rows } = await pool.query(`select ${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(', ')}) as v`, keys.map((key) => { const value = args[key]; return value !== null && typeof value === 'object' ? JSON.stringify(value) : value; }));
  return rows[0].v;
};
const count = async (table: string, where = 'true') => Number((await pool.query(`select count(*) as n from ${table} where ${where}`)).rows[0].n);

const DAY = 86_400_000, T0 = Date.parse('2026-10-09T12:00:00Z');
const newTask = (owner: string, key: string, over: Record<string, unknown> = {}) => ({ id: `task_${owner}_${key}`, owner, address: null as string | null, session: 's1', requestId: key, idemKey: key, bodyDigest: 'd:q', language: 'es' as const, locale: null, question: 'q', parent: null, model: 'claude-test', promptVersion: 'p', toolsetVersion: 't', createdAt: new Date(T0).toISOString(), ...over });
const scope = { action: 'read_assets' as const, assets: ['BTC', 'ETH'], windowDays: 30, depth: 'standard' as const, consumption: { reads: 1 } };

try {
  const store = new PgAgentStore(rpc, 2, 2);
  // 1. One errand per owner and request, whoever arrives first.
  const first = await store.begin(newTask('ana', 'k1'), { question: 'q' }, T0);
  eq([first.state, (await store.begin(newTask('ana', 'k1'), {}, T0)).state, (await store.begin(newTask('ana', 'k1', { bodyDigest: 'other' }), {}, T0)).state, (await store.begin(newTask('ben', 'k1'), {}, T0)).state], ['new', 'replay', 'mismatch', 'new'], 'the same key and body is the same task; another body is refused; another owner\'s key is theirs');
  eq((await Promise.all(Array.from({ length: 20 }, () => store.begin(newTask('cy', 'k9'), {}, T0)))).map((r) => r.state).sort().join(), ['new', ...Array(19).fill('replay')].join(), 'twenty copies of one request in twenty transactions start one task');
  const got = (await store.get('ana', 'task_ana_k1'))!;
  eq([got.id, got.owner, got.requestId, got.steps.map((s) => [s.n, s.kind, s.data]), got.lease, got.fence, got.createdAt, await store.get('ben', 'task_ana_k1')], ['task_ana_k1', 'ana', 'k1', [[1, 'received', { question: 'q' }]], null, 0, new Date(T0).toISOString(), null], 'a task comes back as the engine knows it, and another owner gets nothing');
  // 2. One runner at a time; a stale runner writes nothing.
  const one = await store.claim('task_ana_k1', 'w1', 1000, T0);
  eq([one?.fence, one?.task.lease?.worker, await store.claim('task_ana_k1', 'w2', 1000, T0 + 10)], [1, 'w1', null], 'one runner at a time');
  const late = await store.claim('task_ana_k1', 'w2', 1000, T0 + 2000);
  eq([late?.fence, await store.append('task_ana_k1', 1, 'tool_call', {}, T0 + 2001), (await store.append('task_ana_k1', 2, 'tool_call', { tool: 'x' }, T0 + 2002))?.n], [2, null, 2], 'a runner that lost its lease writes nothing; steps are numbered without gaps');
  const racers = await Promise.all(Array.from({ length: 8 }, async (_, n) => { await store.begin(newTask('race', 'r'), {}, T0); return store.claim('task_race_r', `w${n}`, 5000, T0); }));
  eq(racers.filter(Boolean).length, 1, 'eight claims of one task at once: one');
  // 3. The yes: bound to owner, task and digest; one fact with the read.
  const dig = scopeDigest('ana', 'task_ana_k1', scope);
  eq((await store.approve('ana', 'task_ana_k1', dig, T0)).state, 'not_waiting', 'nothing to approve before it is asked for');
  await store.append('task_ana_k1', 2, 'approval_requested', { scope: { ...scope, digest: dig }, call: { useId: 'u1', tool: 'read_assets', args: {} } }, T0 + 2003);
  await store.release('task_ana_k1', 2);
  eq([(await store.approve('ben', 'task_ana_k1', dig, T0)).state, (await store.approve('ana', 'task_ana_k1', 'f'.repeat(64), T0)).state, await count('agent_reads'), await store.claim('task_ana_k1', 'w3', 1000, T0 + 9000), await store.remaining('ana', T0)], ['not_found', 'mismatch', 0, null, 2], 'another owner or another scope approves nothing; a waiting task is not run');
  const yes = await store.approve('ana', 'task_ana_k1', dig, T0);
  eq([yes.state, 'remaining' in yes ? yes.remaining : null, (await store.approve('ana', 'task_ana_k1', dig, T0)).state, await count('agent_reads'), waitingApproval((await store.get('ana', 'task_ana_k1'))!)], ['granted', 1, 'already', 1, null], 'the yes and the read are one fact: said twice, one read');
  // Ten yeses at once for ten tasks of one person with two reads a day: one more fits.
  const waiting = async (s: InstanceType<typeof PgAgentStore>, owner: string, key: string, address: string | null = null, now = T0) => { const b = await s.begin(newTask(owner, key, { address }), {}, now); if (!('task' in b)) return b.state; const c = await s.claim(b.task.id, 'w', 1000, now); const d = scopeDigest(owner, b.task.id, scope); await s.append(b.task.id, c!.fence, 'approval_requested', { scope: { ...scope, digest: d }, call: { useId: 'u', tool: 'read_assets', args: {} } }, now); await s.release(b.task.id, c!.fence); return d; };
  const digests = await Promise.all(Array.from({ length: 10 }, (_, n) => waiting(store, 'ana', `m${n}`)));
  const said = await Promise.all(digests.map((d, n) => store.approve('ana', `task_ana_m${n}`, d, T0)));
  eq([said.filter((r) => r.state === 'granted').length, said.filter((r) => r.state === 'limit').length, await store.remaining('ana', T0)], [1, 9, 0], 'ten yeses at once against one read left: one');
  eq([(await store.approve('ana', 'task_ana_m9', digests[9], T0 + DAY)).state === 'granted' || (await store.get('ana', 'task_ana_m9'))!.steps.some((s) => s.kind === 'approval_granted'), await store.remaining('ana', T0 + DAY) !== 0], [true, true], 'the allowance is a UTC day\'s');
  // 4. Cancel: wins, completes, and gives back a read that bought nothing.
  const still = digests.findIndex((_, n) => said[n].state === 'limit' && n !== 9);
  eq([await store.cancel('ben', `task_ana_m${still}`, T0), await store.cancel('ana', `task_ana_m${still}`, T0), taskState((await store.get('ana', `task_ana_m${still}`))!, T0), await store.claim(`task_ana_m${still}`, 'w', 1000, T0 + 9)], [false, true, 'cancelled', null], 'only the owner cancels; an idle task is cancelled at once and never runs again');
  const grantedOne = `task_ana_m${said.findIndex((r) => r.state === 'granted')}`;
  const before = await count('agent_reads');
  eq([await store.cancel('ana', grantedOne, T0), (await count('agent_reads')) - before, (await store.get('ana', grantedOne))!.steps.at(-1)!.data, taskUsage((await store.get('ana', grantedOne))!).reads], [true, -1, { by: 'store', readGivenBack: true }, 0], 'cancelled after the yes and before anything ran: the read goes back in the same transaction');
  await store.begin(newTask('ana', 'x3'), {}, T0);
  const live = await store.claim('task_ana_x3', 'w', 60_000, T0);
  eq([await store.cancel('ana', 'task_ana_x3', T0 + 1), taskState((await store.get('ana', 'task_ana_x3'))!, T0 + 1), await store.append('task_ana_x3', live!.fence, 'answer', { result: {} }, T0 + 2), taskState((await store.get('ana', 'task_ana_x3'))!, T0 + 3), taskResult((await store.get('ana', 'task_ana_x3'))!)], [true, 'cancel_requested', null, 'cancelled', null], 'a result that crosses an accepted cancel is not stored: the cancel wins, in the database');
  await store.begin(newTask('ana', 'x4'), {}, T0); await store.claim('task_ana_x4', 'w', 1000, T0); await store.cancel('ana', 'task_ana_x4', T0 + 1);
  eq([taskState((await store.get('ana', 'task_ana_x4'))!, T0 + 2), await store.claim('task_ana_x4', 'w2', 1000, T0 + 5000), taskState((await store.get('ana', 'task_ana_x4'))!, T0 + 5001)], ['cancel_requested', null, 'cancelled'], 'a cancel a runner never completed is completed by the next claim');
  await store.begin(newTask('ana', 'x5'), {}, T0); const held = await store.claim('task_ana_x5', 'w', 60_000, T0); await store.cancel('ana', 'task_ana_x5', T0 + 1); await store.release('task_ana_x5', held!.fence);
  eq(taskState((await store.get('ana', 'task_ana_x5'))!, T0 + 2), 'cancelled', '…or by that runner\'s release');
  const dDeny = await waiting(store, 'dan', 'n1');
  eq([await store.deny('ben', 'task_dan_n1', T0), await store.deny('dan', 'task_dan_n1', T0), taskState((await store.get('dan', 'task_dan_n1'))!, T0), (await store.approve('dan', 'task_dan_n1', dDeny, T0)).state], [false, true, 'cancelled', 'not_waiting'], 'a no ends the errand; a yes after it approves nothing');
  // 5. An owner is a header: the address bounds a caller who invents owners.
  eq([await waiting(store, 'o1', 'k', 'addr') !== 'crowded', await waiting(store, 'o2', 'k', 'addr') !== 'crowded', await waiting(store, 'o3', 'k', 'addr'), await waiting(store, 'o3', 'k', 'other') !== 'crowded', await waiting(store, 'o4', 'k', 'addr', T0 + DAY) !== 'crowded'], [true, true, 'crowded', true, true], 'an address starts so many errands a day, whatever owners it names');
  const wide = new PgAgentStore(rpc, 1, 100), yeses: string[] = [];
  for (let n = 1; n <= 5; n++) { const d = await waiting(wide, `p${n}`, 'k', 'addr2'); yeses.push((await wide.approve(`p${n}`, `task_p${n}_k`, d, T0)).state); }
  eq(yeses, ['granted', 'granted', 'granted', 'granted', 'limit'], '…and four times one person\'s reads, never more');
  // 6. Provider money.
  const budget = { partition: 'p', capUsd: 1, taskCapUsd: 0.5 };
  const a1 = await store.reserve(budget, 't1', 'm', 0.3, T0) as { ok: true; attemptId: string };
  eq([await store.reserve(budget, 't1', 'm', 0.3, T0), await store.reserve({ ...budget, capUsd: 0 }, 't2', 'm', 0.1, T0), await store.reserve({ ...budget, capUsd: NaN }, 't2', 'm', 0.1, T0), await store.reserve(budget, 't2', 'm', NaN, T0)], [{ ok: false, code: 'task_cap' }, { ok: false, code: 'not_configured' }, { ok: false, code: 'not_configured' }, { ok: false, code: 'not_configured' }], 'a task cannot reserve past its cap; a budget that is not set, or a number that is not one, reserves nothing');
  await store.dispatch(a1.attemptId);
  await assert.rejects(store.dispatch(a1.attemptId)); checks++;
  eq(await store.reserve(budget, 't1', 'm', 0.1, T0), { ok: false, code: 'work_unresolved' }, 'while an attempt is out, the same task does not send another');
  await store.settle(a1.attemptId, 'unknown', null);
  eq([await store.committed('p'), await store.reserve(budget, 't1', 'm', 0.1, T0)], [0.3, { ok: false, code: 'work_unresolved' }], 'an attempt of unknown cost keeps its whole reservation and blocks a blind second attempt');
  const a2 = await store.reserve(budget, 't2', 'm', 0.4, T0) as { ok: true; attemptId: string };
  await store.dispatch(a2.attemptId); await store.settle(a2.attemptId, 'settled', 0.05); await store.settle(a2.attemptId, 'no_charge', null);
  eq(await store.committed('p'), 0.35, 'a settled attempt holds what it cost, and is settled once');
  const a3 = await store.reserve(budget, 't3', 'm', 0.5, T0) as { ok: true; attemptId: string };
  await store.dispatch(a3.attemptId); await store.settle(a3.attemptId, 'no_charge', null);
  eq([await store.committed('p'), (await store.reserve(budget, 't4', 'm', 0.5, T0)).ok, await store.reserve(budget, 't5', 'm', 0.2, T0)], [0.35, true, { ok: false, code: 'budget_exhausted' }], 'what is left can be reserved, and never more than the cap');
  eq((await Promise.all(Array.from({ length: 30 }, (_, n) => store.reserve({ partition: 'r', capUsd: 1, taskCapUsd: 1 }, `t${n}`, 'm', 0.1, T0)))).filter((r) => r.ok).length, 10, 'thirty reservations in thirty transactions against a cap of ten: ten');
  eq(await store.committed('nobody'), 0, 'a partition nobody used holds nothing');

  // 7. One whole errand through the loop, on this store.
  const closes = (start: number, n: number, swing: number) => Array.from({ length: n }, (_, i) => Number((start * (1 + 0.002 * i) * (1 + swing * Math.sin(i * 0.9))).toFixed(4)));
  const okx = (series: number[]) => { const end = Date.parse('2026-10-08T00:00:00Z'); return { code: '0', data: series.map((close, i) => { const ts = end - (series.length - 1 - i) * DAY, open = i ? series[i - 1] : close; return [String(ts), String(open), String(Math.max(open, close) * 1.01), String(Math.min(open, close) * 0.99), String(close), '10', '1000', '1000', '1']; }).reverse() }; };
  const series: Record<string, number[]> = { BTC: closes(60000, 70, 0.03), ETH: closes(2500, 70, 0.05) };
  let script: Array<(request: ModelRequest) => ModelAttempt | Promise<ModelAttempt>> = [];
  const calls: ModelRequest[] = [];
  const turn = (blocks: Block[]): ModelAttempt => ({ ok: true, turn: { blocks, stop: 'tool_use', modelReturned: 'claude-test' }, usd: 0.004, usage: { tokensIn: 900, tokensOut: 120, latencyMs: 5 } });
  const big = new PgAgentStore(rpc, 6, 120);
  const deps: Deps = {
    store: big, now: () => T0, worker: 'pg-test', budget: { partition: 'errand', capUsd: 1 }, limits: { maxRounds: 6, maxTokens: 800, runMs: 45_000, taskUsd: 0.25 },
    tools: { retryMs: 1, now: () => new Date(T0), fetchJson: async (u: string) => { const symbol = /instId=([A-Z]+)-USDT/.exec(decodeURIComponent(u))?.[1] ?? ''; return series[symbol] ? okx(series[symbol]) : null; } },
    call: async (request) => { calls.push(request); return script.shift()!(request); }, read: async () => 'pass',
  };
  script = [() => turn([{ type: 'tool_use', id: 'u_cmp', name: 'read_assets', input: { assets: ['Bitcoin', 'Ethereum'], windowDays: 30 } }])];
  const begun = await createTask(deps, { owner: 'lia', address: 'addr-lia', session: 'sess', requestId: 'e1', question: 'Compara Bitcoin y Ethereum', language: 'es', model: 'claude-test' }) as { task: import('../api/_lib/agent/types.ts').Task };
  await runTask(deps, 'lia', begun.task.id);
  const asked = waitingApproval((await big.get('lia', begun.task.id))!)!;
  eq([taskState((await big.get('lia', begun.task.id))!, T0), asked.assets, asked.consumption, await count('agent_reads', "owner = 'lia'")], ['waiting_approval', ['BTC', 'ETH'], { reads: 1 }, 0], 'on Postgres: the errand waits for the person, with nothing spent');
  eq((await big.approve('lia', begun.task.id, asked.digest, T0)).state, 'granted', 'the yes');
  script = [() => turn([{ type: 'tool_use', id: 'u_ans', name: 'answer', input: { kind: 'analysis', gist: 'Bitcoin cambió {{f:return_BTC}}.', text: 'Bitcoin cambió {{f:return_BTC}} y Ethereum {{f:return_ETH}} en {{days}} días.', claims: [], limitations: [], next: '' } }])];
  await runTask(deps, 'lia', begun.task.id);
  const done = (await big.get('lia', begun.task.id))!, result = taskResult(done)!;
  eq([taskState(done, T0), result.presentation.kind, result.presentation.figures, result.analysis!.evidence.map((e) => [e.id, e.quality, e.asOf]), done.steps.map((s) => s.kind), taskUsage(done)], ['completed', 'analysis', ['return_BTC', 'return_ETH'], [['ev_BTC', 'valid', '2026-10-08'], ['ev_ETH', 'valid', '2026-10-08']], ['received', 'model_call', 'approval_requested', 'approval_granted', 'tool_call', 'model_call', 'answer'], { modelCalls: 2, toolCalls: 1, usd: 0.008, unknownUsd: 0, reads: 1 }], 'after the yes: evidence, figures written by code, and every step kept as it happened, through the database');
  ok(/\d/.test(result.presentation.text) && !/\{\{/.test(result.presentation.text) && result.presentation.text.includes('30 días'), 'the stored answer is the one a person reads');
  const callsBefore = calls.length;
  const again = await createTask(deps, { owner: 'lia', address: 'addr-lia', session: 'sess', requestId: 'e1', question: 'Compara Bitcoin y Ethereum', language: 'es', model: 'claude-test' });
  await runTask(deps, 'lia', begun.task.id);
  eq([again.state, calls.length - callsBefore, (await big.latestCompleted('lia', 'sess'))?.id, await big.latestCompleted('eva', 'sess'), await big.get('eva', begun.task.id), await count('agent_reads', "owner = 'lia'"), await count('agent_attempts', "partition = 'errand' and state = 'settled'")], ['replay', 0, begun.task.id, null, null, 1, 2], 'coming back returns the stored result with no call and no read; another owner sees nothing; two attempts, both settled');
  script = [(request) => { assert.ok(JSON.parse(request.messages[0].content as string).previous.figures.length > 5); return turn([{ type: 'tool_use', id: 'u_f', name: 'answer', input: { kind: 'analysis', gist: 'Ethereum se movió más.', text: 'Ethereum se movió más: {{f:volatility_ETH}} frente a {{f:volatility_BTC}}.', claims: [{ metric: 'volatility', top: 'Ethereum' }], limitations: [], next: '' } }]); }];
  const follow = await createTask(deps, { owner: 'lia', session: 'sess', requestId: 'e2', question: '¿Y cuál se movió más?', language: 'es', followsLatest: true, model: 'claude-test' }) as { task: import('../api/_lib/agent/types.ts').Task };
  await runTask(deps, 'lia', follow.task.id);
  const followed = (await big.get('lia', follow.task.id))!;
  eq([followed.parent, taskState(followed, T0), taskResult(followed)!.presentation.figures, taskUsage(followed).reads, await count('agent_reads', "owner = 'lia'")], [begun.task.id, 'completed', ['volatility_ETH', 'volatility_BTC'], 0, 1], 'a follow-up reads the result on the table from the database: no tool, no second read');
  console.log(`agent-engine-pg: ${checks} checks passed`);
} finally {
  await pool.end();
}
