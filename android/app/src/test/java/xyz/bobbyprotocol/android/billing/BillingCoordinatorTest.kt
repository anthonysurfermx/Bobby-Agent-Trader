package xyz.bobbyprotocol.android.billing

import com.revenuecat.purchases.PurchasesError
import com.revenuecat.purchases.PurchasesErrorCode
import com.revenuecat.purchases.PurchasesTransactionException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BillingCoordinatorTest {
    @Test fun constructionDoesNotConfigureOrReachTheNetwork() = runTest {
        val fixture = fixture()
        runCurrent()
        assertFalse(fixture.client.configured)
        assertTrue(fixture.accounts.requests.isEmpty())
    }

    @Test fun callsBeforeConsentNeverConfigureSdkOrPurchase() = runTest {
        val fixture = fixture()
        fixture.accounts.consented = false
        fixture.coordinator.identify(fixture.accounts.owner())
        fixture.coordinator.loadOfferings()
        var launched = false
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.purchase("monthly") { launched = true; BillingCustomer(true, 2000, null) })
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.restore())
        assertFalse(launched)
        assertEquals(0, fixture.client.restoreCalls)
        assertFalse(fixture.client.configured)
        assertTrue(fixture.accounts.requests.isEmpty())
    }

    @Test fun serverMustConfirmSdkEntitlement() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.syncTier = "free"
        val outcome = fixture.coordinator.purchase("monthly") { it("valid-play-token"); BillingCustomer(true, 2000, null) }
        assertEquals(BillingOutcome.PENDING, outcome)
        assertTrue(fixture.coordinator.state.value.customerActive)
        assertFalse(fixture.coordinator.state.value.isPro)
        assertEquals(BillingMessage.SERVER_CONFIRMATION_PENDING, fixture.coordinator.state.value.message)
    }

    @Test fun proFromAnotherProviderDoesNotConfirmPlayPurchase() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.syncTier = "pro"
        fixture.accounts.syncProvider = "stripe"
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.purchase("monthly") { it("valid-play-token"); BillingCustomer(true, 2000, null) })
        assertTrue(fixture.coordinator.state.value.isPro)
        assertEquals("stripe", fixture.coordinator.state.value.subscriptionProvider)
        assertEquals(BillingMessage.SERVER_CONFIRMATION_PENDING, fixture.coordinator.state.value.message)
    }

    @Test fun proGrantDoesNotClaimRestoredGoogleSubscription() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.syncTier = "pro"
        fixture.accounts.syncProvider = null
        fixture.client.customer = BillingCustomer(true, 2000, null)
        assertEquals(BillingOutcome.FAILED, fixture.coordinator.restore())
        assertTrue(fixture.coordinator.state.value.isPro)
    }

    @Test fun aProAccountWithNoGooglePurchaseIsToldThereIsNothingToRestoreNotToTryAgain() = runTest {
        // Bobby Pro by invitations or a gift: the server says Pro, there is no subscription, and
        // Google Play holds nothing for this Google account. Every retry would say the same.
        val gifted = fixture()
        gifted.ready()
        gifted.accounts.syncTier = "pro"
        gifted.accounts.syncProvider = null
        gifted.client.customer = BillingCustomer(false, null, null)
        assertEquals(BillingOutcome.NOTHING_TO_RESTORE, gifted.coordinator.restore())
        assertEquals(1, gifted.client.restoreCalls)
        assertTrue(gifted.coordinator.state.value.isPro)
        assertEquals(BillingMessage.NOTHING_TO_RESTORE, gifted.coordinator.state.value.message)
        assertEquals("and asking again answers the same", BillingOutcome.NOTHING_TO_RESTORE, gifted.coordinator.restore())

        // A card plan that was cancelled and is still inside its paid period: the same answer.
        val ending = fixture()
        ending.accounts.subscription = JSONObject().put("provider", "stripe").put("status", "canceled").put("currentPeriodEnd", "1970-01-01T00:00:02Z")
        ending.ready()
        ending.accounts.syncTier = "pro"
        ending.accounts.syncProvider = "stripe"
        ending.client.customer = BillingCustomer(false, null, null)
        assertEquals(BillingOutcome.NOTHING_TO_RESTORE, ending.coordinator.restore())
        assertTrue(ending.coordinator.state.value.isPro)

        // The server could not be asked at all: that is still a failure, and worth another try.
        val offline = fixture()
        offline.ready()
        offline.accounts.failSync = true
        offline.client.customer = BillingCustomer(false, null, null)
        assertEquals(BillingOutcome.FAILED, offline.coordinator.restore())
    }

    @Test fun expiredGoogleMirrorCannotConfirmPurchaseEvenWhenGrantStillGivesPro() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.syncTier = "pro"
        fixture.accounts.syncPeriodEnd = "1970-01-01T00:00:00Z"
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.purchase("monthly") { it("valid-play-token"); BillingCustomer(true, 2000, null) })
        assertTrue(fixture.coordinator.state.value.isPro)
    }

    @Test fun userCancellationIsSilentAndClearsBusy() = runTest {
        val fixture = fixture()
        fixture.ready()
        val outcome = fixture.coordinator.purchase("monthly") {
            throw PurchasesTransactionException(PurchasesError(PurchasesErrorCode.PurchaseCancelledError), true)
        }
        assertEquals(BillingOutcome.CANCELLED, outcome)
        assertNull(fixture.coordinator.state.value.message)
        assertFalse(fixture.coordinator.state.value.isBusy)
        assertFalse(fixture.coordinator.state.value.isPro)
    }

    @Test fun storeSheetAllowsOnlyOnePurchaseAtATime() = runTest {
        val fixture = fixture()
        fixture.ready()
        val purchaseReply = CompletableDeferred<BillingCustomer>()
        var launches = 0
        val first = async { fixture.coordinator.purchase("monthly") { launches++; val info = purchaseReply.await(); it("valid-play-token"); info } }
        runCurrent()
        val second = fixture.coordinator.purchase("monthly") { launches++; BillingCustomer(true, 2000, null) }
        assertEquals(BillingOutcome.BUSY, second)
        assertEquals(1, launches)
        fixture.accounts.syncTier = "pro"
        purchaseReply.complete(BillingCustomer(true, 2000, null))
        assertEquals(BillingOutcome.SUBSCRIBED, first.await())
        assertFalse(fixture.coordinator.state.value.isBusy)
    }

    @Test fun activeCardSubscriptionPreventsLaunchingPlaySheet() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.subscription = JSONObject().put("provider", "stripe").put("status", "active")
            .put("currentPeriodEnd", JSONObject.NULL)
        var launched = false
        val outcome = fixture.coordinator.purchase("monthly") { launched = true; BillingCustomer(true, 2000, null) }
        assertEquals(BillingOutcome.ALREADY_SUBSCRIBED, outcome)
        assertFalse(launched)
    }

    @Test fun disablingNewSalesDoesNotDisableAnExistingPurchaseRestore() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.googleReady = false
        var launched = false
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.purchase("monthly") { launched = true; BillingCustomer(true, 2000, null) })
        assertEquals(BillingOutcome.NOTHING_TO_RESTORE, fixture.coordinator.restore())
        assertFalse(launched)
        assertEquals(1, fixture.client.restoreCalls)
        assertTrue(fixture.coordinator.state.value.canRestore)
        assertFalse(fixture.coordinator.state.value.canPurchase)
    }

    @Test fun existingGoogleOwnerCanRestoreWithSalesOffOnlyAfterFreshServerConfirmation() = runTest {
        val fixture = fixture()
        fixture.accounts.googleReady = false
        fixture.accounts.subscription = JSONObject().put("provider", "google").put("status", "active")
            .put("currentPeriodEnd", "1970-01-01T00:00:02Z")
        fixture.ready()
        fixture.accounts.syncTier = "pro"
        fixture.client.customer = BillingCustomer(true, 2000, null)
        assertEquals(BillingOutcome.SUBSCRIBED, fixture.coordinator.restore())
        assertTrue(fixture.coordinator.state.value.isPro)
        assertFalse(fixture.coordinator.state.value.googlePaymentsReady)
        assertFalse(fixture.coordinator.state.value.canPurchase)
        assertEquals(1, fixture.client.restoreCalls)
        assertEquals("google", fixture.coordinator.state.value.subscriptionProvider)
        assertEquals("revenuecat-sync", fixture.accounts.requests.last().second?.optString("action"))
    }

    @Test fun activeOtherProvidersNeverConfigureOrRestoreTheGoogleSdk() = runTest {
        for (provider in listOf("stripe", "apple", "unknown")) {
            val fixture = fixture()
            fixture.accounts.googleReady = false
            fixture.accounts.subscription = JSONObject().put("provider", provider).put("status", "active")
                .put("currentPeriodEnd", JSONObject.NULL)
            fixture.ready()
            assertEquals(BillingOutcome.ALREADY_SUBSCRIBED, fixture.coordinator.restore())
            assertFalse(fixture.client.configured)
            assertEquals(0, fixture.client.restoreCalls)
            assertFalse(fixture.coordinator.state.value.canRestore)
            assertFalse(fixture.accounts.requests.any { it.first == "POST" })
        }
    }

    @Test fun salesOffRestoreCannotConfirmProFromAnUnrelatedProvider() = runTest {
        val fixture = fixture()
        fixture.accounts.googleReady = false
        fixture.ready()
        fixture.accounts.syncTier = "pro"
        fixture.accounts.syncProvider = "stripe"
        fixture.client.customer = BillingCustomer(true, 2000, null)
        assertEquals(BillingOutcome.FAILED, fixture.coordinator.restore())
        assertTrue(fixture.coordinator.state.value.isPro)
        assertFalse(fixture.coordinator.state.value.canRestore)
        assertEquals(BillingMessage.SERVER_CONFIRMATION_PENDING, fixture.coordinator.state.value.message)
    }

    @Test fun salesOffRestoreDoesNotTrustAnOldGooglePeriodOrAProGrant() = runTest {
        val fixture = fixture()
        fixture.accounts.googleReady = false
        fixture.accounts.subscription = JSONObject().put("provider", "google").put("status", "active")
            .put("currentPeriodEnd", "1970-01-01T00:00:02Z")
        fixture.ready()
        fixture.accounts.syncTier = "pro"
        fixture.accounts.syncPeriodEnd = "1970-01-01T00:00:00Z"
        fixture.client.customer = BillingCustomer(true, 2000, null)
        assertEquals(BillingOutcome.FAILED, fixture.coordinator.restore())
        assertEquals(1, fixture.client.restoreCalls)
        assertEquals(BillingMessage.SERVER_CONFIRMATION_PENDING, fixture.coordinator.state.value.message)
    }

    @Test fun restoreNeedsConfiguredServerAndPublicKey() = runTest {
        val fixture = fixture()
        fixture.accounts.googleReady = false
        fixture.accounts.revenuecatReady = false
        fixture.ready()
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.restore())
        assertEquals(0, fixture.client.restoreCalls)
        val missingKey = fixture(null)
        assertEquals(BillingOutcome.UNAVAILABLE, missingKey.coordinator.restore())
        assertFalse(missingKey.client.configured)
        assertTrue(missingKey.accounts.requests.isEmpty())
    }

    @Test fun epochChangeDuringSalesOffRestoreDiscardsResultWithoutSyncingTheOldOwner() = runTest {
        val fixture = fixture()
        fixture.accounts.googleReady = false
        fixture.ready()
        val oldSyncs = fixture.accounts.requestOwners.count { it == BillingOwner("alice", 1) }
        val reply = CompletableDeferred<BillingCustomer>()
        fixture.client.restoreReply = reply
        val restore = async { fixture.coordinator.restore() }
        runCurrent()
        val oldRequestsBeforeReply = fixture.accounts.requestOwners.count { it == BillingOwner("alice", 1) }
        assertTrue(oldRequestsBeforeReply > oldSyncs)
        fixture.accounts.owners.value = BillingOwner("alice", 2)
        runCurrent()
        reply.complete(BillingCustomer(true, 2000, null))
        assertEquals(BillingOutcome.NEEDS_SIGN_IN, restore.await())
        runCurrent()
        assertEquals(oldRequestsBeforeReply, fixture.accounts.requestOwners.count { it == BillingOwner("alice", 1) })
        assertFalse(fixture.coordinator.state.value.isPro)
    }

    @Test fun consentRevokedDuringRestorePreventsSubsequentServerSynchronization() = runTest {
        val fixture = fixture()
        fixture.accounts.googleReady = false
        fixture.ready()
        val reply = CompletableDeferred<BillingCustomer>()
        fixture.client.restoreReply = reply
        val restore = async { fixture.coordinator.restore() }
        runCurrent()
        val requestCount = fixture.accounts.requests.size
        fixture.accounts.consented = false
        reply.complete(BillingCustomer(true, 2000, null))
        assertEquals(BillingOutcome.UNAVAILABLE, restore.await())
        assertEquals(requestCount, fixture.accounts.requests.size)
        assertFalse(fixture.coordinator.state.value.customerActive)
        assertFalse(fixture.coordinator.state.value.isBusy)
    }

    @Test fun accountSwitchDuringSheetDiscardsPurchaseResult() = runTest {
        val fixture = fixture()
        fixture.ready()
        val purchaseReply = CompletableDeferred<BillingCustomer>()
        val first = async { fixture.coordinator.purchase("monthly") { purchaseReply.await() } }
        runCurrent()
        fixture.accounts.owners.value = BillingOwner("bob", 2)
        runCurrent()
        assertFalse(fixture.coordinator.state.value.isPro)
        assertTrue(fixture.coordinator.state.value.packages.isEmpty())
        purchaseReply.complete(BillingCustomer(true, 2000, null))
        assertEquals(BillingOutcome.NEEDS_SIGN_IN, first.await())
        runCurrent()
        assertEquals("bob", fixture.client.userId)
        assertFalse(fixture.coordinator.state.value.customerActive)
        assertFalse(fixture.coordinator.state.value.isPro)
    }

    @Test fun sameUserWithNewSessionEpochAlsoRejectsStaleResult() = runTest {
        val fixture = fixture()
        fixture.ready()
        val reply = CompletableDeferred<BillingCustomer>()
        val purchase = async { fixture.coordinator.purchase("monthly") { reply.await() } }
        runCurrent()
        fixture.accounts.owners.value = BillingOwner("alice", 2)
        runCurrent()
        reply.complete(BillingCustomer(true, 2000, null))
        assertEquals(BillingOutcome.NEEDS_SIGN_IN, purchase.await())
        assertFalse(fixture.coordinator.state.value.isPro)
    }

    @Test fun failedSyncCanBeRetriedByRestoreWithoutBuyingAgain() = runTest {
        val fixture = fixture()
        fixture.ready()
        fixture.accounts.failSync = true
        assertEquals(BillingOutcome.FAILED, fixture.coordinator.purchase("monthly") { it("valid-play-token"); BillingCustomer(true, 2000, null) })
        assertFalse(fixture.coordinator.state.value.isPro)
        fixture.accounts.failSync = false
        fixture.accounts.syncTier = "pro"
        fixture.client.customer = BillingCustomer(true, 2000, null)
        assertEquals(BillingOutcome.SUBSCRIBED, fixture.coordinator.restore())
        assertTrue(fixture.coordinator.state.value.isPro)
        assertEquals(1, fixture.client.restoreCalls)
        assertEquals("revenuecat-sync", fixture.accounts.requests.last().second?.optString("action"))
    }

    @Test fun noActiveSubscriptionRestoresNothingAndListenerCanExpireAccess() = runTest {
        val fixture = fixture()
        fixture.ready()
        assertEquals(BillingOutcome.NOTHING_TO_RESTORE, fixture.coordinator.restore())
        fixture.accounts.syncTier = "pro"
        fixture.client.customer = BillingCustomer(true, 2000, null)
        fixture.client.callback?.invoke()
        runCurrent()
        assertTrue(fixture.coordinator.state.value.isPro)
        fixture.accounts.syncTier = "free"
        fixture.client.customer = BillingCustomer(false, null, null)
        fixture.client.callback?.invoke()
        runCurrent()
        assertFalse(fixture.coordinator.state.value.isPro)
        assertFalse(fixture.coordinator.state.value.customerActive)
    }

    @Test fun missingReservationVersionNeverLaunchesStore() = runTest {
        val fixture = fixture()
        fixture.accounts.protocolVersion = 0
        fixture.ready()
        var launched = false
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.purchase("monthly") { launched = true; BillingCustomer(true, 2000, null) })
        assertFalse(launched)
    }

    @Test fun lostStartResponseKeepsSameAttemptAndNeverLaunchesOrRetriesSdk() = runTest {
        val fixture = fixture(); fixture.ready(); fixture.accounts.lostStartReply = true
        var launches = 0
        assertEquals(BillingOutcome.FAILED, fixture.coordinator.purchase("monthly") { launches++; BillingCustomer(true, 2000, null) })
        val saved = fixture.journal.read("alice")!!
        assertNotNull(saved.attemptId); assertFalse(saved.launchStarted)
        fixture.accounts.lostStartReply = false
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.purchase("monthly") { launches++; BillingCustomer(true, 2000, null) })
        assertEquals(0, launches); assertEquals(1, fixture.accounts.startCalls)
        assertEquals(saved.operationId, fixture.journal.read("alice")!!.operationId)
    }

    @Test fun successfulTokenSurvivesSdkRefreshFailureAndConfirmsOriginalAttempt() = runTest {
        val fixture = fixture(); fixture.ready(); fixture.accounts.syncTier = "pro"
        assertEquals(BillingOutcome.SUBSCRIBED, fixture.coordinator.purchase("monthly") { persist ->
            persist("owned-original-token")
            assertEquals("owned-original-token", fixture.journal.read("alice")!!.purchaseToken)
            throw java.io.IOException("freshCustomer failed")
        })
        assertTrue(fixture.accounts.requests.any { it.second?.optString("action") == "purchase-submit" && it.second?.optString("purchaseToken") == "owned-original-token" })
    }

    @Test fun anotherAttemptConfirmationDoesNotCompleteOriginalPurchase() = runTest {
        val fixture = fixture(); fixture.ready(); fixture.accounts.syncTier = "pro"
        fixture.accounts.confirmedId = "22222222-2222-4222-8222-222222222222"
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.purchase("monthly") { it("owned-token"); BillingCustomer(true, 2000, null) })
        assertNotNull(fixture.journal.read("alice"))
    }

    @Test fun lateSuccessfulTokenPersistsForOriginalOwnerWithoutSubmittingAsNewOwner() = runTest {
        val fixture = fixture(); fixture.ready()
        val reply = CompletableDeferred<Unit>()
        val first = async { fixture.coordinator.purchase("monthly") { persist ->
            reply.await(); persist("alice-success-token"); BillingCustomer(true, 2000, null)
        } }
        runCurrent(); fixture.accounts.owners.value = BillingOwner("bob", 2); runCurrent()
        reply.complete(Unit); assertEquals(BillingOutcome.NEEDS_SIGN_IN, first.await()); runCurrent()
        assertEquals("alice-success-token", fixture.journal.read("alice")!!.purchaseToken)
        assertNull(fixture.journal.read("bob"))
        assertFalse(fixture.accounts.requests.any { it.second?.optString("purchaseToken") == "alice-success-token" })
    }

    @Test fun transportEpochFencePreventsMutatingNewOwnersLedger() = runTest {
        val fixture = fixture(); fixture.ready()
        fixture.accounts.dispatchHook = { fixture.accounts.owners.value = BillingOwner("bob", 2) }
        val count = fixture.accounts.requests.size
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.purchase("monthly") { fail("must not launch"); BillingCustomer(true, 2000, null) })
        assertFalse(fixture.accounts.requests.drop(count).any { it.second?.optString("action")?.startsWith("purchase-") == true })
        assertTrue(fixture.accounts.attempts.isEmpty())
    }

    @Test fun cancellationNeverErasesTheDurableObligationOrAllowsAnotherCharge() = runTest {
        val fixture = fixture(); fixture.ready()
        assertEquals(BillingOutcome.CANCELLED, fixture.coordinator.purchase("monthly") {
            throw PurchasesTransactionException(PurchasesError(PurchasesErrorCode.PurchaseCancelledError), true)
        })
        assertNull(fixture.coordinator.state.value.message)
        assertNotNull(fixture.journal.read("alice")); assertFalse(fixture.coordinator.state.value.canPurchase)
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.purchase("monthly") { fail("second SDK launch"); BillingCustomer(true, 2000, null) })
        assertEquals(1, fixture.accounts.startCalls)
    }

    @Test fun tokenlessStartedPurchaseRestoresPendingEvenWithEmptyCustomerInfo() = runTest {
        val fixture = fixture(); fixture.ready()
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.purchase("monthly") {
            throw PurchasesTransactionException(PurchasesError(PurchasesErrorCode.PaymentPendingError), false)
        })
        fixture.client.customer = BillingCustomer(false, null, null)
        assertEquals(BillingOutcome.PENDING, fixture.coordinator.restore())
        assertEquals(BillingMessage.PURCHASE_PENDING, fixture.coordinator.state.value.message)
        assertNotNull(fixture.journal.read("alice")); assertEquals(1, fixture.accounts.startCalls)
    }

    @Test fun activityRecreationCannotChangeGlobalSdkOwnerUntilOriginalSheetCompletes() = runTest {
        val fixture = fixture(); fixture.ready()
        val reply = CompletableDeferred<Unit>()
        val purchase = async { fixture.coordinator.purchase("monthly") { persist ->
            reply.await(); persist("alice-owned-token"); BillingCustomer(true, 2000, null)
        } }
        runCurrent(); fixture.coordinator.close()
        val otherAccounts = FakeAccounts().apply { owners.value = BillingOwner("bob", 2) }
        val other = BillingCoordinator(fixture.client, otherAccounts, backgroundScope, StandardTestDispatcher(testScheduler), "goog_example", { 1000L })
        val identify = async { other.identify(otherAccounts.owner()) }
        runCurrent(); assertEquals("alice", fixture.client.userId); assertFalse(identify.isCompleted)
        reply.complete(Unit); purchase.await(); identify.await()
        assertEquals("bob", fixture.client.userId)
        assertEquals("alice-owned-token", fixture.journal.read("alice")!!.purchaseToken)
    }

    @Test fun accountDeletionRetiresOriginalReceiptAndLateSuccessCannotResurrectIt() = runTest {
        val fixture = fixture(); fixture.ready()
        val reply = CompletableDeferred<Unit>()
        val purchase = async { fixture.coordinator.purchase("monthly") { persist ->
            reply.await(); persist("deleted-owner-token"); BillingCustomer(true, 2000, null)
        } }
        runCurrent(); fixture.journal.retire("alice"); fixture.accounts.owners.value = null; runCurrent()
        reply.complete(Unit); assertEquals(BillingOutcome.NEEDS_SIGN_IN, purchase.await())
        assertNull(fixture.journal.read("alice"))
        assertFalse(fixture.accounts.requests.any { it.second?.optString("purchaseToken") == "deleted-owner-token" })
    }

    @Test fun withdrawingConsentAfterSdkSuccessKeepsReceiptWithoutExternalSynchronization() = runTest {
        val fixture = fixture(); fixture.ready()
        val count = CompletableDeferred<Int>()
        assertEquals(BillingOutcome.UNAVAILABLE, fixture.coordinator.purchase("monthly") { persist ->
            persist("consent-withdrawn-token"); count.complete(fixture.accounts.requests.size)
            fixture.accounts.consented = false
            BillingCustomer(true, 2000, null)
        })
        assertEquals(count.await(), fixture.accounts.requests.size)
        assertEquals("consent-withdrawn-token", fixture.journal.read("alice")!!.purchaseToken)
    }

    private fun TestScope.fixture(key: String? = "goog_example"): Fixture {
        val client = FakeClient()
        val accounts = FakeAccounts()
        val journal = MemoryBillingJournal()
        val coordinator = BillingCoordinator(client, accounts, backgroundScope,
            StandardTestDispatcher(testScheduler), key, { 1000L }, journal)
        return Fixture(client, accounts, coordinator, journal)
    }

    private data class Fixture(val client: FakeClient, val accounts: FakeAccounts, val coordinator: BillingCoordinator, val journal: MemoryBillingJournal) {
        suspend fun ready() {
            coordinator.identify(accounts.owner())
            coordinator.loadOfferings()
        }
    }

    private class FakeClient : BillingClient {
        override var configured = false
        override var userId: String? = null
        override val anonymous: Boolean get() = userId == null
        var customer = BillingCustomer(false, null, null)
        var callback: (() -> Unit)? = null
        var restoreCalls = 0
        var restoreReply: CompletableDeferred<BillingCustomer>? = null
        override fun configure(key: String, userId: String?) { configured = true; this.userId = userId }
        override suspend fun logIn(userId: String) { this.userId = userId }
        override suspend fun logOut() { userId = null }
        override suspend fun offerings() = listOf(BillingPackage("monthly", "pro:monthly", "Bobby Pro", "€4.99", 1, "MONTH", rawProductId = "pro", basePlanId = "monthly"))
        override suspend fun freshCustomer() = customer
        override suspend fun restore(): BillingCustomer { restoreCalls++; return restoreReply?.await() ?: customer }
        override fun setListener(listener: (() -> Unit)?) { this.callback = listener }
        override fun clearPackages() = Unit
    }

    private class FakeAccounts : BillingAccounts {
        val owners = MutableStateFlow<BillingOwner?>(BillingOwner("alice", 1))
        override val changes = owners
        override fun owner() = owners.value
        var syncTier = "free"
        var syncProvider: String? = "google"
        var syncPeriodEnd = "1970-01-01T00:00:02Z"
        var googleReady = true
        var revenuecatReady = true
        var subscription: JSONObject? = null
        var failSync = false
        var consented = true
        override fun processingAllowed() = consented
        val requests = mutableListOf<Pair<String, JSONObject?>>()
        val requestOwners = mutableListOf<BillingOwner?>()
        val attempts = mutableMapOf<String, JSONObject>()
        var startCalls = 0
        var lostStartReply = false
        var confirmedId: String? = null
        var dispatchHook: (() -> Unit)? = null
        var protocolVersion = 1
        override suspend fun request(owner: BillingOwner, method: String, body: JSONObject?): JSONObject {
            dispatchHook?.invoke()
            check(owner == owner()) { "Account changed before dispatch" }
            requests += method to body
            requestOwners += owner
            if (method == "POST") {
                val user = owner()!!.userId
                val action = body?.optString("action")
                if (action == "purchase-reserve") {
                    val attempt = attempts.getOrPut(user) { JSONObject().put("id", "11111111-1111-4111-8111-111111111111")
                        .put("provider", "google").put("phase", "reserved").put("productId", "pro").put("basePlanId", "monthly").put("offerId", JSONObject.NULL) }
                    return JSONObject().put("attempt", attempt).put("launchAllowed", false)
                }
                if (action == "purchase-start") {
                    val attempt = attempts[user]!!
                    val permit = attempt.opt("phase") == "reserved"
                    attempt.put("phase", "external_started")
                    startCalls++
                    if (lostStartReply) throw java.io.IOException("lost start response")
                    return JSONObject().put("attempt", attempt).put("launchAllowed", permit)
                }
                if (failSync) throw java.io.IOException("offline")
                val attempt = attempts[user]
                val owned = syncTier == "pro" && syncProvider == "google" && syncPeriodEnd == "1970-01-01T00:00:02Z"
                if (attempt != null && action in setOf("purchase-submit", "purchase-reconcile", "revenuecat-sync"))
                    attempt.put("phase", if (owned) "confirmed" else "needs_reconciliation").put("confirmed", owned)
                return JSONObject().put("purchaseAttempt", attempt?.let { JSONObject(it.toString()).put("id", confirmedId ?: it.getString("id")) } ?: JSONObject.NULL)
                    .put("ok", true).put("access", JSONObject().put("tier", syncTier))
                    .put("subscription", if (syncTier == "pro" && syncProvider != null)
                        JSONObject().put("provider", syncProvider).put("status", "active").put("currentPeriodEnd", syncPeriodEnd)
                        else JSONObject.NULL)
            }
            return JSONObject().put("purchaseReservationVersion", protocolVersion).put("purchaseAttempt", attempts[owner()!!.userId] ?: JSONObject.NULL)
                .put("signedIn", true).put("access", JSONObject().put("tier", "free"))
                .put("subscription", subscription ?: JSONObject.NULL)
                .put("payments", JSONObject().put("google", googleReady).put("revenuecat", revenuecatReady))
        }
    }
}
