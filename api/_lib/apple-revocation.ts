import { createPublicKey, sign, verify, type JsonWebKey } from 'node:crypto';

export const APPLE_MANUAL_REVOCATION_URL = 'https://support.apple.com/en-us/102571';
const APPLE = 'https://appleid.apple.com';
export function appleRevocationConfigured(): boolean {
  return ['APPLE_SIGN_IN_TEAM_ID','APPLE_SIGN_IN_KEY_ID','APPLE_SIGN_IN_PRIVATE_KEY','APPLE_SIGN_IN_CLIENT_ID'].every(name => Boolean(process.env[name]?.trim()));
}

function clientSecret(): string {
  if (!appleRevocationConfigured()) throw new Error('Apple revocation is not configured');
  const now = Math.floor(Date.now()/1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({alg:'ES256',kid:process.env.APPLE_SIGN_IN_KEY_ID})}.${encode({iss:process.env.APPLE_SIGN_IN_TEAM_ID,iat:now,exp:now+300,aud:APPLE,sub:process.env.APPLE_SIGN_IN_CLIENT_ID})}`;
  const signature = sign('sha256',Buffer.from(input),{key:process.env.APPLE_SIGN_IN_PRIVATE_KEY!.replace(/\\n/g,'\n'),dsaEncoding:'ieee-p1363'});
  return `${input}.${signature.toString('base64url')}`;
}

export async function verifyAppleIdentity(token:string,expectedSubject:string,clientId:string):Promise<void> {
  const parts=token.split('.');
  if(parts.length!==3)throw new Error('Invalid Apple identity');
  const header=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString());
  const now=Math.floor(Date.now()/1000);
  if(header.alg!=='RS256' || typeof header.kid!=='string' || claims.iss!==APPLE || claims.aud!==clientId || claims.sub!==expectedSubject ||
     typeof claims.exp!=='number' || claims.exp<=now || typeof claims.iat!=='number' || claims.iat>now+60)throw new Error('Apple identity does not match this account');
  const response=await fetch(`${APPLE}/auth/keys`,{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw new Error('Apple verification unavailable');
  const {keys}=await response.json() as {keys:Array<JsonWebKey & {kid?:string;alg?:string}>};
  const key=keys.find(key=>key.kid===header.kid && key.kty==='RSA' && key.alg==='RS256');
  if(!key || !verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw new Error('Invalid Apple signature');
}

/** A fresh, single-use native authorization code; no Apple tokens are logged or persisted. */
export async function revokeAppleAuthorization(code:string,subject:string):Promise<void> {
  if(!code || code.length>4096)throw new Error('Apple authorization is required');
  const client_id=process.env.APPLE_SIGN_IN_CLIENT_ID!.trim();
  const client_secret=clientSecret();
  const tokenResponse=await fetch(`${APPLE}/auth/token`,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(8000),
    body:new URLSearchParams({client_id,client_secret,code,grant_type:'authorization_code'}),
  });
  if(!tokenResponse.ok)throw new Error('Apple authorization could not be verified; authorize again');
  const tokens=await tokenResponse.json() as {id_token?:string;refresh_token?:string;access_token?:string};
  if(!tokens.id_token)throw new Error('Apple returned no identity');
  await verifyAppleIdentity(tokens.id_token,subject,client_id);
  const token=tokens.refresh_token ?? tokens.access_token;
  if(!token)throw new Error('Apple returned no revocable token');
  const revoked=await fetch(`${APPLE}/auth/revoke`,{
    method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(8000),
    body:new URLSearchParams({client_id,client_secret,token,token_type_hint:tokens.refresh_token?'refresh_token':'access_token'}),
  });
  if(!revoked.ok)throw new Error('Apple revocation is temporarily unavailable');
}
