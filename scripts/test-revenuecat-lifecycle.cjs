// Actual backend modules; only provider HTTP and database boundaries are mocked.
const {randomUUID}=require('node:crypto');const {performance}=require('node:perf_hooks');const fs=require('node:fs');
process.env.BOBBY_SUPABASE_URL='https://simulation.invalid';process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='simulation-only';process.env.BOBBY_SUPABASE_ANON_KEY='simulation-only';process.env.REVENUECAT_SECRET_KEY='simulation-only';
const {resolveIdentity}=require('/private/tmp/bobby-business-modules/user-identity.js');const {syncRevenueCat}=require('/private/tmp/bobby-business-modules/revenuecat.js');
const identities=new Map(),subscriptions=new Map(),provider=new Map();let calls=0, subscriptionReadFails=false;
global.fetch=async(url,options={})=>{calls++;const u=new URL(url);let body;
 if(u.pathname==='/auth/v1/user'){const token=options.headers.Authorization.slice(7);return Response.json(token==='invalid'?{error:'invalid'}:{id:token,app_metadata:{provider:'apple'}},{status:token==='invalid'?401:200});}
 if(u.pathname==='/rest/v1/bobby_identities'){body=JSON.parse(options.body);let row=identities.get(body.auth_user_id);if(!row){row={...body,id:randomUUID(),wallet_address:null};identities.set(body.auth_user_id,row);}return Response.json([row]);}
 if(u.pathname.startsWith('/v1/subscribers/')){const id=decodeURIComponent(u.pathname.split('/').pop());return Response.json({subscriber:provider.get(id)});}
 if(u.pathname==='/rest/v1/bobby_subscriptions'){if(subscriptionReadFails && options.method !== 'POST')return Response.json({error:'temporary database failure'},{status:503});if(options.method==='POST'){body=JSON.parse(options.body);subscriptions.set(body.identity_id,{...subscriptions.get(body.identity_id),...body});return new Response(null,{status:204});}return Response.json(subscriptions.has(u.searchParams.get('identity_id').slice(3))?[subscriptions.get(u.searchParams.get('identity_id').slice(3))]:[]);}
 throw new Error('Unmocked request '+url);
};
function entitlement(expiry,extra={}){return {entitlements:{pro:{expires_date:expiry,product_identifier:'xyz.bobbyprotocol.bobby.pro.monthly'}},subscriptions:{'xyz.bobbyprotocol.bobby.pro.monthly':{store:'app_store',expires_date:expiry,...extra}}};}
(async()=>{const out=[];for(const n of [10,100,1000]){identities.clear();subscriptions.clear();provider.clear();calls=0;const start=performance.now();let checks=0;
 await Promise.all(Array.from({length:n},async()=>{const auth=randomUUID(),req={headers:{authorization:'Bearer '+auth}};const id=await resolveIdentity(req),again=await resolveIdentity(req);if(id.id!==again.id)throw Error('duplicate identity');checks++;
 provider.set(auth,entitlement(new Date(Date.now()+30*86400000).toISOString()));if(!await syncRevenueCat(auth,id.id))throw Error('purchase');checks++;
 await syncRevenueCat(auth,id.id);if(subscriptions.get(id.id).status!=='active')throw Error('restore');checks++;
 provider.set(auth,entitlement(new Date(Date.now()+86400000).toISOString(),{unsubscribe_detected_at:new Date().toISOString()}));if(!await syncRevenueCat(auth,id.id))throw Error('cancellation prematurely denied');checks++;
 provider.set(auth,entitlement(new Date(Date.now()-1000).toISOString()));if(await syncRevenueCat(auth,id.id))throw Error('expired granted');checks++;
 provider.set(auth,entitlement(new Date(Date.now()+86400000).toISOString(),{refunded_at:new Date().toISOString()}));if(await syncRevenueCat(auth,id.id)||subscriptions.get(id.id).status!=='refunded')throw Error('refund');checks++;
 provider.set(auth,{});if(await syncRevenueCat(auth,id.id))throw Error('no entitlement');checks++;
 }));out.push({users:n,checks,mocked_http_calls:calls,elapsed_ms:Math.round(performance.now()-start),passed:true});}
 const invalid=await resolveIdentity({headers:{authorization:'Bearer invalid'}});if(invalid!==null)throw Error('invalid token');
 const auth=randomUUID(), id=randomUUID();provider.set(auth,entitlement(new Date(Date.now()+86400000).toISOString()));subscriptions.set(id,{identity_id:id,provider:'stripe',status:'active',stripe_subscription_id:'existing-card-subscription'});subscriptionReadFails=true;let failed=false;try{await syncRevenueCat(auth,id)}catch{failed=true}if(!failed||subscriptions.get(id).provider!=='stripe')throw Error('database outage overwrote an existing subscription');subscriptionReadFails=false;
 fs.writeFileSync('docs/audits/subscription-readiness-2026-09-30/revenuecat-simulation.json',JSON.stringify({scope:'actual backend functions with mocked Supabase auth and RevenueCat HTTP; no real registrations or transactions; timings not production capacity',scenarios:out,invalid_token_rejected:true,database_failure_preserves_existing_subscription:true},null,2));console.log(JSON.stringify(out,null,2));})().catch(e=>{console.error(e);process.exit(1)});
