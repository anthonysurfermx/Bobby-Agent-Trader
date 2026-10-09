// The companion's own two guards on spend, beside the slots (api/_lib/companion-slots.ts):
//   · what it has spent today, read from its own ledger surface, so that a free feature is stopped by its own
//     amount and never by using up the desk's;
//   · a first line that costs nothing: one address asking faster than a person can, on this instance.
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { createLimiter } from './rate-limit.js';

/** The ledger surface of this role: its spend is its own line, and the desk's caps and reports do not count it. */
export const COMPANION_SURFACE = 'companion';

let hurry = createLimiter(20, 60_000);
/** True when this address has asked more than twenty times in a minute on this instance. */
export const tooFast = (caller: string) => hurry.check(caller).limited;

let spentToday: { at: number; day: string; usd: number } | null = null;
/** What the companion has spent today (UTC), or null when the ledger cannot say. Cached for a minute. */
export async function companionSpend(now = Date.now()): Promise<number | null> {
  const day = new Date(now).toISOString().slice(0, 10);
  if (spentToday && spentToday.day === day && now - spentToday.at < 60_000) return spentToday.usd;
  try {
    // Every row of the day, a thousand at a time (a turn writes a row for the model that speaks and one for the
    // one that reads it, and a retry writes another). A day longer than this reads is not "cheap": it is unknown.
    let usd = 0;
    for (let page = 0; ; page++) {
      if (page === 20) return null;
      const r = await fetch(bobbyRest(`bobby_llm_usage?surface=eq.${COMPANION_SURFACE}&created_at=gte.${day}T00:00:00Z&select=usd&order=id.asc&limit=1000&offset=${page * 1000}`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(2500) });
      if (!r.ok) return null;
      const rows = await r.json() as Array<{ usd?: unknown }>;
      if (!Array.isArray(rows)) return null;
      for (const row of rows) { const n = Number(row.usd); if (!Number.isFinite(n) || n < 0) return null; usd += n; }
      if (rows.length < 1000) break;
    }
    spentToday = { at: now, day, usd };
    return usd;
  } catch {
    return null;
  }
}
/** After a turn wrote its cost, and for tests: the next read is fresh. */
export const forgetCompanionSpend = () => { spentToday = null; };
/** For tests: both guards as on a new instance. */
export const resetCompanionGuards = () => { hurry = createLimiter(20, 60_000); spentToday = null; };
