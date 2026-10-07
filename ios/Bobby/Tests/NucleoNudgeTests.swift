import Foundation
import XCTest
@testable import Bobby

/// The nudge (1.8): one native-written line and one button on the glass. These pin the etiquette:
/// one at a time, twice then a week's rest, gone once acted on, nothing before consent, nothing
/// under a sheet, and the page can only report and forward.
@MainActor
final class NucleoNudgeTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var saved: [String: Any] = [:]
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "nucleo.nudge.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        clock = Date(timeIntervalSince1970: 1_800_000_000)
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        NudgeCenter.shared.unregisterAll()
        NudgeCenter.shared.reset()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        NudgeCenter.shared.unregisterAll()
        NudgeCenter.shared.reset()
        NudgeCenter.shared.now = { Date() }
        for key in Self.profileKeys {
            if let v = saved[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func center() -> NudgeCenter {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        return center
    }

    private func source(_ key: String, priority: Int, id: String? = nil, text: String = "A line", cta: String = "Do it",
                        when: @escaping (NudgeMoment) -> Bool = { _ in true },
                        act: @escaping (NucleoNudge, NucleoSession) async -> Void = { _, _ in }) -> NudgeSource {
        NudgeSource(key: key, priority: priority,
                    candidate: { when($0) ? NucleoNudge(id: id ?? "\(key).one", text: text, cta: cta) : nil }, act: act)
    }

    private func moment(_ center: NudgeCenter, signedIn: Bool = false) -> NudgeMoment { center.moment(signedIn: signedIn) }

    // MARK: Choosing

    func testTheHighestPriorityEligibleSourceSpeaksAlone() {
        let center = center()
        center.register(source("credits", priority: 40))
        center.register(source("invite", priority: 90))
        center.register(source("memory", priority: 60, when: { _ in false }))
        XCTAssertEqual(center.sourceKeys, ["invite", "memory", "credits"])
        XCTAssertEqual(center.current(moment(center))?.id, "invite.one")
        center.retire("invite.one")
        XCTAssertEqual(center.current(moment(center))?.id, "credits.one", "a silent source never blocks the next one")
    }

    func testRegisteringAKeyAgainReplacesItsSource() {
        let center = center()
        center.register(source("credits", priority: 40, id: "credits.old"))
        center.register(source("credits", priority: 40, id: "credits.new"))
        XCTAssertEqual(center.sourceKeys, ["credits"])
        XCTAssertEqual(center.current(moment(center))?.id, "credits.new")
    }

    func testAnIdThePageCouldNotSendBackOrAnEmptyButtonIsNeverServed() {
        let center = center()
        center.register(source("a", priority: 3, id: "Bad Id"))
        center.register(source("b", priority: 2, id: "b.ok", cta: ""))
        center.register(source("c", priority: 1, id: "c.fine"))
        XCTAssertEqual(center.current(moment(center))?.id, "c.fine")
    }

    // MARK: Etiquette

    func testTwoShowingsThenAWeekOfRestThenOneMoreRoundThenNeverAgain() {
        let center = center()
        center.register(source("memory", priority: 60))
        let id = "memory.one"
        XCTAssertEqual(center.seen(id), 1)
        clock.addTimeInterval(60)
        XCTAssertEqual(center.seen(id), 1, "a redraw a minute later is the same showing")
        XCTAssertNotNil(center.current(moment(center)))
        clock.addTimeInterval(3_600)
        XCTAssertEqual(center.seen(id), 2)
        XCTAssertNil(center.current(moment(center)), "after two unanswered showings it rests")
        clock.addTimeInterval(6 * 86_400)
        XCTAssertNil(center.current(moment(center)), "six days is still rest")
        clock.addTimeInterval(86_400 + 60)
        XCTAssertNotNil(center.current(moment(center)), "a week later it may return")
        XCTAssertEqual(center.seen(id), 3)
        clock.addTimeInterval(3_600)
        XCTAssertEqual(center.seen(id), 4)
        clock.addTimeInterval(30 * 86_400)
        XCTAssertNil(center.current(moment(center)), "four showings ever: it never returns")
        XCTAssertFalse(center.eligible(id, at: clock))
    }

    func testEtiquetteSurvivesARelaunch() {
        let first = center()
        first.register(source("memory", priority: 60))
        first.seen("memory.one")
        clock.addTimeInterval(3_600)
        first.seen("memory.one")
        let relaunched = center()
        relaunched.register(source("memory", priority: 60))
        XCTAssertEqual(relaunched.showings("memory.one"), 2)
        XCTAssertNil(relaunched.current(moment(relaunched)))
    }

    func testATapRetiresTheNudgeRunsItsSourceOnceAndQuietsTheGlass() async {
        let center = center()
        var acted: [String] = []
        center.register(source("theses", priority: 70, act: { nudge, _ in acted.append(nudge.id) }))
        center.register(source("credits", priority: 40))
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        XCTAssertEqual(center.current(moment(center))?.id, "theses.one")
        let done = await center.act("theses.one", session: session)
        XCTAssertEqual(done, "done")
        XCTAssertEqual(acted, ["theses.one"])
        XCTAssertTrue(center.isRetired("theses.one"))
        let again = await center.act("theses.one", session: session)
        XCTAssertEqual(again, "gone")
        XCTAssertEqual(acted, ["theses.one"], "a second tap never runs the action twice")
        XCTAssertNil(center.current(moment(center)), "nothing else speaks right after a tap")
        clock.addTimeInterval(16 * 60)
        XCTAssertEqual(center.current(moment(center))?.id, "credits.one", "the next source may speak after the quiet period")
    }

    func testAnUnknownIdIsGoneAndRunsNothing() async {
        let center = center()
        var acted = 0
        center.register(source("credits", priority: 40, act: { _, _ in acted += 1 }))
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let status = await center.act("credits.one", session: session)
        XCTAssertEqual(status, "gone", "an id the centre never handed out cannot trigger a source")
        XCTAssertEqual(acted, 0)
    }

    // MARK: The moment

    func testSourcesSeeTheLastReadAndTheSaveButNeverAQuestion() {
        let center = center()
        var seenMoment: NudgeMoment?
        center.register(source("theses", priority: 70, when: { seenMoment = $0; return $0.lastRead?.saved == true }))
        XCTAssertNil(center.current(moment(center)))
        center.noteRead(NudgeRead(requestId: "r1", symbol: "NVDA", name: "NVIDIA", isEquity: true, verdict: "wait", saved: false, at: clock))
        XCTAssertNil(center.current(moment(center)))
        XCTAssertEqual(seenMoment?.readsThisLaunch, 1)
        center.noteSaved(requestId: "other")
        XCTAssertNil(center.current(moment(center)), "another read's save does not mark this one")
        center.noteSaved(requestId: "r1")
        XCTAssertEqual(center.current(moment(center))?.id, "theses.one")
        center.forgetMoment()
        XCTAssertNil(center.current(moment(center)), "a new account starts with no read to talk about")
        XCTAssertEqual(center.readsThisLaunch, 0)
    }

    // MARK: The session and the bridge

    private func makeSession(riskAccepted: Bool = true) -> (NucleoSession, NucleoBridge, Recorder) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = riskAccepted ? RiskNotice.currentVersion : 0
        profile.onboarded = true
        let companions = CompanionStore(defaults: defaults)
        companions.companionId = "orb"
        let session = NucleoSession(fixtures: true, profile: profile, companions: companions,
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults)
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder)
    }

    private func result(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any] = [:]) async -> [String: Any] {
        let (reply, _) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        let r = reply as? [String: Any] ?? [:]
        XCTAssertEqual(r["ok"] as? Bool, true, "\(method) faulted: \(r)")
        return r["result"] as? [String: Any] ?? [:]
    }

    private func faultCode(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any]) async -> String? {
        let (reply, _) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        return ((reply as? [String: Any])?["error"] as? [String: Any])?["code"] as? String
    }

    func testTheSessionCarriesTheNudgeOnlyOnTheAppPageAfterConsentAndNeverUnderASheet() async {
        NudgeCenter.shared.now = { [unowned self] in self.clock }
        NudgeCenter.shared.register(source("credits", priority: 40, text: "2 reads left this week", cta: "See credits"))
        let (session, bridge, _) = makeSession()
        defer { session.teardown() }
        XCTAssertTrue(session.sessionJSON()["nudge"] is NSNull, "fixture mode shows no nudge unless a test turns them on")
        session.nudgesEnabled = true
        XCTAssertTrue(session.sessionJSON()["nudge"] is NSNull, "no page has asked for the session yet")
        _ = await result(bridge, "session", ["page": "onboarding"])
        XCTAssertTrue(session.sessionJSON()["nudge"] is NSNull, "onboarding never shows a nudge")
        let json = await result(bridge, "session", ["page": "app"])
        XCTAssertEqual(json["nudge"] as? [String: String], ["id": "credits.one", "text": "2 reads left this week", "cta": "See credits"])
        XCTAssertTrue(session.openNative(.account))
        XCTAssertTrue(session.sessionJSON()["nudge"] is NSNull, "nothing speaks under a sheet")
        session.sheetDismissed()
        XCTAssertNotNil(session.sessionJSON()["nudge"] as? [String: String])
        session.revokeRiskNoticeConsent()
        XCTAssertTrue(session.sessionJSON()["nudge"] is NSNull, "nothing speaks without consent")
    }

    func testThePageReportsAndForwardsThroughTheBridgeAndCannotInventATap() async {
        NudgeCenter.shared.now = { [unowned self] in self.clock }
        var acted: [String] = []
        NudgeCenter.shared.register(source("credits", priority: 40, act: { nudge, session in
            acted.append(nudge.id)
            session.present(.credits)
        }))
        let (session, bridge, recorder) = makeSession()
        defer { session.teardown() }
        session.nudgesEnabled = true
        _ = await result(bridge, "session", ["page": "app"])
        let seen = await result(bridge, "nudge.seen", ["id": "credits.one"])
        XCTAssertEqual(seen["count"] as? Int, 1)
        let invented = await result(bridge, "nudge.act", ["id": "theses.never-served"])
        XCTAssertEqual(invented["status"] as? String, "gone")
        XCTAssertTrue(acted.isEmpty)
        let malformed = await faultCode(bridge, "nudge.act", ["id": "Not An Id"])
        XCTAssertEqual(malformed, "invalid_params")
        let missing = await faultCode(bridge, "nudge.seen", [:])
        XCTAssertEqual(missing, "invalid_params")
        let tapped = await result(bridge, "nudge.act", ["id": "credits.one"])
        XCTAssertEqual(tapped["status"] as? String, "done")
        XCTAssertEqual(acted, ["credits.one"])
        XCTAssertEqual(session.sheet, .credits, "the source opened its screen through the session")
        let last = recorder.events.last { $0.name == "session.changed" }
        XCTAssertTrue(last?.payload["nudge"] is NSNull, "the page is told the nudge is gone")
        XCTAssertFalse(NucleoRoute.openable.contains("credits"), "the page cannot open a 1.8 screen by itself")
        for route in ["theses", "memory", "reminders", "invite", "paywall", "briefing"] {
            XCTAssertFalse(NucleoRoute.openable.contains(route), route)
        }
    }

    func testNothingIsForwardedBeforeConsent() async {
        NudgeCenter.shared.now = { [unowned self] in self.clock }
        var acted = 0
        NudgeCenter.shared.register(source("credits", priority: 40, act: { _, _ in acted += 1 }))
        let (session, bridge, _) = makeSession(riskAccepted: false)
        defer { session.teardown() }
        session.nudgesEnabled = true
        _ = await result(bridge, "session", ["page": "app"])
        XCTAssertTrue(session.sessionJSON()["nudge"] is NSNull)
        let status = await result(bridge, "nudge.act", ["id": "credits.one"])
        XCTAssertEqual(status["status"] as? String, "gone")
        XCTAssertEqual(acted, 0)
    }

    func testTheFiveFeatureSourcesRegisterThroughOneEntryPoint() {
        let center = center()
        V18.registerNudges(center: center)
        // Placeholders register nothing; a landed feature registers exactly its own key.
        XCTAssertTrue(Set(center.sourceKeys).isSubset(of: ["invite", "memory", "theses", "reminders", "credits"]))
        XCTAssertEqual(Set([NudgePriority.invite, NudgePriority.theses, NudgePriority.memory, NudgePriority.reminders, NudgePriority.credits]).count, 5,
                       "two features never share a priority")
    }
}
