// The harness: DEBUG review fixtures (`-qa-v18 <name>`). Fixed sample boards, no ledger, no
// notification centre and no network: the rows do nothing.
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
            // Reminders with the Follow-ups switch on and the week one tap away.
            "reminders-follow-ups": {
                AnyView(RemindersContent(model: .make(theses: [], pending: [], permission: .allowed, followUps: .on, showsWeekRow: true),
                                         actions: RemindersActions(preset: { _, _ in .failed }, pick: { _, _ in .failed }, remove: { _ in },
                                                                   openSettings: {}, openBriefing: {}, close: {})))
            },
        ]
    }

    private static func screen(_ board: HarnessBoard) -> AnyView {
        AnyView(HarnessBoardContent(board: board, onClose: {}, onPick: { _ in }))
    }
}
#endif
