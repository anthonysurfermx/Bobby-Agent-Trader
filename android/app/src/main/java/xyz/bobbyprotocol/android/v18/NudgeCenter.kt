package xyz.bobbyprotocol.android.v18

import org.json.JSONObject
import java.util.Locale

// The nudge (1.8): ONE line and ONE button Bobby may place on the glass, so a person meets
// credits, memory, their theses, reminders and invitations where they talk to Bobby instead of
// having to discover a row in the profile. A port of ios/Bobby/Sources/Nucleo/NucleoNudge.swift:
// same etiquette, same limits. The page draws it and forwards the tap (`session.nudge`,
// `nudge.seen`, `nudge.act`); it never writes the copy and never decides what opens.
// A nudge shows twice, rests a week, may come back for one more round, and is gone for good once
// the person acts on it. What was shown and tapped is remembered per account. Nothing here touches
// the network, and the session shows nothing before the risk notice is accepted.

/** What the page receives: an opaque id, the line and the button label (already localized). */
class NucleoNudge(id: String, val text: String, val cta: String) {
    /** Ids are lowercase on the wire (a UUID fragment or an ISO week may arrive in capitals). */
    val id: String = id.lowercase(Locale.ROOT)

    fun toJson(): JSONObject = JSONObject().put("id", id).put("text", text).put("cta", cta)

    override fun equals(other: Any?): Boolean = other is NucleoNudge && other.id == id && other.text == text && other.cta == cta
    override fun hashCode(): Int = (id.hashCode() * 31 + text.hashCode()) * 31 + cta.hashCode()
    override fun toString(): String = "NucleoNudge(id=$id, text=$text, cta=$cta)"

    companion object {
        val ID_PATTERN = Regex("^[a-z][a-z0-9_.-]{0,47}$")
        /** The page ellipsizes a longer line; sources should stay under this. */
        const val TEXT_LIMIT = 46
        const val CTA_LIMIT = 22
    }
}

/** What the server says its memory holds about an asset (the `memory` field of a desk reply). */
data class MemoryReceipt(
    /** This question was added to memory. */
    val recorded: Boolean,
    /** Times this account asked about the asset, this one included. */
    val asks: Int,
    val lastAskedDaysAgo: Int? = null,
    val changeSinceLastAskPct: Double? = null,
)

/** The last delivered read of this launch. Never the question's text. */
data class NudgeRead(
    val requestId: String,
    val symbol: String,
    val name: String,
    val isEquity: Boolean,
    /** `wait` | `review`. */
    val verdict: String,
    val saved: Boolean,
    val atMillis: Long,
    val memory: MemoryReceipt? = null,
)

/** What a source may look at when it decides whether it has something to say. */
data class NudgeMoment(
    val signedIn: Boolean,
    val nowMillis: Long,
    val lastRead: NudgeRead?,
    /** Delivered reads since launch. */
    val readsThisLaunch: Int,
)

/**
 * One feature's voice on the glass. [candidate] must be cheap and synchronous (stored state only).
 * [act] is the tap; the nudge is already retired when it runs.
 */
class NudgeSource(
    /** `credits`, `memory`, `theses`, `reminders`, `invite`, `harness.move`, `harness.offer`. One source per key; registering again replaces it. */
    val key: String,
    /** Higher speaks first. */
    val priority: Int,
    val candidate: (NudgeMoment) -> NucleoNudge?,
    /** The tap. A source captures its `V18Host` when it registers; the nudge is already retired when this runs. */
    val act: suspend (NucleoNudge) -> Unit,
)

/** Priorities of the nudge sources, in one place so two features never fight over the glass. */
object NudgePriority {
    /** Coming back to an asset they asked about (a tapped follow-up lands here): it is why they opened the app. */
    const val FOLLOW_UP = 95
    /** An invitation that is waiting for an account: it expires, so it speaks first. */
    const val INVITE = 90
    /** The offer to come back tomorrow, after a read, until the person decides. */
    const val FOLLOW_UP_OFFER = 80
    /** The thesis a person just saved or came back to. */
    const val THESES = 70
    /** The offer to remember, once, after a useful read. */
    const val MEMORY = 60
    /** A reminder offer after a thesis exists. */
    const val REMINDERS = 50
    /** Credits running low. */
    const val CREDITS = 40
}

class NudgeCenter(private val store: KeyValueStore, var now: () -> Long = { System.currentTimeMillis() }) {
    data class Policy(
        /** Showings before a rest. */
        val perRound: Int = 2,
        /** Days a nudge rests after a round nobody answered. */
        val restDays: Int = 7,
        /** Showings ever; after that it never returns. */
        val lifetime: Int = 4,
        /** Two showings closer than this are one; a nudge that just finished its round stays this long before it rests. */
        val showingGapMillis: Long = 600_000L,
        /** After a tap nothing else speaks for this long: one nudge at a time, never a queue. */
        val quietAfterTapMillis: Long = 900_000L,
    )

    var policy = Policy()

    /** Whose showings and taps are counted: the signed-in account, or null for this phone signed out. */
    var owner: String? = null
        set(value) {
            if (field != value) {
                field = value
                served.clear()
                currentId = null
            }
        }

    private val sources = ArrayList<NudgeSource>()
    /** What was handed to the page, so a tap finds its source even if the candidate has since changed. */
    private val served = HashMap<String, Pair<NucleoNudge, String>>()
    /** The nudge in the page's latest session, if any: only that one can be tapped. */
    private var currentId: String? = null

    var lastRead: NudgeRead? = null
        private set
    var readsThisLaunch: Int = 0
        private set

    // Sources

    fun register(source: NudgeSource) {
        sources.removeAll { it.key == source.key }
        sources.add(source)
        sources.sortWith(compareByDescending<NudgeSource> { it.priority }.thenBy { it.key })
    }

    fun unregisterAll() {
        sources.clear()
        served.clear()
        currentId = null
    }

    val sourceKeys: List<String> get() = sources.map { it.key }

    // The moment

    fun noteRead(read: NudgeRead) {
        lastRead = read
        readsThisLaunch += 1
    }

    fun noteSaved(requestId: String) {
        val read = lastRead ?: return
        if (read.requestId == requestId) lastRead = read.copy(saved = true)
    }

    /**
     * A new account or a withdrawn consent: nothing of the previous reader's session remains.
     * The quiet period after a tap belongs to the phone and is kept.
     */
    fun forgetMoment() {
        lastRead = null
        readsThisLaunch = 0
        served.clear()
        currentId = null
    }

    fun moment(signedIn: Boolean): NudgeMoment = NudgeMoment(signedIn, now(), lastRead, readsThisLaunch)

    // Choosing

    /** The one nudge for this moment, or null. Ids that do not match the bridge pattern are never served. */
    fun current(moment: NudgeMoment): NucleoNudge? {
        currentId = null
        val tap = lastTapAt
        if (tap != null && moment.nowMillis - tap < policy.quietAfterTapMillis) return null
        for (source in sources) {
            val nudge = source.candidate(moment) ?: continue
            if (!NucleoNudge.ID_PATTERN.matches(nudge.id) || nudge.cta.isEmpty() || !eligible(nudge.id, moment.nowMillis)) continue
            served[nudge.id] = Pair(nudge, source.key)
            currentId = nudge.id
            return nudge
        }
        return null
    }

    /** A quiet glass (a sheet is up, consent is missing): nothing is served and nothing can be tapped. */
    fun withhold() {
        currentId = null
    }

    fun isCurrent(id: String): Boolean = currentId == id.lowercase(Locale.ROOT)

    fun eligible(id: String, atMillis: Long): Boolean {
        val record = records()[id.lowercase(Locale.ROOT)] ?: return true
        if (record.done) return false
        val sinceLast = atMillis - record.at
        // The showing in progress is never pulled from under the reader.
        val stillShowing = record.shown > 0 && sinceLast < policy.showingGapMillis
        if (record.shown >= policy.lifetime) return stillShowing
        val roundDone = record.shown > 0 && record.shown % policy.perRound == 0
        if (roundDone && !stillShowing && sinceLast < policy.restDays * DAY_MILLIS) return false
        return true
    }

    // The page's two reports

    /** The page drew it (it reports every drawing). Returns the showings so far. */
    fun seen(rawId: String): Int {
        val id = rawId.lowercase(Locale.ROOT)
        val all = records()
        // Only a nudge this centre handed out is counted: the page cannot mint records.
        if (!served.containsKey(id)) return all[id]?.shown ?: 0
        val record = all[id] ?: Record()
        val t = now()
        if (record.done) return record.shown
        if (record.shown == 0 || t - record.at >= policy.showingGapMillis) {
            if (!eligible(id, t)) return record.shown
            val next = record.copy(shown = record.shown + 1, at = t)
            all[id] = next
            write(all)
            return next.shown
        }
        return record.shown
    }

    /** When this nudge stops being eligible by the clock alone (its showing ends and it rests or is spent). */
    fun showingEnds(rawId: String): Long? {
        val record = records()[rawId.lowercase(Locale.ROOT)] ?: return null
        if (record.done || record.shown <= 0) return null
        val roundDone = record.shown % policy.perRound == 0 || record.shown >= policy.lifetime
        return if (roundDone) record.at + policy.showingGapMillis else null
    }

    /**
     * The person tapped it: it is retired, then its source acts. `gone` when it is not the nudge on
     * screen (unknown, already retired, replaced, or withheld because something else is up).
     */
    suspend fun act(rawId: String): String {
        val id = rawId.lowercase(Locale.ROOT)
        val entry = served[id]
        val source = if (entry == null) null else sources.firstOrNull { it.key == entry.second }
        if (currentId != id || entry == null || source == null || records()[id]?.done == true) return "gone"
        retire(id)
        lastTapAt = now()
        source.act(entry.first)
        return "done"
    }

    /** Never again (acted on elsewhere, or no longer true). */
    fun retire(rawId: String) {
        val id = rawId.lowercase(Locale.ROOT)
        val all = records()
        val record = all[id] ?: Record()
        all[id] = record.copy(done = true, at = now())
        write(all)
        served.remove(id)
        if (currentId == id) currentId = null
    }

    fun showings(id: String): Int = records()[id.lowercase(Locale.ROOT)]?.shown ?: 0
    fun isRetired(id: String): Boolean = records()[id.lowercase(Locale.ROOT)]?.done == true

    /** Tests and "start over": the current owner's history, the quiet period and this launch's moment. */
    fun reset() {
        store.remove(storeKey(owner))
        store.remove(LAST_TAP_KEY)
        forgetMoment()
    }

    // Store

    private data class Record(val shown: Int = 0, val at: Long = 0L, val done: Boolean = false)

    private var lastTapAt: Long?
        get() = store.getString(LAST_TAP_KEY)?.toLongOrNull()
        set(value) {
            if (value != null) store.putString(LAST_TAP_KEY, value.toString()) else store.remove(LAST_TAP_KEY)
        }

    private fun records(): MutableMap<String, Record> {
        val raw = store.getString(storeKey(owner)) ?: return HashMap()
        val all = HashMap<String, Record>()
        try {
            val json = JSONObject(raw)
            val keys = json.keys()
            while (keys.hasNext()) {
                val id = keys.next()
                val row = json.optJSONObject(id) ?: continue
                all[id] = Record(row.optInt("shown", 0), row.optLong("at", 0L), row.optBoolean("done", false))
            }
        } catch (_: Exception) {
            return HashMap()
        }
        return all
    }

    private fun write(all: Map<String, Record>) {
        val cutoff = now() - KEEP_DAYS * DAY_MILLIS
        val kept = HashMap<String, Record>()
        val finished = ArrayList<Pair<String, Record>>()
        for ((id, record) in all) {
            if (record.done || record.shown >= policy.lifetime) finished.add(Pair(id, record))
            else if (record.at >= cutoff) kept[id] = record
        }
        // Retired and spent ids are kept so that "never again" survives, up to the most recent ones.
        for ((id, record) in finished.sortedByDescending { it.second.at }.take(FINISHED_KEPT)) kept[id] = record
        val json = JSONObject()
        for ((id, record) in kept) {
            json.put(id, JSONObject().put("shown", record.shown).put("at", record.at).put("done", record.done))
        }
        store.putString(storeKey(owner), json.toString())
    }

    companion object {
        const val STORE_PREFIX = "nucleo.nudges.v1."
        const val LAST_TAP_KEY = "nucleo.nudges.lastTap"
        private const val DAY_MILLIS = 86_400_000L
        /** Unanswered, unspent ids older than this are dropped. */
        private const val KEEP_DAYS = 180L
        private const val FINISHED_KEPT = 300

        /** `nucleo.nudges.v1.<owner>`; signed out is `local`. */
        fun storeKey(owner: String?): String = STORE_PREFIX + (owner ?: "local")

        /** Account deletion: that account's nudge history leaves the phone. */
        fun forgetOwner(userId: String, store: KeyValueStore) {
            store.remove(storeKey(userId))
        }
    }
}
