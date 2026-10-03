// Real authenticated handler and provider verification, synthetic HTTP/RPC only; never creates a real checkout.
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
Object.assign(process.env,{BOBBY_SUPABASE_URL:'https://db.test',BOBBY_SUPABASE_SERVICE_ROLE_KEY:'local-service',BOBBY_SUPABASE_ANON_KEY:'local-anon',
 REVENUECAT_SECRET_KEY:'local-rc',BOBBY_PURCHASE_TOKEN_KEY:'a'.repeat(64),BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL:'fixture@fixture.iam.gserviceaccount.com',
 BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'}).toString(),
 BOBBY_GOOGLE_PRODUCT_CATALOG:JSON.stringify([{productId:'bobby_pro',basePlanId:'monthly'}]),STRIPE_SECRET_KEY:'local-stripe',STRIPE_PRICE_ID:'price_local'});
const {default:handler}=await import('../api/bobby-access.ts');
const {setPurchaseRpcForTests,openPurchaseToken,sealPurchaseToken,acquire,reconcileGoogleAttempt,reconcileGoogleOrderHint}=await import('../api/_lib/purchase-reservations.ts');
const {googleAccountId,tokenFingerprint}=await import('../api/_lib/google-publisher.ts');
const A=randomUUID(),B=randomUUID(),IA=randomUUID(),IB=randomUUID();
let checks=0;const eq=(a:any,b:any,m:string)=>{assert.deepEqual(a,b,m);checks++;};
let attempts:any[]=[],membership:any=null,subscriber:any={},providerFailure=false,providerCalls=0,creates=0,limited=false,authFailure=false,storageFailure=false;
let currentAuth=A;const identity=(auth:string)=>auth===A?IA:IB;
const json=(v:any,status=200)=>Response.json(v,{status});
const now=Date.now();const end=new Date(now+86400000).toISOString(),start=new Date(now-1000).toISOString();
const product='bobby_pro:monthly',order='GPA.1234-5678-9012-34567..0',token='original-owner-token';
const raw=()=>({kind:'androidpublisher#subscriptionPurchaseV2',externalAccountIdentifiers:{obfuscatedExternalAccountId:googleAccountId(A)},startTime:start,
 subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',lineItems:[{productId:'bobby_pro',offerDetails:{basePlanId:'monthly'},expiryTime:end,latestSuccessfulOrderId:order}]});
const open=(id:string)=>attempts.find(a=>a.identity_id===id&&!['closed','terminal_no_charge'].includes(a.phase));
setPurchaseRpcForTests(async(name,b)=>{
 if(storageFailure)throw new Error('fixture storage outage');
 if(name==='bobby_purchase_capability')return {version:1,activated:attempts.length>0};
 if(name==='bobby_purchase_reference_get')return {attempt:attempts.find(a=>a.id===b.p_attempt&&a.provider===b.p_provider)??null};
 if(name==='bobby_purchase_attempt_get')return {attempt:b.p_attempt?attempts.find(a=>a.identity_id===b.p_identity&&a.id===b.p_attempt)??null:open(String(b.p_identity))??null};
 if(name==='bobby_purchase_acquire'){
  let a=attempts.find(a=>a.identity_id===b.p_identity&&a.operation_id===b.p_operation);
  if(a)return {attempt:a};a=open(String(b.p_identity));if(a)return {code:'purchase_pending',attempt:a};
  a={id:randomUUID(),identity_id:b.p_identity,owner_key:'b'.repeat(64),operation_id:b.p_operation,provider:b.p_provider,origin:'reserved',product_id:b.p_product,
   base_plan_id:b.p_base_plan,offer_id:b.p_offer,google_account_id:b.p_google_account,phase:'reserved',revision:1,dispatch_at:null,dispatch_payload:null,provider_reference:null,
   token_fingerprint:null,token_ciphertext:null,candidate_ciphertext:null};attempts.push(a);return {attempt:a};
 }
 if(name==='bobby_purchase_dispatch'){
  const a=attempts.find(a=>a.id===b.p_attempt&&a.identity_id===b.p_identity);if(!a)return {code:'attempt_missing'};
  const allowed=a.phase==='reserved';if(allowed)Object.assign(a,{phase:'external_started',dispatch_at:new Date(now-2000).toISOString(),revision:a.revision+1});return {attempt:{...a},dispatchAllowed:allowed};
 }
 if(name==='bobby_purchase_receive_token'){
  const a=attempts.find(a=>a.id===b.p_attempt&&a.identity_id===b.p_identity);if(!a)return {code:'attempt_missing'};
  eq(a.revision,b.p_revision,'candidate write compares captured revision');Object.assign(a,{candidate_ciphertext:b.p_ciphertext,phase:'pending',revision:a.revision+1});return {attempt:{...a}};
 }
 if(name==='bobby_purchase_observe'){
  const a=attempts.find(a=>a.id===b.p_attempt&&a.owner_key===b.p_owner_key);if(!a)return {code:'attempt_missing'};
  eq(a.revision,b.p_revision,'provider observation compares durable revision');
  Object.assign(a,{phase:b.p_phase,provider_reference:b.p_reference??a.provider_reference,token_fingerprint:b.p_token_fingerprint??a.token_fingerprint,
   token_ciphertext:b.p_token_ciphertext??a.token_ciphertext,provider_state:b.p_state,revision:a.revision+1});return {attempt:{...a}};
 }
 throw new Error(`Unexpected RPC ${name}`);
});
globalThis.fetch=(async(input:any,init:any={})=>{
 const u=new URL(String(input)),method=init.method??'GET',body=typeof init.body==='string'&&init.body.startsWith('{')?JSON.parse(init.body):null;
 if(u.href==='https://oauth2.googleapis.com/token')return json({token_type:'Bearer',access_token:'local-publisher-access',expires_in:3600});
 if(u.hostname==='androidpublisher.googleapis.com'){
  providerCalls++;if(providerFailure)return json({},503);
  if(u.pathname.includes('/orders/'))return json({orderId:order,purchaseToken:token});
  return json(raw());
 }
 if(u.hostname==='api.stripe.com'){creates++;throw new Error('Unexpected actual Stripe dispatch');}
 if(u.hostname==='api.revenuecat.com')return json({subscriber});
 if(u.pathname==='/auth/v1/user')return authFailure?json({},401):json({id:currentAuth,app_metadata:{provider:'google'}});
 if(u.pathname==='/rest/v1/bobby_identities')return json([{id:identity(currentAuth),auth_user_id:currentAuth,wallet_address:null}]);
 if(u.pathname==='/rest/v1/bobby_checkout_attempts')return json([]);
 if(u.pathname==='/rest/v1/bobby_subscriptions'){
  if(method==='POST'){membership={...membership,...body};return json(null,201);}
  return json(membership?.identity_id===identity(currentAuth)?[membership]:[]);
 }
 if(u.pathname.includes('/bobby_brief_paid_periods')||u.pathname.includes('/bobby_referrals')||u.pathname.includes('/bobby_pro_grants'))return method==='GET'?json([]):new Response(null,{status:204});
 if(u.pathname.includes('/bobby_referral_codes'))return json([{code:'LOCAL123'}]);
 if(u.pathname.includes('/api_cache'))return method==='GET'?json(limited?[{payload:{count:999},expires_at:new Date(now+60000).toISOString()}]:[]):new Response(null,{status:204});
 if(u.pathname.includes('/rpc/bobby_read_access'))return json({tier:membership?.status==='active'&&membership.identity_id===identity(currentAuth)?'pro':'free',used:0,limit:10});
 if(u.pathname.includes('/rpc/bobby_level_state'))return json({tier:'free',levels:{}});
 throw new Error(`Unexpected HTTP ${method} ${u}`);
}) as typeof fetch;
let seq=0;
async function call(action:any,headers:Record<string,unknown>={},method='POST'){
 let status=200,result:any;const res:any={setHeader(){},status(v:number){status=v;return this;},json(v:any){result=v;return this;}};
 await handler({method,body:action,headers:{authorization:'Bearer local-session','x-bobby-platform':'android','x-bobby-purchase-client':'1','x-bobby-external-processing':'accepted',
 origin:'https://bobbyprotocol.xyz',host:'bobbyprotocol.xyz','x-forwarded-for':`198.51.${Math.floor(seq/250)}.${++seq%250}`,...headers}} as any,res);return {status,body:result};
}
const reserve=()=>({action:'purchase-reserve',provider:'google',operationId:randomUUID(),productId:'bobby_pro',basePlanId:'monthly',offerId:null});
for(const name of ['BOBBY_GOOGLE_PAYMENTS_ENABLED','BOBBY_PURCHASE_RESERVATIONS_ENABLED','BOBBY_PURCHASE_LEGACY_CHECKOUTS_DRAINED'])delete process.env[name];
eq((await call(null,{},'GET')).body.payments.google,false,'new sales default disabled');
eq((await call(reserve())).status,503,'no reservation while sales off');eq(attempts.length,0,'disabled sales cannot create attempt');
Object.assign(process.env,{BOBBY_GOOGLE_PAYMENTS_ENABLED:'true',BOBBY_PURCHASE_RESERVATIONS_ENABLED:'true'});
eq((await call(null,{},'GET')).body.payments.google,false,'migration/credentials cannot replace legacy drain gate');
eq((await call(reserve())).status,503,'undrained environment cannot reserve');
process.env.BOBBY_PURCHASE_LEGACY_CHECKOUTS_DRAINED='true';eq((await call(null,{},'GET')).body.payments.google,true,'full configured v1 source ready');
for(const headers of [{'x-bobby-platform':'ios'},{'x-bobby-purchase-client':'2'},{'x-bobby-external-processing':'no'},{origin:'https://other.example'}])eq((await call(reserve(),headers)).status,400,'strict native/consent/origin guard');
for(const change of [{offerId:undefined},{offerId:12},{extra:true},{operationId:'not-uuid'},{productId:'other'},{provider:'stripe'}])eq((await call({...reserve(),...change})).status,400,'strict action schema/product catalogue');
authFailure=true;eq((await call(reserve())).status,401,'verified account required');authFailure=false;
limited=true;eq((await call(reserve())).status,429,'account provider operation budget fails closed');limited=false;
const request=reserve();const reserved=await call(request);eq(reserved.status,200,'reserve acknowledged');eq(reserved.body.launchAllowed,false,'reserve alone cannot launch SDK');
const id=reserved.body.attempt.id;eq((await call(request)).body.attempt.id,id,'retry original operation returns same attempt');
eq((await call(reserve())).status,409,'another operation cannot create second obligation');
const publicText=JSON.stringify(reserved.body);for(const value of [googleAccountId(A),'owner_key','ciphertext','dispatch_payload'])eq(publicText.includes(value),false,'public reply excludes owner/provider material');
const startRequest={action:'purchase-start',attemptId:id,operationId:randomUUID()};eq((await call(startRequest)).body.launchAllowed,true,'one actual start permit');eq((await call(startRequest)).body.launchAllowed,false,'lost start response never relaunches');
currentAuth=B;eq((await call({action:'purchase-submit',attemptId:id,purchaseToken:token})).body.purchaseAttempt,null,'other owner cannot read/submit original attempt');currentAuth=A;
const before=providerCalls;providerFailure=true;eq((await call({action:'purchase-submit',attemptId:id,purchaseToken:token})).status,503,'provider outage does not pretend success');
eq(openPurchaseToken(attempts[0].candidate_ciphertext),token,'SDK receipt survives provider timeout before verification');eq(attempts[0].token_fingerprint,null,'unverified candidate claims no ownership');eq(attempts[0].phase,'pending','outage keeps financial gate');providerFailure=false;
subscriber={entitlements:{pro:{product_identifier:product,expires_date:end}},subscriptions:{[product]:{store:'play_store',is_sandbox:false,ownership_type:'PURCHASED',period_type:'normal',purchase_date:start,expires_date:end,store_transaction_id:order}}};
process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED='false';
const completed=await call({action:'purchase-submit',attemptId:id,purchaseToken:token});eq(completed.status,200,'original receipt confirmation works with sales off');eq(completed.body.purchaseAttempt.confirmed,true,'matching original Google proof plus fresh membership confirms');
eq(completed.body.purchaseAttempt.id,id,'confirmation binds original attempt');eq(membership.provider,'google','backend actual owner proof grants Google membership');eq(attempts[0].token_fingerprint,tokenFingerprint(token),'ownership fingerprint becomes immutable only after actual verification');
eq(providerCalls>before,true,'actual provider verification executed');
const still=await acquire(IA,randomUUID(),'stripe','price_other',null);eq(still.code,'purchase_pending','confirmed financial obligation still blocks another provider');
eq((await call({action:'purchase-attempt-status',attemptId:id})).body.purchaseAttempt.confirmed,true,'status exposes public correlation only');
eq((await call({action:'purchase-attempt-cancel',attemptId:id})).body.purchaseAttempt.phase,'confirmed','client cancellation cannot release chargeable subscription');
storageFailure=true;eq((await call(null,{},'GET')).body.payments.google,false,'missing coherent storage fails capability closed');storageFailure=false;
delete process.env.REVENUECAT_SECRET_KEY;membership=null;eq((await call({action:'checkout'})).status,503,'activated gate cannot skip legacy inventory when RC config unavailable');process.env.REVENUECAT_SECRET_KEY='local-rc';
membership=null;const tombstone=attempts[0];Object.assign(tombstone,{identity_id:null,phase:'pending',token_fingerprint:null,token_ciphertext:null,candidate_ciphertext:sealPurchaseToken(token)});
const reconciled=await reconcileGoogleAttempt({...tombstone});eq(reconciled.phase,'confirmed','persisted candidate reconciles after identity deletion');eq(reconciled.identity_id,null,'provider proof never recreates deleted identity');eq(membership,null,'tombstone financial confirmation grants no membership');
const recovered=await reconcileGoogleOrderHint(tombstone.id,order);eq(recovered?.id,tombstone.id,'trusted support actual order recovers original attempt');eq(membership,null,'support reconciliation itself grants no entitlement');
eq(creates,0,'all guarded scenarios create zero Stripe charges');
console.log(`Purchase access handler: ${checks} assertions passed (synthetic HTTP/RPC, no provider charges).`);
