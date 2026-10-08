package xyz.bobbyprotocol.android.nucleo

import org.json.JSONArray
import org.json.JSONObject

/**
 * The quick-access row of one reader, inside their stored state (`quickAccess` in the owner's blob).
 *
 * Two questions, kept apart as iOS keeps them (DeskMemory.swift: the watchlist, and the row the
 * glass pads with defaults):
 *   - `shown`: what the glass offers. The reader's own row, or the default tickers when they keep none.
 *   - `kept`: what the reader kept. The Memory screen lists these and "Clear" removes them.
 *
 * Clearing REMOVES the stored row; it never stores an empty one. The glass then falls back to the
 * default tickers. The default row is never reported as something the reader kept: it is what
 * every profile starts from.
 *
 * The row lives on this phone only, as on iOS: the profile sync neither sends it nor takes the
 * row the server keeps for the web (NucleoSession.syncProgress). Memory says so to the person
 * ("Bobby keeps these on this phone, not on its servers"), and this is what makes it true.
 */
internal object QuickAccess {
    private const val FIELD = "quickAccess"

    /** The tickers offered to a reader who keeps none. The server's profile starts from the same row. */
    val DEFAULTS: List<String> = listOf("BTC", "NVDA", "ETH")

    /** The most the row holds (and the most `api/progress` accepts). */
    const val LIMIT = 6

    /** The symbols in a stored array: text only, nothing empty. */
    fun symbols(array: JSONArray?): List<String> =
        (0 until (array?.length() ?: 0)).mapNotNull { index -> (array?.opt(index) as? String)?.takeIf { it.isNotEmpty() } }

    /** The stored row, or null when there is none. */
    private fun stored(state: JSONObject): List<String>? = state.optJSONArray(FIELD)?.let { symbols(it) }

    /** What the glass offers: never an empty row. */
    fun shown(state: JSONObject): List<String> = stored(state)?.takeIf { it.isNotEmpty() } ?: DEFAULTS

    /** What the reader kept, newest first. Empty when there is no row, or only the default one. */
    fun kept(state: JSONObject): List<String> = stored(state)?.takeIf { it != DEFAULTS } ?: emptyList()

    /**
     * What the phone takes from a profile sync's reply: everything but the row. The server keeps
     * one for the web and hands it back with every reply; taking it would put assets on this
     * phone that the person never asked about here, under a sentence that says the list is the phone's own.
     */
    fun withoutRow(progress: JSONObject): JSONObject = JSONObject(progress.toString()).apply { remove(FIELD) }

    /** Keeps these symbols as the row. None removes the row, so the glass falls back to the defaults. */
    fun keep(state: JSONObject, symbols: List<String>) {
        val row = symbols.filter { it.isNotEmpty() }.take(LIMIT)
        if (row.isEmpty()) state.remove(FIELD) else state.put(FIELD, JSONArray(row))
    }
}
