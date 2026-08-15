import { createHash, randomUUID } from 'node:crypto';

export type TradeExecutionStatus = 'claimed' | 'submitted' | 'failed';

export interface TradeExecutionClaim {
  debateHash: string;
  chainId: number;
  symbol: string;
  direction: 'long' | 'short';
  payloadHash: string;
  clientOrderId: string;
  claimToken: string;
  status: TradeExecutionStatus;
  okxOrderId: string | null;
}

interface ClaimStoreConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}

interface AcquireClaimInput extends ClaimStoreConfig {
  debateHash: string;
  chainId: number;
  symbol: string;
  direction: 'long' | 'short';
  payloadHash: string;
  clientOrderId: string;
}

interface UpdateClaimInput extends ClaimStoreConfig {
  debateHash: string;
  okxOrderId?: string;
  error?: string;
}

export type AcquireClaimResult =
  | { acquired: true; claim: TradeExecutionClaim }
  | { acquired: false; claim: TradeExecutionClaim };

const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function tradeExecutionPayloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

export function clientOrderIdForDebateHash(debateHash: string): string {
  if (!BYTES32_RE.test(debateHash)) throw new Error('Trade execution debateHash must be bytes32');
  // OKX permits at most 32 case-sensitive alphanumeric characters. The
  // database permanently enforces one use per full debate hash; clOrdId adds
  // exchange-side retry/reconciliation support, not the permanent uniqueness.
  return `Bobby${debateHash.slice(2, 29).toLowerCase()}`;
}

function headers(serviceRoleKey: string, prefer?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function requireStore(config: ClaimStoreConfig): void {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error('Trade execution claim store is not configured');
  }
}

function parseClaim(row: Record<string, unknown>): TradeExecutionClaim {
  return {
    debateHash: String(row.debate_hash || ''),
    chainId: Number(row.chain_id),
    symbol: String(row.symbol || ''),
    direction: String(row.direction || '') as 'long' | 'short',
    payloadHash: String(row.payload_hash || ''),
    clientOrderId: String(row.client_order_id || ''),
    claimToken: String(row.claim_token || ''),
    status: String(row.status || '') as TradeExecutionStatus,
    okxOrderId: row.okx_order_id ? String(row.okx_order_id) : null,
  };
}

function validateClaim(claim: TradeExecutionClaim): void {
  if (!BYTES32_RE.test(claim.debateHash)
    || !Number.isSafeInteger(claim.chainId)
    || !SHA256_RE.test(claim.payloadHash)
    || !/^[A-Za-z0-9]{1,32}$/.test(claim.clientOrderId)
    || !['long', 'short'].includes(claim.direction)
    || !['claimed', 'submitted', 'failed'].includes(claim.status)
    || !claim.claimToken) {
    throw new Error('Trade execution claim store returned malformed state');
  }
}

async function readClaim(
  config: ClaimStoreConfig,
  debateHash: string,
): Promise<TradeExecutionClaim | null> {
  const fetchImpl = config.fetchImpl || fetch;
  const query = new URLSearchParams({
    debate_hash: `eq.${debateHash.toLowerCase()}`,
    select: 'debate_hash,chain_id,symbol,direction,payload_hash,client_order_id,claim_token,status,okx_order_id',
    limit: '1',
  });
  const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/trade_execution_claims?${query}`, {
    headers: headers(config.serviceRoleKey),
  });
  if (!response.ok) throw new Error(`Trade execution claim lookup failed (${response.status})`);
  const rows = await response.json() as Record<string, unknown>[];
  if (!rows[0]) return null;
  const claim = parseClaim(rows[0]);
  validateClaim(claim);
  return claim;
}

export async function acquireTradeExecutionClaim(input: AcquireClaimInput): Promise<AcquireClaimResult> {
  requireStore(input);
  if (!BYTES32_RE.test(input.debateHash)) throw new Error('Trade execution debateHash must be bytes32');
  if (!SHA256_RE.test(input.payloadHash)) throw new Error('Trade execution payload hash must be SHA-256');
  if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) throw new Error('Trade execution chainId is invalid');
  if (!['long', 'short'].includes(input.direction)) throw new Error('Trade execution direction is invalid');
  if (!/^[A-Za-z0-9]{1,32}$/.test(input.clientOrderId)) throw new Error('Trade execution clientOrderId is invalid');

  const fetchImpl = input.fetchImpl || fetch;
  const claimToken = randomUUID();
  const row = {
    debate_hash: input.debateHash.toLowerCase(),
    chain_id: input.chainId,
    symbol: input.symbol.toUpperCase(),
    direction: input.direction,
    payload_hash: input.payloadHash,
    client_order_id: input.clientOrderId,
    claim_token: claimToken,
    status: 'claimed',
  };
  const response = await fetchImpl(`${input.supabaseUrl}/rest/v1/trade_execution_claims`, {
    method: 'POST',
    headers: headers(input.serviceRoleKey, 'resolution=ignore-duplicates,return=representation'),
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(`Trade execution claim insert failed (${response.status})`);
  const inserted = await response.json() as Record<string, unknown>[];
  if (inserted[0]) {
    const claim = parseClaim(inserted[0]);
    validateClaim(claim);
    if (claim.claimToken !== claimToken) throw new Error('Trade execution claim ownership mismatch');
    return { acquired: true, claim };
  }

  const existing = await readClaim(input, input.debateHash);
  if (!existing) throw new Error('Trade execution claim conflict could not be reconciled');
  if (existing.payloadHash !== input.payloadHash
    || existing.chainId !== input.chainId
    || existing.symbol !== input.symbol.toUpperCase()
    || existing.direction !== input.direction
    || existing.clientOrderId !== input.clientOrderId) {
    throw new Error('Debate hash is already bound to a different order intent');
  }
  return { acquired: false, claim: existing };
}

async function updateClaim(
  input: UpdateClaimInput,
  patch: Record<string, unknown>,
): Promise<TradeExecutionClaim> {
  requireStore(input);
  const fetchImpl = input.fetchImpl || fetch;
  const query = new URLSearchParams({
    debate_hash: `eq.${input.debateHash.toLowerCase()}`,
    status: 'eq.claimed',
  });
  const response = await fetchImpl(`${input.supabaseUrl}/rest/v1/trade_execution_claims?${query}`, {
    method: 'PATCH',
    headers: headers(input.serviceRoleKey, 'return=representation'),
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`Trade execution claim update failed (${response.status})`);
  const rows = await response.json() as Record<string, unknown>[];
  if (!rows[0]) {
    const existing = await readClaim(input, input.debateHash);
    if (!existing) throw new Error('Trade execution claim disappeared during update');
    return existing;
  }
  const claim = parseClaim(rows[0]);
  validateClaim(claim);
  return claim;
}

export function markTradeExecutionSubmitted(input: UpdateClaimInput & { okxOrderId: string }): Promise<TradeExecutionClaim> {
  if (!input.okxOrderId) throw new Error('OKX order id is required');
  return updateClaim(input, {
    status: 'submitted',
    okx_order_id: input.okxOrderId,
    last_error: null,
    updated_at: new Date().toISOString(),
  });
}

export function markTradeExecutionFailed(input: UpdateClaimInput & { error: string }): Promise<TradeExecutionClaim> {
  return updateClaim(input, {
    status: 'failed',
    last_error: input.error.slice(0, 500),
    updated_at: new Date().toISOString(),
  });
}
