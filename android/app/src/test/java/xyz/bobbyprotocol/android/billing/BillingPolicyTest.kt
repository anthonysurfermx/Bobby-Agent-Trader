package xyz.bobbyprotocol.android.billing

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class BillingPolicyTest {
    private val now = Instant.parse("2026-10-03T12:00:00Z").toEpochMilli()

    @Test fun onlyAnActiveBoundedGooglePeriodConfirmsAPlaySubscription() {
        val body = JSONObject().put("access", JSONObject().put("tier", "pro"))
        val subscription = JSONObject().put("provider", "google").put("status", "active")
            .put("currentPeriodEnd", "1970-01-01T00:00:02Z")
        body.put("subscription", subscription)
        assertTrue(BillingPolicy.googleSubscriptionConfirmed(body, 1000))
        for (provider in listOf("apple", "stripe", "unknown")) {
            subscription.put("provider", provider)
            assertFalse(BillingPolicy.googleSubscriptionConfirmed(body, 1000))
        }
        subscription.put("provider", "google").put("currentPeriodEnd", JSONObject.NULL)
        assertFalse(BillingPolicy.googleSubscriptionConfirmed(body, 1000))
        subscription.put("currentPeriodEnd", "not-a-date")
        assertFalse(BillingPolicy.googleSubscriptionConfirmed(body, 1000))
        subscription.put("currentPeriodEnd", "1970-01-01T00:00:00Z")
        assertFalse(BillingPolicy.googleSubscriptionConfirmed(body, 1000))
    }

    @Test fun releaseAcceptsOnlyGooglePublicKeys() {
        assertNull(BillingPolicy.usableKey("", false))
        assertNull(BillingPolicy.usableKey("test_example", false))
        assertNull(BillingPolicy.usableKey("appl_example", false))
        assertNull(BillingPolicy.usableKey("secret_example", true))
        assertEquals("goog_example", BillingPolicy.usableKey(" goog_example ", false))
        assertEquals("test_example", BillingPolicy.usableKey("test_example", true))
    }

    @Test fun legacyAppleReadinessDoesNotAuthorizeGoogleCharge() {
        val body = access().put("payments", JSONObject().put("apple", true).put("revenuecat", true))
        assertEquals(BillingEligibility.NOT_AVAILABLE, BillingPolicy.access(body, now)?.eligibility)
        body.put("payments", JSONObject().put("google", "true").put("revenuecat", 1))
        assertFalse(BillingPolicy.access(body, now)!!.googleReady)
    }

    @Test fun activeSubscriptionFromEveryProviderBlocksAnotherCharge() {
        for (provider in listOf("google", "apple", "stripe", "future_provider")) {
            val body = access().put("subscription", JSONObject().put("provider", provider)
                .put("status", "active").put("currentPeriodEnd", "2026-11-03T12:00:00Z"))
            assertEquals(provider, BillingPolicy.access(body, now)?.provider)
            assertEquals(BillingEligibility.ALREADY_SUBSCRIBED, BillingPolicy.access(body, now)?.eligibility)
        }
    }

    @Test fun restorationDoesNotRequireNewSalesAndExcludesActiveOtherProviders() {
        val body = access().put("payments", JSONObject().put("google", false).put("revenuecat", true))
        assertTrue(BillingPolicy.access(body, now)!!.restoreAllowed)
        for (provider in listOf("google", "apple", "stripe", "unknown")) {
            body.put("subscription", JSONObject().put("provider", provider).put("status", "active")
                .put("currentPeriodEnd", "2026-11-03T12:00:00Z"))
            assertEquals(provider == "google", BillingPolicy.access(body, now)!!.restoreAllowed)
        }
        body.put("subscription", JSONObject.NULL).put("payments", JSONObject().put("revenuecat", false))
        assertFalse(BillingPolicy.access(body, now)!!.restoreAllowed)
    }

    @Test fun malformedOrMissingSubscriptionStateFailsClosed() {
        assertNull(BillingPolicy.access(access().apply { remove("subscription") }, now))
        assertEquals(BillingEligibility.UNKNOWN, BillingPolicy.access(access().put("subscription", "none"), now)?.eligibility)
        val subscription = JSONObject().put("status", "active").put("currentPeriodEnd", "not-a-date")
        assertEquals(BillingEligibility.UNKNOWN, BillingPolicy.access(access().put("subscription", subscription), now)?.eligibility)
        subscription.put("currentPeriodEnd", JSONObject.NULL)
        assertEquals(BillingEligibility.ALREADY_SUBSCRIBED, BillingPolicy.access(access().put("subscription", subscription), now)?.eligibility)
    }

    @Test fun proGrantAlsoPreventsUnnecessaryPurchase() {
        assertEquals(BillingEligibility.ALREADY_SUBSCRIBED, BillingPolicy.access(access("pro"), now)?.eligibility)
        assertEquals(BillingEligibility.READY, BillingPolicy.access(access(), now)?.eligibility)
    }

    @Test fun onlyExplicitServerProConfirmsAccess() {
        assertFalse(BillingPolicy.serverConfirmed(JSONObject().put("ok", true)))
        assertFalse(BillingPolicy.serverConfirmed(JSONObject().put("ok", "true").put("access", JSONObject().put("tier", "pro"))))
        assertTrue(BillingPolicy.serverConfirmed(JSONObject().put("ok", true).put("access", JSONObject().put("tier", "pro"))))
    }

    @Test fun subscriptionManagementDoesNotOpenAnUntrustedUrl() {
        assertNull(BillingPolicy.managementUrl("stripe", "https://evil.example"))
        assertEquals("https://apps.apple.com/account/subscriptions", BillingPolicy.managementUrl("apple", null))
        assertEquals("https://play.google.com/store/account/subscriptions", BillingPolicy.managementUrl("google", "https://play.google.com.evil.example/store/account/subscriptions"))
        assertEquals("https://play.google.com/store/account/subscriptions", BillingPolicy.managementUrl("google", "https://evil@play.google.com/store/account/subscriptions"))
    }

    private fun access(tier: String = "free") = JSONObject().put("signedIn", true)
        .put("purchaseReservationVersion", 1).put("access", JSONObject().put("tier", tier)).put("subscription", JSONObject.NULL)
        .put("payments", JSONObject().put("google", true).put("revenuecat", true))
}
