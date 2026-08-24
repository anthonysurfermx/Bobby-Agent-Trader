// Bobby API client — four public endpoints, decoded defensively (the server
// evolves faster than an app-store review cycle; unknown/null fields must
// never crash the app).
import Foundation

struct Candle: Identifiable {
    var id: Date { time }
    let time: Date
    let open: Double
    let high: Double
    let low: Double
    let close: Double
    let volume: Double
}

enum MarketTimeframe: String, CaseIterable, Identifiable {
    case fifteenMinutes = "15M"
    case oneHour = "1H"
    case fourHours = "4H"
    case oneDay = "1D"

    var id: String { rawValue }

    var cryptoBar: String {
        switch self {
        case .fifteenMinutes: return "15m"
        case .oneHour: return "1H"
        case .fourHours: return "4H"
        case .oneDay: return "1D"
        }
    }

    // Mirrors MarketCanvas on bobbyprotocol.xyz. Yahoo does not expose 4H
    // candles, so the web desk deliberately expands those views to daily data.
    var equityQuery: (range: String, interval: String) {
        switch self {
        case .fifteenMinutes: return ("7d", "15m")
        case .oneHour: return ("7d", "1h")
        case .fourHours: return ("30d", "1d")
        case .oneDay: return ("90d", "1d")
        }
    }
}

struct MarketSnapshot {
    var symbol: String
    var name: String?
    var isEquity: Bool
    var price: Double?
    var changePct: Double?
}

struct BobbyAnswer {
    var symbol: String
    var price: Double?
    var trend: String?
    var momentum: String?
    var rsi: Double?
    var support: Double?
    var resistance: Double?
    var regime: String?
    var signal: String?
    var direction: String?
    var convictionPct: Double?
    var entry: Double?
    var stop: Double?
    var target: Double?
    var rewardRisk: Double?
    var overview: String?

    /// True when the debate simply never came back — no market data and no
    /// verdict of any kind. A backend failure must NEVER masquerade as a
    /// disciplined NO TRADE (no Halo moment, no XP, no "capital protected").
    var isUnavailable: Bool {
        price == nil && trend == nil && signal == nil && direction == nil
            && regime == nil && overview == nil
    }

    /// A setup is actionable only when the deterministic pulse agrees on a
    /// direction, clears conviction and includes the complete risk plan.
    /// Anything less — WITH real data on the table — fails closed into
    /// Bobby's signature NO TRADE state.
    var isNoTrade: Bool {
        guard !isUnavailable else { return false }
        let normalizedSignal = signal?.lowercased().replacingOccurrences(of: "-", with: "_") ?? ""
        if normalizedSignal.contains("no_trade") || normalizedSignal.contains("neutral") || normalizedSignal.contains("wait") {
            return true
        }
        guard let direction = direction?.lowercased(), ["long", "short"].contains(direction) else { return true }
        guard let convictionPct, convictionPct >= 55 else { return true }
        return entry == nil || stop == nil || target == nil
    }

    var noTradeReason: String {
        guard isNoTrade else { return "" }
        let normalizedSignal = signal?.lowercased() ?? ""
        if normalizedSignal.contains("neutral") || normalizedSignal.contains("wait") {
            return "No clean directional signal passed the desk."
        }
        if direction == nil { return "The agents did not reach directional consensus." }
        if let convictionPct, convictionPct < 55 {
            return "Conviction stayed below Bobby's 55% risk gate."
        }
        return "The setup did not include a complete entry, stop and target."
    }

    /// The spoken/written summary — terminal-honest, never advice-flavored.
    var summary: String {
        var lines: [String] = []
        if let p = price {
            lines.append(L.t("\(symbol) is at \(Self.money(p)).",
                             "\(symbol) está en \(Self.money(p))."))
        }
        if let t = trend {
            let trendWord = Self.localizedTrend(t)
            var s = L.t("Trend \(trendWord)", "Tendencia \(trendWord)")
            if let m = momentum, m != "neutral" { s += L.t(", momentum \(m)", ", momentum \(m)") }
            if let r = rsi { s += ", RSI \(Int(r))" }
            lines.append(s + ".")
        }
        if let sup = support, let res = resistance {
            lines.append(L.t("Support \(Self.money(sup)), resistance \(Self.money(res)).",
                             "Soporte \(Self.money(sup)), resistencia \(Self.money(res))."))
        }
        if let d = direction, let c = convictionPct {
            let dirEn = d == "long" ? "bullish" : d == "short" ? "bearish" : d
            let dirEs = d == "long" ? "alcista" : d == "short" ? "bajista" : d
            lines.append(L.t("My read: \(dirEn) bias with \(Int(c))% conviction.",
                             "Mi lectura: sesgo \(dirEs) con \(Int(c))% de convicción."))
        }
        if let e = entry, let st = stop, let tg = target {
            var plan = L.t("Reference plan: entry \(Self.money(e)), stop \(Self.money(st)), target \(Self.money(tg))",
                           "Plan de referencia: entrada \(Self.money(e)), stop \(Self.money(st)), objetivo \(Self.money(tg))")
            if let rr = rewardRisk { plan += " (R:R \(String(format: "%.1f", rr)))" }
            lines.append(plan + ".")
        }
        if isNoTrade { lines.append(L.t("No setup yet. Capital protected.", "Sin setup todavía. Capital protegido.")) }
        if lines.isEmpty {
            lines.append(L.t("I do not have enough data on \(symbol) right now.",
                             "No tengo datos suficientes de \(symbol) ahora mismo."))
        }
        return lines.joined(separator: " ")
    }

    /// API trend values arrive in either language — normalize for the reader.
    static func localizedTrend(_ raw: String) -> String {
        let t = raw.lowercased()
        if t.contains("alcista") || t.contains("bull") || t.contains("up") {
            return L.t("bullish", "alcista")
        }
        if t.contains("bajista") || t.contains("bear") || t.contains("down") {
            return L.t("bearish", "bajista")
        }
        if t.contains("lateral") || t.contains("range") || t.contains("side") {
            return L.t("sideways", "lateral")
        }
        return raw
    }

    static func money(_ v: Double) -> String {
        if v >= 1000 {
            let f = NumberFormatter()
            f.numberStyle = .decimal
            f.maximumFractionDigits = 0
            return "$" + (f.string(from: NSNumber(value: v)) ?? String(format: "%.0f", v))
        }
        if v >= 1 { return String(format: "$%.2f", v) }
        return String(format: "$%.4f", v)
    }
}

enum BobbyAPI {
    static let base = URL(string: "https://bobbyprotocol.xyz")!

    static func json(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> Any {
        // NOT appendingPathComponent: it percent-encodes '?' and turns every
        // query string into a 404.
        guard let url = URL(string: base.absoluteString + "/" + path) else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 60
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONSerialization.jsonObject(with: data)
    }

    /// Words that carry no asset meaning in a natural question, es/en.
    private static let stopwords: Set<String> = [
        "como", "cómo", "va", "esta", "está", "estan", "están", "el", "la", "los", "las",
        "de", "del", "un", "una", "que", "qué", "cual", "cuál", "es", "precio", "y", "o",
        "dime", "dame", "sobre", "hoy", "ahora", "ve", "veo", "analiza", "analizame",
        "how", "is", "the", "whats", "what", "price", "of", "doing", "about", "tell", "me", "a"
    ]

    /// "¿cómo va nvidia hoy?" → tries "nvidia" · "precio de bitcoin" → "bitcoin"
    static func resolveAsset(_ query: String) async -> MarketSnapshot? {
        let cleaned = query.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty && !stopwords.contains($0) }
        // Try the meaningful words joined, then each word from last to first —
        // in "compara nvidia" the asset is usually the last content word.
        var candidates: [String] = []
        if !cleaned.isEmpty { candidates.append(cleaned.joined(separator: " ")) }
        candidates.append(contentsOf: cleaned.reversed())
        if candidates.isEmpty { candidates = [query] }

        for candidate in candidates {
            if let snap = await searchAsset(candidate) { return snap }
        }
        return nil
    }

    private static func searchAsset(_ term: String) async -> MarketSnapshot? {
        let q = term.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? term
        guard let obj = try? await json("api/bobby-asset-search?q=\(q)") as? [String: Any],
              let results = obj["results"] as? [[String: Any]],
              let top = results.first else { return nil }
        let symbol = (top["baseSymbol"] as? String) ?? (top["symbol"] as? String) ?? term.uppercased()
        let assetClass = (top["assetClass"] as? String) ?? "crypto"
        return MarketSnapshot(
            symbol: symbol,
            name: top["displayName"] as? String ?? top["name"] as? String,
            isEquity: assetClass == "equity",
            price: nil, changePct: nil
        )
    }

    static func market(_ symbol: String) async -> (price: Double?, changePct: Double?) {
        guard let obj = try? await json("api/voice-tool", method: "POST",
                                        body: ["tool": "get_market", "args": ["symbol": symbol]]) as? [String: Any]
        else { return (nil, nil) }
        return (obj["price"] as? Double, obj["change_24h_pct"] as? Double)
    }

    /// The full Bobby brain: regime, technicals, signal, trade plan.
    static func debate(_ symbol: String) async -> BobbyAnswer {
        var a = BobbyAnswer(symbol: symbol)
        guard let obj = try? await json("api/voice-tool", method: "POST",
                                        body: ["tool": "run_debate", "args": ["symbol": symbol]]) as? [String: Any]
        else { return a }

        a.regime = obj["regime"] as? String
        if let m = obj["market"] as? [String: Any] { a.price = m["price"] as? Double }
        if let t = obj["technicals"] as? [String: Any] {
            a.price = a.price ?? (t["price"] as? Double)
            a.trend = t["trend"] as? String
            a.momentum = t["momentum"] as? String
            a.rsi = t["rsi14"] as? Double
            a.support = t["support"] as? Double
            a.resistance = t["resistance"] as? Double
        }
        if let p = obj["technical_pulse"] as? [String: Any] {
            a.signal = p["signal"] as? String
            a.direction = p["direction"] as? String
            a.convictionPct = p["conviction_pct"] as? Double
            a.overview = p["overview"] as? String
            if let plan = p["trade_plan"] as? [String: Any] {
                a.entry = plan["entry"] as? Double
                a.stop = plan["stop"] as? Double
                a.target = plan["target"] as? Double
                a.rewardRisk = plan["rewardRisk"] as? Double
            }
        }
        return a
    }

    static func candles(symbol: String, isEquity: Bool, timeframe: MarketTimeframe = .oneHour) async -> [Candle] {
        let equity = timeframe.equityQuery
        let path = isEquity
            ? "api/stock-candles?symbol=\(symbol)&range=\(equity.range)&interval=\(equity.interval)"
            : "api/okx-candles?instId=\(symbol)-USDT&bar=\(timeframe.cryptoBar)&limit=100"
        guard let obj = try? await json(path) as? [String: Any] else { return [] }
        let rows = (obj["candles"] as? [[String: Any]]) ?? (obj["data"] as? [[String: Any]]) ?? []
        var out: [Candle] = []
        for r in rows {
            func num(_ key: String) -> Double? {
                if let d = r[key] as? Double { return d }
                if let s = r[key] as? String { return Double(s) }
                return nil
            }
            guard let ts = num("ts"), let o = num("open"), let h = num("high"),
                  let l = num("low"), let c = num("close") else { continue }
            let volume = num("volume") ?? 0
            out.append(Candle(
                time: Date(timeIntervalSince1970: ts / 1000),
                open: o,
                high: h,
                low: l,
                close: c,
                volume: volume
            ))
        }
        return out.sorted { $0.time < $1.time }
    }
}
