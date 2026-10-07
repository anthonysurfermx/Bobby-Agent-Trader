package xyz.bobbyprotocol.android.v18.memory

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import xyz.bobbyprotocol.android.v18.MemoryReceipt
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.theses.HostWords
import xyz.bobbyprotocol.android.v18.theses.V18HostWords
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs

// Memory on the glass (1.8), a port of ios/Bobby/Sources/V18/Memory/MemoryNudges.swift. One source
// (`memory`, priority 60), two things it may say after a read, in this order:
//   1. The receipt: the server just told the app what its memory holds about this asset
//      (`MemoryReceipt`: recorded, and a count of at least one), so Bobby says it in one line of
//      facts and offers "See memory". A count the server did not send is never filled in.
//   2. The offer: someone signed in got a read, this phone's questions are not in memory and the
//      account has not answered the consent as it reads today. "How it works" opens the consent sheet.
// Nobody signed in: nothing (memory needs an account). The candidate reads stored state only.
//
// Both ids carry a short fragment of the account's hash: without it one account's tap would
// silence another account on the same phone.
// An offer the person opened and closed without answering is not an answer: it may come back once,
// under a second id, after a rest. A consent with a new version offers again under its own id.
object MemoryNudges {
    const val KEY = "memory"
    const val OFFER_ID_PREFIX = "memory.offer."
    const val RECEIPT_ID_PREFIX = "memory.kept."
    /** The route of the Memory screen (a 1.1.4 route). */
    const val MEMORY_ROUTE = "memory"
    /** An offer opened and closed without an answer rests this long before its one return. */
    const val REOFFER_AFTER_MILLIS = 7 * 86_400_000L
    /** Offers this account may open without answering before the glass stops asking (Memory › Turn on remains). */
    const val OFFER_ROUNDS = 2

    /** What the candidate reads besides the moment. Tests build it by hand; `liveState` reads the phone. */
    class State(
        /** The signed-in account, or null. */
        val user: String?,
        /** This phone's questions join memory for this account: the switch is on under an accepted consent. */
        val captureOn: Boolean,
        /** The account answered the consent as it reads today (yes or no). */
        val decided: Boolean,
        /** Times this account opened the offer ("How it works") for this consent version, and the last time. */
        val offerOpens: Int = 0,
        val offerOpenedAtMillis: Long? = null,
        /** The consent version the offer is for. */
        val version: Int = MemoryConsent.CURRENT_VERSION,
        /** The person erased what a receipt for this read would name (the read's moment, its symbol). */
        val erased: (Long, String) -> Boolean = { _, _ -> false },
    )

    /**
     * What the app registers: the source, and the hooks that keep this phone's switch true to the
     * consent before any question of the current reader leaves.
     */
    fun register(host: V18Host) {
        val center = MemoryCenter.of(host)
        val log = { MemoryOfferLog(host.store, center.consentVersion) }
        register(host, V18HostWords(host),
                 state = { liveState(host.owner, host.store, { center.storedNativeOptIn() }, center.consentVersion) { at, symbol -> center.erased(at, symbol) } },
                 offerOpened = { user, at -> log().noteOpened(user, at) })
        host.onAccountChanged { center.accountChanged() }
        host.onAppActive { center.reloadLocal() }
        host.onAccountDeleted { deleted ->
            // The switch itself goes with the account in the repository; this is the rest of what the phone kept for it.
            MemoryConsent(host.store).clear(deleted)
            MemoryOfferLog(host.store, center.consentVersion).clear(deleted)
        }
    }

    /** `state` is read at every candidate and `offerOpened` runs when the offer is tapped; tests pass their own. */
    fun register(host: V18Host, words: HostWords, state: () -> State, offerOpened: (String, Long) -> Unit) {
        host.nudges.register(NudgeSource(
            KEY, NudgePriority.MEMORY,
            { moment -> candidate(moment, state(), words) },
            { nudge ->
                // Only the account the offer was made to: its fragment is in the id.
                val user = state().user
                if (isOffer(nudge.id) && user != null && nudge.id.contains(fragment(user))) offerOpened(user, host.nudges.now())
                host.present(route(nudge.id))
            }))
    }

    /** The offer opens the consent; a receipt opens what is kept. */
    fun route(id: String): String = if (isOffer(id)) V18Routes.MEMORY_CONSENT else MEMORY_ROUTE
    fun isOffer(id: String): Boolean = id.startsWith(OFFER_ID_PREFIX)

    /**
     * What this phone stored for one account. Capture counts only under a yes to the consent as it
     * reads today, exactly as `MemoryCenter` keeps the switch.
     */
    fun liveState(user: String?, store: KeyValueStore, storedOptIn: () -> Boolean, version: Int = MemoryConsent.CURRENT_VERSION,
                  erased: (Long, String) -> Boolean = { _, _ -> false }): State {
        if (user == null) return State(null, captureOn = false, decided = false, version = version)
        val consent = MemoryConsent(store, version)
        val opened = MemoryOfferLog(store, version).entry(user)
        return State(user, captureOn = storedOptIn() && consent.hasAccepted(user), decided = consent.hasDecided(user),
                     offerOpens = opened?.opens ?: 0, offerOpenedAtMillis = opened?.atMillis, version = version, erased = erased)
    }

    fun candidate(moment: NudgeMoment, state: State, words: HostWords): NucleoNudge? {
        if (!moment.signedIn) return null
        val user = state.user ?: return null
        val read = moment.lastRead ?: return null
        // A receipt is the server's facts: it said "recorded" and counted at least this question.
        val receipt = read.memory
        if (receipt != null && receipt.recorded && receipt.asks >= 1 && !state.erased(read.atMillis, read.symbol)) {
            val id = receiptId(read.symbol, user)
            val text = MemoryReceiptLine(words).text(read.symbol, receipt)
            if (id != null && text != null) return NucleoNudge(id, text, words.text("See memory", "Ver memoria"))
        }
        if (state.captureOn || state.decided) return null
        val id = offerId(user, state.version, state.offerOpens, state.offerOpenedAtMillis, moment.nowMillis) ?: return null
        return NucleoNudge(id, words.text("I can pick this up next time", "Puedo retomar esto la próxima vez"),
                           words.text("How it works", "Cómo funciona"))
    }

    /**
     * Eight hex characters of the account's SHA-256: enough to keep accounts on one phone apart,
     * lowercase as the bridge pattern requires, and never the id itself.
     */
    fun fragment(user: String): String = MemoryConsent.digest(user).take(8)

    /**
     * `memory.offer.v<version>.<account>` the first time; `….2` for the one return after a rest
     * when the person opened the first and closed it without answering; null after that.
     */
    fun offerId(user: String, version: Int = MemoryConsent.CURRENT_VERSION, opens: Int = 0, openedAtMillis: Long? = null, now: Long): String? {
        val base = OFFER_ID_PREFIX + "v" + version + "." + fragment(user)
        if (opens <= 0) return base
        if (opens >= OFFER_ROUNDS || openedAtMillis == null || now - openedAtMillis < REOFFER_AFTER_MILLIS) return null
        return base + "." + (opens + 1)
    }

    /** `memory.kept.<account>.<symbol>`: each asset has its own receipt for each account, so each speaks at most a few times. */
    fun receiptId(symbol: String, user: String): String? {
        val head = RECEIPT_ID_PREFIX + fragment(user) + "."
        val slug = symbol.lowercase(Locale.ROOT).filter { it in 'a'..'z' || it in '0'..'9' }.take(48 - head.length)
        return if (slug.isEmpty()) null else head + slug
    }
}

/**
 * When an account opened the offer ("How it works") and how often, per consent version. A count
 * and a moment under the hash of the account id, on this phone only: it lets an offer that was
 * closed without an answer come back once instead of never, and stops it from coming back twice.
 */
class MemoryOfferLog(private val store: KeyValueStore, val version: Int = MemoryConsent.CURRENT_VERSION) {
    data class Entry(val opens: Int, val atMillis: Long)

    fun entry(user: String): Entry? {
        val raw = store.getString(key(user, version)) ?: return null
        return try {
            val json = JSONObject(raw)
            val opens = (json.opt("opens") as? Number)?.toInt() ?: return null
            val at = (json.opt("at") as? Number)?.toLong() ?: return null
            Entry(opens, at)
        } catch (_: Exception) {
            null
        }
    }

    fun noteOpened(user: String, atMillis: Long) {
        val opens = (entry(user)?.opens ?: 0) + 1
        store.putString(key(user, version), JSONObject().put("opens", opens).put("at", atMillis).toString())
    }

    fun clear(user: String) {
        store.remove(key(user, version))
    }

    companion object {
        const val KEY_PREFIX = "v18.memoryOffer."

        fun key(user: String, version: Int): String = KEY_PREFIX + "v" + version + "." + MemoryConsent.digest(user)
    }
}

/**
 * The receipt's one line, written from the server's facts only: a count, days, a percentage.
 * Every language has to fit the glass (`NucleoNudge.TEXT_LIMIT`), so the line is chosen from the
 * fullest form that fits down to the shortest; it is never cut mid-sentence.
 */
class MemoryReceiptLine(private val words: HostWords) {
    /** When the previous question was, with its verb ("asked 5 days ago") and without ("5 days ago"). */
    class Moment(val asked: String, val ago: String)

    /** Null when the server sent no count: the app never writes "first time" over a number it does not have. */
    fun text(symbol: String, receipt: MemoryReceipt): String? {
        if (receipt.asks < 1) return null
        return candidates(symbol, receipt).firstOrNull { it.codePointCount(0, it.length) <= NucleoNudge.TEXT_LIMIT }
            ?: words.text("Saved in memory", "Guardado en memoria")
    }

    /**
     * Fullest first. The price's move outranks the verb: where "asked … · up …" is too long for a
     * language, "… ago · up …" is tried before the move is given up.
     */
    fun candidates(symbol: String, receipt: MemoryReceipt): List<String> {
        if (receipt.asks < 1) return emptyList()
        val short = words.text("{0}: saved in memory", "{0}: guardado en memoria", symbol)
        // The first question about this asset (the server counted exactly one): nothing to compare with yet.
        if (receipt.asks == 1) return listOf(words.text("Saved: {0} is now in memory", "Guardado: {0} ya está en memoria", symbol), short)
        val lines = ArrayList<String>()
        val days = receipt.lastAskedDaysAgo
        if (days != null) {
            val moment = whenAsked(days)
            val moved = change(receipt.changeSinceLastAskPct)
            if (moved != null) {
                lines.add(framed(symbol, moment.asked + " · " + moved))
                lines.add(framed(symbol, moment.ago + " · " + moved))
            }
            lines.add(framed(symbol, moment.asked))
            lines.add(framed(symbol, moment.ago))
        }
        lines.add(words.text("{0}: asked {1}× so far", "{0}: {1} consultas hasta hoy", symbol, receipt.asks))
        lines.add(short)
        return lines
    }

    private fun framed(symbol: String, detail: String): String = words.text("{0}: {1}", "{0}: {1}", symbol, detail)

    /** The server counts whole 24-hour periods since the previous question, not calendar days. */
    fun whenAsked(days: Int): Moment = when {
        days < 1 -> Moment(words.text("asked less than a day ago", "preguntaste hace menos de un día"),
                           words.text("less than a day ago", "hace menos de un día"))
        days == 1 -> Moment(words.text("asked 1 day ago", "preguntaste hace 1 día"), words.text("1 day ago", "hace 1 día"))
        else -> Moment(words.text("asked {0} days ago", "preguntaste hace {0} días", days), words.text("{0} days ago", "hace {0} días", days))
    }

    /** The price's move since the previous question; null when the server sent none. */
    fun change(pct: Double?): String? {
        if (pct == null || !pct.isFinite()) return null
        if (abs(pct) < 0.05) return words.text("flat since", "sin cambio")
        val amount = percent(abs(pct))
        return if (pct > 0) words.text("up {0}% since", "subió {0}%", amount) else words.text("down {0}% since", "bajó {0}%", amount)
    }

    /** One decimal at most, with the app language's decimal mark ("4.2", "4,2", "12"). */
    fun percent(value: Double): String {
        val format = NumberFormat.getNumberInstance(Locale.forLanguageTag(words.locale))
        format.isGroupingUsed = false
        format.minimumFractionDigits = 0
        format.maximumFractionDigits = 1
        return format.format(value)
    }
}

/**
 * What memory is: two inventories and the end of use. The consent sheet shows all of it; the
 * memory screen shows the same words, so there is one explanation and one consent.
 *
 * The "sent" inventory mirrors `readerContext` in api/_lib/user-memory.ts, which hands the model
 * that writes the answer: the first name, the three preferences, this asset's count, dates, time
 * frame, price and price change, and up to five other assets asked about often. If that function
 * sends something new, this text changes with it and `MemoryConsent.CURRENT_VERSION` goes up.
 * Nothing here is folded, replaced by a glyph or called "a summary".
 */
object MemoryExplanation {
    data class Item(
        val id: String,
        /** A small label above the text; null for the closing lines. */
        val label: String?,
        val text: String,
        /** A boundary that belongs with the inventory ("Your question text is not kept."). */
        val note: String? = null,
    )

    /** The memory screen's compact form leaves out only where control lives (it is that screen). */
    fun items(words: HostWords, retentionDays: Int, compact: Boolean = false): List<Item> {
        val all = arrayListOf(
            Item("keep", words.text("Kept by Bobby", "Bobby guarda"),
                 words.text("Asset · date · stated time frame · price that day", "Activo · fecha · plazo indicado · precio de ese día"),
                 words.text("Your question text is not kept.", "Tu pregunta no se guarda como texto.")),
            Item("sent", words.text("Sent to the AI that answers", "Se envía a la IA que responde"),
                 words.text("Your first name · how often and when you asked about this asset · the time frame you named · its price that day and the change since · your preferences · your most-asked assets",
                            "Tu nombre de pila · cuántas veces y cuándo preguntaste por este activo · el plazo que mencionaste · su precio aquel día y el cambio desde entonces · tus preferencias · los activos por los que más preguntas")),
            // What the code guarantees (the server stops reading the row), not a deletion date.
            Item("howlong", null, words.text("Unused after {0} days without a question.", "Deja de usarse a los {0} días sin preguntar.", retentionDays)),
        )
        if (!compact) all.add(Item("control", null, words.text("Edit or delete in Memory.", "Edita o borra en Memoria.")))
        return all
    }
}
