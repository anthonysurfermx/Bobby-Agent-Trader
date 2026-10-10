/* Educational replies share the sphere, but never enter the verdict, save or market-read states. */
var GUIDE = null, CHECKIN = null, GUIDE_RETRIES = 0, GUIDE_BUSY = false, GUIDE_INPUT_CHECKIN = false, GUIDE_EPOCH = 0;
var guidePanel = mk('section'), guideReply = mk('p'), guideMark = mk('small'), guideFact = mk('p'), guideQuestion = mk('p'), guideOptions = mk('div'), guideActions = mk('div');
guidePanel.id = 'companionPanel'; guidePanel.setAttribute('aria-live', 'polite'); guidePanel.style.cssText = 'position:absolute;left:24px;top:464px;width:342px;max-height:282px;overflow-y:auto;z-index:18;display:none;padding:8px 0 18px;overscroll-behavior:contain;touch-action:none;pointer-events:auto;color:var(--ink);font:16px/1.5 var(--sans)';
guideReply.style.cssText = 'font-size:17px;line-height:1.5;white-space:pre-wrap';
guideMark.style.cssText = 'display:block;font-size:11px;color:var(--ink3);margin-top:8px';
guideFact.style.cssText = 'font-size:13px;color:var(--ink2);border-left:1px solid var(--line);padding-left:12px;margin-top:16px';
guideQuestion.style.cssText = 'font-size:17px;line-height:1.45;margin-top:20px';
guideOptions.style.cssText = 'display:flex;flex-direction:column;align-items:stretch;gap:7px;margin-top:12px';
guideActions.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:16px';
[guideReply,guideMark,guideFact,guideQuestion,guideOptions,guideActions].forEach(function(e){ guidePanel.appendChild(e); }); uiEl.appendChild(guidePanel);
function guideWords(){ return SES && SES.companionPilot && SES.companionPilot.strings || {}; }
function guideButton(host, text, action, id, primary){
  var b = mk('button', null, text); b.type = 'button'; b.id = id;
  b.style.cssText = 'min-height:44px;width:100%;text-align:left;padding:10px 14px;border-radius:16px;white-space:normal;overflow-wrap:anywhere;line-height:1.4;font-size:14px;background:' + (primary ? 'rgba(242,237,228,.10)' : 'transparent') + ';border:1px solid var(--hair)';
  b._guideAction = action; host.appendChild(b); return b;
}
/* The stage owns gestures. Keep this scrollable text panel's gestures inside it, including VoiceOver clicks. */
var guidePointer = null;
guidePanel.addEventListener('pointerdown', function(e){
  e.stopPropagation(); if (e.cancelable) e.preventDefault();
  guidePointer = { y:e.clientY, top:guidePanel.scrollTop, button:e.target.closest('button'), moved:false, id:e.pointerId };
  try { guidePanel.setPointerCapture(e.pointerId); } catch (_) {}
});
guidePanel.addEventListener('pointermove', function(e){
  e.stopPropagation(); if (!guidePointer) return;
  var delta = (e.clientY - guidePointer.y) / (fitS || 1);
  if (Math.abs(delta) > 7) guidePointer.moved = true;
  if (guidePointer.moved) guidePanel.scrollTop = guidePointer.top - delta;
});
guidePanel.addEventListener('pointerup', function(e){
  e.stopPropagation(); var p = guidePointer; guidePointer = null;
  if (p && !p.moved && p.button && !p.button.disabled && p.button._guideAction) p.button._guideAction();
});
guidePanel.addEventListener('pointercancel', function(){ guidePointer = null; });
guidePanel.addEventListener('click', function(e){
  e.stopPropagation(); if (e.detail !== 0) return;
  var b = e.target.closest('button'); if (b && !b.disabled && b._guideAction) b._guideAction();
});
function guideAsk(question, retry){
  if (GUIDE_BUSY) return;
  if (retry) GUIDE_RETRIES++; else GUIDE_RETRIES = 0;
  CHECKIN = null;
  go('SENDING', { params:{question:question,companion:true}, question:question, origin:'person', cx:195,cy:660 });
}
function guideRender(){
  if (!GUIDE) return;
  var words = guideWords(), question = CHECKIN && CHECKIN.question;
  guideReply.textContent = GUIDE.text || GUIDE.message || '';
  guideMark.textContent = GUIDE.personalized ? words.personalized || '' : '';
  guideFact.textContent = '';
  if (GUIDE.fact && typeof GUIDE.fact.text === 'string' && typeof GUIDE.fact.source === 'string' && typeof GUIDE.fact.year === 'string') {
    guideFact.textContent = GUIDE.fact.text + '\n' + GUIDE.fact.source + ' · ' + GUIDE.fact.year;
  }
  guideFact.style.display = guideFact.textContent ? 'block' : 'none';
  guideQuestion.textContent = question ? question.text : '';
  guideOptions.textContent = ''; guideActions.textContent = '';
  if (question){
    (question.options || []).forEach(function(option){
      guideButton(guideOptions, option.label, function(){ guideAnswer(question.id,option.id); }, 'companion-option-' + option.id, true);
    });
    guideButton(guideActions, words.skip || '', function(){ guideAnswer(question.id,null); }, 'companion-skip', false);
  } else if (GUIDE.status === 'companion_error') {
    if (GUIDE.retryable && GUIDE_RETRIES < 1) guideButton(guideActions, words.retry || '', function(){ guideAsk(READ.question,true); }, 'companion-retry', true);
  } else if (GUIDE.followUp) {
    guideButton(guideActions, GUIDE.followUp, function(){ guideAsk(GUIDE.followUp,false); }, 'companion-follow-up', true);
  }
  guideButton(guideActions, words.close || '', function(){ CHECKIN = null; GUIDE_RETRIES = 0; go('RETURNING'); }, 'companion-close', false);
  guidePanel.style.display = 'block';
}
function guideAnswer(id,value){
  if (GUIDE_BUSY) return; GUIDE_BUSY = true; var epoch = GUIDE_EPOCH;
  Array.prototype.forEach.call(guidePanel.querySelectorAll('button'), function(b){ b.disabled = true; });
  var params = {questionId:id}; if (value != null) params.value = value;
  bcall('companion.answer',params).then(function(result){
    GUIDE_BUSY = false; if (epoch !== GUIDE_EPOCH) return;
    if (result && !result.message) CHECKIN = result;
    else if (result && result.message) guideMark.textContent = result.message;
    if ((!CHECKIN || !CHECKIN.question) && ST.name !== 'COMPANION') {
      guidePanel.style.display = 'none';
      if (ST.name === 'HANDBACK') readChips(); else if (ST.name === 'FOLLOWUPS') chipsShow(withNudge(RMOD.followUps(READ.model, SUGG || {}, LANG)), nudgeEyebrow());
      return;
    }
    guideRender();
    guidePanel.scrollTop = guideQuestion.offsetTop;
  },function(){ GUIDE_BUSY = false; if (epoch === GUIDE_EPOCH) guideRender(); });
}
function companionCheckIn(payload){
  if (!payload || !payload.question) { CHECKIN = null; if (ST.name === 'COMPANION') guideRender(); return; }
  CHECKIN = payload;
  if (ST.name === 'COMPANION') { guideRender(); return; }
  /* A market reply keeps its own cards. The check-in lives beside it and leaves when that reply leaves. */
  if (['HANDBACK','FOLLOWUPS'].indexOf(ST.name) >= 0){
    chipsHide(); GUIDE = { status:'companion', text:'' }; guideRender();
  }
}
STATES.COMPANION = {
  enter:function(prev,data){
    GUIDE = data.reply || GUIDE; CHECKIN = GUIDE.companionCheckIn || CHECKIN;
    dissolveThink(); glassHome(); moveSphere(320,110); hint(''); pillMode(idleMode()); att(el.sphereA,'aria-label',tt('aria.speaking'));
    guideRender(); guidePanel.scrollTop = 0; if (GUIDE.companionConsentPending) bcall('companion.presented').catch(noop);
    if (GUIDE.status === 'companion' && GUIDE.requestId && GUIDE.text && !GUIDE.spoken){
      GUIDE.spoken = true; VOICE.id = GUIDE.requestId; VOICE.started = false; VOICE.ended = false; VOICE.reqT = clk;
      kInit(GUIDE.text);
      bcall('speak',{id:GUIDE.requestId,text:GUIDE.text}).then(function(reply){
        if (reply && reply.status !== 'queued') { VOICE.ended = true; if (ST.name === 'COMPANION') pillMode(idleMode()); }
      }).catch(function(){ VOICE.ended = true; });
    }
  },
  exit:function(){ GUIDE_EPOCH++; guidePanel.style.display = 'none'; if (VOICE.id && !VOICE.ended) bcall('stopSpeaking').catch(noop); VOICE.id=null; K.on=false; },
  tick:noop,
  on:function(name){ if (name === 'voice.start') pillMode('stop'); else if (name === 'voice.end') pillMode(idleMode()); },
  down:function(hit,p){ if (hit === 'pill'){ if (VOICE.started && !VOICE.ended) return tapG(function(){ bcall('stopSpeaking').catch(noop); VOICE.ended=true; pillMode(idleMode()); }); GUIDE_INPUT_CHECKIN=!!(CHECKIN && CHECKIN.question); return pillDown(p,true); } if (hit === 'close') return tapG(function(){ CHECKIN=null;go('RETURNING'); }); return null; }
};

function guideResumeOptions(){ if (!GUIDE_INPUT_CHECKIN || !GUIDE || !CHECKIN || !CHECKIN.question) return false; GUIDE_INPUT_CHECKIN=false; go('COMPANION',{reply:GUIDE}); guidePanel.scrollTop=guideQuestion.offsetTop; return true; }
