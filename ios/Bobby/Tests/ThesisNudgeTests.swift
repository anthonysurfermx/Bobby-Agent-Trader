import Foundation
import XCTest
@testable import Bobby

/// Theses on the glass (1.8): the two things Bobby may say, read from the thesis book and the last
/// read only, with ids the page can send back and lines that fit the glass in six languages.
@MainActor
final class ThesisNudgeTests: XCTestCase {
    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText", L.preferenceKey]
    private static let languages = ["en", "es", "fr", "pt", "it", "de"]
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var saved: [String: Any] = [:]
    /// 2026-10-07T12:00:00Z, a Wednesday of ISO week 41.
    private let now = Date(timeIntervalSince1970: 1_791_374_400)

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "thesis.nudge.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        NudgeCenter.shared.unregisterAll()
        NudgeCenter.shared.reset()
        V18Focus.clear()
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        NudgeCenter.shared.unregisterAll()
        NudgeCenter.shared.reset()
        V18Focus.clear()
        for key in Self.profileKeys {
            if let v = saved[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func moment(_ read: NudgeRead? = nil, at date: Date? = nil) -> NudgeMoment {
        NudgeMoment(signedIn: false, now: date ?? now, lastRead: read, readsThisLaunch: read == nil ? 0 : 1)
    }

    private func read(_ symbol: String = "NVDA", requestId: String = "0A1B2C3D-1111-4222-8333-444455556666", saved: Bool = true,
                      minutesAgo: Double = 1) -> NudgeRead {
        NudgeRead(requestId: requestId, symbol: symbol, name: symbol, isEquity: true, verdict: "wait", saved: saved,
                  at: now.addingTimeInterval(-minutesAgo * 60))
    }

    @discardableResult
    private func seed(_ symbol: String, daysAgo: Double, reviewedDaysAgo: Double? = nil, owner: String? = nil) throws -> SavedThesis {
        let thesis = try book.create(ThesisDraft(symbol: symbol, name: symbol, isEquity: true, horizon: nil, hypothesis: "Why \(symbol)", price: 100),
                                     owner: owner, now: now.addingTimeInterval(-daysAgo * 86_400))
        guard let reviewedDaysAgo else { return thesis }
        return try book.recordReview(id: thesis.id, owner: owner, price: 101, asOf: nil, verdict: "wait", supports: [], challenges: [], unknowns: [],
                                     now: now.addingTimeInterval(-reviewedDaysAgo * 86_400))
    }

    private func candidate(_ moment: NudgeMoment, owner: String? = nil) -> NucleoNudge? {
        ThesisNudges.candidate(moment, book: book, owner: owner)
    }

    private func matchesBridgePattern(_ id: String) -> Bool { id.range(of: NucleoNudge.idPattern, options: .regularExpression) != nil }

    // MARK: a. Write down why

    func testRightAfterSavingAReadOnAnAssetWithNoThesisBobbyOffersToWriteOne() {
        let nudge = candidate(moment(read()))
        XCTAssertEqual(nudge?.id, "theses.write.0a1b2c3d", "the first eight of the request id, lowercased")
        XCTAssertEqual(nudge?.text, "Write down why, for next time")
        XCTAssertEqual(nudge?.cta, "Write my thesis")
        XCTAssertTrue(matchesBridgePattern(nudge?.id ?? ""))
        XCTAssertEqual(ThesisNudges.target(of: "theses.write.0a1b2c3d"), "0A1B2C3D-1111-4222-8333-444455556666", "the tap finds the whole request id")
    }

    func testNothingIsOfferedForAReadThatWasNotSavedOrIsNoLongerFresh() {
        XCTAssertNil(candidate(moment(read(saved: false))))
        XCTAssertNil(candidate(moment(nil)))
        XCTAssertNil(candidate(moment(read(minutesAgo: 6 * 60 + 1))), "hours later it is no longer 'right after'")
        XCTAssertNotNil(candidate(moment(read(minutesAgo: 5 * 60))))
        XCTAssertNil(candidate(moment(read(requestId: "----"))), "a request id that leaves no usable id is never served")
    }

    func testAnAssetThatAlreadyHasAnActiveThesisIsNotOfferedAnotherButAnArchivedOneIs() throws {
        let nvda = try seed("NVDA", daysAgo: 2)
        XCTAssertNil(candidate(moment(read("nvda"))), "one thesis per asset, whatever the case of the symbol")
        XCTAssertEqual(candidate(moment(read("BTC")))?.id, "theses.write.0a1b2c3d")
        try book.archive(id: nvda.id, owner: nil, now: now)
        XCTAssertNotNil(candidate(moment(read("NVDA"))))
        try seed("NVDA", daysAgo: 1, owner: "u1")
        XCTAssertNotNil(candidate(moment(read("NVDA"))), "another account's thesis is not this reader's")
        XCTAssertNil(candidate(moment(read("NVDA")), owner: "u1"))
    }

    func testEachSavedReadGetsItsOwnOffer() {
        let first = candidate(moment(read(requestId: "aaaaaaaa-0000-4000-8000-000000000000")))
        let second = candidate(moment(read(requestId: "bbbbbbbb-0000-4000-8000-000000000000")))
        XCTAssertNotEqual(first?.id, second?.id, "a tapped offer is retired; the next saved read may offer again")
    }

    // MARK: b. Come back to it

    func testAThesisAWeekOrMoreWithoutAReviewIsBroughtBack() throws {
        let thesis = try seed("NVDA", daysAgo: 30, reviewedDaysAgo: 9)
        let nudge = try XCTUnwrap(candidate(moment()))
        XCTAssertEqual(nudge.id, "theses.due.\(thesis.id.lowercased().filter { $0 != "-" }.prefix(8)).2026w41")
        XCTAssertTrue(matchesBridgePattern(nudge.id))
        XCTAssertEqual(nudge.text, "Your NVDA thesis: 9 days since review")
        XCTAssertEqual(nudge.cta, "Review")
        XCTAssertEqual(ThesisNudges.target(of: nudge.id), thesis.id)
    }

    func testAThesisNeverReviewedCountsFromTheDayItWasWrittenAndSaysSo() throws {
        try seed("BTC", daysAgo: 6.9)
        XCTAssertNil(candidate(moment()), "not yet a week")
        try seed("SAP.DE", daysAgo: 12)
        XCTAssertEqual(candidate(moment())?.text, "Your SAP.DE thesis: 12 days, not reviewed yet", "never 'since review' for a thesis that had none")
    }

    func testAThesisReviewedThisWeekIsLeftAlone() throws {
        try seed("NVDA", daysAgo: 40, reviewedDaysAgo: 6.5)
        XCTAssertNil(candidate(moment()))
        XCTAssertNotNil(candidate(moment(at: now.addingTimeInterval(86_400))), "it comes due on the seventh day")
    }

    func testTheMostOverdueThesisSpeaksAndArchivedOnesNever() throws {
        try seed("NVDA", daysAgo: 30, reviewedDaysAgo: 8)
        let oldest = try seed("BTC", daysAgo: 21)
        let archived = try seed("TSLA", daysAgo: 90)
        try book.archive(id: archived.id, owner: nil, now: now.addingTimeInterval(-80 * 86_400))
        try seed("AAPL", daysAgo: 50, owner: "u1")
        XCTAssertEqual(ThesisNudges.target(of: try XCTUnwrap(candidate(moment())).id), oldest.id)
        XCTAssertEqual(candidate(moment())?.text, "Your BTC thesis: 21 days, not reviewed yet")
        XCTAssertEqual(candidate(moment(), owner: "u1")?.text, "Your AAPL thesis: 50 days, not reviewed yet", "each account hears only about its own book")
        XCTAssertNil(candidate(moment(), owner: "u2"))
    }

    func testTheDueIdNamesTheWeekSoItCanComeBackAnotherWeek() throws {
        let thesis = try seed("NVDA", daysAgo: 30)
        let thisWeek = try XCTUnwrap(candidate(moment())).id
        let sameWeek = try XCTUnwrap(candidate(moment(at: now.addingTimeInterval(2 * 86_400)))).id
        let nextWeek = try XCTUnwrap(candidate(moment(at: now.addingTimeInterval(7 * 86_400)))).id
        XCTAssertEqual(thisWeek, sameWeek, "the same nudge all week: a tap retires it for the week")
        XCTAssertNotEqual(thisWeek, nextWeek)
        XCTAssertTrue(nextWeek.hasSuffix(".2026w42"))
        XCTAssertEqual(ThesisNudges.isoWeek(Date(timeIntervalSince1970: 1_798_761_600)), "2026w53", "2027-01-01 belongs to ISO week 53 of 2026")
        XCTAssertEqual(ThesisNudges.dueId(thesisId: thesis.id, now: now), thisWeek)
        XCTAssertNil(ThesisNudges.dueId(thesisId: "", now: now))
    }

    func testWritingComesBeforeReviewing() throws {
        try seed("BTC", daysAgo: 20)
        XCTAssertEqual(candidate(moment(read("NVDA")))?.id, "theses.write.0a1b2c3d", "the read the person just saved is the fresher thought")
        XCTAssertTrue(candidate(moment(read("BTC")))?.id.hasPrefix("theses.due.") == true, "an asset that has its thesis goes straight to the review")
    }

    // MARK: Through the centre and the session

    func testTheSourceSpeaksThroughTheCentreAtTheThesesPriority() throws {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [now] in now }
        let book = book!
        center.register(ThesisNudges.source(book: book, owner: { nil }))
        center.register(NudgeSource(key: "credits", priority: NudgePriority.credits,
                                    candidate: { _ in NucleoNudge(id: "credits.low", text: "2 reads left", cta: "See") }, act: { _, _ in }))
        XCTAssertEqual(center.sourceKeys, ["theses", "credits"])
        XCTAssertEqual(center.current(center.moment(signedIn: false))?.id, "credits.low", "with nothing to say about theses, the next source speaks")
        try seed("NVDA", daysAgo: 30)
        XCTAssertTrue(center.current(center.moment(signedIn: false))?.id.hasPrefix("theses.due.") == true)
        center.noteRead(read("AAPL", saved: false))
        center.noteSaved(requestId: "0A1B2C3D-1111-4222-8333-444455556666")
        XCTAssertEqual(center.current(center.moment(signedIn: false))?.id, "theses.write.0a1b2c3d")
    }

    func testATapOnADueThesisOpensItsReviewAndATapOnAReadThatIsGoneOpensTheList() async throws {
        let center = NudgeCenter(defaults: defaults)
        center.now = { [now] in now }
        let book = book!
        center.register(ThesisNudges.source(book: book, owner: { nil }))
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        let thesis = try seed("NVDA", daysAgo: 30)
        let due = try XCTUnwrap(center.current(center.moment(signedIn: false)))
        let done = await center.act(due.id, session: session)
        XCTAssertEqual(done, "done")
        XCTAssertEqual(session.sheet, .thesisReview)
        XCTAssertEqual(V18Focus.thesisId, thesis.id, "the review opens on that thesis")
        XCTAssertNil(V18Focus.draftRequestId)
        XCTAssertTrue(center.isRetired(due.id))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: nil), thesis, "the nudge itself writes nothing")

        session.sheetDismissed()
        V18Focus.clear()
        center.now = { [now] in now.addingTimeInterval(3_600) }
        center.noteRead(NudgeRead(requestId: "0A1B2C3D-1111-4222-8333-444455556666", symbol: "AAPL", name: "Apple", isEquity: true, verdict: "wait",
                                  saved: true, at: now.addingTimeInterval(3_500)))
        let write = try XCTUnwrap(center.current(center.moment(signedIn: false)))
        XCTAssertEqual(write.id, "theses.write.0a1b2c3d")
        _ = await center.act(write.id, session: session)
        XCTAssertEqual(session.sheet, .theses, "the desk no longer holds that read: the list explains how to start")
        XCTAssertNil(V18Focus.draftRequestId, "no stale hand-off is left behind")
    }

    // MARK: Copy limits in six languages

    func testEveryLineAndButtonFitsTheGlassInSixLanguages() {
        let symbols = ["X", "BTC", "NVDA", "SAP.DE", "PETR4.SA", "BRK.B", String(repeating: "W", count: 20)]
        for language in Self.languages {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            let write = candidate(moment(read()))
            XCTAssertNotNil(write, language)
            XCTAssertLessThanOrEqual(write?.text.count ?? 99, NucleoNudge.textLimit, "\(language): \(write?.text ?? "")")
            XCTAssertLessThanOrEqual(write?.cta.count ?? 99, 22, "\(language): \(write?.cta ?? "")")
            XCTAssertLessThanOrEqual(L.t("Review", "Revisar").count, 22, language)
            for symbol in symbols {
                for days in [7, 9, 30, 365, 9_999] {
                    for reviewed in [true, false] {
                        let text = ThesisNudges.dueText(symbol: symbol, days: days, reviewed: reviewed)
                        XCTAssertLessThanOrEqual(text.count, NucleoNudge.textLimit, "\(language): \(text)")
                        XCTAssertTrue(text.contains("\(days)"), "\(language): \(text)")
                        XCTAssertFalse(text.contains("{"), "\(language): an unfilled placeholder in \(text)")
                    }
                }
            }
            // The everyday case names the asset in every language.
            XCTAssertTrue(ThesisNudges.dueText(symbol: "NVDA", days: 9, reviewed: true).contains("NVDA"), language)
            XCTAssertTrue(ThesisNudges.dueText(symbol: "SAP.DE", days: 14, reviewed: false).contains("SAP.DE"), language)
        }
    }

    func testTheLineDropsTheAssetNameBeforeItWouldBeCut() {
        let long = String(repeating: "W", count: 20)
        XCTAssertEqual(ThesisNudges.dueText(symbol: long, days: 120, reviewed: true), "Your thesis: 120 days since review")
        XCTAssertEqual(ThesisNudges.dueText(symbol: long, days: 120, reviewed: false), "Your thesis: 120 days, not reviewed yet")
    }
}
