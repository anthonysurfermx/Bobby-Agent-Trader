import assert from 'node:assert/strict';
process.env.OPENAI_API_KEY = 'test-only';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
const { APP_LANGUAGES, appLanguage, appLocale, languageName } = await import('../src/lib/app-language.ts');
const { regionalDefaults, resolveRegionalStock } = await import('../src/lib/regional-stocks.ts');
const { normalizeAssetSymbol, isEquitySymbol } = await import('../src/lib/voice-assets.ts');
const { buildInstructions, resolveEdgeVoice } = await import('../api/_lib/tts.ts');
const { realtimeConfig } = await import('../api/_lib/realtime-config.ts');
const { loadDeskEvidence, runDeskDebate, publicTextViolation } = await import('../api/_lib/desk-debate.ts');
const { default: stockPrice } = await import('../api/stock-price.ts');
const { default: stockCandles } = await import('../api/stock-candles.ts');
const { default: search } = await import('../api/bobby-asset-search.ts');
const { default: desk } = await import('../api/desk-debate.ts');
const { factsOnlyNarrative, narrativeRequest, validateNarrative } = await import('../api/_lib/briefings/narrative.ts');
const { BRIEF_LANGUAGES } = await import('../api/_lib/briefings/types.ts');
const { translatedEnglish, lang: browserLanguage, locale: browserLocale } = await import('../src/lib/companions/i18n.ts');
const { WEB_TRANSLATIONS } = await import('../src/lib/companions/web-translations.ts');
let checks = 0;
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a,b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'content-type': 'application/json' } });
function response() { return { statusCode: 200, body: null as any, setHeader() {}, status(n: number) { this.statusCode=n;return this; }, json(v: unknown) { this.body=v;return this; } }; }
async function call(handler: Function, query: Record<string,unknown>, body?: Record<string,unknown>) {
  const res=response(); await handler({ method: body ? 'POST' : 'GET', query, body, headers: { origin:'https://bobbyprotocol.xyz' } },res);return res;
}
const original=globalThis.fetch;
try {
  // Supported BCP47 query/persistence preserves Portuguese region; invalid inputs fall through.
  const descriptors = new Map(['window','navigator','localStorage'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const saved = new Map<string,string>();
  const windowStub = {location:{search:'?lang=fr-FR'}};
  Object.defineProperties(globalThis,{window:{configurable:true,value:windowStub},navigator:{configurable:true,value:{language:'de-DE'}},localStorage:{configurable:true,value:{getItem:(key:string)=>saved.get(key) ?? null}}});
  try {
    eq(browserLanguage(),'fr'); eq(browserLocale(),'fr-FR');
    windowStub.location.search='?lang=pt-BR'; eq(browserLanguage(),'pt'); eq(browserLocale(),'pt-BR');
    windowStub.location.search=''; saved.set('bobby_lang','pt-BR'); eq(browserLanguage(),'pt'); eq(browserLocale(),'pt-BR');
    saved.set('bobby_lang','ja-JP'); windowStub.location.search='?lang=invalid'; eq(browserLanguage(),'de'); eq(browserLocale(),'de-DE');
    saved.set('bobby_lang','pt'); saved.set('bobby_locale','pt-PT'); windowStub.location.search='?lang=pt-BR'; eq(browserLocale(),'pt-BR');
  } finally { for(const [key,descriptor] of descriptors) { if(descriptor) Object.defineProperty(globalThis,key,descriptor); else delete (globalThis as any)[key]; } }
  eq(appLanguage('fr-FR'),'fr'); eq(appLanguage('de_DE'),'de'); eq(appLanguage('ja'),'en');
  eq(appLocale('pt','pt-BR'),'pt-BR'); eq(appLocale('pt','pt-PT'),'pt-PT'); eq(appLocale('fr','pt-BR'),'fr-FR');
  for (const [language,locale,symbol,currency] of [['fr','fr-FR','MC.PA','EUR'],['pt','pt-PT','EDP.LS','EUR'],['pt','pt-BR','PETR4.SA','BRL'],['it','it-IT','ENEL.MI','EUR'],['de','de-DE','SAP.DE','EUR']] as const) {
    eq(regionalDefaults(language,locale)[0].symbol,symbol); eq(regionalDefaults(language,locale)[0].currency,currency);
    eq(normalizeAssetSymbol(symbol),symbol); ok(isEquitySymbol(symbol));
    const result=await call(search,{}, { q:symbol, language,locale });
    eq(result.body.resolved.baseSymbol,symbol); eq(result.body.resolved.currency,currency); eq(result.body.resolved.instType,'EQUITY'); eq(result.body.resolution.needsConfirmation,false);
    const session=realtimeConfig({ lang:language,locale,autoLanguage:false });
    eq(session.audio.input.transcription.language,language); ok(session.instructions.includes(languageName(language,locale)));
    ok(buildInstructions(language,'wise','echo','mellow',locale).length>70);
  }
  eq(regionalDefaults('fr','fr-FR','DE')[0].symbol,'SAP.DE');
  eq(normalizeAssetSymbol('SAN.PA'),'SAN.PA'); eq(normalizeAssetSymbol('SAP'),'SAP'); eq(normalizeAssetSymbol('VALE'),'VALE'); eq(resolveRegionalStock('SAP'),null);
  eq(resolveRegionalStock('Ma réponse est oui ou non, or signifie une alternative'),null);
  eq(resolveRegionalStock('vale a pena esperar'),null); eq(resolveRegionalStock('Analyse LVMH et Siemens'),null);
  eq(resolveRegionalStock('Analyse LVMH'),regionalDefaults('fr')[0]);
  eq(resolveEdgeVoice('fr'),'fr-FR-DeniseNeural'); eq(resolveEdgeVoice('pt','cio',undefined,'pt-PT'),'pt-PT-RaquelNeural'); eq(resolveEdgeVoice('pt','cio',undefined,'pt-BR'),'pt-BR-FranciscaNeural');
  eq(resolveEdgeVoice('it'),'it-IT-ElsaNeural'); eq(resolveEdgeVoice('de'),'de-DE-KatjaNeural');
  for(const [language,word] of [['fr','français'],['pt','português'],['it','italiano'],['de','Deutsch']] as const) ok(buildInstructions(language).includes(word));
  for (const text of ['Les gains sont garantis.', 'C’est sans risque.', 'Profitti garantiti.', 'Questo è senza rischio.', 'Garantierte Gewinne.', 'Das ist risikofrei.']) eq(publicTextViolation(text),'guarantee');
  for (const text of ['Aucun rendement garanti.', 'Non ci sono profitti garantiti.', 'Keine garantierten Gewinne.']) eq(publicTextViolation(text),null);
  for (const text of ['Vous devriez acheter maintenant.', 'Dovresti comprare ora.', 'Du solltest jetzt kaufen.']) eq(publicTextViolation(text),'advice');
  for (const lang of APP_LANGUAGES) {
    const refusal=await call(desk,{}, {symbol:'MC.PA',question:'x'.repeat(1201),language:lang});
    eq(refusal.statusCode,400); eq(refusal.body.code,'question_too_long');
  }
  eq((await call(desk,{}, {symbol:'MC.PA',question:'Analyse',language:'ja'})).body.code,'invalid_request');
  // An uncurated regional listing is confirmed by the provider; failed discovery never becomes a crypto alias.
  let searchCalls = 0;
  globalThis.fetch=(async(input:string|URL)=>{ searchCalls++; ok(String(input).includes('/v1/finance/search?')); return json({quotes:[{symbol:'SAN.PA',shortname:'Sanofi',quoteType:'EQUITY'}]}); }) as typeof fetch;
  const sanofi=await call(search,{}, {q:'SAN.PA',language:'fr',locale:'fr-FR'}); eq(sanofi.body.resolved.symbol,'SAN.PA'); eq(sanofi.body.resolved.currency,'EUR'); eq(searchCalls,1);
  globalThis.fetch=(async()=>json({quotes:[{symbol:'NOPE',shortname:'Wrong exchange',quoteType:'CRYPTOCURRENCY'}]})) as typeof fetch;
  const unknown=await call(search,{}, {q:'UNKNOWN.PA',language:'fr'});eq(unknown.body.resolved,null);eq(unknown.body.results,[]);
  // Quotes are actual provider currency/time; missing price and mismatched identity/currency stay unavailable.
  const now=Math.floor(Date.now()/1000)-60;
  globalThis.fetch=(async () => json({spark:{result:[
    {symbol:'MC.PA',response:[{meta:{symbol:'MC.PA',currency:'EUR',exchangeName:'PAR',regularMarketTime:now,regularMarketPrice:500,previousClose:490}}]},
    {symbol:'PETR4.SA',response:[{meta:{symbol:'PETR4.SA',currency:'USD',regularMarketTime:now,regularMarketPrice:38}}]},
    {symbol:'OR.PA',response:[{meta:{symbol:'OR.PA',currency:'EUR',regularMarketTime:now}}]},
  ]}})) as typeof fetch;
  const prices=await call(stockPrice,{symbols:'MC.PA,PETR4.SA,OR.PA'});
  eq(prices.body.quotes.length,1); eq(prices.body.quotes[0].currency,'EUR');eq(prices.body.quotes[0].asOf,new Date(now*1000).toISOString());eq(prices.body.unavailable,['PETR4.SA','OR.PA']);
  eq((await call(stockPrice,{symbols:'MC.PA&symbols=NVDA'})).statusCode,400);
  const timestamp=Array.from({length:70},(_,i)=>now-(69-i)*3600);
  const close=timestamp.map((_,i)=>490+i/10); const q={close,open:close,high:close.map(p=>p+1),low:close.map(p=>p-1),volume:close.map(()=>10)};
  const chart={chart:{result:[{meta:{symbol:'MC.PA',currency:'EUR',exchangeName:'PAR'},timestamp,indicators:{quote:[q]}}]}};
  const urls:string[]=[];
  globalThis.fetch=(async (input:string|URL)=>{const url=new URL(String(input));urls.push(url.href);
    if(url.hostname==='query1.finance.yahoo.com')return json(chart);
    if(url.pathname==='/api/stock-candles'){const c=await call(stockCandles,Object.fromEntries(url.searchParams));return new Response(JSON.stringify(c.body),{status:c.statusCode});}
    throw new Error('Unexpected provider');
  }) as typeof fetch;
  const evidence=await loadDeskEvidence('MC.PA');eq(evidence.provenance.currency,'EUR');eq(evidence.provenance.instrument,'MC.PA');eq(evidence.provenance.exchange,'PAR');ok(urls.every(u=>!u.includes('okx')));
  // Capture every real role prompt with a network stub, without making a paid request.
  for(const lang of APP_LANGUAGES){let n=0;const prompts:string[]=[];globalThis.fetch=(async(_u,init)=>{prompts.push(String(init?.body));return json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(++n===3?{analysis:'The evidence is incomplete and the conditional case needs more data.',verdict:'wait',direction:'none',synthesis:{headline:'The available evidence is still incomplete.',why:'There is not enough confirmation.',risk:'The structure could change.',watch:'Observe the next complete session.',watchLevel:0,followUp:'What is missing for MC.PA?'}}:{analysis:'The available structure requires confirmation from additional evidence.'})}}]});}) as typeof fetch;
    await runDeskDebate('Analyse MC.PA',evidence,lang,{locale:appLocale(lang,'pt-BR')});eq(prompts.length,3);ok(prompts.every(p=>p.includes(languageName(lang,appLocale(lang,'pt-BR')))));}
  const period={cadence:'weekly',periodKey:'2026-09-28_2026-10-05',capturedAt:new Date(now*1000).toISOString(),dataAsOf:new Date(now*1000).toISOString(),quotes:[],macro:{dxy:null,fearGreed:null,regime:null,funding:[]},agenda:[],equitySession:{state:'closed_weekend',date:'2026-10-04',lastSessionDate:'2026-10-02',closeAt:null,earlyClose:false,holidayName:null},sources:[],history:[],degraded:true} as any;
  for(const language of BRIEF_LANGUAGES){const narrative=factsOnlyNarrative(period,language,[]);eq(narrative.language,language);ok(narrative.market.body.length>10);ok(narrativeRequest(period,language,[]).system.includes(language==='pt-BR'?'Brazilian Portuguese':languageName(language)));}
  for(const lang of ['fr','pt','it','de'] as const){eq(translatedEnglish('Next seed: <svg onload=x>',lang),WEB_TRANSLATIONS[lang]['Next seed: {0}'].replace('{0}','<svg onload=x>'));}
  console.log(`${checks} locale/market/voice/briefing checks passed (mocked providers; no live generation).`);
}finally{globalThis.fetch=original;}
