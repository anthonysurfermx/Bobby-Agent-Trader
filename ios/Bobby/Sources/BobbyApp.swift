// Bobby — the trading assistant. Thin native client over the live
// bobbyprotocol.xyz brain. Analysis only: no wallet, no swaps, no keys.
import SwiftUI

@main
struct BobbyApp: App {
    /// The Núcleo is the app. The classic desk sits behind a long press on the page's
    /// wordmark (`openClassic`) for the rest of this launch; the next launch returns here.
    @State private var showNucleo = true

    init() {
#if DEBUG
        Self.prepareNucleoLaunch()
#endif
    }

    private static var isUnitTestHost: Bool {
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
                } else if ProcessInfo.processInfo.arguments.contains("-trader-land-gate") {
                    TraderLandGateHarnessView()
                } else if ProcessInfo.processInfo.arguments.contains("-qa-skin") {
                    GearSkinQAFixtureView()
                } else if ProcessInfo.processInfo.arguments.contains("-qa-squad") {
                    SquadQAFixtureView()
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
                if showNucleo {
                    NucleoRootView(options: Self.nucleoLaunchOptions) { showNucleo = false }
                } else {
                    ContentView()
                }
#endif
            }
            .preferredColorScheme(.dark)
        }
    }
}
