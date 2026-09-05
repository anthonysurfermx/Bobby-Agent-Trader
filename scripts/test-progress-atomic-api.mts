// The actual API orchestration with mocked identity, market and HTTP transport.
// The companion queue and database RPCs have separate real implementation tests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { BASE_WETH } from '../src/lib/base-swap/tokens.js';

const id=randomUUID();
const oldFetch=globalThis.fetch;
const envKeys=['BOBBY_SUPABASE_URL','BOBBY_SUPABASE_SERVICE_ROLE_KEY'] as const;
const oldEnv=envKeys.map(k=>process.env[k]);
process.env.BOBBY_SUPABASE_URL='https://atomic-test.invalid';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='local-fixture';
const bundle=await build({
  stdin:{contents:"export { default as handler } from './api/progress.ts'; export { closeSeed } from './api/_lib/trader-land.ts';",resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',plugins:[{
    name:'local-auth-market-fixtures',setup(b) {
      b.onResolve({filter:/\/(user-identity|write-guard|public-price)\.js$/},args=>({path:args.path,namespace:'fixture'}));
      b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:
        args.path.includes('user-identity') ? `export async function requireIdentity() { return ${JSON.stringify({id,wallet:null,authUserId:id,via:'supabase'})}; }` :
        args.path.includes('write-guard') ? 'export async function guardWrite(req,res,opts) { return { body: opts.schema.parse(req.body) }; }' :
        'export async function publicLastPrice() { throw new Error("Unexpected market IO"); }',loader:'js'}));
    },
  }],
});
const {handler,closeSeed}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=progress-atomic-fixture.mjs').toString('base64')}`);
function response() {
  return {code:0,body:null as any,status(n:number){this.code=n;return this;},json(value:unknown){this.body=value;return this;},setHeader(){}};
}
const row={identity_id:id,revision:0,xp:0,aura:0,route_index:0,streak:0,last_day:null,daily_awards:0,daily_awards_day:null,
  companion_id:null,vibe_id:'directo',onboarded:false,risk_notice_version:0,quick_access:[],last_platform:null,updated_at:new Date().toISOString()};
const thesis={symbol:'ETH',direction:'long',price:3000,entry:3000,stop:2900,target:3200,isEquity:false};
const event={id:randomUUID(),kind:'read_complete',at:new Date().toISOString(),thesis};
try {
  let writes=0;
  globalThis.fetch=async (url,init)=>{
    const path=new URL(String(url)).pathname;
    assert.ok(String(url).startsWith('https://atomic-test.invalid/rest/v1/'));
    if(path.endsWith('/bobby_progress')) {
      assert.ok(!init?.method || init.method==='GET');
      return Response.json([{...row,revision:writes,xp:writes ? 25 : 0,aura:writes ? 10 : 0}]);
    }
    if(path.endsWith('/bobby_progress_events')) return Response.json([]);
    assert.ok(path.endsWith('/rpc/bobby_commit_progress'),'only one atomic write endpoint');
    const body=JSON.parse(String(init?.body));
    assert.equal(body.p_events.length,1,'duplicate event IDs within the batch collapse');
    assert.deepEqual(body.p_events[0].meta,{thesis,thesisSource:'client_snapshot'});
    assert.equal(body.p_events[0].execution_asset_address,BASE_WETH.toLowerCase());
    assert.equal(body.p_events[0].execution_eligible_at,undefined,'API does not set eligibility clock');
    writes++;
    if(writes===1) return Response.json({retry:true});
    assert.equal(body.p_revision,1);
    assert.equal(body.p_patch.xp,35,'rebase includes concurrently credited XP');
    assert.equal(body.p_patch.aura,12);
    return Response.json({progress:{...row,...body.p_patch,revision:2},grants:{}});
  };
  const res=response();
  await handler({method:'POST',body:{platform:'web',events:[event,event]}},res);
  assert.equal(res.code,200);assert.equal(res.body.progress.xp,35);assert.equal(writes,2);
  console.log('PASS: real progress handler deduplicates, canonicalizes and rebases on a stale revision.');

  let attempts=0;
  globalThis.fetch=async(url)=>{
    if(String(url).includes('/rpc/')) { attempts++;return Response.json({retry:true}); }
    if(String(url).includes('/bobby_progress?')) return Response.json([row]);
    return Response.json([]);
  };
  const busy=response();await handler({method:'POST',body:{platform:'web',events:[event]}},busy);
  assert.equal(busy.code,503);assert.equal(attempts,4);
  console.log('PASS: sustained contention has a bounded retry and does not acknowledge a failed save.');

  globalThis.fetch=async(url)=>{
    assert.ok(!String(url).includes('/rpc/'),'failed history read must not reach a writer');
    return String(url).includes('/bobby_progress?') ? Response.json([row]) : new Response('{}',{status:503});
  };
  const failed=response();await handler({method:'POST',body:{platform:'web',events:[event]}},failed);
  assert.equal(failed.code,500);
  console.log('PASS: history lookup failure does not write or acknowledge events.');

  const stored={inventoryId:randomUUID(),itemId:'fixture',outcome:'expired',symbol:null,direction:null,
    referencePx:null,closePx:null,movePct:null,xp:15,aura:6,xpAfter:25,ledgerEventId:randomUUID(),executed:null,
    seasonItem:null,seasonInventory:[]};
  let requests=0;
  globalThis.fetch=async(url)=>{requests++;assert.ok(String(url).includes('close_inventory_id=eq.'));return Response.json([{meta:{close_result:stored}}]);};
  const replay=await closeSeed({id,wallet:null},stored.inventoryId,{platform:'web',tzOffsetMin:0});
  assert.equal(replay.ok,true);assert.equal(replay.closed.ledgerEventId,stored.ledgerEventId);assert.equal(requests,1);
  console.log('PASS: a saved close response replays without another price request or balance write.');

  let closes=0;
  globalThis.fetch=async(url,init)=>{
    const path=String(url);
    if(path.includes('close_inventory_id=')) return Response.json([]);
    if(path.includes('/tl_inventory?')) return Response.json([{id:stored.inventoryId,item_id:'fixture',state:'seed',event_id:randomUUID(),seeded_at:new Date(Date.now()-25*3600000).toISOString()}]);
    if(path.includes('/bobby_progress_events?')) return Response.json([]); // Legacy thesis: no market IO.
    if(path.includes('/bobby_progress?')) return Response.json([{...row,revision:closes,xp:10}]);
    assert.ok(path.endsWith('/rpc/bobby_close_seed'));
    const body=JSON.parse(String(init?.body));
    assert.equal(body.p_identity,id);assert.equal(body.p_inventory,stored.inventoryId);
    assert.equal(body.p_revision,closes);assert.equal(body.p_wallet,undefined);
    assert.ok(body.p_stables.length>0);assert.equal(body.p_season.length,6);
    closes++;
    return Response.json(closes===1 ? {retry:true} : {closed:stored});
  };
  assert.equal((await closeSeed({id,wallet:null},stored.inventoryId,{platform:'web',tzOffsetMin:0})).ok,true);
  assert.equal(closes,2);
  console.log('PASS: fresh close uses the atomic RPC, canonical server configuration and bounded revision rebase.');
} finally {
  globalThis.fetch=oldFetch;
  envKeys.forEach((key,i)=>{if(oldEnv[i]===undefined) delete process.env[key];else process.env[key]=oldEnv[i];});
}
