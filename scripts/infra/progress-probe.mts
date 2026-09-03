#!/usr/bin/env -S npx tsx
// Smoke of /api/progress against a deployment with a throw-away wallet (sign-in → awards → cap → idempotency → import). Prints IDENTITY_ID for cleanup.
import { randomBytes, randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
const API = 'https://bobbyprotocol.xyz'; const base = { Origin: API, 'Content-Type': 'application/json' };
const acct = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`); const wallet = acct.address.toLowerCase();
const ch = await (await fetch(`${API}/api/wallet-session?address=${wallet}`, { headers: base })).json() as { nonce: string; message: string };
const sig = await acct.signMessage({ message: ch.message });
const sess = await (await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: base, body: JSON.stringify({ address: wallet, nonce: ch.nonce, signature: sig }) })).json() as { token: string };
const authed = { ...base, 'x-bobby-session': sess.token };
const noAuth = await fetch(`${API}/api/progress`); console.log('GET without session →', noAuth.status, '(expect 401)');
const g0 = await (await fetch(`${API}/api/progress`, { headers: authed })).json() as any; console.log('GET fresh →', JSON.stringify({ via: g0.progress.identity.via, xp: g0.progress.xp, streak: g0.progress.streak }));
const ev = (kind: string) => ({ id: randomUUID(), kind, at: new Date().toISOString(), tzOffsetMin: -120 });
const events = [ev('read_complete'), ev('no_trade_respected'), ev('read_complete'), ev('read_complete')];
const p1 = await (await fetch(`${API}/api/progress`, { method: 'POST', headers: authed, body: JSON.stringify({ platform: 'web', events, profile: { companionId: 'byte', vibeId: 'directo', onboarded: true, riskNoticeVersion: 1, quickAccess: ['BTC', 'ETH'], localXpClaim: 120 } }) })).json() as any;
console.log('POST 4 events + profile →', JSON.stringify({ xp: p1.progress.xp, streak: p1.progress.streak, dailyAwards: p1.progress.dailyAwards, awarded: p1.results.map((r: any) => r.awarded), legacyImported: p1.legacyImported, companion: p1.progress.companionId }));
const p2 = await (await fetch(`${API}/api/progress`, { method: 'POST', headers: authed, body: JSON.stringify({ platform: 'web', events: [events[0]] }) })).json() as any;
console.log('POST same event again →', JSON.stringify({ xp: p2.progress.xp, duplicate: p2.results[0].duplicate, awarded: p2.results[0].awarded }));
const bad = await fetch(`${API}/api/progress`, { method: 'POST', headers: authed, body: JSON.stringify({ platform: 'web', events: [{ id: randomUUID(), kind: 'give_me_xp', at: new Date().toISOString() }] }) }); console.log('POST unknown kind →', bad.status, '(expect 400)');
const g1 = await (await fetch(`${API}/api/progress`, { headers: authed })).json() as any; console.log('GET after →', JSON.stringify({ xp: g1.progress.xp, streak: g1.progress.streak, recent: g1.recent.length, identityId: g1.progress.identity.id.slice(0, 8) }));
console.log('IDENTITY_ID=' + g1.progress.identity.id);
