package xyz.bobbyprotocol.android.billing

import org.json.JSONObject
import java.time.Instant

internal object BillingPolicy {
    fun usableKey(raw: String, debugBuild: Boolean): String? {
        val key = raw.trim()
        return key.takeIf { (it.startsWith("goog_") && it.length > 5) ||
            (debugBuild && it.startsWith("test_") && it.length > 5) }
    }

    /** Missing capabilities and malformed subscription state never authorize a new charge. */
    fun access(body: JSONObject, nowMillis: Long): BillingAccess? {
        if (body.opt("signedIn") != true || !body.has("subscription")) return null
        val tier = body.optJSONObject("access")?.opt("tier") as? String ?: return null
        if (tier !in setOf("anon", "free", "pro")) return null
        val payments = body.optJSONObject("payments")
        val googleReady = payments?.opt("google") == true && payments?.opt("revenuecat") == true && body.opt("purchaseReservationVersion") == 1
        val subscription = body.opt("subscription")
        val provider = (subscription as? JSONObject)?.opt("provider") as? String
        val membership = when {
            subscription != null && subscription != JSONObject.NULL && subscription !is JSONObject -> BillingEligibility.UNKNOWN
            subscription is JSONObject -> subscriptionEligibility(subscription, nowMillis)
            else -> BillingEligibility.READY
        }
        val eligibility = when {
            membership == BillingEligibility.UNKNOWN -> BillingEligibility.UNKNOWN
            tier == "pro" -> BillingEligibility.ALREADY_SUBSCRIBED
            else -> membership
        }.let { if (it == BillingEligibility.READY && !googleReady) BillingEligibility.NOT_AVAILABLE else it }
        val restoreAllowed = payments?.opt("revenuecat") == true &&
            (membership == BillingEligibility.READY || membership == BillingEligibility.ALREADY_SUBSCRIBED && provider == "google")
        return BillingAccess(tier == "pro", provider, googleReady, eligibility, restoreAllowed)
    }

    private fun subscriptionEligibility(subscription: JSONObject, nowMillis: Long): BillingEligibility {
        val status = subscription.opt("status") as? String ?: return BillingEligibility.UNKNOWN
        if (status in setOf("expired", "refunded", "canceled", "cancelled", "incomplete_expired")) return BillingEligibility.READY
        if (status !in setOf("active", "trialing")) return BillingEligibility.UNKNOWN
        if (!subscription.has("currentPeriodEnd")) return BillingEligibility.UNKNOWN
        val rawEnd = subscription.opt("currentPeriodEnd")
        if (rawEnd == null || rawEnd == JSONObject.NULL) return BillingEligibility.ALREADY_SUBSCRIBED
        val end = (rawEnd as? String)?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?: return BillingEligibility.UNKNOWN
        return if (end > nowMillis) BillingEligibility.ALREADY_SUBSCRIBED else BillingEligibility.READY
    }

    fun serverConfirmed(body: JSONObject): Boolean = body.opt("ok") == true &&
        body.optJSONObject("access")?.opt("tier") == "pro"

    /** Pro from a grant or another provider is access, not confirmation of a Play subscription. */
    fun googleSubscriptionConfirmed(body: JSONObject, nowMillis: Long): Boolean {
        if (body.optJSONObject("access")?.opt("tier") != "pro") return false
        val subscription = body.optJSONObject("subscription") ?: return false
        if (subscription.opt("provider") != "google" || subscription.opt("status") !in setOf("active", "trialing")) return false
        if (subscription.opt("status") == "trialing" && body.optJSONObject("purchaseAttempt")?.opt("confirmed") != true) return false
        val end = (subscription.opt("currentPeriodEnd") as? String)?.let {
            runCatching { Instant.parse(it).toEpochMilli() }.getOrNull()
        } ?: return false
        return end > nowMillis
    }

    fun attemptConfirmed(body: JSONObject, attemptId: String, nowMillis: Long): Boolean {
        val attempt = body.optJSONObject("purchaseAttempt") ?: return false
        return body.opt("ok") == true && attempt.opt("id") == attemptId && attempt.opt("provider") == "google" &&
            attempt.opt("phase") == "confirmed" && attempt.opt("confirmed") == true && googleSubscriptionConfirmed(body, nowMillis)
    }

    /** Only store management destinations are opened; arbitrary SDK/server links are ignored. */
    fun managementUrl(provider: String?, customerUrl: String?): String? {
        if (provider == "apple") return "https://apps.apple.com/account/subscriptions"
        if (provider != null && provider != "google") return null
        if (customerUrl != null) {
            val uri = runCatching { java.net.URI(customerUrl) }.getOrNull()
            if (uri?.scheme == "https" && uri.host == "play.google.com" && uri.userInfo == null &&
                uri.path == "/store/account/subscriptions") return customerUrl
        }
        return "https://play.google.com/store/account/subscriptions"
    }
}
