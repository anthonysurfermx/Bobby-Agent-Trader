import Foundation

extension NativeTranslations18 {
    /// The harness: the offer and the move on the glass, the follow-up notifications, the board,
    /// the notes on the Memory screen, the sectors. The glass lines stay under 46 characters and the
    /// buttons under 22. The notification's "Stop" action uses the shared row `Stop`.
    static let harness: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        // The lock screen: where it came from, and what a phone that hides previews shows instead.
        result["{0}: back to your question."] = ["fr": "{0} : on revient à ta question.", "pt": "{0}: de volta à tua pergunta.", "it": "{0}: torniamo alla tua domanda.", "de": "{0}: zurück zu deiner Frage."]
        result["Back to your question."] = ["fr": "On revient à ta question.", "pt": "De volta à tua pergunta.", "it": "Torniamo alla tua domanda.", "de": "Zurück zu deiner Frage."]
        result["Your week."] = ["fr": "Ta semaine.", "pt": "A tua semana.", "it": "La tua settimana.", "de": "Deine Woche."]
        result["{0} today. {1} is part of it."] = ["fr": "{0} aujourd’hui. {1} en fait partie.", "pt": "{0} hoje. {1} faz parte.", "it": "{0} oggi. {1} ne fa parte.", "de": "{0} heute. {1} gehört dazu."]
        result["Your week with {0}."] = ["fr": "Ta semaine avec {0}.", "pt": "A tua semana com {0}.", "it": "La tua settimana con {0}.", "de": "Deine Woche mit {0}."]
        result["Your week: {0} and {1} more."] = ["fr": "Ta semaine : {0} et {1} de plus.", "pt": "A tua semana: {0} e mais {1}.", "it": "La tua settimana: {0} e altri {1}.", "de": "Deine Woche: {0} und {1} weitere."]
        // The glass.
        result["Shall I keep you posted on {0}?"] = ["fr": "Je te tiens au courant pour {0} ?", "pt": "Vou-te contando como vai a {0}?", "it": "Ti tengo aggiornato su {0}?", "de": "Halte ich dich zu {0} auf dem Laufenden?"]
        result["Shall I keep you posted on this?"] = ["fr": "Je te tiens au courant ?", "pt": "Vou-te contando como vai?", "it": "Ti tengo aggiornato?", "de": "Halte ich dich auf dem Laufenden?"]
        result["Yes, tell me"] = ["fr": "Oui, dis-moi", "pt": "Sim, conta-me", "it": "Sì, dimmelo", "de": "Ja, sag es mir"]
        result["{0}, a day later"] = ["fr": "{0}, un jour plus tard", "pt": "{0}, um dia depois", "it": "{0}, un giorno dopo", "de": "{0}, einen Tag später"]
        result["{0}, {1} days later"] = ["fr": "{0}, {1} jours plus tard", "pt": "{0}, {1} dias depois", "it": "{0}, {1} giorni dopo", "de": "{0}, {1} Tage später"]
        result["{0} is where you left it"] = ["fr": "{0} est là où tu l’as laissé", "pt": "{0} está onde o deixaste", "it": "{0} è dove l’hai lasciato", "de": "{0} steht, wo du es gelassen hast"]
        result["{0} {1} since you asked"] = ["fr": "{0} {1} depuis ta question", "pt": "{0} {1} desde que perguntaste", "it": "{0} {1} da quando hai chiesto", "de": "{0} {1} seit deiner Frage"]
        result["What changed?"] = ["fr": "Quoi de neuf ?", "pt": "O que mudou?", "it": "Cosa è cambiato?", "de": "Was hat sich getan?"]
        result["Got it"] = ["fr": "Compris", "pt": "Entendido", "it": "Capito", "de": "Verstanden"]
        // The questions asked on the person's tap.
        result["What changed in {0} since I asked?"] = ["fr": "Qu’est-ce qui a changé pour {0} depuis ma question ?", "pt": "O que mudou em {0} desde que perguntei?", "it": "Cosa è cambiato in {0} da quando ho chiesto?", "de": "Was hat sich bei {0} getan, seit ich gefragt habe?"]
        result["How does {0} look today?"] = ["fr": "Comment se présente {0} aujourd’hui ?", "pt": "Como está {0} hoje?", "it": "Come si presenta {0} oggi?", "de": "Wie sieht {0} heute aus?"]
        // The board.
        result["Your week"] = ["fr": "Ta semaine", "pt": "A tua semana", "it": "La tua settimana", "de": "Deine Woche"]
        result["Since you asked"] = ["fr": "Depuis ta question", "pt": "Desde que perguntaste", "it": "Da quando hai chiesto", "de": "Seit deiner Frage"]
        result["Last 24 hours"] = ["fr": "Dernières 24 heures", "pt": "Últimas 24 horas", "it": "Ultime 24 ore", "de": "Letzte 24 Stunden"]
        result["Nothing to show yet."] = ["fr": "Rien à montrer pour l’instant.", "pt": "Ainda nada para mostrar.", "it": "Ancora niente da mostrare.", "de": "Noch nichts zu zeigen."]
        result["Tap one to ask Bobby."] = ["fr": "Touche-en un pour demander à Bobby.", "pt": "Toca num para perguntar ao Bobby.", "it": "Toccane uno per chiedere a Bobby.", "de": "Tippe auf eins, um Bobby zu fragen."]
        // The switch.
        result["Follow-ups"] = ["fr": "Suivis", "pt": "Seguimento", "it": "Aggiornamenti", "de": "Follow-ups"]
        result["Bobby comes back to what you asked."] = ["fr": "Bobby revient sur ce que tu as demandé.", "pt": "O Bobby volta ao que perguntaste.", "it": "Bobby torna su ciò che hai chiesto.", "de": "Bobby kommt auf deine Fragen zurück."]
        // The notes (Memory, "On this iPhone"): what the phone keeps for follow-ups, in sentences.
        result["Notes Bobby keeps on this iPhone to choose when to come back. They are not sent to the AI."] = ["fr": "Notes que Bobby garde sur cet iPhone pour choisir quand revenir. Elles ne sont pas envoyées à l’IA.", "pt": "Notas que o Bobby guarda neste iPhone para escolher quando voltar. Não são enviadas à IA.", "it": "Note che Bobby tiene su questo iPhone per scegliere quando tornare. Non vengono inviate all’IA.", "de": "Notizen, die Bobby auf diesem iPhone behält, um zu wählen, wann es sich meldet. Sie gehen nicht an die KI."]
        result["Follow-ups are off."] = ["fr": "Les suivis sont désactivés.", "pt": "O seguimento está desligado.", "it": "Gli aggiornamenti sono disattivati.", "de": "Follow-ups sind aus."]
        result["No follow-up notes."] = ["fr": "Aucune note de suivi.", "pt": "Sem notas de seguimento.", "it": "Nessuna nota sugli aggiornamenti.", "de": "Keine Follow-up-Notizen."]
        result["Erase"] = ["fr": "Effacer", "pt": "Apagar", "it": "Cancella", "de": "Löschen"]
        result["Erase notes"] = ["fr": "Effacer les notes", "pt": "Apagar notas", "it": "Cancella le note", "de": "Notizen löschen"]
        result["Erase the notes about {0}"] = ["fr": "Effacer les notes sur {0}", "pt": "Apagar as notas sobre {0}", "it": "Cancella le note su {0}", "de": "Notizen zu {0} löschen"]
        result["Asked once, on {0}."] = ["fr": "Demandé une fois, le {0}.", "pt": "Perguntaste uma vez, a {0}.", "it": "Chiesto una volta, il {0}.", "de": "Einmal gefragt, am {0}."]
        result["Asked {0} times, last on {1}."] = ["fr": "Demandé {0} fois, la dernière le {1}.", "pt": "Perguntaste {0} vezes, a última a {1}.", "it": "Chiesto {0} volte, l’ultima il {1}.", "de": "{0}-mal gefragt, zuletzt am {1}."]
        result["One read from a question Bobby wrote."] = ["fr": "Une analyse à partir d’une question écrite par Bobby.", "pt": "Uma análise a partir de uma pergunta escrita pelo Bobby.", "it": "Un’analisi da una domanda scritta da Bobby.", "de": "Eine Analyse aus einer Frage, die Bobby geschrieben hat."]
        result["{0} reads from questions Bobby wrote."] = ["fr": "{0} analyses à partir de questions écrites par Bobby.", "pt": "{0} análises a partir de perguntas escritas pelo Bobby.", "it": "{0} analisi da domande scritte da Bobby.", "de": "{0} Analysen aus Fragen, die Bobby geschrieben hat."]
        result["“Since you asked” lines shown: {0}."] = ["fr": "Lignes « depuis ta question » affichées : {0}.", "pt": "Linhas “desde que perguntaste” mostradas: {0}.", "it": "Righe «da quando hai chiesto» mostrate: {0}.", "de": "Gezeigte Zeilen „seit deiner Frage“: {0}."]
        result["Your question was about today."] = ["fr": "Ta question portait sur aujourd’hui.", "pt": "A tua pergunta era sobre hoje.", "it": "La tua domanda riguardava oggi.", "de": "Deine Frage ging um heute."]
        result["Your question was about this week."] = ["fr": "Ta question portait sur cette semaine.", "pt": "A tua pergunta era sobre esta semana.", "it": "La tua domanda riguardava questa settimana.", "de": "Deine Frage ging um diese Woche."]
        result["Your question was about this month."] = ["fr": "Ta question portait sur ce mois-ci.", "pt": "A tua pergunta era sobre este mês.", "it": "La tua domanda riguardava questo mese.", "de": "Deine Frage ging um diesen Monat."]
        result["Your question was about months or years."] = ["fr": "Ta question portait sur des mois ou des années.", "pt": "A tua pergunta era sobre meses ou anos.", "it": "La tua domanda riguardava mesi o anni.", "de": "Deine Frage ging um Monate oder Jahre."]
        result["You saved a read."] = ["fr": "Tu as enregistré une analyse.", "pt": "Guardaste uma análise.", "it": "Hai salvato un’analisi.", "de": "Du hast eine Analyse gespeichert."]
        result["You saved a read, to review in a day."] = ["fr": "Tu as enregistré une analyse, à revoir dans un jour.", "pt": "Guardaste uma análise, para rever num dia.", "it": "Hai salvato un’analisi, da rivedere tra un giorno.", "de": "Du hast eine Analyse gespeichert, zum Prüfen in einem Tag."]
        result["You saved a read, to review in 3 days."] = ["fr": "Tu as enregistré une analyse, à revoir dans 3 jours.", "pt": "Guardaste uma análise, para rever em 3 dias.", "it": "Hai salvato un’analisi, da rivedere tra 3 giorni.", "de": "Du hast eine Analyse gespeichert, zum Prüfen in 3 Tagen."]
        result["You saved a read, to review in a week."] = ["fr": "Tu as enregistré une analyse, à revoir dans une semaine.", "pt": "Guardaste uma análise, para rever numa semana.", "it": "Hai salvato un’analisi, da rivedere tra una settimana.", "de": "Du hast eine Analyse gespeichert, zum Prüfen in einer Woche."]
        result["You wrote a thesis about it."] = ["fr": "Tu as écrit une thèse à son sujet.", "pt": "Escreveste uma tese sobre este ativo.", "it": "Hai scritto una tesi su questo asset.", "de": "Du hast eine These dazu geschrieben."]
        result["Your thesis looks weeks ahead."] = ["fr": "Ta thèse porte sur des semaines.", "pt": "A tua tese olha para semanas.", "it": "La tua tesi guarda a settimane.", "de": "Deine These reicht Wochen voraus."]
        result["Your thesis looks months or more ahead."] = ["fr": "Ta thèse porte sur des mois ou plus.", "pt": "A tua tese olha para meses ou mais.", "it": "La tua tesi guarda a mesi o più.", "de": "Deine These reicht Monate oder länger voraus."]
        result["Bobby comes back on {0}."] = ["fr": "Bobby revient le {0}.", "pt": "O Bobby volta a {0}.", "it": "Bobby torna il {0}.", "de": "Bobby meldet sich am {0}."]
        result["Your week arrives on {0}."] = ["fr": "Ta semaine arrive le {0}.", "pt": "A tua semana chega a {0}.", "it": "La tua settimana arriva il {0}.", "de": "Deine Woche kommt am {0}."]
        result["Follow-ups arrive around {0}."] = ["fr": "Les suivis arrivent vers {0}.", "pt": "O seguimento chega por volta das {0}.", "it": "Gli aggiornamenti arrivano verso le {0}.", "de": "Follow-ups kommen gegen {0}."]
        result["Quiet until {0}."] = ["fr": "Silencieux jusqu’au {0}.", "pt": "Em silêncio até {0}.", "it": "In silenzio fino al {0}.", "de": "Ruhe bis {0}."]
        result["Fewer follow-ups for now."] = ["fr": "Moins de suivis pour l’instant.", "pt": "Menos seguimento por agora.", "it": "Meno aggiornamenti per ora.", "de": "Vorerst weniger Follow-ups."]
        result["Follow-ups: {0} shown, {1} tapped, {2} answered."] = ["fr": "Suivis : {0} affichés, {1} touchés, {2} avec réponse.", "pt": "Seguimentos: {0} mostrados, {1} tocados, {2} respondidos.", "it": "Aggiornamenti: {0} mostrati, {1} toccati, {2} con risposta.", "de": "Follow-ups: {0} gezeigt, {1} angetippt, {2} beantwortet."]
        result["Times you opened the app: {0}."] = ["fr": "Ouvertures de l’app : {0}.", "pt": "Vezes que abriste a app: {0}.", "it": "Volte che hai aperto l’app: {0}.", "de": "App-Öffnungen: {0}."]
        // The sectors.
        result["Semiconductors"] = ["fr": "Semi-conducteurs", "pt": "Semicondutores", "it": "Semiconduttori", "de": "Halbleiter"]
        result["Big tech"] = ["fr": "Géants de la tech", "pt": "Grandes tecnológicas", "it": "Big tech", "de": "Big Tech"]
        result["Software"] = ["fr": "Logiciels", "pt": "Software", "it": "Software", "de": "Software"]
        result["Crypto stocks"] = ["fr": "Actions crypto", "pt": "Ações cripto", "it": "Azioni cripto", "de": "Krypto-Aktien"]
        result["Electric vehicles"] = ["fr": "Véhicules électriques", "pt": "Veículos elétricos", "it": "Veicoli elettrici", "de": "Elektroautos"]
        result["Health care"] = ["fr": "Santé", "pt": "Saúde", "it": "Sanità", "de": "Gesundheit"]
        result["Bitcoin and Ethereum"] = ["fr": "Bitcoin et Ethereum", "pt": "Bitcoin e Ethereum", "it": "Bitcoin ed Ethereum", "de": "Bitcoin und Ethereum"]
        result["Layer 1 networks"] = ["fr": "Réseaux de couche 1", "pt": "Redes de camada 1", "it": "Reti layer 1", "de": "Layer-1-Netzwerke"]
        result["Layer 2 networks"] = ["fr": "Réseaux de couche 2", "pt": "Redes de camada 2", "it": "Reti layer 2", "de": "Layer-2-Netzwerke"]
        result["DeFi"] = ["fr": "DeFi", "pt": "DeFi", "it": "DeFi", "de": "DeFi"]
        result["Memecoins"] = ["fr": "Memecoins", "pt": "Memecoins", "it": "Memecoin", "de": "Memecoins"]
        result["AI tokens"] = ["fr": "Tokens IA", "pt": "Tokens de IA", "it": "Token IA", "de": "KI-Token"]
        result["Payment coins"] = ["fr": "Cryptos de paiement", "pt": "Moedas de pagamento", "it": "Monete di pagamento", "de": "Zahlungscoins"]
        return result
    }()
}
