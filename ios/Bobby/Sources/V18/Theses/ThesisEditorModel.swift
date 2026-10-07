// Write or edit a thesis (1.8): the logic behind the editor, with nothing of SwiftUI in it.
// The fields live in memory until the person taps Save: a draft Bobby prefilled from a read is
// only a suggestion on screen, and closing the editor leaves the thesis book untouched.
import Combine
import Foundation

@MainActor
final class ThesisEditorModel: ObservableObject {
    /// What the editor was opened on.
    enum Source: Equatable {
        /// A new thesis, written from a read the person just had.
        case read(NucleoReadSummary)
        /// A thesis that already exists.
        case existing(SavedThesis)
        /// Neither (the read is gone, or the thesis was deleted): there is nothing to write on.
        case missing
    }

    /// Why a Save did not happen. Each has its own words and next step on screen.
    enum Problem: Equatable {
        case emptyHypothesis
        /// One active thesis per asset: the screen offers to open the existing one.
        case alreadyActive(id: String)
        /// Three are active: the screen lists them, each with Archive, and Save continues.
        case limitReached
        /// The thesis being edited is no longer in this account's book.
        case notFound
        /// The account changed while the editor was open: nothing is written into another account's book.
        case stale
    }

    enum Outcome: Equatable {
        case created(SavedThesis)
        case edited(SavedThesis)
        case blocked(Problem)
    }

    let source: Source
    /// The three texts were prefilled from Bobby's synthesis of the read (and say so on screen).
    let draftedByBobby: Bool

    @Published var horizon: ThesisHorizon?
    @Published var hypothesis: String { didSet { limit(\.hypothesis, oldValue) } }
    @Published var worry: String { didSet { limit(\.worry, oldValue) } }
    @Published var changeMind: String { didSet { limit(\.changeMind, oldValue) } }
    @Published private(set) var problem: Problem?
    /// The active theses, for the limit state.
    @Published private(set) var active: [SavedThesis] = []

    private let book: ThesisBook
    private let owner: @MainActor () -> String?
    private let generation: @MainActor () -> UUID
    private let openedGeneration: UUID
    private let now: () -> Date
    /// What the fields held when the editor opened (Bobby's draft, the saved thesis, or nothing).
    private var opened: Words = Words()
    private var isSaved = false

    private struct Words: Equatable {
        var horizon: ThesisHorizon?
        var hypothesis = ""
        var worry = ""
        var changeMind = ""
    }

    init(source: Source, book: ThesisBook = .shared,
         owner: @escaping @MainActor () -> String? = { AccountSession.shared.session?.userId },
         generation: @escaping @MainActor () -> UUID = { AccountSession.shared.generation },
         now: @escaping () -> Date = { Date() }) {
        self.source = source
        self.book = book
        self.owner = owner
        self.generation = generation
        self.now = now
        openedGeneration = generation()
        switch source {
        case let .read(read):
            let why = Self.fit(read.why), risk = Self.fit(read.risk), watch = Self.fit(read.watch)
            hypothesis = why
            worry = risk
            changeMind = watch
            horizon = nil
            draftedByBobby = !(why.isEmpty && risk.isEmpty && watch.isEmpty)
        case let .existing(thesis):
            hypothesis = thesis.hypothesis
            worry = thesis.worry
            changeMind = thesis.changeMind
            horizon = thesis.horizon
            draftedByBobby = false
        case .missing:
            hypothesis = ""; worry = ""; changeMind = ""
            horizon = nil
            draftedByBobby = false
        }
        opened = Words(horizon: horizon, hypothesis: hypothesis, worry: worry, changeMind: changeMind)
        // One thesis per asset: say so before the person writes a second one in vain.
        if case let .read(read) = source, let existing = book.activeThesis(symbol: read.symbol, owner: owner()) {
            problem = .alreadyActive(id: existing.id)
        }
    }

    /// The editor a route opens: a thesis handed over by id wins, then a read to draft from.
    static func open(thesisId: String?, draftRequestId: String?, book: ThesisBook = .shared, owner: String?,
                     readSummary: (String) -> NucleoReadSummary?) -> Source {
        if let thesisId {
            return book.thesis(id: thesisId, owner: owner).map(Source.existing) ?? .missing
        }
        if let draftRequestId, let read = readSummary(draftRequestId) { return .read(read) }
        return .missing
    }

    // MARK: What the screen shows

    var symbol: String? {
        switch source {
        case let .read(read): return read.symbol
        case let .existing(thesis): return thesis.symbol
        case .missing: return nil
        }
    }

    var name: String? {
        switch source {
        case let .read(read): return read.name
        case let .existing(thesis): return thesis.name
        case .missing: return nil
        }
    }

    var isNew: Bool { if case .read = source { return true }; return false }

    /// The price a new thesis will start from (the read's), so the person sees what is kept with their words.
    var startingPrice: Double? {
        guard case let .read(read) = source, let price = read.price, price.isFinite, price > 0 else { return nil }
        return price
    }

    var canSave: Bool { source != .missing && !ThesisBook.clean(hypothesis).isEmpty }

    /// The person changed something that is not saved yet: closing the editor now would lose it, so
    /// the screen asks first. An untouched draft from Bobby is not the person's words and asks nothing.
    var hasUnsavedWords: Bool {
        guard source != .missing, !isSaved, problem != .stale, problem != .notFound else { return false }
        return Words(horizon: horizon, hypothesis: hypothesis, worry: worry, changeMind: changeMind) != opened
    }

    static func remaining(_ text: String) -> Int { ThesisBook.textLimit - text.count }

    // MARK: Saving

    /// The only place a thesis is written. The words are exactly what the fields show.
    @discardableResult
    func save() -> Outcome {
        guard generation() == openedGeneration else { return block(.stale) }
        do {
            switch source {
            case .missing:
                return block(.notFound)
            case let .existing(thesis):
                let saved = try book.edit(id: thesis.id, owner: owner(), horizon: horizon, hypothesis: hypothesis,
                                          worry: worry, changeMind: changeMind, now: now())
                problem = nil
                isSaved = true
                return .edited(saved)
            case let .read(read):
                let draft = ThesisDraft(symbol: read.symbol, name: read.name, isEquity: read.isEquity, horizon: horizon,
                                        hypothesis: hypothesis, worry: worry, changeMind: changeMind,
                                        sourceRequestId: read.requestId, price: startingPrice,
                                        asOf: read.asOf.isEmpty ? nil : read.asOf,
                                        verdict: ["wait", "review"].contains(read.verdict) ? read.verdict : nil)
                let saved = try book.create(draft, owner: owner(), now: now())
                problem = nil
                active = []
                isSaved = true
                ThesisEvents.post(ThesisEvents.saved, thesisId: saved.id)
                return .created(saved)
            }
        } catch let error as ThesisBook.BookError {
            switch error {
            case .emptyHypothesis: return block(.emptyHypothesis)
            case let .alreadyActive(id): return block(.alreadyActive(id: id))
            case .limitReached:
                active = book.active(owner: owner())
                return block(.limitReached)
            case .notFound: return block(.notFound)
            }
        } catch {
            return block(.notFound)
        }
    }

    /// The limit state: the person archives one of the three, and the Save they asked for continues.
    @discardableResult
    func archiveAndSave(_ id: String) -> Outcome {
        guard generation() == openedGeneration else { return block(.stale) }
        _ = try? book.archive(id: id, owner: owner(), now: now())
        return save()
    }

    /// Back from the limit state to the words, with nothing archived and nothing saved.
    func backToWords() {
        if problem == .limitReached { problem = nil; active = [] }
    }

    /// Typing again clears the inline message about an empty field.
    func edited() {
        if problem == .emptyHypothesis, !ThesisBook.clean(hypothesis).isEmpty { problem = nil }
    }

    private func block(_ problem: Problem) -> Outcome {
        self.problem = problem
        return .blocked(problem)
    }

    // MARK: Text limits

    /// A suggestion that fits the field: single-spaced, and cut at a word when it is longer than the limit.
    static func fit(_ text: String?) -> String {
        let collapsed = (text ?? "").components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        guard collapsed.count > ThesisBook.textLimit else { return collapsed }
        let head = String(collapsed.prefix(ThesisBook.textLimit))
        guard let space = head.lastIndex(of: " "), head.distance(from: head.startIndex, to: space) > ThesisBook.textLimit / 2 else { return head }
        return String(head[..<space])
    }

    private func limit(_ field: ReferenceWritableKeyPath<ThesisEditorModel, String>, _ oldValue: String) {
        let value = self[keyPath: field]
        if value.count > ThesisBook.textLimit { self[keyPath: field] = String(value.prefix(ThesisBook.textLimit)) }
        else if value != oldValue { edited() }
    }
}
