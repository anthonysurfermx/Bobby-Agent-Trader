// Credits (1.8): what the screen does, kept apart from how it is drawn so the rules can be tested.
//   · Nothing is fetched and the store is not started before the risk notice is accepted (R11).
//   · Signed out, a tap on Restore explains first; the Apple sheet comes when the person asks.
//   · The restore that follows a sign in shows as running from the moment the account exists.
//   · An answer that arrives after the account changed is dropped.
import Foundation

@MainActor
final class CreditsFlow: ObservableObject {
    /// Everything the flow may touch. The live screen hands in the app's own; a suite hands in its own.
    struct Environment {
        /// `profile.acceptedRiskNotice`, read again at every step.
        var riskAccepted: @MainActor () -> Bool
        var signedIn: @MainActor () -> Bool
        /// `AccountSession.generation`: a new value is another account, or the same one signed in again.
        var epoch: @MainActor () -> UUID
        /// Re-read the balances from the server. False when nothing was read and nothing is known.
        var load: @MainActor () async -> Bool
        /// `BobbyProRestore.run`: asks the App Store for this Apple Account's purchases.
        var restore: @MainActor () async -> BobbyStore.Outcome
        /// The caller's own work after a sign in (the profile syncs progress).
        var afterSignIn: @MainActor () async -> Void
    }

    @Published private(set) var restore: CreditsRestoreState = .idle
    @Published private(set) var loading = false
    @Published private(set) var loadFailed = false
    private let environment: Environment

    init(_ environment: Environment) { self.environment = environment }

    /// The balances, from the server. Never before the risk notice.
    func refresh() async {
        guard environment.riskAccepted() else { return }
        loading = true
        let known = await environment.load()
        loading = false
        loadFailed = !known
    }

    /// The Restore Purchases row was tapped.
    func tapRestore() async {
        guard restore != .running else { return }
        // Before the risk notice nothing starts: not the store, not a request. The line under the row says why.
        guard environment.riskAccepted() else { return }
        // Signed out: say why an Apple sheet is coming before it comes.
        guard environment.signedIn() else { restore = .signedOut; return }
        await runRestore()
    }

    /// The Apple sheet answered. `complete` hands its answer to the account; `thenRestore` when the
    /// sign in was asked for from the restore row.
    func signIn(thenRestore: Bool, complete: @MainActor () async -> Void) async {
        guard environment.riskAccepted() else { return }
        await complete()
        guard environment.signedIn() else { return }
        // The account exists: the row is at work from this moment, not two requests later.
        if thenRestore { restore = .running }
        let epoch = environment.epoch()
        await environment.afterSignIn()
        await refresh()
        guard thenRestore else { return }
        guard epoch == environment.epoch() else { restore = .idle; return }
        await runRestore()
    }

    /// Another account (or none): the last answer was about someone else.
    func accountChanged() {
        if restore != .running { restore = .idle }
    }

    private func runRestore() async {
        restore = .running
        let epoch = environment.epoch()
        let outcome = await environment.restore()
        guard epoch == environment.epoch() else { restore = .idle; return }
        // What the account has now decides the sentence (Pro by gift or by card has nothing to restore).
        await refresh()
        guard epoch == environment.epoch() else { restore = .idle; return }
        restore = outcome == .cancelled ? .idle : .done(outcome)
    }
}

extension CreditsFlow.Environment {
    /// The app's own centres and store.
    static func live(profile: AgentProfile, afterSignIn: @escaping () async -> Void) -> CreditsFlow.Environment {
        CreditsFlow.Environment(
            riskAccepted: { profile.acceptedRiskNotice },
            signedIn: { AccountSession.shared.isSignedIn },
            epoch: { AccountSession.shared.generation },
            load: {
                CreditsPlans.attach()
                let read = await BobbyAccessCenter.shared.refresh()
                await NucleoLevelCenter.shared.refresh()
                return read || BobbyAccessCenter.shared.access != nil || NucleoLevelCenter.shared.quickAccess != nil
            },
            restore: { await BobbyProRestore.run(afterSignIn: afterSignIn) },
            afterSignIn: { await afterSignIn() })
    }
}
