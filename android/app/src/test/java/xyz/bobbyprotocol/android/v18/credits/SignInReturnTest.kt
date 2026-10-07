package xyz.bobbyprotocol.android.v18.credits

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench

/**
 * Android only. The activity closes whatever sheet is open when a sign-in started from it
 * completes; on iOS the sheet stays. `SignInReturn` brings the sheet back for the account that
 * arrived, once the first one has really gone, and for nobody else.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SignInReturnTest {
    @Test fun nothingComesBackUnlessASignInWasStartedFromTheSheet() = runTest {
        val bench = V18TestBench(backgroundScope)
        val back = SignInReturn(bench.host, V18Routes.CREDITS)
        assertFalse(back.isPending)
        bench.host.present(V18Routes.CREDITS)
        bench.changeAccount("a")
        assertFalse("an account that arrived some other way opens nothing", back.accountChanged())
        bench.closeSheet()
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals(listOf(V18Routes.CREDITS), bench.shell.opened)
    }

    @Test fun theSheetComesBackOnceTheFirstOneHasGoneForTheAccountThatArrived() = runTest {
        val bench = V18TestBench(backgroundScope)
        val back = SignInReturn(bench.host, V18Routes.CREDITS)
        bench.host.present(V18Routes.CREDITS)
        back.arm()
        assertTrue(back.isPending)
        bench.changeAccount("a")
        var prepared = 0
        assertTrue(back.accountChanged { prepared += 1 })
        runCurrent()
        assertEquals("what the account needs first runs at once", 1, prepared)
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals("never two sheets: it waits for the first to go", listOf(V18Routes.CREDITS), bench.shell.opened)
        assertTrue(back.isPending)

        // The activity closes the sheet the sign-in started from.
        bench.closeSheet()
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals(listOf(V18Routes.CREDITS, V18Routes.CREDITS), bench.shell.opened)
        assertFalse(back.isPending)

        // Once is once: the next account change brings nothing back.
        bench.closeSheet()
        bench.changeAccount("b")
        assertFalse(back.accountChanged())
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals(2, bench.shell.opened.size)
    }

    @Test fun aSignInThatEndedSignedOutOrForAnotherAccountBringsNothingBack() = runTest {
        val bench = V18TestBench(backgroundScope)
        val back = SignInReturn(bench.host, V18Routes.CREDITS)
        bench.changeAccount("a")
        bench.host.present(V18Routes.CREDITS)
        back.arm()
        // The account that changes is a sign-out: there is nobody to bring the sheet back for.
        bench.changeAccount(null)
        assertFalse(back.accountChanged())
        assertFalse(back.isPending)

        // An account arrives, and another takes its place before the first sheet has gone.
        back.arm()
        bench.changeAccount("a")
        assertTrue(back.accountChanged())
        runCurrent()
        bench.changeAccount("b")
        bench.closeSheet()
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals("the next reader does not get the previous reader's screen", listOf(V18Routes.CREDITS), bench.shell.opened)
    }

    @Test fun aSheetClosedBeforeTheAccountArrivesAndASheetThatNeverGoesBringNothingBack() = runTest {
        val bench = V18TestBench(backgroundScope)
        val back = SignInReturn(bench.host, V18Routes.CREDITS)
        bench.host.present(V18Routes.CREDITS)
        back.arm()
        bench.closeSheet()
        back.disarm()
        bench.changeAccount("a")
        assertFalse(back.accountChanged())
        assertFalse(back.isPending)

        // Something else stays on screen for good: after a while it gives up rather than pop up later.
        bench.host.present("account")
        back.arm()
        bench.changeAccount("b")
        assertTrue(back.accountChanged())
        runCurrent()
        advanceTimeBy(SignInReturn.WAIT_LIMIT + SignInReturn.STEP)
        runCurrent()
        assertFalse(back.isPending)
        bench.closeSheet()
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals(listOf(V18Routes.CREDITS, "account"), bench.shell.opened)

        // And a wait that is no longer wanted is cut short.
        bench.host.present("account")
        back.arm()
        bench.changeAccount("c")
        assertTrue(back.accountChanged())
        runCurrent()
        back.disarm()
        bench.closeSheet()
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals(3, bench.shell.opened.size)
    }

    @Test fun theSheetThatComesBackWaitsWhileBobbyIsListeningSpeakingOrAnswering() = runTest {
        // Nobody tapped anything to bring this sheet up. Opening it closes the mic, stops the voice and
        // covers the read, so it waits for them, as a tapped notification does.
        val bench = V18TestBench(backgroundScope)
        val back = SignInReturn(bench.host, V18Routes.CREDITS)
        bench.host.present(V18Routes.CREDITS)
        back.arm()
        bench.changeAccount("a")
        assertTrue(back.accountChanged())
        runCurrent()
        // The activity closes the first sheet; the person holds the mic before the claim has returned.
        bench.closeSheet()
        bench.shell.voiceBusy = true
        advanceTimeBy(SignInReturn.STEP * 4)
        runCurrent()
        assertEquals("not over a question being spoken", listOf(V18Routes.CREDITS), bench.shell.opened)
        assertEquals(0, bench.shell.quieted)
        bench.shell.voiceBusy = false
        bench.desk.busy = true
        advanceTimeBy(SignInReturn.STEP * 4)
        runCurrent()
        assertEquals("not over a read in progress", listOf(V18Routes.CREDITS), bench.shell.opened)
        assertTrue(back.isPending)
        bench.desk.busy = false
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals("once the glass is free, the sheet is back", listOf(V18Routes.CREDITS, V18Routes.CREDITS), bench.shell.opened)

        // A read that outlasts the wait is not covered afterwards either.
        bench.closeSheet()
        bench.host.present("account")
        back.arm()
        bench.changeAccount("b")
        assertTrue(back.accountChanged())
        runCurrent()
        bench.closeSheet()
        bench.desk.busy = true
        advanceTimeBy(SignInReturn.WAIT_LIMIT + SignInReturn.STEP)
        runCurrent()
        assertFalse(back.isPending)
        bench.desk.busy = false
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals("it gave up rather than pop up later", 3, bench.shell.opened.size)
    }
}
