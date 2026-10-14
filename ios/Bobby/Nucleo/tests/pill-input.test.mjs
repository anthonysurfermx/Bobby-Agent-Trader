import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/app/60-fsm.js', import.meta.url), 'utf8');
const actual = source.slice(source.indexOf('function pillDown('), source.indexOf('/* ---------- PRE_PERMISSION'));
function run(seconds, fromRead = false, cancelled = false) {
  let time = 0;
  const calls = [];
  const context = vm.createContext({SES: {mic: {state: 'undetermined'}}, A: {press: {to(){}}},
    tick(){}, hint(){},tt:k=>k, noop(){}, nowT: () => time, go: (...args) => calls.push(args), openTyping: args => calls.push(['typing', args])});
  vm.runInContext(actual, context);
  const g = context.pillDown(null, fromRead);
  assert.equal(calls.length, 0, 'No permission or recording on pointer down');
  time = seconds;
  if (cancelled) g.cancel(); else g.up();
  return JSON.parse(JSON.stringify(calls));
}
test('unconfigured microphone: short tap opens typing without permission', () => assert.deepEqual(run(.1), [['typing', {fromRead:false}]]));
test('short tap on a result preserves the follow-up context', () => assert.deepEqual(run(.1,true), [['typing', {fromRead:true}]]));
test('a deliberate hold opens the voice explanation', () => assert.deepEqual(run(.5), [['PRE_PERMISSION']]));
test('cancelled gesture neither requests permission nor types', () => assert.deepEqual(run(.5,false,true), []));

const conversation = fs.readFileSync(new URL('../src/app/75-conversation-input.js',import.meta.url),'utf8');
const switched = conversation.slice(conversation.indexOf('var holdPillDown='),conversation.indexOf('var legacyListen='));
function switchedRun({mode='tap',state='IDLE',seconds=.1,words='',speaking=false,cancel=false,heldSpoken=true}={}){
 let time=0;const calls=[],timers=[];
 const context=vm.createContext({TALK_MODE:mode,ST:{name:state},CONV_HOLD:false,CONV_LISTEN_SEQ:0,CONV_BASE:'',CONV_PARTIAL:words,HELD:'kept',HELD_SPOKEN:heldSpoken,VOICE:{id:speaking?'v':null,started:speaking,ended:!speaking},A:{press:{to(){}}},
  pillDown:()=>({up:()=>calls.push('legacy-release'),cancel:()=>calls.push('legacy-cancel')}),nowT:()=>time,at:(delay,action)=>timers.push({delay,action}),
  convListen:(hold,append)=>calls.push(['listen',hold,append]),convSend:(text,spoken)=>calls.push(['send',text,spoken]),guideStopVoice:()=>calls.push('stop-voice'),cancelRead:()=>calls.push('cancel-wait'),conversationReturn:()=>calls.push('return'),
  hint(){},tt:k=>k,bcall:(m,p)=>{calls.push([m,p]);return Promise.resolve({})},noop(){},
  STATES:{LISTENING:{release:()=>calls.push('send-explicit')}},tapG:action=>({up:action,cancel(){}})});
 vm.runInContext(switched,context);const g=context.pillDown({x:0,y:0,x0:0,y0:0},false);
 time=seconds;for(const t of timers)if(time>=t.delay)t.action();
 if(cancel)g.cancel();else g.up();return JSON.parse(JSON.stringify(calls));
}
test('tap: rest requests listening on press; release and time never send',()=>assert.deepEqual(switchedRun(),[['listen',false,false]]));
test('tap: a held press with no words keeps listening instead of sending an empty question',()=>assert.deepEqual(switchedRun({seconds:.5}),[['listen',false,false]]));
test('tap: the listening send icon confirms explicitly',()=>assert.deepEqual(switchedRun({state:'LISTENING'}),['send-explicit']));
test('tap: a held draft tap sends; a hold appends',()=>{
 assert.deepEqual(switchedRun({state:'HELD_DRAFT'}),[['send','kept',true]]);
 assert.deepEqual(switchedRun({state:'HELD_DRAFT',heldSpoken:false}),[['send','kept',false]],'A held typed draft must still obey silent mode');
 assert.deepEqual(switchedRun({state:'HELD_DRAFT',seconds:.5}),[['listen',true,true]]);
});
test('tap: a voice tap only stops; a hold starts listening',()=>{
 assert.deepEqual(switchedRun({speaking:true}),['stop-voice']);
 assert.deepEqual(switchedRun({speaking:true,seconds:.5}),[['listen',true,false]]);
});
test('tap: waiting is cancellable on a short tap or hold',()=>{
 for(const seconds of [.1,.5])assert.deepEqual(switchedRun({state:'SENDING',seconds}),['cancel-wait']);
});
test('hold: the switch retains the pinned build69 gesture path',()=>{
 for(const seconds of [.1,.5])assert.deepEqual(switchedRun({mode:'hold',seconds}),['legacy-release']);
 assert.deepEqual(switchedRun({mode:'hold',cancel:true}),['legacy-cancel']);
});
