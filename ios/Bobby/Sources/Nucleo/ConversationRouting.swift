import Foundation

/// Native only: the page never chooses an asset or guesses whether words ask for a read.
enum ConversationRouting {
    static func normalize(_ value: String) -> String {
        value.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX"))
            .components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: " ")
    }
    static let stops = [
        "en": ["the", "a", "an", "please", "about"], "es": ["el", "la", "los", "las", "un", "una", "de", "sobre", "por favor"],
        "fr": ["le", "la", "les", "l", "un", "une", "de", "sur", "s il te plait"], "pt": ["o", "a", "os", "as", "um", "uma", "de", "sobre", "por favor"],
        "it": ["il", "lo", "la", "i", "gli", "le", "un", "una", "di", "su", "per favore"], "de": ["der", "die", "das", "ein", "eine", "zu", "uber", "bitte"]]
    static let reads = [
        "en": ["how is X looking", "how is X doing", "how s X", "analyze X", "analyse X", "read X", "X read", "X analysis"],
        "es": ["como se ve X", "como va X", "como esta X", "analiza X", "analizar X", "lectura de X", "analisis de X"],
        "fr": ["que penser de X", "comment va X", "analyse X", "analyser X", "analyse de X"],
        "pt": ["como esta X", "como vai X", "analisa X", "analise X", "analisar X", "analise de X"],
        "it": ["come sta andando X", "come va X", "analizza X", "analizzare X", "analisi di X"],
        "de": ["wie steht es um X", "wie lauft X", "analysiere X", "X analysieren", "Analyse von X", "X Analyse"]]
    static let endings = ["en": ["today", "now"], "es": ["hoy", "ahora"], "fr": ["aujourd hui", "maintenant"], "pt": ["hoje", "agora"], "it": ["oggi", "ora"], "de": ["heute", "jetzt"]]
    static func isRead(_ question: String, asset: NucleoAsset, language: String) -> Bool {
        let q = normalize(question), names = [normalize(asset.name), normalize(asset.symbol)]
        // Compare before and after stop words, including multiword courtesy phrases.
        func bare(_ value: String) -> String {
            var words = " " + value + " "
            for stop in (stops[language] ?? []).sorted(by: { $0.count > $1.count }) { words = words.replacingOccurrences(of: " " + stop + " ", with: " ") }
            return words.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        }
        if names.contains(where: { q == $0 || bare(q) == bare($0) }) { return true }
        for template in reads[language] ?? [] {
            for name in names {
                let match = normalize(template.replacingOccurrences(of: "X", with: name))
                if q == match || (endings[language] ?? []).contains(where: { q == match + " " + $0 }) { return true }
            }
        }
        return false
    }
}
