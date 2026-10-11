/* iPhone-only controls beside the pinned stage/desk blocks. */
var HELD='',HELD_CAP='',HELD_SPOKEN=false,HELD_PARAMS=null,CONV_RETURN=null,CONV_BASE='',CONV_PARTIAL='',CONV_WORD_AT=0,CONV_HOLD=false,CONV_LISTEN_SEQ=0;
var keyboardButton=mk('button','quiet-glyph');keyboardButton.innerHTML='<svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true"><rect x="1" y="1" width="20" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M5 5h1m4 0h1m4 0h1M5 8h1m4 0h1m4 0h1M6 11h10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';keyboardButton.id='conversation-keyboard';uiEl.appendChild(keyboardButton);
var fieldMic=mk('button','quiet-glyph');fieldMic.innerHTML='<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><rect x="6" y="1" width="6" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 9v2a6 6 0 0 0 12 0V9M9 17v4M6 21h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';fieldMic.id='conversation-field-mic';el.typeBox.appendChild(fieldMic);
var sendIcon=mk('span','send-icon','↑');el.pill.appendChild(sendIcon);
var draftPanel=mk('section','conversation'),draftPhrase=mk('p','conversation-phrase');draftPanel.id='conversation-draft';draftPanel.appendChild(draftPhrase);uiEl.appendChild(draftPanel);draftPanel.style.display='none';
function conversationAnnounce(key){el.live.textContent=tt(key);}
function conversationReturn(){
 var back=CONV_RETURN;CONV_RETURN=null;
 if(back&&back.name==='COMPANION'&&GUIDE){go('COMPANION',{reply:GUIDE});}
 else if(back&&back.name==='READ_CONFIRM')go('READ_CONFIRM',back.data);
 else go('IDLE',{restoreGreet:true});
}
function conversationReset(){CONV_LISTEN_SEQ++;cancelInput();bcall('speech.stop',{cancel:true}).catch(noop);conversationClearReturns();HELD='';HELD_CAP='';HELD_SPOKEN=false;HELD_PARAMS=null;CONV_BASE='';CONV_PARTIAL='';CONV_RETURN=null;GUIDE=null;READ=null;el.ta.value='';draftPanel.style.display='none';bcall('stopSpeaking').catch(noop);bcall('cancel').catch(noop);go('IDLE',{restoreGreet:true});conversationClearReturns();}
// A10: cancel ownership and audio, while the visible conversation stays in RAM.
function conversationSuspend(){
 CONV_LISTEN_SEQ++;
 var listening=ST.name==='LISTENING',tap=typeof TALK_MODE!=='undefined'&&TALK_MODE==='tap',q=(CONV_BASE+' '+CONV_PARTIAL).trim();
 if(listening&&tap){STATES.LISTENING.startSeq++;STATES.LISTENING.released=true;STATES.LISTENING.finalWait=0;STATES.LISTENING.live=false;}
 cancelInput();bcall('speech.stop',{cancel:true}).catch(noop);
 // Do not let iOS restore a focused keyboard with a scrolled visual viewport.
 // Blur keeps the field, its words and the TYPING state required by the pin.
 if(ST.name==='TYPING')el.ta.blur();
 if(listening&&tap){if(q)holdDraft(q,'cap.stopped',true);else{conversationReturn();hint(tt('cap.empty'));}}
 else if(listening&&ST.name==='LISTENING')STATES.LISTENING.interrupt();
 // The frozen HOLD pin drops an inactive dictation recovery, never a typed field.
 if(!tap&&!HELD&&ST.name!=='TYPING')SPEECH.draft='';
 SPEECH.draftEpoch=(SPEECH.draftEpoch||0)+1;
 if(ST.name==='PRE_PERMISSION')conversationReturn();
 if(ST.name==='READ_CONFIRM'){READ=null;go('IDLE',{restoreGreet:true});}
 if(GUIDE&&!GUIDE.slotReady)GUIDE.slotSuppressed=true;
 bcall('stopSpeaking').catch(noop);
}
function holdDraft(text,caption,spoken,params){HELD_PARAMS=params||null;HELD_SPOKEN=!!spoken;HELD=String(text||'').trim();HELD_CAP=caption||'';SPEECH.draft=HELD;go('HELD_DRAFT');}
function convSend(text,spoken){
 var params=HELD_PARAMS&&text.trim()===HELD?Object.assign({},HELD_PARAMS):{question:text};if(!params.retry){if(READ_CONFIRM&&!params.companion)params.confirm=true;if(spoken)params.spoken=true;else delete params.spoken;if(GUIDE&&GUIDE.requestId&&!params.after)params.after=GUIDE.requestId;}
 HELD='';HELD_CAP='';HELD_PARAMS=null;SPEECH.draft='';CONV_RETURN=null;go('SENDING',{question:text,params:params,origin:spoken?'speech':'type'});
}
function convType(){
 CONV_RETURN={name:ST.name,data:ST.data};
 if(ST.name==='LISTENING'){SPEECH.draft=TALK_MODE==='hold'?txText():(CONV_BASE+' '+CONV_PARTIAL).trim();STATES.LISTENING.startSeq++;CONV_LISTEN_SEQ++;bcall('speech.stop',{cancel:true}).catch(noop);CONV_RETURN=STATES.LISTENING.back;}
 else if(ST.name==='HELD_DRAFT')SPEECH.draft=HELD;
 else if(ST.name==='READ_CONFIRM')SPEECH.draft=READ&&READ.question||'';
 else SPEECH.draft=SPEECH.draft||'';
 openTyping({conversation:true,fromRead:!!GUIDE});try{el.ta.selectionStart=el.ta.selectionEnd=el.ta.value.length;}catch(_){}
}
quietAction(keyboardButton,convType);
quietAction(el.taSend,function(){if(ST.name==='TYPING'&&!TB.composing)STATES.TYPING.send();});
quietAction(fieldMic,function(){CONV_BASE=el.ta.value.trim();SPEECH.draft=CONV_BASE;CONV_RETURN=CONV_RETURN||{name:'IDLE',data:{}};convListen(false,true);});
function convListen(held,append){
 var back=CONV_RETURN||{name:ST.name,data:ST.data},seq=++CONV_LISTEN_SEQ;
 CONV_BASE=append?(HELD||SPEECH.draft||CONV_BASE):'';CONV_PARTIAL='';CONV_HOLD=held;
 if(VOICE.id&&!VOICE.ended){bcall('stopSpeaking').catch(noop);VOICE.ended=true;}
 bcall('speech.permission').then(function(m){
  if(seq!==CONV_LISTEN_SEQ)return;if(m&&m.state)SES.mic=m;
  var state=m&&m.state||'unavailable';CONV_RETURN=back;
  if(state==='granted')go('LISTENING',{conversation:true,back:back});
  else if(state==='undetermined')go('PRE_PERMISSION',{conversation:true,back:back});
  else if(state==='consent')bcall('speech.requestPermission').then(function(m){if(seq===CONV_LISTEN_SEQ){if(m&&m.state)SES.mic=m;hint(tt(m&&m.state==='granted'?'cap.tapToTalk':'hint.micOff'));}}).catch(noop);
  else {hint(tt('hint.micOff'));keyboardButton.animate([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}],{duration:320});}
 }).catch(function(){if(seq===CONV_LISTEN_SEQ)hint(tt('hint.micOff'));});
}
var holdPillDown=pillDown;
pillDown=function(p,fromRead){
 if(TALK_MODE==='hold')return holdPillDown(p,fromRead);
 var ended=false,started=false,t0=nowT(),name=ST.name;
 if(name==='LISTENING')return tapG(function(){STATES.LISTENING.release(false,false);},A.press);
 if(['SENDING','RESOLVING','THINK_WAIT'].indexOf(name)>=0)return tapG(function(){cancelRead();},A.press);
 var speaking=VOICE.id&&VOICE.started&&!VOICE.ended;
 if(!speaking&&name!=='HELD_DRAFT'){started=true;convListen(false,false);}
 at(.35,function(){if(ended)return;CONV_HOLD=true;if(ST.name==='LISTENING'&&STATES.LISTENING.live)hint(tt('hint.release'));if(!started){started=true;convListen(true,name==='HELD_DRAFT');}});
 return {move:function(p){if(Math.hypot(p.x-p.x0,p.y-p.y0)>32)this.cancel();},up:function(){
  if(ended)return;ended=true;A.press.to(1,'emit');
  if(nowT()-t0>=.35){CONV_HOLD=true;if(ST.name==='LISTENING'&&(CONV_BASE+' '+CONV_PARTIAL).trim())STATES.LISTENING.release(false,false);else{CONV_HOLD=false;if(ST.name==='LISTENING')hint(tt('cap.listening'));}}
  else if(speaking){guideStopVoice();}
  else if(name==='HELD_DRAFT')convSend(HELD,HELD_SPOKEN);
 },cancel:function(){if(ended)return;ended=true;CONV_LISTEN_SEQ++;if(ST.name==='LISTENING'){bcall('speech.stop',{cancel:true}).catch(noop);conversationReturn();}else if(ST.name==='PRE_PERMISSION')conversationReturn();
 if(ST.name==='READ_CONFIRM'){READ=null;go('IDLE',{restoreGreet:true});}}};
};
var legacyListen=STATES.LISTENING;
if(TALK_MODE==='tap')STATES.LISTENING={
 enter:function(prev,d){
  this.back=d.back||CONV_RETURN||{name:prev,data:{}};this.startSeq=++CONV_LISTEN_SEQ;this.live=false;this.released=false;this.finalWait=0;CONV_WORD_AT=clk;
  chromeUp();greetOut();chipsHide();meriOut();guidePanel.style.display=guideActions.style.display='none';moveSphere(300,98);A.pillW.set(96);pillMode(idleMode());
  draftPhrase.textContent=CONV_BASE;draftPanel.style.display='block';draftPanel.style.top='438px';conversationBorn(draftPanel,'sphere',32);A.closeO.set(1);att(el.close,'aria-label',tt('aria.discardSpoken'));
  var self=this,seq=this.startSeq;bcall('speech.start').then(function(r){if(seq!==self.startSeq||ST.name!=='LISTENING')return;self.live=r&&r.status==='listening';if(self.live){conversationAnnounce('cap.listening');U.listenIr.to(1);hint(tt(CONV_HOLD?'hint.release':'cap.listening'));}else{hint(tt('hint.micOff'));conversationReturn();}},function(){if(seq===self.startSeq)conversationReturn();});
 },
 exit:function(){this.startSeq++;U.listenIr.to(0);draftPanel.style.display='none';},
 release:function(isTap,cancelled){if(cancelled){CONV_LISTEN_SEQ++;bcall('speech.stop',{cancel:true}).catch(noop);HELD=SPEECH.draft=CONV_BASE=CONV_PARTIAL='';conversationReturn();return;}if(this.released)return;this.released=true;this.live=false;U.listenIr.to(0);this.finalWait=clk||.001;var self=this;bcall('speech.stop',{}).then(function(r){if(r&&r.status==='idle')self.gotFinal(CONV_PARTIAL);}).catch(function(){self.gotFinal(CONV_PARTIAL);});},
 gotFinal:function(text){if(ST.name!=='LISTENING'||!this.released)return;var q=(CONV_BASE+' '+String(text||CONV_PARTIAL||'')).replace(/\s+/g,' ').trim();this.finalWait=0;if(q)convSend(q,true);else{conversationReturn();hint(tt('cap.empty'));conversationAnnounce('cap.empty');}},
 autoEnd:function(caption){var q=(CONV_BASE+' '+CONV_PARTIAL).trim();conversationAnnounce(q?caption:'cap.empty');this.live=false;this.startSeq++;bcall('speech.stop',{cancel:true}).catch(noop);tick('soft');if(q)holdDraft(q,caption,true);else{conversationReturn();hint(tt('cap.empty'));}},
 interrupt:function(){this.autoEnd('cap.stopped');},
 on:function(name,p){
  if(name==='speech.partial'){
   var text=String(p&&p.text||''),hadPartial=!!CONV_PARTIAL,previous=CONV_PARTIAL.split(/\s+/),next=text.split(/\s+/),common=0;while(common<previous.length&&previous[common]===next[common])common++;
   if(text!==CONV_PARTIAL)CONV_WORD_AT=clk;CONV_PARTIAL=text;draftPhrase.textContent='';draftPhrase.appendChild(D.createTextNode((CONV_BASE+' '+next.slice(0,(hadPartial?common:Math.max(0,next.length-1))).join(' ')).trim()+' '));draftPhrase.appendChild(mk('span','conversation-tail',next.slice((hadPartial?common:Math.max(0,next.length-1))).join(' ')));conversationBorn(draftPhrase,'sphere',32);
  }else if(name==='speech.final'&&this.released)this.gotFinal(p&&p.text);
  else if(name==='speech.error'||name==='speech.state'&&p.state==='stopped'&&!this.released)this.autoEnd(p&&p.reason==='minute'?'cap.minute':'cap.stopped');
  
 },
 tick:function(){if(this.finalWait&&clk-this.finalWait>=2)this.gotFinal(CONV_PARTIAL);else if(this.live&&clk-CONV_WORD_AT>=10)this.autoEnd('cap.stopped');},
 down:function(h){if(h==='pill')return tapG(function(){STATES.LISTENING.release(false,false);});if(h==='close')return tapG(function(){STATES.LISTENING.release(false,true);});return null;}
};
if(TALK_MODE==='hold'){
 var holdListenEnter=legacyListen.enter,holdListenExit=legacyListen.exit,holdListenOn=legacyListen.on;
 legacyListen.enter=function(prev,d){CONV_BASE='';CONV_PARTIAL='';holdListenEnter.call(this,prev,d);draftPanel.style.display='block';draftPanel.style.top='438px';draftPhrase.textContent='';moveSphere(300,98);};
 legacyListen.exit=function(next){draftPanel.style.display='none';if(holdListenExit)holdListenExit.call(this,next);};
 legacyListen.on=function(name,p){if(name==='speech.partial'){var next=String(p&&p.text||'').split(/\s+/),old=CONV_PARTIAL.split(/\s+/),n=0;while(n<old.length&&old[n]===next[n])n++;draftPhrase.textContent='';draftPhrase.appendChild(D.createTextNode(next.slice(0,(CONV_PARTIAL?n:Math.max(0,next.length-1))).join(' ')+' '));draftPhrase.appendChild(mk('span','conversation-tail',next.slice((CONV_PARTIAL?n:Math.max(0,next.length-1))).join(' ')));CONV_PARTIAL=String(p&&p.text||'');}holdListenOn.call(this,name,p);};
}
STATES.HELD_DRAFT={enter:function(){chromeUp();greetOut();chipsHide();meriOut();dissolveThink();glassHome();moveSphere(300,98);draftPanel.style.display='block';draftPanel.style.top='438px';draftPhrase.textContent=HELD;A.closeO.set(1);hint(HELD_CAP?tt(HELD_CAP):'');pillMode(idleMode());},exit:function(){draftPanel.style.display='none';},down:function(h,p){if(h==='pill')return pillDown(p,false);if(h==='close')return tapG(function(){HELD='';SPEECH.draft='';CONV_BASE='';CONV_PARTIAL='';conversationReturn();});if(h==='avatar')return avatarG();return null;}};
var oldTypingCancel=STATES.TYPING.cancel,oldTypingSend=STATES.TYPING.send;
STATES.TYPING.cancel=function(){if(!this.d.conversation)return oldTypingCancel.call(this);var q=el.ta.value.trim();if(q)holdDraft(q,'',false,q===HELD?HELD_PARAMS:null);else conversationReturn();};
STATES.TYPING.send=function(){if(!this.d.conversation)return oldTypingSend.call(this);if(TB.composing)return;var q=el.ta.value.replace(/\s+/g,' ').trim();if(q)convSend(q,false);else this.cancel();};
var oldOpenTyping=openTyping;
openTyping=function(d){d=d||{};if(!d.followUpOf)d.conversation=true;oldOpenTyping(d);};
var oldPermEnter=STATES.PRE_PERMISSION.enter;
STATES.PRE_PERMISSION.enter=function(prev,d){this.back=d.back||CONV_RETURN||{name:prev,data:{}};oldPermEnter.call(this);el.permBtn.classList.add("quiet-primary");};
STATES.PRE_PERMISSION.down=function(h){if(h==='perm')return tapG(function(){STATES.PRE_PERMISSION.cont();});return tapG(conversationReturn);};
STATES.PRE_PERMISSION.cont=function(){if(this.asked)return;this.asked=true;var self=this,seq=++CONV_LISTEN_SEQ;bcall('speech.requestPermission').then(function(m){if(seq!==CONV_LISTEN_SEQ||ST.name!=='PRE_PERMISSION')return;if(m&&m.state)SES.mic=m;conversationReturn();hint(tt(m&&m.state==='granted'?(TALK_MODE==='tap'?'cap.tapToTalk':'cap.holdToTalk'):'hint.micOff'));},function(){if(seq===CONV_LISTEN_SEQ){conversationReturn();hint(tt('hint.micOff'));}});};
var oldRouteReply=routeReply;
routeReply=function(r){if(r.reply.status==='error'&&r.reply.code==='bad_response'&&!r.accepted&&(r.params.confirm||r.params.companion||r.params.retry))r.reply={status:'companion_error',requestId:r.stageId||r.params.retry,code:'unavailable',retryable:true,questionSpoken:r.questionSpoken};if(r.reply.status==='confirm'&&r.reply.cost){go('READ_CONFIRM',{reply:r.reply});return;}if(r.reply.status==='cancelled'){var q=r.question;READ=null;holdDraft(q,'',!!(r.questionSpoken||r.params&&r.params.spoken||r.reply&&r.reply.questionSpoken),r.params);return;}oldRouteReply(r);};
var oldSendingEnter=STATES.SENDING.enter;
STATES.SENDING.enter=function(prev,d){if(d.params&&d.params.question&&!d.params.companion&&!d.params.followUpOf&&READ_CONFIRM)d.params.confirm=true;if(!d.params&&!d.token)d.params={question:d.question,confirm:READ_CONFIRM};if(d.origin==='speech'&&d.params&&!d.params.retry&&!d.params.token)d.params.spoken=true;this.waitCy=S.cy.x;this.waitR=S.r.x;oldSendingEnter.call(this,prev,d);conversationAnnounce('aria.sending');pillMode('stop');hint(tt('cap.cancel'));A.closeO.set(0);A.note.o.set(0);};
STATES.SENDING.down=function(h){if(h==='pill')return tapG(function(){cancelRead();});return null;};
STATES.RESOLVING.enter=function(){pillMode('stop');hint(tt('cap.cancel'));};
STATES.RESOLVING.down=STATES.SENDING.down;
var oldCancelRead=cancelRead;
cancelRead=function(){var r=READ;if(!r)return;var q=r.question;r.cancelling=true;bcall('cancel').catch(noop);READ=null;holdDraft(q,'',!!(r.questionSpoken||r.params&&r.params.spoken||r.reply&&r.reply.questionSpoken),r.params);};
var oldThinkEnter=STATES.THINK_WAIT.enter,oldThinkTick=STATES.THINK_WAIT.tick;
STATES.THINK_WAIT.enter=function(){oldThinkEnter.call(this);pillMode('stop');hint('');};
STATES.THINK_WAIT.tick=function(){var e=inState(),r=READ,cost=r&&r.conversationCost;hint(tt(e>=75?'hint.long':e>=20?'hint.still':cost?'cap.costCancel':'cap.cancel',cost?{cost:cost.levelLabel+' · '+cost.short}:{}));if(r&&r.reply){if(r.reply.status==='ok'){if(e>=(READS_DONE===0?4.5:1.5))go('THINK_RESOLVE');}else routeReply(r);}};
STATES.THINK_WAIT.down=STATES.SENDING.down;
var confirmPanel=mk('section','conversation'),confirmName=mk('p','conversation-phrase'),confirmCost=mk('p'),confirmLevel=mk('button','quiet-level'),confirmLine=mk('span'),confirmAction=mk('button','quiet-primary'),confirmExit=mk('button','quiet-link');
confirmPanel.id='conversation-confirm';confirmAction.id='conversation-confirm-read';confirmExit.id='conversation-confirm-exit';confirmLevel.id='conversation-confirm-level';confirmCost.appendChild(confirmLevel);confirmCost.appendChild(confirmLine);[confirmName,confirmCost,confirmAction,confirmExit].forEach(function(e){confirmPanel.appendChild(e);});uiEl.appendChild(confirmPanel);confirmPanel.style.display='none';
quietAction(confirmAction,function(){var c=STATES.READ_CONFIRM.reply;go('SENDING',{token:c.token,question:READ.question,origin:'chip'});});quietAction(confirmExit,function(){READ=null;go('RETURNING');});quietAction(confirmLevel,function(){STATES.READ_CONFIRM.levelOpen=true;openNative('levels');});
STATES.READ_CONFIRM={enter:function(prev,d){this.reply=d.reply||this.reply;var c=this.reply;chromeUp();chipsHide();greetOut();meriOut();dissolveThink();glassHome();hint('');A.closeO.set(0);pillMode(idleMode());moveSphere(256,98);confirmPanel.style.display='block';confirmPanel.style.top='400px';confirmName.textContent=c.asset.name+' ('+c.asset.symbol+')';confirmLevel.textContent=c.cost.levelLabel+' ⌄';confirmLevel.setAttribute('aria-label',c.cost.levelLabel);confirmLine.textContent=c.cost.line;confirmAction.textContent=c.label;confirmExit.textContent=tt('risk.notNow');conversationBorn(confirmName,'sphere',32);conversationBorn(confirmAction,'pill');},exit:function(){conversationRetire(confirmName,'sphere');conversationRetire(confirmAction,'pill');confirmPanel.style.display='none';},down:function(h,p){if(h==='pill')return pillDown(p,false);if(h==='avatar')return avatarG();return null;}};

var conversationTypeEnter=STATES.TYPING.enter,conversationTypeDown=STATES.TYPING.down;
STATES.TYPING.enter=function(prev,d){S.cy.set(180);S.r.set(48);conversationTypeEnter.call(this,prev,d);};
STATES.TYPING.down=function(h){if(h==='close')return tapG(function(){STATES.TYPING.cancel();});return conversationTypeDown.call(this,h);};
