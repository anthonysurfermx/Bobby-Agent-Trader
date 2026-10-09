package xyz.bobbyprotocol.android.v18

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import java.util.concurrent.CopyOnWriteArrayList

// The app's V18Host. It holds the rules the iOS session holds for 1.8 (NucleoSession.swift): when
// the glass is free for a nudge, one sheet handing over to another, a read native starts, a tapped
// notification waiting for its moment, and the hooks features listen to. No Android classes: the
// session gives it the desk (V18Desk), the activity gives it the screen (V18Shell).

/** What the session knows: who is reading, where the page is, and how a question reaches the desk. */
interface V18Desk {
    val owner: String?
    val signedIn: Boolean
    val accountEpoch: Long
    val riskNotice: RiskNotice
    /**
     * The app page (not onboarding) asked for its session: it can draw a nudge. It is not yet a page
     * that takes `ask.start`: it asks for its session first and wakes up afterwards, and it starts
     * no question while it wakes (the host waits for that, see `pageReady`).
     */
    val onGlass: Boolean
    /** A read is running. */
    val busy: Boolean
    val language: String
    val locale: String
    val analysisLevel: String
    fun text(en: String, es: String): String
    /** Native to page. Dropped while the page is not ready. */
    fun emit(name: String, payload: JSONObject)
    /** `session.changed` with a fresh session. */
    fun sessionChanged()
    /** A single-use token for a question native writes about an asset it already knows. */
    fun readToken(symbol: String, name: String, isEquity: Boolean, question: String): String
    /** The page has not asked with this token yet, and it is still good (not expired, same reader, same consent). */
    fun tokenWaiting(token: String): Boolean
    fun openSpeakingDial() {}
    fun deskBody(symbol: String, question: String, isEquity: Boolean, level: String): JSONObject
    /** The quick-access symbols the current owner kept (never the default tickers shown when they keep none). */
    val shortcuts: List<String>
    /** Replaces them, on this phone only. None removes the stored row, so the glass falls back to its default tickers. */
    fun keepShortcuts(symbols: List<String>)
    val repository: BobbyRepository
}

/** What only the activity can do. Absent in a session without a screen: then nothing is presented and no nudge is served. */
interface V18Shell {
    /** The sheet on screen, or null. */
    val sheetRoute: String?
    /** A system prompt or an app dialog is over the glass. */
    val covered: Boolean
    /** The activity is in front. */
    val active: Boolean
    /** Bobby is listening or speaking. */
    val voiceBusy: Boolean
    /** Opens the sheet now (nothing else is up). */
    fun openSheet(route: String)
    /** Closes the open sheet; the activity then reports `V18Runtime.sheetClosed`. */
    fun dismissSheet()
    /** The mic closes and the voice stops, as before any sheet. */
    fun quietVoice()
    fun haptic(kind: String)
    fun signIn(provider: String)
    fun share(text: String)
    fun copy(text: String)
    fun openExternal(url: String): Boolean
    fun openNotificationSettings()
    suspend fun requestNotificationPermission(): Boolean
    val billing: StateFlow<BillingState>
    suspend fun restorePurchases(): BillingOutcome
    fun manageSubscriptionUrl(): String?
    val briefingNotifications: Boolean
    fun switchBriefingNotifications(enabled: Boolean)
}

/** A tapped notification and a link that opened the app, waiting for their moment. In memory only: never replayed on a later launch. */
class V18Taps {
    var tap: Map<String, String>? = null
    var link: String? = null

    fun takeTap(): Map<String, String>? = tap.also { tap = null }
    fun takeLink(): String? = link.also { link = null }
    fun clear() {
        tap = null
        link = null
    }
}

class V18Runtime(
    private val desk: V18Desk,
    override val store: KeyValueStore,
    override val nudges: NudgeCenter,
    override val notifier: LocalNotifier,
    override val scope: CoroutineScope,
    private val shelf: ReadShelf = ReadShelf(),
    private val taps: V18Taps = V18Taps(),
    private val clock: () -> Long = { System.currentTimeMillis() },
) : V18Host {
    override val theses = ThesisBook(store)
    override val focus = V18Focus()

    /** Set by the activity once it can draw; cleared when it goes away. */
    var shell: V18Shell? = null
        private set

    private class Listeners<T> {
        private val list = CopyOnWriteArrayList<T>()
        fun add(listener: T): () -> Unit {
            list.add(listener)
            return { list.remove(listener) }
        }
        /** One listener failing never stops the others, nor the read or the bridge call that announced it. */
        fun each(run: (T) -> Unit) {
            for (listener in list) {
                try { run(listener) } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { }
            }
        }
    }

    private val deliveredListeners = Listeners<(ReadSummary) -> Unit>()
    private val pickedListeners = Listeners<(String) -> Unit>()
    private val savedListeners = Listeners<(String, String, Int?) -> Unit>()
    private val activeListeners = Listeners<() -> Unit>()
    private val accountListeners = Listeners<() -> Unit>()
    private val consentListeners = Listeners<() -> Unit>()
    private val languageListeners = Listeners<() -> Unit>()
    private val deletedListeners = Listeners<(String) -> Unit>()
    private val eraseListeners = Listeners<(String?) -> Unit>()
    private val forgottenListeners = Listeners<(String) -> Unit>()
    private val tapHandlers = HashMap<String, (Map<String, String>) -> Unit>()
    private val tapChecks = HashMap<String, (Map<String, String>) -> Boolean>()
    private val dueHandlers = HashMap<String, (Map<String, String>) -> Boolean>()
    private val linkHandlers = CopyOnWriteArrayList<(String) -> Boolean>()
    private val services = HashMap<String, Any>()

    private var consentGeneration = 0
    private var sheetHandoff: SheetHandoff? = null
    private var readHandoff: ReadHandoff? = null
    private var nudgeRefreshAt: Long? = null
    private var nudgeRefreshJob: Job? = null
    private var drainQueued = false
    private var closed = false
    /**
     * The page on the glass has woken up: it takes `ask.start`, and a sheet over it no longer
     * freezes it half-drawn. True until a page says it is loading (`pageReady`).
     */
    private var glassSettled = true
    private var settleJob: Job? = null
    private var askWatch: Job? = null

    private data class SheetHandoff(val route: String, val epoch: Long, val owner: String?)
    private data class ReadHandoff(val symbol: String, val name: String, val isEquity: Boolean, val question: String, val epoch: Long, val owner: String?)

    // ---- Wiring (the session and the activity call these) ----

    /** Once, when the session is built: whose showings and taps are counted, and whose reads are kept. */
    fun start() {
        // The centre is the process's: sources registered by a previous activity go with it.
        nudges.claim(this)
        nudges.owner = desk.owner
        if (!shelf.bind(shelfKey())) nudges.forgetMoment()
    }

    fun attach(shell: V18Shell) {
        this.shell = shell
    }

    /** The activity is going away: nothing of it may be called again. */
    fun close() {
        closed = true
        shell = null
        nudgeRefreshJob?.cancel()
        nudgeRefreshJob = null
        settleJob?.cancel()
        settleJob = null
        askWatch?.cancel()
        askWatch = null
        sheetHandoff = null
        readHandoff = null
        tapHandlers.clear()
        tapChecks.clear()
        dueHandlers.clear()
        linkHandlers.clear()
        // Its lines leave the glass with it; a newer host's lines are not this one's to touch.
        nudges.release(this)
    }

    private fun shelfKey(): String = (desk.owner ?: "local") + "#" + desk.accountEpoch

    // ---- The nudge ----

    /** After consent only, on the app page, never under a sheet or a system prompt. */
    private val glassIsFreeForANudge: Boolean
        get() {
            val shell = shell ?: return false
            return !closed && desk.riskNotice == RiskNotice.ACCEPTED && desk.onGlass && shell.sheetRoute == null && !shell.covered
        }

    /** One line and one button for the app page, or null. */
    fun currentNudge(): NucleoNudge? {
        if (!glassIsFreeForANudge) {
            nudges.withhold()
            return null
        }
        return try {
            nudges.current(nudges.moment(desk.signedIn))
        } catch (_: Exception) {
            // A source that fails says nothing; it never takes the session down with it.
            nudges.withhold()
            null
        }
    }

    /** `session.nudge`: `{id, text, cta}` or null. */
    fun nudgeJson(): JSONObject? = currentNudge()?.toJson()

    /** The page drew it: `{count, active}`. `active: false` tells the page to let it go. */
    fun nudgeSeen(id: String): JSONObject {
        val count = nudges.seen(id)
        scheduleNudgeRefresh(id)
        return JSONObject().put("count", count).put("active", nudges.isCurrent(id) && nudges.eligible(id, nudges.now()))
    }

    /** The page forwarded a tap: `{status: "done" | "gone"}`. A late tap retires nothing and opens nothing. */
    suspend fun nudgeAct(id: String): JSONObject {
        if (!glassIsFreeForANudge || !nudges.isCurrent(id)) return JSONObject().put("status", "gone")
        shell?.quietVoice()
        val status = try {
            nudges.act(id)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // It was retired before its source ran: the tap counted even if what it opens failed.
            "done"
        }
        desk.sessionChanged()
        return JSONObject().put("status", status)
    }

    /**
     * A nudge that just finished its round stays for its showing, then the page is told it is gone
     * (a page that never hears another session change would keep drawing it).
     */
    private fun scheduleNudgeRefresh(id: String) {
        val ends = nudges.showingEnds(id) ?: return
        if (nudgeRefreshAt == ends) return
        nudgeRefreshAt = ends
        val wait = maxOf(1_000L, ends - nudges.now() + 1_000L)
        nudgeRefreshJob?.cancel()
        nudgeRefreshJob = scope.launch {
            delay(wait)
            if (!closed && nudgeRefreshAt == ends) {
                nudgeRefreshAt = null
                desk.sessionChanged()
            }
        }
    }

    // ---- What the session reports ----

    /**
     * The page's first call after a load: it hears events from here on, and it is still waking up.
     * It takes no `ask.start` until it is at its idle home, which it reaches about a second later
     * on its own clock, and that clock stands still under a sheet. So a stored tap does
     * not open over it yet: a board opened now would sit over a glass that never drew, and the
     * question its row asks would be dropped by a page that is not listening. The tap opens once
     * the page has had `SETTLE_MS` in front with nothing over it.
     */
    fun pageReady() {
        glassSettled = false
        settleJob?.cancel()
        settleJob = null
        drainSoon()
    }

    /** The page's own clock runs: the app page, in front, nothing over it. */
    private val pageRuns: Boolean
        get() {
            val shell = shell ?: return false
            return !closed && desk.onGlass && shell.active && shell.sheetRoute == null && !shell.covered
        }

    /**
     * Counts the page's time on the glass. It stops as soon as the page stops running (a sheet, the
     * app behind) and starts over on the next thing that happens, so nothing ticks while nobody looks.
     */
    private fun settleSoon() {
        if (glassSettled || closed || settleJob?.isActive == true || !pageRuns) return
        settleJob = scope.launch {
            var ticks = 0
            while (ticks < SETTLE_TICKS) {
                delay(SETTLE_TICK_MS)
                if (!pageRuns) return@launch
                ticks += 1
            }
            if (closed) return@launch
            glassSettled = true
            drain()
        }
    }

    /**
     * A delivered read (`status: "ok"`): what the sources and the hooks may look at. Never the question.
     * `origin` is who started it, as the session decided when it was asked. It has no default on
     * purpose: a caller that forgot it would make every chip and every picked question the
     * person's own, and each would start a chain of follow-ups.
     */
    fun readDelivered(read: JSONObject, origin: ReadOrigin) {
        val summary = ReadSummary.from(read)?.copy(origin = origin) ?: return
        shelf.put(summary)
        nudges.noteRead(NudgeRead(summary.requestId, summary.symbol, summary.name, summary.isEquity, summary.verdict, false, clock(),
                                  MemoryReceipts.fromJson(read.optJSONObject("memory"))))
        deliveredListeners.each { it(summary) }
        desk.sessionChanged()
    }

    /** A read finished, whatever its outcome: a waiting tap may open. */
    fun readFinished() {
        drainSoon()
    }

    /** The person tapped the question Bobby's CIO wrote for a read about `symbol`. Never the words. */
    fun nextQuestionPicked(symbol: String) {
        if (closed) return
        pickedListeners.each { it(symbol) }
    }

    // ---- One-tap questions (what the session asks) ----

    override var oneTap: OneTapRule = OneTapRule.ALWAYS

    /**
     * After a read with this access receipt, answered at `level`: may its row carry a question that
     * asks by itself? A rule that fails is a no. Nothing is lost but a chip, and Bobby never leads into a wall.
     */
    fun offersOneTapAfterRead(access: JSONObject?, level: String = "rapido"): Boolean =
        try { oneTap.afterRead(access, level) } catch (_: Exception) { false }

    /** On the idle home. A rule that fails changes nothing, as not knowing changes nothing. */
    fun offersOneTapOnHome(): Boolean = try { oneTap.onHome() } catch (_: Exception) { true }

    /**
     * The person saved a read. `reviewHours` is the review they chose on the save (24, 72 or 168),
     * null when the save offered none. The session tells the page afterwards.
     */
    fun readSaved(requestId: String, symbol: String, reviewHours: Int? = null) {
        nudges.noteSaved(requestId)
        savedListeners.each { it(requestId, symbol, reviewHours) }
    }

    /** Another reader. Called as soon as the session's owner and epoch are the new ones, before anything suspends. */
    fun accountChanged() {
        nudges.owner = desk.owner
        nudges.forgetMoment()
        focus.clear()
        shelf.clear()
        shelf.bind(shelfKey())
        sheetHandoff = null
        readHandoff = null
        taps.clear()
        accountListeners.each { it() }
    }

    /** The app speaks another language now. */
    fun languageChanged() {
        if (closed) return
        languageListeners.each { it() }
    }

    /** The risk notice was withdrawn: nothing of this reader's session remains. */
    fun consentWithdrawn() {
        consentGeneration += 1
        nudges.forgetMoment()
        shelf.clear()
        sheetHandoff = null
        readHandoff = null
        consentListeners.each { it() }
    }

    /** Account deletion: that account's theses and nudge history leave the phone, then each feature removes its own. */
    fun accountDeleted(owner: String) {
        ThesisBook.forgetOwner(owner, store)
        NudgeCenter.forgetOwner(owner, store)
        deletedListeners.each { it(owner) }
    }

    // ---- What the activity reports ----

    /** The sheet is gone (swipe, close, back, or `dismissSheet`). One sheet handing over to another goes first; a waiting tap opens after. */
    fun sheetClosed() {
        val sheet = sheetHandoff
        val read = readHandoff
        sheetHandoff = null
        readHandoff = null
        if (sheet != null && sheet.epoch == desk.accountEpoch && sheet.owner == desk.owner) {
            scope.launch {
                yield()
                if (!closed && sheet.epoch == desk.accountEpoch && sheet.owner == desk.owner) present(sheet.route)
            }
        }
        if (read != null && read.epoch == desk.accountEpoch && read.owner == desk.owner) {
            scope.launch {
                // The page hears about the read after it hears the sheet closed.
                yield()
                val shell = shell
                if (!closed && shell != null && read.epoch == desk.accountEpoch && read.owner == desk.owner && shell.sheetRoute == null &&
                    desk.riskNotice == RiskNotice.ACCEPTED && desk.onGlass && !desk.busy) {
                    emitAskStart(read.symbol, read.name, read.isEquity, read.question)
                }
            }
        }
        drainSoon()
    }

    /** The app came to the front. */
    fun appBecameActive() {
        activeListeners.each { it() }
        drainSoon()
    }

    /** The mic closed or Bobby stopped speaking: a waiting tap may open. */
    fun voiceIdle() {
        drainSoon()
    }

    /**
     * A notification of ours was tapped. Newest wins, among taps worth keeping: a payload that is
     * not a notice of ours, or that its own feature refuses (a malformed id, an unknown step), is
     * not stored, so it never takes the place of a good tap that is still waiting. False when it
     * was not kept.
     */
    fun noteTap(payload: Map<String, String>): Boolean {
        if (!keepsTap(payload)) return false
        taps.tap = payload
        drainSoon()
        return true
    }

    private fun keepsTap(payload: Map<String, String>): Boolean {
        val kind = payload[LocalNotice.KIND]
        // Not a notice of ours: it will never have a feature to open it.
        if (kind.isNullOrEmpty()) return false
        val accepts = tapChecks[kind]
        // Its feature is not listening yet. It may wait for it, but not in the place of a tap that already waits.
        if (accepts == null) return taps.tap == null
        return accepted(accepts, payload)
    }

    private fun accepted(accepts: (Map<String, String>) -> Boolean, payload: Map<String, String>): Boolean =
        try { accepts(payload) } catch (_: Exception) { false }

    /**
     * An https link opened the app. The first feature that keeps it has it; a link nobody wants is
     * dropped; one that arrives before any feature is listening waits for them.
     */
    fun noteLink(url: String) {
        for (handler in linkHandlers) if (keeps(handler, url)) return
        taps.link = if (linkHandlers.isEmpty()) url else null
    }

    /** Whether a notice that came due may be shown while the app is in front. True when no feature objects. */
    fun allowsDueNotice(payload: Map<String, String>): Boolean {
        val shell = shell ?: return true
        if (closed || !shell.active) return true
        val kind = payload[LocalNotice.KIND] ?: return true
        val handler = dueHandlers[kind] ?: return true
        return try { handler(payload) } catch (_: Exception) { true }
    }

    // ---- Taps and links ----

    private fun drainSoon() {
        if (closed) return
        settleSoon()
        if (drainQueued) return
        drainQueued = true
        scope.launch {
            try { yield() } finally { drainQueued = false }
            drain()
        }
    }

    /**
     * Honours the stored tap when everything allows it; otherwise it keeps waiting. Consumed once.
     * True when a handler ran.
     */
    fun drain(): Boolean {
        val tap = taps.tap ?: return false
        val shell = shell ?: return false
        if (closed || !desk.onGlass || !glassSettled || !shell.active || desk.riskNotice != RiskNotice.ACCEPTED || shell.sheetRoute != null ||
            shell.covered || shell.voiceBusy || desk.busy) return false
        val kind = tap[LocalNotice.KIND]
        if (kind == null) {
            // Not a notice of ours: it will never have a feature to open it.
            taps.tap = null
            return false
        }
        val handler = tapHandlers[kind] ?: return false
        taps.tap = null
        // A notification planned for another reader of this phone opens nothing.
        val reader = tap[LocalNotice.OWNER]
        if (reader != null && reader != readerTag) return false
        try { handler(tap) } catch (_: Exception) { }
        return true
    }

    private fun keeps(handler: (String) -> Boolean, url: String): Boolean = try { handler(url) } catch (_: Exception) { false }

    /**
     * Hands a question to the page. The page takes `ask.start` wherever a new read is what the
     * person expects: its idle home, a finished read, its cards, an open keyboard, another face of
     * the sphere (the table of ios/Bobby/Nucleo/ARCHITECTURE.md §9.5, which the page tests run
     * against this copy too). Where it does not, it says nothing: it is still waking up after a
     * load, coming home from a read, writing a save, or a sheet has only just left. So the host
     * checks: while the token is still unused it offers the same question again, a few times, and
     * then lets it go. The token is single use, so a question is never asked twice.
     */
    private fun emitAskStart(symbol: String, name: String, isEquity: Boolean, question: String) {
        val token = desk.readToken(symbol, name, isEquity, question)
        val epoch = desk.accountEpoch
        val owner = desk.owner
        desk.emit("ask.start", JSONObject().put("token", token).put("question", question))
        askWatch?.cancel()
        askWatch = scope.launch {
            var offers = 0
            while (offers < ASK_OFFERS) {
                delay(ASK_OFFER_MS)
                offers += 1
                val shell = shell
                if (closed || shell == null || epoch != desk.accountEpoch || owner != desk.owner || !desk.tokenWaiting(token)) return@launch
                // Not at this moment (a sheet is up, the app is behind, another read began): the next turn looks again.
                if (desk.riskNotice != RiskNotice.ACCEPTED || !desk.onGlass || desk.busy || !shell.active || shell.sheetRoute != null || shell.covered) continue
                desk.emit("ask.start", JSONObject().put("token", token).put("question", question))
            }
        }
    }

    // ---- V18Host ----

    override fun text(en: String, es: String, vararg args: Any?): String = V18Text.fill(desk.text(en, es), *args)
    override val language: String get() = desk.language
    override val locale: String get() = desk.locale

    override val owner: String? get() = desk.owner
    override val signedIn: Boolean get() = desk.signedIn
    override val accountEpoch: Long get() = desk.accountEpoch
    override val riskNotice: RiskNotice get() = desk.riskNotice
    override val riskAccepted: Boolean get() = desk.riskNotice == RiskNotice.ACCEPTED
    override val readerTag: String get() = V18Reader.tag(desk.owner)

    override fun fence(): V18Fence {
        val epoch = desk.accountEpoch
        val owner = desk.owner
        val consent = consentGeneration
        return V18Fence { !closed && desk.accountEpoch == epoch && desk.owner == owner && consentGeneration == consent }
    }

    override fun openSpeakingDial() = desk.openSpeakingDial()

    override fun present(route: String): Boolean {
        val shell = shell ?: return false
        if (closed || route !in V18Routes.ALL || shell.sheetRoute != null || shell.covered) return false
        shell.openSheet(route)
        return true
    }

    override fun switchSheet(route: String) {
        val shell = shell ?: return
        if (closed || route !in V18Routes.ALL) return
        if (shell.sheetRoute == null) {
            present(route)
            return
        }
        // The next sheet presents when this one has really gone (`sheetClosed`), never on a timer,
        // and only for the account that asked.
        sheetHandoff = SheetHandoff(route, desk.accountEpoch, desk.owner)
        shell.dismissSheet()
    }

    override fun closeSheet() {
        val shell = shell ?: return
        if (shell.sheetRoute != null) shell.dismissSheet()
    }

    override val sheetRoute: String? get() = shell?.sheetRoute

    override fun startRead(symbol: String, name: String, isEquity: Boolean, question: String): Boolean {
        val shell = shell ?: return false
        if (closed || question.isBlank() || desk.riskNotice != RiskNotice.ACCEPTED || !desk.onGlass || desk.busy || shell.covered) return false
        if (shell.sheetRoute != null) {
            readHandoff = ReadHandoff(symbol, name, isEquity, question, desk.accountEpoch, desk.owner)
            shell.dismissSheet()
            return true
        }
        emitAskStart(symbol, name, isEquity, question)
        return true
    }

    override fun sessionChanged() {
        if (!closed) desk.sessionChanged()
    }

    override val glassBusy: Boolean get() = shell?.voiceBusy == true || desk.busy

    override fun haptic(kind: String) {
        shell?.haptic(kind)
    }

    override fun readSummary(requestId: String): ReadSummary? = if (riskAccepted) shelf.get(requestId) else null
    override val analysisLevel: String get() = desk.analysisLevel
    override fun deskBody(symbol: String, question: String, isEquity: Boolean, level: String): JSONObject = desk.deskBody(symbol, question, isEquity, level)

    override val shortcuts: List<String> get() = desk.shortcuts

    override fun forgetShortcut(symbol: String): Boolean {
        val kept = desk.shortcuts
        val left = kept.filterNot { it.equals(symbol, ignoreCase = true) }
        if (left.size == kept.size) return false
        desk.keepShortcuts(left)
        return true
    }

    override fun clearShortcuts() {
        if (desk.shortcuts.isNotEmpty()) desk.keepShortcuts(emptyList())
    }

    override val repository: BobbyRepository get() = desk.repository
    override fun now(): Long = clock()

    override fun <T : Any> service(key: String, create: () -> T): T {
        @Suppress("UNCHECKED_CAST")
        return services.getOrPut(key) { create() } as T
    }

    override fun onReadDelivered(listener: (ReadSummary) -> Unit): () -> Unit = deliveredListeners.add(listener)
    override fun onNextQuestionPicked(listener: (String) -> Unit): () -> Unit = pickedListeners.add(listener)
    override fun onReadSaved(listener: (String, String, Int?) -> Unit): () -> Unit = savedListeners.add(listener)
    override fun onAppActive(listener: () -> Unit): () -> Unit = activeListeners.add(listener)
    override fun onAccountChanged(listener: () -> Unit): () -> Unit = accountListeners.add(listener)
    override fun onConsentWithdrawn(listener: () -> Unit): () -> Unit = consentListeners.add(listener)
    override fun onLanguageChanged(listener: () -> Unit): () -> Unit = languageListeners.add(listener)
    override fun onAccountDeleted(listener: (String) -> Unit): () -> Unit = deletedListeners.add(listener)
    override fun onEraseEverything(listener: (String?) -> Unit): () -> Unit = eraseListeners.add(listener)

    override fun eraseEverything() {
        val owner = desk.owner
        eraseListeners.each { it(owner) }
        sessionChanged()
    }

    override fun onAssetForgotten(listener: (String) -> Unit): () -> Unit = forgottenListeners.add(listener)

    override fun assetForgotten(symbol: String) {
        forgottenListeners.each { it(symbol) }
        sessionChanged()
    }

    override fun onNotificationTap(kind: String, accepts: (Map<String, String>) -> Boolean, handler: (Map<String, String>) -> Unit) {
        tapChecks[kind] = accepts
        tapHandlers[kind] = handler
        // A tap kept before its feature was listening (the screen was rebuilt) is the feature's to judge now.
        val waiting = taps.tap
        if (waiting != null && waiting[LocalNotice.KIND] == kind && !accepted(accepts, waiting)) taps.tap = null
        drainSoon()
    }

    override fun takeNotificationTap(): Map<String, String>? = taps.takeTap()

    override fun onNotificationDue(kind: String, handler: (Map<String, String>) -> Boolean) {
        dueHandlers[kind] = handler
    }

    override fun onLink(handler: (String) -> Boolean) {
        linkHandlers.add(handler)
        val waiting = taps.link ?: return
        if (keeps(handler, waiting)) taps.link = null
    }

    override fun signIn(provider: String) {
        shell?.signIn(provider)
    }

    override fun share(text: String) {
        shell?.share(text)
    }

    override fun copy(text: String) {
        shell?.copy(text)
    }

    override fun openExternal(url: String): Boolean = shell?.openExternal(url) ?: false

    override fun openNotificationSettings() {
        shell?.openNotificationSettings()
    }

    private val noBilling = kotlinx.coroutines.flow.MutableStateFlow(BillingState())
    override val billing: StateFlow<BillingState> get() = shell?.billing ?: noBilling
    override suspend fun restorePurchases(): BillingOutcome = shell?.restorePurchases() ?: BillingOutcome.UNAVAILABLE
    override fun manageSubscriptionUrl(): String? = shell?.manageSubscriptionUrl()
    override val briefingNotifications: Boolean get() = shell?.briefingNotifications ?: false

    override fun switchBriefingNotifications(enabled: Boolean) {
        shell?.switchBriefingNotifications(enabled)
    }

    companion object {
        /**
         * How long a freshly loaded page needs in front, with nothing over it, before a stored tap
         * opens over it: its start (half a second at most) and its wake (nine tenths), with room for
         * a slow phone. Counted in ticks, so a sheet or a trip to the background starts it over.
         */
        const val SETTLE_TICK_MS = 400L
        const val SETTLE_TICKS = 4
        const val SETTLE_MS = SETTLE_TICK_MS * SETTLE_TICKS
        /** A question the page did not take is offered again this often, this many times. */
        const val ASK_OFFER_MS = 800L
        const val ASK_OFFERS = 5
    }
}
