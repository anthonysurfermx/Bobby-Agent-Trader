#!/usr/bin/env -S npx tsx
// ============================================================
// Proof verification that BINDS each transaction to the row it proves
// (Codex: "a successful receipt does not bind the proof"). Read-only,
// public RPCs, no keys. Exclusions applied (e2e test rows never count).
//
//   hardness_agent_proofs   commit_tx_hash  → to == HardnessRegistry(chain),
//                                             status 1, calldata decodes to
//                                             commitPrediction(predictionHash …)
//                                             and predictionHash == row value
//                           signal_tx_hash  → to == HardnessRegistry, status 1,
//                                             calldata decodes to publishSignal(symbol …)
//                                             with the session's symbol; the
//                                             `context` (keccak of a thread id
//                                             the row does not store) is reported,
//                                             not asserted
//                           resolve_tx_hash → to == HardnessRegistry, status 1,
//                                             calldata references predictionHash
//   agent_events            payment_tx → to == AgentEconomy(chain), status 1
//                           trade_tx   → to == contract named in meta.contract, status 1
//   agent_trades            tx_hash    → to == TrackRecord(chain col), status 1
//   forum_threads           resolution_tx_hash → to == TrackRecord, status 1, calldata
//                                             contains keccak256(thread id) or the id
//   mcp_payment_receipts    tx_hash    → to == AgentEconomy, status 1, response_hash
//                                             present in logs data when non-null
// Chain for rows without a chain column: X Layer (196) before the Base
// cut-over date, Base (8453) after. Exit 0 = every proof bound; 1 otherwise.
//   TARGET_SUPABASE_* npx tsx scripts/migration/verify-proofs.mts --side target
// ============================================================
import { Interface, keccak256, toUtf8Bytes } from 'ethers';
import { BASE, XLAYER, getChain } from '../../api/_lib/chains.js';
import { exclusionFilter, resolveExclusions } from './exclusions.js';
import { log, project, rows, type Side } from './lib.js';

const args = process.argv.slice(2);
const sideArg = args[args.indexOf('--side') + 1];
if (sideArg !== 'source' && sideArg !== 'target') { console.error('--side source|target is required'); process.exit(2); }
const p = project(sideArg as Side);
const BASE_CUTOVER_AT = Date.parse('2026-08-11T00:00:00Z'); // supabase/migrations/20260811_base_chain_cutover.sql
const RPCS: Record<number, string[]> = { 8453: [BASE.publicRpcUrl, BASE.rpcFallbackUrl!], 196: [XLAYER.publicRpcUrl, XLAYER.rpcFallbackUrl!] };
const HARDNESS = new Interface([
  'function commitPrediction(bytes32 predictionHash, string symbol, uint8 conviction, uint96 entry, uint96 target, uint96 stop)',
  'function publishSignal(string symbol, uint8 hardnessScore, uint8 direction, uint8 conviction, bytes32 context)',
  'function resolvePrediction(bytes32 predictionHash, uint96 exitPrice)',
]);
let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail}` : ''}`); };
const lower = (s: unknown) => String(s || '').toLowerCase();
const chainFor = (createdAt: unknown) => (Date.parse(String(createdAt || '')) < BASE_CUTOVER_AT ? 196 : 8453);

interface Tx { to: string | null; input: string; status: 'mined' | 'reverted' | 'missing' | 'unreachable'; logs: Array<{ topics: string[]; data: string }> }
const cache = new Map<string, Tx>();
async function tx(chainId: number, hash: string): Promise<Tx> {
  const key = `${chainId}:${hash}`;
  if (cache.has(key)) return cache.get(key)!;
  let out: Tx = { to: null, input: '0x', status: 'unreachable', logs: [] };
  for (const url of RPCS[chainId] || []) {
    try {
      const call = async (method: string) => (await (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [hash] }) })).json()) as { result?: any };
      const [r, t] = await Promise.all([call('eth_getTransactionReceipt'), call('eth_getTransactionByHash')]);
      if (r.result === null) { out = { to: null, input: '0x', status: 'missing', logs: [] }; break; }
      if (r.result) { out = { to: lower(r.result.to), input: t.result?.input || '0x', status: r.result.status === '0x1' ? 'mined' : 'reverted', logs: r.result.logs || [] }; break; }
    } catch { /* next rpc */ }
  }
  cache.set(key, out);
  return out;
}
function decode(input: string): { name: string; args: Record<string, unknown> } | null {
  try { const d = HARDNESS.parseTransaction({ data: input }); return d ? { name: d.name, args: Object.fromEntries(d.fragment.inputs.map((i, k) => [i.name, d.args[k]])) } : null; } catch { return null; }
}
function bound(t: Tx, expectedTo: string, what: string, hash: string, extra = ''): boolean {
  const okTo = Boolean(t.to) && t.to === lower(expectedTo);
  const ok = t.status === 'mined' && okTo;
  line(ok, what, `${hash.slice(0, 12)}… ${t.status}${okTo ? '' : ` to=${t.to} expected ${lower(expectedTo).slice(0, 10)}…`}${extra}`);
  return ok;
}

(async () => {
  log(`verify proofs · ${p.ref}`);
  const ex = await resolveExclusions(p);
  // ---- Hardness ----
  const sessions = new Map<string, Record<string, unknown>>();
  for await (const page of rows<Record<string, unknown>>(p, 'hardness_agent_sessions', ['id'], 'session_id,symbol', 1000, exclusionFilter('hardness_agent_sessions', ex))) for (const s of page) sessions.set(String(s.session_id), s);
  let n = 0;
  for await (const page of rows<Record<string, unknown>>(p, 'hardness_agent_proofs', ['id'], '*', 1000, exclusionFilter('hardness_agent_proofs', ex))) {
    for (const r of page) {
      n += 1;
      const chainId = Number(r.chain_id) || 196;
      const registry = getChain(chainId).contracts.hardnessRegistry;
      const symbol = String(sessions.get(String(r.session_id))?.symbol || '');
      if (r.commit_tx_hash) {
        const t = await tx(chainId, String(r.commit_tx_hash));
        const d = decode(t.input);
        const same = d?.name === 'commitPrediction' && lower(d.args.predictionHash) === lower(r.prediction_hash);
        bound(t, registry, `hardness #${r.id}: commit tx bound to prediction_hash`, String(r.commit_tx_hash), d ? ` ${d.name}(${same ? 'hash matches' : 'HASH DIFFERS'})` : ' calldata undecodable');
        if (!same) failures += 1;
      }
      if (r.signal_tx_hash) {
        const t = await tx(chainId, String(r.signal_tx_hash));
        const d = decode(t.input);
        const sym = d?.name === 'publishSignal' && (!symbol || String(d.args.symbol).toUpperCase() === symbol.toUpperCase());
        bound(t, registry, `hardness #${r.id}: signal tx bound to the session (${symbol || 'symbol unknown'})`, String(r.signal_tx_hash), d ? ` ${d.name}(${String(d.args.symbol)}) context=${String(d.args.context).slice(0, 10)}…` : ' calldata undecodable');
        if (!sym) failures += 1;
      }
      if (r.resolve_tx_hash) {
        const t = await tx(chainId, String(r.resolve_tx_hash));
        const refs = t.input.toLowerCase().includes(lower(r.prediction_hash).slice(2));
        bound(t, registry, `hardness #${r.id}: resolve tx references prediction_hash`, String(r.resolve_tx_hash), refs ? '' : ' hash NOT in calldata');
        if (!refs) failures += 1;
      }
    }
  }
  log(`${n} hardness proof(s) checked (excluded agents: ${ex.agentIds.join(',') || 'none'})`);
  // ---- agent_events ----
  n = 0;
  for await (const page of rows<Record<string, unknown>>(p, 'agent_events', ['id'], 'id,payment_tx,trade_tx,meta,created_at', 1000, `&or=(payment_tx.not.is.null,trade_tx.not.is.null)${exclusionFilter('agent_events', ex)}`)) {
    for (const r of page) {
      const chainId = chainFor(r.created_at);
      const c = getChain(chainId).contracts;
      let meta: Record<string, unknown> = {};
      try { meta = typeof r.meta === 'string' ? JSON.parse(r.meta) : (r.meta as Record<string, unknown>) || {}; } catch { /* keep {} */ }
      const byName: Record<string, string> = { AgentEconomy: c.agentEconomy, TrackRecord: c.trackRecord, ConvictionOracle: c.convictionOracle, HardnessRegistry: c.hardnessRegistry, AdversarialBounties: c.adversarialBounties, AgentRegistry: c.agentRegistry };
      if (r.payment_tx) { n += 1; bound(await tx(chainId, String(r.payment_tx)), c.agentEconomy, `agent_events ${String(r.id).slice(0, 8)}: payment_tx bound to AgentEconomy(${chainId})`, String(r.payment_tx)); }
      if (r.trade_tx) {
        n += 1;
        const name = String(meta.contract || 'TrackRecord');
        const expected = byName[name] || c.trackRecord;
        bound(await tx(chainId, String(r.trade_tx)), expected, `agent_events ${String(r.id).slice(0, 8)}: trade_tx bound to ${name}(${chainId})`, String(r.trade_tx));
      }
    }
  }
  log(`agent_events: ${n} tx(s) checked`);
  // ---- agent_trades / forum_threads / mcp receipts ----
  n = 0;
  for await (const page of rows<Record<string, unknown>>(p, 'agent_trades', ['id'], 'id,chain,tx_hash', 1000, '&tx_hash=not.is.null')) for (const r of page) { n += 1; const chainId = Number(r.chain) || 196; bound(await tx(chainId, String(r.tx_hash)), getChain(chainId).contracts.trackRecord, `agent_trades ${String(r.id).slice(0, 8)}: tx bound to TrackRecord(${chainId})`, String(r.tx_hash)); }
  for await (const page of rows<Record<string, unknown>>(p, 'forum_threads', ['id'], 'id,resolution_tx_hash,created_at', 1000, '&resolution_tx_hash=not.is.null')) for (const r of page) {
    n += 1; const chainId = chainFor(r.created_at); const t = await tx(chainId, String(r.resolution_tx_hash));
    const id = String(r.id); const refs = t.input.toLowerCase().includes(keccak256(toUtf8Bytes(id)).slice(2)) || t.input.toLowerCase().includes(Buffer.from(id).toString('hex'));
    bound(t, getChain(chainId).contracts.trackRecord, `forum_threads ${id.slice(0, 8)}: resolution tx references the thread`, String(r.resolution_tx_hash), refs ? '' : ' thread id NOT in calldata'); if (!refs) failures += 1;
  }
  for await (const page of rows<Record<string, unknown>>(p, 'mcp_payment_receipts', ['tx_hash'], 'tx_hash,response_hash,chain_id,created_at')) for (const r of page) {
    n += 1; const chainId = Number(r.chain_id) || 196; const t = await tx(chainId, String(r.tx_hash));
    const rh = lower(r.response_hash).replace(/^0x/, ''); const inLogs = !rh || t.logs.some((l) => (l.data + l.topics.join('')).toLowerCase().includes(rh));
    bound(t, getChain(chainId).contracts.agentEconomy, `mcp_payment_receipts ${String(r.tx_hash).slice(0, 10)}: bound to AgentEconomy(${chainId})`, String(r.tx_hash), inLogs ? '' : ' response_hash NOT in logs'); if (!inLogs) failures += 1;
  }
  log(`agent_trades / forum_threads / mcp_payment_receipts: ${n} tx(s) checked`);
  console.log(failures ? `\nPROOFS FAILED: ${failures} problem(s).` : '\nPROOFS VERIFIED: every transaction is mined, at the expected contract, and bound to its row.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
