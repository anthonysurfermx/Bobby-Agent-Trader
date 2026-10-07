package xyz.bobbyprotocol.android.v18.reminders

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.ZoneId
import java.util.Locale

/**
 * Reminder dates (1.8): 18:00 on the chosen day in the person's own time zone, never in the past.
 * Fixed zone, so midnight, month ends and the clock change are pinned. The cases of
 * ios/Bobby/Tests/ReminderScheduleTests.swift.
 */
class ReminderScheduleTest {
    private val zone = ZoneId.of("Europe/Madrid")
    private val day = 86_400_000L
    private val hour = 3_600_000L

    private fun at(y: Int, mo: Int, d: Int, h: Int = 0, mi: Int = 0, s: Int = 0): Long = Wall.at(zone, y, mo, d, h, mi, s)
    private fun parts(ms: Long): List<Int> = Wall.parts(ms, zone)

    @Test fun presetsCountWholeDaysFromTodayOnEitherSideOfMidnight() {
        val lateEvening = at(2026, 10, 7, 23, 59, 30)
        assertEquals(listOf(2026, 10, 10, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.THREE_DAYS, lateEvening, zone)))
        assertEquals(listOf(2026, 10, 14, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.WEEK, lateEvening, zone)))
        assertEquals(listOf(2026, 11, 7, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.MONTH, lateEvening, zone)))
        val justAfter = at(2026, 10, 8, 0, 0, 30)
        assertEquals(listOf(2026, 10, 11, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.THREE_DAYS, justAfter, zone)))
        assertEquals(listOf(2026, 10, 15, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.WEEK, justAfter, zone)))
        assertEquals(listOf(2026, 11, 8, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.MONTH, justAfter, zone)))
    }

    @Test fun aMonthFromAMonthEndIsTheLastDayOfTheNextMonth() {
        assertEquals(listOf(2027, 2, 28, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.MONTH, at(2027, 1, 31, 9), zone)))
        assertEquals("a leap year", listOf(2028, 2, 29, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.MONTH, at(2028, 1, 31, 9), zone)))
        assertEquals(listOf(2026, 9, 30, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.MONTH, at(2026, 8, 31, 9), zone)))
        assertEquals(listOf(2027, 1, 15, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.MONTH, at(2026, 12, 15, 9), zone)))
    }

    @Test fun presetsCrossMonthAndYearEnds() {
        assertEquals(listOf(2027, 1, 2, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.THREE_DAYS, at(2026, 12, 30, 22), zone)))
        assertEquals(listOf(2027, 1, 4, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.WEEK, at(2026, 12, 28, 8), zone)))
        assertEquals(listOf(2027, 3, 2, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.THREE_DAYS, at(2027, 2, 27, 8), zone)))
        assertEquals(listOf(2026, 5, 5, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.WEEK, at(2026, 4, 28, 8), zone)))
    }

    @Test fun eighteenLocalHoldsAcrossTheClockChange() {
        // Madrid leaves summer time on 25 October 2026: a week later is still 18:00 on the wall clock.
        val before = at(2026, 10, 23, 12)
        val fire = ReminderSchedule.date(ReminderPreset.WEEK, before, zone)
        assertEquals(listOf(2026, 10, 30, 18, 0, 0), parts(fire))
        assertEquals("the night is one hour longer", 7 * day + hour, fire - at(2026, 10, 23, 18))
    }

    @Test fun aPresetIsAlwaysInTheFuture() {
        for (h in listOf(0, 6, 17, 18, 19, 23)) {
            val now = at(2026, 10, 7, h, 30)
            for (preset in ReminderPreset.entries) {
                assertTrue("$preset at $h", ReminderSchedule.date(preset, now, zone) - now > 2 * day)
            }
        }
    }

    @Test fun pickADayStartsTomorrowAtEighteen() {
        assertEquals(listOf(2026, 10, 8, 18, 0, 0), parts(ReminderSchedule.defaultPick(at(2026, 10, 7, 9), zone)))
        assertEquals(listOf(2026, 11, 1, 18, 0, 0), parts(ReminderSchedule.defaultPick(at(2026, 10, 31, 23, 59), zone)))
        val range = ReminderSchedule.pickRange(at(2026, 10, 7, 9), zone)
        assertTrue(range.first > at(2026, 10, 7, 9))
        assertEquals(listOf(2027, 10, 7, 9, 0, 0), parts(range.last))
    }

    @Test fun thePickerStartsOnAWholeMinuteThatCanBeScheduledAsShown() {
        // 12:00:30: the picker shows minutes, so its first choice must be a minute that is kept as shown.
        val now = at(2026, 10, 7, 12, 0, 30)
        val first = ReminderSchedule.pickRange(now, zone).first
        assertEquals("the first whole minute at least a minute away", listOf(2026, 10, 7, 12, 2, 0), parts(first))
        assertEquals("what the picker shows is what is set", first, ReminderSchedule.normalized(first, now, zone))
        // On the minute exactly, one minute ahead is enough.
        assertEquals(listOf(2026, 10, 7, 12, 1, 0), parts(ReminderSchedule.earliest(at(2026, 10, 7, 12), zone)))
        assertEquals(listOf(2026, 10, 7, 12, 2, 0), parts(ReminderSchedule.earliest(at(2026, 10, 7, 12, 0, 1), zone)))
        // The last minute of a day rolls into the next one.
        assertEquals(listOf(2026, 11, 1, 0, 1, 0), parts(ReminderSchedule.earliest(at(2026, 10, 31, 23, 59, 30), zone)))
        for (second in 0..59 step 7) {
            val moment = at(2026, 10, 7, 12, 0, second)
            val lower = ReminderSchedule.pickRange(moment, zone).first
            assertEquals("a whole minute", 0, parts(lower)[5])
            assertTrue(lower - moment >= ReminderSchedule.MINIMUM_LEAD_MS)
            assertTrue(lower - moment < ReminderSchedule.MINIMUM_LEAD_MS + 60_000L)
        }
    }

    @Test fun aTimeStillAheadButTooCloseStaysTodayNotTomorrow() {
        // 12:00:30, the person picks today 12:01: thirty seconds ahead is too close to hand to the
        // phone, but it has not passed. The reminder is for today, a minute later, never tomorrow.
        val now = at(2026, 10, 7, 12, 0, 30)
        assertEquals(listOf(2026, 10, 7, 12, 2, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 1), now, zone)))
        assertEquals(listOf(2026, 10, 7, 12, 2, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 1, 29), now, zone)))
        // Far enough: kept as picked.
        assertEquals(listOf(2026, 10, 7, 12, 2, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 2), now, zone)))
        assertEquals(listOf(2026, 10, 7, 12, 3, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 3), now, zone)))
        // A time that did pass today still goes to tomorrow.
        assertEquals(listOf(2026, 10, 8, 12, 0, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 0), now, zone)))
        assertEquals(listOf(2026, 10, 8, 11, 59, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 11, 59), now, zone)))
    }

    @Test fun aPickedMomentInTheFutureIsKeptToTheMinute() {
        val now = at(2026, 10, 7, 17)
        assertEquals(listOf(2026, 10, 7, 18, 0, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 18, 0, 42), now, zone)))
        assertEquals(listOf(2026, 11, 20, 7, 45, 0), parts(ReminderSchedule.normalized(at(2026, 11, 20, 7, 45), now, zone)))
    }

    @Test fun aTimeThatAlreadyPassedTodayMovesToTheNextDay() {
        val now = at(2026, 10, 7, 19)
        assertEquals(listOf(2026, 10, 8, 18, 0, 0), parts(ReminderSchedule.normalized(at(2026, 10, 7, 18), now, zone)))
        assertEquals("now is already the past", listOf(2026, 10, 8, 19, 0, 0), parts(ReminderSchedule.normalized(now, now, zone)))
        // The last evening of a month rolls into the next one.
        val monthEnd = at(2026, 10, 31, 23, 30)
        assertEquals(listOf(2026, 11, 1, 18, 0, 0), parts(ReminderSchedule.normalized(at(2026, 10, 31, 18), monthEnd, zone)))
    }

    @Test fun aPastDayIsNeverScheduledInThePast() {
        val now = at(2026, 10, 7, 19)
        // Yesterday at 20:00 was meant as a time of day: 20:00 has not passed today.
        assertEquals(listOf(2026, 10, 7, 20, 0, 0), parts(ReminderSchedule.normalized(at(2026, 10, 6, 20), now, zone)))
        // Last week at 10:00: today's 10:00 passed too, so tomorrow.
        assertEquals(listOf(2026, 10, 8, 10, 0, 0), parts(ReminderSchedule.normalized(at(2026, 9, 30, 10), now, zone)))
        var offset = -400L * day
        while (offset <= 0L) {
            val fire = ReminderSchedule.normalized(now + offset, now, zone)
            assertTrue("offset $offset", fire - now >= ReminderSchedule.MINIMUM_LEAD_MS)
            assertTrue("offset $offset", fire - now <= day + ReminderSchedule.MINIMUM_LEAD_MS + hour)
            offset += 37 * hour + 11_000L
        }
    }

    @Test fun theSameRulesHoldInAnotherTimeZone() {
        val tokyo = ZoneId.of("Asia/Tokyo")
        val now = Wall.at(tokyo, 2026, 10, 7, 23, 50)
        val fire = ReminderSchedule.date(ReminderPreset.THREE_DAYS, now, tokyo)
        assertEquals(listOf(10, 10, 18), Wall.parts(fire, tokyo).subList(1, 4))
        // The same instant is still 7 October in Madrid: the person's own zone decides the day.
        assertEquals(listOf(2026, 10, 10, 18, 0, 0), parts(ReminderSchedule.date(ReminderPreset.THREE_DAYS, now, zone)))
    }

    @Test fun theDateReadsAsWeekdayDayMonthAndTime() {
        val fire = at(2026, 10, 16, 18)
        val english = ReminderDates.whenText(fire, zone, Locale.forLanguageTag("en-GB"))
        assertTrue(english, english.contains("Fri"))
        assertTrue(english, english.contains("16"))
        assertTrue(english, english.contains("Oct"))
        assertTrue(english, english.contains("18:00"))
        val spanish = ReminderDates.whenText(fire, zone, Locale.forLanguageTag("es-MX"))
        assertTrue(spanish, spanish.lowercase(Locale.ROOT).contains("vie"))
        assertTrue(spanish, spanish.contains("16"))
    }

    // Android: the phone's own pattern, and the two pickers.

    @Test fun thePhonesPatternIsUsedWhenItCanBeAndOursWhenItCannot() {
        val fire = at(2026, 10, 16, 18)
        val us = Locale.forLanguageTag("en-US")
        assertEquals("Fri, Oct 16, 6:00 PM", ReminderDates.whenText(fire, zone, us, "EEE, MMM d, h:mm a").replace(' ', ' '))
        assertEquals("a pattern this formatter cannot read falls back", ReminderDates.whenText(fire, zone, us), ReminderDates.whenText(fire, zone, us, "EEE {{ d"))
        assertEquals(ReminderDates.whenText(fire, zone, us), ReminderDates.whenText(fire, zone, us, " "))
        assertTrue(ReminderDates.dayText(fire, zone, us).contains("16"))
        assertEquals("18:00", ReminderDates.timeText(fire, zone, us))
        // The moment is read in the zone it is shown in.
        assertEquals("01:00", ReminderDates.timeText(fire, ZoneId.of("Asia/Tokyo"), us))
    }

    @Test fun changingTheDayKeepsTheTimeAndChangingTheTimeKeepsTheDay() {
        val picked = at(2026, 10, 8, 18)
        val moved = ReminderSchedule.onDay(picked, ReminderSchedule.day(at(2026, 11, 20, 3), zone), zone)
        assertEquals(listOf(2026, 11, 20, 18, 0, 0), parts(moved))
        assertEquals(listOf(2026, 11, 20, 7, 45, 0), parts(ReminderSchedule.atTime(moved, 7, 45, zone)))
        assertEquals("a value no clock has is brought back onto it", listOf(2026, 11, 20, 23, 59, 0), parts(ReminderSchedule.atTime(moved, 99, 99, zone)))
        // Across the clock change the wall clock is what is kept.
        assertEquals(listOf(2026, 10, 30, 18, 0, 0), parts(ReminderSchedule.onDay(at(2026, 10, 23, 18), ReminderSchedule.day(at(2026, 10, 30, 12), zone), zone)))
    }
}
