import Foundation
import UserNotifications
import XCTest
@testable import Bobby

/// The phone's notification centre as the harness tests see it: nothing here touches iOS.
@MainActor
final class FakeHarnessNotifier: HarnessNotifying {
    var permission: ReminderPermission = .notDetermined
    var grantsWhenAsked = true
    var addSucceeds = true
    var whileAsking: (() -> Void)?
    private(set) var permissionRequests = 0
    private(set) var added: [HarnessNotice] = []
    private(set) var removed: [String] = []
    private(set) var requests: [String: HarnessNotice] = [:]

    func status() async -> ReminderPermission { permission }

    func requestPermission() async -> Bool {
        permissionRequests += 1
        whileAsking?()
        permission = grantsWhenAsked ? .allowed : .denied
        return grantsWhenAsked
    }

    func add(_ notice: HarnessNotice) async -> Bool {
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

    /// iOS delivered what was due: it is no longer pending.
    func deliver(before date: Date) { requests = requests.filter { $0.value.fireAt > date } }
}

/// The harness (1.8), the phone's side: from the first question, with permission asked only on the
/// person's own yes, the plan handed to iOS, and what happens to it written back into the ledger.
@MainActor
final class HarnessCenterTests: XCTestCase {
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
    private var prices: [String: Double] = [:]
    private var quoted: [String] = []
    private var redraws = 0

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "harness.center.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        fake = FakeHarnessNotifier()
        clock = at(7, 16, 40)
        consent = .accepted
        user = nil
        prices = [:]
        quoted = []
        redraws = 0
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    /// Wednesday 7 October 2026, local time.
    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    private func make() -> HarnessCenter {
        let center = HarnessCenter(notifier: fake, defaults: defaults)
        center.now = { [unowned self] in self.clock }
        center.calendar = { [unowned self] in self.calendar }
        center.consent = { [unowned self] in self.consent }
        center.currentUser = { [unowned self] in self.user }
        center.currentGeneration = { [unowned self] in self.generation }
        center.weeklyCovered = { false }
        center.quote = { [unowned self] symbol in
            await MainActor.run { self.quoted.append(symbol); return self.prices[symbol] }
        }
        center.changed = { [unowned self] in self.redraws += 1 }
        center.load(owner: user)
        return center
    }

    private func settle() async {
        for _ in 0..<12 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    private func ask(_ center: HarnessCenter, _ symbol: String, price: Double? = 100, equity: Bool = true) async {
        center.noteAsk(symbol: symbol, name: symbol, isEquity: equity, price: price)
        await settle()
    }

    // MARK: From the first question

    func testTheFirstQuestionIsRecordedAndNothingIsScheduledOrAsked() async {
        let center = make()
        await ask(center, "NVDA")
        XCTAssertEqual(center.ledger.events(.ask).compactMap(\.symbol), ["NVDA"], "registered from the first question")
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertEqual(center.upcoming, [])
        XCTAssertEqual(fake.added, [])
        XCTAssertEqual(fake.permissionRequests, 0, "iOS is never asked before the person says yes")
        XCTAssertEqual(HarnessStore(defaults: defaults).ledger(owner: nil).events.count, 1, "it survives a relaunch")
    }

    func testNothingIsRecordedBeforeTheRiskNotice() async {
        consent = .withdrawn
        let center = make()
        await ask(center, "NVDA")
        XCTAssertTrue(center.ledger.isEmpty)
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .consentRequired)
        XCTAssertEqual(fake.permissionRequests, 0)
        XCTAssertEqual(center.mode, .undecided)
    }

    func testSayingYesAsksIOSOnceAndSchedulesTheThreeFollowUps() async throws {
        let center = make()
        await ask(center, "NVDA")
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .on)
        XCTAssertEqual(fake.permissionRequests, 1)
        XCTAssertEqual(center.mode, .on)
        XCTAssertEqual(center.upcoming.map(\.step), [.asset, .sector, .week])
        XCTAssertEqual(fake.requests.keys.sorted(), ["v18.follow.asset", "v18.follow.sector", "v18.follow.week"])
        let asset = try XCTUnwrap(fake.requests["v18.follow.asset"])
        XCTAssertEqual(asset.fireAt, at(8, 16, 40))
        XCTAssertEqual(asset.title, "Bobby")
        XCTAssertEqual(asset.userInfo["kind"] as? String, "follow-up")
        XCTAssertEqual(asset.userInfo["step"] as? String, "asset")
        XCTAssertEqual(asset.userInfo["symbol"] as? String, "NVDA")
        XCTAssertEqual(fake.requests["v18.follow.sector"]?.userInfo["sector"] as? String, "semis")
        // A second yes does not ask iOS again, and writes nothing twice.
        let writes = fake.added.count
        _ = await center.accept()
        XCTAssertEqual(fake.permissionRequests, 1)
        XCTAssertEqual(fake.added.count, writes)
    }

    func testTheLockScreenNamesTheAssetAndNoFigure() async throws {
        let center = make()
        await ask(center, "NVDA", price: 187.42)
        _ = await center.accept()
        for notice in fake.requests.values {
            XCTAssertFalse(notice.body.contains("187"), "no price on the lock screen")
            XCTAssertFalse(notice.body.contains("%"), "no figure the phone has not read")
            XCTAssertFalse(notice.body.contains("$"))
        }
        let request = try XCTUnwrap(fake.requests["v18.follow.asset"]).request()
        XCTAssertEqual(request.identifier, "v18.follow.asset")
        XCTAssertEqual(request.content.threadIdentifier, HarnessNotice.thread)
        XCTAssertNil(request.content.badge)
        XCTAssertEqual((request.trigger as? UNCalendarNotificationTrigger)?.repeats, false)
    }

    func testTheRequestIOSGetsFiresAtThePlannedMoment() throws {
        // The real trigger, three days out: iOS resolves it to the very minute the plan chose.
        let fireAt = try XCTUnwrap(calendar.date(bySettingHour: 16, minute: 40, second: 0, of: Date().addingTimeInterval(3 * 86_400)))
        let notice = HarnessNotice(id: "v18.follow.asset", title: "Bobby", body: "NVDA, a day later. See how it moved.", fireAt: fireAt,
                                   step: .asset, symbol: "NVDA", sector: nil, calendar: calendar)
        let trigger = try XCTUnwrap(notice.request().trigger as? UNCalendarNotificationTrigger)
        XCTAssertEqual(trigger.nextTriggerDate(), fireAt)
        XCTAssertEqual(HarnessTap.tap(from: notice.request().content.userInfo), HarnessTap(step: .asset, symbol: "NVDA", sector: nil),
                       "what the phone delivers is what a tap reads back")
    }

    func testWhenIOSSaysNoFollowUpsStayInsideTheApp() async {
        fake.grantsWhenAsked = false
        let center = make()
        await ask(center, "NVDA")
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .denied)
        XCTAssertEqual(center.mode, .on, "they said yes to Bobby: the glass still comes back to it")
        XCTAssertEqual(center.status, .denied)
        XCTAssertEqual(fake.added, [])
        // The day passes: nothing was shown, so nothing is written as shown.
        clock = at(9, 10)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.sent), [])
    }

    func testAnAccountSwitchWhileIOSAsksChangesNothing() async {
        let center = make()
        await ask(center, "NVDA")
        fake.whileAsking = { [unowned self] in self.generation = UUID() }
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .failed)
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertEqual(fake.added, [])
    }

    func testEveryNewQuestionMovesThePlanToThatAsset() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(7, 19)
        await ask(center, "SOL", equity: false)
        XCTAssertEqual(center.upcoming.first?.symbol, "SOL")
        XCTAssertEqual(fake.requests["v18.follow.asset"]?.fireAt, at(8, 19))
        XCTAssertEqual(fake.requests["v18.follow.sector"]?.userInfo["sector"] as? String, "layer1")
        XCTAssertEqual(fake.requests.count, 3, "one pending notification per step, replaced in place")
    }

    // MARK: What happened to a follow-up

    func testAFollowUpThatFiredIsWrittenOnceAndTheNextOnesStay() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(9, 8)                              // the asset fired yesterday at 16:40; nobody came
        fake.deliver(before: clock)
        await center.appActive()
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.sent).map(\.step), [.asset], "written once")
        XCTAssertEqual(center.ledger.events(.sent).first?.at, at(8, 16, 40))
        XCTAssertEqual(center.ledger.events(.returned), [], "sixteen hours later is not coming back for it")
        XCTAssertEqual(center.upcoming.map(\.step), [.sector, .week], "ignored: the sector at 48 hours, then Monday")
        XCTAssertEqual(fake.requests["v18.follow.sector"]?.fireAt, at(9, 16, 40))
    }

    func testTappingAFollowUpIsOneAnswerAndBringsAnotherTomorrow() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)
        fake.deliver(before: clock)
        await center.appActive()                      // back within hours: counted as coming back
        XCTAssertEqual(center.ledger.events(.returned).count, 1)
        await center.opened(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        XCTAssertEqual(center.ledger.events(.returned), [], "the tap replaces it: one answer, not two")
        XCTAssertEqual(center.ledger.events(.opened).map(\.step), [.asset])
        XCTAssertEqual(center.upcoming.first?.step, .asset)
        XCTAssertEqual(center.upcoming.first?.fireAt, at(9, 18), "they opened it: another one the next day")
        XCTAssertEqual(fake.requests["v18.follow.asset"]?.body.contains("2"), true, "two days after the question")
    }

    func testAFollowUpThatFiresWhileTheyAreInTheAppIsAnsweredWithoutABanner() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 16, 41)
        fake.deliver(before: clock)
        await center.firedInForeground(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        XCTAssertEqual(center.ledger.events(.sent).count, 1)
        XCTAssertEqual(center.ledger.events(.returned).count, 1)
        XCTAssertEqual(center.move?.symbol, "NVDA", "the glass says it instead")
    }

    func testThreeIgnoredFollowUpsAndBobbyGoesQuiet() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(13, 9)                             // Tuesday after the Monday week
        fake.deliver(before: clock)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.sent).map(\.step), [.asset, .sector, .week])
        XCTAssertEqual(center.upcoming, [])
        XCTAssertEqual(fake.requests.count, 0)
    }

    // MARK: Off, withdrawn, another reader

    func testTurningFollowUpsOffErasesAndCancels() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        await center.turnOff()
        XCTAssertEqual(center.mode, .off)
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(fake.requests.count, 0)
        XCTAssertEqual(HarnessStore(defaults: defaults).ledger(owner: nil), HarnessLedger())
        // Off means off: a new question is not written down.
        await ask(center, "TSLA")
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertNil(center.dueAsset())
        // And back on starts from nothing.
        _ = await center.accept()
        XCTAssertEqual(center.mode, .on)
        XCTAssertEqual(center.upcoming, [])
    }

    func testWithdrawingTheRiskNoticeErasesEverything() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        consent = .outdated
        await center.consentChanged()
        XCTAssertEqual(fake.requests.count, 3, "a newer notice to read withdrew nothing")
        consent = .withdrawn
        await center.consentChanged()
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertEqual(fake.requests.count, 0)
    }

    func testAnotherAccountNeverReceivesThePreviousReadersFollowUps() async {
        user = "u1"
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        XCTAssertEqual(fake.requests.count, 3)
        user = "u2"
        generation = UUID()
        await center.accountChanged()
        XCTAssertEqual(fake.requests.count, 0)
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertTrue(center.ledger.isEmpty)
        // The first reader comes back: their ledger is still theirs, and the plan is made again.
        user = "u1"
        generation = UUID()
        await center.accountChanged()
        XCTAssertEqual(center.ledger.events(.ask).compactMap(\.symbol), ["NVDA"])
        XCTAssertEqual(fake.requests.count, 3)
    }

    func testSigningInKeepsWhatThePhoneLearnedSignedOut() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        user = "u1"
        generation = UUID()
        await center.accountChanged()
        XCTAssertEqual(center.ledger.events(.ask).compactMap(\.symbol), ["NVDA"], "the first question was asked signed out")
        XCTAssertEqual(center.mode, .on)
        XCTAssertEqual(fake.requests.count, 3)
        XCTAssertEqual(HarnessStore(defaults: defaults).ledger(owner: nil), HarnessLedger(), "it moved: nothing stays under the signed-out reader")
        // Signing out does not hand the account's ledger to whoever uses the phone next.
        user = nil
        generation = UUID()
        await center.accountChanged()
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(fake.requests.count, 0)
    }

    func testDeleteEverythingForgetsTheLedgerAndCancels() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        HarnessStore(defaults: defaults).forget(owner: nil)
        await center.reloadAfterErase()
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertEqual(fake.requests.count, 0)
    }

    // MARK: The line on the glass

    func testComingBackADayLaterShowsTheMoveWithItsNumber() async {
        let center = make()
        await ask(center, "NVDA", price: 100)
        XCTAssertNil(center.dueAsset(), "they just asked: nothing to come back to yet")
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        await center.appActive()
        XCTAssertEqual(center.move?.symbol, "NVDA")
        XCTAssertEqual(center.move?.pct ?? 0, 2.3, accuracy: 0.001)
        XCTAssertEqual(center.move?.days, 1)
        XCTAssertEqual(quoted, ["NVDA"], "one quota-free read of the price")
        XCTAssertGreaterThan(redraws, 0)
        // Minutes later the price is not read again.
        clock = at(8, 17, 5)
        await center.refreshMove()
        XCTAssertEqual(quoted, ["NVDA"])
    }

    func testWithoutAPriceTheLineHasNoNumber() async {
        let center = make()
        await ask(center, "NVDA", price: nil)
        clock = at(9, 17)
        prices["NVDA"] = 50
        await center.appActive()
        XCTAssertEqual(center.move?.symbol, "NVDA")
        XCTAssertNil(center.move?.pct, "no price at the question: no number is invented")
        XCTAssertEqual(center.move?.days, 2)
    }

    func testAskingAgainOrActingOnItClearsTheLine() async {
        let center = make()
        await ask(center, "NVDA", price: 100)
        clock = at(8, 17)
        prices["NVDA"] = 99
        await center.appActive()
        XCTAssertNotNil(center.move)
        center.notePicked(symbol: "NVDA")
        XCTAssertNil(center.move)
        XCTAssertEqual(center.ledger.events(.picked).count, 1)
        await ask(center, "NVDA", price: 99)
        await center.refreshMove()
        XCTAssertNil(center.move, "they are looking at it now")
    }

    func testATappedFollowUpPutsItsAssetOnTheGlassEvenIfAnotherWasAskedLater() async {
        let center = make()
        await ask(center, "NVDA", price: 100)
        _ = await center.accept()
        clock = at(8, 12)
        await ask(center, "TSLA", price: 300)
        clock = at(9, 13)
        fake.deliver(before: clock)
        prices = ["NVDA": 110, "TSLA": 330]
        await center.opened(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        XCTAssertEqual(center.move?.symbol, "NVDA")
        XCTAssertEqual(center.move?.pct ?? 0, 10, accuracy: 0.001)
    }

    func testAnAppOpenIsWrittenAtMostEveryHalfHour() async {
        let center = make()
        await ask(center, "NVDA")
        await center.appActive()
        clock = clock.addingTimeInterval(600)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.appOpen).count, 1)
        clock = clock.addingTimeInterval(1_800)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.appOpen).count, 2)
    }
}
