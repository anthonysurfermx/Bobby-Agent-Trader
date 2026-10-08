package xyz.bobbyprotocol.android.v18.harness

import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import java.util.TreeMap
import kotlin.math.pow

// The harness (1.8): Bobby picks the thread back up. From the first question the phone keeps a
// small ledger of what the person did (which asset they asked about, whether they did something
// with a follow-up, what they said about how long they are looking), and everything Bobby does
// next is derived from it: which asset to come back to, when, and when to stop. A port of
// ios/Bobby/Sources/V18/Harness.
//   HarnessLedger    what happened (this file)
//   HarnessProfile   what that says about the person (this file, pure)
//   HarnessPlanner   the follow-ups that come next (pure)
//   HarnessCenter    the phone: permission, local notices, the line on the glass
// Invariants:
//  - It lives on this phone, per reader (an account, or `local` signed out). Nothing here is sent
//    anywhere, and no text the person wrote is ever kept: a symbol, a price, a moment, and fixed
//    values (a horizon out of five, 24/72/168 hours).
//  - Bounded: `MAX_EVENTS` events and `RETENTION_DAYS` days. Older ones go on every write. The one
//    exception is the pointer to a thesis, which lives exactly as long as its thesis (three at most).
//  - Erasable: `forget` removes a reader's ledger. Turning follow-ups off, withdrawing the risk
//    notice, "Delete everything" and deleting the account all call it.
//  - Only a real answer is an answer: `RETURNED` (they asked about, saved or acted on what a
//    follow-up was about, within a day of it). A tap on a notification (`OPENED`) is kept and
//    answers nothing.
//  - Every field added since Android 1.2.0 is optional: a ledger that build stored reads as it
//    was, an ask with no origin being the person's own question.
// The planner's rules are pinned for every platform in shared/harness/planner-golden.json
// (HarnessGoldenTest runs it). Every moment is epoch milliseconds.

internal const val HARNESS_HOUR_MS = 3_600_000L
internal const val HARNESS_DAY_MS = 86_400_000L

/**
 * The follow-ups Bobby can come back with. Which of them a question gets, and in what order, is
 * `HarnessChain` (HarnessPlanner.kt).
 */
enum class HarnessStep(val raw: String) {
    /** How the asset they asked about has moved. */
    ASSET("asset"),
    /** The sector that asset belongs to. In the tree, and in no chain that ships. */
    SECTOR("sector"),
    /** Their week: the assets they asked about. */
    WEEK("week");

    companion object {
        fun of(raw: String?): HarnessStep? = entries.firstOrNull { it.raw == raw }
    }
}

/**
 * How long the person is looking, in the desk's own five values (`Horizon` in
 * api/_lib/desk-debate.ts, returned in every reply's `sufficiency` block). A fixed value, never
 * the words they used.
 */
enum class HarnessHorizon(val raw: String) {
    INTRADAY("intraday"), WEEK("week"), MONTH("month"), LONG("long"), UNSPECIFIED("unspecified");

    /**
     * Whole days between a question and its first follow-up. A horizon only ever lengthens the
     * wait: "today" is still the next day. Null: no follow-up about the asset at all, the week only.
     */
    val waitDays: Int?
        get() = when (this) {
            INTRADAY, UNSPECIFIED -> 1
            WEEK -> 3
            MONTH -> 7
            LONG -> null
        }

    companion object {
        /** What the desk's reply says. Anything else is no horizon. */
        fun named(raw: Any?): HarnessHorizon? = (raw as? String)?.let { name -> entries.firstOrNull { it.raw == name } }

        /** A thesis is at least weeks long: "weeks" waits like a month, anything longer is long. */
        fun ofThesis(thesis: ThesisHorizon): HarnessHorizon = if (thesis == ThesisHorizon.WEEKS) MONTH else LONG
    }
}

/** One thing the person did, or one follow-up the phone showed them. */
data class HarnessEvent(
    val kind: Kind,
    val at: Long,
    val symbol: String? = null,
    val name: String? = null,
    val isEquity: Boolean? = null,
    /** `ASK`: the price the read was delivered with. */
    val price: Double? = null,
    /** `SENT`, `OPENED`, `RETURNED`: which follow-up. */
    val step: HarnessStep? = null,
    /** `SENT`, `OPENED`, `RETURNED` of a sector follow-up: the sector's id. */
    val sector: String? = null,
    /** `OPENED`, `RETURNED`: the moment of the follow-up they answer (its `SENT` has that `at`). */
    val ref: Long? = null,
    /** `ASK`: who started it, when it was not the person. */
    val origin: Origin? = null,
    /** `ASK`: a second question of their own about the read on screen. */
    val thread: Boolean? = null,
    /** `ASK`: the horizon the question named. `THESIS`: the one they set on it. */
    val horizon: HarnessHorizon? = null,
    /** `SAVED`: the review horizon they chose, 24, 72 or 168. */
    val horizonHours: Int? = null,
) {
    enum class Kind(val raw: String) {
        /** A read was delivered. */
        ASK("ask"),
        /** They saved that read. */
        SAVED("saved"),
        /**
         * The app came to the front. Never written any more: Android 1.2.0 kept one per half hour
         * and nothing read them, so the ledger refuses them and drops the ones it finds stored.
         */
        APP_OPEN("appOpen"),
        /** A follow-up's moment passed with the notice handed to the phone. */
        SENT("sent"),
        /** They tapped a follow-up notification. Kept, and an answer to nothing. */
        OPENED("opened"),
        /**
         * They did something useful with a follow-up: within a day they asked about it, saved a
         * read of it or acted on its line in the app. The only answer there is.
         */
        RETURNED("returned"),
        /**
         * They acted on something Bobby put in front of them inside the app (the line on the glass,
         * a row of a board, the question Bobby wrote after a read).
         */
        PICKED("picked"),
        /** A thesis they wrote about this asset is active. A pointer: the words stay in the thesis book. */
        THESIS("thesis");

        companion object {
            fun of(raw: String?): Kind? = entries.firstOrNull { it.raw == raw }
        }
    }

    /** Who started a read. The person's own question has none. */
    enum class Origin(val raw: String) {
        /** Bobby did: the button of a follow-up, a row of a board, the question Bobby wrote after a read, a chip. */
        FOLLOW_UP("followUp");

        companion object {
            fun of(raw: String?): Origin? = entries.firstOrNull { it.raw == raw }
        }
    }

    /** The one kind that says "this person answers Bobby". */
    val isAnswer: Boolean get() = kind == Kind.RETURNED

    /** A question the person asked by themselves: the only thing follow-ups start from. */
    val isQuestion: Boolean get() = kind == Kind.ASK && origin == null

    /** Only what is there is written: a symbol, a price, a moment, a fixed value. Never a question. */
    fun toJson(): JSONObject {
        val json = JSONObject().put("kind", kind.raw).put("at", at)
        if (symbol != null) json.put("symbol", symbol)
        if (name != null) json.put("name", name)
        if (isEquity != null) json.put("isEquity", isEquity)
        if (price != null) json.put("price", price)
        if (step != null) json.put("step", step.raw)
        if (sector != null) json.put("sector", sector)
        if (ref != null) json.put("ref", ref)
        if (origin != null) json.put("origin", origin.raw)
        if (thread != null) json.put("thread", thread)
        if (horizon != null) json.put("horizon", horizon.raw)
        if (horizonHours != null) json.put("horizonHours", horizonHours)
        return json
    }

    companion object {
        fun fromJson(json: JSONObject): HarnessEvent? {
            val kind = Kind.of(HarnessJson.text(json, "kind")) ?: return null
            val at = HarnessJson.long(json, "at") ?: return null
            return HarnessEvent(kind, at, HarnessJson.text(json, "symbol"), HarnessJson.text(json, "name"), json.opt("isEquity") as? Boolean,
                                HarnessJson.double(json, "price"), HarnessStep.of(HarnessJson.text(json, "step")), HarnessJson.text(json, "sector"),
                                HarnessJson.long(json, "ref"), Origin.of(HarnessJson.text(json, "origin")), json.opt("thread") as? Boolean,
                                HarnessHorizon.named(json.opt("horizon")), HarnessJson.int(json, "horizonHours"))
        }
    }
}

/** An asset the person asked about, as the ledger knows it. */
data class HarnessAsset(
    val symbol: String,
    val name: String,
    val isEquity: Boolean,
    /** The first ask still in the ledger (inside the window `assets` was called with). */
    val firstAskedAt: Long,
    val lastAskedAt: Long,
    /** The price at the last ask, when the read had one. */
    val lastPrice: Double?,
    /** The price at the first ask of the window `assets` was called with that had one. */
    val firstPrice: Double?,
    val asks: Int,
)

class HarnessLedger {
    private val list = ArrayList<HarnessEvent>()

    /** Oldest first. */
    val events: List<HarnessEvent> get() = list

    val isEmpty: Boolean get() = list.isEmpty()

    /** Adds one event in its place in time and drops what is too old or too much. Opening the app is never written. */
    fun note(event: HarnessEvent) {
        if (event.kind == HarnessEvent.Kind.APP_OPEN) return
        var kept = event
        if (kept.symbol != null) {
            val valid = validSymbol(kept.symbol) ?: return
            kept = kept.copy(symbol = valid)
        }
        val price = kept.price
        if (price != null && !(price.isFinite() && price > 0)) kept = kept.copy(price = null)
        val hours = kept.horizonHours
        if (hours != null && hours !in SAVE_HORIZONS) kept = kept.copy(horizonHours = null)
        val index = list.indexOfLast { it.at <= kept.at } + 1
        list.add(index, kept)
        prune(list.last().at)
    }

    /** A thesis pointer is not pruned: it goes when its thesis does (HarnessCenter keeps them in step). */
    fun prune(now: Long) {
        val cutoff = now - RETENTION_DAYS * HARNESS_DAY_MS
        list.removeAll { it.kind == HarnessEvent.Kind.APP_OPEN || (it.at < cutoff && it.kind != HarnessEvent.Kind.THESIS) }
        var extra = list.size - MAX_EVENTS
        if (extra > 0) {
            val each = list.iterator()
            while (extra > 0 && each.hasNext()) {
                if (each.next().kind == HarnessEvent.Kind.THESIS) continue
                each.remove()
                extra -= 1
            }
        }
    }

    /** Removes events matching `drop` (the pointer of a thesis that was archived, for instance). True when something went. */
    fun remove(drop: (HarnessEvent) -> Boolean): Boolean = list.removeAll(drop)

    /**
     * What was written about a read before the person said yes gains what was held back until
     * then (the horizon the question named, the one chosen on the save). True when it was there.
     */
    fun complete(full: HarnessEvent): Boolean {
        val symbol = full.symbol?.uppercase(Locale.ROOT)
        val index = list.indexOfFirst { it.kind == full.kind && it.at == full.at && it.symbol == symbol }
        if (index < 0) return false
        list[index] = list[index].copy(thread = full.thread, horizon = full.horizon, horizonHours = full.horizonHours?.takeIf { it in SAVE_HORIZONS })
        return true
    }

    /** Another ledger's events join this one (a signed-out reader signs in on the same phone). */
    fun merge(other: HarnessLedger) {
        if (other.list.isEmpty()) return
        val all = (list + other.list).sortedBy { it.at }
        list.clear()
        list.addAll(all)
        prune(list.last().at)
    }

    // Reading

    /** The ledger as it was at `now`: what is dated later has not happened yet. */
    fun upTo(now: Long): HarnessLedger {
        val last = list.lastOrNull() ?: return this
        if (last.at <= now) return this
        val past = HarnessLedger()
        past.list.addAll(list.filter { it.at <= now })
        return past
    }

    fun events(kind: HarnessEvent.Kind, since: Long? = null): List<HarnessEvent> =
        list.filter { it.kind == kind && (since == null || it.at > since) }

    /** Follow-ups shown since the person last answered one, and when the latest of them was. */
    class Streak(val count: Int, val last: Long?)

    fun unansweredStreak(before: Long): Streak {
        val lastAnswer = list.lastOrNull { it.at <= before && it.isAnswer }?.at
        val shown = list.filter { it.kind == HarnessEvent.Kind.SENT && it.at <= before && (lastAnswer == null || it.at > lastAnswer) }
        return Streak(shown.size, shown.lastOrNull()?.at)
    }

    /**
     * The question follow-ups belong to: the latest one the person asked by themselves. A tap, an
     * answer or a read Bobby started never takes its place.
     */
    fun question(before: Long): HarnessEvent? = list.lastOrNull { it.at <= before && it.isQuestion }

    /** The assets asked about since `since`, most recently asked first. */
    fun assets(since: Long, now: Long): List<HarnessAsset> {
        val bySymbol = LinkedHashMap<String, ArrayList<HarnessEvent>>()
        for (event in list) {
            if (event.kind != HarnessEvent.Kind.ASK || event.at < since || event.at > now) continue
            val symbol = event.symbol ?: continue
            bySymbol.getOrPut(symbol) { ArrayList() }.add(event)
        }
        return bySymbol.map { (symbol, asks) ->
            val first = asks.first()
            val last = asks.last()
            HarnessAsset(symbol, last.name ?: symbol, last.isEquity ?: false, first.at, last.at, last.price,
                         asks.firstOrNull { it.price != null }?.price, asks.size)
        }.sortedByDescending { it.lastAskedAt }
    }

    fun asset(symbol: String, since: Long, now: Long): HarnessAsset? {
        val wanted = symbol.uppercase(Locale.ROOT)
        return assets(since, now).firstOrNull { it.symbol == wanted }
    }

    // Stored as `{"events": [...]}`, the shape iOS writes.

    fun toJson(): JSONObject {
        val array = JSONArray()
        for (event in list) array.put(event.toJson())
        return JSONObject().put("events", array)
    }

    override fun equals(other: Any?): Boolean = other is HarnessLedger && other.list == list
    override fun hashCode(): Int = list.hashCode()
    override fun toString(): String = "HarnessLedger($list)"

    companion object {
        const val MAX_EVENTS = 300
        const val RETENTION_DAYS = 60
        /** Same rule as the desk's symbols. */
        val SYMBOL_PATTERN = Regex("^[A-Z0-9][A-Z0-9.^=-]{0,19}$")
        /** The reviews a save offers, in hours. Anything else is no choice of theirs and is not kept. */
        val SAVE_HORIZONS: Set<Int> = setOf(24, 72, 168)

        fun validSymbol(raw: String?): String? {
            val symbol = raw?.uppercase(Locale.ROOT) ?: return null
            return if (SYMBOL_PATTERN.matches(symbol)) symbol else null
        }

        /**
         * What was stored, read back. Anything that is not a ledger is an empty one; an entry that
         * is not an event is skipped, and so is every app opening Android 1.2.0 wrote (they leave
         * the phone with the next write).
         */
        fun fromJson(raw: String?): HarnessLedger {
            val ledger = HarnessLedger()
            if (raw.isNullOrEmpty()) return ledger
            val array = try { JSONObject(raw).optJSONArray("events") } catch (_: Exception) { null } ?: return ledger
            val read = ArrayList<HarnessEvent>()
            for (i in 0 until array.length()) {
                val event = array.optJSONObject(i)?.let { HarnessEvent.fromJson(it) } ?: continue
                if (event.kind == HarnessEvent.Kind.APP_OPEN) continue
                // The same rules `note` applies, for a store somebody else may have written to.
                val symbol = if (event.symbol == null) null else validSymbol(event.symbol) ?: continue
                val price = event.price?.takeIf { it.isFinite() && it > 0 }
                read.add(event.copy(symbol = symbol, price = price, horizonHours = event.horizonHours?.takeIf { it in SAVE_HORIZONS }))
            }
            ledger.list.addAll(read.sortedBy { it.at })
            return ledger
        }
    }
}

/**
 * What the ledger says about the person. Pure, recomputed whenever it is needed, never stored:
 * deleting the ledger deletes everything Bobby "learned".
 */
class HarnessProfile(
    /** How much each asset matters to them right now (recent and repeated actions weigh more). */
    val interest: Map<String, Double>,
    /** The hour they tend to answer follow-ups at, once there is enough to tell. Local time. */
    val hour: Int?,
    /** Follow-ups shown in the last `STATS_DAYS`, per kind. */
    val sent: Map<HarnessStep, Int>,
    /** Of those, the ones they answered (`RETURNED`). A tap is not one. */
    val answered: Map<HarnessStep, Int>,
    /** Per kind: how many of the latest ones in a row went unanswered. */
    val ignored: Map<HarnessStep, Int>,
) {
    /**
     * Its last `IGNORED_LIMIT` showings went unanswered: Bobby stops sending that kind for now. An
     * answer from before those showings does not count for them.
     */
    fun rests(step: HarnessStep): Boolean = (ignored[step] ?: 0) >= IGNORED_LIMIT

    /** The asset that matters most among `symbols`; ties go to the order given. */
    fun favourite(symbols: List<String>): String? {
        var best: String? = null
        var bestScore = 0.0
        for (symbol in symbols) {
            val score = interest[symbol] ?: 0.0
            if (best == null || score > bestScore) {
                best = symbol
                bestScore = score
            }
        }
        return best
    }

    companion object {
        /** Interest halves every this many days. */
        const val HALF_LIFE_DAYS = 7.0
        const val STATS_DAYS = 30L
        /** A kind whose last showings, this many in a row, went unanswered rests until they leave the window. */
        const val IGNORED_LIMIT = 2
        /** Answers needed before the hour they come at is trusted over the hour they asked at. */
        const val HOUR_SAMPLES = 3

        /**
         * What each thing they did says about how much the asset matters. An answered follow-up
         * weighs as much as a question, on top of the question, save or pick that answered it. A
         * tap alone weighs half a question: they looked, and did nothing with it.
         */
        val WEIGHTS: Map<HarnessEvent.Kind, Double> = mapOf(
            HarnessEvent.Kind.ASK to 1.0, HarnessEvent.Kind.SAVED to 1.0, HarnessEvent.Kind.PICKED to 1.0,
            HarnessEvent.Kind.OPENED to 0.5, HarnessEvent.Kind.RETURNED to 1.0,
        )
        /** A second question of their own about the same read, on top of the question itself. */
        const val THREAD_WEIGHT = 1.0
        /** A thesis they wrote and keep active. It does not fade: it counts until the thesis is archived. */
        const val THESIS_WEIGHT = 2.0

        fun make(ledger: HarnessLedger, now: Long, zone: ZoneId): HarnessProfile {
            val interest = HashMap<String, Double>()
            val sent = HashMap<HarnessStep, Int>()
            val answered = HashMap<HarnessStep, Int>()
            val ignored = HashMap<HarnessStep, Int>()
            // hour -> (answers at that hour, the latest of them)
            val hours = TreeMap<Int, Pair<Int, Long>>()
            val statsFrom = now - STATS_DAYS * HARNESS_DAY_MS
            val theses = HashSet<String>()
            for (event in ledger.events) {
                if (event.at > now) continue
                val symbol = event.symbol
                if (symbol != null) {
                    if (event.kind == HarnessEvent.Kind.THESIS) {
                        // One thesis, one weight: a pointer written twice is not two theses.
                        if (theses.add(symbol)) interest[symbol] = (interest[symbol] ?: 0.0) + THESIS_WEIGHT
                    } else {
                        val weight = WEIGHTS[event.kind]
                        if (weight != null) {
                            val ageDays = (now - event.at) / HARNESS_DAY_MS.toDouble()
                            val whole = weight + if (event.thread == true) THREAD_WEIGHT else 0.0
                            interest[symbol] = (interest[symbol] ?: 0.0) + whole * 0.5.pow(ageDays / HALF_LIFE_DAYS)
                        }
                    }
                }
                val step = event.step
                if (event.at < statsFrom || step == null) continue
                if (event.kind == HarnessEvent.Kind.SENT) {
                    sent[step] = (sent[step] ?: 0) + 1
                    ignored[step] = (ignored[step] ?: 0) + 1
                }
                if (event.isAnswer) {
                    answered[step] = (answered[step] ?: 0) + 1
                    ignored[step] = 0
                    val hour = Instant.ofEpochMilli(event.at).atZone(zone).hour
                    val seen = hours[hour]
                    hours[hour] = Pair((seen?.first ?: 0) + 1, maxOf(seen?.second ?: event.at, event.at))
                }
            }
            val samples = hours.values.sumOf { it.first }
            // The hour with the most answers; between two, the one answered at most recently.
            val best = hours.entries.maxWithOrNull(compareBy<Map.Entry<Int, Pair<Int, Long>>>({ it.value.first }, { it.value.second }))
            return HarnessProfile(interest, if (samples >= HOUR_SAMPLES) best?.key else null, sent, answered, ignored)
        }
    }
}

/** Whether the person wants Bobby to come back to them. */
enum class HarnessMode(val raw: String) {
    /** Never asked. The ledger is kept so the offer can be made; nothing is ever scheduled. */
    UNDECIDED("undecided"),
    ON("on"),
    /** They said no: nothing is kept and nothing is scheduled. */
    OFF("off");

    companion object {
        fun of(raw: String?): HarnessMode? = entries.firstOrNull { it.raw == raw }
    }
}

/** Where each reader's ledger is kept on the phone (the `bobby.v18` store, the keys iOS uses). */
class HarnessStore(private val store: KeyValueStore) {
    fun ledger(owner: String?): HarnessLedger = HarnessLedger.fromJson(store.getString(key(PREFIX, owner)))

    fun write(ledger: HarnessLedger, owner: String?) {
        val key = key(PREFIX, owner)
        if (ledger.isEmpty) store.remove(key) else store.putString(key, ledger.toJson().toString())
    }

    fun mode(owner: String?): HarnessMode = HarnessMode.of(store.getString(key(MODE_PREFIX, owner))) ?: HarnessMode.UNDECIDED

    fun write(mode: HarnessMode, owner: String?) {
        val key = key(MODE_PREFIX, owner)
        if (mode == HarnessMode.UNDECIDED) store.remove(key) else store.putString(key, mode.raw)
    }

    fun plan(owner: String?): List<HarnessPlanned> {
        val raw = store.getString(key(PLAN_PREFIX, owner)) ?: return emptyList()
        val array = try { JSONArray(raw) } catch (_: Exception) { return emptyList() }
        val plan = ArrayList<HarnessPlanned>()
        for (i in 0 until array.length()) plan.add(array.optJSONObject(i)?.let { HarnessPlanned.fromJson(it) } ?: return emptyList())
        return plan
    }

    fun write(plan: List<HarnessPlanned>, owner: String?) {
        val key = key(PLAN_PREFIX, owner)
        if (plan.isEmpty()) {
            store.remove(key)
            return
        }
        val array = JSONArray()
        for (item in plan) array.put(item.toJson())
        store.putString(key, array.toString())
    }

    /** Everything the harness keeps about one reader. */
    fun forget(owner: String?) {
        for (prefix in listOf(PREFIX, MODE_PREFIX, PLAN_PREFIX)) store.remove(key(prefix, owner))
    }

    /**
     * What was kept and what was planned go; a no stays (the Memory screen's "Delete everything").
     * Erasing notes is not a way to be asked again: a reader who turned follow-ups off stays off.
     * Any other answer goes with the notes, so a yes is asked for again before anything is kept.
     */
    fun forgetNotes(owner: String?) {
        val refused = mode(owner) == HarnessMode.OFF
        forget(owner)
        if (refused) write(HarnessMode.OFF, owner)
    }

    companion object {
        const val PREFIX = "v18.harness.v1."
        const val MODE_PREFIX = "v18.harness.mode."
        const val PLAN_PREFIX = "v18.harness.plan."

        fun key(prefix: String, owner: String?): String = prefix + (owner ?: "local")

        /** Account deletion: nothing of that account stays on the phone. */
        fun forgetOwner(userId: String, store: KeyValueStore) {
            HarnessStore(store).forget(userId)
        }
    }
}

/** Reading stored JSON the same way on the phone and in JVM tests (`optString` on a JSON null differs between them). */
internal object HarnessJson {
    fun text(json: JSONObject, key: String): String? = if (json.isNull(key)) null else json.opt(key) as? String

    fun double(json: JSONObject, key: String): Double? =
        if (json.isNull(key)) null else (json.opt(key) as? Number)?.toDouble()?.takeIf { it.isFinite() }

    fun long(json: JSONObject, key: String): Long? {
        val number = double(json, key) ?: return null
        return if (number >= 0 && number < 9e15) Math.round(number) else null
    }

    fun int(json: JSONObject, key: String): Int? = long(json, key)?.takeIf { it <= Int.MAX_VALUE }?.toInt()
}
