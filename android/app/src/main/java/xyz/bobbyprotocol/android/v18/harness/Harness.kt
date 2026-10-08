package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.yield
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.OneTapRule
import xyz.bobbyprotocol.android.v18.ReadOrigin
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.ReadAccess

// The harness (1.8): where the centre meets the app. One centre per host (the activity), shared by
// the two lines on the glass, the board and the Follow-ups switch, and fed by the host's hooks.
// On iOS this is `HarnessCenter.start()`, `HarnessIntent` and the lines of NucleoSession that call
// the harness; here the host already stores a tapped notification until the glass can honour it.
//
// Where the wall is read from (iOS: BobbyAccessCenter and NucleoLevelCenter): the receipt of the
// latest reply, as the session hands it to the one-tap rule, and after it the balance the Credits
// centre holds (it asks the server again after every read, at no cost). "The next read would be
// refused" is the server's own word (`paywall` behind a limit with nothing left): on Android what
// stands there is the sign-in for a guest and the Bobby Pro screen for a free account. Google Play
// is not asked.

/**
 * What the phone last heard about the reader's reads, newest first. The receipt of a reply stands
 * until the balance is heard to say something else (the read was counted, a code was redeemed,
 * Bobby Pro was bought, the week turned over): from then on the balance is the later word.
 */
internal class HarnessReceipts(private val host: V18Host, private val balance: () -> ReadAccess?) {
    private var receipt: ReadAccess? = null
    private var owner: String? = null
    private var epoch = 0L
    /** What the balance said when the receipt was heard. */
    private var balanceThen: ReadAccess? = null

    /** A read was just answered with this receipt (null: the server sent none). */
    fun heard(access: ReadAccess?) {
        receipt = access
        owner = host.owner
        epoch = host.accountEpoch
        balanceThen = balance()
    }

    fun current(): ReadAccess? {
        val said = balance()
        if (receipt != null && (owner != host.owner || epoch != host.accountEpoch || said != balanceThen)) receipt = null
        return HarnessWall.current(listOf(receipt, said), host.now())
    }
}

object Harness {
    private const val SERVICE = "harness.center"
    private const val RECEIPTS = "harness.receipts"

    /** The balance as Credits holds it for the reader who is here now. Nothing is known before the risk notice. */
    private fun receiptsOf(host: V18Host): HarnessReceipts = host.service(RECEIPTS) {
        HarnessReceipts(host) { if (host.riskAccepted) CreditsCenter.of(host).access() else null }
    }

    /** The centre of this host, built and started the first time it is asked for. */
    fun center(host: V18Host): HarnessCenter = host.service(SERVICE) { start(host) }

    /**
     * A row of a board was tapped: that is acting on a follow-up, and Bobby is asked about it. The
     * sheet goes away first, then the page hears about the read. False when the glass cannot take
     * a question now, and when the next read would be refused: a row never leads into a sign-in or
     * a paywall (the sheet draws it plain then, and this is the second lock).
     */
    fun pick(host: V18Host, row: HarnessBoard.Row): Boolean {
        val center = center(host)
        if (!center.readsOpen) return false
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
        // carries the asset and the day it was asked about. For the reader on the glass the centre
        // that serves the lines lets go of them too; for anyone else only what is stored goes.
        center.forgetLines = { symbol, reader ->
            val prefixes = listOf(HarnessNudges.movePrefix(symbol))
            if (reader == host.owner) host.nudges.forgetIds(prefixes) else NudgeCenter.forget(prefixes, reader, host.store)
        }
        center.linesKept = { reader -> NudgeCenter.count(HarnessNudges.movePrefix(), reader, host.store) }
        center.pruneLines = { reader, before -> NudgeCenter.prune(HarnessNudges.movePrefix(), before, reader, host.store) }
        // Bobby never invites someone into a wall. What the phone knows about the reader's reads:
        val receipts = receiptsOf(host)
        center.access = { receipts.current() }
        center.refreshAccess = { if (host.riskAccepted) CreditsCenter.of(host).load() }
        // The session asks before it puts a question that asks by itself in front of the reader.
        // After a read: that read's own receipt must say the next one is answered. On the home: only
        // knowing the next one is refused takes the chips away (a first launch keeps them).
        var homeClosed = false
        fun wallMoved() {
            val closed = HarnessWall.closed(receipts.current())
            if (closed != homeClosed) {
                homeClosed = closed
                center.changed()
            }
        }
        host.oneTap = object : OneTapRule {
            override fun afterRead(access: JSONObject?): Boolean {
                val receipt = ReadAccess.fromJson(access)
                receipts.heard(receipt)
                // The session is sent again right after a delivered read: the home's row follows by itself.
                homeClosed = HarnessWall.closed(receipts.current())
                return HarnessWall.open(receipt)
            }

            override fun onHome(): Boolean = !HarnessWall.closed(receipts.current())
        }
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
        // The phone heard how many reads are left (the balance read at launch, a code, a purchase):
        // when that flips whether the next read is refused, the home loses or regains its one-tap
        // chips and the line on the glass its button. After this turn too, so that the Credits centre
        // is the one the app (or a suite) registered.
        host.scope.launch {
            yield()
            homeClosed = HarnessWall.closed(receipts.current())
            CreditsCenter.of(host).revision.collect { wallMoved() }
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
