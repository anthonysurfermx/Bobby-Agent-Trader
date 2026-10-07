// DEBUG-only review fixtures for the 1.8 screens: `-qa-v18 <name>` shows one screen with recorded
// state, no network and no account, for design review and UI suites. Each feature lists its own
// fixtures in its own file; nothing here exists in a Release build (App Review 2.3.1).
#if DEBUG
import SwiftUI

@MainActor
enum V18QA {
    /// name → screen. Names are `<feature>-<state>`, for example `credits-free` or `theses-three`.
    static var fixtures: [String: () -> AnyView] {
        var all: [String: () -> AnyView] = [:]
        for table in [CreditsQA.fixtures, MemoryQA.fixtures, ThesesQA.fixtures, RemindersQA.fixtures, InviteQA.fixtures] {
            all.merge(table) { first, _ in first }
        }
        return all
    }

    /// `-nucleo-fixtures -qa-v18-nudge <name>`: the glass with one fixed nudge, for design review
    /// (fixture mode shows none otherwise). The tap opens the screen that nudge leads to.
    static var glassNudges: [String: (nudge: NucleoNudge, route: NucleoRoute)] {
        // Sample lines in the two authored languages only (not catalog strings: this never ships).
        func q(_ en: String, _ es: String) -> String { L.isSpanish ? es : en }
        return [
            "theses": (NucleoNudge(id: "qa.theses", text: q("Why are you looking at NVDA?", "¿Por qué estás mirando NVDA?"),
                                   cta: q("Write my thesis", "Escribir mi tesis")), .thesisEditor),
            "memory": (NucleoNudge(id: "qa.memory", text: q("Want me to remember what you ask?", "¿Quieres que recuerde lo que preguntas?"),
                                   cta: q("How it works", "Cómo funciona")), .memoryConsent),
            "credits": (NucleoNudge(id: "qa.credits", text: q("Bobby gave you 5 reads", "Bobby te regaló 5 lecturas"),
                                    cta: q("See credits", "Ver créditos")), .credits),
            "reminders": (NucleoNudge(id: "qa.reminders", text: q("Want a reminder to review it?", "¿Quieres un recordatorio para revisarla?"),
                                      cta: q("Remind me", "Recuérdamelo")), .reminders),
        ]
    }

    /// Replaces the registered sources with the one fixed nudge and lets the fixture session show it.
    static func installGlassNudge(named name: String, session: NucleoSession) {
        guard let sample = glassNudges[name] else { return }
        let center = NudgeCenter.shared
        center.unregisterAll()
        center.reset()
        center.register(NudgeSource(key: "qa", priority: 100, candidate: { _ in sample.nudge },
                                    act: { _, session in _ = session.present(sample.route) }))
        session.nudgesEnabled = true
    }

    static func view(named name: String) -> AnyView {
        fixtures[name]?() ?? AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Unknown 1.8 fixture: \(name)").foregroundStyle(Theme.cream)
                    ForEach(fixtures.keys.sorted(), id: \.self) { Text($0).font(.mono(12)).foregroundStyle(Theme.warmMuted) }
                }
                .padding(24)
            }
            .background(Theme.bg))
    }
}
#endif
