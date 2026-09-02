#!/usr/bin/env -S npx tsx
// ============================================================
// Export the approved tables from the source as NDJSON (one file per
// table, every column, pk order, UUIDs and timestamps verbatim). Pure
// PostgREST, so it needs only the service key — no database password.
// Files go to --dir (default .ai/migration/export/<ref>-<timestamp>/),
// which is gitignored; they contain private rows.
// ============================================================
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APPROVED_TABLES } from './tables.js';
import { count, log, project, RollingHash, rows } from './lib.js';

const args = process.argv.slice(2);
const p = project('source');
const dir = args[args.indexOf('--dir') + 1] || join('.ai/migration/export', `${p.ref}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(dir, { recursive: true });

(async () => {
  log(`export · ${p.ref} → ${dir}`);
  const index: Record<string, { rows: number; sha256: string; file: string }> = {};
  for (const t of APPROVED_TABLES) {
    const n = await count(p, t.name);
    if (n === null) { log(`${t.name}: missing on source, skipped`); continue; }
    const file = join(dir, `${t.name}.ndjson`);
    const ws = createWriteStream(file);
    const hash = new RollingHash();
    for await (const page of rows(p, t.name, t.pk)) for (const row of page) { hash.add(row); ws.write(`${JSON.stringify(row)}\n`); }
    await new Promise<void>((res) => ws.end(res));
    const d = hash.digest();
    index[t.name] = { rows: d.rows, sha256: d.sha256, file };
    log(`${t.name.padEnd(30)} ${String(d.rows).padStart(7)} rows`);
  }
  writeFileSync(join(dir, 'index.json'), JSON.stringify({ ref: p.ref, exportedAt: new Date().toISOString(), tables: index }, null, 2));
  log(`done → ${dir}/index.json`);
})().catch((e) => { console.error(e); process.exit(1); });
