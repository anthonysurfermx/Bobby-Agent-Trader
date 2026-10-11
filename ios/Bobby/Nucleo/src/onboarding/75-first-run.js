/* The first ready screen is live when birth ends; C1 is a silent, interruptible title. */
var FIRST_HELLO_UNTIL=0, firstRunKeyboard=null;
ENTER.BIRTH=function(){
  loadRoster().catch(noop);
  W.birthT=T;
  if(RM){enterBorn();go('ASK_TEACH');return;}
  W.r.x=W.r.t=2;W.birth.x=W.birth.t=0;
  at(.10,function(){to(W.r,120,'birth');to(W.birth,1);to(W.glow,1);to(W.energy,.35);});
  at(1.2,function(){W.birthMass=false;tb('wmFly',T-5);go('ASK_TEACH',{hello:true});});
};
ENTER.HELLO=function(){enterBorn();go('ASK_TEACH',{hello:!RM});};
var firstRunAskEnter=ENTER.ASK_TEACH;
var FIRST_HELLO_FOLD=0;
function firstRunTitle(){
  if(FIRST_HELLO_UNTIL&&!RM){FIRST_HELLO_FOLD=T;var echo=titleEl.cloneNode(true);echo.removeAttribute('id');echo.setAttribute('aria-hidden','true');stage.appendChild(echo);var fold=echo.animate([{opacity:1,transform:'translateY(0) scale(1)'},{opacity:0,transform:'translateY(-90px) scale(.5)'}],{duration:220});fold.onfinish=function(){echo.remove();};}
  FIRST_HELLO_UNTIL=0;W.title=[Ls('ask.title'),W.riskLater?Ls('risk.later'):Ls('ask.sub')];
  titleEl.style.fontSize='34px';titleEl.style.lineHeight='36px';titleEl.style.whiteSpace='normal';
  tb('title');
}
ENTER.ASK_TEACH=function(a){
  firstRunAskEnter(a);
  W.agMode='plain';W.duel=null;W.conv=null;W.nodeOn=[false,false,false];
  setPill('mic','',96);W.pillModeT=T-1;W.micBreath=true;tb('pillIn',T-1);
  if(a.hello&&!RM){
    FIRST_HELLO_UNTIL=T+2.5;W.title=[Ls('hello').replace(/\|/g,' '),''];tb('title');
    titleEl.style.fontSize='22px';titleEl.style.lineHeight='27px';
    at(2.5,firstRunTitle);
  }else firstRunTitle();
  setChips(firstRunExamples());tb('chips',T-1);
  loadSugg().then(function(){if(W.state==='ASK_TEACH'){setChips(firstRunExamples());tb('chips',T-1);}});
  if(!firstRunKeyboard){
    firstRunKeyboard=document.createElement('button');firstRunKeyboard.className='quiet-glyph';
    firstRunKeyboard.id='first-run-keyboard';firstRunKeyboard.innerHTML='<svg width="20" height="14" viewBox="0 0 20 14" aria-hidden="true"><rect x="1" y="1" width="18" height="12" rx="2" fill="none" stroke="currentColor"/><path d="M4 4h2m2 0h2m2 0h2m2 0h1M4 7h2m2 0h2m2 0h2m2 0h1M6 10h8" stroke="currentColor"/></svg>';
    firstRunKeyboard.addEventListener('click',firstRunType);
    stage.appendChild(firstRunKeyboard);
  }
  firstRunKeyboard.setAttribute('aria-label',Ls('aria.type'));
};
function firstRunExamples(){
  var list=[],s=W.sugg,seen={};
  if(!SESSION||!SESSION.companionPilot||SESSION.companionPilot.enabled!==false){
    var index=SESSION&&SESSION.exampleIndex||0,q=Ls('ex.'+(Math.max(0,Math.min(5,index))+1));
    list.push({label:q,ariaLabel:q,action:{ask:q,companion:true}});
  }
  if(!SESSION||SESSION.oneTap!==false)((s&&s.quickAccess)||[]).forEach(function(item){
    if(list.length>=3||!item||seen[item.symbol])return;seen[item.symbol]=true;
    var name=String(item.name||item.symbol||'');if(!name)return;
    var q=Ls('follow.how',{symbol:name});list.push({label:name,ariaLabel:q,action:{ask:q,symbol:item.symbol}});
  });
  var width=function(){return list.reduce(function(w,c){return w+textW(c.label,'500 15px '+getComputedStyle(stage).fontFamily)+32;},Math.max(0,list.length-1)*8);};
  while(list.length>1&&width()>350){var i=list.length-1;while(i>0&&list[i].action.companion)i--;list.splice(i,1);}
  return list;
}
var firstRunChipTap=chipTap;
chipTap=function(i){var c=W.chips[i];W.qCompanion=!!(c&&c.action&&c.action.companion);return firstRunChipTap(i);};
var firstRunRenderTexts=renderTexts;
renderTexts=function(){
  firstRunRenderTexts();
  stage.style.setProperty('--first-fit',String(FIT||1));
  if(W.state==='ASK_TEACH'&&FIRST_HELLO_UNTIL&&T>=FIRST_HELLO_UNTIL)firstRunTitle();
  if(W.state==='ASK_TEACH'&&!FIRST_HELLO_UNTIL){
    if(titleEl.scrollHeight>72||titleEl.scrollWidth>350){titleEl.style.fontSize='28px';titleEl.style.lineHeight='32px';}
    subEl.style.top=(512+Math.min(64,titleEl.offsetHeight||36)+12)+'px';
    subEl.style.display=(parseFloat(subEl.style.top)+(subEl.offsetHeight||42)>632)?'none':'';
  }
  if(firstRunKeyboard){
    var shown=['ASK_TEACH','HELD_DRAFT','LISTENING','PRE_PERMISSION'].indexOf(W.state)>=0;
    firstRunKeyboard.style.display=shown?'grid':'none';
    firstRunKeyboard.style.width=firstRunKeyboard.style.height=(44/(FIT||1))+'px';
    firstRunKeyboard.style.left=(105-22/(FIT||1))+'px';firstRunKeyboard.style.top=(770-22/(FIT||1))+'px';
  }
  if(W.state==='ASK_TEACH')chipEls.forEach(function(c){c.style.minHeight=(44/(FIT||1))+'px';});
};
document.addEventListener('pointerdown',function(){if(FIRST_HELLO_UNTIL&&W.state==='ASK_TEACH')firstRunTitle();},{capture:true});

// Old scheduled suggestion callbacks use this same row, never the build69 abbreviations.
suggestionChips=firstRunExamples;
var firstRunRiskProfile=renderRiskProfile;
renderRiskProfile=function(){
  firstRunRiskProfile();
  if((W.state==='ASK_TEACH'||W.state==='HELD_DRAFT')&&SESSION&&!SESSION.riskAccepted){
    riskProfileEl.classList.add('quiet-secondary');riskProfileEl.style.background='rgba(242,237,228,.06)';riskProfileEl.style.borderColor='rgba(242,237,228,.30)';
    riskProfileEl.style.minHeight=(44/(FIT||1))+'px';riskProfileEl.disabled=false;riskProfileEl.tabIndex=0;
    sa(riskProfileEl,'aria-hidden','false');st(riskProfileEl,null,1);cls(riskProfileEl,'tap',true);
  }
};
var firstRunAction=action;
action=function(hit,idx){
  if(hit==='profile'&&SESSION&&!SESSION.riskAccepted&&(W.state==='ASK_TEACH'||W.state==='HELD_DRAFT')){fire('openNative',{route:'account'});return;}
  firstRunAction(hit,idx);
};
// Ready means all examples are placed immediately, including late suggestion refreshes.
var firstRunSetChips=setChips;
setChips=function(list){firstRunSetChips(list);if(W.state==='ASK_TEACH')tb('chips',T-1);};
