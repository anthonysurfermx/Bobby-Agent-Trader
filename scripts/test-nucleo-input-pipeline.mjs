#!/usr/bin/env node
// Shipping keyboard/state/transcript code -> actual ask wrapper -> deterministic offline bridge.
// Animations and browser layout are substitutes; normalization, events, clocks and payloads are not.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const ref = process.argv.find(x => x.startsWith('--source-ref='))?.slice(13);
const cache = new Map();
function source(path) { if (!cache.has(path)) cache.set(path, ref ? execFileSync('git', ['show', `${ref}:${path}`], { cwd: root, encoding: 'utf8' }) : readFileSync(root + path, 'utf8')); return cache.get(path); }
function fn(text, name) {
  const start = text.indexOf(`function ${name}(`), open = text.indexOf('{', start);
  assert.ok(start >= 0, `missing actual function ${name}`);
  let depth = 1, end = open + 1;
  while (depth) { depth += (text[end] === '{') - (text[end] === '}'); end++; }
  return text.slice(start, end);
}
let passed = 0, failed = 0;
function check(label, run) { try { run(); passed++; } catch (error) { failed++; console.error(`FAIL ${label}: ${error.stack}`); } }
class Node {
  constructor(id = '', tagName = 'DIV', doc = null, hit = null) {
    this.id = id; this.tagName = tagName; this.doc = doc; this.hit = hit; this.listeners = {}; this.attributes = {}; this.style = {}; this.value = ''; this.children = []; this.focusCalls = []; this.scrollHeight = 50; this.offsetHeight = 56; this.offsetWidth = 100; this.offsetLeft = 0; this.offsetTop = 0;
    const classes = new Set(); this.classList = { contains: x => classes.has(x), add: x => classes.add(x), remove: x => classes.delete(x), toggle: (x, on) => on ? classes.add(x) : classes.delete(x) };
  }
  set textContent(value) { this.text = String(value); for (const child of this.children) child.parentNode = null; this.children = []; }
  get textContent() { return this.children.length ? this.children.map(x => x.textContent).join('') : (this.text || ''); }
  set innerHTML(value) { this.textContent = value; }
  get innerHTML() { return this.textContent; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) { this.children = this.children.filter(x => x !== child); child.parentNode = null; }
  get previousSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) - 1] || null; }
  addEventListener(name, handler, options) { (this.listeners[name] ||= []).push({ handler, options }); }
  emit(name, data = {}) { const e = { target: this, cancelable: true, key: '', detail: 0, isPrimary: true, pointerId: 1, clientX: 195, clientY: 770, prevented: false, preventDefault() { this.prevented = true; }, ...data }; for (const x of this.listeners[name] || []) x.handler(e); return e; }
  closest(selector) { if (selector === '[data-hit]') return this.hit ? this : null; if (selector === '#typeBox') return ['ta', 'taSend', 'typeIn', 'typeSend', 'typeBox'].includes(this.id) ? this : null; return null; }
  contains(node) { return node === this || node.doc === this.doc; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  removeAttribute(key) { delete this.attributes[key]; }
  getAttribute(key) { return key === 'data-hit' ? this.hit : (this.attributes[key] ?? null); }
  getBoundingClientRect() { return { left: 147, top: 742, width: 96, height: 56 }; }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus(options) { this.focusCalls.push(options); if (this.doc) this.doc.activeElement = this; this.emit('focus'); }
  blur() { if (this.doc?.activeElement === this) this.doc.activeElement = null; this.emit('blur'); }
}
function anim() { return new Proxy({ x: 0, t: 0, to(value) { this.t = value; }, set(value) { this.x = this.t = value; }, tween(value) { this.t = value; }, kill() {}, moving: () => false }, { get(obj, key) { return key in obj ? obj[key] : (obj[key] = anim()); } }); }
function world(surface, page, language, { consent = true, mic = 'denied', deferPermissions = false, askReplies = [], deferAsk = false } = {}) {
  const base = surface === 'native' ? 'ios/Bobby/Nucleo/src/' : 'nucleo/src/';
  const doc = new Node('document', 'DOCUMENT'), elements = new Map();
  const $ = (id, tag = 'DIV', hit = null) => { if (!elements.has(id)) elements.set(id, new Node(id, tag, doc, hit)); return elements.get(id); };
  doc.createElement = tag => new Node('', tag.toUpperCase(), doc); doc.createTextNode = text => { const n = new Node('', '#TEXT', doc); n.nodeType = 3; n.textContent = text; return n; }; doc.getElementById = $; doc.documentElement = new Node('html', 'HTML', doc);
  const stage = $('stage'), pill = $('pill', 'BUTTON', 'pill'), ta = $(page === 'app' ? 'ta' : 'typeIn', 'TEXTAREA'), send = $(page === 'app' ? 'taSend' : 'typeSend', 'BUTTON'), typeBox = $('typeBox');
  doc.elementFromPoint = () => pill;
  const win = new Node('window', 'WINDOW', doc); win.innerHeight = 844; win.PointerEvent = function() {}; win.visualViewport = new Node('viewport'); Object.assign(win.visualViewport, { height: 844, offsetTop: 0 });
  const calls = [], errors = [], uiTimers = [], bus = new Map(), permissions = [], askPending = []; let now = 1000;
  const c = {
    document: doc, D: doc, window: win, stage, pill, $, HARNESS: false, SCRIPTED: false, RM: true, TR: 0, MOCK: false, BR: { on(name, handler) { bus.set(name, handler); }, call(method, params) { calls.push({ method, params: structuredClone(params || {}) }); if (method === 'ask') return deferAsk ? new Promise(resolve=>askPending.push(resolve)) : askReplies.length ? Promise.resolve(askReplies.shift()) : new Promise(() => {}); if (method === 'speech.requestPermission' && deferPermissions) return new Promise((resolve,reject)=>permissions.push({resolve,reject})); if (method === 'suggestions') return Promise.resolve({ quickAccess: [], movers: [] }); if (method === 'speech.start') return Promise.resolve({ status: 'listening' }); return Promise.resolve({ status: 'idle' }); } },
    performance: { now: () => now }, setTimeout(handler, ms) { uiTimers.push({ due: now + ms, handler }); },
    clk: 1, T: 1, last: 0, QUE: [], GEN: 0, fitS: 1, fitX: 0, fitY: 0, FIT: 1, FIT_X: 0, FIT_Y: 0,
    A: anim(), S: anim(), U: anim(), ME: { tint: '', label: '' }, VC: { wait: {} }, PI: Math.PI, TAU: Math.PI * 2, E: {}, BODY: {}, C: {},
    STATES: {}, ENTER: {}, SPEECH: {}, CALLS: 0, OWNER_GEN: 0, READ: null, READ_SEQ: 0, READS_DONE: 0, ASK_ORIGIN: null, LEDGER: [], SAVED: null, ISLAND: null, ROSTER: null, SUGG: null, CHOSEN_ART: null,
    el: { pill, ta, taSend: send, typeBox, tx: $('tx'), dockA: $('dockA'), sphereA: $('sphereA'), avatar: $('avatar'), close: $('close'), permH: $('permH'), permP: $('permP'), permBtn: $('permBtn'), agNm: [0,1,2].map(x => $('agNm'+x)), agSt: [0,1,2].map(x => $('agSt'+x)), cioSw: $('cioSw') },
    txIn: $('txIn'), txEl: $('tx'), rbodyEl: $('rbody'), CARDS: [], cardD: null, DSCROLL: { max: 0 }, RISK_LAYOUT: null,
    clamp: (v,a,b) => Math.max(a,Math.min(b,v)), c01: v => Math.max(0,Math.min(1,v)), lerp: (a,b,t) => a+(b-a)*t, fin: Number.isFinite, f1: String, f3: String,
    V: function() { return anim(); }, mk(tag, klass, text) { const n = doc.createElement(tag); n.className = klass; if (text != null) n.textContent = text; return n; },
    st(el, key, value) { el.style[key] = value; }, sc(el, key, value) { el.style[key] = value; }, att(el, key, value) { el.setAttribute(key,value); }, cls(el,key,on) { el.classList.toggle(key,on); }, txt(el,value) { el.textContent=value; },
    noop() {}, to() {}, crit() {}, hap() {}, tick() {}, buzz() {}, lineShown: () => false, lineSet() {}, report: (where,e) => errors.push(`${where}: ${e.message}`), logErr: (where,e) => errors.push(`${where}: ${e.message}`),
    W: page === 'app' ? win : { state: 'BOOT', gen: 0, stT: 1, log: [], cues: [], haps: [], tm: {}, pr: {}, qw: [], lean: {}, txShift: {}, tintAmt: {}, tint: {}, wash: {}, track: {}, listenSeq: 0, askSeq: 0, micBreath: true, awaitFinal: 0, chips: [] },
    SES: { language, companion: null, mic: { state: mic }, riskAccepted: consent, hints: { idle: 3 } }, SESSION: { language, companion: null, mic: { state: mic }, riskAccepted: consent },
  };
  c.A.meri = []; c.A.ag = []; c.A.rev = []; c.A.tx.words = [];
  const ctx = vm.createContext(c); const run = text => vm.runInContext(text,ctx);
  run(source(base + 'shared/05-locale.js'));
  c.NucleoLocale=win.NucleoLocale;
  run(source(base + 'shared/20-read-model.js')); c.RMOD=win.NucleoReadModel;
  run(source(base + page + '/40-strings.js')); c.LANG=language; c.LOCALE={en:'en-US',es:'es-MX',fr:'fr-FR',pt:'pt-PT',it:'it-IT',de:'de-DE'}[language];
  if (page === 'app') {
    const core=source(base+'app/10-core.js'), reads=source(base+'app/55-read.js');
    // Companion presentation is outside this market-input adapter. Keep the
    // shipping routing predicate and explicit inert presentation hooks.
    if (surface === 'native') {
      run(fn(reads, 'paramsCompanion'));
      Object.assign(c, { CHECKIN:null, GUIDE:null, GUIDE_RETRIES:0, GUIDE_EPOCH:0, GUIDE_INPUT_CHECKIN:false,
        GUIDE_ANSWER_ERROR:'', guidePanel:$('companionPanel'), companionCheckIn(){}, guideResumeOptions:()=>false,
        guideWords:()=>({}), guideRender(){}, dialBusy:false, dialGreeting:false });
    }
    run(['at','cue','runQue'].map(name=>fn(core,name)).join('\n'));
    run(['bcall','startRead','onAskReply','onStage','txWordNew','txKill','txReset','txText','txSet'].map(name=>fn(reads,name)).join('\n'));
    run(source(base+'app/60-fsm.js'));
    run(source(base+'app/70-input.js'));
    if (surface === 'native' && !ref) {
      run(source(base+'app/75-conversation-input.js').split('\n')[1]); // Shipping RAM declarations.
      c.draftPanel = $('conversation-draft');
      c.conversationClearReturns = () => {}; // Render-only animation ghosts.
      run(fn(source(base+'app/75-conversation-input.js'), 'conversationReset'));
    }
    const boot=source(base+'app/99-boot.js');
    run(['applySession','wire','refreshCollections',...(surface==='native'?['resetVisibleRead','accountChanged','consentWithdrawn']:[])].map(name=>fn(boot,name)).join('\n'));
    // Animation helpers have no authority over input normalization, state guards or the ask payload.
    for (const name of ['chromeUp','meriIn','meriOut','greetIn','greetOut','chipsHide','showIdleSuggestions','buildFaces','agentNames','setGreeting','dockIn','dockOut','gather','dimple','tintDuck','ambientCanon','glassHome','moveSphere','tintHome','noteOut','clearRead','dissolveThink','lvlSync','loadCompanionArt','setXpArc','tuneAmbient','applyTemperSprings','sag']) c[name]=()=>{};
    c.noteIn=caption=>{c.lastCaption=caption;}; c.lvlApply=()=>{};
    c.pillMode=()=>{}; c.idleMode=()=>mic==='granted'?'mic':'kbd'; c.idleHint=()=>{}; c.readShowing=()=>false; c.hint=value=>{c.lastHint=value;}; c.vfRoll={set(){}};
    c.go('IDLE');
    c.wire();
  } else {
    const worldSource=source(base+'onboarding/50-world.js');
    run(['at','after','cueStep','tb','tg','tmB','tmG','isOn','setHint','setPill'].map(name=>fn(worldSource,name)).join('\n'));
    run(source(base+'onboarding/60-fsm.js'));
    run(source(base+'onboarding/90-input.js'));
    for (const name of ['beatPost','harnessOn','signal','capGone','moveSphere','gulpK','ripple','textW','loadRisk','setAvatar','buildMatte','nodesOff','tintTo']) c[name]=()=>{};
    c.sayLine=line=>{c.lastCaption=line.text;return line;}; c.companionTint=()=>'';
    c.loadRisk=()=>Promise.resolve(null); c.loadSugg=()=>Promise.resolve(null); c.suggestionChips=()=>[]; c.setChips=()=>{};
    c.promptW=null; c.agN=[];
    c.applyStaticStrings();
    const sim=source(base+'onboarding/70-sim.js'), start=sim.indexOf("  if (W.state === 'LISTENING' && W.awaitFinal"), end=sim.indexOf('  verdictStep();',start);
    run('function inputFinalWatchdog(){\n'+sim.slice(start,end)+'\n}');
    c.go('ASK_TEACH',{quiet:true});
    c.wireEvents();
  }
  return { c, doc, win, stage, pill, ta, send, typeBox, calls, errors, base, permissions, askPending, input:page==='app'?stage:win,
    type(data={}) { page==='app'?c.openTyping(data):c.go('TYPING',data); },
    write(value,inputType='insertText') { ta.value=value; ta.emit('input',{inputType}); },
    state:()=>page==='app'?c.ST.name:c.W.state,
    asks:()=>calls.filter(x=>x.method==='ask'),
    advance(ms) { const end=now+ms; while(now<end){const step=Math.min(20,end-now);now+=step;c.clk+=step/1000;c.T+=step/1000;if(page==='app'){c.runQue();c.STATES[c.ST.name]?.tick?.();}else{c.cueStep();c.inputFinalWatchdog();}for(let i=0;i<uiTimers.length;){if(uiTimers[i].due<=now)uiTimers.splice(i,1)[0].handler();else i++;}} },
    emit(name,payload){if(bus.has(name))bus.get(name)(payload);else if(page==='app')c.fsmEvent(name,payload);},
    flush:async()=>{await Promise.resolve();await Promise.resolve();},
  };
}
const texts={
  en:'How is NVIDIA’s outlook — revenue $12.50, risk 2%?',
  es:'¿Cómo está la acción de NVIDIA? Mañana: caída del 2,5 %.',
  fr:'L’action NVIDIA est-elle chère ? « Risque » : 2,5 %, coût 12,50 €.',
  pt:'A ação da NVIDIA está cara? “Não” — projeção, São Paulo, 12,50 €.',
  it:'Com’è l’azione NVIDIA? «Volatilità» e liquidità: 12,50 €, più o meno.',
  de:'Wie steht NVIDIA? Größere Schwankung, Straße, „Risiko“: 12,50 €.',
};
for(const surface of ['native','web']) for(const page of ['app','onboarding']) for(const [language,text] of Object.entries(texts)){
  const label=`${surface}/${page}/${language}`;
  for(const value of [text,text.normalize('NFD'),`  \t${text}\n\r  `,`${text} 🧑🏽‍💻 👩‍👩‍👧‍👧`,'NVIDIA <script>alert("éßã")</script> & "quotes"']){
    const w=world(surface,page,language);w.type();w.write(value,'insertFromPaste');const entered=w.ta.emit('keydown',{key:'Enter'});w.advance(2200);
    check(`${label}: pasted Unicode reaches actual ask once`,()=>{assert.deepEqual(w.errors,[]);assert.ok(entered.prevented);assert.equal(w.asks().length,1);const expected=page==='app'?value.replace(/\s+/g,' ').trim():value.trim();assert.equal(w.asks()[0].params.question,expected);assert.deepEqual(w.errors,[]);});
  }
  const placeholder=world(surface,page,language);placeholder.type();
  check(`${label}: typing labels use selected language`,()=>{assert.equal(placeholder.ta.placeholder||placeholder.ta.attributes.placeholder,page==='app'?placeholder.c.tt('type.placeholder'):placeholder.c.Ls('type.placeholder'));assert.equal(placeholder.send.attributes['aria-label'],page==='app'?placeholder.c.tt('type.send'):placeholder.c.Ls('type.send'));});
  check(`${label}: opening typing requests focus without scrolling`,()=>{assert.ok(placeholder.ta.focusCalls.length);assert.equal(placeholder.ta.focusCalls[0]?.preventScroll,true);});
  for(const empty of ['', ' \t\n\r ', '\u00a0\u2003\u2028']){
    const w=world(surface,page,language);w.type();w.write(empty);w.ta.emit('keydown',{key:'Enter'});w.send.emit('click');w.advance(2200);
    check(`${label}: empty/Unicode whitespace cannot request a reading`,()=>{assert.equal(w.asks().length,0);assert.equal(w.send.disabled,true);assert.deepEqual(w.errors,[]);});
  }
  for(const count of [page==='app'?1999:1399,page==='app'?2000:1400]){
    const value=(text+' ').repeat(60).slice(0,count), w=world(surface,page,language);w.type();w.write(value,'insertFromPaste');w.send.emit('click');w.advance(2200);
    check(`${label}: long typed input preserves first asset and all Unicode`,()=>{assert.equal(w.asks().length,1);assert.equal(w.asks()[0].params.question,page==='app'?value.replace(/\s+/g,' ').trim():value.trim());assert.deepEqual(w.errors,[]);});
  }
  check(`${label}: textarea does not silently truncate Unicode by UTF-16 length`,()=>{const template=source((surface==='native'?'ios/Bobby/Nucleo/src/':'nucleo/src/')+page+'/template.html'),textarea=template.match(/<textarea\b[^>]*>/)?.[0];assert.ok(textarea);assert.doesNotMatch(textarea,/\bmaxlength\s*=/i);});
  for(const glyph of ['é','😀','e\u0301']){
    const prefix='NVIDIA ', budget=1200-Array.from(prefix).length, full=prefix+glyph.repeat(Math.ceil(budget/Array.from(glyph).length)), accepted=Array.from(full).slice(0,1200).join(''), excessive=accepted+'ß';
    assert.equal(Array.from(accepted).length,1200);assert.equal(Array.from(excessive).length,1201);
    const limit=world(surface,page,language,{askReplies:[{v:1,status:'too_long',maxLength:1200,message:'private server details must not be displayed'}]});limit.type();limit.write(excessive,'insertFromPaste');limit.send.emit('click');limit.advance(2200);await limit.flush();limit.advance(800);
    check(`${label}: too_long returns a localized refusal without truncating ${glyph}`,()=>{assert.equal(limit.asks().length,1);assert.equal(limit.asks()[0].params.question,excessive);assert.equal(limit.state(),'ERROR');assert.equal(limit.c.lastCaption,limit.c.RMOD.t(language,'err.tooLong'));assert.deepEqual(limit.errors,[]);});
    limit.type();
    check(`${label}: explicit editing recovers all 1201 code points (${glyph})`,()=>{assert.equal(limit.ta.value,excessive);assert.equal(limit.asks().length,1);});
    limit.write(accepted,'deleteContentBackward');limit.send.emit('click');await limit.flush();limit.advance(2200);
    check(`${label}: explicit retry sends the exact edited 1200 code points (${glyph})`,()=>{assert.equal(limit.asks().length,2);assert.equal(limit.asks()[1].params.question,accepted);assert.deepEqual(limit.errors,[]);});
  }
  const repeated=world(surface,page,language);repeated.type();repeated.write(text);repeated.ta.emit('keydown',{key:'Enter'});repeated.ta.emit('keydown',{key:'Enter',repeat:true});repeated.send.emit('click');repeated.advance(2200);
  check(`${label}: repeat Enter and trailing click do not duplicate a reading`,()=>{assert.equal(repeated.asks().length,1);assert.deepEqual(repeated.errors,[]);});
  const shift=world(surface,page,language);shift.type();shift.write(text);const newline=shift.ta.emit('keydown',{key:'Enter',shiftKey:true});shift.advance(2500);
  check(`${label}: Shift+Enter preserves draft and does not send`,()=>{assert.equal(newline.prevented,false);assert.equal(shift.ta.value,text);assert.equal(shift.asks().length,0);});
  const composing=world(surface,page,language);composing.type();composing.write(text);composing.ta.emit('compositionstart');const imeEnter=composing.ta.emit('keydown',{key:'Enter',isComposing:true});composing.advance(2500);
  check(`${label}: standard IME Enter does not send or alter text`,()=>{assert.equal(imeEnter.prevented,false);assert.equal(composing.ta.value,text);assert.equal(composing.asks().length,0);});
  composing.ta.emit('compositionend');composing.ta.emit('keydown',{key:'Enter'});composing.advance(2200);
  check(`${label}: explicit Enter after IME completion sends the complete text`,()=>{assert.equal(composing.asks().length,1);assert.equal(composing.asks()[0].params.question,text);});
  for(const kind of ['tracked-enter','legacy-229','escape','button']){
    const w=world(surface,page,language);w.type();w.write(text);w.ta.emit('compositionstart');
    if(kind==='button')w.send.emit('click');else w.ta.emit('keydown',{key:kind==='escape'?'Escape':'Enter',isComposing:kind==='escape',keyCode:kind==='legacy-229'?229:13});
    w.advance(2200);
    check(`${label}: active composition ${kind} remains editable without submission`,()=>{assert.equal(w.asks().length,0);assert.equal(w.state(),'TYPING');assert.equal(w.ta.value,text);});
  }
  const refocus=world(surface,page,language);refocus.type();refocus.ta.blur();refocus.advance(100);refocus.ta.focus();refocus.advance(150);
  check(`${label}: blur/refocus does not cancel the current typing session`,()=>{assert.equal(refocus.state(),'TYPING');assert.equal(refocus.asks().length,0);});
  const blurCompose=world(surface,page,language);blurCompose.type();blurCompose.ta.emit('compositionstart');blurCompose.ta.blur();blurCompose.advance(200);
  check(`${label}: blur during an incomplete composition cannot discard it`,()=>{assert.equal(blurCompose.state(),'TYPING');assert.equal(blurCompose.asks().length,0);});
  const draft=world(surface,page,language);draft.type();draft.write(text);draft.ta.blur();draft.advance(200);
  check(`${label}: losing focus retains nonempty draft without sending`,()=>{assert.equal(draft.ta.value,text);assert.equal(draft.asks().length,0);});
  const typedBackground=world(surface,page,language);typedBackground.type();typedBackground.write(text);typedBackground.emit('app.state',{state:'background'});typedBackground.emit('app.state',{state:'active'});typedBackground.advance(2500);
  // iPhone 1.8 intentionally wipes RAM drafts on background (DECISIONS A2).
  // The frozen web/onboarding hold surfaces retain their existing draft pin.
  const resetsConversation=surface==='native'&&page==='app'&&!ref;
  check(`${label}: background/foreground preserves the surface draft policy without submitting`,()=>{assert.equal(typedBackground.ta.value,resetsConversation?'':text);assert.equal(typedBackground.asks().length,0);assert.equal(typedBackground.state(),resetsConversation?'IDLE':'TYPING');});
  const cancel=world(surface,page,language);cancel.type();cancel.write(text);cancel.ta.emit('keydown',{key:'Escape'});cancel.advance(250);cancel.type();cancel.write(text+' NVDA');cancel.send.emit('click');cancel.advance(2200);
  check(`${label}: Escape then explicit retry sends only the new draft`,()=>{assert.equal(cancel.asks().length,1);assert.equal(cancel.asks()[0].params.question,text+' NVDA');assert.deepEqual(cancel.errors,[]);});
  const changed=world(surface,page,language);changed.type();changed.write(text);const other=language==='de'?'it':'de';changed.c.applySession({language:other,locale:other==='de'?'de-DE':'it-IT',companion:null,mic:{state:'denied'},riskAccepted:true},false);
  check(`${label}: live language change updates typing copy and preserves exact draft`,()=>{assert.equal(changed.ta.value,text);assert.equal(changed.state(),'TYPING');assert.equal(changed.ta.placeholder||changed.ta.attributes.placeholder,page==='app'?changed.c.tt('type.placeholder'):changed.c.Ls('type.placeholder'));assert.equal(changed.send.attributes['aria-label'],page==='app'?changed.c.tt('type.send'):changed.c.Ls('type.send'));assert.equal(changed.asks().length,0);assert.deepEqual(changed.errors,[]);});
  const speech=world(surface,page,language,{mic:'granted'});speech.input.emit('pointerdown',{target:speech.pill});await speech.flush();speech.emit('speech.partial',{text});speech.emit('speech.final',{text});speech.advance(2200);
  check(`${label}: a final received during hold cannot auto-submit`,()=>{assert.equal(speech.asks().length,0);assert.equal(speech.state(),'LISTENING');});
  speech.input.emit('pointerup',{target:speech.pill});speech.emit('speech.final',{text});await speech.flush();speech.advance(2200);
  check(`${label}: release then final submits complete Unicode once`,()=>{assert.equal(speech.asks().length,1);assert.equal(speech.asks()[0].params.question,text);assert.deepEqual(speech.errors,[]);});
  const longText='NVIDIA 123,45 € 2,5% '+Array.from({length:65},(_,i)=>text.split(' ')[i%text.split(' ').length]).join(' '), timeout=world(surface,page,language,{mic:'granted'});
  timeout.input.emit('pointerdown',{target:timeout.pill});await timeout.flush();timeout.emit('speech.partial',{text:longText});timeout.advance(700);timeout.input.emit('pointerup',{target:timeout.pill});await timeout.flush();timeout.advance(6000);
  check(`${label}: missing final watchdog retains the full long transcript and first asset`,()=>{assert.equal(timeout.asks().length,1);assert.equal(timeout.asks()[0].params.question,longText);assert.deepEqual(timeout.errors,[]);});
  const background=world(surface,page,language,{mic:'granted'});background.input.emit('pointerdown',{target:background.pill});await background.flush();background.emit('speech.partial',{text});background.advance(700);background.input.emit('pointerup',{target:background.pill});background.emit('app.state',{state:'background'});background.emit('speech.final',{text});await background.flush();background.advance(6000);
  check(`${label}: background invalidates pending final and does not send a reading`,()=>{assert.equal(background.asks().length,0);assert.notEqual(background.state(),'LISTENING');assert.deepEqual(background.errors,[]);});
  const switchSpeech=world(surface,page,language,{mic:'granted'});switchSpeech.input.emit('pointerdown',{target:switchSpeech.pill});await switchSpeech.flush();switchSpeech.emit('speech.partial',{text});switchSpeech.c.applySession({language:other,locale:other==='de'?'de-DE':'it-IT',companion:null,mic:{state:'granted'},riskAccepted:true},false);switchSpeech.emit('speech.final',{text});switchSpeech.advance(6000);
  check(`${label}: language switch invalidates dictation in the previous locale`,()=>{assert.equal(switchSpeech.asks().length,0);assert.notEqual(switchSpeech.state(),'LISTENING');assert.ok(switchSpeech.calls.some(x=>x.method==='speech.stop'&&x.params.cancel));assert.deepEqual(switchSpeech.errors,[]);});
  const stopped=world(surface,page,language,{mic:'granted'});stopped.input.emit('pointerdown',{target:stopped.pill});await stopped.flush();stopped.emit('speech.partial',{text});stopped.emit('speech.state',{state:'stopped'});stopped.emit('speech.final',{text});stopped.advance(6000);
  check(`${label}: capture stopped while held does not authorize partial/final submission`,()=>{assert.equal(stopped.asks().length,0);assert.equal(stopped.state(),'LISTENING');assert.deepEqual(stopped.errors,[]);});
  const interrupted=world(surface,page,language,{mic:'granted'});interrupted.input.emit('pointerdown',{target:interrupted.pill});await interrupted.flush();interrupted.emit('speech.partial',{text:longText});interrupted.emit('speech.state',{state:'stopped'});interrupted.emit('speech.error',{code:'interrupted'});interrupted.advance(6000);
  check(`${label}: interrupted capture does not focus typing or send`,()=>{assert.equal(interrupted.asks().length,0);assert.equal(interrupted.ta.focusCalls.length,0);assert.notEqual(interrupted.state(),'LISTENING');});
  interrupted.type();
  check(`${label}: explicit typing recovers the complete interrupted transcript`,()=>{assert.equal(interrupted.ta.value,longText);assert.equal(interrupted.asks().length,0);assert.equal(interrupted.send.disabled,false);assert.deepEqual(interrupted.errors,[]);});
  for(const reset of ['locale','background','account']){
    const w=world(surface,page,language);if(page==='app')w.c.SPEECH.draft=text;else w.c.W.speechDraft=text;
    if(reset==='locale')w.c.applySession({language:other,locale:other==='de'?'de-DE':'it-IT',companion:null,mic:{state:'denied'},riskAccepted:true},false);
    else if(reset==='background')w.emit('app.state',{state:'background'});
    else{if(page==='app'&&surface==='native')w.c.ST.name='BOOT';w.emit('account.changed',{wasSignedIn:true,signedIn:false});}
    w.type();
    check(`${label}: ${reset} clears an inactive recovery draft`,()=>{assert.equal(w.ta.value,'');assert.equal(w.asks().length,0);assert.deepEqual(w.errors,[]);});
    const pending=world(surface,page,language,{deferAsk:true});pending.type();pending.write(text.repeat(40));pending.send.emit('click');pending.advance(2200);
    if(reset==='locale')pending.c.applySession({language:other,locale:other==='de'?'de-DE':'it-IT',companion:null,mic:{state:'denied'},riskAccepted:true},false);
    else if(reset==='background')pending.emit('app.state',{state:'background'});
    else pending.emit('account.changed',{wasSignedIn:true,signedIn:false});
    pending.askPending[0]({v:1,status:'too_long',maxLength:1200});await pending.flush();pending.advance(800);pending.type();
    check(`${label}: a delayed refusal cannot restore input after ${reset}`,()=>{assert.equal(pending.ta.value,'');assert.equal(pending.asks().length,1);assert.deepEqual(pending.errors,[]);});
  }
  const foreground=world(surface,page,language,{mic:'granted'});foreground.input.emit('pointerdown',{target:foreground.pill});await foreground.flush();foreground.emit('app.state',{state:'background'});foreground.emit('app.state',{state:'active'});foreground.input.emit('pointerdown',{target:foreground.pill,pointerId:2});await foreground.flush();
  check(`${label}: background clears old finger ownership before retry`,()=>{assert.equal(foreground.calls.filter(x=>x.method==='speech.start').length,2);assert.equal(foreground.state(),'LISTENING');assert.deepEqual(foreground.errors,[]);});
  for(const oldReply of ['denied','granted','rejected']){
    const permission=world(surface,page,language,{mic:'undetermined',deferPermissions:true});permission.c.go('PRE_PERMISSION');
    const permit=()=>page==='app'?permission.c.STATES.PRE_PERMISSION.cont():permission.c.permContinue();permit();permit();
    check(`${label}: repeated permission CTA starts one request (${oldReply})`,()=>{assert.equal(permission.permissions.length,1);assert.equal(permission.asks().length,0);});
    permission.c.go(page==='app'?'IDLE':'ASK_TEACH',{quiet:true});permission.c.go('PRE_PERMISSION');permit();
    if(oldReply==='rejected')permission.permissions[0].reject(new Error('old permission request failed'));else permission.permissions[0].resolve({state:oldReply});
    await permission.flush();
    check(`${label}: old permission ${oldReply} cannot dismiss a newer prompt`,()=>{assert.equal(permission.state(),'PRE_PERMISSION');assert.equal((page==='app'?permission.c.SES:permission.c.SESSION).mic.state,'undetermined');assert.equal(permission.ta.focusCalls.length,0);assert.equal(permission.asks().length,0);});
    permission.permissions[1]?.resolve({state:'granted'});await permission.flush();
    check(`${label}: current permission reply enables the next deliberate hold (${oldReply})`,()=>{assert.equal(permission.state(),page==='app'?'IDLE':'ASK_TEACH');assert.equal((page==='app'?permission.c.SES:permission.c.SESSION).mic.state,'granted');assert.equal(permission.ta.focusCalls.length,0);assert.deepEqual(permission.errors,[]);});
  }
  if(page==='app'){
    const follow=world(surface,page,language);follow.type({followUpOf:'original-reading',fromRead:true});follow.write(text);follow.send.emit('click');follow.advance(2200);
    check(`${label}: follow-up retains identity and exact Unicode input`,()=>{assert.equal(follow.asks().length,1);assert.equal(follow.asks()[0].params.followUpOf,'original-reading');assert.equal(follow.asks()[0].params.question,text);assert.deepEqual(follow.errors,[]);});
  }else{
    const consent=world(surface,page,language,{consent:false});consent.type();consent.write(text);consent.send.emit('click');consent.advance(2200);
    check(`${label}: first input stays behind explicit risk consent`,()=>{assert.equal(consent.asks().length,0);assert.equal(consent.c.W.question,text);assert.equal(consent.state(),'RISK');});
  }
}
for(const surface of ['native','web']) for(const page of ['app','onboarding']) for(const [language,first,next] of [['en','en-US','en-GB'],['es','es-MX','es-ES'],['pt','pt-PT','pt-BR']]){
  const w=world(surface,page,language,{mic:'granted'});w.c.LOCALE=first;w.input.emit('pointerdown',{target:w.pill});await w.flush();w.emit('speech.partial',{text:texts[language]});w.c.applySession({language,locale:next,mic:{state:'granted'},companion:null,riskAccepted:true},false);w.emit('speech.final',{text:texts[language]});w.advance(6000);
  check(`${surface}/${page}/${first}->${next}: a regional locale change invalidates old dictation`,()=>{assert.equal(w.c.LOCALE,next);assert.equal(w.asks().length,0);assert.notEqual(w.state(),'LISTENING');assert.ok(w.calls.some(x=>x.method==='speech.stop'&&x.params.cancel));assert.deepEqual(w.errors,[]);});
}
// Run the real web desk + environment through their network boundary. No endpoint is contacted.
function webDesk(language){
  const requests=[],doc=new Node('document','DOCUMENT');doc.documentElement=new Node('html');
  const storage={getItem:()=>null,setItem(){},removeItem(){}},c={URLSearchParams,AbortController,Response,performance:{now:()=>0},setTimeout:()=>1,clearTimeout(){},navigator:{language,languages:[language]},location:{search:'?lang='+language},localStorage:storage,sessionStorage:storage,document:doc,NUCLEO_WEB:{base:'/nucleo/',routes:{}},addEventListener(){},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},fetch:async(url,init)=>{requests.push({url,body:JSON.parse(init.body)});return new Response(JSON.stringify({resolution:{},resolved:{},results:[]}),{status:200});}};
  c.window=c;const ctx=vm.createContext(c);for(const path of ['shared/05-locale.js','web/10-web-env.js'])vm.runInContext(source('nucleo/src/'+path),ctx);
  c.__nucleoWeb.state={riskAccepted:()=>true};vm.runInContext(source('nucleo/src/web/30-web-desk.js'),ctx);return{desk:c.__nucleoWeb.desk,requests};
}
for(const language of Object.keys(texts))for(const glyph of ['é','😀','e\u0301']){
  const prefix='NVIDIA ',full=prefix+glyph.repeat(1200),accepted=Array.from(full).slice(0,1200).join(''),excessive=accepted+'ß',w=webDesk(language);
  const refusal=await w.desk.ask({question:excessive});
  check(`web transport/${language}/${glyph}: 1201 code points stop before every endpoint`,()=>{assert.equal(refusal.status,'too_long');assert.equal(refusal.maxLength,1200);assert.ok(refusal.message);assert.equal(w.requests.length,0);assert.equal(w.desk.busy(),false);});
  await w.desk.ask({question:accepted});
  check(`web transport/${language}/${glyph}: exact 1200 code points reach resolver unchanged`,()=>{assert.equal(w.requests[0].url,'/api/bobby-asset-search');assert.equal(w.requests[0].body.q,accepted);assert.equal(w.requests[0].body.language,language);assert.ok(w.requests.every(x=>x.url==='/api/bobby-asset-search'));assert.equal(w.desk.busy(),false);});
}
console.log(`Nucleo input pipeline: ${passed} passed, ${failed} failed${ref?` against ${ref}`:''} (actual source -> offline ask bridge).`);
if(failed)process.exitCode=1;
