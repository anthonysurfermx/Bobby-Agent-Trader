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
 *
 * A third question since slice 1 of the follow-ups (`own`): which symbols of the row the reader
 * asked about, and which are starters that only pad it. iOS reads that from its watchlist; here
 * the stored row has always been "the asset just asked about, then what the row held", so the
 * default tickers ride along in it. `quickAccessAsked`, a new key beside the row, keeps the
 * symbols that were really asked about. A read Bobby started offers only those.
 */
internal object QuickAccess {
    private const val FIELD = "quickAccess"
    private const val ASKED = "quickAccessAsked"

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

    /**
     * What the reader kept, newest first. Empty when there is no row, or only the default one.
     * A row that reads like the default one is still theirs once they asked about one of its
     * tickers (`own`): what the phone noted about them is listed, so that it can be cleared.
     */
    fun kept(state: JSONObject): List<String> = stored(state)?.takeIf { it != DEFAULTS || own(state).isNotEmpty() } ?: emptyList()

    /**
     * What the phone takes from a profile sync's reply: everything but the row. The server keeps
     * one for the web and hands it back with every reply; taking it would put assets on this
     * phone that the person never asked about here, under a sentence that says the list is the phone's own.
     */
    fun withoutRow(progress: JSONObject): JSONObject = JSONObject(progress.toString()).apply { remove(FIELD) }

    /** Keeps these symbols as the row. None removes the row, so the glass falls back to the defaults. */
    fun keep(state: JSONObject, symbols: List<String>) {
        val row = symbols.filter { it.isNotEmpty() }.take(LIMIT)
        if (row.isEmpty()) {
            state.remove(FIELD)
            state.remove(ASKED)
            return
        }
        state.put(FIELD, JSONArray(row))
        // What was asked about is never more than what the row still holds.
        val marked = state.optJSONArray(ASKED) ?: return
        state.put(ASKED, JSONArray(marks(marked).filter { it in row }))
    }

    /** The symbols a stored mark names. */
    private fun marks(array: JSONArray): List<String> = symbols(array)

    /**
     * The symbols of the row the reader asked about themselves, in the row's order. Never a
     * starter: with no stored row there are none, however many tickers the glass offers.
     *
     * A row stored before this was kept (Android 1.1.4, 1.2.0) does not say: there, a symbol that
     * is not a default ticker can only have come from a question, and a default ticker is not
     * counted until it is asked about again. That errs on the side of not offering it.
     */
    fun own(state: JSONObject): List<String> {
        val row = stored(state) ?: return emptyList()
        val marked = state.optJSONArray(ASKED) ?: return row.filter { it !in DEFAULTS }
        val known = marks(marked)
        return row.filter { it in known }
    }

    /** The reader asked about `symbol`: it leads the row the glass offers, and it is theirs. */
    fun asked(state: JSONObject, symbol: String) {
        if (symbol.isEmpty()) return
        val theirs = own(state)
        val row = (listOf(symbol) + shown(state).filter { it != symbol }).take(LIMIT)
        state.put(FIELD, JSONArray(row))
        state.put(ASKED, JSONArray((listOf(symbol) + theirs.filter { it != symbol }).filter { it in row }))
    }

    /** What `suggestions` hands the page: every symbol the glass offers, and whether the reader asked about it (`own`). */
    fun entries(state: JSONObject): List<Pair<String, Boolean>> {
        val theirs = own(state)
        return shown(state).map { it to (it in theirs) }
    }
}
