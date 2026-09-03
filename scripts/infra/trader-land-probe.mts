#!/usr/bin/env -S npx tsx
// Smoke of /api/progress + /api/trader-land on a deployment with a throw-away wallet:
// read → seed, NO TRADE → bloom, GET world, place, overlap, seed refused, remove. Prints IDENTITY_ID for cleanup.
import { randomBytes, randomUUID } from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
const API = process.env.BOBBY_API || 'https://bobbyprotocol.xyz'; const base = { Origin: API, 'Content-Type': 'application/json' };
const acct = privateKeyToAccount(`0x${randomBytes(32).toString('hex')}`); const wallet = acct.address.toLowerCase();
const ch = await (await fetch(`${API}/api/wallet-session?address=${wallet}`, { headers: base })).json() as { nonce: string; message: string };
const sess = await (await fetch(`${API}/api/wallet-session`, { method: 'POST', headers: base, body: JSON.stringify({ address: wallet, nonce: ch.nonce, signature: await acct.signMessage({ message: ch.message }) }) })).json() as { token: string };
const authed = { ...base, 'x-bobby-session': sess.token };
const ev = (kind: string) => ({ id: randomUUID(), kind, at: new Date().toISOString(), tzOffsetMin: -120 });
const p = await (await fetch(`${API}/api/progress`, { method: 'POST', headers: authed, body: JSON.stringify({ platform: 'web', events: [ev('read_complete'), ev('no_trade_respected')] }) })).json() as any;
console.log('awards →', JSON.stringify({ xp: p.progress.xp, aura: p.progress.aura, routeIndex: p.progress.routeIndex, world: p.results.map((r: any) => r.world ? `${r.world.item?.id}:${r.world.state}` : 'none') }));
const w = await (await fetch(`${API}/api/trader-land`, { headers: authed })).json() as any;
console.log('world →', JSON.stringify({ land: w.land, aura: w.aura, route: { index: w.route.index, total: w.route.total, next: w.route.next?.id }, inventory: w.inventory.map((i: any) => `${i.item?.id}:${i.state}`), catalog: w.catalog.length }));
const seed = w.inventory.find((i: any) => i.state === 'seed'); const bloom = w.inventory.find((i: any) => i.state === 'bloomed');
const r1 = await fetch(`${API}/api/trader-land`, { method: 'POST', headers: authed, body: JSON.stringify({ action: 'place', inventoryId: bloom.id, x: 2, y: 2, rotation: 0 }) }); const j1 = await r1.json() as any; console.log('place bloomed →', r1.status, 'placements=' + (j1.placements?.length ?? j1.error));
const r2 = await fetch(`${API}/api/trader-land`, { method: 'POST', headers: authed, body: JSON.stringify({ action: 'place', inventoryId: bloom.id, x: 3, y: 3, rotation: 0 }) }); console.log('place again →', r2.status, (await r2.json() as any).error);
const r3 = await fetch(`${API}/api/trader-land`, { method: 'POST', headers: authed, body: JSON.stringify({ action: 'place', inventoryId: seed.id, x: 5, y: 5, rotation: 0 }) }); console.log('place a seed →', r3.status, (await r3.json() as any).error);
const r4 = await fetch(`${API}/api/trader-land`, { method: 'POST', headers: authed, body: JSON.stringify({ action: 'place', inventoryId: seed.id, x: 9, y: 9, rotation: 0 }) }); console.log('outside grid (seed) →', r4.status, (await r4.json() as any).error);
const r5 = await fetch(`${API}/api/trader-land`, { method: 'POST', headers: authed, body: JSON.stringify({ action: 'remove', placementId: j1.placed }) }); console.log('remove →', r5.status, 'placements=' + ((await r5.json() as any).placements?.length));
const c = await (await fetch(`${API}/api/progress`, { method: 'POST', headers: authed, body: JSON.stringify({ platform: 'web', events: [ev('thesis_closed')] }) })).json() as any;
console.log('thesis_closed →', JSON.stringify({ xp: c.progress.xp, aura: c.progress.aura, bloomed: c.results[0].world?.bloomedInventoryId ? 'oldest seed bloomed' : 'no seed' }));
const w2 = await (await fetch(`${API}/api/trader-land`, { headers: authed })).json() as any; console.log('inventory after →', JSON.stringify(w2.inventory.map((i: any) => `${i.item?.id}:${i.state}`)));
const anon = await fetch(`${API}/api/trader-land`); console.log('GET without session →', anon.status);
console.log('IDENTITY_ID=' + w.inventory.length + ':' + (p.progress.identity.id));
