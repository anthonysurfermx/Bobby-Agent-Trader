// ============================================================
// /api/briefing-worker — the Bobby Pro market briefings worker (spec §5; the tick lives in
// api/_lib/briefings/worker.ts).
//   GET  — Vercel cron (*/5). Authorization: Bearer <CRON_SECRET>, compared in constant time against that one
//          secret only (never INTERNAL_API_SECRET / BOBBY_CYCLE_SECRET: a leaked cycle secret must not trigger
//          paid briefing work). CRON_SECRET unset ⇒ 503; wrong or missing ⇒ 401; any query parameter ⇒ 400.
//   POST — manual ops run. Header x-bobby-ops = BOBBY_OPS_SECRET (constant time; unset ⇒ 503). Optional JSON body
//          {at: ISO-8601 with offset} shifts the period clock — accepted only when VERCEL_ENV !== 'production'
//          (staging rehearses 07:30 / 08:00); in production a body with `at` is a 400. No query parameters.
// After auth: kill switch off (BOBBY_BRIEFINGS_ENABLED ≠ 'on') ⇒ 200 {enabled:false, claimed:0} before any database
// call. Otherwise one tick within WORKER_BUDGET_MS and its TickReport (counts and codes only).
// `at` moves only the calendar (which periods are due, ready-by checks): leases, push windows and expiry are
// decided by the database clock, so a shifted run prepares reports but cannot send a push outside its real window.
// Responses are Cache-Control: no-store. Logs carry '[briefing-worker]' with counts and codes only.
// ============================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BriefingStorageError } from './_lib/briefings/db.js';
import { WORKER_BUDGET_MS, briefingsEnabled, cronSecret, isProductionDeployment, opsSecret } from './_lib/briefings/config.js';
import { runTick, type TickReport } from './_lib/briefings/worker.js';

export const config = { maxDuration: 60 };

/** sha256 both sides first: equal-length buffers for timingSafeEqual, no length leak. */
function secretsMatch(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

const header = (req: VercelRequest, name: string): string | null => {
  const v = req.headers[name];
  return typeof v === 'string' ? v : null;
};

const OpsBody = z.object({ at: z.string().max(40).datetime({ offset: true }).optional() }).strict();
const MAX_OPS_BODY = 512;

/** The ops body: absent/empty, a parsed object or a JSON string. Null when malformed. */
function opsBody(req: VercelRequest): { at?: string } | null {
  let raw: unknown = req.body;
  if (raw === undefined || raw === null || raw === '') return {};
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    if (raw.length > MAX_OPS_BODY) return null;
    if (!raw.trim()) return {};
    try { raw = JSON.parse(raw); } catch { return null; }
  }
  const parsed = OpsBody.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

type Runner = (opts: { now: Date; worker: string; deadlineAt: number }) => Promise<TickReport>;

/** Factory so tests can inject the tick; the default export runs the real one. */
export function createWorkerHandler(run: Runner = (opts) => runTick(opts)) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Cache-Control', 'no-store');
    const started = Date.now();
    const hasQuery = Object.keys(req.query ?? {}).length > 0;
    let at: Date | null = null;

    if (req.method === 'GET') {
      const expected = cronSecret();
      if (!expected) return res.status(503).json({ error: 'The briefing worker is not configured', code: 'feature_disabled' });
      const auth = header(req, 'authorization') ?? '';
      const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!provided || !secretsMatch(provided, expected)) return res.status(401).json({ error: 'Unauthorized' });
      if (hasQuery) return res.status(400).json({ error: 'No query parameters are accepted', code: 'invalid_request' });
    } else if (req.method === 'POST') {
      const expected = opsSecret();
      if (!expected) return res.status(503).json({ error: 'Manual runs are disabled', code: 'feature_disabled' });
      const provided = header(req, 'x-bobby-ops') ?? '';
      if (!provided || !secretsMatch(provided, expected)) return res.status(401).json({ error: 'Unauthorized' });
      if (hasQuery) return res.status(400).json({ error: 'No query parameters are accepted', code: 'invalid_request' });
      const body = opsBody(req);
      if (!body) return res.status(400).json({ error: 'Body must be {} or {"at": ISO-8601}', code: 'invalid_request' });
      if (body.at !== undefined) {
        if (isProductionDeployment()) return res.status(400).json({ error: 'A time override is not accepted in production', code: 'invalid_request' });
        at = new Date(body.at);
      }
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed', code: 'method_not_allowed' });
    }

    if (!briefingsEnabled()) return res.status(200).json({ enabled: false, claimed: 0 });

    try {
      const report = await run({ now: at ?? new Date(started), worker: `briefing-worker:${randomUUID().slice(0, 8)}`, deadlineAt: started + WORKER_BUDGET_MS });
      console.log('[briefing-worker]', req.method === 'GET' ? 'cron' : 'ops', JSON.stringify(report));
      return res.status(200).json(report);
    } catch (e) {
      const storage = e instanceof BriefingStorageError;
      console.error('[briefing-worker]', storage ? 'storage_unavailable' : 'tick_failed');
      return storage
        ? res.status(503).json({ error: 'Storage is unavailable', code: 'storage_unavailable' })
        : res.status(500).json({ error: 'The briefing tick failed' });
    }
  };
}

export default createWorkerHandler();
