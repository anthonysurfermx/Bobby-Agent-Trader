// Memory: DEBUG review fixtures (`-qa-v18 <name>`). Every fixture runs on a recorded account
// ("qa-memory") with its own UserDefaults suite and a canned /api/memory reply: no network, no real
// account, nothing written to the app's own defaults.
//   memory-consent          the consent sheet, asking
//   memory-consent-failed   the consent sheet after "Remember" could not turn memory on
//   memory-consent-done     the consent sheet's confirmation line
//   memory-off              the memory screen with iPhone questions not in memory
//   memory-on               the memory screen with memory on
//   memory-deleted          the memory screen right after "Delete everything"
//   memory-offline          the memory screen when the server does not answer (the phone's part still shows)
#if DEBUG
import SwiftUI

@MainActor
enum MemoryQA {
    static var fixtures: [String: () -> AnyView] {
        [
            "memory-consent": { AnyView(MemoryConsentFixture(outcome: .asking)) },
            "memory-consent-failed": { AnyView(MemoryConsentFixture(outcome: .failed)) },
            "memory-consent-done": { AnyView(MemoryConsentFixture(outcome: .done)) },
            "memory-off": { AnyView(MemoryScreenFixture(state: .off)) },
            "memory-on": { AnyView(MemoryScreenFixture(state: .on)) },
            "memory-deleted": { AnyView(MemoryScreenFixture(state: .deleted)) },
            "memory-offline": { AnyView(MemoryScreenFixture(state: .offline)) },
        ]
    }

    static let user = "qa-memory"
    static let generation = UUID()

    static func snapshot(assets: Bool, enabled: Bool = true) -> [String: Any] {
        let rows: [[String: Any]] = assets ? [
            ["symbol": "NVDA", "asks": 5, "lastAskedAt": "2026-10-05T14:10:00.000Z", "lastHorizon": "month"],
            ["symbol": "BTC", "asks": 3, "lastAskedAt": "2026-10-02T09:30:00.000Z", "lastHorizon": "week"],
            ["symbol": "PETR4.SA", "asks": 1, "lastAskedAt": "2026-09-28T18:45:00.000Z", "lastHorizon": "unspecified"],
        ] : []
        let horizon: Any = assets ? "month" : NSNull()
        return ["enabled": enabled, "prefs": ["horizon": horizon, "experience": NSNull(), "risk": NSNull()],
                "assets": rows, "retentionDays": 90]
    }

    /// A center on its own suite: a recorded account, a canned server, two shortcuts and one thesis on "this phone".
    static func center(suite: String, online: Bool = true, seedLocal: Bool = true) -> MemoryCenter {
        let defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
        if seedLocal {
            DeskMemory.setOwner(user, defaults: defaults)
            let desk = DeskMemory(defaults: defaults)
            desk.recordQuery(symbol: "BTC", isEquity: false, now: Date(timeIntervalSince1970: 1_791_100_000))
            desk.recordQuery(symbol: "NVDA", isEquity: true, now: Date(timeIntervalSince1970: 1_791_200_000))
            _ = try? ThesisBook(defaults: defaults).create(
                ThesisDraft(symbol: "NVDA", name: "NVIDIA", isEquity: true, horizon: .months,
                            hypothesis: "Sample thesis for review screenshots."), owner: user)
        }
        let center = MemoryCenter(observeAccount: false, defaults: defaults)
        center.currentUser = { user }
        center.currentGeneration = { generation }
        center.riskAccepted = { true }
        var erased = false
        center.send = { _, method, _ in
            guard online else { throw URLError(.notConnectedToInternet) }
            if method == "DELETE" { erased = true }
            return (snapshot(assets: !erased), 200)
        }
        center.accountChanged(force: true)
        return center
    }
}

private struct MemoryConsentFixture: View {
    enum Outcome { case asking, failed, done }
    let outcome: Outcome
    @StateObject private var model: MemoryConsentModel

    init(outcome: Outcome) {
        self.outcome = outcome
        // "failed": the canned server does not answer, so "Remember" stops at its first step.
        let center = MemoryQA.center(suite: "qa.v18.memory.consent", online: outcome != .failed, seedLocal: false)
        let consent = MemoryConsent(defaults: UserDefaults(suiteName: "qa.v18.memory.consent") ?? .standard)
        _model = StateObject(wrappedValue: MemoryConsentModel(center: center, consent: consent))
    }

    var body: some View {
        // Drawn full height (the app presents it at the medium detent, where it scrolls).
        MemoryConsentSheet(model: model, onClose: {})
            .task {
                guard outcome != .asking else { return }
                await model.remember()
            }
    }
}

private struct MemoryScreenFixture: View {
    enum Screen { case off, on, deleted, offline }
    let state: Screen
    @StateObject private var center: MemoryCenter

    init(state: Screen) {
        self.state = state
        _center = StateObject(wrappedValue: MemoryQA.center(suite: "qa.v18.memory.screen", online: state != .offline))
    }

    var body: some View {
        MemoryView(center: center, riskAccepted: true, onClose: {})
            .task {
                switch state {
                case .off, .offline:
                    break
                case .on:
                    await center.refresh()
                    _ = center.setNativeCapture(true)
                case .deleted:
                    await center.refresh()
                    _ = center.setNativeCapture(true)
                    center.requestForgetAll()
                    await center.confirmForgetAll()
                }
            }
    }
}
#endif
