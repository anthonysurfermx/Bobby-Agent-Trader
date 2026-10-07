package xyz.bobbyprotocol.android

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.toPixelMap
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewFeature
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Response
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import xyz.bobbyprotocol.android.nucleo.NucleoStateStore
import xyz.bobbyprotocol.android.push.PushConfiguration
import xyz.bobbyprotocol.android.push.PushRuntime
import xyz.bobbyprotocol.android.push.PushStatus
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * Emulator-only acceptance of the actual Activity/session/renderer, with no fabricated read model.
 * Test interception refuses every API call before DNS. No credentials, reports,
 * purchases, account mutations, fake XP or seeded analyses are supplied. A public starter question
 * exercises the actual refusal path without leaving the emulator. Guest preferences are
 * restored after each case. Production code and network configuration remain unchanged.
 */
@RunWith(AndroidJUnit4::class)
class MainActivityAcceptanceInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private var scenario: ActivityScenario<MainActivity>? = null
    private lateinit var activity: MainActivity
    private lateinit var repository: BobbyRepository
    private lateinit var session: NucleoSession
    private lateinit var web: WebView
    private val backups = linkedMapOf<String, Map<String, *>>()
    private val refusedRequests = CopyOnWriteArrayList<Pair<String, String>>()

    @Before fun setUp() {
        val emulator = Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") ||
            Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone") || Build.HARDWARE in setOf("ranchu", "goldfish")
        assumeTrue("Only dedicated emulator test data may be altered", emulator)
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
        assumeTrue("Acceptance must preserve an already initialized billing SDK", !com.revenuecat.purchases.Purchases.isConfigured)
        assumeTrue("Acceptance is guest-only; preserve any signed-in installation", BobbyRepository(context).session.value == null)
        listOf("bobby.nucleo", "bobby_permissions").forEach { name ->
            val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
            backups[name] = HashMap(preferences.all)
            assertTrue(preferences.edit().clear().commit())
        }
        // Never begin on a consented page before the test network interceptor is attached.
        assertTrue(context.getSharedPreferences("bobby.nucleo", 0).edit().putBoolean("muted", true).putString("language", "en").commit())
        scenario = ActivityScenario.launch(MainActivity::class.java).also { launched ->
            launched.onActivity { actual ->
                activity = actual
                repository = field(actual, "repository")
                session = field(actual, "session")
                assertNull(repository.session.value)
                val noNetwork = OkHttpClient.Builder().addInterceptor { chain ->
                    val request = chain.request()
                    refusedRequests.add(request.method to request.url.encodedPath)
                    Response.Builder().request(request).protocol(Protocol.HTTP_1_1).code(503).message("Local acceptance network disabled")
                        .body("{\"error\":\"Local acceptance network disabled\"}".toResponseBody("application/json".toMediaType())).build()
                }.build()
                // An isolated transport refusal is not a product fixture or injected native session.
                val transport = BobbyRepository::class.java.getDeclaredField("client").apply { isAccessible = true }
                transport.set(repository, noNetwork)
                web = findWeb(actual.window.decorView) ?: error("MainActivity WebView was not attached")
            }
        }
        waitUntil { evaluate("!!window.nucleoBridge && !!window.nucleo") == true }
        val initial = bridge("session")
        assertRealGuestModel(initial)
        assertFalse(initial.getBoolean("riskAccepted"))
        assertEquals("onboarding", initial.getString("page"))
    }

    @After fun tearDown() {
        scenario?.close(); scenario = null
        backups.forEach { (name, values) ->
            val editor = context.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear()
            values.forEach { (key, value) -> editor.restore(key, value) }
            assertTrue(editor.commit())
        }
        backups.clear()
    }

    @Test fun accountAndBriefingPrivacyControlsRemainAccessibleBeforeAiConsent() {
        bridge("openNative", JSONObject().put("route", "account"))
        waitForNativeSheet("account")
        compose.onNodeWithTag("account-profile").assertExists()
        compose.onNodeWithTag("account-level").assertIsDisplayed()
        compose.onNodeWithTag("account-stats").assertIsDisplayed()
        assertReadableNativeText("PROFILE")
        compose.onNodeWithText("Sign in so your XP, streak, gear and island follow you").performScrollTo().assertIsDisplayed()
        assertReadableNativeText("Sign in so your XP, streak, gear and island follow you")
        compose.onNodeWithText("Continue with Google").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Privacy policy").performScrollTo().assertIsDisplayed()
        compose.onNodeWithText("Help and support").assertIsDisplayed()
        assertReadableNativeSystemBars()
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitForNativeDismissal()
        bridge("openNative", JSONObject().put("route", "briefingSettings"))
        waitForNativeSheet("briefingSettings")
        compose.onNodeWithText("Sign in").assertIsDisplayed()
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
        waitForNativeDismissal()
        assertFalse(bridge("session").getBoolean("riskAccepted"))
        assertTrue("Account privacy navigation must not send a guest API request", refusedRequests.isEmpty())
    }

    @Test fun profileVoiceChoicePersistsThroughTheNativeMenuWithoutExternalProcessing() {
        bridge("openNative", JSONObject().put("route", "account"))
        waitForNativeSheet("account")
        compose.onNodeWithTag("account-voice-type").performScrollTo().performClick()
        compose.onNodeWithText("Masculine").performClick()
        assertEquals("male", bridge("session").getString("voicePreference"))
        assertEquals("male", NucleoStateStore(context).voicePreference)
        assertFalse(bridge("session").getBoolean("riskAccepted"))
        assertTrue("Choosing a local voice preference must not fetch audio or send an API request", refusedRequests.isEmpty())
    }

    @OptIn(ExperimentalTestApi::class)
    private fun assertReadableNativeText(text: String) {
        val pixels = compose.onNodeWithText(text).captureToImage().toPixelMap()
        val backgroundLuminance = Color(0xFF0C0F13).luminance()
        var readablePixels = 0
        for (y in 0 until pixels.height) for (x in 0 until pixels.width) {
            val luminance = pixels[x, y].luminance()
            val contrast = (maxOf(luminance, backgroundLuminance) + 0.05) /
                (minOf(luminance, backgroundLuminance) + 0.05)
            if (contrast >= 4.5) readablePixels++
        }
        assertTrue("Native text must have visible glyph pixels with readable contrast: $text", readablePixels > 20)
    }

    private fun assertReadableNativeSystemBars() {
        val statusHeight = onMain {
            ViewCompat.getRootWindowInsets(activity.window.decorView)
                ?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
        }
        assertTrue("The emulator must expose its actual status bar", statusHeight > 0)
        waitUntil {
            val screen = instrumentation.uiAutomation.takeScreenshot() ?: return@waitUntil false
            try {
                var lightPixels = 0
                for (y in 0 until minOf(statusHeight, screen.height)) {
                    for (x in 0 until screen.width / 3) {
                        val pixel = screen.getPixel(x, y)
                        if (android.graphics.Color.red(pixel) > 180 &&
                            android.graphics.Color.green(pixel) > 180 &&
                            android.graphics.Color.blue(pixel) > 180) lightPixels++
                    }
                }
                val navigationBackground = screen.getPixel(10, screen.height - 10)
                lightPixels > 20 && android.graphics.Color.red(navigationBackground) < 50 &&
                    android.graphics.Color.green(navigationBackground) < 50 &&
                    android.graphics.Color.blue(navigationBackground) < 50
            } finally { screen.recycle() }
        }
    }

    @Test fun unconfiguredPushBootstrapStaysDisabledWithoutFirebaseInitialization() {
        val configuration = PushConfiguration(enabled = BuildConfig.FCM_ENABLED,
            projectId = BuildConfig.FCM_PROJECT_ID, applicationId = BuildConfig.FCM_APPLICATION_ID,
            senderId = BuildConfig.FCM_SENDER_ID, apiKey = BuildConfig.FCM_API_KEY)
        assumeTrue("This bootstrap case requires disabled FCM or incomplete public Firebase configuration; configured builds need separate consented lifecycle tests", !configuration.configured)
        val actualPush: PushRuntime = field(activity, "push")
        assertEquals("Actual Activity push must stay disabled without configuration", PushStatus.DISABLED, actualPush.status.value)
        // Detect SDK presence without class initialization. The default build has no Firebase SDK.
        val firebase = try { Class.forName("com.google.firebase.FirebaseApp", false, context.classLoader) }
            catch (_: ClassNotFoundException) { null }
        fun assertNoInitializedFirebaseApp() {
            if (firebase == null) {
                assertFalse("An optional FCM build must package the Firebase SDK", BuildConfig.FCM_ENABLED)
                return
            }
            // getApps is a registry query; never call initializeApp or messaging registration here.
            val apps = firebase.getMethod("getApps", Context::class.java).invoke(null, context) as List<*>
            assertTrue("Missing configuration must not initialize a Firebase app", apps.isEmpty())
        }
        assertNoInitializedFirebaseApp()
        assertTrue("Unconsented bootstrap must not attempt an API request", refusedRequests.isEmpty())
        enterGuestApp()
        assertEquals("Guest onboarding must not enable an unconfigured push transport", PushStatus.DISABLED, actualPush.status.value)
        assertNoInitializedFirebaseApp()
        assertNoAnalysisOrMutation()
    }

    @Test fun consentGateAndLocalOnboardingReachTheRealGuestAppWithoutAnAnalysis() {
        val refused = bridge("ask", JSONObject().put("question", "BTC?"))
        assertEquals("risk_not_accepted", refused.getString("code"))
        assertTrue("Before consent no API transport should be attempted", refusedRequests.isEmpty())
        val notice = bridge("riskNotice")
        val wrong = bridge("acceptRisk", JSONObject().put("version", notice.getInt("version") + 1))
        assertFalse(wrong.getBoolean("accepted"))
        enterGuestApp()
        val actual = bridge("session")
        assertRealGuestModel(actual)
        assertTrue(actual.getBoolean("riskAccepted"))
        assertTrue(actual.getBoolean("onboarded"))
        assertEquals("app", actual.getString("page"))
        assertNull(evaluate("window.nucleo.read()"))
        assertEquals(0, (evaluate("window.nucleo.ledger().length") as Number).toInt())
        assertEquals("undefined", evaluate("typeof window.NUCLEO_FIXTURES"))
        assertEquals(true, evaluate("window.nucleo.input===null && window.nucleo.type===null"))
        assertNoAnalysisOrMutation()
    }

    @Test fun sixLanguageChoicesRenderTheRealLocalizedGuestTypingSurface() {
        enterGuestApp()
        val languages = listOf(
            Triple("en", "English", "Ask about a stock or a crypto…"),
            Triple("es", "Español", "Pregunta por una acción o cripto…"),
            Triple("fr", "Français", "Une question sur une action ou une crypto…"),
            Triple("pt", "Português", "Pergunta sobre uma ação ou cripto…"),
            Triple("it", "Italiano", "Chiedi di un’azione o una cripto…"),
            Triple("de", "Deutsch", "Frage zu einer Aktie oder Kryptowährung…"),
        )
        languages.forEach { (code, label, placeholder) ->
            bridge("openNative", JSONObject().put("route", "account"))
            waitForNativeSheet("account")
            evaluate("window.acceptanceDocumentSentinel=true;true")
            compose.onNodeWithTag("account-language").performScrollTo().performClick()
            compose.onNode(hasText(label) and hasAnyAncestor(isPopup())).performClick()
            waitUntil { evaluate("window.acceptanceDocumentSentinel!==true && location.pathname.endsWith('/app.html') && document.documentElement.lang===${JSONObject.quote(code)} && window.nucleo.state()==='IDLE'") == true }
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
            waitForNativeDismissal()
            val native = bridge("session")
            assertRealGuestModel(native)
            assertEquals(code, native.getString("language"))
            assertEquals(session.locale, native.getString("locale"))
            assertEquals(native.getString("locale"), JSONObject(evaluate("JSON.stringify(window.nucleo.session())") as String).getString("locale"))
            tapDom("pill")
            waitUntil { evaluate("window.nucleo.state()==='TYPING'") == true }
            assertEquals(placeholder, evaluate("document.getElementById('ta').placeholder"))
            assertEquals(true, evaluate("document.getElementById('taSend').disabled"))
            cancelTyping()
        }
        assertNoAnalysisOrMutation()
    }

    @Test fun starterQuestionRetiresHomeLayersEvenWhenTheNativeTransportFails() {
        enterGuestApp()
        waitUntil { evaluate("getComputedStyle(document.querySelector('#greet .t span')).opacity > 0.9") == true }
        // The chip is born from the pill before it reaches its final hit rectangle. A screen tap
        // must use settled geometry, rather than a coordinate sampled from that flight.
        var previousRect: List<Double>? = null
        var stableFrames = 0
        waitUntil {
            val raw = evaluate("JSON.stringify((function(){var e=document.querySelector('#chipRow [data-hit=chip]');if(!e||window.nucleo.state()!=='IDLE'||Number(getComputedStyle(e).opacity)<0.99)return null;e.id='acceptanceStarter';var r=e.getBoundingClientRect();return [r.left,r.top,r.width,r.height];})())") as? String
            val rect = raw?.takeUnless { it == "null" }?.let { value ->
                val array = JSONArray(value)
                (0 until array.length()).map { array.getDouble(it) }
            }
            val old = previousRect
            stableFrames = if (rect != null && old != null && rect.size == 4 &&
                rect.indices.all { kotlin.math.abs(rect[it] - old[it]) < 0.25 }) stableFrames + 1 else 0
            previousRect = rect
            stableFrames >= 3
        }
        val logBeforeTap = (evaluate("window.nucleo.log().length") as Number).toInt()
        tapDom("acceptanceStarter")
        // The bootstrap GET is unrelated to this action. Require actual question resolution.
        waitUntil { refusedRequests.any { it.first == "POST" && it.second == "/api/bobby-asset-search" } }
        assertEquals(true, evaluate("window.nucleo.log().slice($logBeforeTap).some(function(row){return row[1]==='SENDING';})"))
        waitUntil { evaluate("window.nucleo.state()!=='IDLE' && Array.from(document.querySelectorAll('#greet .t span,#greet .s')).every(function(e){return Number(getComputedStyle(e).opacity)<0.01;}) && Array.from(document.querySelectorAll('#meri i')).every(function(e){return Number(getComputedStyle(e).opacity)<0.01;})") == true }
        assertTrue("The pure-glass fallback companion image must remain invisible",
            evaluate("Number(getComputedStyle(document.getElementById('fbImg')).opacity)===0") == true)
        assertTrue("Only asset browsing/resolution may reach the refusing transport: $refusedRequests",
            refusedRequests.all { it.second == "/api/bobby-asset-search" && it.first in setOf("GET", "POST") })
        assertNull(evaluate("window.nucleo.read() && window.nucleo.read().model"))
        assertEquals(0, (evaluate("window.nucleo.ledger().length") as Number).toInt())
    }

    @Test fun nativeSheetsAndAwaitedSignInPaywallRequestsCancelOnSystemBack() {
        enterGuestApp()
        listOf("account", "riskNotice", "squad", "locker", "memory", "briefings", "reportContent").forEach { route ->
            bridge("openNative", JSONObject().put("route", route))
            waitForNativeSheet(route)
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
            waitForNativeDismissal()
            assertFalse("Closing a sheet must preserve the Activity", activity.isFinishing)
        }
        listOf("signIn" to "account", "paywall" to "paywall").forEach { (method, route) ->
            startPromise("window.nucleoBridge.call(${JSONObject.quote(method)}, {})")
            waitForNativeSheet(route)
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK)
            val answer = awaitPromise()
            assertEquals("cancelled", answer.getString("status"))
            waitForNativeDismissal()
            assertFalse(activity.isFinishing)
        }
        val cancelled = bridge("cancel")
        assertFalse(cancelled.getBoolean("cancelled"))
        assertRealGuestModel(bridge("session"))
        assertNoAnalysisOrMutation()
    }

    @Test fun unavailableOnDeviceDictationKeepsKeyboardAndCancelsUnicodeDraftLocally() {
        enterGuestApp()
        val permission = bridge("speech.permission")
        assumeTrue("This case verifies the emulator without an on-device recognition service", permission.optString("state") == "unavailable")
        assertFalse(permission.getBoolean("onDevice"))
        assertEquals("unavailable", bridge("speech.requestPermission").getString("state"))
        assertEquals("unavailable", bridge("speech.start").getString("status"))
        assertEquals("unavailable", bridge("session").getJSONObject("mic").getString("state"))
        tapDom("pill")
        waitUntil { evaluate("window.nucleo.state()==='TYPING' && document.activeElement.id==='ta'") == true }
        val bounds = JSONObject(evaluate("JSON.stringify((function(){var r=document.getElementById('typeBox').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:window.visualViewport?window.visualViewport.height:innerHeight};})())") as String)
        assertTrue(bounds.toString(), bounds.getDouble("height") >= 48)
        assertTrue(bounds.toString(), bounds.getDouble("top") >= 0)
        assertTrue("Typing surface must remain in the keyboard-adjusted viewport", bounds.getDouble("bottom") <= bounds.getDouble("viewport") + 2)
        evaluate("var ta=document.getElementById('ta');ta.value='¿BTC a 24h? 🧠';ta.dispatchEvent(new Event('input',{bubbles:true}));true")
        assertEquals(false, evaluate("document.getElementById('taSend').disabled"))
        assertEquals("¿BTC a 24h? 🧠", evaluate("document.getElementById('ta').value"))
        cancelTyping()
        assertEquals("", evaluate("document.getElementById('ta').value"))
        assertNull(evaluate("window.nucleo.read()"))
        assertNoAnalysisOrMutation()
    }

    private fun enterGuestApp() {
        val notice = bridge("riskNotice")
        assertTrue(bridge("acceptRisk", JSONObject().put("version", notice.getInt("version"))).getBoolean("accepted"))
        val roster = bridge("roster").getJSONArray("companions")
        val starter = (0 until roster.length()).map { roster.getJSONObject(it) }.first { it.optBoolean("unlocked") }
        assertRealGuestModel(bridge("setCompanion", JSONObject().put("id", starter.getString("id"))))
        // finishOnboarding navigates away before replying; assert the resulting real page/session.
        evaluate("window.nucleoBridge.call('finishOnboarding',{}).catch(function(){});true")
        waitUntil { evaluate("location.pathname.endsWith('/app.html') && !!window.nucleo && window.nucleo.state()==='IDLE'") == true }
        assertEquals("app", bridge("session").getString("page"))
        assertEquals("", currentRoute().orEmpty())
    }

    private fun assertRealGuestModel(model: JSONObject) {
        assertEquals("android", model.getString("platform"))
        assertEquals(1, model.getInt("v"))
        assertFalse(model.getBoolean("fixtures"))
        assertFalse(model.getBoolean("signedIn"))
        assertEquals(0, model.getInt("xp"))
        assertFalse(model.has("accessToken"))
        assertFalse(model.has("refreshToken"))
        assertNull(repository.session.value)
    }

    private fun assertNoAnalysisOrMutation() {
        val readOnlyPaths = setOf("/api/bobby-asset-search", "/api/bobby-access")
        assertTrue("Only refused asset/access reads are allowed: $refusedRequests", refusedRequests.all { (method, path) -> method == "GET" && path in readOnlyPaths })
    }

    private fun currentRoute(): String? {
        var route: String? = null
        instrumentation.runOnMainSync {
            val value = field<androidx.compose.runtime.State<*>>(activity, "route\$delegate")
            route = value.value as? String
        }
        return route
    }

    private fun cancelTyping() {
        // A real Android key event reaches the shipped textarea's Escape cancellation handler.
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_ESCAPE)
        waitUntil { evaluate("window.nucleo.state()==='IDLE'") == true }
    }

    private fun waitForNativeSheet(route: String) {
        waitUntil { currentRoute() == route }
        compose.waitUntil(20_000) { compose.onAllNodes(isDialog()).fetchSemanticsNodes().size == 1 }
        compose.onNode(isDialog()).assertIsDisplayed()
        // A route value changes before the separate Dialog window receives focus.
        waitUntil { onMain { !web.hasWindowFocus() } }
    }

    private fun waitForNativeDismissal() {
        waitUntil { currentRoute() == null && onMain { web.hasWindowFocus() } }
        compose.waitUntil(20_000) { compose.onAllNodes(isDialog()).fetchSemanticsNodes().isEmpty() }
        compose.waitForIdle()
    }

    private fun tapDom(id: String) {
        waitUntil { onMain { web.isShown && web.hasWindowFocus() } }
        waitUntil { evaluate("(function(){var e=document.getElementById(${JSONObject.quote(id)}),r=e.getBoundingClientRect(),s=getComputedStyle(e),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>0 && r.height>0 && s.visibility==='visible' && s.pointerEvents!=='none' && h && (h===e || e.contains(h));})()") == true }
        val position = JSONArray(evaluate("JSON.stringify((function(){var r=document.getElementById(${JSONObject.quote(id)}).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,innerWidth];})())") as String)
        val xy = IntArray(2)
        var width = 0
        instrumentation.runOnMainSync { web.getLocationOnScreen(xy); width = web.width }
        val scale = width / position.getDouble(2)
        val x = (xy[0] + position.getDouble(0) * scale).toFloat()
        val y = (xy[1] + position.getDouble(1) * scale).toFloat()
        val down = SystemClock.uptimeMillis()
        MotionEvent.obtain(down, down, MotionEvent.ACTION_DOWN, x, y, 0).also { instrumentation.sendPointerSync(it); it.recycle() }
        MotionEvent.obtain(down, down + 30, MotionEvent.ACTION_UP, x, y, 0).also { instrumentation.sendPointerSync(it); it.recycle() }
    }

    private fun bridge(method: String, params: JSONObject = JSONObject()): JSONObject {
        startPromise("window.nucleoBridge.call(${JSONObject.quote(method)},$params)")
        return awaitPromise()
    }
    private fun startPromise(expression: String) {
        evaluate("window.acceptanceResult=null;($expression).then(function(r){window.acceptanceResult=JSON.stringify(r);},function(e){window.acceptanceResult=JSON.stringify({unexpectedError:e.code||String(e)});});true")
    }
    private fun awaitPromise(): JSONObject {
        waitUntil { evaluate("typeof window.acceptanceResult==='string'") == true }
        val value = JSONObject(evaluate("window.acceptanceResult") as String)
        assertFalse(value.toString(), value.has("unexpectedError"))
        return value
    }
    private fun evaluate(script: String): Any? {
        val done = CountDownLatch(1)
        val value = AtomicReference<Any?>()
        instrumentation.runOnMainSync { web.evaluateJavascript(script) { result ->
            value.set(runCatching { JSONArray("[$result]").get(0).takeUnless { it == JSONObject.NULL } }.getOrNull()); done.countDown()
        } }
        // A hosted CI emulator draws the page's WebGL scene in software: one frame can take seconds there.
        assertTrue("JavaScript evaluation timed out", done.await(30, TimeUnit.SECONDS))
        return value.get()
    }
    private fun waitUntil(condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(90)
        while (System.nanoTime() < deadline) {
            // Pump Compose's test clock before reading focus/route; Dialog transitions recompose here.
            compose.waitForIdle()
            if (condition()) return
            Thread.sleep(40)
        }
        fail("Acceptance condition did not complete; ${diagnosticState()}")
    }
    private fun <T> onMain(action: () -> T): T {
        val result = AtomicReference<T>()
        instrumentation.runOnMainSync { result.set(action()) }
        return result.get()
    }
    private fun diagnosticState(): String {
        if (!::activity.isInitialized) return "Activity not launched"
        val nativeRoute = currentRoute()
        val native = onMain {
            "finishing=${activity.isFinishing}, route=$nativeRoute, webFocus=${web.hasFocus()}, windowFocus=${web.hasWindowFocus()}, " +
                "ime=${ViewCompat.getRootWindowInsets(web)?.isVisible(WindowInsetsCompat.Type.ime())}, web=${web.width}x${web.height}"
        }
        val dom = runCatching { evaluate("JSON.stringify((function(){var e=document.getElementById('pill'),r=e&&e.getBoundingClientRect(),s=e&&getComputedStyle(e),h=r&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return {page:location.pathname,language:document.documentElement.lang,state:window.nucleo&&window.nucleo.state(),log:window.nucleo&&window.nucleo.log(),active:document.activeElement&&document.activeElement.id,pill:r&&{x:r.x,y:r.y,w:r.width,h:r.height,visibility:s.visibility,opacity:s.opacity,pointerEvents:s.pointerEvents,hit:h&&h.id}};})())") }.getOrNull()
        return "$native; dom=$dom"
    }
    private fun findWeb(view: View): WebView? = when (view) {
        is WebView -> view
        is ViewGroup -> (0 until view.childCount).firstNotNullOfOrNull { findWeb(view.getChildAt(it)) }
        else -> null
    }
    @Suppress("UNCHECKED_CAST") private fun <T> field(owner: Any, name: String): T = owner.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(owner) as T
    @Suppress("UNCHECKED_CAST") private fun SharedPreferences.Editor.restore(key: String, value: Any?) {
        when (value) {
            is String -> putString(key, value); is Boolean -> putBoolean(key, value); is Int -> putInt(key, value)
            is Long -> putLong(key, value); is Float -> putFloat(key, value); is Set<*> -> putStringSet(key, value as Set<String>)
        }
    }
}
