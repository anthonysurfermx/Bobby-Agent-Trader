package xyz.bobbyprotocol.android

import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.equipment.EquipmentCompanion
import xyz.bobbyprotocol.android.equipment.EquipmentItem
import xyz.bobbyprotocol.android.equipment.EquipmentLedger
import xyz.bobbyprotocol.android.equipment.EquipmentStage
import xyz.bobbyprotocol.android.equipment.EquipmentStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/** Empty AndroidX activity: no MainActivity, repository, account, fixtures or remote market calls. */
@RunWith(AndroidJUnit4::class)
class EquipmentStageInstrumentedTest {
    @get:Rule val compose = createComposeRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()

    @Test
    fun approvedModelLoadsOrExplicitPortraitFallbackRemainsAvailable() {
        var ready by mutableStateOf(false)
        compose.setContent {
            MaterialTheme {
                Box(Modifier.size(240.dp)) {
                    if (!ready) Text("Approved portrait fallback", Modifier.testTag("stage-fallback"))
                    EquipmentStage("orb", "Bobby", modifier = Modifier.size(240.dp), onReady = { ready = it })
                }
            }
        }
        val view = awaitViewer()
        val status = awaitSettled(view)
        val snapshot = JSONObject(evaluate(view, "JSON.stringify(window.equipmentStage.snapshot())") as String)
        assertEquals("orb", snapshot.getString("companionId"))
        assertEquals("undefined", evaluate(view, "typeof window.BobbyNucleo"))
        compose.waitForIdle()
        if (status == "ready") {
            compose.waitUntil(5_000) { ready }
            assertTrue("Ready requires the real bundled GLB loader to complete", ready)
            val layout = JSONObject(evaluate(view, "(function(){var canvas=document.querySelector('canvas');var host=document.getElementById('stage');var c=canvas&&canvas.getBoundingClientRect();var h=host&&host.getBoundingClientRect();return JSON.stringify({canvasWidth:c?c.width:0,canvasHeight:c?c.height:0,hostHeight:h?h.height:0,viewportHeight:window.innerHeight});})()") as String)
            assertTrue("Ready canvas and host must have visible layout bounds: $layout",
                layout.optDouble("canvasWidth", 0.0) > 0.0 &&
                    layout.optDouble("canvasHeight", 0.0) > 0.0 &&
                    layout.optDouble("hostHeight", 0.0) > 0.0)
            val lossRequested = evaluate(view, "(function(){var c=document.querySelector('canvas');var gl=c&&(c.getContext('webgl2')||c.getContext('webgl'));var ext=gl&&gl.getExtension('WEBGL_lose_context');if(!ext)return false;ext.loseContext();return true;})()")
            if (lossRequested == true) {
                waitUntil { evaluate(view, "window.equipmentStage.status()") == "failed" }
                compose.waitUntil(5_000) { !ready }
                compose.onNodeWithTag("stage-fallback").assertExists()
            }
        }
        else {
            assertEquals("failed", status)
            assertFalse(ready)
            compose.onNodeWithTag("stage-fallback").assertExists()
        }
    }

    @Test
    fun realEarnedAttachmentsUpdateAndRapidCompanionChangesKeepLatestModel() {
        val catalog = EquipmentStore.catalog(instrumentation.targetContext)
        val companions = listOf(EquipmentCompanion("orb", "Bobby", 1), EquipmentCompanion("byte", "Byte", 1), EquipmentCompanion("kora", "Kora", 1))
        val xp = 1
        val owned = EquipmentLedger.ownedIds(catalog, companions, "orb", xp)
        val orbItems = catalog.filter { it.companionId == "orb" && it.id in owned }
        assertEquals("The first tool threshold unlocks exactly one item for this companion", 1, orbItems.size)
        var id by mutableStateOf("orb")
        var attachments by mutableStateOf<List<EquipmentItem>>(orbItems)
        var reduced by mutableStateOf(true)
        var active by mutableStateOf(true)
        compose.setContent { MaterialTheme { EquipmentStage(id, id, attachments, reducedMotion = reduced, active = active, modifier = Modifier.size(240.dp)) } }
        val view = awaitViewer()
        assumeTrue("WebGL unavailable: portrait fallback is covered separately", awaitSettled(view) == "ready")
        var observed = snapshot(view)
        assertTrue(observed.getBoolean("reducedMotion"))
        assertEquals(1, observed.getJSONArray("attachmentURLs").length())
        assertTrue(observed.getJSONArray("attachmentURLs").getString(0).endsWith(orbItems.single().art))
        compose.runOnIdle { attachments = emptyList() }
        waitUntil { snapshot(view).getJSONArray("attachmentURLs").length() == 0 }
        compose.runOnIdle { id = "byte" }
        compose.waitForIdle()
        compose.runOnIdle { id = "kora"; reduced = false; active = false }
        waitUntil { snapshot(view).optString("companionId") == "kora" }
        observed = snapshot(view)
        assertFalse(observed.getBoolean("reducedMotion"))
        assertFalse(observed.getBoolean("active"))
        compose.runOnIdle { active = true }
        assertEquals("ready", awaitSettled(view))
        assertEquals("kora", snapshot(view).getString("companionId"))
    }

    @Test
    fun viewerCannotFetchRemoteOrUnrelatedNativeAssets() {
        compose.setContent { MaterialTheme { EquipmentStage("orb", "Bobby", modifier = Modifier.size(240.dp)) } }
        val view = awaitViewer()
        evaluate(view, "window.remoteProbe=null;fetch('https://bobbyprotocol.xyz/api/bobby-health').then(function(){window.remoteProbe='unexpected';},function(){window.remoteProbe='blocked';});true")
        waitUntil { evaluate(view, "window.remoteProbe") != null }
        assertEquals("blocked", evaluate(view, "window.remoteProbe"))
        evaluate(view, "window.localProbe=null;fetch('/assets/nucleo/app.html').then(function(reply){window.localProbe=reply.status;},function(){window.localProbe=403;});true")
        waitUntil { evaluate(view, "window.localProbe") != null }
        assertEquals(403, (evaluate(view, "window.localProbe") as Number).toInt())
        evaluate(view, "window.traversalProbe=null;fetch('/assets/equipment-stage/models/%2e%2e/%2e%2e/nucleo/app.html').then(function(reply){window.traversalProbe=reply.status;},function(){window.traversalProbe=403;});true")
        waitUntil { evaluate(view, "window.traversalProbe") != null }
        assertEquals(403, (evaluate(view, "window.traversalProbe") as Number).toInt())
        assertEquals("undefined", evaluate(view, "typeof window.BobbyNucleo"))
    }

    private fun snapshot(view: WebView) = JSONObject(evaluate(view, "JSON.stringify(window.equipmentStage.snapshot())") as String)
    private fun awaitSettled(view: WebView): String {
        waitUntil { evaluate(view, "window.equipmentStage.status()") in setOf("ready", "failed") }
        return evaluate(view, "window.equipmentStage.status()") as String
    }
    private fun awaitViewer(): WebView {
        val result = AtomicReference<WebView?>()
        waitUntil {
            compose.waitForIdle()
            instrumentation.runOnMainSync {
                val resumed = androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry.getInstance()
                    .getActivitiesInStage(androidx.test.runner.lifecycle.Stage.RESUMED).firstOrNull()
                result.set(resumed?.window?.decorView?.let(::findWebView))
            }
            result.get() != null
        }
        val view = requireNotNull(result.get())
        waitUntil { evaluate(view, "!!window.equipmentStage") == true }
        return view
    }
    private fun findWebView(view: View): WebView? {
        if (view is WebView) return view
        if (view is ViewGroup) for (i in 0 until view.childCount) findWebView(view.getChildAt(i))?.let { return it }
        return null
    }
    private fun evaluate(view: WebView, script: String): Any? {
        val done = CountDownLatch(1)
        val result = AtomicReference<Any?>()
        instrumentation.runOnMainSync { view.evaluateJavascript(script) { value ->
            result.set(runCatching { JSONArray("[$value]").get(0).takeUnless { it == JSONObject.NULL } }.getOrNull())
            done.countDown()
        } }
        assertTrue("Viewer JavaScript timed out", done.await(5, TimeUnit.SECONDS))
        return result.get()
    }
    private fun waitUntil(predicate: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(35)
        while (System.nanoTime() < deadline) {
            compose.waitForIdle()
            if (predicate()) return
            Thread.sleep(50)
        }
        fail("Equipment viewer did not settle")
    }
}
