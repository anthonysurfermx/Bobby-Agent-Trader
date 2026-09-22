// Operator-only tool. Credentials stay in the environment, never in the app.
// npx tsx scripts/trader-land-moderation.mts queue
// ... ban <share-code> | restore <share-code> | dismiss <report-uuid> | prune
import { bobbyDbUrl, bobbyRest, bobbyServiceHeaders } from '../api/_lib/bobby-db.js';
const [action = 'queue', value] = process.argv.slice(2).filter(x => x !== '--allow-production');
if (!['localhost','127.0.0.1','::1'].includes(new URL(bobbyDbUrl()).hostname) && !process.argv.includes('--allow-production')) {
  throw new Error('Remote database: add --allow-production after verifying the configured Bobby project.');
}
async function request(path: string, method = 'GET', body?: unknown) {
  const r = await fetch(bobbyRest(path), { method, headers: bobbyServiceHeaders({ Prefer:'return=representation' }), body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`Moderation operation failed (${r.status})`);
  return r.status === 204 ? [] : await r.json();
}
if (action === 'queue') {
  console.log(JSON.stringify(await request('tl_content_reports?status=eq.open&order=created_at.asc&limit=100&select=id,code,title,reason,details,created_at'), null, 2));
} else if (action === 'dismiss') {
  if (!/^[a-f0-9-]{36}$/i.test(value ?? '')) throw new Error('Expected report UUID');
  console.log(await request(`tl_content_reports?id=eq.${value}&status=eq.open`, 'PATCH', { status:'dismissed', reviewed_at:new Date().toISOString() }));
} else if (action === 'prune') {
  const before = new Date(Date.now() - 90 * 86400000).toISOString();
  const removed = await request(`tl_content_reports?status=neq.open&reviewed_at=lt.${before}`, 'DELETE');
  console.log({ removed: removed.length });
} else {
  if (!['ban','restore'].includes(action) || !/^[a-z0-9]{10}$/.test(value ?? '')) throw new Error('Expected ban or restore and a share code');
  const [land] = await request(`tl_lands?share_code=eq.${value}&select=identity_id,title,visibility&limit=1`);
  if (!land) throw new Error('Island not found');
  if (action === 'ban') {
    await request(`tl_lands?identity_id=eq.${land.identity_id}`, 'PATCH', { community_blocked:true, moderation_status:'rejected', visibility:'private' });
    await request(`tl_content_reports?target_identity=eq.${land.identity_id}&status=eq.open`, 'PATCH', { status:'actioned', reviewed_at:new Date().toISOString() });
  } else if (action === 'restore') {
    // Restoring access never republishes the user's island on their behalf.
    await request(`tl_lands?identity_id=eq.${land.identity_id}`, 'PATCH', { community_blocked:false });
  }
  console.log({ ok:true, action, code:value });
}
