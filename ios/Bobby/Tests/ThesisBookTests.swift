import Foundation
import XCTest
@testable import Bobby

/// The thesis book (1.8): the person's own words about an asset, on this phone only. These pin
/// the promises the product makes about it: three active at most, one per asset, never empty,
/// dated history, erased with the account, and never merged into another account's book.
final class ThesisBookTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() {
        super.setUp()
        suiteName = "thesis.book.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        super.tearDown()
    }

    private func draft(_ symbol: String, _ hypothesis: String = "Margins should recover as supply eases", price: Double? = 100) -> ThesisDraft {
        ThesisDraft(symbol: symbol, name: symbol, isEquity: true, horizon: .months, hypothesis: hypothesis,
                    worry: "Demand could slow", changeMind: "Two quarters of falling margins", sourceRequestId: "read-\(symbol)",
                    price: price, asOf: "2026-10-07T12:00:00Z", verdict: "wait")
    }

    func testAThesisKeepsThePersonsWordsAndWhereItStarted() throws {
        let saved = try book.create(draft("nvda", "  Margins   should\nrecover  "), owner: "u1", now: t0)
        XCTAssertEqual(saved.symbol, "NVDA")
        XCTAssertEqual(saved.hypothesis, "Margins should recover", "trimmed and single-spaced, never rewritten")
        XCTAssertEqual(saved.status, .active)
        XCTAssertEqual(saved.revisions.map(\.kind), [.created])
        XCTAssertEqual(saved.startingPoint?.price, 100)
        XCTAssertEqual(saved.startingPoint?.at, t0)
        XCTAssertNil(saved.lastReviewedAt)
        XCTAssertEqual(book.thesis(id: saved.id, owner: "u1"), saved, "it survives a round trip through the store")
        XCTAssertTrue(book.all(owner: "u2").isEmpty, "another account never sees it")
        XCTAssertTrue(book.all(owner: nil).isEmpty)
    }

    func testAnEmptyHypothesisIsNeverSaved() {
        XCTAssertThrowsError(try book.create(draft("NVDA", "   \n "), owner: nil)) { XCTAssertEqual($0 as? ThesisBook.BookError, .emptyHypothesis) }
        XCTAssertTrue(book.all(owner: nil).isEmpty)
    }

    func testTextIsCappedAtWhatThePersonCouldSee() throws {
        let long = String(repeating: "word ", count: 200)
        let saved = try book.create(draft("NVDA", long), owner: nil)
        XCTAssertEqual(saved.hypothesis.count, ThesisBook.textLimit)
    }

    func testThreeActiveAtMostAndAFourthAsksToArchive() throws {
        for symbol in ["NVDA", "BTC", "SAP.DE"] { try book.create(draft(symbol), owner: "u1", now: t0) }
        XCTAssertFalse(book.canAddActive(owner: "u1"))
        XCTAssertThrowsError(try book.create(draft("ETH"), owner: "u1")) { XCTAssertEqual($0 as? ThesisBook.BookError, .limitReached) }
        XCTAssertEqual(book.active(owner: "u1").count, 3)
        let first = try XCTUnwrap(book.activeThesis(symbol: "btc", owner: "u1"))
        try book.archive(id: first.id, owner: "u1", now: t0.addingTimeInterval(60))
        XCTAssertEqual(book.active(owner: "u1").count, 2)
        XCTAssertNoThrow(try book.create(draft("ETH"), owner: "u1", now: t0.addingTimeInterval(120)))
        XCTAssertEqual(Set(book.active(owner: "u1").map(\.symbol)), ["NVDA", "SAP.DE", "ETH"])
        XCTAssertEqual(book.archived(owner: "u1").map(\.symbol), ["BTC"])
        XCTAssertThrowsError(try book.reactivate(id: first.id, owner: "u1")) { XCTAssertEqual($0 as? ThesisBook.BookError, .limitReached) }
    }

    func testOneActiveThesisPerAsset() throws {
        let first = try book.create(draft("NVDA"), owner: nil, now: t0)
        XCTAssertThrowsError(try book.create(draft("nvda", "Another idea"), owner: nil)) {
            XCTAssertEqual($0 as? ThesisBook.BookError, .alreadyActive(id: first.id))
        }
        try book.archive(id: first.id, owner: nil, now: t0.addingTimeInterval(1))
        let second = try book.create(draft("NVDA", "Another idea"), owner: nil, now: t0.addingTimeInterval(2))
        XCTAssertThrowsError(try book.reactivate(id: first.id, owner: nil)) {
            XCTAssertEqual($0 as? ThesisBook.BookError, .alreadyActive(id: second.id))
        }
    }

    func testEditsReviewsAndKeepsAreDatedAndAnUnchangedEditRecordsNothing() throws {
        let saved = try book.create(draft("NVDA"), owner: nil, now: t0)
        let same = try book.edit(id: saved.id, owner: nil, horizon: saved.horizon, hypothesis: saved.hypothesis, worry: saved.worry,
                                 changeMind: saved.changeMind, now: t0.addingTimeInterval(10))
        XCTAssertEqual(same.revisions.count, 1)
        XCTAssertEqual(same.updatedAt, t0)
        let edited = try book.edit(id: saved.id, owner: nil, horizon: .year, hypothesis: "Data-centre demand stays strong", worry: "",
                                   changeMind: saved.changeMind, now: t0.addingTimeInterval(20))
        XCTAssertEqual(edited.revisions.map(\.kind), [.created, .edited])
        XCTAssertEqual(edited.horizon, .year)
        XCTAssertEqual(edited.worry, "")
        XCTAssertThrowsError(try book.edit(id: saved.id, owner: nil, horizon: nil, hypothesis: " ", worry: "", changeMind: "")) {
            XCTAssertEqual($0 as? ThesisBook.BookError, .emptyHypothesis)
        }
        let reviewAt = t0.addingTimeInterval(7 * 86_400)
        let reviewed = try book.recordReview(id: saved.id, owner: nil, price: 112, asOf: "2026-10-14T12:00:00Z", verdict: "review",
                                             supports: ["Price holds above the 50-day average", " "], challenges: ["Momentum is fading"],
                                             unknowns: ["Earnings were not checked"], now: reviewAt)
        XCTAssertEqual(reviewed.lastReviewedAt, reviewAt)
        XCTAssertEqual(reviewed.lastReview?.supports, ["Price holds above the 50-day average"], "blank lines are dropped")
        XCTAssertEqual(reviewed.lastReview?.price, 112)
        XCTAssertEqual(reviewed.startingPoint?.price, 100, "the starting point never moves")
        let kept = try book.keep(id: saved.id, owner: nil, now: reviewAt.addingTimeInterval(30))
        XCTAssertEqual(kept.revisions.map(\.kind), [.created, .edited, .reviewed, .kept])
        XCTAssertThrowsError(try book.keep(id: "missing", owner: nil)) { XCTAssertEqual($0 as? ThesisBook.BookError, .notFound) }
    }

    func testHistoryIsBoundedAndNeverLosesWhereItStarted() throws {
        let saved = try book.create(draft("NVDA"), owner: nil, now: t0)
        for i in 1...(ThesisBook.revisionLimit + 10) {
            try book.keep(id: saved.id, owner: nil, now: t0.addingTimeInterval(Double(i)))
        }
        let thesis = try XCTUnwrap(book.thesis(id: saved.id, owner: nil))
        XCTAssertEqual(thesis.revisions.count, ThesisBook.revisionLimit)
        XCTAssertEqual(thesis.revisions.first?.kind, .created)
        XCTAssertEqual(thesis.startingPoint?.price, 100)
    }

    func testDeletingIsCompleteAndScopedToItsOwner() throws {
        let mine = try book.create(draft("NVDA"), owner: "u1", now: t0)
        try book.create(draft("BTC"), owner: "u1", now: t0)
        try book.create(draft("NVDA"), owner: "u2", now: t0)
        try book.create(draft("ETH"), owner: nil, now: t0)
        book.delete(id: mine.id, owner: "u1")
        XCTAssertEqual(book.all(owner: "u1").map(\.symbol), ["BTC"])
        book.deleteAll(owner: "u1")
        XCTAssertTrue(book.all(owner: "u1").isEmpty)
        XCTAssertEqual(book.all(owner: "u2").count, 1, "another account's theses are untouched")
        XCTAssertEqual(book.all(owner: nil).count, 1, "the guest book is untouched")
        ThesisBook.forgetOwner("u2", defaults: defaults)
        XCTAssertTrue(book.all(owner: "u2").isEmpty, "account deletion removes that account's book")
        XCTAssertNil(defaults.object(forKey: ThesisBook.key(owner: "u1")), "nothing of a deleted book remains in the store")
    }

    func testGuestThesesFollowThePersonIntoANewAccountOnceAndNeverMerge() throws {
        try book.create(draft("NVDA"), owner: nil, now: t0)
        try book.create(draft("BTC"), owner: nil, now: t0)
        XCTAssertEqual(book.adoptLocal(into: "u1"), 2)
        XCTAssertEqual(Set(book.active(owner: "u1").map(\.symbol)), ["NVDA", "BTC"])
        XCTAssertTrue(book.all(owner: nil).isEmpty, "they moved; no copy stays behind for the next person on this phone")
        try book.create(draft("ETH"), owner: nil, now: t0)
        XCTAssertEqual(book.adoptLocal(into: "u1"), 0, "an account that already has theses never absorbs another book")
        XCTAssertEqual(book.all(owner: nil).count, 1)
        XCTAssertEqual(book.all(owner: "u1").count, 2)
    }

    func testArchivedThesesAreBoundedButActiveOnesNeverFallOff() throws {
        for i in 0..<(ThesisBook.archivedLimit + 5) {
            let saved = try book.create(draft("SYM\(i)"), owner: nil, now: t0.addingTimeInterval(Double(i)))
            try book.archive(id: saved.id, owner: nil, now: t0.addingTimeInterval(Double(i) + 0.5))
        }
        let keep = try book.create(draft("KEEP"), owner: nil, now: t0)
        XCTAssertEqual(book.archived(owner: nil).count, ThesisBook.archivedLimit)
        XCTAssertEqual(book.archived(owner: nil).first?.symbol, "SYM\(ThesisBook.archivedLimit + 4)", "the newest archived come first")
        XCTAssertNotNil(book.thesis(id: keep.id, owner: nil))
    }

    func testAChangeIsAnnouncedForItsOwner() throws {
        let expectation = expectation(forNotification: ThesisBook.didChange, object: nil) { note in
            (note.object as? String) == ThesisBook.key(owner: "u1")
        }
        try book.create(draft("NVDA"), owner: "u1", now: t0)
        wait(for: [expectation], timeout: 1)
    }
}
