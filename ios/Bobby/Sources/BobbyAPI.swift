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

    // MARK: - Asset discovery (search-as-you-type, board, dictation vocab)

    struct AssetHit: Identifiable, Equatable {
        let symbol: String
        let name: String
        let assetClass: String
        var id: String { symbol }
    }

    struct BoardAsset: Identifiable, Equatable {
        let symbol: String
        let name: String
        let last: Double?
        var id: String { symbol }
    }

    private static func prettyName(_ raw: String, symbol: String) -> String {
        guard raw != symbol, !raw.isEmpty else { return symbol }
        if raw.rangeOfCharacter(from: CharacterSet(charactersIn: "&0123456789")) != nil { return raw }
        return raw.lowercased().split(separator: " ").map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }

    /// Live search over the full OKX universe (621 bases) — one row per asset.
    static func searchAssets(_ q: String, limit: Int = 4) async -> [AssetHit] {
        guard let obj = try? await json("api/bobby-asset-search", method: "POST",
                                        body: ["q": q, "limit": 10]) as? [String: Any],
              let results = obj["results"] as? [[String: Any]] else { return [] }
        var seen = Set<String>()
        var hits: [AssetHit] = []
        for r in results {
            guard let sym = r["symbol"] as? String, !seen.contains(sym) else { continue }
            seen.insert(sym)
            let aliases = (r["aliases"] as? [String]) ?? []
            let name = prettyName(aliases.first(where: { $0 != sym }) ?? sym, symbol: sym)
            hits.append(.init(symbol: sym, name: name, assetClass: (r["assetClass"] as? String) ?? "crypto"))
            if hits.count >= limit { break }
        }
        return hits
    }

    /// The explorable board: sections ranked by real 24h volume server-side,
    /// plus the honest total the search can actually reach.
    static func browseBoard() async -> (sections: [(title: String, assets: [BoardAsset])], totalBases: Int) {
        guard let obj = try? await json("api/bobby-asset-search?browse=1") as? [String: Any],
              let browse = obj["browse"] as? [String: Any] else { return ([], 0) }
        let totalBases = (obj["totalBases"] as? Int) ?? 0
        func parse(_ key: String) -> [BoardAsset] {
            ((browse[key] as? [[String: Any]]) ?? []).compactMap { r in
                guard let sym = r["symbol"] as? String else { return nil }
                return BoardAsset(symbol: sym,
                                  name: prettyName((r["name"] as? String) ?? sym, symbol: sym),
                                  last: r["last"] as? Double)
            }
        }
        var sections: [(String, [BoardAsset])] = []
        let crypto = parse("crypto"); if !crypto.isEmpty { sections.append((L.t("CRYPTO", "CRIPTO"), crypto)) }
        let equity = parse("equity"); if !equity.isEmpty { sections.append((L.t("STOCKS & ETFs", "ACCIONES Y ETFs"), equity)) }
        let metals = parse("commodity"); if !metals.isEmpty { sections.append((L.t("METALS", "METALES"), metals)) }
        return (sections, totalBases)
    }

    /// Words the dictation should favor, from the live board. Spoken NAMES
    /// go first — they are what recognition mangles; tickers fill whatever
    /// budget remains. ~300 phrases covers the top of every class; the
    /// backend's fuzzy net catches the long tail beyond it.
    static func dictationVocabulary() async -> [String] {
        let (sections, _) = await browseBoard()
        var names: [String] = []
        var tickers: [String] = []
        var seen = Set<String>()
        for (_, assets) in sections {
            for a in assets {
                if a.name != a.symbol, a.name.count >= 2, !seen.contains(a.name) {
                    seen.insert(a.name); names.append(a.name)
                }
                if a.symbol.count >= 2, !seen.contains(a.symbol) {
                    seen.insert(a.symbol); tickers.append(a.symbol)
                }
            }
        }
        return Array((names + tickers).prefix(300))
    }

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

    /// One resolution with the server's safety verdict attached. Fuzzy and
    /// proxy matches must be confirmed by a human before analysis runs —
    /// better to ask once than to confidently analyze the wrong instrument.
    struct AssetResolution {
        let snapshot: MarketSnapshot
        let needsConfirmation: Bool
        let confirmName: String
        let proxyNote: String?
    }

    /// "¿cómo va nvidia hoy?" → the SERVER resolves the phrase canonically
    /// (spoken names, dictation mangles, fuzzy net, proxy safety). The
    /// word-walk below stays only as a fallback for servers that predate
    /// the `resolution` metadata.
    static func resolveAsset(_ query: String) async -> AssetResolution? {
        if let resolved = await resolveViaServer(query) { return resolved }

        let cleaned = query.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty && !stopwords.contains($0) }
        var candidates: [String] = []
        if !cleaned.isEmpty { candidates.append(cleaned.joined(separator: " ")) }
        candidates.append(contentsOf: cleaned.reversed())
        if candidates.isEmpty { candidates = [query] }

        for candidate in candidates {
            if let snap = await searchAsset(candidate) {
                return AssetResolution(snapshot: snap, needsConfirmation: false,
                                       confirmName: snap.symbol, proxyNote: nil)
            }
        }
        return nil
    }

    private static func resolveViaServer(_ query: String) async -> AssetResolution? {
        guard let obj = try? await json("api/bobby-asset-search", method: "POST",
                                        body: ["q": query]) as? [String: Any],
              let resolution = obj["resolution"] as? [String: Any],
              let resolved = obj["resolved"] as? [String: Any],
              let symbol = (resolved["baseSymbol"] as? String) ?? (resolved["symbol"] as? String)
        else { return nil }
        let assetClass = (resolved["assetClass"] as? String) ?? "crypto"
        let aliases = (resolved["aliases"] as? [String]) ?? []
        let name = prettyName(aliases.first(where: { $0 != symbol }) ?? symbol, symbol: symbol)
        let snapshot = MarketSnapshot(
            symbol: symbol,
            name: resolved["displayName"] as? String,
            isEquity: assetClass == "equity",
            price: nil, changePct: nil
        )
        return AssetResolution(
            snapshot: snapshot,
            needsConfirmation: (resolution["needsConfirmation"] as? Bool) ?? false,
            confirmName: name,
            proxyNote: resolution["proxyNote"] as? String
        )
    }

    private static func searchAsset(_ term: String) async -> MarketSnapshot? {
        guard let obj = try? await json("api/bobby-asset-search", method: "POST",
                                        body: ["q": term]) as? [String: Any],
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
