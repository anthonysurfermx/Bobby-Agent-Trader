// Theses on the glass (1.8). Two things Bobby may say, one at a time:
//   a. right after the person saved a read on an asset they have no thesis on: write down why;
//   b. a thesis that has gone a week or more without a review: come back to it.
// The candidate reads only the thesis book and the last read of this launch (never the network),
// and the tap opens the editor or the review; nothing is written or sent by the nudge itself.
import Foundation

@MainActor
enum ThesisNudges {
    static let key = "theses"
    /// A thesis is due when this many days passed since its last review (or since it was written).
    static let dueAfterDays = 7
    /// "Right after": the saved read is still the one the person has in mind.
    static let writeWindow: TimeInterval = 6 * 3_600

    /// What a served nudge opens (nudge id → read or thesis id), so a tap finds it even if the moment moved on.
    private static var targets: [String: String] = [:]

    static func register(_ center: NudgeCenter) {
        center.register(source())
    }

    static func source(book: ThesisBook = .shared,
                       owner: @escaping @MainActor () -> String? = { AccountSession.shared.session?.userId }) -> NudgeSource {
        NudgeSource(key: key, priority: NudgePriority.theses,
                    candidate: { moment in candidate(moment, book: book, owner: owner()) },
                    act: { nudge, session in act(nudge, session: session) })
    }

    // MARK: Candidates

    static func candidate(_ moment: NudgeMoment, book: ThesisBook, owner: String?) -> NucleoNudge? {
        write(moment, book: book, owner: owner) ?? due(moment, book: book, owner: owner)
    }

    /// a. The person saved a read and has no active thesis on that asset.
    static func write(_ moment: NudgeMoment, book: ThesisBook, owner: String?) -> NucleoNudge? {
        guard let read = moment.lastRead, read.saved,
              moment.now.timeIntervalSince(read.at) < writeWindow, moment.now >= read.at,
              book.activeThesis(symbol: read.symbol, owner: owner) == nil,
              let id = writeId(requestId: read.requestId) else { return nil }
        remember(id, read.requestId)
        return NucleoNudge(id: id, text: L.t("Write down why, for next time", "Escribe el porqué, para la próxima"),
                           cta: L.t("Write my thesis", "Escribir mi tesis"))
    }

    /// b. The most overdue active thesis, a week or more since its review (or since it was written).
    static func due(_ moment: NudgeMoment, book: ThesisBook, owner: String?) -> NucleoNudge? {
        var most: (thesis: SavedThesis, days: Int)?
        for thesis in book.active(owner: owner) {
            let days = daysWaiting(thesis, now: moment.now)
            guard days >= dueAfterDays else { continue }
            // The longest wait speaks; a tie goes to the same thesis every time.
            if let current = most, current.days > days || (current.days == days && current.thesis.id < thesis.id) { continue }
            most = (thesis, days)
        }
        guard let most, let id = dueId(thesisId: most.thesis.id, now: moment.now) else { return nil }
        remember(id, most.thesis.id)
        let text = dueText(symbol: most.thesis.symbol, days: most.days, reviewed: most.thesis.lastReviewedAt != nil)
        return NucleoNudge(id: id, text: text, cta: L.t("Review", "Revisar"))
    }

    /// Whole days since the last review, or since the thesis was written when it never had one.
    static func daysWaiting(_ thesis: SavedThesis, now: Date) -> Int {
        ThesisCopy.days(from: thesis.lastReviewedAt ?? thesis.createdAt, to: now)
    }

    /// The line names the asset when it fits the glass, and drops the name before it would be cut.
    static func dueText(symbol: String, days: Int, reviewed: Bool) -> String {
        let named = reviewed
            ? L.t("Your \(symbol) thesis: \(days) days since review", "Tu tesis de \(symbol): \(days) días sin revisar")
            : L.t("Your \(symbol) thesis: \(days) days, not reviewed yet", "Tu tesis de \(symbol): \(days) días, aún sin revisar")
        if named.count <= NucleoNudge.textLimit { return named }
        return reviewed
            ? L.t("Your thesis: \(days) days since review", "Tu tesis: \(days) días sin revisar")
            : L.t("Your thesis: \(days) days, not reviewed yet", "Tu tesis: \(days) días, aún sin revisar")
    }

    // MARK: Ids

    /// `theses.write.<first 8 of the request id>`: one offer per saved read.
    static func writeId(requestId: String) -> String? {
        let head = slug(requestId)
        return head.isEmpty ? nil : "theses.write." + head
    }

    /// `theses.due.<first 8 of the thesis id>.<ISO week>`: retired when tapped, back another week.
    static func dueId(thesisId: String, now: Date) -> String? {
        let head = slug(thesisId)
        return head.isEmpty ? nil : "theses.due.\(head).\(isoWeek(now))"
    }

    /// "2026w41": the ISO-8601 week, in UTC so the id does not move with the phone's time zone.
    static func isoWeek(_ date: Date) -> String {
        var calendar = Calendar(identifier: .iso8601)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        let parts = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return String(format: "%04dw%02d", parts.yearForWeekOfYear ?? 0, parts.weekOfYear ?? 0)
    }

    private static func slug(_ id: String) -> String {
        String(id.lowercased().unicodeScalars.filter { ("a"..."z").contains($0) || ("0"..."9").contains($0) }.prefix(8).map(Character.init))
    }

    private static func remember(_ nudgeId: String, _ target: String) {
        if targets.count > 64 { targets = [:] }
        targets[nudgeId] = target
    }

    static func target(of nudgeId: String) -> String? { targets[nudgeId] }

    // MARK: The tap

    static func act(_ nudge: NucleoNudge, session: NucleoSession) {
        V18Focus.clear()
        guard let target = targets[nudge.id] else { session.present(.theses); return }
        if nudge.id.hasPrefix("theses.write.") {
            // The read left memory (or belongs to an account that is gone): the list explains how to start.
            guard session.desk.readSummary(requestId: target) != nil else { session.present(.theses); return }
            V18Focus.draftRequestId = target
            session.present(.thesisEditor)
        } else {
            V18Focus.thesisId = target
            session.present(.thesisReview)
        }
    }
}
