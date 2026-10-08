package xyz.bobbyprotocol.android

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import xyz.bobbyprotocol.android.nucleo.NucleoStateStore
import xyz.bobbyprotocol.android.nucleo.NucleoPolicy
import xyz.bobbyprotocol.android.platform.NucleoWebView
import java.util.UUID
import java.io.ByteArrayInputStream
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** Test-only pages and dispatch probes exercise the shipped renderer and production WebView boundary. */
@RunWith(AndroidJUnit4::class)
class NucleoBridgeInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private lateinit var context: IsolatedContext
    private lateinit var scope: CoroutineScope
    private lateinit var session: NucleoSession
    private lateinit var web: NucleoWebView
    private val requests = CopyOnWriteArrayList<String>()
    private val processingChecks = AtomicInteger()
    private val heldRequests = AtomicInteger()
    private val unavailable = AtomicReference<String?>()
    private val heldSession = CompletableDeferred<JSONObject>()

    @Before
    fun setUp() {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
        context = IsolatedContext(instrumentation.targetContext, "bridge-test-${UUID.randomUUID()}")
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        onMain {
            val repository = BobbyRepository(context)
            repository.allowsExternalProcessing = { processingChecks.incrementAndGet(); false }
            session = NucleoSession(context, repository, scope, { name, payload -> web.emit(name, payload) }, {})
            web = NucleoWebView(WebView(context), scope, { method, params ->
                requests.add(method)
                when {
                    method == "session" && params.optBoolean("held") -> { heldRequests.incrementAndGet(); heldSession.await() }
                    method == "speech.permission" -> JSONObject().put("state", "unavailable").put("onDevice", false)
                    method == "haptic" || method == "stopSpeaking" -> JSONObject()
                    method == "previewVoice" || method == "speak" -> JSONObject().put("status", "muted")
                    else -> session.dispatch(method, params)
                }
            }, unavailable::set)
            web.load("onboarding")
        }
        waitUntil { evaluate("!!window.nucleoBridge") == true }
    }

    @After
    fun tearDown() {
        if (::web.isInitialized) onMain { session.close(); web.close() }
        if (::scope.isInitialized) scope.cancel()
        if (::context.isInitialized) context.clear()
    }

    @Test
    fun bundledEngineUsesNativeV1SessionWithoutFixturesOrAccountSecrets() {
        val result = promise("window.nucleoBridge.call('session', {})")
        assertEquals(1, result.getInt("v"))
        assertEquals("android", result.getString("platform"))
        assertFalse(result.getBoolean("fixtures"))
        assertFalse(result.getBoolean("riskAccepted"))
        assertEquals("onboarding", result.getString("page"))
        assertFalse(result.has("accessToken"))
        assertFalse(result.has("refreshToken"))
        assertEquals(true, evaluate("window.nucleoBridge.native"))
        assertEquals("object", evaluate("typeof window.BobbyNucleo"))
        assertEquals("undefined", evaluate("typeof window.NUCLEO_FIXTURES"))
        assertNull(unavailable.get())
    }

    @Test
    fun nativeConsentGateRejectsQuestionsAndUnknownSavedReadsBeforeNetworking() {
        val before = promise("window.nucleoBridge.call('suggestions', {})")
        assertEquals(0, before.getJSONArray("movers").length())
        val ask = promise("window.nucleoBridge.call('ask', {question:'BTC?'})")
        assertEquals("error", ask.getString("status"))
        assertEquals("risk_not_accepted", ask.getString("code"))
        val cancel = promise("window.nucleoBridge.call('cancel', {})")
        assertFalse(cancel.getBoolean("cancelled"))
        val forged = promise("window.nucleoBridge.raw({v:1,method:'saveThesis',params:{requestId:'made-up'}})")
        assertFalse(forged.getBoolean("ok"))
        assertEquals("invalid_params", forged.getJSONObject("error").getString("code"))
        assertEquals("No external processing may even be attempted before consent", 0, processingChecks.get())
        val notice = promise("window.nucleoBridge.call('riskNotice', {})")
        val wrongVersion = notice.getInt("version") + 1
        val refused = promise("window.nucleoBridge.call('acceptRisk', {version:$wrongVersion})")
        assertFalse(refused.getBoolean("accepted"))
        assertFalse(session.riskAccepted)
    }

    @Test
    fun afterConsentTheRowSaysWhoseAssetsItHoldsAndAChipMarksOnlyAPlainQuestion() {
        // The real session behind the real bridge (follow-ups slice 1). The transport refuses every
        // processing request here, so nothing leaves the emulator.
        val notice = promise("window.nucleoBridge.call('riskNotice', {})")
        val accepted = promise("window.nucleoBridge.call('acceptRisk', {version:${notice.getInt("version")}})")
        assertTrue(accepted.getBoolean("accepted"))
        // A reader who never asked: the default tickers, and none of them is theirs.
        val row = promise("window.nucleoBridge.call('suggestions', {})").getJSONArray("quickAccess")
        assertEquals(listOf("BTC", "NVDA", "ETH"), (0 until row.length()).map { row.getJSONObject(it).getString("symbol") })
        assertTrue(row.toString(), (0 until row.length()).all { row.getJSONObject(it).get("own") == false })
        // No rule says the next read would be refused: the session carries no `oneTap` key.
        assertFalse(promise("window.nucleoBridge.call('session', {})").has("oneTap"))
        // `chip` is a boolean, and it marks a plain question only: never a token, never a follow-up of a read.
        for (params in listOf("{token:'t',chip:true}", "{followUpOf:'11111111-1111-4111-8111-111111111111',question:'q',chip:true}", "{question:'BTC?',chip:'yes'}")) {
            val refused = promise("window.nucleoBridge.raw({v:1,method:'ask',params:$params})")
            assertFalse(params, refused.getBoolean("ok"))
            assertEquals(params, "invalid_params", refused.getJSONObject("error").getString("code"))
        }
        // A chip's question is asked like any other: it reaches the desk's first request, which this transport refuses.
        val checksBefore = processingChecks.get()
        val chip = promise("window.nucleoBridge.call('ask', {question:'BTC?',chip:true})")
        assertEquals(chip.toString(), "error", chip.getString("status"))
        assertTrue("the question went as far as resolving its asset", processingChecks.get() > checksBefore)
        // A read that was never delivered leaves the row as it was.
        val after = promise("window.nucleoBridge.call('suggestions', {})").getJSONArray("quickAccess")
        assertEquals(row.toString(), after.toString())
    }

    @Test
    fun malformedAndUnknownMethodsReturnProtocolFaultsAndOversizedMessagesNeverDispatch() {
        val unknown = promise("window.nucleoBridge.raw({v:1,method:'fetchAccountToken',params:{}})")
        assertFalse(unknown.getBoolean("ok"))
        assertEquals("unknown_method", unknown.getJSONObject("error").getString("code"))
        val malformed = promise("window.nucleoBridge.raw({v:'1',method:'session',params:{}})")
        assertFalse(malformed.getBoolean("ok"))
        assertEquals("invalid_params", malformed.getJSONObject("error").getString("code"))
        val fractional = promise("window.nucleoBridge.raw({v:1.5,method:'session',params:{}})")
        assertFalse(fractional.getBoolean("ok"))
        evaluate("window.BobbyNucleo.postMessage(JSON.stringify({id:'oversized',v:1,method:'oversized-probe',params:{text:'x'.repeat(66000)}})); true")
        instrumentation.waitForIdleSync()
        assertFalse(requests.contains("oversized-probe"))
        evaluate("window.BobbyNucleo.postMessage('{broken JSON'); true")
        instrumentation.waitForIdleSync()
        assertFalse(requests.contains("oversized-probe"))
    }

    @Test
    fun binaryMessageIsIgnoredAndNextNativeSessionStillCompletes() {
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_ARRAY_BUFFER))
        evaluate("window.BobbyNucleo.postMessage(new ArrayBuffer(8));true")
        instrumentation.waitForIdleSync()
        val result = promise("window.nucleoBridge.call('session', {})")
        assertEquals("android", result.getString("platform"))
        assertEquals(1, result.getInt("v"))
        assertNull(unavailable.get())
    }

    @Test
    fun sameOriginSubframeCannotDispatchEvenWhenItHasTheInjectedListener() {
        val before = requests.count { it == "subframe-probe" }
        // A test-only client permits local HTML and frames. Production navigation guards and CSP
        // additionally block these documents; this harness isolates the native main-frame guard.
        val childURL = "https://appassets.androidplatform.net/assets/nucleo/subframe-probe.html"
        val child = "<html><body><script>parent.frameProbeHasListener=typeof window.BobbyNucleo;try{window.BobbyNucleo.postMessage(JSON.stringify({id:'child',v:1,method:'subframe-probe',params:{}}));}finally{parent.frameProbeDone=true;}</script></body></html>"
        val html = "<html><body><script>window.frameProbeDone=false;</script><iframe src='$childURL'></iframe></body></html>"
        loadLocalProbe(TRUSTED_PAGE, mapOf(TRUSTED_PAGE to html, childURL to child))
        waitUntil { evaluate("window.frameProbeDone===true") == true }
        assertEquals("object", evaluate("window.frameProbeHasListener"))
        instrumentation.waitForIdleSync()
        assertEquals(before, requests.count { it == "subframe-probe" })
    }

    @Test
    fun foreignOriginDoesNotReceiveNativeListener() {
        promise("window.nucleoBridge.call('session', {})")
        val before = requests.size
        val foreign = "https://foreign.invalid/"
        loadLocalProbe(foreign, mapOf(foreign to "<html><body>foreign origin probe</body></html>"))
        waitUntil { evaluate("location.hostname") == "foreign.invalid" }
        assertEquals("undefined", evaluate("typeof window.BobbyNucleo"))
        assertEquals(before, requests.size)
    }

    private fun loadLocalProbe(url: String, documents: Map<String, String>) = onMain {
        web.view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = false
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val document = documents[request.url.toString()]
                return if (document != null) WebResourceResponse("text/html", "utf-8", ByteArrayInputStream(document.toByteArray()))
                else WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(byteArrayOf()))
            }
        }
        web.view.loadUrl(url)
    }

    @Test
    fun outstandingReplyFromPreviousPageIsDroppedAfterReload() {
        evaluate("window.nucleoBridge.call('session',{held:true});true")
        waitUntil { heldRequests.get() == 1 }
        evaluate("window.previousPageSentinel=true;true")
        onMain { web.reload("onboarding") }
        waitUntil { evaluate("window.previousPageSentinel!==true && !!window.nucleoBridge") == true }
        promise("window.nucleoBridge.call('session', {})")
        evaluate("window.staleReplies=0;const originalReceive=window.nucleoBridge.receive;window.nucleoBridge.receive=function(id,reply){if(reply.result&&reply.result.staleProbe)window.staleReplies++;originalReceive(id,reply);};true")
        onMain { heldSession.complete(JSONObject().put("staleProbe", true)) }
        instrumentation.waitForIdleSync()
        assertEquals(0, (evaluate("window.staleReplies") as Number).toInt())
    }

    @Test
    fun durableAwardKeepsLedgerAndPendingEventTogetherAcrossStoreRecreationAndAccountSwitch() {
        onMain {
            val original = NucleoStateStore(context)
            original.bindOwner("test-owner-a")
            original.riskVersion = 5
            original.onboarded = true
            original.companionId = "test-companion"
            original.recordAward("test-owner-a", NucleoPolicy.Counters(xp = 20, dailyAwards = 1),
                JSONObject().put("id", "test-read").put("eventId", "test-event").put("points", 20).put("synced", false),
                JSONObject().put("id", "test-event").put("kind", "no_trade_respected"))
            val restored = NucleoStateStore(context)
            restored.bindOwner("test-owner-b")
            assertEquals(0, restored.counters("test-owner-b").xp)
            assertEquals(0, restored.ledger("test-owner-b").length())
            assertEquals(0, restored.pending("test-owner-b").length())
            assertNull(restored.companionId)
            assertEquals(0, restored.riskVersion)
            restored.bindOwner("test-owner-a")
            assertEquals(20, restored.counters("test-owner-a").xp)
            assertEquals("test-read", restored.ledger("test-owner-a").getJSONObject(0).getString("id"))
            assertEquals("test-event", restored.pending("test-owner-a").getJSONObject(0).getString("id"))
            assertEquals(5, restored.riskVersion)
            assertTrue(restored.onboarded)
            assertEquals("test-companion", restored.companionId)
            restored.applySync("test-owner-a", JSONObject().put("xp", 20),
                JSONArray().put(JSONObject().put("id", "test-event").put("duplicate", true)))
            val afterAck = NucleoStateStore(context)
            assertEquals(0, afterAck.pending("test-owner-a").length())
            assertTrue(afterAck.ledger("test-owner-a").getJSONObject(0).getBoolean("synced"))
            assertEquals(20, afterAck.ledger("test-owner-a").getJSONObject(0).getInt("points"))
        }
    }

    @Test
    fun guestSignInInheritsOnboardingConsentButDoesNotTransferGuestAwardsOrHistory() {
        onMain {
            val store = NucleoStateStore(context)
            store.bindOwner(null)
            store.riskVersion = 5; store.onboarded = true; store.companionId = "test-companion"
            store.recordAward(null, NucleoPolicy.Counters(xp = 10),
                JSONObject().put("id", "guest-read"), JSONObject().put("id", "guest-event"))
            store.bindOwner("test-new-owner", inheritGuest = true)
            assertEquals(5, store.riskVersion)
            assertTrue(store.onboarded)
            assertEquals("test-companion", store.companionId)
            assertEquals(0, store.counters("test-new-owner").xp)
            assertEquals(0, store.pending("test-new-owner").length())
            assertEquals(0, store.ledger("test-new-owner").length())
            assertEquals(10, store.counters(null).xp)
            assertEquals("guest-read", store.ledger(null).getJSONObject(0).getString("id"))
        }
    }

    private fun promise(expression: String): JSONObject {
        evaluate("window.bridgeTestResult=null;($expression).then(function(result){window.bridgeTestResult=JSON.stringify(result);},function(error){window.bridgeTestResult=JSON.stringify({unexpectedError:error.code||String(error)});});true")
        waitUntil { evaluate("typeof window.bridgeTestResult==='string'") == true }
        val result = JSONObject(evaluate("window.bridgeTestResult") as String)
        assertFalse(result.toString(), result.has("unexpectedError"))
        return result
    }

    private fun evaluate(script: String): Any? {
        val done = CountDownLatch(1)
        val result = AtomicReference<Any?>()
        onMain { web.view.evaluateJavascript(script) { value ->
            result.set(runCatching { JSONArray("[$value]").get(0).takeUnless { it == JSONObject.NULL } }.getOrNull())
            done.countDown()
        } }
        assertTrue("JavaScript evaluation timed out", done.await(5, TimeUnit.SECONDS))
        return result.get()
    }

    private fun waitUntil(predicate: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12)
        while (System.nanoTime() < deadline) {
            if (predicate()) return
            Thread.sleep(25)
        }
        fail("WebView condition did not complete; unavailable=${unavailable.get()}")
    }

    private fun onMain(action: () -> Unit) = instrumentation.runOnMainSync(action)

    /** Production assets and Keystore are real; test preferences never alter a user's app session. */
    private class IsolatedContext(base: Context, private val prefix: String) : ContextWrapper(base) {
        private val names = mutableSetOf<String>()
        override fun getApplicationContext(): Context = this
        override fun getSharedPreferences(name: String, mode: Int): SharedPreferences {
            val isolated = "$prefix.$name"
            names.add(isolated)
            return super.getSharedPreferences(isolated, mode)
        }
        fun clear() { names.forEach { super.getSharedPreferences(it, Context.MODE_PRIVATE).edit().clear().commit() } }
    }

    companion object { private const val TRUSTED_PAGE = "https://appassets.androidplatform.net/assets/nucleo/onboarding.html" }
}
