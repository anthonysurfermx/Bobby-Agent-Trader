package xyz.bobbyprotocol.android.v18.credits

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.billing.BillingOutcome

/**
 * Credits (1.8): the rules of the screen, apart from how it is drawn. The cases of
 * ios/Bobby/Tests/CreditsFlowTests.swift. Nothing is fetched and the store is not started before
 * the risk notice; signed out, Restore explains before any sign-in; after the sign-in the restore
 * runs and shows as running at once; an answer that arrives for a previous account is dropped.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CreditsFlowTest {
    private var riskAccepted = true
    private var signedIn = true
    private var epoch = 1L
    private var known = true
    private var outcome = BillingOutcome.SUBSCRIBED
    /** What the flow asked for, in order. */
    private val calls = ArrayList<String>()
    /** Runs inside the store call, while the flow is waiting for it. */
    private var duringRestore: () -> Unit = {}
    private var duringLoad: () -> Unit = {}
    /** When set, the store call stays open until it is completed. */
    private var gate: CompletableDeferred<Unit>? = null
    private var changes = 0

    private fun newFlow(): CreditsFlow = CreditsFlow(CreditsFlow.Environment(
        riskAccepted = { riskAccepted },
        signedIn = { signedIn },
        epoch = { epoch },
        load = {
            calls.add("load")
            duringLoad()
            known
        },
        restore = {
            calls.add("restore")
            duringRestore()
            gate?.await()
            outcome
        },
        afterSignIn = { calls.add("afterSignIn") },
    ), onChange = { changes += 1 })

    private fun done(outcome: BillingOutcome): CreditsRestoreState = CreditsRestoreState.Done(outcome)

    // Before the risk notice

    @Test fun beforeTheRiskNoticeNothingIsFetchedAndTheStoreIsNotStarted() = runTest {
        riskAccepted = false
        val flow = newFlow()
        flow.refresh()
        assertEquals("no request before the notice", emptyList<String>(), calls)
        assertFalse(flow.loading)
        assertFalse("nothing was asked, so nothing failed", flow.loadFailed)

        flow.tapRestore()
        assertEquals("the store is not started and nothing is sent", emptyList<String>(), calls)
        assertEquals("the reason is already on the screen; the tap changes nothing", CreditsRestoreState.Idle, flow.restore)

        signedIn = false
        flow.tapRestore()
        assertEquals("not even the sign-in explanation: the notice comes first", CreditsRestoreState.Idle, flow.restore)

        var completed = false
        flow.signIn(thenRestore = true) { completed = true }
        assertFalse("a sign-in answer is not sent to the server before the notice", completed)
        assertEquals(emptyList<String>(), calls)
        assertEquals(CreditsRestoreState.Idle, flow.restore)
        assertEquals("and the screen was told nothing changed", 0, changes)
    }

    @Test fun onceTheNoticeIsAcceptedTheSameTapRestores() = runTest {
        riskAccepted = false
        val flow = newFlow()
        flow.tapRestore()
        assertEquals(emptyList<String>(), calls)
        riskAccepted = true
        flow.tapRestore()
        assertEquals("nothing more than the notice and a Bobby account is needed", listOf("restore", "load"), calls)
        assertEquals(done(BillingOutcome.SUBSCRIBED), flow.restore)
    }

    // Reading the balances

    @Test fun theBalancesAreReadAndAFailureWithNothingKnownIsSaid() = runTest {
        val flow = newFlow()
        var readingSeen = false
        duringLoad = { readingSeen = flow.loading }
        flow.refresh()
        assertTrue("the screen shows it is reading", readingSeen)
        assertEquals(listOf("load"), calls)
        assertFalse(flow.loading)
        assertFalse(flow.loadFailed)
        assertTrue("the screen heard about it", changes >= 2)

        known = false
        flow.refresh()
        assertTrue("nothing read and nothing known: the screen says so and offers Try again", flow.loadFailed)
        known = true
        flow.refresh()
        assertFalse(flow.loadFailed)
    }

    @Test fun aReadingCutShortLeavesNothingSpinning() = runTest {
        val flow = newFlow()
        duringLoad = { throw IllegalStateException("the screen went away") }
        var thrown = false
        try { flow.refresh() } catch (_: IllegalStateException) { thrown = true }
        assertTrue(thrown)
        assertFalse("the screen never keeps a spinner nobody is feeding", flow.loading)
        assertFalse("and an interrupted reading is not a failed one", flow.loadFailed)
    }

    // Restore, signed in

    @Test fun signedInATapRunsTheRestoreThenReadsWhatTheAccountHasNow() = runTest {
        val flow = newFlow()
        outcome = BillingOutcome.NOTHING_TO_RESTORE
        var atWork: CreditsRestoreState? = null
        duringRestore = { atWork = flow.restore }
        flow.tapRestore()
        assertEquals("the row shows it is working while the store answers", CreditsRestoreState.Running, atWork)
        assertEquals("the balances are read again before the sentence is chosen", listOf("restore", "load"), calls)
        assertEquals(done(BillingOutcome.NOTHING_TO_RESTORE), flow.restore)

        // Try again.
        outcome = BillingOutcome.FAILED
        flow.tapRestore()
        assertEquals(done(BillingOutcome.FAILED), flow.restore)
        outcome = BillingOutcome.PENDING
        flow.tapRestore()
        assertEquals(done(BillingOutcome.PENDING), flow.restore)
        assertEquals(3, calls.count { it == "restore" })
    }

    @Test fun aSecondTapWhileTheStoreIsAnsweringStartsNothing() = runTest {
        val flow = newFlow()
        val open = CompletableDeferred<Unit>()
        gate = open
        val first = launch { flow.tapRestore() }
        runCurrent()
        assertEquals("the store call is open", listOf("restore"), calls)
        assertEquals(CreditsRestoreState.Running, flow.restore)

        flow.tapRestore()
        assertEquals("the store is not asked twice", listOf("restore"), calls)
        assertEquals(CreditsRestoreState.Running, flow.restore)

        open.complete(Unit)
        first.join()
        assertEquals(listOf("restore", "load"), calls)
        assertEquals(done(BillingOutcome.SUBSCRIBED), flow.restore)
    }

    @Test fun aCancelledStoreSheetLeavesTheRowAsItWas() = runTest {
        val flow = newFlow()
        outcome = BillingOutcome.CANCELLED
        flow.tapRestore()
        assertEquals(CreditsRestoreState.Idle, flow.restore)
    }

    @Test fun aRestoreCutShortNeverLeavesTheRowAtWork() = runTest {
        val flow = newFlow()
        duringRestore = { throw IllegalStateException("the app is closing") }
        var thrown = false
        try { flow.tapRestore() } catch (_: IllegalStateException) { thrown = true }
        assertTrue(thrown)
        assertEquals(CreditsRestoreState.Idle, flow.restore)
    }

    // Restore, signed out

    @Test fun signedOutATapExplainsBeforeAnySignIn() = runTest {
        signedIn = false
        val flow = newFlow()
        flow.tapRestore()
        assertEquals("the explanation and the sign-in buttons come first", CreditsRestoreState.SignedOut, flow.restore)
        assertEquals("the store is never started by this tap", emptyList<String>(), calls)
        val notice = CreditsRestoreNotice.make(flow.restore, CreditsProStatus(), TwoWords())
        assertEquals(CreditsRestoreNotice.Action.SIGN_IN, notice?.action)
    }

    @Test fun afterTheSignInTheRestoreRunsAndShowsAsRunningAtOnce() = runTest {
        signedIn = false
        val flow = newFlow()
        flow.tapRestore()
        assertEquals(CreditsRestoreState.SignedOut, flow.restore)

        val seen = ArrayList<CreditsRestoreState>()
        duringLoad = { seen.add(flow.restore) }
        duringRestore = { seen.add(flow.restore) }
        flow.signIn(thenRestore = true) {
            // The sign-in answered and the account exists; the session publishes on the way.
            signedIn = true
            epoch += 1
            flow.accountChanged()
        }
        assertEquals(listOf("afterSignIn", "load", "restore", "load"), calls)
        assertEquals("working from the moment the account exists, not two requests later",
                     listOf<CreditsRestoreState>(CreditsRestoreState.Running, CreditsRestoreState.Running, CreditsRestoreState.Running), seen)
        assertEquals(done(BillingOutcome.SUBSCRIBED), flow.restore)
    }

    @Test fun aSignInThatDidNotFinishStartsNothing() = runTest {
        signedIn = false
        val flow = newFlow()
        flow.tapRestore()
        flow.signIn(thenRestore = true) { }
        assertEquals("no account, no restore", emptyList<String>(), calls)
        assertEquals("the explanation and the buttons stay for another try", CreditsRestoreState.SignedOut, flow.restore)
    }

    @Test fun aSignInFromTheBalanceLinesReadsTheAccountAndDoesNotRestore() = runTest {
        signedIn = false
        val flow = newFlow()
        flow.signIn(thenRestore = false) {
            signedIn = true
            epoch += 1
        }
        assertEquals(listOf("afterSignIn", "load"), calls)
        assertEquals(CreditsRestoreState.Idle, flow.restore)
    }

    // Whose answer

    @Test fun anAnswerForAPreviousAccountIsDropped() = runTest {
        val flow = newFlow()
        duringRestore = { epoch += 1 }
        flow.tapRestore()
        assertEquals("the store answered about an account that is no longer the one on screen", CreditsRestoreState.Idle, flow.restore)
        assertEquals(listOf("restore"), calls)

        // The account changes while the balances are read after the store answered.
        calls.clear()
        duringRestore = {}
        duringLoad = { epoch += 1 }
        flow.tapRestore()
        assertEquals(CreditsRestoreState.Idle, flow.restore)

        // And while the account that just signed in is being read, before the restore it asked for.
        calls.clear()
        signedIn = false
        duringLoad = { epoch += 1 }
        flow.signIn(thenRestore = true) { signedIn = true }
        assertEquals("the restore was for the account that signed in, not for the next one", listOf("afterSignIn", "load"), calls)
        assertEquals(CreditsRestoreState.Idle, flow.restore)
    }

    @Test fun anotherAccountClearsTheLastAnswerButNotARestoreAtWork() = runTest {
        val flow = newFlow()
        outcome = BillingOutcome.NOTHING_TO_RESTORE
        flow.tapRestore()
        assertEquals(done(BillingOutcome.NOTHING_TO_RESTORE), flow.restore)
        flow.accountChanged()
        assertEquals("the last answer was about someone else", CreditsRestoreState.Idle, flow.restore)

        var atWork: CreditsRestoreState? = null
        duringRestore = {
            flow.accountChanged()
            atWork = flow.restore
        }
        flow.tapRestore()
        assertEquals("a restore at work is not wiped from under its own answer", CreditsRestoreState.Running, atWork)
        assertNotNull(flow.restore)
    }

    /** Android only: the flow outlives its screen, so an answer that was read does not greet the next opening. */
    @Test fun closingTheScreenForgetsAnAnswerThatWasReadAndNeverARestoreAtWork() = runTest {
        val flow = newFlow()
        outcome = BillingOutcome.NOTHING_TO_RESTORE
        flow.tapRestore()
        flow.dismissAnswer()
        assertEquals(CreditsRestoreState.Idle, flow.restore)

        val open = CompletableDeferred<Unit>()
        gate = open
        val first = launch { flow.tapRestore() }
        runCurrent()
        flow.dismissAnswer()
        assertEquals("the store is still answering", CreditsRestoreState.Running, flow.restore)
        open.complete(Unit)
        first.join()
        assertEquals("and its answer is there when the screen opens again", done(BillingOutcome.NOTHING_TO_RESTORE), flow.restore)
    }
}
