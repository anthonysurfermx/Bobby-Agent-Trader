package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.CreditsLevel
import xyz.bobbyprotocol.android.v18.credits.FakeCreditsBackend
import xyz.bobbyprotocol.android.v18.credits.HeldMeters
import xyz.bobbyprotocol.android.v18.credits.LevelMeter
import xyz.bobbyprotocol.android.v18.credits.ReadAccess
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.notify.MemoryLocalNotifier

/**
 * The harness (1.8): what two adversarial reviews of slice 1 found on Android, each as the case
 * that shows it. Where a case runs a late phone, the test notifier is given a time zone: it then
 * asks `NoticeTiming` what the phone's worker asks, and shows only what a real phone would.
 *
 *  - Delivery: an Android phone shows a notice late, or not at all. Two follow-ups never land on
 *    one local day because of it, and only what was really shown is written as shown.
 *  - A no stays a no between the signed-out phone and an account, in both directions.
 *  - Bobby never leads into a wall: a chip runs at the level the person saved, so that level's own
 *    meter is asked too.
 *  - A yes that was erased is asked for again; a day is promised only when the phone will show it.
 *  - Follow-ups switched off in the phone's own settings (the channel) are a no from the phone.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HarnessReviewTest {
    private val raw = OpenStore()
    private var clock = at(7, 16, 40)
    private val phone = HarnessPhone(MemoryLocalNotifier { clock })
    private var consent = RiskNotice.ACCEPTED
    private var user: String? = null
    private var epoch = 1L
    private var reads: ReadAccess? = free(5)

    /** October 2026, local time in Mexico City. The 7th is a Wednesday, the 10th a Saturday. */
    private fun at(day: Int, hour: Int, minute: Int = 0): Long = HarnessDays.at(day, hour, minute)

    private fun free(left: Int) = ReadAccess("free", 20 - left, 20, left, null, true)

    private fun receipt(access: ReadAccess): JSONObject = JSONObject().put("tier", access.tier).put("used", access.used ?: JSONObject.NULL)
        .put("limit", access.limit ?: JSONObject.NULL).put("remaining", access.remaining ?: JSONObject.NULL)
        .put("resetsAt", access.resetsAt ?: JSONObject.NULL).put("paywall", access.paywall).put("bonus", access.bonus)

    private fun make(): HarnessCenter {
        val center = HarnessCenter(phone, HarnessStore(raw), HarnessWords.copy("en"))
        center.now = { clock }
        center.zone = { HarnessDays.mexico }
        center.consent = { consent }
        center.currentUser = { user }
        center.currentEpoch = { epoch }
        center.language = { "en" }
        center.access = { reads }
        center.forgetLines = { symbol, reader -> NudgeCenter.forget(listOf(HarnessNudges.movePrefix(symbol)), reader, raw) }
        center.linesKept = { reader -> NudgeCenter.count(HarnessNudges.movePrefix(), reader, raw) }
        center.load(user)
        return center
    }

    private fun ask(center: HarnessCenter, symbol: String) = center.noteAsk(symbol, symbol, true, 100.0)
    private fun sent(center: HarnessCenter): List<HarnessEvent> = center.ledger.events(HarnessEvent.Kind.SENT)
    private fun shown(): List<String> = phone.memory.deliverDue().map { it.id }
    private fun modeKey(owner: String?) = HarnessStore.key(HarnessStore.MODE_PREFIX, owner)
    private fun said(center: HarnessCenter): List<String> = center.notes.assets.flatMap { it.lines } + center.notes.general
    private fun switchTo(next: String?) {
        user = next
        epoch += 1
    }

    // Delivery: two follow-ups never share a local day

    /**
     * Asked on Saturday at 22:00: the asset on Sunday at 21:00, the week on Monday at 21:00. The
     * idle phone runs Sunday's work twenty minutes late, past the allowed hours, so it waits for
     * Monday 09:00. The week's work then runs on time on Monday evening.
     */
    @Test fun aFollowUpShownLateNeverSharesItsDayWithTheNextOne() = runTest {
        clock = at(10, 22)
        phone.memory.zone = HarnessDays.mexico
        val center = make()
        ask(center, "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertEquals(listOf(HarnessStep.ASSET to at(11, 21), HarnessStep.WEEK to at(12, 21)), center.upcoming.map { it.step to it.fireAt })
        clock = at(11, 21, 20)
        assertTrue("past the hour, and too late to be on time for it: it waits for the morning", shown().isEmpty())
        clock = at(12, 9)
        assertEquals(listOf("v18.follow.asset"), shown())
        clock = at(12, 21)
        assertTrue("the week was planned for this evening, and one follow-up was already shown today", shown().isEmpty())
        assertEquals("it is still to come", setOf("v18.follow.week"), phone.pendingIds())
        clock = at(13, 9)
        assertEquals("the next morning", listOf("v18.follow.week"), shown())
    }

    /** Asked on Saturday at 14:10; the phone is off on Sunday and back on Monday at 13:00. */
    @Test fun twoFollowUpsOfAPhoneThatWasOffAreNotShownAnHourApart() = runTest {
        clock = at(10, 14, 10)
        phone.memory.zone = HarnessDays.mexico
        val center = make()
        ask(center, "NVDA")
        center.accept()
        assertEquals(listOf(at(11, 14, 10), at(12, 14, 10)), center.upcoming.map { it.fireAt })
        clock = at(12, 13)
        assertEquals("late, and inside its day: shown", listOf("v18.follow.asset"), shown())
        clock = at(12, 14, 10)
        assertTrue("seventy minutes after the other one", shown().isEmpty())
        clock = at(13, 9)
        assertEquals(listOf("v18.follow.week"), shown())
    }

    // Delivery: only what was shown is written as shown

    @Test fun aFollowUpThePhoneDroppedIsNotWrittenAsShown() = runTest {
        phone.memory.zone = HarnessDays.mexico
        val center = make()
        ask(center, "NVDA")
        center.accept()
        assertEquals(at(8, 16, 40), center.upcoming.first().fireAt)
        // The phone was off for more than a day: its worker drops the notice unseen.
        clock = at(9, 18)
        assertTrue(shown().isEmpty())
        center.appActive()
        assertTrue("nobody saw it: it is not a follow-up that was shown", sent(center).isEmpty())
        assertEquals("and it is not one that went unanswered", 0, center.ledger.unansweredStreak(clock).count)
        assertFalse("the notes count nothing", said(center).any { it.startsWith("Follow-ups:") })
        assertEquals("the week is still to come", listOf(HarnessStep.WEEK), center.upcoming.map { it.step })
    }

    @Test fun aFollowUpShownLateIsWrittenWhenItWasShownAndCanStillBeAnswered() = runTest {
        phone.memory.zone = HarnessDays.mexico
        val center = make()
        ask(center, "NVDA")
        center.accept()
        // The phone was off through the day: it shows the notice 22 hours and 50 minutes late.
        clock = at(9, 15, 30)
        assertEquals(listOf("v18.follow.asset"), shown())
        center.appActive()
        assertEquals("written at the moment it was shown, not the one it was planned for", listOf(at(9, 15, 30)), sent(center).map { it.at })
        // Ninety minutes after it appeared they ask about it: that answers it.
        clock = at(9, 17)
        ask(center, "NVDA")
        assertEquals(1, center.ledger.events(HarnessEvent.Kind.RETURNED).size)
    }

    // The notes

    @Test fun theNotesSayADayOnlyWhenThePhoneWillShowTheFollowUp() = runTest {
        phone.memory.grantsWhenAsked = false
        val center = make()
        ask(center, "NVDA")
        assertEquals(HarnessCenter.Outcome.DENIED, center.accept())
        assertEquals("the plan is made: the glass still comes back to it", 2, center.upcoming.size)
        assertFalse("nothing will arrive, so no day is promised",
                    said(center).any { it.startsWith("Bobby comes back") || it.startsWith("Your week arrives") })
        // They allow Bobby's notifications in the phone's settings.
        phone.memory.permission = LocalNotifier.Permission.ALLOWED
        center.appActive()
        assertTrue(said(center).any { it.startsWith("Bobby comes back on ") })
        assertTrue(said(center).any { it.startsWith("Your week arrives on ") })
    }

    // Follow-ups switched off in the phone's settings

    /**
     * Android lets a person switch one kind of notice off by itself: a long press on a follow-up,
     * "Turn off notifications". Bobby's notifications as a whole stay allowed, and the system
     * silently discards every follow-up from then on.
     */
    @Test fun followUpsSwitchedOffInThePhonesSettingsAreANoFromThePhone() = runTest {
        val center = make()
        ask(center, "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertEquals(2, phone.pendingIds().size)
        phone.memory.channelsOff.add(LocalNotice.CHANNEL_FOLLOW_UPS)
        assertEquals("Bobby may still post its other notices", LocalNotifier.Permission.ALLOWED, phone.status())
        center.appActive()
        assertEquals("for follow-ups it is a no", LocalNotifier.Permission.DENIED, center.status)
        assertEquals("and the switch is told, as for a denied permission", LocalNotifier.Permission.DENIED, center.view.value.permission)
        assertFalse("no day is promised", said(center).any { it.startsWith("Bobby comes back") || it.startsWith("Your week arrives") })
        // The day passes. The system discarded the notice: nothing was shown, and nothing is written as shown.
        clock = at(9, 10)
        assertTrue(shown().isEmpty())
        center.appActive()
        assertTrue(sent(center).isEmpty())
        assertFalse(said(center).any { it.startsWith("Follow-ups:") })
        // A new question while it is off is planned, for the glass, and nothing is handed to the phone.
        val handed = phone.written.size
        ask(center, "TSLA")
        assertEquals(2, center.upcoming.size)
        assertEquals(handed, phone.written.size)
        // A second yes does not ask the system anything: the question was answered, and only the settings can change this.
        val asks = phone.memory.asked
        assertEquals(HarnessCenter.Outcome.DENIED, center.accept())
        assertEquals(asks, phone.memory.asked)
        // They switch it back on in the settings.
        phone.memory.channelsOff.clear()
        center.appActive()
        assertEquals(LocalNotifier.Permission.ALLOWED, center.status)
        assertEquals("what was planned is handed over now", setOf("v18.follow.asset", "v18.follow.week"), phone.pendingIds())
        assertTrue(phone.written.size > handed)
    }

    // A no stays a no, signed in or out

    /**
     * Monday: signed in with follow-ups on, they ask about NVDA and sign out. Signed out they ask
     * about TSLA, say yes, and then press Stop on its follow-up. Then they sign in again.
     */
    @Test fun aNoSaidSignedOutIsStillANoInAnAccountThatHadSaidYes() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA")
        center.accept()
        switchTo(null)
        center.accountChanged()
        clock = at(8, 10)
        ask(center, "TSLA")
        center.accept()
        center.stop(HarnessTap.from(phone.memory.notice("v18.follow.asset")!!.payload)!!)
        assertEquals(HarnessMode.OFF, center.mode)
        clock = at(9, 10)
        switchTo("u1")
        center.accountChanged()
        assertEquals("said after the account's yes, on this phone: it goes with them", HarnessMode.OFF, center.mode)
        assertEquals("off", raw.values[modeKey("u1")])
        assertTrue("and off keeps nothing", center.ledger.isEmpty)
        assertTrue("the week with NVDA never arrives", phone.pendingIds().isEmpty())
    }

    @Test fun aNoSaidInAnAccountIsStillANoOnceSignedOut() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA")
        center.accept()
        center.turnOff()
        switchTo(null)
        center.accountChanged()
        assertEquals("the same phone, signed out: the offer is not made again", HarnessMode.OFF, center.mode)
        assertEquals("off", raw.values[modeKey(null)])
        ask(center, "NVDA")
        assertTrue(center.ledger.isEmpty)
    }

    /** The no crosses because it is the later word. A yes said after it, in the account, is later still. */
    @Test fun aYesSaidLaterInTheAccountIsNotUndoneByTheNoThePhoneKept() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        center.turnOff()
        switchTo("u1")
        center.accountChanged()
        assertEquals("the no said signed out goes with them", HarnessMode.OFF, center.mode)
        assertEquals("and stays on the phone", "off", raw.values[modeKey(null)])
        // In the account they turn the switch on themselves.
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertNull("their latest word on this phone is a yes: the phone's no is lifted", raw.values[modeKey(null)])
        switchTo(null)
        center.accountChanged()
        assertEquals("signed out they are undecided again, never on by themselves", HarnessMode.UNDECIDED, center.mode)
        switchTo("u1")
        center.accountChanged()
        assertEquals("and the account keeps the yes they said last", HarnessMode.ON, center.mode)
        // An account that had said yes and signs out leaves the signed-out reader as it was.
        switchTo(null)
        center.accountChanged()
        assertNull(raw.values[modeKey(null)])
    }

    // A yes that was erased is asked for again

    @Test fun aYesThatWasErasedWithTheNotesIsAskedForAgain() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        bench.deliver(symbol = "NVDA")
        assertEquals(HarnessNudges.OFFER_ID, bench.host.nudgeJson()?.optString("id"))
        assertEquals("done", bench.host.nudgeAct(HarnessNudges.OFFER_ID).getString("status"))
        runCurrent()
        assertEquals(HarnessMode.ON, center.mode)
        // Memory's "Delete everything": the notes go, and the yes with them.
        bench.host.eraseEverything()
        runCurrent()
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        // Their next read, once the glass may speak again after a tap.
        bench.clock += 20 * 60_000L
        bench.deliver(requestId = "r2", symbol = "NVDA")
        assertEquals("before anything more is kept, the yes is asked for again", HarnessNudges.OFFER_ID, bench.host.nudgeJson()?.optString("id"))
    }

    // Bobby never leads into a wall: the level a chip runs at

    /**
     * A free account saved Max and used its Max reads. Its general meter still has reads, so the
     * question Bobby's CIO wrote (it runs at Quick) would be answered; a chip would not: it runs at
     * the level the person saved, and the server refuses that with the paywall behind it.
     */
    @Test fun aChipIsNotOfferedOnceTheLevelItRunsAtIsUsedUp() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val backend = FakeCreditsBackend()
        backend.held = HeldMeters("u1", bench.desk.accountEpoch, free(15), mapOf(
            CreditsLevel.PROFUNDO to LevelMeter(0, 6, 6, 0, 7, null), CreditsLevel.MAXIMO to LevelMeter(2, 2, 0, 0, 7, null)))
        CreditsCenter.of(bench.host, backend)
        HarnessNudges.register(bench.host)
        runCurrent()
        assertTrue("at Quick the home keeps its chips", bench.host.offersOneTapOnHome())
        bench.desk.analysisLevel = "profundo"
        assertTrue("and at Deep, which has reads left", bench.host.offersOneTapOnHome())
        assertTrue(bench.host.offersOneTapAfterRead(receipt(free(14))))
        bench.desk.analysisLevel = "maximo"
        assertFalse("a chip of the home would run at Max, and Max is used up", bench.host.offersOneTapOnHome())
        assertFalse("and so would a chip of the row after a read", bench.host.offersOneTapAfterRead(receipt(free(14))))
        // They choose another level: the chips are back.
        bench.desk.analysisLevel = "rapido"
        assertTrue(bench.host.offersOneTapOnHome())
        assertTrue(bench.host.offersOneTapAfterRead(receipt(free(13))))
    }

    /** The read that spends the last one of a level: the phone has not heard the new balance when its row is drawn. */
    @Test fun theLastReadOfALevelTakesTheChipsOffItsOwnRow() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val backend = FakeCreditsBackend()
        fun balance(maxLeft: Int) = HeldMeters("u1", bench.desk.accountEpoch, free(15), mapOf(
            CreditsLevel.PROFUNDO to LevelMeter(0, 6, 6, 0, 7, null), CreditsLevel.MAXIMO to LevelMeter(2 - maxLeft, 2, maxLeft, 0, 7, null)))
        backend.held = balance(1)
        CreditsCenter.of(bench.host, backend)
        HarnessNudges.register(bench.host)
        runCurrent()
        bench.desk.analysisLevel = "maximo"
        assertTrue("one Max read is left: the home keeps its chips", bench.host.offersOneTapOnHome())
        // They type their last Max question, and it is answered.
        assertFalse("a chip of its row would be one more Max read", bench.host.offersOneTapAfterRead(receipt(free(14)), "maximo"))
        assertFalse("and so would a chip of the home", bench.host.offersOneTapOnHome())
        // The balance arrives and says the same.
        backend.held = balance(0)
        assertFalse(bench.host.offersOneTapOnHome())
        // A gifted Max read, or the week turning over, opens it again; a read Bobby started (Quick) takes nothing from Max.
        backend.held = balance(1)
        assertTrue(bench.host.offersOneTapOnHome())
        assertTrue(bench.host.offersOneTapAfterRead(receipt(free(13)), "rapido"))
        assertTrue(bench.host.offersOneTapOnHome())
        // Not knowing a level's count is a no after a read and changes nothing on the home.
        backend.held = HeldMeters("u1", bench.desk.accountEpoch, free(12), emptyMap())
        assertFalse(bench.host.offersOneTapAfterRead(receipt(free(12)), "rapido"))
        assertTrue(bench.host.offersOneTapOnHome())
        // Bobby Pro: a level that ran out is a notice with "Continue with Quick", not a sign-in or a paywall.
        backend.held = balance(0)
        val pro = ReadAccess("pro", 40, null, null, null, false)
        assertTrue(bench.host.offersOneTapAfterRead(receipt(pro), "maximo"))
        assertTrue(bench.host.offersOneTapOnHome())
    }

    @Test fun theLevelsOwnAllowanceIsAskedOnlyWhereItIsAWall() {
        val deep = LevelMeter(5, 6, 1, 0, 7, null)
        val spentUp = LevelMeter(6, 6, 0, 0, 7, null)
        assertEquals("Quick is the receipt's own meter", true, HarnessWall.levelOpen("rapido", free(0), null))
        assertEquals(true, HarnessWall.levelOpen("profundo", free(5), deep))
        assertEquals("the read just answered took the last one", false, HarnessWall.levelOpen("profundo", free(5), deep, spent = 1))
        assertEquals(false, HarnessWall.levelOpen("profundo", free(5), spentUp))
        assertEquals("a gifted read of that level", true, HarnessWall.levelOpen("profundo", free(5), LevelMeter(6, 6, 0, 1, 7, null)))
        assertEquals("a guest's Deep allowance, with the sign-in behind it", false, HarnessWall.levelOpen("profundo", ReadAccess("anon", 2, 6, 4, null, true), spentUp))
        assertEquals("Bobby Pro meets a notice, not a wall", true, HarnessWall.levelOpen("maximo", ReadAccess("pro", 40, null, null, null, false), spentUp))
        assertNull("no count: the phone cannot tell", HarnessWall.levelOpen("maximo", free(5), null))
        assertNull(HarnessWall.levelOpen("maximo", free(5), LevelMeter(null, 2, null, 0, 7, null)))
        assertEquals("by what was used, when that is what the server sent", false, HarnessWall.levelOpen("maximo", free(5), LevelMeter(2, 2, null, 0, 7, null)))
        assertNull("a receipt the phone does not have changes nothing about the level", HarnessWall.levelOpen("maximo", null, null))
        assertEquals(false, HarnessWall.levelOpen("maximo", null, spentUp))
    }
}
