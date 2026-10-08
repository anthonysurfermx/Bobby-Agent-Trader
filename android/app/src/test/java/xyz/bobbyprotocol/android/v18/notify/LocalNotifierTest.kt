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

    @Test fun aNoticeMayCarryWhatALockedPhoneShowsAndOneButton() {
        notifier.permission = LocalNotifier.Permission.ALLOWED
        val plain = notice(id = "v18.follow.asset", channel = LocalNotice.CHANNEL_FOLLOW_UPS, payload = mapOf(LocalNotice.KIND to "follow-up"))
        assertNull("a notice has neither unless its feature says so", plain.publicBody)
        assertNull(plain.action)
        val whole = plain.copy(publicBody = "Back to your question.", action = LocalNotice.Action("stop", "Stop"))
        assertTrue(notifier.schedule(whole))
        assertEquals("what the phone keeps is what it was handed", whole, notifier.notice("v18.follow.asset"))
        assertFalse("a public version says something", LocalNotice.valid(plain.copy(publicBody = " ")))
        assertFalse("a button has a plain name", LocalNotice.valid(plain.copy(action = LocalNotice.Action("Stop now", "Stop"))))
        assertFalse("and a label", LocalNotice.valid(plain.copy(action = LocalNotice.Action("stop", " "))))
        assertFalse("that fits on a button", LocalNotice.valid(plain.copy(action = LocalNotice.Action("stop", "x".repeat(LocalNotice.ACTION_LABEL_LIMIT + 1)))))
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

    // The rule the phone's own notifier applies (platform/AndroidLocalNotifier.kt reads the three facts).

    @Test fun whereThePersonStandsWithNotificationsIsReadFromThreeFacts() {
        val allowed = LocalNotifier.Permission.ALLOWED
        val denied = LocalNotifier.Permission.DENIED
        val undetermined = LocalNotifier.Permission.NOT_DETERMINED
        assertEquals("never asked on Android 13 or later", undetermined, NoticePermission.status(notificationsOn = false, runtimeGranted = false, asked = false))
        assertEquals("asked, and the person said no", denied, NoticePermission.status(notificationsOn = false, runtimeGranted = false, asked = true))
        assertEquals(allowed, NoticePermission.status(notificationsOn = true, runtimeGranted = true, asked = true))
        assertEquals("granted from the system's settings without Bobby ever asking", allowed, NoticePermission.status(notificationsOn = true, runtimeGranted = true, asked = false))
        assertEquals("the permission is there but Bobby's notifications are switched off in the system (always the case before Android 13)",
                     denied, NoticePermission.status(notificationsOn = false, runtimeGranted = true, asked = false))
        assertEquals(denied, NoticePermission.status(notificationsOn = false, runtimeGranted = true, asked = true))
    }

    /** Android only: one kind of notice (a channel) can be switched off by itself in the system's settings. */
    @Test fun aKindSwitchedOffInTheSystemsSettingsIsANoForThatKindOnly() = runTest {
        val allowed = LocalNotifier.Permission.ALLOWED
        val denied = LocalNotifier.Permission.DENIED
        val undetermined = LocalNotifier.Permission.NOT_DETERMINED
        assertEquals(allowed, NoticePermission.status(notificationsOn = true, runtimeGranted = true, asked = true, channelOff = false))
        assertEquals("the system would discard it unseen", denied, NoticePermission.status(notificationsOn = true, runtimeGranted = true, asked = true, channelOff = true))
        assertEquals("a no that was already a no", denied, NoticePermission.status(notificationsOn = false, runtimeGranted = true, asked = true, channelOff = true))
        assertEquals("never asked is still never asked: the channel says nothing about that", undetermined,
                     NoticePermission.status(notificationsOn = false, runtimeGranted = false, asked = false, channelOff = true))
        // The notifier a feature is handed says it per kind, and counts as shown only what was shown.
        assertTrue(notifier.requestPermission())
        notifier.channelsOff.add(LocalNotice.CHANNEL_FOLLOW_UPS)
        assertEquals(allowed, notifier.status())
        assertEquals(denied, notifier.status(LocalNotice.CHANNEL_FOLLOW_UPS))
        assertEquals(allowed, notifier.status(LocalNotice.CHANNEL_THESIS_REMINDERS))
        val followUp = notice(id = "v18.follow.asset", channel = LocalNotice.CHANNEL_FOLLOW_UPS)
        val reminder = notice(id = "v18.reminder.a", inMs = 2 * hour)
        assertTrue(notifier.schedule(followUp))
        assertTrue(notifier.schedule(reminder))
        clock += 3 * hour
        assertNull("its moment passed with the kind switched off: it was not shown", notifier.shownAt(followUp.id, followUp.fireAtEpochMs))
        assertEquals("the other kind was", reminder.fireAtEpochMs, notifier.shownAt(reminder.id, reminder.fireAtEpochMs))
        assertEquals(listOf("v18.reminder.a"), notifier.deliverDue().map { it.id })
        assertNull(notifier.shownAt(followUp.id, followUp.fireAtEpochMs))
        assertNull("another notice under the same id is another notice", notifier.shownAt(reminder.id, reminder.fireAtEpochMs + 1))
        notifier.cancel(listOf(reminder.id))
        assertNull("cancelling an id forgets what was shown under it", notifier.shownAt(reminder.id, reminder.fireAtEpochMs))
    }

    @Test fun theSystemsQuestionIsOnlyPutWhenItCanStillChangeSomething() {
        assertTrue("never asked, or asked once: the system decides whether it shows", NoticePermission.canAsk(notificationsOn = false, runtimeGranted = false))
        assertFalse("already allowed", NoticePermission.canAsk(notificationsOn = true, runtimeGranted = true))
        assertFalse("switched off in the system's settings: only the settings switch it back on",
                    NoticePermission.canAsk(notificationsOn = false, runtimeGranted = true))
    }
}
