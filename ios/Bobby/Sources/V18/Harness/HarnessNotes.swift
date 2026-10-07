// The harness (1.8): what the phone keeps for follow-ups, said in sentences. The Memory screen
// shows exactly this ("On this iPhone"), so nothing the planner reads about a person is hidden
// from them, and each asset's notes can be erased there.
// Invariants:
//  - One computation. The sentences come from the ledger the planner plans from and from the same
//    `HarnessProfile.make` it calls: the screen cannot describe a profile the planner does not use.
//  - Nothing is left out by accident. Every kind of event the ledger can hold and every field of
//    the profile goes through an exhaustive `switch` below: a new one does not compile until it
//    has a sentence or is marked internal with the reason.
//  - Facts and what Bobby does, never what the person "is": "Asked 3 times, last on Oct 5.",
//    "Follow-ups arrive around 7:00 PM.". What the person said is said as theirs ("You saved a
//    read, to review in a week."). No sentence promises anything about a verdict.
//  - The header states a construction fact: these notes are not sent to the AI. The only things
//    read from the ledger that ever leave the phone are an asset's symbol and kind inside a
//    question the person sees and sends by their own tap (HarnessCopy.changedQuestion,
//    lookQuestion); HarnessNotesTests pins it.
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

struct HarnessNotes: Equatable {
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
        var asks = 0
        var lastAsked: Date?
        var named: HarnessHorizon?
        var saved = false
        var savedHours: Int?
        var thesis = false
        var thesisHorizon: HarnessHorizon?
        /// Something other than a thesis pointer is kept.
        var own = false
    }

    static func make(ledger whole: HarnessLedger, mode: HarnessMode, upcoming: [HarnessFollowUp], now: Date, calendar: Calendar,
                     options: HarnessPlanner.Options = HarnessPlanner.Options()) -> HarnessNotes {
        let ledger = whole.upTo(now)
        var kept: [String: Kept] = [:]
        var shown = 0, tapped = 0, answered = 0, opens = 0
        for event in ledger.events {
            func asset(_ change: (inout Kept) -> Void) {
                guard let symbol = event.symbol else { return }
                change(&kept[symbol, default: Kept()])
            }
            switch event.kind {
            case .ask:
                asset {
                    $0.asks += 1
                    $0.lastAsked = event.at
                    // `unspecified` is the absence of a horizon: there is nothing to say about it.
                    if let horizon = event.horizon, horizon != .unspecified { $0.named = horizon }
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
                opens += 1
            }
        }

        var notes = HarnessNotes(mode: mode)
        let order = kept.keys.sorted { a, b in
            let left = kept[a]?.lastAsked ?? .distantPast, right = kept[b]?.lastAsked ?? .distantPast
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
        if opens > 0 {
            notes.general.append(L.t("Times you opened the app: \(opens).", "Veces que abriste la app: \(opens)."))
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
