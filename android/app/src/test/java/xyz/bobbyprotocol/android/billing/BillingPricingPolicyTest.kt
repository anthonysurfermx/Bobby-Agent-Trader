package xyz.bobbyprotocol.android.billing

import org.junit.Assert.assertEquals
import org.junit.Test

class BillingPricingPolicyTest {
    private fun plan(vararg phases: String) = BillingPackage("plan", "pro", "Pro", "store price", 1, "MONTH",
        phases.map { BillingPricingPhase("store price", 1, "MONTH", null, it) })

    @Test fun introductoryPhasesDoNotHideAutomaticRenewal() {
        assertEquals(BillingRenewal.AUTOMATIC, plan("FINITE_RECURRING", "INFINITE_RECURRING").renewal)
    }

    @Test fun prepaidPlanDoesNotPromiseAutomaticRenewal() {
        assertEquals(BillingRenewal.PREPAID, plan("NON_RECURRING").renewal)
    }

    @Test fun missingAndUnknownStorePhasesDoNotInventTerms() {
        for (candidate in listOf(plan(), plan("FUTURE_STORE_VALUE"), plan("FINITE_RECURRING"))) {
            assertEquals(BillingRenewal.UNKNOWN, candidate.renewal)
        }
    }
}
