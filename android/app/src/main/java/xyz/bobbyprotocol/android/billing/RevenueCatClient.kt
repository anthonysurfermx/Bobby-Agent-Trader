package xyz.bobbyprotocol.android.billing

import android.app.Activity
import android.content.Context
import com.revenuecat.purchases.CacheFetchPolicy
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.LogLevel
import com.revenuecat.purchases.Package
import com.revenuecat.purchases.ProductType
import com.revenuecat.purchases.models.GoogleStoreProduct
import com.revenuecat.purchases.models.GoogleSubscriptionOption
import com.revenuecat.purchases.PurchaseParams
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.awaitCustomerInfo
import com.revenuecat.purchases.awaitLogIn
import com.revenuecat.purchases.awaitLogOut
import com.revenuecat.purchases.awaitOfferings
import com.revenuecat.purchases.awaitPurchase
import com.revenuecat.purchases.awaitRestore
import com.revenuecat.purchases.interfaces.UpdatedCustomerInfoListener

internal interface BillingClient {
    val configured: Boolean
    val userId: String?
    val anonymous: Boolean
    fun configure(key: String, userId: String?)
    suspend fun logIn(userId: String)
    suspend fun logOut()
    suspend fun offerings(): List<BillingPackage>
    suspend fun freshCustomer(): BillingCustomer
    suspend fun restore(): BillingCustomer
    fun setListener(listener: (() -> Unit)?)
    fun clearPackages()
}

internal class RevenueCatClient(
    private val context: Context,
    private val entitlementId: String,
    private val debugBuild: Boolean,
) : BillingClient {
    private var packages: Map<String, Package> = emptyMap()
    override val configured: Boolean get() = Purchases.isConfigured
    override val userId: String? get() = if (configured) Purchases.sharedInstance.appUserID else null
    override val anonymous: Boolean get() = !configured || Purchases.sharedInstance.isAnonymous

    override fun configure(key: String, userId: String?) {
        if (configured) return
        Purchases.logLevel = if (debugBuild) LogLevel.INFO else LogLevel.WARN
        Purchases.configure(PurchasesConfiguration.Builder(context.applicationContext, key).appUserID(userId).build())
    }

    override suspend fun logIn(userId: String) { Purchases.sharedInstance.awaitLogIn(userId) }
    override suspend fun logOut() { Purchases.sharedInstance.awaitLogOut() }

    override suspend fun offerings(): List<BillingPackage> {
        val available = Purchases.sharedInstance.awaitOfferings().current?.availablePackages.orEmpty()
            .filter { it.product.type == ProductType.SUBS && it.product.defaultOption != null }
        packages = available.associateBy { it.identifier }
        return available.map { pkg ->
            val product = pkg.product
            val period = product.period
            BillingPackage(pkg.identifier, product.id, product.name, product.price.formatted,
                period?.value, period?.unit?.name, product.defaultOption?.pricingPhases.orEmpty().map { phase ->
                    BillingPricingPhase(phase.price.formatted, phase.billingPeriod.value,
                        phase.billingPeriod.unit.name, phase.billingCycleCount, phase.recurrenceMode.name)
                }, (product as? GoogleStoreProduct)?.productId,
                (product.defaultOption as? GoogleSubscriptionOption)?.basePlanId,
                (product.defaultOption as? GoogleSubscriptionOption)?.offerId)
        }
    }

    suspend fun purchase(activity: Activity, packageId: String, persistToken: (String) -> Unit): BillingCustomer {
        val pkg = packages[packageId] ?: throw IllegalArgumentException("Package is no longer available")
        val option = pkg.product.defaultOption ?: throw IllegalArgumentException("Purchase option is no longer available")
        val result = Purchases.sharedInstance.awaitPurchase(PurchaseParams.Builder(activity, option).build())
        // Persist the original owner/attempt receipt before any network refresh can fail.
        persistToken(result.storeTransaction.purchaseToken)
        // Fresh SDK data is a synchronization trigger. It never grants Bobby access by itself.
        return freshCustomer()
    }

    override suspend fun freshCustomer(): BillingCustomer =
        Purchases.sharedInstance.awaitCustomerInfo(CacheFetchPolicy.FETCH_CURRENT).snapshot()

    override suspend fun restore(): BillingCustomer {
        Purchases.sharedInstance.awaitRestore()
        return freshCustomer()
    }

    override fun setListener(listener: (() -> Unit)?) {
        if (configured) Purchases.sharedInstance.updatedCustomerInfoListener =
            listener?.let { callback -> UpdatedCustomerInfoListener { callback() } }
    }

    override fun clearPackages() { packages = emptyMap() }

    private fun CustomerInfo.snapshot(): BillingCustomer = entitlements.active[entitlementId].let { entitlement ->
        BillingCustomer(entitlement != null, entitlement?.expirationDate?.time, managementURL?.toString())
    }
}
