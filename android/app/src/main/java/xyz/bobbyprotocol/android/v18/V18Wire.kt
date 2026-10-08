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

    /** The receipt as it rides a delivered read for native (the page ignores keys it does not know). */
    fun toJson(receipt: MemoryReceipt): JSONObject = JSONObject()
        .put("recorded", receipt.recorded).put("asks", receipt.asks)
        .put("lastAskedDaysAgo", receipt.lastAskedDaysAgo ?: JSONObject.NULL)
        .put("changeSinceLastAskPct", receipt.changeSinceLastAskPct ?: JSONObject.NULL)
}

/**
 * A desk reply (the `final` body of POST /api/desk-debate) as 1.8 reads it: the reply itself,
 * untouched, and the additive parts parsed. `BobbyRepository.streamDebate` already refused a
 * reply without the three agents and a `wait` | `review` verdict before this is built.
 */
class DeskAnswer(val json: JSONObject) {
    private val agents: JSONObject? = json.optJSONObject("agents")
    private val synthesis: JSONObject? = agents?.optJSONObject("synthesis") ?: json.optJSONObject("synthesis")

    /** `wait` | `review`. */
    val verdict: String = agents?.optString("verdict", "wait") ?: "wait"
    /** What the server says its memory holds about this asset; null when memory did not apply. */
    val memory: MemoryReceipt? = MemoryReceipts.fromJson(json.optJSONObject("memory"))
    /** Only for a request that carried a thesis, and only when the server sorted the evidence against it. */
    val review: ThesisReviewNotes? = ThesisReviewNotes.fromJson(json.optJSONObject("review"))
    /** The price the evidence carried, and when that evidence was dated. Never invented: null when absent. */
    val price: Double? = V18Json.number(json.optJSONObject("technicals"), "price")?.takeIf { it > 0 }
    val asOf: String? = V18Json.text(json.optJSONObject("provenance"), "asOf")
    val headline: String? = V18Json.text(synthesis, "headline")
    val why: String? = V18Json.text(synthesis, "why")
    val risk: String? = V18Json.text(synthesis, "risk")
    val watch: String? = V18Json.text(synthesis, "watch")
    /** The level the server answered with (`rapido` | `profundo` | `maximo`), when it says. */
    val level: String? = V18Json.text(json, "level")
    /** The server's read meter after this request, as it sent it. */
    val access: JSONObject? = json.optJSONObject("access")
}

/** Reading JSON the same way on the phone and in JVM tests (`optString` on a JSON null differs between them). */
internal object V18Json {
    fun text(json: JSONObject?, key: String): String? {
        if (json == null || json.isNull(key)) return null
        return (json.opt(key) as? String)?.takeIf { it.isNotEmpty() }
    }

    fun number(json: JSONObject?, key: String): Double? {
        if (json == null || json.isNull(key)) return null
        return (json.opt(key) as? Number)?.toDouble()?.takeIf { it.isFinite() }
    }
}

/**
 * Who started a read. A chain of follow-ups belongs to a question the person asked by themselves,
 * typed or spoken, in their own words (iOS `NucleoReadOrigin`). The session decides it when the
 * question is asked and carries it through a confirmation, a retry and a sign-in.
 */
enum class ReadOrigin {
    /** The person, in their own words: typed or spoken. */
    PERSON,
    /** The person again: their own second question about the read on screen. */
    THREAD,
    /** Bobby: the question it wrote after a read, the button of a follow-up, a row of a board. */
    FOLLOW_UP,
    /**
     * The person picked an asset on a chip and Bobby wrote the question it asks: an asset of the
     * idle home, an asset or a mover of the row after a read, an example of the first question.
     * One tap, not their words (the page marks it: `ask {question, chip: true}`).
     */
    CHIP,
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
    /** Who started it. The read itself does not say: the session does (`V18Runtime.readDelivered`). */
    val origin: ReadOrigin = ReadOrigin.PERSON,
    /**
     * How long the question was looking, as the desk read it (`sufficiency.horizon` in the reply:
     * `intraday`, `week`, `month`, `long` or `unspecified`). One of five fixed values, never the
     * person's words; null when the reply says none.
     */
    val horizon: String? = null,
) {
    companion object {
        /** The desk's five horizons (`Horizon` in api/_lib/desk-debate.ts). Anything else is not carried. */
        val HORIZONS: Set<String> = setOf("intraday", "week", "month", "long", "unspecified")

        /**
         * From a delivered read as the session hands it to the page (`status: "ok"`). The price is
         * the market's when it answered, else the one the desk's evidence carried. The question the
         * read also holds is never copied.
         */
        fun from(read: JSONObject): ReadSummary? {
            if (V18Json.text(read, "status") != "ok") return null
            val requestId = V18Json.text(read, "requestId") ?: return null
            val asset = read.optJSONObject("asset") ?: return null
            val symbol = V18Json.text(asset, "symbol") ?: return null
            val synthesis = read.optJSONObject("synthesis")
            val price = V18Json.number(read.optJSONObject("market"), "price") ?: V18Json.number(read.optJSONObject("technicals"), "price")
            return ReadSummary(
                requestId = requestId, symbol = symbol, name = V18Json.text(asset, "name") ?: symbol,
                isEquity = asset.optBoolean("isEquity", false),
                verdict = V18Json.text(read.optJSONObject("agents"), "verdict") ?: "wait",
                price = price?.takeIf { it > 0 }, asOf = V18Json.text(read.optJSONObject("provenance"), "asOf") ?: "",
                headline = V18Json.text(synthesis, "headline"), why = V18Json.text(synthesis, "why"),
                risk = V18Json.text(synthesis, "risk"), watch = V18Json.text(synthesis, "watch"),
                horizon = V18Json.text(read.optJSONObject("sufficiency"), "horizon")?.takeIf { it in HORIZONS },
            )
        }
    }
}

/**
 * The last delivered reads of one reader, for `V18Host.readSummary`. In memory only. It is bound to
 * one account moment: a different one empties it, so a summary never crosses accounts.
 */
class ReadShelf(private val limit: Int = 5) {
    private var key: String? = null
    private val items = ArrayList<ReadSummary>()

    /** True when what is kept already belongs to `key`; otherwise it is emptied and bound to it. */
    fun bind(key: String): Boolean {
        if (this.key == key) return true
        items.clear()
        this.key = key
        return false
    }

    fun put(summary: ReadSummary) {
        items.removeAll { it.requestId == summary.requestId }
        items.add(summary)
        while (items.size > limit) items.removeAt(0)
    }

    fun get(requestId: String): ReadSummary? = items.lastOrNull { it.requestId == requestId }
    fun clear() { items.clear() }
}

/** Whose a notification or a follow-up is, as it may travel in a payload: never the account id. */
object V18Reader {
    /** `local` signed out, else the first eight bytes of the SHA-256 of the account id, in hex (the iOS `ownerTag`). */
    fun tag(owner: String?): String {
        if (owner == null) return "local"
        val digest = java.security.MessageDigest.getInstance("SHA-256").digest(owner.toByteArray(Charsets.UTF_8))
        val hex = StringBuilder()
        for (i in 0 until 8) hex.append(String.format(java.util.Locale.ROOT, "%02x", digest[i].toInt() and 0xff))
        return hex.toString()
    }
}

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
