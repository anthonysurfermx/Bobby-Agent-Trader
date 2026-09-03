// ============================================================
// DEX allow-list — the only contracts a Bobby-built transaction may target.
//
// The OKX aggregator answers with `tx.to` (its router) and `dexContractAddress`
// (its approval contract). Until 2026-09-03 both were forwarded to the wallet
// verbatim: a compromised or spoofed upstream could have pointed an approval
// at an arbitrary spender. Now every swap/approve the API returns must pass:
//   · router  ∈ allow-list for that chain
//   · approve calldata decodes to approve(spender, amount) with
//     spender ∈ allow-list and amount == the amount the user asked for
//   · swap value is 0 unless the user sells the native token (then ≤ amount)
// FAIL-CLOSED: a chain with an empty list refuses to build transactions.
// The lists are configured, not learned from the upstream (that would be
// circular): DEX_ALLOWED_ROUTERS_<chainId> / DEX_ALLOWED_SPENDERS_<chainId>,
// comma-separated, lower-case or not. Populate them from OKX's published
// contract addresses after checking each one on the explorer; a rotation on
// OKX's side then shows up as a refusal here instead of a blind signature.
// ============================================================
import { Interface, getAddress } from 'ethers';

const NATIVE = new Set(['0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', '0x0000000000000000000000000000000000000000']);
const ERC20 = new Interface(['function approve(address spender, uint256 amount)']);

function envList(name: string): Set<string> {
  return new Set((process.env[name] || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^0x[0-9a-f]{40}$/.test(s)));
}
export function allowedRouters(chainId: number | string): Set<string> { return envList(`DEX_ALLOWED_ROUTERS_${chainId}`); }
export function allowedSpenders(chainId: number | string): Set<string> { return envList(`DEX_ALLOWED_SPENDERS_${chainId}`); }
export function dexConfigured(chainId: number | string): boolean { return allowedRouters(chainId).size > 0 && allowedSpenders(chainId).size > 0; }

export interface Disclosure { chainId: number; router: string; spender: string | null; valueWei: string; minReceived: string | null; note: string }

export class DexRefusal extends Error { constructor(message: string, public readonly code = 'dex_refused') { super(message); this.name = 'DexRefusal'; } }

/** A swap transaction from the aggregator, checked against the allow-list. */
export function checkSwapTx(chainId: number | string, tx: { to?: string; data?: string; value?: string }, fromToken: string, amountWei: string): { to: string; value: string } {
  const routers = allowedRouters(chainId);
  if (!routers.size) throw new DexRefusal(`Swaps on chain ${chainId} are not enabled: DEX_ALLOWED_ROUTERS_${chainId} is empty (fail closed)`, 'dex_not_configured');
  const to = String(tx.to || '').toLowerCase();
  if (!routers.has(to)) throw new DexRefusal(`Aggregator returned a router that is not allow-listed on chain ${chainId} (${to || 'none'})`, 'router_not_allowed');
  if (!/^0x[0-9a-fA-F]*$/.test(String(tx.data || '')) || String(tx.data || '').length < 10) throw new DexRefusal('Aggregator returned malformed calldata', 'calldata_malformed');
  const value = BigInt(tx.value || '0');
  const sellsNative = NATIVE.has(fromToken.toLowerCase());
  if (!sellsNative && value !== 0n) throw new DexRefusal('Swap carries native value although the sold token is an ERC-20', 'unexpected_value');
  if (sellsNative && value > BigInt(amountWei)) throw new DexRefusal('Swap value exceeds the amount being sold', 'value_exceeds_amount');
  return { to: getAddress(to), value: value.toString() };
}

/** An approval from the aggregator: spender allow-listed, calldata really is approve(spender, amount). */
export function checkApproveTx(chainId: number | string, approve: { to?: string; data?: string }, amountWei: string): { to: string; spender: string } {
  const spenders = allowedSpenders(chainId);
  if (!spenders.size) throw new DexRefusal(`Approvals on chain ${chainId} are not enabled: DEX_ALLOWED_SPENDERS_${chainId} is empty (fail closed)`, 'dex_not_configured');
  const spenderTo = String(approve.to || '').toLowerCase();
  if (!spenders.has(spenderTo)) throw new DexRefusal(`Aggregator returned an approval spender that is not allow-listed on chain ${chainId} (${spenderTo || 'none'})`, 'spender_not_allowed');
  let decoded: { spender: string; amount: bigint };
  try {
    const parsed = ERC20.parseTransaction({ data: String(approve.data || '') });
    if (!parsed || parsed.name !== 'approve') throw new Error('not approve');
    decoded = { spender: String(parsed.args[0]).toLowerCase(), amount: BigInt(parsed.args[1].toString()) };
  } catch {
    throw new DexRefusal('Approval calldata is not approve(spender, amount)', 'calldata_malformed');
  }
  if (decoded.spender !== spenderTo) throw new DexRefusal('Approval calldata names a different spender than the one returned', 'spender_mismatch');
  if (decoded.amount !== BigInt(amountWei)) throw new DexRefusal(`Approval amount ${decoded.amount} differs from the requested ${amountWei} (no unlimited approvals)`, 'amount_mismatch');
  return { to: getAddress(spenderTo), spender: getAddress(spenderTo) };
}

export function minReceived(toAmountWei: string, slippagePct: number): string {
  const bps = BigInt(Math.round(Math.max(0, Math.min(100, slippagePct)) * 100));
  return ((BigInt(toAmountWei) * (10_000n - bps)) / 10_000n).toString();
}
