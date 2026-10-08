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
      'debate.title': '{n} agents · {s} s', 'debate.header': 'THE DEBATE', 'debate.full': 'SEE THE FULL DEBATE ↓',
      'syn.name': 'IN SHORT', 'syn.why': 'Why', 'syn.risk': 'The risk', 'syn.watch': 'What to watch',
      'agent.rebuttal': 'SECOND ROUND', 'agent.scenarios': 'SCENARIOS', 'sc.confirm': 'Confirms it', 'sc.invalidate': 'Invalidates it',
      'agent.missing': 'MISSING DATA', 'missing.line': 'Missing data for {h}: {list}.', 'missing.lineNoH': 'Missing data: {list}.',
      'hz.intraday': 'today', 'hz.week': 'the next few weeks', 'hz.month': 'the coming months', 'hz.long': 'the long term',
      'agent.evidence': 'EVIDENCE USED', 'ev.derivatives': 'derivatives', 'ev.record': 'record {w}/{n}',
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
      'err.retry': 'Try again',
      'err.risk': 'First, the risk notice.', 'err.riskSub': 'Bobby reads nothing until you agree to it. Your question was not sent.',
      'err.riskCta': 'Open the risk notice',
      'gate.signin': 'Create your free account to keep reading — 20 free reads a week.',
      'gate.signinCta': 'Sign in with Apple', 'gate.notNow': 'Not now',
      'gate.signinUnavailable': 'Sign-in isn’t available right now. Your question was not sent.',
      'gate.signinFailed': 'Sign-in didn’t finish. Your question was not sent.',
      'gate.pro': 'You’ve used this week’s free reads.', 'gate.proResets': 'They reset {date}. Bobby Pro has unlimited Quick reads.',
      'gate.proNoDate': 'Bobby Pro has unlimited Quick reads.', 'gate.proCta': 'See Bobby Pro',
      'gate.proPending': 'Waiting for the App Store to confirm Bobby Pro.', 'gate.proFailed': 'Bobby Pro isn’t confirmed yet. Your question was not sent.',
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
      'debate.title': '{n} agentes · {s} s', 'debate.header': 'EL DEBATE', 'debate.full': 'VER EL DEBATE COMPLETO ↓',
      'syn.name': 'EN CORTO', 'syn.why': 'Por qué', 'syn.risk': 'El riesgo', 'syn.watch': 'Qué vigilar',
      'agent.rebuttal': 'SEGUNDA RONDA', 'agent.scenarios': 'ESCENARIOS', 'sc.confirm': 'Lo confirma', 'sc.invalidate': 'Lo invalida',
      'agent.missing': 'FALTAN DATOS', 'missing.line': 'Para {h} faltan datos: {list}.', 'missing.lineNoH': 'Faltan datos: {list}.',
      'hz.intraday': 'hoy', 'hz.week': 'las próximas semanas', 'hz.month': 'los próximos meses', 'hz.long': 'el largo plazo',
      'agent.evidence': 'EVIDENCIA USADA', 'ev.derivatives': 'derivados', 'ev.record': 'récord {w}/{n}',
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
      'err.retry': 'Reintentar',
      'err.risk': 'Primero, el aviso de riesgo.', 'err.riskSub': 'Bobby no analiza nada hasta que lo aceptes. Tu pregunta no se envió.',
      'err.riskCta': 'Abrir el aviso de riesgo',
      'gate.signin': 'Crea tu cuenta gratis para seguir leyendo: 20 lecturas gratis a la semana.',
      'gate.signinCta': 'Iniciar sesión con Apple', 'gate.notNow': 'Ahora no',
      'gate.signinUnavailable': 'Ahora no se puede iniciar sesión. Tu pregunta no se envió.',
      'gate.signinFailed': 'No se completó el inicio de sesión. Tu pregunta no se envió.',
      'gate.pro': 'Ya usaste tus lecturas gratis de esta semana.', 'gate.proResets': 'Se renuevan el {date}. Bobby Pro tiene lecturas Rápidas ilimitadas.',
      'gate.proNoDate': 'Bobby Pro tiene lecturas Rápidas ilimitadas.', 'gate.proCta': 'Ver Bobby Pro',
      'gate.proPending': 'Esperando a que la App Store confirme Bobby Pro.', 'gate.proFailed': 'Bobby Pro aún no está confirmado. Tu pregunta no se envió.',
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
    "debate.full": "VOIR LE DÉBAT COMPLET ↓",
    "syn.name": "EN BREF",
    "syn.why": "Pourquoi",
    "syn.risk": "Le risque",
    "syn.watch": "À surveiller",
    "agent.rebuttal": "DEUXIÈME TOUR",
    "agent.scenarios": "SCÉNARIOS",
    "sc.confirm": "Confirme la thèse",
    "sc.invalidate": "Invalide la thèse",
    "agent.missing": "DONNÉES MANQUANTES",
    "missing.line": "Données manquantes pour {h} : {list}.",
    "missing.lineNoH": "Données manquantes : {list}.",
    "hz.intraday": "aujourd’hui",
    "hz.week": "les prochaines semaines",
    "hz.month": "les prochains mois",
    "hz.long": "le long terme",
    "agent.evidence": "ÉLÉMENTS UTILISÉS",
    "ev.derivatives": "produits dérivés",
    "ev.record": "historique {w}/{n}",
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
    "err.retry": "Réessayer",
    "err.risk": "D’abord, l’avertissement sur les risques.",
    "err.riskSub": "Bobby ne lance aucune analyse avant ton accord. Ta question n’a pas été envoyée.",
    "err.riskCta": "Ouvrir l’avertissement sur les risques",
    "gate.signin": "Crée ton compte gratuit pour continuer : 20 analyses gratuites par semaine.",
    "gate.signinCta": "Se connecter avec Apple",
    "gate.notNow": "Plus tard",
    "gate.signinUnavailable": "La connexion est indisponible. Ta question n’a pas été envoyée.",
    "gate.signinFailed": "La connexion n’a pas abouti. Ta question n’a pas été envoyée.",
    "gate.pro": "Tu as utilisé les analyses gratuites de cette semaine.",
    "gate.proResets": "Elles sont renouvelées le {date}. Bobby Pro offre des analyses Rapides illimitées.",
    "gate.proNoDate": "Bobby Pro offre des analyses Rapides illimitées.",
    "gate.proCta": "Voir Bobby Pro",
    "gate.proPending": "En attente de la confirmation de Bobby Pro par l’App Store.",
    "gate.proFailed": "Bobby Pro n’est pas encore confirmé. Ta question n’a pas été envoyée.",
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
    "debate.full": "VER O DEBATE COMPLETO ↓",
    "syn.name": "EM RESUMO",
    "syn.why": "Porquê",
    "syn.risk": "O risco",
    "syn.watch": "O que acompanhar",
    "agent.rebuttal": "SEGUNDA RONDA",
    "agent.scenarios": "CENÁRIOS",
    "sc.confirm": "Confirma a tese",
    "sc.invalidate": "Invalida a tese",
    "agent.missing": "DADOS EM FALTA",
    "missing.line": "Dados em falta para {h}: {list}.",
    "missing.lineNoH": "Dados em falta: {list}.",
    "hz.intraday": "hoje",
    "hz.week": "as próximas semanas",
    "hz.month": "os próximos meses",
    "hz.long": "o longo prazo",
    "agent.evidence": "EVIDÊNCIA UTILIZADA",
    "ev.derivatives": "derivados",
    "ev.record": "histórico {w}/{n}",
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
    "err.retry": "Tentar novamente",
    "err.risk": "Primeiro, o aviso de risco.",
    "err.riskSub": "O Bobby só analisa depois de aceitares o aviso. A tua pergunta não foi enviada.",
    "err.riskCta": "Abrir o aviso de risco",
    "gate.signin": "Cria a tua conta gratuita para continuar: 20 análises gratuitas por semana.",
    "gate.signinCta": "Iniciar sessão com Apple",
    "gate.notNow": "Agora não",
    "gate.signinUnavailable": "O início de sessão não está disponível. A tua pergunta não foi enviada.",
    "gate.signinFailed": "O início de sessão não foi concluído. A tua pergunta não foi enviada.",
    "gate.pro": "Já utilizaste as análises gratuitas desta semana.",
    "gate.proResets": "São renovadas a {date}. O Bobby Pro inclui análises Rápidas ilimitadas.",
    "gate.proNoDate": "O Bobby Pro inclui análises Rápidas ilimitadas.",
    "gate.proCta": "Ver Bobby Pro",
    "gate.proPending": "À espera da confirmação do Bobby Pro pela App Store.",
    "gate.proFailed": "O Bobby Pro ainda não está confirmado. A tua pergunta não foi enviada.",
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
    "debate.full": "VEDI IL DIBATTITO COMPLETO ↓",
    "syn.name": "IN BREVE",
    "syn.why": "Perché",
    "syn.risk": "Il rischio",
    "syn.watch": "Cosa seguire",
    "agent.rebuttal": "SECONDO TURNO",
    "agent.scenarios": "SCENARI",
    "sc.confirm": "Conferma la tesi",
    "sc.invalidate": "Invalida la tesi",
    "agent.missing": "DATI MANCANTI",
    "missing.line": "Dati mancanti per {h}: {list}.",
    "missing.lineNoH": "Dati mancanti: {list}.",
    "hz.intraday": "oggi",
    "hz.week": "le prossime settimane",
    "hz.month": "i prossimi mesi",
    "hz.long": "il lungo termine",
    "agent.evidence": "ELEMENTI UTILIZZATI",
    "ev.derivatives": "derivati",
    "ev.record": "storico {w}/{n}",
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
    "err.retry": "Riprova",
    "err.risk": "Prima, l’avvertenza sui rischi.",
    "err.riskSub": "Bobby non analizza nulla prima del tuo consenso. La domanda non è stata inviata.",
    "err.riskCta": "Apri l’avvertenza sui rischi",
    "gate.signin": "Crea il tuo account gratuito per continuare: 20 analisi gratuite a settimana.",
    "gate.signinCta": "Accedi con Apple",
    "gate.notNow": "Non ora",
    "gate.signinUnavailable": "L’accesso non è disponibile. La domanda non è stata inviata.",
    "gate.signinFailed": "L’accesso non è stato completato. La domanda non è stata inviata.",
    "gate.pro": "Hai usato le analisi gratuite di questa settimana.",
    "gate.proResets": "Si rinnovano il {date}. Bobby Pro include analisi Rapide illimitate.",
    "gate.proNoDate": "Bobby Pro include analisi Rapide illimitate.",
    "gate.proCta": "Vedi Bobby Pro",
    "gate.proPending": "In attesa della conferma di Bobby Pro dall’App Store.",
    "gate.proFailed": "Bobby Pro non è ancora confermato. La domanda non è stata inviata.",
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
    "debate.full": "VOLLSTÄNDIGE DEBATTE ANSEHEN ↓",
    "syn.name": "KURZ GEFASST",
    "syn.why": "Warum",
    "syn.risk": "Das Risiko",
    "syn.watch": "Was zu beobachten ist",
    "agent.rebuttal": "ZWEITE RUNDE",
    "agent.scenarios": "SZENARIEN",
    "sc.confirm": "Bestätigt die These",
    "sc.invalidate": "Widerlegt die These",
    "agent.missing": "FEHLENDE DATEN",
    "missing.line": "Fehlende Daten für {h}: {list}.",
    "missing.lineNoH": "Fehlende Daten: {list}.",
    "hz.intraday": "heute",
    "hz.week": "die nächsten Wochen",
    "hz.month": "die kommenden Monate",
    "hz.long": "die lange Frist",
    "agent.evidence": "VERWENDETE BELEGE",
    "ev.derivatives": "Derivate",
    "ev.record": "Historie {w}/{n}",
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
    "err.retry": "Erneut versuchen",
    "err.risk": "Zuerst der Risikohinweis.",
    "err.riskSub": "Bobby analysiert erst nach deiner Zustimmung. Deine Frage wurde nicht gesendet.",
    "err.riskCta": "Risikohinweis öffnen",
    "gate.signin": "Erstelle dein kostenloses Konto: 20 kostenlose Analysen pro Woche.",
    "gate.signinCta": "Mit Apple anmelden",
    "gate.notNow": "Jetzt nicht",
    "gate.signinUnavailable": "Die Anmeldung ist nicht verfügbar. Deine Frage wurde nicht gesendet.",
    "gate.signinFailed": "Die Anmeldung wurde nicht abgeschlossen. Deine Frage wurde nicht gesendet.",
    "gate.pro": "Du hast die kostenlosen Analysen dieser Woche genutzt.",
    "gate.proResets": "Sie werden am {date} erneuert. Bobby Pro bietet unbegrenzte Schnelle Analysen.",
    "gate.proNoDate": "Bobby Pro bietet unbegrenzte Schnelle Analysen.",
    "gate.proCta": "Bobby Pro ansehen",
    "gate.proPending": "Warten auf die Bestätigung von Bobby Pro durch den App Store.",
    "gate.proFailed": "Bobby Pro ist noch nicht bestätigt. Deine Frage wurde nicht gesendet.",
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
  /* sufficiency.horizon values that read as words; 'unspecified' (or anything new) takes the no-horizon line */
  var HORIZONS = { intraday: 1, week: 1, month: 1, long: 1 };
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

  /* ---- The next question (ARCHITECTURE.md §3.5). The desk's CIO writes one on every read (synthesis.followUp).
     It becomes the first chip only when it passes every check below; otherwise the row is the fixed chips, and
     nothing says why. The checks reject too much on purpose: a chip that is not shown costs nothing, a wrong one
     is Bobby's own question, one tap away. ---- */
  var NEXT_MIN = 8, NEXT_MAX = 90;   /* code points; the page also measures the drawn chip (two lines at most) */
  /* Words and plain punctuation only: no currency sign, no percent, no markup, no address. */
  var NEXT_CHARS = /^[A-Za-zÀ-ÖØ-öø-ÿŒœŸ0-9 '’,.\-–&():"“”«»¿?]+$/;
  /* It asks what or why, never whether or when to act: it opens with the what/why word of the reply's language
     (after a leading preposition where the language puts one). Matched on the folded text. */
  var NEXT_OPENS = {
    en: /^(?:what|why|which)(?![a-z])/,
    es: /^(?:(?:a|de|en|con|por|para|sobre) )?(?:que|cual|cuales)(?![a-z])/,
    fr: /^(?:pourquoi(?![a-z])|(?:(?:a|de|en|sur|par|pour|avec) )?(?:qu['’]|(?:que|quoi|quels?|quelles?)(?![a-z])))/,
    pt: /^(?:porque(?![a-z])|(?:(?:a|de|em|com|por|para|sobre) )?(?:o )?(?:que|qual|quais)(?![a-z]))/,
    it: /^(?:perche(?![a-z])|(?:(?:a|da|di|in|con|per|su) )?(?:cos['’]|(?:che cosa|che|cosa|quale|quali|qual)(?![a-z])))/,
    de: /^(?:was|warum|wieso|weshalb|weswegen|welche[rsnm]?|wor(?:an|auf|in|um|uber)|wo(?:durch|von|mit|fur))(?![a-z])/
  };
  /* THE list: the words product copy never uses (buy, sell, profit, guaranteed, returns, advice, signal, alert)
     with their conjugations and compounds in the six languages, and the claims Bobby never makes about itself
     (that it watched, monitored, noticed or detected something). Each pattern is tried on every folded word
     (lowercase, accents removed). Unanchored patterns match inside a word, so "Kaufsignal" and "unprofitable"
     are caught; the anchored ones keep innocent neighbours out (comprendre, involucra, Gesellschaft, Vertrag,
     arsenal). What still over-matches (vendredi, a consejo that is a board, a "watch" that is the reader's own)
     only costs a chip. */
  var NEXT_FORBIDDEN = [
    /* buy */ /buy|bought|purchas|kauf|acquist/, /^r?ach[ea]t/,
    /* comprar, in every ending (comprase, comprándolo, compraríamos, comprerebbe, comprava): the stem, minus the
       families that only look like it (comprender, comprensión, compreender, comprobar, comprueba, comprovar,
       compromiso, comprimir, compris, compreso, compresso) */
    /^compr(?!end|ens|eend|eens|ehen|ob|ov|ueb|om|im|is|ess|es[oaie]$)[a-z]/,
    /* sell */ /^(?:re)?sell|vend/, /^(?:sold|ventas?|ventes?)$/,
    /* profit */ /profit|gananci|benefic|guadagn|gew[aio]nn/, /^lucr/, /^gain/, /^gagn/, /^ganh/,
    /* guaranteed */ /guarant|garant|garanz/,
    /* returns */ /^return/, /rendim|rendem|rentab|rendit|retorn/, /^ritorn/, /^ertrag/,
    /* advice */ /^advi[cs]/, /recommend|recomi?end|recommand|raccomand|consej|asesor|assessor|conseil|conselh|consigl|consulenz|ratschl|berat|empf(?:ie|e|a|o)hl/,
    /^(?:rat|rats|ratst|raten|ratet|riet|rietst|rieten|geraten|abraten|anraten|zuraten)$/,
    /* signal */ /signal|signaux|segnal/, /^(?:senal|sinal|sinais)/,
    /* alert */ /alert|allert|allarm|alarm|warn/,
    /* watched, monitored, noticed, detected */ /^watch/, /monitor/, /^notic/, /detect|detet/, /observ|osserv/,
    /^vigi/, /surveill/, /remarqu/, /sorvegli/, /rilev/, /beobacht/, /uberwach/, /bemerk/, /entdeck/, /auff[ae]ll|aufgefall/,
    /^not(?:o|ou|ei|aste|aron|aram|ado|ato|ata|ando|amos|ar|are|ava|avo)$/,
    /* What a person does with their money, which Bobby's own question never puts to them (2026-10-08).
       invest: the act and its noun in the six languages (investing, investir, investimento, investieren, Investition),
       not the people who do it (investors, investisseurs, investidores, investitori) and not an investigation */
    /^(?:re|dis|des)?invest(?!or|isseu|idor|itor|ig)/,
    /* bet */ /^bet(?:s|ting)?$/, /^wager/, /^apost/, /^apuest/, /^scommett/, /^scommess/, /^wett(?:e|en|et|est|ete|eten)$/, /^gewettet$/,
    /* leverage */ /^leverag/, /apalanc/, /alavanc/, /hebel/,
    /* savings */ /^savings$/, /^ahorr/, /^epargn/, /^poupanc/, /^risparmi/, /erspar/, /^sparbuch/,
    /* to short, as a verb in any of them */ /^short(?:ed|ing|en|et|are|ear)$/, /^geshortet$/, /^yolo/
  ];
  /* Whether or when to act, dressed as a what or a why ("Why not get in now?", "What is the best moment to…?").
     Phrases, so each is tried on the folded text of the reply's language, not word by word. A verb that also means
     "to expect" (esperar, attendre, aspettare) only counts in the turns that mean waiting, "moment" does not count
     where it only means "now" (NEXT_NOW is taken out first: "en ce moment", "at the moment"), and in English a verb
     the market itself does ("NVDA entered a correction", "the market is waiting for…") counts only as the reader's. */
  /* Also taken out first: "long" and "short" where they only measure time or the shape of a candle ("long-term",
     "as long as", "a long wick", "a corto plazo"). What is left of them is a position, and NEXT_ACTS refuses it. */
  var NEXT_NOW = {
    en: /(?:^| )(?:(?:at|for) the moment|(?:as|so|how|too) long(?= (?:as|to|for|it|the|this|that|before|after|until|will|would|can|could|does|did|is|has|have|and)(?![a-z])|$)|(?:for|before) long|(?:long|short)(?: (?:and|or|to) (?:long|short|medium|mid))? (?:term|run|dated|lived|time|way|while|ago|enough|since|period|stretch|history|wicks?|tails?|candles?|shadows?|body|bodies|base|consolidation|range|pause|lower|upper))(?![a-z])/g,
    es: /(?:^| )(?:(?:en este|en ese|por el|de) momento|(?:(?:a|de|en el|al|del|en) )?(?:corto|largo|mediano|medio)(?: (?:y|o|u) (?:corto|largo|mediano|medio))? plazo|plazos? (?:mas |muy )?(?:cortos?|largos?)|a lo largo)(?![a-z])/g,
    fr: /(?:^| )(?:en ce|pour le|a ce) moment(?![a-z])/g,
    pt: /(?:^| )(?:neste|nesse|no|de|por) momento(?![a-z])/g,
    it: /(?:^| )(?:in questo|in quel|al|per il) momento(?![a-z])/g,
    de: /(?:^| )im moment(?![a-z])/g
  };
  var NEXT_ACTS = {
    en: /(?:^| )(?:(?:to|not|i|we|you|should|could|would|can) (?:get into|enter|exit|wait)|(?:get|gets|getting|got) (?:in|out)|jump(?:s|ing)? in|(?:enter|exit)(?:ing)? (?:now|today|here|early|late)|entry|entries|why wait|wait (?:on|until|before|longer|and see)|moment|time to|too (?:late|early|soon)|all in(?! (?:the|a|an|all|one|this|that|these|those|its|their|agreement|favor|favour|line|sync|play)(?![a-z]))|longs?|shorts?|nest egg)(?![a-z])/,
    es: /(?:^| )(?:entrar|entrada|entradas|salir|momento|momentos|hora de|por que (?:no )?esperar|esperar (?:a|para|antes|mas|todavia|un poco|con)|demasiado (?:tarde|pronto)|all in|todo adentro|longs?|shorts?|(?:en|ir|irse|ponerse|ponerte|ponerme|ponernos|estar|quedarse|abrir|cerrar|cubrir|los|sus) (?:largos?|cortos?)|posicion(?:es)? (?:largas?|cortas?)|invert(?:ir|irlo|irla|ido|ida|idos|idas|iria|irian|ira|iran|imos|ia|ian|iste|i)|inviert[a-z]{1,4}|invirt[a-z]{2,6})(?![a-z])/,
    fr: /(?:^| )(?:entrer|entree|entrees|sortir|moment|moments|temps de|heure de|pourquoi (?:ne pas )?attendre|attendre (?:avant|encore|plus|un peu|davantage)|patienter|trop (?:tard|tot)|all in|tapis|shorts?|shorte[a-z]*|(?:etre|rester|passer|se mettre) long|long sur|positions? (?:longues?|courtes?)|pari(?:er|e|es|ent|ez|ons)?|mis(?:er|ent|ons|ez)|mises? sur|effets? de levier|levier financier|avec (?:du |un |le )?levier)(?![a-z])/,
    pt: /(?:^| )(?:entrar|entrada|entradas|sair|momento|momentos|hora de|altura de|por ?que (?:nao )?esperar|esperar (?:a|para|antes|mais|ainda|um pouco|pela|pelo)|demasiado (?:tarde|cedo)|tarde demais|cedo demais|all in|shorts?|longs?|posic(?:ao|oes) (?:longas?|curtas?|compradas?|vendidas?))(?![a-z])/,
    it: /(?:^| )(?:entrare|entrata|entrate|ingresso|ingressi|uscire|momento|momenti|ora di|tempo di|perche (?:non )?(?:aspettare|attendere)|(?:aspettare|attendere) (?:ancora|prima|a|di piu|un po)|troppo (?:tardi|presto)|all in|shorts?|longs?|allo scoperto|posizion[ei] (?:lung|cort)[aehi]{1,2}|puntare|puntando|punt(?:a|ano|i|iamo|ate) su(?:l|lla|llo|i|gli|lle)?|puntat[ae]|leva finanziaria|effetto leva|(?:a|in|con|con la) leva)(?![a-z])/,
    de: /(?:^| )(?:[a-z]*einst(?:ieg|eig)[a-z]*|einzusteigen|aussteigen|auszusteigen|ausstieg|moment|moments|momente|zeitpunkt|zeitpunkte|zeit (?:zu|fur)|warten|abwarten|abzuwarten|zu (?:spat|fruh)|all in|alles auf eine karte|shorts?|longs?|auf (?:[^ ]+ ){1,3}setzen|setz(?:en|t|e) auf|wetten auf)(?![a-z])/
  };
  /* What Bobby never says about itself, as a phrase: that it saw, caught, tracked or followed something, in the
     first person and in any tense, that it did so for the reader, or while they were away. Tried on the folded
     text of the reply's language; the reason is `word`, as for the verbs NEXT_FORBIDDEN refuses wherever they stand
     (watched, noticed, detected). Bobby's own question does not name Bobby either. */
  var NEXT_SAW = {
    en: /(?:^| )(?:(?:i|we)(?: (?:have|ve|had|d|did|do|was|were|am|m|are|re|just|already|also|still|ever|never|not|been|kept|keep))* (?:saw|see|seen|seeing|caught|catch|catching|track|tracked|tracking|follow|followed|following|flag|flagged|flagging|spot|spotted|spotting|found|pick(?:ed|ing)? up|an eye|tabs)|(?:did|have|had|do|am|was|were) (?:i|we)(?: (?:been|just|already|ever|not|kept|keep))* (?:see|seen|saw|seeing|catch|caught|catching|track|tracked|tracking|follow|followed|following|flag|flagged|flagging|spot|spotted|spotting|find|found|pick(?:ed|ing)? up|keeping|kept)|bobby|for you|on your behalf|while you|(?:in|during) your absence)(?![a-z])/,
    es: /(?:^| )(?:vi|vimos|(?:he|hemos|habia) visto|(?:he|hemos|habia|estuve|estuvimos|estoy|estamos|estaba) (?:estado )?(?:viendo|siguiendo|rastreando|revisando)|(?:he|hemos|habia) (?:seguido|rastreado|captado|encontrado|pillado|revisado)|segui|rastree|capte|encontre|pille|bobby|por ti|para ti|por usted|para usted|por vos|para vos|en tu (?:lugar|ausencia|nombre)|mientras (?:no )?(?:estabas|estaba|dormias|dormia|tu|usted))(?![a-z])/,
    fr: /(?:^| )(?:(?:j ai|ai je|j avais|nous avons|avons nous|on a)(?: (?:deja|bien|aussi|pu|tout))? (?:vu|suivi|repere|capte|trouve|releve|scrute|garde)|je (?:vois|scrute)|bobby|pour toi|pour vous|a ta place|a votre place|en ton absence|en votre absence|pendant (?:ton|votre) absence|pendant que (?:tu|vous))(?![a-z])/,
    pt: /(?:^| )(?:vi|vimos|(?:tenho|temos|tinha|estive|estou|estamos|estava) (?:estado )?(?:visto|acompanhado|seguido|a ver|a acompanhar|a seguir|vendo|acompanhando|seguindo|de olho)|acompanhei|acompanhamos|segui|encontrei|reparei|apanhei|captei|bobby|por ti|para ti|por voce|para voce|no teu lugar|no seu lugar|na tua ausencia|na sua ausencia|enquanto (?:nao )?(?:estavas|estava|dormias|dormia|tu|voce))(?![a-z])/,
    it: /(?:^| )(?:(?:ho|abbiamo|avevo|avevamo)(?: (?:gia|appena|anche|sempre))? (?:visto|seguito|trovato|colto|tenuto|tracciato|controllato|guardato|individuato|scovato)|(?:sto|stavo|stiamo|stavamo) (?:seguendo|guardando|tenendo|tracciando|controllando|vedendo)|bobby|per te|per voi|al posto tuo|al tuo posto|in tua assenza|in vostra assenza|mentre (?:non c eri|eri|dormivi|tu|eravate))(?![a-z])/,
    de: /(?:^| )(?:(?:ich|wir) (?:[^ ]+ ){0,8}(?:gesehen|verfolgt|gefunden|erfasst|getrackt|aufgespurt|angesehen|angeschaut|im blick|im auge)|(?:sehe|verfolge|tracke|finde) ich|bobby|fur dich|fur euch|an deiner stelle|in deiner abwesenheit|wahrend du|wahrend ihr)(?![a-z])/
  };
  /* The capitals a question about a chart may carry besides the asset's own ticker: the indicators and the few market
     words written in capitals of the server's lexicon (api/_lib/desk-next-question-lexicon.ts). Any other word of two
     to five capitals, or one with an exchange suffix, is another asset's ticker. */
  var NEXT_CAPS = { EMA: 1, SMA: 1, RSI: 1, MACD: 1, ATR: 1, VWAP: 1, IFR: 1, ETF: 1, AI: 1, IA: 1, KI: 1, FED: 1, DOW: 1, DAX: 1 };
  /* A price said in words is still a price: a number word right before a money or percent word ("two hundred
     dollars", "diez por ciento", "zehn Prozent"). One table for the six languages. Articles that double as "one"
     (a, un, ein) are left out, so the dollar or a point can still be the subject of a question. */
  var NEXT_NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|half|dozen'
    + '|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|cientos|doscientos|trescientos|quinientos|mil|millon|millones|medio'
    + '|deux|trois|quatre|cinq|sept|huit|neuf|dix|onze|douze|quinze|vingt|trente|quarante|cinquante|soixante|cent|cents|mille|millions|demi'
    + '|dois|duas|quatro|sete|oito|nove|dez|doze|vinte|trinta|quarenta|cinquenta|sessenta|oitenta|cem|cento|duzentos|trezentos|quinhentos|milhao|milhoes|meio'
    + '|due|tre|quattro|cinque|sei|sette|otto|dieci|undici|dodici|quindici|venti|trenta|quaranta|cinquanta|sessanta|settanta|ottanta|novanta|duecento|mila|milione|milioni|mezzo'
    + '|zwei|drei|vier|funf|sechs|sieben|acht|neun|zehn|elf|zwolf|funfzehn|zwanzig|dreissig|dreißig|vierzig|funfzig|sechzig|siebzig|achtzig|neunzig|hundert|zweihundert|tausend|millionen|halb';
  var NEXT_UNIT_WORDS = 'dollars?|bucks?|usd|euros?|eur|cents?|pounds?|pesos?|dolar(?:es)?|reais|centavos?|centimos?|dollari|centesimi|yen'
    + '|percent|per cent|por ciento|pour cent|por cento|per cento|prozent|points?|puntos?|pontos?|punti|punkten?';
  var NEXT_SPELLED = new RegExp('(?:^| )(?:' + NEXT_NUMBER_WORDS + ')(?: (?:of|de|di|d))? (?:' + NEXT_UNIT_WORDS + ')(?![a-zß])');
  function escapeRx(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function fold(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  /** The checked question, or why it is not shown: missing · long · number · shape · asset · opener · act · word · same.
   *  `asked` is the question this read answered: Bobby never offers the same one again (a tap would loop).
   *  `name` is the asset's own name, when the reply has one: a word of it written in capitals (LVMH) is this asset. */
  function nextQuestion(raw, symbol, lang, asked, name) {
    if (typeof raw !== 'string') return { text: null, reason: 'missing' };
    var text = raw.replace(/\s+/g, ' ').trim();
    if (!text) return { text: null, reason: 'missing' };
    var n = Array.from(text).length;
    if (n > NEXT_MAX) return { text: null, reason: 'long' };
    /* No price, no level, no figure of any kind: the only digits allowed are the asset's own ticker, where it stands
       as a word of its own (PETR4.SA, and its short form PETR4). A short form that is all digits is not taken out:
       "2330" beside 2330.TW is a number like any other. */
    var sym = String(symbol || '').toUpperCase(), base = sym.split('.')[0], bare = text;
    [sym].concat(/[A-Z]/.test(base) ? [base] : []).forEach(function (s) {
      if (s) bare = bare.replace(new RegExp('(^|[^A-Za-z0-9.])' + escapeRx(s) + '(?![A-Za-z0-9])', 'g'), '$1 ');
    });
    if (/\d/.test(bare) || /[$€£¥₿₽₹%‰]/.test(text)) return { text: null, reason: 'number' };
    /* One sentence that ends in its question mark: never a statement, never a statement with a question after it. */
    if (n < NEXT_MIN || !NEXT_CHARS.test(text) || !/^¿?[^?¿]+\?$/.test(text) || sentences(text).length !== 1) return { text: null, reason: 'shape' };
    var folded = fold(text.replace(/^¿\s*/, ''));
    var spoken = folded.replace(/[^a-zßœæ0-9]+/g, ' ').trim();
    if (NEXT_SPELLED.test(spoken)) return { text: null, reason: 'number' };
    /* It is about the asset that was read, and no other. A tap asks the question about THIS read's asset (native
       reuses it), so a question that names TSLA after a read of NVDA would be answered about NVDA. */
    var own = {};
    [sym, base].concat(sym.split(/[^A-Z0-9]+/), String(name || '').toUpperCase().split(/[^A-Z0-9]+/)).forEach(function (s) { if (s) own[s] = 1; });
    var named = text.split(/[^A-Za-z0-9.]+/);
    for (var j = 0; j < named.length; j++) {
      var w = named[j].replace(/^\.+|\.+$/g, '');
      if ((/^[A-Z]{2,5}$/.test(w) || /^[A-Z][A-Z0-9]*\.[A-Z]{1,3}$/.test(w)) && !own[w] && !NEXT_CAPS[w]) return { text: null, reason: 'asset' };
    }
    var opens = NEXT_OPENS[lang2(lang)];
    if (!opens || !opens.test(folded)) return { text: null, reason: 'opener' };
    var acts = NEXT_ACTS[lang2(lang)], now = NEXT_NOW[lang2(lang)];
    if (acts && acts.test(now ? spoken.replace(now, ' ') : spoken)) return { text: null, reason: 'act' };
    var words = spoken.split(' ').filter(Boolean);
    for (var i = 0; i < words.length; i++) {
      for (var k = 0; k < NEXT_FORBIDDEN.length; k++) if (NEXT_FORBIDDEN[k].test(words[i])) return { text: null, reason: 'word' };
    }
    var saw = NEXT_SAW[lang2(lang)];
    if (saw && saw.test(spoken)) return { text: null, reason: 'word' };
    if (typeof asked === 'string' && fold(asked.replace(/\s+/g, ' ').trim().replace(/^¿\s*/, '')) === folded) return { text: null, reason: 'same' };
    return { text: text, reason: null };
  }
  /* French sets a space before the mark: it must not wrap onto a line of its own. */
  function nextLabel(text) { return String(text).replace(/ \?$/, '\u202f?'); }
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
    var timeframe = r.candlesTimeframe || r.provenance.timeframe;
    // Legacy replies lack candle metadata. Explicit mismatched horizons cannot share overlays.
    var aligned = !r.candlesTimeframe || String(r.candlesTimeframe).toUpperCase() === String(r.provenance.timeframe).toUpperCase();
    var tech = aligned ? (r.technicals || {}) : {};
    var lines = [];
    if (fin(tech.support)) lines.push({ kind: 'support', price: tech.support, label: t(lang, 'chart.support', { price: money(tech.support, lang, currency, locale) }) });
    if (fin(tech.resistance)) lines.push({ kind: 'resistance', price: tech.resistance, label: t(lang, 'chart.resistance', { price: money(tech.resistance, lang, currency, locale) }) });
    if (plan && aligned) {
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
    var lastTime = new Date(now.t);
    var asOf = fin(now.t) && !isNaN(lastTime.getTime()) ? lastTime.toISOString() : null;
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
      source: { timeframe: timeframe, provider: r.provenance.provider, instrument: r.provenance.instrument, asOf: asOf }
    };
  }

  /** Levels: the CIO's synthesis {headline, why, risk, watch} when the server sent one (strings only). */
  function synthesisOf(r) {
    var s = r && (r.synthesis || (r.agents && r.agents.synthesis));
    if (!s || typeof s.headline !== 'string' || !s.headline.trim()) return null;
    function str(v) { return typeof v === 'string' && v.trim() ? v.trim() : null; }
    return { headline: s.headline.trim(), why: str(s.why), risk: str(s.risk), watch: str(s.watch) };
  }

  function buildSpoken(r, lang) {
    var syn = synthesisOf(r);
    var picked = [], used = 0, i;
    if (syn) {
      /* SYNTHESIS FIRST: the headline and three short labeled lines; the full debate sits behind it (the debate card) */
      picked.push(clipWords(syn.headline, 240));
      [['why', syn.why], ['risk', syn.risk], ['watch', syn.watch]].forEach(function (x) {
        if (x[1]) picked.push(t(lang, 'syn.' + x[0]) + ': ' + clipWords(x[1], 200));
      });
    } else {
      /* an older server (no synthesis): the CIO, clamped to about three lines */
      var cio = sentences(r.agents.cio);
      for (i = 0; i < cio.length; i++) {
        if (picked.length && used + cio[i].length + 1 > 240) break;
        picked.push(i === 0 && cio[i].length > 240 ? clipWords(cio[i], 240) : cio[i]);
        used += cio[i].length + 1;
      }
    }
    var close = t(lang, 'spoken.close.' + r.agents.verdict);
    // NucleoVoice accepts at most 800 characters. Keep the localized verdict and
    // shorten narration only; every original synthesis line remains in the debate.
    var remaining = 800 - close.length - 1, bounded = [];
    picked.forEach(function (line) {
      if (remaining <= 0) return;
      var part = clipWords(line, remaining);
      if (part) { bounded.push(part); remaining -= part.length + 1; }
    });
    picked = bounded;
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
    var syn = r.synthesis || (r.agents && r.agents.synthesis);
    return {
      requestId: r.requestId, symbol: sym, name: r.asset.name, isEquity: !!r.asset.isEquity, question: r.question, lang: lang,
      /* the CIO's next question when it passed every check (in the reply's own language), else null */
      next: nextQuestion(syn && syn.followUp, sym, r.language || lang, r.question, r.asset.name).text,
      /* who started this read: 'person' (they asked), 'followUp' (native started it from a follow-up), 'restored' */
      origin: typeof opts.origin === 'string' && opts.origin ? opts.origin : 'person',
      /* false only when native says the next read would be refused: then no one-tap question is shown (§3.5) */
      oneTap: r.oneTap !== false,
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
        header: synthesisOf(r) ? t(lang, 'debate.full') : t(lang, 'debate.header'),
        title: t(lang, 'debate.title', { n: 3, s: fin(r.elapsedMs) ? Math.max(1, Math.round(r.elapsedMs / 1000)) : '—' }),
        entries: debateEntries(r, lang)
      },
      meta: t(lang, 'meta'),
      aria: t(lang, 'aria.verdict', { word: word }) + (ring.pct != null ? t(lang, 'aria.conviction', { pct: ring.pct }) : '')
    };
  }

  /** The debate card: the synthesis on top (when there is one), then Alpha, Red Team, the second round, the CIO,
   *  the scenarios, what data is missing for the horizon, and the evidence the desk used. Only real server text.
   *  The four voices carry `role`: one fixed line under the name saying what that voice does. */
  function debateEntries(r, lang) {
    var out = [], syn = synthesisOf(r), a = r.agents || {};
    if (syn) {
      out.push({ id: 'syn', name: t(lang, 'syn.name'), role: t(lang, 'role.syn'), hue: VERDICT[a.verdict === 'review' ? 'review' : 'wait'].color, text: syn.headline,
        lines: [['why', syn.why], ['risk', syn.risk], ['watch', syn.watch]].filter(function (x) { return x[1]; })
          .map(function (x) { return { label: t(lang, 'syn.' + x[0]), text: x[1] }; }) });
    }
    out.push({ id: 'alpha', name: t(lang, 'agent.alpha'), role: t(lang, 'role.alpha'), hue: HUES.alpha, text: a.alpha });
    out.push({ id: 'red', name: t(lang, 'agent.red'), role: t(lang, 'role.red'), hue: HUES.red, text: a.red });
    if (typeof a.rebuttal === 'string' && a.rebuttal) out.push({ id: 'rebuttal', name: t(lang, 'agent.rebuttal'), hue: HUES.alpha, text: a.rebuttal });
    out.push({ id: 'cio', name: t(lang, 'agent.cio'), role: t(lang, 'role.cio'), hue: HUES.cio, text: a.cio });
    var sc = a.scenarios;
    if (sc && typeof sc.confirm === 'string' && typeof sc.invalidate === 'string') {
      out.push({ id: 'scenarios', name: t(lang, 'agent.scenarios'), hue: '#9A5CFF', text: '',
        lines: [{ label: t(lang, 'sc.confirm'), text: sc.confirm }, { label: t(lang, 'sc.invalidate'), text: sc.invalidate }] });
    }
    var su = r.sufficiency;
    if (su && su.sufficient === false && Array.isArray(su.missing) && su.missing.length) {
      var list = su.missing.filter(function (m) { return typeof m === 'string'; }).join(', ');
      out.push({ id: 'missing', name: t(lang, 'agent.missing'), hue: 'rgba(242,237,228,.5)',
        text: HORIZONS[su.horizon] ? t(lang, 'missing.line', { h: t(lang, 'hz.' + su.horizon), list: list }) : t(lang, 'missing.lineNoH', { list: list }) });
    }
    var ev = r.evidenceUsed;
    if (ev && typeof ev === 'object') {
      var parts = (Array.isArray(ev.timeframes) ? ev.timeframes.filter(function (x) { return typeof x === 'string'; }) : []);
      if (ev.derivatives === true) parts.push(t(lang, 'ev.derivatives'));
      var rec = ev.record;
      if (rec && fin(rec.resolvedCalls) && rec.resolvedCalls > 0) parts.push(t(lang, 'ev.record', { w: fin(rec.wins) ? rec.wins : 0, n: rec.resolvedCalls }));
      if (parts.length) out.push({ id: 'evidence', name: t(lang, 'agent.evidence'), hue: 'rgba(242,237,228,.5)', text: parts.join(' · ') });
    }
    return out;
  }

  /** XP chip copy from the REAL awarded points (0 = daily cap). */
  function xpChip(points, verdictKey, lang) {
    if (!(points > 0)) return t(lang, 'xp.capped');
    return t(lang, verdictKey === 'wait' ? 'xp.pointsWait' : 'xp.points', { points: points });
  }

  /** An ISO reset time -> "October 3" / "3 de octubre" in the reader's time zone (null when unreadable). */
  function resetDay(iso, lang, locale) {
    if (typeof iso !== 'string' || !iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    try { return d.toLocaleDateString(localeFor(lang, locale), { month: 'long', day: 'numeric' }); } catch (e) { return null; }
  }

  /** Non-ok replies -> caption + chips. Never a verdict, never XP.
   *  Metered-read refusals (ARCHITECTURE.md §8.3) carry a native `token` that re-asks the same question:
   *  it rides in `retry` (never `token`), so a chip can only re-ask AFTER the sign-in or the purchase. */
  function failure(r, lang, opts) {
    opts = opts || {};
    var locale = localeFor(lang, opts.locale === undefined ? (r && r.locale) : opts.locale);
    lang = lang2(lang);
    switch (r && r.status) {
      case 'signin_required':
        return { kind: 'signin', caption: typeof r.caption === 'string' && r.caption ? r.caption : t(lang, 'gate.signin'), sub: null, access: r.access || null,
          chips: [{ label: t(lang, 'gate.signinCta'), action: { signIn: true, retry: r.token || null }, primary: true, style: 'apple' },
            { label: t(lang, 'gate.notNow'), action: { dismiss: true } }] };
      case 'subscription_required':
        var day = resetDay(r.access && r.access.resetsAt, lang, locale);
        /* a level refusal (upgrade_required) carries native's own line, chip ("Invite a friend") and a lower-level fallback */
        var proChips = [{ label: typeof r.cta === 'string' ? r.cta : t(lang, 'gate.proCta'), action: { paywall: true, retry: r.token || null }, primary: true, style: 'pro' }];
        if (r.fallback && typeof r.fallback.label === 'string' && r.fallback.token) proChips.push({ label: r.fallback.label, action: { token: r.fallback.token } });
        proChips.push({ label: t(lang, 'gate.notNow'), action: { dismiss: true } });
        return { kind: 'subscription',
          caption: typeof r.caption === 'string' ? r.caption : t(lang, 'gate.pro'),
          sub: typeof r.sub === 'string' ? r.sub : day ? t(lang, 'gate.proResets', { date: day }) : t(lang, 'gate.proNoDate'),
          access: r.access || null, chips: proChips };
      case 'level_notice':
        return { kind: 'level', caption: r.caption || '', sub: r.sub || null,
          chips: [{ label: r.cta || '', action: { token: r.token }, primary: true }, { label: t(lang, 'gate.notNow'), action: { dismiss: true } }] };
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
        /* a read that failed after its asset was known carries a native `retry` token: the same question, one tap */
        var retry = typeof r.retry === 'string' && r.retry ? [{ label: t(lang, 'err.retry'), action: { token: r.retry }, primary: true },
          { label: t(lang, 'gate.notNow'), action: { dismiss: true } }] : [];
        return { kind: 'error', code: r.code, caption: t(lang, key), sub: null, chips: retry };
      default:
        return { kind: 'error', code: 'bad_reply', caption: t(lang, 'err.bad'), sub: null, chips: [] };
    }
  }

  /** The chips of a read (§3.5), three at most, at hand-back and again after a save: the CIO's next question when the
   *  model carries one (asked, on a tap, as a follow-up of this read), "Another question about {SYM}" (the person types
   *  it), then REAL symbols from suggestions(): the person's quick access first, the day's movers only in a slot quick
   *  access left empty, never the current symbol. A read the person did not start by themselves (a follow-up, a restored
   *  page) never gets a mover or a starter asset: its chips are about their own question and their own assets.
   *  When native says the next read would be refused (`oneTap: false`) every one-tap question goes: what is left is
   *  "Another question", which asks nothing until the person has typed it. */
  function followUps(model, sugg, lang, opts) {
    lang = lang2(lang); opts = opts || {};
    var sym = String(model.symbol || '').toUpperCase(), out = [], oneTap = model.oneTap !== false;
    if (oneTap && typeof model.next === 'string' && model.next && model.requestId) {
      out.push({ label: nextLabel(model.next), style: 'ask', action: { followUpOf: model.requestId, question: model.next, symbol: sym, next: true } });
    }
    out.push({ label: t(lang, 'follow.another', { symbol: sym }), action: { followUpOf: model.requestId, symbol: sym } });
    if (!oneTap) return out;
    var seen = {}; seen[sym] = 1;
    var own = model.origin != null && model.origin !== 'person';
    var qa = (sugg && sugg.quickAccess) || [], mv = own ? [] : ((sugg && sugg.movers) || []);
    /* native marks the starters that only pad quick access (`own: false`): they are not the person's assets either */
    if (own) qa = qa.filter(function (s) { return !s || s.own !== false; });
    qa.map(function (s) { return { s: s, kind: 'quick' }; }).concat(mv.map(function (s) { return { s: s, kind: 'mover' }; })).forEach(function (x) {
      var s = String(x.s && x.s.symbol || '').toUpperCase();
      if (out.length >= 3 || !/^[A-Z0-9.^=-]{1,20}$/.test(s) || seen[s]) return;
      seen[s] = 1;
      var q = t(lang, x.kind === 'mover' && opts.whyForMovers ? 'follow.why' : 'follow.how', { symbol: s });
      out.push({ label: q, action: { question: q, symbol: s } });
    });
    return out;
  }

  /** Original explanation stored on this device. Old ledger rows keep their thesis fields without a made-up debate. */
  function savedThesisDebate(th, lang) {
    var a = th.agents && typeof th.agents === 'object' ? th.agents : {};
    var stored = { verdict: th.verdict };
    ['alpha', 'red', 'cio', 'rebuttal'].forEach(function (key) {
      if (typeof a[key] === 'string' && a[key].trim()) stored[key] = a[key];
    });
    var sc = a.scenarios;
    if (sc && typeof sc.confirm === 'string' && sc.confirm.trim() && typeof sc.invalidate === 'string' && sc.invalidate.trim()) {
      stored.scenarios = { confirm: sc.confirm, invalidate: sc.invalidate };
    }
    var syn = synthesisOf(th) || synthesisOf({ agents: a });
    var entries = debateEntries({ agents: stored, synthesis: syn }, lang).filter(function (entry) {
      return (typeof entry.text === 'string' && entry.text.trim()) || (entry.lines && entry.lines.length);
    });
    return entries.length ? { header: t(lang, 'debate.header'), title: String(th.symbol || ''), entries: entries } : null;
  }

  /** A saved ledger Thesis (§2.7) -> read-only cards, the ghost satellite and the Theses face. */
  function thesisView(th, lang, opts) {
    var currency = currencyOf(th);
    opts = opts || {};
    var locale = localeFor(lang, opts.locale);
    lang = lang2(lang);
    var v = th.verdict === 'review' ? 'review' : 'wait', sym = String(th.symbol || '');
    var source = {
      provider: typeof th.provider === 'string' && th.provider.trim() ? th.provider : null,
      asOf: typeof th.asOf === 'string' && th.asOf.trim() ? th.asOf : null
    };
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
      asOf: source.asOf,
      source: source,
      meta: [t(lang, 'meta'), source.provider, source.asOf].filter(Boolean).join(' · '),
      debate: savedThesisDebate(th, lang)
    };
  }

  root.NucleoReadModel = {
    v: 1, STRINGS: S, HUES: HUES, VERDICT: VERDICT,
    t: t, money: money, signedPct: signedPct, currencyOf: currencyOf,
    sentences: sentences, firstSentence: firstSentence, clipWords: clipWords,
    syllables: syllables, wordTimes: wordTimes,
    build: build, failure: failure, resetDay: resetDay, xpChip: xpChip, followUps: followUps, thesisView: thesisView,
    nextQuestion: nextQuestion, NEXT: { min: NEXT_MIN, max: NEXT_MAX, opens: NEXT_OPENS, forbidden: NEXT_FORBIDDEN, acts: NEXT_ACTS, spelled: NEXT_SPELLED, saw: NEXT_SAW, caps: NEXT_CAPS },
    _internal: { pulseAgrees: pulseAgrees, planOf: planOf, closedVolumeRatio: closedVolumeRatio, niceStep: niceStep }
  };
})(typeof window !== 'undefined' ? window : globalThis);
