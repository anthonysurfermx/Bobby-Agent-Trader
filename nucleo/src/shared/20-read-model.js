/* Núcleo read model (ARCHITECTURE.md §3.4): ask() reply -> what the engines show.
 * Pure functions, no DOM, no clock: the same input always yields the same model,
 * so hero frames stay deterministic and node can test it (tests/read-model.test.mjs).
 *
 * The only rule that matters here: every value shown comes from the reply.
 * When a field is missing, the element is dropped or degraded, never filled.
 */
(function (root) {
  'use strict';

  var S = {
    en: {
      'verdict.wait': 'Wait', 'verdict.review': 'Review',
      'ring.conviction': 'CONVICTION',
      'agent.alpha': 'ALPHA HUNTER', 'agent.red': 'RED TEAM', 'agent.cio': 'CIO',
      'role.syn': 'The summary in one line', 'role.alpha': 'Looks for the evidence in favor',
      'role.red': 'Questions the thesis, looks for what breaks it', 'role.cio': 'Weighs both sides and states the limits',
      'sat.rsi': 'RSI 14', 'sat.hot': 'hot', 'sat.cold': 'cold',
      'sat.volume': 'Volume', 'sat.vsAvg': 'vs 20h avg',
      'sat.trend': 'Trend', 'sat.ema': 'EMA 20 / 50',
      'sat.range': 'Range', 'sat.range30': '30h low–high',
      'trend.up': 'Up', 'trend.down': 'Down', 'trend.sideways': 'Sideways',
      'chart.support': 'SUPPORT {price}', 'chart.resistance': 'RESISTANCE {price}',
      'chart.entry': 'ENTRY {price}', 'chart.stop': 'STOP {price}', 'chart.target': 'TARGET {price}',
      'chart.aboveSupport': 'above support', 'chart.belowSupport': 'below support',
      'spoken.close.wait': 'My call: wait.', 'spoken.close.review': 'My call: review.',
      'thesis.header': 'THESIS · {symbol}', 'thesis.title.wait': 'Wait on {symbol}.', 'thesis.title.review': 'Review {symbol}.',
      'row.price': 'PRICE AT READ', 'row.support': 'SUPPORT', 'row.resistance': 'RESISTANCE',
      'row.entry': 'REFERENCE ENTRY', 'row.stop': 'STOP', 'row.target': 'TARGET', 'row.trend': 'TREND · RSI',
      'thesis.line.wait': 'No trade planned. Saving records your decision.',
      'thesis.line.review': 'Review window: {hours}h.',
      'thesis.save': 'Save thesis', 'thesis.saved': 'Saved', 'thesis.savedLocal': 'Saved on this device',
      'xp.points': '+{points} discipline XP', 'xp.pointsWait': '+{points} discipline XP for waiting',
      'xp.capped': 'Saved · daily XP limit reached',
      'debate.title': '{n} agents · {s} s', 'debate.header': 'THE DEBATE',
      'meta': 'Educational read · not financial advice',
      'confirm.prompt': 'Did you mean {name} ({symbol})?', 'confirm.yes': 'Yes, {symbol}', 'confirm.no': 'Something else',
      'err.unknown': 'I couldn’t find an asset in that. Try the name or the ticker.',
      'err.unsupported': 'Bobby can’t read {name} yet. Try a stock or a crypto.',
      'err.unsupportedStale': 'The market data for {symbol} is too old to read right now.',
      'err.quota': 'Bobby reached today’s analysis limit. Try again tomorrow.',
      'err.tooLong': 'Your question is too long. Keep it to 1,200 characters or fewer.',
      'err.network': 'No connection. Nothing was analyzed.',
      'err.timeout': 'The desk took too long. No verdict was issued.',
      'err.bad': 'The analysis did not come back. No verdict was issued.',
      'err.risk': 'First, the risk notice.', 'err.riskSub': 'Bobby reads nothing until you agree to it. Your question was not sent.',
      'err.riskCta': 'Open the risk notice',
      'follow.another': 'Another question about {symbol}', 'follow.how': 'How is {symbol} looking?', 'follow.why': 'Why is {symbol} moving today?',
      'aria.verdict': 'Verdict: {word}', 'aria.conviction': ', {pct}% conviction'
    },
    es: {
      'verdict.wait': 'Espera', 'verdict.review': 'Revisa',
      'ring.conviction': 'CONVICCIÓN',
      'agent.alpha': 'ALPHA HUNTER', 'agent.red': 'RED TEAM', 'agent.cio': 'CIO',
      'role.syn': 'El resumen en una línea', 'role.alpha': 'Busca la evidencia a favor',
      'role.red': 'Cuestiona la tesis y busca qué la rompe', 'role.cio': 'Sopesa ambos lados y marca los límites',
      'sat.rsi': 'RSI 14', 'sat.hot': 'caliente', 'sat.cold': 'frío',
      'sat.volume': 'Volumen', 'sat.vsAvg': 'vs prom. 20h',
      'sat.trend': 'Tendencia', 'sat.ema': 'EMA 20 / 50',
      'sat.range': 'Rango', 'sat.range30': 'mín–máx 30h',
      'trend.up': 'Alcista', 'trend.down': 'Bajista', 'trend.sideways': 'Lateral',
      'chart.support': 'SOPORTE {price}', 'chart.resistance': 'RESISTENCIA {price}',
      'chart.entry': 'ENTRADA {price}', 'chart.stop': 'STOP {price}', 'chart.target': 'OBJETIVO {price}',
      'chart.aboveSupport': 'sobre el soporte', 'chart.belowSupport': 'bajo el soporte',
      'spoken.close.wait': 'Mi lectura: esperar.', 'spoken.close.review': 'Mi lectura: revisar.',
      'thesis.header': 'TESIS · {symbol}', 'thesis.title.wait': 'Esperar con {symbol}.', 'thesis.title.review': 'Revisar {symbol}.',
      'row.price': 'PRECIO AL LEER', 'row.support': 'SOPORTE', 'row.resistance': 'RESISTENCIA',
      'row.entry': 'ENTRADA DE REFERENCIA', 'row.stop': 'STOP', 'row.target': 'OBJETIVO', 'row.trend': 'TENDENCIA · RSI',
      'thesis.line.wait': 'Sin operación planeada. Guardar registra tu decisión.',
      'thesis.line.review': 'Ventana de revisión: {hours} h.',
      'thesis.save': 'Guardar tesis', 'thesis.saved': 'Guardada', 'thesis.savedLocal': 'Guardada en este dispositivo',
      'xp.points': '+{points} XP de disciplina', 'xp.pointsWait': '+{points} XP de disciplina por esperar',
      'xp.capped': 'Guardada · límite diario de XP alcanzado',
      'debate.title': '{n} agentes · {s} s', 'debate.header': 'EL DEBATE',
      'meta': 'Lectura educativa · no es asesoría financiera',
      'confirm.prompt': '¿Te refieres a {name} ({symbol})?', 'confirm.yes': 'Sí, {symbol}', 'confirm.no': 'Otro activo',
      'err.unknown': 'No encontré un activo en eso. Prueba con el nombre o el ticker.',
      'err.unsupported': 'Bobby aún no puede leer {name}. Prueba una acción o una cripto.',
      'err.unsupportedStale': 'Los datos de {symbol} son demasiado viejos para leerlos ahora.',
      'err.quota': 'Bobby llegó al límite de análisis de hoy. Vuelve a intentarlo mañana.',
      'err.tooLong': 'Tu pregunta es demasiado larga. Usa 1,200 caracteres o menos.',
      'err.network': 'Sin conexión. No se analizó nada.',
      'err.timeout': 'La mesa tardó demasiado. No se emitió ningún veredicto.',
      'err.bad': 'El análisis no regresó. No se emitió ningún veredicto.',
      'err.risk': 'Primero, el aviso de riesgo.', 'err.riskSub': 'Bobby no analiza nada hasta que lo aceptes. Tu pregunta no se envió.',
      'err.riskCta': 'Abrir el aviso de riesgo',
      'follow.another': 'Otra pregunta sobre {symbol}', 'follow.how': '¿Cómo se ve {symbol}?', 'follow.why': '¿Por qué se mueve {symbol} hoy?',
      'aria.verdict': 'Veredicto: {word}', 'aria.conviction': ', {pct}% de convicción'
    }
  ,
  fr: {
    "verdict.wait": "Attendre",
    "verdict.review": "Réexaminer",
    "ring.conviction": "CONVICTION",
    "agent.alpha": "ALPHA HUNTER",
    "agent.red": "RED TEAM",
    "agent.cio": "CIO",
    "role.syn": "Le résumé en une ligne",
    "role.alpha": "Cherche les éléments favorables",
    "role.red": "Questionne la thèse et cherche ses failles",
    "role.cio": "Pèse les deux côtés et précise les limites",
    "sat.rsi": "RSI 14",
    "sat.hot": "surachat",
    "sat.cold": "survente",
    "sat.volume": "Volume",
    "sat.vsAvg": "vs moy. 20 h",
    "sat.trend": "Tendance",
    "sat.ema": "EMA 20 / 50",
    "sat.range": "Fourchette",
    "sat.range30": "min–max 30 h",
    "trend.up": "Haussière",
    "trend.down": "Baissière",
    "trend.sideways": "Latérale",
    "chart.support": "SUPPORT {price}",
    "chart.resistance": "RÉSISTANCE {price}",
    "chart.entry": "ENTRÉE {price}",
    "chart.stop": "SEUIL D’ARRÊT {price}",
    "chart.target": "OBJECTIF {price}",
    "chart.aboveSupport": "au-dessus du support",
    "chart.belowSupport": "sous le support",
    "spoken.close.wait": "Ma conclusion : attendre.",
    "spoken.close.review": "Ma conclusion : réexaminer.",
    "thesis.header": "THÈSE · {symbol}",
    "thesis.title.wait": "Attendre sur {symbol}.",
    "thesis.title.review": "Réexaminer {symbol}.",
    "row.price": "PRIX À L’ANALYSE",
    "row.support": "SUPPORT",
    "row.resistance": "RÉSISTANCE",
    "row.entry": "ENTRÉE DE RÉFÉRENCE",
    "row.stop": "SEUIL D’ARRÊT",
    "row.target": "OBJECTIF",
    "row.trend": "TENDANCE · RSI",
    "thesis.line.wait": "Aucune opération prévue. Enregistrer consigne ta décision.",
    "thesis.line.review": "Délai de réexamen : {hours} h.",
    "thesis.save": "Enregistrer la thèse",
    "thesis.saved": "Enregistrée",
    "thesis.savedLocal": "Enregistrée sur cet appareil",
    "xp.points": "+{points} XP de discipline",
    "xp.pointsWait": "+{points} XP de discipline pour avoir attendu",
    "xp.capped": "Enregistrée · limite quotidienne d’XP atteinte",
    "debate.title": "{n} agents · {s} s",
    "debate.header": "LE DÉBAT",
    "meta": "Analyse éducative · aucun conseil financier",
    "confirm.prompt": "Tu veux dire {name} ({symbol}) ?",
    "confirm.yes": "Oui, {symbol}",
    "confirm.no": "Un autre actif",
    "err.unknown": "Je n’ai pas trouvé d’actif. Essaie son nom ou son symbole.",
    "err.unsupported": "Bobby ne peut pas encore analyser {name}. Essaie une action ou une crypto.",
    "err.unsupportedStale": "Les données de {symbol} sont trop anciennes pour une analyse.",
    "err.quota": "Bobby a atteint la limite d’analyses du jour. Réessaie demain.",
    "err.tooLong": "Ta question est trop longue. Utilise au maximum 1 200 caractères.",
    "err.network": "Aucune connexion. Rien n’a été analysé.",
    "err.timeout": "L’analyse a pris trop de temps. Aucune conclusion n’a été rendue.",
    "err.bad": "L’analyse n’a pas abouti. Aucune conclusion n’a été rendue.",
    "err.risk": "D’abord, l’avertissement sur les risques.",
    "err.riskSub": "Bobby ne lance aucune analyse avant ton accord. Ta question n’a pas été envoyée.",
    "err.riskCta": "Ouvrir l’avertissement sur les risques",
    "follow.another": "Une autre question sur {symbol}",
    "follow.how": "Que penser de {symbol} ?",
    "follow.why": "Pourquoi {symbol} bouge aujourd’hui ?",
    "aria.verdict": "Conclusion : {word}",
    "aria.conviction": ", conviction de {pct} %"
  },
  pt: {
    "verdict.wait": "Esperar",
    "verdict.review": "Rever",
    "ring.conviction": "CONVICÇÃO",
    "agent.alpha": "ALPHA HUNTER",
    "agent.red": "RED TEAM",
    "agent.cio": "CIO",
    "role.syn": "O resumo numa linha",
    "role.alpha": "Procura a evidência a favor",
    "role.red": "Questiona a tese e procura o que a invalida",
    "role.cio": "Pondera os dois lados e indica os limites",
    "sat.rsi": "RSI 14",
    "sat.hot": "sobrecompra",
    "sat.cold": "sobrevenda",
    "sat.volume": "Volume",
    "sat.vsAvg": "vs média 20 h",
    "sat.trend": "Tendência",
    "sat.ema": "EMA 20 / 50",
    "sat.range": "Intervalo",
    "sat.range30": "mín–máx 30 h",
    "trend.up": "Em alta",
    "trend.down": "Em baixa",
    "trend.sideways": "Lateral",
    "chart.support": "SUPORTE {price}",
    "chart.resistance": "RESISTÊNCIA {price}",
    "chart.entry": "ENTRADA {price}",
    "chart.stop": "LIMITE DE SAÍDA {price}",
    "chart.target": "OBJETIVO {price}",
    "chart.aboveSupport": "acima do suporte",
    "chart.belowSupport": "abaixo do suporte",
    "spoken.close.wait": "A minha conclusão: esperar.",
    "spoken.close.review": "A minha conclusão: rever.",
    "thesis.header": "TESE · {symbol}",
    "thesis.title.wait": "Esperar com {symbol}.",
    "thesis.title.review": "Rever {symbol}.",
    "row.price": "PREÇO NA ANÁLISE",
    "row.support": "SUPORTE",
    "row.resistance": "RESISTÊNCIA",
    "row.entry": "ENTRADA DE REFERÊNCIA",
    "row.stop": "LIMITE DE SAÍDA",
    "row.target": "OBJETIVO",
    "row.trend": "TENDÊNCIA · RSI",
    "thesis.line.wait": "Sem operação planeada. Guardar regista a tua decisão.",
    "thesis.line.review": "Prazo de revisão: {hours} h.",
    "thesis.save": "Guardar tese",
    "thesis.saved": "Guardada",
    "thesis.savedLocal": "Guardada neste dispositivo",
    "xp.points": "+{points} XP de disciplina",
    "xp.pointsWait": "+{points} XP de disciplina por esperar",
    "xp.capped": "Guardada · limite diário de XP atingido",
    "debate.title": "{n} agentes · {s} s",
    "debate.header": "O DEBATE",
    "meta": "Análise educativa · não é aconselhamento financeiro",
    "confirm.prompt": "Referes-te a {name} ({symbol})?",
    "confirm.yes": "Sim, {symbol}",
    "confirm.no": "Outro ativo",
    "err.unknown": "Não encontrei um ativo. Experimenta o nome ou o símbolo.",
    "err.unsupported": "O Bobby ainda não consegue analisar {name}. Experimenta uma ação ou cripto.",
    "err.unsupportedStale": "Os dados de {symbol} são demasiado antigos para analisar agora.",
    "err.quota": "O Bobby atingiu o limite de análises de hoje. Tenta novamente amanhã.",
    "err.tooLong": "A tua pergunta é demasiado longa. Usa até 1 200 caracteres.",
    "err.network": "Sem ligação. Nada foi analisado.",
    "err.timeout": "A análise demorou demasiado. Não foi emitida uma conclusão.",
    "err.bad": "A análise não foi concluída. Não foi emitida uma conclusão.",
    "err.risk": "Primeiro, o aviso de risco.",
    "err.riskSub": "O Bobby só analisa depois de aceitares o aviso. A tua pergunta não foi enviada.",
    "err.riskCta": "Abrir o aviso de risco",
    "follow.another": "Outra pergunta sobre {symbol}",
    "follow.how": "Como está {symbol}?",
    "follow.why": "Porque está {symbol} a mover-se hoje?",
    "aria.verdict": "Conclusão: {word}",
    "aria.conviction": ", {pct}% de convicção"
  }
,
  it: {
    "verdict.wait": "Aspetta",
    "verdict.review": "Riesamina",
    "ring.conviction": "CONVINZIONE",
    "agent.alpha": "ALPHA HUNTER",
    "agent.red": "RED TEAM",
    "agent.cio": "CIO",
    "role.syn": "Il riassunto in una riga",
    "role.alpha": "Cerca gli elementi a favore",
    "role.red": "Contesta la tesi e cerca ciò che la invalida",
    "role.cio": "Soppesa i due lati e indica i limiti",
    "sat.rsi": "RSI 14",
    "sat.hot": "ipercomprato",
    "sat.cold": "ipervenduto",
    "sat.volume": "Volume",
    "sat.vsAvg": "vs media 20 h",
    "sat.trend": "Tendenza",
    "sat.ema": "EMA 20 / 50",
    "sat.range": "Intervallo",
    "sat.range30": "min–max 30 h",
    "trend.up": "Rialzista",
    "trend.down": "Ribassista",
    "trend.sideways": "Laterale",
    "chart.support": "SUPPORTO {price}",
    "chart.resistance": "RESISTENZA {price}",
    "chart.entry": "ENTRATA {price}",
    "chart.stop": "SOGLIA DI USCITA {price}",
    "chart.target": "OBIETTIVO {price}",
    "chart.aboveSupport": "sopra il supporto",
    "chart.belowSupport": "sotto il supporto",
    "spoken.close.wait": "La mia conclusione: aspettare.",
    "spoken.close.review": "La mia conclusione: riesaminare.",
    "thesis.header": "TESI · {symbol}",
    "thesis.title.wait": "Aspettare su {symbol}.",
    "thesis.title.review": "Riesaminare {symbol}.",
    "row.price": "PREZZO ALL’ANALISI",
    "row.support": "SUPPORTO",
    "row.resistance": "RESISTENZA",
    "row.entry": "ENTRATA DI RIFERIMENTO",
    "row.stop": "SOGLIA DI USCITA",
    "row.target": "OBIETTIVO",
    "row.trend": "TENDENZA · RSI",
    "thesis.line.wait": "Nessuna operazione prevista. Salvare registra la tua decisione.",
    "thesis.line.review": "Periodo di riesame: {hours} h.",
    "thesis.save": "Salva tesi",
    "thesis.saved": "Salvata",
    "thesis.savedLocal": "Salvata su questo dispositivo",
    "xp.points": "+{points} XP di disciplina",
    "xp.pointsWait": "+{points} XP di disciplina per l’attesa",
    "xp.capped": "Salvata · limite giornaliero di XP raggiunto",
    "debate.title": "{n} agenti · {s} s",
    "debate.header": "IL DIBATTITO",
    "meta": "Analisi educativa · non è consulenza finanziaria",
    "confirm.prompt": "Intendevi {name} ({symbol})?",
    "confirm.yes": "Sì, {symbol}",
    "confirm.no": "Un altro asset",
    "err.unknown": "Non ho trovato un asset. Prova il nome o il simbolo.",
    "err.unsupported": "Bobby non può ancora analizzare {name}. Prova un’azione o una cripto.",
    "err.unsupportedStale": "I dati di {symbol} sono troppo vecchi per un’analisi.",
    "err.quota": "Bobby ha raggiunto il limite di analisi di oggi. Riprova domani.",
    "err.tooLong": "La domanda è troppo lunga. Usa al massimo 1.200 caratteri.",
    "err.network": "Nessuna connessione. Non è stato analizzato nulla.",
    "err.timeout": "L’analisi ha impiegato troppo tempo. Nessuna conclusione è stata formulata.",
    "err.bad": "L’analisi non è arrivata. Nessuna conclusione è stata formulata.",
    "err.risk": "Prima, l’avvertenza sui rischi.",
    "err.riskSub": "Bobby non analizza nulla prima del tuo consenso. La domanda non è stata inviata.",
    "err.riskCta": "Apri l’avvertenza sui rischi",
    "follow.another": "Un’altra domanda su {symbol}",
    "follow.how": "Come sta andando {symbol}?",
    "follow.why": "Perché {symbol} si muove oggi?",
    "aria.verdict": "Conclusione: {word}",
    "aria.conviction": ", {pct}% di convinzione"
  },
  de: {
    "verdict.wait": "Abwarten",
    "verdict.review": "Prüfen",
    "ring.conviction": "ÜBERZEUGUNG",
    "agent.alpha": "ALPHA HUNTER",
    "agent.red": "RED TEAM",
    "agent.cio": "CIO",
    "role.syn": "Die Zusammenfassung in einer Zeile",
    "role.alpha": "Sucht die Belege, die dafür sprechen",
    "role.red": "Prüft die These auf Schwachstellen",
    "role.cio": "Wägt beide Seiten ab, nennt die Grenzen",
    "sat.rsi": "RSI 14",
    "sat.hot": "überkauft",
    "sat.cold": "überverkauft",
    "sat.volume": "Volumen",
    "sat.vsAvg": "ggü. 20-h-Mittel",
    "sat.trend": "Trend",
    "sat.ema": "EMA 20 / 50",
    "sat.range": "Spanne",
    "sat.range30": "30 h Tief–Hoch",
    "trend.up": "Steigend",
    "trend.down": "Fallend",
    "trend.sideways": "Seitwärts",
    "chart.support": "UNTERSTÜTZUNG {price}",
    "chart.resistance": "WIDERSTAND {price}",
    "chart.entry": "EINSTIEG {price}",
    "chart.stop": "AUSSTIEGSGRENZE {price}",
    "chart.target": "ZIEL {price}",
    "chart.aboveSupport": "über der Unterstützung",
    "chart.belowSupport": "unter der Unterstützung",
    "spoken.close.wait": "Mein Fazit: abwarten.",
    "spoken.close.review": "Mein Fazit: prüfen.",
    "thesis.header": "THESE · {symbol}",
    "thesis.title.wait": "Bei {symbol} abwarten.",
    "thesis.title.review": "{symbol} prüfen.",
    "row.price": "PREIS BEI DER ANALYSE",
    "row.support": "UNTERSTÜTZUNG",
    "row.resistance": "WIDERSTAND",
    "row.entry": "REFERENZEINSTIEG",
    "row.stop": "AUSSTIEGSGRENZE",
    "row.target": "ZIEL",
    "row.trend": "TREND · RSI",
    "thesis.line.wait": "Kein Handel geplant. Speichern hält deine Entscheidung fest.",
    "thesis.line.review": "Prüfzeitraum: {hours} h.",
    "thesis.save": "These speichern",
    "thesis.saved": "Gespeichert",
    "thesis.savedLocal": "Auf diesem Gerät gespeichert",
    "xp.points": "+{points} Disziplin-XP",
    "xp.pointsWait": "+{points} Disziplin-XP fürs Abwarten",
    "xp.capped": "Gespeichert · tägliche XP-Grenze erreicht",
    "debate.title": "{n} Agenten · {s} s",
    "debate.header": "DIE DEBATTE",
    "meta": "Analyse zu Lernzwecken · keine Finanzberatung",
    "confirm.prompt": "Meinst du {name} ({symbol})?",
    "confirm.yes": "Ja, {symbol}",
    "confirm.no": "Ein anderer Vermögenswert",
    "err.unknown": "Ich habe keinen Vermögenswert gefunden. Versuche den Namen oder das Symbol.",
    "err.unsupported": "Bobby kann {name} noch nicht analysieren. Versuche eine Aktie oder Kryptowährung.",
    "err.unsupportedStale": "Die Daten zu {symbol} sind für eine Analyse zu alt.",
    "err.quota": "Bobby hat das heutige Analyselimit erreicht. Versuche es morgen erneut.",
    "err.tooLong": "Deine Frage ist zu lang. Verwende höchstens 1.200 Zeichen.",
    "err.network": "Keine Verbindung. Es wurde nichts analysiert.",
    "err.timeout": "Die Analyse dauerte zu lange. Es wurde kein Fazit erstellt.",
    "err.bad": "Die Analyse ist nicht eingetroffen. Es wurde kein Fazit erstellt.",
    "err.risk": "Zuerst der Risikohinweis.",
    "err.riskSub": "Bobby analysiert erst nach deiner Zustimmung. Deine Frage wurde nicht gesendet.",
    "err.riskCta": "Risikohinweis öffnen",
    "follow.another": "Eine weitere Frage zu {symbol}",
    "follow.how": "Wie steht es um {symbol}?",
    "follow.why": "Warum bewegt sich {symbol} heute?",
    "aria.verdict": "Fazit: {word}",
    "aria.conviction": ", {pct}% Überzeugung"
  }
};

  var HUES = {
    alpha: '#3FE0B5', red: '#FF5A5F', cio: '#F6B94E'
  };
  var VERDICT = {
    wait: { hue: 'cio', color: HUES.cio, core: '#2A1C08', amb: '#19140D' },
    review: { hue: 'alpha', color: HUES.alpha, core: '#082A20', amb: '#0F1714' }
  };

  function lang2(l) { var code = String(l || '').replace(/_/g, '-').toLowerCase().split('-')[0]; return S[code] ? code : 'en'; }
  function localeFor(l, preferred) {
    if (root.NucleoLocale) return root.NucleoLocale.locale(l, preferred);
    // Preserve the standalone read-model API when the shared locale helper is absent.
    var code = lang2(l), tag = String(preferred || l || '').replace(/_/g, '-').toLowerCase();
    var supported = ['en-US','en-GB','en-AU','en-CA','en-IE','es-MX','es-ES','es-US','fr-FR','pt-PT','pt-BR','it-IT','de-DE'];
    for (var i = 0; i < supported.length; i++) {
      if (supported[i].toLowerCase() === tag && supported[i].split('-')[0] === code) return supported[i];
    }
    return { en:'en-US', es:'es-MX', fr:'fr-FR', pt:'pt-PT', it:'it-IT', de:'de-DE' }[code];
  }
  function t(lang, key, vars) {
    var s = S[lang2(lang)][key];
    if (s == null) s = S.en[key];
    if (s == null) return key;
    return s.replace(/\{(\w+)\}/g, function (_, k) { return vars && vars[k] != null ? String(vars[k]) : ''; });
  }
  function fin(v) { return typeof v === 'number' && isFinite(v); }

  /** BobbyAPI.money: >=1000 no decimals with grouping, >=1 two decimals, else four. */
  function money(v, lang, currency, locale) {
    if (!fin(v)) return null;
    var a = Math.abs(v), sign = v < 0 ? '−' : '';
    currency = currency === undefined ? 'USD' : currency;
    var decimals = a >= 1000 ? 0 : a >= 1 ? 2 : 4;
    var digits = a.toLocaleString(localeFor(lang, locale), { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
    if (currency !== 'USD') return sign + digits + (currency ? ' ' + currency : '');
    if (['fr', 'pt', 'it', 'de'].indexOf(lang2(lang)) >= 0) return sign + digits + ' USD';
    return sign + '$' + digits;
  }
  function currencyOf(r) {
    var a = r.asset || r, m = r.market || {}, p = r.provenance || {};
    var currency = a.currency || m.currency || p.currency || r.currency;
    if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) return currency;
    if (!a.isEquity) return 'USD';
    var symbol = String(a.symbol || '');
    if (/\.(PA|LS|MI|DE)$/.test(symbol)) return 'EUR';
    if (/\.SA$/.test(symbol)) return 'BRL';
    return symbol.indexOf('.') < 0 ? 'USD' : null;
  }
  function signedPct(v, lang, locale) {
    if (!fin(v)) return null;
    return (v > 0 ? '▲' : v < 0 ? '▼' : '') + Math.abs(v).toLocaleString(localeFor(lang, locale), { minimumFractionDigits:2, maximumFractionDigits:2 }) + '%';
  }
  function delta(v, lang, locale) {
    if (!fin(v)) return null;
    var a = Math.abs(v), decimals = a >= 1000 ? 0 : a >= 1 ? 2 : 4;
    var s = a.toLocaleString(localeFor(lang, locale), { minimumFractionDigits:decimals, maximumFractionDigits:decimals });
    return (v >= 0 ? '+' : '−') + s;
  }

  /* Stops that do not end a sentence although a capital follows (German capitalizes nouns; French has "M. Dupont"):
     a short abbreviation ("z. B.", "bzw.", "ca.", "Nr.", "Mio.") and an ordinal ("am 3. Oktober", "im 4. Quartal",
     "der 1. Widerstand"). A number that closes a sentence ("… bei 85. Der Trend …", "RSI at 71. The trend …") still ends it:
     an ordinal is a 1–2 digit number after a German article/preposition, or before a month or period noun. */
  var ABBREV_STOP = /(?:^|[\s(])(?:z|z\. ?B|bzw|ca|Nr|Mio|Mrd|ggf|inkl|vgl|St|M|Mme|Dr|Prof)\.$/;
  var ORDINAL_STOP = /(?:^|\s)((?:am|im|dem|den|der|des|die|das|zum|zur|vom|beim) )?\d{1,2}\.$/i;
  var ORDINAL_NEXT = /^(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Quartal|Halbjahr|Jahrhundert)(?![A-Za-zÀ-ÿ])/;
  /* The same letters end a sentence in the other languages: a figure in millions ("12 M. La tendencia …") and a number
     after French "des" or Portuguese "das" ("au-dessus des 50. La tendance …", "antes das 10. O volume …"). What follows
     an ordinal is the noun it counts, never a determiner or pronoun, so one of those opens a new sentence. */
  var UNIT_M = /\d ?M\.$/;
  var SENTENCE_OPENER = /^(?:(?:Der|Die|Das|Ein|Eine|Es|Er|Sie|Wir|Le|La|Les|Un|Une|Il|Elle|Ce|O|A|Os|As|Um|Uma)(?![A-Za-zÀ-ÿ’'])|L[’'])/;
  function softStop(s, i) {
    if (s[i] !== '.') return false;
    var head = s.slice(Math.max(0, i - 12), i + 1), next = s.slice(i + 2);
    if (ABBREV_STOP.test(head)) return !UNIT_M.test(head);
    var m = ORDINAL_STOP.exec(head);
    return !!m && (m[1] ? !SENTENCE_OPENER.test(next) : ORDINAL_NEXT.test(next));
  }

  /** Sentence split that survives decimals ("225.1"), tickers, ordinals and abbreviations: a stop must be followed by space + capital/opening mark. */
  function sentences(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return [];
    var out = [], start = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if ((c === '.' || c === '!' || c === '?') && s[i + 1] === ' ' && /[A-ZÀ-ÖØ-Þ¿¡"“(]/.test(s[i + 2] || '') && !softStop(s, i)) {
        out.push(s.slice(start, i + 1).trim());
        start = i + 2;
      }
    }
    if (start < s.length) out.push(s.slice(start).trim());
    return out;
  }
  function firstSentence(text) { return sentences(text)[0] || ''; }
  function clipWords(text, max) {
    if (!(max > 0)) return '';
    if (text.length <= max) return text;
    var cut = text.slice(0, max - 1).replace(/\s+\S*$/, '');
    return cut.replace(/[,;:.\s]+$/, '') + '…';
  }

  /** Syllable estimate for karaoke timing (en/es vowel groups; numbers read as ~2 per 3 digits). */
  function syllables(word) {
    var w = String(word).toLowerCase();
    var digits = w.replace(/[^0-9]/g, '').length;
    if (digits) return Math.max(1, Math.round(digits * 0.9));
    var groups = w.replace(/[^a-zà-öø-ÿ]/g, '').match(/[aeiouyàáâãäåèéêëìíîïòóôõöùúûü]+/g);
    var n = groups ? groups.length : 1;
    if (/[^aeiouy]e$/.test(w) && n > 1 && !/[áéíóú]/.test(w)) n -= 1; // silent e (en)
    return Math.max(1, n);
  }
  /** Estimated word timeline over `durationSec` (or a 2.6 words/s reading clock when null). */
  function wordTimes(text, durationSec) {
    var words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var weights = words.map(function (w) {
      var p = /[.!?…]$/.test(w) ? 1.6 : /[,;:]$/.test(w) ? 0.8 : 0;
      return { syl: syllables(w), pause: p };
    });
    var total = weights.reduce(function (a, b) { return a + b.syl + b.pause; }, 0);
    var dur = fin(durationSec) && durationSec > 0 ? durationSec : words.length / 2.6;
    var k = dur / total, t0 = 0;
    return words.map(function (w, i) {
      var speak = weights[i].syl * k;
      var r = { word: w, t0: t0, t1: t0 + speak };
      t0 += speak + weights[i].pause * k;
      return r;
    });
  }

  function niceStep(span) {
    if (!(span > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(span)));
    var m = span / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  function closedVolumeRatio(candles, receivedAt) {
    var closed = candles.filter(function (c) {
      return c.v > 0 && (!fin(receivedAt) || c.t + 3600e3 <= receivedAt);
    });
    if (closed.length < 21) return null;
    var last = closed[closed.length - 1].v;
    var prev = closed.slice(-21, -1);
    var avg = prev.reduce(function (a, c) { return a + c.v; }, 0) / prev.length;
    if (!(avg > 0)) return null;
    return Math.round((last / avg) * 10) / 10;
  }

  function pulseAgrees(r) {
    var p = r.pulse, a = r.agents;
    if (!p || !fin(p.convictionPct)) return false;
    if (a.verdict !== 'review' || a.direction === 'none' || p.direction !== a.direction) return false;
    if (p.source === 'intel') return true; // intel covers the same symbol the desk read
    var inst = String(p.instrument || '').split('-').slice(0, 2).join('-');
    return !!inst && inst === r.provenance.instrument;
  }
  function planOf(r) {
    if (!pulseAgrees(r) || !r.pulse.plan) return null;
    var p = r.pulse.plan;
    if (!fin(p.entry) || !fin(p.stop) || !fin(p.target) || p.direction !== r.agents.direction) return null;
    var ok = p.direction === 'long' ? (p.stop < p.entry && p.entry < p.target)
      : p.direction === 'short' ? (p.target < p.entry && p.entry < p.stop) : false;
    return ok ? { entry: p.entry, stop: p.stop, target: p.target, rewardRisk: fin(p.rewardRisk) ? p.rewardRisk : null } : null;
  }

  function buildSatellites(r, lang, firstRead, locale) {
    var currency = currencyOf(r);
    var tech = r.technicals || {}, m = r.market || {}, c = r.candles || [];
    var price = fin(m.price) ? m.price : tech.price;
    var sats = [];
    if (fin(price)) {
      var prev = c.length >= 2 ? c[c.length - 2].c : null;
      sats.push({ slot: 'UL', id: 'price', key: r.asset.symbol, value: money(price, lang, currency, locale), from: fin(prev) ? money(prev, lang, currency, locale) : null,
        delta: signedPct(m.changePct, lang, locale), dot: !fin(m.changePct) || m.changePct === 0 ? 'neutral' : m.changePct > 0 ? 'alpha' : 'red' });
    }
    if (fin(tech.rsi14)) {
      var mo = tech.momentum;
      sats.push({ slot: 'UR', id: 'rsi', key: t(lang, 'sat.rsi'), value: String(Math.round(tech.rsi14)), from: null,
        delta: mo === 'overbought' ? t(lang, 'sat.hot') : mo === 'oversold' ? t(lang, 'sat.cold') : null,
        dot: mo === 'overbought' || mo === 'oversold' ? 'red' : 'neutral' });
    }
    var vr = closedVolumeRatio(c, r.receivedAt);
    if (vr != null) {
      sats.push({ slot: 'LR', id: 'volume', key: t(lang, 'sat.volume'), value: vr.toLocaleString(localeFor(lang, locale), { minimumFractionDigits:1, maximumFractionDigits:1 }) + '×', from: null, delta: t(lang, 'sat.vsAvg'), dot: 'neutral' });
    } else if (tech.trend) {
      sats.push({ slot: 'LR', id: 'trend', key: t(lang, 'sat.trend'), value: t(lang, 'trend.' + tech.trend), from: null, delta: t(lang, 'sat.ema'),
        dot: tech.trend === 'up' ? 'alpha' : tech.trend === 'down' ? 'red' : 'neutral' });
    }
    if (fin(tech.support) && fin(tech.resistance)) {
      sats.push({ slot: 'LL', id: 'range', key: t(lang, 'sat.range'), value: money(tech.support, lang, currency, locale) + '–' + money(tech.resistance, lang, currency, locale), from: null,
        delta: fin(tech.bars) ? '' : t(lang, 'sat.range30'), dot: 'neutral' });
    }
    return sats.slice(0, firstRead ? 3 : 4);
  }

  function buildChart(r, lang, plan, locale) {
    var currency = currencyOf(r);
    var c = r.candles || [];
    if (c.length < 10) return null;
    var pts = c.slice(-48);
    var closes = pts.map(function (x) { return x.c; });
    var tech = r.technicals || {};
    var lines = [];
    if (fin(tech.support)) lines.push({ kind: 'support', price: tech.support, label: t(lang, 'chart.support', { price: money(tech.support, lang, currency, locale) }) });
    if (fin(tech.resistance)) lines.push({ kind: 'resistance', price: tech.resistance, label: t(lang, 'chart.resistance', { price: money(tech.resistance, lang, currency, locale) }) });
    if (plan) {
      ['entry', 'stop', 'target'].forEach(function (k) {
        lines.push({ kind: k, price: plan[k], label: t(lang, 'chart.' + k, { price: money(plan[k], lang, currency, locale) }) });
      });
    }
    var vals = closes.concat(lines.map(function (l) { return l.price; }));
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.004 || 1;
    lo -= pad; hi += pad;
    var step = niceStep((hi - lo) / 3);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    var grid = [];
    for (var g = lo + step; g < hi - step * 0.5 && grid.length < 2; g += step) grid.push(+g.toFixed(10));
    var now = pts[pts.length - 1];
    var band = null, bracket = null;
    if (fin(tech.support)) {
      var atr = fin(tech.atrPct) && fin(now.c) ? now.c * tech.atrPct / 100 : 0;
      var top = Math.min(tech.support + atr, Math.max(tech.support, now.c));
      band = { lo: tech.support, hi: top > tech.support ? top : tech.support, label: t(lang, 'chart.support', { price: money(tech.support, lang, currency, locale) }) };
      var d = now.c - tech.support;
      bracket = { from: now.c, to: tech.support, label: delta(d, lang, locale), sub: t(lang, d >= 0 ? 'chart.aboveSupport' : 'chart.belowSupport'),
        pct: fin(d / tech.support) ? Math.round((d / tech.support) * 1000) / 10 : null };
    }
    return {
      times: pts.map(function (x) { return x.t; }), closes: closes,
      domain: [lo, hi], gridlines: grid,
      now: { price: now.c, t: now.t, label: money(now.c, lang, currency, locale) },
      band: band, lines: lines, bracket: bracket,
      source: { timeframe: r.provenance.timeframe, provider: r.provenance.provider, instrument: r.provenance.instrument, asOf: r.provenance.asOf }
    };
  }

  function buildSpoken(r, lang) {
    var cio = sentences(r.agents.cio);
    var picked = [], used = 0;
    for (var i = 0; i < cio.length; i++) {
      if (picked.length && used + cio[i].length + 1 > 600) break;
      picked.push(i === 0 && cio[i].length > 600 ? clipWords(cio[i], 600) : cio[i]);
      used += cio[i].length + 1;
    }
    var close = t(lang, 'spoken.close.' + r.agents.verdict);
    var all = picked.concat([close]);
    var text = all.join(' ');
    var words = text.split(/\s+/).filter(Boolean);
    var vword = t(lang, 'spoken.close.' + r.agents.verdict).split(/\s+/).pop().replace(/[.!?]$/, '');
    var vIndex = -1;
    for (var w = words.length - 1; w >= 0; w--) {
      if (words[w].replace(/[.!?,;:]$/, '').toLowerCase() === vword.toLowerCase()) { vIndex = w; break; }
    }
    return {
      text: text, sentences: all, words: words,
      verdictWordIndex: vIndex,
      stageAt: { evidence: 0, chart: picked.length >= 2 ? 1 : null, verdict: picked.length }
    };
  }

  function build(r, opts) {
    opts = opts || {};
    if (!r || r.status !== 'ok') throw new Error('build() needs an ok ask() reply');
    var lang = lang2(opts.lang || r.language), currency = currencyOf(r);
    var locale = localeFor(lang, opts.locale === undefined ? (r.locale || opts.lang || r.language) : opts.locale);
    var v = r.agents.verdict === 'review' ? 'review' : 'wait';
    var agrees = pulseAgrees(r);
    var plan = planOf(r);
    var tech = r.technicals || {};
    var price = fin(r.market && r.market.price) ? r.market.price : tech.price;
    var word = t(lang, 'verdict.' + v);
    var ring = agrees ? { mode: 'conviction', pct: Math.max(0, Math.min(100, Math.round(r.pulse.convictionPct))), label: t(lang, 'ring.conviction') }
      : { mode: 'complete', pct: null, label: null };
    var rows = [{ id: 'price', label: t(lang, 'row.price'), value: money(price, lang, currency, locale) }];
    if (plan) {
      rows.push({ id: 'entry', label: t(lang, 'row.entry'), value: money(plan.entry, lang, currency, locale) });
      rows.push({ id: 'stop', label: t(lang, 'row.stop'), value: money(plan.stop, lang, currency, locale) });
      rows.push({ id: 'target', label: t(lang, 'row.target'), value: money(plan.target, lang, currency, locale) });
    } else {
      if (fin(tech.support)) rows.push({ id: 'support', label: t(lang, 'row.support'), value: money(tech.support, lang, currency, locale) });
      if (fin(tech.resistance)) rows.push({ id: 'resistance', label: t(lang, 'row.resistance'), value: money(tech.resistance, lang, currency, locale) });
    }
    if (tech.trend || fin(tech.rsi14)) {
      rows.push({ id: 'trend', label: t(lang, 'row.trend'),
        value: [tech.trend ? t(lang, 'trend.' + tech.trend) : null, fin(tech.rsi14) ? 'RSI ' + Math.round(tech.rsi14) : null].filter(Boolean).join(' · ') });
    }
    var sym = r.asset.symbol;
    return {
      requestId: r.requestId, symbol: sym, name: r.asset.name, isEquity: !!r.asset.isEquity, question: r.question, lang: lang,
      verdict: { key: v, word: word, hue: VERDICT[v].hue, color: VERDICT[v].color, core: VERDICT[v].core, amb: VERDICT[v].amb,
        direction: r.agents.direction },
      ring: ring,
      agents: ['alpha', 'red', 'cio'].map(function (k) {
        return { id: k, name: t(lang, 'agent.' + k), hue: HUES[k], stance: firstSentence(r.agents[k]), full: r.agents[k] };
      }),
      satellites: buildSatellites(r, lang, !!opts.firstRead, locale),
      chart: buildChart(r, lang, plan, locale),
      plan: plan,
      spoken: buildSpoken(r, lang),
      thesis: {
        header: t(lang, 'thesis.header', { symbol: sym }),
        title: t(lang, 'thesis.title.' + v, { symbol: sym }),
        rows: rows,
        horizon: { show: !!opts.signedIn && v === 'review', options: [24, 72, 168], defaultHours: 24 },
        line: v === 'wait' ? t(lang, 'thesis.line.wait') : t(lang, 'thesis.line.review', { hours: 24 }),
        saveLabel: t(lang, 'thesis.save'),
        savedLabel: t(lang, opts.signedIn ? 'thesis.saved' : 'thesis.savedLocal'),
        pill: sym + ' · ' + word.toUpperCase()
      },
      debate: {
        header: t(lang, 'debate.header'),
        title: t(lang, 'debate.title', { n: 3, s: fin(r.elapsedMs) ? Math.max(1, Math.round(r.elapsedMs / 1000)) : '—' }),
        /* each voice carries `role`: one fixed line under its name saying what that voice does */
        entries: ['alpha', 'red', 'cio'].map(function (k) { return { id: k, name: t(lang, 'agent.' + k), role: t(lang, 'role.' + k), hue: HUES[k], text: r.agents[k] }; })
      },
      meta: t(lang, 'meta'),
      aria: t(lang, 'aria.verdict', { word: word }) + (ring.pct != null ? t(lang, 'aria.conviction', { pct: ring.pct }) : '')
    };
  }

  /** XP chip copy from the REAL awarded points (0 = daily cap). */
  function xpChip(points, verdictKey, lang) {
    if (!(points > 0)) return t(lang, 'xp.capped');
    return t(lang, verdictKey === 'wait' ? 'xp.pointsWait' : 'xp.points', { points: points });
  }

  /** Non-ok replies -> caption + chips. Never a verdict, never XP. */
  function failure(r, lang, opts) {
    lang = lang2(lang);
    switch (r && r.status) {
      case 'confirm':
        return { kind: 'confirm', caption: t(lang, 'confirm.prompt', { name: r.asset.name, symbol: r.asset.symbol }), sub: r.proxyNote || null,
          chips: [{ label: t(lang, 'confirm.yes', { symbol: r.asset.symbol }), action: { token: r.token }, primary: true },
            { label: t(lang, 'confirm.no'), action: { retype: true } }] };
      case 'unknown_asset':
        return { kind: 'unknown', caption: t(lang, 'err.unknown'), sub: null,
          chips: (r.suggestions || []).slice(0, 3).map(function (s) {
            return { label: s.name && s.name !== s.symbol ? s.name + ' (' + s.symbol + ')' : s.symbol, action: { token: s.token } };
          }) };
      case 'unsupported':
        return { kind: 'unsupported', caption: r.reason === 'stale_data' || r.reason === 'thin_data'
          ? t(lang, 'err.unsupportedStale', { symbol: r.asset.symbol }) : t(lang, 'err.unsupported', { name: r.asset.name || r.asset.symbol }), sub: null, chips: [] };
      case 'too_long': return { kind: 'too_long', caption: t(lang, 'err.tooLong'), sub: null, chips: [] };
      case 'quota': return { kind: 'quota', caption: t(lang, 'err.quota'), sub: null, chips: [], retryAfterSec: r.retryAfterSec };
      case 'cancelled': return { kind: 'cancelled', caption: null, sub: null, chips: [] };
      case 'error':
        // Consent first (§2.4 step 2): the page routes to the risk beat instead of a generic failure.
        if (r.code === 'risk_not_accepted') {
          return { kind: 'risk', code: r.code, caption: t(lang, 'err.risk'), sub: t(lang, 'err.riskSub'),
            chips: [{ label: t(lang, 'err.riskCta'), action: { risk: true }, primary: true }] };
        }
        var key = r.code === 'network' ? 'err.network' : r.code === 'timeout' ? 'err.timeout' : 'err.bad';
        return { kind: 'error', code: r.code, caption: t(lang, key), sub: null, chips: [] };
      default:
        return { kind: 'error', code: 'bad_reply', caption: t(lang, 'err.bad'), sub: null, chips: [] };
    }
  }

  /** Follow-up chips after a save (§3.2 FOLLOWUPS): "Another question about {SYM}" (a follow-up of this read), then up to
   *  2 REAL symbols from suggestions() (quickAccess first, then movers), never the current one. No invented questions. */
  function followUps(model, sugg, lang, opts) {
    lang = lang2(lang); opts = opts || {};
    var sym = String(model.symbol || '').toUpperCase();
    var out = [{ label: t(lang, 'follow.another', { symbol: sym }), action: { followUpOf: model.requestId, symbol: sym } }];
    var seen = {}; seen[sym] = 1;
    var qa = (sugg && sugg.quickAccess) || [], mv = (sugg && sugg.movers) || [];
    qa.map(function (s) { return { s: s, kind: 'quick' }; }).concat(mv.map(function (s) { return { s: s, kind: 'mover' }; })).forEach(function (x) {
      var s = String(x.s && x.s.symbol || '').toUpperCase();
      if (out.length >= 3 || !/^[A-Z0-9.^=-]{1,20}$/.test(s) || seen[s]) return;
      seen[s] = 1;
      var q = t(lang, x.kind === 'mover' && opts.whyForMovers ? 'follow.why' : 'follow.how', { symbol: s });
      out.push({ label: q, action: { question: q, symbol: s } });
    });
    return out;
  }

  /** A saved ledger Thesis (§2.7) -> the read-only thesis card, the ghost satellite and the Theses face. */
  function thesisView(th, lang, opts) {
    var currency = currencyOf(th);
    opts = opts || {};
    var locale = localeFor(lang, opts.locale);
    lang = lang2(lang);
    var v = th.verdict === 'review' ? 'review' : 'wait', sym = String(th.symbol || '');
    var word = t(lang, 'verdict.' + v);
    var rows = [{ id: 'price', label: t(lang, 'row.price'), value: money(th.price, lang, currency, locale) }];
    if (fin(th.entry) || fin(th.stop) || fin(th.target)) {
      if (fin(th.entry)) rows.push({ id: 'entry', label: t(lang, 'row.entry'), value: money(th.entry, lang, currency, locale) });
      if (fin(th.stop)) rows.push({ id: 'stop', label: t(lang, 'row.stop'), value: money(th.stop, lang, currency, locale) });
      if (fin(th.target)) rows.push({ id: 'target', label: t(lang, 'row.target'), value: money(th.target, lang, currency, locale) });
    } else {
      if (fin(th.support)) rows.push({ id: 'support', label: t(lang, 'row.support'), value: money(th.support, lang, currency, locale) });
      if (fin(th.resistance)) rows.push({ id: 'resistance', label: t(lang, 'row.resistance'), value: money(th.resistance, lang, currency, locale) });
    }
    rows = rows.filter(function (r) { return r.value != null; });
    return {
      id: th.id, symbol: sym,
      verdict: { key: v, word: word, color: VERDICT[v].color },
      header: t(lang, 'thesis.header', { symbol: sym }),
      title: t(lang, 'thesis.title.' + v, { symbol: sym }),
      rows: rows,
      line: v === 'wait' ? t(lang, 'thesis.line.wait') : t(lang, 'thesis.line.review', { hours: fin(th.horizonHours) ? th.horizonHours : 24 }),
      saveLabel: t(lang, 'thesis.save'),
      savedLabel: t(lang, opts.signedIn ? 'thesis.saved' : 'thesis.savedLocal'),
      pill: sym + ' · ' + word.toUpperCase(),
      price: money(th.price, lang, currency, locale),
      points: fin(th.points) ? th.points : 0,
      asOf: th.asOf || null
    };
  }

  root.NucleoReadModel = {
    v: 1, STRINGS: S, HUES: HUES, VERDICT: VERDICT,
    t: t, money: money, signedPct: signedPct, currencyOf: currencyOf,
    sentences: sentences, firstSentence: firstSentence, clipWords: clipWords,
    syllables: syllables, wordTimes: wordTimes,
    build: build, failure: failure, xpChip: xpChip, followUps: followUps, thesisView: thesisView,
    _internal: { pulseAgrees: pulseAgrees, planOf: planOf, closedVolumeRatio: closedVolumeRatio, niceStep: niceStep }
  };
})(typeof window !== 'undefined' ? window : globalThis);
