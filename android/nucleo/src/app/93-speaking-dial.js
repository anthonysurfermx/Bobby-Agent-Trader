/* One preference, the existing orb, and no extra model request. */
var DIAL_VALUES = ['plain', 'terms', 'technical'];
var DIAL_WORDS = {
 es: ['¿Cómo quieres que te hable?', ['Sencillo','Con términos','Técnico'], ['Subió muy rápido en las últimas horas. Hay un techo cerca, donde antes dejó de subir.','Subió muy rápido (sobrecompra). Hay un techo cerca, donde antes dejó de subir (resistencia).','Sobrecomprado en 1H, bajo resistencia. Falta confirmación.'], 'Así está bien','Empezar ahora','¿Qué quieres entender hoy?', ['Más sencillo','Así está bien','Más técnico']],
 en: ['How should I talk to you?', ['Plain','With terms','Technical'], ['It rose fast in the last hours. There is a ceiling nearby, where it stopped rising before.','It rose fast (overbought). There is a ceiling nearby, where it stopped rising before (resistance).','Overbought on 1H, under resistance. No confirmation yet.'], 'That works','Start now','What do you want to understand today?', ['Simpler','That works','More technical']],
 fr: ['Comment veux-tu que je te parle ?', ['Simple','Avec les termes','Technique'], ['Le prix a vite monté. Un plafond proche a déjà freiné sa hausse.','Le prix a vite monté (surachat). Un plafond est proche (résistance).','Surachat en 1H, sous résistance. Confirmation manquante.'], 'Ça me va','Commencer','Que veux-tu comprendre aujourd’hui ?', ['Plus simple','Ça me va','Plus technique']],
 pt: ['Como queres que fale contigo?', ['Simples','Com termos','Técnico'], ['Subiu depressa. Está perto de um teto onde já deixou de subir.','Subiu depressa (sobrecompra). Está perto de um teto (resistência).','Sobrecomprado em 1H, sob resistência. Falta confirmação.'], 'Está bem assim','Começar agora','O que queres entender hoje?', ['Mais simples','Está bem assim','Mais técnico']],
 it: ['Come vuoi che ti parli?', ['Semplice','Con termini','Tecnico'], ['È salito rapidamente. Un tetto vicino ha già fermato la salita.','È salito rapidamente (ipercomprato). C’è un tetto vicino (resistenza).','Ipercomprato su 1H, sotto resistenza. Manca conferma.'], 'Va bene così','Inizia ora','Cosa vuoi capire oggi?', ['Più semplice','Va bene così','Più tecnico']],
 de: ['Wie soll ich mit dir sprechen?', ['Einfach','Mit Begriffen','Technisch'], ['Der Kurs stieg schnell. Eine nahe Grenze stoppte ihn schon einmal.','Der Kurs stieg schnell (überkauft). Eine Grenze ist nah (Widerstand).','Überkauft auf 1H, unter Widerstand. Bestätigung fehlt.'], 'So passt es','Jetzt starten','Was möchtest du heute verstehen?', ['Einfacher','So passt es','Technischer']]
};
var dial = D.getElementById('speakingDial'), dialIndex = 0, dialBusy = false, dialOwner = null, dialGreeting = false;
function dialWords(){ return DIAL_WORDS[LANG] || DIAL_WORDS.en; }
function dialPaint(index){
 dialIndex = clamp(Math.round(index), 0, 2); var w = dialWords();
 D.getElementById('speakingQuestion').textContent = w[0];
 var range = D.getElementById('speakingRange'); range.value = dialIndex; range.setAttribute('aria-label', w[0]); range.setAttribute('aria-valuetext', w[1][dialIndex]);
 D.getElementById('speakingSample').textContent = w[2][dialIndex];
 D.getElementById('speakingConfirm').textContent = w[3]; D.getElementById('speakingSkip').textContent = w[4];
 Array.prototype.forEach.call(dial.querySelectorAll('[data-dial]'), function(b, i){ b.textContent = w[1][i]; b.setAttribute('aria-pressed', String(i === dialIndex)); });
 var thumb = D.getElementById('speakingThumb'); thumb.setAttribute('cx', [8,148,288][dialIndex]); thumb.setAttribute('cy', [8,54,8][dialIndex]);
 var mode = RM ? 'set' : 'to'; U.energy[mode]([.25,.45,.7][dialIndex]); U.swirl[mode]([0,.15,.35][dialIndex]); U.wflow[mode]([.12,.22,.35][dialIndex]); dirty = true;
}
function dialSave(index, feedback){
 if (dialBusy || !SES || !SES.speaking) return; dialBusy = true;
 var owner = feedback ? SES.speaking.owner : dialOwner, gen = OWNER_GEN;
 bcall('speaking.choose', { value: DIAL_VALUES[index], owner: owner, feedback: !!feedback }).then(function(s){
  if (gen !== OWNER_GEN) return;
  applySession(s, false); dialBusy = false;
  if (ST.name === 'SPEAKING_DIAL'){ dialGreeting = true; stage.classList.add('speaking-greet'); go('RETURNING'); }
  dialRefine();
 }, function(){ dialBusy = false; if (gen === OWNER_GEN) D.getElementById('speakingError').textContent = LANG === 'es' ? 'Inténtalo de nuevo' : 'Try again'; });
}
STATES.SPEAKING_DIAL = {
 enter: function(){
  dialOwner = SES.speaking.owner; dialBusy = false; chipsHide(); greetOut(); meriOut(); hint('');
  stage.classList.add('speaking-on'); dial.classList.add('on'); dial.setAttribute('aria-hidden','false'); D.getElementById('speakingRange').focus();
  S.cy[RM ? 'set' : 'to'](302); S.r[RM ? 'set' : 'to'](112); U.faceOn.to(0); U.presence.to(0); tintHome();
  D.getElementById('speakingError').textContent = ''; dialPaint(Math.max(0, DIAL_VALUES.indexOf(SES.speaking.value)));
  bcall('speak', { id: 'speaking-dial', text: dialWords()[0] }).catch(noop);
 },
 exit: function(){ dial.classList.remove('on'); dial.setAttribute('aria-hidden','true'); stage.classList.remove('speaking-on'); bcall('stopSpeaking').catch(noop); tintHome(); U.energy.to(.35); U.swirl.to(0); U.wflow.to(.18); },
 down: function(){ return null; },
 on: function(name, p){ if (name === 'app.state' && p && p.state === 'background') bcall('stopSpeaking').catch(noop); }
};
['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','click'].forEach(function(k){ dial.addEventListener(k, function(e){ e.stopPropagation(); }); });
D.getElementById('speakingRange').addEventListener('input', function(e){ if (!dialBusy) dialPaint(+e.target.value); });
Array.prototype.forEach.call(dial.querySelectorAll('[data-dial]'), function(b){ b.addEventListener('click', function(){ if (!dialBusy) dialPaint(+b.getAttribute('data-dial')); }); });
D.getElementById('speakingConfirm').addEventListener('click', function(){ dialSave(dialIndex, false); });
D.getElementById('speakingSkip').addEventListener('click', function(){ dialSave(0, false); });
var refineVisible = null, refineLanguage = null;
function dialRefine(){
 var row = D.getElementById('speakingRefine'), show = !!(SES && SES.speaking && SES.speaking.refine && ST.name === 'HANDBACK');
 if (show === refineVisible && LANG === refineLanguage) return;
 refineVisible = show; refineLanguage = LANG;
 row.classList.toggle('on', show); row.setAttribute('aria-hidden', String(!show));
 if (show) Array.prototype.forEach.call(row.querySelectorAll('button'), function(b,i){ b.textContent = dialWords()[6][i]; });
}
var refineRow = D.getElementById('speakingRefine');
['pointerdown','pointermove','pointerup','touchstart','touchmove','touchend','click'].forEach(function(k){ refineRow.addEventListener(k, function(e){ e.stopPropagation(); }); });
Array.prototype.forEach.call(refineRow.querySelectorAll('button'), function(b){ b.addEventListener('click', function(){ var n = Math.max(0, DIAL_VALUES.indexOf(SES.speaking.value)); dialSave(clamp(n + +b.getAttribute('data-refine'),0,2),true); }); });
