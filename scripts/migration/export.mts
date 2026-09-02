#!/usr/bin/env -S npx tsx
// ============================================================
// Export the approved tables from the source as NDJSON (one file per
// table, every column, pk order, UUIDs and timestamps verbatim), applying
// the shared exclusions. Pure PostgREST — no database password.
// FAIL-CLOSED WITHOUT RESIDUE (Codex): a missing table or a streamed count
// different from the exact count aborts with exit 1 AND deletes every file
// written so far — no partial private rows are left on disk, and no
// index.json means nothing can be imported. Files go to --dir (default
// .ai/migration/export/<ref>-<timestamp>/, gitignored).
// ============================================================
import { createWriteStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_TABLES } from './tables.js';
import { exclusionFilter, resolveExclusions } from './exclusions.js';
import { count, log, project, RollingHash, rows } from './lib.js';

const args = process.argv.slice(2);
const p = project('source');
const dir = args[args.indexOf('--dir') + 1] || join('.ai/migration/export', `${p.ref}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(dir, { recursive: true });

function abort(problems: string[]): never {
  rmSync(dir, { recursive: true, force: true });
  console.error(`\nEXPORT FAILED — ${dir} removed, nothing can be imported:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

(async () => {
  log(`export · ${p.ref} → ${dir}`);
  const ex = await resolveExclusions(p);
  log(`exclusions: agents=[${ex.agentIds.join(',')}] sessions=${ex.sessionIds.length}`);
  const index: Record<string, { rows: number; sha256: string; file: string }> = {};
  const problems: string[] = [];
  for (const t of APPROVED_TABLES) {
    const filter = exclusionFilter(t.name, ex);
    const n = await count(p, t.name, filter);
    if (n === null) { problems.push(`${t.name}: missing on source`); log(`${t.name.padEnd(30)} MISSING`); continue; }
    const file = join(dir, `${t.name}.ndjson`);
    const ws = createWriteStream(file);
    const hash = new RollingHash();
    for await (const page of rows(p, t.name, t.pk, '*', 1000, filter)) for (const row of page) { hash.add(row); ws.write(`${JSON.stringify(row)}\n`); }
    await new Promise<void>((res) => ws.end(res));
    const d = hash.digest();
    if (d.rows !== n) problems.push(`${t.name}: exact count ${n} but exported ${d.rows} rows`);
    index[t.name] = { rows: d.rows, sha256: d.sha256, file: `${t.name}.ndjson` };
    log(`${t.name.padEnd(30)} ${String(d.rows).padStart(7)} rows${d.rows !== n ? `  ≠ count ${n}` : ''}`);
  }
  if (problems.length) abort(problems);
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ ref: p.ref, exportedAt: new Date().toISOString(), exclusions: ex, tables: index }, null, 2));
  log(`done → ${dir}/index.json`);
})().catch((e) => { abort([String(e)]); });
