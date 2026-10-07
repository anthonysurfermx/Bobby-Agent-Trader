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

    func testTheAnchorIsTheLatestQuestionOrAnswer() {
        var ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        ledger.note(HarnessEvent(kind: .appOpen, at: t0.addingTimeInterval(10)))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(20), symbol: "NVDA", step: .asset))
        XCTAssertEqual(ledger.anchor(before: t0.addingTimeInterval(30))?.kind, .ask)
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(40), symbol: "NVDA", step: .asset))
        XCTAssertEqual(ledger.anchor(before: t0.addingTimeInterval(50))?.kind, .opened)
        XCTAssertEqual(ledger.anchor(before: t0.addingTimeInterval(30))?.kind, .ask, "the clock decides what has happened yet")
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
        profile = .make(ledger, now: t0.addingTimeInterval(2 * 86_400), calendar: Calendar(identifier: .gregorian))
        XCTAssertTrue(profile.rests(.asset))
        XCTAssertFalse(profile.rests(.week))
        ledger.note(HarnessEvent(kind: .returned, at: t0.addingTimeInterval(86_400 + 60), symbol: "NVDA", step: .asset))
        profile = .make(ledger, now: t0.addingTimeInterval(2 * 86_400), calendar: Calendar(identifier: .gregorian))
        XCTAssertFalse(profile.rests(.asset), "one answer is enough")
        profile = .make(ledger, now: t0.addingTimeInterval(40 * 86_400), calendar: Calendar(identifier: .gregorian))
        XCTAssertFalse(profile.rests(.asset), "after a month the count starts again")
    }

    func testTheUnansweredStreakCountsWhatWasShownSinceTheLastAnswer() {
        var ledger = HarnessLedger()
        XCTAssertEqual(ledger.unansweredStreak(before: t0).count, 0)
        ledger.note(HarnessEvent(kind: .sent, at: t0, symbol: "NVDA", step: .asset))
        ledger.note(HarnessEvent(kind: .opened, at: t0.addingTimeInterval(60), symbol: "NVDA", step: .asset, ref: t0))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(86_400), symbol: "NVDA", step: .sector, sector: "semis"))
        ledger.note(HarnessEvent(kind: .sent, at: t0.addingTimeInterval(2 * 86_400), symbol: "NVDA", step: .week))
        let streak = ledger.unansweredStreak(before: t0.addingTimeInterval(3 * 86_400))
        XCTAssertEqual(streak.count, 2, "the one they opened ended the streak before it")
        XCTAssertEqual(streak.last, t0.addingTimeInterval(2 * 86_400))
        XCTAssertEqual(ledger.unansweredStreak(before: t0.addingTimeInterval(30)).count, 1, "only what has happened by then")
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

    func testMergingKeepsEveryEventInOrder() {
        var a = HarnessLedger(); a.note(ask("NVDA", 100))
        var b = HarnessLedger(); b.note(ask("BTC", 50)); b.note(ask("ETH", 150))
        a.merge(b)
        XCTAssertEqual(a.events.compactMap(\.symbol), ["BTC", "NVDA", "ETH"])
    }
}
