package xyz.bobbyprotocol.android.v18

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.FakeCreditsBackend
import xyz.bobbyprotocol.android.v18.credits.at
import xyz.bobbyprotocol.android.v18.harness.HarnessCenter
import xyz.bobbyprotocol.android.v18.harness.HarnessMode
import xyz.bobbyprotocol.android.v18.harness.Harness
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.reminders.ReminderCenter
import xyz.bobbyprotocol.android.v18.reminders.ReminderNudges
import xyz.bobbyprotocol.android.v18.reminders.ReminderPreset
import xyz.bobbyprotocol.android.v18.theses.ThesisEvents
import java.time.ZoneId

/**
 * Where the five features of 1.8 meet. Each has its own suite; these cases are what one of them
 * tells another, and what they all hand the phone, with everything registered the way the app
 * registers it (`V18.registerNudges`) on the real host.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class V18IntegrationTest {
    private val hour = 3_600_000L
    private val idA = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"

    private fun draft(symbol: String) = ThesisDraft(symbol, symbol, true, ThesisHorizon.MONTHS, "Why I am looking at $symbol")

    private fun reminderTap(thesisId: String) = mapOf(LocalNotice.KIND to ReminderCenter.KIND, ReminderCenter.THESIS_ID to thesisId)

    private fun followUpTap(bench: V18TestBench, step: String, symbol: String?, sector: String? = null): Map<String, String> {
        val payload = LinkedHashMap<String, String>()
        payload[LocalNotice.KIND] = HarnessCenter.KIND
        payload["step"] = step
        payload[LocalNotice.OWNER] = bench.host.readerTag
        payload["at"] = (bench.clock - hour).toString()
        if (symbol != null) payload["symbol"] = symbol
        if (sector != null) payload["sector"] = sector
        return payload
    }

    // The theses tell the reminders

    @Test fun aThesisJustWrittenOrADecidedReviewLetsTheReminderOfferSpeak() = runTest {
        val bench = V18TestBench(backgroundScope)
        V18.registerNudges(bench.host)
        runCurrent()
        // Written three hours ago: the book's own date is too old for the offer.
        val thesis = bench.host.theses.create(draft("NVDA"), null, bench.clock - 3 * hour)
        assertNull(ReminderNudges.recent(bench.host).date(thesis.id))
        assertNull("nothing fresh, nothing offered", bench.host.nudgeJson())

        // The person decides to keep it after a review (ThesisReviewer.decide posts this).
        ThesisEvents.of(bench.host).postReviewed(thesis.id, ThesisEvents.KEEP)
        assertEquals("the reminders heard it, at the moment it happened", bench.clock, ReminderNudges.recent(bench.host).date(thesis.id))
        val offer = bench.host.nudgeJson()
        assertEquals(ReminderNudges.offerId(thesis.id), offer?.getString("id"))
        assertEquals("Want a reminder to review it?", offer?.getString("text"))

        // A new thesis saved from the editor (ThesisEditorModel.save posts this).
        val second = bench.host.theses.create(draft("BTC"), null, bench.clock - 5 * hour)
        bench.clock += 60_000L
        ThesisEvents.of(bench.host).postSaved(second.id)
        assertEquals(bench.clock, ReminderNudges.recent(bench.host).date(second.id))
    }

    @Test fun whatAnotherReaderWroteIsNotOfferedToTheNextOne() = runTest {
        val bench = V18TestBench(backgroundScope)
        V18.registerNudges(bench.host)
        runCurrent()
        val thesis = bench.host.theses.create(draft("NVDA"), null, bench.clock - 3 * hour)
        ThesisEvents.of(bench.host).postSaved(thesis.id)
        assertNotNull(ReminderNudges.recent(bench.host).date(thesis.id))
        bench.changeAccount("account-b")
        assertNull("what the previous reader just wrote is not theirs to be reminded of", ReminderNudges.recent(bench.host).date(thesis.id))
    }

    // The profile's Credits row

    @Test fun theProfilesCreditsRowSaysTheBalanceOnlyOnceTheServerHasAnswered() = runTest {
        val utc = ZoneId.of("UTC")
        val bench = V18TestBench(backgroundScope)
        bench.clock = at("2026-10-07T12:00:00Z")
        bench.changeAccount("u1")
        val backend = FakeCreditsBackend()
        val center = CreditsCenter.of(bench.host, backend)
        assertNull("until the server answers the row says what Credits is, never a number", center.summary(utc))
        backend.reply = FakeCreditsBackend.reply(remaining = 7, quick = 3)
        assertTrue(center.load())
        assertEquals("7 of 10 reads · 3 gifted", center.summary(utc))
        bench.desk.language = "es"
        assertEquals("7 de 10 lecturas · 3 de regalo", center.summary(utc))
        bench.desk.language = "en"

        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        assertNull("nothing of the account is said once the notice is withdrawn", center.summary(utc))
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        assertEquals("7 of 10 reads · 3 gifted", center.summary(utc))

        bench.changeAccount("u2")
        assertNull("the balance of whoever was here before is not the next reader's", center.summary(utc))
    }

    // The tap store, with the features listening

    @Test fun aMalformedReminderTapNeverReplacesTheOneThatIsWaiting() = runTest {
        val bench = V18TestBench(backgroundScope)
        V18.registerNudges(bench.host)
        runCurrent()
        val nvda = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        bench.shell.active = false // tapped while the app was still coming to the front
        assertTrue(bench.host.noteTap(reminderTap(nvda.id)))
        assertFalse("a reminder without a thesis id is not kept", bench.host.noteTap(reminderTap("garbage")))
        assertFalse("nor a follow-up that names no step", bench.host.noteTap(mapOf(LocalNotice.KIND to HarnessCenter.KIND)))
        assertFalse("nor something that is not a notice of ours", bench.host.noteTap(mapOf("briefId" to idA)))
        assertFalse("nor a kind no feature has", bench.host.noteTap(mapOf(LocalNotice.KIND to "briefing", ReminderCenter.THESIS_ID to idA)))
        runCurrent()
        bench.shell.active = true
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("the good tap was still there", listOf(V18Routes.THESIS_REVIEW), bench.shell.opened)
        assertEquals(nvda.id, bench.host.focus.takeThesisId())
        assertNull("and it is consumed once", bench.host.takeNotificationTap())
    }

    @Test fun theNewestGoodTapStillWinsAcrossFeatures() = runTest {
        val bench = V18TestBench(backgroundScope)
        V18.registerNudges(bench.host)
        runCurrent()
        val nvda = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        bench.shell.active = false
        assertTrue(bench.host.noteTap(reminderTap(nvda.id)))
        assertTrue("a well-formed follow-up is a good tap too", bench.host.noteTap(followUpTap(bench, "sector", "NVDA", "semis")))
        assertFalse(bench.host.noteTap(followUpTap(bench, "sector", "NVDA", "not-a-sector")))
        runCurrent()
        bench.shell.active = true
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("the last good one opens, and only that one", listOf(V18Routes.FOLLOW_UP), bench.shell.opened)
    }

    // What the features hand the phone

    @Test fun aFollowUpAsksThePhoneForItsHoursAndAReminderDoesNot() = runTest {
        val bench = V18TestBench(backgroundScope)
        V18.registerNudges(bench.host)
        runCurrent()
        // The person says yes to follow-ups from the offer on the glass.
        bench.deliver(symbol = "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, Harness.center(bench.host).accept())
        assertEquals(HarnessMode.ON, Harness.center(bench.host).mode)
        val followUps = bench.notifier.scheduled.filter { it.channel == LocalNotice.CHANNEL_FOLLOW_UPS }
        assertTrue("the chain was handed over", followUps.isNotEmpty())
        for (notice in followUps) {
            assertEquals(notice.id + ": 09:00 to 21:00, never more than a day late", LocalNotice.Delivery.FOLLOW_UP, notice.delivery)
        }
        // And sets a reminder on a thesis.
        val thesis = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        val outcome = ReminderCenter.of(bench.host).schedule(thesis.id, "NVDA", ReminderPreset.WEEK)
        assertTrue(outcome.toString(), outcome is ReminderCenter.Outcome.Scheduled)
        val reminder = bench.notifier.notice(ReminderCenter.identifier(thesis.id))
        assertEquals("their own date: shown whenever the phone gets to it", LocalNotice.Delivery.ANY_TIME, reminder?.delivery)
    }
}
