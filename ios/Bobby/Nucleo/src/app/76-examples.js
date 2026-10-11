/* The first-run example row lives beside the unchanged Android-pinned chip and nudge blocks. */
function homeExamples(){
  var assets=[],seen={},education=[], index=SES&&SES.exampleIndex||0;
  if(!SES||!SES.companionPilot||SES.companionPilot.enabled!==false){
    var q=tt('ex.'+(Math.max(0,Math.min(5,index))+1));
    education=[{label:q,ariaLabel:q,action:{question:q,companion:true,starter:true}}];
  }
  if(!oneTapOff())((SUGG&&SUGG.quickAccess)||[]).forEach(function(item){
    var sym=String(item&&item.symbol||'').toUpperCase(),name=String(item&&item.name||sym);
    if(!name||assets.length>=2||seen[sym]||!/^[A-Z0-9.^=-]{1,20}$/.test(sym))return;
    seen[sym]=true;var q=RMOD.t(LANG,'follow.how',{symbol:name});
    assets.push({label:name,ariaLabel:q,action:{question:q,symbol:sym,starter:true}});
  });
  var list=SES&&SES.hasDeliveredRead?assets.concat(education):education.concat(assets);
  // Keep the educational question while dropping the last asset that cannot fit.
  var max=nudgeNow()?2:3;
  while(list.length>max){var i=list.length-1;while(i>=0&&list[i].action.companion)i--;if(i<0)break;list.splice(i,1);}
  return list;
}
function homeRowWidth(list){
  var width=Math.max(0,list.length-1)*8;
  list.forEach(function(c){var b=mk('button','chip',c.label);b.style.visibility='hidden';el.chipRow.appendChild(b);width+=b.offsetWidth||160;el.chipRow.removeChild(b);});
  return width;
}
showIdleSuggestions=function(){
  if(ST.name!=='IDLE')return;
  var list=homeExamples(),n=nudgeNow(),row=n?[{label:n.cta}].concat(list):list;
  while(row.length>1&&homeRowWidth(row)>350){
    var i=list.length-1;while(i>=0&&list[i].action.companion)i--;if(i<0)break;list.splice(i,1);
    row=n?[{label:n.cta}].concat(list):list;
  }
  list=withNudge(list);
  if(list.length)chipsShow(list,n? nudgeEyebrow():false);else chipsHide();
  DYING.forEach(function(c){if(c.el.parentNode)c.el.parentNode.removeChild(c.el);});DYING=[];
  A.chips.forEach(function(c){c.el.style.minHeight=(44/(fitS||1))+'px';c.el.style.minWidth=(44/(fitS||1))+'px';c.el.style.maxWidth='none';c.el.style.textOverflow='clip';c.el.style.whiteSpace='nowrap';c.h=c.el.offsetHeight||44/(fitS||1);});
  A.chipX.set(0);
};
var exampleChipAct=chipAct;
chipAct=function(c){
  var a=c&&c.action;
  if(a&&a.companion&&a.starter){go('SENDING',{question:a.question,params:{question:a.question,chip:true,companion:true},origin:'chip',cx:c.x+c.w/2,cy:c.y});return;}
  return exampleChipAct(c);
};
