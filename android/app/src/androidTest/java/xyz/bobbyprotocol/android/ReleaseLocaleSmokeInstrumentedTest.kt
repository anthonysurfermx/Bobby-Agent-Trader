package xyz.bobbyprotocol.android

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
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
import xyz.bobbyprotocol.android.data.SecureStore
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import xyz.bobbyprotocol.android.nucleo.NucleoStateStore
import xyz.bobbyprotocol.android.platform.NucleoWebView
import xyz.bobbyprotocol.android.ui.reportContentTitle
import xyz.bobbyprotocol.android.v18.StageNetwork
import xyz.bobbyprotocol.android.v18.V18Fixtures
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18Shots
import java.time.Instant
import java.util.Locale
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Real release Activity/session/bridge and native screens. Only network/account data are staged.
 * CI's software WebView uses the shipped no-WebGL fallback; native screenshots are listing-sized.
 * Never run this on a user's phone. No real credentials, mutations or outgoing requests are used.
 */
@RunWith(AndroidJUnit4::class)
class ReleaseLocaleSmokeInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context get() = instrumentation.targetContext
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private lateinit var language: String
    private var scenario: ActivityScenario<MainActivity>? = null
    private lateinit var activity: MainActivity
    private lateinit var session: NucleoSession
    private lateinit var repository: BobbyRepository
    private lateinit var web: NucleoWebView
    private val network = StageNetwork()
    private val backups = linkedMapOf<String, Map<String, *>>()
    private val originalLocale = Locale.getDefault()

    @Before fun setUp() {
        language = InstrumentationRegistry.getArguments().getString("bobbyLocale").orEmpty()
        assumeTrue(language in LOCALES)
        assumeTrue(InstrumentationRegistry.getArguments().getString("bobbyOwnedEmulator") == "ci-throwaway")
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
        V18Shots.shell("cmd connectivity airplane-mode enable")
        V18Shots.shell("cmd locale set-app-locales ${context.packageName} --locales ${LOCALES.getValue(language)}")
        Locale.setDefault(Locale.forLanguageTag(LOCALES.getValue(language)))
        for (name in listOf("bobby.secure.v1", "bobby.nucleo", "bobby.v18", "bobby.v18.notices", "bobby.v18.shown", "bobby.equipment", "bobby.briefingReminders")) {
            val prefs = context.getSharedPreferences(name, 0)
            backups[name] = HashMap(prefs.all)
            assertTrue(prefs.edit().clear().commit())
        }
        NucleoStateStore(context).apply { this.language = language; muted = true }
        fixtures()
        launch()
    }

    @After fun restore() {
        scenario?.close(); scenario = null
        backups.forEach { (name, values) ->
            val editor = context.getSharedPreferences(name, 0).edit().clear()
            values.forEach { (key, value) -> editor.restoreValue(key, value) }
            assertTrue(editor.commit())
        }
        Locale.setDefault(originalLocale)
        if (::language.isInitialized && language in LOCALES) {
            V18Shots.shell("cmd locale set-app-locales ${context.packageName} --locales ''")
            V18Shots.shell("cmd connectivity airplane-mode disable")
        }
    }

    @Test fun releaseJourneyInTheSelectedDeviceLocale() {
        assertEquals(language, session.language)
        assertFalse(session.riskAccepted)
        assertEquals("risk_not_accepted", bridge("ask", JSONObject().put("question", "NVDA?")).getString("code"))
        assertTrue("No read request before consent", network.calls.none { it.path == "/api/desk-debate" })
        open("riskNotice")
        shot("01-risk-notice")
        scrollSheet(); shot("02-risk-notice-end")
        close()
        val notice = bridge("riskNotice")
        assertTrue(bridge("acceptRisk", JSONObject().put("version", notice.getInt("version"))).getBoolean("accepted"))
        val starter = bridge("roster").getJSONArray("companions").getJSONObject(0).getString("id")
        bridge("setCompanion", JSONObject().put("id", starter))
        // Finishing intentionally replaces the document and fences the old bridge reply.
        // Check the new shipping page instead of waiting on the destroyed document's promise.
        js("window.nucleoBridge.call('finishOnboarding',{}).catch(function(){});true")
        waitFor { js("window.nucleo && window.nucleo.state() === 'IDLE'") == true }
        shot("03-home")
        val speech = bridge("speech.permission")
        if (speech.optString("state") == "unavailable") {
            // Hosted images may lack offline recognition: never request the mic or fall back remotely.
            assertFalse(speech.getBoolean("onDevice"))
            assertEquals("unavailable", bridge("speech.requestPermission").getString("state"))
            assertEquals("unavailable", bridge("speech.start").getString("status"))
        }
        // A physical tap opens the real IME on API 35, even on the shipped software fallback.
        tapDom("pill")
        waitFor { js("window.nucleo.state()==='TYPING' && document.activeElement.id==='ta'") == true }
        waitFor { var visible = false; onMain { visible = ViewCompat.getRootWindowInsets(web.view)?.isVisible(WindowInsetsCompat.Type.ime()) == true }; visible }
        // IME visibility precedes Compose's inset layout. Advance the native clock before
        // measuring the shipping DOM, without requiring the continuously animated page to idle.
        compose.mainClock.advanceTimeBy(1000)
        Thread.sleep(1000)
        shot("03b-keyboard")
        val typingBounds = JSONObject(js("JSON.stringify((function(){var r=document.getElementById('typeBox').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewport:window.visualViewport?window.visualViewport.height:innerHeight};})())") as String)
        assertTrue(typingBounds.toString(), typingBounds.getDouble("height") >= 48)
        assertTrue(typingBounds.toString(), typingBounds.getDouble("top") >= 0)
        assertTrue("Composer is above the keyboard: $typingBounds", typingBounds.getDouble("bottom") <= typingBounds.getDouble("viewport") + 2)
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_ESCAPE)
        waitFor { js("window.nucleo.state()==='IDLE'") == true }
        // A real page chip reaches the actual session/asset resolver/desk parser and returns a read.
        waitFor { js("!!document.querySelector('#chipRow [data-hit=chip]')") == true }
        assertEquals(true, js("(function(){var a=Array.from(document.querySelectorAll('#chipRow [data-hit=chip]'));var b=a.find(function(n){return /NVIDIA|NVDA/.test(n.textContent);});if(!b)return false;b.click();return true;})()"))
        waitFor(240_000) { js("window.nucleo && window.nucleo.read() && window.nucleo.read().status === 'ok' && /HANDBACK|FOLLOWUPS|CARDS/.test(window.nucleo.state())") == true }
        assertTrue(network.calls.any { it.path == "/api/desk-debate" })
        assertEquals("ok", JSONObject(js("JSON.stringify(window.nucleo.read())") as String).getString("status"))
        assertEquals(session.text("Report this answer", "Reportar esta respuesta"), js("document.querySelector('.report-answer').textContent"))
        shot("04-read")
        // Pull the real cards, scroll the debate and tap its visible report control.
        if (js("window.nucleo.state()==='CARDS'") != true) {
            device.swipe(device.displayWidth/2, device.displayHeight/2, device.displayWidth/2, device.displayHeight*3/4, 24)
            waitFor { js("window.nucleo.state()==='CARDS'") == true }
        }
        repeat(8) {
            if (!domVisible("reportAnswer")) {
                val bounds = JSONArray(js("JSON.stringify((function(){var r=document.querySelector('#card0 .scr').getBoundingClientRect();return [r.left+r.width/2,r.top,r.bottom,innerWidth];})())") as String)
                val xy = IntArray(2); var width = 0
                onMain { web.view.getLocationOnScreen(xy); width = web.view.width }
                val scale = width / bounds.getDouble(3)
                val x = (xy[0] + bounds.getDouble(0)*scale).toInt()
                val top = (xy[1] + bounds.getDouble(1)*scale).toInt()
                val bottom = (xy[1] + bounds.getDouble(2)*scale).toInt()
                device.swipe(x, bottom-20, x, top+20, 20)
                Thread.sleep(600)
            }
        }
        tapDom("reportAnswer")
        compose.waitUntil(30_000) { runCatching { compose.onNodeWithText(reportContentTitle(language)).assertExists() }.isSuccess }
        compose.onNodeWithText(session.text("Close", "Cerrar")).assertIsDisplayed()
        shot("04b-report-from-read")
        close()
        open("account")
        compose.onNodeWithTag("account-profile").assertExists()
        shot("05-profile-guest")
        close()
        onMain { session.v18.switchSheet(V18Routes.CREDITS) }
        compose.waitUntil(30_000) { runCatching { compose.onNodeWithTag("credits-line-quick", true).assertExists() }.isSuccess }
        shot("06-credits")
        assertTrue("No purchase door without a Google key", runCatching { compose.onNodeWithTag("credits-pro", true).assertDoesNotExist() }.isSuccess)
        close()
        // A page paywall request opens useful Credits instead of a disabled purchase button.
        js("window.nucleoBridge.call('paywall',{});true")
        compose.waitUntil(30_000) { runCatching { compose.onNodeWithTag("credits-line-quick", true).assertExists() }.isSuccess }
        close()

        // Disposable identity, encrypted by the shipping store; its token can reach only fixtures.
        scenario?.close(); scenario = null
        SecureStore(context).write("session", JSONObject().put("userId", OWNER).put("access", "ci-local-only")
            .put("refresh", "ci-local-only").put("displayName", "Alex").put("provider", "google")
            .put("expiresAt", System.currentTimeMillis() + 3_600_000).toString())
        NucleoStateStore(context).apply { bindOwner(OWNER); riskVersion = notice.getInt("version"); companionId = starter; onboarded = true }
        network.answer("GET", "/api/bobby-access", V18Fixtures.freeAccount())
        launch()
        open("account")
        compose.onNodeWithTag("account-delete").performScrollTo().assertIsDisplayed()
        shot("07-profile-account-controls")
        close()
        onMain { session.v18.switchSheet(V18Routes.MEMORY_CONSENT) }
        compose.waitUntil(30_000) { runCatching { compose.onNodeWithTag("memory-consent-privacy", true).assertExists() }.isSuccess }
        shot("08-memory-consent")
        scrollSheet(); shot("09-memory-consent-end")
        close()
        open("memory")
        compose.waitUntil(30_000) { runCatching { compose.onNodeWithTag("memory-local", true).assertExists() }.isSuccess }
        shot("10-memory")
        compose.onNodeWithTag("memory-local", true).performScrollTo().performClick()
        scrollSheet(); shot("11-memory-on-phone")
        close()
        onMain { session.v18.switchSheet(V18Routes.REMINDERS) }
        Thread.sleep(1500)
        shot("12-reminders")
        close()
        open("invite")
        compose.waitUntil(30_000) { runCatching { compose.onNodeWithTag("invite-share-link", true).assertExists() }.isSuccess }
        shot("13-invite")
        close()
        open("reportContent")
        Thread.sleep(1500)
        shot("14-report-content")
        close()
        open("account")
        compose.onNodeWithTag("account-delete").performScrollTo().performClick()
        compose.waitUntil(30_000) { runCatching { compose.onNode(hasText(session.text("Confirm", "Confirmar")) and hasClickAction()).assertExists() }.isSuccess }
        shot("15-delete-confirmation")
        // Confirm through the real UI; only the disposable fixture identity is deleted.
        compose.onNode(hasText(session.text("Confirm", "Confirmar")) and hasClickAction()).performClick()
        waitFor { repository.session.value == null }
        assertTrue(network.calls.any { it.method == "DELETE" && it.path == "/api/account" })
        assertFalse(context.getSharedPreferences("bobby.nucleo", 0).contains("profile.$OWNER.riskVersion"))
        shot("16-account-deleted")
        assertFalse("RevenueCat was never initialized", com.revenuecat.purchases.Purchases.isConfigured)
    }

    private fun launch() {
        scenario = ActivityScenario.launch(MainActivity::class.java).also { it.onActivity { actual ->
            activity = actual
            repository = field(actual, "repository")
            session = field(actual, "session")
            web = field(actual, "web")
            network.attach(repository)
            // Same shipping dispatcher and page, rendered without an emulator GPU crash.
            web.view.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
            WebViewCompat.addDocumentStartJavaScript(web.view, NO_WEBGL, setOf("https://appassets.androidplatform.net"))
            web.reload(session.page)
        } }
        waitFor { js("!!window.nucleoBridge") == true }
        val deviceAppLocale = activity.resources.configuration.locales[0].toLanguageTag()
        assertEquals("Android delivers the selected app locale", LOCALES.getValue(language), deviceAppLocale)
        android.util.Log.i("BobbyLocaleProof", "appLocale=$deviceAppLocale, interface=$language")
        assertEquals(language, bridge("session").getString("language"))
    }

    private fun fixtures() {
        network.answer("GET", "/api/bobby-access", V18Fixtures.guest())
        network.answer("POST", "/api/bobby-asset-search", JSONObject().put("resolved", JSONObject().put("symbol", "NVDA").put("name", "NVIDIA").put("isEquity", true).put("assetClass", "equity")))
        network.answer("GET", "/api/bobby-asset-search", JSONObject().put("movers", JSONArray()))
        network.answer("POST", "/api/voice-tool", JSONObject().put("price", 131.2).put("change_24h_pct", 1.4))
        val candles = JSONArray()
        for (i in 0..99) candles.put(JSONObject().put("ts", System.currentTimeMillis() - (99-i)*3_600_000L).put("open", 128+i*.03).put("high", 130+i*.03).put("low", 127+i*.03).put("close", 128.2+i*.03).put("volume", 100000))
        network.answer("GET", "/api/stock-candles", JSONObject().put("candles", candles))
        val message = when(language) {
            "es" -> "La evidencia de precio es limitada. El contexto puede cambiar."
            "fr" -> "Les données de prix sont limitées. Le contexte peut évoluer."
            "pt" -> "Os dados de preço são limitados. O contexto pode mudar."
            "it" -> "I dati sui prezzi sono limitati. Il contesto può cambiare."
            "de" -> "Die Kursdaten sind begrenzt. Der Kontext kann sich ändern."
            else -> "Price evidence is limited. The context may change."
        }
        val answer = JSONObject().put("symbol", "NVDA").put("level", "rapido")
            .put("technicals", JSONObject().put("price", 131.2).put("rsi14", 55))
            .put("provenance", JSONObject().put("provider", "Yahoo Finance").put("asOf", Instant.now().toString()))
            .put("agents", JSONObject().put("alpha", message).put("red", message).put("cio", message).put("verdict", "wait").put("direction", "none")
                .put("synthesis", JSONObject().put("headline", message).put("why", message).put("risk", message).put("watch", message)))
            .put("access", V18Fixtures.guest().getJSONObject("access"))
        network.answer("POST", "/api/desk-debate") { StageNetwork.Reply(200, JSONObject().put("type", "final").put("data", answer).toString()+"\n", "application/x-ndjson") }
        network.answer("POST", "/api/progress", JSONObject().put("error", "Invalid payload"), 400)
        network.answer("GET", "/api/progress", JSONObject().put("progress", JSONObject()))
        network.answer("GET", "/api/briefing-settings", JSONObject().put("settings", JSONObject()))
        network.answer("GET", "/api/memory", V18Fixtures.memory().json!!)
        network.answer("GET", "/api/account", JSONObject().put("appleAuthorizationRequired", false).put("manualAppleRevocation", false))
        network.answer("DELETE", "/api/account", JSONObject().put("ok", true).put("appleRevocation", "not_applicable"))
    }

    private fun open(route: String) { bridge("openNative", JSONObject().put("route", route)); Thread.sleep(1000) }
    private fun tapDom(id: String) {
        waitFor { domVisible(id) }
        val position = JSONArray(js("JSON.stringify((function(){var r=document.getElementById(${JSONObject.quote(id)}).getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2,innerWidth];})())") as String)
        val xy = IntArray(2); var width = 0
        onMain { web.view.getLocationOnScreen(xy); width = web.view.width }
        val scale = width / position.getDouble(2)
        val x = (xy[0] + position.getDouble(0)*scale).toFloat()
        val y = (xy[1] + position.getDouble(1)*scale).toFloat()
        val down = SystemClock.uptimeMillis()
        MotionEvent.obtain(down,down,MotionEvent.ACTION_DOWN,x,y,0).also { instrumentation.sendPointerSync(it); it.recycle() }
        MotionEvent.obtain(down,down+30,MotionEvent.ACTION_UP,x,y,0).also { instrumentation.sendPointerSync(it); it.recycle() }
    }
    private fun domVisible(id: String): Boolean = js("(function(){var e=document.getElementById(${JSONObject.quote(id)}),r=e.getBoundingClientRect(),s=getComputedStyle(e),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return r.width>0 && r.height>0 && s.visibility==='visible' && s.pointerEvents!=='none' && h && (h===e || e.contains(h));})()") == true
    private fun close() { device.pressBack(); compose.mainClock.advanceTimeBy(1000); Thread.sleep(800); assertFalse("Back must close the sheet, not finish Bobby", activity.isFinishing || activity.isDestroyed) }
    private fun scrollSheet() { repeat(3) { device.swipe(device.displayWidth/2, device.displayHeight*4/5, device.displayWidth/2, device.displayHeight/5, 18); compose.mainClock.advanceTimeBy(500); Thread.sleep(350) } }
    // Native modal animations use the Compose test clock and must reach their displayed state.
    // The live page itself never satisfies Espresso idleness on a software GPU; its DOM/bridge
    // readiness is asserted above. Do not freeze or alter the shipping WebView animation.
    private fun shot(name: String) {
        compose.mainClock.advanceTimeBy(1000)
        if (name !in setOf("03-home", "03b-keyboard", "04-read", "16-account-deleted", "99-failed")) compose.waitForIdle()
        Thread.sleep(700); V18Shots.saveListing("locale-$language-$name")
    }
    private fun bridge(method: String, params: JSONObject = JSONObject()): JSONObject {
        js("window.releaseSmoke=null;window.nucleoBridge.call(${JSONObject.quote(method)},$params).then(function(r){window.releaseSmoke=JSON.stringify(r);},function(e){window.releaseSmoke=JSON.stringify({fault:e.code});});true")
        waitFor { js("typeof window.releaseSmoke === 'string'") == true }
        return JSONObject(js("window.releaseSmoke") as String)
    }
    private fun js(script: String): Any? {
        val latch = CountDownLatch(1); val value = AtomicReference<String>()
        onMain { web.view.evaluateJavascript(script) { value.set(it); latch.countDown() } }
        assertTrue("WebView script did not answer", latch.await(30, TimeUnit.SECONDS))
        return value.get()?.let { JSONArray("[$it]").opt(0).takeUnless { it == JSONObject.NULL } }
    }
    private fun waitFor(timeout: Long = 120_000, check: () -> Boolean) {
        val until = System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(timeout)
        while (System.nanoTime()<until) { if(check()) return; Thread.sleep(250) }
        runCatching { shot("99-failed") }; fail("Release locale $language did not reach the expected state")
    }
    private fun onMain(block: () -> Unit) = instrumentation.runOnMainSync(block)
    private inline fun <reified T> field(value: Any, name: String): T = value.javaClass.getDeclaredField(name).apply { isAccessible=true }.get(value) as T
    private fun SharedPreferences.Editor.restoreValue(key: String, value: Any?) {
        when(value) { is String -> putString(key,value); is Int -> putInt(key,value); is Long -> putLong(key,value); is Float -> putFloat(key,value); is Boolean -> putBoolean(key,value); is Set<*> -> putStringSet(key,value.filterIsInstance<String>().toSet()) }
    }
    companion object {
        private const val OWNER = "11111111-1111-4111-8111-111111111111"
        private val LOCALES = mapOf("en" to "en-US", "es" to "es-MX", "fr" to "fr-FR", "pt" to "pt-BR", "it" to "it-IT", "de" to "de-DE")
        private const val NO_WEBGL = "(function(){var g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t){if(/webgl/i.test(String(t)))return null;return g.apply(this,arguments);};})();"
    }
}
