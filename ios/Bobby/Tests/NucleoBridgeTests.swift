import AVFoundation
import Foundation
import Speech
import XCTest
@testable import Bobby

/// The native Núcleo bridge against its contract (Nucleo/ARCHITECTURE.md §2, §4, §6.2 A1).
/// Every read replays the recorded captures through NucleoFixtureProtocol: no request leaves
/// the process and no desk quota is spent. Golden replies: Nucleo/fixtures/ask/*.json.
@MainActor
final class NucleoBridgeTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func stages() -> [String] { events.filter { $0.name == "ask.stage" }.compactMap { $0.payload["stage"] as? String } }
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var saved: [String: Any] = [:]
    private var generation = UUID()

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "nucleo.bridge.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        NucleoFixtures.clearLog()
        generation = UUID()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        for key in Self.profileKeys {
            if let v = saved[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func make(riskAccepted: Bool = true) -> (NucleoSession, NucleoBridge, Recorder) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = riskAccepted ? RiskNotice.currentVersion : 0
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults)
        session.desk.clock = NucleoDesk.Clock(now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                                              receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        session.desk.generation = { [unowned self] in self.generation }
        session.desk.recordQuery = { _, _ in }
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder)
    }

    // MARK: - Helpers

    private func reply(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any] = [:]) async -> [String: Any] {
        let (reply, error) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        XCTAssertNil(error, "\(method) envelope refused")
        return reply as? [String: Any] ?? [:]
    }

    private func result(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any] = [:],
                        file: StaticString = #filePath, line: UInt = #line) async -> [String: Any] {
        let r = await reply(bridge, method, params)
        XCTAssertEqual(r["ok"] as? Bool, true, "\(method) faulted: \(r)", file: file, line: line)
        return r["result"] as? [String: Any] ?? [:]
    }

    private func fault(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any] = [:]) async -> String? {
        let r = await reply(bridge, method, params)
        return (r["error"] as? [String: Any])?["code"] as? String
    }

    private func golden(_ name: String) throws -> [String: Any] {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: name, withExtension: "json", subdirectory: "ask"),
                                "golden \(name) missing from the test bundle")
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }

    /// JSON-equal apart from the volatile keys (and `ignoring`).
    private func assertGolden(_ actual: [String: Any], _ name: String, ignoring: [String] = [],
                              file: StaticString = #filePath, line: UInt = #line) throws {
        var a = actual, b = try golden(name)
        // The goldens were recorded in English; the reply's language is the device's (L.ttsLang).
        if let language = a["language"] { XCTAssertEqual(language as? String, L.ttsLang, file: file, line: line) }
        for key in ["requestId", "elapsedMs", "fixture", "language"] + ignoring { a.removeValue(forKey: key); b.removeValue(forKey: key) }
        // Through JSON, so Swift values and decoded Foundation values compare alike.
        let normalized = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: a)) as? NSDictionary)
        if normalized != (b as NSDictionary) {
            XCTFail("golden drift (\(name)):\n" + Self.diff(normalized, b as NSDictionary).prefix(8).joined(separator: "\n"), file: file, line: line)
        }
    }

    private static func diff(_ a: Any?, _ b: Any?, _ path: String = "$") -> [String] {
        if let a = a as? NSDictionary, let b = b as? NSDictionary {
            let keys = Set((a.allKeys + b.allKeys).compactMap { $0 as? String })
            return keys.sorted().flatMap { diff(a[$0], b[$0], path + "." + $0) }
        }
        if let a = a as? NSArray, let b = b as? NSArray {
            guard a.count == b.count else { return ["\(path): \(a.count) items != \(b.count) items"] }
            return (0..<a.count).flatMap { diff(a[$0], b[$0], "\(path)[\($0)]") }
        }
        if let a = a as? NSObject, let b = b as? NSObject, a.isEqual(b) { return [] }
        return ["\(path): \(String(describing: a)) != \(String(describing: b))"]
    }


    // MARK: - Golden reads

    func testNVDAAndBTCReadsEqualTheGoldenAndStagesArriveInOrder() async throws {
        let (_, bridge, recorder) = make()
        let nvda = await result(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        try assertGolden(nvda, "nvda")
        XCTAssertEqual(recorder.stages(), ["resolving", "accepted", "market", "candles"])
        XCTAssertEqual(nvda["fixture"] as? Bool, true)
        let btc = await result(bridge, "ask", ["question": "Is now a good time for Bitcoin?"])
        try assertGolden(btc, "btc")
        XCTAssertFalse(NucleoFixtures.log.isEmpty)
        XCTAssertTrue(NucleoFixtures.log.allSatisfy { $0.contains("bobbyprotocol.xyz") }, "only fixture hosts: \(NucleoFixtures.log)")
    }

    func testDeskRefusalsMapToTheGoldenReplies() async throws {
        for scenario in ["quota", "failed", "unavailable", "gateway_timeout", "too_long"] {
            NucleoFixtures.setScenario(scenario)
            let (_, bridge, _) = make()
            let r = await result(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
            try assertGolden(r, scenario)
            XCTAssertNil(r["agents"], "\(scenario): never a verdict on a failure")
        }
    }

    func testHangTimesOutAndOfflineIsANetworkError() async throws {
        NucleoFixtures.setScenario("hang")
        let (_, bridge, _) = make()
        try assertGolden(await result(bridge, "ask", ["question": "Is now a good time for Bitcoin?"]), "timeout")
        NucleoFixtures.setScenario("offline")
        try assertGolden(await result(bridge, "ask", ["question": "Is now a good time for Bitcoin?"]), "network")
    }

    func testConfirmTokensAreSingleUseAndLeadToTheRead() async throws {
        let (_, bridge, _) = make()
        let fuzzy = await result(bridge, "ask", ["question": "how is nvidea doing"])
        try assertGolden(fuzzy, "confirm-fuzzy", ignoring: ["token"])
        let token = try XCTUnwrap(fuzzy["token"] as? String)
        let read = await result(bridge, "ask", ["token": token])
        try assertGolden(read, "nvda", ignoring: ["question"])
        XCTAssertEqual(read["question"] as? String, "how is nvidea doing", "the confirmed read keeps the user's own question")
        let reuse = await fault(bridge, "ask", ["token": token])
        XCTAssertEqual(reuse, "invalid_params", "a token is single use")
    }

    func testProxyAssetIsConfirmedThenRefusedWithoutADeskCall() async throws {
        let (_, bridge, _) = make()
        let proxy = await result(bridge, "ask", ["question": "Should I buy gold?"])
        try assertGolden(proxy, "confirm-proxy", ignoring: ["token"])
        let refused = await result(bridge, "ask", ["token": try XCTUnwrap(proxy["token"] as? String)])
        try assertGolden(refused, "unsupported-proxy")
        XCTAssertFalse(NucleoFixtures.log.contains { $0.contains("desk-debate") }, "a commodity never spends desk quota")
        XCTAssertFalse(NucleoFixtures.log.contains { $0.contains("candles") }, "refused before its candles are fetched")
    }

    func testUnknownAssetOffersNoGuess() async throws {
        let (_, bridge, _) = make()
        try assertGolden(await result(bridge, "ask", ["question": "hello how are you"]), "unknown")
        XCTAssertFalse(NucleoFixtures.log.contains { $0.contains("desk-debate") })
    }

    func testOneReadAtATimeAndCancel() async throws {
        NucleoFixtures.setScenario("slow")
        let (session, bridge, _) = make()
        let first = Task { await self.result(bridge, "ask", ["question": "Is now a good time for Bitcoin?"]) }
        for _ in 0..<200 where !session.desk.isBusy { await Task.yield() }
        XCTAssertTrue(session.desk.isBusy)
        let second = await fault(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        XCTAssertEqual(second, "busy")
        let cancel = await result(bridge, "cancel")
        XCTAssertEqual(cancel["cancelled"] as? Bool, true)
        let outcome = await first.value
        XCTAssertEqual(outcome["status"] as? String, "cancelled")
        XCTAssertFalse(session.desk.isBusy)
        let idle = await result(bridge, "cancel")
        XCTAssertEqual(idle["cancelled"] as? Bool, false)
    }

    func testRiskGateAndConsentNeverReachTheNetwork() async throws {
        let (_, bridge, _) = make(riskAccepted: false)
        NucleoFixtures.clearLog()
        try assertGolden(await result(bridge, "ask", ["question": "Should I buy NVIDIA right now?"]), "risk")
        let speak = await result(bridge, "speak", ["id": "hello-1", "text": "Hello."])
        XCTAssertEqual(speak["status"] as? String, "muted", "R11: no network voice before consent")
        let suggestions = await result(bridge, "suggestions")
        XCTAssertEqual((suggestions["movers"] as? [Any])?.count, 0)
        XCTAssertFalse((suggestions["quickAccess"] as? [Any] ?? []).isEmpty, "the local row still answers")
        let signIn = await result(bridge, "signIn")
        XCTAssertEqual(signIn["status"] as? String, "unavailable")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(NucleoFixtures.log, [], "no request before the risk notice is accepted")
        let accepted = await result(bridge, "acceptRisk", ["version": RiskNotice.currentVersion])
        XCTAssertEqual(accepted["accepted"] as? Bool, true)
        let stale = await result(bridge, "acceptRisk", ["version": RiskNotice.currentVersion - 1])
        XCTAssertEqual(stale["accepted"] as? Bool, false)
    }

    func testTooLongIsAnsweredLocally() async throws {
        let (_, bridge, _) = make()
        let r = await result(bridge, "ask", ["question": String(repeating: "x", count: 1201)])
        XCTAssertEqual(r["status"] as? String, "too_long")
        XCTAssertEqual(r["maxLength"] as? Int, 1200)
        XCTAssertEqual(NucleoFixtures.log, [])
    }

    // MARK: - saveThesis

    func testSaveThesisAwardsOnceAndLandsInTheLedger() async throws {
        let (session, bridge, recorder) = make()
        let read = await result(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        let requestId = try XCTUnwrap(read["requestId"] as? String)
        XCTAssertEqual(session.desk.pendingRead()?["requestId"] as? String, requestId, "an unsaved read is restorable")
        let xpBefore = session.companions.disciplineXP
        let saved = await result(bridge, "saveThesis", ["requestId": requestId])
        XCTAssertEqual(saved["status"] as? String, "saved")
        XCTAssertEqual(saved["awardedXP"] as? Int, 20, "a Wait read respects the no-trade: 20")
        XCTAssertEqual(saved["kind"] as? String, "no_trade_respected")
        XCTAssertEqual(saved["capped"] as? Bool, false)
        XCTAssertEqual(saved["planting"] as? String, "signed_out", "fixture mode is signed out")
        XCTAssertEqual(session.companions.disciplineXP, xpBefore + 20)
        let thesis = try XCTUnwrap(saved["thesis"] as? [String: Any])
        XCTAssertEqual(thesis["id"] as? String, requestId)
        XCTAssertEqual(thesis["symbol"] as? String, "NVDA")
        XCTAssertEqual(thesis["price"] as? Double, 225.07)
        XCTAssertEqual(thesis["support"] as? Double, 221.1)
        XCTAssertTrue(thesis["entry"] is NSNull, "levels are null in v1")
        XCTAssertTrue(thesis["horizonHours"] is NSNull, "a Wait has no horizon")
        XCTAssertTrue(recorder.events.contains { $0.name == "session.changed" })

        let again = await result(bridge, "saveThesis", ["requestId": requestId])
        XCTAssertEqual(again as NSDictionary, saved as NSDictionary, "saving twice returns the same result")
        XCTAssertEqual(session.companions.disciplineXP, xpBefore + 20, "and awards nothing twice")
        let items = await result(bridge, "theses")["items"] as? [[String: Any]]
        XCTAssertEqual(items?.first?["id"] as? String, requestId)
        XCTAssertNil(items?.first?["eventID"], "the award id never reaches the page")
        XCTAssertNil(session.desk.pendingRead(), "a saved read is not restored")
        XCTAssertEqual(session.companions.pendingAwards.last?.kind, "no_trade_respected")
        XCTAssertEqual(session.companions.pendingAwards.last?.thesis?.symbol, "NVDA")
    }

    func testSaveThesisAfterAnAccountChangeIsStale() async throws {
        let (session, bridge, _) = make()
        let read = await result(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        generation = UUID()
        let saved = await result(bridge, "saveThesis", ["requestId": try XCTUnwrap(read["requestId"] as? String)])
        XCTAssertEqual(saved["status"] as? String, "stale")
        let theses = await result(bridge, "theses")
        XCTAssertEqual((theses["items"] as? [Any])?.count, 0, "no ledger entry")
        XCTAssertTrue(session.companions.pendingAwards.isEmpty, "no award")
    }

    func testSaveThesisAtTheDailyCapStillKeepsTheThesis() async throws {
        defaults.set(3, forKey: "companion.dailyAwards")
        defaults.set(Date(), forKey: "companion.dailyAwardsDay")
        let (_, bridge, _) = make()
        let read = await result(bridge, "ask", ["question": "Is now a good time for Bitcoin?"])
        let saved = await result(bridge, "saveThesis", ["requestId": try XCTUnwrap(read["requestId"] as? String)])
        XCTAssertEqual(saved["awardedXP"] as? Int, 0)
        XCTAssertEqual(saved["capped"] as? Bool, true)
        XCTAssertEqual((saved["thesis"] as? [String: Any])?["points"] as? Int, 0)
        let items = await result(bridge, "theses")["items"] as? [[String: Any]]
        XCTAssertEqual(items?.count, 1, "R12: the ledger keeps a capped save")
        let unknownRead = await fault(bridge, "saveThesis", ["requestId": "not-a-read"])
        XCTAssertEqual(unknownRead, "invalid_params")
    }

    // MARK: - Envelope and params

    func testEnvelopeAndParamValidation() async throws {
        let (_, bridge, _) = make()
        let bads: [Any] = ["nope", ["v": 2, "method": "session", "params": [String: Any]()], ["v": 1, "params": [String: Any]()],
                           ["v": true, "method": "session"],
                           ["v": 1, "method": "session", "params": ["blob": String(repeating: "x", count: 70_000)]]]
        for bad in bads {
            let (reply, error) = await bridge.handle(body: bad, trusted: true)
            XCTAssertNil(reply)
            XCTAssertEqual(error, "bad_envelope")
        }
        let unknown = await reply(bridge, "nope")
        XCTAssertEqual(unknown["ok"] as? Bool, false)
        XCTAssertEqual((unknown["error"] as? [String: Any])?["code"] as? String, "unknown_method")
        let (paramsReply, _) = await bridge.handle(body: ["v": 1, "method": "session", "params": [1]], trusted: true)
        XCTAssertEqual(((paramsReply as? [String: Any])?["error"] as? [String: Any])?["code"] as? String, "invalid_params")

        let invalid: [(String, [String: Any])] = [
            ("ask", ["question": ""]), ("ask", ["question": "   "]), ("ask", ["question": 5]), ("ask", [:]),
            ("ask", ["token": "t", "question": "q"]), ("ask", ["followUpOf": "nope", "question": "q"]),
            ("ask", ["followUpOf": UUID().uuidString.lowercased()]), ("ask", ["token": 3]), ("ask", ["token": "never-issued"]),
            ("haptic", ["kind": "boom"]), ("saveThesis", ["requestId": "not-a-read"]), ("saveThesis", [:]),
            ("speak", ["id": "bad id!", "text": "hi"]), ("speak", ["id": "a", "text": ""]), ("speak", ["id": "a"]),
            ("markHint", ["key": "Bad"]), ("markHint", ["key": String(repeating: "a", count: 40)]),
            ("setMuted", ["muted": "yes"]), ("setMuted", ["muted": 1]), ("acceptRisk", ["version": "4"]), ("acceptRisk", ["version": 4.5]),
            ("openNative", ["route": "web"]), ("setCompanion", ["id": "nobody"]), ("previewVoice", ["companionId": "nobody"]),
            ("log", ["level": "debug", "message": "m"]), ("log", ["level": "info", "message": String(repeating: "m", count: 301)]),
            ("session", ["page": "evil"]), ("speech.stop", ["cancel": "no"]),
        ]
        for (method, params) in invalid {
            let code = await fault(bridge, method, params)
            XCTAssertEqual(code, "invalid_params", "\(method) \(params)")
        }
        // Unknown keys are ignored.
        let hint = await result(bridge, "markHint", ["key": "contract", "extra": ["x": 1]])
        XCTAssertEqual(hint["count"] as? Int, 1)
        let hintAgain = await result(bridge, "markHint", ["key": "contract"])
        XCTAssertEqual(hintAgain["count"] as? Int, 2)
        let long = await result(bridge, "speak", ["id": "long-1", "text": String(repeating: "a", count: 801)])
        XCTAssertEqual(long["status"] as? String, "too_long")
    }

    func testOnlyTheBundledMainFrameMayCall() async throws {
        let dir = URL(fileURLWithPath: "/app/Bobby.app/Nucleo")
        XCTAssertTrue(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file", pageURL: dir.appendingPathComponent("app.html"), nucleoDirectory: dir))
        XCTAssertTrue(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file",
                                             pageURL: URL(string: "file:///app/Bobby.app/Nucleo/onboarding.html#risk"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: false, originProtocol: "file", pageURL: dir.appendingPathComponent("app.html"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "https", pageURL: dir.appendingPathComponent("app.html"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file", pageURL: URL(fileURLWithPath: "/tmp/evil.html"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file", pageURL: URL(fileURLWithPath: "/app/Bobby.app/Nucleo2/app.html"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file", pageURL: URL(fileURLWithPath: "/app/Bobby.app/Nucleo/../Secrets/x.html"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file", pageURL: URL(string: "https://bobbyprotocol.xyz/Nucleo/app.html"), nucleoDirectory: dir))
        XCTAssertFalse(NucleoBridge.isTrusted(isMainFrame: true, originProtocol: "file", pageURL: nil, nucleoDirectory: dir))
        let (_, bridge, _) = make()
        let (reply, _) = await bridge.handle(body: ["v": 1, "method": "session", "params": [:]], trusted: false)
        XCTAssertEqual(((reply as? [String: Any])?["error"] as? [String: Any])?["code"] as? String, "forbidden")
    }

    // MARK: - Session, roster, risk notice

    func testSessionRosterAndRiskNoticeShapes() async throws {
        let (session, bridge, _) = make()
        let s = await result(bridge, "session", ["page": "contract"])
        XCTAssertEqual(s["v"] as? Int, 1)
        XCTAssertEqual(s["page"] as? String, "contract")
        XCTAssertEqual(s["fixtures"] as? Bool, true)
        XCTAssertEqual(s["signedIn"] as? Bool, false, "fixture mode is signed out")
        XCTAssertEqual(s["platform"] as? String, "ios")
        XCTAssertEqual(s["riskVersion"] as? Int, RiskNotice.currentVersion)
        for key in ["firstRun", "onboarded", "language", "localHour", "companion", "xp", "level", "streak", "riskAccepted",
                    "muted", "reducedMotion", "mic", "hints", "pendingRead", "appVersion"] {
            XCTAssertNotNil(s[key], "session.\(key)")
        }
        let roster = await result(bridge, "roster")["companions"] as? [[String: Any]]
        XCTAssertEqual(roster?.count, 18)
        XCTAssertEqual(roster?.first?["id"] as? String, "orb")
        XCTAssertEqual(roster?.first?["webId"] as? String, "bobby")
        XCTAssertEqual(roster?.first?["palette"] as? String, "matrix")
        let starter = try XCTUnwrap(roster?.first { $0["id"] as? String == "mira" })
        XCTAssertEqual(starter["unlocked"] as? Bool, true)
        let picked = await result(bridge, "setCompanion", ["id": "mira"])
        XCTAssertEqual((picked["companion"] as? [String: Any])?["id"] as? String, "mira")
        XCTAssertEqual(session.profile.voiceId, "alloy", "the companion's own voice, as the classic onboarding commits it")
        let locked = await fault(bridge, "setCompanion", ["id": "noor"])
        XCTAssertEqual(locked, "invalid_params", "a locked companion is refused")

        let notice = await result(bridge, "riskNotice")
        XCTAssertEqual(notice["version"] as? Int, RiskNotice.currentVersion)
        XCTAssertEqual((notice["statements"] as? [Any])?.count, 4)
    }

    func testRiskNoticeStatementsMatchTheSnapshot() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "Nucleo", withExtension: nil)?
            .appendingPathComponent("fixtures/native/risk-notice.json"), "dev build copies fixtures/native into the bundle")
        let snapshot = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        XCTAssertEqual(snapshot["version"] as? Int, RiskNotice.currentVersion)
        let byLanguage = try XCTUnwrap(snapshot["statements"] as? [String: [[String: String]]])
        for (lang, spanish) in [("en", false), ("es", true)] {
            let native = RiskNotice.statements(spanish: spanish).map { ["title": $0.title, "body": $0.body] }
            XCTAssertEqual(native, byLanguage[lang], "RiskNoticeView copy drifted from fixtures/native/risk-notice.json (\(lang))")
        }
    }

    func testFinishOnboardingNeedsACompanionAndTheRiskNotice() async throws {
        let (session, bridge, _) = make(riskAccepted: false)
        session.companions.companionId = nil
        let wasOnboarded = session.profile.onboarded
        let incomplete = await result(bridge, "finishOnboarding")
        XCTAssertEqual(incomplete["status"] as? String, "incomplete")
        XCTAssertEqual(incomplete["missing"] as? [String], ["companion", "risk"])
        XCTAssertEqual(session.profile.onboarded, wasOnboarded)
        _ = await result(bridge, "acceptRisk", ["version": RiskNotice.currentVersion])
        _ = await result(bridge, "setCompanion", ["id": "byte"])
        var routed: NucleoPage?
        session.onRoute = { routed = $0 }
        let done = await result(bridge, "finishOnboarding")
        XCTAssertEqual(done["next"] as? String, "app")
        XCTAssertTrue(session.profile.onboarded)
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(routed, .app, "then native cross-fades to app.html")
        XCTAssertEqual(session.page, .app)
    }

    func testTheAvatarOpensTheAccountSheet() async throws {
        let (session, bridge, recorder) = make()
        _ = await result(bridge, "session", ["page": "app"])
        let opened = await result(bridge, "openNative", ["route": "account"])
        XCTAssertEqual(opened["opened"] as? Bool, true)
        XCTAssertEqual(session.sheet, .account, "sign in, sign out, delete the account and privacy live there")
        let second = await result(bridge, "openNative", ["route": "squad"])
        XCTAssertEqual(second["opened"] as? Bool, false, "one sheet at a time")
        session.sheetDismissed()
        XCTAssertNil(session.sheet)
        let sheets = recorder.events.filter { $0.name == "native.sheet" }.map { "\($0.payload["route"] ?? "")/\($0.payload["state"] ?? "")" }
        XCTAssertEqual(sheets, ["account/open", "account/closed"])
    }

    func testARiskRefusalOnTheAppPageRoutesToTheRiskBeat() async throws {
        let (session, bridge, _) = make(riskAccepted: false)
        session.profile.onboarded = true
        session.companions.companionId = "byte"
        var routed: [NucleoPage] = []
        session.onRoute = { routed.append($0) }
        _ = await result(bridge, "session", ["page": "app"])
        try assertGolden(await result(bridge, "ask", ["question": "Should I buy NVIDIA right now?"]), "risk")
        let opened = await result(bridge, "openNative", ["route": "riskNotice"])
        XCTAssertEqual(opened["opened"] as? Bool, true)
        XCTAssertNil(session.sheet, "the read-only notice cannot be accepted: no sheet")
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(routed, [.onboardingRisk], "the risk beat replaces the app page")

        // On the onboarding page the same route is the read-only notice ("Read the full notice").
        _ = await result(bridge, "session", ["page": "onboarding"])
        let sheet = await result(bridge, "openNative", ["route": "riskNotice"])
        XCTAssertEqual(sheet["opened"] as? Bool, true)
        XCTAssertEqual(session.sheet, .riskNotice)
        session.sheetDismissed()
        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(routed, [.onboardingRisk])

        // Once accepted, the app page gets the read-only notice again.
        _ = await result(bridge, "acceptRisk", ["version": RiskNotice.currentVersion])
        _ = await result(bridge, "session", ["page": "app"])
        _ = await result(bridge, "openNative", ["route": "riskNotice"])
        XCTAssertEqual(session.sheet, .riskNotice)
        session.sheetDismissed()
    }

    func testRouting() {
        XCTAssertEqual(NucleoPage.route(onboarded: false, companionId: nil, riskAccepted: false), .onboarding)
        XCTAssertEqual(NucleoPage.route(onboarded: false, companionId: "kora", riskAccepted: true), .onboarding)
        XCTAssertEqual(NucleoPage.route(onboarded: true, companionId: nil, riskAccepted: true), .onboarding)
        XCTAssertEqual(NucleoPage.route(onboarded: true, companionId: "kora", riskAccepted: false), .onboardingRisk)
        XCTAssertEqual(NucleoPage.route(onboarded: true, companionId: "kora", riskAccepted: true), .app)
        XCTAssertEqual(NucleoWebController.url(for: .onboardingRisk)?.fragment, "risk")
        XCTAssertEqual(NucleoWebController.url(for: .app)?.lastPathComponent, "app.html")
    }

    // MARK: - Pure pieces

    func testPreflightGate() {
        let now = Date(timeIntervalSince1970: 1_790_422_548)
        func bars(_ count: Int, lastAge: TimeInterval) -> [NucleoDeskIO.Bar] {
            let last = Int((now.timeIntervalSince1970 - lastAge) * 1000)
            return (0..<count).map { NucleoDeskIO.Bar(t: last - (count - 1 - $0) * 3_600_000, o: 1, h: 1, l: 1, c: 1, v: 0) }
        }
        XCTAssertEqual(NucleoDeskIO.gate([], isEquity: true, now: now), "thin_data")
        XCTAssertNil(NucleoDeskIO.gate(bars(1, lastAge: 4 * 86_400), isEquity: true, now: now))
        XCTAssertEqual(NucleoDeskIO.gate(bars(50, lastAge: 6 * 86_400), isEquity: true, now: now), "stale_data")
        XCTAssertEqual(NucleoDeskIO.gate(bars(58, lastAge: 60), isEquity: false, now: now), "thin_data")
        XCTAssertNil(NucleoDeskIO.gate(bars(59, lastAge: 2 * 3_600), isEquity: false, now: now))
        XCTAssertEqual(NucleoDeskIO.gate(bars(100, lastAge: 4 * 3_600), isEquity: false, now: now), "stale_data")
    }

    func testDebateMapping() {
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 429, json: ["error": "limit"], headers: ["retry-after": "60"])), "quota:60:limit")
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 429, json: nil, headers: [:])), "quota:-:-")
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 504, json: nil, headers: [:])), "bad_response")
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 503, json: ["code": "other"], headers: [:])), "bad_response")
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 200, json: ["agents": ["alpha": "a", "red": "r", "cio": "c", "verdict": "buy"]], headers: [:])),
                       "bad_response", "only wait|review is a verdict")
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 200, json: ["agents": ["alpha": "a", "red": "", "cio": "c", "verdict": "wait"]], headers: [:])),
                       "bad_response", "all three agents must speak")
        XCTAssertEqual(Self.label(NucleoDeskIO.parseDebate(status: 200, json: ["agents": ["alpha": "a", "red": "r", "cio": "c", "verdict": "review", "direction": "up"]], headers: [:])),
                       "ok:review:none")
    }

    private static func label(_ outcome: NucleoDeskIO.DebateOutcome) -> String {
        switch outcome {
        case let .ok(d): return "ok:\(d.verdict):\(d.direction)"
        case let .quota(retry, message): return "quota:\(retry.map(String.init) ?? "-"):\(message ?? "-")"
        case .tooLong: return "too_long"
        case let .failed(code, _): return code
        case .badResponse: return "bad_response"
        case .timeout: return "timeout"
        case .network: return "network"
        case .cancelled: return "cancelled"
        }
    }

    func testVoiceWordIndexCountsWhitespaceSplits() {
        let text = "My call:  wait. Ñandú 🇲🇽 ok"
        let starts = NucleoVoice.wordStarts(text)
        XCTAssertEqual(starts.count, text.split(whereSeparator: \.isWhitespace).count)
        let ns = text as NSString
        XCTAssertEqual(NucleoVoice.wordIndex(starts, location: ns.range(of: "wait").location), 2)
        XCTAssertEqual(NucleoVoice.wordIndex(starts, location: ns.range(of: "ok").location), 5)
        XCTAssertEqual(NucleoVoice.wordIndex(starts, location: 0), 0)
    }

    func testSpeechPermissionStates() {
        XCTAssertEqual(NucleoSpeech.state(mic: .granted, speech: .authorized), "granted")
        XCTAssertEqual(NucleoSpeech.state(mic: .denied, speech: .authorized), "denied")
        XCTAssertEqual(NucleoSpeech.state(mic: .granted, speech: .denied), "denied")
        XCTAssertEqual(NucleoSpeech.state(mic: .granted, speech: .restricted), "restricted")
        XCTAssertEqual(NucleoSpeech.state(mic: .undetermined, speech: .authorized), "undetermined")
        XCTAssertEqual(NucleoSpeech.state(mic: .granted, speech: .notDetermined), "undetermined")
        XCTAssertEqual(NucleoSpeech.level(rms: 0), 0)
        XCTAssertEqual(NucleoSpeech.level(rms: 1), 1)
        XCTAssertEqual(NucleoSpeech.level(rms: 0.01), (20 * log10(0.01) + 50) / 45, accuracy: 1e-6)
    }

    /// Never prompts; `onDevice` is exactly "a recognizer can run on this device for this language".
    func testSpeechPermissionNeverPromptsAndIsOnDeviceOrUnavailable() {
        let permission = NucleoSpeech().permission()
        print("[NucleoBridgeTests] speech permission on this simulator:", permission.state, "onDevice", permission.onDevice)
        XCTAssertEqual(permission.onDevice, permission.state != "unavailable")
        XCTAssertTrue(["granted", "denied", "undetermined", "restricted", "unavailable"].contains(permission.state))
    }

    func testHapticsAreRateLimited() {
        let haptics = NucleoHaptics()
        XCTAssertTrue(haptics.play("light", now: 10))
        XCTAssertFalse(haptics.play("light", now: 10.02))
        XCTAssertTrue(haptics.play("success", now: 10.05))
        XCTAssertFalse(haptics.play("boom", now: 20))
    }

    func testLedgerKeepsTwentyNewestPerOwner() {
        let ledger = NucleoLedger(defaults: defaults)
        for i in 0..<25 {
            ledger.append(NucleoThesis(id: "t\(i)", symbol: "BTC", name: "Bitcoin", isEquity: false, verdict: "wait", direction: "none",
                                       price: 1, support: nil, resistance: nil, entry: nil, stop: nil, target: nil, asOf: "", provider: "OKX",
                                       savedAt: "", horizonHours: nil, points: 20, synced: false, eventID: nil), owner: nil)
        }
        let items = ledger.items(owner: nil)
        XCTAssertEqual(items.count, 20)
        XCTAssertEqual(items.first?.id, "t24")
        XCTAssertEqual(ledger.items(owner: "someone").count, 0)
    }
}
