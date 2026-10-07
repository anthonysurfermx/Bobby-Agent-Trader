// What 1.8 adds to the desk request and reply (POST /api/desk-debate). Everything is additive and
// optional: a server that knows none of it answers exactly as before, and a 1.7 client never
// sends or reads any of it.
import Foundation

/// The thesis a review is read against: the person's own words, sent only inside a review they
/// started, as part of that question. The server does not store it.
struct ThesisContext: Sendable, Equatable {
    var hypothesis: String
    var worry: String
    var changeMind: String
    /// `weeks` | `months` | `year` | `years`, or nil when the person chose none.
    var horizon: String?
    /// ISO-8601, when the thesis was written.
    var savedAt: String
    var priceAtSave: Double?
    var lastReviewedAt: String?

    init(_ thesis: SavedThesis) {
        hypothesis = thesis.hypothesis
        worry = thesis.worry
        changeMind = thesis.changeMind
        horizon = thesis.horizon?.rawValue
        savedAt = Self.iso.string(from: thesis.createdAt)
        priceAtSave = thesis.startingPoint?.price
        lastReviewedAt = thesis.lastReviewedAt.map { Self.iso.string(from: $0) }
    }

    var json: [String: Any] {
        var body: [String: Any] = ["hypothesis": hypothesis, "savedAt": savedAt]
        if !worry.isEmpty { body["worry"] = worry }
        if !changeMind.isEmpty { body["changeMind"] = changeMind }
        if let horizon { body["horizon"] = horizon }
        if let priceAtSave, priceAtSave.isFinite, priceAtSave > 0 { body["priceAtSave"] = priceAtSave }
        if let lastReviewedAt { body["lastReviewedAt"] = lastReviewedAt }
        return body
    }

    private static let iso: ISO8601DateFormatter = { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f }()
}

/// `memory` in the reply: what Bobby's memory holds about this asset for this account, so the app
/// can show a receipt. Facts only (counts, days, a percentage); never text.
struct MemoryReceipt: Sendable, Equatable {
    /// This question was added to memory.
    let recorded: Bool
    /// Times this account asked about the asset, this one included.
    let asks: Int
    let lastAskedDaysAgo: Int?
    let changeSinceLastAskPct: Double?

    init?(json: Any?) {
        guard let body = json as? [String: Any], let recorded = body["recorded"] as? Bool else { return nil }
        self.recorded = recorded
        asks = max(0, BobbyReadAccess.count(body["asks"]) ?? 0)
        lastAskedDaysAgo = BobbyReadAccess.count(body["lastAskedDaysAgo"]).flatMap { $0 >= 0 ? $0 : nil }
        let pct = (body["changeSinceLastAskPct"] as? NSNumber)?.doubleValue
        changeSinceLastAskPct = pct.flatMap { $0.isFinite && abs($0) < 10_000 ? $0 : nil }
    }

    init(recorded: Bool, asks: Int, lastAskedDaysAgo: Int? = nil, changeSinceLastAskPct: Double? = nil) {
        self.recorded = recorded; self.asks = asks; self.lastAskedDaysAgo = lastAskedDaysAgo; self.changeSinceLastAskPct = changeSinceLastAskPct
    }
}

/// `review` in the reply to a question that carried a thesis: what the dated evidence supports,
/// what it challenges, what is still unknown, and the kinds of evidence the desk cannot check at
/// all (codes such as `news`, `earnings`, `filings`, `fundamentals`; the app words them).
struct ThesisReviewNotes: Sendable, Equatable {
    static let itemLimit = 4
    static let textLimit = 280
    static let notCheckedCodes: Set<String> = ["news", "earnings", "filings", "fundamentals", "macro"]

    var supports: [String]
    var challenges: [String]
    var unknowns: [String]
    var notChecked: [String]

    init?(json: Any?) {
        guard let body = json as? [String: Any] else { return nil }
        func list(_ key: String) -> [String] {
            ((body[key] as? [Any]) ?? []).compactMap { ($0 as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }.prefix(Self.itemLimit).map { String($0.prefix(Self.textLimit)) }
        }
        supports = list("supports"); challenges = list("challenges"); unknowns = list("unknowns")
        notChecked = ((body["notChecked"] as? [Any]) ?? []).compactMap { $0 as? String }.filter { Self.notCheckedCodes.contains($0) }
    }

    init(supports: [String] = [], challenges: [String] = [], unknowns: [String] = [], notChecked: [String] = []) {
        self.supports = supports; self.challenges = challenges; self.unknowns = unknowns; self.notChecked = notChecked
    }

    var isEmpty: Bool { supports.isEmpty && challenges.isEmpty && unknowns.isEmpty }
}

/// What a 1.8 screen may know about a recent read (the editor drafts a thesis from it). No question text.
struct NucleoReadSummary: Equatable {
    let requestId: String
    let symbol: String
    let name: String
    let isEquity: Bool
    let verdict: String
    let price: Double?
    let asOf: String
    let headline: String?
    let why: String?
    let risk: String?
    let watch: String?
}

/// Hand-offs between a nudge or a notification tap and the screen it opens. Consumed once.
@MainActor
enum V18Focus {
    /// The read a thesis is being written from.
    static var draftRequestId: String?
    /// The thesis a screen should open on (a reminder tap, a nudge, a row).
    static var thesisId: String?

    static func takeDraftRequestId() -> String? { defer { draftRequestId = nil }; return draftRequestId }
    static func takeThesisId() -> String? { defer { thesisId = nil }; return thesisId }
    static func clear() { draftRequestId = nil; thesisId = nil }
}
