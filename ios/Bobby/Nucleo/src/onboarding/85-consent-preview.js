/* SPEC4.7.6: composition approved by Claude 2026-10-11 05:32.
   The legal strings remain native, unchanged. Legacy geometry stays for its frozen twin. */
var consentPreviewNotNow=null, consentHintUntil=0, consentNotNowArmed=false;
function consentNotNowLayout(){
  var scale=FIT||1,type=Math.max(1,+(SESSION&&SESSION.textScale)||1);
  stage.style.setProperty('--preview-target',44/scale+'px');stage.style.setProperty('--preview-type',type);
  if(!consentPreviewNotNow)return;
  // Keep the approved width unless the full scaled label needs a single wider line.
  var style=getComputedStyle(consentPreviewNotNow),padding=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
  var wide=Math.ceil(textW(consentPreviewNotNow.textContent,style.font))+padding>200;
  sc(consentPreviewNotNow,'width',wide?'350px':'');sc(consentPreviewNotNow,'left',wide?'20px':'');
}
function consentRiskLayout(){
  consentNotNowLayout();
  // A relayout can leave the overflowing version: restore its original nodes before measuring.
  if(rbodyEl&&rbodyEl._consentBody){
    var previous=rbodyEl,copy=previous._consentBody;
    lineEls.forEach(function(line){line.style.overflowWrap='';linesEl.appendChild(line);});linesEl.appendChild(copy);linesEl.removeChild(previous);
    copy.style.overflowY='';copy.style.overflowWrap='';copy.setAttribute('role','region');copy.setAttribute('aria-label',previous.getAttribute('aria-label'));copy.tabIndex=-1;rbodyEl=copy;
  }
  var type=Math.max(1,+(SESSION&&SESSION.textScale)||1),y=404,tops=[],lh=18*type;
  for(var i=0;i<lineEls.length;i++){
    lineEls[i].style.fontSize=19*type+'px';lineEls[i].style.lineHeight=22*type+'px';
    tops.push(y);sc(lineEls[i],'top',f1(y)+'px');y+=(lineEls[i].offsetHeight||22*type)+4;
  }
  y+=8;rbodyEl.style.fontSize=13*type+'px';rbodyEl.style.lineHeight=lh+'px';sc(rbodyEl,'top',f1(y)+'px');
  sc(rbodyEl,'height','auto');
  var natural=rbodyEl.scrollHeight||rbodyEl.offsetHeight,room=Math.max(lh,Math.floor((638-y)/lh)*lh),height=Math.min(natural,room);
  // Keep the approved composition whenever its headings and one complete body line fit.
  // Otherwise the whole disclosure scrolls together, above the three fixed controls.
  if(y+Math.min(natural,lh)>638){
    var body=rbodyEl,region=document.createElement('div'),bottom=630;
    region.className='rb consent-risk-scroll';region.setAttribute('role','region');
    region.setAttribute('aria-label',body.getAttribute('aria-label'));region.tabIndex=-1;
    region.style.left='0';region.style.width='350px';region.style.top='404px';region.style.height=(bottom-404)+'px';
    region.style.color='var(--ink)';region.style.pointerEvents='auto';region.style.overflowX='hidden';region.style.setProperty('--risk-solid','0px');
    linesEl.appendChild(region);
    y=0;tops=[];
    lineEls.forEach(function(line){
      region.appendChild(line);line.style.overflowWrap='anywhere';tops.push(404+y);sc(line,'top',f1(y)+'px');
      y+=(line.offsetHeight||22*type)+4;
    });
    y+=8;region.appendChild(body);body.style.overflowWrap='anywhere';
    natural=body.scrollHeight||body.offsetHeight;sc(body,'top',f1(y)+'px');sc(body,'height',f1(natural)+'px');
    body.style.overflowY='visible';cls(body,'up',false);cls(body,'dn',false);body.scrollTop=0;
    body.removeAttribute('role');body.removeAttribute('aria-label');body.tabIndex=-1;
    region._consentBody=body;rbodyEl=region;
    RISK_LAYOUT={top:404,tops:tops,body:404,bodyHeight:bottom-404,notice:642,lineHeight:lh,solidLines:4,scrollAll:true};
    return RISK_LAYOUT;
  }
  sc(rbodyEl,'height',f1(height)+'px');rbodyEl.scrollTop=0;
  // Four whole lines stay at the body's full colour; the separate cue marks continuation.
  rbodyEl.style.setProperty('--risk-solid',4*lh+'px');
  RISK_LAYOUT={top:404,tops:tops,body:y,bodyHeight:height,notice:642,lineHeight:lh,solidLines:4};
  return RISK_LAYOUT;
}
ENTER.RISK=function(a){
  consentNotNowArmed=false;
  FIRST_HELLO_UNTIL=0;stage.classList.add('consent-preview');$('sheet').style.display='none';
  W.riskOnly=!!a.only;W.agree=null;W.agreeBusy=false;W.agreeReady=false;W.micBreath=false;
  if(isOn('title'))tg('title');if(isOn('chips'))tg('chips');setHint('');
  var scale=FIT||1;
  moveSphere(270,Math.max(44/scale,88));
  if(!consentPreviewNotNow){
    consentPreviewNotNow=document.createElement('button');consentPreviewNotNow.className='quiet-link';consentPreviewNotNow.id='consent-preview-not-now';
    // A preceding question tap can leave a compatibility click in this same row.
    // Pointer activation belongs to this control only when its press began here.
    consentPreviewNotNow.addEventListener('pointerdown',function(){consentNotNowArmed=W.state==='RISK'&&!W.agreeBusy;});
    consentPreviewNotNow.addEventListener('pointercancel',function(){consentNotNowArmed=false;});
    consentPreviewNotNow.addEventListener('click',function(e){
      var armed=consentNotNowArmed;consentNotNowArmed=false;
      if(e.detail===0||armed)consentDecline();
    });stage.appendChild(consentPreviewNotNow);
  }
  consentPreviewNotNow.textContent=Ls('risk.notNow');consentPreviewNotNow.setAttribute('aria-label',Ls('risk.notNow'));
  consentNotNowLayout();
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
  if(consentPreviewNotNow){consentPreviewNotNow.style.display=shown?'block':'none';consentPreviewNotNow.disabled=!shown;if(!shown)consentNotNowArmed=false;}
  if(W.state!=='RISK')stage.classList.remove('consent-preview');
  if(consentHintUntil&&T>=consentHintUntil){consentHintUntil=0;if(W.state==='RISK')setHint('');}
};
var consentPreviewRoute=route;
route=function(s){if(s&&s.consentPreview){enterBorn();go('RISK',{only:true});}else consentPreviewRoute(s);};
