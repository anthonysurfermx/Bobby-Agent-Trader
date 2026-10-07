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
// the fakes in app/src/test/…/v18/V18TestKit.kt, so what a test exercises is what ships.
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

    /** A read was delivered: its summary (symbol, verdict, price), never the question. */
    fun onReadDelivered(listener: (ReadSummary) -> Unit): () -> Unit
    /** The person saved a read (`requestId`, `symbol`). */
    fun onReadSaved(listener: (String, String) -> Unit): () -> Unit
    /** The app came to the front. */
    fun onAppActive(listener: () -> Unit): () -> Unit
    /** Another reader: `owner` and `accountEpoch` are already the new ones. */
    fun onAccountChanged(listener: () -> Unit): () -> Unit
    /** The risk notice was withdrawn: cancel what was planned, keep nothing new. */
    fun onConsentWithdrawn(listener: () -> Unit): () -> Unit
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
     */
    fun onNotificationTap(kind: String, handler: (Map<String, String>) -> Unit)
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
    fun setBriefingNotifications(enabled: Boolean)
}
