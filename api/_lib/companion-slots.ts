// ============================================================
// Turn slots for the companion (api/companion-turn.ts): what keeps "five a day" true under a burst.
//
// The shared counters (rate-limit-persistent.ts) read a count and write count+1: K requests sent at the same
// instant all read the same number and are all let through. A companion turn is a model call, so here a turn
// must first take a SLOT, one row of `api_cache` whose key carries the scope, the UTC day and a slot number.
// The table's primary key decides: of all the requests that insert the same key, the database lets one in. No
// more turns than slots are served however the requests arrive, and it needs no migration.
//
// A slot taken and not used (the address was full, the provider failed) is given back by deleting its row.
// Slots end with the UTC day; their rows expire an hour later and sweepSlots removes them.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

const DAY_MS = 86_400_000;
const TIMEOUT_MS = 2000;

export type Slot =
  /** `used`: the slots of this scope taken today, this one included (0 when the scope keeps no count). */
  | { state: 'taken'; key: string; used: number }
  | { state: 'full' }
  /** Other requests took every slot this one tried: trying again can work. */
  | { state: 'busy' }
  /** Storage could not answer: the caller refuses, it never guesses. */
  | { state: 'unavailable' };

const dayEnd = (now: number) => Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
// Letters, digits and underscores only: the key goes into a PostgREST `in.(…)` list unquoted.
const slotKey = (scope: string, id: string, now: number, n: number) => `cturn_${scope}_${id}_${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}_${n}`;
/** Seconds until today's slots end (00:00 UTC). */
export const slotsResetInS = (now = Date.now()) => Math.max(60, Math.ceil((dayEnd(now) - now) / 1000));

/** True when this request's insert won the key, false when the key was already held, null when storage failed. */
async function insert(key: string, now: number): Promise<boolean | null> {
  try {
    const r = await fetch(bobbyRest('api_cache?on_conflict=cache_key&select=cache_key'), {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: bobbyServiceHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({ cache_key: key, payload: { slot: 1 }, expires_at: new Date(dayEnd(now) + 3_600_000).toISOString(), updated_at: new Date(now).toISOString() }),
    });
    if (!r.ok) return null;
    const rows = await r.json() as unknown;
    return Array.isArray(rows) ? rows.length === 1 : null;
  } catch {
    return null;
  }
}

/**
 * One of the `limit` slots `id` has today in `scope`. The free ones are read first, then tried in order: a
 * request that loses a slot to another tries the next, `tries` times at most.
 */
export async function takeSlot(scope: string, id: string, limit: number, tries = 3, now = Date.now()): Promise<Slot> {
  if (!/^[a-z0-9]{8,64}$/i.test(id) || !Number.isInteger(limit) || limit < 1 || limit > 100) return { state: 'unavailable' };
  const keys = Array.from({ length: limit }, (_, i) => slotKey(scope, id, now, i + 1));
  let held: Set<string>;
  try {
    const r = await fetch(bobbyRest(`api_cache?cache_key=in.(${keys.join(',')})&select=cache_key`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return { state: 'unavailable' };
    const rows = await r.json() as Array<{ cache_key?: unknown }>;
    if (!Array.isArray(rows)) return { state: 'unavailable' };
    held = new Set(rows.map((row) => String(row.cache_key)));
  } catch {
    return { state: 'unavailable' };
  }
  const free = keys.filter((key) => !held.has(key));
  for (const key of free.slice(0, tries)) {
    const won = await insert(key, now);
    if (won === null) return { state: 'unavailable' };
    if (won) return { state: 'taken', key, used: held.size + 1 };
  }
  // Every free slot was tried and lost: the day is used. Otherwise untried ones remain.
  return free.length <= tries ? { state: 'full' } : { state: 'busy' };
}

/**
 * One of `limit` slots everyone shares today, for a ceiling too large to list. No count is read: a slot number
 * is picked at random and the insert decides, `tries` times. The ceiling is exact (never more turns than
 * slots); past about half of it a turn may be refused although slots remain, which is the safe side of a
 * ceiling that exists to stop spend.
 */
export async function takeSharedSlot(scope: string, limit: number, tries = 5, now = Date.now(), pick: (n: number) => number = (n) => 1 + Math.floor(Math.random() * n)): Promise<Slot> {
  const tried = new Set<number>();
  while (tried.size < Math.min(tries, limit)) {
    let n = Math.min(limit, Math.max(1, Math.trunc(pick(limit))));
    while (tried.has(n)) n = (n % limit) + 1;
    tried.add(n);
    const key = slotKey(scope, 'all', now, n);
    const won = await insert(key, now);
    if (won === null) return { state: 'unavailable' };
    if (won) return { state: 'taken', key, used: 0 };
  }
  return { state: 'full' };
}

/** Gives slots back. Best effort: a row that stays costs one turn of that scope until the day ends. */
export async function giveBack(slots: readonly Slot[]): Promise<void> {
  const keys = slots.flatMap((slot) => (slot.state === 'taken' ? [slot.key] : []));
  if (!keys.length) return;
  try {
    await fetch(bobbyRest(`api_cache?cache_key=in.(${keys.join(',')})`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { /* the slot ends with the day */ }
}

/** Removes the slot rows of past days. Only rows this file wrote (`cturn…`) and only expired ones. */
export async function sweepSlots(now = Date.now()): Promise<void> {
  try {
    await fetch(bobbyRest(`api_cache?cache_key=like.cturn*&expires_at=lt.${encodeURIComponent(new Date(now).toISOString())}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { /* the next sweep takes them */ }
}
