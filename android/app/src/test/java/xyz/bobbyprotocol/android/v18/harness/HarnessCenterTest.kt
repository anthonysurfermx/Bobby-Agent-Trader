package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.notify.MemoryLocalNotifier

/**
 * The phone's notifier as the harness suites see it: the foundation's in-memory one, plus what
 * the iOS fake lets a test do (act while the system is asking, count what was written and cancelled).
 */
internal class HarnessPhone(val memory: MemoryLocalNotifier) : LocalNotifier by memory {
    /** Runs while the system's question is on screen, before the person answers. */
    var whileAsking: (suspend () -> Unit)? = null
    val written = ArrayList<LocalNotice>()
    val cancelled = ArrayList<String>()

    override suspend fun requestPermission(): Boolean {
        whileAsking?.invoke()
        return memory.requestPermission()
    }

    override fun schedule(notice: LocalNotice): Boolean = memory.schedule(notice).also { if (it) written.add(notice) }

    override fun cancel(ids: Collection<String>) {
        cancelled.addAll(ids)
        memory.cancel(ids)
    }
}

/**
 * The harness (1.8), the phone's side: from the first question, with permission asked only on the
 * person's own yes, the plan handed to the phone, and what happens to it written back into the
 * ledger. The cases of ios/Bobby/Tests/HarnessCenterTests.swift; where iOS pins how its
 * notification centre behaves, these pin the Android notifier instead (see each note).
 */
class HarnessCenterTest {
    private val raw = OpenStore()
    private var clock = at(7, 16, 40)
    private val phone = HarnessPhone(MemoryLocalNotifier { clock })
    private var consent = RiskNotice.ACCEPTED
    private var user: String? = null
    private var epoch = 1L
    private var language = "en"
    private val prices = HashMap<String, Double>()
    private val quoted = ArrayList<String>()
    private var redraws = 0

    /** Wednesday 7 October 2026, local time. */
    private fun at(day: Int, hour: Int, minute: Int = 0): Long = HarnessDays.at(day, hour, minute)

    private fun make(): HarnessCenter {
        val center = HarnessCenter(phone, HarnessStore(raw), HarnessWords.copy { language })
        center.now = { clock }
        center.zone = { HarnessDays.mexico }
        center.consent = { consent }
        center.currentUser = { user }
        center.currentEpoch = { epoch }
        center.weeklyCovered = { false }
        center.language = { language }
        center.market = { symbol ->
            quoted.add(symbol)
            prices[symbol]?.let { HarnessQuote(it, null) }
        }
        center.changed = { redraws += 1 }
        center.load(user)
        return center
    }

    private fun ask(center: HarnessCenter, symbol: String, price: Double? = 100.0, equity: Boolean = true) {
        center.noteAsk(symbol, symbol, equity, price)
    }

    private fun events(center: HarnessCenter, kind: HarnessEvent.Kind): List<HarnessEvent> = center.ledger.events(kind)
    private fun kinds(plan: List<HarnessFollowUp>): List<HarnessStep> = plan.map { it.step }
    private fun pending(): Set<String> = phone.pendingIds()
    private fun notice(step: HarnessStep): LocalNotice? = phone.memory.notice(HarnessPlanner.IDENTIFIER_PREFIX + step.raw)
    private fun switchTo(next: String?) {
        user = next
        epoch += 1
    }

    /** What one question gets from the chain that ships: the asset, then the week. */
    private val all = listOf(HarnessStep.ASSET, HarnessStep.WEEK)

    // From the first question

    @Test fun theFirstQuestionIsRecordedAndNothingIsScheduledOrAsked() {
        val center = make()
        ask(center, "NVDA")
        assertEquals("registered from the first question", listOf("NVDA"), events(center, HarnessEvent.Kind.ASK).map { it.symbol })
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertEquals(emptyList<HarnessFollowUp>(), center.upcoming)
        assertTrue(phone.written.isEmpty())
        assertEquals("the system is never asked before the person says yes", 0, phone.memory.asked)
        assertEquals("it survives a relaunch", 1, HarnessStore(raw).ledger(null).events.size)
    }

    @Test fun nothingIsRecordedBeforeTheRiskNotice() = runTest {
        consent = RiskNotice.WITHDRAWN
        val center = make()
        ask(center, "NVDA")
        assertTrue(center.ledger.isEmpty)
        assertEquals(HarnessCenter.Outcome.CONSENT_REQUIRED, center.accept())
        assertEquals(0, phone.memory.asked)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        consent = RiskNotice.OUTDATED
        ask(center, "NVDA")
        assertTrue("a notice that waits to be read again starts nothing new", center.ledger.isEmpty)
        assertEquals(HarnessCenter.Outcome.CONSENT_REQUIRED, center.accept())
    }

    @Test fun sayingYesAsksThePhoneOnceAndSchedulesTheFollowUpsOfThatQuestion() = runTest {
        val center = make()
        ask(center, "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertEquals(1, phone.memory.asked)
        assertEquals(HarnessMode.ON, center.mode)
        assertEquals(all, kinds(center.upcoming))
        assertEquals(setOf("v18.follow.asset", "v18.follow.week"), pending())
        val asset = notice(HarnessStep.ASSET)!!
        assertEquals(at(8, 16, 40), asset.fireAtEpochMs)
        assertEquals("Bobby", asset.title)
        assertEquals(LocalNotice.CHANNEL_FOLLOW_UPS, asset.channel)
        assertEquals("follow-up", asset.payload[LocalNotice.KIND])
        assertEquals("asset", asset.payload["step"])
        assertEquals("NVDA", asset.payload["symbol"])
        assertEquals("signed out: no account to tag", "local", asset.payload[LocalNotice.OWNER])
        assertEquals(at(8, 16, 40).toString(), asset.payload["at"])
        assertNull("the chain that ships has no sector", notice(HarnessStep.SECTOR))
        assertEquals("the week, the Monday after", at(12, 16, 40), notice(HarnessStep.WEEK)?.fireAtEpochMs)
        // A second yes does not ask the system again, and writes nothing twice.
        val writes = phone.written.size
        center.accept()
        assertEquals(1, phone.memory.asked)
        assertEquals(writes, phone.written.size)
    }

    @Test fun theLockScreenNamesTheAssetAndNoFigure() = runTest {
        val center = make()
        ask(center, "NVDA", price = 187.42)
        center.accept()
        assertEquals(2, phone.memory.scheduled.size)
        for (planned in phone.memory.scheduled) {
            assertFalse("no price on the lock screen", planned.body.contains("187"))
            assertFalse("no figure the phone has not read", planned.body.contains("%"))
            assertFalse(planned.body.contains("$"))
            assertTrue("a notice the phone can keep and hand back", LocalNotice.valid(planned))
            assertTrue("one notice per step, replaced in place", planned.id in HarnessCenter.IDENTIFIERS)
        }
        assertEquals("NVDA, a day later. See how it moved.", notice(HarnessStep.ASSET)?.body)
        assertEquals("Your week with NVDA.", notice(HarnessStep.WEEK)?.body)
    }

    /** iOS pins its calendar trigger here; on Android the notice carries one planned instant. */
    @Test fun whatThePhoneIsHandedIsWhatATapReadsBack() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        val planned = notice(HarnessStep.WEEK)!!
        assertEquals("the very minute the plan chose", at(12, 16, 40), planned.fireAtEpochMs)
        assertEquals("whose it is and when it was for",
                     HarnessTap(HarnessStep.WEEK, "NVDA", null, owner = "local", stamp = at(12, 16, 40)), HarnessTap.from(planned.payload))
        assertTrue(center.accepts(HarnessTap.from(planned.payload)!!))
    }

    @Test fun whenThePhoneSaysNoFollowUpsStayInsideTheApp() = runTest {
        phone.memory.grantsWhenAsked = false
        val center = make()
        ask(center, "NVDA")
        assertEquals(HarnessCenter.Outcome.DENIED, center.accept())
        assertEquals("they said yes to Bobby: the glass still comes back to it", HarnessMode.ON, center.mode)
        assertEquals(LocalNotifier.Permission.DENIED, center.status)
        assertTrue(phone.written.isEmpty())
        // The day passes: nothing was shown, so nothing is written as shown.
        clock = at(9, 10)
        center.appActive()
        assertEquals(emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.SENT))
        // A no is not asked about again.
        center.accept()
        assertEquals(1, phone.memory.asked)
    }

    @Test fun anAccountSwitchWhileTheSystemAsksChangesNothing() = runTest {
        val center = make()
        ask(center, "NVDA")
        phone.whileAsking = { epoch += 1 }
        assertEquals(HarnessCenter.Outcome.FAILED, center.accept())
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertTrue(phone.written.isEmpty())
        assertFalse("the switch is free again", center.saving)
    }

    @Test fun everyNewQuestionMovesThePlanToThatAsset() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(7, 19)
        ask(center, "SOL", equity = false)
        assertEquals("SOL", center.upcoming.firstOrNull()?.symbol)
        assertEquals(at(8, 19), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        assertEquals("one pending notice per step, replaced in place", 2, pending().size)
    }

    // What happened to a follow-up

    @Test fun aFollowUpWhoseMomentPassedIsWrittenOnceAndTheNextOnesStay() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(9, 8)                              // the asset came due yesterday at 16:40; nobody came
        phone.memory.deliverDue()
        center.appActive()
        center.appActive()
        assertEquals("written once", listOf(HarnessStep.ASSET), events(center, HarnessEvent.Kind.SENT).map { it.step })
        assertEquals("at the moment it was planned for, whenever the phone showed it", at(8, 16, 40), events(center, HarnessEvent.Kind.SENT).first().at)
        assertEquals("opening the app is not an answer", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        assertEquals("ignored: the week on Monday is what is left", listOf(HarnessStep.WEEK), kinds(center.upcoming))
        assertEquals(at(12, 16, 40), notice(HarnessStep.WEEK)?.fireAtEpochMs)
        assertTrue("opening the app is not written down either", events(center, HarnessEvent.Kind.APP_OPEN).isEmpty())
    }

    @Test fun tappingAFollowUpIsWrittenDownAndBringsNothingMore() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 18)
        phone.memory.deliverDue()
        center.appActive()
        assertEquals("back in the app is not yet an answer", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        val before = center.upcoming
        center.opened(HarnessTap(HarnessStep.ASSET, "NVDA", null))
        assertEquals("the tap is kept", listOf(HarnessStep.ASSET), events(center, HarnessEvent.Kind.OPENED).map { it.step })
        assertEquals("and is not an answer", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        assertEquals(1, center.ledger.unansweredStreak(clock).count)
        assertEquals("a tap alone restarts nothing", before, center.upcoming)
        assertEquals("no second follow-up about NVDA tomorrow", listOf(HarnessStep.WEEK), kinds(center.upcoming))
        assertNull(notice(HarnessStep.ASSET))
        assertEquals("the glass still shows what they tapped", "NVDA", center.move?.symbol)
    }

    @Test fun aTapFollowedBySomethingUsefulIsAnAnswer() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 18)
        phone.memory.deliverDue()
        center.opened(HarnessTap(HarnessStep.ASSET, "NVDA", null, owner = "local", stamp = at(8, 16, 40)))
        assertEquals(emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        clock = at(8, 18, 1)
        center.notePicked("NVDA")                      // "What changed?" on the glass
        center.noteAsk("NVDA", "NVDA", true, 101.0, origin = HarnessEvent.Origin.FOLLOW_UP)   // the read Bobby starts
        assertEquals("having tapped it does not stop it from being answered, once", listOf<Long?>(at(8, 16, 40)), events(center, HarnessEvent.Kind.RETURNED).map { it.ref })
        assertEquals(0, center.ledger.unansweredStreak(clock).count)
        assertEquals(1, center.profile.answered[HarnessStep.ASSET])
    }

    @Test fun aReadBobbyStartedIsWrittenWithItsOriginAndStartsNoChain() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 18)
        phone.memory.deliverDue()
        center.appActive()
        center.notePicked("NVDA")
        center.noteAsk("NVDA", "NVDA", true, 101.0, origin = HarnessEvent.Origin.FOLLOW_UP, thread = true, horizon = HarnessHorizon.INTRADAY)
        val asks = events(center, HarnessEvent.Kind.ASK)
        assertEquals(listOf(null, HarnessEvent.Origin.FOLLOW_UP), asks.map { it.origin })
        assertNull("a read Bobby started is never the person's second question", asks.last().thread)
        assertEquals("the chain still belongs to what they asked", at(7, 16, 40), center.ledger.question(clock)?.at)
        assertEquals("an answer to the chain, never a new one", listOf(HarnessStep.WEEK), kinds(center.upcoming))
        assertEquals(at(12, 16, 40), center.upcoming.firstOrNull()?.fireAt)
        assertEquals(1, events(center, HarnessEvent.Kind.RETURNED).size)
        // And with no question of their own behind it, nothing is planned at all.
        center.turnOff()
        HarnessStore(raw).forget(null)
        val alone = make()
        alone.noteAsk("TSLA", "TSLA", true, 300.0, origin = HarnessEvent.Origin.FOLLOW_UP)
        alone.accept()
        assertEquals(HarnessMode.ON, alone.mode)
        assertEquals(emptyList<HarnessFollowUp>(), alone.upcoming)
        assertEquals(0, pending().size)
    }

    @Test fun aChipStartsNoChainOnceFollowUpsAreOnAndIsKeptAsAQuestionBeforeTheYes() = runTest {
        // Before the yes there is no chain to protect: a chip (Bobby wrote the words, the person picked the
        // asset) is kept the way a question is, and the yes to "Shall I keep you posted on BTC?" follows it.
        val center = make()
        center.noteAsk("BTC", "Bitcoin", false, 60_000.0, origin = HarnessEvent.Origin.FOLLOW_UP, chip = true)
        assertEquals(listOf<HarnessEvent.Origin?>(null), events(center, HarnessEvent.Kind.ASK).map { it.origin })
        center.accept()
        assertEquals("the read that prompted the yes is followed up", listOf<String?>("BTC", "BTC"), center.upcoming.map { it.symbol })
        assertEquals(all, kinds(center.upcoming))
        // From the yes on, only their own words start a chain: the same chip is a read Bobby started.
        clock = at(7, 19)
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, origin = HarnessEvent.Origin.FOLLOW_UP, chip = true)
        assertEquals(listOf(null, HarnessEvent.Origin.FOLLOW_UP), events(center, HarnessEvent.Kind.ASK).map { it.origin })
        assertEquals("the chain is still BTC's, at the hour they asked", "BTC", center.ledger.question(clock)?.symbol)
        assertEquals(listOf(HarnessStep.ASSET to at(8, 16, 40), HarnessStep.WEEK to at(12, 16, 40)), center.upcoming.map { it.step to it.fireAt })
        assertEquals("BTC", center.upcoming.firstOrNull()?.symbol)
        // A read Bobby started that is not a chip (the question after a read, a follow-up's button) is
        // written with its origin before the yes too, so a later yes never follows it.
        center.turnOff()
        HarnessStore(raw).forget(null)
        val undecided = make()
        undecided.noteAsk("TSLA", "Tesla", true, 300.0, origin = HarnessEvent.Origin.FOLLOW_UP)
        assertEquals(listOf<HarnessEvent.Origin?>(HarnessEvent.Origin.FOLLOW_UP), events(undecided, HarnessEvent.Kind.ASK).map { it.origin })
        assertNull(undecided.ledger.question(clock))
    }

    @Test fun savingAReadOfTheAssetAnswersItsFollowUp() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 18)
        phone.memory.deliverDue()
        center.appActive()
        center.noteSaved("TSLA")
        assertEquals("a save of something else is not", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        center.noteSaved("NVDA")
        assertEquals(listOf<Long?>(at(8, 16, 40)), events(center, HarnessEvent.Kind.RETURNED).map { it.ref })
        assertEquals(2, events(center, HarnessEvent.Kind.SAVED).size)
        assertEquals("answered, and the week is still what is left", listOf(HarnessStep.WEEK), kinds(center.upcoming))
    }

    @Test fun aFollowUpThatComesDueWhileTheyAreInTheAppShowsOnTheGlass() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 16, 41)
        // The host keeps the due notice off the notification shade and tells the centre instead.
        phone.memory.cancel(listOf("v18.follow.asset"))
        center.firedInForeground(HarnessTap(HarnessStep.ASSET, "NVDA", null))
        assertEquals(1, events(center, HarnessEvent.Kind.SENT).size)
        assertEquals("shown is not answered", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        assertEquals("the glass says it instead", "NVDA", center.move?.symbol)
    }

    @Test fun actingOnAFollowUpWithoutTappingItIsAnAnswerAndOpeningTheAppIsNot() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 18)                              // shown at 16:40; they open the app by themselves
        phone.memory.deliverDue()
        prices["NVDA"] = 101.0
        center.appActive()
        assertEquals(emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        assertEquals("nothing answered: the plan goes on as if ignored", listOf(HarnessStep.WEEK), kinds(center.upcoming))
        center.notePicked("NVDA")                      // "What changed?" on the glass
        assertEquals("that answers the follow-up they were shown", listOf<Long?>(at(8, 16, 40)), events(center, HarnessEvent.Kind.RETURNED).map { it.ref })
        assertEquals("answered: what the question had left, the week, and no second follow-up about the asset", listOf(HarnessStep.WEEK), kinds(center.upcoming))
        assertEquals("at the hour of the question, not of the answer", at(12, 16, 40), center.upcoming.firstOrNull()?.fireAt)
        assertEquals(0, center.ledger.unansweredStreak(clock).count)
        center.notePicked("NVDA")
        assertEquals("one answer per follow-up", 1, events(center, HarnessEvent.Kind.RETURNED).size)
    }

    @Test fun askingAboutSomethingElseDoesNotAnswerAnAssetFollowUp() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 18)
        phone.memory.deliverDue()
        center.appActive()
        ask(center, "BTC", equity = false)
        assertEquals("a question about another asset is a new thread, not an answer", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        clock = at(8, 19)
        ask(center, "NVDA")
        assertEquals("asking about that asset within a day is", 1, events(center, HarnessEvent.Kind.RETURNED).size)
        assertEquals("and what follows belongs to that question, their own", at(8, 19), center.ledger.question(clock)?.at)
        assertEquals(listOf(HarnessStep.ASSET to at(9, 19), HarnessStep.WEEK to at(12, 19)), center.upcoming.map { it.step to it.fireAt })
    }

    @Test fun afterTheAssetAndTheWeekBobbyGoesQuiet() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(13, 9)                             // Tuesday after the Monday week
        phone.memory.deliverDue()
        center.appActive()
        assertEquals(all, events(center, HarnessEvent.Kind.SENT).map { it.step })
        assertEquals(emptyList<HarnessFollowUp>(), center.upcoming)
        assertEquals(0, pending().size)
    }

    /** The commonest person: asks about once a week and never opens a follow-up. */
    @Test fun twoQuestionsAndNoAppOpenNeverDeliverAFourthUnansweredInARow() = runTest {
        clock = at(1, 14, 10)                           // Thursday 1
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(6, 15, 0)                            // Tuesday 6: the asset (Fri 2) and the week (Mon 5) arrived unopened
        assertEquals(setOf("v18.follow.asset", "v18.follow.week"), phone.memory.deliverDue().map { it.id }.toSet())
        center.appActive()
        ask(center, "NVDA")
        assertEquals("the question came more than a day after the week: it answers nothing", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.RETURNED))
        assertEquals(2, center.ledger.unansweredStreak(clock).count)
        // What the phone holds now is everything that arrives if the app is not opened again.
        assertEquals("the third in a row, and no fourth behind it", setOf("v18.follow.asset"), pending())
        assertEquals(at(7, 15, 0), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        assertEquals(listOf(HarnessStep.ASSET), kinds(center.upcoming))
        clock = at(20, 9)
        phone.memory.deliverDue()
        center.appActive()
        assertEquals(listOf(at(2, 14, 10), at(5, 14, 10), at(7, 15, 0)), events(center, HarnessEvent.Kind.SENT).map { it.at })
        assertEquals("three, then quiet", 3, center.ledger.unansweredStreak(clock).count)
        assertEquals(0, pending().size)
    }

    @Test fun openingTheAppJustBeforeAFollowUpDoesNotCancelIt() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 16, 39) + 30_000L                // thirty seconds before its moment
        center.appActive()
        assertEquals("what the phone already holds stays", at(8, 16, 40), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        assertFalse(phone.cancelled.contains("v18.follow.asset"))
        assertEquals(HarnessStep.ASSET, center.upcoming.firstOrNull()?.step)
        // After a relaunch the centre no longer knows what it handed over, so it hands the plan over
        // again; but a notice inside its last seconds is left to the phone as it is.
        clock = at(8, 16, 39) + 57_000L
        val writes = phone.written.size
        val relaunched = make()
        relaunched.appActive()
        assertTrue(phone.written.drop(writes).none { it.id == "v18.follow.asset" })
        assertEquals(at(8, 16, 40), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        assertEquals(2, pending().size)
    }

    @Test fun aFollowUpThatWasShownCountsEvenIfThePermissionIsTakenAwayAfterwards() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 16, 46)                           // shown at 16:40; notifications turned off at 16:45
        phone.memory.deliverDue()
        phone.memory.permission = LocalNotifier.Permission.DENIED
        center.appActive()
        assertEquals("it reached the person: the limits count it", listOf(HarnessStep.ASSET), events(center, HarnessEvent.Kind.SENT).map { it.step })
        assertEquals(LocalNotifier.Permission.DENIED, center.status)
    }

    @Test fun aTapHonouredLateNeitherAnswersItAgainNorTakesTheAnswerBack() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 17)
        phone.memory.deliverDue()
        center.appActive()
        center.notePicked("NVDA")                      // they acted on the line before the tap was honoured
        assertEquals(1, events(center, HarnessEvent.Kind.RETURNED).size)
        clock = at(8, 17, 12)                           // a sheet kept the tap waiting twelve minutes
        val tap = HarnessTap(HarnessStep.ASSET, "NVDA", null, owner = "local", stamp = at(8, 16, 40))
        center.opened(tap)
        center.opened(tap)
        assertEquals("the answer they gave stays an answer, and there is still one", listOf<Long?>(at(8, 16, 40)), events(center, HarnessEvent.Kind.RETURNED).map { it.ref })
        assertEquals("the tap is written once", 1, events(center, HarnessEvent.Kind.OPENED).size)
        assertEquals(at(8, 16, 40), events(center, HarnessEvent.Kind.OPENED).first().ref)
        assertEquals("and what is stored says the same", HarnessStore(raw).ledger(null), center.ledger)
    }

    /**
     * iOS guards a sync that is still writing when the plan changes. On Android handing the plan
     * over is one step; the only wait is the system's question, and an opt-out during it is the last word.
     */
    @Test fun anOptOutWhileTheSystemIsAskingIsNeverUndone() = runTest {
        val center = make()
        ask(center, "NVDA")
        phone.whileAsking = { center.turnOff() }
        assertEquals(HarnessCenter.Outcome.FAILED, center.accept())
        assertEquals(HarnessMode.OFF, center.mode)
        assertEquals("nothing arrives after they said no", 0, pending().size)
        assertEquals(emptyList<HarnessFollowUp>(), center.upcoming)
        assertEquals(HarnessMode.OFF, HarnessStore(raw).mode(null))
    }

    // Off, withdrawn, another reader

    @Test fun turningFollowUpsOffErasesAndCancels() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        center.turnOff()
        assertEquals(HarnessMode.OFF, center.mode)
        assertTrue(center.ledger.isEmpty)
        assertEquals(0, pending().size)
        assertEquals(HarnessLedger(), HarnessStore(raw).ledger(null))
        // Off means off: a new question is not written down.
        ask(center, "TSLA")
        assertTrue(center.ledger.isEmpty)
        assertNull(center.dueAsset())
        // And back on starts from nothing.
        center.accept()
        assertEquals(HarnessMode.ON, center.mode)
        assertEquals(emptyList<HarnessFollowUp>(), center.upcoming)
    }

    @Test fun withdrawingTheRiskNoticeErasesEverything() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        consent = RiskNotice.OUTDATED
        center.consentChanged()
        center.appActive()
        assertEquals("a newer notice to read withdrew nothing", 2, pending().size)
        consent = RiskNotice.WITHDRAWN
        center.consentChanged()
        assertTrue(center.ledger.isEmpty)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertEquals(0, pending().size)
        assertTrue("nothing of this reader stays on the phone", raw.values.isEmpty())
    }

    @Test fun anotherAccountNeverReceivesThePreviousReadersFollowUps() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA")
        center.accept()
        assertEquals(2, pending().size)
        assertEquals(V18Reader.tag("u1"), notice(HarnessStep.ASSET)?.payload?.get(LocalNotice.OWNER))
        assertFalse("a tag, never the account id", notice(HarnessStep.ASSET)!!.payload.getValue(LocalNotice.OWNER).contains("u1"))
        // One was already delivered when the next person signs in.
        clock = at(8, 17)
        phone.memory.deliverDue()
        assertEquals(1, phone.memory.delivered.size)
        switchTo("u2")
        center.accountChanged()
        assertEquals(0, pending().size)
        assertEquals("what was on the lock screen goes too", 0, phone.memory.delivered.size)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertTrue(center.ledger.isEmpty)
        // A tap on a notification planned for the first reader does nothing for the second.
        val theirs = HarnessTap(HarnessStep.ASSET, "NVDA", null, owner = V18Reader.tag("u1"), stamp = at(8, 16, 40))
        assertFalse(center.accepts(theirs))
        center.opened(theirs)
        assertTrue(center.ledger.isEmpty)
        assertNull(center.move)
        // The first reader comes back: their ledger is still theirs, and the plan is made again.
        switchTo("u1")
        center.accountChanged()
        assertEquals(listOf("NVDA"), events(center, HarnessEvent.Kind.ASK).map { it.symbol })
        assertEquals("what they were shown before leaving was written down", listOf(HarnessStep.ASSET), events(center, HarnessEvent.Kind.SENT).map { it.step })
        assertEquals("and is not sent again", setOf("v18.follow.week"), pending())
    }

    @Test fun signingInKeepsWhatThePhoneLearnedSignedOut() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        switchTo("u1")
        center.accountChanged()
        assertEquals("the first question was asked signed out", listOf("NVDA"), events(center, HarnessEvent.Kind.ASK).map { it.symbol })
        assertEquals(HarnessMode.ON, center.mode)
        assertEquals(2, pending().size)
        assertEquals("the follow-ups are now the account's", V18Reader.tag("u1"), notice(HarnessStep.ASSET)?.payload?.get(LocalNotice.OWNER))
        assertEquals("it moved: nothing stays under the signed-out reader", HarnessLedger(), HarnessStore(raw).ledger(null))
        // Signing out does not hand the account's ledger to whoever uses the phone next.
        switchTo(null)
        center.accountChanged()
        assertTrue(center.ledger.isEmpty)
        assertEquals(0, pending().size)
    }

    /** iOS merges first; an account that said no keeps nothing, so on Android nothing is moved into it. */
    @Test fun signingIntoAnAccountThatSaidNoKeepsNothing() = runTest {
        HarnessStore(raw).write(HarnessMode.OFF, "u1")
        val center = make()
        ask(center, "NVDA")
        center.accept()
        switchTo("u1")
        center.accountChanged()
        assertEquals(HarnessMode.OFF, center.mode)
        assertTrue(center.ledger.isEmpty)
        assertEquals(0, pending().size)
        assertEquals(setOf(HarnessStore.key(HarnessStore.MODE_PREFIX, "u1")), raw.values.keys)
    }

    @Test fun twoAccountChangesInARowEndOnTheReaderWhoIsThere() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA")
        center.accept()
        // u1 → u2 starts and, before it finishes, the session is already u3.
        switchTo("u2")
        val first = launch(start = CoroutineStart.UNDISPATCHED) { center.accountChanged() }
        switchTo("u3")
        val second = launch(start = CoroutineStart.UNDISPATCHED) { center.accountChanged() }
        first.join()
        second.join()
        assertEquals("u3", center.owner)
        assertTrue(center.ledger.isEmpty)
        assertEquals(0, pending().size)
    }

    @Test fun deleteEverythingForgetsTheLedgerAndCancels() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        center.erasedEverything("someone-else")
        assertEquals("another reader's Delete everything touches nothing here", 2, pending().size)
        center.erasedEverything(null)
        assertTrue(center.ledger.isEmpty)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertEquals(0, pending().size)
        assertTrue(raw.values.isEmpty())
    }

    /** Android: the account's deletion runs just before the sign-out; nothing may be written back between the two. */
    @Test fun deletingTheAccountLeavesNothingOfItToWriteBack() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA")
        center.accept()
        clock = at(8, 17)                               // one follow-up was already shown
        phone.memory.deliverDue()
        center.accountDeleted("u1")
        assertEquals(0, pending().size)
        assertEquals(0, phone.memory.delivered.size)
        assertTrue(raw.values.isEmpty())
        switchTo(null)
        center.accountChanged()
        assertTrue("the reader who left was not written down again", raw.values.keys.none { it.contains("u1") })
        assertTrue(center.ledger.isEmpty)
        assertNull(center.owner)
        // Someone else's deletion removes only theirs.
        ask(center, "BTC", equity = false)
        HarnessStore(raw).write(HarnessMode.ON, "u9")
        center.accountDeleted("u9")
        assertEquals(setOf(HarnessStore.key(HarnessStore.PREFIX, null)), raw.values.keys)
    }

    // The line on the glass

    @Test fun comingBackADayLaterShowsTheMoveWithItsNumber() = runTest {
        val center = make()
        ask(center, "NVDA", price = 100.0)
        assertNull("they just asked: nothing to come back to yet", center.dueAsset())
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        center.appActive()
        assertEquals("NVDA", center.move?.symbol)
        assertEquals(2.3, center.move?.pct ?: 0.0, 0.001)
        assertEquals(1, center.move?.days)
        assertEquals("one price read that costs no read", listOf("NVDA"), quoted)
        assertTrue(redraws > 0)
        assertEquals(center.move, center.moveOnGlass())
        // Minutes later the price is not read again.
        clock = at(8, 17, 5)
        center.refreshMove()
        assertEquals(listOf("NVDA"), quoted)
    }

    @Test fun withoutAPriceTheLineHasNoNumber() = runTest {
        val center = make()
        ask(center, "NVDA", price = null)
        clock = at(9, 17)
        prices["NVDA"] = 50.0
        center.appActive()
        assertEquals("NVDA", center.move?.symbol)
        assertNull("no price at the question: no number is invented", center.move?.pct)
        assertEquals(2, center.move?.days)
    }

    @Test fun askingAgainOrActingOnItClearsTheLine() = runTest {
        val center = make()
        ask(center, "NVDA", price = 100.0)
        clock = at(8, 17)
        prices["NVDA"] = 99.0
        center.appActive()
        assertNotNull(center.move)
        center.notePicked("NVDA")
        assertNull(center.move)
        assertEquals(1, events(center, HarnessEvent.Kind.PICKED).size)
        ask(center, "NVDA", price = 99.0)
        center.refreshMove()
        assertNull("they are looking at it now", center.move)
    }

    @Test fun aTappedFollowUpPutsItsAssetOnTheGlassEvenIfAnotherWasAskedLater() = runTest {
        val center = make()
        ask(center, "NVDA", price = 100.0)
        center.accept()
        clock = at(8, 12)
        ask(center, "TSLA", price = 300.0)
        clock = at(9, 13)
        phone.memory.deliverDue()
        prices["NVDA"] = 110.0
        prices["TSLA"] = 330.0
        center.opened(HarnessTap(HarnessStep.ASSET, "NVDA", null))
        assertEquals("NVDA", center.move?.symbol)
        assertEquals(10.0, center.move?.pct ?: 0.0, 0.001)
        // They ask about it themselves: the line lets go, and the tap no longer holds the glass on it.
        clock = at(9, 13, 5)
        ask(center, "NVDA", price = 110.0)
        center.refreshMove()
        assertEquals("the other asset they asked about a day ago is what is left to come back to", "TSLA", center.move?.symbol)
    }

    @Test fun openingTheAppIsNeverWritten() = runTest {
        val center = make()
        ask(center, "NVDA")
        val written = raw.values[HarnessStore.key(HarnessStore.PREFIX, null)]
        center.appActive()
        clock += 600_000L
        center.appActive()
        clock += 1_800_000L
        center.appActive()
        assertTrue(events(center, HarnessEvent.Kind.APP_OPEN).isEmpty())
        assertEquals("the question, and nothing since", listOf(HarnessEvent.Kind.ASK), center.ledger.events.map { it.kind })
        assertEquals("what the phone keeps did not change by opening the app", written, raw.values[HarnessStore.key(HarnessStore.PREFIX, null)])
        // With follow-ups on it is not written either.
        center.accept()
        clock += 1_800_000L
        center.appActive()
        assertFalse(raw.values.getValue(HarnessStore.key(HarnessStore.PREFIX, null)).contains("appOpen"))
    }

    // What they said about how long they are looking, and when it is written

    @Test fun whatTheySaidAboutTheirHorizonIsWrittenOnlyOnceTheySayYes() = runTest {
        val center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, thread = true, horizon = HarnessHorizon.WEEK)
        clock = at(7, 16, 42)
        center.noteSaved("NVDA", 168)
        var stored = HarnessStore(raw).ledger(null)
        assertTrue("undecided: nothing they said about their horizon is on the phone yet",
                   stored.events.all { it.horizon == null && it.horizonHours == null && it.thread == null })
        val kept = raw.values.getValue(HarnessStore.key(HarnessStore.PREFIX, null))
        assertFalse(kept, kept.contains("horizon") || kept.contains("thread"))
        assertEquals(stored, center.ledger)
        // The yes: the read that prompted it is still in memory, and its entries become whole in place.
        clock = at(7, 16, 45)
        center.accept()
        stored = HarnessStore(raw).ledger(null)
        assertEquals(HarnessHorizon.WEEK, stored.events(HarnessEvent.Kind.ASK).firstOrNull()?.horizon)
        assertEquals(true, stored.events(HarnessEvent.Kind.ASK).firstOrNull()?.thread)
        assertEquals("the review they chose on the save of that read", 168, stored.events(HarnessEvent.Kind.SAVED).firstOrNull()?.horizonHours)
        assertEquals("at the moment it happened", at(7, 16, 42), stored.events(HarnessEvent.Kind.SAVED).firstOrNull()?.at)
        assertEquals("completed in place: nothing is written twice", 2, stored.events.size)
        assertEquals("the review they chose on the save: a week from the question", listOf(HarnessStep.ASSET), kinds(center.upcoming))
        assertEquals(at(14, 16, 40), center.upcoming.firstOrNull()?.fireAt)
        assertEquals(7, center.upcoming.firstOrNull()?.days)
        // From here on it is written with the question.
        clock = at(7, 17)
        center.noteAsk("TSLA", "Tesla", true, 300.0, horizon = HarnessHorizon.LONG)
        assertEquals(HarnessHorizon.LONG, HarnessStore(raw).ledger(null).events(HarnessEvent.Kind.ASK).lastOrNull()?.horizon)
        assertEquals("a question about years: the week only", listOf(HarnessStep.WEEK), kinds(center.upcoming))
    }

    @Test fun theYesCompletesOnlyWhatIsStillInMemory() = runTest {
        // More than half an hour before the yes: what was held is let go.
        var center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, horizon = HarnessHorizon.LONG)
        clock = at(7, 17, 11)
        center.accept()
        assertNull(events(center, HarnessEvent.Kind.ASK).firstOrNull()?.horizon)
        assertEquals("followed up as a question that named nothing", all, kinds(center.upcoming))
        center.turnOff()
        HarnessStore(raw).forget(null)
        // A relaunch before the yes: memory is gone, and so is what was held.
        clock = at(7, 16, 40)
        center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, horizon = HarnessHorizon.LONG)
        val relaunched = make()
        clock = at(7, 16, 45)
        relaunched.accept()
        assertNull(events(relaunched, HarnessEvent.Kind.ASK).firstOrNull()?.horizon)
        assertEquals(1, events(relaunched, HarnessEvent.Kind.ASK).size)
        // Another reader's yes completes nothing of the one before.
        relaunched.turnOff()
        HarnessStore(raw).forget(null)
        center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, horizon = HarnessHorizon.LONG)
        switchTo("u9")
        center.accountChanged()
        center.accept()
        assertEquals(1, events(center, HarnessEvent.Kind.ASK).size)
        assertNull("what was held for the signed-out reader went with the change of reader", events(center, HarnessEvent.Kind.ASK).firstOrNull()?.horizon)
    }

    @Test fun aSaveWithAReviewMovesTheFollowUpThatWasComing() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        assertEquals(at(8, 16, 40), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        // They save the read with "review in 3 days": the asset comes then, and the phone holds that moment.
        clock = at(7, 16, 50)
        center.noteSaved("NVDA", 72)
        assertEquals(72, events(center, HarnessEvent.Kind.SAVED).firstOrNull()?.horizonHours)
        assertEquals(listOf(HarnessStep.ASSET to at(10, 16, 40), HarnessStep.WEEK to at(12, 16, 40)), center.upcoming.map { it.step to it.fireAt })
        assertEquals(at(10, 16, 40), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        assertEquals(3, center.upcoming.firstOrNull()?.days)
        // A review the save does not offer is not kept, and says nothing.
        clock = at(7, 16, 55)
        center.noteSaved("NVDA", 36)
        assertEquals(listOf<Int?>(72, null), events(center, HarnessEvent.Kind.SAVED).map { it.horizonHours })
        assertEquals(at(10, 16, 40), notice(HarnessStep.ASSET)?.fireAtEpochMs)
    }

    @Test fun aThesisTimesTheFollowUpAndItsPointerFollowsTheThesis() = runTest {
        var active = listOf(HarnessThesis("nvda", HarnessHorizon.LONG, at(1, 9)))
        val center = make()
        center.theses = { active }
        ask(center, "NVDA")
        assertEquals("undecided: no pointer is written", emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.THESIS))
        center.accept()
        assertEquals(listOf<String?>("NVDA"), events(center, HarnessEvent.Kind.THESIS).map { it.symbol })
        assertEquals(HarnessHorizon.LONG, events(center, HarnessEvent.Kind.THESIS).firstOrNull()?.horizon)
        assertEquals("dated when the thesis was written", at(1, 9), events(center, HarnessEvent.Kind.THESIS).firstOrNull()?.at)
        assertEquals("a thesis of years: nothing about the asset the next day", listOf(HarnessStep.WEEK), kinds(center.upcoming))
        assertEquals(1, HarnessStore(raw).ledger(null).events(HarnessEvent.Kind.THESIS).size)
        assertEquals("a pointer is not one of the assets they asked about", listOf("NVDA"), center.kept.value)
        // They change its horizon: one pointer, the new horizon.
        active = listOf(HarnessThesis("NVDA", HarnessHorizon.MONTH, at(1, 9)))
        center.replan()
        assertEquals(listOf<HarnessHorizon?>(HarnessHorizon.MONTH), events(center, HarnessEvent.Kind.THESIS).map { it.horizon })
        assertEquals(at(14, 16, 40), center.upcoming.firstOrNull()?.fireAt)
        // Planning again writes nothing again.
        val before = raw.values[HarnessStore.key(HarnessStore.PREFIX, null)]
        center.replan()
        assertEquals(before, raw.values[HarnessStore.key(HarnessStore.PREFIX, null)])
        // They archive it: the pointer goes, and the question is followed up like any other.
        active = emptyList()
        center.replan()
        assertEquals(emptyList<HarnessEvent>(), events(center, HarnessEvent.Kind.THESIS))
        assertEquals(all, kinds(center.upcoming))
        assertEquals(at(8, 16, 40), center.upcoming.firstOrNull()?.fireAt)
    }

    // Android: fences, a slow phone, a relaunch, another language, the board, the switch

    @Test fun aPriceThatArrivesForThePreviousReaderDrawsNothing() = runTest {
        // The second reader asked about the same asset a day ago too, at another price.
        val theirs = HarnessLedger().also { it.note(HarnessEvent(HarnessEvent.Kind.ASK, at(7, 10), symbol = "NVDA", name = "NVDA", isEquity = true, price = 60.0)) }
        HarnessStore(raw).write(theirs, "u2")
        user = "u1"
        val center = make()
        ask(center, "NVDA", price = 100.0)
        clock = at(8, 17)
        val gate = CompletableDeferred<Unit>()
        center.market = { symbol ->
            quoted.add(symbol)
            gate.await()
            HarnessQuote(120.0, null)
        }
        val coming = launch(start = CoroutineStart.UNDISPATCHED) { center.appActive() }
        // The app came to the front twice (launch, then resume): one price read, not two.
        val again = launch(start = CoroutineStart.UNDISPATCHED) { center.refreshMove() }
        assertEquals(listOf("NVDA"), quoted)
        switchTo("u2")
        val next = launch(start = CoroutineStart.UNDISPATCHED) { center.accountChanged() }
        assertEquals("u2", center.owner)
        assertNull("the first reader's line is gone at once", center.move)
        assertEquals("the second reader's own read is not held back by the first one's", listOf("NVDA", "NVDA"), quoted)
        gate.complete(Unit)
        coming.join()
        again.join()
        next.join()
        assertEquals("their own question, their own price: the first reader's 100 never reaches them", 60.0, center.move?.priceThen)
        assertEquals(100.0, center.move?.pct ?: 0.0, 0.001)
        assertEquals(center.move, center.moveOnGlass())
    }

    @Test fun openingTheAppBeforeThePhoneDeliversALateNoticeLeavesItToTheGlass() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        prices["NVDA"] = 101.0
        clock = at(8, 18)                               // its moment passed at 16:40; an idle phone still holds it
        center.appActive()
        assertEquals("it counts as shown: counting too many only makes Bobby quieter", listOf(HarnessStep.ASSET), events(center, HarnessEvent.Kind.SENT).map { it.step })
        assertFalse("the phone no longer holds it", pending().contains("v18.follow.asset"))
        assertTrue("so it is not shown after the fact", phone.memory.deliverDue().isEmpty())
        assertEquals("the glass says it", "NVDA", center.move?.symbol)
    }

    @Test fun aRelaunchKeepsThePlanAndWritesNothingTwice() = runTest {
        val first = make()
        ask(first, "NVDA")
        first.accept()
        val second = make()
        assertEquals(HarnessMode.ON, second.mode)
        assertEquals(all, kinds(second.upcoming))
        second.appActive()
        assertEquals(2, pending().size)
        clock = at(9, 8)
        phone.memory.deliverDue()
        val third = make()
        third.appActive()
        assertEquals(listOf(HarnessStep.ASSET), events(third, HarnessEvent.Kind.SENT).map { it.step })
        val fourth = make()
        fourth.appActive()
        assertEquals("written once, whoever reads the store", 1, events(fourth, HarnessEvent.Kind.SENT).size)
        assertEquals(listOf(HarnessStep.WEEK), kinds(fourth.upcoming))
    }

    @Test fun anotherLanguageRewritesWhatThePhoneHolds() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        assertEquals("NVDA, a day later. See how it moved.", notice(HarnessStep.ASSET)?.body)
        assertFalse(center.wordsAreStale)
        language = "es"
        assertTrue(center.wordsAreStale)
        center.rewriteWords()
        assertEquals("NVDA, un día después. Mira cómo se movió.", notice(HarnessStep.ASSET)?.body)
        assertEquals("Tu semana con NVDA.", notice(HarnessStep.WEEK)?.body)
        assertEquals("the moment does not move", at(8, 16, 40), notice(HarnessStep.ASSET)?.fireAtEpochMs)
        assertFalse(center.wordsAreStale)
        // While the notice waits to be read again nothing is planned anew: the lines stay.
        consent = RiskNotice.OUTDATED
        language = "fr"
        center.rewriteWords()
        assertEquals(2, pending().size)
        assertEquals("NVDA, un día después. Mira cómo se movió.", notice(HarnessStep.ASSET)?.body)
        assertFalse(center.wordsAreStale)
    }

    @Test fun aBoardReadsOnePricePerRowAndNeverForAnotherReader() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA", price = 100.0)
        ask(center, "BTC", price = null, equity = false)
        prices["NVDA"] = 110.0
        prices["BTC"] = 60_000.0
        val board = HarnessBoard.make(null, center.ledger, clock, center.copy)
        val seen = LinkedHashMap<String, Double?>()
        center.readBoard(board) { symbol, change -> seen[symbol] = change }
        assertEquals(setOf("NVDA", "BTC"), seen.keys)
        assertEquals(10.0, seen["NVDA"] ?: 0.0, 0.001)
        assertNull("no price at the question: no number", seen["BTC"])
        assertEquals(2, quoted.size)
        // Nothing is read before the risk notice.
        consent = RiskNotice.OUTDATED
        center.readBoard(board) { symbol, change -> seen[symbol] = change }
        assertEquals(2, quoted.size)
        // A price that arrives after the reader changed is dropped.
        consent = RiskNotice.ACCEPTED
        seen.clear()
        val gate = CompletableDeferred<Unit>()
        center.market = { _ ->
            gate.await()
            HarnessQuote(200.0, 3.0)
        }
        val reading = launch(start = CoroutineStart.UNDISPATCHED) { center.readBoard(board) { symbol, change -> seen[symbol] = change } }
        switchTo("u2")
        center.accountChanged()
        gate.complete(Unit)
        reading.join()
        assertTrue(seen.isEmpty())
    }

    @Test fun theSwitchShowsWhatThePersonDecided() = runTest {
        val center = make()
        assertEquals(HarnessView(), center.view.value)
        ask(center, "NVDA")
        assertEquals("they asked this week: the week has something in it", HarnessView(hasWeek = true), center.view.value)
        var whileSaving: HarnessView? = null
        phone.whileAsking = { whileSaving = center.view.value }
        center.accept()
        assertEquals(true, whileSaving?.saving)
        assertEquals(HarnessView(HarnessMode.ON, false, LocalNotifier.Permission.ALLOWED, true), center.view.value)
        assertTrue(center.isOn)
        center.turnOff()
        assertEquals(HarnessView(HarnessMode.OFF, false, LocalNotifier.Permission.ALLOWED, false), center.view.value)
        assertFalse(center.isOn)
    }

    @Test fun whatThePhoneKeepsForFollowUpsIsListedAndCanBeClearedWithoutAnAccountOrAYes() = runTest {
        // From the first question, before any yes, the phone notes what was asked about. Whatever is kept
        // about a person is something they can see and remove: signed out, and without deciding anything.
        val center = make()
        assertTrue(center.kept.value.isEmpty())
        ask(center, "NVDA")
        clock += 3_600_000L
        ask(center, "BTC", equity = false)
        assertEquals("what the ledger names, newest first", listOf("BTC", "NVDA"), center.kept.value)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertNull("nobody is signed in", center.owner)
        var told = 0
        center.onErased = { told += 1 }

        center.forgetLedger()
        assertTrue(center.kept.value.isEmpty())
        assertTrue(center.ledger.isEmpty)
        assertTrue("nothing of it stays on the phone", HarnessStore(raw).ledger(null).isEmpty)
        assertEquals("the switch stays where the person left it", HarnessMode.UNDECIDED, center.mode)
        assertEquals("and whatever else named those assets is told", 1, told)
        assertNull("nothing to come back to, so no price is read", center.dueAsset())

        // With follow-ups on: the switch stays on, and what was planned from the ledger goes with it.
        ask(center, "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertTrue(pending().isNotEmpty())
        assertEquals(listOf("NVDA"), center.kept.value)
        center.forgetLedger()
        assertEquals(HarnessMode.ON, center.mode)
        assertTrue("no follow-up is left on the phone for an asset it no longer keeps", pending().isEmpty())
        assertTrue(center.kept.value.isEmpty())
        assertEquals(2, told)
        // The next question starts again from nothing.
        ask(center, "ETH", equity = false)
        assertEquals(listOf("ETH"), center.kept.value)
    }
}
