package xyz.bobbyprotocol.android.v18.theses

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import xyz.bobbyprotocol.android.data.AccountChangedException
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.data.SessionUnavailableException
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisContext
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.ThesisReviewNotes
import xyz.bobbyprotocol.android.v18.ThesisRevision
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.theses.ThesisRefusalCopy.Action
import xyz.bobbyprotocol.android.v18.theses.ThesisReviewer.Phase
import xyz.bobbyprotocol.android.v18.theses.ThesisReviewer.Refusal
import java.io.IOException
import java.net.SocketTimeoutException

/**
 * Reviewing a thesis (ios/Bobby/Tests/ThesisReviewerTests.swift). Every desk request here is an
 * injected stub: no network, no account, no read is spent. These pin the promises of a review: it
 * carries the person's words and their level, it is recorded only when an answer was delivered, a
 * refusal says what happens next and records nothing, and a reply for an account that is gone is
 * dropped.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ThesisReviewerTest {
    private val book = ThesisBook(MemoryKeyValueStore())
    private val words = CatalogWords()
    private val copy = ThesisCopy(words)
    private var user: String? = "account-a"
    private var epoch = 1L
    private var riskAccepted = true
    private var level = "profundo"
    private val requests = ArrayList<ThesisReviewRequest>()
    private val access = ArrayList<JSONObject>()
    private val meters = ArrayList<String>()
    private val decided = ArrayList<Pair<String, String>>()
    private val events = ThesisEvents()
    private val t0 = 1_800_000_000_000L
    private val day = 86_400_000L
    private val now: Long get() = t0 + 9 * day

    init {
        events.onReviewed { id, decision -> decided.add(id to decision) }
    }

    // Fixtures

    private fun seed(symbol: String = "NVDA", owner: String? = "account-a", isEquity: Boolean = true, price: Double? = 100.0): SavedThesis = book.create(
        ThesisDraft(symbol = symbol, name = symbol, isEquity = isEquity, horizon = ThesisHorizon.MONTHS, hypothesis = "Margins recover as supply eases",
                    worry = "Demand slows", changeMind = "Two weak quarters", sourceRequestId = "read-1", price = price,
                    asOf = "2026-10-07T12:00:00Z", verdict = "wait"), owner, t0)

    private fun reviewer(thesisId: String?, scope: CoroutineScope? = null, send: suspend (ThesisReviewRequest) -> DeskOutcome) = ThesisReviewer(
        thesisId,
        ThesisReviewer.Environment(
            book = book, words = words, owner = { user }, epoch = { epoch }, riskAccepted = { riskAccepted }, level = { level }, now = { now },
            send = { request ->
                requests.add(request)
                send(request)
            },
            accessChanged = { access.add(it) }, meterChanged = { meters.add(it) }, events = events),
        scope)

    private fun replyJson(extra: JSONObject? = null, verdict: String = "review", price: Double? = 108.9): JSONObject {
        val body = JSONObject()
            .put("symbol", "NVDA")
            .put("technicals", JSONObject().put("price", price ?: JSONObject.NULL).put("rsi14", 55.0))
            .put("provenance", JSONObject().put("provider", "Yahoo Finance").put("asOf", "2026-10-16T14:30:00Z"))
            .put("agents", JSONObject().put("alpha", "Alpha says").put("red", "Red says").put("cio", "CIO says").put("verdict", verdict).put("direction", "none")
                .put("synthesis", JSONObject().put("headline", "Price evidence still leans your way.").put("why", "w").put("risk", "r").put("watch", "x")))
            .put("access", JSONObject().put("tier", "free").put("used", 4).put("limit", 10).put("remaining", 6).put("resetsAt", JSONObject.NULL)
                .put("paywall", true).put("bonus", 0))
        if (extra != null) for (key in extra.keys()) body.put(key, extra.get(key))
        return body
    }

    private fun reply(extra: JSONObject? = null, verdict: String = "review", price: Double? = 108.9): DeskOutcome = DeskOutcome.of(200, replyJson(extra, verdict, price))

    private fun review(supports: List<String>, challenges: List<String>, unknowns: List<String>, notChecked: List<String>): JSONObject = JSONObject().put(
        "review", JSONObject().put("supports", JSONArray(supports)).put("challenges", JSONArray(challenges)).put("unknowns", JSONArray(unknowns))
            .put("notChecked", JSONArray(notChecked)))

    private fun refusal(status: Int, body: String): DeskOutcome = DeskOutcome.of(status, JSONObject(body))

    private fun result(reviewer: ThesisReviewer): ThesisReviewResult {
        val phase = reviewer.phase
        if (phase is Phase.Done) return phase.result
        fail("expected a finished review, got $phase")
        throw IllegalStateException()
    }

    private fun refused(refusal: Refusal): Phase = Phase.Refused(refusal)
    private fun kinds(thesis: SavedThesis?): List<ThesisRevision.Kind> = thesis?.revisions?.map { it.kind } ?: emptyList()

    // A delivered review

    @Test fun aReviewCarriesThePersonsWordsTheirLevelAndTheFixedQuestion() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) { reply() }
        assertEquals(Phase.Ready, reviewer.phase)
        assertEquals("profundo", reviewer.currentLevel)
        reviewer.review()
        assertEquals("one review is one desk read", 1, requests.size)
        val request = requests.first()
        assertEquals("NVDA", request.symbol)
        assertTrue(request.isEquity)
        assertEquals("the level the person picked", "profundo", request.level)
        assertEquals("Review my thesis on NVDA: what does the latest evidence support, what does it challenge, and what is still unknown?", request.question)
        assertEquals(ThesisContext(thesis), request.thesis)
        val sent = request.thesis.toJson()
        assertEquals("Margins recover as supply eases", sent.getString("hypothesis"))
        assertEquals("Demand slows", sent.getString("worry"))
        assertEquals("Two weak quarters", sent.getString("changeMind"))
        assertEquals("months", sent.getString("horizon"))
        assertEquals(100.0, sent.getDouble("priceAtSave"), 0.0)
        assertFalse("the thesis object carries no symbol and no id", sent.has("symbol") || sent.has("id"))
    }

    @Test fun aDeliveredReviewIsRecordedWithItsDatedEvidenceAndTheThreeLists() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) {
            reply(review(listOf("Above the 50-day average"), listOf("Momentum cooled"), listOf("Next earnings"), listOf("earnings", "news")))
        }
        reviewer.review()
        val result = result(reviewer)
        assertEquals("review", result.verdict)
        assertEquals("Price evidence still leans your way.", result.headline)
        assertEquals(ThesisReviewNotes(listOf("Above the 50-day average"), listOf("Momentum cooled"), listOf("Next earnings"), listOf("earnings", "news")), result.notes)
        assertEquals("the server's codes, in the app's fixed order", listOf("news", "earnings"), result.notChecked)
        assertEquals("profundo", result.level)
        assertEquals(100.0, result.thenNow.thenPrice!!, 0.0)
        assertEquals(t0, result.thenNow.thenAtMillis)
        assertEquals(108.9, result.thenNow.nowPrice!!, 0.0)
        assertEquals("2026-10-16T14:30:00Z", result.thenNow.asOf)
        assertEquals(8.9, result.thenNow.changePct!!, 0.0001)

        val stored = book.thesis(thesis.id, "account-a")!!
        assertEquals(stored, result.thesis)
        assertEquals(now, stored.lastReviewedAtMillis)
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.REVIEWED), kinds(stored))
        val entry = stored.lastReview!!
        assertEquals(108.9, entry.price!!, 0.0)
        assertEquals("2026-10-16T14:30:00Z", entry.asOf)
        assertEquals("review", entry.verdict)
        assertEquals(listOf("Above the 50-day average"), entry.supports)
        assertEquals(listOf("Momentum cooled"), entry.challenges)
        assertEquals(listOf("Next earnings"), entry.unknowns)
        assertEquals(stored, reviewer.thesis)
        assertEquals("the credits the app shows follow the server's word", listOf(6), access.map { it.optInt("remaining") })
        assertEquals(listOf("profundo"), meters)
        assertTrue("a review is not yet a decision", decided.isEmpty())
    }

    @Test fun aServerThatIgnoresTheThesisStillGivesARecordedReviewWithEmptyLists() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) { reply(verdict = "wait") }
        reviewer.review()
        val result = result(reviewer)
        assertNull("the lists are unavailable, never invented", result.notes)
        assertEquals("wait", result.verdict)
        assertEquals("Price evidence still leans your way.", result.headline)
        assertEquals("the whole fixed list", listOf("news", "earnings", "filings", "fundamentals", "macro"), result.notChecked)
        val entry = book.thesis(thesis.id, "account-a")!!.lastReview!!
        assertEquals(ThesisRevision.Kind.REVIEWED, entry.kind)
        assertEquals(listOf(emptyList<String>(), emptyList(), emptyList()), listOf(entry.supports, entry.challenges, entry.unknowns))
        assertEquals(108.9, entry.price!!, 0.0)
        assertEquals("wait", entry.verdict)
    }

    @Test fun aReviewObjectWithNoKnownGapsStillShowsTheWholeFixedList() = runTest {
        val thesis = seed("BTC", isEquity = false)
        val reviewer = reviewer(thesis.id) { reply(review(listOf("Holding the weekly trend"), emptyList(), emptyList(), listOf("the moon"))) }
        reviewer.review()
        val result = result(reviewer)
        assertEquals(listOf("Holding the weekly trend"), result.notes?.supports)
        assertEquals("a crypto asset has no earnings or filings to list", listOf("news", "fundamentals", "macro"), result.notChecked)
        assertFalse(requests[0].isEquity)
    }

    @Test fun anEvidencePriceTheAppCannotUseLeavesTheChangeOut() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) { reply(price = null) }
        reviewer.review()
        val result = result(reviewer)
        assertNull(result.thenNow.nowPrice)
        assertNull("no number is shown in place of a missing price", result.thenNow.changePct)
        assertEquals(100.0, result.thenNow.thenPrice!!, 0.0)
        assertNull(book.thesis(thesis.id, "account-a")?.lastReview?.price)
    }

    @Test fun reviewWithQuickRunsThisOneReviewAtQuickAndLeavesThePickAlone() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) { reply() }
        reviewer.review("rapido")
        assertEquals(listOf("rapido"), requests.map { it.level })
        assertEquals("profundo", level)
        assertEquals("profundo", reviewer.currentLevel)
        assertEquals("rapido", result(reviewer).level)
        assertTrue("Quick has no premium meter to refresh", meters.isEmpty())
    }

    // Before anything is sent

    @Test fun nothingIsSentBeforeTheRiskNoticeIsAccepted() = runTest {
        val thesis = seed()
        riskAccepted = false
        val reviewer = reviewer(thesis.id) { reply() }
        assertEquals(refused(Refusal.RiskNotice), reviewer.phase)
        reviewer.review()
        assertTrue(requests.isEmpty())
        assertEquals(refused(Refusal.RiskNotice), reviewer.phase)
        assertNull(book.thesis(thesis.id, "account-a")?.lastReviewedAtMillis)
        riskAccepted = true
        reviewer.reload()
        assertEquals("once accepted the review is offered again", Phase.Ready, reviewer.phase)
    }

    @Test fun aMissingAnArchivedOrAnotherAccountsThesisIsNeverSent() = runTest {
        val thesis = seed()
        val other = seed("BTC", owner = "account-b")
        book.archive(thesis.id, "account-a", t0)
        for ((id, expected) in listOf(thesis.id to Refusal.Archived, other.id to Refusal.NotFound, "no-such-thesis" to Refusal.NotFound)) {
            val reviewer = reviewer(id) { reply() }
            assertEquals(id, refused(expected), reviewer.phase)
            reviewer.review()
            assertEquals(id, refused(expected), reviewer.phase)
        }
        val none = reviewer(null) { reply() }
        none.review()
        assertEquals(refused(Refusal.NotFound), none.phase)
        assertTrue(requests.isEmpty())
        assertNull(book.thesis(other.id, "account-b")?.lastReviewedAtMillis)
    }

    // Refusals record nothing

    @Test fun everyRefusalSaysWhatHappenedAndRecordsNothing() = runTest {
        val thesis = seed()
        val freeAccess = """{"tier":"free","used":10,"limit":10,"remaining":0,"resetsAt":"2026-10-20T00:00:00Z","paywall":true}"""
        val meter = """{"used":3,"limit":3,"remaining":0,"resetsAt":"2026-10-21T00:00:00Z"}"""
        val resets = ThesisCopy.instant("2026-10-20T00:00:00Z")
        val levelResets = ThesisCopy.instant("2026-10-21T00:00:00Z")
        assertNotNull(resets)
        val cases: List<Triple<String, DeskOutcome, Phase>> = listOf(
            Triple("401", refusal(401, """{"code":"signin_required","error":"x"}"""), refused(Refusal.SignIn(null))),
            Triple("402", refusal(402, """{"code":"subscription_required","access":$freeAccess}"""), refused(Refusal.Subscription(resets))),
            Triple("402 without a date", refusal(402, """{"code":"subscription_required"}"""), refused(Refusal.Subscription(null))),
            Triple("403 sign in", refusal(403, """{"code":"signin_required","meter":$meter}"""), refused(Refusal.SignIn("profundo"))),
            Triple("403 upgrade", refusal(403, """{"code":"upgrade_required","meter":$meter}"""), refused(Refusal.LevelUsed("profundo", levelResets))),
            Triple("403 exhausted", refusal(403, """{"code":"level_exhausted"}"""), refused(Refusal.LevelUsed("profundo", null))),
            Triple("503 premium paused", refusal(503, """{"code":"budget_paused","level":"profundo","quickAvailable":true}"""), refused(Refusal.Paused("profundo", true))),
            Triple("503 all paused", refusal(503, """{"code":"budget_paused","level":"profundo","quickAvailable":false}"""), refused(Refusal.Paused("profundo", false))),
            Triple("429", refusal(429, """{"code":"daily_limit"}"""), refused(Refusal.Quota)),
            Triple("503 failed", refusal(503, """{"code":"analysis_failed"}"""), refused(Refusal.Failed)),
            Triple("503 unavailable", refusal(503, """{"code":"desk_unavailable"}"""), refused(Refusal.Failed)),
            Triple("400 too long", refusal(400, """{"code":"question_too_long"}"""), refused(Refusal.Failed)),
            Triple("timeout", DeskOutcome.of(SocketTimeoutException("timeout")), refused(Refusal.Uncertain)),
            Triple("network", DeskOutcome.of(IOException("unreachable")), refused(Refusal.Uncertain)),
            Triple("200 without agents", refusal(200, """{"symbol":"NVDA"}"""), refused(Refusal.Unreadable)),
            Triple("500", refusal(500, "{}"), refused(Refusal.Unreadable)),
            Triple("cancelled", DeskOutcome.Cancelled, Phase.Ready),
        )
        for ((name, outcome, expected) in cases) {
            val reviewer = reviewer(thesis.id) { outcome }
            reviewer.review()
            assertEquals(name, expected, reviewer.phase)
            val stored = book.thesis(thesis.id, "account-a")
            assertEquals("$name: nothing is recorded", thesis, stored)
            assertNull(name, stored?.lastReviewedAtMillis)
        }
        assertEquals(cases.size, requests.size)
        assertEquals("a refusal that carries the access object still updates the credits shown", 1, access.size)
        assertTrue(decided.isEmpty())
    }

    @Test fun whatTheTransportThrowsIsReadAsTheSameOutcomes() {
        // `BobbyRepository.streamDebate` answers a refusal by throwing: the same statuses, the same outcomes.
        assertTrue(DeskOutcome.of(ApiException(503, "analysis_failed", JSONObject().put("type", "error").put("code", "analysis_failed"))) is DeskOutcome.Failed)
        assertTrue("an answer that could not be read most likely counted", DeskOutcome.of(ApiException(502, "analysis_incomplete")) is DeskOutcome.BadResponse)
        assertTrue(DeskOutcome.of(ApiException(429, "daily_limit", null, 3600.0)) is DeskOutcome.Quota)
        assertTrue(DeskOutcome.of(ApiException(400, "question_too_long")) is DeskOutcome.TooLong)
        val gated = DeskOutcome.of(ApiException(402, "subscription_required", JSONObject("""{"code":"subscription_required","access":{"remaining":0}}""")))
        assertEquals("subscription_required", (gated as DeskOutcome.Gated).status)
        assertEquals(0, gated.access?.optInt("remaining", -1))
        val level = DeskOutcome.of(ApiException(403, "level_exhausted", JSONObject("""{"code":"level_exhausted","meter":{"resetsAt":"2026-10-21T00:00:00Z"}}""")))
        assertEquals("2026-10-21T00:00:00Z", (level as DeskOutcome.LevelRefused).resetsAt)
        assertTrue("a 403 the desk does not use for a level is not a level refusal", DeskOutcome.of(ApiException(403, "consent_required")) is DeskOutcome.BadResponse)
        assertTrue((DeskOutcome.of(ApiException(503, "budget_paused", JSONObject("""{"code":"budget_paused","level":"rapido"}"""))) as DeskOutcome.BudgetPaused).allLevels)
        assertTrue("another account now: the reply belongs to nobody", DeskOutcome.of(AccountChangedException()) is DeskOutcome.Cancelled)
        assertTrue("no session could be had, so nothing was sent", DeskOutcome.of(SessionUnavailableException()) is DeskOutcome.Failed)
        assertTrue(DeskOutcome.of(IllegalStateException("unexpected")) is DeskOutcome.BadResponse)
        assertTrue(DeskOutcome.of(200, replyJson()) is DeskOutcome.Ok)
        assertTrue("a reply that carries an error is not an answer", DeskOutcome.of(200, replyJson().put("error", "failed")) is DeskOutcome.BadResponse)
    }

    @Test fun aRefusalCanBeTriedAgainAndThenRecordsTheReview() = runTest {
        val thesis = seed()
        val answers = ArrayList(listOf(DeskOutcome.Network, reply()))
        val reviewer = reviewer(thesis.id) { answers.removeAt(0) }
        reviewer.review()
        assertEquals(refused(Refusal.Uncertain), reviewer.phase)
        reviewer.review()
        result(reviewer)
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.REVIEWED), kinds(book.thesis(thesis.id, "account-a")))
    }

    @Test fun eachRefusalOffersTheRightNextStepAndOnlyAFailedAnalysisSaysNothingWasUsed() {
        fun said(refusal: Refusal) = ThesisRefusalCopy(refusal, words, proPurchasable = true)
        assertEquals(listOf(Action.SIGN_IN), said(Refusal.SignIn(null)).actions)
        assertEquals("a premium level a guest cannot use: sign in, or review with Quick", listOf(Action.SIGN_IN, Action.QUICK), said(Refusal.SignIn("profundo")).actions)
        assertTrue(said(Refusal.SignIn("profundo")).text.contains("Deep"))
        assertEquals("Quick is not a premium level: the plain words", said(Refusal.SignIn(null)).text, said(Refusal.SignIn("rapido")).text)
        val date = t0
        assertEquals(listOf(Action.PRO), said(Refusal.Subscription(date)).actions)
        assertEquals("Free reads come back on ${copy.longDay(date)}.", said(Refusal.Subscription(date)).detail)
        assertNull("no date from the server, no date on screen", said(Refusal.Subscription(null)).detail)
        // Where Bobby Pro cannot be bought in this build (Google Play does not sell it yet), the paywall is
        // a dead end: its one button is switched off. The next step is Credits, and the day still shows.
        val cannotBuy = ThesisRefusalCopy(Refusal.Subscription(date), words, proPurchasable = false)
        assertEquals(listOf(Action.CREDITS), cannotBuy.actions)
        assertFalse("no door to a paywall that cannot sell", Action.PRO in cannotBuy.actions)
        assertEquals(said(Refusal.Subscription(date)).text, cannotBuy.text)
        assertEquals("Free reads come back on ${copy.longDay(date)}.", cannotBuy.detail)
        assertEquals("every other refusal is the same either way", said(Refusal.LevelUsed("maximo", date)).actions,
                     ThesisRefusalCopy(Refusal.LevelUsed("maximo", date), words, proPurchasable = false).actions)
        assertEquals(listOf(Action.QUICK), said(Refusal.LevelUsed("maximo", date)).actions)
        assertTrue(said(Refusal.LevelUsed("maximo", date)).text.contains(copy.longDay(date)))
        assertEquals("You used your Max for now.", said(Refusal.LevelUsed("maximo", null)).text)
        assertTrue("Quick used up has no lower level to offer", said(Refusal.LevelUsed("rapido", null)).actions.isEmpty())
        assertEquals(listOf(Action.QUICK), said(Refusal.Paused("profundo", true)).actions)
        assertEquals("Deep is paused for today.", said(Refusal.Paused("profundo", true)).text)
        assertTrue("nothing to try while every level is paused", said(Refusal.Paused("rapido", false)).actions.isEmpty())
        assertTrue(said(Refusal.Quota).actions.isEmpty())
        assertEquals("The review did not finish. Nothing was used.", said(Refusal.Failed).text)
        assertEquals(listOf(Action.RETRY), said(Refusal.Failed).actions)
        assertEquals("It may not have counted; check your credits.", said(Refusal.Uncertain).detail)
        assertEquals(listOf(Action.RETRY, Action.CREDITS), said(Refusal.Uncertain).actions)
        assertEquals(listOf(Action.RETRY, Action.CREDITS), said(Refusal.Unreadable).actions)
        assertEquals(listOf(Action.MY_THESES), said(Refusal.NotFound).actions)
        assertEquals(listOf(Action.MY_THESES), said(Refusal.Archived).actions)
        assertTrue(said(Refusal.RiskNotice).actions.isEmpty())
        val all = listOf(Refusal.RiskNotice, Refusal.NotFound, Refusal.WrittenSignedOut, Refusal.Archived, Refusal.SignIn(null), Refusal.SignIn("maximo"),
                         Refusal.Subscription(date), Refusal.LevelUsed("profundo", null), Refusal.LevelUsed("profundo", date), Refusal.Paused("maximo", true),
                         Refusal.Paused("rapido", false), Refusal.Quota, Refusal.Failed, Refusal.Uncertain, Refusal.Unreadable)
        for (refusal in all) {
            val english = said(refusal)
            assertFalse("$refusal", english.text.isEmpty())
            val claimsNothingUsed = (english.text + (english.detail ?: "")).contains("Nothing was used")
            assertEquals("$refusal: only a failure the server refunds may say nothing was used", refusal == Refusal.Failed, claimsNothingUsed)
            // Every refusal is worded in each of the six languages, with nothing left unfilled.
            val lines = HashSet<String>()
            words.inEveryLanguage { language ->
                val line = said(refusal)
                assertFalse("$language $refusal: ${line.text}", (line.text + (line.detail ?: "")).contains("{"))
                lines.add(line.text)
            }
            assertEquals("$refusal: $lines", 6, lines.size)
        }
    }

    // Fences

    @Test fun aReplyThatArrivesAfterTheAccountChangedIsDropped() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id) { pending.await() }
        val running = launch { reviewer.review() }
        runCurrent()
        assertEquals(Phase.Running, reviewer.phase)
        user = "account-b"
        epoch += 1
        pending.complete(reply(review(listOf("x"), emptyList(), emptyList(), emptyList())))
        running.join()
        assertEquals("the new account has no such thesis", refused(Refusal.NotFound), reviewer.phase)
        assertNull(reviewer.thesis)
        assertEquals("nothing is written into the previous account's book", thesis, book.thesis(thesis.id, "account-a"))
        assertTrue(book.all("account-b").isEmpty())
        assertTrue("nor are that reply's credits shown to the new account", access.isEmpty())
    }

    @Test fun aReplyIsDroppedWhenOnlyTheBooksOwnerChanged() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id) { pending.await() }
        val running = launch { reviewer.review() }
        runCurrent()
        user = null
        pending.complete(reply())
        running.join()
        assertEquals(refused(Refusal.NotFound), reviewer.phase)
        assertNull(book.thesis(thesis.id, "account-a")?.lastReviewedAtMillis)
    }

    @Test fun signingBackIntoTheSameAccountStillDropsTheOldReply() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id) { pending.await() }
        val running = launch { reviewer.review() }
        runCurrent()
        epoch += 1
        pending.complete(reply())
        running.join()
        assertEquals("the thesis is still there and can be reviewed again", Phase.Ready, reviewer.phase)
        assertNull(book.thesis(thesis.id, "account-a")?.lastReviewedAtMillis)
    }

    @Test fun aReplyIsDroppedWhenTheRiskNoticeWasWithdrawnWhileTheDeskWorked() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id) { pending.await() }
        val running = launch { reviewer.review() }
        runCurrent()
        riskAccepted = false
        pending.complete(reply())
        running.join()
        assertEquals(refused(Refusal.RiskNotice), reviewer.phase)
        assertNull(book.thesis(thesis.id, "account-a")?.lastReviewedAtMillis)
        assertTrue(access.isEmpty())
    }

    @Test fun closingTheScreenCancelsTheReviewAndALateReplyRecordsNothing() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id, backgroundScope) { pending.await() }
        reviewer.start()
        runCurrent()
        assertTrue(reviewer.isRunning)
        reviewer.cancel()
        assertEquals(Phase.Ready, reviewer.phase)
        pending.complete(reply())
        runCurrent()
        assertEquals(Phase.Ready, reviewer.phase)
        assertEquals(thesis, book.thesis(thesis.id, "account-a"))
        assertTrue(access.isEmpty())
        // The screen can start another one afterwards.
        val again = reviewer(thesis.id, backgroundScope) { reply() }
        again.start()
        runCurrent()
        result(again)
        again.start()
        runCurrent()
        assertEquals("a finished review can be run again, one request each time", 3, requests.size)
    }

    @Test fun oneReviewAtATime() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id, backgroundScope) { pending.await() }
        val first = launch { reviewer.review() }
        runCurrent()
        reviewer.review()
        reviewer.start()
        runCurrent()
        assertEquals("a second tap while one runs sends nothing", 1, requests.size)
        pending.complete(reply())
        first.join()
        result(reviewer)
        assertEquals(1, book.thesis(thesis.id, "account-a")!!.revisions.count { it.kind == ThesisRevision.Kind.REVIEWED })
    }

    @Test fun aThesisDeletedWhileTheDeskWorkedHasNoReviewToAttach() = runTest {
        val thesis = seed()
        val pending = CompletableDeferred<DeskOutcome>()
        val reviewer = reviewer(thesis.id) { pending.await() }
        val running = launch { reviewer.review() }
        runCurrent()
        book.delete(thesis.id, "account-a")
        pending.complete(reply())
        running.join()
        assertEquals(refused(Refusal.NotFound), reviewer.phase)
        assertTrue(book.all("account-a").isEmpty())
    }

    @Test fun anAccountChangeOnTheScreenResetsItForTheNewAccount() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) { reply() }
        reviewer.review()
        result(reviewer)
        user = null
        epoch += 1
        reviewer.accountChanged()
        assertEquals("a finished review of the previous account does not stay on screen", refused(Refusal.NotFound), reviewer.phase)
    }

    @Test fun aThesisWrittenBeforeSigningInLeadsToMyThesesAndIsNeverMovedByTheScreen() = runTest {
        user = null
        val local = seed("BTC", owner = null)
        val reviewer = reviewer(local.id) { refusal(401, """{"code":"signin_required","error":"x"}""") }
        assertEquals(Phase.Ready, reviewer.phase)
        reviewer.review()
        assertEquals("a guest out of reads is asked to sign in", refused(Refusal.SignIn(null)), reviewer.phase)
        // The person signs in. Nothing adopts the guest book by itself.
        user = "account-c"
        epoch += 1
        reviewer.accountChanged()
        assertEquals("not 'unavailable': the thesis waits in the guest book", refused(Refusal.WrittenSignedOut), reviewer.phase)
        assertNull(reviewer.thesis)
        assertTrue("the review screen moves nothing", book.all("account-c").isEmpty())
        assertEquals(listOf(local.id), book.all(null).map { it.id })
        val said = ThesisRefusalCopy(Refusal.WrittenSignedOut, words, proPurchasable = true)
        assertEquals("You wrote this thesis before signing in.", said.text)
        assertEquals("Open My theses to keep it in this account.", said.detail)
        assertEquals("My theses holds the row that asks", listOf(Action.MY_THESES), said.actions)
        reviewer.review()
        assertEquals("nothing is sent for a thesis that is not in this account's book", 1, requests.size)

        // "Keep them" in My theses: the screen picks the thesis up again.
        assertEquals(1, book.adoptLocal("account-c", now))
        reviewer.reload()
        assertEquals(Phase.Ready, reviewer.phase)
        assertEquals(local.id, reviewer.thesis?.id)

        // "Not mine" for another account: it is simply not available there.
        val other = seed("ETH", owner = null, isEquity = false)
        user = "account-d"
        epoch += 1
        val declined = reviewer(other.id) { reply() }
        assertEquals(refused(Refusal.WrittenSignedOut), declined.phase)
        book.declineLocal("account-d")
        declined.reload()
        assertEquals(refused(Refusal.NotFound), declined.phase)
        assertEquals("declined theses stay in the guest book", listOf(other.id), book.all(null).map { it.id })
    }

    // Where the thesis started

    @Test fun aThesisWrittenWithoutAPriceNeverBorrowsAReviewsPriceAsItsStart() = runTest {
        val thesis = seed(price = null)
        val prices = ArrayList(listOf(126.1, 131.2))
        val reviewer = reviewer(thesis.id) { reply(price = prices.removeAt(0)) }

        reviewer.review()
        val first = result(reviewer)
        assertNull(first.thenNow.thenPrice)
        assertTrue("the screen says no starting price was saved", first.thenNow.missingStart)
        assertEquals("today's price is still shown", 126.1, first.thenNow.nowPrice!!, 0.0)
        assertNull(first.thenNow.changePct)

        reviewer.review()
        val second = result(reviewer)
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.REVIEWED, ThesisRevision.Kind.REVIEWED), kinds(second.thesis))
        assertNull("the first review's 126.10 is not where the thesis started", second.thenNow.thenPrice)
        assertNull(second.thenNow.thenAtMillis)
        assertTrue(second.thenNow.missingStart)
        assertEquals(131.2, second.thenNow.nowPrice!!, 0.0)
        assertNull("no change is computed from a review's price", second.thenNow.changePct)
        assertNull(ThesisCopy.startingPoint(second.thesis))
        assertFalse("nor shown as 'started at' in the list", copy.sinceLine(second.thesis, now).contains("126"))
        assertEquals(2, requests.size)
        assertNull("nor sent to the desk as the price at save", requests[1].thesis.priceAtSave)
        assertFalse(requests[1].thesis.toJson().has("priceAtSave"))

        // A thesis that has its own starting price keeps it through any number of reviews.
        val priced = seed("BTC", isEquity = false, price = 100.0)
        val other = reviewer(priced.id) { reply(price = 110.0) }
        other.review()
        other.review()
        val again = result(other)
        assertEquals(100.0, again.thenNow.thenPrice!!, 0.0)
        assertEquals(t0, again.thenNow.thenAtMillis)
        assertFalse(again.thenNow.missingStart)
        assertEquals(10.0, again.thenNow.changePct!!, 1e-9)
        assertEquals(100.0, requests.last().thesis.priceAtSave!!, 0.0)
    }

    // The production wiring

    @Test fun theLiveEnvironmentIsBoundToTheHostsConsentItsAccountMomentAndItsDeskBody() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        bench.desk.analysisLevel = "profundo"
        val sent = ArrayList<Pair<JSONObject, ThesisContext>>()
        val pending = CompletableDeferred<JSONObject>()
        var holds = false
        val env = ThesisReviewer.live(bench.host) { body, thesis ->
            sent.add(body to thesis)
            if (holds) pending.await() else replyJson()
        }
        assertEquals(bench.desk.owner, env.owner())
        assertEquals("the host's account moment, not a default", bench.desk.accountEpoch, env.epoch())

        val thesis = bench.host.theses.create(
            ThesisDraft(symbol = "NVDA", name = "NVIDIA", isEquity = true, horizon = null, hypothesis = "Margins recover as supply eases", price = 100.0),
            bench.desk.owner, t0)
        val reviewer = ThesisReviewer(thesis.id, env)
        assertEquals("the host's own consent gates the review", refused(Refusal.RiskNotice), reviewer.phase)
        reviewer.review()
        assertTrue("nothing reaches the network before the risk notice is accepted", sent.isEmpty())
        bench.desk.riskNotice = RiskNotice.OUTDATED
        reviewer.reload()
        assertEquals("nor under a notice the person has not read yet", refused(Refusal.RiskNotice), reviewer.phase)

        bench.desk.riskNotice = RiskNotice.ACCEPTED
        reviewer.reload()
        assertEquals(Phase.Ready, reviewer.phase)
        reviewer.review()
        assertEquals(1, sent.size)
        val body = sent.first().first
        assertEquals("the same body a read on the glass sends", "NVDA", body.getString("symbol"))
        assertEquals("equity", body.getString("assetType"))
        assertEquals("profundo", body.getString("level"))
        assertEquals("Review my thesis on NVDA: what does the latest evidence support, what does it challenge, and what is still unknown?", body.getString("question"))
        assertFalse("the thesis travels beside the body, never inside it", body.has("thesis"))
        assertEquals("Margins recover as supply eases", sent.first().second.hypothesis)
        result(reviewer)
        assertEquals("recorded in the book of the host's reader", listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.REVIEWED),
                     kinds(bench.host.theses.thesis(thesis.id, bench.desk.owner)))

        // The host's account moment moves while a second review is in flight: its reply is dropped.
        reviewer.accountChanged()
        holds = true
        val running = launch { reviewer.review() }
        runCurrent()
        assertEquals(2, sent.size)
        bench.desk.accountEpoch += 1
        pending.complete(replyJson())
        running.join()
        assertEquals(1, bench.host.theses.thesis(thesis.id, bench.desk.owner)!!.revisions.count { it.kind == ThesisRevision.Kind.REVIEWED })

        // What the transport throws is a refusal on screen, never a crash.
        val failing = ThesisReviewer(thesis.id, ThesisReviewer.live(bench.host) { _, _ -> throw ApiException(401, "signin_required") })
        failing.review()
        assertEquals(refused(Refusal.SignIn(null)), failing.phase)
        val offline = ThesisReviewer(thesis.id, ThesisReviewer.live(bench.host) { _, _ -> throw IOException("offline") })
        offline.review()
        assertEquals(refused(Refusal.Uncertain), offline.phase)
    }

    // The decision

    @Test fun keepEditAndArchiveAreThePersonsDecisionAndTellTheRemindersTrack() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) { reply() }
        reviewer.review()
        assertTrue(reviewer.decide(ThesisEvents.KEEP))
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.REVIEWED, ThesisRevision.Kind.KEPT), kinds(book.thesis(thesis.id, "account-a")))
        assertTrue(reviewer.decide(ThesisEvents.EDIT))
        assertEquals("handing over to the editor writes nothing by itself", 3, book.thesis(thesis.id, "account-a")?.revisions?.size)
        assertTrue(reviewer.decide(ThesisEvents.ARCHIVE))
        assertEquals(SavedThesis.Status.ARCHIVED, book.thesis(thesis.id, "account-a")?.status)
        assertEquals(listOf(thesis.id, thesis.id, thesis.id), decided.map { it.first })
        assertEquals(listOf("keep", "edit", "archive"), decided.map { it.second })
        book.delete(thesis.id, "account-a")
        assertFalse("a thesis that is gone cannot be decided on", reviewer.decide(ThesisEvents.KEEP))
        assertEquals(refused(Refusal.NotFound), reviewer.phase)
        assertEquals(3, decided.size)
        assertNotEquals(ThesisEvents.KEEP, ThesisEvents.ARCHIVE)
    }

    @Test fun pastReviewsAreNewestFirstAndLeaveOutTheOneOnScreen() = runTest {
        val thesis = seed()
        book.recordReview(thesis.id, "account-a", 101.0, null, "wait", emptyList(), emptyList(), emptyList(), t0 + 2 * day)
        book.recordReview(thesis.id, "account-a", 104.0, null, "review", emptyList(), emptyList(), emptyList(), t0 + 5 * day)
        val reviewer = reviewer(thesis.id) { reply() }
        assertEquals(listOf(104.0, 101.0), reviewer.pastReviews().map { it.price })
        reviewer.review()
        val result = result(reviewer)
        assertEquals(listOf(108.9, 104.0, 101.0), reviewer.pastReviews().map { it.price })
        assertEquals(listOf(104.0, 101.0), reviewer.pastReviews(result.thesis.lastReview).map { it.price })
    }

    @Test fun whatAPastReviewKeptCanBeReadAgain() = runTest {
        val thesis = seed()
        val reviewer = reviewer(thesis.id) {
            reply(review(listOf("Above the 50-day average."), emptyList(), listOf("Whether demand holds."), listOf("news")))
        }
        reviewer.review()
        val kept = reviewer.pastReviews().first()
        assertEquals("the lists the review stored, without the one that held nothing",
                     listOf(ThesisReviewer.StoredList(ThesisReviewer.StoredList.Kind.SUPPORTS, listOf("Above the 50-day average.")),
                            ThesisReviewer.StoredList(ThesisReviewer.StoredList.Kind.UNKNOWNS, listOf("Whether demand holds."))),
                     ThesisReviewer.storedLists(kept))
        val plain = ThesisRevision("r", t0, ThesisRevision.Kind.REVIEWED, 101.0, null, "wait")
        assertTrue("a review that kept no lists says so instead of showing empty ones", ThesisReviewer.storedLists(plain).isEmpty())
    }

    @Test fun aLevelThatIsUsedUpIsSaidInAWholeSentenceInEveryLanguage() {
        // The level's name is an adjective in four languages ("Approfondie", "Vertieft"). The rows these
        // lines used were written for a plural noun and gave "Tes Approfondie reviennent", "Deine Vertieft sind".
        val expected = mapOf(
            "en" to "You used your Deep for now.", "es" to "Ya usaste tu Profundo por ahora.",
            "fr" to "Tu as utilisé ton analyse Approfondie pour le moment.", "pt" to "Já usaste a tua análise Profunda por agora.",
            "it" to "Per ora hai usato la tua analisi Approfondita.", "de" to "Du hast deine Analyse „Vertieft“ vorerst aufgebraucht.")
        val broken = Regex("\\b(Tes|Os teus|I tuoi|Deine) (Rapide|Approfondie|Maximale|Rápida|Profunda|Máxima|Rapida|Approfondita|Massima|Schnell|Vertieft|Maximal)\\b")
        words.inEveryLanguage { language ->
            assertEquals(language, expected[language], ThesisRefusalCopy(Refusal.LevelUsed("profundo", null), words, proPurchasable = true).text)
            for (level in listOf("rapido", "profundo", "maximo")) {
                val dated = ThesisRefusalCopy(Refusal.LevelUsed(level, t0), words, proPurchasable = true).text
                assertTrue("$language: $dated", dated.contains(ThesisCopy(words).longDay(t0)))
                assertTrue("$language: $dated", dated.contains(ThesisCopy(words).levelName(level)))
                assertFalse("$language: $dated", broken.containsMatchIn(dated))
                assertFalse("$language", broken.containsMatchIn(ThesisRefusalCopy(Refusal.LevelUsed(level, null), words, proPurchasable = true).text))
            }
        }
    }
}
