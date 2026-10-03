// Service-only durable external-charge protocol. Public replies never expose provider tokens or create payloads.
import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { bobbyRest, bobbyServiceHeaders } from './bobby-db.js';
import { GOOGLE_PACKAGE, PLAY_TOKEN, tokenFingerprint, googleAccountId, googleProducts, publisherConfig, verifyGoogleOrder, verifyGoogleToken, type GoogleProduct, type GoogleProof } from './google-publisher.js';
export class PurchaseProtocolError extends Error { constructor(public code:string,public status=503){super(code);} }
export interface PurchaseAttempt {
 id:string;identity_id:string|null;owner_key:string;operation_id:string;provider:'google'|'stripe';origin:'reserved'|'adopted';product_id:string;base_plan_id:string|null;offer_id:string|null;google_account_id:string|null;
 phase:'reserved'|'external_started'|'pending'|'needs_reconciliation'|'confirmed'|'terminal_no_charge'|'closed';revision:number|string;dispatch_at:string|null;
 dispatch_payload:Record<string,string>|null;provider_reference:string|null;token_fingerprint:string|null;token_ciphertext:string|null;candidate_ciphertext:string|null;provider_state:string|null;
}
export type PurchaseRpc=(name:string,body:Record<string,unknown>)=>Promise<any>;
async function productionRpc(name:string,body:Record<string,unknown>):Promise<any>{
 let r:Response;try{r=await fetch(bobbyRest(`rpc/${name}`),{method:'POST',headers:bobbyServiceHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(5000)});}catch{throw new PurchaseProtocolError('purchase_storage_unavailable');}
 if(!r.ok){if(name==='bobby_purchase_capability'&&r.status===404)return null;throw new PurchaseProtocolError('purchase_storage_unavailable');}
 try{return await r.json();}catch{throw new PurchaseProtocolError('purchase_storage_unavailable');}
}
let transport:PurchaseRpc=productionRpc;
export function setPurchaseRpcForTests(rpc:PurchaseRpc|null){transport=rpc??productionRpc;}
const call=(name:string,body:Record<string,unknown>)=>transport(name,body);
export const purchaseProtocolEnabled=()=>process.env.BOBBY_PURCHASE_RESERVATIONS_ENABLED==='true';
function tokenKey():Buffer|null{const raw=process.env.BOBBY_PURCHASE_TOKEN_KEY??'';if(!/^[0-9a-fA-F]{64}$/.test(raw))return null;return Buffer.from(hkdfSync('sha256',Buffer.from(raw,'hex'),'bobby-purchase-reservations-v1','google-token-v1',32));}
export function sealPurchaseToken(token:string):string{const key=tokenKey();if(!key)throw new PurchaseProtocolError('purchase_verification_not_configured');const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);const ct=Buffer.concat([c.update(token,'utf8'),c.final()]);return 'v1:'+Buffer.concat([iv,c.getAuthTag(),ct]).toString('base64url');}
export function openPurchaseToken(cipher:string):string{const key=tokenKey();if(!key)throw new PurchaseProtocolError('purchase_verification_not_configured');try{if(!cipher.startsWith('v1:'))throw 0;const r=Buffer.from(cipher.slice(3),'base64url');if(r.toString('base64url')!==cipher.slice(3)||r.length<29)throw 0;const d=createDecipheriv('aes-256-gcm',key,r.subarray(0,12));d.setAuthTag(r.subarray(12,28));return Buffer.concat([d.update(r.subarray(28)),d.final()]).toString('utf8');}catch{throw new PurchaseProtocolError('purchase_token_unreadable');}}
const closed=(a:PurchaseAttempt)=>['terminal_no_charge','closed'].includes(a.phase);
export function publicAttempt(a:PurchaseAttempt|null){return a?{id:a.id,provider:a.provider,phase:a.phase,productId:a.product_id,basePlanId:a.base_plan_id,offerId:a.offer_id,
 pending:!closed(a),requiresSupport:a.phase==='needs_reconciliation'||a.provider==='google'&&!a.token_fingerprint&&a.phase!=='reserved',supportUrl:'https://bobbyprotocol.xyz/support'}:null;}
export async function purchaseCapability():Promise<{version:number;activated:boolean}>{
 const v=await call('bobby_purchase_capability',{});if(v===null)return {version:0,activated:false};
 if(v?.version!==1||typeof v.activated!=='boolean')throw new PurchaseProtocolError('purchase_storage_unavailable');return v;
}
/** New sales require operator activation/drain, actual local credential shape and migration. Device lifecycle remains an external gate. */
export async function googleReservationReady():Promise<boolean>{
 if(!purchaseProtocolEnabled()||process.env.BOBBY_PURCHASE_LEGACY_CHECKOUTS_DRAINED!=='true'||!tokenKey()||!publisherConfig()||!googleProducts().length)return false;
 try{return (await purchaseCapability()).version===1;}catch{return false;}
}
export async function stripeUsesReservations():Promise<boolean>{
 const capability=await purchaseCapability();
 if(capability.activated)return true; // sticky: disabling sales cannot bypass an existing obligation gate
 // Preserve existing Stripe initiation until the first coherent Google activation is ready.
 return process.env.BOBBY_GOOGLE_PAYMENTS_ENABLED==='true'&&!!process.env.REVENUECAT_SECRET_KEY?.trim()&&await googleReservationReady();
}
export async function getAttempt(identityId:string,id:string|null=null):Promise<PurchaseAttempt|null>{const r=await call('bobby_purchase_attempt_get',{p_identity:identityId,p_attempt:id});if(r?.code)throw new PurchaseProtocolError(r.code,409);return r?.attempt??null;}
export async function acquire(identityId:string,operationId:string,provider:'google'|'stripe',product:GoogleProduct|string,accountId:string|null):Promise<{attempt?:PurchaseAttempt;code?:string;state?:string}>{
 return call('bobby_purchase_acquire',{p_identity:identityId,p_operation:operationId,p_provider:provider,p_product:typeof product==='string'?product:product.productId,
 p_base_plan:typeof product==='string'?null:product.basePlanId,p_offer:typeof product==='string'?null:product.offerId,p_google_account:accountId});
}
export async function dispatch(identityId:string,id:string,operationId:string,payload:Record<string,string>|null=null):Promise<{attempt?:PurchaseAttempt;code?:string;dispatchAllowed?:boolean}>{
 return call('bobby_purchase_dispatch',{p_identity:identityId,p_attempt:id,p_operation:operationId,p_payload:payload});
}
async function observe(a:PurchaseAttempt,state:string,phase:PurchaseAttempt['phase'],evidence:string,reference:string|null=null,proof:GoogleProof|null=null,resolution:string|null=null):Promise<PurchaseAttempt>{
 const r=await call('bobby_purchase_observe',{p_identity:a.identity_id,p_owner_key:a.owner_key,p_attempt:a.id,p_revision:Number(a.revision),p_provider:a.provider,
 p_reference:reference,p_token_fingerprint:proof?.fingerprint??null,p_token_ciphertext:proof?sealPurchaseToken(proof.token):null,p_state:state,p_phase:phase,p_evidence:evidence,p_resolution:resolution});
 if(!r?.attempt)throw new PurchaseProtocolError(r?.code??'purchase_storage_unavailable',409);return r.attempt;
}
export function attemptProduct(a:PurchaseAttempt):GoogleProduct{if(a.provider!=='google'||!a.base_plan_id)throw new PurchaseProtocolError('purchase_provider_mismatch',409);return {productId:a.product_id,basePlanId:a.base_plan_id,offerId:a.offer_id};}
export async function submitGoogleProof(a:PurchaseAttempt,proof:GoogleProof):Promise<PurchaseAttempt>{
 const expected=attemptProduct(a);
 if(proof.accountId!==a.google_account_id||JSON.stringify(proof.product)!==JSON.stringify(expected)||a.origin!=='adopted'&&(!a.dispatch_at||!Number.isFinite(Date.parse(a.dispatch_at))||proof.startTime&&Date.parse(proof.startTime)<Date.parse(a.dispatch_at)))throw new PurchaseProtocolError('purchase_evidence_mismatch',409);
 if(a.phase==='reserved')throw new PurchaseProtocolError('purchase_not_started',409);
 const reference='google:'+proof.fingerprint;
 return observe(a,proof.state,proof.phase,proof.evidence,reference,proof,['terminal_no_charge','closed'].includes(proof.phase)?'google-authoritative:'+proof.state:null);
}
export async function verifyAttemptToken(a:PurchaseAttempt,token:string):Promise<PurchaseAttempt>{
 if(typeof token!=='string'||!PLAY_TOKEN.test(token)||token.length>4096)throw new PurchaseProtocolError('invalid_google_token',400);
 if(a.token_fingerprint&&a.token_fingerprint!==tokenFingerprint(token))throw new PurchaseProtocolError('purchase_token_conflict',409);
 if(!a.token_fingerprint&&(!a.candidate_ciphertext||openPurchaseToken(a.candidate_ciphertext)!==token)){
  const received=await call('bobby_purchase_receive_token',{p_identity:a.identity_id,p_attempt:a.id,p_revision:Number(a.revision),p_ciphertext:sealPurchaseToken(token)});
  if(!received?.attempt)throw new PurchaseProtocolError(received?.code??'purchase_storage_unavailable',409);a=received.attempt;
 }
 return submitGoogleProof(a,await verifyGoogleToken(token,attemptProduct(a),a.google_account_id!,a.origin==='adopted'?null:a.dispatch_at?Date.parse(a.dispatch_at):NaN));
}
/** Called before ANY Google entitlement grant, including restore/sync/alias/TRANSFER. */
export async function recordGoogleObligation(identityId:string,proof:GoogleProof):Promise<PurchaseAttempt>{
 const a=await getAttempt(identityId);
 if(a){
  if(a.provider!=='google')throw new PurchaseProtocolError('purchase_provider_conflict',409);
  if(a.token_fingerprint&&a.token_fingerprint!==proof.fingerprint)throw new PurchaseProtocolError('purchase_token_conflict',409);
  if(proof.accountId!==a.google_account_id||JSON.stringify(proof.product)!==JSON.stringify(attemptProduct(a)))throw new PurchaseProtocolError('purchase_evidence_mismatch',409);
  if(a.token_fingerprint)return observe(a,proof.state,proof.phase,proof.evidence,'google:'+proof.fingerprint,proof,['terminal_no_charge','closed'].includes(proof.phase)?'google-authoritative:'+proof.state:null);
  return submitGoogleProof(a,proof);
 }
 if(!['pending','confirmed'].includes(proof.phase))throw new PurchaseProtocolError('google_obligation_not_active',409);
 const r=await call('bobby_purchase_adopt_google',{p_identity:identityId,p_product:proof.product.productId,p_base_plan:proof.product.basePlanId,p_offer:proof.product.offerId,
 p_google_account:proof.accountId,p_reference:'google:'+proof.fingerprint,p_fingerprint:proof.fingerprint,p_ciphertext:sealPurchaseToken(proof.token),p_state:proof.state,p_phase:proof.phase,p_evidence:proof.evidence});
 if(!r?.attempt)throw new PurchaseProtocolError(r?.code??'purchase_storage_unavailable',409);if(closed(r.attempt))throw new PurchaseProtocolError('purchase_closed_token',409);return r.attempt;
}
export async function reconcileGoogleAttempt(a:PurchaseAttempt):Promise<PurchaseAttempt>{
 if(closed(a))return a;
 if(!a.token_ciphertext&&!a.candidate_ciphertext){return observe(a,'google_token_missing','needs_reconciliation',createHash('sha256').update(`${a.id}|token_missing`).digest('hex'));}
 // Missing/404/invalid provider evidence throws; it never releases the durable owner gate.
 return verifyAttemptToken(a,openPurchaseToken(a.token_ciphertext??a.candidate_ciphertext!));
}
/** Trusted support recovery from a customer-supplied order hint. No force-release or entitlement grant.
 * The service-only row, ACTUAL order->token and CURRENT Google owner/product/start state all corroborate.
 */
export async function reconcileGoogleOrderHint(attemptId:string,orderHint:string):Promise<ReturnType<typeof publicAttempt>>{
 const r=await call('bobby_purchase_reference_get',{p_attempt:attemptId,p_provider:'google'});
 if(!r?.attempt)throw new PurchaseProtocolError('attempt_missing',404);
 const a:PurchaseAttempt=r.attempt;
 if(closed(a))return publicAttempt(a);
 const proof=await verifyGoogleOrder(orderHint,attemptProduct(a),a.google_account_id!,a.origin==='adopted'?null:a.dispatch_at?Date.parse(a.dispatch_at):NaN);
 return publicAttempt(await submitGoogleProof(a,proof));
}
const stripeId=(v:unknown):v is string=>typeof v==='string'&&/^[a-zA-Z0-9_]{3,160}$/.test(v);
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function stripeRequest(path:string,method='GET',form?:Record<string,string>,key?:string):Promise<Record<string,any>>{
 try{const r=await fetch(`https://api.stripe.com/v1/${path}`,{method,headers:{Authorization:`Bearer ${process.env.STRIPE_SECRET_KEY}`,...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(key?{'Idempotency-Key':key}:{})},body:form?new URLSearchParams(form).toString():undefined,signal:AbortSignal.timeout(10000)});
 const raw=await r.text();if(!r.ok||raw.length>65536)throw 0;const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v;
 }catch{throw new PurchaseProtocolError('stripe_verification_unavailable',502);}
}
function validSession(a:PurchaseAttempt,s:Record<string,any>):boolean{
 const f=a.dispatch_payload;
 return !!f&&stripeId(s.id)&&s.object==='checkout.session'&&s.mode==='subscription'&&s.livemode===true&&s.client_reference_id===f.client_reference_id&&s.metadata?.identity_id===f['metadata[identity_id]']&&s.metadata?.purchase_attempt_id===a.id&&(!f.customer||s.customer===f.customer)&&!s.recovered_from;
}
function sessionUrl(s:Record<string,any>):string|null{if(typeof s.url!=='string'||s.url.length>4096)return null;try{const u=new URL(s.url);return u.protocol==='https:'&&u.hostname==='checkout.stripe.com'?s.url:null;}catch{return null;}}
/** Reconcile only a KNOWN canonical Checkout. An in-flight create with no stored session stays blocked.
 * Its immutable owner/customer/session tuple is private server state, not a customer-supplied hint.
 */
export async function reconcileLegacyCheckout(identityId:string):Promise<void>{
 let rows:unknown;
 try{const r=await fetch(bobbyRest(`bobby_checkout_attempts?identity_id=eq.${identityId}&select=identity_id,attempt_id,customer_id,price_id,checkout_session_id&limit=2`),{headers:bobbyServiceHeaders(),signal:AbortSignal.timeout(5000)});if(!r.ok)throw 0;rows=await r.json();}catch{throw new PurchaseProtocolError('purchase_inventory_unavailable');}
 if(!Array.isArray(rows)||rows.length>1)throw new PurchaseProtocolError('purchase_inventory_unavailable');
 if(!rows.length)return;
 const legacy=rows[0];
 if(!legacy||legacy.identity_id!==identityId||typeof legacy.attempt_id!=='string'||!/^[0-9a-f-]{36}$/i.test(legacy.attempt_id)||typeof legacy.customer_id!=='string'||!/^cus_[A-Za-z0-9]+$/.test(legacy.customer_id)||typeof legacy.price_id!=='string'||!/^price_[A-Za-z0-9]+$/.test(legacy.price_id)||typeof legacy.checkout_session_id!=='string'||!/^cs_[A-Za-z0-9_]+$/.test(legacy.checkout_session_id)||!process.env.STRIPE_SECRET_KEY?.trim())throw new PurchaseProtocolError('purchase_legacy_reconciliation_required',409);
 const s=await stripeRequest(`checkout/sessions/${legacy.checkout_session_id}`);
 if(s.id!==legacy.checkout_session_id||s.object!=='checkout.session'||s.mode!=='subscription'||s.livemode!==true||s.customer!==legacy.customer_id||s.client_reference_id!==identityId||s.metadata?.identity_id!==identityId||s.recovered_from)throw new PurchaseProtocolError('purchase_inventory_unavailable');
 let terminal=s.status==='expired'&&s.payment_status==='unpaid'&&s.subscription===null&&s.payment_intent===null&&(s.after_expiration===null||s.after_expiration?.recovery?.enabled===false);
 if(s.status==='complete'&&stripeId(s.subscription)){
  const sub=await stripeRequest(`subscriptions/${s.subscription}`);
  if(sub.id!==s.subscription||sub.customer!==legacy.customer_id||sub.livemode!==true||sub.metadata?.identity_id!==identityId||sub.items?.data?.length!==1||sub.items?.has_more!==false||sub.items?.data?.[0]?.price?.id!==legacy.price_id)throw new PurchaseProtocolError('purchase_inventory_unavailable');
  terminal=['canceled','incomplete_expired'].includes(sub.status)&&await stripeTerminalNoFutureCharge(sub);
 }
 if(!terminal)throw new PurchaseProtocolError('purchase_legacy_reconciliation_required',409);
 const evidence=hash([legacy,s.id,s.status,s.payment_status,s.subscription,'actual-terminal-no-future-charge']);
 if(await call('bobby_purchase_close_legacy_checkout',{p_identity:identityId,p_legacy_attempt:legacy.attempt_id,p_session:s.id,p_evidence:evidence})!==true)throw new PurchaseProtocolError('purchase_inventory_unavailable');
}
export async function observeStripeSession(a:PurchaseAttempt,s:Record<string,any>):Promise<PurchaseAttempt>{
 if(!validSession(a,s))throw new PurchaseProtocolError('stripe_session_unverified',409);
 const recovery=s.after_expiration?.recovery?.enabled;
 if(s.status==='expired'&&s.payment_status==='unpaid'&&s.subscription===null&&s.payment_intent===null&&(s.after_expiration===null||recovery===false))return observe(a,'checkout_expired_no_recovery','terminal_no_charge',hash([s.id,s.status,s.payment_status,s.subscription,s.after_expiration]),s.id,null,'stripe-authoritative:expired-no-recovery');
 if(s.status==='open')return observe(a,'checkout_open','external_started',hash([s.id,s.status,s.payment_status]),s.id);
 if(s.status==='complete'){
  // A completed but unpaid/asynchronous session is still potentially chargeable. Never release it.
  if(!stripeId(s.subscription))return observe(a,'checkout_complete_unresolved','pending',hash([s.id,s.status,s.payment_status]),s.id);
  const sub=await stripeRequest(`subscriptions/${s.subscription}`);
  const price=sub.items?.data?.[0]?.price?.id;
  if(sub.id!==s.subscription||!stripeId(s.customer)||sub.customer!==s.customer||sub.items?.data?.length!==1||sub.items?.has_more!==false||sub.livemode!==true||sub.metadata?.purchase_attempt_id!==a.id||sub.metadata?.identity_id!==a.dispatch_payload!['metadata[identity_id]']||price!==a.dispatch_payload!['line_items[0][price]'])throw new PurchaseProtocolError('stripe_subscription_unverified',409);
  if(['canceled','incomplete_expired'].includes(sub.status)&&await stripeTerminalNoFutureCharge(sub))return observe(a,'stripe_subscription_terminal','closed',hash([s.id,sub.id,sub.status,'all-invoices-terminal']),s.id,null,'stripe-authoritative:subscription-terminal');
  return observe(a,'checkout_complete_'+String(sub.status).slice(0,32),['active','trialing'].includes(sub.status)&&['paid','no_payment_required'].includes(s.payment_status)?'confirmed':'pending',hash([s.id,s.status,s.payment_status,sub.id,sub.status,price]),s.id);
 }
 return observe(a,'checkout_state_unknown','needs_reconciliation',hash([s.id,s.status]),s.id);
}
/** Cancellation alone is not terminal. Any incomplete scan or recoverable invoice/intent stays blocked. */
async function stripeTerminalNoFutureCharge(sub:Record<string,any>):Promise<boolean>{
 if(!stripeId(sub.customer)||!Object.hasOwn(sub,'schedule')||sub.schedule!==null||!Object.hasOwn(sub,'latest_invoice')||sub.items?.data?.[0]?.price?.recurring?.usage_type!=='licensed')return false;
 const pendingItems=await stripeRequest(`invoiceitems?customer=${encodeURIComponent(sub.customer)}&pending=true&limit=10`);
 if(pendingItems.object!=='list'||pendingItems.has_more!==false||!Array.isArray(pendingItems.data)||pendingItems.data.length!==0)return false;
 const list=await stripeRequest(`invoices?subscription=${encodeURIComponent(sub.id)}&limit=10`);
 if(list.object!=='list'||list.has_more!==false||!Array.isArray(list.data)||list.data.length>10)return false;
 const latest=sub.latest_invoice===null?null:typeof sub.latest_invoice==='string'?sub.latest_invoice:sub.latest_invoice?.id;
 if(latest!==null&&(!stripeId(latest)||!list.data.some((invoice:Record<string,any>)=>invoice.id===latest)))return false;
 for(const invoice of list.data){
  const owner=invoice.subscription??invoice.parent?.subscription_details?.subscription;
  if(!stripeId(invoice.id)||invoice.customer!==sub.customer||owner!==sub.id||invoice.livemode!==true||!['paid','void'].includes(invoice.status)||invoice.next_payment_attempt!==null)return false;
  const payments=await stripeRequest(`invoice_payments?invoice=${encodeURIComponent(invoice.id)}&limit=10`);
  if(payments.object!=='list'||payments.has_more!==false||!Array.isArray(payments.data)||payments.data.length>10)return false;
  for(const payment of payments.data){
   const pid=payment.payment?.payment_intent;
   if(payment.invoice!==invoice.id||payment.livemode!==true||payment.payment?.type!=='payment_intent'||!stripeId(pid))return false;
   const intent=await stripeRequest(`payment_intents/${pid}`);
   if(intent.id!==pid||intent.customer!==sub.customer||intent.livemode!==true||!['succeeded','canceled'].includes(intent.status))return false;
  }
  // Legacy API-version intent and modern payment records are both inspected when present.
  if(invoice.payment_intent){const pid=typeof invoice.payment_intent==='string'?invoice.payment_intent:invoice.payment_intent.id;if(!stripeId(pid))return false;
   const intent=await stripeRequest(`payment_intents/${pid}`);if(intent.id!==pid||intent.customer!==sub.customer||intent.livemode!==true||!['succeeded','canceled'].includes(intent.status))return false;}
 }
 return true;
}
export async function reconcileStripeWebhook(attemptId:string,sessionHint:string|null=null,subscriptionHint:string|null=null):Promise<void>{
 const r=await call('bobby_purchase_reference_get',{p_attempt:attemptId,p_provider:'stripe'});
 if(!r?.attempt)return;
 const a:PurchaseAttempt=r.attempt;if(closed(a))return;
 if(a.provider_reference){await reconcileStripeAttempt(a);return;}
 // Signed events are only bounded lookup hints. Retrieve and bind the ACTUAL correlated session.
 if(sessionHint&&stripeId(sessionHint)){
  await observeStripeSession(a,await stripeRequest(`checkout/sessions/${sessionHint}`));return;
 }
 if(subscriptionHint&&stripeId(subscriptionHint)){
  const list=await stripeRequest(`checkout/sessions?subscription=${encodeURIComponent(subscriptionHint)}&limit=10`);
  if(list.object!=='list'||list.has_more!==false||!Array.isArray(list.data)||list.data.length>10)throw new PurchaseProtocolError('stripe_session_unverified',409);
  const matches=list.data.filter((s:Record<string,any>)=>validSession(a,s)&&s.subscription===subscriptionHint);
  if(matches.length!==1)throw new PurchaseProtocolError('purchase_pending',409); // empty is NEVER no-charge proof
  await observeStripeSession(a,await stripeRequest(`checkout/sessions/${matches[0].id}`));
 }
}
export async function reconcileStripeAttempt(a:PurchaseAttempt,expire=false):Promise<{attempt:PurchaseAttempt;url:string|null}>{
 if(closed(a))return {attempt:a,url:null};
 if(!a.provider_reference)return {attempt:a,url:null};
 let s=await stripeRequest(`checkout/sessions/${a.provider_reference}`);
 if(!validSession(a,s))throw new PurchaseProtocolError('stripe_session_unverified',409);
 if(expire&&s.status==='open'){
  await stripeRequest(`checkout/sessions/${a.provider_reference}/expire`,'POST',{},`bobby-expire-${a.id}`);
  s=await stripeRequest(`checkout/sessions/${a.provider_reference}`); // redirect/client intent is not terminal evidence
 }
 return {attempt:await observeStripeSession(a,s),url:s.status==='open'?sessionUrl(s):null};
}
/** Preserve canonical completion/deletion fencing for every new or retried public URL.
 * Expire intent is followed by actual provider reconciliation; it never manufactures no-charge proof.
 */
async function checkoutReturnAllowed(identityId:string,a:PurchaseAttempt):Promise<void>{
 try {
  const allowed=await call('bobby_purchase_return_allowed',{p_identity:identityId,p_attempt:a.id,p_revision:Number(a.revision)});
  if(allowed===true&&a.identity_id===identityId)return;
  throw new PurchaseProtocolError(allowed===false?'account_deleting':'purchase_storage_unavailable',allowed===false?409:503);
 } catch(error) {
  try { await reconcileStripeAttempt(a,true); } catch { /* Unknown/complete/invoice charges remain durably pending. */ }
  throw error;
 }
}
/** Existing {action:checkout} wire format, durable immutable payload and provider idempotency correlation. */
export async function reservedStripeCheckout(identityId:string,form:Record<string,string>):Promise<{url?:string;attempt:ReturnType<typeof publicAttempt>}> {
 let a=await getAttempt(identityId);
 if(a&&a.provider!=='stripe')throw new PurchaseProtocolError('purchase_pending',409);
 if(a?.provider_reference){const r=await reconcileStripeAttempt(a);if(!closed(r.attempt)){if(r.url){await checkoutReturnAllowed(identityId,r.attempt);return {url:r.url,attempt:publicAttempt(r.attempt)};}throw new PurchaseProtocolError('purchase_pending',409);}a=null;}
 if(!a){const r=await acquire(identityId,randomUUID(),'stripe',form['line_items[0][price]'],null);if(!r.attempt)throw new PurchaseProtocolError(r.code??'purchase_storage_unavailable',409);a=r.attempt;if(r.code)throw new PurchaseProtocolError(r.code,409);}
 const payload={...form,'metadata[purchase_attempt_id]':a.id,'subscription_data[metadata][purchase_attempt_id]':a.id,'after_expiration[recovery][enabled]':'false'};
 const d=await dispatch(identityId,a.id,randomUUID(),payload);
 if(!d.attempt)throw new PurchaseProtocolError(d.code??'purchase_storage_unavailable',409);a=d.attempt;
 if(!d.dispatchAllowed){throw new PurchaseProtocolError('purchase_pending',409);}
 try{
  const created=await stripeRequest('checkout/sessions','POST',a.dispatch_payload!,`bobby-checkout-v1-${a.id}`);
  if(!validSession(a,created))throw new PurchaseProtocolError('stripe_session_unverified',409);
  // Cached idempotency responses can describe an old open session. Capture its bounded reference,
  // then retrieve CURRENT state before deciding whether any URL can still be emitted.
  a=await observe(a,'checkout_created','external_started',hash([created.id,'created']),created.id);
  const current=await stripeRequest(`checkout/sessions/${created.id}`);
  const recorded=await observeStripeSession(a,current);const url=sessionUrl(current);
  if(current.status!=='open'||!url)throw new PurchaseProtocolError('purchase_pending',409);
  await checkoutReturnAllowed(identityId,recorded);
  return {url,attempt:publicAttempt(recorded)};
 }catch(e){
  // A request may have reached Stripe or its result may have been lost while persisting. Keep the SAME
  // attempt/key/payload. An expired idempotency window NEVER invokes another create request.
  try{await observe(a,'stripe_create_ambiguous','needs_reconciliation',hash([a.id,'create_ambiguous']));}catch{ /* original committed receipt may already be newer */ }
  throw e;
 }
}
/** Strict new Google API actions; orchestration grants access only after an independent Google-owned RC sync. */
export async function reserveGoogle(identityId:string,authUserId:string,operationId:string,product:GoogleProduct){
 if(!await googleReservationReady())throw new PurchaseProtocolError('purchase_reservations_not_ready');
 if(!googleProducts().some(p=>JSON.stringify(p)===JSON.stringify(product)))throw new PurchaseProtocolError('product_unavailable',400);
 const r=await acquire(identityId,operationId,'google',product,googleAccountId(authUserId));
 if(!r.attempt)throw new PurchaseProtocolError(r.code??'purchase_storage_unavailable',409);
 if(r.code)throw new PurchaseProtocolError(r.code,409);
 return {attempt:publicAttempt(r.attempt),launchAllowed:false};
}
