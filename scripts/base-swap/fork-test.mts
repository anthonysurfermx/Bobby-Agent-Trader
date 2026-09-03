#!/usr/bin/env -S npx tsx
// ============================================================
// End-to-end test of the Base swap engine on a LOCAL FORK of Base (anvil).
// Nothing touches mainnet. Proves, with real Uniswap bytecode and real pool
// state: quote → exact approve to Permit2 → Permit2 signature → Universal
// Router calldata → simulation → broadcast → balances moved by ≥ minOut, for
// USDC→ETH (ERC-20 in, native out) and ETH→USDC (native in). Plus the refusals
// (token not allowed, amount cap, permit mismatch, tampered minimum).
//   npx tsx scripts/base-swap/fork-test.mts      (starts anvil itself on :8546)
// ============================================================
import { spawn } from 'node:child_process';
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, encodeAbiParameters, pad, toHex, type Address } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { BASE_TOKENS, build, quote, simulate, steps, SwapRefusal, UNISWAP } from '../../api/_lib/base-swap.js';

const RPC = 'http://127.0.0.1:8546';
const FORK = process.env.BASE_FORK_RPC || 'https://mainnet.base.org';
// A fresh key, never the well-known anvil keys: those addresses carry EIP-7702
// delegations on Base mainnet, so Permit2 treats them as contracts (EIP-1271).
const account = privateKeyToAccount(generatePrivateKey());
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail}` : ''}`); };
const rpc = async (method: string, params: unknown[]) => (await (await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json()) as { result?: unknown; error?: unknown };

const anvil = spawn('anvil', ['--fork-url', FORK, '--port', '8546', '--chain-id', '8453', '--silent']);
process.on('exit', () => anvil.kill());
await new Promise((r) => setTimeout(r, 6000));
const pub = createPublicClient({ chain: base, transport: http(RPC) });
const wallet = createWalletClient({ chain: base, transport: http(RPC), account });
const USDC = BASE_TOKENS.USDC.address;
const bal = (t: Address, a: Address) => pub.readContract({ address: t, abi: ERC20, functionName: 'balanceOf', args: [a] } as any) as Promise<bigint>;

try {
  line(Number(await pub.getChainId()) === 8453 && (await pub.getBlockNumber()) > 50_000_000n, 'anvil fork of Base is up', `block ${await pub.getBlockNumber()}`);
  // fund: 10 ETH + 10,000 USDC (FiatToken balances mapping is at slot 9 on Base USDC)
  await rpc('anvil_setBalance', [account.address, toHex(10n * 10n ** 18n)]);
  const slot = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [account.address, 9n]));
  await rpc('anvil_setStorageAt', [USDC, slot, pad(toHex(10_000n * 10n ** 6n), { size: 32 })]);
  const usdc0 = await bal(USDC, account.address);
  line(usdc0 === 10_000n * 10n ** 6n, 'test account funded with 10,000 USDC via storage', `balance ${usdc0}`);

  // ---- USDC → ETH (ERC-20 in, native out) ----
  const q1 = await quote('USDC', 'ETH', 100n * 10n ** 6n, 50, pub);
  line(BigInt(q1.amountOut) > 0n && BigInt(q1.minOut) < BigInt(q1.amountOut), `quote 100 USDC → ETH: ${(Number(q1.amountOut) / 1e18).toFixed(6)} ETH, min ${(Number(q1.minOut) / 1e18).toFixed(6)}, fee ${q1.fee}`);
  const s1 = await steps(account.address, q1, pub);
  line(Boolean(s1.approve) && s1.approve!.spender === UNISWAP.permit2 && s1.approve!.amount === q1.amountIn, 'steps: exact approve to Permit2 required (allowance 0)', `amount ${s1.approve?.amount}`);
  line(Boolean(s1.permit) && s1.permit!.message.spender === UNISWAP.universalRouter && s1.permit!.message.details.amount === q1.amountIn, 'steps: Permit2 typed data bounded to amount, router, 30 min');
  const approveHash = await wallet.sendTransaction({ to: s1.approve!.to, data: s1.approve!.data });
  await pub.waitForTransactionReceipt({ hash: approveHash });
  const sig = await wallet.signTypedData({ domain: s1.permit!.domain, types: s1.permit!.types, primaryType: 'PermitSingle', message: { details: { token: s1.permit!.message.details.token, amount: BigInt(s1.permit!.message.details.amount), expiration: s1.permit!.message.details.expiration, nonce: s1.permit!.message.details.nonce }, spender: s1.permit!.message.spender, sigDeadline: BigInt(s1.permit!.message.sigDeadline) } } as any);
  const tx1 = build(account.address, q1, { message: s1.permit!.message, signature: sig });
  line(tx1.to === UNISWAP.universalRouter && tx1.value === '0', 'build: to = Universal Router, value 0 for an ERC-20 input', tx1.data.slice(0, 10));
  let simOk = true; try { await simulate(account.address, tx1, pub); } catch (e) { simOk = false; line(false, 'simulate USDC→ETH', (e as Error).message); }
  if (simOk) line(true, 'simulate USDC→ETH passes on the fork');
  const eth0 = await pub.getBalance({ address: account.address });
  const h1 = await wallet.sendTransaction({ to: tx1.to, data: tx1.data, value: BigInt(tx1.value) });
  const r1 = await pub.waitForTransactionReceipt({ hash: h1 });
  const eth1 = await pub.getBalance({ address: account.address }); const usdc1 = await bal(USDC, account.address);
  const gas1 = r1.gasUsed * (r1.effectiveGasPrice || 0n);
  line(r1.status === 'success', 'broadcast USDC→ETH mined on the fork', `gas ${r1.gasUsed}`);
  line(usdc0 - usdc1 === 100n * 10n ** 6n, 'exactly 100 USDC left the wallet', `Δ ${usdc0 - usdc1}`);
  line(eth1 + gas1 - eth0 >= BigInt(q1.minOut), 'ETH received ≥ minOut (net of gas)', `received ${(Number(eth1 + gas1 - eth0) / 1e18).toFixed(6)} vs min ${(Number(q1.minOut) / 1e18).toFixed(6)}`);

  // ---- ETH → USDC (native in) ----
  const q2 = await quote('ETH', 'USDC', 10n ** 16n, 50, pub);
  const s2 = await steps(account.address, q2, pub);
  line(s2.approve === null && s2.permit === null, 'ETH in: no approval, no permit');
  const tx2 = build(account.address, q2, null);
  line(tx2.value === q2.amountIn, 'build: value = amountIn for a native input');
  await simulate(account.address, tx2, pub);
  const u0 = await bal(USDC, account.address);
  const h2 = await wallet.sendTransaction({ to: tx2.to, data: tx2.data, value: BigInt(tx2.value) });
  const r2 = await pub.waitForTransactionReceipt({ hash: h2 });
  const u1 = await bal(USDC, account.address);
  line(r2.status === 'success' && u1 - u0 >= BigInt(q2.minOut), 'ETH→USDC mined, USDC received ≥ minOut', `received ${Number(u1 - u0) / 1e6} USDC vs min ${Number(q2.minOut) / 1e6}`);

  // ---- refusals ----
  await quote('USDC', 'SHIB', 10n ** 6n, 50, pub).then(() => line(false, 'unknown token refused')).catch((e) => line(e instanceof SwapRefusal && e.code === 'token_not_allowed', 'unknown token refused', e.code));
  await quote('USDC', 'ETH', 5_000n * 10n ** 6n, 50, pub).then(() => line(false, 'amount above the ceiling refused')).catch((e) => line(e instanceof SwapRefusal && e.code === 'amount_cap', 'amount above the ceiling refused', e.code));
  await quote('USDC', 'ETH', 10n ** 6n, 500, pub).then(() => line(false, 'slippage above 3% refused')).catch((e) => line(e instanceof SwapRefusal && e.code === 'slippage_out_of_range', 'slippage above 3% refused', e.code));
  try { build(account.address, q1, { message: { ...s1.permit!.message, details: { ...s1.permit!.message.details, amount: (BigInt(q1.amountIn) * 2n).toString() } }, signature: sig }); line(false, 'permit for a different amount refused'); } catch (e) { line(e instanceof SwapRefusal && e.code === 'permit_mismatch', 'permit for a different amount refused', (e as SwapRefusal).code); }
  const tampered = build(account.address, { ...q2, minOut: (BigInt(q2.amountOut) * 2n).toString() }, null);
  let tamperedReverted = false; try { await simulate(account.address, tampered, pub); } catch (e) { tamperedReverted = e instanceof SwapRefusal && e.code === 'simulation_reverted'; }
  line(tamperedReverted, 'a minimum above the market makes the simulation revert (Too little received)');
} catch (e) {
  line(false, 'unexpected error', (e as Error).message);
} finally {
  anvil.kill();
}
console.log(failures ? `\nFORK TEST FAILED: ${failures} problem(s).` : '\nFORK TEST PASSED: quote, approve, permit, build, simulate, broadcast and refusals verified on a Base fork.');
process.exit(failures ? 1 : 0);
