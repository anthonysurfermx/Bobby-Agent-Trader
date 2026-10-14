/* SPEC4.7.6: composition approved by Claude 2026-10-11 05:32.
   The legal strings remain native, unchanged. Legacy geometry stays for its frozen twin. */
var consentPreviewNotNow=null, consentHintUntil=0;
function consentRiskLayout(){
  var type=Math.max(1,+(SESSION&&SESSION.textScale)||1),y=404,tops=[],lh=18*type;
  for(var i=0;i<lineEls.length;i++){
    lineEls[i].style.fontSize=19*type+'px';lineEls[i].style.lineHeight=22*type+'px';
    tops.push(y);sc(lineEls[i],'top',f1(y)+'px');y+=(lineEls[i].offsetHeight||22*type)+4;
  }
  y+=8;rbodyEl.style.fontSize=13*type+'px';rbodyEl.style.lineHeight=lh+'px';sc(rbodyEl,'top',f1(y)+'px');
  sc(rbodyEl,'height','auto');
  var natural=rbodyEl.scrollHeight||rbodyEl.offsetHeight,room=Math.max(lh,Math.floor((638-y)/lh)*lh),height=Math.min(natural,room);
  sc(rbodyEl,'height',f1(height)+'px');rbodyEl.scrollTop=0;
  // Four whole lines stay at the body's full colour; the separate cue marks continuation.
  rbodyEl.style.setProperty('--risk-solid',4*lh+'px');
  RISK_LAYOUT={top:404,tops:tops,body:y,bodyHeight:height,notice:642,lineHeight:lh,solidLines:4};
  return RISK_LAYOUT;
}
ENTER.RISK=function(a){
  FIRST_HELLO_UNTIL=0;stage.classList.add('consent-preview');$('sheet').style.display='none';
  W.riskOnly=!!a.only;W.agree=null;W.agreeBusy=false;W.agreeReady=false;W.micBreath=false;
  if(isOn('title'))tg('title');if(isOn('chips'))tg('chips');setHint('');
  var scale=FIT||1,type=Math.max(1,+(SESSION&&SESSION.textScale)||1);
  stage.style.setProperty('--preview-target',44/scale+'px');stage.style.setProperty('--preview-type',type);
  moveSphere(270,Math.max(44/scale,88));
  if(!consentPreviewNotNow){
    consentPreviewNotNow=document.createElement('button');consentPreviewNotNow.className='quiet-link';consentPreviewNotNow.id='consent-preview-not-now';
    consentPreviewNotNow.addEventListener('click',consentDecline);stage.appendChild(consentPreviewNotNow);
  }
  consentPreviewNotNow.textContent=Ls('risk.notNow');consentPreviewNotNow.setAttribute('aria-label',Ls('risk.notNow'));
  tb('agreeRing');tb('pillIn',T-1);setPill('agree',Ls('risk.hold'),pillFor(Ls('risk.hold'),196));
  loadRisk().then(function(){if(W.state==='RISK')riskLinesIn();},function(){if(W.state==='RISK')setHint(Ls('risk.failed'));});
};
riskLinesIn=function(){
  buildRisk(RISK_NOTICE.statements);var L=consentRiskLayout();
  sc(rmoreEl,'top',f1(L.body+L.bodyHeight+1)+'px');sc(noticeEl,'top',f1(L.notice)+'px');
  tb('lines',T-2);tb('notice',T-1);setPill('agree',Ls('risk.hold'),pillFor(Ls('risk.hold'),196));W.agreeReady=true;signal('AGREE_READY');
};
function consentDecline(){
  if(W.state!=='RISK'||W.agreeBusy)return;
  W.agree=null;W.agreeReady=false;tg('agreeRing');tg('lines');tg('notice');stage.classList.remove('consent-preview');
  if(W.question){firstRunHold(W.question,W.qSrc==='voice'&&SESSION&&SESSION.mic&&SESSION.mic.onDevice===false?'':'risk.kept');}
  else{W.riskLater=true;go('ASK_TEACH',{quiet:true});}
}
var consentAgreeRelease=agreeRelease;
agreeRelease=function(){
  var early=W.state==='RISK'&&W.agree&&W.agree.t0!=null&&W.agree.done==null;
  consentAgreeRelease();
  if(early){setHint(Ls('risk.holdHint'));consentHintUntil=T+1.5;W.rimBoost.x=.15;to(W.rimBoost,0);}
};
var consentRenderTexts=renderTexts;
renderTexts=function(){
  consentRenderTexts();var shown=W.state==='RISK'&&!W.agreeBusy;
  if(consentPreviewNotNow){consentPreviewNotNow.style.display=shown?'block':'none';consentPreviewNotNow.disabled=!shown;}
  if(W.state!=='RISK')stage.classList.remove('consent-preview');
  if(consentHintUntil&&T>=consentHintUntil){consentHintUntil=0;if(W.state==='RISK')setHint('');}
};
var consentPreviewRoute=route;
route=function(s){if(s&&s.consentPreview){enterBorn();go('RISK',{only:true});}else consentPreviewRoute(s);};
