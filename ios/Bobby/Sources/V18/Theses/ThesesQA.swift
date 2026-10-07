// Theses: DEBUG review fixtures (`-qa-v18 <name>`). Each shows one screen state from fixed sample
// values: a throwaway thesis book (its own UserDefaults suite), no account, no network. A review
// fixture's "request" is a recorded outcome, never a call.
#if DEBUG
import SwiftUI

@MainActor
enum ThesesQA {
    private enum ReviewState {
        case before, running
        /// A finished review, with the three lists or (a server that ignores the thesis) without them.
        case after(notes: Bool)
        case refused(ThesisReviewer.Refusal)
    }

    static var fixtures: [String: () -> AnyView] {
        var all: [String: () -> AnyView] = [
            // The list.
            "theses-empty": { list(seeded: false) },
            "theses-three": { list(seeded: true) },
            "theses-three-focus": { list(seeded: true, highlight: "BTC") },
            // Signed in, with theses written before signing in waiting in the guest book.
            "theses-guest": { list(seeded: true, owner: "qa-account") },
            // The read the person last saved has no thesis yet: another door into the editor.
            "theses-write": { list(seeded: true, lastSavedRead: read("AAPL", "Apple")) },
            "theses-empty-write": { list(seeded: false, lastSavedRead: read("AAPL", "Apple")) },
            // The editor.
            "theses-editor-draft": { editor(.read(read("AAPL", "Apple"))) },
            "theses-editor-blank": { editor(.read(read("AAPL", "Apple", synthesis: false))) },
            "theses-editor-edit": { editor(editing: "NVDA") },
            "theses-editor-exists": { editor(.read(read("NVDA", "NVIDIA"))) },
            "theses-editor-limit": { editor(.read(read("AAPL", "Apple")), save: true) },
            "theses-editor-missing": { editor(.missing) },
            // The review: before, during, after.
            "theses-review-before": { review(.before) },
            "theses-review-running": { review(.running) },
            "theses-review-after": { review(.after(notes: true)) },
            "theses-review-after-plain": { review(.after(notes: false)) },
            "theses-review-after-crypto": { review(.after(notes: false), symbol: "BTC") },
            // Written from a read without a price, reviewed twice since: today's price only, and it says so.
            "theses-review-after-no-start": { review(.after(notes: true), startPrice: nil) },
            "theses-review-archived": { review(.before, symbol: "TSLA") },
            "theses-review-missing": { review(.before, symbol: "NONE") },
        ]
        // The review: each refusal.
        let soon = Date().addingTimeInterval(3 * 86_400)
        let refusals: [String: ThesisReviewer.Refusal] = [
            "risk": .riskNotice,
            "guest": .writtenSignedOut,
            "signin": .signIn(level: nil),
            "signin-level": .signIn(level: .profundo),
            "pro": .subscription(resets: soon),
            "level": .levelUsed(level: .maximo, resets: soon),
            "paused": .paused(level: .profundo, quickWorks: true),
            "paused-all": .paused(level: .rapido, quickWorks: false),
            "quota": .quota,
            "failed": .failed,
            "timeout": .uncertain,
            "unreadable": .unreadable,
        ]
        for (name, refusal) in refusals { all["theses-review-\(name)"] = { review(.refused(refusal)) } }
        return all
    }

    // MARK: Sample state

    private static let generation = UUID()
    private static func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }

    /// A fresh book every time a fixture is shown. Seeded: three active theses (NVDA a fortnight
    /// without a review after two reviews, BTC and SAP.DE never reviewed) and one archived (TSLA).
    private static let suite = "qa.v18.theses"
    private static var store: UserDefaults { UserDefaults(suiteName: suite) ?? .standard }

    private static func book(seeded: Bool, nvdaStart: Double? = 120.5) -> ThesisBook {
        UserDefaults.standard.removePersistentDomain(forName: suite)
        let book = ThesisBook(defaults: store)
        guard seeded else { return book }
        let now = Date()
        func day(_ ago: Double) -> Date { now.addingTimeInterval(-ago * 86_400) }
        func add(_ symbol: String, _ name: String, equity: Bool = true, horizon: ThesisHorizon?, why: String, worry: String = "",
                 changeMind: String = "", price: Double?, verdict: String = "wait", daysAgo: Double) -> SavedThesis? {
            try? book.create(ThesisDraft(symbol: symbol, name: name, isEquity: equity, horizon: horizon, hypothesis: why, worry: worry,
                                         changeMind: changeMind, sourceRequestId: nil, price: price, asOf: iso(day(daysAgo)), verdict: verdict),
                             owner: nil, now: day(daysAgo))
        }
        if let tsla = add("TSLA", "Tesla", horizon: .months, why: "Energy storage grows into a second business.", price: 240, daysAgo: 60) {
            _ = try? book.archive(id: tsla.id, owner: nil, now: day(40))
        }
        if let nvda = add("NVDA", "NVIDIA", horizon: .year,
                          why: "Data center demand keeps growing faster than supply, and margins hold while that lasts.",
                          worry: "A pause in spending by the largest customers.",
                          changeMind: "Two quarters in a row of falling data center revenue.", price: nvdaStart, daysAgo: 30) {
            _ = try? book.recordReview(id: nvda.id, owner: nil, price: 126.1, asOf: iso(day(21)), verdict: "wait",
                                       supports: ["Price held above its 50-day average."], challenges: [], unknowns: [], now: day(21))
            _ = try? book.recordReview(id: nvda.id, owner: nil, price: 124.3, asOf: iso(day(14)), verdict: "review",
                                       supports: [], challenges: ["Momentum cooled over the week."], unknowns: [], now: day(14))
        }
        _ = add("SAP.DE", "SAP", horizon: nil, why: "The move to cloud subscriptions makes revenue steadier.",
                changeMind: "Cloud growth slowing for a year.", price: 211.4, verdict: "review", daysAgo: 5)
        _ = add("BTC", "Bitcoin", equity: false, horizon: .years,
                why: "A scarce asset I want to understand through a full cycle before deciding anything.",
                worry: "Sharp drops that test my patience.", price: 64_250, daysAgo: 3)
        return book
    }

    private static func read(_ symbol: String, _ name: String, synthesis: Bool = true) -> NucleoReadSummary {
        NucleoReadSummary(requestId: "0a1b2c3d-0000-4000-8000-000000000000", symbol: symbol, name: name, isEquity: true,
                          verdict: "wait", price: 228.4, asOf: iso(Date()),
                          headline: synthesis ? "No clear edge yet: wait for a cleaner picture." : nil,
                          why: synthesis ? "Price is holding above its 50-day average while momentum is neutral." : nil,
                          risk: synthesis ? "A close below the recent support would weaken the picture." : nil,
                          watch: synthesis ? "A sustained move back under the 50-day average." : nil)
    }

    // MARK: Screens

    /// `owner`: the account looking at the list (the seeded theses are always the guest book's).
    private static func list(seeded: Bool, highlight symbol: String? = nil, owner: String? = nil,
                             lastSavedRead: NucleoReadSummary? = nil) -> AnyView {
        let book = book(seeded: seeded)
        let model = ThesisListModel(book: book, guests: ThesisGuestBook(book: book, defaults: store), owner: { owner },
                                    highlight: symbol.flatMap { book.activeThesis(symbol: $0, owner: nil)?.id },
                                    lastSavedRead: { lastSavedRead })
        return AnyView(ThesisListView(model: model, onReview: { _ in }, onEdit: { _ in }, onClose: {}))
    }

    /// `save` taps Save once before the screen shows (with three active theses that is the limit state).
    private static func editor(_ source: ThesisEditorModel.Source? = nil, editing symbol: String? = nil, save: Bool = false) -> AnyView {
        let book = book(seeded: true)
        let existing = symbol.flatMap { book.activeThesis(symbol: $0, owner: nil) }.map(ThesisEditorModel.Source.existing)
        let model = ThesisEditorModel(source: source ?? existing ?? .missing, book: book, owner: { nil }, generation: { generation })
        if save { model.save() }
        return AnyView(ThesisEditorView(model: model, onSaved: { _ in }, onOpenExisting: { _ in }, onClose: {}))
    }

    private static func review(_ state: ReviewState, symbol: String = "NVDA", startPrice: Double? = 120.5) -> AnyView {
        let book = book(seeded: true, nvdaStart: startPrice)
        var result: ThesisReviewResult?
        if case let .after(notes) = state, let thesis = book.activeThesis(symbol: symbol, owner: nil) {
            result = recorded(thesis, notes: notes, in: book)
        }
        var riskAccepted = true
        if case .refused(.riskNotice) = state { riskAccepted = false }
        var env = ThesisReviewer.Environment()
        env.book = book
        env.guestDefaults = store
        env.owner = { nil }
        env.generation = { generation }
        env.riskAccepted = { riskAccepted }
        env.level = { .profundo }
        // Never a call: a tap on "Review now" in a fixture waits until it is cancelled.
        env.send = { _ in
            try? await Task.sleep(nanoseconds: 600 * 1_000_000_000)
            return .cancelled
        }
        env.accessChanged = { _ in }
        env.meterChanged = { _, _ in }
        let reviewer = ThesisReviewer(thesisId: book.all(owner: nil).first { $0.symbol == symbol }?.id, environment: env, observeAccount: false)
        switch state {
        case .before: break
        case .running: reviewer.show(.running)
        case .after: if let result { reviewer.show(.done(result)) }
        case let .refused(refusal): reviewer.show(.refused(refusal))
        }
        return AnyView(ThesisReviewView(reviewer: reviewer, actions: ThesisReviewView.Actions()))
    }

    /// Records a sample review in the fixture's book and returns what the screen shows for it.
    private static func recorded(_ thesis: SavedThesis, notes withNotes: Bool, in book: ThesisBook) -> ThesisReviewResult? {
        let nowPrice = thesis.isEquity ? 131.2 : 61_900.0
        let asOf = iso(Date().addingTimeInterval(-1_800))
        let notes = withNotes ? ThesisReviewNotes(
            supports: [ThesisCopy.startingPoint(thesis) == nil ? "Price is above its 50-day average."
                                                               : "Price is above where you started and above its 50-day average.",
                       "The daily trend has stayed up since your last review."],
            challenges: ["Momentum cooled this week: the daily RSI fell from 68 to 55."],
            unknowns: ["Whether data center revenue is still growing: there is no earnings evidence here."],
            notChecked: ["news", "earnings", "filings", "fundamentals"]) : nil
        let verdict = withNotes ? "review" : "wait"
        guard let saved = try? book.recordReview(id: thesis.id, owner: nil, price: nowPrice, asOf: asOf, verdict: verdict,
                                                 supports: notes?.supports ?? [], challenges: notes?.challenges ?? [],
                                                 unknowns: notes?.unknowns ?? []) else { return nil }
        return ThesisReviewResult(
            thesis: saved, verdict: verdict,
            headline: withNotes ? "The price evidence still leans your way, with less momentum than a week ago."
                                : "No clear edge in the price evidence: wait for a cleaner picture.",
            thenNow: ThesisThenNow(thesis: thesis, nowPrice: nowPrice, asOf: asOf),
            notes: notes, notChecked: ThesisCopy.notCheckedCodes(notes?.notChecked, isEquity: thesis.isEquity), level: .profundo)
    }
}
#endif
