// Theses (1.8): the words and the numbers every thesis screen shares. Words are the app's
// (Wait / Review, never an instruction); numbers are computed here, never by a model, and a value
// the app does not have is left out instead of shown as zero.
import Foundation

/// The two notifications the reminders track listens to. Posted on the main thread.
enum ThesisEvents {
    /// A NEW thesis was saved. `userInfo[idKey]` is its id.
    static let saved = Notification.Name("V18.thesisSaved")
    /// The person decided what to do with a thesis after a review. `userInfo[idKey]` is its id.
    static let reviewed = Notification.Name("V18.thesisReviewed")
    static let idKey = "thesisId"
    /// `keep` | `edit` | `archive`, on `reviewed` only.
    static let decisionKey = "decision"

    @MainActor
    static func post(_ name: Notification.Name, thesisId: String, decision: String? = nil) {
        var info: [String: Any] = [idKey: thesisId]
        if let decision { info[decisionKey] = decision }
        NotificationCenter.default.post(name: name, object: nil, userInfo: info)
    }
}

/// Where the thesis started and where the evidence stands now. The change is arithmetic on two
/// prices the app holds; when either is missing there is no change to show.
struct ThesisThenNow: Equatable {
    let thenPrice: Double?
    let thenDate: Date?
    let nowPrice: Double?
    /// ISO-8601, the date the evidence itself carries.
    let asOf: String?

    init(thenPrice: Double?, thenDate: Date?, nowPrice: Double?, asOf: String?) {
        self.thenPrice = Self.usable(thenPrice)
        self.thenDate = self.thenPrice == nil ? nil : thenDate
        self.nowPrice = Self.usable(nowPrice)
        self.asOf = asOf.flatMap { $0.isEmpty ? nil : $0 }
    }

    /// "Then" is the price the thesis was written at and nothing else: a thesis written from a read
    /// without a price has no "then", and a later review's price is never borrowed as its origin.
    init(thesis: SavedThesis, nowPrice: Double?, asOf: String?) {
        let start = ThesisCopy.startingPoint(thesis)
        self.init(thenPrice: start?.price, thenDate: start?.at, nowPrice: nowPrice, asOf: asOf)
    }

    /// Percent, positive when the price is higher now. Nil unless both prices are real.
    var changePct: Double? {
        guard let then = thenPrice, let now = nowPrice else { return nil }
        let pct = (now - then) / then * 100
        return pct.isFinite ? pct : nil
    }

    var asOfDate: Date? { asOf.flatMap(BobbyAccessAPI.date) }
    var isEmpty: Bool { thenPrice == nil && nowPrice == nil }
    /// No price was kept when the thesis was written: the screen says so instead of showing a change.
    var missingStart: Bool { thenPrice == nil }

    private static func usable(_ price: Double?) -> Double? {
        guard let price, price.isFinite, price > 0 else { return nil }
        return price
    }
}

enum ThesisCopy {
    /// "NVDA · NVIDIA", or only the symbol when the name adds nothing.
    static func title(symbol: String, name: String) -> String {
        name.isEmpty || name.caseInsensitiveCompare(symbol) == .orderedSame ? symbol : "\(symbol) · \(name)"
    }

    static func title(_ thesis: SavedThesis) -> String { title(symbol: thesis.symbol, name: thesis.name) }

    // MARK: Verdict (the app's two words)

    static func verdictWord(_ verdict: String?) -> String? {
        switch verdict {
        case "review": return L.t("Review", "Revisa")
        case "wait": return L.t("Wait", "Espera")
        default: return nil
        }
    }

    // MARK: Horizon (the person's pick)

    static func horizon(_ horizon: ThesisHorizon) -> String {
        switch horizon {
        case .weeks: return L.t("A few weeks", "Unas semanas")
        case .months: return L.t("A few months", "Unos meses")
        case .year: return L.t("About a year", "Alrededor de un año")
        case .years: return L.t("Several years", "Varios años")
        }
    }

    // MARK: The review question

    /// The fixed sentence a review asks, in the app's language. It names no time span on purpose:
    /// the desk reads a horizon out of words such as "today" or "weeks", and the horizon of a
    /// thesis is the person's own pick, sent with the thesis.
    static func reviewQuestion(symbol: String) -> String {
        L.t("Review my thesis on \(symbol): what does the latest evidence support, what does it challenge, and what is still unknown?",
            "Revisa mi tesis sobre \(symbol): ¿qué respalda la evidencia más reciente, qué la cuestiona y qué sigue sin saberse?")
    }

    // MARK: Not checked

    /// The kinds of evidence the desk cannot read, in a fixed order.
    static let notCheckedOrder = ["news", "earnings", "filings", "fundamentals", "macro"]
    /// What a crypto asset has none of is not listed as "not checked".
    static let notCheckedCrypto = ["news", "fundamentals", "macro"]

    /// The codes to show: the server's when it sent any it knows, otherwise the whole fixed list.
    /// Never empty: the desk reads price evidence only, and the screen says so every time.
    static func notCheckedCodes(_ sent: [String]?, isEquity: Bool) -> [String] {
        let known = notCheckedOrder.filter { (sent ?? []).contains($0) }
        if !known.isEmpty { return known }
        return isEquity ? notCheckedOrder : notCheckedCrypto
    }

    static func notCheckedWord(_ code: String, isEquity: Bool) -> String? {
        switch code {
        case "news": return L.t("News", "Noticias")
        case "earnings": return L.t("Earnings reports", "Reportes de resultados")
        case "filings": return L.t("Company filings", "Documentos regulatorios de la empresa")
        case "fundamentals":
            return isEquity ? L.t("Company fundamentals", "Fundamentales de la empresa")
                            : L.t("Project fundamentals", "Fundamentales del proyecto")
        case "macro": return L.t("The wider economy", "La economía en general")
        default: return nil
        }
    }

    /// The same categories as one short word each, for the scope line on a finished review.
    static func notCheckedShort(_ code: String, isEquity: Bool) -> String? {
        switch code {
        case "news": return L.t("news", "noticias")
        case "earnings": return L.t("earnings", "resultados")
        case "filings": return L.t("filings", "documentos regulatorios")
        case "fundamentals": return isEquity ? L.t("fundamentals", "fundamentales") : L.t("project fundamentals", "fundamentales del proyecto")
        case "macro": return L.t("economy", "economía")
        default: return nil
        }
    }

    static func notCheckedWords(_ sent: [String]?, isEquity: Bool) -> [String] {
        notCheckedCodes(sent, isEquity: isEquity).compactMap { notCheckedWord($0, isEquity: isEquity) }
    }

    static func priceOnlyLine(isEquity: Bool) -> String {
        isEquity ? L.t("Bobby read price evidence only. This is not a view on the company itself.",
                       "Bobby leyó solo evidencia de precio. No es una opinión sobre la empresa en sí.")
                 : L.t("Bobby read price evidence only. This is not a view on the project itself.",
                       "Bobby leyó solo evidencia de precio. No es una opinión sobre el proyecto en sí.")
    }

    static var footer: String {
        L.t("Educational reading.", "Lectura educativa.")
    }

    // MARK: Where the words go (consent-relevant: shown without scrolling, in the same words everywhere)

    /// Above Save in the editor and under the list.
    static var localOnly: String {
        L.t("Saved on this iPhone only. When you ask for a review, your words are sent to Bobby and to the AI providers that write the review. They are not stored there.",
            "Se guarda solo en este iPhone. Cuando pides una revisión, tus palabras se envían a Bobby y a los proveedores de IA que escriben la revisión. No se guardan allí.")
    }

    /// Directly above "Review now", pinned with it.
    static var sentToProviders: String {
        L.t("Your thesis text goes to Bobby’s AI providers. Only for this review.",
            "Tu texto va a proveedores de IA de Bobby. Solo para esta revisión.")
    }

    // MARK: Where a thesis started

    /// The price and date a thesis was written at: its `.created` entry and no other. A thesis
    /// written from a read without a price has none, however many reviews followed.
    static func startingPoint(_ thesis: SavedThesis) -> (price: Double, at: Date)? {
        guard let created = thesis.revisions.first(where: { $0.kind == .created }),
              let price = created.price, price.isFinite, price > 0 else { return nil }
        return (price, created.at)
    }

    static var noStartingPrice: String {
        L.t("No starting price was saved with this thesis.", "No se guardó un precio inicial con esta tesis.")
    }

    // MARK: Numbers and dates

    /// A market price as the evidence carried it, in the app's locale. No currency: the desk does not say one.
    static func price(_ value: Double) -> String {
        let f = NumberFormatter()
        f.locale = L.locale
        f.numberStyle = .decimal
        if abs(value) >= 1 {
            f.minimumFractionDigits = 2
            f.maximumFractionDigits = 2
        } else {
            f.usesSignificantDigits = true
            f.minimumSignificantDigits = 2
            f.maximumSignificantDigits = 4
        }
        return f.string(from: NSNumber(value: value)) ?? String(value)
    }

    /// "+8.9%" / "-3.1%" / "0%", one decimal, in the app's locale.
    static func percent(_ value: Double) -> String {
        let rounded = (value * 10).rounded() / 10
        let f = NumberFormatter()
        f.locale = L.locale
        f.numberStyle = .percent
        f.multiplier = 1
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 1
        if rounded > 0 { f.positivePrefix = f.plusSign + f.positivePrefix }
        return f.string(from: NSNumber(value: rounded == 0 ? 0 : rounded)) ?? "\(rounded)%"
    }

    /// "Oct 7", with the year when it is not this year.
    static func day(_ date: Date, now: Date = Date(), timeZone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        let f = DateFormatter()
        f.locale = L.locale
        f.timeZone = timeZone
        f.setLocalizedDateFormatFromTemplate(sameYear ? "MMMd" : "MMMdy")
        return f.string(from: date)
    }

    /// "Oct 7, 2:30 PM" in the phone's time zone: the moment the evidence is dated.
    static func moment(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = L.locale
        f.timeZone = timeZone
        f.setLocalizedDateFormatFromTemplate("MMMdjmm")
        return f.string(from: date)
    }

    /// Whole days between two moments (never negative).
    static func days(from start: Date, to end: Date) -> Int {
        max(0, Int((end.timeIntervalSince(start) / 86_400).rounded(.down)))
    }

    /// "Reviewed today" / "Reviewed 5 days ago" / "Not reviewed yet".
    static func reviewedLine(_ thesis: SavedThesis, now: Date = Date()) -> String {
        guard let last = thesis.lastReviewedAt else { return L.t("Not reviewed yet", "Aún sin revisar") }
        let days = days(from: last, to: now)
        if days == 0 { return L.t("Reviewed today", "Revisada hoy") }
        let f = RelativeDateTimeFormatter()
        f.locale = L.locale
        f.unitsStyle = .full
        f.dateTimeStyle = .named
        let ago = f.localizedString(from: DateComponents(day: -days))
        return L.t("Reviewed \(ago)", "Revisada \(ago)")
    }

    /// "Since Oct 7 · started at 120.50", or only the date when the read carried no price.
    static func sinceLine(_ thesis: SavedThesis, now: Date = Date()) -> String {
        let since = day(thesis.createdAt, now: now)
        guard let start = startingPoint(thesis) else {
            return L.t("Since \(since)", "Desde el \(since)")
        }
        let price = price(start.price)
        return L.t("Since \(since) · started at \(price)", "Desde el \(since) · empezó en \(price)")
    }
}
