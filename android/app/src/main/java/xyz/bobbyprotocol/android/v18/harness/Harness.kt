package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.yield
import xyz.bobbyprotocol.android.v18.ReadOrigin
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes

// The harness (1.8): where the centre meets the app. One centre per host (the activity), shared by
// the two lines on the glass, the board and the Follow-ups switch, and fed by the host's hooks.
// On iOS this is `HarnessCenter.start()`, `HarnessIntent` and the lines of NucleoSession that call
// the harness; here the host already stores a tapped notification until the glass can honour it.

object Harness {
    private const val SERVICE = "harness.center"

    /** The centre of this host, built and started the first time it is asked for. */
    fun center(host: V18Host): HarnessCenter = host.service(SERVICE) { start(host) }

    /**
     * A row of a board was tapped: that is acting on a follow-up, and Bobby is asked about it. The
     * sheet goes away first, then the page hears about the read. False when the glass cannot take
     * a question now.
     */
    fun pick(host: V18Host, row: HarnessBoard.Row): Boolean {
        val center = center(host)
        center.notePicked(row.symbol)
        return host.startRead(row.symbol, row.name, row.isEquity, center.copy.lookQuestion(row.symbol))
    }

    private fun start(host: V18Host): HarnessCenter {
        val center = HarnessCenter(host.notifier, HarnessStore(host.store), HarnessCopy(host))
        center.now = { host.now() }
        center.consent = { host.riskNotice }
        center.currentUser = { host.owner }
        center.currentEpoch = { host.accountEpoch }
        center.language = { host.language }
        // The phone only tells an account about its briefings when the weekly one is on (the
        // briefing reminder checks it with the server): Pro with that switch on has its Monday.
        center.weeklyCovered = { host.signedIn && host.briefingNotifications && host.billing.value.isPro }
        center.market = { symbol -> quote(host, symbol) }
        // The page is told once, after the turn that changed the line: several changes in one turn
        // are one redraw, and nothing is sent from inside a hook the session is still running.
        var redrawQueued = false
        center.changed = {
            if (!redrawQueued) {
                redrawQueued = true
                host.scope.launch {
                    try { yield() } finally { redrawQueued = false }
                    host.sessionChanged()
                }
            }
        }
        // What was erased is no longer named in the history of what the glass said: a move line's id
        // carries the asset and the day it was asked about.
        center.onErased = { if (center.owner == host.owner) host.nudges.forgetIds(listOf(HarnessNudges.MOVE_KEY + ".")) }
        // The reader's active theses as the planner reads them: the asset and the horizon set on it, never the words.
        center.theses = { owner ->
            host.theses.active(owner).map { thesis -> HarnessThesis(thesis.symbol, thesis.horizon?.let { HarnessHorizon.ofThesis(it) }, thesis.createdAtMillis) }
        }
        center.load(host.owner)

        // From the first delivered read. Never the question: a symbol, a name, a price, and who wrote
        // the words. Only a question the person asked in their own words is followed up: a read Bobby
        // started (a follow-up's button, a board row, the question after a read, a chip) is told apart
        // here, and `chip` lets the centre keep a chip's read the way a question is before the yes.
        host.onReadDelivered { read ->
            val bobbys = read.origin == ReadOrigin.FOLLOW_UP || read.origin == ReadOrigin.CHIP
            center.noteAsk(read.symbol, read.name, read.isEquity, read.price,
                           origin = if (bobbys) HarnessEvent.Origin.FOLLOW_UP else null, chip = read.origin == ReadOrigin.CHIP,
                           thread = read.origin == ReadOrigin.THREAD, horizon = HarnessHorizon.named(read.horizon))
        }
        // The review they chose on the save (72 or 168 hours) times the follow-up that was coming.
        host.onReadSaved { _, symbol, reviewHours -> center.noteSaved(symbol, reviewHours) }
        // A thesis of this reader was written, changed or archived: its horizon times the next follow-up.
        host.theses.addListener { changed -> if (changed == ThesisBook.key(center.owner)) center.thesesChanged() }
        // The person tapped the question Bobby's CIO wrote after a read: that is acting on what Bobby put
        // in front of them, counted by asset (only while the centre may record). The words are not kept.
        host.onNextQuestionPicked { symbol -> center.notePicked(symbol) }
        // Everything up to a price read runs inside the hook, so the centre never holds the
        // previous reader while the next one is already on the glass.
        host.onAppActive { host.scope.launch(start = CoroutineStart.UNDISPATCHED) { center.appActive() } }
        host.onAccountChanged { host.scope.launch(start = CoroutineStart.UNDISPATCHED) { center.accountChanged() } }
        host.onConsentWithdrawn { center.consentChanged() }
        // The app speaks another language: the lines the phone holds for later are written again in it now,
        // not the next time the glass happens to draw.
        host.onLanguageChanged { center.rewriteWords() }
        host.onAccountDeleted { owner -> center.accountDeleted(owner) }
        host.onEraseEverything { owner -> center.erasedEverything(owner) }

        // A tapped follow-up, once the glass can honour it. The asset's lands on the glass: the
        // centre writes the line and its button asks Bobby. A sector or a week opens its board.
        // Only a payload that reads as a follow-up is kept: a malformed tap never replaces one that is waiting.
        host.onNotificationTap(HarnessCenter.KIND, accepts = { payload -> HarnessTap.from(payload) != null }) { payload ->
            val tap = HarnessTap.from(payload)
            if (tap != null && center.accepts(tap)) {
                host.scope.launch(start = CoroutineStart.UNDISPATCHED) { center.opened(tap) }
                if (tap.step != HarnessStep.ASSET) {
                    center.focusBoard(tap)
                    host.present(V18Routes.FOLLOW_UP)
                }
            }
        }
        // A follow-up that comes due while the person is in the app shows no notification: the glass says it.
        host.onNotificationDue(HarnessCenter.KIND) { payload ->
            val tap = HarnessTap.from(payload)
            if (tap == null) {
                true
            } else {
                host.scope.launch(start = CoroutineStart.UNDISPATCHED) { center.firedInForeground(tap) }
                false
            }
        }

        // The Núcleo is starting: the harness keeps itself true from here. After this turn: the
        // app's scope runs a launch at once on the main thread, and nothing may reach back for the
        // centre while it is still being built.
        host.scope.launch {
            yield()
            center.appActive()
        }
        return center
    }

    /** One price, without spending a read. Null before the risk notice, on any failure, and after eight seconds. */
    private suspend fun quote(host: V18Host, symbol: String): HarnessQuote? {
        if (!host.riskAccepted) return null
        return try {
            withTimeoutOrNull(HarnessCenter.QUOTE_TIMEOUT_MS) { host.repository.market(symbol) }?.let { HarnessQuote(it.price, it.changePct) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
    }
}
