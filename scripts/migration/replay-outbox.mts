#!/usr/bin/env -S npx tsx
// ============================================================
// Replay the migration_outbox of one side onto the other (rollback path).
// Hardened after Codex review:
//   · --from must be source|target; the two refs must differ
//   · before replaying, both sides must report writeFreeze=true
//     (bobby_control) unless --unsafe-no-freeze-check is given explicitly
//   · pages through the journal until NOTHING is pending; if anything is
//     still pending at the end (new writes landed), exit 1 — never "success
//     with leftovers"
//   · the journal's capture triggers must cover exactly the approved tables
//     (bobby_outbox_status) or the replay refuses to start
//   npx tsx scripts/migration/replay-outbox.mts --from target [--dry-run]
// ============================================================
import { APPROVED_TABLES, outboxPlan, spec } from './tables.js';
import { headers, log, project, rpc, type Side } from './lib.js';

const args = process.argv.slice(2);
const fromArg = args[args.indexOf('--from') + 1];
if (fromArg !== 'source' && fromArg !== 'target') { console.error('--from source|target is required'); process.exit(2); }
const from = fromArg as Side;
const dryRun = args.includes('--dry-run');
const unsafe = args.includes('--unsafe-no-freeze-check');
const src = project(from);
const dst = project(from === 'target' ? 'source' : 'target');
if (src.ref === dst.ref) { console.error(`refusing: source and target are the same project (${src.ref})`); process.exit(2); }
const approved = new Set(APPROVED_TABLES.map((t) => t.name));
const PAGE = 1000;
// Drain passes: if the journal never empties, writes are still landing faster
// than we replay — that is a freeze failure, not something to loop on forever.
const MAX_PASSES = Number(process.env.REPLAY_MAX_PASSES || 50);

interface Entry { id: number; table_name: string; op: 'INSERT' | 'UPDATE' | 'DELETE'; pk: Record<string, unknown>; row_data: Record<string, unknown> | null }

async function frozen(p: typeof src): Promise<boolean | null> {
  const r = await fetch(`${p.url}/rest/v1/bobby_control?select=write_freeze&limit=1`, { headers: headers(p) });
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<{ write_freeze?: boolean }>;
  return rows[0]?.write_freeze === true;
}

async function pending(p: typeof src): Promise<Entry[]> {
  const r = await fetch(`${p.url}/rest/v1/migration_outbox?replayed_at=is.null&order=id.asc&limit=${PAGE}&select=id,table_name,op,pk,row_data`, { headers: headers(p) });
  if (!r.ok) throw new Error(`outbox read HTTP ${r.status} ${await r.text()}`);
  return (await r.json()) as Entry[];
}

(async () => {
  log(`replay outbox · ${src.ref} → ${dst.ref}${dryRun ? ' (dry run)' : ''}`);
  // 1. triggers cover exactly the approved tables on the journaling side
  const status = await rpc<Array<{ table_name: string; pk_columns: string | null }>>(src, 'bobby_outbox_status');
  if (status.status !== 200 || !Array.isArray(status.body)) { console.error(`bobby_outbox_status unavailable on ${src.ref} (HTTP ${status.status}) — apply the outbox migration first`); process.exit(1); }
  const plan = outboxPlan();
  const armed = new Map(status.body.map((r) => [r.table_name, r.pk_columns || '']));
  const missing = Object.keys(plan).filter((t) => !armed.has(t));
  const extra = [...armed.keys()].filter((t) => !(t in plan));
  const wrongPk = Object.entries(plan).filter(([t, pk]) => armed.has(t) && armed.get(t) !== pk).map(([t, pk]) => `${t}(${armed.get(t)}≠${pk})`);
  if (missing.length || extra.length || wrongPk.length) { console.error(`outbox triggers do not match the approved plan: missing=[${missing.join(',')}] extra=[${extra.join(',')}] wrongPk=[${wrongPk.join(',')}] (expected exactly ${approved.size})`); process.exit(1); }
  log(`outbox triggers: ${armed.size}/${approved.size} approved tables covered with the right pk columns`);
  // 2. both sides frozen
  if (!unsafe) {
    const [fs, fd] = await Promise.all([frozen(src), frozen(dst)]);
    if (fs !== true || fd !== true) { console.error(`refusing: writeFreeze must be ON on both sides before a replay (source=${fs}, target=${fd}); pass --unsafe-no-freeze-check only for a rehearsal on throw-away data`); process.exit(1); }
    log('both sides report writeFreeze=true');
  }
  // 3. drain
  let applied = 0; let passes = 0;
  for (;;) {
    const batch = await pending(src);
    if (!batch.length) break;
    passes += 1;
    if (passes > MAX_PASSES) { console.error(`REPLAY INCOMPLETE: journal still non-empty after ${MAX_PASSES} passes — writes keep landing on ${src.ref}. Do not unfreeze.`); process.exit(1); }
    if (dryRun) { log(`${batch.length} pending in this page (dry run — not applied)`); break; }
    for (const e of batch) {
      if (!approved.has(e.table_name)) { console.error(`entry ${e.id}: table ${e.table_name} is not approved — journal corrupted?`); process.exit(1); }
      const t = spec(e.table_name);
      const where = Object.entries(e.pk).map(([k, v]) => `${k}=eq.${encodeURIComponent(String(v))}`).join('&');
      const res = e.op === 'DELETE'
        ? await fetch(`${dst.url}/rest/v1/${e.table_name}?${where}`, { method: 'DELETE', headers: headers(dst, { Prefer: 'return=minimal' }) })
        : await fetch(`${dst.url}/rest/v1/${e.table_name}?on_conflict=${t.pk.join(',')}`, { method: 'POST', headers: headers(dst, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(e.row_data) });
      if (!res.ok) { console.error(`entry ${e.id} (${e.op} ${e.table_name}): HTTP ${res.status} ${await res.text()}`); process.exit(1); }
      const mark = await fetch(`${src.url}/rest/v1/migration_outbox?id=eq.${e.id}`, { method: 'PATCH', headers: headers(src, { Prefer: 'return=minimal' }), body: JSON.stringify({ replayed_at: new Date().toISOString(), replay_target: dst.ref }) });
      if (!mark.ok) { console.error(`entry ${e.id}: could not mark replayed (${mark.status})`); process.exit(1); }
      applied += 1;
    }
    log(`${applied} replayed so far…`);
  }
  // 4. nothing may remain
  const left = dryRun ? [] : await pending(src);
  if (left.length) { console.error(`REPLAY INCOMPLETE: ${left.length}+ entries still pending after draining — writes are still landing on ${src.ref}. Do not unfreeze.`); process.exit(1); }
  log(dryRun ? 'dry run complete' : `REPLAY COMPLETE: ${applied} entries applied, 0 pending`);
})().catch((e) => { console.error(e); process.exit(1); });
