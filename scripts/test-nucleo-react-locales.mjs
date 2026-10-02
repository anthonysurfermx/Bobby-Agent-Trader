// Exercise shipping React data/consent code in an isolated browser shim. No network, audio or paid requests.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require=createRequire(import.meta.url);
const jsx=require('react/jsx-runtime');
let checks=0;
function check(name,fn){fn();checks++;console.log('ok - '+name);}
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const clean=x=>JSON.parse(JSON.stringify(x));
function browser(language='fr',preferred='fr-FR',navigatorPreferred=preferred){
 const saved=new Map([['bobby_lang',language],['bobby_locale',preferred]]), requests=[];
 const location={origin:'https://bobby.test',search:'',href:'https://bobby.test/desk',assign:(value)=>{location.assigned=value;}};
 const ctx=vm.createContext({console, Intl, URL, URLSearchParams, navigator:{language:navigatorPreferred},window:{location},document:{documentElement:{lang:'es'}},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v))},fetch:async(url,init)=>{requests.push({url,init});return new Response(JSON.stringify({agents:{alpha:'A',red:'R',cio:'C',verdict:'wait',direction:'none'},level:'rapido'}),{headers:{'content-type':'application/json'}});},Response,AbortController,DOMException,TextDecoder,requestAnimationFrame:fn=>{fn();return 0;},setTimeout,clearTimeout});
 const loaded=new Map();let ack=[false,false,false,false];
 const stubs={
  react:{Component:class { constructor(props){this.props=props;this.state={};} },useState:init=>[Array.isArray(init)?ack:typeof init==='function'?init():init,()=>{}],useEffect:()=>{},useMemo:fn=>fn(),useCallback:fn=>fn,useId:()=> 'test-id',useRef:init=>({current:init}),useSyncExternalStore:(_sub,get)=>get()},
  'react/jsx-runtime':jsx,
  'react-router-dom':{Link:'a',useLocation:()=>location,useNavigate:()=>()=>{},useSearchParams:()=>[new URLSearchParams(location.search)]},
  wagmi:{useAccount:()=>({address:undefined}),usePublicClient:()=>null,useSendTransaction:()=>({sendTransactionAsync:()=>{throw new Error('Wallet signing must be explicitly invoked');}}),useSwitchChain:()=>({switchChainAsync:()=>{}})},
  'framer-motion':{motion:new Proxy({},{get:(_object,key)=>String(key)}),AnimatePresence:'fragment'},
  '@/components/adams/VoiceRoom':{VoiceRoom:()=>{throw new Error('VoiceRoom must not be invoked before consent');}},
  '@/components/adams/AdamsChat':{AdamsChat:()=>{throw new Error('AdamsChat must not be invoked before consent');}},
  '@/components/adams/ProactiveNotification':{ProactiveNotification:()=>null},
  '@/components/companion/SignInPrompt':{default:()=>null},
  '@/components/kinetic/BobbyMascot3D':{default:()=>null},
  './MarketCanvas':{MarketCanvas:()=>null},
  '@/hooks/useRealtimeVoice':{useRealtimeVoice:()=>{throw new Error('Live voice hook must not be invoked by gate checks');}},
  '@/config/chains':{BASE:{explorerUrl:'https://basescan.org',explorerName:'Basescan'},BASE_CHAIN_ID:8453},
  '@/lib/base-swap/calldata-guard':{},
  '@/lib/base-swap/quote-guard':{},
  '@/lib/base-swap/tokens':{BASE_SWAP_LIMITS:{slippageBps:50},findBaseToken:()=>null,isStockToken:()=>false},
  '@/hooks/useBobbySession':{useBobbySession:()=>({ready:false,session:null})},
  '@/styles/nucleo-desk.css':{},
  'react-helmet-async':{Helmet:()=>null},
  'lucide-react':new Proxy({},{get:()=>()=>null}),
  '@/lib/companions/sfx':{sfxSuccess:()=>{},sfxTock:()=>{}},
  '@/components/companion/NucleoSphere':{default:()=>null},
  './LangMenu':{default:()=>null},
  '@/lib/desk-request':{deskJson:async(url,init)=>{requests.push({url,init});return{ok:true,data:url.includes('asset-search')?{resolved:{baseSymbol:'MC.PA',displayName:'LVMH',assetClass:'equity',currency:'EUR',exchange:'Euronext Paris'}}:{market:{price:225.1,currency:'EUR'},technicals:{price:225.1,rsi14:50,trend:'bullish',support:220,resistance:230},technical_pulse:{signal:'wait',direction:'none'}}};}},
  '@/lib/access-client':{accessHeaders:async()=>({})},
 };
 function load(file){if(loaded.has(file))return loaded.get(file);const module={exports:{}};loaded.set(file,module.exports);const extra=file==='src/pages/BobbyRedeemPage.tsx'?'\nexports.__localization = { COPY, RESULT, giftLine, pageLang };':file==='src/components/adams/VoiceRoom.tsx'?'\nexports.__localization = { voiceStateCopy, formatDeskNumber, assetLabel };':file==='src/components/adams/SwapConfirm.tsx'?'\nexports.__localization = { localizedSwapError };':file==='src/components/adams/AdamsChat.tsx'?'\nexports.__localization = { technicalPrice, marketMoodLabel };':'';const src=ts.transpileModule(read(file).replaceAll('import.meta.env.DEV','false')+extra,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const request=(name)=>{if(name in stubs)return stubs[name];const aliases={'@/lib/companions/i18n':'src/lib/companions/i18n.ts','@/lib/companions/progress':'src/lib/companions/progress.ts','@/lib/desk-price':'src/lib/desk-price.ts','@/lib/companions/data':'src/lib/companions/data.ts','@/components/nucleo/NucleoRisk':'src/components/nucleo/NucleoRisk.tsx','@/lib/voice-assets':'src/lib/voice-assets.ts','@/lib/realtime-context':'src/lib/realtime-context.ts','@/lib/mascot':'src/lib/mascot.ts'};if(name in aliases)return load(aliases[name]);if(name.startsWith('.')||name.startsWith('@/')){const target=(name.startsWith('@/')?'src/'+name.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(file),name))).replace(/\.js$/,'');for(const candidate of [target,target+'.ts',target+'.tsx']){if(fs.existsSync(path.join(root,candidate)))return load(candidate);}}throw new Error('Unexpected module '+name+' from '+file);};
  vm.runInContext('(function(require,module,exports){'+src+'\n})',ctx,{filename:file})(request,module,module.exports);loaded.set(file,module.exports);return module.exports;
 }
 return{load,saved,requests,location,context:ctx,loaded,setAck:value=>{ack=value;},stubs};
}
function elements(node){if(!node||typeof node!=='object')return[];return[node,...[node.props?.children].flat(3).flatMap(elements)];}
const locales=[['en','en-US'],['es','es-MX'],['fr','fr-FR'],['pt','pt-PT'],['pt','pt-BR'],['it','it-IT'],['de','de-DE']];
for(const [language,locale] of [['en','en-US'],['es','es-MX'],['fr','fr-FR'],['pt','pt-PT'],['pt','pt-BR'],['it','it-IT'],['de','de-DE']]){
 const b=browser(language,locale),i=b.load('src/lib/companions/i18n.ts'),progress=b.load('src/lib/companions/progress.ts');
 check(locale+': selected language resolves dynamic UI text and local dates',()=>{assert.equal(i.speechLocale(),locale);const rendered=i.t('Accept all four · 3/4','Acepta los cuatro · 3/4');assert.ok(rendered.includes('3/4'));if(!['en','es'].includes(language))assert.ok(!rendered.includes('Accept all four'));});
 check(locale+': native/account consent cannot grant browser AI permission',()=>{const p=progress.progressStore;assert.equal(p.get().aiConsentGranted,false);p.applyServer({...p.get(),riskNoticeVersion:99});assert.equal(p.get().aiConsentGranted,false);p.acceptRiskNotice();assert.equal(p.get().aiConsentGranted,true);p.withdrawAIConsent();p.applyServer({...p.get(),riskNoticeVersion:99});assert.equal(p.get().aiConsentGranted,false);});
 const Risk=b.load('src/components/nucleo/NucleoRisk.tsx').default;
 check(locale+': fourth AI acknowledgement gates entry after three checks',()=>{b.setAck([true,true,true,false]);const tree=elements(Risk({}));const acknowledgements=tree.filter(e=>typeof e.props?.['aria-pressed']==='boolean');assert.equal(acknowledgements.length,4);const action=tree.find(e=>e.props?.className?.includes('n-cta'));assert.equal(action.props.disabled,true);b.setAck([true,true,true,true]);const accepted=elements(Risk({})).find(e=>e.props?.className?.includes('n-cta'));assert.equal(accepted.props.disabled,false);accepted.props.onClick();assert.equal(progress.progressStore.get().aiConsentGranted,true);});
 const desk=b.load('src/components/nucleo/deskData.ts');
 const answer={symbol:'MC.PA',currency:'EUR',price:225.1,trend:'bullish',momentum:'neutral',rsi:50,support:220,resistance:230,atrPct:null,regime:null,signal:'long',direction:'long',convictionPct:65,entry:225,stop:220,target:240,rewardRisk:3,overview:null,error:false,gate:null,access:null};
 check(locale+': actual chart/read lines retain EUR and translate variable phrases',()=>{const result=desk.debateFor(answer);assert.match(result.stances[0].line,/€|EUR/);assert.ok(!result.stances[0].line.includes('$'));assert.ok(result.spoken.includes('225'));if(!['en','es'].includes(language)){assert.ok(!result.stances[0].line.includes('setup:'));assert.ok(!result.spoken.includes('Reference only'));assert.ok(!result.stances[1].line.includes('Thesis breaks'));}});
 const resolved=await desk.resolveAsset('LVMH');
 check(locale+': search keeps an explicit instrument, region and real quote metadata',()=>{assert.equal(resolved.snapshot.symbol,'MC.PA');assert.equal(resolved.snapshot.currency,'EUR');const p=JSON.parse(b.requests.at(-1).init.body);assert.equal(p.q,'LVMH');assert.equal(p.language,language);assert.equal(p.locale,locale);assert.equal(p.country,locale.split('-')[1]);});
 const run=await desk.runDebate('MC.PA',new AbortController().signal);
 check(locale+': market engine request carries all locale fields',()=>{const p=JSON.parse(b.requests.at(-1).init.body);assert.equal(p.args.symbol,'MC.PA');assert.equal(p.args.language,language);assert.equal(p.args.locale,locale);assert.equal(run.currency,'EUR');});
 await desk.runAgents('MC.PA',true,'LVMH',new AbortController().signal);
 check(locale+': live desk request preserves selected voice region',()=>{const p=JSON.parse(b.requests.at(-1).init.body);assert.equal(p.symbol,'MC.PA');assert.equal(p.language,language);assert.equal(p.locale,locale);});
}
check('language selector changes a query-pinned language and keeps Portuguese region',()=>{const b=browser('fr','pt-BR');b.location.search='?lang=fr&locale=fr-FR';b.location.href='https://bobby.test/desk?lang=fr&locale=fr-FR';const menu=b.load('src/components/nucleo/LangMenu.tsx').LangSegment;const buttons=elements(menu()).filter(e=>e.type==='button');assert.equal(buttons.length,6);buttons.find(e=>e.props.children==='PT').props.onClick();assert.equal(b.saved.get('bobby_lang'),'pt');assert.equal(b.saved.get('bobby_locale'),'pt-BR');assert.equal(new URL(b.location.assigned).searchParams.get('lang'),'pt');assert.equal(new URL(b.location.assigned).searchParams.has('locale'),false);});
check('changing locale refreshes automatic suggestions while keeping personal assets',()=>{
 const persisted='bobby.companion.progress.v1';
 for(const [language,locale,symbols] of [['pt','pt-PT',['EDP.LS','GALP.LS','BTC']],['pt','pt-BR',['PETR4.SA','VALE3.SA','BTC']],['it','it-IT',['ENI.MI','ENEL.MI','BTC']],['de','de-DE',['SAP.DE','SIE.DE','BTC']]]){
  const b=browser(language,locale);b.saved.set(persisted,JSON.stringify({quickAccess:['MC.PA','TTE.PA','BTC'],aiConsentGranted:false}));
  const p=b.load('src/lib/companions/progress.ts').progressStore;assert.deepEqual(clean(p.get().quickAccess),symbols);assert.equal(p.get().quickAccessCustomized,false);
  p.setQuickAccess(['AAPL','MC.PA','BTC']);assert.equal(p.get().quickAccessCustomized,true);
  const next=browser('fr','fr-FR');next.saved.set(persisted,b.saved.get(persisted));assert.deepEqual(clean(next.load('src/lib/companions/progress.ts').progressStore.get().quickAccess),['AAPL','MC.PA','BTC']);
 }
});
check('selected market locale overrides browser language and explicit country remains available',()=>{
 const b=browser('pt','pt-PT','fr-FR');b.load('src/lib/companions/i18n.ts');b.location.search='?lang=pt';
 const d=b.load('src/components/nucleo/deskData.ts');assert.equal(d.marketContext().country,'PT');
 b.location.search='?lang=pt&country=BR';assert.equal(d.marketContext().country,'BR');
});
check('coupon copy and gifts are complete in all six languages without modifying balances',()=>{
 const b=browser(),{COPY,RESULT,giftLine}=b.load('src/pages/BobbyRedeemPage.tsx').__localization;
 for(const language of ['en','es','fr','pt','it','de']){
  for(const entry of [...Object.values(COPY),...Object.values(RESULT)]){assert.equal(typeof entry[language],'string');assert.ok(entry[language].length>0);if(['fr','pt','it','de'].includes(language))assert.notEqual(entry[language],entry.en);}
  const gift={reads:7,profundo:2,maximo:1};const rendered=giftLine(gift,language);assert.match(rendered,/7/);assert.match(rendered,/2/);assert.match(rendered,/1/);assert.deepEqual(gift,{reads:7,profundo:2,maximo:1});if(['fr','pt','it','de'].includes(language))assert.ok(!rendered.includes('reads'));
 }
});
check('browser disclosure distinguishes externally processed dictation and wallet signing',()=>{const web=JSON.parse(read('nucleo/web/risk-notice.json')),native=JSON.parse(read('nucleo/native/risk-notice.json'));assert.equal(web.version,7);assert.equal(native.version,5);for(const language of ['en','es','fr','pt','it','de']){assert.equal(web.statements[language].length,4);assert.ok(web.statements[language][0].body.includes('OpenAI'));assert.ok(!web.statements[language][0].body.includes('iPhone'));assert.ok(web.statements[language][2].body.includes('Base'));}});
for(const [language,locale] of locales){
 const b=browser(language,locale),progress=b.load('src/lib/companions/progress.ts'),Page=b.load('src/pages/BobbyAgentTraderPage.tsx').default;
 b.location.search='?start=1';
 const Voice=b.stubs['@/components/adams/VoiceRoom'].VoiceRoom;
 const Chat=b.stubs['@/components/adams/AdamsChat'].AdamsChat;
 const containsVoiceOrChat=tree=>elements(tree).some(e=>e.type===Voice||e.type===Chat);
 check(locale+': old browser consent never mounts autoStart voice or chat',()=>{
  assert.equal(progress.RISK_NOTICE_VERSION,7);
  b.saved.set('bobby.companion.progress.v1',JSON.stringify({aiConsentGranted:true,riskNoticeVersion:6}));
  // The store is local and already loaded; an account/native merge cannot grant current permission.
  progress.progressStore.withdrawAIConsent();progress.progressStore.applyServer({riskNoticeVersion:99});
  assert.equal(containsVoiceOrChat(Page()),false);assert.equal(b.requests.length,0);
  const fresh=browser(language,locale);fresh.saved.set('bobby.companion.progress.v1',JSON.stringify({aiConsentGranted:true,riskNoticeVersion:6}));fresh.location.search='?start=1';
  const freshPage=fresh.load('src/pages/BobbyAgentTraderPage.tsx').default;
  assert.equal(elements(freshPage()).some(e=>e.type===fresh.stubs['@/components/adams/VoiceRoom'].VoiceRoom),false);assert.equal(fresh.requests.length,0);
 });
 check(locale+': accepting current notice mounts requested autoStart, withdrawal unmounts it',()=>{
  progress.progressStore.acceptRiskNotice();
  const node=elements(Page()).find(e=>e.type===Voice);assert.ok(node);assert.equal(node.props.autoStart,true);
  progress.progressStore.withdrawAIConsent();assert.equal(containsVoiceOrChat(Page()),false);assert.equal(b.requests.length,0);
 });
 const voice=b.load('src/components/adams/VoiceRoom.tsx').__localization;
 check(locale+': voice status, numbers and equity labels use the selected locale',()=>{
  for(const state of ['idle','connecting','listening','thinking','speaking','error']){
   const copy=voice.voiceStateCopy(state);assert.ok(copy.label&&copy.hint);
   if(['fr','pt','it','de'].includes(language))assert.notEqual(copy.label,({idle:'Idle',connecting:'Connecting',listening:'Listening',thinking:'Processing',speaking:'Bobby is speaking',error:'Voice paused'})[state]);
  }
  assert.equal(voice.formatDeskNumber(1234.56),(1234.56).toLocaleString(locale,{maximumFractionDigits:2}));
  assert.equal(voice.assetLabel('MC.PA'),'LVMH · MC.PA');assert.equal(voice.assetLabel('BTC'),'BTC/USDT');assert.equal(voice.assetLabel('UNLISTED'),'UNLISTED');
 });
 const swap=b.load('src/components/adams/SwapConfirm.tsx');
 check(locale+': swap cards require explicit acknowledgement before building or signing',()=>{
  const trade={tokenSymbol:'ETH',amountUsd:5,confidence:0.7,sizingMethod:'fixed',chain:'Base',intent:{tokenIn:'USDC',tokenOut:'ETH',amount:'5',cycleId:'test',wallet:'',expiresAt:9999999999,jti:'test',intentToken:'test',preview:{amountOut:'0.001',minAmountOut:'0.001',executionPrice:5000,priceImpactPct:0,route:{description:'Uniswap'},venue:{name:'Uniswap',router:'0x0'},stockReference:null,warnings:[],limits:{maxTicketUsd:5}}}};
  const tree=elements(swap.SwapConfirm({trade})),checkbox=tree.find(e=>e.type==='input'&&e.props.type==='checkbox');assert.ok(checkbox);assert.equal(checkbox.props.checked,false);
  const build=tree.find(e=>e.type==='button'&&e.props.disabled===true);assert.ok(build);assert.equal(b.requests.length,0);
 });
}
check('live voice disclosure names microphone audio and OpenAI explicitly in every language',()=>{
 const web=JSON.parse(read('nucleo/web/risk-notice.json'));
 for(const language of ['en','es','fr','pt','it','de']){const body=web.statements[language][0].body;assert.match(body,/OpenAI/);assert.match(body,({en:/microphone audio/,es:/audio del micrófono/,fr:/audio du microphone/,pt:/áudio do microfone/,it:/audio del microfono/,de:/Mikrofon-Audio/})[language]);}
 assert.equal(JSON.parse(read('ios/Bobby/Nucleo/fixtures/native/risk-notice.json')).version,5);
});
check('formal browser catalogue preserves placeholders and resolves every maintained key',()=>{
 const rows=JSON.parse(read('src/lib/companions/web-translations-extra.json'));
 for(const language of ['fr','pt','it','de']){const i=browser(language).load('src/lib/companions/i18n.ts');for(const [key,translations] of Object.entries(rows)){assert.equal(typeof translations[language],'string',key);assert.deepEqual(translations[language].match(/\{\d+\}/g)?.sort()??[],key.match(/\{\d+\}/g)?.sort()??[],key);assert.equal(i.translatedEnglish(key,language),translations[language],language+': '+key);}}
});

function adamsFixture(language='fr',locale='fr-FR',holdChat=false){
 const b=browser(language,locale),callbacks=[],effects=[],states=[];
 const noop=()=>{};
 b.context.window.matchMedia=()=>({matches:true,addEventListener:noop,removeEventListener:noop});
 b.context.window.history={replaceState:noop};
 b.context.fetch=async(url,init)=>{
  b.requests.push({url,init});
  if(holdChat&&String(url)==='/api/openclaw-chat')return new Promise((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new DOMException('Consent withdrawn','AbortError')),{once:true}));
  if(String(url)==='/api/openclaw-chat')return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Original server transcript'}}]})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
  return new Response('[]',{headers:{'content-type':'application/json'}});
 };
 b.stubs.react.useState=init=>{let value=typeof init==='function'?init():init;const index=states.length;states.push(value);return[value,next=>{value=typeof next==='function'?next(value):next;states[index]=value;}];};
 b.stubs.react.useCallback=fn=>{callbacks.push(fn);return fn;};
 b.stubs.react.useEffect=fn=>{effects.push(fn);};
 Object.assign(b.stubs,{
  '@reown/appkit/react':{useAppKit:()=>({open:noop})},
  '@/components/agent-radar/AdvisorSetup':{AdvisorSetup:noop,useAdvisorProfile:()=>({profile:null,needsSetup:false,saveNewProfile:noop,isConnected:false})},
  '@/services/okx-market.service':{fetchTickers:async()=>[],fetchMarketDetail:async()=>null,formatVolume:()=>''},
  './SwapConfirm':{SwapConfirm:noop},'./TradingModeSelector':{default:noop},'./VoiceOrb':{VoiceOrb:noop},
  './IntelligenceFeed':{IntelligenceFeed:noop},'./ConvictionBoard':{ConvictionBoard:noop},'./FeedbackWidget':{FeedbackWidget:noop},'./ExecutionTimeline':{ExecutionTimeline:noop},
  '@/lib/router/detectIntent':{STOCK_MAP:{},TOKEN_MAP:{},detectIntent:()=> 'chat',detectStocks:()=>[],detectTokens:()=>[]},
  '@/hooks/useBobbyVoice':{useBobbyVoice:()=>({speak:noop,speakLocal:noop,queueSentence:noop,flushQueue:noop,stop:noop,initVoiceContext:noop,getLastResponseAudio:()=>null,clearResponseAudio:noop,hasResponseAudio:false,voiceBlocked:false,isSpeaking:false,analyser:null})},
  '@/hooks/useAuth':{useAuth:()=>({isAuthenticated:true,signOut:noop})},
  '@/lib/bobby-session':{sessionFetch:async()=>null,sessionHeaders:()=>({})},
  '@/lib/bobby-vibe':{clearStoredVibe:noop,getStoredVibe:()=>null,inferUserVibe:()=>null,saveStoredVibe:noop,shouldClearStoredVibe:()=>false},
  '@/lib/bobby-db-client':{BOBBY_DB_URL:'',BOBBY_DB_ANON:''},
  recharts:new Proxy({},{get:()=>noop}),
 });
 const progress=b.load('src/lib/companions/progress.ts').progressStore;
 progress.acceptRiskNotice();
 b.load('src/components/adams/AdamsChat.tsx').AdamsChat({textOnly:true});
 const send=callbacks.find(fn=>fn.toString().includes('const msg = (text || inputText).trim()'));
 const toggleListening=callbacks.find(fn=>fn.toString().includes('const SpeechRecognitionAPI'));
 const dispose=effects.find(fn=>fn.toString().includes('mountedRef.current = true'))();
 assert.ok(send);assert.ok(toggleListening);assert.equal(typeof dispose,'function');
 return{...b,progress,send,toggleListening,dispose,states};
}
async function asyncCheck(name,fn){await fn();checks++;console.log('ok - '+name);}
await asyncCheck('[DEMO] remains user text and never forces approval or conviction',async()=>{
 const normal=adamsFixture(),demo=adamsFixture();
 await normal.send('Explain your approach');await demo.send('Explain your approach [DEMO]');
 const original=JSON.parse(normal.requests.find(r=>r.url==='/api/openclaw-chat').init.body);
 const marked=JSON.parse(demo.requests.find(r=>r.url==='/api/openclaw-chat').init.body);
 assert.ok(marked.message.startsWith('Explain your approach [DEMO]'));
 assert.equal(marked.message.replace(' [DEMO]',''),original.message);
 assert.doesNotMatch(marked.message,/HACKATHON DEMO OVERRIDE|MUST APPROVE|DO NOT REJECT|9\/10/);
 assert.ok(demo.states.some(state=>Array.isArray(state)&&state.some(message=>message?.text==='Original server transcript')));
 assert.deepEqual(marked.history,original.history);assert.equal(marked.language,'fr');assert.equal(marked.locale,'fr-FR');assert.equal(marked.country,'FR');
 normal.dispose();demo.dispose();
});
await asyncCheck('withdrawing consent aborts pending chat and suppresses all later AI sends',async()=>{
 const b=adamsFixture('pt','pt-BR',true);const pending=b.send('Explain your approach');
 for(let i=0;i<30&&!b.requests.some(r=>r.url==='/api/openclaw-chat');i++)await Promise.resolve();
 const request=b.requests.find(r=>r.url==='/api/openclaw-chat');assert.ok(request);assert.equal(request.init.signal.aborted,false);
 b.progress.withdrawAIConsent();b.dispose();assert.equal(request.init.signal.aborted,true);await pending;
 const count=b.requests.length;await b.send('Explain your approach [DEMO]');assert.equal(b.requests.length,count);
});
check('regional charts retain provider currency and never invent a dollar price for unknown equities',()=>{
 const b=adamsFixture('fr','fr-FR'),format=b.load('src/components/adams/AdamsChat.tsx').__localization.technicalPrice;
 assert.match(format(225.1,'MC.PA','EUR'),/€|EUR/);assert.doesNotMatch(format(225.1,'MC.PA','EUR'),/\$/);
 assert.doesNotMatch(format(225.1,'MC.PA'),/USD|\$/);assert.equal(format(225.1,'MC.PA'),(225.1).toLocaleString('fr-FR',{maximumFractionDigits:2}));b.dispose();
});
check('dictation uses the selected locale and aborts when the consent gate unmounts chat',()=>{
 const b=adamsFixture('pt','pt-BR');let started=0,aborted=0,recognition;
 b.context.window.SpeechRecognition=class {constructor(){recognition=this;}start(){started++;}stop(){}abort(){aborted++;}};
 b.toggleListening();assert.equal(started,1);assert.equal(recognition.lang,'pt-BR');
 b.progress.withdrawAIConsent();b.dispose();assert.equal(aborted,1);
 b.toggleListening();assert.equal(started,1);assert.equal(b.requests.length,0);
});

function voiceFallbackFixture({query,stored='en',storedLocale='en-US',device='en-US',deniedStorage=false}){
 const b=browser(stored,storedLocale,device),effects=[],navigations=[],transcript=[{id:'original',role:'user',text:'Original market question'}];
 let fallback=false,dismissed=0,disconnected=0;
 if(!stored){b.saved.delete('bobby_lang');b.saved.delete('bobby_locale');}
 b.saved.set('bobby.companion.progress.v1',JSON.stringify({aiConsentGranted:true,riskNoticeVersion:7,quickAccess:['BNP.PA','AAPL','BTC'],quickAccessCustomized:true}));
 if(deniedStorage)Object.defineProperty(b.context,'localStorage',{get(){throw new DOMException('Storage denied','SecurityError');}});
 b.location.search=query;b.location.pathname='/agentic-world/bobby/voice-room';
 b.stubs.react.useEffect=fn=>effects.push(fn);
 b.stubs['react-router-dom'].useNavigate=()=>((url,options)=>navigations.push({url,options}));
 const forbidden=()=>{throw new Error('Routing checks must not activate audio or voice transport');};
 b.stubs['@/hooks/useRealtimeVoice']={useRealtimeVoice:(_language,_mode,options)=>({
  state:'idle',error:null,level:0,transcript,tools:[],proposal:null,fallback,needsSignIn:true,remainingSeconds:0,
  symbol:options.initialSymbol,timeframe:options.initialTimeframe,levels:[],thesis:null,debate:null,deskBrief:null,briefState:{status:'idle'},
  connect:forbidden,disconnect:()=>disconnected++,startTalking:forbidden,stopTalking:forbidden,micMuted:true,setSymbol:forbidden,setTimeframe:forbidden,dismissProposal:forbidden,resetConversation:forbidden,dismissSignIn:()=>dismissed++,
 })};
 const component=b.load('src/components/adams/VoiceRoom.tsx').VoiceRoom;
 function render(active){fallback=active;effects.length=0;const tree=component();const effect=effects.find(fn=>fn.toString().includes('if (!fallback)'));assert.ok(effect);return{tree,effect};}
 return{...b,render,navigations,transcript,dismissed:()=>dismissed,disconnected:()=>disconnected};
}
for(const scenario of [
 {name:'pt-BR query over English storage',query:'?lang=pt&locale=pt-BR&country=BR&symbol=BNP.PA&timeframe=4H',language:'pt',locale:'pt-BR',country:'BR'},
 {name:'French query with explicit Brazilian market',query:'?lang=fr&country=BR&symbol=BNP.PA&timeframe=4H',language:'fr',locale:'fr-FR',country:'BR'},
 {name:'Italian query rejects incompatible Portuguese locale',query:'?lang=it&locale=pt-BR&symbol=BNP.PA&timeframe=4H',language:'it',locale:'it-IT',country:'IT'},
 {name:'German query over French storage',query:'?lang=de&symbol=BNP.PA&timeframe=4H',stored:'fr',storedLocale:'fr-FR',language:'de',locale:'de-DE',country:'DE'},
 {name:'saved pt-BR over French browser',query:'?symbol=BNP.PA&timeframe=4H',stored:'pt',storedLocale:'pt-BR',device:'fr-FR',language:'pt',locale:'pt-BR',country:'BR'},
 {name:'French browser without a saved choice',query:'?symbol=BNP.PA&timeframe=4H',stored:'',device:'fr-FR',language:'fr',locale:'fr-FR',country:'FR'},
 {name:'regional language query over English storage',query:'?lang=pt-BR&symbol=BNP.PA&timeframe=4H',language:'pt',locale:'pt-BR',country:'BR'},
 {name:'pt-BR query with storage denied',query:'?lang=pt&locale=pt-BR&symbol=BNP.PA&timeframe=4H',deniedStorage:true,language:'pt',locale:'pt-BR',country:'BR'},
])check(scenario.name+': fallback, sign-in close and back preserve locale and a custom stock',()=>{
 const b=voiceFallbackFixture(scenario),before=[...b.saved];
 const idle=b.render(false);idle.effect();assert.equal(b.navigations.length,0);
 const signIn=elements(idle.tree).find(e=>e.type===b.stubs['@/components/companion/SignInPrompt'].default);assert.ok(signIn);signIn.props.onClose();assert.equal(b.dismissed(),1);
 b.render(true).effect();assert.equal(b.navigations.length,2);
 assert.equal(b.navigations[0].url,b.navigations[1].url);
 const i=b.load('src/lib/companions/i18n.ts'),back=elements(idle.tree).find(e=>e.type==='button'&&e.props['aria-label']===i.t('Back to desk','Volver al desk'));assert.ok(back);back.props.onClick();assert.equal(b.disconnected(),1);assert.equal(b.navigations.length,3);
 for(const [index,navigation] of b.navigations.entries()){
  const destination=new URL(navigation.url,'https://bobby.test');assert.equal(destination.pathname,'/desk');assert.equal(destination.searchParams.get('voice'),index===2?null:'free');
  assert.equal(destination.searchParams.get('symbol'),'BNP.PA');assert.equal(destination.searchParams.get('timeframe'),'4H');assert.equal(destination.searchParams.get('lang'),scenario.language);assert.equal(destination.searchParams.get('locale'),scenario.locale);
  assert.equal(destination.searchParams.get('country'),new URLSearchParams(scenario.query).get('country'));
  b.location.search=destination.search;
  const client=b.load('src/lib/client-language.ts');assert.equal(client.clientLanguage(),scenario.language);assert.equal(client.clientLocale(),scenario.locale);
  assert.equal(b.load('src/components/nucleo/deskData.ts').marketContext().country,scenario.country);
 }
 assert.equal(b.navigations[1].options.replace,true);assert.equal(b.navigations[1].options.state.voiceFallback,true);assert.equal(b.navigations[1].options.state.transcript,b.transcript);
 assert.deepEqual([...b.saved],before);assert.equal(b.requests.length,0);
});


function renderRootLayout(b){
 const source=ts.createSourceFile('App.tsx',read('src/App.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const node=source.statements.find(item=>ts.isFunctionDeclaration(item)&&item.name?.text==='RootLayout');assert.ok(node);
 const code=ts.transpileModule(node.getText(source),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const factory=vm.runInContext('(function(require,React,useLocation,clientLocale,Helmet,ThemeProvider,Web3ContextProvider,AuthProvider,Outlet,ScrollRestoration,Toaster,Analytics){const exports={};'+code+';return RootLayout;})',b.context);
 const component=factory(name=>{assert.equal(name,'react/jsx-runtime');return jsx;},b.stubs.react,b.stubs['react-router-dom'].useLocation,b.load('src/lib/client-language.ts').clientLocale,'Helmet','ThemeProvider','Web3ContextProvider','AuthProvider','Outlet','ScrollRestoration','Toaster','Analytics');
 return component();
}
for(const [language,locale] of locales){
 const b=browser(language,locale);b.location.search='?lang='+language;
 check(locale+': common root declares the full locale across desk, voice and record navigation',()=>{
  for(const route of ['/desk','/agentic-world/bobby/voice-room','/record']){b.location.pathname=route;const head=elements(renderRootLayout(b)).find(e=>e.props?.htmlAttributes);assert.equal(head.props.htmlAttributes.lang,locale);assert.equal(b.requests.length,0);}
 });
 check(locale+': Privacy and Support keep the same regional HTML language',()=>{
  b.stubs['@/components/protocol/NucleoTopBar']={default:()=>null};b.stubs['@/hooks/useNucleoPages']={useNucleoPages:()=>{}};b.stubs['@/components/kinetic/KineticShell']={default:()=>null};
  for(const route of ['src/pages/PrivacyPage.tsx','src/pages/BobbySupportPage.tsx']){const head=elements(b.load(route).default()).find(e=>e.type==='html');assert.equal(head.props.lang,locale);}assert.equal(b.requests.length,0);
 });
}
await asyncCheck('language setters wait for the query update and preserve Portuguese Brazil on the same page',async()=>{
 const b=browser('fr','pt-BR');b.location.search='?lang=fr&locale=fr-FR';
 const i=b.load('src/lib/companions/i18n.ts'),client=b.load('src/lib/client-language.ts');client.syncDocumentLanguage();assert.equal(b.context.document.documentElement.lang,'fr-FR');
 i.setLang('pt');i.setLocale('pt-BR');b.location.search='?lang=pt';await Promise.resolve();
 assert.equal(b.context.document.documentElement.lang,'pt-BR');assert.equal(elements(renderRootLayout(b)).find(e=>e.props?.htmlAttributes).props.htmlAttributes.lang,'pt-BR');
 b.location.search='?lang=de&locale=pt-BR';client.syncDocumentLanguage();assert.equal(b.context.document.documentElement.lang,'de-DE');
 b.location.search='?lang=pt-PT';client.syncDocumentLanguage();assert.equal(b.context.document.documentElement.lang,'pt-PT');
 b.location.search='?lang=pt&locale=pt-BR';client.syncDocumentLanguage();assert.equal(b.context.document.documentElement.lang,'pt-BR');assert.equal(b.requests.length,0);
});
await asyncCheck('denied storage preserves query and device locale without requesting permissions',async()=>{
 const b=browser('fr','fr-FR','pt-BR');
 b.context.localStorage={getItem(){throw new DOMException('Storage denied','SecurityError');},setItem(){throw new DOMException('Storage denied','SecurityError');}};
 b.location.search='?lang=de&locale=pt-BR';
 const client=b.load('src/lib/client-language.ts'),i=b.load('src/lib/companions/i18n.ts');
 client.syncDocumentLanguage();assert.equal(b.context.document.documentElement.lang,'de-DE');
 i.setLang('pt');i.setLocale('pt-BR');b.location.search='?lang=pt-BR';await Promise.resolve();
 assert.equal(b.context.document.documentElement.lang,'pt-BR');
 assert.equal(elements(renderRootLayout(b)).find(e=>e.props?.htmlAttributes).props.htmlAttributes.lang,'pt-BR');
 b.location.search='';client.syncDocumentLanguage();assert.equal(client.clientLanguage(),'pt');assert.equal(b.context.document.documentElement.lang,'pt-BR');
 assert.equal(b.requests.length,0);
});
check('blocked storage and absent AI consent still declare German without mounting voice or requesting a microphone',()=>{
 const b=browser('de','de-DE');let microphoneRequests=0;
 Object.defineProperty(b.context,'localStorage',{get(){throw new DOMException('Storage denied','SecurityError');}});
 b.context.navigator.mediaDevices={getUserMedia(){microphoneRequests++;throw new Error('Microphone must not be requested');}};
 b.context.window.SpeechRecognition=class {constructor(){microphoneRequests++;throw new Error('Recognition must not be started');}};
 b.location.search='?lang=de&start=1';
 const client=b.load('src/lib/client-language.ts'),progress=b.load('src/lib/companions/progress.ts'),Page=b.load('src/pages/BobbyAgentTraderPage.tsx').default;
 client.syncDocumentLanguage();assert.equal(b.context.document.documentElement.lang,'de-DE');assert.equal(progress.progressStore.get().aiConsentGranted,false);
 const tree=elements(Page());assert.ok(!tree.some(e=>e.type===b.stubs['@/components/adams/VoiceRoom'].VoiceRoom||e.type===b.stubs['@/components/adams/AdamsChat'].AdamsChat));
 assert.equal(elements(renderRootLayout(b)).find(e=>e.props?.htmlAttributes).props.htmlAttributes.lang,'de-DE');assert.equal(microphoneRequests,0);assert.equal(b.requests.length,0);
});
check('the initial root locale resolver imports no translation catalogue or page dependencies',()=>{
 const b=browser('de','de-DE');assert.equal(b.load('src/lib/client-language.ts').clientLocale(),'de-DE');
 assert.deepEqual([...b.loaded.keys()].sort(),['src/lib/app-language.ts','src/lib/client-language.ts']);
 const app=ts.createSourceFile('App.tsx',read('src/App.tsx'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.ok(app.statements.some(item=>ts.isImportDeclaration(item)&&item.moduleSpecifier.text==='@/lib/client-language'));
 assert.ok(!app.statements.some(item=>ts.isImportDeclaration(item)&&item.moduleSpecifier.text==='@/lib/companions/i18n'));
});

console.log('\n'+checks+' React locale/consent checks passed');
