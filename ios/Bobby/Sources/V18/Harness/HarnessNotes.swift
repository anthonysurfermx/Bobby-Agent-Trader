// The harness (1.8): what the phone keeps for follow-ups, said in sentences. The Memory screen
// shows exactly this ("On this iPhone"), so nothing the planner reads about a person is hidden
// from them, and each asset's notes can be erased there.
// Invariants:
//  - One computation. The sentences come from the ledger the planner plans from and from the same
//    `HarnessProfile.make` it calls: the screen cannot describe a profile the planner does not use.
//  - Nothing is left out by accident. Every kind of event the ledger can hold, every field an
//    event carries and every field of the profile goes through an exhaustive `switch` below: a new
//    one does not compile until it has a sentence or is marked internal with the reason.
//  - A question the person asked is counted apart from a read whose question Bobby wrote: the
//    planner follows up the first and never the second, and the screen says which is which.
//  - What the glass keeps about the lines it drew ("NVDA +2.3% since you asked": how often, whether
//    it was tapped) is said here too and goes with "Erase notes"; it lasts as long as the ledger.
//  - Facts and what Bobby does, never what the person "is": "Asked 3 times, last on Oct 5.",
//    "Follow-ups arrive around 7:00 PM.". What the person said is said as theirs ("You saved a
//    read, to review in a week."). No sentence promises anything about a verdict.
//  - The header states a construction fact: these notes are not sent to the AI. What is read from
//    the ledger and leaves the phone is an asset's symbol, in two ways only: inside a question the
//    person sees and sends by their own tap (HarnessCopy.changedQuestion, lookQuestion), and, with
//    no tap, in the request for that asset's price that draws the number on the glass and on the
//    week's board (HarnessCenter.quote, HarnessBoardSheet.market: the quote endpoint, no account,
//    no device, nothing else of the ledger). HarnessSurfaceTests pins both.
import Foundation

extension HarnessProfile {
    /// The profile's stored fields, one case each.
    enum Field: CaseIterable {
        case interest, hour, sent, answered, ignored
    }

    /// The compiler's hook. This call names every stored field of the profile: a field added there
    /// stops it compiling, and whoever repairs it gives the field its case above, which in turn
    /// stops `HarnessNotes.make` compiling until the field has a sentence or is marked internal.
    func fieldByField() -> HarnessProfile {
        HarnessProfile(interest: interest, hour: hour, sent: sent, answered: answered, ignored: ignored)
    }
}

extension HarnessEvent {
    /// The stored fields of an event, one case each (HarnessSurfaceTests checks the list against
    /// the struct itself, so a field added there fails until it has its case here).
    enum Field: String, CaseIterable {
        case kind, at, symbol, name, isEquity, price, step, sector, ref, origin, thread, horizon, horizonHours, readId, availableFrom
    }
}

struct HarnessNotes: Equatable {
    /// Whether something an event carries is said on the Memory screen, or why it is not.
    enum Told: Equatable {
        /// The sentence (or the place) that says it.
        case said(String)
        /// Internal, with the reason.
        case kept(String)
    }

    /// Every field of an event, decided. Exhaustive: a new field does not compile until someone
    /// has said where the person reads it, or why they do not.
    static func told(_ field: HarnessEvent.Field) -> Told {
        switch field {
        case .kind: return .said("each kind has its sentence or its count (the switch in `make`)")
        case .at: return .said("the day of their last question, and the days Bobby comes back")
        case .symbol: return .said("the title of the asset's row")
        case .origin: return .said("“N reads from questions Bobby wrote.”, apart from “Asked N times”")
        case .horizon: return .said("“Your question was about …” and “Your thesis looks … ahead.”")
        case .horizonHours: return .said("“You saved a read, to review in …”")
        case .step: return .said("“Follow-ups: N shown, N tapped, N answered.” counts every kind together")
        case .name: return .kept("the asset's display name: it says nothing the symbol in the row's title does not")
        case .isEquity: return .kept("stock or crypto: it only chooses which bound the number on the glass is held to")
        case .price: return .kept("the price at the question, kept to say how far the asset moved since; the move is shown on the glass, the price nowhere")
        case .sector: return .kept("which sector a sector follow-up was about; no chain that ships sends one")
        case .ref: return .kept("which follow-up a tap or an answer belongs to, so neither is counted twice")
        case .thread: return .kept("a second question of their own about the same read: it is one of “Asked N times”; the mark only makes that asset weigh more when the week picks the one it names")
        case .readId: return .kept("an opaque link to the dated answer in the saved-read ledger; it contains no words of that answer")
        case .availableFrom: return .kept("the next local day chosen on an explicit save, returned in the save confirmation; it schedules no notification")
        }
    }

    /// What is kept about one asset.
    struct Asset: Equatable, Identifiable {
        let symbol: String
        /// What happened, then what the person said, then what Bobby will do.
        var lines: [String]
        /// False when all that is kept is the pointer to a thesis: the thesis is what the person
        /// erases (My theses), and its pointer goes with it.
        var erasable: Bool
        var id: String { symbol }

        /// One paragraph for the row and for VoiceOver.
        var text: String { lines.joined(separator: " ") }
    }

    /// Most recently asked about first.
    var assets: [Asset] = []
    /// What Bobby does with the notes, and what is kept about no asset in particular.
    var general: [String] = []
    var mode: HarnessMode = .undecided

    var isEmpty: Bool { assets.isEmpty && general.isEmpty }

    /// At most 20 words in every language, and a fact about how the app is built, not a promise.
    static var header: String {
        L.t("Notes Bobby keeps on this iPhone to choose when to come back. They are not sent to the AI.",
            "Notas que Bobby guarda en este iPhone para elegir cuándo volver. No se envían a la IA.")
    }

    /// The whole section when nothing is kept: one quiet line.
    var quietLine: String {
        mode == .off ? L.t("Follow-ups are off.", "El seguimiento está apagado.") : L.t("No follow-up notes.", "Sin notas de seguimiento.")
    }

    static var eraseAll: String { L.t("Erase notes", "Borrar notas") }
    static var eraseOne: String { L.t("Erase", "Borrar") }
    static func eraseLabel(symbol: String) -> String {
        L.t("Erase the notes about \(symbol)", "Borrar las notas de \(symbol)")
    }

    /// What one asset's notes hold while they are being read from the ledger.
    private struct Kept {
        /// Questions they asked in their own words, and the last of them.
        var asks = 0
        var lastAsked: Date?
        /// Reads whose question Bobby wrote (a follow-up's button, a board row, a chip).
        var started = 0
        /// The last read of either kind: the order of the rows.
        var lastRead: Date?
        var named: HarnessHorizon?
        var saved = false
        var savedHours: Int?
        var thesis = false
        var thesisHorizon: HarnessHorizon?
        /// Something other than a thesis pointer is kept.
        var own = false
    }

    /// `lines`: how many lines the glass still has a history for (HarnessCenter.linesKept).
    static func make(ledger whole: HarnessLedger, mode: HarnessMode, upcoming: [HarnessFollowUp], now: Date, calendar: Calendar,
                     lines drawn: Int = 0, options: HarnessPlanner.Options = HarnessPlanner.Options()) -> HarnessNotes {
        let ledger = whole.upTo(now)
        var kept: [String: Kept] = [:]
        var shown = 0, tapped = 0, answered = 0
        for event in ledger.events {
            func asset(_ change: (inout Kept) -> Void) {
                guard let symbol = event.symbol else { return }
                change(&kept[symbol, default: Kept()])
            }
            switch event.kind {
            case .ask:
                asset {
                    if event.isQuestion {
                        // What the planner follows up: the count, the day and the horizon are of these only.
                        $0.asks += 1
                        $0.lastAsked = event.at
                        // `unspecified` is the absence of a horizon: there is nothing to say about it.
                        if let horizon = event.horizon, horizon != .unspecified { $0.named = horizon }
                    } else {
                        $0.started += 1
                    }
                    $0.lastRead = event.at
                    $0.own = true
                }
            case .saved:
                asset { $0.saved = true; $0.savedHours = event.horizonHours; $0.own = true }
            case .thesis:
                asset { $0.thesis = true; $0.thesisHorizon = event.horizon }
            case .picked:
                // Internal: the tap that started one of the reads counted under `ask` (the line on
                // the glass, a board row, the question Bobby wrote). It only keeps the asset listed.
                asset { $0.own = true }
            case .sent:
                shown += 1
            case .opened:
                tapped += 1
            case .returned:
                answered += 1
            case .appOpen:
                // Never kept: the ledger refuses it (HarnessLedger.note).
                break
            }
        }

        var notes = HarnessNotes(mode: mode)
        let order = kept.keys.sorted { a, b in
            let left = kept[a]?.lastRead ?? .distantPast, right = kept[b]?.lastRead ?? .distantPast
            return left == right ? a < b : left > right
        }
        for symbol in order {
            guard let asset = kept[symbol] else { continue }
            var lines: [String] = []
            if let last = asset.lastAsked {
                let day = HarnessCopy.day(last, calendar: calendar)
                lines.append(asset.asks <= 1 ? L.t("Asked once, on \(day).", "Preguntaste una vez, el \(day).")
                             : L.t("Asked \(asset.asks) times, last on \(day).", "Preguntaste \(asset.asks) veces, la última el \(day)."))
            }
            if asset.started == 1 {
                lines.append(L.t("One read from a question Bobby wrote.", "Una lectura desde una pregunta que escribió Bobby."))
            } else if asset.started > 1 {
                lines.append(L.t("\(asset.started) reads from questions Bobby wrote.", "\(asset.started) lecturas desde preguntas que escribió Bobby."))
            }
            if let named = asset.named { lines.append(sentence(named: named)) }
            if asset.saved { lines.append(sentence(savedHours: asset.savedHours)) }
            if asset.thesis { lines.append(sentence(thesis: asset.thesisHorizon)) }
            if let next = upcoming.first(where: { $0.step != .week && $0.symbol == symbol && $0.fireAt > now }) {
                let day = HarnessCopy.day(next.fireAt, calendar: calendar)
                lines.append(L.t("Bobby comes back on \(day).", "Bobby vuelve el \(day)."))
            }
            notes.assets.append(Asset(symbol: symbol, lines: lines, erasable: asset.own))
        }

        if let week = upcoming.first(where: { $0.step == .week && $0.fireAt > now }) {
            let day = HarnessCopy.day(week.fireAt, calendar: calendar)
            notes.general.append(L.t("Your week arrives on \(day).", "Tu semana llega el \(day)."))
        }
        let profile = HarnessProfile.make(ledger, now: now, calendar: calendar)
        for field in HarnessProfile.Field.allCases {
            switch field {
            case .interest:
                // Internal: one weight per asset, computed from the events said above and from nothing
                // else. It chooses which asset the week names, and that asset is listed.
                break
            case .hour:
                // Only once the planner really uses it (three answers), and as the planner uses it.
                guard mode == .on, let learned = profile.hour else { break }
                let hour = HarnessCopy.hour(min(max(learned, options.earliestHour), options.latestHour), calendar: calendar)
                notes.general.append(L.t("Follow-ups arrive around \(hour).", "El seguimiento llega hacia las \(hour)."))
            case .sent, .answered:
                // Internal: thirty-day counts of the follow-ups shown and answered. The same events
                // are said in full, over everything the ledger holds, in the count below.
                break
            case .ignored:
                guard mode == .on else { break }
                let streak = ledger.unansweredStreak(before: now)
                if streak.count >= options.quietAfter, let last = streak.last, now.timeIntervalSince(last) < options.quietDays * 86_400 {
                    let day = HarnessCopy.day(last.addingTimeInterval(options.quietDays * 86_400), calendar: calendar)
                    notes.general.append(L.t("Quiet until \(day).", "En silencio hasta el \(day)."))
                } else if HarnessStep.allCases.contains(where: { options.chain.contains($0) && profile.rests($0) }) {
                    notes.general.append(L.t("Fewer follow-ups for now.", "Menos seguimiento por ahora."))
                }
            }
        }
        if shown + tapped + answered > 0 {
            notes.general.append(L.t("Follow-ups: \(shown) shown, \(tapped) tapped, \(answered) answered.",
                                     "Seguimientos: \(shown) mostrados, \(tapped) tocados, \(answered) respondidos."))
        }
        // Not in the ledger: the glass's own count of the lines it drew, one per asset and question.
        if drawn > 0 {
            notes.general.append(L.t("“Since you asked” lines shown: \(drawn).", "Líneas “desde que preguntaste” mostradas: \(drawn)."))
        }
        return notes
    }

    // MARK: What the person said

    /// The horizon the words of their question named (the desk reads it with fixed rules, no model).
    private static func sentence(named horizon: HarnessHorizon) -> String {
        switch horizon {
        case .intraday: return L.t("Your question was about today.", "Tu pregunta era sobre hoy.")
        case .week: return L.t("Your question was about this week.", "Tu pregunta era sobre esta semana.")
        case .month: return L.t("Your question was about this month.", "Tu pregunta era sobre este mes.")
        case .long: return L.t("Your question was about months or years.", "Tu pregunta era sobre meses o años.")
        case .unspecified: return ""
        }
    }

    /// The review they chose when they saved a read (24, 72 or 168 hours), when they were offered one.
    private static func sentence(savedHours hours: Int?) -> String {
        switch hours {
        case 24: return L.t("You saved a read, to review in a day.", "Guardaste una lectura, para revisar en un día.")
        case 72: return L.t("You saved a read, to review in 3 days.", "Guardaste una lectura, para revisar en 3 días.")
        case 168: return L.t("You saved a read, to review in a week.", "Guardaste una lectura, para revisar en una semana.")
        default: return L.t("You saved a read.", "Guardaste una lectura.")
        }
    }

    /// A thesis they wrote and keep active, with the horizon they set on it (weeks, or longer).
    private static func sentence(thesis horizon: HarnessHorizon?) -> String {
        switch horizon {
        case .month: return L.t("Your thesis looks weeks ahead.", "Tu tesis mira a semanas.")
        case .long: return L.t("Your thesis looks months or more ahead.", "Tu tesis mira a meses o más.")
        default: return L.t("You wrote a thesis about it.", "Escribiste una tesis sobre este activo.")
        }
    }
}
