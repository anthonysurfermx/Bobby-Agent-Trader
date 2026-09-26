/* =====================================================================
   8. UI strings (engine chrome). Read-derived copy lives in NucleoReadModel.
   tests/read-model.test.mjs extracts this table between the markers and
   lints it (no advice / outcome language, en and es keys identical).
   ===================================================================== */
var STR = /*STRINGS-BEGIN*/{
  en: {
    'greet.morning': 'Good morning.', 'greet.afternoon': 'Good afternoon.', 'greet.evening': 'Good evening.',
    'greet.sub.day': 'What are you weighing today?', 'greet.sub.night': 'What are you weighing tonight?',
    'greet.saved': '{symbol} is saved.',
    'hint.idle': 'Hold to ask · swipe the sphere', 'hint.idleType': 'Tap to type · swipe the sphere', 'hint.hold': 'Hold to ask',
    'hint.release': 'Release to send', 'hint.debating': 'Three agents debating', 'hint.debatingS': 'Three agents debating · {s} s',
    'hint.still': 'Still weighing · deep reads take up to a minute', 'hint.long': 'Taking longer than usual · tap to cancel',
    'hint.pull': 'Pull down for the full read ⌄', 'hint.swipe': 'Swipe the sphere',
    'hint.empty': 'I didn’t catch that · hold and try again', 'hint.micStopped': 'The mic stopped · hold to try again',
    'hint.micOff': 'Mic is off · tap to type',
    'perm.title': 'I only listen while you hold.', 'perm.body': 'iOS will ask for the microphone and speech recognition once.', 'perm.cta': 'Continue',
    'type.placeholder': 'Ask about a stock or a crypto…', 'type.send': 'Send question',
    'think.forming': 'Verdict forming',
    'chips.eyebrow': 'You might want to ask',
    'face.desk': 'Desk', 'face.isla': 'Isla', 'face.squad': 'Squad', 'face.theses': 'Saved theses',
    'face.isla.status': '{pieces} pieces · {seeds} seeds growing', 'face.isla.chip': 'Visit Isla',
    'face.squad.status': '{name} · Level {level} · {streak}-day streak', 'face.squad.statusNew': '{name} · Level {level}', 'face.squad.chip': 'Change companion',
    'face.theses.one': '1 saved', 'face.theses.many': '{n} saved', 'face.theses.chip': 'Open latest',
    'save.evolution': 'Level {n} · {name}', 'save.unlock': 'Unlocked · {name}',
    'save.stale': 'Account changed · this read was not saved', 'save.failed': 'Could not save this read',
    'isla.title': 'Your island', 'isla.pieces': 'Pieces', 'isla.seeds': 'Seeds growing', 'isla.ready': 'Ready to review', 'isla.cta': 'Visit Isla',
    'meta.asOf': 'as of {when}', 'chart.x': '{tf} · {provider} · {inst} · as of {when}',
    'aria.waking': 'Bobby is waking up', 'aria.idle': 'Bobby is idle', 'aria.listening': 'Bobby is listening', 'aria.sending': 'Sending your question',
    'aria.thinking': 'Three agents debating', 'aria.speaking': 'Bobby is speaking', 'aria.cards': 'Full read: debate and thesis cards',
    'aria.faces': 'Sphere faces', 'aria.noVerdict': 'No verdict was issued',
    'aria.pill': 'Ask Bobby, hold to talk', 'aria.pillType': 'Type a question', 'aria.pillCancel': 'Cancel the read', 'aria.pillStop': 'Stop the voice',
    'aria.close': 'Close read', 'aria.companion': 'Your companion, {name}', 'aria.faceDots': 'Sphere faces: {list}', 'aria.wm': 'Bobby',
    'aria.account': '{name}. Account and progress', 'aria.accountPlain': 'Account and progress'
  },
  es: {
    'greet.morning': 'Buenos días.', 'greet.afternoon': 'Buenas tardes.', 'greet.evening': 'Buenas noches.',
    'greet.sub.day': '¿Qué estás evaluando hoy?', 'greet.sub.night': '¿Qué estás evaluando esta noche?',
    'greet.saved': '{symbol} quedó guardada.',
    'hint.idle': 'Mantén para preguntar · desliza la esfera', 'hint.idleType': 'Toca para escribir · desliza la esfera', 'hint.hold': 'Mantén para preguntar',
    'hint.release': 'Suelta para enviar', 'hint.debating': 'Tres agentes debatiendo', 'hint.debatingS': 'Tres agentes debatiendo · {s} s',
    'hint.still': 'Sigue pensando · puede tardar hasta un minuto', 'hint.long': 'Tarda más de lo normal · toca para cancelar',
    'hint.pull': 'Desliza hacia abajo para verlo completo ⌄', 'hint.swipe': 'Desliza la esfera',
    'hint.empty': 'No te escuché · mantén y vuelve a intentar', 'hint.micStopped': 'El micrófono se detuvo · mantén para reintentar',
    'hint.micOff': 'Micrófono apagado · toca para escribir',
    'perm.title': 'Solo escucho mientras mantienes.', 'perm.body': 'iOS pedirá el micrófono y el reconocimiento de voz una vez.', 'perm.cta': 'Continuar',
    'type.placeholder': 'Pregunta por una acción o una cripto…', 'type.send': 'Enviar pregunta',
    'think.forming': 'Veredicto en formación',
    'chips.eyebrow': 'Quizá quieras preguntar',
    'face.desk': 'Escritorio', 'face.isla': 'Isla', 'face.squad': 'Escuadrón', 'face.theses': 'Tesis guardadas',
    'face.isla.status': '{pieces} piezas · {seeds} semillas creciendo', 'face.isla.chip': 'Visitar Isla',
    'face.squad.status': '{name} · Nivel {level} · racha de {streak} días', 'face.squad.statusNew': '{name} · Nivel {level}', 'face.squad.chip': 'Cambiar compañero',
    'face.theses.one': '1 guardada', 'face.theses.many': '{n} guardadas', 'face.theses.chip': 'Abrir la última',
    'save.evolution': 'Nivel {n} · {name}', 'save.unlock': 'Desbloqueado · {name}',
    'save.stale': 'Cambió la cuenta · esta lectura no se guardó', 'save.failed': 'No se pudo guardar esta lectura',
    'isla.title': 'Tu isla', 'isla.pieces': 'Piezas', 'isla.seeds': 'Semillas creciendo', 'isla.ready': 'Listas para revisar', 'isla.cta': 'Visitar Isla',
    'meta.asOf': 'al {when}', 'chart.x': '{tf} · {provider} · {inst} · al {when}',
    'aria.waking': 'Bobby está despertando', 'aria.idle': 'Bobby está en reposo', 'aria.listening': 'Bobby está escuchando', 'aria.sending': 'Enviando tu pregunta',
    'aria.thinking': 'Tres agentes debatiendo', 'aria.speaking': 'Bobby está hablando', 'aria.cards': 'Lectura completa: debate y tesis',
    'aria.faces': 'Caras de la esfera', 'aria.noVerdict': 'No se emitió veredicto',
    'aria.pill': 'Pregúntale a Bobby, mantén para hablar', 'aria.pillType': 'Escribe una pregunta', 'aria.pillCancel': 'Cancelar la lectura', 'aria.pillStop': 'Detener la voz',
    'aria.close': 'Cerrar lectura', 'aria.companion': 'Tu compañero, {name}', 'aria.faceDots': 'Caras de la esfera: {list}', 'aria.wm': 'Bobby',
    'aria.account': '{name}. Cuenta y progreso', 'aria.accountPlain': 'Cuenta y progreso'
  }
}/*STRINGS-END*/;
var LANG = 'en';
function tt(key, vars){
  var tbl = STR[LANG] || STR.en, s = tbl[key];
  if (s == null) s = STR.en[key];
  if (s == null) return key;
  return s.replace(/\{(\w+)\}/g, function(_, k){ return vars && vars[k] != null ? String(vars[k]) : ''; });
}
/* dates: local time, compact; the same day as `ref` shows the time only */
function whenLabel(iso, ref){
  var d = new Date(iso); if (isNaN(d.getTime())) return '';
  var r = new Date(fin(ref) ? ref : d.getTime()), loc = LANG === 'es' ? 'es-MX' : 'en-US';
  try {
    if (d.toDateString() === r.toDateString()) return d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
    return d.toLocaleDateString(loc, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' });
  } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
}
