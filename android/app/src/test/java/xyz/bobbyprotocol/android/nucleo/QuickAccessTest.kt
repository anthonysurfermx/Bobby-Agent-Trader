package xyz.bobbyprotocol.android.nucleo

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The quick-access row, as iOS keeps it (DeskMemory.swift): what the reader kept is one thing, what
 * the glass offers is another, and clearing removes the stored row so the glass falls back to the
 * default tickers. The state here is the owner's stored blob, exactly as NucleoStateStore reads it.
 */
class QuickAccessTest {
    private val defaults = listOf("BTC", "NVDA", "ETH")

    private fun state(vararg symbols: String) = JSONObject().put("xp", 40).put("quickAccess", JSONArray(symbols.toList()))

    @Test fun aReaderWhoKeepsNothingIsOfferedTheDefaultTickers() {
        val fresh = JSONObject()
        assertEquals(defaults, QuickAccess.shown(fresh))
        assertTrue("and the defaults are not theirs", QuickAccess.kept(fresh).isEmpty())
        assertEquals(defaults, QuickAccess.DEFAULTS)
    }

    @Test fun whatTheReaderAskedAboutIsWhatTheGlassOffersAndWhatMemoryLists() {
        val state = state("TSLA", "BTC", "NVDA", "ETH")
        assertEquals(listOf("TSLA", "BTC", "NVDA", "ETH"), QuickAccess.shown(state))
        assertEquals(listOf("TSLA", "BTC", "NVDA", "ETH"), QuickAccess.kept(state))
    }

    @Test fun clearingRemovesTheStoredRowAndTheGlassFallsBackToTheDefaults() {
        val state = state("TSLA", "SOL")
        QuickAccess.keep(state, emptyList())
        assertFalse("the row is removed, not stored empty", state.has("quickAccess"))
        assertEquals("the glass is never left without tickers", defaults, QuickAccess.shown(state))
        assertTrue(QuickAccess.kept(state).isEmpty())
        assertEquals("nothing else of the reader's state is touched", 40, state.getInt("xp"))
    }

    @Test fun theRowStaysOnThisPhoneASyncReplyNeverBringsOneIn() {
        // Memory tells the person their shortcuts are kept "on this phone, not on its servers": the
        // profile sync sends no row (NucleoSession.syncProgress) and takes none from the reply.
        val state = state("TSLA", "SOL")
        val reply = JSONObject().put("xp", 55).put("streak", 2).put("quickAccess", JSONArray(listOf("DOGE", "PEPE")))
        val taken = QuickAccess.withoutRow(reply)
        assertFalse("the row the server keeps for the web is not taken", taken.has("quickAccess"))
        assertEquals("everything else of the reply is", 55, taken.getInt("xp"))
        assertEquals(2, taken.getInt("streak"))
        assertTrue("the reply itself is left as it came", reply.has("quickAccess"))
        // What NucleoStateStore.applySync does with it: only fields that are there are written.
        for (field in listOf("xp", "streak", "quickAccess")) if (taken.has(field)) state.put(field, taken.get(field))
        assertEquals("the phone's own row is untouched", listOf("TSLA", "SOL"), QuickAccess.kept(state))
        assertEquals(55, state.getInt("xp"))
    }

    @Test fun forgettingTheLastAssetAskedAboutLeavesNothingKept() {
        // One question about TSLA: the row is TSLA followed by the defaults it started from.
        val state = state("TSLA", "BTC", "NVDA", "ETH")
        QuickAccess.keep(state, QuickAccess.kept(state).filterNot { it == "TSLA" })
        assertTrue(QuickAccess.kept(state).isEmpty())
        assertEquals(defaults, QuickAccess.shown(state))
    }

    @Test fun anEmptyOrBrokenRowReadsAsNoRow() {
        val empty = JSONObject().put("quickAccess", JSONArray())
        assertEquals("an empty row left by an older build or another device", defaults, QuickAccess.shown(empty))
        assertTrue(QuickAccess.kept(empty).isEmpty())
        val broken = JSONObject().put("quickAccess", JSONArray().put(7).put("").put(JSONObject.NULL).put("SOL"))
        assertEquals("only symbols count", listOf("SOL"), QuickAccess.shown(broken))
        assertEquals(listOf("SOL"), QuickAccess.kept(broken))
        assertEquals("something that is not a row at all", defaults, QuickAccess.shown(JSONObject().put("quickAccess", "BTC")))
    }

    @Test fun theRowHoldsSixSymbolsAtMost() {
        val state = JSONObject()
        QuickAccess.keep(state, listOf("A", "B", "C", "D", "E", "F", "G", "H"))
        assertEquals(listOf("A", "B", "C", "D", "E", "F"), QuickAccess.kept(state))
        assertEquals(6, QuickAccess.LIMIT)
    }

    // ---- Whose assets they are (slice 1 of the follow-ups): `own` on every entry the page gets.
    // iOS: NextQuestionTests.testQuickAccessTellsThePersonsOwnAssetsFromTheStartersThatPadTheRow. ----

    private fun own(state: JSONObject) = QuickAccess.entries(state).map { it.second }
    private fun row(state: JSONObject) = QuickAccess.entries(state).map { it.first }

    @Test fun quickAccessTellsThePersonsOwnAssetsFromTheStartersThatPadTheRow() {
        val state = JSONObject()
        assertEquals(defaults, row(state))
        assertEquals("no history yet: every entry is a starter", listOf(false, false, false), own(state))
        assertTrue(QuickAccess.own(state).isEmpty())

        QuickAccess.asked(state, "SOL")
        assertEquals(listOf("SOL", "BTC", "NVDA", "ETH"), row(state))
        assertEquals("the starters ride along in the row and are still not theirs", listOf(true, false, false, false), own(state))

        // Asking about a starter makes it theirs, and it leads the row.
        QuickAccess.asked(state, "NVDA")
        assertEquals(listOf("NVDA", "SOL", "BTC", "ETH"), row(state))
        assertEquals(listOf(true, true, false, false), own(state))
        assertEquals(listOf("NVDA", "SOL"), QuickAccess.own(state))

        // Asked again: once in the row, once among their own.
        QuickAccess.asked(state, "SOL")
        assertEquals(listOf("SOL", "NVDA", "BTC", "ETH"), row(state))
        assertEquals(listOf("SOL", "NVDA"), QuickAccess.own(state))
        QuickAccess.asked(state, "")
        assertEquals("nothing is asked about nothing", listOf("SOL", "NVDA", "BTC", "ETH"), row(state))
    }

    @Test fun theRowIsTheOneOfBeforeSixAtMostAndWhatFallsOffIsNoLongerCounted() {
        val state = JSONObject()
        for (symbol in listOf("A", "B", "C", "D")) QuickAccess.asked(state, symbol)
        assertEquals("the asset just asked about, then what the row held", listOf("D", "C", "B", "A", "BTC", "NVDA"), row(state))
        assertEquals(listOf("D", "C", "B", "A"), QuickAccess.own(state))
        for (symbol in listOf("E", "F", "G")) QuickAccess.asked(state, symbol)
        assertEquals(listOf("G", "F", "E", "D", "C", "B"), row(state))
        assertEquals("A left the row: it is not offered, so it is not kept as theirs either", listOf("G", "F", "E", "D", "C", "B"), QuickAccess.own(state))
        assertFalse(state.toString().contains("\"A\""))
    }

    @Test fun aRowStoredBeforeTheMarkCountsOnlyWhatCanOnlyHaveBeenAsked() {
        // Android 1.1.4 and 1.2.0 stored the row alone. TSLA can only be there because they asked;
        // a default ticker may just be padding, so it is not offered as theirs until they ask again.
        val legacy = state("TSLA", "BTC", "NVDA", "ETH")
        assertEquals(listOf(true, false, false, false), own(legacy))
        assertFalse("reading never writes the mark", legacy.has("quickAccessAsked"))
        QuickAccess.asked(legacy, "BTC")
        assertEquals(listOf("BTC", "TSLA", "NVDA", "ETH"), row(legacy))
        assertEquals("what it could tell before is kept, and BTC is theirs now", listOf("BTC", "TSLA"), QuickAccess.own(legacy))
        // A default row, stored or not, holds nothing of theirs.
        assertTrue(QuickAccess.own(state("BTC", "NVDA", "ETH")).isEmpty())
        assertTrue(QuickAccess.own(JSONObject().put("quickAccess", JSONArray())).isEmpty())
    }

    @Test fun forgettingAndClearingTakeTheMarkWithThem() {
        val state = JSONObject().put("xp", 40)
        QuickAccess.asked(state, "TSLA")
        QuickAccess.asked(state, "SOL")
        // Memory forgets one: it leaves the row and is no longer counted as theirs.
        QuickAccess.keep(state, QuickAccess.kept(state).filterNot { it == "TSLA" })
        assertEquals(listOf("SOL", "BTC", "NVDA", "ETH"), row(state))
        assertEquals(listOf("SOL"), QuickAccess.own(state))
        assertFalse(state.toString().contains("TSLA"))
        // "Clear the shortcuts" and "Delete everything": no row, and no note of what was asked.
        QuickAccess.keep(state, emptyList())
        assertEquals("only what was there before is left", """{"xp":40}""", state.toString())
        assertEquals(defaults, row(state))
        assertEquals(listOf(false, false, false), own(state))
    }

    @Test fun whatThePhoneNotedAboutADefaultTickerCanBeSeenAndCleared() {
        // Their first question is about BTC: the row reads like the default one, but the phone now
        // notes that they asked. Memory lists it, so that it can be cleared.
        val state = JSONObject()
        QuickAccess.asked(state, "BTC")
        assertEquals(defaults, row(state))
        assertEquals(listOf(true, false, false), own(state))
        assertEquals(defaults, QuickAccess.kept(state))
        QuickAccess.keep(state, emptyList())
        assertEquals("{}", state.toString())
        assertTrue(QuickAccess.kept(state).isEmpty())
        // Forgetting the one they asked about leaves a row that is only the default one again.
        QuickAccess.asked(state, "BTC")
        QuickAccess.keep(state, QuickAccess.kept(state).filterNot { it == "BTC" })
        assertTrue(QuickAccess.own(state).isEmpty())
        assertEquals(listOf("NVDA", "ETH"), QuickAccess.kept(state))
    }
}
