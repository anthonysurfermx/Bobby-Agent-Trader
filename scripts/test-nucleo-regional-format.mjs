// Execute the shipping JavaScript consumers and read model, with recorded market data only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const variants = ['pt-BR','pt-PT','en-US','en-GB','en-AU','en-CA','en-IE','es-MX','es-ES','es-US','fr-FR','it-IT','de-DE'];
const defaults = { en:'en-US', es:'es-MX', fr:'fr-FR', pt:'pt-PT', it:'it-IT', de:'de-DE' };
let checks = 0;
function eq(actual, expected, label) { assert.equal(actual, expected, label); checks++; }
function ok(value, label) { assert.ok(value, label); checks++; }
function number(value, locale, dp) { return Math.abs(value).toLocaleString(locale, {minimumFractionDigits:dp, maximumFractionDigits:dp}); }
function fixture() {
  const r = JSON.parse(read('ios/Bobby/Nucleo/fixtures/ask/nvda.json'));
  r.asset = {...r.asset, symbol:'PETR4.SA', name:'Recorded Brazilian equity', currency:'BRL', isEquity:true};
  r.market = {...r.market, price:20000, changePct:1.25};
  r.technicals = {...r.technicals, support:19000, resistance:21000};
  r.candles = r.candles.map((c,i,a) => ({...c, c:20000-(a.length-i-1)*12.5, v: i === a.length-2 ? 125 : 100}));
  // All candles are closed; this gives a decimal volume ratio without changing any market inputs in a consumer.
  r.receivedAt = r.candles.at(-1).t + 7200000;
  return r;
}
for (const dir of ['ios/Bobby/Nucleo', 'nucleo']) {
  const ctx = {globalThis:{}};
  vm.createContext(ctx);
  vm.runInContext(read(dir+'/src/shared/05-locale.js'), ctx);
  vm.runInContext(read(dir+'/src/shared/20-read-model.js'), ctx);
  const L = ctx.globalThis.NucleoLocale, RM = ctx.globalThis.NucleoReadModel;
  const standalone={globalThis:{}};
  vm.runInNewContext(read(dir+'/src/shared/20-read-model.js'),standalone);
  const app = read(dir+'/src/app/55-read.js');
  const onAskReply = app.slice(app.indexOf('function onAskReply('), app.indexOf('function onStage('));
  const dockAsset = app.slice(app.indexOf('function dockAsset('), app.indexOf('/* ---- caption pages:'));
  const tickFmt = read(dir+'/src/onboarding/30-dom.js').match(/^function tickFmt\(v\).*$/m)[0];
  const consumer = { RMOD:RM, LANG:'pt', LOCALE:'pt-BR', SES:{signedIn:true}, READ:{}, fsmEvent(){}, logErr(_name, err){throw err;},
    fin(v){return typeof v==='number'&&Number.isFinite(v);}, E:{fade(){}}, A:{dockAO:{tween(){}}}, el:{dockA:{}} };
  vm.createContext(consumer);
  // The iPhone market consumer also resets the companion retry counter. Execute
  // its shipping predicate; this suite still supplies only market replies.
  if (dir === 'ios/Bobby/Nucleo') vm.runInContext(app.match(/^function paramsCompanion\(params\).*$/m)[0] + '\nvar GUIDE_RETRIES = 0, CHECKIN = null;', consumer);
  vm.runInContext(onAskReply+'\n'+dockAsset+'\n'+tickFmt, consumer);
  const onboardSource=read(dir+'/src/onboarding/60-fsm.js');
  const onboard={RMOD:RM,LANG:'pt',LOCALE:'pt-BR',SESSION:{signedIn:true},W:{state:'THINK_WAIT'},go(){},report(_name,error){throw error;}};
  vm.createContext(onboard);
  vm.runInContext(onboardSource.slice(onboardSource.indexOf('function onAskReply(r)'),onboardSource.indexOf('ENTER.RESOLVING =')),onboard);
  // Baseline: LANG was passed without LOCALE, silently producing Portugal formatting on a Brazilian device.
  const initial = fixture(); consumer.onAskReply(consumer.READ, initial);
  eq(consumer.READ.model.thesis.rows[0].value, number(20000,'pt-BR',0)+' BRL', dir+': actual Brazilian app reply consumer preserves its selected locale');
  for (const locale of variants) {
    const lang = locale.split('-')[0], r = fixture(), original = JSON.stringify(r);
    eq(L.locale(lang, locale), locale, dir+': shared locale preserves '+locale);
    eq(L.locale(locale.toLowerCase().replace('-','_')), locale, dir+': locale normalization '+locale);
    consumer.LANG = lang; consumer.LOCALE = locale; consumer.READ = {};
    consumer.onAskReply(consumer.READ, r);
    const m = consumer.READ.model, formatted = number(20000,locale,0)+' BRL';
    eq(m.lang, lang, dir+': model language remains base '+locale);
    eq(m.thesis.rows[0].value, formatted, dir+': actual consumer price '+locale);
    eq(m.satellites.find(s=>s.id==='price').value, formatted, dir+': satellite price '+locale);
    eq(m.satellites.find(s=>s.id==='price').delta, '▲'+number(1.25,locale,2)+'%', dir+': satellite percentage '+locale);
    eq(m.chart.now.label, formatted, dir+': chart price '+locale);
    ok(m.chart.lines.find(l=>l.kind==='support').label.includes(number(19000,locale,0)+' BRL'), dir+': chart support '+locale);
    eq(m.chart.now.price, 20000, dir+': chart numeric data '+locale);
    eq(m.chart.source.instrument, r.provenance.instrument, dir+': instrument preserved '+locale);
    eq(m.agents[0].full, r.agents.alpha, dir+': provider alpha prose unchanged '+locale);
    eq(m.agents[2].full, r.agents.cio, dir+': provider CIO prose unchanged '+locale);
    eq(JSON.stringify(r), original, dir+': original market data unchanged '+locale);
    const th = {id:'recorded',symbol:r.asset.symbol,currency:'BRL',isEquity:true,verdict:'wait',price:20000,support:19000,resistance:21000};
    const tv = RM.thesisView(th,lang,{locale});
    eq(tv.price, formatted, dir+': saved thesis '+locale);
    eq(tv.rows[0].value, formatted, dir+': saved thesis table '+locale);
    eq(RM.build(r,{lang,locale}).thesis.rows[0].value, formatted, dir+': model locale option '+locale);
    eq(RM.build({...r,language:lang,locale}).thesis.rows[0].value, formatted, dir+': response locale with no explicit option '+locale);
    eq(RM.build(r,{lang:locale}).thesis.rows[0].value, formatted, dir+': BCP47 legacy option '+locale);
    eq(standalone.globalThis.NucleoReadModel.money(20000,lang,'BRL',locale),formatted,dir+': standalone formatter contract '+locale);
    onboard.LANG=lang;onboard.LOCALE=locale;onboard.onAskReply(r);
    eq(onboard.M.thesis.rows[0].value,formatted,dir+': actual onboarding reply consumer '+locale);
    eq(RM.money(20.25,lang,'EUR',locale), number(20.25,locale,2)+' EUR', dir+': EUR decimal '+locale);
    eq(RM.money(0.0125,lang,null,locale), number(.0125,locale,4), dir+': unknown currency is never replaced '+locale);
    eq(RM.money(20.25,lang,'USD',locale), ['en','es'].includes(lang)?'$'+number(20.25,locale,2):number(20.25,locale,2)+' USD', dir+': existing USD currency style with local digits '+locale);
    eq(RM.signedPct(-1.25,lang,locale), '▼'+number(1.25,locale,2)+'%', dir+': percentage '+locale);
    consumer.READ = {asset:r.asset,market:r.market}; consumer.dockAsset();
    eq(consumer.el.dockA.textContent, 'PETR4.SA · '+formatted+' ▲'+number(1.25,locale,2)+'%', dir+': actual market stage dock preserves BRL '+locale);
    eq(consumer.tickFmt(20.25), (20.25).toLocaleString(locale,{maximumFractionDigits:2}), dir+': actual onboarding chart decimal '+locale);
    eq(consumer.tickFmt(20000), (20000).toLocaleString(locale), dir+': actual onboarding chart grouping '+locale);
    if(RM.resetDay) {
      const iso='2026-10-03T12:00:00Z', expectedDate=new Date(iso).toLocaleDateString(locale,{month:'long',day:'numeric'});
      eq(RM.resetDay(iso,lang,locale), expectedDate, dir+': reset date '+locale);
      const refusal=RM.failure({status:'subscription_required',access:{resetsAt:iso}},lang,{locale});
      ok(refusal.sub.includes(expectedDate), dir+': localized quota date '+locale);
    }
  }
  for(const lang of Object.keys(defaults)) {
    eq(L.locale(lang), defaults[lang], dir+': existing default '+lang);
    for(const invalid of ['ja-JP','en-ZZ','pt-BR-x-private','pt-BR-extra','PT!!BR', 'fr-CA','']) {
      eq(L.locale(lang,invalid),defaults[lang],dir+': invalid/mismatched locale has coherent default '+lang+'/'+invalid);
      eq(RM.build(fixture(),{lang,locale:invalid}).thesis.rows[0].value, number(20000,defaults[lang],0)+' BRL',dir+': malformed/mismatched locale never changes language '+lang+'/'+invalid);
    }
  }
  eq(L.locale('pt','en-GB'),'pt-PT',dir+': Portuguese cannot acquire English locale');
  eq(L.locale('en','pt-BR'),'en-US',dir+': English cannot acquire Portuguese locale');
  // Every shipping route must supply the active session locale; these checks complement actual consumer execution.
  for(const page of ['app','onboarding']) {
    const sources=fs.readdirSync(path.join(root,dir,'src',page)).filter(n=>n.endsWith('.js')).map(n=>read(dir+'/src/'+page+'/'+n)).join('\n');
    const calls=[...sources.matchAll(/RMOD\.(build|thesisView|failure)\([^;\n]+/g)].map(m=>m[0]);
    ok(calls.length>0,dir+'/'+page+': shipping model calls found');
    for(const call of calls) ok(/locale\s*:\s*LOCALE/.test(call),dir+'/'+page+': active locale in '+call);
  }
}
if(process.argv.includes('--resources')) {
  for(const page of ['app','onboarding']) {
    const html=read('ios/Bobby/Resources/Nucleo/'+page+'.html');
    ok(html.includes(read('ios/Bobby/Nucleo/src/shared/05-locale.js').trim()),page+': bundled release locale source matches');
    ok(html.includes(read('ios/Bobby/Nucleo/src/shared/20-read-model.js').trim()),page+': bundled release read model matches');
    ok(!html.includes('window.NUCLEO_FIXTURES='),page+': no development fixtures in release');
    ok(!html.includes('shared/90-dev-mock'),page+': no mock transport in release');
  }
}
console.log(checks+' actual JS consumer, regional format and source assertions passed');
