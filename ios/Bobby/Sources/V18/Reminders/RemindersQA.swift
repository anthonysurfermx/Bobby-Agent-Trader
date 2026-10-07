// Reminders: DEBUG review fixtures (`-qa-v18 <name>`). Fixed sample theses and dates, no stores, no
// notification centre and no network: the buttons do nothing but answer.
#if DEBUG
import SwiftUI

@MainActor
enum RemindersQA {
    static var fixtures: [String: () -> AnyView] {
        [
            // No active thesis.
            "reminders-empty": { screen(.make(theses: [], pending: [], permission: .allowed)) },
            // Three theses, one with a reminder; the first opens with its choices.
            "reminders-three": {
                screen(.make(theses: theses, pending: [PendingReminder(thesisId: ids[1], symbol: "BTC", fireAt: sampleDate)],
                             focus: ids[0], permission: .allowed))
            },
            // "Change" tapped on a thesis that has a reminder: the other days, and the way back.
            "reminders-change": {
                screen(.make(theses: Array(theses.prefix(2)), pending: [PendingReminder(thesisId: ids[0], symbol: "NVDA", fireAt: sampleDate)],
                             permission: .allowed), changing: ids[0])
            },
            // "Pick a day" open on a thesis that already has a reminder.
            "reminders-pick": {
                screen(.make(theses: Array(theses.prefix(2)), pending: [PendingReminder(thesisId: ids[0], symbol: "NVDA", fireAt: sampleDate)],
                             focus: ids[0], permission: .allowed), picking: ids[0])
            },
            // iOS notifications are off for Bobby.
            "reminders-denied": {
                screen(.make(theses: Array(theses.prefix(2)), pending: [], focus: ids[0], permission: .denied), outcome: .denied)
            },
            // An eligible paying account with the weekly briefing off.
            "reminders-briefing": {
                screen(.make(theses: Array(theses.prefix(1)), pending: [PendingReminder(thesisId: ids[0], symbol: "NVDA", fireAt: sampleDate)],
                             permission: .allowed, showsBriefingRow: true))
            },
        ]
    }

    private static let ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222",
                              "33333333-3333-4333-8333-333333333333"]

    /// Friday 16 October 2026, 18:00 on this phone's clock.
    private static var sampleDate: Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 16, hour: 18)) ?? Date(timeIntervalSince1970: 1_792_000_000)
    }

    private static var theses: [SavedThesis] {
        let written = Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 7, hour: 12)) ?? Date(timeIntervalSince1970: 1_791_300_000)
        func thesis(_ index: Int, _ symbol: String, _ name: String, equity: Bool, _ why: String) -> SavedThesis {
            SavedThesis(id: ids[index], symbol: symbol, name: name, isEquity: equity, status: .active, horizon: .months,
                        hypothesis: why, worry: "", changeMind: "", createdAt: written, updatedAt: written, lastReviewedAt: nil,
                        sourceRequestId: nil, revisions: [ThesisRevision(at: written, kind: .created)])
        }
        return [
            thesis(0, "NVDA", "NVIDIA", equity: true, "Data center demand should keep margins high through next year."),
            thesis(1, "BTC", "Bitcoin", equity: false, "I want to see how it behaves around the next rate decision."),
            thesis(2, "SPY", "S&P 500 ETF", equity: true, "A broad base while I learn to read single companies."),
        ]
    }

    private static func screen(_ model: RemindersModel, outcome: ReminderCenter.Outcome = .failed, picking: String? = nil,
                               changing: String? = nil) -> AnyView {
        AnyView(RemindersContent(model: model, actions: RemindersActions(
            preset: { _, _ in outcome }, pick: { _, _ in outcome }, remove: { _ in },
            openSettings: {}, openBriefing: {}, close: {}), startsPicking: picking, startsChanging: changing))
    }
}
#endif
