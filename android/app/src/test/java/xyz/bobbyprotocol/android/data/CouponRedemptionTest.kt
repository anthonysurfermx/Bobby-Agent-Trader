package xyz.bobbyprotocol.android.data

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class CouponRedemptionTest {
    @Test fun normalizationMatchesTheAccountEndpointWithoutLocaleDependentCase() {
        assertEquals("AMIGOS20", CouponRedemptionPolicy.normalizedCode(" amigos\n 20 "))
        assertEquals("BOBBY-123", CouponRedemptionPolicy.normalizedCode(" bobby-123 "))
        assertNull(CouponRedemptionPolicy.normalizedCode("a"))
        assertNull(CouponRedemptionPolicy.normalizedCode("bad_code"))
        assertNull(CouponRedemptionPolicy.normalizedCode("A".repeat(513)))
    }

    @Test fun creditsRejectBooleansStringsFractionsNegativeAndOverflowCounts() {
        listOf<Any>(true, "1", 1.5, -1, 1_000_000_000L).forEach {
            assertNull(CouponRedemptionPolicy.credits(credits(1, 2, 3).put("reads", it)))
        }
        assertNull(CouponRedemptionPolicy.credits(JSONObject().put("reads", 1)))
        assertEquals(0L, CouponRedemptionPolicy.credits(credits(0, 0, 0))!!.total)
        assertEquals(2_999_999_997L, CouponRedemptionPolicy.credits(credits(999_999_999, 999_999_999, 999_999_999))!!.total)
    }

    @Test fun newlyGrantedCreditsAreConfirmedWithoutRequiringQuotaOrStoreFields() {
        val parsed = CouponRedemptionPolicy.parse(CouponReply(200,
            JSONObject().put("result", "redeemed").put("granted", credits(5, 2, 1)).put("bonus", JSONObject.NULL)))
        val outcome = parsed.outcome as CouponRedemptionOutcome.Redeemed
        assertEquals(CouponCredits(5, 2, 1), outcome.receipt.granted)
        assertNull(outcome.receipt.bonus)
        assertNull(parsed.snapshot)
    }

    @Test fun missingOrEmptyGrantCannotCreateASuccessCelebration() {
        for (grant in listOf(JSONObject.NULL, credits(0, 0, 0), credits(1, 0, 0).put("reads", true))) {
            assertEquals(CouponRedemptionFailure.INVALID_RESPONSE,
                (CouponRedemptionPolicy.parse(CouponReply(200, redeemed().put("granted", grant))).outcome
                    as CouponRedemptionOutcome.Failed).reason)
        }
    }

    @Test fun failedHttpStatusCannotBeDisguisedByARedeemedBody() {
        assertEquals(CouponRedemptionFailure.ACCOUNT_REQUIRED, failure(CouponReply(401, redeemed())))
        assertEquals(CouponRedemptionFailure.RATE_LIMITED, failure(CouponReply(429, redeemed())))
        assertEquals(CouponRedemptionFailure.UNAVAILABLE, failure(CouponReply(502, redeemed())))
        assertEquals(CouponRedemptionFailure.INVALID_RESPONSE, failure(CouponReply(400, redeemed())))
    }

    @Test fun recognizedServerRefusalsRemainSpecific() {
        mapOf("account_required" to CouponRedemptionFailure.ACCOUNT_REQUIRED,
            "invalid_code" to CouponRedemptionFailure.INVALID_CODE,
            "expired" to CouponRedemptionFailure.EXPIRED,
            "exhausted" to CouponRedemptionFailure.EXHAUSTED,
            "rate_limited" to CouponRedemptionFailure.RATE_LIMITED).forEach { (result, expected) ->
            assertEquals(expected, failure(CouponReply(200, JSONObject().put("result", result))))
        }
        assertEquals(CouponRedemptionFailure.RATE_LIMITED, failure(CouponReply(429, null)))
        assertEquals(CouponRedemptionFailure.UNAVAILABLE, failure(CouponReply(503, null)))
    }

    @Test fun actualAlreadyRedeemedNullRpcBalancesDeriveOnlyTheVerifiedSnapshot() {
        val body = snapshot(0, 0, 0).put("result", "already_redeemed")
            .put("granted", JSONObject.NULL).put("bonus", JSONObject.NULL)
        val outcome = CouponRedemptionPolicy.parse(CouponReply(200, body)).outcome as CouponRedemptionOutcome.AlreadyRedeemed
        assertNull(outcome.receipt.granted)
        assertEquals(CouponCredits(0, 0, 0), outcome.receipt.bonus)
        assertTrue(outcome.receipt.balanceVerified)
    }

    @Test fun alreadyRedeemedIgnoresAnyUntrustedNewGrantAndDoesNotInferIncompleteBalances() {
        val body = snapshot(8, 2, 1).put("result", "already_redeemed").put("granted", credits(99, 99, 99))
            .put("bonus", JSONObject.NULL).apply { remove("levels") }
        val receipt = (CouponRedemptionPolicy.parse(CouponReply(200, body)).outcome as CouponRedemptionOutcome.AlreadyRedeemed).receipt
        assertNull(receipt.granted)
        assertNull(receipt.bonus)
        assertFalse(receipt.balanceVerified)
    }

    @Test fun malformedExplicitBonusCannotBeReplacedWithADifferentInferredBalance() {
        assertEquals(CouponRedemptionFailure.INVALID_RESPONSE,
            failure(CouponReply(200, redeemed().put("bonus", credits(8, 2, 1).put("maximo", "1")))))
    }

    @Test fun coherentUnlimitedProRetainsVerifiedCouponBalances() {
        val body = redeemed()
        body.getJSONObject("access").put("tier", "pro").put("used", JSONObject.NULL)
            .put("limit", JSONObject.NULL).put("remaining", JSONObject.NULL)
        body.getJSONObject("levels").put("tier", "pro")
        val parsed = CouponRedemptionPolicy.parse(CouponReply(200, body))
        assertEquals("pro", parsed.snapshot?.access?.tier)
        assertEquals(CouponCredits(8, 2, 1), (parsed.outcome as CouponRedemptionOutcome.Redeemed).receipt.bonus)
    }

    @Test fun aSecondTapWhileRedeemingDoesNotSendAnotherPost() = runTest {
        val reply = CompletableDeferred<CouponReply>()
        var posts = 0
        val fixture = Fixture(send = { _, code -> posts++; assertEquals("AMIGOS20", code); reply.await() })
        val first = async(start = CoroutineStart.UNDISPATCHED) { fixture.controller.redeem("amigos 20") }
        assertTrue(fixture.controller.state.value.isRedeeming)
        assertNull(fixture.controller.redeem("OTHER20"))
        assertEquals(1, posts)
        reply.complete(CouponReply(200, redeemed()))
        assertTrue(first.await() is CouponRedemptionOutcome.Redeemed)
        assertEquals(1, fixture.applied)
        assertFalse(fixture.controller.state.value.isRedeeming)
    }

    @Test fun noAccountOrInvalidCodeDoesNotSendOrApplyAnything() = runTest {
        val fixture = Fixture(send = { _, _ -> fail("No POST expected"); CouponReply(200, null) })
        fixture.owner = BobbyQuotaOwner(null, 2)
        assertEquals(CouponRedemptionFailure.ACCOUNT_REQUIRED,
            (fixture.controller.redeem("AMIGOS20") as CouponRedemptionOutcome.Failed).reason)
        fixture.owner = BobbyQuotaOwner("a", 3)
        assertEquals(CouponRedemptionFailure.INVALID_CODE,
            (fixture.controller.redeem("bad_code") as CouponRedemptionOutcome.Failed).reason)
        assertEquals(0, fixture.applied)
    }

    @Test fun aLostResponseIsUnavailableAndCheckingBalanceOnlyGets() = runTest {
        var posts = 0
        var gets = 0
        val fixture = Fixture(send = { _, _ -> posts++; throw IOException("Response unavailable") },
            get = { gets++; BobbyQuotaPolicy.snapshot(snapshot(8, 2, 1), accountOnly = true) })
        assertEquals(CouponRedemptionFailure.UNAVAILABLE,
            (fixture.controller.redeem("AMIGOS20") as CouponRedemptionOutcome.Failed).reason)
        fixture.controller.checkBalance()
        assertEquals(1, posts)
        assertEquals(1, gets)
        assertEquals(0, fixture.applied)
        assertEquals(CouponCredits(8, 2, 1), fixture.controller.state.value.checkedBalance)
        assertFalse(fixture.controller.state.value.balanceUnavailable)
    }

    @Test fun aConfirmedGiftStillInvalidatesOldGetsWhenQuotaIsUnavailable() = runTest {
        val body = JSONObject().put("result", "redeemed").put("granted", credits(1, 0, 0)).put("bonus", JSONObject.NULL)
        val fixture = Fixture(send = { _, _ -> CouponReply(200, body) })
        assertTrue(fixture.controller.redeem("AMIGOS20") is CouponRedemptionOutcome.Redeemed)
        assertEquals(1, fixture.applied)
        assertNull(fixture.lastSnapshot)
    }

    @Test fun lateReplyAfterAccountAtoBtoANewEpochCannotPublishOrApply() = runTest {
        val reply = CompletableDeferred<CouponReply>()
        val fixture = Fixture(send = { _, _ -> reply.await() })
        val first = async(start = CoroutineStart.UNDISPATCHED) { fixture.controller.redeem("AMIGOS20") }
        fixture.owner = BobbyQuotaOwner("b", 2)
        fixture.owner = BobbyQuotaOwner("a", 3)
        reply.complete(CouponReply(200, redeemed()))
        assertNull(first.await())
        assertNull(fixture.controller.state.value.outcome)
        assertEquals(0, fixture.applied)
    }

    @Test fun cancelWithTransportIgnoringCancellationCannotClobberANewerOperation() = runTest {
        val oldReply = CompletableDeferred<CouponReply>()
        var posts = 0
        val fixture = Fixture(send = { _, _ ->
            posts++
            if (posts == 1) withContext(NonCancellable) { oldReply.await() }
            else CouponReply(200, redeemed().put("granted", credits(2, 0, 0)))
        })
        val old = async(start = CoroutineStart.UNDISPATCHED) { fixture.controller.redeem("AMIGOS20") }
        fixture.controller.cancel()
        val latest = fixture.controller.redeem("OTHER20") as CouponRedemptionOutcome.Redeemed
        oldReply.complete(CouponReply(200, redeemed()))
        runCatching { old.await() }
        assertTrue(old.isCancelled)
        assertEquals(1, fixture.applied)
        assertEquals(latest, fixture.controller.state.value.outcome)
        assertEquals(CouponCredits(2, 0, 0), latest.receipt.granted)
        assertFalse(fixture.controller.state.value.isRedeeming)
    }

    @Test fun accountChangedCancelsTheSheetOutcomeAndBusyState() = runTest {
        val fixture = Fixture(send = { _, _ -> CouponReply(200, redeemed()) })
        fixture.controller.redeem("AMIGOS20")
        fixture.owner = BobbyQuotaOwner("b", 2)
        fixture.controller.accountChanged()
        assertEquals(CouponRedemptionState(), fixture.controller.state.value)
    }

    @Test fun balanceCheckBlocksRedemptionAndNeverCreatesAnAwardOutcome() = runTest {
        val balance = CompletableDeferred<BobbyQuotaSnapshot?>()
        var posts = 0
        val fixture = Fixture(send = { _, _ -> posts++; CouponReply(200, redeemed()) }, get = { balance.await() })
        val checking = async(start = CoroutineStart.UNDISPATCHED) { fixture.controller.checkBalance() }
        assertNull(fixture.controller.redeem("AMIGOS20"))
        balance.complete(BobbyQuotaPolicy.snapshot(snapshot(0, 0, 0), accountOnly = true))
        checking.await()
        assertEquals(0, posts)
        assertNull(fixture.controller.state.value.outcome)
        assertEquals(CouponCredits(0, 0, 0), fixture.controller.state.value.checkedBalance)
    }

    @Test fun failedOrPartialBalanceChecksDoNotInventZeros() = runTest {
        val fixture = Fixture(send = { _, _ -> CouponReply(200, redeemed()) },
            get = { BobbyQuotaPolicy.snapshot(snapshot(8, 2, 1).apply { remove("levels") }, accountOnly = true) })
        fixture.controller.checkBalance()
        assertNull(fixture.controller.state.value.checkedBalance)
        assertTrue(fixture.controller.state.value.balanceUnavailable)
    }

    @Test fun thrownHttpExceptionsKeepTheirActualStatusInsteadOfBecomingNetworkErrors() = runTest {
        for ((status, expected) in mapOf(401 to CouponRedemptionFailure.ACCOUNT_REQUIRED,
            429 to CouponRedemptionFailure.RATE_LIMITED, 503 to CouponRedemptionFailure.UNAVAILABLE)) {
            val fixture = Fixture(send = { _, _ -> throw ApiException(status, "invalid_response") })
            assertEquals(expected, (fixture.controller.redeem("AMIGOS20") as CouponRedemptionOutcome.Failed).reason)
            assertEquals(0, fixture.applied)
        }
    }

    @Test fun queuedAccountAIntentCannotSubmitOrCheckUsingAccountB() = runTest {
        var posts = 0
        var gets = 0
        val fixture = Fixture(send = { _, _ -> posts++; CouponReply(200, redeemed()) }, get = { gets++; null })
        val visibleOwner = fixture.owner
        fixture.owner = BobbyQuotaOwner("b", 2)
        assertNull(fixture.controller.redeem("AMIGOS20", expectedOwner = visibleOwner))
        fixture.controller.checkBalance(expectedOwner = visibleOwner)
        assertEquals(0, posts)
        assertEquals(0, gets)
        assertEquals(CouponRedemptionState(), fixture.controller.state.value)
        fixture.owner = BobbyQuotaOwner("a", 3)
        assertNull(fixture.controller.redeem("AMIGOS20", expectedOwner = visibleOwner))
        assertEquals(0, posts)
    }

    @Test fun aStaleQueuedIntentDoesNotCancelTheNextOwnersValidRedemption() = runTest {
        val reply = CompletableDeferred<CouponReply>()
        val fixture = Fixture(send = { _, _ -> reply.await() })
        val oldOwner = fixture.owner
        fixture.owner = BobbyQuotaOwner("b", 2)
        val valid = async(start = CoroutineStart.UNDISPATCHED) {
            fixture.controller.redeem("OTHER20", expectedOwner = fixture.owner)
        }
        assertNull(fixture.controller.redeem("AMIGOS20", expectedOwner = oldOwner))
        fixture.controller.checkBalance(expectedOwner = oldOwner)
        assertTrue(fixture.controller.state.value.isRedeeming)
        reply.complete(CouponReply(200, redeemed()))
        assertTrue(valid.await() is CouponRedemptionOutcome.Redeemed)
        assertEquals(1, fixture.applied)
    }

    @Test fun aSupersededBalanceReadCannotShowTheOldBonusOrClearTheNewQuota() = runTest {
        val owner = BobbyQuotaOwner("a", 1)
        val store = BobbyQuotaStore({ owner })
        val fixture = Fixture(send = { _, _ -> fail("No POST expected"); CouponReply(200, null) }, get = {
            val old = store.beginRead()
            assertTrue(store.applyRead(store.beginRead(), BobbyQuotaPolicy.snapshot(snapshot(20, 2, 1), true)))
            val stale = BobbyQuotaPolicy.snapshot(snapshot(10, 2, 1), true)
            if (!store.applyRead(old, stale)) throw ApiException(409, "access_refresh_superseded")
            stale
        })
        fixture.controller.checkBalance(expectedOwner = owner)
        assertEquals(20, store.state.value.access!!.bonus)
        assertNull(fixture.controller.state.value.checkedBalance)
        assertTrue(fixture.controller.state.value.balanceUnavailable)
    }

    @Test fun accountChangeDuringSnapshotPublicationCannotPublishTheOldReceipt() = runTest {
        var owner = BobbyQuotaOwner("a", 1)
        val controller = CouponRedemptionController({ owner },
            { _, _ -> CouponReply(200, redeemed()) }, { null },
            { _, _ -> owner = BobbyQuotaOwner("b", 2); true })
        assertNull(controller.redeem("AMIGOS20"))
        assertNull(controller.state.value.outcome)
    }

    @Test fun dismissingThePopupDoesNotApplyTheReceiptAgain() = runTest {
        val fixture = Fixture(send = { _, _ -> CouponReply(200, redeemed()) })
        fixture.controller.redeem("AMIGOS20")
        fixture.controller.dismissOutcome()
        assertNull(fixture.controller.state.value.outcome)
        assertEquals(1, fixture.applied)
    }


    @Test fun completePostRpcQuotaBalanceWinsWhileGrantStaysUnchanged() {
        for (latest in listOf(CouponCredits(8, 2, 1), CouponCredits(0, 0, 0))) {
            val body = snapshot(latest.reads, latest.profundo, latest.maximo).put("result", "redeemed")
                .put("granted", credits(10, 3, 1)).put("bonus", credits(20, 8, 4))
            val receipt = (CouponRedemptionPolicy.parse(CouponReply(200, body)).outcome as CouponRedemptionOutcome.Redeemed).receipt
            assertEquals(CouponCredits(10, 3, 1), receipt.granted)
            assertEquals("Available balance follows the later complete quota reads, including zero", latest, receipt.bonus)
        }
    }
    @Test fun incompletePostRpcQuotaKeepsConfirmedRpcBalanceWithoutInventingMeters() {
        val body = snapshot(8, 2, 1).put("result", "redeemed")
            .put("granted", credits(10, 3, 1)).put("bonus", credits(20, 8, 4)).apply { remove("levels") }
        val parsed = CouponRedemptionPolicy.parse(CouponReply(200, body))
        val receipt = (parsed.outcome as CouponRedemptionOutcome.Redeemed).receipt
        assertEquals(CouponCredits(20, 8, 4), receipt.bonus)
        assertNotNull(parsed.snapshot?.access)
        assertNull(parsed.snapshot?.levels)
    }

    private class Fixture(
        send: suspend (BobbyQuotaOwner, String) -> CouponReply,
        get: suspend (BobbyQuotaOwner) -> BobbyQuotaSnapshot? = { null },
    ) {
        var owner = BobbyQuotaOwner("a", 1)
        var applied = 0
        var lastSnapshot: BobbyQuotaSnapshot? = null
        val controller = CouponRedemptionController({ owner }, send, get,
            { captured, snapshot -> check(captured == owner); applied++; lastSnapshot = snapshot; true })
    }

    private fun failure(reply: CouponReply) = (CouponRedemptionPolicy.parse(reply).outcome as CouponRedemptionOutcome.Failed).reason
    private fun credits(reads: Int, profundo: Int, maximo: Int) =
        JSONObject().put("reads", reads).put("profundo", profundo).put("maximo", maximo)
    private fun redeemed() = snapshot(8, 2, 1).put("result", "redeemed")
        .put("granted", credits(5, 2, 1)).put("bonus", credits(8, 2, 1))
    private fun snapshot(reads: Int, profundo: Int, maximo: Int): JSONObject {
        fun meter(bonus: Int) = JSONObject().put("used", 3).put("limit", 3).put("remaining", 0)
            .put("windowDays", 7).put("bonus", bonus).put("resetsAt", JSONObject.NULL)
        return JSONObject().put("access", JSONObject().put("tier", "free").put("used", 10).put("limit", 10)
            .put("remaining", 0).put("bonus", reads).put("paywall", true).put("resetsAt", JSONObject.NULL))
            .put("levels", JSONObject().put("tier", "free").put("levels",
                JSONObject().put("profundo", meter(profundo)).put("maximo", meter(maximo))))
    }
}
