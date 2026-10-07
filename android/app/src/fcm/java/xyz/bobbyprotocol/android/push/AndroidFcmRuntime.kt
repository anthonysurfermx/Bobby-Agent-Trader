package xyz.bobbyprotocol.android.push

import android.app.NotificationManager
import android.content.Context
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailabilityLight
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import xyz.bobbyprotocol.android.BuildConfig
import xyz.bobbyprotocol.android.data.AccountChangedException
import xyz.bobbyprotocol.android.data.AccountCleanup
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.data.BobbyRepository
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

internal object FcmWork {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val mutex = Mutex()
    @Volatile var active: AndroidFcmRuntime? = null
}

private enum class BackendReadiness { READY, UNAVAILABLE, OPTED_OUT }

internal class AndroidFcmRuntime(private val dependencies: PushDependencies, attachHooks: Boolean = true) : PushRuntime {
    private val context = dependencies.context.applicationContext
    private val repository = dependencies.repository
    private val configuration = dependencies.configuration
    private val store = PushStore(context)
    private val current = MutableStateFlow(PushStatus.NOT_ELIGIBLE)
    override val status: StateFlow<PushStatus> = current
    @Volatile private var closed = false
    private var refusedDigest: String? = null

    private val outgoingHook: (AccountCleanup) -> Unit = { cleanup ->
        // Capture the old receipt before a newer owner's registration can replace it.
        store.binding()?.takeIf { it.owner == cleanup.ownerUserId }?.let { binding ->
            FcmWork.scope.launch { FcmWork.mutex.withLock {
                runCatching { cleanup.revokePushDevice(binding.id, binding.revision, binding.proof); store.drop(binding) }
                if (repository.session.value == null) unregisterExisting()
            } }
        }
    }
    private val deletedHook: (String) -> Unit = { owner ->
        store.forget(owner)
        FcmWork.scope.launch { FcmWork.mutex.withLock { if (repository.session.value == null) unregisterExisting() } }
    }
    init {
        if (attachHooks) {
            repository.onBeforeAccountChange = outgoingHook
            repository.onAccountDeleted = deletedHook
        }
    }

    override fun refresh() {
        if (closed) return
        dependencies.scope.launch { FcmWork.mutex.withLock {
            if (closed) return@withLock
            try {
                val ticket = eligibility()
                if (!ticket.eligible) {
                    current.value = PushStatus.NOT_ELIGIBLE
                    revokeCurrentBinding(ticket)
                    return@withLock
                }
                if (!googleServicesAvailable(context)) { current.value = PushStatus.NO_GOOGLE_SERVICES; return@withLock }
                if (!canRegister(ticket)) return@withLock
                ensureCurrent(ticket)
                val messaging = initializeMessaging()
                val binding = store.binding()
                if (binding != null && binding.owner == ticket.ownerUserId && binding.epoch == ticket.epoch &&
                    binding.project == configuration.projectId && System.currentTimeMillis() - binding.syncedAt in 0..86_399_999L) {
                    current.value = PushStatus.REGISTERED
                    return@withLock
                }
                current.value = PushStatus.REGISTERING
                messaging.register().await()
                ensureCurrent(ticket)
                // onRegistered delivers the actual FID; no deprecated token is synthesized here.
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: AccountChangedException) { current.value = PushStatus.NOT_ELIGIBLE }
            catch (_: Exception) { current.value = PushStatus.FAILED }
        } }
    }

    internal fun registered(fid: String) {
        if (closed || !PushPolicy.validFid(fid)) return
        FcmWork.scope.launch { FcmWork.mutex.withLock {
            val ticket = eligibility()
            if (!ticket.eligible) return@withLock
            try {
                if (!canRegister(ticket)) return@withLock
                ensureCurrent(ticket)
                bindFid(fid, ticket, retries = 1)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: AccountChangedException) { current.value = PushStatus.NOT_ELIGIBLE }
            catch (_: Exception) { current.value = PushStatus.FAILED }
        } }
    }

    private suspend fun bindFid(fid: String, ticket: PushEligibility, retries: Int) {
        ensureCurrent(ticket)
        val owner = ticket.ownerUserId ?: throw AccountChangedException()
        val binding = store.binding()
        val body = JSONObject().put("provider", "fcm").put("installationId", repository.installationId)
            .put("fcmInstallationId", fid).put("fcmProjectId", configuration.projectId)
            .put("permissionState", "authorized").put("appBuild", BuildConfig.VERSION_CODE)
        binding?.let { body.put("registrationId", it.id).put("expectedBindingRevision", it.revision) }
        val digest = PushStore.digest(owner, body, binding?.proof)
        if (refusedDigest == digest) { current.value = PushStatus.FAILED; return }
        val headers = proofHeaders(binding?.proof) + ("Idempotency-Key" to store.operationKey(owner, digest))
        current.value = PushStatus.REGISTERING
        try {
            val response = repository.requestForAccount(owner, ticket.epoch, "api/briefing-device", "POST", body, headers)
            ensureCurrent(ticket)
            val id = response.optString("registrationId")
            val revision = (response.opt("bindingRevision") as? Number)?.toLong() ?: 0
            val proof = response.optString("installationCredential")
            if (!PushPolicy.validUuid(id) || revision <= 0 || !proof.matches(Regex("[A-Za-z0-9_-]{43}"))) {
                throw ApiException(502, "invalid_push_receipt")
            }
            store.bind(PushBinding(owner, ticket.epoch, id, revision, proof, PushStore.hash(fid), configuration.projectId, System.currentTimeMillis()))
            current.value = PushStatus.REGISTERED
        } catch (error: ApiException) {
            // Lost/5xx replies retain the exact idempotency key to recover its rotated proof.
            if (error.status == 409 && retries > 0 && binding != null) {
                val revision = (error.payload?.opt("bindingRevision") as? Number)?.toLong()
                if (revision != null && revision > 0 && revision != binding.revision) {
                    store.bind(PushBinding(binding.owner, binding.epoch, binding.id, revision, binding.proof,
                        binding.fidHash, binding.project, binding.syncedAt))
                    return bindFid(fid, ticket, retries - 1)
                }
            }
            if (error.status == 404 && retries > 0 && binding != null) {
                store.drop(binding)
                return bindFid(fid, ticket, retries - 1)
            }
            if (error.status in setOf(400, 403, 404, 409)) { store.clearPending(); refusedDigest = digest }
            throw error
        }
    }

    private suspend fun backendReady(ticket: PushEligibility): BackendReadiness {
        val owner = ticket.ownerUserId ?: return BackendReadiness.OPTED_OUT
        val capability = repository.requestForAccount(owner, ticket.epoch, "api/briefing-device", headers = proofHeaders(null))
        ensureCurrent(ticket)
        if (!PushPolicy.capability(capability, configuration)) return BackendReadiness.UNAVAILABLE
        val reply = repository.requestForAccount(owner, ticket.epoch, "api/briefing-settings")
        ensureCurrent(ticket)
        return if (PushPolicy.serverOptIn(reply)) BackendReadiness.READY else BackendReadiness.OPTED_OUT
    }

    private suspend fun canRegister(ticket: PushEligibility): Boolean = when (backendReady(ticket)) {
        BackendReadiness.READY -> true
        BackendReadiness.UNAVAILABLE -> { current.value = PushStatus.BACKEND_UNAVAILABLE; false }
        BackendReadiness.OPTED_OUT -> {
            current.value = PushStatus.NOT_ELIGIBLE
            revokeCurrentBinding(ticket)
            false
        }
    }

    private suspend fun revokeCurrentBinding(ticket: PushEligibility) {
        val binding = store.binding()
        if (ticket.ownerUserId != null && binding?.owner == ticket.ownerUserId) {
            runCatching {
                repository.requestForAccount(binding.owner, ticket.epoch, "api/briefing-device", "DELETE",
                    JSONObject().put("registrationId", binding.id).put("expectedBindingRevision", binding.revision),
                    headers = proofHeaders(binding.proof))
                store.drop(binding)
            }
        }
        // Retain a failed server receipt for safe rebind, but never retain local delivery eligibility.
        unregisterExisting()
    }

    private fun eligibility() = PushDeviceState.eligibility(context, repository)
    private fun ensureCurrent(ticket: PushEligibility) {
        val now = eligibility()
        if (!now.eligible || !now.sameOwner(ticket)) throw AccountChangedException()
    }
    private fun proofHeaders(proof: String?) = buildMap {
        put("X-Bobby-Push-Client", "2")
        proof?.let { put("X-Bobby-Installation-Proof", it) }
    }

    private fun initializeMessaging(): FirebaseMessaging {
        // Called only after explicit local eligibility AND the real matching server capability/settings.
        val existing = FirebaseApp.getApps(context).firstOrNull { it.name == FirebaseApp.DEFAULT_APP_NAME }
        val app = existing ?: FirebaseApp.initializeApp(context, FirebaseOptions.Builder()
            .setProjectId(configuration.projectId).setApplicationId(configuration.applicationId)
            .setGcmSenderId(configuration.senderId).setApiKey(configuration.apiKey).build())
        check(app.options.projectId == configuration.projectId && app.options.applicationId == configuration.applicationId &&
            app.options.gcmSenderId == configuration.senderId && app.options.apiKey == configuration.apiKey)
        app.setDataCollectionDefaultEnabled(false)
        return FirebaseMessaging.getInstance().apply {
            isAutoInitEnabled = false
            setDeliveryMetricsExportToBigQuery(false)
            setNotificationDelegationEnabled(false)
        }
    }

    private suspend fun unregisterExisting() {
        // Never initialize the SDK as part of disabling notifications, sign-out or deletion.
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(2101)
        if (FirebaseApp.getApps(context).none { it.name == FirebaseApp.DEFAULT_APP_NAME }) return
        runCatching { FirebaseMessaging.getInstance().apply { isAutoInitEnabled = false }.unregister().await() }
    }

    override fun close() {
        closed = true
        if (repository.onBeforeAccountChange === outgoingHook) repository.onBeforeAccountChange = null
        if (repository.onAccountDeleted === deletedHook) repository.onAccountDeleted = null
        if (FcmWork.active === this) FcmWork.active = null
    }
    companion object {
        fun googleServicesAvailable(context: Context): Boolean =
            GoogleApiAvailabilityLight.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }
}

private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { continuation ->
    addOnSuccessListener { if (continuation.isActive) continuation.resume(it) }
    addOnFailureListener { if (continuation.isActive) continuation.resumeWithException(it) }
    addOnCanceledListener { continuation.cancel() }
}
