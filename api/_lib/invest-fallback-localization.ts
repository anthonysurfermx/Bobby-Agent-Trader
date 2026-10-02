import { appLanguage, type AppLanguage } from '../../src/lib/app-language.js';

// Literal translations of the existing fallback narratives. Portfolio policy and values stay in openclaw-chat.
const COPY: Record<string, Record<AppLanguage, readonly [string, string, string]>> = {
  "allocation_split": {
    "en": [
      "BTC should be the core and ETH the growth satellite. For a simple mix, give BTC more weight and keep ETH as an accelerator, not the anchor.",
      "A nearly 50/50 split driven by enthusiasm can let ETH's drawdown knock you out of the plan too early. You need a more stable base and some liquidity to avoid selling in fear.",
      "Red wins, suitability {0} — for a beginner, I prefer BTC leading and ETH complementing it, with a small buffer outside crypto. The final allocation is {1}."
    ],
    "es": [
      "BTC debe ser el núcleo y ETH el satélite de crecimiento. Si quieres una mezcla simple, dale más peso a BTC y deja a ETH como acelerador, no como ancla.",
      "Si te vas casi 50/50 por entusiasmo, el drawdown de ETH te puede sacar del plan antes de tiempo. Necesitas una base más estable y algo de liquidez para no vender con miedo.",
      "Red gana, idoneidad {0} — para un principiante prefiero una mezcla donde BTC mande y ETH complemente, con un pequeño colchón fuera de crypto. La distribución final es {1}."
    ],
    "fr": [
      "BTC doit être le cœur et ETH le satellite de croissance. Pour une répartition simple, donnez plus de poids à BTC et gardez ETH comme accélérateur, pas comme ancrage.",
      "Une répartition presque 50/50 par enthousiasme peut laisser le repli d’ETH vous faire abandonner le plan trop tôt. Il faut une base plus stable et de la liquidité pour ne pas vendre par peur.",
      "Red l’emporte, adéquation {0} — pour un débutant, je préfère BTC en tête et ETH en complément, avec une petite réserve hors crypto. La répartition finale est {1}."
    ],
    "pt": [
      "BTC deve ser o núcleo e ETH o satélite de crescimento. Para uma combinação simples, dá mais peso a BTC e mantém ETH como acelerador, não como âncora.",
      "Uma divisão quase 50/50 por entusiasmo pode fazer com que a queda de ETH te afaste do plano demasiado cedo. Precisas de uma base mais estável e alguma liquidez para não venderes por medo.",
      "Red ganha, adequação {0} — para um principiante, prefiro BTC a liderar e ETH a complementar, com uma pequena reserva fora das criptomoedas. A distribuição final é {1}."
    ],
    "it": [
      "BTC deve essere il nucleo ed ETH il satellite di crescita. Per una combinazione semplice, dai più peso a BTC e usa ETH come acceleratore, non come ancora.",
      "Una ripartizione quasi 50/50 per entusiasmo può far sì che il ribasso di ETH ti faccia abbandonare il piano troppo presto. Serve una base più stabile e un po’ di liquidità per non vendere per paura.",
      "Red vince, adeguatezza {0} — per un principiante, preferisco BTC al centro ed ETH a completarlo, con una piccola riserva fuori dalle criptovalute. La ripartizione finale è {1}."
    ],
    "de": [
      "BTC sollte den Kern bilden und ETH der Wachstumssatellit sein. Gewichte BTC für eine einfache Mischung stärker und nutze ETH als Beschleuniger, nicht als Anker.",
      "Eine fast hälftige Aufteilung aus Begeisterung kann dazu führen, dass dich der Rückgang von ETH zu früh aus dem Plan drängt. Du brauchst eine stabilere Basis und etwas Liquidität, um nicht aus Angst zu verkaufen.",
      "Red gewinnt, Eignung {0} — für Einsteiger bevorzuge ich BTC als Kern mit ETH als Ergänzung und einem kleinen Puffer außerhalb von Krypto. Die endgültige Aufteilung ist {1}."
    ]
  },
  "cash_buffer_first": {
    "en": [
      "Investing part of it makes sense, but not all of it. Put the capital you do not need tomorrow to work and keep a real reserve.",
      "Without a buffer, any unexpected expense can force you to liquidate at a bad time. Liquidity first, then risk; reversing that order usually ends badly.",
      "Red wins, suitability {0} — before thinking about upside, define a cash buffer and invest only the rest with discipline. For the invested capital, the final mix is {1}."
    ],
    "es": [
      "Sí conviene invertir una parte, pero no todo. Lo correcto es poner a trabajar el capital que no necesitas mañana y dejar una reserva real.",
      "Si no tienes colchón, cualquier imprevisto te obliga a liquidar en mal momento. Primero liquidez, luego riesgo; al revés casi siempre termina mal.",
      "Red gana, idoneidad {0} — antes de pensar en upside, define un buffer de efectivo y solo invierte el resto con disciplina. Para el capital invertido, la mezcla final es {1}."
    ],
    "fr": [
      "Investir une partie est pertinent, mais pas la totalité. Faites travailler le capital dont vous n’avez pas besoin demain et gardez une vraie réserve.",
      "Sans réserve, tout imprévu peut vous obliger à vendre au mauvais moment. D’abord la liquidité, ensuite le risque ; l’ordre inverse se termine presque toujours mal.",
      "Red l’emporte, adéquation {0} — avant de penser au potentiel de hausse, définissez une réserve de liquidités et investissez seulement le reste avec discipline. Pour le capital investi, la répartition finale est {1}."
    ],
    "pt": [
      "Faz sentido investir uma parte, mas não tudo. Põe a trabalhar o capital de que não precisas amanhã e mantém uma reserva real.",
      "Sem uma reserva, qualquer imprevisto te obriga a liquidar numa má altura. Primeiro liquidez, depois risco; inverter a ordem quase sempre acaba mal.",
      "Red ganha, adequação {0} — antes de pensar na valorização, define uma reserva de dinheiro e investe só o restante com disciplina. Para o capital investido, a combinação final é {1}."
    ],
    "it": [
      "Ha senso investire una parte, ma non tutto. Metti al lavoro il capitale che non ti serve domani e mantieni una vera riserva.",
      "Senza una riserva, qualsiasi imprevisto ti costringe a liquidare nel momento sbagliato. Prima la liquidità, poi il rischio; invertire l’ordine finisce quasi sempre male.",
      "Red vince, adeguatezza {0} — prima di pensare al rialzo, definisci una riserva di liquidità e investi solo il resto con disciplina. Per il capitale investito, la combinazione finale è {1}."
    ],
    "de": [
      "Einen Teil zu investieren ist sinnvoll, aber nicht alles. Lass das Kapital arbeiten, das du morgen nicht brauchst, und behalte eine echte Reserve.",
      "Ohne Puffer kann dich jede unerwartete Ausgabe zwingen, zu einem schlechten Zeitpunkt zu verkaufen. Erst Liquidität, dann Risiko; die umgekehrte Reihenfolge endet fast immer schlecht.",
      "Red gewinnt, Eignung {0} — definiere vor dem Blick auf Kurschancen einen Bargeldpuffer und investiere nur den Rest diszipliniert. Für das investierte Kapital ist die endgültige Mischung {1}."
    ]
  },
  "capital_preservation": {
    "en": [
      "You can grow capital without a coin toss by keeping risk small and liquidity high. The idea is to move forward without one bad week forcing you out of the market.",
      "When fear is already high, an aggressive portfolio becomes unbearable in practice. Without protecting the downside first, the user will not follow the plan.",
      "Red wins, suitability {0} — capital preservation and operational simplicity come first here. The final mix is {1}."
    ],
    "es": [
      "Puedes crecer el capital sin jugarte una moneda al aire si mantienes riesgo pequeño y liquidez alta. La idea es avanzar sin que una mala semana te saque del mercado.",
      "Cuando el miedo ya está alto, cualquier cartera agresiva se vuelve invivible en la práctica. Si no proteges primero el downside, el usuario no va a seguir el plan.",
      "Red gana, idoneidad {0} — aquí manda la preservación de capital y la simplicidad operativa. La mezcla final es {1}."
    ],
    "fr": [
      "Vous pouvez faire croître le capital sans jouer à pile ou face en limitant le risque et en gardant une forte liquidité. L’idée est d’avancer sans qu’une mauvaise semaine vous fasse quitter le marché.",
      "Lorsque la peur est déjà élevée, un portefeuille agressif devient insupportable en pratique. Sans protéger d’abord contre les pertes, l’utilisateur ne suivra pas le plan.",
      "Red l’emporte, adéquation {0} — la préservation du capital et la simplicité opérationnelle passent ici en premier. La répartition finale est {1}."
    ],
    "pt": [
      "Podes fazer crescer o capital sem jogar uma moeda ao ar se mantiveres o risco pequeno e a liquidez elevada. A ideia é avançar sem que uma má semana te afaste do mercado.",
      "Quando o medo já é elevado, uma carteira agressiva torna-se insuportável na prática. Sem proteger primeiro contra as perdas, o utilizador não vai seguir o plano.",
      "Red ganha, adequação {0} — aqui, a preservação do capital e a simplicidade operacional vêm primeiro. A combinação final é {1}."
    ],
    "it": [
      "Puoi far crescere il capitale senza affidarti al lancio di una moneta mantenendo basso il rischio e alta la liquidità. L’idea è avanzare senza che una brutta settimana ti faccia uscire dal mercato.",
      "Quando la paura è già alta, un portafoglio aggressivo diventa insostenibile nella pratica. Senza proteggere prima dalle perdite, l’utente non seguirà il piano.",
      "Red vince, adeguatezza {0} — qui vengono prima la conservazione del capitale e la semplicità operativa. La combinazione finale è {1}."
    ],
    "de": [
      "Du kannst Kapital aufbauen, ohne es einem Münzwurf zu überlassen, wenn du das Risiko klein und die Liquidität hoch hältst. Es geht darum, voranzukommen, ohne dass eine schlechte Woche dich aus dem Markt drängt.",
      "Wenn die Angst bereits groß ist, wird ein aggressives Portfolio in der Praxis unerträglich. Ohne zuerst mögliche Verluste zu begrenzen, wird der Nutzer den Plan nicht befolgen.",
      "Red gewinnt, Eignung {0} — hier haben Kapitalerhalt und einfache Abläufe Vorrang. Die endgültige Mischung ist {1}."
    ]
  },
  "retirement_plan": {
    "en": [
      "Ten years is enough to accumulate if you combine growth with discipline and do not depend on a single crypto narrative. You want a portfolio that compounds, not a bet that forces you to start over.",
      "Trying to retire on crypto alone exposes you to sequence risk at the worst moment. You need assets that survive more than one cycle and liquidity to rebalance.",
      "Red wins, suitability {0} — for a 10-year goal, I prefer a diversified base with crypto as a growth sleeve rather than the whole plan. The final mix is {1}."
    ],
    "es": [
      "Diez años alcanzan para acumular si combinas crecimiento con disciplina y no dependes de una sola narrativa crypto. Quieres un portafolio que componga, no una apuesta que te obligue a reiniciar.",
      "Si intentas jubilarte solo con crypto, el riesgo de secuencia te puede romper justo cuando más importa. Necesitas activos que sobrevivan más de un ciclo y liquidez para rebalancear.",
      "Red gana, idoneidad {0} — para un objetivo de 10 años prefiero una base diversificada, con crypto como sleeve de crecimiento y no como todo el plan. La mezcla final es {1}."
    ],
    "fr": [
      "Dix ans suffisent pour accumuler si vous combinez croissance et discipline sans dépendre d’un seul récit crypto. Vous voulez un portefeuille qui capitalise, pas un pari qui vous oblige à repartir de zéro.",
      "Vouloir prendre sa retraite uniquement avec la crypto expose au risque de séquence au moment le plus critique. Il faut des actifs qui traversent plusieurs cycles et de la liquidité pour rééquilibrer.",
      "Red l’emporte, adéquation {0} — pour un objectif à 10 ans, je préfère une base diversifiée, avec la crypto comme poche de croissance plutôt que comme plan entier. La répartition finale est {1}."
    ],
    "pt": [
      "Dez anos chegam para acumular se combinares crescimento com disciplina e não dependeres de uma única narrativa cripto. Queres uma carteira que capitalize, não uma aposta que te obrigue a recomeçar.",
      "Tentar reformar-te só com criptomoedas expõe-te ao risco de sequência quando mais importa. Precisas de ativos que sobrevivam a mais de um ciclo e de liquidez para reequilibrar.",
      "Red ganha, adequação {0} — para um objetivo de 10 anos, prefiro uma base diversificada, com criptomoedas como parcela de crescimento e não como o plano inteiro. A combinação final é {1}."
    ],
    "it": [
      "Dieci anni bastano per accumulare se unisci crescita e disciplina e non dipendi da una sola narrativa crypto. Vuoi un portafoglio che capitalizzi, non una scommessa che ti costringa a ricominciare.",
      "Puntare alla pensione solo con le criptovalute ti espone al rischio di sequenza proprio quando conta di più. Servono asset che superino più di un ciclo e liquidità per ribilanciare.",
      "Red vince, adeguatezza {0} — per un obiettivo a 10 anni, preferisco una base diversificata, con le criptovalute come componente di crescita e non come intero piano. La combinazione finale è {1}."
    ],
    "de": [
      "Zehn Jahre reichen zum Aufbau, wenn du Wachstum mit Disziplin verbindest und nicht von einer einzigen Krypto-Erzählung abhängst. Du willst ein Portfolio mit Zinseszinseffekt, keine Wette, die dich zum Neustart zwingt.",
      "Wer allein mit Krypto in den Ruhestand gehen will, ist genau dann einem Renditereihenfolgerisiko ausgesetzt, wenn es besonders darauf ankommt. Du brauchst Vermögenswerte, die mehr als einen Zyklus überstehen, und Liquidität zum Umschichten.",
      "Red gewinnt, Eignung {0} — für ein 10-Jahres-Ziel bevorzuge ich eine diversifizierte Basis mit Krypto als Wachstumskomponente statt als gesamten Plan. Die endgültige Mischung ist {1}."
    ]
  },
  "btc_accumulation": {
    "en": [
      "The best way to accumulate BTC is not to guess the bottom, but to buy in stages and keep a reserve for declines. That gives you exposure without exhausting yourself in one entry.",
      "Going all-in today turns accumulation into a timing bet. You need dry powder and a portfolio that withstands volatility without forcing you to exit.",
      "Red wins, suitability {0} — yes to accumulating BTC, but with DCA and liquidity reserves to keep buying with a clear head. The final mix is {1}."
    ],
    "es": [
      "La mejor forma de acumular BTC no es adivinar el piso, sino comprar por tramos y mantener reserva para caídas. Así capturas el activo sin quemarte en una sola entrada.",
      "Si te vas all-in hoy, conviertes una estrategia de acumulación en una apuesta de timing. Necesitas pólvora seca y una cartera que aguante volatilidad sin obligarte a salir.",
      "Red gana, idoneidad {0} — sí a acumular BTC, pero con DCA y reserva de liquidez para seguir comprando con cabeza fría. La mezcla final es {1}."
    ],
    "fr": [
      "La meilleure façon d’accumuler BTC n’est pas de deviner le point bas, mais d’acheter par étapes et de garder une réserve pour les baisses. Vous vous exposez ainsi à l’actif sans tout engager sur une seule entrée.",
      "Tout investir aujourd’hui transforme l’accumulation en pari sur le timing. Il faut des liquidités disponibles et un portefeuille qui supporte la volatilité sans vous obliger à sortir.",
      "Red l’emporte, adéquation {0} — oui à l’accumulation de BTC, mais avec des achats réguliers et une réserve de liquidités pour garder la tête froide. La répartition finale est {1}."
    ],
    "pt": [
      "A melhor forma de acumular BTC não é adivinhar o fundo, mas comprar por etapas e manter uma reserva para quedas. Assim, tens exposição ao ativo sem te esgotares numa só entrada.",
      "Investir tudo hoje transforma a acumulação numa aposta de timing. Precisas de capital disponível e de uma carteira que aguente a volatilidade sem te obrigar a sair.",
      "Red ganha, adequação {0} — sim à acumulação de BTC, mas com DCA e reserva de liquidez para continuar a comprar com cabeça fria. A combinação final é {1}."
    ],
    "it": [
      "Il modo migliore per accumulare BTC non è indovinare il minimo, ma comprare per fasi e mantenere una riserva per i ribassi. Così ottieni esposizione all’asset senza esaurirti in un solo ingresso.",
      "Investire tutto oggi trasforma l’accumulo in una scommessa sul timing. Servono risorse disponibili e un portafoglio che regga la volatilità senza costringerti a uscire.",
      "Red vince, adeguatezza {0} — sì all’accumulo di BTC, ma con DCA e riserva di liquidità per continuare a comprare a mente fredda. La combinazione finale è {1}."
    ],
    "de": [
      "BTC sammelst du am besten, indem du schrittweise kaufst und eine Reserve für Rückgänge behältst, statt den Tiefpunkt zu erraten. So bekommst du Zugang zum Vermögenswert, ohne alles bei einem Einstieg aufzubrauchen.",
      "Heute alles einzusetzen macht aus dem Aufbau eine Timing-Wette. Du brauchst verfügbares Kapital und ein Portfolio, das Schwankungen aushält, ohne dich zum Ausstieg zu zwingen.",
      "Red gewinnt, Eignung {0} — ja zum Aufbau von BTC, aber mit DCA und Liquiditätsreserve, um weiterhin mit kühlem Kopf zu kaufen. Die endgültige Mischung ist {1}."
    ]
  },
  "salary_bucket": {
    "en": [
      "If you already have a buffer, starting with 15% to 20% of your salary is enough to build wealth without squeezing cash flow. Automate it and do not chase candles.",
      "Without an emergency fund, putting too much salary into the market leaves you exposed to any expense. A sustainable rate you can repeat every month is better.",
      "Red wins, suitability {0} — for a beginner, 10% to 15% of salary is a good start until 3-6 months of expenses are covered. Within the invested bucket, the final mix is {1}."
    ],
    "es": [
      "Si ya tienes colchón, empezar con 15% a 20% de tu sueldo es suficiente para construir patrimonio sin asfixiar tu caja. Lo importante es automatizar y no perseguir velas.",
      "Si no tienes fondo de emergencia, meter demasiado sueldo al mercado te deja vendido ante cualquier gasto. Mejor una tasa sostenible que puedas repetir todos los meses.",
      "Red gana, idoneidad {0} — para un principiante, 10% a 15% de tu sueldo es buen inicio hasta cubrir 3-6 meses de gastos. Dentro del bucket invertido, la mezcla final es {1}."
    ],
    "fr": [
      "Si vous avez déjà une réserve, commencer avec 15 % à 20 % de votre salaire suffit pour construire un patrimoine sans étouffer votre trésorerie. L’important est d’automatiser et de ne pas courir après les bougies.",
      "Sans fonds d’urgence, investir une trop grande part du salaire vous expose à la moindre dépense. Mieux vaut un taux soutenable que vous pouvez répéter chaque mois.",
      "Red l’emporte, adéquation {0} — pour un débutant, 10 % à 15 % du salaire est un bon départ jusqu’à couvrir 3 à 6 mois de dépenses. Dans la poche investie, la répartition finale est {1}."
    ],
    "pt": [
      "Se já tens uma reserva, começar com 15% a 20% do salário chega para construir património sem sufocar a liquidez. O importante é automatizar e não perseguir velas.",
      "Sem um fundo de emergência, investir demasiado salário deixa-te exposto a qualquer despesa. É melhor uma taxa sustentável que possas repetir todos os meses.",
      "Red ganha, adequação {0} — para um principiante, 10% a 15% do salário é um bom começo até cobrir 3-6 meses de despesas. Dentro da parcela investida, a combinação final é {1}."
    ],
    "it": [
      "Se hai già una riserva, iniziare con il 15%–20% dello stipendio basta per costruire patrimonio senza soffocare la liquidità. L’importante è automatizzare e non inseguire le candele.",
      "Senza un fondo di emergenza, investire troppo stipendio ti lascia esposto a qualsiasi spesa. Meglio una quota sostenibile che puoi ripetere ogni mese.",
      "Red vince, adeguatezza {0} — per un principiante, il 10%–15% dello stipendio è un buon inizio fino a coprire 3–6 mesi di spese. Nella quota investita, la combinazione finale è {1}."
    ],
    "de": [
      "Wenn du bereits einen Puffer hast, reichen anfangs 15 % bis 20 % deines Gehalts zum Vermögensaufbau, ohne den Geldfluss abzuwürgen. Automatisiere das und jage keinen Kerzen hinterher.",
      "Ohne Notfallreserve lässt dich ein zu großer investierter Gehaltsanteil bei jeder Ausgabe ungeschützt. Besser ist eine tragfähige Quote, die du jeden Monat wiederholen kannst.",
      "Red gewinnt, Eignung {0} — für Einsteiger sind 10 % bis 15 % des Gehalts ein guter Anfang, bis 3–6 Monate Ausgaben abgedeckt sind. Innerhalb des investierten Anteils ist die endgültige Mischung {1}."
    ]
  },
  "yield_safety": {
    "en": [
      "Lido can be useful, but as a small sleeve within a broader plan. The value is adding yield without turning all your wealth into smart-contract risk.",
      "Putting Lido at the center of the portfolio mixes protocol, liquidity and execution risks for someone who probably wants simplicity. Keep it limited and maintain reserves.",
      "Red wins, suitability {0} — I would use liquid staking only as a moderate part of the plan, never the whole plan. The final mix is {1}."
    ],
    "es": [
      "Lido puede servir, pero como sleeve pequeño dentro de un plan más amplio. El valor está en sumar rendimiento sin convertir todo tu patrimonio en riesgo de smart contract.",
      "Si haces de Lido el centro de la cartera, mezclas riesgo de protocolo, liquidez y ejecución para un perfil que probablemente quiere simplicidad. Mejor mantenerlo acotado y con reservas.",
      "Red gana, idoneidad {0} — usaría staking líquido solo como una parte moderada del plan, nunca como el plan completo. La mezcla final es {1}."
    ],
    "fr": [
      "Lido peut être utile, mais comme petite poche dans un plan plus large. L’intérêt est d’ajouter du rendement sans exposer tout votre patrimoine au risque de contrat intelligent.",
      "Placer Lido au cœur du portefeuille mélange les risques de protocole, de liquidité et d’exécution pour un profil qui recherche probablement la simplicité. Mieux vaut limiter cette poche et garder des réserves.",
      "Red l’emporte, adéquation {0} — j’utiliserais le staking liquide comme une partie modérée du plan, jamais comme le plan entier. La répartition finale est {1}."
    ],
    "pt": [
      "Lido pode ser útil, mas como uma pequena parcela num plano mais amplo. O valor está em acrescentar rendimento sem transformar todo o património em risco de contrato inteligente.",
      "Colocar Lido no centro da carteira mistura riscos de protocolo, liquidez e execução para um perfil que provavelmente quer simplicidade. É melhor limitar essa parcela e manter reservas.",
      "Red ganha, adequação {0} — usaria staking líquido apenas como uma parte moderada do plano, nunca como o plano inteiro. A combinação final é {1}."
    ],
    "it": [
      "Lido può essere utile, ma come piccola componente di un piano più ampio. Il valore è aggiungere rendimento senza trasformare tutto il patrimonio in rischio di smart contract.",
      "Mettere Lido al centro del portafoglio mescola rischi di protocollo, liquidità ed esecuzione per un profilo che probabilmente vuole semplicità. Meglio limitarne il peso e mantenere riserve.",
      "Red vince, adeguatezza {0} — userei il liquid staking solo come parte moderata del piano, mai come intero piano. La combinazione finale è {1}."
    ],
    "de": [
      "Lido kann nützlich sein, aber als kleiner Anteil eines umfassenderen Plans. Es geht um zusätzliche Erträge, ohne das gesamte Vermögen dem Smart-Contract-Risiko auszusetzen.",
      "Lido ins Zentrum des Portfolios zu stellen vermischt Protokoll-, Liquiditäts- und Ausführungsrisiken für jemanden, der wahrscheinlich Einfachheit sucht. Halte diesen Anteil begrenzt und behalte Reserven.",
      "Red gewinnt, Eignung {0} — ich würde Liquid Staking nur als moderaten Teil des Plans einsetzen, niemals als gesamten Plan. Die endgültige Mischung ist {1}."
    ]
  },
  "crypto_core_diversification": {
    "en": [
      "To diversify across BTC, ETH and SOL, use a clear core with different weights. BTC holds up better, ETH adds ecosystem exposure, and SOL should be a smaller sleeve.",
      "Giving SOL too much weight turns diversification into another high-beta bet. You need a hierarchy across assets and some liquidity to rebalance.",
      "Red wins, suitability {0} — the core should rest on BTC and ETH, with SOL as a secondary bet and a reserve to avoid overtrading. The final mix is {1}."
    ],
    "es": [
      "Si quieres diversificar entre BTC, ETH y SOL, hazlo con un núcleo claro y tamaños distintos. BTC aguanta mejor, ETH aporta ecosistema y SOL debe ir como sleeve más pequeño.",
      "Si das demasiado peso a SOL, conviertes una diversificación en otra apuesta de beta alta. Necesitas jerarquía entre activos y algo de liquidez para rebalancear.",
      "Red gana, idoneidad {0} — el core debe descansar en BTC y ETH, con SOL como apuesta secundaria y una reserva para no sobreoperar. La mezcla final es {1}."
    ],
    "fr": [
      "Pour diversifier entre BTC, ETH et SOL, gardez un cœur clair et des poids différents. BTC résiste mieux, ETH apporte son écosystème et SOL doit rester une poche plus petite.",
      "Donner trop de poids à SOL transforme la diversification en nouveau pari à bêta élevé. Il faut une hiérarchie entre actifs et de la liquidité pour rééquilibrer.",
      "Red l’emporte, adéquation {0} — le cœur doit reposer sur BTC et ETH, avec SOL comme pari secondaire et une réserve pour éviter de trop trader. La répartition finale est {1}."
    ],
    "pt": [
      "Para diversificar entre BTC, ETH e SOL, mantém um núcleo claro e pesos diferentes. BTC resiste melhor, ETH acrescenta o seu ecossistema e SOL deve ser uma parcela menor.",
      "Dar demasiado peso a SOL transforma a diversificação noutra aposta de beta elevado. Precisas de uma hierarquia entre ativos e alguma liquidez para reequilibrar.",
      "Red ganha, adequação {0} — o núcleo deve assentar em BTC e ETH, com SOL como aposta secundária e uma reserva para evitar excesso de operações. A combinação final é {1}."
    ],
    "it": [
      "Per diversificare tra BTC, ETH e SOL, mantieni un nucleo chiaro e pesi diversi. BTC resiste meglio, ETH aggiunge esposizione al suo ecosistema e SOL deve essere una componente più piccola.",
      "Dare troppo peso a SOL trasforma la diversificazione in un’altra scommessa ad alto beta. Servono una gerarchia tra asset e liquidità per ribilanciare.",
      "Red vince, adeguatezza {0} — il nucleo deve poggiare su BTC ed ETH, con SOL come scommessa secondaria e una riserva per non operare troppo. La combinazione finale è {1}."
    ],
    "de": [
      "Nutze zur Diversifikation zwischen BTC, ETH und SOL einen klaren Kern und unterschiedliche Gewichte. BTC hält besser stand, ETH bietet Zugang zu seinem Ökosystem und SOL sollte ein kleinerer Anteil bleiben.",
      "Ein zu hoher SOL-Anteil macht aus Diversifikation eine weitere Wette mit hohem Beta. Du brauchst eine Rangfolge der Vermögenswerte und etwas Liquidität zum Umschichten.",
      "Red gewinnt, Eignung {0} — der Kern sollte auf BTC und ETH beruhen, mit SOL als Nebenwette und einer Reserve gegen übermäßiges Handeln. Die endgültige Mischung ist {1}."
    ]
  },
  "default": {
    "en": [
      "Choose a simple mix with real upside, without forcing a heroic bet. Gain exposure to growth and keep liquidity so the first decline does not break you.",
      "Too much concentrated risk or complexity makes a beginner abandon the plan before it matures. Reduce drawdown and leave room to wait for better conditions.",
      "Red wins, suitability {0} — prioritize survival, diversification and clarity over excitement. The final mix is {1}."
    ],
    "es": [
      "Ve por una mezcla simple con upside real, pero sin forzar una apuesta heroica. La idea buena aquí es exponerte al crecimiento y mantener liquidez para no romperte en la primera caída.",
      "Si concentras demasiado riesgo o complejidad, un principiante abandona el plan antes de que madure. Hay que bajar drawdown y dejar espacio para esperar mejores condiciones.",
      "Red gana, idoneidad {0} — prioriza supervivencia, diversificación y claridad antes que emoción. La mezcla final es {1}."
    ],
    "fr": [
      "Choisissez une répartition simple avec un vrai potentiel de hausse, sans forcer un pari héroïque. Exposez-vous à la croissance et gardez de la liquidité pour ne pas céder à la première baisse.",
      "Trop de risque concentré ou de complexité fait abandonner le plan à un débutant avant qu’il porte ses fruits. Réduisez le repli et gardez de la marge pour attendre de meilleures conditions.",
      "Red l’emporte, adéquation {0} — privilégiez la survie, la diversification et la clarté plutôt que l’excitation. La répartition finale est {1}."
    ],
    "pt": [
      "Escolhe uma combinação simples com potencial real de valorização, sem forçar uma aposta heroica. Procura exposição ao crescimento e mantém liquidez para não quebrares na primeira queda.",
      "Concentrar demasiado risco ou complexidade faz um principiante abandonar o plano antes de amadurecer. Reduz as perdas e deixa espaço para esperar por melhores condições.",
      "Red ganha, adequação {0} — dá prioridade à sobrevivência, diversificação e clareza em vez da emoção. A combinação final é {1}."
    ],
    "it": [
      "Scegli una combinazione semplice con un vero potenziale di rialzo, senza forzare una scommessa eroica. Cerca esposizione alla crescita e mantieni liquidità per non cedere al primo ribasso.",
      "Troppo rischio concentrato o troppa complessità fanno abbandonare il piano a un principiante prima che maturi. Riduci le perdite e lascia margine per attendere condizioni migliori.",
      "Red vince, adeguatezza {0} — dai priorità a sopravvivenza, diversificazione e chiarezza anziché all’emozione. La combinazione finale è {1}."
    ],
    "de": [
      "Wähle eine einfache Mischung mit echten Kurschancen, ohne eine Heldenwette zu erzwingen. Beteilige dich am Wachstum und behalte Liquidität, damit der erste Rückgang dich nicht aus der Bahn wirft.",
      "Zu viel konzentriertes Risiko oder Komplexität lässt Einsteiger den Plan aufgeben, bevor er reift. Begrenze Rückgänge und behalte Spielraum, um bessere Bedingungen abzuwarten.",
      "Red gewinnt, Eignung {0} — setze Überleben, Diversifikation und Klarheit vor Aufregung. Die endgültige Mischung ist {1}."
    ]
  }
};

export function investFallbackText(language: string, template: string, score: string, summary: string): string {
  const lines = (COPY[template] ?? COPY.default)[appLanguage(language)];
  const markers = ['ALPHA HUNTER', 'RED TEAM', 'MY VERDICT'];
  return lines.map((line, index) => `**${markers[index]}:** ${line.replaceAll('{0}', score).replaceAll('{1}', summary)}`).join('\n\n');
}

const LABELS: Record<AppLanguage, readonly [string, string, string, string]> = {
  en: ['cash', 'USDC yield', 'stETH in Lido', 'bonds'],
  es: ['efectivo', 'USDC en rendimiento', 'stETH en Lido', 'bonos'],
  fr: ['liquidités', 'USDC en rendement', 'stETH sur Lido', 'obligations'],
  pt: ['dinheiro', 'USDC em rendimento', 'stETH na Lido', 'obrigações'],
  it: ['liquidità', 'USDC a rendimento', 'stETH su Lido', 'obbligazioni'],
  de: ['Bargeld', 'USDC mit Ertrag', 'stETH bei Lido', 'Anleihen'],
};
export function investSummaryLabel(language: string, symbol: string, pct: number): string {
  const labels = LABELS[appLanguage(language)];
  const name = symbol === 'CASH' ? labels[0] : symbol.startsWith('USDC@') ? labels[1] : symbol === 'STETH@LIDO' ? labels[2] : symbol === 'BND' ? labels[3] : symbol;
  return `${name} ${pct}%`;
}
