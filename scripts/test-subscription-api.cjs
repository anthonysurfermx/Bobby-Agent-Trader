// Actual bundled handlers and access module, with local HTTP mocks only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
process.env.BOBBY_SUPABASE_URL='https://simulation.invalid';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='simulation-only';
process.env.RATE_LIMIT_SALT='simulation-only-salt';
process.env.VERCEL_ENV='preview';
delete process.env.REVENUECAT_SECRET_KEY;
const {consumeRead} = require('/private/tmp/bobby-business-modules/_lib/access.js');
const accessHandler = require('/private/tmp/bobby-business-modules/bobby-access.js').default;
const voiceHandler = require('/private/tmp/bobby-business-modules/voice-tool.js').default;
let mode='unavailable', aiCalls=0;
global.fetch=async (url, options={}) => {
  const u=new URL(url);
  if(u.hostname!=='simulation.invalid'){aiCalls++;throw Error('Unexpected external provider request');}
  if(u.pathname==='/rest/v1/api_cache')return options.method==='POST'?new Response(null,{status:204}):Response.json([]);
  if(u.pathname==='/rest/v1/rpc/bobby_read_access')return Response.json({tier:'anon',used:0,limit:3});
  if(u.pathname==='/rest/v1/rpc/bobby_consume_read'){
    if(mode==='transport')throw Error('simulated disconnect');
    if(mode==='unavailable')return Response.json({error:'unavailable'},{status:503});
    if(mode==='malformed')return Response.json({tier:'anon',used:0});
    return Response.json({allowed:mode==='allowed',code:mode==='allowed'?null:'signin_required',readId:mode==='allowed'?1:null,tier:'anon',used:mode==='allowed'?1:3,limit:3});
  }
  throw Error('Unmocked route '+u.pathname);
};
function response(){return {statusCode:200,body:null,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};}
const req={method:'POST',headers:{'x-bobby-device':'11111111-1111-4111-8111-111111111111','x-bobby-platform':'ios'},socket:{remoteAddress:'127.0.0.1'},body:{tool:'run_debate',args:{symbol:'BTC'}}};
(async()=>{
 const checks=[];
 for(mode of ['unavailable','transport','malformed']){
   const gate=await consumeRead(req,'BTC');assert.equal(gate.allowed,false);assert.equal(gate.code,'meter_unavailable');
   const res=response();await voiceHandler(req,res);assert.equal(res.statusCode,503);assert.equal(res.body.code,'meter_unavailable');
   checks.push({case:mode,blocked_before_ai:true,http_status:503});
 }
 assert.equal(aiCalls,0);
 mode='denied';assert.equal((await consumeRead(req,'BTC')).code,'signin_required');
 mode='allowed';assert.equal((await consumeRead(req,'BTC')).allowed,true);
 const get={...req,method:'GET'};
 let res=response();await accessHandler(get,res);assert.deepEqual(res.body.payments,{stripe:false,apple:false,revenuecat:false});
 process.env.REVENUECAT_SECRET_KEY='simulation-only';res=response();await accessHandler(get,res);assert.equal(res.body.payments.apple,true);assert.equal(res.body.payments.revenuecat,true);
 const result={scope:'actual bundled handlers, mocked HTTP only; no real AI or payments',outage_cases:checks,normal_gate_behavior_preserved:true,payment_readiness_contract_passed:true,external_ai_calls:aiCalls};
 fs.writeFileSync('docs/audits/subscription-readiness-2026-09-30/api-regression.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(error=>{console.error(error);process.exit(1)});
