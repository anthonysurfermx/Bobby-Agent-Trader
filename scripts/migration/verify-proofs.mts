#!/usr/bin/env -S npx tsx
// ============================================================
// Proof verification beyond "the bytes match": for every Hardness proof on
// a side, recompute prediction_hash from the session (keccak256 of
// "bobby:<thread id>", the formula in api/_lib/hardness-registry.ts) and
// confirm each transaction hash exists on the chain the row claims
// (eth_getTransactionReceipt, status 1) through a public RPC — read-only,
// no keys. Also checks agent_trades / mcp_payment_receipts tx hashes.
//   TARGET_SUPABASE_* npx tsx scripts/migration/verify-proofs.mts --side target
// Exit 0 = every proof recomputes and is on-chain; 1 otherwise.
// ============================================================
import { keccak256, toUtf8Bytes } from 'ethers';
import { log, project, rows, type Side } from './lib.js';

const args = process.argv.slice(2);
const sideArg = args[args.indexOf('--side') + 1];
if (sideArg !== 'source' && sideArg !== 'target') { console.error('--side source|target is required'); process.exit(2); }
const p = project(sideArg as Side);
const RPCS: Record<number, string[]> = {
  8453: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'],
  84532: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'],
  196: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
};
let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail}` : ''}`); };

async function receipt(chainId: number, tx: string): Promise<'mined' | 'reverted' | 'missing' | 'unreachable'> {
  for (const url of RPCS[chainId] || []) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt', params: [tx] }) });
      const j = (await r.json()) as { result?: { status?: string } | null };
      if (j.result === null) return 'missing';
      if (j.result) return j.result.status === '0x1' ? 'mined' : 'reverted';
    } catch { /* try next */ }
  }
  return 'unreachable';
}

(async () => {
  log(`verify proofs · ${p.ref}`);
  // Hardness: sessions give the thread id candidates; proofs carry the hashes.
  const sessions = new Map<string, Record<string, unknown>>();
  for await (const page of rows<Record<string, unknown>>(p, 'hardness_agent_sessions', ['id'], 'session_id,decision_json,request_json,context_json')) for (const s of page) sessions.set(String(s.session_id), s);
  let proofs = 0;
  for await (const page of rows<Record<string, unknown>>(p, 'hardness_agent_proofs', ['id'])) {
    for (const r of page) {
      proofs += 1;
      const s = sessions.get(String(r.session_id));
      const text = JSON.stringify([s?.decision_json, s?.request_json, s?.context_json]);
      const ids = new Set<string>([String(r.session_id), ...(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) || [])]);
      const recomputed = [...ids].find((id) => keccak256(toUtf8Bytes(`bobby:${id}`)) === r.prediction_hash);
      line(Boolean(recomputed), `hardness proof #${r.id}: prediction_hash recomputes from a thread id`, recomputed ? `bobby:${recomputed}` : `no candidate among ${ids.size} ids`);
      const chainId = Number(r.chain_id);
      for (const c of ['commit_tx_hash', 'signal_tx_hash', 'resolve_tx_hash'] as const) {
        const tx = r[c] as string | null;
        if (!tx) continue;
        const st = await receipt(chainId, tx);
        line(st === 'mined', `hardness proof #${r.id}: ${c} on chain ${chainId}`, `${tx.slice(0, 14)}… ${st}`);
      }
    }
  }
  log(`${proofs} hardness proof(s) checked`);
  // Trades and MCP receipts: every tx hash must be mined on its chain.
  for (const [table, chainCol, txCol] of [['agent_trades', 'chain', 'tx_hash'], ['mcp_payment_receipts', null, 'tx_hash']] as const) {
    let n = 0;
    for await (const page of rows<Record<string, unknown>>(p, table, [txCol === 'tx_hash' && table === 'mcp_payment_receipts' ? 'tx_hash' : 'id'], `*`)) {
      for (const r of page) {
        const tx = r[txCol] as string | null; if (!tx || !/^0x[0-9a-f]{64}$/i.test(tx)) continue;
        n += 1;
        const chainId = chainCol ? Number(r[chainCol]) || 196 : Number(r.chain_id) || 196;
        const st = await receipt(chainId, tx);
        line(st === 'mined', `${table} ${txCol} on chain ${chainId}`, `${tx.slice(0, 14)}… ${st}`);
      }
    }
    log(`${table}: ${n} tx hash(es) checked`);
  }
  console.log(failures ? `\nPROOFS FAILED: ${failures} problem(s).` : '\nPROOFS VERIFIED.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
