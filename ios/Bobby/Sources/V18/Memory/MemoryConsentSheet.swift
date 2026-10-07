// The memory consent card (1.8). Placeholder until the feature lands; the route and the sheet are wired.
import SwiftUI

struct MemoryConsentSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void

    var body: some View {
        Color.clear
    }
}
