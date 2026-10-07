// DEBUG-only review fixtures for the 1.8 screens: `-qa-v18 <name>` shows one screen with recorded
// state, no network and no account, for design review and UI suites. Each feature lists its own
// fixtures in its own file; nothing here exists in a Release build (App Review 2.3.1).
#if DEBUG
import SwiftUI

@MainActor
enum V18QA {
    /// name → screen. Names are `<feature>-<state>`, for example `credits-free` or `theses-three`.
    static var fixtures: [String: () -> AnyView] {
        var all: [String: () -> AnyView] = [:]
        for table in [CreditsQA.fixtures, MemoryQA.fixtures, ThesesQA.fixtures, RemindersQA.fixtures, InviteQA.fixtures] {
            all.merge(table) { first, _ in first }
        }
        return all
    }

    static func view(named name: String) -> AnyView {
        fixtures[name]?() ?? AnyView(
            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Unknown 1.8 fixture: \(name)").foregroundStyle(Theme.cream)
                    ForEach(fixtures.keys.sorted(), id: \.self) { Text($0).font(.mono(12)).foregroundStyle(Theme.warmMuted) }
                }
                .padding(24)
            }
            .background(Theme.bg))
    }
}
#endif
