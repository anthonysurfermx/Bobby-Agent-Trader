package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench
import java.util.UUID

/**
 * Reminders on the glass (1.8): the offer appears only right after a thesis was written or reviewed
 * and has no reminder yet; the Monday-briefing line only for an eligible account that has it off.
 * Neither asks the phone for anything: a nudge only opens a screen. The cases of
 * ios/Bobby/Tests/ReminderNudgeTests.swift.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ReminderNudgeTest {
    private val book = ThesisBook(MemoryKeyValueStore())
    private var clock = 1_800_000_000_000L
    private var owner: String? = "u1"
    private var reminders: Set<String> = emptySet()
    private var briefing = BriefingOffer.UNKNOWN
    private val recent = ReminderNudges.Recent()
    private val copy = ReminderCopy(TestWords.of("en"))
    private val minute = 60_000L
    private val day = 86_400_000L

    // Helpers

    private val sources = ReminderNudges.Sources({ owner }, { reader -> book.active(reader) }, { id -> id in reminders }, { briefing })

    private fun moment(signedIn: Boolean = true) = NudgeMoment(signedIn, clock, null, 0)

    private fun candidate(signedIn: Boolean = true): NucleoNudge? = ReminderNudges.candidate(moment(signedIn), sources, recent, copy)

    private fun draft(symbol: String) = ThesisDraft(symbol, symbol, true, ThesisHorizon.MONTHS, "Why I am looking at $symbol")

    private fun thesis(symbol: String, reader: String? = "u1"): SavedThesis = book.create(draft(symbol), reader, clock)

    private fun offer(eligiblePro: Boolean?, weeklyOn: Boolean?, configured: Boolean, saving: Boolean) = BriefingOffer(eligiblePro, weeklyOn, configured, saving)

    private fun settings(weekly: Boolean, eligible: Boolean, configured: Boolean): JSONObject = JSONObject()
        .put("revision", 1).put("weeklyEnabled", weekly).put("language", "en").put("eligiblePro", eligible)
        .put("schedules", JSONObject().put("timezone", "America/New_York").put("weekly", JSONObject().put("configured", configured).put("weekday", "Monday").put("localTime", "08:00")))

    // The offer after a thesis

    @Test fun theOfferAppearsRightAfterAThesisIsWrittenAndOnlyThen() {
        assertNull("no thesis: nothing to offer", candidate())
        val nvda = thesis("NVDA")
        val nudge = candidate()!!
        assertEquals("reminders.offer." + nvda.id.lowercase().take(8), nudge.id)
        assertEquals(copy.offerLine, nudge.text)
        assertEquals(copy.offerButton, nudge.cta)
        assertTrue(NucleoNudge.ID_PATTERN.matches(nudge.id))
        assertNotNull("reminders need no account", candidate(signedIn = false))
        clock += 29 * minute
        assertNotNull(candidate())
        clock += 2 * minute
        assertNull("half an hour later the moment has passed", candidate())
    }

    @Test fun aThesisThatAlreadyHasAReminderIsNotOffered() {
        val nvda = thesis("NVDA")
        reminders = setOf(nvda.id)
        assertNull(candidate())
        val btc = thesis("BTC")
        assertEquals("the fresh thesis without one is", ReminderNudges.offerId(btc.id), candidate()?.id)
    }

    @Test fun aReviewMakesAnOlderThesisFreshAgain() {
        val nvda = thesis("NVDA")
        clock += 9 * day
        assertNull(candidate())
        book.recordReview(nvda.id, "u1", 101.0, null, "wait", emptyList(), emptyList(), emptyList(), clock)
        clock += 5 * minute
        assertEquals("the person has just seen what a review gives them", ReminderNudges.offerId(nvda.id), candidate()?.id)
        clock += 40 * minute
        assertNull(candidate())
    }

    @Test fun aSavedOrReviewedSignalMarksTheThesisFresh() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val theses = bench.host.theses
        val nvda = theses.create(draft("NVDA"), "u1", bench.clock)
        val btc = theses.create(draft("BTC"), "u1", bench.clock)
        ReminderNudges.register(bench.host)
        runCurrent()
        bench.clock += 3 * day
        assertNull(bench.host.currentNudge())
        // The thesis screens say so where iOS posts its two signals.
        ReminderNudges.thesisSaved(bench.host, nvda.id)
        assertEquals(ReminderNudges.offerId(nvda.id), bench.host.currentNudge()?.id)
        bench.clock += 10 * minute
        ReminderNudges.thesisReviewed(bench.host, btc.id.uppercase())
        assertEquals("the most recent one", ReminderNudges.offerId(btc.id), bench.host.currentNudge()?.id)
        ReminderNudges.thesisSaved(bench.host, "")
        ReminderNudges.thesisSaved(bench.host, "   ")
        assertEquals("a signal without a thesis id changes nothing", ReminderNudges.offerId(btc.id), bench.host.currentNudge()?.id)
        bench.clock += 31 * minute
        assertNull(bench.host.currentNudge())
        // Another reader: what the previous one just wrote is not theirs to be reminded of.
        ReminderNudges.thesisSaved(bench.host, nvda.id)
        assertNotNull(ReminderNudges.recent(bench.host).date(nvda.id))
        bench.changeAccount("u2")
        assertNull(ReminderNudges.recent(bench.host).date(nvda.id))
    }

    @Test fun onlyAnActiveThesisOfThisReaderIsOffered() {
        val nvda = thesis("NVDA")
        thesis("BTC", reader = "someone-else")
        recent.note(UUID.randomUUID().toString(), clock)
        assertEquals(ReminderNudges.offerId(nvda.id), candidate()?.id)
        book.archive(nvda.id, "u1", clock)
        assertNull("an archived thesis is not reviewed", candidate())
        owner = null
        assertNull("another reader's thesis is never offered", candidate())
    }

    @Test fun theOfferReturnsForAnotherThesisButNeverTwiceForTheSameOne() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val theses = bench.host.theses
        val nvda = theses.create(draft("NVDA"), "u1", bench.clock)
        ReminderNudges.register(bench.host)
        runCurrent()
        assertEquals(listOf("reminders"), bench.nudges.sourceKeys)
        val source = ReminderNudges.source(bench.host, ReminderNudges.Sources.of(bench.host), ReminderNudges.Recent())
        assertEquals("reminders", source.key)
        assertEquals("below the thesis and the memory offers, above credits", NudgePriority.REMINDERS, source.priority)
        val first = bench.host.currentNudge()!!
        assertEquals(ReminderNudges.offerId(nvda.id), first.id)
        assertEquals("done", bench.host.nudgeAct(first.id).getString("status"))
        assertEquals("the tap opens the reminders screen; the phone is asked there, by a button", V18Routes.REMINDERS, bench.shell.sheetRoute)
        assertEquals("on the thesis the offer was about", nvda.id, bench.host.focus.thesisId)
        assertEquals("a nudge never asks the phone for anything", 0, bench.notifier.asked)
        assertEquals(0, bench.shell.permissionRequests)
        bench.closeSheet()
        bench.clock += 16 * minute
        assertNull("tapped once: this thesis is not offered again", bench.host.currentNudge())
        val btc = theses.create(draft("BTC"), "u1", bench.clock)
        assertEquals(ReminderNudges.offerId(btc.id), bench.host.currentNudge()?.id)
    }

    @Test fun aTapOnAnOfferWhoseThesisIsGoneStillOpensTheScreen() = runTest {
        val bench = V18TestBench(backgroundScope)
        val nvda = bench.host.theses.create(draft("NVDA"), null, bench.clock)
        ReminderNudges.register(bench.host)
        runCurrent()
        val nudge = bench.host.currentNudge()!!
        bench.host.theses.delete(nvda.id, null)
        bench.host.focus.thesisId = "stale"
        ReminderNudges.act(nudge, bench.host, ReminderNudges.Sources.of(bench.host))
        assertEquals(V18Routes.REMINDERS, bench.shell.sheetRoute)
        assertNull(bench.host.focus.thesisId)
    }

    // The Monday briefing

    @Test fun theBriefingLineOnlyForAnEligibleAccountThatHasItOff() {
        assertNull("nothing is known about the account yet", candidate())
        briefing = offer(true, false, true, false)
        val nudge = candidate()
        assertEquals("reminders.briefing.v1", nudge?.id)
        assertEquals(copy.briefingLine, nudge?.text)
        assertEquals(copy.briefingButton, nudge?.cta)
        assertNull("the briefing belongs to an account", candidate(signedIn = false))
        for (silent in listOf(
            offer(false, false, true, false), offer(null, false, true, false), offer(true, true, true, false),
            offer(true, null, true, false), offer(true, false, false, false), offer(true, false, true, true),
        )) {
            briefing = silent
            assertFalse(silent.shouldOffer)
            assertNull("$silent", candidate())
        }
    }

    @Test fun theThesisOfferSpeaksBeforeTheBriefingLine() {
        briefing = offer(true, false, true, false)
        val nvda = thesis("NVDA")
        assertEquals(ReminderNudges.offerId(nvda.id), candidate()?.id)
        reminders = setOf(nvda.id)
        assertEquals(ReminderNudges.BRIEFING_ID, candidate()?.id)
    }

    @Test fun theBriefingLineOpensTheBriefingSettings() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val offers = BriefingOffers.of(bench.host)
        offers.load = { settings(weekly = false, eligible = true, configured = true) }
        ReminderNudges.register(bench.host)
        runCurrent()
        val nudge = bench.host.currentNudge()
        assertEquals(ReminderNudges.BRIEFING_ID, nudge?.id)
        assertEquals("done", bench.host.nudgeAct(ReminderNudges.BRIEFING_ID).getString("status"))
        assertEquals("briefingSettings", bench.shell.sheetRoute)
        assertNull(bench.host.focus.thesisId)
        bench.closeSheet()
        bench.clock += 30 * day
        offers.hold(settings(weekly = false, eligible = true, configured = true))
        assertNull("acted on once: never again", bench.host.currentNudge())
    }

    @Test fun theBriefingOfferReadsOnlyWhatIsAlreadyHeld() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val offers = BriefingOffers.of(bench.host)
        var loads = 0
        offers.load = {
            loads += 1
            throw IllegalStateException("offline")
        }
        val read = ReminderNudges.Sources.of(bench.host)
        fun spoken(): NucleoNudge? = ReminderNudges.candidate(NudgeMoment(true, bench.clock, null, 0), read, ReminderNudges.Recent(), copy)
        assertFalse("nothing loaded: nothing offered", offers.current().shouldOffer)
        assertNull(spoken())
        offers.hold(settings(weekly = false, eligible = true, configured = true))
        assertEquals(BriefingOffer(eligiblePro = true, weeklyOn = false, configured = true, saving = false), offers.current())
        assertTrue(offers.current().shouldOffer)
        assertEquals(ReminderNudges.BRIEFING_ID, spoken()?.id)
        offers.hold(settings(weekly = true, eligible = true, configured = true))
        assertFalse("already on", offers.current().shouldOffer)
        offers.hold(settings(weekly = false, eligible = false, configured = true))
        assertFalse("who is eligible does not change", offers.current().shouldOffer)
        offers.hold(settings(weekly = false, eligible = true, configured = false))
        assertFalse("a switch that cannot be turned on is not advertised", offers.current().shouldOffer)
        assertNull(spoken())
        assertEquals("the nudge never fetches", 0, loads)
    }

    // Only on Android: where the briefing answer comes from

    @Test fun theBriefingAnswerIsReadFromTheSettingsReplyAndNothingIsGuessed() {
        assertEquals(BriefingOffer.UNKNOWN, BriefingOffer.from(null))
        assertEquals(BriefingOffer.UNKNOWN, BriefingOffer.from(JSONObject()))
        assertEquals(BriefingOffer(true, false, true), BriefingOffer.from(settings(weekly = false, eligible = true, configured = true)))
        // The same answer wrapped in `settings`, as the existing settings screen also accepts it.
        assertEquals(BriefingOffer(true, false, true), BriefingOffer.from(JSONObject().put("settings", settings(weekly = false, eligible = true, configured = true))))
        // An older server omits `configured`: a schedule with a next moment is configured.
        val older = JSONObject().put("weeklyEnabled", false).put("eligiblePro", true)
            .put("schedules", JSONObject().put("weekly", JSONObject().put("nextAt", "2026-10-12T12:00:00Z")))
        assertTrue(BriefingOffer.from(older).shouldOffer)
        // A number or a word posing as a boolean is not one, and a missing value stays unknown.
        val posing = JSONObject().put("weeklyEnabled", 0).put("eligiblePro", "true")
            .put("schedules", JSONObject().put("weekly", JSONObject().put("configured", 1).put("nextAt", JSONObject.NULL)))
        assertEquals(BriefingOffer(null, null, false), BriefingOffer.from(posing))
        assertFalse(BriefingOffer.from(JSONObject().put("eligiblePro", true).put("schedules", JSONObject().put("weekly", JSONObject().put("configured", true)))).shouldOffer)
    }

    @Test fun theSettingsAreReadOnlyForASignedInReaderAfterTheNoticeAndNeverForThePreviousOne() = runTest {
        val bench = V18TestBench(backgroundScope)
        val offers = BriefingOffers.of(bench.host)
        var loads = 0
        var whileLoading: () -> Unit = {}
        offers.load = {
            loads += 1
            whileLoading()
            settings(weekly = false, eligible = true, configured = true)
        }
        assertFalse("signed out: the briefing belongs to an account", offers.refresh())
        bench.changeAccount("u1")
        bench.desk.riskNotice = RiskNotice.OUTDATED
        assertFalse("nothing reaches the network before the current notice is accepted", offers.refresh())
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        assertFalse(offers.refresh())
        assertEquals(0, loads)
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        assertTrue(offers.refresh())
        assertEquals(1, loads)
        assertTrue(offers.current().shouldOffer)
        assertFalse("just read: not read again on every return to the app", offers.stale)
        // The glass does not speak from an old answer; coming back to the app reads it again.
        bench.clock += BriefingOffers.REFRESH_AFTER_MS + 1
        assertTrue(offers.stale)
        assertTrue(offers.current().shouldOffer)
        bench.clock += BriefingOffers.TRUSTED_MS
        assertFalse(offers.current().shouldOffer)
        assertTrue("the Reminders screen still shows what was read until it reads again", offers.state.value.shouldOffer)
        // A reply that lands after another reader took the phone is dropped.
        offers.clear()
        whileLoading = { bench.changeAccount("u2") }
        assertFalse(offers.refresh())
        assertEquals(BriefingOffer.UNKNOWN, offers.state.value)
        // A failed read holds nothing and never throws.
        whileLoading = { throw IllegalStateException("offline") }
        assertFalse(offers.refresh())
        assertEquals(BriefingOffer.UNKNOWN, offers.current())
    }

    @Test fun registeringReadsTheBriefingOnceAndTellsThePage() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        val offers = BriefingOffers.of(bench.host)
        var loads = 0
        offers.load = {
            loads += 1
            settings(weekly = false, eligible = true, configured = true)
        }
        ReminderNudges.register(bench.host)
        val before = bench.desk.sessionChanges
        bench.host.appBecameActive() // the activity resumes right after it is created
        runCurrent()
        assertEquals("one read, not one per trigger", 1, loads)
        assertEquals("the page hears that a line may now show", before + 1, bench.desk.sessionChanges)
        assertEquals(ReminderNudges.BRIEFING_ID, bench.host.currentNudge()?.id)
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("still fresh", 1, loads)
        // Withdrawing the notice forgets it; so does another reader.
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        bench.host.consentWithdrawn()
        assertEquals(BriefingOffer.UNKNOWN, offers.state.value)
    }

    // The words

    @Test fun theLinesFitTheGlassInSixLanguages() {
        for (language in TestWords.languages) {
            val words = ReminderCopy(TestWords.of(language))
            for (text in listOf(words.offerLine, words.briefingLine)) {
                assertFalse("$language: a line", text.isEmpty())
                assertTrue("$language: $text", text.length <= NucleoNudge.TEXT_LIMIT)
                assertFalse(text, text.contains("!"))
            }
            for (text in listOf(words.offerButton, words.briefingButton)) {
                assertFalse("$language: a button", text.isEmpty())
                assertTrue("$language: $text", text.length <= NucleoNudge.CTA_LIMIT)
            }
        }
        // The same strings the source serves, each with its own words in the four added languages.
        assertEquals("Want a reminder to review it?", ReminderCopy(TestWords.of("en")).offerLine)
        assertEquals("Tu resumen del lunes está incluido", ReminderCopy(TestWords.of("es")).briefingLine)
        assertEquals(6, TestWords.languages.map { ReminderCopy(TestWords.of(it)).offerLine }.toSet().size)
    }

    @Test fun reminderCopyNeverSoundsLikeTheMarketWasWatched() {
        // Every English line a reminder can show, as the app asks the catalogs for it.
        val english = ReminderCopy(TestWords.of("en")).everyLine()
        assertTrue(english.size >= 25)
        // A reminder is something the person set. No line names a market alert, not even to deny it.
        val lockScreen = "Your reminder to review a thesis."
        val intro = "Your chosen date. Bobby does not monitor markets."
        for (line in english) {
            val translations = TestWords.translations(line)
            assertEquals(line, setOf("fr", "pt", "it", "de"), translations.keys)
            for (text in listOf(line) + translations.values) {
                assertFalse(text, text.contains("!"))
                for (word in listOf("buy", "sell", "profit", "guarantee", "returns", "advice", "signal")) {
                    assertFalse("$word: $text", Regex("\\b$word", RegexOption.IGNORE_CASE).containsMatchIn(text))
                }
            }
            assertFalse(line, line.contains("alert", ignoreCase = true))
            if (line != intro) {
                for (word in listOf("watch", "monitor", "detect")) assertFalse("$word: $line", line.contains(word, ignoreCase = true))
            }
            // Delivery on Android is inexact: no line promises a minute.
            for (word in listOf("exact", "sharp", "on time", "at the minute", "punctual")) assertFalse("$word: $line", line.contains(word, ignoreCase = true))
        }
        assertTrue(english.contains(lockScreen))
        assertTrue(english.contains(intro))
        // Spanish says the same and no more.
        for (line in ReminderCopy(TestWords.of("es")).everyLine()) {
            assertFalse(line, line.contains("!") || line.contains("¡"))
            for (word in listOf("compra", "vende", "ganancia", "garantiz", "rendimiento", "consejo", "señal", "alerta")) {
                assertFalse("$word: $line", line.contains(word, ignoreCase = true))
            }
        }
    }
}
