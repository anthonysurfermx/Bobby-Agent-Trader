import Foundation

/// Live market data for the curated signals, read from Bobby's public
/// `stock-candles` endpoint (Yahoo chart data, CDN-cached up to 5 minutes).
/// The bundled snapshots remain the offline fallback.
struct LiveCandle: Decodable, Equatable {
    let ts: Double
    let open: Double
    let high: Double
    let low: Double
    let close: Double
    var date: Date { Date(timeIntervalSince1970: ts / 1_000) }
}

struct SignalQuote: Equatable {
    let price: Double
    let asOf: Date
    let changePct: Double?
    let isLive: Bool
    let daily: [LiveCandle]
}

/// A price the signal can reach after publication. `up` levels are reached
/// by the day's high, `down` levels by the day's low.
struct SignalMilestone: Hashable {
    let title: String
    let price: Double
    let up: Bool
    /// Stops only count once the entry was reached.
    var afterEntry = false
}

struct MilestoneStatus: Hashable {
    let milestone: SignalMilestone
    let reachedOn: Date?
}

enum SignalTracking {
    static let newYork = TimeZone(identifier: "America/New_York")!

    /// Catalog dates are stored as UTC midnight; the trading day is New York's.
    static func tradingDayStart(_ published: Date) -> Date {
        var utc = Calendar(identifier: .gregorian); utc.timeZone = TimeZone(identifier: "UTC")!
        var ny = Calendar(identifier: .gregorian); ny.timeZone = newYork
        return ny.date(from: utc.dateComponents([.year, .month, .day], from: published)) ?? published
    }

    /// Daily candles cannot order events inside a day, so every milestone is
    /// reported with the first day it traded through, publication day included.
    static func statuses(_ milestones: [SignalMilestone], candles: [LiveCandle], since published: Date, entryAtPublication: Bool) -> [MilestoneStatus] {
        let start = tradingDayStart(published)
        let window = candles.filter { $0.date >= start }.sorted { $0.ts < $1.ts }
        func firstDay(_ m: SignalMilestone, from: Date) -> Date? {
            window.first { $0.date >= from && (m.up ? $0.high >= m.price : $0.low <= m.price) }?.date
        }
        let entry = milestones.first { $0.title == "Entrada" }
        let entryDay: Date? = entryAtPublication ? start : entry.flatMap { firstDay($0, from: start) }
        return milestones.map { m in
            if m.title == "Entrada" { return MilestoneStatus(milestone: m, reachedOn: entryDay) }
            if m.afterEntry {
                guard let entryDay else { return MilestoneStatus(milestone: m, reachedOn: nil) }
                return MilestoneStatus(milestone: m, reachedOn: firstDay(m, from: entryDay))
            }
            return MilestoneStatus(milestone: m, reachedOn: firstDay(m, from: start))
        }
    }

    static func dayLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX"); f.timeZone = newYork; f.dateFormat = "d MMM"
        return f.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    static func timeLabel(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_MX"); f.timeZone = newYork; f.dateFormat = "HH:mm"
        return f.string(from: date)
    }
}

@MainActor final class SignalLiveMarket: ObservableObject {
    static let shared = SignalLiveMarket()
    @Published private(set) var quotes: [String: SignalQuote] = [:]
    private var polling: Task<Void, Never>?

    func startPolling() {
        guard polling == nil else { return }
        polling = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(for: .seconds(60))
            }
        }
    }

    func refresh() async {
        let symbols = Set(SignalListItem.curated.map(\.symbol))
        await withTaskGroup(of: (String, SignalQuote?).self) { group in
            for symbol in symbols { group.addTask { (symbol, await Self.fetch(symbol)) } }
            for await (symbol, quote) in group {
                if let quote { quotes[symbol] = quote }
            }
        }
    }

    nonisolated private static func fetch(_ symbol: String) async -> SignalQuote? {
        async let daily = candles(symbol, range: "90d", interval: "1d")
        async let intraday = candles(symbol, range: "7d", interval: "15m")
        guard let days = await daily, !days.isEmpty else { return nil }
        let recent = await intraday ?? []
        let last = recent.last ?? days.last!
        let calendar = { var c = Calendar(identifier: .gregorian); c.timeZone = SignalTracking.newYork; return c }()
        let today = calendar.startOfDay(for: last.date)
        // Keep the daily series consistent with the latest intraday print.
        var merged = days
        if let final = merged.last, calendar.startOfDay(for: final.date) == today {
            merged[merged.count - 1] = LiveCandle(ts: final.ts, open: final.open, high: max(final.high, last.close), low: min(final.low, last.close), close: last.close)
        }
        let previous = merged.last { calendar.startOfDay(for: $0.date) < today }
        let change = previous.map { last.close / $0.close - 1 }
        let weekday = calendar.component(.weekday, from: last.date)
        let fresh = Date().timeIntervalSince(last.date) < 25 * 60 && (2...6).contains(weekday)
        return SignalQuote(price: last.close, asOf: last.date, changePct: change, isLive: fresh, daily: merged)
    }

    nonisolated private static func candles(_ symbol: String, range: String, interval: String) async -> [LiveCandle]? {
        guard let url = URL(string: "https://bobbyprotocol.xyz/api/stock-candles?symbol=\(symbol)&range=\(range)&interval=\(interval)") else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 10
        struct Payload: Decodable { let candles: [LiveCandle] }
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let payload = try? JSONDecoder().decode(Payload.self, from: data) else { return nil }
        let valid = payload.candles.filter { [$0.open, $0.high, $0.low, $0.close].allSatisfy { $0.isFinite && $0 > 0 } }
        return valid.isEmpty ? nil : valid.sorted { $0.ts < $1.ts }
    }

    /// Live facts handed to the Copiloto; nil when no live data arrived.
    func copilotContext(for signal: SignalListItem) -> String? {
        guard let quote = quotes[signal.symbol] else { return nil }
        let signalCase = SignalCase.forSignal(signal)
        let when = quote.isLive
            ? "en vivo a las \(SignalTracking.timeLabel(quote.asOf)) de Nueva York, con hasta unos minutos de retraso"
            : "último precio disponible, del \(SignalTracking.dayLabel(quote.asOf)) a las \(SignalTracking.timeLabel(quote.asOf)) de Nueva York; el mercado está cerrado"
        var lines = ["DATOS DE MERCADO ACTUALES (esto reemplaza lo dicho arriba sobre la falta de precio en vivo y sobre el último cierre de la instantánea): \(signal.symbol) cotiza en \(String(format: "%.2f", quote.price)) USD, \(when)."]
        if let change = quote.changePct { lines.append("Cambio frente al cierre anterior: \(String(format: "%+.2f", change * 100)) %.") }
        let since = quote.daily.filter { $0.date >= SignalTracking.tradingDayStart(signal.publishedAt) }
        if let high = since.map(\.high).max(), let low = since.map(\.low).min() {
            lines.append("Desde la publicación (velas diarias): máximo \(String(format: "%.2f", high)), mínimo \(String(format: "%.2f", low)).")
        }
        let statuses = SignalTracking.statuses(signalCase.milestones, candles: quote.daily, since: signal.publishedAt, entryAtPublication: signalCase.entryAtPublication)
        let reached = statuses.filter { $0.reachedOn != nil }.map { "\($0.milestone.title) \(String(format: "%.2f", $0.milestone.price)) el \(SignalTracking.dayLabel($0.reachedOn!))" }
        let pending = statuses.filter { $0.reachedOn == nil }.map { "\($0.milestone.title) \(String(format: "%.2f", $0.milestone.price))" }
        if !reached.isEmpty { lines.append("Niveles que el precio ya alcanzó según los datos de mercado: \(reached.joined(separator: "; ")).") }
        if !pending.isEmpty { lines.append("Aún no alcanzados: \(pending.joined(separator: "; ")).") }
        lines.append("Esto es seguimiento de PTS con precios de mercado, no la ejecución ni la cuenta de Daniel; dentro de un mismo día no se sabe el orden de los movimientos. Si preguntan cómo va, usa estos datos y dilo así.")
        return lines.joined(separator: " ")
    }
}
