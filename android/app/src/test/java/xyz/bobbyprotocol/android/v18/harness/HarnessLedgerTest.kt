package xyz.bobbyprotocol.android.v18.harness

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
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

    @Test fun theAnchorIsTheLatestQuestionOrAnswer() {
        val ledger = HarnessLedger()
        ledger.note(ask("NVDA", 0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, t0 + 10 * second))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + 20 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        assertEquals(HarnessEvent.Kind.ASK, ledger.anchor(t0 + 30 * second)?.kind)
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + 40 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        assertEquals(HarnessEvent.Kind.OPENED, ledger.anchor(t0 + 50 * second)?.kind)
        assertEquals("the clock decides what has happened yet", HarnessEvent.Kind.ASK, ledger.anchor(t0 + 30 * second)?.kind)
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
        profile = HarnessProfile.make(ledger, t0 + 2 * day, utc)
        assertTrue(profile.rests(HarnessStep.ASSET))
        assertFalse(profile.rests(HarnessStep.WEEK))
        ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, t0 + day + 60 * second, symbol = "NVDA", step = HarnessStep.ASSET))
        profile = HarnessProfile.make(ledger, t0 + 2 * day, utc)
        assertFalse("one answer is enough", profile.rests(HarnessStep.ASSET))
        profile = HarnessProfile.make(ledger, t0 + 40 * day, utc)
        assertFalse("after a month the count starts again", profile.rests(HarnessStep.ASSET))
    }

    @Test fun theUnansweredStreakCountsWhatWasShownSinceTheLastAnswer() {
        val ledger = HarnessLedger()
        assertEquals(0, ledger.unansweredStreak(t0).count)
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0, symbol = "NVDA", step = HarnessStep.ASSET))
        ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, t0 + 60 * second, symbol = "NVDA", step = HarnessStep.ASSET, ref = t0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + day, symbol = "NVDA", step = HarnessStep.SECTOR, sector = "semis"))
        ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, t0 + 2 * day, symbol = "NVDA", step = HarnessStep.WEEK))
        val streak = ledger.unansweredStreak(t0 + 3 * day)
        assertEquals("the one they opened ended the streak before it", 2, streak.count)
        assertEquals(t0 + 2 * day, streak.last)
        assertEquals("only what has happened by then", 1, ledger.unansweredStreak(t0 + 30 * second).count)
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
        ledger.note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, t0 + 2 * day))
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
