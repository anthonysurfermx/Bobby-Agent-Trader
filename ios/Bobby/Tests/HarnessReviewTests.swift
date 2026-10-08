import Foundation
import UserNotifications
import XCTest
@testable import Bobby

/// The harness (1.8): what the two adversarial reviews of slice 1 found on Android that the iPhone
/// shares, each as the case that shows it. The Android cases are `HarnessReviewTest.kt`, and the
/// names say the same rule on both phones.
///
///  - Bobby never leads into a wall: a chip runs at the level the person saved, so that level's own
///    meter is asked too.
///  - A no stays a no between the signed-out phone and an account, in both directions; a later yes
///    in the account lifts the phone's no.
///  - A yes that was erased is asked for again.
///  - "Forget" on an asset in Memory also erases its follow-up notes and the follow-up that was coming.
///  - A day is promised only when the phone will show the follow-up, and only what the phone can
///    take for shown is written as shown.
///  - What was kept signed out before any yes starts no chain in an account that had already said yes.
///  - A byte-order mark in a question is white space when native compares the tapped words.
///  - Signed out, the Memory screen is one sentence and one row; the count of follow-ups reads right for one.
@MainActor
final class HarnessReviewTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func named(_ name: String) -> [[String: Any]] { events.filter { $0.name == name }.map(\.payload) }
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private static let offered = "What would have to change in NVDA for this read to change?"

    private var previousLanguage = "system"
    private var savedProfile: [String: Any] = [:]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var fake: FakeHarnessNotifier!
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City")!
        return c
    }()
    private var clock = Date()
    private var consent: ReminderConsent = .accepted
    private var user: String?
    private var generation = UUID()
    private var reads: BobbyReadAccess?
    private var levelLoader: ((BobbyMeterAuth) async throws -> [String: Any]?)?

    override func setUp() async throws {
        try await super.setUp()
        previousLanguage = L.selection
        L.select("en")
        suiteName = "harness.review.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        savedProfile = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { savedProfile[key] = v } }
        fake = FakeHarnessNotifier()
        clock = at(7, 16, 40)
        consent = .accepted
        user = nil
        generation = UUID()
        reads = Self.free(left: 5)
        NucleoFixtures.activate(scenario: "levels", timeScale: 0.01)
        NucleoFixtures.clearLog()
        // What the phone hears about the levels is what a case says (`heardLevels`): a session that
        // starts asks for the balance by itself, and here nobody answers.
        levelLoader = NucleoLevelCenter.shared.load
        NucleoLevelCenter.shared.load = { _ in nil }
        NucleoLevelCenter.shared.accountChanged(force: true)
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        // What a case told the app about the levels' allowances does not outlive it.
        NucleoLevelCenter.shared.accountChanged(force: true)
        if let levelLoader { NucleoLevelCenter.shared.load = levelLoader }
        for key in Self.profileKeys {
            if let v = savedProfile[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        L.select(previousLanguage)
        try await super.tearDown()
    }

    // MARK: Scaffolding

    /// October 2026, local time in Mexico City. The 7th is a Wednesday, the 10th a Saturday.
    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    private static func free(left: Int) -> BobbyReadAccess {
        BobbyReadAccess(tier: "free", used: 20 - left, limit: 20, remaining: left, resetsAt: nil, paywall: true)
    }

    private static let pro = BobbyReadAccess(tier: "pro", used: 40, limit: nil, remaining: nil, resetsAt: nil, paywall: false)
    private static let languages = ["en", "es", "fr", "pt", "it", "de"]

    private func make() -> HarnessCenter {
        let center = HarnessCenter(notifier: fake, defaults: defaults)
        center.now = { [unowned self] in self.clock }
        center.calendar = { [unowned self] in self.calendar }
        center.consent = { [unowned self] in self.consent }
        center.currentUser = { [unowned self] in self.user }
        center.currentGeneration = { [unowned self] in self.generation }
        center.weeklyCovered = { false }
        center.quote = { _ in nil }
        center.access = { [unowned self] in self.reads }
        center.refreshAccess = {}
        center.load(owner: user)
        return center
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    private func ask(_ center: HarnessCenter, _ symbol: String) async {
        center.noteAsk(symbol: symbol, name: symbol, isEquity: true, price: 100)
        await settle()
    }

    private func sent(_ center: HarnessCenter) -> [HarnessEvent] { center.ledger.events(.sent) }
    private func said(_ center: HarnessCenter) -> [String] { center.notes.assets.flatMap(\.lines) + center.notes.general }
    private func storedMode(_ owner: String?) -> String? { defaults.string(forKey: HarnessStore.key(HarnessStore.modePrefix, owner: owner)) }
    private func switchTo(_ next: String?) {
        user = next
        generation = UUID()
    }

    private func memory() -> MemoryCenter {
        let memory = MemoryCenter(observeAccount: false, defaults: defaults)
        memory.currentUser = { [unowned self] in self.user }
        memory.currentGeneration = { [unowned self] in self.generation }
        memory.riskAccepted = { true }
        memory.now = { [unowned self] in self.clock }
        memory.send = { _, _, _ in (json: ["enabled": true, "prefs": [String: Any](), "assets": [Any](), "retentionDays": 90], status: 200) }
        memory.accountChanged(force: true)
        return memory
    }

    private func makeSession(harness: HarnessCenter) -> (NucleoSession, NucleoBridge, Recorder) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: BriefingIntent(observeAccount: false), reminderIntent: ReminderIntent(observeAccount: false),
                                    harnessIntent: HarnessIntent(observeAccount: false), harness: harness)
        profile.onboarded = true
        session.companions.companionId = "orb"
        session.briefingSheetDelay = 0
        session.wakeTick = 0
        session.briefingGate = BriefingTapGate(appActive: { true }, signedIn: { false }, deskBusy: { false }, listening: { false }, narrating: { false })
        session.desk.meterChanged = { _, _ in }
        session.desk.clock = NucleoDesk.Clock(now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                                              receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        session.desk.generation = { [unowned self] in self.generation }
        session.desk.recordQuery = { _, _ in }
        session.desk.setLevel = { _ in }
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

    /// What `GET /api/bobby-access` says about a free account's levels: this many Deep reads left of six, and this many Max reads of two.
    private func heardLevels(deepLeft: Int = 6, maxLeft: Int, maxGifted: Int = 0) {
        NucleoLevelCenter.shared.apply([
            "access": Self.free(left: 15).json,
            "levels": ["tier": "free", "levels": [
                "profundo": ["used": 6 - deepLeft, "limit": 6, "remaining": deepLeft, "bonus": 0, "windowDays": 7],
                "maximo": ["used": 2 - maxLeft, "limit": 2, "remaining": maxLeft, "bonus": maxGifted, "windowDays": 7],
            ]],
        ])
    }

    // MARK: 1. Bobby never leads into a wall: the level a chip runs at

    /// A free account saved Max and used its Max reads. Its general meter still has reads, so the
    /// question Bobby's CIO wrote (it runs at Quick) would be answered; a chip would not: it runs at
    /// the level the person saved, and the server refuses that with the paywall behind it.
    func testAChipIsNotOfferedOnTheHomeOnceTheLevelItRunsAtIsUsedUp() async throws {
        reads = Self.free(left: 15)
        let center = make()
        let (session, bridge, _) = makeSession(harness: center)
        defer { session.teardown() }
        var saved = NucleoAnalysisLevel.rapido
        session.desk.currentLevel = { saved }
        _ = await call(bridge, "session", ["page": "app"])
        heardLevels(maxLeft: 0)
        XCTAssertNil(session.sessionJSON()["oneTap"], "at Quick the home keeps its chips")
        saved = .profundo
        XCTAssertNil(session.sessionJSON()["oneTap"], "and at Deep, which has reads left")
        saved = .maximo
        XCTAssertEqual(session.sessionJSON()["oneTap"] as? Bool, false, "a chip of the home would run at Max, and Max is used up")
        // They choose another level: the chips are back.
        saved = .rapido
        XCTAssertNil(session.sessionJSON()["oneTap"])
        // A gifted Max read, or the week turning over, opens it again.
        saved = .maximo
        heardLevels(maxLeft: 0, maxGifted: 1)
        XCTAssertNil(session.sessionJSON()["oneTap"])
        heardLevels(maxLeft: 1)
        XCTAssertNil(session.sessionJSON()["oneTap"])
        // Not knowing a level's count changes nothing on the home.
        NucleoLevelCenter.shared.accountChanged(force: true)
        XCTAssertNil(session.sessionJSON()["oneTap"])
        // Bobby Pro: a level that ran out is a notice with "Continue with Quick", not a sign-in or a paywall.
        heardLevels(maxLeft: 0)
        reads = Self.pro
        XCTAssertNil(session.sessionJSON()["oneTap"])
    }

    /// The read that spends the last one of a level: the phone has not heard the new balance when its row is drawn.
    func testTheLastReadOfALevelTakesTheChipsOffItsOwnRow() async throws {
        reads = Self.free(left: 15)
        let center = make()
        let (session, bridge, _) = makeSession(harness: center)
        defer { session.teardown() }
        session.desk.currentLevel = { .maximo }
        _ = await call(bridge, "session", ["page": "app"])
        heardLevels(maxLeft: 1)
        XCTAssertNil(session.sessionJSON()["oneTap"], "one Max read is left: the home keeps its chips")
        // They type their last Max question, and it is answered.
        XCTAssertFalse(session.offersOneTap(afterRead: Self.free(left: 14), at: .maximo), "a chip of its row would be one more Max read")
        XCTAssertEqual(session.sessionJSON()["oneTap"] as? Bool, false, "and so would a chip of the home")
        // The balance arrives and says the same.
        heardLevels(maxLeft: 0)
        XCTAssertEqual(session.sessionJSON()["oneTap"] as? Bool, false)
        // A gifted Max read, or the week turning over, opens it again; a read Bobby started (Quick) takes nothing from Max.
        heardLevels(maxLeft: 1)
        XCTAssertNil(session.sessionJSON()["oneTap"])
        XCTAssertTrue(session.offersOneTap(afterRead: Self.free(left: 13), at: .rapido))
        XCTAssertNil(session.sessionJSON()["oneTap"])
        // Not knowing a level's count is a no after a read and changes nothing on the home.
        NucleoLevelCenter.shared.accountChanged(force: true)
        reads = Self.free(left: 12)
        XCTAssertFalse(session.offersOneTap(afterRead: Self.free(left: 12), at: .rapido))
        XCTAssertNil(session.sessionJSON()["oneTap"])
        // Bobby Pro: a level that ran out is a notice with "Continue with Quick", not a sign-in or a paywall.
        heardLevels(maxLeft: 0)
        XCTAssertTrue(session.offersOneTap(afterRead: Self.pro, at: .maximo))
        reads = Self.pro
        XCTAssertNil(session.sessionJSON()["oneTap"])
    }

    /// The same through the real desk: a typed question at Deep, the last Deep read of the week.
    func testThroughTheDeskTheReadThatSpendsTheLastDeepHandsBackNoQuestionThatAsksByItself() async throws {
        reads = Self.free(left: 15)
        let center = make()
        let (session, bridge, _) = makeSession(harness: center)
        defer { session.teardown() }
        session.desk.currentLevel = { .profundo }
        var ran: [NucleoAnalysisLevel] = []
        session.desk.debateStarted = { ran.append($0) }
        // The app's own rule, with the receipt the server would have sent (a fixture reply carries none).
        session.desk.offersNextQuestion = { [unowned session] _, level in session.offersOneTap(afterRead: Self.free(left: 14), at: level) }
        heardLevels(deepLeft: 1, maxLeft: 2)
        _ = await call(bridge, "session", ["page": "app"])
        XCTAssertNil(session.sessionJSON()["oneTap"])
        let last = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        XCTAssertEqual(last["status"] as? String, "ok", "the read itself is delivered")
        XCTAssertEqual(ran, [.profundo])
        XCTAssertEqual(last["oneTap"] as? Bool, false, "its row offers no chip: one more Deep read is the wall")
        XCTAssertNil((last["synthesis"] as? [String: Any])?["followUp"], "one flag covers the row: Bobby's own question is withheld with the chips")
        XCTAssertEqual(session.sessionJSON()["oneTap"] as? Bool, false, "and the home offers none")
        // With Deep reads to spare the same read hands back its row as it always was.
        heardLevels(deepLeft: 3, maxLeft: 2)
        let open = await call(bridge, "ask", ["question": "Should I buy NVIDIA right now?"])
        XCTAssertEqual(open["status"] as? String, "ok")
        XCTAssertNil(open["oneTap"])
        XCTAssertEqual((open["synthesis"] as? [String: Any])?["followUp"] as? String, Self.offered)
        XCTAssertNil(session.sessionJSON()["oneTap"])
    }

    func testTheLevelsOwnAllowanceIsAskedOnlyWhereItIsAWall() throws {
        func meter(_ json: [String: Any]) throws -> NucleoLevelMeter { try XCTUnwrap(NucleoLevelMeter(json: json)) }
        let deep = try meter(["used": 5, "limit": 6, "remaining": 1, "bonus": 0, "windowDays": 7])
        let spentUp = try meter(["used": 6, "limit": 6, "remaining": 0, "bonus": 0, "windowDays": 7])
        let guest = BobbyReadAccess(tier: "anon", used: 2, limit: 6, remaining: 4, resetsAt: nil, paywall: true)
        XCTAssertEqual(HarnessWall.levelOpen(.rapido, access: Self.free(left: 0), meter: nil), true, "Quick is the receipt's own meter")
        XCTAssertEqual(HarnessWall.levelOpen(.profundo, access: Self.free(left: 5), meter: deep), true)
        XCTAssertEqual(HarnessWall.levelOpen(.profundo, access: Self.free(left: 5), meter: deep, spent: 1), false, "the read just answered took the last one")
        XCTAssertEqual(HarnessWall.levelOpen(.profundo, access: Self.free(left: 5), meter: spentUp), false)
        XCTAssertEqual(HarnessWall.levelOpen(.profundo, access: Self.free(left: 5),
                                             meter: try meter(["used": 6, "limit": 6, "remaining": 0, "bonus": 1, "windowDays": 7])), true, "a gifted read of that level")
        XCTAssertEqual(HarnessWall.levelOpen(.profundo, access: guest, meter: spentUp), false, "a guest's Deep allowance, with the sign-in behind it")
        XCTAssertEqual(HarnessWall.levelOpen(.maximo, access: Self.pro, meter: spentUp), true, "Bobby Pro meets a notice, not a wall")
        XCTAssertNil(HarnessWall.levelOpen(.maximo, access: Self.free(left: 5), meter: nil), "no count: the phone cannot tell")
        XCTAssertNil(HarnessWall.levelOpen(.maximo, access: Self.free(left: 5), meter: try meter(["windowDays": 7])), "a meter with no limit and nothing left to read says nothing")
        XCTAssertEqual(HarnessWall.levelOpen(.maximo, access: Self.free(left: 5), meter: try meter(["used": 2, "limit": 2])), false,
                       "by what was used, when that is what the server sent")
        XCTAssertNil(HarnessWall.levelOpen(.maximo, access: nil, meter: nil), "a receipt the phone does not have changes nothing about the level")
        XCTAssertEqual(HarnessWall.levelOpen(.maximo, access: nil, meter: spentUp), false)
        // Where the iPhone is not Android: it reads a count of used reads the server left out as none used
        // (NucleoLevelMeter, as the level sheet does), where Android keeps it unknown. The server always sends it.
        XCTAssertEqual(HarnessWall.levelOpen(.maximo, access: Self.free(left: 5), meter: try meter(["limit": 2])), true)
    }

    // MARK: 2. A no stays a no, signed in or out

    /// Monday: signed in with follow-ups on, they ask about NVDA and sign out. Signed out they ask
    /// about TSLA, say yes, and then press Stop on its follow-up. Then they sign in again.
    func testANoSaidSignedOutIsStillANoInAnAccountThatHadSaidYes() async throws {
        user = "u1"
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        switchTo(nil)
        await center.accountChanged()
        clock = at(8, 10)
        await ask(center, "TSLA")
        _ = await center.accept()
        let info = try XCTUnwrap(fake.requests["v18.follow.asset"]).request().content.userInfo
        await center.stop(try XCTUnwrap(HarnessTap.tap(from: info)))
        XCTAssertEqual(center.mode, .off)
        clock = at(9, 10)
        switchTo("u1")
        await center.accountChanged()
        XCTAssertEqual(center.mode, .off, "said after the account's yes, on this phone: it goes with them")
        XCTAssertEqual(storedMode("u1"), "off")
        XCTAssertTrue(center.ledger.isEmpty, "and off keeps nothing")
        XCTAssertTrue(HarnessStore(defaults: defaults).ledger(owner: "u1").isEmpty)
        XCTAssertEqual(fake.requests.count, 0, "the week with NVDA never arrives")
        XCTAssertEqual(center.upcoming, [])
    }

    func testANoSaidInAnAccountIsStillANoOnceSignedOut() async {
        user = "u1"
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        await center.turnOff()
        switchTo(nil)
        await center.accountChanged()
        XCTAssertEqual(center.mode, .off, "the same phone, signed out: the offer is not made again")
        XCTAssertEqual(storedMode(nil), "off")
        await ask(center, "NVDA")
        XCTAssertTrue(center.ledger.isEmpty)
    }

    /// The no crosses because it is the later word. A yes said after it, in the account, is later still.
    func testAYesSaidLaterInTheAccountIsNotUndoneByTheNoThePhoneKept() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        await center.turnOff()
        switchTo("u1")
        await center.accountChanged()
        XCTAssertEqual(center.mode, .off, "the no said signed out goes with them")
        XCTAssertEqual(storedMode(nil), "off", "and stays on the phone")
        // In the account they turn the switch on themselves.
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .on)
        XCTAssertNil(storedMode(nil), "their latest word on this phone is a yes: the phone's no is lifted")
        switchTo(nil)
        await center.accountChanged()
        XCTAssertEqual(center.mode, .undecided, "signed out they are undecided again, never on by themselves")
        switchTo("u1")
        await center.accountChanged()
        XCTAssertEqual(center.mode, .on, "and the account keeps the yes they said last")
        // An account that had said yes and signs out leaves the signed-out reader as it was.
        switchTo(nil)
        await center.accountChanged()
        XCTAssertNil(storedMode(nil))
    }

    // MARK: 3. A yes that was erased is asked for again

    /// The glass as the app wires it: the offer's own history is what keeps it from being made twice.
    private func glass(_ center: HarnessCenter) -> NudgeCenter {
        let nudges = NudgeCenter(defaults: defaults)
        nudges.now = { [unowned self] in self.clock }
        nudges.owner = user
        nudges.register(HarnessNudges.offerSource(center))
        return nudges
    }

    private func read(_ nudges: NudgeCenter, _ id: String, _ symbol: String) {
        nudges.noteRead(NudgeRead(requestId: id, symbol: symbol, name: symbol, isEquity: true, verdict: "wait", saved: false, at: clock, memory: nil))
    }

    func testAYesThatWasErasedWithTheNotesIsAskedForAgain() async throws {
        user = "u1"
        let center = make()
        let nudges = glass(center)
        await ask(center, "NVDA")
        read(nudges, "r1", "NVDA")
        let offer = try XCTUnwrap(nudges.current(nudges.moment(signedIn: true)))
        XCTAssertEqual(offer.id, HarnessNudges.offerId)
        nudges.seen(offer.id)
        // "Yes, tell me": the glass retires the line and the centre is asked.
        nudges.retire(offer.id)
        _ = await center.accept()
        XCTAssertEqual(center.mode, .on)
        XCTAssertNil(nudges.current(nudges.moment(signedIn: true)), "answered: it is not made again by itself")
        // Memory's "Delete everything": the notes go, and the yes with them.
        let memory = memory()
        memory.requestForgetAll()
        _ = await memory.confirmForgetAll()
        await center.reloadAfterErase()                 // what the centre does when it hears `HarnessCenter.erased`
        XCTAssertEqual(center.mode, .undecided)
        // Their next read.
        clock = clock.addingTimeInterval(20 * 60)
        await ask(center, "NVDA")
        read(nudges, "r2", "NVDA")
        XCTAssertEqual(nudges.current(nudges.moment(signedIn: true))?.id, HarnessNudges.offerId,
                       "before anything more is kept, the yes is asked for again")
    }

    func testAYesThatWentWithAWithdrawnRiskNoticeIsAskedForAgainAndANoIsNot() async throws {
        let center = make()
        let nudges = glass(center)
        await ask(center, "NVDA")
        read(nudges, "r1", "NVDA")
        let offer = try XCTUnwrap(nudges.current(nudges.moment(signedIn: false)))
        nudges.seen(offer.id)
        nudges.retire(offer.id)
        _ = await center.accept()
        // The risk notice is withdrawn: everything is erased, the yes included.
        consent = .withdrawn
        await center.consentChanged()
        XCTAssertEqual(center.mode, .undecided)
        consent = .accepted
        clock = clock.addingTimeInterval(20 * 60)
        await ask(center, "NVDA")
        read(nudges, "r2", "NVDA")
        let again = try XCTUnwrap(nudges.current(nudges.moment(signedIn: false)), "the yes went with the notice: it is asked for again")
        XCTAssertEqual(again.id, HarnessNudges.offerId)
        // This time they say yes and then turn follow-ups off: that is a no, and it is not asked about again.
        nudges.seen(again.id)
        nudges.retire(again.id)
        _ = await center.accept()
        await center.turnOff()
        clock = clock.addingTimeInterval(20 * 60)
        read(nudges, "r3", "NVDA")
        XCTAssertNil(nudges.current(nudges.moment(signedIn: false)))
        XCTAssertTrue(nudges.isRetired(HarnessNudges.offerId), "turning follow-ups off keeps the offer retired for good")
    }

    // MARK: 4. Forget on an asset also erases its follow-up notes and the follow-up that was coming

    /// "Forget" is the one button beside an asset on the face of the Memory screen. What the phone
    /// keeps to come back to that asset goes with it. (This reader also wrote a thesis about NVDA:
    /// its pointer is not a note of the follow-ups and goes with the thesis, in My theses.)
    func testForgetOnAnAssetAlsoErasesItsFollowUpNotesAndTheFollowUpThatWasComing() async throws {
        user = "u1"
        try ThesisBook(defaults: defaults).create(ThesisDraft(symbol: "NVDA", name: "NVIDIA", isEquity: true, horizon: .weeks, hypothesis: "Mine"),
                                                  owner: "u1", now: at(6, 9))
        let center = make()
        center.start()                                  // the centre listens, as it does once the Núcleo started
        await settle()
        await ask(center, "NVDA")
        _ = await center.accept()
        await settle()
        let before = try XCTUnwrap(center.notes.assets.first { $0.symbol == "NVDA" })
        XCTAssertTrue(before.lines.contains { $0.hasPrefix("Asked once") } && before.lines.contains { $0.hasPrefix("Bobby comes back on") }, "\(before.lines)")
        XCTAssertTrue(before.erasable)
        // A thesis of weeks: the asset a week later, and no week of its own (it would hold nothing asked since its Monday).
        XCTAssertEqual(Set(fake.requests.keys), ["v18.follow.asset"])
        let memory = memory()
        let confirmed = await memory.forget("NVDA")
        XCTAssertTrue(confirmed)
        await settle()
        XCTAssertFalse(center.ledger.events.contains { $0.symbol == "NVDA" && $0.kind != .thesis }, "nothing asked about NVDA is kept to plan from")
        XCTAssertFalse(HarnessStore(defaults: defaults).ledger(owner: "u1").events.contains { $0.symbol == "NVDA" && $0.kind != .thesis })
        XCTAssertEqual(fake.requests.count, 0, "and no notice about it arrives")
        let after = try XCTUnwrap(center.notes.assets.first { $0.symbol == "NVDA" })
        XCTAssertEqual(after.lines, ["Your thesis looks weeks ahead."], "what is left to say is the thesis they wrote")
        XCTAssertFalse(after.erasable, "which is erased where it was written")
        // The server does not answer: the phone's part is done all the same.
        clock = at(7, 17)
        center.noteAsk(symbol: "BTC", name: "Bitcoin", isEquity: false, price: 61_250)
        await settle()
        XCTAssertTrue(center.notes.assets.contains { $0.symbol == "BTC" })
        XCTAssertFalse(fake.requests.isEmpty)
        memory.send = { _, _, _ in throw URLError(.notConnectedToInternet) }
        let unconfirmed = await memory.forget("BTC")
        XCTAssertFalse(unconfirmed)
        await settle()
        XCTAssertFalse(center.notes.assets.contains { $0.symbol == "BTC" })
        XCTAssertFalse(center.ledger.events.contains { $0.symbol == "BTC" })
        XCTAssertEqual(fake.requests.count, 0)
    }

    // MARK: 5. The notes promise a day only when the phone will show the follow-up

    func testTheNotesSayADayOnlyWhenThePhoneWillShowTheFollowUp() async {
        fake.grantsWhenAsked = false
        let center = make()
        await ask(center, "NVDA")
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .denied)
        XCTAssertEqual(center.upcoming.count, 2, "the plan is made: the glass still comes back to it")
        XCTAssertFalse(said(center).contains { $0.hasPrefix("Bobby comes back") || $0.hasPrefix("Your week arrives") },
                       "nothing will arrive, so no day is promised")
        // They allow Bobby's notifications in the phone's settings.
        fake.permission = .allowed
        await center.appActive()
        XCTAssertTrue(said(center).contains { $0.hasPrefix("Bobby comes back on ") })
        XCTAssertTrue(said(center).contains { $0.hasPrefix("Your week arrives on ") })
        // And take the permission away again: the promise goes with it.
        fake.permission = .denied
        await center.appActive()
        XCTAssertFalse(said(center).contains { $0.hasPrefix("Bobby comes back") || $0.hasPrefix("Your week arrives") })
    }

    /// iOS shows what it accepted at its moment. The one case the phone can tell it did not: when it
    /// next looks, Bobby's notifications are off and the notice is not in the notification centre.
    func testAFollowUpIOSCouldNotShowIsNotWrittenAsShown() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        XCTAssertEqual(Set(fake.requests.keys), ["v18.follow.asset", "v18.follow.week"])
        // They turn Bobby's notifications off in Settings before its moment: iOS shows nothing.
        fake.permission = .denied
        clock = at(8, 17)
        await center.appActive()
        XCTAssertTrue(sent(center).isEmpty, "nobody saw it: it is not a follow-up that was shown")
        XCTAssertEqual(center.ledger.unansweredStreak(before: clock).count, 0, "and it is not one that went unanswered")
        XCTAssertFalse(said(center).contains { $0.hasPrefix("Follow-ups:") }, "the notes count nothing")
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "the week is still to come")
    }

    /// A tap proves its own notice was shown, whatever the phone could tell before it: iOS takes a
    /// tapped notice off its list, so with notifications switched off since, the look found nothing.
    func testATapProvesItsNoticeWasShownWhateverTheSettingsSayNow() async throws {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        let tap = try XCTUnwrap(HarnessTap.tap(from: try XCTUnwrap(fake.requests["v18.follow.asset"]).request().content.userInfo))
        clock = at(8, 17)
        fake.permission = .denied
        await center.appActive()
        XCTAssertTrue(sent(center).isEmpty, "the phone could not tell")
        await center.opened(tap)
        XCTAssertEqual(sent(center).map(\.at), [at(8, 16, 40)], "the tap says it was shown: written once, at its moment")
        XCTAssertEqual(center.ledger.events(.opened).count, 1)
        await center.opened(tap)
        XCTAssertEqual(sent(center).count, 1)
        XCTAssertEqual(center.ledger.events(.opened).count, 1)
        XCTAssertEqual(center.status, .denied, "and a tap is not taken for a permission")
    }

    /// One still in the notification centre was shown, and so was one with the permission still on.
    func testAFollowUpStillOnTheScreenOrStillAllowedIsWrittenAsShown() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 17)
        fake.deliver(before: clock)
        fake.permission = .denied                       // switched off after it was shown: it is still in the notification centre
        await center.appActive()
        XCTAssertEqual(sent(center).map(\.at), [at(8, 16, 40)])
        XCTAssertTrue(said(center).contains("Follow-ups: 1 shown, 0 tapped, 0 answered."))
        // The week, with notifications on and the notice already cleared by the person: iOS showed what it accepted.
        fake.permission = .allowed
        await center.appActive()
        XCTAssertEqual(Set(fake.requests.keys), ["v18.follow.week"])
        clock = at(12, 17)
        fake.deliver(before: clock)
        fake.removeDelivered(HarnessCenter.identifiers)
        await center.appActive()
        XCTAssertEqual(sent(center).map(\.step), [.asset, .week])
    }

    /// Bobby may notify, and every place a notification could show is switched off in Settings:
    /// iOS accepts a follow-up and shows it nowhere. For follow-ups that is a no from the phone.
    func testFollowUpsIOSWouldShowNowhereAreANoFromThePhone() {
        typealias Phone = SystemHarnessNotifier
        XCTAssertEqual(Phone.permission(authorization: .authorized, lockScreen: .enabled, list: .enabled, alerts: .enabled), .allowed)
        XCTAssertEqual(Phone.permission(authorization: .authorized, lockScreen: .disabled, list: .enabled, alerts: .disabled), .allowed,
                       "the notification centre alone still shows it")
        XCTAssertEqual(Phone.permission(authorization: .authorized, lockScreen: .enabled, list: .disabled, alerts: .disabled), .allowed)
        XCTAssertEqual(Phone.permission(authorization: .authorized, lockScreen: .disabled, list: .disabled, alerts: .enabled), .allowed)
        XCTAssertEqual(Phone.permission(authorization: .authorized, lockScreen: .disabled, list: .disabled, alerts: .disabled), .denied,
                       "allowed, and nowhere to show one")
        XCTAssertEqual(Phone.permission(authorization: .authorized, lockScreen: .notSupported, list: .notSupported, alerts: .notSupported), .denied)
        XCTAssertEqual(Phone.permission(authorization: .provisional, lockScreen: .disabled, list: .enabled, alerts: .disabled), .allowed)
        XCTAssertEqual(Phone.permission(authorization: .denied, lockScreen: .enabled, list: .enabled, alerts: .enabled), .denied)
        XCTAssertEqual(Phone.permission(authorization: .notDetermined, lockScreen: .disabled, list: .disabled, alerts: .disabled), .notDetermined,
                       "never asked: their yes may still ask")
    }

    // MARK: 6. A chip starts no chain in an account that said yes, whichever way it gets there

    /// An account with follow-ups on signs out. Signed out (undecided) they tap "How is BTC
    /// looking?", which the phone keeps as a bare entry like any question, and sign in again.
    func testWhatWasKeptSignedOutBeforeAnyYesStartsNoChainInAnAccountThatAlreadySaidYes() async {
        user = "u1"
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        switchTo(nil)
        await center.accountChanged()
        clock = at(8, 10)
        center.noteAsk(symbol: "BTC", name: "Bitcoin", isEquity: false, price: 61_250, origin: .followUp, chip: true)
        await settle()
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertEqual(center.ledger.events.count, 1)
        XCTAssertNil(center.ledger.events.first?.origin, "before any yes a chip is kept the way a question is")
        clock = at(8, 11)
        switchTo("u1")
        await center.accountChanged()
        XCTAssertEqual(center.mode, .on)
        XCTAssertEqual(center.ledger.question(before: clock)?.symbol, "NVDA", "the chain is still the one question they typed")
        XCTAssertEqual(center.upcoming.map(\.step), [.asset, .week])
        XCTAssertEqual(center.upcoming.map(\.fireAt), [at(8, 16, 40), at(12, 16, 40)])
        XCTAssertEqual(center.upcoming.first?.symbol, "NVDA")
        XCTAssertEqual(center.ledger.assets(since: at(1, 0), now: clock).map(\.symbol), ["BTC", "NVDA"],
                       "and BTC is still an asset they asked about, for the glass and the week")
        XCTAssertTrue(HarnessStore(defaults: defaults).ledger(owner: nil).isEmpty, "nothing stays under the signed-out reader")
        // A signed-out reader who had said yes brings their own questions with them, as before.
        defaults.removePersistentDomain(forName: suiteName)
        fake = FakeHarnessNotifier()
        switchTo(nil)
        let other = make()
        clock = at(8, 12)
        await ask(other, "TSLA")
        _ = await other.accept()
        HarnessStore(defaults: defaults).write(.on, owner: "u2")
        switchTo("u2")
        await other.accountChanged()
        XCTAssertEqual(other.ledger.question(before: clock)?.symbol, "TSLA")
        XCTAssertEqual(other.upcoming.first?.symbol, "TSLA")
    }

    // MARK: 7. A byte-order mark in a question is white space

    /// The page reads U+FEFF (a byte-order mark a server may leave in a string) as white space: it
    /// shows the question without it, and a tap sends the words without it. Native compares the same way.
    func testAByteOrderMarkLeftInTheQuestionIsWhiteSpaceAsItIsForThePage() {
        XCTAssertEqual(NucleoDeskIO.nextQuestion("\u{FEFF}\(Self.offered) \u{FEFF}"), Self.offered, "at either end it goes with the spaces")
        XCTAssertNil(NucleoDeskIO.nextQuestion("\u{FEFF} \u{FEFF}"), "alone it is no question")
        XCTAssertTrue(NucleoDeskIO.sameQuestion("\u{FEFF}\(Self.offered)", Self.offered))
        XCTAssertTrue(NucleoDeskIO.sameQuestion("What changed\u{FEFF}in NVDA?", "What changed in NVDA?"), "inside, it separates two words, as a space does")
        XCTAssertFalse(NucleoDeskIO.sameQuestion("\u{FEFF}\(Self.offered)", "What would have to change in AMD for this read to change?"))
    }

    // MARK: 8. Signed out, the Memory screen is one sentence and one row

    /// What stood on the face before: the sentence, a paragraph about where the phone keeps things,
    /// the shortcuts, the theses and the notes (about 66 words before the first note). Now the title,
    /// one sentence and the row "On this iPhone", as for an account and as on Android.
    func testSignedOutTheMemoryScreenIsOneSentenceAndOneRow() {
        XCTAssertEqual(MemoryView.foldedFace(note: MemoryError.signedOut.message),
                       ["Memory", "Sign in with Apple so Bobby can remember your assets and preferences.", "On this iPhone"])
        L.select("es")
        XCTAssertEqual(MemoryView.foldedFace(note: MemoryError.signedOut.message),
                       ["Memoria", "Inicia sesión con Apple para que Bobby recuerde tus activos y preferencias.", "En este iPhone"])
        for language in Self.languages {
            L.select(language)
            for note in [MemoryError.signedOut.message, MemoryView.riskRequired] {
                let face = MemoryView.foldedFace(note: note)
                XCTAssertEqual(face.count, 3, "the title, one sentence, the row that unfolds")
                let words = face.joined(separator: " ").split(whereSeparator: { $0 == " " || $0 == "\u{00A0}" || $0 == "\u{202F}" }).filter { $0 != ":" }
                XCTAssertLessThanOrEqual(words.count, 22, "\(language): about twenty words (V18-DESIGN.md, Memory): \(face)")
                XCTAssertFalse(face.contains(MemoryView.onThisPhoneNote), "\(language): where the phone keeps things is said inside the row")
            }
        }
        L.select("en")
    }

    // MARK: 9. The count of follow-ups reads right for one

    func testTheCountOfFollowUpsReadsRightForOneInEveryLanguage() throws {
        var ledger = HarnessLedger()
        let shown = at(6, 19)
        ledger.note(HarnessEvent(kind: .ask, at: at(5, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100))
        ledger.note(HarnessEvent(kind: .sent, at: shown, symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .opened, at: shown.addingTimeInterval(600), symbol: "NVDA", step: .asset, ref: shown))
        ledger.note(HarnessEvent(kind: .returned, at: shown.addingTimeInterval(900), symbol: "NVDA", step: .asset, ref: shown))
        let expected = [
            "en": "Follow-ups: 1 shown, 1 tapped, 1 answered.",
            "es": "Seguimientos mostrados: 1. Tocados: 1. Respondidos: 1.",
            "fr": "Suivis affichés : 1. Touchés : 1. Avec réponse : 1.",
            "pt": "Seguimentos mostrados: 1. Tocados: 1. Respondidos: 1.",
            "it": "Aggiornamenti mostrati: 1. Toccati: 1. Con risposta: 1.",
            "de": "Follow-ups: 1 gezeigt, 1 angetippt, 1 beantwortet.",
        ]
        // A number in front of a participle that would have to agree with it ("1 mostrados", "1 affichés").
        let disagreement = try NSRegularExpression(pattern: #"\d+\s+(mostrados|tocados|respondidos|affichés|touchés|mostrati|toccati)"#)
        for language in Self.languages {
            L.select(language)
            let general = HarnessNotes.make(ledger: ledger, mode: .on, upcoming: [], now: at(7, 12), calendar: calendar).general
            XCTAssertTrue(general.contains(try XCTUnwrap(expected[language])), "\(language): \(general)")
            for line in general {
                XCTAssertEqual(disagreement.numberOfMatches(in: line, range: NSRange(line.startIndex..., in: line)), 0, "\(language): \(line)")
            }
        }
        L.select("en")
    }
}
