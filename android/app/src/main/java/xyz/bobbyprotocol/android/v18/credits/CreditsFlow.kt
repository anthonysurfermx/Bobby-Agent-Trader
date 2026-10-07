package xyz.bobbyprotocol.android.v18.credits

import xyz.bobbyprotocol.android.billing.BillingOutcome

// Credits (1.8): what the screen does, kept apart from how it is drawn so the rules can be tested.
// A port of ios/Bobby/Sources/V18/Credits/CreditsFlow.swift.
//   · Nothing is fetched and the store is not started before the risk notice is accepted.
//   · Signed out, a tap on Restore explains first; the sign-in comes when the person asks.
//   · The restore that follows a sign-in shows as running from the moment the account exists.
//   · An answer that arrives after the account changed is dropped.
// Main thread only.
class CreditsFlow(private val environment: Environment, private val onChange: () -> Unit = {}) {
    /** Everything the flow may touch. The app hands in its own; a suite hands in its own. */
    class Environment(
        /** The risk notice, read again at every step. */
        val riskAccepted: () -> Boolean,
        val signedIn: () -> Boolean,
        /** A new value is another account, or the same one signed in again. */
        val epoch: () -> Long,
        /** Re-read the balances from the server. False when nothing was read and nothing is known. */
        val load: suspend () -> Boolean,
        /** Asks Google Play for this Google account's Bobby Pro purchase. Always answers. */
        val restore: suspend () -> BillingOutcome,
        /** The caller's own work after a sign-in. */
        val afterSignIn: suspend () -> Unit = {},
    )

    var restore: CreditsRestoreState = CreditsRestoreState.Idle
        private set
    var loading: Boolean = false
        private set
    var loadFailed: Boolean = false
        private set

    /** The balances, from the server. Never before the risk notice. */
    suspend fun refresh() {
        if (!environment.riskAccepted()) return
        loading = true
        onChange()
        var known: Boolean? = null
        try {
            known = environment.load()
        } finally {
            // A screen that went away while it was reading leaves nothing spinning behind it.
            loading = false
            if (known != null) loadFailed = known == false
            onChange()
        }
    }

    /** The Restore purchases row was tapped. */
    suspend fun tapRestore() {
        if (restore == CreditsRestoreState.Running) return
        // Before the risk notice nothing starts: not the store, not a request. The line on the screen says why.
        if (!environment.riskAccepted()) return
        // Signed out: say why a sign-in is coming before it comes.
        if (!environment.signedIn()) {
            show(CreditsRestoreState.SignedOut)
            return
        }
        runRestore()
    }

    /**
     * The sign-in answered. `complete` hands its answer to the account; `thenRestore` when the
     * sign-in was asked for from the restore row.
     */
    suspend fun signIn(thenRestore: Boolean, complete: suspend () -> Unit) {
        if (!environment.riskAccepted()) return
        complete()
        if (!environment.signedIn()) return
        // The account exists: the row is at work from this moment, not two requests later.
        if (thenRestore) show(CreditsRestoreState.Running)
        val epoch = environment.epoch()
        environment.afterSignIn()
        refresh()
        if (!thenRestore) return
        if (epoch != environment.epoch()) {
            show(CreditsRestoreState.Idle)
            return
        }
        runRestore()
    }

    /** Another account (or none): the last answer was about someone else. */
    fun accountChanged() {
        if (restore != CreditsRestoreState.Running) show(CreditsRestoreState.Idle)
    }

    /**
     * Android only. The screen was closed by the person: an answer that was read is not shown again
     * the next time Credits opens (on iOS the flow ends with its sheet). A restore at work keeps going.
     */
    fun dismissAnswer() {
        if (restore != CreditsRestoreState.Running) show(CreditsRestoreState.Idle)
    }

    private suspend fun runRestore() {
        show(CreditsRestoreState.Running)
        val epoch = environment.epoch()
        var outcome: BillingOutcome? = null
        try {
            outcome = environment.restore()
        } finally {
            // A restore that was cut short (the app closing) never leaves the row at work.
            if (outcome == null) show(CreditsRestoreState.Idle)
        }
        val answered = outcome ?: return
        if (epoch != environment.epoch()) {
            show(CreditsRestoreState.Idle)
            return
        }
        // What the account has now decides the sentence (Pro by gift or by card has nothing to restore).
        refresh()
        if (epoch != environment.epoch()) {
            show(CreditsRestoreState.Idle)
            return
        }
        show(if (answered == BillingOutcome.CANCELLED) CreditsRestoreState.Idle else CreditsRestoreState.Done(answered))
    }

    private fun show(state: CreditsRestoreState) {
        if (restore == state) return
        restore = state
        onChange()
    }
}
