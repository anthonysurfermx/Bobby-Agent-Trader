#!/usr/bin/env -S npx tsx
// ============================================================
// Import an export directory into the target, in FK-safe order, preserving
// every primary key (PostgREST upsert on the pk, merge-duplicates). Batches
// of 500. Idempotent: re-running upserts the same rows. `--dry-run` only
// checks that every table exists on the target and prints the plan.
// Refuses to run unless the target ref differs from the source ref recorded
// in the export (never import a project into itself).
// ============================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_TABLES } from './tables.js';
import { count, headers, log, project } from './lib.js';

const args = process.argv.slice(2);
const dir = args[args.indexOf('--dir') + 1];
const dryRun = args.includes('--dry-run');
if (!dir) { console.error('--dir <export directory> is required'); process.exit(2); }
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as { ref: string; tables: Record<string, { rows: number; file: string }> };
const p = project('target');
if (index.ref === p.ref) { console.error(`refusing: export came from ${index.ref} and the target is the same project`); process.exit(2); }

(async () => {
  log(`import · ${index.ref} → ${p.ref}${dryRun ? ' (dry run)' : ''}`);
  let missing = 0;
  for (const t of APPROVED_TABLES) {
    const entry = index.tables[t.name];
    if (!entry) continue;
    const existing = await count(p, t.name);
    if (existing === null) { log(`${t.name.padEnd(30)} MISSING on target — apply the schema first`); missing += 1; continue; }
    log(`${t.name.padEnd(30)} ${String(entry.rows).padStart(7)} rows to upsert (target has ${existing})`);
    if (dryRun) continue;
    const lines = readFileSync(entry.file, 'utf8').split('\n').filter(Boolean);
    for (let i = 0; i < lines.length; i += 500) {
      const batch = lines.slice(i, i + 500).map((l) => JSON.parse(l));
      const r = await fetch(`${p.url}/rest/v1/${t.name}?on_conflict=${t.pk.join(',')}`, {
        method: 'POST', headers: headers(p, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(batch),
      });
      if (!r.ok) { console.error(`${t.name} batch ${i / 500}: HTTP ${r.status} ${await r.text()}`); process.exit(1); }
    }
  }
  if (missing) { console.error(`${missing} table(s) missing on the target — nothing else was imported for them`); process.exit(dryRun ? 0 : 1); }
  log(dryRun ? 'plan ok — every table exists on the target' : 'import complete — now run sequences.sql and verify.mts');
})().catch((e) => { console.error(e); process.exit(1); });
