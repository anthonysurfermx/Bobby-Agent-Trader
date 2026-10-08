package xyz.bobbyprotocol.android.v18.credits

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.v18.credits.CreditsBalance.Line.Kind
import xyz.bobbyprotocol.android.v18.credits.CreditsRestoreNotice.Action
import java.time.ZoneOffset
import java.util.Locale

/**
 * Restore purchases, in words (1.8). The cases of ios/Bobby/Tests/CreditsRestoreTests.swift: the
 * answer under the row is a sentence with a next step, and an account that is on Bobby Pro by a
 * gift or by a card plan is never told it has no subscription. On Android the store is Google Play,
 * and the store can also answer without having been asked (a plan from elsewhere, a busy store).
 */
class CreditsRestoreTest {
    private val now = at("2026-10-07T12:00:00Z")
    private val proAccess = ReadAccess("pro", 9, null, null, null, true)
    private val freeAccess = ReadAccess("free", 3, 10, 7, null, true)

    private fun referral(proUntil: String, source: String): Referral = Referral.fromJson(JSONObject()
        .put("code", "ABCDEFGH").put("url", "https://bobbyprotocol.xyz/desk?ref=ABCDEFGH&v=2").put("accepted", 2).put("max", 5)
        .put("rewardDays", 30).put("proUntil", proUntil).put("proSource", source))!!

    private fun done(outcome: BillingOutcome): CreditsRestoreState = CreditsRestoreState.Done(outcome)

    private fun notice(state: CreditsRestoreState, snapshot: CreditsSnapshot, spanish: Boolean = false): CreditsRestoreNotice? =
        CreditsRestoreNotice.make(state, CreditsProStatus.make(snapshot, now), TwoWords(spanish))

    @Test fun nothingToRestoreForAnAccountThatIsNotProGivesANextStep() {
        val account = CreditsSnapshot(access = freeAccess, proPurchasable = true, signedIn = true)
        val en = notice(done(BillingOutcome.NOTHING_TO_RESTORE), account)!!
        assertEquals(CreditsRestoreNotice.Kind.NOTHING_TO_RESTORE, en.kind)
        assertEquals("No Bobby Pro purchase on this Google Play account.", en.text)
        assertNull("the result is not a place to sell", en.action)
        assertEquals("the next step is one tap under the result",
                     CreditsRestoreNotice.More("Used another Google Play account?", "Use that Google Play account on this phone; retry."), en.more)
        val es = notice(done(BillingOutcome.NOTHING_TO_RESTORE), account, spanish = true)!!
        assertEquals("Sin compra de Bobby Pro en esta cuenta de Google Play.", es.text)
        assertEquals("¿Usaste otra cuenta de Google Play?", es.more?.title)
        assertEquals("Usa esa cuenta de Google Play en este teléfono; reintenta.", es.more?.text)
    }

    @Test fun anAccountThatIsProForAnyReasonIsToldItStillIsNeverThatItHasNothing() {
        val invited = CreditsSnapshot(access = proAccess, referral = referral("2026-11-12T12:00:00Z", "referral"), proPurchasable = true, signedIn = true)
        val fromBobby = CreditsSnapshot(access = proAccess, referral = referral("2026-11-12T12:00:00Z", "admin"), signedIn = true)
        val card = CreditsSnapshot(access = proAccess, subscription = Subscription("stripe", "active", null), proPurchasable = true, signedIn = true)
        val store = CreditsSnapshot(access = proAccess, subscription = Subscription("google", "active", "2026-10-27T12:00:00Z"), proPurchasable = true, signedIn = true)
        val unknownReason = CreditsSnapshot(access = proAccess, proPurchasable = true, signedIn = true)
        for (account in listOf(invited, fromBobby, card, store, unknownReason)) {
            val en = notice(done(BillingOutcome.NOTHING_TO_RESTORE), account)!!
            assertEquals(CreditsRestoreNotice.Kind.ALREADY_PRO, en.kind)
            assertEquals("Bobby Pro remains active. No additional Google Play purchase found.", en.text)
            assertNull(en.action)
            assertNull(en.more)
            assertEquals("Bobby Pro sigue activo. Sin otra compra de Google Play.", notice(done(BillingOutcome.NOTHING_TO_RESTORE), account, spanish = true)?.text)
        }
        // Where the plan comes from is on the Bobby Pro row, not repeated in the result.
        val row = CreditsBalance.make(invited, CreditsCopy(TwoWords(), now, Locale.US, ZoneOffset.UTC)).line(Kind.PRO)
        assertEquals("Gifted until Nov 12", row?.face)
    }

    @Test fun everyEndingHasItsLineAndItsNextStep() {
        val account = CreditsSnapshot(access = freeAccess, proPurchasable = true, signedIn = true)
        val restored = notice(done(BillingOutcome.SUBSCRIBED), account)!!
        assertEquals(CreditsRestoreNotice.Kind.RESTORED, restored.kind)
        assertEquals("Restored. Bobby Pro is active.", restored.text)
        assertNull(restored.action)
        assertEquals("Restaurado. Bobby Pro está activo.", notice(done(BillingOutcome.SUBSCRIBED), account, spanish = true)?.text)

        val pending = notice(done(BillingOutcome.PENDING), account)!!
        assertEquals(CreditsRestoreNotice.Kind.PENDING, pending.kind)
        assertEquals("Awaiting Google Play confirmation.", pending.text)
        assertNull(pending.action)
        assertEquals("Pendiente de confirmación de Google Play.", notice(done(BillingOutcome.PENDING), account, spanish = true)?.text)

        val failed = notice(done(BillingOutcome.FAILED), account)!!
        assertEquals(CreditsRestoreNotice.Kind.FAILED, failed.kind)
        assertEquals("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.", failed.text)
        assertEquals(Action.TRY_AGAIN, failed.action)
        assertEquals("Bobby no pudo confirmar tu suscripción ahora. Toca Restaurar compras en un momento.", notice(done(BillingOutcome.FAILED), account, spanish = true)?.text)

        for (state in listOf(CreditsRestoreState.SignedOut, done(BillingOutcome.NEEDS_SIGN_IN))) {
            val signIn = notice(state, CreditsSnapshot(access = null, signedIn = false))!!
            assertEquals(CreditsRestoreNotice.Kind.NEEDS_SIGN_IN, signIn.kind)
            assertEquals("Sign in to restore.", signIn.text)
            assertEquals("the line comes with the buttons, before any browser tab", Action.SIGN_IN, signIn.action)
        }
        assertEquals("Inicia sesión para restaurar.", notice(CreditsRestoreState.SignedOut, CreditsSnapshot(access = null), spanish = true)?.text)

        val cancelled = notice(done(BillingOutcome.CANCELLED), account)!!
        assertEquals("a cancelled restore is an ending too", CreditsRestoreNotice.Kind.CANCELLED, cancelled.kind)
        assertEquals("Restore cancelled.", cancelled.text)
        assertEquals("Restauración cancelada.", notice(done(BillingOutcome.CANCELLED), account, spanish = true)?.text)

        assertNull(notice(CreditsRestoreState.Idle, account))
        assertNull(notice(CreditsRestoreState.Running, account))
    }

    /** Android only: outcomes the Google Play store has and the App Store does not. */
    @Test fun whenGooglePlayWasNotAskedTheLineNeverClaimsASearch() {
        val free = CreditsSnapshot(access = freeAccess, proPurchasable = true, signedIn = true)
        val card = CreditsSnapshot(access = proAccess, subscription = Subscription("stripe", "active", null), signedIn = true)
        val iphone = CreditsSnapshot(access = proAccess, subscription = Subscription("apple", "active", "2026-10-27T12:00:00Z"), signedIn = true)
        for (account in listOf(card, iphone)) {
            // The plan is billed somewhere else, so the store refused to look: say what is true and no more.
            val elsewhere = notice(done(BillingOutcome.ALREADY_SUBSCRIBED), account)!!
            assertEquals(CreditsRestoreNotice.Kind.ALREADY_PRO, elsewhere.kind)
            assertEquals("Bobby Pro is active.", elsewhere.text)
            assertTrue("no purchase was looked for, so none is reported missing", !elsewhere.text.contains("Google Play"))
            assertNull(elsewhere.action)
            assertNull(elsewhere.more)
            assertEquals("Bobby Pro está activo.", notice(done(BillingOutcome.ALREADY_SUBSCRIBED), account, spanish = true)?.text)
        }
        assertEquals("an account that is not Pro is never told it is", CreditsRestoreNotice.Kind.FAILED, notice(done(BillingOutcome.ALREADY_SUBSCRIBED), free)?.kind)

        for (outcome in listOf(BillingOutcome.UNAVAILABLE, BillingOutcome.BUSY)) {
            for (account in listOf(free, card)) {
                val unanswered = notice(done(outcome), account)!!
                assertEquals("$outcome", CreditsRestoreNotice.Kind.FAILED, unanswered.kind)
                assertEquals("a way to ask again, never a verdict nobody gave", Action.TRY_AGAIN, unanswered.action)
                assertTrue(!unanswered.text.contains("No Bobby Pro purchase"))
            }
        }
        // Every outcome the store can give has a line, or is deliberately silent.
        for (outcome in BillingOutcome.entries) {
            val line = notice(done(outcome), free)
            assertTrue("$outcome", line != null && line.text.isNotBlank())
        }
    }

    @Test fun everyResultIsOneShortLineInSixLanguages() {
        val fixed = listOf("Sign in to restore.", "Restored. Bobby Pro is active.", "Awaiting Google Play confirmation.", "Restore cancelled.",
                           "Bobby Pro remains active. No additional Google Play purchase found.", "No Bobby Pro purchase on this Google Play account.",
                           "Used another Google Play account?", "Use that Google Play account on this phone; retry.", "Accept the risk notice first.",
                           "Bobby Pro is active.")
        for (key in fixed) {
            val row = V18Catalog.row(key)
            assertEquals(key, V18Catalog.LANGUAGES.toSet(), row.keys)
            for ((language, text) in row) assertTrue("$language: $text", text.length <= 70)
        }
        // The one sentence that is longer says what to do next; it exists in the four languages too.
        assertEquals(V18Catalog.LANGUAGES.toSet(), V18Catalog.row("Bobby couldn’t confirm your subscription right now. Tap Restore Purchases in a moment.").keys)
    }

    @Test fun beforeTheRiskNoticeTheScreenSaysWhatComesFirst() {
        assertEquals("Accept the risk notice first.", CreditsRestoreNotice.beforeRiskNotice(TwoWords()))
        assertEquals("Acepta primero el aviso de riesgo.", CreditsRestoreNotice.beforeRiskNotice(TwoWords(spanish = true)))
    }
}
