// The harness (1.8): the words. A follow-up is a moment in time, never a claim about the market:
// the lock screen says where it came from ("back to your question") and nothing else, and the
// number is read when the person opens it. Nothing here says Bobby watched, noticed or found
// anything, and nothing tells the person to do something.
import Foundation

enum HarnessCopy {
    static let notificationTitle = "Bobby"

    // MARK: The lock screen (written in the app's language when the follow-up is planned)

    /// Provenance only: the asset and "back to your question". No figure, no direction, no day
    /// count, no instruction. The week says what it holds and no number either.
    static func body(_ followUp: HarnessFollowUp) -> String {
        let symbol = followUp.symbol ?? ""
        switch followUp.step {
        case .asset:
            return L.t("\(symbol): back to your question.", "\(symbol): de vuelta a tu pregunta.")
        case .sector:
            let sector = followUp.sector.map(HarnessSectors.title) ?? ""
            return L.t("\(sector) today. \(symbol) is part of it.", "\(sector) hoy. \(symbol) es parte.")
        case .week:
            let others = followUp.others
            if others <= 0 { return L.t("Your week with \(symbol).", "Tu semana con \(symbol).") }
            return L.t("Your week: \(symbol) and \(others) more.", "Tu semana: \(symbol) y \(others) más.")
        }
    }

    /// What a phone that hides previews while locked (the default with Face ID) shows in place of
    /// the body: the same sentence without the asset. The ticker is never on a locked screen there.
    static func hiddenBody(_ step: HarnessStep) -> String {
        switch step {
        case .asset, .sector: return L.t("Back to your question.", "De vuelta a tu pregunta.")
        case .week: return L.t("Your week.", "Tu semana.")
        }
    }

    /// The notification's one action: follow-ups off, without opening the app.
    static var stopAction: String { L.t("Stop", "Ya no") }

    // MARK: The glass (46 characters for the line, 22 for the button, in every language)

    /// The offer after a read. It says what the person is agreeing to: Bobby coming back to this
    /// asset over the next days, not one message. Names the asset when the line still fits.
    static func offerLine(symbol: String) -> String {
        let named = L.t("Shall I keep you posted on \(symbol)?", "¿Te voy contando cómo sigue \(symbol)?")
        return named.count <= NucleoNudge.textLimit ? named : L.t("Shall I keep you posted on this?", "¿Te voy contando cómo sigue?")
    }

    static var offerButton: String { L.t("Yes, tell me", "Sí, cuéntame") }

    /// The move since they asked, with the number when the phone may say one: `pct` comes from
    /// `move(from:to:isEquity:)` and from nowhere else. The line is drawn like every other line of
    /// the glass (the page's eyebrow: one size, one ink): the same up and down, no colour, no arrow.
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

    /// The button of the same line when the next read would be refused: the person keeps the line,
    /// which costs nothing, and Bobby asks nothing of them.
    static var moveSeen: String { L.t("Got it", "Entendido") }

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
    static var boardContext: String { L.t("These assets appeared in your reads.", "Estos activos aparecieron en tus lecturas.") }
    static var boardEmptyNext: String { L.t("Ask about an asset to find it here.", "Pregunta por un activo para retomarlo aquí.") }
    static var boardNewRead: String { L.t("New analysis · Quick read", "Análisis nuevo · Lectura rápida") }
    static var boardCheckReads: String { L.t("Check your available reads before a new analysis.", "Comprueba tus lecturas disponibles antes de un análisis nuevo.") }
    static func resumeButton(symbol: String) -> String { L.t("Revisit \(symbol)", "Retomar \(symbol)") }
    static func rowSpoken(symbol: String, name: String, change: String?) -> String {
        guard let change else { return "\(symbol), \(name)" }
        return "\(symbol), \(name), \(change)"
    }

    // MARK: The switch (Reminders)

    static var switchLabel: String { L.t("Follow-ups", "Seguimiento") }
    static var switchDetail: String { L.t("Bobby comes back to what you asked.", "Bobby vuelve a lo que preguntaste.") }

    // MARK: Numbers

    /// How far the price may be from the one at the question for the phone to say a number.
    ///
    /// The line stays on the glass for up to `HarnessCenter.dueDays` (two weeks) after the
    /// question, so each bound is for a fortnight, not for a day, and holds at every age.
    ///  - A stock: more than 0.7 and less than 1.4 times the price at the question (-30% to +40%).
    ///    The band is built so a split can never pass for a move: its top is twice its bottom, so
    ///    a 2-for-1 split, or any larger one, forward or reverse, on top of ANY move the band
    ///    itself would print lands outside it. 100 → 62 is 2-for-1 and +24%: 0.62, no number (a
    ///    wider band printed "-38%"). A split that slipped through would need the stock to have
    ///    moved by more than the phone ever prints.
    ///    It is not narrowed for the first days: an earnings day (a quarter either way) is as large
    ///    as an ordinary fortnight, a narrower band would only take the number away on the days it
    ///    is wanted, and what keeps splits out is the shape of the band, at every age.
    ///    What stays possible: a 3-for-2 split (0.67) with a rise of 5% or more on top reads as a
    ///    fall of up to 30%. By size alone it cannot be told from one, and the phone has no list
    ///    of corporate actions to ask; a split-adjusted reference from the quote endpoint would
    ///    close it.
    ///  - Crypto has no splits. What goes wrong there is a ticker that now names another coin, a
    ///    redenomination (1 for 1,000) or a bad tick: 0.2 to 5 times (-80% to +400%) lets a small
    ///    coin's wildest ordinary week through and stops those.
    /// Outside the bound the phone says no number, never a corrected one.
    static let stockMove: ClosedRange<Double> = 0.7...1.4
    static let cryptoMove: ClosedRange<Double> = 0.2...5

    /// The move between the price at the question and the price now, in percent. Nil when the
    /// phone has no business saying a number: a price is missing, zero, negative or not a number,
    /// or the move is outside what this kind of asset does (`stockMove`, `cryptoMove`).
    static func move(from then: Double?, to now: Double?, isEquity: Bool) -> Double? {
        guard let then, let now, then.isFinite, now.isFinite, then > 0, now > 0 else { return nil }
        let ratio = now / then
        let bound = isEquity ? stockMove : cryptoMove
        guard ratio.isFinite, ratio > bound.lowerBound, ratio < bound.upperBound else { return nil }
        return (ratio - 1) * 100
    }

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

    // MARK: Dates (the Memory screen's sentences)

    /// "Oct 5" / "5 oct", in the app's locale and the phone's own calendar day.
    static func day(_ date: Date, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = L.locale
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("MMMd")
        return formatter.string(from: date)
    }

    /// "7:00 PM" / "19:00", in the app's locale.
    static func hour(_ hour: Int, calendar: Calendar) -> String {
        let formatter = DateFormatter()
        formatter.locale = L.locale
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("jm")
        let moment = calendar.date(bySettingHour: min(max(hour, 0), 23), minute: 0, second: 0, of: Date(timeIntervalSince1970: 1_800_000_000)) ?? Date()
        return formatter.string(from: moment)
    }
}
