/* iPhone first-run ownership. Original HOLD input functions remain as the compatibility path. */
var firstRunInputSeq=0,firstRunBase='',firstRunWordAt=0,firstRunSendPending=false;
function firstRunHold(text,caption){
  W.speechDraft=String(text||'').trim();W.question=W.speechDraft;W.heldCaption=caption||'';
  go('HELD_DRAFT');
}
ENTER.HELD_DRAFT=function(){
  stage.classList.remove('consent-preview');W.micBreath=false;tg('lines');tg('notice');tg('agreeRing');tg('dock');tg('title');tg('chips');
  moveSphere(300,98);W.qFinal=true;tb('words',T-1);updateWords(W.speechDraft);setPill('listen','',96);W.pillModeT=T-1;setHint(W.heldCaption?Ls(W.heldCaption):'');
};
function firstRunCancelCapture(){
  firstRunInputSeq++;W.listenSeq++;firstRunSendPending=false;
  if(W.press)W.press.cancelled=true;W.press=null;
  fire('speech.stop',{cancel:true});endListenVisual();
}
function firstRunType(){
  if(['ASK_TEACH','HELD_DRAFT','LISTENING','PRE_PERMISSION','TYPING'].indexOf(W.state)<0)return;
  var q=W.state==='LISTENING'?(firstRunBase+' '+W.speechText).trim():W.speechDraft||W.question||typeIn.value||'';
  firstRunCancelCapture();cancelInput();W.speechDraft=q;go('TYPING');focusType();
  try{typeIn.selectionStart=typeIn.selectionEnd=typeIn.value.length;}catch(_){}
}
function firstRunListen(held){
  var seq=++firstRunInputSeq;firstRunBase=W.speechDraft||typeIn.value||'';W.speechDraft='';showTypeBox(false);
  call('speech.permission',{}).then(function(m){
    if(seq!==firstRunInputSeq||W.bg)return;
    if(m&&m.state&&SESSION)SESSION.mic=m;
    if(m&&m.state==='granted'){
      W.firstHeld=held;startListening({cancelled:false,released:false});firstRunWordAt=T;
    }else if(m&&m.state==='undetermined')go('PRE_PERMISSION');
    else if(m&&m.state==='consent')call('speech.requestPermission',{}).then(function(m){if(seq!==firstRunInputSeq)return;if(m&&m.state&&SESSION)SESSION.mic=m;if(m&&m.state==='consent')firstRunType();else{go('ASK_TEACH',{quiet:true});setHint(Ls('hint.micOff'));}}).catch(noop);
    else{go('ASK_TEACH',{quiet:true});setHint(Ls('hint.micOff'));}
  }).catch(function(){if(seq===firstRunInputSeq){go('ASK_TEACH',{quiet:true});setHint(Ls('hint.micOff'));}});
}
function firstRunAutoStop(caption){
  var q=(firstRunBase+' '+W.speechText).trim();firstRunCancelCapture();
  if(q)firstRunHold(q,caption);else{go('ASK_TEACH',{quiet:true});setHint(Ls('cap.empty'));}
}
var firstRunTypingEnter=ENTER.TYPING;
ENTER.TYPING=function(a){firstRunTypingEnter(a);moveSphere(260,88);};
var firstRunListenEnter=ENTER.LISTENING;
ENTER.LISTENING=function(a){firstRunListenEnter(a);if(TALK_MODE==='tap'){setPill('listen','',96);W.pillModeT=T-1;setHint(Ls(W.firstHeld?'hint.release':'cap.listening'));moveSphere(300,98);}};
var firstRunOnFinal=onSpeechFinal;
onSpeechFinal=function(text){
  if(TALK_MODE==='hold'&&!firstRunBase)return firstRunOnFinal(text);
  if(W.state!=='LISTENING')return;
  W.speechText=String(text||W.speechText||'').trim();
  if(!firstRunSendPending){updateWords((firstRunBase+' '+W.speechText).trim());return;}
  var q=(firstRunBase+' '+W.speechText).trim();firstRunSendPending=false;W.awaitFinal=0;
  endListenVisual();if(q)commitQuestion(q,'voice');else{go('ASK_TEACH',{quiet:true});setHint(Ls('cap.empty'));}
};
var firstRunPillDown=pillDown,firstRunPillUp=pillUp;
pillDown=function(){
  if(W.state==='HELD_DRAFT'){W.firstPress={at:T,state:W.state};W.pressFrom=W.state;at(.35,function(){if(W.firstPress)firstRunListen(true);});return;}
  if(TALK_MODE==='hold'||W.state==='RISK'){if(TALK_MODE==='hold')firstRunBase='';return firstRunPillDown();}
  W.firstPress={at:T,state:W.state};W.pressFrom=W.state;
  if(['ASK_TEACH','TYPING','HELD_DRAFT'].indexOf(W.state)>=0&&W.state!=='HELD_DRAFT')firstRunListen(false);
  at(.35,function(){if(!W.firstPress)return;W.firstHeld=true;if(W.firstPress.state==='HELD_DRAFT')firstRunListen(true);});
};
pillUp=function(cancelled){
  if(W.pressFrom!=='HELD_DRAFT'&&(TALK_MODE==='hold'||W.pressFrom==='RISK'))return firstRunPillUp(cancelled);
  var p=W.firstPress;W.firstPress=null;W.pressFrom=null;if(!p)return;
  if(cancelled){firstRunAutoStop('cap.stopped');return;}
  if(p.state==='HELD_DRAFT'&&T-p.at<.35){var q=W.speechDraft||W.question;W.speechDraft='';commitQuestion(q,W.qSrc||'typed');return;}
  if(W.state==='LISTENING'&&(p.state==='LISTENING'||T-p.at>=.35)){
    if(!(firstRunBase+' '+W.speechText).trim()){W.firstHeld=false;setHint(Ls('cap.listening'));return;}
    firstRunSendPending=true;stopListening();
  }
};
var firstRunWire=wireEvents;
wireEvents=function(){
  firstRunWire();if(!BR)return;
  BR.on('speech.partial',function(p){if(W.state==='LISTENING'&&p){firstRunWordAt=T;updateWords((firstRunBase+' '+String(p.text||'')).trim());}});
  BR.on('speech.state',function(p){if(TALK_MODE==='tap'&&W.state==='LISTENING'&&p&&p.state==='stopped'&&!firstRunSendPending)firstRunAutoStop(p.reason==='minute'?'cap.minute':'cap.stopped');});
  BR.on('app.state',function(p){
    if(!p||p.state!=='background')return;
    if(W.state==='TYPING'){try{typeIn.blur();window.scrollTo(0,0);}catch(_){}}
    if(TALK_MODE==='tap'&&W.state==='LISTENING')firstRunAutoStop('cap.stopped');else{firstRunInputSeq++;if(W.state==='PRE_PERMISSION')go('ASK_TEACH',{quiet:true});}
  });
  BR.on('account.changed',function(){firstRunInputSeq++;W.question='';W.speechDraft='';firstRunBase='';});
  BR.on('consent.withdrawn',function(){firstRunCancelCapture();W.question='';W.speechDraft='';typeIn.value='';firstRunBase='';go('RISK',{only:true});});
};
var firstRunSim=sim;
sim=function(h){if(TALK_MODE==='tap'&&W.state==='LISTENING'&&firstRunSendPending&&W.awaitFinal&&T>W.awaitFinal)onSpeechFinal(W.speechText);firstRunSim(h);if(TALK_MODE==='tap'&&W.state==='LISTENING'&&!firstRunSendPending&&T-firstRunWordAt>=10)firstRunAutoStop('cap.stopped');};
var firstRunRenderPill=renderPill;
renderPill=function(){
  firstRunRenderPill();var send=TALK_MODE==='tap'&&(W.state==='LISTENING'||W.state==='HELD_DRAFT');
  if(!pill.querySelector('.send-icon')){var icon=document.createElement('span');icon.className='send-icon';icon.textContent='↑';pill.appendChild(icon);}
  pill.classList.toggle('conversation-send',send);
  if(TALK_MODE==='tap'&&['ASK_TEACH','LISTENING','HELD_DRAFT'].indexOf(W.state)>=0){var label=Ls(send?'aria.sendSpoken':'aria.talk');if(pill.getAttribute('aria-label')!==label)pill.setAttribute('aria-label',label);}
};

var firstRunDraft=document.createElement('section'),firstRunDraftText=document.createElement('p');
firstRunDraft.className='conversation';firstRunDraft.id='first-run-draft';firstRunDraftText.className='conversation-phrase';firstRunDraft.appendChild(firstRunDraftText);stage.appendChild(firstRunDraft);
var firstRunInputRender=renderTexts;
renderTexts=function(){
  firstRunInputRender();
  if(['ASK_TEACH','HELD_DRAFT','LISTENING','PRE_PERMISSION','TYPING','RISK'].indexOf(W.state)>=0)st(avatarEl,null,0);
  if(TALK_MODE==='tap'&&W.state==='ASK_TEACH'&&W.hint===Ls('hint.hold'))setHint('');
  var shown=W.state==='HELD_DRAFT'||TALK_MODE==='tap'&&W.state==='LISTENING';
  firstRunDraft.style.display=shown?'block':'none';if(!shown)return;
  var k=Math.max(1,+(SESSION&&SESSION.textScale)||1)/(FIT||1),q=W.state==='HELD_DRAFT'?W.speechDraft:(firstRunBase+' '+W.speechText).trim();
  firstRunDraft.style.top='430px';firstRunDraftText.textContent=q;
  firstRunDraftText.style.fontSize=26*k+'px';firstRunDraftText.style.lineHeight=32*k+'px';
  if(firstRunDraftText.offsetHeight>96*k){firstRunDraftText.style.fontSize=22*k+'px';firstRunDraftText.style.lineHeight=27*k+'px';}
  st(txEl,null,0);
};

var firstRunTypeSubmit=typeSubmit;
typeSubmit=function(){if(String(typeIn.value||'').trim()!==W.question)W.qCompanion=false;firstRunTypeSubmit();};
var firstRunApplySession=applySession;
applySession=function(s){
  var locale=LOCALE;firstRunApplySession(s);
  if(locale!==LOCALE){firstRunInputSeq++;firstRunBase='';W.question='';W.speechDraft='';W.qCompanion=false;typeIn.value='';typeAutosize();}
};
