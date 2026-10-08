package xyz.bobbyprotocol.android.nucleo

import android.content.Context
import android.os.Build
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.data.VoicePreference
import xyz.bobbyprotocol.android.platform.AndroidLocalNotifier
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.ReadOrigin
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Desk
import xyz.bobbyprotocol.android.v18.V18Process
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18Runtime
import java.time.Instant
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class NucleoFault(val code: String, override val message: String) : IllegalArgumentException(message)

/** The native owner of the offline renderer's v1 contract. No page script performs network requests. */
class NucleoSession(
    private val context: Context,
    private val repository: BobbyRepository,
    private val scope: CoroutineScope,
    private val onEvent: (String, JSONObject) -> Unit,
    private val onNative: (String) -> Unit,
) {
    private val store = NucleoStateStore(context)
    private val rosterCatalog = asset("roster.json").getJSONArray("companions")
    private val levelCatalog = asset("levels.json").getJSONArray("levels")
    private val riskCatalog = asset("risk-notice.json")
    private val translations = asset("native-translations.json")
    private val androidTranslations = asset("native-android-translations.json")
    private val equipmentCatalog = runCatching { context.assets.open("equipment/catalog.json").bufferedReader().use { JSONObject(it.readText()).getJSONArray("items") } }.getOrDefault(JSONArray())
    private var owner = repository.session.value?.userId
    private var accountEpoch = repository.epoch.value
    private var consentEpoch = 0L
    private var pageReady = false
    private var speechState = "unavailable"
    private var onDevice = false
    private var reducedMotion = false
    private var activeAsk: Deferred<JSONObject>? = null
    private var activeRequestId: String? = null
    private val presentation = ReadPresentationPolicy()
    private var rendererForeground = false
    private val syncMutex = Mutex()
    private val syncReceipts = linkedMapOf<String, JSONObject>()
    private val tokens = ReadTokens()
    private val reads = mutableListOf<Read>()
    private val identityCurrent: Boolean get() = accountEpoch == repository.epoch.value && owner == repository.session.value?.userId
    var onPageChanged: ((String) -> Unit)? = null
    var onVoiceSettingsChanged: (() -> Unit)? = null
    val page: String get() = if (store.onboarded && companionId != null && riskAccepted) "app" else "onboarding"
    val companionId: String? get() = store.companionId.takeIf { identityCurrent }
    val muted: Boolean get() = store.muted
    val voicePreference: VoicePreference get() = VoicePreference.parse(store.voicePreference)
    val languageSelection: String get() = store.language
    val riskAccepted: Boolean get() = identityCurrent && store.riskVersion == riskCatalog.getInt("version")
    val hasRiskConsent: Boolean get() = riskAccepted
    val ownerUserId: String? get() = owner
    val signedIn: Boolean get() = repository.session.value != null
    val analysisLevel: String get() = store.analysisLevel
    val language: String get() {
        val selected = store.language
        return if (selected in SUPPORTED_LANGUAGES) selected else Locale.getDefault().language.takeIf { it in SUPPORTED_LANGUAGES } ?: "en"
    }
    val locale: String get() {
        val current = Locale.getDefault()
        val region = current.country.uppercase(Locale.ROOT)
        return when (language) {
            "pt" -> if (region == "BR") "pt-BR" else "pt-PT"
            "es" -> "es-" + region.takeIf { it in setOf("ES", "MX", "US") }.orEmpty().ifEmpty { "MX" }
            "fr" -> "fr-FR"; "it" -> "it-IT"; "de" -> "de-DE"
            else -> "en-" + region.takeIf { it in setOf("US", "GB", "AU", "CA", "IE") }.orEmpty().ifEmpty { "US" }
        }
    }
    val voicePersona: String get() = companion()?.optString("voicePersona", "ash") ?: "ash"

    /**
     * Bobby 1.8 (v18/V18Runtime.kt): the nudge on the glass, sheets handing over to one another,
     * reads native starts, and the hooks the features listen to. This session is its desk; the
     * activity attaches the screen.
     */
    private val desk: V18Desk = object : V18Desk {
        override val owner: String? get() = this@NucleoSession.owner
        override val signedIn: Boolean get() = this@NucleoSession.signedIn
        override val accountEpoch: Long get() = this@NucleoSession.accountEpoch
        override val riskNotice: RiskNotice get() = when {
            riskAccepted -> RiskNotice.ACCEPTED
            identityCurrent && store.riskVersion > 0 -> RiskNotice.OUTDATED
            else -> RiskNotice.WITHDRAWN
        }
        override val onGlass: Boolean get() = pageReady && page == "app"
        override val busy: Boolean get() = activeAsk != null
        override val language: String get() = this@NucleoSession.language
        override val locale: String get() = this@NucleoSession.locale
        override val analysisLevel: String get() = this@NucleoSession.analysisLevel
        override fun text(en: String, es: String): String = this@NucleoSession.text(en, es)
        override fun emit(name: String, payload: JSONObject) = this@NucleoSession.emit(name, payload)
        override fun sessionChanged() = this@NucleoSession.emit("session.changed", snapshot())
        // Bobby wrote this question (a follow-up's button, a board row): the read is not the person's own,
        // and it runs at Quick whatever level is saved, without changing the saved one (iOS `token(for:question:)`).
        override fun readToken(symbol: String, name: String, isEquity: Boolean, question: String): String = AskStart.native().let { start ->
            issueToken(json("symbol" to symbol, "name" to name, "isEquity" to isEquity, "assetClass" to if (isEquity) "equity" else "crypto", "currency" to null, "exchange" to null),
                question, start.level, origin = start.origin)
        }
        override fun tokenWaiting(token: String): Boolean = tokens.waiting(token, this@NucleoSession.accountEpoch, consentEpoch)
        override fun deskBody(symbol: String, question: String, isEquity: Boolean, level: String): JSONObject =
            this@NucleoSession.deskBody(symbol, question, if (isEquity) "equity" else "crypto", level)
        override val shortcuts: List<String> get() = store.keptQuickAccess(this@NucleoSession.owner)
        override fun keepShortcuts(symbols: List<String>) {
            // None removes the stored row: the glass falls back to its default tickers, as on iOS.
            // The row lives on this phone only (see `syncProgress`): nothing is sent when it changes.
            store.setQuickAccess(this@NucleoSession.owner, JSONArray(symbols.take(QuickAccess.LIMIT)))
        }
        override val repository: BobbyRepository get() = this@NucleoSession.repository
    }
    val v18: V18Runtime = V18Runtime(desk, V18Process.store(context), V18Process.nudges(context),
        AndroidLocalNotifier(context) { askForNotifications() }, scope, V18Process.shelf, V18Process.taps)
    private suspend fun askForNotifications(): Boolean = v18.shell?.requestNotificationPermission() ?: false
    private val accountDeleted: (String) -> Unit = { deleted -> v18.accountDeleted(deleted) }

    /** `origin`: who started it (the harness follows up only the person's own questions). */
    private data class Read(val result: JSONObject, val epoch: Long, val consent: Long, val savedAt: Long, val origin: ReadOrigin, var saved: JSONObject? = null)

    init {
        store.bindOwner(owner)
        recoverCompletedOnboarding()
        repository.language = language
        repository.locale = locale
        // The nudge centre is the process's: this host claims it, and the sources a previous activity registered go with that activity.
        v18.start()
        repository.addAccountDeletedListener(accountDeleted)
        scope.launch {
            repository.epoch.collect { epoch -> if (epoch != accountEpoch || repository.session.value?.userId != owner) onAccountChanged() }
        }
    }

    private fun asset(name: String): JSONObject = context.assets.open("nucleo/$name").bufferedReader().use { JSONObject(it.readText()) }
    private fun companion(): JSONObject? = (0 until rosterCatalog.length()).map { rosterCatalog.getJSONObject(it) }.firstOrNull { it.optString("id") == companionId }
    private fun recoverCompletedOnboarding() {
        // A saved thesis survives a process death during the renderer's final backup animation.
        // Recover only this owner's real ledger, with the current consent and a valid companion.
        if (!store.onboarded && riskAccepted && companion() != null && store.ledger(owner).length() > 0) {
            store.onboarded = true
        }
    }
    private fun levelJSON(): JSONObject {
        val xp = if (identityCurrent) store.counters(owner).xp else 0
        val index = NucleoPolicy.level(xp) - 1
        val level = levelCatalog.getJSONObject(index)
        val next = levelCatalog.optJSONObject(index + 1)
        val progress = if (next == null) 1.0 else ((xp - level.getInt("minXP")).toDouble() / (next.getInt("minXP") - level.getInt("minXP"))).coerceIn(0.0, 1.0)
        return json("number" to index + 1, "name" to level.optString(language, level.getString("en")), "progress" to progress, "nextMinXP" to next?.optInt("minXP"))
    }

    fun text(en: String, es: String = en): String = when (language) {
        "en" -> en; "es" -> androidTranslations.optJSONObject(en)?.nullableString("es") ?: es
        else -> androidTranslations.optJSONObject(en)?.nullableString(language) ?: translations.optJSONObject(en)?.nullableString(language) ?: en
    }

    fun roster(): JSONObject {
        val level = NucleoPolicy.level(if (identityCurrent) store.counters(owner).xp else 0)
        val values = JSONArray()
        for (i in 0 until rosterCatalog.length()) {
            val c = JSONObject(rosterCatalog.getJSONObject(i).toString())
            c.optJSONObject("localized")?.optJSONObject(language)?.let { localized ->
                localized.keys().forEach { key -> c.put(key, localized.get(key)) }
            }
            c.remove("localized")
            c.put("unlocked", c.optInt("requiredLevel", 1) <= level)
            values.put(c)
        }
        return json("companions" to values)
    }

    fun riskNotice(): JSONObject = json("version" to riskCatalog.getInt("version"), "statements" to riskCatalog.getJSONObject("statements").getJSONArray(language))

    fun snapshot(): JSONObject {
        val progress = if (identityCurrent) store.counters(owner) else NucleoPolicy.Counters()
        val c = companion()?.let { json("id" to it.optString("id"), "webId" to it.optString("webId"), "label" to it.optString("label"), "palette" to it.optString("palette"), "voicePersona" to it.optString("voicePersona")) }
        val pending = if (identityCurrent) reads.lastOrNull { it.epoch == accountEpoch && it.consent == consentEpoch && it.saved == null && System.currentTimeMillis() - it.savedAt < NucleoPolicy.PENDING_READ_LIFETIME_MS && it.result.optString("locale") == locale }?.result else null
        val onboarded = identityCurrent && store.onboarded
        return json("v" to 1, "page" to page, "firstRun" to !onboarded, "onboarded" to onboarded,
            "language" to language, "locale" to locale, "country" to Locale.getDefault().country.takeIf { it.matches(Regex("[A-Z]{2}")) }, "localHour" to Calendar.getInstance().get(Calendar.HOUR_OF_DAY),
            "companion" to c, "xp" to progress.xp, "level" to levelJSON(), "streak" to progress.streak,
            "aura" to if (identityCurrent) store.aura(owner) else null, "pendingAwards" to if (identityCurrent) store.pending(owner).length() else 0,
            "syncedAt" to if (identityCurrent) store.syncedAt(owner) else null, "voicePreference" to voicePreference.value,
            "signedIn" to signedIn, "riskAccepted" to riskAccepted, "riskVersion" to riskCatalog.getInt("version"), "muted" to muted,
            "reducedMotion" to reducedMotion, "mic" to json("state" to speechState, "onDevice" to onDevice), "hints" to store.hints(),
            "pendingRead" to if (riskAccepted) pending else null, "fixtures" to false, "platform" to "android", "appVersion" to appVersion(), "analysisLevel" to analysisLevelJSON(),
            // 1.8: one native-written line and one button, or null. Every session carries it (the page keeps the whole object).
            "nudge" to v18.nudgeJson()).also { session ->
            // Bobby never invites someone into a wall: when the phone KNOWS the next read is refused, the home
            // offers no chip that asks by itself. Not knowing changes nothing, and without the key the session
            // is what it always was.
            if (!v18.offersOneTapOnHome()) session.put("oneTap", false)
        }
    }

    @Suppress("DEPRECATION")
    private fun appVersion(): String = runCatching { context.packageManager.getPackageInfo(context.packageName, 0).let { "${it.versionName} (${if (Build.VERSION.SDK_INT >= 28) it.longVersionCode else it.versionCode.toLong()})" } }.getOrDefault("Android")
    private fun analysisLevelJSON(): JSONObject = json("id" to analysisLevel, "label" to when (analysisLevel) { "profundo" -> text("Deep", "Profundo"); "maximo" -> text("Max", "Máximo"); else -> text("Quick", "Rápido") }, "color" to when (analysisLevel) { "profundo" -> "#7886FA"; "maximo" -> "#A795EF"; else -> "#F2EDE4" })
    private fun emit(name: String, payload: JSONObject) { if (pageReady) onEvent(name, payload) }
    fun setSpeechState(state: String, onDevice: Boolean) { speechState = state; this.onDevice = onDevice; emit("session.changed", snapshot()) }
    fun setReducedMotion(value: Boolean) { reducedMotion = value }
    fun setRendererForeground(value: Boolean) { rendererForeground = value; if (!value) presentation.clear() }

    private fun readRendered(params: JSONObject): JSONObject {
        val requestId = params.requiredString("requestId", 36)
        if (!ReadPresentationPolicy.validRequestId(requestId)) throw NucleoFault("invalid_params", "invalid request id")
        val latest = reads.lastOrNull()?.takeIf { identityCurrent && it.epoch == accountEpoch && it.consent == consentEpoch }
        val observed = presentation.observe(requestId, ReadPresentationPolicy.Identity(accountEpoch, consentEpoch, owner),
            latest?.result?.optString("requestId"), rendererForeground, activeAsk != null, riskAccepted)
        // The canonical backend currently binds receipts to ios/web only. Never claim Android server acceptance.
        // Keep this bounded observation local until an Android receipt/ingestion contract is deployed and verified.
        return json("accepted" to false, "observed" to observed, "reason" to "telemetry_unavailable")
    }
    fun setMuted(value: Boolean) { if (value == muted) return; store.muted = value; onVoiceSettingsChanged?.invoke(); emit("session.changed", snapshot()) }
    fun selectVoicePreference(value: String) {
        val selected = VoicePreference.entries.firstOrNull { it.value == value } ?: throw NucleoFault("invalid_params", "invalid voice preference")
        if (selected == voicePreference) return
        store.voicePreference = selected.value; onVoiceSettingsChanged?.invoke(); emit("session.changed", snapshot())
    }
    fun setAnalysisLevel(value: String) { if (value !in ANALYSIS_LEVELS) throw NucleoFault("invalid_params", "invalid level"); store.analysisLevel = value; emit("analysis.level", analysisLevelJSON()); emit("session.changed", snapshot()) }
    fun setLanguage(value: String) { if (value != "system" && value !in SUPPORTED_LANGUAGES) throw NucleoFault("invalid_params", "invalid language"); cancel(); reads.clear(); tokens.clear(); store.language = value; repository.language = language; repository.locale = locale; v18.languageChanged(); emit("session.changed", snapshot()); onPageChanged?.invoke(page) }
    fun selectLanguage(value: String) = setLanguage(value)
    fun selectAnalysisLevel(value: String) = setAnalysisLevel(value)

    suspend fun dispatch(method: String, params: JSONObject): Any = withContext(Dispatchers.Main.immediate) {
        if (!identityCurrent) onAccountChanged()
        when (method) {
            "session" -> { pageReady = true; if (riskAccepted && signedIn) scope.launch { syncProgress() }; v18.pageReady(); snapshot() }
            "roster" -> roster()
            "suggestions" -> suggestions()
            "ask" -> ask(params)
            "cancel" -> json("cancelled" to cancel())
            "read.rendered" -> readRendered(params)
            "saveThesis" -> saveThesis(params)
            "island" -> island()
            "theses" -> json("items" to store.ledger(owner))
            "record" -> json("available" to false, "reason" to "no_source")
            "riskNotice" -> riskNotice()
            "acceptRisk" -> {
                val version = params.requiredInt("version")
                val accepted = version == riskCatalog.getInt("version")
                if (accepted) { store.riskVersion = version; if (signedIn) scope.launch { syncProgress() } }
                json("accepted" to accepted, "version" to riskCatalog.getInt("version"))
            }
            "setCompanion" -> {
                val id = params.requiredString("id", 32)
                val c = roster().getJSONArray("companions").let { list -> (0 until list.length()).map { list.getJSONObject(it) }.firstOrNull { it.optString("id") == id } }
                    ?: throw NucleoFault("invalid_params", "unknown companion")
                if (!c.optBoolean("unlocked")) throw NucleoFault("forbidden", "companion is locked")
                store.companionId = id; emit("session.changed", snapshot()); if (riskAccepted && signedIn) scope.launch { syncProgress() }; snapshot()
            }
            "setMuted" -> { if (params.opt("muted") !is Boolean) throw NucleoFault("invalid_params", "muted must be boolean"); setMuted(params.getBoolean("muted")); snapshot() }
            "finishOnboarding" -> {
                val missing = JSONArray(); if (!riskAccepted) missing.put("risk"); if (companionId == null) missing.put("companion")
                if (missing.length() > 0) json("finished" to false, "missing" to missing)
                else { store.onboarded = true; pageReady = false; onPageChanged?.invoke(page); if (signedIn) scope.launch { syncProgress() }; json("finished" to true, "next" to "app") }
            }
            "markHint" -> { val key = params.requiredString("key", 64); val count = (store.hints().optInt(key) + 1).coerceAtMost(10); store.markHint(key, count); json("count" to count) }
            "openNative" -> { val route = params.requiredString("route", 32); if (route !in NATIVE_ROUTES) throw NucleoFault("invalid_params", "invalid native route"); onNative(route); json("opened" to true) }
            "nudge.seen" -> v18.nudgeSeen(params.nudgeId())
            "nudge.act" -> v18.nudgeAct(params.nudgeId())
            "log" -> JSONObject()
            else -> throw NucleoFault("unknown_method", method)
        }
    }

    fun cancel(): Boolean { presentation.clear(); val current = activeAsk ?: return false; activeAsk = null; activeRequestId = null; current.cancel(); return true }
    fun close() { cancel(); tokens.clear(); pageReady = false; repository.removeAccountDeletedListener(accountDeleted); v18.close() }
    fun revokeRiskConsent() { cancel(); consentEpoch++; reads.clear(); tokens.clear(); syncReceipts.clear(); store.riskVersion = 0; v18.consentWithdrawn(); emit("consent.withdrawn", JSONObject()); pageReady = false; onPageChanged?.invoke(page) }
    fun forgetDeletedAccount(userId: String) { store.forget(userId) }

    suspend fun onAccountChanged() = withContext(Dispatchers.Main.immediate) {
        val newOwner = repository.session.value?.userId
        val newEpoch = repository.epoch.value
        if (newOwner == owner && newEpoch == accountEpoch) return@withContext
        val oldOwner = owner
        val oldPage = if (store.onboarded && store.companionId != null && store.riskVersion == riskCatalog.getInt("version")) "app" else "onboarding"
        cancel(); reads.clear(); syncReceipts.clear()
        owner = newOwner; accountEpoch = newEpoch
        store.bindOwner(newOwner, inheritGuest = oldOwner == null && newOwner != null)
        recoverCompletedOnboarding()
        // 1.8: before anything below suspends, showings, taps and reads belong to the new reader.
        v18.accountChanged()
        // The question that waited behind a sign-in goes with the reader into the account, with who started it.
        if (oldOwner == null && newOwner != null) tokens.signedIn(newEpoch) else tokens.clear()
        emit("account.changed", json("wasSignedIn" to (oldOwner != null), "signedIn" to (newOwner != null)))
        emit("session.changed", snapshot())
        if (riskAccepted && newOwner != null) {
            // Restore a returning account's selected companion before posting this device's profile.
            val consent = consentEpoch
            val remote = runCatching { repository.request("api/progress", authenticated = true).optJSONObject("progress") }.getOrNull()
            if (newEpoch == accountEpoch && consent == consentEpoch && riskAccepted && remote != null) {
                remote.nullableString("companionId")?.takeIf { id -> (0 until rosterCatalog.length()).any { rosterCatalog.getJSONObject(it).optString("id") == id } }?.let { store.companionId = it }
                if (remote.optBoolean("onboarded")) store.onboarded = true
                store.saveServerMetrics(newOwner, remote)
                store.saveCounters(newOwner, NucleoPolicy.Counters(remote.optInt("xp"), remote.optInt("streak"), remote.nullableString("lastDay"), remote.optInt("dailyAwards"), remote.nullableString("dailyAwardsDay")))
            }
            syncProgress()
            emit("session.changed", snapshot())
        }
        if (oldPage != page) onPageChanged?.invoke(page)
    }

    private suspend fun suggestions(): JSONObject {
        // `own` tells an asset the person asked about from a starter that only pads the row: a read Bobby
        // started offers their own assets only (the page's followUps()).
        val quick = JSONArray()
        for ((symbol, own) in store.quickAccessEntries(owner)) quick.put(json("symbol" to symbol, "own" to own))
        if (!riskAccepted) return json("quickAccess" to quick, "movers" to JSONArray())
        val started = accountEpoch
        val movers = runCatching { repository.request("api/bobby-asset-search?browse=1").optJSONArray("movers") }.getOrNull() ?: JSONArray()
        return json("quickAccess" to quick, "movers" to if (started == accountEpoch && riskAccepted) movers else JSONArray())
    }

    /** `origin`: a token that carries a read on (a retry, a confirmation, a sign-in) keeps who started it. */
    private fun issueToken(asset: JSONObject, question: String, level: String, signInRetry: Boolean = false, persist: Boolean = false, origin: ReadOrigin = ReadOrigin.PERSON): String =
        tokens.issue(asset, question, level, accountEpoch, consentEpoch, guest = owner == null, signInRetry = signInRetry, persist = persist, origin = origin)

    private suspend fun ask(params: JSONObject): JSONObject {
        if (activeAsk != null) throw NucleoFault("busy", "a read is in progress")
        if (!riskAccepted) return error("risk_not_accepted")
        val start = System.currentTimeMillis()
        val asset: JSONObject?
        val question: String
        // Who started this read and at which level it runs (NucleoAsk.kt). A token keeps what it was issued with.
        val begun: AskStart = when (val request = AskRequest.parse(params)) {
            is AskRequest.Token -> {
                val token = tokens.take(request.token) ?: throw NucleoFault("invalid_params", "unknown token")
                if (!tokens.good(token, accountEpoch, consentEpoch, start)) throw NucleoFault("invalid_params", "expired token")
                question = token.question
                asset = token.asset
                if (token.persistLevel) setAnalysisLevel(token.level)
                AskStart(token.origin, token.level)
            }
            is AskRequest.FollowUp -> {
                question = request.question
                if (NucleoPolicy.questionLength(question) > NucleoPolicy.QUESTION_LIMIT) return json("v" to 1, "status" to "too_long", "maxLength" to NucleoPolicy.QUESTION_LIMIT)
                val previous = reads.firstOrNull { it.result.optString("requestId") == request.previous && it.epoch == accountEpoch && it.consent == consentEpoch }?.result
                    ?: throw NucleoFault("invalid_params", "unknown followUpOf")
                val about = previous.getJSONObject("asset")
                asset = about
                // The question may be the one Bobby's CIO wrote for that read: the person picked it instead of typing
                // their own. Only the asset is passed on; the words are compared here and kept nowhere.
                val followUp = AskStart.followUp(NextQuestion.offered(previous), question, analysisLevel)
                if (followUp.picked) v18.nextQuestionPicked(about.optString("symbol"))
                followUp
            }
            is AskRequest.Question -> {
                question = request.question
                if (NucleoPolicy.questionLength(question) > NucleoPolicy.QUESTION_LIMIT) return json("v" to 1, "status" to "too_long", "maxLength" to NucleoPolicy.QUESTION_LIMIT)
                asset = null
                AskStart.question(request.chip, analysisLevel)
            }
        }
        val level = begun.level; val origin = begun.origin
        val epoch = accountEpoch; val consent = consentEpoch; val requestId = UUID.randomUUID().toString()
        val job = scope.async(start = CoroutineStart.LAZY) { runRead(requestId, question, asset, level, origin, epoch, consent, start) }
        presentation.begin(requestId, ReadPresentationPolicy.Identity(epoch, consent, owner))
        activeAsk = job; activeRequestId = requestId
        emit("ask.stage", json("requestId" to requestId, "stage" to "resolving"))
        job.start()
        return try { job.await() } catch (_: CancellationException) { json("v" to 1, "status" to "cancelled") }
        finally { if (activeAsk === job) { activeAsk = null; activeRequestId = null }; v18.readFinished() }
    }

    private suspend fun assertCurrent(epoch: Long, consent: Long) {
        currentCoroutineContext().ensureActive()
        if (epoch != accountEpoch || consent != consentEpoch || !riskAccepted) throw CancellationException("session changed")
    }

    private fun parseAsset(raw: JSONObject): JSONObject? {
        val symbol = raw.nullableString("baseSymbol") ?: raw.nullableString("symbol") ?: return null
        val assetClass = raw.optString("assetClass", "crypto")
        val aliases = raw.optJSONArray("aliases")
        val name = raw.nullableString("name") ?: aliases?.let { a -> (0 until a.length()).map { a.optString(it) }.firstOrNull { it.isNotBlank() && !it.equals(symbol, true) } } ?: symbol
        return json("symbol" to symbol, "name" to name, "isEquity" to (assetClass == "equity"), "assetClass" to assetClass, "currency" to raw.nullableString("currency"), "exchange" to raw.nullableString("exchange"))
    }

    private suspend fun runRead(requestId: String, question: String, knownAsset: JSONObject?, level: String, origin: ReadOrigin, epoch: Long, consent: Long, started: Long): JSONObject {
        var asset = knownAsset
        try {
            assertCurrent(epoch, consent)
            if (asset == null) {
                val search = repository.searchAssets(question, 3)
                assertCurrent(epoch, consent)
                asset = search.optJSONObject("resolved")?.let(::parseAsset)
                if (asset == null) {
                    val suggestions = JSONArray(); val results = search.optJSONArray("results") ?: JSONArray()
                    for (i in 0 until minOf(3, results.length())) {
                        val hit = results.optJSONObject(i)?.let(::parseAsset) ?: continue
                        suggestions.put(JSONObject(hit.toString()).put("token", issueToken(hit, question, level, origin = origin)))
                    }
                    return json("v" to 1, "status" to "unknown_asset", "query" to question, "suggestions" to suggestions)
                }
                val resolution = search.optJSONObject("resolution")
                if (resolution?.optBoolean("needsConfirmation") == true) return json("v" to 1, "status" to "confirm", "asset" to asset, "token" to issueToken(asset, question, level, origin = origin), "matchKind" to resolution.nullableString("matchKind"), "proxyNote" to resolution.nullableString("proxyNote"))
            }
            val selected = requireNotNull(asset)
            val symbol = selected.getString("symbol"); val isEquity = selected.optBoolean("isEquity")
            val assetClass = selected.optString("assetClass", if (isEquity) "equity" else "crypto")
            if (assetClass !in setOf("equity", "crypto")) return unsupported(selected, "asset_class")
            if (isEquity && !NucleoPolicy.supportsEquitySymbol(symbol)) return unsupported(selected, "symbol_format")
            emit("ask.stage", json("requestId" to requestId, "stage" to "accepted", "asset" to selected, "startedAt" to started))
            val marketTask = scope.async { withTimeoutOrNull(8_000) { runCatching { repository.request("api/voice-tool", "POST", json("tool" to "get_market", "args" to json("symbol" to symbol))) }.getOrNull() } }
            try {
                val candleReply = repository.readCandleEvidence(symbol, isEquity)
                assertCurrent(epoch, consent)
                val candles = NucleoReadModel.candles(candleReply)
                NucleoPolicy.preflight(assetClass, symbol, (0 until candles.length()).map { candles.getJSONObject(it).getLong("t") }, System.currentTimeMillis())?.let { return unsupported(selected, it) }
                val marketBody = marketTask.await()
                assertCurrent(epoch, consent)
                val market = json("price" to NucleoPolicy.number(marketBody?.opt("price")), "changePct" to NucleoPolicy.number(marketBody?.opt("change_24h_pct")), "currency" to marketBody?.nullableString("currency"), "exchange" to marketBody?.nullableString("exchange"), "asOf" to marketBody?.nullableString("asOf"))
                emit("ask.stage", json("requestId" to requestId, "stage" to "market", "market" to market))
                emit("ask.stage", json("requestId" to requestId, "stage" to "candles", "candles" to candles, "provenance" to null))
                val body = deskBody(symbol, question, assetClass, level)
                val debate = repository.streamDebate(body) { live ->
                    assertCurrent(epoch, consent)
                    emit("ask.stage", json("requestId" to requestId, "stage" to live.optString("type"), "live" to live))
                }
                assertCurrent(epoch, consent)
                if (!NucleoReadModel.validDebate(debate)) return error("bad_response")
                // The next question rides in the synthesis only when it is one the page could show, and only when
                // Bobby may offer a one-tap question after this read (asked once, with this read's access receipt
                // and the level it ran at: a chip of its row would run at the saved level, which has a meter of its own).
                val result = NucleoReadModel.read(requestId, question, selected, market, candles, debate, language, locale, started, level) { access -> v18.offersOneTapAfterRead(access, level) }
                reads.add(Read(result, epoch, consent, System.currentTimeMillis(), origin)); while (reads.size > 5) reads.removeAt(0)
                // 1.8: what a line on the glass may talk about (symbol and verdict, never the question), and who
                // started the read: only the person's own question is followed up.
                v18.readDelivered(result, origin)
                // The asset leads the quick-access row and is one of the reader's own from now on (QuickAccess.asked).
                store.noteAsked(owner, symbol)
                return result
            } finally { marketTask.cancel() }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (api: ApiException) {
            assertCurrent(epoch, consent)
            val status = when {
                api.status == 401 -> "signin_required"
                api.status == 402 || api.code == "upgrade_required" -> "subscription_required"
                api.status == 429 -> "quota"
                api.code == "question_too_long" -> "too_long"
                api.code == "signin_required" -> "signin_required"
                api.code == "level_exhausted" || api.code == "budget_paused" -> "level_notice"
                else -> "error"
            }
            val result = json("v" to 1, "status" to status, "code" to api.code, "message" to api.payload?.nullableString("error"), "access" to api.payload?.optJSONObject("access"), "retryAfterSec" to api.retryAfterSeconds)
            if (status == "too_long") result.put("maxLength", NucleoPolicy.QUESTION_LIMIT)
            if (asset != null && status in setOf("signin_required", "subscription_required")) result.put("token", issueToken(asset, question, level, status == "signin_required", origin = origin))
            if (asset != null && status == "subscription_required" && level != "rapido") {
                val lower = if (level == "maximo") "profundo" else "rapido"
                result.put("fallback", json("label" to if (lower == "profundo") text("Continue with Deep", "Seguir con Profundo") else text("Continue with Quick", "Seguir con Rápido"), "token" to issueToken(asset, question, lower, persist = true, origin = origin)))
            }
            if (asset != null && status == "level_notice") {
                val lower = if (api.payload?.optBoolean("quickAvailable", true) == false) level else "rapido"
                result.put("caption", api.payload?.nullableString("error") ?: text("Analysis is paused for now.", "El análisis está en pausa por ahora."))
                    .put("cta", if (lower == level) text("Try again", "Reintentar") else text("Continue with Quick", "Seguir con Rápido")).put("level", lower).put("token", issueToken(asset, question, lower, persist = lower != level, origin = origin))
            }
            if (asset != null && status == "error") result.put("retry", issueToken(asset, question, level, origin = origin))
            return result
        } catch (_: Exception) {
            assertCurrent(epoch, consent)
            return error("network").also { if (asset != null) it.put("retry", issueToken(asset, question, level, origin = origin)) }
        }
    }

    /** The body of a desk read. A 1.8 thesis review sends the same one, plus the thesis (`BobbyRepository.streamDebate`). */
    private fun deskBody(symbol: String, question: String, assetClass: String, level: String): JSONObject =
        json("symbol" to symbol, "question" to question, "language" to language, "locale" to locale, "country" to Locale.getDefault().country.takeIf { it.matches(Regex("[A-Z]{2}")) }, "assetType" to assetClass, "level" to level)

    private suspend fun saveThesis(params: JSONObject): JSONObject {
        val id = params.requiredString("requestId", 64)
        val horizon = if (params.has("horizonHours")) params.requiredInt("horizonHours") else 24
        if (horizon !in setOf(24, 72, 168)) throw NucleoFault("invalid_params", "invalid horizon")
        val read = reads.firstOrNull { it.result.optString("requestId") == id } ?: throw NucleoFault("invalid_params", "unknown requestId")
        if (!riskAccepted) return error("risk_not_accepted")
        if (read.epoch != accountEpoch || read.consent != consentEpoch) return json("status" to "stale")
        read.saved?.let { return it }
        val r = read.result; val asset = r.getJSONObject("asset"); val agents = r.getJSONObject("agents")
        val wait = agents.getString("verdict") == "wait"; val kind = if (wait) "no_trade_respected" else "read_complete"
        val before = store.counters(owner)
        val award = NucleoPolicy.award(before, wait, System.currentTimeMillis(), -TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000)
        val eventId = if (award.points > 0) UUID.randomUUID().toString() else null
        val technicals = r.getJSONObject("technicals"); val provenance = r.getJSONObject("provenance")
        val price = NucleoPolicy.number(r.getJSONObject("market").opt("price")) ?: NucleoPolicy.number(technicals.opt("price"))
        val thesis = json("id" to id, "symbol" to asset.getString("symbol"), "name" to asset.getString("name"), "isEquity" to asset.optBoolean("isEquity"), "verdict" to agents.getString("verdict"), "direction" to agents.optString("direction", "none"),
            "price" to price, "support" to NucleoPolicy.number(technicals.opt("support")), "resistance" to NucleoPolicy.number(technicals.opt("resistance")), "entry" to null, "stop" to null, "target" to null,
            "asOf" to provenance.optString("asOf"), "provider" to provenance.optString("provider"), "savedAt" to Instant.now().toString(), "horizonHours" to if (wait) null else horizon, "points" to award.points, "synced" to false, "eventId" to eventId)
        val event = if (eventId != null) {
            json("id" to eventId, "kind" to kind, "at" to Instant.now().toString(), "tzOffsetMin" to -TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60_000,
                "thesis" to json("symbol" to asset.getString("symbol"), "isEquity" to asset.optBoolean("isEquity"), "direction" to agents.optString("direction", "none"), "price" to price?.takeIf { it > 0 }, "entry" to null, "stop" to null, "target" to null))
        } else null
        store.recordAward(owner, award.counters, thesis, event)
        val evolution = if (NucleoPolicy.level(award.counters.xp) > NucleoPolicy.level(before.xp)) levelJSON().let { json("number" to it.getInt("number"), "name" to it.getString("name")) } else null
        val unlocks = JSONArray()
        for (i in 0 until equipmentCatalog.length()) {
            val item = equipmentCatalog.getJSONObject(i)
            val threshold = item.optInt("unlockXP")
            if (item.optString("companionId") == companionId && item.optString("kind") == "tool" && before.xp < threshold && award.counters.xp >= threshold) {
                val name = item.getJSONObject("name")
                unlocks.put(json("id" to item.getString("id"), "name" to text(name.getString("en"), name.getString("es")), "tier" to item.getInt("tier")))
            }
        }
        val result = json("status" to "saved", "awardedXP" to award.points, "capped" to (award.points == 0), "kind" to kind, "xp" to award.counters.xp, "level" to levelJSON(), "streak" to award.counters.streak,
            "evolution" to evolution, "unlocks" to unlocks, "planting" to if (!signedIn) "signed_out" else if (eventId == null) "capped" else "pending", "thesis" to thesis)
        // The review they chose: only when the page sent one and the save kept it (a read whose verdict is to wait keeps none).
        v18.readSaved(id, asset.getString("symbol"), NucleoPolicy.chosenReview(params.has("horizonHours"), wait, horizon))
        read.saved = result; emit("session.changed", snapshot())
        if (signedIn && eventId != null) {
            val startedEpoch = accountEpoch
            scope.launch {
                val response = syncProgress()
                if (startedEpoch != accountEpoch || !riskAccepted) return@launch
                val results = response?.optJSONArray("results")
                val outcome = results?.let { list -> (0 until list.length()).mapNotNull { list.optJSONObject(it) }.firstOrNull { it.optString("id") == eventId } } ?: syncReceipts[eventId]
                val world = outcome?.optJSONObject("world")
                val stage = when { world != null && world.optJSONObject("item") != null -> world.optString("state", "failed").let { if (it == "bloomed") "bloomed" else if (it == "seed") "seed" else "failed" }; outcome != null && outcome.optInt("awarded", 0) == 0 && !outcome.optBoolean("duplicate") -> "capped"; else -> "failed" }
                val piece = world?.optJSONObject("item")?.let { item -> json("id" to item.optString("id"), "name" to (item.optJSONObject("name")?.optString(language, item.optJSONObject("name")?.optString("en").orEmpty()) ?: item.optString("id"))) }
                var serverHorizon = world?.optJSONObject("horizon")
                if (stage == "seed" && horizon > 24 && world?.nullableString("inventoryId") != null) {
                    val extension = runCatching { repository.request("api/trader-land", "POST", json("action" to "extend", "inventoryId" to world.getString("inventoryId"), "hours" to horizon), true) }.getOrNull()
                    if (startedEpoch != accountEpoch || !riskAccepted) return@launch
                    serverHorizon = extension?.optJSONObject("extended")?.optJSONObject("horizon") ?: serverHorizon
                }
                if (outcome != null) { thesis.put("synced", true); if (!outcome.optBoolean("duplicate")) thesis.put("points", outcome.optInt("awarded", award.points)); serverHorizon?.let { thesis.put("horizonHours", it.optInt("hours", horizon)) }; store.saveThesis(owner, thesis) }
                emit("thesis.planted", json("requestId" to id, "stage" to stage, "piece" to piece, "horizon" to serverHorizon))
                emit("session.changed", snapshot())
            }
        }
        return result
    }

    suspend fun syncProgress(): JSONObject? = withContext(Dispatchers.Main.immediate) {
        syncMutex.withLock {
            if (!signedIn || !riskAccepted) return@withLock null
            val epoch = accountEpoch; val startedOwner = owner; val consent = consentEpoch
            var latest: JSONObject? = null
            val actualResults = JSONArray()
            fun combined(): JSONObject? = latest?.let { JSONObject(it.toString()).put("results", actualResults) }
            try {
                while (true) {
                    assertCurrent(epoch, consent)
                    val allPending = store.pending(startedOwner)
                    if (latest != null && allPending.length() == 0) break
                    val pending = JSONArray(); for (i in 0 until minOf(50, allPending.length())) pending.put(allPending.getJSONObject(i))
                    // The shortcut row stays on this phone, as on iOS: Memory tells the person it is kept "on this
                    // phone, not on its servers", so it is neither sent with the profile nor taken from the reply.
                    val profile = json("companionId" to companionId, "vibeId" to "directo", "onboarded" to store.onboarded, "riskNoticeVersion" to store.riskVersion)
                    val response = repository.request("api/progress", "POST", json("platform" to "android", "events" to pending, "profile" to profile), true)
                    assertCurrent(epoch, consent)
                    val progress = response.optJSONObject("progress") ?: break
                    val results = response.optJSONArray("results") ?: JSONArray()
                    for (i in 0 until results.length()) results.optJSONObject(i)?.let { receipt ->
                        actualResults.put(receipt)
                        receipt.nullableString("id")?.let { syncReceipts[it] = JSONObject(receipt.toString()) }
                    }
                    while (syncReceipts.size > 100) syncReceipts.remove(syncReceipts.keys.first())
                    store.applySync(startedOwner, QuickAccess.withoutRow(progress), results)
                    latest = response
                    emit("session.changed", snapshot())
                    // Drain durable offline events in the endpoint's supported batches. A missing ACK
                    // leaves the event on disk and stops retries rather than spinning indefinitely.
                    val remaining = store.pending(startedOwner).length()
                    if (pending.length() == 0 || remaining == 0 || remaining >= allPending.length()) break
                }
                combined()
            } catch (_: CancellationException) { null }
            catch (_: Exception) { if (epoch == accountEpoch && consent == consentEpoch && riskAccepted) combined() else null }
        }
    }

    private suspend fun island(): JSONObject {
        if (!signedIn) return json("available" to false, "reason" to "signed_out", "pendingSeeds" to store.pending(owner).length())
        if (!riskAccepted) return json("available" to false, "reason" to "unavailable")
        val epoch = accountEpoch; val consent = consentEpoch
        return try {
            val response = repository.request("api/trader-land", authenticated = true)
            assertCurrent(epoch, consent)
            val land = response.optJSONObject("land") ?: return json("available" to false, "reason" to "unavailable")
            val inventory = response.optJSONArray("inventory") ?: JSONArray()
            var seeds = 0; var ready = 0; var pieces = 0; val reviewDates = mutableListOf<String>()
            for (i in 0 until inventory.length()) {
                val item = inventory.optJSONObject(i) ?: continue
                val review = item.optJSONObject("review")
                when { item.optString("state") == "seed" && review?.optBoolean("ready") == true -> ready++; item.optString("state") == "seed" -> { seeds++; review?.nullableString("reviewAt")?.let(reviewDates::add) }; item.optString("state") == "bloomed" && !item.optBoolean("placed") -> pieces++ }
            }
            val season = response.optJSONObject("season")?.let { s -> json("name" to (s.optJSONObject("name")?.optString(language, s.optJSONObject("name")?.optString("en").orEmpty()) ?: s.optString("name")), "earned" to s.optInt("earned"), "total" to s.optInt("total")) }
            json("available" to true, "size" to land.optInt("size"), "pieces" to inventory.length(), "seedsGrowing" to seeds, "reviewsReady" to ready, "readyToBuild" to pieces,
                "nextReviewAt" to reviewDates.minOrNull(), "growth" to land.optJSONObject("growth"), "season" to season)
        } catch (_: CancellationException) { json("available" to false, "reason" to "unavailable") } catch (_: Exception) { json("available" to false, "reason" to "unavailable") }
    }

    private fun error(code: String) = json("v" to 1, "status" to "error", "code" to code, "message" to null)
    private fun unsupported(asset: JSONObject, reason: String) = json("v" to 1, "status" to "unsupported", "asset" to asset, "reason" to reason)

    companion object {
        val SUPPORTED_LANGUAGES = setOf("en", "es", "fr", "pt", "it", "de")
        val ANALYSIS_LEVELS = setOf("rapido", "profundo", "maximo")
        /** What the page may open through `openNative`: exactly this, and never a 1.8 screen. */
        val NATIVE_ROUTES = V18Routes.PAGE_OPENABLE
        /** Every sheet native code may present: the page's routes and the native-only 1.8 screens. */
        val SHEET_ROUTES = V18Routes.ALL
    }
}

private fun JSONObject.requiredString(key: String, maxLength: Int): String {
    val s = opt(key) as? String ?: throw NucleoFault("invalid_params", "$key must be a string")
    if (s.length > maxLength) throw NucleoFault("invalid_params", "$key is too long")
    return s
}
private fun JSONObject.nudgeId(): String {
    val id = requiredString("id", 48)
    if (!NucleoNudge.ID_PATTERN.matches(id)) throw NucleoFault("invalid_params", "invalid nudge id")
    return id
}
private fun JSONObject.requiredInt(key: String): Int {
    val number = opt(key) as? Number ?: throw NucleoFault("invalid_params", "$key must be integer")
    val value = number.toDouble()
    if (!value.isFinite() || value % 1 != 0.0 || value < Int.MIN_VALUE || value > Int.MAX_VALUE) throw NucleoFault("invalid_params", "$key must be integer")
    return value.toInt()
}
