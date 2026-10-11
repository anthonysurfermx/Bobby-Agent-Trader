/* I-1: one answer, optional depth, and exactly one invitation. All copy is keyed. */
var GUIDE=null, CHECKIN=null, GUIDE_RETRIES=0, GUIDE_BUSY=false, GUIDE_INPUT_CHECKIN=false, GUIDE_EPOCH=0, GUIDE_ANSWER_ERROR='';
var guidePanel=mk('section','conversation'), guideReply=mk('p','conversation-phrase'), guideMark=mk('p','conversation-meta'), guideFact=mk('p','conversation-body'), guideBody=mk('p','conversation-body');
var guideNarrative=mk('div'), guideActions=mk('div','conversation-slot'), guideQuestion=mk('p'), guideOptions=mk('div');
guidePanel.id='companionPanel'; guideReply.id='companion-reply'; guideNarrative.id='conversation-reading'; guideBody.id='conversation-body'; guideActions.id='conversation-slot';
[guideReply,guideBody,guideFact,guideMark].forEach(function(e){guideNarrative.appendChild(e);}); guidePanel.appendChild(guideNarrative); uiEl.appendChild(guidePanel); uiEl.appendChild(guideActions);
guidePanel.style.display=guideActions.style.display='none';
var guideDisclosure=mk('button','quiet-link'); guideDisclosure.id='companion-read-all'; guidePanel.appendChild(guideDisclosure);
function quietAction(b, action){
  b._guideAction=action;
  var down=null;
  b.addEventListener('pointerdown',function(e){e.stopPropagation(); if(e.cancelable)e.preventDefault(); down={x:e.clientX,y:e.clientY}; try{b.setPointerCapture(e.pointerId);}catch(_){}});
  b.addEventListener('pointerup',function(e){e.stopPropagation(); var p=down;down=null;if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<8&&!b.disabled)action();});
  b.addEventListener('pointercancel',function(){down=null;});
  b.addEventListener('click',function(e){e.stopPropagation();if(e.detail===0&&!b.disabled)action();});
}
quietAction(guideDisclosure,function(){ if(!GUIDE)return;var oldTop=guidePanel.getBoundingClientRect().top; GUIDE.reading=true; guideRender();if(guidePanel.animate){var dy=(oldTop-guidePanel.getBoundingClientRect().top)/(fitS||1);guidePanel.animate(RM?[{opacity:0},{opacity:1}]:[{transform:'translateY('+dy+'px)'},{transform:'translateY(0)'}],{duration:RM?200:600,easing:'cubic-bezier(.2,.75,.25,1)'});}conversationBorn(guideBody,'sphere',25); });
function guideWords(){return SES&&SES.companionPilot&&SES.companionPilot.strings||{};}
function guideButton(host,text,action,id,primary){var b=mk('button',primary?'quiet-primary':'quiet-chip',text);b.type='button';b.id=id;quietAction(b,action);if(!primary){b.textContent='';b.appendChild(mk('span','conversation-chip-label',text));}host.appendChild(b);return b;}
function guideAsk(question,retry){
 if(GUIDE_BUSY)return;
 var after=GUIDE&&GUIDE.requestId, params=retry&&after?{retry:after}:retry&&READ?Object.assign({},READ.params):{question:question,companion:true};if(!retry&&after)params.after=after;
 go('SENDING',{params:params,question:question,origin:'person'});
}
function guideFailureLine(){var code=GUIDE.code||'unavailable';return code==='limit'?GUIDE.limitLine||GUIDE.message:tt({'offline':'fail.offline','explain_off':'fail.cantExplain','paused':'fail.paused'}[code]||'fail.answer');}
var conversationCurves={soft:'cubic-bezier(.2,.75,.25,1)',emit:'cubic-bezier(.16,1,.3,1)',inhale:'cubic-bezier(.55,0,.7,.35)'};
function conversationBorn(node,origin,lineHeight){
 if(!node||!node.animate)return;
 if(RM){node.animate([{opacity:0},{opacity:1}],{duration:200});return;}
 var displacement=origin==='pill'?Math.max(14,742-(parseFloat(node.style.top)||640)):14;
 node.animate([{opacity:0,transform:'translateY('+(origin==='pill'?displacement:-14)+'px)',filter:'blur(6px)'},{opacity:1,transform:'translateY(0)',filter:'blur(0)'}],{duration:origin==='pill'?480:240,easing:conversationCurves[origin==='pill'?'emit':'soft'],fill:'backwards'});
 if(lineHeight){var lines=Math.max(1,Math.ceil((node.offsetHeight||lineHeight)/lineHeight));node.animate([{clipPath:'inset(0 0 100% 0)'},{clipPath:'inset(0 0 0 0)'}],{duration:Math.min(600,lines*45),easing:'steps('+lines+',end)',fill:'backwards'});}
}
function conversationRetire(node,origin){
 if(!node||!node.animate||!node.cloneNode||node.style.display==='none')return;
 var ghost=node.cloneNode(true);ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');ghost.style.pointerEvents='none';ghost.classList.add('conversation-retiring');
 if(ghost.querySelectorAll)Array.prototype.forEach.call(ghost.querySelectorAll('[id]'),function(e){e.removeAttribute('id');});
 node.parentNode.appendChild(ghost);var dy=origin==='pill'?Math.max(14,742-(parseFloat(node.style.top)||640)):-14;
 var animation=ghost.animate(RM?[{opacity:1},{opacity:0}]:[{opacity:1,transform:'translateY(0)',filter:'blur(0)'},{opacity:0,transform:'translateY('+dy+'px)',filter:'blur(6px)'}],{duration:RM?200:240,easing:conversationCurves.inhale,fill:'forwards'});
 animation.onfinish=function(){ghost.remove();};
}
function conversationClearReturns(){if(D.querySelectorAll)Array.prototype.forEach.call(D.querySelectorAll('.conversation-retiring'),function(e){e.remove();});}
function guideRender(){
 if(!GUIDE)return;
 var error=GUIDE.status==='companion_error', gist=GUIDE.gist, text=GUIDE.text||'';
 var hasLead=typeof gist==='string'&&text.indexOf(gist)===0,oneSentence=hasLead&&gist===text;
 GUIDE.reading=!!GUIDE.reading||(!error&&(!hasLead||!oneSentence&&GUIDE.voiceOff||(SES&&SES.textScale||1)>1.35));
 guideReply.textContent=error?guideFailureLine():(hasLead?gist:GUIDE.reading?'':text);
 guideBody.textContent=!error&&GUIDE.reading?(hasLead?text.slice(gist.length).trim():text):'';
 guideFact.textContent=GUIDE.reading&&GUIDE.fact?GUIDE.fact.text+'\n'+GUIDE.fact.source+' · '+GUIDE.fact.year:'';
 guideMark.textContent=GUIDE.reading&&GUIDE.personalized?guideWords().personalized||'':'';guideMark.classList.toggle('conversation-noted',!!GUIDE.personalized);
 guideDisclosure.textContent=tt('answer.readAll')+' ⌄';guideDisclosure.setAttribute('aria-label',tt('answer.readAll'));  guideDisclosure.style.display=!error&&!GUIDE.reading&&hasLead&&gist!==text?'block':'none';
 guidePanel.style.display='block';guideActions.textContent='';guideActions.style.display='block';
 if(error){if(GUIDE.retryable)guideButton(guideActions,tt('fail.retry'),function(){guideAsk(READ&&READ.question,true);},'companion-retry',true);}
 else if(GUIDE.slotReady&&!(GUIDE.followUp==null&&gist===text)){
  var offer=GUIDE.readOffer;
  if(offer&&(!SES||SES.oneTap!==false)){
   var b=guideButton(guideActions,offer.label,function(){go('SENDING',{token:offer.token,question:READ.question,origin:'chip'});},'companion-read-offer',false);
   var meta=mk('small','conversation-eyebrow',offer.levelLabel+' · '+offer.costLine); b.insertBefore(meta,b.firstChild);
  }else if(typeof GUIDE.followUp==='string'){
   var b=guideButton(guideActions,GUIDE.followUp,function(){guideAsk(GUIDE.followUp,false);},'companion-follow-up',false);b.setAttribute('aria-label',tt('aria.ask',{question:GUIDE.followUp}));
  }
 }
 guideLayout();if(!GUIDE.phraseBorn){GUIDE.phraseBorn=true;conversationBorn(guidePanel,'sphere',GUIDE.reading?27:32);}if(GUIDE.slotReady&&!GUIDE.slotBorn&&guideActions.children.length){GUIDE.slotBorn=true;el.live.textContent=guideActions.textContent;conversationBorn(guideActions,'pill');}var eyebrow=guideActions.querySelector('.conversation-eyebrow');if(eyebrow&&GUIDE.readOffer&&eyebrow.scrollWidth>eyebrow.clientWidth)eyebrow.textContent=GUIDE.readOffer.levelLabel+' · '+GUIDE.readOffer.costShort;guideFade();
}
function guideLayout(){
 if(!GUIDE||guidePanel.style.display==='none')return;
 var scale=Math.max(.5,fitS||1),k=(SES&&SES.textScale||1)/scale, target=44/scale, slot=Math.max(target,(GUIDE.readOffer?86:68)*k),error=GUIDE.status==='companion_error';
 [guidePanel,guideActions].forEach(function(e){e.style.setProperty('--target',target+'px');e.style.setProperty('--type',k);});
 guideActions.style.top=(700-slot)+'px';guideActions.style.minHeight=slot+'px';
 guideReply.style.fontSize=((GUIDE.reading||error)?22:26)*k+'px';guideReply.style.lineHeight=((GUIDE.reading||error)?27:32)*k+'px';
 guideBody.style.fontSize=guideFact.style.fontSize=17*k+'px';guideBody.style.lineHeight=guideFact.style.lineHeight=25*k+'px';
 guideDisclosure.style.fontSize=15*k+'px';guideDisclosure.style.minHeight=target+'px';
 guideNarrative.classList.toggle('conversation-reading',!!GUIDE.reading);guideNarrative.setAttribute('role','region');guideNarrative.setAttribute('aria-label',tt('aria.answer'));
 guideReply.style.textAlign=GUIDE.reading?'left':'center';guideReply.style.display=guideReply.textContent?'block':'none';
 if(GUIDE.reading){guidePanel.style.top='240px';guideNarrative.style.height=(Math.floor((700-slot-16-240)/(25*k))*25*k)+'px';moveSphere(160,Math.max(48,44/scale));}
 else{
  guideNarrative.style.height='auto';
  if(guideReply.offsetHeight>96*k&&!error){guideReply.style.fontSize=22*k+'px';guideReply.style.lineHeight=27*k+'px';}
  var p=guideReply.offsetHeight,d=guideDisclosure.style.display==='none'?0:target,r=clamp((602-12-32-p-4-d-16-slot)/2,Math.max(44,44/scale),98);
  var spare=602-(12+2*r+32+p+4+d+16+slot),top=110+.4*Math.max(0,spare);
  if(!error&&spare<0){GUIDE.reading=true;guideRender();return;}
  moveSphere(top+r,r);guidePanel.style.top=(top+2*r+32)+'px';
 }
}
function companionCheckIn(){CHECKIN=null;if(ST.name==='HANDBACK')readChips();} // I-2 owns personal invitations.
function guideResumeOptions(){return false;}
function guideAnswer(){} // Profile memory is native; nothing about the person is drawn in I-1.
function guideStopVoice(){bcall('stopSpeaking').catch(noop);VOICE.ended=true;VOICE.id=null;K.on=false;if(GUIDE)GUIDE.voiceDone=true;pillMode(idleMode());}
STATES.COMPANION={
 enter:function(prev,data){
  GUIDE=data.reply||GUIDE;if(!GUIDE)return;CHECKIN=null;dissolveThink();glassHome();chipsHide();greetOut();meriOut();hint('');chromeUp();dockIn();
  pillMode(idleMode());att(el.close,'aria-label',tt('aria.closeAnswer'));att(el.sphereA,'aria-label',tt('aria.answer'));
  if(!GUIDE.settledAt)GUIDE.settledAt=clk;
  guideRender();
  if(GUIDE.status==='companion'&&GUIDE.requestId&&GUIDE.text&&!GUIDE.spoken){
   GUIDE.spoken=true;VOICE.id=GUIDE.requestId;VOICE.started=false;VOICE.ended=false;VOICE.reqT=clk;
   bcall('speak',{id:GUIDE.requestId,text:GUIDE.text,spoken:!!GUIDE.questionSpoken}).then(function(r){
    if(GUIDE&&r&&r.status!=='queued'){GUIDE.voiceOff=true;GUIDE.voiceDone=true;VOICE.ended=true;guideRender();}
   },function(){if(GUIDE){GUIDE.voiceOff=true;GUIDE.voiceDone=true;VOICE.ended=true;hint(tt('cap.voiceUnavailable'));guideRender();}});
  }
 },
 exit:function(next){conversationRetire(guidePanel,'sphere');conversationRetire(guideActions,'pill');GUIDE_EPOCH++;guidePanel.style.display=guideActions.style.display='none';if(VOICE.id&&!VOICE.ended)guideStopVoice();if(['LISTENING','TYPING','PRE_PERMISSION'].indexOf(next)<0&&next!=='COMPANION')GUIDE=null;},
 tick:function(){if(!GUIDE||GUIDE.status!=='companion')return;var ready=GUIDE.questionSpoken&&!GUIDE.voiceOff?GUIDE.voiceDone:clk-GUIDE.settledAt>=1.5;if(ready&&!GUIDE.slotReady&&!GUIDE.slotSuppressed){GUIDE.slotReady=true;guideRender();}if(!VOICE.started&&!VOICE.ended&&clk-VOICE.reqT>VOICE_WAIT){guideStopVoice();GUIDE.voiceOff=true;hint(tt('cap.voiceUnavailable'));guideRender();}},
 on:function(name,p){if(name==='voice.start'){pillMode('stop');att(el.sphereA,'aria-label',tt('aria.speaking'));}else if(name==='voice.end'){if(GUIDE)GUIDE.voiceDone=true;pillMode(idleMode());if(p&&p.reason==='failed'){GUIDE.voiceOff=true;hint(tt('cap.voiceUnavailable'));guideRender();}}},
 down:function(hit,p){if(hit==='pill')return pillDown(p,true);if(hit==='avatar')return tapG(function(){guideStopVoice();openNative('account');});if(hit==='close')return tapG(function(){var draft=GUIDE.status==='companion_error'&&READ?READ.question:'',spoken=!!GUIDE.questionSpoken,retry=draft?{retry:GUIDE.requestId}:null;GUIDE=null;READ=null;if(draft)holdDraft(draft,'',spoken,retry);else go('RETURNING');});return null;}
};
function guideFade(){var more=guideNarrative.scrollTop+guideNarrative.clientHeight<guideNarrative.scrollHeight-1;guideNarrative.style.setProperty('--fade-top',guideNarrative.scrollTop>0?'20px':'0px');guideNarrative.style.setProperty('--fade-bottom',more?'28px':'0px');}
var guideDrag=null;
guideNarrative.addEventListener('pointerdown',function(e){if(!GUIDE||!GUIDE.reading)return;e.stopPropagation();guideDrag={y:e.clientY,top:guideNarrative.scrollTop};try{guideNarrative.setPointerCapture(e.pointerId);}catch(_){}});
guideNarrative.addEventListener('pointermove',function(e){if(!guideDrag)return;e.stopPropagation();var line=25*(SES&&SES.textScale||1)/Math.max(.5,fitS||1);guideNarrative.scrollTop=Math.max(0,Math.round((guideDrag.top+(guideDrag.y-e.clientY)/(fitS||1))/line)*line);guideFade();});
guideNarrative.addEventListener('pointerup',function(e){if(guideDrag)e.stopPropagation();guideDrag=null;guideFade();});
guideNarrative.addEventListener('pointercancel',function(){guideDrag=null;});
guideNarrative.addEventListener('scroll',guideFade);
