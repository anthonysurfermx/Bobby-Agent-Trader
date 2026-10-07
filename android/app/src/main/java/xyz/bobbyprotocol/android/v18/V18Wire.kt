package xyz.bobbyprotocol.android.v18

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

// What 1.8 adds to the desk request and reply (POST /api/desk-debate), a port of
// ios/Bobby/Sources/V18/V18Wire.swift. Everything is additive and optional: a server that knows
// none of it answers exactly as before, and an older client never sends or reads any of it.

/**
 * The thesis a review is read against: the person's own words, sent only inside a review they
 * started, as part of that question. The server does not store it. The server answers 400 to any
 * key it does not know, so this object carries exactly these and nothing else (no symbol, no id).
 */
data class ThesisContext(
    val hypothesis: String,
    val worry: String,
    val changeMind: String,
    /** `weeks` | `months` | `year` | `years`, or null when the person chose none. */
    val horizon: String?,
    /** ISO-8601 with a zone, when the thesis was written. */
    val savedAt: String,
    val priceAtSave: Double?,
    val lastReviewedAt: String?,
) {
    constructor(thesis: SavedThesis) : this(
        hypothesis = thesis.hypothesis,
        worry = thesis.worry,
        changeMind = thesis.changeMind,
        horizon = thesis.horizon?.raw,
        savedAt = iso(thesis.createdAtMillis),
        priceAtSave = thesis.startingPoint?.price,
        lastReviewedAt = thesis.lastReviewedAtMillis?.let { iso(it) },
    )

    fun toJson(): JSONObject {
        val body = JSONObject().put("hypothesis", hypothesis).put("savedAt", savedAt)
        if (worry.isNotEmpty()) body.put("worry", worry)
        if (changeMind.isNotEmpty()) body.put("changeMind", changeMind)
        if (horizon != null) body.put("horizon", horizon)
        if (priceAtSave != null && priceAtSave.isFinite() && priceAtSave > 0) body.put("priceAtSave", priceAtSave)
        if (lastReviewedAt != null) body.put("lastReviewedAt", lastReviewedAt)
        return body
    }

    companion object {
        /** "2026-10-07T12:00:00Z": whole seconds, UTC, as the server expects. */
        fun iso(millis: Long): String = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochMilli(millis).truncatedTo(ChronoUnit.SECONDS))
    }
}

/**
 * `review` in the reply to a question that carried a thesis: what the dated evidence supports,
 * what it challenges, what is still unknown, and the kinds of evidence the desk cannot check at
 * all (codes such as `news`, `earnings`, `filings`, `fundamentals`; the app words them).
 */
data class ThesisReviewNotes(
    val supports: List<String> = emptyList(),
    val challenges: List<String> = emptyList(),
    val unknowns: List<String> = emptyList(),
    val notChecked: List<String> = emptyList(),
) {
    val isEmpty: Boolean get() = supports.isEmpty() && challenges.isEmpty() && unknowns.isEmpty()

    companion object {
        const val ITEM_LIMIT = 4
        const val TEXT_LIMIT = 280
        val NOT_CHECKED_CODES: Set<String> = setOf("news", "earnings", "filings", "fundamentals", "macro")

        /** Null unless the reply carries a `review` object. Lists that did not arrive are empty. */
        fun fromJson(json: JSONObject?): ThesisReviewNotes? {
            if (json == null) return null
            fun strings(key: String): List<String> {
                val array: JSONArray = json.optJSONArray(key) ?: return emptyList()
                val out = ArrayList<String>()
                for (i in 0 until array.length()) {
                    val value = array.opt(i)
                    if (value is String) out.add(value)
                }
                return out
            }
            fun list(key: String): List<String> = strings(key).map { it.trim() }.filter { it.isNotEmpty() }.take(ITEM_LIMIT).map { cap(it) }
            return ThesisReviewNotes(list("supports"), list("challenges"), list("unknowns"), strings("notChecked").filter { it in NOT_CHECKED_CODES })
        }

        private fun cap(text: String): String =
            if (text.codePointCount(0, text.length) <= TEXT_LIMIT) text else text.substring(0, text.offsetByCodePoints(0, TEXT_LIMIT))
    }
}

/** How a desk reply's `memory` object is read into a [MemoryReceipt]. Facts only; never text. */
object MemoryReceipts {
    /**
     * An incomplete receipt is no receipt: an unknown count is never turned into a zero, and a
     * recorded ask counts itself.
     */
    fun fromJson(json: JSONObject?): MemoryReceipt? {
        if (json == null) return null
        val recorded = json.opt("recorded") as? Boolean ?: return null
        val asks = count(json.opt("asks")) ?: return null
        if (recorded && asks < 1) return null
        val pct = (json.opt("changeSinceLastAskPct") as? Number)?.toDouble()?.takeIf { it.isFinite() && kotlin.math.abs(it) < 10_000 }
        return MemoryReceipt(recorded, asks, count(json.opt("lastAskedDaysAgo")), pct)
    }

    /** A whole, non-negative count the server sent as a number; anything else is unknown. */
    fun count(value: Any?): Int? {
        if (value !is Number) return null
        val number = value.toDouble()
        if (!number.isFinite() || number < 0 || number >= 1e9) return null
        return Math.round(number).toInt()
    }
}

/** What a 1.8 screen may know about a recent read (the editor drafts a thesis from it). No question text. */
data class ReadSummary(
    val requestId: String,
    val symbol: String,
    val name: String,
    val isEquity: Boolean,
    val verdict: String,
    val price: Double?,
    val asOf: String,
    val headline: String?,
    val why: String?,
    val risk: String?,
    val watch: String?,
)

/** Hand-offs between a nudge or a notification tap and the screen it opens. Consumed once. Main thread only. */
class V18Focus {
    /** The read a thesis is being written from. */
    var draftRequestId: String? = null
    /** The thesis a screen should open on (a reminder tap, a nudge, a row). */
    var thesisId: String? = null

    fun takeDraftRequestId(): String? = draftRequestId.also { draftRequestId = null }
    fun takeThesisId(): String? = thesisId.also { thesisId = null }
    fun clear() {
        draftRequestId = null
        thesisId = null
    }
}
