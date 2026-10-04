import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { parseContextImport, FinancialItemSchema, ContextImportSchema } from '../shared/financial-context.ts';

process.env.BOBBY_SUPABASE_URL='https://db.test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='offline-service';
process.env.BOBBY_SUPABASE_ANON_KEY='offline-anon';
process.env.RATE_LIMIT_SALT='offline-salt';
const {default:handler}=await import('../api/financial-context.ts');
const {recordRecommendation}=await import('../api/_lib/financial-context.ts');
let checks=0;
const eq=(value:unknown,expected:unknown)=>{assert.deepEqual(value,expected);checks++;};
const fact={category:'goal',summary:'Build my emergency fund',amount:3000,currency:'EUR'};
eq(parseContextImport(JSON.stringify({format:'bobby-context-v1',items:[fact]})),[fact]);
eq(parseContextImport('```json\n'+JSON.stringify({format:'bobby-context-v1',items:[fact]})+'\n```'),[fact]);
for(const bad of [{...fact,transcript:'all chats'},{...fact,category:'instructions'},{...fact,summary:'Card 4242 4242 4242 4242'}, {...fact,summary:'IBAN PT50 0000 0000 0000 0000 0000 0'}, {...fact,amount:-1}, {...fact,currency:undefined}, {...fact,observedAt:'2026-02-31'}, {...fact,summary:'a\nb'}, {...fact,summary:'sk-testabcdefghijklmnop'}]) eq(FinancialItemSchema.safeParse(bad).success,false);
eq(ContextImportSchema.safeParse({format:'bobby-context-v1',items:Array(21).fill(fact)}).success,false);
assert.throws(()=>parseContextImport('x'.repeat(17000)));checks++;
const account=randomUUID(), identity=randomUUID();
const state={enabled:true,financialMemoryEnabled:true,accountMemoryEnabled:true,items:[],drafts:[],recommendations:[]};
let calls:Array<{url:string,body:any}>=[]; let down=false; let conflict='';
const original=globalThis.fetch;
globalThis.fetch=(async (input,init)=>{
  const url=String(input), body=init?.body?JSON.parse(String(init.body)):null;calls.push({url,body});
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
  if(url.includes('/auth/v1/user')) return (init?.headers as any)?.Authorization==='Bearer account-token'?json({id:account}):json({},401);
  if(url.includes('bobby_identities?')) return json([{id:identity,auth_user_id:account,wallet_address:null}]);
  if(url.includes('api_cache')) return json([]);
  if(url.includes('bobby_financial_list')) return down?json({},500):json(state);
  if(url.includes('bobby_financial_record_recommendation')) return json(true);
  if(url.includes('bobby_financial_')) return conflict?json({error:conflict}):json({ok:true});
  throw new Error(`Unexpected offline call ${url}`);
}) as typeof fetch;
const invoke=async(method='GET',body?:unknown,query:any={},auth:boolean|string=true,origin='https://bobbyprotocol.xyz')=>{
  calls=[];
  const res={statusCode:200,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.statusCode=n;return this;},json(value:unknown){this.body=value;return this;}};
  await handler({method,body,query,headers:{...(auth?{authorization:typeof auth==='string'?auth:'Bearer account-token'}:{}),origin,'x-forwarded-for':`198.51.100.${checks}`}} as any,res as any);return res;
};
try {
  eq((await invoke('GET',undefined,{},false)).statusCode,401);eq(calls.filter(c=>c.url.includes('bobby_financial')).length,0);
  eq((await invoke('POST',{action:'import',items:[fact],consent:true,requestId:randomUUID()}, {},true,'https://evil.test')).statusCode,403);
  eq((await invoke('POST',{action:'import',items:[fact],requestId:randomUUID()})).statusCode,400);
  eq((await invoke('POST',{action:'import',items:[fact],consent:true,requestId:randomUUID(),identityId:randomUUID()})).statusCode,400);
  eq((await invoke('POST',{action:'import',items:[fact],consent:true,requestId:randomUUID()})).statusCode,200);
  eq(calls.find(c=>c.url.includes('bobby_financial_import'))?.body.p_identity,identity);
  eq((await invoke('DELETE')).statusCode,400); // never infer erase-all from a malformed query
  eq((await invoke('DELETE',undefined,{id:''})).statusCode,400);
  eq((await invoke('DELETE',undefined,{scope:'all'})).statusCode,200);
  eq(calls.find(c=>c.url.includes('bobby_financial_forget'))?.body,{p_identity:identity,p_id:null});
  eq((await invoke('PATCH',{enabled:false})).statusCode,200);
  process.env.CRON_SECRET='offline-cleanup-secret';
  eq((await invoke('GET',undefined,{op:'purge'})).statusCode,401);
  eq((await invoke('GET',undefined,{op:'purge'},'Bearer offline-cleanup-secret')).statusCode,200);
  eq(calls.some(call=>call.url.includes('/auth/v1/user')),false);
  conflict='context_paused';eq((await invoke('POST',{action:'import',items:[fact],consent:true,requestId:randomUUID()})).body.code,'context_paused');conflict='';
  down=true;eq((await invoke()).statusCode,503);down=false;
  const result={symbol:'BTC',provenance:{asOf:'2026-10-04T12:00:00Z'},question:'private original question',agents:{verdict:'wait',direction:'none',synthesis:{headline:'Wait for clearer evidence',why:'Need more history',risk:'Missing higher timeframe',watch:'The next daily close',followUp:'Private next question',watchLevel:1}}};
  calls=[];eq(await recordRecommendation(identity,result),true);
  const payload=calls[0].body.p_snapshot;
  eq(Object.keys(payload).sort(),['asOf','direction','headline','risk','symbol','verdict','watch','why']);
  eq(JSON.stringify(payload).includes('private'),false);
  console.log(`financial-context: ${checks} PASS (local parsing, validation, authenticated review, pause, minimal recommendations)`);
} finally {globalThis.fetch=original;}
