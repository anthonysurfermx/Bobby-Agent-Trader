// ============================================================
// swap-receipts — the database only ever says what the chain says.
//
//   1. /api/base-swap POST records the swap it BUILT (status 'built', keyed
//      by wallet + keccak256(calldata)). Nothing is signed yet.
//   2. The wallet broadcasts. The client posts the hash to /api/swap-receipt.
//   3. verifySwapOnChain() reads the transaction and receipt from Base:
//      sender is the session wallet, target is SwapRouter02, status success,
//      calldata hash matches a row this server built. Token movements are
//      taken from Transfer/Withdrawal logs, never from the client.
//   4. confirmSwapReceipt() flips that row to 'confirmed' — idempotent: the
//      same hash twice is a no-op, a different hash for the same calldata is
//      a conflict, an unknown calldata is refused (Bobby did not build it).
//
// Table: bobby_swap_receipts (migration 20260903000009). Rows carry the
// identity (Sign in with Apple / wallet link) when it is known, so iOS and
// web read one history.
// ============================================================

import { decodeEventLog, keccak256, getAddress, parseAbi, type Address, type Hex } from 'viem';
import { baseClient, SWAP_ROUTER02, WETH9 } from './base-swap.js';
import { bobbyDbConfigured, bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { BASE_SWAP_CHAIN_ID, findBaseToken } from '../../src/lib/base-swap/tokens.js';

export const SWAP_ENGINE = 'uniswap-v3-swaprouter02';
export const SWAP_RECEIPTS_TABLE = 'bobby_swap_receipts';
export const AGENT_TRADES_TABLE = 'agent_trades';
export const AGENT_CYCLES_TABLE = 'agent_cycles';

// The store is reached through this indirection so tests can stand in a
// PostgREST double for the WHOLE path (endpoint → lib → store), not just the
// lib. Production never calls the setter.
let storeFetch: typeof fetch = (...args) => fetch(...args);
export function setReceiptStoreFetchForTests(fn: typeof fetch | null): void {
  storeFetch = fn ?? ((...args) => fetch(...args));
}

const TRANSFER_ABI = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)']);
const WITHDRAWAL_ABI = parseAbi(['event Withdrawal(address indexed src, uint256 wad)']);
const TRANSFER_TOPIC = keccak256(new TextEncoder().encode('Transfer(address,address,uint256)'));
const WITHDRAWAL_TOPIC = keccak256(new TextEncoder().encode('Withdrawal(address,uint256)'));

export interface BuiltSwapRow {
  wallet: string;
  identityId?: string | null;
  cycleId?: string | null;
  platform?: 'web' | 'ios';
  tokenIn: { symbol: string; address: string };
  tokenOut: { symbol: string; address: string };
  amountInRaw: string;
  quotedOutRaw: string;
  minOutRaw: string;
  route: string;
  router: string;
  calldataHash: Hex;
  deadline: number;
}

/** Records what was built. Best-effort: a database outage must not block a quote, but the caller learns it. */
export async function recordBuiltSwap(row: BuiltSwapRow, fetchImpl: typeof fetch = storeFetch): Promise<{ recorded: boolean; reason?: string }> {
  if (!bobbyDbConfigured()) return { recorded: false, reason: 'database not configured' };
  try {
    const res = await fetchImpl(bobbyRest(`${SWAP_RECEIPTS_TABLE}?on_conflict=wallet_address,calldata_hash`), {
      method: 'POST',
      headers: bobbyServiceHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({
        identity_id: row.identityId ?? null,
        cycle_id: row.cycleId ?? null,
        wallet_address: row.wallet.toLowerCase(),
        chain_id: BASE_SWAP_CHAIN_ID,
        engine: SWAP_ENGINE,
        router_address: row.router.toLowerCase(),
        token_in_address: row.tokenIn.address.toLowerCase(),
        token_out_address: row.tokenOut.address.toLowerCase(),
        token_in_symbol: row.tokenIn.symbol,
        token_out_symbol: row.tokenOut.symbol,
        amount_in_raw: row.amountInRaw,
        quoted_out_raw: row.quotedOutRaw,
        min_amount_out_raw: row.minOutRaw,
        route: row.route,
        calldata_hash: row.calldataHash,
        deadline: new Date(row.deadline * 1000).toISOString(),
        status: 'built',
        platform: row.platform ?? 'web',
      }),
    });
    if (!res.ok) return { recorded: false, reason: `db ${res.status}` };
    return { recorded: true };
  } catch (error) {
    return { recorded: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export interface TokenMovement { token: Address; symbol: string; from: Address; to: Address; amountRaw: string }

export interface ChainVerification {
  ok: boolean;
  /** 'pending' = not mined yet (retry); anything else is final. */
  reason: string | null;
  txHash: Hex;
  from: Address | null;
  to: Address | null;
  status: 'success' | 'reverted' | null;
  blockNumber: string | null;
  blockTimestamp: number | null;
  calldataHash: Hex | null;
  valueWei: string | null;
  /** Allow-listed token movements touching the wallet. */
  movements: TokenMovement[];
  amountInRaw: string | null;
  amountOutRaw: string | null;
}

type ReceiptClient = Pick<ReturnType<typeof baseClient>, 'getTransaction' | 'getTransactionReceipt' | 'getBlock'>;

/** Reads the transaction and its receipt; every check is against chain data. */
export async function verifySwapOnChain(txHash: Hex, wallet: Address, client: ReceiptClient = baseClient()): Promise<ChainVerification> {
  const base: ChainVerification = { ok: false, reason: null, txHash, from: null, to: null, status: null, blockNumber: null, blockTimestamp: null, calldataHash: null, valueWei: null, movements: [], amountInRaw: null, amountOutRaw: null };
  let tx; let receipt;
  try {
    [tx, receipt] = await Promise.all([client.getTransaction({ hash: txHash }), client.getTransactionReceipt({ hash: txHash })]);
  } catch {
    return { ...base, reason: 'pending' };
  }
  const w = getAddress(wallet);
  const out: ChainVerification = {
    ...base,
    from: getAddress(tx.from),
    to: tx.to ? getAddress(tx.to) : null,
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    calldataHash: keccak256(tx.input),
    valueWei: tx.value.toString(),
  };
  if (out.from !== w) return { ...out, reason: 'transaction was not sent by this wallet' };
  if (out.to !== SWAP_ROUTER02) return { ...out, reason: 'transaction did not target SwapRouter02' };
  if (receipt.status !== 'success') return { ...out, reason: 'transaction reverted' };
  try {
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    out.blockTimestamp = Number(block.timestamp);
  } catch { /* timestamp is informational */ }

  let amountIn = tx.value; // ETH in arrives as msg.value
  let amountOut = 0n;
  for (const log of receipt.logs) {
    const emitter = getAddress(log.address);
    const token = findBaseToken(emitter);
    if (!token) continue; // only allow-listed tokens count; anything else is noise
    if (log.topics[0] === TRANSFER_TOPIC) {
      try {
        const ev = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics }) as unknown as { args: { from: Address; to: Address; value: bigint } };
        const from = getAddress(ev.args.from); const to = getAddress(ev.args.to);
        if (from !== w && to !== w) continue;
        out.movements.push({ token: emitter, symbol: token.symbol, from, to, amountRaw: ev.args.value.toString() });
        if (from === w) amountIn += ev.args.value;
        if (to === w) amountOut += ev.args.value;
      } catch { /* not a standard Transfer */ }
    } else if (log.topics[0] === WITHDRAWAL_TOPIC && emitter === WETH9) {
      // ETH out: the router unwrapped WETH and forwarded ETH to the wallet.
      try {
        const ev = decodeEventLog({ abi: WITHDRAWAL_ABI, data: log.data, topics: log.topics }) as unknown as { args: { src: Address; wad: bigint } };
        if (getAddress(ev.args.src) === SWAP_ROUTER02) {
          out.movements.push({ token: WETH9, symbol: 'ETH', from: SWAP_ROUTER02, to: w, amountRaw: ev.args.wad.toString() });
          amountOut += ev.args.wad;
        }
      } catch { /* ignore */ }
    }
  }
  out.amountInRaw = amountIn.toString();
  out.amountOutRaw = amountOut.toString();
  if (amountOut === 0n) return { ...out, reason: 'no allow-listed token reached the wallet' };
  return { ...out, ok: true };
}

export interface ConfirmResult {
  recorded: boolean;
  /** 'confirmed' = row flipped now; 'already' = same hash was already recorded; 'unbuilt' = Bobby never built this calldata; 'conflict' = another hash already confirmed this calldata. */
  outcome: 'confirmed' | 'already' | 'unbuilt' | 'conflict' | 'db_error';
  id: string | null;
}

/** Idempotent: flips the matching 'built' row to 'confirmed'. */
export async function confirmSwapReceipt(
  v: ChainVerification,
  wallet: string,
  opts: { identityId?: string | null; platform?: 'web' | 'ios' } = {},
  fetchImpl: typeof fetch = storeFetch,
): Promise<ConfirmResult> {
  if (!v.ok || !v.calldataHash) return { recorded: false, outcome: 'unbuilt', id: null };
  if (!bobbyDbConfigured()) return { recorded: false, outcome: 'db_error', id: null };
  const headers = bobbyServiceHeaders({ 'Content-Type': 'application/json' });
  try {
    const q = `${SWAP_RECEIPTS_TABLE}?wallet_address=eq.${wallet.toLowerCase()}&calldata_hash=eq.${v.calldataHash}&select=id,status,tx_hash,cycle_id,agent_trade_id,token_in_symbol,token_out_symbol,token_in_address,token_out_address,amount_in_raw,quoted_out_raw,identity_id`;
    const found = await fetchImpl(bobbyRest(q), { headers });
    if (!found.ok) return { recorded: false, outcome: 'db_error', id: null };
    const rows = (await found.json()) as Array<BuiltRow>;
    if (!rows.length) return { recorded: false, outcome: 'unbuilt', id: null };
    const row = rows[0];
    if (row.status === 'confirmed') {
      return row.tx_hash?.toLowerCase() === v.txHash.toLowerCase()
        ? { recorded: true, outcome: 'already', id: row.id }
        : { recorded: false, outcome: 'conflict', id: row.id };
    }
    const patch = await fetchImpl(bobbyRest(`${SWAP_RECEIPTS_TABLE}?id=eq.${row.id}&status=eq.built`), {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'confirmed',
        tx_hash: v.txHash.toLowerCase(),
        block_number: v.blockNumber,
        block_timestamp: v.blockTimestamp ? new Date(v.blockTimestamp * 1000).toISOString() : null,
        amount_out_raw: v.amountOutRaw,
        confirmed_at: new Date().toISOString(),
        ...(opts.identityId ? { identity_id: opts.identityId } : {}),
        ...(opts.platform ? { platform: opts.platform } : {}),
      }),
    });
    if (!patch.ok) return { recorded: false, outcome: 'db_error', id: row.id };
    const updated = (await patch.json()) as unknown[];
    // Zero rows updated means a concurrent confirm won the race: re-read is the idempotent answer.
    if (!updated.length) return confirmSwapReceipt(v, wallet, opts, fetchImpl);
    // The swap is now a fact for the rest of Bobby: exposure, PnL, settlement
    // and the cycle's counters read agent_trades, not this table.
    const tradeId = await linkTradeRecord(row, v, wallet, fetchImpl).catch(() => null);
    if (tradeId) {
      await fetchImpl(bobbyRest(`${SWAP_RECEIPTS_TABLE}?id=eq.${row.id}`), { method: 'PATCH', headers, body: JSON.stringify({ agent_trade_id: tradeId }) }).catch(() => null);
    }
    return { recorded: true, outcome: 'confirmed', id: row.id };
  } catch {
    return { recorded: false, outcome: 'db_error', id: null };
  }
}

interface BuiltRow {
  id: string;
  status: string;
  tx_hash: string | null;
  cycle_id: string | null;
  agent_trade_id: string | null;
  token_in_symbol: string;
  token_out_symbol: string;
  token_in_address: string;
  token_out_address: string;
  amount_in_raw: string | number;
  quoted_out_raw: string | number;
  identity_id: string | null;
}

/**
 * One agent_trades row per confirmed swap (idempotent on tx hash), plus the
 * cycle's executed/deployed counters when the calldata came from a cycle.
 * USD value: the stable leg when there is one (USDC, 6 decimals).
 */
async function linkTradeRecord(row: BuiltRow, v: ChainVerification, wallet: string, fetchImpl: typeof fetch): Promise<string | null> {
  const headers = bobbyServiceHeaders({ 'Content-Type': 'application/json' });
  const tokenIn = findBaseToken(row.token_in_address);
  const tokenOut = findBaseToken(row.token_out_address);
  if (!tokenIn || !tokenOut) return null;
  const inRaw = BigInt(v.amountInRaw ?? String(row.amount_in_raw));
  const outRaw = BigInt(v.amountOutRaw ?? '0');
  const amountUsd = tokenIn.stable ? Number(inRaw) / 10 ** tokenIn.decimals : tokenOut.stable ? Number(outRaw) / 10 ** tokenOut.decimals : null;
  if (amountUsd === null) return null;
  const buying = !tokenOut.stable; // USDC → asset is a BUY; asset → USDC is a SELL
  const asset = buying ? tokenOut : tokenIn;
  const assetUnits = Number(buying ? outRaw : inRaw) / 10 ** asset.decimals;
  const entryPrice = assetUnits > 0 ? amountUsd / assetUnits : null;
  const txHash = v.txHash.toLowerCase();
  const existing = await fetchImpl(bobbyRest(`${AGENT_TRADES_TABLE}?tx_hash=eq.${txHash}&select=id`), { headers });
  if (existing.ok) {
    const rows = (await existing.json()) as Array<{ id: string }>;
    if (rows.length) return rows[0].id;
  }
  const inserted = await fetchImpl(bobbyRest(`${AGENT_TRADES_TABLE}?select=id`), {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({
      cycle_id: row.cycle_id,
      chain: 'base',
      token_address: asset.address.toLowerCase(),
      token_symbol: asset.symbol,
      direction: buying ? 'BUY' : 'SELL',
      amount_usd: Number(amountUsd.toFixed(2)),
      entry_price: entryPrice,
      tx_hash: txHash,
      status: 'confirmed',
      signal_sources: ['base-swap', SWAP_ENGINE],
      owner_address: wallet.toLowerCase(),
      user_id: row.identity_id,
      idempotency_key: `swap:${txHash}`,
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    }),
  });
  if (!inserted.ok) return null;
  const created = (await inserted.json()) as Array<{ id: string }>;
  const tradeId = created[0]?.id ?? null;
  if (row.cycle_id) {
    // Counters: read, add, write. A lost race under-counts by one; never double-counts a hash (idempotent above).
    const cyc = await fetchImpl(bobbyRest(`${AGENT_CYCLES_TABLE}?id=eq.${row.cycle_id}&select=trades_executed,total_usd_deployed`), { headers });
    if (cyc.ok) {
      const rows = (await cyc.json()) as Array<{ trades_executed: number | null; total_usd_deployed: number | null }>;
      if (rows.length) {
        await fetchImpl(bobbyRest(`${AGENT_CYCLES_TABLE}?id=eq.${row.cycle_id}`), {
          method: 'PATCH', headers,
          body: JSON.stringify({ trades_executed: (rows[0].trades_executed ?? 0) + 1, total_usd_deployed: Number(((rows[0].total_usd_deployed ?? 0) + amountUsd).toFixed(2)) }),
        }).catch(() => null);
      }
    }
  }
  return tradeId;
}
