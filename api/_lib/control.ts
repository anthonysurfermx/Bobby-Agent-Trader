// ============================================================
// control — Bobby's dynamic kill switches.
//
// Two flags, readable at request time without a redeploy:
//   write_freeze — every Bobby writer answers 503 (migration window,
//                  incident response).
//   canary       — cycles run in dryrun with ZERO external effects
//                  (no Telegram, no Twitter, no on-chain, no payments).
//
// Sources, chosen with BOBBY_CONTROL_SOURCE:
//   table        — row id='global' in public.bobby_control, read with the
//                  service role (RLS on, no anon policy). Flip it from the
//                  Supabase dashboard.
//   edge-config  — item "bobby_control" in the Vercel Edge Config named by
//                  EDGE_CONFIG. Flip it from the Vercel dashboard.
//   (unset)      — static env: PROTOCOL_CUTOVER_FREEZE / BOBBY_WRITE_FREEZE
//                  and BOBBY_CANARY. Needs a redeploy to change, so it is
//                  NOT an emergency switch; the health endpoint reports it.
//
// Fail-closed: when a dynamic source is configured and cannot be read, the
// answer is "frozen + canary". Cached for 10 seconds per lambda instance.
// ============================================================
import type { VercelResponse } from '@vercel/node';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';

export type ControlSource = 'table' | 'edge-config' | 'env' | 'error';

export interface BobbyControl {
  writeFreeze: boolean;
  canary: boolean;
  source: ControlSource;
  /** Human note stored next to the flags (why they were flipped). */
  note: string | null;
  fetchedAt: number;
}

const CACHE_MS = 10_000;
/** A hung control source must not eat the function's whole budget (Codex review). */
const FETCH_TIMEOUT_MS = 2_500;
let cached: BobbyControl | null = null;

/** Third round (BP-04 residual): the documented spellings `1` / `TRUE` / `yes` must freeze too — the brake only ever ADDS a freeze. */
export function envFlagIsOn(value: string | undefined): boolean {
  return /^(true|1|yes|on)$/i.test((value || '').trim());
}

function fromEnv(env: NodeJS.ProcessEnv = process.env): BobbyControl {
  return {
    writeFreeze: envFlagIsOn(env.PROTOCOL_CUTOVER_FREEZE) || envFlagIsOn(env.BOBBY_WRITE_FREEZE),
    canary: env.BOBBY_CANARY === 'true' || env.BOBBY_CYCLE_CANARY === '1',
    source: 'env',
    note: null,
    fetchedAt: Date.now(),
  };
}

function failClosed(reason: string): BobbyControl {
  console.error('[control] control source unreadable — failing closed:', reason);
  return { writeFreeze: true, canary: true, source: 'error', note: reason, fetchedAt: Date.now() };
}

/**
 * BP-04 (2026-09-04 review): a dynamic control record is a DECISION, not a hint.
 * It must be a plain object whose `write_freeze` and `canary` are literal
 * booleans; anything else (array, null, missing field, string "false", number)
 * is not an explicit decision to open writes and fails CLOSED. Exported so the
 * parser is unit-tested on its own.
 */
export function parseControlRecord(raw: unknown, source: 'table' | 'edge-config'): BobbyControl {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return failClosed(`${source}: control record is not an object`);
  const rec = raw as Record<string, unknown>;
  if (typeof rec.write_freeze !== 'boolean') return failClosed(`${source}: write_freeze is not a boolean`);
  if (typeof rec.canary !== 'boolean') return failClosed(`${source}: canary is not a boolean`);
  if (rec.note !== undefined && rec.note !== null && typeof rec.note !== 'string') return failClosed(`${source}: note is not a string`);
  return { writeFreeze: rec.write_freeze, canary: rec.canary, source, note: (rec.note as string | null | undefined) ?? null, fetchedAt: Date.now() };
}

/**
 * BP-04: the environment freeze flags are an ADDITIVE emergency brake. They can
 * only add a freeze on top of whatever the dynamic source says — never open
 * writes — so operations can pull the plug without touching the control table.
 */
function applyEnvEmergencyFreeze(control: BobbyControl, env: NodeJS.ProcessEnv = process.env): BobbyControl {
  const emergency = envFlagIsOn(env.PROTOCOL_CUTOVER_FREEZE) || envFlagIsOn(env.BOBBY_WRITE_FREEZE);
  if (!emergency || control.writeFreeze) return control;
  return { ...control, writeFreeze: true, note: `${control.note ? `${control.note}; ` : ''}env emergency freeze` };
}

async function fromTable(): Promise<BobbyControl> {
  const res = await fetch(bobbyRest('bobby_control?id=eq.global&select=write_freeze,canary,note&limit=1'), {
    headers: bobbyServiceHeaders(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return failClosed(`bobby_control HTTP ${res.status}`);
  const rows = (await res.json()) as unknown;
  if (!Array.isArray(rows) || rows.length === 0) return failClosed('bobby_control row "global" is missing');
  return parseControlRecord(rows[0], 'table');
}

async function fromEdgeConfig(): Promise<BobbyControl> {
  const conn = process.env.EDGE_CONFIG || '';
  // Connection string shape: https://edge-config.vercel.com/<id>?token=<token>
  const match = conn.match(/^https:\/\/edge-config\.vercel\.com\/([^?]+)\?token=(.+)$/);
  if (!match) return failClosed('EDGE_CONFIG connection string is missing or malformed');
  const [, id, token] = match;
  const res = await fetch(`https://edge-config.vercel.com/${id}/item/bobby_control?token=${encodeURIComponent(token)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) return failClosed(`edge config HTTP ${res.status}`);
  const item = (await res.json()) as unknown;
  return parseControlRecord(item, 'edge-config');
}

/** Current flags. Dynamic sources are cached 10 s; env is read live. */
export async function getBobbyControl(): Promise<BobbyControl> {
  const source = (process.env.BOBBY_CONTROL_SOURCE || '').trim();
  if (!source) return fromEnv();
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached;
  try {
    cached = source === 'table' ? await fromTable() : source === 'edge-config' ? await fromEdgeConfig() : failClosed(`unknown BOBBY_CONTROL_SOURCE "${source}"`);
  } catch (error) {
    cached = failClosed(error instanceof Error ? error.message : String(error));
  }
  // Precedence, documented and tested (BP-04): the dynamic source decides; the
  // env flags can only ADD a freeze. An env "false" never overrides a dynamic freeze.
  cached = applyEnvEmergencyFreeze(cached);
  return cached;
}

/** Test hook: forget the 10 s snapshot so the next read hits the source again. */
export function resetBobbyControlCache(): void {
  cached = null;
}

/** Last control snapshot seen by this lambda (sync consumers such as the write latch). */
export function lastKnownControl(): BobbyControl | null {
  return cached ?? (process.env.BOBBY_CONTROL_SOURCE ? null : fromEnv());
}

/**
 * Synchronous, fail-closed view of the freeze for code that cannot await:
 * when a dynamic source is configured and this lambda has not read it yet,
 * the answer is "frozen". Writers should call getBobbyControl() first so the
 * snapshot exists; this is the backstop for the ones that forget.
 */
export function writeFreezeSync(): boolean {
  const snapshot = lastKnownControl();
  if (!snapshot) return Boolean(process.env.BOBBY_CONTROL_SOURCE);
  return snapshot.writeFreeze;
}

/** For libraries called from many endpoints: throws when writes are frozen. */
export async function assertWritesOpen(what: string): Promise<void> {
  const control = await getBobbyControl();
  if (control.writeFreeze) throw new Error(`Bobby writes are frozen (${what}; source=${control.source}${control.note ? `; ${control.note}` : ''})`);
}

/**
 * Gate for every Bobby endpoint that writes. Answers 503 with the reason when
 * writes are frozen. Returns true when the caller may proceed.
 */
export async function requireWritesOpen(res: VercelResponse): Promise<boolean> {
  const control = await getBobbyControl();
  if (!control.writeFreeze) return true;
  res.setHeader('Retry-After', '60');
  res.status(503).json({ error: 'Bobby writes are frozen', source: control.source, note: control.note });
  return false;
}
