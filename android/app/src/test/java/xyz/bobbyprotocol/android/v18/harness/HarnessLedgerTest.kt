package xyz.bobbyprotocol.android.v18.harness

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import java.time.ZoneOffset

/**
 * The harness (1.8), the ledger: small, on the phone, per reader, bounded and erasable.
 * The cases of ios/Bobby/Tests/HarnessLedgerTests.swift, plus what reading the store back must survive.
 */
class HarnessLedgerTest {
    private val t0 = 1_800_000_000_000L
    private val second = 1_000L
    private val day = 86_400_000L
    private val utc = ZoneOffset.UTC

    private fun ask(symbol: String, offsetSeconds: Long, price: Double? = 10.0): HarnessEvent =
        HarnessEvent(HarnessEvent.Kind.ASK, t0 + offsetSeconds * second, symbol = symbol, name = symbol, isEquity = true, price = price)

    private fun symbols(ledger: HarnessLedger): List<String> = ledger.events.mapNotNull { it.symbol }

    @Test fun eventsStayInOrderWhateverOrderTheyArriveIn() {
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 200))
        ledger.note(ask("TSLA", 100))
        ledger.note(ask("AAPL", 300))
        assertEquals(listOf("TSLA", "NVDA", "AAPL"), symbols(ledger))
    }

    @Test fun onlyAValidSymbolAndAUsablePriceAreKept() {
        val ledger = HarnessLedger()
        ledger.note(ask("nvda", 0))
        ledger.note(ask("NVDA; drop table", 1))
        ledger.note(ask("", 2))
        ledger.note(ask("TSLA", 3, price = -4.0))
        ledger.note(ask("AAPL", 4, price = Double.POSITIVE_INFINITY))
        assertEquals(listOf("NVDA", "TSLA", "AAPL"), symbols(ledger))
        assertEquals("a price that makes no sense is no price", listOf(10.0, null, null), ledger.events.map { it.price })
    }

    @Test fun theLedgerIsBoundedInCountAndInTime() {
        val ledger = HarnessLedger()
        for (i in 0 until HarnessLedger.MAX_EVENTS + 40) ledger.note(ask("NVDA", i.toLong()))
        assertEquals(HarnessLedger.MAX_EVENTS, ledger.events.size)
        ledger.note(ask("TSLA", (HarnessLedger.RETENTION_DAYS + 1) * 86_400L))
        assertEquals("what is older than the retention leaves on the next write", listOf("TSLA"), symbols(ledger))
    }

    @Test fun anAssetKnowsItsFirstAndLastQuestion() {
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0, price = 100.0))
        ledger.note(ask("TSLA", 50, price = 200.0))
        ledger.note(ask("NVDA", 100, price = null))
        ledger.note(ask("NVDA", 200, price = 110.0))
        val assets = ledger.assets(since = t0 - second, now = t0 + 300 * second)
        assertEquals("most recently asked first", listOf("NVDA", "TSLA"), assets.map { it.symbol })
        val nvda = assets.first()
        assertEquals(3, nvda.asks)
        assertEquals(100.0, nvda.firstPrice)
        assertEquals(110.0, nvda.lastPrice)
        assertEquals(t0 + 200 * second, nvda.lastAskedAt)
        assertEquals(listOf("NVDA"), ledger.assets(since = t0 + 150 * second, now = t0 + 300 * second).map { it.symbol })
        assertEquals("a symbol is found however it is typed", "NVDA", ledger.asset("nvda", since = t0 - second, now = t0 + 300 * second)?.symbol)
    }

    @Test fun followUpsBelongToTheLatestQuestionThePersonAskedByThemselves() {
        val ledger = HarnessLedger()
        assertNull(ledger.question(t0))
        ledger.note(ask("NVDA", 0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, t0 + 10 * second))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + 20 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        // A tap, an answer and a read Bobby started: none of them takes the question's place.
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + 40 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, t0 + 50 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.PICKED, t0 + 50 * second, symbol = "NVDA"))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 + 60 * second, symbol = "TSLA", name = "TSLA", isEquity = true, price = 10.0, origin = HarnessEvent.Origin.FOLLOW_UP))
        assertEquals("NVDA", ledger.question(t0 + 70 * second)?.symbol)
        assertEquals(t0, ledger.question(t0 + 70 * second)?.at)
        // Their own next question does, a second one about the same read included.
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 + 80 * second, symbol = "TSLA", name = "TSLA", isEquity = true, price = 10.0, thread = true))
        assertEquals("TSLA", ledger.question(t0 + 90 * second)?.symbol)
        assertEquals("the clock decides what has happened yet", "NVDA", ledger.question(t0 + 70 * second)?.symbol)
        // The asset is known from every read, whoever started it (the line on the glass counts from the last one).
        assertEquals(2, ledger.asset("TSLA", since = t0, now = t0 + 90 * second)?.asks)
    }

    @Test fun anAppOpeningIsRefusedAndOnesKeptByAndroid120AreDropped() {
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, t0))
        assertTrue("the ledger does not take one", ledger.isEmpty)
        // A ledger Android 1.2.0 wrote: the openings are not read back, and they leave the phone with the next thing written.
        val raw = OpenStore()
        val store = HarnessStore(raw)
        val key = HarnessStore.key(HarnessStore.PREFIX, null)
        raw.values[key] = JSONObject().put("events", org.json.JSONArray()
            .put(JSONObject().put("kind", "appOpen").put("at", t0))
            .put(JSONObject().put("kind", "ask").put("at", t0 + second).put("symbol", "NVDA").put("name", "NVIDIA").put("isEquity", true).put("price", 187.4))
            .put(JSONObject().put("kind", "appOpen").put("at", t0 + 1_800 * second))).toString()
        val read = store.ledger(null)
        assertEquals("the question is still there, and nothing else", listOf(HarnessEvent.Kind.ASK), read.events.map { it.kind })
        read.note(ask("TSLA", 3_600))
        store.write(read, null)
        assertFalse("no opening is left in what the phone keeps", raw.values.getValue(key).contains("appOpen"))
        assertEquals(listOf("NVDA", "TSLA"), symbols(store.ledger(null)))
    }

    @Test fun onlyARealAnswerIsAnAnswer() {
        val answers = HarnessEvent.Kind.entries.filter { HarnessEvent(it, t0).isAnswer }
        assertEquals("not a tap, and not a pick that answers no follow-up", listOf(HarnessEvent.Kind.RETURNED), answers)
        assertEquals("every kind the contract names, and no other",
                     listOf("ask", "saved", "appOpen", "sent", "opened", "returned", "picked", "thesis"), HarnessEvent.Kind.entries.map { it.raw })
        assertTrue(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "NVDA").isQuestion)
        assertFalse(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "NVDA", origin = HarnessEvent.Origin.FOLLOW_UP).isQuestion)
        assertFalse(HarnessEvent(HarnessEvent.Kind.PICKED, t0, symbol = "NVDA").isQuestion)
    }

    @Test fun aTapWeighsLessThanAQuestionAndAnAnswerAsMuchAsOne() {
        val now = t0 + 60 * second
        fun interest(vararg events: HarnessEvent): Double {
            val ledger = HarnessLedger()
            for (event in events) ledger.note(event)
            return HarnessProfile.make(ledger, now, utc).interest["NVDA"] ?: 0.0
        }
        val question = interest(ask("NVDA", 0))
        val tap = interest(HarnessEvent(HarnessEvent.Kind.OPENED, t0, symbol = "NVDA", step = HarnessStep.ASSET))
        val answer = interest(HarnessEvent(HarnessEvent.Kind.RETURNED, t0, symbol = "NVDA", step = HarnessStep.ASSET))
        assertEquals("they looked and did nothing with it", 0.5, tap / question, 0.001)
        assertEquals("on top of the question, save or pick that answered it", 1.0, answer / question, 0.001)
        assertTrue(tap < answer)
        // Their own second question about the same read counts twice; a read Bobby started counts once.
        val thread = interest(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "NVDA", thread = true))
        assertEquals(2.0, thread / question, 0.001)
        assertEquals(1.0, interest(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "NVDA", origin = HarnessEvent.Origin.FOLLOW_UP)) / question, 0.001)
        assertNull("being shown something says nothing about them", HarnessProfile.WEIGHTS[HarnessEvent.Kind.SENT])
        assertNull(HarnessProfile.WEIGHTS[HarnessEvent.Kind.APP_OPEN])
    }

    @Test fun aThesisRaisesItsAssetAndDoesNotFade() {
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, t0, symbol = "NVDA", horizon = HarnessHorizon.LONG))
        ledger.note(ask("TSLA", 0))
        ledger.note(ask("TSLA", 60))
        var profile = HarnessProfile.make(ledger, t0 + 120 * second, utc)
        assertEquals(2.0, profile.interest["NVDA"] ?: 0.0, 0.001)
        assertEquals("a thesis says more than two questions", "NVDA", profile.favourite(listOf("TSLA", "NVDA")))
        profile = HarnessProfile.make(ledger, t0 + 50 * day, utc)
        assertEquals("it counts while the thesis is active, however long ago it was written", 2.0, profile.interest["NVDA"] ?: 0.0, 0.001)
        assertTrue((profile.interest["TSLA"] ?: 1.0) < 0.05)
        // One thesis, one weight: a pointer written twice is not two theses.
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, t0 + 10 * second, symbol = "NVDA", horizon = HarnessHorizon.LONG))
        assertEquals(2.0, HarnessProfile.make(ledger, t0 + 120 * second, utc).interest["NVDA"] ?: 0.0, 0.001)
    }

    @Test fun interestFadesAndRepeatedActionsWeighMore() {
        val ledger = HarnessLedger()
        ledger.note(ask("OLD", 0))
        ledger.note(ask("NEW", 14 * 86_400L))
        ledger.note(ask("LOVED", 14 * 86_400L))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 14 * day + 5 * second, symbol = "LOVED"))
        val profile = HarnessProfile.make(ledger, t0 + 14 * day + 10 * second, utc)
        assertEquals("two half-lives ago", 0.25, profile.interest["OLD"] ?: 0.0, 0.01)
        assertEquals("LOVED", profile.favourite(listOf("OLD", "NEW", "LOVED")))
        assertEquals("NEW", profile.favourite(listOf("OLD", "NEW")))
        assertNull(profile.favourite(emptyList()))
    }

    @Test fun aKindRestsOnlyWhenShownTwiceAndNeverAnswered() {
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0, symbol = "NVDA", step = HarnessStep.ASSET))
        var profile = HarnessProfile.make(ledger, t0 + 60 * second, utc)
        assertFalse(profile.rests(HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + day, symbol = "NVDA", step = HarnessStep.ASSET))
        // Both were tapped. A tap is kept, and the kind rests all the same.
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + 30 * second, symbol = "NVDA", step = HarnessStep.ASSET, ref = t0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + day + 30 * second, symbol = "NVDA", step = HarnessStep.ASSET, ref = t0 + day))
        profile = HarnessProfile.make(ledger, t0 + 2 * day, utc)
        assertTrue(profile.rests(HarnessStep.ASSET))
        assertFalse(profile.rests(HarnessStep.WEEK))
        assertEquals(2, profile.sent[HarnessStep.ASSET])
        assertNull("two taps are no answer", profile.answered[HarnessStep.ASSET])
        assertEquals("they are still written down", 2, ledger.events(HarnessEvent.Kind.OPENED).size)
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, t0 + day + 60 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        profile = HarnessProfile.make(ledger, t0 + 2 * day, utc)
        assertFalse("one answer is enough", profile.rests(HarnessStep.ASSET))
        assertEquals(1, profile.answered[HarnessStep.ASSET])
        profile = HarnessProfile.make(ledger, t0 + 40 * day, utc)
        assertFalse("after a month the count starts again", profile.rests(HarnessStep.ASSET))
    }

    @Test fun theUnansweredStreakCountsWhatWasShownSinceTheLastAnswer() {
        val ledger = HarnessLedger()
        assertEquals(0, ledger.unansweredStreak(t0).count)
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0, symbol = "NVDA", step = HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, t0 + 60 * second, symbol = "NVDA", step = HarnessStep.ASSET, ref = t0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + day, symbol = "NVDA", step = HarnessStep.SECTOR, sector = "semis"))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + 2 * day, symbol = "NVDA", step = HarnessStep.WEEK))
        var streak = ledger.unansweredStreak(t0 + 3 * day)
        assertEquals("the one they answered ended the streak before it", 2, streak.count)
        assertEquals(t0 + 2 * day, streak.last)
        assertEquals("only what has happened by then", 1, ledger.unansweredStreak(t0 + 30 * second).count)
        // Tapping the last two, and picking a chip in the app, ends nothing.
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + day + 60 * second, symbol = "NVDA", step = HarnessStep.SECTOR, sector = "semis", ref = t0 + day))
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + 2 * day + 60 * second, symbol = "NVDA", step = HarnessStep.WEEK, ref = t0 + 2 * day))
        ledger.note(HarnessEvent(HarnessEvent.Kind.PICKED, t0 + 2 * day + 120 * second, symbol = "NVDA"))
        streak = ledger.unansweredStreak(t0 + 3 * day)
        assertEquals(2, streak.count)
    }

    @Test fun eachReaderHasTheirOwnLedgerAndForgettingRemovesAllOfIt() {
        val raw = OpenStore()
        val store = HarnessStore(raw)
        val mine = HarnessLedger().also { it.note(ask("NVDA", 0)) }
        val local = HarnessLedger().also { it.note(ask("BTC", 0)) }
        store.write(mine, "u1")
        store.write(local, null)
        store.write(HarnessMode.ON, "u1")
        store.write(listOf(HarnessPlanned(HarnessFollowUp(HarnessStep.ASSET, t0, symbol = "NVDA"), handed = true)), "u1")
        assertEquals(listOf("NVDA"), symbols(store.ledger("u1")))
        assertEquals(listOf("BTC"), symbols(store.ledger(null)))
        assertEquals(HarnessLedger(), store.ledger("u2"))
        assertEquals(HarnessMode.ON, store.mode("u1"))
        assertEquals(HarnessMode.UNDECIDED, store.mode(null))
        assertEquals(1, store.plan("u1").size)
        HarnessStore.forgetOwner("u1", raw)
        assertEquals(HarnessLedger(), store.ledger("u1"))
        assertEquals(HarnessMode.UNDECIDED, store.mode("u1"))
        assertEquals(emptyList<HarnessPlanned>(), store.plan("u1"))
        assertEquals("another reader's ledger is untouched", 1, store.ledger(null).events.size)
        assertFalse(raw.values.keys.any { it.contains("u1") })
    }

    @Test fun whatIsStoredHoldsNoQuestionText() {
        val raw = OpenStore()
        val store = HarnessStore(raw)
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        store.write(ledger, null)
        val stored = JSONObject(raw.values.getValue(HarnessStore.key(HarnessStore.PREFIX, null)))
        val event = stored.getJSONArray("events").getJSONObject(0)
        assertEquals("a symbol, a price, a moment: nothing else", setOf("kind", "at", "symbol", "name", "isEquity", "price"), event.keys().asSequence().toSet())
        assertEquals("the keys iOS uses, so both phones keep the same thing", "v18.harness.v1.local", HarnessStore.key(HarnessStore.PREFIX, null))
        assertEquals("v18.harness.mode.u1", HarnessStore.key(HarnessStore.MODE_PREFIX, "u1"))
        assertEquals("v18.harness.plan.u1", HarnessStore.key(HarnessStore.PLAN_PREFIX, "u1"))
    }

    @Test fun whatThePersonSaidAboutTheirHorizonIsKeptAsFixedValuesNeverWords() {
        val raw = OpenStore()
        val store = HarnessStore(raw)
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 10.0,
                                 origin = HarnessEvent.Origin.FOLLOW_UP, horizon = HarnessHorizon.MONTH))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 + second, symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 10.0,
                                 thread = true, horizon = HarnessHorizon.LONG))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 2 * second, symbol = "NVDA", horizonHours = 168))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 3 * second, symbol = "NVDA", horizonHours = 36))
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, t0 + 4 * second, symbol = "NVDA", horizon = HarnessHorizon.LONG))
        store.write(ledger, null)
        assertEquals("it reads back as written", ledger, store.ledger(null))
        val stored = JSONObject(raw.values.getValue(HarnessStore.key(HarnessStore.PREFIX, null))).getJSONArray("events")
        val events = (0 until stored.length()).map { stored.getJSONObject(it) }
        assertEquals("36 hours is not a choice the save offers: it is not kept", listOf(
            setOf("kind", "at", "symbol", "name", "isEquity", "price", "origin", "horizon"),
            setOf("kind", "at", "symbol", "name", "isEquity", "price", "thread", "horizon"),
            setOf("kind", "at", "symbol", "horizonHours"),
            setOf("kind", "at", "symbol"),
            setOf("kind", "at", "symbol", "horizon"),
        ), events.map { it.keys().asSequence().toSet() })
        assertEquals("the words iOS writes, so both phones keep the same thing", "followUp", events[0].getString("origin"))
        assertEquals("month", events[0].getString("horizon"))
        assertEquals(true, events[1].getBoolean("thread"))
        assertEquals(168, events[2].getInt("horizonHours"))
        assertEquals("thesis", events[4].getString("kind"))
        // Every value is one of a handful: a horizon out of the desk's five, 24, 72 or 168 hours.
        assertEquals(listOf("intraday", "week", "month", "long", "unspecified"), HarnessHorizon.entries.map { it.raw })
        assertEquals(setOf(24, 72, 168), HarnessLedger.SAVE_HORIZONS)
        assertNull(HarnessHorizon.named("next quarter, when the new chips ship"))
        assertNull(HarnessHorizon.named(7))
        assertNull(HarnessHorizon.named(null))
        assertEquals(HarnessHorizon.WEEK, HarnessHorizon.named("week"))
        // A store somebody else wrote to is held to the same handful.
        raw.values[HarnessStore.key(HarnessStore.PREFIX, null)] = JSONObject().put("events", org.json.JSONArray()
            .put(JSONObject().put("kind", "ask").put("at", t0).put("symbol", "NVDA").put("horizon", "whenever").put("origin", "someone").put("thread", "yes"))
            .put(JSONObject().put("kind", "saved").put("at", t0 + second).put("symbol", "NVDA").put("horizonHours", 36))).toString()
        val odd = store.ledger(null)
        assertEquals(listOf<HarnessHorizon?>(null, null), odd.events.map { it.horizon })
        assertEquals("an origin nobody wrote is the person's own question: never more quiet than was asked for, never a word kept",
                     listOf<HarnessEvent.Origin?>(null, null), odd.events.map { it.origin })
        assertEquals(listOf<Boolean?>(null, null), odd.events.map { it.thread })
        assertEquals(listOf<Int?>(null, null), odd.events.map { it.horizonHours })
    }

    @Test fun aLedgerWrittenBeforeTheseFieldsExistedStillReads() {
        // What Android 1.2.0 stored: none of origin, thread, horizon, horizonHours, and a tap that it counted as an answer.
        val old = """{"events":[{"kind":"ask","at":1800000000000,"symbol":"NVDA","name":"NVIDIA","isEquity":true,"price":187.4},""" +
            """{"kind":"appOpen","at":1800000600000},""" +
            """{"kind":"sent","at":1800086400000,"symbol":"NVDA","step":"asset"},""" +
            """{"kind":"opened","at":1800086460000,"symbol":"NVDA","step":"asset","ref":1800086400000}]}"""
        val raw = OpenStore()
        raw.values[HarnessStore.key(HarnessStore.PREFIX, null)] = old
        val ledger = HarnessStore(raw).ledger(null)
        assertEquals(listOf(HarnessEvent.Kind.ASK, HarnessEvent.Kind.SENT, HarnessEvent.Kind.OPENED), ledger.events.map { it.kind })
        assertEquals("an ask with no origin is the person's own", "NVDA", ledger.question(t0 + 2 * day)?.symbol)
        assertEquals(187.4, ledger.events.first().price ?: 0.0, 0.0)
        assertEquals("and the tap it held answers nothing now", 1, ledger.unansweredStreak(t0 + 2 * day).count)
        // The plan made from it is the plan of today's rules: the asset was shown, the week is what is left.
        val plan = HarnessPlanner.plan(ledger, t0 + day + 120 * second, utc)
        assertEquals(listOf(HarnessStep.WEEK), plan.map { it.step })
    }

    @Test fun theHorizonsMapToAWaitThatIsNeverShorterThanADay() {
        assertEquals("intraday, week, month, long, unspecified", listOf(1, 3, 7, null, 1), HarnessHorizon.entries.map { it.waitDays })
        assertEquals("weeks, months, year, years", listOf(HarnessHorizon.MONTH, HarnessHorizon.LONG, HarnessHorizon.LONG, HarnessHorizon.LONG),
                     ThesisHorizon.entries.map { HarnessHorizon.ofThesis(it) })
    }

    @Test fun aThesisPointerLastsAsLongAsItsThesisAndTheRestIsStillBounded() {
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, t0, symbol = "NVDA", horizon = HarnessHorizon.LONG))
        ledger.note(ask("OLD", 10))
        for (i in 0 until HarnessLedger.MAX_EVENTS + 40) ledger.note(ask("TSLA", (HarnessLedger.RETENTION_DAYS + 1) * 86_400L + i))
        assertEquals(HarnessLedger.MAX_EVENTS, ledger.events.size)
        assertEquals("neither the sixty days nor the count takes it", listOf<String?>("NVDA"), ledger.events(HarnessEvent.Kind.THESIS).map { it.symbol })
        assertFalse("everything else still goes", ledger.events.any { it.symbol == "OLD" })
        // It goes when its thesis does (HarnessCenter removes it), and with everything else on an erase.
        assertTrue(ledger.remove { it.kind == HarnessEvent.Kind.THESIS })
        assertTrue(ledger.events(HarnessEvent.Kind.THESIS).isEmpty())
    }

    @Test fun whatWasHeldBackUntilTheYesCompletesTheEntryItBelongsTo() {
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 5 * second, symbol = "NVDA"))
        assertTrue(ledger.complete(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "nvda", thread = true, horizon = HarnessHorizon.MONTH)))
        assertTrue(ledger.complete(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 5 * second, symbol = "NVDA", horizonHours = 72)))
        assertEquals(HarnessHorizon.MONTH, ledger.events.first().horizon)
        assertEquals(true, ledger.events.first().thread)
        assertEquals("what was already written stays", 10.0, ledger.events.first().price ?: 0.0, 0.0)
        assertEquals(72, ledger.events.last().horizonHours)
        assertFalse("no entry at that moment", ledger.complete(HarnessEvent(HarnessEvent.Kind.ASK, t0 + second, symbol = "NVDA", horizon = HarnessHorizon.LONG)))
        assertFalse("nor for that asset", ledger.complete(HarnessEvent(HarnessEvent.Kind.ASK, t0, symbol = "TSLA", horizon = HarnessHorizon.LONG)))
        assertEquals("completing never adds one", 2, ledger.events.size)
        assertTrue(ledger.complete(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 5 * second, symbol = "NVDA", horizonHours = 36)))
        assertNull("a review the save does not offer is not kept", ledger.events.last().horizonHours)
    }

    @Test fun theLedgerCanBeReadAsItWasAtAnEarlierMoment() {
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        ledger.note(ask("TSLA", 100))
        assertEquals(listOf("NVDA"), symbols(ledger.upTo(t0 + 50 * second)))
        assertEquals(ledger, ledger.upTo(t0 + 100 * second))
        assertTrue(ledger.upTo(t0 - second).isEmpty)
    }

    @Test fun mergingKeepsEveryEventInOrder() {
        val a = HarnessLedger().also { it.note(ask("NVDA", 100)) }
        val b = HarnessLedger().also { it.note(ask("BTC", 50)); it.note(ask("ETH", 150)) }
        a.merge(b)
        assertEquals(listOf("BTC", "NVDA", "ETH"), symbols(a))
    }

    // Android: what is written is read back whole, and a store that holds something else is an empty ledger.

    @Test fun whatIsStoredIsReadBackWithEveryField() {
        val raw = OpenStore()
        val store = HarnessStore(raw)
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0, price = 187.42))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + day, symbol = "NVDA", step = HarnessStep.SECTOR, sector = "semis"))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, t0 + day + second, symbol = "NVDA", step = HarnessStep.SECTOR, sector = "semis", ref = t0 + day))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 + 2 * day, symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 190.0,
                                 origin = HarnessEvent.Origin.FOLLOW_UP, horizon = HarnessHorizon.WEEK))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 + 2 * day + second, symbol = "NVDA", name = "NVIDIA", isEquity = true, thread = true))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, t0 + 2 * day + 2 * second, symbol = "NVDA", horizonHours = 72))
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, t0 + 2 * day + 3 * second, symbol = "NVDA", horizon = HarnessHorizon.MONTH))
        store.write(ledger, "u1")
        assertEquals(ledger, store.ledger("u1"))
        val plan = listOf(
            HarnessPlanned(HarnessFollowUp(HarnessStep.ASSET, t0 + day, "NVDA", "NVIDIA", true, days = 2), handed = true),
            HarnessPlanned(HarnessFollowUp(HarnessStep.SECTOR, t0 + 2 * day, "NVDA", "NVIDIA", true, sector = "semis"), handed = false),
            HarnessPlanned(HarnessFollowUp(HarnessStep.WEEK, t0 + 5 * day, "NVDA", "NVIDIA", true, others = 3), handed = false),
        )
        store.write(plan, "u1")
        assertEquals(plan, store.plan("u1"))
        store.write(HarnessMode.OFF, "u1")
        assertEquals(HarnessMode.OFF, store.mode("u1"))
        store.write(HarnessMode.UNDECIDED, "u1")
        assertNull("undecided keeps nothing", raw.values[HarnessStore.key(HarnessStore.MODE_PREFIX, "u1")])
        store.write(HarnessLedger(), "u1")
        assertNull("an empty ledger keeps nothing", raw.values[HarnessStore.key(HarnessStore.PREFIX, "u1")])
        store.write(emptyList<HarnessPlanned>(), "u1")
        assertTrue(raw.values.isEmpty())
    }

    @Test fun aStoreThatHoldsSomethingElseIsAnEmptyLedger() {
        val raw = OpenStore()
        val store = HarnessStore(raw)
        raw.values[HarnessStore.key(HarnessStore.PREFIX, null)] = "not json"
        raw.values[HarnessStore.key(HarnessStore.MODE_PREFIX, null)] = "maybe"
        raw.values[HarnessStore.key(HarnessStore.PLAN_PREFIX, null)] = "{\"followUp\":1}"
        assertTrue(store.ledger(null).isEmpty)
        assertEquals(HarnessMode.UNDECIDED, store.mode(null))
        assertEquals(emptyList<HarnessPlanned>(), store.plan(null))
        // An entry that is not an event is skipped; a symbol or a price nobody could have written is not trusted.
        raw.values[HarnessStore.key(HarnessStore.PREFIX, null)] = JSONObject().put("events", org.json.JSONArray()
            .put(JSONObject().put("kind", "ask").put("at", t0 + second).put("symbol", "TSLA").put("price", -1))
            .put("junk")
            .put(JSONObject().put("kind", "unknown").put("at", t0))
            .put(JSONObject().put("kind", "ask").put("symbol", "AAPL"))
            .put(JSONObject().put("kind", "ask").put("at", t0).put("symbol", "NVDA; drop").put("price", 10))
            .put(JSONObject().put("kind", "ask").put("at", t0).put("symbol", "NVDA").put("price", 10).put("question", "why is it down?"))).toString()
        val read = store.ledger(null)
        assertEquals("oldest first, whatever order they were stored in", listOf("NVDA", "TSLA"), symbols(read))
        assertEquals(listOf(10.0, null), read.events.map { it.price })
        assertFalse("a key the ledger does not know is never carried along", read.toJson().toString().contains("question"))
    }
}
