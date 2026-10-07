import Foundation
import XCTest
@testable import Bobby

/// The reminders screen (1.8), as a pure mapping: which theses it lists, in which order, what is
/// open when it appears, and that every state has a review fixture.
@MainActor
final class ReminderSheetTests: XCTestCase {
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    private func thesis(_ symbol: String, _ why: String = "Why I am looking at this") -> SavedThesis {
        SavedThesis(id: UUID().uuidString, symbol: symbol, name: symbol + " Inc", isEquity: true, status: .active, horizon: nil,
                    hypothesis: why, worry: "", changeMind: "", createdAt: t0, updatedAt: t0, lastReviewedAt: nil,
                    sourceRequestId: nil, revisions: [ThesisRevision(at: t0, kind: .created)])
    }

    func testEachThesisShowsItsOwnReminderOrNone() {
        let nvda = thesis("NVDA", "Margins should recover"), btc = thesis("BTC"), spy = thesis("SPY")
        let fire = t0.addingTimeInterval(7 * 86_400)
        let model = RemindersModel.make(theses: [nvda, btc, spy],
                                        pending: [PendingReminder(thesisId: btc.id, symbol: "BTC", fireAt: fire),
                                                  PendingReminder(thesisId: UUID().uuidString, symbol: "ETH", fireAt: fire)],
                                        scheduling: [spy.id], permission: .allowed)
        XCTAssertEqual(model.rows.map(\.symbol), ["NVDA", "BTC", "SPY"], "the book's order; a reminder without a thesis is not a row")
        XCTAssertEqual(model.rows.map(\.fireAt), [nil, fire, nil])
        XCTAssertEqual(model.rows.map(\.busy), [false, false, true])
        XCTAssertEqual(model.rows[0].why, "Margins should recover", "the person's own words")
        XCTAssertEqual(model.rows[0].name, "NVDA Inc")
        XCTAssertNil(model.focusId)
        XCTAssertNil(model.initiallyOpen, "three theses and no focus: nothing is opened for the person")
        XCTAssertFalse(model.showsBriefingRow)
    }

    func testTheFocusedThesisComesFirstWithItsChoicesOpen() {
        let nvda = thesis("NVDA"), btc = thesis("BTC"), spy = thesis("SPY")
        let model = RemindersModel.make(theses: [nvda, btc, spy], pending: [], focus: spy.id.lowercased(), permission: .notDetermined)
        XCTAssertEqual(model.rows.map(\.symbol), ["SPY", "NVDA", "BTC"])
        XCTAssertEqual(model.focusId, spy.id)
        XCTAssertEqual(model.initiallyOpen, spy.id)
        // A focus that already has a reminder shows the reminder, not the choices.
        let set = RemindersModel.make(theses: [nvda, btc], pending: [PendingReminder(thesisId: btc.id, symbol: "BTC", fireAt: t0)],
                                      focus: btc.id, permission: .allowed)
        XCTAssertEqual(set.rows.map(\.symbol), ["BTC", "NVDA"])
        XCTAssertNil(set.initiallyOpen)
        // A focus that is not one of the active theses changes nothing.
        let gone = RemindersModel.make(theses: [nvda, btc], pending: [], focus: UUID().uuidString, permission: .allowed)
        XCTAssertEqual(gone.rows.map(\.symbol), ["NVDA", "BTC"])
        XCTAssertNil(gone.focusId)
        XCTAssertNil(gone.initiallyOpen)
    }

    func testASingleThesisWithoutAReminderOpensItsChoices() {
        let nvda = thesis("NVDA")
        XCTAssertEqual(RemindersModel.make(theses: [nvda], pending: [], permission: .allowed).initiallyOpen, nvda.id)
        let set = RemindersModel.make(theses: [nvda], pending: [PendingReminder(thesisId: nvda.id, symbol: "NVDA", fireAt: t0)], permission: .allowed)
        XCTAssertNil(set.initiallyOpen)
        let empty = RemindersModel.make(theses: [], pending: [], permission: .denied, showsBriefingRow: true)
        XCTAssertTrue(empty.rows.isEmpty)
        XCTAssertNil(empty.initiallyOpen)
        XCTAssertEqual(empty.permission, .denied)
        XCTAssertTrue(empty.showsBriefingRow)
    }

    func testEveryStateHasAReviewFixture() {
#if DEBUG
        let names = Set(RemindersQA.fixtures.keys)
        XCTAssertTrue(names.isSuperset(of: ["reminders-empty", "reminders-three", "reminders-denied", "reminders-briefing"]), "\(names)")
        for name in names {
            XCTAssertTrue(name.hasPrefix("reminders-"), name)
            XCTAssertNotNil(V18QA.fixtures[name], "\(name) is reachable with -qa-v18")
            _ = RemindersQA.fixtures[name]?()
        }
#endif
    }
}
