#!/usr/bin/env -S npx tsx
// End-to-end probe of /api/identity-link on a deployment: a wallet identity and a
// Supabase-auth identity each earn awards, the wallet issues a code, the account
// claims it, and both doors must then see ONE progress. Creates a throw-away auth
// user with the service key and deletes everything at the end.
import { randomBytes, randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
const API = process.env.BOBBY_API || 'https://bobbyprotocol.xyz'; const base = { Origin: API, 'Content-Type': 'application/json' };
const SB = process.env.BOBBY_SUPABASE_URL!, ANON = process.env.BOBBY_SUPABASE_ANON_KEY!, SVC = process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY!;
const ev = (kind: string) => ({ id: randomUUID(), kind, at: new Date().toISOString(), tzOffsetMin: -120 });
const j = async (r: Response) => (await r.json().catch(() => ({}))) as any;
// wallet door
const acct = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`); const wallet = acct.address.toLowerCase();
const ch = await j(await fetch(`${API}/api/wallet-session?address=${wallet}`, { headers: base }));
const sess = await j(await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: base, body: JSON.stringify({ address: wallet, nonce: ch.nonce, signature: await acct.signMessage({ message: ch.message }) }) }));
const W = { ...base, 'x-bobby-session': sess.token };
const w1 = await j(await fetch(`${API}/api/progress`, { method: 'POST', headers: W, body: JSON.stringify({ platform: 'web', events: [ev('read_complete'), ev('no_trade_respected')], profile: { companionId: 'byte' } }) }));
console.log('wallet identity →', JSON.stringify({ id: w1.progress.identity.id.slice(0, 8), xp: w1.progress.xp, aura: w1.progress.aura, route: w1.progress.routeIndex }));
// apple-style door: a throw-away Supabase auth user (email+password stands in for the Apple id_token)
const email = `probe-${randomUUID().slice(0, 8)}@bobbyprotocol.test`, password = randomBytes(12).toString('hex');
const created = await j(await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true }) }));
const tok = await j(await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }));
const A = { ...base, Authorization: `Bearer ${tok.access_token}` };
const a1 = await j(await fetch(`${API}/api/progress`, { method: 'POST', headers: A, body: JSON.stringify({ platform: 'ios', events: [ev('read_complete')] }) }));
console.log('apple identity  →', JSON.stringify({ id: a1.progress.identity.id.slice(0, 8), via: a1.progress.identity.via, xp: a1.progress.xp, route: a1.progress.routeIndex }));
console.log('two different identities before linking:', w1.progress.identity.id !== a1.progress.identity.id);
// link: the desk issues, the phone claims
const issued = await j(await fetch(`${API}/api/identity-link`, { method: 'POST', headers: W, body: JSON.stringify({ action: 'issue' }) }));
console.log('desk issued code:', issued.code ? `${issued.code.length} chars, expires ${issued.expiresAt?.slice(11, 16)}Z` : issued.error);
const claimed = await j(await fetch(`${API}/api/identity-link`, { method: 'POST', headers: A, body: JSON.stringify({ action: 'claim', code: issued.code }) }));
console.log('phone claimed   →', JSON.stringify(claimed.linked ?? claimed.error));
const again = await fetch(`${API}/api/identity-link`, { method: 'POST', headers: A, body: JSON.stringify({ action: 'claim', code: issued.code }) }); console.log('same code again →', again.status, '(expect 404: single use)');
// both doors now see one progress
const gA = await j(await fetch(`${API}/api/progress`, { headers: A })); const gW = await j(await fetch(`${API}/api/progress`, { headers: W }));
console.log('after link · apple door:', JSON.stringify({ id: gA.progress.identity.id.slice(0, 8), xp: gA.progress.xp, aura: gA.progress.aura, route: gA.progress.routeIndex, wallet: gA.progress.identity.wallet?.slice(0, 8), linkedAuth: gA.progress.identity.linkedAuth }));
console.log('after link · wallet door:', JSON.stringify({ id: gW.progress.identity.id.slice(0, 8), xp: gW.progress.xp, aura: gW.progress.aura, route: gW.progress.routeIndex, linkedAuth: gW.progress.identity.linkedAuth }));
console.log('ONE identity, same numbers on both doors:', gA.progress.identity.id === gW.progress.identity.id && gA.progress.xp === gW.progress.xp && gA.progress.xp === 40);
const world = await j(await fetch(`${API}/api/trader-land`, { headers: A })); console.log('world after link:', JSON.stringify({ inventory: world.inventory.map((i: any) => `${i.item?.id}:${i.state}`), route: world.route.index }));
// a second person cannot claim into an identity that already has another account
const email2 = `probe2-${randomUUID().slice(0, 8)}@bobbyprotocol.test`; const c2 = await j(await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email2, password, email_confirm: true }) }));
const tok2 = await j(await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email2, password }) }));
const B = { ...base, Authorization: `Bearer ${tok2.access_token}` };
await fetch(`${API}/api/progress`, { headers: B }); // creates the second identity
const issued2 = await j(await fetch(`${API}/api/identity-link`, { method: 'POST', headers: W, body: JSON.stringify({ action: 'issue' }) }));
const steal = await fetch(`${API}/api/identity-link`, { method: 'POST', headers: B, body: JSON.stringify({ action: 'claim', code: issued2.code }) }); console.log('another account claiming the linked identity →', steal.status, (await j(steal)).error);
console.log(`CLEANUP=${gA.progress.identity.id}|${created.id}|${c2.id}`);
