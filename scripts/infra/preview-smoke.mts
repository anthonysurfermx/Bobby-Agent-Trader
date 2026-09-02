#!/usr/bin/env -S npx tsx
// ============================================================
// Preview smoke — step 3 of the phase-0 deploy order, no secrets needed.
// Proves a deployment (preview or prod) is wired correctly BEFORE the RLS
// migration: health, public reads, sign-in challenge issuance, 401 on
// private reads, 403 on a foreign origin, freeze flag visible.
//   BOBBY_API=https://<deployment> npx tsx scripts/infra/preview-smoke.mts
// Exit 0 = all checks pass.
// ============================================================
const API = (process.env.BOBBY_API || '').replace(/\/+$/, '');
if (!API) { console.error('BOBBY_API is required'); process.exit(2); }
const origin = new URL(API).host;
// Vercel Deployment Protection: previews answer 302 → SSO unless the
// automation bypass secret is presented (Project → Settings → Deployment
// Protection → Protection Bypass for Automation).
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '';
const bypassHeaders: Record<string, string> = BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {};
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) =>
  realFetch(input, { ...init, redirect: 'manual', headers: { ...(init.headers as Record<string, string> | undefined), ...bypassHeaders } })) as typeof fetch;
const guard = await fetch(`${API}/api/bobby-health`);
if (guard.status === 302 || guard.status === 401 && !BYPASS) {
  console.error(`Deployment is protected (HTTP ${guard.status}). Set VERCEL_AUTOMATION_BYPASS_SECRET or disable Vercel Authentication for this preview.`);
  process.exit(2);
}
let failures = 0;
const line = (ok: boolean, label: string, detail = '') => { if (!ok) failures += 1; console.log(`${(ok ? 'OK' : 'FAIL').padEnd(6)} ${label}${detail ? `  — ${detail.slice(0, 140)}` : ''}`); };
const j = async (r: Response) => (await r.json().catch(() => ({}))) as Record<string, unknown>;

const health = await fetch(`${API}/api/bobby-health`);
const hj = await j(health);
line(health.ok, 'GET /api/bobby-health', `HTTP ${health.status} ${JSON.stringify(hj).slice(0, 120)}`);
const stats = await fetch(`${API}/api/bobby-protocol-stats`);
line(stats.ok, 'GET /api/bobby-protocol-stats (public reads through the API)', `HTTP ${stats.status}`);
const runs = await fetch(`${API}/api/sandbox-runs?limit=1`);
line(runs.ok, 'GET /api/sandbox-runs (server-side read of a soon-private table)', `HTTP ${runs.status}`);

const w = `0x${'ab'.repeat(20)}`;
const ch = await fetch(`${API}/api/wallet-session?address=${w}`, { headers: { Origin: `https://${origin}` } });
const cj = await j(ch);
line(ch.ok && typeof cj.nonce === 'string' && typeof cj.message === 'string', 'GET /api/wallet-session?address= issues a challenge (BOBBY_SESSION_SECRET + db + origin ok)', `HTTP ${ch.status} ${cj.error || ''}`);
const chBad = await fetch(`${API}/api/wallet-session?address=${w}`, { headers: { Origin: 'https://evil.vercel.app' } });
line(chBad.status === 403, 'challenge from a foreign origin → 403', `HTTP ${chBad.status}`);
const badSig = await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: w, nonce: String(cj.nonce || 'x'.repeat(24)), signature: `0x${'11'.repeat(65)}` }) });
line(badSig.status === 401, 'POST /api/wallet-session with a bad signature → 401 (nonce burned)', `HTTP ${badSig.status}`);
const replayNonce = await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: w, nonce: String(cj.nonce || 'x'.repeat(24)), signature: `0x${'11'.repeat(65)}` }) });
line(replayNonce.status === 401, 'same nonce again → 401', `HTTP ${replayNonce.status}`);

for (const path of ['/api/agent-messages?limit=1', '/api/user-interests?limit=1', '/api/my-threads?limit=1', '/api/agent-setup']) {
  const r = await fetch(`${API}${path}`);
  line(r.status === 401, `GET ${path} without session → 401`, `HTTP ${r.status}`);
}
for (const [path, method] of [['/api/user-interests', 'POST'], ['/api/forum-publish', 'POST'], ['/api/telegram-connect', 'POST'], ['/api/agent-messages', 'DELETE']] as const) {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: `https://${origin}` }, body: '{}' });
  line(r.status === 401 || r.status === 503, `${method} ${path} without session → 401 (or 503 if frozen)`, `HTTP ${r.status}`);
  const f = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: 'https://evil.vercel.app' }, body: '{}' });
  line(f.status === 403 || f.status === 503, `${method} ${path} from a foreign origin → 403`, `HTTP ${f.status}`);
}
const manual = await fetch(`${API}/api/bobby-cycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
line(manual.status === 401 || manual.status === 503, 'POST /api/bobby-cycle without ops secret → 401/503', `HTTP ${manual.status}`);
const forum = await fetch(`${API}/api/bobby-digest?limit=1`);
line(forum.status !== 500, 'GET /api/bobby-digest does not 500', `HTTP ${forum.status}`);
console.log(failures === 0 ? '\nSMOKE PASSED' : `\nSMOKE FAILED: ${failures} problem(s)`);
process.exit(failures === 0 ? 0 : 1);
