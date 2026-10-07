package xyz.bobbyprotocol.android.v18

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier

// Bobby 1.8 on Android: the ONE interface a feature (credits, invitations, theses, memory,
// reminders, follow-ups) uses to reach the app. A feature never touches NucleoSession or
// MainActivity. The app's implementation is V18Runtime; unit tests build the same V18Runtime over
// the fakes in app/src/sharedTest/…/v18/V18TestKit.kt, so what a test exercises is what ships.
// Everything here is called on the main thread.

/** Where the person stands with the risk notice. */
enum class RiskNotice {
    /** The current notice is accepted: Bobby may answer, remember and plan. */
    ACCEPTED,
    /** Accepted before, and the notice now has a version the person has not read yet. Nothing was withdrawn: what they set stays, and nothing new starts. */
    OUTDATED,
    /** Never accepted, or withdrawn: nothing is scheduled and nothing reaches the network. */
    WITHDRAWN,
}

/**
 * An account moment captured before a suspension. `isCurrent` is false once the account changed
 * (sign-in, sign-out, deletion) or the risk notice was withdrawn: drop the late reply.
 */
class V18Fence internal constructor(private val check: () -> Boolean) {
    val isCurrent: Boolean get() = check()
}

/**
 * May Bobby put a question that asks by itself in front of the reader: the next question its CIO
 * wrote, an asset chip of the home, an asset or a mover of the row after a read? Bobby never leads
 * into a sign-in or a paywall, so the answer is no when the next read would be refused (iOS:
 * `NucleoDesk.offersNextQuestion` and `HarnessWall`, ARCHITECTURE.md §3.5). The session asks; the
 * feature that knows the read meter answers (`V18Host.oneTap`). Both are asked often and on the
 * main thread: answer from what is already known, never from the network.
 */
interface OneTapRule {
    /**
     * A read was just answered. `access` is that read's own receipt from the server, as it came
     * (null when the server sent none). Asked once per read. On a no the CIO's question does not
     * reach the page and the reply says `oneTap: false`: the row keeps "Another question" alone.
     */
    fun afterRead(access: JSONObject?): Boolean

    /**
     * The idle home, from what the phone knows now. Not knowing is a yes: the home keeps its chips
     * on a first launch and without network. On a no the session says `oneTap: false`; call
     * `V18Host.sessionChanged()` when the answer flips, so the row is drawn again at once.
     */
    fun onHome(): Boolean

    companion object {
        /** Until a rule is set: every read and the home offer their one-tap questions, as before the rule existed. */
        val ALWAYS: OneTapRule = object : OneTapRule {
            override fun afterRead(access: JSONObject?): Boolean = true
            override fun onHome(): Boolean = true
        }
    }
}

interface V18Host {
    // ---- Words ----

    /**
     * English and Spanish as written at the call site; French, Portuguese, Italian and German come
     * from assets/nucleo/native-android-translations.json (key = the English string). `{0}`, `{1}`
     * in the localized string are replaced with `args`, in every language.
     */
    fun text(en: String, es: String, vararg args: Any?): String
    /** `en` | `es` | `fr` | `pt` | `it` | `de`. */
    val language: String
    /** For dates and numbers: `es-MX`, `pt-BR`, `de-DE`… */
    val locale: String

    // ---- Who is reading ----

    /** The signed-in account id, or null signed out. Signed out is its own owner (`local` in every store). */
    val owner: String?
    val signedIn: Boolean
    /** Changes on every sign-in, sign-out and deletion. */
    val accountEpoch: Long
    val riskNotice: RiskNotice
    /** `riskNotice == ACCEPTED`. Check it before any request the repository does not guard itself. */
    val riskAccepted: Boolean
    /** Captures this account and consent; ask `isCurrent` after every suspension. */
    fun fence(): V18Fence
    /** The reader tag a notification payload carries under `LocalNotice.OWNER` (`V18Reader.tag(owner)`). */
    val readerTag: String

    // ---- The glass and the sheets ----

    /** Opens a native sheet over the glass. False when a sheet or a system prompt is already up. */
    fun present(route: String): Boolean
    /** Closes the open sheet, then opens `route` once the first is really gone. Never two at once. With nothing open it opens at once. */
    fun switchSheet(route: String)
    /** Closes the open sheet, if any. */
    fun closeSheet()
    /** The route of the sheet on screen, or null. */
    val sheetRoute: String?
    /**
     * Asks Bobby about an asset native already knows (a follow-up's button, a board row). The page
     * runs it like a chip: `ask.start {token, question}` with a single-use token. With a sheet open
     * the sheet goes away first. False when the glass cannot take a question now.
     */
    fun startRead(symbol: String, name: String, isEquity: Boolean, question: String): Boolean
    /** Tells the page its state changed (a nudge appeared, went away or was reworded). */
    fun sessionChanged()
    /**
     * Bobby is listening, speaking or answering on the glass. A sheet the person did not just ask
     * for (one that comes back by itself after a sign-in) waits while this is true: opening it
     * would close the mic, stop the voice and cover the read.
     */
    val glassBusy: Boolean
    /** `light`, `soft`, `medium`, `rigid`, `heavy`, `selection`, `success`, `warning`, `error`. */
    fun haptic(kind: String)

    // ---- Reads ----

    /** Hand-offs between a nudge or a notification tap and the screen it opens. */
    val focus: V18Focus
    /** A recent read of the CURRENT reader (the last five since the app started), or null. Never the question. */
    fun readSummary(requestId: String): ReadSummary?
    /** `rapido` | `profundo` | `maximo`: the level a read started now would use. */
    val analysisLevel: String
    /**
     * The body of a desk read exactly as the glass sends it. A thesis review posts it with
     * `repository.streamDebate(body, thesis) { }` and reads the reply with `DeskAnswer(reply)`.
     */
    fun deskBody(symbol: String, question: String, isEquity: Boolean, level: String = analysisLevel): JSONObject
    /** Whether Bobby may offer a one-tap question now. `OneTapRule.ALWAYS` until a feature sets its rule. */
    var oneTap: OneTapRule

    // ---- What this phone keeps besides the theses ----

    /** The quick-access shortcuts kept for the current reader (symbols they asked about, newest first). Empty when none were kept. */
    val shortcuts: List<String>
    /** Removes one symbol from the shortcuts. False when it was not there. */
    fun forgetShortcut(symbol: String): Boolean
    /** Removes every shortcut of the current reader ("Clear the shortcuts on this phone", "Delete everything"). */
    fun clearShortcuts()

    // ---- Stores and services ----

    val nudges: NudgeCenter
    val theses: ThesisBook
    /** The `bobby.v18` preferences. Key everything per owner (`"<feature>.<what>." + (owner ?: "local")`). */
    val store: KeyValueStore
    val repository: BobbyRepository
    val notifier: LocalNotifier
    /** Lives as long as this host (the activity). Main dispatcher. */
    val scope: CoroutineScope
    /** Epoch milliseconds. */
    fun now(): Long
    /** One instance per host for `key` (a feature's centre, shared by its nudge source and its sheet). */
    fun <T : Any> service(key: String, create: () -> T): T

    // ---- What happened (each returns the way to stop listening) ----

    /** A read was delivered: its summary (symbol, verdict, price, who started it), never the question. */
    fun onReadDelivered(listener: (ReadSummary) -> Unit): () -> Unit
    /**
     * The person tapped the question Bobby's CIO wrote for a read, instead of typing their own. The
     * symbol of that read; never the words. Told at the tap, before the read it starts is answered.
     */
    fun onNextQuestionPicked(listener: (String) -> Unit): () -> Unit
    /** The person saved a read (`requestId`, `symbol`). */
    fun onReadSaved(listener: (String, String) -> Unit): () -> Unit
    /** The app came to the front. */
    fun onAppActive(listener: () -> Unit): () -> Unit
    /** Another reader: `owner` and `accountEpoch` are already the new ones. */
    fun onAccountChanged(listener: () -> Unit): () -> Unit
    /** The risk notice was withdrawn: cancel what was planned, keep nothing new. */
    fun onConsentWithdrawn(listener: () -> Unit): () -> Unit
    /** The app speaks another language now (`language` is already the new one): lines the phone holds for later are written again in it. */
    fun onLanguageChanged(listener: () -> Unit): () -> Unit
    /**
     * The account `owner` was deleted: remove everything this phone keeps for it. Runs on the main
     * thread while the repository still holds its lock: local removals only, no network, no suspension.
     */
    fun onAccountDeleted(listener: (String) -> Unit): () -> Unit
    /** "Delete everything" in Memory, for `owner` (null signed out). */
    fun onEraseEverything(listener: (String?) -> Unit): () -> Unit
    /** The Memory screen calls this after deleting the theses: every `onEraseEverything` listener runs for the current owner. */
    fun eraseEverything()

    // ---- Notification taps and links ----

    /**
     * What a tapped notification of this `kind` (`payload["kind"]`) does. The tap is stored, and the
     * handler runs once the glass can honour it: page loaded, app in front, notice accepted, no sheet,
     * mic closed, no read running, nothing speaking. Consumed once; newest wins; an account change
     * clears it; a payload tagged for another reader (`LocalNotice.OWNER`) opens nothing.
     *
     * `accepts` says whether a payload really is this feature's (a well-formed id, a known step).
     * It is asked when the tap is STORED, as iOS does: a payload its feature refuses is never kept,
     * so a malformed tap cannot take the place of a good one that is still waiting.
     */
    fun onNotificationTap(kind: String, accepts: (Map<String, String>) -> Boolean = { true }, handler: (Map<String, String>) -> Unit)
    /** The stored tap, consumed, for a feature that would rather pull it. */
    fun takeNotificationTap(): Map<String, String>?
    /**
     * Asked on the main thread when a planned notification of this `kind` comes due while the app
     * is in front. Return false to keep it off the notification shade (the glass says it instead).
     */
    fun onNotificationDue(kind: String, handler: (Map<String, String>) -> Boolean)
    /** An https link that opened the app (none does until the manifest declares one). The first handler that returns true keeps it; a link nobody keeps is dropped. */
    fun onLink(handler: (String) -> Boolean)

    // ---- What only the activity can do ----

    /** Opens the sign-in tab for `google` or `apple`. The open sheet closes when the account arrives. */
    fun signIn(provider: String)
    /** The system share sheet with this text. */
    fun share(text: String)
    /** Puts the text on the clipboard (Android 13+ shows its own confirmation). */
    fun copy(text: String)
    /** A page on bobbyprotocol.xyz, Google Play or the stores' support sites, in a browser tab. False for anything else. */
    fun openExternal(url: String): Boolean
    /** Bobby's notification settings in the system. */
    fun openNotificationSettings()
    /** Google Play purchases as the app knows them (configured, restore allowed, Pro, the last message). */
    val billing: StateFlow<BillingState>
    /** Looks for a Bobby Pro subscription bought with this Google Play account and attaches it to this Bobby account. Always answers. */
    suspend fun restorePurchases(): BillingOutcome
    /** Where an active Google Play (or Apple) subscription is managed, or null. */
    fun manageSubscriptionUrl(): String?
    /** The existing "notify me when reports are ready" switch for this account (false signed out). */
    val briefingNotifications: Boolean
    /** Turns that switch on or off (asks for the notification permission when needed). */
    fun switchBriefingNotifications(enabled: Boolean)
}
