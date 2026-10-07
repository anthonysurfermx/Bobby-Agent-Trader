import Foundation

extension NativeTranslations18 {
    /// The harness: the offer and the move on the glass, the follow-up notifications, the board,
    /// the sectors. The glass lines stay under 46 characters and the buttons under 22.
    static let harness: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        // The lock screen.
        result["{0}, a day later. See how it moved."] = ["fr": "{0}, un jour plus tard. Regarde comment ça a bougé.", "pt": "{0}, um dia depois. Vê como se moveu.", "it": "{0}, un giorno dopo. Guarda come si è mosso.", "de": "{0}, einen Tag später. Schau, wie es lief."]
        result["{0}, {1} days later. See how it moved."] = ["fr": "{0}, {1} jours plus tard. Regarde comment ça a bougé.", "pt": "{0}, {1} dias depois. Vê como se moveu.", "it": "{0}, {1} giorni dopo. Guarda come si è mosso.", "de": "{0}, {1} Tage später. Schau, wie es lief."]
        result["{0} today. {1} is part of it."] = ["fr": "{0} aujourd’hui. {1} en fait partie.", "pt": "{0} hoje. {1} faz parte.", "it": "{0} oggi. {1} ne fa parte.", "de": "{0} heute. {1} gehört dazu."]
        result["Your week with {0}."] = ["fr": "Ta semaine avec {0}.", "pt": "A tua semana com {0}.", "it": "La tua settimana con {0}.", "de": "Deine Woche mit {0}."]
        result["Your week: {0} and {1} more."] = ["fr": "Ta semaine : {0} et {1} de plus.", "pt": "A tua semana: {0} e mais {1}.", "it": "La tua settimana: {0} e altri {1}.", "de": "Deine Woche: {0} und {1} weitere."]
        // The glass.
        result["Tell you tomorrow how {0} moved?"] = ["fr": "Je te dis demain comment {0} a bougé ?", "pt": "Conto-te amanhã como se moveu a {0}?", "it": "Ti dico domani come si è mossa {0}?", "de": "Soll ich dir morgen sagen, wie {0} lief?"]
        result["Tell you tomorrow how it moved?"] = ["fr": "Je te dis demain comment ça a bougé ?", "pt": "Conto-te amanhã como se moveu?", "it": "Ti dico domani come si è mosso?", "de": "Soll ich dir morgen sagen, wie es lief?"]
        result["Yes, tell me"] = ["fr": "Oui, dis-moi", "pt": "Sim, conta-me", "it": "Sì, dimmelo", "de": "Ja, sag es mir"]
        result["{0}, a day later"] = ["fr": "{0}, un jour plus tard", "pt": "{0}, um dia depois", "it": "{0}, un giorno dopo", "de": "{0}, einen Tag später"]
        result["{0}, {1} days later"] = ["fr": "{0}, {1} jours plus tard", "pt": "{0}, {1} dias depois", "it": "{0}, {1} giorni dopo", "de": "{0}, {1} Tage später"]
        result["{0} is where you left it"] = ["fr": "{0} est là où tu l’as laissé", "pt": "{0} está onde o deixaste", "it": "{0} è dove l’hai lasciato", "de": "{0} steht, wo du es gelassen hast"]
        result["{0} {1} since you asked"] = ["fr": "{0} {1} depuis ta question", "pt": "{0} {1} desde que perguntaste", "it": "{0} {1} da quando hai chiesto", "de": "{0} {1} seit deiner Frage"]
        result["What changed?"] = ["fr": "Quoi de neuf ?", "pt": "O que mudou?", "it": "Cosa è cambiato?", "de": "Was hat sich getan?"]
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
