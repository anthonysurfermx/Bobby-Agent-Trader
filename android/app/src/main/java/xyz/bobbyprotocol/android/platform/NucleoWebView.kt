package xyz.bobbyprotocol.android.platform

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.ByteArrayInputStream
import xyz.bobbyprotocol.android.nucleo.NucleoFault

/** Only bundled pages in the main frame can call native services. */
@SuppressLint("SetJavaScriptEnabled")
class NucleoWebView(
    val view: WebView,
    private val scope: CoroutineScope,
    private val dispatch: suspend (String, JSONObject) -> Any,
    private val onUnavailable: (String) -> Unit,
) {
    private val origin = "https://appassets.androidplatform.net"
    private val loader = WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(view.context))
        .build()
    private var generation = 0L
    private var loadedPage = ""
    private var ready = false
    private var closed = false

    init {
        view.setBackgroundColor(Color.rgb(5, 5, 5))
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
        }
        WebView.setWebContentsDebuggingEnabled(xyz.bobbyprotocol.android.BuildConfig.DEBUG)
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean =
                !trustedPage(r.url)

            override fun shouldInterceptRequest(v: WebView, r: WebResourceRequest): WebResourceResponse? {
                loader.shouldInterceptRequest(r.url)?.let { return it }
                return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(byteArrayOf()))
            }
            override fun onRenderProcessGone(v: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                generation++; ready = false; closed = true
                (v.parent as? android.view.ViewGroup)?.removeView(v)
                v.destroy()
                onUnavailable("Android WebView stopped. Reopen Bobby to restore your session.")
                return true
            }
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            onUnavailable("Update Android System WebView to use Bobby.")
        } else {
            WebViewCompat.addWebMessageListener(view, "BobbyNucleo", setOf(origin)) { _, message, sourceOrigin, isMainFrame, _ ->
                if (closed || message.type != WebMessageCompat.TYPE_STRING) return@addWebMessageListener
                val raw = message.data.orEmpty()
                if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != origin || !trustedPage(Uri.parse(view.url.orEmpty())) || raw.toByteArray().size > 65536) return@addWebMessageListener
                val envelope = runCatching { JSONObject(raw) }.getOrNull() ?: return@addWebMessageListener
                val id = envelope.optString("id")
                if (!id.matches(Regex("[A-Za-z0-9_.:-]{1,80}"))) return@addWebMessageListener
                val started = generation
                scope.launch {
                    val reply = try {
                        require(envelope.opt("v") is Number && envelope.getDouble("v") == 1.0 && envelope.opt("params") is JSONObject)
                        val method = envelope.getString("method")
                        val result = dispatch(method, envelope.getJSONObject("params"))
                        if (!closed && method == "session" && started == generation) ready = true
                        JSONObject().put("v", 1).put("ok", true).put("result", result)
                    } catch (failure: Exception) {
                        JSONObject().put("v", 1).put("ok", false).put("error", JSONObject()
                            .put("code", if (failure is NucleoFault) failure.code else if (failure is IllegalArgumentException) "invalid_params" else "internal")
                            .put("message", "Native request could not complete"))
                    }
                    if (!closed && started == generation && trustedPage(Uri.parse(view.url.orEmpty()))) {
                        view.evaluateJavascript("window.nucleoBridge&&window.nucleoBridge.receive(${JSONObject.quote(id)},$reply)", null)
                    }
                }
            }
        }
    }

    private fun trustedPage(uri: Uri): Boolean = uri.scheme == "https" && uri.host == "appassets.androidplatform.net" &&
        uri.port == -1 && uri.path in setOf("/assets/nucleo/app.html", "/assets/nucleo/onboarding.html")

    fun load(page: String) {
        require(page in setOf("app", "onboarding"))
        if (closed) return
        if (loadedPage == page) return
        generation++
        ready = false
        loadedPage = page
        view.loadUrl("$origin/assets/nucleo/$page.html")
    }

    fun reload(page: String) { loadedPage = ""; load(page) }

    fun emit(name: String, payload: JSONObject) {
        if (closed || !ready) return
        val started = generation
        view.post { if (!closed && ready && started == generation) view.evaluateJavascript("window.nucleoBridge&&window.nucleoBridge.emit(${JSONObject.quote(name)},$payload)", null) }
    }

    fun resume() { if (!closed) view.onResume() }
    fun pause() { if (!closed) view.onPause() }

    fun close() {
        if (closed) return
        closed = true
        generation++
        ready = false
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) WebViewCompat.removeWebMessageListener(view, "BobbyNucleo")
        view.stopLoading()
        view.destroy()
    }
}
