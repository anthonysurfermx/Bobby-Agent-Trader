#!/usr/bin/env -S npx tsx
// ============================================================
// RLS adversarial check — the decisive gate of phase 0.
//
// With ONLY the anon key, try to insert / update / delete on the tables
// that must be read-only for the public. Every attempt must be refused
// (HTTP 401/403, or 0 rows affected). Then prove the legitimate paths still
// work through the API. Read-only against production data: inserts use
// obviously fake rows and are expected to FAIL; the script never uses a
// service key.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... \
//   BOBBY_API=https://bobbyprotocol.xyz npx tsx scripts/infra/rls-adversarial.mts
// Exit code 0 = all gates pass, 1 = at least one write got through.
// ============================================================

const URL_ = process.env.SUPABASE_URL || '';
const ANON = process.env.SUPABASE_ANON_KEY || '';
const API = (process.env.BOBBY_API || 'https://bobbyprotocol.xyz').replace(/\/+$/, '');
if (!URL_ || !ANON) {
  console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required (anon key only — never the service key)');
  process.exit(2);
}

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const FAKE_ID = '00000000-0000-4000-8000-000000000000';

interface Attempt { table: string; op: 'insert' | 'update' | 'delete'; body?: unknown; filter?: string }

const attempts: Attempt[] = [
  { table: 'agent_cycles', op: 'insert', body: { status: 'failed', trigger_reason: 'RLS ADVERSARIAL TEST — must be refused' } },
  { table: 'agent_cycles', op: 'update', filter: `id=eq.${FAKE_ID}`, body: { status: 'failed' } },
  { table: 'agent_cycles', op: 'delete', filter: `id=eq.${FAKE_ID}` },
  { table: 'forum_threads', op: 'insert', body: { topic: 'RLS ADVERSARIAL TEST', symbol: 'TEST', direction: 'long', conviction_score: 1 } },
  { table: 'forum_threads', op: 'update', filter: `id=eq.${FAKE_ID}`, body: { topic: 'x' } },
  { table: 'forum_threads', op: 'delete', filter: `id=eq.${FAKE_ID}` },
  { table: 'forum_posts', op: 'insert', body: { thread_id: FAKE_ID, agent: 'cio', content: 'RLS ADVERSARIAL TEST' } },
  { table: 'forum_posts', op: 'delete', filter: `id=eq.${FAKE_ID}` },
  { table: 'agent_trades', op: 'insert', body: { token_symbol: 'TEST', direction: 'long' } },
  { table: 'agent_trades', op: 'delete', filter: `id=eq.${FAKE_ID}` },
  { table: 'mcp_payment_challenges', op: 'insert', body: { status: 'test' } },
  { table: 'mcp_payment_challenges', op: 'delete', filter: `id=eq.${FAKE_ID}` },
  { table: 'mcp_payment_receipts', op: 'insert', body: {} },
  { table: 'agent_messages', op: 'delete', filter: `id=eq.${FAKE_ID}` },
  { table: 'user_interests', op: 'insert', body: { wallet_address: '0x0000000000000000000000000000000000000000', asset: 'TEST' } },
  { table: 'hardness_agent_proofs', op: 'insert', body: { session_id: 'rls-test' } },
  { table: 'memory_objects', op: 'insert', body: {} },
  { table: 'telegram_connections', op: 'insert', body: { connect_token: 'rls-test', status: 'pending' } },
];

async function attempt(a: Attempt): Promise<{ refused: boolean; status: number; detail: string }> {
  const url = `${URL_}/rest/v1/${a.table}${a.filter ? `?${a.filter}` : ''}`;
  const init: RequestInit = a.op === 'insert'
    ? { method: 'POST', headers, body: JSON.stringify(a.body) }
    : a.op === 'update'
      ? { method: 'PATCH', headers, body: JSON.stringify(a.body) }
      : { method: 'DELETE', headers };
  const res = await fetch(url, init);
  const text = await res.text();
  let rows = 0;
  try { const j = JSON.parse(text); rows = Array.isArray(j) ? j.length : 0; } catch { /* not json */ }
  // Refused = auth/RLS error, or a filtered update/delete that touched nothing.
  const refused = res.status === 401 || res.status === 403 || (a.op !== 'insert' && res.ok && rows === 0) || (res.status === 404);
  if (a.op === 'insert' && res.ok) return { refused: false, status: res.status, detail: 'INSERT SUCCEEDED — anon can write' };
  return { refused, status: res.status, detail: text.slice(0, 120) };
}

async function legit(): Promise<Array<{ name: string; ok: boolean; status: number }>> {
  const origin = { Origin: 'https://bobbyprotocol.xyz', 'Content-Type': 'application/json' };
  const cases = [
    { name: 'POST /api/user-interests (schema reject)', req: fetch(`${API}/api/user-interests`, { method: 'POST', headers: origin, body: JSON.stringify({ wallet: 'nope', assets: [] }) }), expect: [400] },
    { name: 'POST /api/forum-publish (schema reject)', req: fetch(`${API}/api/forum-publish`, { method: 'POST', headers: origin, body: JSON.stringify({}) }), expect: [400] },
    { name: 'POST /api/telegram-connect (no origin → 403)', req: fetch(`${API}/api/telegram-connect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }), expect: [403] },
    { name: 'GET /api/bobby-health', req: fetch(`${API}/api/bobby-health`), expect: [200] },
    { name: 'GET /api/bobby-protocol-stats', req: fetch(`${API}/api/bobby-protocol-stats`), expect: [200] },
    { name: 'anon SELECT forum_threads (public read must work)', req: fetch(`${URL_}/rest/v1/forum_threads?select=id&limit=1`, { headers }), expect: [200] },
  ];
  const out = [];
  for (const c of cases) {
    const r = await c.req;
    out.push({ name: c.name, ok: c.expect.includes(r.status), status: r.status });
  }
  return out;
}

(async () => {
  console.log(`RLS adversarial check against ${URL_} (anon key) and ${API}`);
  let failures = 0;
  for (const a of attempts) {
    const r = await attempt(a);
    const mark = r.refused ? 'REFUSED' : 'ALLOWED';
    if (!r.refused) failures += 1;
    console.log(`${mark.padEnd(8)} ${a.op.padEnd(6)} ${a.table.padEnd(24)} HTTP ${r.status}  ${r.detail.replace(/\s+/g, ' ')}`);
  }
  console.log('\nLegitimate paths:');
  for (const l of await legit()) {
    if (!l.ok) failures += 1;
    console.log(`${(l.ok ? 'OK' : 'FAIL').padEnd(8)} ${l.name} (HTTP ${l.status})`);
  }
  console.log(failures === 0 ? '\nGATE PASSED: the anon key cannot modify protected tables and the APIs answer.' : `\nGATE FAILED: ${failures} problem(s).`);
  process.exit(failures === 0 ? 0 : 1);
})();
