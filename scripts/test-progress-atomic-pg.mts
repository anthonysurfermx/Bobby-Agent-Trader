// Actual PostgreSQL regressions: transaction failure, retries, concurrent phones,
// legacy import overlap, out-of-order days, profile restore, and seed review.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url || !['127.0.0.1','localhost','::1'].includes(new URL(url).hostname)) {
  throw new Error('DATABASE_URL must point to a local scratch PostgreSQL with the Trader Land migrations');
}
const pool = new pg.Pool({connectionString:url,max:5});
const ids:string[]=[];
const event=(at=new Date())=>({id:randomUUID(),kind:'read_complete',at:at.toISOString(),tzOffsetMin:0});
async function person() {const id=randomUUID();ids.push(id);await pool.query('insert into public.bobby_identities(id,auth_user_id) values($1,$2)',[id,randomUUID()]);return id;}
async function apply(id:string,events:unknown[],profile:unknown={}) {
  return (await pool.query('select public.bobby_apply_progress($1,$2,$3,$4) as result',[id,'ios',JSON.stringify(events),JSON.stringify(profile)])).rows[0].result;
}
async function xp(id:string) {return (await pool.query('select xp from public.bobby_progress where identity_id=$1',[id])).rows[0]?.xp ?? 0;}
let checks=0;
const eq=(got:unknown,want:unknown)=>{assert.deepEqual(got,want);checks++;};
try {
  await pool.query(readFileSync('supabase/bobby-protocol/supabase/migrations/20260919183000_atomic_progress.sql','utf8'));
  const first=await person();
  eq((await apply(first,[event(),event(),event()],{localXpClaim:30,companionId:'byte'})).progress.xp,30);
  eq((await apply(first,[],{restore:true,companionId:'axiom'})).progress.companion_id,'byte');
  eq((await apply(first,[],{restore:false,companionId:'kora'})).progress.companion_id,'kora');

  const parallel=await person();
  await apply(parallel,[],{localXpClaim:100,localXpIncludesPending:false});
  const a=event(),b=event();
  await Promise.all([apply(parallel,[a]),apply(parallel,[b])]);
  eq(await xp(parallel),120);
  await Promise.all([apply(parallel,[a]),apply(parallel,[a])]);
  eq(await xp(parallel),120);
  eq(Number((await pool.query("select count(*) from tl_inventory where identity_id=$1",[parallel])).rows[0].count),2);

  const cap=await person();
  const today=new Date(),yesterday=new Date(today.getTime()-86400000);
  for(const day of [yesterday,today,yesterday,today]) await apply(cap,[event(day),event(day),event(day)]);
  eq(await xp(cap),60);
  eq((await apply(cap,[event()])).results[0].awarded,0);

  await pool.query(`create or replace function public.audit_progress_failure() returns trigger language plpgsql as $$
    begin if current_setting('audit.progress_failure',true)='on' then raise exception 'injected counter failure';end if;return new;end $$;
    create trigger audit_progress_failure before update on public.bobby_progress for each row execute function public.audit_progress_failure();`);
  const retry=await person(),e=event();
  const connection=await pool.connect();
  try {
    await connection.query("set audit.progress_failure='on'");
    await assert.rejects(connection.query('select bobby_apply_progress($1,$2,$3,$4)',[retry,'ios',JSON.stringify([e]),'{}']));checks++;
  } finally {await connection.query("set audit.progress_failure='off'");connection.release();}
  eq(Number((await pool.query('select count(*) from bobby_progress_events where identity_id=$1',[retry])).rows[0].count),0);
  eq(Number((await pool.query('select count(*) from tl_inventory where identity_id=$1',[retry])).rows[0].count),0);
  eq((await apply(retry,[e])).progress.xp,10);
  eq((await apply(retry,[e])).progress.xp,10);

  const seed=(await pool.query('select id from tl_inventory where identity_id=$1',[retry])).rows[0].id;
  await pool.query("update tl_inventory set seeded_at=now()-interval '25 hours' where id=$1",[seed]);
  const close=()=>pool.query('select bobby_close_seed($1,$2,24,$3,0,$4) as result',[retry,seed,'ios',JSON.stringify({outcome:'expired',executed:null})]);
  const failedClose=await pool.connect();
  try {
    await failedClose.query("set audit.progress_failure='on'");
    await assert.rejects(failedClose.query('select bobby_close_seed($1,$2,24,$3,0,$4)',[retry,seed,'ios',JSON.stringify({outcome:'expired',executed:null})]));checks++;
  } finally {await failedClose.query("set audit.progress_failure='off'");failedClose.release();}
  eq((await pool.query('select state from tl_inventory where id=$1',[seed])).rows[0].state,'seed');
  const closed=await Promise.all([close(),close()]);
  eq(closed.every(x=>x.rows[0].result.ok),true);
  eq(await xp(retry),25);
  eq(Number((await pool.query("select count(*) from bobby_progress_events where identity_id=$1 and kind='thesis_closed'",[retry])).rows[0].count),1);
  eq((await pool.query("select has_function_privilege('anon','public.bobby_apply_progress(uuid,text,jsonb,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
  await pool.query(readFileSync('supabase/bobby-protocol/supabase/migrations/20260919190000_desk_quota.sql','utf8'));
  await pool.query('truncate bobby_desk_quotas');
  const quota = await Promise.all(Array.from({length:40},()=>pool.query("select bobby_consume_desk_quota('test-caller') as ok")));
  eq(quota.filter(x=>x.rows[0].ok).length,30);
  eq((await pool.query("select hits from bobby_desk_quotas where key='global'")).rows[0].hits,30);
  eq((await pool.query("select has_function_privilege('anon','public.bobby_consume_desk_quota(text)','EXECUTE') as allowed")).rows[0].allowed,false);
  await pool.query('truncate bobby_desk_quotas');
  const serviceIdentity = await person(), serviceConnection = await pool.connect();
  try {
    await serviceConnection.query('set role service_role');
    const applied = await serviceConnection.query('select bobby_apply_progress($1,$2,$3,$4) as result',[serviceIdentity,'ios',JSON.stringify([event()]),'{}']);
    eq(applied.rows[0].result.progress.xp,10);
    await serviceConnection.query('set role anon');
    await assert.rejects(serviceConnection.query('select bobby_consume_desk_quota($1)',['test-caller']));checks++;
  } finally {await serviceConnection.query('reset role');serviceConnection.release();}
  // A close stored before the atomic review (Growth v1 meta: no xp/aura/xpAfter/
  // ledgerEventId) replays as stored; the API completes it from the ledger row
  // with exactly this filter (api/_lib/trader-land.ts closedLedgerFields).
  const legacy=await person(),legacyEvent=event();
  await apply(legacy,[legacyEvent]);
  const legacySeed=(await pool.query('select id,item_id,event_id from tl_inventory where identity_id=$1',[legacy])).rows[0];
  await pool.query("update tl_inventory set state='bloomed',bloomed_at=now(),seeded_at=now()-interval '26 hours' where id=$1",[legacySeed.id]);
  const growthV1Meta={closePx:101.5,direction:'long',executed:null,inventoryId:legacySeed.id,itemId:legacySeed.item_id,movePct:1.5,outcome:'confirmed',plantEventId:legacySeed.event_id,referencePx:100,reviewedAt:new Date().toISOString(),symbol:'BTC'};
  const ledger=(await pool.query(`insert into bobby_progress_events(identity_id,client_event_id,kind,points,awarded,aura,xp_after,platform,occurred_at,day_key,meta)
    values($1,gen_random_uuid(),'thesis_closed',15,15,6,25,'ios',now(),current_date,jsonb_build_object('thesis_close',$2::jsonb)) returning id`,[legacy,JSON.stringify(growthV1Meta)])).rows[0].id;
  const replayed=(await pool.query('select bobby_close_seed($1,$2,24,$3,0,$4) as result',[legacy,legacySeed.id,'ios','{}'])).rows[0].result;
  eq([replayed.ok,replayed.replay,'xp' in replayed.closed,replayed.closed.inventoryId],[true,true,false,legacySeed.id]);
  const filled=(await pool.query("select id,awarded,aura,xp_after from bobby_progress_events where identity_id=$1 and kind='thesis_closed' and meta->'thesis_close'->>'inventoryId'=$2 limit 1",[legacy,legacySeed.id])).rows[0];
  eq([filled.id,filled.awarded,filled.aura,filled.xp_after],[ledger,15,6,25]);

  // Account deletion de-links agent_trades (no FK) as service_role before the identity goes.
  const trader=await person(),trade=randomUUID();
  await pool.query("insert into agent_trades(id,chain,token_address,token_symbol,direction,amount_usd,user_id) values($1,'base','0x0','NVDA','BUY',1,$2)",[trade,trader]);
  const unlink=await pool.connect();
  try {
    await unlink.query('set role service_role');
    eq((await unlink.query('update agent_trades set user_id=null where user_id=$1',[trader])).rowCount,1);
    await unlink.query('delete from bobby_identities where id=$1',[trader]);
  } finally {await unlink.query('reset role');unlink.release();}
  eq((await pool.query('select user_id from agent_trades where id=$1',[trade])).rows[0].user_id,null);
  await pool.query('delete from agent_trades where id=$1',[trade]);
  console.log(`progress-atomic-pg: ${checks} checks passed`);
} finally {
  await pool.query('drop trigger if exists audit_progress_failure on public.bobby_progress;drop function if exists public.audit_progress_failure()');
  await pool.query('delete from public.bobby_identities where id=any($1::uuid[])',[ids]);
  await pool.end();
}
