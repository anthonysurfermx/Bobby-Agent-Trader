#!/usr/bin/env -S npx tsx
// ============================================================
// T0 manifest — what a project holds for the approved tables, right now:
// exact row count, sha256 over every row (canonical JSON, pk order), one
// sha256 per proof column (values in pk order, nulls included), pk bounds
// (hashed for pii tables), created_at span.
//
// FAIL-CLOSED (Codex review): a table missing on the side being measured,
// or a streamed row count different from the exact count header, ends the
// run with exit 1 and NO manifest is written — an incomplete snapshot must
// never be certifiable. The only exception is `--allow-missing`, meant for
// the destination BEFORE the schema exists (baseline measurement); it is
// recorded in the manifest and verify.mts refuses such a manifest as a
// restore target.
//
//   SOURCE_SUPABASE_URL=… SOURCE_SUPABASE_SERVICE_KEY=… \
//   npx tsx scripts/migration/t0-manifest.mts --side source --out .ai/migration/t0-source.json
// ============================================================
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { APPROVED_TABLES } from './tables.js';
import { canonical, count, log, project, RollingHash, rows, sha256, type Side } from './lib.js';
import { exclusionFilter, resolveExclusions } from './exclusions.js';

const args = process.argv.slice(2);
const sideArg = args[args.indexOf('--side') + 1];
if (sideArg !== 'source' && sideArg !== 'target') { console.error('--side source|target is required'); process.exit(2); }
const side = sideArg as Side;
const out = args[args.indexOf('--out') + 1] || `.ai/migration/t0-${side}.json`;
const allowMissing = args.includes('--allow-missing');
const p = project(side);

export interface TableManifest {
  table: string; exists: boolean; rows: number; sha256: string | null;
  pkMinHash?: string; pkMaxHash?: string; pkMin?: string; pkMax?: string;
  createdMin?: string; createdMax?: string;
  proofs?: Record<string, { nonNull: number; sha256: string }>;
}

(async () => {
  log(`T0 manifest · ${side} · ${p.ref}${allowMissing ? ' · --allow-missing (baseline only, not a restore target)' : ''}`);
  const tables: TableManifest[] = [];
  let total = 0;
  const problems: string[] = [];
  const ex = await resolveExclusions(p);
  log(`exclusions: agents=[${ex.agentIds.join(',')}] sessions=${ex.sessionIds.length}`);
  for (const t of APPROVED_TABLES) {
    const filter = exclusionFilter(t.name, ex);
    const n = await count(p, t.name, filter);
    if (n === null) {
      tables.push({ table: t.name, exists: false, rows: 0, sha256: null });
      log(`${t.name.padEnd(30)} MISSING`);
      if (!allowMissing) problems.push(`${t.name}: missing`);
      continue;
    }
    const hash = new RollingHash();
    const proofHashes: Record<string, ReturnType<typeof createHash>> = {};
    const proofNonNull: Record<string, number> = {};
    for (const c of t.proofColumns || []) { proofHashes[c] = createHash('sha256'); proofNonNull[c] = 0; }
    let pkMin: string | undefined; let pkMax: string | undefined; let createdMin: string | undefined; let createdMax: string | undefined;
    for await (const page of rows(p, t.name, t.pk, '*', 1000, filter)) {
      for (const row of page) {
        hash.add(row);
        const k = t.pk.map((c) => String(row[c])).join('|');
        if (pkMin === undefined || k < pkMin) pkMin = k;
        if (pkMax === undefined || k > pkMax) pkMax = k;
        const ca = row.created_at as string | undefined;
        if (ca) { if (!createdMin || ca < createdMin) createdMin = ca; if (!createdMax || ca > createdMax) createdMax = ca; }
        for (const c of t.proofColumns || []) { proofHashes[c].update(canonical(row[c] ?? null)); proofHashes[c].update('\n'); if (row[c]) proofNonNull[c] += 1; }
      }
    }
    const d = hash.digest();
    if (d.rows !== n) problems.push(`${t.name}: exact count ${n} but streamed ${d.rows} rows (writes in flight — is the freeze on?)`);
    const proofs = Object.fromEntries(Object.entries(proofHashes).map(([c, h]) => [c, { nonNull: proofNonNull[c], sha256: h.digest('hex') }]));
    const bounds = t.pii
      ? { pkMinHash: pkMin === undefined ? undefined : sha256(pkMin), pkMaxHash: pkMax === undefined ? undefined : sha256(pkMax) }
      : { pkMin, pkMax };
    tables.push({ table: t.name, exists: true, rows: d.rows, sha256: d.sha256, ...bounds, createdMin, createdMax, proofs: Object.keys(proofs).length ? proofs : undefined });
    total += d.rows;
    log(`${t.name.padEnd(30)} ${String(d.rows).padStart(7)}  ${d.sha256.slice(0, 16)}…${Object.keys(proofs).length ? `  proofs=${Object.entries(proofs).map(([c, v]) => `${c}:${v.nonNull}`).join(',')}` : ''}`);
  }
  if (problems.length) {
    console.error(`\nT0 MANIFEST FAILED — nothing written:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  const manifest = { side, ref: p.ref, takenAt: new Date().toISOString(), allowMissing, exclusions: ex, tables, totalRows: total };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  log(`total ${total} rows across ${tables.filter((t) => t.exists).length}/${tables.length} tables → ${out}`);
})().catch((e) => { console.error(e); process.exit(1); });
