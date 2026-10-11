import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/onboarding/75-first-run.js',import.meta.url),'utf8');
function intro(){
  const timers=[],calls=[];
  const c={ENTER:{ASK_TEACH:()=>{}},W:{state:'ASK_TEACH'},T:0,RM:false,FIT:1,FIRST_HELLO_UNTIL:0,
    titleEl:{style:{}},subEl:{style:{}},stage:{style:{setProperty:()=>{}}},chipEls:[],
    firstRunKeyboard:{style:{},setAttribute:()=>{}},Ls:key=>key,setPill:()=>{},tb:()=>{},
    at:(_,fn)=>timers.push(fn),setChips:()=>{},firstRunExamples:()=>[],loadSugg:()=>({then:()=>{}}),
    renderTexts:()=>{c.titleEl.style.fontSize='34px';}};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('var firstRunAskEnter='),source.indexOf('function firstRunExamples(){')),c);
  c.firstRunTitle=()=>{calls.push('ready title');c.FIRST_HELLO_UNTIL=0;};
  vm.runInContext(source.slice(source.indexOf('var firstRunRenderTexts='),source.indexOf("document.addEventListener('pointerdown'")),c);
  c.ENTER.ASK_TEACH({hello:true});return{c,timers,calls};
}
test('first-run C1 remains 22/27 after the legacy span constructor restores its 34px default',()=>{
  const{c}=intro();c.renderTexts();assert.equal(c.titleEl.style.fontSize,'22px');assert.equal(c.titleEl.style.lineHeight,'27px');
});
test('first-run intro deadline cannot revive a ready title over consent after an early question',()=>{
  const{c,timers,calls}=intro();c.W.state='RISK';timers.forEach(fn=>fn());assert.deepEqual(calls,[]);
});
test('first-run intro deadline retires after touch instead of restarting the ready title',()=>{
  const{c,timers,calls}=intro();c.firstRunTitle();timers.forEach(fn=>fn());assert.deepEqual(calls,['ready title']);
});
