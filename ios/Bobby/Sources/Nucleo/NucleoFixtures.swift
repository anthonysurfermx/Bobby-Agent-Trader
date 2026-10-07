// App fixture mode, `-nucleo-fixtures [scenario]` (Nucleo/ARCHITECTURE.md §4.4). DEBUG only.
// A URLProtocol answers every request of the app process from the recorded captures in
// Bundle.main/Nucleo/fixtures (embedded by the Debug-only build phase), so the real
// native pipeline — asset search, preflight, market, pulse, desk, mapping — runs end to
// end without spending desk quota and without a single request leaving the process.
#if DEBUG
import Foundation

enum NucleoFixtures {
    static let scenarios: Set<String> = ["default", "slow", "hang", "quota", "too_long", "failed", "unavailable", "gateway_timeout", "offline",
                                         "signin_required", "subscription_required",
                                         "levels", "upgrade_required", "level_exhausted", "budget_paused"]
    /// Analysis levels (DEBUG QA): `levels` answers a premium desk with a synthesis, a second round, scenarios,
    /// sufficiency and evidence; the other three refuse a premium level the way the server does.
    static let levelScenarios: Set<String> = ["levels", "upgrade_required", "level_exhausted", "budget_paused"]
    static let refusals: Set<String> = ["quota", "too_long", "failed", "unavailable", "gateway_timeout"]
    /// Metered-read refusals (§8): voice-tool run_debate answers 401 / 402 from these captures.
    static let gates: Set<String> = ["signin_required", "subscription_required"]

    private static let lock = NSLock()
    private static var _scenario: String?
    private static var _liveVoice = false
    private static var _timeScale = 1.0
    private static var _registered = false
    private static var _log: [String] = []
    private static var _accessHeaders: [[String: String]] = []
    private static var _candleRequests: [CandleRequest] = []

    struct CandleRequest {
        let method: String
        let url: URL
    }

    /// nil = fixture mode off.
    static var scenario: String? { lock.lock(); defer { lock.unlock() }; return _scenario }
    static var isActive: Bool { scenario != nil }
    static var liveVoice: Bool { lock.lock(); defer { lock.unlock() }; return _liveVoice }
    /// Tests shrink every latency (1 = the documented timings).
    static var timeScale: Double { lock.lock(); defer { lock.unlock() }; return _timeScale }
    /// "METHOD /path -> status" for every request served (never bodies, never question text).
    static var log: [String] { lock.lock(); defer { lock.unlock() }; return _log }
    /// Actual candle requests received by URLProtocol. No request headers or bodies are retained.
    static var candleRequests: [CandleRequest] { lock.lock(); defer { lock.unlock() }; return _candleRequests }
    /// The access headers of every request to voice-tool, bobby-access and desk-debate: `path`
    /// (`/api/voice-tool#run_debate` names the tool), `x-bobby-device`, `x-bobby-platform`, and
    /// `authorization` = "bearer" | "none" (never the token itself).
    static var accessHeaders: [[String: String]] { lock.lock(); defer { lock.unlock() }; return _accessHeaders }

    /// Registers the protocol (once) before any request is made.
    static func activate(scenario: String, liveVoice: Bool = false, timeScale: Double = 1) {
        lock.lock()
        _scenario = scenarios.contains(scenario) ? scenario : "default"
        _liveVoice = liveVoice
        _timeScale = timeScale
        _log = []
        _candleRequests = []
        let register = !_registered
        _registered = true
        lock.unlock()
        if register { URLProtocol.registerClass(NucleoFixtureProtocol.self) }
        print("[NucleoFixture] active · scenario \(scenario)\(liveVoice ? " · live voice" : "")")
    }

    static func deactivate() {
        lock.lock(); _scenario = nil; _liveVoice = false; _timeScale = 1; lock.unlock()
    }

    static func setScenario(_ scenario: String) {
        lock.lock(); _scenario = scenarios.contains(scenario) ? scenario : "default"; lock.unlock()
    }

    static func record(_ line: String) {
        lock.lock(); _log.append(line); lock.unlock()
        print("[NucleoFixture]", line)
    }

    static func clearLog() { lock.lock(); _log = []; _accessHeaders = []; _candleRequests = []; lock.unlock() }

    fileprivate static func recordCandleRequest(_ request: URLRequest) {
        guard let url = request.url, ["/api/okx-candles", "/api/stock-candles"].contains(url.path) else { return }
        let entry = CandleRequest(method: request.httpMethod ?? "GET", url: url)
        lock.lock(); _candleRequests.append(entry); lock.unlock()
    }

    static func recordAccessHeaders(path: String, headers: [String: String]) {
        let lower = Dictionary(headers.map { ($0.key.lowercased(), $0.value) }, uniquingKeysWith: { a, _ in a })
        var entry = ["path": path, "authorization": lower["authorization"] == nil ? "none" : "bearer"]
        for name in [BobbyAccessAPI.deviceHeader, BobbyAccessAPI.platformHeader] { entry[name] = lower[name] ?? "" }
        lock.lock(); _accessHeaders.append(entry); lock.unlock()
    }

    // MARK: - Captures

    static let directory: URL? = Bundle.main.url(forResource: "Nucleo", withExtension: nil)?.appendingPathComponent("fixtures")

    static let manifest: [String: Any] = {
        guard let dir = directory, let data = try? Data(contentsOf: dir.appendingPathComponent("manifest.json")),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
        return obj
    }()

    static func raw(_ name: String) -> [String: Any]? {
        guard let dir = directory, !name.contains("/"),
              let data = try? Data(contentsOf: dir.appendingPathComponent("raw").appendingPathComponent(name)) else { return nil }
        return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    }

    static func files(symbol: String) -> [String: String]? {
        (manifest["bySymbol"] as? [String: Any])?[symbol.uppercased()] as? [String: String]
    }

    /// The capture's own clock. In fixture mode "now" is when the data was recorded, so the
    /// preflight's freshness gate and `receivedAt` are the same on every run.
    static func recordedAt(symbol: String, kind: String) -> Date? {
        guard let name = files(symbol: symbol)?[kind], let iso = raw(name)?["recordedAt"] as? String else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: iso)
    }

    /// `manifest.assetSearch` rules on the lowercased question: first match wins. The question
    /// is padded with spaces, like the browser mock, so " oro" matches a question that starts with it.
    static func assetSearchRule(query: String) -> [String: Any]? {
        let s = " " + query.lowercased() + " "
        for case let rule as [String: Any] in (manifest["assetSearch"] as? [Any]) ?? [] {
            let contains = rule["contains"] as? [String] ?? []
            if contains.isEmpty || contains.contains(where: { s.contains($0) }) { return rule }
        }
        return nil
    }

    // MARK: - Routing

    enum Reply {
        case http(status: Int, headers: [String: String], body: Data)
        case fail(URLError.Code)
    }

    static func json(_ status: Int, _ object: Any) -> Reply {
        .http(status: status, headers: ["Content-Type": "application/json; charset=utf-8"],
              body: (try? JSONSerialization.data(withJSONObject: object)) ?? Data())
    }

    static func serve(_ rawName: String) -> Reply {
        guard let rec = raw(rawName) else { return json(404, ["error": "not in fixtures"]) }
        let status = rec["status"] as? Int ?? 200
        var headers = rec["headers"] as? [String: String] ?? [:]
        let body: Data
        if let text = rec["bodyText"] as? String {
            body = Data(text.utf8)
        } else if let obj = rec["body"], !(obj is NSNull), let data = try? JSONSerialization.data(withJSONObject: obj) {
            body = data
        } else {
            body = Data()
        }
        headers.removeValue(forKey: "Content-Length")
        return .http(status: status, headers: headers, body: body)
    }

    /// What the fixture server answers, and after how long (seconds, before `timeScale`).
    static func route(method: String, url: URL, body: Data?, scenario: String) -> (Reply, TimeInterval) {
        let quick: TimeInterval = 0.15
        if scenario == "offline" { return (.fail(.notConnectedToInternet), quick) }
        let host = url.host?.lowercased() ?? ""
        guard host == "bobbyprotocol.xyz" else { return (.fail(.notConnectedToInternet), quick) }
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func param(_ name: String) -> String? { query.first { $0.name == name }?.value }
        let json = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]

        switch url.path {
        case "/api/bobby-asset-search":
            if param("browse") == "1" { return (Self.json(200, ["ok": true, "browse": [String: Any](), "movers": [Any]()]), quick) }
            guard method == "POST", let q = json["q"] as? String, let rule = assetSearchRule(query: q), let name = rule["raw"] as? String
            else { return (Self.json(400, ["error": "q required"]), quick) }
            return (serve(name), quick)
        case "/api/okx-tickers":
            return (Self.json(200, ["tickers": [Any]()]), quick)
        case "/api/stock-candles", "/api/okx-candles":
            let symbol = url.path == "/api/stock-candles"
                ? (param("symbol") ?? "")
                : (param("instId") ?? "").components(separatedBy: "-USDT").first ?? ""
            guard let name = files(symbol: symbol)?["candles"] else { return (Self.json(502, ["error": "No chart data"]), quick) }
            return (serve(name), quick)
        case "/api/voice-tool":
            let tool = json["tool"] as? String
            let symbol = ((json["args"] as? [String: Any])?["symbol"] as? String ?? "").uppercased()
            let files = files(symbol: symbol)
            if tool == "get_market", let name = files?["market"] { return (serve(name), quick) }
            if tool == "run_debate", gates.contains(scenario) { return (serve("voice-tool.\(scenario).json"), quick) }
            if tool == "run_debate", let name = files?["pulse"] { return (serve(name), quick) }
            return (Self.json(200, ["symbol": symbol, "available": false, "price": NSNull()]), quick)
        case "/api/desk-debate":
            if scenario == "hang" { return (.fail(.timedOut), 20) }
            let symbol = (json["symbol"] as? String ?? "").uppercased()
            let level = json["level"] as? String ?? "rapido"
            if levelScenarios.contains(scenario), level != "rapido" {
                let meter: [String: Any] = ["used": level == "maximo" ? 1 : 3, "limit": level == "maximo" ? 1 : 3, "remaining": 0, "windowDays": 7,
                                            "resetsAt": ISO8601DateFormatter().string(from: Date().addingTimeInterval(4 * 86_400))]
                switch scenario {
                case "upgrade_required", "level_exhausted":
                    return (Self.json(403, ["error": "level refused", "code": scenario, "level": level, "meter": meter]), quick)
                case "budget_paused":
                    return (Self.json(503, ["error": "premium paused", "code": "budget_paused"]), quick)
                default:
                    guard let name = files(symbol: symbol)?["debate"], var body = raw(name)?["body"] as? [String: Any],
                          var agents = body["agents"] as? [String: Any] else { return (Self.json(404, ["error": "not in fixtures"]), quick) }
                    let es = (json["language"] as? String) == "es"
                    agents["synthesis"] = [
                        "headline": es ? "Tendencia firme, pero el precio ya está pegado a la resistencia." : "The trend is firm, but price is already pressed against resistance.",
                        "why": es ? "Las medias de 4H y diario apuntan arriba y el funding está neutral." : "The 4H and daily averages point up and funding is neutral.",
                        "risk": es ? "Un rechazo en la resistencia devuelve el precio al soporte de 1H." : "A rejection at resistance sends price back to the 1H support.",
                        "watch": es ? "Un cierre de 4H por encima de la resistencia con volumen." : "A 4H close above resistance on volume.",
                    ]
                    if level == "maximo" {
                        agents["rebuttal"] = es ? "Alpha responde: el rechazo ya se probó dos veces y el precio no perdió el soporte." : "Alpha answers: the rejection was tested twice and price never lost support."
                        agents["scenarios"] = ["confirm": es ? "Cierre de 4H sobre la resistencia." : "A 4H close above resistance.",
                                               "invalidate": es ? "Cierre de 4H bajo el soporte de 1H." : "A 4H close below the 1H support."]
                    }
                    body["agents"] = agents
                    body["level"] = level
                    body["sufficiency"] = ["horizon": "1w", "available": ["1H", "4H", "1D"], "missing": ["1W"], "sufficient": false]
                    body["evidenceUsed"] = ["timeframes": ["1H", "4H", "1D"], "derivatives": true,
                                            "record": ["resolvedCalls": 5, "wins": 3, "losses": 1, "breakEven": 1]]
                    return (Self.json(200, body), min((raw(name)?["elapsedMs"] as? Double ?? 900) / 1000, 6))
                }
            }
            let served = refusals.contains(scenario) ? "desk-debate.\(scenario).json" : files(symbol: symbol)?["debate"]
            guard let served else { return (Self.json(404, ["error": "not in fixtures"]), quick) }
            // The recorded desk time, capped at 6 s (45 s under `slow`).
            let elapsed = (raw(served)?["elapsedMs"] as? Double ?? 900) / 1000
            return (serve(served), scenario == "slow" ? 45 : min(elapsed, 6))
        case "/api/bobby-access":
            // Fixture mode is signed out: the read of access answers from the scenario, a purchase needs an account.
            if method != "GET" { return (Self.json(401, ["error": "Sign in first.", "code": "signin_required"]), quick) }
            let gateBody = gates.contains(scenario) ? (raw("voice-tool.\(scenario).json")?["body"] as? [String: Any]) : nil
            var reply: [String: Any] = ["access": gateBody?["access"] ?? NSNull(), "signedIn": false, "subscription": NSNull(),
                                        "payments": ["stripe": false, "apple": true]]
            if levelScenarios.contains(scenario) {
                let reset = ISO8601DateFormatter().string(from: Date().addingTimeInterval(4 * 86_400))
                reply["levels"] = ["tier": "free", "levels": [
                    "profundo": ["used": 1, "limit": 6, "remaining": 5, "windowDays": 7, "resetsAt": reset],
                    "maximo": ["used": 0, "limit": 1, "remaining": 1, "windowDays": 7, "resetsAt": reset]]]
                reply["referral"] = ["code": "BQ7K2MXP", "url": "https://bobbyprotocol.xyz/desk?ref=BQ7K2MXP", "accepted": 2, "max": 5,
                                     "rewardDays": 30, "proUntil": NSNull()]
                reply["plans"] = ["limits": ["anon": ["profundo": [2, 30], "maximo": [0, 30]], "free": ["profundo": [6, 7], "maximo": [1, 7]],
                                             "pro": ["profundo": [60, 30], "maximo": [10, 30]]],
                                  "referral": ["maxFriends": 5, "rewardDays": 30], "freeReadsPerWeek": NSNull()]
            }
            return (Self.json(200, reply), quick)
        case "/api/bobby-voice-free":
            // Puts NeuralVoice on the free on-device voice (no TTS spend in fixture mode).
            return (Self.json(503, ["error": "TTS failed"]), quick)
        default:
            return (Self.json(404, ["error": "not in fixtures"]), quick)
        }
    }
}

/// Answers every http(s) request of the app process while fixture mode is on.
final class NucleoFixtureProtocol: URLProtocol {
    private var work: DispatchWorkItem?

    override class func canInit(with request: URLRequest) -> Bool {
        guard NucleoFixtures.isActive, let url = request.url, let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https" else { return false }
        // -nucleo-fixtures-live-voice: the real TTS endpoint, everything else still fixtures.
        if NucleoFixtures.liveVoice, url.host?.lowercased() == "bobbyprotocol.xyz", url.path == "/api/bobby-voice-free" { return false }
        return true
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let request = self.request
        guard let url = request.url, let scenario = NucleoFixtures.scenario else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let method = request.httpMethod ?? "GET"
        NucleoFixtures.recordCandleRequest(request)
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read)
        if ["/api/voice-tool", "/api/bobby-access", "/api/desk-debate"].contains(url.path) {
            let tool = body.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }?["tool"] as? String
            NucleoFixtures.recordAccessHeaders(path: url.path + (tool.map { "#" + $0 } ?? ""), headers: request.allHTTPHeaderFields ?? [:])
        }
        let (reply, delay) = NucleoFixtures.route(method: method, url: url, body: body, scenario: scenario)
        let label = "\(method) \(url.host ?? "-")\(url.path)"
        let item = DispatchWorkItem { [weak self] in
            guard let self else { return }
            switch reply {
            case let .fail(code):
                NucleoFixtures.record("\(label) -> URLError \(code.rawValue)")
                self.client?.urlProtocol(self, didFailWithError: URLError(code))
            case let .http(status, headers, data):
                NucleoFixtures.record("\(label) -> \(status)")
                guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) else {
                    self.client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
                    return
                }
                self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
                self.client?.urlProtocol(self, didLoad: data)
                self.client?.urlProtocolDidFinishLoading(self)
            }
        }
        work = item
        DispatchQueue.global().asyncAfter(deadline: .now() + delay * NucleoFixtures.timeScale, execute: item)
    }

    override func stopLoading() {
        work?.cancel()
        work = nil
    }

    private static func read(_ stream: InputStream) -> Data {
        var data = Data()
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            guard n > 0 else { break }
            data.append(buffer, count: n)
        }
        return data
    }
}
#endif
