import Foundation
import XCTest
@testable import Bobby

/// The harness (1.8), where a read is written down: the session tells the centre who started it (the
/// person, the person again about the same read, or Bobby), what horizon the question named and
/// what review was chosen on the save. Only the person's own question is followed up.
@MainActor
final class HarnessQuestionTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func last(_ name: String) -> [String: Any]? { events.last { $0.name == name }?.payload }
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private static let offered = "What would have to change in NVDA for this read to change?"
    private var previousLanguage = "system"
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var saved: [String: Any] = [:]
    private var generation = UUID()

    override func setUp() async throws {
        try await super.setUp()
        previousLanguage = L.selection
        L.select("en")
        suiteName = "harness.question.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        // The fixture desk answers a premium level with a synthesis (and the question Bobby wrote).
        NucleoFixtures.activate(scenario: "levels", timeScale: 0.01)
        NucleoFixtures.clearLog()
        generation = UUID()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        for key in Self.profileKeys {
            if let v = saved[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        L.select(previousLanguage)
        try await super.tearDown()
    }

    /// Follow-ups already accepted: everything is written whole.
    private func harness() async -> HarnessCenter {
        let fake = FakeHarnessNotifier()
        let center = HarnessCenter(notifier: fake, defaults: defaults)
        center.consent = { .accepted }
        center.currentUser = { nil }
        center.weeklyCovered = { false }
        center.quote = { _ in nil }
        center.load(owner: nil)
        _ = await center.accept()
        return center
    }

    private func make(harness: HarnessCenter) -> (NucleoSession, NucleoBridge, Recorder) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: BriefingIntent(observeAccount: false), reminderIntent: ReminderIntent(observeAccount: false),
                                    harnessIntent: HarnessIntent(observeAccount: false), harness: harness)
        profile.onboarded = true
        session.companions.companionId = "orb"
        session.desk.currentLevel = { .profundo }
        session.desk.setLevel = { _ in }
        session.desk.meterChanged = { _, _ in }
        session.desk.clock = NucleoDesk.Clock(now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                                              receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        session.desk.generation = { [unowned self] in self.generation }
        session.desk.recordQuery = { _, _ in }
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder)
    }

    private func call(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any], file: StaticString = #filePath, line: UInt = #line) async -> [String: Any] {
        let (reply, error) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        XCTAssertNil(error, file: file, line: line)
        let envelope = reply as? [String: Any] ?? [:]
        XCTAssertEqual(envelope["ok"] as? Bool, true, "\(method) faulted: \(envelope)", file: file, line: line)
        return envelope["result"] as? [String: Any] ?? [:]
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    func testOnlyThePersonsOwnQuestionIsOneAndEveryReadSaysWhoStartedIt() async throws {
        let center = await harness()
        let (session, bridge, recorder) = make(harness: center)
        defer { session.teardown() }
        _ = await call(bridge, "session", ["page": "app"])

        // 1. They ask.
        let read = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        let id = try XCTUnwrap(read["requestId"] as? String)
        XCTAssertEqual(session.desk.readOrigin(requestId: id), .person)
        // 2. The chip: the question Bobby wrote for that read.
        let picked = await call(bridge, "ask", ["followUpOf": id, "question": Self.offered])
        XCTAssertEqual(session.desk.readOrigin(requestId: try XCTUnwrap(picked["requestId"] as? String)), .followUp)
        // 3. Their own words about the same read.
        let own = await call(bridge, "ask", ["followUpOf": id, "question": "And what does the volume say?"])
        XCTAssertEqual(session.desk.readOrigin(requestId: try XCTUnwrap(own["requestId"] as? String)), .thread)
        // 4. A read native starts on their tap (the button of a follow-up, a row of a board).
        XCTAssertTrue(session.startRead(symbol: "NVDA", name: "NVIDIA", isEquity: true, question: "What changed in NVDA since I asked?"))
        let token = try XCTUnwrap(recorder.last("ask.start")?["token"] as? String)
        let started = await call(bridge, "ask", ["token": token])
        XCTAssertEqual(started["status"] as? String, "ok")
        XCTAssertEqual(session.desk.readOrigin(requestId: try XCTUnwrap(started["requestId"] as? String)), .followUp)
        await settle()

        let asks = center.ledger.events(.ask)
        XCTAssertEqual(asks.map(\.origin), [nil, .followUp, nil, .followUp], "the person, Bobby's chip, the person again, Bobby's button")
        XCTAssertEqual(asks.map(\.thread), [nil, nil, true, nil], "the second question of their own is marked as one")
        XCTAssertEqual(asks.filter(\.isQuestion).count, 2)
        XCTAssertEqual(center.ledger.question(before: Date())?.at, asks[2].at, "follow-ups belong to the last thing they asked themselves")
        XCTAssertTrue(asks.allSatisfy { $0.horizon == nil }, "the fixture desk names a horizon the server does not have: it is not kept")
        XCTAssertEqual(center.upcoming.map(\.step).first, .asset)
        XCTAssertEqual(center.upcoming.first?.symbol, "NVDA")
        XCTAssertNil(session.desk.readOrigin(requestId: "00000000-0000-4000-8000-000000000000"), "a read the desk does not hold has none")
        let stored = String(decoding: try JSONEncoder().encode(center.ledger.events), as: UTF8.self)
        XCTAssertFalse(stored.contains("volume"), "no question text in the ledger")
        XCTAssertFalse(stored.contains("change"))
    }

    func testAReadThatIsCarriedOnKeepsWhoStartedIt() async throws {
        let center = await harness()
        let (session, bridge, recorder) = make(harness: center)
        defer { session.teardown() }
        _ = await call(bridge, "session", ["page": "app"])
        // A read Bobby started fails once, and the person taps "Try again".
        NucleoFixtures.setScenario("failed")
        XCTAssertTrue(session.startRead(symbol: "NVDA", name: "NVIDIA", isEquity: true, question: "What changed in NVDA since I asked?"))
        let token = try XCTUnwrap(recorder.last("ask.start")?["token"] as? String)
        let failed = await call(bridge, "ask", ["token": token])
        XCTAssertNotEqual(failed["status"] as? String, "ok")
        await settle()
        XCTAssertTrue(center.ledger.events(.ask).isEmpty, "a read that failed is not written")
        let again = try XCTUnwrap((failed["retry"] ?? failed["token"]) as? String, "a failed read offers the same read again: \(failed)")
        NucleoFixtures.setScenario("levels")
        let read = await call(bridge, "ask", ["token": again])
        XCTAssertEqual(read["status"] as? String, "ok")
        await settle()
        XCTAssertEqual(center.ledger.events(.ask).map(\.origin), [.followUp], "tried again, it is still Bobby's question")
        XCTAssertNil(center.ledger.question(before: Date()))
        XCTAssertEqual(center.upcoming, [])
        // The person's own question, failed and tried again, is still theirs.
        NucleoFixtures.setScenario("failed")
        let own = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        NucleoFixtures.setScenario("levels")
        let retried = await call(bridge, "ask", ["token": try XCTUnwrap((own["retry"] ?? own["token"]) as? String)])
        XCTAssertEqual(retried["status"] as? String, "ok")
        await settle()
        XCTAssertEqual(center.ledger.events(.ask).map(\.origin), [.followUp, nil])
        XCTAssertEqual(center.upcoming.first?.step, .asset)
    }

    func testTheHorizonTheQuestionNamedRidesTheReplyIntoTheLedger() async {
        let center = await harness()
        let (session, _, _) = make(harness: center)
        defer { session.teardown() }
        func delivered(_ symbol: String, _ sufficiency: Any?) {
            var result: [String: Any] = ["v": 1, "status": "ok", "requestId": UUID().uuidString.lowercased(),
                                         "asset": ["symbol": symbol, "name": symbol, "isEquity": true], "agents": ["verdict": "wait"]]
            if let sufficiency { result["sufficiency"] = sufficiency }
            session.desk.askFinished(result)
        }
        delivered("NVDA", ["horizon": "month", "missing": [], "sufficient": true])
        delivered("TSLA", ["horizon": "long", "missing": ["1W"], "sufficient": false])
        delivered("AAPL", ["horizon": "unspecified", "missing": [], "sufficient": true])
        delivered("AMD", ["horizon": "the week after next", "missing": [], "sufficient": true])
        delivered("BTC", ["horizon": NSNull()])
        delivered("SOL", nil)
        await settle()
        XCTAssertEqual(center.ledger.events(.ask).map(\.symbol), ["NVDA", "TSLA", "AAPL", "AMD", "BTC", "SOL"])
        XCTAssertEqual(center.ledger.events(.ask).map(\.horizon), [.month, .long, .unspecified, nil, nil, nil],
                       "one of the server's five values, or nothing")
        // A read that failed, or was refused, is not a question.
        session.desk.askFinished(["v": 1, "status": "error", "code": "network"])
        session.desk.askFinished(NucleoDesk.cancelledResult)
        XCTAssertEqual(center.ledger.events(.ask).count, 6)
    }

    func testTheReviewChosenOnTheSaveIsWhatThePersonChoseAndNothingElse() {
        func saved(_ hours: Any?) -> [String: Any] { ["status": "saved", "thesis": ["symbol": "NVDA", "horizonHours": hours ?? NSNull()]] }
        XCTAssertEqual(NucleoSession.chosenHorizon(saved: saved(168), asked: 168), 168)
        XCTAssertEqual(NucleoSession.chosenHorizon(saved: saved(72), asked: 72), 72)
        XCTAssertEqual(NucleoSession.chosenHorizon(saved: saved(24), asked: 24), 24)
        XCTAssertNil(NucleoSession.chosenHorizon(saved: saved(24), asked: nil), "signed out there is no choice: the desk's own 24 hours says nothing")
        XCTAssertNil(NucleoSession.chosenHorizon(saved: saved(nil), asked: 168), "a read Bobby said to wait on has no review")
        XCTAssertNil(NucleoSession.chosenHorizon(saved: ["status": "stale"], asked: 72))
    }

    func testASaveReachesTheLedgerAndAWaitHasNoReviewHorizon() async throws {
        let center = await harness()
        let (session, bridge, _) = make(harness: center)
        defer { session.teardown() }
        _ = await call(bridge, "session", ["page": "app"])
        let read = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        let id = try XCTUnwrap(read["requestId"] as? String)
        XCTAssertEqual((read["agents"] as? [String: Any])?["verdict"] as? String, "wait", "the recorded desk said to wait")
        await settle()
        XCTAssertEqual(center.upcoming.first?.days, 1)

        let result = await call(bridge, "saveThesis", ["requestId": id, "horizonHours": 168])
        XCTAssertEqual(result["status"] as? String, "saved")
        await settle()
        XCTAssertEqual(center.ledger.events(.saved).map(\.symbol), ["NVDA"])
        XCTAssertEqual(center.ledger.events(.saved).map(\.horizonHours), [nil], "whatever the page sent")
        XCTAssertEqual(center.upcoming.first?.days, 1, "so the follow-up stays where it was")
    }
}
