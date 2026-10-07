package xyz.bobbyprotocol.android.v18.notify

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the reminders and the follow-ups may rely on, whichever notifier they are handed. */
class LocalNotifierTest {
    private var clock = 1_800_000_000_000L
    private val hour = 3_600_000L
    private val notifier = MemoryLocalNotifier { clock }

    private fun notice(id: String = "v18.reminder.3fa85f64", inMs: Long = hour, channel: String = LocalNotice.CHANNEL_THESIS_REMINDERS,
                       payload: Map<String, String> = mapOf(LocalNotice.KIND to "thesis-review")) =
        LocalNotice(id, "Bobby", "Your reminder to review a thesis.", clock + inMs, channel, payload)

    @Test fun nothingIsPlannedUntilThePersonAllowsNotifications() = runTest {
        assertEquals(LocalNotifier.Permission.NOT_DETERMINED, notifier.status())
        assertFalse("planning never asks by itself", notifier.schedule(notice()))
        assertEquals(0, notifier.asked)
        assertTrue(notifier.requestPermission())
        assertEquals(1, notifier.asked)
        assertTrue(notifier.requestPermission())
        assertEquals("the system's question is shown once", 1, notifier.asked)
        assertTrue(notifier.schedule(notice()))
        assertEquals(setOf("v18.reminder.3fa85f64"), notifier.pendingIds())
    }

    @Test fun aNoIsRememberedAndNothingIsPlanned() = runTest {
        notifier.grantsWhenAsked = false
        assertFalse(notifier.requestPermission())
        assertEquals(LocalNotifier.Permission.DENIED, notifier.status())
        assertFalse(notifier.requestPermission())
        assertEquals(1, notifier.asked)
        assertFalse(notifier.schedule(notice()))
        assertTrue(notifier.pendingIds().isEmpty())
    }

    @Test fun theSameIdReplacesWhatWasPlannedAndAPastMomentIsRefused() {
        notifier.permission = LocalNotifier.Permission.ALLOWED
        assertTrue(notifier.schedule(notice(inMs = hour)))
        assertTrue(notifier.schedule(notice(inMs = 3 * hour)))
        assertEquals(1, notifier.pendingIds().size)
        assertEquals(clock + 3 * hour, notifier.notice("v18.reminder.3fa85f64")?.fireAtEpochMs)
        assertFalse("never in the past", notifier.schedule(notice(id = "v18.reminder.late", inMs = -1)))
        assertFalse(notifier.schedule(notice(id = "v18.reminder.now", inMs = 0)))
        assertFalse("an id the phone could not hand back", notifier.schedule(notice(id = "has space")))
        assertFalse("an unknown channel", notifier.schedule(notice(id = "v18.x", channel = "marketing")))
        assertFalse("a notice says something", notifier.schedule(notice(id = "v18.y").copy(body = " ")))
        assertEquals(setOf("v18.reminder.3fa85f64"), notifier.pendingIds())
    }

    @Test fun whatIsListedIsWhatThePhoneWillDeliver() {
        notifier.permission = LocalNotifier.Permission.ALLOWED
        notifier.schedule(notice(id = "v18.follow.asset", inMs = hour, channel = LocalNotice.CHANNEL_FOLLOW_UPS, payload = mapOf(LocalNotice.KIND to "follow-up", LocalNotice.OWNER to "local")))
        notifier.schedule(notice(id = "v18.follow.sector", inMs = 25 * hour, channel = LocalNotice.CHANNEL_FOLLOW_UPS))
        notifier.schedule(notice(id = "v18.reminder.a", inMs = 2 * hour))
        notifier.cancel(listOf("v18.reminder.a", "never-planned"))
        assertEquals(setOf("v18.follow.asset", "v18.follow.sector"), notifier.pendingIds())
        assertTrue("nothing is shown before its moment", notifier.deliverDue().isEmpty())
        clock += hour
        assertEquals(listOf("v18.follow.asset"), notifier.deliverDue().map { it.id })
        assertEquals("a shown notice is no longer pending", setOf("v18.follow.sector"), notifier.pendingIds())
        assertEquals("local", notifier.delivered.single().payload[LocalNotice.OWNER])
        notifier.clearDelivered(listOf("v18.follow.asset"))
        assertTrue(notifier.delivered.isEmpty())
        notifier.permission = LocalNotifier.Permission.DENIED
        clock += 24 * hour
        assertTrue("switched off in the system: its moment passes without a line", notifier.deliverDue().isEmpty())
        assertTrue("and it is not pending any more either", notifier.pendingIds().isEmpty())
        assertNull(notifier.notice("v18.follow.sector"))
    }

    @Test fun aNoticeCarriesASmallPayloadOfStrings() {
        assertTrue(LocalNotice.valid(notice()))
        assertEquals("thesis-reminders", LocalNotice.CHANNEL_THESIS_REMINDERS)
        assertEquals("follow-ups", LocalNotice.CHANNEL_FOLLOW_UPS)
        assertEquals("kind", LocalNotice.KIND)
        assertEquals("owner", LocalNotice.OWNER)
        assertFalse(LocalNotice.valid(notice(payload = (0..LocalNotice.PAYLOAD_LIMIT).associate { "k$it" to "v" })))
        assertFalse(LocalNotice.valid(notice(payload = mapOf("k" to "x".repeat(LocalNotice.VALUE_LIMIT + 1)))))
        assertFalse(LocalNotice.valid(notice(payload = mapOf("" to "v"))))
        assertFalse(LocalNotice.valid(notice(id = "")))
        assertTrue(LocalNotice.valid(notice(id = "v18.follow.week:2026-W41")))
    }
}
