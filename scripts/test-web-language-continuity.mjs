// Execute shipping consumer callbacks in a browser shim, without providers, audio, or payments.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import * as crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const locales = [['en','en-US'],['es','es-MX'],['fr','fr-FR'],['pt','pt-PT'],['pt','pt-BR'],['it','it-IT'],['de','de-DE']];
let checks = 0;
const check = (name, action) => { action(); checks++; console.log('ok - ' + name); };
const flush = async () => { for (let n=0; n<20; n++) await Promise.resolve(); };
function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]; }

function browser(language, locale, denied = false) {
  const storage = new Map(), calls = { oauth: [], navigated: [], assigned: [], fetch: [], stopped: 0, legacyCallback: 0 }, effects = [], timers = [], cache = new Map();
  const location = { origin: 'https://bobby.test', search: '', href: '', hash: '', pathname: '/desk', assign: url => calls.assigned.push(url) };
  function go(route) { const url=new URL(route,location.origin); Object.assign(location,{search:url.search,href:url.href,hash:url.hash,pathname:url.pathname}); }
  go(`/desk?lang=${language}&locale=${locale}&country=BR&symbol=BNP.PA&timeframe=1D`);
  const localStorage = { getItem(key) { if(denied)throw new DOMException('Denied','SecurityError');return storage.get(key)??null; }, setItem(key,value){if(denied)throw new DOMException('Denied','SecurityError');storage.set(key,String(value));} };
  const states = [];
  const react = { useState(initial) { const i=states.length;states.push(typeof initial==='function'?initial():initial);return[states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}]; }, useEffect(fn){effects.push(fn);}, useMemo:fn=>fn(),useCallback:fn=>fn,useRef:value=>({current:value}) };
  const jsx=(type,props)=>({type,props:props??{}});
  let response={status:503,body:{error:'provider diagnostic in English'}}, fetchThrows=false;
  let authSession={user:{id:'inert-user'},access_token:'INERT'}, sessionThrows=false;
  const auth={ async signInWithOAuth(input){calls.oauth.push(input);return{data:{url:'https://audit.supabase.co/auth/v1/authorize?provider='+input.provider}};}, async getSession(){if(sessionThrows)throw new Error('Raw English provider exception');return{data:{session:authSession}};} };
  const context=vm.createContext({console:{log(){},error(){}},URL,URLSearchParams,Intl,DOMException,crypto:{randomUUID:()=> 'inert-device-identifier-123456'},navigator:{language:'en-US',languages:['en-US']},localStorage,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},document:{title:'Audit',documentElement:{lang:'en-US'}},window:{location,history:{replaceState:(_s,_t,url)=>go(url)},setTimeout:fn=>timers.push(fn)},setTimeout:fn=>timers.push(fn),fetch:async(url,init)=>{calls.fetch.push({url,init});if(fetchThrows)throw new Error('Inert transport failure');return{ok:response.status===200,status:response.status,json:async()=>response.body};}});
  const stubs={
    react,'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},
    'framer-motion':{motion:new Proxy({},{get:(_,key)=>key})},
    'lucide-react':new Proxy({},{get:(_,key)=>key}),
    '@reown/appkit/react':{useAppKit:()=>({open(){throw new Error('Wallet is forbidden');}})},
    '@/lib/bobby-db-client':{bobbySupabase:()=>({auth})},'@/lib/track':{track(){}},
    '@/lib/companions/sync':{progressHeaders:()=>null},
    'react-router-dom':{useNavigate:()=> (route,options)=>{calls.navigated.push({route,options});go(route);},useSearchParams:()=>[new URLSearchParams(location.search)]},
    '@/hooks/useAuth':{useAuth:()=>({handleAuthCallback(){calls.legacyCallback++;throw new Error('Legacy auth is not part of the Bobby callback');}})},
    'react-helmet-async':{Helmet:'Helmet'},sonner:{toast:new Proxy({},{get:()=>()=>{}})},
    '@/components/ui/card':{Card:'Card',CardContent:'CardContent'},'@/components/ui/alert':{Alert:'Alert',AlertDescription:'AlertDescription'},
    '@/lib/companions/progress':{progressStore:{acceptRiskNotice(){},finishOnboarding(){}}},
    '@/lib/companions/sfx':{sfxTock(){},sfxSuccess(){}},
    '@/components/companion/NucleoSphere':{default:()=>null},'./LangMenu':{default:()=>null},
    '@/components/protocol/NucleoTopBar':{default:()=>null},'@/hooks/useNucleoPages':{useNucleoPages(){}},'@/components/kinetic/KineticShell':{default:()=>null},
  };
  function load(file){
    if(cache.has(file))return cache.get(file);
    const module={exports:{}};cache.set(file,module.exports);
    const require=name=>{
      if(name in stubs)return stubs[name];
      const base=name.startsWith('@/')?'src/'+name.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(file),name));
      for(const candidate of [base,base+'.ts',base+'.tsx'])if(fs.existsSync(path.join(root,candidate)))return load(candidate);
      throw new Error('Unexpected module '+name+' in '+file);
    };
    vm.runInContext('(function(require,module,exports){'+compile(read(file))+'})',context,{filename:file})(require,module,module.exports);
    cache.set(file,module.exports);return module.exports;
  }
  return{context,load,storage,calls,effects,timers,go,location,react,states,response:value=>{response=value;fetchThrows=false;},throwFetch:()=>{fetchThrows=true;},noSession:()=>{authSession=null;},throwSession:()=>{sessionThrows=true;}};
}

function declaration(file,name){
  const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let found;
  function visit(node){if((ts.isVariableDeclaration(node)||ts.isFunctionDeclaration(node))&&node.name?.getText(source)===name)found=node;ts.forEachChild(node,visit);}
  visit(source);assert.ok(found,'Shipping consumer exists: '+name);return ts.isVariableDeclaration(found)?'const '+name+' = '+found.initializer.getText(source)+';':found.getText(source);
}
function deskVoiceEntry(b){
  const client=b.load('src/lib/client-language.ts');
  const factory=vm.runInContext('(function(voice,listening,freeVoice,navigate,chartSymbol,initialScreen,clientLanguagePath){'+compile(declaration('src/components/nucleo/NucleoDesk.tsx','toggleDictation'))+'return toggleDictation;})',b.context);
  factory({stop(){b.calls.stopped++;}},false,false,(route,options)=>{b.calls.navigated.push({route,options});b.go(route);},'BNP.PA',{timeframe:'1D'},client.clientLanguagePath)();
}

for(const[language,locale]of locales)for(const denied of[false,true]){
  const b=browser(language,locale,denied),client=b.load('src/lib/client-language.ts');
  check(`${locale} storage ${denied?'denied':'empty'}: desk voice entry keeps language and market`,()=>{
    deskVoiceEntry(b);const query=new URLSearchParams(b.location.search);
    assert.equal(query.get('lang'),language);assert.equal(query.get('locale'),locale);assert.equal(query.get('country'),'BR');assert.equal(query.get('symbol'),'BNP.PA');assert.equal(query.get('timeframe'),'1D');assert.equal(query.get('start'),'1');assert.equal(client.clientLanguage(),language);assert.equal(client.clientLocale(),locale);assert.equal(b.calls.stopped,1);assert.equal(b.calls.fetch.length,0);
  });
  for(const[file,props]of[['src/components/companion/SignInPrompt.tsx',{xp:2,onClose(){},required:true}],['src/pages/BobbySignInPage.tsx',{}]])for(const provider of['apple','google']){
    const oauth=browser(language,locale,denied),tree=oauth.load(file).default(props);
    const brand=provider==='apple'?'Apple':'Google';
    const button=nodes(tree).find(node=>node.type==='button'&&[node.props.children].flat(Infinity).some(child=>typeof child==='string'&&child.includes(brand)));
    assert.ok(button);button.props.onClick();await flush();
    check(`${locale} ${file} ${provider}: explicit locale survives OAuth without storage`,()=>{
      const callback=new URL(oauth.calls.oauth[0].options.redirectTo);assert.equal(callback.pathname,'/auth/callback');assert.equal(callback.searchParams.get('source'),'bobby');assert.equal(callback.searchParams.get('lang'),language);assert.equal(callback.searchParams.get('locale'),locale);assert.equal(callback.searchParams.get('country'),'BR');assert.equal(oauth.calls.assigned.length,1);
      if(!denied){assert.equal(oauth.storage.get('bobby_lang'),language);assert.equal(oauth.storage.get('bobby_locale'),locale);}
    });
  }
  const callback=browser(language,locale,denied);callback.go(`/auth/callback?lang=${language}&locale=${locale}&country=BR#access_token=INERT&refresh_token=INERT`);callback.load('src/pages/AuthCallback.tsx').default();callback.effects[0]();await flush();callback.timers.forEach(fn=>fn());
  check(`${locale} OAuth return preserves locale in the actual router destination`,()=>{
    assert.equal(callback.location.pathname,'/desk');assert.equal(callback.load('src/lib/client-language.ts').clientLocale(),locale);assert.equal(new URLSearchParams(callback.location.search).get('country'),'BR');assert.ok(!callback.location.href.includes('token'));assert.equal(callback.calls.fetch.length,0);
  });
  for(const scenario of['access_denied','unexpected_provider_error','missing_session','transport_error','missing_parameters']){
    const failure=browser(language,locale,denied),query=new URLSearchParams({source:'bobby',lang:language,locale,country:'BR'});
    if(['access_denied','unexpected_provider_error'].includes(scenario)){query.set('error',scenario);query.set('error_description','Untranslated provider diagnostic must not be shown');}
    if(['missing_session','transport_error'].includes(scenario))query.set('code','INERT_CODE');
    if(scenario==='missing_session')failure.noSession();if(scenario==='transport_error')failure.throwSession();
    failure.go('/auth/callback?'+query.toString());failure.load('src/pages/AuthCallback.tsx').default();failure.effects[0]();await flush();failure.timers.forEach(fn=>fn());
    check(`${locale} storage ${denied?'denied':'empty'}: Bobby ${scenario} offers its own localized sign-in`,()=>{
      assert.equal(failure.location.pathname,'/signin');assert.equal(failure.load('src/lib/client-language.ts').clientLocale(),locale);assert.equal(new URLSearchParams(failure.location.search).get('country'),'BR');assert.ok(!failure.location.href.includes('error_description'));assert.ok(!failure.states[1].includes('Untranslated provider'));assert.ok(!failure.states[1].includes('Raw English'));assert.equal(failure.calls.legacyCallback,0);assert.equal(failure.calls.fetch.length,0);
      const copy={access_denied:['Access denied. Please try again.','Acceso denegado. Por favor intenta de nuevo.'],unexpected_provider_error:['An authentication error occurred.','Ocurrió un error de autenticación.'],transport_error:['An unexpected error occurred.','Ocurrió un error inesperado.']}[scenario]??['Authentication could not be completed.','No se pudo completar la autenticación.'];assert.equal(failure.states[1],failure.load('src/lib/companions/i18n.ts').t(...copy));
    });
  }
  for(const file of['src/components/nucleo/NucleoRisk.tsx','src/pages/PrivacyPage.tsx','src/pages/BobbySupportPage.tsx','src/pages/BobbySignInPage.tsx']){
    const links=browser(language,locale,denied),tree=links.load(file).default({});
    const local=nodes(tree).filter(node=>node.type==='a'&&node.props.href?.startsWith('/')&&!node.props.href.startsWith('//'));
    check(`${locale} ${file}: local app links keep dialect and country`,()=>{
      assert.ok(local.length);for(const link of local){const query=new URL(link.props.href,'https://bobby.test').searchParams;assert.equal(query.get('lang'),language);assert.equal(query.get('locale'),locale);assert.equal(query.get('country'),'BR');}assert.equal(links.calls.fetch.length,0);
    });
  }
}

for(const[language,locale]of locales){
  const b=browser(language,locale),client=b.load('src/lib/client-language.ts');
  // Execute the shipping effect; provider/component rendering is immaterial to persistence.
  const effectSource=/React\.useEffect\((.*?)\n/.exec(declaration('src/App.tsx','RootLayout'))?.[0];assert.ok(effectSource);
  vm.runInContext('(function(React,rememberQueryLanguage,documentLocale){'+effectSource+'})',b.context)(b.react,client.rememberQueryLanguage,locale);b.effects.forEach(fn=>fn());b.go('/desk');
  check(`${locale}: root remembers a valid URL selection for plain reloads`,()=>{assert.equal(client.clientLanguage(),language);assert.equal(client.clientLocale(),locale);});
  const bill=browser(language,locale),start=bill.load('src/lib/access-client.ts').startBilling;
  for(const item of[{status:503,body:{error:'Card payments are not switched on yet.'}},{status:404,body:{error:'No card subscription on this account.'}},{status:401,body:{error:'Sign in in English.'}},{status:500,body:{error:'raw-provider-English-diagnostic'}},{status:200,body:{}}]){
    bill.response(item);const message=await start('checkout');
    check(`${locale}: billing ${item.status} returns interface copy`,()=>{assert.equal(typeof message,'string');assert.ok(message.length);assert.ok(!message.includes('raw-provider'));assert.ok(!message.includes('Sign in in English'));if(!['en','es'].includes(language))assert.ok(!/^(Payments|Card payments|This account|Sign in first)/.test(message));assert.equal(bill.calls.assigned.length,0);});
  }
  bill.throwFetch();const offline=await start('portal');
  check(`${locale}: billing transport failure remains localized`,()=>{if(!['en','es'].includes(language))assert.ok(!offline.startsWith('Payments'));});
  bill.response({status:200,body:{url:'https://checkout.stripe.test/INERT'}});assert.equal(await start('checkout'),null);
  check(`${locale}: successful billing keeps its existing redirect and locale contract`,()=>{
    assert.deepEqual(bill.calls.assigned,['https://checkout.stripe.test/INERT']);
    const body=JSON.parse(bill.calls.fetch.at(-1).init.body);assert.equal(body.language,language);assert.equal(body.locale,locale);assert.equal(body.country,'BR');assert.equal(body.symbol,'BNP.PA');assert.equal(body.timeframe,'1D');
  });
  await start('checkout',{symbol:'ENI.MI',timeframe:'4H'});
  check(`${locale}: checkout preserves the current desk asset instead of a stale URL asset`,()=>{const body=JSON.parse(bill.calls.fetch.at(-1).init.body);assert.equal(body.symbol,'ENI.MI');assert.equal(body.timeframe,'4H');});
}

for(const dialect of['pt-PT','pt-BR']){
  const b=browser('pt',dialect),i=b.load('src/lib/companions/i18n.ts');
  for(const[english,legacy]of[['Your profile','Seu perfil'],['You might want to ask','Talvez você queira perguntar'],['Ask about any stock or crypto…','Pergunte sobre ação ou cripto…']]){
    check(`${dialect}: catalogue Portugal and explicit Brazil copy retain their own precedence`,()=>{assert.equal(i.t(english,'Inert Spanish',legacy),dialect==='pt-PT'?i.translatedEnglish(english,'pt'):legacy);});
  }
  check(`${dialect}: dynamic profile text retains names and regional grammar`,()=>{
    const english='Your profile · Sofia, level 3',legacy='Seu perfil · Sofia, nível 3';assert.equal(i.t(english,'Inert Spanish',legacy),dialect==='pt-PT'?i.translatedEnglish(english,'pt'):legacy);
    assert.equal(i.t('A new uncatalogued neutral label','Inert Spanish','Rótulo explícito'), 'Rótulo explícito');
  });
}
for(const language of['en','es','fr','it','de']){
  const i=browser(language,{en:'en-US',es:'es-MX',fr:'fr-FR',it:'it-IT',de:'de-DE'}[language]).load('src/lib/companions/i18n.ts');
  check(`${language}: Portugal precedence leaves other explicit translations unchanged`,()=>{assert.equal(i.pick({en:'Your profile',es:'Explicit es',fr:'Explicit fr',it:'Explicit it',de:'Explicit de'}),language==='en'?'Your profile':'Explicit '+language);});
}

async function billingApi(body,{signedIn=true,host='bobbyprotocol.xyz'}={}){
  const requests=[];
  const response={statusCode:200,body:null,setHeader(){},status(status){this.statusCode=status;return this;},json(value){this.body=value;return this;}};
  const context=vm.createContext({console:{log(){},error(){}},URL,URLSearchParams,Buffer,AbortSignal,process:{env:{STRIPE_SECRET_KEY:'sk_test_INERT',STRIPE_PRICE_ID:'price_INERT'}},fetch:async(url,init)=>{assert.ok(String(url).startsWith('https://api.stripe.com/v1/'));requests.push({url,form:new URLSearchParams(init.body)});return{ok:true,json:async()=>({url:'https://checkout.stripe.test/INERT'})};}});
  const shared={exports:{}};vm.runInContext('(function(module,exports){'+compile(read('src/lib/app-language.ts'))+'})',context)(shared,shared.exports);
  const identity={id:'inert-owner',authUserId:'inert-user'};
  const forbidden=()=>{throw new Error('Unrelated billing operation must not run');};
  const stubs={
    'node:crypto':crypto,'@vercel/functions':{waitUntil(){}},
    './_lib/request-security.js':{enforcePublicRateLimit:async()=>true},
    './_lib/user-identity.js':{requireIdentity:async(_req,res)=>{if(!signedIn){res.status(401).json({error:'Inert unauthenticated'});return null;}return identity;}},
    './_lib/access.js':{getSubscription:async()=>({stripe_customer_id:'cus_INERT'})},
    './_lib/referrals.js':{},'./_lib/coupons.js':{},'./_lib/rate-limit-persistent.js':{},'./_lib/rate-limit.js':{},'./_lib/desk-levels.js':{},'./_lib/bobby-db.js':{},'./_lib/revenuecat.js':{},
    // Checkout reaches Stripe through these modules: reads find nothing open, and the one create is recorded like a fetch.
    './_lib/stripe-api.js':{STRIPE_TERMINAL:new Set(['canceled','incomplete_expired']),customerFor:async()=>'cus_INERT',findCustomer:async(_id,stored)=>stored??null,expireCheckoutSession:forbidden,
      stripeApi:async(method,path,form,key)=>{if(method==='GET')return{data:[]};assert.equal(path,'checkout/sessions');assert.equal(key,'bobby-checkout-00000000-0000-4000-8000-000000000000');requests.push({url:'https://api.stripe.com/v1/'+path,form:new URLSearchParams(form)});return{id:'cs_test_INERT',url:'https://checkout.stripe.test/INERT'};}},
    './_lib/checkout-attempt.js':{claimCheckout:async(_identity,customer,price,origin)=>({state:'create',attemptId:'00000000-0000-4000-8000-000000000000',customer,price,origin,expiresAt:2000000000}),completeCheckout:async()=>{}},
    './_lib/funnel.js':{recordCheckoutOpened:async()=>{}},
    '../src/lib/app-language.js':shared.exports,
  };
  const module={exports:{}};
  vm.runInContext('(function(require,module,exports){'+compile(read('api/bobby-access.ts'))+'})',context,{filename:'api/bobby-access.ts'})(name=>{assert.ok(name in stubs,'Known inert dependency: '+name);return stubs[name];},module,module.exports);
  await module.exports.default({method:'POST',headers:{host},body},response);
  return{requests,response};
}
for(const[language,locale]of locales)for(const action of['checkout','portal']){
  const{requests,response}=await billingApi({action,language,locale,country:'BR',symbol:'BNP.PA',timeframe:'1D',return_url:'https://attacker.test/path'});
  check(`${locale}: actual ${action} handler binds provider locale and preserves safe return context`,()=>{
    assert.equal(response.statusCode,200);assert.equal(requests.length,1);const form=requests[0].form;
    assert.equal(form.get('locale'),locale==='pt-BR'?'pt-BR':language==='es'?'es-419':language);
    const returns=action==='checkout'?['success_url','cancel_url']:['return_url'];
    for(const key of returns){const url=new URL(form.get(key));assert.equal(url.origin,'https://bobbyprotocol.xyz');assert.equal(url.pathname,'/desk');assert.equal(url.searchParams.get('lang'),language);assert.equal(url.searchParams.get('locale'),locale);assert.equal(url.searchParams.get('country'),'BR');assert.equal(url.searchParams.get('symbol'),action==='checkout'?null:'BNP.PA');assert.equal(url.searchParams.get('timeframe'),action==='checkout'?null:'1D');assert.ok(!url.href.includes('attacker'));}
    if(action==='checkout'){assert.equal(new URL(form.get('success_url')).searchParams.get('pro'),'welcome');assert.equal(new URL(form.get('cancel_url')).searchParams.get('pro'),'cancelled');assert.equal(form.get('line_items[0][price]'),'price_INERT');assert.equal(form.get('client_reference_id'),'inert-owner');}else assert.equal(form.get('customer'),'cus_INERT');
  });
}
for(const[language,locale,provider]of[['es','es-ES','es'],['es','es-US','es-419'],['en','en-GB','en-GB'],['en','en-AU','en'],['en','en-CA','en'],['en','en-IE','en']])for(const action of['checkout','portal']){
  const{requests,response}=await billingApi({action,language,locale,symbol:'^GSPC',timeframe:'1D'});
  check(`${locale}: ${action} keeps supported provider dialect and index identifier`,()=>{assert.equal(response.statusCode,200);assert.equal(requests[0].form.get('locale'),provider);const url=new URL(requests[0].form.get(action==='checkout'?'success_url':'return_url'));assert.equal(url.searchParams.get('locale'),locale);assert.equal(url.searchParams.get('symbol'),action==='checkout'?null:'^GSPC');});
}
for(const symbol of['BRK-B','=F','BTC-USD','^GSPC','A'.repeat(20)]){
  // Checkout is idempotent per attempt (Stripe rejects a retry whose form differs), so the asset stays out of its form;
  // the billing portal, which has no idempotency key, still returns to the asset.
  const{requests}=await billingApi({action:'checkout',language:'fr',locale:'fr-FR',symbol});
  check(`checkout form does not vary with the Desk symbol ${symbol}`,()=>{assert.equal(new URL(requests[0].form.get('success_url')).searchParams.get('symbol'),null);});
  const portal=await billingApi({action:'portal',language:'fr',locale:'fr-FR',symbol});
  check(`portal return preserves Desk contract symbol ${symbol}`,()=>{assert.equal(new URL(portal.requests[0].form.get('return_url')).searchParams.get('symbol'),symbol);});
}
for(const action of['checkout','portal']){
  const legacy=await billingApi({action});
  check(`legacy ${action} without interface context preserves its contract`,()=>{const form=legacy.requests[0].form;assert.equal(form.get('locale'),null);assert.equal(form.get(action==='checkout'?'success_url':'return_url'),action==='checkout'?'https://bobbyprotocol.xyz/desk?pro=welcome':'https://bobbyprotocol.xyz/desk');});
  const malformed=await billingApi({action,language:'fr',locale:'de-DE',country:'BR?redirect=evil',symbol:'BTC<script>',timeframe:'1D;alert()',return_url:'https://attacker.test/path'},{host:'attacker.test'});
  check(`${action}: malformed region and market cannot become return instructions`,()=>{const url=new URL(malformed.requests[0].form.get(action==='checkout'?'success_url':'return_url'));assert.equal(url.origin,'https://bobbyprotocol.xyz');assert.equal(url.searchParams.get('lang'),'fr');assert.equal(url.searchParams.get('locale'),'fr-FR');for(const key of['country','symbol','timeframe','return_url'])assert.equal(url.searchParams.get(key),null);});
  const denied=await billingApi({action,language:'de',locale:'de-DE'},{signedIn:false});
  check(`${action}: localization does not bypass required sign-in`,()=>{assert.equal(denied.response.statusCode,401);assert.equal(denied.requests.length,0);});
}

check('automatic web language uses first supported preference and does not become a manual choice',()=>{
  const b=browser('fr','fr-FR');b.go('/desk');Object.assign(b.context.navigator,{language:'nl-NL',languages:['nl-NL','de-DE','fr-FR']});const client=b.load('src/lib/client-language.ts');assert.equal(client.clientLanguage(),'de');assert.equal(client.clientLocale(),'de-DE');client.rememberQueryLanguage();assert.equal(b.storage.size,0);
  b.context.navigator.languages=['nl-NL','pt-BR'];assert.equal(client.clientLanguage(),'pt');assert.equal(client.clientLocale(),'pt-BR');b.go('/desk?lang=unsupported&locale=de-DE');client.rememberQueryLanguage();assert.equal(b.storage.size,0);
});
check('locale routes cannot attach interface parameters to external or protocol-relative destinations',()=>{
  const client=browser('fr','fr-FR').load('src/lib/client-language.ts');for(const destination of['https://example.test','//example.test/path','mailto:support@example.test'])assert.equal(client.clientLanguagePath(destination),destination);
});
console.log(JSON.stringify({result:'PASS',checks,scope:'actual desk mic callback, both OAuth consumers, callback router, risk/legal links, root effect and billing failure flow',realProviderRequests:0,realPaymentRequests:0,microphoneRequests:0},null,2));
