#!/usr/bin/env -S npx tsx
// ============================================================
// Self-test of the fail-closed behaviour, against an in-process fake
// PostgREST (no network, no credentials). Demonstrates:
//   1. t0-manifest exits 1 (no manifest) when a table is missing
//   2. t0-manifest exits 1 when the exact count ≠ streamed rows
//   3. export exits 1 (no index.json) on the same mismatch
//   4. replay refuses source == target, refuses without freeze, refuses when
//      the trigger set ≠ approved list, and drains > 5,000 pending entries
//      to zero (paging), then exits 1 if new entries keep landing
// Exit 0 = all demonstrated.
// ============================================================
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { APPROVED_TABLES } from './tables.js';

type Mode = { missing?: string; mismatch?: string; freeze?: boolean; triggers?: 'all' | 'partial' | 'wrongpk'; pending?: number; leak?: boolean };
let mode: Mode = {};
let outboxPending: Array<{ id: number; table_name: string; op: string; pk: Record<string, unknown>; row_data: Record<string, unknown> }> = [];
let upserts = 0;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  const table = url.pathname.replace('/rest/v1/', '');
  const json = (code: number, body: unknown, headers: Record<string, string> = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)); };
  if (table === 'rpc/bobby_outbox_status') return json(200, (mode.triggers === 'partial' ? APPROVED_TABLES.slice(0, 5) : APPROVED_TABLES).map((t) => ({ table_name: t.name, pk_columns: mode.triggers === 'wrongpk' && t.name === 'agent_market_snapshots' ? 'symbol' : t.pk.join(',') })));
  if (table === 'bobby_control' && url.searchParams.get('select') === 'write_freeze') return json(200, [{ write_freeze: mode.freeze === true }]);
  if (table === 'migration_outbox') {
    if (req.method === 'PATCH') { const id = Number(url.searchParams.get('id')?.replace('eq.', '')); outboxPending = outboxPending.filter((e) => e.id !== id); if (mode.leak && outboxPending.length === 0) { outboxPending.push({ id: 900000 + Math.floor(Math.random() * 1e5), table_name: 'agent_config', op: 'INSERT', pk: { key: 'late' }, row_data: { key: 'late', value: 'x' } }); } return json(204, null); }
    const limit = Number(url.searchParams.get('limit') || 1000);
    return json(200, outboxPending.slice(0, limit));
  }
  if (table === 'hardness_agent_sessions' && url.searchParams.get('select') === 'session_id') return json(200, []);
  if (req.method === 'POST') { upserts += 1; return json(201, null); }
  if (mode.missing === table) return json(404, { message: 'relation does not exist' });
  const total = 3;
  const data = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }, { key: 'c', value: '3' }];
  if (req.headers.range === '0-0') return json(206, data.slice(0, 1), { 'Content-Range': `0-0/${mode.mismatch === table ? total + 1 : total}` });
  const offset = Number(url.searchParams.get('offset') || 0);
  return json(200, offset === 0 ? data : []);
});

// Async on purpose: the fake PostgREST lives in THIS process, so a blocking
// spawnSync would deadlock the event loop and the child would never be served.
function run(script: string, extra: string[], env: Record<string, string>): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', join('scripts/migration', script), ...extra], { env: { ...process.env, ...env } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; }); child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail}` : ''}`); };

server.listen(0, async () => {
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const dir = mkdtempSync(join(tmpdir(), 'bobby-selftest-'));
  const A = { SOURCE_SUPABASE_URL: base, SOURCE_SUPABASE_SERVICE_KEY: 'x', TARGET_SUPABASE_URL: base, TARGET_SUPABASE_SERVICE_KEY: 'x' };
  // 1. missing table
  mode = { missing: 'forum_posts' };
  let r = await run('t0-manifest.mts', ['--side', 'source', '--out', join(dir, 'm1.json')], A);
  line(r.status === 1 && !existsSync(join(dir, 'm1.json')) && /forum_posts: missing/.test(r.stderr), 't0-manifest: missing table → exit 1, no manifest', `exit=${r.status}`);
  // 2. count mismatch
  mode = { mismatch: 'agent_config' };
  r = await run('t0-manifest.mts', ['--side', 'source', '--out', join(dir, 'm2.json')], A);
  line(r.status === 1 && !existsSync(join(dir, 'm2.json')) && /exact count 4 but streamed 3/.test(r.stderr), 't0-manifest: count ≠ streamed → exit 1, no manifest', `exit=${r.status}`);
  // 2b. clean run writes a manifest
  mode = {};
  r = await run('t0-manifest.mts', ['--side', 'source', '--out', join(dir, 'm3.json')], A);
  line(r.status === 0 && existsSync(join(dir, 'm3.json')), 't0-manifest: clean run → exit 0, manifest written', `exit=${r.status} ${r.stderr.trim().split('\n').slice(-2).join(' | ')}`);
  // 3. export mismatch
  mode = { mismatch: 'forum_threads' };
  r = await run('export.mts', ['--dir', join(dir, 'exp')], A);
  line(r.status === 1 && !existsSync(join(dir, 'exp')) && /EXPORT FAILED/.test(r.stderr), 'export: count ≠ exported → exit 1, directory removed (no private residue)', `exit=${r.status} dir=${existsSync(join(dir, 'exp')) ? 'STILL THERE' : 'gone'}`);
  // 3b. a clean export, then import checks: incomplete index, tampered file
  mode = {};
  r = await run('export.mts', ['--dir', join(dir, 'exp2')], A);
  line(r.status === 0 && existsSync(join(dir, 'exp2', 'index.json')), 'export: clean run → index.json', `exit=${r.status}`);
  const B2 = { ...A, TARGET_SUPABASE_URL: base.replace('127.0.0.1', 'localhost') };
  r = await run('import.mts', ['--dir', join(dir, 'exp2'), '--dry-run'], B2);
  line(r.status === 0 && /plan ok/.test(r.stdout), 'import: complete, untampered export → dry-run plan ok', `exit=${r.status}`);
  const idx = JSON.parse(readFileSync(join(dir, 'exp2', 'index.json'), 'utf8'));
  const saved = JSON.stringify(idx);
  delete idx.tables.forum_posts; writeFileSync(join(dir, 'exp2', 'index.json'), JSON.stringify(idx));
  r = await run('import.mts', ['--dir', join(dir, 'exp2'), '--dry-run'], B2);
  line(r.status === 1 && /forum_posts: not in the export index/.test(r.stderr) && upserts === 0, 'import: table missing from the index → refused, nothing written', `exit=${r.status}`);
  writeFileSync(join(dir, 'exp2', 'index.json'), saved);
  writeFileSync(join(dir, 'exp2', 'agent_config.ndjson'), readFileSync(join(dir, 'exp2', 'agent_config.ndjson'), 'utf8').replace('"value":"1"', '"value":"tampered"'));
  r = await run('import.mts', ['--dir', join(dir, 'exp2')], B2);
  line(r.status === 1 && /agent_config: file does not match the index/.test(r.stderr) && upserts === 0, 'import: tampered NDJSON → refused before any write', `exit=${r.status} upserts=${upserts}`);
  // 4. replay guards
  r = await run('replay-outbox.mts', ['--from', 'nowhere'], A);
  line(r.status === 2, 'replay: invalid --from refused', `exit=${r.status}`);
  r = await run('replay-outbox.mts', ['--from', 'target'], A);
  line(r.status === 2 && /same project/.test(r.stderr), 'replay: source == target refused', `exit=${r.status}`);
  const B = { SOURCE_SUPABASE_URL: base, SOURCE_SUPABASE_SERVICE_KEY: 'x', TARGET_SUPABASE_URL: `http://127.0.0.1:${port}/`.replace('127.0.0.1', 'localhost'), TARGET_SUPABASE_SERVICE_KEY: 'x' };
  mode = { triggers: 'partial', freeze: true };
  r = await run('replay-outbox.mts', ['--from', 'target'], B);
  line(r.status === 1 && /triggers do not match/.test(r.stderr), 'replay: trigger set ≠ approved list refused', `exit=${r.status}`);
  mode = { triggers: 'wrongpk', freeze: true };
  r = await run('replay-outbox.mts', ['--from', 'target'], B);
  line(r.status === 1 && /wrongPk=\[agent_market_snapshots/.test(r.stderr), 'replay: trigger armed with the wrong pk columns refused', `exit=${r.status}`);
  mode = { triggers: 'all', freeze: false };
  r = await run('replay-outbox.mts', ['--from', 'target'], B);
  line(r.status === 1 && /writeFreeze must be ON/.test(r.stderr), 'replay: refuses without freeze on both sides', `exit=${r.status}`);
  // drain > 5000
  mode = { triggers: 'all', freeze: true };
  outboxPending = Array.from({ length: 5_432 }, (_, i) => ({ id: i + 1, table_name: 'agent_config', op: 'INSERT', pk: { key: `k${i}` }, row_data: { key: `k${i}`, value: 'v' } }));
  upserts = 0;
  r = await run('replay-outbox.mts', ['--from', 'target'], B);
  line(r.status === 0 && upserts === 5_432 && outboxPending.length === 0 && /REPLAY COMPLETE: 5432/.test(r.stdout), 'replay: drains 5,432 pending entries across pages to zero', `exit=${r.status} upserts=${upserts} left=${outboxPending.length}`);
  // late write after drain → incomplete
  mode = { triggers: 'all', freeze: true, leak: true };
  outboxPending = [{ id: 1, table_name: 'agent_config', op: 'INSERT', pk: { key: 'a' }, row_data: { key: 'a', value: '1' } }];
  r = await run('replay-outbox.mts', ['--from', 'target'], { ...B, REPLAY_MAX_PASSES: '5' });
  line(r.status === 1 && /REPLAY INCOMPLETE/.test(r.stderr), 'replay: writes that keep landing after every drain → exit 1 (do not unfreeze)', `exit=${r.status}`);
  server.close();
  rmSync(dir, { recursive: true, force: true });
  console.log(failures ? `\nSELFTEST FAILED: ${failures}` : '\nSELFTEST PASSED: fail-closed behaviour demonstrated.');
  process.exit(failures ? 1 : 0);
});
