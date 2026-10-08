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
import type { AppLanguage } from '../../src/lib/app-language.js';

const list = (text: string) => text.trim().split(/\s+/);
/** Each stem with each ending: "confirm" × ["", "s", "ed", "ing"]. */
const forms = (stems: string, endings: readonly string[]) => list(stems).flatMap(stem => endings.map(end => stem + end));

// ---------- English ----------
const EN_VERBS = `confirm weaken strengthen support break fail climb slip jump rebound recover turn stall slow cool stay remain extend stretch push pull lift weigh help fuel trigger lead outperform underperform show suggest
  point reflect explain mean matter happen look seem appear need follow react respond reach touch test retest reclaim clear cross open stand hover form build grow shrink widen narrow expand contract tighten differ depend
  expect doubt fear overlook work start end defend reject respect limit absorb persist deepen fill`;
/** Written without their final e: "invalidat" is invalidate, invalidates, invalidated, invalidating. */
const EN_VERBS_E = `invalidat chang mov driv ris clos caus continu resum pressur indicat consolidat compar bounc surg spik slid revers fad los mak struggl accelerat eas declin pric ignor underestimat stabiliz rang shap
  produc reduc increas decreas improv argu creat defin describ requir involv`;
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
  ...forms(`asset stock share price market sector index coin token company business trend uptrend downtrend chart candle candlestick pattern level zone area range channel line trendline breakout breakdown pullback bounce rebound
    drop decline fall rise move movement swing dip surge spike correction reversal continuation consolidation retracement retest rally momentum volume volatility strength weakness pressure demand supply sentiment mood
    inflow outflow flow average indicator oscillator divergence crossover high low peak bottom top floor ceiling gap timeframe frame horizon term report result number figure estimate expectation headline event catalyst
    announcement rate yield bond investor trader analyst bull bear institution fund participant read thesis case view picture story narrative scenario setup idea bias outlook reading verdict conclusion argument question
    answer reason cause driver factor risk condition sign change shift difference product launch competitor record structure base wick cycle phase stage streak run reaction response context backdrop headwind tailwind
    peer rival customer point side direction path course pace speed effect impact weight role part piece bank tariff chance rest`, ['', 's']),
  ...forms(EN_VERBS, ['', 's', 'ed', 'ing']),
  ...forms(EN_VERBS_E, ['e', 'es', 'ed', 'ing']),
  ...forms('reach touch cross miss stretch', ['es']),
]);

// ---------- Spanish ----------
const ES_AR = ['ar', 'a', 'an', 'aba', 'aban', 'o', 'aron', 'aria', 'arian', 'e', 'en', 'ase', 'asen', 'ado', 'ada', 'ados', 'adas', 'ando'];
const ES_ER = ['er', 'e', 'en', 'ia', 'ian', 'io', 'ieron', 'eria', 'erian', 'a', 'an', 'iera', 'ieran', 'iese', 'iesen', 'ido', 'ida', 'idos', 'idas', 'iendo'];
const ES_IR = ['ir', 'e', 'en', 'ia', 'ian', 'io', 'ieron', 'iria', 'irian', 'a', 'an', 'iera', 'ieran', 'iese', 'iesen', 'ido', 'ida', 'idos', 'idas', 'iendo'];
const ES = new Set([
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
    cotiz llev deton oblig compar compens anul valid reforz interpret`, ES_AR),
  ...forms('romp perd pierd depend mov muev crec ced suced parec defend respond entend comprend fortalec', ES_ER),
  ...forms('sub ocurr exist resist coincid diverg defin permit interrump converg surg abr', ES_IR),
]);

// ---------- French ----------
const FR_ER = ['er', 'e', 'ent', 'ait', 'aient', 'erait', 'eraient', 'ant', 'ee', 'es', 'ees'];
const FR_IR = ['ir', 'it', 'issent', 'issait', 'issaient', 'irait', 'iraient', 'issant', 'i', 'ie', 'is', 'ies'];
const FR = new Set([
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
    manqu touch test crois clotur ferm form echapp compt renforc augment diminu dur signifi termin commenc dout ignor limit respect bloqu penalis port declench aliment stabilis evolu repos empech tomb interpret confirm`, FR_ER),
  ...forms('affaibl faibl rebond reag franch ralent', FR_IR),
]);

// ---------- Portuguese ----------
const PT_AR = ['ar', 'a', 'am', 'ava', 'avam', 'ou', 'aram', 'aria', 'ariam', 'e', 'em', 'asse', 'assem', 'ado', 'ada', 'ados', 'adas', 'ando'];
const PT_ER = ['er', 'e', 'em', 'ia', 'iam', 'eu', 'eram', 'eria', 'eriam', 'a', 'am', 'esse', 'essem', 'ido', 'ida', 'idos', 'idas', 'endo'];
const PT_IR = ['ir', 'e', 'em', 'ia', 'iam', 'iu', 'iram', 'iria', 'iriam', 'a', 'am', 'isse', 'issem', 'ido', 'ida', 'idos', 'idas', 'indo'];
const PT = new Set([
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
    esgot acab termin dur signific falt fic apoi sustent limit rejeit respeit preocup duvid cheg aproxim afast estagn desaceler aceler pior marc falh ger domin lev deton obrig compar anul valid volt torn derrub interpret`, PT_AR),
  ...forms('romp perd depend mov cresc ced acontec ocorr parec defend respond entend compreend enfraquec fortalec sofr', PT_ER),
  ...forms('sub exist resist coincid diverg contribu repet defin permit abr surg', PT_IR),
]);

// ---------- Italian ----------
const IT_ARE = ['are', 'a', 'ano', 'ava', 'avano', 'o', 'erebbe', 'erebbero', 'i', 'ino', 'asse', 'assero', 'ato', 'ata', 'ati', 'ate', 'ando'];
const IT_ERE = ['ere', 'e', 'ono', 'eva', 'evano', 'erebbe', 'erebbero', 'a', 'ano', 'esse', 'essero', 'uto', 'uta', 'uti', 'ute', 'endo'];
const IT_IRE = ['ire', 'e', 'ono', 'iva', 'ivano', 'irebbe', 'irebbero', 'a', 'ano', 'isse', 'issero', 'ito', 'ita', 'iti', 'ite', 'endo'];
const IT = new Set([
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
    inizi preoccup dubit ignor limit rifiut rispett blocc penalizz port scaten aliment acceler stabilizz arriv torn croll scivol peggior segn interpret`, IT_ARE),
  ...forms('romp perd dipend cresc ced rispond difend', IT_ERE),
  ...forms('esist resist coincid diverg', IT_IRE),
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
  kontext umfeld konkurrenz produkt rolle woche monat quartal jahr tag sitzung handelstag stunde`;
/** What may stand in front of a noun to make a compound: "Wochen|chart", "Kurs|rückgang", "Unterstützungs|zone". */
const DE_FIRST = list(`wochen tages monats jahres stunden quartals kurs preis trend chart markt aktien krypto handels volumen umsatz zins konjunktur unterstutzungs widerstands aufwarts abwarts seitwarts ausbruchs erholungs
  korrektur konsolidierungs stimmungs nachrichten branchen sektor gesamt haupt`);
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
  ...forms(`bullisch barisch neutral stark schwach hoch hoh niedrig tief gross klein wichtig entscheidend echt klar solide fragil stabil instabil flach uberkauft uberverkauft uberdehnt technisch fundamental breit neu alt
    wahrscheinlich unwahrscheinlich moglich gemischt gesund nachhaltig vorubergehend plotzlich scharf fest konstant langsam schnell volatil ruhig schwer leicht typisch ungewohnlich normal ublich ahnlich gegenteilig
    positiv negativ verschieden unterschiedlich allgemein kurzfristig langfristig mittelfristig taglich wochentlich monatlich jahrlich aktuell steigend fallend zunehmend nachlassend`, DE_ADJ),
  ...forms(`bestatig entkraft schwach stark stutz druck belast brems zeig deut bedeut erklar reagier erreich beruhr test kreuz bild fehl folg fuhr verursach beweg erhol dreh kipp stock pausier konsolidier stabilisier
    verlangsam beschleunig begrenz verteidig pass brauch sag wirk erwart befurcht ignorier beunruhig begunstig ermoglich`, DE_VERB),
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
