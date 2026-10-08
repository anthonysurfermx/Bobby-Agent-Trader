package xyz.bobbyprotocol.android.v18.harness

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * The harness (1.8), the plan. Follow-ups belong to a question the person asked by themselves: the
 * asset when they said they would look again (the next day at the soonest), the week on Monday,
 * then silence until they ask again. A tap answers nothing; an answer never starts a chain; ignoring
 * follow-ups makes Bobby quieter. Everything is a pure function of the ledger and the clock.
 * The cases of ios/Bobby/Tests/HarnessPlannerTests.swift. They pin the planned moment: Android
 * delivers at or after it, never exactly at it. The same rules, as data for every platform:
 * shared/harness/planner-golden.json (HarnessGoldenTest).
 */
class HarnessPlannerTest {
    private val zone = HarnessDays.mexico
    private var ledger = HarnessLedger()
    private val minute = 60_000L
    private val hour = 3_600_000L
    private val day = 86_400_000L

    /** The two chains, each named: these tests are about the rules of a chain, whichever one ships. What ships is stated once, in `theChainIsData`. */
    private fun assetThenWeek() = HarnessPlanner.Options(HarnessChain.ASSET_THEN_WEEK)
    private fun withSector() = HarnessPlanner.Options(HarnessChain.WITH_SECTOR)

    private val none = emptyList<HarnessFollowUp>()
    private val asset = HarnessStep.ASSET
    private val sector = HarnessStep.SECTOR
    private val week = HarnessStep.WEEK

    /** October 2026, local time. The 6th is a Tuesday, the 12th a Monday. */
    private fun at(day: Int, hour: Int, minute: Int = 0): Long = HarnessDays.at(day, hour, minute)

    private fun ask(symbol: String, date: Long, price: Double? = 100.0, equity: Boolean = true, origin: HarnessEvent.Origin? = null,
                    thread: Boolean? = null, horizon: HarnessHorizon? = null) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, date, symbol = symbol, name = symbol, isEquity = equity, price = price,
                                 origin = origin, thread = thread, horizon = horizon))
    }

    private fun sent(step: HarnessStep, date: Long, symbol: String? = "NVDA", sector: String? = null) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, date, symbol = symbol, step = step, sector = sector))
    }

    /** A tap on the notification. */
    private fun opened(step: HarnessStep, date: Long, symbol: String? = "NVDA", sector: String? = null) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, date, symbol = symbol, step = step, sector = sector))
    }

    /** Something useful done with the follow-up: the only answer. */
    private fun answered(step: HarnessStep, date: Long, symbol: String? = "NVDA", sector: String? = null) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, date, symbol = symbol, step = step, sector = sector))
    }

    private fun saved(date: Long, hours: Int? = null, symbol: String = "NVDA") {
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, date, symbol = symbol, horizonHours = hours))
    }

    private fun thesis(date: Long, horizon: HarnessHorizon? = null, symbol: String = "NVDA") {
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, date, symbol = symbol, horizon = horizon))
    }

    private fun plan(now: Long, options: HarnessPlanner.Options = assetThenWeek(), weeklyCovered: Boolean = false): List<HarnessFollowUp> {
        options.weeklyCovered = weeklyCovered
        return HarnessPlanner.plan(ledger, now, zone, options)
    }

    private fun kinds(plan: List<HarnessFollowUp>): List<HarnessStep> = plan.map { it.step }
    private fun moments(plan: List<HarnessFollowUp>): List<Long> = plan.map { it.fireAt }
    private fun localDay(at: Long, where: ZoneId = zone) = Instant.ofEpochMilli(at).atZone(where).toLocalDate()

    // The first question

    @Test fun nothingIsPlannedBeforeAnyQuestion() {
        assertEquals(none, plan(at(7, 12)))
        ledger.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, at(7, 12)))
        assertEquals("opening the app is not a question", none, plan(at(7, 13)))
    }

    @Test fun oneQuestionPlansTheAssetAndTheWeek() {
        ask("NVDA", at(7, 16, 40))
        val steps = plan(at(7, 16, 41))
        assertEquals("the chain that ships has no sector", listOf(asset, week), kinds(steps))
        assertEquals("the next day, at the time they asked", at(8, 16, 40), steps[0].fireAt)
        assertEquals("NVDA", steps[0].symbol)
        assertEquals(1, steps[0].days)
        assertEquals("the week on the next Monday", at(12, 16, 40), steps[1].fireAt)
        assertEquals(DayOfWeek.MONDAY, Instant.ofEpochMilli(steps[1].fireAt).atZone(zone).dayOfWeek)
        assertEquals(0, steps[1].others)
    }

    @Test fun followUpsStayInsideWakingHours() {
        ask("NVDA", at(7, 23, 30))
        assertEquals("a late question is followed up at nine in the evening", at(8, 21, 0), plan(at(7, 23, 31)).firstOrNull()?.fireAt)
        ledger = HarnessLedger()
        ask("NVDA", at(7, 2, 10))
        assertEquals("a night question at nine in the morning", at(8, 9, 0), plan(at(7, 2, 11)).firstOrNull()?.fireAt)
    }

    @Test fun theWeekCountsItsAssetsAndNamesTheOneThatMattersMost() {
        ask("BTC", at(5, 10), equity = false)
        ask("TSLA", at(6, 10))
        ask("NVDA", at(7, 10))
        var last = plan(at(7, 10, 1)).lastOrNull()
        assertEquals(week, last?.step)
        assertEquals("each asked once: the latest", "NVDA", last?.symbol)
        assertEquals(2, last?.others)
        // A thesis about one of them: that is the one the week is about.
        thesis(at(1, 9), symbol = "BTC")
        last = plan(at(7, 10, 1)).lastOrNull()
        assertEquals("BTC", last?.symbol)
        assertEquals(false, last?.isEquity)
        assertEquals(2, last?.others)
    }

    @Test fun aWeekHoldsOnlyWhatWasAskedSinceTheMondayBeforeIt() {
        ask("AAPL", at(4, 10))                       // Sunday
        ask("NVDA", at(5, 8))                        // Monday, before nine
        val last = plan(at(5, 8, 1)).lastOrNull()
        assertEquals("a Monday question is in the week that arrives seven days later", at(12, 9), last?.fireAt)
        assertEquals("NVDA", last?.symbol)
        assertEquals("Sunday belongs to the week before", 0, last?.others)
        assertEquals(at(5, 0), HarnessPlanner.weekStart(at(12, 9), zone))
    }

    @Test fun aTappedWeekOpensTheWeekItWasPlannedFor() {
        val copy = HarnessWords.copy("en")
        ask("TSLA", at(4, 10))                       // Sunday: the week before
        ask("NVDA", at(5, 8))                        // Monday
        val planned = plan(at(5, 8, 1)).last()
        assertEquals(at(12, 9), planned.fireAt)
        // They tap it that evening, and again two days late: what the notification named is on the board,
        // though it was asked more than seven days before the tap.
        val tap = HarnessTap(week, planned.symbol, null, owner = "local", stamp = planned.fireAt)
        assertEquals(listOf("NVDA"), HarnessBoard.make(tap, ledger, at(12, 20), copy, zone).rows.map { it.symbol })
        assertEquals(listOf("NVDA"), HarnessBoard.make(tap, ledger, at(14, 20), copy, zone).rows.map { it.symbol })
        // Opened from Reminders, with no follow-up behind it: the last seven days, as before.
        assertEquals(emptyList<HarnessBoard.Row>(), HarnessBoard.make(null, ledger, at(12, 20), copy, zone).rows)
        assertEquals(listOf("NVDA", "TSLA"), HarnessBoard.make(null, ledger, at(10, 20), copy, zone).rows.map { it.symbol })
    }

    @Test fun aQuestionOnSundayGetsTheAssetAndNoWeek() {
        ask("NVDA", at(11, 12))                      // Sunday
        val steps = plan(at(11, 12, 1))
        assertEquals("Monday is taken by the asset, and by the Monday after it is not their week any more", listOf(at(12, 12)), moments(steps))
        assertEquals(listOf(at(12, 12), at(13, 12)), moments(plan(at(11, 12, 1), withSector())))
    }

    @Test fun onePendingNotificationPerStep() {
        ask("NVDA", at(7, 16))
        assertEquals(listOf("v18.follow.asset", "v18.follow.week"), plan(at(7, 16, 1)).map { it.id })
        assertEquals(listOf("v18.follow.asset", "v18.follow.sector", "v18.follow.week"), plan(at(7, 16, 1), withSector()).map { it.id })
    }

    // Only a real answer is an answer

    @Test fun aTapOnTheNotificationChangesNothing() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        val untouched = plan(at(8, 18, 31))
        opened(asset, at(8, 18, 30))
        val steps = plan(at(8, 18, 31))
        assertEquals("tapped or not, the plan is the same", untouched, steps)
        assertEquals("no second follow-up about the asset tomorrow", listOf(week), kinds(steps))
        assertEquals("and the chain keeps the hour of the question, not of the tap", at(12, 16), steps.firstOrNull()?.fireAt)
        assertEquals("tapped is not answered", 1, ledger.unansweredStreak(at(8, 19)).count)
    }

    @Test fun anAnswerEndsTheStreakAndStartsNoChain() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        answered(asset, at(8, 19))
        assertEquals(0, ledger.unansweredStreak(at(8, 19, 1)).count)
        val steps = plan(at(8, 19, 1))
        assertEquals("answered: still one follow-up left for this question, the week", listOf(week), kinds(steps))
        assertEquals(at(12, 16), steps.firstOrNull()?.fireAt)
    }

    @Test fun afterAnAnswerThereIsNoSecondFollowUpAboutAnAsset() {
        ask("BTC", at(5, 10), equity = false)
        ask("TSLA", at(6, 10)); ask("TSLA", at(6, 11)); ask("TSLA", at(6, 12))
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        answered(asset, at(8, 17))
        val steps = plan(at(8, 17, 1))
        assertFalse("the first build went on to the next asset the day after: no more", steps.any { it.step == asset })
        assertEquals(listOf(week), kinds(steps))
        assertEquals("asked about three times: the week is about what matters most to them", "TSLA", steps.firstOrNull()?.symbol)
    }

    @Test fun threeTappedAndNeverAnsweredIsQuiet() {
        ask("NVDA", at(1, 12))
        sent(asset, at(2, 12)); opened(asset, at(2, 12, 5))
        sent(week, at(5, 12)); opened(week, at(5, 12, 10))
        ask("TSLA", at(6, 12))
        sent(asset, at(7, 12), symbol = "TSLA"); opened(asset, at(7, 12, 1), symbol = "TSLA")
        ask("AAPL", at(8, 12))
        assertEquals(3, ledger.unansweredStreak(at(8, 12, 1)).count)
        assertEquals("the most reactive person is not the one who gets the most", none, plan(at(8, 12, 1)))
        assertFalse("the first build kept going", HarnessLegacyRules.plan(ledger, at(8, 12, 1), zone).isEmpty())
    }

    @Test fun aKindWhoseLastTwoShowingsWentUnansweredRests() {
        ask("NVDA", at(1, 12))
        sent(asset, at(2, 12))                                             // ignored
        sent(week, at(5, 12)); answered(week, at(5, 14))
        ask("TSLA", at(6, 12))
        sent(asset, at(7, 12), symbol = "TSLA"); opened(asset, at(7, 12, 30), symbol = "TSLA")    // tapped, and nothing else
        ask("AAPL", at(8, 12))
        val steps = plan(at(8, 12, 1))
        assertFalse("two asset follow-ups in a row went unanswered", steps.any { it.step == asset })
        assertEquals("a kind they do answer still comes", listOf(week), kinds(steps))
    }

    @Test fun anOlderAnswerDoesNotKeepAKindAlive() {
        ask("NVDA", at(1, 12))
        sent(asset, at(2, 12)); answered(asset, at(2, 13))                 // answered once, long before
        sent(asset, at(4, 14))                                             // ignored
        sent(week, at(5, 14)); answered(week, at(5, 15), symbol = null)
        sent(asset, at(6, 15))                                             // ignored
        ask("AAPL", at(7, 12))
        assertFalse("the last two were ignored, whatever happened before them", plan(at(7, 12, 1)).any { it.step == asset })
    }

    @Test fun threeInARowUnansweredAndNothingComesForTwoWeeksWhateverIsAsked() {
        ask("NVDA", at(1, 12))
        sent(asset, at(2, 12))
        ask("TSLA", at(2, 19))
        sent(asset, at(3, 19), symbol = "TSLA")
        ask("SOL", at(3, 20), equity = false)
        sent(week, at(5, 20), symbol = "SOL")
        assertEquals("three shown, none answered", none, plan(at(5, 21)))
        ask("AAPL", at(9, 12))
        assertEquals("a new question does not restart it inside the two weeks", none, plan(at(9, 12, 1)))
        ask("AAPL", at(20, 12))
        assertEquals("two weeks after the last one a question is followed up again; the asset kind still rests", listOf(week), kinds(plan(at(20, 12, 1))))
    }

    @Test fun neverMoreThanFourInAWeek() {
        ask("NVDA", at(5, 12))
        for (shown in 6..9) { sent(asset, at(shown, 12)); answered(asset, at(shown, 13)) }
        ask("TSLA", at(9, 13, 30))
        assertEquals("four were shown in the last seven days: the new question gets nothing inside them", none, plan(at(9, 13, 31)))
        ledger = HarnessLedger()
        ask("NVDA", at(5, 12))
        for (shown in 6..9) { sent(asset, at(shown, 12)); answered(asset, at(shown, 13)) }
        ask("TSLA", at(12, 13, 30))
        assertEquals("once one of the four has left the seven days", listOf(at(13, 13), at(19, 13)), moments(plan(at(12, 13, 31))))
    }

    @Test fun theHourTheyAnswerAtIsLearnedFromAnswersNotFromTaps() {
        ask("NVDA", at(1, 22))
        // Four taps in the evening, three answers at eight in the morning.
        for (tapped in 2..5) ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, at(tapped, 21, 5), symbol = "NVDA", step = asset))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, at(6, 8, 40), symbol = "NVDA", step = asset))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, at(7, 8, 5), symbol = "NVDA", step = week))
        assertNull("two answers are not enough, however many taps", HarnessProfile.make(ledger, at(8, 8), zone).hour)
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, at(8, 8, 50), symbol = "NVDA", step = asset))
        assertEquals("three answers at eight", 8, HarnessProfile.make(ledger, at(8, 9), zone).hour)
        ask("TSLA", at(8, 23))
        assertEquals("their hour, inside waking hours, and never sooner than 18 hours", at(10, 9), plan(at(8, 23, 1)).firstOrNull()?.fireAt)
    }

    // The chain belongs to a question the person asked

    @Test fun anIgnoredAssetIsFollowedByTheWeekThenSilence() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        assertEquals(listOf(week), kinds(plan(at(8, 20))))
        assertEquals(at(12, 16), plan(at(8, 20)).firstOrNull()?.fireAt)
        sent(week, at(12, 16))
        assertEquals("two for one question: Bobby goes quiet", none, plan(at(12, 17)))
        assertEquals("and stays quiet", none, plan(at(20, 9)))
    }

    @Test fun oneQuestionNeverGetsMoreThanItsShareWhateverIsAnswered() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16)); opened(asset, at(8, 16, 5)); answered(asset, at(8, 16, 6))
        sent(week, at(12, 16)); opened(week, at(12, 16, 5)); answered(week, at(12, 16, 6))
        // They did everything a person can do with a follow-up, short of asking again.
        ask("NVDA", at(12, 16, 7), origin = HarnessEvent.Origin.FOLLOW_UP)
        ledger.note(HarnessEvent(HarnessEvent.Kind.PICKED, at(12, 16, 7), symbol = "NVDA"))
        saved(at(12, 16, 9))
        for (later in 12..20) assertEquals("day $later", none, plan(at(later, 17)))
        assertEquals("the sector is not a way round it: it comes the day after the asset or not at all", none, plan(at(12, 17), withSector()))
        // Until they ask again, by themselves.
        ask("NVDA", at(13, 10))
        assertEquals(listOf(asset, week), kinds(plan(at(13, 10, 1))))
    }

    @Test fun aReadBobbyStartedIsNeverAQuestion() {
        ask("NVDA", at(7, 16), origin = HarnessEvent.Origin.FOLLOW_UP)
        assertEquals("nothing is planned from Bobby's own question", none, plan(at(7, 16, 1)))
        assertNull(ledger.question(at(7, 17)))
        ledger = HarnessLedger()
        ask("NVDA", at(7, 16))
        val before = plan(at(7, 18, 1))
        ask("NVDA", at(7, 18), origin = HarnessEvent.Origin.FOLLOW_UP)
        assertEquals("and it does not move the chain of the question before it", before, plan(at(7, 18, 1)))
        assertEquals(at(8, 16), before.firstOrNull()?.fireAt)
        // A read Bobby started about something else (a row of a board, a chip) changes whose turn it is no more.
        ask("TSLA", at(7, 19), origin = HarnessEvent.Origin.FOLLOW_UP)
        assertEquals("NVDA", plan(at(7, 19, 1)).firstOrNull()?.symbol)
    }

    @Test fun aNewQuestionStartsAgainFromThatAsset() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        ask("SOL", at(8, 20), equity = false)
        val steps = plan(at(8, 20, 1))
        assertEquals(listOf(asset, week), kinds(steps))
        assertEquals("SOL", steps[0].symbol)
        assertEquals(at(9, 20), steps[0].fireAt)
        // One follow-up already went unanswered: with the sector the new question gets the asset and its
        // sector, and not the week, which would be a fourth in a row that nobody answered.
        assertEquals(listOf(null, "layer1"), plan(at(8, 20, 1), withSector()).map { it.sector })
        assertEquals(listOf(asset, sector), kinds(plan(at(8, 20, 1), withSector())))
    }

    @Test fun aSecondQuestionOfTheirOwnAboutTheSameReadIsAQuestion() {
        ask("NVDA", at(7, 16))
        ask("NVDA", at(7, 16, 20), thread = true)
        assertEquals(at(8, 16, 20), plan(at(7, 16, 21)).firstOrNull()?.fireAt)
    }

    @Test fun theChainIsData() {
        ask("NVDA", at(7, 16))
        // What ships: the owner's choice is one line, `HarnessChain.SHIPPED`, and every default follows it.
        assertEquals(HarnessChain.ASSET_THEN_WEEK, HarnessChain.SHIPPED)
        var options = HarnessPlanner.Options()
        assertEquals(HarnessChain.SHIPPED.steps, options.chain)
        assertEquals(HarnessChain.SHIPPED.maxPerQuestion, options.maxPerQuestion)
        assertEquals(plan(at(7, 16, 1), HarnessPlanner.Options(HarnessChain.SHIPPED)), plan(at(7, 16, 1), options))
        assertEquals(listOf(asset, week), assetThenWeek().chain)
        assertEquals(2, assetThenWeek().maxPerQuestion)
        assertEquals(listOf(asset, sector, week), withSector().chain)
        assertEquals(3, withSector().maxPerQuestion)
        options = assetThenWeek()
        options.chain = listOf(week)
        assertEquals(listOf(week), kinds(plan(at(7, 16, 1), options)))
        options.chain = listOf(asset, asset, week, asset)
        assertEquals("a step comes once per question", listOf(asset, week), kinds(plan(at(7, 16, 1), options)))
        options.maxPerQuestion = 1
        assertEquals(listOf(asset), kinds(plan(at(7, 16, 1), options)))
        options.maxPerQuestion = 0
        assertEquals(none, plan(at(7, 16, 1), options))
        options = withSector()
        options.maxPerQuestion = 2
        assertEquals("the cap wins over the chain", listOf(asset, sector), kinds(plan(at(7, 16, 1), options)))
    }

    // It comes back when they said

    @Test fun theFirstFollowUpWaitsForTheHorizonTheQuestionNamed() {
        // Tuesday 6 October, 14:10. What the question named → when the follow-ups come, and the days the asset's says.
        val expected: List<Triple<HarnessHorizon?, List<Long>, Int?>> = listOf(
            Triple(null, listOf(at(7, 14, 10), at(12, 14, 10)), 1),
            Triple(HarnessHorizon.UNSPECIFIED, listOf(at(7, 14, 10), at(12, 14, 10)), 1),
            Triple(HarnessHorizon.INTRADAY, listOf(at(7, 14, 10), at(12, 14, 10)), 1),
            Triple(HarnessHorizon.WEEK, listOf(at(9, 14, 10), at(12, 14, 10)), 3),
            Triple(HarnessHorizon.MONTH, listOf(at(13, 14, 10)), 7),
            Triple(HarnessHorizon.LONG, listOf(at(12, 14, 10)), null),
        )
        for ((horizon, wanted, days) in expected) {
            ledger = HarnessLedger()
            ask("NVDA", at(6, 14, 10), horizon = horizon)
            val steps = plan(at(6, 14, 12))
            assertEquals(horizon?.raw ?: "none", wanted, moments(steps))
            assertEquals(horizon?.raw ?: "none", days, steps.firstOrNull { it.step == asset }?.days)
        }
        // Years: the week, and nothing about the asset under either chain.
        assertEquals(listOf(week), kinds(plan(at(6, 14, 12))))
        assertEquals(listOf(week), kinds(plan(at(6, 14, 12), withSector())))
    }

    @Test fun whatTheySaidOutranksWhatTheQuestionNamed() {
        val question = at(6, 14, 10)
        val now = at(6, 14, 20)
        fun wait(): HarnessPlanner.Wait = HarnessPlanner.waitFor(ledger.question(now)!!, ledger, now)
        ask("NVDA", question, horizon = HarnessHorizon.WEEK)
        assertEquals(HarnessPlanner.Wait(3, HarnessPlanner.Wait.Source.NAMED), wait())
        // The review they chose when saving the read.
        saved(at(6, 14, 15), hours = 168)
        assertEquals(HarnessPlanner.Wait(7, HarnessPlanner.Wait.Source.SAVED), wait())
        assertEquals("a week from the question, and by then no week of theirs", listOf(at(13, 14, 10)), moments(plan(now)))
        // A thesis they wrote about it.
        thesis(at(6, 14, 18), HarnessHorizon.LONG)
        assertEquals(HarnessPlanner.Wait(null, HarnessPlanner.Wait.Source.THESIS), wait())
        assertEquals(listOf(week), kinds(plan(now)))
        // Each on its own asset only.
        ask("TSLA", at(6, 14, 19))
        assertEquals(HarnessPlanner.Wait(1, HarnessPlanner.Wait.Source.STANDARD), wait())
    }

    @Test fun aSaveSaysSomethingOnlyWhenItLengthensTheWait() {
        val now = at(6, 14, 20)
        fun wait(): HarnessPlanner.Wait = HarnessPlanner.waitFor(ledger.question(now)!!, ledger, now)
        ask("NVDA", at(6, 14, 10), horizon = HarnessHorizon.MONTH)
        saved(at(6, 14, 15), hours = 24)
        assertEquals("24 hours is where the picker starts: it does not shorten the month they named", HarnessPlanner.Wait(7, HarnessPlanner.Wait.Source.NAMED), wait())
        ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(5, 9), symbol = "NVDA"))
        saved(at(5, 9, 5), hours = 168)
        ask("NVDA", at(6, 14, 10))
        assertEquals("a save from before the question is about another read", HarnessPlanner.Wait(1, HarnessPlanner.Wait.Source.STANDARD), wait())
        saved(at(6, 14, 15), hours = 72)
        assertEquals(HarnessPlanner.Wait(3, HarnessPlanner.Wait.Source.SAVED), wait())
        assertEquals(listOf(at(9, 14, 10), at(12, 14, 10)), moments(plan(now)))
    }

    @Test fun aHorizonNeverBringsAFollowUpSoonerThanTheNextDay() {
        // Every hour of the day, every horizon, every way of stating it.
        for (asked in 0 until 24) {
            for (horizon in HarnessHorizon.entries) {
                for (source in 0 until 3) {
                    ledger = HarnessLedger()
                    val question = at(6, asked, 10)
                    when (source) {
                        0 -> ask("NVDA", question, horizon = horizon)
                        1 -> {
                            ask("NVDA", question)
                            thesis(at(1, 9), horizon)
                        }
                        else -> {
                            ask("NVDA", question, horizon = horizon)
                            saved(question + minute, hours = listOf(24, 72, 168)[asked % 3])
                        }
                    }
                    val stated = plan(question + 2 * minute, withSector())
                    ledger = HarnessLedger()
                    ask("NVDA", question)
                    val plain = plan(question + 2 * minute, withSector())
                    val label = "${asked}h ${horizon.raw} $source"
                    for (followUp in stated) {
                        assertFalse(label, localDay(followUp.fireAt) == localDay(question))
                        assertTrue(label, followUp.fireAt - question >= 18 * hour)
                    }
                    for (step in listOf(asset, sector)) {
                        val with = stated.firstOrNull { it.step == step } ?: continue
                        val without = plain.firstOrNull { it.step == step } ?: continue
                        assertTrue("$label: ${step.raw} came sooner than with nothing said", with.fireAt >= without.fireAt)
                    }
                    assertTrue(label, stated.size <= plain.size)
                }
            }
        }
    }

    // With the sector (the owner's other choice: in the tree, tested, and not what ships)

    @Test fun withTheSectorOneQuestionPlansTheAssetItsSectorAndTheWeek() {
        ask("NVDA", at(7, 16, 40))
        val steps = plan(at(7, 16, 41), withSector())
        assertEquals(listOf(asset, sector, week), kinds(steps))
        assertEquals(at(8, 16, 40), steps[0].fireAt)
        assertEquals("the sector the day after", at(9, 16, 40), steps[1].fireAt)
        assertEquals("semis", steps[1].sector)
        assertEquals("NVDA", steps[1].symbol)
        assertEquals(at(12, 16, 40), steps[2].fireAt)
    }

    @Test fun withTheSectorAnAssetWithoutOneSkipsThatStep() {
        ask("GME", at(7, 12))
        val steps = plan(at(7, 12, 1), withSector())
        assertEquals(listOf(asset, week), kinds(steps))
        assertEquals("the week is still the next Monday", at(12, 12), steps[1].fireAt)
    }

    @Test fun withTheSectorAnIgnoredAssetIsFollowedByItsSectorThenTheWeekThenSilence() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        assertEquals("48 hours after the question: the sector", listOf(sector, week), kinds(plan(at(8, 20), withSector())))
        assertEquals(at(9, 16), plan(at(8, 20), withSector()).firstOrNull()?.fireAt)
        sent(sector, at(9, 16), sector = "semis")
        assertEquals(listOf(week), kinds(plan(at(10, 9), withSector())))
        assertEquals(at(12, 16), plan(at(10, 9), withSector()).firstOrNull()?.fireAt)
        sent(week, at(12, 16))
        assertEquals("three for one question: Bobby goes quiet", none, plan(at(12, 17), withSector()))
        assertEquals("and stays quiet", none, plan(at(20, 9), withSector()))
    }

    @Test fun withTheSectorAKindThatRestsLeavesItsDayToTheNext() {
        ask("NVDA", at(1, 12))
        sent(asset, at(2, 12))                                             // ignored
        sent(sector, at(3, 12), sector = "semis"); answered(sector, at(3, 14), sector = "semis")
        sent(asset, at(4, 14))                                             // ignored again
        ask("AAPL", at(5, 12))
        val steps = plan(at(5, 12, 1), withSector())
        assertFalse("two asset follow-ups in a row went unanswered", steps.any { it.step == asset })
        assertEquals("a kind they do answer still comes", sector, steps.firstOrNull()?.step)
        assertEquals("bigtech", steps.firstOrNull()?.sector)
        assertEquals(at(6, 12), steps.firstOrNull()?.fireAt)
    }

    @Test fun withTheSectorASectorIsNotRepeatedWithinAWeek() {
        ask("NVDA", at(1, 12))
        sent(asset, at(2, 12)); answered(asset, at(2, 13))
        sent(sector, at(3, 13), sector = "semis"); answered(sector, at(3, 14), sector = "semis")
        ask("AMD", at(4, 12))
        assertFalse("semiconductors were shown the day before", plan(at(4, 12, 1), withSector()).any { it.step == sector })
    }

    // Spacing against what was really shown

    @Test fun theWeekIsNeverSoonerThanEighteenHoursAfterTheQuestion() {
        // Their hour is nine in the morning; assets rest; GME has no sector: only the week is left.
        ask("NVDA", at(1, 12))
        for (shown in listOf(2, 3, 5)) { sent(asset, at(shown, 9)); answered(asset, at(shown, 9, 5)) }
        sent(asset, at(6, 9)); sent(asset, at(7, 9))
        val earlier = HarnessLedger().also { it.merge(ledger) }
        ask("GME", at(11, 23))                         // Sunday night
        assertEquals("Monday at nine is ten hours away, and the Monday after is no longer their week: nothing", none, plan(at(11, 23, 1)))
        assertEquals(none, plan(at(11, 23, 1), withSector()))
        ledger = earlier
        ask("GME", at(11, 12))                         // Sunday noon: 21 hours before
        assertEquals(listOf(at(12, 9)), moments(plan(at(11, 12, 1))))
    }

    @Test fun aChangeOfTimeZoneNeverPutsTwoOnTheSameDay() {
        val london = ZoneId.of("Europe/London")
        val newYork = ZoneId.of("America/New_York")
        val asked = HarnessDays.at(7, 1, zone = london)
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, asked, symbol = "NVDA", name = "NVDA", isEquity = true, price = 100.0))
        // Planned and shown in London: Thursday at nine, which is four in the morning in New York.
        val shown = HarnessDays.at(8, 9, zone = london)
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, shown, symbol = "NVDA", step = asset))
        val now = HarnessDays.at(8, 11, zone = newYork)
        val steps = HarnessPlanner.plan(ledger, now, newYork, withSector())
        val next = steps.firstOrNull { it.step == sector }
        assertNotNull(next)
        assertFalse("not on the day one already arrived", localDay(next!!.fireAt, newYork) == localDay(shown, newYork))
        assertTrue(next.fireAt - shown >= 18 * hour)
        for ((a, b) in steps.zip(steps.drop(1))) {
            assertFalse(localDay(a.fireAt, newYork) == localDay(b.fireAt, newYork))
            assertTrue(b.fireAt - a.fireAt >= 18 * hour)
        }
        // What ships: the week, on New York's Monday at New York's hour of the question.
        val shipped = HarnessPlanner.plan(ledger, now, newYork, assetThenWeek())
        assertEquals(listOf(week), kinds(shipped))
        assertEquals(HarnessDays.at(12, 20, zone = newYork), shipped.firstOrNull()?.fireAt)
    }

    // Limits

    @Test fun aPayingAccountWithTheMondayBriefingGetsNoSecondWeek() {
        ask("NVDA", at(7, 16))
        assertEquals(listOf(asset), kinds(plan(at(7, 16, 1), weeklyCovered = true)))
        assertEquals(listOf(asset, sector), kinds(plan(at(7, 16, 1), withSector(), weeklyCovered = true)))
    }

    @Test fun anOldQuestionIsNotFollowedUp() {
        ask("NVDA", at(1, 12))
        assertEquals("more than two weeks later there is nothing to come back to", none, plan(at(20, 12)))
    }

    @Test fun nothingIsEverPlannedInThePast() {
        ask("NVDA", at(7, 16))
        val late = plan(at(9, 18))
        assertTrue(late.all { it.fireAt > at(9, 18) })
        assertEquals("the days that passed unseen are not sent late", listOf(week), kinds(late))
    }

    @Test fun whatIsDatedAfterNowHasNotHappened() {
        ask("NVDA", at(7, 16))
        sent(asset, at(8, 16))
        ask("TSLA", at(9, 10))
        assertEquals("neither the follow-up nor the later question exist yet", listOf<String?>("NVDA", "NVDA"), plan(at(7, 17)).map { it.symbol })
        assertEquals(listOf(asset, week), kinds(plan(at(7, 17))))
    }

    // After the first follow-up was shown, and three in a row (the iPhone review of 2026-10-07)

    @Test fun whatTheySayAfterTheAssetWasShownDoesNotCancelTheWeek() {
        // Tuesday 6 at 14:10; the asset was shown on Wednesday 7 at 14:10, tapped, and read.
        ask("NVDA", at(6, 14, 10))
        sent(asset, at(7, 14, 10))
        answered(asset, at(7, 14, 30))
        ask("NVDA", at(7, 14, 31), origin = HarnessEvent.Origin.FOLLOW_UP)
        val shown = HarnessLedger().also { it.merge(ledger) }
        fun again() { ledger = HarnessLedger().also { it.merge(shown) } }
        fun steps(options: HarnessPlanner.Options = assetThenWeek()): List<Pair<HarnessStep, Long>> = plan(at(7, 15, 5), options).map { it.step to it.fireAt }
        val monday = listOf(week to at(12, 14, 10))
        assertEquals("answered by reading only", monday, steps())
        // Saved with each review the page offers: the save times the first follow-up, and that one was shown.
        for (hours in listOf(24, 72, 168)) {
            again()
            saved(at(7, 15, 2), hours = hours)
            assertEquals("saved with a review in $hours hours", monday, steps())
        }
        // A thesis written after it: weeks, or longer.
        for (horizon in listOf(HarnessHorizon.MONTH, HarnessHorizon.LONG)) {
            again()
            thesis(at(7, 15, 3), horizon)
            assertEquals("a thesis of ${horizon.raw}", monday, steps())
        }
        // With the sector: it follows the asset that was shown by a day, whatever was said since; the week is the same Monday.
        again()
        saved(at(7, 15, 2), hours = 168)
        assertEquals(listOf(sector to at(8, 14, 10)) + monday, steps(withSector()))
        // And the asset is never planned a second time at the longer wait, even with room for it.
        val roomy = assetThenWeek()
        roomy.maxPerQuestion = 3
        assertEquals(monday, steps(roomy))
        // Said before the asset was shown, a week's review still moves it, as before.
        ledger = HarnessLedger()
        ask("NVDA", at(6, 14, 10))
        saved(at(6, 14, 11), hours = 168)
        assertEquals(listOf(at(13, 14, 10)), moments(plan(at(6, 14, 12))))
    }

    @Test fun thePlanNeverHoldsAFourthUnansweredInARow() {
        // Thursday 1 at 14:10: the asset (Friday 2) and the week (Monday 5) arrive and nobody opens them.
        ask("NVDA", at(1, 14, 10))
        sent(asset, at(2, 14, 10))
        sent(week, at(5, 14, 10))
        ask("NVDA", at(6, 15, 0))
        // Two in a row went unanswered: the plan is "what happens if they do nothing", so it holds one more.
        assertEquals(listOf(asset), kinds(plan(at(6, 15, 1))))
        assertEquals(at(7, 15, 0), plan(at(6, 15, 1)).firstOrNull()?.fireAt)
        assertEquals("with three steps it would have been five in a row", listOf(asset), kinds(plan(at(6, 15, 1), withSector())))
        // Shown and still not answered: quiet.
        sent(asset, at(7, 15, 0))
        assertEquals(none, plan(at(7, 15, 1)))
        // Answered: the week of that question comes.
        answered(asset, at(7, 16, 0))
        ask("NVDA", at(7, 16, 1), origin = HarnessEvent.Origin.FOLLOW_UP)
        assertEquals(listOf(week), kinds(plan(at(7, 16, 5))))
        assertEquals(at(12, 15, 0), plan(at(7, 16, 5)).firstOrNull()?.fireAt)
        // One unanswered before a question still leaves room for both.
        ledger = HarnessLedger()
        ask("NVDA", at(1, 14, 10))
        sent(asset, at(2, 14, 10))
        ask("NVDA", at(6, 15, 0))
        assertEquals(listOf(asset, week), kinds(plan(at(6, 15, 1))))
    }

    // One person, one question (the answers the owner asked for)

    /**
     * Lives one question forward: every follow-up the planner holds is shown when its moment comes,
     * `react` writes what the person does with it, and the plan is made again. What was shown.
     */
    private fun live(options: HarnessPlanner.Options, legacy: Boolean = false, until: Long? = null,
                     react: (HarnessFollowUp, Int) -> Unit = { _, _ -> }): List<HarnessFollowUp> {
        var now = at(6, 14, 12)
        val shown = ArrayList<HarnessFollowUp>()
        while (shown.size < 40) {
            val next = if (legacy) HarnessLegacyRules.plan(ledger, now, zone) else HarnessPlanner.plan(ledger, now, zone, options)
            val first = next.firstOrNull() ?: break
            if (until != null && first.fireAt > until) break
            sent(first.step, first.fireAt, symbol = first.symbol, sector = first.sector)
            react(first, shown.size)
            shown.add(first)
            now = first.fireAt + 45 * minute
        }
        return shown
    }

    private fun tap(followUp: HarnessFollowUp) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, followUp.fireAt + 2 * minute, symbol = followUp.symbol, step = followUp.step,
                                 sector = followUp.sector, ref = followUp.fireAt))
    }

    /** They tap it, then "What changed?" on the glass: a pick, the answer it is, and the read Bobby starts. */
    private fun answer(followUp: HarnessFollowUp) {
        tap(followUp)
        val then = followUp.fireAt + 20 * minute
        ledger.note(HarnessEvent(HarnessEvent.Kind.PICKED, then, symbol = "NVDA"))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, then, symbol = followUp.symbol, step = followUp.step, sector = followUp.sector, ref = followUp.fireAt))
        ask("NVDA", then + minute, origin = HarnessEvent.Origin.FOLLOW_UP)
    }

    @Test fun whatOnePersonGetsFromOneQuestionOnATuesday() {
        // Tuesday 6 October 2026, 14:10: one question about NVDA, and a yes.
        val wednesday = at(7, 14, 10)
        val thursday = at(8, 14, 10)
        val monday = at(12, 14, 10)
        val nextTuesday = at(13, 14, 10)
        val nextWednesday = at(14, 14, 10)
        fun fresh(horizon: HarnessHorizon? = null) {
            ledger = HarnessLedger()
            ask("NVDA", at(6, 14, 10), horizon = horizon)
        }
        fun shown(followUps: List<HarnessFollowUp>): List<Pair<HarnessStep, Long>> = followUps.map { it.step to it.fireAt }

        // What ships: the asset, then the week.
        // (a) they never open anything
        fresh()
        assertEquals("a", listOf(asset to wednesday, week to monday), shown(live(assetThenWeek())))
        // (b) they tap each one and do nothing else
        fresh()
        assertEquals("b", listOf(asset to wednesday, week to monday), shown(live(assetThenWeek()) { followUp, _ -> tap(followUp) }))
        // (c) they answer the first
        fresh()
        assertEquals("c", listOf(asset to wednesday, week to monday), shown(live(assetThenWeek()) { followUp, index -> if (index == 0) answer(followUp) }))
        // (c, said aloud) they answer the first and save that read with "review in a week": the week still comes
        fresh()
        assertEquals("c, saved for a week", listOf(asset to wednesday, week to monday), shown(live(assetThenWeek()) { followUp, index ->
            if (index == 0) {
                answer(followUp)
                saved(followUp.fireAt + 30 * minute, hours = 168)
            }
        }))
        // (d) they saved the read with "review in a week"
        fresh()
        saved(at(6, 14, 11), hours = 168)
        assertEquals("d", listOf(asset to nextTuesday), shown(live(assetThenWeek())))
        // (e) their question named years
        fresh(HarnessHorizon.LONG)
        assertEquals("e", listOf(week to monday), shown(live(assetThenWeek())))

        // The same five with the sector.
        fresh()
        assertEquals("a, sector", listOf(asset to wednesday, sector to thursday, week to monday), shown(live(withSector())))
        fresh()
        assertEquals("b, sector", listOf(asset to wednesday, sector to thursday, week to monday), shown(live(withSector()) { followUp, _ -> tap(followUp) }))
        fresh()
        assertEquals("c, sector", listOf(asset to wednesday, sector to thursday, week to monday),
                     shown(live(withSector()) { followUp, index -> if (index == 0) answer(followUp) }))
        fresh()
        saved(at(6, 14, 11), hours = 168)
        assertEquals("d, sector", listOf(asset to nextTuesday, sector to nextWednesday), shown(live(withSector())))
        fresh(HarnessHorizon.LONG)
        assertEquals("e, sector", listOf(week to monday), shown(live(withSector())))
    }

    @Test fun theMostReactivePersonNoLongerGetsTheMost() {
        val month = at(6, 14, 10) + 28 * day
        fun count(legacy: Boolean, react: (HarnessFollowUp) -> Unit): Int {
            ledger = HarnessLedger()
            ask("NVDA", at(6, 14, 10))
            return live(assetThenWeek(), legacy = legacy, until = month) { followUp, _ -> react(followUp) }.size
        }
        // They tap every notification and do nothing else. The first build followed them until the
        // question was two weeks old: the 7th, 8th, 9th, 10th, the 19th and the 20th.
        assertEquals(6, count(legacy = true) { tap(it) })
        assertEquals(2, count(legacy = false) { tap(it) })
        // They tap, and then "What changed?" every time. The first build never stopped: every answer
        // started the chain again, four a week.
        assertTrue(count(legacy = true) { answer(it) } >= 10)
        assertEquals("two for the one question they asked, whatever they do with them", 2, count(legacy = false) { answer(it) })
    }

    // Android: the clock may jump an hour on the day a follow-up is planned for. The golden file has
    // these four days as cases; here each is a test of its own, so a failure names the rule: a
    // follow-up keeps the hour on the clock (it is not "24 hours later", and not seconds after midnight).

    private fun clock(where: ZoneId, month: Int, dayOfMonth: Int, hour: Int, minute: Int = 0): Long =
        ZonedDateTime.of(2026, month, dayOfMonth, hour, minute, 0, 0, where).toInstant().toEpochMilli()

    private fun planIn(where: ZoneId, asked: Long): List<HarnessFollowUp> {
        ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, asked, symbol = "NVDA", name = "NVDA", isEquity = true, price = 100.0))
        return HarnessPlanner.plan(ledger, asked + minute, where, assetThenWeek())
    }

    @Test fun whenTheClocksGoBackInMadridTheFollowUpKeepsTheHourOnTheClock() {
        val madrid = ZoneId.of("Europe/Madrid")
        // Saturday 24 October 2026, 14:10; the clocks go back at three on Sunday morning.
        val asked = clock(madrid, 10, 24, 14, 10)
        val steps = planIn(madrid, asked)
        assertEquals(listOf(asset, week), kinds(steps))
        assertEquals("Sunday at 14:10 on the clock", clock(madrid, 10, 25, 14, 10), steps[0].fireAt)
        assertEquals("which is 25 hours after the question, not 24", 25 * hour, steps[0].fireAt - asked)
        assertEquals(1, steps[0].days)
        assertEquals(clock(madrid, 10, 26, 14, 10), steps[1].fireAt)
    }

    @Test fun whenTheClocksGoBackInMadridALateQuestionStillLandsAtNineInTheEvening() {
        val madrid = ZoneId.of("Europe/Madrid")
        val asked = clock(madrid, 10, 24, 23, 30)
        val steps = planIn(madrid, asked)
        assertEquals(listOf(clock(madrid, 10, 25, 21), clock(madrid, 10, 26, 21)), moments(steps))
        assertEquals("the last allowed hour on the clock, not an hour past it", 21, Instant.ofEpochMilli(steps[0].fireAt).atZone(madrid).hour)
        assertEquals(1, steps[0].days)
    }

    @Test fun whenTheClocksGoBackInNewYorkTheFollowUpKeepsTheHourOnTheClock() {
        val newYork = ZoneId.of("America/New_York")
        // Saturday 31 October 2026, 14:10; the clocks go back at two on Sunday morning.
        val asked = clock(newYork, 10, 31, 14, 10)
        val steps = planIn(newYork, asked)
        assertEquals(listOf(clock(newYork, 11, 1, 14, 10), clock(newYork, 11, 2, 14, 10)), moments(steps))
        assertEquals(25 * hour, steps[0].fireAt - asked)
        assertEquals(1, steps[0].days)
    }

    @Test fun whenTheClocksGoForwardInSydneyTheFollowUpKeepsTheHourOnTheClock() {
        val sydney = ZoneId.of("Australia/Sydney")
        // Saturday 3 October 2026, 14:10; the clocks go forward at two on Sunday morning.
        val asked = clock(sydney, 10, 3, 14, 10)
        val steps = planIn(sydney, asked)
        assertEquals(listOf(clock(sydney, 10, 4, 14, 10), clock(sydney, 10, 5, 14, 10)), moments(steps))
        assertEquals("23 hours after the question, and still more than the 18 it must wait", 23 * hour, steps[0].fireAt - asked)
        assertEquals(1, steps[0].days)
    }

    @Test fun aClockChangeMovesNothingToAnotherDayOrOutOfWakingHours() {
        val berlin = ZoneId.of("Europe/Berlin")
        // Friday 23 October 2026, 20:30 in Berlin; clocks go back on Sunday the 25th.
        val asked = clock(berlin, 10, 23, 20, 30)
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, asked, symbol = "NVDA", name = "NVDA", isEquity = true, price = 100.0))
        val steps = HarnessPlanner.plan(ledger, asked + minute, berlin, withSector())
        assertEquals(listOf(asset, sector, week), kinds(steps))
        val local = steps.map { Instant.ofEpochMilli(it.fireAt).atZone(berlin) }
        assertEquals("the same time of day on each side of the change", listOf("20:30", "20:30", "20:30"), local.map { "%02d:%02d".format(it.hour, it.minute) })
        assertEquals(listOf(24, 25, 26), local.map { it.dayOfMonth })
    }

    // Properties (random ledgers, fixed seed)

    /**
     * Anything a ledger can hold, in any order of days, for a reader in `where`: questions of every
     * origin and horizon, saves, theses, follow-ups of every kind, taps, answers, picks.
     */
    private fun randomLedger(rng: Seeded, where: ZoneId): Pair<HarnessLedger, Long> {
        val made = HarnessLedger()
        var clock = ZonedDateTime.of(2026, 9, 24, 0, 0, 0, 0, where).toInstant().toEpochMilli() + rng.below(86_400) * 1_000L
        val shown = ArrayList<HarnessEvent>()
        val events = rng.between(1, 45)
        for (index in 0 until events) {
            val minutes = rng.between(1, 30 * 60)
            val halves = rng.between(1, 3)
            clock += minutes.toLong() * halves * 30_000L
            val symbol = rng.pick(SYMBOLS)
            when (rng.below(20)) {
                in 0..6 -> {
                    val origin = if (rng.below(4) == 0) HarnessEvent.Origin.FOLLOW_UP else null
                    val thread = if (rng.below(6) == 0) true else null
                    val horizon = if (rng.below(2) == 0) rng.pick(HarnessHorizon.entries) else null
                    made.note(HarnessEvent(HarnessEvent.Kind.ASK, clock, symbol = symbol, name = symbol, isEquity = true, price = 100.0,
                                           origin = origin, thread = thread, horizon = horizon))
                }
                7 -> made.note(HarnessEvent(HarnessEvent.Kind.SAVED, clock, symbol = symbol, horizonHours = rng.pick(listOf(null, 24, 72, 168))))
                8 -> made.note(HarnessEvent(HarnessEvent.Kind.THESIS, clock, symbol = symbol, horizon = rng.pick(listOf(null, HarnessHorizon.MONTH, HarnessHorizon.LONG))))
                in 9..12 -> {
                    val step = rng.pick(HarnessStep.entries)
                    val event = HarnessEvent(HarnessEvent.Kind.SENT, clock, symbol = symbol, step = step,
                                             sector = if (step == sector) HarnessSectors.of(symbol)?.id else null)
                    made.note(event)
                    shown.add(event)
                }
                in 13..15 -> {
                    val last = shown.lastOrNull() ?: continue
                    made.note(HarnessEvent(HarnessEvent.Kind.OPENED, clock, symbol = last.symbol, step = last.step, sector = last.sector, ref = last.at))
                }
                in 16..17 -> {
                    val last = shown.lastOrNull() ?: continue
                    made.note(HarnessEvent(HarnessEvent.Kind.RETURNED, clock, symbol = last.symbol, step = last.step, sector = last.sector, ref = last.at))
                }
                18 -> made.note(HarnessEvent(HarnessEvent.Kind.PICKED, clock, symbol = symbol))
                else -> made.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, clock))
            }
        }
        return made to clock + rng.between(1, 3 * 1_440) * minute
    }

    @Test fun noPlanEverBreaksACap() {
        val rng = Seeded(20_261_007L)
        val zones = listOf("America/Mexico_City", "America/New_York", "Europe/London", "Asia/Tokyo", "Asia/Kolkata", "Australia/Sydney").map { ZoneId.of(it) }
        var planned = 0
        for (round in 0 until 1_500) {
            val where = zones[round % zones.size]
            val (made, now) = randomLedger(rng, where)
            for (options in listOf(assetThenWeek(), withSector())) {
                val plan = HarnessPlanner.plan(made, now, where, options)
                planned += plan.size
                val label = "round $round, $where, chain ${options.chain.map { it.raw }}"
                val question = made.question(now)
                if (question == null) {
                    assertEquals("$label: nobody asked", none, plan)
                    continue
                }
                val sents = made.events(HarnessEvent.Kind.SENT).filter { it.at <= now }
                // One question's share, whatever was answered.
                assertTrue(label, plan.size <= maxOf(0, options.maxPerQuestion - sents.count { it.at > question.at }))
                assertEquals("$label: a step twice", plan.size, plan.map { it.step }.toSet().size)
                assertTrue(label, plan.all { it.step in options.chain })
                // Quiet, and resting kinds.
                val streak = made.unansweredStreak(now)
                val streakLast = streak.last
                if (streak.count >= 3 && streakLast != null && now - streakLast < 14 * day) assertEquals("$label: quiet", none, plan)
                // And over the plan itself, which is what arrives if they do nothing: never a fourth unanswered
                // in a row inside the fourteen days after the third.
                var unanswered = streak.count
                var lastUnanswered = streak.last
                for (followUp in plan) {
                    val last = lastUnanswered
                    if (unanswered >= 3 && last != null) assertTrue("$label: ${unanswered + 1} unanswered in a row", followUp.fireAt - last >= 14 * day)
                    unanswered += 1
                    lastUnanswered = followUp.fireAt
                }
                val profile = HarnessProfile.make(made.upTo(now), now, where)
                for (followUp in plan) assertFalse("$label: ${followUp.step.raw} rests", profile.rests(followUp.step))
                var previous = sents.lastOrNull()?.at
                for ((index, followUp) in plan.withIndex()) {
                    assertTrue(label, followUp.fireAt > now)
                    // Inside waking hours.
                    val local = Instant.ofEpochMilli(followUp.fireAt).atZone(where)
                    val minutes = local.hour * 60 + local.minute
                    assertTrue("$label: at ${local.hour}:${local.minute}", minutes in (9 * 60)..(21 * 60))
                    // Never the day of the question, never within 18 hours of it or of the last one shown, never two on a day.
                    assertTrue(label, followUp.fireAt - question.at >= 18 * hour)
                    assertFalse(label, localDay(followUp.fireAt, where) == localDay(question.at, where))
                    val before = previous
                    if (before != null) {
                        assertTrue(label, followUp.fireAt - before >= 18 * hour)
                        assertFalse(label, localDay(followUp.fireAt, where) == localDay(before, where))
                    }
                    previous = followUp.fireAt
                    // Four in seven days, counting what was shown.
                    val weekBefore = followUp.fireAt - 7 * day
                    val inWindow = sents.count { it.at > weekBefore } + plan.take(index + 1).count { it.fireAt > weekBefore }
                    assertTrue(label, inWindow <= 4)
                    // About what they asked.
                    when (followUp.step) {
                        HarnessStep.ASSET -> {
                            assertEquals(label, question.symbol, followUp.symbol)
                            assertTrue(label, followUp.days >= 1)
                        }
                        HarnessStep.SECTOR -> {
                            assertEquals(label, question.symbol, followUp.symbol)
                            assertEquals(label, question.symbol?.let { HarnessSectors.of(it)?.id }, followUp.sector)
                        }
                        HarnessStep.WEEK -> {
                            assertEquals("$label: a week is a Monday", DayOfWeek.MONDAY, local.dayOfWeek)
                            val asked = made.upTo(now).assets(since = HarnessPlanner.weekStart(followUp.fireAt, where), now = now).map { it.symbol }
                            assertTrue("$label: the week names something they asked about that week", followUp.symbol in asked)
                            assertEquals(label, asked.size - 1, followUp.others)
                        }
                    }
                }
            }
        }
        assertTrue("the ledgers were too quiet to prove anything: $planned planned", planned > 300)
    }

    /**
     * A person whose every action lands on one clock hour of the day (so the hour Bobby learns is
     * the hour they asked at), and who never said anything about a horizon: exactly what the first
     * build could read. On such a ledger the two planners may be compared follow-up for follow-up.
     */
    private fun plainLedger(rng: Seeded): Pair<HarnessLedger, Long> {
        val made = HarnessLedger()
        val asked = rng.between(9, 20)
        var days = rng.below(5)
        val shown = ArrayList<HarnessEvent>()
        fun moment(offset: Int): Long = ZonedDateTime.of(2026, 9, 24, asked, 0, 0, 0, zone).plusDays(offset.toLong()).toInstant().toEpochMilli()
        val events = rng.between(1, 40)
        for (index in 0 until events) {
            days += rng.pick(listOf(0, 0, 1, 1, 1, 2, 3))
            val clock = moment(days)
            val symbol = rng.pick(SYMBOLS)
            when (rng.below(20)) {
                in 0..6 -> {
                    val origin = if (rng.below(4) == 0) HarnessEvent.Origin.FOLLOW_UP else null
                    made.note(HarnessEvent(HarnessEvent.Kind.ASK, clock, symbol = symbol, name = symbol, isEquity = true, price = 100.0, origin = origin))
                }
                7 -> made.note(HarnessEvent(HarnessEvent.Kind.SAVED, clock, symbol = symbol))
                in 8..11 -> {
                    val step = rng.pick(HarnessStep.entries)
                    val event = HarnessEvent(HarnessEvent.Kind.SENT, clock, symbol = symbol, step = step,
                                             sector = if (step == sector) HarnessSectors.of(symbol)?.id else null)
                    made.note(event)
                    shown.add(event)
                }
                in 12..15 -> {
                    val last = shown.lastOrNull() ?: continue
                    made.note(HarnessEvent(HarnessEvent.Kind.OPENED, clock, symbol = last.symbol, step = last.step, sector = last.sector, ref = last.at))
                }
                in 16..17 -> {
                    val last = shown.lastOrNull() ?: continue
                    made.note(HarnessEvent(HarnessEvent.Kind.RETURNED, clock, symbol = last.symbol, step = last.step, sector = last.sector, ref = last.at))
                }
                18 -> made.note(HarnessEvent(HarnessEvent.Kind.PICKED, clock, symbol = symbol))
                else -> made.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, clock))
            }
        }
        return made to moment(days + rng.between(0, 4)) + minute
    }

    @Test fun thePlanNeverHoldsMoreThanTheFirstBuildWouldHavePlanned() {
        val rng = Seeded(1_966L)
        var fewer = 0
        var compared = 0
        var oneMoreWithTheSector = 0
        for (round in 0 until 4_000) {
            val (made, now) = plainLedger(rng)
            val before = HarnessLegacyRules.plan(made, now, zone)
            val after = HarnessPlanner.plan(made, now, zone, assetThenWeek())
            assertTrue("round $round: ${kinds(after).map { it.raw }} against ${kinds(before).map { it.raw }}", after.size <= before.size)
            // The owner's other choice. The first build had the sector too, so wherever both plan one
            // the promise is the same. It is not a law, though: the first build moved on to another
            // asset after an answer and followed any read, Bobby's own included, so now and then the
            // asset it was on had no sector to show (or had shown it that week) while the question of
            // today's chain has one. Then, and only then, the chain with the sector holds one more:
            // that sector. (54 of 100,000 such ledgers in a Python mirror of both planners when this was
            // written, and none with the chain that ships; the iPhone suite asserts it never happens, which
            // holds for the 4,000 ledgers of its own generator.)
            val other = HarnessPlanner.plan(made, now, zone, withSector())
            if (other.size > before.size) {
                oneMoreWithTheSector += 1
                val label = "round $round, with the sector: ${kinds(other).map { it.raw }} against ${kinds(before).map { it.raw }}"
                assertEquals(label, before.size + 1, other.size)
                assertTrue(label, other.any { it.step == sector } && before.none { it.step == sector })
            }
            if (before.isNotEmpty()) compared += 1
            if (after.size < before.size) fewer += 1
        }
        assertTrue("the first build planned something in too few of them to compare: $compared", compared > 800)
        assertTrue("and in many of them the plan of today is shorter: $fewer", fewer > 400)
        assertTrue("the sector is one more than the first build far too often to call it rare: $oneMoreWithTheSector of 4000", oneMoreWithTheSector <= 12)
    }

    companion object {
        private val SYMBOLS = listOf("NVDA", "AMD", "TSLA", "BTC", "SOL", "GME", "AAPL")
    }
}

/**
 * SplitMix64 from a fixed seed: the same ledgers on every machine and every run (the iPhone suite
 * seeds the same generator). Never `Random()`: a property that fails must fail again.
 */
internal class Seeded(private var state: Long) {
    fun next(): Long {
        state += 0x9E3779B97F4A7C15uL.toLong()
        var z = state
        z = (z xor (z ushr 30)) * 0xBF58476D1CE4E5B9uL.toLong()
        z = (z xor (z ushr 27)) * 0x94D049BB133111EBuL.toLong()
        return z xor (z ushr 31)
    }

    /** 0 until `bound`. */
    fun below(bound: Int): Int = ((next() ushr 1) % bound).toInt()

    /** `from`..`to`, both included. */
    fun between(from: Int, to: Int): Int = from + below(to - from + 1)

    fun <T> pick(items: List<T>): T = items[below(items.size)]
}
