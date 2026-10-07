import Foundation
import XCTest
@testable import Bobby

/// The phone's notification centre as the reminder tests see it: nothing here touches iOS.
@MainActor
final class FakeReminderNotifier: ReminderNotifying {
    var permission: ReminderPermission = .notDetermined
    /// What the person answers when iOS asks.
    var grantsWhenAsked = true
    var addSucceeds = true
    private(set) var permissionRequests = 0
    private(set) var added: [ReminderNotice] = []
    private(set) var removed: [String] = []
    private(set) var requests: [String: ReminderNotice] = [:]
    /// Runs while "iOS is asking" (an account switch in the middle of the prompt).
    var whileAsking: (() -> Void)?

    func status() async -> ReminderPermission { permission }

    func requestPermission() async -> Bool {
        permissionRequests += 1
        whileAsking?()
        permission = grantsWhenAsked ? .allowed : .denied
        return grantsWhenAsked
    }

    func add(_ notice: ReminderNotice) async -> Bool {
        guard addSucceeds else { return false }
        added.append(notice)
        requests[notice.id] = notice
        return true
    }

    func remove(_ ids: [String]) {
        removed.append(contentsOf: ids)
        for id in ids { requests[id] = nil }
    }

    func pendingIds() async -> Set<String> { Set(requests.keys) }

    /// A relaunch keeps what iOS holds and forgets what the app did.
    func forgetHistory() { added = []; removed = [] }
}

/// Thesis reminders (1.8): scheduled on the phone, one per thesis, one notification a day, permission
/// asked only when the person taps a reminder button, and gone with the thesis, the account or the consent.
@MainActor
final class ReminderCenterTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var fake: FakeReminderNotifier!
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City")!
        return c
    }()
    private var clock = Date()
    private var language = "en"
    private var risk = true
    private var user: String? = "u1"
    private var generation = UUID()

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "reminder.center.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        fake = FakeReminderNotifier()
        clock = at(2026, 10, 7, 12)
        language = "en"; risk = true; user = "u1"; generation = UUID()
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    // MARK: Helpers

    private func at(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi))!
    }

    private func center() -> ReminderCenter {
        let c = ReminderCenter(notifier: fake, defaults: defaults)
        c.now = { [unowned self] in self.clock }
        c.calendar = { [unowned self] in self.calendar }
        c.language = { [unowned self] in self.language }
        c.riskAccepted = { [unowned self] in self.risk }
        c.currentUser = { [unowned self] in self.user }
        c.currentGeneration = { [unowned self] in self.generation }
        c.activeTheses = { [unowned self] owner in self.book.active(owner: owner) }
        return c
    }

    @discardableResult
    private func thesis(_ symbol: String, name: String? = nil, owner: String? = "u1") throws -> SavedThesis {
        try book.create(ThesisDraft(symbol: symbol, name: name ?? symbol, isEquity: true, horizon: .months,
                                    hypothesis: "Margins on \(symbol) should recover as supply eases"), owner: owner, now: clock)
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    // MARK: Scheduling

    func testAPresetSchedulesOneGenericNotificationAtEighteenLocal() async throws {
        let nvda = try thesis("NVDA", name: "NVIDIA")
        let c = center()
        let outcome = await c.schedule(thesisId: nvda.id, symbol: nvda.symbol, preset: .week)
        XCTAssertEqual(outcome, .scheduled(at(2026, 10, 14, 18)))
        XCTAssertEqual(c.pending, [PendingReminder(thesisId: nvda.id, symbol: "NVDA", fireAt: at(2026, 10, 14, 18))])
        XCTAssertEqual(c.status, .allowed)
        XCTAssertEqual(fake.requests.count, 1)
        let notice = try XCTUnwrap(fake.requests["v18.thesis.\(nvda.id)"])
        XCTAssertEqual(notice.id, ReminderCenter.identifier(nvda.id))
        XCTAssertEqual(notice.title, "Bobby")
        XCTAssertEqual(notice.body, "You asked me to remind you to review a thesis. This is your reminder, not a market alert.")
        XCTAssertEqual(notice.fireAt, at(2026, 10, 14, 18))
        XCTAssertEqual(notice.userInfo["kind"] as? String, "thesis-review")
        XCTAssertEqual(notice.userInfo["thesisId"] as? String, nvda.id)
        XCTAssertEqual(notice.userInfo["thesisIds"] as? [String], [nvda.id])
        XCTAssertEqual(Set(notice.userInfo.keys), ["kind", "thesisId", "thesisIds"], "nothing else travels with the notification")
        XCTAssertEqual(notice.calendar.timeZone.identifier, "America/Mexico_City", "the person's own time zone")
    }

    func testThereIsOnePendingReminderPerThesisAndChangingItMovesIt() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .threeDays)
        let moved = await c.schedule(thesisId: nvda.id, symbol: "NVDA", at: at(2026, 11, 2, 9, 30))
        XCTAssertEqual(moved, .scheduled(at(2026, 11, 2, 9, 30)))
        XCTAssertEqual(c.pending.count, 1)
        XCTAssertEqual(c.reminder(for: nvda.id)?.fireAt, at(2026, 11, 2, 9, 30))
        XCTAssertEqual(fake.requests.count, 1, "the phone holds one request for the thesis")
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(nvda.id)]?.fireAt, at(2026, 11, 2, 9, 30))
    }

    func testAPickedTimeThatPassedIsNeverScheduledInThePast() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        clock = at(2026, 10, 7, 19)
        let outcome = await c.schedule(thesisId: nvda.id, symbol: "NVDA", at: at(2026, 10, 7, 18))
        XCTAssertEqual(outcome, .scheduled(at(2026, 10, 8, 18)), "18:00 already passed today: tomorrow")
        XCTAssertGreaterThan(try XCTUnwrap(fake.requests.values.first).fireAt, clock)
    }

    func testASecondReminderOnTheSameDayJoinsThatDaysNotification() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let spy = try thesis("SPY")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        let merged = await c.schedule(thesisId: btc.id, symbol: "BTC", at: at(2026, 10, 14, 9))
        XCTAssertEqual(merged, .scheduled(at(2026, 10, 14, 18)), "the day already has a notification: its time is kept")
        await c.schedule(thesisId: spy.id, symbol: "SPY", at: at(2026, 10, 15, 9))
        XCTAssertEqual(c.pending.map(\.thesisId), [nvda.id, btc.id, spy.id], "every thesis stays listed")
        XCTAssertEqual(c.pending.map(\.fireAt), [at(2026, 10, 14, 18), at(2026, 10, 14, 18), at(2026, 10, 15, 9)])
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(nvda.id), ReminderCenter.identifier(spy.id)],
                       "one notification per calendar day")
        let shared = try XCTUnwrap(fake.requests[ReminderCenter.identifier(nvda.id)])
        XCTAssertEqual(shared.thesisIds, [nvda.id, btc.id])
        XCTAssertEqual(shared.fireAt, at(2026, 10, 14, 18))

        // The thesis the day was filed under loses its reminder: the day's notification stays for the other.
        await c.cancel(thesisId: nvda.id)
        XCTAssertEqual(c.pending.map(\.thesisId), [btc.id, spy.id])
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(btc.id), ReminderCenter.identifier(spy.id)])
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(btc.id)]?.fireAt, at(2026, 10, 14, 18))
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(btc.id)]?.thesisIds, [btc.id])

        await c.cancel(thesisId: btc.id)
        await c.cancel(thesisId: spy.id)
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.requests.isEmpty)
        XCTAssertNil(defaults.object(forKey: ReminderCenter.storeKey), "nothing is kept once nothing is pending")
    }

    func testMovingAReminderOntoABusyDayAndAwayAgain() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .threeDays)
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .week)
        XCTAssertEqual(fake.requests.count, 2)
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .threeDays)
        XCTAssertEqual(fake.requests.count, 1)
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(nvda.id)]?.thesisIds, [nvda.id, btc.id])
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .month)
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(btc.id), ReminderCenter.identifier(nvda.id)])
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(btc.id)]?.fireAt, at(2026, 10, 10, 18))
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(nvda.id)]?.fireAt, at(2026, 11, 7, 18))
    }

    // MARK: Permission

    func testPermissionIsAskedOnlyWhenThePersonSchedulesAndOnlyOnce() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let c = center()
        await c.refresh()
        await c.reconcileNow()
        c.reconcile()
        await c.cancel(thesisId: nvda.id)
        _ = c.pending
        _ = c.hasReminder(for: nvda.id)
        await settle()
        XCTAssertEqual(fake.permissionRequests, 0, "reading, housekeeping and removing never ask")
        XCTAssertEqual(c.status, .notDetermined)

        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        XCTAssertEqual(fake.permissionRequests, 1, "the reminder button is the moment iOS asks")
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .month)
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .threeDays)
        await c.refresh()
        XCTAssertEqual(fake.permissionRequests, 1, "iOS already answered")
    }

    func testStartingTheCentreNeverAsks() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        c.start()
        await settle()
        try book.archive(id: nvda.id, owner: "u1", now: clock)
        await settle()
        XCTAssertEqual(fake.permissionRequests, 0)
        XCTAssertTrue(fake.added.isEmpty)
    }

    func testARefusalAtThePromptSchedulesNothing() async throws {
        let nvda = try thesis("NVDA")
        fake.grantsWhenAsked = false
        let c = center()
        let outcome = await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        XCTAssertEqual(outcome, .denied)
        XCTAssertEqual(c.status, .denied)
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.added.isEmpty)
        XCTAssertNil(defaults.object(forKey: ReminderCenter.storeKey))
    }

    func testNotificationsTurnedOffInSettingsScheduleNothingAndNeverAskAgain() async throws {
        let nvda = try thesis("NVDA")
        fake.permission = .denied
        let c = center()
        let outcome = await c.schedule(thesisId: nvda.id, symbol: "NVDA", at: at(2026, 10, 20, 18))
        XCTAssertEqual(outcome, .denied)
        XCTAssertEqual(fake.permissionRequests, 0, "iOS shows its prompt once; after a no the screen points at Settings")
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.added.isEmpty)
        // Allowed later in Settings: the same button works.
        fake.permission = .allowed
        let later = await c.schedule(thesisId: nvda.id, symbol: "NVDA", at: at(2026, 10, 20, 18))
        XCTAssertEqual(later, .scheduled(at(2026, 10, 20, 18)))
        XCTAssertEqual(fake.permissionRequests, 0)
    }

    func testNothingIsScheduledOrAskedBeforeTheRiskNotice() async throws {
        let nvda = try thesis("NVDA")
        risk = false
        let c = center()
        let outcome = await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        XCTAssertEqual(outcome, .consentRequired)
        XCTAssertEqual(fake.permissionRequests, 0)
        XCTAssertTrue(fake.added.isEmpty)
        XCTAssertTrue(c.pending.isEmpty)
    }

    func testOnlyAnActiveThesisOfThisReaderCanHaveAReminder() async throws {
        let nvda = try thesis("NVDA")
        let foreign = try thesis("BTC", owner: "someone-else")
        let c = center()
        let unknown = await c.schedule(thesisId: UUID().uuidString, symbol: "ETH", preset: .week)
        XCTAssertEqual(unknown, .unknownThesis)
        let others = await c.schedule(thesisId: foreign.id, symbol: "BTC", preset: .week)
        XCTAssertEqual(others, .unknownThesis)
        try book.archive(id: nvda.id, owner: "u1", now: clock)
        let archived = await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        XCTAssertEqual(archived, .unknownThesis)
        XCTAssertEqual(fake.permissionRequests, 0, "nothing to remind about: iOS is not asked")
        XCTAssertTrue(fake.added.isEmpty)
    }

    func testAnAccountSwitchWhileIosIsAskingDropsTheAnswer() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        fake.whileAsking = { [unowned self] in self.user = "u2"; self.generation = UUID() }
        let outcome = await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        XCTAssertEqual(outcome, .failed)
        XCTAssertTrue(c.pending.isEmpty, "the previous reader's tap never schedules for the next one")
        XCTAssertTrue(fake.added.isEmpty)
    }

    func testARequestIosRefusesIsNotListedAsPending() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        fake.addSucceeds = false
        let outcome = await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .month)
        XCTAssertEqual(outcome, .failed)
        XCTAssertEqual(c.pending.map(\.thesisId), [nvda.id], "what is listed is what the phone will deliver")
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(nvda.id)])
    }

    // MARK: The lock screen

    func testTheLockScreenTextNamesNoAssetInSixLanguages() async throws {
        let nvda = try thesis("NVDA", name: "NVIDIA")
        var bodies: [String: String] = [:]
        for code in ["en", "es", "fr", "pt", "it", "de"] {
            language = code
            let c = center()
            let outcome = await c.schedule(thesisId: nvda.id, symbol: "NVDA", at: at(2026, 10, 20, 18))
            XCTAssertEqual(outcome, .scheduled(at(2026, 10, 20, 18)), code)
            let notice = try XCTUnwrap(fake.requests[ReminderCenter.identifier(nvda.id)], code)
            XCTAssertEqual(notice.title, "Bobby", code)
            XCTAssertEqual(notice.body, ReminderCopy.notificationBody(language: code), code)
            for forbidden in ["NVDA", "NVIDIA", "Margins", nvda.id] {
                XCTAssertFalse(notice.body.localizedCaseInsensitiveContains(forbidden), "\(code): \(forbidden)")
                XCTAssertFalse(notice.title.localizedCaseInsensitiveContains(forbidden), "\(code): \(forbidden)")
            }
            XCTAssertNil(notice.body.rangeOfCharacter(from: .decimalDigits), "\(code): no figure on the lock screen")
            XCTAssertFalse(notice.body.contains("{"), "\(code): no unfilled placeholder")
            XCTAssertFalse(notice.body.contains("!"), code)
            bodies[code] = notice.body
            await c.cancel(thesisId: nvda.id)
        }
        XCTAssertEqual(Set(bodies.values).count, 6, "each language has its own sentence")
        XCTAssertEqual(bodies["es"], "Me pediste que te recordara revisar una tesis. Este es tu recordatorio, no una alerta de mercado.")
        XCTAssertTrue(try XCTUnwrap(bodies["fr"]).contains("thèse"))
        XCTAssertTrue(try XCTUnwrap(bodies["de"]).contains("These"))
        XCTAssertEqual(ReminderCopy.notificationBody(language: "xx"), bodies["en"], "an unknown language falls back to English")
    }

    // MARK: Housekeeping

    func testArchivingOrDeletingAThesisCancelsItsReminder() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let spy = try thesis("SPY")
        let c = center()
        c.start()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .month)
        await c.schedule(thesisId: spy.id, symbol: "SPY", preset: .threeDays)
        try book.archive(id: nvda.id, owner: "u1", now: clock)
        await settle()
        XCTAssertEqual(c.pending.map(\.thesisId), [btc.id, spy.id])
        XCTAssertNil(fake.requests[ReminderCenter.identifier(nvda.id)])
        book.delete(id: btc.id, owner: "u1")
        await settle()
        XCTAssertEqual(c.pending.map(\.thesisId), [spy.id])
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(spy.id)])
        book.deleteAll(owner: "u1")
        await settle()
        XCTAssertTrue(c.pending.isEmpty, "\"Delete everything\" takes the reminders with the theses")
        XCTAssertTrue(fake.requests.isEmpty)
    }

    func testAnotherAccountOrNoAccountCancelsEveryReminder() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .month)
        XCTAssertEqual(fake.requests.count, 2)
        // Signed out (or the account was deleted): the local book has none of these theses.
        user = nil; generation = UUID()
        await c.reconcileNow()
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.requests.isEmpty)
        XCTAssertNil(defaults.object(forKey: ReminderCenter.storeKey))

        user = "u1"; generation = UUID()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        try thesis("ETH", owner: "u2")
        user = "u2"; generation = UUID()
        await c.reconcileNow()
        XCTAssertTrue(c.pending.isEmpty, "they pointed at the previous account's theses")
        XCTAssertTrue(fake.requests.isEmpty)
    }

    func testThesesThatFollowAPersonIntoTheirNewAccountKeepTheirReminders() async throws {
        user = nil
        let local = try thesis("NVDA", owner: nil)
        let c = center()
        await c.schedule(thesisId: local.id, symbol: "NVDA", preset: .week)
        XCTAssertEqual(c.pending.count, 1, "reminders need no account")
        // The person creates their account: the session moves the thesis into it, same id.
        XCTAssertEqual(book.adoptLocal(into: "new-user"), 1)
        user = "new-user"; generation = UUID()
        await c.reconcileNow()
        XCTAssertEqual(c.pending.map(\.thesisId), [local.id])
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(local.id)])
    }

    func testWithdrawingConsentCancelsEveryReminder() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        risk = false
        await c.reconcileNow()
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.requests.isEmpty)
        XCTAssertTrue(fake.removed.contains(ReminderCenter.identifier(nvda.id)))
        // Accepting again does not bring them back: the person sets a new one.
        risk = true
        await c.refresh()
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.requests.isEmpty)
    }

    func testTheCentreNoticesAWithdrawnConsentByItself() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        c.start()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        risk = false
        // The risk notice lives in the defaults: any write there makes the centre look.
        NotificationCenter.default.post(name: UserDefaults.didChangeNotification, object: UserDefaults.standard)
        await settle()
        XCTAssertTrue(c.pending.isEmpty)
        XCTAssertTrue(fake.requests.isEmpty)
    }

    func testADeliveredReminderIsNoLongerPending() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .threeDays)
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .month)
        clock = at(2026, 10, 10, 18, 1)
        fake.remove([ReminderCenter.identifier(nvda.id)])   // iOS delivered it
        fake.forgetHistory()
        await c.refresh()
        XCTAssertEqual(c.pending.map(\.thesisId), [btc.id])
        XCTAssertFalse(c.hasReminder(for: nvda.id))
        XCTAssertTrue(fake.added.isEmpty, "a delivered reminder is never written again")
    }

    func testAMomentThatPassedIsNeverHandedToIos() async throws {
        let nvda = try thesis("NVDA")
        let btc = try thesis("BTC")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .threeDays)
        await c.schedule(thesisId: btc.id, symbol: "BTC", preset: .month)
        clock = at(2026, 10, 10, 18, 0).addingTimeInterval(5)
        fake.remove([ReminderCenter.identifier(nvda.id)])   // iOS delivered it; the list has not been read yet
        fake.forgetHistory()
        await c.cancel(thesisId: btc.id)
        XCTAssertTrue(fake.added.isEmpty, "removing another reminder never writes the delivered one again")
        XCTAssertTrue(fake.requests.isEmpty)
    }

    func testRemindersSurviveARelaunchWithoutAsking() async throws {
        let nvda = try thesis("NVDA")
        let first = center()
        await first.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        fake.forgetHistory()
        let relaunched = center()
        XCTAssertEqual(relaunched.pending, [PendingReminder(thesisId: nvda.id, symbol: "NVDA", fireAt: at(2026, 10, 14, 18))])
        await relaunched.refresh()
        XCTAssertEqual(fake.permissionRequests, 1, "only the first tap asked")
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(nvda.id)])
        XCTAssertEqual(fake.requests[ReminderCenter.identifier(nvda.id)]?.fireAt, at(2026, 10, 14, 18))
    }

    func testARequestThePhoneLostIsWrittenAgainOnlyWhileAllowed() async throws {
        let nvda = try thesis("NVDA")
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        // A restored phone keeps the app's list but not iOS's pending requests.
        fake.remove([ReminderCenter.identifier(nvda.id)])
        fake.permission = .denied
        fake.forgetHistory()
        await c.refresh()
        XCTAssertTrue(fake.added.isEmpty, "notifications are off: nothing is written, the screen says why")
        XCTAssertEqual(c.status, .denied)
        XCTAssertEqual(c.pending.count, 1)
        fake.permission = .allowed
        await c.refresh()
        XCTAssertEqual(Set(fake.requests.keys), [ReminderCenter.identifier(nvda.id)])
        XCTAssertEqual(fake.permissionRequests, 1)
    }

    func testANotificationOfAnotherKindIsNeverTouched() async throws {
        let nvda = try thesis("NVDA")
        let foreign = ReminderNotice(id: "brief-123", title: "Bobby", body: "x", fireAt: at(2026, 10, 9, 8), thesisId: "x",
                                     thesisIds: ["x"], calendar: calendar)
        fake.permission = .allowed
        _ = await fake.add(foreign)
        let c = center()
        await c.schedule(thesisId: nvda.id, symbol: "NVDA", preset: .week)
        await c.cancel(thesisId: nvda.id)
        await c.refresh()
        XCTAssertEqual(Set(fake.requests.keys), ["brief-123"], "only requests under v18.thesis. belong to reminders")
    }

    // MARK: The plan

    func testThePlanFilesEachDayUnderItsFirstThesis() {
        let a = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", b = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB", d = "DDDDDDDD-DDDD-4DDD-8DDD-DDDDDDDDDDDD"
        let plan = ReminderCenter.plan([
            PendingReminder(thesisId: a, symbol: "NVDA", fireAt: at(2026, 10, 14, 18)),
            PendingReminder(thesisId: d, symbol: "SPY", fireAt: at(2026, 10, 15, 0, 5)),
            PendingReminder(thesisId: b, symbol: "BTC", fireAt: at(2026, 10, 14, 18)),
        ], calendar: calendar, language: "en")
        XCTAssertEqual(plan.map(\.id), ["v18.thesis.\(a)", "v18.thesis.\(d)"])
        XCTAssertEqual(plan.map(\.thesisIds), [[a, b], [d]])
        XCTAssertTrue(ReminderCenter.plan([], calendar: calendar, language: "en").isEmpty)
    }
}
