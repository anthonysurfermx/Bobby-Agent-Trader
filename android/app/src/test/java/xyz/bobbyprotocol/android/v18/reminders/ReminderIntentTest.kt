package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.notify.LocalNotice

/**
 * A tapped thesis reminder (1.8): read only from a reminder's own payload, kept by the host, and
 * opened once when the glass is free, with no account needed. The cases of
 * ios/Bobby/Tests/ReminderIntentTests.swift, run against the real host.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReminderIntentTest {
    private val idA = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
    private val idB = "9b2c1a7e-0d3f-4c55-8f1e-2a6b4c8d0e12"
    private val t0 = 1_800_000_000_000L

    // Helpers

    private fun payload(id: String?, kind: String? = "thesis-review", others: String? = null, owner: String? = null): Map<String, String> {
        val info = LinkedHashMap<String, String>()
        if (kind != null) info[LocalNotice.KIND] = kind
        if (id != null) info["thesisId"] = id
        if (others != null) info["thesisIds"] = others
        if (owner != null) info[LocalNotice.OWNER] = owner
        return info
    }

    private fun draft(symbol: String) = ThesisDraft(symbol, symbol, true, ThesisHorizon.MONTHS, "Why I am looking at $symbol")

    private fun thesis(bench: V18TestBench, symbol: String, owner: String? = null): SavedThesis = bench.host.theses.create(draft(symbol), owner, bench.clock)

    /** The app as it starts: reminders registered, the page on the glass. */
    private fun started(bench: V18TestBench): ReminderIntent {
        ReminderNudges.register(bench.host)
        return ReminderIntent.of(bench.host)
    }

    // The payload

    @Test fun onlyAThesisReminderPayloadIsATap() {
        assertEquals(ReminderTap(idA), ReminderIntent.tap(payload(idA)))
        assertEquals("the id as the book writes it", idA, ReminderIntent.tap(payload(idA.uppercase()))?.thesisId)
        assertNull("no kind: not ours", ReminderIntent.tap(payload(idA, kind = null)))
        assertNull(ReminderIntent.tap(payload(idA, kind = "briefing")))
        assertNull(ReminderIntent.tap(payload(idA, kind = "follow-up")))
        assertNull(ReminderIntent.tap(payload(idA, kind = "7")))
        assertNull(ReminderIntent.tap(payload("not-a-uuid")))
        assertNull(ReminderIntent.tap(payload("3F2504E04F8941D39A0C0305E82C3301")))
        assertNull(ReminderIntent.tap(payload("$idA; drop")))
        assertNull(ReminderIntent.tap(payload("42")))
        assertNull(ReminderIntent.tap(payload(" $idA")))
        assertNull(ReminderIntent.tap(payload(null)))
        assertNull(ReminderIntent.tap(emptyMap()))
        // A briefing or a follow-up is never mistaken for a reminder.
        assertNull(ReminderIntent.tap(mapOf("briefId" to "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b")))
        assertNull(ReminderIntent.thesisId(null))
        assertNull(ReminderIntent.thesisId(""))
    }

    @Test fun aTapCarriesOnlyItsOwnThesis() {
        // Whatever else sits in a payload, a tap is about one thesis: the one under "thesisId".
        val tap = ReminderIntent.tap(payload(idA, others = "$idB,garbage,9"))
        assertEquals(ReminderTap(idA), tap)
        assertNull("a list is never read in its place", ReminderIntent.tap(payload(null, others = idB)))
    }

    @Test fun everyNotificationTheCentreWritesIsATapForItsOwnThesis() {
        // Two reminders for the same minute: two notices, each opening its own review.
        val plan = ReminderCenter.plan(listOf(PendingReminder(idA, "NVDA", t0), PendingReminder(idB, "BTC", t0)), "Your reminder to review a thesis.", "local")
        assertEquals(listOf("v18.thesis.$idA", "v18.thesis.$idB"), plan.map { it.id })
        assertEquals(listOf(ReminderTap(idA), ReminderTap(idB)), plan.map { ReminderIntent.tap(it.payload) })
    }

    // The store (the host's)

    @Test fun malformedTapsOpenNothing() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        thesis(bench, "NVDA")
        bench.host.noteTap(payload("not-a-uuid"))
        runCurrent()
        bench.host.noteTap(payload(idA, kind = "briefing"))
        runCurrent()
        assertTrue(bench.shell.opened.isEmpty())
        assertNull(bench.host.focus.thesisId)
        assertFalse(ReminderIntent.of(bench.host).open(bench.host, payload("garbage")))
    }

    @Test fun aTapIsStoredOnceAndConsumedOnce() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        bench.host.noteTap(payload(nvda.id))
        runCurrent()
        assertEquals(listOf(V18Routes.THESIS_REVIEW), bench.shell.opened)
        bench.closeSheet()
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("a tap is never replayed", 1, bench.shell.opened.size)
        assertNull(bench.host.takeNotificationTap())
    }

    @Test fun theNewestTapWins() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        val btc = thesis(bench, "BTC")
        bench.shell.active = false // both tapped while the app was still coming to the front
        bench.host.noteTap(payload(nvda.id))
        bench.host.noteTap(payload(btc.id))
        runCurrent()
        assertTrue(bench.shell.opened.isEmpty())
        bench.shell.active = true
        bench.host.appBecameActive()
        runCurrent()
        assertEquals(listOf(V18Routes.THESIS_REVIEW), bench.shell.opened)
        assertEquals(btc.id, bench.host.focus.takeThesisId())
    }

    @Test fun theNewestTapWinsAndAMalformedOneDoesNotReplaceIt() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        val btc = thesis(bench, "BTC")
        bench.shell.active = false
        assertTrue(bench.host.noteTap(payload(nvda.id)))
        assertTrue(bench.host.noteTap(payload(btc.id)))
        assertFalse("rejected when it is stored, as iOS does", bench.host.noteTap(payload("garbage")))
        runCurrent()
        bench.shell.active = true
        bench.host.appBecameActive()
        runCurrent()
        assertEquals(listOf(V18Routes.THESIS_REVIEW), bench.shell.opened)
        assertEquals(btc.id, bench.host.focus.takeThesisId())
        assertNull(bench.host.takeNotificationTap())
    }

    @Test fun anAccountChangeClearsThePendingTap() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        bench.shell.active = false
        bench.host.noteTap(payload(nvda.id))
        runCurrent()
        bench.changeAccount("u2")
        bench.shell.active = true
        bench.host.appBecameActive()
        runCurrent()
        assertTrue("a reminder of the previous reader never opens for the next one", bench.shell.opened.isEmpty())
        assertNull(bench.host.takeNotificationTap())
    }

    // The foreground

    @Test fun aReminderThatComesDueWhileTheAppIsOpenShowsUnlessItsReviewIsOnScreen() = runTest {
        val bench = V18TestBench(backgroundScope)
        val intent = started(bench)
        assertTrue("not silently dropped", ReminderIntent.presentation(idA, intent.openThesisId(bench.host)))
        assertTrue(bench.host.allowsDueNotice(payload(idA)))
        // The review screen says which thesis it shows.
        assertTrue(bench.host.present(V18Routes.THESIS_REVIEW))
        intent.markOpen(idA.uppercase())
        assertEquals(idA, intent.openThesisId(bench.host))
        assertFalse(ReminderIntent.presentation(idA, intent.openThesisId(bench.host)))
        assertTrue(ReminderIntent.presentation(idB, intent.openThesisId(bench.host)))
        assertFalse("the glass already shows it", bench.host.allowsDueNotice(payload(idA)))
        assertTrue(bench.host.allowsDueNotice(payload(idB)))
        assertTrue("another feature's notice is not ours to hold back", bench.host.allowsDueNotice(payload(idA, kind = "follow-up")))
        intent.markOpen("not-an-id")
        assertNull(intent.openThesisId(bench.host))
        intent.markOpen(idA)
        // The review closed and nobody said so: a mark never outlives its screen.
        bench.closeSheet()
        assertNull(intent.openThesisId(bench.host))
        assertTrue(bench.host.allowsDueNotice(payload(idA)))
        assertTrue(bench.host.present(V18Routes.THESES))
        assertNull("another screen is not the review", intent.openThesisId(bench.host))
        intent.markOpen(null)
        assertNull(intent.openThesisId(bench.host))
    }

    @Test fun aReminderShownWhileTheAppIsOpenLeavesTheList() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        val center = ReminderCenter.of(bench.host)
        runCurrent()
        assertTrue(center.schedule(nvda.id, "NVDA", ReminderPreset.THREE_DAYS) is ReminderCenter.Outcome.Scheduled)
        val planned = bench.notifier.notice(ReminderCenter.identifier(nvda.id))!!
        bench.clock = planned.fireAtEpochMs
        // The phone takes it off its own list, then asks the app whether to show it.
        assertEquals(listOf(planned), bench.notifier.deliverDue())
        assertTrue(bench.host.allowsDueNotice(planned.payload))
        assertTrue("it was delivered: it is no longer pending", center.pending.isEmpty())
    }

    // Where a tap leads

    @Test fun aTapLeadsToTheReviewOfItsThesisOrToTheList() {
        val book = ThesisBook(MemoryKeyValueStore())
        val nvda = book.create(draft("NVDA"), null, t0)
        val btc = book.create(draft("BTC"), null, t0)
        val all = book.active(null)
        assertEquals(ReminderIntent.Destination.Review(nvda.id), ReminderIntent.destination(ReminderTap(nvda.id), all))
        assertEquals("the id as the book holds it", ReminderIntent.Destination.Review(btc.id), ReminderIntent.destination(ReminderTap(btc.id.uppercase()), all))
        assertEquals("the thesis no longer exists", ReminderIntent.Destination.Theses, ReminderIntent.destination(ReminderTap(idA), all))
        assertEquals(ReminderIntent.Destination.Theses, ReminderIntent.destination(ReminderTap(nvda.id), emptyList()))
        book.archive(nvda.id, null, t0)
        assertEquals("an archived thesis is not reviewed from a reminder", ReminderIntent.Destination.Theses, ReminderIntent.destination(ReminderTap(nvda.id), book.active(null)))
        assertEquals(ReminderIntent.Destination.Review(btc.id), ReminderIntent.destination(ReminderTap(btc.id), book.active(null)))
    }

    // The host honours it

    @Test fun aColdStartTapWaitsForThePageThenOpensTheReviewOnce() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.desk.onGlass = false // the activity stores the tap before the page has asked for its session
        val nvda = thesis(bench, "NVDA")
        bench.host.noteTap(payload(nvda.id, owner = V18Reader.tag(null)))
        started(bench)
        runCurrent()
        assertNull(bench.shell.sheetRoute)
        bench.host.appBecameActive()
        runCurrent()
        assertNull("before the page is ready the tap stays stored", bench.shell.sheetRoute)
        bench.desk.onGlass = true
        bench.host.pageReady()
        runCurrent()
        assertEquals(V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertEquals("the review opens on that thesis", nvda.id, bench.host.focus.thesisId)
        assertNull("consumed", bench.host.takeNotificationTap())
        assertEquals(listOf(V18Routes.THESIS_REVIEW), bench.shell.opened)

        bench.closeSheet()
        runCurrent()
        bench.host.appBecameActive()
        bench.host.pageReady()
        runCurrent()
        assertNull("never replayed on a later foreground", bench.shell.sheetRoute)
        assertEquals(1, bench.shell.opened.size)
    }

    @Test fun aWarmTapOpensWithoutAnAccount() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        assertFalse(bench.host.signedIn)
        bench.host.noteTap(payload(nvda.id.uppercase()))
        runCurrent()
        assertEquals("reminders and theses live on this phone", V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertEquals(nvda.id, bench.host.focus.takeThesisId())
    }

    @Test fun aThesisThatIsGoneOpensTheList() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        bench.host.theses.delete(nvda.id, null)
        bench.host.focus.thesisId = "left-over"
        bench.host.noteTap(payload(nvda.id))
        runCurrent()
        assertEquals(V18Routes.THESES, bench.shell.sheetRoute)
        assertNull(bench.host.focus.thesisId)
        assertFalse(bench.shell.opened.contains(V18Routes.THESIS_REVIEW))
    }

    @Test fun anArchivedThesisOpensTheListNeverAnEmptyReview() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        thesis(bench, "BTC")
        bench.host.theses.archive(nvda.id, null, bench.clock)
        bench.host.noteTap(payload(nvda.id))
        runCurrent()
        assertEquals(V18Routes.THESES, bench.shell.sheetRoute)
        assertNull(bench.host.focus.thesisId)
        assertFalse(bench.shell.opened.contains(V18Routes.THESIS_REVIEW))
    }

    @Test fun twoRemindersDueTheSameMinuteEachOpenTheirOwnReview() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        val btc = thesis(bench, "BTC")
        // Two notices on the lock screen; the person taps one, then the other.
        bench.host.noteTap(payload(nvda.id))
        runCurrent()
        assertEquals(V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertEquals(nvda.id, bench.host.focus.takeThesisId())
        bench.closeSheet()
        runCurrent()
        bench.host.noteTap(payload(btc.id))
        runCurrent()
        assertEquals(V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertEquals(btc.id, bench.host.focus.takeThesisId())
        assertEquals(listOf(V18Routes.THESIS_REVIEW, V18Routes.THESIS_REVIEW), bench.shell.opened)
    }

    @Test fun aSignedInTapIsReadAgainstTheAccountsOwnTheses() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        // The account's thesis, and one left in the phone's local book that is not theirs to open.
        val mine = thesis(bench, "NVDA", owner = "u1")
        val local = thesis(bench, "BTC")
        bench.changeAccount("u1")
        runCurrent()
        bench.host.noteTap(payload(mine.id, owner = V18Reader.tag("u1")))
        runCurrent()
        assertEquals("the signed-in book is the one read", V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertEquals(mine.id, bench.host.focus.takeThesisId())
        bench.closeSheet()
        runCurrent()
        bench.host.noteTap(payload(local.id))
        runCurrent()
        assertEquals("a thesis outside this account's book is never opened for it", V18Routes.THESES, bench.shell.sheetRoute)
        bench.closeSheet()
        runCurrent()
        // A reminder planned for the reader who was signed out opens nothing for the account.
        bench.host.noteTap(payload(local.id, owner = V18Reader.tag(null)))
        runCurrent()
        assertNull(bench.shell.sheetRoute)
        // Signed out again: the local book is the one read.
        bench.changeAccount(null)
        runCurrent()
        bench.host.noteTap(payload(local.id, owner = V18Reader.tag(null)))
        runCurrent()
        assertEquals(V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertEquals(local.id, bench.host.focus.takeThesisId())
    }

    // The ways into the Reminders screen

    @Test fun theRemindersScreenOpensFromAThesisScreenAndFromNothing() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        // From another sheet with no thesis in particular: that sheet hands over.
        assertTrue(bench.host.present("account"))
        bench.host.focus.thesisId = "left-over"
        ReminderEntry.open(bench.host)
        assertNull("the first sheet goes away first", bench.shell.sheetRoute)
        runCurrent()
        assertEquals(V18Routes.REMINDERS, bench.shell.sheetRoute)
        assertNull("an older focus is never inherited", bench.host.focus.thesisId)
        bench.closeSheet()
        runCurrent()
        // A thesis screen's reminder button: that thesis comes first.
        assertTrue(bench.host.present(V18Routes.THESIS_REVIEW))
        ReminderEntry.open(bench.host, nvda.id)
        runCurrent()
        assertEquals(V18Routes.REMINDERS, bench.shell.sheetRoute)
        assertEquals(nvda.id, bench.host.focus.takeThesisId())
        bench.closeSheet()
        runCurrent()
        // With nothing open it presents at once.
        ReminderEntry.open(bench.host)
        assertEquals(V18Routes.REMINDERS, bench.shell.sheetRoute)
    }

    @Test fun theTapWaitsForTheMicTheDeskTheVoiceASheetAndTheApp() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")

        bench.shell.voiceBusy = true
        bench.host.noteTap(payload(nvda.id))
        bench.host.appBecameActive()
        runCurrent()
        assertNull("the mic is open, or Bobby is speaking", bench.shell.sheetRoute)
        bench.shell.voiceBusy = false
        bench.desk.busy = true
        bench.host.voiceIdle()
        runCurrent()
        assertNull("a read is running", bench.shell.sheetRoute)
        bench.desk.busy = false
        bench.shell.active = false
        bench.host.readFinished()
        runCurrent()
        assertNull("the app is not in front", bench.shell.sheetRoute)
        bench.shell.active = true
        assertTrue(bench.host.present("account"))
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("another sheet is up", "account", bench.shell.sheetRoute)
        assertNotNull("still waiting", bench.host.takeNotificationTap().also { tap -> if (tap != null) bench.host.noteTap(tap) })
        bench.closeSheet()
        runCurrent()
        assertEquals(V18Routes.THESIS_REVIEW, bench.shell.sheetRoute)
        assertNull(bench.host.takeNotificationTap())
    }

    @Test fun nothingOpensBeforeTheRiskNoticeOrDuringOnboarding() = runTest {
        val bench = V18TestBench(backgroundScope)
        started(bench)
        val nvda = thesis(bench, "NVDA")
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        bench.host.noteTap(payload(nvda.id))
        runCurrent()
        assertNull(bench.shell.sheetRoute)
        bench.desk.riskNotice = RiskNotice.OUTDATED
        bench.host.appBecameActive()
        runCurrent()
        assertNull("a newer notice is read first", bench.shell.sheetRoute)
        assertNotNull("kept, not opened", bench.host.takeNotificationTap())

        val other = V18TestBench(backgroundScope)
        started(other)
        val planted = thesis(other, "NVDA")
        other.desk.onGlass = false // onboarding is on screen
        other.host.noteTap(payload(planted.id))
        runCurrent()
        assertNull(other.shell.sheetRoute)
    }

    @Test fun aPayloadThatIsNotAReminderOpensNothing() = runTest {
        val bench = V18TestBench(backgroundScope)
        val intent = started(bench)
        bench.host.noteTap(mapOf("briefId" to "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"))
        runCurrent()
        bench.host.noteTap(payload("garbage"))
        bench.host.appBecameActive()
        runCurrent()
        assertNull(bench.shell.sheetRoute)
        assertFalse(intent.open(bench.host, mapOf("briefId" to "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b")))
        assertTrue(bench.shell.opened.isEmpty())
    }

    @Test fun neitherScreenCanBeOpenedByThePage() {
        for (route in listOf(V18Routes.REMINDERS, V18Routes.THESIS_REVIEW, V18Routes.THESES)) {
            assertFalse(route, route in V18Routes.PAGE_OPENABLE)
            assertTrue(route, route in V18Routes.NATIVE_ONLY)
        }
    }
}
