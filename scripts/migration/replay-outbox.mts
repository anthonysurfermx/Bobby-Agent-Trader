#!/usr/bin/env -S npx tsx
// ============================================================
// Replay the migration_outbox of one side onto the other (rollback path):
// reads pending journal rows from --from (source|target), applies them to
// the other project via PostgREST (upsert on pk / delete by pk) in id order,
// then marks them replayed. Idempotent: re-running skips replayed rows.
//   npx tsx scripts/migration/replay-outbox.mts --from target [--dry-run]
// ============================================================
import { APPROVED_TABLES, spec } from './tables.js';
import { headers, log, project, type Side } from './lib.js';

const args = process.argv.slice(2);
const from = (args[args.indexOf('--from') + 1] || 'target') as Side;
const dryRun = args.includes('--dry-run');
const src = project(from);
const dst = project(from === 'target' ? 'source' : 'target');
const approved = new Set(APPROVED_TABLES.map((t) => t.name));

interface Entry { id: number; table_name: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; pk: Record<string, unknown>; row_data: Record<string, unknown> | null }

(async () => {
  log(`replay outbox · ${src.ref} → ${dst.ref}${dryRun ? ' (dry run)' : ''}`);
  const r = await fetch(`${src.url}/rest/v1/migration_outbox?replayed_at=is.null&order=id.asc&limit=5000&select=id,table_name,op,pk,row_data`, { headers: headers(src) });
  if (!r.ok) throw new Error(`outbox read HTTP ${r.status} ${await r.text()}`);
  const entries = (await r.json()) as Entry[];
  log(`${entries.length} pending entr${entries.length === 1 ? 'y' : 'ies'}`);
  let applied = 0;
  for (const e of entries) {
    if (!approved.has(e.table_name)) { log(`skip ${e.table_name} (not approved)`); continue; }
    const t = spec(e.table_name);
    const where = Object.entries(e.pk).map(([k, v]) => `${k}=eq.${encodeURIComponent(String(v))}`).join('&');
    log(`${e.op.padEnd(6)} ${e.table_name} ${JSON.stringify(e.pk)}`);
    if (dryRun) continue;
    const res = e.op === 'DELETE'
      ? await fetch(`${dst.url}/rest/v1/${e.table_name}?${where}`, { method: 'DELETE', headers: headers(dst, { Prefer: 'return=minimal' }) })
      : await fetch(`${dst.url}/rest/v1/${e.table_name}?on_conflict=${t.pk.join(',')}`, { method: 'POST', headers: headers(dst, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(e.row_data) });
    if (!res.ok) { console.error(`entry ${e.id}: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
    const mark = await fetch(`${src.url}/rest/v1/migration_outbox?id=eq.${e.id}`, { method: 'PATCH', headers: headers(src, { Prefer: 'return=minimal' }), body: JSON.stringify({ replayed_at: new Date().toISOString(), replay_target: dst.ref }) });
    if (!mark.ok) { console.error(`entry ${e.id}: could not mark replayed (${mark.status})`); process.exit(1); }
    applied += 1;
  }
  log(dryRun ? 'dry run complete' : `${applied} entr${applied === 1 ? 'y' : 'ies'} replayed`);
})().catch((e) => { console.error(e); process.exit(1); });
