import Foundation

enum SignalCategory: String, CaseIterable, Identifiable {
    case options, stocks, spot, scalping

    var id: String { rawValue }
    var title: String {
        switch self {
        case .options: return "Opciones"
        case .stocks: return "Stocks"
        case .spot: return "Spot"
        case .scalping: return "Scalping"
        }
    }
}

struct SignalListItem: Identifiable, Hashable {
    let id: String
    let category: SignalCategory
    let symbol: String
    let name: String
    let author: String
    let publishedAt: Date
    let reportedVerdict: String
    let publicationCount: Int
    let sourceAvailable: Bool
    let contractDocumented: Bool

    var publicationDate: String { formattedDate("d MMM yyyy") }
    var shortPublicationDate: String { formattedDate("d MMM") }

    private func formattedDate(_ format: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = format
        return formatter.string(from: publishedAt).replacingOccurrences(of: ".", with: "")
    }

    static let coin = SignalListItem(
        id: "coin-daniel-2026-09-18", category: .options,
        symbol: "COIN", name: "Coinbase", author: "Daniel Marín",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-18T00:00:00Z")!,
        reportedVerdict: "Segundo objetivo reportado", publicationCount: 1,
        sourceAvailable: true, contractDocumented: false
    )
    // Swing plan from Daniel's members post of Sep 21, 2026 (shares plus a
    // documented call); pending entry at publication.
    static let xly = SignalListItem(
        id: "xly-daniel-2026-09-21", category: .stocks,
        symbol: "XLY", name: "Consumo discrecional", author: "Daniel Marín",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-21T00:00:00Z")!,
        reportedVerdict: "Plan: entrada en 112.99", publicationCount: 1,
        sourceAvailable: true, contractDocumented: true
    )
    // Swing trade reported across two members posts: near activation on
    // Sep 18, activated and in profit on Sep 21.
    static let dram = SignalListItem(
        id: "dram-daniel-2026-09-18", category: .stocks,
        symbol: "DRAM", name: "ETF de memorias", author: "Daniel Marín",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-18T00:00:00Z")!,
        reportedVerdict: "Entrada activada · en ganancias al 21 sep", publicationCount: 2,
        sourceAvailable: true, contractDocumented: false
    )
    // Aggressive high-beta trade sent during the Sep 22 session, entry active
    // at publication, with a documented call.
    static let asts = SignalListItem(
        id: "asts-daniel-2026-09-22", category: .options,
        symbol: "ASTS", name: "AST SpaceMobile", author: "Daniel Marín",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-22T00:00:00Z")!,
        reportedVerdict: "Plan: entrada 64.00–65.85 · alto riesgo", publicationCount: 1,
        sourceAvailable: true, contractDocumented: true
    )
    // Jasiel's market read in the members updates of Sep 23, 2026: a possible
    // correction toward 80,550-76,900 as a buying zone; no trade was sent.
    static let btc = SignalListItem(
        id: "btc-jasiel-2026-09-23", category: .spot,
        symbol: "BTC", name: "Bitcoin", author: "Jasiel Sánchez",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-23T00:00:00Z")!,
        reportedVerdict: "Escenario: retroceso a 80,550–76,900", publicationCount: 1,
        sourceAvailable: true, contractDocumented: false
    )
    // Jasiel's macro read of Sep 24, 2026 ("¿Se viene la siguiente OLA
    // ALCISTA?"): if TLT holds 80.40 it could rebound to 84.27-85.34; the
    // 10-year yield and the dollar are context. No trade was sent.
    static let tlt = SignalListItem(
        id: "tlt-jasiel-2026-09-24", category: .stocks,
        symbol: "TLT", name: "Bonos del Tesoro 20+ años", author: "Jasiel Sánchez",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-24T00:00:00Z")!,
        reportedVerdict: "Escenario: rebote a 84.27–85.34 si sostiene 80.40", publicationCount: 1,
        sourceAvailable: true, contractDocumented: false
    )
    // Daniel's market update of Sep 24, 2026, 16:40 ("¿EL ALACRÁN SIGUE
    // AHÍ?"): stay out of short-term trades while the S&P 500's bearish
    // "phy" plays out; a pullback to 7613 would be a point to start buying.
    static let spx = SignalListItem(
        id: "spx-daniel-2026-09-24", category: .stocks,
        symbol: "SPX", name: "S&P 500", author: "Daniel Marín",
        publishedAt: ISO8601DateFormatter().date(from: "2026-09-24T20:40:00Z")!,
        reportedVerdict: "Instrucción: esperar fuera · retroceso a 7613 interesante", publicationCount: 1,
        sourceAvailable: true, contractDocumented: false
    )
    // The splash orbits the first four; later signals go last so it keeps its layout.
    static let curated: [SignalListItem] = [coin, xly, dram, asts, btc, tlt, spx]

    var authorFirstName: String { author.split(separator: " ").first.map(String.init) ?? author }
}

enum SignalSource {
    static let firstMoment = URL(string: "https://www.youtube.com/watch?v=ZYwei43K1xE&t=327s")!
    static let secondMoment = URL(string: "https://www.youtube.com/watch?v=ZYwei43K1xE&t=929s")!
}
