package xyz.bobbyprotocol.android.data

import android.content.Context
import android.net.Uri
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.BuildConfig
import xyz.bobbyprotocol.android.v18.ThesisContext
import java.io.IOException
import java.security.MessageDigest
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Native transport. Only relative Bobby API paths are accepted; no bearer ever crosses the JS bridge. */
class BobbyRepository(context: Context) {
    private val store = SecureStore(context.applicationContext)
    private val stateLock = AccountFence.lock
    private val refreshMutex = AccountFence.refreshMutex
    private val apiBase = BuildConfig.API_BASE_URL.trimEnd('/').toHttpUrl().also {
        require(it.isHttps && it.encodedPath == "/" && it.query == null && it.fragment == null && it.username.isEmpty() && it.password.isEmpty())
    }
    private val client = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(100, TimeUnit.SECONDS)
        .callTimeout(110, TimeUnit.SECONDS)
        // A redirect must never move an account bearer to an unrelated host.
        .followRedirects(false)
        .followSslRedirects(false)
        .build()
    private val couponClient by lazy { client.newBuilder().retryOnConnectionFailure(false).build() }
    private var storedSession: StoredSession? = null
    private val mutableSession = MutableStateFlow<AccountSession?>(null)
    val session: StateFlow<AccountSession?> = mutableSession.asStateFlow()
    private val mutableEpoch = MutableStateFlow(0L)
    val epoch: StateFlow<Long> = mutableEpoch.asStateFlow()
    private val quotaStore = BobbyQuotaStore({ BobbyQuotaOwner(session.value?.userId, epoch.value) }, stateLock)
    val quota: StateFlow<BobbyQuotaState> = quotaStore.state
    init {
        synchronized(stateLock) {
            storedSession = loadSession()
            mutableSession.value = storedSession?.identity
            mutableEpoch.value = store.read("epoch")?.toLongOrNull() ?: 0L
            quotaStore.reset()
        }
    }
    private val mutableLastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = mutableLastError.asStateFlow()
    val installationId: String = synchronized(stateLock) {
        store.read("installation") ?: UUID.randomUUID().toString().also { store.write("installation", it) }
    }
    val isAuthConfigured: Boolean get() = try { configuredAuthBase(); true } catch (_: AuthConfigurationException) { false }
    /** Supplied by the native consent owner; checked when sending, never trusted from a web argument. */
    @Volatile var allowsExternalProcessing: () -> Boolean = { false }
    /** Optional native push hooks. No callback is installed in the default no-FCM build. */
    @Volatile var onBeforeAccountChange: ((AccountCleanup) -> Unit)? = null
    private val accountDeletionEvents = AccountDeletionEvents()
    /** Legacy hook retained alongside additive cleanup subscriptions. Callbacks must remain local. */
    var onAccountDeleted: ((String) -> Unit)?
        get() = accountDeletionEvents.legacy
        set(value) { accountDeletionEvents.legacy = value }

    fun addAccountDeletedListener(listener: (String) -> Unit) { accountDeletionEvents.add(listener) }
    fun removeAccountDeletedListener(listener: (String) -> Unit) { accountDeletionEvents.remove(listener) }

    /** UI may select a supported language. Locale/country are checked by the server as on iOS. */
    @Volatile var language: String = supportedLanguage(Locale.getDefault().language)
    @Volatile var locale: String = defaultLocale(language)
    @Volatile var country: String? = Locale.getDefault().country.takeIf { it.length == 2 }

    suspend fun request(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = false,
        headers: Map<String, String> = emptyMap(),
    ): JSONObject = requestReply(path, method, body, authenticated, headers).json

    suspend fun requestReply(
        path: String,
        method: String = "GET",
        body: JSONObject? = null,
        authenticated: Boolean = false,
        headers: Map<String, String> = emptyMap(),
    ): JsonReply {
        val owner = epoch.value
        val token = tokenForRequest(authenticated)
        checkOwner(owner)
        val result = authorizedRetry(owner, token) { bearer ->
            network(apiRequest(path, method, body, bearer, headers)) { response -> decodeReply(response) }
        }
        checkOwner(owner)
        requireProcessingConsent(path, body)
        requireSuccess(result)
        return result
    }

    /**
     * Production sends NDJSON; JSON quota/refusal replies retain their real HTTP status and payload.
     * 1.8: a review the person started carries their own `thesis` (sent inside this one request, never
     * stored by the server); a plain question never has the key, and its request is exactly as before.
     * The reply may carry `memory` and, for a thesis, `review`: read them with `DeskAnswer(reply)`.
     */
    suspend fun streamDebate(body: JSONObject, thesis: ThesisContext? = null, onEvent: suspend (JSONObject) -> Unit): JSONObject {
        val question = body.optString("question").trim()
        if (BobbyParsers.questionLength(question) > BobbyParsers.MAX_QUESTION_CODE_POINTS) {
            throw ApiException(400, "question_too_long", JSONObject().put("code", "question_too_long").put("maxLength", 1200))
        }
        val requestBody = JSONObject(body.toString()).put("question", question)
        if (thesis != null) requestBody.put("thesis", thesis.toJson())
        addLocale(requestBody)
        val owner = epoch.value
        val token = tokenForRequest(false)
        checkOwner(owner)
        val result = authorizedRetry(owner, token) { bearer ->
            val request = apiRequest("api/desk-debate", "POST", requestBody, bearer,
                mapOf("Accept" to "application/x-ndjson, text/event-stream, application/json"))
            network(request) { response ->
                val type = response.header("Content-Type").orEmpty().lowercase(Locale.ROOT)
                if (!response.isSuccessful || (!type.contains("ndjson") && !type.contains("text/event-stream"))) {
                    return@network decodeReply(response)
                }
                val parser = DeskStreamParser(type.contains("text/event-stream"))
                val source = response.body?.source() ?: throw ApiException(502, "analysis_incomplete")
                var final: JSONObject? = null
                var eventCount = 0
                suspend fun consume(event: JSONObject) {
                    currentCoroutineContext().ensureActive()
                    checkOwner(owner)
                    requireProcessingConsent("api/desk-debate", requestBody)
                    if (++eventCount > 512) throw ApiException(502, "too_many_stream_events")
                    when (event.optString("type")) {
                        "final" -> final = event.optJSONObject("data") ?: throw ApiException(502, "analysis_incomplete")
                        "error" -> throw ApiException(503, BobbyParsers.machineCode(event) ?: "analysis_failed", event)
                        else -> onEvent(event)
                    }
                }
                while (!source.exhausted() && final == null) {
                    currentCoroutineContext().ensureActive()
                    val line = source.readUtf8LineStrict(DeskStreamParser.MAX_LINE_CHARACTERS.toLong())
                    parser.line(line)?.let { consume(it) }
                }
                if (final == null) parser.finish()?.let { consume(it) }
                val json = final ?: throw ApiException(502, "analysis_incomplete")
                if (!BobbyParsers.validDeskAnswer(json)) throw ApiException(502, "analysis_incomplete", json)
                JsonReply(json, response.code, response.headers.toMultimap().mapKeys { it.key.lowercase(Locale.ROOT) })
            }
        }
        checkOwner(owner)
        requireProcessingConsent("api/desk-debate", requestBody)
        requireSuccess(result)
        if (!BobbyParsers.validDeskAnswer(result.json)) throw ApiException(502, "analysis_incomplete", result.json)
        return result.json
    }

    suspend fun searchAssets(query: String, limit: Int = 10): JSONObject = request(
        "api/bobby-asset-search", "POST", addLocale(JSONObject().put("q", query).put("limit", limit.coerceIn(1, 50))),
    )

    suspend fun resolveAsset(query: String): AssetResolution? = BobbyParsers.resolution(searchAssets(query))

    suspend fun browseBoard(): JSONObject = request(queryPath("api/bobby-asset-search", mapOf(
        "browse" to "1", "language" to language, "locale" to locale, "country" to country,
    )))

    suspend fun market(symbol: String): MarketSnapshot {
        val json = request("api/voice-tool", "POST", JSONObject().put("tool", "get_market")
            .put("args", JSONObject().put("symbol", symbol)))
        return MarketSnapshot(symbol = symbol, price = json.numberOrNull("price"), changePct = json.numberOrNull("change_24h_pct"))
    }

    suspend fun candles(symbol: String, isEquity: Boolean = false, timeframe: MarketTimeframe = MarketTimeframe.ONE_HOUR): List<Candle> {
        require(!isEquity || timeframe != MarketTimeframe.FOUR_HOURS) { "The equity provider does not expose 4H candles" }
        val path = if (isEquity) queryPath("api/stock-candles", mapOf("symbol" to symbol,
            "range" to timeframe.equityRange, "interval" to timeframe.equityInterval))
        else queryPath("api/okx-candles", mapOf("instId" to "$symbol-USDT", "bar" to timeframe.cryptoBar, "limit" to "100"))
        return BobbyParsers.candles(request(path))
    }

    /** The analysis preflight keeps its full hourly window and the server-resolved listing. */
    suspend fun readCandleEvidence(symbol: String, isEquity: Boolean): JSONObject = request(
        if (isEquity) queryPath("api/stock-candles", mapOf("symbol" to symbol, "range" to "30d", "interval" to "1h"))
        else queryPath("api/okx-candles", mapOf("instId" to "$symbol-USDT", "bar" to "1H", "limit" to "100")),
    )

    /** A late GET cannot overwrite the replacement quota confirmed by a coupon POST. */
    suspend fun access(): JSONObject = readAccessForOwner(null)

    private suspend fun readAccessForOwner(expected: BobbyQuotaOwner?): JSONObject {
        val ticket = synchronized(stateLock) {
            if (expected != null && expected != BobbyQuotaOwner(session.value?.userId, epoch.value)) throw AccountChangedException()
            checkOwner(epoch.value)
            quotaStore.beginRead()
        }
        val reply = replyForOwner(ticket.owner, "api/bobby-access", authenticated = ticket.owner.userId != null)
        requireSuccess(reply)
        synchronized(stateLock) {
            checkOwner(ticket.owner.epoch)
            val applied = quotaStore.applyRead(ticket, BobbyQuotaPolicy.snapshot(reply.json, accountOnly = ticket.owner.userId != null))
            // The explicit balance action must not return a GET superseded by another quota read.
            if (expected != null && !applied) throw ApiException(409, "access_refresh_superseded")
        }
        return reply.json
    }

    fun couponController(): CouponRedemptionController = CouponRedemptionController(
        currentOwner = { synchronized(stateLock) { BobbyQuotaOwner(session.value?.userId, epoch.value) } },
        send = { owner, code ->
            val reply = replyForOwner(owner, "api/bobby-access", "POST",
                JSONObject().put("action", "redeem-coupon").put("code", code), authenticated = true, retryConnections = false)
            CouponReply(reply.status, reply.json)
        },
        loadBalance = { owner -> BobbyQuotaPolicy.snapshot(readAccessForOwner(owner), accountOnly = true) },
        applySnapshot = { owner, snapshot -> synchronized(stateLock) {
            if (owner != BobbyQuotaOwner(session.value?.userId, epoch.value)) false
            else {
                checkOwner(owner.epoch)
                quotaStore.applyCoupon(owner, snapshot)
            }
        } },
        lock = stateLock,
    )
    suspend fun refreshAccess(): JSONObject = request("api/bobby-access", "POST", JSONObject().put("action", "revenuecat-sync"), authenticated = true)
    suspend fun progress(): JSONObject = request("api/progress", authenticated = true)
    suspend fun syncProgress(events: JSONArray, profile: JSONObject): JSONObject {
        require(events.length() <= 50) { "The progress contract accepts 50 events per batch" }
        return request("api/progress", "POST", JSONObject().put("platform", "android").put("events", events).put("profile", profile), true)
    }
    suspend fun traderLand(): JSONObject = request("api/trader-land", authenticated = true)
    suspend fun memory(): JSONObject = request("api/memory", authenticated = true)
    suspend fun updateMemory(body: JSONObject): JSONObject {
        if (body.has("memoryEnabled") && !body.optBoolean("memoryEnabled")) setNativeMemoryOptIn(false)
        return request("api/memory", "PATCH", body, true)
    }
    suspend fun forgetAllMemory(): JSONObject {
        // Turning capture off is local first: being offline must never leave the phone recording.
        setNativeMemoryOptIn(false)
        return request("api/memory", "DELETE", authenticated = true)
    }
    suspend fun forgetMemory(symbol: String): JSONObject = request(queryPath("api/memory", mapOf("symbol" to symbol)), "DELETE", authenticated = true)

    /** Local native-capture consent is account scoped and defaults off independently of the web preference. */
    fun setNativeMemoryOptIn(enabled: Boolean) = synchronized(stateLock) {
        if (enabled && !allowsExternalProcessing()) throw ApiException(403, "consent_required")
        val id = storedSession?.identity?.userId ?: return@synchronized
        store.write(memoryPreferenceKey(id), enabled.toString())
    }
    fun nativeMemoryOptIn(): Boolean = synchronized(stateLock) {
        storedSession?.identity?.userId?.let { store.read(memoryPreferenceKey(it)) == "true" } ?: false
    }

    suspend fun briefingSettings(): JSONObject = request("api/briefing-settings", authenticated = true)
    suspend fun updateBriefingSettings(revision: Int, changes: JSONObject): JSONObject =
        request("api/briefing-settings", "PATCH", BriefingSettingsPolicy.validate(changes), true, mapOf("If-Match" to "\"$revision\""))
    suspend fun briefings(cadence: String? = null, cursor: String? = null, limit: Int = 20): JSONObject =
        request(queryPath("api/briefings", mapOf("limit" to limit.coerceIn(1, 20).toString(), "cadence" to cadence, "cursor" to cursor)), authenticated = true)
    suspend fun briefing(id: String): JSONObject = request(queryPath("api/briefing", mapOf("id" to validId(id))), authenticated = true)
    suspend fun briefingVoice(briefId: String, contentVersion: Int, segment: Int, voice: String,
        language: String, idempotencyKey: String = UUID.randomUUID().toString()): JSONObject {
        require(contentVersion > 0 && segment in 0 until 4)
        return request("api/briefing-voice", "POST", JSONObject().put("briefId", validId(briefId))
            .put("contentVersion", contentVersion).put("segmentIndex", segment).put("voice", voice).put("language", language),
            true, mapOf("Idempotency-Key" to idempotencyKey))
    }
    suspend fun briefingAudio(id: String): ByteArray = authenticatedBinary(queryPath("api/briefing-audio", mapOf("id" to validId(id))))

    suspend fun authenticatedBinary(path: String, method: String = "GET", body: JSONObject? = null): ByteArray =
        binary(path, method, body, authenticated = true).bytes

    suspend fun neuralVoice(text: String, voice: String, language: String): ByteArray =
        this.voice(text, voice, language).bytes

    suspend fun voice(text: String, voice: String, language: String = this.language, vibe: String? = null, free: Boolean = false): AudioReply {
        require(text.isNotBlank() && text.codePointCount(0, text.length) <= 800) { "Narration requires between 1 and 800 characters" }
        val (resolvedLanguage, resolvedLocale) = BobbyLocales.voice(language, this.language, locale)
        val body = JSONObject().put("text", text).put("voice", voice).put("lang", resolvedLanguage)
            .put("language", resolvedLanguage).put("locale", resolvedLocale)
            .put("mode", if (free) "free" else "persona")
        vibe?.let { body.put("vibe", it) }
        val result = binary("api/bobby-voice-free", "POST", body, authenticated = false)
        if (result.bytes.size <= 500 || (!free && result.provider != "openai")) throw ApiException(503, "persona_voice_unavailable")
        return result
    }

    /** Opens in a Custom Tab through the caller. The encrypted verifier survives ordinary process death. */
    suspend fun prepareGoogleSignIn(): Uri = prepareSignIn("google")

    suspend fun prepareSignIn(provider: String = "google"): Uri = synchronized(stateLock) {
        require(provider in setOf("google", "apple")) { "Unsupported sign-in provider" }
        val authBase = configuredAuthBase()
        val verifier = AuthGuards.randomToken(48)
        val state = AuthGuards.randomToken()
        val attempt = PendingSignIn(verifier, state, epoch.value, System.currentTimeMillis())
        store.write("oauth-attempt", attempt.toJson().toString())
        mutableLastError.value = null
        val callback = Uri.parse(AuthGuards.CALLBACK).buildUpon().appendQueryParameter("state", state).build().toString()
        Uri.parse(authBase.newBuilder().addPathSegments("auth/v1/authorize")
            .addQueryParameter("provider", provider)
            .addQueryParameter("redirect_to", callback)
            .addQueryParameter("code_challenge", AuthGuards.challenge(verifier))
            .addQueryParameter("code_challenge_method", "s256")
            .build().toString())
    }

    suspend fun handleAuthCallback(uri: Uri): Boolean {
        val attempt = synchronized(stateLock) { pendingSignIn() } ?: return false
        val params = AuthGuards.callbackParameters(uri.toString(), attempt.state) ?: return false
        val now = System.currentTimeMillis()
        if (epoch.value != attempt.epoch || now < attempt.createdAt || now - attempt.createdAt > AuthGuards.ATTEMPT_MAX_AGE_MILLIS) {
            cancelAttempt(attempt); return false
        }
        if (params.containsKey("error")) {
            cancelAttempt(attempt, "google_sign_in_failed")
            return false
        }
        val code = params["code"]?.takeIf { it.isNotBlank() && it.length <= 4096 } ?: return false
        try {
            val session = exchange("pkce", JSONObject().put("auth_code", code).put("code_verifier", attempt.verifier))
            return synchronized(stateLock) {
                // A newer sign-in, sign-out or account change always wins against an older callback.
                val current = pendingSignIn()
                if (epoch.value != attempt.epoch || current?.state != attempt.state) return@synchronized false
                accept(session)
                true
            }
        } catch (error: CancellationException) { throw error }
        catch (_: Exception) {
            synchronized(stateLock) {
                if (epoch.value == attempt.epoch && pendingSignIn()?.state == attempt.state) {
                    store.remove("oauth-attempt")
                    mutableLastError.value = "google_sign_in_failed"
                }
            }
            return false
        }
    }

    fun cancelSignIn() = synchronized(stateLock) { store.remove("oauth-attempt") }

    private fun cancelAttempt(attempt: PendingSignIn, error: String? = null) = synchronized(stateLock) {
        if (pendingSignIn()?.state == attempt.state) {
            store.remove("oauth-attempt")
            if (epoch.value == attempt.epoch) mutableLastError.value = error
        }
    }

    fun signOut() = synchronized(stateLock) { checkOwner(epoch.value); clearSession(notifyOutgoing = true) }

    private fun clearSession(notifyOutgoing: Boolean) {
        val next = epoch.value + 1
        if (notifyOutgoing) storedSession?.let { notifyOutgoingAccount(it) }
        storedSession = null
        mutableSession.value = null
        try {
            store.writeMany(mapOf("epoch" to next.toString()), setOf("session", "oauth-attempt"))
            mutableLastError.value = null
        } finally {
            // Emit the epoch after identity assignment so observers always bind the new owner.
            mutableEpoch.value = next
            quotaStore.reset()
        }
    }

    suspend fun accountDeletionRequirements(): AccountDeletionRequirements {
        val ticket = synchronized(stateLock) {
            AccountDeletionRequirements(session.value?.userId ?: throw ApiException(401, "signin_required"), epoch.value, false)
        }
        val response = accountDeletionRequest(ticket, "GET")
        return AccountDeletionPolicy.requirements(response, ticket.ownerUserId, ticket.epoch)
    }

    /** Account client 1 deletes Apple accounts with the server's documented manual revocation steps. */
    suspend fun deleteAccount(requirements: AccountDeletionRequirements? = null): JSONObject {
        val ticket = requirements ?: accountDeletionRequirements()
        val result = AccountDeletionPolicy.confirmedResponse(accountDeletionRequest(ticket, "DELETE"))
        synchronized(stateLock) {
            AccountDeletionPolicy.requireOwner(ticket, session.value?.userId, epoch.value)
            store.remove(memoryPreferenceKey(ticket.ownerUserId))
            // The server cascade already removed this account's push bindings.
            clearSession(notifyOutgoing = false)
            accountDeletionEvents.notifyDeleted(ticket.ownerUserId)
        }
        return result
    }

    private suspend fun accountDeletionRequest(ticket: AccountDeletionRequirements, method: String): JSONObject =
        requestForAccount(ticket.ownerUserId, ticket.epoch, "api/account", method,
            headers = mapOf("X-Bobby-Account-Client" to AccountDeletionPolicy.CLIENT_VERSION))

    /** A delayed native operation cannot acquire or submit the next account's bearer. */
    suspend fun requestForAccount(ownerUserId: String, ownerEpoch: Long, path: String, method: String = "GET",
                                  body: JSONObject? = null, headers: Map<String, String> = emptyMap()): JSONObject {
        val reply = replyForOwner(BobbyQuotaOwner(ownerUserId, ownerEpoch), path, method, body, headers, authenticated = true)
        requireSuccess(reply)
        return reply.json
    }

    private suspend fun replyForOwner(owner: BobbyQuotaOwner, path: String, method: String = "GET",
                                      body: JSONObject? = null, headers: Map<String, String> = emptyMap(),
                                      authenticated: Boolean, retryConnections: Boolean = true): JsonReply {
        fun currentOwner() = synchronized(stateLock) {
            if (session.value?.userId != owner.userId || epoch.value != owner.epoch) throw AccountChangedException()
            checkOwner(owner.epoch)
        }
        currentOwner()
        val token = tokenForRequest(authenticated)
        currentOwner()
        val reply = authorizedRetry(owner.epoch, token) { bearer ->
            currentOwner()
            network(apiRequest(path, method, body, bearer, headers), if (retryConnections) client else couponClient) { response -> decodeReply(response) }
        }
        currentOwner()
        requireProcessingConsent(path, body)
        return reply
    }

    private fun notifyOutgoingAccount(value: StoredSession) {
        val hook = onBeforeAccountChange ?: return
        val cleanup = AccountCleanup(value.identity.userId) { registration, revision, proof ->
            // Uses only the captured outgoing bearer, never another account's refresh credential.
            val reply = network(apiRequest("api/briefing-device", "DELETE",
                JSONObject().put("registrationId", registration).put("expectedBindingRevision", revision), value.access,
                mapOf("X-Bobby-Installation-Proof" to proof, "X-Bobby-Push-Client" to "2"))) { decodeReply(it) }
            requireSuccess(reply)
        }
        runCatching { hook(cleanup) }
    }

    private suspend fun binary(path: String, method: String, body: JSONObject?, authenticated: Boolean): AudioReply {
        val owner = epoch.value
        val token = tokenForRequest(authenticated)
        checkOwner(owner)
        val result = authorizedRetry(owner, token) { bearer ->
            network(apiRequest(path, method, body, bearer, mapOf("Accept" to "audio/mpeg, application/json"))) { response ->
                val type = response.header("Content-Type").orEmpty().substringBefore(';')
                if (!response.isSuccessful || response.code == 202 || !type.startsWith("audio/")) {
                    val reply = decodeReply(response)
                    throw ApiException(reply.status, BobbyParsers.machineCode(reply.json) ?: if (reply.status == 202) "audio_pending" else "audio_unavailable",
                        reply.json, retryAfter(reply))
                }
                val bytes = readBounded(response, MAX_AUDIO_BYTES)
                if (bytes.isEmpty()) throw ApiException(502, "audio_unavailable")
                AudioReply(bytes, type, response.header("X-TTS-Provider"))
            }
        }
        checkOwner(owner)
        requireProcessingConsent(path, body)
        return result
    }

    private suspend fun <T> authorizedRetry(owner: Long, token: String?, run: suspend (String?) -> T): T {
        checkOwner(owner)
        try {
            val result = run(token)
            checkOwner(owner)
            // JSON status is carried until the common error handler; audio throws immediately.
            if (result is JsonReply && result.status == 401 && token != null) {
                val fresh = accessToken(replacing = token)
                checkOwner(owner)
                if (fresh != null && fresh != token) return run(fresh).also { checkOwner(owner) }
            }
            return result
        } catch (error: ApiException) {
            checkOwner(owner)
            if (error.status != 401 || token == null) throw error
            val fresh = accessToken(replacing = token)
            checkOwner(owner)
            if (fresh == null || fresh == token) throw error
            return run(fresh).also { checkOwner(owner) }
        }
    }

    private suspend fun tokenForRequest(required: Boolean): String? {
        val wasSignedIn = session.value != null
        val token = accessToken()
        if (token == null && (required || wasSignedIn)) {
            if (session.value == null) throw ApiException(401, "signin_required")
            throw SessionUnavailableException()
        }
        return token
    }

    private suspend fun accessToken(replacing: String? = null): String? = refreshMutex.withLock {
        val (current, owner) = synchronized(stateLock) {
            checkOwner(epoch.value)
            // Another same-owner repository may already have rotated the refresh credential.
            loadSession()?.let { storedSession = it; mutableSession.value = it.identity }
            storedSession to epoch.value
        }
        current ?: return@withLock null
        if ((replacing == null || current.access != replacing) && current.identity.expiresAt - System.currentTimeMillis() > 60_000) {
            return@withLock current.access
        }
        try {
            val fresh = exchange("refresh_token", JSONObject().put("refresh_token", current.refresh))
            synchronized(stateLock) {
                checkOwner(owner)
                if (storedSession?.identity?.userId != current.identity.userId || fresh.identity.userId != current.identity.userId) {
                    throw AccountChangedException()
                }
                store.write("session", fresh.toJson().toString())
                storedSession = fresh
                mutableSession.value = fresh.identity
                mutableLastError.value = null
                fresh.access
            }
        } catch (error: CancellationException) { throw error }
        catch (error: AccountChangedException) { throw error }
        catch (error: ApiException) {
            synchronized(stateLock) {
                checkOwner(owner)
                if (error.status in setOf(400, 401, 403)) { signOut(); mutableLastError.value = "session_expired" }
                else mutableLastError.value = "session_unavailable"
            }
            null
        } catch (_: Exception) {
            checkOwner(owner)
            mutableLastError.value = "session_unavailable"
            null
        }
    }

    private suspend fun exchange(grant: String, body: JSONObject): StoredSession {
        val url = configuredAuthBase().newBuilder().addPathSegments("auth/v1/token").addQueryParameter("grant_type", grant).build()
        val request = Request.Builder().url(url).post(body.toString().toRequestBody(JSON))
            .header("apikey", BuildConfig.SUPABASE_ANON_KEY).header("Cache-Control", "no-store").build()
        val reply = network(request) { decodeReply(it) }
        requireSuccess(reply)
        val json = reply.json
        val access = json.stringOrNull("access_token") ?: throw ApiException(502, "malformed_session")
        val refresh = json.stringOrNull("refresh_token") ?: throw ApiException(502, "malformed_session")
        val user = json.optJSONObject("user") ?: throw ApiException(502, "malformed_session")
        val id = user.stringOrNull("id") ?: throw ApiException(502, "malformed_session")
        val expiresIn = json.numberOrNull("expires_in")?.takeIf { it > 0 && it <= 31_536_000 } ?: throw ApiException(502, "malformed_session")
        val metadata = user.optJSONObject("user_metadata")
        val identity = AccountSession(id, metadata?.stringOrNull("full_name") ?: metadata?.stringOrNull("name"),
            user.optJSONObject("app_metadata")?.stringOrNull("provider"), System.currentTimeMillis() + (expiresIn * 1000).toLong())
        return StoredSession(access, refresh, identity)
    }

    private fun configuredAuthBase(): HttpUrl {
        if (BuildConfig.SUPABASE_ANON_KEY.isBlank() || BuildConfig.SUPABASE_URL.isBlank()) throw AuthConfigurationException()
        val url = try { BuildConfig.SUPABASE_URL.trimEnd('/').toHttpUrl() } catch (_: Exception) { throw AuthConfigurationException() }
        if (!url.isHttps || url.encodedPath != "/" || url.username.isNotEmpty() || url.password.isNotEmpty()) throw AuthConfigurationException()
        return url
    }

    private fun apiRequest(path: String, method: String, body: JSONObject?, token: String?, headers: Map<String, String>): Request {
        require(AuthGuards.validApiPath(path)) { "Only relative Bobby API routes are allowed" }
        val normalized = method.uppercase(Locale.ROOT)
        require(normalized in setOf("GET", "POST", "PATCH", "PUT", "DELETE"))
        val route = path.substringBefore('?').removePrefix("/")
        requireProcessingConsent(path, body)
        val url = apiBase.resolve("/${path.removePrefix("/")}") ?: throw IllegalArgumentException("Invalid API path")
        check(url.host == apiBase.host && url.isHttps && url.port == apiBase.port)
        val request = Request.Builder().url(url).header("Origin", apiBase.newBuilder().encodedPath("/").query(null).build().toString().trimEnd('/'))
            .header("x-bobby-device", installationId).header("x-bobby-platform", "android")
            .header("Cache-Control", "no-store").header("Accept", "application/json")
        for ((name, value) in headers) if (name.lowercase(Locale.ROOT) !in RESERVED_HEADERS) request.header(name, value)
        token?.let { request.header("Authorization", "Bearer $it") }
        val canCapture = synchronized(stateLock) {
            token != null && token == storedSession?.access && allowsExternalProcessing() &&
                storedSession?.identity?.userId?.let { store.read(memoryPreferenceKey(it)) == "true" } == true
        }
        if (route == "api/desk-debate" && normalized == "POST" && canCapture) {
            request.header("x-bobby-memory-opt-in", "1")
        }
        val requestBody = body?.toString()?.toRequestBody(JSON) ?: if (normalized in setOf("POST", "PATCH", "PUT")) "{}".toRequestBody(JSON) else null
        return request.method(normalized, requestBody).build()
    }

    private suspend fun <T> network(request: Request, transport: OkHttpClient = client, consume: suspend (Response) -> T): T = coroutineScope {
        suspendCancellableCoroutine { continuation ->
            val call = transport.newCall(request)
            val responseRef = AtomicReference<Response?>()
            val jobRef = AtomicReference<Job?>()
            continuation.invokeOnCancellation { call.cancel(); responseRef.get()?.close(); jobRef.get()?.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, error: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(error)
                }
                override fun onResponse(call: Call, response: Response) {
                    responseRef.set(response)
                    if (!continuation.isActive) { response.close(); return }
                    val job = launch(Dispatchers.IO, start = CoroutineStart.DEFAULT) {
                        try {
                            val result = response.use { consume(it) }
                            if (continuation.isActive) continuation.resume(result)
                        } catch (error: CancellationException) { continuation.cancel(error) }
                        catch (error: Exception) { if (continuation.isActive) continuation.resumeWithException(error) }
                    }
                    jobRef.set(job)
                    job.invokeOnCompletion { response.close() }
                    if (!continuation.isActive) { job.cancel(); response.close() }
                }
            })
        }
    }

    private suspend fun readBounded(response: Response, limit: Int): ByteArray {
        val body = response.body ?: throw ApiException(502, "empty_response")
        if (body.contentLength() > limit) throw ApiException(502, "response_too_large")
        val source = body.source()
        val buffer = okio.Buffer()
        while (true) {
            currentCoroutineContext().ensureActive()
            val read = source.read(buffer, 8192)
            if (read == -1L) break
            if (buffer.size > limit) throw ApiException(502, "response_too_large")
        }
        return buffer.readByteArray()
    }

    private suspend fun decodeReply(response: Response): JsonReply {
        val bytes = readBounded(response, MAX_JSON_BYTES)
        val json = if (bytes.isEmpty() && response.code == 204) JSONObject() else try { JSONObject(String(bytes, Charsets.UTF_8)) }
            catch (_: Exception) { throw ApiException(response.code.takeIf { it !in 200..299 } ?: 502, "invalid_response") }
        return JsonReply(json, response.code, response.headers.toMultimap().mapKeys { it.key.lowercase(Locale.ROOT) })
    }

    private fun requireSuccess(reply: JsonReply) {
        if (reply.status !in 200..299) throw ApiException(reply.status, BobbyParsers.machineCode(reply.json), reply.json, retryAfter(reply))
    }

    private fun retryAfter(reply: JsonReply): Double? = (reply.headers["retry-after"]?.firstOrNull()?.toDoubleOrNull()
        ?: reply.json.numberOrNull("retryAfterSeconds"))?.takeIf(Double::isFinite)?.coerceIn(0.0, 86400.0)

    private fun checkOwner(owner: Long) = synchronized(stateLock) {
        AccountFence.requireCurrent(AccountVersion(storedSession?.identity?.userId, owner),
            AccountVersion(session.value?.userId, epoch.value),
            AccountVersion(loadSession()?.identity?.userId, store.read("epoch")?.toLongOrNull() ?: 0L))
    }
    private fun requireProcessingConsent(path: String, body: JSONObject?) {
        val route = path.substringBefore('?').removePrefix("/")
        if ((route in PRIVATE_PROCESSING_ROUTES || (route == "api/voice-tool" && body?.optString("tool") == "run_debate")) &&
            !allowsExternalProcessing()) throw ApiException(403, "consent_required")
    }
    private fun addLocale(body: JSONObject): JSONObject = body.apply {
        if (!has("language")) put("language", language)
        if (!has("locale")) put("locale", locale)
        if (!has("country")) country?.let { put("country", it) }
    }
    private fun queryPath(path: String, values: Map<String, String?>): String {
        val builder = apiBase.resolve("/$path")!!.newBuilder()
        for ((key, value) in values) if (!value.isNullOrEmpty()) builder.addQueryParameter(key, value)
        return builder.build().let { it.encodedPath.removePrefix("/") + (it.encodedQuery?.let { query -> "?$query" } ?: "") }
    }
    private fun validId(value: String): String = AuthGuards.uuid(value) ?: throw ApiException(404, "not_found")
    private fun memoryPreferenceKey(userId: String): String = "memory-opt-in:" + MessageDigest.getInstance("SHA-256")
        .digest(userId.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }

    private fun accept(value: StoredSession) {
        checkOwner(epoch.value)
        val next = epoch.value + 1
        store.writeMany(mapOf("session" to value.toJson().toString(), "epoch" to next.toString()), setOf("oauth-attempt"))
        storedSession?.takeIf { it.identity.userId != value.identity.userId }?.let { notifyOutgoingAccount(it) }
        storedSession = value
        mutableSession.value = value.identity
        mutableLastError.value = null
        mutableEpoch.value = next
        quotaStore.reset()
    }

    private fun loadSession(): StoredSession? = store.read("session")?.let { raw -> try {
        val json = JSONObject(raw)
        val id = json.stringOrNull("userId") ?: return@let null
        val access = json.stringOrNull("access") ?: return@let null
        val refresh = json.stringOrNull("refresh") ?: return@let null
        StoredSession(access, refresh, AccountSession(id, json.stringOrNull("displayName"), json.stringOrNull("provider"), json.getLong("expiresAt")))
    } catch (_: Exception) { null } }

    private fun pendingSignIn(): PendingSignIn? = store.read("oauth-attempt")?.let { raw -> try {
        val json = JSONObject(raw)
        PendingSignIn(json.getString("verifier"), json.getString("state"), json.getLong("epoch"), json.getLong("createdAt"))
    } catch (_: Exception) { null } }

    private class StoredSession(val access: String, val refresh: String, val identity: AccountSession) {
        fun toJson(): JSONObject = JSONObject().put("access", access).put("refresh", refresh).put("userId", identity.userId)
            .put("displayName", identity.displayName).put("provider", identity.provider).put("expiresAt", identity.expiresAt)
        override fun toString(): String = "StoredSession(redacted)"
    }
    private class PendingSignIn(val verifier: String, val state: String, val epoch: Long, val createdAt: Long) {
        fun toJson(): JSONObject = JSONObject().put("verifier", verifier).put("state", state).put("epoch", epoch).put("createdAt", createdAt)
        override fun toString(): String = "PendingSignIn(redacted)"
    }

    data class JsonReply(val json: JSONObject, val status: Int, val headers: Map<String, List<String>>)
    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private const val MAX_JSON_BYTES = 2 * 1024 * 1024
        private const val MAX_AUDIO_BYTES = 20 * 1024 * 1024
        private val RESERVED_HEADERS = setOf("authorization", "x-bobby-device", "x-bobby-platform", "x-bobby-memory-opt-in", "origin", "host")
        private val PRIVATE_PROCESSING_ROUTES = setOf("api/desk-debate", "api/bobby-voice-free", "api/bobby-voice", "api/memory", "api/bobby-asset-search")
        private fun supportedLanguage(value: String): String = BobbyLocales.language(value)
        private fun defaultLocale(language: String): String = BobbyLocales.defaultLocale(language)
    }
}
