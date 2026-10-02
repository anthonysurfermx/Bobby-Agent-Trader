import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';

process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.OPENAI_API_KEY = 'test-model';
const { runDeskDebate, loadDeskEvidence } = await import('../api/_lib/desk-debate.ts');
const { default: deskHandler } = await import('../api/desk-debate.ts');
const { default: accountHandler } = await import('../api/account.ts');
const { requireIdentity } = await import('../api/_lib/user-identity.ts');
const { revokeAppleAuthorization } = await import('../api/_lib/apple-revocation.ts');
const original = globalThis.fetch;
const json = (body: unknown, status=200) => new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
let checks=0;
function eq(got:unknown,want:unknown) { assert.deepEqual(got,want);checks++; }
const ID='11111111-1111-4111-8111-111111111111';
const req={method:'POST',headers:{origin:'https://bobbyprotocol.xyz',authorization:'Bearer test-user','x-forwarded-for':'127.0.0.99'},body:{}};
function response() {return {statusCode:200,body:null as any,setHeader(){},status(n:number){this.statusCode=n;return this;},json(value:unknown){this.body=value;return this;}};}
try {
  for (const status of [429,500,503]) {
    globalThis.fetch=async()=>json({},status);
    const res=response();await requireIdentity(req as never,res as never);eq(res.statusCode,503);
  }
  globalThis.fetch=async()=>json({},401);
  const invalid=response();await requireIdentity(req as never,invalid as never);eq(invalid.statusCode,401);

  // Real evidence adapter, no swap/alternate-source fallback when a stock is missing.
  const candles=Array.from({length:100},(_,i)=>({ts:Date.now()-(100-i)*3600000,open:100+i,high:102+i,low:99+i,close:101+i,volume:500}));
  const urls:string[]=[];
  globalThis.fetch=async(input)=>{urls.push(String(input));return json({candles});};
  const evidence=await loadDeskEvidence('NVDA');
  eq([evidence.provenance.instrument,evidence.provenance.provider,evidence.provenance.timeframe],['NVDA','Yahoo Finance','1H']);
  eq(urls.length,1);assert.match(urls[0],/stock-candles.*range=30d&interval=1h/);checks++;
  globalThis.fetch=async()=>json({candles:[]});
  await assert.rejects(loadDeskEvidence('NVDA'));checks++;
  globalThis.fetch=async()=>json({candles:candles.map(c=>({...c,ts:c.ts-10*86400000}))});
  await assert.rejects(loadDeskEvidence('BTC'));checks++;

  const prompts:any[]=[];
  globalThis.fetch=async(_input,init)=>{
    const body=JSON.parse(String(init?.body));prompts.push(body);
    return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(prompts.length===3
      ? {analysis:'Both arguments are conditional. Wait for stronger confirmation.',verdict:'wait',direction:'none',synthesis:{headline:'Wait for stronger confirmation.',why:'Both arguments are conditional.',risk:'The trend could fail without confirmation.',watch:'A close above resistance.',watchLevel:0,followUp:'What would confirm the NVDA trend?'}}
      : {analysis:prompts.length===1?'The recent trend supports a conditional opportunity.':'The trend could fail without further confirmation.'})}}]});
  };
  const question='Is the recent trend supported by this chart?';
  const debate=await runDeskDebate(question,evidence,'en');
  eq(prompts.length,3);eq(debate.agents.verdict,'wait');
  eq(prompts.every(p=>JSON.parse(p.messages[1].content).question===question),true);
  eq(JSON.parse(prompts[1].messages[1].content).alpha.analysis,debate.agents.alpha);
  eq(JSON.parse(prompts[2].messages[1].content).red.analysis,debate.agents.red);
  globalThis.fetch=async()=>json({choices:[{finish_reason:'length',message:{content:'{}'}}]});
  await assert.rejects(runDeskDebate(question,evidence,'en'));checks++;
  for(const [quota,status] of [[json({},503),503],[json(false),429]] as const) {
    // The reader's own meter runs first (a guest device here); the shared desk quota then fails or is spent.
    let calls=0,model=0,refunds=0;globalThis.fetch=async(input,init)=>{const url=String(input);if(url.includes('openai'))model++;
      if(url.includes('rpc/bobby_consume_read'))return json({allowed:true,code:null,readId:7,tier:'anon',used:1,limit:3,resetsAt:null});
      if(url.includes('bobby_reads?id=eq.7')&&init?.method==='DELETE'){refunds++;return json([]);}
      if(url.includes('rpc/bobby_consume_desk_quota'))calls++;return url.includes('bobby_desk_quotas?')?json([]):quota.clone();};
    const res=response();await deskHandler({...req,headers:{...req.headers,'x-bobby-device':'ci-device-0123456789'},body:{symbol:'BTC',question}} as never,res as never);
    eq(res.statusCode,status);eq(calls,1);eq(model,0);eq(res.body.agents,undefined);eq(refunds,1);
  }

  // Apple code exchange verifies signed subject/audience before revoking anything.
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
  const ec=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  Object.assign(process.env,{APPLE_SIGN_IN_TEAM_ID:'TEAM',APPLE_SIGN_IN_KEY_ID:'KEY',APPLE_SIGN_IN_CLIENT_ID:'xyz.bobbyprotocol.bobby',APPLE_SIGN_IN_PRIVATE_KEY:ec.privateKey.export({type:'pkcs8',format:'pem'}).toString()});
  const jwt=(subject:string)=>{
    const enc=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url');
    const data=`${enc({alg:'RS256',kid:'test-rsa'})}.${enc({iss:'https://appleid.apple.com',sub:subject,aud:'xyz.bobbyprotocol.bobby',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300})}`;
    return `${data}.${sign('RSA-SHA256',Buffer.from(data),rsa.privateKey).toString('base64url')}`;
  };
  for (const subject of ['wrong-user','apple-user']) {
    let revoked=0;
    globalThis.fetch=async(input,init)=>{
      const url=String(input);
      if(url.endsWith('/auth/token'))return json({id_token:jwt(subject),refresh_token:'test-refresh'});
      if(url.endsWith('/auth/keys'))return json({keys:[{...rsa.publicKey.export({format:'jwk'}),kid:'test-rsa',alg:'RS256'}]});
      if(url.endsWith('/auth/revoke')){revoked++;eq(new URLSearchParams(String(init?.body)).get('token'),'test-refresh');return json({});}
      throw new Error('Unexpected request');
    };
    if(subject==='wrong-user'){await assert.rejects(revokeAppleAuthorization('test-code','apple-user'));checks++;eq(revoked,0);}
    else {await revokeAppleAuthorization('test-code','apple-user');eq(revoked,1);}
  }

  // Deletion stays available for legacy accounts with no retained Apple token.
  delete process.env.APPLE_SIGN_IN_PRIVATE_KEY;
  const deletes:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input),method=init?.method??'GET';
    if(url.includes('api_cache'))return json([]);
    if(url.endsWith('/auth/v1/user'))return json({id:ID,app_metadata:{provider:'apple'}});
    if(url.includes('bobby_identities')&&method==='POST')return json([{id:ID,auth_user_id:ID,wallet_address:null}]);
    if(url.endsWith('/rpc/bobby_checkout_block_for_deletion'))return json({customer:null,sessionId:null});
    if(method==='DELETE'||method==='PATCH'){deletes.push(`${method} ${url}`);return json({});}
    if(url.includes('/admin/users/'))return json({identities:[{provider:'apple',identity_data:{sub:'apple-user'}}]});
    if(url.includes('bobby_subscriptions'))return json([]);
    throw new Error(`Unexpected test request: ${url}`);
  };
  const account=response();await accountHandler({...req,method:'DELETE'} as never,account as never);
  eq(account.statusCode,200);eq(account.body.appleRevocation,'manual');eq(deletes.length,3);
  eq(deletes[0].startsWith(`PATCH https://db.test/rest/v1/agent_trades?user_id=eq.${ID}`),true);
  eq(account.body.manualRevocationURL,'https://support.apple.com/en-us/102571');

  // Payments audit 2026-10-02 (STRIPE-02): a live card subscription is cancelled at Stripe before anything is
  // deleted; if Stripe cannot confirm, nothing is deleted.
  process.env.STRIPE_SECRET_KEY='sk_test_delete';
  for (const stripeStatus of [200,500]) {
    const writes:string[]=[];let cancelled=0;
    globalThis.fetch=async(input,init)=>{
      const url=String(input),method=init?.method??'GET';
      if(url.startsWith('https://api.stripe.com/v1/subscriptions/sub_live')&&method==='DELETE'){cancelled++;return json({},stripeStatus);}
      if(url.startsWith('https://api.stripe.com/v1/customers/search'))return json({data:[{id:'cus_1'}]});
      if(url.startsWith('https://api.stripe.com/v1/checkout/sessions?customer=cus_1'))return json({data:[]});
      if(url.startsWith('https://api.stripe.com/v1/subscriptions/search'))return json({data:[]});
      if(url.startsWith('https://api.stripe.com/v1/subscriptions?customer=cus_1'))return json({data:[{id:'sub_live',status:'active'}]});
      if(url.includes('api_cache'))return json([]);
      if(url.endsWith('/auth/v1/user'))return json({id:ID,app_metadata:{provider:'apple'}});
      if(url.includes('bobby_identities')&&method==='POST')return json([{id:ID,auth_user_id:ID,wallet_address:null}]);
      if(url.endsWith('/rpc/bobby_checkout_block_for_deletion'))return json({customer:null,sessionId:null});
      if(url.includes('bobby_subscriptions'))return json([{identity_id:ID,provider:'apple',status:'active',stripe_subscription_id:'sub_live',stripe_customer_id:'cus_1'}]);
      if(method==='DELETE'||method==='PATCH'){writes.push(`${method} ${url}`);return json({});}
      if(url.includes('/admin/users/'))return json({identities:[{provider:'apple',identity_data:{sub:'apple-user'}}]});
      throw new Error(`Unexpected test request: ${url}`);
    };
    const r=response();await accountHandler({...req,method:'DELETE'} as never,r as never);
    eq(cancelled,1);
    if(stripeStatus===200){eq(r.statusCode,200);eq(writes.length,3);}
    else{eq(r.statusCode,503);eq(writes.length,0);}
  }
  delete process.env.STRIPE_SECRET_KEY;
  console.log(`ios-remediation: ${checks} checks passed`);
} finally {globalThis.fetch=original;}
