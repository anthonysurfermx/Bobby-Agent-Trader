// Actual local PostgreSQL regressions for first-party telemetry; run after test-admin-r2-pg.mts.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const url=process.env.DATABASE_URL;
if(!url){if(process.env.CI)throw new Error('DATABASE_URL required');console.log('client-telemetry-pg: SKIP (no DATABASE_URL)');process.exit(0);}
if(!['127.0.0.1','localhost','::1'].includes(new URL(url).hostname))throw new Error('only isolated local PostgreSQL allowed');
const pool=new pg.Pool({connectionString:url,max:8});
const migration=readFileSync('supabase/bobby-protocol/supabase/migrations/20261002235202_first_party_client_telemetry.sql','utf8');
const signature='public.bobby_record_client_telemetry(uuid,text,text,text,text,bigint,timestamptz,uuid,text,text,uuid,uuid,boolean)';
let checks=0;
const eq=(actual:unknown,want:unknown,label:string)=>{assert.deepEqual(actual,want,label);checks++;};
const ok=(actual:unknown,label:string)=>{assert.ok(actual,label);checks++;};
const rows=async(sql:string,args:unknown[]=[]) => (await pool.query(sql,args)).rows;
const one=async(sql:string,args:unknown[]=[]) => (await rows(sql,args))[0];
const hash=()=>randomBytes(12).toString('hex');
const ago=(ms=500)=>new Date(Date.now()-ms).toISOString();
async function account(){const id=randomUUID(),auth=randomUUID();await pool.query('insert into auth.users(id) values($1)',[auth]);await pool.query("insert into public.bobby_identities(id,email,provider,auth_user_id) values($1,$2,'apple',$3)",[id,`${id}@example.test`,auth]);return id;}
type Report={eventId?:string;kind?:string;platform?:string;install?:string;session?:string;sequence?:number;occurred?:string|null;identity?:string|null;version?:string;build?:string;request?:string|null;receipt?:string|null;verifiedAuth?:boolean};
const install=hash(),session=hash();
async function send(r:Report={}){
 return (await one('select public.bobby_record_client_telemetry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) r',[
 r.eventId??randomUUID(),r.kind??'foreground',r.platform??'ios',r.install??install,r.session??session,r.sequence??1,
 r.occurred===undefined?ago():r.occurred,r.identity??null,r.version??'1.6',r.build??'56',r.request??null,r.receipt??null,r.verifiedAuth??Boolean(r.identity)])).r;
}
const live=async(internal=false)=>(await one('select public.bobby_admin_live($1) r',[internal])).r;
const presence=()=>one('select * from public.bobby_client_presence where platform=$1 and install_hash=$2',['ios',install]);
async function invalid(r:Report,label:string){await assert.rejects(()=>send(r),(e:unknown)=>(e as {code:string}).code==='22023',label);checks++;}
async function reset(){
 await pool.query('truncate public.bobby_client_events,public.bobby_client_presence,public.bobby_client_coverage');
 await pool.query("delete from public.api_cache where cache_key='client-telemetry-health'");
 await pool.query(`truncate public.bobby_events,public.bobby_reads,public.bobby_purchase_events,public.bobby_subscriptions,
  public.bobby_reader_stats,public.bobby_admin_actions,public.bobby_coupon_redemptions,public.bobby_usage_bonus,public.bobby_pro_grants,public.bobby_level_uses restart identity cascade`);
 await pool.query('truncate public.bobby_device_networks,public.bobby_device_accounts,public.bobby_activity_days,public.bobby_internal_marks,public.bobby_internal_networks,public.bobby_devices restart identity');
 await pool.query('delete from public.bobby_admins'); await pool.query('delete from public.bobby_identities');
}
const block=async(label:string,fn:()=>Promise<void>)=>{await reset();await fn();console.log(`  ✓ ${label}`);};
try{
 // api_cache is a late-created stand-in in this scratch chain.
 // Match the service-only read grant required by the aggregate's sanitized health query.
 await pool.query('grant select,insert,update on public.api_cache to service_role');
 const db=await pool.connect();
 try{
  await db.query('begin');
  const before=(await db.query('select public.bobby_admin_live(false) r')).rows[0].r;
  await db.query(migration);
  const after=(await db.query('select public.bobby_admin_live(false) r')).rows[0].r;
  ok(after.client,'client facts added');delete after.client;delete before.client;
  eq(after,before,'all immutable phase1 keys and values preserved in one database transaction');
  await db.query(migration);await db.query('commit');
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
 await block('service-only security, RLS and idempotent additive RPC',async()=>{
  for(const fn of [signature,'public.bobby_prune_client_telemetry(boolean)','public.bobby_client_telemetry_health()','public.bobby_admin_client_live(boolean)','public.bobby_admin_server_live(boolean)','public.bobby_admin_live(boolean)']){
   for(const role of ['anon','authenticated'])eq((await one('select has_function_privilege($1,$2,$3) r',[role,fn,'execute'])).r,false,`${role} denied ${fn}`);
   eq((await one('select has_function_privilege($1,$2,$3) r',['service_role',fn,'execute'])).r,true,`service executes ${fn}`);
   eq(await one('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[fn]),{prosecdef:false,proconfig:['search_path=public, pg_temp']},'invoker and controlled search path');
  }
  for(const table of ['bobby_client_events','bobby_client_presence','bobby_client_coverage']){
   eq((await one('select relrowsecurity r from pg_class where oid=$1::regclass',[`public.${table}`])).r,true,'RLS enabled');
   for(const role of ['anon','authenticated'])for(const verb of ['select','insert','update','delete'])eq((await one('select has_table_privilege($1,$2,$3) r',[role,`public.${table}`,verb])).r,false,`${role} cannot ${verb} ${table}`);
  }
  const c=await pool.connect();try{await c.query('set role authenticated');await assert.rejects(()=>c.query('select public.bobby_record_client_telemetry($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),'foreground','ios',install,session,1,ago()]),(e:unknown)=>(e as {code:string}).code==='42501');checks++;}finally{await c.query('reset role');c.release();}
  const service=await pool.connect();try{
   await service.query('set role service_role');
   const saved=(await service.query('select public.bobby_record_client_telemetry($1,$2,$3,$4,$5,$6,$7) r',[randomUUID(),'foreground','ios',install,session,1,ago()])).rows[0].r;
   eq(saved.accepted,true,'actual service_role writes through security invoker/RLS');
   eq((await service.query('select public.bobby_admin_live(false) r')).rows[0].r.client.platforms.ios.presence.reportedForegroundInstalls,1,'actual service_role reads aggregate and sanitized health dependency');
  }finally{await service.query('reset role');service.release();}
  await pool.query(migration);
  eq(Object.keys((await live()).client.platforms).sort(),['ios','web'],'platforms always explicit');
  eq((await one("select count(*)::int n from pg_proc where proname='bobby_record_client_telemetry'")).n,1,'one writer signature prevents PostgREST optional-argument ambiguity');
 });
 await block('invalid IDs, timestamps, metadata and unsigned read reports rejected',async()=>{
  await invalid({install:'raw-device-id'},'only salted existing 24hex install hash');await invalid({session:randomUUID()},'session UUID must be salted by service');
  await invalid({kind:'crash'},'WK termination never aliases crash');await invalid({platform:'android'},'only implemented platforms');
  await invalid({occurred:null},'foreground logical timestamp required');await invalid({kind:'heartbeat',occurred:null},'heartbeat logical timestamp required');
  await invalid({occurred:ago(-60_000)},'future client clocks rejected');await invalid({occurred:ago(301_000)},'older than five minutes rejected');
  await invalid({sequence:-1},'negative sequence');await invalid({version:'user@example.com'},'PII-shaped version rejected');
  await invalid({kind:'read_received'},'received requires authenticated receipt id');await invalid({kind:'read_rendered'},'rendered requires authenticated receipt id');
  await invalid({receipt:randomUUID()},'receipt only accepted on received/rendered');await invalid({kind:'read_received',receipt:randomUUID()},'receipt binds request UUID');
  eq((await one('select count(*)::int n from public.bobby_client_events')).n,0,'invalid payloads leave no observations');
  const r=await send({kind:'webview_terminated',occurred:null});eq(r.accepted,true,'non-presence event may use service received time');
 });
 await block('concurrent UUID retries and alternate UUID read retries count once',async()=>{
  const id=randomUUID(),occurred=ago();const results=await Promise.all(Array.from({length:6},()=>send({eventId:id,occurred})));
  eq(results.filter(x=>x.accepted).length,1,'one concurrent UUID accepted');eq(results.filter(x=>x.duplicate).length,5,'five UUID retries recognized');
  eq((await one('select count(*)::int n from public.bobby_client_events')).n,1,'one event row');
  const request=randomUUID(),receipt=randomUUID();
  eq((await send({kind:'read_started',request})).accepted,true,'started accepted');eq((await send({kind:'read_started',request,eventId:randomUUID()})).duplicate,true,'started request retried with alternate event UUID deduplicated');
  eq((await send({kind:'read_received',request,receipt})).accepted,true,'verified received accepted');eq((await send({kind:'read_received',request,receipt,eventId:randomUUID()})).duplicate,true,'received receipt alternate UUID deduplicated');
  eq((await send({kind:'read_rendered',request,receipt})).accepted,true,'verified rendered accepted');eq((await send({kind:'read_rendered',request,receipt,eventId:randomUUID()})).duplicate,true,'rendered receipt alternate UUID deduplicated');
  const w=(await live()).client.platforms.ios.windows['15m'];eq([w.started,w.received,w.rendered],[1,1,1],'each receipt phase observed once');
 });
 await block('same-session ordering, background terminal state and heartbeat-only mutation',async()=>{
  const first=randomUUID();await send({eventId:first,sequence:1,occurred:ago(20_000)});
  await send({kind:'background',sequence:3,occurred:ago(10_000)});
  eq((await send({eventId:first,sequence:1,occurred:ago(20_000)})).duplicate,true,'old foreground UUID retry ignored');
  eq((await send({sequence:2,occurred:ago(15_000)})).presenceUpdated,false,'delayed lower sequence foreground cannot resurrect');
  eq(await send({kind:'heartbeat',sequence:4,occurred:ago()}),{accepted:true,duplicate:false,presenceUpdated:false},'valid ignored heartbeat is safely accepted without storage error or background resurrection');
  eq((await presence()).foreground,false,'background remains terminal until actual newer foreground');
  await send({sequence:5,occurred:ago(400)});const stamp=await presence();
  const counts=await one('select (select count(*)::int from public.bobby_client_events) events,(select count(*)::int from public.bobby_client_coverage) coverage,(select count(*)::int from public.bobby_activity_days) activity,(select count(*)::int from public.bobby_reads) reads,(select count(*)::int from public.bobby_devices) devices');
  const heartbeat=randomUUID();eq((await send({kind:'heartbeat',eventId:heartbeat,sequence:6,occurred:ago(200)})).presenceUpdated,true,'current foreground renewed');
  const renewed=await presence();ok(renewed.expires_at.getTime()>stamp.expires_at.getTime(),'new logical report advances expiry');
  eq((await send({kind:'heartbeat',eventId:heartbeat,sequence:6,occurred:ago(200)})).duplicate,true,'heartbeat retry recognized');eq((await presence()).expires_at,renewed.expires_at,'heartbeat retry cannot extend TTL');
  eq(await one('select (select count(*)::int from public.bobby_client_events) events,(select count(*)::int from public.bobby_client_coverage) coverage,(select count(*)::int from public.bobby_activity_days) activity,(select count(*)::int from public.bobby_reads) reads,(select count(*)::int from public.bobby_devices) devices'),counts,'heartbeat writes only presence; no retention or activity inflation');
 });
 await block('old sessions cannot revive after newer-session background',async()=>{
  const next=hash();await send({sequence:100,occurred:ago(30_000)});
  await send({kind:'background',session:next,sequence:1,occurred:ago(10_000)});
  eq((await send({sequence:101,occurred:ago(20_000)})).presenceUpdated,false,'old-session delayed foreground rejected by logical epoch time');
  eq((await send({kind:'heartbeat',sequence:102,occurred:ago()})).presenceUpdated,false,'old-session heartbeat cannot switch epoch with newer delivery');
  eq([(await presence()).session_hash,(await presence()).foreground],[next,false],'newer session background retained');
  eq((await send({kind:'foreground',session:next,sequence:2,occurred:ago(500)})).presenceUpdated,true,'same current session can genuinely return foreground');
  const timestamp=ago(300);await send({kind:'background',session:next,sequence:3,occurred:timestamp});
  eq((await send({kind:'foreground',session:hash(),sequence:999,occurred:timestamp})).presenceUpdated,false,'equal-time other session cannot override background');
 });
 await block('90-second expiry uses logical report time, not delayed delivery',async()=>{
  await send({occurred:ago(100_000)});let p=(await live()).client.platforms.ios.presence;
  eq(p.reportedForegroundInstalls,0,'stale foreground delivery is already expired');
  await send({kind:'heartbeat',sequence:2,occurred:ago(95_000)});eq((await live()).client.platforms.ios.presence.reportedForegroundInstalls,0,'delayed heartbeat not given ninety seconds from delivery');
  eq((await send({kind:'heartbeat',session:hash(),sequence:3})).presenceUpdated,false,'unknown session heartbeat cannot establish presence');
  await send({kind:'heartbeat',sequence:3,occurred:ago(300)});p=(await live()).client.platforms.ios.presence;
  eq([p.reportedForegroundInstalls,p.reportedForegroundSessions,p.reportedForegroundAccounts],[1,1,0],'fresh current foreground heartbeat counts one observed install/session, no invented account');
  const row=await presence();eq(row.expires_at.getTime()-row.occurred_at.getTime(),90_000,'expiry exactly ninety seconds from logical time');
 });
 await block('platform/build rollout remains observed cohort; legacy clients unmeasured',async()=>{
  const id=await account();await pool.query("select public.bobby_touch_device($1,'web',null,null,null,$2)",[hash(),id]);
  let l=await live();eq([l.client.platforms.ios.coverage.rolloutSince,l.client.platforms.web.coverage.rolloutSince],[null,null],'legacy activity establishes no telemetry rollout');
  eq([l.coverage.readStarted,l.coverage.clientRendered,l.coverage.crashes,l.coverage.buildVersion,l.coverage.onlinePresence],[false,false,false,false,false],'phase1 global coverage not guessed');
  await send({identity:id});l=await live();ok(l.client.platforms.ios.coverage.rolloutSince,'ios observed rollout timestamp');
  eq([l.client.platforms.web.coverage.rolloutSince,l.client.platforms.ios.coverage.readStartedSince,l.client.platforms.ios.coverage.readReceivedSince,l.client.platforms.ios.coverage.readRenderedSince],[null,null,null,null],'foreground alone does not claim other platform/signals');
  eq(l.client.coverage,{protocolVersion:1,scope:'instrumented_clients_only',legacyClients:'unmeasured',crashes:false,successRate:null,eventTimeScope:'server_received',buildLabelScope:'self_reported_recent_7d_capped_20',retentionDays:35,presenceRetentionDays:7,presenceTimeScope:'client_reported',readVerification:'server_authenticated_success_receipt'},'explicit evidence scope and no success denominator');
  eq([l.client.platforms.ios.builds[0].appVersion,l.client.platforms.ios.builds[0].appBuild,l.client.platforms.ios.builds[0].foregroundInstalls],['1.6','56',1],'observed version/build cohort');
  await send({kind:'heartbeat',identity:id,sequence:2,build:'57',occurred:ago(200)});l=await live();
  eq(l.client.platforms.ios.builds.some((x:{appBuild:string})=>x.appBuild==='57'),false,'heartbeat alone cannot admit a new named build cohort');
  eq(l.client.platforms.ios.windows['15m'].foreground,1,'heartbeat does not add foreground lifecycle events');
 });
 await block('server receipt event windows, termination separation and no PII in snapshot',async()=>{
  const id=await account(),request=randomUUID(),receipt=randomUUID();await send({identity:id,kind:'read_received',request,receipt,occurred:ago(240_000)});
  await send({identity:id,kind:'read_rendered',request,receipt});await send({kind:'webview_terminated'});
  let l=await live();eq([l.windows['15m'].ios.completed,l.client.platforms.ios.windows['15m'].received,l.client.platforms.ios.windows['15m'].rendered,l.client.platforms.ios.windows['15m'].webviewTerminations],[0,1,1,1],'server completion, received/rendered and process termination stay separate');
  eq(l.client.platforms.ios.coverage.crashes,false,'WebKit termination is not crash coverage');
  const raw=JSON.stringify(l.client);for(const value of [id,install,session,request,receipt,'@example.test'])eq(raw.includes(value),false,'no account/install/session/request/receipt identifiers exposed');
  await pool.query("update public.bobby_client_events set received_at=now()-interval '30 minutes' where kind='read_received'");
  await pool.query("update public.bobby_client_events set received_at=now()-interval '2 hours' where kind='read_rendered'");
  await pool.query("update public.bobby_client_events set received_at=now()+interval '1 minute' where kind='webview_terminated'");
  l=await live();const w=l.client.platforms.ios.windows;
  eq([w['15m'].received,w['1h'].received,w['24h'].received],[0,1,1],'received window uses server receive time');eq([w['15m'].rendered,w['1h'].rendered,w['24h'].rendered],[0,0,1],'render windows isolated');eq(w['24h'].webviewTerminations,0,'future server records excluded');
  await pool.query('delete from public.bobby_client_events');
  eq((await live()).client.platforms.ios.coverage.readReceivedSince,null,'registry alone cannot claim current signal coverage after retained event evidence disappears');
 });
 await block('team exclusion uses exact existing install graph and selected scope',async()=>{
  const T=await account(),E=await account();await pool.query('insert into public.bobby_internal_marks(identity_id) values($1)',[T]);
  await pool.query("select public.bobby_touch_device($1,'ios',null,null,null,$2)",[install,T]);await pool.query("select public.bobby_touch_device($1,'ios',null,null,null,$2)",[install,E]);
  await send({identity:E});await send({kind:'read_received',request:randomUUID(),receipt:randomUUID(),identity:E});
  let l=await live();eq([l.client.platforms.ios.presence.reportedForegroundInstalls,l.client.platforms.ios.windows['15m'].received],[0,0],'transitive team account excluded');
  eq([l.client.platforms.ios.coverage.rolloutSince,l.client.platforms.ios.coverage.readReceivedSince,l.client.platforms.ios.builds.length],[null,null,0],'team-only reports establish no external coverage or named builds');
  l=await live(true);ok(l.client.platforms.ios.coverage.rolloutSince,'team-inclusive scope has actual coverage');eq([l.client.platforms.ios.presence.reportedForegroundInstalls,l.client.platforms.ios.windows['15m'].received],[1,1],'selected team toggle includes same observed facts');
  await send({kind:'background',sequence:2});await send({sequence:3,occurred:ago(200)});eq((await live()).client.platforms.ios.presence.reportedForegroundInstalls,0,'guest on exact team install excluded by device graph');
 });
 await block('ingestion health validates cache evidence and authenticates recovery cohort',async()=>{
  const health=async()=>(await live()).client.health;
  const cache=async(payload:unknown,expired=false)=>pool.query("insert into public.api_cache(cache_key,payload,expires_at) values('client-telemetry-health',$1,now()+make_interval(days=>$2)) on conflict(cache_key) do update set payload=excluded.payload,expires_at=excluded.expires_at",[JSON.stringify(payload),expired?-1:30]);
  eq(await health(),{status:'unknown',lastErrorAt:null,error:null,authenticated:null,lastReportAt:null,recovered:null},'absent health evidence means unknown, not healthy zero');
  for(const bad of [
   {lastErrorAt:'bogus',error:'storage_unavailable',authenticated:false},
   {lastErrorAt:'2026-99-99T25:61:61Z',error:'storage_unavailable',authenticated:false},
   {lastErrorAt:ago(-100_000),error:'storage_unavailable',authenticated:false},
   {lastErrorAt:ago(31*86400_000),error:'storage_unavailable',authenticated:false},
   {lastErrorAt:ago(100),error:'arbitrary_private_error',authenticated:false},
   {lastErrorAt:ago(100),error:'auth_unavailable',authenticated:'true'}]){
   await cache(bad);eq((await health()).status,'unknown','malformed/future/stale/nonallowlisted cache ignored without breaking snapshot');
  }
  await cache({lastErrorAt:ago(100),error:'storage_unavailable',authenticated:false},true);eq((await health()).status,'unknown','expired cache not treated as recent failure');
  await cache({lastErrorAt:ago(100),error:'auth_unavailable',authenticated:true,secret:'do-not-expose'});
  await send();let h=await health();eq([h.status,h.recovered,h.lastReportAt],['failure_observed',false,null],'anonymous presence cannot prove authenticated recovery');
  eq(JSON.stringify(h).includes('secret'),false,'arbitrary cache properties never leave health output');
  const id=await account();await send({kind:'read_started',identity:id,request:randomUUID()});
  eq((await health()).recovered,false,'started telemetry alone does not prove signed read/presence auth recovery');
  await send({kind:'read_received',identity:id,request:randomUUID(),receipt:randomUUID()});h=await health();
  eq([h.status,h.recovered,h.authenticated,h.error],['recovered',true,true,'auth_unavailable'],'authenticated receipt after failure proves its applicable cohort recovered');
  ok(new Date(h.lastReportAt).getTime()>new Date(h.lastErrorAt).getTime(),'recovery strictly after failure');
  await cache({lastErrorAt:new Date().toISOString(),error:'request_budget_exhausted',authenticated:true});
  await send({identity:id,sequence:2,occurred:ago(100)});eq((await health()).recovered,true,'fresh authenticated presence can prove recovery');
  await cache({lastErrorAt:new Date().toISOString(),error:'auth_unavailable',authenticated:true});
  await send({kind:'heartbeat',identity:id,sequence:3,occurred:ago(50)});eq((await health()).recovered,true,'fresh authenticated heartbeat is applicable recovery proof');
  await send({kind:'heartbeat',sequence:4,occurred:ago(10)});eq((await health()).recovered,true,'later anonymous heartbeat cannot erase previously observed authenticated recovery');
  await cache({lastErrorAt:new Date().toISOString(),error:'storage_unavailable',authenticated:true});
  const before=(await presence()).received_at;
  eq((await send({kind:'heartbeat',identity:id,session:hash(),sequence:999,occurred:ago(10)})).accepted,true,'ineligible heartbeat safely acknowledged');
  eq((await presence()).received_at,before,'ineligible heartbeat does not refresh report time');eq((await health()).recovered,false,'ineligible heartbeat cannot clear recorded failure');
  await send({kind:'heartbeat',identity:id,sequence:5,occurred:ago(1000)});eq((await health()).recovered,false,'stale logical heartbeat cannot establish recovery');
  await cache({lastErrorAt:new Date().toISOString(),error:'storage_unavailable',authenticated:false});
  await send({install:hash(),session:hash()});eq((await health()).recovered,true,'anonymous accepted report can establish anonymous storage recovery');
 });
 await block('verified wallet recovery never invents account identity and guests cannot clear auth failure',async()=>{
  const cache=()=>pool.query("insert into public.api_cache(cache_key,payload,expires_at) values('client-telemetry-health',$1,now()+interval '30 days') on conflict(cache_key) do update set payload=excluded.payload,expires_at=excluded.expires_at",[JSON.stringify({lastErrorAt:ago(100),error:'auth_unavailable',authenticated:true})]);
  await cache();await send({kind:'read_received',request:randomUUID(),receipt:randomUUID(),verifiedAuth:false});
  eq((await live()).client.health.recovered,false,'anonymous signed receipt cannot clear wallet/authenticated failure');
  await send({verifiedAuth:false});eq((await live()).client.health.recovered,false,'anonymous foreground cannot clear wallet/authenticated failure');
  await send({kind:'read_received',request:randomUUID(),receipt:randomUUID(),verifiedAuth:true});
  let l=await live();eq([l.client.health.status,l.client.health.recovered],['recovered',true],'server-verified wallet receipt proves auth recovery without an account UUID');
  eq([l.client.platforms.ios.windows['15m'].reportedAccounts,l.client.platforms.ios.presence.reportedForegroundAccounts],[0,0],'wallet authentication does not add registered account counts');
  eq(await one("select identity_id,verified_auth from public.bobby_client_events where kind='read_received' and verified_auth"),{identity_id:null,verified_auth:true},'private receipt proof retained separately from account identity');
  eq(JSON.stringify(l.client).includes('verified_auth'),false,'private auth proof absent from admin output');
  await reset();await cache();await send({verifiedAuth:true});l=await live();
  eq([l.client.health.recovered,l.client.platforms.ios.presence.reportedForegroundAccounts],[true,0],'verified wallet foreground proves recovery while remaining outside accounts');
  await pool.query("update public.bobby_client_presence set last_authenticated_received_at=now()-interval '2 seconds'");
  await cache();eq((await live()).client.health.recovered,false,'new auth failure is not cleared by historical wallet proof');
  await send({kind:'heartbeat',sequence:2,occurred:ago(200),verifiedAuth:true});
  eq([(await live()).client.health.recovered,(await presence()).verified_auth,(await presence()).identity_id],[true,true,null],'verified wallet heartbeat establishes applicable recovery without account identity');
  await send({kind:'heartbeat',sequence:3,occurred:ago(50),verifiedAuth:false});eq((await live()).client.health.recovered,true,'later anonymous report does not erase previously observed wallet recovery');
 });
 await block('bounded future capture order survives inverted cross-session delivery',async()=>{
  const base=Date.now(),next=hash(),latest=hash();
  await send({occurred:new Date(base+10_000).toISOString()});
  await send({kind:'background',session:next,sequence:1,occurred:new Date(base+20_000).toISOString()});
  eq((await send({sequence:2,occurred:new Date(base+15_000).toISOString()})).presenceUpdated,false,'earlier foreground cannot revive newer background when both client captures are ahead of server');
  let p=await presence();eq([p.session_hash,p.foreground],[next,false],'newer future-captured background retained');
  eq(p.expires_at.getTime()-p.received_at.getTime(),90_000,'future skew does not extend TTL beyond ninety seconds from receive time');
  await send({session:latest,sequence:1,occurred:new Date(base+25_000).toISOString()});
  eq((await send({kind:'background',session:next,sequence:2,occurred:new Date(base+22_000).toISOString()})).presenceUpdated,false,'earlier background cannot close newer foreground despite inverted delivery and positive client skew');
  p=await presence();eq([p.session_hash,p.foreground,p.occurred_at.toISOString()],[latest,true,new Date(base+25_000).toISOString()],'raw capture clock retained for ordering instead of clamped delivery clock');
  await send({kind:'heartbeat',session:latest,sequence:2,occurred:new Date(base+26_000).toISOString()});p=await presence();
  eq(p.expires_at.getTime()-p.received_at.getTime(),90_000,'future captured heartbeat expiry also clamps to receive time');
 });
 await block('concurrent reordered lifecycle reports retain the newest state',async()=>{
  const base=Date.now()-1000;await Promise.all(Array.from({length:20},(_,i)=>send({sequence:i,kind:i%2?'background':'foreground',occurred:new Date(base+i).toISOString()})));
  const p=await presence();eq([Number(p.sequence),p.foreground],[19,false],'row-locked conflict condition keeps maximum sequence and logical timestamp');
  eq((await live()).client.platforms.ios.windows['15m'].foreground,10,'all unique observations retained without state inversion');
 });
 await block('historical-only event kinds and builds retain latest facts outside recent windows',async()=>{
  const receipt=randomUUID(),request=randomUUID();
  await send({kind:'read_received',request,receipt,version:'1.0',build:'40',verifiedAuth:true});
  await send({kind:'read_rendered',request,receipt,version:'1.0',build:'40',verifiedAuth:true});
  await send({kind:'webview_terminated',version:'1.0',build:'40'});
  const dates={received:new Date(Date.now()-3*86400_000).toISOString(),rendered:new Date(Date.now()-2*86400_000).toISOString(),terminated:new Date(Date.now()-86400_000-1000).toISOString()};
  await pool.query("update public.bobby_client_events set received_at=case kind when 'read_received' then $1::timestamptz when 'read_rendered' then $2::timestamptz else $3::timestamptz end",[dates.received,dates.rendered,dates.terminated]);
  const p=(await live()).client.platforms.ios;
  eq(Object.fromEntries(Object.entries(p.latest).map(([k,v])=>[k,new Date(v as string).toISOString()])),{eventAt:dates.terminated,receivedAt:dates.received,renderedAt:dates.rendered,webviewTerminationAt:dates.terminated},'indexed latest probes retain each old-only kind');
  eq([p.windows['15m'].received,p.windows['1h'].rendered,p.windows['24h'].webviewTerminations,p.windows['24h'].reportedInstalls],[0,0,0,0],'old history does not enter bounded recent aggregate');
  eq([p.builds[0].appVersion,p.builds[0].appBuild,p.builds[0].reportedInstalls24h,p.builds[0].foregroundInstalls,new Date(p.builds[0].latestReportAt).toISOString()],['1.0','40',0,0,dates.terminated],'build from recent seven-day evidence retained without invented activity');
  ok(p.builds[0].readReceivedSince,'historical build rollout evidence still present');
  const failed=new Date(Date.now()-2.5*86400_000).toISOString();
  await pool.query("insert into public.api_cache(cache_key,payload,expires_at) values('client-telemetry-health',$1,now()+interval '30 days')",[JSON.stringify({lastErrorAt:failed,error:'auth_unavailable',authenticated:true})]);
  eq([(await live()).client.health.recovered,new Date((await live()).client.health.lastReportAt).toISOString()],[true,dates.rendered],'indexed private verified receipt recovery preserves historical-only proof');
 });
 await block('bounded cohort admission under sequential and concurrent invented builds',async()=>{
  for(let i=1;i<=120;i++)await send({build:String(i),install:hash(),session:hash()});
  eq((await one("select count(*)::int n from (select app_version,app_build from public.bobby_client_coverage where app_build<>'unknown' group by 1,2) b")).n,100,'one hundred named cohorts is a hard registry cap');
  eq((await one("select count(*)::int n from public.bobby_client_events where app_build='unknown'")).n,20,'overflow stays measured in one unnamed bucket');
  const first=(await live()).client.platforms.ios;
  eq(first.builds.length,20,'output lists at most twenty recent named groups');
  eq(first.builds.some((b:{appBuild:string})=>b.appBuild==='unknown'),false,'unknown bucket is absent from named build panel');
  eq(first.windows['24h'].foreground,120,'bucketing never drops reported activity');
  await pool.query('truncate public.bobby_client_events,public.bobby_client_presence,public.bobby_client_coverage');
  for(let i=1;i<=97;i++)await send({build:String(i),install:hash(),session:hash()});
  await Promise.all(Array.from({length:8},(_,i)=>send({build:String(100+i),install:hash(),session:hash()})));
  eq((await one("select count(*)::int n from (select app_version,app_build from public.bobby_client_coverage where app_build<>'unknown' group by 1,2) b")).n,100,'concurrent new cohorts cannot race past cap');
  eq((await one("select count(*)::int n from public.bobby_client_events where app_build='unknown'")).n,5,'concurrent overflow grouped into single bucket');
  for(let i=1;i<=101;i++)await send({platform:'web',version:'web',build:i.toString(16).padStart(40,'0'),install:hash(),session:hash()});
  eq((await one("select count(*)::int n from (select app_version,app_build from public.bobby_client_coverage where platform='web' and app_build<>'unknown' group by 1,2) b")).n,100,'web SHA cohorts share the same hard cap');
  await send({platform:'web',version:'invented',build:'label'});
  eq(await one("select app_version,app_build from public.bobby_client_events where platform='web' order by received_at desc limit 1"),{app_version:'web',app_build:'unknown'},'direct service writer canonicalizes web labels');
  eq((await one("select count(distinct app_version)::int n from public.bobby_client_coverage where platform='web' and app_build='unknown'")).n,1,'web overflow and malformed labels use the same unknown bucket');
 });
 await block('indexed retention removes old events, presence and coverage but preserves current evidence',async()=>{
  await send({});await send({install:hash(),session:hash(),build:'57'});
  await pool.query("update public.bobby_client_events set received_at=now()-interval '36 days' where app_build='57'");
  await pool.query("update public.bobby_client_presence set received_at=now()-interval '8 days' where app_build='57'");
  await pool.query("update public.bobby_client_coverage set last_received_at=now()-interval '8 days' where app_build='57'");
  eq((await one('select public.bobby_prune_client_telemetry(true) r')).r,{events:1,presence:1,coverage:1,skipped:false},'all expired telemetry cohorts removed together');
  eq((await one('select count(*)::int n from public.bobby_client_events')).n,1,'current events retained');
  eq((await live()).client.platforms.ios.builds[0].appBuild,'56','old registry no longer produces a ghost build');
  eq((await one('select public.bobby_prune_client_telemetry(false) r')).r,{skipped:true},'ordinary reports throttle maintenance within the hour');
 });
 await block('client aggregate failure never erases immutable server facts',async()=>{
  const before=(await live()).windows;for(const w of Object.values(before) as any[])delete w.since;
  await pool.query("alter function public.bobby_admin_client_live(boolean) rename to bobby_admin_client_live_test_original");
  try{
   await pool.query("create function public.bobby_admin_client_live(p_internal boolean default false) returns jsonb language plpgsql stable security invoker set search_path=public,pg_temp as $$ begin raise exception 'isolated client error'; end; $$");
   const l=await live();for(const w of Object.values(l.windows) as any[])delete w.since;eq(l.windows,before,'server numbers still returned after client aggregate failure');eq(l.client,null,'failed client source stays unavailable, not zero');
  }finally{await pool.query('drop function public.bobby_admin_client_live(boolean)');await pool.query('alter function public.bobby_admin_client_live_test_original(boolean) rename to bobby_admin_client_live');}
 });
 await block('aggregate latency with retained history and two thousand reported installs',async()=>{
  await pool.query(`insert into public.bobby_client_events(event_id,kind,platform,install_hash,session_hash,sequence,occurred_at,received_at,app_version,app_build)
   select gen_random_uuid(),case when i%2=0 then 'foreground' else 'read_started' end,case when i%2=0 then 'ios' else 'web' end,
    substr(md5((i%2000)::text),1,24),substr(md5('s'||(i%2000)::text),1,24),i,
    now()-case when i<=10000 then interval '1 minute' else interval '45 days' end,
    now()-case when i<=10000 then interval '1 minute' else interval '45 days' end,'1.6',(56+i%3)::text
   from generate_series(1,110000) i`);
  await pool.query(`insert into public.bobby_client_coverage(platform,app_version,app_build,kind,first_received_at,last_received_at)
   select platform,app_version,app_build,kind,min(received_at),max(received_at) from public.bobby_client_events group by 1,2,3,4`);
  await pool.query(`insert into public.bobby_client_presence(platform,install_hash,session_hash,sequence,last_event_id,foreground,occurred_at,received_at,expires_at,app_version,app_build)
   select case when i%2=0 then 'ios' else 'web' end,substr(md5((i%2000)::text),1,24),substr(md5('s'||(i%2000)::text),1,24),1,gen_random_uuid(),true,now(),now(),now()+interval '90 seconds','1.6',(56+i%3)::text
   from generate_series(1,2000) i`);
  await pool.query('analyze public.bobby_client_events');await pool.query('analyze public.bobby_client_presence');
  const start=performance.now(),l=await live(),duration=Math.round(performance.now()-start);
  eq([l.client.platforms.ios.presence.reportedForegroundInstalls,l.client.platforms.web.presence.reportedForegroundInstalls],[1000,1000],'one thousand fresh observed installs per platform');
  eq([l.client.platforms.ios.windows['15m'].foreground,l.client.platforms.web.windows['15m'].started],[5000,5000],'one hundred thousand historical events never inflate recent windows');
  eq([l.client.platforms.ios.builds.length,l.client.platforms.web.builds.length],[3,3],'observed build grouping remains bounded');
  ok(duration<2000,'full additive live RPC under two seconds on synthetic local fixture');
  console.log(`    full live ${duration} ms: 110,000 retained events, 2,000 installs, six platform/build cohorts`);
 });
 await block('grouped capped builds remain fast with thousands of legacy invented labels',async()=>{
  await pool.query(`insert into public.bobby_client_events(event_id,kind,platform,install_hash,session_hash,sequence,occurred_at,received_at,app_version,app_build)
    select gen_random_uuid(),'foreground','ios',substr(md5(i::text),1,24),substr(md5('s'||i::text),1,24),1,now(),now(),'1.6',i::text from generate_series(1,6000) i`);
  await pool.query(`insert into public.bobby_client_coverage(platform,app_version,app_build,kind,first_received_at,last_received_at)
    select 'ios','1.6',i::text,'foreground',now(),now() from generate_series(1,6000) i`);
  await pool.query('analyze public.bobby_client_events');
  const start=performance.now(),l=await live(),duration=Math.round(performance.now()-start);
  eq(l.client.platforms.ios.builds.length,20,'six thousand legacy labels still produce only twenty build rows');
  eq(l.client.platforms.ios.windows['24h'].foreground,6000,'bounded presentation preserves activity count');
  ok(duration<2000,'legacy high-cardinality query uses grouped scans, not one scan per build');
  ok(JSON.stringify(l.client).length<14000,'snapshot size stays bounded under invented-label flood');
  console.log(`    high-cardinality live ${duration} ms: 6,000 legacy cohorts, twenty returned`);
 });
 await reset();console.log(`client-telemetry-pg: ${checks} checks passed`);
}finally{await pool.end();}
