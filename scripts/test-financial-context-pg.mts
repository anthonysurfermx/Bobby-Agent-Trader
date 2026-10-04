import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { FinancialItemSchema } from '../shared/financial-context.ts';

const url = process.env.DATABASE_URL;
if (!url) { if (process.env.CI) throw new Error('DATABASE_URL required'); console.log('financial-context-pg: SKIP (local scratch database required)'); process.exit(0); }
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)) throw new Error('Only a local scratch database is allowed');
const pool = new pg.Pool({ connectionString: url, max: 10 });
let checks = 0;
const eq = (value: unknown, expected: unknown) => { assert.deepEqual(value, expected); checks++; };
const q = async (sql: string, args: unknown[] = []) => (await pool.query(sql,args)).rows;
const rpc = async (fn: string, args: unknown[]) => (await q(`select public.${fn}(${args.map((_,i) => `$${i+1}`).join(',')}) as r`,args))[0].r;
const fact = { category: 'goal', summary: 'Build an emergency fund', amount: 3000, currency: 'EUR' };
const state = (id: string) => rpc('bobby_financial_list',[id]);
const enable = (id: string, on: boolean) => rpc('bobby_financial_set_enabled',[id,on]);
const save = (id: string, items = [fact], requestId = randomUUID(), draftId: string | null = null) => rpc('bobby_financial_import',[id,JSON.stringify(items),requestId,draftId]);
const recommendations = (id: string, symbol: string | null = null, limit: number | null = 10) => rpc('bobby_financial_recommendations',[id,symbol,limit]);
let a: string; let b: string; let wallet: string;
try {
  const migration = readFileSync('supabase/bobby-protocol/supabase/migrations/20261004160000_financial_context.sql','utf8');
  await q(migration); await q(migration);
  [a,b] = (await q('insert into bobby_identities(auth_user_id) values ($1),($2) returning id',[randomUUID(),randomUUID()])).map(row => row.id);
  wallet = (await q('insert into bobby_identities(wallet_address) values ($1) returning id',['0x'+randomUUID().replaceAll('-','')]))[0].id;
  eq((await state(a)).enabled,false); // no recommendation recording or financial imports before opt-in
  eq(await save(a),{error:'context_paused'});
  eq(await enable(wallet,true),{error:'signin_required'});
  eq(await enable(a,true),{ok:true}); await enable(b,true);
  const tables = ['bobby_financial_items','bobby_financial_settings','bobby_financial_imports','bobby_financial_drafts','bobby_saved_recommendations'];
  for (const table of tables) {
    for (const role of ['anon','authenticated']) for (const permission of ['select','insert','update','delete']) eq((await q('select has_table_privilege($1,$2,$3) as r',[role,table,permission]))[0].r,false);
    eq((await q('select relrowsecurity as r from pg_class where oid=$1::regclass',[table]))[0].r,true);
  }
  const functions = await q("select oid::regprocedure::text as signature from pg_proc where proname like 'bobby_financial_%'");
  for (const fn of functions) for (const role of ['anon','authenticated']) eq((await q('select has_function_privilege($1,$2,\'execute\') as r',[role,fn.signature]))[0].r,false);
  const request = randomUUID();
  eq(await save(a,[fact],request),{ok:true}); eq(await save(a,[fact],request),{ok:true});
  eq((await state(a)).items.length,1);
  eq(await save(a,[{...fact,amount:4000}],request),{error:'request_conflict'});
  eq((await state(b)).items.length,0);
  await Promise.all(Array.from({length:8},()=>save(a))); eq((await state(a)).items.length,1);
  const id=(await state(a)).items[0].id;
  eq(await rpc('bobby_financial_update',[b,id,JSON.stringify({...fact,amount:1})]),{error:'item_unavailable'});
  eq(await rpc('bobby_financial_forget',[b,id]),{ok:true}); eq((await state(a)).items[0].amount,3000);
  eq(await rpc('bobby_financial_update',[a,id,JSON.stringify({...fact,amount:4000})]),{ok:true}); eq((await state(a)).items[0].amount,4000);
  eq((await state(a)).items[0].verification,'user_reported');
  for (const bad of [{...fact,transcript:'all chats'}, {...fact,amount:-1}, {...fact,summary:'Card 4242 4242 4242 4242'}, {...fact,observedAt:'2026-02-31'}]) eq(await rpc('bobby_financial_import',[a,JSON.stringify([bad]),randomUUID(),null]),{error:'invalid_context'});
  for (const summary of ['I earn USD1000 every month','Rent is EUR1200 per month','Covid19 reduced my income']) {
    const item={...fact,summary};
    eq(FinancialItemSchema.safeParse(item).success,true);
    eq(await rpc('bobby_financial_item_valid',[JSON.stringify(item)]),true);
    eq(await save(a,[item]),{ok:true});
  }
  for (const summary of ['IBAN GB82WEST12345698765432','IBAN PT50 0000 0000 0000 0000 0000 0','IBAN MT84MALT011000012345MTLCAST001S','éMT84MALT011000012345MTLCAST001S']) {
    const item={...fact,summary};
    eq(FinancialItemSchema.safeParse(item).success,false);
    eq(await rpc('bobby_financial_item_valid',[JSON.stringify(item)]),false);
    eq(await save(a,[item]),{error:'invalid_context'});
  }
  const draft = await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]);
  eq((await state(a)).drafts.length,1); eq((await state(a)).items.length,4);
  eq(await save(b,[fact],randomUUID(),draft.id),{error:'draft_unavailable'});
  const confirm = randomUUID(); eq(await save(a,[fact],confirm,draft.id),{ok:true}); eq(await save(a,[fact],confirm,draft.id),{ok:true});
  eq((await state(a)).drafts.length,0);
  eq(await save(a,[fact],randomUUID(),draft.id),{error:'draft_unavailable'});
  const expired = await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]);
  await q("update bobby_financial_drafts set expires_at=now()-interval '1 second' where id=$1",[expired.id]);
  eq((await state(a)).drafts.length,0); eq(await save(a,[fact],randomUUID(),expired.id),{error:'draft_unavailable'});
  const cappedDrafts=[];
  for(let i=0;i<5;i++) cappedDrafts.push(await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]));
  eq((await state(a)).drafts.length,5);
  eq(await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]),{error:'draft_limit'});
  for(const pending of cappedDrafts) await rpc('bobby_financial_dismiss',[a,pending.id]);
  eq((await state(a)).drafts.length,0);
  await enable(a,false); eq(await save(a),{error:'context_paused'}); eq(await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]),{error:'context_paused'});
  await enable(a,true);
  await q('insert into bobby_user_prefs(identity_id,memory_enabled) values($1,false)',[a]);
  eq((await state(a)).enabled,false); eq(await save(a),{error:'context_paused'});
  eq([(await state(a)).financialMemoryEnabled,(await state(a)).accountMemoryEnabled],[true,false]);
  await enable(a,false);
  eq((await state(a)).financialMemoryEnabled,false);
  await q('update bobby_user_prefs set memory_enabled=true where identity_id=$1',[a]);
  eq((await state(a)).enabled,false); // resuming global memory cannot silently reverse financial pause
  await enable(a,true);
  const snapshot={symbol:'BTC',asOf:'2026-10-04T12:00:00Z',headline:'Wait for clearer evidence',why:'The longer horizon is missing',risk:'The available data is insufficient',watch:'Review the next daily close',verdict:'wait',direction:'none'};
  eq(await rpc('bobby_financial_record_recommendation',[a,JSON.stringify(snapshot)]),true);
  eq((await state(a)).recommendations[0].headline,snapshot.headline); eq((await state(b)).recommendations.length,0);
  eq(await rpc('bobby_financial_record_recommendation',[a,JSON.stringify({...snapshot,question:'raw private question'})]),false);
  eq(await rpc('bobby_financial_record_recommendation',[a,JSON.stringify({...snapshot,symbol:'NVDA',headline:'Older NVDA analysis'})]),true);
  await q("update bobby_saved_recommendations set created_at=now()-interval '2 hours' where identity_id=$1 and snapshot->>'symbol'='NVDA'",[a]);
  eq(await rpc('bobby_financial_record_recommendation',[b,JSON.stringify({...snapshot,symbol:'NVDA',headline:'Other account NVDA analysis'})]),true);
  for(let i=0;i<20;i++) await rpc('bobby_financial_record_recommendation',[a,JSON.stringify({...snapshot,headline:`Newer BTC analysis ${i}`})]);
  eq((await state(a)).recommendations.length,20);
  eq((await state(a)).recommendations.some((r:any)=>r.symbol==='NVDA'),false); // intentionally outside the app's newest-20 view
  eq((await recommendations(a,'NVDA')).recommendations.map((r:any)=>r.headline),['Older NVDA analysis']);
  eq((await recommendations(b,'NVDA')).recommendations.map((r:any)=>r.headline),['Other account NVDA analysis']);
  eq((await recommendations(a,'BTC',5)).recommendations.length,5);
  eq((await recommendations(a,null,20)).recommendations.length,20);
  eq((await recommendations(a,'AMZN')).recommendations,[]);
  for(const limit of [0,21,null]) eq(await recommendations(a,'NVDA',limit),{error:'invalid_context'});
  eq(await recommendations(a,''),{error:'invalid_context'});
  eq(await recommendations(wallet,'NVDA'),{error:'signin_required'});
  await enable(a,false); eq(await recommendations(a,'NVDA'),{error:'context_paused'}); await enable(a,true);
  await q('update bobby_user_prefs set memory_enabled=false where identity_id=$1',[a]);
  eq(await recommendations(a,'NVDA'),{error:'context_paused'});
  await q('update bobby_user_prefs set memory_enabled=true where identity_id=$1',[a]);
  await enable(a,false); eq(await rpc('bobby_financial_record_recommendation',[a,JSON.stringify(snapshot)]),false); await enable(a,true);
  // Forgetting one asset removes its saved snapshots, while preserving all other facts/accounts/assets.
  await q('insert into bobby_user_assets(identity_id,symbol) values($1,\'BTC\'),($2,\'BTC\')',[a,b]);
  eq(await rpc('bobby_financial_record_recommendation',[b,JSON.stringify({...snapshot,headline:'Other account BTC analysis'})]),true);
  const financialFacts=(await state(a)).items;
  eq(await rpc('bobby_memory_forget',[a,'BTC']),1);
  eq((await recommendations(a,'BTC')).recommendations,[]);
  eq((await recommendations(a,'NVDA')).recommendations.map((r:any)=>r.headline),['Older NVDA analysis']);
  eq((await recommendations(b,'BTC')).recommendations.map((r:any)=>r.headline),['Other account BTC analysis']);
  eq((await recommendations(b,'NVDA')).recommendations.map((r:any)=>r.headline),['Other account NVDA analysis']);
  eq((await state(a)).items,financialFacts);
  eq(Number((await q('select count(*) from bobby_user_assets where identity_id=$1',[a]))[0].count),0);
  eq(Number((await q('select count(*) from bobby_user_assets where identity_id=$1',[b]))[0].count),1);
  await q("update bobby_saved_recommendations set created_at=now()-interval '91 days' where identity_id=$1",[a]); eq((await state(a)).recommendations.length,0);
  eq((await recommendations(a,'NVDA')).recommendations,[]);
  await rpc('bobby_financial_purge',[]);
  eq(Number((await q('select count(*) from bobby_saved_recommendations where identity_id=$1',[a]))[0].count),0);
  eq(Number((await q('select count(*) from bobby_financial_drafts where id=$1',[expired.id]))[0].count),0);
  for(let i=0;i<3;i++) await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]);
  eq(await rpc('bobby_memory_forget',[a,null]),0);
  eq([(await state(a)).items.length,(await state(a)).drafts.length,(await state(a)).recommendations.length],[0,0,0]);
  // Account-level cap is atomic under parallel imports.
  const bulk=Array.from({length:20},(_,i)=>({...fact,summary:`Chosen goal number ${i}`}));
  await save(a,bulk); await save(a,bulk.map(x=>({...x,summary:`Second ${x.summary}`})));
  const races=await Promise.all([save(a,bulk.map(x=>({...x,summary:`Third ${x.summary}`}))),save(a,bulk.map(x=>({...x,summary:`Fourth ${x.summary}`})))]);
  eq(races,[{error:'context_limit'},{error:'context_limit'}]); eq((await state(a)).items.length,40);
  await save(b); await rpc('bobby_financial_prepare',[b,JSON.stringify([fact])]);
  await q('delete from bobby_identities where id=$1',[b]);
  for(const table of tables) eq(Number((await q(`select count(*) from ${table} where identity_id=$1`,[b]))[0].count),0);
  console.log(`financial-context-pg: ${checks} PASS (real PostgreSQL: consent, ACLs, isolation, concurrency, retention, cascade)`);
} finally {
  for(const id of [a,b,wallet].filter(Boolean)) await q('delete from bobby_identities where id=$1',[id]).catch(()=>{});
  await pool.end();
}
