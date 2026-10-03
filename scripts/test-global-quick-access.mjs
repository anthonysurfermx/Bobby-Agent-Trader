// Execute shipping quick-access and suggestion consumers without network, accounts, microphone or models.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const clean=value=>JSON.parse(JSON.stringify(value));
let checks=0,failures=0;
function check(name,fn){try{fn();checks++;console.log('ok - '+name);}catch(error){failures++;console.error('FAIL - '+name+': '+error.message);}}
function expression(file,left){const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);let found;function visit(node){if(ts.isBinaryExpression(node)&&node.left.getText(source)===left)found=node.right.getText(source);ts.forEachChild(node,visit);}visit(source);assert.ok(found,'Shipping assignment '+left);return found;}
function declaration(file,name){const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS);let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node.getText(source);ts.forEachChild(node,visit);}visit(source);assert.ok(found,'Shipping consumer '+name);return found;}
function suggestionsCallbacks(file){const source=ts.createSourceFile(file,read(file),ts.ScriptTarget.ES2022,true,ts.ScriptKind.JS),found=[];function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='then'&&ts.isCallExpression(node.expression.expression)&&node.expression.expression.expression.getText(source)==='bcall'&&node.expression.expression.arguments[0]?.text==='suggestions')found.push(node.arguments[0].getText(source));ts.forEachChild(node,visit);}visit(source);assert.ok(found.length,'Actual asynchronous suggestions callback');return found;}
// regional = the first local stock (second starter, after BTC), second = the fourth starter, name = what the Nucleo chip shows for the first.
const cases=[['en','en-US','US',null],['es','es-MX','MX',null],['fr','fr-FR','FR','MC.PA','OR.PA','LVMH'],['pt','pt-PT','PT','EDP.LS','GALP.LS','EDP'],['pt','pt-BR','BR','PETR4.SA','VALE3.SA','Petrobras'],['it','it-IT','IT','ISP.MI','ENEL.MI','Intesa Sanpaolo'],['de','de-DE','DE','SAP.DE','SIE.DE','SAP']];
function webMemory(lang,locale,country,history=[]){const records=new Map([['nucleo.deskMemory',history]]),NW={lang,locale,country,cfg:{quickAccess:['BTC','NVDA','ETH','TSLA','GOLD']},lsGet:(key,fallback)=>records.get(key)??fallback,lsSet:(key,value)=>records.set(key,value),isObj:x=>!!x&&typeof x==='object'&&!Array.isArray(x)};const context=vm.createContext({NW,CFG:NW.cfg,K:{desk:'nucleo.deskMemory'},WATCH_LIMIT:12,S:{},Date});vm.runInContext('S.quickAccess='+expression('nucleo/src/web/20-web-state.js','S.quickAccess')+';S.recordQuery='+expression('nucleo/src/web/20-web-state.js','S.recordQuery'),context);return{context,records,quick:limit=>context.S.quickAccess(limit)};}
for(const[lang,locale,country,regional,second,name]of cases){
 const memory=webMemory(lang,locale,country);
 check(locale+': actual web empty-history row is BTC, first local stock, NVDA, second local stock (BTC/NVDA first without a region)',()=>{const row=clean(memory.quick(5));if(regional)assert.deepEqual(row,['BTC',regional,'NVDA',second]);else assert.deepEqual(row.slice(0,2),['BTC','NVDA']);assert.equal(new Set(row).size,row.length);});
 const history=[{symbol:'VOW3.DE',lastAskedAt:20,count:2},{symbol:'SOL',lastAskedAt:10,count:1}],personal=webMemory(lang,locale,country,history),before=JSON.stringify(history);
 check(locale+': history remains first and unmodified while defaults pad missing slots',()=>{const row=clean(personal.quick(5));assert.deepEqual(row.slice(0,2),['VOW3.DE','SOL']);assert.ok(row.includes('BTC'));assert.ok(row.includes('NVDA'));assert.equal(JSON.stringify(history),before);});
 const full=Array.from({length:5},(_,n)=>({symbol:'CUSTOM'+n+'.PA',lastAskedAt:20-n,count:1})),owned=webMemory(lang,locale,country,full);
 check(locale+': full real history is never replaced by automatic starters',()=>assert.deepEqual(clean(owned.quick(5)),full.map(x=>x.symbol)));
 check(locale+': real query updates keep recency and counts',()=>{personal.context.S.recordQuery('sol',false);assert.equal(personal.records.get('nucleo.deskMemory')[0].symbol,'SOL');assert.equal(personal.records.get('nucleo.deskMemory')[0].count,2);});
 for(const directory of ['ios/Bobby/Nucleo','nucleo']){
  const context=vm.createContext({W:{sugg:{quickAccess:memory.quick(5).map(symbol=>({symbol})),movers:[{symbol:'OTHER'}]}},LANG:lang,console});
  vm.runInContext(read(directory+'/src/onboarding/40-strings.js'),context);
  vm.runInContext(declaration(directory+'/src/onboarding/60-fsm.js','suggestionChips'),context);
  check(directory+' '+locale+': actual onboarding uses compact visible starters and localized actions',()=>{const chips=clean(context.suggestionChips());assert.equal(chips.length,3);if(regional){assert.deepEqual(chips.map(x=>x.label),['BTC',name,'NVIDIA']);assert.deepEqual(chips.map(x=>x.action.symbol),['BTC',regional,'NVDA']);}else assert.deepEqual(chips.slice(0,2).map(x=>x.label),['BTC','NVIDIA']);for(const chip of chips){assert.equal(chip.ariaLabel,chip.action.ask);assert.ok(chip.action.ask.includes(chip.action.symbol));assert.ok(chip.action.ask.length>chip.action.symbol.length);}});
  context.W.sugg={quickAccess:[{symbol:'VOW3.DE'},{symbol:'SOL'},{symbol:'BTC'}],movers:[]};
  check(directory+' '+locale+': actual onboarding keeps personal suggestions instead of inventing history',()=>assert.deepEqual(clean(context.suggestionChips()).map(x=>x.label),['VOW3.DE','SOL','BTC']));
  check(directory+' '+locale+': actual idle entry shows returned suggestions',()=>{
   const calls=[],motion={x:0,t:0,to(){},set(){},moving(){return false;}},ctx=vm.createContext({ST:{name:'IDLE'},STATES:{},SUGG:{quickAccess:memory.quick(5).map(symbol=>({symbol}))},LANG:lang,RMOD:null,A:{th:motion,greet:{},chips:[]},U:{faceOn:motion,presence:motion},pillMode(){},idleMode(){},idleHint(){},hint(){},tt:x=>x,lineShown:()=>false,setGreeting(){},greetIn(){},meriIn(){},chipsShow:(list)=>calls.push(list),chipsHide(){}});
   vm.runInContext(read(directory+'/src/shared/20-read-model.js'),ctx);ctx.RMOD=ctx.NucleoReadModel;
   vm.runInContext(declaration(directory+'/src/app/55-read.js','showIdleSuggestions'),ctx);
   vm.runInContext('STATES.IDLE='+expression(directory+'/src/app/60-fsm.js','STATES.IDLE'),ctx);
   ctx.STATES.IDLE.enter();assert.equal(calls.length,1);if(regional){assert.deepEqual(clean(calls[0]).map(x=>x.label),['BTC',name,'NVIDIA']);assert.deepEqual(clean(calls[0]).map(x=>x.action.symbol),['BTC',regional,'NVDA']);}else assert.deepEqual(clean(calls[0]).slice(0,2).map(x=>x.label),['BTC','NVIDIA']);for(const chip of calls[0])assert.equal(chip.ariaLabel,chip.action.question);
   let tapped=0;ctx.chipG=()=>{tapped++;return'tap';};assert.equal(ctx.STATES.IDLE.down('chip',{},{}),'tap');assert.equal(tapped,1);
  });
 }
}
check('empty and malformed suggestion replies render no invented symbols',()=>{for(const directory of['ios/Bobby/Nucleo','nucleo']){const calls=[],ctx=vm.createContext({ST:{name:'IDLE'},SUGG:{quickAccess:[{},null,{symbol:''}]},LANG:'de',RMOD:{t:()=>''},chipsShow:list=>calls.push(list),chipsHide(){}});vm.runInContext(declaration(directory+'/src/app/55-read.js','showIdleSuggestions'),ctx);ctx.showIdleSuggestions();assert.ok(!calls.length||calls[0].length===0);}});
check('late suggestions update the idle consumer without resetting another state',()=>{for(const directory of['ios/Bobby/Nucleo','nucleo']){const seen=[],ctx=vm.createContext({ST:{name:'IDLE'},SUGG:null,showIdleSuggestions:()=>seen.push(ctx.SUGG)});vm.runInContext(declaration(directory+'/src/app/55-read.js','receiveSuggestions'),ctx);const reply={quickAccess:[{symbol:'BTC'},{symbol:'NVDA'}]};ctx.receiveSuggestions(reply);assert.equal(seen[0],reply);ctx.ST.name='READING';ctx.receiveSuggestions(reply);assert.equal(seen.length,1);const boot=read(directory+'/src/app/99-boot.js');assert.ok(boot.includes('receiveSuggestions(x)'));}});
for(const directory of['ios/Bobby/Nucleo','nucleo'])for(const callback of suggestionsCallbacks(directory+'/src/app/99-boot.js')){
 const seen=[],ctx=vm.createContext({ST:{name:'IDLE'},SUGG:null,LANG:'de',OWNER_GEN:3,gen:3,chipsShow:list=>seen.push(list),chipsHide(){}});vm.runInContext(read(directory+'/src/shared/20-read-model.js'),ctx);ctx.RMOD=ctx.NucleoReadModel;vm.runInContext(declaration(directory+'/src/app/55-read.js','showIdleSuggestions')+'\n'+declaration(directory+'/src/app/55-read.js','receiveSuggestions'),ctx);const consumer=vm.runInContext('('+callback+')',ctx),reply={quickAccess:[{symbol:'BTC'},{symbol:'NVDA'}]};
 await Promise.resolve(reply).then(consumer);
 check(directory+': real resolved suggestions callback renders compact idle chips',()=>{assert.equal(ctx.SUGG,reply);assert.deepEqual(clean(seen[0]).map(chip=>chip.label),['BTC','NVIDIA']);assert.equal(seen[0][0].action.question,'Wie steht es um BTC?');assert.equal(seen[0][0].ariaLabel,seen[0][0].action.question);});
 if(directory.startsWith('ios/')){seen.length=0;ctx.SUGG=null;ctx.OWNER_GEN=4;await Promise.resolve(reply).then(consumer);check(directory+': stale account suggestions cannot overwrite the new account',()=>{assert.equal(ctx.SUGG,null);assert.equal(seen.length,0);});}
}
for(const directory of['ios/Bobby/Nucleo','nucleo']){
 check(directory+': compact starter is a new read and follow-up still comes from the saved read',()=>{const calls=[],ctx=vm.createContext({A:{chipX:{x:0}},READ:{question:'old'},tick(){},go:(state,params)=>calls.push({state,params})});vm.runInContext(declaration(directory+'/src/app/60-fsm.js','chipAct'),ctx);ctx.chipAct({x:20,w:80,action:{question:'BTC question',starter:true}});ctx.chipAct({x:20,w:80,action:{question:'NVDA question'}});assert.equal(calls[0].params.fromRead,false);assert.equal(calls[1].params.fromRead,true);});
 check(directory+': idle starters do not masquerade as an open reading',()=>{const ctx=vm.createContext({A:{cardsOn:false,vCond:{t:0},chartT0:Infinity,chips:[{action:{starter:true}}]},U:{flood:{t:0}},capCur:-1});vm.runInContext(declaration(directory+'/src/app/60-fsm.js','readShowing'),ctx);assert.equal(ctx.readShowing(),false);ctx.A.chips=[{action:{question:'real follow-up'}}];assert.equal(ctx.readShowing(),true);});
}

function reactProgress(lang,locale,saved){
 const storage=new Map([['bobby_lang',lang],['bobby_locale',locale]]);if(saved)storage.set('bobby.companion.progress.v1',JSON.stringify(saved));
 const context=vm.createContext({console,Intl,URL,URLSearchParams,navigator:{language:locale,languages:[locale]},window:{location:{origin:'https://bobby.test',search:'',href:'https://bobby.test/desk'}},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value))}}),cache=new Map();
 function load(file){if(cache.has(file))return cache.get(file);const module={exports:{}};cache.set(file,module.exports);const require=name=>{if(name==='react')return{useSyncExternalStore:(_subscribe,get)=>get()};const base=name.startsWith('@/')?'src/'+name.slice(2):path.posix.normalize(path.posix.join(path.posix.dirname(file),name));for(const candidate of[base,base+'.ts',base+'.tsx'])if(fs.existsSync(path.join(root,candidate)))return load(candidate);throw new Error('Unexpected dependency '+name);};const code=ts.transpileModule(read(file).replaceAll('import.meta.env.DEV','false'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInContext('(function(require,module,exports){'+code+'})',context)(require,module,module.exports);cache.set(file,module.exports);return module.exports;}
 return{context,storage,load};
}
for(const[lang,locale,_country,regional,second,name]of cases){
 const b=reactProgress(lang,locale),store=b.load('src/lib/companions/progress.ts').progressStore,i=b.load('src/lib/companions/i18n.ts');
 check(locale+': actual React progress starts BTC, first local stock, NVDA, second local stock (BTC/NVDA first without a region)',()=>{const symbols=clean(store.get().quickAccess);if(regional)assert.deepEqual(symbols,['BTC',regional,'NVDA',second]);else assert.deepEqual(symbols.slice(0,2),['BTC','NVDA']);assert.equal(store.get().quickAccessCustomized,false);});
 const source=ts.createSourceFile('desk.tsx',read('src/components/nucleo/NucleoDesk.tsx'),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let initializer;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='suggestions')initializer=node.initializer.getText(source);ts.forEachChild(node,visit);}visit(source);assert.ok(initializer);
 const calls=[];Object.assign(b.context,{done:false,snapshot:null,progress:store.get(),howLooks:sym=>i.t('How does '+sym+' look?','¿Cómo se ve '+sym+'?','Como está '+sym+'?'),ask:(symbol,question)=>calls.push({symbol,question})});
 vm.runInContext('var actualSuggestions='+initializer+';',b.context);
 check(locale+': actual React idle consumer keeps short labels and translated click questions',()=>{const chips=b.context.actualSuggestions,labels=clean(chips).map(x=>x.label);assert.equal(chips.length,3);chips.forEach(chip=>chip.go());if(regional){assert.deepEqual(calls.map(x=>x.symbol),['BTC',regional,'NVDA']);assert.equal(labels[0],'BTC');assert.equal(labels[2],'NVIDIA');/* the local chip is short: the company, or the ticker until the React desk adopts the company name */assert.ok([name,regional].includes(labels[1]),labels[1]);}else{assert.deepEqual(labels.slice(0,2),['BTC','NVIDIA']);assert.deepEqual(calls.slice(0,2).map(x=>x.symbol),['BTC','NVDA']);}chips.forEach((chip,n)=>assert.equal(chip.ariaLabel,calls[n].question));});
 for(const saved of[{quickAccess:['MC.PA','TTE.PA','BTC']},{quickAccess:['BTC','NVDA','MC.PA','TTE.PA'],quickAccessCustomized:false}]){const old=reactProgress(lang,locale,saved).load('src/lib/companions/progress.ts').progressStore;check(locale+': saved automatic rows refresh rather than become fake personal history',()=>{assert.deepEqual(clean(old.get().quickAccess),clean(store.get().quickAccess));assert.equal(old.get().quickAccessCustomized,false);});}
 const personal={quickAccess:['VOW3.DE','SOL','BTC'],quickAccessCustomized:true};
 check(locale+': explicit personal React choices survive the language change',()=>assert.deepEqual(clean(reactProgress(lang,locale,personal).load('src/lib/companions/progress.ts').progressStore.get().quickAccess),personal.quickAccess));
}

if(process.argv.includes('--swift')){
 const directory=path.join(root,'work/global-quick-access-swift');fs.mkdirSync(directory,{recursive:true});
 const language=read('ios/Bobby/Sources/Localization.swift').split('/// Retains a stable catalog key')[0];
 const tests=`
final class MemoryDefaults: UserDefaults {
 var values: [String:Any] = [:]
 init() { super.init(suiteName: "Bobby.GlobalQuickAccess.TestDouble")! }
 override func object(forKey key:String)->Any? { values[key] }
 override func set(_ value:Any?,forKey key:String) { values[key]=value }
 override func removeObject(forKey key:String) { values.removeValue(forKey:key) }
 override func string(forKey key:String)->String? { values[key] as? String }
 override func data(forKey key:String)->Data? { values[key] as? Data }
 override func bool(forKey key:String)->Bool { values[key] as? Bool ?? false }
 override func integer(forKey key:String)->Int { values[key] as? Int ?? 0 }
}
var checks=0
func require(_ condition:Bool,_ label:String) { guard condition else { fatalError(label) };checks += 1 }
for (lang,locale,regional) in [("en","en-US",nil),("es","es-MX",nil),("fr","fr-FR",["MC.PA","OR.PA"]),("pt","pt-PT",["EDP.LS","GALP.LS"]),("pt","pt-BR",["PETR4.SA","VALE3.SA"]),("it","it-IT",["ISP.MI","ENEL.MI"]),("de","de-DE",["SAP.DE","SIE.DE"])] as [(String,String,[String]?)] {
 let resolution=LanguageResolution.resolve(selection:lang,preferredLanguages:[locale],region:nil)
 let fallback=DeskMemory.defaultQuickAccess(for:resolution)
 if let regional { require(fallback == ["BTC",regional[0],"NVDA",regional[1]],locale+" BTC, first local stock, NVDA, second local stock") }
 else { require(Array(fallback.prefix(2)) == ["BTC","NVDA"],locale+" universal starters") }
 let defaults=MemoryDefaults(),memory=DeskMemory(defaults:defaults)
 require(memory.quickAccess(fallback:fallback)==fallback,locale+" empty history")
 memory.recordQuery(symbol:"VOW3.DE",isEquity:true,now:Date(timeIntervalSince1970:100))
 memory.recordQuery(symbol:"SOL",isEquity:false,now:Date(timeIntervalSince1970:101))
 let original=memory.watchlist,row=memory.quickAccess(fallback:fallback)
 require(Array(row.prefix(2)) == ["SOL","VOW3.DE"],locale+" personal history comes first")
 require(row.contains("BTC") && row.contains("NVDA"),locale+" starter padding")
 require(memory.watchlist==original,locale+" memory never rewritten")
 require(Set(row).count==row.count,locale+" no duplicate chips")
 for index in 0..<5 {memory.recordQuery(symbol:"CUSTOM\\(index).PA",isEquity:true,now:Date(timeIntervalSince1970:Double(102+index)))}
 require(memory.quickAccess(fallback:fallback)==memory.watchlist.prefix(5).map(\\.symbol),locale+" full history preserved")
}
print("\\(checks) actual Swift quick-access assertions passed")
`;
 const file=path.join(directory,'main.swift');fs.writeFileSync(file,language+'\n'+read('ios/Bobby/Sources/DeskMemory.swift')+'\n'+tests);
 check('actual Swift resolver and DeskMemory preserve common starters, regional padding and real history',()=>{const output=execFileSync('swift',['-module-cache-path',path.join(directory,'module-cache'),file],{encoding:'utf8',maxBuffer:1024*1024});console.log(output.trim());});
}
console.log(JSON.stringify({result:failures?'FAIL':'PASS',checks,failures,networkCalls:0,microphoneCalls:0,scope:'actual source quick-access, onboarding and idle consumers plus local Swift methods'},null,2));
if(failures)process.exitCode=1;
