// Bobby — the trading assistant. Thin native client over the live
// bobbyprotocol.xyz brain. Analysis only: no wallet, no swaps, no keys.
import SwiftUI

@main
struct BobbyApp: App {
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
    private static func argument(after flag: String) -> String? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: flag) else { return nil }
        return args.indices.contains(i + 1) && !args[i + 1].hasPrefix("-") ? args[i + 1] : "all"
    }
#endif

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
                } else {
                    ContentView()
                }
#else
                ContentView()
#endif
            }
            .preferredColorScheme(.dark)
        }
    }
}
