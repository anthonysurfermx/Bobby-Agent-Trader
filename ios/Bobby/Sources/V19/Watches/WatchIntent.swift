// Watches (1.9.x): "tell me if Nvidia falls more than 5%", said or typed on the glass.
// Read HERE, by rules, in the six languages: no model is asked and nothing leaves the phone.
// Invariants:
//  - A sentence is a watch only when it asks to be told ("tell me if", "avísame si"…), names
//    exactly one asset the server lists, and says a direction or a size. Anything else is an
//    ordinary question and goes to the desk untouched.
//  - What it reads is a proposal: the glass shows it and the person starts it with a tap. A size
//    or a length the server does not offer becomes the nearest one it does, in plain sight.
//  - The names below are how people say the assets; which assets can be watched is the server's
//    list, and a name outside it reads as no asset at all.
import Foundation

/// What a sentence asked for, in the server's vocabulary.
struct WatchDraft: Equatable, Sendable {
    let symbol: String
    let name: String
    let direction: WatchDirection
    let percent: Int
    let days: Int
}

enum WatchIntent {
    /// symbol → (the name the glass shows, how people say it, folded).
    static let names: [String: (name: String, said: [String])] = [
        "BTC": ("Bitcoin", ["bitcoin", "btc"]),
        "ETH": ("Ethereum", ["ethereum", "eth", "ether"]),
        "SOL": ("Solana", ["solana"]),
        "SPY": ("S&P 500", ["spy", "s&p 500", "s&p500", "sp500", "sp 500", "s&p"]),
        "QQQ": ("Nasdaq-100", ["qqq", "nasdaq 100", "nasdaq-100", "nasdaq100", "nasdaq"]),
        "NVDA": ("NVIDIA", ["nvidia", "nvda"]),
        "AAPL": ("Apple", ["apple", "aapl"]),
        "TSLA": ("Tesla", ["tesla", "tsla"]),
        "META": ("Meta", ["meta", "facebook"]),
        "MSFT": ("Microsoft", ["microsoft", "msft"]),
        "GOOGL": ("Alphabet", ["google", "alphabet", "googl", "goog"]),
        "AMZN": ("Amazon", ["amazon", "amzn"]),
        "AMD": ("AMD", ["amd"]),
        "COIN": ("Coinbase", ["coinbase"]),
    ]

    static func name(of symbol: String) -> String { names[symbol.uppercased()]?.name ?? symbol.uppercased() }

    /// "Tell me": the person asks Bobby to come back, not to answer now.
    private static let asks = [
        // en
        "tell me if", "tell me when", "let me know", "notify me", "alert me", "ping me", "warn me", "give me a heads up",
        // es
        "avisame", "avisa me", "me avisas", "me avises", "notificame", "alertame", "dime si", "dime cuando", "hazme saber",
        // fr
        "previens moi", "previens-moi", "dis moi si", "dis-moi si", "dis moi quand", "dis-moi quand", "alerte moi", "alerte-moi", "avertis moi", "avertis-moi", "tiens moi au courant", "tiens-moi au courant",
        // pt
        "avisa me", "avisa-me", "me avisa", "me avise", "avise me", "avise-me", "notifica me", "notifica-me", "me notifica", "diz me se", "diz-me se", "me diga se",
        // it
        "avvisami", "avvertimi", "fammi sapere", "dimmi se", "dimmi quando", "notificami",
        // de
        "sag mir bescheid", "sag bescheid", "gib mir bescheid", "gib bescheid", "benachrichtige mich", "informiere mich", "melde dich", "sag mir wenn", "sag mir, wenn", "warn mich", "warne mich",
    ]
    private static let falls = ["fall", "falls", "fell", "drop", "drops", "dips", "dip", "down", "loses", "lose", "slides", "sinks", "below", "lower",
        "cae", "caiga", "caer", "baja", "baje", "bajar", "pierde", "pierda", "abajo", "desploma", "desplome",
        "baisse", "chute", "perd", "tombe", "recule", "descend",
        "cai", "caia", "cair", "desce", "desca", "descer", "perde", "perca", "recua",
        "scende", "scenda", "cala", "cali", "crolla", "giu",
        "fallt", "faellt", "sinkt", "verliert", "runter", "abrutscht", "nachgibt"]
    private static let rises = ["rise", "rises", "up", "gains", "gain", "climbs", "jumps", "rallies", "above", "higher",
        "sube", "suba", "subir", "gana", "gane", "arriba", "dispara", "dispare",
        "monte", "grimpe", "hausse", "gagne", "bondit", "progresse",
        "sobe", "ganha", "ganhe", "dispara", "valoriza",
        "sale", "salga", "guadagna", "guadagni", "cresce",
        "steigt", "gewinnt", "zulegt", "klettert", "hoch", "rauf"]
    private static let moves = ["moves", "move", "swings", "either way", "mueve", "mueva", "varia", "varie", "bouge", "varie", "mexe", "mexa", "move se", "move-se", "muove", "muova", "bewegt", "schwankt"]
    private static let month = ["month", "mes", "mois", "mese", "monat", "30 days", "30 dias", "30 jours", "30 giorni", "30 tage"]

    static func fold(_ text: String) -> String {
        let plain = text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "en_US_POSIX")).lowercased()
            .replacingOccurrences(of: "’", with: "'").replacingOccurrences(of: "ß", with: "ss")
        let kept = plain.unicodeScalars.map { scalar -> Character in
            (CharacterSet.alphanumerics.contains(scalar) || "&%-,.'".unicodeScalars.contains(scalar)) ? Character(scalar) : " "
        }
        return String(kept).split(separator: " ").joined(separator: " ")
    }

    /// True when `phrase` stands in `text` as whole words.
    private static func has(_ text: String, _ phrase: String) -> Bool {
        let escaped = NSRegularExpression.escapedPattern(for: phrase)
        return text.range(of: "(^|[^a-z0-9])\(escaped)($|[^a-z0-9])", options: .regularExpression) != nil
    }

    /// The percentage the sentence names, 0.1…99: "5%", "5 %", "5 por ciento", "5,5 %".
    static func percent(in text: String) -> Double? {
        let pattern = #"(\d{1,2}(?:[.,]\d)?)\s*(?:%|percent|per cent|por ciento|por cento|pour cent|per cento|prozent)"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(match.range(at: 1), in: text),
              let value = Double(text[range].replacingOccurrences(of: ",", with: ".")), value > 0 else { return nil }
        return value
    }

    static func nearest(_ value: Double, in options: [Int]) -> Int? {
        options.min { abs(Double($0) - value) < abs(Double($1) - value) }
    }

    /// nil: an ordinary question. `board` is what the server offers this account.
    static func parse(_ sentence: String, board: WatchBoard) -> WatchDraft? {
        guard sentence.count <= 200, !board.percents.isEmpty, !board.days.isEmpty else { return nil }
        let text = fold(sentence)
        guard asks.contains(where: { has(text, fold($0)) }) else { return nil }
        let named = board.symbols.filter { symbol in names[symbol]?.said.contains { has(text, $0) } == true }
        guard named.count == 1, let symbol = named.first else { return nil }
        let down = falls.contains { has(text, $0) }, up = rises.contains { has(text, $0) }, either = moves.contains { has(text, $0) }
        let size = percent(in: text)
        guard down || up || either || size != nil else { return nil }
        let direction: WatchDirection = down == up ? .moves : (down ? .falls : .rises)
        guard let percent = nearest(size ?? 5, in: board.percents) else { return nil }
        let wantsMonth = month.contains { has(text, $0) }
        guard let days = nearest(wantsMonth ? 30 : 7, in: board.days) else { return nil }
        return WatchDraft(symbol: symbol, name: name(of: symbol), direction: direction, percent: percent, days: days)
    }
}
