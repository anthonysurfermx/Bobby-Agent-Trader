// Watches (1.9.x): the screen. One place to start a watch on the asset the person is looking at,
// see what Bobby is watching, and read what it wrote when one was met. Few words on purpose: the
// lines about a watch are the server's, the screen adds the choices and the buttons.
// `WatchCopy` holds every word this screen owns, so the tests pin them in six languages.
import SwiftUI

enum WatchCopy {
    static var title: String { L.t("Watches", "Vigías") }
    static var subtitle: String { L.t("Bobby tells you when it happens.", "Bobby te avisa cuando pase.") }
    static var entry: String { L.t("Watch", "Vigilar") }
    static var atClose: String { L.t("At a day's close, not during the day.", "Al cierre del día, no durante el día.") }
    static var empty: String { L.t("Nothing being watched yet.", "Aún no vigilas nada.") }
    static var stop: String { L.t("Stop watching", "Dejar de vigilar") }
    static func start(_ name: String) -> String { L.t("Watch \(name)", "Vigilar \(name)") }
    static func count(_ active: Int, _ limit: Int) -> String { L.t("Watching \(active) of \(limit)", "Vigilando \(active) de \(limit)") }
    static func direction(_ direction: WatchDirection) -> String {
        switch direction {
        case .falls: return L.t("Falls", "Baja")
        case .rises: return L.t("Rises", "Sube")
        case .moves: return L.t("Either way", "Cualquiera")
        }
    }
    static func percent(_ value: Int) -> String {
        (Double(value) / 100).formatted(.percent.precision(.fractionLength(0)).locale(L.locale))
    }
    static func days(_ value: Int) -> String { L.t("\(value) days", "\(value) días") }
    static func problem(_ problem: WatchCenter.Problem) -> String {
        switch problem {
        case .signIn: return L.t("Sign in so Bobby can watch for you.", "Inicia sesión para que Bobby vigile por ti.")
        case .notifications: return L.t("Allow notifications in Settings so Bobby can tell you.", "Permite las notificaciones en Ajustes para que Bobby te avise.")
        case .limit(let limit): return L.t("You already have \(limit) watches. Stop one to add another.", "Ya tienes \(limit) vigías. Deja uno para añadir otro.")
        case .unreadable: return L.t("Bobby could not read this asset right now. Nothing was started.", "Bobby no pudo leer este activo ahora. No se inició nada.")
        case .unavailable: return L.t("Not available right now. Try again in a moment.", "No disponible ahora. Inténtalo en un momento.")
        }
    }
}

struct WatchesSheet: View {
    @ObservedObject var center: WatchCenter
    /// The asset the person was looking at when they opened the screen, when there is one.
    var focus: (symbol: String, name: String)? = nil
    let onClose: () -> Void

    @State private var direction: WatchDirection = .falls
    @State private var percent = 5
    @State private var days = 7
    @State private var openId: String?

    private var canStart: (symbol: String, name: String)? {
        guard let focus, let board = center.board, board.canWatch(focus.symbol), board.hasRoom else { return nil }
        return focus
    }

    var body: some View {
        QuietSheet(title: WatchCopy.title, subtitle: WatchCopy.subtitle, closeId: "watches-close", onClose: onClose,
                   bottom: canStart.map { focus in
                       AnyView(QuietPrimary(title: WatchCopy.start(focus.name), busy: center.busy, id: "watches-start") {
                           Task { await center.start(symbol: focus.symbol, direction: direction, percent: percent, days: days) }
                       })
                   }) {
            VStack(alignment: .leading, spacing: 18) {
                if let problem = center.problem {
                    QuietNote(text: WatchCopy.problem(problem), systemImage: "exclamationmark.circle", id: "watches-problem")
                }
                if canStart != nil, let board = center.board { maker(board) }
                if let board = center.board {
                    if board.watches.isEmpty && canStart == nil {
                        QuietNote(text: WatchCopy.empty, id: "watches-empty")
                    }
                    if !board.active.isEmpty {
                        Text(WatchCopy.count(board.active.count, board.limit))
                            .quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted)
                            .accessibilityIdentifier("watches-count")
                        ForEach(board.active) { watch in activeRow(watch) }
                    }
                    ForEach(board.ended) { watch in endedRow(watch) }
                } else if center.busy {
                    ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 24)
                }
            }
            .padding(.top, 20)
        }
        .task { await center.refresh() }
    }

    private func maker(_ board: WatchBoard) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(WatchDirection.allCases, id: \.self) { option in
                    QuietChip(title: WatchCopy.direction(option), selected: direction == option, id: "watches-direction-\(option.rawValue)") { direction = option }
                }
            }
            HStack(spacing: 8) {
                ForEach(board.percents, id: \.self) { option in
                    QuietChip(title: WatchCopy.percent(option), selected: percent == option, id: "watches-percent-\(option)") { percent = option }
                }
            }
            HStack(spacing: 8) {
                ForEach(board.days, id: \.self) { option in
                    QuietChip(title: WatchCopy.days(option), selected: days == option, id: "watches-days-\(option)") { days = option }
                }
            }
            Text(WatchCopy.atClose).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).quietWraps()
        }
        .disabled(center.busy)
    }

    private func activeRow(_ watch: BobbyWatch) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(watch.label).quietFont(16, relativeTo: .body).foregroundStyle(Theme.cream).quietWraps()
            QuietTextLink(title: WatchCopy.stop, id: "watches-stop-\(watch.id)") { Task { await center.stop(watch.id) } }
        }
        .accessibilityIdentifier("watches-active-\(watch.id)")
    }

    private func endedRow(_ watch: BobbyWatch) -> some View {
        let open = openId == watch.id
        return Button {
            openId = open ? nil : watch.id
            if !open { Task { await center.opened(watch.id) } }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if watch.state == .met && !watch.seen { Circle().fill(Theme.cream).frame(width: 7, height: 7).accessibilityHidden(true) }
                    Text(watch.label).quietFont(14, relativeTo: .subheadline).foregroundStyle(Theme.warmMuted).quietWraps()
                }
                if let line = open ? (watch.text ?? watch.ending) : watch.ending {
                    Text(line).quietFont(16, relativeTo: .body).foregroundStyle(Theme.cream).quietWraps().multilineTextAlignment(.leading)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("watches-ended-\(watch.id)")
    }
}
