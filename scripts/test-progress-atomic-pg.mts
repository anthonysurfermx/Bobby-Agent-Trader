// Real PostgreSQL regression of the service-only progress transactions.
// All records are synthetic and confined to a random schema on localhost.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { SEASON } from '../api/_lib/trader-land-season.js';
import { BASE_USDC, BASE_WETH } from '../src/lib/base-swap/tokens.js';
import { applyAward, AWARD_AURA, EXECUTION_BONUS } from '../api/_lib/progress-rules.js';

const url = process.env.DATABASE_URL;
if (!url || !['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) {
  throw new Error('A local scratch DATABASE_URL is required; this test never skips.');
}
const pool = new pg.Pool({ connectionString: url, max: 5 });
const schema = `progress_test_${randomUUID().replaceAll('-', '')}`;
const q = (sql: string) => sql.replaceAll('public.', `${schema}.`).replaceAll('set search_path = public', `set search_path = ${schema}`);
const query = (sql: string, params: unknown[] = []) => pool.query(q(sql), params);
const day = new Date().toISOString().slice(0,10);
const wallet = '0x' + 'ab'.repeat(20);
const asset = BASE_WETH.toLowerCase();
const stable = BASE_USDC.toLowerCase();
let checks = 0;
function pass(message: string) { checks++; console.log(`PASS ${checks}: ${message}`); }

async function identity(withWallet = false) {
  const id = randomUUID();
  await query('insert into public.bobby_identities(id,auth_user_id,wallet_address) values($1,$2,$3)', [id,randomUUID(),withWallet ? wallet : null]);
  await query('insert into public.bobby_progress(identity_id) values($1)', [id]);
  return id;
}
async function progress(id: string) {
  return (await query('select * from public.bobby_progress where identity_id=$1', [id])).rows[0];
}
function patch(p: Record<string, any>, kind: 'read_complete' | 'thesis_closed') {
  const a = applyAward({ xp:p.xp,streak:p.streak,lastDay:p.last_day?.toISOString?.().slice(0,10) ?? p.last_day,
    dailyAwards:p.daily_awards,dailyAwardsDay:p.daily_awards_day?.toISOString?.().slice(0,10) ?? p.daily_awards_day }, kind, new Date());
  return { xp:a.xpAfter,aura:p.aura+AWARD_AURA[kind],streak:a.state.streak,last_day:a.state.lastDay,
    daily_awards:a.state.dailyAwards,daily_awards_day:a.state.dailyAwardsDay,last_platform:'web' };
}
function read(p: Record<string, any>, eventId = randomUUID()) {
  return { client_event_id:eventId,kind:'read_complete',points:10,awarded:10,aura:2,xp_after:p.xp+10,
    platform:'web',occurred_at:new Date(Date.now()-2*86400000).toISOString(),day_key:day,
    execution_asset_address:asset,meta:{ thesis:{ symbol:'ETH',direction:'long',price:3000,entry:3000,stop:2900,target:3200,isEquity:false },thesisSource:'client_snapshot' } };
}
async function commit(id: string, p: Record<string, any>, events: unknown[], changes = patch(p,'read_complete')) {
  return (await query('select public.bobby_commit_progress($1,$2,$3,$4) as result',[id,p.revision,changes,JSON.stringify(events)])).rows[0].result;
}
async function plant(id: string) {
  const p=await progress(id); const e=read(p);
  const origin=await issue(id,e.meta.thesis);
  Object.assign(e,{thesis_read_id:origin.id});
  const saved=await commit(id,p,[e]);
  const seed=saved.grants[e.client_event_id].inventoryId as string;
  // Fast-forward only the fixture's wait, never an API parameter.
  await query("update public.tl_inventory set seeded_at=now()-interval '25 hours' where id=$1",[seed]);
  return seed;
}
async function issue(id: string, thesis=read({xp:0}).meta.thesis) {
  return (await query('select public.bobby_issue_thesis_read($1,$2,$3) result',[id,thesis,asset])).rows[0].result;
}
async function close(id: string, seed: string, p?: Record<string, any>) {
  p ??= await progress(id);
  return (await query('select public.bobby_close_seed($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
    [id,p.revision,seed,{outcome:'expired',symbol:'ETH',direction:'long',referencePx:3000,closePx:3010,movePct:0.333},patch(p,'thesis_closed'),day,'web',[stable],SEASON.pieces])).rows[0].result;
}
async function receipt(at: string, label: string, tokenIn = stable, tokenOut = asset, who = wallet) {
  return (await query(`insert into public.bobby_swap_receipts(wallet_address,router_address,token_in_address,token_out_address,
    token_in_symbol,token_out_symbol,amount_in_raw,quoted_out_raw,min_amount_out_raw,route,calldata_hash,deadline,
    status,tx_hash,block_timestamp,confirmed_at) values($1,'fixture-router',$2,$3,'display-in','display-out',1,1,1,
    'direct',$4,now()+interval '1 hour','confirmed',$4,$5,now()) returning id`,[who,tokenIn,tokenOut,label,at])).rows[0].id;
}
async function counts(id: string) {
  return (await query(`select (select count(*)::int from public.bobby_progress_events where identity_id=$1) events,
    (select count(*)::int from public.tl_inventory where identity_id=$1 and state='bloomed') bloomed,
    (select count(*)::int from public.tl_inventory where identity_id=$1 and source='season') season`,[id])).rows[0];
}

try {
  await pool.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  end $$; create schema ${schema};`);
  await query(`create table public.agent_cycles(id uuid primary key,trades_executed integer,total_usd_deployed numeric);
    create table public.agent_trades(id uuid primary key,owner_address text,token_symbol text,
      created_at timestamptz,direction text,status text);`);
  const base='supabase/bobby-protocol/supabase/migrations/';
  for (const file of ['20260903000005_bobby_progress.sql','20260903000006_trader_land.sql',
    '20260903000009_swap_receipts.sql','20260905000001_atomic_progress.sql']) {
    const client=await pool.connect();
    try { await client.query(q(readFileSync(base+file,'utf8'))); }
    catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }
  pass('real prerequisite schemas and atomic migration apply to an isolated schema');
  for (const name of ['bobby_issue_thesis_read(uuid,jsonb,text)','bobby_commit_progress(uuid,bigint,jsonb,jsonb)','bobby_close_seed(uuid,bigint,uuid,jsonb,jsonb,date,text,text[],text[])']) {
    for (const role of ['anon','authenticated']) {
      assert.equal((await pool.query('select has_function_privilege($1,$2,\'execute\') ok',[role,`${schema}.${name}`])).rows[0].ok,false);
    }
    assert.equal((await pool.query('select has_function_privilege($1,$2,\'execute\') ok',['service_role',`${schema}.${name}`])).rows[0].ok,true);
  }
  pass('RPC execution is restricted to service_role');
  for(const role of ['anon','authenticated','service_role']) {
    for(const action of ['INSERT','UPDATE','DELETE']) {
      assert.equal((await pool.query('select has_table_privilege($1,$2,$3) ok',[role,`${schema}.bobby_thesis_reads`,action])).rows[0].ok,false);
    }
    assert.equal((await pool.query('select has_table_privilege($1,$2,\'SELECT\') ok',
      [role,`${schema}.bobby_thesis_reads`])).rows[0].ok,role==='service_role');
  }
  pass('server verdict rows cannot be created or mutated through direct client/service table writes');
  const id=await identity(true);
  const first=await plant(id);
  const event=(await query('select * from public.bobby_progress_events where identity_id=$1',[id])).rows[0];
  assert.ok(event.execution_eligible_at.getTime()>event.occurred_at.getTime()+86400000);
  assert.equal(event.execution_asset_address,asset);
  assert.equal(event.meta.thesisSource,'voice_tool_technical_pulse');
  assert.ok(event.thesis_read_id);
  assert.equal((await progress(id)).route_index,1);
  pass('a queued old read receives a new database acceptance time and its route piece atomically');

  // Fixture failure at the LAST write verifies every preceding write rolls back.
  await query(`create function public.fixture_fail_balance() returns trigger language plpgsql as $$
    begin raise exception 'fixture balance failure'; end $$;
    create trigger fixture_fail_balance before update on public.bobby_progress
    for each row execute function public.fixture_fail_balance();`);
  const before=await counts(id);
  await assert.rejects(close(id,first),/fixture balance failure/);
  assert.deepEqual(await counts(id),before);
  assert.equal((await progress(id)).xp,10);
  const secondId=await identity();
  await assert.rejects(commit(secondId,await progress(secondId),[read(await progress(secondId))]),/fixture balance failure/);
  assert.deepEqual(await counts(secondId),{events:0,bloomed:0,season:0});
  assert.equal((await query('select count(*)::int n from public.tl_inventory where identity_id=$1',[secondId])).rows[0].n,0);
  await query('drop trigger fixture_fail_balance on public.bobby_progress');
  pass('late balance failure rolls back both close and plant ledger/inventory writes');

  // More than one PostgREST page of history: the eligible receipt must survive.
  await query(`insert into public.bobby_swap_receipts(wallet_address,router_address,token_in_address,token_out_address,
    token_in_symbol,token_out_symbol,amount_in_raw,quoted_out_raw,min_amount_out_raw,route,calldata_hash,deadline,status,tx_hash,block_timestamp,confirmed_at)
    select $1,'fixture-router',$2,$3,'USDC','ETH',1,1,1,'direct','old-'||n,now(),'confirmed','old-'||n,now()-interval '3 days',now()
    from generate_series(1,1100) n`,[wallet,stable,asset]);
  const at=new Date(event.execution_eligible_at.getTime()+1).toISOString();
  await receipt(at,'wrong-contract',stable,'0x'+'cd'.repeat(20));
  await receipt(at,'wrong-wallet',stable,asset,'0x'+'ef'.repeat(20));
  await receipt(at,'wrong-direction',asset,stable);
  const good=await receipt(at,'eligible-first');
  const snapshot=await progress(id);
  await query('create trigger fixture_fail_balance before update on public.bobby_progress for each row execute function public.fixture_fail_balance()');
  await assert.rejects(close(id,first,snapshot),/fixture balance failure/);
  assert.deepEqual(await counts(id),before);
  assert.equal((await query('select count(*)::int n from public.bobby_progress_events where execution_receipt_id=$1',[good])).rows[0].n,0);
  await query('drop trigger fixture_fail_balance on public.bobby_progress');
  pass('late failure also rolls back receipt reservation and the awarded season piece');
  await query('update public.tl_items set active=false where id=$1',[SEASON.pieces[0]]);
  await assert.rejects(close(id,first,snapshot),/Season catalog incomplete/);
  assert.deepEqual(await counts(id),before);
  await query('update public.tl_items set active=true where id=$1',[SEASON.pieces[0]]);
  pass('missing season art/catalog fails without consuming the seed or receipt');
  const result=await close(id,first,snapshot);
  assert.equal(result.closed.executed.receiptId,good);
  assert.equal(result.closed.xp,15+EXECUTION_BONUS.xp);
  assert.equal(result.closed.aura,6+EXECUTION_BONUS.aura);
  assert.equal(result.closed.seasonItem.id,SEASON.pieces[0]);
  assert.deepEqual(await close(id,first,snapshot),result);
  assert.equal((await progress(id)).xp,35);
  pass('complete address-based lookup, exact bonus/season, and lost-response replay without double credit');

  const second=await plant(id);
  const third=await plant(id);
  const latest=(await query('select max(execution_eligible_at) at from public.bobby_progress_events where identity_id=$1',[id])).rows[0].at;
  const nextReceipt=await receipt(new Date(latest.getTime()+1).toISOString(),'eligible-second');
  const concurrentSnapshot=await progress(id);
  const parallel=await Promise.all([close(id,second,concurrentSnapshot),close(id,third,concurrentSnapshot)]);
  assert.equal(parallel.filter(r=>r.retry).length,1);
  const loser=parallel[0].retry ? second : third;
  const retry=await close(id,loser);
  assert.equal(retry.closed.executed,null);
  assert.equal((await query('select count(*)::int n from public.bobby_progress_events where execution_receipt_id=$1',[nextReceipt])).rows[0].n,1);
  assert.equal((await counts(id)).season,2);
  assert.equal((await progress(id)).xp,95); // 3 reads + 3 closes + 2 bonuses.
  pass('two simultaneous closes serialize; one receipt pays once and seasons do not repeat');

  const other=await identity(); const seed=await plant(other); const stale=await progress(other);
  await close(other,seed,stale);
  assert.equal((await commit(other,stale,[read(stale)])).retry,true);
  assert.equal((await progress(other)).xp,25);
  const current=await progress(other);
  await commit(other,current,[read(current)]);
  assert.equal((await progress(other)).xp,35);
  pass('stale sync cannot overwrite a close; a rebased sync preserves both awards');

  const same=await identity(); const sameSeed=await plant(same); const sameP=await progress(same);
  const sameResult=await Promise.all([close(same,sameSeed,sameP),close(same,sameSeed,sameP)]);
  assert.deepEqual(sameResult[0],sameResult[1]);
  assert.equal((await progress(same)).xp,25);
  pass('concurrent review of the same seed returns the same stored result');

  const legacy=await identity(); const legacySeed=await plant(legacy);
  const legacyWallet='0x'+'12'.repeat(20);
  await query('update public.bobby_identities set wallet_address=$1 where id=$2',[legacyWallet,legacy]);
  await receipt(new Date().toISOString(),'legacy-receipt',stable,asset,legacyWallet);
  await query('update public.bobby_progress_events set execution_eligible_at=null where identity_id=$1',[legacy]);
  assert.equal((await close(legacy,legacySeed)).closed.executed,null);
  const early=await identity(); const earlySeed=await plant(early);
  await query('update public.tl_inventory set seeded_at=now() where id=$1',[earlySeed]);
  assert.equal((await close(early,earlySeed)).status,409);
  pass('legacy reads close normally without new execution certification; database enforces the 24-hour wait');
  const staleRead=await identity(); const staleSeed=await plant(staleRead);
  const staleWallet='0x'+'34'.repeat(20);
  await query('update public.bobby_identities set wallet_address=$1 where id=$2',[staleWallet,staleRead]);
  await receipt(new Date(Date.now()-3600000).toISOString(),'late-confirmation',stable,asset,staleWallet);
  await receipt(new Date(Date.now()+3600000).toISOString(),'future-block',stable,asset,staleWallet);
  assert.equal((await close(staleRead,staleSeed)).closed.executed,null);
  pass('late confirmation of a pre-acceptance swap and a future block cannot satisfy the execution window');
  const originOwner=await identity();const origin=await issue(originOwner);
  const changed={...read(await progress(originOwner)),thesis_read_id:origin.id};
  changed.meta.thesis.direction='short';changed.meta.thesis.symbol='BTC';
  await commit(originOwner,await progress(originOwner),[changed]);
  const adopted=(await query('select meta,thesis_read_id,execution_asset_address from public.bobby_progress_events where identity_id=$1',[originOwner])).rows[0];
  assert.equal(adopted.meta.thesis.direction,'long');assert.equal(adopted.meta.thesis.symbol,'ETH');
  assert.equal(adopted.execution_asset_address,asset);
  const ownerAgain=await progress(originOwner);
  await commit(originOwner,ownerAgain,[{...read(ownerAgain),thesis_read_id:origin.id}]);
  assert.equal((await query('select count(*)::int n from public.bobby_progress_events where thesis_read_id=$1',[origin.id])).rows[0].n,1);
  pass('ledger adopts the immutable server snapshot and consumes its read ID only once');
  const foreign=await identity();const foreignP=await progress(foreign);
  const freshOrigin=await issue(originOwner);
  await commit(foreign,foreignP,[{...read(foreignP),thesis_read_id:freshOrigin.id}]);
  assert.equal((await query('select execution_eligible_at from public.bobby_progress_events where identity_id=$1',[foreign])).rows[0].execution_eligible_at,null);
  const expired=await issue(originOwner);
  await query("update public.bobby_thesis_reads set issued_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where id=$1",[expired.id]);
  const expiredP=await progress(originOwner);
  await commit(originOwner,expiredP,[{...read(expiredP),thesis_read_id:expired.id}]);
  assert.equal((await query('select count(*)::int n from public.bobby_progress_events where thesis_read_id=$1',[expired.id])).rows[0].n,0);
  pass('foreign and expired read references cannot certify execution eligibility');
  const unsigned=await identity();const unsignedP=await progress(unsigned);
  await commit(unsigned,unsignedP,[read(unsignedP)]);
  assert.equal((await query('select execution_eligible_at from public.bobby_progress_events where identity_id=$1',[unsigned])).rows[0].execution_eligible_at,null);
  pass('a plain submitted thesis remains learning progress, not execution proof');
  const quotaId=await identity();
  const many=await Promise.all(Array.from({length:121},()=>issue(quotaId)));
  assert.equal(many.filter(Boolean).length,120);
  pass('per-identity issuance cap holds under concurrent requests');
  const profileId=await identity();const profileP=await progress(profileId);
  const imported={...read(profileP),client_event_id:randomUUID(),kind:'legacy_import',points:100,awarded:100,aura:0,xp_after:100,execution_asset_address:null,meta:null};
  const noTrade={...read(profileP),client_event_id:randomUUID(),kind:'no_trade_respected',points:20,awarded:20,aura:6,xp_after:120};
  const profileSaved=await commit(profileId,profileP,[imported,noTrade],{...patch(profileP,'read_complete'),xp:120,aura:6,
    companion_id:'momo',risk_notice_version:3,quick_access:['ETH'],onboarded:true});
  assert.equal(profileSaved.progress.xp,120);assert.equal(profileSaved.progress.aura,6);
  assert.equal(profileSaved.progress.route_index,1);assert.equal(profileSaved.grants[noTrade.client_event_id].state,'bloomed');
  assert.equal(profileSaved.grants[imported.client_event_id],undefined);
  const updated=await commit(profileId,profileSaved.progress,[],{...profileSaved.progress,companion_id:null,risk_notice_version:1});
  assert.equal(updated.progress.xp,120);assert.equal(updated.progress.companion_id,null);
  assert.equal(updated.progress.risk_notice_version,3);assert.deepEqual(updated.progress.quick_access,['ETH']);
  pass('legacy import and NO TRADE keep their rewards; profile-only sync preserves balances and monotonic notice acceptance');
  const balances=await query(`select p.xp,p.aura,coalesce(sum(e.awarded),0)::integer ledger_xp,
    coalesce(sum(e.aura),0)::integer ledger_aura from public.bobby_progress p
    left join public.bobby_progress_events e on e.identity_id=p.identity_id group by p.identity_id`);
  for(const b of balances.rows) { assert.equal(b.xp,b.ledger_xp);assert.equal(b.aura,b.ledger_aura); }
  pass('all fixture balances equal their committed ledger totals after retries and failures');
  console.log(`PASS: ${checks} real-Postgres scenarios; no external calls or production records.`);
} finally {
  // This exact random schema was created by this process; public is untouched.
  await pool.query(`drop schema if exists ${schema} cascade`);
  await pool.end();
}
