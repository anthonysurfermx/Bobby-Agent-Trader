package xyz.bobbyprotocol.android.v18.invite

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.FakeCreditsBackend
import xyz.bobbyprotocol.android.v18.credits.SignInReturn
import xyz.bobbyprotocol.android.v18.credits.TwoWords
import java.io.IOException

/**
 * Invitations as the Android app runs them, on the real host: the link that opens the app, the
 * line on the glass, and the invite sheet. These are the cases of
 * ios/Bobby/Tests/InviteLinkCenterTests.swift that need a session ("the nudge", "Accept on the
 * glass", "a link opened with an account"), told the Android way: a link arrives through
 * `host.onLink`, sign-in is a browser tab the sheet starts, and the activity closes the sheet when
 * the account arrives, so the sheet comes back with the answer.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class InviteDeskTest {
    private class Fixture(val bench: V18TestBench, val backend: FakeCreditsBackend) {
        /** Every code the server was asked about, in order. */
        val sent = ArrayList<String>()
        var result = "claimed"
        var offline = false
        lateinit var desk: InviteDesk
        val invites: InviteLinkCenter get() = desk.center
    }

    private fun TestScope.fixture(owner: String? = null, register: Boolean = true): Fixture {
        val bench = V18TestBench(backgroundScope)
        if (owner != null) bench.changeAccount(owner)
        val made = Fixture(bench, FakeCreditsBackend())
        made.desk = InviteDesk.of(bench.host, CreditsCenter.of(bench.host, made.backend)) { code, _, _ ->
            made.sent.add(code)
            if (made.offline) throw IOException("offline")
            InviteReply(JSONObject().put("result", made.result), 200)
        }
        if (register) {
            InviteNudges.register(bench.host, made.desk)
            runCurrent()
        }
        return made
    }

    private fun link(code: String): String = "https://bobbyprotocol.xyz/i/$code"

    // A link opens the app

    @Test fun anInvitationLinkThatOpensTheAppIsKeptAndOtherLinksAreNot() = runTest {
        val set = fixture()
        assertEquals(listOf(InviteNudges.KEY), set.bench.nudges.sourceKeys)
        set.bench.host.noteLink("https://bobbyprotocol.xyz/desk")
        set.bench.host.noteLink("https://bobbyprotocol.xyz/i/")
        assertNull("a page of the site is not an invitation", set.invites.pendingCode)
        set.bench.host.noteLink(link("ABCD2345"))
        assertEquals("ABCD2345", set.invites.pendingCode)
        assertEquals("kept on the phone", "ABCD2345", JSONObject(set.bench.store.getString(InviteLinkCenter.STORE_KEY)!!).getString("code"))
        runCurrent()
        assertTrue("nobody is signed in: nothing to send", set.sent.isEmpty())

        // A link that opened the app before the feature was listening waits for it.
        val early = fixture(register = false)
        early.bench.host.noteLink(link("WXYZ6789"))
        assertNull(early.invites.pendingCode)
        InviteNudges.register(early.bench.host, early.desk)
        assertEquals("WXYZ6789", early.invites.pendingCode)
    }

    @Test fun nothingIsSentAndNoSignInStartsBeforeTheRiskNotice() = runTest {
        val set = fixture(owner = "account-a")
        set.bench.desk.riskNotice = RiskNotice.WITHDRAWN
        set.bench.host.noteLink(link("ABCD2345"))
        set.bench.host.appBecameActive()
        runCurrent()
        assertTrue("signed in with an invitation waiting, and still nothing leaves before consent", set.sent.isEmpty())
        assertEquals("the code waits for the consent", "ABCD2345", set.invites.pendingCode)
        set.desk.signIn("google")
        assertTrue(set.bench.shell.signIns.isEmpty())
        assertFalse(set.desk.back.isPending)

        set.bench.desk.riskNotice = RiskNotice.ACCEPTED
        set.bench.host.appBecameActive()
        runCurrent()
        assertEquals(listOf("ABCD2345"), set.sent)
        assertEquals(InviteNotice.ACCEPTED, set.invites.notice)
        assertEquals("the balances are read again after an accepted invitation", 1, set.backend.gets)
    }

    @Test fun aKeptInvitationIsTriedAgainWhenTheAppComesBackToTheFront() = runTest {
        val first = fixture(owner = "account-a")
        first.offline = true
        first.bench.host.noteLink(link("ABCD2345"))
        runCurrent()
        assertEquals(1, first.sent.size)
        assertEquals("ABCD2345", first.invites.pendingCode)
        first.bench.host.appBecameActive()
        runCurrent()
        assertEquals("not again inside the minute", 1, first.sent.size)

        // A minute later the server is back (the try at launch is in InviteLinkCenterTest).
        first.bench.clock += InviteLinkCenter.BACK_OFF
        first.offline = false
        first.bench.host.appBecameActive()
        runCurrent()
        assertEquals(listOf("ABCD2345", "ABCD2345"), first.sent)
        assertNull(first.invites.pendingCode)
        assertEquals(InviteNotice.ACCEPTED, first.invites.notice)
    }

    // The line on the glass

    @Test fun theLineShowsSignedOutWithAWaitingInvitationAndAcceptOpensTheInviteSheet() = runTest {
        val set = fixture()
        assertNull("no invitation, nothing to say", set.bench.host.currentNudge())

        set.bench.host.noteLink(link("ABCD2345"))
        val first = set.bench.host.currentNudge()!!
        assertEquals("the code in lowercase, then when it arrived", "invite.abcd2345." + InviteNudges.stamp(set.bench.clock), first.id)
        assertEquals("A friend invited you to Bobby", first.text)
        assertEquals("Accept", first.cta)
        assertTrue(NucleoNudge.ID_PATTERN.matches(first.id))

        // Accept: the invite sheet, where the two ways to sign in are. The tap by itself opens no browser tab.
        assertEquals("done", set.bench.host.nudgeAct(first.id).getString("status"))
        assertEquals(InviteDesk.ROUTE, set.bench.shell.sheetRoute)
        assertTrue(set.bench.nudges.isRetired(first.id))
        assertEquals("the invitation keeps waiting", "ABCD2345", set.invites.pendingCode)
        assertTrue(set.bench.shell.signIns.isEmpty())
        assertNull(set.invites.notice)

        // The person picks a provider, comes back from the browser without an account, and closes the sheet.
        set.desk.signIn("google")
        assertEquals(listOf("google"), set.bench.shell.signIns)
        assertTrue(set.desk.back.isPending)
        set.bench.closeSheet()
        set.desk.screenGone()
        assertFalse(set.desk.back.isPending)
        assertEquals("ABCD2345", set.invites.pendingCode)

        // Later the person opens the same friend's link again.
        set.bench.clock += 3_600_000L
        assertNull("until then the retired line stays quiet", set.bench.host.currentNudge())
        set.bench.host.noteLink(link("ABCD2345"))
        val again = set.bench.host.currentNudge()!!
        assertNotEquals("opening the link again is the person's own act: the line comes back", first.id, again.id)
        assertTrue(again.id.startsWith("invite.abcd2345."))
        assertFalse(set.bench.nudges.isRetired(again.id))

        // An expired invitation says nothing.
        set.bench.clock += 31L * 86_400_000L
        assertNull(set.bench.host.currentNudge())
        runCurrent()
        assertTrue("none of it touched the network", set.sent.isEmpty())
    }

    @Test fun signingInFromTheInviteSheetClaimsAndBringsTheSheetBackWithTheAnswer() = runTest {
        val set = fixture()
        set.result = "not_new"
        set.bench.host.noteLink(link("ABCD2345"))
        assertTrue(set.bench.host.present(InviteDesk.ROUTE))
        set.desk.signIn("apple")
        assertEquals(listOf("apple"), set.bench.shell.signIns)

        // The account arrives while the sheet is still on screen: the claim runs for it.
        set.bench.changeAccount("account-a")
        runCurrent()
        assertEquals(listOf("ABCD2345"), set.sent)
        assertEquals(InviteNotice.NOT_NEW, set.invites.notice)
        assertNull(set.invites.pendingCode)

        // The activity takes the sheet away. Nothing was read yet, so nothing is forgotten.
        set.bench.closeSheet()
        set.desk.screenGone()
        assertEquals(InviteNotice.NOT_NEW, set.invites.notice)
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals("the sheet says in words what the server answered", listOf(InviteDesk.ROUTE, InviteDesk.ROUTE), set.bench.shell.opened)
        assertEquals("Invitations work for new accounts, during their first week.", set.invites.notice?.text(TwoWords()))

        // Read, then closed by the person: said once.
        set.bench.closeSheet()
        set.desk.screenGone()
        assertNull(set.invites.notice)
        assertNull(set.invites.unreadAnswer)
        assertNull(set.bench.store.getString(InviteLinkCenter.ANSWER_KEY))
        set.bench.clock += 3_600_000L
        assertNull(set.bench.host.currentNudge())
        assertEquals(1, set.sent.size)
    }

    @Test fun aSignInThatCouldNotReachTheServerSaysTheCodeIsSavedAndASheetClosedEarlyComesBackForNobody() = runTest {
        val set = fixture()
        set.offline = true
        set.bench.host.noteLink(link("ABCD2345"))
        set.bench.host.present(InviteDesk.ROUTE)
        set.desk.signIn("google")
        set.bench.changeAccount("account-a")
        runCurrent()
        assertEquals("one attempt, and the person is told it waits", 1, set.sent.size)
        assertEquals(InviteNotice.SAVED_FOR_LATER, set.invites.notice)
        assertEquals("ABCD2345", set.invites.pendingCode)
        set.bench.closeSheet()
        set.desk.screenGone()
        advanceTimeBy(SignInReturn.STEP)
        runCurrent()
        assertEquals(listOf(InviteDesk.ROUTE, InviteDesk.ROUTE), set.bench.shell.opened)

        // Another phone: the sheet is closed before any account arrives, and the sign-in happens elsewhere later.
        val other = fixture()
        other.result = "not_new"
        other.bench.host.noteLink(link("WXYZ6789"))
        other.bench.host.present(InviteDesk.ROUTE)
        other.desk.signIn("google")
        other.bench.closeSheet()
        other.desk.screenGone()
        other.bench.changeAccount("account-b")
        runCurrent()
        advanceTimeBy(5_000L)
        runCurrent()
        assertEquals("the claim still runs for the account", listOf("WXYZ6789"), other.sent)
        assertEquals("but no sheet opens by itself", listOf(InviteDesk.ROUTE), other.bench.shell.opened)
        assertTrue("the answer waits on the glass instead", other.bench.host.currentNudge()?.id?.startsWith(InviteNudges.RESULT_PREFIX) == true)
    }

    // The answer, for a person who already has an account

    @Test fun aLinkOpenedWithAnAccountLeavesItsAnswerForTheGlassUntilTheSheetHasShownIt() = runTest {
        val set = fixture(owner = "account-a")
        set.result = "not_new"
        assertNull("nothing to report yet", set.bench.host.currentNudge())

        set.bench.host.noteLink(link("ABCD2345"))
        runCurrent()
        assertEquals(InviteNotice.NOT_NEW, set.invites.notice)
        assertEquals(InviteAnswer("ABCD2345", InviteNotice.NOT_NEW, set.bench.clock), set.invites.answer)
        assertEquals(set.invites.answer, set.invites.unreadAnswer)

        val nudge = set.bench.host.currentNudge()!!
        assertEquals("invite.result.abcd2345." + InviteNudges.stamp(set.bench.clock), nudge.id)
        assertTrue(NucleoNudge.ID_PATTERN.matches(nudge.id))
        assertEquals("The invitation you received was not accepted", nudge.text)
        assertEquals("See why", nudge.cta)
        assertNull("never for someone who is not that account", InviteNudges.nudge(false, set.invites.waiting, set.invites.unreadAnswer, TwoWords()))
        assertEquals("and still on the glass for the account it belongs to", nudge, set.bench.host.currentNudge())

        // The tap opens the invite sheet, where the reason is in words; closing it is "read".
        assertEquals("done", set.bench.host.nudgeAct(nudge.id).getString("status"))
        assertEquals(InviteDesk.ROUTE, set.bench.shell.sheetRoute)
        assertEquals(InviteNotice.NOT_NEW, set.invites.notice)
        assertEquals("the tap sends nothing", 1, set.sent.size)
        set.bench.closeSheet()
        set.desk.screenGone()
        assertNull(set.invites.answer)
        assertNull(set.invites.notice)
        assertNull("read once, then gone from the phone", set.bench.store.getString(InviteLinkCenter.ANSWER_KEY))
        set.bench.clock += 3_600_000L
        assertNull(set.bench.host.currentNudge())
    }

    @Test fun anAnswerLeavesWithTheAccountAndTheWaitingCodeStaysOnThePhone() = runTest {
        val set = fixture(owner = "account-a")
        set.result = "inviter_full"
        set.bench.host.noteLink(link("ABCD2345"))
        runCurrent()
        assertEquals(InviteNotice.INVITER_FULL, set.invites.unreadAnswer?.notice)

        // The account is deleted: what the phone kept for it goes; the hook itself touches no network.
        set.bench.host.accountDeleted("account-a")
        assertNull(set.invites.answer)
        assertNull(set.bench.store.getString(InviteLinkCenter.ANSWER_KEY))
        assertEquals(1, set.sent.size)

        // A new invitation while signed out belongs to the phone, whoever signs in next.
        set.bench.changeAccount(null)
        set.bench.host.noteLink(link("WXYZ6789"))
        runCurrent()
        assertEquals("WXYZ6789", set.invites.pendingCode)
        assertEquals(1, set.sent.size)
        set.result = "claimed"
        set.bench.changeAccount("account-b")
        runCurrent()
        assertEquals(listOf("ABCD2345", "WXYZ6789"), set.sent)
        assertEquals(InviteNotice.ACCEPTED, set.invites.notice)
    }

    @Test fun theSheetsThatOpenAreOnesThePageCanAlreadyOpen() {
        assertTrue("the invite sheet is a 1.1.4 route: no new door for the page", InviteDesk.ROUTE in V18Routes.PAGE_OPENABLE)
        assertTrue(InviteDesk.ROUTE in V18Routes.ALL)
        assertTrue("Credits is native-only", V18Routes.CREDITS in V18Routes.NATIVE_ONLY)
    }
}
