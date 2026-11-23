// Watches (1.9.x) on the glass: how a watch is asked for, confirmed and come back to without a
// new page. Three small pieces, all native:
//  - `WatchGlass`: a sentence that asks for a watch ("tell me if Nvidia falls 5%") is answered on
//    the glass with ONE line and ONE button, the shape the page already draws for a level notice.
//    The tap starts the watch; the same line then says it is done, and its button opens the list.
//    Nothing is started by the sentence alone, and no read is spent on it.
//  - `WatchTapIntent`: a tapped "your watch was met" notification waits here until the glass is
//    free, like a briefing tap. Only a watch id of the server's own shape is accepted.
//  - `WatchNudges`: after a read of an asset that can be watched, one quiet line offers it; a met
//    watch nobody opened yet says so. Both open the list, neither asks the server anything.
import Combine
import Foundation

/// What the watches screen opens on. Set by whoever opens it, read once by the screen.
@MainActor
enum WatchFocus {
    struct Entry: Equatable {
        var draft: WatchDraft?
        /// A met or expired watch to open at once (a notification tap).
        var openId: String?
        /// The watch that was just started from the glass: the screen says so in one line.
        var startedId: String?
    }
    static var entry = Entry()
    static func clear() { entry = Entry() }
}

@MainActor
final class WatchGlass {
    static let startPrefix = "watch.start."
    static let openPrefix = "watch.open."

    private let center: @MainActor () -> WatchCenter
    private var drafts: [String: WatchDraft] = [:]
    private var opens: [String: String?] = [:]

    init(center: @escaping @MainActor () -> WatchCenter = { WatchCenter.shared }) { self.center = center }

    /// Another account, or signed out: no line of the previous one may act.
    func reset() { drafts = [:]; opens = [:] }

    func owns(_ token: String) -> Bool { token.hasPrefix(Self.startPrefix) || token.hasPrefix(Self.openPrefix) }

    /// The reply to a typed or spoken sentence, or nil when it is an ordinary question (or watches
    /// are not there for this person, which the phone only knows once the server listed them).
    func offer(_ question: String) -> [String: Any]? {
        guard let board = center().board, let draft = WatchIntent.parse(question, board: board) else { return nil }
        return line(caption: WatchCopy.proposal(draft), sub: WatchCopy.atClose, cta: WatchCopy.entry, token: startToken(draft))
    }

    /// The reply to a tap on one of this file's buttons. `open` shows the list.
    func act(_ token: String, open: (WatchFocus.Entry) -> Void) async -> [String: Any] {
        if token.hasPrefix(Self.openPrefix) {
            // The line stays under the list; closing the list finds it as it was.
            guard let started = opens[token] else { return Self.gone }
            open(WatchFocus.Entry(startedId: started))
            return line(caption: WatchCopy.done, sub: watch(started)?.label, cta: WatchCopy.see, token: token)
        }
        guard let draft = drafts.removeValue(forKey: token) else { return Self.gone }
        let center = center()
        let before = Set(center.board?.active.map(\.id) ?? [])
        if await center.start(symbol: draft.symbol, direction: draft.direction, percent: draft.percent, days: draft.days) {
            let made = center.board?.active.first { !before.contains($0.id) && $0.symbol == draft.symbol }
                ?? center.board?.active.first { $0.symbol == draft.symbol && $0.direction == draft.direction && $0.percent == draft.percent }
            return line(caption: WatchCopy.done, sub: made?.label, cta: WatchCopy.see, token: openToken(made?.id))
        }
        guard center.offered, let problem = center.problem else { return Self.gone }
        // "Try again" keeps the same choice; anything else is explained on the list.
        if problem == .unavailable { return line(caption: WatchCopy.problem(problem), sub: nil, cta: WatchCopy.retry, token: startToken(draft)) }
        return line(caption: WatchCopy.problem(problem), sub: nil, cta: WatchCopy.see, token: openToken(nil))
    }

    private func watch(_ id: String?) -> BobbyWatch? { id.flatMap { id in center().board?.watches.first { $0.id == id } } }

    private func startToken(_ draft: WatchDraft) -> String {
        let token = Self.startPrefix + UUID().uuidString.lowercased()
        if drafts.count > 8 { drafts = [:] }
        drafts[token] = draft
        return token
    }

    private func openToken(_ started: String?) -> String {
        let token = Self.openPrefix + UUID().uuidString.lowercased()
        if opens.count > 8 { opens = [:] }
        opens[token] = .some(started)
        return token
    }

    /// One calm line and its button: the reply the page draws for a level notice.
    private func line(caption: String, sub: String?, cta: String, token: String) -> [String: Any] {
        ["v": 1, "status": "level_notice", "caption": caption, "sub": sub as Any? ?? NSNull(), "cta": cta, "token": token]
    }

    /// A button from before an account change, or pressed twice.
    static let gone: [String: Any] = ["v": 1, "status": "error", "code": "bad_response", "message": NSNull()]
}

/// A tapped notification of a watch that was met. The payload is `{ screen: "watch", watchId }`.
@MainActor
final class WatchTapIntent: ObservableObject {
    static let shared = WatchTapIntent()
    @Published private(set) var pending: String?
    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true) {
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.pending = nil } }
            .store(in: &cancellables)
    }

    nonisolated static func watchId(from info: [AnyHashable: Any]) -> String? {
        guard info["screen"] as? String == "watch", let id = info["watchId"] as? String,
              id.range(of: "^watch_[a-f0-9]{32}$", options: .regularExpression) != nil else { return nil }
        return id
    }

    func store(_ id: String) { pending = id }
    func take() -> String? { defer { pending = nil }; return pending }
}

@MainActor
enum WatchNudges {
    static let metKey = "watches.met"
    static let offerKey = "watches.offer"
    static let freshWindow: TimeInterval = 30 * 60

    static func register(_ nudges: NudgeCenter, center: @escaping @MainActor () -> WatchCenter = { WatchCenter.shared }) {
        let act: (NucleoNudge, NucleoSession) async -> Void = { nudge, session in
            session.openWatches(entry(nudge, moment: NudgeCenter.shared.moment(signedIn: session.signedIn), board: center().board))
        }
        nudges.register(NudgeSource(key: metKey, priority: NudgePriority.watchMet, candidate: { moment in met(moment, board: center().board) }, act: act))
        nudges.register(NudgeSource(key: offerKey, priority: NudgePriority.watchOffer, candidate: { moment in offer(moment, board: center().board) }, act: act))
    }

    /// What the glass would say about watches: a met one first, else the offer.
    static func candidate(_ moment: NudgeMoment, board: WatchBoard?) -> NucleoNudge? { met(moment, board: board) ?? offer(moment, board: board) }

    static func met(_ moment: NudgeMoment, board: WatchBoard?) -> NucleoNudge? {
        guard moment.signedIn, let met = board?.watches.first(where: { $0.state == .met && !$0.seen }) else { return nil }
        return NucleoNudge(id: "watch.met." + met.id.suffix(12), text: WatchCopy.metLine(met.symbol), cta: WatchCopy.metButton)
    }

    static func offer(_ moment: NudgeMoment, board: WatchBoard?) -> NucleoNudge? {
        guard moment.signedIn, let board else { return nil }
        guard let read = moment.lastRead, moment.now.timeIntervalSince(read.at) <= freshWindow,
              board.canWatch(read.symbol), board.hasRoom, !board.active.contains(where: { $0.symbol == read.symbol.uppercased() }) else { return nil }
        return NucleoNudge(id: "watch.offer." + read.symbol.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) },
                           text: WatchCopy.offerLine(read.symbol), cta: WatchCopy.entry)
    }

    /// What the list opens on for a tapped nudge: the met watch, or the asset just read.
    static func entry(_ nudge: NucleoNudge, moment: NudgeMoment, board: WatchBoard?) -> WatchFocus.Entry {
        if nudge.id.hasPrefix("watch.met."), let met = board?.watches.first(where: { $0.state == .met && !$0.seen }) {
            return WatchFocus.Entry(openId: met.id)
        }
        guard let read = moment.lastRead, let board, board.canWatch(read.symbol),
              let percent = WatchIntent.nearest(5, in: board.percents), let days = WatchIntent.nearest(7, in: board.days) else { return WatchFocus.Entry() }
        return WatchFocus.Entry(draft: WatchDraft(symbol: read.symbol.uppercased(), name: WatchIntent.name(of: read.symbol), direction: .falls, percent: percent, days: days))
    }
}
