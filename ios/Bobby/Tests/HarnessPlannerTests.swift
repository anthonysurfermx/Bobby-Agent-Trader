import Foundation
import XCTest
@testable import Bobby

/// The harness (1.8), the plan. Follow-ups belong to an own question or an explicit contextual choice: the
/// asset when they said they would look again (the next day at the soonest), the week on Monday,
/// then silence until they ask again. A tap answers nothing; an answer never starts a chain; ignoring
/// follow-ups makes Bobby quieter. Everything is a pure function of the ledger and the clock.
/// The same rules, as data for every platform: shared/harness/planner-golden.json (HarnessGoldenTests).
final class HarnessPlannerTests: XCTestCase {
    func testAnExplicitFollowUpChoiceAnchorsAtItsYesWithoutClaimingAnOwnQuestion() {
        let readAt = at(7, 15), requestedAt = at(7, 18)
        ledger.note(HarnessEvent(kind: .ask, at: readAt, symbol: "NVDA", origin: .followUp,
                                 horizon: .long, followUpRequestedAt: requestedAt))
        let followUps = plan(at(7, 18, 1))
        XCTAssertEqual(followUps.map(\.step), [.asset, .week])
        XCTAssertEqual(followUps.first?.fireAt, at(8, 18))
        XCTAssertEqual(followUps.first?.symbol, "NVDA")
        XCTAssertEqual(followUps.last?.others, 0)
        XCTAssertNil(ledger.question(before: at(7, 18, 1)))
        XCTAssertEqual(ledger.followUpAssets(since: at(7, 0), now: at(7, 18, 1)).first?.asks, 0)
    }

    func testAnUnrequestedOrFutureBobbyReadStartsNoPlan() {
        ledger.note(HarnessEvent(kind: .ask, at: at(7, 15), symbol: "NVDA", origin: .followUp))
        XCTAssertTrue(plan(at(7, 18)).isEmpty)
        ledger.note(HarnessEvent(kind: .ask, at: at(7, 16), symbol: "BTC", origin: .followUp, followUpRequestedAt: at(7, 19)))
        XCTAssertTrue(plan(at(7, 18)).isEmpty)
    }

    func testTheOptionalSectorUsesTheOwnAnchorWhenBobbysLatestReadHasNoSector() {
        ask("NVDA", at(7, 15))
        ask("BTC", at(7, 16), equity: false, origin: .followUp)
        let current = plan(at(7, 16, 1), withSector)
        XCTAssertEqual(current.map(\.step), [.asset, .sector, .week])
        XCTAssertEqual(current.map(\.symbol), ["NVDA", "NVDA", "NVDA"])
        XCTAssertEqual(current.first { $0.step == .sector }?.sector, HarnessSectors.sector(of: "NVDA")?.id)
        XCTAssertEqual(current.last?.others, 0)
        XCTAssertLessThanOrEqual(current.count, withSector.maxPerQuestion)
        XCTAssertLessThanOrEqual(current.count, withSector.maxPerWeek)
        XCTAssertTrue(current.allSatisfy { $0.fireAt > at(7, 16, 1) })
    }
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City")!
        return c
    }()
    private var ledger = HarnessLedger()
    /// The two chains, each named: these tests are about the rules of a chain, whichever one ships.
    /// What ships is stated once, in `testTheChainIsData` (and in the golden file's `defaults`).
    private let assetThenWeek = HarnessPlanner.Options(.assetThenWeek)
    private let withSector = HarnessPlanner.Options(.withSector)

    /// October 2026, local time. The 6th is a Tuesday, the 12th a Monday.
    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    private func ask(_ symbol: String, _ date: Date, price: Double? = 100, equity: Bool = true, origin: HarnessEvent.Origin? = nil,
                     thread: Bool? = nil, horizon: HarnessHorizon? = nil) {
        ledger.note(HarnessEvent(kind: .ask, at: date, symbol: symbol, name: symbol, isEquity: equity, price: price,
                                 origin: origin, thread: thread, horizon: horizon))
    }

    private func sent(_ step: HarnessStep, _ date: Date, symbol: String? = "NVDA", sector: String? = nil) {
        ledger.note(HarnessEvent(kind: .sent, at: date, symbol: symbol, step: step, sector: sector))
    }

    /// A tap on the notification.
    private func opened(_ step: HarnessStep, _ date: Date, symbol: String? = "NVDA", sector: String? = nil) {
        ledger.note(HarnessEvent(kind: .opened, at: date, symbol: symbol, step: step, sector: sector))
    }

    /// Something useful done with the follow-up: the only answer.
    private func answered(_ step: HarnessStep, _ date: Date, symbol: String? = "NVDA", sector: String? = nil) {
        ledger.note(HarnessEvent(kind: .returned, at: date, symbol: symbol, step: step, sector: sector))
    }

    private func plan(_ now: Date, _ options: HarnessPlanner.Options? = nil, weeklyCovered: Bool = false) -> [HarnessFollowUp] {
        var options = options ?? assetThenWeek
        options.weeklyCovered = weeklyCovered
        return HarnessPlanner.plan(ledger: ledger, now: now, calendar: calendar, options: options)
    }

    // MARK: The first question

    func testNothingIsPlannedBeforeAnyQuestion() {
        XCTAssertEqual(plan(at(7, 12)), [])
        ledger.note(HarnessEvent(kind: .appOpen, at: at(7, 12)))
        XCTAssertEqual(plan(at(7, 13)), [], "opening the app is not a question")
    }

    func testOneQuestionPlansTheAssetAndTheWeek() {
        ask("NVDA", at(7, 16, 40))
        let steps = plan(at(7, 16, 41))
        XCTAssertEqual(steps.map(\.step), [.asset, .week], "the chain that ships has no sector")
        XCTAssertEqual(steps[0].fireAt, at(8, 16, 40), "the next day, at the time they asked")
        XCTAssertEqual(steps[0].symbol, "NVDA")
        XCTAssertEqual(steps[0].days, 1)
        XCTAssertEqual(steps[1].fireAt, at(12, 16, 40), "the week on the next Monday")
        XCTAssertEqual(calendar.component(.weekday, from: steps[1].fireAt), 2)
        XCTAssertEqual(steps[1].others, 0)
    }

    func testFollowUpsStayInsideWakingHours() {
        ask("NVDA", at(7, 23, 30))
        XCTAssertEqual(plan(at(7, 23, 31)).first?.fireAt, at(8, 21, 0), "a late question is followed up at nine in the evening")
        ledger = HarnessLedger()
        ask("NVDA", at(7, 2, 10))
        XCTAssertEqual(plan(at(7, 2, 11)).first?.fireAt, at(8, 9, 0), "a night question at nine in the morning")
    }

    func testTheWeekCountsItsAssetsAndNamesTheOneThatMattersMost() {
        ask("BTC", at(5, 10), equity: false)
        ask("TSLA", at(6, 10))
        ask("NVDA", at(7, 10))
        var week = plan(at(7, 10, 1)).last
        XCTAssertEqual(week?.step, .week)
        XCTAssertEqual(week?.symbol, "NVDA", "each asked once: the latest")
        XCTAssertEqual(week?.others, 2)
        // A thesis about one of them: that is the one the week is about.
        ledger.note(HarnessEvent(kind: .thesis, at: at(1, 9), symbol: "BTC"))
        week = plan(at(7, 10, 1)).last
        XCTAssertEqual(week?.symbol, "BTC")
        XCTAssertEqual(week?.isEquity, false)
        XCTAssertEqual(week?.others, 2)
    }

    func testAWeekHoldsOnlyWhatWasAskedSinceTheMondayBeforeIt() {
        ask("AAPL", at(4, 10))                       // Sunday
        ask("NVDA", at(5, 8))                        // Monday, before nine
        let week = plan(at(5, 8, 1)).last
        XCTAssertEqual(week?.fireAt, at(12, 9), "a Monday question is in the week that arrives seven days later")
        XCTAssertEqual(week?.symbol, "NVDA")
        XCTAssertEqual(week?.others, 0, "Sunday belongs to the week before")
        XCTAssertEqual(HarnessPlanner.weekStart(of: at(12, 9), calendar: calendar), at(5, 0))
    }

    func testATappedWeekOpensTheWeekItWasPlannedFor() throws {
        ask("TSLA", at(4, 10))                       // Sunday: the week before
        ask("NVDA", at(5, 8))                        // Monday
        let week = try XCTUnwrap(plan(at(5, 8, 1)).last)
        XCTAssertEqual(week.fireAt, at(12, 9))
        // They tap it that evening, and again two days late: what the notification named is on the board,
        // though it was asked more than seven days before the tap.
        let tap = HarnessTap(step: .week, symbol: week.symbol, sector: nil, owner: "local", stamp: week.fireAt)
        XCTAssertEqual(HarnessBoard.make(for: tap, ledger: ledger, now: at(12, 20), calendar: calendar).rows.map(\.symbol), ["NVDA"])
        XCTAssertEqual(HarnessBoard.make(for: tap, ledger: ledger, now: at(14, 20), calendar: calendar).rows.map(\.symbol), ["NVDA"])
        // Opened from Reminders, with no follow-up behind it: the last seven days, as before.
        XCTAssertEqual(HarnessBoard.make(for: nil, ledger: ledger, now: at(12, 20), calendar: calendar).rows, [])
        XCTAssertEqual(HarnessBoard.make(for: nil, ledger: ledger, now: at(10, 20), calendar: calendar).rows.map(\.symbol), ["NVDA", "TSLA"])
    }

    func testAQuestionOnSundayGetsTheAssetAndNoWeek() {
        ask("NVDA", at(11, 12))                      // Sunday
        let steps = plan(at(11, 12, 1))
        XCTAssertEqual(steps.map(\.fireAt), [at(12, 12)], "Monday is taken by the asset, and by the Monday after it is not their week any more")
        XCTAssertEqual(plan(at(11, 12, 1), withSector).map(\.fireAt), [at(12, 12), at(13, 12)])
    }

    func testOnePendingNotificationPerStep() {
        ask("NVDA", at(7, 16))
        XCTAssertEqual(plan(at(7, 16, 1)).map(\.id), ["v18.follow.asset", "v18.follow.week"])
        XCTAssertEqual(plan(at(7, 16, 1), withSector).map(\.id), ["v18.follow.asset", "v18.follow.sector", "v18.follow.week"])
    }

    // MARK: Only a real answer is an answer

    func testATapOnTheNotificationChangesNothing() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        let untouched = plan(at(8, 18, 31))
        opened(.asset, at(8, 18, 30))
        let steps = plan(at(8, 18, 31))
        XCTAssertEqual(steps, untouched, "tapped or not, the plan is the same")
        XCTAssertEqual(steps.map(\.step), [.week], "no second follow-up about the asset tomorrow")
        XCTAssertEqual(steps.first?.fireAt, at(12, 16), "and the chain keeps the hour of the question, not of the tap")
        XCTAssertEqual(ledger.unansweredStreak(before: at(8, 19)).count, 1, "tapped is not answered")
    }

    func testAnAnswerEndsTheStreakAndStartsNoChain() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        answered(.asset, at(8, 19))
        XCTAssertEqual(ledger.unansweredStreak(before: at(8, 19, 1)).count, 0)
        let steps = plan(at(8, 19, 1))
        XCTAssertEqual(steps.map(\.step), [.week], "answered: still one follow-up left for this question, the week")
        XCTAssertEqual(steps.first?.fireAt, at(12, 16))
    }

    func testAfterAnAnswerThereIsNoSecondFollowUpAboutAnAsset() {
        ask("BTC", at(5, 10), equity: false)
        ask("TSLA", at(6, 10)); ask("TSLA", at(6, 11)); ask("TSLA", at(6, 12))
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        answered(.asset, at(8, 17))
        let steps = plan(at(8, 17, 1))
        XCTAssertFalse(steps.contains { $0.step == .asset }, "the first build went on to the next asset the day after: no more")
        XCTAssertEqual(steps.map(\.step), [.week])
        XCTAssertEqual(steps.first?.symbol, "TSLA", "asked about three times: the week is about what matters most to them")
    }

    func testThreeTappedAndNeverAnsweredIsQuiet() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12)); opened(.asset, at(2, 12, 5))
        sent(.week, at(5, 12)); opened(.week, at(5, 12, 10))
        ask("TSLA", at(6, 12))
        sent(.asset, at(7, 12), symbol: "TSLA"); opened(.asset, at(7, 12, 1), symbol: "TSLA")
        ask("AAPL", at(8, 12))
        XCTAssertEqual(ledger.unansweredStreak(before: at(8, 12, 1)).count, 3)
        XCTAssertEqual(plan(at(8, 12, 1)), [], "the most reactive person is not the one who gets the most")
        XCTAssertFalse(HarnessLegacyRules.plan(ledger: ledger, now: at(8, 12, 1), calendar: calendar).isEmpty, "the first build kept going")
    }

    func testAKindWhoseLastTwoShowingsWentUnansweredRests() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12))                                             // ignored
        sent(.week, at(5, 12)); answered(.week, at(5, 14))
        ask("TSLA", at(6, 12))
        sent(.asset, at(7, 12), symbol: "TSLA"); opened(.asset, at(7, 12, 30), symbol: "TSLA")    // tapped, and nothing else
        ask("AAPL", at(8, 12))
        let steps = plan(at(8, 12, 1))
        XCTAssertFalse(steps.contains { $0.step == .asset }, "two asset follow-ups in a row went unanswered")
        XCTAssertEqual(steps.map(\.step), [.week], "a kind they do answer still comes")
    }

    func testAnOlderAnswerDoesNotKeepAKindAlive() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12)); answered(.asset, at(2, 13))                // answered once, long before
        sent(.asset, at(4, 14))                                             // ignored
        sent(.week, at(5, 14)); answered(.week, at(5, 15), symbol: nil)
        sent(.asset, at(6, 15))                                             // ignored
        ask("AAPL", at(7, 12))
        XCTAssertFalse(plan(at(7, 12, 1)).contains { $0.step == .asset }, "the last two were ignored, whatever happened before them")
    }

    func testThreeInARowUnansweredAndNothingComesForTwoWeeksWhateverIsAsked() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12))
        ask("TSLA", at(2, 19))
        sent(.asset, at(3, 19), symbol: "TSLA")
        ask("SOL", at(3, 20), equity: false)
        sent(.week, at(5, 20), symbol: "SOL")
        XCTAssertEqual(plan(at(5, 21)), [], "three shown, none answered")
        ask("AAPL", at(9, 12))
        XCTAssertEqual(plan(at(9, 12, 1)), [], "a new question does not restart it inside the two weeks")
        ask("AAPL", at(20, 12))
        XCTAssertEqual(plan(at(20, 12, 1)).map(\.step), [.week], "two weeks after the last one a question is followed up again; the asset kind still rests")
    }

    func testNeverMoreThanFourInAWeek() {
        ask("NVDA", at(5, 12))
        for day in 6...9 { sent(.asset, at(day, 12)); answered(.asset, at(day, 13)) }
        ask("TSLA", at(9, 13, 30))
        XCTAssertEqual(plan(at(9, 13, 31)), [], "four were shown in the last seven days: the new question gets nothing inside them")
        ledger = HarnessLedger()
        ask("NVDA", at(5, 12))
        for day in 6...9 { sent(.asset, at(day, 12)); answered(.asset, at(day, 13)) }
        ask("TSLA", at(12, 13, 30))
        XCTAssertEqual(plan(at(12, 13, 31)).map(\.fireAt), [at(13, 13), at(19, 13)], "once one of the four has left the seven days")
    }

    func testTheHourTheyAnswerAtIsLearnedFromAnswersNotFromTaps() {
        ask("NVDA", at(1, 22))
        // Four taps in the evening, three answers at eight in the morning.
        for day in 2...5 { ledger.note(HarnessEvent(kind: .opened, at: at(day, 21, 5), symbol: "NVDA", step: .asset)) }
        ledger.note(HarnessEvent(kind: .returned, at: at(6, 8, 40), symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .returned, at: at(7, 8, 5), symbol: "NVDA", step: .week))
        XCTAssertNil(HarnessProfile.make(ledger, now: at(8, 8), calendar: calendar).hour, "two answers are not enough, however many taps")
        ledger.note(HarnessEvent(kind: .returned, at: at(8, 8, 50), symbol: "NVDA", step: .asset))
        let profile = HarnessProfile.make(ledger, now: at(8, 9), calendar: calendar)
        XCTAssertEqual(profile.hour, 8, "three answers at eight")
        ask("TSLA", at(8, 23))
        XCTAssertEqual(plan(at(8, 23, 1)).first?.fireAt, at(10, 9), "their hour, inside waking hours, and never sooner than 18 hours")
    }

    // MARK: The chain belongs to a question the person asked

    func testAnIgnoredAssetIsFollowedByTheWeekThenSilence() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        XCTAssertEqual(plan(at(8, 20)).map(\.step), [.week])
        XCTAssertEqual(plan(at(8, 20)).first?.fireAt, at(12, 16))
        sent(.week, at(12, 16))
        XCTAssertEqual(plan(at(12, 17)), [], "two for one question: Bobby goes quiet")
        XCTAssertEqual(plan(at(20, 9)), [], "and stays quiet")
    }

    func testOneQuestionNeverGetsMoreThanItsShareWhateverIsAnswered() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16)); opened(.asset, at(8, 16, 5)); answered(.asset, at(8, 16, 6))
        sent(.week, at(12, 16)); opened(.week, at(12, 16, 5)); answered(.week, at(12, 16, 6))
        // They did everything a person can do with a follow-up, short of asking again.
        ask("NVDA", at(12, 16, 7), origin: .followUp)
        ledger.note(HarnessEvent(kind: .picked, at: at(12, 16, 7), symbol: "NVDA"))
        ledger.note(HarnessEvent(kind: .saved, at: at(12, 16, 9), symbol: "NVDA"))
        for day in 12...20 { XCTAssertEqual(plan(at(day, 17)), [], "day \(day)") }
        XCTAssertEqual(plan(at(12, 17), withSector), [], "the sector is not a way round it: it comes the day after the asset or not at all")
        // Until they ask again, by themselves.
        ask("NVDA", at(13, 10))
        XCTAssertEqual(plan(at(13, 10, 1)).map(\.step), [.asset, .week])
    }

    func testAReadBobbyStartedIsNeverAQuestion() {
        ask("NVDA", at(7, 16), origin: .followUp)
        XCTAssertEqual(plan(at(7, 16, 1)), [], "nothing is planned from Bobby's own question")
        XCTAssertNil(ledger.question(before: at(7, 17)))
        ledger = HarnessLedger()
        ask("NVDA", at(7, 16))
        let before = plan(at(7, 18, 1))
        ask("NVDA", at(7, 18), origin: .followUp)
        XCTAssertEqual(plan(at(7, 18, 1)), before, "and it does not move the chain of the question before it")
        XCTAssertEqual(before.first?.fireAt, at(8, 16))
        // A read Bobby started about something else (a row of a board) changes whose turn it is no more.
        ask("TSLA", at(7, 19), origin: .followUp)
        XCTAssertEqual(plan(at(7, 19, 1)).first?.symbol, "NVDA")
    }

    func testANewQuestionStartsAgainFromThatAsset() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        ask("SOL", at(8, 20), equity: false)
        let steps = plan(at(8, 20, 1))
        XCTAssertEqual(steps.map(\.step), [.asset, .week])
        XCTAssertEqual(steps[0].symbol, "SOL")
        XCTAssertEqual(steps[0].fireAt, at(9, 20))
        // One follow-up already went unanswered: with the sector the new question gets the asset and its
        // sector, and not the week, which would be a fourth in a row that nobody answered.
        XCTAssertEqual(plan(at(8, 20, 1), withSector).map(\.sector), [nil, "layer1"])
        XCTAssertEqual(plan(at(8, 20, 1), withSector).map(\.step), [.asset, .sector])
    }

    func testASecondQuestionOfTheirOwnAboutTheSameReadIsAQuestion() {
        ask("NVDA", at(7, 16))
        ask("NVDA", at(7, 16, 20), thread: true)
        XCTAssertEqual(plan(at(7, 16, 21)).first?.fireAt, at(8, 16, 20))
    }

    func testTheChainIsData() {
        ask("NVDA", at(7, 16))
        // What ships: the owner's choice is one line, `HarnessChain.shipped`, and every default follows it.
        XCTAssertEqual(HarnessChain.shipped, .assetThenWeek)
        var options = HarnessPlanner.Options()
        XCTAssertEqual(options.chain, HarnessChain.shipped.steps)
        XCTAssertEqual(options.maxPerQuestion, HarnessChain.shipped.maxPerQuestion)
        XCTAssertEqual(plan(at(7, 16, 1), options), plan(at(7, 16, 1), HarnessPlanner.Options(HarnessChain.shipped)))
        XCTAssertEqual(assetThenWeek.chain, [.asset, .week])
        XCTAssertEqual(assetThenWeek.maxPerQuestion, 2)
        XCTAssertEqual(withSector.chain, [.asset, .sector, .week])
        XCTAssertEqual(withSector.maxPerQuestion, 3)
        options = assetThenWeek
        options.chain = [.week]
        XCTAssertEqual(plan(at(7, 16, 1), options).map(\.step), [.week])
        options.chain = [.asset, .asset, .week, .asset]
        XCTAssertEqual(plan(at(7, 16, 1), options).map(\.step), [.asset, .week], "a step comes once per question")
        options.maxPerQuestion = 1
        XCTAssertEqual(plan(at(7, 16, 1), options).map(\.step), [.asset])
        options.maxPerQuestion = 0
        XCTAssertEqual(plan(at(7, 16, 1), options), [])
        options = withSector
        options.maxPerQuestion = 2
        XCTAssertEqual(plan(at(7, 16, 1), options).map(\.step), [.asset, .sector], "the cap wins over the chain")
    }

    // MARK: It comes back when they said

    func testTheFirstFollowUpWaitsForTheHorizonTheQuestionNamed() {
        // Tuesday 6 October, 14:10.
        let expected: [(HarnessHorizon?, [Date], Int?)] = [
            (nil, [at(7, 14, 10), at(12, 14, 10)], 1),
            (.unspecified, [at(7, 14, 10), at(12, 14, 10)], 1),
            (.intraday, [at(7, 14, 10), at(12, 14, 10)], 1),
            (.week, [at(9, 14, 10), at(12, 14, 10)], 3),
            (.month, [at(13, 14, 10)], 7),
            (.long, [at(12, 14, 10)], nil),
        ]
        for (horizon, moments, days) in expected {
            ledger = HarnessLedger()
            ask("NVDA", at(6, 14, 10), horizon: horizon)
            let steps = plan(at(6, 14, 12))
            XCTAssertEqual(steps.map(\.fireAt), moments, "\(horizon?.rawValue ?? "none")")
            XCTAssertEqual(steps.first { $0.step == .asset }?.days, days, "\(horizon?.rawValue ?? "none")")
        }
        // Years: the week, and nothing about the asset under either chain.
        XCTAssertEqual(plan(at(6, 14, 12)).map(\.step), [.week])
        XCTAssertEqual(plan(at(6, 14, 12), withSector).map(\.step), [.week])
    }

    func testWhatTheySaidOutranksWhatTheQuestionNamed() {
        let question = at(6, 14, 10), now = at(6, 14, 20)
        func wait() -> HarnessPlanner.Wait { HarnessPlanner.wait(for: ledger.question(before: now)!, in: ledger, now: now) }
        ask("NVDA", question, horizon: .week)
        XCTAssertEqual(wait(), .init(days: 3, source: .named))
        // The review they chose when saving the read.
        ledger.note(HarnessEvent(kind: .saved, at: at(6, 14, 15), symbol: "NVDA", horizonHours: 168))
        XCTAssertEqual(wait(), .init(days: 7, source: .saved))
        XCTAssertEqual(plan(now).map(\.fireAt), [at(13, 14, 10)], "a week from the question, and by then no week of theirs")
        // A thesis they wrote about it.
        ledger.note(HarnessEvent(kind: .thesis, at: at(6, 14, 18), symbol: "NVDA", horizon: .long))
        XCTAssertEqual(wait(), .init(days: nil, source: .thesis))
        XCTAssertEqual(plan(now).map(\.step), [.week])
        // Each on its own asset only.
        ask("TSLA", at(6, 14, 19))
        XCTAssertEqual(wait(), .init(days: 1, source: .standard))
    }

    func testASaveSaysSomethingOnlyWhenItLengthensTheWait() {
        let now = at(6, 14, 20)
        func wait() -> HarnessPlanner.Wait { HarnessPlanner.wait(for: ledger.question(before: now)!, in: ledger, now: now) }
        ask("NVDA", at(6, 14, 10), horizon: .month)
        ledger.note(HarnessEvent(kind: .saved, at: at(6, 14, 15), symbol: "NVDA", horizonHours: 24))
        XCTAssertEqual(wait(), .init(days: 7, source: .named), "24 hours is where the picker starts: it does not shorten the month they named")
        ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: at(5, 9), symbol: "NVDA"))
        ledger.note(HarnessEvent(kind: .saved, at: at(5, 9, 5), symbol: "NVDA", horizonHours: 168))
        ask("NVDA", at(6, 14, 10))
        XCTAssertEqual(wait(), .init(days: 1, source: .standard), "a save from before the question is about another read")
        ledger.note(HarnessEvent(kind: .saved, at: at(6, 14, 15), symbol: "NVDA", horizonHours: 72))
        XCTAssertEqual(wait(), .init(days: 3, source: .saved))
        XCTAssertEqual(plan(now).map(\.fireAt), [at(9, 14, 10), at(12, 14, 10)])
    }

    func testAHorizonNeverBringsAFollowUpSoonerThanTheNextDay() {
        // Every hour of the day, every horizon, every way of stating it.
        for hour in 0..<24 {
            for horizon in HarnessHorizon.allCases {
                for source in 0..<3 {
                    ledger = HarnessLedger()
                    let question = at(6, hour, 10)
                    switch source {
                    case 0: ask("NVDA", question, horizon: horizon)
                    case 1:
                        ask("NVDA", question)
                        ledger.note(HarnessEvent(kind: .thesis, at: at(1, 9), symbol: "NVDA", horizon: horizon))
                    default:
                        ask("NVDA", question, horizon: horizon)
                        ledger.note(HarnessEvent(kind: .saved, at: question.addingTimeInterval(60), symbol: "NVDA", horizonHours: [24, 72, 168][hour % 3]))
                    }
                    let stated = plan(question.addingTimeInterval(120), withSector)
                    ledger = HarnessLedger()
                    ask("NVDA", question)
                    let plain = plan(question.addingTimeInterval(120), withSector)
                    let label = "\(hour)h \(horizon.rawValue) \(source)"
                    for followUp in stated {
                        XCTAssertFalse(calendar.isDate(followUp.fireAt, inSameDayAs: question), label)
                        XCTAssertGreaterThanOrEqual(followUp.fireAt.timeIntervalSince(question), 18 * 3_600, label)
                    }
                    for step in [HarnessStep.asset, .sector] {
                        guard let with = stated.first(where: { $0.step == step }), let without = plain.first(where: { $0.step == step }) else { continue }
                        XCTAssertGreaterThanOrEqual(with.fireAt, without.fireAt, "\(label): \(step.rawValue) came sooner than with nothing said")
                    }
                    XCTAssertLessThanOrEqual(stated.count, plain.count, label)
                }
            }
        }
    }

    // MARK: With the sector (the owner's other choice: in the tree, tested, and not what ships)

    func testWithTheSectorOneQuestionPlansTheAssetItsSectorAndTheWeek() {
        ask("NVDA", at(7, 16, 40))
        let steps = plan(at(7, 16, 41), withSector)
        XCTAssertEqual(steps.map(\.step), [.asset, .sector, .week])
        XCTAssertEqual(steps[0].fireAt, at(8, 16, 40))
        XCTAssertEqual(steps[1].fireAt, at(9, 16, 40), "the sector the day after")
        XCTAssertEqual(steps[1].sector, "semis")
        XCTAssertEqual(steps[1].symbol, "NVDA")
        XCTAssertEqual(steps[2].fireAt, at(12, 16, 40))
    }

    func testWithTheSectorAnAssetWithoutOneSkipsThatStep() {
        ask("GME", at(7, 12))
        let steps = plan(at(7, 12, 1), withSector)
        XCTAssertEqual(steps.map(\.step), [.asset, .week])
        XCTAssertEqual(steps[1].fireAt, at(12, 12), "the week is still the next Monday")
    }

    func testWithTheSectorAnIgnoredAssetIsFollowedByItsSectorThenTheWeekThenSilence() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        XCTAssertEqual(plan(at(8, 20), withSector).map(\.step), [.sector, .week], "48 hours after the question: the sector")
        XCTAssertEqual(plan(at(8, 20), withSector).first?.fireAt, at(9, 16))
        sent(.sector, at(9, 16), sector: "semis")
        XCTAssertEqual(plan(at(10, 9), withSector).map(\.step), [.week])
        XCTAssertEqual(plan(at(10, 9), withSector).first?.fireAt, at(12, 16))
        sent(.week, at(12, 16))
        XCTAssertEqual(plan(at(12, 17), withSector), [], "three for one question: Bobby goes quiet")
        XCTAssertEqual(plan(at(20, 9), withSector), [], "and stays quiet")
    }

    func testWithTheSectorAKindThatRestsLeavesItsDayToTheNext() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12))                                             // ignored
        sent(.sector, at(3, 12), sector: "semis"); answered(.sector, at(3, 14), sector: "semis")
        sent(.asset, at(4, 14))                                             // ignored again
        ask("AAPL", at(5, 12))
        let steps = plan(at(5, 12, 1), withSector)
        XCTAssertFalse(steps.contains { $0.step == .asset }, "two asset follow-ups in a row went unanswered")
        XCTAssertEqual(steps.first?.step, .sector, "a kind they do answer still comes")
        XCTAssertEqual(steps.first?.sector, "bigtech")
        XCTAssertEqual(steps.first?.fireAt, at(6, 12))
    }

    func testWithTheSectorASectorIsNotRepeatedWithinAWeek() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12)); answered(.asset, at(2, 13))
        sent(.sector, at(3, 13), sector: "semis"); answered(.sector, at(3, 14), sector: "semis")
        ask("AMD", at(4, 12))
        XCTAssertFalse(plan(at(4, 12, 1), withSector).contains { $0.step == .sector }, "semiconductors were shown the day before")
    }

    // MARK: Spacing against what was really shown

    func testTheWeekIsNeverSoonerThanEighteenHoursAfterTheQuestion() {
        // Their hour is nine in the morning; assets rest; GME has no sector: only the week is left.
        ask("NVDA", at(1, 12))
        for day in [2, 3, 5] { sent(.asset, at(day, 9)); answered(.asset, at(day, 9, 5)) }
        sent(.asset, at(6, 9)); sent(.asset, at(7, 9))
        let earlier = ledger
        ask("GME", at(11, 23))                         // Sunday night
        XCTAssertEqual(plan(at(11, 23, 1)), [], "Monday at nine is ten hours away, and the Monday after is no longer their week: nothing")
        XCTAssertEqual(plan(at(11, 23, 1), withSector), [])
        ledger = earlier
        ask("GME", at(11, 12))                         // Sunday noon: 21 hours before
        XCTAssertEqual(plan(at(11, 12, 1)).map(\.fireAt), [at(12, 9)])
    }

    func testAChangeOfTimeZoneNeverPutsTwoOnTheSameDay() {
        var london = Calendar(identifier: .gregorian)
        london.timeZone = TimeZone(identifier: "Europe/London")!
        var newYork = Calendar(identifier: .gregorian)
        newYork.timeZone = TimeZone(identifier: "America/New_York")!
        let asked = london.date(from: DateComponents(year: 2026, month: 10, day: 7, hour: 1))!
        ledger.note(HarnessEvent(kind: .ask, at: asked, symbol: "NVDA", name: "NVDA", isEquity: true, price: 100))
        // Planned and shown in London: Thursday at nine, which is four in the morning in New York.
        let shown = london.date(from: DateComponents(year: 2026, month: 10, day: 8, hour: 9))!
        ledger.note(HarnessEvent(kind: .sent, at: shown, symbol: "NVDA", step: .asset))
        let now = newYork.date(from: DateComponents(year: 2026, month: 10, day: 8, hour: 11))!
        let steps = HarnessPlanner.plan(ledger: ledger, now: now, calendar: newYork, options: withSector)
        let sector = steps.first { $0.step == .sector }
        XCTAssertNotNil(sector)
        XCTAssertFalse(newYork.isDate(sector!.fireAt, inSameDayAs: shown), "not on the day one already arrived")
        XCTAssertGreaterThanOrEqual(sector!.fireAt.timeIntervalSince(shown), 18 * 3_600)
        for (a, b) in zip(steps, steps.dropFirst()) {
            XCTAssertFalse(newYork.isDate(a.fireAt, inSameDayAs: b.fireAt))
            XCTAssertGreaterThanOrEqual(b.fireAt.timeIntervalSince(a.fireAt), 18 * 3_600)
        }
        // What ships: the week, on New York's Monday at New York's hour of the question.
        let shipped = HarnessPlanner.plan(ledger: ledger, now: now, calendar: newYork, options: assetThenWeek)
        XCTAssertEqual(shipped.map(\.step), [.week])
        XCTAssertEqual(shipped.first?.fireAt, newYork.date(from: DateComponents(year: 2026, month: 10, day: 12, hour: 20)))
    }

    // MARK: Limits

    func testAPayingAccountWithTheMondayBriefingGetsNoSecondWeek() {
        ask("NVDA", at(7, 16))
        XCTAssertEqual(plan(at(7, 16, 1), weeklyCovered: true).map(\.step), [.asset])
        XCTAssertEqual(plan(at(7, 16, 1), withSector, weeklyCovered: true).map(\.step), [.asset, .sector])
    }

    func testAnOldQuestionIsNotFollowedUp() {
        ask("NVDA", at(1, 12))
        XCTAssertEqual(plan(at(20, 12)), [], "more than two weeks later there is nothing to come back to")
    }

    func testNothingIsEverPlannedInThePast() {
        ask("NVDA", at(7, 16))
        let late = plan(at(9, 18))
        XCTAssertTrue(late.allSatisfy { $0.fireAt > at(9, 18) })
        XCTAssertEqual(late.map(\.step), [.week], "the days that passed unseen are not sent late")
    }

    func testWhatIsDatedAfterNowHasNotHappened() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        ask("TSLA", at(9, 10))
        XCTAssertEqual(plan(at(7, 17)).map(\.symbol), ["NVDA", "NVDA"], "neither the follow-up nor the later question exist yet")
        XCTAssertEqual(plan(at(7, 17)).map(\.step), [.asset, .week])
    }

    // MARK: After the first follow-up was shown, and three in a row (review of 2026-10-07)

    func testWhatTheySayAfterTheAssetWasShownDoesNotCancelTheWeek() {
        // Tuesday 6 at 14:10; the asset was shown on Wednesday 7 at 14:10, tapped, and read.
        ask("NVDA", at(6, 14, 10))
        sent(.asset, at(7, 14, 10))
        answered(.asset, at(7, 14, 30))
        ask("NVDA", at(7, 14, 31), origin: .followUp)
        let shown = ledger
        func steps(_ options: HarnessPlanner.Options? = nil) -> [String] {
            plan(at(7, 15, 5), options).map { "\($0.step.rawValue) \(Int($0.fireAt.timeIntervalSince(at(6, 0)) / 60))" }
        }
        func minutes(_ step: HarnessStep, _ date: Date) -> String { "\(step.rawValue) \(Int(date.timeIntervalSince(at(6, 0)) / 60))" }
        let week = [minutes(.week, at(12, 14, 10))]
        XCTAssertEqual(steps(), week, "answered by reading only")
        // Saved with each review the page offers: the save times the first follow-up, and that one was shown.
        for hours in [24, 72, 168] {
            ledger = shown
            ledger.note(HarnessEvent(kind: .saved, at: at(7, 15, 2), symbol: "NVDA", horizonHours: hours))
            XCTAssertEqual(steps(), week, "saved with a review in \(hours) hours")
        }
        // A thesis written after it: weeks, or longer.
        for horizon in [HarnessHorizon.month, .long] {
            ledger = shown
            ledger.note(HarnessEvent(kind: .thesis, at: at(7, 15, 3), symbol: "NVDA", horizon: horizon))
            XCTAssertEqual(steps(), week, "a thesis of \(horizon.rawValue)")
        }
        // With the sector: it follows the asset that was shown by a day, whatever was said since; the week is the same Monday.
        ledger = shown
        ledger.note(HarnessEvent(kind: .saved, at: at(7, 15, 2), symbol: "NVDA", horizonHours: 168))
        XCTAssertEqual(steps(withSector), [minutes(.sector, at(8, 14, 10))] + week)
        // And the asset is never planned a second time at the longer wait, even with room for it.
        var roomy = assetThenWeek
        roomy.maxPerQuestion = 3
        XCTAssertEqual(steps(roomy), week)
        // Said before the asset was shown, a week's review still moves it, as before.
        ledger = HarnessLedger()
        ask("NVDA", at(6, 14, 10))
        ledger.note(HarnessEvent(kind: .saved, at: at(6, 14, 11), symbol: "NVDA", horizonHours: 168))
        XCTAssertEqual(plan(at(6, 14, 12)).map(\.fireAt), [at(13, 14, 10)])
    }

    func testThePlanNeverHoldsAFourthUnansweredInARow() {
        // Thursday 1 at 14:10: the asset (Friday 2) and the week (Monday 5) arrive and nobody opens them.
        ask("NVDA", at(1, 14, 10))
        sent(.asset, at(2, 14, 10))
        sent(.week, at(5, 14, 10))
        ask("NVDA", at(6, 15, 0))
        // Two in a row went unanswered: the plan is "what happens if they do nothing", so it holds one more.
        XCTAssertEqual(plan(at(6, 15, 1)).map(\.step), [.asset])
        XCTAssertEqual(plan(at(6, 15, 1)).first?.fireAt, at(7, 15, 0))
        XCTAssertEqual(plan(at(6, 15, 1), withSector).map(\.step), [.asset], "with three steps it would have been five in a row")
        // Shown and still not answered: quiet.
        sent(.asset, at(7, 15, 0))
        XCTAssertEqual(plan(at(7, 15, 1)), [])
        // Answered: the week of that question comes.
        answered(.asset, at(7, 16, 0))
        ask("NVDA", at(7, 16, 1), origin: .followUp)
        XCTAssertEqual(plan(at(7, 16, 5)).map(\.step), [.week])
        XCTAssertEqual(plan(at(7, 16, 5)).first?.fireAt, at(12, 15, 0))
        // One unanswered before a question still leaves room for both.
        ledger = HarnessLedger()
        ask("NVDA", at(1, 14, 10))
        sent(.asset, at(2, 14, 10))
        ask("NVDA", at(6, 15, 0))
        XCTAssertEqual(plan(at(6, 15, 1)).map(\.step), [.asset, .week])
    }

    // MARK: One person, one question (the answers the owner asked for)

    /// Lives one question forward: every follow-up the planner holds is shown when its moment comes,
    /// `react` writes what the person does with it, and the plan is made again. What was shown.
    private func live(_ options: HarnessPlanner.Options, legacy: Bool = false, until: Date? = nil,
                      react: (HarnessFollowUp, Int) -> Void = { _, _ in }) -> [HarnessFollowUp] {
        var now = at(6, 14, 12)
        var shown: [HarnessFollowUp] = []
        while shown.count < 40 {
            let next = legacy ? HarnessLegacyRules.plan(ledger: ledger, now: now, calendar: calendar)
                : HarnessPlanner.plan(ledger: ledger, now: now, calendar: calendar, options: options)
            guard let first = next.first, until.map({ first.fireAt <= $0 }) ?? true else { break }
            sent(first.step, first.fireAt, symbol: first.symbol, sector: first.sector)
            react(first, shown.count)
            shown.append(first)
            now = first.fireAt.addingTimeInterval(45 * 60)
        }
        return shown
    }

    private func tap(_ followUp: HarnessFollowUp) {
        ledger.note(HarnessEvent(kind: .opened, at: followUp.fireAt.addingTimeInterval(120), symbol: followUp.symbol, step: followUp.step,
                                 sector: followUp.sector, ref: followUp.fireAt))
    }

    /// They tap it, then "What changed?" on the glass: a pick, the answer it is, and the read Bobby starts.
    private func answer(_ followUp: HarnessFollowUp) {
        tap(followUp)
        let then = followUp.fireAt.addingTimeInterval(20 * 60)
        ledger.note(HarnessEvent(kind: .picked, at: then, symbol: "NVDA"))
        ledger.note(HarnessEvent(kind: .returned, at: then, symbol: followUp.symbol, step: followUp.step, sector: followUp.sector, ref: followUp.fireAt))
        ask("NVDA", then.addingTimeInterval(60), origin: .followUp)
    }

    func testWhatOnePersonGetsFromOneQuestionOnATuesday() {
        // Tuesday 6 October 2026, 14:10: one question about NVDA, and a yes.
        let wednesday = at(7, 14, 10), thursday = at(8, 14, 10), monday = at(12, 14, 10), nextTuesday = at(13, 14, 10), nextWednesday = at(14, 14, 10)
        let shipped = assetThenWeek
        func fresh(horizon: HarnessHorizon? = nil) { ledger = HarnessLedger(); ask("NVDA", at(6, 14, 10), horizon: horizon) }
        func moments(_ shown: [HarnessFollowUp]) -> [String] { shown.map { "\($0.step.rawValue) \(Int($0.fireAt.timeIntervalSince(at(6, 0)) / 3_600))" } }
        func expect(_ shown: [HarnessFollowUp], _ steps: [(HarnessStep, Date)], _ label: String) {
            XCTAssertEqual(moments(shown), steps.map { "\($0.0.rawValue) \(Int($0.1.timeIntervalSince(at(6, 0)) / 3_600))" }, label)
        }

        // (a) they never open anything
        fresh(); expect(live(shipped), [(.asset, wednesday), (.week, monday)], "a")
        // (b) they tap each one and do nothing else
        fresh(); expect(live(shipped) { followUp, _ in self.tap(followUp) }, [(.asset, wednesday), (.week, monday)], "b")
        // (c) they answer the first
        fresh(); expect(live(shipped) { followUp, index in if index == 0 { self.answer(followUp) } }, [(.asset, wednesday), (.week, monday)], "c")
        // (c, said aloud) they answer the first and save that read with "review in a week": the week still comes
        fresh(); expect(live(shipped) { followUp, index in
            guard index == 0 else { return }
            self.answer(followUp)
            self.ledger.note(HarnessEvent(kind: .saved, at: followUp.fireAt.addingTimeInterval(30 * 60), symbol: "NVDA", horizonHours: 168))
        }, [(.asset, wednesday), (.week, monday)], "c, saved for a week")
        // (d) they saved the read with "review in a week"
        fresh(); ledger.note(HarnessEvent(kind: .saved, at: at(6, 14, 11), symbol: "NVDA", horizonHours: 168))
        expect(live(shipped), [(.asset, nextTuesday)], "d")
        // (e) their question named years
        fresh(horizon: .long); expect(live(shipped), [(.week, monday)], "e")

        // The same five with the sector.
        fresh(); expect(live(withSector), [(.asset, wednesday), (.sector, thursday), (.week, monday)], "a, sector")
        fresh(); expect(live(withSector) { followUp, _ in self.tap(followUp) }, [(.asset, wednesday), (.sector, thursday), (.week, monday)], "b, sector")
        fresh(); expect(live(withSector) { followUp, index in if index == 0 { self.answer(followUp) } },
                        [(.asset, wednesday), (.sector, thursday), (.week, monday)], "c, sector")
        fresh(); ledger.note(HarnessEvent(kind: .saved, at: at(6, 14, 11), symbol: "NVDA", horizonHours: 168))
        expect(live(withSector), [(.asset, nextTuesday), (.sector, nextWednesday)], "d, sector")
        fresh(horizon: .long); expect(live(withSector), [(.week, monday)], "e, sector")
    }

    func testTheMostReactivePersonNoLongerGetsTheMost() {
        let month = at(6, 14, 10).addingTimeInterval(28 * 86_400)
        func count(legacy: Bool, _ react: @escaping (HarnessFollowUp) -> Void) -> Int {
            ledger = HarnessLedger()
            ask("NVDA", at(6, 14, 10))
            return live(assetThenWeek, legacy: legacy, until: month) { followUp, _ in react(followUp) }.count
        }
        // They tap every notification and do nothing else. The first build followed them until the
        // question was two weeks old: the 7th, 8th, 9th, 10th, the 19th and the 20th.
        XCTAssertEqual(count(legacy: true) { self.tap($0) }, 6)
        XCTAssertEqual(count(legacy: false) { self.tap($0) }, 2)
        // They tap, and then "What changed?" every time. The first build never stopped: every answer
        // started the chain again, four a week.
        XCTAssertGreaterThanOrEqual(count(legacy: true) { self.answer($0) }, 10)
        XCTAssertEqual(count(legacy: false) { self.answer($0) }, 2, "two for the one question they asked, whatever they do with them")
    }

    // MARK: Properties (random ledgers, fixed seed)

    private struct Seeded: RandomNumberGenerator {
        var state: UInt64
        mutating func next() -> UInt64 {
            state &+= 0x9E37_79B9_7F4A_7C15
            var z = state
            z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
            z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
            return z ^ (z >> 31)
        }
    }

    private static let symbols = ["NVDA", "AMD", "TSLA", "BTC", "SOL", "GME", "AAPL"]

    /// Anything a ledger can hold, in any order of days, for a reader in `zone`: questions of every
    /// origin and horizon, saves, theses, follow-ups of every kind, taps, answers, picks.
    private func randomLedger(_ rng: inout Seeded, zone: Calendar) -> (ledger: HarnessLedger, now: Date) {
        var ledger = HarnessLedger()
        let start = zone.date(from: DateComponents(year: 2026, month: 9, day: 24))!
        var clock = start.addingTimeInterval(Double(Int.random(in: 0..<86_400, using: &rng)))
        var shown: [HarnessEvent] = []
        for _ in 0..<Int.random(in: 1...45, using: &rng) {
            clock = clock.addingTimeInterval(Double(Int.random(in: 1...(30 * 60), using: &rng)) * 60 * Double(Int.random(in: 1...3, using: &rng)) / 2)
            let symbol = Self.symbols.randomElement(using: &rng)!
            switch Int.random(in: 0..<20, using: &rng) {
            case 0...6:
                ledger.note(HarnessEvent(kind: .ask, at: clock, symbol: symbol, name: symbol, isEquity: true, price: 100,
                                         origin: Int.random(in: 0..<4, using: &rng) == 0 ? .followUp : nil,
                                         thread: Int.random(in: 0..<6, using: &rng) == 0 ? true : nil,
                                         horizon: Int.random(in: 0..<2, using: &rng) == 0 ? HarnessHorizon.allCases.randomElement(using: &rng) : nil))
            case 7:
                ledger.note(HarnessEvent(kind: .saved, at: clock, symbol: symbol, horizonHours: ([nil, 24, 72, 168] as [Int?]).randomElement(using: &rng)!))
            case 8:
                ledger.note(HarnessEvent(kind: .thesis, at: clock, symbol: symbol, horizon: ([nil, .month, .long] as [HarnessHorizon?]).randomElement(using: &rng)!))
            case 9...12:
                let step = HarnessStep.allCases.randomElement(using: &rng)!
                let event = HarnessEvent(kind: .sent, at: clock, symbol: symbol, step: step, sector: step == .sector ? HarnessSectors.sector(of: symbol)?.id : nil)
                ledger.note(event)
                shown.append(event)
            case 13...15:
                guard let last = shown.last else { continue }
                ledger.note(HarnessEvent(kind: .opened, at: clock, symbol: last.symbol, step: last.step, sector: last.sector, ref: last.at))
            case 16...17:
                guard let last = shown.last else { continue }
                ledger.note(HarnessEvent(kind: .returned, at: clock, symbol: last.symbol, step: last.step, sector: last.sector, ref: last.at))
            case 18:
                ledger.note(HarnessEvent(kind: .picked, at: clock, symbol: symbol))
            default:
                ledger.note(HarnessEvent(kind: .appOpen, at: clock))
            }
        }
        return (ledger, clock.addingTimeInterval(Double(Int.random(in: 1...(3 * 1_440), using: &rng)) * 60))
    }

    func testNoPlanEverBreaksACap() {
        var rng = Seeded(state: 20_261_007)
        let zones = ["America/Mexico_City", "America/New_York", "Europe/London", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney"].map { name -> Calendar in
            var c = Calendar(identifier: .gregorian)
            c.timeZone = TimeZone(identifier: name)!
            return c
        }
        var planned = 0
        for round in 0..<1_500 {
            let zone = zones[round % zones.count]
            let (ledger, now) = randomLedger(&rng, zone: zone)
            for options in [assetThenWeek, withSector] {
                let plan = HarnessPlanner.plan(ledger: ledger, now: now, calendar: zone, options: options)
                planned += plan.count
                let label = "round \(round), \(zone.timeZone.identifier), chain \(options.chain.map(\.rawValue))"
                let question = ledger.question(before: now)
                guard let question else { XCTAssertEqual(plan, [], "\(label): nobody asked"); continue }
                let sents = ledger.events(.sent).filter { $0.at <= now }
                // One question's share, whatever was answered.
                XCTAssertLessThanOrEqual(plan.count, max(0, options.maxPerQuestion - sents.filter { $0.at > question.at }.count), label)
                XCTAssertEqual(Set(plan.map(\.step)).count, plan.count, "\(label): a step twice")
                XCTAssertTrue(plan.allSatisfy { options.chain.contains($0.step) }, label)
                // Quiet, and resting kinds.
                let streak = ledger.unansweredStreak(before: now)
                if streak.count >= 3, let last = streak.last, now.timeIntervalSince(last) < 14 * 86_400 { XCTAssertEqual(plan, [], "\(label): quiet") }
                // And over the plan itself, which is what arrives if they do nothing: never a fourth unanswered
                // in a row inside the fourteen days after the third.
                var unanswered = streak.count, lastUnanswered = streak.last
                for followUp in plan {
                    if unanswered >= 3, let last = lastUnanswered {
                        XCTAssertGreaterThanOrEqual(followUp.fireAt.timeIntervalSince(last), 14 * 86_400, "\(label): \(unanswered + 1) unanswered in a row")
                    }
                    unanswered += 1
                    lastUnanswered = followUp.fireAt
                }
                let profile = HarnessProfile.make(ledger, now: now, calendar: zone)
                for followUp in plan { XCTAssertFalse(profile.rests(followUp.step), "\(label): \(followUp.step.rawValue) rests") }
                var previous = sents.last?.at
                for (index, followUp) in plan.enumerated() {
                    XCTAssertGreaterThan(followUp.fireAt, now, label)
                    // Inside waking hours.
                    let time = zone.dateComponents([.hour, .minute], from: followUp.fireAt)
                    let minutes = (time.hour ?? 0) * 60 + (time.minute ?? 0)
                    XCTAssertTrue((9 * 60...21 * 60).contains(minutes), "\(label): at \(minutes / 60):\(minutes % 60)")
                    // Never the day of the question, never within 18 hours of it or of the last one shown, never two on a day.
                    XCTAssertGreaterThanOrEqual(followUp.fireAt.timeIntervalSince(question.at), 18 * 3_600, label)
                    XCTAssertFalse(zone.isDate(followUp.fireAt, inSameDayAs: question.at), label)
                    if let previous {
                        XCTAssertGreaterThanOrEqual(followUp.fireAt.timeIntervalSince(previous), 18 * 3_600, label)
                        XCTAssertFalse(zone.isDate(followUp.fireAt, inSameDayAs: previous), label)
                    }
                    previous = followUp.fireAt
                    // Four in seven days, counting what was shown.
                    let weekBefore = followUp.fireAt.addingTimeInterval(-7 * 86_400)
                    let inWindow = sents.filter { $0.at > weekBefore }.count + plan[...index].filter { $0.fireAt > weekBefore }.count
                    XCTAssertLessThanOrEqual(inWindow, 4, label)
                    // About what they asked.
                    switch followUp.step {
                    case .asset:
                        XCTAssertEqual(followUp.symbol, question.symbol, label)
                        XCTAssertGreaterThanOrEqual(followUp.days, 1, label)
                    case .sector:
                        XCTAssertEqual(followUp.symbol, question.symbol, label)
                        XCTAssertEqual(followUp.sector, question.symbol.flatMap { HarnessSectors.sector(of: $0)?.id }, label)
                    case .week:
                        XCTAssertEqual(zone.component(.weekday, from: followUp.fireAt), 2, "\(label): a week is a Monday")
                        let asked = ledger.assets(since: HarnessPlanner.weekStart(of: followUp.fireAt, calendar: zone), now: now).map(\.symbol)
                        XCTAssertTrue(asked.contains(followUp.symbol ?? ""), "\(label): the week names something they asked about that week")
                        XCTAssertEqual(followUp.others, asked.count - 1, label)
                    }
                }
            }
        }
        XCTAssertGreaterThan(planned, 300, "the ledgers were too quiet to prove anything")
    }

    /// A person whose every action lands on one clock hour of the day (so the hour Bobby learns is
    /// the hour they asked at), and who never said anything about a horizon: exactly what the first
    /// build could read. On such a ledger the two planners may be compared follow-up for follow-up.
    private func plainLedger(_ rng: inout Seeded) -> (ledger: HarnessLedger, now: Date) {
        var ledger = HarnessLedger()
        let hour = Int.random(in: 9...20, using: &rng)
        var day = Int.random(in: 0..<5, using: &rng)
        var shown: [HarnessEvent] = []
        func moment(_ day: Int) -> Date { calendar.date(from: DateComponents(year: 2026, month: 9, day: 24 + day, hour: hour))! }
        for _ in 0..<Int.random(in: 1...40, using: &rng) {
            day += [0, 0, 1, 1, 1, 2, 3].randomElement(using: &rng)!
            let clock = moment(day)
            let symbol = Self.symbols.randomElement(using: &rng)!
            switch Int.random(in: 0..<20, using: &rng) {
            case 0...6:
                ledger.note(HarnessEvent(kind: .ask, at: clock, symbol: symbol, name: symbol, isEquity: true, price: 100,
                                         origin: Int.random(in: 0..<4, using: &rng) == 0 ? .followUp : nil))
            case 7:
                ledger.note(HarnessEvent(kind: .saved, at: clock, symbol: symbol))
            case 8...11:
                let step = HarnessStep.allCases.randomElement(using: &rng)!
                let event = HarnessEvent(kind: .sent, at: clock, symbol: symbol, step: step, sector: step == .sector ? HarnessSectors.sector(of: symbol)?.id : nil)
                ledger.note(event)
                shown.append(event)
            case 12...15:
                guard let last = shown.last else { continue }
                ledger.note(HarnessEvent(kind: .opened, at: clock, symbol: last.symbol, step: last.step, sector: last.sector, ref: last.at))
            case 16...17:
                guard let last = shown.last else { continue }
                ledger.note(HarnessEvent(kind: .returned, at: clock, symbol: last.symbol, step: last.step, sector: last.sector, ref: last.at))
            case 18:
                ledger.note(HarnessEvent(kind: .picked, at: clock, symbol: symbol))
            default:
                ledger.note(HarnessEvent(kind: .appOpen, at: clock))
            }
        }
        return (ledger, moment(day + Int.random(in: 0...4, using: &rng)).addingTimeInterval(60))
    }

    func testThePlanNeverHoldsMoreThanTheFirstBuildWouldHavePlanned() {
        var rng = Seeded(state: 1_966)
        var fewer = 0, compared = 0
        for round in 0..<4_000 {
            let (ledger, now) = plainLedger(&rng)
            let before = HarnessLegacyRules.plan(ledger: ledger, now: now, calendar: calendar)
            let after = HarnessPlanner.plan(ledger: ledger, now: now, calendar: calendar, options: assetThenWeek)
            XCTAssertLessThanOrEqual(after.count, before.count, "round \(round): \(after.map(\.step.rawValue)) against \(before.map(\.step.rawValue))")
            // Optional sectors use an own-question/explicit-choice population, while the first
            // build could anchor on any Bobby read. Their caps are checked by testNoPlanEverBreaksACap;
            // a different subject's historical count is not a bound for that optional chain.
            if !before.isEmpty { compared += 1 }
            if after.count < before.count { fewer += 1 }
        }
        XCTAssertGreaterThan(compared, 800, "the first build planned something in too few of them to compare")
        XCTAssertGreaterThan(fewer, 400, "and in many of them the plan of today is shorter")
    }
}
