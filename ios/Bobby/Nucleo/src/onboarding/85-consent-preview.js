/* SPEC4.7.6 review composition. Native supplies this flag only in DEBUG fixtures.
   Production actions and risk-layout bounds remain unchanged until Claude's review. */
var consentPreviewNotNow = null;
var consentPreviewEnterRisk = ENTER.RISK;
ENTER.RISK = function(a){
  if (!SESSION || !SESSION.consentPreview) return consentPreviewEnterRisk(a);
  stage.classList.add('consent-preview');
  $('sheet').style.display = 'none'; // Inactive old sheet must not duplicate the preview's exit in accessibility.
  W.riskOnly = true; W.agree = null; W.agreeBusy = false; W.agreeReady = false; W.micBreath = false;
  var scale = FIT || 1, type = Math.max(1, +(SESSION.textScale) || 1), target = 44 / scale;
  stage.style.setProperty('--preview-target', target + 'px');
  stage.style.setProperty('--preview-type', type);
  moveSphere(270, Math.max(44 / scale, 88));
  if (!consentPreviewNotNow){
    consentPreviewNotNow = document.createElement('button');
    consentPreviewNotNow.className = 'quiet-link'; consentPreviewNotNow.id = 'consent-preview-not-now';
    consentPreviewNotNow.textContent = Ls('risk.notNow');
    consentPreviewNotNow.setAttribute('aria-label', Ls('risk.notNow'));
    consentPreviewNotNow.addEventListener('click', noop);
    stage.appendChild(consentPreviewNotNow);
  }
  tb('agreeRing'); tb('pillIn', T - 1);
  setPill('agree', Ls('risk.hold'), pillFor(Ls('risk.hold'), 196));
  loadRisk().then(function(){
    if (W.state !== 'RISK') return;
    buildRisk(RISK_NOTICE.statements);
    var y = 404, tops = [], lh = 18 * type;
    for (var i=0; i<lineEls.length; i++){
      lineEls[i].style.fontSize = 19 * type + 'px'; lineEls[i].style.lineHeight = 22 * type + 'px';
      tops.push(y); sc(lineEls[i], 'top', f1(y) + 'px'); y += (lineEls[i].offsetHeight || 22 * type) + 4;
    }
    y += 8;
    rbodyEl.style.fontSize = 13 * type + 'px'; rbodyEl.style.lineHeight = lh + 'px';
    sc(rbodyEl, 'top', f1(y) + 'px');
    var height = Math.max(lh, Math.floor((638 - y) / lh) * lh);
    sc(rbodyEl, 'height', f1(height) + 'px'); rbodyEl.scrollTop = 0;
    RISK_LAYOUT = {top:404,tops:tops,body:y,bodyHeight:height,notice:642};
    sc(rmoreEl, 'top', f1(y + height + 1) + 'px');
    sc(noticeEl, 'top', '642px'); tb('lines', T - 2); tb('notice', T - 1);
    W.agreeReady = true;
  });
};

var consentPreviewRoute = route;
route = function(s){
  if (!s || !s.consentPreview) return consentPreviewRoute(s);
  enterBorn(); go('RISK', {only:true});
};
