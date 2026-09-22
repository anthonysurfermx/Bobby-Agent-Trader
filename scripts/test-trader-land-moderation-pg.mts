// Real SQL transactions and permissions, restricted to a disposable local database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';
const url=process.env.DATABASE_URL;
if(!url||!['localhost','127.0.0.1','::1'].includes(new URL(url).hostname)||new URL(url).pathname!='/bobby_store35_moderation_test')throw new Error('Local scratch database only');
const db=new pg.Pool({connectionString:url});
let checks=0;
const eq=(a:unknown,b:unknown)=>{assert.deepEqual(a,b);checks++;};
const one='11111111-1111-4111-8111-111111111111',two='22222222-2222-4222-8222-222222222222';
try{
 await db.query(`drop table if exists tl_content_reports,tl_lands,bobby_identities cascade;
 create table bobby_identities(id uuid primary key);
 create table tl_lands(identity_id uuid primary key references bobby_identities(id) on delete cascade, visibility text not null default 'private',share_code text unique,title text,published_at timestamptz);
 insert into bobby_identities values('${one}'),('${two}');
 insert into tl_lands(identity_id) values('${one}'),('${two}');`);
 const migration=readFileSync('supabase/bobby-protocol/supabase/migrations/20260922120000_trader_land_moderation.sql','utf8');
 await db.query(migration);await db.query(migration);
 const publish=async(id:string,code:string|null,title:string|null)=>(await db.query('select tl_publish_reviewed($1,$2,$3) as r',[id,code,title])).rows[0].r;
 eq((await publish(one,null,'Ocean')).ok,false);
 eq((await publish(one,'abcdefghij','Ocean')).ok,true);
 eq((await db.query('select moderation_status from tl_lands where identity_id=$1',[one])).rows[0].moderation_status,'approved');
 eq((await publish(one,'short','New name')).ok,false);
 eq((await publish(one,'klmnopqrst','New name')).code,'abcdefghij');
 eq((await publish(two,'otherislan','x'.repeat(41))).ok,false);
 await assert.rejects(()=>publish(two,'abcdefghij','Duplicate'));checks++;
 const blocker=await db.connect();
 await blocker.query('begin');
 await blocker.query("update tl_lands set community_blocked=true,visibility='private',moderation_status='rejected' where identity_id=$1",[one]);
 const racing=publish(one,'abcdefghij','Trying again');
 await blocker.query('commit');blocker.release();
 eq((await racing).error,'community_blocked');
 eq((await db.query('select visibility from tl_lands where identity_id=$1',[one])).rows[0].visibility,'private');
 for(const role of ['anon','authenticated']){
 eq((await db.query("select has_function_privilege($1,'tl_publish_reviewed(uuid,text,text)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
 eq((await db.query("select has_table_privilege($1,'tl_content_reports','SELECT') as allowed",[role])).rows[0].allowed,false);
 }
 await db.query("insert into tl_content_reports(target_identity,reporter_hash,code,reason) values($1,$2,'abcdefghij','spam')",[one,'a'.repeat(64)]);
 await assert.rejects(()=>db.query("insert into tl_content_reports(target_identity,reporter_hash,code,reason) values($1,$2,'abcdefghij','spam')",[one,'a'.repeat(64)]));checks++;
 await db.query('delete from bobby_identities where id=$1',[one]);
 eq(Number((await db.query('select count(*) from tl_content_reports')).rows[0].count),0);
 console.log(`${checks} real PostgreSQL moderation checks passed.`);
}finally{await db.end();}
