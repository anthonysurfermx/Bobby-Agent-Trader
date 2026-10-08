import Foundation
import XCTest
@testable import Bobby

/// The next question (Nucleo/ARCHITECTURE.md §3.5). Native carries the question the desk's CIO wrote to the
/// page, additively, and tells the harness when the person picks it; whether it is shown is the page's
/// decision (tests/next-question.test.mjs), and its words are kept nowhere.
@MainActor
final class NextQuestionTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        func emit(_ name: String, _ payload: [String: Any]) {}
        func pageReady() {}
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
        suiteName = "next.question.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        // The fixture desk answers a premium level with a synthesis (and its next question).
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

    // MARK: What travels

    private func debate(synthesis: [String: Any]?) -> NucleoDeskIO.Debate? {
        var agents: [String: Any] = ["alpha": "Alpha says", "red": "Red says", "cio": "CIO says", "verdict": "wait", "direction": "none"]
        if let synthesis { agents["synthesis"] = synthesis }
        let body: [String: Any] = ["symbol": "NVDA", "technicals": ["price": 120.5], "provenance": ["provider": "Yahoo Finance"], "agents": agents]
        if case let .ok(debate) = NucleoDeskIO.parseDebate(status: 200, json: body, headers: [:]) { return debate }
        return nil
    }

    func testTheNextQuestionTravelsAsWrittenAndAReplyWithoutItIsWhatItWas() throws {
        let plain = try XCTUnwrap(debate(synthesis: ["headline": "Mixed evidence.", "why": "w", "risk": "r", "watch": "x"])?.synthesis)
        XCTAssertNil(plain.followUp)
        XCTAssertEqual(Set(plain.json.keys), ["headline", "why", "risk", "watch"], "no new key for a server that sent none")

        let asked = try XCTUnwrap(debate(synthesis: ["headline": "Mixed evidence.", "followUp": "  \(Self.offered)\n"])?.synthesis)
        XCTAssertEqual(asked.followUp, Self.offered, "trimmed, otherwise as the desk wrote it")
        XCTAssertEqual(asked.json["followUp"] as? String, Self.offered)
        XCTAssertEqual(Set(asked.json.keys), ["headline", "why", "risk", "watch", "followUp"])
    }

    func testAQuestionNativeCannotCarryIsDroppedWholeNeverCut() throws {
        let atLimit = "Why " + String(repeating: "x", count: NucleoDeskIO.nextQuestionLimit - 5) + "?"
        XCTAssertEqual(atLimit.count, NucleoDeskIO.nextQuestionLimit)
        XCTAssertEqual(NucleoDeskIO.nextQuestion(atLimit), atLimit)
        for bad in [atLimit + "?", "", "   ", 7, NSNull(), ["a"], ["text": Self.offered]] as [Any] {
            XCTAssertNil(NucleoDeskIO.nextQuestion(bad), "\(bad)")
            let synthesis = try XCTUnwrap(debate(synthesis: ["headline": "Mixed evidence.", "followUp": bad])?.synthesis)
            XCTAssertNil(synthesis.followUp)
            XCTAssertNil(synthesis.json["followUp"], "the read is served; only the chip is lost")
        }
        // No synthesis, no question: the key has nowhere to ride.
        XCTAssertNil(debate(synthesis: ["followUp": Self.offered])?.synthesis)
        XCTAssertNil(debate(synthesis: nil)?.synthesis)
    }

    func testTheSameQuestionIsToldApartByItsWordsNotItsSpaces() {
        XCTAssertTrue(NucleoDeskIO.sameQuestion(Self.offered, "  What would  have to change in\u{202F}NVDA for this read\nto change? "))
        XCTAssertTrue(NucleoDeskIO.sameQuestion("Pourquoi NVDA monte ?", "Pourquoi NVDA monte\u{202F}?"))
        XCTAssertFalse(NucleoDeskIO.sameQuestion(Self.offered, "What would have to change in AMD for this read to change?"))
        XCTAssertFalse(NucleoDeskIO.sameQuestion(Self.offered, Self.offered.lowercased()))
        XCTAssertFalse(NucleoDeskIO.sameQuestion(Self.offered, ""))
    }

    func testQuickAccessTellsThePersonsOwnAssetsFromTheStartersThatPadTheRow() {
        let memory = DeskMemory(defaults: defaults)
        XCTAssertEqual(NucleoSession.quickAccess(memory, fallback: ["BTC", "NVDA"]).map { $0["own"] as? Bool }, [false, false], "no history yet: every entry is a starter")
        memory.recordQuery(symbol: "sol", isEquity: false)
        let row = NucleoSession.quickAccess(memory, fallback: ["BTC", "NVDA", "SOL"])
        XCTAssertEqual(row.map { $0["symbol"] as? String }, ["SOL", "BTC", "NVDA"])
        XCTAssertEqual(row.map { $0["own"] as? Bool }, [true, false, false])
        XCTAssertTrue(row.allSatisfy { Set($0.keys) == ["symbol", "own"] })
    }

    // MARK: The tap

    private func harness() -> HarnessCenter {
        let center = HarnessCenter(notifier: FakeHarnessNotifier(), defaults: defaults)
        center.consent = { .accepted }
        center.currentUser = { nil }
        center.weeklyCovered = { false }
        center.quote = { _ in nil }
        return center
    }

    private func make(harness: HarnessCenter?) -> (NucleoSession, NucleoBridge) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: BriefingIntent(observeAccount: false), reminderIntent: ReminderIntent(observeAccount: false),
                                    harnessIntent: HarnessIntent(observeAccount: false), harness: harness)
        session.desk.currentLevel = { .profundo }
        session.desk.setLevel = { _ in }
        session.desk.meterChanged = { _, _ in }
        session.desk.clock = NucleoDesk.Clock(now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                                              receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        session.desk.generation = { [unowned self] in self.generation }
        session.desk.recordQuery = { _, _ in }
        session.emitter = Recorder()
        return (session, NucleoBridge(session: session))
    }

    private func ask(_ bridge: NucleoBridge, _ params: [String: Any], file: StaticString = #filePath, line: UInt = #line) async -> [String: Any] {
        let (reply, error) = await bridge.handle(body: ["v": 1, "method": "ask", "params": params], trusted: true)
        XCTAssertNil(error, file: file, line: line)
        let envelope = reply as? [String: Any] ?? [:]
        XCTAssertEqual(envelope["ok"] as? Bool, true, "ask faulted: \(envelope)", file: file, line: line)
        return envelope["result"] as? [String: Any] ?? [:]
    }

    func testPickingTheQuestionBobbyWroteIsCountedForItsAssetAndTypingAnotherIsNot() async throws {
        let center = harness()
        // A pick is written only once the person said yes to follow-ups.
        _ = await center.accept()
        let (session, bridge) = make(harness: center)
        defer { session.teardown() }

        let read = await ask(bridge, ["question": "Should I buy NVIDIA right now?"])
        XCTAssertEqual(read["status"] as? String, "ok")
        let id = try XCTUnwrap(read["requestId"] as? String)
        XCTAssertEqual((read["synthesis"] as? [String: Any])?["followUp"] as? String, Self.offered, "the page receives the question with the read")
        XCTAssertEqual(center.ledger.events(.ask).map(\.symbol), ["NVDA"])
        XCTAssertTrue(center.ledger.events(.picked).isEmpty)

        // Their own words about the same read: an ordinary follow-up, nothing picked.
        let own = await ask(bridge, ["followUpOf": id, "question": "And what does the volume say?"])
        XCTAssertEqual(own["status"] as? String, "ok")
        XCTAssertEqual((own["asset"] as? [String: Any])?["symbol"] as? String, "NVDA")
        XCTAssertTrue(center.ledger.events(.picked).isEmpty)

        // The chip: the same words (the page collapses white space), about the same read.
        let picked = await ask(bridge, ["followUpOf": id, "question": " What would have to  change in NVDA for this read to change? "])
        XCTAssertEqual(picked["status"] as? String, "ok")
        XCTAssertEqual((picked["asset"] as? [String: Any])?["symbol"] as? String, "NVDA", "asked about the same asset, which the page never named")
        XCTAssertEqual(picked["question"] as? String, "What would have to  change in NVDA for this read to change?",
                       "asked as the person's own question, as the page sent it")
        let events = center.ledger.events(.picked)
        XCTAssertEqual(events.map(\.symbol), ["NVDA"])
        XCTAssertNil(events.first?.name, "an asset and a moment: the question's words are kept nowhere")
        let stored = String(decoding: try JSONEncoder().encode(center.ledger.events), as: UTF8.self)
        XCTAssertFalse(stored.contains("change"), "no question text in the ledger")
    }

    func testThePickIsNotRecordedWhenTheHarnessMayNotRecord() async throws {
        // Follow-ups turned off: nothing is kept.
        let off = harness()
        await off.turnOff()
        let (session, bridge) = make(harness: off)
        defer { session.teardown() }
        let read = await ask(bridge, ["question": "Should I buy NVIDIA right now?"])
        let id = try XCTUnwrap(read["requestId"] as? String)
        let picked = await ask(bridge, ["followUpOf": id, "question": Self.offered])
        XCTAssertEqual(picked["status"] as? String, "ok", "the read itself is served as always")
        XCTAssertTrue(off.ledger.isEmpty)

        // Undecided: the question they asked is kept, and neither the pick nor the read it started.
        let undecided = harness()
        let (waiting, waitingBridge) = make(harness: undecided)
        defer { waiting.teardown() }
        let asked = await ask(waitingBridge, ["question": "Should I buy NVIDIA right now?"])
        _ = await ask(waitingBridge, ["followUpOf": try XCTUnwrap(asked["requestId"] as? String), "question": Self.offered])
        XCTAssertEqual(undecided.ledger.events.map(\.kind), [.ask], "one entry: their own question")
        XCTAssertNil(undecided.ledger.events.first?.origin)

        // No harness at all (fixture mode, the unit-test host): the tap is an ordinary read.
        let (plain, plainBridge) = make(harness: nil)
        defer { plain.teardown() }
        XCTAssertNil(plain.harness)
        let first = await ask(plainBridge, ["question": "Should I buy NVIDIA right now?"])
        let again = await ask(plainBridge, ["followUpOf": try XCTUnwrap(first["requestId"] as? String), "question": Self.offered])
        XCTAssertEqual(again["status"] as? String, "ok")
    }

    func testAWithheldQuestionNeverReachesThePageAndCannotBePicked() async throws {
        var receipts = 0
        var pickedSymbols: [String] = []
        let (session, bridge) = make(harness: nil)
        defer { session.teardown() }
        session.desk.offersNextQuestion = { _ in receipts += 1; return false }
        session.desk.nextQuestionPicked = { pickedSymbols.append($0) }
        let read = await ask(bridge, ["question": "Should I buy NVIDIA right now?"])
        let synthesis = try XCTUnwrap(read["synthesis"] as? [String: Any])
        XCTAssertNotNil(synthesis["headline"], "the read is whole")
        XCTAssertNil(synthesis["followUp"], "the page gets no question: it shows its fixed chips")
        XCTAssertEqual(receipts, 1, "asked once per read, with that read's access receipt")
        _ = await ask(bridge, ["followUpOf": try XCTUnwrap(read["requestId"] as? String), "question": Self.offered])
        XCTAssertTrue(pickedSymbols.isEmpty, "what was not offered cannot be picked, even typed word for word")
    }

    func testAQuickReadFromAServerWithoutTheFieldIsServedAsBefore() async throws {
        NucleoFixtures.setScenario("default")
        var pickedSymbols: [String] = []
        let (session, bridge) = make(harness: nil)
        defer { session.teardown() }
        session.desk.currentLevel = { .rapido }
        session.desk.nextQuestionPicked = { pickedSymbols.append($0) }
        let read = await ask(bridge, ["question": "Should I buy NVIDIA right now?"])
        XCTAssertEqual(read["status"] as? String, "ok")
        XCTAssertNil(read["synthesis"], "the recorded desk reply has no synthesis: nothing is added to it")
        _ = await ask(bridge, ["followUpOf": try XCTUnwrap(read["requestId"] as? String), "question": Self.offered])
        XCTAssertTrue(pickedSymbols.isEmpty, "a read that offered no question has none to pick")
    }
}
