// Bobby — the trading assistant. Thin native client over the live
// bobbyprotocol.xyz brain. Wallets sign externally; Bobby stores no keys.
import SwiftUI

@main
struct BobbyApp: App {
    init() { WalletBridge.configure() }

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
            .onOpenURL { WalletBridge.shared.handleDeepLink($0) }
        }
    }
}
