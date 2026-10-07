package xyz.bobbyprotocol.android.v18.credits

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.billing.BillingOfferingsStatus
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench

/**
 * Credits as the Android app runs it: the centre between the host, the server's reply and the
 * screen. On iOS this is the work of BobbyAccessCenter, NucleoLevelCenter and the live CreditsSheet,
 * none of which exist here, so these cases are Android's own: what is read and when, whose reply it
 * is, and how the screen comes back after a sign-in (the activity closes the sheet when the account
 * arrives).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CreditsCenterTest {
    private val now = at("2026-10-07T12:00:00Z")

    private class Fixture(val bench: V18TestBench, val backend: FakeCreditsBackend, val center: CreditsCenter)

    private fun TestScope.fixture(owner: String? = "u1", register: Boolean = true): Fixture {
        val bench = V18TestBench(backgroundScope)
        bench.clock = now
        if (owner != null) bench.changeAccount(owner)
        val backend = FakeCreditsBackend()
        val center = CreditsCenter.of(bench.host, backend)
        if (register) {
            CreditsNudges.register(bench.host, center)
            runCurrent()
        }
        return Fixture(bench, backend, center)
    }

    private fun done(outcome: BillingOutcome): CreditsRestoreState = CreditsRestoreState.Done(outcome)

    // What is read, and when

    @Test fun nothingIsReadAndNoSignInStartsBeforeTheRiskNotice() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        val backend = FakeCreditsBackend()
        backend.reply = FakeCreditsBackend.reply()
        val center = CreditsCenter.of(bench.host, backend)
        CreditsNudges.register(bench.host, center)
        runCurrent()
        bench.host.appBecameActive()
        runCurrent()
        assertFalse(center.load())
        center.flow.refresh()
        center.flow.tapRestore()
        center.signIn("google", thenRestore = true)
        assertEquals("no request before the notice", 0, backend.gets)
        assertEquals(0, bench.shell.restores)
        assertTrue("and no browser tab", bench.shell.signIns.isEmpty())
        assertFalse(center.back.isPending)
        assertNull(center.snapshot().access)

        // An outdated notice is not an accepted one either.
        bench.desk.riskNotice = RiskNotice.OUTDATED
        center.refreshSoon()
        runCurrent()
        assertEquals(0, backend.gets)

        bench.desk.riskNotice = RiskNotice.ACCEPTED
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("the first return to the front after the notice reads the balances", 1, backend.gets)
    }

    @Test fun theSnapshotIsWhatTheServerSaidAboutTheReaderWhoIsHere() = runTest {
        val set = fixture(register = false)
        set.backend.reply = FakeCreditsBackend.reply(remaining = 7, quick = 3)
            .put("referral", JSONObject().put("code", "ABCD2345").put("url", "https://bobbyprotocol.xyz/i/ABCD2345").put("accepted", 2).put("max", 5).put("rewardDays", 21))
            .put("subscription", JSONObject.NULL)
            .put("payments", JSONObject().put("google", true).put("revenuecat", true))
            .put("purchaseReservationVersion", 1)
        assertFalse(set.center.loaded)
        assertNull("nothing known yet is nothing shown", set.center.snapshot().access)
        assertTrue(set.center.load())
        assertTrue(set.center.loaded)
        val snapshot = set.center.snapshot()
        assertEquals(ReadAccess("free", 3, 10, 7, "2026-10-09T12:00:00Z", true, 3), snapshot.access)
        assertEquals(setOf(CreditsLevel.PROFUNDO, CreditsLevel.MAXIMO), snapshot.meters.keys)
        assertEquals("ABCD2345", snapshot.referral?.code)
        assertNull(snapshot.subscription)
        assertTrue(snapshot.signedIn)
        assertEquals(10, snapshot.freeReadsPerWeek)
        assertEquals("the account's own terms come before the plan's", 21, snapshot.rewardDays)
        assertEquals(5, snapshot.maxFriends)
        assertTrue("the server sells Bobby Pro through Google Play and this build can ask the store", snapshot.proPurchasable)

        assertTrue("and a restore can restore", set.center.restoreAvailable)

        // A build without the store's key can neither sell nor restore: no Pro promise, no restore row.
        set.bench.shell.billing.value = BillingState(offeringsStatus = BillingOfferingsStatus.NOT_CONFIGURED)
        assertFalse(set.center.storeConfigured)
        assertFalse(set.center.snapshot().proPurchasable)
        assertFalse("a restore that cannot restore is never shown", set.center.restoreAvailable)
        set.bench.shell.billing.value = BillingState()
        assertTrue(set.center.storeConfigured)
        assertTrue(set.center.restoreAvailable)

        // What the app read since (another screen's balance, a redeemed code) is the newest word on the meters.
        set.backend.held = FakeCreditsBackend.held("u1", set.bench.desk.accountEpoch, remaining = 2, deep = 4)
        assertEquals(2, set.center.snapshot().access?.remaining)
        assertEquals(4, set.center.snapshot().meters[CreditsLevel.PROFUNDO]?.bonus)
        assertEquals("the invitation still comes from the reply", "ABCD2345", set.center.snapshot().referral?.code)

        // Another reader: the previous one's reply and meters describe nobody who is here.
        set.bench.changeAccount("u2")
        val other = set.center.snapshot()
        assertNull(other.access)
        assertTrue(other.meters.isEmpty())
        assertNull(other.referral)
        assertFalse(set.center.loaded)
        assertEquals("the plan's terms are the same for everyone", 10, other.freeReadsPerWeek)
        assertTrue("until the server has spoken about this reader, the row is there to be asked", set.center.restoreAvailable)

        // The server says it cannot confirm store purchases right now: restore could not restore, so it is not offered.
        set.backend.reply = FakeCreditsBackend.reply().put("payments", JSONObject().put("stripe", true).put("revenuecat", false))
        assertTrue(set.center.load())
        assertFalse(set.center.restoreAvailable)
        assertFalse(set.center.snapshot().proPurchasable)
    }

    @Test fun aRequestThatFailsWithNothingKnownIsSaidAndOneWithSomethingKnownIsNot() = runTest {
        val set = fixture(register = false)
        assertFalse("offline and nothing held", set.center.load())
        set.center.flow.refresh()
        assertTrue(set.center.flow.loadFailed)
        assertFalse(set.center.flow.loading)

        set.backend.held = FakeCreditsBackend.held("u1", set.bench.desk.accountEpoch, remaining = 4)
        assertTrue("offline, but the app already holds this reader's meters", set.center.load())
        set.center.flow.refresh()
        assertFalse(set.center.flow.loadFailed)
        assertEquals(4, set.center.snapshot().access?.remaining)
    }

    @Test fun aReplyForAReaderWhoLeftIsDropped() = runTest {
        val set = fixture(register = false)
        set.backend.reply = FakeCreditsBackend.reply(remaining = 7)
        set.backend.during = {
            set.backend.during = {}
            set.bench.changeAccount("u2")
        }
        assertFalse("the answer was about the account that asked", set.center.load())
        assertNull(set.center.snapshot().access)
        assertFalse(set.center.loaded)
    }

    @Test fun aDeliveredReadAndAReturnToTheFrontAskTheServerAgainAndTheGlassHearsWhatChanged() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.clock = now
        bench.changeAccount("u1")
        val backend = FakeCreditsBackend()
        backend.reply = FakeCreditsBackend.reply(remaining = 5)
        val center = CreditsCenter.of(bench.host, backend)
        CreditsNudges.register(bench.host, center)
        runCurrent()
        assertEquals("once at the start, when the notice is accepted", 1, backend.gets)
        assertNull("five left is not low", bench.host.currentNudge())

        // A read moves the meter: the phone asks what is left (the request costs no read).
        backend.reply = FakeCreditsBackend.reply(remaining = 1)
        val told = bench.desk.sessionChanges
        bench.deliver()
        runCurrent()
        assertEquals(2, backend.gets)
        assertTrue("the page is told a line may have appeared", bench.desk.sessionChanges >= told + 2)
        assertEquals("credits.low.2026-w41", bench.host.currentNudge()?.id)
        assertEquals("1 read left this week", bench.host.currentNudge()?.text)

        // Coming back to the front does not ask again while what is held is fresh.
        bench.host.appBecameActive()
        runCurrent()
        assertEquals(2, backend.gets)
        bench.clock += CreditsCenter.FRESH_FOR
        bench.host.appBecameActive()
        runCurrent()
        assertEquals(3, backend.gets)

        // The same answer again changes nothing on the glass, so the page is not told.
        val quiet = bench.desk.sessionChanges
        bench.clock += CreditsCenter.FRESH_FOR
        bench.host.appBecameActive()
        runCurrent()
        assertEquals(4, backend.gets)
        assertEquals(quiet, bench.desk.sessionChanges)
    }

    @Test fun theGiftedBalanceOnScreenIsAcknowledgedOnlyOnceItIsKnown() = runTest {
        val set = fixture()
        set.center.acknowledgeGifts()
        set.backend.publish(FakeCreditsBackend.held("u1", set.bench.desk.accountEpoch, deep = 5))
        runCurrent()
        assertEquals(5, set.center.book.ledger.announce)
        assertEquals("credits.gift.5", set.bench.host.currentNudge()?.id)
        // The Credits screen shows the balance.
        set.center.acknowledgeGifts()
        assertNull(set.center.book.ledger.announce)
        assertNull("the glass has no reason to announce it again", set.bench.host.currentNudge())
    }

    // Restore

    @Test fun signedInRestoreAsksTheStoreAndKeepsItsAnswerUntilTheScreenIsClosed() = runTest {
        val set = fixture()
        set.backend.reply = FakeCreditsBackend.reply()
        set.bench.shell.restoreOutcome = BillingOutcome.NOTHING_TO_RESTORE
        set.bench.host.present(V18Routes.CREDITS)
        set.center.flow.tapRestore()
        assertEquals(1, set.bench.shell.restores)
        assertEquals(done(BillingOutcome.NOTHING_TO_RESTORE), set.center.flow.restore)
        val words = TwoWords()
        val pro = CreditsProStatus.make(set.center.snapshot(), set.bench.clock)
        assertEquals("No Bobby Pro purchase on this Google Play account.", CreditsRestoreNotice.make(set.center.flow.restore, pro, words)?.text)

        // The person closes Credits: the answer was read, the next opening starts clean.
        set.bench.closeSheet()
        set.center.screenGone()
        assertEquals(CreditsRestoreState.Idle, set.center.flow.restore)
    }

    @Test fun aBusyStoreIsAskedAgainBeforeThatBecomesTheAnswer() = runTest {
        val set = fixture()
        set.bench.shell.restoreOutcome = BillingOutcome.BUSY
        val first = launch { set.center.flow.tapRestore() }
        runCurrent()
        assertEquals("the store is linking the account that just signed in", 1, set.bench.shell.restores)
        assertEquals(CreditsRestoreState.Running, set.center.flow.restore)
        set.bench.shell.restoreOutcome = BillingOutcome.SUBSCRIBED
        advanceTimeBy(CreditsCenter.BUSY_WAIT)
        runCurrent()
        first.join()
        assertEquals(2, set.bench.shell.restores)
        assertEquals(done(BillingOutcome.SUBSCRIBED), set.center.flow.restore)

        // A store that never frees up is an answer too, with a way to ask again.
        set.bench.shell.restoreOutcome = BillingOutcome.BUSY
        val second = launch { set.center.flow.tapRestore() }
        runCurrent()
        advanceTimeBy(CreditsCenter.BUSY_WAIT * (CreditsCenter.BUSY_TRIES + 1))
        runCurrent()
        second.join()
        assertEquals(done(BillingOutcome.BUSY), set.center.flow.restore)
        assertEquals(2 + 1 + CreditsCenter.BUSY_TRIES, set.bench.shell.restores)
        val notice = CreditsRestoreNotice.make(set.center.flow.restore, CreditsProStatus(), TwoWords())
        assertEquals(CreditsRestoreNotice.Action.TRY_AGAIN, notice?.action)
    }

    // Signing in from Credits (the activity closes the sheet when the account arrives)

    @Test fun signingInFromTheRestoreRowRestoresAndBringsCreditsBackWithTheAnswer() = runTest {
        val set = fixture(owner = null)
        set.backend.reply = FakeCreditsBackend.reply()
        set.bench.shell.restoreOutcome = BillingOutcome.SUBSCRIBED
        assertTrue(set.bench.host.present(V18Routes.CREDITS))
        set.center.flow.tapRestore()
        assertEquals("signed out, the row explains before any sign-in", CreditsRestoreState.SignedOut, set.center.flow.restore)
        assertEquals(0, set.bench.shell.restores)

        set.center.signIn("google", thenRestore = true)
        assertEquals(listOf("google"), set.bench.shell.signIns)
        assertTrue(set.center.back.isPending)

        // The account arrives while Credits is still on screen.
        val gets = set.backend.gets
        set.bench.changeAccount("u1")
        runCurrent()
        assertEquals("the restore the person asked for ran for the account that arrived", 1, set.bench.shell.restores)
        assertEquals(done(BillingOutcome.SUBSCRIBED), set.center.flow.restore)
        assertTrue("and the account's balances were read", set.backend.gets > gets)

        // The activity takes the sheet away; the answer has not been read yet.
        set.bench.closeSheet()
        set.center.screenGone()
        assertEquals("a result, every time, that stays", done(BillingOutcome.SUBSCRIBED), set.center.flow.restore)
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals("Credits comes back with it", listOf(V18Routes.CREDITS, V18Routes.CREDITS), set.bench.shell.opened)
        assertEquals(done(BillingOutcome.SUBSCRIBED), set.center.flow.restore)
        assertFalse(set.center.back.isPending)

        // Read, then closed by the person.
        set.bench.closeSheet()
        set.center.screenGone()
        assertEquals(CreditsRestoreState.Idle, set.center.flow.restore)
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals("and it does not come back by itself", 2, set.bench.shell.opened.size)
    }

    @Test fun signingInFromTheBalanceLinesBringsCreditsBackWithoutRestoring() = runTest {
        val set = fixture(owner = null)
        set.backend.reply = FakeCreditsBackend.reply()
        set.bench.host.present(V18Routes.CREDITS)
        set.center.signIn("apple", thenRestore = false)
        assertEquals(listOf("apple"), set.bench.shell.signIns)
        set.bench.changeAccount("u1")
        runCurrent()
        assertEquals("nobody asked for a restore", 0, set.bench.shell.restores)
        assertEquals(CreditsRestoreState.Idle, set.center.flow.restore)
        set.bench.closeSheet()
        set.center.screenGone()
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals(listOf(V18Routes.CREDITS, V18Routes.CREDITS), set.bench.shell.opened)
        assertEquals("with the account's own balances", 10, set.center.snapshot().access?.remaining)
    }

    @Test fun closingCreditsBeforeTheAccountArrivesForgetsTheSignInItStarted() = runTest {
        val set = fixture(owner = null)
        set.backend.reply = FakeCreditsBackend.reply()
        set.bench.shell.restoreOutcome = BillingOutcome.SUBSCRIBED
        set.bench.host.present(V18Routes.CREDITS)
        set.center.flow.tapRestore()
        set.center.signIn("google", thenRestore = true)
        // The person comes back from the browser without an account and closes Credits.
        set.bench.closeSheet()
        set.center.screenGone()
        assertFalse(set.center.back.isPending)
        assertEquals("the explanation goes with the screen", CreditsRestoreState.Idle, set.center.flow.restore)

        // Much later they sign in from the profile: Credits does not appear, and nothing is restored for them.
        set.bench.changeAccount("u1")
        runCurrent()
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals(0, set.bench.shell.restores)
        assertEquals(listOf(V18Routes.CREDITS), set.bench.shell.opened)
        assertEquals(CreditsRestoreState.Idle, set.center.flow.restore)
    }

    @Test fun anAccountThatIsDeletedTakesItsGiftLedgerWithIt() = runTest {
        val set = fixture()
        set.backend.publish(FakeCreditsBackend.held("u1", set.bench.desk.accountEpoch, quick = 3))
        runCurrent()
        assertEquals("u1", CreditsGiftLedger.load(set.bench.store).owner)
        set.bench.host.accountDeleted("someone-else")
        assertEquals("u1", CreditsGiftLedger.load(set.bench.store).owner)
        set.bench.host.accountDeleted("u1")
        assertEquals(CreditsGiftLedger(), CreditsGiftLedger.load(set.bench.store))
        assertEquals(CreditsGiftLedger(), set.center.book.ledger)
    }
}
