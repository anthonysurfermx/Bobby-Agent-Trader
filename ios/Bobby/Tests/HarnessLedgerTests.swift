import Foundation
import XCTest
@testable import Bobby

/// The harness (1.8), the ledger: small, on the phone, per reader, bounded and erasable.
final class HarnessLedgerTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() {
        super.setUp()
        suiteName = "harness.ledger.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    private func ask(_ symbol: String, _ offset: TimeInterval, price: Double? = 10) -> HarnessEvent {
        HarnessEvent(kind: .ask, at: t0.addingTimeInterval(offset), symbol: symbol, name: symbol, isEquity: true, price: price)
    }

    func testEventsStayInOrderWhateverOrderTheyArriveIn() {
        var ledger = HarnessLedger()
        ledger.note(ask("NVDA", 200))
        ledger.note(ask("TSLA", 100))
        ledger.note(ask("AAPL", 300))
        XCTAssertEqual(ledger.events.compactMap(\.symbol), ["TSLA", "NVDA", "AAPL"])
    }

    func testOnlyAValidSymbolAndAUsablePriceAreKept() {
        var ledger = HarnessLedger()
        ledger.note(ask("nvda", 0))
        ledger.note(ask("NVDA; drop table", 1))
        ledger.note(ask("", 2))
        ledger.note(ask("TSLA", 3, price: -4))
        ledger.note(ask("AAPL", 4, price: .infinity))
        XCTAssertEqual(ledger.events.compactMap(\.symbol), ["NVDA", "TSLA", "AAPL"])
        XCTAssertEqual(ledger.events.map(\.price), [10, nil, nil], "a price that makes no sense is no price")
    }

    func testTheLedgerIsBoundedInCountAndInTime() {
        var ledger = HarnessLedger()
        for i in 0..<(HarnessLedger.maxEvents + 40) { ledger.note(ask("NVDA", Double(i))) }
        XCTAssertEqual(ledger.events.count, HarnessLedger.maxEvents)
        ledger.note(ask("TSLA", Double(HarnessLedger.retentionDays + 1) * 86_400))
        XCTAssertEqual(ledger.events.compactMap(\.symbol), ["TSLA"], "what is older than the retention leaves on the next write")
    }

    func testAnAssetKnowsItsFirstAndLastQuestion() throws {
        var ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0, price: 100))
        ledger.note(ask("TSLA", 50, price: 200))
        ledger.note(ask("NVDA", 100, price: nil))
        ledger.note(ask("NVDA", 200, price: 110))
        let assets = ledger.assets(since: t0.addingTimeInterval(-1), now: t0.addingTimeInterval(300))
        XCTAssertEqual(assets.map(\.symbol), ["NVDA", "TSLA"], "most recently asked first")
        let nvda = try XCTUnwrap(assets.first)
        XCTAssertEqual(nvda.asks, 3)
        XCTAssertEqual(nvda.firstPrice, 100)
        XCTAssertEqual(nvda.lastPrice, 110)
        XCTAssertEqual(nvda.lastAskedAt, t0.addingTimeInterval(200))
        XCTAssertEqual(ledger.assets(since: t0.addingTimeInterval(150), now: t0.addingTimeInterval(300)).map(\.symbol), ["NVDA"])
    }

    func testFollowUpsBelongToTheLatestQuestionThePersonAskedByThemselves() {
        var ledger = HarnessLedger()
        XCTAssertNil(ledger.question(before: t0))
        ledger.note(ask("NVDA", 0))
        ledger.note(HarnessEvent(kind: .appOpen, at: t0.addingTimeInterval(10)))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(20), symbol: "NVDA", step: .asset))
        // A tap, an answer and a read Bobby started: none of them takes the question's place.
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(40), symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .returned, at: t0.addingTimeInterval(50), symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .picked, at: t0.addingTimeInterval(50), symbol: "NVDA"))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(60), symbol: "TSLA", name: "TSLA", isEquity: true, price: 10, origin: .followUp))
        XCTAssertEqual(ledger.question(before: t0.addingTimeInterval(70))?.symbol, "NVDA")
        XCTAssertEqual(ledger.question(before: t0.addingTimeInterval(70))?.at, t0)
        // Their own next question does, a second one about the same read included.
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(80), symbol: "TSLA", name: "TSLA", isEquity: true, price: 10, thread: true))
        XCTAssertEqual(ledger.question(before: t0.addingTimeInterval(90))?.symbol, "TSLA")
        XCTAssertEqual(ledger.question(before: t0.addingTimeInterval(70))?.symbol, "NVDA", "the clock decides what has happened yet")
        // The asset is known from every read, whoever started it (the line on the glass counts from the last one).
        XCTAssertEqual(ledger.asset("TSLA", since: t0, now: t0.addingTimeInterval(90))?.asks, 2)
    }

    func testOnlyARealAnswerIsAnAnswer() {
        let kinds: [HarnessEvent.Kind] = [.ask, .saved, .appOpen, .sent, .opened, .returned, .picked, .thesis]
        XCTAssertEqual(kinds.filter { HarnessEvent(kind: $0, at: t0).isAnswer }, [.returned], "not a tap, and not a pick that answers no follow-up")
        XCTAssertTrue(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA").isQuestion)
        XCTAssertFalse(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", origin: .followUp).isQuestion)
        XCTAssertFalse(HarnessEvent(kind: .picked, at: t0, symbol: "NVDA").isQuestion)
    }

    func testATapWeighsLessThanAQuestionAndAnAnswerAsMuchAsOne() {
        let calendar = Calendar(identifier: .gregorian)
        let now = t0.addingTimeInterval(60)
        func interest(_ events: [HarnessEvent]) -> Double {
            var ledger = HarnessLedger()
            for event in events { ledger.note(event) }
            return HarnessProfile.make(ledger, now: now, calendar: calendar).interest["NVDA"] ?? 0
        }
        let question = interest([ask("NVDA", 0)])
        let tap = interest([HarnessEvent(kind: .opened, at: t0, symbol: "NVDA", step: .asset)])
        let answer = interest([HarnessEvent(kind: .returned, at: t0, symbol: "NVDA", step: .asset)])
        XCTAssertEqual(tap / question, 0.5, accuracy: 0.001, "they looked and did nothing with it")
        XCTAssertEqual(answer / question, 1, accuracy: 0.001, "on top of the question, save or pick that answered it")
        XCTAssertLessThan(tap, answer)
        // Their own second question about the same read counts twice; a read Bobby started counts once.
        let thread = interest([HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", thread: true)])
        XCTAssertEqual(thread / question, 2, accuracy: 0.001)
        XCTAssertEqual(interest([HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", origin: .followUp)]) / question, 1, accuracy: 0.001)
        XCTAssertEqual(HarnessProfile.weights[.sent], nil, "being shown something says nothing about them")
        XCTAssertEqual(HarnessProfile.weights[.appOpen], nil)
    }

    func testAThesisRaisesItsAssetAndDoesNotFade() {
        let calendar = Calendar(identifier: .gregorian)
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .thesis, at: t0, symbol: "NVDA", horizon: .long))
        ledger.note(ask("TSLA", 0))
        ledger.note(ask("TSLA", 60))
        var profile = HarnessProfile.make(ledger, now: t0.addingTimeInterval(120), calendar: calendar)
        XCTAssertEqual(profile.interest["NVDA"] ?? 0, 2, accuracy: 0.001)
        XCTAssertEqual(profile.favourite(among: ["TSLA", "NVDA"]), "NVDA", "a thesis says more than two questions")
        profile = .make(ledger, now: t0.addingTimeInterval(50 * 86_400), calendar: calendar)
        XCTAssertEqual(profile.interest["NVDA"] ?? 0, 2, accuracy: 0.001, "it counts while the thesis is active, however long ago it was written")
        XCTAssertLessThan(profile.interest["TSLA"] ?? 1, 0.05)
        // One thesis, one weight: a pointer written twice is not two theses.
        ledger.note(HarnessEvent(kind: .thesis, at: t0.addingTimeInterval(10), symbol: "NVDA", horizon: .long))
        XCTAssertEqual(HarnessProfile.make(ledger, now: t0.addingTimeInterval(120), calendar: calendar).interest["NVDA"] ?? 0, 2, accuracy: 0.001)
    }

    func testInterestFadesAndRepeatedActionsWeighMore() {
        var ledger = HarnessLedger()
        ledger.note(ask("OLD", 0))
        ledger.note(ask("NEW", 14 * 86_400))
        ledger.note(ask("LOVED", 14 * 86_400))
        ledger.note(HarnessEvent(kind: .saved, at: t0.addingTimeInterval(14 * 86_400 + 5), symbol: "LOVED"))
        let profile = HarnessProfile.make(ledger, now: t0.addingTimeInterval(14 * 86_400 + 10), calendar: Calendar(identifier: .gregorian))
        XCTAssertEqual(profile.interest["OLD"] ?? 0, 0.25, accuracy: 0.01, "two half-lives ago")
        XCTAssertEqual(profile.favourite(among: ["OLD", "NEW", "LOVED"]), "LOVED")
        XCTAssertEqual(profile.favourite(among: ["OLD", "NEW"]), "NEW")
        XCTAssertNil(profile.favourite(among: []))
    }

    func testAKindRestsOnlyWhenShownTwiceAndNeverAnswered() {
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .sent, at: t0, symbol: "NVDA", step: .asset))
        var profile = HarnessProfile.make(ledger, now: t0.addingTimeInterval(60), calendar: Calendar(identifier: .gregorian))
        XCTAssertFalse(profile.rests(.asset))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(86_400), symbol: "NVDA", step: .asset))
        // Both were tapped. A tap is kept, and the kind rests all the same.
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(30), symbol: "NVDA", step: .asset, ref: t0))
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(86_400 + 30), symbol: "NVDA", step: .asset, ref: t0.addingTimeInterval(86_400)))
        profile = .make(ledger, now: t0.addingTimeInterval(2 * 86_400), calendar: Calendar(identifier: .gregorian))
        XCTAssertTrue(profile.rests(.asset))
        XCTAssertFalse(profile.rests(.week))
        XCTAssertEqual(profile.sent[.asset], 2)
        XCTAssertNil(profile.answered[.asset], "two taps are no answer")
        XCTAssertEqual(ledger.events(.opened).count, 2, "they are still written down")
        ledger.note(HarnessEvent(kind: .returned, at: t0.addingTimeInterval(86_400 + 60), symbol: "NVDA", step: .asset))
        profile = .make(ledger, now: t0.addingTimeInterval(2 * 86_400), calendar: Calendar(identifier: .gregorian))
        XCTAssertFalse(profile.rests(.asset), "one answer is enough")
        XCTAssertEqual(profile.answered[.asset], 1)
        profile = .make(ledger, now: t0.addingTimeInterval(40 * 86_400), calendar: Calendar(identifier: .gregorian))
        XCTAssertFalse(profile.rests(.asset), "after a month the count starts again")
    }

    func testTheUnansweredStreakCountsWhatWasShownSinceTheLastAnswer() {
        var ledger = HarnessLedger()
        XCTAssertEqual(ledger.unansweredStreak(before: t0).count, 0)
        ledger.note(HarnessEvent(kind: .sent, at: t0, symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .returned, at: t0.addingTimeInterval(60), symbol: "NVDA", step: .asset, ref: t0))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(86_400), symbol: "NVDA", step: .sector, sector: "semis"))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(2 * 86_400), symbol: "NVDA", step: .week))
        var streak = ledger.unansweredStreak(before: t0.addingTimeInterval(3 * 86_400))
        XCTAssertEqual(streak.count, 2, "the one they answered ended the streak before it")
        XCTAssertEqual(streak.last, t0.addingTimeInterval(2 * 86_400))
        XCTAssertEqual(ledger.unansweredStreak(before: t0.addingTimeInterval(30)).count, 1, "only what has happened by then")
        // Tapping the last two, and picking a chip in the app, ends nothing.
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(86_400 + 60), symbol: "NVDA", step: .sector, sector: "semis", ref: t0.addingTimeInterval(86_400)))
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(2 * 86_400 + 60), symbol: "NVDA", step: .week, ref: t0.addingTimeInterval(2 * 86_400)))
        ledger.note(HarnessEvent(kind: .picked, at: t0.addingTimeInterval(2 * 86_400 + 120), symbol: "NVDA"))
        streak = ledger.unansweredStreak(before: t0.addingTimeInterval(3 * 86_400))
        XCTAssertEqual(streak.count, 2)
    }

    func testEachReaderHasTheirOwnLedgerAndForgettingRemovesAllOfIt() {
        let store = HarnessStore(defaults: defaults)
        var mine = HarnessLedger(); mine.note(ask("NVDA", 0))
        var local = HarnessLedger(); local.note(ask("BTC", 0))
        store.write(mine, owner: "u1")
        store.write(local, owner: nil)
        store.write(.on, owner: "u1")
        store.write([HarnessPlanned(followUp: HarnessFollowUp(step: .asset, fireAt: t0, symbol: "NVDA"), handed: true)], owner: "u1")
        XCTAssertEqual(store.ledger(owner: "u1").events.compactMap(\.symbol), ["NVDA"])
        XCTAssertEqual(store.ledger(owner: nil).events.compactMap(\.symbol), ["BTC"])
        XCTAssertEqual(store.ledger(owner: "u2"), HarnessLedger())
        XCTAssertEqual(store.mode(owner: "u1"), .on)
        XCTAssertEqual(store.mode(owner: nil), .undecided)
        XCTAssertEqual(store.plan(owner: "u1").count, 1)
        HarnessStore.forgetOwner("u1", defaults: defaults)
        XCTAssertEqual(store.ledger(owner: "u1"), HarnessLedger())
        XCTAssertEqual(store.mode(owner: "u1"), .undecided)
        XCTAssertEqual(store.plan(owner: "u1"), [])
        XCTAssertEqual(store.ledger(owner: nil).events.count, 1, "another reader's ledger is untouched")
        XCTAssertFalse(defaults.dictionaryRepresentation().keys.contains { $0.contains("u1") })
    }

    func testWhatIsStoredHoldsNoQuestionText() throws {
        let store = HarnessStore(defaults: defaults)
        var ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        store.write(ledger, owner: nil)
        let data = try XCTUnwrap(defaults.data(forKey: HarnessStore.key(HarnessStore.prefix, owner: nil)))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let event = try XCTUnwrap((object["events"] as? [[String: Any]])?.first)
        XCTAssertEqual(Set(event.keys), ["kind", "at", "symbol", "name", "isEquity", "price"], "a symbol, a price, a moment: nothing else")
    }

    func testWhatThePersonSaidAboutTheirHorizonIsKeptAsFixedValuesNeverWords() throws {
        let store = HarnessStore(defaults: defaults)
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 10, origin: .followUp, horizon: .month))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(1), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 10, thread: true, horizon: .long))
        ledger.note(HarnessEvent(kind: .saved, at: t0.addingTimeInterval(2), symbol: "NVDA", horizonHours: 168))
        ledger.note(HarnessEvent(kind: .saved, at: t0.addingTimeInterval(3), symbol: "NVDA", horizonHours: 36))
        ledger.note(HarnessEvent(kind: .thesis, at: t0.addingTimeInterval(4), symbol: "NVDA", horizon: .long))
        store.write(ledger, owner: nil)
        XCTAssertEqual(store.ledger(owner: nil), ledger, "it reads back as written")
        let data = try XCTUnwrap(defaults.data(forKey: HarnessStore.key(HarnessStore.prefix, owner: nil)))
        let events = try XCTUnwrap((try JSONSerialization.jsonObject(with: data) as? [String: Any])?["events"] as? [[String: Any]])
        XCTAssertEqual(events.map { Set($0.keys) }, [
            ["kind", "at", "symbol", "name", "isEquity", "price", "origin", "horizon"],
            ["kind", "at", "symbol", "name", "isEquity", "price", "thread", "horizon"],
            ["kind", "at", "symbol", "horizonHours"],
            ["kind", "at", "symbol"],
            ["kind", "at", "symbol", "horizon"],
        ], "36 hours is not a choice the save offers: it is not kept")
        XCTAssertEqual(events[0]["origin"] as? String, "followUp")
        XCTAssertEqual(events[0]["horizon"] as? String, "month")
        XCTAssertEqual(events[2]["horizonHours"] as? Int, 168)
        XCTAssertEqual(events[4]["kind"] as? String, "thesis")
        // Every value is one of a handful: a horizon out of the desk's five, 24, 72 or 168 hours.
        XCTAssertEqual(HarnessHorizon.allCases.map(\.rawValue), ["intraday", "week", "month", "long", "unspecified"])
        XCTAssertEqual(HarnessLedger.saveHorizons, [24, 72, 168])
        XCTAssertNil(HarnessHorizon(named: "next quarter, when the new chips ship"))
        XCTAssertNil(HarnessHorizon(named: 7))
        XCTAssertEqual(HarnessHorizon(named: "week"), .week)
    }

    func testALedgerWrittenBeforeTheseFieldsExistedStillReads() throws {
        // What the first 1.8 build stored: milliseconds, and none of origin, thread, horizon, horizonHours.
        let old = #"{"events":[{"kind":"ask","at":1800000000000,"symbol":"NVDA","name":"NVIDIA","isEquity":true,"price":187.4},"#
            + #"{"kind":"sent","at":1800086400000,"symbol":"NVDA","step":"asset"},"#
            + #"{"kind":"opened","at":1800086460000,"symbol":"NVDA","step":"asset","ref":1800086400000}]}"#
        defaults.set(Data(old.utf8), forKey: HarnessStore.key(HarnessStore.prefix, owner: nil))
        let ledger = HarnessStore(defaults: defaults).ledger(owner: nil)
        XCTAssertEqual(ledger.events.map(\.kind), [.ask, .sent, .opened])
        XCTAssertEqual(ledger.question(before: t0.addingTimeInterval(2 * 86_400))?.symbol, "NVDA", "an ask with no origin is the person's own")
        XCTAssertEqual(ledger.unansweredStreak(before: t0.addingTimeInterval(2 * 86_400)).count, 1, "and the tap it held answers nothing now")
    }

    func testTheHorizonsMapToAWaitThatIsNeverShorterThanADay() {
        XCTAssertEqual(HarnessHorizon.allCases.map(\.waitDays), [1, 3, 7, nil, 1], "intraday, week, month, long, unspecified")
        XCTAssertEqual(ThesisHorizon.allCases.map { HarnessHorizon(thesis: $0) }, [.month, .long, .long, .long], "weeks, months, year, years")
    }

    func testAThesisPointerLastsAsLongAsItsThesisAndTheRestIsStillBounded() {
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .thesis, at: t0, symbol: "NVDA", horizon: .long))
        ledger.note(ask("OLD", 10))
        for i in 0..<(HarnessLedger.maxEvents + 40) { ledger.note(ask("TSLA", Double(HarnessLedger.retentionDays + 1) * 86_400 + Double(i))) }
        XCTAssertEqual(ledger.events.count, HarnessLedger.maxEvents)
        XCTAssertEqual(ledger.events(.thesis).map(\.symbol), ["NVDA"], "neither the sixty days nor the count takes it")
        XCTAssertFalse(ledger.events.contains { $0.symbol == "OLD" }, "everything else still goes")
        // It goes when its thesis does (HarnessCenter removes it), and with everything else on an erase.
        ledger.remove { $0.kind == .thesis }
        XCTAssertTrue(ledger.events(.thesis).isEmpty)
    }

    func testWhatWasHeldBackUntilTheYesCompletesTheEntryItBelongsTo() {
        var ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        ledger.note(HarnessEvent(kind: .saved, at: t0.addingTimeInterval(5), symbol: "NVDA"))
        XCTAssertTrue(ledger.complete(HarnessEvent(kind: .ask, at: t0, symbol: "nvda", thread: true, horizon: .month)))
        XCTAssertTrue(ledger.complete(HarnessEvent(kind: .saved, at: t0.addingTimeInterval(5), symbol: "NVDA", horizonHours: 72)))
        XCTAssertEqual(ledger.events.first?.horizon, .month)
        XCTAssertEqual(ledger.events.first?.thread, true)
        XCTAssertEqual(ledger.events.first?.price, 10, "what was already written stays")
        XCTAssertEqual(ledger.events.last?.horizonHours, 72)
        XCTAssertFalse(ledger.complete(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(1), symbol: "NVDA", horizon: .long)), "no entry at that moment")
        XCTAssertFalse(ledger.complete(HarnessEvent(kind: .ask, at: t0, symbol: "TSLA", horizon: .long)), "nor for that asset")
        XCTAssertEqual(ledger.events.count, 2, "completing never adds one")
    }

    func testTheLedgerCanBeReadAsItWasAtAnEarlierMoment() {
        var ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        ledger.note(ask("TSLA", 100))
        XCTAssertEqual(ledger.upTo(t0.addingTimeInterval(50)).events.compactMap(\.symbol), ["NVDA"])
        XCTAssertEqual(ledger.upTo(t0.addingTimeInterval(100)), ledger)
        XCTAssertTrue(ledger.upTo(t0.addingTimeInterval(-1)).isEmpty)
    }

    func testMergingKeepsEveryEventInOrder() {
        var a = HarnessLedger(); a.note(ask("NVDA", 100))
        var b = HarnessLedger(); b.note(ask("BTC", 50)); b.note(ask("ETH", 150))
        a.merge(b)
        XCTAssertEqual(a.events.compactMap(\.symbol), ["BTC", "NVDA", "ETH"])
    }
}
