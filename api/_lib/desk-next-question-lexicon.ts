// The words a next question may be written with, per reply language. api/_lib/desk-next-question.ts reads this
// last: a question that passed every other rule is still refused when it holds a word that is not here.
//
// Why a list of what is allowed, after lists of what is not: the rule is "what happened, why, or what would
// change this read", and the ways to ask whether or when to act are not a finite list (own, grab, snag, pocket,
// tomar, pegar, zugreifen…). The vocabulary of a question about a chart, a trend or an event is small. So a verb
// of acting passes only if someone wrote it down here by mistake, not because nobody thought of refusing it.
//
// What is in: the function words of each language, the nouns and adjectives of price, chart, trend, event and
// the read itself, and verbs that describe (confirm, change, fall, show, explain) in the forms that describe:
// third person, past, conditional, participle, infinitive. What is left out on purpose:
//   · every verb of entering, taking, keeping or getting rid of, and "do" as something a person does;
//   · the first and second person (no "tomamos", no "prenons", no "nehmen wir");
//   · the future tense and its auxiliaries (will, va a, vai, wird): a next question does not presuppose a move;
//   · words of quality and occasion (best, right, good, ideal, smart), the days of the week, tomorrow;
//   · people as a subject (someone, quien, chi, wer) and every proper name but a few market ones;
//   · "only" and "just" and their kin ("it has only begun", "solo puede…", "nur noch…").
// Everything is written folded, as the check reads it: lower case, no accents, ß as ss, œ as oe.
//
// The cost is known and accepted: an ordinary question with a word nobody listed costs the chip (the fixed
// question is served). scripts/test-desk-levels.mts holds, per language, the ordinary questions that must pass.
//
// The second pass (2026-10-08). In its first hour in production the list refused three English questions of
// three. Measured on a sample written blind (scripts/fixtures/next-question-ordinary.json, 183 to 197 ordinary
// questions per language in the vocabulary an analyst model uses) it served 32% to 47%. The lists marked
// "second pass" below are what that sample and two later batches needed, and the families around them: adverbs,
// the adjectives of a read (specific, complete, unclear, intact), the nouns of evidence, of reasoning and of a
// market (technicals, fundamentals, relationship, rotation, dominance, uncertainty), sectors, regions, currencies
// and commodities, the parts of the day that are past or present (morning, overnight; never tomorrow), and
// describing verbs in the forms that describe.
//
// What the pass did not change, and the numbers say so: this is still a list of what is allowed, and an ordinary
// question in words nobody listed still costs the chip. Each batch written after the list had been widened for
// the one before was served, at first, at 53% to 88%, then 47% to 63%, then 45% to 55% (the fixture's
// `firstPass`). The last batch is kept as a holdout the list was not widened for; the test prints its rate. No
// number of words added from samples closes that: what the production models write is the only measure, and
// their questions are not logged.
//
// Decided case by case, and why. A word that is innocent in a chart question and guilty in another is never
// listed bare: it is allowed only in a named company, by a rule in desk-next-question.ts (LISTED_RUNS, NEUTRAL).
//   · action: only "price action" and "sideways action". "What action…" asks what to do.
//   · best, better (mejor, mieux, melhor, meglio, besten, besser): only beside a describing verb ("which
//     indicator best explains…", "explica mejor", "erklärt … am besten") or behind a verb of holding up ("holding
//     up better than", "resiste mejor que", "hält sich besser als"). "The best way to…", "the best day", "the best
//     stock" and "which is better than BTC?" stay refused.
//   · options, sense: not listed bare. "What options make sense for BTC?" asks what to do. English "options"
//     passes only as the derivatives market ("options expiry", "options data").
//   · good, bad (buenos, bons, bom, buona, guter): only before results, earnings, news, numbers or data.
//   · play (juegan, jouent): only with "role". "The play on BTC" stays refused, and is pinned in the tests.
//   · pick: only "pick up" with no object behind it ("why did volume pick up overnight?"). "Pick up BTC" and
//     "the pick" stay refused.
//   · bound: only "range-bound". "Bound to…" is a forecast and stays a forbidden run.
//   · flip: only a read, a trend or a bias that flips. To flip a stock is to trade it.
//   · open, close, long, short, hold: unchanged. English "open" and "close" describe a session and are refused
//     with the asset as their object; "long" and "short" pass only before "term"; "holding" only where the asset
//     or its price holds a level. In the other five languages "open interest" passes as a phrase only.
//   · position, entry, exit, target, opportunity, attractive, cheap: not listed, and on the act lists.
//   · liquidations (liquidaciones, liquidations, liquidações, liquidazioni): the plural, which is what happened
//     to a derivatives market. The singular and every form of the verb stay out: to liquidate is to act.
//   · valuation (valuación, valorisation, valuation, valutazione, Bewertung): listed, as the name of a kind of
//     evidence. The judgements stay refused: cheap, expensive, undervalued, overvalued, attractive, fair.
//   · confidence, conviction: listed as nouns of the read ("why is confidence in the uptrend limited?").
//     Confident, sure and certain stay out.
//   · loss, losses (pérdida, perte, perda, perdita, Verlust): listed, a price that fell or momentum that went.
//     "Stop loss" stays an act phrase. The other side stays forbidden: gains, and so gain, gaining, gana, gagne,
//     ganha, guadagna, gewinnt are not listed either ("gaining ground" costs the chip).
//   · interest (interés, intérêt, interesse, Interesse): listed for interest rates, open interest and "renewed
//     interest in…".
//   · return, returning, rinde: not listed. Returns is a forbidden family.
//   · attract, attracted: not listed. It is the verb of "attractive", an act word.
//   · dejar, deixar, lassen and their forms: not listed. To leave or let go is on the owner's list of acts.
//   · assess, judge (evaluar, valorar, évaluer, avaliar, valutare): listed. To read a chart is not to act, as
//     with explain, interpret and understand. "The best way to assess…" is still refused by "best".
//   · considered (considera, considérée, considerada, considerato, gilt): the passive that reports a view.
//     "Consider" is not listed: "what to consider" is put to the reader.
//   · trades (cotiza, negocia, scambia, notiert): the third person that says where a price is. The infinitives
//     of Portuguese and Italian, which also mean to trade it, are not listed.
//   · cautious (cautelosa, prudente, vorsichtig): describes the read or the market. English "prudent" and
//     "sensible" are the wise thing to do and stay act words, in English only.
//   · morning, night, overnight: listed. Spanish "mañana" passes only after "esta" or "la", German "Morgen"
//     only after "heute" or "am": alone they are tomorrow.
//   · rend, rende (French rendre, Italian rendere, "to make"): listed. They are not the forbidden nouns
//     rendement and rendimento, and what they make of the asset still has to be a listed word.
//   · reliable (confiable, fiable, confiável, affidabile, verlässlich): only of a read, a picture or an indicator
//     ("the most reliable read", "la lectura más confiable"). "Why is BTC a reliable asset?" calls it safe.
//   · interés, intérêt, interesse in Spanish, French, Portuguese and Italian: only as rates, open interest or the
//     market's interest ("tipos de interés", "regain d’intérêt pour…", "interesse renovado em…"). "¿Qué interés
//     tiene BTC?" and "Quel est l’intérêt de BTC ?" ask what the point of it is, and stay refused.
//   · da, donne, offre, liefert (gives, offers, delivers): only a timeframe that gives a read ("da la lectura",
//     "liefert das Bild"). "Was liefert BTC?" and "Cosa offre BTC?" ask what it pays.
//   · valor, valeur in the singular: not listed ("¿Qué valor tiene BTC?" asks what it is worth). The plurals are
//     other stocks ("otros valores", "les autres valeurs").
//   · convertir, retourner, basculer, orienter, staccarsi: not listed as infinitives, which with a preposition
//     move money into or out of the asset ("basculer sur BTC"). Their describing forms are, and "basculer" and
//     "staccarsi" pass in the one construction where the read or another asset is what moves.
//   · hold: English "hold" stays an act word. It passes only where a breakout, a level or a trend is what holds
//     ("for NVDA's breakout to hold", "why did support not hold?"), by a rule in the check.
//   · time: English "time" only as "this time", "over time", "each time". "The time for…" is timing, and is
//     pinned in the tests. Spanish "tiempo" and Italian "tempo" are not listed for the same reason.
//   · getting: only before a comparative ("getting smaller"). To get it is to take it.
//   · decide, entscheiden, se séparer, sich trennen, aguantar: not listed outside English. With a group as their
//     subject they report someone choosing, keeping or parting with the asset.
//   · afternoon, evening, soir: not listed. "This evening" is as often ahead as behind.
//   · btc, eth: listed for every asset, as Bitcoin and Ethereum already were, so a comparison with either is a
//     question about a market. Every other ticker and name is still an unknown word.
import type { AppLanguage } from '../../src/lib/app-language.js';

const list = (text: string) => text.trim().split(/\s+/);
/** Each stem with each ending: "confirm" × ["", "s", "ed", "ing"]. */
const forms = (stems: string, endings: readonly string[]) => list(stems).flatMap(stem => endings.map(end => stem + end));

// ---------- English ----------
const EN_VERBS = `confirm weaken strengthen support break fail climb slip jump rebound recover turn stall slow cool stay remain extend stretch push pull lift weigh help fuel trigger lead outperform underperform show suggest
  point reflect explain mean matter happen look seem appear need follow react respond reach touch test retest reclaim clear cross open stand hover form build grow shrink widen narrow expand contract tighten differ depend
  expect doubt fear overlook work start end defend reject respect limit absorb persist deepen fill
  reveal flatten disagree agree affect contradict distinguish spark assess lack compress
  link connect contrast disappear vanish surprise disappoint exceed publish treat approach meet trail track mirror align drift retreat slump soar firm soften loosen unfold develop revisit perform allow prevent block
  boost act fit match`;
/** Written without their final e: "invalidat" is invalidate, invalidates, invalidated, invalidating. */
const EN_VERBS_E = `invalidat chang mov driv ris clos caus continu resum pressur indicat consolidat compar bounc surg spik slid revers fad los mak struggl accelerat eas declin pric ignor underestimat stabiliz rang shap
  produc reduc increas decreas improv argu creat defin describ requir involv
  diverg influenc deteriorat separat paus challeng summariz includ hid judg advanc
  relat rais announc releas decid fluctuat hesitat generat behav outpac tumbl plung eras wan emerg evolv retrac ti
  surviv concentrat serv prov assum`;
// Second pass (see the head of this file): what an analyst's ordinary question is written with.
const EN_MORE = `closely strongly unusually typically historically relatively broadly notably roughly
  relative specific additional complete incomplete inconclusive conclusive unclear uncertain undecided intact renewed compressed elevated muted choppy tight tighter stuck obsolete relevant primary
  underlying conflicting contradictory historical cautious resilient sensitive significant consistent persistent gradual abrupt orderly hidden
  technicals fundamentals significance relationship correlation loss losses wave waves attempt attempts recovery resilience dominance altcoin altcoins steam activity chain onchain profile rotation curve breadth
  development developments concern concerns confidence conviction situation attention behavior behaviour information indication indications reasoning counterargument valuation valuations uncertainty
  ones morning overnight night
  japanese european american asian chinese global regional domestic
  auto autos automaker automakers luxury retail banking financials industrials consumer healthcare pharma miners utilities insurers airlines chipmakers
  yen euro currency currencies commodity commodities copper silver gas liquidations btc eth
  dried based used trending trended shifted shifting considered clarify clarifies clarified clearest chip
  little few several various multiple multiples particular general common rare frequent repeated combined independent unrelated correlated uncorrelated divergent
  barely hardly slightly somewhat significantly considerably particularly especially generally normally constantly repeatedly consistently gradually briefly initially previously originally increasingly widely directly heavily
  nervous calm active crowded fresh initial final full partial modest moderate mild severe deep deeper shallow steep steeper rapid aggressive defensive cyclical seasonal structural local external direct indirect visible obvious apparent notable
  surprising disappointing concerning supportive constructive
  difficulty decision decisions progress improvement deterioration slowdown acceleration origin source sources consequence consequences connection connections comparison contrast balance imbalance barrier barriers delay delays
  optimism pessimism caution enthusiasm panic euphoria nervousness appetite aversion hesitation indecision stability instability tension tensions stress noise clarity absence presence mix combination sequence series majority minority portion performance
  cost costs debt spending production delivery deliveries subscribers users advertising jobs employment labor unemployment housing manufacturing services recession stimulus central government election elections war conflict sanctions tax taxes budget deficit shutdown
  geopolitical geopolitics politics political regulatory regulators lawsuit ruling court approval ban export exports import imports
  stablecoin stablecoins mining hashrate exchanges issuance unlock unlocks fork protocol defi spot futures derivatives expiry perpetual
  wedge triangle flag pennant shoulders bollinger band bands fibonacci golden death overhead midpoint pivot squeeze compression expansion exhaustion capitulation distribution rejection acceptance failure fakeout shakeout premarket
  usa china europe japan germany asia america ecb
  find finds found finding beat beats cut cuts cutting sit sits sitting sink sinks sank sinking sunk dry dries occur occurs occurred occurring vary varies varied
  topped bottomed topping bottoming peaked peaking rallied rallying gapped gapping dipped dipping swung swinging lowered lowering reported reporting launched viewed viewing lasted lasts tied
  carries carried imply implies implied implying identify identifies identified become becomes became becoming ran running convincing unconvincing obstacle obstacles hurdle hurdles
  narrower narrowest calmer quieter cleaner flatter thinner thicker looser steadier choppier noisier milder softer closer nearer farther worse greater lesser fewer harder easier riskier
  place form size scale degree extent count height length depth width distance frequency duration continuity consistency quality nature character feature features aspect aspects element elements detail details fact facts issue issues
  problem problems explanation explanations interpretation interpretations assumption assumptions implication implications meaning logic theory example examples instance instances precedent precedents parallel parallels
  exception exceptions rule rules tendency habit threat threats shock shocks burst bout round leg legs middle edge
  able unable hard difficult complex slight substantial considerable meaningful marginal minimal total net equal uneven smooth clean messy noisy erratic random stubborn sticky permanent brief prolonged ongoing successful unconfirmed
  valid invalid true false genuine fake actual unexpected known unknown abnormal classic
  fairly otherwise however though although whether unless whereas meanwhile finally rapidly weakly fully partially entirely completely primarily specifically precisely upwards downwards alone elsewhere`;
const EN = new Set([
  ...list(`a an the of in on for at by from with without about into over under above below between through during after before since until near around against across behind beyond within inside outside
    toward towards off out up down to as than then so such still yet already again also even more most less least very too much many per via versus vs like unlike despite because due instead rather else itself
    and or but both either neither nor each every all any some other another same different
    is are was were be been being isn aren wasn weren do does did doesn didn don has have had hasn haven hadn would could might can may wouldn couldn cannot
    not no nothing something anything everything what why which how if when where while that this these those it its their there here they them s t
    now today currently recently lately yesterday back away apart together along ahead further first far once ever never always often usually sometimes really actually exactly mostly mainly largely partly quite almost nearly well way kind sort type thing things lot
    day days week weeks month months quarter quarters year years session sessions hour hours daily weekly monthly hourly yearly quarterly intraday annual next last past recent latest previous prior coming current earlier later longer shorter mid medium
    earnings guidance revenue margins growth news data evidence economy macro dollar inflation policy regulation etf etfs adoption network upgrade halving crypto ai chips competition fed nasdaq dow bitcoin ethereum
    funding interest liquidity support resistance ema sma rsi macd atr vwap fear greed history analysis weaknesses rallies companies theses indices semiconductor semiconductors tech technology software hardware cloud energy oil gold tariffs
    bullish bearish neutral strong stronger strongest weak weaker weakest high higher highest low lower lowest big bigger biggest large larger largest small smaller main key important major minor real clear clearer solid fragile
    stable unstable flat sideways overbought oversold extended overextended stretched technical fundamental broad broader wide wider new old likely unlikely possible enough missing mixed healthy sustainable temporary
    sudden sharp sharper steady slow slower fast faster quick volatile quiet heavy light thin typical unusual normal usual similar opposite positive negative upward downward downside lasting durable whole entire overall
    quickly slowly sharply steadily suddenly simply
    broke broken fell fallen falling rose risen drove driven meant told tell tells telling said says say saying led grew grown built hit hits hitting hurt hurts hurting lag lags lagged lagging drag drags dragged dragging
    dropped dropping stopped stopping began begun begin begins beginning see sees saw seen seeing went gone came come comes coming lost made slid kept keeps holds held holding trades traded trading
    capped caps relies relied rely worried worries worry worrying miss misses missed set sets give gives gave given bring brings brought send sends sent`),
  ...list(EN_MORE),
  ...forms(`asset stock share price market sector index coin token company business trend uptrend downtrend chart candle candlestick pattern level zone area range channel line trendline breakout breakdown pullback bounce rebound
    drop decline fall rise move movement swing dip surge spike correction reversal continuation consolidation retracement retest rally momentum volume volatility strength weakness pressure demand supply sentiment mood
    inflow outflow flow average indicator oscillator divergence crossover high low peak bottom top floor ceiling gap timeframe frame horizon term report result number figure estimate expectation headline event catalyst
    announcement rate yield bond investor trader analyst bull bear institution fund participant read thesis case view picture story narrative scenario setup idea bias outlook reading verdict conclusion argument question
    answer reason cause driver factor risk condition sign change shift difference product launch competitor record structure base wick cycle phase stage streak run reaction response context backdrop headwind tailwind
    peer rival customer point side direction path course pace speed effect impact weight role part piece bank tariff chance rest`, ['', 's']),
  ...forms(EN_VERBS, ['', 's', 'ed', 'ing']),
  ...forms(EN_VERBS_E, ['e', 'es', 'ed', 'ing']),
  ...forms('reach touch cross miss stretch distinguish compress assess match', ['es']),
]);

// ---------- Spanish ----------
const ES_AR = ['ar', 'a', 'an', 'aba', 'aban', 'o', 'aron', 'aria', 'arian', 'e', 'en', 'ase', 'asen', 'ado', 'ada', 'ados', 'adas', 'ando'];
const ES_ER = ['er', 'e', 'en', 'ia', 'ian', 'io', 'ieron', 'eria', 'erian', 'a', 'an', 'iera', 'ieran', 'iese', 'iesen', 'ido', 'ida', 'idos', 'idas', 'iendo'];
const ES_IR = ['ir', 'e', 'en', 'ia', 'ian', 'io', 'ieron', 'iria', 'irian', 'a', 'an', 'iera', 'ieran', 'iese', 'iesen', 'ido', 'ida', 'idos', 'idas', 'iendo'];
// Second pass (see the head of this file).
const ES_MORE = `frente fondo parte partes punto puntos vez veces ola olas perfil intento intentos relacion correlacion fortaleza recuperacion rotacion dominancia actividad cadena comportamiento situacion impacto atencion
  confianza conviccion valuacion valoracion valores bolsa bolsas papel terreno fondeo financiamiento financiacion liquidaciones altcoin altcoins criptomoneda criptomonedas lecturas perdida perdidas
  noche madrugada plazos pares
  estrecho estrecha relativo relativa erratico erratica cercano cercana comprimido comprimida intacto intacta renovado renovada pleno plena concreto concreta concretos concretas adicional adicionales
  completo completa incompleto incompleta concluyente cauteloso cautelosa obsoleto obsoleta mixtos mixtas bruscos bruscas bajos quieto quieta abierto abierta horaria horarias horarios elevado elevada evidente
  incierto incierta indefinido indefinida regular irregular historico historica historicos historicas relevante relevantes especifico especifica sensible sensibles
  japones japonesa europeo europea europeos europeas estadounidense estadounidenses asiatico asiatica chino china global mundial regional local
  lujo petroleo banco bancos banca automotriz automotrices tecnologico tecnologica tecnologicos tecnologicas tecnologia mineral hierro oro plata cobre gas energia consumo salud yen euro divisa divisas
  parezca parezcan suele suelen solia volvio volvieron vuelva vuelvan pone ponen pondria pondrian puso detuvo detiene detienen luce lucen
  influyendo influyo influir influido considera consideran considerado considerada incluir incluye incluyen incluiria contradice contradicen convertiria convertirian descrito descrita
  aplanarse definirse consolidarse recuperarse estabilizarse debilitarse fortalecerse agotarse estancarse frenarse
  sobrecompra sobreventa onchain funding rally breakout pullback btc eth
  pocos pocas varios varias demasiado apenas bastante especialmente particularmente generalmente normalmente constantemente ligeramente levemente fuertemente bruscamente rapidamente lentamente gradualmente nuevamente repentinamente
  significativamente notablemente precisamente exactamente directamente inicialmente anteriormente previamente historicamente tipicamente habitualmente relativamente lateralmente pese
  lado propio propia motivo motivos incertidumbre dudas dificultad dificultades decision decisiones progreso avance avances mejoras deterioro incremento disminucion desaceleracion aceleracion inicio comienzo final fin origen fuente fuentes
  consecuencia consecuencias efecto efectos resultado influencia conexion vinculo comparacion contraste equilibrio desequilibrio limite limites barrera barreras pausas retraso sorpresa sorpresas decepcion optimismo pesimismo cautela entusiasmo
  panico euforia nerviosismo calma apetito aversion indecision estabilidad inestabilidad tension tensiones ruido claridad ausencia presencia mezcla combinacion secuencia serie mayoria proporcion peso importancia lugar ritmo velocidad
  tamano magnitud grado tipo clase forma formas manera modo sentido direccion camino paso pasos tramo tramos periodo periodos semestre margen
  software hardware nube costos costes gastos deuda produccion entregas suscriptores usuarios publicidad pedidos fusion multa regulador reguladores gobierno eleccion elecciones guerra conflicto sanciones aranceles impuestos empleo desempleo
  recesion estimulo deficit presupuesto geopolitica geopolitico geopolitica politico politicos politicas regulatorio regulatoria aprobacion prohibicion central centrales reserva federal bce
  stablecoin stablecoins mineria mineros exchange exchanges suministro emision desbloqueo desbloqueos actualizacion bifurcacion protocolo defi spot contado futuros derivados vencimiento
  cuna triangulo bandera banderin hombro hombros cabeza bollinger banda bandas fibonacci dorado muerte pivote compresion expansion agotamiento capitulacion distribucion fallo deriva falso falsa mecha mechas cuerpo apertura
  atrapado atrapada positivos positivas negativos negativas prudente prudentes nervioso nerviosa tranquila activa inicial iniciales finales total totales parcial parciales modesto modesta moderado moderada leve leves severo severa
  profundo profunda superficial pronunciado pronunciada suave suaves agresivo agresiva defensivo defensiva ciclico ciclica estacional estructural externo externa interno interna directo directa indirecto indirecta visible visibles
  obvio obvia aparente aparentes notable notables sorprendente decepcionante preocupante comun comunes raro rara frecuente frecuentes repetido repetida multiple multiples diversos diversas particular combinado combinada independiente
  correlacionado correlacionada divergente semejante igual iguales pequenos pequenas largas cortas nuevos nuevas claros claras elevados elevadas
  estados unidos usa china europa japon asia mexico brasil
  revierte revierten revirtio revierta reviertan revertir revertiria aporta aportan aportaria considerar moverse encuentra encuentran encontro extiende extienden tiende tienden proviene provienen
  atribuye atribuyen repite repiten refiere refieren difiere difieren corrige corrigen corrigio corrigiendo
  sostenga sostengan sostenerse sostenido sostenida seguido seguida reduciendo redujo reducido reducida reducir rangos sirve sirven sirvio actua actuan actuo supone suponen supuso demuestra demuestran demostro
  convincente convincentes obstaculo obstaculos continuidad escaso escasa escasos escasas frecuencia distancia duracion cantidad calidad naturaleza caracter aspecto aspectos elemento elementos detalle detalles hechos problema problemas
  explicacion explicaciones interpretacion interpretaciones supuesto supuestos implicacion implicaciones significado logica teoria ejemplo ejemplos precedente precedentes excepcion regla habito reto retos desafio desafios amenaza amenazas
  golpe borde extremo extremos centro estrechos estrechas amplios amplias ligera dificil dificiles complejo compleja capaz capaces incapaz neto neta desigual limpio limpia aleatorio ordenado ordenada persistente persistentes permanente
  breve breves prolongado prolongada continuo continua fallido fallida invalido verdadero verdadera genuino esperado esperada inesperado inesperada conocido conocida desconocido desconocida anormal clasico clasica
  menudo siempre nunca tampoco incluso sino aunque salvo excepto finalmente completamente parcialmente principalmente especificamente simplemente juntos`;
const ES = new Set([
  ...list(ES_MORE),
  ...list(`el la los las lo un una unos unas de del al a en con sin para por sobre entre hasta desde hacia tras ante bajo durante segun contra que cual cuales como si cuando donde mientras porque pues y o pero ni no
    es son esta estan este esto estos estas ese esa eso esos esas su sus se le les hay ha han habia habria haya fue fueron era eran sea sean seria serian ser sido siendo estar estaba estaban estaria estuvo esten
    tiene tienen tenia tendria tendrian tenga tuvo tener puede pueden podria podrian pudo pueda poder debe deben
    mas menos muy tan tanto tanta tantos poco poca mucho mucha muchos tambien ya aun todavia ahora hoy ayer recientemente ultimamente actualmente aqui ahi alli asi bien mal casi antes despues luego entonces
    cada todo toda todos todas otro otra otros otras mismo misma algun alguna algunos algunas ningun ninguna nada algo ademas realmente justo
    semana semanas mes meses trimestre ano anos dia dias sesion sesiones jornada hora horas diario diaria diarios diarias semanal semanales mensual mensuales anual intradia horario
    proximo proxima proximos proximas ultimo ultima ultimos ultimas pasado pasada reciente recientes actual actuales anterior anteriores siguiente siguientes plazo corto largo mediano medio cortos largos larga
    activo accion acciones precio precios mercado mercados sector indice cripto moneda token empresa compania negocio tendencia tendencias grafico graficos grafica graficas vela velas patron patrones nivel niveles
    zona zonas rango canal linea lineas ruptura rupturas quiebre rompimiento retroceso retrocesos rebote rebotes repunte subida subidas alza alzas caida caidas bajada movimiento movimientos impulso correccion correcciones
    giro reversion continuacion consolidacion lateralizacion momentum volumen volatilidad fuerza debilidad presion demanda oferta liquidez sentimiento animo flujo flujos media medias movil moviles promedio promedios
    indicador indicadores oscilador divergencia cruce maximo maximos minimo minimos techo suelo piso tope brecha hueco marco temporalidad temporalidades horizonte resultados reporte reportes informe guia ingresos margenes
    crecimiento perspectiva perspectivas panorama pronostico estimaciones expectativas noticias noticia titulares evento eventos catalizador catalizadores anuncio datos dato evidencia cifras numeros tasa tasas tipos
    inflacion economia macro dolar bonos politica regulacion etf adopcion red halving inversionistas inversores traders analistas toros osos instituciones fondos participantes lectura tesis caso vision imagen historia
    narrativa escenario escenarios setup idea sesgo analisis veredicto conclusion argumento argumentos pregunta respuesta razon razones causa causas motor motores factor factores riesgo riesgos condicion condiciones
    signo signos confirmacion invalidacion cambio cambios diferencia soporte soportes resistencia resistencias ema sma rsi macd atr miedo codicia estructura base ciclo fase etapa racha reaccion contexto fed nasdaq
    bitcoin ethereum ia chips competencia producto productos lanzamiento
    alcista alcistas bajista bajistas neutral neutro lateral fuerte fuertes debil debiles alto alta altos altas baja bajas mayor mayores menor menores grande grandes pequeno pequena principal principales clave
    importante importantes real reales claro clara solido solida solidos solidas fragil estable inestable plano sobrecomprado sobrecomprada sobrevendido sobrevendida extendido extendida tecnico tecnica tecnicos tecnicas
    fundamental fundamentales amplio amplia nuevo nueva viejo probable improbable posible suficiente mixto mixta sano sana sostenible temporal repentino repentina brusco brusca firme constante lento lenta rapido rapida
    volatil tranquilo pesado ligero tipico inusual normal habitual similar opuesto positivo positiva negativo negativa distinto distinta diferente diferentes general arriba abajo encima debajo detras delante cerca lejos
    fuera dentro primero primera atras resto
    cae caen caia cayo caeria caiga cayera caido cayendo caer hace hacen hizo haria harian haga hiciera hecho haciendo hacer ve ven veia vio veria vea visto viendo ver
    dice dicen decia dijo diria diga dicho diciendo decir viene vienen venia vino vendria venga venir sigue siguen seguia seguiria siga siguio seguir siguiendo
    mantiene mantienen mantendria mantuvo mantenga sostiene sostienen sostendria sostuvo sugiere sugieren sugeriria influye influyen influiria contribuye contribuyen impide impiden impediria reduce reducen reduciria
    produce producen vuelve vuelven volveria volver vuelto cierra cierran cerraria cerrar cerro cierre lee leen leer leyo leido alcance toque llegue empieza empiezan prueba prueban`),
  ...forms(`confirm invalid cambi debilit rebot recuper gir fren paus continu extend empuj presion impuls arrastr pes afect ayud provoc caus lider rezag super mostr muestr indic apunt reflej explic import pas necesit
    reaccion alcanz toc prob cruz form aument agot acab empez termin dur signific falt qued respald apoy limit rechaz respet preocup dud lleg acerc alej estanc desaceler aceler empeor marc fall logr gener domin
    cotiz llev deton oblig compar compens anul valid reforz interpret
    separ consolid revel choc sec deterior desat dispar implic aclar evalu valor bas llam acompan mejor aplan transform modific
    conect vincul relacion contrast apag avanz batall atrap decepcion anunci public report present lanz vari oscil fluctu titube estabiliz normaliz origin deriv result represent destac resalt plante cuestion sustent motiv bloque ampli recort
    elev baj trep escal desplom derrumb ajust lateraliz perfor teste lig aline
    desmarc concentr funcion encaj identific determin condicion evit estrech ensanch acort alarg enfri moder intensific`, ES_AR),
  ...forms('romp perd pierd depend mov muev crec ced suced parec defend respond entend comprend fortalec retroced sorprend decrec permanec aparec desaparec obedec', ES_ER),
  ...forms('sub ocurr exist resist coincid diverg defin permit interrump converg surg abr resum describ distingu persist hund sobreviv asum cumpl', ES_IR),
]);

// ---------- French ----------
const FR_ER = ['er', 'e', 'ent', 'ait', 'aient', 'erait', 'eraient', 'ant', 'ee', 'es', 'ees'];
const FR_IR = ['ir', 'it', 'issent', 'issait', 'issaient', 'irait', 'iraient', 'issant', 'isse', 'i', 'ie', 'is', 'ies'];
// Second pass (see the head of this file). "celui, celle, ceux, celles" are here for "celle du secteur": followed
// by "qui" they are a person and the check refuses them (PERSONAL).
const FR_MORE = `ci comme autant ensemble generalement brutalement habitude fond fin pic pics perte pertes partie parties point points lien liens vague vagues regain retard profil direction dynamique evolution tentative tentatives
  traine fourchette fourchettes vigueur terrain role situation comportement confiance conviction valorisation valeurs rotation dominance activite decrochage element elements lectures unites
  liquidations altcoin altcoins cryptos cryptomonnaie cryptomonnaies nuit matin financement pairs
  net nette etroit etroite relatif relative evident evidente regulier reguliere hesitant hesitante indecis indecise serre serree comprime comprimee intact intacte precis precise concret concrete
  supplementaire supplementaires complet complete incomplet incomplete incomplets incompletes concluant concluante disponible disponibles contradictoire contradictoires brusque brusques caduc caduque
  courtes longues positifs positives negatifs negatives precedents precedentes eleves elevees historique historiques incertain incertaine pertinent pertinente specifique specifiques sensible sensibles
  japonais japonaise europeen europeenne europeens europeennes americain americaine americains americaines asiatique asiatiques chinois chinoise mondial mondiale
  luxe petrole banque banques bancaire bancaires automobile technologique technologiques semi conducteurs constructeurs cuivre gaz energie sante consommation yen euro devise devises cac
  parait paraissent paraissait rend rendent rendrait rendu remet remettent remettrait remis appuie appuient appuyer contredit contredisent inclure inclut incluent inclurait
  considere considerent considerait consideree considerees concernant celui celle ceux celles chartiste redevient redevienne redevenir redevenu
  retourne retournent retournee oriente orientent orientee
  onchain funding rally breakout pullback btc eth
  lui propre propres davantage desormais particulierement normalement constamment legerement fortement brusquement rapidement lentement progressivement soudainement nettement sensiblement precisement exactement directement initialement
  auparavant precedemment historiquement typiquement habituellement relativement lateralement
  motif motifs incertitude incertitudes difficulte difficultes decision decisions progres progression amelioration deterioration degradation augmentation diminution ralentissement acceleration debut origine source sources
  consequence consequences effet effets resultat connexion comparaison contraste equilibre desequilibre barriere barrieres pause pauses surprise surprises deception optimisme pessimisme prudence enthousiasme panique euphorie nervosite
  appetit aversion indecision hesitation hesitations stabilite instabilite tension tensions bruit clarte absence presence melange combinaison sequence majorite part parts proportion poids importance place rythme vitesse taille ampleur
  portee degre type types sorte sortes maniere facon sens chemin periode periodes semestre marge reprise
  logiciel logiciels materiel revenus couts depenses dette production livraisons abonnes utilisateurs publicite commandes fusion amende regulateur regulateurs gouvernement election elections guerre conflit sanctions droits douane douanes
  taxes impots emploi chomage recession relance deficit budget geopolitique reglementaire approbation interdiction centrale centrales reserve federale bce
  stablecoin stablecoins minage mineurs plateformes exchange exchanges emission deblocage deblocages fork protocole defi spot comptant futures derives echeance echeances
  drapeau fanion epaule epaules tete bollinger bande bandes fibonacci croix doree mort pivot compression expansion essoufflement capitulation distribution rejet echec derive faux fausse meche meches corps ouverture
  coince coincee prudent prudente prudents prudentes nerveux nerveuse active initial initiale final finale total totale partiel partielle modeste modere moderee legere severe profond profonde superficiel marque marquee prononce prononcee
  agressif agressive defensif defensive cyclique saisonnier structurel structurelle local locale externe interne direct directe indirect indirecte visible visibles apparent apparente notable notables surprenant surprenante decevant decevante
  inquietant inquietante commun commune rare rares frequent frequente repete repetee multiple multiples divers diverses particulier particuliere combine combinee independant independante correle correlee aligne alignee semblable egal egale
  etats unis usa chine europe japon allemagne asie
  apporte apportent apporterait soutiendraient decrit decrite decrits decrites decrivent provient proviennent surprend surprennent surpris decoit decoivent decu decue poursuit poursuivent poursuivi reprend reprennent repris
  revient reviennent revenu revenue apparait apparaissent apparu disparait disparaissent disparu connait connaissent connu subit subissent subi souffre souffrent souffert craint craignent rejoint rejoignent traduit traduisent
  suffit suffisent compromet compromettent compromis
  tienne tel telle tels telles vite fois journaliers journalieres quotidiennes retrait convaincant convaincante convaincants convaincantes obstacle obstacles amplitude amplitudes reduisent reduite reduits reduites faveur mince minces
  sert servent servi agit agissent correspond correspondent survit survivent survecu
  longtemps entierement completement partiellement principalement specifiquement simplement ailleurs pourtant cependant toutefois neanmoins sinon sauf finalement
  frequence distance duree quantite nombre qualite nature caractere aspect aspects detail details faits probleme problemes explication explications interpretation interpretations hypothese hypotheses implication implications signification
  logique theorie exemple exemples exception regle defi defis menace menaces choc chocs jambe bord extreme extremes centre milieu continuite
  etroits etroites difficile difficiles complexe complexes capable capables incapable incapables inegal inegale aleatoire ordonne ordonnee persistant persistante permanent permanente bref breve prolonge prolongee continu continue rate ratee
  valide valides invalide vrai vraie veritable attendu attendue attendus attendues inattendu inattendue inconnu inconnue anormal anormale classique classiques`;
const FR = new Set([
  ...list(FR_MORE),
  ...list(`le la les un une des de du d l au aux en dans sur sous avec sans pour par vers chez entre depuis pendant apres avant contre selon malgre jusqu jusque a que qu qui quoi quel quelle quels quelles comment pourquoi
    si quand ou dont lorsque tandis puisque car parce et mais ni donc ne pas n plus jamais rien est sont etait etaient serait seraient soit soient ete etre etant ont avait avaient aurait auraient ait aient eu avoir ayant
    ce cet cette ces c ca cela ceci son sa ses leur leurs se s il elle ils elles y t peut peuvent pourrait pourraient pouvait puisse pouvoir doit doivent devrait devraient
    tres trop peu beaucoup moins aussi tant tellement assez encore deja toujours souvent parfois maintenant aujourd hui hier recemment actuellement ici bien mal presque meme surtout plutot vraiment ensuite puis
    alors ainsi chaque tout toute tous toutes autre autres memes quelque quelques aucun aucune certains certaines plusieurs
    semaine semaines mois trimestre trimestres annee annees an ans jour jours seance seances heure heures journalier journaliere quotidien quotidienne quotidiens hebdomadaire hebdomadaires mensuel mensuelle mensuels annuel
    annuelle intraday horaire prochain prochaine prochains prochaines dernier derniere derniers dernieres passe passee recent recente recents recentes actuel actuelle actuels precedent precedente suivant suivante
    terme court long moyen courts longs longue
    actif action actions titre titres prix cours marche marches secteur indice crypto jeton entreprise societe tendance tendances graphique graphiques bougie bougies figure figures niveau niveaux zone zones range canal
    ligne lignes cassure cassures rupture franchissement repli replis rebond rebonds hausse hausses baisse baisses chute chutes mouvement mouvements elan correction corrections retournement renversement poursuite
    consolidation momentum volume volumes volatilite force faiblesse pression demande offre liquidite sentiment humeur flux moyenne moyennes mobile mobiles indicateur indicateurs oscillateur divergence croisement
    sommet sommets creux haut hauts bas plafond plancher gap ecart horizon unite temps echelle echelles resultats publication rapport previsions chiffre affaires marges croissance perspectives perspective prevision
    estimations attentes nouvelles actualite actualites evenement evenements catalyseur catalyseurs annonce annonces donnees donnee preuve preuves chiffres taux inflation economie macro dollar obligations politique
    regulation reglementation etf adoption reseau halving investisseurs investisseur traders analystes institutions fonds acteurs intervenants lecture analyse these scenario scenarios configuration idee biais avis
    verdict conclusion argument arguments question reponse raison raisons cause causes moteur moteurs facteur facteurs risque risques condition conditions signe signes confirmation invalidation changement changements
    difference chance chances inversion support supports resistance resistances ema sma rsi macd atr peur avidite structure base cycle phase etape serie reaction contexte fed nasdaq bitcoin ethereum ia puces concurrence produit produits lancement
    haussier haussiere haussiers haussieres baissier baissiere baissiers baissieres neutre lateral laterale fort forte forts fortes faible faibles haute eleve elevee basse grand grande grands grandes petit petite
    principal principale principaux cle important importante importants majeur majeure mineur reel reelle clair claire solide solides fragile stable instable plat plate surachete surachetee survendu survendue
    etendu etendue technique techniques fondamental fondamentale fondamentaux large larges nouveau nouvelle vieux probable improbable possible suffisant suffisante mitige mitigee sain saine durable temporaire
    soudain soudaine brutal brutale ferme constant constante lent lente rapide rapides volatil volatile calme lourd leger typique inhabituel inhabituelle normal normale habituel similaire oppose positif positive
    negatif negative different differente differents general generale global globale dessus dessous derriere devant pres loin dehors dedans autour travers face suite grace
    fait font faisait ferait feraient fasse faire dit disent disait dirait dire voit voient voyait verrait vu voir met mettent mettrait mis perd perdent perdait perdrait perdu perdre rompt
    descend descendent descendait descendrait descendu descendre tient tiennent tenait tiendrait tenu vient viennent venait viendrait venu venir devient deviennent deviendrait devenu devenir
    suit suivent suivait suivrait suivi suivre lit lisent lire lu comprend comprennent comprendre compris depend dependent dependait dependrait dependre repond repondent repondre repondu
    produit produisent produire reduit reduire conduit conduire sort sortait ouvre ouvrent ouvrir ouvert tend tendent atteint atteignent atteindre atteignait
    maintient maintiennent maintenait maintiendrait soutient soutiennent soutenait soutiendrait soutenir permet permettent permettrait permis reflete refletent inquiete inquietent suggere suggerent amene amenent mene menent
    revele revelent accelere accelerent`),
  ...forms(`confirm invalid chang cass recul mont baiss chut grimp gliss progress stagn continu pouss tir pes soulev frein aid provoqu caus entrain domin depass montr indiqu point expliqu import arriv pass sembl rest
    manqu touch test crois clotur ferm form echapp compt renforc augment diminu dur signifi termin commenc dout ignor limit respect bloqu penalis port declench aliment stabilis evolu repos empech tomb interpret confirm
    consolid diverg essouffl modifi cach boug pein echou influenc cal exist perform surperform oppos transform amelior degrad acceler but affich affect jug resist detach decroch eclair evalu resum impliqu compar distingu
    connect li reli rattach contrast invers annul renvers annonc publi present lanc vari oscill fluctu hesit trouv rencontr approch eloign normalis deriv result represent soulign pos motiv propuls amplifi abaiss relev envol plong effondr vacill
    corrig ajust perc enfonc prolong persist lutt ced qualifi
    combl ecart neglig concentr fonctionn suppos identifi demontr prouv determin conditionn evit resserr allong moder intensifi repet`, FR_ER),
  ...forms('affaibl faibl rebond reag franch ralent aplat tar bond fin flech reuss retrec elarg raccourc refroid', FR_IR),
]);

// ---------- Portuguese ----------
const PT_AR = ['ar', 'a', 'am', 'ava', 'avam', 'ou', 'aram', 'aria', 'ariam', 'e', 'em', 'asse', 'assem', 'ado', 'ada', 'ados', 'adas', 'ando'];
const PT_ER = ['er', 'e', 'em', 'ia', 'iam', 'eu', 'eram', 'eria', 'eriam', 'a', 'am', 'esse', 'essem', 'ido', 'ida', 'idos', 'idas', 'endo'];
const PT_IR = ['ir', 'e', 'em', 'ia', 'iam', 'iu', 'iram', 'iria', 'iriam', 'a', 'am', 'isse', 'issem', 'ido', 'ida', 'idos', 'idas', 'indo'];
// Second pass (see the head of this file).
const PT_MORE = `apesar lado tantos tantas vez vezes meio face parte partes ponto pontos fim salto saltos onda ondas folego perfil regiao direcao relacao correlacao recuperacao rotacao dominancia atividade comportamento situacao impacto
  confianca conviccao valuation financiamento funding liquidacoes altcoin altcoins criptomoeda criptomoedas leituras prazos faixa faixas aumento aumentos resultado fechamento fecho tentativa tentativas
  resiliencia noticiario restante espaco perda perdas noite madrugada manha pares
  estreito estreita relativo relativa preso presa elevado elevada indefinido indefinida apertado apertada comprimido comprimida intacto intacta renovado renovada concreto concreta adicional adicionais
  completo completa incompleto incompleta conclusivo conclusiva inconclusivo inconclusiva cauteloso cautelosa ultrapassado ultrapassada mistos mistas bruscos bruscas baixos curtos curtas maiores horaria horarias
  sensivel sensiveis preciso evidente incerto incerta historico historica relevante relevantes especifico especifica regular
  japones japonesa europeu europeia europeus europeias americano americana asiatico asiatica chines chinesa global mundial regional local
  luxo petroleo banco bancos bancario bancaria automotivo automotiva montadoras tecnologia tecnologico tecnologica minerio ferro ouro prata cobre gas energia consumo saude iene euro moedas cambio selic
  sobe sobem consegue conseguem conseguiu costuma costumam comecaram vista vistos vistas considerado considerada incluir inclui incluem incluiria baseia baseiam baseado baseada
  negocia negociam negociava negociado negociada negociados negociadas coloca colocam colocaria colocou
  onchain rally breakout pullback btc eth
  poucos poucas varios varias demais apenas bastante especialmente particularmente geralmente normalmente constantemente ligeiramente levemente fortemente bruscamente rapidamente lentamente gradualmente novamente repentinamente
  significativamente notavelmente precisamente exatamente diretamente inicialmente anteriormente previamente historicamente tipicamente habitualmente relativamente lateralmente partir
  proprio propria motivo motivos incerteza incertezas duvidas dificuldade dificuldades decisao decisoes progresso avanco avancos melhoras melhoria deterioracao incremento diminuicao desaceleracao aceleracao inicio comeco final origem
  fonte fontes consequencia consequencias efeito efeitos resultados influencia conexao vinculo ligacao comparacao contraste equilibrio desequilibrio limite limites barreira barreiras pausa pausas atraso surpresa surpresas decepcao
  otimismo pessimismo cautela entusiasmo panico euforia nervosismo calma apetite aversao indecisao estabilidade instabilidade tensao tensoes ruido clareza ausencia presenca mistura combinacao serie maioria proporcao peso importancia
  lugar ritmo velocidade tamanho magnitude alcance grau tipo tipos classe forma formas maneira modo sentido caminho passo passos perna pernas semestre margem
  software hardware nuvem custos despesas divida producao entregas assinantes usuarios publicidade pedidos fusao multa regulador reguladores governo eleicao eleicoes guerra conflito sancoes tarifas impostos emprego desemprego recessao
  estimulo deficit orcamento geopolitica geopolitico politico politica politicos politicas regulatorio regulatoria aprovacao proibicao central centrais copom reserva federal bce
  stablecoin stablecoins mineracao mineradores exchange exchanges corretoras emissao desbloqueio desbloqueios atualizacao fork protocolo defi spot vista futuros derivativos vencimento
  cunha triangulo bandeira flamula ombro ombros cabeca bollinger banda bandas fibonacci cruz dourada morte pivo compressao expansao exaustao capitulacao distribuicao rejeicao deriva falso falsa pavio pavios corpo abertura
  positivos positivas negativos negativas prudente prudentes nervoso nervosa calma ativa inicial iniciais finais total totais parcial parciais modesto modesta moderado moderada leves severo severa profundo profunda superficial
  acentuado acentuada suave suaves agressivo agressiva defensivo defensiva ciclico ciclica sazonal estrutural externo externa interno interna direto direta indireto indireta visivel visiveis obvio obvia aparente aparentes notavel
  surpreendente decepcionante preocupante comum comuns raro rara frequente frequentes repetido repetida multiplo multipla multiplos multiplas diversos diversas particular combinado combinada independente correlacionado correlacionada
  divergente igual iguais distinto distinta necessario necessaria solidos solidas pequenos pequenas longos longas novos novas claros claras
  estados unidos eua usa china europa japao alemanha asia brasil
  acrescenta acrescentam acrescentaria considerar descrito descrita
  distancia convincente convincentes frequencia obstaculo obstaculos continuidade quadro quadros escasso escassa escassos escassas serve servem serviu
  sempre nunca frequentemente completamente parcialmente principalmente especificamente simplesmente juntos tampouco inclusive embora porem contudo entretanto todavia senao salvo exceto finalmente enfim
  duracao quantidade qualidade natureza carater aspecto aspectos elemento elementos detalhe detalhes fato fatos problema problemas explicacao explicacoes interpretacao hipotese hipoteses implicacao implicacoes significado logica teoria
  exemplo exemplos precedente precedentes excecao regra habito desafio desafios ameaca ameacas choque choques borda extremo extremos centro
  estreitos estreitas dificil dificeis complexo complexa capaz capazes incapaz liquido liquida desigual limpo limpa aleatorio aleatoria ordenado ordenada persistente persistentes permanente breve breves prolongado prolongada continuo continua
  invalido verdadeiro verdadeira genuino esperado esperada inesperado inesperada conhecido conhecida desconhecido desconhecida anormal classico classica menores`;
const PT = new Set([
  ...list(PT_MORE),
  ...list(`o a os as um uma uns umas de do da dos das em no na nos nas com sem para por pelo pela pelos pelas sobre entre ate desde durante apos antes depois contra segundo perante ao aos que qual quais como se quando
    onde enquanto porque pois e ou mas nem nao sao esta estao estava estavam estaria esteja estar foi foram era eram seja sejam seria seriam ser sido sendo ha havia houve haja tem tinha teria teriam tenha teve ter tido
    pode podem podia poderia poderiam possa poder deve devem este isto isso esse essa esses essas aquele aquilo neste nesta nesse nessa nisso deste desta desse dessa disso num numa seu sua seus suas lhe lhes
    mais menos muito muita muitos muitas pouco pouca tao tanto tanta tambem ja ainda agora hoje ontem recentemente ultimamente atualmente aqui ai ali assim bem mal quase mesmo mesma sobretudo realmente
    entao logo cada todo toda todos todas outro outra outros outras algum alguma alguns algumas nenhum nenhuma nada algo tudo
    semana semanas mes meses trimestre ano anos dia dias sessao sessoes pregao hora horas diario diaria diarios diarias semanal semanais mensal mensais anual intradiario horario
    proximo proxima proximos proximas ultimo ultima ultimos ultimas passado passada recente recentes atual atuais anterior anteriores seguinte seguintes prazo curto longo medio longa curta
    ativo acao acoes papel papeis preco precos mercado mercados setor indice cripto moeda token empresa companhia negocio tendencia tendencias grafico graficos vela velas candle candles padrao padroes nivel niveis
    zona zonas range intervalo canal linha linhas rompimento rompimentos ruptura quebra recuo recuos repique alta altas subida subidas queda quedas baixas movimento movimentos impulso correcao correcoes reversao
    viragem continuacao consolidacao lateralizacao momentum volume volumes volatilidade forca fraqueza pressao procura demanda oferta liquidez sentimento humor fluxo fluxos media medias movel moveis indicador indicadores
    oscilador divergencia cruzamento maximo maximos minimo minimos maxima maximas minima minimas topo topos fundo fundos teto piso gap horizonte tempo tempos periodo periodos resultados balanco balancos relatorio
    guidance receita receitas margens crescimento perspectiva perspectivas panorama previsao previsoes estimativas expectativas noticias noticia manchetes evento eventos catalisador catalisadores anuncio dados dado
    evidencia numeros taxa taxas juros inflacao economia macro dolar titulos politica regulacao etf adocao rede halving investidores investidor traders analistas touros ursos instituicoes fundos participantes
    leitura tese caso visao imagem historia narrativa cenario cenarios setup ideia vies analise veredito conclusao argumento argumentos pergunta resposta razao razoes causa causas motor motores fator fatores risco riscos
    condicao condicoes indicio indicios confirmacao invalidacao mudanca mudancas diferenca suporte suportes resistencia resistencias ema sma rsi macd atr ifr medo estrutura base ciclo fase etapa sequencia reacao
    contexto fed nasdaq ibovespa bitcoin ethereum ia chips concorrencia produto produtos lancamento
    altista altistas baixista baixistas neutro neutra lateral forte fortes fraco fraca fracos fracas alto altos baixo baixa maior maiores menor menores grande grandes pequeno pequena principal principais chave
    importante importantes real reais claro clara solido solida fragil estavel instavel plano sobrecomprado sobrecomprada sobrevendido sobrevendida esticado esticada tecnico tecnica tecnicos tecnicas fundamental
    fundamentais amplo ampla novo nova velho provavel improvavel possivel suficiente misto mista saudavel sustentavel temporario temporaria repentino repentina brusco brusca firme constante lento lenta rapido rapida
    volatil calmo pesado leve tipico incomum normal habitual semelhante oposto positivo positiva negativo negativa diferente diferentes geral acima abaixo cima atras tras frente perto longe fora dentro primeiro primeira resto
    cai caem caia caiu cairia caido caindo cair faz fazem fazia fez faria fariam faca feito fazendo fazer diz dizem dizia disse diria diga dito dizendo dizer ve veem via viu veria veja visto ver
    vem vinha veio viria venha vindo vir le leem ler leu lido mantem mantinha manteria manteve mantenha traz trazem trouxe traria trazer segue seguem seguia seguiria siga seguiu seguindo seguir
    sugere sugerem sugeriria impede impedem impediria reduz reduzem reduzir reduziria produz produzem conduz reage reagem reagir reagiria reagiu atinge atingem atingir atingiu influi influem
    alcanca alcancam alcancar alcancou comeca comecam comecar comecou reforca reforcam reforcar`),
  ...forms(`confirm invalid mud recu recuper vir trav par continu empurr pression impulsion arrast pes afet ajud provoc caus lider super mostr indic apont reflet explic import pass precis toc test cruz fech form aument
    esgot acab termin dur signific falt fic apoi sustent limit rejeit respeit preocup duvid cheg aproxim afast estagn desaceler aceler pior marc falh ger domin lev deton obrig compar anul valid volt torn derrub interpret
    consolid and desto acompanh achat influenci revel reforc sec transform melhor diferenci desencade dispar aliment descol implic avali ultrapass separ
    conect lig vincul relacion contrast apag avanc lut decepcion anunci public report apresent lanc vari oscil flutu hesit encontr estabiliz normaliz origin deriv result represent destac ressalt question respald motiv bloque ampli recort
    elev baix escal despenc desab afund tomb ajust lateraliz perfur prolong retom alinh
    ignor concentr atu funcion encaix identific demonstr prov determin condicion evit estreit alarg encurt esfri moder intensific`, PT_AR),
  ...forms('romp perd depend mov cresc ced acontec ocorr parec defend respond entend compreend enfraquec fortalec sofr surpreend decresc permanec aparec desaparec tend estend obedec revert descrev devolv invert sobreviv encolh mex', PT_ER),
  ...forms('sub exist resist coincid diverg contribu repet defin permit abr surg resum converg persist corrig assum cumpr', PT_IR),
]);

// ---------- Italian ----------
const IT_ARE = ['are', 'a', 'ano', 'ava', 'avano', 'o', 'erebbe', 'erebbero', 'i', 'ino', 'asse', 'assero', 'ato', 'ata', 'ati', 'ate', 'ando'];
const IT_ERE = ['ere', 'e', 'ono', 'eva', 'evano', 'erebbe', 'erebbero', 'a', 'ano', 'esse', 'essero', 'uto', 'uta', 'uti', 'ute', 'endo'];
const IT_IRE = ['ire', 'e', 'ono', 'iva', 'ivano', 'irebbe', 'irebbero', 'a', 'ano', 'isse', 'issero', 'ito', 'ita', 'iti', 'ite', 'endo'];
// Second pass (see the head of this file).
const IT_MORE = `ad mai nonostante solito mezzo modo fretta fondo fine parte parti punto punti picco picchi ondata ondate perdita perdite profilo direzione ritardo ruolo terreno area aree intervallo intervalli andamento tentativo tentativi
  tenuta mancanza dubbio elemento elementi evidenze letture situazione comportamento fiducia convinzione valutazione rotazione dominance dominanza attivita chiusura consolidazione spread relazione correlazione
  liquidazioni altcoin crypto criptovaluta criptovalute notte mattina mattinata
  stretto stretta ristretto ristretta relativo relativa evidente regolare incerto incerta elevato elevata compresso compressa intatto intatta rinnovato rinnovata concreto concreta aggiuntivo aggiuntiva aggiuntivi aggiuntive
  completo completa incompleto incompleta incompleti incomplete inconcludente contrastanti decrescenti crescenti storico storica storici storiche bassi basse bruschi brusche grafica rilevante specifico specifica sensibile sensibili
  giapponese europeo europea europei europee americano americana asiatico asiatica cinese globale mondiale
  lusso petrolio banca banche bancario bancaria auto automobilistico tecnologico tecnologica costruttori concorrenti oro argento rame gas energia consumi yen euro valuta valute piazza affari ftse mib
  rende rendono renderebbe reso perso persa scesa scesi scese aperto aperta rimasto rimasta rimane rimangono appare appaiono avviene avvengono incide incidono serve servono servirebbe
  metterebbe distingue distinguono riassume riassumono finisce finiscono finisca finito finita finire accadere esploso esplosi esplode bruscamente diversamente
  scambia scambiano scambiato scambiati scambiate considerato considerata considerati considerate includere include includono includerebbe
  appiattirsi appiattisce appiattiscono appiattito stacca staccato migliora migliorano migliorato migliorata miglioramento
  onchain funding rally pullback btc eth
  quest pochi poche vari varie diversi diverse abbastanza appena piuttosto particolarmente specialmente generalmente normalmente costantemente leggermente fortemente rapidamente lentamente gradualmente nuovamente improvvisamente
  significativamente notevolmente precisamente esattamente direttamente inizialmente precedentemente storicamente tipicamente solitamente relativamente lateralmente ulteriormente finora tuttora riguardo
  propria motivo motivi incertezza incertezze dubbi difficolta decisione decisioni progresso progressi peggioramento deterioramento diminuzione rallentamento accelerazione origine fonte fonti conseguenza conseguenze effetto effetti
  risultato connessione legame legami confronto contrasto equilibrio squilibrio limite limiti barriera barriere pausa pause sorpresa sorprese delusione ottimismo pessimismo cautela prudenza entusiasmo panico euforia nervosismo calma
  appetito avversione indecisione esitazione stabilita instabilita tensione tensioni rumore chiarezza assenza presenza mix combinazione sequenza maggioranza proporzione importanza posto ritmo velocita dimensione dimensioni
  ampiezza portata grado tipo tipi genere maniera senso strada semestre margine ripresa riprese
  software hardware cloud costi spese debito produzione consegne abbonati utenti pubblicita ordini fusione multa regolatore regolatori autorita governo elezione elezioni guerra conflitto sanzioni dazi tasse imposte occupazione
  disoccupazione recessione stimolo deficit bilancio geopolitica geopolitico politico politica politici politiche normativo normativa approvazione divieto centrale centrali bce
  stablecoin mining miner exchange emissione sblocco sblocchi aggiornamento fork protocollo defi spot futures derivati scadenza scadenze
  cuneo triangolo bandiera pennant spalla spalle testa bollinger banda bande fibonacci croce morte pivot compressione espansione esaurimento capitolazione distribuzione fallimento deriva falso falsa ombra ombre corpo apertura
  positivi positive negativi negative prudente prudenti nervoso nervosa attivo attiva iniziale iniziali finale finali totale totali parziale parziali modesto modesta moderato moderata lieve lievi severo severa profondo profonda
  superficiale marcato marcata netto netta aggressivo aggressiva difensivo difensiva ciclico ciclica stagionale strutturale locale locali esterno esterna interno interna diretto diretta indiretto indiretta visibile visibili ovvio ovvia
  apparente apparenti notevole notevoli sorprendente deludente preoccupante comune comuni raro rara frequente frequenti ripetuto ripetuta multiplo multipla molteplici particolare particolari combinato combinata indipendente
  correlato correlata allineato allineata divergente uguale uguali stessi stesse necessario necessaria solidi solide piccoli piccole lunghe nuovi nuove chiari misti miste
  stati uniti usa cina europa giappone germania asia
  aggiunge aggiungono sosterrebbero muoversi muovendo spento spenta spegne punta puntano definire definito definita descrive descrivono descritto descritta riduce riducono ridotto riprende riprendono ripreso permane permangono
  scompare scompaiono scomparso subisce subiscono subito contribuisce contribuiscono diminuisce diminuiscono diminuito tende tendono estende estendono corregge correggono corretto delude deludono deluso sorprende sorprendono sorpreso
  prosegue proseguono proseguito persiste persistono
  regga reggano retto smesso smette smettono volta volte giornaliere sempre distanza distanze indietro convincente convincenti spesso ostacolo ostacoli scarso scarsa scarsi scarse restringe restringono restringendo
  agisce agiscono corrisponde corrispondono assume assumono sopravvive sopravvivono sopravvissuto ripete ripetono ripetuto
  talvolta completamente parzialmente principalmente specificamente semplicemente insieme neanche persino sebbene tuttavia comunque altrimenti tranne infine altrove
  frequenza durata quantita numero qualita natura carattere aspetto aspetti dettaglio dettagli fatti problema problemi spiegazione spiegazioni interpretazione interpretazioni ipotesi implicazione implicazioni significato logica teoria
  esempio esempi eccezione regola abitudine sfida sfide minaccia minacce shock bordo estremo estremi centro continuita
  stretti strette difficile difficili complesso complessa capace capaci incapace pulito pulita casuale ordinato ordinata persistente persistenti permanente prolungato prolungata continuo continua riuscito riuscita valido valida invalido
  vero vera atteso inatteso inattesa noto nota sconosciuto anomalo anomala classico classica`;
const IT = new Set([
  ...list(IT_MORE),
  ...list(`il lo la i gli le un uno una di del della dello dei degli delle dell a al alla allo ai agli alle all da dal dalla dallo dai dagli dalle dall in nel nella nello nei negli nelle nell su sul sulla sullo sui sugli
    sulle sull con senza per tra fra sopra sotto verso dopo prima durante contro secondo oltre entro fino che cosa cos quale quali qual come com perche se quando dove mentre poiche e ed o ma ne non
    sono era erano sarebbe sarebbero sia siano stato stata stati essere essendo ha hanno aveva avrebbe abbia avuto avere questo questa questi queste quel quello quella quei quelle cio suo sua suoi sue si ci l d c
    puo possono poteva potrebbe potrebbero possa potere deve devono dovrebbe dovrebbero sta stanno stava starebbe
    piu meno molto molta molti molte poco poca tanto tanta troppo anche gia ancora ora adesso oggi ieri recentemente ultimamente attualmente qui qua li cosi bene male quasi proprio soprattutto davvero
    poi allora quindi ogni tutto tutta tutti tutte altro altra altri altre stesso stessa alcuni alcune qualche nessun nessuno nessuna niente nulla qualcosa
    settimana settimane mese mesi trimestre anno anni giorno giorni seduta sedute ore giornaliero giornaliera giornalieri settimanale settimanali mensile mensili annuale intraday orario
    prossimo prossima prossimi prossime ultimo ultima ultimi ultime scorso scorsa recente recenti attuale attuali precedente precedenti successivo termine breve lungo medio periodo lunga brevi lunghi
    asset titolo titoli azione azioni prezzo prezzi mercato mercati settore indice cripto moneta token azienda societa trend tendenza tendenze grafico grafici candela candele pattern figura livello livelli zona zone
    range canale linea linee rottura rotture breakout ritracciamento storno rimbalzo rimbalzi rialzo rialzi ribasso ribassi salita discesa calo cali caduta crollo movimento movimenti slancio spinta correzione
    correzioni inversione prosecuzione continuazione consolidamento lateralita momentum volume volumi volatilita forza debolezza pressione domanda offerta liquidita sentiment umore flusso flussi media medie mobile
    mobili indicatore indicatori oscillatore divergenza incrocio massimo massimi minimo minimi top tetto pavimento gap orizzonte timeframe arco temporale scala risultati trimestrale trimestrali relazione guidance
    ricavi margini crescita prospettiva prospettive quadro previsione previsioni stime attese notizie notizia evento eventi catalizzatore catalizzatori annuncio dati dato evidenza numeri cifre tasso tassi inflazione
    economia macro dollaro obbligazioni politica regolamentazione etf adozione rete halving investitori investitore trader analisti tori orsi istituzioni fondi operatori partecipanti lettura analisi tesi caso visione
    immagine storia narrativa scenario scenari setup idea bias orientamento verdetto conclusione argomento argomenti risposta ragione ragioni causa cause motore motori fattore fattori rischio rischi condizione
    condizioni segno segni conferma invalidazione cambiamento cambiamenti cambio differenza supporto supporti resistenza resistenze ema sma rsi macd atr paura avidita struttura base ciclo fase tappa serie reazione
    contesto fed nasdaq bitcoin ethereum ia chip concorrenza prodotto prodotti lancio
    rialzista rialziste rialzisti ribassista ribassiste ribassisti neutro neutrale laterale forte forti debole deboli alto alta alti alte basso bassa maggiore maggiori minore minori grande grandi piccolo piccola
    principale principali chiave importante importanti reale reali chiaro chiara solido solida fragile stabile instabile piatto ipercomprato ipercomprata ipervenduto ipervenduta esteso estesa tirato tecnico tecnica
    tecnici tecniche fondamentale fondamentali ampio ampia nuovo nuova vecchio probabile improbabile possibile sufficiente misto mista sano sana sostenibile temporaneo temporanea improvviso improvvisa brusco brusca
    fermo costante lento lenta rapido rapida volatile calmo pesante leggero tipico insolito normale abituale simile opposto positivo positiva negativo negativa diverso diversa differente generale dietro davanti
    vicino lontano fuori dentro primo
    fa fanno faceva farebbe farebbero faccia fatto facendo fare far dice dicono diceva direbbe dica detto dire viene vengono veniva verrebbe venuto venire tiene tengono teneva terrebbe
    mantiene mantengono manterrebbe sale salgono saliva salirebbe salito salire salendo vede vedono vedeva vedrebbe visto vedere succede succedono successo succedere succederebbe accade accadono accadrebbe accaduto
    scende scendono scendeva scenderebbe sceso scendere scendendo spinge spingono spinto spingere regge reggono reggerebbe chiude chiudono chiuso chiudere muove muovono mosso muovere
    riflette riflettono legge leggere letto mette mettono messo influisce influiscono reagisce reagiscono reagirebbe reagito reagire suggerisce suggeriscono impedisce impediscono impedirebbe definisce costituisce
    indebolisce indeboliscono indebolito indebolita indebolirebbe indebolire sostiene sostengono sosterrebbe sostenuto resto
    sfugge sfuggono sfuggire apre aprono aprire spiegherebbe spieghi mancherebbe cambi segue seguono seguiva seguirebbe seguire seguito toccherebbe`),
  ...forms(`conferm invalid cambi rimbalz recuper gir fren rallent rafforz cont continu tir pes aiut provoc caus guid super mostr indic spieg import pass sembr rest manc tocc test incroci form aument esaur termin dur signific cominci
    inizi preoccup dubit ignor limit rifiut rispett blocc penalizz port scaten aliment acceler stabilizz arriv torn croll scivol peggior segn interpret
    consolid sovraperform sottoperform influenz ferm rivel prosciug trasform innesc valut implic bas cal fatic
    colleg leg confront contrast avanz lott annunci pubblic report present lanci vari oscill fluttu esit trov incontr avvicin allontan normalizz origin deriv risult rappresent sottoline sollev motiv ampli tagli alz abbass scal precipit affond
    vacill aggiust lateralizz perfor viol prolung arretr stent
    trascur concentr separ divent funzion identific dimostr prov determin condizion evit allarg accorci allung raffredd moder intensific`, IT_ARE),
  ...forms('romp perd dipend cresc ced rispond difend', IT_ERE),
  ...forms('esist resist coincid diverg invert chiar fall', IT_IRE),
]);

// ---------- German ----------
const DE_NOUN = ['', 'e', 'es', 's', 'en', 'n', 'er', 'ern'];
const DE_ADJ = ['', 'e', 'er', 'en', 'es', 'em', 'ere', 'eren', 'erer', 'eres', 'erem', 'ste', 'sten', 'ster', 'stes'];
const DE_VERB = ['en', 't', 'et', 'te', 'ete', 'ten', 'eten'];
const DE_NOUNS = `aktie kurs preis markt sektor branche index krypto coin token unternehmen firma konzern trend aufwartstrend abwartstrend seitwartstrend chart kerze muster niveau zone bereich spanne range kanal linie
  marke ausbruch bruch rucksetzer erholung anstieg ruckgang bewegung schwung korrektur umkehr trendwende fortsetzung konsolidierung seitwartsphase momentum volumen volatilitat starke schwache druck nachfrage angebot
  liquiditat stimmung zufluss abfluss durchschnitt indikator oszillator divergenz kreuzung hoch tief hochstand spitze boden decke lucke zeitrahmen zeitebene horizont zeitraum ergebnis zahl bericht ausblick prognose
  umsatz marge wachstum aussicht schatzung erwartung nachricht schlagzeile ereignis katalysator ankundigung daten datenlage beleg zins zinssatz inflation wirtschaft konjunktur makro dollar anleihe politik regulierung
  etf adoption netzwerk halving anleger investor trader analyst bulle bar institution fonds marktteilnehmer analyse einschatzung lesart these bild geschichte narrativ szenario setup idee tendenz urteil fazit
  argument frage antwort grund ursache treiber faktor risiko bedingung zeichen anzeichen bestatigung anderung veranderung wechsel unterschied unterstutzung widerstand struktur basis zyklus phase serie reaktion
  kontext umfeld konkurrenz produkt rolle woche monat quartal jahr tag sitzung handelstag stunde
  verlauf entwicklung sprung verlust versuch welle schluss profil verhalten dominanz aktivitat interesse rally altcoin ende teil rand zusammenhang wandel hinweis rotation versicherer hersteller bank vergleich schwachstelle
  nacht bewertung kennzahl lage vertrauen uberzeugung stabilitat ausloser abweichung schwankung zoll luxus funding
  motiv unsicherheit zweifel schwierigkeit entscheidung fortschritt verbesserung verschlechterung zunahme abnahme verlangsamung beschleunigung beginn anfang ursprung quelle folge wirkung auswirkung effekt einfluss verbindung kontrast
  gleichgewicht ungleichgewicht grenze hurde pause verzogerung uberraschung enttauschung optimismus pessimismus vorsicht euphorie panik nervositat ruhe appetit unentschlossenheit instabilitat spannung klarheit mangel mischung kombination
  abfolge mehrheit anteil bedeutung platz tempo geschwindigkeit ausmass umfang grad art form weise sinn richtung weg schritt abschnitt halbjahr
  software hardware cloud ausgabe schuld produktion auslieferung abonnent nutzer werbung auftrag auftragseingang fusion strafe regulierer aufsicht regierung krieg konflikt sanktion steuer beschaftigung arbeitsmarkt arbeitslosigkeit rezession
  defizit haushalt geopolitik notenbank zentralbank stablecoin mining miner borse emission upgrade fork protokoll defi spot derivat verfall verfallstag
  keil dreieck flagge wimpel schulter kopf band fibonacci kreuz pivot kompression ausweitung erschopfung kapitulation distribution ablehnung docht korper eroffnung ol
  haufigkeit abstand dauer menge anzahl qualitat natur charakter aspekt detail tatsache problem erklarung interpretation annahme logik theorie beispiel ausnahme regel gewohnheit hindernis herausforderung bedrohung schock extrem mitte
  kontinuitat vormonat vorwoche vortag vorjahr mal`;
/** What may stand in front of a noun to make a compound: "Wochen|chart", "Kurs|rückgang", "Unterstützungs|zone". */
const DE_FIRST = list(`wochen tages monats jahres stunden quartals kurs preis trend chart markt aktien krypto handels volumen umsatz zins konjunktur unterstutzungs widerstands aufwarts abwarts seitwarts ausbruchs erholungs
  korrektur konsolidierungs stimmungs nachrichten branchen sektor gesamt haupt
  zoll volatilitats schwung makro luxus liquidations auto technologie chip
  software ol risiko todes fehl schluss allzeit funding momentum`);
const DE_HEADS = new Set(forms(DE_NOUNS, DE_NOUN));
const DE = new Set([
  ...DE_HEADS,
  ...list(`der die das den dem des ein eine einen einem einer eines kein keine keinen von vom zu zum zur in im ins an am auf aus bei beim mit nach fur uber unter durch gegen ohne um vor hinter neben zwischen seit bis
    wahrend wegen trotz laut gegenuber oberhalb unterhalb innerhalb ausserhalb entlang was warum wieso weshalb wie welche welcher welches welchen welchem wenn falls ob als dass damit weil da obwohl bevor nachdem
    sobald solange wo woran wodurch worauf wovon womit worin wofur wonach woraus und oder aber sondern denn doch nicht nichts etwas
    ist sind war waren ware sei seien gewesen sein hat haben hatte hatten gehabt wurde wurden kann konnen konnte konnten muss mussen musste mussten
    sich es er sie ihn ihm ihr ihre ihren ihrem ihrer seine seinen seinem seiner seines dies diese dieser dieses diesen diesem
    noch schon mehr weniger sehr so auch bereits immer oft manchmal jetzt heute gestern zuletzt kurzlich derzeit momentan hier dort dann danach davor dabei dafur dagegen daran darauf daraus darin daruber darunter
    dahinter davon dazu trotzdem dennoch also eher fast kaum genau wirklich eigentlich allem uberhaupt wieder weiter weiterhin zuruck gerade bisher bislang ab hervor hin her
    jede jeder jedes jeden alle allen aller alles andere anderen anderer anderes gleiche gleichen einige einigen viele vielen wenige beide beiden
    nachste nachsten nachster letzte letzten letzter vergangene vergangenen jungste jungsten jungster vorherige vorige kommende kommenden kurz lang gleitende gleitender gleitenden
    ema sma rsi macd atr angst gier fed nasdaq dax bitcoin ethereum ki chips
    fallt fallen fiel fielen gefallen steigt steigen stieg stiegen gestiegen bricht brechen brach brachen gebrochen halt hielt gehalten verliert verlieren verlor verloren bleibt bleiben blieb geblieben
    kommt kommen kam gekommen geht ging gegangen gibt gab gegeben sieht sehen sah gesehen aussieht zieht ziehen zog gezogen treibt treiben trieb getrieben schliesst schliessen schloss geschlossen
    hangt hangen hing spricht sprechen sprach gesprochen tragt tragen trug lasst liess steckt stecken steckte passiert passieren passierte geschieht geschehen geschah
    andern andert anderte anderten geandert dauert dauern dauerte verhindert verhindern verhinderte verbessert verschlechtert scheint scheinen schien heisst liegt lag steht stand zahlt spielt
    macht machte ubersieht ubersehen unterscheidet unterscheiden kraft rest`),
  // Second pass (see the head of this file).
  ...list(`grosste grossten grosster grosstes meisten meiste oben unten anders inmitten ublicherweise infrage hinterher zusammen
    sank gesunken scheitern scheitert scheiterte gescheitert nachgelassen nachlassen ausgelost auslosen lost loste weicht weichen wich abweichen abweicht abgewichen geraten gerat geriet gedreht
    verlauft verlaufen verlief verrat verraten verriet besteht bestehen bestand widersprechen widerspricht verandern verandert veranderte verschlechtern verbessern verbesserte ausgetrocknet
    lauft laufen lief hinkt hinken stellen stellt stellte gestellt gilt gelten galt spielen uberholen uberholt bewertet enthalten enthalt ablesen fasst fassen zusammengedruckt
    yen euro onchain btc eth altcoins usa china europa japan deutschland asien ezb kosten ergebnisse ergebnissen wahlen bander futures bollinger
    selbst sogar besonders insbesondere generell normalerweise standig erneut wiederum direkt zunachst zuvor vorher typischerweise vergleichsweise seitwarts aufwarts abwarts nahe nah naher knapp zudem ausserdem allerdings jedoch hingegen zugleich
    gleichzeitig inzwischen mittlerweile seitdem seither teils teilweise insgesamt uberwiegend grosstenteils vorerst vorlaufig zeitweise kurzzeitig wenig viel gesamte gesamten
    entwickelt entwickeln entwickelte verbindet verbinden verband verbunden nennt nennen nannte genannt vergleicht vergleichen verglichen findet finden fand gefunden trifft treffen traf getroffen nahert nahern entfernt stammt stammen
    ruhrt ruhren beruht beruhen weist weisen wies hingewiesen unterstreicht hebt heben hob angehoben durchbricht durchbrechen durchbrochen uberwindet uberwinden uberwunden uberschreitet uberschritten unterschreitet unterschritten
    ausbricht ausbrechen ausgebrochen abgeflaut abflauen abflaut fort fortgesetzt verharrt verharren anhalten anhaltend anhaltende anhaltenden nachgeben nachgegeben kampft kampfen schwachelt kuhlt kuhlen abgekuhlt uberhitzt
    entsteht entstehen entstand entstanden ergibt ergeben ergab erscheint erscheinen erschien verschwindet verschwinden verschwunden tritt treten trat aufgetreten
    beschrieben angesehen eingestuft gestutzt belastet gebremst bestatigt beeinflusst begrenzt interpretiert gewertet gehandelt verursacht eingeschatzt betrachtet bezeichnet gedeutet
    woher solche solcher solchen solches meist meistens diesmal erste ersten erster erstes nie niemals hauptsachlich speziell einfach ebenfalls sonst ausser schliesslich netto hindernisse
    wiegt wiegen wog ubersteht uberstehen uberstand uberstanden gelost losen dient dienen diente gedient entspricht entsprechen entsprach beweist beweisen bewies bewiesen bedingt bedingen
    vermeidet vermeiden vermied vermieden weitet weiten
    wird werden`), // only the "wird" and "werden" the check lets through: "becomes" closing a condition, and the passive (FORBIDDEN_RUNS)
  ...forms(`bullisch barisch neutral stark schwach hoch hoh niedrig tief gross klein wichtig entscheidend echt klar solide fragil stabil instabil flach uberkauft uberverkauft uberdehnt technisch fundamental breit neu alt
    wahrscheinlich unwahrscheinlich moglich gemischt gesund nachhaltig vorubergehend plotzlich scharf fest konstant langsam schnell volatil ruhig schwer leicht typisch ungewohnlich normal ublich ahnlich gegenteilig
    positiv negativ verschieden unterschiedlich allgemein kurzfristig langfristig mittelfristig taglich wochentlich monatlich jahrlich aktuell steigend fallend zunehmend nachlassend
    eng solid gering erkennbar relativ ubrig japanisch europaisch amerikanisch asiatisch chinesisch deutsch global heftig empfindlich stetig unruhig abrupt unklar intakt restlich richtungslos widerspruchlich
    fehlend sinkend zusatzlich konkret vollstandig unvollstandig uneindeutig vorsichtig fruher kurz lang ober unter notig deutlich erhoht sensibel
    eigen nervos aktiv anfanglich moderat massig steil rasch aggressiv defensiv zyklisch saisonal strukturell lokal extern intern direkt indirekt sichtbar offensichtlich uberraschend enttauschend haufig selten wiederholt mehrfach einzeln
    besonder kombiniert unabhangig korreliert gleich notwendig erforderlich weit vorherig vorig golden historisch
    uberzeugend dunn schmal knapp schwierig komplex fahig unfahig ungleich sauber zufallig geordnet hartnackig dauerhaft erfolgreich gultig ungultig wahr falsch unerwartet bekannt unbekannt klassisch glaubwurdig hinfallig`, DE_ADJ),
  ...forms(`bestatig entkraft schwach stark stutz druck belast brems zeig deut bedeut erklar reagier erreich beruhr test kreuz bild fehl folg fuhr verursach beweg erhol dreh kipp stock pausier konsolidier stabilisier
    verlangsam beschleunig begrenz verteidig pass brauch sag wirk erwart befurcht ignorier beunruhig begunstig ermoglich
    notier beeinfluss schwank prag end eroffn sink
    verknupf uberrasch enttausch ankundig veroffentlich meld variier normalisier resultier begrund blockier erweiter verringer senk erhoh kletter rutsch sturz korrigier respektier verlanger pendel zoger
    konzentrier funktionier identifizier bestimm vereng verkurz verstark wiederhol vernachlassig schrumpf`, DE_VERB),
  'genug',
]);

const LEXICON: Record<AppLanguage, ReadonlySet<string>> = { en: EN, es: ES, fr: FR, pt: PT, it: IT, de: DE };

/** A German compound of listed parts: one or more first parts, then a listed noun ("wochenchart", "kursruckgang"). */
function germanCompound(word: string, depth = 0): boolean {
  if (depth > 3) return false;
  return DE_FIRST.some(first => word.length > first.length + 2 && word.startsWith(first) && (DE_HEADS.has(word.slice(first.length)) || germanCompound(word.slice(first.length), depth + 1)));
}

/** Whether `word`, already folded, is a word a next question in `language` may be written with. */
export function listedWord(word: string, language: AppLanguage): boolean {
  return LEXICON[language].has(word) || (language === 'de' && germanCompound(word));
}
