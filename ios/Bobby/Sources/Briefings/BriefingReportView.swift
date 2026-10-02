// Bobby Pro market briefings — one report (build 53), opened from the inbox or a notification tap.
// Invariants:
//  - The report is fetched on every open (GET /api/briefing?id=): the server re-authorizes owner + Pro;
//    opening never starts an analysis and never spends a Desk read. Nothing is cached on the phone.
//  - Every answer is checked against the account it was asked for (user id + AccountSession generation +
//    this model's request token); an account change hides the report at once and asks again.
//  - A missing or foreign id reads the same generic line ("isn't available on this account"); 403 is the
//    Pro offer; a dependency failure offers a retry. The server's text is never shown.
//  - The greeting may use the Apple given name stored on this phone: visual only, never sent anywhere.
//  - Text is always readable; narration is optional and lives behind BriefingPlayback (the audio package
//    injects the real player through BriefingPlaybackFactory; the default does nothing and hides the bar).
import Combine
import SwiftUI

// MARK: - Playback contract (implemented by the narration package)

enum BriefingPlaybackState: Equatable {
    /// No player in this build, or narration not allowed (mute, no audio consent): the bar is hidden.
    case unavailable
    case idle
    case preparing
    case playing
    case paused
    case finished
    /// Audio failed; the text stays on screen.
    case failed
}

/// The narration of one report: ordered segments, play/pause/resume/stop. Implementations own audio
/// consent, mute, cancellation and account checks; the view only binds to `state` and `currentSegment`.
@MainActor
protocol BriefingPlayback: ObservableObject where ObjectWillChangePublisher == ObservableObjectPublisher {
    var state: BriefingPlaybackState { get }
    /// The segment being spoken (0-based), nil when nothing plays.
    var currentSegment: Int? { get }
    func play(report: BriefingReport)
    /// A notification tap opened the report: start only when the player's own autoplay rules allow it.
    func autoplay(report: BriefingReport)
    func pause()
    func resume()
    func stop()
}

/// The default: no narration (the bar stays hidden, the text is the briefing).
@MainActor
final class NoBriefingPlayback: BriefingPlayback {
    let state: BriefingPlaybackState = .unavailable
    let currentSegment: Int? = nil
    func play(report: BriefingReport) {}
    func autoplay(report: BriefingReport) {}
    func pause() {}
    func resume() {}
    func stop() {}
}

/// Type-erased playback so a SwiftUI view can observe whichever player the app injects.
@MainActor
final class AnyBriefingPlayback: ObservableObject {
    private let base: any BriefingPlayback
    private var forward: AnyCancellable?

    init(_ base: some BriefingPlayback) {
        self.base = base
        forward = base.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
    }

    var state: BriefingPlaybackState { base.state }
    var currentSegment: Int? { base.currentSegment }
    func play(report: BriefingReport) { base.play(report: report) }
    func autoplay(report: BriefingReport) { base.autoplay(report: report) }
    func pause() { base.pause() }
    func resume() { base.resume() }
    func stop() { base.stop() }
}

/// Where report screens get their player. The narration package replaces `make` once at launch.
@MainActor
enum BriefingPlaybackFactory {
    static var make: () -> AnyBriefingPlayback = { AnyBriefingPlayback(NoBriefingPlayback()) }
}

// MARK: - Report loading (testable)

@MainActor
final class BriefingReportModel: ObservableObject {
    enum Phase: Equatable {
        case loading
        case loaded(BriefingReport)
        /// Missing or another account's report: one generic line.
        case notFound
        /// 403: the owner without current Pro.
        case subscriptionRequired
        /// Offline, timeout, 5xx, or the account changed mid-request: retry.
        case unavailable
        case signedOut
    }

    @Published private(set) var phase: Phase = .loading
    let briefId: String

    var fetch: (String) async throws -> BriefingReport = { try await BriefingsAPI().report(id: $0) }
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }

    private var request = UUID()
    private var cancellables = Set<AnyCancellable>()

    init(briefId: String, observeAccount: Bool = true) {
        self.briefId = briefId
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.accountChanged() } }
            .store(in: &cancellables)
    }

    /// Another account (or none) now: hide this report at once; the new account must be authorized again.
    func accountChanged() {
        request = UUID()
        phase = .loading
        Task { await load() }
    }

    func load() async {
        let token = UUID()
        request = token
        guard currentUser() != nil else { phase = .signedOut; return }
        // R11: a report is never fetched before the risk notice is accepted.
        guard riskAccepted() else { phase = .unavailable; return }
        let user = currentUser(), generation = currentGeneration()
        if case .loaded = phase {} else { phase = .loading }
        let outcome: Phase
        do {
            let report = try await fetch(briefId)
            outcome = report.id == BriefingJSON.uuid(briefId) ? .loaded(report) : .unavailable
        } catch {
            outcome = Self.phase(for: error)
        }
        guard token == request, user == currentUser(), generation == currentGeneration() else { return }
        phase = outcome
    }

    static func phase(for error: Error) -> Phase {
        switch error as? BriefingsError {
        case .notFound?: return .notFound
        case .subscriptionRequired?: return .subscriptionRequired
        case .signedOut?: return .signedOut
        // A 4xx refusal on a report id is answered like a missing report: never more detail than that.
        case .rejected?, .conflict?, .consentRequired?: return .notFound
        case .unavailable?, nil: return .unavailable
        }
    }
}

/// Two parts of the weekly report. An asset section reflects a question or selected interest,
/// never a holding, an executed trade or portfolio performance. Order within each part stays server-authored.
struct BriefingWeeklyPresentation {
    let personalSections: [BriefingSection]
    let commonSections: [BriefingSection]
    let personalTitle: String
    let commonTitle: String
    let personalNotice: String?

    init(report: BriefingReport, spanish: Bool = L.isSpanish) {
        personalSections = report.sections.filter { $0.kind == "asset" }
        commonSections = report.sections.filter { $0.kind != "asset" }
        if report.personalBasis == .askedAssets {
            personalTitle = L.t("Your questions: last week", "Tus consultas: la semana pasada", spanish: spanish)
        } else if !personalSections.isEmpty {
            personalTitle = L.t("Your interests: last week", "Tus intereses: la semana pasada", spanish: spanish)
        } else {
            personalTitle = L.t("Your questions: last week", "Tus consultas: la semana pasada", spanish: spanish)
        }
        commonTitle = L.t("The market: the week ahead", "El mercado: la semana que empieza", spanish: spanish)
        personalNotice = personalSections.isEmpty
            ? L.t("No personal asset review is available for this briefing. The market outlook follows.",
                  "No hay un repaso personal de activos disponible en este resumen. Sigue el panorama general del mercado.", spanish: spanish)
            : nil
    }
}

// MARK: - Screen

struct BriefingReportView: View {
    @StateObject private var model: BriefingReportModel
    @StateObject private var playback: AnyBriefingPlayback
    /// Opened from a notification tap: start the greeting/narration once loaded (the player decides
    /// whether consent and mute allow it).
    let autoplay: Bool
    let onShowPro: (() -> Void)?
    let onClose: (() -> Void)?
    @ObservedObject private var account = AccountSession.shared
    @State private var autoplayed = false

    init(briefId: String, autoplay: Bool = false, onShowPro: (() -> Void)? = nil, onClose: (() -> Void)? = nil) {
        _model = StateObject(wrappedValue: BriefingReportModel(briefId: briefId))
        _playback = StateObject(wrappedValue: BriefingPlaybackFactory.make())
        self.autoplay = autoplay
        self.onShowPro = onShowPro
        self.onClose = onClose
    }

    private var greetingName: String? {
        account.isSignedIn ? AppleGivenName.name(for: account.session?.appleUserId) : nil
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                if onClose != nil { BriefingTopBar(title: L.t("Market briefing", "Resumen de mercado"), onClose: onClose) }
                content
            }
            .padding(.horizontal, 22)
            .padding(.top, onClose == nil ? 8 : 16)
            .padding(.bottom, 32)
        }
        .scrollIndicators(.hidden)
        .safeAreaInset(edge: .bottom) { playbackBar }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(Theme.nucleoSurface, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .environment(\.colorScheme, .dark)
        .task { await model.load() }
        .onAppear { BriefingIntent.shared.markOpen(model.briefId) }
        .onDisappear {
            playback.stop()
            BriefingIntent.shared.markOpen(nil)
        }
        .onChange(of: model.phase) { _, phase in
            guard case .loaded(let report) = phase else { playback.stop(); return }
            if autoplay, !autoplayed {
                autoplayed = true
                playback.autoplay(report: report)
            }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.phase {
        case .loading:
            ProgressView().tint(Theme.warmMuted).frame(maxWidth: .infinity).padding(.top, 60)
        case .loaded(let report):
            reportBody(report)
        case .notFound:
            message(L.t("This briefing isn’t available on this account.", "Este resumen no está disponible en esta cuenta."))
                .accessibilityIdentifier("briefing-not-found")
        case .signedOut:
            message(BriefingsError.signedOut.message)
                .accessibilityIdentifier("briefing-signed-out")
        case .subscriptionRequired:
            VStack(alignment: .leading, spacing: 12) {
                message(BriefingsError.subscriptionRequired.message)
                if let onShowPro {
                    BriefingPillButton(title: L.t("See Bobby Pro", "Ver Bobby Pro"), prominent: true, action: onShowPro)
                        .accessibilityIdentifier("briefing-pro")
                }
            }
            .accessibilityIdentifier("briefing-subscription-required")
        case .unavailable:
            VStack(alignment: .leading, spacing: 12) {
                message(BriefingsError.unavailable.message)
                BriefingPillButton(title: L.t("Try again", "Reintentar")) { Task { await model.load() } }
                    .accessibilityIdentifier("briefing-retry")
            }
        }
    }

    private func message(_ text: String) -> some View {
        Text(text).font(.system(size: 14)).foregroundStyle(Theme.cream).fixedSize(horizontal: false, vertical: true)
            .padding(.top, 24)
    }

    @ViewBuilder private func reportBody(_ report: BriefingReport) -> some View {
        header(report)
        if !report.opening.isEmpty {
            Text(report.opening).font(.system(size: 15)).foregroundStyle(Theme.cream).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 16)
        }
        if let note = qualityNote(report.quality) {
            Text(note).font(.system(size: 12)).foregroundStyle(Theme.cio).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 12)
                .accessibilityIdentifier("briefing-quality")
        }
        if report.cadence == .weekly {
            let parts = BriefingWeeklyPresentation(report: report)
            VStack(alignment: .leading, spacing: 0) {
                BriefingSectionLabel(text: parts.personalTitle)
                if let notice = parts.personalNotice {
                    Text(notice).font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 8)
                }
                ForEach(Array(parts.personalSections.enumerated()), id: \.offset) { _, section in sectionView(section) }
            }
            .accessibilityIdentifier("briefing-personal-block")
            VStack(alignment: .leading, spacing: 0) {
                BriefingSectionLabel(text: parts.commonTitle)
                ForEach(Array(parts.commonSections.enumerated()), id: \.offset) { _, section in sectionView(section) }
            }
            .accessibilityIdentifier("briefing-common-block")
        } else {
            // Retained daily/close reports remain readable in their original order.
            ForEach(Array(report.sections.enumerated()), id: \.offset) { _, section in sectionView(section) }
        }
        footer(report)
    }

    private func header(_ report: BriefingReport) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if let name = greetingName {
                Text(L.t("Hi, \(name)", "Hola, \(name)"))
                    .font(.system(size: 15, design: .rounded)).foregroundStyle(Theme.warmMuted)
                    .accessibilityIdentifier("briefing-greeting")
            }
            HStack(spacing: 8) {
                Text(BriefingCopy.cadence(report.cadence).uppercased()).font(.mono(11, .medium)).tracking(1.4).foregroundStyle(Theme.warmDim)
                if let badge = BriefingCopy.quality(report.quality) { BriefingBadge(text: badge, tint: Theme.cio) }
            }
            if !report.title.isEmpty {
                Text(report.title).font(.system(size: 26, weight: .light, design: .rounded)).foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let day = report.scheduledAt ?? report.periodEnd {
                Text(L.t("\(BriefingFormat.newYorkDay(day)) · New York", "\(BriefingFormat.newYorkDay(day)) · Nueva York"))
                    .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
            }
            VStack(alignment: .leading, spacing: 2) {
                if let asOf = report.dataAsOf {
                    Text(L.t("Data as of \(BriefingFormat.asOf(asOf)) your time", "Datos al \(BriefingFormat.asOf(asOf)) tu hora"))
                }
                if let session = BriefingCopy.equitySession(report.equitySession) { Text(session) }
            }
            .font(.mono(10.5)).tracking(0.3).foregroundStyle(Theme.warmDim)
            .accessibilityIdentifier("briefing-freshness")
        }
        .padding(.top, 14)
    }

    private func sectionView(_ section: BriefingSection) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                if let symbol = section.symbol {
                    Text(symbol).font(.mono(12, .medium)).foregroundStyle(Theme.cream)
                }
                Text(section.title).font(.system(size: 16, weight: .medium)).foregroundStyle(Theme.cream)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 4)
                if let status = BriefingCopy.status(section.status) {
                    BriefingBadge(text: status, tint: ["stale", "missing", "partial"].contains(section.status) ? Theme.cio : Theme.warmMuted)
                }
            }
            if !section.facts.isEmpty {
                VStack(spacing: 4) {
                    ForEach(Array(section.facts.enumerated()), id: \.offset) { _, fact in
                        HStack {
                            Text(fact.label).foregroundStyle(Theme.warmDim)
                            Spacer(minLength: 8)
                            Text(fact.value).foregroundStyle(Theme.cream).monospacedDigit()
                        }
                        .font(.mono(11.5))
                    }
                }
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.nucleoGlass))
            }
            Text(section.body).font(.system(size: 14)).foregroundStyle(Theme.cream.opacity(0.92)).lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
            if let explainer = section.explainer {
                Text(explainer).font(.system(size: 12.5)).foregroundStyle(Theme.warmMuted).lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .leading) { Rectangle().fill(Theme.orbViolet.opacity(0.5)).frame(width: 2) }
            }
            if let asOf = section.asOf {
                Text(L.t("As of \(BriefingFormat.asOf(asOf))", "Al \(BriefingFormat.asOf(asOf))"))
                    .font(.mono(10)).foregroundStyle(Theme.warmDim)
            }
        }
        .padding(.top, 18)
        .padding(.bottom, 2)
        .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1).padding(.top, 8) }
        .accessibilityElement(children: .contain)
    }

    private func footer(_ report: BriefingReport) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(L.t("Sources", "Fuentes").uppercased()).font(.mono(10.5, .medium)).tracking(1.4).foregroundStyle(Theme.warmDim)
            ForEach(Array(report.sources.enumerated()), id: \.offset) { _, source in
                HStack(spacing: 8) {
                    Circle().fill(source.ok ? Theme.up : Theme.cio).frame(width: 6, height: 6)
                    Text(source.name).foregroundStyle(Theme.warmMuted)
                    Spacer(minLength: 8)
                    Text(BriefingCopy.status(source.freshness) ?? L.t("Live", "En vivo")).foregroundStyle(Theme.warmDim)
                }
                .font(.mono(10.5))
            }
            Text(L.t("Market information only, not financial advice. Prices and figures come from the market data, not from the AI.",
                     "Solo información de mercado, no es asesoría financiera. Los precios y cifras vienen de los datos de mercado, no de la IA."))
                .font(.system(size: 11)).foregroundStyle(Theme.warmDim).fixedSize(horizontal: false, vertical: true)
                .padding(.top, 6)
        }
        .padding(.top, 26)
        .accessibilityIdentifier("briefing-sources")
    }

    private func qualityNote(_ quality: String?) -> String? {
        switch quality {
        case "partial": return L.t("Some market data was missing; this briefing shows what was available.",
                                   "Faltaron algunos datos de mercado; este resumen muestra lo que estaba disponible.")
        case "facts_only": return L.t("Bobby’s commentary was not available; this briefing shows the market data only.",
                                      "El comentario de Bobby no estuvo disponible; este resumen muestra solo los datos de mercado.")
        default: return nil
        }
    }

    /// Play/pause bound to the injected player; hidden when there is none (the text is the briefing).
    @ViewBuilder private var playbackBar: some View {
        if case .loaded(let report) = model.phase, playback.state != .unavailable, !report.narrationSegments.isEmpty {
            HStack(spacing: 14) {
                Button {
                    switch playback.state {
                    case .playing, .preparing: playback.pause()
                    case .paused: playback.resume()
                    default: playback.play(report: report)
                    }
                } label: {
                    Image(systemName: playback.state == .playing || playback.state == .preparing ? "pause.fill" : "play.fill")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.bg)
                        .frame(width: 44, height: 44).background(Circle().fill(Theme.cream))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(playback.state == .playing ? L.t("Pause", "Pausar") : L.t("Play", "Reproducir"))
                .accessibilityIdentifier("briefing-play")
                VStack(alignment: .leading, spacing: 2) {
                    Text(playbackTitle).font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.cream)
                    if let segment = playback.currentSegment {
                        Text("\(segment + 1) / \(report.narrationSegments.count)").font(.mono(10.5)).foregroundStyle(Theme.warmDim)
                    }
                }
                Spacer()
                if playback.state == .playing || playback.state == .paused || playback.state == .preparing {
                    Button { playback.stop() } label: {
                        Image(systemName: "stop.fill").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.warmMuted)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(L.t("Stop", "Detener"))
                    .accessibilityIdentifier("briefing-stop")
                }
            }
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(Theme.panel.opacity(0.96).ignoresSafeArea(edges: .bottom))
            .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
        }
    }

    private var playbackTitle: String {
        switch playback.state {
        case .preparing: return L.t("Preparing the narration…", "Preparando la narración…")
        case .playing: return L.t("Bobby is reading your briefing", "Bobby está leyendo tu resumen")
        case .paused: return L.t("Paused", "En pausa")
        case .failed: return L.t("Narration unavailable — the text is all here", "Narración no disponible — el texto está completo aquí")
        case .finished: return L.t("Listen again", "Escuchar de nuevo")
        case .idle, .unavailable: return L.t("Listen to this briefing", "Escuchar este resumen")
        }
    }
}
