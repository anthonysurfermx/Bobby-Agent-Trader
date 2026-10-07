import Foundation
import XCTest
@testable import Bobby

/// What 1.8 adds to the desk request and reply is additive and optional: a server that knows none
/// of it is read exactly as before, and malformed additions are dropped, never trusted.
@MainActor
final class V18WireTests: XCTestCase {
    private func body(_ extra: [String: Any] = [:]) -> [String: Any] {
        var body: [String: Any] = [
            "symbol": "NVDA",
            "technicals": ["price": 120.5, "rsi14": 55.0],
            "provenance": ["provider": "Yahoo Finance", "asOf": "2026-10-07T12:00:00Z"],
            "agents": ["alpha": "Alpha says", "red": "Red says", "cio": "CIO says", "verdict": "wait", "direction": "none"],
        ]
        body.merge(extra) { _, new in new }
        return body
    }

    private func debate(_ json: [String: Any]) -> NucleoDeskIO.Debate? {
        if case let .ok(debate) = NucleoDeskIO.parseDebate(status: 200, json: json, headers: [:]) { return debate }
        return nil
    }

    func testAReplyWithoutThe18FieldsReadsExactlyAsBefore() throws {
        let debate = try XCTUnwrap(debate(body()))
        XCTAssertNil(debate.memory)
        XCTAssertNil(debate.review)
        XCTAssertEqual(debate.verdict, "wait")
    }

    func testTheMemoryReceiptIsFactsOnlyAndBadNumbersAreDropped() throws {
        let good = try XCTUnwrap(debate(body(["memory": ["recorded": true, "asks": 3, "lastAskedDaysAgo": 5, "changeSinceLastAskPct": 4.25]])))
        XCTAssertEqual(good.memory, MemoryReceipt(recorded: true, asks: 3, lastAskedDaysAgo: 5, changeSinceLastAskPct: 4.25))
        let first = try XCTUnwrap(debate(body(["memory": ["recorded": true, "asks": 1, "lastAskedDaysAgo": NSNull(), "changeSinceLastAskPct": NSNull()]])))
        XCTAssertEqual(first.memory, MemoryReceipt(recorded: true, asks: 1))
        let wild = try XCTUnwrap(debate(body(["memory": ["recorded": false, "asks": 2, "lastAskedDaysAgo": "soon", "changeSinceLastAskPct": 9.9e9]])))
        XCTAssertEqual(wild.memory, MemoryReceipt(recorded: false, asks: 2), "numbers that make no sense are dropped, not guessed")
        let paused = try XCTUnwrap(debate(body(["memory": ["recorded": false, "asks": 0]])))
        XCTAssertEqual(paused.memory, MemoryReceipt(recorded: false, asks: 0))
        // An incomplete receipt is no receipt: an unknown count never becomes a zero.
        for junk in [["asks": 2] as Any, "yes", 1, ["recorded": "true"], ["recorded": true], ["recorded": true, "asks": 0],
                     ["recorded": true, "asks": -4], ["recorded": false, "asks": "many"]] {
            XCTAssertNil(try XCTUnwrap(debate(body(["memory": junk]))).memory, "\(junk)")
        }
    }

    func testTheReviewListsAreBoundedTrimmedAndOnlyKnownEvidenceGapsAreKept() throws {
        let long = String(repeating: "x", count: 900)
        let supports: [Any] = ["  Price holds above the 50-day average  ", "", 7, "b", "c", "d", "e"]
        let notChecked: [Any] = ["news", "earnings", "the moon", 3, "filings"]
        let payload: [String: Any] = ["supports": supports, "challenges": [long], "unknowns": "not a list", "notChecked": notChecked]
        let parsed = try XCTUnwrap(debate(body(["review": payload])))
        let review = try XCTUnwrap(parsed.review)
        XCTAssertEqual(review.supports, ["Price holds above the 50-day average", "b", "c", "d"])
        XCTAssertEqual(review.challenges.first?.count, ThesisReviewNotes.textLimit)
        XCTAssertEqual(review.unknowns, [String]())
        XCTAssertEqual(review.notChecked, ["news", "earnings", "filings"])
        XCTAssertFalse(review.isEmpty)
        XCTAssertNil(try XCTUnwrap(debate(body(["review": "nope"]))).review)
    }

    func testAThesisTravelsAsThePersonsWordsAndEmptyPartsAreOmitted() throws {
        let created = Date(timeIntervalSince1970: 1_800_000_000)
        var thesis = SavedThesis(id: "t1", symbol: "NVDA", name: "NVIDIA", isEquity: true, status: .active, horizon: .months,
                                 hypothesis: "Margins recover", worry: "", changeMind: "Two weak quarters", createdAt: created, updatedAt: created,
                                 lastReviewedAt: nil, sourceRequestId: nil,
                                 revisions: [ThesisRevision(at: created, kind: .created, price: 100, asOf: "2026-10-07T12:00:00Z", verdict: "wait")])
        var json = ThesisContext(thesis).json
        XCTAssertEqual(json["hypothesis"] as? String, "Margins recover")
        XCTAssertNil(json["worry"], "an empty field is not sent")
        XCTAssertEqual(json["changeMind"] as? String, "Two weak quarters")
        XCTAssertEqual(json["horizon"] as? String, "months")
        XCTAssertEqual(json["priceAtSave"] as? Double, 100)
        XCTAssertEqual(json["savedAt"] as? String, "2027-01-15T08:00:00Z")
        XCTAssertNil(json["lastReviewedAt"])
        XCTAssertEqual(Set(json.keys), ["hypothesis", "changeMind", "horizon", "priceAtSave", "savedAt"], "nothing else about the person travels")
        thesis.horizon = nil
        thesis.lastReviewedAt = created.addingTimeInterval(86_400)
        thesis.revisions = [ThesisRevision(at: created, kind: .created)]
        json = ThesisContext(thesis).json
        XCTAssertNil(json["horizon"])
        XCTAssertNil(json["priceAtSave"])
        XCTAssertEqual(json["lastReviewedAt"] as? String, "2027-01-16T08:00:00Z")
        XCTAssertTrue(JSONSerialization.isValidJSONObject(json))
    }

    func testFocusHandOffsAreConsumedOnce() {
        V18Focus.thesisId = "t1"
        V18Focus.draftRequestId = "r1"
        XCTAssertEqual(V18Focus.takeThesisId(), "t1")
        XCTAssertNil(V18Focus.takeThesisId())
        XCTAssertEqual(V18Focus.takeDraftRequestId(), "r1")
        XCTAssertNil(V18Focus.takeDraftRequestId())
        V18Focus.thesisId = "t2"
        V18Focus.clear()
        XCTAssertNil(V18Focus.takeThesisId())
    }

    func testEvery18ScreenIsNativeOnly() {
        for route in [NucleoRoute.credits, .theses, .thesisEditor, .thesisReview, .memory, .memoryConsent, .reminders, .briefingSettings] {
            XCTAssertFalse(NucleoRoute.openable.contains(route.rawValue), route.rawValue)
        }
        XCTAssertEqual(NucleoRoute.openable, ["squad", "locker", "isla", "account", "riskNotice", "levels"], "the page opens exactly what 1.7 could")
    }
}
