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
}
