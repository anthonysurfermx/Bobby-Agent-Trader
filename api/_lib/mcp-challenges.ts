import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { assertWritesOpen } from './control.js';
import { bobbyDbUrl, bobbyServiceKey } from './bobby-db.js';
/**
 * MCP Payment Challenge Manager
 * Handles creation, atomic consumption, and expiry of payment challenges.
 * Uses Supabase with atomic UPDATE to prevent double fulfillment (Codex R1 P0).
 */

const SB_URL = bobbyDbUrl() || '';
const SB_KEY = bobbyServiceKey();

interface Challenge {
  challenge_id: string;
  tool_name: string;
  request_hash: string | null;
  price_wei: string;
  status: 'pending' | 'consumed' | 'expired' | 'in_progress' | 'completed' | 'retryable_failure';
  expires_at: string;
  payer_address: string | null;
  tx_hash: string | null;
  external_agent: string | null;
  client_secret_hash?: string | null;
  result_json?: unknown;
  error?: string | null;
  attempts?: number;
  consumed_at?: string | null;
}

// ---- BP-08: client binding ----
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
/** Canonical JSON (sorted keys, no undefined) so the same request always hashes the same. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
/** The request a challenge is issued FOR: tool + arguments (demo attribution already stripped by the caller). */
export function requestHashFor(toolName: string, args: Record<string, unknown>): string {
  return sha256Hex(canonicalize({ tool: toolName, args }));
}
function secretMatches(secret: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const a = Buffer.from(sha256Hex(secret), 'hex'); const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
/** A retry of a claimed challenge is allowed after this long without completion (the lambda died). */
const STALE_IN_PROGRESS_MS = 5 * 60 * 1000;

interface ReceiptRow {
  tx_hash: string;
  challenge_id: string;
  payer_address: string;
  tool_name: string;
  block_number: number;
  value_wei: string;
  value_okb: string;
  explorer_url: string | null;
  created_at?: string;
}

/**
 * Create a new payment challenge for a premium MCP tool call.
 * Returns the challenge_id that the caller must include in their payMCPCall tx.
 */
export async function createChallenge(
  toolName: string,
  priceWei: string,
  requestHash?: string,
  externalAgent?: string,
): Promise<{ challengeId: string; expiresAt: string; clientSecret: string }> {
  await assertWritesOpen('mcp createChallenge'); // FIRST statement: nothing is written while frozen
  // BP-08: the secret is returned ONCE to the requester and stored only as a hash.
  const clientSecret = randomBytes(32).toString('hex');
  const res = await fetch(`${SB_URL}/rest/v1/mcp_payment_challenges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      tool_name: toolName,
      price_wei: priceWei,
      request_hash: requestHash || null,
      external_agent: externalAgent || null,
      client_secret_hash: sha256Hex(clientSecret),
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => 'unknown');
    throw new Error(`Failed to create challenge: ${err}`);
  }

  const rows = await res.json() as Challenge[];
  if (!rows.length) throw new Error('Challenge creation returned no rows');

  return {
    challengeId: rows[0].challenge_id,
    expiresAt: rows[0].expires_at,
    clientSecret,
  };
}

/**
 * BP-08: claim a paid challenge for fulfilment. Only the client holding the
 * secret, asking for the exact request the challenge was issued for, can claim
 * it. Outcomes:
 *   claimed   — pending or retryable (or stale in-progress) → in_progress; execute the tool
 *   replay    — already completed for this client+request → hand back the stored result
 *   refused   — wrong secret / wrong request / expired / unknown / in progress elsewhere
 * The chain-verified payer is recorded, but it is the secret that authorises.
 */
export async function claimChallenge(
  challengeId: string,
  txHash: string,
  payerAddress: string,
  clientSecret: string,
  requestHash: string,
): Promise<{ outcome: 'claimed'; challenge: Challenge } | { outcome: 'replay'; result: unknown } | { outcome: 'refused'; reason: string }> {
  await assertWritesOpen('mcp claimChallenge');
  if (!/^[a-f0-9]{64}$/.test(clientSecret)) return { outcome: 'refused', reason: 'challenge secret required' };
  const secretHash = sha256Hex(clientSecret);
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_IN_PROGRESS_MS).toISOString();
  // One conditional PATCH: identity (secret hash), terms (request hash), liveness and state — all in the filter.
  const filter = `challenge_id=eq.${encodeURIComponent(challengeId)}&client_secret_hash=eq.${secretHash}&request_hash=eq.${requestHash}&expires_at=gt.${encodeURIComponent(nowIso)}`
    + `&or=(status.eq.pending,status.eq.retryable_failure,and(status.eq.in_progress,consumed_at.lt.${encodeURIComponent(staleBefore)}))`;
  const res = await fetch(`${SB_URL}/rest/v1/mcp_payment_challenges?${filter}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'in_progress', consumed_at: nowIso, tx_hash: txHash, payer_address: payerAddress }),
  });
  if (res.ok) {
    const rows = await res.json() as Challenge[];
    if (rows.length === 1) return { outcome: 'claimed', challenge: rows[0] };
  } else {
    console.error('[claimChallenge]', await res.text().catch(() => ''));
  }
  // Nothing claimed: distinguish an idempotent replay from a refusal — without leaking why.
  const g = await fetch(`${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}&select=status,client_secret_hash,request_hash,result_json`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  const row = g.ok ? ((await g.json()) as Challenge[])[0] : undefined;
  if (row && row.status === 'completed' && secretMatches(clientSecret, row.client_secret_hash) && row.request_hash === requestHash) {
    return { outcome: 'replay', result: row.result_json };
  }
  return { outcome: 'refused', reason: 'Challenge not claimable: wrong secret, different request, expired, unknown, or being fulfilled' };
}

/** BP-08: the tool ran — store the result so an authorised retry gets it back without a second execution. */
export async function completeChallenge(challengeId: string, result: unknown): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}&status=eq.in_progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString(), result_json: result }),
  }).catch((e) => console.error('[completeChallenge]', e));
}

/** BP-08: the tool failed — the payment is NOT spent; the same client may retry the same request. */
export async function failChallenge(challengeId: string, error: string): Promise<void> {
  await fetch(`${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${encodeURIComponent(challengeId)}&status=eq.in_progress`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'retryable_failure', error: error.slice(0, 500) }),
  }).catch((e) => console.error('[failChallenge]', e));
}

/**
 * Atomically consume a pending challenge. Returns true if consumed, false if already consumed/expired.
 * This is the critical anti-replay gate (Codex R1 P0): only ONE request can consume a challenge.
 */
export async function atomicConsumeChallenge(
  challengeId: string,
  txHash: string,
  payerAddress: string,
): Promise<{ consumed: boolean; challenge: Challenge | null }> {
  await assertWritesOpen('mcp atomicConsumeChallenge'); // FIRST statement: nothing is written while frozen
  // Atomic UPDATE: only succeeds if status is still 'pending' and not expired
  const res = await fetch(
    `${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${challengeId}&status=eq.pending&expires_at=gt.${new Date().toISOString()}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status: 'consumed',
        consumed_at: new Date().toISOString(),
        tx_hash: txHash,
        payer_address: payerAddress,
      }),
    },
  );

  if (!res.ok) {
    console.error('[atomicConsumeChallenge]', await res.text().catch(() => ''));
    return { consumed: false, challenge: null };
  }

  const rows = await res.json() as Challenge[];
  if (rows.length !== 1) {
    // Either already consumed, expired, or doesn't exist
    return { consumed: false, challenge: null };
  }

  return { consumed: true, challenge: rows[0] };
}

/**
 * Store a verified payment receipt for audit trail and Judge Mode.
 */
export async function storeReceipt(receipt: {
  txHash: string;
  challengeId: string;
  payerAddress: string;
  toolName: string;
  blockNumber: number;
  valueWei: string;
  valueOkb: string;
  responseHash?: string;
}): Promise<void> {
  await assertWritesOpen('mcp storeReceipt'); // FIRST statement: nothing is written while frozen
  const explorerUrl = `https://www.oklink.com/xlayer/tx/${receipt.txHash}`;

  await fetch(`${SB_URL}/rest/v1/mcp_payment_receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
    body: JSON.stringify({
      tx_hash: receipt.txHash,
      challenge_id: receipt.challengeId,
      payer_address: receipt.payerAddress,
      tool_name: receipt.toolName,
      block_number: receipt.blockNumber,
      value_wei: receipt.valueWei,
      value_okb: receipt.valueOkb,
      response_hash: receipt.responseHash || null,
      explorer_url: explorerUrl,
    }),
  }).catch((err) => {
    console.error('[storeReceipt] Failed to store receipt:', err);
  });
}

/**
 * Get a challenge by ID (for validation).
 */
export async function getChallenge(challengeId: string): Promise<Challenge | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/mcp_payment_challenges?challenge_id=eq.${challengeId}&select=*`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    },
  );

  if (!res.ok) return null;
  const rows = await res.json() as Challenge[];
  return rows[0] || null;
}

/**
 * Get the latest verified payment receipt for interop metadata surfaces.
 */
export async function getLatestReceipt(): Promise<ReceiptRow | null> {
  const res = await fetch(
    `${SB_URL}/rest/v1/mcp_payment_receipts?select=tx_hash,challenge_id,payer_address,tool_name,block_number,value_wei,value_okb,explorer_url,created_at&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
      },
    },
  );

  if (!res.ok) return null;
  const rows = await res.json() as ReceiptRow[];
  return rows[0] || null;
}
