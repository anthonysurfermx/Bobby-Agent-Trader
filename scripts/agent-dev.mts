// The agent engine from a terminal, for development: a task store in one file, the real model, the real sources.
// It is how "start an errand, close everything, come back" is tried without an app.
//   vercel env run -e production -- npx tsx scripts/agent-dev.mts <store.json> ask <owner> <session> "<question>" [--follow] [--lang=es]
//   …                                                             approve <owner> <taskId>      (says yes to what the task shows)
//   …                                                             get|cancel|deny <owner> <taskId>
//   …                                                             ledger                        (what the store holds of the money cap)
// Prints one JSON object: the client's view of the task, plus what the engine recorded of its own work.
// The owner is typed here because there is no server in front; in the product it is derived, never sent.
import { randomUUID } from 'node:crypto';

process.env.BOBBY_SUPABASE_URL ||= 'https://dev.invalid'; process.env.BOBBY_SUPABASE_ANON_KEY ||= 'dev'; process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY ||= 'dev';
process.env.RATE_LIMIT_SALT ||= 'dev-salt-dev-salt-dev-salt';
const { FileAgentStore, waitingApproval } = await import('../api/_lib/agent/store.ts');
const { createTask, runTask, engineDeps, taskView } = await import('../api/_lib/agent/loop.ts');
const { taskUsage } = await import('../api/_lib/agent/state.ts');

const [path, op, owner, ...rest] = process.argv.slice(2);
if (!path || !op) { console.error('usage: agent-dev.mts <store.json> ask|approve|get|cancel|deny|ledger …'); process.exit(2); }
const store = new FileAgentStore(path, 6);
// The sprint's own ceiling for provider money, whatever the product's is: BOBBY_AGENT_SPRINT_USD, one dollar unless set.
const deps = engineDeps(store, { budget: { partition: 'sprint', capUsd: Number(process.env.BOBBY_AGENT_SPRINT_USD) > 0 ? Number(process.env.BOBBY_AGENT_SPRINT_USD) : 1 } });
const show = async (id: string) => {
  const task = await store.get(owner, id);
  if (!task) { console.log(JSON.stringify({ found: false })); return; }
  console.log(JSON.stringify({ ...taskView(task, Date.now(), await store.remaining(owner, Date.now())), recorded: { ...taskUsage(task), steps: task.steps.map((step) => step.kind), committedUsd: Number((await store.committed('sprint')).toFixed(6)) } }, null, 2));
};

if (op === 'ledger') console.log(JSON.stringify({ committedUsd: Number((await store.committed('sprint')).toFixed(6)), attempts: store.attempts().map(({ id, task, model, state, reserveUsd, actualUsd }) => ({ id, task, model, state, reserveUsd, actualUsd })) }, null, 2));
else if (op === 'ask') {
  const [session, question, ...flags] = rest;
  const language = (flags.find((flag) => flag.startsWith('--lang='))?.slice(7) ?? 'es') as 'es';
  const requestId = flags.find((flag) => flag.startsWith('--request='))?.slice(10) ?? randomUUID();
  const begun = await createTask(deps, { owner, session, requestId, question, language, followsLatest: flags.includes('--follow') });
  if (!('task' in begun)) { console.log(JSON.stringify({ refused: begun.state })); process.exit(1); }
  await runTask(deps, owner, begun.task.id);
  await show(begun.task.id);
} else if (op === 'approve') {
  const task = await store.get(owner, rest[0]);
  const scope = task ? waitingApproval(task) : null;
  if (!task || !scope) { console.log(JSON.stringify({ approved: false, reason: task ? 'not_waiting' : 'not_found' })); process.exit(1); }
  const said = await store.approve(owner, task.id, scope.digest, Date.now());
  if (said.state !== 'granted' && said.state !== 'already') { console.log(JSON.stringify({ approved: false, reason: said.state })); process.exit(1); }
  await runTask(deps, owner, task.id);
  await show(task.id);
} else if (op === 'get') await show(rest[0]);
else if (op === 'cancel') { console.log(JSON.stringify({ cancelled: await store.cancel(owner, rest[0], Date.now()) })); await show(rest[0]); }
else if (op === 'deny') { console.log(JSON.stringify({ denied: await store.deny(owner, rest[0], Date.now()) })); await show(rest[0]); }
