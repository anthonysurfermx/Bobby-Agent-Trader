// The Núcleo desk (Nucleo/ARCHITECTURE.md §2.4, §2.7). One read at a time, in the
// normative order: validate → busy → risk gate → length → resolve → preflight →
// (market ‖ pulse ‖ desk) → map. Native resolves the asset (the page never names one,
// R3), refuses unsupported or stale instruments BEFORE the desk spends quota (R14),
// and never produces a verdict on a failure. XP exists only on Save (R4).
import Foundation

/// An asset as the bridge names it (symbol, pretty name, class).
struct NucleoAsset: Equatable, Sendable {
    let symbol: String
    let name: String
    let isEquity: Bool
    let assetClass: String

    var json: [String: Any] { ["symbol": symbol, "name": name, "isEquity": isEquity] }
    var jsonWithClass: [String: Any] { ["symbol": symbol, "name": name, "isEquity": isEquity, "assetClass": assetClass] }
}

/// Network reads for a desk question, parsed off the main actor into plain values.
/// `fixtures/normalize.py` is the normative spec of every mapping here.
enum NucleoDeskIO {
    enum Search: Sendable {
        case resolved(NucleoAsset, needsConfirmation: Bool, matchKind: String?, proxyNote: String?)
        case unresolved
        case failed
    }

    struct Bar: Sendable, Equatable {
        let t: Int
        let o: Double, h: Double, l: Double, c: Double, v: Double
        var json: [String: Any] { ["t": t, "o": o, "h": h, "l": l, "c": c, "v": v] }
    }

    enum Candles: Sendable {
        case bars([Bar])
        case failed(URLError.Code)
    }

    struct Market: Sendable, Equatable {
        let price: Double?
        let changePct: Double?
        var json: [String: Any] { ["price": NucleoDeskIO.orNull(price), "changePct": NucleoDeskIO.orNull(changePct)] }
    }

    struct Plan: Sendable {
        let direction: String?, entry: Double?, stop: Double?, target: Double?, rewardRisk: Double?, invalidation: String?
        var json: [String: Any] {
            ["direction": orNull(direction), "entry": orNull(entry), "stop": orNull(stop), "target": orNull(target),
             "rewardRisk": orNull(rewardRisk), "invalidation": orNull(invalidation)]
        }
    }

    struct Pulse: Sendable {
        let signal: String?, direction: String?, convictionPct: Double?, agreementPct: Double?
        let overview: String?, source: String?, instrument: String?, plan: Plan?
        var json: [String: Any] {
            ["signal": orNull(signal), "direction": orNull(direction), "convictionPct": orNull(convictionPct),
             "agreementPct": orNull(agreementPct), "overview": orNull(overview), "source": orNull(source),
             "instrument": orNull(instrument), "plan": plan.map { $0.json as Any } ?? NSNull()]
        }
    }

    struct Technicals: Sendable {
        let price: Double?, rsi14: Double?, ema20: Double?, ema50: Double?, support: Double?, resistance: Double?, atrPct: Double?
        let trend: String?, momentum: String?
        var json: [String: Any] {
            ["price": orNull(price), "rsi14": orNull(rsi14), "ema20": orNull(ema20), "ema50": orNull(ema50),
             "support": orNull(support), "resistance": orNull(resistance), "atrPct": orNull(atrPct),
             "trend": orNull(trend), "momentum": orNull(momentum)]
        }
    }

    struct Provenance: Sendable {
        let provider: String?, instrument: String?, assetType: String?, timeframe: String?, asOf: String?
        var json: [String: Any] {
            ["provider": orNull(provider), "instrument": orNull(instrument), "assetType": orNull(assetType),
             "timeframe": orNull(timeframe), "asOf": orNull(asOf)]
        }
    }

    struct Debate: Sendable {
        let alpha: String, red: String, cio: String, verdict: String, direction: String
        let technicals: Technicals
        let provenance: Provenance
        var agentsJSON: [String: Any] { ["alpha": alpha, "red": red, "cio": cio, "verdict": verdict, "direction": direction] }
    }

    enum DebateOutcome: Sendable {
        case ok(Debate)
        case quota(retryAfter: Int?, message: String?)
        case tooLong(message: String?)
        case failed(code: String, message: String?)
        case badResponse, timeout, network, cancelled
    }

    static let trend = ["alcista": "up", "bajista": "down", "lateral": "sideways", "up": "up", "down": "down", "sideways": "sideways"]
    static let momentum = ["sobrecompra": "overbought", "sobreventa": "oversold", "neutral": "neutral", "overbought": "overbought", "oversold": "oversold"]

    static func orNull(_ v: Any?) -> Any { v ?? NSNull() }

    /// A finite JSON number, or a string that parses as one; never a boolean (normalize.py `num`).
    static func num(_ v: Any?) -> Double? {
        if let n = v as? NSNumber {
            if CFGetTypeID(n) == CFBooleanGetTypeID() { return nil }
            let d = n.doubleValue
            return d.isFinite ? d : nil
        }
        if let s = v as? String, let d = Double(s.trimmingCharacters(in: .whitespaces)), d.isFinite { return d }
        return nil
    }

    // MARK: Asset search

    static func search(_ question: String) async -> Search {
        guard let obj = await BobbyAPI.assetSearch(question) else { return .failed }
        return parseSearch(obj)
    }

    /// `BobbyAPI.resolution(from:)`, keeping `resolved.assetClass`.
    static func parseSearch(_ obj: [String: Any]) -> Search {
        guard let resolution = obj["resolution"] as? [String: Any],
              let resolved = obj["resolved"] as? [String: Any],
              let symbol = (resolved["baseSymbol"] as? String) ?? (resolved["symbol"] as? String), !symbol.isEmpty
        else { return .unresolved }
        let assetClass = (resolved["assetClass"] as? String) ?? "crypto"
        let aliases = (resolved["aliases"] as? [String]) ?? []
        let name = BobbyAPI.prettyName(aliases.first(where: { $0 != symbol }) ?? symbol, symbol: symbol)
        return .resolved(NucleoAsset(symbol: symbol, name: name, isEquity: assetClass == "equity", assetClass: assetClass),
                         needsConfirmation: (resolution["needsConfirmation"] as? Bool) ?? false,
                         matchKind: resolution["matchKind"] as? String,
                         proxyNote: resolution["proxyNote"] as? String)
    }

    // MARK: Candles (1H, exactly the desk's request)

    static func candlePath(symbol: String, isEquity: Bool) -> String {
        let tf = MarketTimeframe.oneHour
        return isEquity
            ? "api/stock-candles?symbol=\(symbol)&range=\(tf.equityQuery.range)&interval=\(tf.equityQuery.interval)"
            : "api/okx-candles?instId=\(symbol)-USDT&bar=\(tf.cryptoBar)&limit=100"
    }

    /// Through `BobbyAPI.response`, so a transport error is told apart from an empty or non-2xx reply.
    static func candles(symbol: String, isEquity: Bool) async -> Candles {
        do {
            let reply = try await BobbyAPI.response(candlePath(symbol: symbol, isEquity: isEquity))
            guard (200..<300).contains(reply.status), let obj = reply.json as? [String: Any] else { return .bars([]) }
            return .bars(decodeCandles(obj))
        } catch let error as URLError {
            return .failed(error.code)
        } catch {
            return .failed(.unknown)
        }
    }

    /// Rows need ts/open/high/low/close; volume defaults to 0; ascending by time.
    static func decodeCandles(_ body: [String: Any]) -> [Bar] {
        let candles = body["candles"] as? [[String: Any]] ?? []
        let rows = candles.isEmpty ? (body["data"] as? [[String: Any]] ?? []) : candles
        var out: [Bar] = []
        for r in rows {
            guard let t = num(r["ts"]), let o = num(r["open"]), let h = num(r["high"]),
                  let l = num(r["low"]), let c = num(r["close"]), abs(t) < 1e15 else { continue }
            out.append(Bar(t: Int(t), o: o, h: h, l: l, c: c, v: num(r["volume"]) ?? 0))
        }
        return out.sorted { $0.t < $1.t }
    }

    /// R14: crypto ≥59 bars and the last one ≤3 h old; equity's last bar ≤5 days old.
    static func gate(_ bars: [Bar], isEquity: Bool, now: Date) -> String? {
        guard let last = bars.last else { return "thin_data" }
        let age = now.timeIntervalSince1970 - Double(last.t) / 1000
        if isEquity { return age > 5 * 86_400 ? "stale_data" : nil }
        if bars.count < 59 { return "thin_data" }
        return age > 3 * 3_600 ? "stale_data" : nil
    }

    // MARK: Market, pulse (quota-free)

    static func market(_ symbol: String) async -> Market {
        guard let reply = try? await BobbyAPI.response("api/voice-tool", method: "POST",
                                                       body: ["tool": "get_market", "args": ["symbol": symbol]]),
              let obj = reply.json as? [String: Any] else { return Market(price: nil, changePct: nil) }
        return Market(price: num(obj["price"]), changePct: num(obj["change_24h_pct"]))
    }

    static func pulse(_ symbol: String) async -> Pulse? {
        guard let reply = try? await BobbyAPI.response("api/voice-tool", method: "POST",
                                                       body: ["tool": "run_debate", "args": ["symbol": symbol, "lang": L.ttsLang]]),
              let obj = reply.json as? [String: Any] else { return nil }
        return parsePulse(obj)
    }

    /// null when the tool failed or sent no technical_pulse; `plan` only with a numeric level.
    static func parsePulse(_ body: [String: Any]) -> Pulse? {
        guard body["error"] == nil, let p = body["technical_pulse"] as? [String: Any] else { return nil }
        var plan: Plan?
        if let tp = p["trade_plan"] as? [String: Any], ["entry", "stop", "target"].contains(where: { num(tp[$0]) != nil }) {
            plan = Plan(direction: tp["direction"] as? String, entry: num(tp["entry"]), stop: num(tp["stop"]), target: num(tp["target"]),
                        rewardRisk: num(tp["rewardRisk"]), invalidation: tp["invalidation"] as? String)
        }
        return Pulse(signal: p["signal"] as? String, direction: p["direction"] as? String,
                     convictionPct: num(p["conviction_pct"]), agreementPct: num(p["agreement_pct"]),
                     overview: p["overview"] as? String, source: p["source"] as? String,
                     instrument: p["instrument"] as? String, plan: plan)
    }

    // MARK: Desk (quota)

    /// Exactly `BobbyAPI.debate`'s request: POST api/desk-debate, Origin header, 100 s timeout.
    static func debate(symbol: String, question: String, isEquity: Bool) async -> DebateOutcome {
        do {
            let reply = try await BobbyAPI.responseWithHeaders("api/desk-debate", method: "POST",
                                                               body: ["symbol": symbol, "question": question, "language": L.ttsLang,
                                                                      "assetType": isEquity ? "equity" : "crypto"])
            return parseDebate(status: reply.status, json: reply.json, headers: reply.headers)
        } catch let error as URLError {
            switch error.code {
            case .timedOut: return .timeout
            case .cancelled: return .cancelled
            default: return .network
            }
        } catch is CancellationError {
            return .cancelled
        } catch {
            return .network
        }
    }

    static func parseDebate(status: Int, json: Any?, headers: [String: String]) -> DebateOutcome {
        let body = json as? [String: Any]
        let code = body?["code"] as? String
        let message = body?["error"] as? String
        if status == 429 {
            let seconds = num(headers["retry-after"]).map { Int($0) }
            return .quota(retryAfter: seconds == 0 ? nil : seconds, message: message)
        }
        if status == 400, code == "question_too_long" { return .tooLong(message: message) }
        if status == 503, let code, code == "analysis_failed" || code == "desk_unavailable" { return .failed(code: code, message: message) }
        guard (200..<300).contains(status), let body, let agents = body["agents"] as? [String: Any],
              let alpha = agents["alpha"] as? String, !alpha.isEmpty,
              let red = agents["red"] as? String, !red.isEmpty,
              let cio = agents["cio"] as? String, !cio.isEmpty,
              let verdict = agents["verdict"] as? String, verdict == "wait" || verdict == "review"
        else { return .badResponse }
        let t = body["technicals"] as? [String: Any] ?? [:]
        let p = body["provenance"] as? [String: Any] ?? [:]
        let direction = agents["direction"] as? String ?? "none"
        return .ok(Debate(
            alpha: alpha, red: red, cio: cio, verdict: verdict,
            direction: ["long", "short", "none"].contains(direction) ? direction : "none",
            technicals: Technicals(price: num(t["price"]), rsi14: num(t["rsi14"]), ema20: num(t["ema20"]), ema50: num(t["ema50"]),
                                   support: num(t["support"]), resistance: num(t["resistance"]), atrPct: num(t["atrPct"]),
                                   trend: (t["trend"] as? String).flatMap { trend[$0] },
                                   momentum: (t["momentum"] as? String).flatMap { momentum[$0] }),
            provenance: Provenance(provider: p["provider"] as? String, instrument: p["instrument"] as? String,
                                   assetType: p["assetType"] as? String, timeframe: p["timeframe"] as? String,
                                   asOf: p["asOf"] as? String)))
    }
}

enum NucleoAsync {
    /// The operation's value, or nil if `seconds` pass first (the operation is then cancelled).
    static func withTimeout<T: Sendable>(_ seconds: Double, _ operation: @escaping @Sendable () async -> T) async -> T? {
        await withTaskGroup(of: T?.self) { group in
            group.addTask { await operation() }
            group.addTask {
                try? await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000))
                return nil
            }
            let first = await group.next() ?? nil
            group.cancelAll()
            return first
        }
    }
}

extension CompanionStore {
    /// `{number, name, progress, nextMinXP}` for the bridge.
    var nucleoLevel: [String: Any] {
        ["number": level.number, "name": level.name, "progress": levelProgress,
         "nextMinXP": nextLevel.map { $0.minXP as Any } ?? NSNull()]
    }
}

@MainActor
final class NucleoDesk {
    /// Fixture mode reads the capture's clock; live mode reads the wall clock.
    struct Clock {
        var now: (_ symbol: String) -> Date = { _ in Date() }
        var receivedAt: (_ symbol: String) -> Date = { _ in Date() }
    }

    static let tokenLifetime: TimeInterval = 600
    static let readsKept = 5
    static let pendingReadWindow: TimeInterval = 1800
    static let equitySymbolPattern = #"^[A-Z]{1,5}$"#
    static let uuidPattern = #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#
    static let marketCapSeconds: Double = 20
    static let pulseCapSeconds: Double = 20
    static let pulseGraceSeconds: Double = 5
    static let islandCacheSeconds: TimeInterval = 60

    let profile: AgentProfile
    let companions: CompanionStore
    let ledger: NucleoLedger
    let fixtures: Bool
    var clock = Clock()
    var generation: () -> UUID = { AccountSession.shared.generation }
    var isSignedIn: () -> Bool = { AccountSession.shared.isSignedIn }
    var userID: () -> String? = { AccountSession.shared.session?.userId }
    var emit: (String, [String: Any]) -> Void = { _, _ in }
    var sessionChanged: () -> Void = {}
    var recordQuery: (_ symbol: String, _ isEquity: Bool) -> Void = { DeskMemory().recordQuery(symbol: $0, isEquity: $1) }

    private struct TokenEntry { let asset: NucleoAsset; let question: String; let expires: Date }
    private final class Read {
        let requestId: String
        let result: [String: Any]
        let asset: NucleoAsset
        let generation: UUID
        let storedAt: Date
        let verdict: String
        let direction: String
        let price: Double?
        let support: Double?
        let resistance: Double?
        let asOf: String
        let provider: String
        var saved: [String: Any]?

        init(requestId: String, result: [String: Any], asset: NucleoAsset, generation: UUID, debate: NucleoDeskIO.Debate, price: Double?) {
            self.requestId = requestId
            self.result = result
            self.asset = asset
            self.generation = generation
            self.storedAt = Date()
            self.verdict = debate.verdict
            self.direction = debate.direction
            self.price = price
            self.support = debate.technicals.support
            self.resistance = debate.technicals.resistance
            self.asOf = debate.provenance.asOf ?? ""
            self.provider = debate.provenance.provider ?? ""
        }
    }
    private struct Inflight {
        let requestId: String
        let task: Task<Void, Never>
        let continuation: CheckedContinuation<[String: Any], Never>
    }
    private struct Job {
        let requestId: String
        let question: String
        let asset: NucleoAsset?
        let generation: UUID
        let startedAt: Date
    }

    private var tokens: [String: TokenEntry] = [:]
    private var reads: [Read] = []
    private var inflight: Inflight?
    private var islandCache: (at: Date, owner: String?, value: [String: Any])?

    init(profile: AgentProfile, companions: CompanionStore, ledger: NucleoLedger, fixtures: Bool) {
        self.profile = profile
        self.companions = companions
        self.ledger = ledger
        self.fixtures = fixtures
    }

    var isBusy: Bool { inflight != nil }

    // MARK: - Canned replies

    static let cancelledResult: [String: Any] = ["v": 1, "status": "cancelled"]

    static func errorResult(_ code: String, _ message: String? = nil) -> [String: Any] {
        ["v": 1, "status": "error", "code": code, "message": NucleoDeskIO.orNull(message)]
    }

    static func unsupported(_ asset: NucleoAsset, _ reason: String) -> [String: Any] {
        ["v": 1, "status": "unsupported", "asset": asset.jsonWithClass, "reason": reason]
    }

    // MARK: - ask

    func ask(_ p: NucleoParams) async throws -> [String: Any] {
        enum Source { case question(String), token(String), followUp(String, String) }
        func question() throws -> String {
            let raw = try p.string("question")!
            guard !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NucleoFault.invalid("question is empty") }
            return raw
        }
        // 1. Params: exactly one of {question} · {token} · {followUpOf, question}.
        let source: Source
        if p.has("token") {
            guard !p.has("question"), !p.has("followUpOf") else { throw NucleoFault.invalid("token takes no question") }
            let token = try p.string("token", maxLength: 128)!
            guard !token.isEmpty else { throw NucleoFault.invalid("token is empty") }
            source = .token(token)
        } else if p.has("followUpOf") {
            let previous = try p.string("followUpOf", maxLength: 36, pattern: Self.uuidPattern)!
            source = .followUp(previous, try question())
        } else {
            source = .question(try question())
        }
        //    ... then one read at a time.
        guard inflight == nil else { throw NucleoFault.busy }
        // 2. Consent before processing: nothing leaves the phone before the risk notice.
        guard profile.acceptedRiskNotice else { return Self.errorResult("risk_not_accepted") }
        // 3. Length, counted like the server counts.
        switch source {
        case let .question(q), let .followUp(_, q):
            if DeskQuestion.isTooLong(q) {
                return ["v": 1, "status": "too_long", "maxLength": DeskQuestion.maxLength, "message": DeskQuestion.tooLongMessage]
            }
        case .token: break
        }
        let requestId = UUID().uuidString.lowercased()
        let generation = generation()
        let job: Job
        switch source {
        case let .token(token):
            purgeTokens()
            guard let entry = tokens.removeValue(forKey: token), entry.expires > Date() else { throw NucleoFault.invalid("unknown or expired token") }
            job = Job(requestId: requestId, question: entry.question, asset: entry.asset, generation: generation, startedAt: Date())
        case let .followUp(previous, q):
            guard let read = reads.first(where: { $0.requestId == previous }) else { throw NucleoFault.invalid("unknown followUpOf") }
            job = Job(requestId: requestId, question: q.trimmingCharacters(in: .whitespacesAndNewlines), asset: read.asset,
                      generation: generation, startedAt: Date())
        case let .question(q):
            job = Job(requestId: requestId, question: q.trimmingCharacters(in: .whitespacesAndNewlines), asset: nil,
                      generation: generation, startedAt: Date())
        }
        // 4.
        emit("ask.stage", ["requestId": requestId, "stage": "resolving"])
        return await withCheckedContinuation { (continuation: CheckedContinuation<[String: Any], Never>) in
            let task = Task { [weak self] in
                guard let self else { return }
                let result = await self.run(job)
                self.complete(requestId, result)
            }
            inflight = Inflight(requestId: requestId, task: task, continuation: continuation)
        }
    }

    /// `cancel()`: the in-flight ask resolves `{status:"cancelled"}` now. The server may already have spent quota.
    func cancel() -> [String: Any] {
        guard let current = inflight else { return ["cancelled": false] }
        inflight = nil
        current.task.cancel()
        current.continuation.resume(returning: Self.cancelledResult)
        return ["cancelled": true]
    }

    private func complete(_ requestId: String, _ result: [String: Any]) {
        guard let current = inflight, current.requestId == requestId else { return }
        inflight = nil
        current.continuation.resume(returning: result)
    }

    private func issueToken(_ asset: NucleoAsset, question: String) -> String {
        purgeTokens()
        let token = UUID().uuidString.lowercased()
        tokens[token] = TokenEntry(asset: asset, question: question, expires: Date().addingTimeInterval(Self.tokenLifetime))
        return token
    }

    private func purgeTokens(now: Date = Date()) {
        tokens = tokens.filter { $0.value.expires > now }
    }

    private func run(_ job: Job) async -> [String: Any] {
        // 5. Resolve.
        var asset: NucleoAsset
        if let known = job.asset {
            asset = known
        } else {
            let search = await NucleoDeskIO.search(job.question)
            if Task.isCancelled { return Self.cancelledResult }
            switch search {
            case .failed:
                return Self.errorResult("network")
            case .unresolved:
                let hits = await BobbyAPI.searchAssets(job.question, limit: 3)
                if Task.isCancelled { return Self.cancelledResult }
                let suggestions: [[String: Any]] = hits.map { hit in
                    let a = NucleoAsset(symbol: hit.symbol, name: hit.name, isEquity: hit.assetClass == "equity", assetClass: hit.assetClass)
                    return ["symbol": hit.symbol, "name": hit.name, "assetClass": hit.assetClass, "token": issueToken(a, question: job.question)]
                }
                return ["v": 1, "status": "unknown_asset", "query": job.question, "suggestions": suggestions]
            case let .resolved(resolved, needsConfirmation, matchKind, proxyNote):
                if needsConfirmation {
                    // Never analyze an unconfirmed guess: the human confirms with this token.
                    return ["v": 1, "status": "confirm", "token": issueToken(resolved, question: job.question),
                            "asset": resolved.jsonWithClass, "matchKind": NucleoDeskIO.orNull(matchKind),
                            "proxyNote": NucleoDeskIO.orNull(proxyNote)]
                }
                asset = resolved
            }
        }

        // 6. Preflight: nothing the desk cannot chart ever spends quota.
        guard asset.assetClass == "equity" || asset.assetClass == "crypto" else { return Self.unsupported(asset, "asset_class") }
        if asset.isEquity, asset.symbol.range(of: Self.equitySymbolPattern, options: .regularExpression) == nil {
            return Self.unsupported(asset, "symbol_format")
        }
        emit("ask.stage", ["requestId": job.requestId, "stage": "accepted", "asset": asset.json,
                           "startedAt": Int((job.startedAt.timeIntervalSince1970 * 1000).rounded())])
        let symbol = asset.symbol
        let isEquity = asset.isEquity
        // The market read (quota-free) starts with the candles; its stage always lands first.
        async let marketRead = NucleoAsync.withTimeout(Self.marketCapSeconds) { await NucleoDeskIO.market(symbol) }
        let candleRead = await NucleoDeskIO.candles(symbol: symbol, isEquity: isEquity)
        if Task.isCancelled { return Self.cancelledResult }
        let bars: [NucleoDeskIO.Bar]
        switch candleRead {
        case let .failed(code):
            if code == .cancelled { return Self.cancelledResult }
            return Self.errorResult(code == .timedOut ? "timeout" : "network")
        case let .bars(rows):
            bars = rows
        }
        if let reason = NucleoDeskIO.gate(bars, isEquity: isEquity, now: clock.now(symbol)) {
            return Self.unsupported(asset, reason)
        }

        // 7. Market ‖ pulse ‖ desk. The reply never precedes its market and candles stages.
        let pulseTask = Task { await NucleoAsync.withTimeout(Self.pulseCapSeconds) { await NucleoDeskIO.pulse(symbol) } ?? nil }
        let question = job.question
        async let deskRead = NucleoDeskIO.debate(symbol: symbol, question: question, isEquity: isEquity)
        let market = await marketRead ?? NucleoDeskIO.Market(price: nil, changePct: nil)
        if Task.isCancelled { pulseTask.cancel(); return Self.cancelledResult }
        emit("ask.stage", ["requestId": job.requestId, "stage": "market", "market": market.json])
        let candles = bars.map(\.json)
        emit("ask.stage", ["requestId": job.requestId, "stage": "candles", "candles": candles, "provenance": NSNull()])
        let desk = await deskRead
        if Task.isCancelled { pulseTask.cancel(); return Self.cancelledResult }
        let pulse: NucleoDeskIO.Pulse? = await NucleoAsync.withTimeout(Self.pulseGraceSeconds) { await pulseTask.value } ?? nil
        pulseTask.cancel()

        // 8. Map. Never a verdict on a failure.
        switch desk {
        case .cancelled: return Self.cancelledResult
        case .timeout: return Self.errorResult("timeout")
        case .network: return Self.errorResult("network")
        case .badResponse: return Self.errorResult("bad_response")
        case let .quota(retryAfter, message):
            return ["v": 1, "status": "quota", "retryAfterSec": NucleoDeskIO.orNull(retryAfter), "message": NucleoDeskIO.orNull(message)]
        case let .tooLong(message):
            return ["v": 1, "status": "too_long", "maxLength": DeskQuestion.maxLength, "message": NucleoDeskIO.orNull(message)]
        case let .failed(code, message):
            return Self.errorResult(code, message)
        case let .ok(debate):
            if Task.isCancelled { return Self.cancelledResult }
            let receivedAt = clock.receivedAt(symbol)
            let result: [String: Any] = [
                "v": 1, "status": "ok", "requestId": job.requestId, "question": job.question, "language": L.ttsLang,
                "asset": asset.json,
                "market": market.json,
                "technicals": debate.technicals.json,
                "pulse": pulse.map { $0.json as Any } ?? NSNull(),
                "agents": debate.agentsJSON,
                "provenance": debate.provenance.json,
                "candles": candles,
                "receivedAt": Int((receivedAt.timeIntervalSince1970 * 1000).rounded()),
                "elapsedMs": Int((Date().timeIntervalSince(job.startedAt) * 1000).rounded()),
                "fixture": fixtures,
            ]
            // 9. Remember it (the last 5); it becomes `pendingRead` until saved. No XP here (R4).
            recordQuery(symbol, isEquity)
            reads.append(Read(requestId: job.requestId, result: result, asset: asset, generation: job.generation,
                              debate: debate, price: market.price ?? debate.technicals.price))
            if reads.count > Self.readsKept { reads.removeFirst(reads.count - Self.readsKept) }
            return result
        }
    }

    /// The latest ok read not saved yet and under 30 min old (restore after a web content crash).
    func pendingRead(now: Date = Date()) -> [String: Any]? {
        reads.last { $0.saved == nil && now.timeIntervalSince($0.storedAt) < Self.pendingReadWindow }?.result
    }

    // MARK: - saveThesis (the only XP)

    func saveThesis(_ p: NucleoParams) async throws -> [String: Any] {
        let requestId = try p.string("requestId", maxLength: 64)!
        let horizon = try p.int("horizonHours", required: false, oneOf: [24, 72, 168])
        guard let read = reads.first(where: { $0.requestId == requestId }) else { throw NucleoFault.invalid("unknown requestId") }
        if let saved = read.saved { return saved }
        // Signed in or out while it ran: the read belongs to an account that is gone.
        guard generation() == read.generation else { return ["status": "stale"] }

        let wait = read.verdict == "wait"
        let kind = wait ? "no_trade_respected" : "read_complete"
        let thesis = AwardThesis.make(symbol: read.asset.symbol, isEquity: read.asset.isEquity, direction: read.direction,
                                      price: read.price, entry: nil, stop: nil, target: nil)
        let award = companions.awardDisciplineEvent(wait ? 20 : 10, kind: kind, thesis: thesis)
        let signedIn = !fixtures && isSignedIn()
        let owner = ledgerOwner()
        let entry = NucleoThesis(
            id: requestId, symbol: read.asset.symbol, name: read.asset.name, isEquity: read.asset.isEquity,
            verdict: read.verdict, direction: read.direction, price: read.price, support: read.support, resistance: read.resistance,
            entry: nil, stop: nil, target: nil, asOf: read.asOf, provider: read.provider,
            savedAt: Self.iso(Date()), horizonHours: wait ? nil : (horizon ?? 24), points: award.points,
            synced: false, eventID: award.eventID)
        // R12: the ledger keeps it even at the daily cap.
        ledger.append(entry, owner: owner)

        // Consume the celebration queues so the classic app never replays them.
        let evolution: Any = companions.pendingEvolution.map { ["number": $0.number, "name": $0.name] as [String: Any] } ?? NSNull()
        companions.pendingEvolution = nil
        let unlocks: [[String: Any]] = companions.pendingToolUnlocks.map { ["id": $0.id, "name": $0.name, "tier": $0.tier] }
        companions.pendingToolUnlocks = []

        let planting = !signedIn ? "signed_out" : (award.eventID == nil ? "capped" : "pending")
        let result: [String: Any] = [
            "status": "saved", "awardedXP": award.points, "capped": award.eventID == nil, "kind": kind,
            "xp": companions.disciplineXP, "level": companions.nucleoLevel, "streak": companions.disciplineStreak,
            "evolution": evolution, "unlocks": unlocks, "planting": planting, "thesis": entry.json,
        ]
        read.saved = result
        islandCache = nil
        sessionChanged()
        if planting == "pending", let eventID = award.eventID {
            Task { [weak self] in await self?.plant(requestId: requestId, eventID: eventID, horizon: horizon, owner: owner) }
        }
        return result
    }

    /// Signed in: sync, wait for the server's word on this award, and tell the page what it planted.
    private func plant(requestId: String, eventID: String, horizon: Int?, owner: String?) async {
        let outcome = await ProgressSync.shared.outcome(for: eventID, store: companions, profile: profile)
        var stage = isSignedIn() ? "failed" : "signed_out"
        var piece: Any = NSNull()
        var horizonJSON: Any = NSNull()
        if let outcome {
            ledger.update(id: requestId, owner: owner) { $0.synced = true }
            switch outcome.grant {
            case let .planted(grant):
                if let item = grant.item {
                    stage = grant.state == "bloomed" ? "bloomed" : "seed"
                    piece = ["id": item.id, "name": item.displayName]
                } else {
                    stage = "failed"
                }
                var seedHorizon = grant.horizon
                if stage == "seed", let hours = horizon, hours > 24, let target = LandHorizon(rawValue: hours),
                   let inventoryID = grant.inventoryId, seedHorizon?.options().contains(target) == true {
                    if case let .success(extended) = await DeskSeedExtender().extend(inventoryID: inventoryID, to: target) {
                        piece = ["id": extended.item.id, "name": extended.item.displayName]
                        seedHorizon = extended.horizon
                    }
                }
                if let h = seedHorizon {
                    horizonJSON = ["hours": h.hours.hours, "reviewAt": h.reviewAt.map { Self.iso($0) as Any } ?? NSNull(),
                                   "extendable": h.extendable]
                    ledger.update(id: requestId, owner: owner) { $0.horizonHours = h.hours.hours }
                }
            case .notPlanted:
                stage = outcome.awarded == 0 && !outcome.duplicate ? "capped" : "failed"
            case .failed:
                stage = "failed"
            }
        }
        islandCache = nil
        emit("thesis.planted", ["requestId": requestId, "stage": stage, "piece": piece, "horizon": horizonJSON])
        sessionChanged()
    }

    // MARK: - Collections

    /// The ledger belongs to the signed-in account; signed out (and fixture mode) is `local`.
    private func ledgerOwner() -> String? { fixtures ? nil : userID() }

    func theses() -> [String: Any] {
        let owner = ledgerOwner()
        var items = ledger.items(owner: owner)
        for i in items.indices where !items[i].synced {
            if let id = items[i].eventID, ProgressSync.shared.outcomes[id] != nil {
                items[i].synced = true
                ledger.update(id: items[i].id, owner: owner) { $0.synced = true }
            }
        }
        return ["items": items.prefix(NucleoLedger.limit).map(\.json)]
    }

    var latestThesis: NucleoThesis? { ledger.items(owner: ledgerOwner()).first }

    func record() -> [String: Any] { ["available": false, "reason": "no_source"] }

    func island() async -> [String: Any] {
        guard !fixtures, isSignedIn() else {
            return ["available": false, "reason": "signed_out", "pendingSeeds": companions.pendingAwards.count]
        }
        // R11: no network before the risk notice is accepted.
        guard profile.acceptedRiskNotice else { return ["available": false, "reason": "unavailable"] }
        let owner = userID()
        if let cache = islandCache, cache.owner == owner, Date().timeIntervalSince(cache.at) < Self.islandCacheSeconds { return cache.value }
        let sync = TraderLandSync()
        await sync.load()
        guard let world = sync.world, userID() == owner else { return ["available": false, "reason": "unavailable"] }
        let waiting = world.inventory.filter { $0.state == "seed" && $0.review?.ready != true }
        let nextReview = waiting.compactMap { $0.review?.reviewAt }.min { (RouteGrant.date($0) ?? .distantFuture) < (RouteGrant.date($1) ?? .distantFuture) }
        var value: [String: Any] = [
            "available": true, "size": world.land.size, "pieces": world.inventory.count,
            "seedsGrowing": world.seedsGrowing, "reviewsReady": world.reviewsReady, "readyToBuild": world.readyToBuild,
            "nextReviewAt": NucleoDeskIO.orNull(nextReview),
        ]
        if let g = world.land.growth {
            value["growth"] = ["occupied": g.occupied, "threshold": NucleoDeskIO.orNull(g.threshold), "nextSize": NucleoDeskIO.orNull(g.nextSize)]
        } else {
            value["growth"] = NSNull()
        }
        value["season"] = world.season.map { ["name": $0.name.text, "earned": $0.earned, "total": $0.total] as Any } ?? NSNull()
        islandCache = (Date(), owner, value)
        return value
    }

    /// Background, teardown.
    func teardown() {
        _ = cancel()
        tokens.removeAll()
    }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}
