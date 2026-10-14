import Foundation

extension NativeTranslations18 {
    static let conversation: [String: [String: String]] = {
        var result: [String: [String: String]] = [:]
        result["See the {0} read"] = ["fr": "Voir l’analyse de {0}", "pt": "Ver a análise de {0}", "it": "Vedi l’analisi di {0}", "de": "Analyse zu {0} ansehen"]
        result["See the read"] = ["fr": "Voir l’analyse", "pt": "Ver a análise", "it": "Vedi l’analisi", "de": "Analyse ansehen"]
        result["Reading {0}…"] = ["fr": "J’analyse {0}…", "pt": "A analisar {0}…", "it": "Analizzo {0}…", "de": "Ich analysiere {0}…"]
        result["Read ready"] = ["fr": "Analyse prête", "pt": "Análise pronta", "it": "Analisi pronta", "de": "Analyse bereit"]
        result["Uses 1 of your {0} reads"] = ["fr": "Utilise 1 de tes {0} analyses", "pt": "Usa 1 das tuas {0} análises", "it": "Usa 1 delle tue {0} analisi", "de": "Nutzt 1 deiner {0} Analysen"]
        result["Uses your last read"] = ["fr": "Utilise ta dernière analyse", "pt": "Usa a tua última análise", "it": "Usa la tua ultima analisi", "de": "Nutzt deine letzte Analyse"]
        result["Uses 1 read"] = ["fr": "Utilise 1 analyse", "pt": "Usa 1 análise", "it": "Usa 1 analisi", "de": "Nutzt 1 Analyse"]
        result["Uses 1 of your {0} free reads"] = ["fr": "Utilise 1 de tes {0} analyses gratuites", "pt": "Usa 1 das tuas {0} análises grátis", "it": "Usa 1 delle tue {0} analisi gratuite", "de": "Nutzt 1 deiner {0} kostenlosen Analysen"]
        result["Uses your last free read"] = ["fr": "Utilise ta dernière analyse gratuite", "pt": "Usa a tua última análise grátis", "it": "Usa la tua ultima analisi gratuita", "de": "Nutzt deine letzte kostenlose Analyse"]
        result["Included in Bobby Pro"] = ["fr": "Incluse dans Bobby Pro", "pt": "Incluída no Bobby Pro", "it": "Inclusa in Bobby Pro", "de": "In Bobby Pro enthalten"]
        result["Uses 1 of your {1} {0} and 1 of your {2} reads"] = ["fr": "Utilise 1 de tes {1} {0} et 1 de tes {2} analyses", "pt": "Usa 1 das tuas {1} {0} e 1 das tuas {2} análises", "it": "Usa 1 delle tue {1} {0} e 1 delle tue {2} analisi", "de": "Nutzt 1 deiner {1} {0} und 1 deiner {2} Analysen"]
        result["Uses 1 of your {1} {0} and 1 of your {2} free reads"] = ["fr": "Utilise 1 de tes {1} {0} et 1 de tes {2} analyses gratuites", "pt": "Usa 1 das tuas {1} {0} e 1 das tuas {2} análises grátis", "it": "Usa 1 delle tue {1} {0} e 1 delle tue {2} analisi gratuite", "de": "Nutzt 1 deiner {1} {0} und 1 deiner {2} kostenlosen Analysen"]
        result["Uses 1 {0} and 1 read"] = ["fr": "Utilise 1 {0} et 1 analyse", "pt": "Usa 1 {0} e 1 análise", "it": "Usa 1 {0} e 1 analisi", "de": "Nutzt 1 {0} und 1 Analyse"]
        result["Uses 1 of your {1} {0} with Bobby Pro"] = ["fr": "Utilise 1 de tes {1} {0} avec Bobby Pro", "pt": "Usa 1 das tuas {1} {0} com o Bobby Pro", "it": "Usa 1 delle tue {1} {0} con Bobby Pro", "de": "Nutzt 1 deiner {1} {0} mit Bobby Pro"]
        result["Uses 1 {0} with Bobby Pro"] = ["fr": "Utilise 1 {0} avec Bobby Pro", "pt": "Usa 1 {0} com o Bobby Pro", "it": "Usa 1 {0} con Bobby Pro", "de": "Nutzt 1 {0} mit Bobby Pro"]
        result["I can’t explain more right now. I’ll be back {0}"] = ["fr": "Je ne peux rien expliquer de plus pour l’instant. Je reviens {0}", "pt": "Por agora não posso explicar mais. Volto {0}", "it": "Per ora non posso spiegare altro. Torno {0}", "de": "Im Moment kann ich nichts mehr erklären. Ich bin {0} wieder da"]
        result["I can’t explain more right now. Try again later."] = ["fr": "Je ne peux rien expliquer de plus pour l’instant. Réessaie plus tard.", "pt": "Por agora não posso explicar mais. Tenta mais tarde.", "it": "Per ora non posso spiegare altro. Riprova più tardi.", "de": "Im Moment kann ich nichts mehr erklären. Versuch es später noch einmal."]
        result["today at {t}"] = ["fr": "aujourd’hui à {t}", "pt": "hoje às {t}", "it": "oggi alle {t}", "de": "heute um {t} Uhr"]
        result["tomorrow at {t}"] = ["fr": "demain à {t}", "pt": "amanhã às {t}", "it": "domani alle {t}", "de": "morgen um {t} Uhr"]
        result["{weekday} at {t}"] = ["fr": "{weekday} à {t}", "pt": "na {weekday} às {t}", "it": "{weekday} alle {t}", "de": "am {weekday} um {t} Uhr"]
        result["on {d MMM}"] = ["fr": "le {d MMM}", "pt": "a {d} de {MMM}", "it": "il {d MMM}", "de": "am {d}. {MMM}"]
        return result
    }()
}
