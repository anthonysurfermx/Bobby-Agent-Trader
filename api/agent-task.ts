// ============================================================
// /api/agent-task — the agent engine's door (api/_lib/agent). BOBBY_AGENT_ENGINE decides who it exists for:
//   · unset or anything else: nobody. Every method answers 404 and nothing is read, stored or called.
//   · "pilot" (production since 2026-10-13): only the people on BOBBY_AGENT_PILOT, a list of "id:<identity id>"
//     (a signed-in account) and "install:<salted install hash>" entries. Everyone else gets the same 404 as "off".
//   · "on": everyone. NOT before the privacy page says what an errand keeps: it says today that Bobby stores no
//     question, and an errand's question, steps and answer are stored for 24 hours (docs/agent-engine/PRIVACY-DRAFT.md).
// Additive: no existing endpoint or decoder changes.
//
//   POST { op: "ask", version: 1, requestId, sessionId, question, language, locale?, follow? }
//        starts an errand, or returns the one this requestId already started (the same id with other words: 409).
//   POST { op: "approve", taskId, digest }   the person's yes to exactly the scope the task showed.
//   POST { op: "deny" | "cancel", taskId }
//   GET  ?id=<taskId>                        the task as it is now: what a client reads when it comes back.
// Every reply is the task's view (loop.ts, taskView): its state, the real events so far, the approval it waits
// for, the result when there is one, and what the person has left. Coming back never calls a provider.
//
// Whose task it is: the server derives the owner from the request (the install's salted hash, else the caller's
// address). The install id is a header, so the address bounds what one caller can do whatever ids it invents:
// errands started in a day, reads (four times one person's), and a first line that costs nothing: thirty requests
// a minute from one address on this instance. What everyone together can spend in a day is BOBBY_AGENT_DAILY_USD
// (five dollars when unset), checked in the store before every provider call. The companion's network-wide count
// and its shared day of turns are NOT here yet. A body field can never name an owner, a model, a plan or a limit.
// Another owner asking for a task gets 404, the same as for a task that does not exist.
//
// What is NOT here yet, on purpose (docs/agent-engine/README.md):
//   · the product's own allowance (api/_lib/access.ts) and its money caps. The engine keeps its own count of
//     reads (BOBBY_AGENT_READS_PER_DAY, six when unset) and its own dollar ceiling until those are wired: a read
//     here does not use one of the plan's, and a Pro subscriber gets no more than anyone else.
// Storage is chosen by BOBBY_AGENT_STORE: "postgres" in production (the functions of the migration
// 20261013062033_agent_engine.sql through PostgREST with the service role), "memory" (one instance, lost with it:
// for a preview only) or a file path (local development). With none, or with storage that does not answer, the
// door answers 503 `engine_storage_unavailable`: an errand is never accepted that could be silently lost.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { APP_LANGUAGES, APP_LOCALES, type AppLanguage } from '../src/lib/app-language.js';
import { waitUntil } from '@vercel/functions';
import { deviceHash, resolveCaller } from './_lib/access.js';
import { requestOriginHost } from './_lib/origins.js';
import { createLimiter, getClientQuotaKeys } from './_lib/rate-limit.js';
import { createTask, engineDeps, runTask, saidFor, taskView } from './_lib/agent/loop.js';
import { SAID } from './_lib/agent/present.js';
import { FileAgentStore, MemoryAgentStore, isFinal, type AgentStore } from './_lib/agent/store.js';
import { PgAgentStore, postgrestAgentRpc } from './_lib/agent/store-pg.js';
import { taskState } from './_lib/agent/state.js';
import { ENGINE_VERSION } from './_lib/agent/types.js';

export const config = { maxDuration: 60 };
export type AgentEngineMode = 'off' | 'pilot' | 'on';
export const agentEngineMode = (env: NodeJS.ProcessEnv = process.env): AgentEngineMode => (env.BOBBY_AGENT_ENGINE === 'on' ? 'on' : env.BOBBY_AGENT_ENGINE === 'pilot' ? 'pilot' : 'off');
/** Who the pilot is for. An entry of another shape is ignored: a typo never opens the door to anyone. */
export function agentPilot(env: NodeJS.ProcessEnv = process.env): { ids: Set<string>; installs: Set<string> } {
  const ids = new Set<string>(), installs = new Set<string>();
  for (const entry of (env.BOBBY_AGENT_PILOT ?? '').split(/[\s,]+/)) {
    const id = /^id:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(entry)?.[1], install = /^install:([0-9a-f]{24})$/.exec(entry)?.[1];
    if (id) ids.add(id.toLowerCase()); else if (install) installs.add(install);
  }
  return { ids, installs };
}
/** A person on the pilot's list: by the install the server derives, or by the account they are signed in with. Never by anything a body says. */
async function inPilot(req: VercelRequest): Promise<boolean> {
  const { ids, installs } = agentPilot();
  const install = deviceHash(req);
  if (install && installs.has(install)) return true;
  // The account is asked of the sign-in service only when the list names accounts and the request carries a session.
  if (!ids.size || !(req.headers.authorization || req.headers['x-bobby-session'])) return false;
  const who = await resolveCaller(req);
  return Boolean(who && ids.has(who.id.toLowerCase()));
}
/** How long an errand that nobody touches is kept, in hours: the privacy page's number. */
export const AGENT_KEEP_HOURS = 24;
let purgedAt = 0;

let memory: MemoryAgentStore | null = null;
let testDeps: Partial<Parameters<typeof engineDeps>[1]> | null = null;
/** A first line that costs nothing: one address asking faster than a person can, on this instance. */
const PER_MINUTE = 30;
let hurry = createLimiter(PER_MINUTE, 60_000);
/** Tests only: the provider, the sources and the clock the door's engine uses; null restores the real ones and a fresh memory store. */
export function __setAgentTestDeps(over: typeof testDeps): void { testDeps = over; memory = null; hurry = createLimiter(over ? Number.MAX_SAFE_INTEGER : PER_MINUTE, 60_000); }
/** Tests only: the per-minute line as production has it, or another. */
export function __setAgentHurry(perMinute = PER_MINUTE): void { hurry = createLimiter(perMinute, 60_000); }
/** A person's reads of a day, as the engine counts them until the product's allowance is wired: 1 to 20, six when unset or unreadable. */
export function agentReadsPerDay(env: NodeJS.ProcessEnv = process.env): number {
  const set = Number(env.BOBBY_AGENT_READS_PER_DAY?.trim());
  return Number.isInteger(set) && set >= 1 && set <= 20 ? set : 6;
}
/** The store this instance uses, or null when none is configured. Replaceable in tests. */
export function agentStore(env: NodeJS.ProcessEnv = process.env): AgentStore | null {
  const where = env.BOBBY_AGENT_STORE?.trim();
  if (where === 'memory') return (memory ??= new MemoryAgentStore(agentReadsPerDay(env)));
  // The database, through its functions. Until the owner makes the SQL a migration they do not exist: every call
  // then fails and the door answers 503, exactly as with no store at all.
  if (where === 'postgres') return new PgAgentStore(postgrestAgentRpc, agentReadsPerDay(env), 120);
  return where && where.startsWith('/') ? new FileAgentStore(where, agentReadsPerDay(env)) : null;
}

/** The longest errand the door takes, in characters. */
export const MAX_QUESTION = 1200;
const Ask = z.object({ op: z.literal('ask'), version: z.literal(ENGINE_VERSION), requestId: z.string().uuid(), sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/), question: z.string().trim().min(1).max(MAX_QUESTION), language: z.enum(APP_LANGUAGES).default('en'), locale: z.enum(APP_LOCALES).optional().catch(undefined), follow: z.boolean().optional().catch(undefined) });
const Act = z.object({ op: z.enum(['approve', 'deny', 'cancel']), taskId: z.string().regex(/^task_[a-f0-9]{32}$/), digest: z.string().regex(/^[a-f0-9]{64}$/).optional() });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Storage that cannot answer is never guessed around: whatever it was doing, the door says so and the errand stays as the store last recorded it.
  try { return await door(req, res); } catch { console.error(JSON.stringify({ route: 'agent-task', event: 'storage_failed' })); return res.status(503).json({ version: ENGINE_VERSION, error: { code: 'engine_storage_unavailable', message: SAID.not_now[languageOf(req)] } }); }
}

/** The language a request says it is in, for the one sentence a refusal carries; English when it says none. Never trusted for anything else. */
function languageOf(req: VercelRequest): AppLanguage {
  try {
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as { language?: unknown } | null;
    return (APP_LANGUAGES as readonly string[]).includes(String(body?.language)) ? body!.language as AppLanguage : 'en';
  } catch { return 'en'; }
}
/** The refusals a person can meet through no fault of the app: each carries one plain sentence, so nobody is left with a code. */
const SPOKEN_REFUSALS = new Set(['empty_question', 'question_too_long', 'too_many_errands', 'reads_limit', 'engine_unavailable', 'engine_storage_unavailable']);

async function door(req: VercelRequest, res: VercelResponse) {
  const mode = agentEngineMode();
  // Not on the list is the same answer as off: the door does not say that it exists.
  if (mode === 'off' || (mode === 'pilot' && !await inPilot(req))) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed', engine: { version: ENGINE_VERSION } });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });
  let language = languageOf(req);
  const refuse = (status: number, code: string) => res.status(status).json({ version: ENGINE_VERSION, error: { code, ...(SPOKEN_REFUSALS.has(code) ? { message: SAID[saidFor(code)][language] } : {}) } });
  let owner: string | null = null, address: string | null = null;
  try { address = getClientQuotaKeys(req)?.caller ?? null; owner = deviceHash(req) ?? address; } catch { owner = null; }
  // The install id is a header a caller chooses: without the address nothing bounds a caller who invents installs.
  if (!owner || !address) return refuse(503, 'engine_unavailable');
  // Before anything is stored or asked of a provider. A look at an errand (GET) is not counted: coming back is free.
  if (req.method === 'POST' && hurry.check(address).limited) { res.setHeader('Retry-After', '60'); return refuse(429, 'too_many_errands'); }
  const store = agentStore();
  if (!store) return refuse(503, 'engine_storage_unavailable');
  const deps = engineDeps(store, testDeps ?? {});
  const view = async (id: string, status = 200) => {
    let task = await store.get(owner!, id);
    // A cancel that was accepted while a runner held the task, and whose runner never came back, is completed by
    // whoever looks next: a person who cancelled never reads "cancelling" for ever, and a read no tool used goes back.
    // Read again whatever the cancel answered: another look may have completed it in between.
    if (task && !isFinal(task) && task.steps.some((step) => step.kind === 'cancel_requested') && !(task.lease && task.lease.until > deps.now())) { await store.cancel(owner!, id, deps.now()); task = await store.get(owner!, id); }
    return task ? res.status(status).json(taskView(task, deps.now(), await store.remaining(owner!, deps.now()))) : refuse(404, 'not_found');
  };

  if (req.method === 'GET') {
    const id = typeof req.query.id === 'string' && /^task_[a-f0-9]{32}$/.test(req.query.id) ? req.query.id : null;
    return id ? view(id) : refuse(400, 'invalid_request');
  }
  let body: unknown = null;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return refuse(400, 'invalid_request'); }
  // Nothing was said (a microphone that caught silence, a send with no words): that is told, not answered as a malformed request.
  const sent = body as { op?: unknown; question?: unknown } | null;
  if (sent?.op === 'ask' && typeof sent.question === 'string' && !sent.question.trim()) return refuse(400, 'empty_question');
  // …and so is a dictation that ran on past what one errand can hold.
  if (sent?.op === 'ask' && typeof sent.question === 'string' && sent.question.trim().length > MAX_QUESTION) return refuse(400, 'question_too_long');
  const ask = Ask.safeParse(body);
  if (ask.success) {
    if (!process.env.ANTHROPIC_API_KEY && !testDeps?.call) return refuse(503, 'engine_unavailable');
    const begun = await createTask(deps, { owner, address, session: ask.data.sessionId, requestId: ask.data.requestId, question: ask.data.question, language: ask.data.language, locale: ask.data.locale ?? null, followsLatest: ask.data.follow === true });
    if (begun.state === 'crowded') return refuse(429, 'too_many_errands');
    if (!('task' in begun)) return refuse(409, 'request_id_reused');
    // What nobody has touched for a day goes: asked of the store at most once every ten minutes on this instance,
    // after the answer, and a purge that fails changes nothing for this errand.
    if (store.purge && deps.now() - purgedAt > 10 * 60_000) {
      purgedAt = deps.now();
      const swept = store.purge(deps.now(), AGENT_KEEP_HOURS).catch(() => 0);
      try { waitUntil(swept); } catch { /* outside the platform (tests, the lab) the promise runs on its own */ }
    }
    // The same request sent again finds its task: a finished one is returned as it is, one in progress goes on.
    await runTask(deps, owner, begun.task.id);
    return view(begun.task.id);
  }
  const act = Act.safeParse(body);
  if (!act.success) return refuse(400, 'invalid_request');
  if (act.data.op === 'approve') {
    if (!act.data.digest) return refuse(400, 'invalid_request');
    const said = await store.approve(owner, act.data.taskId, act.data.digest, deps.now());
    if (said.state === 'not_found') return refuse(404, 'not_found');
    if (said.state === 'limit') { language = (await store.get(owner, act.data.taskId))?.language ?? language; return refuse(429, 'reads_limit'); }
    if (said.state === 'mismatch' || said.state === 'not_waiting') return refuse(409, said.state === 'mismatch' ? 'approval_mismatch' : 'not_waiting');
    await runTask(deps, owner, act.data.taskId);
    return view(act.data.taskId);
  }
  let done = act.data.op === 'deny' ? await store.deny(owner, act.data.taskId, deps.now()) : await store.cancel(owner, act.data.taskId, deps.now());
  if (!done) {
    const task = await store.get(owner, act.data.taskId);
    // A no that arrives after the yes was recorded (its reply was lost, or the run after it failed) and before the read
    // was used is a cancel: the errand ends and the read goes back with it.
    if (task && act.data.op === 'deny' && !isFinal(task) && task.steps.some((step) => step.kind === 'approval_granted') && !task.steps.some((step) => step.kind === 'tool_call' && step.data.metered === true)) done = await store.cancel(owner, act.data.taskId, deps.now());
    // The same no or the same cancel sent again (its answer was lost on the way) finds the errand as it left it: the
    // yes and the ask are safe to repeat, and so are these.
    else if (task && taskState(task, deps.now()) === 'cancelled') done = true;
  }
  return done ? view(act.data.taskId) : refuse(409, 'not_possible');
}
