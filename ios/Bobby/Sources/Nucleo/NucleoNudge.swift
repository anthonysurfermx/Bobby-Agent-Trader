// The nudge (1.8): ONE line and ONE button Bobby may place on the glass, so a person meets
// credits, memory, their theses, reminders and invitations where they talk to Bobby instead
// of having to discover a row in the profile.
//
// The page draws it and forwards the tap (`session.nudge`, `nudge.seen`, `nudge.act`); it never
// writes the copy and never decides what opens. Each feature registers a `NudgeSource` from its
// own file. This centre picks at most one, and keeps it quiet: a nudge shows twice, rests a
// week, may come back for one more round, and is gone for good once the person acts on it.
// What was shown and tapped is remembered per account (a decision by one person on this phone
// never silences the offer for another). Nothing here touches the network, and nothing shows
// before the risk notice is accepted.
import Foundation

/// What the page receives: an opaque id, the line and the button label (already localized).
struct NucleoNudge: Equatable {
    static let idPattern = #"^[a-z][a-z0-9_.-]{0,47}$"#
    /// The page ellipsizes a longer line; sources should stay under this.
    static let textLimit = 46
    static let ctaLimit = 22

    let id: String
    let text: String
    let cta: String
    /// Native-only refresh deadline: a dated claim can change while the page stays open.
    let refreshAt: Date?

    /// Ids are lowercase on the wire (a UUID fragment or an ISO week may arrive in capitals).
    init(id: String, text: String, cta: String, refreshAt: Date? = nil) {
        self.id = id.lowercased()
        self.text = text
        self.cta = cta
        self.refreshAt = refreshAt
    }

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
    static let storePrefix = "nucleo.nudges.v1."
    static let lastTapKey = "nucleo.nudges.lastTap"

    struct Policy: Equatable {
        /// Showings before a rest.
        var perRound = 2
        /// Days a nudge rests after a round nobody answered.
        var restDays = 7
        /// Showings ever; after that it never returns.
        var lifetime = 4
        /// Two showings closer than this are one (the idle screen redraws often); a nudge that just
        /// finished its round stays on screen this long before it rests.
        var showingGap: TimeInterval = 600
        /// After a tap nothing else speaks for this long: one nudge at a time, never a queue.
        var quietAfterTap: TimeInterval = 900
    }

    var policy = Policy()
    var now: () -> Date = { Date() }
    /// Whose showings and taps are counted: the signed-in account, or nil for this phone signed out.
    var owner: String? { didSet { if owner != oldValue { served = [:]; currentId = nil } } }
    private let defaults: UserDefaults
    private var sources: [NudgeSource] = []
    /// What was handed to the page, so a tap finds its source even if the candidate has since changed.
    private var served: [String: (nudge: NucleoNudge, key: String)] = [:]
    /// The nudge in the page's latest session, if any: only that one can be tapped.
    private var currentId: String?
    private(set) var lastRead: NudgeRead?
    private(set) var readsThisLaunch = 0

    init(defaults: UserDefaults = .standard) { self.defaults = defaults }

    /// `nucleo.nudges.v1.<owner>`; signed out is `local`.
    static func storeKey(owner: String?) -> String { storePrefix + (owner ?? "local") }

    // MARK: Sources

    func register(_ source: NudgeSource) {
        sources.removeAll { $0.key == source.key }
        sources.append(source)
        sources.sort { $0.priority == $1.priority ? $0.key < $1.key : $0.priority > $1.priority }
    }

    func unregisterAll() { sources = []; served = [:]; currentId = nil }
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
    /// The quiet period after a tap belongs to the phone and is kept.
    func forgetMoment() {
        lastRead = nil
        readsThisLaunch = 0
        served = [:]
        currentId = nil
    }

    func moment(signedIn: Bool) -> NudgeMoment {
        NudgeMoment(signedIn: signedIn, now: now(), lastRead: lastRead, readsThisLaunch: readsThisLaunch)
    }

    // MARK: Choosing

    /// The one nudge for this moment, or nil. Ids that do not match the bridge pattern are never served.
    func current(_ moment: NudgeMoment) -> NucleoNudge? {
        currentId = nil
        if let lastTapAt, moment.now.timeIntervalSince(lastTapAt) < policy.quietAfterTap { return nil }
        for source in sources {
            guard let nudge = source.candidate(moment), nudge.id.range(of: NucleoNudge.idPattern, options: .regularExpression) != nil,
                  !nudge.cta.isEmpty, eligible(nudge.id, at: moment.now) else { continue }
            served[nudge.id] = (nudge, source.key)
            currentId = nudge.id
            return nudge
        }
        return nil
    }

    /// A quiet glass (a sheet is up, consent is missing): nothing is served and nothing can be tapped.
    func withhold() { currentId = nil }

    func isCurrent(_ id: String) -> Bool { currentId == id.lowercased() }

    func eligible(_ id: String, at date: Date) -> Bool {
        guard let record = records[id.lowercased()] else { return true }
        if record.done { return false }
        let sinceLast = date.timeIntervalSince1970 - record.at
        // The showing in progress is never pulled from under the reader.
        let stillShowing = record.shown > 0 && sinceLast < policy.showingGap
        if record.shown >= policy.lifetime { return stillShowing }
        let roundDone = record.shown > 0 && record.shown % policy.perRound == 0
        if roundDone, !stillShowing, sinceLast < Double(policy.restDays) * 86_400 { return false }
        return true
    }

    // MARK: The page's two reports

    /// The page drew it (it reports every drawing). Returns the showings so far.
    @discardableResult
    func seen(_ rawId: String) -> Int {
        let id = rawId.lowercased()
        // Only a nudge this centre handed out is counted: the page cannot mint records.
        guard served[id] != nil else { return records[id]?.shown ?? 0 }
        var all = records
        var record = all[id] ?? Record()
        let t = now().timeIntervalSince1970
        guard !record.done else { return record.shown }
        if record.shown == 0 || t - record.at >= policy.showingGap {
            guard eligible(id, at: now()) else { return record.shown }
            record.shown += 1
            record.at = t
            all[id] = record
            write(all)
        }
        return record.shown
    }

    /// When this nudge stops being eligible by the clock alone (its showing ends and it rests or is spent).
    func showingEnds(_ rawId: String) -> Date? {
        guard let record = records[rawId.lowercased()], !record.done, record.shown > 0 else { return nil }
        let roundDone = record.shown % policy.perRound == 0 || record.shown >= policy.lifetime
        return roundDone ? Date(timeIntervalSince1970: record.at + policy.showingGap) : nil
    }

    /// The next native clock change, including the first showing of a sourced market claim.
    func refreshAt(_ rawId: String) -> Date? {
        let id = rawId.lowercased()
        guard currentId == id else { return nil }
        return [showingEnds(id), served[id]?.nudge.refreshAt].compactMap { $0 }
            .filter { $0 > now() }.min()
    }

    /// The person tapped it: it is retired, then its source acts. `gone` when it is not the nudge on
    /// screen (unknown, already retired, replaced, or withheld because something else is up).
    func act(_ rawId: String, session: NucleoSession) async -> String {
        let id = rawId.lowercased()
        guard currentId == id, let entry = served[id], let source = sources.first(where: { $0.key == entry.key }),
              records[id]?.done != true else { return "gone" }
        retire(id)
        lastTapAt = now()
        await source.act(entry.nudge, session)
        return "done"
    }

    /// Never again (acted on elsewhere, or no longer true).
    func retire(_ rawId: String) {
        let id = rawId.lowercased()
        var all = records
        var record = all[id] ?? Record()
        record.done = true
        record.at = now().timeIntervalSince1970
        all[id] = record
        write(all)
        served[id] = nil
        if currentId == id { currentId = nil }
    }

    /// A feature erased what its nudges were about: their history (which ids were shown, when,
    /// whether they were tapped) goes with it. By owner and straight on the store, so it also works
    /// when no centre is serving that reader (the app was woken for a notification's action).
    static func forget(prefix raw: String, owner: String?, defaults: UserDefaults = .standard) {
        let prefix = raw.lowercased(), key = storeKey(owner: owner)
        guard !prefix.isEmpty, let data = defaults.data(forKey: key),
              let all = try? JSONDecoder().decode([String: Record].self, from: data) else { return }
        let kept = all.filter { !$0.key.hasPrefix(prefix) }
        guard kept.count != all.count else { return }
        if kept.isEmpty { defaults.removeObject(forKey: key) } else if let data = try? JSONEncoder().encode(kept) { defaults.set(data, forKey: key) }
    }

    /// How many ids under `prefix` this reader has a history for (the Memory screen says so, so that
    /// what the glass keeps about a feature's lines can be seen and erased with the feature's notes).
    static func count(prefix raw: String, owner: String?, defaults: UserDefaults = .standard) -> Int {
        let prefix = raw.lowercased()
        guard !prefix.isEmpty, let data = defaults.data(forKey: storeKey(owner: owner)),
              let all = try? JSONDecoder().decode([String: Record].self, from: data) else { return 0 }
        return all.keys.filter { $0.hasPrefix(prefix) }.count
    }

    /// A feature keeps the history of its lines no longer than what they were about: ids under
    /// `prefix` last touched before `cutoff` go, retired or not (the general rule keeps a retired id
    /// much longer, so that "never again" survives; here the thing it was about is itself gone).
    static func prune(prefix raw: String, before cutoff: Date, owner: String?, defaults: UserDefaults = .standard) {
        let prefix = raw.lowercased(), key = storeKey(owner: owner)
        guard !prefix.isEmpty, let data = defaults.data(forKey: key),
              let all = try? JSONDecoder().decode([String: Record].self, from: data) else { return }
        let kept = all.filter { !($0.key.hasPrefix(prefix) && $0.value.at < cutoff.timeIntervalSince1970) }
        guard kept.count != all.count else { return }
        if kept.isEmpty { defaults.removeObject(forKey: key) } else if let data = try? JSONEncoder().encode(kept) { defaults.set(data, forKey: key) }
    }

    func showings(_ id: String) -> Int { records[id.lowercased()]?.shown ?? 0 }
    func isRetired(_ id: String) -> Bool { records[id.lowercased()]?.done == true }

    /// Tests and "start over": the current owner's history, the quiet period and this launch's moment.
    func reset() {
        defaults.removeObject(forKey: Self.storeKey(owner: owner))
        defaults.removeObject(forKey: Self.lastTapKey)
        forgetMoment()
    }

    /// Account deletion: that account's nudge history leaves the phone.
    static func forgetOwner(_ userId: String, defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: storeKey(owner: userId))
    }

    // MARK: Store

    private struct Record: Codable, Equatable {
        var shown = 0
        var at: TimeInterval = 0
        var done = false
    }

    /// Unanswered, unspent ids older than this are dropped; retired and spent ones are kept so that
    /// "never again" survives, up to `finishedKept` of the most recent.
    private static let keepDays: Double = 180
    private static let finishedKept = 300

    private var lastTapAt: Date? {
        get { (defaults.object(forKey: Self.lastTapKey) as? Double).map { Date(timeIntervalSince1970: $0) } }
        set {
            if let newValue { defaults.set(newValue.timeIntervalSince1970, forKey: Self.lastTapKey) }
            else { defaults.removeObject(forKey: Self.lastTapKey) }
        }
    }

    private var records: [String: Record] {
        guard let data = defaults.data(forKey: Self.storeKey(owner: owner)),
              let all = try? JSONDecoder().decode([String: Record].self, from: data) else { return [:] }
        return all
    }

    private func write(_ all: [String: Record]) {
        let cutoff = now().timeIntervalSince1970 - Self.keepDays * 86_400
        var kept: [String: Record] = [:]
        var finished: [(String, Record)] = []
        for (id, record) in all {
            if record.done || record.shown >= policy.lifetime { finished.append((id, record)) }
            else if record.at >= cutoff { kept[id] = record }
        }
        for (id, record) in finished.sorted(by: { $0.1.at > $1.1.at }).prefix(Self.finishedKept) { kept[id] = record }
        if let data = try? JSONEncoder().encode(kept) { defaults.set(data, forKey: Self.storeKey(owner: owner)) }
    }
}
