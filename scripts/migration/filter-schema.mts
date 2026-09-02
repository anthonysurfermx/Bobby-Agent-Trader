#!/usr/bin/env -S npx tsx
// ============================================================
// Reduce a `pg_dump --schema-only --no-owner --no-privileges -n public`
// of the legacy project to exactly what Bobby needs on the destination:
// the approved tables (+ SCHEMA_ONLY_TABLES) with ALL their constraints,
// indexes, defaults, sequences, RLS state and policies, the triggers on
// them plus the functions those triggers call, the Bobby RPCs, and any
// user type a kept column uses. Everything else (DeFi México product
// tables, their functions, views, triggers) is dropped. FK constraints are
// kept only when both sides are kept. Nothing is rewritten — kept objects
// are copied verbatim, so the result is the exact legacy DDL.
//
//   npx tsx scripts/migration/filter-schema.mts --in legacy-schema.sql --out <migration.sql>
// Prints a report of kept / dropped objects; exits 1 if an approved table
// is absent from the dump.
// ============================================================
import { readFileSync, writeFileSync } from 'node:fs';
import { APPROVED_TABLES, SCHEMA_ONLY_TABLES } from './tables.js';

const args = process.argv.slice(2);
const inFile = args[args.indexOf('--in') + 1];
const outFile = args[args.indexOf('--out') + 1];
if (!inFile || !outFile) { console.error('--in and --out are required'); process.exit(2); }

const KEEP_TABLES = new Set([...APPROVED_TABLES.map((t) => t.name), ...SCHEMA_ONLY_TABLES.filter((t) => t !== 'migration_outbox')]);
const KEEP_FUNCTIONS = new Set(['bobby_publish_debate', 'bobby_rls_matrix', 'bobby_rls_status', 'bobby_control_touch']);

interface Obj { name: string; type: string; body: string }
const src = readFileSync(inFile, 'utf8');
const parts = src.split(/^(?=-- Name: )/m);
const preamble = parts.shift() || '';
const objects: Obj[] = parts.map((chunk) => {
  const m = chunk.match(/^-- Name: (.*?); Type: ([A-Z ]+); Schema: (\S+);/);
  return { name: m?.[1] || '?', type: m?.[2] || '?', body: chunk };
});

const tableOf = (o: Obj): string | null => {
  const b = o.body;
  switch (o.type) {
    case 'TABLE': return o.name;
    case 'ROW SECURITY': return o.name;
    case 'CONSTRAINT': case 'FK CONSTRAINT': return b.match(/ALTER TABLE ONLY public\.("?[\w]+"?)/)?.[1]?.replace(/"/g, '') ?? null;
    // serial defaults use `ALTER TABLE ONLY`; identity columns use `ALTER TABLE` (no ONLY) — both are DEFAULT objects
    case 'DEFAULT': return b.match(/ALTER TABLE (?:ONLY )?public\.("?[\w]+"?)/)?.[1]?.replace(/"/g, '') ?? null;
    case 'INDEX': return b.match(/ON public\.("?[\w]+"?)/)?.[1]?.replace(/"/g, '') ?? null;
    case 'POLICY': return b.match(/ON public\.("?[\w]+"?)/)?.[1]?.replace(/"/g, '') ?? null;
    case 'TRIGGER': return b.match(/ON public\.("?[\w]+"?)/)?.[1]?.replace(/"/g, '') ?? null;
    case 'SEQUENCE OWNED BY': return b.match(/OWNED BY public\.("?[\w]+"?)\./)?.[1]?.replace(/"/g, '') ?? null;
    // identity columns: pg_dump emits `ALTER TABLE public.t ALTER COLUMN id ADD GENERATED … AS IDENTITY (SEQUENCE NAME …)` as a SEQUENCE object
    case 'SEQUENCE': return b.match(/ALTER TABLE (?:ONLY )?public\.("?[\w]+"?) ALTER COLUMN \w+ ADD GENERATED/)?.[1]?.replace(/"/g, '') ?? null;
    default: return null;
  }
};

// 1. tables and everything hanging off them
const kept: Obj[] = []; const dropped: Obj[] = [];
// FK targets: a public table (kept only if that table is kept) or auth.users
// (every Supabase project has it; legacy rows referencing it: 0 on 2026-09-03,
// so the constraint is kept verbatim and can never block the import).
const fkTarget = (o: Obj) => {
  if (/REFERENCES auth\.users\(/.test(o.body)) return 'auth.users';
  return o.body.match(/REFERENCES public\.("?[\w]+"?)/)?.[1]?.replace(/"/g, '') ?? null;
};
for (const o of objects) {
  const t = tableOf(o);
  if (t && KEEP_TABLES.has(t)) {
    if (o.type === 'FK CONSTRAINT') { const tgt = fkTarget(o) || ''; if (tgt !== 'auth.users' && !KEEP_TABLES.has(tgt)) { dropped.push(o); continue; } }
    kept.push(o);
  }
}
// 2. sequences owned by kept tables
const ownedSeqs = new Set(kept.filter((o) => o.type === 'SEQUENCE OWNED BY').map((o) => o.name));
for (const o of objects) if (o.type === 'SEQUENCE' && ownedSeqs.has(o.name)) kept.push(o);
// 3. functions: Bobby RPCs + whatever kept triggers execute
const triggerFns = new Set(kept.filter((o) => o.type === 'TRIGGER').map((o) => o.body.match(/EXECUTE FUNCTION public\.(\w+)\(/)?.[1]).filter(Boolean) as string[]);
for (const o of objects) {
  if (o.type !== 'FUNCTION') continue;
  const fn = o.name.replace(/\(.*$/, '');
  if (KEEP_FUNCTIONS.has(fn) || triggerFns.has(fn)) kept.push(o);
}
// 4. user types referenced by kept table columns
const keptTableBodies = kept.filter((o) => o.type === 'TABLE').map((o) => o.body).join('\n');
for (const o of objects) if (o.type === 'TYPE' && new RegExp(`public\\.${o.name}\\b`).test(keptTableBodies)) kept.push(o);
for (const o of objects) if (!kept.includes(o) && !dropped.includes(o)) dropped.push(o);

// order: preserve dump order (dependencies already sorted by pg_dump)
const orderIndex = new Map(objects.map((o, i) => [o, i]));
kept.sort((a, b) => orderIndex.get(a)! - orderIndex.get(b)!);

const missing = [...KEEP_TABLES].filter((t) => !kept.some((o) => o.type === 'TABLE' && o.name === t));
// Extensions the kept DDL depends on. `pg_dump -n public` never emits CREATE
// EXTENSION, and the legacy project installed pgvector INTO public
// (agent_memory.embedding vector(1536) + an ivfflat index). Detected from the
// kept bodies so a future dependency cannot slip through silently.
const keptText = kept.map((o) => o.body).join('\n');
const extensions: string[] = [];
if (/public\.vector\(|vector_cosine_ops|vector_l2_ops/.test(keptText)) extensions.push('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;');
if (/uuid_generate_v[0-9]\(/.test(keptText)) extensions.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;');
if (/gin_trgm_ops|gist_trgm_ops/.test(keptText)) extensions.push('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;');
const header = `-- ============================================================
-- Bobby Protocol schema — EXACT copy of the legacy DDL (pg_dump 18.4,
-- --schema-only --no-owner --no-privileges, ${new Date().toISOString().slice(0, 10)}), reduced by
-- scripts/migration/filter-schema.mts to the ${KEEP_TABLES.size} tables Bobby uses plus their
-- constraints, indexes, defaults, sequences, RLS, policies, triggers, the
-- functions those triggers call, and the Bobby RPCs. Kept objects are
-- verbatim. Apply on a CLEAN destination (after 20260903000002_reset_baseline)
-- and before 20260903000003_migration_outbox.
-- Kept: ${kept.length} objects · dropped: ${dropped.length} (DeFi México product, see report)
-- ============================================================
SET statement_timeout = 0; SET lock_timeout = 0; SET client_encoding = 'UTF8'; SET standard_conforming_strings = on;
SET check_function_bodies = false; SET search_path = public, pg_catalog;

${extensions.length ? `-- extensions the kept DDL depends on (detected by the filter)\n${extensions.join('\n')}\n\n` : ''}`;
writeFileSync(outFile, header + kept.map((o) => o.body).join(''));
console.log(`extensions: ${extensions.length ? extensions.join(' ') : 'none'}`);
const summary = (list: Obj[]) => Object.entries(list.reduce<Record<string, number>>((acc, o) => { acc[o.type] = (acc[o.type] || 0) + 1; return acc; }, {})).map(([k, v]) => `${k}=${v}`).join(' ');
console.log(`kept ${kept.length}: ${summary(kept)}`);
console.log(`dropped ${dropped.length}: ${summary(dropped)}`);
console.log(`functions kept: ${kept.filter((o) => o.type === 'FUNCTION').map((o) => o.name.replace(/\(.*$/, '')).join(', ')}`);
console.log(`triggers kept: ${kept.filter((o) => o.type === 'TRIGGER').map((o) => o.name).join(', ')}`);
console.log(`types kept: ${kept.filter((o) => o.type === 'TYPE').map((o) => o.name).join(', ') || 'none'}`);
console.log(`fk dropped (other side not kept): ${dropped.filter((o) => o.type === 'FK CONSTRAINT' && KEEP_TABLES.has(tableOf(o) || '')).map((o) => o.name).join(', ') || 'none'}`);
if (missing.length) { console.error(`MISSING in dump: ${missing.join(', ')}`); process.exit(1); }
console.log(`→ ${outFile}`);
