// Memory on the glass (1.8). One source, two things it may say after a read, in this order:
//   1. The receipt: the server just told the app what its memory holds about this asset
//      (`MemoryReceipt`), so Bobby says it in one line of facts and offers "See memory".
//   2. The offer: someone signed in got a read, this iPhone's questions are not in memory and the
//      account has not answered the consent yet. "How it works" opens the consent sheet.
// Nobody signed in: nothing (memory needs an account). The candidate reads stored state only.
import Foundation

@MainActor
enum MemoryNudges {
    static let key = "memory"
    static let offerId = "memory.offer.v1"
    static let receiptIdPrefix = "memory.kept."

    /// What the candidate reads besides the moment. Tests build it by hand; `liveState` reads the phone.
    struct State {
        /// The signed-in account, or nil.
        var user: String?
        /// This iPhone's questions join memory for this account.
        var captureOn: Bool
        /// The account answered the consent as it reads today (yes or no).
        var decided: Bool
        /// The person erased what a receipt for this read would name (the read's date, its symbol).
        var erased: (Date, String) -> Bool = { _, _ in false }
    }

    /// `state` is read at every candidate; tests pass their own.
    static func register(_ center: NudgeCenter, state: @escaping @MainActor () -> State = { liveState() }) {
        center.register(NudgeSource(key: key, priority: NudgePriority.memory,
            candidate: { candidate($0, state: state()) },
            act: { nudge, session in _ = session.present(route(for: nudge.id)) }))
    }

    /// The offer opens the consent; a receipt opens what is kept.
    static func route(for id: String) -> NucleoRoute { id == offerId ? .memoryConsent : .memory }

    static func liveState(defaults: UserDefaults = .standard) -> State {
        guard let user = AccountSession.shared.session?.userId else { return State(user: nil, captureOn: false, decided: false) }
        return State(user: user,
                     captureOn: MemoryCenter.storedNativeOptIn(user: user, defaults: defaults),
                     decided: MemoryConsent(defaults: defaults).hasDecided(user: user),
                     erased: { MemoryCenter.shared.erased(since: $0, symbol: $1) })
    }

    static func candidate(_ moment: NudgeMoment, state: State) -> NucleoNudge? {
        guard moment.signedIn, state.user != nil, let read = moment.lastRead else { return nil }
        if let receipt = read.memory, receipt.recorded, !state.erased(read.at, read.symbol), let id = receiptId(read.symbol) {
            return NucleoNudge(id: id, text: MemoryReceiptLine.text(symbol: read.symbol, receipt: receipt),
                               cta: L.t("See memory", "Ver memoria"))
        }
        guard !state.captureOn, !state.decided else { return nil }
        return NucleoNudge(id: offerId, text: L.t("I can pick this up next time", "Puedo retomar esto la próxima vez"),
                           cta: L.t("How it works", "Cómo funciona"))
    }

    /// `memory.kept.<symbol>`: each asset has its own receipt, so each speaks at most a few times.
    static func receiptId(_ symbol: String) -> String? {
        let slug = String(symbol.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber) }.prefix(32))
        guard !slug.isEmpty else { return nil }
        return receiptIdPrefix + slug
    }
}

/// The receipt's one line, written from the server's facts only: a count, days, a percentage.
/// Every language has to fit the glass (`NucleoNudge.textLimit`), so the line is chosen from the
/// fullest form that fits down to the shortest; it is never cut mid-sentence.
enum MemoryReceiptLine {
    static func text(symbol: String, receipt: MemoryReceipt) -> String {
        candidates(symbol: symbol, receipt: receipt).first { $0.count <= NucleoNudge.textLimit }
            ?? L.t("Saved in memory", "Guardado en memoria")
    }

    /// Fullest first.
    static func candidates(symbol: String, receipt: MemoryReceipt) -> [String] {
        let short = L.t("\(symbol): saved in memory", "\(symbol): guardado en memoria")
        // The first question about this asset: there is nothing to compare with yet.
        guard receipt.asks > 1 else {
            return [L.t("Saved: \(symbol) is now in memory", "Guardado: \(symbol) ya está en memoria"), short]
        }
        var lines: [String] = []
        if let days = receipt.lastAskedDaysAgo {
            let when = when(days)
            if let change = change(receipt.changeSinceLastAskPct) { lines.append(framed(symbol, "\(when) · \(change)")) }
            lines.append(framed(symbol, when))
        }
        lines.append(L.t("\(symbol): asked \(receipt.asks)× so far", "\(symbol): \(receipt.asks) consultas hasta hoy"))
        lines.append(short)
        return lines
    }

    private static func framed(_ symbol: String, _ detail: String) -> String {
        L.t("\(symbol): \(detail)", "\(symbol): \(detail)")
    }

    /// The server counts whole 24-hour periods since the previous question, not calendar days.
    static func when(_ days: Int) -> String {
        switch days {
        case ..<1: return L.t("asked less than a day ago", "hace menos de un día")
        case 1: return L.t("asked 1 day ago", "hace 1 día")
        default: return L.t("asked \(days) days ago", "hace \(days) días")
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
