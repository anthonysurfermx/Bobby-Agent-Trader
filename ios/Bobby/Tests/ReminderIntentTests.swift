import Foundation
import UserNotifications
import XCTest
@testable import Bobby

/// A tapped thesis reminder (1.8): read only from a reminder's own payload, stored, and opened once
/// by the Núcleo behind the same gate as a briefing tap, with no account needed.
@MainActor
final class ReminderIntentTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func sheetStates(_ route: String) -> [String] {
            events.filter { $0.name == "native.sheet" && $0.payload["route"] as? String == route }
                .compactMap { $0.payload["state"] as? String }
        }
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private nonisolated static let idA = "3F2504E0-4F89-41D3-9A0C-0305E82C3301"
    private nonisolated static let idB = "9B2C1A7E-0D3F-4C55-8F1E-2A6B4C8D0E12"
    private nonisolated static let briefA = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"

    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var saved: [String: Any] = [:]
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private var active = true
    private var signedIn = false
    private var deskBusy = false
    private var listening = false
    private var narrating = false

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "reminder.intent.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        active = true; signedIn = false; deskBusy = false; listening = false; narrating = false
        V18Focus.clear()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        V18Focus.clear()
        for key in Self.profileKeys {
            if let v = saved[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    // MARK: Helpers

    private func payload(_ id: Any?, kind: Any? = "thesis-review", others: [Any]? = nil) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [:]
        if let kind { info["kind"] = kind }
        if let id { info["thesisId"] = id }
        if let others { info["thesisIds"] = others }
        return info
    }

    @discardableResult
    private func thesis(_ symbol: String) throws -> SavedThesis {
        try book.create(ThesisDraft(symbol: symbol, name: symbol, isEquity: true, horizon: .months,
                                    hypothesis: "Why I am looking at \(symbol)"), owner: nil, now: t0)
    }

    private func make(riskAccepted: Bool = true, onboarded: Bool = true, reminders: ReminderIntent? = nil,
                      briefings: BriefingIntent? = nil) -> (NucleoSession, NucleoBridge, Recorder, ReminderIntent) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = riskAccepted ? RiskNotice.currentVersion : 0
        let intent = reminders ?? ReminderIntent(observeAccount: false)
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults,
                                    briefingIntent: briefings ?? BriefingIntent(observeAccount: false), reminderIntent: intent)
        profile.onboarded = onboarded
        session.companions.companionId = onboarded ? "orb" : nil
        session.briefingSheetDelay = 0
        session.briefingGate = BriefingTapGate(
            appActive: { [unowned self] in self.active },
            signedIn: { [unowned self] in self.signedIn },
            deskBusy: { [unowned self] in self.deskBusy },
            listening: { [unowned self] in self.listening },
            narrating: { [unowned self] in self.narrating })
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder, intent)
    }

    private func call(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any] = [:]) async {
        let (_, error) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        XCTAssertNil(error, "\(method) envelope refused")
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    private func startApp(_ bridge: NucleoBridge) async {
        await call(bridge, "session", ["page": "app"])
        await settle()
    }

    // MARK: The payload

    func testOnlyAThesisReminderPayloadIsATap() {
        XCTAssertEqual(ReminderIntent.tap(from: payload(Self.idA)), ReminderTap(thesisId: Self.idA))
        XCTAssertEqual(ReminderIntent.tap(from: payload(Self.idA.lowercased()))?.thesisId, Self.idA, "the id as the book writes it")
        XCTAssertNil(ReminderIntent.tap(from: payload(Self.idA, kind: nil)), "no kind: not ours")
        XCTAssertNil(ReminderIntent.tap(from: payload(Self.idA, kind: "briefing")))
        XCTAssertNil(ReminderIntent.tap(from: payload(Self.idA, kind: 7)))
        XCTAssertNil(ReminderIntent.tap(from: payload("not-a-uuid")))
        XCTAssertNil(ReminderIntent.tap(from: payload("3F2504E04F8941D39A0C0305E82C3301")))
        XCTAssertNil(ReminderIntent.tap(from: payload("\(Self.idA); drop")))
        XCTAssertNil(ReminderIntent.tap(from: payload(42)))
        XCTAssertNil(ReminderIntent.tap(from: payload(nil)))
        XCTAssertNil(ReminderIntent.tap(from: [:]))
        XCTAssertNil(ReminderIntent.tap(from: ["aps": ["kind": "thesis-review", "thesisId": Self.idA]]), "only the top level is read")
        // A briefing push is never mistaken for a reminder, and a reminder never for a briefing.
        XCTAssertNil(ReminderIntent.tap(from: ["briefId": Self.briefA, "aps": ["alert": ["title": "Bobby"]]]))
        XCTAssertNil(BriefingIntent.briefId(from: payload(Self.idA)))
    }

    func testATapCarriesOnlyItsOwnThesis() {
        // Whatever else sits in a payload, a tap is about one thesis: the one under "thesisId".
        let tap = ReminderIntent.tap(from: payload(Self.idA, others: [Self.idB, "garbage", 9]))
        XCTAssertEqual(tap, ReminderTap(thesisId: Self.idA))
        XCTAssertNil(ReminderIntent.tap(from: payload(nil, others: [Self.idB])), "a list is never read in its place")
    }

    func testEveryNotificationTheCentreWritesIsATapForItsOwnThesis() {
        let calendar = Calendar(identifier: .gregorian)
        // Two reminders for the same minute: two notifications, each opening its own review.
        let plan = ReminderCenter.plan([PendingReminder(thesisId: Self.idA, symbol: "NVDA", fireAt: t0),
                                        PendingReminder(thesisId: Self.idB, symbol: "BTC", fireAt: t0)], calendar: calendar, language: "en")
        XCTAssertEqual(plan.map(\.id), ["v18.thesis.\(Self.idA)", "v18.thesis.\(Self.idB)"])
        XCTAssertEqual(plan.map { ReminderIntent.tap(from: $0.userInfo) }, [ReminderTap(thesisId: Self.idA), ReminderTap(thesisId: Self.idB)])
        // What iOS hands back on a tap is the request's own payload.
        XCTAssertEqual(plan.map { ReminderIntent.tap(from: $0.request().content.userInfo) },
                       [ReminderTap(thesisId: Self.idA), ReminderTap(thesisId: Self.idB)])
    }

    // MARK: The store

    func testMalformedTapsAreIgnored() {
        let intent = ReminderIntent(observeAccount: false)
        XCTAssertFalse(intent.store(payload("not-a-uuid")))
        XCTAssertFalse(intent.store(payload(Self.idA, kind: "briefing")))
        XCTAssertFalse(intent.store([:]))
        XCTAssertNil(intent.pending)
        XCTAssertNil(intent.take())
    }

    func testATapIsStoredOnceAndConsumedOnce() {
        let intent = ReminderIntent(observeAccount: false)
        XCTAssertTrue(intent.store(payload(Self.idA)))
        XCTAssertEqual(intent.pending?.thesisId, Self.idA)
        XCTAssertEqual(intent.take()?.thesisId, Self.idA)
        XCTAssertNil(intent.take(), "a tap is never replayed")
        XCTAssertNil(intent.pending)
    }

    func testTheNewestTapWinsAndAMalformedOneDoesNotReplaceIt() {
        let intent = ReminderIntent(observeAccount: false)
        intent.store(payload(Self.idA))
        intent.store(payload(Self.idB))
        XCTAssertFalse(intent.store(payload("garbage")))
        XCTAssertEqual(intent.take()?.thesisId, Self.idB)
        XCTAssertNil(intent.take())
    }

    func testAnAccountChangeClearsThePendingTap() async {
        let account = AccountSession(usesKeychain: false, defaults: defaults)
        let intent = ReminderIntent(observeAccount: true, account: account)
        intent.store(payload(Self.idA))
        account.signOut()
        await settle()
        XCTAssertNil(intent.pending, "a reminder of the previous reader never opens for the next one")
        intent.store(payload(Self.idB))
        intent.clear()
        XCTAssertNil(intent.take())
    }

    // MARK: The foreground

    func testAReminderThatFiresWhileTheAppIsOpenShowsUnlessItsReviewIsOnScreen() {
        let intent = ReminderIntent(observeAccount: false)
        XCTAssertEqual(ReminderIntent.presentation(thesisId: Self.idA, openThesisId: intent.openThesisId), [.banner, .list],
                       "not silently dropped")
        intent.markOpen(Self.idA.lowercased())
        XCTAssertEqual(intent.openThesisId, Self.idA)
        XCTAssertEqual(ReminderIntent.presentation(thesisId: Self.idA, openThesisId: intent.openThesisId), [])
        XCTAssertEqual(ReminderIntent.presentation(thesisId: Self.idB, openThesisId: intent.openThesisId), [.banner, .list])
        intent.markOpen("not-an-id")
        XCTAssertNil(intent.openThesisId)
        intent.markOpen(nil)
        XCTAssertNil(intent.openThesisId)
        // The briefing rule is untouched by a reminder.
        XCTAssertEqual(PushRegistrar.presentation(briefId: Self.briefA, openBriefId: Self.briefA), [])
        XCTAssertEqual(PushRegistrar.presentation(briefId: Self.briefA, openBriefId: nil), [.banner, .list])
    }

    // MARK: Where a tap leads

    func testATapLeadsToTheReviewOfItsThesisOrToTheList() throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let all = book.active(owner: nil)
        XCTAssertEqual(ReminderIntent.destination(for: ReminderTap(thesisId: nvda.id), active: all), .review(nvda.id))
        XCTAssertEqual(ReminderIntent.destination(for: ReminderTap(thesisId: btc.id.lowercased()), active: all), .review(btc.id),
                       "the id as the book holds it")
        XCTAssertEqual(ReminderIntent.destination(for: ReminderTap(thesisId: Self.idA), active: all), .list,
                       "the thesis no longer exists")
        XCTAssertEqual(ReminderIntent.destination(for: ReminderTap(thesisId: nvda.id), active: []), .list)
        try book.archive(id: nvda.id, owner: nil, now: t0)
        XCTAssertEqual(ReminderIntent.destination(for: ReminderTap(thesisId: nvda.id), active: book.active(owner: nil)),
                       .list, "an archived thesis is not reviewed from a reminder")
        XCTAssertEqual(ReminderIntent.destination(for: ReminderTap(thesisId: btc.id), active: book.active(owner: nil)), .review(btc.id))
    }

    // MARK: The Núcleo drains it

    func testAColdStartTapWaitsForThePageThenOpensTheReviewOnce() async throws {
        let nvda = try thesis("NVDA")
        // The app delegate stores the tap before the Núcleo exists.
        let intent = ReminderIntent(observeAccount: false)
        XCTAssertTrue(intent.store(payload(nvda.id)))
        let (session, bridge, recorder, _) = make(reminders: intent)
        defer { session.teardown() }
        await settle()
        XCTAssertNil(session.sheet)
        XCTAssertEqual(intent.pending?.thesisId, nvda.id, "before the page is ready the tap stays stored")
        session.appBecameActive()
        await settle()
        XCTAssertNil(session.sheet)
        await startApp(bridge)
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertEqual(V18Focus.thesisId, nvda.id, "the review opens on that thesis")
        XCTAssertEqual(intent.openThesisId, nvda.id)
        XCTAssertNil(intent.pending, "consumed")
        XCTAssertEqual(recorder.sheetStates("thesisReview"), ["open"])

        session.sheetDismissed()
        await settle()
        XCTAssertNil(intent.openThesisId, "the review closed")
        session.appBecameActive()
        await startApp(bridge)
        XCTAssertNil(session.sheet, "never replayed on a later foreground")
        XCTAssertEqual(recorder.sheetStates("thesisReview"), ["open", "closed"])
    }

    func testAWarmTapOpensWithoutAnAccount() async throws {
        let nvda = try thesis("NVDA")
        let (session, bridge, _, intent) = make()
        defer { session.teardown() }
        signedIn = false
        await startApp(bridge)
        intent.store(payload(nvda.id.lowercased()))
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview, "reminders and theses live on this phone")
        XCTAssertEqual(V18Focus.takeThesisId(), nvda.id)
    }

    func testAThesisThatIsGoneOpensTheList() async throws {
        let nvda = try thesis("NVDA")
        let (session, bridge, recorder, intent) = make()
        defer { session.teardown() }
        await startApp(bridge)
        book.delete(id: nvda.id, owner: nil)
        intent.store(payload(nvda.id))
        await settle()
        XCTAssertEqual(session.sheet, .theses)
        XCTAssertNil(V18Focus.thesisId)
        XCTAssertNil(intent.openThesisId)
        XCTAssertTrue(recorder.sheetStates("thesisReview").isEmpty)
    }

    func testAnArchivedThesisOpensTheListNeverAnEmptyReview() async throws {
        let nvda = try thesis("NVDA")
        try thesis("BTC")
        let (session, bridge, recorder, intent) = make()
        defer { session.teardown() }
        await startApp(bridge)
        try book.archive(id: nvda.id, owner: nil, now: t0)
        intent.store(payload(nvda.id))
        await settle()
        XCTAssertEqual(session.sheet, .theses)
        XCTAssertNil(V18Focus.thesisId)
        XCTAssertTrue(recorder.sheetStates("thesisReview").isEmpty)
    }

    func testTwoRemindersDueTheSameMinuteEachOpenTheirOwnReview() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let (session, bridge, recorder, intent) = make()
        defer { session.teardown() }
        await startApp(bridge)
        // Two notifications on the lock screen; the person taps one, then the other.
        intent.store(payload(nvda.id))
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertEqual(V18Focus.takeThesisId(), nvda.id)
        XCTAssertEqual(intent.openThesisId, nvda.id)
        session.sheetDismissed()
        await settle()
        intent.store(payload(btc.id))
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertEqual(V18Focus.takeThesisId(), btc.id)
        XCTAssertEqual(intent.openThesisId, btc.id)
        XCTAssertEqual(recorder.sheetStates("thesisReview"), ["open", "closed", "open"])
        XCTAssertTrue(recorder.sheetStates("theses").isEmpty, "never the list while the thesis exists")
    }

    func testASignedInTapIsReadAgainstTheAccountsOwnTheses() async throws {
        // The account's thesis, and one left in the phone's local book that is not theirs to open.
        let mine = try book.create(ThesisDraft(symbol: "NVDA", name: "NVDA", isEquity: true, horizon: .months,
                                               hypothesis: "Why I am looking at NVDA"), owner: "u1", now: t0)
        let local = try thesis("BTC")
        let (session, bridge, recorder, intent) = make()
        defer { session.teardown() }
        session.reminderOwner = { "u1" }
        await startApp(bridge)
        intent.store(payload(mine.id))
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview, "the signed-in book is the one read")
        XCTAssertEqual(V18Focus.takeThesisId(), mine.id)
        session.sheetDismissed()
        await settle()
        intent.store(payload(local.id))
        await settle()
        XCTAssertEqual(session.sheet, .theses, "a thesis outside this account's book is never opened for it")
        XCTAssertEqual(recorder.sheetStates("thesisReview"), ["open", "closed"])
        // Signed out again (the default in this host): the local book is the one read.
        session.sheetDismissed()
        await settle()
        session.reminderOwner = nil
        intent.store(payload(local.id))
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertEqual(V18Focus.takeThesisId(), local.id)
    }

    // MARK: The ways into the Reminders screen

    func testTheRemindersScreenOpensFromTheProfileAndFromAThesis() async throws {
        let nvda = try thesis("NVDA")
        let (session, bridge, recorder, _) = make()
        defer { session.teardown() }
        await startApp(bridge)
        // The profile's "Reminders" row: the profile hands over to the screen, on no thesis in particular.
        XCTAssertTrue(session.openNative(.account))
        V18Focus.thesisId = "left-over"
        session.openReminders()
        XCTAssertNil(session.sheet, "the profile goes away first")
        session.sheetDismissed()   // SwiftUI reports the profile gone
        await settle()
        XCTAssertEqual(session.sheet, .reminders)
        XCTAssertNil(V18Focus.thesisId, "an older focus is never inherited")
        XCTAssertEqual(recorder.sheetStates("account"), ["open", "closed"])
        session.sheetDismissed()
        await settle()
        // A thesis screen's reminder button: that thesis comes first.
        XCTAssertTrue(session.openNative(.thesisReview))
        session.openReminders(thesisId: nvda.id)
        session.sheetDismissed()
        await settle()
        XCTAssertEqual(session.sheet, .reminders)
        XCTAssertEqual(V18Focus.takeThesisId(), nvda.id)
        session.sheetDismissed()
        await settle()
        // With nothing open it presents at once.
        session.openReminders()
        XCTAssertEqual(session.sheet, .reminders)
    }

    func testTheTapWaitsForTheMicTheDeskTheVoiceASheetAndTheApp() async throws {
        let nvda = try thesis("NVDA")
        let (session, bridge, _, intent) = make()
        defer { session.teardown() }
        await startApp(bridge)

        listening = true
        intent.store(payload(nvda.id))
        session.appBecameActive()
        await settle()
        XCTAssertNil(session.sheet, "the mic is open")
        listening = false
        deskBusy = true
        session.speech.emit("speech.state", ["state": "stopped"])
        await settle()
        XCTAssertNil(session.sheet, "a read is running")
        deskBusy = false
        narrating = true
        await call(bridge, "cancel")
        await settle()
        XCTAssertNil(session.sheet, "Bobby is speaking")
        narrating = false
        active = false
        session.appBecameActive()
        await settle()
        XCTAssertNil(session.sheet, "the app is not active")
        active = true
        XCTAssertTrue(session.openNative(.account))
        session.appBecameActive()
        await settle()
        XCTAssertEqual(session.sheet, .account, "another sheet is up")
        XCTAssertEqual(intent.pending?.thesisId, nvda.id, "still waiting")
        session.sheetDismissed()
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertNil(intent.pending)
    }

    func testNothingOpensBeforeTheRiskNoticeOrDuringOnboarding() async throws {
        let nvda = try thesis("NVDA")
        let (session, bridge, _, intent) = make(riskAccepted: false)
        defer { session.teardown() }
        await startApp(bridge)
        intent.store(payload(nvda.id))
        await settle()
        XCTAssertNil(session.sheet)
        XCTAssertEqual(intent.pending?.thesisId, nvda.id, "kept, not opened")

        let (other, otherBridge, _, otherIntent) = make(onboarded: false)
        defer { other.teardown() }
        await call(otherBridge, "session", ["page": "onboarding"])
        otherIntent.store(payload(nvda.id))
        await settle()
        XCTAssertNil(other.sheet)
    }

    func testABriefingTapAndAReminderTapOpenOneAfterTheOther() async throws {
        let nvda = try thesis("NVDA")
        let briefings = BriefingIntent(observeAccount: false)
        let (session, bridge, recorder, intent) = make(briefings: briefings)
        defer { session.teardown() }
        signedIn = true
        await startApp(bridge)
        briefings.store(Self.briefA)
        intent.store(payload(nvda.id))
        await settle()
        XCTAssertEqual(session.sheet, .briefing, "the briefing behaviour is unchanged")
        XCTAssertEqual(session.selectedBriefId, Self.briefA)
        XCTAssertEqual(intent.pending?.thesisId, nvda.id, "one sheet at a time: the reminder waits")
        session.sheetDismissed()
        await settle()
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open", "closed"])
        XCTAssertEqual(recorder.sheetStates("thesisReview"), ["open"])
    }

    func testAPayloadThatIsNotAReminderOpensNothing() async {
        let (session, bridge, recorder, intent) = make()
        defer { session.teardown() }
        await startApp(bridge)
        XCTAssertFalse(intent.store(["briefId": Self.briefA]))
        XCTAssertFalse(intent.store(payload("garbage")))
        session.appBecameActive()
        await settle()
        XCTAssertNil(session.sheet)
        XCTAssertFalse(session.drainReminderIntent())
        XCTAssertTrue(recorder.events.filter { $0.name == "native.sheet" }.isEmpty)
    }

    func testNeitherScreenCanBeOpenedByThePage() {
        for route in ["reminders", "thesisReview", "theses", "briefingSettings"] {
            XCTAssertFalse(NucleoRoute.openable.contains(route), route)
        }
    }
}
