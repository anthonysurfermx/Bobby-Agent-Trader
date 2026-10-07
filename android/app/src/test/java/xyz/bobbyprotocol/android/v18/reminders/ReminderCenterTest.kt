package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import java.time.ZoneId
import java.util.UUID

/**
 * Thesis reminders (1.8): planned on the phone, one per thesis and each its own notice at the time
 * the person chose, permission asked only when the person taps a reminder button, and gone with the
 * thesis, the account or the consent. The cases of ios/Bobby/Tests/ReminderCenterTests.swift, then
 * what only Android has (a late notice, the reader a notice is planned for, the host's hooks).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReminderCenterTest {
    private val zone = ZoneId.of("America/Mexico_City")
    private val store = MemoryKeyValueStore()
    private val book = ThesisBook(store)
    private var clock = at(2026, 10, 7, 12)
    private val fake = FakeReminderNotifier { clock }
    private var language = "en"
    private var consent = RiskNotice.ACCEPTED
    private var user: String? = "u1"
    private var epoch = 1L

    // Helpers

    private fun at(y: Int, mo: Int, d: Int, h: Int = 0, mi: Int = 0): Long = Wall.at(zone, y, mo, d, h, mi)

    private fun center(): ReminderCenter = ReminderCenter(fake, store).also { c ->
        c.now = { clock }
        c.zone = { zone }
        c.body = { ReminderCopy(TestWords.of(language)).notificationBody }
        c.consent = { consent }
        c.currentUser = { user }
        c.currentEpoch = { epoch }
        c.activeTheses = { owner -> book.active(owner) }
        c.readerTag = { V18Reader.tag(user) }
    }

    private fun draft(symbol: String, name: String = symbol) = ThesisDraft(
        symbol = symbol, name = name, isEquity = true, horizon = ThesisHorizon.MONTHS,
        hypothesis = "Margins on $symbol should recover as supply eases",
    )

    private fun thesis(symbol: String, name: String = symbol, owner: String? = "u1"): SavedThesis = book.create(draft(symbol, name), owner, clock)

    private fun id(thesis: SavedThesis): String = ReminderCenter.identifier(thesis.id)

    private fun scheduled(fireAt: Long): ReminderCenter.Outcome = ReminderCenter.Outcome.Scheduled(fireAt)

    // Scheduling

    @Test fun aPresetSchedulesOneGenericNotificationAtEighteenLocal() = runTest {
        val nvda = thesis("NVDA", name = "NVIDIA")
        val c = center()
        val outcome = c.schedule(nvda.id, nvda.symbol, ReminderPreset.WEEK)
        assertEquals(scheduled(at(2026, 10, 14, 18)), outcome)
        assertEquals(listOf(PendingReminder(nvda.id, "NVDA", at(2026, 10, 14, 18))), c.pending)
        assertEquals(LocalNotifier.Permission.ALLOWED, c.status)
        assertEquals(1, fake.requests.size)
        val notice = fake.requests["v18.thesis.${nvda.id}"]!!
        assertEquals(ReminderCenter.identifier(nvda.id), notice.id)
        assertEquals("Bobby", notice.title)
        assertEquals("Your reminder to review a thesis.", notice.body)
        assertEquals(at(2026, 10, 14, 18), notice.fireAtEpochMs)
        assertEquals(LocalNotice.CHANNEL_THESIS_REMINDERS, notice.channel)
        assertEquals("thesis-review", notice.payload["kind"])
        assertEquals(nvda.id, notice.payload["thesisId"])
        assertEquals("the reader it was planned for, as a tag and never the account id", V18Reader.tag("u1"), notice.payload["owner"])
        assertEquals("nothing else travels with the notice", setOf("kind", "thesisId", "owner"), notice.payload.keys)
        assertEquals("the person's own time zone", listOf(2026, 10, 14, 18, 0, 0), Wall.parts(notice.fireAtEpochMs, zone))
        assertTrue("a notice the phone can keep and hand back", LocalNotice.valid(notice))
        assertEquals("the thesis id is lowercase, as the book writes it", nvda.id.lowercase(), nvda.id)
    }

    @Test fun thereIsOnePendingReminderPerThesisAndChangingItMovesIt() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        val moved = c.schedule(nvda.id, "NVDA", at(2026, 11, 2, 9, 30))
        assertEquals(scheduled(at(2026, 11, 2, 9, 30)), moved)
        assertEquals(1, c.pending.size)
        assertEquals(at(2026, 11, 2, 9, 30), c.reminder(nvda.id)?.fireAtMillis)
        assertEquals("the phone holds one notice for the thesis", 1, fake.requests.size)
        assertEquals(at(2026, 11, 2, 9, 30), fake.requests[id(nvda)]?.fireAtEpochMs)
    }

    @Test fun aPickedTimeThatPassedIsNeverScheduledInThePast() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        clock = at(2026, 10, 7, 19)
        val outcome = c.schedule(nvda.id, "NVDA", at(2026, 10, 7, 18))
        assertEquals("18:00 already passed today: tomorrow", scheduled(at(2026, 10, 8, 18)), outcome)
        assertTrue(fake.requests.values.first().fireAtEpochMs > clock)
    }

    @Test fun twoRemindersOnTheSameDayAreTwoNotificationsAtTheirOwnTimes() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val spy = thesis("SPY")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        val morning = c.schedule(btc.id, "BTC", at(2026, 10, 14, 9))
        assertEquals("the time the person picked, whatever another thesis has that day", scheduled(at(2026, 10, 14, 9)), morning)
        // The same preset twice lands on the same minute: still one notice each.
        val evening = c.schedule(spy.id, "SPY", ReminderPreset.WEEK)
        assertEquals(scheduled(at(2026, 10, 14, 18)), evening)
        assertEquals(listOf(nvda.id, btc.id, spy.id), c.pending.map { it.thesisId })
        assertEquals(listOf(at(2026, 10, 14, 18), at(2026, 10, 14, 9), at(2026, 10, 14, 18)), c.pending.map { it.fireAtMillis })
        assertEquals("one notice per thesis, nothing merged", setOf(id(nvda), id(btc), id(spy)), fake.requests.keys)
        for ((thesis, fireAt) in listOf(nvda to at(2026, 10, 14, 18), btc to at(2026, 10, 14, 9), spy to at(2026, 10, 14, 18))) {
            val notice = fake.requests[id(thesis)]!!
            assertEquals(thesis.symbol, fireAt, notice.fireAtEpochMs)
            assertEquals("each carries its own thesis", thesis.id, notice.payload[ReminderCenter.THESIS_ID])
            assertEquals(thesis.symbol, setOf("kind", "thesisId", "owner"), notice.payload.keys)
            assertEquals("a tap opens that thesis's review", ReminderTap(thesis.id), ReminderIntent.tap(notice.payload))
        }

        // Removing one leaves the others exactly as they were.
        fake.forgetHistory()
        c.cancel(nvda.id)
        assertEquals(listOf(btc.id, spy.id), c.pending.map { it.thesisId })
        assertEquals(listOf(id(nvda)), fake.removed)
        assertTrue("the others are not written again", fake.added.isEmpty())
        assertEquals(at(2026, 10, 14, 9), fake.requests[id(btc)]?.fireAtEpochMs)
        assertEquals(at(2026, 10, 14, 18), fake.requests[id(spy)]?.fireAtEpochMs)

        c.cancel(btc.id)
        c.cancel(spy.id)
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.requests.isEmpty())
        assertNull("nothing is kept once nothing is pending", store.getString(ReminderCenter.STORE_KEY))
    }

    @Test fun aReminderCanMoveOntoADayAnotherThesisAlreadyHas() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", at(2026, 10, 14, 18))
        c.schedule(btc.id, "BTC", at(2026, 10, 14, 9))
        // "Change": NVDA to 20:00 the same day BTC is set for.
        val moved = c.schedule(nvda.id, "NVDA", at(2026, 10, 14, 20))
        assertEquals(scheduled(at(2026, 10, 14, 20)), moved)
        assertEquals(at(2026, 10, 14, 20), c.reminder(nvda.id)?.fireAtMillis)
        assertEquals("the other thesis keeps its own time", at(2026, 10, 14, 9), c.reminder(btc.id)?.fireAtMillis)
        assertEquals(2, fake.requests.size)
        assertEquals(at(2026, 10, 14, 20), fake.requests[id(nvda)]?.fireAtEpochMs)
        assertEquals(at(2026, 10, 14, 9), fake.requests[id(btc)]?.fireAtEpochMs)
        // And away again.
        c.schedule(nvda.id, "NVDA", ReminderPreset.MONTH)
        assertEquals(at(2026, 11, 7, 18), fake.requests[id(nvda)]?.fireAtEpochMs)
        assertEquals(at(2026, 10, 14, 9), fake.requests[id(btc)]?.fireAtEpochMs)
    }

    // Permission

    @Test fun permissionIsAskedOnlyWhenThePersonSchedulesAndOnlyOnce() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.refresh()
        c.reconcile()
        c.cancel(nvda.id)
        assertTrue(c.pending.isEmpty())
        assertFalse(c.hasReminder(nvda.id))
        assertEquals("reading, housekeeping and removing never ask", 0, fake.permissionRequests)
        assertEquals(LocalNotifier.Permission.NOT_DETERMINED, c.status)

        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals("the reminder button is the moment the phone asks", 1, fake.permissionRequests)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        c.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        c.refresh()
        assertEquals("the phone already answered", 1, fake.permissionRequests)
    }

    @Test fun startingTheCentreNeverAsks() = runTest {
        val bench = V18TestBench(backgroundScope)
        val nvda = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        ReminderCenter.of(bench.host)
        runCurrent()
        bench.host.theses.archive(nvda.id, null, bench.clock)
        bench.host.appBecameActive()
        runCurrent()
        assertEquals(0, bench.notifier.asked)
        assertEquals(0, bench.shell.permissionRequests)
        assertTrue(bench.notifier.scheduled.isEmpty())
    }

    @Test fun aRefusalAtThePromptSchedulesNothing() = runTest {
        val nvda = thesis("NVDA")
        fake.grantsWhenAsked = false
        val c = center()
        val outcome = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals(ReminderCenter.Outcome.Denied, outcome)
        assertEquals(LocalNotifier.Permission.DENIED, c.status)
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.added.isEmpty())
        assertNull(store.getString(ReminderCenter.STORE_KEY))
    }

    @Test fun notificationsTurnedOffInSettingsScheduleNothingAndNeverAskAgain() = runTest {
        val nvda = thesis("NVDA")
        fake.permission = LocalNotifier.Permission.DENIED
        val c = center()
        val outcome = c.schedule(nvda.id, "NVDA", at(2026, 10, 20, 18))
        assertEquals(ReminderCenter.Outcome.Denied, outcome)
        assertEquals("the phone shows its question once; after a no the screen points at Settings", 0, fake.permissionRequests)
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.added.isEmpty())
        // Allowed later in Settings: the same button works.
        fake.permission = LocalNotifier.Permission.ALLOWED
        val later = c.schedule(nvda.id, "NVDA", at(2026, 10, 20, 18))
        assertEquals(scheduled(at(2026, 10, 20, 18)), later)
        assertEquals(0, fake.permissionRequests)
    }

    @Test fun nothingIsScheduledOrAskedBeforeTheRiskNotice() = runTest {
        val nvda = thesis("NVDA")
        consent = RiskNotice.WITHDRAWN
        val c = center()
        val outcome = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals(ReminderCenter.Outcome.ConsentRequired, outcome)
        consent = RiskNotice.OUTDATED
        val afterAnUpdate = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals("a newer notice is read first", ReminderCenter.Outcome.ConsentRequired, afterAnUpdate)
        assertEquals(0, fake.permissionRequests)
        assertTrue(fake.added.isEmpty())
        assertTrue(c.pending.isEmpty())
        // A centre nobody wired to a host plans nothing either.
        assertEquals(ReminderCenter.Outcome.ConsentRequired, ReminderCenter(fake, store).schedule(nvda.id, "NVDA", ReminderPreset.WEEK))
    }

    @Test fun onlyAnActiveThesisOfThisReaderCanHaveAReminder() = runTest {
        val nvda = thesis("NVDA")
        val foreign = thesis("BTC", owner = "someone-else")
        val c = center()
        val unknown = c.schedule(UUID.randomUUID().toString(), "ETH", ReminderPreset.WEEK)
        assertEquals(ReminderCenter.Outcome.UnknownThesis, unknown)
        val others = c.schedule(foreign.id, "BTC", ReminderPreset.WEEK)
        assertEquals(ReminderCenter.Outcome.UnknownThesis, others)
        book.archive(nvda.id, "u1", clock)
        val archived = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals(ReminderCenter.Outcome.UnknownThesis, archived)
        assertEquals("nothing to remind about: the phone is not asked", 0, fake.permissionRequests)
        assertTrue(fake.added.isEmpty())
    }

    @Test fun anAccountSwitchWhileThePhoneIsAskingDropsTheAnswer() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        fake.whileAsking = {
            user = "u2"
            epoch += 1
        }
        val outcome = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals(ReminderCenter.Outcome.Failed, outcome)
        assertTrue("the previous reader's tap never schedules for the next one", c.pending.isEmpty())
        assertTrue(fake.added.isEmpty())
        assertTrue("and the row is no longer busy", c.scheduling.isEmpty())
    }

    @Test fun aRequestThePhoneRefusesIsNotListedAsPending() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        fake.addSucceeds = false
        val outcome = c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        assertEquals(ReminderCenter.Outcome.Failed, outcome)
        assertEquals("what is listed is what the phone will deliver", listOf(nvda.id), c.pending.map { it.thesisId })
        assertEquals(setOf(id(nvda)), fake.requests.keys)
    }

    @Test fun aMoveThePhoneRefusesLeavesTheReminderWhereItWas() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        fake.refusedIds = setOf(id(nvda))
        val outcome = c.schedule(nvda.id, "NVDA", at(2026, 10, 20, 9))
        assertEquals(ReminderCenter.Outcome.Failed, outcome)
        assertEquals(
            "the list, and its order, as before the move",
            listOf(PendingReminder(nvda.id, "NVDA", at(2026, 10, 14, 18)), PendingReminder(btc.id, "BTC", at(2026, 11, 7, 18))), c.pending,
        )
        assertEquals("the phone still holds the old one", at(2026, 10, 14, 18), fake.requests[id(nvda)]?.fireAtEpochMs)
    }

    @Test fun aRefusedRequestNeverTakesAnotherThesisReminderWithIt() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        fake.refusedIds = setOf(id(nvda))
        // While the phone is still asking for NVDA, the person sets BTC (another row of the same screen).
        var second: ReminderCenter.Outcome? = null
        fake.whileAsking = {
            fake.whileAsking = null
            second = c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
            assertTrue("BTC was listed while NVDA's request was still out", c.hasReminder(btc.id))
        }
        val first = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertEquals("the phone refused NVDA's", ReminderCenter.Outcome.Failed, first)
        assertEquals("BTC's own request went through", scheduled(at(2026, 11, 7, 18)), second)
        assertEquals("undoing NVDA's undoes only NVDA's", listOf(PendingReminder(btc.id, "BTC", at(2026, 11, 7, 18))), c.pending)
        assertEquals(setOf(id(btc)), fake.requests.keys)
    }

    // The lock screen

    @Test fun theLockScreenTextNamesNoAssetInSixLanguages() = runTest {
        val nvda = thesis("NVDA", name = "NVIDIA")
        val bodies = LinkedHashMap<String, String>()
        for (code in TestWords.languages) {
            language = code
            val c = center()
            val outcome = c.schedule(nvda.id, "NVDA", at(2026, 10, 20, 18))
            assertEquals(code, scheduled(at(2026, 10, 20, 18)), outcome)
            val notice = fake.requests[id(nvda)]!!
            assertEquals(code, "Bobby", notice.title)
            assertEquals(code, ReminderCopy(TestWords.of(code)).notificationBody, notice.body)
            for (forbidden in listOf("NVDA", "NVIDIA", "Margins", nvda.id)) {
                assertFalse("$code: $forbidden", notice.body.contains(forbidden, ignoreCase = true))
                assertFalse("$code: $forbidden", notice.title.contains(forbidden, ignoreCase = true))
            }
            assertFalse("$code: no figure on the lock screen", notice.body.any { it.isDigit() })
            assertFalse("$code: no unfilled placeholder", notice.body.contains("{"))
            assertFalse(code, notice.body.contains("!"))
            bodies[code] = notice.body
            c.cancel(nvda.id)
        }
        assertEquals("each language has its own sentence", 6, bodies.values.toSet().size)
        assertEquals("Tu recordatorio para revisar una tesis.", bodies["es"])
        assertTrue(bodies["fr"]!!.contains("thèse"))
        assertTrue(bodies["de"]!!.contains("These"))
        assertEquals("an unknown language falls back to English", bodies["en"], ReminderCopy(TestWords.of("xx")).notificationBody)
    }

    // Housekeeping

    @Test fun archivingOrDeletingAThesisCancelsItsReminder() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val theses = bench.host.theses
        val nvda = theses.create(draft("NVDA"), "u1", bench.clock)
        val btc = theses.create(draft("BTC"), "u1", bench.clock)
        val spy = theses.create(draft("SPY"), "u1", bench.clock)
        val c = ReminderCenter.of(bench.host)
        runCurrent()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        c.schedule(spy.id, "SPY", ReminderPreset.THREE_DAYS)
        assertEquals(3, bench.notifier.pendingIds().size)
        theses.archive(nvda.id, "u1", bench.clock)
        assertEquals(listOf(btc.id, spy.id), c.pending.map { it.thesisId })
        assertNull(bench.notifier.notice(id(nvda)))
        theses.delete(btc.id, "u1")
        assertEquals(listOf(spy.id), c.pending.map { it.thesisId })
        assertEquals(setOf(id(spy)), bench.notifier.pendingIds())
        theses.deleteAll("u1")
        assertTrue("\"Delete everything\" takes the reminders with the theses", c.pending.isEmpty())
        assertTrue(bench.notifier.pendingIds().isEmpty())
    }

    @Test fun anotherAccountOrNoAccountCancelsEveryReminder() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        assertEquals(2, fake.requests.size)
        // Signed out (or the account was deleted): the local book has none of these theses.
        user = null
        epoch += 1
        c.reconcile()
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.requests.isEmpty())
        assertNull(store.getString(ReminderCenter.STORE_KEY))

        user = "u1"
        epoch += 1
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        thesis("ETH", owner = "u2")
        user = "u2"
        epoch += 1
        c.reconcile()
        assertTrue("they pointed at the previous account's theses", c.pending.isEmpty())
        assertTrue(fake.requests.isEmpty())
    }

    @Test fun thesesThatFollowAPersonIntoTheirNewAccountKeepTheirReminders() = runTest {
        user = null
        val local = thesis("NVDA", owner = null)
        val c = center()
        c.schedule(local.id, "NVDA", ReminderPreset.WEEK)
        assertEquals("reminders need no account", 1, c.pending.size)
        assertEquals("local", fake.requests[id(local)]?.payload?.get(LocalNotice.OWNER))
        // The person creates their account and keeps their theses: they move into it, same id.
        assertEquals(1, book.adoptLocal("new-user"))
        user = "new-user"
        epoch += 1
        c.reconcile()
        assertEquals(listOf(local.id), c.pending.map { it.thesisId })
        assertEquals(setOf(id(local)), fake.requests.keys)
        assertEquals("and the phone will show it to the reader they are now", V18Reader.tag("new-user"), fake.requests[id(local)]?.payload?.get(LocalNotice.OWNER))
        assertEquals(at(2026, 10, 14, 18), fake.requests[id(local)]?.fireAtEpochMs)
    }

    @Test fun withdrawingConsentCancelsEveryReminder() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        consent = RiskNotice.WITHDRAWN
        c.reconcile()
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.requests.isEmpty())
        assertTrue(fake.removed.contains(id(nvda)))
        // Accepting again does not bring them back: the person sets a new one.
        consent = RiskNotice.ACCEPTED
        c.refresh()
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.requests.isEmpty())
    }

    @Test fun theCentreNoticesAWithdrawnConsentByItself() = runTest {
        val bench = V18TestBench(backgroundScope)
        val nvda = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        val c = ReminderCenter.of(bench.host)
        runCurrent()
        assertTrue(c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK) is ReminderCenter.Outcome.Scheduled)
        assertEquals(1, bench.notifier.pendingIds().size)
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        bench.host.consentWithdrawn()
        assertTrue(c.pending.isEmpty())
        assertTrue(bench.notifier.pendingIds().isEmpty())
        assertNull(bench.store.getString(ReminderCenter.STORE_KEY))
    }

    @Test fun aNewerRiskNoticeKeepsWhatThePersonSetAndOnlyHoldsNewReminders() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val first = center()
        first.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        // An app update raises the notice's version: the first launch reads an acceptance that is
        // older than the current notice. The person withdrew nothing.
        consent = RiskNotice.OUTDATED
        fake.forgetHistory()
        val c = center()
        book.addListener { c.reconcile() }
        c.refresh()
        c.reconcile()
        assertEquals("the reminder is still listed", listOf(PendingReminder(nvda.id, "NVDA", at(2026, 10, 14, 18))), c.pending)
        assertEquals("and the phone still holds it", setOf(id(nvda)), fake.requests.keys)
        assertTrue(fake.removed.isEmpty())
        val held = c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        assertEquals("nothing new until the notice is read", ReminderCenter.Outcome.ConsentRequired, held)
        assertEquals(1, c.pending.size)
        // The thesis it belongs to still decides: archiving it removes the reminder as always.
        book.archive(nvda.id, "u1", clock)
        assertTrue(c.pending.isEmpty())
        assertTrue(fake.requests.isEmpty())
        // Read and accepted: the button works again.
        consent = RiskNotice.ACCEPTED
        val after = c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        assertEquals(scheduled(at(2026, 11, 7, 18)), after)
    }

    @Test fun aDeliveredReminderIsNoLongerPending() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        clock = at(2026, 10, 10, 18, 1)
        fake.deliver(id(nvda))
        fake.forgetHistory()
        c.refresh()
        assertEquals(listOf(btc.id), c.pending.map { it.thesisId })
        assertFalse(c.hasReminder(nvda.id))
        assertTrue("a delivered reminder is never written again", fake.added.isEmpty())
    }

    @Test fun aMomentThatPassedIsNeverHandedToThePhone() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        clock = at(2026, 10, 10, 18, 0) + 5_000L
        fake.deliver(id(nvda)) // delivered; the list has not been read yet
        fake.forgetHistory()
        c.cancel(btc.id)
        assertTrue("removing another reminder never writes the delivered one again", fake.added.isEmpty())
        assertTrue(fake.requests.isEmpty())
    }

    @Test fun remindersSurviveARelaunchWithoutAsking() = runTest {
        val nvda = thesis("NVDA")
        val first = center()
        first.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        fake.forgetHistory()
        val relaunched = center()
        assertEquals(listOf(PendingReminder(nvda.id, "NVDA", at(2026, 10, 14, 18))), relaunched.pending)
        relaunched.refresh()
        assertEquals("only the first tap asked", 1, fake.permissionRequests)
        assertEquals(setOf(id(nvda)), fake.requests.keys)
        assertEquals(at(2026, 10, 14, 18), fake.requests[id(nvda)]?.fireAtEpochMs)
    }

    @Test fun aRequestInItsLastSecondsIsLeftAlone() = runTest {
        val nvda = thesis("NVDA")
        val first = center()
        first.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        // The app is opened two seconds before the reminder fires: what the phone holds is not touched.
        clock = at(2026, 10, 10, 17, 59) + 58_000L
        fake.forgetHistory()
        val relaunched = center()
        relaunched.refresh()
        assertTrue("the notice the phone holds is not replaced", fake.added.isEmpty())
        assertTrue("and not removed: it is about to fire", fake.removed.isEmpty())
        assertEquals(at(2026, 10, 10, 18), fake.requests[id(nvda)]?.fireAtEpochMs)
        assertEquals(listOf(nvda.id), relaunched.pending.map { it.thesisId })
        // With time to spare a relaunch does bring the phone in line (same id: it replaces).
        clock = at(2026, 10, 10, 17, 59)
        val earlier = center()
        earlier.refresh()
        assertEquals(listOf(id(nvda)), fake.added.map { it.id })
    }

    @Test fun aRequestThePhoneLostIsWrittenAgainOnlyWhileAllowed() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        // The app's list survived and the phone's planned work did not.
        fake.deliver(id(nvda))
        fake.permission = LocalNotifier.Permission.DENIED
        fake.forgetHistory()
        c.refresh()
        assertTrue("notifications are off: nothing is written, the screen says why", fake.added.isEmpty())
        assertEquals(LocalNotifier.Permission.DENIED, c.status)
        assertEquals(1, c.pending.size)
        fake.permission = LocalNotifier.Permission.ALLOWED
        c.refresh()
        assertEquals(setOf(id(nvda)), fake.requests.keys)
        assertEquals(1, fake.permissionRequests)
    }

    @Test fun aNotificationOfAnotherKindIsNeverTouched() = runTest {
        val nvda = thesis("NVDA")
        val foreign = LocalNotice("brief-123", "Bobby", "x", at(2026, 10, 9, 8), LocalNotice.CHANNEL_FOLLOW_UPS, mapOf(LocalNotice.KIND to "follow-up"))
        fake.permission = LocalNotifier.Permission.ALLOWED
        assertTrue(fake.schedule(foreign))
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        c.cancel(nvda.id)
        c.refresh()
        assertEquals("only notices under v18.thesis. belong to reminders", setOf("brief-123"), fake.requests.keys)
    }

    // The plan

    @Test fun thePlanIsOneNotificationPerReminderUnderItsOwnThesis() {
        val a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        val b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        val d = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
        val plan = ReminderCenter.plan(
            listOf(
                PendingReminder(a, "NVDA", at(2026, 10, 14, 18)),
                PendingReminder(d, "SPY", at(2026, 10, 15, 0, 5)),
                PendingReminder(b, "BTC", at(2026, 10, 14, 18)),
            ),
            "Your reminder to review a thesis.", "local",
        )
        assertEquals("the id as the book stores it", listOf("v18.thesis.$a", "v18.thesis.$d", "v18.thesis.$b"), plan.map { it.id })
        assertEquals(listOf(a, d, b), plan.map { it.payload[ReminderCenter.THESIS_ID] })
        assertEquals("two on the same minute stay two", listOf(at(2026, 10, 14, 18), at(2026, 10, 15, 0, 5), at(2026, 10, 14, 18)), plan.map { it.fireAtEpochMs })
        for (notice in plan) {
            assertEquals(setOf("kind", "thesisId", "owner"), notice.payload.keys)
            assertEquals(ReminderCenter.KIND, notice.payload[LocalNotice.KIND])
            assertEquals(LocalNotice.CHANNEL_THESIS_REMINDERS, notice.channel)
            assertTrue(LocalNotice.valid(notice))
        }
        assertTrue(ReminderCenter.plan(emptyList(), "x", "local").isEmpty())
    }

    // Only on Android

    @Test fun aLateReminderThePhoneStillHoldsStaysListedAndIsNeverCancelled() = runTest {
        val nvda = thesis("NVDA")
        val btc = thesis("BTC")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        c.schedule(btc.id, "BTC", ReminderPreset.MONTH)
        // The phone was idle and is holding the notice back: ten minutes late, the app is opened.
        clock = at(2026, 10, 10, 18, 10)
        fake.forgetHistory()
        c.refresh()
        assertEquals("it is late, not lost: still listed", listOf(nvda.id, btc.id), c.pending.map { it.thesisId })
        assertTrue("and never cancelled for being late", fake.removed.isEmpty())
        assertTrue("nor written again: its moment has passed", fake.added.isEmpty())
        assertEquals(setOf(id(nvda), id(btc)), fake.requests.keys)
        // Setting or removing another one leaves it where it is.
        c.schedule(btc.id, "BTC", ReminderPreset.WEEK)
        assertTrue(c.hasReminder(nvda.id))
        assertTrue(fake.requests.containsKey(id(nvda)))
        // Its thesis still decides: archived, it is cancelled like any other.
        book.addListener { c.reconcile() }
        book.archive(nvda.id, "u1", clock)
        assertFalse(c.hasReminder(nvda.id))
        assertFalse(fake.requests.containsKey(id(nvda)))
    }

    @Test fun onceTheLateOneIsShownItLeavesTheList() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS)
        clock = at(2026, 10, 10, 18, 10)
        c.refresh()
        assertTrue(c.hasReminder(nvda.id))
        fake.deliver(id(nvda))
        c.refresh()
        assertTrue(c.pending.isEmpty())
        assertNull(store.getString(ReminderCenter.STORE_KEY))
    }

    @Test fun aLanguageChangeRewritesWhatThePhoneWillShow() = runTest {
        val nvda = thesis("NVDA")
        val c = center()
        c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        fake.forgetHistory()
        c.refresh()
        assertTrue("nothing changed: nothing is written", fake.added.isEmpty())
        language = "es"
        c.refresh()
        assertEquals("Tu recordatorio para revisar una tesis.", fake.requests[id(nvda)]?.body)
        assertEquals("the same notice, replaced", 1, fake.requests.size)
        assertEquals(at(2026, 10, 14, 18), fake.requests[id(nvda)]?.fireAtEpochMs)
    }

    @Test fun aListThatCannotBeReadIsAnEmptyList() = runTest {
        store.putString(ReminderCenter.STORE_KEY, "not json")
        assertTrue(center().pending.isEmpty())
        store.putString(ReminderCenter.STORE_KEY, """[{"thesisId":null,"symbol":"NVDA","fireAt":1},{"symbol":"BTC"},7,{"thesisId":"t1","symbol":"SPY","fireAt":1800000000000}]""")
        assertEquals("rows that are not whole are dropped, never guessed", listOf(PendingReminder("t1", "SPY", 1_800_000_000_000L)), center().pending)
    }

    @Test fun theCentreKeepsItselfTrueThroughTheHost() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val theses = bench.host.theses
        val nvda = theses.create(draft("NVDA"), "u1", bench.clock)
        val c = ReminderCenter.of(bench.host)
        assertTrue("one centre per host", c === ReminderCenter.of(bench.host))
        runCurrent()
        assertEquals("starting reads the permission and never asks", LocalNotifier.Permission.NOT_DETERMINED, c.status)
        val outcome = c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK)
        assertTrue(outcome is ReminderCenter.Outcome.Scheduled)
        assertEquals(1, bench.notifier.asked)
        val notice = bench.notifier.notice(id(nvda))!!
        assertEquals(V18Reader.tag("u1"), notice.payload[LocalNotice.OWNER])
        assertEquals("Your reminder to review a thesis.", notice.body)

        // Notifications switched off in Settings while the app was away: coming back reads it.
        bench.notifier.permission = LocalNotifier.Permission.DENIED
        bench.host.appBecameActive()
        assertEquals(LocalNotifier.Permission.DENIED, c.status)
        assertEquals("what was set stays listed", 1, c.pending.size)
        bench.notifier.permission = LocalNotifier.Permission.ALLOWED
        bench.host.appBecameActive()
        assertEquals(LocalNotifier.Permission.ALLOWED, c.status)

        // Another reader takes the phone: a turn later nothing of the previous one's is planned.
        bench.changeAccount("u2")
        runCurrent()
        assertTrue(c.pending.isEmpty())
        assertTrue(bench.notifier.pendingIds().isEmpty())

        // Back, with a reminder, and the account is deleted: its theses go and its reminders with them.
        bench.changeAccount("u1")
        runCurrent()
        assertTrue(c.schedule(nvda.id, "NVDA", ReminderPreset.MONTH) is ReminderCenter.Outcome.Scheduled)
        bench.host.accountDeleted("u1")
        assertTrue(c.pending.isEmpty())
        assertTrue(bench.notifier.pendingIds().isEmpty())
        assertNull(bench.store.getString(ReminderCenter.STORE_KEY))
        assertEquals("none of it ever asked again", 1, bench.notifier.asked)
    }

    @Test fun deleteEverythingInMemoryTakesTheRemindersToo() = runTest {
        val bench = V18TestBench(backgroundScope)
        val nvda = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        val c = ReminderCenter.of(bench.host)
        runCurrent()
        assertTrue(c.schedule(nvda.id, "NVDA", ReminderPreset.WEEK) is ReminderCenter.Outcome.Scheduled)
        bench.host.theses.deleteAll(null)
        bench.host.eraseEverything()
        assertTrue(c.pending.isEmpty())
        assertTrue(bench.notifier.pendingIds().isEmpty())
    }
}
