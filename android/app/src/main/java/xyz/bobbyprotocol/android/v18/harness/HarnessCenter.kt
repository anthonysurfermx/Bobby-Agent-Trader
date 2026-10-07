package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import java.time.ZoneId
import java.util.Locale
import kotlin.math.abs

// The harness (1.8): the phone's side. It writes what the person does into the ledger, asks
// HarnessPlanner what comes next, and hands that to the phone as local notices. No server, no push
// token, no account needed: a person who asked one question signed out is followed up exactly
// like anyone else, and nothing about them leaves the phone.
// A port of ios/Bobby/Sources/V18/Harness/HarnessCenter.swift. Invariants:
//  - The notification permission is asked ONLY inside `accept`, which only the person's own
//    "Yes, tell me" (the offer on the glass) or the Follow-ups switch calls. Never at launch, never
//    from housekeeping.
//  - Nothing is recorded or scheduled before the risk notice is accepted; withdrawing it erases
//    the ledger and cancels everything. Turning follow-ups off does the same.
//  - What the phone holds is always the plan of whoever uses the phone now: another account, or
//    none, cancels the previous reader's follow-ups before anything else.
//  - A follow-up names the asset the person asked about and nothing else: no price, no figure, no
//    direction. The number is read when they open it.
//  - A follow-up whose moment has passed is written to the ledger as `SENT` exactly once; whether
//    it was opened is what the next plan learns from.
//  - A notice carries a tag of the reader it was planned for and the moment it was planned for. A
//    tap whose tag is not the current reader's does nothing, and what was already shown is taken
//    off the notification shade when the reader changes.
// Where Android differs from iOS:
//  - The notifier answers at once (v18/notify/LocalNotifier.kt), so bringing the phone in line
//    with the plan (`apply`) is one uninterrupted step on the main thread. iOS has to serialize its
//    syncs and guard them with a revision; here the only places this class waits are the system's
//    permission question and a price, and each checks who is reading, and whether the person
//    opted out, when it comes back.
//  - Delivery is inexact: the phone shows a notice at or after its moment (later still while it
//    is idle). `SENT` is always written with the planned moment.
// Main thread only.

/** What a tapped (or just delivered) follow-up carries. */
data class HarnessTap(
    val step: HarnessStep,
    val symbol: String?,
    val sector: String?,
    /** The tag of the reader the notice was planned for (`V18Reader.tag`). Null only for a tap the app builds itself. */
    val owner: String? = null,
    /** The moment the notice was planned for: which follow-up this is. */
    val stamp: Long? = null,
) {
    companion object {
        const val STEP = "step"
        const val SYMBOL = "symbol"
        const val SECTOR = "sector"
        const val AT = "at"

        /** Reads `{kind: "follow-up", step: …}`. Anything else is not a follow-up. */
        fun from(payload: Map<String, String>): HarnessTap? {
            if (payload[LocalNotice.KIND] != HarnessCenter.KIND) return null
            val step = HarnessStep.of(payload[STEP]) ?: return null
            val symbol = HarnessLedger.validSymbol(payload[SYMBOL])
            val sector = payload[SECTOR]?.takeIf { id -> HarnessSectors.all.any { it.id == id } }
            if (step != HarnessStep.WEEK && symbol == null) return null
            if (step == HarnessStep.SECTOR && sector == null) return null
            // A notice this app planned always says whose it is and when it was for.
            val owner = payload[LocalNotice.OWNER]?.takeIf { it.isNotEmpty() && it.length <= 32 } ?: return null
            val at = payload[AT]?.toLongOrNull()?.takeIf { it > 0 } ?: return null
            return HarnessTap(step, symbol, sector, owner, at)
        }
    }
}

/** A price read that costs no read: the latest price and the day's change, each only when the phone got it. */
data class HarnessQuote(val price: Double?, val changePct: Double?)

/**
 * The line on the glass when the person comes back: the asset they asked about and, when the
 * phone could read both prices, how far it moved since.
 */
data class HarnessMove(
    val symbol: String,
    val name: String,
    val isEquity: Boolean,
    val askedAt: Long,
    val priceThen: Double?,
    val priceNow: Double?,
    /** Whole days since they asked (at least one). */
    val days: Int,
) {
    val pct: Double?
        get() {
            if (priceThen == null || priceNow == null || priceThen <= 0 || priceNow <= 0) return null
            val pct = (priceNow / priceThen - 1) * 100
            return if (pct.isFinite() && abs(pct) < 1_000) pct else null
        }
}

/** What the Follow-ups switch draws. */
data class HarnessView(
    val mode: HarnessMode = HarnessMode.UNDECIDED,
    /** The switch is being saved (the system may be asking for permission). */
    val saving: Boolean = false,
    val permission: LocalNotifier.Permission = LocalNotifier.Permission.NOT_DETERMINED,
    /** They asked about something in the last seven days: the week has something in it. */
    val hasWeek: Boolean = false,
)

class HarnessCenter(private val notifier: LocalNotifier, private val store: HarnessStore, val copy: HarnessCopy) {
    enum class Outcome {
        /** Follow-ups are on and the phone lets Bobby show them. */
        ON,
        /** Follow-ups are on inside the app; the phone does not let Bobby show notifications. */
        DENIED,
        /** The risk notice is not accepted: nothing was asked and nothing changed. */
        CONSENT_REQUIRED,
        /** The account changed, or the person opted out, while the system was asking. */
        FAILED,
    }

    var now: () -> Long = { System.currentTimeMillis() }
    var zone: () -> ZoneId = { ZoneId.systemDefault() }
    /** Withdrawn until the app says otherwise: a centre nobody wired records nothing. */
    var consent: () -> RiskNotice = { RiskNotice.WITHDRAWN }
    var currentUser: () -> String? = { null }
    /** Changes on every sign-in, sign-out and deletion. */
    var currentEpoch: () -> Long = { 0L }
    /** A paying account that already hears about its Monday briefing on this phone gets its week from the server. */
    var weeklyCovered: () -> Boolean = { false }
    /** The latest price of an asset, read without spending a read. Null when it could not be read. Must not throw. */
    var market: suspend (String) -> HarnessQuote? = { null }
    /** The app's language (`en`, `es`…): the lines on the lock screen are written in it. */
    var language: () -> String = { "" }
    /** The glass has something new to draw (the session listens). */
    var changed: () -> Unit = {}

    var mode: HarnessMode = HarnessMode.UNDECIDED
        private set
    var status: LocalNotifier.Permission = LocalNotifier.Permission.NOT_DETERMINED
        private set
    /** What the phone will show, earliest first. */
    var upcoming: List<HarnessFollowUp> = emptyList()
        private set
    var move: HarnessMove? = null
        private set
    var saving: Boolean = false
        private set
    var owner: String? = null
        private set
    var ledger: HarnessLedger = HarnessLedger()
        private set
    /** The language the lines the phone holds were last written in. */
    var wordsIn: String? = null
        private set

    private val shown = MutableStateFlow(HarnessView())
    /** For the switch in Reminders. */
    val view: StateFlow<HarnessView> get() = shown

    private class Focus(val symbol: String, val at: Long)
    private class Quoted(val price: Double, val at: Long)

    private var planned: List<HarnessPlanned> = emptyList()
    /** The plan as the store holds it, so an unchanged plan is not written again on every launch and every question. */
    private var storedPlan: List<HarnessPlanned> = emptyList()
    /** What this launch handed to the phone (id → what it said and when), so nothing is written twice. */
    private val issued = HashMap<String, LocalNotice>()
    private var focus: Focus? = null
    private val quotes = HashMap<String, Quoted>()
    /** Prices being read right now: two requests for the same line are one. */
    private val reading = HashSet<String>()
    /** Grows whenever this reader is erased: a yes that was waiting for the system's answer does not undo it. */
    private var erasures = 0
    /** The board a tap or a row asked for, handed to the sheet once. */
    private var boardFocus: HarnessTap? = null

    // Reading

    val profile: HarnessProfile get() = HarnessProfile.make(ledger, now(), zone())

    /** Follow-ups are wanted and nothing stands in their way but, possibly, the phone's settings. */
    val isOn: Boolean get() = mode == HarnessMode.ON

    /** A tap (or a delivery) belongs to whoever uses the phone now. */
    fun accepts(tap: HarnessTap): Boolean = tap.owner == null || tap.owner == V18Reader.tag(owner)

    /** The line for the glass, only for the reader it was made for. */
    fun moveOnGlass(): HarnessMove? = if (mode != HarnessMode.OFF && consent() == RiskNotice.ACCEPTED && owner == currentUser()) move else null

    fun focusBoard(tap: HarnessTap?) {
        boardFocus = tap
    }

    fun takeBoardFocus(): HarnessTap? = boardFocus.also { boardFocus = null }

    /** Reads one reader's ledger, switch and plan from the phone. */
    fun load(owner: String?) {
        this.owner = owner
        ledger = store.ledger(owner)
        mode = store.mode(owner)
        planned = store.plan(owner)
        storedPlan = planned
        upcoming = planned.map { it.followUp }
        focus = null
        quotes.clear()
        move = null
        boardFocus = null
        publish()
    }

    // What the person does

    /** A read was delivered. The first one starts everything. */
    fun noteAsk(symbol: String, name: String, isEquity: Boolean, price: Double?) {
        if (!recording) return
        val clock = now()
        // The answer comes first in time: what follows starts from the question itself.
        answerIfUseful(symbol, clock - 1)
        note(HarnessEvent(HarnessEvent.Kind.ASK, clock, symbol = symbol, name = name, isEquity = isEquity, price = price))
        // They are looking at it now: the line about "since you asked" has nothing to say yet.
        // (iOS keeps a tapped follow-up's hold on the glass here; on Android it lets go with the line.)
        val asked = symbol.uppercase(Locale.ROOT)
        if (move?.symbol == asked) move = null
        if (focus?.symbol == asked) focus = null
        replan()
    }

    fun noteSaved(symbol: String) {
        if (!recording) return
        note(HarnessEvent(HarnessEvent.Kind.SAVED, now(), symbol = symbol))
    }

    /** They acted on a follow-up inside the app. */
    fun notePicked(symbol: String) {
        if (!recording) return
        val clock = now()
        note(HarnessEvent(HarnessEvent.Kind.PICKED, clock, symbol = symbol))
        val picked = symbol.uppercase(Locale.ROOT)
        if (focus?.symbol == picked) focus = null
        if (move?.symbol == picked) move = null
        if (answerIfUseful(symbol, clock)) replan()
    }

    /**
     * A follow-up shown in the last day that nobody answered yet is answered by something useful
     * about it: its asset (or an asset of its sector; anything, for the week). True when it was.
     */
    private fun answerIfUseful(raw: String, clock: Long): Boolean {
        val symbol = HarnessLedger.validSymbol(raw) ?: return false
        val shown = ledger.events(HarnessEvent.Kind.SENT).lastOrNull { clock - it.at <= USEFUL_WINDOW_MS && it.at <= clock } ?: return false
        if (ledger.events.any { it.isEngagement && it.ref == shown.at }) return false
        val about = when (shown.step) {
            HarnessStep.ASSET -> shown.symbol == symbol
            HarnessStep.SECTOR -> shown.symbol == symbol || (shown.sector != null && HarnessSectors.of(symbol)?.id == shown.sector)
            HarnessStep.WEEK -> true
            null -> false
        }
        if (!about) return false
        note(HarnessEvent(HarnessEvent.Kind.RETURNED, clock, symbol = shown.symbol, step = shown.step, sector = shown.sector, ref = shown.at))
        return true
    }

    /** The offer's "Yes, tell me", or the switch turned on. The ONLY place the system is asked. */
    suspend fun accept(): Outcome {
        if (consent() != RiskNotice.ACCEPTED) return Outcome.CONSENT_REQUIRED
        if (saving) return Outcome.FAILED
        val user = currentUser()
        val epoch = currentEpoch()
        val erased = erasures
        saving = true
        publish()
        try {
            var permission = notifier.status()
            if (permission == LocalNotifier.Permission.NOT_DETERMINED) {
                notifier.requestPermission()
                permission = notifier.status()
            }
            status = permission
            if (currentUser() != user || currentEpoch() != epoch || consent() != RiskNotice.ACCEPTED || erasures != erased) return Outcome.FAILED
            if (owner != user) load(user)
            mode = HarnessMode.ON
            store.write(mode, owner)
            replan()
            return if (permission == LocalNotifier.Permission.ALLOWED) Outcome.ON else Outcome.DENIED
        } finally {
            saving = false
            publish()
        }
    }

    /** The switch turned off: nothing is kept and nothing is scheduled. */
    fun turnOff() {
        erase(HarnessMode.OFF)
    }

    /** A follow-up notification was tapped. */
    suspend fun opened(tap: HarnessTap) {
        if (!recording || !accepts(tap)) return
        status = notifier.status()
        settle()
        val clock = now()
        val ref = tap.stamp ?: ledger.events(HarnessEvent.Kind.SENT).lastOrNull { it.step == tap.step }?.at
        // Coming back and tapping are one answer, not two, however long the tap waited to be honoured.
        val merged = ledger.remove { event ->
            if (event.kind != HarnessEvent.Kind.RETURNED || event.step != tap.step) false
            else if (ref != null && event.ref != null) event.ref == ref
            else clock - event.at < 600_000L
        }
        if (merged) store.write(ledger, owner)
        if (ledger.events.any { it.kind == HarnessEvent.Kind.OPENED && it.step == tap.step && it.ref != null && it.ref == ref }) {
            publish()
            return
        }
        note(HarnessEvent(HarnessEvent.Kind.OPENED, clock, symbol = tap.symbol, step = tap.step, sector = tap.sector, ref = ref))
        if (tap.step == HarnessStep.ASSET && tap.symbol != null) focus = Focus(tap.symbol, clock)
        replan()
        refreshMove()
    }

    /**
     * A follow-up came due while the person was in the app: no notification, the glass says it. It
     * is written as shown; whether it is answered depends on what they do with that line.
     */
    suspend fun firedInForeground(tap: HarnessTap) {
        if (!recording || !accepts(tap)) return
        settle()
        if (tap.step == HarnessStep.ASSET && tap.symbol != null) focus = Focus(tap.symbol, now())
        replan()
        refreshMove()
    }

    // Housekeeping (never asks for permission)

    /**
     * Back in the app: follow-ups whose moment passed are written down, the plan is brought up to
     * date and the glass learns whether there is something to come back to.
     */
    suspend fun appActive() {
        status = notifier.status()
        publish()
        if (consent() == RiskNotice.WITHDRAWN) return
        if (currentUser() != owner) {
            accountChanged()
            return
        }
        if (!recording) {
            apply()
            publish()
            return
        }
        settle()
        val clock = now()
        val lastOpen = ledger.events(HarnessEvent.Kind.APP_OPEN).lastOrNull()?.at
        if (lastOpen == null || clock - lastOpen >= OPEN_GAP_MS) note(HarnessEvent(HarnessEvent.Kind.APP_OPEN, clock))
        replan()
        refreshMove()
    }

    /**
     * Another account, or none. A signed-out reader who signs in keeps what the phone learned.
     * Everything up to the price read happens at once: by the time this waits for anything, the
     * centre already holds the reader who is using the phone, so two changes in a row cannot cross.
     */
    suspend fun accountChanged() {
        val user = currentUser()
        if (user == owner) return
        val wasLocal = owner == null
        // What the reader who is leaving was already shown is written into their own ledger first.
        if (consent() == RiskNotice.ACCEPTED) settle()
        // The previous reader's follow-ups never reach the next one: not the ones still to come,
        // and not the ones already on the notification shade.
        purge()
        if (wasLocal && user != null && consent() == RiskNotice.ACCEPTED) {
            val theirMode = store.mode(user)
            // An account that said no keeps nothing, so nothing is moved into it (iOS merges first).
            if (theirMode != HarnessMode.OFF) {
                val theirs = store.ledger(user)
                theirs.merge(store.ledger(null))
                store.write(theirs, user)
                val localMode = store.mode(null)
                if (theirMode == HarnessMode.UNDECIDED && localMode != HarnessMode.UNDECIDED) store.write(localMode, user)
            }
            store.forget(null)
        }
        load(user)
        // The plan stored for this reader was handed to the phone in another session: none of it is there now.
        planned = planned.map { it.copy(handed = false) }
        replan()
        refreshMove()
        changed()
    }

    /**
     * A withdrawn risk notice erases what the harness kept and cancels what it planned. A notice
     * that only has a newer version to read erases nothing.
     */
    fun consentChanged() {
        if (consent() != RiskNotice.WITHDRAWN) return
        if (mode == HarnessMode.UNDECIDED && ledger.isEmpty && planned.isEmpty()) return
        erase(HarnessMode.UNDECIDED)
    }

    /** The store was emptied for this reader: what is in memory and what the phone holds follow it. */
    fun reloadAfterErase() {
        erasures += 1
        load(owner)
        purge()
        replan()
        changed()
    }

    /** Memory's "Delete everything" for `user`: the ledger, the switch and the plan go, with the follow-ups planned. */
    fun erasedEverything(user: String?) {
        store.forget(user)
        if (user == owner) reloadAfterErase()
    }

    /**
     * The account `userId` was deleted: nothing of it stays on the phone, in the store or in
     * memory (so nothing can be written back when the reader changes a moment later). Local
     * removals only: the caller still holds the repository's lock.
     */
    fun accountDeleted(userId: String) {
        store.forget(userId)
        if (userId != owner) return
        erasures += 1
        ledger = HarnessLedger()
        planned = emptyList()
        storedPlan = emptyList()
        upcoming = emptyList()
        mode = HarnessMode.UNDECIDED
        focus = null
        quotes.clear()
        move = null
        boardFocus = null
        purge()
        publish()
    }

    /** This reader's ledger goes, the switch stays. */
    fun forgetLedger() {
        erase(mode)
    }

    /** Nothing of the harness stays in the phone: pending or shown. */
    private fun purge() {
        issued.clear()
        notifier.cancel(IDENTIFIERS)
        notifier.clearDelivered(IDENTIFIERS)
    }

    // The glass

    /**
     * The asset to come back to now, if any: the tapped follow-up's, else the latest one asked
     * about long enough ago.
     */
    fun dueAsset(): HarnessAsset? {
        if (mode == HarnessMode.OFF || consent() != RiskNotice.ACCEPTED || owner != currentUser()) return null
        val clock = now()
        val known = ledger.assets(since = clock - DUE_DAYS * HARNESS_DAY_MS, now = clock)
        val held = focus
        if (held != null && clock - held.at <= FOCUS_WINDOW_MS) {
            val asset = known.firstOrNull { it.symbol == held.symbol }
            if (asset != null) return asset
        }
        return known.firstOrNull { clock - it.lastAskedAt >= DUE_AFTER_MS }
    }

    /** Reads the price of the asset to come back to (one request that costs no read) and publishes the line. */
    suspend fun refreshMove() {
        val asset = dueAsset()
        if (asset == null) {
            if (move != null) {
                move = null
                changed()
            }
            return
        }
        val user = owner
        val epoch = currentEpoch()
        var price = quotes[asset.symbol]?.takeIf { now() - it.at <= QUOTE_LIFETIME_MS }?.price
        if (price == null) {
            // The app comes to the front twice in a row at launch: the read already under way draws the line.
            if (!reading.add(asset.symbol)) return
            val quote = try { market(asset.symbol) } finally { reading.remove(asset.symbol) }
            if (owner != user || currentEpoch() != epoch || consent() != RiskNotice.ACCEPTED) return
            price = quote?.price?.takeIf { it.isFinite() && it > 0 }
            if (price != null) quotes[asset.symbol] = Quoted(price, now())
        }
        // As the ledger is now: they may have asked again while the price was on its way.
        val still = dueAsset() ?: return
        if (still.symbol != asset.symbol) return
        val days = maxOf(1L, (now() - still.lastAskedAt) / HARNESS_DAY_MS).toInt()
        val next = HarnessMove(still.symbol, still.name, still.isEquity, still.lastAskedAt, still.lastPrice, price, days)
        if (next != move) {
            move = next
            changed()
        }
    }

    /**
     * The numbers of a board, one row at a time as each price arrives (one request per row, none
     * of them a read). Nothing is read before the risk notice, and a price that arrives for a
     * previous reader is dropped.
     */
    suspend fun readBoard(board: HarnessBoard, update: (String, Double?) -> Unit) {
        if (consent() != RiskNotice.ACCEPTED) return
        val user = owner
        val epoch = currentEpoch()
        coroutineScope {
            for (row in board.rows) {
                launch {
                    val quote = market(row.symbol)
                    if (owner == user && currentEpoch() == epoch) update(row.symbol, board.change(row, quote?.price, quote?.changePct))
                }
            }
        }
    }

    // The plan

    private val recording: Boolean get() = mode != HarnessMode.OFF && consent() == RiskNotice.ACCEPTED && owner == currentUser()

    private fun note(event: HarnessEvent) {
        ledger.note(event)
        store.write(ledger, owner)
        publish()
    }

    /** Follow-ups whose moment has passed: the ones the phone held become `SENT`; all of them leave the plan. */
    private fun settle() {
        val clock = now()
        val passed = planned.filter { it.followUp.fireAt <= clock }
        if (passed.isEmpty()) return
        // The phone accepted it while it could show notifications: it counts as shown, even if the
        // permission was taken away afterwards (counting too many only makes Bobby quieter).
        for (item in passed) {
            if (!item.handed) continue
            val followUp = item.followUp
            ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, followUp.fireAt, symbol = followUp.symbol, step = followUp.step, sector = followUp.sector))
        }
        planned = planned.filter { it.followUp.fireAt > clock }
        store.write(ledger, owner)
        keepPlan()
    }

    private fun keepPlan() {
        if (planned == storedPlan) return
        store.write(planned, owner)
        storedPlan = planned
    }

    /** Asks the planner what comes next and brings the phone in line with it. */
    fun replan() {
        settle()
        var wanted: List<HarnessFollowUp> = emptyList()
        if (mode == HarnessMode.ON && consent() == RiskNotice.ACCEPTED) {
            wanted = HarnessPlanner.plan(ledger, now(), zone(), HarnessPlanner.Options(weeklyCovered = weeklyCovered()))
        }
        val before = planned
        planned = wanted.map { followUp -> HarnessPlanned(followUp, before.firstOrNull { it.followUp == followUp }?.handed ?: false) }
        keepPlan()
        upcoming = wanted
        apply()
        publish()
    }

    /** True once the app speaks a language the lines the phone holds were not written in. */
    val wordsAreStale: Boolean get() = wordsIn != null && wordsIn != language()

    /** The app speaks another language now: what the phone holds is written again in it. */
    fun rewriteWords() {
        if (language() == wordsIn) return
        // While the notice waits to be read again nothing is planned anew; the lines stay as they were.
        if (recording) replan() else wordsIn = language()
    }

    private fun notice(followUp: HarnessFollowUp): LocalNotice {
        val payload = LinkedHashMap<String, String>()
        payload[LocalNotice.KIND] = KIND
        payload[HarnessTap.STEP] = followUp.step.raw
        // Whose follow-up this is (a tag, never the account id), and the moment it was planned for.
        payload[LocalNotice.OWNER] = V18Reader.tag(owner)
        payload[HarnessTap.AT] = followUp.fireAt.toString()
        if (followUp.symbol != null) payload[HarnessTap.SYMBOL] = followUp.symbol
        if (followUp.sector != null) payload[HarnessTap.SECTOR] = followUp.sector
        return LocalNotice(followUp.id, HarnessCopy.NOTIFICATION_TITLE, copy.body(followUp), followUp.fireAt, LocalNotice.CHANNEL_FOLLOW_UPS, payload)
    }

    /** The phone holds exactly the plan: what is no longer wanted is cancelled, what is new or reworded is handed over. */
    private fun apply() {
        wordsIn = language()
        val clock = now()
        val wanted = planned.map { it.followUp }.filter { it.fireAt > clock }.map { notice(it) }
        val wantedIds = wanted.map { it.id }.toSet()
        val existing = notifier.pendingIds().filter { it.startsWith(HarnessPlanner.IDENTIFIER_PREFIX) }.toSet()
        val stale = existing - wantedIds
        if (stale.isNotEmpty()) notifier.cancel(stale.sorted())
        issued.keys.retainAll(wantedIds)
        status = notifier.status()
        if (status != LocalNotifier.Permission.ALLOWED) return
        var changedPlan = false
        val next = planned.toMutableList()
        for (wantedNotice in wanted) {
            if (issued[wantedNotice.id] == wantedNotice && wantedNotice.id in existing) continue
            // About to come due: whatever the phone already holds under this id stays as it is.
            if (wantedNotice.fireAtEpochMs - now() < HAND_OFF_MARGIN_MS) continue
            val handed = notifier.schedule(wantedNotice)
            if (handed) issued[wantedNotice.id] = wantedNotice else issued.remove(wantedNotice.id)
            val index = next.indexOfFirst { it.followUp.id == wantedNotice.id }
            if (index >= 0 && next[index].handed != handed) {
                next[index] = next[index].copy(handed = handed)
                changedPlan = true
            }
        }
        if (changedPlan) {
            planned = next
            keepPlan()
        }
    }

    /** Forgets this reader and cancels what the phone holds. `next` is the switch afterwards. */
    private fun erase(next: HarnessMode) {
        erasures += 1
        store.forget(owner)
        store.write(next, owner)
        ledger = HarnessLedger()
        planned = emptyList()
        storedPlan = emptyList()
        upcoming = emptyList()
        mode = next
        focus = null
        quotes.clear()
        move = null
        boardFocus = null
        purge()
        status = notifier.status()
        publish()
        changed()
    }

    private fun publish() {
        val clock = now()
        shown.value = HarnessView(mode, saving, status, ledger.assets(since = clock - 7 * HARNESS_DAY_MS, now = clock).isNotEmpty())
    }

    companion object {
        const val KIND = "follow-up"
        /** An asset is worth coming back to once this long has passed since they asked. */
        const val DUE_AFTER_MS = 20 * HARNESS_HOUR_MS
        /** And for this long. */
        const val DUE_DAYS = 14L
        /** Asking about a follow-up's asset, or acting on its line, this soon after it answers it. */
        const val USEFUL_WINDOW_MS = 24 * HARNESS_HOUR_MS
        /** A tapped follow-up keeps the glass on its asset this long. */
        const val FOCUS_WINDOW_MS = 30 * 60_000L
        const val QUOTE_LIFETIME_MS = 10 * 60_000L
        const val QUOTE_TIMEOUT_MS = 8_000L
        /** One `APP_OPEN` per this long. */
        const val OPEN_GAP_MS = 30 * 60_000L
        /** A notice this close to its moment is not handed over again. */
        const val HAND_OFF_MARGIN_MS = 5_000L

        /** Every identifier the harness ever hands to the phone (one per step). */
        val IDENTIFIERS: List<String> = HarnessStep.entries.map { HarnessPlanner.IDENTIFIER_PREFIX + it.raw }
    }
}
