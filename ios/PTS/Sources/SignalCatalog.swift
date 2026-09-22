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
        reportedVerdict: "Entrada activada · en ganancias", publicationCount: 2,
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
    static let curated: [SignalListItem] = [coin, xly, dram, asts]
}

enum SignalSource {
    static let firstMoment = URL(string: "https://www.youtube.com/watch?v=ZYwei43K1xE&t=327s")!
    static let secondMoment = URL(string: "https://www.youtube.com/watch?v=ZYwei43K1xE&t=929s")!
}
