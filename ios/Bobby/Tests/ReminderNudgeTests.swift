import Foundation
import XCTest
@testable import Bobby

/// Reminders on the glass (1.8): the offer appears only right after a thesis was written or reviewed
/// and has no reminder yet; the Monday-briefing line only for an eligible account that has it off.
/// Neither asks iOS for anything: a nudge only opens a screen.
@MainActor
final class ReminderNudgeTests: XCTestCase {
    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var saved: [String: Any] = [:]
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)
    private var owner: String? = "u1"
    private var reminders: Set<String> = []
    private var briefing = ReminderNudges.BriefingOffer(eligiblePro: nil, weeklyOn: nil, configured: false, saving: false)
    private var recent: ReminderNudges.Recent!

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "reminder.nudge.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        clock = Date(timeIntervalSince1970: 1_800_000_000)
        owner = "u1"; reminders = []
        briefing = ReminderNudges.BriefingOffer(eligiblePro: nil, weeklyOn: nil, configured: false, saving: false)
        recent = ReminderNudges.Recent()
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
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

    private var sources: ReminderNudges.Sources {
        var s = ReminderNudges.Sources()
        s.owner = { [unowned self] in self.owner }
        s.activeTheses = { [unowned self] owner in self.book.active(owner: owner) }
        s.hasReminder = { [unowned self] id in self.reminders.contains(id) }
        s.briefing = { [unowned self] in self.briefing }
        return s
    }

    private func moment(signedIn: Bool = true) -> NudgeMoment {
        NudgeMoment(signedIn: signedIn, now: clock, lastRead: nil, readsThisLaunch: 0)
    }

    private func candidate(signedIn: Bool = true) -> NucleoNudge? {
        ReminderNudges.candidate(moment(signedIn: signedIn), sources: sources, recent: recent)
    }

    @discardableResult
    private func thesis(_ symbol: String, owner: String? = "u1") throws -> SavedThesis {
        try book.create(ThesisDraft(symbol: symbol, name: symbol, isEquity: true, horizon: .months,
                                    hypothesis: "Why I am looking at \(symbol)"), owner: owner, now: clock)
    }

    private func session() -> NucleoSession {
        let profile = AgentProfile()
        profile.riskNoticeVersion = RiskNotice.currentVersion
        profile.onboarded = true
        let companions = CompanionStore(defaults: defaults)
        companions.companionId = "orb"
        return NucleoSession(fixtures: true, profile: profile, companions: companions, ledger: NucleoLedger(defaults: defaults),
                             defaults: defaults, briefingIntent: BriefingIntent(observeAccount: false),
                             reminderIntent: ReminderIntent(observeAccount: false))
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    /// The line and the button in one language, straight from the source strings.
    private func copy(_ english: String, _ spanish: String, _ language: String) -> String {
        switch language {
        case "en": return english
        case "es": return spanish
        default: return NativeTranslations.rows[english]?[language] ?? ""
        }
    }

    // MARK: The offer after a thesis

    func testTheOfferAppearsRightAfterAThesisIsWrittenAndOnlyThen() throws {
        XCTAssertNil(candidate(), "no thesis: nothing to offer")
        let nvda = try thesis("NVDA")
        let nudge = try XCTUnwrap(candidate())
        XCTAssertEqual(nudge.id, "reminders.offer." + String(nvda.id.lowercased().prefix(8)))
        XCTAssertEqual(nudge.text, ReminderCopy.offerLine)
        XCTAssertEqual(nudge.cta, ReminderCopy.offerButton)
        XCTAssertNotNil(nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        XCTAssertNotNil(candidate(signedIn: false), "reminders need no account")
        clock.addTimeInterval(29 * 60)
        XCTAssertNotNil(candidate())
        clock.addTimeInterval(2 * 60)
        XCTAssertNil(candidate(), "half an hour later the moment has passed")
    }

    func testAThesisThatAlreadyHasAReminderIsNotOffered() throws {
        let nvda = try thesis("NVDA")
        reminders = [nvda.id]
        XCTAssertNil(candidate())
        let btc = try thesis("BTC")
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(btc.id), "the fresh thesis without one is")
    }

    func testAReviewMakesAnOlderThesisFreshAgain() throws {
        let nvda = try thesis("NVDA")
        clock.addTimeInterval(9 * 86_400)
        XCTAssertNil(candidate())
        try book.recordReview(id: nvda.id, owner: "u1", price: 101, asOf: nil, verdict: "wait", supports: [], challenges: [], unknowns: [], now: clock)
        clock.addTimeInterval(5 * 60)
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(nvda.id), "the person has just seen what a review gives them")
        clock.addTimeInterval(40 * 60)
        XCTAssertNil(candidate())
    }

    func testASavedOrReviewedSignalMarksTheThesisFresh() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        clock.addTimeInterval(3 * 86_400)
        XCTAssertNil(candidate())
        recent.listen(now: { [unowned self] in self.clock })
        NotificationCenter.default.post(name: Notification.Name("V18.thesisSaved"), object: nil, userInfo: ["thesisId": nvda.id])
        await settle()
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(nvda.id))
        clock.addTimeInterval(10 * 60)
        NotificationCenter.default.post(name: Notification.Name("V18.thesisReviewed"), object: nil, userInfo: ["thesisId": btc.id.lowercased()])
        await settle()
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(btc.id), "the most recent one")
        NotificationCenter.default.post(name: Notification.Name("V18.thesisSaved"), object: nil, userInfo: ["thesisId": 7])
        NotificationCenter.default.post(name: Notification.Name("V18.thesisSaved"), object: nil, userInfo: nil)
        await settle()
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(btc.id), "a signal without a thesis id changes nothing")
        clock.addTimeInterval(31 * 60)
        XCTAssertNil(candidate())
    }

    func testOnlyAnActiveThesisOfThisReaderIsOffered() throws {
        let nvda = try thesis("NVDA")
        try thesis("BTC", owner: "someone-else")
        recent.note(UUID().uuidString, at: clock)
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(nvda.id))
        try book.archive(id: nvda.id, owner: "u1", now: clock)
        XCTAssertNil(candidate(), "an archived thesis is not reviewed")
        owner = nil
        XCTAssertNil(candidate(), "another reader's thesis is never offered")
    }

    func testTheOfferReturnsForAnotherThesisButNeverTwiceForTheSameOne() async throws {
        let nvda = try thesis("NVDA")
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        center.register(ReminderNudges.source(sources, recent: recent))
        XCTAssertEqual(center.sourceKeys, ["reminders"])
        let first = try XCTUnwrap(center.current(center.moment(signedIn: true)))
        let session = session()
        defer { session.teardown() }
        let status = await center.act(first.id, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .reminders, "the tap opens the reminders screen; iOS is asked there, by a button")
        XCTAssertEqual(V18Focus.thesisId, nvda.id, "on the thesis the offer was about")
        session.sheetDismissed()
        clock.addTimeInterval(16 * 60)
        XCTAssertNil(center.current(center.moment(signedIn: true)), "tapped once: this thesis is not offered again")
        let btc = try thesis("BTC")
        XCTAssertEqual(center.current(center.moment(signedIn: true))?.id, ReminderNudges.offerId(btc.id))
    }

    func testATapOnAnOfferWhoseThesisIsGoneStillOpensTheScreen() async throws {
        let nvda = try thesis("NVDA")
        let nudge = try XCTUnwrap(candidate())
        book.delete(id: nvda.id, owner: "u1")
        V18Focus.thesisId = "stale"
        let session = session()
        defer { session.teardown() }
        ReminderNudges.act(nudge, session: session, sources: sources)
        XCTAssertEqual(session.sheet, .reminders)
        XCTAssertNil(V18Focus.thesisId)
    }

    // MARK: The Monday briefing

    func testTheBriefingLineOnlyForAnEligibleAccountThatHasItOff() {
        typealias Offer = ReminderNudges.BriefingOffer
        XCTAssertNil(candidate(), "nothing is known about the account yet")
        briefing = Offer(eligiblePro: true, weeklyOn: false, configured: true, saving: false)
        let nudge = candidate()
        XCTAssertEqual(nudge?.id, "reminders.briefing.v1")
        XCTAssertEqual(nudge?.text, ReminderCopy.briefingLine)
        XCTAssertEqual(nudge?.cta, ReminderCopy.briefingButton)
        XCTAssertNil(candidate(signedIn: false), "the briefing belongs to an account")
        for silent in [Offer(eligiblePro: false, weeklyOn: false, configured: true, saving: false),
                       Offer(eligiblePro: nil, weeklyOn: false, configured: true, saving: false),
                       Offer(eligiblePro: true, weeklyOn: true, configured: true, saving: false),
                       Offer(eligiblePro: true, weeklyOn: nil, configured: true, saving: false),
                       Offer(eligiblePro: true, weeklyOn: false, configured: false, saving: false),
                       Offer(eligiblePro: true, weeklyOn: false, configured: true, saving: true)] {
            briefing = silent
            XCTAssertFalse(silent.shouldOffer)
            XCTAssertNil(candidate(), "\(silent)")
        }
    }

    func testTheThesisOfferSpeaksBeforeTheBriefingLine() throws {
        briefing = ReminderNudges.BriefingOffer(eligiblePro: true, weeklyOn: false, configured: true, saving: false)
        let nvda = try thesis("NVDA")
        XCTAssertEqual(candidate()?.id, ReminderNudges.offerId(nvda.id))
        reminders = [nvda.id]
        XCTAssertEqual(candidate()?.id, ReminderNudges.briefingId)
    }

    func testTheBriefingLineOpensTheBriefingSettings() async {
        briefing = ReminderNudges.BriefingOffer(eligiblePro: true, weeklyOn: false, configured: true, saving: false)
        let center = NudgeCenter(defaults: defaults)
        center.now = { [unowned self] in self.clock }
        center.register(ReminderNudges.source(sources, recent: recent))
        let nudge = center.current(center.moment(signedIn: true))
        XCTAssertEqual(nudge?.id, ReminderNudges.briefingId)
        let session = session()
        defer { session.teardown() }
        let status = await center.act(ReminderNudges.briefingId, session: session)
        XCTAssertEqual(status, "done")
        XCTAssertEqual(session.sheet, .briefingSettings)
        XCTAssertNil(V18Focus.thesisId)
        session.sheetDismissed()
        clock.addTimeInterval(30 * 86_400)
        XCTAssertNil(center.current(center.moment(signedIn: true)), "acted on once: never again")
    }

    func testTheBriefingOfferReadsOnlyWhatTheCentreAlreadyHolds() {
        let center = BriefingsCenter(observeAccount: false)
        center.auth = .none
        center.currentUser = { "u1" }
        let generation = UUID()
        center.currentGeneration = { generation }
        center.riskAccepted = { true }
        var loads = 0
        center.load = { _ in loads += 1; throw BriefingsError.unavailable }
        center.accountChanged(force: true)
        XCTAssertFalse(ReminderNudges.BriefingOffer.current(center).shouldOffer, "nothing loaded: nothing offered")
        func snapshot(weekly: Bool, eligible: Bool, configured: Bool) -> BriefingSettingsSnapshot {
            BriefingSettingsSnapshot(json: [
                "revision": 1, "weeklyEnabled": weekly, "language": "en", "assets": [String](), "eligiblePro": eligible,
                "schedules": ["timezone": "America/New_York", "weekly": ["configured": configured, "weekday": "Monday", "localTime": "08:00"]],
            ] as [String: Any])!
        }
        center.apply(snapshot(weekly: false, eligible: true, configured: true))
        XCTAssertEqual(ReminderNudges.BriefingOffer.current(center),
                       ReminderNudges.BriefingOffer(eligiblePro: true, weeklyOn: false, configured: true, saving: false))
        XCTAssertTrue(ReminderNudges.BriefingOffer.current(center).shouldOffer)
        center.apply(snapshot(weekly: true, eligible: true, configured: true))
        XCTAssertFalse(ReminderNudges.BriefingOffer.current(center).shouldOffer, "already on")
        center.apply(snapshot(weekly: false, eligible: false, configured: true))
        XCTAssertFalse(ReminderNudges.BriefingOffer.current(center).shouldOffer, "who is eligible does not change")
        center.apply(snapshot(weekly: false, eligible: true, configured: false))
        XCTAssertFalse(ReminderNudges.BriefingOffer.current(center).shouldOffer, "a switch that cannot be turned on is not advertised")
        XCTAssertEqual(loads, 0, "the nudge never fetches")
    }

    // MARK: The words

    func testTheLinesFitTheGlassInSixLanguages() {
        let lines = [("Want a reminder to review it?", "¿Quieres un recordatorio para revisarla?"),
                     ("Your Monday briefing is included", "Tu resumen del lunes está incluido")]
        let buttons = [("Remind me", "Recuérdamelo"), ("Turn it on", "Actívalo")]
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            for (english, spanish) in lines {
                let text = copy(english, spanish, language)
                XCTAssertFalse(text.isEmpty, "\(language): \(english)")
                XCTAssertLessThanOrEqual(text.count, NucleoNudge.textLimit, "\(language): \(text)")
                XCTAssertFalse(text.contains("!"), text)
            }
            for (english, spanish) in buttons {
                let text = copy(english, spanish, language)
                XCTAssertFalse(text.isEmpty, "\(language): \(english)")
                XCTAssertLessThanOrEqual(text.count, 22, "\(language): \(text)")
            }
        }
        // The same strings the source serves.
        XCTAssertEqual(L.t("Want a reminder to review it?", "¿Quieres un recordatorio para revisarla?", spanish: false), lines[0].0)
        XCTAssertEqual(L.t("Your Monday briefing is included", "Tu resumen del lunes está incluido", spanish: true), lines[1].1)
    }

    func testReminderCopyNeverSoundsLikeTheMarketWasWatched() {
        let rows = NativeTranslations18.reminders
        XCTAssertFalse(rows.isEmpty)
        // A reminder is something the person set. The lock-screen line is the one place a market
        // alert is named, to say this is not one.
        let lockScreen = "You asked me to remind you to review a thesis. This is your reminder, not a market alert."
        let intro = "A reminder is a note to yourself: on the day you choose, Bobby reminds you to review a thesis. Bobby does not watch the market for you."
        for (english, translations) in rows {
            let all = [english] + translations.values
            for text in all {
                XCTAssertFalse(text.contains("!"), text)
                for word in ["buy", "sell", "profit", "guarantee", "returns", "advice", "signal"] {
                    XCTAssertNil(text.range(of: "\\b\(word)", options: [.regularExpression, .caseInsensitive]), "\(word): \(text)")
                }
            }
            if english != lockScreen {
                XCTAssertNil(english.range(of: "alert", options: .caseInsensitive), english)
            }
            if english != intro {
                for word in ["watch", "monitor", "detect"] {
                    XCTAssertNil(english.range(of: word, options: .caseInsensitive), "\(word): \(english)")
                }
            }
            XCTAssertEqual(Set(translations.keys), ["fr", "pt", "it", "de"], english)
        }
        XCTAssertNotNil(rows[lockScreen])
        XCTAssertNotNil(rows[intro])
    }
}
