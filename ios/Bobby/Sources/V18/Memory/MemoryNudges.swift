// Memory on the glass (1.8). One source, two things it may say after a read, in this order:
//   1. The receipt: the server just told the app what its memory holds about this asset
//      (`MemoryReceipt`: recorded, and a count of at least one), so Bobby says it in one line of
//      facts and offers "See memory". A count the server did not send is never filled in.
//   2. The offer: someone signed in got a read, this iPhone's questions are not in memory and the
//      account has not answered the consent as it reads today. "How it works" opens the consent sheet.
// Nobody signed in: nothing (memory needs an account). The candidate reads stored state only.
//
// Both ids carry a short fragment of the account's hash: the centre keeps its records per device,
// so without it one account's tap would silence another account on the same iPhone.
// An offer the person opened and closed without answering is not an answer: it may come back once,
// under a second id, after a rest. A consent with a new version offers again under its own id.
import Foundation

@MainActor
enum MemoryNudges {
    static let key = "memory"
    static let offerIdPrefix = "memory.offer."
    static let receiptIdPrefix = "memory.kept."
    /// An offer opened and closed without an answer rests this long before its one return.
    static let reofferAfter: TimeInterval = 7 * 86_400
    /// Offers this account may open without answering before the glass stops asking (Memory › Turn on remains).
    static let offerRounds = 2

    /// What the candidate reads besides the moment. Tests build it by hand; `liveState` reads the phone.
    struct State {
        /// The signed-in account, or nil.
        var user: String?
        /// This iPhone's questions join memory for this account: the switch is on under an accepted consent.
        var captureOn: Bool
        /// The account answered the consent as it reads today (yes or no).
        var decided: Bool
        /// Times this account opened the offer ("How it works") for this consent version, and the last time.
        var offerOpens = 0
        var offerOpenedAt: Date? = nil
        /// The consent version the offer is for.
        var version = MemoryConsent.currentVersion
        /// The person erased what a receipt for this read would name (the read's date, its symbol).
        var erased: (Date, String) -> Bool = { _, _ in false }
    }

    /// `state` is read at every candidate and `offerOpened` runs when the offer is tapped; tests pass their own.
    static func register(_ center: NudgeCenter, state: @escaping @MainActor () -> State = { liveState() },
                         offerOpened: @escaping @MainActor (String, Date) -> Void = { MemoryOfferLog().noteOpened(user: $0, at: $1) }) {
        center.register(NudgeSource(key: key, priority: NudgePriority.memory,
            candidate: { candidate($0, state: state()) },
            act: { [weak center] nudge, session in
                // Only the account the offer was made to: its fragment is in the id.
                if isOffer(nudge.id), let user = state().user, nudge.id.contains(fragment(user: user)) {
                    offerOpened(user, center?.now() ?? Date())
                }
                _ = session.present(route(for: nudge.id))
            }))
    }

    /// The offer opens the consent; a receipt opens what is kept.
    static func route(for id: String) -> NucleoRoute { isOffer(id) ? .memoryConsent : .memory }
    static func isOffer(_ id: String) -> Bool { id.hasPrefix(offerIdPrefix) }

    static func liveState(defaults: UserDefaults = .standard) -> State {
        liveState(user: AccountSession.shared.session?.userId, defaults: defaults)
    }

    /// What this phone stored for one account. Capture counts only under a yes to the consent as it
    /// reads today, exactly as `MemoryCenter.allowsNativeCapture` gates the header.
    static func liveState(user: String?, defaults: UserDefaults = .standard, version: Int = MemoryConsent.currentVersion,
                          erased: ((Date, String) -> Bool)? = nil) -> State {
        guard let user else { return State(user: nil, captureOn: false, decided: false, version: version) }
        let consent = MemoryConsent(defaults: defaults, version: version)
        let opened = MemoryOfferLog(defaults: defaults, version: version).entry(user: user)
        return State(user: user,
                     captureOn: MemoryCenter.storedNativeOptIn(user: user, defaults: defaults) && consent.hasAccepted(user: user),
                     decided: consent.hasDecided(user: user),
                     offerOpens: opened?.opens ?? 0, offerOpenedAt: opened?.at, version: version,
                     erased: erased ?? { MemoryCenter.shared.erased(since: $0, symbol: $1) })
    }

    static func candidate(_ moment: NudgeMoment, state: State) -> NucleoNudge? {
        guard moment.signedIn, let user = state.user, let read = moment.lastRead else { return nil }
        // A receipt is the server's facts: it said "recorded" and counted at least this question.
        if let receipt = read.memory, receipt.recorded, receipt.asks >= 1, !state.erased(read.at, read.symbol),
           let id = receiptId(read.symbol, user: user), let text = MemoryReceiptLine.text(symbol: read.symbol, receipt: receipt) {
            return NucleoNudge(id: id, text: text, cta: L.t("See memory", "Ver memoria"))
        }
        guard !state.captureOn, !state.decided,
              let id = offerId(user: user, version: state.version, opens: state.offerOpens, openedAt: state.offerOpenedAt, now: moment.now)
        else { return nil }
        return NucleoNudge(id: id, text: L.t("I can pick this up next time", "Puedo retomar esto la próxima vez"),
                           cta: L.t("How it works", "Cómo funciona"))
    }

    /// Eight hex characters of the account's SHA-256: enough to keep accounts on one phone apart,
    /// lowercase as the bridge pattern requires, and never the id itself.
    static func fragment(user: String) -> String { String(MemoryConsent.digest(user: user).prefix(8)) }

    /// `memory.offer.v<version>.<account>` the first time; `….2` for the one return after a rest
    /// when the person opened the first and closed it without answering; nil after that.
    static func offerId(user: String, version: Int = MemoryConsent.currentVersion, opens: Int = 0, openedAt: Date? = nil, now: Date) -> String? {
        let base = "\(offerIdPrefix)v\(version).\(fragment(user: user))"
        guard opens > 0 else { return base }
        guard opens < offerRounds, let openedAt, now.timeIntervalSince(openedAt) >= reofferAfter else { return nil }
        return "\(base).\(opens + 1)"
    }

    /// `memory.kept.<account>.<symbol>`: each asset has its own receipt for each account, so each speaks at most a few times.
    static func receiptId(_ symbol: String, user: String) -> String? {
        let head = "\(receiptIdPrefix)\(fragment(user: user))."
        let slug = String(symbol.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(48 - head.count))
        guard !slug.isEmpty else { return nil }
        return head + slug
    }
}

/// When an account opened the offer ("How it works") and how often, per consent version. A count
/// and a date under the hash of the user id, on this phone only: it lets an offer that was closed
/// without an answer come back once instead of never, and stops it from coming back twice.
struct MemoryOfferLog {
    static let keyPrefix = "v18.memoryOffer."

    struct Entry: Codable, Equatable {
        var opens: Int
        var at: Date
    }

    let defaults: UserDefaults
    let version: Int

    init(defaults: UserDefaults = .standard, version: Int = MemoryConsent.currentVersion) {
        self.defaults = defaults
        self.version = version
    }

    static func key(user: String, version: Int) -> String { "\(keyPrefix)v\(version)." + MemoryConsent.digest(user: user) }

    func entry(user: String) -> Entry? {
        guard let data = defaults.data(forKey: Self.key(user: user, version: version)) else { return nil }
        return try? JSONDecoder().decode(Entry.self, from: data)
    }

    func noteOpened(user: String, at date: Date = Date()) {
        let entry = Entry(opens: (entry(user: user)?.opens ?? 0) + 1, at: date)
        if let data = try? JSONEncoder().encode(entry) { defaults.set(data, forKey: Self.key(user: user, version: version)) }
    }

    func clear(user: String) { defaults.removeObject(forKey: Self.key(user: user, version: version)) }
}

/// The receipt's one line, written from the server's facts only: a count, days, a percentage.
/// Every language has to fit the glass (`NucleoNudge.textLimit`), so the line is chosen from the
/// fullest form that fits down to the shortest; it is never cut mid-sentence.
enum MemoryReceiptLine {
    /// Nil when the server sent no count: the app never writes "first time" over a number it does not have.
    static func text(symbol: String, receipt: MemoryReceipt) -> String? {
        guard receipt.asks >= 1 else { return nil }
        return candidates(symbol: symbol, receipt: receipt).first { $0.count <= NucleoNudge.textLimit }
            ?? L.t("Saved in memory", "Guardado en memoria")
    }

    /// Fullest first. The price's move outranks the verb: where "asked … · up …" is too long for a
    /// language, "… ago · up …" is tried before the move is given up.
    static func candidates(symbol: String, receipt: MemoryReceipt) -> [String] {
        guard receipt.asks >= 1 else { return [] }
        let short = L.t("\(symbol): saved in memory", "\(symbol): guardado en memoria")
        // The first question about this asset (the server counted exactly one): nothing to compare with yet.
        if receipt.asks == 1 {
            return [L.t("Saved: \(symbol) is now in memory", "Guardado: \(symbol) ya está en memoria"), short]
        }
        var lines: [String] = []
        if let days = receipt.lastAskedDaysAgo {
            let when = when(days)
            if let change = change(receipt.changeSinceLastAskPct) {
                lines.append(framed(symbol, "\(when.asked) · \(change)"))
                lines.append(framed(symbol, "\(when.ago) · \(change)"))
            }
            lines.append(framed(symbol, when.asked))
            lines.append(framed(symbol, when.ago))
        }
        lines.append(L.t("\(symbol): asked \(receipt.asks)× so far", "\(symbol): \(receipt.asks) consultas hasta hoy"))
        lines.append(short)
        return lines
    }

    private static func framed(_ symbol: String, _ detail: String) -> String {
        L.t("\(symbol): \(detail)", "\(symbol): \(detail)")
    }

    /// When the previous question was, with its verb ("asked 5 days ago") and without ("5 days ago").
    /// The server counts whole 24-hour periods since the previous question, not calendar days.
    static func when(_ days: Int) -> (asked: String, ago: String) {
        switch days {
        case ..<1: return (L.t("asked less than a day ago", "preguntaste hace menos de un día"),
                           L.t("less than a day ago", "hace menos de un día"))
        case 1: return (L.t("asked 1 day ago", "preguntaste hace 1 día"), L.t("1 day ago", "hace 1 día"))
        default: return (L.t("asked \(days) days ago", "preguntaste hace \(days) días"), L.t("\(days) days ago", "hace \(days) días"))
        }
    }

    /// The price's move since the previous question; nil when the server sent none.
    static func change(_ pct: Double?) -> String? {
        guard let pct, pct.isFinite else { return nil }
        let amount = percent(abs(pct))
        if abs(pct) < 0.05 { return L.t("flat since", "sin cambio") }
        return pct > 0 ? L.t("up \(amount)% since", "subió \(amount)%") : L.t("down \(amount)% since", "bajó \(amount)%")
    }

    /// One decimal at most, with the app language's decimal mark ("4.2", "4,2", "12").
    static func percent(_ value: Double) -> String {
        let formatter = NumberFormatter()
        formatter.locale = L.locale
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        return formatter.string(from: NSNumber(value: value)) ?? String(format: "%.1f", value)
    }
}
