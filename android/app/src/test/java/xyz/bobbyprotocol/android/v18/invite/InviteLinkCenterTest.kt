package xyz.bobbyprotocol.android.v18.invite

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.credits.Referral
import xyz.bobbyprotocol.android.v18.credits.TwoWords
import xyz.bobbyprotocol.android.v18.credits.V18Catalog
import java.io.IOException

/**
 * The invitation waiting on the phone and its claim (1.8). The cases of
 * ios/Bobby/Tests/InviteLinkCenterTests.swift. Every transport is injected and local: no
 * invitation, account or server is touched. The account, the clock and the risk notice are a
 * `World` the test moves by hand. What needs the host (the link that opens the app, the line on
 * the glass, the sheet) is in InviteDeskTest.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class InviteLinkCenterTest {
    private class Sent(val code: String, val user: String, val epoch: Long)

    private class World {
        var user: String? = "account-a"
        var epoch = 1L
        var risk = true
        var now = 1_800_000_000_000L
        val sent = ArrayList<Sent>()
        var answer: suspend () -> InviteReply = { InviteReply(JSONObject().put("result", "claimed"), 200) }
        var refreshed = 0

        fun switchTo(next: String?) {
            user = next
            epoch += 1
        }

        val codes: List<String> get() = sent.map { it.code }
    }

    private val day = 86_400_000L
    private var store = MemoryKeyValueStore()

    /** `wake` is the app's own centre at launch: it tries once without waiting for another event. */
    private fun TestScope.newCenter(world: World, wake: Boolean = false): InviteLinkCenter {
        val made = InviteLinkCenter(store, backgroundScope, now = { world.now }, riskAccepted = { world.risk },
            currentUser = { world.user }, currentEpoch = { world.epoch },
            send = { code, user, epoch ->
                world.sent.add(Sent(code, user, epoch))
                world.answer()
            },
            afterClaim = { world.refreshed += 1 })
        if (wake) made.wake()
        return made
    }

    private fun link(code: String): String = "https://bobbyprotocol.xyz/i/$code"
    private fun reply(result: String, status: Int = 200): InviteReply = InviteReply(JSONObject().put("result", result), status)
    private val stored: JSONObject? get() = store.getString(InviteLinkCenter.STORE_KEY)?.let { JSONObject(it) }
    private val storedAnswer: JSONObject? get() = store.getString(InviteLinkCenter.ANSWER_KEY)?.let { JSONObject(it) }

    // Storage

    @Test fun anInvitationIsKeptOnThePhoneWithItsArrivalTimeAndTheNewestWins() = runTest {
        val world = World()
        world.user = null
        val center = newCenter(world)
        assertNull(center.pendingCode)
        assertTrue(center.receive(link("ABCD2345")))
        assertEquals(InvitePending("ABCD2345", world.now), center.pending)
        assertEquals("ABCD2345", stored?.getString("code"))
        assertEquals(world.now, stored?.getLong("at"))
        assertEquals("v18.invite.pending", InviteLinkCenter.STORE_KEY)

        world.now += 3_600_000L
        assertTrue(center.receive("bobbyprotocol://invite/wxyz6789"))
        assertEquals("the newest invitation replaces the first", InvitePending("WXYZ6789", world.now), center.pending)
        assertEquals("WXYZ6789", stored?.getString("code"))

        assertFalse(center.receive("https://bobbyprotocol.xyz/desk"))
        assertFalse(center.receive("https://evil.com/i/ABCD2345"))
        assertEquals("a URL that is not an invitation changes nothing", "WXYZ6789", center.pendingCode)

        center.idle()
        assertTrue("nobody is signed in: nothing to send", world.sent.isEmpty())
        assertEquals("it survives a relaunch", center.pending, newCenter(world).pending)
    }

    @Test fun anInvitationExpiresAfterThirtyDays() = runTest {
        val world = World()
        world.user = null
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        world.now += 30 * day - 1
        assertEquals("ABCD2345", center.pendingCode)
        assertEquals("ABCD2345", newCenter(world).pendingCode)
        world.now += 1
        assertNull("thirty days later it is gone", center.pendingCode)
        assertNull("also for a relaunch that finds the old record", newCenter(world).pendingCode)
        world.switchTo("account-a")
        center.accountDidChange()
        center.idle()
        assertTrue("an expired invitation is never sent", world.sent.isEmpty())
        assertNull(center.pending)
        assertNull("and the record is removed", stored)
    }

    @Test fun aBrokenRecordIsNotAnInvitation() = runTest {
        val world = World()
        val records = listOf(
            """{"code":"ABCDI345","at":${world.now}}""",
            """{"code":"ABCD2345"}""",
            """{"code":"ABCD2345","at":"soon"}""",
            """{"at":${world.now}}""",
            """{"code":"ABCD2345","at":${world.now + 40 * day}}""",
            "ABCD2345")
        for (record in records) {
            store.putString(InviteLinkCenter.STORE_KEY, record)
            assertNull(record, newCenter(world).pendingCode)
        }
    }

    // Consent and account

    @Test fun nothingIsSentBeforeTheRiskNoticeIsAccepted() = runTest {
        val world = World()
        world.risk = false
        val center = newCenter(world)
        assertTrue(center.receive(link("ABCD2345")))
        center.appBecameActive()
        center.accountDidChange()
        center.idle()
        assertNull(center.claimIfPossible())
        assertEquals("a typed code is told why nothing happened", InviteNotice.CONSENT_NEEDED, center.submit("WXYZ6789"))
        assertTrue("signed in with an invitation waiting, and still nothing leaves before consent", world.sent.isEmpty())
        assertEquals("the code waits for the consent", "WXYZ6789", center.pendingCode)
        assertEquals(InviteNotice.CONSENT_NEEDED, center.notice)
        assertEquals("the sentence the memory and briefing screens already use",
                     "Accept the risk notice first: until then Bobby sends nothing to its servers.", center.notice?.text(TwoWords()))
        assertEquals("Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.", center.notice?.text(TwoWords(spanish = true)))
        assertNull("it is not an answer from the server", storedAnswer)
        assertEquals(0, world.refreshed)

        world.user = null
        assertEquals("signed out it is still the consent that is missing first", InviteNotice.CONSENT_NEEDED, center.submit("WXYZ6789"))
        assertTrue(world.sent.isEmpty())
        world.user = "account-a"

        world.risk = true
        center.appBecameActive()
        center.idle()
        assertEquals(listOf("WXYZ6789"), world.codes)
        assertNull(center.pendingCode)
        assertEquals("the consent line is gone once the consent is there", InviteNotice.ACCEPTED, center.notice)
    }

    @Test fun theConsentLineDoesNotOutliveTheConsentWhenTheServerCannotBeReached() = runTest {
        val world = World()
        world.risk = false
        world.answer = { throw IOException("timed out") }
        val center = newCenter(world)
        assertEquals(InviteNotice.CONSENT_NEEDED, center.submit("ABCD2345"))
        world.risk = true
        center.appBecameActive()
        center.idle()
        assertEquals(1, world.sent.size)
        assertEquals("ABCD2345", center.pendingCode)
        assertNull("an out-of-date reason is not left on the sheet", center.notice)
    }

    // A launch

    @Test fun aKeptInvitationIsTriedAgainAtLaunchWithoutAnyOtherEvent() = runTest {
        val world = World()
        world.answer = { reply("server_error", 502) }
        val first = newCenter(world)
        assertEquals("the person was told it will be tried again", InviteNotice.SAVED_FOR_LATER, first.submit("ABCD2345"))
        assertEquals(1, world.sent.size)
        assertEquals("ABCD2345", stored?.getString("code"))

        // The app is quit and opened again: no link, no sign-in, no return from the background.
        world.answer = { reply("claimed") }
        val relaunched = newCenter(world, wake = true)
        relaunched.idle()
        assertEquals("the launch itself is the next try", listOf("ABCD2345", "ABCD2345"), world.codes)
        assertEquals(world.epoch, world.sent.last().epoch)
        assertNull(relaunched.pendingCode)
        assertNull(stored)
        assertEquals(InviteNotice.ACCEPTED, relaunched.notice)
        assertEquals(1, world.refreshed)

        val again = newCenter(world, wake = true)
        again.idle()
        assertEquals("nothing waits any more: a later launch sends nothing", 2, world.sent.size)
    }

    @Test fun aLaunchSendsNothingWithoutTheConsentOrAnAccount() = runTest {
        val world = World()
        world.user = null
        newCenter(world).receive(link("ABCD2345"))
        val signedOut = newCenter(world, wake = true)
        signedOut.idle()
        runCurrent()
        assertTrue("nobody is signed in", world.sent.isEmpty())

        world.switchTo("account-a")
        world.risk = false
        val noConsent = newCenter(world, wake = true)
        noConsent.idle()
        assertTrue("the risk notice is not accepted", world.sent.isEmpty())
        assertEquals("ABCD2345", noConsent.pendingCode)

        val quiet = newCenter(world)
        world.risk = true
        quiet.idle()
        runCurrent()
        assertTrue("a centre nobody woke starts nothing by itself", world.sent.isEmpty())
    }

    @Test fun nothingIsSentWithoutAnAccountAndASignInClaims() = runTest {
        val world = World()
        world.user = null
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.appBecameActive()
        center.idle()
        assertTrue(world.sent.isEmpty())
        assertFalse(center.isSignedIn)

        world.switchTo("account-a")
        center.accountDidChange()
        center.idle()
        assertEquals(listOf("ABCD2345"), world.codes)
        assertEquals(world.epoch, world.sent.first().epoch)
        assertNull(center.pendingCode)
        assertNull(stored)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
        assertEquals("levels and access are read again after an accepted invitation", 1, world.refreshed)
    }

    @Test fun theSameLinkAgainWhileItsAnswerIsUnreadIsThatInvitationNotANewOne() = runTest {
        // Android can hand the link that opened the app to the app again. An invitation that was
        // accepted must not be asked about a second time: the server answers `already_claimed` to
        // the repeat, and the glass would say "not accepted" about an invitation that was.
        val world = World()
        val center = newCenter(world)
        assertTrue(center.receive(link("ABCD2345")))
        center.idle()
        assertEquals(InviteNotice.ACCEPTED, center.unreadAnswer?.notice)
        val answeredAt = center.unreadAnswer?.atMillis

        world.now += 3_600_000L
        world.answer = { reply("already_claimed") }
        assertTrue("it is still an invitation link", center.receive(link("ABCD2345")))
        center.idle()
        assertEquals("nothing is sent for it again", 1, world.sent.size)
        assertEquals(InviteNotice.ACCEPTED, center.unreadAnswer?.notice)
        assertEquals("the answer the person is owed is untouched", answeredAt, center.unreadAnswer?.atMillis)
        assertNull("and it does not wait as a new invitation", center.pendingCode)

        // After the system killed the process: a new centre over the same phone, the same link again.
        val restored = newCenter(world)
        assertTrue(restored.receive("https://www.bobbyprotocol.xyz/i/abcd2345"))
        restored.idle()
        assertEquals(1, world.sent.size)
        assertEquals(InviteNotice.ACCEPTED, restored.unreadAnswer?.notice)
        assertEquals(InviteNotice.ACCEPTED, restored.notice)

        // Another friend's link is another invitation, and so is this one for another account.
        world.answer = { reply("already_claimed") }
        assertTrue(restored.receive(link("WXYZ6789")))
        restored.idle()
        assertEquals(listOf("ABCD2345", "WXYZ6789"), world.codes)
        assertEquals(InviteNotice.ALREADY_CLAIMED, restored.unreadAnswer?.notice)
        world.switchTo("account-b")
        world.answer = { reply("claimed") }
        assertTrue(restored.receive(link("WXYZ6789")))
        restored.idle()
        assertEquals("the answer was the previous account's: this one asks for itself", 3, world.sent.size)
        assertEquals("account-b", world.sent.last().user)

        // Once the answer was read it is gone from the phone; opening the link again is the person's own act.
        restored.acknowledgeNotice()
        world.answer = { reply("already_claimed") }
        assertTrue(restored.receive(link("WXYZ6789")))
        restored.idle()
        assertEquals(4, world.sent.size)
    }

    @Test fun theClaimCarriesTheCodeInCapitalsForTheAccountThatIsHereAndNothingElse() = runTest {
        // The request itself (one authenticated POST of {action, code}) is InviteDesk.liveSender: it
        // needs the network, so it is compiled and read, not run here.
        val world = World()
        world.answer = { InviteReply(JSONObject().put("result", "claimed").put("access", JSONObject.NULL).put("levels", JSONObject.NULL), 200) }
        val center = newCenter(world)
        center.receive("https://www.bobbyprotocol.xyz/desk?ref=abcd2345&v=2")
        center.idle()
        val only = world.sent.single()
        assertEquals("ABCD2345", only.code)
        assertEquals("account-a", only.user)
        assertEquals(world.epoch, only.epoch)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
        assertEquals(1, world.refreshed)
    }

    // Results

    @Test fun everyFinalAnswerClearsTheCodeAndSaysWhyInWordsOnce() = runTest {
        val answers = listOf(
            Triple("claimed", 200, InviteNotice.ACCEPTED), Triple("self", 200, InviteNotice.OWN_INVITATION), Triple("not_new", 200, InviteNotice.NOT_NEW),
            Triple("already_claimed", 200, InviteNotice.ALREADY_CLAIMED), Triple("inviter_full", 200, InviteNotice.INVITER_FULL),
            Triple("invalid_code", 200, InviteNotice.INVALID), Triple("invalid_invitee", 200, InviteNotice.INVALID),
            Triple("invalid_code", 400, InviteNotice.INVALID), Triple("a_result_from_the_future", 200, InviteNotice.NOT_APPLIED))
        val texts = HashSet<String>()
        for ((result, status, expected) in answers) {
            store = MemoryKeyValueStore()
            val world = World()
            world.answer = { reply(result, status) }
            val center = newCenter(world)
            center.receive(link("ABCD2345"))
            center.idle()
            assertEquals(result, 1, world.sent.size)
            assertNull(result, center.pendingCode)
            assertNull(result, stored)
            assertEquals(result, expected, center.notice)
            assertFalse(center.isClaiming)
            assertEquals(result, if (expected == InviteNotice.ACCEPTED) 1 else 0, world.refreshed)
            val text = center.notice?.text(TwoWords()) ?: ""
            assertFalse(text.isEmpty())
            texts.add(text)

            center.appBecameActive()
            center.accountDidChange()
            center.idle()
            assertEquals("a settled invitation is never sent again: $result", 1, world.sent.size)
            center.acknowledgeNotice()
            assertNull("said once", center.notice)
        }
        assertEquals("each reason has its own words (the two invalid answers share one)", 7, texts.size)
        // The words exist in every language.
        for (notice in InviteNotice.entries) {
            val english = notice.text(TwoWords())
            assertEquals(english, V18Catalog.LANGUAGES.toSet(), V18Catalog.row(english).keys)
            assertFalse(english, notice.text(TwoWords(spanish = true)).isEmpty())
        }
    }

    @Test fun accountRequiredARefusedSessionAFailingServerAndANetworkErrorKeepTheCode() = runTest {
        val answers = ArrayList<Pair<String, suspend () -> InviteReply>>()
        fun case(name: String, answer: suspend () -> InviteReply) {
            answers.add(Pair(name, answer))
        }
        case("account_required") { reply("account_required") }
        case("401") { InviteReply(JSONObject().put("error", "Sign in"), 401) }
        case("401 with a result") { reply("invalid_code", 401) }
        case("500") { InviteReply(JSONObject().put("error", "boom"), 500) }
        case("503 without a body") { InviteReply(null, 503) }
        case("500 with a result") { reply("claimed", 500) }
        case("429") { InviteReply(JSONObject().put("error", "slow down"), 429) }
        case("404") { InviteReply(null, 404) }
        case("400 without a result") { InviteReply(JSONObject().put("error", "bad"), 400) }
        case("a page instead of an answer") { InviteReply(null, 200) }
        case("an answer without a result") { InviteReply(JSONObject().put("claimed", true), 200) }
        case("a result that is not a word") { InviteReply(JSONObject().put("result", 1), 200) }
        case("timeout") { throw IOException("timed out") }
        case("offline") { throw IOException("not connected") }
        case("a request that gave up") { throw IllegalStateException("the session is unavailable") }
        for ((name, answer) in answers) {
            store = MemoryKeyValueStore()
            val world = World()
            world.answer = answer
            val center = newCenter(world)
            center.receive(link("ABCD2345"))
            center.idle()
            assertEquals(name, 1, world.sent.size)
            assertEquals("kept for a later attempt: $name", "ABCD2345", center.pendingCode)
            assertEquals(name, "ABCD2345", stored?.getString("code"))
            assertNull("an attempt nobody asked for fails quietly: $name", center.notice)
            assertFalse(center.isClaiming)
            assertEquals(name, 0, world.refreshed)
        }
    }

    @Test fun aFailingServerIsAskedAtMostOncePerMinute() = runTest {
        val world = World()
        world.answer = { reply("server_error", 500) }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.idle()
        assertEquals(1, world.sent.size)

        center.appBecameActive()
        center.accountDidChange()
        center.receive(link("ABCD2345"))
        center.idle()
        assertNull(center.claimIfPossible())
        assertEquals("no second attempt inside the minute, whatever asks", 1, world.sent.size)

        assertEquals("a typed code is told it waits", InviteNotice.SAVED_FOR_LATER, center.submit("ABCD2345"))
        assertEquals(1, world.sent.size)

        world.now += 59_000L
        center.appBecameActive()
        center.idle()
        assertEquals(1, world.sent.size)

        world.now += 1_000L
        center.appBecameActive()
        center.idle()
        assertEquals("a minute later the next activation tries again", 2, world.sent.size)

        world.answer = { reply("claimed") }
        center.appBecameActive()
        center.idle()
        assertEquals("the second failure started its own minute", 2, world.sent.size)
        world.now += 60_000L
        center.appBecameActive()
        center.idle()
        assertEquals(3, world.sent.size)
        assertNull(center.pendingCode)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
    }

    @Test fun theBackOffBelongsToTheAccountThatFailed() = runTest {
        val world = World()
        world.answer = { InviteReply(JSONObject().put("error", "Sign in"), 401) }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.idle()
        assertEquals("account A's session was refused", 1, world.sent.size)

        // Twenty seconds later another account signs in: it has not been refused anything.
        world.now += 20_000L
        world.answer = { reply("claimed") }
        world.switchTo("account-b")
        center.accountDidChange()
        center.idle()
        assertEquals("account B's sign-in sends its own attempt inside A's minute", 2, world.sent.size)
        assertEquals(world.epoch, world.sent.last().epoch)
        assertEquals("account-b", world.sent.last().user)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
        assertNull(center.pendingCode)
    }

    @Test fun aTypedCodeIsTriedForTheAccountThatSignedInAfterAnotherOnesFailure() = runTest {
        val world = World()
        world.answer = { reply("server_error", 500) }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.idle()
        assertEquals(1, world.sent.size)

        world.now += 5_000L
        world.switchTo("account-b")
        world.answer = { reply("not_new") }
        // No account event yet: the typed code itself notices the new account.
        assertEquals("never \"could not check\" for an account nothing was tried for", InviteNotice.NOT_NEW, center.submit("ABCD2345"))
        assertEquals(2, world.sent.size)
    }

    @Test fun aClockSetBackCannotHoldAnInvitationForLongerThanOneBackOff() = runTest {
        val world = World()
        world.answer = { throw IOException("timed out") }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.idle()
        assertEquals(1, world.sent.size)
        world.now -= day
        center.appBecameActive()
        center.idle()
        assertEquals(2, world.sent.size)
    }

    @Test fun onlyOneAttemptIsInTheAirAndASecondCallerWaitsForIt() = runTest {
        val world = World()
        val gate = CompletableDeferred<InviteReply>()
        world.answer = { gate.await() }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        runCurrent()
        assertTrue(center.isClaiming)

        val second = async { center.claimIfPossible() }
        center.appBecameActive()
        center.accountDidChange()
        runCurrent()
        assertEquals("the attempt in the air is the only one", 1, world.sent.size)

        gate.complete(reply("claimed"))
        assertEquals("the second caller got the same answer", InviteClaimStep.Settled(InviteNotice.ACCEPTED), second.await())
        center.idle()
        assertEquals(1, world.sent.size)
        assertFalse(center.isClaiming)
        assertEquals(1, world.refreshed)
    }

    // Account fences

    @Test fun aReplyForAPreviousAccountIsDroppedAndTheCodeIsKeptForTheNewOne() = runTest {
        val world = World()
        val gate = CompletableDeferred<InviteReply>()
        var calls = 0
        world.answer = {
            calls += 1
            if (calls == 1) gate.await() else reply("not_new")
        }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        runCurrent()
        val first = world.epoch

        world.switchTo("account-b")
        center.accountDidChange()
        gate.complete(reply("claimed"))
        center.idle()

        assertEquals("account A's accepted invitation is not applied to account B", 0, world.refreshed)
        assertEquals("the code was kept and account B asked for itself", 2, world.sent.size)
        assertEquals(first, world.sent[0].epoch)
        assertEquals(world.epoch, world.sent[1].epoch)
        assertEquals("account B reads its own answer, never A's", InviteNotice.NOT_NEW, center.notice)
        assertNull(center.pendingCode)
    }

    @Test fun aReplyThatLandsAfterSignOutIsDroppedAndTheCodeStays() = runTest {
        val world = World()
        val gate = CompletableDeferred<InviteReply>()
        world.answer = { gate.await() }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        runCurrent()

        world.switchTo(null)
        center.accountDidChange()
        val joined = async { center.claimIfPossible() }
        runCurrent()
        gate.complete(reply("claimed"))
        val step = joined.await()
        center.idle()

        assertEquals(InviteClaimStep.Dropped, step)
        assertEquals("ABCD2345", center.pendingCode)
        assertEquals("ABCD2345", stored?.getString("code"))
        assertNull(center.notice)
        assertEquals(0, world.refreshed)
        assertEquals("nobody is signed in: nothing more is sent", 1, world.sent.size)
    }

    @Test fun aFailureThatLandsAfterAnAccountChangeDoesNotStartABackOffForTheNewAccount() = runTest {
        val world = World()
        val gate = CompletableDeferred<InviteReply>()
        var calls = 0
        world.answer = {
            calls += 1
            if (calls == 1) gate.await() else reply("claimed")
        }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        runCurrent()
        world.switchTo("account-b")
        gate.completeExceptionally(IOException("the connection was lost"))
        center.idle()
        assertEquals(2, world.sent.size)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
        assertEquals(1, world.refreshed)
    }

    @Test fun signingOutOrDeletingTheAccountKeepsTheWaitingCode() = runTest {
        val world = World()
        world.answer = { reply("account_required") }
        val center = newCenter(world)
        assertEquals(InviteNotice.SIGN_IN_NEEDED, center.submit("ABCD2345"))
        assertEquals("ABCD2345", center.pendingCode)

        world.switchTo(null)
        center.accountDidChange()
        center.idle()
        assertEquals("the invitation belongs to the phone until claimed or expired", "ABCD2345", center.pendingCode)
        assertEquals("ABCD2345", stored?.getString("code"))
        assertNull("the previous account's result line is gone", center.notice)
        assertEquals(1, world.sent.size)

        center.forgetAccount("account-a")
        assertEquals("deleting an account does not take the phone's invitation with it", "ABCD2345", center.pendingCode)
    }

    // A typed code

    @Test fun aTypedCodeGoesThroughTheSameCentre() = runTest {
        val world = World()
        val center = newCenter(world)
        assertEquals(InviteNotice.ACCEPTED, center.submit(" abcd 2345 "))
        assertEquals(listOf("ABCD2345"), world.codes)
        assertNull(center.pendingCode)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
        center.idle()
        assertEquals(1, world.refreshed)

        world.answer = { reply("self") }
        assertEquals(InviteNotice.OWN_INVITATION, center.submit("https://bobbyprotocol.xyz/i/WXYZ6789"))
        assertEquals(listOf("ABCD2345", "WXYZ6789"), world.codes)
    }

    @Test fun aTypedCodeThatIsNotACodeIsRefusedWithoutARequestAndWithoutReplacingAWaitingInvitation() = runTest {
        val world = World()
        world.user = null
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        for (raw in listOf("", "ABCD234", "ABCDI345", "ABCD23456", "hello there", "https://evil.com/i/WXYZ6789")) {
            assertEquals(raw, InviteNotice.INVALID, center.submit(raw))
            assertEquals(InviteNotice.INVALID, center.notice)
        }
        assertEquals("ABCD2345", center.pendingCode)
        center.idle()
        assertTrue(world.sent.isEmpty())
    }

    @Test fun aTypedCodeWhileSignedOutIsKeptAndAsksForAnAccount() = runTest {
        val world = World()
        world.user = null
        val center = newCenter(world)
        assertEquals(InviteNotice.SIGN_IN_NEEDED, center.submit("abcd2345"))
        assertEquals("ABCD2345", center.pendingCode)
        assertTrue(world.sent.isEmpty())

        world.switchTo("account-a")
        center.accountDidChange()
        center.idle()
        assertEquals(listOf("ABCD2345"), world.codes)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
    }

    @Test fun aTypedCodeTheServerCouldNotCheckIsSavedAndSaysSo() = runTest {
        val world = World()
        world.answer = { throw IOException("the connection was lost") }
        val center = newCenter(world)
        assertEquals(InviteNotice.SAVED_FOR_LATER, center.submit("ABCD2345"))
        assertEquals("ABCD2345", center.pendingCode)
        assertEquals(1, world.sent.size)
        assertEquals(0, world.refreshed)

        center.forget()
        assertNull("the person can remove what the phone keeps", center.pendingCode)
        assertNull(stored)
        assertNull(center.notice)
    }

    @Test fun aNewerInvitationThatArrivesDuringAnAttemptGetsItsOwnAnswer() = runTest {
        val world = World()
        val gate = CompletableDeferred<InviteReply>()
        var calls = 0
        world.answer = {
            calls += 1
            if (calls == 1) gate.await() else reply("claimed")
        }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        runCurrent()
        center.receive(link("WXYZ6789"))
        gate.complete(reply("invalid_code"))
        center.idle()
        assertEquals(listOf("ABCD2345", "WXYZ6789"), world.codes)
        assertEquals("the first code's answer did not erase or answer for the second", InviteNotice.ACCEPTED, center.notice)
        assertNull(center.pendingCode)
    }

    @Test fun anAcceptedInvitationClearsANewerOneBecauseAnAccountAcceptsOnlyOnce() = runTest {
        val world = World()
        val gate = CompletableDeferred<InviteReply>()
        world.answer = { gate.await() }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        runCurrent()
        center.receive(link("WXYZ6789"))
        gate.complete(reply("claimed"))
        center.idle()
        assertEquals(listOf("ABCD2345"), world.codes)
        assertEquals(InviteNotice.ACCEPTED, center.notice)
        assertNull(center.pendingCode)
    }

    // The sign-in callback

    @Test fun theSignInCallbackIsIgnoredByTheCentre() = runTest {
        val world = World()
        val center = newCenter(world)
        for (callback in listOf("bobby://auth/callback", "bobby://auth/callback?state=s&code=ABCD2345", "bobbyprotocol://auth-callback",
                                "bobbyprotocol://auth-callback#access_token=a.b.c&refresh_token=r&expires_in=3600", "bobbyprotocol://auth-callback/ABCD2345")) {
            assertFalse(callback, center.receive(callback))
        }
        center.idle()
        assertNull(center.pendingCode)
        assertNull(stored)
        assertTrue(world.sent.isEmpty())
    }

    // The line on the glass (what it says; where it shows is in InviteDeskTest)

    @Test fun theNudgeSpeaksOnlySignedOutWithAWaitingInvitationAndItsIdFollowsTheCode() {
        val words = TwoWords()
        val at = 1_800_000_000_000L
        val waiting = InvitePending("ABCD2345", at)
        val first = InviteNudges.nudge(false, waiting, null, words)
        assertEquals("the code in lowercase, then when it arrived", "invite.abcd2345." + InviteNudges.stamp(at), first?.id)
        assertEquals("A friend invited you to Bobby", first?.text)
        assertEquals("Accept", first?.cta)
        assertEquals("Un amigo te invitó a Bobby", InviteNudges.nudge(false, waiting, null, TwoWords(spanish = true))?.text)
        assertEquals("Aceptar", InviteNudges.nudge(false, waiting, null, TwoWords(spanish = true))?.cta)
        assertTrue(NucleoNudge.ID_PATTERN.matches(first?.id ?: ""))
        assertNull("with an account the claim just happens", InviteNudges.nudge(true, waiting, null, words))
        assertNull(InviteNudges.nudge(false, null, null, words))
        assertNull("an answer is only for the account it was given to", InviteNudges.nudge(false, null, InviteAnswer("ABCD2345", InviteNotice.NOT_NEW, at), words))
        assertNotEquals("the same link opened again is a new line", first?.id, InviteNudges.nudge(false, InvitePending("ABCD2345", at + 3_600_000L), null, words)?.id)
    }

    @Test fun anAnswerIsReportedOnTheGlassInItsOwnWords() {
        val at = 1_800_000_000_000L
        val accepted = InviteNudges.nudge(true, null, InviteAnswer("ABCD2345", InviteNotice.ACCEPTED, at), TwoWords())!!
        assertEquals("invite.result.abcd2345." + InviteNudges.stamp(at), accepted.id)
        assertTrue(accepted.id.startsWith(InviteNudges.RESULT_PREFIX))
        assertEquals("The invitation you received was accepted", accepted.text)
        assertEquals("See details", accepted.cta)
        val refused = InviteNudges.nudge(true, null, InviteAnswer("ABCD2345", InviteNotice.NOT_NEW, at), TwoWords())!!
        assertEquals("The invitation you received was not accepted", refused.text)
        assertEquals("See why", refused.cta)
        val es = InviteNudges.nudge(true, null, InviteAnswer("ABCD2345", InviteNotice.NOT_NEW, at), TwoWords(spanish = true))!!
        assertEquals("La invitación que recibiste no fue aceptada", es.text)
        assertEquals("Ver por qué", es.cta)
    }

    @Test fun theNudgeFitsTheGlassInEveryLanguage() {
        val lines = listOf("A friend invited you to Bobby" to "Un amigo te invitó a Bobby",
                           "The invitation you received was accepted" to "La invitación que recibiste fue aceptada",
                           "The invitation you received was not accepted" to "La invitación que recibiste no fue aceptada")
        val buttons = listOf("Accept" to "Aceptar", "See details" to "Ver detalles", "See why" to "Ver por qué")
        for ((texts, limit) in listOf(lines to NucleoNudge.TEXT_LIMIT, buttons to NucleoNudge.CTA_LIMIT)) {
            for ((english, spanish) in texts) {
                assertTrue(english, english.length <= limit)
                assertTrue(spanish, spanish.length <= limit)
                for (language in V18Catalog.LANGUAGES) {
                    val text = V18Catalog.text(english, language) ?: ""
                    assertFalse("$language: $english", text.isEmpty())
                    assertTrue("$language: $text", text.length <= limit)
                }
            }
        }
        assertEquals(90, NudgePriority.INVITE)
    }

    // The answer, for a person who already has an account

    @Test fun theAnswerOfALinkOpenedWithAnAccountIsKeptUntilItHasBeenShown() = runTest {
        val world = World()
        world.answer = { reply("not_new") }
        val center = newCenter(world)
        assertNull("nothing to report yet", center.unreadAnswer)

        assertTrue(center.receive(link("ABCD2345")))
        center.idle()
        assertEquals(InviteNotice.NOT_NEW, center.notice)
        assertEquals(InviteAnswer("ABCD2345", InviteNotice.NOT_NEW, world.now), center.answer)
        assertEquals(center.answer, center.unreadAnswer)
        val kept = storedAnswer
        assertEquals("ABCD2345", kept?.getString("code"))
        assertEquals("notNew", kept?.getString("result"))
        assertEquals("account-a", kept?.getString("user"))
        assertEquals(world.now, kept?.getLong("at"))
        assertEquals("the code, the answer, when, and whose it is: nothing else is kept", 4, kept?.length())

        // The invite sheet showed the reason in words; closing it is "read".
        assertEquals("That invitation... in words", "Invitations work for new accounts, during their first week.", center.notice?.text(TwoWords()))
        center.acknowledgeNotice()
        assertNull(center.answer)
        assertNull(center.notice)
        assertNull("read once, then gone from the phone", storedAnswer)
        assertEquals("reading it sends nothing", 1, world.sent.size)
    }

    @Test fun theUnreadAnswerSurvivesARelaunchForItsAccountOnly() = runTest {
        val world = World()
        world.answer = { reply("inviter_full") }
        val first = newCenter(world)
        first.receive(link("ABCD2345"))
        first.idle()
        assertEquals(InviteNotice.INVITER_FULL, first.answer?.notice)

        // Quit before anything was read; the same account opens the app the next day.
        world.now += day
        val relaunched = newCenter(world, wake = true)
        relaunched.idle()
        assertEquals("the person is still owed the answer", InviteNotice.INVITER_FULL, relaunched.unreadAnswer?.notice)
        assertEquals("ABCD2345", relaunched.unreadAnswer?.code)
        assertEquals("and the invite sheet shows it in words", InviteNotice.INVITER_FULL, relaunched.notice)
        assertEquals("a settled invitation is not sent again", 1, world.sent.size)

        // A week after the answer it is not news any more.
        world.now += 6 * day
        assertNull(relaunched.unreadAnswer)
        relaunched.appBecameActive()
        relaunched.idle()
        assertNull(relaunched.answer)
        assertNull(relaunched.notice)
        assertNull(storedAnswer)
    }

    @Test fun anAnswerNeverReachesAnotherAccountOrASignedOutPhone() = runTest {
        val world = World()
        world.answer = { reply("already_claimed") }
        val first = newCenter(world)
        first.receive(link("ABCD2345"))
        first.idle()
        assertNotNull(storedAnswer)

        // Another account on a relaunch: the record is removed, not shown.
        world.switchTo("account-b")
        val other = newCenter(world)
        assertNull(other.answer)
        assertNull(other.notice)
        assertNull(storedAnswer)

        // Signing out (or deleting the account) in a running app.
        world.switchTo("account-a")
        val running = newCenter(world)
        running.receive(link("WXYZ6789"))
        running.idle()
        assertEquals("WXYZ6789", running.unreadAnswer?.code)
        world.switchTo(null)
        assertNull("not even before the centre hears of the account change", running.unreadAnswer)
        running.accountDidChange()
        running.idle()
        assertNull(running.answer)
        assertNull("the answer belonged to the account that left", storedAnswer)

        // A record that is broken, or that carries a line the server never gives as final, is not an answer.
        world.switchTo("account-a")
        val records = listOf(
            """{"code":"ABCD2345","result":"savedForLater","at":${world.now},"user":"account-a"}""",
            """{"code":"ABCDI345","result":"notNew","at":${world.now},"user":"account-a"}""",
            """{"code":"ABCD2345","result":"notNew","at":"soon","user":"account-a"}""",
            """{"code":"ABCD2345","result":"notNew","at":${world.now},"user":""}""",
            """{"code":"ABCD2345","result":"notNew","at":${world.now}}""",
            """{"code":"ABCD2345","result":"notNew","at":${world.now - 8 * day},"user":"account-a"}""",
            "not json")
        for (record in records) {
            store.putString(InviteLinkCenter.ANSWER_KEY, record)
            val center = newCenter(world)
            assertNull(record, center.answer)
            assertNull(record, center.notice)
            assertNull(record, storedAnswer)
        }
        // And one that is whole comes back.
        store.putString(InviteLinkCenter.ANSWER_KEY, """{"code":"ABCD2345","result":"notNew","at":${world.now},"user":"account-a"}""")
        assertEquals(InviteNotice.NOT_NEW, newCenter(world).unreadAnswer?.notice)
    }

    @Test fun deletingAnAccountRemovesTheAnswerKeptForItAndOnlyThat() = runTest {
        val world = World()
        world.answer = { reply("not_new") }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.idle()
        assertNotNull(storedAnswer)
        center.forgetAccount("someone-else")
        assertNotNull("another account's deletion touches nothing", storedAnswer)
        assertEquals(InviteNotice.NOT_NEW, center.notice)
        center.forgetAccount("account-a")
        assertNull(storedAnswer)
        assertNull(center.answer)
        assertNull(center.notice)

        // A record on disk for an account that is not the one in memory.
        store.putString(InviteLinkCenter.ANSWER_KEY, """{"code":"ABCD2345","result":"notNew","at":${world.now},"user":"account-z"}""")
        center.forgetAccount("account-z")
        assertNull(storedAnswer)
    }

    @Test fun aNewerInvitationOrRemoveDropsTheOlderAnswer() = runTest {
        val world = World()
        world.answer = { reply("not_new") }
        val center = newCenter(world)
        center.receive(link("ABCD2345"))
        center.idle()
        assertEquals("ABCD2345", center.answer?.code)
        world.answer = { throw IOException("timed out") }
        center.receive(link("WXYZ6789"))
        assertNull("the new invitation gets its own answer", center.answer)
        assertNull(storedAnswer)
        center.idle()
        assertNull("an attempt that could not be settled is not an answer", center.answer)

        world.now += 61_000L
        world.answer = { reply("self") }
        center.appBecameActive()
        center.idle()
        assertEquals(InviteNotice.OWN_INVITATION, center.answer?.notice)
        center.forget()
        assertNull(center.answer)
        assertNull(storedAnswer)
    }

    @Test fun everyIdTheSourceCanProduceFitsTheBridge() {
        val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        val moments = listOf(0L, -5_000L, 1_800_000_000_000L, Long.MAX_VALUE, Long.MIN_VALUE)
        for (start in 0 until alphabet.length step 8) {
            val code = alphabet.substring(start, start + 8)
            for (moment in moments) {
                val waiting = InviteNudges.nudge(false, InvitePending(code, moment), null, TwoWords())
                assertTrue(waiting?.id ?: "none", waiting != null && NucleoNudge.ID_PATTERN.matches(waiting.id))
                for (notice in InviteNotice.FINAL) {
                    val result = InviteNudges.nudge(true, null, InviteAnswer(code, notice, moment), TwoWords())
                    assertTrue(result?.id ?: "none", result != null && NucleoNudge.ID_PATTERN.matches(result.id))
                    assertTrue((result?.id ?: "").length <= 48)
                }
            }
        }
        assertNotEquals(InviteNudges.stamp(1_800_000_000_000L), InviteNudges.stamp(1_800_000_001_000L))
        assertEquals("0", InviteNudges.stamp(-1L))
    }

    // The sheet's words

    @Test fun theRewardSentenceUsesTheServersNumbersOrIsNotShown() {
        assertNull("no number of the app's own", InviteCopy.rewardTerms(null, null, 5))
        assertEquals(InviteCopy.Terms(14, 3), InviteCopy.rewardTerms(null, 14, 3))
        val referral = Referral.fromJson(JSONObject("""{"code":"ABCD2345","url":"https://bobbyprotocol.xyz/i/ABCD2345","accepted":1,"max":4,"rewardDays":21}"""))
        assertEquals(InviteCopy.Terms(21, 4), InviteCopy.rewardTerms(referral, 14, 3))
        val sentence = InviteCopy.reward(21, 4, TwoWords())
        assertTrue(sentence, sentence.contains("21") && sentence.contains("4"))
        assertFalse("never the old fallback", sentence.contains("30"))
        assertEquals("You get 21 Pro days per new account.", InviteCopy.rewardShort(21, TwoWords()))
        assertEquals("Recibes 21 días Pro por cada cuenta nueva.", InviteCopy.rewardShort(21, TwoWords(spanish = true)))
        val unpromised = Referral.fromJson(JSONObject("""{"code":"ABCD2345","url":"https://bobbyprotocol.xyz/i/ABCD2345","max":0,"rewardDays":21}"""))
        assertNull("a reward nobody can earn is not promised", InviteCopy.rewardTerms(unpromised, null, 5))
    }

    @Test fun theShareTextCarriesTheCodeInPlainWords() {
        val withCode = InviteCopy.shareMessage("ABCD2345", TwoWords())
        assertTrue(withCode.contains("ABCD2345"))
        assertTrue(withCode.startsWith(InviteCopy.shareMessage(null, TwoWords())))
        assertFalse(InviteCopy.shareMessage(null, TwoWords()).contains("ABCD2345"))
    }

    @Test fun inviteCopyKeepsToTheProductsWords() {
        // Every sentence the feature says exists in the four languages, whichever catalog holds its row.
        val said = listOf("A friend invited you to Bobby", "Accept", "The invitation you received was accepted",
            "The invitation you received was not accepted", "See details", "See why",
            "Invitation accepted. It counts for the friend who invited you.", "That is your own invitation.",
            "Invitations work for new accounts, during their first week.", "This account already accepted an invitation.",
            "Your friend already invited all the friends allowed.", "That invitation code is not valid.",
            "That invitation could not be applied.", "Sign in to accept an invitation.",
            "Bobby could not check that code right now. It is saved and will be tried again.",
            "Accept the risk notice first: until then Bobby sends nothing to its servers.",
            "Have a code?", "Invitation code", "Apply", "Applying…", "Saved on this phone.", "Invitation ready", "Invite a friend",
            "Remove", "Your invitation code", "Copy code", "Copied", "Share", "Details", "{0} of {1} friends",
            "Sign in for your link.", "Getting your link…", "Invite link unavailable.",
            "You get {0} Pro days per new account.", "New accounts only, within their first week.",
            "You get {0} days of Bobby Pro for each friend who creates an account with your invitation, up to {1} friends.",
            "My invitation code: {0}", "Bobby: three AI agents debate any stock or crypto before you decide.")
        val banned = listOf("buy", "sell", "profit", "guaranteed", "returns", "advice", "signal", "alert", "!")
        for (english in said) {
            val lower = english.lowercase()
            for (word in banned) assertFalse("$word in: $english", lower.contains(word))
            val row = V18Catalog.row(english)
            assertEquals(english, V18Catalog.LANGUAGES.toSet(), row.keys)
            for ((language, text) in row) {
                assertEquals("$english [$language]", V18Catalog.placeholders(english), V18Catalog.placeholders(text))
                assertFalse("Android never names an iPhone here: $english [$language]", text.contains("iPhone"))
            }
        }
        // The button's "in progress" label reads as an action, not as the noun "app".
        assertEquals("Vérification…", V18Catalog.text("Applying…", "fr"))
        assertEquals("Verifica in corso…", V18Catalog.text("Applying…", "it"))
    }
}
