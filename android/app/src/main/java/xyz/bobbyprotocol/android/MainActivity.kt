package xyz.bobbyprotocol.android

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import xyz.bobbyprotocol.android.platform.AvatarShareCard
import xyz.bobbyprotocol.android.platform.AvatarShareSpec
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.provider.Settings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.key
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.lifecycleScope
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.billing.BillingStore
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.nucleo.NucleoFault
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import xyz.bobbyprotocol.android.platform.AndroidVoice
import xyz.bobbyprotocol.android.platform.NucleoWebView
import xyz.bobbyprotocol.android.platform.BriefingNarrator
import xyz.bobbyprotocol.android.platform.BriefingReminders
import xyz.bobbyprotocol.android.platform.LocalNotices
import xyz.bobbyprotocol.android.push.PushConfiguration
import xyz.bobbyprotocol.android.push.PushDependencies
import xyz.bobbyprotocol.android.push.PushRuntime
import xyz.bobbyprotocol.android.push.PushRuntimeFactory
import xyz.bobbyprotocol.android.ui.BobbySheet
import xyz.bobbyprotocol.android.ui.ReportContentSheet
import xyz.bobbyprotocol.android.ui.v18.V18Sheets
import xyz.bobbyprotocol.android.v18.V18
import xyz.bobbyprotocol.android.v18.V18Process
import xyz.bobbyprotocol.android.v18.V18Shell

class MainActivity : ComponentActivity() {
    private lateinit var repository: BobbyRepository
    private lateinit var session: NucleoSession
    private lateinit var voice: AndroidVoice
    private lateinit var billing: BillingStore
    private lateinit var narrator: BriefingNarrator
    private lateinit var push: PushRuntime
    private var narrationStatus by mutableStateOf<String?>(null)
    private var notificationOwner: String? = null
    private var notificationEpoch: Long? = null
    private var web: NucleoWebView? = null
    private var webRevision by mutableIntStateOf(0)
    private var needsRendererRestart = false
    private var route by mutableStateOf<String?>(null)
    private var platformError by mutableStateOf<String?>(null)
    private var microphoneReply: CompletableDeferred<JSONObject>? = null
    private var signInReply: CompletableDeferred<JSONObject>? = null
    private var paywallReply: CompletableDeferred<JSONObject>? = null
    private var lastHaptic = 0L
    private var active = false
    private var notificationReply: CompletableDeferred<Boolean>? = null

    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        val state = voice.permission()
        session.setSpeechState(state.getString("state"), state.optBoolean("onDevice"))
        microphoneReply?.complete(state)
        microphoneReply = null
    }
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val owner = notificationOwner
        if (owner != null && owner == repository.session.value?.userId && notificationEpoch == repository.epoch.value) BriefingReminders.setEnabled(this, owner, granted)
        notificationOwner = null; notificationEpoch = null
        if (::push.isInitialized) push.refresh()
    }

    /** 1.8: the system's notification question, asked only from a person's own tap (a reminder, "Yes, tell me"). */
    private val noticePermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        notificationReply?.complete(granted)
        notificationReply = null
        if (::push.isInitialized) push.refresh()
    }

    /** 1.8: what only this activity can do for the features (v18/V18Runtime.kt). */
    private val shell: V18Shell = object : V18Shell {
        override val sheetRoute: String? get() = route
        override val covered: Boolean get() = platformError != null || microphoneReply != null || notificationReply != null
        override val active: Boolean get() = this@MainActivity.active
        override val voiceBusy: Boolean get() = (this@MainActivity::voice.isInitialized && voice.isBusy) || narrationStatus in setOf("preparing", "playing")
        override fun openSheet(route: String) = this@MainActivity.openSheet(route)
        override fun dismissSheet() { if (route != null) closeSheet() }
        override fun quietVoice() { if (this@MainActivity::voice.isInitialized) voice.background() }
        override fun haptic(kind: String) { runCatching { this@MainActivity.haptic(kind) } }
        override fun signIn(provider: String) = startSignIn(provider)
        override fun share(text: String) { runCatching { this@MainActivity.share(text) } }
        override fun copy(text: String) {
            runCatching { (getSystemService(CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Bobby", text)) }
        }
        override fun openExternal(url: String): Boolean = runCatching { this@MainActivity.openExternal(url) }.isSuccess
        override fun openNotificationSettings() {
            runCatching { startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName)) }
                .onFailure { runCatching { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))) } }
        }
        override suspend fun requestNotificationPermission(): Boolean {
            if (Build.VERSION.SDK_INT < 33) return BriefingReminders.permissionGranted(this@MainActivity)
            // One question at a time, and only while this activity is in front to ask it.
            if (notificationReply != null || !this@MainActivity.active) return false
            val reply = CompletableDeferred<Boolean>()
            notificationReply = reply
            noticePermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            return reply.await()
        }
        override val billing: StateFlow<BillingState> get() = this@MainActivity.billing.state
        override suspend fun restorePurchases(): BillingOutcome {
            val owner = repository.session.value?.userId
            val epoch = repository.epoch.value
            val outcome = this@MainActivity.billing.restore(this@MainActivity)
            // The sheet that asked stays open to show its result; the page learns about a confirmed plan.
            if (outcome == BillingOutcome.SUBSCRIBED && owner != null && owner == repository.session.value?.userId && epoch == repository.epoch.value) {
                runCatching { repository.access() }
                if (owner == repository.session.value?.userId && epoch == repository.epoch.value) web?.emit("session.changed", session.snapshot())
            }
            return outcome
        }
        override fun manageSubscriptionUrl(): String? = this@MainActivity.billing.managementUri()?.toString()
        override val briefingNotifications: Boolean get() = BriefingReminders.enabled(this@MainActivity, repository.session.value?.userId)
        override fun switchBriefingNotifications(enabled: Boolean) = setReminders(enabled)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.rgb(5, 5, 5)),
        )
        repository = BobbyRepository(applicationContext)
        billing = BillingStore(applicationContext, repository)
        narrator = BriefingNarrator(applicationContext, repository, lifecycleScope, muted = { !::session.isInitialized || session.muted })
        session = NucleoSession(applicationContext, repository, lifecycleScope,
            onEvent = { name, payload -> web?.emit(name, payload) },
            onNative = { openSheet(it) })
        repository.allowsExternalProcessing = { session.riskAccepted }
        voice = AndroidVoice(this, lifecycleScope, repository, { name, payload ->
                web?.emit(name, payload)
                // 1.8: a tapped notification waits for the mic to close and the voice to stop.
                if (name == "voice.end" || (name == "speech.state" && payload.optString("state") == "stopped")) session.v18.voiceIdle()
            },
            { session.locale }, { session.muted }, { session.voicePersona }, { session.voicePreference })
        session.onVoiceSettingsChanged = { voice.stopSpeaking(); narrator.stop(); narrationStatus = null }
        push = PushRuntimeFactory.create(PushDependencies(applicationContext, repository, lifecycleScope,
            PushConfiguration(enabled = BuildConfig.FCM_ENABLED, projectId = BuildConfig.FCM_PROJECT_ID,
                applicationId = BuildConfig.FCM_APPLICATION_ID, senderId = BuildConfig.FCM_SENDER_ID,
                apiKey = BuildConfig.FCM_API_KEY)))
        session.onPageChanged = { page -> web?.reload(page); push.refresh() }
        // 1.8: the features reach the app through the session's host; each registers its nudge source and its listeners.
        session.v18.attach(shell)
        V18Process.runtime = session.v18
        V18.registerNudges(session.v18)
        session.setReducedMotion(Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f)
        lifecycleScope.launch {
            repository.epoch.collect {
                voice.background()
                narrator.stop(); narrationStatus = null
                session.onAccountChanged()
                BriefingReminders.refresh(this@MainActivity, repository.session.value?.userId)
                push.refresh()
                if (session.riskAccepted) billing.identify(repository.session.value, repository.epoch.value)
                if (repository.session.value != null && signInReply != null) {
                    signInReply?.complete(JSONObject().put("status", "signedIn"))
                    signInReply = null
                    web?.emit("native.sheet", JSONObject().put("route", route).put("state", "closed"))
                    route = null
                    session.setRendererForeground(active)
                    session.v18.sheetClosed()
                }
            }
        }
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF3FE0B5), background = Color(0xFF050505), surface = Color(0xFF111419), onSurface = Color(0xFFF2EDE4))) {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Box(Modifier.fillMaxSize().background(Color(0xFF050505)).safeDrawingPadding().imePadding()) {
                        key(webRevision) { AndroidView(factory = { context ->
                            WebView(context).also { view ->
                                web = NucleoWebView(view, lifecycleScope, { method, params -> dispatch(method, params) }, { needsRendererRestart = true; platformError = it })
                                web?.load(session.page)
                            }
                        }, modifier = Modifier.fillMaxSize()) }
                        platformError?.let { message ->
                            AlertDialog(onDismissRequest = { platformError = null }, title = { Text("Bobby") }, text = { Text(message) },
                                confirmButton = { TextButton(onClick = {
                                    if (needsRendererRestart) { web?.close(); web = null; webRevision++; needsRendererRestart = false }
                                    platformError = null
                                }) { Text(if (needsRendererRestart) session.text("Retry", "Reintentar") else session.text("Close", "Cerrar")) } })
                        }
                        route?.let { current ->
                            if (current == "reportContent") ReportContentSheet(session, repository, ::closeSheet)
                            // 1.8: each of these screens has its own file under ui/v18.
                            else if (V18Sheets.draws(current)) key(current) { V18Sheets.Sheet(current, session.v18, onClose = { closeSheet() }) }
                            else BobbySheet(current, session, repository, billing,
                                onClose = { closeSheet() }, onOpen = { openSheet(it) },
                                onSignIn = { provider -> startSignIn(provider) },
                                onExternal = { url -> openExternal(url) }, onShare = { text -> share(text) },
                                onShareAvatar = { spec -> shareAvatar(spec) },
                                narrationStatus = narrationStatus,
                                onNarrate = { report -> narrator.play(report) { narrationStatus = it } },
                                onStopNarration = { narrator.stop(); narrationStatus = null },
                                onReminders = { enabled -> setReminders(enabled) },
                                onPurchase = { id -> lifecycleScope.launch { val owner = repository.session.value?.userId; val epoch = repository.epoch.value; finishPurchase(billing.purchase(this@MainActivity, id), owner, epoch) } },
                                onRestore = { lifecycleScope.launch { val owner = repository.session.value?.userId; val epoch = repository.epoch.value; finishPurchase(billing.restore(this@MainActivity), owner, epoch) } })
                        }
                    }
                    BackHandler(enabled = route != null) { closeSheet() }
                }
            }
        }
        handleCallback(intent)
        handleNotification(intent)
    }

    private suspend fun dispatch(method: String, params: JSONObject): Any = when (method) {
        "speech.permission" -> voice.permission().also { session.setSpeechState(it.getString("state"), it.optBoolean("onDevice")) }
        "speech.requestPermission" -> {
            check(session.riskAccepted)
            val current = voice.permission()
            if (current.optString("state") != "undetermined") current else {
                require(microphoneReply == null)
                val reply = CompletableDeferred<JSONObject>()
                microphoneReply = reply
                voice.markPermissionAsked()
                microphone.launch(Manifest.permission.RECORD_AUDIO)
                reply.await()
            }
        }
        "speech.start" -> { check(session.riskAccepted && active && route == null); voice.start() }
        "speech.stop" -> voice.stop(params.optBoolean("cancel", false))
        "speak" -> if (!session.riskAccepted || !active || route != null) JSONObject().put("status", "muted") else voice.speak(params.getString("id"), params.getString("text"))
        "previewVoice" -> {
            val id = params.getString("companionId")
            val companions = session.roster().getJSONArray("companions")
            require((0 until companions.length()).any { companions.getJSONObject(it).optString("id") == id })
            val companion = (0 until companions.length()).map { companions.getJSONObject(it) }.first { it.optString("id") == id }
            voice.preview(id, companion.optString("selectLine"))
        }
        "stopSpeaking" -> { voice.stopSpeaking(); JSONObject() }
        "setMuted" -> { require(params.opt("muted") is Boolean); session.setMuted(params.getBoolean("muted")); if (session.muted) voice.stopSpeaking(); session.snapshot() }
        "haptic" -> { haptic(params.getString("kind")); JSONObject() }
        "signIn" -> {
            if (!session.riskAccepted || route != null) JSONObject().put("status", "unavailable") else {
                val reply = CompletableDeferred<JSONObject>()
                signInReply = reply
                openSheet("account")
                reply.await()
            }
        }
        "paywall" -> {
            if (!session.riskAccepted || route != null) JSONObject().put("status", "unavailable") else {
                val reply = CompletableDeferred<JSONObject>()
                paywallReply = reply
                openSheet("paywall")
                reply.await()
            }
        }
        else -> session.dispatch(method, params).also { if (method == "acceptRisk") push.refresh() }
    }

    private fun openSheet(name: String) {
        require(name in NucleoSession.SHEET_ROUTES)
        voice.background()
        narrator.stop(); narrationStatus = null
        web?.view?.clearFocus()
        WindowInsetsControllerCompat(window, window.decorView).hide(WindowInsetsCompat.Type.ime())
        route = name
        session.setRendererForeground(false)
        web?.emit("native.sheet", JSONObject().put("route", name).put("state", "open"))
    }

    private fun closeSheet() {
        val closedRoute = route
        narrator.stop(); narrationStatus = null
        route = null
        session.setRendererForeground(active)
        signInReply?.complete(JSONObject().put("status", "cancelled")); signInReply = null
        paywallReply?.complete(JSONObject().put("status", "cancelled")); paywallReply = null
        repository.cancelSignIn()
        web?.emit("session.changed", session.snapshot())
        web?.emit("native.sheet", JSONObject().put("route", closedRoute).put("state", "closed"))
        push.refresh()
        // 1.8: a sheet handing over to another, a read started from a sheet, a waiting notification tap.
        session.v18.sheetClosed()
    }

    private fun startSignIn(provider: String) {
        lifecycleScope.launch {
            try {
                val url = repository.prepareSignIn(provider)
                CustomTabsIntent.Builder().build().launchUrl(this@MainActivity, url)
            } catch (_: Exception) { platformError = session.text("Sign-in is unavailable. Try again.", "No se pudo iniciar sesión. Intenta de nuevo.") }
        }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); setIntent(intent); handleCallback(intent); handleNotification(intent) }
    private fun handleNotification(intent: Intent?) {
        if (intent?.getBooleanExtra("openBriefings", false) == true && repository.session.value != null && session.riskAccepted) openSheet("briefings")
        intent?.removeExtra("openBriefings")
        // 1.8: a tapped reminder or follow-up. It is only stored: the host honours it once the glass is free,
        // for the reader it was planned for. Consumed here, and never replayed when the app is reopened from recents.
        if (intent == null) return
        val notice = intent.getStringExtra(LocalNotices.EXTRA) ?: return
        intent.removeExtra(LocalNotices.EXTRA)
        if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return
        LocalNotices.payload(notice)?.let { session.v18.noteTap(it) }
    }
    private fun setReminders(enabled: Boolean) {
        val owner = repository.session.value?.userId ?: return
        if (enabled && !BriefingReminders.permissionGranted(this) && Build.VERSION.SDK_INT >= 33) {
            notificationOwner = owner; notificationEpoch = repository.epoch.value
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            BriefingReminders.setEnabled(this, owner, enabled && BriefingReminders.permissionGranted(this))
            push.refresh()
        }
    }
    private fun handleCallback(intent: Intent?) {
        if (intent == null) return
        val uri = intent.data ?: return
        // 1.8: a bobbyprotocol.xyz link that opened the app (an invitation) goes to whichever feature claims it.
        // No link reaches here until the manifest declares one.
        if (uri.scheme == "https" && uri.host in setOf("bobbyprotocol.xyz", "www.bobbyprotocol.xyz")) {
            setIntent(Intent(this, MainActivity::class.java))
            if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) == 0) session.v18.noteLink(uri.toString())
            return
        }
        if (uri.scheme != "bobby" || uri.host != "auth" || uri.path != "/callback") return
        setIntent(Intent(this, MainActivity::class.java))
        lifecycleScope.launch {
            try {
                if (repository.handleAuthCallback(uri)) {
                    session.onAccountChanged()
                    signInReply?.complete(JSONObject().put("status", "signedIn")); signInReply = null
                    web?.emit("native.sheet", JSONObject().put("route", route).put("state", "closed"))
                    route = null
                    session.v18.sheetClosed()
                } else platformError = session.text("Sign-in did not complete.", "No se completó el inicio de sesión.")
            } catch (_: Exception) { platformError = session.text("Sign-in did not complete.", "No se completó el inicio de sesión.") }
        }
    }

    private suspend fun finishPurchase(outcome: BillingOutcome, owner: String?, epoch: Long) {
        if (outcome != BillingOutcome.SUBSCRIBED) return
        if (owner == null || owner != repository.session.value?.userId || epoch != repository.epoch.value) return
        val body = runCatching { repository.access() }.getOrNull()
        if (owner != repository.session.value?.userId || epoch != repository.epoch.value) return
        val access = body?.optJSONObject("access")
        if (body?.optBoolean("signedIn") != true || access?.optString("tier") != "pro" || body?.let { billing.confirmsGoogleSubscription(it) } != true) return
        paywallReply?.complete(JSONObject().put("status", "subscribed").put("access", access))
        paywallReply = null
        val closedRoute = route
        route = null
        web?.emit("native.sheet", JSONObject().put("route", closedRoute).put("state", "closed"))
        web?.emit("session.changed", session.snapshot())
        session.v18.sheetClosed()
    }

    private fun haptic(kind: String) {
        require(kind in setOf("light", "soft", "medium", "rigid", "heavy", "selection", "success", "warning", "error"))
        val now = android.os.SystemClock.elapsedRealtime()
        if (now - lastHaptic < 40) return
        lastHaptic = now
        val vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
        if (!vibrator.hasVibrator()) return
        vibrator.vibrate(VibrationEffect.createOneShot(if (kind in setOf("heavy", "error")) 35 else 12, VibrationEffect.DEFAULT_AMPLITUDE))
    }

    private fun openExternal(url: String) {
        val uri = Uri.parse(url)
        require(uri.scheme == "https" && uri.host in setOf("bobbyprotocol.xyz", "play.google.com", "apps.apple.com", "support.google.com", "support.apple.com"))
        runCatching { CustomTabsIntent.Builder().build().launchUrl(this, uri) }
    }
    private fun share(text: String) { startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), session.text("Share", "Compartir"))) }

    private fun shareAvatar(spec: AvatarShareSpec) {
        val owner = repository.session.value?.userId
        val epoch = repository.epoch.value
        val companion = session.companionId
        if (companion != spec.companionId) return
        lifecycleScope.launch {
            val file = try { withContext(Dispatchers.IO) { AvatarShareCard.create(applicationContext, spec) } }
            catch (_: Exception) { platformError = session.text("Sharing is unavailable. Try again.", "No se pudo compartir. Intenta de nuevo."); return@launch }
            if (!active || repository.epoch.value != epoch || repository.session.value?.userId != owner || session.companionId != companion) {
                file.delete(); return@launch
            }
            val uri = FileProvider.getUriForFile(this@MainActivity, packageName + ".avatar-share", file)
            val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            send.clipData = ClipData.newRawUri("Bobby", uri)
            runCatching { startActivity(Intent.createChooser(send, session.text("Share", "Compartir"))) }
                .onFailure { file.delete(); platformError = session.text("Sharing is unavailable. Try again.", "No se pudo compartir. Intenta de nuevo.") }
        }
    }

    override fun onResume() {
        super.onResume(); active = true
        if (::session.isInitialized) session.setRendererForeground(route == null)
        if (::voice.isInitialized) {
            web?.resume()
            val permission = voice.permission()
            session.setSpeechState(permission.getString("state"), permission.optBoolean("onDevice"))
            web?.emit("app.state", JSONObject().put("state", "active"))
            session.v18.appBecameActive()
        }
        if (::push.isInitialized) push.refresh()
    }
    override fun onPause() { active = false; if (::session.isInitialized) session.setRendererForeground(false); if (::voice.isInitialized) { voice.background(); narrator.stop(); narrationStatus = null; web?.emit("app.state", JSONObject().put("state", "background")); web?.pause() }; super.onPause() }
    override fun onDestroy() {
        if (::voice.isInitialized) voice.close()
        if (::session.isInitialized) { if (V18Process.runtime === session.v18) V18Process.runtime = null; session.close() }
        if (::billing.isInitialized) billing.close()
        if (::narrator.isInitialized) narrator.stop()
        if (::push.isInitialized) push.close()
        web?.close(); web = null
        microphoneReply?.cancel(); signInReply?.cancel(); paywallReply?.cancel(); notificationReply?.cancel()
        super.onDestroy()
    }
}
