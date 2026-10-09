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
        // The event stays in the ledger, but only their own question belongs to the learned assets.
        XCTAssertEqual(ledger.events(.ask).count, 3)
        XCTAssertEqual(ledger.asset("TSLA", since: t0, now: t0.addingTimeInterval(90))?.asks, 1)
    }

    func testAnAppOpeningIsRefusedAndOnesKeptByTheFirstBuildAreDropped() throws {
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .appOpen, at: t0))
        XCTAssertTrue(ledger.isEmpty, "the ledger does not take one")
        // A ledger the first 1.8 build wrote: the openings go with the next thing written.
        let encoder = JSONEncoder(), decoder = JSONDecoder()
        let old = try encoder.encode(["events": [HarnessEvent(kind: .appOpen, at: t0), HarnessEvent(kind: .appOpen, at: t0.addingTimeInterval(1_800))]])
        ledger = try decoder.decode(HarnessLedger.self, from: old)
        XCTAssertEqual(ledger.events.count, 2)
        ledger.note(ask("NVDA", 3_600))
        XCTAssertEqual(ledger.events.map(\.kind), [.ask])
    }

    func testOnlyARealAnswerIsAnAnswer() {
        let kinds: [HarnessEvent.Kind] = [.ask, .saved, .appOpen, .sent, .opened, .returned, .picked, .thesis]
        XCTAssertEqual(kinds.filter { HarnessEvent(kind: $0, at: t0).isAnswer }, [.returned], "not a tap, and not a pick that answers no follow-up")
        XCTAssertTrue(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA").isQuestion)
        XCTAssertFalse(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", origin: .followUp).isQuestion)
        XCTAssertFalse(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", readId: "stored-read").isQuestion)
        XCTAssertFalse(HarnessEvent(kind: .picked, at: t0, symbol: "NVDA").isQuestion)
    }

    func testOnlyOwnQuestionsExplicitSavesAndThesesTeachAssetInterest() {
        let calendar = Calendar(identifier: .gregorian)
        let now = t0.addingTimeInterval(60)
        func interest(_ events: [HarnessEvent]) -> Double {
            var ledger = HarnessLedger()
            for event in events { ledger.note(event) }
            return HarnessProfile.make(ledger, now: now, calendar: calendar).interest["NVDA"] ?? 0
        }
        let question = interest([ask("NVDA", 0)])
        for kind in [HarnessEvent.Kind.opened, .picked, .returned] {
            XCTAssertEqual(interest([HarnessEvent(kind: kind, at: t0, symbol: "NVDA", step: .asset)]), 0,
                           "\(kind) answers Bobby's timing, never states an asset preference")
        }
        // Their own second question counts twice. Repeating Bobby's question contributes no interest.
        let thread = interest([HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", thread: true)])
        XCTAssertEqual(thread / question, 2, accuracy: 0.001)
        XCTAssertEqual(interest([HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", origin: .followUp, thread: true)]), 0)
        XCTAssertEqual(interest([HarnessEvent(kind: .saved, at: t0, symbol: "NVDA")]) / question, 1, accuracy: 0.001,
                       "a save is their explicit choice, including when Bobby offered the read")
        XCTAssertEqual(HarnessProfile.weights[.sent], nil, "being shown something says nothing about them")
        XCTAssertEqual(HarnessProfile.weights[.appOpen], nil)
    }

    func testRepeatedBobbyOffersCannotManufactureAFavouriteAsset() {
        let calendar = Calendar(identifier: .gregorian), now = t0.addingTimeInterval(300)
        var ledger = HarnessLedger(); ledger.note(ask("MU", 0)); ledger.note(ask("BTC", 1))
        let before = HarnessProfile.make(ledger, now: now, calendar: calendar)
        for i in 0..<40 {
            let at = t0.addingTimeInterval(Double(i + 2))
            ledger.note(HarnessEvent(kind: .ask, at: at, symbol: "NVDA", origin: .followUp))
            ledger.note(HarnessEvent(kind: .opened, at: at, symbol: "NVDA", step: .asset))
            ledger.note(HarnessEvent(kind: .picked, at: at, symbol: "NVDA"))
            ledger.note(HarnessEvent(kind: .returned, at: at, symbol: "NVDA", step: .asset))
        }
        let after = HarnessProfile.make(ledger, now: now, calendar: calendar)
        XCTAssertEqual(after.interest, before.interest)
        XCTAssertNil(ledger.asset("NVDA", since: t0, now: now))
        XCTAssertEqual(after.favourite(among: ["NVDA", "MU", "BTC"]), "BTC")
        XCTAssertEqual(after.answered[.asset], 40, "responses still teach whether the timing worked")
        XCTAssertNotNil(after.hour, "response timing is learned independently from interest")
    }

    func testLearningContextSeparatesOwnEvidenceFromBobbyAndContainsNoWords() throws {
        let now = t0.addingTimeInterval(300), calendar = Calendar(identifier: .gregorian)
        var ledger = HarnessLedger()
        ledger.note(ask("MU", 0))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(1), symbol: "MU", thread: true))
        ledger.note(HarnessEvent(kind: .saved, at: t0.addingTimeInterval(2), symbol: "MU"))
        ledger.note(HarnessEvent(kind: .thesis, at: t0.addingTimeInterval(3), symbol: "MU"))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(4), symbol: "MU", origin: .followUp))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(5), symbol: "NVDA", origin: .followUp))
        let context = HarnessLearningContext.make(ledger, now: now, calendar: calendar)
        XCTAssertEqual(context.version, 1); XCTAssertEqual(context.asOf, now)
        XCTAssertEqual(context.assets.map(\.symbol), ["MU"], "Bobby-only assets are not learned interests")
        let asset = try XCTUnwrap(context.assets.first)
        XCTAssertEqual(asset.ownQuestions, 2); XCTAssertEqual(asset.ownThreads, 1)
        XCTAssertEqual(asset.explicitSaves, 1); XCTAssertTrue(asset.activeThesis); XCTAssertEqual(asset.bobbyReads, 1)
        XCTAssertEqual(asset.lastOwnQuestionAt, t0.addingTimeInterval(1))
        XCTAssertEqual(asset.inferredInterest, HarnessProfile.make(ledger, now: now, calendar: calendar).interest["MU"])
        XCTAssertEqual(Mirror(reflecting: asset).children.compactMap(\.label),
                       ["symbol", "ownQuestions", "ownThreads", "explicitFollowUps", "explicitSaves", "activeThesis", "bobbyReads", "lastOwnQuestionAt", "inferredInterest"],
                       "no question, hypothesis, identity, or declared preference is exported")
    }

    func testLearningContextIsBoundedFreshAndDropsFutureEvidence() {
        let calendar = Calendar(identifier: .gregorian)
        var old = HarnessLedger(); old.note(ask("OLD", 0))
        let later = t0.addingTimeInterval(Double(HarnessLedger.retentionDays + 1) * 86_400)
        XCTAssertEqual(HarnessLearningContext.make(old, now: later, calendar: calendar).assets, [])
        XCTAssertEqual(HarnessProfile.make(old, now: later, calendar: calendar).interest, [:], "a read of stale storage needs no new write to expire")
        var ledger = HarnessLedger()
        for i in 0..<8 { ledger.note(ask("ASSET\(i)", Double(i))) }
        ledger.note(ask("FUTURE", 400))
        let context = HarnessLearningContext.make(ledger, now: t0.addingTimeInterval(300), calendar: calendar)
        XCTAssertEqual(context.assets.count, HarnessLearningContext.maxAssets)
        XCTAssertFalse(context.assets.contains { $0.symbol == "FUTURE" })
        XCTAssertEqual(context.assets.first?.symbol, "ASSET7")
        XCTAssertEqual(HarnessLearningContext.make(ledger, now: t0.addingTimeInterval(300), calendar: calendar,
                                                   eligibleSymbols: ["ASSET0"]).assets.map(\.symbol), ["ASSET0"],
                       "eligibility is applied before the bounded top five, so a due asset cannot disappear behind ineligible ones")
    }

    func testLearningContextFollowsItsOwnersStoreAndErasure() {
        let store = HarnessStore(defaults: defaults), now = t0.addingTimeInterval(300), calendar = Calendar(identifier: .gregorian)
        var a = HarnessLedger(); a.note(ask("MU", 0))
        var b = HarnessLedger(); b.note(ask("BTC", 0))
        store.write(a, owner: "a"); store.write(b, owner: "b")
        XCTAssertEqual(HarnessLearningContext.make(store.ledger(owner: "a"), now: now, calendar: calendar).assets.map(\.symbol), ["MU"])
        XCTAssertEqual(HarnessLearningContext.make(store.ledger(owner: "b"), now: now, calendar: calendar).assets.map(\.symbol), ["BTC"])
        store.forget(owner: "a")
        XCTAssertTrue(HarnessLearningContext.make(store.ledger(owner: "a"), now: now, calendar: calendar).assets.isEmpty)
        XCTAssertEqual(HarnessLearningContext.make(store.ledger(owner: "b"), now: now, calendar: calendar).assets.map(\.symbol), ["BTC"])
    }

    func testLegacySavedReadPointersAreNotOwnQuestionsOrDuplicateInterest() throws {
        let now = t0.addingTimeInterval(300), calendar = Calendar(identifier: .gregorian)
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: t0, symbol: "MU", readId: "stored-read"))
        XCTAssertNil(ledger.question(before: now))
        XCTAssertNil(ledger.asset("MU", since: t0, now: now))
        XCTAssertTrue(HarnessProfile.make(ledger, now: now, calendar: calendar).interest.isEmpty)
        ledger.note(HarnessEvent(kind: .saved, at: t0, symbol: "MU", readId: "stored-read"))
        let asset = try XCTUnwrap(HarnessLearningContext.make(ledger, now: now, calendar: calendar).assets.first)
        XCTAssertEqual(asset.ownQuestions, 0); XCTAssertEqual(asset.explicitSaves, 1)
        XCTAssertNil(asset.lastOwnQuestionAt)
        XCTAssertEqual(asset.inferredInterest, pow(0.5, 300 / 86_400 / HarnessProfile.halfLifeDays), accuracy: 0.000_001)
        XCTAssertEqual(ledger.events(.ask).count, 1, "the compatibility pointer is retained without teaching a question")
    }

    func testAnExplicitFollowUpChoiceKeepsBobbysOriginAndTeachesOnlyItsOwnBucket() throws {
        let requested = t0.addingTimeInterval(120), now = t0.addingTimeInterval(300)
        let calendar = Calendar(identifier: .gregorian)
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: t0, symbol: "MU", origin: .followUp, thread: true, followUpRequestedAt: requested))
        XCTAssertNil(ledger.question(before: now))
        XCTAssertEqual(ledger.followUpAnchor(before: now)?.at, t0, "the actual read timestamp stays factual")
        XCTAssertEqual(ledger.followUpAnchor(before: now)?.followUpAnchorAt, requested)
        XCTAssertTrue(ledger.assets(since: t0, now: now).isEmpty)
        XCTAssertEqual(ledger.followUpAssets(since: t0, now: now).first?.asks, 0)
        let context = HarnessLearningContext.make(ledger, now: now, calendar: calendar)
        let asset = try XCTUnwrap(context.assets.first)
        XCTAssertEqual(asset.ownQuestions, 0); XCTAssertEqual(asset.ownThreads, 0)
        XCTAssertEqual(asset.explicitFollowUps, 1); XCTAssertEqual(asset.bobbyReads, 1)
        XCTAssertNil(asset.lastOwnQuestionAt)
        XCTAssertEqual(asset.inferredInterest, pow(0.5, 180.0 / 86_400 / HarnessProfile.halfLifeDays), accuracy: 0.000_001,
                       "the explicit yes counts once, from its date, with no manufactured thread bonus")
        let copy = try JSONDecoder().decode(HarnessLedger.self, from: JSONEncoder().encode(ledger))
        XCTAssertEqual(copy, ledger)
        XCTAssertEqual(copy.events.first?.origin, .followUp)
        XCTAssertEqual(copy.events.first?.followUpRequestedAt, requested)
    }

    func testAFutureOrMalformedFollowUpChoiceCannotTeachInterestOrBecomeAnAnchor() {
        let calendar = Calendar(identifier: .gregorian), now = t0.addingTimeInterval(60)
        var ledger = HarnessLedger()
        ledger.note(HarnessEvent(kind: .ask, at: t0, symbol: "MU", origin: .followUp, followUpRequestedAt: t0.addingTimeInterval(120)))
        XCTAssertNil(ledger.followUpAnchor(before: now))
        XCTAssertTrue(HarnessProfile.make(ledger, now: now, calendar: calendar).interest.isEmpty)
        ledger.note(HarnessEvent(kind: .ask, at: t0, symbol: "NVDA", origin: .followUp, followUpRequestedAt: t0.addingTimeInterval(-1)))
        ledger.note(HarnessEvent(kind: .ask, at: t0, symbol: "BTC", origin: .followUp, readId: "saved", followUpRequestedAt: t0))
        XCTAssertNil(ledger.events.last?.followUpRequestedAt)
        XCTAssertTrue(HarnessLearningContext.make(ledger, now: now, calendar: calendar).assets.isEmpty)
    }

    func testCompletingOldMetadataDoesNotEraseAnExplicitFollowUpChoice() {
        var ledger = HarnessLedger()
        let original = HarnessEvent(kind: .ask, at: t0, symbol: "MU", origin: .followUp, followUpRequestedAt: t0.addingTimeInterval(60))
        ledger.note(original)
        XCTAssertTrue(ledger.complete(HarnessEvent(kind: .ask, at: t0, symbol: "MU", origin: .followUp)))
        XCTAssertEqual(ledger.events.first?.followUpRequestedAt, original.followUpRequestedAt)
    }

    func testAMixedAssetsLatestBaselineKeepsItsActualSource() throws {
        var ledger = HarnessLedger()
        ledger.note(ask("MU", 0, price: 100))
        ledger.note(HarnessEvent(kind: .ask, at: t0.addingTimeInterval(60), symbol: "MU", price: 110,
                                 origin: .followUp, followUpRequestedAt: t0.addingTimeInterval(120)))
        var asset = try XCTUnwrap(ledger.followUpAssets(since: t0, now: t0.addingTimeInterval(180)).first)
        XCTAssertEqual(asset.asks, 1)
        XCTAssertFalse(asset.lastAskedByPerson, "an older own question cannot rename a newer Bobby baseline")
        XCTAssertEqual(asset.lastPrice, 110)
        XCTAssertEqual(asset.lastAskedAt, t0.addingTimeInterval(120))
        ledger.note(ask("MU", 240, price: 115))
        asset = try XCTUnwrap(ledger.followUpAssets(since: t0, now: t0.addingTimeInterval(300)).first)
        XCTAssertTrue(asset.lastAskedByPerson)
        XCTAssertEqual(asset.asks, 2); XCTAssertEqual(asset.lastPrice, 115)
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
