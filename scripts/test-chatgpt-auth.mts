import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

process.env.BOBBY_CHATGPT = 'on';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'anon-test';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'service-test';
process.env.RATE_LIMIT_SALT = 'test-salt';
const { allowedRedirectUri, authorizeAccount, CHATGPT_ISSUER, CHATGPT_RESOURCE, CHATGPT_SCOPES, digest, exchangeCode,
  oauthMetadata, parseScopes, pkceChallenge, registerClient, resolveChatgptGrant, resourceMetadata } = await import('../api/_lib/chatgpt-auth.ts');
const { handleChatgptMcp } = await import('../api/_lib/chatgpt-mcp.ts');
const { default: handler, isChatgptFirstPartyOrigin } = await import('../api/chatgpt.ts');
let checks = 0;
const eq = (a: unknown, b: unknown, what: string) => { assert.deepEqual(a,b,what); checks++; };
const ok = (value: unknown, what: string) => { assert.ok(value,what); checks++; };
const rejects = async (fn: () => Promise<unknown>, code: string) => { await assert.rejects(fn, (error: any) => error.code === code); checks++; };
const ID = 'a11ce000-0000-4000-8000-000000000001';
const CLIENT = 'c11ee000-0000-4000-8000-000000000001';
const CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect';
const verifier = 'a'.repeat(43);
const authorization = { response_type:'code', client_id:CLIENT, redirect_uri:CALLBACK, code_challenge:pkceChallenge(verifier), code_challenge_method:'S256', state:'test-state-0123456789', scope:CHATGPT_SCOPES.join(' '), resource:CHATGPT_RESOURCE };
const req = (method: string, op: string, body?: unknown, headers: Record<string,string> = {}, query: Record<string, unknown> = {}) => ({method,query:{op,...query},body,headers:{'x-forwarded-for':'10.66.5.1',...headers}} as any);
function response() {
  return { statusCode:200,body:null as any,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k.toLowerCase()]=v;},status(v:number){this.statusCode=v;return this;},json(v:unknown){this.body=v;return this;},end(){return this;},redirect(n:number,url:string){this.statusCode=n;this.body={redirectUrl:url};return this;} };
}
const originalFetch = globalThis.fetch;
type Call = { url: string; body: any; init?: RequestInit };
let calls: Call[] = [];
let grant: unknown = { identity_id:ID,client_id:CLIENT,scopes:[...CHATGPT_SCOPES] };
let enabled = true;
let exchangeReply: unknown = {scopes:[...CHATGPT_SCOPES]};
function mock() {
  calls=[];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url=String(input); const body=init?.body?JSON.parse(String(init.body)):null; calls.push({url,body,init});
    let result:unknown=[];
    if(url.includes('/auth/v1/user')) result={id:ID,app_metadata:{provider:'apple'}};
    else if(url.includes('bobby_identities?')) result=[{id:ID,auth_user_id:ID,wallet_address:null}];
    else if(url.includes('bobby_chatgpt_clients?')) result=[{id:CLIENT,name:'ChatGPT',redirect_uris:[CALLBACK],scopes:[...CHATGPT_SCOPES]}];
    else if(url.includes('rpc/bobby_chatgpt_authorize')) result=true;
    else if(url.includes('rpc/bobby_chatgpt_exchange_code')) result=exchangeReply;
    else if(url.includes('rpc/bobby_chatgpt_token_identity')) result=grant;
    else if(url.includes('rpc/bobby_financial_prepare')) result=enabled?{id:randomUUID(),items:body.p_items,expiresAt:'2026-10-05T00:00:00Z'}:{error:'context_paused'};
    else if(url.includes('rpc/bobby_financial_list')) result={enabled,items:[{id:randomUUID(),category:'goal',summary:'Emergency fund',source:'chatgpt',verification:'user_reported'}],drafts:[{id:randomUUID(),items:[{category:'expense',summary:'Pending private fact'}]}],recommendations:[{id:randomUUID(),symbol:'BTC',asOf:'2026-10-01T00:00:00Z',headline:'Wait for more evidence'}]};
    else if(url.includes('rpc/bobby_financial_recommendations')) result=enabled?{recommendations:[{id:randomUUID(),symbol:body.p_symbol ?? 'BTC',asOf:'2026-10-01T00:00:00Z',headline:'Wait for more evidence'}]}:{error:'context_paused'};
    return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
  }) as typeof fetch;
}

try {
  for(const uri of [CALLBACK]) eq(allowedRedirectUri(uri),true,'stable exact official callback');
  for(const uri of ['http://chatgpt.com/connector_platform_oauth_redirect','https://chatgpt.com.evil.example/connector_platform_oauth_redirect',`${CALLBACK}/evil`,`${CALLBACK}?next=https://evil.example`,`${CALLBACK}#x`,'https://chatgpt.com/connector/oauth/arbitrary','https://user:pass@chatgpt.com/connector_platform_oauth_redirect']) eq(allowedRedirectUri(uri),false,'reject unregistered/altered callback');
  eq(allowedRedirectUri('https://chatgpt.com/connector/oauth/exact',{BOBBY_CHATGPT_REDIRECT_URIS:'https://chatgpt.com/connector/oauth/exact'} as any),true,'configured exact callback');
  for(const raw of ['','bobby.context.admin','bobby.context.read arbitrary']) { assert.throws(()=>parseScopes(raw)); checks++; }
  eq(parseScopes('bobby.context.write bobby.context.read bobby.context.write'),[...CHATGPT_SCOPES],'scopes exact and deduplicated');
  eq(resourceMetadata().resource,CHATGPT_RESOURCE,'fixed resource cannot use request Host');
  eq(oauthMetadata().issuer,CHATGPT_ISSUER,'fixed issuer');
  eq(oauthMetadata().authorization_response_iss_parameter_supported,true,'stable callback requires issuer responses');
  for(const origin of ['https://bobbyprotocol.xyz','http://localhost:5173']) eq(isChatgptFirstPartyOrigin(req('POST','authorize',null,{origin})),true,'own production/dev origin');
  for(const origin of ['https://evil.example','https://bobbyprotocol.xyz.evil.example','https://bobbyprotocol.xyz:443','https://bobbyprotocol.xyz:8443','http://bobbyprotocol.xyz','https://chatgpt.com','https://bobbyprotocol.xyz/']) eq(isChatgptFirstPartyOrigin(req('POST','authorize',null,{origin})),false,'reject foreign/noncanonical consent origin');

  mock();
  const registered=await registerClient({redirect_uris:[CALLBACK]});
  ok(/^[0-9a-f-]{36}$/.test(registered.client_id),'opaque independent client id');
  eq('client_secret' in registered,false,'public PKCE client has no secret');
  await rejects(()=>registerClient({redirect_uris:['https://evil.example/callback']}),'invalid_client_metadata');
  await rejects(()=>registerClient({redirect_uris:[CALLBACK],token_endpoint_auth_method:'client_secret_post'}),'invalid_client_metadata');
  mock();
  const authorized=await authorizeAccount(ID,{...authorization,approved:true});
  const redirected=new URL(authorized.redirectUrl);
  eq([redirected.origin,redirected.pathname,redirected.searchParams.get('state'),redirected.searchParams.get('iss')],['https://chatgpt.com','/connector_platform_oauth_redirect',authorization.state,CHATGPT_ISSUER],'redirect binds state and issuer');
  const code=redirected.searchParams.get('code')!;
  const write=calls.find(c=>c.url.endsWith('rpc/bobby_chatgpt_authorize'))!;
  eq(write.body.p_code_hash,digest(code),'store only code hash');
  eq(write.body.p_identity,ID,'authorize server verified account');
  ok(!JSON.stringify(write.body).includes(code),'raw code not persisted');
  await rejects(()=>authorizeAccount(ID,{...authorization,approved:false}),'invalid_request');
  await rejects(()=>authorizeAccount(ID,{...authorization,approved:true,user_id:randomUUID()}),'invalid_request');
  await rejects(()=>authorizeAccount(ID,{...authorization,approved:true,code_challenge_method:'plain'}),'invalid_request');
  await rejects(()=>authorizeAccount(ID,{...authorization,approved:true,resource:'https://evil.example/api'}),'invalid_request');
  await rejects(()=>authorizeAccount(ID,{...authorization,approved:true,redirect_uri:'https://evil.example'}),'invalid_request');
  mock();
  const token=await exchangeCode({grant_type:'authorization_code',client_id:CLIENT,code,redirect_uri:CALLBACK,code_verifier:verifier,resource:CHATGPT_RESOURCE});
  const exchange=calls.find(c=>c.url.endsWith('rpc/bobby_chatgpt_exchange_code'))!;
  eq([exchange.body.p_code_hash,exchange.body.p_challenge,exchange.body.p_token_hash],[digest(code),pkceChallenge(verifier),digest(token.access_token)],'code, PKCE and token hash bindings');
  ok(!JSON.stringify(exchange.body).includes(token.access_token),'raw token not stored');
  eq(token.expires_in,3600,'bounded token lifetime');
  await rejects(()=>exchangeCode({grant_type:'refresh_token',client_id:CLIENT,refresh_token:'x'}),'invalid_request');
  await rejects(()=>exchangeCode({grant_type:'authorization_code',client_id:CLIENT,code,redirect_uri:CALLBACK,code_verifier:verifier,resource:'https://evil.example'}),'invalid_request');
  exchangeReply=null; await rejects(()=>exchangeCode({grant_type:'authorization_code',client_id:CLIENT,code,redirect_uri:CALLBACK,code_verifier:verifier,resource:CHATGPT_RESOURCE}),'invalid_grant'); exchangeReply={scopes:[...CHATGPT_SCOPES]};
  mock();
  eq((await resolveChatgptGrant(req('POST','mcp',null,{authorization:`Bearer ${token.access_token}`})))?.identityId,ID,'MCP identity is server token binding');
  eq(await resolveChatgptGrant(req('POST','mcp',null,{authorization:'Bearer supabase-session'})),null,'Supabase session cannot act as OAuth bearer');
  grant=null; eq(await resolveChatgptGrant(req('POST','mcp',null,{authorization:`Bearer ${token.access_token}`})),null,'revoked/expired/unbound bearer rejected'); grant={identity_id:ID,client_id:CLIENT,scopes:[...CHATGPT_SCOPES]};

  const read={identityId:ID,clientId:CLIENT,scopes:['bobby.context.read'] as any};
  const writeGrant={identityId:ID,clientId:CLIENT,scopes:['bobby.context.write'] as any};
  const rpc=(name:string,args:unknown={})=>({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
  mock();
  const listed=await handleChatgptMcp({jsonrpc:'2.0',id:1,method:'tools/list'},read);
  eq((listed.body as any).result.tools.map((t:any)=>t.name),['bobby_get_financial_context','bobby_get_recommendations'],'scope filters exposed tools');
  await rejects(()=>handleChatgptMcp(rpc('bobby_prepare_financial_context',{items:[{category:'goal',summary:'Emergency fund'}]}),read),'insufficient_scope');
  await rejects(()=>handleChatgptMcp(rpc('bobby_get_financial_context'),writeGrant),'insufficient_scope');
  for(const args of [{history:['raw']},{items:[{category:'goal',summary:'Emergency fund',user_id:ID}]},{items:[{category:'goal',summary:'Emergency fund',amount:50}]},{items:[{category:'goal',summary:'Account GB82WEST12345698765432'}]},{items:Array.from({length:21},()=>({category:'goal',summary:'Emergency fund'}))}]) {
    mock(); const result=await handleChatgptMcp(rpc('bobby_prepare_financial_context',args),writeGrant);
    eq((result.body as any).result.isError,true,'reject broad history, IDs, invalid facts and batch overflow');
    eq(calls.length,0,'invalid tool input makes no storage call');
  }
  mock();
  const prepared=await handleChatgptMcp(rpc('bobby_prepare_financial_context',{items:[{category:'goal',summary:'Emergency fund',amount:3000,currency:'EUR'}]}),writeGrant);
  const draft=(prepared.body as any).result.structuredContent;
  eq([draft.status,draft.saved],['pending_review',false],'MCP only prepares review draft, never commits');
  eq('id' in draft,false,'model receives review URL without a redundant internal draft ID');
  eq(calls.filter(c=>c.url.includes('bobby_financial_import')).length,0,'MCP has no commit call');
  eq(calls[0].body.p_identity,ID,'MCP draft bound to token identity');
  mock();
  const returned=(await handleChatgptMcp(rpc('bobby_get_financial_context'),read)).body as any;
  eq('drafts' in returned.result.structuredContent,false,'MCP does not return pending private drafts');
  eq('id' in returned.result.structuredContent.items[0],false,'approved facts omit internal item IDs');
  eq(returned.result.structuredContent.verification,'unverified','user reports never bank verification');
  const recommendations=(await handleChatgptMcp(rpc('bobby_get_recommendations'),read)).body as any;
  eq('id' in recommendations.result.structuredContent.recommendations[0],false,'dated analyses omit internal snapshot IDs');
  eq(recommendations.result.structuredContent.recommendations[0].asOf,'2026-10-01T00:00:00Z','preserve actual dated evidence');
  mock();
  const filtered=(await handleChatgptMcp(rpc('bobby_get_recommendations',{symbol:'NVDA',limit:5}),read)).body as any;
  eq(filtered.result.structuredContent.recommendations[0].symbol,'NVDA','connector receives account-scoped database-filtered recommendations');
  eq(calls.find(c=>c.url.includes('rpc/bobby_financial_recommendations'))?.body,{p_identity:ID,p_symbol:'NVDA',p_limit:5},'apply symbol filter before database result cap');
  eq('id' in filtered.result.structuredContent.recommendations[0],false,'filtered recommendations still omit internal IDs');
  enabled=false; mock();
  const paused=(await handleChatgptMcp(rpc('bobby_get_financial_context'),read)).body as any;
  eq([paused.result.isError,paused.result.structuredContent.error],[true,'context_paused'],'pause blocks sharing approved facts');
  const pausedPrepare=(await handleChatgptMcp(rpc('bobby_prepare_financial_context',{items:[{category:'goal',summary:'Emergency fund'}]}),writeGrant)).body as any;
  eq([pausedPrepare.result.isError,pausedPrepare.result.structuredContent.error],[true,'context_paused'],'explicit finance opt-in is required before preparing draft'); enabled=true;
  mock();
  const noAuth=response(); await handler(req('POST','mcp',{jsonrpc:'2.0',id:1,method:'tools/list'}),noAuth as any);
  eq(noAuth.statusCode,401,'MCP no token returns 401'); ok(noAuth.headers['www-authenticate'].includes('oauth-protected-resource/api/chatgpt'),'401 advertises protected resource discovery');
  const badOrigin=response(); await handler(req('POST','authorize',{...authorization,approved:true},{origin:'https://evil.example',authorization:'Bearer account-token'}),badOrigin as any); eq(badOrigin.statusCode,403,'foreign browser cannot approve');
  const anonymous=response(); await handler(req('POST','authorize',{...authorization,approved:true},{origin:CHATGPT_ISSUER}),anonymous as any); eq(anonymous.statusCode,401,'consent requires signed account');
  process.env.BOBBY_CHATGPT='off';
  const disabled=response(); await handler(req('POST','mcp',{jsonrpc:'2.0',id:1,method:'tools/list'},{authorization:`Bearer ${token.access_token}`}),disabled as any); eq(disabled.statusCode,503,'feature switch fails closed');
  const metadata=response(); await handler(req('GET','metadata'),metadata as any); eq(metadata.body.resource,CHATGPT_RESOURCE,'discovery works while disabled');
  const revoke=response(); await handler(req('POST','revoke',{}, {origin:CHATGPT_ISSUER,authorization:'Bearer account-token'}),revoke as any); eq([revoke.statusCode,revoke.body.connected],[200,false],'account can revoke even while feature disabled'); process.env.BOBBY_CHATGPT='on';
} finally { globalThis.fetch=originalFetch; }

// Optional real PostgreSQL regression. It is explicitly restricted to a local scratch database.
const databaseUrl=process.env.DATABASE_URL;
if(databaseUrl) {
  if(!['localhost','127.0.0.1','::1'].includes(new URL(databaseUrl).hostname)) throw new Error('DATABASE_URL must point to local scratch PostgreSQL');
  const pool=new pg.Pool({connectionString:databaseUrl,max:4});
  const q=async(sql:string,args:unknown[]=[]) => (await pool.query(sql,args)).rows;
  const migration=readFileSync('supabase/bobby-protocol/supabase/migrations/20261004161000_chatgpt_oauth.sql','utf8');
  const identity=randomUUID(),client=randomUUID();
  try {
    await q(migration); await q(migration);
    await q('insert into bobby_identities(id,auth_user_id) values($1,$2)',[identity,randomUUID()]);
    await q('insert into bobby_chatgpt_clients(id,name,redirect_uris,scopes) values($1,$2,$3,$4)',[client,'ChatGPT',[CALLBACK],[...CHATGPT_SCOPES]]);
    const issue=async(code:string,scopes=[...CHATGPT_SCOPES]) => (await q('select bobby_chatgpt_authorize($1,$2,$3,$4,$5,$6,$7,$8,now()+interval \'4 minutes\') r',[identity,client,scopes,digest(code),pkceChallenge(verifier),CALLBACK,CHATGPT_RESOURCE,CHATGPT_ISSUER]))[0].r;
    const exchange=async(code:string,token:string,challenge=pkceChallenge(verifier),resource=CHATGPT_RESOURCE,issuer=CHATGPT_ISSUER,clientId=client,redirect=CALLBACK) => (await q('select bobby_chatgpt_exchange_code($1,$2,$3,$4,$5,$6,$7,now()+interval \'59 minutes\') r',[digest(code),clientId,redirect,challenge,resource,issuer,digest(token)]))[0].r;
    const resolve=async(token:string,resource=CHATGPT_RESOURCE,issuer=CHATGPT_ISSUER)=>(await q('select bobby_chatgpt_token_identity($1,$2,$3) r',[digest(token),resource,issuer]))[0].r;
    eq(await issue('first-code'),true,'PG explicit consent issues bound code');
    eq(await exchange('first-code','token-bad',pkceChallenge('b'.repeat(43))),null,'PG incorrect PKCE rejected');
    eq(await exchange('first-code','token-bad',pkceChallenge(verifier),'https://evil.example'),null,'PG audience mismatch rejected');
    eq(await exchange('first-code','token-bad',pkceChallenge(verifier),CHATGPT_RESOURCE,'https://evil.example'),null,'PG issuer mismatch rejected');
    eq(await exchange('first-code','token-bad',pkceChallenge(verifier),CHATGPT_RESOURCE,CHATGPT_ISSUER,randomUUID()),null,'PG client mix-up rejected');
    eq(await exchange('first-code','token-bad',pkceChallenge(verifier),CHATGPT_RESOURCE,CHATGPT_ISSUER,client,'https://evil.example'),null,'PG redirect mix-up rejected');
    eq((await exchange('first-code','first-token')).scopes,[...CHATGPT_SCOPES],'PG valid S256 exchange');
    eq((await resolve('first-token')).identity_id,identity,'PG token resolves original account');
    eq(await resolve('first-token','https://evil.example'),null,'PG wrong resource cannot read');
    eq(await resolve('first-token',CHATGPT_RESOURCE,'https://evil.example'),null,'PG wrong issuer cannot read');
    eq(await exchange('first-code','replayed-token'),null,'PG code one use');
    eq(await resolve('first-token'),null,'PG bound code replay revokes issued token');
    await issue('concurrent-code');
    const concurrent=await Promise.all([exchange('concurrent-code','race-token-a'),exchange('concurrent-code','race-token-b')]);
    eq(concurrent.filter(Boolean).length,1,'PG row lock allows exactly one concurrent exchange');
    await issue('expired-code'); await q('update bobby_chatgpt_codes set expires_at=now()-interval \'1 second\' where code_hash=$1',[digest('expired-code')]);
    eq(await exchange('expired-code','expired-token'),null,'PG expired code rejected');
    await issue('valid-code'); await exchange('valid-code','valid-token');
    await q('update bobby_chatgpt_tokens set expires_at=now()-interval \'1 second\' where token_hash=$1',[digest('valid-token')]);
    eq(await resolve('valid-token'),null,'PG expired access token rejected');
    await issue('old-version'); await exchange('old-version','old-token');
    await issue('new-version'); eq(await resolve('old-token'),null,'PG reconsent invalidates former grant version');
    await exchange('new-version','new-token');
    await q('select bobby_chatgpt_revoke_account($1)',[randomUUID()]); ok(await resolve('new-token'),'PG another account cannot revoke this grant');
    await q('select bobby_chatgpt_revoke_account($1)',[identity]); eq(await resolve('new-token'),null,'PG own-account revocation immediate');
    for(const table of ['bobby_chatgpt_clients','bobby_chatgpt_connections','bobby_chatgpt_codes','bobby_chatgpt_tokens']) for(const role of ['anon','authenticated']) {
      eq((await q('select has_table_privilege($1,$2,\'select\') r',[role,`public.${table}`]))[0].r,false,'PG service-only tables');
    }
    for(const signature of ['bobby_chatgpt_token_identity(text,text,text)','bobby_chatgpt_revoke_account(uuid)','bobby_chatgpt_exchange_code(text,uuid,text,text,text,text,text,timestamptz)']) for(const role of ['anon','authenticated']) {
      eq((await q('select has_function_privilege($1,$2,\'execute\') r',[role,`public.${signature}`]))[0].r,false,'PG service-only RPCs');
    }
    await q('delete from bobby_identities where id=$1',[identity]);
    eq(Number((await q('select count(*) n from bobby_chatgpt_connections where identity_id=$1',[identity]))[0].n),0,'PG account deletion cascades OAuth credentials');
  } finally {
    await q('delete from bobby_identities where id=$1',[identity]).catch(()=>{});
    await q('delete from bobby_chatgpt_clients where id=$1',[client]).catch(()=>{});
    await pool.end();
  }
} else console.log('chatgpt-auth: PostgreSQL checks skipped (no local DATABASE_URL)');
console.log(`chatgpt-auth: ${checks} checks passed`);
