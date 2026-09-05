// Local-only origin issuance checks. Providers/auth/freeze/HTTP are fixtures;
// the voice handler, snapshot extraction and persistence helper are real code.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { issuedThesisFromDesk } from '../api/_lib/thesis-provenance.js';
import { BASE_WETH } from '../src/lib/base-swap/tokens.js';

const thesis={symbol:'ETH',isEquity:false,direction:'long',price:3000,entry:3000,stop:2900,target:3200};
const valid={symbol:'ETH',isEquity:false,market:{price:3000},technicals:null,
  technical_pulse:{direction:'long',signal:'buy',conviction_pct:75,trade_plan:{entry:3000,stop:2900,target:3200}}};
assert.deepEqual(issuedThesisFromDesk(valid),thesis);
for(const change of [{technical_pulse:null},{technical_pulse:{...valid.technical_pulse,conviction_pct:54}},
  {technical_pulse:{...valid.technical_pulse,signal:'NO-TRADE'}},{market:{price:null}},
  {technical_pulse:{...valid.technical_pulse,trade_plan:{entry:3000,stop:null,target:3200}}}]) {
  assert.equal(issuedThesisFromDesk({...valid,...change}),null);
}
assert.deepEqual(issuedThesisFromDesk({...valid,technical_pulse:{...valid.technical_pulse,
  trade_plan:{...valid.technical_pulse.trade_plan,symbol:'BTC',direction:'short',isEquity:true,price:1}}}),thesis);
console.log('PASS: extraction preserves server fields; incomplete/NO TRADE/low-conviction data cannot issue execution proof.');

const id=randomUUID();const readId=randomUUID();
const originalFetch=globalThis.fetch;
const originalEnv={url:process.env.BOBBY_SUPABASE_URL,key:process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY};
const state={frozen:false,persistenceFails:false,freezeDuringRead:false};
Object.assign(globalThis,{__thesisProvenanceFixture:state});
process.env.BOBBY_SUPABASE_URL='https://thesis-fixture.invalid';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='local-only';
const bundle=await build({stdin:{contents:"export {default as handler} from './api/voice-tool.ts'",resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'fixtures',setup(b){
    b.onResolve({filter:/\/(user-identity|write-guard|request-security|control|okx-indicators|okx-asset-search)\.js$/},a=>({path:a.path,namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},a=>{
      const code=a.path.includes('user-identity') ? `export async function requireIdentity(req,res){if(req.headers.authorization==='Bearer fixture') return {id:'${id}'};res.status(401).json({error:'Sign in required'});return null;}` :
        a.path.includes('write-guard') ? "export async function guardWrite(req,res,opts){if(globalThis.__thesisProvenanceFixture.frozen){res.status(503).json({error:'Frozen'});return null;}return {body:opts.schema.parse(req.body)};}" :
        a.path.includes('request-security') ? 'export async function enforcePublicRateLimit(){return true;}' :
        a.path.includes('control') ? "export async function assertWritesOpen(){if(globalThis.__thesisProvenanceFixture.frozen) throw Error('Frozen');}" :
        a.path.includes('okx-asset-search') ? "export async function getBaseVenues(){return {spotId:'ETH-USDT',swapId:null};}export async function resolveOkxInstrument(){return null;}" :
        'export async function fetchOkxIndicatorBundle(){throw Error("Unexpected fallback");}';
      return {contents:code,loader:'js'};
    });
  }}]});
const {handler}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text+'\n//# sourceURL=thesis-provenance-fixture.mjs').toString('base64')}`);
let writes:Array<Record<string,any>>=[];let providerCalls=0;
globalThis.fetch=async(url,init)=>{
  const path=String(url);
  if(path.includes('/rpc/bobby_issue_thesis_read')) {
    const body=JSON.parse(String(init?.body));writes.push(body);
    return state.persistenceFails ? new Response('{}',{status:503}) : Response.json({id:readId,thesis:body.p_thesis,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString()});
  }
  providerCalls++;
  if(state.freezeDuringRead) state.frozen=true;
  if(path.includes('/api/okx-market?')) return Response.json({ticker:{last:'3000',change24h:'1'}});
  if(path.includes('/api/okx-candles?')) return Response.json({candles:[]});
  if(path.includes('/api/bobby-intel?')) return Response.json({technicalPulse:{assets:[{
    symbol:'ETH',direction:'long',signal:'buy',conviction:.75,tradePlan:{entry:3000,stop:2900,target:3200},
  }]}});
  throw Error(`Unexpected fixture URL: ${path}`);
};
async function request(args: Record<string,unknown>, authenticated=true,tool='run_debate') {
  const res={code:0,body:null as any,headers:{} as Record<string,string>,status(n:number){this.code=n;return this;},
    json(body:unknown){this.body=body;return this;},setHeader(k:string,v:string){this.headers[k]=v;}};
  await handler({method:'POST',headers:authenticated?{authorization:'Bearer fixture'}:{},body:{tool,args}},res);
  return res;
}
try {
  const issued=await request({symbol:'ETH',recordThesisRead:true,thesis:{symbol:'BTC',direction:'short'}});
  assert.equal(issued.code,200);assert.equal(issued.body.thesis_read.id,readId);
  assert.equal(writes.length,1);assert.equal(writes[0].p_identity,id);
  assert.deepEqual(writes[0].p_thesis,thesis);assert.equal(writes[0].p_asset,BASE_WETH.toLowerCase());
  assert.equal(issued.headers['Cache-Control'],'no-store');
  console.log('PASS: authenticated handler persists only the generated response, under its verified identity.');
  writes=[];
  assert.equal((await request({symbol:'ETH'},false)).body.thesis_read,null);assert.equal(writes.length,0);
  const before=providerCalls;
  assert.equal((await request({symbol:'ETH',recordThesisRead:true},false)).code,401);
  assert.equal(providerCalls,before);assert.equal(writes.length,0);
  assert.equal((await request({symbol:'ETH',recordThesisRead:true},true,'propose_trade')).code,200);
  assert.equal(writes.length,0);
  console.log('PASS: guests still read; unauthenticated proof requests and trade drafts cannot issue origin records.');
  state.frozen=true;
  assert.equal((await request({symbol:'ETH',recordThesisRead:true})).code,503);assert.equal(writes.length,0);
  state.frozen=false;state.freezeDuringRead=true;
  assert.equal((await request({symbol:'ETH',recordThesisRead:true})).body.thesis_read,null);assert.equal(writes.length,0);
  console.log('PASS: write freeze is checked before providers and again before recording the result.');
  state.freezeDuringRead=false;state.frozen=false;state.persistenceFails=true;
  const failed=await request({symbol:'ETH',recordThesisRead:true});
  assert.equal(failed.code,200);assert.equal(failed.body.thesis_read,null);assert.equal(failed.body.market.price,3000);
  console.log('PASS: persistence failure preserves the market answer but never invents a proof ID.');
} finally {
  globalThis.fetch=originalFetch;Reflect.deleteProperty(globalThis,'__thesisProvenanceFixture');
  for(const [key,value] of Object.entries({BOBBY_SUPABASE_URL:originalEnv.url,BOBBY_SUPABASE_SERVICE_ROLE_KEY:originalEnv.key})) {
    if(value===undefined) delete process.env[key];else process.env[key]=value;
  }
}
