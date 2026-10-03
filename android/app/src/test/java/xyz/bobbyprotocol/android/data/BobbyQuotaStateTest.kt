package xyz.bobbyprotocol.android.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class BobbyQuotaStateTest {
    private var owner = BobbyQuotaOwner("account-a", 1)

    private fun access(tier: String = "free", bonus: Any = 10) = JSONObject()
        .put("tier", tier).put("used", 10).put("limit", 10).put("remaining", 0)
        .put("bonus", bonus).put("resetsAt", JSONObject.NULL).put("paywall", true)
    private fun meter(bonus: Any = 0) = JSONObject()
        .put("used", 3).put("limit", 3).put("remaining", 0).put("bonus", bonus)
        .put("windowDays", 7).put("resetsAt", "2026-10-10T12:00:00.000Z")
    private fun levels(tier: String = "free", deep: Any = 3, max: Any = 1) = JSONObject().put("tier", tier)
        .put("levels", JSONObject().put("profundo", meter(deep)).put("maximo", meter(max)))
    private fun body(tier: String = "free", bonus: Any = 10) = JSONObject()
        .put("access", access(tier, bonus)).put("levels", levels(tier))
    private fun snapshot(tier: String = "free", bonus: Any = 10) =
        BobbyQuotaPolicy.snapshot(body(tier, bonus), accountOnly = true)!!

    @Test fun strictCountsRejectBooleansStringsFractionsNegativeAndOverflow() {
        for (value in listOf(null, JSONObject.NULL, true, false, "10", -1, -0.5, 0.5, Double.NaN,
            Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY, 1_000_000_000L)) {
            assertNull("Invalid quota count: $value", BobbyQuotaPolicy.count(value))
        }
        assertEquals(0, BobbyQuotaPolicy.count(0))
        assertEquals(10, BobbyQuotaPolicy.count(10.0))
        assertEquals(999_999_999, BobbyQuotaPolicy.count(999_999_999L))
    }

    @Test fun realNestedShapePreservesQuickAndBothPremiumGiftBalances() {
        val parsed = BobbyQuotaPolicy.snapshot(body(), accountOnly = true)!!
        assertEquals("free", parsed.access!!.tier)
        assertEquals(10, parsed.access!!.bonus)
        assertEquals(0, parsed.access!!.remaining)
        assertEquals(3, parsed.levels!!.profundo.bonus)
        assertEquals(1, parsed.levels!!.maximo.bonus)
        assertEquals("2026-10-10T12:00:00.000Z", parsed.levels!!.profundo.resetsAt)
    }

    @Test fun explicitZeroIsAValidBalanceAndNeverTreatedAsMissing() {
        val parsed = BobbyQuotaPolicy.snapshot(JSONObject().put("access", access(bonus = 0)), true)!!
        assertEquals(0, parsed.access!!.bonus)
        assertEquals(0, parsed.access!!.remaining)
        assertNull(parsed.levels)
    }

    @Test fun generalReadPermitsOpenAnonButCouponDoesNotApplyItForAnAccount() {
        val open = access("anon", 0).put("used", JSONObject.NULL).put("limit", JSONObject.NULL)
            .put("remaining", JSONObject.NULL).put("paywall", false)
        val body = JSONObject().put("access", open).put("levels", JSONObject.NULL)
        val general = BobbyQuotaPolicy.snapshot(body)!!
        assertEquals("anon", general.access!!.tier)
        assertNull(general.access!!.used)
        assertNull(general.access!!.limit)
        assertNull(general.access!!.remaining)
        assertNull(BobbyQuotaPolicy.snapshot(body, accountOnly = true))
    }

    @Test fun realProUnlimitedTripleNullKeepsGiftBalanceWithoutInventingUsed() {
        val pro = access("pro").put("used", JSONObject.NULL).put("limit", JSONObject.NULL)
            .put("remaining", JSONObject.NULL).put("paywall", false)
        val parsed = BobbyQuotaPolicy.snapshot(JSONObject().put("access", pro).put("levels", levels("pro")), true)!!
        assertEquals(10, parsed.access!!.bonus)
        assertNull(parsed.access!!.used)
        assertNull(parsed.access!!.limit)
        assertNull(parsed.access!!.remaining)
        assertEquals("pro", parsed.levels!!.tier)
        pro.put("limit", 60).put("remaining", 0)
        assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", pro), true))
        pro.put("tier", "free").put("limit", JSONObject.NULL).put("remaining", JSONObject.NULL)
        assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", pro), true))
    }

    @Test fun nullableQuotaFieldsRequirePresenceAndMalformedCountsNeverRound() {
        for (field in listOf("used", "limit", "remaining")) {
            val missing = access(); missing.remove(field)
            assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", missing), true))
            for (value in listOf<Any>(true, "0", -1, 0.5)) {
                val malformed = access().put(field, value)
                assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", malformed), true))
            }
        }
        for (field in listOf("bonus", "paywall")) {
            val missing = access(); missing.remove(field)
            assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", missing), true))
        }
        assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", access().put("paywall", "true")), true))
    }

    @Test fun resetDatesRequireAnIsoInstantWhileNullAndAbsentStayUnknown() {
        for (value in listOf<Any>("", "tomorrow", "2026-10-10", true, 123)) {
            assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", access().put("resetsAt", value)), true))
        }
        val absent = access(); absent.remove("resetsAt")
        assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("access", absent), true)!!.access!!.resetsAt)
        val valid = access().put("resetsAt", "2026-10-10T12:00:00Z")
        assertEquals("2026-10-10T12:00:00Z", BobbyQuotaPolicy.snapshot(JSONObject().put("access", valid), true)!!.access!!.resetsAt)
    }

    @Test fun flatOrIncompletePremiumShapeNeverFabricatesAZeroMeter() {
        val flat = JSONObject().put("tier", "free").put("profundo", meter()).put("maximo", meter())
        assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("levels", flat), true))
        val incomplete = levels(); incomplete.getJSONObject("levels").remove("maximo")
        assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("levels", incomplete), true))
        for (field in listOf("used", "limit", "remaining", "bonus", "windowDays")) {
            val malformed = levels(); malformed.getJSONObject("levels").getJSONObject("profundo").put(field, true)
            assertNull(BobbyQuotaPolicy.snapshot(JSONObject().put("levels", malformed), true))
        }
    }

    @Test fun malformedOneFieldStillKeepsTheOtherValidatedPartialField() {
        val partialAccess = BobbyQuotaPolicy.snapshot(body().put("levels", levels(deep = 0.5)), true)!!
        assertNotNull(partialAccess.access); assertNull(partialAccess.levels)
        val partialLevels = BobbyQuotaPolicy.snapshot(body().put("access", access(bonus = true)), true)!!
        assertNull(partialLevels.access); assertNotNull(partialLevels.levels)
        val conflicting = BobbyQuotaPolicy.snapshot(body().put("levels", levels("pro")), true)!!
        assertEquals("free", conflicting.access!!.tier); assertNull(conflicting.levels)
    }

    @Test fun onlyTheLatestGetMayApplyEvenIfAnOlderGetReturnsLast() {
        val store = BobbyQuotaStore({ owner })
        val old = store.beginRead()
        val latest = store.beginRead()
        assertEquals(owner, latest.owner)
        assertTrue(store.applyRead(latest, snapshot(bonus = 20)))
        assertFalse(store.applyRead(old, snapshot(bonus = 0)))
        assertEquals(20, store.state.value.access!!.bonus)
    }

    @Test fun unavailableLatestGetCannotAllowAnOlderSuccessfulGetToReappear() {
        val store = BobbyQuotaStore({ owner })
        val old = store.beginRead(); val latest = store.beginRead()
        assertFalse(store.applyRead(latest, null))
        assertFalse(store.applyRead(old, snapshot()))
        assertNull(store.state.value.access)
    }

    @Test fun couponIsTheServerBalanceAndInvalidatesAnEarlierGetWithoutAddingGifts() {
        val store = BobbyQuotaStore({ owner })
        assertTrue(store.applyRead(store.beginRead(), snapshot(bonus = 30)))
        val old = store.beginRead()
        assertTrue(store.applyCoupon(owner, snapshot(bonus = 40)))
        assertEquals("Never 30 + 40", 40, store.state.value.access!!.bonus)
        assertFalse(store.applyRead(old, snapshot(bonus = 30)))
        assertEquals(40, store.state.value.access!!.bonus)
    }

    @Test fun confirmedCouponWithMissingQuotaStillInvalidatesEarlierGet() {
        val store = BobbyQuotaStore({ owner })
        assertTrue(store.applyRead(store.beginRead(), snapshot(bonus = 3)))
        val old = store.beginRead()
        assertTrue(store.applyCoupon(owner, null))
        assertFalse(store.applyRead(old, snapshot(bonus = 0)))
        assertEquals("Keep the prior snapshot without inventing a new balance", 3, store.state.value.access!!.bonus)
    }

    @Test fun partialSnapshotsMergeSameTierAndPreserveUnchangedMeters() {
        val store = BobbyQuotaStore({ owner })
        assertTrue(store.applyCoupon(owner, snapshot()))
        val priorLevels = store.state.value.levels
        val nextAccess = snapshot(bonus = 25).access!!
        assertTrue(store.applyCoupon(owner, BobbyQuotaSnapshot(access = nextAccess)))
        assertEquals(nextAccess, store.state.value.access)
        assertEquals(priorLevels, store.state.value.levels)
        val nextLevels = BobbyQuotaPolicy.snapshot(JSONObject().put("levels", levels(deep = 8, max = 2)), true)!!.levels!!
        assertTrue(store.applyRead(store.beginRead(), BobbyQuotaSnapshot(levels = nextLevels)))
        assertEquals(25, store.state.value.access!!.bonus)
        assertEquals(8, store.state.value.levels!!.profundo.bonus)
    }

    @Test fun partialTierChangeRetiresTheOtherFieldsOldPlanAllowance() {
        val store = BobbyQuotaStore({ owner })
        assertTrue(store.applyCoupon(owner, snapshot("free")))
        assertTrue(store.applyCoupon(owner, BobbyQuotaSnapshot(access = snapshot("pro").access)))
        assertEquals("pro", store.state.value.access!!.tier)
        assertNull("Free premium meters cannot survive a Pro plan change", store.state.value.levels)
        assertTrue(store.applyCoupon(owner, snapshot("pro")))
        assertTrue(store.applyCoupon(owner, BobbyQuotaSnapshot(levels = snapshot("free").levels)))
        assertNull("Pro Quick allowance cannot survive a Free plan change", store.state.value.access)
        assertEquals("free", store.state.value.levels!!.tier)
    }

    @Test fun accountSwitchAbAAndSameUserNewEpochNeverReviveOldQuotas() {
        val store = BobbyQuotaStore({ owner })
        val firstOwner = owner
        val old = store.beginRead()
        owner = BobbyQuotaOwner("account-b", 2); store.reset()
        owner = BobbyQuotaOwner("account-a", 3); store.reset()
        assertFalse(store.applyRead(old, snapshot()))
        assertFalse(store.applyCoupon(firstOwner, snapshot()))
        assertNull(store.state.value.access); assertNull(store.state.value.levels)
        val sameUser = store.beginRead()
        owner = owner.copy(epoch = 4)
        assertFalse(store.applyRead(sameUser, snapshot()))
        assertEquals(owner, store.state.value.owner)
        assertNull(store.state.value.access)
    }

    @Test fun detectedOwnerChangeClearsStateBeforeStartingOrApplyingAnotherRequest() {
        val store = BobbyQuotaStore({ owner })
        assertTrue(store.applyCoupon(owner, snapshot()))
        val oldOwner = owner
        owner = BobbyQuotaOwner(null, 2)
        assertFalse(store.applyCoupon(oldOwner, snapshot(bonus = 99)))
        assertEquals(owner, store.state.value.owner)
        assertNull(store.state.value.access); assertNull(store.state.value.levels)
        val guest = store.beginRead()
        assertEquals(owner, guest.owner)
    }

    @Test fun actualGuestDeepAllowanceAndGiftedFreeUsesCanBeSelectedWithoutGrantingMax() {
        val guestDeep = QuotaMeter(0, 1, 1, 0, 30, null)
        val guestMax = QuotaMeter(0, 0, 0, 0, 30, null)
        assertTrue(BobbyQuotaPolicy.canSelectPremium("anon", guestDeep))
        assertFalse(BobbyQuotaPolicy.canSelectPremium("anon", guestMax))
        assertTrue(BobbyQuotaPolicy.canSelectPremium("free", QuotaMeter(3, 3, 0, 1, 7, null)))
        assertFalse(BobbyQuotaPolicy.canSelectPremium("free", QuotaMeter(3, 3, 0, 0, 7, null)))
        assertFalse(BobbyQuotaPolicy.canSelectPremium(null, guestDeep))
        assertFalse(BobbyQuotaPolicy.canSelectPremium("pro", null))
    }

    @Test fun resetInvalidatesARequestEvenWhenTheAccountIdentityIsUnchanged() {
        val store = BobbyQuotaStore({ owner })
        val old = store.beginRead()
        store.reset()
        assertFalse(store.applyRead(old, snapshot()))
        assertNull(store.state.value.access)
    }
}
