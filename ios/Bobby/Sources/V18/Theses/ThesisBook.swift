// The thesis book (1.8). A thesis is what the PERSON wrote and approved about one asset: why they
// are looking at it, what worries them and what would change their mind. It is never inferred
// and never written by Bobby without the person seeing and saving the words.
//
// It lives on this phone only (UserDefaults, per account like the saved-reads ledger): no server
// copy, nothing to sync, erased with the account and with "Delete everything" in Memory. Its text
// leaves the phone only inside a review the person starts, as part of that question.
// Three active theses at most: a fourth asks to archive one first.
import Foundation

/// How long the person says they are looking at this. Their choice, never deduced from a question.
enum ThesisHorizon: String, Codable, CaseIterable, Equatable {
    case weeks, months, year, years
}

/// One dated entry in a thesis's history.
struct ThesisRevision: Codable, Equatable, Identifiable {
    enum Kind: String, Codable { case created, edited, reviewed, kept, archived, reactivated }

    let id: String
    let at: Date
    let kind: Kind
    /// The market price Bobby's evidence carried at that moment, and when that evidence was dated.
    var price: Double?
    var asOf: String?
    /// Bobby's verdict on the read behind this entry (`wait` | `review`); nil for the person's own edits.
    var verdict: String?
    /// A review only: what the evidence supports, what it challenges, what could not be checked.
    var supports: [String] = []
    var challenges: [String] = []
    var unknowns: [String] = []

    init(id: String = UUID().uuidString, at: Date, kind: Kind, price: Double? = nil, asOf: String? = nil, verdict: String? = nil,
         supports: [String] = [], challenges: [String] = [], unknowns: [String] = []) {
        self.id = id; self.at = at; self.kind = kind; self.price = price; self.asOf = asOf; self.verdict = verdict
        self.supports = supports; self.challenges = challenges; self.unknowns = unknowns
    }
}

struct SavedThesis: Codable, Equatable, Identifiable {
    enum Status: String, Codable { case active, archived }

    let id: String
    let symbol: String
    let name: String
    let isEquity: Bool
    var status: Status
    var horizon: ThesisHorizon?
    /// Why I am looking at this. Required.
    var hypothesis: String
    /// What worries me. May be empty.
    var worry: String
    /// What would change my mind. May be empty.
    var changeMind: String
    let createdAt: Date
    var updatedAt: Date
    var lastReviewedAt: Date?
    /// The read it was written from, when there was one.
    var sourceRequestId: String?
    /// Oldest first.
    var revisions: [ThesisRevision]

    /// The price and date the thesis started from (its first entry that carries one).
    var startingPoint: (price: Double, at: Date)? {
        revisions.first { $0.price != nil }.flatMap { r in r.price.map { ($0, r.at) } }
    }

    var lastReview: ThesisRevision? { revisions.last { $0.kind == .reviewed } }
}

/// What the editor hands over: the person's words, already seen and approved by them.
struct ThesisDraft: Equatable {
    var symbol: String
    var name: String
    var isEquity: Bool
    var horizon: ThesisHorizon?
    var hypothesis: String
    var worry: String = ""
    var changeMind: String = ""
    var sourceRequestId: String?
    var price: Double?
    var asOf: String?
    var verdict: String?
}

final class ThesisBook {
    static let shared = ThesisBook()
    static let activeLimit = 3
    static let archivedLimit = 20
    static let textLimit = 280
    static let revisionLimit = 30
    /// Posted (main thread) after every change; the object is the owner key.
    static let didChange = Notification.Name("ThesisBook.didChange")

    enum BookError: Error, Equatable {
        /// Three are active already: the caller offers to archive one.
        case limitReached
        case emptyHypothesis
        case notFound
        /// One active thesis per asset: the caller opens the existing one.
        case alreadyActive(id: String)
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// `v18.theses.<owner>`; signed out is `local`.
    static func key(owner: String?) -> String { "v18.theses." + (owner ?? "local") }

    /// Trimmed, single-spaced and capped: what is stored is what the person saw, never more.
    static func clean(_ text: String) -> String {
        let collapsed = text.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        return String(collapsed.prefix(textLimit))
    }

    // MARK: Reading

    /// Active first (most recently touched first), then archived.
    func all(owner: String?) -> [SavedThesis] {
        guard let data = defaults.data(forKey: Self.key(owner: owner)),
              let list = try? Self.decoder.decode([SavedThesis].self, from: data) else { return [] }
        return list.sorted { a, b in
            if a.status != b.status { return a.status == .active }
            return a.updatedAt > b.updatedAt
        }
    }

    func active(owner: String?) -> [SavedThesis] { all(owner: owner).filter { $0.status == .active } }
    func archived(owner: String?) -> [SavedThesis] { all(owner: owner).filter { $0.status == .archived } }
    func thesis(id: String, owner: String?) -> SavedThesis? { all(owner: owner).first { $0.id == id } }
    func activeThesis(symbol: String, owner: String?) -> SavedThesis? {
        active(owner: owner).first { $0.symbol.caseInsensitiveCompare(symbol) == .orderedSame }
    }
    func canAddActive(owner: String?) -> Bool { active(owner: owner).count < Self.activeLimit }

    // MARK: Writing

    @discardableResult
    func create(_ draft: ThesisDraft, owner: String?, now: Date = Date()) throws -> SavedThesis {
        let hypothesis = Self.clean(draft.hypothesis)
        guard !hypothesis.isEmpty else { throw BookError.emptyHypothesis }
        if let existing = activeThesis(symbol: draft.symbol, owner: owner) { throw BookError.alreadyActive(id: existing.id) }
        guard canAddActive(owner: owner) else { throw BookError.limitReached }
        let thesis = SavedThesis(
            id: UUID().uuidString, symbol: draft.symbol.uppercased(), name: draft.name, isEquity: draft.isEquity, status: .active,
            horizon: draft.horizon, hypothesis: hypothesis, worry: Self.clean(draft.worry), changeMind: Self.clean(draft.changeMind),
            createdAt: now, updatedAt: now, lastReviewedAt: nil, sourceRequestId: draft.sourceRequestId,
            revisions: [ThesisRevision(at: now, kind: .created, price: draft.price, asOf: draft.asOf, verdict: draft.verdict)])
        var list = all(owner: owner)
        list.append(thesis)
        write(list, owner: owner)
        return thesis
    }

    /// The person changed their own words (or the horizon). An edit that changes nothing records nothing.
    @discardableResult
    func edit(id: String, owner: String?, horizon: ThesisHorizon?, hypothesis: String, worry: String, changeMind: String,
              now: Date = Date()) throws -> SavedThesis {
        let cleaned = Self.clean(hypothesis)
        guard !cleaned.isEmpty else { throw BookError.emptyHypothesis }
        return try mutate(id: id, owner: owner) { thesis in
            let before = (thesis.horizon, thesis.hypothesis, thesis.worry, thesis.changeMind)
            thesis.horizon = horizon
            thesis.hypothesis = cleaned
            thesis.worry = Self.clean(worry)
            thesis.changeMind = Self.clean(changeMind)
            guard before != (thesis.horizon, thesis.hypothesis, thesis.worry, thesis.changeMind) else { return }
            thesis.updatedAt = now
            Self.append(ThesisRevision(at: now, kind: .edited), to: &thesis)
        }
    }

    /// A review the person ran: what Bobby's dated evidence supports, challenges and could not check.
    @discardableResult
    func recordReview(id: String, owner: String?, price: Double?, asOf: String?, verdict: String?,
                      supports: [String], challenges: [String], unknowns: [String], now: Date = Date()) throws -> SavedThesis {
        try mutate(id: id, owner: owner) { thesis in
            thesis.lastReviewedAt = now
            thesis.updatedAt = now
            let trim: ([String]) -> [String] = { $0.map(Self.clean).filter { !$0.isEmpty }.prefix(6).map { $0 } }
            Self.append(ThesisRevision(at: now, kind: .reviewed, price: price, asOf: asOf, verdict: verdict,
                                       supports: trim(supports), challenges: trim(challenges), unknowns: trim(unknowns)), to: &thesis)
        }
    }

    /// "I keep it as it is" after a review.
    @discardableResult
    func keep(id: String, owner: String?, now: Date = Date()) throws -> SavedThesis {
        try mutate(id: id, owner: owner) { thesis in
            thesis.updatedAt = now
            Self.append(ThesisRevision(at: now, kind: .kept), to: &thesis)
        }
    }

    @discardableResult
    func archive(id: String, owner: String?, now: Date = Date()) throws -> SavedThesis {
        let archived = try mutate(id: id, owner: owner) { thesis in
            guard thesis.status == .active else { return }
            thesis.status = .archived
            thesis.updatedAt = now
            Self.append(ThesisRevision(at: now, kind: .archived), to: &thesis)
        }
        // The oldest archived theses fall off; active ones never do.
        var list = all(owner: owner)
        let old = list.filter { $0.status == .archived }.dropFirst(Self.archivedLimit).map(\.id)
        if !old.isEmpty {
            list.removeAll { old.contains($0.id) }
            write(list, owner: owner)
        }
        return archived
    }

    @discardableResult
    func reactivate(id: String, owner: String?, now: Date = Date()) throws -> SavedThesis {
        guard let current = thesis(id: id, owner: owner) else { throw BookError.notFound }
        if current.status == .active { return current }
        if let existing = activeThesis(symbol: current.symbol, owner: owner) { throw BookError.alreadyActive(id: existing.id) }
        guard canAddActive(owner: owner) else { throw BookError.limitReached }
        return try mutate(id: id, owner: owner) { thesis in
            thesis.status = .active
            thesis.updatedAt = now
            Self.append(ThesisRevision(at: now, kind: .reactivated), to: &thesis)
        }
    }

    func delete(id: String, owner: String?) {
        var list = all(owner: owner)
        let before = list.count
        list.removeAll { $0.id == id }
        if list.count != before { write(list, owner: owner) }
    }

    /// "Delete everything" in Memory: every thesis of this owner, on this phone.
    func deleteAll(owner: String?) {
        defaults.removeObject(forKey: Self.key(owner: owner))
        announce(owner)
    }

    /// Account deletion: only the deleted account's theses.
    static func forgetOwner(_ userId: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key(owner: userId))
    }

    /// A person who wrote theses signed out and then created their account: the theses follow them,
    /// once, and only into an account that has none (never merged into existing ones).
    @discardableResult
    func adoptLocal(into userId: String) -> Int {
        let local = all(owner: nil)
        guard !local.isEmpty, all(owner: userId).isEmpty else { return 0 }
        write(local, owner: userId)
        defaults.removeObject(forKey: Self.key(owner: nil))
        return local.count
    }

    // MARK: Internals

    private static let encoder: JSONEncoder = { let e = JSONEncoder(); e.dateEncodingStrategy = .millisecondsSince1970; return e }()
    private static let decoder: JSONDecoder = { let d = JSONDecoder(); d.dateDecodingStrategy = .millisecondsSince1970; return d }()

    private static func append(_ revision: ThesisRevision, to thesis: inout SavedThesis) {
        thesis.revisions.append(revision)
        // The first entry (where the thesis started) is always kept.
        if thesis.revisions.count > revisionLimit {
            thesis.revisions.removeSubrange(1...(thesis.revisions.count - revisionLimit))
        }
    }

    private func mutate(id: String, owner: String?, _ change: (inout SavedThesis) -> Void) throws -> SavedThesis {
        var list = all(owner: owner)
        guard let index = list.firstIndex(where: { $0.id == id }) else { throw BookError.notFound }
        let before = list[index]
        change(&list[index])
        if list[index] != before { write(list, owner: owner) }
        return list[index]
    }

    private func write(_ list: [SavedThesis], owner: String?) {
        if let data = try? Self.encoder.encode(list) { defaults.set(data, forKey: Self.key(owner: owner)) }
        announce(owner)
    }

    private func announce(_ owner: String?) {
        let post = { NotificationCenter.default.post(name: Self.didChange, object: Self.key(owner: owner)) }
        if Thread.isMainThread { post() } else { DispatchQueue.main.async(execute: post) }
    }
}
