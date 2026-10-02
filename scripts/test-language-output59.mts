// Shipping output consumers with inert storage/market/model providers. This proves contracts,
// preserved fixture prose and deterministic copy, not real model quality or device playback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

process.env.OPENAI_API_KEY = 'test-only';
process.env.BOBBY_SUPABASE_URL = 'https://db.test';
process.env.BOBBY_SUPABASE_ANON_KEY = 'test-anon';
process.env.BOBBY_SUPABASE_SERVICE_ROLE_KEY = 'test-service';
process.env.BOBBY_PROTOCOL_BASE_URL = 'https://bobby.test';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.BOBBY_MEMORY;
const { default: desk } = await import('../api/desk-debate.ts');
const { deskErrorCopy } = await import('../api/_lib/desk-localization.ts');
const { appLocale, languageName } = await import('../src/lib/app-language.ts');
const { factsOnlyNarrative, narrativeRequest, validateNarrative, ungroundedNumbers, agendaTitle, equitySessionLine, clip } = await import('../api/_lib/briefings/narrative.ts');
const { horizonOf, sufficiencyOf, runDeskDebate } = await import('../api/_lib/desk-debate.ts');
const { composeReport, validateContent, audioCacheKey } = await import('../api/_lib/briefings/compose.ts');
const { PUSH_COPY } = await import('../api/_lib/briefings/config.ts');
const { MARKET_HOURS_TITLES, marketHoursAgenda, readMacroAgenda } = await import('../api/_lib/briefings/evidence.ts');
const { NYSE_CALENDAR, equitySession } = await import('../api/_lib/briefings/calendar.ts');
type BriefEvidence = import('../api/_lib/briefings/types.ts').BriefEvidence;

const languages = ['en', 'es', 'fr', 'pt', 'it', 'de'] as const;
const variants = [['en','en-US'], ['en','en-GB'], ['es','es-MX'], ['es','es-ES'], ['fr','fr-FR'], ['pt','pt-PT'], ['pt','pt-BR'], ['it','it-IT'], ['de','de-DE']] as const;
const words = {
  en: ['The available evidence needs additional confirmation.', 'There is not enough confirmation.', 'The structure could change.', 'Observe the next complete session.', 'What is missing for BTC?'],
  es: ['La evidencia disponible necesita una confirmación adicional.', 'Todavía falta una confirmación.', 'La estructura podría cambiar.', 'Observar la próxima sesión completa.', '¿Qué falta para BTC?'],
  fr: ['Les données disponibles nécessitent une confirmation supplémentaire.', 'La confirmation reste insuffisante.', 'La structure pourrait changer.', 'Observer la prochaine séance complète.', 'Que manque-t-il pour BTC ?'],
  pt: ['Os dados disponíveis precisam de confirmação adicional.', 'Ainda falta uma confirmação.', 'A estrutura pode mudar.', 'Observar a próxima sessão completa.', 'O que falta para BTC?'],
  it: ['I dati disponibili richiedono una conferma aggiuntiva.', 'La conferma è ancora insufficiente.', 'La struttura potrebbe cambiare.', 'Osservare la prossima seduta completa.', 'Cosa manca per BTC?'],
  de: ['Die verfügbaren Daten benötigen eine zusätzliche Bestätigung.', 'Die Bestätigung reicht noch nicht aus.', 'Die Struktur könnte sich ändern.', 'Die nächste vollständige Sitzung beobachten.', 'Was fehlt für BTC?'],
};
let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try { await fn(); passed++; console.log(`ok - ${name}`); }
  catch (error) { failures.push(name); console.error(`not ok - ${name}: ${error instanceof Error ? error.message : String(error)}`); }
}
const read = (name: string) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
const fixture = () => JSON.parse(read('ios/Bobby/Nucleo/fixtures/ask/btc.json'));
const horizonQuestions={
  en:['BTC today','BTC next week','BTC next month','BTC in the long term'],
  es:['BTC hoy','BTC la próxima semana','BTC el próximo mes','BTC a largo plazo'],
  fr:['BTC aujourd’hui','BTC la semaine prochaine','BTC le mois prochain','BTC à long terme'],
  pt:['BTC hoje','BTC na próxima semana','BTC no próximo mês','BTC a longo prazo'],
  it:['BTC oggi','BTC la prossima settimana','BTC il prossimo mese','BTC a lungo termine'],
  de:['BTC heute','BTC nächste Woche','BTC nächsten Monat','BTC langfristig'],
};
for(const lang of languages)for(const [i,expected]of ['intraday','week','month','long'].entries())await check(`horizon/${lang}/${expected}: requested horizon controls actual evidence sufficiency`,()=>{
  const question=horizonQuestions[lang][i];assert.equal(horizonOf(question),expected);
  const s=sufficiencyOf(question,['1H']);assert.equal(s.horizon,expected);
  assert.equal(s.sufficient,expected==='intraday');
  if(expected!=='intraday')assert.ok(s.missing.includes('1D'));
});
await check('horizon/negative: ordinary words and ambiguous German prepositions do not invent a horizon',()=>{
  for(const question of ['BTC an der Unterstützung','BTC Monatsbericht? Nein, nur das Volumen','Un actif intéressant','FRACTIONS everyday','Compare NVDA and BTC']){
    assert.equal(horizonOf(question),'unspecified',question);
  }
});

for (const dir of ['ios/Bobby/Nucleo', 'nucleo']) {
  const ctx = { globalThis: {} as any };
  vm.runInNewContext(read(`${dir}/src/shared/05-locale.js`), ctx);
  vm.runInNewContext(read(`${dir}/src/shared/20-read-model.js`), ctx);
  const RM = ctx.globalThis.NucleoReadModel;
  const app = read(`${dir}/src/app/55-read.js`);
  const onReply = app.slice(app.indexOf('function onAskReply('), app.indexOf('function onStage('));
  const consumer = { RMOD: RM, LANG: 'en', LOCALE: 'en-US', SES: { signedIn: true }, READ: {} as any,
    fsmEvent() {}, logErr(_name: string, error: unknown) { throw error; } };
  vm.createContext(consumer); vm.runInContext(onReply, consumer);
  for (const [lang, locale] of variants) {
    const w = words[lang], r = fixture();
    r.asset = { ...r.asset, symbol: 'MC.PA', name: 'LVMH', isEquity: true, currency: 'EUR' };
    r.agents = { ...r.agents, alpha: w[0], red: w[2], cio: w[0], verdict: 'wait', direction: 'none',
      synthesis: { headline: w[0], why: w[1], risk: w[2], watch: w[3], watchLevel: 0, followUp: w[4] } };
    r.provenance = { ...r.provenance, currency: 'EUR', exchange: 'PAR', instrument: 'MC.PA' };
    await check(`${dir}/${locale}: real reply consumer, prose, chart/thesis labels and voice ending`, () => {
      consumer.LANG = lang; consumer.LOCALE = locale; consumer.READ = {};
      (consumer as any).onAskReply(consumer.READ, r);
      const m = consumer.READ.model;
      assert.equal(m.lang, lang); assert.equal(m.symbol, 'MC.PA'); assert.equal(m.agents[0].full, w[0]);
      assert.equal(m.debate.entries.find((e: any) => e.id === 'cio').text, w[0]);
      assert.equal(m.thesis.saveLabel, RM.STRINGS[lang]['thesis.save']);
      assert.equal(m.thesis.savedLabel, RM.STRINGS[lang]['thesis.saved']);
      assert.equal(m.meta, RM.STRINGS[lang].meta);
      assert.ok(m.thesis.rows[0].value.includes('EUR'));
      assert.ok(m.spoken.text.endsWith(RM.STRINGS[lang]['spoken.close.wait']));
      assert.ok(m.spoken.verdictWordIndex >= 0); assert.ok(m.spoken.text.length <= 800);
      assert.equal(m.chart.source.instrument, 'MC.PA'); assert.equal(m.chart.source.asOf, r.provenance.asOf);
      assert.equal(m.verdict.key, 'wait'); assert.equal(m.plan, null);
      assert.equal(m.thesis.title,RM.t(lang,'thesis.title.wait',{symbol:'MC.PA'}));
      assert.equal(m.aria,RM.t(lang,'aria.verdict',{word:RM.t(lang,'verdict.wait')}));
      for(const line of m.chart.lines)assert.equal(line.label,RM.t(lang,'chart.'+line.kind,{price:RM.money(line.price,lang,'EUR',locale)}));
      for(const row of m.thesis.rows)assert.equal(row.label,RM.t(lang,'row.'+row.id));
      for(const satellite of m.satellites)if(satellite.id!=='price')assert.equal(satellite.key,RM.t(lang,'sat.'+satellite.id));
    });
    await check(`${dir}/${locale}: review, missing data, recorded thesis and XP are localized`, () => {
      r.agents.verdict = 'review'; r.agents.direction = 'long';
      r.sufficiency = { sufficient: false, missing: ['1D','1W'], horizon: 'month' };
      r.evidenceUsed = { timeframes: ['1H'], derivatives: true, record: { resolvedCalls: 2, wins: 1 } };
      const m = RM.build(r, { lang, locale });
      assert.equal(m.verdict.word, RM.STRINGS[lang]['verdict.review']);
      assert.ok(m.spoken.text.endsWith(RM.STRINGS[lang]['spoken.close.review']));
      assert.ok(m.plan);assert.equal(m.ring.label,RM.t(lang,'ring.conviction'));
      for(const line of m.chart.lines)assert.equal(line.label,RM.t(lang,'chart.'+line.kind,{price:RM.money(line.price,lang,'EUR',locale)}));
      for(const row of m.thesis.rows)assert.equal(row.label,RM.t(lang,'row.'+row.id));
      if (dir.startsWith('ios')) {
        const missing = m.debate.entries.find((e: any) => e.id === 'missing');
        assert.ok(missing.text.includes(RM.STRINGS[lang]['hz.month']));
        assert.ok(m.debate.entries.find((e: any) => e.id === 'evidence').text.includes(RM.STRINGS[lang]['ev.derivatives']));
      }
      assert.equal(RM.xpChip(0, 'wait', lang), RM.STRINGS[lang]['xp.capped']);
      assert.ok(RM.xpChip(20, 'wait', lang).includes('20'));
      const saved = RM.thesisView({ id: 'saved', symbol: 'PETR4.SA', isEquity: true, currency: 'BRL', verdict: 'wait', price: 42.25 }, lang, { locale });
      assert.equal(saved.savedLabel, RM.STRINGS[lang]['thesis.savedLocal']); assert.ok(saved.price.includes('BRL'));
      assert.equal(RM.money(null, lang, 'EUR', locale), null);
      assert.ok(RM.clipWords('Longword'.repeat(200), 240).length <= 240);
      assert.equal(RM.clipWords('text', 0), '');
    });
    await check(`${dir}/${locale}: errors, confirm, risk and empty reply never display a verdict`, () => {
      const states = [ { status:'too_long' }, { status:'quota' }, { status:'cancelled' }, { status:'unknown_asset', suggestions:[] },
        { status:'unsupported', reason:'stale_data', asset:{symbol:'MC.PA',name:'LVMH'} },
        ...['network','timeout','bad_response','risk_not_accepted'].map(code => ({status:'error',code})), null ];
      for (const state of states) {
        const f = RM.failure(state && {...state,message:'UNEXPECTED ENGLISH PROVIDER ERROR'},lang,{locale});
        assert.ok(!('verdict' in f)); assert.ok(!JSON.stringify(f).includes('UNEXPECTED ENGLISH'));
      }
      const confirm = RM.failure({ status:'confirm',asset:{symbol:'MC.PA',name:'LVMH'}, token:'opaque-token' },lang,{locale});
      assert.equal(confirm.caption, RM.t(lang,'confirm.prompt',{name:'LVMH',symbol:'MC.PA'}));
      assert.equal(confirm.chips[0].action.token,'opaque-token'); assert.equal(confirm.chips[1].action.retype,true);
      const risk = RM.failure({status:'error',code:'risk_not_accepted'},lang,{locale});
      assert.equal(risk.chips[0].action.risk,true);
    });
    if (dir.startsWith('ios')) await check(`${dir}/${locale}: login/pro/reset/retry action contracts`, () => {
      const login=RM.failure({status:'signin_required',token:'held'},lang,{locale});
      assert.equal(login.caption,RM.STRINGS[lang]['gate.signin']);
      assert.deepEqual(clean(login.chips[0].action),{signIn:true,retry:'held'}); assert.ok(!login.chips[0].action.token);
      const pro=RM.failure({status:'subscription_required',token:'held',access:{resetsAt:'2026-10-05T12:00:00Z'}},lang,{locale});
      assert.ok(pro.sub.includes(new Date('2026-10-05T12:00:00Z').toLocaleDateString(locale,{month:'long',day:'numeric'})));
      assert.deepEqual(clean(pro.chips[0].action),{paywall:true,retry:'held'});
      const retry=RM.failure({status:'error',code:'timeout',retry:'retry-token'},lang,{locale});
      assert.equal(retry.chips[0].label,RM.STRINGS[lang]['err.retry']); assert.equal(retry.chips[0].action.token,'retry-token');
    });
    await check(`${dir}/${locale}: followups preserve real qualified ticker history`, () => {
      const chips=RM.followUps({symbol:'BTC',requestId:'read'}, {quickAccess:[{symbol:'^GSPC'},{symbol:'BRK-B'}],movers:[]},lang);
      assert.deepEqual(clean(chips.map((c:any)=>c.action.symbol)), ['BTC','^GSPC','BRK-B']);
      assert.equal(chips[1].label,RM.t(lang,'follow.how',{symbol:'^GSPC'}));
    });
  }
  if(dir.startsWith('ios')) for(const lang of languages) await check(`${dir}/${lang}: longest accepted synthesis fits native TTS 800 limit`,()=>{
    const r=fixture(), long=(words[lang][0]+' ').repeat(10).slice(0,240);
    r.agents.synthesis={headline:long.slice(0,180),why:long,risk:long,watch:long,watchLevel:0,followUp:words[lang][4]};
    const m=RM.build(r,{lang}); assert.ok(m.spoken.text.length<=800,`spoken length ${m.spoken.text.length}`);
    assert.ok(m.spoken.text.endsWith(RM.STRINGS[lang]['spoken.close.wait']));
    assert.equal(m.debate.entries[0].lines[0].text,long,'Full text remains visible behind narration');
  });
}

const evidence: BriefEvidence = {
  cadence:'weekly',periodKey:'2026-09-28_2026-10-05',capturedAt:'2026-10-05T11:35:00Z',dataAsOf:'2026-10-02T20:00:00Z',
  quotes:[{symbol:'BTC',kind:'crypto',price:12345.67,changePct:1.25,changeBasis:'7d',asOf:'2026-10-05T11:34:00Z',freshness:'live'},
    {symbol:'NVDA',kind:'equity',price:180.25,changePct:-1.25,changeBasis:'7d',asOf:'2026-10-02T20:00:00Z',freshness:'closed'}],
  macro:{dxy:null,fearGreed:{value:24,classification:'Extreme Fear',asOf:'2026-10-05T08:00:00Z',freshness:'delayed'},regime:null,funding:[]},
  agenda:[{title:MARKET_HOURS_TITLES.open,kind:'market_hours',at:'2026-10-05T13:30:00Z',severity:null}],
  equitySession:{date:'2026-10-05',state:'pre_market',lastSessionDate:'2026-10-02',closeAt:'2026-10-05T20:00:00Z',earlyClose:false,holidayName:null},
  sources:[{name:'macro_calendar',ok:true,freshness:'live'},{name:'fear_greed',ok:true,freshness:'delayed'}],
  history:[{symbol:'BTC',from:{at:'2026-09-28T12:00:00Z',price:12000},to:{at:'2026-10-05T12:00:00Z',price:12345.67}},{symbol:'NVDA',from:{at:'2026-09-28T12:00:00Z',price:182},to:{at:'2026-10-05T12:00:00Z',price:180.25}}],degraded:false,
};
const weekLabels={en:'Previous week',es:'Semana anterior',fr:'Semaine précédente',pt:'Semana anterior','pt-BR':'Semana anterior',it:'Settimana precedente',de:'Vorherige Woche'};
await check('weekly/grounding: French/Portuguese grouped prices are recognized, invented amounts/scales rejected',()=>{
  for(const price of ['12 345,67','12\u00a0345,67','12\u202f345,67','12,345.67','12.345,67'])assert.deepEqual(ungroundedNumbers(price,evidence),[],price);
  for(const price of ['12 999,67','12 345,67k','123 456 789'])assert.ok(ungroundedNumbers(price,evidence).length,price);
  assert.deepEqual(ungroundedNumbers('2026 24 25 26',evidence),[],'Dates/counts retain the preexisting policy');
});
for(const language of [...languages,'pt-BR'] as const){
  await check(`weekly/${language}: localized historical label reaches actual model prompt`,()=>{
    assert.ok(narrativeRequest(evidence,language,['BTC','NVDA']).system.includes(`"${weekLabels[language]}"`));
  });
  await check(`weekly/${language}: provider classification is localized in body/facts/narration`,()=>{
    const n=factsOnlyNarrative(evidence,language,['BTC','NVDA']);
    const {content}=composeReport({period:{cadence:'weekly',periodKey:evidence.periodKey} as any,evidence,narrative:n,frozen:{language,assets:['BTC','NVDA']} as any,memory:null,memoryAllowed:false});
    assert.equal(validateContent(content),null);
    assert.equal(content.language,language); assert.ok(content.narrationSegments.length<=3);
    assert.ok(content.narrationSegments.join('').length<=1200);
    if(language!=='en')assert.ok(!JSON.stringify(content).includes('Extreme Fear'));
    assert.ok(n.market.facts!.some(f=>f.value.includes('24')),'Index value preserved');
    const price=new Intl.NumberFormat(appLocale(language.split('-')[0],language),{minimumFractionDigits:2,maximumFractionDigits:2}).format(12345.67);
    assert.ok(n.assets.BTC.body.includes(price.replace(/\s/g,' ')),'Narration uses the same localized digits after whitespace normalization');
    assert.ok(n.assets.BTC.facts!.some(f=>f.value.includes(price)),'Full display facts retain Intl grouping');
    if(language!=='en')assert.ok(!n.agenda.body.includes(MARKET_HOURS_TITLES.open));
    assert.ok(content.sections.every(s=>s.symbol!=='NVDA'||s.status==='closed'));
    assert.ok(content.narrationSegments.every(s=>s.length<=800));
    assert.ok(PUSH_COPY[language].body); assert.notEqual(audioCacheKey('same','ash',language,'analytical','model'),'');
    const empty=factsOnlyNarrative({...evidence,quotes:[],macro:{dxy:null,fearGreed:null,regime:null,funding:[]},agenda:[],history:[]},language,[]);
    assert.ok(empty.week!.body.length>10);assert.ok(empty.agenda.body.length>10);
    const canned={opening:n.opening,market:{title:n.market.title,body:n.market.body},assets:[],risks:{title:n.risks.title,body:n.risks.body},agenda:{title:n.agenda.title,body:n.agenda.body},week:{title:n.week!.title,body:n.week!.body}};
    assert.ok(validateNarrative(canned,evidence,language,['BTC','NVDA'],'fixture'));
  });
  await check(`weekly/${language}: every classification enum and unknown provider prose retains the index only`,()=>{
    const labels={en:['Extreme Fear','Fear','Neutral','Greed','Extreme Greed'],es:['Miedo extremo','Miedo','Neutral','Codicia','Codicia extrema'],fr:['Peur extrême','Peur','Neutre','Avidité','Avidité extrême'],pt:['Medo extremo','Medo','Neutro','Ganância','Ganância extrema'],'pt-BR':['Medo extremo','Medo','Neutro','Ganância','Ganância extrema'],it:['Paura estrema','Paura','Neutrale','Avidità','Avidità estrema'],de:['Extreme Angst','Angst','Neutral','Gier','Extreme Gier']};
    for(const [index,classification]of ['Extreme Fear','Fear','Neutral','Greed','Extreme Greed'].entries()){
      const n=factsOnlyNarrative({...evidence,macro:{...evidence.macro,fearGreed:{...evidence.macro.fearGreed!,classification}}},language,['BTC']);
      assert.ok(n.market.facts!.some(f=>f.value.includes(`24 (${labels[language][index]})`)));
    }
    const n=factsOnlyNarrative({...evidence,macro:{...evidence.macro,fearGreed:{...evidence.macro.fearGreed!,classification:'Unexpected English vendor explanation'}}},language,['BTC']);
    assert.ok(!JSON.stringify(n).includes('Unexpected English')); assert.ok(n.market.facts!.some(f=>f.value.startsWith('24 ')));
  });
}


// Pull the producer's actual constant into a sandbox; importing the handler would expose write machinery.
const seedSource=read('api/seed-macro-calendar.ts');
const seedLiteral=seedSource.slice(seedSource.indexOf('const MACRO_EVENTS_2026 =')+'const MACRO_EVENTS_2026 ='.length,seedSource.indexOf('\n];')+2);
const seeded=clean(vm.runInNewContext(`(${seedLiteral})`)) as Array<{title:string,date:string,severity:number}>;
const calendarLabels={
  en:["New Year's Day",'Martin Luther King, Jr. Day',"Washington's Birthday",'Good Friday','Memorial Day','Juneteenth','Independence Day (observed)','Labor Day','Thanksgiving Day','Christmas Day'],
  es:['Año Nuevo','Día de Martin Luther King, Jr.','Cumpleaños de Washington','Viernes Santo','Día de los Caídos','Juneteenth','Día de la Independencia de EE. UU. (fecha de observancia)','Día del Trabajo de EE. UU.','Día de Acción de Gracias','Navidad'],
  fr:["Jour de l’An",'Journée de Martin Luther King, Jr.','Anniversaire de Washington','Vendredi saint','Jour du souvenir des militaires morts','Juneteenth','Fête de l’indépendance des États-Unis (jour observé)','Fête du travail aux États-Unis','Jour de Thanksgiving','Noël'],
  pt:['Ano Novo','Dia de Martin Luther King, Jr.','Aniversário de Washington','Sexta-feira Santa','Dia de homenagem aos militares mortos','Juneteenth','Dia da Independência dos EUA (data de observância)','Dia do Trabalho nos EUA','Dia de Ação de Graças','Natal'],
  'pt-BR':['Ano Novo','Dia de Martin Luther King, Jr.','Aniversário de Washington','Sexta-feira Santa','Dia de homenagem aos militares mortos','Juneteenth','Dia da Independência dos EUA (data de observância)','Dia do Trabalho nos EUA','Dia de Ação de Graças','Natal'],
  it:['Capodanno','Giornata di Martin Luther King, Jr.','Compleanno di Washington','Venerdì Santo','Giornata in memoria dei caduti','Juneteenth','Giorno dell’indipendenza degli Stati Uniti (data di osservanza)','Festa del lavoro negli Stati Uniti','Giorno del Ringraziamento','Natale'],
  de:['Neujahr','Martin-Luther-King-Jr.-Tag','Washingtons Geburtstag','Karfreitag','Gedenktag für gefallene US-Soldaten','Juneteenth','Unabhängigkeitstag der USA (Ersatzfeiertag)','US-Tag der Arbeit','Erntedankfest der USA','Weihnachten'],
};
const macroLabels={en:'FOMC Rate Decision',es:'Decisión del FOMC sobre tasas de interés',fr:'Décision du FOMC sur les taux',pt:'Decisão do FOMC sobre taxas de juro','pt-BR':'Decisão do FOMC sobre taxas de juros',it:'Decisione del FOMC sui tassi di interesse',de:'Zinsentscheidung des FOMC'};
for(const language of [...languages,'pt-BR'] as const){
  await check(`weekly/${language}: actual seeded macro titles are localized without replacing event identity`,async()=>{
    const agenda=await readMacroAgenda('2026-01-01T00:00:00Z','2027-01-01T00:00:00Z',(async()=>new Response(JSON.stringify(seeded.map(e=>({title:e.title,scheduled_at:e.date,severity:e.severity,state:'upcoming'}))))) as typeof fetch);
    assert.equal(agenda.length,seeded.length); assert.equal(agendaTitle(agenda[0],language),macroLabels[language]);
    for(const [index,item]of agenda.entries()){
      assert.equal(item.title,seeded[index].title);assert.equal(item.at,new Date(seeded[index].date).toISOString());assert.equal(item.severity,seeded[index].severity);
      const title=agendaTitle(item,language);
      if(language!=='en')assert.notEqual(title,item.title,item.title);
      const n=factsOnlyNarrative({...evidence,agenda:[item]},language,['BTC']);
      assert.ok(n.agenda.body.includes(title));assert.ok(n.agenda.facts!.some(f=>f.label===clip(title,60)));
      const {content}=composeReport({period:{cadence:'weekly',periodKey:evidence.periodKey} as any,evidence:{...evidence,agenda:[item]},narrative:n,frozen:{language,assets:['BTC']} as any,memory:null,memoryAllowed:false});
      assert.equal(validateContent(content),null);assert.ok(content.narrationSegments.join(' ').includes(title));
    }
    const months=Array.from({length:12},(_,month)=>new Intl.DateTimeFormat(appLocale(language.split('-')[0],language),{month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,month,1))));
    for(const [index,item]of agenda.filter(e=>e.title.startsWith('CPI ')).entries())assert.ok(agendaTitle(item,language).toLowerCase().includes(months[index].toLowerCase()),item.title);
    const payroll=agenda.filter(e=>e.title.startsWith('Non-Farm Payroll'));
    for(const [index,item]of payroll.entries())assert.ok(agendaTitle(item,language).toLowerCase().includes(months[index+3].toLowerCase()),item.title);
  });
  await check(`weekly/${language}: actual exchange holiday producer reaches localized session/body/facts`,()=>{
    for(const [index,[date,name]]of Object.entries(NYSE_CALENDAR.holidays).slice(0,10).entries()){
      const session=equitySession(date),expected=calendarLabels[language][index];
      assert.equal(session.holidayName,name);assert.equal(session.state,'closed_holiday');
      assert.ok(equitySessionLine(session,language).includes(expected),equitySessionLine(session,language));
      const agenda=marketHoursAgenda('weekly',Date.parse(`${date}T00:00:00Z`),Date.parse(`${date}T23:59:59Z`));
      assert.equal(agenda.length,1);assert.equal(agenda[0].title,MARKET_HOURS_TITLES.holidayPrefix+name);
      assert.ok(agendaTitle(agenda[0],language).endsWith(expected));
      const n=factsOnlyNarrative({...evidence,equitySession:session,agenda},language,['NVDA']);
      assert.ok(n.market.body.includes(expected));assert.ok(n.agenda.body.includes(expected));assert.ok(n.agenda.facts!.some(f=>f.label===clip(agendaTitle(agenda[0],language),60)));
      const {content}=composeReport({period:{cadence:'weekly',periodKey:evidence.periodKey} as any,evidence:{...evidence,equitySession:session,agenda},narrative:n,frozen:{language,assets:['NVDA']} as any,memory:null,memoryAllowed:false});
      assert.equal(validateContent(content),null);assert.ok(content.narrationSegments.join(' ').includes(expected));
      assert.equal(content.equitySession.holidayName,name,'Raw provenance keeps the calendar identity');
    }
    // Every published observed variant is covered, not a catch-all removal of the qualifier.
    for(const date of ['2027-06-18','2027-12-24']){
      const session=equitySession(date),line=equitySessionLine(session,language);
      assert.ok(line.includes(language==='en'?'observed':language==='es'?'fecha de observancia':language==='fr'?'jour observé':language==='it'?'data di osservanza':language==='de'?'Ersatzfeiertag':'data de observância'));
    }
  });
  await check(`weekly/${language}: unknown dynamic titles preserve proper names and facts; linguistic coverage not claimed`,()=>{
    for(const title of ['Fed Chair Jane Doe speaks about the economy','PCE February Release','FOMC Rate Decision: corrected outlook'])assert.equal(agendaTitle({title,kind:'macro',at:'2026-10-03T12:00:00Z',severity:4},language),title);
    const unknown=equitySessionLine({...evidence.equitySession,state:'closed_holiday',holidayName:'Founders’ Day of Example Exchange'},language);
    assert.ok(unknown.includes('Founders’ Day of Example Exchange'));
  });
}

const originalFetch=globalThis.fetch;
let activeLanguage: typeof languages[number]='en', modelCalls=0, mode='ok';
const prompts:string[]=[];
const json=(v:unknown)=>new Response(JSON.stringify(v),{headers:{'content-type':'application/json'}});
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname==='db.test'){
    if(url.pathname.endsWith('/rpc/bobby_llm_spend'))return json({day:0,month:0});
    if(url.pathname.endsWith('/rpc/bobby_consume_read'))return json({allowed:mode!=='signin'&&mode!=='pro',code:mode==='signin'?'signin_required':mode==='pro'?'subscription_required':null,readId:7,tier:'anon',used:1,limit:3,remaining:2});
    if(url.pathname.endsWith('/rpc/bobby_consume_desk_quota'))return json(true);
    if(url.pathname.endsWith('/rpc/bobby_refund_read')||url.pathname.endsWith('/rpc/bobby_record_outcome'))return json(null);
    if(url.pathname.endsWith('/bobby_llm_usage'))return new Response(null,{status:204});
  }
  if(url.hostname==='bobby.test'&&url.pathname==='/api/okx-candles')return json({candles:Array.from({length:100},(_,i)=>({ts:Date.now()-(100-i)*3600000,open:100+i,high:102+i,low:99+i,close:101+i,volume:5}))});
  if(url.hostname==='api.openai.com'||url.hostname==='api.anthropic.com'){
    const payload=JSON.parse(String(init?.body));prompts.push(String(init?.body)); modelCalls++;
    const w=words[activeLanguage];const isCio=JSON.stringify(payload.system||payload.messages).includes('Your role is CIO:');
    const reply=isCio?{analysis:w[0],verdict:'wait',direction:'none',synthesis:{headline:w[0],why:w[1],risk:w[2],watch:w[3],watchLevel:0,followUp:w[4]}}:{analysis:w[0]};
    if(isCio&&String(payload.system).includes('Also return scenarios'))Object.assign(reply,{scenarios:{confirm:w[1],invalidate:w[2]}});
    const content=mode==='invalid_model'?'{}':JSON.stringify(reply);
    if(url.hostname==='api.anthropic.com')return json({stop_reason:'end_turn',content:[{type:'text',text:content}]});
    return json({choices:[{finish_reason:'stop',message:{content}}]});
  }
  throw new Error(`Unexpected local-test fetch ${url.hostname}${url.pathname}`);
}) as typeof fetch;
async function post(body:Record<string,unknown>){
  const res={statusCode:200,body:null as any,setHeader(){},status(n:number){this.statusCode=n;return this;},json(v:unknown){this.body=v;return this;}};
  await desk({method:'POST',headers:{origin:'https://bobbyprotocol.xyz','x-forwarded-for':'203.0.113.59','x-bobby-platform':'ios','x-bobby-device':'test-device-output-59'},body} as never,res as never);return res;
}
try{
  for(const [language,locale]of variants){activeLanguage=language;mode='ok';
    await check(`handler/${locale}: real roles preserve localized canned prose, prompt and instrument`,async()=>{
      const before=modelCalls,promptBefore=prompts.length;const result=await post({symbol:'BTC',assetType:'crypto',question:words[language][4],language,locale});
      assert.equal(result.statusCode,200);assert.equal(modelCalls-before,3);assert.equal(result.body.agents.cio,words[language][0]);
      assert.equal(result.body.agents.synthesis.risk,words[language][2]);assert.equal(result.body.provenance.instrument,'BTC-USDT');
      assert.ok(prompts.slice(promptBefore).every(p=>p.includes(`Write in ${languageName(language,locale)}.`)));
    });
    for(const gate of ['signin','pro'])await check(`handler/${locale}: ${gate} refuses before model with localized copy`,async()=>{
      mode=gate;const before=modelCalls;const result=await post({symbol:'BTC',question:words[language][4],language,locale});
      assert.equal(result.statusCode,gate==='signin'?401:402);assert.equal(modelCalls,before);
      const en=gate==='signin'?'Create your free account to keep reading.':'Your general read allowance is used for now.';
      const es=gate==='signin'?'Crea tu cuenta gratis para seguir leyendo.':'Tu cupo de lecturas generales se agotó por ahora.';
      assert.equal(result.body.error,deskErrorCopy(language,en,es));
    });
    mode='ok';await check(`handler/${locale}: invalid and too-long questions have localized failures and zero model calls`,async()=>{
      const before=modelCalls;for(const question of ['', 'x'.repeat(1201)]){const result=await post({symbol:'BTC',question,language,locale});assert.equal(result.statusCode,400);assert.ok(result.body.error);}
      assert.equal(modelCalls,before);
    });
    await check(`handler/${locale}: malformed provider output returns localized failure without raw prose`,async()=>{
      mode='invalid_model';const result=await post({symbol:'BTC',question:words[language][4],language,locale});
      assert.equal(result.statusCode,503);assert.equal(result.body.code,'analysis_failed');
      assert.equal(result.body.error,deskErrorCopy(language,'The analysis could not finish. Please retry. No verdict was issued.','El análisis no pudo terminar. Inténtalo de nuevo. No se emitió ningún veredicto.'));
      assert.ok(!result.body.agents);
    });
    mode='ok';
  }
  process.env.ANTHROPIC_API_KEY='test-only';
  try{
    for(const [language,locale]of variants)for(const level of ['profundo','maximo']as const)await check(`engine/${locale}/${level}: all real roles, second-round/scenario prose and locale remain intact`,async()=>{
      activeLanguage=language;mode='ok';const before=modelCalls,promptBefore=prompts.length;
      const market={symbol:'BTC',technicals:{price:100,trend:'lateral'},provenance:{provider:'fixture-market',instrument:'BTC-USDT',assetType:'crypto',timeframe:'1H',asOf:'2026-10-03T12:00:00Z'},timeframes:{'1H':{price:100},'1D':{price:100},'1W':{price:100}}} as any;
      const heard:any[]=[];const result=await runDeskDebate(horizonQuestions[language][2],market,language,{locale,level,onEvent:e=>heard.push(e)});
      assert.equal(modelCalls-before,level==='maximo'?4:3);
      assert.ok(prompts.slice(promptBefore).every(p=>p.includes(`Write in ${languageName(language,locale)}.`)));
      assert.equal(result.sufficiency.horizon,'month');assert.equal(result.sufficiency.sufficient,true);
      assert.equal(result.agents.cio,words[language][0]);assert.equal(result.agents.synthesis.followUp,words[language][4]);
      if(level==='maximo'){
        assert.equal(result.agents.rebuttal,words[language][0]);assert.equal(result.agents.scenarios!.confirm,words[language][1]);
        assert.equal(heard.at(-1).role,'rebuttal');
      }
      assert.equal(result.provenance.instrument,'BTC-USDT');assert.equal(result.agents.direction,'none');
    });
  }finally{delete process.env.ANTHROPIC_API_KEY;}
}finally{globalThis.fetch=originalFetch;}
console.log(`\n${passed} output contract cases passed; ${failures.length} failed. All provider/storage/market calls stubbed; no live generation or device playback.`);
if(failures.length)process.exitCode=1;
