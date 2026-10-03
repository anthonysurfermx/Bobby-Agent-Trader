// Trusted-server Google Play ownership/obligation verification. Never logs tokens, keys or provider bodies.
import { createHash, createPrivateKey, sign } from 'node:crypto';
export const GOOGLE_PACKAGE='xyz.bobbyprotocol.bobby';
export const PLAY_TOKEN=/^[A-Za-z0-9._~+\/-]{1,4096}={0,2}$/;
export const PLAY_ORDER=/^GPA\.\d{4}-\d{4}-\d{4}-\d{5}(?:\.\.\d{1,12})?$/;
export interface GoogleProduct { productId:string; basePlanId:string; offerId:string|null }
export interface PublisherConfig { clientEmail:string; privateKey:string }
export class GoogleProofUnavailable extends Error { constructor(public code='google_proof_unavailable'){super(code);} }
export function publisherConfig(env:NodeJS.ProcessEnv=process.env):PublisherConfig|null {
 const clientEmail=env.BOBBY_GOOGLE_PUBLISHER_CLIENT_EMAIL??'',privateKey=(env.BOBBY_GOOGLE_PUBLISHER_PRIVATE_KEY??'').replace(/\\n/g,'\n');
 if(!/^[A-Za-z0-9._-]+@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(clientEmail))return null;
 try{const key=createPrivateKey(privateKey);if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<2048)return null;}catch{return null;}
 return {clientEmail,privateKey};
}
export function googleProducts(env:NodeJS.ProcessEnv=process.env):GoogleProduct[] {
 try{const v=JSON.parse(env.BOBBY_GOOGLE_PRODUCT_CATALOG??'[]');if(!Array.isArray(v)||v.length<1||v.length>20)return [];
 const id=/^[A-Za-z0-9._-]{1,120}$/;
 if(v.some(p=>!p||typeof p!=='object'||Object.keys(p).some(k=>!['productId','basePlanId','offerId'].includes(k))||typeof p.productId!=='string'||!id.test(p.productId)||typeof p.basePlanId!=='string'||!id.test(p.basePlanId)||(p.offerId!==undefined&&p.offerId!==null&&(typeof p.offerId!=='string'||!id.test(p.offerId)))))return [];
 const products=v.map(p=>({productId:p.productId,basePlanId:p.basePlanId,offerId:p.offerId??null}));
 return new Set(products.map(p=>JSON.stringify(p))).size===products.length?products:[];
 }catch{return [];}
}
// Exact pinned RevenueCat common/utils.kt: SHA-256 UTF-8 followed by Android Base64.NO_WRAP, including '='.
export const googleAccountId=(authUserId:string)=>createHash('sha256').update(authUserId,'utf8').digest('base64');
export const tokenFingerprint=(token:string)=>createHash('sha256').update(`${GOOGLE_PACKAGE}|${token}`,'utf8').digest('hex');
const b64=(s:string|Buffer)=>Buffer.from(s).toString('base64url');
let cached:{key:string;token:string;until:number}|null=null;
export function resetPublisherCache(){cached=null;}
async function oauth(cfg:PublisherConfig,http:typeof fetch,now:number):Promise<string>{
 const key=createHash('sha256').update(cfg.clientEmail+'|'+cfg.privateKey).digest('hex');if(cached?.key===key&&cached.until>now)return cached.token;
 const iat=Math.floor(now/1000);const material=b64(JSON.stringify({alg:'RS256',typ:'JWT'}))+'.'+b64(JSON.stringify({iss:cfg.clientEmail,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600}));
 const assertion=material+'.'+b64(sign('RSA-SHA256',Buffer.from(material),createPrivateKey(cfg.privateKey)));
 try{const r=await http('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}).toString(),signal:AbortSignal.timeout(5000)});
 const raw=await r.text();if(!r.ok||raw.length>8192)throw 0;const v=JSON.parse(raw);
 if(v.token_type!=='Bearer'||typeof v.access_token!=='string'||v.access_token.length>4096||!/^[A-Za-z0-9._~+\/-]+={0,2}$/.test(v.access_token)||!Number.isInteger(v.expires_in)||v.expires_in<60||v.expires_in>3600)throw 0;
 cached={key,token:v.access_token,until:now+(v.expires_in-60)*1000};return v.access_token;
 }catch{throw new GoogleProofUnavailable('google_authorization_unavailable');}
}
async function providerGet(path:string,http:typeof fetch=fetch,now=Date.now()):Promise<Record<string,any>>{
 const cfg=publisherConfig();if(!cfg)throw new GoogleProofUnavailable('google_verification_not_configured');
 const token=await oauth(cfg,http,now);
 try{const r=await http(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${GOOGLE_PACKAGE}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
 const raw=await r.text();if(!r.ok||raw.length>65536)throw 0;const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw 0;return v;
 }catch{throw new GoogleProofUnavailable();}
}
export interface GoogleProof { token:string; fingerprint:string; accountId:string; product:GoogleProduct; state:string; currentFreeTrial:boolean;
 startTime:string|null; expiryTime:string|null; orderId:string|null; phase:'pending'|'confirmed'|'closed'|'terminal_no_charge'; evidence:string }
/** Active/trial/promo obligations are not financial paid-period evidence. */
export function googleProofFromSubscription(raw:Record<string,any>,token:string,expected:GoogleProduct,accountId:string,notBefore:number|null,now=Date.now()):GoogleProof {
 if(!PLAY_TOKEN.test(token)||token.length>4096||raw.kind!=='androidpublisher#subscriptionPurchaseV2'||Object.prototype.hasOwnProperty.call(raw,'testPurchase')||raw.externalAccountIdentifiers?.obfuscatedExternalAccountId!==accountId||typeof accountId!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(accountId))throw new GoogleProofUnavailable('google_owner_unverified');
 if(!Array.isArray(raw.lineItems)||raw.lineItems.length!==1||raw.linkedPurchaseToken||raw.outOfAppPurchaseContext)throw new GoogleProofUnavailable('google_purchase_not_participating');
 const line=raw.lineItems[0];if(line?.productId!==expected.productId||line.offerDetails?.basePlanId!==expected.basePlanId||(line.offerDetails?.offerId??null)!==expected.offerId||line.deferredItemReplacement||line.deferredItemRemoval||line.itemReplacement)throw new GoogleProofUnavailable('google_product_unverified');
 const state=raw.subscriptionState;
 const pending=state==='SUBSCRIPTION_STATE_PENDING',cancelled=state==='SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
 const start=typeof raw.startTime==='string'&&Number.isFinite(Date.parse(raw.startTime))?raw.startTime:null;
 const expiry=typeof line.expiryTime==='string'&&Number.isFinite(Date.parse(line.expiryTime))?line.expiryTime:null;
 if(!pending&&!cancelled&&(!start||Date.parse(start)>now+60000))throw new GoogleProofUnavailable('google_time_unverified');
 if(notBefore!==null&&(!Number.isFinite(notBefore)||notBefore>now||start&&Date.parse(start)<notBefore))throw new GoogleProofUnavailable('google_purchase_precedes_attempt');
 let phase:GoogleProof['phase']='pending';
 if(state==='SUBSCRIPTION_STATE_EXPIRED'){
  if(!expiry||Date.parse(expiry)>now)throw new GoogleProofUnavailable('google_expiry_unverified');phase='closed';
 }else if(cancelled){if(start||line.latestSuccessfulOrderId)throw new GoogleProofUnavailable('google_cancellation_ambiguous');phase='terminal_no_charge';}
 else if(['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(state)){
  if(!expiry||Date.parse(expiry)<=now)throw new GoogleProofUnavailable('google_expiry_unverified');
  phase=raw.acknowledgementState==='ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'?'confirmed':'pending';
 }else if(!['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_PAUSED'].includes(state))throw new GoogleProofUnavailable('google_state_unknown');
 const order=typeof line.latestSuccessfulOrderId==='string'&&PLAY_ORDER.test(line.latestSuccessfulOrderId)?line.latestSuccessfulOrderId:null;
 const currentFreeTrial=!!line.offerPhase&&Object.hasOwn(line.offerPhase,'freeTrial');
 const fp=tokenFingerprint(token);const evidence=createHash('sha256').update(JSON.stringify([fp,accountId,expected,state,start,expiry,order,raw.acknowledgementState??null,currentFreeTrial])).digest('hex');
 return {token,fingerprint:fp,accountId,product:expected,state,currentFreeTrial,startTime:start,expiryTime:expiry,orderId:order,phase,evidence};
}
export async function verifyGoogleToken(token:string,expected:GoogleProduct,accountId:string,notBefore:number|null,http:typeof fetch=fetch,now=Date.now()):Promise<GoogleProof>{
 if(typeof token!=='string'||token.length>4096||!PLAY_TOKEN.test(token))throw new GoogleProofUnavailable('invalid_google_token');
 return googleProofFromSubscription(await providerGet(`purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,http,now),token,expected,accountId,notBefore,now);
}
/** Store/RC order IDs are hints only; an actual Google order retrieves the token, then its CURRENT state/owner. */
export async function verifyGoogleOrder(orderId:string,expected:GoogleProduct,accountId:string,notBefore:number|null,http:typeof fetch=fetch,now=Date.now()):Promise<GoogleProof>{
 if(!PLAY_ORDER.test(orderId))throw new GoogleProofUnavailable('google_order_unavailable');
 const order=await providerGet(`orders/${encodeURIComponent(orderId)}`,http,now);
 if(order.orderId!==orderId||typeof order.purchaseToken!=='string')throw new GoogleProofUnavailable('google_order_unverified');
 return verifyGoogleToken(order.purchaseToken,expected,accountId,notBefore,http,now);
}
