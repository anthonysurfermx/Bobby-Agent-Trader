#!/usr/bin/env -S npx tsx
// ============================================================
// Verify a restore. Exit 0 = VERIFIED, 1 = mismatches, 2 = usage.
//   · source vs target manifests: existence, row count, row hash, and one
//     hash PER PROOF COLUMN (values, not just non-null counts)
//   · a target manifest taken with --allow-missing is refused
//   · orphans on every declared FK (target)
//   · identity sequences on the target via bobby_sequence_check():
//     last_value ≥ max(id), and a real nextval() strictly above max(id)
//   · optional --expect-outbox: exactly the approved tables carry the
//     capture trigger (bobby_outbox_status)
//   npx tsx scripts/migration/verify.mts --source t0-source.json --target t0-target.json [--expect-outbox]
// TARGET_SUPABASE_* must be set.
// ============================================================
import { readFileSync } from 'node:fs';
import { APPROVED_TABLES, IDENTITY_TABLES, outboxPlan } from './tables.js';
import { exclusionFilter, resolveExclusions } from './exclusions.js';
import { count, log, project, rows, rpc } from './lib.js';

const args = process.argv.slice(2);
const src = args[args.indexOf('--source') + 1];
const tgt = args[args.indexOf('--target') + 1];
const expectOutbox = args.includes('--expect-outbox');
if (!src || !tgt) { console.error('--source and --target manifest paths are required'); process.exit(2); }
interface Proof { nonNull: number; sha256: string }
interface M { ref: string; allowMissing?: boolean; exclusions?: { agentIds: string[]; sessionIds: string[] }; tables: Array<{ table: string; exists: boolean; rows: number; sha256: string | null; proofs?: Record<string, Proof> }> }
const a = JSON.parse(readFileSync(src, 'utf8')) as M;
const b = JSON.parse(readFileSync(tgt, 'utf8')) as M;
let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail}` : ''}`); };

(async () => {
  log(`verify · ${a.ref} → ${b.ref}`);
  line(a.ref !== b.ref, 'manifests come from two different projects', `${a.ref} vs ${b.ref}`);
  line(!a.allowMissing, 'source manifest was taken fail-closed (no --allow-missing)');
  line(!b.allowMissing, 'target manifest was taken fail-closed (no --allow-missing)');
  line(JSON.stringify(a.exclusions?.agentIds) === JSON.stringify(b.exclusions?.agentIds), 'both manifests applied the same exclusion set', `${JSON.stringify(a.exclusions?.agentIds)} vs ${JSON.stringify(b.exclusions?.agentIds)}`);
  for (const t of APPROVED_TABLES) {
    const s = a.tables.find((x) => x.table === t.name);
    const d = b.tables.find((x) => x.table === t.name);
    line(Boolean(s?.exists), `${t.name}: exists on source`);
    line(Boolean(d?.exists), `${t.name}: exists on target`);
    if (!s?.exists || !d?.exists) continue;
    line(s.rows === d.rows, `${t.name}: row count ${s.rows} = ${d.rows}`);
    line(s.sha256 === d.sha256, `${t.name}: row hash identical`, s.sha256 === d.sha256 ? '' : `${s.sha256?.slice(0, 12)} vs ${d.sha256?.slice(0, 12)}`);
    for (const [c, sp] of Object.entries(s.proofs || {})) {
      const dp = (d.proofs || {})[c];
      line(Boolean(dp) && dp.sha256 === sp.sha256 && dp.nonNull === sp.nonNull, `${t.name}.${c}: proof values identical (${sp.nonNull} non-null)`, dp ? `target ${dp.nonNull} non-null, ${dp.sha256.slice(0, 12)} vs ${sp.sha256.slice(0, 12)}` : 'missing on target');
    }
  }
  const p = project('target');
  const ex = await resolveExclusions(p);
  // Orphans on the target: every FK value must exist in its parent (excluded rows must be absent).
  for (const t of APPROVED_TABLES) {
    for (const fk of t.fks) {
      const [col, parentRef] = fk.split('->');
      const [parent, parentCol] = parentRef.split('.');
      if ((await count(p, t.name)) === null || (await count(p, parent)) === null) { line(false, `${t.name}.${col} → ${parent}.${parentCol}: cannot check orphans`, 'table missing on target'); continue; }
      const parentKeys = new Set<string>();
      for await (const page of rows<Record<string, unknown>>(p, parent, [parentCol], parentCol, 1000, exclusionFilter(parent, ex))) for (const r of page) parentKeys.add(String(r[parentCol]));
      let orphans = 0; let total = 0;
      for await (const page of rows<Record<string, unknown>>(p, t.name, t.pk, `${t.pk.join(',')},${col}`, 1000, exclusionFilter(t.name, ex))) for (const r of page) { if (r[col] === null || r[col] === undefined) continue; total += 1; if (!parentKeys.has(String(r[col]))) orphans += 1; }
      line(orphans === 0, `${t.name}.${col} → ${parent}.${parentCol}: no orphans`, `${total} refs, ${orphans} orphan(s)`);
    }
  }
  // Identity sequences: real nextval() above max(id) on every identity table.
  const seq = await rpc<Array<{ table_name: string; max_id: number | null; last_value: number | null; next_value: number; ok: boolean }>>(p, 'bobby_sequence_check');
  if (seq.status !== 200 || !Array.isArray(seq.body)) {
    line(false, 'bobby_sequence_check() available on target', `HTTP ${seq.status} — apply 20260903000003_migration_outbox.sql`);
  } else {
    for (const t of IDENTITY_TABLES) {
      const r = seq.body.find((x) => x.table_name === t.name);
      line(Boolean(r) && r!.ok, `${t.name}: sequence beyond max(id)`, r ? `max=${r.max_id} last=${r.last_value} nextval=${r.next_value}` : 'not reported');
    }
  }
  // Outbox coverage (only when the journal is expected to be armed).
  if (expectOutbox) {
    const st = await rpc<Array<{ table_name: string; pk_columns: string | null }>>(p, 'bobby_outbox_status');
    const plan = outboxPlan();
    const armed = new Map(Array.isArray(st.body) ? st.body.map((x) => [x.table_name, x.pk_columns || '']) : []);
    const missing = Object.keys(plan).filter((x) => !armed.has(x)); const extra = [...armed.keys()].filter((x) => !(x in plan));
    const wrongPk = Object.entries(plan).filter(([t, pk]) => armed.has(t) && armed.get(t) !== pk).map(([t]) => t);
    line(st.status === 200 && missing.length === 0 && extra.length === 0 && wrongPk.length === 0, `outbox triggers cover exactly the ${Object.keys(plan).length} journaled tables (control plane excluded) with the right pk columns`, `armed=${armed.size} missing=[${missing.join(',')}] extra=[${extra.join(',')}] wrongPk=[${wrongPk.join(',')}]`);
    // Excluded rows must not exist on the target at all.
    for (const [table, key, values] of [['hardness_agents', 'agent_id', ex.agentIds], ['hardness_agent_sessions', 'agent_id', ex.agentIds]] as const) {
      if (!values.length) continue;
      const n = await count(p, table, `&${key}=in.(${values.map((v) => `"${v}"`).join(',')})`);
      line(n === 0, `${table}: no excluded ${key} present on target`, `found=${n}`);
    }
  }
  console.log(failures ? `\nVERIFY FAILED: ${failures} problem(s).` : '\nVERIFIED: counts, row hashes, proof values, references and sequences match.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
