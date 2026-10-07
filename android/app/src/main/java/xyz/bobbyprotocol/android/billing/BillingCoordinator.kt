package xyz.bobbyprotocol.android.billing

import com.revenuecat.purchases.PurchasesErrorCode
import com.revenuecat.purchases.PurchasesException
import com.revenuecat.purchases.PurchasesTransactionException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.UUID

internal interface BillingAccounts {
    val changes: Flow<BillingOwner?>
    fun owner(): BillingOwner?
    fun processingAllowed(): Boolean = true
    suspend fun request(owner: BillingOwner, method: String, body: JSONObject? = null): JSONObject
}

/** Serializes SDK identity changes with store sheets; every result also checks the account epoch. */
internal class BillingCoordinator(
    private val client: BillingClient,
    private val accounts: BillingAccounts,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher,
    private val apiKey: String?,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val journal: BillingJournal = MemoryBillingJournal(),
) {
    companion object { private val sdkMutex = Mutex() }
    private val mutableState = MutableStateFlow(BillingState(
        offeringsStatus = if (apiKey == null) BillingOfferingsStatus.NOT_CONFIGURED else BillingOfferingsStatus.IDLE,
        message = if (apiKey == null) BillingMessage.CONFIGURATION_MISSING else null,
    ))
    val state = mutableState.asStateFlow()
    private val mutex = sdkMutex
    private var observedOwner = accounts.owner()
    private var started = false
    private var listenerAttached = false
    private var customer: BillingCustomer? = null
    private var confirmedSync: Pair<BillingOwner, Long?>? = null

    init {
        scope.launch(dispatcher) {
            accounts.changes.collect { owner ->
                if (owner != observedOwner) {
                    invalidate(owner)
                    if (started) identifyInternal(owner)
                }
            }
        }
    }

    /** Called after the risk notice is accepted. Construction alone never configures the SDK. */
    suspend fun identify(owner: BillingOwner?) = withContext(dispatcher) {
        started = true
        if (owner != observedOwner) invalidate(owner)
        identifyInternal(owner)
    }

    private suspend fun identifyInternal(owner: BillingOwner?) = mutex.withLock {
        if (!current(owner) || apiKey == null || !accounts.processingAllowed()) return@withLock
        try {
            if (owner == null) {
                if (client.configured && !client.anonymous) withContext(NonCancellable) { client.logOut() }
                return@withLock
            }
            if (!refreshAccess(owner)) return@withLock
            if (!state.value.restoreAllowed && state.value.eligibility == BillingEligibility.ALREADY_SUBSCRIBED) return@withLock
            if (!ensureIdentity(owner)) return@withLock
            if (current(owner) && state.value.restoreAllowed) reconcile(owner)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { if (owner != null) message(owner, BillingMessage.IDENTITY_UNAVAILABLE) }
    }

    suspend fun loadOfferings() = withContext(dispatcher) {
        started = true
        val owner = accounts.owner()
        if (owner == null) {
            mutableState.value = state.value.copy(eligibility = BillingEligibility.NEEDS_SIGN_IN,
                message = BillingMessage.SIGN_IN_FIRST)
            return@withContext
        }
        if (apiKey == null || !accounts.processingAllowed()) return@withContext
        mutex.lock()
        try {
            if (!refreshAccess(owner)) return@withContext
            if (!state.value.restoreAllowed && state.value.eligibility == BillingEligibility.ALREADY_SUBSCRIBED) return@withContext
            if (!ensureIdentity(owner)) return@withContext
            mutableState.value = state.value.copy(offeringsStatus = BillingOfferingsStatus.LOADING, message = null)
            val packages = client.offerings()
            if (!current(owner)) return@withContext
            mutableState.value = state.value.copy(packages = packages,
                offeringsStatus = if (packages.isEmpty()) BillingOfferingsStatus.MISSING else BillingOfferingsStatus.READY,
                message = if (packages.isEmpty()) BillingMessage.PRODUCTS_UNAVAILABLE else null)
            refreshAccess(owner)
            if (current(owner) && state.value.restoreAllowed) reconcile(owner)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            if (current(owner)) mutableState.value = state.value.copy(packages = emptyList(),
                offeringsStatus = BillingOfferingsStatus.FAILED, message = BillingMessage.PRODUCTS_UNAVAILABLE)
        } finally { mutex.unlock() }
    }

    suspend fun purchase(packageId: String, launchPurchase: suspend ((String) -> Unit) -> BillingCustomer): BillingOutcome =
        operation { owner ->
            val selected = state.value.packages.find { it.identifier == packageId }
            if (selected?.rawProductId == null || selected.basePlanId == null) {
                message(owner, BillingMessage.PRODUCTS_UNAVAILABLE)
                return@operation BillingOutcome.UNAVAILABLE
            }
            if (!refreshAccess(owner)) return@operation BillingOutcome.UNAVAILABLE
            if (state.value.eligibility == BillingEligibility.ALREADY_SUBSCRIBED) {
                message(owner, BillingMessage.ALREADY_SUBSCRIBED)
                return@operation BillingOutcome.ALREADY_SUBSCRIBED
            }
            var saved = journal.read(owner.userId)
            if (saved?.launchStarted == true || state.value.purchasePending) {
                if (saved?.attemptId != null) reconcileAttempt(owner, saved)
                message(owner, BillingMessage.PURCHASE_PENDING)
                return@operation BillingOutcome.PENDING
            }
            if (state.value.eligibility != BillingEligibility.READY) return@operation BillingOutcome.UNAVAILABLE
            if (!ensureIdentity(owner)) return@operation BillingOutcome.NEEDS_SIGN_IN
            if (saved == null) {
                saved = PendingPurchase(UUID.randomUUID().toString(), selected.rawProductId, selected.basePlanId, selected.offerId)
                journal.write(owner.userId, saved)
            }
            if (saved.productId != selected.rawProductId || saved.basePlanId != selected.basePlanId || saved.offerId != selected.offerId) {
                message(owner, BillingMessage.PURCHASE_PENDING)
                return@operation BillingOutcome.PENDING
            }
            val reserved = accounts.request(owner, "POST", JSONObject().put("action", "purchase-reserve").put("provider", "google")
                .put("operationId", saved.operationId).put("productId", saved.productId).put("basePlanId", saved.basePlanId)
                .put("offerId", saved.offerId ?: JSONObject.NULL))
            if (!current(owner) || !accounts.processingAllowed()) return@operation BillingOutcome.NEEDS_SIGN_IN
            val attempt = reserved.optJSONObject("attempt") ?: return@operation BillingOutcome.PENDING
            val attemptId = canonicalId(attempt.opt("id")) ?: return@operation BillingOutcome.PENDING
            if (attempt.opt("provider") != "google" || attempt.opt("productId") != saved.productId ||
                attempt.opt("basePlanId") != saved.basePlanId || (attempt.opt("offerId") as? String) != saved.offerId) return@operation BillingOutcome.PENDING
            saved = saved.copy(attemptId = attemptId)
            journal.write(owner.userId, saved)
            if (attempt.opt("phase") != "reserved") {
                reconcileAttempt(owner, saved)
                message(owner, BillingMessage.PURCHASE_PENDING)
                return@operation BillingOutcome.PENDING
            }
            val start = accounts.request(owner, "POST", JSONObject().put("action", "purchase-start").put("attemptId", attemptId)
                .put("operationId", saved.dispatchOperationId))
            // A lost response never authorizes a second SDK launch. The server's one-time permit is durable.
            if (!current(owner) || !accounts.processingAllowed()) return@operation BillingOutcome.NEEDS_SIGN_IN
            if (start.opt("launchAllowed") != true || start.optJSONObject("attempt")?.opt("id") != attemptId) {
                message(owner, BillingMessage.PURCHASE_PENDING)
                return@operation BillingOutcome.PENDING
            }
            saved = saved.copy(launchStarted = true)
            journal.write(owner.userId, saved)
            mutableState.value = state.value.copy(purchasePending = true, purchaseAttemptId = attemptId)
            val original = saved
            val info: BillingCustomer
            try {
                info = withContext(NonCancellable) { launchPurchase { token ->
                    require(token.length in 1..4096 && token.matches(Regex("[A-Za-z0-9._~+/\\-]+={0,2}")))
                    // Persist even if logout, cancellation or a failed freshCustomer happens after Play succeeds.
                    journal.write(owner.userId, original.copy(purchaseToken = token))
                } }
            } catch (error: Exception) {
                if (!current(owner)) return@operation BillingOutcome.NEEDS_SIGN_IN
                val recovered = if (accounts.processingAllowed()) runCatching { reconcileAttempt(owner, journal.read(owner.userId) ?: original) }.getOrNull() else null
                val outcome = errorOutcome(error)
                if (outcome != BillingOutcome.CANCELLED && recovered != null && BillingPolicy.attemptConfirmed(recovered, attemptId, nowMillis())) {
                    message(owner, BillingMessage.SUBSCRIBED)
                    return@operation BillingOutcome.SUBSCRIBED
                }
                if (outcome != BillingOutcome.CANCELLED) message(owner, if (outcome == BillingOutcome.PENDING) BillingMessage.PURCHASE_PENDING else errorMessage(error))
                return@operation outcome
            }
            if (!current(owner)) return@operation BillingOutcome.NEEDS_SIGN_IN
            if (!accounts.processingAllowed()) return@operation BillingOutcome.UNAVAILABLE
            recordCustomer(info)
            val receipt = journal.read(owner.userId) ?: original
            val body = reconcileAttempt(owner, receipt) ?: return@operation BillingOutcome.PENDING
            if (BillingPolicy.attemptConfirmed(body, attemptId, nowMillis())) {
                message(owner, BillingMessage.SUBSCRIBED)
                BillingOutcome.SUBSCRIBED
            } else {
                message(owner, BillingMessage.SERVER_CONFIRMATION_PENDING)
                BillingOutcome.PENDING
            }
        }

    private fun canonicalId(value: Any?): String? = (value as? String)?.takeIf {
        runCatching { UUID.fromString(it).toString() == it }.getOrDefault(false)
    }

    private suspend fun reconcileAttempt(owner: BillingOwner, saved: PendingPurchase): JSONObject? {
        val id = saved.attemptId ?: return null
        if (!current(owner) || !accounts.processingAllowed()) return null
        val request = JSONObject().put("action", if (saved.purchaseToken == null) "purchase-reconcile" else "purchase-submit")
            .put("attemptId", id)
        saved.purchaseToken?.let { request.put("purchaseToken", it) }
        val body = accounts.request(owner, "POST", request)
        if (!current(owner) || !accounts.processingAllowed()) return null
        val attempt = body.optJSONObject("purchaseAttempt") ?: return body
        if (attempt.opt("id") != id || attempt.opt("provider") != "google") return null
        if (attempt.opt("phase") in setOf("closed", "terminal_no_charge")) journal.remove(owner.userId)
        mutableState.value = state.value.copy(serverPro = BillingPolicy.serverConfirmed(body),
            subscriptionProvider = body.optJSONObject("subscription")?.opt("provider") as? String,
            purchaseAttemptId = id, purchasePending = attempt.opt("phase") !in setOf("closed", "terminal_no_charge"))
        return body
    }

    suspend fun restore(): BillingOutcome = operation { owner ->
        if (!refreshAccess(owner)) return@operation BillingOutcome.UNAVAILABLE
        if (!state.value.restoreAllowed) {
            if (state.value.eligibility == BillingEligibility.ALREADY_SUBSCRIBED) {
                message(owner, BillingMessage.ALREADY_SUBSCRIBED)
                return@operation BillingOutcome.ALREADY_SUBSCRIBED
            }
            return@operation BillingOutcome.UNAVAILABLE
        }
        if (!ensureIdentity(owner)) return@operation BillingOutcome.NEEDS_SIGN_IN
        val info = withContext(NonCancellable) { client.restore() }
        if (!current(owner)) return@operation BillingOutcome.NEEDS_SIGN_IN
        if (!accounts.processingAllowed()) return@operation BillingOutcome.UNAVAILABLE
        recordCustomer(info)
        val outcome = confirmWithServer(owner, info)
        if (state.value.purchasePending && outcome != BillingOutcome.SUBSCRIBED) {
            message(owner, BillingMessage.PURCHASE_PENDING)
            return@operation BillingOutcome.PENDING
        }
        if (!info.active && outcome != BillingOutcome.SUBSCRIBED && outcome != BillingOutcome.FAILED) {
            message(owner, BillingMessage.NOTHING_TO_RESTORE)
            BillingOutcome.NOTHING_TO_RESTORE
        } else outcome
    }

    private suspend fun operation(block: suspend (BillingOwner) -> BillingOutcome): BillingOutcome = withContext(dispatcher) {
        started = true
        val owner = accounts.owner() ?: run {
            mutableState.value = state.value.copy(message = BillingMessage.SIGN_IN_FIRST)
            return@withContext BillingOutcome.NEEDS_SIGN_IN
        }
        if (apiKey == null || !accounts.processingAllowed()) return@withContext BillingOutcome.UNAVAILABLE
        if (!mutex.tryLock()) return@withContext BillingOutcome.BUSY
        try {
            if (!current(owner)) return@withContext BillingOutcome.NEEDS_SIGN_IN
            mutableState.value = state.value.copy(isBusy = true, message = null)
            block(owner)
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (error: Exception) {
            if (!current(owner)) return@withContext BillingOutcome.NEEDS_SIGN_IN
            val outcome = errorOutcome(error)
            if (outcome != BillingOutcome.CANCELLED) message(owner, errorMessage(error))
            outcome
        } finally {
            if (current(owner)) mutableState.value = state.value.copy(isBusy = false)
            mutex.unlock()
        }
    }

    private suspend fun ensureIdentity(owner: BillingOwner): Boolean {
        if (!current(owner) || !accounts.processingAllowed()) return false
        if (!client.configured) {
            client.configure(apiKey ?: return false, owner.userId)
        }
        if (!listenerAttached) {
            client.setListener {
                // Ignore callback payloads that can have been queued before a login. Fetch the current
                // subscriber under the same identity lock used by purchase and restore.
                scope.launch(dispatcher) {
                    if (!mutex.tryLock()) return@launch
                    try {
                        val currentOwner = accounts.owner() ?: return@launch
                        if (accounts.processingAllowed() && client.userId == currentOwner.userId && state.value.restoreAllowed) reconcile(currentOwner)
                    } catch (cancelled: CancellationException) { throw cancelled }
                    catch (_: Exception) { /* Explicit refresh/restore remains retryable. */ }
                    finally { mutex.unlock() }
                }
            }
            listenerAttached = true
        }
        if (client.userId != owner.userId) withContext(NonCancellable) { client.logIn(owner.userId) }
        if (!current(owner) || client.userId != owner.userId) return false
        mutableState.value = state.value.copy(configured = true, identityReady = true)
        return true
    }

    private suspend fun refreshAccess(owner: BillingOwner): Boolean {
        val body = try { accounts.request(owner, "GET") }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            if (current(owner)) mutableState.value = state.value.copy(serverPro = null, googlePaymentsReady = false,
                restoreAllowed = false, eligibility = BillingEligibility.UNKNOWN, message = BillingMessage.NETWORK_UNAVAILABLE)
            return false
        }
        if (!current(owner) || !accounts.processingAllowed()) return false
        val access = BillingPolicy.access(body, nowMillis())
        if (access == null) {
            mutableState.value = state.value.copy(serverPro = null, googlePaymentsReady = false,
                restoreAllowed = false, eligibility = BillingEligibility.UNKNOWN, message = BillingMessage.GOOGLE_PAYMENTS_NOT_READY)
            return false
        }
        val attempt = body.optJSONObject("purchaseAttempt")
        val saved = journal.read(owner.userId)
        val canResumeUnstarted = attempt?.opt("phase") == "reserved" && saved != null && !saved.launchStarted &&
            attempt.opt("provider") == "google" && attempt.opt("productId") == saved.productId && attempt.opt("basePlanId") == saved.basePlanId &&
            (attempt.opt("offerId") as? String) == saved.offerId
        val pending = attempt != null && attempt.opt("phase") !in setOf("closed", "terminal_no_charge") && !canResumeUnstarted || saved?.launchStarted == true
        mutableState.value = state.value.copy(serverPro = access.pro, subscriptionProvider = access.provider,
            purchasePending = pending, purchaseAttemptId = canonicalId(attempt?.opt("id")) ?: saved?.attemptId,
            googlePaymentsReady = access.googleReady, eligibility = access.eligibility,
            restoreAllowed = access.restoreAllowed,
            message = if (!access.googleReady) BillingMessage.GOOGLE_PAYMENTS_NOT_READY else state.value.message)
        return true
    }

    private suspend fun reconcile(owner: BillingOwner) {
        if (!accounts.processingAllowed() || !state.value.restoreAllowed) return
        val saved = journal.read(owner.userId)
        if (saved?.attemptId != null) {
            try { reconcileAttempt(owner, saved) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { message(owner, BillingMessage.SERVER_CONFIRMATION_PENDING) }
        }
        val info = client.freshCustomer()
        if (!current(owner) || !accounts.processingAllowed() || client.userId != owner.userId) return
        recordCustomer(info)
        if (confirmedSync != (owner to info.expiryMillis) || !info.active) confirmWithServer(owner, info, showSuccess = false)
    }

    private suspend fun confirmWithServer(owner: BillingOwner, info: BillingCustomer, showSuccess: Boolean = true): BillingOutcome {
        if (!current(owner)) return BillingOutcome.NEEDS_SIGN_IN
        if (!accounts.processingAllowed()) return BillingOutcome.UNAVAILABLE
        val body = try { accounts.request(owner, "POST", JSONObject().put("action", "revenuecat-sync")) }
        catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            message(owner, BillingMessage.SERVER_CONFIRMATION_PENDING)
            return BillingOutcome.FAILED
        }
        if (!current(owner)) return BillingOutcome.NEEDS_SIGN_IN
        if (!accounts.processingAllowed()) return BillingOutcome.UNAVAILABLE
        val tier = body.optJSONObject("access")?.opt("tier") as? String
        if (body.opt("ok") != true || tier !in setOf("free", "pro", "anon")) {
            message(owner, BillingMessage.SERVER_CONFIRMATION_PENDING)
            return BillingOutcome.FAILED
        }
        val pro = BillingPolicy.serverConfirmed(body)
        val provider = (body.optJSONObject("subscription")?.opt("provider") as? String)
        mutableState.value = state.value.copy(serverPro = pro, subscriptionProvider = provider,
            restoreAllowed = state.value.restoreAllowed && (provider == null || provider == "google"),
            eligibility = if (pro) BillingEligibility.ALREADY_SUBSCRIBED else if (state.value.googlePaymentsReady)
                BillingEligibility.READY else BillingEligibility.NOT_AVAILABLE)
        if (pro) {
            confirmedSync = owner to info.expiryMillis
            if (showSuccess && !BillingPolicy.googleSubscriptionConfirmed(body, nowMillis())) {
                // Pro for another reason (gifted days, a plan that is ending, another store) and Google
                // Play holds nothing for this account: that is an answer, not a confirmation still to come.
                // Asking again would say the same, so it must not read as "try again in a moment".
                if (!info.active) {
                    message(owner, BillingMessage.NOTHING_TO_RESTORE)
                    return BillingOutcome.NOTHING_TO_RESTORE
                }
                message(owner, BillingMessage.SERVER_CONFIRMATION_PENDING)
                return BillingOutcome.FAILED
            }
            if (showSuccess) message(owner, BillingMessage.SUBSCRIBED)
            return BillingOutcome.SUBSCRIBED
        }
        if (info.active) {
            message(owner, BillingMessage.SERVER_CONFIRMATION_PENDING)
            return BillingOutcome.FAILED
        }
        if (showSuccess) message(owner, BillingMessage.PURCHASE_PENDING)
        return BillingOutcome.PENDING
    }

    private fun recordCustomer(info: BillingCustomer) {
        customer = info
        mutableState.value = state.value.copy(customerActive = info.active)
    }

    private fun invalidate(owner: BillingOwner?) {
        observedOwner = owner
        customer = null
        confirmedSync = null
        client.clearPackages()
        mutableState.value = BillingState(configured = client.configured,
            offeringsStatus = if (apiKey == null) BillingOfferingsStatus.NOT_CONFIGURED else BillingOfferingsStatus.IDLE,
            eligibility = if (owner == null) BillingEligibility.NEEDS_SIGN_IN else BillingEligibility.UNKNOWN,
            message = if (apiKey == null) BillingMessage.CONFIGURATION_MISSING else null)
    }

    private fun current(owner: BillingOwner?): Boolean = accounts.owner() == owner && observedOwner == owner
    private fun message(owner: BillingOwner, message: BillingMessage) {
        if (current(owner)) mutableState.value = state.value.copy(message = message)
    }

    fun managementUrl(): String? = BillingPolicy.managementUrl(state.value.subscriptionProvider, customer?.managementUrl)
    fun clearMessage() { mutableState.value = state.value.copy(message = null) }
    fun close() { client.setListener(null) }

    private fun errorOutcome(error: Exception): BillingOutcome = when {
        error is PurchasesTransactionException && error.userCancelled -> BillingOutcome.CANCELLED
        error is PurchasesException && error.code == PurchasesErrorCode.PurchaseCancelledError -> BillingOutcome.CANCELLED
        error is PurchasesException && error.code == PurchasesErrorCode.PaymentPendingError -> BillingOutcome.PENDING
        else -> BillingOutcome.FAILED
    }

    private fun errorMessage(error: Exception): BillingMessage = when ((error as? PurchasesException)?.code) {
        PurchasesErrorCode.PaymentPendingError -> BillingMessage.PURCHASE_PENDING
        PurchasesErrorCode.NetworkError -> BillingMessage.NETWORK_UNAVAILABLE
        PurchasesErrorCode.StoreProblemError, PurchasesErrorCode.PurchaseNotAllowedError -> BillingMessage.STORE_UNAVAILABLE
        PurchasesErrorCode.ReceiptAlreadyInUseError -> BillingMessage.PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT
        PurchasesErrorCode.ProductAlreadyPurchasedError -> BillingMessage.ALREADY_SUBSCRIBED
        else -> BillingMessage.PURCHASE_FAILED
    }
}
