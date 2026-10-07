// The harness (1.8): where a sector or a week follow-up lands. One list: the assets, each with how
// far it moved, and a tap that asks Bobby about it. The numbers are read when the screen opens
// (one quota-free request per row); a row whose number could not be read shows none.
// `HarnessBoard` is pure so tests and the review fixtures pin what the screen shows.
import SwiftUI

struct HarnessBoard: Equatable {
    enum Kind: Equatable {
        case sector(String)
        case week
    }

    struct Row: Equatable, Identifiable {
        let symbol: String
        let name: String
        let isEquity: Bool
        /// Week rows: the price when they first asked this week.
        var priceThen: Double? = nil
        /// Percent: the last 24 hours for a sector, since they asked for a week. Nil until read.
        var change: Double? = nil
        var id: String { symbol }
    }

    static let weekRows = 6

    var kind: Kind
    var title: String
    /// What the numbers are measured over.
    var basis: String
    var rows: [Row]

    /// A sector, with the asset the person asked about first.
    static func sector(_ sector: HarnessSector, around symbol: String?) -> HarnessBoard {
        let members = symbol.map { sector.board(around: $0) } ?? Array(sector.members.prefix(5))
        return HarnessBoard(kind: .sector(sector.id), title: sector.title, basis: HarnessCopy.last24h,
                            rows: members.map { Row(symbol: $0.symbol, name: $0.name, isEquity: sector.isEquity) })
    }

    /// The assets asked about in the last seven days, most recent first.
    static func week(_ assets: [HarnessAsset]) -> HarnessBoard {
        HarnessBoard(kind: .week, title: HarnessCopy.weekTitle, basis: HarnessCopy.sinceAsked,
                     rows: assets.prefix(weekRows).map { Row(symbol: $0.symbol, name: $0.name, isEquity: $0.isEquity, priceThen: $0.firstPrice) })
    }

    /// What a tap (or the profile's row, with none) opens: its sector, else the week.
    static func make(for tap: HarnessTap?, ledger: HarnessLedger, now: Date) -> HarnessBoard {
        if let tap, tap.step == .sector, let sector = tap.sector.flatMap(HarnessSectors.sector(id:)) {
            return .sector(sector, around: tap.symbol)
        }
        return .week(ledger.assets(since: now.addingTimeInterval(-7 * 86_400), now: now))
    }

    /// One row's number from a fresh quote. A sector reads the day's change; a week compares with
    /// the price at the question, and shows nothing when either price is missing.
    func change(for row: Row, price: Double?, changePct: Double?) -> Double? {
        let value: Double?
        switch kind {
        case .sector: value = changePct
        case .week:
            if let then = row.priceThen, let price, then > 0, price > 0 { value = (price / then - 1) * 100 } else { value = nil }
        }
        return value.flatMap { $0.isFinite && abs($0) < 1_000 ? $0 : nil }
    }

    mutating func set(_ change: Double?, for symbol: String) {
        guard let index = rows.firstIndex(where: { $0.symbol == symbol }) else { return }
        rows[index].change = change
    }
}

// MARK: - The sheet (route `.followUp`)

struct HarnessBoardSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void
    /// The review fixtures pass a finished board and no loader.
    var fixed: HarnessBoard? = nil
    var market: (String) async -> (price: Double?, changePct: Double?) = { symbol in
        let market = await NucleoDeskIO.market(symbol)
        return (market.price, market.changePct)
    }
    @State private var board: HarnessBoard?

    var body: some View {
        Group {
            if let board {
                HarnessBoardContent(board: board, onClose: onClose) { row in
                    HarnessCenter.shared.notePicked(symbol: row.symbol)
                    session.startRead(symbol: row.symbol, name: row.name, isEquity: row.isEquity,
                                      question: HarnessCopy.lookQuestion(symbol: row.symbol))
                }
            } else {
                Theme.nucleoSurface.ignoresSafeArea()
            }
        }
        .task {
            guard board == nil else { return }
            if let fixed { board = fixed; return }
            let made = HarnessBoard.make(for: HarnessBoardFocus.take(), ledger: HarnessCenter.shared.ledger, now: Date())
            board = made
            guard session.profile.acceptedRiskNotice else { return }
            await withTaskGroup(of: (String, Double?).self) { group in
                for row in made.rows {
                    group.addTask {
                        let quote = await market(row.symbol)
                        return (row.symbol, made.change(for: row, price: quote.price, changePct: quote.changePct))
                    }
                }
                for await (symbol, change) in group {
                    withAnimation(.easeOut(duration: 0.2)) { board?.set(change, for: symbol) }
                }
            }
        }
    }
}

struct HarnessBoardContent: View {
    let board: HarnessBoard
    let onClose: () -> Void
    let onPick: (HarnessBoard.Row) -> Void

    /// V18-DESIGN.md: a title, what the numbers are, rows of state. One tap per row.
    var body: some View {
        QuietSheet(title: board.title, subtitle: board.rows.isEmpty ? nil : board.basis, closeId: "follow-close", onClose: onClose) {
            VStack(alignment: .leading, spacing: 0) {
                if board.rows.isEmpty {
                    Text(HarnessCopy.boardEmpty).quietFont(16).foregroundStyle(Theme.cream).quietWraps()
                        .padding(.top, 8)
                        .accessibilityIdentifier("follow-empty")
                } else {
                    ForEach(Array(board.rows.enumerated()), id: \.element.id) { index, row in
                        let change = row.change.map(HarnessCopy.signed)
                        QuietRow(label: row.symbol, value: change, note: row.name == row.symbol ? nil : row.name, chevron: true,
                                 hairline: index < board.rows.count - 1,
                                 spoken: HarnessCopy.rowSpoken(symbol: row.symbol, name: row.name, change: change),
                                 id: "follow-row-\(row.symbol)") { onPick(row) }
                    }
                    QuietNote(text: HarnessCopy.boardFoot, id: "follow-foot").padding(.top, 14)
                }
            }
            .padding(.top, 12)
        }
        .environment(\.locale, L.locale)
    }
}
