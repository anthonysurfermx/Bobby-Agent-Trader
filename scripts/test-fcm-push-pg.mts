// Actual SQL functions and separate PostgreSQL connections, synthetic local fixtures only.
// DATABASE_URL must name the dedicated local bobby_fcm_push_test scratch database.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import * as db from '../api/_lib/briefings/db.js';
import * as crypto from '../api/_lib/briefings/push-crypto.js';
import { FCM_PACKAGE } from '../api/_lib/briefings/fcm.js';
import { assertLocalUrl, bootstrapBriefingsDb, makeIdentity, pgRpcTransport, setPro } from './briefings-pg-harness.mjs';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required: local synthetic FCM PostgreSQL fixtures');
assertLocalUrl(url);
assert.equal(new URL(url).pathname, '/bobby_fcm_push_test', 'dedicated scratch database only');
const pool = await bootstrapBriefingsDb(url);
const rpc = pgRpcTransport(pool); db.setBriefingRpc(rpc);
let checks = 0;
const eq = (got: unknown, want: unknown, why: string) => { assert.deepEqual(got, want, why); checks++; };
const ok = (got: unknown, why: string) => { assert.ok(got, why); checks++; };
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql, args)).rows;
const one = async (sql: string, args: unknown[] = []) => (await q(sql, args))[0];
const identities: string[] = [];
const master = randomBytes(32), project = 'bobby-fcm-fixture';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
async function settings(id: string, patch: Record<string, unknown>) {
  const cur = await db.getSettings(id); const r = await db.patchSettings(id, cur.revision, patch);
  assert.equal(r.ok, true, 'fixture settings');
}
async function owner(consent = true) {
  const id = await makeIdentity(pool, { pro: true }); identities.push(id);
  await settings(id, { weeklyEnabled: true, analysisConsentEnabled: consent, ...(consent ? { analysisConsentVersion: 1 } : {}) });
  return id;
}
function operation(id: string, o: { installation?: string; fid?: string; registration?: string; revision?: number; proof?: string; key?: string } = {}) {
  const fid = o.fid ?? randomBytes(20).toString('base64url'), credential = crypto.newInstallationCredential();
  const installation = o.installation ?? randomUUID();
  const p: Parameters<typeof db.writeDeviceOnce>[0] = { identityId: id, key: o.key ?? randomUUID(), digest: sha(JSON.stringify([id, installation, fid, o.registration, o.revision, o.proof])),
    action: o.registration ? 'rebind' : 'register', installationId: installation, registrationId: o.registration ?? null,
    expectedRevision: o.revision ?? null, proofVerifier: o.proof ? crypto.credentialVerifier(o.proof) : null,
    newVerifier: crypto.credentialVerifier(credential), sealedCredential: crypto.sealReceipt(credential, master),
    write: { provider: 'fcm', fcmProjectId: project, packageName: FCM_PACKAGE, environment: 'production', topic: FCM_PACKAGE, permission: 'authorized', appBuild: 1,
      tokenCiphertext: crypto.encryptFcmTarget(fid, master), tokenFingerprint: crypto.fcmTargetFingerprint(fid, project, FCM_PACKAGE, master) },
    maxActive: 5, analysisConsentVersion: 1 };
  return { p, fid, credential, installation };
}
function receipt(r: db.DeviceWriteOnce) {
  assert.ok(r.state === 'done' || r.state === 'replay');
  return JSON.parse((r as { response: string }).response) as { device: any; sealedCredential?: string };
}
async function register(id: string, o: Parameters<typeof operation>[1] = {}) {
  const op = operation(id, o), result = await db.writeDeviceOnce(op.p);
  assert.equal(receipt(result).device.ok, true, 'fixture registration');
  return { ...op, result, device: receipt(result).device };
}
let period = 0;
async function report(id: string) {
  const date = new Date(Date.UTC(2040, 0, ++period)).toISOString().slice(0, 10);
  return (await one(`insert into bobby_briefs(identity_id,cadence,period_key,period_start,period_end,scheduled_at,push_expires_at,
    calendar_version,policy_version,state,language,content,content_version,privacy_epoch)
    values($1,'weekly',$2,now()-interval '8 days',now()-interval '1 day',now()-interval '1 minute',now()+interval '1 hour',
      'synthetic-local-calendar','synthetic-local-policy','ready','en','{}',1,0) returning id`, [id, date])).id as string;
}
const row = async (id: string) => one('select * from bobby_push_devices where id=$1', [id]);
const outbox = async (brief: string) => q('select * from bobby_brief_outbox where brief_id=$1 order by id', [brief]);
async function onlyFcm(worker = 'fcm-local') { return db.claimOutboxV2(worker, 60, 100, ['fcm'], project); }
async function accepted(it: db.OutboxItem) { await db.outboxResultV2(it.id, it.fence, 'accepted', 200, null, null, 'fcm', `projects/${project}/messages/local-fixture-${it.id}`); }
async function clearPending() { await q("update bobby_brief_outbox set state='cancelled',lease_owner=null,lease_expires_at=null where state in ('pending','claimed')"); }
try {
  eq(await db.fcmMigrationReady(), true, 'migration capability only after schema exists');
  for (const name of ['bobby_brief_fcm_capability_v2', 'bobby_push_device_write_once_fcm_v2', 'bobby_brief_outbox_claim_v2', 'bobby_brief_outbox_result_v2']) {
    const sig = (await one('select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=\'public\' and proname=$1', [name])).sig;
    for (const role of ['anon', 'authenticated']) eq((await one('select has_function_privilege($1,$2,\'EXECUTE\') as yes',[role,sig])).yes,false, `${role} cannot execute ${name}`);
    eq((await one('select has_function_privilege(\'service_role\',$1,\'EXECUTE\') as yes',[sig])).yes,true, `service only ${name}`);
  }
  for (const table of ['bobby_push_devices', 'bobby_brief_outbox']) for (const role of ['anon', 'authenticated']) {
    eq((await one('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') as yes',[role,table])).yes,false, `registry ${table} stays private`);
    eq((await one('select relrowsecurity from pg_class where oid=$1::regclass',[table])).relrowsecurity,true, `RLS remains ${table}`);
  }
  const A = await owner(), B = await owner();
  const op = operation(A);
  // Promise.all uses real separate pooled sessions: receipt INSERT/ON CONFLICT serializes both writes.
  const alternateCredential=crypto.newInstallationCredential();
  const simultaneous = await Promise.all([db.writeDeviceOnce(op.p), db.writeDeviceOnce({ ...op.p, sealedCredential: crypto.sealReceipt(alternateCredential, master), newVerifier: crypto.credentialVerifier(alternateCredential) })]);
  eq(simultaneous.map(r => r.state).sort(), ['done','replay'], 'two actual SQL writers share one committed receipt');
  eq(receipt(simultaneous[0]), receipt(simultaneous[1]), 'race returns exact same registration and proof');
  const committedCredential=crypto.openReceipt(receipt(simultaneous[1]).sealedCredential!, master);
  ok([op.credential,alternateCredential].includes(committedCredential),'lost reply returns a committed writer proof');
  const dev = receipt(simultaneous[0]).device;
  eq((await one('select count(*)::int as n from bobby_push_devices where installation_id=$1',[op.installation])).n,1,'one installation after concurrent replay');
  eq([(await row(dev.registrationId)).provider,(await row(dev.registrationId)).binding_revision],['fcm','1'],'committed provider and revision');
  eq((await row(dev.registrationId)).credential_verifier,crypto.credentialVerifier(committedCredential),'receipt proof matches the winning SQL binding');
  eq(crypto.decryptFcmTarget((await row(dev.registrationId)).token_ciphertext, master), op.fid, 'SQL never stores raw FID');
  eq((await db.writeDeviceOnce({ ...op.p, digest: sha('different-body') })).state,'mismatch','different request cannot reuse receipt key');
  // A committed operation can be recovered after withdrawal without a new binding or proof rotation.
  await settings(A,{analysisConsentEnabled:false});
  eq(receipt(await db.writeDeviceOnce(op.p)),receipt(simultaneous[0]),'committed replay after withdrawal');
  const refused = operation(A); eq(receipt(await db.writeDeviceOnce(refused.p)).device.code,'consent_required','new register requires current analysis');
  eq((await one("select count(*)::int as n from bobby_brief_idempotency where identity_id=$1 and idem_key=$2",[A,refused.p.key])).n,0,'refused operation leaves no stuck receipt');
  await settings(A,{analysisConsentEnabled:true,analysisConsentVersion:1});
  eq(receipt(await db.writeDeviceOnce(refused.p)).device.ok,true,'same previously refused operation allowed after actual consent');
  await settings(A,{analysisConsentVersion:2});
  eq(receipt(await db.writeDeviceOnce(operation(A).p)).device.code,'consent_required','stale or future consent version rejected');
  await settings(A,{analysisConsentVersion:1});
  await settings(A,{weeklyEnabled:false});
  eq(receipt(await db.writeDeviceOnce(operation(A).p)).device.code,'consent_required','weekly opt-out blocks new binding');
  await settings(A,{weeklyEnabled:true});
  // Global active installation and target uniqueness protect simultaneous different owners.
  const sharedInstallation = randomUUID(); const c1 = operation(A,{installation:sharedInstallation}),c2=operation(B,{installation:sharedInstallation});
  const sameInstallation = await Promise.all([db.writeDeviceOnce(c1.p),db.writeDeviceOnce(c2.p)]);
  eq(sameInstallation.map(r=>receipt(r).device.ok).sort(),[false,true],'concurrent owner installation collision has one winner');
  const sameFid=randomBytes(20).toString('base64url'); const c3=operation(A,{fid:sameFid}),c4=operation(B,{fid:sameFid});
  const targetRace=await Promise.all([db.writeDeviceOnce(c3.p),db.writeDeviceOnce(c4.p)]);
  eq(targetRace.map(r=>receipt(r).device.ok).sort(),[false,true],'concurrent FID collision has one winner');
  // Start fresh isolated routing fixtures, preserve the other rows for cascade checks.
  await clearPending(); const R=await owner(); const f=await register(R);
  const apnsProof=crypto.newInstallationCredential(); const apns=await db.registerDevice(R,randomUUID(),{tokenCiphertext:crypto.encryptToken('ab'.repeat(32),master),tokenFingerprint:crypto.tokenFingerprint('ab'.repeat(32),FCM_PACKAGE,'production',master),environment:'production',topic:FCM_PACKAGE,permission:'authorized',appBuild:53},crypto.credentialVerifier(apnsProof),5);
  assert.equal(apns.ok,true); const brief=await report(R); await db.fillOutbox(100);
  eq((await outbox(brief)).length,2,'one report routes separately to APNs and FCM installations');
  const legacy=await db.claimOutbox('apns-local',60,100);
  eq(legacy.map(it=>it.deviceId),[(apns as { registrationId: string }).registrationId],'legacy worker never claims FCM');
  eq(legacy[0].provider,undefined,'legacy APNs claim JSON has no new provider fields');
  eq((await outbox(brief)).find(r=>r.device_id===f.device.registrationId).attempts,0,'unconfigured provider has zero attempts');
  eq((await db.claimOutboxV2('wrong-project',60,100,['fcm'],'different-project')).length,0,'wrong Firebase project never claimed');
  const [it]=await onlyFcm(); eq([it.provider,it.fcmProjectId,it.packageName,it.targetType],['fcm',project,FCM_PACKAGE,'fid'],'canonical provider/project routing fields');
  await db.outboxResultV2(it.id,it.fence,'config',401,'wrong',60,'apns',null);
  eq((await one('select state from bobby_brief_outbox where id=$1',[it.id])).state,'claimed','wrong transport cannot complete FCM claim');
  await assert.rejects(db.outboxResultV2(it.id,it.fence,'accepted',200,null,null,'fcm','projects/different-project/messages/wrong')); checks++;
  eq((await one('select state from bobby_brief_outbox where id=$1',[it.id])).state,'claimed','cross-project receipt cannot falsely complete delivery');
  await accepted(it); const acceptedRow=await one('select state,attempts,provider_status,apns_status,provider_message_id from bobby_brief_outbox where id=$1',[it.id]);
  eq([acceptedRow.state,acceptedRow.attempts,acceptedRow.provider_status,acceptedRow.apns_status],['sent',1,200,null],'sent records provider acceptance, not APNs or handset receipt');
  ok(acceptedRow.provider_message_id.startsWith(`projects/${project}/messages/`),'server-only FCM message receipt retained');
  await db.outboxResult(legacy[0].id,legacy[0].fence,'accepted',200,null,null);
  eq((await one('select apns_status from bobby_brief_outbox where id=$1',[legacy[0].id])).apns_status,200,'legacy APNs result remains valid');
  // Config failure defers without spending an attempt; sender availability cannot invalidate the target.
  const second=await report(R); await db.fillOutbox(100); const [configIt]=await onlyFcm();
  await db.outboxResultV2(configIt.id,configIt.fence,'config',403,'sender_mismatch',60,'fcm',null);
  eq((await one('select state,attempts from bobby_brief_outbox where id=$1',[configIt.id])),{state:'pending',attempts:0},'config retry preserves attempt count');
  await q('update bobby_brief_outbox set due_at=now() where id=$1',[configIt.id]);
  const [claimed]=await onlyFcm();
  const rebound=await register(B,{installation:f.installation, fid:f.fid, registration:f.device.registrationId,revision:1,proof:f.credential});
  eq(rebound.device.bindingRevision,2,'proven A to B switch bumps revision');
  eq(await db.revokeDevice(R,f.device.registrationId,1,crypto.credentialVerifier(f.credential)),{ok:true,state:'already'},'late outgoing owner cleanup cannot revoke B');
  await db.outboxResultV2(claimed.id,claimed.fence,'invalid_token',404,'unregistered',null,'fcm',null);
  eq([(await row(f.device.registrationId)).identity_id,(await row(f.device.registrationId)).status],[B,'active'],'late provider failure cannot invalidate new owner');
  eq((await one('select state from bobby_brief_outbox where id=$1',[claimed.id])).state,'cancelled','outgoing owner intent cancelled');
  // Same owner rotation revokes the old send fence, while pending intent uses the new binding.
  await clearPending(); const third=await report(B); await db.fillOutbox(100); const bitems=await onlyFcm();
  const rotating=bitems.find(x=>x.deviceId===f.device.registrationId)!; ok(rotating,'new owner report includes proven installation');
  const rot=await register(B,{installation:f.installation,registration:f.device.registrationId,revision:2,proof:rebound.credential});
  await db.outboxResultV2(rotating.id,rotating.fence,'invalid_token',404,'unregistered',null,'fcm',null);
  eq([(await row(f.device.registrationId)).status,(await row(f.device.registrationId)).binding_revision],['active','3'],'same-owner rotation rejects old send result');
  const rotatedIntent=await one('select state,binding_revision,fence from bobby_brief_outbox where id=$1',[rotating.id]);
  eq([rotatedIntent.state,rotatedIntent.binding_revision],['pending','3'],'intent re-fenced to current revision');
  ok(Number(rotatedIntent.fence)>rotating.fence,'fence advances on FCM rotation');
  // v1 proven APNs switch clears all FCM metadata and also invalidates the previous FCM lease.
  const afterRotate=(await onlyFcm()).find(x=>x.deviceId===f.device.registrationId)!;
  const appleNewProof=crypto.newInstallationCredential();
  const switched=await db.rebindDevice(B,f.device.registrationId,3,crypto.credentialVerifier(rot.credential),crypto.credentialVerifier(appleNewProof),{tokenCiphertext:crypto.encryptToken('cd'.repeat(32),master),tokenFingerprint:crypto.tokenFingerprint('cd'.repeat(32),FCM_PACKAGE,'production',master),environment:'production',topic:FCM_PACKAGE,permission:'authorized',appBuild:53},5);
  eq(switched.ok,true,'v1 APNs proven switch remains supported');
  const switchedRow=await row(f.device.registrationId);
  eq([switchedRow.provider,switchedRow.fcm_project_id,switchedRow.package_name,switchedRow.target_type],['apns',null,null,null],'APNs v1 clears FCM metadata explicitly');
  await db.outboxResultV2(afterRotate.id,afterRotate.fence,'invalid_token',404,'unregistered',null,'fcm',null);
  eq((await row(f.device.registrationId)).status,'active','FCM late callback cannot invalidate APNs switch');
  // Consent withdrawal cancels current FCM work at claim while APNs behavior stays baseline.
  await clearPending(); const S=await owner(); const sf=await register(S); const sr=await report(S); await db.fillOutbox(100);
  await settings(S,{analysisConsentEnabled:false});
  eq((await onlyFcm()).filter(x=>x.deviceId===sf.device.registrationId).length,0,'withdrawal cannot dispatch FCM');
  eq((await outbox(sr))[0].state,'cancelled','withdrawn consent cancels unsent intent');
  await settings(S,{analysisConsentEnabled:true,analysisConsentVersion:1});
  const nr=await report(S); await db.fillOutbox(100); await setPro(pool,S,false);
  eq((await onlyFcm()).filter(x=>x.deviceId===sf.device.registrationId).length,0,'lapsed paid proof never dispatches FCM');
  eq((await outbox(nr))[0].state,'cancelled','lapsed subscription work is cancelled');
  // Two workers SKIP LOCKED never receive the same intent.
  await clearPending(); await setPro(pool,S,true); const cr=await report(S); await db.fillOutbox(100);
  const workerRace=await Promise.all([onlyFcm('first-worker'),onlyFcm('second-worker')]);
  eq(workerRace.flat().filter(x=>x.briefId===cr).length,1,'two real SQL workers claim once');
  const current=workerRace.flat().find(x=>x.briefId===cr)!;
  await db.outboxResultV2(current.id,current.fence,'retry',429,'provider_quota',120,'fcm',null);
  const quota=await one('select state,attempts,extract(epoch from due_at-now()) as delay from bobby_brief_outbox where id=$1',[current.id]);
  eq([quota.state,quota.attempts],['pending',1],'rate-limited send accounts one attempt'); ok(Number(quota.delay)>115,'Google quota delay never retried immediately');
  // Installation mismatch is a transaction failure: no rotated proof, registry write or replay receipt.
  const M=await owner(); const m=await register(M); const mismatch=operation(M,{installation:randomUUID(),registration:m.device.registrationId,revision:1,proof:m.credential});
  await assert.rejects(db.writeDeviceOnce(mismatch.p)); checks++;
  eq((await row(m.device.registrationId)).binding_revision,'1','installation mismatch rolls back rebind');
  eq((await one('select count(*)::int as n from bobby_brief_idempotency where identity_id=$1 and idem_key=$2',[M,mismatch.p.key])).n,0,'installation mismatch rolls back operation receipt');
  // Only synthetic fixture identities are deleted; cascade removes encrypted targets, proofs and receipts.
  for (const id of identities) await q('delete from bobby_identities where id=$1',[id]);
  for (const table of ['bobby_push_devices','bobby_brief_outbox','bobby_brief_idempotency']) {
    eq((await one(`select count(*)::int as n from ${table} where identity_id=any($1::uuid[])`,[identities])).n,0,`account deletion cascades ${table}`);
  }
  console.log(`fcm-push-pg: ${checks} checks passed (actual SQL and concurrent connections, synthetic local only)`);
} finally {
  for (const id of identities) await q('delete from bobby_identities where id=$1',[id]).catch(()=>{});
  db.setBriefingRpc(null); await pool.end();
}
