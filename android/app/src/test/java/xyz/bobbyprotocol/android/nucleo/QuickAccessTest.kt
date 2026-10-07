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

    @Test fun anAccountsSyncAfterAClearCarriesTheDefaultRowNeverAnEmptyOne() {
        val state = state("TSLA", "SOL")
        QuickAccess.keep(state, emptyList())
        // What NucleoSession.syncProgress puts in `profile.quickAccess`.
        val sent = JSONArray(QuickAccess.shown(state))
        assertEquals(3, sent.length())
        assertEquals("BTC", sent.getString(0))
        // The server answers with the row it now holds, and the sync stores it (NucleoStateStore.applySync).
        state.put("quickAccess", sent)
        assertTrue("the default row coming back is not something the reader kept", QuickAccess.kept(state).isEmpty())
        assertEquals(defaults, QuickAccess.shown(state))
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

    @Test fun aRowThatChangedWhileASyncWasInTheAirIsNewerThanTheEcho() {
        val state = state("TSLA", "SOL")
        val sent = JSONArray(QuickAccess.shown(state))
        assertTrue("nothing changed: the server's row is taken", QuickAccess.sameRow(sent, JSONArray(QuickAccess.shown(state))))
        // The person clears their shortcuts while the request is still out.
        QuickAccess.keep(state, emptyList())
        assertFalse("the echo of the old row must not bring the shortcuts back", QuickAccess.sameRow(sent, JSONArray(QuickAccess.shown(state))))
        assertFalse("order matters: the newest question comes first", QuickAccess.sameRow(JSONArray(listOf("A", "B")), JSONArray(listOf("B", "A"))))
        assertTrue(QuickAccess.sameRow(null, JSONArray()))
    }
}
