// Bobby — the trading assistant. Thin, beautiful client over the live
// bobbyprotocol.xyz brain. No keys on device; all intelligence server-side.
import SwiftUI

@main
struct BobbyApp: App {
    var body: some Scene {
        WindowGroup {
            Group {
#if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-trader-land-gate") {
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
