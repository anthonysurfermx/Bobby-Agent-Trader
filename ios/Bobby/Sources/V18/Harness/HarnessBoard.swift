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

    /// What a tap (or the profile's row, with none) opens: its sector, else the week. A tapped week
    /// follow-up opens the week it was planned for (HarnessPlanner.weekStart), however late the tap:
    /// what the notification named is on the board.
    static func make(for tap: HarnessTap?, ledger: HarnessLedger, now: Date, calendar: Calendar = .autoupdatingCurrent) -> HarnessBoard {
        if let tap, tap.step == .sector, let sector = tap.sector.flatMap(HarnessSectors.sector(id:)) {
            return .sector(sector, around: tap.symbol)
        }
        let rolling = now.addingTimeInterval(-7 * 86_400)
        let planned = tap.flatMap { $0.step == .week ? $0.stamp : nil }.map { HarnessPlanner.weekStart(of: $0, calendar: calendar) }
        return .week(ledger.assets(since: min(planned ?? rolling, rolling), now: now))
    }

    /// One row's number from a fresh quote. A sector reads the day's change; a week compares with
    /// the price at the question, and shows nothing when either price is missing or the move is one
    /// the phone should not put a number on (a split, a renamed ticker: HarnessCopy.move).
    func change(for row: Row, price: Double?, changePct: Double?) -> Double? {
        switch kind {
        case .sector: return changePct.flatMap { $0.isFinite && abs($0) < 1_000 ? $0 : nil }
        case .week: return HarnessCopy.move(from: row.priceThen, to: price, isEquity: row.isEquity)
        }
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
    /// Whose assets the board shows: it closes the moment someone else is using the phone.
    @State private var generation = AccountSession.shared.generation
    /// Where the phone hears how many reads are left: when either says something new, the rows are
    /// drawn again as buttons or as plain rows.
    @ObservedObject private var receipts = BobbyAccessCenter.shared
    @ObservedObject private var levels = NucleoLevelCenter.shared

    /// A row was tapped: Bobby is asked about its asset on the glass (the sheet goes away first).
    /// The tap is written as acted on when the page asks the question, with the moment of the tap.
    @MainActor
    static func ask(_ row: HarnessBoard.Row, session: NucleoSession, harness: HarnessCenter = .shared) {
        guard harness.readsOpen else { return }
        let tapped = harness.noteTapped(symbol: row.symbol)
        session.startRead(symbol: row.symbol, name: row.name, isEquity: row.isEquity,
                          question: HarnessCopy.lookQuestion(symbol: row.symbol),
                          taken: { harness.notePicked(symbol: row.symbol, at: tapped) })
    }

    var body: some View {
        Group {
            if let board {
                // A row asks Bobby, which is a read: rows are only buttons when the next read is answered.
                HarnessBoardContent(board: board, asks: HarnessCenter.shared.readsOpen, onClose: onClose) { row in
                    Self.ask(row, session: session)
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
            // Not awaited: the numbers do not wait for the receipt, and the rows redraw when it arrives.
            if HarnessCenter.shared.access() == nil { Task { await HarnessCenter.shared.refreshAccess() } }
            await withTaskGroup(of: (String, Double?).self) { group in
                for row in made.rows {
                    group.addTask {
                        let quote = await market(row.symbol)
                        return (row.symbol, made.change(for: row, price: quote.price, changePct: quote.changePct))
                    }
                }
                for await (symbol, change) in group {
                    guard generation == AccountSession.shared.generation else { continue }
                    withAnimation(.easeOut(duration: 0.2)) { board?.set(change, for: symbol) }
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: AccountSession.didChange).receive(on: DispatchQueue.main)) { _ in
            guard fixed == nil, generation != AccountSession.shared.generation else { return }
            // Another reader: what the previous one asked about is not theirs to see.
            board = HarnessBoard(kind: .week, title: HarnessCopy.weekTitle, basis: HarnessCopy.sinceAsked, rows: [])
            onClose()
        }
    }
}

struct HarnessBoardContent: View {
    let board: HarnessBoard
    /// False when the next read would be refused: the board is the same, and no row invites a read.
    var asks = true
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
                        QuietRow(label: row.symbol, value: change, note: row.name == row.symbol ? nil : row.name, chevron: asks,
                                 hairline: index < board.rows.count - 1,
                                 spoken: HarnessCopy.rowSpoken(symbol: row.symbol, name: row.name, change: change),
                                 id: "follow-row-\(row.symbol)", action: asks ? { onPick(row) } : nil)
                    }
                    if asks { QuietNote(text: HarnessCopy.boardFoot, id: "follow-foot").padding(.top, 14) }
                }
            }
            .padding(.top, 12)
        }
        .environment(\.locale, L.locale)
    }
}
