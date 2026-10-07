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
    /// Runs while "iOS is writing" a request, before it answers.
    var whileAdding: ((HarnessNotice) async -> Void)?
    private(set) var permissionRequests = 0
    private(set) var added: [HarnessNotice] = []
    private(set) var removed: [String] = []
    private(set) var requests: [String: HarnessNotice] = [:]
    /// What sits on the lock screen: delivered and not yet cleared.
    private(set) var delivered: [String: HarnessNotice] = [:]

    func status() async -> ReminderPermission { permission }

    func requestPermission() async -> Bool {
        permissionRequests += 1
        whileAsking?()
        permission = grantsWhenAsked ? .allowed : .denied
        return grantsWhenAsked
    }

    func add(_ notice: HarnessNotice) async -> Bool {
        await whileAdding?(notice)
        guard addSucceeds else { return false }
        added.append(notice)
        requests[notice.id] = notice
        return true
    }

    func removeDelivered(_ ids: [String]) {
        for id in ids { delivered[id] = nil }
    }

    func remove(_ ids: [String]) {
        removed.append(contentsOf: ids)
        for id in ids { requests[id] = nil }
    }

    func pendingIds() async -> Set<String> { Set(requests.keys) }

    /// iOS delivered what was due: it is no longer pending, and it sits on the lock screen.
    func deliver(before date: Date) {
        for (id, notice) in requests where notice.fireAt <= date { delivered[id] = notice }
        requests = requests.filter { $0.value.fireAt > date }
    }
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

    func testSayingYesAsksIOSOnceAndSchedulesTheFollowUpsOfThatQuestion() async throws {
        let center = make()
        await ask(center, "NVDA")
        let outcome = await center.accept()
        XCTAssertEqual(outcome, .on)
        XCTAssertEqual(fake.permissionRequests, 1)
        XCTAssertEqual(center.mode, .on)
        XCTAssertEqual(center.upcoming.map(\.step), [.asset, .week], "the asset, then the week: no sector ships")
        XCTAssertEqual(fake.requests.keys.sorted(), ["v18.follow.asset", "v18.follow.week"])
        let asset = try XCTUnwrap(fake.requests["v18.follow.asset"])
        XCTAssertEqual(asset.fireAt, at(8, 16, 40))
        XCTAssertEqual(asset.title, "Bobby")
        XCTAssertEqual(asset.userInfo["kind"] as? String, "follow-up")
        XCTAssertEqual(asset.userInfo["step"] as? String, "asset")
        XCTAssertEqual(asset.userInfo["symbol"] as? String, "NVDA")
        XCTAssertEqual(asset.userInfo["owner"] as? String, "local", "signed out: no account to tag")
        XCTAssertEqual(asset.userInfo["at"] as? Double, at(8, 16, 40).timeIntervalSince1970)
        XCTAssertEqual(fake.requests["v18.follow.week"]?.fireAt, at(12, 16, 40))
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
                                   step: .asset, symbol: "NVDA", sector: nil, owner: HarnessCenter.ownerTag(nil), calendar: calendar)
        let trigger = try XCTUnwrap(notice.request().trigger as? UNCalendarNotificationTrigger)
        XCTAssertEqual(trigger.nextTriggerDate(), fireAt)
        XCTAssertEqual(HarnessTap.tap(from: notice.request().content.userInfo),
                       HarnessTap(step: .asset, symbol: "NVDA", sector: nil, owner: "local", stamp: fireAt),
                       "what the phone delivers is what a tap reads back: whose it is and when it was for")
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
        XCTAssertEqual(fake.requests["v18.follow.asset"]?.symbol, "SOL")
        XCTAssertEqual(fake.requests.count, 2, "one pending notification per step, replaced in place")
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
        XCTAssertEqual(center.ledger.events(.returned), [], "opening the app is not an answer")
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "ignored: the week on Monday is what is left for this question")
        XCTAssertEqual(fake.requests["v18.follow.week"]?.fireAt, at(12, 16, 40))
    }

    func testTappingAFollowUpIsWrittenDownAndBringsNothingMore() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)
        fake.deliver(before: clock)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.returned), [], "back in the app is not yet an answer")
        let before = center.upcoming
        await center.opened(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        XCTAssertEqual(center.ledger.events(.opened).map(\.step), [.asset], "the tap is kept")
        XCTAssertEqual(center.ledger.events(.returned), [], "and is not an answer")
        XCTAssertEqual(center.ledger.unansweredStreak(before: clock).count, 1)
        XCTAssertEqual(center.upcoming, before, "a tap alone restarts nothing")
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "no second follow-up about NVDA tomorrow")
        XCTAssertNil(fake.requests["v18.follow.asset"])
        XCTAssertEqual(center.move?.symbol, "NVDA", "the glass still shows what they tapped")
    }

    func testATapFollowedBySomethingUsefulIsAnAnswer() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)
        fake.deliver(before: clock)
        await center.opened(HarnessTap(step: .asset, symbol: "NVDA", sector: nil, owner: "local", stamp: at(8, 16, 40)))
        XCTAssertEqual(center.ledger.events(.returned), [])
        clock = at(8, 18, 1)
        center.notePicked(symbol: "NVDA")              // "What changed?" on the glass
        center.noteAsk(symbol: "NVDA", name: "NVDA", isEquity: true, price: 101, origin: .followUp)   // the read Bobby starts
        await settle()
        XCTAssertEqual(center.ledger.events(.returned).map(\.ref), [at(8, 16, 40)], "having tapped it does not stop it from being answered, once")
        XCTAssertEqual(center.ledger.unansweredStreak(before: clock).count, 0)
        XCTAssertEqual(center.profile.answered[.asset], 1)
    }

    func testAReadBobbyStartedIsWrittenWithItsOriginAndStartsNoChain() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)
        fake.deliver(before: clock)
        await center.appActive()
        center.notePicked(symbol: "NVDA")
        center.noteAsk(symbol: "NVDA", name: "NVDA", isEquity: true, price: 101, origin: .followUp, thread: true, horizon: .intraday)
        await settle()
        let asks = center.ledger.events(.ask)
        XCTAssertEqual(asks.map(\.origin), [nil, .followUp])
        XCTAssertNil(asks.last?.thread, "a read Bobby started is never the person's second question")
        XCTAssertEqual(center.ledger.question(before: clock)?.at, at(7, 16, 40), "the chain still belongs to what they asked")
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "an answer to the chain, never a new one")
        XCTAssertEqual(center.upcoming.first?.fireAt, at(12, 16, 40))
        XCTAssertEqual(center.ledger.events(.returned).count, 1)
        // And with no question of their own behind it, nothing is planned at all.
        let alone = HarnessCenter(notifier: FakeHarnessNotifier(), defaults: UserDefaults(suiteName: suiteName + ".alone")!)
        alone.now = { [unowned self] in self.clock }
        alone.calendar = { [unowned self] in self.calendar }
        alone.consent = { .accepted }
        alone.currentUser = { nil }
        alone.weeklyCovered = { false }
        alone.quote = { _ in nil }
        alone.load(owner: nil)
        alone.noteAsk(symbol: "TSLA", name: "TSLA", isEquity: true, price: 300, origin: .followUp)
        _ = await alone.accept()
        XCTAssertEqual(alone.upcoming, [])
        await alone.turnOff()
        UserDefaults().removePersistentDomain(forName: suiteName + ".alone")
    }

    func testSavingAReadOfTheAssetAnswersItsFollowUp() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)
        fake.deliver(before: clock)
        await center.appActive()
        center.noteSaved(symbol: "TSLA")
        XCTAssertEqual(center.ledger.events(.returned), [], "a save of something else is not")
        center.noteSaved(symbol: "NVDA")
        await settle()
        XCTAssertEqual(center.ledger.events(.returned).map(\.ref), [at(8, 16, 40)])
        XCTAssertEqual(center.ledger.events(.saved).count, 2)
    }

    func testAFollowUpThatFiresWhileTheyAreInTheAppShowsOnTheGlassWithoutABanner() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 16, 41)
        fake.deliver(before: clock)
        await center.firedInForeground(HarnessTap(step: .asset, symbol: "NVDA", sector: nil))
        XCTAssertEqual(center.ledger.events(.sent).count, 1)
        XCTAssertEqual(center.ledger.events(.returned), [], "shown is not answered")
        XCTAssertEqual(center.move?.symbol, "NVDA", "the glass says it instead")
    }

    func testActingOnAFollowUpWithoutTappingItIsAnAnswerAndOpeningTheAppIsNot() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)                              // shown at 16:40; they open the app by themselves
        fake.deliver(before: clock)
        prices["NVDA"] = 101
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.returned), [])
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "nothing answered: the plan goes on as if ignored")
        center.notePicked(symbol: "NVDA")              // "What changed?" on the glass
        await settle()
        XCTAssertEqual(center.ledger.events(.returned).map(\.ref), [at(8, 16, 40)], "that answers the follow-up they were shown")
        XCTAssertEqual(center.ledger.unansweredStreak(before: clock).count, 0)
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "answered: the question still has one follow-up left, and no new chain starts")
        XCTAssertEqual(center.upcoming.first?.fireAt, at(12, 16, 40))
        center.notePicked(symbol: "NVDA")
        XCTAssertEqual(center.ledger.events(.returned).count, 1, "one answer per follow-up")
    }

    func testAskingAboutSomethingElseDoesNotAnswerAnAssetFollowUp() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 18)
        fake.deliver(before: clock)
        await center.appActive()
        await ask(center, "BTC", equity: false)
        XCTAssertEqual(center.ledger.events(.returned), [], "a question about another asset is a new thread, not an answer")
        clock = at(8, 19)
        await ask(center, "NVDA")
        XCTAssertEqual(center.ledger.events(.returned).count, 1, "asking about that asset within a day is")
        XCTAssertEqual(center.ledger.question(before: clock)?.at, clock, "and what follows starts from the question")
    }

    func testAfterTheAssetAndTheWeekBobbyGoesQuiet() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(13, 9)                             // Tuesday after the Monday week
        fake.deliver(before: clock)
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.sent).map(\.step), [.asset, .week])
        XCTAssertEqual(center.upcoming, [])
        XCTAssertEqual(fake.requests.count, 0)
    }

    func testOpeningTheAppJustBeforeAFollowUpDoesNotCancelIt() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 16, 39).addingTimeInterval(30)   // thirty seconds before it fires
        await center.appActive()
        XCTAssertEqual(fake.requests["v18.follow.asset"]?.fireAt, at(8, 16, 40), "what iOS already holds stays")
        XCTAssertFalse(fake.removed.contains("v18.follow.asset"))
        XCTAssertEqual(center.upcoming.first?.step, .asset)
    }

    func testAFollowUpThatWasShownCountsEvenIfThePermissionIsTakenAwayAfterwards() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 16, 46)                           // shown at 16:40; notifications turned off at 16:45
        fake.deliver(before: clock)
        fake.permission = .denied
        await center.appActive()
        XCTAssertEqual(center.ledger.events(.sent).map(\.step), [.asset], "it reached the person: the limits count it")
        XCTAssertEqual(center.status, .denied)
    }

    func testATapHonouredLateIsStillOneAnswer() async {
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        clock = at(8, 17)
        fake.deliver(before: clock)
        await center.appActive()
        center.notePicked(symbol: "NVDA")              // they acted on the line before the tap was honoured
        XCTAssertEqual(center.ledger.events(.returned).count, 1)
        clock = at(8, 17, 12)                           // a sheet kept the tap waiting twelve minutes
        let tap = HarnessTap(step: .asset, symbol: "NVDA", sector: nil, owner: "local", stamp: at(8, 16, 40))
        await center.opened(tap)
        await center.opened(tap)
        XCTAssertEqual(center.ledger.events(.returned).count, 1, "the tap neither answers it a second time nor takes the answer back")
        XCTAssertEqual(center.ledger.events(.opened).count, 1)
        XCTAssertEqual(center.ledger.events(.opened).first?.ref, at(8, 16, 40))
    }

    func testAPlanThatChangesWhileIOSIsWritingNeverLeavesAStaleFollowUp() async {
        let center = make()
        await ask(center, "NVDA")
        var once = false
        fake.whileAdding = { [unowned self] _ in
            guard !once else { return }
            once = true
            // The person turns follow-ups off while the first request is still being written.
            Task { @MainActor in await center.turnOff() }
            await self.settle()
        }
        _ = await center.accept()
        await settle()
        await settle()
        XCTAssertEqual(center.mode, .off)
        XCTAssertEqual(fake.requests.count, 0, "nothing arrives after they said no")
        XCTAssertEqual(center.upcoming, [])
    }

    // MARK: When they said

    func testWhatTheySaidAboutTheirHorizonIsWrittenOnlyOnceTheySayYes() async {
        let center = make()
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100, thread: true, horizon: .week)
        clock = at(7, 16, 42)
        center.noteSaved(symbol: "NVDA", horizonHours: 168)
        await settle()
        var stored = HarnessStore(defaults: defaults).ledger(owner: nil)
        XCTAssertEqual(stored.events.map(\.kind), [.ask, .saved], "the question and the save are registered, as before")
        XCTAssertTrue(stored.events.allSatisfy { $0.horizon == nil && $0.horizonHours == nil && $0.thread == nil },
                      "undecided: nothing they said about their horizon is on the phone yet")
        XCTAssertEqual(center.ledger, stored)
        // The yes: the read that prompted it is still in memory and becomes the first whole entry.
        clock = at(7, 16, 45)
        _ = await center.accept()
        stored = HarnessStore(defaults: defaults).ledger(owner: nil)
        XCTAssertEqual(stored.events(.ask).first?.horizon, .week)
        XCTAssertEqual(stored.events(.ask).first?.thread, true)
        XCTAssertEqual(stored.events(.saved).first?.horizonHours, 168)
        XCTAssertEqual(stored.events.count, 2, "completed in place: nothing is written twice")
        XCTAssertEqual(center.upcoming.map(\.step), [.asset], "the review they chose on the save: a week from the question")
        XCTAssertEqual(center.upcoming.first?.fireAt, at(14, 16, 40))
        XCTAssertEqual(center.upcoming.first?.days, 7)
        // From here on it is written with the question.
        clock = at(7, 17)
        center.noteAsk(symbol: "TSLA", name: "Tesla", isEquity: true, price: 300, horizon: .long)
        await settle()
        XCTAssertEqual(HarnessStore(defaults: defaults).ledger(owner: nil).events(.ask).last?.horizon, .long)
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "a question about years: the week only")
    }

    func testTheYesCompletesOnlyWhatIsStillInMemory() async {
        // More than half an hour before the yes: what was held is let go.
        var center = make()
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100, horizon: .long)
        clock = at(7, 17, 11)
        _ = await center.accept()
        XCTAssertNil(center.ledger.events(.ask).first?.horizon)
        XCTAssertEqual(center.upcoming.map(\.step), [.asset, .week], "followed up as a question that named nothing")
        await center.turnOff()
        HarnessStore(defaults: defaults).forget(owner: nil)
        // A relaunch before the yes: memory is gone, and so is what was held.
        clock = at(7, 16, 40)
        center = make()
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100, horizon: .long)
        await settle()
        let relaunched = make()
        clock = at(7, 16, 45)
        _ = await relaunched.accept()
        XCTAssertNil(relaunched.ledger.events(.ask).first?.horizon)
        XCTAssertEqual(relaunched.ledger.events(.ask).count, 1)
        // Another reader's yes completes nothing of the one before.
        await relaunched.turnOff()
        HarnessStore(defaults: defaults).forget(owner: nil)
        center = make()
        center.noteAsk(symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100, horizon: .long)
        user = "u9"
        generation = UUID()
        await center.accountChanged()
        _ = await center.accept()
        XCTAssertNil(center.ledger.events(.ask).first?.horizon, "what was held for the signed-out reader went with the change of reader")
    }

    func testAThesisTimesTheFollowUpAndItsPointerFollowsTheThesis() async {
        var active: [(symbol: String, horizon: HarnessHorizon?, since: Date)] = [("nvda", .long, at(1, 9))]
        let center = make()
        center.theses = { _ in active }
        await ask(center, "NVDA")
        XCTAssertEqual(center.ledger.events(.thesis), [], "undecided: no pointer is written")
        _ = await center.accept()
        XCTAssertEqual(center.ledger.events(.thesis).map(\.symbol), ["NVDA"])
        XCTAssertEqual(center.ledger.events(.thesis).first?.horizon, .long)
        XCTAssertEqual(center.ledger.events(.thesis).first?.at, at(1, 9), "dated when the thesis was written")
        XCTAssertEqual(center.upcoming.map(\.step), [.week], "a thesis of years: nothing about the asset the next day")
        XCTAssertEqual(HarnessStore(defaults: defaults).ledger(owner: nil).events(.thesis).count, 1)
        // They change its horizon: one pointer, the new horizon.
        active = [("NVDA", .month, at(1, 9))]
        await center.replan()
        XCTAssertEqual(center.ledger.events(.thesis).map(\.horizon), [.month])
        XCTAssertEqual(center.upcoming.first?.fireAt, at(14, 16, 40))
        // Planning again writes nothing again.
        let before = center.ledger
        await center.replan()
        XCTAssertEqual(center.ledger, before)
        // They archive it: the pointer goes, and the question is followed up like any other.
        active = []
        await center.replan()
        XCTAssertEqual(center.ledger.events(.thesis), [])
        XCTAssertEqual(center.upcoming.map(\.step), [.asset, .week])
        XCTAssertEqual(center.upcoming.first?.fireAt, at(8, 16, 40))
    }

    func testTheThesisBookOfThisReaderIsWhatTheHarnessReads() async throws {
        let book = ThesisBook(defaults: defaults)
        try book.create(ThesisDraft(symbol: "NVDA", name: "NVIDIA", isEquity: true, horizon: .years, hypothesis: "Data centres keep buying."), owner: nil, now: at(1, 9))
        try book.create(ThesisDraft(symbol: "TSLA", name: "Tesla", isEquity: true, horizon: nil, hypothesis: "Storage grows."), owner: nil, now: at(2, 9))
        try book.create(ThesisDraft(symbol: "BTC", name: "Bitcoin", isEquity: false, horizon: .weeks, hypothesis: "Someone else's."), owner: "u2", now: at(2, 9))
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        let pointers = center.ledger.events(.thesis)
        XCTAssertEqual(Set(pointers.compactMap(\.symbol)), ["NVDA", "TSLA"], "this reader's active theses, and nobody else's")
        XCTAssertEqual(pointers.first { $0.symbol == "NVDA" }?.horizon, .long)
        XCTAssertNil(pointers.first { $0.symbol == "TSLA" }?.horizon, "no horizon was set on it")
        let stored = String(decoding: try XCTUnwrap(defaults.data(forKey: HarnessStore.key(HarnessStore.prefix, owner: nil))), as: UTF8.self)
        XCTAssertFalse(stored.contains("Data centres"), "a pointer: the words stay in the thesis book")
        XCTAssertFalse(stored.contains("Storage"))
        XCTAssertEqual(center.upcoming.map(\.step), [.week])
        // Archived in the book: gone from the ledger at the next plan.
        let id = try XCTUnwrap(book.activeThesis(symbol: "NVDA", owner: nil)?.id)
        try book.archive(id: id, owner: nil, now: at(7, 17))
        await center.replan()
        XCTAssertEqual(center.ledger.events(.thesis).compactMap(\.symbol), ["TSLA"])
        XCTAssertEqual(center.upcoming.map(\.step), [.asset, .week])
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
        XCTAssertEqual(fake.requests.count, 2, "a newer notice to read withdrew nothing")
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
        XCTAssertEqual(fake.requests.count, 2)
        XCTAssertEqual(fake.requests["v18.follow.asset"]?.owner, HarnessCenter.ownerTag("u1"))
        XCTAssertFalse(fake.requests["v18.follow.asset"]?.owner.contains("u1") ?? true, "a tag, never the account id")
        // One was already delivered when the next person signs in.
        clock = at(8, 17)
        fake.deliver(before: clock)
        XCTAssertEqual(fake.delivered.count, 1)
        user = "u2"
        generation = UUID()
        await center.accountChanged()
        XCTAssertEqual(fake.requests.count, 0)
        XCTAssertEqual(fake.delivered.count, 0, "what was on the lock screen goes too")
        XCTAssertEqual(center.mode, .undecided)
        XCTAssertTrue(center.ledger.isEmpty)
        // A tap on a notification planned for the first reader does nothing for the second.
        let theirs = HarnessTap(step: .asset, symbol: "NVDA", sector: nil, owner: HarnessCenter.ownerTag("u1"), stamp: at(8, 16, 40))
        XCTAssertFalse(center.accepts(theirs))
        await center.opened(theirs)
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertNil(center.move)
        // The first reader comes back: their ledger is still theirs, and the plan is made again.
        user = "u1"
        generation = UUID()
        await center.accountChanged()
        XCTAssertEqual(center.ledger.events(.ask).compactMap(\.symbol), ["NVDA"])
        XCTAssertEqual(center.ledger.events(.sent).map(\.step), [.asset], "what they were shown before leaving was written down")
        XCTAssertEqual(fake.requests.keys.sorted(), ["v18.follow.week"], "and is not sent again")
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
        XCTAssertEqual(fake.requests.count, 2)
        XCTAssertEqual(HarnessStore(defaults: defaults).ledger(owner: nil), HarnessLedger(), "it moved: nothing stays under the signed-out reader")
        // Signing out does not hand the account's ledger to whoever uses the phone next.
        user = nil
        generation = UUID()
        await center.accountChanged()
        XCTAssertTrue(center.ledger.isEmpty)
        XCTAssertEqual(fake.requests.count, 0)
    }

    func testTwoAccountChangesInARowEndOnTheReaderWhoIsThere() async {
        user = "u1"
        let center = make()
        await ask(center, "NVDA")
        _ = await center.accept()
        // u1 → u2 starts and, before it finishes, the session is already u3.
        user = "u2"; generation = UUID()
        async let first: Void = center.accountChanged()
        user = "u3"; generation = UUID()
        async let second: Void = center.accountChanged()
        _ = await (first, second)
        await settle()
        XCTAssertEqual(center.owner, "u3")
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
