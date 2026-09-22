import assert from 'node:assert/strict';
process.env.BOBBY_SUPABASE_URL='https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='test-service';
process.env.BOBBY_SUPABASE_ANON_KEY='test-anon';
process.env.OPENAI_API_KEY='test-openai';
delete process.env.BOBBY_CONTROL_SOURCE;
const calls: Array<{url:string;method:string;body:any;headers:Headers}>=[];
const identity='11111111-1111-4111-8111-111111111111';
let moderation:unknown={results:[{flagged:false}]};
let moderationStatus=200, saveReports=true, publishError:string|undefined;
let land:any={identity_id:identity,size:8,theme:'night',visibility:'private',share_code:'abcdefghij',title:'Quiet island',published_at:null,core_x:3,core_y:3,core_stage:0,moderation_status:'pending',community_blocked:false};
const response=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status});
globalThis.fetch=(async(input:any,init:RequestInit={})=>{
 const url=String(input), method=init.method??'GET', body=typeof init.body==='string'?JSON.parse(init.body):null;
 calls.push({url,method,body,headers:new Headers(init.headers)});
 if(url.includes('/v1/moderations'))return response(moderation,moderationStatus);
 if(url.includes('/auth/v1/user'))return response({id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',app_metadata:{provider:'apple'}});
 if(url.includes('bobby_identities'))return response([{id:identity,auth_user_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',wallet_address:null}]);
 if(url.includes('rpc/tl_publish_reviewed')){
   if(publishError)return response({ok:false,error:publishError});
   Object.assign(land,{title:body.p_title,share_code:body.p_code,visibility:'public',moderation_status:'approved'});
   return response({ok:true,code:body.p_code});
 }
 if(url.includes('tl_content_reports'))return saveReports?response([]):response({},503);
 if(url.includes('tl_lands')){if(method==='PATCH')Object.assign(land,body);return response([land]);}
 if(url.includes('tl_items'))return response([{id:'piece',world:'crypto_bay',tier:'common',tier_index:0,footprint_w:1,footprint_h:1,name:{en:'Piece'},active:true}]);
 if(url.includes('tl_inventory')||url.includes('tl_placements')||url.includes('bobby_progress?'))return response([]);
 if(url.includes('api_cache'))return response({},404);
 throw new Error('Unexpected test request: '+url);
}) as typeof fetch;
const {reviewIslandTitle}=await import('../api/_lib/trader-land-moderation.js');
const {default:publish}=await import('../api/trader-land.js');
const {default:report}=await import('../api/trader-land-report.js');
const {default:gallery}=await import('../api/trader-land-public.js');
let checks=0;
function eq(a:unknown,b:unknown){assert.deepEqual(a,b);checks++;}
async function call(handler:any,method:string,body:any={},query:any={}){
 const headers:Record<string,string>={};let status=200,result:any;
 const res:any={setHeader:(k:string,v:string)=>{headers[k]=v;},status:(v:number)=>{status=v;return res;},json:(v:any)=>{result=v;return res;}};
 await handler({method,body,query,headers:{authorization:'Bearer test-user','x-forwarded-for':'127.0.0.1'}},res);
 return {status,body:result,headers};
}
eq(await reviewIslandTitle(null),'approved');
eq(calls.length,0);
eq(await reviewIslandTitle('Mi arrecife tranquilo'),'approved');
moderation={results:[{flagged:true}]};eq(await reviewIslandTitle('abusive name'),'rejected');
moderation={results:[{}]};eq(await reviewIslandTitle('Ocean'),'unavailable');
moderationStatus=503;eq(await reviewIslandTitle('Ocean'),'unavailable');moderationStatus=200;
delete process.env.OPENAI_API_KEY;eq(await reviewIslandTitle('Ocean'),'unavailable');process.env.OPENAI_API_KEY='test-openai';
for(const title of ['www.scam.test','t.me/scam','FUCK','pu\u200bta'])eq(await reviewIslandTitle(title),'rejected');
moderation={results:[{flagged:true}]};
let before=calls.filter(c=>c.url.includes('tl_publish_reviewed')).length;
eq((await call(publish,'POST',{action:'publish',title:'Bad title'})).status,422);
eq(calls.filter(c=>c.url.includes('tl_publish_reviewed')).length,before);
eq(land.visibility,'private');
moderationStatus=503;eq((await call(publish,'POST',{action:'publish',title:'Ocean'})).status,503);eq(land.visibility,'private');
moderationStatus=200;moderation={results:[{flagged:false}]};publishError='community_blocked';
eq((await call(publish,'POST',{action:'publish',title:'Ocean'})).status,403);eq(land.visibility,'private');
publishError=undefined;eq((await call(publish,'POST',{action:'publish',title:'Ocean'})).status,200);eq(land.moderation_status,'approved');
const g=await call(gallery,'GET');eq(g.status,200);eq(g.headers['Cache-Control'],'no-store');
assert(calls.some(c=>c.url.includes('moderation_status=eq.approved&community_blocked=eq.false')));checks++;
const body={code:'abcdefghij',installation:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',reason:'harassment',details:'Please review this name'};
eq((await call(report,'POST',body)).status,200);
const stored=calls.findLast(c=>c.url.includes('tl_content_reports'))!.body;
eq(stored.target_identity,identity);eq(stored.reason,'harassment');eq(stored.installation,undefined);eq(stored.reporter_hash.length,64);
eq(stored.reporter_hash.includes(body.installation),false);eq(stored.status,'open');
eq(stored.reviewed_at,null);
eq(calls.findLast(c=>c.url.includes('tl_content_reports'))!.headers.get('Prefer'),'resolution=merge-duplicates,return=minimal');
eq((await call(report,'POST',{...body,reason:'ban-everyone'})).status,400);
eq((await call(report,'POST',{...body,details:'x'.repeat(501)})).status,400);
eq((await call(report,'POST',{...body,code:'../users'})).status,400);
saveReports=false;eq((await call(report,'POST',body)).status,503);
eq((await call(report,'GET')).status,405);
console.log(`${checks} moderation checks passed; mocked network only.`);
