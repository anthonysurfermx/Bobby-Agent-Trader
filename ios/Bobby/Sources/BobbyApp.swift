// Bobby — the trading assistant. Thin native client over the live
// bobbyprotocol.xyz brain. Analysis only: no wallet, no swaps, no keys.
import SwiftUI

@main
struct BobbyApp: App {
    /// The Núcleo is the app. DEBUG builds only: the classic desk sits behind a long press
    /// on the page's wordmark (`openClassic`) for the rest of this launch; the next launch
    /// returns here. Release always shows the Núcleo and never routes to ContentView.
    @State private var showNucleo = true
    @Environment(\.scenePhase) private var scenePhase
    /// APNs token callbacks and the notification-tap delegate (briefings, build 53). Its launch hook does
    /// nothing in the unit-test host; it never asks for notification permission by itself.
    @UIApplicationDelegateAdaptor(BobbyAppDelegate.self) private var appDelegate

    init() {
#if DEBUG
        Self.prepareNucleoLaunch()
#endif
#if DEBUG
        // `-revenuecat-probe [appUserId]`: configure, log in a test id, fetch the offerings once, print them.
        if let probe = Self.argument(after: "-revenuecat-probe") {
            Task { await BobbyStore.shared.probe(appUserID: probe == "all" ? "bobby-ios-simulator-probe" : probe) }
            return
        }
#endif
        // RevenueCat (§8.4): configured at launch with the signed-in account, once the risk notice is
        // accepted; never in unit-test hosts or fixture mode, never without a key.
        BobbyStore.shared.start()
    }

    static var isUnitTestHost: Bool {
#if DEBUG
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
#else
        false
#endif
    }

    private static var isLandPreview: Bool {
#if DEBUG
        ProcessInfo.processInfo.arguments.contains("-trader-land-gate")
#else
        false
#endif
    }

#if DEBUG
    /// The value after a launch flag (`-qa-harvest seed`); "all" when the flag has none.
    static func argument(after flag: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag) else { return nil }
        return args.indices.contains(i + 1) && !args[i + 1].hasPrefix("-") ? args[i + 1] : "all"
    }

    /// Núcleo DEBUG launch arguments (Nucleo/ARCHITECTURE.md §1.3):
    /// `-nucleo-fixtures [scenario]`, `-nucleo-page app|onboarding|contract`,
    /// `-nucleo-reset-onboarding` (simulator), `-nucleo-fixtures-live-voice`.
    private static var nucleoOptions: NucleoLaunchOptions {
        var options = NucleoLaunchOptions()
        if let scenario = argument(after: "-nucleo-fixtures") { options.fixtures = scenario == "all" ? "default" : scenario }
        switch argument(after: "-nucleo-page") {
        case "app": options.page = .app
        case "onboarding": options.page = .onboarding
        case "contract": options.page = .contract
        default: break
        }
        return options
    }

    /// Runs before any store or request exists.
    private static func prepareNucleoLaunch() {
        let args = ProcessInfo.processInfo.arguments
#if targetEnvironment(simulator)
        if args.contains("-nucleo-reset-onboarding") {
            let defaults = UserDefaults.standard
            ["agent.onboarded", "agent.riskNoticeVersion", "companion.id"].forEach { defaults.removeObject(forKey: $0) }
        }
#endif
        if args.contains("-qa-coupon") {
            NucleoFixtures.activate(scenario: "default", liveVoice: false)
        }
        if let scenario = nucleoOptions.fixtures {
            NucleoFixtures.activate(scenario: scenario, liveVoice: args.contains("-nucleo-fixtures-live-voice"))
        }
    }

    /// The classic desk's own UI suites (store shots, release readiness) launch with its
    /// UserDefaults overrides and expect the classic desk first; `-nucleo-classic` asks for it too.
    private static var launchesClassic: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("-nucleo-classic") || args.contains("-store-shots") || args.contains("-agent.onboarded")
    }
#endif

    private static var nucleoLaunchOptions: NucleoLaunchOptions {
#if DEBUG
        nucleoOptions
#else
        NucleoLaunchOptions()
#endif
    }

    var body: some Scene {
        WindowGroup {
            Group {
#if DEBUG
                if Self.isUnitTestHost {
                    Color.clear
                } else if let fixture = Self.argument(after: "-qa-v18") {
                    // 1.8 review fixtures (V18/V18QA.swift): one screen, recorded state, no network.
                    V18QA.view(named: fixture)
                } else if ProcessInfo.processInfo.arguments.contains("-qa-coupon") {
                    CouponCelebrationQAFixture(alreadyRedeemed: ProcessInfo.processInfo.arguments.contains("-qa-coupon-already"))
                } else if ProcessInfo.processInfo.arguments.contains("-trader-land-gate") {
                    TraderLandGateHarnessView()
                } else if ProcessInfo.processInfo.arguments.contains("-qa-skin") {
                    GearSkinQAFixtureView()
                } else if ProcessInfo.processInfo.arguments.contains("-qa-squad") {
                    SquadQAFixtureView()
                } else if Self.argument(after: "-qa-profile") != nil {
                    ProfileQAFixtureView()
                } else if ProcessInfo.processInfo.arguments.contains("-qa-locker") {
                    LockerQAFixtureView()
                } else if let state = Self.argument(after: "-qa-harvest") {
                    HarvestQAFixtureView(state: state)
                } else if showNucleo && !Self.launchesClassic {
                    NucleoRootView(options: Self.nucleoLaunchOptions) { showNucleo = false }
                } else {
                    ContentView()
                }
#else
                // No hidden exit in Release (App Review 2.3.1): openClassic is refused natively.
                NucleoRootView(options: Self.nucleoLaunchOptions) {}
#endif
            }
            .preferredColorScheme(.dark)
            .onAppear { if scenePhase == .active { BobbyTelemetry.shared.becameActive() } }
            .onChange(of: scenePhase) { _, phase in
                switch phase {
                case .active: BobbyTelemetry.shared.becameActive()
                case .background: BobbyTelemetry.shared.wentBackground()
                default: BobbyTelemetry.shared.becameInactive()
                }
            }
            .onReceive(NotificationCenter.default.publisher(for: AccountSession.didChange)) { _ in
                BobbyTelemetry.shared.accountChanged()
            }
            // An invitation link (1.8). The sign-in callback is not one and is left to AccountSession.
            .onOpenURL { InviteLinkCenter.shared.receive($0) }
            .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { InviteLinkCenter.shared.receive(activity: $0) }
        }
    }
}
