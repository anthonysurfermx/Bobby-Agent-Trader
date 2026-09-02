#!/usr/bin/env -S npx tsx
// ============================================================
// T0 manifest — what a project holds for the approved tables, right now:
// exact row count, sha256 over every row (canonical JSON, pk order), pk
// range, created_at span, proof-column coverage. Run it on the source at
// T0 (writes frozen), on the target after the restore, and diff the two
// with verify.mts. Exit 0 always; the verdict belongs to verify.
//
//   SOURCE_SUPABASE_URL=… SOURCE_SUPABASE_SERVICE_KEY=… \
//   npx tsx scripts/migration/t0-manifest.mts --side source --out .ai/migration/t0-source.json
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { APPROVED_TABLES } from './tables.js';
import { count, log, project, RollingHash, rows, type Side } from './lib.js';

const args = process.argv.slice(2);
const side = (args[args.indexOf('--side') + 1] || 'source') as Side;
const out = args[args.indexOf('--out') + 1] || `.ai/migration/t0-${side}.json`;
const p = project(side);

interface TableManifest { table: string; exists: boolean; rows: number; sha256: string | null; pkMin?: string; pkMax?: string; createdMin?: string; createdMax?: string; proofs?: Record<string, number> }

(async () => {
  log(`T0 manifest · ${side} · ${p.ref}`);
  const tables: TableManifest[] = [];
  let total = 0;
  for (const t of APPROVED_TABLES) {
    const n = await count(p, t.name);
    if (n === null) { tables.push({ table: t.name, exists: false, rows: 0, sha256: null }); log(`${t.name.padEnd(30)} MISSING`); continue; }
    const hash = new RollingHash();
    let pkMin: string | undefined; let pkMax: string | undefined; let createdMin: string | undefined; let createdMax: string | undefined;
    const proofs: Record<string, number> = {};
    for (const c of t.proofColumns || []) proofs[c] = 0;
    for await (const page of rows(p, t.name, t.pk)) {
      for (const row of page) {
        hash.add(row);
        const k = t.pk.map((c) => String(row[c])).join('|');
        if (pkMin === undefined || k < pkMin) pkMin = k;
        if (pkMax === undefined || k > pkMax) pkMax = k;
        const ca = row.created_at as string | undefined;
        if (ca) { if (!createdMin || ca < createdMin) createdMin = ca; if (!createdMax || ca > createdMax) createdMax = ca; }
        for (const c of t.proofColumns || []) if (row[c]) proofs[c] += 1;
      }
    }
    const d = hash.digest();
    if (d.rows !== n) log(`WARN ${t.name}: count=${n} but streamed ${d.rows} rows (writes in flight? not frozen?)`);
    tables.push({ table: t.name, exists: true, rows: d.rows, sha256: d.sha256, pkMin, pkMax, createdMin, createdMax, proofs: Object.keys(proofs).length ? proofs : undefined });
    total += d.rows;
    log(`${t.name.padEnd(30)} ${String(d.rows).padStart(7)}  ${d.sha256.slice(0, 16)}…${Object.keys(proofs).length ? `  proofs=${JSON.stringify(proofs)}` : ''}`);
  }
  const manifest = { side, ref: p.ref, takenAt: new Date().toISOString(), tables, totalRows: total };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  log(`total ${total} rows across ${tables.filter((t) => t.exists).length}/${tables.length} tables → ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
