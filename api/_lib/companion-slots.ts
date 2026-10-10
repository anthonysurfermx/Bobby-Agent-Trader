// ============================================================
// Turn slots for the companion (api/companion-turn.ts): what keeps "five a day" true under a burst.
//
// The shared counters (rate-limit-persistent.ts) read a count and write count+1: K requests sent at the same
// instant all read the same number and are all let through. A companion turn is a model call, so here a turn
// must first take a SLOT, one row of `api_cache` whose key carries the scope, the UTC day and a slot number.
// The table's primary key decides: of all the requests that insert the same key, the database lets one in. No
// more turns than slots are served however the requests arrive, and it needs no migration.
//
// Every row carries the token of the request that wrote it, and a row is only ever deleted with its token. So
// a slot taken and not used (the address was full, the provider failed) can be given back, a request whose
// insert was written but whose answer never arrived can remove what it may have left, and neither can remove a
// row another request won. Slots end with the UTC day; their rows expire an hour later and sweepSlots removes
// them.
// ============================================================
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

const DAY_MS = 86_400_000;
const TIMEOUT_MS = 2000;

export type Slot =
  /** `used`: the slots of this scope seen taken today, this one included (0 when the scope keeps no count). */
  | { state: 'taken'; key: string; used: number }
  /** Every slot of the day was already held when this request looked. */
  | { state: 'full' }
  /** Other requests took the slots this one tried: trying again can work. */
  | { state: 'busy' }
  /** Storage could not answer: the caller refuses, it never guesses. */
  | { state: 'unavailable' };
export interface SlotOptions { tries?: number; now?: number; /** A whole number from 1 to n. */ pick?: (n: number) => number }

const dayEnd = (now: number) => Math.floor(now / DAY_MS) * DAY_MS + DAY_MS;
// Letters, digits and underscores only: the key goes into a PostgREST `in.(…)` list unquoted.
const slotKey = (scope: string, id: string, now: number, n: number) => `cturn_${scope}_${id}_${new Date(now).toISOString().slice(0, 10).replace(/-/g, '')}_${n}`;
const random = (n: number) => 1 + Math.floor(Math.random() * n);
const usable = (id: string) => /^[a-z0-9]{3,64}$/i.test(id);
/** Seconds until the slots of the day `now` falls in end (00:00 UTC). */
export const slotsResetInS = (now = Date.now()) => Math.max(60, Math.ceil((dayEnd(now) - now) / 1000));

/** Deletes these keys where this request's token wrote them. One retry: a slot left behind costs someone a turn. */
async function remove(keys: readonly string[], token: string): Promise<void> {
  if (!keys.length) return;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(bobbyRest(`api_cache?cache_key=in.(${keys.join(',')})&payload->>slot=eq.${token}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (r.ok) return;
    } catch { /* tried again once; after that the slot ends with the day */ }
  }
}

/** True when this request's insert won the key, false when the key was already held, null when storage failed. */
async function insert(key: string, now: number, token: string): Promise<boolean | null> {
  try {
    const r = await fetch(bobbyRest('api_cache?on_conflict=cache_key&select=cache_key'), {
      method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: bobbyServiceHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({ cache_key: key, payload: { slot: token }, expires_at: new Date(dayEnd(now) + 3_600_000).toISOString(), updated_at: new Date(now).toISOString() }),
    });
    if (r.ok) {
      const rows = await r.json() as unknown;
      if (Array.isArray(rows)) return rows.length === 1;
    }
  } catch { /* no answer is not "not written" */ }
  // The row may have been written although its answer never arrived (slow storage). Left there it would use a
  // turn nobody got, on every retry. The token makes the removal safe to send blind.
  await remove([key], token);
  return null;
}

const dayKeys = (scope: string, id: string, limit: number, now: number) => Array.from({ length: limit }, (_, i) => slotKey(scope, id, now, i + 1));
/** Which of these keys are held, or null when storage could not answer. */
async function heldAmong(keys: readonly string[]): Promise<Set<string> | null> {
  try {
    const r = await fetch(bobbyRest(`api_cache?cache_key=in.(${keys.join(',')})&select=cache_key`), { headers: bobbyServiceHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    const rows = await r.json() as Array<{ cache_key?: unknown }>;
    return Array.isArray(rows) ? new Set(rows.map((row) => String(row.cache_key))) : null;
  } catch {
    return null;
  }
}

/**
 * How many of its `limit` slots `id` holds today in `scope`, without taking one: what a person has used of an
 * allowance that the request at hand does not touch. Null when storage could not answer.
 */
export async function slotsHeld(scope: string, id: string, limit: number, now = Date.now()): Promise<number | null> {
  if (!usable(id) || !Number.isInteger(limit) || limit < 1 || limit > 100) return null;
  return (await heldAmong(dayKeys(scope, id, limit, now)))?.size ?? null;
}

/**
 * One of the `limit` slots `id` has today in `scope`. The free ones are read first, then tried from a random
 * one on, so that requests arriving together spread over them; a request that loses a slot to another tries
 * the next, `tries` times at most.
 */
export async function takeSlot(scope: string, id: string, limit: number, token: string, { tries = 3, now = Date.now(), pick = random }: SlotOptions = {}): Promise<Slot> {
  if (!usable(id) || !usable(token) || !Number.isInteger(limit) || limit < 1 || limit > 100) return { state: 'unavailable' };
  const keys = dayKeys(scope, id, limit, now);
  const held = await heldAmong(keys);
  if (!held) return { state: 'unavailable' };
  const free = keys.filter((key) => !held.has(key));
  if (!free.length) return { state: 'full' };
  const from = Math.min(free.length, Math.max(1, Math.trunc(pick(free.length)))) - 1;
  for (const key of [...free.slice(from), ...free.slice(0, from)].slice(0, tries)) {
    const won = await insert(key, now, token);
    if (won === null) return { state: 'unavailable' };
    if (won) return { state: 'taken', key, used: held.size + 1 };
  }
  // Slots were free a moment ago and others took the ones tried: that is not "the day is used".
  return { state: 'busy' };
}

/**
 * One of `limit` slots shared by everyone under `id` today, for a ceiling too large to list. No count is read:
 * a slot number is picked at random and the insert decides, `tries` times. The ceiling is exact (never more
 * turns than slots); past about half of it a turn may be refused although slots remain, which is the safe side
 * of a ceiling that exists to stop spend.
 */
export async function takeSharedSlot(scope: string, id: string, limit: number, token: string, { tries = 5, now = Date.now(), pick = random }: SlotOptions = {}): Promise<Slot> {
  if (!usable(id) || !usable(token) || !Number.isInteger(limit) || limit < 1) return { state: 'unavailable' };
  const tried = new Set<number>();
  while (tried.size < Math.min(tries, limit)) {
    let n = Math.min(limit, Math.max(1, Math.trunc(pick(limit))));
    while (tried.has(n)) n = (n % limit) + 1;
    tried.add(n);
    const key = slotKey(scope, id, now, n);
    const won = await insert(key, now, token);
    if (won === null) return { state: 'unavailable' };
    if (won) return { state: 'taken', key, used: 0 };
  }
  return { state: 'full' };
}

/** Gives back the slots this request took. */
export async function giveBack(slots: readonly Slot[], token: string): Promise<void> {
  await remove(slots.flatMap((slot) => (slot.state === 'taken' ? [slot.key] : [])), token);
}

/** Removes the slot rows of past days. Only rows this file wrote (`cturn…`) and only expired ones. */
export async function sweepSlots(now = Date.now()): Promise<void> {
  try {
    await fetch(bobbyRest(`api_cache?cache_key=like.cturn*&expires_at=lt.${encodeURIComponent(new Date(now).toISOString())}`), { method: 'DELETE', headers: bobbyServiceHeaders({ Prefer: 'return=minimal' }), signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch { /* the next sweep takes them */ }
}
