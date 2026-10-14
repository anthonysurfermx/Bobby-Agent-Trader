// The harness: DEBUG review fixtures (`-qa-v18 <name>`). Fixed sample boards and notes, no stored
// ledger, no notification centre and no network: the rows and the erase buttons do nothing.
// `-nucleo-fixtures -qa-v18-nudge follow-move | follow-move-plain | follow-move-wall` shows the
// line on the glass with a number, without one, and when the next read would be refused.
#if DEBUG
import SwiftUI

@MainActor
enum HarnessQA {
    static var fixtures: [String: () -> AnyView] {
        [
            // A tapped sector follow-up: the asset they asked about first, the day's change of each.
            "follow-sector": {
                var board = HarnessBoard.sector(HarnessSectors.sector(id: "semis")!, around: "NVDA")
                for (symbol, change) in [("NVDA", 2.3), ("AMD", -0.8), ("TSM", 1.1), ("AVGO", 0.4)] { board.set(change, for: symbol) }
                return screen(board)
            },
            // The week: what they asked about, since they asked. One row could not be read.
            "follow-week": {
                var board = HarnessBoard(kind: .week, title: HarnessCopy.weekTitle, basis: HarnessCopy.sinceAsked, rows: [
                    .init(symbol: "NVDA", name: "NVIDIA", isEquity: true, priceThen: 100),
                    .init(symbol: "BTC", name: "Bitcoin", isEquity: false, priceThen: 100),
                    .init(symbol: "TSLA", name: "Tesla", isEquity: true, priceThen: nil),
                ])
                board.set(4.2, for: "NVDA")
                board.set(-1.6, for: "BTC")
                return screen(board)
            },
            "follow-empty": { screen(.week([])) },
            // The same week when the next read would be refused: the numbers stay, no row invites a read.
            "follow-week-wall": {
                var board = HarnessBoard(kind: .week, title: HarnessCopy.weekTitle, basis: HarnessCopy.sinceAsked, rows: [
                    .init(symbol: "NVDA", name: "NVIDIA", isEquity: true, priceThen: 100),
                    .init(symbol: "BTC", name: "Bitcoin", isEquity: false, priceThen: 100),
                ])
                board.set(4.2, for: "NVDA")
                board.set(-1.6, for: "BTC")
                return AnyView(HarnessBoardContent(board: board, asks: false, onClose: {}, onMemory: {}, onCredits: {}, onPick: { _ in }))
            },
            // Memory, "On this iPhone": what the phone keeps for follow-ups about three assets.
            "memory-notes-three": { memory(notes(.three)) },
            // The same section after a few weeks of follow-ups: every sentence it can say.
            "memory-notes-full": { memory(notes(.full)) },
            "memory-notes-empty": { memory(HarnessNotes(mode: .undecided)) },
            "memory-notes-off": { memory(HarnessNotes(mode: .off)) },
            // Reminders with the Follow-ups switch on and the week one tap away.
            "reminders-follow-ups": {
                AnyView(RemindersContent(model: .make(theses: [], pending: [], permission: .allowed, followUps: .on, showsWeekRow: true),
                                         actions: RemindersActions(preset: { _, _ in .failed }, pick: { _, _ in .failed }, remove: { _ in },
                                                                   openSettings: {}, openBriefing: {}, close: {})))
            },
        ]
    }

    private static func screen(_ board: HarnessBoard) -> AnyView {
        AnyView(HarnessBoardContent(board: board, onClose: {}, onMemory: {}, onCredits: {}, onPick: { _ in }))
    }

    /// The Memory screen of a signed-out phone with "On this iPhone" unfolded, as one tap leaves it.
    private static func memory(_ notes: HarnessNotes) -> AnyView {
        AnyView(MemoryView(center: MemoryQA.center(suite: "qa.v18.harness.memory", signedIn: false), riskAccepted: true, onClose: {},
                           fixedNotes: notes, localStartsOpen: true))
    }

    enum Sample { case three, full }

    /// Notes computed by the shipping code (HarnessNotes.make) from a fixed ledger and a fixed day,
    /// Wednesday 7 October 2026: never hand-written sentences.
    static func notes(_ sample: Sample) -> HarnessNotes {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Mexico_City") ?? .current
        func at(_ month: Int, _ day: Int, _ hour: Int, _ minute: Int = 0) -> Date {
            calendar.date(from: DateComponents(year: 2026, month: month, day: day, hour: hour, minute: minute)) ?? Date()
        }
        var ledger = HarnessLedger()
        for day in [1, 3, 5] {
            ledger.note(HarnessEvent(kind: .ask, at: at(10, day, 14, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, price: 100,
                                     horizon: day == 5 ? .week : nil))
        }
        ledger.note(HarnessEvent(kind: .saved, at: at(10, 5, 14, 12), symbol: "NVDA", horizonHours: 168))
        ledger.note(HarnessEvent(kind: .ask, at: at(10, 3, 9, 30), symbol: "BTC", name: "Bitcoin", isEquity: false, price: 100))
        for day in [28, 30] {
            ledger.note(HarnessEvent(kind: .ask, at: at(9, day, 18, 45), symbol: "TSLA", name: "Tesla", isEquity: true, price: 100))
        }
        ledger.note(HarnessEvent(kind: .thesis, at: at(9, 30, 18, 50), symbol: "TSLA", horizon: .month))
        var upcoming = [HarnessFollowUp(step: .asset, fireAt: at(10, 12, 14, 10), symbol: "NVDA", name: "NVIDIA", isEquity: true, days: 7)]
        if sample == .full {
            for (day, answered) in [(29, true), (1, true), (4, true)] {
                let shown = at(day == 29 ? 9 : 10, day, 19)
                ledger.note(HarnessEvent(kind: .sent, at: shown, symbol: "TSLA", step: .asset))
                ledger.note(HarnessEvent(kind: .opened, at: shown.addingTimeInterval(600), symbol: "TSLA", step: .asset, ref: shown))
                if answered { ledger.note(HarnessEvent(kind: .returned, at: shown.addingTimeInterval(900), symbol: "TSLA", step: .asset, ref: shown)) }
            }
            upcoming.append(HarnessFollowUp(step: .week, fireAt: at(10, 19, 14, 10), symbol: "NVDA", others: 1))
        }
        return HarnessNotes.make(ledger: ledger, mode: .on, upcoming: upcoming, now: at(10, 7, 12), calendar: calendar)
    }
}
#endif
