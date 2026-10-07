package xyz.bobbyprotocol.android.v18.harness

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * The harness (1.8), the plan: after a question, the asset the next day, its sector the day after,
 * the week on Monday, then silence. Answering a follow-up starts again the next day; ignoring them
 * makes Bobby quieter. Everything is a pure function of the ledger and the clock.
 * The cases of ios/Bobby/Tests/HarnessPlannerTests.swift. They pin the planned moment: Android
 * delivers at or after it, never exactly at it.
 */
class HarnessPlannerTest {
    private val zone = HarnessDays.mexico
    private var ledger = HarnessLedger()
    private val hour = 3_600_000L

    /** Wednesday 7 October 2026, local time. */
    private fun at(day: Int, hour: Int, minute: Int = 0): Long = HarnessDays.at(day, hour, minute)

    private fun ask(symbol: String, date: Long, price: Double? = 100.0, equity: Boolean = true) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, date, symbol = symbol, name = symbol, isEquity = equity, price = price))
    }

    private fun sent(step: HarnessStep, date: Long, symbol: String? = "NVDA", sector: String? = null) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, date, symbol = symbol, step = step, sector = sector))
    }

    private fun opened(step: HarnessStep, date: Long, symbol: String? = "NVDA", sector: String? = null) {
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, date, symbol = symbol, step = step, sector = sector))
    }

    private fun plan(now: Long, weeklyCovered: Boolean = false): List<HarnessFollowUp> =
        HarnessPlanner.plan(ledger, now, zone, HarnessPlanner.Options(weeklyCovered = weeklyCovered))

    private fun kinds(plan: List<HarnessFollowUp>): List<HarnessStep> = plan.map { it.step }

    // The first question

    @Test fun nothingIsPlannedBeforeAnyQuestion() {
        assertEquals(emptyList<HarnessFollowUp>(), plan(at(7, 12)))
        ledger.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, at(7, 12)))
        assertEquals("opening the app is not a question", emptyList<HarnessFollowUp>(), plan(at(7, 13)))
    }

    @Test fun oneQuestionPlansTheAssetItsSectorAndTheWeek() {
        ask("NVDA", at(7, 16, 40))
        val steps = plan(at(7, 16, 41))
        assertEquals(listOf(HarnessStep.ASSET, HarnessStep.SECTOR, HarnessStep.WEEK), kinds(steps))
        assertEquals("the next day, at the time they asked", at(8, 16, 40), steps[0].fireAt)
        assertEquals("NVDA", steps[0].symbol)
        assertEquals(1, steps[0].days)
        assertEquals("the sector the day after", at(9, 16, 40), steps[1].fireAt)
        assertEquals("semis", steps[1].sector)
        assertEquals("NVDA", steps[1].symbol)
        assertEquals("the week on the next Monday", at(12, 16, 40), steps[2].fireAt)
        assertEquals(DayOfWeek.MONDAY, Instant.ofEpochMilli(steps[2].fireAt).atZone(zone).dayOfWeek)
        assertEquals(0, steps[2].others)
    }

    @Test fun followUpsStayInsideWakingHours() {
        ask("NVDA", at(7, 23, 30))
        assertEquals("a late question is followed up at nine in the evening", at(8, 21, 0), plan(at(7, 23, 31)).firstOrNull()?.fireAt)
        ledger = HarnessLedger()
        ask("NVDA", at(7, 2, 10))
        assertEquals("a night question at nine in the morning", at(8, 9, 0), plan(at(7, 2, 11)).firstOrNull()?.fireAt)
    }

    @Test fun anAssetWithoutASectorSkipsThatStep() {
        ask("GME", at(7, 12))
        val steps = plan(at(7, 12, 1))
        assertEquals(listOf(HarnessStep.ASSET, HarnessStep.WEEK), kinds(steps))
        assertEquals("the week is still the next Monday", at(12, 12), steps[1].fireAt)
    }

    @Test fun theWeekNamesTheLatestAssetAndCountsTheOthers() {
        ask("BTC", at(5, 10), equity = false)
        ask("TSLA", at(6, 10))
        ask("NVDA", at(7, 10))
        val week = plan(at(7, 10, 1)).lastOrNull()
        assertEquals(HarnessStep.WEEK, week?.step)
        assertEquals("NVDA", week?.symbol)
        assertEquals(2, week?.others)
    }

    @Test fun aQuestionOnSundayPutsTheWeekAWeekLater() {
        ask("NVDA", at(11, 12))                      // Sunday
        val steps = plan(at(11, 12, 1))
        assertEquals("Monday is taken by the asset: the week is the Monday after", listOf(at(12, 12), at(13, 12), at(19, 12)), steps.map { it.fireAt })
    }

    // Ignored

    @Test fun anIgnoredAssetIsFollowedByItsSectorThenTheWeekThenSilence() {
        ask("NVDA", at(7, 16))
        sent(HarnessStep.ASSET, at(8, 16))
        assertEquals("48 hours after the question: the sector", listOf(HarnessStep.SECTOR, HarnessStep.WEEK), kinds(plan(at(8, 20))))
        assertEquals(at(9, 16), plan(at(8, 20)).firstOrNull()?.fireAt)
        sent(HarnessStep.SECTOR, at(9, 16), sector = "semis")
        assertEquals(listOf(HarnessStep.WEEK), kinds(plan(at(10, 9))))
        assertEquals(at(12, 16), plan(at(10, 9)).firstOrNull()?.fireAt)
        sent(HarnessStep.WEEK, at(12, 16))
        assertEquals("nothing was opened: Bobby goes quiet", emptyList<HarnessFollowUp>(), plan(at(12, 17)))
        assertEquals("and stays quiet", emptyList<HarnessFollowUp>(), plan(at(20, 9)))
    }

    @Test fun aKindWhoseLastTwoShowingsWentUnansweredRests() {
        ask("NVDA", at(1, 12))
        sent(HarnessStep.ASSET, at(2, 12))                                              // ignored
        sent(HarnessStep.SECTOR, at(3, 12), sector = "semis"); opened(HarnessStep.SECTOR, at(3, 14), sector = "semis")
        sent(HarnessStep.ASSET, at(4, 14))                                              // ignored again
        ask("AAPL", at(5, 12))
        val steps = plan(at(5, 12, 1))
        assertFalse("two asset follow-ups in a row went unanswered", steps.any { it.step == HarnessStep.ASSET })
        assertEquals("a kind they do answer still comes", HarnessStep.SECTOR, steps.firstOrNull()?.step)
        assertEquals("bigtech", steps.firstOrNull()?.sector)
    }

    @Test fun anOlderAnswerDoesNotKeepAKindAlive() {
        ask("NVDA", at(1, 12))
        sent(HarnessStep.ASSET, at(2, 12)); opened(HarnessStep.ASSET, at(2, 13))        // answered once, long before
        sent(HarnessStep.SECTOR, at(3, 13), sector = "semis"); opened(HarnessStep.SECTOR, at(3, 14), sector = "semis")
        sent(HarnessStep.ASSET, at(4, 14))                                              // ignored
        sent(HarnessStep.WEEK, at(5, 14)); opened(HarnessStep.WEEK, at(5, 15), symbol = null)
        sent(HarnessStep.ASSET, at(6, 15))                                              // ignored
        ask("AAPL", at(7, 12))
        assertFalse("the last two were ignored, whatever happened before them", plan(at(7, 12, 1)).any { it.step == HarnessStep.ASSET })
    }

    @Test fun threeInARowUnansweredAndNothingComesForTwoWeeksWhateverIsAsked() {
        ask("NVDA", at(1, 12))
        sent(HarnessStep.ASSET, at(2, 12))
        ask("TSLA", at(2, 19))
        sent(HarnessStep.ASSET, at(3, 19), symbol = "TSLA")
        ask("SOL", at(3, 20), equity = false)
        sent(HarnessStep.SECTOR, at(5, 20), symbol = "SOL", sector = "layer1")
        assertEquals("three shown, none answered: the week that was coming is dropped", emptyList<HarnessFollowUp>(), plan(at(5, 21)))
        ask("AAPL", at(9, 12))
        assertEquals("a new question does not restart it inside the two weeks", emptyList<HarnessFollowUp>(), plan(at(9, 12, 1)))
        ask("AAPL", at(20, 12))
        assertFalse("two weeks after the last one, a question may be followed up again", plan(at(20, 12, 1)).isEmpty())
    }

    @Test fun neverMoreThanFourInAWeek() {
        ask("NVDA", at(5, 12))
        for (day in 6..9) { sent(HarnessStep.ASSET, at(day, 12)); opened(HarnessStep.ASSET, at(day, 13)) }
        assertEquals("four were shown in the last seven days", emptyList<HarnessFollowUp>(), plan(at(9, 13, 1)).filter { it.fireAt < at(13, 0) })
    }

    // Answered

    @Test fun openingTheAssetBringsAnotherTheNextDay() {
        ask("NVDA", at(7, 16))
        sent(HarnessStep.ASSET, at(8, 16))
        opened(HarnessStep.ASSET, at(8, 18, 30))
        val steps = plan(at(8, 18, 31))
        assertEquals("they answered: another one tomorrow", HarnessStep.ASSET, steps.firstOrNull()?.step)
        assertEquals("the only asset they asked about", "NVDA", steps.firstOrNull()?.symbol)
        assertEquals("at the time they answered", at(9, 18, 30), steps.firstOrNull()?.fireAt)
        assertEquals(2, steps.firstOrNull()?.days)
    }

    @Test fun afterAnAnswerTheNextAssetIsAnotherOneTheyCareAbout() {
        ask("BTC", at(5, 10), equity = false)
        ask("TSLA", at(6, 10)); ask("TSLA", at(6, 11)); ask("TSLA", at(6, 12))
        ask("NVDA", at(7, 16))
        sent(HarnessStep.ASSET, at(8, 16))
        opened(HarnessStep.ASSET, at(8, 17))
        assertEquals("asked about three times: it matters most among the others", "TSLA", plan(at(8, 17, 1)).firstOrNull()?.symbol)
    }

    @Test fun comingBackWithoutTappingCountsAsAnAnswer() {
        ask("NVDA", at(7, 16))
        sent(HarnessStep.ASSET, at(8, 16))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, at(8, 19), symbol = "NVDA", step = HarnessStep.ASSET))
        assertEquals(at(9, 19), plan(at(8, 19, 1)).firstOrNull()?.fireAt)
    }

    @Test fun aNewQuestionStartsAgainFromThatAsset() {
        ask("NVDA", at(7, 16))
        sent(HarnessStep.ASSET, at(8, 16))
        ask("SOL", at(8, 20), equity = false)
        val steps = plan(at(8, 20, 1))
        assertEquals(listOf(HarnessStep.ASSET, HarnessStep.SECTOR, HarnessStep.WEEK), kinds(steps))
        assertEquals("SOL", steps[0].symbol)
        assertEquals(at(9, 20), steps[0].fireAt)
        assertEquals("layer1", steps[1].sector)
    }

    @Test fun aSectorIsNotRepeatedWithinAWeek() {
        ask("NVDA", at(1, 12))
        sent(HarnessStep.ASSET, at(2, 12)); opened(HarnessStep.ASSET, at(2, 13))
        sent(HarnessStep.SECTOR, at(3, 13), sector = "semis"); opened(HarnessStep.SECTOR, at(3, 14), sector = "semis")
        ask("AMD", at(4, 12))
        assertFalse("semiconductors were shown three days ago", plan(at(4, 12, 1)).any { it.step == HarnessStep.SECTOR })
    }

    @Test fun theHourTheyAnswerAtIsLearned() {
        ask("NVDA", at(1, 22))
        for (day in 2..4) { sent(HarnessStep.ASSET, at(day, 21)); opened(HarnessStep.ASSET, at(day, 21, 5)) }
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, at(5, 8, 15), symbol = "NVDA", step = HarnessStep.WEEK))
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, at(6, 8, 40), symbol = "NVDA", step = HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, at(7, 8, 5), symbol = "NVDA", step = HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, at(8, 8, 50), symbol = "NVDA", step = HarnessStep.ASSET))
        val profile = HarnessProfile.make(ledger, at(8, 9), zone)
        assertEquals("four answers at eight, three at nine in the evening", 8, profile.hour)
        ask("TSLA", at(8, 23))
        assertEquals("their hour, inside waking hours, and never sooner than 18 hours", at(10, 9), plan(at(8, 23, 1)).firstOrNull()?.fireAt)
    }

    // Spacing against what was really shown

    @Test fun theWeekIsNeverSoonerThanEighteenHoursAfterTheQuestion() {
        // Their hour is nine in the morning; assets rest; GME has no sector: only the week is left.
        ask("NVDA", at(1, 12))
        for (day in listOf(2, 3, 5)) { sent(HarnessStep.SECTOR, at(day, 9), sector = "semis"); opened(HarnessStep.SECTOR, at(day, 9, 5), sector = "semis") }
        sent(HarnessStep.ASSET, at(6, 9)); sent(HarnessStep.ASSET, at(7, 9))
        opened(HarnessStep.WEEK, at(8, 9, 10), symbol = null)
        ask("GME", at(11, 23))                         // Sunday night
        val steps = plan(at(11, 23, 1))
        assertEquals(listOf(HarnessStep.WEEK), kinds(steps))
        assertEquals("Monday at nine is ten hours away: the Monday after", at(19, 9), steps.firstOrNull()?.fireAt)
    }

    @Test fun aChangeOfTimeZoneNeverPutsTwoOnTheSameDay() {
        val london = ZoneId.of("Europe/London")
        val newYork = ZoneId.of("America/New_York")
        val asked = HarnessDays.at(7, 1, zone = london)
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, asked, symbol = "NVDA", name = "NVDA", isEquity = true, price = 100.0))
        // Planned and shown in London: Thursday at nine, which is four in the morning in New York.
        val shown = HarnessDays.at(8, 9, zone = london)
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, shown, symbol = "NVDA", step = HarnessStep.ASSET))
        val now = HarnessDays.at(8, 11, zone = newYork)
        val steps = HarnessPlanner.plan(ledger, now, newYork)
        fun day(at: Long) = Instant.ofEpochMilli(at).atZone(newYork).toLocalDate()
        val sector = steps.firstOrNull { it.step == HarnessStep.SECTOR }
        assertNotNull(sector)
        assertFalse("not on the day one already arrived", day(sector!!.fireAt) == day(shown))
        assertTrue(sector.fireAt - shown >= 18 * hour)
        for ((a, b) in steps.zip(steps.drop(1))) {
            assertFalse(day(a.fireAt) == day(b.fireAt))
            assertTrue(b.fireAt - a.fireAt >= 18 * hour)
        }
    }

    // Limits

    @Test fun aPayingAccountWithTheMondayBriefingGetsNoSecondWeek() {
        ask("NVDA", at(7, 16))
        assertEquals(listOf(HarnessStep.ASSET, HarnessStep.SECTOR), kinds(plan(at(7, 16, 1), weeklyCovered = true)))
    }

    @Test fun anOldQuestionIsNotFollowedUp() {
        ask("NVDA", at(1, 12))
        assertEquals("more than two weeks later there is nothing to come back to", emptyList<HarnessFollowUp>(), plan(at(20, 12)))
    }

    @Test fun nothingIsEverPlannedInThePast() {
        ask("NVDA", at(7, 16))
        val late = plan(at(9, 18))
        assertTrue(late.all { it.fireAt > at(9, 18) })
        assertEquals("the days that passed unseen are not sent late", listOf(HarnessStep.WEEK), kinds(late))
    }

    @Test fun onePendingNotificationPerStep() {
        ask("NVDA", at(7, 16))
        assertEquals(listOf("v18.follow.asset", "v18.follow.sector", "v18.follow.week"), plan(at(7, 16, 1)).map { it.id })
    }

    // Android: the clock may jump an hour on the day a follow-up is planned for.

    @Test fun aClockChangeMovesNothingToAnotherDayOrOutOfWakingHours() {
        val berlin = ZoneId.of("Europe/Berlin")
        // Friday 23 October 2026, 20:30 in Berlin; clocks go back on Sunday the 25th.
        val asked = ZonedDateTime.of(2026, 10, 23, 20, 30, 0, 0, berlin).toInstant().toEpochMilli()
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, asked, symbol = "NVDA", name = "NVDA", isEquity = true, price = 100.0))
        val steps = HarnessPlanner.plan(ledger, asked + 60_000L, berlin)
        assertEquals(listOf(HarnessStep.ASSET, HarnessStep.SECTOR, HarnessStep.WEEK), kinds(steps))
        val local = steps.map { Instant.ofEpochMilli(it.fireAt).atZone(berlin) }
        assertEquals("the same time of day on each side of the change", listOf("20:30", "20:30", "20:30"), local.map { "%02d:%02d".format(it.hour, it.minute) })
        assertEquals(listOf(24, 25, 26), local.map { it.dayOfMonth })
    }
}
