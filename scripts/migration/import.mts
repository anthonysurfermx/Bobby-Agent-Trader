#!/usr/bin/env -S npx tsx
// ============================================================
// Import an export directory into the target, in FK-safe order, preserving
// every primary key (PostgREST upsert on the pk). Batches of 500.
// BEFORE ANY WRITE (Codex): the index must list every approved table, and
// every NDJSON file is re-read and re-hashed — row count and sha256 must
// equal the index. Any deviation aborts with exit 1 and nothing is written.
// Refuses to import a project into itself. `--dry-run` runs every check
// and prints the plan.
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_TABLES } from './tables.js';
import { count, headers, log, project, RollingHash } from './lib.js';

const args = process.argv.slice(2);
const dir = args[args.indexOf('--dir') + 1];
const dryRun = args.includes('--dry-run');
if (!dir) { console.error('--dir <export directory> is required'); process.exit(2); }
if (!existsSync(join(dir, 'index.json'))) { console.error(`refusing: ${dir} has no index.json (failed or partial export)`); process.exit(2); }
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { ref: string; tables: Record<string, { rows: number; sha256: string; file: string }> };
const p = project('target');
if (index.ref === p.ref) { console.error(`refusing: export came from ${index.ref} and the target is the same project`); process.exit(2); }

(async () => {
  log(`import · ${index.ref} → ${p.ref}${dryRun ? ' (dry run)' : ''}`);
  const problems: string[] = [];
  const plan: Array<{ table: string; lines: string[]; existing: number }> = [];
  // 1. completeness + integrity, before touching the target
  for (const t of APPROVED_TABLES) {
    const entry = index.tables[t.name];
    if (!entry) { problems.push(`${t.name}: not in the export index`); continue; }
    const file = join(dir, entry.file);
    if (!existsSync(file)) { problems.push(`${t.name}: file ${entry.file} missing`); continue; }
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
    const hash = new RollingHash();
    for (const l of lines) hash.add(JSON.parse(l));
    const d = hash.digest();
    if (d.rows !== entry.rows || d.sha256 !== entry.sha256) { problems.push(`${t.name}: file does not match the index (rows ${d.rows}/${entry.rows}, sha ${d.sha256.slice(0, 10)}/${entry.sha256.slice(0, 10)})`); continue; }
    const existing = await count(p, t.name);
    if (existing === null) { problems.push(`${t.name}: missing on target — apply the schema first`); continue; }
    plan.push({ table: t.name, lines, existing });
  }
  for (const name of Object.keys(index.tables)) if (!APPROVED_TABLES.some((t) => t.name === name)) problems.push(`${name}: in the index but not approved`);
  if (problems.length) { console.error(`\nIMPORT REFUSED — nothing written:\n  ${problems.join('\n  ')}`); process.exit(1); }
  for (const item of plan) log(`${item.table.padEnd(30)} ${String(item.lines.length).padStart(7)} rows verified (target has ${item.existing})`);
  if (dryRun) { log('plan ok — index complete, every file matches, every table exists on the target'); return; }
  // 2. write, in FK order
  for (const item of plan) {
    const t = APPROVED_TABLES.find((x) => x.name === item.table)!;
    for (let i = 0; i < item.lines.length; i += 500) {
      const batch = item.lines.slice(i, i + 500).map((l) => JSON.parse(l));
      const r = await fetch(`${p.url}/rest/v1/${t.name}?on_conflict=${t.pk.join(',')}`, { method: 'POST', headers: headers(p, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(batch) });
      if (!r.ok) { console.error(`${t.name} batch ${i / 500}: HTTP ${r.status} ${await r.text()} — import stopped; rerun after fixing (upserts are idempotent)`); process.exit(1); }
    }
    log(`${t.name.padEnd(30)} ${String(item.lines.length).padStart(7)} rows upserted`);
  }
  log('import complete — now sequences.sql, then t0-manifest --side target and verify.mts');
})().catch((e) => { console.error(e); process.exit(1); });
