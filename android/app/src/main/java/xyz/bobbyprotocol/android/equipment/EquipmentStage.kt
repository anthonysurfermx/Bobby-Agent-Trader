package xyz.bobbyprotocol.android.equipment

import android.annotation.SuppressLint
import android.graphics.Color
import android.os.SystemClock
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.delay
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import kotlin.coroutines.resume

/** Approved GLBs and earned attachments in an isolated renderer with no native bridge or remote requests. */
@Composable
fun EquipmentStage(
    companionId: String,
    label: String,
    attachments: List<EquipmentItem> = emptyList(),
    locked: Boolean = false,
    reducedMotion: Boolean = false,
    active: Boolean = true,
    modifier: Modifier = Modifier,
    onReady: (Boolean) -> Unit = {},
) {
    var controller by remember { mutableStateOf<StageController?>(null) }
    val readyCallback by rememberUpdatedState(onReady)
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var foreground by remember(lifecycle) { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) }
    val config = JSONObject().put("companionId", companionId).put("locked", locked)
        .put("reducedMotion", reducedMotion).put("active", active && foreground)
        .put("attachments", JSONArray().also { array ->
            attachments.filter { it.companionId == companionId && it.art.matches(Regex("(?:tool_[a-z]+_[123]|pet_[a-z]+)\\.png")) }.forEach { item ->
                array.put(JSONObject().put("url", "/assets/equipment/${item.art}").put("slot", item.slot)
                    .put("spin", item.spins).put("glow", if (item.isGolden) "#f5c443" else JSONObject.NULL))
            }
        })
    val latestConfig by rememberUpdatedState(config)

    DisposableEffect(lifecycle) {
        val observer = LifecycleEventObserver { _, _ -> foreground = lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED) }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }
    AndroidView(factory = { context ->
        StageController(WebView(context).apply {
            // WRAP_CONTENT forces a zero-height web layout even when Compose measures this view exactly.
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            contentDescription = label
        }).also { controller = it; it.configure(latestConfig); it.load() }.view
    }, modifier = modifier, onRelease = {
        controller?.close(); controller = null
    }, update = { view -> view.contentDescription = label; controller?.configure(latestConfig) })

    LaunchedEffect(controller, companionId) {
        readyCallback(false)
        val stage = controller ?: return@LaunchedEffect
        val loadingDeadline = SystemClock.elapsedRealtime() + 30_000
        var ready = false
        while (currentCoroutineContext().isActive) {
            when (withTimeoutOrNull(3_000) { stage.status() } ?: "failed") {
                "ready" -> if (!ready) { ready = true; readyCallback(true) }
                "failed" -> { readyCallback(false); return@LaunchedEffect }
                else -> if (SystemClock.elapsedRealtime() >= loadingDeadline) {
                    readyCallback(false); return@LaunchedEffect
                }
            }
            // Keep observing an already loaded renderer so context loss restores the portrait.
            delay(if (ready) 1_000 else 150)
        }
    }
}

@SuppressLint("SetJavaScriptEnabled")
private class StageController(val view: WebView) {
    private val origin = "https://appassets.androidplatform.net"
    private val page = "$origin/assets/equipment-stage/index.html"
    private val loader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(view.context)).build()
    private var loaded = false
    private var closed = false
    private var config = JSONObject()

    init {
        view.setBackgroundColor(Color.TRANSPARENT)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
        }
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = request.url.toString() != page
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse {
                val url = request.url
                val permitted = url.scheme == "https" && url.host == "appassets.androidplatform.net" && url.port == -1 &&
                    url.query == null && url.fragment == null &&
                    (url.encodedPath?.matches(Regex("/assets/equipment-stage/(?:index\\.html|viewer\\.js|models/[a-z]+\\.glb|draco/draco_(?:wasm_wrapper\\.js|decoder\\.wasm))")) == true ||
                        url.encodedPath?.matches(Regex("/assets/equipment/(?:tool_[a-z]+_[123]|pet_[a-z]+)\\.png")) == true)
                if (permitted) loader.shouldInterceptRequest(url)?.let { return it }
                return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(byteArrayOf()))
            }
            override fun onPageFinished(view: WebView, url: String) {
                if (!closed && url == page) { loaded = true; configure(config) }
            }
            override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                closed = true; loaded = false; view.destroy(); return true
            }
        }
        // There is intentionally no JavascriptInterface or WebMessageListener on this WebView.
    }

    fun load() { view.loadUrl(page) }
    fun configure(value: JSONObject) {
        config = JSONObject(value.toString())
        if (!loaded || closed) return
        view.evaluateJavascript("window.equipmentStage&&window.equipmentStage.configure($config)", null)
        if (config.optBoolean("active")) view.onResume() else view.onPause()
    }
    suspend fun status(): String = suspendCancellableCoroutine { continuation ->
        if (closed) { continuation.resume("failed"); return@suspendCancellableCoroutine }
        if (!loaded) { continuation.resume("loading"); return@suspendCancellableCoroutine }
        view.evaluateJavascript("window.equipmentStage?window.equipmentStage.status():'failed'") { result ->
            if (continuation.isActive) continuation.resume(runCatching { JSONArray("[$result]").getString(0) }.getOrDefault("failed"))
        }
    }
    fun close() {
        if (closed) return
        closed = true; loaded = false
        view.evaluateJavascript("window.equipmentStage&&window.equipmentStage.dispose()", null)
        view.stopLoading(); view.destroy()
    }
}
