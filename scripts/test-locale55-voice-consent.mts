import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createContext, runInContext } from 'node:vm';
import { readFileSync } from 'node:fs';

// Execute the actual hook callbacks with a small hook/browser harness. This is
// callback and cancellation coverage, not a rendered UI or live-provider test.
const progressSource = readFileSync('src/lib/companions/progress.ts', 'utf8');
const noticeVersion = Number(/RISK_NOTICE_VERSION = (\d+)/.exec(progressSource)?.[1]);
assert.ok(noticeVersion >= 7, 'live microphone disclosure must invalidate earlier web permissions');
let checks = 1;
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a,b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const settle = async () => { for(let i=0;i<30;i++) await Promise.resolve(); };
const deferred = <T>() => { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>resolve=r); return {promise,resolve}; };
const stubs: Record<string,string> = {
  react: `export const useRef=v=>({current:v}); export const useCallback=f=>f; export const useState=v=>{let x=typeof v==='function'?v():v; return [x,next=>{x=typeof next==='function'?next(x):next;}];}; export const useEffect=f=>{globalThis.h.effects.push(f);};`,
  '@/lib/companions/progress': `export const RISK_NOTICE_VERSION=${noticeVersion}; export const progressStore={get:()=>globalThis.h.permission,subscribe:f=>{globalThis.h.listeners.add(f);return ()=>globalThis.h.listeners.delete(f);}};`,
  '@/lib/companions/i18n': `export const lang=()=> 'fr';export const locale=()=> 'fr-FR';export const ttsLang=lang;export const speechLocale=locale;export const translateText=(lang,text)=>text;`,
  '@/lib/app-language': `export const appLanguage=v=>String(v??'en').split('-')[0];export const appLocale=(lang,locale)=>lang==='pt'?(locale==='pt-BR'?'pt-BR':'pt-PT'):({en:'en-US',es:'es-MX',fr:'fr-FR',it:'it-IT',de:'de-DE'}[lang]??'en-US');`,
  '@/lib/voice-assets': `export const normalizeAssetSymbol=s=>s;export const matchAssetInText=()=>null;`,
  '@/lib/realtime-context': `export const voiceScreenState=(s,t)=>({symbol:s??'MC.PA',timeframe:t??'1d'});export const voiceScreenContext=()=> 'test-only context';`,
  '@/lib/bobby-db-client': `export const bobbySupabase=()=>({auth:{getSession:()=>globalThis.h.getSession()}});`,
  '@/lib/agent-voice': `export const getConfiguredVoice=()=> 'cio';`,
};
async function compiled(file:string) {
  const result=await build({entryPoints:[file],bundle:true,write:false,format:'cjs',platform:'node',logLevel:'silent',plugins:[{
    name:'hook-test-stubs',setup(api){
      api.onResolve({filter:/^(?:react|@\/lib\/)/},args=>stubs[args.path] ? {path:args.path,namespace:'stub'} : undefined);
      api.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}));
    },
  }]}); return result.outputFiles[0].text;
}
const realtimeCode=await compiled('src/hooks/useRealtimeVoice.ts');
const bobbyCode=await compiled('src/hooks/useBobbyVoice.ts');
const companionCode=await compiled('src/hooks/useCompanionVoice.ts');
function mount(code:string,name:string,accepted=false,version=noticeVersion) {
  const h:any={effects:[],listeners:new Set<Function>(),permission:{aiConsentGranted:accepted,riskNoticeVersion:version},fetches:[],audio:[],micCalls:0,authCalls:0,pcCount:0,tracksStopped:0,pcClosed:0,contextClosed:0,sent:[],cleanups:[]};
  h.getSession=async()=>{h.authCalls++;return {data:{session:{access_token:'test-only'}}};};
  const track={enabled:true,stop(){h.tracksStopped++;}};
  const mic={getAudioTracks:()=>[track],getTracks:()=>[track]};
  h.getMic=async()=>{h.micCalls++;return mic;};
  h.fetch=async(url:string,init:any)=>{h.fetches.push({url,init});return {ok:true,status:200,json:async()=>({sdp:'test-only answer',lease_id:'test-only lease',max_duration_seconds:180,instructions:'test-only'}),arrayBuffer:async()=>new ArrayBuffer(128),blob:async()=>new Blob([new Uint8Array(600)],{type:'audio/mpeg'})};};
  class AudioMock {src='';srcObject:any=null;autoplay=false;currentTime=0;onended:any;onerror:any;plays=0;pauses=0;constructor(){h.audio.push(this);}play(){this.plays++;return Promise.resolve();}pause(){this.pauses++;}}
  const node=()=>({fftSize:0,frequencyBinCount:16,connect(){},getByteTimeDomainData(){}});
  class ContextMock {state='running';destination={};resume(){return h.resume?.()??Promise.resolve();}close(){this.state='closed';h.contextClosed++;return Promise.resolve();}createAnalyser(){return node();}createMediaStreamSource(){return node();}createMediaElementSource(){return node();}}
  class PeerMock {connectionState='new';ontrack:any;onconnectionstatechange:any;constructor(){h.pcCount++;}addTrack(){}createDataChannel(){return {readyState:'open',send:(s:string)=>h.sent.push(s),close(){}};}createOffer(){return Promise.resolve({sdp:'test-only offer'});}setLocalDescription(){return Promise.resolve();}setRemoteDescription(){return Promise.resolve();}close(){h.pcClosed++;}}
  let timer=0;
  const timeout=(f:Function,ms:number)=>{if(ms===0)queueMicrotask(()=>f());return ++timer;};
  const world:any={h,exports:{},module:{exports:{}},console,Promise,Map,Set,Math,Date,JSON,Number,String,Boolean,Error,Object,Array,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,AbortController,AbortSignal,Blob,URL:{createObjectURL:()=> 'blob:test-only',revokeObjectURL(){}},Audio:AudioMock,AudioContext:ContextMock,RTCPeerConnection:PeerMock,
    navigator:{mediaDevices:{getUserMedia:()=>h.getMic()}},localStorage:{getItem:()=>null},setTimeout:timeout,clearTimeout(){},setInterval:()=>++timer,clearInterval(){},requestAnimationFrame:()=>++timer,cancelAnimationFrame(){},fetch:(url:string,init:any)=>h.fetch(url,init)};
  world.window={AudioContext:ContextMock,setTimeout:timeout,clearTimeout(){},addEventListener(){},removeEventListener(){},speechSynthesis:{cancel(){},getVoices:()=>[]}};
  h.runtime=world;
  world.exports=world.module.exports;
  const context=createContext(world);runInContext(code,context);
  h.hook=world.module.exports[name](...(name==='useRealtimeVoice'?['fr','tap-to-talk',{locale:'fr-FR'}]:[]));
  for(const effect of h.effects){const cleanup=effect();if(typeof cleanup==='function')h.cleanups.push(cleanup);}
  h.change=(accepted:boolean,version=noticeVersion)=>{h.permission={aiConsentGranted:accepted,riskNoticeVersion:version};for(const f of [...h.listeners])f();};
  h.unmount=()=>{for(const f of h.cleanups)f();};
  return {h,mic,track};
}

// Neither false consent nor a stale acceptance can touch auth/mic/RTC/TTS/audio.
for(const accepted of [false,true]) {
  const version=accepted?noticeVersion-1:noticeVersion;
  const {h}=mount(realtimeCode,'useRealtimeVoice',accepted,version);
  await h.hook.connect();h.hook.startTalking();await h.hook.requestAssetBrief('MC.PA');
  eq(h.authCalls,0);eq(h.micCalls,0);eq(h.pcCount,0);eq(h.fetches.length,0);eq(h.audio.length,0);eq(h.sent.length,0);h.unmount();
  const {h:v}=mount(bobbyCode,'useBobbyVoice',accepted,version);
  v.hook.initVoiceContext();await v.hook.speak('Test-only words');await v.hook.speakLocal('Test-only words');v.hook.queueSentence('Test-only words');await settle();
  eq(v.fetches.length,0);eq(v.audio.length,0);eq(v.hook.getLastResponseAudio(),null);v.unmount();
  const {h:c}=mount(companionCode,'useCompanionVoice',accepted,version);
  await c.hook.speak('Test-only companion words',{voice:'cio'});eq(c.fetches.length,0);eq(c.audio.length,0);c.unmount();
}
// Withdraw while auth is pending; even re-accepting cannot revive the old attempt.
{
  const {h}=mount(realtimeCode,'useRealtimeVoice',true);const auth=deferred<any>();
  h.getSession=()=>{h.authCalls++;return auth.promise;};const pending=h.hook.connect();h.change(false);h.change(true);
  auth.resolve({data:{session:{access_token:'test-only'}}});await pending;
  eq(h.authCalls,1);eq(h.micCalls,0);eq(h.fetches.length,0);h.unmount();
}
// An unresolved browser permission may finish later; obtained tracks must be stopped.
{
  const {h,mic}=mount(realtimeCode,'useRealtimeVoice',true);const media=deferred<any>();h.getMic=()=>{h.micCalls++;return media.promise;};
  const pending=h.hook.connect();await settle();eq(h.micCalls,1);h.change(false);media.resolve(mic);await pending;
  eq(h.fetches.length,0);eq(h.pcCount,0);ok(h.tracksStopped>=1);h.unmount();
}
// Pending SDP is abortable. A late server lease is closed with action:stop only.
{
  const {h}=mount(realtimeCode,'useRealtimeVoice',true);const server=deferred<any>();
  h.fetch=(url:string,init:any)=>{h.fetches.push({url,init});return JSON.parse(init.body).action==='stop'?Promise.resolve({}):server.promise;};
  const pending=h.hook.connect();await settle();eq(h.fetches.length,1);ok(h.fetches[0].init.signal instanceof AbortSignal);
  h.change(false);ok(h.fetches[0].init.signal.aborted);ok(h.tracksStopped>=1);ok(h.pcClosed>=1);
  server.resolve({ok:true,json:async()=>({lease_id:'late-test-only',sdp:'answer'})});await pending;
  eq(h.fetches.length,2);eq(JSON.parse(h.fetches[1].init.body).action,'stop');
  await h.hook.connect();await h.hook.requestAssetBrief('MC.PA');eq(h.fetches.length,2);h.unmount();
}
// Tool requests share withdrawal cancellation; no retry is allowed afterwards.
{
  const {h}=mount(realtimeCode,'useRealtimeVoice',true);const tool=deferred<any>();h.fetch=(url:string,init:any)=>{h.fetches.push({url,init});return tool.promise;};
  const pending=h.hook.requestAssetBrief('MC.PA');eq(h.fetches.length,1);h.change(false);ok(h.fetches[0].init.signal.aborted);
  tool.resolve({ok:true,json:async()=>({quick_brief:{latencyMs:1}})});await pending;await h.hook.requestAssetBrief('SAP.DE');eq(h.fetches.length,1);h.unmount();
}
// TTS generation is abortable and late audio cannot play or become a replay blob.
{
  const {h}=mount(bobbyCode,'useBobbyVoice',true);const tts=deferred<any>();h.fetch=(url:string,init:any)=>{h.fetches.push({url,init});return tts.promise;};
  const pending=h.hook.speak('Test-only words');await settle();eq(h.fetches.length,1);eq(JSON.parse(h.fetches[0].init.body).locale,'fr-FR');eq(JSON.parse(h.fetches[0].init.body).lang,'fr');
  h.change(false);ok(h.fetches[0].init.signal.aborted);tts.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(128)});await pending;
  eq(h.audio.length,0);eq(h.hook.getLastResponseAudio(),null);h.hook.queueSentence('Retry test-only words');await settle();eq(h.fetches.length,1);h.unmount();
}
// stop() also invalidates asynchronous cache hashing before any network controller exists.
{
  const {h}=mount(bobbyCode,'useBobbyVoice',true);const hash=deferred<ArrayBuffer>();h.runtime.crypto={subtle:{digest:()=>hash.promise}};
  const pending=h.hook.speak('Test-only cache wait');h.hook.stop();hash.resolve(new ArrayBuffer(32));await pending;
  eq(h.fetches.length,0);eq(h.audio.length,0);h.unmount();
}
// speakLocal queues its first sentence immediately after stop, without waiting for a second sentence.
{
  const {h}=mount(bobbyCode,'useBobbyVoice',true);await h.hook.speakLocal('Test-only first local sentence','fr');await settle();
  eq(h.fetches.length,1);eq(h.audio.length,1);eq(h.audio[0].plays,1);h.change(false);h.unmount();
}
// With valid permission, playback remains available; withdrawal pauses and clears replay.
{
  const {h}=mount(bobbyCode,'useBobbyVoice',true);h.hook.queueSentence('Test-only playback words','cio','fr');await settle();
  eq(h.fetches.length,1);eq(h.audio.length,1);eq(h.audio[0].plays,1);ok(h.hook.getLastResponseAudio() instanceof Blob);
  h.change(false);ok(h.audio[0].pauses>=1);eq(h.hook.getLastResponseAudio(),null);h.unmount();
}
// Companion playback cannot restart when an awaited AudioContext resume resolves after withdrawal/unmount.
for (const action of ['withdraw', 'unmount']) {
  const {h}=mount(companionCode,'useCompanionVoice',true);const resumed=deferred<void>();let resumeCalls=0;
  h.resume=()=>{resumeCalls++;return resumed.promise;};
  const pending=h.hook.speak('Test-only companion resume race',{voice:'cio'});await settle();
  eq(h.fetches.length,1);eq(resumeCalls,1);eq(h.audio.length,1);eq(h.audio[0].plays,0);
  if(action==='withdraw') h.change(false); else h.unmount();
  resumed.resolve();await pending;
  eq(h.audio[0].plays,0);ok(h.audio[0].pauses>=1);
  if(action==='withdraw') h.unmount();
}
// The new checkpoint still permits playback with current local consent.
{
  const {h}=mount(companionCode,'useCompanionVoice',true);
  await h.hook.speak('Test-only authorized companion playback',{voice:'cio'});
  eq(h.fetches.length,1);eq(h.audio.length,1);eq(h.audio[0].plays,1);h.change(false);h.unmount();
}
console.log(`web voice permission v${noticeVersion}: ${checks} callback/cancellation checks passed; browser/network mocked.`);
