/* Reuse the first-run header exit and the same Quiet field microphone as the daily page. */
var firstRunFieldMic=null;
function firstRunTypeMic(){
  if(TALK_MODE!=='tap')return;
  if(!firstRunFieldMic){
    firstRunFieldMic=document.createElement('button');firstRunFieldMic.id='first-run-field-mic';firstRunFieldMic.className='quiet-glyph';
    firstRunFieldMic.innerHTML='<svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true"><rect x="6" y="1" width="6" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M3 9v2a6 6 0 0 0 12 0V9M9 17v4M6 21h6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
    firstRunFieldMic.addEventListener('click',function(){
      if(W.state!=='TYPING'||typeComposing)return;
      var q=String(typeIn.value||'').trim();showTypeBox(false);
      if(q)firstRunHold(q,'');else go('ASK_TEACH',{quiet:true});
      try{typeIn.blur();}catch(_){}
      firstRunFieldCapture=true;firstRunListen(false);
    });
    typeBox.insertBefore(firstRunFieldMic,typeSend);
  }
  firstRunFieldMic.setAttribute('aria-label',Ls('aria.talk'));
}
function firstRunDiscard(){
  firstRunCancelCapture();cancelInput();firstRunBase='';W.question='';W.speechDraft='';W.speechText='';W.qCompanion=false;W.heldCaption='';typeIn.value='';showTypeBox(false);
  go('ASK_TEACH',{quiet:true});setHint('');
}
var firstRunControlCloseActive=closeActive,firstRunControlCloseTap=closeTap;
closeActive=function(){return W.state==='LISTENING'||W.state==='HELD_DRAFT'||firstRunControlCloseActive();};
closeTap=function(){if(W.state==='LISTENING'||W.state==='HELD_DRAFT')firstRunDiscard();else firstRunControlCloseTap();};
var firstRunControlRender=renderTexts;
renderTexts=function(){
  firstRunControlRender();var own=W.state==='LISTENING'||W.state==='HELD_DRAFT';
  closeEl.classList.toggle('quiet-glyph',own);
  if(own){
    st(wmEl,null,0);st(closeEl,null,1);cls(closeEl,'on',true);sa(closeEl,'aria-label',Ls('aria.discardSpoken'));
    closeEl.style.width=closeEl.style.height=(44/(FIT||1))+'px';closeEl.tabIndex=0;sa(closeEl,'aria-hidden','false');
  }else{
    closeEl.style.width=closeEl.style.height='';closeEl.tabIndex=closeActive()?0:-1;sa(closeEl,'aria-hidden',closeActive()?'false':'true');
  }
};

function firstRunUnavailable(){
  firstRunFieldCapture=false;
  if(firstRunBase)firstRunHold(firstRunBase,'hint.micOff');else{go('ASK_TEACH',{quiet:true});setHint(Ls('hint.micOff'));}
  if(firstRunKeyboard&&firstRunKeyboard.animate)firstRunKeyboard.animate([{transform:'scale(1)'},{transform:'scale(1.1)'},{transform:'scale(1)'}],{duration:320});
}

/* A9.7: automatic-stop sentences use meta; microphone-on captions use the listening tint. */
var firstRunControlHint=renderHint;
renderHint=function(){
  firstRunControlHint();
  $('hint').style.visibility=W.state==='TYPING'?'hidden':'';
  var meta=TALK_MODE==='tap'&&W.state==='HELD_DRAFT'&&(W.heldCaption==='cap.minute'||W.heldCaption==='cap.stopped');
  $('hint').classList.toggle('first-run-meta-caption',meta);
  $('hint').classList.toggle('first-run-live-caption',TALK_MODE==='tap'&&W.state==='LISTENING');
};
