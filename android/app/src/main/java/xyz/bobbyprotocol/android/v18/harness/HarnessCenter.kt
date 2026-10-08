package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.credits.ReadAccess
import java.time.ZoneId
import java.util.Locale

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
//  - What the phone writes depends on what the person said about follow-ups, and on nothing else:
//      undecided  one entry per read they asked for (typed, spoken, or an asset picked on a chip):
//                 the asset, its price, the moment. It is what lets the glass say "NVDA +2.3% since
//                 you asked" when they come back, and what the yes follows. No app openings, no
//                 saves, no taps, no horizon, no thesis, no read started from a follow-up's own button.
//      on         everything the planner reads (HarnessLedger), from that moment.
//      off        nothing, and what was there is erased.
//    HarnessSurfaceTest pins each state by reading what is stored.
//  - Bobby never invites someone into a wall. A read Bobby starts (the button of the line on the
//    glass, a board row, the question Bobby wrote after a read) is offered and launched only when
//    the phone knows the next read is answered (`HarnessWall`), and it runs at the Quick level
//    whatever level is saved. The line and the board are still shown: they need no read.
//  - What the phone holds is always the plan of whoever uses the phone now: another account, or
//    none, cancels the previous reader's follow-ups before anything else.
//  - A follow-up names the asset the person asked about and nothing else: no price, no figure, no
//    direction. The number is read when they open it. On a locked phone that hides sensitive
//    content the asset is not shown either (the notice's public version, `HarnessCopy.publicBody`).
//  - The number costs one request the person did not tap for: when the app comes to the front
//    with an asset asked about a day ago or more (also before the yes), the phone asks the quote
//    endpoint for that symbol (`market`), and the week's board asks once per row. The request
//    carries the symbol and nothing else: no account, no device, nothing more of the ledger
//    (`BobbyRepository.quote`). These two are the only places a value read from the ledger leaves
//    the phone without being inside a question the person sends.
//  - Stopping is one tap: every follow-up carries a "Stop" button that turns follow-ups off the way
//    the switch does (`stop` → `turnOff`), without opening the app.
//  - A no stays a no. Follow-ups turned off (the switch, or "Stop" on a notice) survive a sign-in,
//    a sign-out and the Memory screen's "Delete everything": what was kept is erased, the refusal
//    is not, and the offer is not made again by itself. An account that said no takes nothing from
//    a signed-out reader either. And it crosses both ways on this phone: a no said signed out goes
//    with the person into their account whatever that account had said before, and a no said in
//    an account is still a no once signed out. Only their own later yes lifts it (`accept`).
//  - A yes that was erased (Memory's "Delete everything", a withdrawn risk notice) is asked for
//    again: the offer's own history on the glass goes with it (`forgetOffer`).
//  - A follow-up the phone really showed is written to the ledger as `SENT` exactly once, at the
//    moment it was shown; whether the person did something with it within a day of that
//    (`RETURNED`) is what the next plan learns from. A tap alone (`OPENED`) is written down and
//    changes nothing. A follow-up the phone did not show is not written at all.
//  - Only a question the person asked in their own words (typed, spoken) is followed up. A read
//    whose question Bobby wrote (the button of a follow-up, a board row, the question after a
//    read, a chip that asks about an asset) is written with its origin and starts nothing: one
//    tap on something Bobby put there never earns another chain. The one exception is the yes
//    itself: before it there is no chain to protect, so a chip is kept the way a question is, and
//    saying yes to "Shall I keep you posted on NVDA?" follows that read.
//  - What the person said about how long they are looking (the horizon their question named, the
//    one chosen on a save, a thesis), a save itself and that a question was their second about a
//    read are written only once they said yes to follow-ups. Until then they are held in memory
//    for the last few reads, and the yes writes them for those.
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
//    is idle), never outside 09:00 to 21:00 on its own clock, never more than a day late, and
//    never on the day of another follow-up or within 18 hours of it (`LocalNotice.Delivery.FOLLOW_UP`).
//    So the plan is not what the person saw. `SENT` is written from what the phone says it showed
//    (`LocalNotifier.shownAt`), with that moment: the planner's caps, the day's answer window and
//    the counts on the Memory screen are all about notices that were on the screen. A notice the
//    phone dropped as too late, withheld, or never got to is not written, and one still waiting
//    when the app is opened is cancelled unwritten: the line on the glass already says it.
//  - One kind of notice can be switched off by itself in the system's settings. Follow-ups switched
//    off there are a no from the phone: nothing is handed over, and the switch says so (`status`).
//  - The lock screen: iOS files a follow-up under a category with a hidden-preview placeholder;
//    here the notice is private and carries a public version. "Stop" is a broadcast
//    (platform/AndroidLocalNotifier.kt), which reaches `stop` on the centre the app is using, or
//    on one built over what is on disk when no app is running.
//  - An account that takes over a no said signed out keeps nothing of its own either (iOS leaves
//    that account's earlier notes in place under a switch that is off).
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

/** One active thesis as the planner reads it: the asset, the horizon set on it and when it was written. Never the words. */
data class HarnessThesis(val symbol: String, val horizon: HarnessHorizon?, val since: Long)

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
    /**
     * Null when the phone should say no number (`HarnessCopy.move`): a split, a renamed ticker or
     * a bad price would otherwise read as a crash.
     */
    val pct: Double? get() = HarnessCopy.move(priceThen, priceNow, isEquity)
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
    /**
     * What the phone last heard about this person's reads: the receipt of the latest reply, else
     * the balance read when the app started. Null when it does not know (and until the app wires it).
     */
    var access: () -> ReadAccess? = { null }
    /** Asks the server for it (the request spends no read). Only ever called after the risk notice. Must not throw. */
    var refreshAccess: suspend () -> Unit = {}
    /**
     * What the glass remembers about the lines it drew for an asset (how often, whether one was
     * tapped: NudgeCenter keeps it under an id that names the asset and the day) goes when that
     * asset's notes go. No symbol: every line of the harness. The app wires the nudge history.
     */
    var forgetLines: (symbol: String?, owner: String?) -> Unit = { _, _ -> }
    /** How many of those lines the glass still has a history for (said on the Memory screen). */
    var linesKept: (owner: String?) -> Int = { 0 }
    /** And they are kept no longer than the ledger keeps the question they were about. */
    var pruneLines: (owner: String?, before: Long) -> Unit = { _, _ -> }
    /**
     * The glass forgets that it made the offer ("Shall I keep you posted on NVDA?") to this reader
     * and that they tapped it: called when a yes is erased, so that it is asked for again. The app
     * wires the nudge history.
     */
    var forgetOffer: (owner: String?) -> Unit = { }
    /** The reader's active theses (the app wires the thesis book). Call `thesesChanged` when one is written, changed or archived. */
    var theses: (String?) -> List<HarnessThesis> = { emptyList() }

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

    private val keptSymbols = MutableStateFlow<List<String>>(emptyList())
    /** The assets the ledger names, newest first. */
    val kept: StateFlow<List<String>> get() = keptSymbols

    private val published = MutableStateFlow(0)
    /** Changes whenever what the notes say may have changed (the Memory screen draws `notes` again). */
    val revision: StateFlow<Int> get() = published

    private class Focus(val symbol: String, val at: Long)
    private class Quoted(val price: Double, val at: Long)

    private var planned: List<HarnessPlanned> = emptyList()
    /** The plan as the store holds it, so an unchanged plan is not written again on every launch and every question. */
    private var storedPlan: List<HarnessPlanned> = emptyList()
    /** What this launch handed to the phone (id → what it said and when), so nothing is written twice. */
    private val issued = HashMap<String, LocalNotice>()
    private var focus: Focus? = null
    /**
     * Questions and saves written without what the person said about their horizon, kept whole here
     * until they say yes. In memory only: it never outlives the launch or the reader.
     */
    private val held = ArrayList<HarnessEvent>()
    private val quotes = HashMap<String, Quoted>()
    /** Prices being read right now (`reader/symbol`): two requests for the same line are one. */
    private val reading = HashSet<String>()
    /** The server is being asked how many reads are left: one request at a time. */
    private var askingAccess = false
    /** Grows whenever this reader is erased: a yes that was waiting for the system's answer does not undo it. */
    private var erasures = 0
    /** The board a tap or a row asked for, handed to the sheet once. */
    private var boardFocus: HarnessTap? = null

    // Reading

    val profile: HarnessProfile get() = HarnessProfile.make(ledger, now(), zone())

    /** Follow-ups are wanted and nothing stands in their way but, possibly, the phone's settings. */
    val isOn: Boolean get() = mode == HarnessMode.ON

    /** Bobby may start a read of its own: the phone knows the next one is answered. */
    val readsOpen: Boolean get() = HarnessWall.open(access())

    /**
     * What the phone keeps for follow-ups, in sentences (the Memory screen). "Bobby comes back on…"
     * and "Your week arrives on…" are said only when the phone will show them: with notifications
     * off (Bobby's, or follow-ups alone) the plan exists and nothing arrives.
     */
    val notes: HarnessNotes
        get() {
            val arrives = if (followUpsAllowed() == LocalNotifier.Permission.ALLOWED) upcoming else emptyList()
            return HarnessNotes.make(ledger, mode, arrives, now(), zone(), copy, linesKept(owner))
        }

    /** Where the person stands for follow-up notices: Bobby's notifications, and this kind of them. */
    private fun followUpsAllowed(): LocalNotifier.Permission = notifier.status(LocalNotice.CHANNEL_FOLLOW_UPS)

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
        held.clear()
        quotes.clear()
        move = null
        boardFocus = null
        publish()
    }

    // What the person does

    /**
     * A read was delivered. Only one the person asked for in their own words is followed up:
     * `origin` says when Bobby wrote the question, and then it is at most an answer to a follow-up.
     * `chip`: Bobby wrote the words and the person picked the asset (the idle home, the row after a
     * read). With follow-ups on that is a read Bobby started, like any other. Before the yes there
     * is no chain to protect: it is kept the way a question is, so the glass can say how the asset
     * moved since, and a yes to "Shall I keep you posted on NVDA?" has that read to follow.
     * `thread`: their own second question about the read on screen. `horizon`: what the question named.
     */
    fun noteAsk(symbol: String, name: String, isEquity: Boolean, price: Double?, origin: HarnessEvent.Origin? = null,
                chip: Boolean = false, thread: Boolean = false, horizon: HarnessHorizon? = null) {
        if (!keeping) return
        val from = if (chip && mode != HarnessMode.ON) null else origin
        val clock = now()
        // The answer comes first in time: what follows starts from the question itself.
        if (recording) answerIfUseful(symbol, clock - 1)
        note(HarnessEvent(HarnessEvent.Kind.ASK, clock, symbol = symbol, name = name, isEquity = isEquity, price = price, origin = from,
                          thread = if (thread && from == null) true else null, horizon = horizon))
        // They are looking at it now: the line about "since you asked" has nothing to say yet.
        // (iOS keeps a tapped follow-up's hold on the glass here; on Android it lets go with the line.)
        val asked = symbol.uppercase(Locale.ROOT)
        if (move?.symbol == asked) move = null
        if (focus?.symbol == asked) focus = null
        replan()
    }

    /**
     * They saved a read. `horizonHours` is the review they chose on the save, when they were offered
     * one. Before the yes a save is not written: it waits in memory, briefly, for the yes (`note`).
     */
    fun noteSaved(symbol: String, horizonHours: Int? = null) {
        if (!keeping) return
        val clock = now()
        note(HarnessEvent(HarnessEvent.Kind.SAVED, clock, symbol = symbol, horizonHours = horizonHours))
        if (!recording) return
        // Saving a read of what a follow-up was about answers it, and the review they chose may
        // move the follow-up that was coming.
        answerIfUseful(symbol, clock)
        replan()
    }

    /**
     * They acted on something Bobby put in front of them inside the app. The line they acted on
     * leaves the glass whatever they said about follow-ups; the act is written only with them on.
     */
    fun notePicked(symbol: String) {
        if (!keeping) return
        val clock = now()
        val picked = symbol.uppercase(Locale.ROOT)
        if (focus?.symbol == picked) focus = null
        if (move?.symbol == picked) move = null
        if (!recording) return
        note(HarnessEvent(HarnessEvent.Kind.PICKED, clock, symbol = symbol))
        if (answerIfUseful(symbol, clock)) replan()
    }

    /**
     * The one writer of an answer. A follow-up shown in the last day that nobody answered yet is
     * answered by something useful about it: its asset (or an asset of its sector; anything, for
     * the week). Having tapped it does not answer it, and does not stop this from doing so. True
     * when it was.
     */
    private fun answerIfUseful(raw: String, clock: Long): Boolean {
        val symbol = HarnessLedger.validSymbol(raw) ?: return false
        val shown = ledger.events(HarnessEvent.Kind.SENT).lastOrNull { clock - it.at <= USEFUL_WINDOW_MS && it.at <= clock } ?: return false
        if (ledger.events.any { it.isAnswer && it.ref == shown.at }) return false
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
            // The system's question is about Bobby's notifications as a whole.
            if (notifier.status() == LocalNotifier.Permission.NOT_DETERMINED) notifier.requestPermission()
            // What follows is about follow-ups: allowed as a whole, and not switched off as a kind.
            val permission = followUpsAllowed()
            status = permission
            if (currentUser() != user || currentEpoch() != epoch || consent() != RiskNotice.ACCEPTED || erasures != erased) return Outcome.FAILED
            if (owner != user) load(user)
            mode = HarnessMode.ON
            store.write(mode, owner)
            // Their latest word on this phone is a yes: a no said signed out before it no longer waits
            // to follow them into this account at the next sign-in.
            if (owner != null && store.mode(null) == HarnessMode.OFF) store.write(HarnessMode.UNDECIDED, null)
            // They said yes: what the last reads carried and was only in memory is written now. A
            // question gains what it named; a save, never written before the yes, goes in whole.
            val clock = now()
            var completed = false
            for (full in held) {
                if (clock - full.at > HELD_WINDOW_MS) continue
                if (full.kind == HarnessEvent.Kind.SAVED) {
                    ledger.note(full)
                    completed = true
                } else if (ledger.complete(full)) {
                    completed = true
                }
            }
            held.clear()
            if (completed) store.write(ledger, owner)
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

    /**
     * The notice's own "Stop". It does what the switch does (`turnOff`: follow-ups off, what the
     * phone holds cancelled, what it showed cleared, the ledger erased), and the offer is never made
     * again by itself: only an undecided reader is offered, and a no is kept through a sign-in, a
     * sign-out and "Delete everything" (`accountChanged`, `HarnessStore.forgetNotes`). The phone may
     * have started the app's process for this alone, with nothing loaded yet. A notice planned for
     * another reader of this phone stops nothing.
     */
    fun stop(tap: HarnessTap) {
        if (currentUser() != owner) load(currentUser())
        if (tap.owner == null || !accepts(tap)) return
        turnOff()
    }

    /**
     * One asset's notes go (the Memory screen): what was asked, saved and tapped about it, the line
     * the glass kept for it, the follow-up that was coming about it and the notice already shown.
     * The follow-ups already shown stay counted, without the asset: forgetting an asset never makes
     * Bobby come back more. A pointer to a thesis is not a note of the harness: it goes with its thesis.
     */
    suspend fun forget(raw: String) {
        val symbol = HarnessLedger.validSymbol(raw) ?: return
        if (owner != currentUser()) return
        val shown = ledger.events.filter {
            it.symbol == symbol && (it.kind == HarnessEvent.Kind.SENT || it.kind == HarnessEvent.Kind.OPENED || it.kind == HarnessEvent.Kind.RETURNED)
        }
        ledger.remove { it.symbol == symbol && it.kind != HarnessEvent.Kind.THESIS }
        for (event in shown) ledger.note(event.copy(symbol = null, sector = null))
        store.write(ledger, owner)
        held.removeAll { it.symbol?.uppercase(Locale.ROOT) == symbol }
        quotes.remove(symbol)
        if (focus?.symbol == symbol) focus = null
        if (move?.symbol == symbol) move = null
        forgetLines(symbol, owner)
        // What is on the notification shade may name it.
        notifier.clearDelivered(IDENTIFIERS)
        replan()
        refreshMove()
        changed()
    }

    /**
     * A follow-up notification was tapped. It is written down, once, and answers nothing: only what
     * they do next with it can (`answerIfUseful`), tapped or not. An answer already given is kept.
     */
    suspend fun opened(tap: HarnessTap) {
        if (!recording || !accepts(tap)) return
        status = followUpsAllowed()
        settle()
        val clock = now()
        val ref = tap.stamp ?: ledger.events(HarnessEvent.Kind.SENT).lastOrNull { it.step == tap.step }?.at
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
        // The phone showed no notice for this one: the glass does, now.
        settle(onGlass = tap)
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
        status = followUpsAllowed()
        publish()
        if (consent() == RiskNotice.WITHDRAWN) return
        if (currentUser() != owner) {
            accountChanged()
            return
        }
        // What the glass remembers about its lines lasts as long as the question they were about.
        pruneLines(owner, now() - HarnessLedger.RETENTION_DAYS * HARNESS_DAY_MS)
        if (!keeping) {
            apply()
            publish()
            return
        }
        // Opening the app is not written down: nothing ever read it.
        if (recording) {
            settle()
            replan()
        } else {
            apply()
            publish()
        }
        // Undecided, the glass still says how far the asset moved since they asked: it reads the one
        // thing kept (the question) and writes nothing.
        refreshMove()
    }

    /**
     * Another account, or none. A signed-out reader who signs in keeps what the phone learned,
     * unless that account said no: then nothing is taken over (off keeps nothing). A no said signed
     * out goes with them and also stays on the phone: signed out again, it is still a no.
     * Everything up to the price read happens at once: by the time this waits for anything, the
     * centre already holds the reader who is using the phone, so two changes in a row cannot cross.
     */
    suspend fun accountChanged() {
        val user = currentUser()
        if (user == owner) return
        val wasLocal = owner == null
        val leaving = owner
        // What the reader who is leaving was already shown is written into their own ledger first.
        if (consent() == RiskNotice.ACCEPTED) settle()
        // The previous reader's follow-ups never reach the next one: not the ones still to come,
        // and not the ones already on the notification shade.
        purge()
        // An account that said no signs out: on this phone it is still a no. The signed-out reader
        // is not offered follow-ups again by themselves; what they kept, if anything, is theirs and stays.
        if (leaving != null && user == null && store.mode(leaving) == HarnessMode.OFF && store.mode(null) == HarnessMode.UNDECIDED &&
            store.ledger(null).isEmpty) {
            store.write(HarnessMode.OFF, null)
        }
        if (wasLocal && user != null && consent() == RiskNotice.ACCEPTED) {
            val localMode = store.mode(null)
            val theirMode = store.mode(user)
            if (localMode == HarnessMode.OFF && theirMode != HarnessMode.OFF) {
                // The no goes with them, whatever the account had said before: a no said signed out is
                // the later word on this phone (a yes said in the account lifts it, `accept`). And off
                // keeps nothing: what the account had noted, and what it had planned, goes too.
                store.forget(user)
                store.write(HarnessMode.OFF, user)
                forgetLines(null, user)
            } else if (theirMode != HarnessMode.OFF) {
                // An account that said no keeps nothing, so nothing is moved into it.
                val theirs = store.ledger(user)
                theirs.merge(store.ledger(null))
                store.write(theirs, user)
                if (theirMode == HarnessMode.UNDECIDED && localMode != HarnessMode.UNDECIDED) store.write(localMode, user)
            }
            // Nothing of what was asked signed out stays under the signed-out reader: neither the notes
            // nor what the glass kept about its lines. A no said signed out does.
            store.forget(null)
            forgetLines(null, null)
            if (localMode == HarnessMode.OFF) store.write(HarnessMode.OFF, null)
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
        forgetLines(null, owner)
        purge()
        replan()
        changed()
    }

    /**
     * Memory's "Delete everything" for `user`: the notes and the plan go, with the follow-ups
     * planned. A yes goes with them, and the offer on the glass is made again after their next
     * read; until they answer it the phone keeps what it keeps for anyone undecided, the question
     * itself. A no stays.
     */
    fun erasedEverything(user: String?) {
        val saidYes = store.mode(user) == HarnessMode.ON
        store.forgetNotes(user)
        // The yes went with the notes: the glass may make the offer again, once, like the first time.
        if (saidYes) forgetOffer(user)
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
        held.clear()
        quotes.clear()
        move = null
        boardFocus = null
        purge()
        publish()
    }

    /** "Erase notes" on the Memory screen: this reader's notes and plan go, the switch stays where it is. */
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
        val couldAsk = readsOpen
        var price = quotes[asset.symbol]?.takeIf { now() - it.at <= QUOTE_LIFETIME_MS }?.price
        if (price == null) {
            // The app comes to the front twice in a row at launch: the read already under way draws
            // the line. Per reader: one that is still on its way for whoever left holds nobody else back.
            val flight = (user ?: "local") + "/" + asset.symbol
            if (!reading.add(flight)) return
            val quote = try { market(asset.symbol) } finally { reading.remove(flight) }
            if (owner != user || currentEpoch() != epoch || consent() != RiskNotice.ACCEPTED) return
            price = quote?.price?.takeIf { it.isFinite() && it > 0 }
            if (price != null) quotes[asset.symbol] = Quoted(price, now())
        }
        // The line's button asks Bobby, which is a read: the phone finds out whether one is left.
        if (access() == null && !askingAccess) {
            askingAccess = true
            try {
                refreshAccess()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                // Not knowing stays a no.
            } finally {
                askingAccess = false
            }
            if (owner != user || currentEpoch() != epoch || consent() != RiskNotice.ACCEPTED) return
        }
        // As the ledger is now: they may have asked again while the price was on its way.
        val still = dueAsset() ?: return
        if (still.symbol != asset.symbol) return
        val days = maxOf(1L, (now() - still.lastAskedAt) / HARNESS_DAY_MS).toInt()
        val next = HarnessMove(still.symbol, still.name, still.isEquity, still.lastAskedAt, still.lastPrice, price, days)
        if (next != move || readsOpen != couldAsk) {
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

    /** The person said yes to follow-ups: everything the planner reads is written. */
    private val recording: Boolean get() = mode == HarnessMode.ON && consent() == RiskNotice.ACCEPTED && owner == currentUser()

    /** They have not said no: a question they asked is kept, so the glass can say how it moved since. */
    private val keeping: Boolean get() = mode != HarnessMode.OFF && consent() == RiskNotice.ACCEPTED && owner == currentUser()

    /**
     * Writes one event, as much of it as the person agreed to.
     *  - Follow-ups on: the event, whole.
     *  - Undecided: of a read they asked for, the asset, its price and the moment. Nothing of any
     *    other event, and nothing of a read Bobby started. What a question or a save carried beyond
     *    that waits in memory, briefly, for the yes (`accept` writes it).
     *  - Off: nothing.
     */
    private fun note(event: HarnessEvent) {
        when (mode) {
            HarnessMode.ON -> ledger.note(event)
            HarnessMode.UNDECIDED -> {
                if (event.isQuestion || event.kind == HarnessEvent.Kind.SAVED) {
                    held.add(event)
                    while (held.size > HELD_EVENTS) held.removeAt(0)
                }
                if (!event.isQuestion) return
                ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, event.at, symbol = event.symbol, name = event.name, isEquity = event.isEquity, price = event.price))
            }
            HarnessMode.OFF -> return
        }
        store.write(ledger, owner)
        publish()
    }

    /**
     * The ledger points at the theses that are active now, and at no other: one pointer per asset,
     * with the horizon set on it. Only once follow-ups are on.
     */
    private fun syncTheses() {
        if (mode != HarnessMode.ON || consent() != RiskNotice.ACCEPTED) return
        val wanted = LinkedHashMap<String, HarnessThesis>()
        for (thesis in theses(owner)) {
            val symbol = HarnessLedger.validSymbol(thesis.symbol) ?: continue
            wanted[symbol] = thesis
        }
        val current = ledger.events(HarnessEvent.Kind.THESIS).groupBy { it.symbol ?: "" }
        val inStep = current.size == wanted.size && wanted.all { (symbol, thesis) ->
            val pointers = current[symbol]
            pointers != null && pointers.size == 1 && pointers.first().horizon == thesis.horizon
        }
        if (inStep) return
        ledger.remove { it.kind == HarnessEvent.Kind.THESIS }
        val clock = now()
        for ((symbol, thesis) in wanted) {
            ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, minOf(thesis.since, clock), symbol = symbol, horizon = thesis.horizon))
        }
        store.write(ledger, owner)
    }

    /**
     * Follow-ups whose moment has passed. The ones the phone really showed become `SENT`, at the
     * moment it showed them (on Android that can be hours after the one they were planned for, and
     * the caps, the answer window and the counts are about what was on the screen). One that came
     * due with the app in front is shown by the glass instead (`onGlass`): it is written now. One
     * the phone did not show (dropped as too late, withheld, still waiting, never run) is not
     * written. All of them leave the plan.
     */
    private fun settle(onGlass: HarnessTap? = null) {
        val clock = now()
        val passed = planned.filter { it.followUp.fireAt <= clock }
        if (passed.isEmpty()) return
        for (item in passed) {
            if (!item.handed) continue
            val followUp = item.followUp
            // A tap the app built itself carries no moment: its step says which one it is.
            val glass = onGlass != null && onGlass.step == followUp.step && (onGlass.stamp == null || onGlass.stamp == followUp.fireAt)
            val shownAt = notifier.shownAt(followUp.id, followUp.fireAt) ?: (if (glass) clock else null) ?: continue
            ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, minOf(shownAt, clock), symbol = followUp.symbol, step = followUp.step, sector = followUp.sector))
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
        syncTheses()
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

    /**
     * A thesis of this reader was written, changed or archived: its horizon times the next
     * follow-up. Only with follow-ups on; and while the risk notice waits to be read again nothing
     * is planned anew, so what the phone holds stays as it was (as in `rewriteWords`).
     */
    fun thesesChanged() {
        if (recording) replan()
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
        // The body names the asset; what a locked phone that hides sensitive content shows does not. One button: Stop.
        return LocalNotice(followUp.id, HarnessCopy.NOTIFICATION_TITLE, copy.body(followUp), followUp.fireAt, LocalNotice.CHANNEL_FOLLOW_UPS, payload,
                           publicBody = copy.publicBody(followUp.step), action = LocalNotice.Action(STOP_ACTION, copy.stopAction))
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
        status = followUpsAllowed()
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
        // A yes that goes without a no in its place (the risk notice was withdrawn) is asked for again.
        if (mode == HarnessMode.ON && next == HarnessMode.UNDECIDED) forgetOffer(owner)
        store.forget(owner)
        store.write(next, owner)
        ledger = HarnessLedger()
        planned = emptyList()
        storedPlan = emptyList()
        upcoming = emptyList()
        mode = next
        focus = null
        held.clear()
        quotes.clear()
        move = null
        boardFocus = null
        forgetLines(null, owner)
        purge()
        status = followUpsAllowed()
        publish()
        changed()
    }

    private fun publish() {
        val clock = now()
        shown.value = HarnessView(mode, saving, status, ledger.assets(since = clock - 7 * HARNESS_DAY_MS, now = clock).isNotEmpty())
        keptSymbols.value = ledger.assets(since = Long.MIN_VALUE, now = Long.MAX_VALUE).map { it.symbol }
        published.value += 1
    }

    companion object {
        const val KIND = "follow-up"
        /** The name of the notice's one button (`LocalNotice.Action`). */
        const val STOP_ACTION = "stop"
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
        /**
         * What is held in memory about recent reads until the person says yes: this many, this long
         * (the session keeps its own reads the same way).
         */
        const val HELD_EVENTS = 5
        const val HELD_WINDOW_MS = 30 * 60_000L
        /** A notice this close to its moment is not handed over again. */
        const val HAND_OFF_MARGIN_MS = 5_000L

        /** Every identifier the harness ever hands to the phone (one per step). */
        val IDENTIFIERS: List<String> = HarnessStep.entries.map { HarnessPlanner.IDENTIFIER_PREFIX + it.raw }
    }
}
