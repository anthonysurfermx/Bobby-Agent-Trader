var preparingLine=mk('p','conversation conversation-status');preparingLine.id='conversation-preparing';uiEl.appendChild(preparingLine);
/* Render corrections are iPhone-only; the shipped read choreography stays intact. */
var conversationRender=render;
render=function(){conversationRender();conversationChrome();};
function conversationChrome(){
 if(!A||!S)return;
 var name=ST.name,scale=Math.max(.5,fitS||1),k=(SES&&SES.textScale||1)/scale,target=44/scale;
 var statusVisible=['SENDING','RESOLVING'].indexOf(name)>=0;if(!statusVisible&&preparingLine._visible)conversationRetire(preparingLine,'sphere');preparingLine._visible=statusVisible;preparingLine.style.display=statusVisible?'block':'none';preparingLine.textContent=tt('status.preparing');if(preparingLine.style.display==='block'&&preparingLine._born!==ST.t0){preparingLine._born=ST.t0;conversationBorn(preparingLine,'sphere',27);}preparingLine.style.top='512px';preparingLine.style.fontSize=22*k+'px';preparingLine.style.lineHeight=27*k+'px';
 var waiting=['SENDING','RESOLVING','THINK_WAIT'].indexOf(name)>=0,listening=name==='LISTENING',held=name==='HELD_DRAFT',speaking=!!(VOICE.id&&VOICE.started&&!VOICE.ended);
 var rest=name==='IDLE'||name==='WAKE';if(rest){A.closeO.set(0);op(el.close,0);}att(el.close,'aria-hidden',rest||waiting||name==='READ_CONFIRM'?'true':'false');
 keyboardButton.style.display=!waiting&&name!=='BOOT'&&name!=='TYPING'?'grid':'none';keyboardButton.style.width=keyboardButton.style.height=target+'px';keyboardButton.style.left=(105-target/2)+'px';keyboardButton.style.top=(770-target/2)+'px';keyboardButton.setAttribute('aria-label',tt('aria.type'));
 fieldMic.style.display=name==='TYPING'&&TALK_MODE==='tap'?'block':'none';fieldMic.setAttribute('aria-label',tt('aria.talk'));
 var send=TALK_MODE==='tap'&&(held||listening&&STATES.LISTENING.live);el.pill.classList.toggle('conversation-send',send);
 if(TALK_MODE==='tap')att(el.pill,'aria-label',tt(waiting?'aria.cancelQuestion':speaking?'aria.pillStop':listening?'aria.sendSpoken':held?'type.send':'aria.talk'));
 if(waiting){op(el.close,0);op(el.tx,0);op(el.greet,0);op(el.note,0);if(name!=='THINK_WAIT'){if(STATES.SENDING.waitR)moveSphere(STATES.SENDING.waitCy,STATES.SENDING.waitR);A.pillW.set(96);if(A.mode!=='stop')pillMode('stop');hint(tt(clk-ST.t0>=20?'cap.stillWorking':'cap.cancel'));el.dockQ.textContent=READ?READ.question:'';op(el.dockQ,1);att(el.sphereA,'aria-label',tt('aria.preparing'));}}
 if(name==='COMPANION'){op(el.close,1);op(el.tx,0);op(el.greet,0);op(el.note,0);att(el.close,'aria-label',tt('aria.closeAnswer'));if(RM&&speaking)hint(tt('aria.speaking'));}
 if(listening||held){op(el.dockQ,0);op(el.dockA,0);A.dockO.set(0);A.dockAO.set(0);att(el.sphereA,'aria-label',tt(listening&&STATES.LISTENING.live?'aria.listening':'aria.idle'));op(el.close,1);op(el.tx,0);op(el.greet,0);op(el.note,0);att(el.close,'aria-label',tt('aria.discardSpoken'));draftPanel.style.setProperty('--type',k);draftPhrase.style.fontSize=26*k+'px';draftPhrase.style.lineHeight=32*k+'px';draftPhrase.style.maxHeight=160*k+'px';draftPhrase.style.overflow='auto';draftPhrase.scrollTop=draftPhrase.scrollHeight;draftPhrase.classList.toggle('conversation-top-fade',draftPhrase.scrollHeight>160*k);}
 if(name==='READ_CONFIRM'){
  op(el.close,0);op(el.tx,0);op(el.greet,0);op(el.note,0);confirmPanel.style.setProperty('--target',target+'px');
  confirmName.style.fontSize=26*k+'px';confirmName.style.lineHeight=32*k+'px';confirmCost.style.font=15*k+'px/'+21*k+'px var(--sans)';confirmCost.style.textAlign='center';confirmCost.style.color='#A39C91';confirmLevel.style.fontSize=15*k+'px';confirmAction.style.fontSize=16*k+'px';confirmAction.style.minHeight=Math.max(50,target)+'px';confirmExit.style.fontSize=15*k+'px';confirmExit.style.display='block';confirmExit.style.margin='8px auto 0';
  var height=confirmPanel.offsetHeight,r=clamp((602-12-32-height)/2,Math.max(44,44/scale),98),spare=Math.max(0,602-12-32-height-2*r),top=110+.4*spare;moveSphere(top+r,r);confirmPanel.style.top=(top+2*r+32)+'px';
 }
 if(TALK_MODE==='tap'&&name!=='TYPING'&&name!=='BOOT'){
  var mode=waiting||speaking?'stop':'mic';if(A.mode!==mode)pillMode(mode);
  if(!send){op(el.pillMic,mode==='mic'?1:0);op(el.pillStop,mode==='stop'?1:0);op(el.pillKbd,0);op(el.pillThink,0);op(el.pillBars,0);}
 }
 if(name==='TYPING'){
  op(el.wm,0);op(el.close,1);op(el.tx,0);op(el.greet,0);op(el.note,0);
  var boxTop=parseFloat(el.typeBox.style.top),limit=fin(boxTop)?(boxTop-fitY)/scale-24:330,r=clamp((limit-112)/2,Math.max(44,44/scale),98);moveSphere(112+r,r);
 }
 if(listening||held)op(el.wm,0);
 var b=D.getElementById('lvl');if(b){b.classList.remove('on');b.style.display='none';}
 el.close.style.width=el.close.style.height=target+'px';el.close.style.left=(32-target/2)+'px';el.close.style.top=(76-target/2)+'px';
 el.hint.style.fontSize=Math.max(11,11/scale)+'px';el.hint.style.bottom='103px';
 var meta=held&&['cap.minute','cap.stopped'].indexOf(HELD_CAP)>=0;el.hint.style.color=listening&&STATES.LISTENING.live?'#5CE1FF':'#A39C91';el.hint.style.fontFamily=meta?'var(--sans)':'var(--mono)';el.hint.style.textTransform=meta?'none':'uppercase';el.hint.style.letterSpacing=meta?'0':'';el.hint.style.lineHeight=meta?18*k+'px':'';if(meta)el.hint.style.fontSize=13*k+'px';
}
var oldOnStage=onStage;onStage=function(p){if(READ&&p&&p.cost)READ.conversationCost=p.cost;oldOnStage(p);};
var oldAriaState=ariaState;ariaState=function(){oldAriaState();if(['SENDING','RESOLVING'].indexOf(ST.name)>=0)att(el.sphereA,'aria-label',tt('aria.preparing'));};
var oldLvlSync=lvlSync;lvlSync=function(){var b=D.getElementById('lvl');if(b)b.classList.remove('on');};
var confirmationRefresh=Promise.resolve(),oldLvlApply=lvlApply;lvlApply=function(l){oldLvlApply(l);if(ST.name!=='READ_CONFIRM')return;var r=READ;confirmAction.disabled=true;confirmationRefresh=confirmationRefresh.catch(noop).then(function(){if(READ!==r||ST.name!=='READ_CONFIRM')return;return bcall('confirm.refresh',{token:STATES.READ_CONFIRM.reply.token}).then(function(reply){if(READ!==r||ST.name!=='READ_CONFIRM')return;confirmAction.disabled=false;r.reply=reply;routeReply(r);}).catch(function(){if(READ===r&&ST.name==='READ_CONFIRM')confirmAction.disabled=false;});});};
/* The dial retains its native door. It is never a wake scene. */
var oldWakeEnter=STATES.WAKE.enter;STATES.WAKE.enter=function(prev,d){var offer=SES&&SES.speaking&&SES.speaking.offer;if(SES&&SES.speaking)SES.speaking.offer=false;oldWakeEnter.call(this,prev,d);if(SES&&SES.speaking)SES.speaking.offer=offer;};
var oldAskStart=askStart;askStart=function(p){if(['COMPANION','READ_CONFIRM','HELD_DRAFT'].indexOf(ST.name)>=0){GUIDE=null;HELD='';go('IDLE',{restoreGreet:true});}return oldAskStart(p);};

var conversationCall=bcall;bcall=function(method,params){if(method==='speak'&&params&&typeof params.spoken!=='boolean')params.spoken=!!(READ&&(READ.reply&&READ.reply.questionSpoken||READ.params&&READ.params.spoken));return conversationCall(method,params);};
var conversationAriaPill=ariaPill;ariaPill=function(){
 conversationAriaPill();
 if(!el||!el.pill)return;
 var n=ST.name,waiting=['SENDING','RESOLVING','THINK_WAIT'].indexOf(n)>=0;
 if(waiting)att(el.pill,'aria-label',tt('aria.cancelQuestion'));
 else if(TALK_MODE==='tap')att(el.pill,'aria-label',tt(VOICE.id&&VOICE.started&&!VOICE.ended?'aria.pillStop':n==='LISTENING'?'aria.sendSpoken':n==='HELD_DRAFT'?'type.send':'aria.talk'));
};

var conversationTalking=isTalking;isTalking=function(){return ST.name==='COMPANION'?!!(VOICE.started&&!VOICE.ended):conversationTalking();};
var conversationDrivers=drivers;drivers=function(h){conversationDrivers(h);if(ST.name==='LISTENING'&&TALK_MODE==='tap'&&!STATES.LISTENING.live){FLAG.listen=false;U.energy.t=.35;}if(['SENDING','RESOLVING'].indexOf(ST.name)>=0){U.nodesO.set(0);U.braid.set(0);U.swirl.set(0);U.energy.t=.35+.04*Math.sin(clk*3);}}

var conversationIdleHint=idleHint;idleHint=function(){if(TALK_MODE==='tap'){hint('');if(FACES.length>1&&!HINTED.swipe)hint('',tt('hint.swipe'));}else hint(tt('cap.holdToTalk'));};
