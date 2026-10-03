// Actual canonical deletion helpers with bounded HTTP doubles. No providers, credentials or remote calls.
import assert from 'node:assert/strict';
Object.assign(process.env,{BOBBY_SUPABASE_URL:'https://db.test',BOBBY_SUPABASE_SERVICE_ROLE_KEY:'fixture-service',STRIPE_SECRET_KEY:'fixture-stripe'});
const {blockCheckoutForDeletion}=await import('../api/_lib/checkout-attempt.ts');
const {stopBillingFor}=await import('../api/_lib/stripe-api.ts');
const owner='11111111-1111-4111-8111-111111111111';
let checks=0,calls:string[]=[],outage=false,snapshot:any={customer:'cus_Legacy',sessionId:'cs_Legacy',customers:['cus_Legacy','cus_Durable','cus_Durable'],sessionIds:['cs_Legacy','cs_Durable'],pendingStripe:true};
const eq=(a:any,b:any,m:string)=>{assert.deepEqual(a,b,m);checks++;};
const rejects=async(work:()=>Promise<unknown>,m:string)=>{await assert.rejects(work);checks++;};
globalThis.fetch=(async(input:any,init:RequestInit={})=>{
 const u=new URL(String(input)),method=init.method??'GET';calls.push(`${method} ${u.pathname}${u.search}`);
 if(u.hostname==='db.test'&&u.pathname==='/rest/v1/rpc/bobby_checkout_block_for_deletion')return Response.json(snapshot);
 if(u.hostname!=='api.stripe.com')throw new Error('No real network allowed');
 if(outage)return Response.json({error:{message:'synthetic outage'}},{status:503});
 if(u.pathname==='/v1/customers/search')return Response.json({data:[],next_page:null});
 if(u.pathname==='/v1/checkout/sessions')return Response.json({data:[],has_more:false});
 if(u.pathname.endsWith('/expire'))return Response.json({status:'expired'});
 if(u.pathname==='/v1/subscriptions/search')return Response.json({data:[]});
 if(u.pathname==='/v1/subscriptions')return Response.json({data:[{id:`sub_${u.searchParams.get('customer')}`,status:'active'}],has_more:false});
 if(u.pathname.startsWith('/v1/subscriptions/')&&method==='DELETE')return Response.json({status:'canceled'});
 throw new Error(`Unexpected synthetic transport ${method} ${u}`);
}) as typeof fetch;
const received=await blockCheckoutForDeletion(owner);
eq(received.customers,['cus_Legacy','cus_Durable'],'Durable and legacy customers bounded and deduplicated');
eq(received.sessionIds,['cs_Legacy','cs_Durable'],'Both captured payable session references retained');
eq(received.pendingStripe,true,'Lost create response remains potentially chargeable');
const stopped=await stopBillingFor(owner,null,received);
eq(stopped.cancelled,2,'Actual helper cancels subscriptions for both captured customers');
eq(stopped.unverified,null,'Successful provider stop reports no unverified gap');
for(const customer of ['cus_Legacy','cus_Durable'])eq(calls.some(c=>c.includes(`checkout/sessions?customer=${customer}`)),true,'Every captured customer open checkout scanned');
for(const session of ['cs_Legacy','cs_Durable'])eq(calls.some(c=>c===`POST /v1/checkout/sessions/${session}/expire`),true,'Every exact captured session expired');
const firstCancel=calls.findIndex(c=>c.startsWith('DELETE /v1/subscriptions/'));
eq(calls.filter(c=>c.includes('/expire')).every(c=>calls.indexOf(c)<firstCancel),true,'Open Checkout stopped before subscription cancellation');
for(const corrupt of [{customers:['not-customer']},{sessionIds:['bad-session']},{customers:Array(11).fill('cus_TooMany')},{sessionIds:[12]},{pendingStripe:'true'}]){
 snapshot={...snapshot,...corrupt};await rejects(()=>blockCheckoutForDeletion(owner),'Malformed financial snapshot fails before provider cleanup');
 snapshot={customer:'cus_Legacy',sessionId:'cs_Legacy',customers:['cus_Legacy','cus_Durable'],sessionIds:['cs_Legacy','cs_Durable'],pendingStripe:true};
}
snapshot={customer:'cus_Legacy',sessionId:null};eq(await blockCheckoutForDeletion(owner),snapshot,'Original canonical scalar reply stays compatible');
outage=true;
await rejects(()=>stopBillingFor(owner,null,{customer:null,sessionId:null,customers:['cus_Durable'],sessionIds:[],pendingStripe:true}),'Pending create with no returned session blocks deletion during provider outage');
await rejects(()=>stopBillingFor(owner,null,{customer:null,sessionId:null,customers:[],sessionIds:['cs_Durable'],pendingStripe:false}),'Captured session blocks deletion during provider outage');
const ended=await stopBillingFor(owner,{status:'canceled',stripe_customer_id:'cus_Ended',stripe_subscription_id:'sub_Ended'},{customer:null,sessionId:null});
eq(ended.unverified!==null,true,'Canonical ended-card outage remains deletable with manual verification');
delete process.env.STRIPE_SECRET_KEY;
const unavailable=await stopBillingFor(owner,null,{customer:null,sessionId:null,pendingStripe:true});
eq(unavailable.unverified!==null,true,'Canonical missing-key policy reports unverified instead of permanent deletion block');
eq((await stopBillingFor(owner,null,{customer:null,sessionId:null})).unverified,null,'No known direct-card obligation with card disabled requires no provider call');
console.log(`Purchase deletion coupling: ${checks} checks passed (actual canonical helpers, HTTP doubles only)`);
