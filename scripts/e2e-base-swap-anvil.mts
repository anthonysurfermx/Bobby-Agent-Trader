// End-to-end journey on a Base FORK (anvil): quote → approve → receipt →
// re-quote → simulated swap → broadcast → receipt verified on-chain →
// idempotent record. No real funds, no real database: anvil holds the chain,
// an in-memory PostgREST stand-in holds swap_receipts.
//
//   anvil --fork-url https://mainnet.base.org --port 8546 --hardfork osaka --silent &
//   (B20 stock tokens use opcodes older anvil hardforks reject with OpcodeNotFound)
//   npx tsx scripts/e2e-base-swap-anvil.mts
import assert from 'node:assert/strict';
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters, parseAbi, getAddress, formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

const ANVIL = process.env.ANVIL_URL || 'http://127.0.0.1:8546';
process.env.BASE_RPC_URL = ANVIL;
process.env.BASE_RPC_FALLBACK_URL = ANVIL;
process.env.BOBBY_SUPABASE_URL = 'https://db.e2e.invalid';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'e2e-service-key-not-real-0000000000';

const { quoteBaseSwap, SWAP_ROUTER02, baseClient } = await import('../api/_lib/base-swap.js');
const { verifySwapOnChain, confirmSwapReceipt, setReceiptStoreFetchForTests } = await import('../api/_lib/swap-receipts.js');
const { prepareBaseTrade } = await import('../api/_lib/dex-execution.js');
const { BASE_USDC } = await import('../src/lib/base-swap/tokens.js');

// ---------- in-memory PostgREST for swap_receipts ----------
type Row = Record<string, unknown> & { id: string };
const tables: Record<string, Row[]> = { bobby_swap_receipts: [], agent_trades: [], agent_cycles: [{ id: 'cycle-e2e', trades_executed: 0, total_usd_deployed: 0 }] };
let nextId = 1;
let storeDown = false;
const fakeFetch: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  if (storeDown) return new Response('down', { status: 503 });
  const url = new URL(String(input));
  const name = url.pathname.split('/rest/v1/')[1];
  const table = tables[name];
  assert.ok(table, `unexpected table ${url.pathname}`);
  const filters = [...url.searchParams.entries()].filter(([k, v]) => k !== 'select' && k !== 'on_conflict' && (v.startsWith('eq.') || v.startsWith('is.'))).map(([k, v]) => [k, v.slice(3), v.startsWith('is.')] as const);
  const match = (r: Row) => filters.every(([k, v, isOp]) => (isOp ? (v === 'null' ? r[k] == null : r[k] != null) : String(r[k]) === v));
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (init?.method === 'POST') {
    const row = JSON.parse(String(init.body)) as Row;
    if (name === 'bobby_swap_receipts') {
      const dup = table.find((r) => r.wallet_address === row.wallet_address && r.calldata_hash === row.calldata_hash);
      if (!dup) table.push({ ...row, id: `row-${nextId++}` });
      return new Response(null, { status: 201 });
    }
    const created = { ...row, id: `${name}-${nextId++}` };
    table.push(created);
    return json([created], 201);
  }
  if (init?.method === 'PATCH') {
    const patch = JSON.parse(String(init.body)) as Record<string, unknown>;
    const hit = table.filter(match);
    if (patch.tx_hash && table.some((r) => r.tx_hash === patch.tx_hash && !hit.includes(r))) return json({ message: 'duplicate key tx_hash' }, 409);
    hit.forEach((r) => Object.assign(r, patch));
    return json(hit);
  }
  return json(table.filter(match));
}) as typeof fetch;
setReceiptStoreFetchForTests(fakeFetch);
const table = tables.bobby_swap_receipts;

// ---------- chain setup ----------
const pub = createPublicClient({ chain: base, transport: http(ANVIL) });
const chainId = await pub.getChainId();
assert.equal(chainId, 8453, 'anvil must fork Base');
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d45c8ac6e0e'); // anvil #0
const wallet = createWalletClient({ account, chain: base, transport: http(ANVIL) });
const rpc = async (method: string, params: unknown[]) => {
  const r = await fetch(ANVIL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const j = await r.json() as { result?: unknown; error?: { message: string } };
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
};
await rpc('anvil_setBalance', [account.address, '0x' + parseUnits('10', 18).toString(16)]);

// USDC balance slot: find it by matching a known holder's balance.
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)']);
const holder = getAddress('0xd0b53D9277642d899DF5C87A3966A349A798F224'); // Uniswap USDC/WETH 0.05% pool
const holderBal = await pub.readContract({ address: BASE_USDC, abi: ERC20, functionName: 'balanceOf', args: [holder] });
let slot = -1;
for (let i = 0; i < 40; i++) {
  const key = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [holder, BigInt(i)]));
  const raw = await pub.getStorageAt({ address: BASE_USDC, slot: key });
  if (raw && BigInt(raw) === holderBal && holderBal > 0n) { slot = i; break; }
}
assert.ok(slot >= 0, 'could not locate the USDC balances slot');
const myKey = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account.address, BigInt(slot)]));
await rpc('anvil_setStorageAt', [BASE_USDC, myKey, '0x' + parseUnits('1000', 6).toString(16).padStart(64, '0')]);
const usdcBal = await pub.readContract({ address: BASE_USDC, abi: ERC20, functionName: 'balanceOf', args: [account.address] });
assert.equal(usdcBal, parseUnits('1000', 6));
console.log(`funded ${account.address}: 10 ETH, 1000 USDC (balances slot ${slot})`);

const send = async (tx: { to: string; data: string; value: string }) => {
  const hash = await wallet.sendTransaction({ to: tx.to as Address, data: tx.data as Hex, value: BigInt(tx.value) });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, receipt };
};

// ---------- journey: USDC → cbBTC (ERC-20 in, approval needed) ----------
async function journey(tokenIn: string, tokenOut: string, amount: string, country = 'MX') {
  console.log(`\n=== ${amount} ${tokenIn} → ${tokenOut}`);
  const q1 = await quoteBaseSwap({ tokenIn, tokenOut, amount, recipient: account.address, country, stockEligibilityConfirmed: true });
  assert.deepEqual(q1.txWithheld, [], `guards: ${q1.txWithheld.join('; ')}`);
  assert.ok(q1.tx, 'tx expected');
  if (q1.tx!.approve) {
    assert.equal(q1.tx!.swap, null, 'no swap calldata while an approval is pending');
    // The swap was still simulated, with the allowance overridden in state, before the human pays for the approval.
    assert.equal(q1.simulation.ran, true, 'allowance-override simulation ran');
    assert.equal(q1.simulation.ok, true, `pre-approval simulation: ${q1.simulation.reason}`);
    const { receipt } = await send(q1.tx!.approve);
    assert.equal(receipt.status, 'success', 'approval must mine successfully');
    const allowance = await pub.readContract({ address: q1.tokenIn.address, abi: ERC20, functionName: 'allowance', args: [account.address, SWAP_ROUTER02] });
    assert.equal(allowance.toString(), q1.amountInRaw, 'exact allowance, nothing more');
    console.log('approval mined; allowance =', allowance.toString());
  }
  // Re-quote: now the swap is simulated with the allowance in place.
  const q2 = await quoteBaseSwap({ tokenIn, tokenOut, amount, recipient: account.address, country, stockEligibilityConfirmed: true });
  assert.deepEqual(q2.txWithheld, [], `guards after approval: ${q2.txWithheld.join('; ')}`);
  assert.ok(q2.tx?.swap, 'swap calldata after approval');
  assert.equal(q2.tx!.approve, null);
  assert.equal(q2.simulation.ran, true);
  assert.equal(q2.simulation.ok, true, `simulation: ${q2.simulation.reason}`);
  // Record exactly as /api/base-swap does (same lib call, store reached through the hook).
  const { recordBuiltSwap } = await import('../api/_lib/swap-receipts.js');
  const built = await recordBuiltSwap({
    wallet: account.address, tokenIn: q2.tokenIn, tokenOut: q2.tokenOut, amountInRaw: q2.amountInRaw, quotedOutRaw: q2.amountOutRaw,
    minOutRaw: q2.minAmountOutRaw, route: q2.route.description, router: q2.venue.router, calldataHash: q2.tx!.calldataHash!, deadline: q2.deadline,
  });
  assert.equal(built.recorded, true);
  const before = q2.tokenOut.native ? await pub.getBalance({ address: account.address }) : await pub.readContract({ address: q2.tokenOut.address, abi: ERC20, functionName: 'balanceOf', args: [account.address] });
  const { hash, receipt } = await send(q2.tx!.swap!);
  assert.equal(receipt.status, 'success', 'swap must mine successfully');
  const after = q2.tokenOut.native ? await pub.getBalance({ address: account.address }) : await pub.readContract({ address: q2.tokenOut.address, abi: ERC20, functionName: 'balanceOf', args: [account.address] });
  const received = after - before;
  const minOut = BigInt(q2.minAmountOutRaw);
  if (!q2.tokenOut.native) assert.ok(received >= minOut, `received ${received} < min ${minOut}`);
  else assert.ok(received > 0n, 'ETH received (net of gas)');
  // Verify from chain data only.
  const v = await verifySwapOnChain(hash, account.address, baseClient());
  assert.equal(v.ok, true, `verify: ${v.reason}`);
  assert.equal(v.calldataHash, q2.tx!.calldataHash);
  assert.ok(BigInt(v.amountOutRaw!) >= minOut, 'verified output honours the minimum');
  assert.ok(v.movements.some((m) => m.symbol === q2.tokenOut.symbol || (q2.tokenOut.native && m.symbol === 'ETH')), 'movement to wallet recorded');
  const c1 = await confirmSwapReceipt(v, account.address);
  assert.equal(c1.outcome, 'confirmed');
  const c2 = await confirmSwapReceipt(v, account.address);
  assert.equal(c2.outcome, 'already', 'second confirm is a no-op');
  const c3 = await confirmSwapReceipt({ ...v, txHash: ('0x' + 'ab'.repeat(32)) as Hex }, account.address);
  assert.equal(c3.outcome, 'conflict', 'a different hash for the same calldata is refused');
  console.log(`swap ${hash.slice(0, 10)}… verified: in ${formatUnits(BigInt(v.amountInRaw!), q2.tokenIn.decimals)} ${q2.tokenIn.symbol} → out ${formatUnits(BigInt(v.amountOutRaw!), q2.tokenOut.decimals)} ${q2.tokenOut.symbol} (min ${q2.minAmountOut}); record ${c1.outcome}/${c2.outcome}/${c3.outcome}`);
  return { hash, q2 };
}

const a = await journey('USDC', 'cbBTC', '20');
await journey('ETH', 'USDC', '0.01');
await journey('USDC', 'ETH', '15');
// Tokenized stocks: the B20 token bytecode uses an opcode anvil 1.5 rejects
// (EVM error OpcodeNotFound, every hardfork/--optimism combination tried
// 2026-09-03), so their swap leg cannot be mined on this fork. Their guards
// are exercised live, read-only, by scripts/smoke-base-swap.mts. Opt in here
// once anvil supports it: E2E_STOCKS=1.
if (process.env.E2E_STOCKS === '1') {
  await journey('USDC', 'NVDAc', '20');
  await journey('NVDAc', 'USDC', '0.05');
}

// ---------- agent path: prepareBaseTrade records its own calldata, links the cycle, and fails closed ----------
{
  // Allowance already covers this size after the cbBTC journey? No: it was consumed. So approve first via the agent card path.
  const p1 = await prepareBaseTrade({ tokenSymbol: 'cbBTC', amountUsd: 10, wallet: account.address, country: 'MX', cycleId: 'cycle-e2e' });
  // Crypto is outside the tokenized-stock focus in the agent path: it must abort, not build.
  assert.equal(p1.ok, false, 'agent path only builds tokenized stocks');
  assert.ok(String(p1.reason).includes('tokenized-stock'), p1.reason);
  // Store outage: no calldata is handed out by the endpoint-equivalent rule.
  storeDown = true;
  const q = await quoteBaseSwap({ tokenIn: 'ETH', tokenOut: 'USDC', amount: '0.001', recipient: account.address });
  assert.ok(q.tx?.swap, 'quote itself still builds');
  const { recordBuiltSwap } = await import('../api/_lib/swap-receipts.js');
  const rec = await recordBuiltSwap({ wallet: account.address, tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountInRaw: q.amountInRaw, quotedOutRaw: q.amountOutRaw, minOutRaw: q.minAmountOutRaw, route: q.route.description, router: q.venue.router, calldataHash: q.tx!.calldataHash!, deadline: q.deadline });
  assert.equal(rec.recorded, false, 'store down → not recorded → endpoint withholds calldata');
  storeDown = false;
  // Trade linkage from the crypto journeys above: each confirmed receipt became an agent_trades row.
  const trades = tables.agent_trades;
  assert.equal(trades.length, table.filter((r) => r.status === 'confirmed').length, 'one agent_trades row per confirmed receipt');
  assert.ok(trades.every((t) => t.status === 'confirmed' && t.chain === 'base' && typeof t.amount_usd === 'number' && (t.amount_usd as number) > 0), JSON.stringify(trades[0]));
  assert.ok(table.filter((r) => r.status === 'confirmed').every((r) => r.agent_trade_id), 'receipt rows point at their trade');
  console.log('\nagent path: crypto refused, store outage withholds calldata, trades linked:', trades.map((t) => `${t.direction} ${t.token_symbol} $${t.amount_usd}`).join(', '));
}

// ---------- negatives ----------
{
  // The approval transaction is not a swap: wrong target.
  const approvalTx = (await pub.getBlock({ blockTag: 'latest', includeTransactions: true })); void approvalTx;
  const q = await quoteBaseSwap({ tokenIn: 'USDC', tokenOut: 'AERO', amount: '10', recipient: account.address });
  assert.ok(q.tx?.approve);
  const { hash } = await send(q.tx!.approve!);
  const v = await verifySwapOnChain(hash, account.address, baseClient());
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'transaction did not target SwapRouter02');
  // Unknown calldata is refused even when the chain says success.
  const other = await confirmSwapReceipt({ ...v, ok: true, to: SWAP_ROUTER02, calldataHash: ('0x' + 'cd'.repeat(32)) as Hex }, account.address);
  assert.equal(other.outcome, 'unbuilt');
  // Another wallet cannot claim my swap.
  const stranger = await verifySwapOnChain(a.hash, '0x1111111111111111111111111111111111111111', baseClient());
  assert.equal(stranger.reason, 'transaction was not sent by this wallet');
  // (Stock country gating is asserted in the live smoke; quoting a B20 pool trips the same anvil opcode gap.)
  // Ticket cap and pending hash.
  const pending = await verifySwapOnChain(('0x' + '11'.repeat(32)) as Hex, account.address, baseClient());
  assert.equal(pending.reason, 'pending');
  console.log('\nnegatives passed: wrong target, unbuilt calldata, stranger wallet, pending hash');
}
console.log(`\nrecords in table: ${table.length}, confirmed: ${table.filter((r) => r.status === 'confirmed').length}`);
console.log('base-swap anvil e2e passed');
