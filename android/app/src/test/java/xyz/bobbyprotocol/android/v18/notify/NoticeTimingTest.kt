package xyz.bobbyprotocol.android.v18.notify

import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.harness.HarnessPlanner
import java.time.ZoneId
import java.time.ZonedDateTime

/**
 * What the phone does with a planned notice when its work finally runs (NoticeTiming). Android is
 * never exact: the system holds work back while the phone is idle, and a phone that was off runs
 * what it missed when it comes back. A follow-up is not shown outside the day's allowed hours and
 * not more than a day late; a thesis reminder, on the day the person chose, is shown however late.
 *
 * These are the decisions only. That WorkManager carries them out was never seen on a device.
 */
class NoticeTimingTest {
    private val mexico: ZoneId = ZoneId.of("America/Mexico_City")
    private val hour = 3_600_000L
    private val minute = 60_000L
    private val followUp = LocalNotice.Delivery.FOLLOW_UP
    private val reminder = LocalNotice.Delivery.ANY_TIME

    /** October 2026, local time. The 7th is a Wednesday. */
    private fun at(day: Int, hour: Int, minute: Int = 0, zone: ZoneId = mexico): Long =
        ZonedDateTime.of(2026, 10, day, hour, minute, 0, 0, zone).toInstant().toEpochMilli()

    private fun decide(planned: Long, now: Long, delivery: LocalNotice.Delivery = followUp, zone: ZoneId = mexico) = NoticeTiming.decide(planned, delivery, now, zone)

    private val post = NoticeTiming.Decision.Post
    private val drop = NoticeTiming.Decision.Drop
    private fun wait(until: Long) = NoticeTiming.Decision.Wait(until)

    // What a notice asks for

    @Test fun aFollowUpAsksForTheDaysHoursAndAnExpiryAndAReminderForNeither() {
        assertEquals(LocalNotice.Delivery(9, 21, 24 * hour), LocalNotice.Delivery.of(LocalNotice.CHANNEL_FOLLOW_UPS))
        assertEquals(LocalNotice.Delivery(), LocalNotice.Delivery.of(LocalNotice.CHANNEL_THESIS_REMINDERS))
        val planned = LocalNotice("v18.follow.asset", "Bobby", "NVDA, a day later.", at(8, 10), LocalNotice.CHANNEL_FOLLOW_UPS)
        assertEquals("the channel's own unless the notice says otherwise", followUp, planned.delivery)
        assertEquals(reminder, LocalNotice("v18.thesis.a", "Bobby", "Your reminder to review a thesis.", at(8, 18), LocalNotice.CHANNEL_THESIS_REMINDERS).delivery)
        val options = HarnessPlanner.Options()
        assertEquals("the hours the worker keeps are the hours the planner plans inside", options.earliestHour, followUp.fromHour)
        assertEquals(options.latestHour, followUp.untilHour)
    }

    // On time

    @Test fun aFollowUpThatRunsOnTimeIsShown() {
        assertEquals(post, decide(at(8, 10), at(8, 10)))
        assertEquals("a few minutes late is what an Android phone calls on time", post, decide(at(8, 10), at(8, 10, 7)))
        assertEquals("the first allowed minute", post, decide(at(8, 9), at(8, 9)))
        assertEquals(post, decide(at(8, 20, 59), at(8, 20, 59)))
    }

    @Test fun onTimeForTheLastAllowedMomentIsShownAFewMinutesPastTheHour() {
        // Someone who asked at 22:40 is answered at 21:00 the next day, and no phone runs work on the dot.
        assertEquals(post, decide(at(8, 21), at(8, 21)))
        assertEquals(post, decide(at(8, 21), at(8, 21, 4)))
        assertEquals("on time means within this long of its own moment", post, decide(at(8, 21), at(8, 21) + NoticeTiming.GRACE_MS))
        assertEquals("and no longer: it waits for the morning", wait(at(9, 9)), decide(at(8, 21), at(8, 21) + NoticeTiming.GRACE_MS + 1))
        assertEquals(post, decide(at(8, 20, 55), at(8, 21, 5)))
        assertEquals(15 * minute, NoticeTiming.GRACE_MS)
    }

    @Test fun onlyBeingOnTimeExcusesTheHour() {
        // Planned for 20:00 and run at 21:10: seventy minutes late and past the hour. It waits.
        assertEquals(wait(at(9, 9)), decide(at(8, 20), at(8, 21, 10)))
        assertEquals("the hour itself is still allowed, however late it is for its moment", post, decide(at(8, 20), at(8, 21)))
        // A moment that was never inside the hours is not excused by being on time for it.
        assertEquals(wait(at(8, 9)), decide(at(8, 3), at(8, 3)))
        assertEquals(wait(at(8, 9)), decide(at(8, 8, 50), at(8, 8, 58)))
        assertEquals(post, decide(at(8, 8, 50), at(8, 9)))
    }

    // Late, outside the allowed hours

    @Test fun aFollowUpHeldBackUntilTheNightWaitsForTheMorning() {
        // Planned for 20:30; the idle phone runs it in a maintenance window at 03:10.
        assertEquals(wait(at(9, 9)), decide(at(8, 20, 30), at(9, 3, 10)))
        assertEquals("before midnight it is tomorrow's morning", wait(at(9, 9)), decide(at(8, 20, 30), at(8, 23, 30)))
        assertEquals("one minute before the day opens", wait(at(9, 9)), decide(at(8, 20, 30), at(9, 8, 59)))
        assertEquals("and then it is shown", post, decide(at(8, 20, 30), at(9, 9)))
        assertEquals(post, decide(at(8, 20, 30), at(9, 9, 2)))
    }

    @Test fun whatWaitsNeverWaitsPastItsExpiry() {
        // Planned for 09:30; the phone was off until 21:40 the same day. Tomorrow 09:00 is 23.5 hours late: it may wait.
        assertEquals(wait(at(9, 9)), decide(at(8, 9, 30), at(8, 21, 40)))
        // Planned for 09:00 sharp: tomorrow 09:00 is a day late to the minute, the last moment it may be shown.
        assertEquals(wait(at(9, 9)), decide(at(8, 9), at(8, 22)))
        assertEquals(post, decide(at(8, 9), at(9, 9)))
        // A notice that lives for six hours: at 23:00 it is three hours late, and the morning it would wait for is thirteen.
        assertEquals("dropped now, so nothing stays listed that will never be shown", drop, decide(at(8, 20), at(8, 23), LocalNotice.Delivery(9, 21, 6 * hour)))
        assertEquals("one that the morning still finds alive waits for it", wait(at(9, 9)), decide(at(8, 20), at(8, 23), LocalNotice.Delivery(9, 21, 14 * hour)))
    }

    // Late, past the expiry

    @Test fun aFollowUpMoreThanADayLateIsDroppedWhateverTheHour() {
        assertEquals("a day late to the minute is the last moment", post, decide(at(8, 10), at(9, 10)))
        assertEquals(drop, decide(at(8, 10), at(9, 10) + 1))
        assertEquals("a phone that was off for a weekend", drop, decide(at(8, 10), at(11, 12)))
        assertEquals("at night too: it does not wait for a morning it will be dropped in", drop, decide(at(8, 10), at(10, 2)))
    }

    @Test fun twoFollowUpsOfAPhoneThatWasOffAreNotBothShownStale() {
        // The asset's (Thursday 10:00) and the sector's (Friday 10:00); the phone comes back on Friday at 10:30.
        assertEquals("yesterday's is past its day", drop, decide(at(8, 10), at(9, 10, 30)))
        assertEquals("today's is shown", post, decide(at(9, 10), at(9, 10, 30)))
    }

    // Thesis reminders keep today's behaviour

    @Test fun aThesisReminderIsShownHoweverLateAndAtAnyHour() {
        assertEquals(post, decide(at(8, 18), at(8, 18), reminder))
        assertEquals("the person chose the day: late is still wanted", post, decide(at(8, 18), at(9, 3, 10), reminder))
        assertEquals(post, decide(at(8, 18), at(20, 2), reminder))
        assertEquals("a reminder the person set for 06:30 is shown at 06:30", post, decide(at(8, 6, 30), at(8, 6, 30), reminder))
    }

    // The phone's own clock

    @Test fun theHoursAreThePhonesOwnInWhateverZoneItIsNow() {
        val madrid = ZoneId.of("Europe/Madrid")
        // 03:00 in Mexico City is 11:00 in Madrid: a phone that travelled shows it there.
        val planned = at(8, 20, 30)
        val now = at(9, 3)
        assertEquals(wait(at(9, 9)), decide(planned, now))
        assertEquals(post, decide(planned, now, zone = madrid))
        assertEquals("the morning it waits for is the morning where the phone is",
                     wait(at(9, 9, zone = madrid)), decide(at(8, 20, 30, madrid), at(9, 2, 0, madrid), zone = madrid))
    }

    @Test fun aClockChangeDoesNotMoveTheMorning() {
        val berlin = ZoneId.of("Europe/Berlin")
        // Sunday 25 October 2026: Berlin's clocks go back at 03:00. The morning it waits for is still 09:00 on the wall.
        val planned = ZonedDateTime.of(2026, 10, 24, 20, 30, 0, 0, berlin).toInstant().toEpochMilli()
        val night = ZonedDateTime.of(2026, 10, 25, 4, 0, 0, 0, berlin).toInstant().toEpochMilli()
        val nine = ZonedDateTime.of(2026, 10, 25, 9, 0, 0, 0, berlin).toInstant().toEpochMilli()
        assertEquals(wait(nine), decide(planned, night, zone = berlin))
        assertEquals("thirteen and a half hours on the clock, one more in the night", 13 * hour + 30 * minute, nine - planned)
    }

    // What is stored with a planned notice

    @Test fun whatANoticeAsksForSurvivesTheIndexOnDisk() {
        for (delivery in listOf(followUp, reminder, LocalNotice.Delivery(7, 22), LocalNotice.Delivery(expiresAfterMs = 2 * hour))) {
            assertEquals(delivery, LocalNotice.Delivery.fromJson(JSONObject(delivery.toJson().toString()), LocalNotice.CHANNEL_THESIS_REMINDERS))
        }
        assertEquals("a reminder stores nothing to ask for", 0, reminder.toJson().length())
        assertEquals("nothing stored: the channel's own", followUp, LocalNotice.Delivery.fromJson(null, LocalNotice.CHANNEL_FOLLOW_UPS))
        assertEquals(reminder, LocalNotice.Delivery.fromJson(null, LocalNotice.CHANNEL_THESIS_REMINDERS))
        val broken = JSONObject().put("from", 23).put("until", 4).put("expiresAfterMs", "soon")
        assertEquals("something unusable: the channel's own, never a notice without its hours", followUp, LocalNotice.Delivery.fromJson(broken, LocalNotice.CHANNEL_FOLLOW_UPS))
        assertEquals(followUp, LocalNotice.Delivery.fromJson(JSONObject().put("from", JSONObject.NULL).put("until", 21), LocalNotice.CHANNEL_FOLLOW_UPS))
    }

    @Test fun aNoticeThatAsksForHoursThatAreNotADayIsNotPlanned() {
        assertTrue(followUp.isValid)
        assertTrue(reminder.isValid)
        for (bad in listOf(LocalNotice.Delivery(9, null), LocalNotice.Delivery(null, 21), LocalNotice.Delivery(21, 9), LocalNotice.Delivery(9, 9),
                           LocalNotice.Delivery(-1, 21), LocalNotice.Delivery(9, 24), LocalNotice.Delivery(expiresAfterMs = 0))) {
            assertFalse(bad.toString(), bad.isValid)
            assertFalse(LocalNotice.valid(LocalNotice("v18.follow.asset", "Bobby", "x", at(8, 10), LocalNotice.CHANNEL_FOLLOW_UPS, delivery = bad)))
        }
    }

    // The phone in tests follows the same decision

    @Test fun aLatePhoneKeepsAFollowUpPendingUntilMorningAndShowsAReminderAtOnce() = runTest {
        var clock = at(7, 19)
        val phone = MemoryLocalNotifier { clock }
        phone.zone = mexico
        assertTrue(phone.requestPermission())
        val asset = LocalNotice("v18.follow.asset", "Bobby", "NVDA, a day later.", at(8, 20, 30), LocalNotice.CHANNEL_FOLLOW_UPS, mapOf(LocalNotice.KIND to "follow-up"))
        val thesis = LocalNotice("v18.thesis.a", "Bobby", "Your reminder to review a thesis.", at(8, 18), LocalNotice.CHANNEL_THESIS_REMINDERS, mapOf(LocalNotice.KIND to "thesis-review"))
        assertTrue(phone.schedule(asset))
        assertTrue(phone.schedule(thesis))

        // The phone lay idle through the evening and runs both in the night.
        clock = at(9, 3, 10)
        assertEquals("only the reminder sounds at night", listOf("v18.thesis.a"), phone.deliverDue().map { it.id })
        assertEquals("the follow-up is still something the phone will show", setOf("v18.follow.asset"), phone.pendingIds())
        clock = at(9, 9, 1)
        assertEquals(listOf("v18.follow.asset"), phone.deliverDue().map { it.id })
        assertTrue(phone.pendingIds().isEmpty())
    }

    @Test fun aFollowUpThePhoneMissedByMoreThanADayIsNeverShownAndNoLongerListed() = runTest {
        var clock = at(7, 19)
        val phone = MemoryLocalNotifier { clock }
        phone.zone = mexico
        assertTrue(phone.requestPermission())
        assertTrue(phone.schedule(LocalNotice("v18.follow.asset", "Bobby", "NVDA, a day later.", at(8, 10), LocalNotice.CHANNEL_FOLLOW_UPS)))
        clock = at(10, 12)
        assertTrue(phone.deliverDue().isEmpty())
        assertTrue("what is listed is what the phone will deliver", phone.pendingIds().isEmpty())
        assertTrue(phone.delivered.isEmpty())
    }

    @Test fun withoutAZoneTheTestPhoneIsPunctualAsBefore() = runTest {
        var clock = at(7, 19)
        val phone = MemoryLocalNotifier { clock }
        assertTrue(phone.requestPermission())
        assertTrue(phone.schedule(LocalNotice("v18.follow.asset", "Bobby", "NVDA, a day later.", at(8, 20, 30), LocalNotice.CHANNEL_FOLLOW_UPS)))
        clock = at(9, 3, 10)
        assertEquals(listOf("v18.follow.asset"), phone.deliverDue().map { it.id })
    }
}
