// The harness (1.8): the words. A follow-up is a moment in time, never a claim about the market:
// the lock screen says "a day later, see how it moved", and the number is read when the person
// opens it. Nothing here says Bobby watched, noticed or found anything.
import Foundation

enum HarnessCopy {
    static let notificationTitle = "Bobby"

    // MARK: The lock screen (written in the app's language when the follow-up is planned)

    static func body(_ followUp: HarnessFollowUp) -> String {
        let symbol = followUp.symbol ?? ""
        switch followUp.step {
        case .asset:
            let days = followUp.days
            if days <= 1 { return L.t("\(symbol), a day later. See how it moved.", "\(symbol), un día después. Mira cómo se movió.") }
            return L.t("\(symbol), \(days) days later. See how it moved.", "\(symbol), \(days) días después. Mira cómo se movió.")
        case .sector:
            let sector = followUp.sector.map(HarnessSectors.title) ?? ""
            return L.t("\(sector) today. \(symbol) is part of it.", "\(sector) hoy. \(symbol) es parte.")
        case .week:
            let others = followUp.others
            if others <= 0 { return L.t("Your week with \(symbol).", "Tu semana con \(symbol).") }
            return L.t("Your week: \(symbol) and \(others) more.", "Tu semana: \(symbol) y \(others) más.")
        }
    }

    // MARK: The glass (46 characters for the line, 22 for the button, in every language)

    /// The offer after a read. It says what the person is agreeing to: Bobby coming back to this
    /// asset over the next days, not one message. Names the asset when the line still fits.
    static func offerLine(symbol: String) -> String {
        let named = L.t("Shall I keep you posted on \(symbol)?", "¿Te voy contando cómo sigue \(symbol)?")
        return named.count <= NucleoNudge.textLimit ? named : L.t("Shall I keep you posted on this?", "¿Te voy contando cómo sigue?")
    }

    static var offerButton: String { L.t("Yes, tell me", "Sí, cuéntame") }

    /// The move since they asked, with the number when the phone has both prices.
    static func moveLine(symbol: String, pct: Double?, days: Int) -> String {
        let fallback = days <= 1 ? L.t("\(symbol), a day later", "\(symbol), un día después")
            : L.t("\(symbol), \(days) days later", "\(symbol), \(days) días después")
        guard let pct, pct.isFinite else { return fallback }
        let line: String
        if abs(pct) < 0.05 {
            line = L.t("\(symbol) is where you left it", "\(symbol) sigue donde lo dejaste")
        } else {
            let change = signed(pct)
            line = L.t("\(symbol) \(change) since you asked", "\(symbol) \(change) desde que preguntaste")
        }
        return line.count <= NucleoNudge.textLimit ? line : fallback
    }

    static var moveButton: String { L.t("What changed?", "¿Qué cambió?") }

    // MARK: The questions Bobby is asked on the person's tap

    static func changedQuestion(symbol: String) -> String {
        L.t("What changed in \(symbol) since I asked?", "¿Qué cambió en \(symbol) desde que pregunté?")
    }

    static func lookQuestion(symbol: String) -> String {
        L.t("How does \(symbol) look today?", "¿Cómo se ve \(symbol) hoy?")
    }

    // MARK: The board (a sector, or the week)

    static var weekTitle: String { L.t("Your week", "Tu semana") }
    static var sinceAsked: String { L.t("Since you asked", "Desde que preguntaste") }
    static var last24h: String { L.t("Last 24 hours", "Últimas 24 horas") }
    static var boardEmpty: String { L.t("Nothing to show yet.", "Nada que mostrar todavía.") }
    static var boardFoot: String { L.t("Tap one to ask Bobby.", "Toca uno para preguntarle a Bobby.") }
    static func rowSpoken(symbol: String, name: String, change: String?) -> String {
        guard let change else { return "\(symbol), \(name)" }
        return "\(symbol), \(name), \(change)"
    }

    // MARK: The switch (Reminders)

    static var switchLabel: String { L.t("Follow-ups", "Seguimiento") }
    static var switchDetail: String { L.t("Bobby comes back to what you asked.", "Bobby vuelve a lo que preguntaste.") }

    // MARK: Numbers

    /// "+2.3%" / "-1.1%", one decimal at most, in the app's locale.
    static func signed(_ pct: Double) -> String {
        let rounded = (pct * 10).rounded() / 10
        let formatter = NumberFormatter()
        formatter.locale = L.locale
        formatter.numberStyle = .percent
        formatter.multiplier = 1
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 1
        if rounded > 0 { formatter.positivePrefix = formatter.plusSign + formatter.positivePrefix }
        return formatter.string(from: NSNumber(value: rounded == 0 ? 0 : rounded)) ?? "\(rounded)%"
    }
}
