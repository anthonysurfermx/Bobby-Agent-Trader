package xyz.bobbyprotocol.android.v18.credits

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.IsoFields
import java.util.Locale

// Credits on the glass (1.8), owned by the `credits-invite` track. A port of
// ios/Bobby/Sources/V18/Credits/CreditsNudges.swift. Two things are worth one line on the main screen:
//   · a free account that is about to run out of this week's Quick reads, and
//   · gifted reads the person has not been shown on this phone.
// Both read only what the app already holds (CreditsCenter). A candidate never touches the network,
// and the tap opens the Credits screen.

/**
 * What this phone has already said about the gifted balance, so a gift is announced when it
 * arrives and not again every time one of its reads is spent. It holds a few counts and the
 * account they belong to; it is erased when that account signs out or is deleted.
 */
data class CreditsGiftLedger(
    val owner: String? = null,
    /** The gifted total last seen for `owner`. */
    val last: Int = 0,
    /** The total when a gift arrived that the person has not been shown yet: it names the nudge. */
    val announce: Int? = null,
    /** How many gifted reads arrived since the person last saw the balance: what the line says. */
    val arrived: Int? = null,
    /**
     * The size of the latest drop in the total. A rise of exactly that size is a read the server
     * handed back (a refused read), not a gift.
     */
    val spent: Int = 0,
) {
    /** The server's gifted total for `owner`, as the app just read it. */
    fun observe(total: Int, owner: String): CreditsGiftLedger {
        val seen = maxOf(0, total)
        // First word about this account on this phone: whatever it holds is news here.
        if (this.owner != owner) return CreditsGiftLedger(owner, seen, if (seen > 0) seen else null, if (seen > 0) seen else null)
        var nextAnnounce = announce
        var nextArrived = arrived
        var nextSpent = spent
        if (seen > last) {
            val rise = seen - last
            if (rise != spent) {
                nextArrived = (arrived ?: 0) + rise
                nextAnnounce = seen
            }
            nextSpent = 0
        } else if (seen < last) {
            nextSpent = last - seen
        }
        if (seen == 0) {
            nextAnnounce = null
            nextArrived = null
        }
        return CreditsGiftLedger(owner, seen, nextAnnounce, nextArrived, nextSpent)
    }

    /** The person saw the balance (the Credits screen showed it, or they tapped the nudge). */
    fun acknowledge(): CreditsGiftLedger = copy(announce = null, arrived = null)

    fun save(store: KeyValueStore) {
        val who = owner
        if (who == null) {
            store.remove(STORE_KEY)
            return
        }
        val json = JSONObject().put("owner", who).put("last", last).put("spent", spent)
        if (announce != null) json.put("announce", announce)
        if (arrived != null) json.put("arrived", arrived)
        store.putString(STORE_KEY, json.toString())
    }

    companion object {
        const val STORE_KEY = "credits.giftLedger.v1"

        fun load(store: KeyValueStore): CreditsGiftLedger {
            val raw = store.getString(STORE_KEY) ?: return CreditsGiftLedger()
            return try {
                val json = JSONObject(raw)
                val owner = (json.opt("owner") as? String)?.takeIf { it.isNotEmpty() } ?: return CreditsGiftLedger()
                val announce = whole(json, "announce")
                // A ledger written before `arrived` and `spent` existed still reads: its unshown total is what arrived.
                CreditsGiftLedger(owner, whole(json, "last") ?: 0, announce, whole(json, "arrived") ?: announce, whole(json, "spent") ?: 0)
            } catch (_: Exception) {
                CreditsGiftLedger()
            }
        }

        private fun whole(json: JSONObject, key: String): Int? = (json.opt(key) as? Number)?.toInt()
    }
}

/** What the app holds about the gifted balance, tagged with the reader it was read for. */
data class GiftReading(val owner: String?, val epoch: Long, val total: Int)

/**
 * Keeps the gift ledger: what the app reads is written under the account it was read for, and never
 * under the next one. On iOS the level centre can still hold the previous account's numbers after
 * the account changes, so its book raises a fence until the centre lets go. On Android every reading
 * carries the reader and the account moment it belongs to (the quota store does), so a reading that
 * is not about the person who is here now is simply not written.
 */
class CreditsGiftBook(private val store: KeyValueStore) {
    var ledger: CreditsGiftLedger = CreditsGiftLedger()
        private set

    /** What an earlier launch left on this phone. */
    fun load() {
        ledger = CreditsGiftLedger.load(store)
    }

    /** The Credits screen showed the gifted balance, or the nudge was tapped. */
    fun acknowledge() {
        if (ledger.announce == null && ledger.arrived == null) return
        ledger = ledger.acknowledge()
        ledger.save(store)
    }

    /** `reading` is what the app holds now (null while nothing was read), for the account that is signed in now. */
    fun record(reading: GiftReading?, owner: String?, epoch: Long) {
        if (reading == null || owner == null) return
        if (reading.owner != owner || reading.epoch != epoch) return
        val before = ledger
        ledger = ledger.observe(reading.total, owner)
        if (ledger != before) ledger.save(store)
    }

    /** The session changed (sign out, deletion, another account, or the same one signing back in). */
    fun accountChanged(owner: String?) {
        if (ledger.owner == owner) return
        // Signed out, deleted, or another account: nothing about the previous one stays on the phone.
        ledger = CreditsGiftLedger()
        ledger.save(store)
    }

    /** Account deletion: whatever this phone kept about that account's gifts goes with it. */
    fun forget(owner: String) {
        if (ledger.owner == owner) {
            ledger = CreditsGiftLedger()
            ledger.save(store)
        } else if (CreditsGiftLedger.load(store).owner == owner) {
            store.remove(CreditsGiftLedger.STORE_KEY)
        }
    }
}

object CreditsNudges {
    const val KEY = "credits"
    /** At this many Quick reads or fewer, the week is about to run out. */
    const val LOW_THRESHOLD = 2
    const val LOW_PREFIX = "credits.low."
    const val GIFT_PREFIX = "credits.gift."

    /** The app's own: the centre reads what the repository holds. */
    fun register(host: V18Host) {
        register(host, CreditsCenter.of(host))
    }

    /** `center` is the app's own unless a suite hands its own in. */
    fun register(host: V18Host, center: CreditsCenter) {
        center.start()
        val words = HostWords(host)
        host.nudges.register(NudgeSource(KEY, NudgePriority.CREDITS,
            candidate = { moment ->
                val options = listOfNotNull(low(moment, center.access(), words), gift(moment, center.book.ledger, host.owner, words))
                // A line that is resting must not keep the other one from speaking.
                options.firstOrNull { host.nudges.eligible(it.id, moment.nowMillis) } ?: options.firstOrNull()
            },
            act = { nudge ->
                if (nudge.id.startsWith(GIFT_PREFIX)) center.book.acknowledge()
                host.present(V18Routes.CREDITS)
            }))
    }

    // Candidates (pure)

    /**
     * A signed-in free account with the weekly cap on and two or fewer Quick reads left, and no
     * gifted Quick reads to fall back on (with those, the next read is not refused).
     */
    fun low(moment: NudgeMoment, access: ReadAccess?, words: Words): NucleoNudge? {
        if (!moment.signedIn || access == null || access.tier != "free" || !access.paywall || access.bonus != 0) return null
        val limit = access.limit ?: return null
        if (limit <= 0) return null
        // The server's window rolls: once its reset moment has passed, at least one read is back
        // and these numbers are old. Say nothing until the server speaks again.
        val resets = access.resetsMillis
        if (resets != null && resets <= moment.nowMillis) return null
        // A balance the server left half said is not a low balance: nothing is said.
        val left = CreditsBalance.readsLeft(access.remaining, limit, access.used) ?: return null
        if (left > LOW_THRESHOLD) return null
        val text = when (left) {
            0 -> words.text("No reads left this week", "Sin lecturas esta semana")
            1 -> words.text("1 read left this week", "Te queda 1 lectura esta semana")
            else -> words.text("{0} reads left this week", "Te quedan {0} lecturas esta semana", left)
        }
        // One nudge per calendar week. The server's `resetsAt` is the oldest read plus seven days,
        // so it moves every time a read leaves the window and cannot name a week.
        return NucleoNudge(LOW_PREFIX + week(moment.nowMillis), text, seeCredits(words))
    }

    /**
     * Gifted reads that arrived and were not shown yet. The line says how many arrived; the id
     * carries the total at arrival, so spending one of them does not make it a new nudge.
     */
    fun gift(moment: NudgeMoment, ledger: CreditsGiftLedger, owner: String?, words: Words): NucleoNudge? {
        if (!moment.signedIn || owner == null || ledger.owner != owner || ledger.last <= 0) return null
        val announced = ledger.announce ?: return null
        val reads = ledger.arrived ?: return null
        if (announced <= 0 || reads <= 0) return null
        val text = if (reads == 1) words.text("Bobby gave you 1 read", "Bobby te regaló 1 lectura")
                   else words.text("Bobby gave you {0} reads", "Bobby te regaló {0} lecturas", reads)
        return NucleoNudge(GIFT_PREFIX + announced, text, seeCredits(words))
    }

    fun seeCredits(words: Words): String = words.text("See credits", "Ver créditos")

    /** The ISO week in UTC, lowercase (`2026-w41`): the same instant names the same nudge on every phone. */
    fun week(millis: Long): String {
        val day = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC)
        return String.format(Locale.ROOT, "%04d-w%02d", day.get(IsoFields.WEEK_BASED_YEAR), day.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR))
    }

    fun giftTotal(access: ReadAccess?, meters: Map<CreditsLevel, LevelMeter>): Int =
        (access?.bonus ?: 0) + (meters[CreditsLevel.PROFUNDO]?.bonus ?: 0) + (meters[CreditsLevel.MAXIMO]?.bonus ?: 0)
}
