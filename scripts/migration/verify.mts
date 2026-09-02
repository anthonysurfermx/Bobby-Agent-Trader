#!/usr/bin/env -S npx tsx
// ============================================================
// Verify a restore: source manifest vs target manifest (counts and row
// hashes per table), orphan checks on every declared FK (target), and
// proof-column coverage (on-chain hashes must be present on the target in
// the same number). Exit 0 = VERIFIED, 1 = mismatches, 2 = usage.
//
//   npx tsx scripts/migration/verify.mts --source .ai/migration/t0-source.json --target .ai/migration/t0-target.json
// TARGET_SUPABASE_* must be set for the orphan checks.
// ============================================================
import { readFileSync } from 'node:fs';
import { APPROVED_TABLES } from './tables.js';
import { count, log, project, rows } from './lib.js';

const args = process.argv.slice(2);
const src = args[args.indexOf('--source') + 1];
const tgt = args[args.indexOf('--target') + 1];
if (!src || !tgt) { console.error('--source and --target manifest paths are required'); process.exit(2); }
interface M { ref: string; tables: Array<{ table: string; exists: boolean; rows: number; sha256: string | null; proofs?: Record<string, number> }> }
const a = JSON.parse(readFileSync(src, 'utf8')) as M;
const b = JSON.parse(readFileSync(tgt, 'utf8')) as M;
let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail}` : ''}`); };

(async () => {
  log(`verify · ${a.ref} → ${b.ref}`);
  line(a.ref !== b.ref, 'manifests come from two different projects', `${a.ref} vs ${b.ref}`);
  for (const t of APPROVED_TABLES) {
    const s = a.tables.find((x) => x.table === t.name);
    const d = b.tables.find((x) => x.table === t.name);
    if (!s?.exists) { line(true, `${t.name}: absent on source, nothing to copy`); continue; }
    line(Boolean(d?.exists), `${t.name}: exists on target`);
    if (!d?.exists) continue;
    line(s.rows === d.rows, `${t.name}: row count ${s.rows} = ${d.rows}`);
    line(s.sha256 === d.sha256, `${t.name}: row hash identical`, s.sha256 === d.sha256 ? '' : `${s.sha256?.slice(0, 12)} vs ${d.sha256?.slice(0, 12)}`);
    for (const [c, n] of Object.entries(s.proofs || {})) line((d.proofs || {})[c] === n, `${t.name}.${c}: ${n} on-chain proofs preserved`, `target=${(d.proofs || {})[c]}`);
  }
  // Orphans on the target: every FK value must exist in its parent.
  const p = project('target');
  for (const t of APPROVED_TABLES) {
    for (const fk of t.fks) {
      const [col, parentRef] = fk.split('->');
      const [parent, parentCol] = parentRef.split('.');
      if ((await count(p, t.name)) === null || (await count(p, parent)) === null) { line(false, `${t.name}.${col} → ${parent}.${parentCol}: cannot check orphans`, 'table missing on target'); continue; }
      const parentKeys = new Set<string>();
      for await (const page of rows<Record<string, unknown>>(p, parent, [parentCol], parentCol)) for (const r of page) parentKeys.add(String(r[parentCol]));
      let orphans = 0; let total = 0;
      for await (const page of rows<Record<string, unknown>>(p, t.name, t.pk, `${t.pk.join(',')},${col}`)) for (const r of page) { if (r[col] === null || r[col] === undefined) continue; total += 1; if (!parentKeys.has(String(r[col]))) orphans += 1; }
      line(orphans === 0, `${t.name}.${col} → ${parent}.${parentCol}: no orphans`, `${total} refs, ${orphans} orphan(s)`);
    }
  }
  // Identity sequences: the next id must be above the max id copied.
  for (const t of APPROVED_TABLES.filter((x) => x.identity)) {
    const n = await count(p, t.name);
    line(n !== null, `${t.name}: identity table present (run sequences.sql after the copy)`);
  }
  console.log(failures ? `\nVERIFY FAILED: ${failures} problem(s).` : '\nVERIFIED: counts, hashes, proofs and references match.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
