// The Núcleo is the app (Nucleo/ARCHITECTURE.md §1.3). One session and one web view:
// onboarding until a companion is chosen and the risk notice accepted, then the daily
// app, cross-faded. Native sheets (squad, locker, island, account, risk notice) open
// over the glass; the header avatar opens the account sheet (sign in, sign out, delete
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

    init(options: NucleoLaunchOptions) {
        session = NucleoSession(fixtures: options.fixtures != nil)
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
            // The pages keep their top free for the island; the status bar steps aside.
            .statusBarHidden(true)
            .persistentSystemOverlays(.hidden)
            .sheet(item: $session.sheet, onDismiss: { session.sheetDismissed() }) { route in
                sheet(route)
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
            AccountSheet(store: session.companions, profile: session.profile, detents: [.large], showsLinks: true, voice: session.voice) { session.sheet = nil }
        case .riskNotice:
            RiskNoticeView(profile: session.profile, readOnly: true) { session.sheet = nil }
        }
    }
}
