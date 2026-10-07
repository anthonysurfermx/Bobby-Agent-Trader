package xyz.bobbyprotocol.android.billing

import android.app.Activity
import android.content.Context
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.combine
import org.json.JSONObject
import xyz.bobbyprotocol.android.BuildConfig
import xyz.bobbyprotocol.android.data.AccountSession
import xyz.bobbyprotocol.android.data.BobbyRepository

/** App-scoped purchase store. Call identify only after the person accepts the risk notice. */
class BillingStore(context: Context, private val repository: BobbyRepository) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val client = RevenueCatClient(context.applicationContext, BuildConfig.ENTITLEMENT_ID, BuildConfig.DEBUG)
    private val accounts = object : BillingAccounts {
        override val changes = combine(repository.session, repository.epoch) { session, epoch ->
            session?.let { BillingOwner(it.userId, epoch) }
        }
        override fun owner(): BillingOwner? = repository.session.value?.let { BillingOwner(it.userId, repository.epoch.value) }
        override fun processingAllowed(): Boolean = repository.allowsExternalProcessing()
        override suspend fun request(owner: BillingOwner, method: String, body: JSONObject?): JSONObject =
            repository.requestForAccount(owner.userId, owner.epoch, "/api/bobby-access", method, body,
                headers = mapOf("X-Bobby-Purchase-Client" to "1", "X-Bobby-External-Processing" to "accepted"))
    }
    private val journal = EncryptedBillingJournal(context.applicationContext)
    private val deletedListener: (String) -> Unit = { owner -> journal.retire(owner) }
    init { repository.addAccountDeletedListener(deletedListener) }
    private val coordinator = BillingCoordinator(client, accounts, scope, Dispatchers.Main.immediate,
        BillingPolicy.usableKey(BuildConfig.REVENUECAT_ANDROID_API_KEY, BuildConfig.DEBUG),
        journal = journal)
    val state = coordinator.state

    suspend fun identify(session: AccountSession?, epoch: Long = repository.epoch.value) =
        coordinator.identify(session?.let { BillingOwner(it.userId, epoch) })

    suspend fun loadOfferings() = coordinator.loadOfferings()

    suspend fun purchase(activity: Activity, packageId: String): BillingOutcome {
        if (activity.isFinishing || activity.isDestroyed) return BillingOutcome.UNAVAILABLE
        return coordinator.purchase(packageId) { persistToken -> client.purchase(activity, packageId, persistToken) }
    }

    @Suppress("UNUSED_PARAMETER")
    suspend fun restore(activity: Activity? = null): BillingOutcome = coordinator.restore()

    /** Server Pro access alone does not confirm a successful Google subscription. */
    fun confirmsGoogleSubscription(body: JSONObject): Boolean =
        BillingPolicy.googleSubscriptionConfirmed(body, System.currentTimeMillis())

    /** Card subscriptions must be managed through Bobby's account UI, never a new Play checkout. */
    fun managementUri(): Uri? = coordinator.managementUrl()?.let(Uri::parse)
    fun clearMessage() = coordinator.clearMessage()
    fun close() { repository.removeAccountDeletedListener(deletedListener); coordinator.close(); scope.cancel() }
}
