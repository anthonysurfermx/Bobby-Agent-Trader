// The Núcleo is the app (Nucleo/ARCHITECTURE.md §1.3). One session and one web view:
// onboarding until a companion is chosen and the risk notice accepted, then the daily
// app, cross-faded. Native sheets (squad, locker, island, account, risk notice, Bobby Pro, a tapped
// market briefing) open over the glass; the header avatar opens the account sheet (sign in, sign out, delete
// the account, privacy). DEBUG builds only: a long press on the page's wordmark
// (`openClassic`) tears all of this down before the classic desk appears, for the rest
// of this launch. Release has no way out of the Núcleo.
import SwiftUI

/// DEBUG launch options, parsed by BobbyApp (Release always uses the defaults).
struct NucleoLaunchOptions {
    /// `-nucleo-fixtures [scenario]`: fixture mode.
    var fixtures: String?
    /// `-nucleo-page app|onboarding|contract`: force a page.
    var page: NucleoPage?
}

@MainActor
final class NucleoHost: ObservableObject {
    let session: NucleoSession
    let controller: NucleoWebController
    let bridge: NucleoBridge

    /// One-time reset of the classic desk's mute (1.1–1.4 persisted it under `avatar.voiceMuted`):
    /// the Núcleo had no way to unmute, so a user who ever muted there never heard Bobby again.
    /// From here on the account sheet's "Bobby's voice" switch owns the preference.
    static let voiceMuteResetKey = "nucleo.voiceMuteReset.v1"

    init(options: NucleoLaunchOptions) {
        session = NucleoSession(fixtures: options.fixtures != nil)
        let defaults = UserDefaults.standard
        if !defaults.bool(forKey: Self.voiceMuteResetKey) {
            defaults.set(true, forKey: Self.voiceMuteResetKey)
            session.voice.isMuted = false
        }
        // 1.8: each feature speaks on the glass through one nudge source (V18/V18.swift).
        if !BobbyApp.isUnitTestHost { V18.registerNudges() }
#if DEBUG
        if let name = BobbyApp.argument(after: "-qa-v18-nudge") { V18QA.installGlassNudge(named: name, session: session) }
#endif
        bridge = NucleoBridge(session: session)
        controller = NucleoWebController(handler: bridge)
        session.emitter = controller
        session.onRoute = { [weak self] page in self?.controller.load(page, crossFade: true) }
#if DEBUG
        if options.fixtures != nil {
            session.desk.clock = NucleoDesk.Clock(
                now: { NucleoFixtures.recordedAt(symbol: $0, kind: "candles") ?? Date() },
                receivedAt: { NucleoFixtures.recordedAt(symbol: $0, kind: "debate") ?? Date() })
        }
#endif
        controller.load(options.page ?? session.page)
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-nucleo-paywall") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.session.presentPaywallForReview() }
        }
#endif
    }

    func teardown() {
        session.teardown()
        controller.teardown()
    }
}

struct NucleoRootView: View {
    let onClassic: () -> Void
    @StateObject private var host: NucleoHost

    init(options: NucleoLaunchOptions = NucleoLaunchOptions(), onClassic: @escaping () -> Void) {
        self.onClassic = onClassic
        _host = StateObject(wrappedValue: NucleoHost(options: options))
    }

    var body: some View {
        NucleoStage(session: host.session, controller: host.controller) {
            // Tear down first; the classic desk appears on the next turn of the run loop.
            host.teardown()
            DispatchQueue.main.async { onClassic() }
        }
    }
}

private struct NucleoStage: View {
    @ObservedObject var session: NucleoSession
    let controller: NucleoWebController
    let onClassic: () -> Void
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        NucleoWebViewRepresentable(controller: controller)
            .ignoresSafeArea()
            .background(Color.black.ignoresSafeArea())
            .overlay(alignment: .top) { NucleoNotchView(notch: session.notch) }
            // The pages keep their top free for the island; the status bar steps aside.
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
            .sheet(item: $session.sheet, onDismiss: { session.sheetDismissed() }) { route in
                sheet(route)
            }
            .onReceive(NotificationCenter.default.publisher(for: L.didChange)) { _ in
                session.voice.stop()
                session.speech.cancel()
                _ = session.desk.cancel()
                _ = session.sessionChanged()
                if session.profile.acceptedRiskNotice, AccountSession.shared.isSignedIn {
                    Task { _ = await BriefingsCenter.shared.setLanguage(L.language) }
                }
                controller.load(session.page, crossFade: false)
            }
            .onChange(of: session.classicRequested) { _, requested in
                if requested { onClassic() }
            }
            .onChange(of: scenePhase) { _, phase in
                switch phase {
                case .active: session.appBecameActive()
                case .background: session.appWentBackground()
                default: break
                }
            }
    }

    @ViewBuilder
    private func sheet(_ route: NucleoRoute) -> some View {
        switch route {
        case .squad:
            MascotGalleryView(store: session.companions, voice: session.voice, voiceId: session.profile.voiceId)
        case .locker:
            SquadLockerSheet(store: session.companions)
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.bg)
        case .isla:
            TraderLandGateHarnessView(focus: nil)
                .presentationDetents([.large])
                .presentationBackground(Theme.bg)
        case .account:
            // Full height: deletion must never hide below a half-height detent (App Review 5.1.1(v)).
            AccountSheet(store: session.companions, profile: session.profile, detents: [.large], showsLinks: true, voice: session.voice,
                         onVoiceMutedChange: { session.sessionChanged() },
                         onAIConsentWithdraw: { session.revokeRiskNoticeConsent() },
                         onOpenRoute: { session.switchSheet(to: $0) }) { session.sheet = nil }
        case .riskNotice:
            // Opened from onboarding before consent: no withdraw (RiskNoticeView shows neutral marks too).
            RiskNoticeView(profile: session.profile, readOnly: true,
                           onClose: { session.sheet = nil },
                           onWithdraw: session.profile.acceptedRiskNotice ? { session.revokeRiskNoticeConsent() } : nil)
        case .paywall:
            NucleoPaywallSheet(store: BobbyStore.shared, center: BobbyAccessCenter.shared,
                               afterSignIn: { await session.signedInFromSheet() },
                               onOutcome: { session.paywallOutcome($0) }) { session.sheet = nil }
        case .levels:
            NucleoLevelSheet(center: NucleoLevelCenter.shared) { session.sheet = nil }
                .presentationDetents([.height(340), .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .invite:
            NucleoInviteSheet(center: NucleoLevelCenter.shared, proPurchasable: session.proPurchasable, reason: session.inviteReason,
                              onPro: { session.inviteChosePro() }, onClose: { session.sheet = nil },
                              afterSignIn: { await session.signedInFromSheet() })
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.bg)
        case .credits:
            CreditsSheet(session: session) { session.sheet = nil }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .theses:
            ThesisListSheet(session: session) { session.sheet = nil }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .thesisEditor:
            ThesisEditorSheet(session: session) { session.sheet = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .thesisReview:
            ThesisReviewSheet(session: session) { session.sheet = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .memoryConsent:
            MemoryConsentSheet { session.sheet = nil }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .briefingSettings:
            BriefingsSettingsView(riskAccepted: session.profile.acceptedRiskNotice,
                                  onShowPro: { session.switchSheet(to: .paywall) }) { session.sheet = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .memory:
            MemoryView(riskAccepted: session.profile.acceptedRiskNotice) { session.sheet = nil }
                .presentationDetents([.large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .reminders:
            RemindersSheet(session: session) { session.sheet = nil }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .followUp:
            HarnessBoardSheet(session: session) { session.sheet = nil }
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
        case .briefing:
            // A drained notification tap (build 53): the report re-authorizes owner + Pro on open, and
            // its narration starts once loaded when the player's consent and mute allow it.
            if let id = session.selectedBriefId {
                BriefingReportView(briefId: id, autoplay: true,
                                   onShowPro: { session.briefingChosePro() },
                                   onClose: { session.sheet = nil })
                    .id(id)
                    .presentationDetents([.large])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(Theme.nucleoSurface)
            }
        }
    }
}
