// The nudge (1.8): ONE line and ONE button Bobby may place on the glass, so a person meets
// credits, memory, their theses, reminders and invitations where they talk to Bobby instead
// of having to discover a row in the profile.
//
// The page draws it and forwards the tap (`session.nudge`, `nudge.seen`, `nudge.act`); it never
// writes the copy and never decides what opens. Each feature registers a `NudgeSource` from its
// own file. This centre picks at most one, and keeps it quiet: a nudge shows twice, rests a
// week, may come back for one more round, and is gone for good once the person acts on it.
// Nothing here touches the network, and nothing shows before the risk notice is accepted.
import Foundation

/// What the page receives: an opaque id, the line and the button label (already localized).
struct NucleoNudge: Equatable {
    static let idPattern = #"^[a-z][a-z0-9_.-]{0,47}$"#
    /// The page ellipsizes a longer line; sources should stay under this.
    static let textLimit = 46

    let id: String
    let text: String
    let cta: String

    var json: [String: Any] { ["id": id, "text": text, "cta": cta] }
}

/// The last delivered read of this launch. Never the question's text.
struct NudgeRead: Equatable {
    let requestId: String
    let symbol: String
    let name: String
    let isEquity: Bool
    /// `wait` | `review`.
    let verdict: String
    var saved: Bool
    let at: Date
    /// What the server says its memory holds about this asset (nil when memory did not apply).
    var memory: MemoryReceipt? = nil
}

/// What a source may look at when it decides whether it has something to say.
struct NudgeMoment {
    var signedIn: Bool
    var now: Date
    var lastRead: NudgeRead?
    /// Delivered reads since launch.
    var readsThisLaunch: Int
}

/// One feature's voice on the glass. `candidate` must be cheap and synchronous (stored state only).
@MainActor
struct NudgeSource {
    /// `credits`, `memory`, `theses`, `reminders`, `invite`… One source per key; registering again replaces it.
    let key: String
    /// Higher speaks first.
    let priority: Int
    let candidate: (NudgeMoment) -> NucleoNudge?
    /// The tap. It may open a sheet through the session; the nudge is already retired when this runs.
    let act: (NucleoNudge, NucleoSession) async -> Void
}

@MainActor
final class NudgeCenter {
    static let shared = NudgeCenter()
    static let storeKey = "nucleo.nudges.v1"

    struct Policy: Equatable {
        /// Showings before a rest.
        var perRound = 2
        /// Days a nudge rests after a round nobody answered.
        var restDays = 7
        /// Showings ever; after that it never returns.
        var lifetime = 4
        /// Two showings closer than this are one (the idle screen redraws often).
        var showingGap: TimeInterval = 600
        /// After a tap nothing else speaks for this long: one nudge at a time, never a queue.
        var quietAfterTap: TimeInterval = 900
    }

    var policy = Policy()
    var now: () -> Date = { Date() }
    private let defaults: UserDefaults
    private var sources: [NudgeSource] = []
    /// What was handed to the page, so a tap finds its source even if the candidate has since changed.
    private var served: [String: (nudge: NucleoNudge, key: String)] = [:]
    private(set) var lastRead: NudgeRead?
    private(set) var readsThisLaunch = 0
    private var lastTapAt: Date?

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    // MARK: Sources

    func register(_ source: NudgeSource) {
        sources.removeAll { $0.key == source.key }
        sources.append(source)
        sources.sort { $0.priority == $1.priority ? $0.key < $1.key : $0.priority > $1.priority }
    }

    func unregisterAll() { sources = []; served = [:] }
    var sourceKeys: [String] { sources.map(\.key) }

    // MARK: The moment

    func noteRead(_ read: NudgeRead) {
        lastRead = read
        readsThisLaunch += 1
    }

    func noteSaved(requestId: String) {
        if lastRead?.requestId == requestId { lastRead?.saved = true }
    }

    /// A new account or a withdrawn consent: nothing of the previous reader's session remains.
    func forgetMoment() {
        lastRead = nil
        readsThisLaunch = 0
        served = [:]
        lastTapAt = nil
    }

    func moment(signedIn: Bool) -> NudgeMoment {
        NudgeMoment(signedIn: signedIn, now: now(), lastRead: lastRead, readsThisLaunch: readsThisLaunch)
    }

    // MARK: Choosing

    /// The one nudge for this moment, or nil. Ids that do not match the bridge pattern are never served.
    func current(_ moment: NudgeMoment) -> NucleoNudge? {
        if let lastTapAt, moment.now.timeIntervalSince(lastTapAt) < policy.quietAfterTap { return nil }
        for source in sources {
            guard let nudge = source.candidate(moment), nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression) != nil,
                  !nudge.cta.isEmpty, eligible(nudge.id, at: moment.now) else { continue }
            served[nudge.id] = (nudge, source.key)
            return nudge
        }
        return nil
    }

    func eligible(_ id: String, at date: Date) -> Bool {
        guard let record = records[id] else { return true }
        if record.done || record.shown >= policy.lifetime { return false }
        let resting = record.shown > 0 && record.shown % policy.perRound == 0
        if resting, date.timeIntervalSince1970 - record.at < Double(policy.restDays) * 86_400 { return false }
        return true
    }

    // MARK: The page's two reports

    /// The page drew it. Returns the showings so far.
    @discardableResult
    func seen(_ id: String) -> Int {
        var all = records
        var record = all[id] ?? Record()
        let t = now().timeIntervalSince1970
        guard !record.done else { return record.shown }
        if record.shown == 0 || t - record.at >= policy.showingGap {
            record.shown += 1
            record.at = t
            all[id] = record
            write(all)
        }
        return record.shown
    }

    /// The person tapped it: it is retired, then its source acts. `gone` when it is unknown or already retired.
    func act(_ id: String, session: NucleoSession) async -> String {
        guard let entry = served[id], let source = sources.first(where: { $0.key == entry.key }), records[id]?.done != true else { return "gone" }
        retire(id)
        lastTapAt = now()
        await source.act(entry.nudge, session)
        return "done"
    }

    /// Never again (acted on elsewhere, or no longer true).
    func retire(_ id: String) {
        var all = records
        var record = all[id] ?? Record()
        record.done = true
        record.at = now().timeIntervalSince1970
        all[id] = record
        write(all)
        served[id] = nil
    }

    func showings(_ id: String) -> Int { records[id]?.shown ?? 0 }
    func isRetired(_ id: String) -> Bool { records[id]?.done == true }

    /// Account deletion: the device forgets which nudges it showed.
    func reset() {
        defaults.removeObject(forKey: Self.storeKey)
        forgetMoment()
    }

    // MARK: Store

    private struct Record: Codable, Equatable {
        var shown = 0
        var at: TimeInterval = 0
        var done = false
    }

    /// Retired and exhausted ids older than this are dropped so the store cannot grow without bound.
    private static let keepDays: Double = 180

    private var records: [String: Record] {
        guard let data = defaults.data(forKey: Self.storeKey),
              let all = try? JSONDecoder().decode([String: Record].self, from: data) else { return [:] }
        return all
    }

    private func write(_ all: [String: Record]) {
        let cutoff = now().timeIntervalSince1970 - Self.keepDays * 86_400
        let kept = all.filter { $0.value.at >= cutoff }
        if let data = try? JSONEncoder().encode(kept) { defaults.set(data, forKey: Self.storeKey) }
    }
}
