import Foundation
import XCTest
@testable import Bobby

/// The harness (1.8), the plan: after a question, the asset the next day, its sector the day after,
/// the week on Monday, then silence. Answering a follow-up starts again the next day; ignoring them
/// makes Bobby quieter. Everything is a pure function of the ledger and the clock.
final class HarnessPlannerTests: XCTestCase {
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "America/Mexico_City")!
        return c
    }()
    private var ledger = HarnessLedger()

    /// Wednesday 7 October 2026, local time.
    private func at(_ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: 2026, month: 10, day: day, hour: hour, minute: minute))!
    }

    private func ask(_ symbol: String, _ date: Date, price: Double? = 100, equity: Bool = true) {
        ledger.note(HarnessEvent(kind: .ask, at: date, symbol: symbol, name: symbol, isEquity: equity, price: price))
    }

    private func sent(_ step: HarnessStep, _ date: Date, symbol: String? = "NVDA", sector: String? = nil) {
        ledger.note(HarnessEvent(kind: .sent, at: date, symbol: symbol, step: step, sector: sector))
    }

    private func opened(_ step: HarnessStep, _ date: Date, symbol: String? = "NVDA", sector: String? = nil) {
        ledger.note(HarnessEvent(kind: .opened, at: date, symbol: symbol, step: step, sector: sector))
    }

    private func plan(_ now: Date, weeklyCovered: Bool = false) -> [HarnessFollowUp] {
        var options = HarnessPlanner.Options()
        options.weeklyCovered = weeklyCovered
        return HarnessPlanner.plan(ledger: ledger, now: now, calendar: calendar, options: options)
    }

    // MARK: The first question

    func testNothingIsPlannedBeforeAnyQuestion() {
        XCTAssertEqual(plan(at(7, 12)), [])
        ledger.note(HarnessEvent(kind: .appOpen, at: at(7, 12)))
        XCTAssertEqual(plan(at(7, 13)), [], "opening the app is not a question")
    }

    func testOneQuestionPlansTheAssetItsSectorAndTheWeek() {
        ask("NVDA", at(7, 16, 40))
        let steps = plan(at(7, 16, 41))
        XCTAssertEqual(steps.map(\.step), [.asset, .sector, .week])
        XCTAssertEqual(steps[0].fireAt, at(8, 16, 40), "the next day, at the time they asked")
        XCTAssertEqual(steps[0].symbol, "NVDA")
        XCTAssertEqual(steps[0].days, 1)
        XCTAssertEqual(steps[1].fireAt, at(9, 16, 40), "the sector the day after")
        XCTAssertEqual(steps[1].sector, "semis")
        XCTAssertEqual(steps[1].symbol, "NVDA")
        XCTAssertEqual(steps[2].fireAt, at(12, 16, 40), "the week on the next Monday")
        XCTAssertEqual(calendar.component(.weekday, from: steps[2].fireAt), 2)
        XCTAssertEqual(steps[2].others, 0)
    }

    func testFollowUpsStayInsideWakingHours() {
        ask("NVDA", at(7, 23, 30))
        XCTAssertEqual(plan(at(7, 23, 31)).first?.fireAt, at(8, 21, 0), "a late question is followed up at nine in the evening")
        ledger = HarnessLedger()
        ask("NVDA", at(7, 2, 10))
        XCTAssertEqual(plan(at(7, 2, 11)).first?.fireAt, at(8, 9, 0), "a night question at nine in the morning")
    }

    func testAnAssetWithoutASectorSkipsThatStep() {
        ask("GME", at(7, 12))
        let steps = plan(at(7, 12, 1))
        XCTAssertEqual(steps.map(\.step), [.asset, .week])
        XCTAssertEqual(steps[1].fireAt, at(12, 12), "the week is still the next Monday")
    }

    func testTheWeekNamesTheLatestAssetAndCountsTheOthers() {
        ask("BTC", at(5, 10), equity: false)
        ask("TSLA", at(6, 10))
        ask("NVDA", at(7, 10))
        let week = plan(at(7, 10, 1)).last
        XCTAssertEqual(week?.step, .week)
        XCTAssertEqual(week?.symbol, "NVDA")
        XCTAssertEqual(week?.others, 2)
    }

    func testAQuestionOnSundayPutsTheWeekAWeekLater() {
        ask("NVDA", at(11, 12))                      // Sunday
        let steps = plan(at(11, 12, 1))
        XCTAssertEqual(steps.map(\.fireAt), [at(12, 12), at(13, 12), at(19, 12)], "Monday is taken by the asset: the week is the Monday after")
    }

    // MARK: Ignored

    func testAnIgnoredAssetIsFollowedByItsSectorThenTheWeekThenSilence() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        XCTAssertEqual(plan(at(8, 20)).map(\.step), [.sector, .week], "48 hours after the question: the sector")
        XCTAssertEqual(plan(at(8, 20)).first?.fireAt, at(9, 16))
        sent(.sector, at(9, 16), sector: "semis")
        XCTAssertEqual(plan(at(10, 9)).map(\.step), [.week])
        XCTAssertEqual(plan(at(10, 9)).first?.fireAt, at(12, 16))
        sent(.week, at(12, 16))
        XCTAssertEqual(plan(at(12, 17)), [], "nothing was opened: Bobby goes quiet")
        XCTAssertEqual(plan(at(20, 9)), [], "and stays quiet")
    }

    func testAKindWhoseLastTwoShowingsWentUnansweredRests() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12))                                             // ignored
        sent(.sector, at(3, 12), sector: "semis"); opened(.sector, at(3, 14), sector: "semis")
        sent(.asset, at(4, 14))                                             // ignored again
        ask("AAPL", at(5, 12))
        let steps = plan(at(5, 12, 1))
        XCTAssertFalse(steps.contains { $0.step == .asset }, "two asset follow-ups in a row went unanswered")
        XCTAssertEqual(steps.first?.step, .sector, "a kind they do answer still comes")
        XCTAssertEqual(steps.first?.sector, "bigtech")
    }

    func testAnOlderAnswerDoesNotKeepAKindAlive() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12)); opened(.asset, at(2, 13))                  // answered once, long before
        sent(.sector, at(3, 13), sector: "semis"); opened(.sector, at(3, 14), sector: "semis")
        sent(.asset, at(4, 14))                                             // ignored
        sent(.week, at(5, 14)); opened(.week, at(5, 15), symbol: nil)
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
        sent(.sector, at(5, 20), symbol: "SOL", sector: "layer1")
        XCTAssertEqual(plan(at(5, 21)), [], "three shown, none answered: the week that was coming is dropped")
        ask("AAPL", at(9, 12))
        XCTAssertEqual(plan(at(9, 12, 1)), [], "a new question does not restart it inside the two weeks")
        ask("AAPL", at(20, 12))
        XCTAssertFalse(plan(at(20, 12, 1)).isEmpty, "two weeks after the last one, a question may be followed up again")
    }

    func testNeverMoreThanFourInAWeek() {
        ask("NVDA", at(5, 12))
        for day in 6...9 { sent(.asset, at(day, 12)); opened(.asset, at(day, 13)) }
        XCTAssertEqual(plan(at(9, 13, 1)).filter { $0.fireAt < at(13, 0) }, [], "four were shown in the last seven days")
    }

    // MARK: Answered

    func testOpeningTheAssetBringsAnotherTheNextDay() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        opened(.asset, at(8, 18, 30))
        let steps = plan(at(8, 18, 31))
        XCTAssertEqual(steps.first?.step, .asset, "they answered: another one tomorrow")
        XCTAssertEqual(steps.first?.symbol, "NVDA", "the only asset they asked about")
        XCTAssertEqual(steps.first?.fireAt, at(9, 18, 30), "at the time they answered")
        XCTAssertEqual(steps.first?.days, 2)
    }

    func testAfterAnAnswerTheNextAssetIsAnotherOneTheyCareAbout() {
        ask("BTC", at(5, 10), equity: false)
        ask("TSLA", at(6, 10)); ask("TSLA", at(6, 11)); ask("TSLA", at(6, 12))
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        opened(.asset, at(8, 17))
        XCTAssertEqual(plan(at(8, 17, 1)).first?.symbol, "TSLA", "asked about three times: it matters most among the others")
    }

    func testComingBackWithoutTappingCountsAsAnAnswer() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        ledger.note(HarnessEvent(kind: .returned, at: at(8, 19), symbol: "NVDA", step: .asset))
        XCTAssertEqual(plan(at(8, 19, 1)).first?.fireAt, at(9, 19))
    }

    func testANewQuestionStartsAgainFromThatAsset() {
        ask("NVDA", at(7, 16))
        sent(.asset, at(8, 16))
        ask("SOL", at(8, 20), equity: false)
        let steps = plan(at(8, 20, 1))
        XCTAssertEqual(steps.map(\.step), [.asset, .sector, .week])
        XCTAssertEqual(steps[0].symbol, "SOL")
        XCTAssertEqual(steps[0].fireAt, at(9, 20))
        XCTAssertEqual(steps[1].sector, "layer1")
    }

    func testASectorIsNotRepeatedWithinAWeek() {
        ask("NVDA", at(1, 12))
        sent(.asset, at(2, 12)); opened(.asset, at(2, 13))
        sent(.sector, at(3, 13), sector: "semis"); opened(.sector, at(3, 14), sector: "semis")
        ask("AMD", at(4, 12))
        XCTAssertFalse(plan(at(4, 12, 1)).contains { $0.step == .sector }, "semiconductors were shown three days ago")
    }

    func testTheHourTheyAnswerAtIsLearned() {
        ask("NVDA", at(1, 22))
        for day in 2...4 { sent(.asset, at(day, 21)); opened(.asset, at(day + 0, 21, 5)) }
        ledger.note(HarnessEvent(kind: .opened, at: at(5, 8, 15), symbol: "NVDA", step: .week))
        ledger.note(HarnessEvent(kind: .opened, at: at(6, 8, 40), symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .opened, at: at(7, 8, 5), symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .opened, at: at(8, 8, 50), symbol: "NVDA", step: .asset))
        let profile = HarnessProfile.make(ledger, now: at(8, 9), calendar: calendar)
        XCTAssertEqual(profile.hour, 8, "four answers at eight, three at nine in the evening")
        ask("TSLA", at(8, 23))
        XCTAssertEqual(plan(at(8, 23, 1)).first?.fireAt, at(10, 9), "their hour, inside waking hours, and never sooner than 18 hours")
    }

    // MARK: Spacing against what was really shown

    func testTheWeekIsNeverSoonerThanEighteenHoursAfterTheQuestion() {
        // Their hour is nine in the morning; assets rest; GME has no sector: only the week is left.
        ask("NVDA", at(1, 12))
        for day in [2, 3, 5] { sent(.sector, at(day, 9), sector: "semis"); opened(.sector, at(day, 9, 5), sector: "semis") }
        sent(.asset, at(6, 9)); sent(.asset, at(7, 9))
        opened(.week, at(8, 9, 10), symbol: nil)
        ask("GME", at(11, 23))                         // Sunday night
        let steps = plan(at(11, 23, 1))
        XCTAssertEqual(steps.map(\.step), [.week])
        XCTAssertEqual(steps.first?.fireAt, at(19, 9), "Monday at nine is ten hours away: the Monday after")
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
        let steps = HarnessPlanner.plan(ledger: ledger, now: now, calendar: newYork)
        let sector = steps.first { $0.step == .sector }
        XCTAssertNotNil(sector)
        XCTAssertFalse(newYork.isDate(sector!.fireAt, inSameDayAs: shown), "not on the day one already arrived")
        XCTAssertGreaterThanOrEqual(sector!.fireAt.timeIntervalSince(shown), 18 * 3_600)
        for (a, b) in zip(steps, steps.dropFirst()) {
            XCTAssertFalse(newYork.isDate(a.fireAt, inSameDayAs: b.fireAt))
            XCTAssertGreaterThanOrEqual(b.fireAt.timeIntervalSince(a.fireAt), 18 * 3_600)
        }
    }

    // MARK: Limits

    func testAPayingAccountWithTheMondayBriefingGetsNoSecondWeek() {
        ask("NVDA", at(7, 16))
        XCTAssertEqual(plan(at(7, 16, 1), weeklyCovered: true).map(\.step), [.asset, .sector])
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

    func testOnePendingNotificationPerStep() {
        ask("NVDA", at(7, 16))
        XCTAssertEqual(plan(at(7, 16, 1)).map(\.id), ["v18.follow.asset", "v18.follow.sector", "v18.follow.week"])
    }
}
