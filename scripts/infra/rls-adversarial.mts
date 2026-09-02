#!/usr/bin/env -S npx tsx
// ============================================================
// RLS adversarial gate v2 — the decisive gate of phase 0.
//
// v1 inferred "refused" from "0 rows affected" on a non-existent id, which a
// permissive policy also produces (Codex review, blocker 1). v2 proves it:
//
//   A. POLICY MATRIX  (service role, via bobby_rls_matrix()/bobby_rls_status())
//      every protected table has RLS enabled, no policy is granted to
//      {public}, and anon/authenticated only ever get SELECT (plus INSERT on
//      user_feedback) — never on the per-wallet tables.
//   B. CANARY ROWS    (service role inserts, anon attacks, service role checks)
//      real rows with a unique marker; anon UPDATE / DELETE must leave them
//      untouched; anon SELECT must not see the private ones; anon INSERT must
//      be refused with 401/403 (a 400 is INCONCLUSIVE and fails the gate).
//      Canaries are removed at the end (also on failure).
//   C. LEGITIMATE PATH (a throw-away wallet)
//      sign in → /api/user-interests POST succeeds and the row is readable
//      back through GET; the same request without a session is 401; with a
//      body wallet different from the session wallet it is 403.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... \
//   SUPABASE_SERVICE_KEY=eyJ... BOBBY_API=https://bobbyprotocol.xyz \
//   npx tsx scripts/infra/rls-adversarial.mts
// Exit 0 = GATE PASSED. Anything else = do not cut over.
// The service key is REQUIRED: without it the verdict is INCOMPLETE (exit 2).
// ============================================================
import { randomBytes } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || '';
const SERVICE = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API = (process.env.BOBBY_API || 'https://bobbyprotocol.xyz').replace(/\/+$/, '');
const ORIGIN = process.env.BOBBY_ORIGIN || 'https://bobbyprotocol.xyz';
if (!URL_ || !ANON) { console.error('SUPABASE_URL and SUPABASE_ANON_KEY are required'); process.exit(2); }
if (!SERVICE) { console.error('SUPABASE_SERVICE_KEY is required: the gate cannot reach a PASS verdict without the policy matrix and canary rows. Verdict: INCOMPLETE'); process.exit(2); }
// Same salt as the target deployment (vercel env pull): without it the gate
// cannot locate its own persisted forum-publish window, and a public default
// would defeat the point of hashing IPs. Verdict: INCOMPLETE.
const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || '';
if (RATE_LIMIT_SALT.length < 16) { console.error('RATE_LIMIT_SALT (the deployment\'s salt, ≥16 chars) is required: pull it with `vercel env pull --environment=production`. Verdict: INCOMPLETE'); process.exit(2); }

// Which sections to run: A (policy matrix), B (canaries), C (legitimate path). Default all.
const SECTIONS = new Set((process.env.GATE_SECTIONS || 'ABC').toUpperCase().split(''));
// Vercel Deployment Protection on previews: present the automation bypass on every API call.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
if (BYPASS) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const extra = url.startsWith(API) ? { 'x-vercel-protection-bypass': BYPASS } : {};
    return realFetch(input, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), ...extra } });
  }) as typeof fetch;
}
const anonHeaders = { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const svcHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const MARK = `RLS-CANARY-${Date.now()}-${randomBytes(3).toString('hex')}`;
const CANARY_WALLET = `0x${randomBytes(20).toString('hex')}`;

let failures = 0;
// /api/forum-publish is rate-limited to 6 per IP per hour and section C
// spends EXACTLY six calls on it. The window is a fixed hour from the first
// hit and it is PERSISTED in api_cache (rl:forum-publish:<ip key>), so a new
// deployment does NOT reset it — only the real expiry does. A 429 means the
// window is already spent by an earlier run: not a security failure, but it
// voids the verdict (the 403/409 semantics were not observed). The section
// pre-flights the persisted row, waits for the real expiry when asked, and
// otherwise honours Retry-After on the first 429 instead of burning calls.
let rateLimited = 0;
const FORUM_PUBLISH_LIMIT = 6;
const WAIT_FOR_WINDOW = process.env.GATE_WAIT_FOR_RATE_LIMIT !== '0'; // default: wait
const MAX_WAIT_MS = Number(process.env.GATE_MAX_WAIT_SEC || 3900) * 1000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 19);

/**
 * When does THIS caller's forum-publish window expire, according to the
 * persisted limiter? Needs the public IP (api.ipify.org) and the same salt
 * the API uses (RATE_LIMIT_SALT, required — no default). Returns null when
 * the row cannot be resolved — then the first 429's Retry-After is used.
 */
async function forumPublishWindow(): Promise<{ count: number; resetAt: number } | null> {
  try {
    const ip = (await (await fetch('https://api.ipify.org')).text()).trim();
    if (!ip) return null;
    const { createHash } = await import('node:crypto');
    const ipKey = createHash('sha256').update(`${RATE_LIMIT_SALT}:${ip}`).digest('hex').slice(0, 24);
    const key = `rl:forum-publish:${ipKey}`;
    const r = await fetch(`${URL_}/rest/v1/api_cache?cache_key=eq.${encodeURIComponent(key)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=payload,expires_at&limit=1`, { headers: svcHeaders });
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ payload: { count?: number }; expires_at: string }>;
    if (!rows.length) return { count: 0, resetAt: 0 };
    return { count: rows[0].payload?.count ?? 0, resetAt: Date.parse(rows[0].expires_at) };
  } catch {
    return null;
  }
}

/** Wait until `resetAt` (plus a small margin) if allowed; false when we won't. */
async function waitForWindow(resetAt: number, why: string): Promise<boolean> {
  const waitMs = resetAt - Date.now() + 15_000;
  if (waitMs <= 0) return true;
  if (!WAIT_FOR_WINDOW || waitMs > MAX_WAIT_MS) {
    console.log(`     forum-publish window (${why}) resets at ${hhmm(resetAt)} UTC — not waiting (GATE_WAIT_FOR_RATE_LIMIT=0 or beyond GATE_MAX_WAIT_SEC).`);
    return false;
  }
  console.log(`     forum-publish window (${why}) resets at ${hhmm(resetAt)} UTC — waiting ${Math.ceil(waitMs / 60_000)} min so the verdict is a single run…`);
  await sleep(waitMs);
  return true;
}
const line = (ok: boolean, label: string, detail = '') => {
  if (!ok) failures += 1;
  if (!ok && /HTTP 429/.test(detail)) rateLimited += 1;
  console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail.replace(/\s+/g, ' ').slice(0, 140)}` : ''}`);
};

// ---------- A. policy matrix ----------
const PROTECTED = ['agent_cycles', 'agent_events', 'agent_trades', 'agent_positions', 'agent_signals', 'hardness_agent_proofs',
  'forum_threads', 'forum_posts', 'user_feedback', 'api_cache', 'indicator_cache',
  'agent_messages', 'user_interests', 'user_digests', 'sandbox_runs', 'mcp_payment_challenges', 'mcp_payment_receipts',
  'agent_profiles', 'telegram_connections', 'memory_objects', 'agent_config', 'hardness_agents', 'hardness_agent_sessions', 'bobby_control', 'forum_publish_receipts'];
const PRIVATE = new Set(['agent_messages', 'user_interests', 'user_digests', 'sandbox_runs', 'mcp_payment_challenges', 'mcp_payment_receipts', 'agent_profiles', 'telegram_connections', 'memory_objects', 'agent_config', 'hardness_agents', 'hardness_agent_sessions', 'bobby_control', 'forum_publish_receipts']);

interface Policy { tablename: string; policyname: string; cmd: string; roles: string[]; qual: string | null; with_check: string | null }

async function rpc<T>(name: string): Promise<T | null> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, { method: 'POST', headers: svcHeaders, body: '{}' });
  if (!r.ok) return null;
  return (await r.json()) as T;
}

async function policyMatrix(): Promise<void> {
  console.log('\nA. Policy matrix (pg_policies via bobby_rls_matrix)');
  const status = await rpc<Array<{ tablename: string; rls_enabled: boolean }>>('bobby_rls_status');
  const policies = await rpc<Policy[]>('bobby_rls_matrix');
  if (!status || !policies) { line(false, 'bobby_rls_matrix()/bobby_rls_status() callable', 'apply supabase/migrations/20260902_bobby_rls_hardening.sql first'); return; }
  const existing = new Set(status.map((s) => s.tablename));
  for (const t of PROTECTED) {
    if (!existing.has(t)) { console.log(`skip   ${t} (table does not exist)`); continue; }
    line(status.find((s) => s.tablename === t)?.rls_enabled === true, `${t}: RLS enabled`);
    const pols = policies.filter((p) => p.tablename === t);
    for (const p of pols) {
      const roles = (p.roles || []).map((r) => r.replace(/[{}"]/g, ''));
      const grantsPublic = roles.includes('public') || roles.length === 0;
      line(!grantsPublic, `${t}.${p.policyname}: not granted to public`, `roles=${roles.join(',')} cmd=${p.cmd}`);
      const anonLike = roles.some((r) => r === 'anon' || r === 'authenticated');
      if (anonLike) {
        const allowed = p.cmd === 'SELECT' || (t === 'user_feedback' && p.cmd === 'INSERT');
        line(allowed && !PRIVATE.has(t), `${t}.${p.policyname}: anon may only ${PRIVATE.has(t) ? 'NOT appear' : 'SELECT'}`, `cmd=${p.cmd}`);
      }
    }
    if (PRIVATE.has(t)) line(!pols.some((p) => (p.roles || []).some((r) => /anon|authenticated|public/.test(r))), `${t}: no anon/authenticated/public policy at all`);
  }
}

// ---------- B. canary rows ----------
interface Canary { table: string; pk: string; id: string; visibleToAnon: boolean; patch: Record<string, unknown> }
const canaries: Canary[] = [];

async function svcInsert(table: string, body: Record<string, unknown>, pk = 'id'): Promise<string | null> {
  const r = await fetch(`${URL_}/rest/v1/${table}`, { method: 'POST', headers: svcHeaders, body: JSON.stringify(body) });
  if (!r.ok) { line(false, `service insert canary into ${table}`, `HTTP ${r.status} ${await r.text()}`); return null; }
  const rows = (await r.json()) as Array<Record<string, string>>;
  return rows[0]?.[pk] ?? null;
}

async function plantCanaries(): Promise<void> {
  console.log('\nB. Canary rows (service role plants, anon attacks)');
  const plant = async (table: string, body: Record<string, unknown>, visibleToAnon: boolean, patch: Record<string, unknown>, pk = 'id') => {
    const id = await svcInsert(table, body, pk);
    if (id) canaries.push({ table, pk, id, visibleToAnon, patch });
    return id;
  };
  await plant('agent_cycles', { status: 'failed', error: MARK, llm_model: 'rls-canary' }, true, { error: 'TAMPERED' });
  const pubThread = await plant('forum_threads', { topic: MARK, trigger_reason: 'rls canary', scope: 'public', symbol: 'RLSTEST', language: 'en', expires_at: new Date(0).toISOString(), resolution: 'expired' }, true, { topic: 'TAMPERED' });
  const privThread = await plant('forum_threads', { topic: `${MARK}-private`, trigger_reason: 'rls canary', scope: 'private', owner_wallet: CANARY_WALLET, symbol: 'RLSTEST', language: 'en' }, false, { topic: 'TAMPERED' });
  if (pubThread) await plant('forum_posts', { thread_id: pubThread, agent: 'cio', content: MARK }, true, { content: 'TAMPERED' });
  if (privThread) await plant('forum_posts', { thread_id: privThread, agent: 'cio', content: `${MARK}-private` }, false, { content: 'TAMPERED' });
  // agent_trades CHECKs: direction in (BUY, SELL), status in (pending, confirmed, failed, simulated)
  await plant('agent_trades', { chain: 'rls-canary', token_address: '0x0000000000000000000000000000000000000000', token_symbol: 'RLSTEST', direction: 'BUY', amount_usd: 0, status: 'simulated', llm_reasoning: MARK }, true, { llm_reasoning: 'TAMPERED' });
  await plant('agent_messages', { wallet_address: CANARY_WALLET, advisor_name: 'rls-canary', message: MARK }, false, { message: 'TAMPERED' });
  await plant('user_interests', { wallet_address: CANARY_WALLET, asset: 'RLSTEST', context: MARK }, false, { context: 'TAMPERED' });
  await plant('user_digests', { wallet_address: CANARY_WALLET, summary: MARK }, false, { summary: 'TAMPERED' });
  await plant('mcp_payment_challenges', { tool_name: 'rls-canary', status: 'pending', metadata: { mark: MARK } }, false, { status: 'TAMPERED' }, 'challenge_id');
}

async function attackCanaries(): Promise<void> {
  for (const c of canaries) {
    const where = `${c.table}?${c.pk}=eq.${c.id}`;
    // SELECT
    const sel = await fetch(`${URL_}/rest/v1/${where}&select=${c.pk}`, { headers: anonHeaders });
    const selRows = sel.ok ? ((await sel.json()) as unknown[]).length : 0;
    line(c.visibleToAnon ? sel.ok && selRows === 1 : selRows === 0, `anon SELECT ${c.table} canary → ${c.visibleToAnon ? 'visible' : 'hidden'}`, `HTTP ${sel.status} rows=${selRows}`);
    // UPDATE
    const upd = await fetch(`${URL_}/rest/v1/${where}`, { method: 'PATCH', headers: anonHeaders, body: JSON.stringify(c.patch) });
    const updText = await upd.text();
    let updRows = 0; try { const j = JSON.parse(updText); updRows = Array.isArray(j) ? j.length : 0; } catch { /* not json */ }
    const after = await fetch(`${URL_}/rest/v1/${where}&select=*`, { headers: svcHeaders });
    const afterRow = ((await after.json()) as Array<Record<string, unknown>>)[0] || {};
    const key = Object.keys(c.patch)[0];
    const untouched = afterRow[key] !== c.patch[key];
    line(updRows === 0 && untouched, `anon UPDATE ${c.table} canary → refused and row untouched`, `HTTP ${upd.status} rows=${updRows} ${updText.slice(0, 80)}`);
    // DELETE
    const del = await fetch(`${URL_}/rest/v1/${where}`, { method: 'DELETE', headers: anonHeaders });
    const still = await fetch(`${URL_}/rest/v1/${where}&select=${c.pk}`, { headers: svcHeaders });
    const stillRows = still.ok ? ((await still.json()) as unknown[]).length : 0;
    line(stillRows === 1, `anon DELETE ${c.table} canary → row still exists`, `HTTP ${del.status}`);
  }
  // INSERT attempts (must be refused with 401/403; 400 = inconclusive = fail)
  const inserts: Array<[string, Record<string, unknown>]> = [
    ['agent_cycles', { status: 'failed', error: `${MARK}-anon-insert` }],
    ['forum_threads', { topic: `${MARK}-anon-insert`, trigger_reason: 'x', scope: 'public' }],
    ['forum_posts', { thread_id: canaries.find((c) => c.table === 'forum_threads')?.id, agent: 'cio', content: `${MARK}-anon-insert` }],
    ['agent_trades', { chain: 'x', token_address: '0x0', token_symbol: 'X', direction: 'long', amount_usd: 0 }],
    ['agent_messages', { wallet_address: CANARY_WALLET, advisor_name: 'x', message: `${MARK}-anon-insert` }],
    ['user_interests', { wallet_address: CANARY_WALLET, asset: 'ANONINS' }],
    ['user_digests', { wallet_address: CANARY_WALLET, summary: `${MARK}-anon-insert` }],
    ['mcp_payment_challenges', { tool_name: 'x' }],
    ['telegram_connections', { connect_token: MARK, telegram_user_id: 0, telegram_chat_id: 0, status: 'pending' }],
    ['agent_profiles', { wallet_address: CANARY_WALLET, agent_name: MARK }],
    ['hardness_agent_proofs', { session_id: MARK }],
    ['memory_objects', {}],
  ];
  for (const [table, body] of inserts) {
    const r = await fetch(`${URL_}/rest/v1/${table}`, { method: 'POST', headers: anonHeaders, body: JSON.stringify(body) });
    const text = await r.text();
    if (r.ok) {
      line(false, `anon INSERT ${table} → refused`, `INSERT SUCCEEDED (HTTP ${r.status})`);
      try { for (const row of JSON.parse(text) as Array<Record<string, string>>) { const pk = table === 'mcp_payment_challenges' ? 'challenge_id' : 'id'; if (row[pk]) await fetch(`${URL_}/rest/v1/${table}?${pk}=eq.${row[pk]}`, { method: 'DELETE', headers: svcHeaders }); } } catch { /* ignore */ }
    } else {
      line(r.status === 401 || r.status === 403, `anon INSERT ${table} → refused by RLS`, `HTTP ${r.status} ${r.status === 400 ? 'INCONCLUSIVE (schema error, not RLS)' : ''} ${text.slice(0, 80)}`);
    }
  }
  // user_feedback: anon INSERT is the one allowed write
  // The policy is INSERT-only for anon (no SELECT), so the insert must not ask for the row back.
  const fb = await fetch(`${URL_}/rest/v1/user_feedback`, { method: 'POST', headers: { ...anonHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ type: 'bug', message: MARK, page: '/rls-gate', context: { canary: true } }) });
  line(fb.ok, 'anon INSERT user_feedback (valid payload, return=minimal) → succeeds by design', `HTTP ${fb.status} ${fb.ok ? '' : await fb.clone().text().catch(() => '')}`);
  const fbRows = await fetch(`${URL_}/rest/v1/user_feedback?message=eq.${encodeURIComponent(MARK)}&select=id`, { headers: svcHeaders });
  const fbIds = fbRows.ok ? ((await fbRows.json()) as Array<{ id: string }>).map((r) => r.id) : [];
  line(fbIds.length === (fb.ok ? 1 : 0), 'user_feedback row visible to the service role (and removed)', `rows=${fbIds.length}`);
  for (const id of fbIds) await fetch(`${URL_}/rest/v1/user_feedback?id=eq.${id}`, { method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' } });
}

async function removeCanaries(): Promise<void> {
  // posts before threads
  for (const c of [...canaries].sort((a, b) => (a.table === 'forum_posts' ? -1 : b.table === 'forum_posts' ? 1 : 0))) {
    const r = await fetch(`${URL_}/rest/v1/${c.table}?${c.pk}=eq.${c.id}`, { method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' } });
    if (!r.ok) console.log(`WARN   could not remove canary ${c.table}/${c.id} (HTTP ${r.status}) — delete rows whose text contains ${MARK}`);
  }
}

// ---------- C. legitimate path ----------
async function legitimatePath(): Promise<void> {
  console.log('\nC. Legitimate path (throw-away wallet through the API)');
  const account = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`);
  const wallet = account.address.toLowerCase();
  const base = { Origin: ORIGIN, 'Content-Type': 'application/json' };
  const ch = await fetch(`${API}/api/wallet-session?address=${wallet}`, { headers: base });
  const chJson = (await ch.json().catch(() => ({}))) as { nonce?: string; message?: string; error?: string };
  line(ch.ok && Boolean(chJson.nonce && chJson.message), 'GET /api/wallet-session?address= issues a single-use challenge', `HTTP ${ch.status} ${chJson.error || ''}`);
  if (!chJson.nonce || !chJson.message) return;
  const signature = await account.signMessage({ message: chJson.message });
  const sess = await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: base, body: JSON.stringify({ address: wallet, nonce: chJson.nonce, signature }) });
  const sessJson = (await sess.json().catch(() => ({}))) as { token?: string; error?: string };
  line(sess.ok && Boolean(sessJson.token), 'POST /api/wallet-session issues a token for a valid signature', `HTTP ${sess.status} ${sessJson.error || ''}`);
  const replay = await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: base, body: JSON.stringify({ address: wallet, nonce: chJson.nonce, signature }) });
  line(replay.status === 401, 'REPLAY of the same nonce + signature → 401 (nonce consumed)', `HTTP ${replay.status}`);
  const ch2 = await fetch(`${API}/api/wallet-session?address=${CANARY_WALLET}`, { headers: base });
  const ch2Json = (await ch2.json().catch(() => ({}))) as { nonce?: string };
  const bad = ch2Json.nonce ? await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: base, body: JSON.stringify({ address: CANARY_WALLET, nonce: ch2Json.nonce, signature }) }) : null;
  line(bad?.status === 401, 'signature reused against a challenge for another address → 401', `HTTP ${bad?.status}`);
  if (!sessJson.token) return;
  const authed = { ...base, 'x-bobby-session': sessJson.token };

  const noSession = await fetch(`${API}/api/user-interests`, { method: 'POST', headers: base, body: JSON.stringify({ assets: ['RLSTEST'], context: MARK }) });
  line(noSession.status === 401, 'POST /api/user-interests without session → 401', `HTTP ${noSession.status}`);
  const mismatch = await fetch(`${API}/api/user-interests`, { method: 'POST', headers: authed, body: JSON.stringify({ wallet: CANARY_WALLET, assets: ['RLSTEST'], context: MARK }) });
  line(mismatch.status === 403, 'POST /api/user-interests with another wallet in the body → 403', `HTTP ${mismatch.status}`);
  const write = await fetch(`${API}/api/user-interests`, { method: 'POST', headers: authed, body: JSON.stringify({ assets: ['RLSTEST'], context: MARK }) });
  const writeJson = (await write.json().catch(() => ({}))) as { inserted?: number; updated?: number; error?: string };
  line(write.ok && (writeJson.inserted ?? 0) + (writeJson.updated ?? 0) >= 1, 'POST /api/user-interests with session → row written', `HTTP ${write.status} ${JSON.stringify(writeJson)}`);
  const read = await fetch(`${API}/api/user-interests?limit=5`, { headers: authed });
  const rows = (await read.json().catch(() => [])) as Array<{ asset: string; context: string }>;
  line(read.ok && rows.some((r) => r.asset === 'RLSTEST' && r.context === MARK), 'GET /api/user-interests returns the row just written', `HTTP ${read.status} rows=${Array.isArray(rows) ? rows.length : 'n/a'}`);
  const inboxNoSession = await fetch(`${API}/api/agent-messages?limit=1`);
  line(inboxNoSession.status === 401, 'GET /api/agent-messages without session → 401', `HTTP ${inboxNoSession.status}`);
  // Forum publication: one receipt → one thread; the same receipt again → 409 (atomic RPC, PK on receipt id)
  if (process.env.BOBBY_TRANSCRIPT_SECRET || process.env.BOBBY_SESSION_SECRET) {
    const { issueTranscriptReceipt, signReceiptPayload, transcriptHash } = await import('../../api/_lib/transcript-receipt.js');
    const transcript = `**ALPHA HUNTER:** ${MARK} RLSTEST looks strong.\n\n**RED TEAM:** crowded.\n\n**MY VERDICT:** Long BTC at 62,000, stop 60,500, target 66,000. Conviction 7/10.\n\n`;
    const rc = issueTranscriptReceipt(transcript, { wallet, userQuestion: 'BTC?' });
    if (rc) {
      // Pre-flight the persisted window: six calls follow and every one must land.
      const win = await forumPublishWindow();
      // Six calls need six free slots: ANY hit in the live window blocks a clean run.
      if (win && win.count > 0 && win.resetAt > Date.now()) {
        console.log(`     persisted limiter shows ${win.count} forum-publish hit(s) in the current window`);
        await waitForWindow(win.resetAt, 'api_cache');
      } else if (!win) {
        console.log('     could not resolve the persisted forum-publish window (IP/salt) — relying on Retry-After');
      }
      let pub1 = await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript, receipt: rc.token }) });
      if (pub1.status === 429) {
        // First call already refused: nothing was spent on semantics yet, so
        // wait for the real expiry (Retry-After is computed from api_cache) and
        // try the sequence exactly once more.
        const retryAfter = Number(pub1.headers.get('retry-after') || 0);
        const ok = await waitForWindow(Date.now() + Math.max(1, retryAfter) * 1000, `Retry-After ${retryAfter}s`);
        if (ok) pub1 = await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript, receipt: rc.token }) });
      }
      const pub1Json = (await pub1.json().catch(() => ({}))) as { threadId?: string; error?: string };
      line(pub1.ok && Boolean(pub1Json.threadId), 'POST /api/forum-publish with a valid receipt → thread created atomically', `HTTP ${pub1.status} ${pub1Json.error || ''}`);
      if (pub1Json.threadId) {
        const stored = await fetch(`${URL_}/rest/v1/forum_threads?id=eq.${pub1Json.threadId}&select=conviction_score,owner_wallet,scope`, { headers: svcHeaders });
        const row = ((await stored.json().catch(() => [])) as Array<{ conviction_score: number; owner_wallet: string; scope: string }>)[0];
        line(Boolean(row) && Math.abs(row.conviction_score - 0.7) < 1e-6, '"7/10" is stored as conviction_score 0.7 (protocol scale)', `stored=${row?.conviction_score}`);
        line(Boolean(row) && row.owner_wallet === wallet && row.scope === 'public', 'thread owned by the session wallet, public scope', `owner=${row?.owner_wallet}`);
      }
      // guest receipt (wallet null) crafted with the secret → must be refused
      const guest = signReceiptPayload({ id: '00000000-0000-4000-8000-00000000c0de', iat: Date.now(), wallet: null, th: transcriptHash(transcript), f: rc.payload.f, p: true });
      const pubGuest = guest ? await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript, receipt: guest }) }) : null;
      line(pubGuest?.status === 403, 'receipt without wallet (guest) → 403', `HTTP ${pubGuest?.status}`);
      const other = issueTranscriptReceipt(transcript, { wallet: CANARY_WALLET, userQuestion: 'BTC?' });
      const pubOther = other ? await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript, receipt: other.token }) }) : null;
      line(pubOther?.status === 403, "another wallet's receipt → 403", `HTTP ${pubOther?.status}`);
      const badConv = signReceiptPayload({ ...rc.payload, id: '00000000-0000-4000-8000-0000000000c1', f: { ...rc.payload.f, conviction_score: 70 } });
      const pubBad = badConv ? await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript, receipt: badConv }) }) : null;
      line(pubBad?.status === 403 || pubBad?.status === 400, 'receipt with conviction 70 (wrong scale) → rejected', `HTTP ${pubBad?.status}`);
      const pub2 = await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript, receipt: rc.token }) });
      line(pub2.status === 409, 'SAME receipt again → 409 (single use)', `HTTP ${pub2.status}`);
      const edited = await fetch(`${API}/api/forum-publish`, { method: 'POST', headers: authed, body: JSON.stringify({ language: 'en', transcript: transcript + ' (edited)', receipt: rc.token }) });
      line(edited.status === 403, 'edited transcript with the old receipt → 403', `HTTP ${edited.status}`);
      if (pub1Json.threadId) {
        await fetch(`${URL_}/rest/v1/forum_posts?thread_id=eq.${pub1Json.threadId}`, { method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' } });
        await fetch(`${URL_}/rest/v1/forum_threads?id=eq.${pub1Json.threadId}`, { method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' } });
        await fetch(`${URL_}/rest/v1/forum_publish_receipts?receipt_id=eq.${rc.payload.id}`, { method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' } });
      }
    }
  } else {
    line(false, 'forum-publish single-use proof', 'set BOBBY_TRANSCRIPT_SECRET (same value as the deployment) so the gate can mint a receipt');
  }
  const threads = await fetch(`${API}/api/my-threads?limit=1`, { headers: authed });
  line(threads.ok, 'GET /api/my-threads with session → 200', `HTTP ${threads.status}`);
  const del = await fetch(`${API}/api/agent-messages`, { method: 'DELETE', headers: authed, body: JSON.stringify({ wallet: CANARY_WALLET }) });
  line(del.status === 403, 'DELETE /api/agent-messages naming another wallet → 403', `HTTP ${del.status}`);
  // cleanup the legit row
  await fetch(`${URL_}/rest/v1/user_interests?wallet_address=eq.${wallet}`, { method: 'DELETE', headers: { ...svcHeaders, Prefer: 'return=minimal' } });
  // public reads still work
  const pub = await fetch(`${URL_}/rest/v1/forum_threads?select=id&limit=1`, { headers: anonHeaders });
  line(pub.ok, 'anon SELECT forum_threads (public read) still works', `HTTP ${pub.status}`);
  const health = await fetch(`${API}/api/bobby-health`);
  line(health.ok, 'GET /api/bobby-health', `HTTP ${health.status}`);
  const healthJson = (await health.json().catch(() => ({}))) as { ops?: { rateLimitSaltConfigured?: boolean }; deployment?: { sha?: string | null } };
  line(healthJson.ops?.rateLimitSaltConfigured === true, 'deployment runs with a real RATE_LIMIT_SALT (IP hashes not enumerable)', `rateLimitSaltConfigured=${healthJson.ops?.rateLimitSaltConfigured}`);
  line(Boolean(healthJson.deployment?.sha), 'deployment reports its commit SHA', `sha=${healthJson.deployment?.sha ?? 'null'}`);
}

(async () => {
  console.log(`RLS adversarial gate v2 — ${URL_} · ${API} · marker ${MARK}`);
  try {
    if (SECTIONS.has('A')) await policyMatrix();
    if (SECTIONS.has('B')) { await plantCanaries(); await attackCanaries(); }
  } finally {
    if (SECTIONS.has('B')) await removeCanaries();
  }
  if (SECTIONS.has('C')) await legitimatePath();
  if (SECTIONS.size < 3) console.log(`\n(partial run: sections ${[...SECTIONS].join('')} — a full GATE PASSED requires ABC)`);
  if (rateLimited > 0 && rateLimited === failures) {
    const retryAt = new Date(Date.now() + 3600_000).toISOString().slice(11, 16);
    console.log(`\nRATE-LIMITED: the only failures are ${rateLimited} HTTP 429 from /api/forum-publish (6/h per IP, persisted in api_cache — a new deployment does NOT reset it).\nNot a security finding, but not a verdict either — rerun ONCE after the window expires (about ${retryAt} UTC; the run waits by itself unless GATE_WAIT_FOR_RATE_LIMIT=0).`);
  }
  const full = SECTIONS.size === 3;
  console.log(failures === 0
    ? (full ? '\nGATE PASSED: policy matrix exact, canaries untouched, legitimate path proven.' : `\nSECTION(S) ${[...SECTIONS].join('')} PASSED — not a full gate verdict.`)
    : `\nGATE FAILED: ${failures} problem(s). Do not cut over.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => { console.error('gate crashed:', error); process.exit(1); });
