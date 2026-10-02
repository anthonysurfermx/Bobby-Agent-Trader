import { generateKeyPairSync } from 'node:crypto';
process.env.BOBBY_SUPABASE_URL='https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY='test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY='test-service';
process.env.RATE_LIMIT_SALT='review-only-salt';
const {searchConsole,requireAdmin,adminDays}=await import('/Users/mrrobot/.codex/worktrees/bobby-dashboard-live/Bobby-Agent-Trader/api/_lib/admin.ts');
const {withAdminRead,observeAdminSource,adminReadMeta}=await import('/Users/mrrobot/.codex/worktrees/bobby-dashboard-live/Bobby-Agent-Trader/api/_lib/admin-read.ts');
const AUTH='00000000-0000-4000-8000-000000000123';
const json=(o:unknown)=>new Response(JSON.stringify(o),{headers:{'content-type':'application/json'}});
globalThis.fetch=(async(input:string|URL,init?:RequestInit)=>{
 const url=String(input);
 if(url.includes('/auth/v1/user'))return json({id:AUTH,email:null,app_metadata:{provider:'apple'}});
 if(url.includes('bobby_identities?on_conflict'))return await new Promise<Response>(r=>setTimeout(()=>r(json([{id:AUTH,auth_user_id:AUTH,wallet_address:null}])),130));
 return json([]);
}) as typeof fetch;
const res={statusCode:200,body:null as unknown,setHeader(){},status(n:number){this.statusCode=n;return this;},json(o:unknown){this.body=o;return this;}};
let t=performance.now();
await withAdminRead(()=>requireAdmin({headers:{authorization:'Bearer test','x-forwarded-for':'198.51.100.5'}} as never,res as never),{budgetMs:20});
console.log(JSON.stringify({repro:'authentication beyond request context budget',budgetMs:20,elapsedMs:Math.round(performance.now()-t),status:res.statusCode}));
const days=adminDays(2),today=days[1];
process.env.GSC_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'test@example.test',private_key:generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs8',format:'pem'})});
globalThis.fetch=(async(input:string|URL,init?:RequestInit)=>{
 const url=String(input);
 if(url.includes('oauth2.googleapis.com'))return json({access_token:'offline-test-token',expires_in:60});
 const body=JSON.parse(String(init?.body));
 return body.dimensions?.[0]==='date'?json({rows:[{keys:[days[0]],clicks:3,impressions:20,position:2}],metadata:{first_incomplete_date:today}}):json({rows:[]});
}) as typeof fetch;
const data=await withAdminRead(async()=>{const sc=await observeAdminSource('searchConsole',()=>searchConsole(days));return {sc,meta:adminReadMeta()};});
console.log(JSON.stringify({repro:'incomplete Search Console day rendered zero',days,data}));
