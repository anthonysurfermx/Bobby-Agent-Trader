import Foundation
import XCTest
@testable import Bobby

/// Audit regressions against real native methods. Every HTTP request is intercepted
/// in-process; these cases use neither Apple sign-in, Keychain sessions nor paid AI.
@MainActor
final class NucleoRemediationTests: XCTestCase {
    private final class Identity: @unchecked Sendable {
        private let lock = NSLock()
        private var epoch = UUID()
        private var token = "token-A"
        private var refreshes = 0

        func owner() -> UUID { lock.lock(); defer { lock.unlock() }; return epoch }
        func bearer() -> String { lock.lock(); defer { lock.unlock() }; return token }
        func replace(_ token: String = "token-B") {
            lock.lock(); defer { lock.unlock() }
            epoch = UUID(); self.token = token
        }
        func refresh() -> String {
            lock.lock(); defer { lock.unlock() }
            refreshes += 1; token = "token-A-fresh"; return token
        }
        var refreshCount: Int { lock.lock(); defer { lock.unlock() }; return refreshes }
    }

    private var suite = ""
    private var defaults: UserDefaults!
    private var oldRisk: Any?

    override func setUp() async throws {
        try await super.setUp()
        NucleoFixtures.deactivate()
        B34Stub.install { _ in .fail }
        URLProtocol.registerClass(B34Stub.self)
        suite = "nucleo.remediation.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
        oldRisk = UserDefaults.standard.object(forKey: "agent.riskNoticeVersion")
    }

    override func tearDown() async throws {
        URLProtocol.unregisterClass(B34Stub.self)
        B34Stub.install(nil)
        defaults.removePersistentDomain(forName: suite)
        if let oldRisk { UserDefaults.standard.set(oldRisk, forKey: "agent.riskNoticeVersion") }
        else { UserDefaults.standard.removeObject(forKey: "agent.riskNoticeVersion") }
        try await super.tearDown()
    }

    private func auth(_ identity: Identity) -> BobbyMeterAuth {
        BobbyMeterAuth(bearer: { identity.bearer() }, refresh: { _ in identity.refresh() }, owner: { identity.owner() })
    }

    private func assertCancelled(_ operation: () async throws -> Void, file: StaticString = #filePath, line: UInt = #line) async {
        do { try await operation(); XCTFail("An old account's request must be discarded", file: file, line: line) }
        catch { XCTAssertTrue(error is CancellationError, "\(error)", file: file, line: line) }
    }

    func test401FromAccountANeverRetriesWithAccountB() async {
        let identity = Identity()
        B34Stub.install { _ in identity.replace(); return .json(401, "{}") }
        await assertCancelled { _ = try await BobbyAccessAPI.send("api/voice-tool", auth: self.auth(identity)) }
        XCTAssertEqual(B34Stub.requests.map(\.bearer), ["Bearer token-A"])
        XCTAssertEqual(identity.refreshCount, 0)
    }

    func testAccountReplacementDuringRefreshCannotSendItsFreshToken() async {
        let identity = Identity()
        B34Stub.install { _ in .json(401, "{}") }
        let authentication = BobbyMeterAuth(bearer: { identity.bearer() }, refresh: { _ in
            identity.replace(); return identity.bearer()
        }, owner: { identity.owner() })
        await assertCancelled { _ = try await BobbyAccessAPI.send("api/desk-debate", auth: authentication) }
        XCTAssertEqual(B34Stub.requests.map(\.bearer), ["Bearer token-A"])
    }

    func testLateSuccessForAccountAIsNotAppliedToAccountB() async {
        let identity = Identity()
        B34Stub.install { _ in identity.replace(); return .json(200, #"{"access":{"tier":"pro"}}"#) }
        await assertCancelled { _ = try await BobbyAccessAPI.send("api/bobby-access", auth: self.auth(identity)) }
        XCTAssertEqual(B34Stub.requests.count, 1)
    }

    func testAccountReplacementWhileReadingBearerSendsNothing() async {
        let identity = Identity()
        let authentication = BobbyMeterAuth(bearer: { identity.replace(); return identity.bearer() },
                                             refresh: { _ in nil }, owner: { identity.owner() })
        await assertCancelled { _ = try await BobbyAccessAPI.send("api/voice-tool", auth: authentication) }
        XCTAssertTrue(B34Stub.requests.isEmpty)
    }

    func testSameOwnerExpiredBearerRefreshesAndRetriesOnce() async throws {
        let identity = Identity()
        B34Stub.install { call in .json(call.bearer == "Bearer token-A" ? 401 : 200, "{}") }
        let reply = try await BobbyAccessAPI.send("api/bobby-access", auth: auth(identity), timeout: 175)
        XCTAssertEqual(reply.status, 200)
        XCTAssertEqual(B34Stub.requests.map(\.bearer), ["Bearer token-A", "Bearer token-A-fresh"])
        XCTAssertEqual(identity.refreshCount, 1)
        for call in B34Stub.requests {
            XCTAssertEqual(call.request.timeoutInterval, 175)
            XCTAssertEqual(call.request.cachePolicy, .reloadIgnoringLocalCacheData)
            XCTAssertEqual(call.request.value(forHTTPHeaderField: "Cache-Control"), "no-store")
        }
    }

    func testTimeoutReturnsBeforeANonCooperativeExternalTask() async {
        let started = ContinuousClock.now
        let external = Task.detached { try? await Task.sleep(nanoseconds: 500_000_000); return 7 }
        let result = await NucleoAsync.withTimeout(0.025) { await external.value }
        XCTAssertNil(result)
        XCTAssertLessThan(started.duration(to: .now), .milliseconds(250), "The deadline cannot join the external task")
        external.cancel()
    }

    func testCancellationOfTimeoutDoesNotJoinTheWorker() async {
        let external = Task.detached { try? await Task.sleep(nanoseconds: 500_000_000); return 7 }
        let waiting = Task { await NucleoAsync.withTimeout(5) { await external.value } }
        await Task.yield()
        let started = ContinuousClock.now
        waiting.cancel()
        let result = await waiting.value
        XCTAssertNil(result)
        XCTAssertLessThan(started.duration(to: .now), .milliseconds(250))
        external.cancel()
    }

    func testCompletedOperationWinsItsDeadline() async {
        let result = await NucleoAsync.withTimeout(0.5) { 42 }
        XCTAssertEqual(result, 42)
    }

    func testCancellingReleasedSpeechSuppressesItsPendingFinal() async throws {
        let speech = NucleoSpeech(finalWait: 0.02)
        var finals = 0
        speech.emit = { event, _ in if event == "speech.final" { finals += 1 } }
        speech.waitForFinal() // The same state entered when the user releases the pill.
        XCTAssertFalse(speech.isListening)
        speech.cancel() // App background, account change or consent withdrawn.
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertEqual(finals, 0)
    }

    func testReleasedSpeechStillFinalizesWithoutCancellation() async throws {
        let speech = NucleoSpeech(finalWait: 0.02)
        var finals = 0
        speech.emit = { event, _ in if event == "speech.final" { finals += 1 } }
        speech.waitForFinal()
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertEqual(finals, 1)
        speech.cancel()
    }

    private func makeDesk(_ identity: Identity, level: NucleoAnalysisLevel = .rapido) -> NucleoDesk {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        let desk = NucleoDesk(profile: profile, companions: CompanionStore(defaults: defaults),
                              ledger: NucleoLedger(defaults: defaults), fixtures: true)
        desk.generation = { identity.owner() }
        desk.userID = { nil }
        desk.meterAuth = .none
        desk.currentLevel = { level }
        desk.recordQuery = { _, _ in }
        desk.meterChanged = { _, _ in }
        desk.accessChanged = { _ in }
        return desk
    }

    nonisolated private static func json(_ status: Int, _ body: [String: Any]) -> B34Stub.Reply {
        .json(status, String(data: try! JSONSerialization.data(withJSONObject: body), encoding: .utf8)!)
    }

    nonisolated private static var debate: [String: Any] { [
        "agents": ["alpha": "Trend", "red": "Risk", "cio": "Wait", "verdict": "wait", "direction": "none"],
        "technicals": ["price": 10], "provenance": ["provider": "fixture", "asOf": "2026-09-30T09:00:00Z"]
    ] }

    nonisolated private static func market(_ call: B34Stub.Seen) -> B34Stub.Reply {
        switch call.path {
        case "/api/bobby-asset-search":
            return json(200, ["resolution": ["needsConfirmation": false],
                               "resolved": ["baseSymbol": "NVDA", "assetClass": "equity", "aliases": ["Nvidia"]]])
        case "/api/stock-candles":
            return json(200, ["candles": [["ts": Date().timeIntervalSince1970 * 1000,
                                           "open": 10, "high": 11, "low": 9, "close": 10, "volume": 10]]])
        case "/api/voice-tool":
            let body = call.body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            if body?["tool"] as? String == "run_debate" { return json(200, ["technical_pulse": ["signal": "neutral"]]) }
            return json(200, ["price": 10, "change_24h_pct": 0])
        case "/api/desk-debate": return json(200, debate)
        default: return .fail
        }
    }

    private func pulseCalls() -> [B34Stub.Seen] {
        B34Stub.requests.filter { call in
            let body = call.body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            return call.path == "/api/voice-tool" && body?["tool"] as? String == "run_debate"
        }
    }

    func testPremiumRefusalNeverStartsALegacyMeteredPulse() async throws {
        let desk = makeDesk(Identity(), level: .profundo)
        B34Stub.install { call in
            if call.path == "/api/desk-debate" { return Self.json(403, ["code": "upgrade_required"]) }
            return Self.market(call)
        }
        let reply = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        XCTAssertEqual(reply["status"] as? String, "subscription_required")
        XCTAssertTrue(pulseCalls().isEmpty, "A refused premium level cannot consume the general read")
        XCTAssertNil(desk.pendingRead())
    }

    func testHardBudgetPauseDoesNotPromiseOrSwitchToQuick() async throws {
        let desk = makeDesk(Identity(), level: .maximo)
        var selected: NucleoAnalysisLevel?
        desk.setLevel = { selected = $0 }
        B34Stub.install { call in
            if call.path == "/api/desk-debate" { return Self.json(503, ["code": "budget_paused", "level": "maximo", "quickAvailable": false]) }
            return Self.market(call)
        }
        let reply = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        XCTAssertEqual(reply["status"] as? String, "level_notice")
        XCTAssertEqual(reply["level"] as? String, "maximo")
        XCTAssertTrue(pulseCalls().isEmpty)
        XCTAssertNil(selected)
        XCTAssertFalse((reply["sub"] as? String ?? "").contains("Quick"))
    }

    func testDeskGeneralGateIsMappedBeforeAnyPremiumPulseOrResult() async throws {
        let desk = makeDesk(Identity(), level: .profundo)
        let access: [String: Any] = ["tier": "anon", "used": 3, "limit": 3, "remaining": 0, "paywall": false]
        var recorded: BobbyReadAccess?
        desk.accessChanged = { recorded = $0 }
        B34Stub.install { call in
            if call.path == "/api/desk-debate" { return Self.json(401, ["code": "signin_required", "access": access]) }
            return Self.market(call)
        }
        let reply = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        XCTAssertEqual(reply["status"] as? String, "signin_required")
        XCTAssertEqual(recorded?.remaining, 0)
        XCTAssertTrue(pulseCalls().isEmpty)
        XCTAssertNil(reply["agents"])
    }

    func testDeskReceiptOverridesTheTechnicalPulseAccessSnapshot() async throws {
        let desk = makeDesk(Identity())
        let access: [String: Any] = ["tier": "anon", "used": 2, "limit": 3, "remaining": 1, "paywall": false]
        B34Stub.install { call in
            if call.path == "/api/desk-debate" { var body = Self.debate; body["access"] = access; return Self.json(200, body) }
            return Self.market(call)
        }
        let reply = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        XCTAssertEqual(reply["status"] as? String, "ok")
        XCTAssertEqual((reply["access"] as? [String: Any])?["remaining"] as? Int, 1)
    }

    func testPendingAndCachedSavedReadCannotCrossAccountGenerations() async throws {
        let identity = Identity(), desk = makeDesk(identity)
        B34Stub.install(Self.market)
        let read = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        let id = try XCTUnwrap(read["requestId"] as? String)
        XCTAssertNotNil(desk.pendingRead())
        identity.replace()
        XCTAssertNil(desk.pendingRead())
        let stale = try await desk.saveThesis(NucleoParams(["requestId": id]))
        XCTAssertEqual(stale["status"] as? String, "stale")

        let own = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        let ownID = try XCTUnwrap(own["requestId"] as? String)
        let saved = try await desk.saveThesis(NucleoParams(["requestId": ownID]))
        XCTAssertEqual(saved["status"] as? String, "saved")
        identity.replace("token-C")
        let cached = try await desk.saveThesis(NucleoParams(["requestId": ownID]))
        XCTAssertEqual(cached["status"] as? String, "stale", "Owner validation must precede the saved cache hit")
    }

    func testOldFollowUpAndConfirmationTokenAreRejectedLocally() async throws {
        let identity = Identity(), desk = makeDesk(identity)
        B34Stub.install(Self.market)
        let read = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        let id = try XCTUnwrap(read["requestId"] as? String)
        B34Stub.install { call in
            if call.path == "/api/bobby-asset-search" {
                return Self.json(200, ["resolution": ["needsConfirmation": true],
                                       "resolved": ["baseSymbol": "NVDA", "assetClass": "equity"]])
            }
            return Self.market(call)
        }
        let confirmed = try await desk.ask(NucleoParams(["question": "Analyze nvidea"]))
        let token = try XCTUnwrap(confirmed["token"] as? String)
        identity.replace()
        B34Stub.install { _ in .fail }
        for params in [["token": token], ["followUpOf": id, "question": "What changed?"]] {
            do { _ = try await desk.ask(NucleoParams(params)); XCTFail("Old account input must be rejected") }
            catch { XCTAssertTrue(error is NucleoFault) }
        }
        XCTAssertTrue(B34Stub.requests.isEmpty)
    }

    func testAnonymousSignInGateCanResumeExactlyOnceAfterExplicitLogin() async throws {
        let identity = Identity(), desk = makeDesk(identity)
        B34Stub.install { call in
            if call.path == "/api/voice-tool",
               call.body.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] })?["tool"] as? String == "run_debate" {
                return Self.json(401, ["code": "signin_required"])
            }
            return Self.market(call)
        }
        let gate = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        let token = try XCTUnwrap(gate["token"] as? String)
        identity.replace()
        desk.userID = { "account-A" }
        desk.invalidatePending(preservingAnonymousSignInRetries: true)
        B34Stub.install(Self.market)
        let reply = try await desk.ask(NucleoParams(["token": token]))
        XCTAssertEqual(reply["status"] as? String, "ok")
        XCTAssertEqual(reply["question"] as? String, "Analyze NVDA")
        do { _ = try await desk.ask(NucleoParams(["token": token])); XCTFail("The transferred token must remain single-use") }
        catch { XCTAssertTrue(error is NucleoFault) }
    }

    func testLateDeskResponseDoesNotUpdateTheNewAccountOrPendingRead() async throws {
        let identity = Identity(), desk = makeDesk(identity)
        var accessChanges = 0, remembered = 0
        desk.accessChanged = { _ in accessChanges += 1 }
        desk.recordQuery = { _, _ in remembered += 1 }
        B34Stub.install { call in
            if call.path == "/api/desk-debate" {
                identity.replace()
                var body = Self.debate; body["access"] = ["tier": "pro", "used": 1]
                return Self.json(200, body)
            }
            return Self.market(call)
        }
        let reply = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        XCTAssertEqual(reply["status"] as? String, "cancelled")
        XCTAssertNil(desk.pendingRead())
        XCTAssertEqual(accessChanges, 0)
        XCTAssertEqual(remembered, 0)
    }

    func testAccountReplacementDuringQuickPulseCannotStartTheDesk() async throws {
        let identity = Identity(), desk = makeDesk(identity)
        var accessChanges = 0
        desk.accessChanged = { _ in accessChanges += 1 }
        B34Stub.install { call in
            let body = call.body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any]
            if call.path == "/api/voice-tool", body?["tool"] as? String == "run_debate" {
                identity.replace()
                return Self.json(200, ["access": ["tier": "pro", "used": 1]])
            }
            return Self.market(call)
        }
        let reply = try await desk.ask(NucleoParams(["question": "Analyze NVDA"]))
        XCTAssertEqual(reply["status"] as? String, "cancelled")
        XCTAssertFalse(B34Stub.requests.contains { $0.path == "/api/desk-debate" })
        XCTAssertEqual(accessChanges, 0)
    }
}
