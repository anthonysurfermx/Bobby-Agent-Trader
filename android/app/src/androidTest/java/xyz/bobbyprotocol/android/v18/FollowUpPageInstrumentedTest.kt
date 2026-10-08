package xyz.bobbyprotocol.android.v18

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import xyz.bobbyprotocol.android.platform.NucleoWebView
import xyz.bobbyprotocol.android.v18.harness.HarnessCopy
import xyz.bobbyprotocol.android.v18.harness.HarnessMove
import xyz.bobbyprotocol.android.v18.harness.HarnessNudges
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * The follow-ups as the page draws them, on an emulator: the app's own bundled page
 * (assets/nucleo/app.html) in the app's own WebView host (NucleoWebView), with a screenshot of
 * each state so a person can look at it.
 *
 * What is real: the page, the bridge between it and native, the WebView, and the words of the line
 * on the glass (HarnessNudges and HarnessCopy over the two catalogs the app ships). What is not:
 * the session. Native's answers are written here (a guest past the risk notice, with a companion,
 * the assets of the home, one read of NVDA from the page's own test fixtures), because a real read
 * needs Bobby's servers. Nothing leaves the emulator: the page cannot reach the network at all
 * (its content policy), and no repository exists in this test.
 *
 * The question Bobby "wrote" after the read is this test's: the real one is whatever the server
 * sends in `synthesis.followUp`, checked by the page before it is shown (android/nucleo/tests).
 *
 * The page is shown on its own fallback for a phone without WebGL (the sphere drawn without it):
 * the test withholds WebGL before the page's first script runs. An emulator with no GPU draws the
 * WebGL scene in software, and with the scene running without a pause this test took CI's emulator
 * offline twice, half-way through (runs 37717370904 and 37719454131). The line, the row, its chips
 * and their words are the same page code either way; what they look like over the WebGL sphere is
 * not seen here.
 */
@RunWith(Parameterized::class)
class FollowUpPageInstrumentedTest(private val language: String) {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context get() = instrumentation.targetContext
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var scenario: ActivityScenario<ComponentActivity>? = null
    private var web: NucleoWebView? = null
    private val unavailable = AtomicReference<String?>()

    /** Every call the page made to native, oldest first: the method and its parameters. */
    private val calls = CopyOnWriteArrayList<Pair<String, String>>()
    /** The line native has for the glass now (`session.nudge`), or none. */
    @Volatile private var nudge: JSONObject? = null
    /** The question the read hands back (`synthesis.followUp`), or none. */
    @Volatile private var nextQuestion: String? = null
    @Volatile private var reads = 0

    private val spanish: Boolean get() = language == "es"
    private val locale: String get() = if (spanish) "es-MX" else "en-US"
    private val words by lazy { CatalogWords(context) }
    private val copy by lazy { HarnessCopy({ locale }) { en, es -> words.text(language, en, es) } }

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") || Build.MODEL.contains("sdk_gphone") ||
                   Build.HARDWARE in setOf("ranchu", "goldfish"))
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
    }

    @After fun leave() {
        val shown = web
        web = null
        if (shown != null) instrumentation.runOnMainSync { shown.close() }
        scope.cancel()
        scenario?.close()
        scenario = null
    }

    @Test fun theLineOnTheGlassAndTheRowAfterARead() {
        open()
        await("the idle home", 300_000) { it.state == "IDLE" && it.chips.size >= 3 && it.settled }
        assertTrue("The page found WebGL although the test withheld it", look().noGl)
        assertEquals("The home offers the reader's assets", listOf("NVIDIA", "BTC", "ETH"), look().words)

        // ---- The line on the glass when they come back: one line, one button ----
        val asked = System.currentTimeMillis() - 26 * 3_600_000L
        // Both prices read, and the move is one this kind of asset makes: the number is said.
        val number = HarnessNudges.nudge(HarnessMove("NVDA", "NVIDIA", true, asked, 128.4, 131.35, 1), copy, asks = true)
        show(number)
        assertTrue(number.text, number.text.contains("NVDA") && number.text.contains("%") && number.text.contains("2"))
        assertEquals(if (spanish) "¿Qué cambió?" else "What changed?", number.cta)
        shot("page-glass-line-number")
        // Half the price two days later: a split, not a move. The line without a number.
        val plain = HarnessNudges.nudge(HarnessMove("NVDA", "NVIDIA", true, asked - 86_400_000L, 128.4, 64.2, 2), copy, asks = true)
        show(plain)
        assertEquals(if (spanish) "NVDA, 2 días después" else "NVDA, 2 days later", plain.text)
        assertFalse(plain.text.contains("%"))
        shot("page-glass-line-no-number")
        // The next read would be refused: the same line, and a button that asks nothing.
        val wall = HarnessNudges.nudge(HarnessMove("NVDA", "NVIDIA", true, asked, 128.4, 131.35, 1), copy, asks = false)
        show(wall)
        assertEquals(number.text, wall.text)
        assertEquals(if (spanish) "Entendido" else "Got it", wall.cta)
        shot("page-glass-line-wall")
        assertTrue("The page reports each drawing of the line", calls.count { it.first == "nudge.seen" } >= 3)
        assertTrue("Drawing a line asks Bobby nothing", calls.none { it.first == "ask" })

        // ---- After a read: the question Bobby wrote is the first chip ----
        nudge = null
        emitSession()
        await("the home without a line", 60_000) { it.state == "IDLE" && it.words.firstOrNull() == "NVIDIA" && it.settled }
        val question = if (spanish) "¿Qué tendría que cambiar en NVDA para que cambie esta lectura?" else "What would have to change in NVDA for this read to change?"
        nextQuestion = question
        readNvda()
        await("Bobby's question as the first chip", 120_000) { it.words.firstOrNull() == question && it.settled }
        val another = if (spanish) "Otra pregunta sobre NVDA" else "Another question about NVDA"
        assertEquals(listOf(question, another, if (spanish) "¿Cómo se ve BTC?" else "How is BTC looking?"), look().words)
        shot("page-after-read-question")

        // ---- The same read without a question: the fixed row, as before ----
        nextQuestion = null
        reload()
        readNvda()
        await("the fixed row", 120_000) { it.words.firstOrNull() == another && it.chips.size >= 3 && it.settled }
        assertEquals(listOf(another, if (spanish) "¿Cómo se ve BTC?" else "How is BTC looking?", if (spanish) "¿Cómo se ve ETH?" else "How is ETH looking?"),
                     look().words)
        shot("page-after-read-no-question")
        assertEquals("The page could not reach native", null, unavailable.get())
    }

    // ---- The page ----

    /** An activity of this app with nothing in it but the page, as MainActivity hosts it, on a WebView that has no WebGL to give. */
    private fun open() {
        assumeTrue("This WebView cannot run a script before the page's own", WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT))
        scenario = ActivityScenario.launch(ComponentActivity::class.java).also { launched ->
            launched.onActivity { activity ->
                val view = WebView(activity)
                WebViewCompat.addDocumentStartJavaScript(view, NO_WEBGL, setOf("https://appassets.androidplatform.net"))
                val host = NucleoWebView(view, scope, { method, params -> answer(method, params) }, unavailable::set)
                activity.setContentView(host.view)
                host.resume()
                host.load("app")
                web = host
            }
        }
    }

    /** The page is loaded again, as after the app was closed and opened. */
    private fun reload() {
        calls.clear()
        instrumentation.runOnMainSync { checkNotNull(web).reload("app") }
        await("the idle home again", 300_000) { seen -> calls.any { it.first == "session" } && seen.state == "IDLE" && seen.chips.size >= 3 && seen.settled && seen.noGl }
    }

    /** A chip of the home asks about NVDA, the way a person's tap does, and the read is handed back. */
    private fun readNvda() {
        val before = calls.count { it.first == "ask" }
        assertEquals(true, js("(function(){var c=document.querySelector('#chipRow [data-hit=chip]');if(!c)return false;c.click();return true;})()"))
        await("the question to reach native", 60_000) { calls.count { it.first == "ask" } > before }
        // One tap on a chip whose words Bobby wrote: the page says so, and native starts no chain from it.
        val asked = JSONObject(calls.last { it.first == "ask" }.second)
        assertEquals(if (spanish) "¿Cómo se ve NVDA?" else "How is NVDA looking?", asked.optString("question"))
        assertEquals(true, asked.opt("chip"))
        await("the read to be handed back", 420_000) { it.state == "HANDBACK" || it.state == "FOLLOWUPS" }
    }

    /** Native has a line for the glass: the session says so, and the page draws it in the row. */
    private fun show(line: NucleoNudge) {
        nudge = line.toJson()
        emitSession()
        await("the line “${line.text}” with “${line.cta}”", 60_000) { it.eyebrow == line.text && it.words.firstOrNull() == line.cta && it.settled }
    }

    private fun emitSession() {
        instrumentation.runOnMainSync { checkNotNull(web).emit("session.changed", session()) }
    }

    // ---- What native answers ----

    private suspend fun answer(method: String, params: JSONObject): Any {
        calls.add(Pair(method, params.toString()))
        return when (method) {
            "session" -> session()
            "roster" -> roster()
            "suggestions" -> JSONObject().put("v", 1)
                .put("quickAccess", JSONArray().put(asset("NVDA")).put(asset("BTC")).put(asset("ETH")))
                .put("movers", JSONArray().put(JSONObject().put("symbol", "TSLA").put("name", "Tesla").put("changePct", 4.1)))
            "theses" -> JSONObject().put("v", 1).put("items", JSONArray())
            "island" -> JSONObject().put("v", 1).put("available", false).put("reason", "signed_out").put("pendingSeeds", 0)
            "speak", "previewVoice" -> JSONObject().put("status", "muted")
            "speech.permission" -> JSONObject().put("state", "undetermined").put("onDevice", true)
            "read.rendered" -> JSONObject().put("accepted", false)
            "markHint" -> JSONObject().put("count", 3)
            "cancel" -> JSONObject().put("cancelled", false)
            "nudge.seen" -> JSONObject().put("count", 1).put("active", true)
            "nudge.act" -> JSONObject().put("status", "gone")
            "ask" -> {
                delay(600)
                read()
            }
            else -> JSONObject()
        }
    }

    /** An asset of the home the reader asked about before. */
    private fun asset(symbol: String): JSONObject = JSONObject().put("symbol", symbol).put("own", true)

    private fun companions(): List<JSONObject> {
        val all = context.assets.open("nucleo/roster.json").bufferedReader().use { JSONObject(it.readText()) }.getJSONArray("companions")
        return (0 until all.length()).map { all.getJSONObject(it) }
    }

    /** A guest who finished onboarding and accepted the risk notice, as `NucleoSession.snapshot` describes one. */
    private fun session(): JSONObject {
        val notice = context.assets.open("nucleo/risk-notice.json").bufferedReader().use { JSONObject(it.readText()) }.getInt("version")
        val starter = companions().first { it.optInt("requiredLevel", 1) <= 1 }
        // MainActivity tells the page to move less when the system's animations are off, as they are on CI.
        val reduced = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        return JSONObject()
            .put("v", 1).put("page", "app").put("onboarded", true).put("firstRun", false).put("language", language).put("locale", locale)
            .put("country", JSONObject.NULL).put("localHour", 9)
            .put("companion", JSONObject().put("id", starter.getString("id")).put("webId", starter.getString("webId")).put("label", starter.getString("label"))
                .put("palette", starter.getString("palette")).put("voicePersona", starter.getString("voicePersona")))
            .put("xp", 0).put("level", JSONObject().put("number", 1).put("name", "ROOKIE").put("progress", 0.2).put("nextMinXP", 50))
            .put("streak", 0).put("aura", JSONObject.NULL).put("pendingAwards", 0).put("syncedAt", JSONObject.NULL)
            .put("voicePreference", "companion").put("signedIn", false).put("riskAccepted", true).put("riskVersion", notice)
            .put("muted", true).put("reducedMotion", reduced)
            .put("mic", JSONObject().put("state", "undetermined").put("onDevice", true))
            .put("hints", JSONObject().put("verdictPull", 3)).put("pendingRead", JSONObject.NULL).put("fixtures", false)
            .put("platform", "android").put("appVersion", "1.2.0").put("nudge", nudge ?: JSONObject.NULL)
            .put("analysisLevel", JSONObject().put("id", "rapido").put("label", if (spanish) "Rápido" else "Quick").put("color", "#F2EDE4"))
    }

    /** The roster as native hands it over: each companion with the words of the app's language. */
    private fun roster(): JSONObject {
        val list = JSONArray()
        for (each in companions()) {
            val entry = JSONObject()
            for (key in each.keys()) if (key != "localized") entry.put(key, each.get(key))
            val localized = each.getJSONObject("localized")
            val spoken = localized.optJSONObject(language) ?: localized.getJSONObject("en")
            for (key in spoken.keys()) entry.put(key, spoken.get(key))
            list.put(entry.put("unlocked", true))
        }
        return JSONObject().put("companions", list)
    }

    /** One delivered read of NVDA (the page's own test fixture), with the synthesis a current server writes. */
    private fun read(): JSONObject {
        val fixture = instrumentation.context.assets.open("ask/nvda.json").bufferedReader().use { JSONObject(it.readText()) }
        reads += 1
        val synthesis = JSONObject()
            .put("headline", if (spanish) "La tendencia es firme, pero el precio ya está contra la resistencia." else "The trend is firm, but price is already pressed against resistance.")
            .put("why", if (spanish) "El precio se sostiene sobre su media de 50 días." else "Price is holding above its 50-day average.")
            .put("risk", if (spanish) "El impulso se enfría cerca de la resistencia." else "Momentum is cooling near resistance.")
            .put("watch", if (spanish) "Un cierre bajo el soporte." else "A close below support.")
        val next = nextQuestion
        if (next != null) synthesis.put("followUp", next)
        return fixture.put("requestId", "11111111-1111-4111-8111-11111111111$reads").put("language", language).put("fixture", false)
            .put("receivedAt", System.currentTimeMillis()).put("synthesis", synthesis)
    }

    // ---- What the page shows ----

    /** One look at the page: its state, the line above the row, and the chips of the row with how opaque each is drawn. */
    private class Seen(val state: String?, val eyebrow: String?, val chips: List<Pair<String, Double>>, val noGl: Boolean) {
        val words: List<String> get() = chips.map { it.first }
        /** Every chip has finished arriving. */
        val settled: Boolean get() = chips.all { it.second > 0.9 }
        override fun toString(): String = "state=$state, eyebrow=$eyebrow, chips=$chips, noGl=$noGl"
    }

    /** Asked in one script, so that watching the page costs it as little as possible. */
    private fun look(): Seen {
        val raw = js("JSON.stringify({s:window.nucleo?window.nucleo.state():null,e:(document.getElementById('eyebrow')||{}).textContent||null," +
                     "g:!!document.querySelector('.nogl'),c:Array.prototype.map.call(document.querySelectorAll('#chipRow [data-hit=chip]')," +
                     "function(n){return [n.textContent,Number(getComputedStyle(n).opacity)];})})") as? String ?: return Seen(null, null, emptyList(), false)
        val json = JSONObject(raw)
        val list = json.optJSONArray("c") ?: JSONArray()
        val chips = (0 until list.length()).map { index -> Pair(list.getJSONArray(index).getString(0), list.getJSONArray(index).optDouble(1, 0.0)) }
        return Seen(if (json.isNull("s")) null else json.optString("s"), if (json.isNull("e")) null else json.optString("e"), chips, json.optBoolean("g"))
    }

    /** Evaluates a script in the page. Null when the page did not answer in time (it draws its scene in software here). */
    private fun js(script: String): Any? {
        val shown = web ?: return null
        val done = CountDownLatch(1)
        val result = AtomicReference<Any?>()
        instrumentation.runOnMainSync {
            shown.view.evaluateJavascript(script) { value ->
                result.set(runCatching { JSONArray("[$value]").get(0).takeUnless { it == JSONObject.NULL } }.getOrNull())
                done.countDown()
            }
        }
        return if (done.await(20, TimeUnit.SECONDS)) result.get() else null
    }

    private fun await(what: String, timeoutMillis: Long, condition: (Seen) -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis)
        while (System.nanoTime() < deadline) {
            if (runCatching { condition(look()) }.getOrDefault(false)) return
            Thread.sleep(800)
        }
        runCatching { V18Shots.save("failed-page-$language") }
        fail("The page never showed $what; ${look()}, unavailable=${unavailable.get()}, calls=" + calls.map { it.first }.takeLast(30))
    }

    private fun shot(name: String) {
        // What was just drawn has to settle and reach the display before it is captured.
        Thread.sleep(2_500)
        V18Shots.save("$name-$language")
    }

    companion object {
        /** Before the page's own scripts: a canvas that is asked for WebGL has none to give. */
        private const val NO_WEBGL = "(function(){var g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=" +
            "function(t){if(/webgl/i.test(String(t)))return null;return g.apply(this,arguments);};})();"

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages(): Collection<Array<Any>> = listOf(arrayOf<Any>("en"), arrayOf<Any>("es"))
    }
}
