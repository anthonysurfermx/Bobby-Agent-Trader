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
