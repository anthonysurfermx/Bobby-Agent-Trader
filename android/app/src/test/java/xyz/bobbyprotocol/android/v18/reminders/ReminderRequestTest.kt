package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.platform.LocalNotices
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.notify.MemoryLocalNotifier
import java.time.ZoneId

/**
 * The one thing reminders hand to the phone (1.8): the notice. Built by a pure function, so every
 * field is pinned here without Android: when it is due, what the lock screen shows, and that the
 * tap it produces is one the app reads. The cases of ios/Bobby/Tests/ReminderRequestTests.swift,
 * with the foundation's notifier in the place of the iOS calendar trigger.
 */
class ReminderRequestTest {
    private val thesisId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    private val day = 86_400_000L

    private fun notice(fireAt: Long, language: String = "en"): LocalNotice {
        val plan = ReminderCenter.plan(listOf(PendingReminder(thesisId, "NVDA", fireAt)), ReminderCopy(TestWords.of(language)).notificationBody, "local")
        assertEquals(1, plan.size)
        return plan[0]
    }

    @Test fun theRequestIsOneGenericLineOnTheRemindersChannel() {
        val zone = ZoneId.of("America/Mexico_City")
        val request = notice(Wall.at(zone, 2026, 10, 14, 18))
        assertEquals("the thesis id as stored", "v18.thesis.$thesisId", request.id)
        assertEquals("Bobby", request.title)
        assertEquals("Your reminder to review a thesis.", request.body)
        assertEquals("reminders have their own channel in the system's settings", LocalNotice.CHANNEL_THESIS_REMINDERS, request.channel)
        assertTrue(LocalNotice.valid(request))
        for (forbidden in listOf("NVDA", thesisId)) {
            assertFalse(request.title.contains(forbidden))
            assertFalse(request.body.contains(forbidden))
        }
    }

    @Test fun theRequestSpeaksTheLanguageItWasWrittenIn() {
        val zone = ZoneId.of("Europe/Madrid")
        for (code in TestWords.languages) {
            val request = notice(Wall.at(zone, 2026, 10, 10, 18), code)
            assertEquals(code, ReminderCopy(TestWords.of(code)).notificationBody, request.body)
            assertEquals(code, "Bobby", request.title)
            assertTrue(code, LocalNotice.valid(request))
        }
    }

    @Test fun theTapThePhoneHandsBackIsOneTheAppReads() {
        val zone = ZoneId.of("America/Mexico_City")
        val request = notice(Wall.at(zone, 2026, 10, 14, 18))
        val info = request.payload
        assertEquals("nothing else travels with the notice", setOf("kind", "thesisId", "owner"), info.keys)
        assertEquals("thesis-review", info["kind"])
        assertEquals(thesisId, info["thesisId"])
        assertEquals("local", info["owner"])
        assertEquals(ReminderTap(thesisId), ReminderIntent.tap(info))
        // The phone keeps a notice's payload as JSON in the tapped intent: it must survive that trip unchanged.
        val back = LocalNotices.payload(LocalNotices.payloadJson(info).toString())
        assertEquals(info, back)
        assertEquals(ReminderTap(thesisId), ReminderIntent.tap(back!!))
        // A notice of another feature is told apart by the same payload.
        assertNull(ReminderIntent.tap(mapOf(LocalNotice.KIND to "follow-up", "thesisId" to thesisId)))
    }

    @Test fun theNoticeIsDueOnceAtTheMomentThePersonChose() = runTest {
        // Two zones a day apart from each other, so at least one is far from this machine's own.
        for (name in listOf("Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Mexico_City", "Asia/Kolkata")) {
            val zone = ZoneId.of(name)
            for ((days, h, mi) in listOf(Triple(1, 18, 0), Triple(3, 18, 0), Triple(7, 18, 0), Triple(31, 18, 0), Triple(40, 9, 30), Triple(200, 23, 59), Triple(364, 0, 1))) {
                var clock = Wall.at(zone, 2026, 10, 7, 12)
                val store = MemoryKeyValueStore()
                val book = ThesisBook(store)
                val notifier = MemoryLocalNotifier { clock }
                notifier.permission = LocalNotifier.Permission.ALLOWED
                val center = ReminderCenter(notifier, store).also { c ->
                    c.now = { clock }
                    c.zone = { zone }
                    c.consent = { RiskNotice.ACCEPTED }
                    c.activeTheses = { owner -> book.active(owner) }
                }
                val thesis = book.create(ThesisDraft("NVDA", "NVIDIA", true, null, "Why I am looking at NVDA"), null, clock)
                // That wall-clock time, `days` from today.
                val picked = ReminderSchedule.onDay(Wall.at(zone, 2026, 10, 7, h, mi), ReminderSchedule.day(clock, zone).plusDays(days.toLong()), zone)
                val label = "$name +$days $h:$mi"
                assertEquals(label, ReminderCenter.Outcome.Scheduled(picked), center.schedule(thesis.id, "NVDA", picked))
                val planned = notifier.notice(ReminderCenter.identifier(thesis.id))!!
                assertEquals(label, picked, planned.fireAtEpochMs)
                assertEquals("a full date on that zone's clock", listOf(h, mi, 0), Wall.parts(planned.fireAtEpochMs, zone).subList(3, 6))
                assertEquals(label, ReminderSchedule.day(clock, zone).plusDays(days.toLong()), ReminderSchedule.day(planned.fireAtEpochMs, zone))
                // Not a second before, and once.
                clock = picked - 1_000L
                assertTrue(label, notifier.deliverDue().isEmpty())
                clock = picked
                assertEquals(label, listOf(planned), notifier.deliverDue())
                clock = picked + 400 * day
                assertTrue("a reminder fires once", notifier.deliverDue().isEmpty())
                assertTrue(notifier.pendingIds().isEmpty())
            }
        }
    }

    @Test fun eighteenHoldsTheWallClockAcrossAClockChange() {
        // Within a year Madrid changes its clocks twice: 18:00 on every one of the next 370 evenings
        // is still 18:00 there.
        val zone = ZoneId.of("Europe/Madrid")
        val today = ReminderSchedule.day(Wall.at(zone, 2026, 10, 7, 12), zone)
        for (days in 1..370 step 9) {
            val fireAt = ReminderSchedule.evening(today.plusDays(days.toLong()), zone)
            val request = notice(fireAt)
            assertEquals("+$days", fireAt, request.fireAtEpochMs)
            assertEquals("+$days", listOf(18, 0, 0), Wall.parts(request.fireAtEpochMs, zone).subList(3, 6))
        }
    }

    @Test fun aMomentThatPassedIsNeverPlanned() {
        // Why the centre never hands the phone a moment that passed: the notifier would refuse it,
        // and the list would then say something the phone will not deliver.
        val zone = ZoneId.of("America/Mexico_City")
        val now = Wall.at(zone, 2026, 10, 7, 12)
        val notifier = MemoryLocalNotifier { now }
        notifier.permission = LocalNotifier.Permission.ALLOWED
        assertFalse(notifier.schedule(notice(now - 3 * day)))
        assertFalse(notifier.schedule(notice(now)))
        assertTrue(notifier.schedule(notice(now + ReminderSchedule.MINIMUM_LEAD_MS)))
        assertTrue(ReminderSchedule.HAND_OFF_MARGIN_MS > 0)
        assertTrue("a reminder set a minute ahead is still written", ReminderSchedule.HAND_OFF_MARGIN_MS < ReminderSchedule.MINIMUM_LEAD_MS)
    }
}
