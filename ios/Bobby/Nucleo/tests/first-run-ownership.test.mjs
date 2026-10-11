import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/onboarding/96-conversation-input.js',import.meta.url),'utf8');
function ownership() {
  const timers=[],events={},calls=[];
  const c={ W:{state:'HELD_DRAFT',listenSeq:0,speechDraft:'kept words',press:null}, TALK_MODE:'tap',T:0,firstRunInputSeq:0,firstRunSendPending:false,
    BR:{on:(name,fn)=>events[name]=fn},wireEvents:()=>{},cancelInput:()=>calls.push('cancel pointer'),
    firstRunListen:()=>calls.push('listen'), firstRunAutoStop:caption=>calls.push(caption), firstRunPillDown:()=>{},pillDown:()=>{},pillUp:()=>{},
    at:(_,fn)=>timers.push(fn),fire:(method,p)=>calls.push([method,p]),endListenVisual:()=>{},typeIn:{blur:()=>{},value:''},window:{scrollTo:()=>{}},
    firstRunBase:'',go:state=>{c.W.state=state;},askRelease:()=>calls.push('legacy release') };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function firstRunCancelCapture(){'),source.indexOf('function firstRunType(){')),c);
  vm.runInContext(source.slice(source.indexOf('var firstRunPillDown='),source.indexOf('pillUp=function(')),c);
  vm.runInContext(source.slice(source.indexOf('var firstRunAskRelease='),source.indexOf('var firstRunSim=')),c);
  c.wireEvents();return {c,timers,events,calls};
}
test('first-run background cancels a held-draft press before its delayed capture can start',()=>{
  const {c,timers,events,calls}=ownership();c.pillDown();assert.equal(timers.length,1);
  c.W.bg=true;events['app.state']({state:'background'});timers.forEach(fn=>fn());
  assert.equal(c.W.firstPress,null);assert.ok(!calls.includes('listen'));assert.ok(calls.includes('cancel pointer'));
});
test('first-run keyboard capture cancellation retires the held press and its pending permission generation',()=>{
  const {c,timers,calls}=ownership();c.pillDown();c.firstRunCancelCapture();timers.forEach(fn=>fn());
  assert.equal(c.firstRunInputSeq,1);assert.equal(c.W.listenSeq,1);assert.equal(c.W.firstPress,null);
  assert.ok(!calls.includes('listen'));assert.deepEqual(JSON.parse(JSON.stringify(calls.find(Array.isArray))),['speech.stop',{cancel:true}]);
});
test('first-run tap drag cancellation retains heard words through auto-stop; HOLD keeps its original release handler',()=>{
  const {c,calls}=ownership();c.W.state='LISTENING';c.askRelease(true);assert.deepEqual(calls,['cap.stopped']);
  c.TALK_MODE='hold';c.askRelease(true);assert.deepEqual(calls,['cap.stopped','legacy release']);
});
