// ============================================================
// /api/agent-task — the agent engine's door (api/_lib/agent). Off unless BOBBY_AGENT_ENGINE=on: until then every
// method answers 404 and nothing is read, stored or called. Additive: no existing endpoint or decoder changes.
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
// errands started in a day, and reads (four times one person's). The companion's other guards (a per-minute
// line, a network-wide count, a shared day of turns) are NOT here yet. A body field can never name an owner, a model, a plan or a limit.
// Another owner asking for a task gets 404, the same as for a task that does not exist.
//
// What is NOT here yet, on purpose (docs/agent-engine/README.md):
//   · durable storage in production. The store is chosen by BOBBY_AGENT_STORE: "memory" (one instance, lost
//     with it: for a preview only) or a file path (local development). With neither, the door answers 503
//     `engine_storage_unavailable`: an errand is never accepted that could be silently lost.
//   · the product's own allowance (api/_lib/access.ts) and its money caps. The engine keeps its own count of
//     reads and its own dollar ceiling (BOBBY_AGENT_DAILY_USD) until those are wired, with their migration.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { APP_LANGUAGES, APP_LOCALES } from '../src/lib/app-language.js';
import { deviceHash } from './_lib/access.js';
import { requestOriginHost } from './_lib/origins.js';
import { getClientQuotaKeys } from './_lib/rate-limit.js';
import { createTask, engineDeps, runTask, taskView } from './_lib/agent/loop.js';
import { FileAgentStore, MemoryAgentStore, type AgentStore } from './_lib/agent/store.js';
import { ENGINE_VERSION } from './_lib/agent/types.js';

export const config = { maxDuration: 60 };
export const agentEngineOn = (env: NodeJS.ProcessEnv = process.env) => env.BOBBY_AGENT_ENGINE === 'on';

let memory: MemoryAgentStore | null = null;
let testDeps: Partial<Parameters<typeof engineDeps>[1]> | null = null;
/** Tests only: the provider, the sources and the clock the door's engine uses; null restores the real ones and a fresh memory store. */
export function __setAgentTestDeps(over: typeof testDeps): void { testDeps = over; memory = null; }
/** The store this instance uses, or null when none is configured. Replaceable in tests. */
export function agentStore(env: NodeJS.ProcessEnv = process.env): AgentStore | null {
  const where = env.BOBBY_AGENT_STORE?.trim();
  if (where === 'memory') return (memory ??= new MemoryAgentStore(6));
  return where && where.startsWith('/') ? new FileAgentStore(where, 6) : null;
}

const Ask = z.object({ op: z.literal('ask'), version: z.literal(ENGINE_VERSION), requestId: z.string().uuid(), sessionId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/), question: z.string().trim().min(1).max(1200), language: z.enum(APP_LANGUAGES).default('en'), locale: z.enum(APP_LOCALES).optional().catch(undefined), follow: z.boolean().optional().catch(undefined) });
const Act = z.object({ op: z.enum(['approve', 'deny', 'cancel']), taskId: z.string().regex(/^task_[a-f0-9]{32}$/), digest: z.string().regex(/^[a-f0-9]{64}$/).optional() });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  // Storage that cannot answer is never guessed around: whatever it was doing, the door says so and the errand stays as the store last recorded it.
  try { return await door(req, res); } catch { console.error(JSON.stringify({ route: 'agent-task', event: 'storage_failed' })); return res.status(503).json({ version: ENGINE_VERSION, error: { code: 'engine_storage_unavailable' } }); }
}

async function door(req: VercelRequest, res: VercelResponse) {
  if (!agentEngineOn()) return res.status(404).json({ error: 'Not found' });
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed', engine: { version: ENGINE_VERSION } });
  if (!requestOriginHost(req.headers)) return res.status(403).json({ error: 'Origin not allowed' });
  const refuse = (status: number, code: string) => res.status(status).json({ version: ENGINE_VERSION, error: { code } });
  let owner: string | null = null, address: string | null = null;
  try { address = getClientQuotaKeys(req)?.caller ?? null; owner = deviceHash(req) ?? address; } catch { owner = null; }
  // The install id is a header a caller chooses: without the address nothing bounds a caller who invents installs.
  if (!owner || !address) return refuse(503, 'engine_unavailable');
  const store = agentStore();
  if (!store) return refuse(503, 'engine_storage_unavailable');
  const deps = engineDeps(store, testDeps ?? {});
  const view = async (id: string, status = 200) => {
    const task = await store.get(owner!, id);
    return task ? res.status(status).json(taskView(task, deps.now(), await store.remaining(owner!, deps.now()))) : refuse(404, 'not_found');
  };

  if (req.method === 'GET') {
    const id = typeof req.query.id === 'string' && /^task_[a-f0-9]{32}$/.test(req.query.id) ? req.query.id : null;
    return id ? view(id) : refuse(400, 'invalid_request');
  }
  let body: unknown = null;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return refuse(400, 'invalid_request'); }
  const ask = Ask.safeParse(body);
  if (ask.success) {
    if (!process.env.ANTHROPIC_API_KEY && !testDeps?.call) return refuse(503, 'engine_unavailable');
    const begun = await createTask(deps, { owner, address, session: ask.data.sessionId, requestId: ask.data.requestId, question: ask.data.question, language: ask.data.language, locale: ask.data.locale ?? null, followsLatest: ask.data.follow === true });
    if (begun.state === 'crowded') return refuse(429, 'too_many_errands');
    if (!('task' in begun)) return refuse(409, 'request_id_reused');
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
    if (said.state === 'limit') return refuse(429, 'reads_limit');
    if (said.state === 'mismatch' || said.state === 'not_waiting') return refuse(409, said.state === 'mismatch' ? 'approval_mismatch' : 'not_waiting');
    await runTask(deps, owner, act.data.taskId);
    return view(act.data.taskId);
  }
  const done = act.data.op === 'deny' ? await store.deny(owner, act.data.taskId, deps.now()) : await store.cancel(owner, act.data.taskId, deps.now());
  return done ? view(act.data.taskId) : refuse(409, 'not_possible');
}
