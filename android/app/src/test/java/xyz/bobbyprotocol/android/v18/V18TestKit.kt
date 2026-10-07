package xyz.bobbyprotocol.android.v18

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.v18.notify.MemoryLocalNotifier

// For every 1.8 test on Android: the REAL host (V18Runtime) over a desk and a screen that live in
// memory. A feature's nudge source, its centre and its hooks are tested against `bench.host` exactly
// as they run in the app:
//
//     @Test fun theOfferOpensItsSheet() = runTest {
//         val bench = V18TestBench(backgroundScope)
//         CreditsNudges.register(bench.host)
//         bench.deliver(symbol = "NVDA")                         // a read arrived
//         val nudge = bench.host.currentNudge()                  // what the glass would show
//         bench.host.nudgeAct(nudge!!.id)                        // the person taps it
//         assertEquals(listOf("credits"), bench.shell.opened)
//     }
//
// Time is `bench.clock` (the centre, the notifier and `host.now()` all read it). Work the host
// posts for "the next turn" (a sheet handing over, a tapped notification, `ask.start` after a
// sheet) runs on `runCurrent()`.

/** The session's side, in memory. */
class FakeDesk : V18Desk {
    override var owner: String? = null
    override val signedIn: Boolean get() = owner != null
    override var accountEpoch = 1L
    override var riskNotice = RiskNotice.ACCEPTED
    override var onGlass = true
    override var busy = false
    override var language = "en"
    override var locale = "en-US"
    override var analysisLevel = "rapido"

    /** Everything native told the page, oldest first. */
    val events = ArrayList<Pair<String, JSONObject>>()
    /** How many times the page was told its session changed. */
    var sessionChanges = 0
    private var tokens = 0

    override fun text(en: String, es: String): String = if (language == "es") es else en
    override fun emit(name: String, payload: JSONObject) { events.add(name to payload) }
    override fun sessionChanged() { sessionChanges += 1 }
    override fun readToken(symbol: String, name: String, isEquity: Boolean, question: String): String = "token-${++tokens}-$symbol"
    override fun deskBody(symbol: String, question: String, isEquity: Boolean, level: String): JSONObject = JSONObject()
        .put("symbol", symbol).put("question", question).put("language", language).put("locale", locale).put("country", JSONObject.NULL)
        .put("assetType", if (isEquity) "equity" else "crypto").put("level", level)
    override val repository: BobbyRepository
        get() = throw IllegalStateException("No network in unit tests: put a small interface in front of the repository and fake it")

    fun events(name: String): List<JSONObject> = events.filter { it.first == name }.map { it.second }
}

/** The activity's side, in memory. A sheet opens and closes at once. */
class FakeShell : V18Shell {
    override var sheetRoute: String? = null
    override var covered = false
    override var active = true
    override var voiceBusy = false

    /** Every sheet opened, in order. */
    val opened = ArrayList<String>()
    val haptics = ArrayList<String>()
    val signIns = ArrayList<String>()
    val shared = ArrayList<String>()
    val copied = ArrayList<String>()
    val externals = ArrayList<String>()
    var quieted = 0
    var notificationSettingsOpened = 0
    /** What the person answers to the system's notification question. */
    var grantsNotifications = true
    var permissionRequests = 0
    var restoreOutcome = BillingOutcome.NOTHING_TO_RESTORE
    var restores = 0
    var managementUrl: String? = null
    internal var onClosed: () -> Unit = {}

    override fun openSheet(route: String) {
        check(sheetRoute == null) { "two sheets at once: $sheetRoute and $route" }
        sheetRoute = route
        opened.add(route)
    }

    override fun dismissSheet() {
        if (sheetRoute == null) return
        sheetRoute = null
        onClosed()
    }

    override fun quietVoice() { quieted += 1 }
    override fun haptic(kind: String) { haptics.add(kind) }
    override fun signIn(provider: String) { signIns.add(provider) }
    override fun share(text: String) { shared.add(text) }
    override fun copy(text: String) { copied.add(text) }
    override fun openExternal(url: String): Boolean { externals.add(url); return url.startsWith("https://") }
    override fun openNotificationSettings() { notificationSettingsOpened += 1 }
    override suspend fun requestNotificationPermission(): Boolean { permissionRequests += 1; return grantsNotifications }
    override val billing = MutableStateFlow(BillingState())
    override suspend fun restorePurchases(): BillingOutcome { restores += 1; return restoreOutcome }
    override fun manageSubscriptionUrl(): String? = managementUrl
    override var briefingNotifications = false
    override fun setBriefingNotifications(enabled: Boolean) { briefingNotifications = enabled }
}

/** The real host with everything around it in memory. Pass `backgroundScope` from `runTest`. */
class V18TestBench(scope: CoroutineScope, val store: MemoryKeyValueStore = MemoryKeyValueStore(), withScreen: Boolean = true) {
    var clock = 1_800_000_000_000L
    val desk = FakeDesk()
    val shell = FakeShell()
    val notifier = MemoryLocalNotifier { clock }
    val nudges = NudgeCenter(store) { clock }
    val taps = V18Taps()
    val shelf = ReadShelf()
    val host = V18Runtime(desk, store, nudges, notifier, scope, shelf, taps) { clock }

    init {
        shell.onClosed = { host.sheetClosed() }
        host.start()
        if (withScreen) host.attach(shell)
    }

    /** The person closes the sheet (swipe, the close button, back). */
    fun closeSheet() = shell.dismissSheet()

    /** A read as the session hands it over once delivered. It carries a question, as the real one does. */
    fun read(requestId: String = "r1", symbol: String = "NVDA", name: String = "NVIDIA", isEquity: Boolean = true, verdict: String = "wait",
             price: Double? = 120.5, memory: JSONObject? = null): JSONObject {
        val read = JSONObject().put("v", 1).put("status", "ok").put("requestId", requestId).put("question", "the person's own words about $symbol")
            .put("asset", JSONObject().put("symbol", symbol).put("name", name).put("isEquity", isEquity))
            .put("market", JSONObject().put("price", price ?: JSONObject.NULL))
            .put("technicals", JSONObject().put("price", JSONObject.NULL))
            .put("agents", JSONObject().put("verdict", verdict).put("direction", "none"))
            .put("provenance", JSONObject().put("asOf", "2026-10-07T12:00:00Z"))
            .put("synthesis", JSONObject().put("headline", "A headline").put("why", "A reason").put("risk", "A risk").put("watch", "A level"))
        if (memory != null) read.put("memory", memory)
        return read
    }

    /** A read arrives on the glass. */
    fun deliver(requestId: String = "r1", symbol: String = "NVDA", name: String = "NVIDIA", isEquity: Boolean = true, verdict: String = "wait",
                price: Double? = 120.5, memory: JSONObject? = null) = host.readDelivered(read(requestId, symbol, name, isEquity, verdict, price, memory))

    /** Another reader takes the phone (null signs out). */
    fun changeAccount(owner: String?) {
        desk.owner = owner
        desk.accountEpoch += 1
        host.accountChanged()
    }
}
