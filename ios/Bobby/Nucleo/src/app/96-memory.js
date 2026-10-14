/* I-2: native supplies every invitation and owns every counter. The page has no catalog. */
var MEMORY_SCENE=null,MEMORY_NOTES=[],MEMORY_BUSY=false,MEMORY_SEND_EPOCH=0,MEMORY_AUTO=null;
var MEMORY_LAYOUT_KEY=null;
var memoryPanel=mk('section','conversation memory-scene'),memoryScroll=mk('div','memory-scroll'),memoryQuestion=mk('p','conversation-phrase'),memoryWhy=mk('p','memory-why'),memoryError=mk('p','memory-error'),memoryOptions=mk('div','memory-options'),memoryExit=mk('button','quiet-link');
memoryPanel.id='companion-question-scene';memoryQuestion.id='companion-question';memoryError.id='companion-answer-error';memoryOptions.id='companion-options';memoryExit.id='companion-not-now';
[memoryQuestion,memoryWhy,memoryError,memoryOptions].forEach(function(e){memoryScroll.appendChild(e);});memoryPanel.appendChild(memoryScroll);memoryPanel.appendChild(memoryExit);uiEl.appendChild(memoryPanel);memoryPanel.style.display='none';
var ownWords=mk('p','memory-own-words');ownWords.id='companion-own-words';el.typeBox.appendChild(ownWords);
var spokenOwnWords=mk('p','conversation memory-own-words');spokenOwnWords.id='companion-spoken-own-words';uiEl.appendChild(spokenOwnWords);spokenOwnWords.style.display='none';
var notedLine=mk('button','quiet-link memory-noted');notedLine.id='companion-noted';guidePanel.insertBefore(notedLine,guideDisclosure);notedLine.style.display='none';
quietAction(notedLine,function(){var notes=GUIDE&&GUIDE.notes||[];bcall('companion.notes',notes.length===1?{field:notes[0].field}:{}).catch(noop);});
function memoryActive(){return !!MEMORY_SCENE;}
function memoryChip(host,invitation){
 var text=invitation.kind==='remember'?guideWords().invite:invitation.text;
 var b=guideButton(host,text,function(){
  guideStopVoice();
  if(invitation.kind==='remember')bcall('companion.invite').then(function(r){if(r&&r.status==='unavailable'&&GUIDE){GUIDE.invitation=null;guideRender();}}).catch(noop);
  else if(invitation.kind==='dial'){bcall('companion.presented',{kind:'dial',opened:true}).catch(noop);go('SPEAKING_DIAL');}
  else memoryOpen(invitation,true);
 },'companion-bobby-chip',false);
 b.classList.add('memory-chip');b.insertBefore(mk('span','memory-dot'),b.firstChild);b.appendChild(mk('span','memory-chevron','›'));
 b.setAttribute('aria-label',(guideWords().bobbyAsks||'').replace('{question}',text));
 if(!GUIDE.invitationReported){GUIDE.invitationReported=true;bcall('companion.presented',invitation.kind==='question'?{questionId:invitation.questionId||invitation.id}:{kind:invitation.kind==='remember'?'invite':'dial'}).catch(noop);}
}
function memoryOpen(question,report){
 if(!GUIDE||!question)return;MEMORY_SCENE=question;MEMORY_NOTES=[];MEMORY_BUSY=false;GUIDE_ANSWER_ERROR='';GUIDE_INPUT_CHECKIN=true;CHECKIN={question:question};GUIDE.invitation=null;
 if(report)bcall('companion.presented',{questionId:question.questionId||question.id,opened:true}).catch(noop);
 go('PERSONAL_QUESTION');
}
function memoryClose(){
 MEMORY_SEND_EPOCH++;MEMORY_BUSY=false;MEMORY_SCENE=null;GUIDE_ANSWER_ERROR='';GUIDE_INPUT_CHECKIN=false;CHECKIN=null;SPEECH.draft='';el.ta.value='';
 if(GUIDE){if(MEMORY_NOTES.length){GUIDE.notes=MEMORY_NOTES.slice();if(MEMORY_NOTES.some(function(n){return n.field==='fall';}))GUIDE.followUp=guideWords().exerciseFollowUp;}MEMORY_NOTES=[];GUIDE.slotBorn=false;go('COMPANION',{reply:GUIDE});}else go('IDLE',{restoreGreet:true});
}
quietAction(memoryExit,function(){if(MEMORY_BUSY)return;bcall('companion.answer',{questionId:MEMORY_SCENE.questionId||MEMORY_SCENE.id,rest:true}).then(function(){memoryClose();}).catch(function(){memoryError.textContent=guideWords().answerFailed;});});
function memoryPaint(){
 if(!MEMORY_SCENE)return;var q=MEMORY_SCENE;memoryQuestion.textContent=q.text;memoryWhy.textContent=q.why||'';memoryError.textContent=GUIDE_ANSWER_ERROR;memoryExit.textContent=guideWords().notNow;
 memoryOptions.textContent='';memoryOptions.setAttribute('role','group');memoryOptions.setAttribute('aria-label',guideWords().options);
 q.options.forEach(function(o,i){var b=mk('button','memory-choice',o.label);b.id='companion-option-'+o.id;b.type='button';b.setAttribute('aria-label',o.label);b.setAttribute('aria-posinset',i+1);b.setAttribute('aria-setsize',q.options.length);quietAction(b,function(){memoryAnswer(o.id,null,b);});b.disabled=MEMORY_BUSY;memoryOptions.appendChild(b);});memoryExit.disabled=MEMORY_BUSY;
 MEMORY_LAYOUT_KEY=null;memoryLayout();conversationBorn(memoryQuestion,'sphere',32);at(.07,function(){if(MEMORY_SCENE===q)conversationBorn(memoryWhy,'sphere');});conversationBorn(memoryOptions,'pill');conversationBorn(memoryExit,'pill');
}
function memoryLayout(){
 if(!MEMORY_SCENE)return;
 var layoutKey=[fitS,SES&&SES.textScale,ST.name,MEMORY_SCENE.questionId||MEMORY_SCENE.id,GUIDE_ANSWER_ERROR,memoryOptions.style.display,memoryExit.style.display,memoryWhy.style.display].join('|');
 if(MEMORY_LAYOUT_KEY===layoutKey)return;MEMORY_LAYOUT_KEY=layoutKey;var scale=Math.max(.5,fitS||1),k=(SES&&SES.textScale||1)/scale,target=44/scale;
 memoryPanel.style.setProperty('--type',k);memoryPanel.style.setProperty('--target',target+'px');memoryQuestion.style.fontSize=26*k+'px';memoryQuestion.style.lineHeight=32*k+'px';memoryWhy.style.font=15*k+'px/'+21*k+'px var(--sans)';memoryExit.style.font=15*k+'px/'+21*k+'px var(--sans)';memoryExit.style.minHeight=target+'px';memoryError.style.font=15*k+'px/'+21*k+'px var(--sans)';
 memoryPanel.classList.remove('memory-list');memoryScroll.style.height='auto';memoryPanel.style.top='300px';
 var options=Array.prototype.slice.call(memoryOptions.children),height=target;
 options.forEach(function(b){b.style.height='auto';b.style.font=500+' '+15*k+'px/'+20*k+'px var(--sans)';b.style.maxWidth='310px';b.style.minHeight=target+'px';height=Math.max(height,b.offsetHeight);});options.forEach(function(b){b.style.height=height+'px';});
 if(memoryQuestion.offsetHeight>96*k){memoryQuestion.style.fontSize=22*k+'px';memoryQuestion.style.lineHeight=27*k+'px';}
 var p=memoryPanel.offsetHeight,r=clamp((602-12-32-p)/2,44/scale,98),spare=602-12-32-p-2*r;
 if((SES&&SES.textScale||1)>1.35||spare<0){memoryPanel.classList.add('memory-list');r=44/scale;memoryPanel.style.top=(110+2*r+24)+'px';memoryScroll.style.height=Math.max(0,700-parseFloat(memoryPanel.style.top)-Math.max(target,memoryExit.offsetHeight||target)-8)+'px';options.forEach(function(b){b.style.height='auto';b.style.maxWidth='none';});moveSphere(110+r,r);}
 else {var top=110+.4*Math.max(0,spare);moveSphere(top+r,r);memoryPanel.style.top=(top+2*r+32)+'px';}
 memoryFade();memoryListFade();
}
function memoryFade(){var row=memoryOptions;row.style.setProperty('--left-fade',row.scrollLeft>0?'20px':'0px');row.style.setProperty('--right-fade',row.scrollLeft+row.clientWidth<row.scrollWidth-2?'64px':'0px');}
function memoryListFade(){memoryScroll.style.setProperty('--fade-top',memoryScroll.scrollTop>0?'20px':'0px');memoryScroll.style.setProperty('--fade-bottom',memoryScroll.scrollTop+memoryScroll.clientHeight<memoryScroll.scrollHeight-1?'24px':'0px');}
memoryScroll.addEventListener('scroll',memoryListFade);
var memoryListDrag=null;
memoryScroll.addEventListener('pointerdown',function(e){
 if(!memoryPanel.classList.contains('memory-list'))return;
 memoryListDrag={y:e.clientY,top:memoryScroll.scrollTop};
 if(!e.target.closest('button')){e.stopPropagation();if(e.cancelable)e.preventDefault();try{memoryScroll.setPointerCapture(e.pointerId);}catch(_){}}
},true);
memoryScroll.addEventListener('pointermove',function(e){
 if(!memoryListDrag)return;if(e.cancelable)e.preventDefault();e.stopPropagation();
 memoryScroll.scrollTop=Math.max(0,memoryListDrag.top+(memoryListDrag.y-e.clientY)/(fitS||1));memoryListFade();
},true);
['pointerup','pointercancel'].forEach(function(name){memoryScroll.addEventListener(name,function(){memoryListDrag=null;},true);});
var memoryDrag=null;
memoryOptions.addEventListener('pointerdown',function(e){memoryDrag={x:e.clientX,left:memoryOptions.scrollLeft};},true);
memoryOptions.addEventListener('pointermove',function(e){if(memoryDrag&&!memoryPanel.classList.contains('memory-list')){if(e.cancelable)e.preventDefault();memoryOptions.scrollLeft=memoryDrag.left+(memoryDrag.x-e.clientX)/(fitS||1);memoryFade();}e.stopPropagation();});
['pointerup','pointercancel'].forEach(function(n){memoryOptions.addEventListener(n,function(e){memoryDrag=null;e.stopPropagation();});});memoryOptions.addEventListener('scroll',memoryFade);
function memoryAnswer(value,text,button){
 if(!MEMORY_SCENE||MEMORY_BUSY)return;MEMORY_BUSY=true;GUIDE_ANSWER_ERROR='';var q=MEMORY_SCENE,epoch=++MEMORY_SEND_EPOCH,params={questionId:q.questionId||q.id};if(text!=null)params.text=text.slice(0,400);else params.value=value;
 if(button){button.classList.add('selected');button.setAttribute('aria-pressed','true');Array.prototype.forEach.call(memoryOptions.children,function(b){b.disabled=true;if(b!==button)b.style.opacity='.45';});}
 else {SPEECH.draft=text;go('PERSONAL_SENDING');}
 var finish=function(reply){
  if(epoch!==MEMORY_SEND_EPOCH||q!==MEMORY_SCENE)return;MEMORY_BUSY=false;
  if(!reply||reply.status!=='noted'){GUIDE_ANSWER_ERROR=guideWords().answerFailed;go('PERSONAL_QUESTION');if(text!=null){SPEECH.draft=text;CONV_RETURN={name:'PERSONAL_QUESTION',data:{}};convType();el.ta.blur();}return;}
  if(text!=null)reply.note.ownWords=true;MEMORY_NOTES.push(reply.note);tick('success');SPEECH.draft='';el.ta.value='';CONV_RETURN=null;HELD='';
  if(reply.next){MEMORY_SCENE=reply.next;CHECKIN={question:reply.next};go('PERSONAL_QUESTION');}else memoryClose();
 };
 var response=bcall('companion.answer',params).catch(function(){return null;});
 if(button){at(.4,function(){response.then(finish);});}else response.then(finish);
}
STATES.PERSONAL_QUESTION={enter:function(){GUIDE_INPUT_CHECKIN=true;dissolveThink();chromeUp();glassHome();greetOut();chipsHide();meriOut();hint('');A.closeO.set(0);pillMode(idleMode());memoryPanel.style.display='block';memoryPaint();},exit:function(next){if(['TYPING','LISTENING','HELD_DRAFT','PRE_PERMISSION','PERSONAL_SENDING'].indexOf(next)<0){conversationRetire(memoryQuestion,'sphere');conversationRetire(memoryOptions,'pill');}memoryPanel.style.display='none';},down:function(h,p){if(h==='pill')return pillDown(p,true);if(h==='avatar')return tapG(function(){openNative('account');});return null;}};
STATES.PERSONAL_SENDING={enter:function(){memoryPanel.style.display='block';memoryPaint();memoryOptions.style.opacity='.45';pillMode('stop');el.live.textContent=guideWords().answerSending;},exit:function(){memoryOptions.style.opacity='1';memoryPanel.style.display='none';},down:function(h){if(h==='pill')return tapG(function(){MEMORY_SEND_EPOCH++;MEMORY_BUSY=false;bcall('cancel').catch(noop);go('PERSONAL_QUESTION');CONV_RETURN={name:'PERSONAL_QUESTION',data:{}};convType();});return null;}};
var memoryGuideRender=guideRender;guideRender=function(){memoryGuideRender();if(!GUIDE)return;var notes=GUIDE.notes||[];notedLine.style.display=notes.length?'block':'none';if(notes.length){var n=notes[0],w=guideWords();notedLine.textContent=notes.length>1?(w.notedMany||'').replace('{n}',notes.length):n.ownWords?(w.understood||'').replace('{label}',n.label)+' · '+w.correct:'✓ '+(w.noted||'').replace('{label}',n.label);if(GUIDE.reading)guideNarrative.appendChild(notedLine);else guidePanel.insertBefore(notedLine,guideDisclosure);if(!GUIDE.notedBorn){GUIDE.notedBorn=true;conversationBorn(notedLine,'sphere');}}guideLayout();};
var memoryConvSend=convSend;convSend=function(text,spoken){if(memoryActive()){HELD='';HELD_CAP='';memoryAnswer(null,text,null);return;}memoryConvSend(text,spoken);};
var memoryReturn=conversationReturn;conversationReturn=function(){if(memoryActive()){CONV_RETURN=null;go('PERSONAL_QUESTION');return;}memoryReturn();};
var memoryReset=conversationReset;conversationReset=function(){MEMORY_AUTO=null;MEMORY_SCENE=null;MEMORY_NOTES=[];MEMORY_SEND_EPOCH++;GUIDE_INPUT_CHECKIN=false;memoryPanel.style.display='none';memoryReset();};
var memoryChrome=conversationChrome;conversationChrome=function(){memoryChrome();
 var active=memoryActive(),n=ST.name,k=(SES&&SES.textScale||1)/Math.max(.5,fitS||1);ownWords.style.display=active&&n==='TYPING'?'block':'none';ownWords.textContent=guideWords().ownWords||'';ownWords.style.font=(13*(SES&&SES.textScale||1))+'px/'+(18*(SES&&SES.textScale||1))+'px var(--sans)';spokenOwnWords.style.display=active&&['LISTENING','HELD_DRAFT'].indexOf(n)>=0?'block':'none';spokenOwnWords.textContent=guideWords().ownWords||'';spokenOwnWords.style.top='625px';spokenOwnWords.style.font=13*k+'px/'+18*k+'px var(--sans)';
 att(el.dockQ,'aria-hidden',active?'true':'false');att(el.dockA,'aria-hidden',active?'true':'false');
 if(active){if(n==='PERSONAL_QUESTION')att(el.sphereA,'aria-label',tt('aria.idle'));if(n==='PERSONAL_SENDING')att(el.sphereA,'aria-label',tt('aria.preparing'));op(el.dockQ,0);op(el.dockA,0);A.dockO.set(0);A.dockAO.set(0);keyboardButton.setAttribute('aria-label',guideWords().typeAnswer||'');if(n==='PERSONAL_QUESTION')el.pill.setAttribute('aria-label',guideWords().speakAnswer||'');if(['PERSONAL_QUESTION','PERSONAL_SENDING'].indexOf(n)>=0){op(el.close,0);att(el.close,'aria-hidden','true');memoryLayout();}if(n==='PERSONAL_SENDING'){if(A.mode!=='stop')pillMode('stop');keyboardButton.style.display='none';el.pill.classList.remove('conversation-send');el.pill.setAttribute('aria-label',tt('aria.cancelQuestion'));}
  if(n==='TYPING'){var typeRadius=44/Math.max(.5,fitS||1);moveSphere(110+typeRadius,typeRadius);memoryPanel.style.display='block';memoryOptions.style.display=GUIDE_ANSWER_ERROR?'':'none';memoryExit.style.display='none';memoryPanel.style.top=(110+2*typeRadius+16)+'px';memoryScroll.style.height='auto';memoryQuestion.style.fontSize=22*k+'px';memoryQuestion.style.lineHeight=27*k+'px';memoryWhy.style.display=GUIDE_ANSWER_ERROR?'':'none';memoryQuestion.style.maxHeight='none';memoryScroll.style.maxHeight=Math.max(60,(parseFloat(el.typeBox.style.top)-fitY)/(fitS||1)-parseFloat(memoryPanel.style.top)-8)+'px';memoryScroll.style.overflowY='auto';}
  else {memoryOptions.style.display='';memoryExit.style.display='';memoryWhy.style.display='';memoryScroll.style.maxHeight='none';}
  if(n==='LISTENING'||n==='HELD_DRAFT'){
   var scale=Math.max(.5,fitS||1),radius=44/scale;moveSphere(110+radius,radius);
   memoryPanel.style.display='block';memoryPanel.style.top=(110+2*radius+16)+'px';memoryOptions.style.display=memoryExit.style.display=memoryWhy.style.display='none';memoryScroll.style.height='auto';memoryScroll.style.maxHeight='none';
   memoryQuestion.style.fontSize=22*k+'px';memoryQuestion.style.lineHeight=27*k+'px';
   var top=parseFloat(memoryPanel.style.top)+(memoryQuestion.offsetHeight||54*k)+16;
   draftPanel.style.top=top+'px';draftPhrase.style.maxHeight=Math.max(44/scale,Math.min(160*k,700-top-(spokenOwnWords.offsetHeight||72*k)-16))+'px';
   spokenOwnWords.style.top=(top+(draftPhrase.offsetHeight||32*k)+8)+'px';
  }
 }
 if(MEMORY_AUTO&&!SHEET&&n==='COMPANION'&&clk>=MEMORY_AUTO.at){var a=MEMORY_AUTO;MEMORY_AUTO=null;if(GUIDE===a.guide)memoryOpen(a.question,true);}
};
companionCheckIn=function(p){if(p&&p.question&&GUIDE&&ST.name==='COMPANION')MEMORY_AUTO={guide:GUIDE,question:p.question,at:clk+.12};};
var memorySuspend=conversationSuspend;conversationSuspend=function(){MEMORY_AUTO=null;memorySuspend();};

var memoryConvType=convType;convType=function(){if(memoryActive())GUIDE_INPUT_CHECKIN=true;memoryConvType();};

// The disclosure participates in the native keyboard frame; controls remain beside the field.
var memoryPlaceTypeBox=placeTypeBox;placeTypeBox=function(){
 if(memoryActive()&&ST.name==='TYPING'){
  ownWords.style.display='block';ownWords.textContent=guideWords().ownWords||'';
  var extra=(ownWords.offsetHeight||54)+8,base=parseFloat(el.ta.style.height)||22;
  TB.h=base+28+extra;el.taSend.style.bottom=(extra+3)+'px';fieldMic.style.bottom=(extra+5)+'px';
 }else {el.taSend.style.bottom='';fieldMic.style.bottom='';}
 memoryPlaceTypeBox();
};

var memoryDrivers=drivers;drivers=function(h){memoryDrivers(h);if(ST.name==='PERSONAL_SENDING'){U.nodesO.set(0);U.braid.set(0);U.swirl.set(0);U.energy.t=.35+.04*Math.sin(clk*3);}};
