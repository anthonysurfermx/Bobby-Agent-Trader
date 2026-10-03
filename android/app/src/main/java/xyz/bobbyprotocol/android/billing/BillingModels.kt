package xyz.bobbyprotocol.android.billing

data class BillingPricingPhase(
    val displayPrice: String,
    val periodCount: Int,
    val periodUnit: String,
    val cycles: Int?,
    val recurrence: String,
)

/** Prices and periods come from Google Play, including each eligible introductory phase. */
data class BillingPackage(
    val identifier: String,
    val productId: String,
    val title: String,
    val displayPrice: String,
    val periodCount: Int?,
    val periodUnit: String?,
    val pricingPhases: List<BillingPricingPhase> = emptyList(),
    val rawProductId: String? = null,
    val basePlanId: String? = null,
    val offerId: String? = null,
) {
    // The introductory price does not determine renewal. Use the final store phase.
    val renewal: BillingRenewal get() = when (pricingPhases.lastOrNull()?.recurrence) {
        "INFINITE_RECURRING" -> BillingRenewal.AUTOMATIC
        "NON_RECURRING" -> BillingRenewal.PREPAID
        else -> BillingRenewal.UNKNOWN
    }
}

enum class BillingRenewal { AUTOMATIC, PREPAID, UNKNOWN }

enum class BillingOfferingsStatus { IDLE, NOT_CONFIGURED, LOADING, READY, MISSING, FAILED }
enum class BillingEligibility { UNKNOWN, READY, NEEDS_SIGN_IN, NOT_AVAILABLE, ALREADY_SUBSCRIBED }
enum class BillingOutcome { SUBSCRIBED, PENDING, CANCELLED, NOTHING_TO_RESTORE, NEEDS_SIGN_IN, ALREADY_SUBSCRIBED, BUSY, UNAVAILABLE, FAILED }
enum class BillingMessage {
    CONFIGURATION_MISSING, GOOGLE_PAYMENTS_NOT_READY, SIGN_IN_FIRST, PRODUCTS_UNAVAILABLE,
    ACCOUNT_CHANGED, IDENTITY_UNAVAILABLE, ALREADY_SUBSCRIBED, PURCHASE_PENDING, PURCHASE_FAILED,
    NETWORK_UNAVAILABLE, STORE_UNAVAILABLE, PURCHASE_BELONGS_TO_ANOTHER_ACCOUNT,
    SERVER_CONFIRMATION_PENDING, NOTHING_TO_RESTORE, SUBSCRIBED,
}

data class BillingState(
    val configured: Boolean = false,
    val identityReady: Boolean = false,
    val offeringsStatus: BillingOfferingsStatus = BillingOfferingsStatus.IDLE,
    val packages: List<BillingPackage> = emptyList(),
    /** Presentation hint only. Bobby's server decides access to every paid operation. */
    val customerActive: Boolean = false,
    val serverPro: Boolean? = null,
    val subscriptionProvider: String? = null,
    val googlePaymentsReady: Boolean = false,
    /** Restore is independent of whether new Play sales are enabled. */
    val restoreAllowed: Boolean = false,
    val eligibility: BillingEligibility = BillingEligibility.UNKNOWN,
    val isBusy: Boolean = false,
    val purchasePending: Boolean = false,
    val purchaseAttemptId: String? = null,
    val message: BillingMessage? = null,
) {
    val isPro: Boolean get() = serverPro == true
    val canPurchase: Boolean get() = configured && identityReady && !isBusy &&
        offeringsStatus == BillingOfferingsStatus.READY && packages.isNotEmpty() &&
        !purchasePending && googlePaymentsReady && eligibility == BillingEligibility.READY
    val canRestore: Boolean get() = configured && identityReady && !isBusy && restoreAllowed
}

internal data class BillingOwner(val userId: String, val epoch: Long)
internal data class BillingCustomer(val active: Boolean, val expiryMillis: Long?, val managementUrl: String?)
internal data class BillingAccess(val pro: Boolean, val provider: String?, val googleReady: Boolean,
    val eligibility: BillingEligibility, val restoreAllowed: Boolean)
