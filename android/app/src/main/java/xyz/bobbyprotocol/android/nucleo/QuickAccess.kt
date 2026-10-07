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
 * default tickers, and an account's next profile sync carries that default row (the server keeps
 * one row per account and hands it back on every sync, so the old shortcuts would return unless it
 * is told). The default row is therefore never reported as something the reader kept: it is what
 * every profile starts from, on this phone and on the server alike.
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

    /** What the glass offers, and what an account's profile sync sends: never an empty row. */
    fun shown(state: JSONObject): List<String> = stored(state)?.takeIf { it.isNotEmpty() } ?: DEFAULTS

    /** What the reader kept, newest first. Empty when there is no row, or only the default one. */
    fun kept(state: JSONObject): List<String> = stored(state)?.takeIf { it != DEFAULTS } ?: emptyList()

    /**
     * True when two rows hold the same symbols in the same order. The sync asks it before taking the
     * server's echo: a row that changed while the request was in the air is newer than the echo.
     */
    fun sameRow(first: JSONArray?, second: JSONArray?): Boolean = symbols(first) == symbols(second)

    /** Keeps these symbols as the row. None removes the row, so the glass falls back to the defaults. */
    fun keep(state: JSONObject, symbols: List<String>) {
        val row = symbols.filter { it.isNotEmpty() }.take(LIMIT)
        if (row.isEmpty()) state.remove(FIELD) else state.put(FIELD, JSONArray(row))
    }
}
