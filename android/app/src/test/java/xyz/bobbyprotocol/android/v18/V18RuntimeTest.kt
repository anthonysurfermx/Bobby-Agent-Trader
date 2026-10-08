package xyz.bobbyprotocol.android.v18

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.MemoryLocalNotifier

/**
 * The host every 1.8 feature builds on. The nudge cases are the session and bridge cases of
 * ios/Bobby/Tests/NucleoNudgeTests.swift; the rest pins what the iOS session does for 1.8 (a sheet
 * handing over to another, a read native starts, a tapped notification waiting for its moment).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class V18RuntimeTest {
    private fun source(key: String, priority: Int, id: String = "$key.one", text: String = "A line", cta: String = "Do it",
                       act: suspend (NucleoNudge) -> Unit = {}): NudgeSource =
        NudgeSource(key, priority, { NucleoNudge(id, text, cta) }, act)

    // The nudge

    @Test fun theSessionCarriesTheNudgeOnlyOnTheAppPageAfterConsentAndNeverUnderASheet() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.nudges.register(source("credits", NudgePriority.CREDITS, text = "2 reads left this week", cta = "See credits"))
        bench.desk.onGlass = false
        assertNull("no page has asked for the session yet, and onboarding never shows a nudge", bench.host.nudgeJson())
        bench.desk.onGlass = true
        val json = bench.host.nudgeJson()
        assertEquals("credits.one", json?.getString("id"))
        assertEquals("2 reads left this week", json?.getString("text"))
        assertEquals("See credits", json?.getString("cta"))
        assertEquals(3, json?.length())
        assertTrue(bench.host.present("account"))
        assertNull("nothing speaks under a sheet", bench.host.nudgeJson())
        assertFalse("and what was on the glass cannot be tapped from under it", bench.nudges.isCurrent("credits.one"))
        bench.closeSheet()
        assertNotNull(bench.host.nudgeJson())
        bench.shell.covered = true
        assertNull("nor under a system prompt", bench.host.nudgeJson())
        bench.shell.covered = false
        bench.desk.riskNotice = RiskNotice.OUTDATED
        assertNull("nothing speaks until the current notice is accepted", bench.host.nudgeJson())
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        assertNull("nothing speaks without consent", bench.host.nudgeJson())
    }

    @Test fun aSessionWithoutAScreenServesNothing() = runTest {
        val bench = V18TestBench(backgroundScope, withScreen = false)
        bench.nudges.register(source("credits", NudgePriority.CREDITS))
        assertNull(bench.host.nudgeJson())
        assertFalse(bench.host.present(V18Routes.CREDITS))
        assertFalse(bench.host.startRead("NVDA", "NVIDIA", true, "How does NVDA look today?"))
        assertEquals("gone", bench.host.nudgeAct("credits.one").getString("status"))
        assertEquals(BillingOutcome.UNAVAILABLE, bench.host.restorePurchases())
        assertFalse(bench.host.billing.value.configured)
    }

    @Test fun thePageReportsAndForwardsThroughTheBridgeAndCannotInventATap() = runTest {
        val bench = V18TestBench(backgroundScope)
        val acted = ArrayList<String>()
        bench.nudges.register(source("credits", NudgePriority.CREDITS) { nudge ->
            acted.add(nudge.id)
            bench.host.present(V18Routes.CREDITS)
        })
        assertNotNull(bench.host.nudgeJson())
        val seen = bench.host.nudgeSeen("credits.one")
        assertEquals(1, seen.getInt("count"))
        assertTrue(seen.getBoolean("active"))
        val unknown = bench.host.nudgeSeen("theses.never-served")
        assertEquals(0, unknown.getInt("count"))
        assertFalse("the page lets go of a nudge native does not have", unknown.getBoolean("active"))
        assertEquals("gone", bench.host.nudgeAct("theses.never-served").getString("status"))
        assertTrue(acted.isEmpty())
        val changesBefore = bench.desk.sessionChanges
        assertEquals("done", bench.host.nudgeAct("credits.one").getString("status"))
        assertEquals(listOf("credits.one"), acted)
        assertEquals("the source opened its screen through the host", V18Routes.CREDITS, bench.shell.sheetRoute)
        assertEquals("the mic closes and the voice stops before a nudge acts", 1, bench.shell.quieted)
        assertEquals("the page is told the nudge is gone", changesBefore + 1, bench.desk.sessionChanges)
        assertNull(bench.host.nudgeJson())
        assertEquals("a second tap never runs the action twice", "gone", bench.host.nudgeAct("credits.one").getString("status"))
        assertEquals(1, acted.size)
    }

    @Test fun nothingIsForwardedBeforeConsent() = runTest {
        val bench = V18TestBench(backgroundScope)
        var acted = 0
        bench.nudges.register(source("credits", NudgePriority.CREDITS) { acted += 1 })
        assertNotNull(bench.host.nudgeJson())
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        assertEquals("gone", bench.host.nudgeAct("credits.one").getString("status"))
        assertEquals(0, acted)
        assertFalse("a late tap retires nothing", bench.nudges.isRetired("credits.one"))
    }

    @Test fun aSourceThatFailsSaysNothingAndATapStillAnswers() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.nudges.register(NudgeSource("broken", 99, { throw IllegalStateException("a source bug") }, {}))
        assertNull("a failing source never takes the session down", bench.host.nudgeJson())
        bench.nudges.unregisterAll()
        bench.nudges.register(source("credits", NudgePriority.CREDITS) { throw IllegalStateException("its screen failed") })
        assertNotNull(bench.host.nudgeJson())
        assertEquals("it was retired before its source ran", "done", bench.host.nudgeAct("credits.one").getString("status"))
        assertTrue(bench.nudges.isRetired("credits.one"))
    }

    @Test fun thePageIsToldWhenAShowingEndsByTheClockAlone() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.nudges.register(source("memory", NudgePriority.MEMORY))
        assertNotNull(bench.host.nudgeJson())
        assertEquals(1, bench.host.nudgeSeen("memory.one").getInt("count"))
        runCurrent()
        assertEquals("the first showing has no end by itself", 0, bench.desk.sessionChanges)
        bench.clock += 3_600_000L
        assertNotNull(bench.host.nudgeJson())
        val second = bench.host.nudgeSeen("memory.one")
        assertEquals(2, second.getInt("count"))
        assertTrue("the showing in progress stays", second.getBoolean("active"))
        bench.host.nudgeSeen("memory.one")
        // Two showings nobody answered: it rests once this showing is over, and the page must hear it.
        advanceTimeBy(bench.nudges.policy.showingGapMillis)
        runCurrent()
        assertEquals(0, bench.desk.sessionChanges)
        bench.clock += bench.nudges.policy.showingGapMillis + 1_000L
        advanceTimeBy(1_001L)
        runCurrent()
        assertEquals("one refresh, however often the page redrew it", 1, bench.desk.sessionChanges)
        assertNull(bench.host.nudgeJson())
    }

    // Sheets

    @Test fun oneSheetHandsOverToAnotherAndThereAreNeverTwo() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.host.switchSheet(V18Routes.THESES)
        assertEquals("with nothing open it opens at once", V18Routes.THESES, bench.host.sheetRoute)
        assertFalse("a second sheet is refused while one is up", bench.host.present(V18Routes.CREDITS))
        bench.host.switchSheet(V18Routes.THESIS_EDITOR)
        assertNull("the open sheet goes away first", bench.shell.sheetRoute)
        runCurrent()
        assertEquals("then the next one presents", V18Routes.THESIS_EDITOR, bench.shell.sheetRoute)
        assertEquals(listOf(V18Routes.THESES, V18Routes.THESIS_EDITOR), bench.shell.opened)
        bench.host.closeSheet()
        runCurrent()
        assertNull("a plain close hands over to nothing", bench.shell.sheetRoute)
        assertFalse("a route nobody draws is never opened", bench.host.present("somewhere-else"))
        assertTrue("the existing sheets open through the same door", bench.host.present("paywall"))
    }

    @Test fun aHandOverBelongsToTheAccountThatAskedForIt() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.host.present("account")
        bench.shell.onClosed = {
            // The account changes while the first sheet is going away (sign-out from the profile).
            bench.desk.owner = "someone-else"
            bench.desk.accountEpoch += 1
            bench.host.accountChanged()
            bench.host.sheetClosed()
        }
        bench.host.switchSheet(V18Routes.THESES)
        runCurrent()
        assertNull("the next reader does not get the previous reader's screen", bench.shell.sheetRoute)
        assertEquals(listOf("account"), bench.shell.opened)
    }

    // Reads native starts

    @Test fun aReadNativeStartsReachesThePageAsATokenAndTheWrittenQuestion() = runTest {
        val bench = V18TestBench(backgroundScope)
        assertTrue(bench.host.startRead("NVDA", "NVIDIA", true, "What changed in NVDA since I asked?"))
        val start = bench.desk.events("ask.start").single()
        assertEquals("token-1-NVDA", start.getString("token"))
        assertEquals("What changed in NVDA since I asked?", start.getString("question"))
        assertEquals(setOf("token", "question"), start.keys().asSequence().toSet())
        bench.desk.busy = true
        assertFalse("not while a read is running", bench.host.startRead("BTC", "Bitcoin", false, "How does BTC look today?"))
        bench.desk.busy = false
        bench.desk.riskNotice = RiskNotice.OUTDATED
        assertFalse("not before the current notice is accepted", bench.host.startRead("BTC", "Bitcoin", false, "How does BTC look today?"))
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        bench.desk.onGlass = false
        assertFalse("not before the page is there to run it", bench.host.startRead("BTC", "Bitcoin", false, "How does BTC look today?"))
        bench.desk.onGlass = true
        bench.shell.covered = true
        assertFalse(bench.host.startRead("BTC", "Bitcoin", false, "How does BTC look today?"))
        bench.shell.covered = false
        assertFalse("a question is never empty", bench.host.startRead("BTC", "Bitcoin", false, "  "))
        assertEquals(1, bench.desk.events("ask.start").size)
    }

    @Test fun aReadStartedFromASheetWaitsForTheSheetToGo() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.host.present(V18Routes.FOLLOW_UP)
        assertTrue(bench.host.startRead("AMD", "AMD", true, "How does AMD look today?"))
        assertNull("the sheet goes away first", bench.shell.sheetRoute)
        assertTrue("and the page hears about the read only after it heard the sheet closed", bench.desk.events("ask.start").isEmpty())
        runCurrent()
        assertEquals("How does AMD look today?", bench.desk.events("ask.start").single().getString("question"))

        bench.host.present(V18Routes.FOLLOW_UP)
        assertTrue(bench.host.startRead("ETH", "Ethereum", false, "How does ETH look today?"))
        bench.desk.busy = true // another read began in between
        runCurrent()
        assertEquals("the hand-off is dropped rather than queued behind a running read", 1, bench.desk.events("ask.start").size)
    }

    // Reads

    @Test fun aDeliveredReadIsWhatSourcesAndHooksSeeAndNeverTheQuestion() = runTest {
        val bench = V18TestBench(backgroundScope)
        val heard = ArrayList<ReadSummary>()
        val saved = ArrayList<Pair<String, String>>()
        bench.host.onReadDelivered { heard.add(it) }
        bench.host.onReadSaved { requestId, symbol, _ -> saved.add(requestId to symbol) }
        bench.deliver(requestId = "r1", symbol = "NVDA", verdict = "review", price = 131.2,
                      memory = JSONObject().put("recorded", true).put("asks", 3).put("lastAskedDaysAgo", 5).put("changeSinceLastAskPct", 4.2))
        val summary = heard.single()
        assertEquals(ReadSummary("r1", "NVDA", "NVIDIA", true, "review", 131.2, "2026-10-07T12:00:00Z", "A headline", "A reason", "A risk", "A level"), summary)
        assertFalse("no question text anywhere in what 1.8 keeps", summary.toString().contains("own words"))
        assertEquals(summary, bench.host.readSummary("r1"))
        val read = bench.nudges.lastRead
        assertEquals("NVDA", read?.symbol)
        assertEquals("review", read?.verdict)
        assertEquals(false, read?.saved)
        assertEquals(bench.clock, read?.atMillis)
        assertEquals(MemoryReceipt(true, 3, 5, 4.2), read?.memory)
        assertEquals(1, bench.nudges.readsThisLaunch)
        assertEquals("the page hears the session changed", 1, bench.desk.sessionChanges)

        bench.host.readSaved("other", "BTC")
        assertEquals(false, bench.nudges.lastRead?.saved)
        bench.host.readSaved("r1", "NVDA")
        assertEquals(true, bench.nudges.lastRead?.saved)
        assertEquals(listOf("other" to "BTC", "r1" to "NVDA"), saved)

        bench.host.readDelivered(JSONObject().put("status", "quota"), ReadOrigin.PERSON)
        bench.host.readDelivered(bench.read(requestId = "r2").put("status", "error"), ReadOrigin.PERSON)
        assertEquals("only a delivered read counts", 1, heard.size)
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        assertNull("no summary without consent", bench.host.readSummary("r1"))
    }

    @Test fun aReadWithoutAMarketPriceUsesTheEvidencePriceAndNeverAZero() = runTest {
        val bench = V18TestBench(backgroundScope)
        val evidenceOnly = bench.read(requestId = "r1", price = null)
        evidenceOnly.getJSONObject("technicals").put("price", 118.0)
        bench.host.readDelivered(evidenceOnly, ReadOrigin.PERSON)
        assertEquals(118.0, bench.host.readSummary("r1")?.price ?: 0.0, 0.0)
        bench.deliver(requestId = "r2", price = null)
        assertNull("a value the app does not have is not shown", bench.host.readSummary("r2")?.price)
        for (i in 3..9) bench.deliver(requestId = "r$i")
        assertNull("the last five only", bench.host.readSummary("r2"))
        assertNotNull(bench.host.readSummary("r9"))
    }

    // Who wrote the words, and what they said about how long they are looking (slice 1 of the follow-ups)

    @Test fun aDeliveredReadSaysTheHorizonTheQuestionNamedAndASaveTheReviewChosen() = runTest {
        val bench = V18TestBench(backgroundScope)
        val heard = ArrayList<ReadSummary>()
        val reviews = ArrayList<Int?>()
        bench.host.onReadDelivered { heard.add(it) }
        bench.host.onReadSaved { _, _, reviewHours -> reviews.add(reviewHours) }
        bench.deliver(requestId = "r1")
        assertNull("a reply that names none says none", heard.last().horizon)
        for (horizon in listOf("intraday", "week", "month", "long", "unspecified")) {
            bench.host.readDelivered(bench.read(requestId = "h-$horizon").put("sufficiency", JSONObject().put("horizon", horizon).put("level", "ok")), ReadOrigin.PERSON)
            assertEquals(horizon, heard.last().horizon)
            assertEquals("kept with the read", horizon, bench.host.readSummary("h-$horizon")?.horizon)
        }
        assertEquals(setOf("intraday", "week", "month", "long", "unspecified"), ReadSummary.HORIZONS)
        // One of the desk's five values or nothing: never a sentence, never the question.
        bench.host.readDelivered(bench.read(requestId = "h-odd").put("sufficiency", JSONObject().put("horizon", "until the new chips ship")), ReadOrigin.PERSON)
        assertNull(heard.last().horizon)
        bench.host.readDelivered(bench.read(requestId = "h-number").put("sufficiency", JSONObject().put("horizon", 7)), ReadOrigin.PERSON)
        assertNull(heard.last().horizon)
        assertFalse(heard.joinToString().contains("own words"))
        // The review chosen on a save: the hours when there was a choice, nothing when there was none.
        bench.host.readSaved("r1", "NVDA")
        bench.host.readSaved("r1", "NVDA", 168)
        assertEquals(listOf<Int?>(null, 168), reviews)
    }

    @Test fun aDeliveredReadSaysWhoStartedItAndNothingSaysItForARestoredOne() = runTest {
        val bench = V18TestBench(backgroundScope)
        val heard = ArrayList<ReadSummary>()
        bench.host.onReadDelivered { heard.add(it) }
        bench.deliver(requestId = "r1")
        assertEquals("a read nobody marked is the person's own question", ReadOrigin.PERSON, heard.last().origin)
        for ((index, origin) in ReadOrigin.entries.withIndex()) {
            bench.host.readDelivered(bench.read(requestId = "o$index"), origin)
            assertEquals(origin, heard.last().origin)
            assertEquals("kept with the read, for a feature that asks later", origin, bench.host.readSummary("o$index")?.origin)
        }
        assertFalse("who started it is not the question: nothing of the words is kept", heard.joinToString().contains("own words"))
        bench.host.readDelivered(JSONObject().put("status", "quota"), ReadOrigin.FOLLOW_UP)
        assertEquals("only a delivered read counts", 1 + ReadOrigin.entries.size, heard.size)
    }

    @Test fun pickingTheQuestionBobbyWroteIsToldByItsAssetAndNeverAfterTheHostIsGone() = runTest {
        val bench = V18TestBench(backgroundScope)
        val picked = ArrayList<String>()
        val stop = bench.host.onNextQuestionPicked { picked.add(it) }
        bench.host.onNextQuestionPicked { throw IllegalStateException("one listener failing never stops the others or the read") }
        bench.host.nextQuestionPicked("NVDA")
        assertEquals(listOf("NVDA"), picked)
        stop()
        bench.host.nextQuestionPicked("BTC")
        assertEquals("a listener that left hears nothing", listOf("NVDA"), picked)
        val late = ArrayList<String>()
        bench.host.onNextQuestionPicked { late.add(it) }
        bench.host.close()
        bench.host.nextQuestionPicked("ETH")
        assertTrue(late.isEmpty())
    }

    @Test fun bobbyOffersItsOneTapQuestionsUntilARuleSaysTheNextReadWouldBeRefused() = runTest {
        val bench = V18TestBench(backgroundScope)
        val receipt = JSONObject().put("tier", "free").put("remaining", 0).put("paywall", true)
        assertSame(OneTapRule.ALWAYS, bench.host.oneTap)
        assertTrue("until a rule is set, a read hands back its question", bench.host.offersOneTapAfterRead(receipt))
        assertTrue("and a reply without a receipt too", bench.host.offersOneTapAfterRead(null))
        assertTrue(bench.host.offersOneTapOnHome())

        val asked = ArrayList<JSONObject?>()
        var homeOpen = true
        bench.host.oneTap = object : OneTapRule {
            override fun afterRead(access: JSONObject?): Boolean { asked.add(access); return access != null && access.optInt("remaining") > 0 }
            override fun onHome(): Boolean = homeOpen
        }
        assertFalse(bench.host.offersOneTapAfterRead(receipt))
        assertFalse(bench.host.offersOneTapAfterRead(null))
        assertTrue(bench.host.offersOneTapAfterRead(JSONObject().put("remaining", 3)))
        assertEquals("the rule sees the read's own receipt, as it came", listOf(receipt, null), asked.take(2))
        assertTrue(bench.host.offersOneTapOnHome())
        homeOpen = false
        assertFalse(bench.host.offersOneTapOnHome())

        // A rule that fails: after a read nothing is offered (only a chip is lost); the home stays as it was.
        bench.host.oneTap = object : OneTapRule {
            override fun afterRead(access: JSONObject?): Boolean = throw IllegalStateException("no meter")
            override fun onHome(): Boolean = throw IllegalStateException("no meter")
        }
        assertFalse(bench.host.offersOneTapAfterRead(receipt))
        assertTrue(bench.host.offersOneTapOnHome())
    }

    // Accounts and consent

    @Test fun anotherReaderStartsWithNothingOfThePreviousOne() = runTest {
        val bench = V18TestBench(backgroundScope)
        var changes = 0
        bench.host.onAccountChanged { changes += 1 }
        bench.nudges.register(NudgeSource("theses", NudgePriority.THESES, { moment -> moment.lastRead?.let { NucleoNudge("theses.write", "Why ${it.symbol}?", "Write it") } }, {}))
        bench.deliver(requestId = "r1")
        bench.host.focus.thesisId = "t1"
        bench.host.noteTap(mapOf(LocalNotice.KIND to "thesis-review"))
        val fence = bench.host.fence()
        assertTrue(fence.isCurrent)
        assertNotNull(bench.host.nudgeJson())

        bench.changeAccount("account-b")
        assertEquals("account-b", bench.nudges.owner)
        assertEquals(1, changes)
        assertNull("the moment is the previous reader's", bench.host.nudgeJson())
        assertNull(bench.host.readSummary("r1"))
        assertNull(bench.host.focus.takeThesisId())
        assertNull("a tap that had not opened belongs to whoever tapped it", bench.host.takeNotificationTap())
        assertFalse("a late reply for the previous account is dropped", fence.isCurrent)
        assertEquals(V18Reader.tag("account-b"), bench.host.readerTag)
        assertEquals("local", V18Reader.tag(null))
        assertEquals(16, bench.host.readerTag.length)
        assertFalse("the tag is never the account id", bench.host.readerTag.contains("account"))
    }

    @Test fun withdrawingTheNoticeForgetsTheMomentAndFencesLateReplies() = runTest {
        val bench = V18TestBench(backgroundScope)
        var withdrawn = 0
        val stop = bench.host.onConsentWithdrawn { withdrawn += 1 }
        bench.deliver(requestId = "r1")
        val fence = bench.host.fence()
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        bench.host.consentWithdrawn()
        assertEquals(1, withdrawn)
        assertNull(bench.nudges.lastRead)
        assertFalse(fence.isCurrent)
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        assertNull("accepting again does not bring the old read back", bench.host.readSummary("r1"))
        assertFalse(fence.isCurrent)
        stop()
        bench.host.consentWithdrawn()
        assertEquals("a listener that stopped listening hears nothing", 1, withdrawn)
    }

    @Test fun deletingAnAccountRemovesItsThesesAndNudgeHistoryAndOnlyIts() = runTest {
        val bench = V18TestBench(backgroundScope)
        val deleted = ArrayList<String>()
        bench.host.onAccountDeleted { throw IllegalStateException("one feature's cleanup fails") }
        bench.host.onAccountDeleted { deleted.add(it) }
        bench.host.theses.create(ThesisDraft("NVDA", "NVIDIA", true, null, "Mine"), "account-a", bench.clock)
        bench.host.theses.create(ThesisDraft("BTC", "Bitcoin", false, null, "Theirs"), "account-b", bench.clock)
        bench.host.theses.create(ThesisDraft("ETH", "Ethereum", false, null, "A guest's"), null, bench.clock)
        bench.host.theses.declineLocal("account-a")
        bench.nudges.owner = "account-a"
        bench.nudges.retire("credits.gift.5")
        bench.host.accountDeleted("account-a")
        assertTrue(bench.host.theses.all("account-a").isEmpty())
        assertNull(bench.store.getString(ThesisBook.key("account-a")))
        assertNull(bench.store.getString(ThesisBook.adoptionKey("account-a")))
        assertNull(bench.store.getString(NudgeCenter.storeKey("account-a")))
        assertEquals(1, bench.host.theses.all("account-b").size)
        assertEquals(1, bench.host.theses.all(null).size)
        assertEquals("the other features are told, even when one of them fails", listOf("account-a"), deleted)
    }

    @Test fun deleteEverythingTellsEveryFeatureForTheCurrentReader() = runTest {
        val bench = V18TestBench(backgroundScope)
        val erased = ArrayList<String?>()
        bench.host.onEraseEverything { erased.add(it) }
        bench.host.eraseEverything()
        bench.changeAccount("account-a")
        bench.host.eraseEverything()
        assertEquals(listOf(null, "account-a"), erased)
        assertEquals(2, bench.desk.sessionChanges)
    }

    // Notification taps and links

    @Test fun aTappedNotificationWaitsForTheGlassAndIsHonouredOnce() = runTest {
        val bench = V18TestBench(backgroundScope)
        val opened = ArrayList<Map<String, String>>()
        bench.host.onNotificationTap("thesis-review") { opened.add(it) }
        val tap = mapOf(LocalNotice.KIND to "thesis-review", "thesisId" to "3fa85f64-5717-4562-b3fc-2c963f66afa6")
        bench.desk.onGlass = false // a cold start: the page has not asked for its session yet
        bench.host.noteTap(tap)
        runCurrent()
        assertTrue(opened.isEmpty())
        bench.desk.onGlass = true
        bench.shell.active = false
        bench.host.pageReady(); runCurrent()
        assertTrue("not while the app is behind", opened.isEmpty())
        bench.shell.active = true
        bench.host.present("account")
        bench.host.appBecameActive(); runCurrent()
        assertTrue("not under a sheet", opened.isEmpty())
        bench.shell.voiceBusy = true
        bench.closeSheet(); runCurrent()
        assertTrue("not while Bobby is listening or speaking", opened.isEmpty())
        bench.shell.voiceBusy = false
        bench.desk.busy = true
        bench.host.voiceIdle(); runCurrent()
        assertTrue("not while a read is running", opened.isEmpty())
        bench.desk.busy = false
        bench.desk.riskNotice = RiskNotice.OUTDATED
        bench.host.readFinished(); runCurrent()
        assertTrue("not before the current notice is accepted", opened.isEmpty())
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        bench.host.readFinished(); runCurrent()
        assertTrue("and not before the page that just loaded has woken up", opened.isEmpty())
        advanceTimeBy(V18Runtime.SETTLE_MS); runCurrent()
        assertEquals(listOf(tap), opened)
        bench.host.appBecameActive(); runCurrent()
        assertEquals("consumed once: a later foreground never replays it", 1, opened.size)
        assertNull(bench.host.takeNotificationTap())
    }

    @Test fun aTapOpensOverAPageThatHasWokenUpNotOverOneThatOnlyAskedForItsSession() = runTest {
        // A cold start from a notification. The page asks for its session first and wakes up after;
        // a sheet over it stops its clock, so a board opened at once would sit over a glass that
        // never drew, and the question its row asks would reach a page that is not listening yet.
        val bench = V18TestBench(backgroundScope)
        val opened = ArrayList<Map<String, String>>()
        bench.host.onNotificationTap("follow-up") { opened.add(it); bench.host.present(V18Routes.FOLLOW_UP) }
        val tap = mapOf(LocalNotice.KIND to "follow-up", "step" to "week")
        bench.desk.onGlass = false
        bench.host.noteTap(tap)
        bench.desk.onGlass = true
        bench.host.pageReady(); runCurrent()
        assertTrue("the page only just asked for its session", opened.isEmpty())
        advanceTimeBy(V18Runtime.SETTLE_MS - 1); runCurrent()
        assertTrue("it is still waking up", opened.isEmpty())

        // The person opens the profile meanwhile: the page stands still under it, so its time starts over.
        bench.host.present("account")
        advanceTimeBy(10_000L); runCurrent()
        assertTrue("a page under a sheet does not wake up, however long it waits", opened.isEmpty())
        bench.closeSheet(); runCurrent()
        advanceTimeBy(V18Runtime.SETTLE_MS - 1); runCurrent()
        assertTrue(opened.isEmpty())
        advanceTimeBy(1); runCurrent()
        assertEquals("once it has had its time in front, the tap opens", listOf(tap), opened)
        assertEquals(V18Routes.FOLLOW_UP, bench.shell.sheetRoute)

        // The app going behind starts the wait over too, and coming back resumes it.
        bench.closeSheet(); runCurrent()
        bench.host.pageReady()
        bench.host.noteTap(tap); runCurrent()
        bench.shell.active = false
        advanceTimeBy(V18Runtime.SETTLE_MS * 3); runCurrent()
        assertEquals("nothing opens behind", 1, opened.size)
        bench.shell.active = true
        bench.host.appBecameActive(); runCurrent()
        advanceTimeBy(V18Runtime.SETTLE_MS); runCurrent()
        assertEquals(2, opened.size)

        // A page that has been on the glass all along is not made to wait again.
        bench.closeSheet(); runCurrent()
        bench.host.noteTap(tap); runCurrent()
        assertEquals("a warm tap opens at once", 3, opened.size)
    }

    @Test fun aQuestionThePageDidNotTakeIsOfferedAgainUntilItAsksAndNeverTwice() = runTest {
        val bench = V18TestBench(backgroundScope)
        // The page is not on its idle home yet (it is waking up, or the sheet has only just left):
        // it lets `ask.start` pass without a word, and the token stays unused.
        bench.desk.pageTakesAskStart = false
        bench.host.present(V18Routes.FOLLOW_UP)
        assertTrue(bench.host.startRead("NVDA", "NVIDIA", true, "How does NVDA look today?"))
        runCurrent()
        val first = bench.desk.events("ask.start").single()
        val token = first.getString("token")
        assertTrue(bench.desk.tokenWaiting(token))

        advanceTimeBy(V18Runtime.ASK_OFFER_MS); runCurrent()
        val offers = bench.desk.events("ask.start")
        assertEquals("the page did not ask: the same question is offered again", 2, offers.size)
        assertEquals("with the same single-use token, so it can only ever be asked once", token, offers[1].getString("token"))
        assertEquals("How does NVDA look today?", offers[1].getString("question"))

        // Not while something is over the glass: the offer waits for the next turn.
        bench.host.present("account")
        advanceTimeBy(V18Runtime.ASK_OFFER_MS); runCurrent()
        assertEquals(2, bench.desk.events("ask.start").size)
        bench.closeSheet(); runCurrent()
        advanceTimeBy(V18Runtime.ASK_OFFER_MS); runCurrent()
        assertEquals(3, bench.desk.events("ask.start").size)

        // The page asks: its `ask` used the token, and nothing more is sent.
        bench.desk.pageAsks(token)
        advanceTimeBy(V18Runtime.ASK_OFFER_MS * 10); runCurrent()
        assertEquals("a question that was taken is never offered again", 3, bench.desk.events("ask.start").size)

        // A page that never takes it is not asked for ever.
        assertTrue(bench.host.startRead("BTC", "Bitcoin", false, "How does BTC look today?"))
        advanceTimeBy(V18Runtime.ASK_OFFER_MS * 60); runCurrent()
        assertEquals("the first offer and five more, then it lets go", 3 + 1 + V18Runtime.ASK_OFFERS, bench.desk.events("ask.start").size)

        // Another reader takes the phone: the previous one's question is not offered to them.
        assertTrue(bench.host.startRead("ETH", "Ethereum", false, "How does ETH look today?"))
        val before = bench.desk.events("ask.start").size
        bench.changeAccount("account-b")
        advanceTimeBy(V18Runtime.ASK_OFFER_MS * 10); runCurrent()
        assertEquals(before, bench.desk.events("ask.start").size)

        // A page on its idle home takes it at once: one event, as before.
        val idle = V18TestBench(backgroundScope)
        assertTrue(idle.host.startRead("NVDA", "NVIDIA", true, "What changed in NVDA since I asked?"))
        advanceTimeBy(V18Runtime.ASK_OFFER_MS * 10); runCurrent()
        assertEquals(1, idle.desk.events("ask.start").size)
    }

    @Test fun aSecondHostTakesTheGlassAndTheFirstNeverSpeaksWithItsLines() = runTest {
        // The nudge centre is the process's. If a second activity is ever built while the first is
        // alive, its features register on the same centre; when it goes away its lines must go with
        // it, or the first glass would show a line whose tap retires it and opens nothing.
        val store = MemoryKeyValueStore()
        val nudges = NudgeCenter(store) { 1_800_000_000_000L }
        val deskA = FakeDesk(); val shellA = FakeShell()
        val hostA = V18Runtime(deskA, store, nudges, MemoryLocalNotifier { 1_800_000_000_000L }, backgroundScope, ReadShelf(), V18Taps()) { 1_800_000_000_000L }
        hostA.start(); hostA.attach(shellA)
        var actedByA = 0
        hostA.nudges.register(source("credits", NudgePriority.CREDITS, act = { actedByA += 1; hostA.present(V18Routes.CREDITS) }))
        assertEquals("credits.one", hostA.currentNudge()?.id)

        val deskB = FakeDesk(); val shellB = FakeShell()
        val hostB = V18Runtime(deskB, store, nudges, MemoryLocalNotifier { 1_800_000_000_000L }, backgroundScope, ReadShelf(), V18Taps()) { 1_800_000_000_000L }
        hostB.start(); hostB.attach(shellB)
        assertTrue("the newer host starts from a clean centre", nudges.sourceKeys.isEmpty())
        var actedByB = 0
        hostB.nudges.register(source("credits", NudgePriority.CREDITS, act = { actedByB += 1; hostB.present(V18Routes.CREDITS) }))
        assertEquals("credits.one", hostB.currentNudge()?.id)

        // The second activity goes away (Back).
        hostB.close()
        assertTrue("its lines go with it", nudges.sourceKeys.isEmpty())
        assertNull("the first glass says nothing rather than something it cannot honour", hostA.currentNudge())
        assertEquals("gone", hostA.nudgeAct("credits.one").getString("status"))
        assertFalse("a tap on nothing retires nothing", nudges.isRetired("credits.one"))
        assertEquals(0, actedByA + actedByB)
        assertTrue(shellA.opened.isEmpty() && shellB.opened.isEmpty())

        // The other order: the older host closing does not take the newer one's lines.
        val hostC = V18Runtime(FakeDesk(), store, nudges, MemoryLocalNotifier { 1_800_000_000_000L }, backgroundScope, ReadShelf(), V18Taps()) { 1_800_000_000_000L }
        hostC.start(); hostC.attach(FakeShell())
        hostC.nudges.register(source("credits", NudgePriority.CREDITS))
        hostA.close()
        assertEquals("credits.one", hostC.currentNudge()?.id)
    }

    @Test fun theGlassIsBusyWhileBobbyListensSpeaksOrAnswers() = runTest {
        val bench = V18TestBench(backgroundScope)
        assertFalse(bench.host.glassBusy)
        bench.shell.voiceBusy = true
        assertTrue(bench.host.glassBusy)
        bench.shell.voiceBusy = false
        bench.desk.busy = true
        assertTrue(bench.host.glassBusy)
        bench.desk.busy = false
        assertFalse(bench.host.glassBusy)
    }

    @Test fun aLanguageChangeIsHeardByWhoeverListensUntilTheHostCloses() = runTest {
        val bench = V18TestBench(backgroundScope)
        var heard = 0
        val stop = bench.host.onLanguageChanged { heard += 1 }
        bench.host.onLanguageChanged { throw IllegalStateException("one listener failing never stops the others") }
        bench.desk.language = "es"
        bench.host.languageChanged()
        assertEquals(1, heard)
        stop()
        bench.host.languageChanged()
        assertEquals(1, heard)
    }

    @Test fun aNotificationPlannedForAnotherReaderOpensNothing() = runTest {
        val bench = V18TestBench(backgroundScope)
        val opened = ArrayList<Map<String, String>>()
        bench.changeAccount("account-a")
        bench.host.onNotificationTap("follow-up") { opened.add(it) }
        bench.host.noteTap(mapOf(LocalNotice.KIND to "follow-up", LocalNotice.OWNER to V18Reader.tag("account-b")))
        runCurrent()
        assertTrue(opened.isEmpty())
        assertNull("and it does not wait for that reader either", bench.host.takeNotificationTap())
        bench.host.noteTap(mapOf(LocalNotice.KIND to "follow-up", LocalNotice.OWNER to bench.host.readerTag, "step" to "asset"))
        runCurrent()
        assertEquals("asset", opened.single()["step"])
        bench.host.noteTap(mapOf(LocalNotice.KIND to "a-kind-nobody-registered"))
        runCurrent()
        assertNotNull("a tap whose feature is not there yet keeps waiting", bench.host.takeNotificationTap())
    }

    @Test fun aTapItsFeatureRefusesIsNeverStoredSoItCannotReplaceAGoodOne() = runTest {
        val bench = V18TestBench(backgroundScope)
        val opened = ArrayList<Map<String, String>>()
        bench.host.onNotificationTap("thesis-review", accepts = { it["thesisId"]?.length == 36 }) { opened.add(it) }
        val good = mapOf(LocalNotice.KIND to "thesis-review", "thesisId" to "3fa85f64-5717-4562-b3fc-2c963f66afa6")
        bench.shell.active = false // still coming to the front: the tap waits
        assertTrue(bench.host.noteTap(good))
        assertFalse("refused by its own feature", bench.host.noteTap(mapOf(LocalNotice.KIND to "thesis-review", "thesisId" to "garbage")))
        assertFalse("not a notice of ours", bench.host.noteTap(mapOf("thesisId" to "3fa85f64-5717-4562-b3fc-2c963f66afa6")))
        assertFalse("a kind nobody listens for does not take a waiting tap's place", bench.host.noteTap(mapOf(LocalNotice.KIND to "a-kind-nobody-registered")))
        bench.shell.active = true
        bench.host.appBecameActive(); runCurrent()
        assertEquals("the good tap was still the one waiting", listOf(good), opened)

        // A feature that fails while judging keeps nothing.
        bench.host.onNotificationTap("follow-up", accepts = { throw IllegalStateException("broken") }) { opened.add(it) }
        assertFalse(bench.host.noteTap(mapOf(LocalNotice.KIND to "follow-up")))
        // A tap kept before its feature was listening is the feature's to judge when it arrives.
        assertTrue(bench.host.noteTap(mapOf(LocalNotice.KIND to "later-kind", "id" to "bad")))
        bench.host.onNotificationTap("later-kind", accepts = { it["id"] == "good" }) { opened.add(it) }
        runCurrent()
        assertNull(bench.host.takeNotificationTap())
        assertEquals(1, opened.size)
    }

    @Test fun aNoticeDueWhileTheAppIsInFrontAsksItsFeature() = runTest {
        val bench = V18TestBench(backgroundScope)
        val payload = mapOf(LocalNotice.KIND to "follow-up")
        assertTrue("shown when no feature objects", bench.host.allowsDueNotice(payload))
        bench.host.onNotificationDue("follow-up") { false }
        assertFalse("the glass says it instead", bench.host.allowsDueNotice(payload))
        assertTrue(bench.host.allowsDueNotice(mapOf(LocalNotice.KIND to "thesis-review")))
        bench.shell.active = false
        assertTrue("behind, it is always shown", bench.host.allowsDueNotice(payload))
    }

    @Test fun aLinkGoesToTheFirstFeatureThatKeepsIt() = runTest {
        val bench = V18TestBench(backgroundScope)
        val kept = ArrayList<String>()
        bench.host.noteLink("https://bobbyprotocol.xyz/i/K7QM2XWP") // before any feature registered
        bench.host.onLink { false }
        bench.host.onLink { url -> kept.add(url); true }
        assertEquals("a handler that registers before the link is claimed still gets it", listOf("https://bobbyprotocol.xyz/i/K7QM2XWP"), kept)
        bench.host.onLink { url -> kept.add("late:$url"); true }
        assertEquals("kept once", 1, kept.size)
        bench.host.noteLink("https://bobbyprotocol.xyz/i/H4TNRD9B")
        assertEquals(2, kept.size)
    }

    // The rest of the surface

    @Test fun wordsAreFilledAfterTheyAreLocalized() = runTest {
        val bench = V18TestBench(backgroundScope)
        assertEquals("NVDA +2.3% since you asked", bench.host.text("{0} {1} since you asked", "{0} {1} desde que preguntaste", "NVDA", "+2.3%"))
        bench.desk.language = "es"
        assertEquals("Recibes 30 días Pro por cada cuenta nueva.", bench.host.text("You get {0} Pro days per new account.", "Recibes {0} días Pro por cada cuenta nueva.", 30))
        assertEquals("Créditos", bench.host.text("Credits", "Créditos"))
        assertEquals("es", bench.host.language)
    }

    @Test fun aFeatureKeepsOneCentrePerHostAndReachesTheScreenThroughIt() = runTest {
        val bench = V18TestBench(backgroundScope)
        class Centre
        val first = bench.host.service("reminders") { Centre() }
        assertSame(first, bench.host.service("reminders") { Centre() })
        bench.host.haptic("success"); bench.host.share("a link"); bench.host.copy("K7QM2XWP"); bench.host.signIn("google")
        assertTrue(bench.host.openExternal("https://bobbyprotocol.xyz/privacy"))
        bench.host.openNotificationSettings()
        bench.host.switchBriefingNotifications(true)
        bench.shell.restoreOutcome = BillingOutcome.SUBSCRIBED
        assertEquals(BillingOutcome.SUBSCRIBED, bench.host.restorePurchases())
        assertEquals(listOf("success"), bench.shell.haptics)
        assertEquals(listOf("a link"), bench.shell.shared)
        assertEquals(listOf("K7QM2XWP"), bench.shell.copied)
        assertEquals(listOf("google"), bench.shell.signIns)
        assertEquals(1, bench.shell.notificationSettingsOpened)
        assertTrue(bench.host.briefingNotifications)
        assertEquals("rapido", bench.host.analysisLevel)
        val body = bench.host.deskBody("NVDA", "Review my thesis", true)
        assertEquals("equity", body.getString("assetType"))
        assertEquals("rapido", body.getString("level"))
        assertFalse("a plain body never carries a thesis", body.has("thesis"))
        assertEquals(bench.clock, bench.host.now())
    }

    @Test fun shortcutsAreForgottenOneByOneOrAllAtOnce() = runTest {
        val bench = V18TestBench(backgroundScope)
        assertFalse("nothing kept, nothing to forget", bench.host.forgetShortcut("NVDA"))
        bench.desk.shortcuts = listOf("NVDA", "BTC", "ETH")
        assertTrue(bench.host.forgetShortcut("btc"))
        assertEquals(listOf("NVDA", "ETH"), bench.host.shortcuts)
        assertFalse(bench.host.forgetShortcut("BTC"))
        bench.host.clearShortcuts()
        assertTrue(bench.host.shortcuts.isEmpty())
    }

    @Test fun afterTheActivityIsGoneNothingOfItIsCalled() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.nudges.register(source("credits", NudgePriority.CREDITS))
        var opened = 0
        bench.host.onNotificationTap("thesis-review") { opened += 1 }
        bench.host.close()
        bench.host.noteTap(mapOf(LocalNotice.KIND to "thesis-review"))
        runCurrent()
        assertEquals(0, opened)
        assertNull(bench.host.nudgeJson())
        assertFalse(bench.host.present(V18Routes.CREDITS))
        assertFalse(bench.host.fence().isCurrent)
        assertTrue(bench.shell.opened.isEmpty())
    }
}
