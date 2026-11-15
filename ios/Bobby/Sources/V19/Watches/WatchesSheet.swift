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
    static var empty: String { L.t("Say “tell me if Nvidia falls 5%” and Bobby watches it for you.", "Di «avísame si Nvidia baja 5 %» y Bobby lo vigila por ti.") }
    static var row: String { L.t("Watches", "Vigías") }
    static var rowDetail: String { L.t("Bobby tells you when it happens", "Bobby te avisa cuando pase") }
    static var done: String { L.t("Done. Bobby tells you when it happens.", "Hecho. Bobby te avisa cuando pase.") }
    static var why: String { L.t("What was reported", "Qué se publicó") }
    static var forThesis: String { L.t("For your thesis", "Para tu tesis") }
    static var see: String { L.t("See watches", "Ver vigías") }
    static var retry: String { L.t("Try again", "Reintentar") }
    static var metButton: String { L.t("See", "Ver") }
    static func metLine(_ symbol: String) -> String { L.t("\(symbol): what you asked me to watch happened", "\(symbol): pasó lo que me pediste vigilar") }
    static func offerLine(_ symbol: String) -> String { L.t("Shall I watch \(symbol) for you?", "¿Vigilo \(symbol) por ti?") }
    /// "NVIDIA · falls 5% · 7 days": what a sentence asked for, before the person starts it.
    static func proposal(_ draft: WatchDraft) -> String {
        [draft.name, "\(direction(draft.direction).lowercased(with: L.locale)) \(percent(draft.percent))", days(draft.days)].joined(separator: " · ")
    }
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

/// Under an opened met watch: what was published (with where it was read) and, when the person has a
/// thesis on the asset, what the event means for it. Outside the row's button so the sources are links.
private struct WatchNoteBelow: ViewModifier {
    let note: WatchNote?
    let thesis: String?
    let id: String

    func body(content: Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            content
            if let note {
                section(WatchCopy.why, note.why, "watches-why-\(id)")
                if !note.sources.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(note.sources) { source in
                            QuietTextLink(title: source.host, id: "watches-source-\(source.host)", destination: source.url)
                                .accessibilityLabel(source.title)
                        }
                    }
                }
                if let thesis { section(WatchCopy.forThesis, thesis, "watches-thesis-\(id)") }
            }
        }
    }

    private func section(_ title: String, _ text: String, _ id: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).quietFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted)
            Text(text).quietFont(16, relativeTo: .body).foregroundStyle(Theme.cream).quietWraps().multilineTextAlignment(.leading)
        }
        .accessibilityIdentifier(id)
    }
}

struct WatchesSheet: View {
    @ObservedObject var center: WatchCenter
    /// The asset the person was looking at when they opened the screen, when there is one.
    var focus: (symbol: String, name: String)? = nil
    /// The watch that was just started from the glass: one line says so.
    var startedId: String? = nil
    let onClose: () -> Void

    @State private var direction: WatchDirection
    @State private var percent: Int
    @State private var days: Int
    @State private var openId: String?

    init(center: WatchCenter, entry: WatchFocus.Entry = WatchFocus.Entry(), onClose: @escaping () -> Void) {
        self.center = center
        self.focus = entry.draft.map { ($0.symbol, $0.name) }
        self.startedId = entry.startedId
        self.onClose = onClose
        _direction = State(initialValue: entry.draft?.direction ?? .falls)
        _percent = State(initialValue: entry.draft?.percent ?? 5)
        _days = State(initialValue: entry.draft?.days ?? 7)
        _openId = State(initialValue: entry.openId)
    }

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
                if let startedId, center.board?.active.contains(where: { $0.id == startedId }) == true {
                    QuietNote(text: WatchCopy.done, systemImage: "checkmark.circle", id: "watches-done")
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
        .task {
            await center.refresh()
            // Opened from its notification: the answer is read, so the dot goes.
            if let openId { await center.opened(openId); await center.readAgainstThesis(openId) }
        }
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
            if !open { Task { await center.opened(watch.id); await center.readAgainstThesis(watch.id) } }
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
        .modifier(WatchNoteBelow(note: open ? watch.note : nil, thesis: open ? center.thesisRead[watch.id] : nil, id: watch.id))
    }
}
