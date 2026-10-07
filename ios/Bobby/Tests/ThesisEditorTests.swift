import Foundation
import XCTest
@testable import Bobby

/// Writing a thesis (1.8). These pin what the editor promises: Bobby's draft is only a suggestion
/// on screen, nothing is stored until Save, the words saved are the words shown, and every reason
/// a Save cannot happen has its own state instead of a silent failure.
@MainActor
final class ThesisEditorTests: XCTestCase {
    private final class Identity {
        var user: String? = "account-a"
        var generation = UUID()
    }

    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var identity: Identity!
    private var observers: [NSObjectProtocol] = []
    private var saved: [String] = []
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "thesis.editor.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        identity = Identity()
        saved = []
        observers = [NotificationCenter.default.addObserver(forName: ThesisEvents.saved, object: nil, queue: nil) { [weak self] note in
            XCTAssertTrue(Thread.isMainThread, "the reminders track is told on the main thread")
            let id = note.userInfo?[ThesisEvents.idKey] as? String
            MainActor.assumeIsolated { if let id { self?.saved.append(id) } }
        }]
    }

    override func tearDown() async throws {
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func read(_ symbol: String = "NVDA", why: String? = "Price holds above its 50-day average.",
                      risk: String? = "A close below support.", watch: String? = "A move back under the average.",
                      price: Double? = 120.5, verdict: String = "wait") -> NucleoReadSummary {
        NucleoReadSummary(requestId: "0a1b2c3d-1111-4222-8333-444455556666", symbol: symbol, name: symbol == "NVDA" ? "NVIDIA" : symbol,
                          isEquity: true, verdict: verdict, price: price, asOf: "2026-10-07T12:00:00Z",
                          headline: "A headline", why: why, risk: risk, watch: watch)
    }

    private func model(_ source: ThesisEditorModel.Source) -> ThesisEditorModel {
        let identity = identity!
        return ThesisEditorModel(source: source, book: book, owner: { identity.user }, generation: { identity.generation }, now: { [t0] in t0 })
    }

    @discardableResult
    private func seed(_ symbol: String, owner: String? = "account-a") throws -> SavedThesis {
        try book.create(ThesisDraft(symbol: symbol, name: symbol, isEquity: true, horizon: .months, hypothesis: "Why \(symbol)",
                                    worry: "Worry", changeMind: "Change", price: 10, asOf: "2026-10-01T12:00:00Z", verdict: "wait"),
                        owner: owner, now: t0.addingTimeInterval(-86_400))
    }

    // MARK: The draft

    func testBobbysDraftFillsTheThreeFieldsFromTheReadAndSaysItIsADraft() {
        let model = model(.read(read()))
        XCTAssertEqual(model.hypothesis, "Price holds above its 50-day average.")
        XCTAssertEqual(model.worry, "A close below support.")
        XCTAssertEqual(model.changeMind, "A move back under the average.")
        XCTAssertNil(model.horizon, "the horizon is the person's pick and never guessed")
        XCTAssertTrue(model.draftedByBobby)
        XCTAssertTrue(model.isNew)
        XCTAssertEqual(model.symbol, "NVDA")
        XCTAssertEqual(model.name, "NVIDIA")
        XCTAssertEqual(model.startingPrice, 120.5)
    }

    func testAReadWithoutASynthesisStartsEmptyAndClaimsNoDraft() {
        let model = model(.read(read(why: nil, risk: nil, watch: nil)))
        XCTAssertEqual([model.hypothesis, model.worry, model.changeMind], ["", "", ""])
        XCTAssertFalse(model.draftedByBobby)
        XCTAssertFalse(model.canSave)
    }

    func testTheDraftNeverSavesByItself() {
        let model = model(.read(read()))
        model.hypothesis = "I rewrote this in my own words"
        model.worry = "Something else"
        model.horizon = .year
        XCTAssertTrue(book.all(owner: "account-a").isEmpty, "opening and typing writes nothing")
        XCTAssertNil(defaults.object(forKey: ThesisBook.key(owner: "account-a")))
        XCTAssertNil(defaults.object(forKey: ThesisBook.key(owner: nil)))
        XCTAssertTrue(saved.isEmpty)
    }

    func testALongSuggestionIsCutAtAWordAndNeverExceedsTheField() {
        let long = String(repeating: "evidence ", count: 60)
        let model = model(.read(read(why: long)))
        XCTAssertLessThanOrEqual(model.hypothesis.count, ThesisBook.textLimit)
        XCTAssertTrue(model.hypothesis.hasSuffix("evidence"), "cut between words, not inside one")
        XCTAssertEqual(ThesisEditorModel.fit("  two\n\nlines  "), "two lines")
        XCTAssertEqual(ThesisEditorModel.fit(nil), "")
        XCTAssertEqual(ThesisEditorModel.fit(String(repeating: "x", count: 400)).count, ThesisBook.textLimit, "one endless word is still capped")
    }

    func testTypingStopsAtTwoHundredAndEightyCharacters() {
        let model = model(.read(read(why: nil, risk: nil, watch: nil)))
        model.hypothesis = String(repeating: "a", count: 300)
        model.worry = String(repeating: "b", count: 281)
        model.changeMind = String(repeating: "c", count: 280)
        XCTAssertEqual(model.hypothesis.count, 280)
        XCTAssertEqual(model.worry.count, 280)
        XCTAssertEqual(model.changeMind.count, 280)
        XCTAssertEqual(ThesisEditorModel.remaining(model.hypothesis), 0)
        XCTAssertEqual(ThesisEditorModel.remaining("abc"), 277)
    }

    // MARK: Save

    func testSaveStoresTheWordsOnScreenWithTheReadsStartingPointAndTellsTheRemindersTrack() throws {
        let model = model(.read(read(verdict: "review")))
        model.hypothesis = "  My own   reason  "
        model.worry = ""
        model.horizon = .years
        guard case let .created(thesis) = model.save() else { return XCTFail("expected a new thesis") }
        XCTAssertEqual(thesis.hypothesis, "My own reason")
        XCTAssertEqual(thesis.worry, "", "an emptied field stays empty: Bobby's suggestion is not kept behind the person's back")
        XCTAssertEqual(thesis.changeMind, "A move back under the average.")
        XCTAssertEqual(thesis.horizon, .years)
        XCTAssertEqual(thesis.symbol, "NVDA")
        XCTAssertEqual(thesis.name, "NVIDIA")
        XCTAssertEqual(thesis.sourceRequestId, "0a1b2c3d-1111-4222-8333-444455556666")
        XCTAssertEqual(thesis.startingPoint?.price, 120.5)
        XCTAssertEqual(thesis.revisions.first?.asOf, "2026-10-07T12:00:00Z")
        XCTAssertEqual(thesis.revisions.first?.verdict, "review")
        XCTAssertEqual(thesis.createdAt, t0)
        XCTAssertEqual(book.active(owner: "account-a").map(\.id), [thesis.id])
        XCTAssertTrue(book.all(owner: nil).isEmpty, "it is written into the current account's book only")
        XCTAssertEqual(saved, [thesis.id], "V18.thesisSaved carries the new thesis id, once")
        XCTAssertNil(model.problem)
    }

    func testAReadWithoutAPriceStartsAThesisWithoutOne() throws {
        let model = model(.read(read(price: nil)))
        XCTAssertNil(model.startingPrice)
        guard case let .created(thesis) = model.save() else { return XCTFail("expected a new thesis") }
        XCTAssertNil(thesis.startingPoint, "no price is never stored as zero")
    }

    func testAnEmptyWhyIsRefusedInlineAndTypingClearsTheMessage() {
        let model = model(.read(read()))
        model.hypothesis = "   \n "
        XCTAssertEqual(model.save(), .blocked(.emptyHypothesis))
        XCTAssertEqual(model.problem, .emptyHypothesis)
        XCTAssertTrue(book.all(owner: "account-a").isEmpty)
        XCTAssertTrue(saved.isEmpty)
        model.hypothesis = "Now there is a reason"
        XCTAssertNil(model.problem)
        guard case .created = model.save() else { return XCTFail("expected a new thesis") }
    }

    func testAnAssetThatAlreadyHasAThesisSaysSoBeforeAnythingIsWritten() throws {
        let existing = try seed("NVDA")
        let model = model(.read(read()))
        XCTAssertEqual(model.problem, .alreadyActive(id: existing.id), "the person learns it on opening, not after writing")
        XCTAssertEqual(model.save(), .blocked(.alreadyActive(id: existing.id)))
        XCTAssertEqual(book.all(owner: "account-a").count, 1)
        XCTAssertTrue(saved.isEmpty)
    }

    func testAnotherAccountsThesisOnTheSameAssetIsNotInTheWay() throws {
        try seed("NVDA", owner: "account-b")
        let model = model(.read(read()))
        XCTAssertNil(model.problem)
        guard case .created = model.save() else { return XCTFail("expected a new thesis") }
        XCTAssertEqual(book.all(owner: "account-b").count, 1)
    }

    func testAFourthThesisListsTheThreeActiveOnesAndSaveContinuesAfterArchivingOne() throws {
        let three = try ["BTC", "SAP.DE", "AAPL"].map { try seed($0) }
        let model = model(.read(read()))
        XCTAssertEqual(model.save(), .blocked(.limitReached))
        XCTAssertEqual(Set(model.active.map(\.symbol)), ["BTC", "SAP.DE", "AAPL"])
        XCTAssertTrue(saved.isEmpty)
        XCTAssertNil(book.activeThesis(symbol: "NVDA", owner: "account-a"))
        guard case let .created(thesis) = model.archiveAndSave(three[1].id) else { return XCTFail("the save continues") }
        XCTAssertEqual(thesis.symbol, "NVDA")
        XCTAssertEqual(book.thesis(id: three[1].id, owner: "account-a")?.status, .archived)
        XCTAssertEqual(book.active(owner: "account-a").count, ThesisBook.activeLimit)
        XCTAssertEqual(saved, [thesis.id])
        XCTAssertNil(model.problem)
        XCTAssertTrue(model.active.isEmpty)
    }

    func testBackFromTheLimitStateArchivesNothingAndKeepsTheWords() throws {
        try ["BTC", "SAP.DE", "AAPL"].forEach { try seed($0) }
        let model = model(.read(read()))
        model.hypothesis = "Words I do not want to lose"
        _ = model.save()
        model.backToWords()
        XCTAssertNil(model.problem)
        XCTAssertEqual(model.hypothesis, "Words I do not want to lose")
        XCTAssertEqual(book.active(owner: "account-a").count, 3)
        XCTAssertTrue(book.archived(owner: "account-a").isEmpty)
    }

    // MARK: Editing

    func testEditingChangesThePersonsWordsAndIsNotANewThesis() throws {
        let thesis = try seed("NVDA")
        let model = model(.existing(thesis))
        XCTAssertFalse(model.isNew)
        XCTAssertFalse(model.draftedByBobby)
        XCTAssertNil(model.startingPrice, "an edit never moves where the thesis started")
        XCTAssertEqual(model.hypothesis, "Why NVDA")
        XCTAssertEqual(model.horizon, .months)
        model.hypothesis = "A better reason"
        model.horizon = nil
        guard case let .edited(edited) = model.save() else { return XCTFail("expected an edit") }
        XCTAssertEqual(edited.id, thesis.id)
        XCTAssertEqual(edited.hypothesis, "A better reason")
        XCTAssertNil(edited.horizon)
        XCTAssertEqual(edited.revisions.map(\.kind), [.created, .edited])
        XCTAssertEqual(edited.startingPoint?.price, 10)
        XCTAssertTrue(saved.isEmpty, "V18.thesisSaved is for a new thesis only")
    }

    func testAnEditThatChangesNothingRecordsNothing() throws {
        let thesis = try seed("NVDA")
        guard case let .edited(same) = model(.existing(thesis)).save() else { return XCTFail("expected an edit") }
        XCTAssertEqual(same.revisions.map(\.kind), [.created])
    }

    func testEditingAThesisThatWasDeletedSaysItIsGone() throws {
        let thesis = try seed("NVDA")
        let model = model(.existing(thesis))
        book.delete(id: thesis.id, owner: "account-a")
        XCTAssertEqual(model.save(), .blocked(.notFound))
        XCTAssertTrue(book.all(owner: "account-a").isEmpty)
    }

    func testEmptyingTheWhyOfAnExistingThesisIsRefused() throws {
        let thesis = try seed("NVDA")
        let model = model(.existing(thesis))
        model.hypothesis = " "
        XCTAssertEqual(model.save(), .blocked(.emptyHypothesis))
        XCTAssertEqual(book.thesis(id: thesis.id, owner: "account-a")?.hypothesis, "Why NVDA")
    }

    // MARK: Fences

    func testNothingIsWrittenIntoAnotherAccountsBookWhenTheAccountChangedWhileWriting() throws {
        let model = model(.read(read()))
        identity.user = "account-b"
        identity.generation = UUID()
        XCTAssertEqual(model.save(), .blocked(.stale))
        XCTAssertTrue(book.all(owner: "account-a").isEmpty)
        XCTAssertTrue(book.all(owner: "account-b").isEmpty)
        try ["BTC", "SAP.DE", "AAPL"].forEach { try seed($0, owner: "account-b") }
        let other = try XCTUnwrap(book.active(owner: "account-b").first)
        XCTAssertEqual(model.archiveAndSave(other.id), .blocked(.stale))
        XCTAssertEqual(book.active(owner: "account-b").count, 3, "nor is anything archived there")
        XCTAssertTrue(saved.isEmpty)
    }

    func testWithNothingToWriteOnThereIsNothingToSave() {
        let model = model(.missing)
        XCTAssertFalse(model.canSave)
        XCTAssertNil(model.symbol)
        XCTAssertEqual(model.save(), .blocked(.notFound))
    }

    // MARK: What the route opens

    func testAThesisHandedOverByIdWinsThenAReadAndOtherwiseThereIsNothingToWriteOn() throws {
        let thesis = try seed("NVDA")
        let summary = read("AAPL")
        let lookup: (String) -> NucleoReadSummary? = { $0 == summary.requestId ? summary : nil }
        XCTAssertEqual(ThesisEditorModel.open(thesisId: thesis.id, draftRequestId: summary.requestId, book: book, owner: "account-a", readSummary: lookup),
                       .existing(thesis))
        XCTAssertEqual(ThesisEditorModel.open(thesisId: nil, draftRequestId: summary.requestId, book: book, owner: "account-a", readSummary: lookup),
                       .read(summary))
        XCTAssertEqual(ThesisEditorModel.open(thesisId: thesis.id, draftRequestId: nil, book: book, owner: "account-b", readSummary: lookup),
                       .missing, "another account's thesis cannot be opened")
        XCTAssertEqual(ThesisEditorModel.open(thesisId: nil, draftRequestId: "gone", book: book, owner: "account-a", readSummary: lookup), .missing)
        XCTAssertEqual(ThesisEditorModel.open(thesisId: nil, draftRequestId: nil, book: book, owner: "account-a", readSummary: lookup), .missing)
    }

    // MARK: Leaving with words that are not saved

    func testWordsThatAreNotSavedAreNeverDroppedWithoutAsking() throws {
        // Bobby's untouched draft is not the person's words: closing asks nothing.
        let draft = model(.read(read()))
        XCTAssertFalse(draft.hasUnsavedWords)
        draft.hypothesis = "I rewrote this in my own words"
        XCTAssertTrue(draft.hasUnsavedWords, "the X asks once and a pull on the sheet does not dismiss")
        draft.hypothesis = "Price holds above its 50-day average."
        XCTAssertFalse(draft.hasUnsavedWords, "back to what the editor opened with: nothing would be lost")
        draft.horizon = .year
        XCTAssertTrue(draft.hasUnsavedWords, "the horizon is the person's pick too")
        draft.horizon = nil
        draft.worry = ""
        XCTAssertTrue(draft.hasUnsavedWords, "clearing a suggestion is an edit")
        guard case .created = draft.save() else { return XCTFail("expected a new thesis") }
        XCTAssertFalse(draft.hasUnsavedWords, "saved words are not at risk")

        // A blank editor: the first character typed is already something to lose.
        let blank = model(.read(read("AAPL", why: nil, risk: nil, watch: nil)))
        XCTAssertFalse(blank.hasUnsavedWords)
        blank.changeMind = "x"
        XCTAssertTrue(blank.hasUnsavedWords)

        // Editing an existing thesis.
        let existing = try seed("BTC")
        let editor = model(.existing(existing))
        XCTAssertFalse(editor.hasUnsavedWords)
        editor.worry = "A different worry"
        XCTAssertTrue(editor.hasUnsavedWords)
        guard case .edited = editor.save() else { return XCTFail("expected an edit") }
        XCTAssertFalse(editor.hasUnsavedWords)

        // The limit state still holds the words the person wrote.
        try seed("TSLA")
        XCTAssertEqual(book.active(owner: "account-a").count, ThesisBook.activeLimit)
        let fourth = model(.read(read("AMZN")))
        fourth.hypothesis = "My own reason"
        XCTAssertEqual(fourth.save(), .blocked(.limitReached))
        XCTAssertTrue(fourth.hasUnsavedWords)

        // With nothing to write on, or in another account, there is nothing to ask about.
        XCTAssertFalse(model(.missing).hasUnsavedWords)
        let stale = model(.read(read("GOOG")))
        stale.hypothesis = "Words for the previous account"
        identity.generation = UUID()
        XCTAssertEqual(stale.save(), .blocked(.stale))
        XCTAssertFalse(stale.hasUnsavedWords)
    }

    func testTheHandOffIsConsumedOnce() {
        V18Focus.clear()
        V18Focus.draftRequestId = "read-1"
        V18Focus.thesisId = "thesis-1"
        XCTAssertEqual(V18Focus.takeThesisId(), "thesis-1")
        XCTAssertNil(V18Focus.takeThesisId())
        XCTAssertEqual(V18Focus.takeDraftRequestId(), "read-1")
        XCTAssertNil(V18Focus.takeDraftRequestId())
    }
}

/// My theses (1.8): the list reads the book on this phone and nothing else.
@MainActor
final class ThesisListTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var book: ThesisBook!
    private var language: Any?
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "thesis.list.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        book = ThesisBook(defaults: defaults)
        language = UserDefaults.standard.object(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    override func tearDown() async throws {
        if let language { UserDefaults.standard.set(language, forKey: L.preferenceKey) } else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    @discardableResult
    private func seed(_ symbol: String, daysAgo: Double, owner: String? = "u1") throws -> SavedThesis {
        try book.create(ThesisDraft(symbol: symbol, name: symbol, isEquity: true, horizon: nil, hypothesis: "Why \(symbol)", price: 120.5),
                        owner: owner, now: now.addingTimeInterval(-daysAgo * 86_400))
    }

    private func model(highlight: String? = nil, owner: String? = "u1", lastSavedRead: NucleoReadSummary? = nil) -> ThesisListModel {
        ThesisListModel(book: book, guests: ThesisGuestBook(book: book, defaults: defaults), owner: { owner }, highlight: highlight,
                        lastSavedRead: { lastSavedRead }, now: { [now] in now }, observe: false)
    }

    // MARK: Another door into the editor

    func testTheListOffersToWriteFromTheLastSavedReadWhileItsAssetHasNoThesis() throws {
        let read = NucleoReadSummary(requestId: "0a1b2c3d-1111-4222-8333-444455556666", symbol: "NVDA", name: "NVIDIA", isEquity: true, verdict: "wait",
                                     price: 120.5, asOf: "2026-10-07T12:00:00Z", headline: nil, why: "Why", risk: nil, watch: nil)
        let empty = model(lastSavedRead: read)
        XCTAssertTrue(empty.isEmpty)
        XCTAssertEqual(empty.writable, read, "the empty list is a door too, not only the offer on the glass")
        XCTAssertNil(model().writable, "no saved read in this launch: nothing is offered")

        try seed("BTC", daysAgo: 2)
        XCTAssertEqual(model(lastSavedRead: read).writable, read)
        let nvda = try seed("nvda", daysAgo: 1)
        let list = model(lastSavedRead: read)
        XCTAssertNil(list.writable, "one thesis per asset: the list shows that thesis instead")
        list.archive(nvda.id)
        XCTAssertEqual(list.writable, read, "an archived thesis is not in the way")
        try seed("NVDA", daysAgo: 0, owner: "u2")
        XCTAssertEqual(model(lastSavedRead: read).writable, read, "another account's thesis is not this reader's")
    }

    func testTheLastSavedReadIsTheOneOfThisLaunchThatTheDeskStillHolds() {
        let center = NudgeCenter(defaults: defaults)
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        defer { NucleoFixtures.deactivate() }
        let session = NucleoSession(fixtures: true, defaults: defaults)
        defer { session.teardown() }
        XCTAssertNil(ThesisListSheet.lastSavedRead(session, center: center), "no read in this launch")
        center.noteRead(NudgeRead(requestId: "0A1B2C3D-1111-4222-8333-444455556666", symbol: "AAPL", name: "Apple", isEquity: true, verdict: "wait",
                                  saved: false, at: now))
        XCTAssertNil(ThesisListSheet.lastSavedRead(session, center: center), "a read that was not saved is not offered")
        center.noteSaved(requestId: "0A1B2C3D-1111-4222-8333-444455556666")
        XCTAssertNil(ThesisListSheet.lastSavedRead(session, center: center), "saved, but the desk no longer holds it: nothing to draft from")
        XCTAssertNil(ThesisListSheet.lastSavedRead(nil, center: center))
    }

    // MARK: Theses written before signing in

    func testThesesWrittenBeforeSigningInAreKeptOnlyWhenThePersonSaysSo() throws {
        try seed("NVDA", daysAgo: 4, owner: nil)
        try seed("BTC", daysAgo: 2, owner: nil)
        XCTAssertEqual(model(owner: nil).guestCount, 0, "signed out there is no account to ask for")
        XCTAssertNil(model(owner: nil).guestQuestion)
        XCTAssertEqual(model(owner: nil).keepGuestTheses(), 0)

        let list = model(owner: "u1")
        XCTAssertTrue(list.isEmpty, "nothing was moved by signing in")
        XCTAssertEqual(list.guestCount, 2)
        XCTAssertEqual(list.guestQuestion, "You wrote 2 theses before signing in. Keep them in this account?")
        XCTAssertEqual(list.keepGuestTheses(), 2)
        XCTAssertEqual(Set(list.active.map(\.symbol)), ["NVDA", "BTC"], "\"Keep them\" moves them into this account's book")
        XCTAssertEqual(list.guestCount, 0)
        XCTAssertNil(list.guestQuestion)
        XCTAssertTrue(book.all(owner: nil).isEmpty)
    }

    func testNotMineLeavesThemInTheGuestBookAndDoesNotAskThisAccountAgain() throws {
        let local = try seed("NVDA", daysAgo: 4, owner: nil)
        let list = model(owner: "u1")
        XCTAssertEqual(list.guestQuestion, "You wrote 1 thesis before signing in. Keep it in this account?")
        list.declineGuestTheses()
        XCTAssertEqual(list.guestCount, 0)
        XCTAssertTrue(list.isEmpty, "hidden from this account")
        XCTAssertEqual(book.all(owner: nil).map(\.id), [local.id], "still in the guest book, where signed out sees them")
        XCTAssertEqual(model(owner: "u1").guestCount, 0, "not asked again")
        XCTAssertEqual(model(owner: nil).active.map(\.id), [local.id])
        XCTAssertEqual(model(owner: "u2").guestCount, 1, "the answer was this account's, not the phone's")

        // An account that already has theses is never asked: books are not merged.
        try seed("BTC", daysAgo: 1, owner: "u3")
        XCTAssertEqual(model(owner: "u3").guestCount, 0)
        XCTAssertEqual(ThesisGuestBook.declinedKey("u1"), "v18.theses.guestDeclined.u1")
    }

    func testTheGuestRowFitsItsWordsInSixLanguages() throws {
        try seed("NVDA", daysAgo: 4, owner: nil)
        try seed("BTC", daysAgo: 2, owner: nil)
        var questions = Set<String>(), buttons = Set<String>()
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            let question = try XCTUnwrap(model(owner: "u1").guestQuestion)
            XCTAssertTrue(question.contains("2"), "\(language): \(question)")
            XCTAssertFalse(question.contains("{"), language)
            questions.insert(question)
            buttons.insert(L.t("Keep them", "Conservarlas") + " / " + L.t("Not mine", "No es mío"))
        }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        XCTAssertEqual(questions.count, 6)
        XCTAssertEqual(buttons.count, 6, "both answers are worded in each language")
    }

    func testActiveThesesComeFirstWithACounterAndArchivedOnesApart() throws {
        let nvda = try seed("NVDA", daysAgo: 9)
        try seed("BTC", daysAgo: 2)
        let old = try seed("TSLA", daysAgo: 30)
        try book.archive(id: old.id, owner: "u1", now: now.addingTimeInterval(-86_400))
        try seed("AAPL", daysAgo: 1, owner: "u2")
        let model = model()
        XCTAssertEqual(Set(model.active.map(\.symbol)), ["NVDA", "BTC"])
        XCTAssertEqual(model.archived.map(\.symbol), ["TSLA"])
        XCTAssertEqual(model.counter, "2 of 3 active")
        XCTAssertFalse(model.isEmpty)
        XCTAssertTrue(model.isOverdue(nvda), "nine days without a review")
        XCTAssertFalse(model.isOverdue(try XCTUnwrap(book.activeThesis(symbol: "BTC", owner: "u1"))))
        XCTAssertTrue(self.model(owner: nil).isEmpty, "signed out sees only the local book")
    }

    func testReopenRespectsTheLimitAndOneThesisPerAsset() throws {
        let tsla = try seed("TSLA", daysAgo: 30)
        try book.archive(id: tsla.id, owner: "u1", now: now)
        try ["NVDA", "BTC", "AAPL"].forEach { try seed($0, daysAgo: 3) }
        let model = model()
        XCTAssertFalse(model.reopen(tsla.id))
        XCTAssertEqual(model.problem, .limitReached)
        XCTAssertEqual(model.problemText(), "Three theses are active already. Archive one first.")
        XCTAssertEqual(book.thesis(id: tsla.id, owner: "u1")?.status, .archived)

        let nvda = try XCTUnwrap(book.activeThesis(symbol: "NVDA", owner: "u1"))
        model.archive(nvda.id)
        XCTAssertNil(model.problem)
        let again = try seed("NVDA", daysAgo: 0)
        XCTAssertFalse(model.reopen(nvda.id), "the asset already has an active thesis")
        XCTAssertEqual(model.problem, .alreadyActive(symbol: "NVDA"))
        XCTAssertEqual(model.problemText(), "You already have a thesis on NVDA.")

        model.archive(again.id)
        XCTAssertTrue(model.reopen(tsla.id))
        XCTAssertNil(model.problem)
        XCTAssertEqual(model.highlight, tsla.id, "the reopened thesis is the one marked")
        XCTAssertEqual(book.thesis(id: tsla.id, owner: "u1")?.status, .active)
        XCTAssertEqual(model.active.count, 3)
    }

    func testDeleteRemovesItFromThisPhoneForGood() throws {
        let tsla = try seed("TSLA", daysAgo: 30)
        try book.archive(id: tsla.id, owner: "u1", now: now)
        let model = model()
        model.delete(tsla.id)
        XCTAssertTrue(model.isEmpty)
        XCTAssertNil(book.thesis(id: tsla.id, owner: "u1"))
    }

    func testAReminderTapMarksItsThesisAndOpensTheArchivedSectionWhenItLivesThere() throws {
        let nvda = try seed("NVDA", daysAgo: 9)
        let tsla = try seed("TSLA", daysAgo: 30)
        try book.archive(id: tsla.id, owner: "u1", now: now)
        XCTAssertEqual(model(highlight: nvda.id).highlight, nvda.id)
        XCTAssertFalse(model(highlight: nvda.id).highlightIsArchived)
        XCTAssertTrue(model(highlight: tsla.id).highlightIsArchived)
        XCTAssertNil(model(highlight: "deleted-long-ago").highlight, "a thesis that is gone is not marked")
        XCTAssertNil(model(highlight: nvda.id, owner: "u2").highlight, "nor one from another account")
    }

    func testTheLinesOfABlockAreDatedAndNeverShowAPriceTheReadDidNotCarry() throws {
        let withPrice = try seed("NVDA", daysAgo: 9)
        let noPrice = try book.create(ThesisDraft(symbol: "BTC", name: "Bitcoin", isEquity: false, horizon: nil, hypothesis: "Why"),
                                      owner: "u1", now: now.addingTimeInterval(-3 * 86_400))
        XCTAssertTrue(ThesisCopy.sinceLine(withPrice, now: now).contains("started at 120.50"))
        XCTAssertTrue(ThesisCopy.sinceLine(withPrice, now: now).hasPrefix("Since "))
        XCTAssertFalse(ThesisCopy.sinceLine(noPrice, now: now).contains("started"), "no price, no number")
        XCTAssertEqual(ThesisCopy.reviewedLine(withPrice, now: now), "Not reviewed yet")
        var reviewed = try book.recordReview(id: withPrice.id, owner: "u1", price: 125, asOf: nil, verdict: "wait", supports: [], challenges: [], unknowns: [],
                                             now: now.addingTimeInterval(-5 * 86_400))
        XCTAssertEqual(ThesisCopy.reviewedLine(reviewed, now: now), "Reviewed 5 days ago")
        reviewed = try book.recordReview(id: withPrice.id, owner: "u1", price: 125, asOf: nil, verdict: "wait", supports: [], challenges: [], unknowns: [],
                                         now: now.addingTimeInterval(-3_600))
        XCTAssertEqual(ThesisCopy.reviewedLine(reviewed, now: now), "Reviewed today")
        XCTAssertEqual(ThesisCopy.title(noPrice), "BTC · Bitcoin")
        XCTAssertEqual(ThesisCopy.title(withPrice), "NVDA", "a name that only repeats the symbol is not shown twice")
    }
}
