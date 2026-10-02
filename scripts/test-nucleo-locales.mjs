// Locale completeness and native/browser read outcomes, without network or paid generation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const langs=['en','es','fr','pt','it','de'];let checks=0;
function check(name,fn){fn();checks++;console.log('ok - '+name);}
const code=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const clean=(v)=>JSON.parse(JSON.stringify(v));
const args={n:4,name:'Momo',names:'Momo',symbol:'MC.PA',sym:'MC.PA',hours:24,pct:65,points:20,s:3,i:1,pieces:2,seeds:1,size:8,level:2,streak:3,list:'RSI',price:'100 EUR',time:'14:00',when:'14:00',date:'3 octobre',h:'today',w:1};
for(const dir of ['nucleo','ios/Bobby/Nucleo']){
 const c={globalThis:{}};vm.runInNewContext(code(dir+'/src/shared/05-locale.js'),c);const L=c.globalThis.NucleoLocale;
 check(dir+': BCP47 and regional Portuguese resolution',()=>{for(const [input,lang,loc] of [['fr-CA','fr','fr-FR'],['pt-BR','pt','pt-BR'],['pt_PT','pt','pt-PT'],['it-IT','it','it-IT'],['de-DE','de','de-DE'],['es-ES','es','es-ES'],['ja-JP','en','en-US']]){assert.equal(L.language(input),lang);assert.equal(L.locale(input),loc);}assert.equal(L.locale('pt','pt-BR'),'pt-BR');});
 for(const part of ['app','onboarding']){
  const ctx={};vm.runInNewContext(code(dir+'/src/'+part+'/40-strings.js'),ctx);const table=ctx.STR,resolve=ctx.tt||ctx.Ls;
  check(dir+'/'+part+': six complete dictionaries with preserved placeholders',()=>{for(const lang of langs){assert.deepEqual(Object.keys(table[lang]).sort(),Object.keys(table.en).sort());for(const [key,value] of Object.entries(table[lang])){assert.ok(typeof value==='string'&&value.trim(),lang+'.'+key);assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),[...table.en[key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),lang+'.'+key);ctx.LANG=lang;const rendered=resolve(key,args);assert.notEqual(rendered,key);assert.ok(!/\{\w+\}/.test(rendered));}}});
  if(ctx.lintStrings)check(dir+'/'+part+': all six languages pass consent/advice copy lint',()=>assert.deepEqual(clean(ctx.lintStrings()),[]));
  check(dir+'/'+part+': translated hint and long chart rows can wrap',()=>{const template=code(dir+'/src/'+part+'/template.html');assert.match(template,/#hint \.roll,#hint \.roll>span\{[^}]*white-space:normal/);assert.match(template,/\.card dt\{[^}]*white-space:normal/);});
 }
 const ctx={globalThis:{}};vm.runInNewContext(code(dir+'/src/shared/20-read-model.js'),ctx);const RM=ctx.globalThis.NucleoReadModel;
 check(dir+': read dictionary keys and interpolation are complete',()=>{for(const lang of langs){assert.deepEqual(Object.keys(RM.STRINGS[lang]).sort(),Object.keys(RM.STRINGS.en).sort());for(const [key,text] of Object.entries(RM.STRINGS[lang])){assert.ok(text.trim());assert.deepEqual([...text.matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort(),[...RM.STRINGS.en[key].matchAll(/\{(\w+)\}/g)].map(x=>x[1]).sort());}}});
 for(const lang of ['fr','pt','it','de'])check(dir+'/'+lang+': consent, quota and errors use selected language; no verdict on refusal',()=>{for(const r of [{status:'too_long',message:'English fallback'},{status:'quota',message:'English fallback'},{status:'error',code:'network',message:'English fallback'},{status:'error',code:'risk_not_accepted'}]){const f=RM.failure(r,lang);assert.ok(f.caption&&!f.caption.includes('English fallback'));assert.ok(!('verdict' in f));}assert.equal(RM.t(lang+'-XX','thesis.save'),RM.STRINGS[lang]['thesis.save']);});
 check(dir+': localized sentences retain French/Portuguese/German accents and numeric facts',()=>{assert.deepEqual(clean(RM.sentences('Prix 225.1. À surveiller. Überprüfen.')),['Prix 225.1.','À surveiller.','Überprüfen.']);for(const lang of langs){assert.ok(RM.money(225.1,lang,'EUR').includes('EUR'));assert.ok(!RM.money(225.1,lang,'BRL').includes('USD'));assert.equal(RM.money(null,lang,'EUR'),null);}});
 const r=JSON.parse(code('ios/Bobby/Nucleo/fixtures/ask/nvda.json'));
 check(dir+': a real recorded market read keeps local currency and truthful saved thesis',()=>{r.asset.symbol='MC.PA';r.asset.currency='EUR';for(const lang of ['fr','pt','it','de']){const m=RM.build(r,{lang});assert.equal(m.verdict.key,'wait');assert.equal(m.plan,null);assert.ok(m.thesis.rows.find(x=>x.id==='price').value.includes('EUR'));assert.equal(m.thesis.saveLabel,RM.STRINGS[lang]['thesis.save']);const th=RM.thesisView({id:'test',symbol:'PETR4.SA',isEquity:true,currency:'BRL',verdict:'wait',price:42.2},lang);assert.ok(th.price.includes('BRL'));}});
}
console.log('\n'+checks+' locale checks passed');
