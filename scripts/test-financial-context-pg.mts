import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

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
  const draft = await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]);
  eq((await state(a)).drafts.length,1); eq((await state(a)).items.length,1);
  eq(await save(b,[fact],randomUUID(),draft.id),{error:'draft_unavailable'});
  const confirm = randomUUID(); eq(await save(a,[fact],confirm,draft.id),{ok:true}); eq(await save(a,[fact],confirm,draft.id),{ok:true});
  eq((await state(a)).drafts.length,0);
  eq(await save(a,[fact],randomUUID(),draft.id),{error:'draft_unavailable'});
  const expired = await rpc('bobby_financial_prepare',[a,JSON.stringify([fact])]);
  await q("update bobby_financial_drafts set expires_at=now()-interval '1 second' where id=$1",[expired.id]);
  eq((await state(a)).drafts.length,0); eq(await save(a,[fact],randomUUID(),expired.id),{error:'draft_unavailable'});
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
  await enable(a,false); eq(await rpc('bobby_financial_record_recommendation',[a,JSON.stringify(snapshot)]),false); await enable(a,true);
  await q("update bobby_saved_recommendations set created_at=now()-interval '91 days' where identity_id=$1",[a]); eq((await state(a)).recommendations.length,0);
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
