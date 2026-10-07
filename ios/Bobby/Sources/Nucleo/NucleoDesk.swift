// The Núcleo desk (Nucleo/ARCHITECTURE.md §2.4, §2.7). One read at a time, in the
// normative order: validate → busy → risk gate → length → resolve → preflight →
// metered desk → map. Native resolves the asset (the page never
// names one, R3), refuses unsupported or stale instruments BEFORE anything is metered or the
// desk spends quota (R14), asks for an account or Bobby Pro only when the server says so
// (§8), and never produces a verdict on a failure. XP exists only on Save (R4).
import Foundation

/// An asset as the bridge names it (symbol, pretty name, class).
struct NucleoAsset: Equatable, Sendable {
    let symbol: String
    let name: String
    let isEquity: Bool
    let assetClass: String
    var currency: String? = nil
    var exchange: String? = nil

    var json: [String: Any] {
        var result: [String: Any] = ["symbol": symbol, "name": name, "isEquity": isEquity]
        if let currency { result["currency"] = currency }
        if let exchange { result["exchange"] = exchange }
        return result
    }
    var jsonWithClass: [String: Any] { var result = json; result["assetClass"] = assetClass; return result }
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
        var currency: String? = nil
        var exchange: String? = nil
        var asOf: String? = nil
        var json: [String: Any] {
            var result: [String: Any] = ["price": NucleoDeskIO.orNull(price), "changePct": NucleoDeskIO.orNull(changePct)]
            if let currency { result["currency"] = currency }
            if let exchange { result["exchange"] = exchange }
            if let asOf { result["asOf"] = asOf }
            return result
        }
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

    /// Levels (Profundo / Máximo): the CIO's short synthesis, shown first.
    struct Synthesis: Sendable {
        let headline: String, why: String?, risk: String?, watch: String?
        /// The CIO's next question (ARCHITECTURE.md §3.5). The page decides whether it is shown; native only carries it.
        var followUp: String? = nil
        /// Without a next question the object is exactly what it was before the key existed.
        var json: [String: Any] {
            var json: [String: Any] = ["headline": headline, "why": orNull(why), "risk": orNull(risk), "watch": orNull(watch)]
            if let followUp { json["followUp"] = followUp }
            return json
        }
    }

    /// The server bounds the next question at 160 characters. A longer one is not a question the page could show:
    /// it is dropped whole, never cut.
    static let nextQuestionLimit = 160

    static func nextQuestion(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty,
              text.count <= nextQuestionLimit else { return nil }
        return text
    }

    /// Two wordings of one question differ only in their spaces (the page collapses them before it shows or asks it).
    static func sameQuestion(_ a: String, _ b: String) -> Bool {
        func words(_ s: String) -> [Substring] { s.split(whereSeparator: \.isWhitespace) }
        return words(a) == words(b)
    }

    struct Sufficiency: Sendable {
        let horizon: String?, missing: [String], sufficient: Bool
        var json: [String: Any] { ["horizon": orNull(horizon), "missing": missing, "sufficient": sufficient] }
    }

    struct Evidence: Sendable {
        let timeframes: [String], derivatives: Bool
        let resolvedCalls: Int?, wins: Int?, losses: Int?, breakEven: Int?
        var json: [String: Any] {
            ["timeframes": timeframes, "derivatives": derivatives,
             "record": resolvedCalls.map { ["resolvedCalls": $0, "wins": wins ?? 0, "losses": losses ?? 0, "breakEven": breakEven ?? 0] as Any } ?? NSNull()]
        }
    }

    struct Debate: Sendable {
        let alpha: String, red: String, cio: String, verdict: String, direction: String
        let technicals: Technicals
        let provenance: Provenance
        var rebuttal: String? = nil
        var confirm: String? = nil
        var invalidate: String? = nil
        var synthesis: Synthesis? = nil
        var sufficiency: Sufficiency? = nil
        var evidence: Evidence? = nil
        var level: String? = nil
        var access: BobbyReadAccess? = nil
        var telemetry: BobbyTelemetryReceipt? = nil
        /// 1.8, additive: the memory receipt and, for a question that carried a thesis, the review lists.
        var memory: MemoryReceipt? = nil
        var review: ThesisReviewNotes? = nil
        var agentsJSON: [String: Any] {
            var a: [String: Any] = ["alpha": alpha, "red": red, "cio": cio, "verdict": verdict, "direction": direction]
            if let rebuttal { a["rebuttal"] = rebuttal }
            if let confirm, let invalidate { a["scenarios"] = ["confirm": confirm, "invalidate": invalidate] }
            return a
        }
    }

    enum DebateOutcome: Sendable {
        case ok(Debate)
        case quota(retryAfter: Int?, message: String?)
        case tooLong(message: String?)
        case gated(status: String, message: String?, access: BobbyReadAccess?)
        case failed(code: String, message: String?)
        /// 403 signin_required | upgrade_required | level_exhausted: this level is refused for this caller.
        case levelRefused(code: String, meter: NucleoLevelMeter?)
        /// A soft budget pauses premium; the hard budget pauses every level.
        case budgetPaused(allLevels: Bool)
        case badResponse, timeout, network, cancelled
    }

    static let levelRefusals: Set<String> = ["signin_required", "upgrade_required", "level_exhausted"]

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
        return .resolved(NucleoAsset(symbol: symbol, name: name, isEquity: assetClass == "equity", assetClass: assetClass,
                                     currency: resolved["currency"] as? String, exchange: resolved["exchange"] as? String),
                         needsConfirmation: (resolution["needsConfirmation"] as? Bool) ?? false,
                         matchKind: resolution["matchKind"] as? String,
                         proxyNote: resolution["proxyNote"] as? String)
    }

    // MARK: Chart candles (fixed 1H, independent of the analysis horizon)

    // The chart metadata and both provider URLs must describe the same candle interval.
    static let candlesTimeframe = MarketTimeframe.oneHour

    static func candlePath(symbol: String, isEquity: Bool) -> String {
        let tf = candlesTimeframe
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
        return Market(price: num(obj["price"]), changePct: num(obj["change_24h_pct"]),
                      currency: obj["currency"] as? String, exchange: obj["exchange"] as? String, asOf: obj["asOf"] as? String)
    }

    /// What the metered read (`voice-tool run_debate`) came to (§8.2).
    enum PulseOutcome: Sendable {
        /// 2xx (or any other non-gate reply): the pulse, if any, and the caller's access, if the server sent it.
        case answered(Pulse?, access: BobbyReadAccess?)
        /// 401 `signin_required` or 402 `subscription_required`: this read is refused until the user acts.
        case gated(status: String, message: String?, access: BobbyReadAccess?)
        /// No answer (offline, timeout): the meter fails open, as a legacy server would.
        case unreachable
    }

    /// The metered read. It carries the access headers (device, platform, bearer when signed in).
    static func pulse(_ symbol: String, auth: BobbyMeterAuth) async -> PulseOutcome {
        guard let reply = try? await BobbyAccessAPI.send("api/voice-tool", method: "POST",
                                                         body: ["tool": "run_debate", "args": ["symbol": symbol, "lang": L.ttsLang, "locale": L.localeIdentifier, "country": L.country ?? NSNull() as Any]],
                                                         auth: auth)
        else { return .unreachable }
        return parsePulseReply(status: reply.status, json: reply.json)
    }

    /// 401 → `signin_required`, 402 → `subscription_required` (the HTTP status is the contract; the body's
    /// `code` only confirms it). Anything else is today's reply: a pulse or null, plus `access` when present.
    static func parsePulseReply(status: Int, json: Any?) -> PulseOutcome {
        let body = json as? [String: Any]
        let access = BobbyReadAccess(json: body?["access"])
        switch status {
        case 401: return .gated(status: "signin_required", message: body?["error"] as? String, access: access)
        case 402: return .gated(status: "subscription_required", message: body?["error"] as? String, access: access)
        case 200..<300: return .answered(body.flatMap(parsePulse), access: access)
        default: return .answered(nil, access: access)
        }
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
    /// Uses the same account-scoped retry as other private requests.
    static func debate(symbol: String, question: String, isEquity: Bool, level: NucleoAnalysisLevel = .rapido,
                       auth: BobbyMeterAuth = .account, requestId: String? = nil, thesis: ThesisContext? = nil,
                       onEvent: (@Sendable ([String: Any]) -> Void)? = nil) async -> DebateOutcome {
        do {
            var body: [String: Any] = ["symbol": symbol, "question": question, "language": L.ttsLang,
                                       "locale": L.localeIdentifier, "country": L.country ?? NSNull() as Any,
                                       "assetType": isEquity ? "equity" : "crypto", "level": level.rawValue]
            if let requestId { body["requestId"] = requestId }
            // 1.8: a review the person started carries their thesis; a plain question never has this key.
            if let thesis { body["thesis"] = thesis.json }
            let reply = try await BobbyAccessAPI.send("api/desk-debate", method: "POST",
                                                               body: body,
                                                               auth: auth, timeout: level.timeout, onEvent: onEvent)
            var outcome = parseDebate(status: reply.status, json: reply.json, headers: reply.headers)
            if let requestId, case var .ok(debate) = outcome {
                debate.telemetry = BobbyTelemetryReceipt(json: (reply.json as? [String: Any])?["telemetry"], expectedRequestId: requestId)
                outcome = .ok(debate)
            }
            return outcome
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
        if status == 401 || status == 402 {
            return .gated(status: status == 401 ? "signin_required" : "subscription_required",
                          message: message, access: BobbyReadAccess(json: body?["access"]))
        }
        if status == 429 {
            let seconds = num(headers["retry-after"]).map { Int($0) }
            return .quota(retryAfter: seconds == 0 ? nil : seconds, message: message)
        }
        if status == 400, code == "question_too_long" { return .tooLong(message: message) }
        if status == 403, let code, levelRefusals.contains(code) { return .levelRefused(code: code, meter: NucleoLevelMeter(json: body?["meter"])) }
        if status == 503, code == "budget_paused" {
            return .budgetPaused(allLevels: body?["quickAvailable"] as? Bool == false || body?["level"] as? String == "rapido")
        }
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
        var debate = Debate(
            alpha: alpha, red: red, cio: cio, verdict: verdict,
            direction: ["long", "short", "none"].contains(direction) ? direction : "none",
            technicals: Technicals(price: num(t["price"]), rsi14: num(t["rsi14"]), ema20: num(t["ema20"]), ema50: num(t["ema50"]),
                                   support: num(t["support"]), resistance: num(t["resistance"]), atrPct: num(t["atrPct"]),
                                   trend: (t["trend"] as? String).flatMap { trend[$0] },
                                   momentum: (t["momentum"] as? String).flatMap { momentum[$0] }),
            provenance: Provenance(provider: p["provider"] as? String, instrument: p["instrument"] as? String,
                                   assetType: p["assetType"] as? String, timeframe: p["timeframe"] as? String,
                                   asOf: p["asOf"] as? String))
        func text(_ v: Any?) -> String? {
            guard let s = (v as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
            return String(s.prefix(1200))
        }
        debate.rebuttal = text(agents["rebuttal"])
        if let sc = agents["scenarios"] as? [String: Any], let c = text(sc["confirm"]), let i = text(sc["invalidate"]) {
            debate.confirm = c; debate.invalidate = i
        }
        if let sy = (agents["synthesis"] ?? body["synthesis"]) as? [String: Any], let headline = text(sy["headline"]) {
            debate.synthesis = Synthesis(headline: headline, why: text(sy["why"]), risk: text(sy["risk"]), watch: text(sy["watch"]),
                                         followUp: nextQuestion(sy["followUp"]))
        }
        if let su = body["sufficiency"] as? [String: Any] {
            debate.sufficiency = Sufficiency(horizon: text(su["horizon"]),
                                             missing: Array((su["missing"] as? [Any] ?? []).compactMap { text($0) }.prefix(8)),
                                             sufficient: su["sufficient"] as? Bool ?? true)
        }
        if let ev = body["evidenceUsed"] as? [String: Any] {
            let rec = ev["record"] as? [String: Any]
            debate.evidence = Evidence(timeframes: Array((ev["timeframes"] as? [Any] ?? []).compactMap { text($0) }.prefix(8)),
                                       derivatives: ev["derivatives"] as? Bool ?? false,
                                       resolvedCalls: BobbyReadAccess.count(rec?["resolvedCalls"]), wins: BobbyReadAccess.count(rec?["wins"]),
                                       losses: BobbyReadAccess.count(rec?["losses"]), breakEven: BobbyReadAccess.count(rec?["breakEven"]))
        }
        debate.level = text(body["level"])
        debate.access = BobbyReadAccess(json: body["access"])
        debate.memory = MemoryReceipt(json: body["memory"])
        debate.review = ThesisReviewNotes(json: body["review"])
        return .ok(debate)
    }
}

enum NucleoAsync {
    /// A deadline returns immediately even when the operation awaits an external task
    /// that ignores cancellation. The losing task is cancelled without joining it.
    static func withTimeout<T: Sendable>(_ seconds: Double, _ operation: @escaping @Sendable () async -> T) async -> T? {
        let race = Deadline<T>()
        return await withTaskCancellationHandler(operation: {
            await withCheckedContinuation { continuation in
                race.install(continuation)
                race.add(Task {
                    guard !Task.isCancelled, race.isPending else { race.finish(nil); return }
                    race.finish(await operation())
                })
                race.add(Task {
                    do { try await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000)) }
                    catch { return }
                    race.finish(nil)
                })
            }
        }, onCancel: { race.finish(nil) })
    }

    private final class Deadline<T: Sendable>: @unchecked Sendable {
        private let lock = NSLock()
        private var continuation: CheckedContinuation<T?, Never>?
        private var tasks: [Task<Void, Never>] = []
        private var finished = false
        private var value: T?

        var isPending: Bool {
            lock.lock(); defer { lock.unlock() }
            return !finished
        }

        func install(_ continuation: CheckedContinuation<T?, Never>) {
            lock.lock()
            if finished {
                let value = value
                lock.unlock()
                continuation.resume(returning: value)
            } else {
                self.continuation = continuation
                lock.unlock()
            }
        }

        func add(_ task: Task<Void, Never>) {
            lock.lock()
            let cancel = finished
            if !cancel { tasks.append(task) }
            lock.unlock()
            if cancel { task.cancel() }
        }

        func finish(_ value: T?) {
            lock.lock()
            guard !finished else { lock.unlock(); return }
            finished = true
            self.value = value
            let continuation = continuation
            self.continuation = nil
            let tasks = tasks
            self.tasks.removeAll()
            lock.unlock()
            tasks.forEach { $0.cancel() }
            continuation?.resume(returning: value)
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
    /// Same rule as the server (api/stock-candles.ts): exchange tickers carry a suffix (MC.PA, PETR4.SA).
    static let equitySymbolPattern = #"^[A-Z0-9][A-Z0-9.^=-]{0,19}$"#
    static let uuidPattern = #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#
    static let marketCapSeconds: Double = 20
    static let pulseCapSeconds: Double = 20
    static let pulseGraceSeconds: Double = 5
    /// How long the desk waits for the meter's word before it starts anyway (fail open, §8.2).
    static let meterWaitSeconds: Double = 10
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
    var debateStarted: (NucleoAnalysisLevel) -> Void = { _ in }
    var askFinished: ([String: Any]) -> Void = { _ in }
    var debateEvent: ([String: Any]) -> Void = { _ in }
    var sessionChanged: () -> Void = {}
    /// The person tapped the question Bobby's CIO wrote for a read (the symbol of that read; never the words).
    var nextQuestionPicked: (_ symbol: String) -> Void = { _ in }
    /// Whether Bobby may put its own one-tap question after a read whose access receipt is this one (§3.5).
    /// Withheld, the question never reaches the page, which shows its fixed chips. Always, until a rule says otherwise.
    var offersNextQuestion: (BobbyReadAccess?) -> Bool = { _ in true }
    var recordQuery: (_ symbol: String, _ isEquity: Bool) -> Void = { DeskMemory().recordQuery(symbol: $0, isEquity: $1) }
    /// Whose bearer the metered read carries (fixture mode: nobody).
    var meterAuth: BobbyMeterAuth = .account
    /// Every access object the server sends lands here (the account sheet reads it).
    var accessChanged: (BobbyReadAccess) -> Void = { BobbyAccessCenter.shared.record($0) }
    /// The analysis level the user picked (the level sheet), and the way a fallback chip changes it.
    var currentLevel: () -> NucleoAnalysisLevel = { NucleoLevelCenter.shared.level }
    var setLevel: (NucleoAnalysisLevel) -> Void = { NucleoLevelCenter.shared.level = $0 }
    var meterChanged: (NucleoAnalysisLevel, NucleoLevelMeter?) -> Void = { level, meter in
        NucleoLevelCenter.shared.meterUpdated(level, meter)
        Task { await NucleoLevelCenter.shared.refresh() }
    }
    /// Set by an `upgrade_required` refusal: the page's Bobby Pro chip opens the invite sheet instead.
    var inviteGate: String?

    private struct TokenEntry {
        let asset: NucleoAsset; let question: String; let expires: Date
        var generation: UUID
        var owner: String?
        var anonymousSignInRetry: Bool
        var level: NucleoAnalysisLevel? = nil
        var persistLevel = false
    }
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
        /// The next question the page received with this read (§3.5), if any.
        var nextQuestion: String? { (result["synthesis"] as? [String: Any])?["followUp"] as? String }

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
        var level: NucleoAnalysisLevel = .rapido
    }

    private var tokens: [String: TokenEntry] = [:]
    private var reads: [Read] = []
    private var inflight: Inflight?
    private var islandCache: (at: Date, owner: String?, generation: UUID, value: [String: Any])?

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

    /// `signin_required` / `subscription_required` (§8.3). The token re-asks the same question about
    /// the same asset once the user has signed in or subscribed (single use, 10 min, like a confirm token).
    private func gated(_ status: String, message: String?, access: BobbyReadAccess?, job: Job, asset: NucleoAsset) -> [String: Any] {
        if let access { accessChanged(access) }
        return ["v": 1, "status": status, "token": issueToken(asset, question: job.question, level: job.level, signInRetry: status == "signin_required"),
                "message": NucleoDeskIO.orNull(message), "access": access.map { $0.json as Any } ?? NSNull()]
    }

    /// A level refusal or a premium failure: one calm line and a chip the user taps (never silent).
    private func levelNotice(caption: String, sub: String?, cta: String, level: NucleoAnalysisLevel, persist: Bool,
                             job: Job, asset: NucleoAsset) -> [String: Any] {
        ["v": 1, "status": "level_notice", "caption": caption, "sub": NucleoDeskIO.orNull(sub), "cta": cta,
         "token": issueToken(asset, question: job.question, level: level, persist: persist), "level": level.rawValue]
    }

    /// A read that failed after its asset was known (network, timeout, analysis_failed, desk_unavailable):
    /// the honest error plus a single-use `retry` token — the same question, asset and level — so the page
    /// offers "Try again" in one tap. The server refunds a read that failed (api/desk-debate.ts).
    private func retryable(_ result: [String: Any], job: Job, asset: NucleoAsset) -> [String: Any] {
        var out = result
        out["retry"] = issueToken(asset, question: job.question, level: job.level)
        return out
    }

    private func levelRefused(_ code: String, meter: NucleoLevelMeter?, job: Job, asset: NucleoAsset) -> [String: Any] {
        let level = job.level
        meterChanged(level, meter)
        switch code {
        case "signin_required":
            inviteGate = nil
            return ["v": 1, "status": "signin_required", "token": issueToken(asset, question: job.question, level: level, signInRetry: true),
                    "message": NSNull(), "caption": L.t("\(level.name) needs a free account. Your question runs as soon as you’re in.",
                                   "\(level.name) necesita tu cuenta gratis. Tu pregunta corre en cuanto entres."),
                    "access": NSNull()]
        case "upgrade_required":
            let caption = L.t("You used this week’s \(level.name).", "Ya usaste tu \(level.name) de esta semana.")
            inviteGate = caption
            let lower = level.lower
            return ["v": 1, "status": "subscription_required", "token": issueToken(asset, question: job.question, level: level),
                    "caption": caption, "sub": L.t("Invite a friend to unlock more.", "Invita a un amigo para tener más."),
                    "cta": L.t("Invite a friend", "Invita a un amigo"),
                    "fallback": ["label": L.t("Continue with \(lower.name)", "Seguir con \(lower.name)"),
                                 "token": issueToken(asset, question: job.question, level: lower, persist: true)],
                    "message": NSNull(), "access": NSNull()]
        default:
            let day = meter?.resetsDate.map { BobbyAccessAPI.day($0) }
            let lower = level.lower
            return levelNotice(caption: day.map { L.t("Your \(level.name) comes back on \($0).", "Tu \(level.name) vuelve el \($0).") }
                                   ?? L.t("You used your \(level.name) for now.", "Ya usaste tu \(level.name) por ahora."),
                               sub: nil, cta: L.t("Continue with \(lower.name)", "Seguir con \(lower.name)"),
                               level: lower, persist: true, job: job, asset: asset)
        }
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
            guard let entry = tokens.removeValue(forKey: token), entry.expires > Date(), entry.generation == generation
            else { throw NucleoFault.invalid("unknown or expired token") }
            // A fallback chip ("Continue with Quick") is the user's own choice of level: keep it.
            if let level = entry.level, entry.persistLevel { setLevel(level) }
            job = Job(requestId: requestId, question: entry.question, asset: entry.asset, generation: generation, startedAt: Date(),
                      level: entry.level ?? currentLevel())
        case let .followUp(previous, q):
            guard let read = reads.first(where: { $0.requestId == previous && $0.generation == generation })
            else { throw NucleoFault.invalid("unknown followUpOf") }
            // The question is the one Bobby's CIO wrote for that read: the person picked it instead of typing their own.
            // Only the asset is passed on; the words are compared here and kept nowhere.
            if let offered = read.nextQuestion, NucleoDeskIO.sameQuestion(offered, q) {
                nextQuestionPicked(read.asset.symbol)
            }
            job = Job(requestId: requestId, question: q.trimmingCharacters(in: .whitespacesAndNewlines), asset: read.asset,
                      generation: generation, startedAt: Date(), level: currentLevel())
        case let .question(q):
            job = Job(requestId: requestId, question: q.trimmingCharacters(in: .whitespacesAndNewlines), asset: nil,
                      generation: generation, startedAt: Date(), level: currentLevel())
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
        askFinished(Self.cancelledResult)
        current.continuation.resume(returning: Self.cancelledResult)
        return ["cancelled": true]
    }

    /// Events cross back to the main actor after network delivery; re-authorize at execution time.
    func receiveLive(_ event: [String: Any], requestId: String, generation expectedGeneration: UUID) {
        guard inflight?.requestId == requestId, generation() == expectedGeneration,
              profile.acceptedRiskNotice else { return }
        debateEvent(event)
    }

    private func complete(_ requestId: String, _ result: [String: Any]) {
        guard let current = inflight, current.requestId == requestId else { return }
        inflight = nil
        askFinished(result)
        current.continuation.resume(returning: result)
    }

    private func issueToken(_ asset: NucleoAsset, question: String, level: NucleoAnalysisLevel? = nil, persist: Bool = false, signInRetry: Bool = false) -> String {
        purgeTokens()
        let token = UUID().uuidString.lowercased()
        tokens[token] = TokenEntry(asset: asset, question: question, expires: Date().addingTimeInterval(Self.tokenLifetime),
                                   generation: generation(), owner: userID(), anonymousSignInRetry: signInRetry && userID() == nil,
                                   level: level, persistLevel: persist)
        return token
    }

    /// 1.8: a single-use token for a question native writes on the person's tap about an asset it
    /// already knows (a follow-up, a board row). Same lifetime and owner rules as every other token.
    func token(for asset: NucleoAsset, question: String) -> String {
        issueToken(asset, question: question)
    }

    private func purgeTokens(now: Date = Date()) {
        tokens = tokens.filter { $0.value.expires > now && $0.value.generation == generation() }
    }

    private func isCurrent(_ job: Job) -> Bool {
        !Task.isCancelled && generation() == job.generation && profile.acceptedRiskNotice
    }

    private func run(_ job: Job) async -> [String: Any] {
        guard isCurrent(job) else { return Self.cancelledResult }
        // 5. Resolve.
        var asset: NucleoAsset
        if let known = job.asset {
            asset = known
        } else {
            let search = await NucleoDeskIO.search(job.question)
            guard isCurrent(job) else { return Self.cancelledResult }
            switch search {
            case .failed:
                return Self.errorResult("network")
            case .unresolved:
                let hits = await BobbyAPI.searchAssets(job.question, limit: 3)
                guard isCurrent(job) else { return Self.cancelledResult }
                let suggestions: [[String: Any]] = hits.map { hit in
                    let a = NucleoAsset(symbol: hit.symbol, name: hit.name, isEquity: hit.assetClass == "equity", assetClass: hit.assetClass)
                    return ["symbol": hit.symbol, "name": hit.name, "assetClass": hit.assetClass, "token": issueToken(a, question: job.question, level: job.level)]
                }
                return ["v": 1, "status": "unknown_asset", "query": job.question, "suggestions": suggestions]
            case let .resolved(resolved, needsConfirmation, matchKind, proxyNote):
                if needsConfirmation {
                    // Never analyze an unconfirmed guess: the human confirms with this token.
                    return ["v": 1, "status": "confirm", "token": issueToken(resolved, question: job.question, level: job.level),
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
        guard isCurrent(job) else { return Self.cancelledResult }
        let bars: [NucleoDeskIO.Bar]
        switch candleRead {
        case let .failed(code):
            if code == .cancelled { return Self.cancelledResult }
            return retryable(Self.errorResult(code == .timedOut ? "timeout" : "network"), job: job, asset: asset)
        case let .bars(rows):
            bars = rows
        }
        if let reason = NucleoDeskIO.gate(bars, isEquity: isEquity, now: clock.now(symbol)) {
            return Self.unsupported(asset, reason)
        }

        // 7. The desk owns the authoritative quota gate. Older backends still
        // meter Quick through pulse, so retain that preflight for compatibility.
        // Premium must be accepted by the desk before any legacy pulse can debit it.
        let auth = meterAuth
        let level = job.level
        var pulseTask: Task<NucleoDeskIO.PulseOutcome, Never>?
        var early: NucleoDeskIO.PulseOutcome?
        if !level.isPremium {
            let task = Task { await NucleoAsync.withTimeout(Self.pulseCapSeconds) { await NucleoDeskIO.pulse(symbol, auth: auth) } ?? .unreachable }
            pulseTask = task
            early = await NucleoAsync.withTimeout(Self.meterWaitSeconds) { await task.value }
            guard isCurrent(job) else { task.cancel(); return Self.cancelledResult }
            if case let .gated(status, message, access)? = early {
                task.cancel()
                return gated(status, message: message, access: access, job: job, asset: asset)
            }
        }
        defer { pulseTask?.cancel() }

        let question = job.question
        let live: @Sendable ([String: Any]) -> Void = { [weak self] event in
            Task { @MainActor in
                self?.receiveLive(event, requestId: job.requestId, generation: job.generation)
            }
        }
        if !fixtures { BobbyTelemetry.shared.readStarted(job.requestId) }
        async let deskRead = NucleoDeskIO.debate(symbol: symbol, question: question, isEquity: isEquity, level: level,
                                               auth: auth, requestId: job.requestId, onEvent: live)
        let market = await marketRead ?? NucleoDeskIO.Market(price: nil, changePct: nil)
        guard isCurrent(job) else { return Self.cancelledResult }
        emit("ask.stage", ["requestId": job.requestId, "stage": "market", "market": market.json])
        let candles = bars.map(\.json)
        emit("ask.stage", ["requestId": job.requestId, "stage": "candles", "candles": candles, "provenance": NSNull()])
        debateStarted(level)
        let desk = await deskRead
        guard isCurrent(job) else { return Self.cancelledResult }
        if !fixtures, case let .ok(debate) = desk, let receipt = debate.telemetry {
            BobbyTelemetry.shared.readReceived(receipt)
        }
        if case let .gated(status, message, access) = desk {
            return gated(status, message: message, access: access, job: job, asset: asset)
        }
        if level.isPremium, case .ok = desk {
            pulseTask = Task { await NucleoAsync.withTimeout(Self.pulseCapSeconds) { await NucleoDeskIO.pulse(symbol, auth: auth) } ?? .unreachable }
        }
        let meter: NucleoDeskIO.PulseOutcome
        if let early { meter = early }
        else if let task = pulseTask {
            meter = await NucleoAsync.withTimeout(Self.pulseGraceSeconds) { await task.value } ?? .unreachable
        } else { meter = .unreachable }
        guard isCurrent(job) else { return Self.cancelledResult }
        var pulse: NucleoDeskIO.Pulse?
        var access: BobbyReadAccess?
        if case let .ok(debate) = desk { access = debate.access }
        switch meter {
        case let .gated(status, message, gateAccess):
            // Legacy servers gate the pulse. A newer desk's access receipt wins
            // over a stale technical pulse snapshot.
            if access == nil { return gated(status, message: message, access: gateAccess, job: job, asset: asset) }
        case let .answered(p, a):
            pulse = p
            access = access ?? a
        case .unreachable: break
        }
        if let access { accessChanged(access) }

        // 8. Map. Never a verdict on a failure.
        //    A premium debate that did not finish says so plainly, and offers the same level again.
        let premiumFailed: Bool
        switch desk {
        case .timeout, .network, .badResponse, .failed: premiumFailed = level.isPremium
        default: premiumFailed = false
        }
        if premiumFailed {
            meterChanged(level, nil)
            return levelNotice(caption: L.t("The agents didn’t finish.", "Los agentes no terminaron."),
                               sub: L.t("Nothing was taken from your allowance.", "No se descontó nada de tu cupo."),
                               cta: L.t("Try again", "Reintentar"), level: level, persist: false, job: job, asset: asset)
        }
        switch desk {
        case .cancelled: return Self.cancelledResult
        case let .gated(status, message, access):
            return gated(status, message: message, access: access, job: job, asset: asset)
        case .timeout: return retryable(Self.errorResult("timeout"), job: job, asset: asset)
        case .network: return retryable(Self.errorResult("network"), job: job, asset: asset)
        case .badResponse: return Self.errorResult("bad_response")
        case let .levelRefused(code, meter):
            return levelRefused(code, meter: meter, job: job, asset: asset)
        case let .budgetPaused(allLevels):
            if allLevels {
                return levelNotice(caption: L.t("Analysis is paused for now.", "El análisis está en pausa por ahora."),
                                   sub: L.t("Please try again later.", "Inténtalo más tarde."),
                                   cta: L.t("Try again", "Reintentar"), level: level, persist: false, job: job, asset: asset)
            }
            return levelNotice(caption: L.t("\(level.name) is paused for today.", "\(level.name) está en pausa por hoy."),
                               sub: L.t("Quick still works.", "Rápido sigue disponible."),
                               cta: L.t("Continue with Quick", "Seguir con Rápido"), level: .rapido, persist: true, job: job, asset: asset)
        case let .quota(retryAfter, message):
            return ["v": 1, "status": "quota", "retryAfterSec": NucleoDeskIO.orNull(retryAfter), "message": NucleoDeskIO.orNull(message)]
        case let .tooLong(message):
            return ["v": 1, "status": "too_long", "maxLength": DeskQuestion.maxLength, "message": NucleoDeskIO.orNull(message)]
        case let .failed(code, message):
            // Only the two transient desk codes reach here (parseDebate: analysis_failed, desk_unavailable).
            return retryable(Self.errorResult(code, message), job: job, asset: asset)
        case let .ok(debate):
            guard isCurrent(job) else { return Self.cancelledResult }
            let receivedAt = clock.receivedAt(symbol)
            var result: [String: Any] = [
                "v": 1, "status": "ok", "requestId": job.requestId, "question": job.question, "language": L.ttsLang, "locale": L.localeIdentifier, "country": L.country ?? NSNull() as Any,
                "asset": asset.json,
                "market": market.json,
                "technicals": debate.technicals.json,
                "pulse": pulse.map { $0.json as Any } ?? NSNull(),
                "agents": debate.agentsJSON,
                "provenance": debate.provenance.json,
                "candlesTimeframe": NucleoDeskIO.candlesTimeframe.rawValue,
                "candles": candles,
                "receivedAt": Int((receivedAt.timeIntervalSince1970 * 1000).rounded()),
                "elapsedMs": Int((Date().timeIntervalSince(job.startedAt) * 1000).rounded()),
                "fixture": fixtures,
            ]
            // A metering server says how many reads are left; a legacy server says nothing (no key).
            if let access { result["access"] = access.json }
            // Levels: the synthesis goes first; the rest of the debate sits behind it.
            result["level"] = debate.level ?? level.rawValue
            if var synthesis = debate.synthesis {
                if !offersNextQuestion(access) { synthesis.followUp = nil }
                result["synthesis"] = synthesis.json
            }
            if let sufficiency = debate.sufficiency { result["sufficiency"] = sufficiency.json }
            if let evidence = debate.evidence { result["evidenceUsed"] = evidence.json }
            // 1.8: the memory receipt rides the reply for native (the page ignores keys it does not know).
            if let memory = debate.memory {
                result["memory"] = ["recorded": memory.recorded, "asks": memory.asks,
                                    "lastAskedDaysAgo": NucleoDeskIO.orNull(memory.lastAskedDaysAgo),
                                    "changeSinceLastAskPct": NucleoDeskIO.orNull(memory.changeSinceLastAskPct)] as [String: Any]
            }
            if level.isPremium { meterChanged(level, nil) }
            // 9. Remember it (the last 5); it becomes `pendingRead` until saved. No XP here (R4).
            recordQuery(symbol, isEquity)
            reads.append(Read(requestId: job.requestId, result: result, asset: asset, generation: job.generation,
                              debate: debate, price: market.price ?? debate.technicals.price))
            if reads.count > Self.readsKept { reads.removeFirst(reads.count - Self.readsKept) }
            return result
        }
    }

    /// Restore an unsaved recent read only in its original language/locale. Changing app language
    /// never relabels or narrates an older answer as if the provider had generated it in the new one.
    func pendingRead(now: Date = Date()) -> [String: Any]? {
        guard profile.acceptedRiskNotice else { return nil }
        let language = L.ttsLang, locale = L.localeIdentifier
        return reads.last {
            $0.generation == generation() && $0.saved == nil
                && now.timeIntervalSince($0.storedAt) < Self.pendingReadWindow
                && $0.result["language"] as? String == language
                && $0.result["locale"] as? String == locale
        }?.result
    }

    /// The trusted bundled page acknowledges its current visible frame, without seeing the receipt.
    func readRendered(_ p: NucleoParams) throws -> [String: Any] {
        let requestId = try p.string("requestId", maxLength: 36, pattern: Self.uuidPattern)!
        guard !fixtures, !isBusy, profile.acceptedRiskNotice,
              reads.last?.requestId == requestId, reads.last?.generation == generation()
        else { return ["accepted": false] }
        return ["accepted": BobbyTelemetry.shared.readRendered(requestId)]
    }

    // MARK: - saveThesis (the only XP)

    func saveThesis(_ p: NucleoParams) async throws -> [String: Any] {
        let requestId = try p.string("requestId", maxLength: 64)!
        let horizon = try p.int("horizonHours", required: false, oneOf: [24, 72, 168])
        guard let read = reads.first(where: { $0.requestId == requestId }) else { throw NucleoFault.invalid("unknown requestId") }
        guard profile.acceptedRiskNotice else { return Self.errorResult("risk_not_accepted") }
        // Signed in or out while it ran: the read belongs to an account that is gone.
        guard generation() == read.generation else { return ["status": "stale"] }
        if let saved = read.saved { return saved }

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
            Task { [weak self] in await self?.plant(requestId: requestId, eventID: eventID, horizon: horizon, owner: owner, generation: read.generation) }
        }
        return result
    }

    /// Signed in: sync, wait for the server's word on this award, and tell the page what it planted.
    private func plant(requestId: String, eventID: String, horizon: Int?, owner: String?, generation started: UUID) async {
        let outcome = await ProgressSync.shared.outcome(for: eventID, store: companions, profile: profile)
        guard generation() == started, ledgerOwner() == owner, profile.acceptedRiskNotice else { return }
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
                    let extensionResult = await DeskSeedExtender().extend(inventoryID: inventoryID, to: target)
                    guard generation() == started, ledgerOwner() == owner, profile.acceptedRiskNotice else { return }
                    if case let .success(extended) = extensionResult {
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

    /// 1.8: whose thesis book the screens read and write (the saved-reads ledger's owner).
    var thesisOwner: String? { ledgerOwner() }

    /// 1.8: what a screen may know about a recent read of the CURRENT account (the thesis editor drafts from it).
    func readSummary(requestId: String) -> NucleoReadSummary? {
        guard profile.acceptedRiskNotice, let read = reads.last(where: { $0.requestId == requestId }), read.generation == generation() else { return nil }
        let synthesis = read.result["synthesis"] as? [String: Any]
        func text(_ key: String) -> String? { (synthesis?[key] as? String).flatMap { $0.isEmpty ? nil : $0 } }
        return NucleoReadSummary(requestId: requestId, symbol: read.asset.symbol, name: read.asset.name, isEquity: read.asset.isEquity,
                                 verdict: read.verdict, price: read.price, asOf: read.asOf,
                                 headline: text("headline"), why: text("why"), risk: text("risk"), watch: text("watch"))
    }

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
        let started = generation()
        if let cache = islandCache, cache.owner == owner, cache.generation == started,
           Date().timeIntervalSince(cache.at) < Self.islandCacheSeconds { return cache.value }
        let sync = TraderLandSync()
        await sync.load()
        guard let world = sync.world, userID() == owner, generation() == started, profile.acceptedRiskNotice
        else { return ["available": false, "reason": "unavailable"] }
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
        islandCache = (Date(), owner, started, value)
        return value
    }

    /// Background, teardown.
    func teardown() {
        _ = cancel()
        tokens.removeAll()
    }

    /// Account replacement and revoked consent discard transient results. A question
    /// explicitly gated for an anonymous sign-in may resume after that sign-in alone.
    func invalidatePending(preservingAnonymousSignInRetries: Bool = false) {
        _ = cancel()
        if preservingAnonymousSignInRetries, userID() != nil {
            let current = generation()
            tokens = tokens.filter { $0.value.owner == nil && $0.value.anonymousSignInRetry && $0.value.expires > Date() }
                .mapValues { entry in
                    var rebound = entry
                    rebound.generation = current
                    rebound.owner = userID()
                    rebound.anonymousSignInRetry = false
                    return rebound
                }
        } else {
            tokens.removeAll()
        }
        reads.removeAll()
        islandCache = nil
        inviteGate = nil
    }

    static func iso(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}
