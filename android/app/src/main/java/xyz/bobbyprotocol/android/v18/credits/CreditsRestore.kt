package xyz.bobbyprotocol.android.v18.credits

import xyz.bobbyprotocol.android.billing.BillingOutcome

// Restore purchases, in words (1.8). A port of ios/Bobby/Sources/V18/Credits/CreditsRestore.swift.
// The outcome is a sentence with a next step under the row, never a dialog, and it stays on screen.
// The store call itself is the app's own (BillingCoordinator.restore, through `host.restorePurchases`):
// it looks for a Bobby Pro subscription bought with this Google Play account and attaches it to this
// Bobby account. This file only decides what the person reads (CreditsFlow decides when the store
// may be asked). It also knows what the account already has, so a person who is on Bobby Pro by a
// gift or by a card plan is not told "no purchase".

/** Where the restore row is. */
sealed class CreditsRestoreState {
    object Idle : CreditsRestoreState()
    object Running : CreditsRestoreState()
    /** Nobody is signed in: explain first, the sign-in comes after the person asks for it. */
    object SignedOut : CreditsRestoreState()
    data class Done(val outcome: BillingOutcome) : CreditsRestoreState()
}

data class CreditsRestoreNotice(
    val kind: Kind,
    val text: String,
    val action: Action?,
    val more: More? = null,
) {
    enum class Kind { RESTORED, NOTHING_TO_RESTORE, ALREADY_PRO, NEEDS_SIGN_IN, PENDING, CANCELLED, FAILED }

    enum class Action {
        /** Sign in, then the restore runs. */
        SIGN_IN,
        TRY_AGAIN,
    }

    /** A next step that stays folded under the result ("Used another Google Play account?"). */
    data class More(val title: String, val text: String)

    companion object {
        /** The line shown while the risk notice is not accepted (the store starts only after it). */
        fun beforeRiskNotice(words: Words): String = words.text("Accept the risk notice first.", "Acepta primero el aviso de riesgo.")

        /** What to show under the row; null while idle or running. Every ending has a line. */
        fun make(state: CreditsRestoreState, pro: CreditsProStatus, words: Words): CreditsRestoreNotice? = when (state) {
            CreditsRestoreState.Idle, CreditsRestoreState.Running -> null
            CreditsRestoreState.SignedOut -> needsSignIn(words)
            is CreditsRestoreState.Done -> when (state.outcome) {
                BillingOutcome.NEEDS_SIGN_IN -> needsSignIn(words)
                BillingOutcome.SUBSCRIBED -> CreditsRestoreNotice(Kind.RESTORED, words.text("Restored. Bobby Pro is active.", "Restaurado. Bobby Pro está activo."), null)
                BillingOutcome.PENDING -> CreditsRestoreNotice(Kind.PENDING, words.text("Awaiting Google Play confirmation.", "Pendiente de confirmación de Google Play."), null)
                BillingOutcome.CANCELLED -> CreditsRestoreNotice(Kind.CANCELLED, words.text("Restore cancelled.", "Restauración cancelada."), null)
                BillingOutcome.NOTHING_TO_RESTORE ->
                    // Google Play had nothing for this Google account. An account that is on Bobby Pro by a
                    // gift or a card plan is told it still is (its source is on the Bobby Pro row above).
                    if (pro.isPro) {
                        CreditsRestoreNotice(Kind.ALREADY_PRO, words.text("Bobby Pro remains active. No additional Google Play purchase found.",
                                                                          "Bobby Pro sigue activo. Sin otra compra de Google Play."), null)
                    } else {
                        CreditsRestoreNotice(Kind.NOTHING_TO_RESTORE,
                                             words.text("No Bobby Pro purchase on this Google Play account.", "Sin compra de Bobby Pro en esta cuenta de Google Play."), null,
                                             More(words.text("Used another Google Play account?", "¿Usaste otra cuenta de Google Play?"),
                                                  words.text("Use that Google Play account on this phone; retry.", "Usa esa cuenta de Google Play en este teléfono; reintenta.")))
                    }
                BillingOutcome.ALREADY_SUBSCRIBED ->
                    // Android only. The account's plan comes from somewhere else (a card, an iPhone), so
                    // Google Play was not asked: the line says what is true and does not claim a search.
                    if (pro.isPro) CreditsRestoreNotice(Kind.ALREADY_PRO, words.text("Bobby Pro is active.", "Bobby Pro está activo."), null)
                    else failed(words)
                // The store or Bobby's servers could not answer (no connection, the store busy with
                // another request, restore closed for this account): one sentence and a way to ask again.
                BillingOutcome.FAILED, BillingOutcome.UNAVAILABLE, BillingOutcome.BUSY -> failed(words)
            }
        }

        private fun needsSignIn(words: Words): CreditsRestoreNotice =
            CreditsRestoreNotice(Kind.NEEDS_SIGN_IN, words.text("Sign in to restore.", "Inicia sesión para restaurar."), Action.SIGN_IN)

        private fun failed(words: Words): CreditsRestoreNotice = CreditsRestoreNotice(Kind.FAILED,
            words.text("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.",
                       "Bobby no pudo confirmar tu suscripción ahora. Toca Restaurar compras en un momento."), Action.TRY_AGAIN)
    }
}
