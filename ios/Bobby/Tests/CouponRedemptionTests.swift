import Foundation
import XCTest
@testable import Bobby

/// Every transport is injected and local. No coupon, account, purchase or device is consumed.
@MainActor
final class CouponRedemptionTests: XCTestCase {
    private final class Identity {
        var user: String? = "account-a"
        var generation = UUID()
        func switchTo(_ user: String?) { self.user = user; generation = UUID() }
    }

    private final class Deferred<Value> {
        private var reply: CheckedContinuation<Value, Error>?
        private var started: CheckedContinuation<Void, Never>?
        private var isStarted = false
        func wait() async throws -> Value {
            isStarted = true
            started?.resume(); started = nil
            return try await withCheckedThrowingContinuation { reply = $0 }
        }
        func waitForStart() async {
            if isStarted { return }
            await withCheckedContinuation { started = $0 }
        }
        func complete(_ value: Value) { reply?.resume(returning: value); reply = nil }
        func fail(_ error: Error) { reply?.resume(throwing: error); reply = nil }
    }

    private func credits(_ reads: Any = 10, _ deep: Any = 0, _ max: Any = 0) -> [String: Any] {
        ["reads": reads, "profundo": deep, "maximo": max]
    }
    private func access(tier: String = "free", bonus: Any = 10) -> [String: Any] {
        ["tier": tier, "used": 10, "limit": tier == "pro" ? NSNull() : 10,
         "remaining": tier == "pro" ? NSNull() : 0, "resetsAt": NSNull(), "paywall": true, "bonus": bonus]
    }
    private func levels(deep: Any = 0, max: Any = 0) -> [String: Any] {
        ["tier": "free", "levels": [
            "profundo": ["used": 3, "limit": 3, "remaining": 0, "bonus": deep, "windowDays": 7, "resetsAt": NSNull()],
            "maximo": ["used": 1, "limit": 1, "remaining": 0, "bonus": max, "windowDays": 7, "resetsAt": NSNull()]
        ]]
    }
    private func redemption(result: String = "redeemed", grant: [String: Any]? = nil, bonus: [String: Any]? = nil) -> [String: Any] {
        ["result": result, "granted": grant ?? credits(), "bonus": bonus ?? credits(),
         "access": access(), "levels": levels()]
    }
    private func center(_ identity: Identity = Identity(),
                        send: @escaping CouponRedemptionCenter.Sender,
                        apply: @escaping CouponRedemptionCenter.ApplySnapshot = { _, _, _ in }) -> CouponRedemptionCenter {
        CouponRedemptionCenter(auth: .none, currentUser: { identity.user },
                               currentGeneration: { identity.generation }, observeAccount: false,
                               send: send, applySnapshot: apply)
    }

    func testNormalizedAuthenticatedRequestAndTenReadsComeFromConfirmedResponse() async throws {
        let identity = Identity()
        var calls = 0
        var applied: [String: Any]?
        let auth = BobbyMeterAuth(bearer: { "injected-bearer" }, refresh: { _ in nil })
        let center = CouponRedemptionCenter(auth: auth, currentUser: { identity.user },
            currentGeneration: { identity.generation }, observeAccount: false, send: { path, method, body, passedAuth, expectedOwner in
                calls += 1
                XCTAssertEqual(path, "api/bobby-access")
                XCTAssertEqual(method, "POST")
                XCTAssertEqual(body["action"] as? String, "redeem-coupon")
                XCTAssertEqual(body["code"] as? String, "GIFTS-99")
                XCTAssertEqual(body.count, 2, "The caller cannot supply a grant or a balance")
                XCTAssertEqual(expectedOwner, identity.generation)
                let bearer = await passedAuth.bearer()
                XCTAssertEqual(bearer, "injected-bearer")
                return .init(json: self.redemption(grant: self.credits(10), bonus: self.credits(40)), status: 200)
            }, applySnapshot: { body, user, generation in
                XCTAssertEqual(user, identity.user)
                XCTAssertEqual(generation, identity.generation)
                applied = body
            })
        let result = await center.redeem(code: " gifts - 99\n")
        guard case .redeemed(let receipt) = result else { return XCTFail("Expected confirmed redemption") }
        XCTAssertEqual(receipt.granted?.reads, 10, "The code's 99 is not the grant")
        XCTAssertEqual(receipt.bonus?.reads, 40, "The RPC balance is not grant + a cached allowance")
        XCTAssertTrue(receipt.balanceVerified)
        XCTAssertEqual((applied?["access"] as? [String: Any])?["bonus"] as? Int, 10)
        XCTAssertEqual(calls, 1)
        XCTAssertFalse(center.isRedeeming)
    }

    func testMultiLevelCouponKeepsEachGrantAndBonusSeparate() async {
        var applied: [String: Any]?
        let center = center(send: { _, _, _, _, _ in
            .init(json: self.redemption(grant: self.credits(10, 3, 1), bonus: self.credits(20, 8, 2)), status: 200)
        }, apply: { body, _, _ in applied = body })
        let result = await center.redeem(code: "MULTI")
        guard case .redeemed(let receipt) = result else { return XCTFail("Expected multi-level grant") }
        XCTAssertEqual(receipt.granted?.reads, 10)
        XCTAssertEqual(receipt.granted?.profundo, 3)
        XCTAssertEqual(receipt.granted?.maximo, 1)
        XCTAssertEqual(receipt.bonus?.profundo, 8)
        XCTAssertEqual(receipt.bonus?.maximo, 2)
        XCTAssertNotNil(applied?["levels"])
    }

    func testAlreadyRedeemedAppliesAuthoritativeSnapshotWithoutNewGrantOrCelebration() async {
        var applies = 0
        let center = center(send: { _, _, _, _, _ in
            .init(json: self.redemption(result: "already_redeemed", grant: self.credits(999), bonus: self.credits(10, 2, 1)), status: 200)
        }, apply: { _, _, _ in applies += 1 })
        let result = await center.redeem(code: "USED")
        guard case .alreadyRedeemed(let receipt) = result else { return XCTFail("Must distinguish the existing redemption") }
        XCTAssertNil(receipt.granted, "An old redemption cannot become a new grant")
        XCTAssertEqual(receipt.bonus?.reads, 10)
        XCTAssertTrue(receipt.balanceVerified)
        XCTAssertEqual(applies, 1)
        center.dismissOutcome()
        XCTAssertNil(center.outcome)
    }

    func testConfirmedGrantWithMissingBalanceAndOpenAnonFallbackDoesNotInventQuota() async {
        var appliedFields: [String: Any]?
        let center = center(send: { _, _, _, _, _ in
            var body = self.redemption()
            body["bonus"] = NSNull()
            body["access"] = ["tier": "anon", "used": NSNull(), "limit": NSNull(), "remaining": NSNull(), "bonus": 0, "paywall": false]
            body["levels"] = NSNull()
            return .init(json: body, status: 200)
        }, apply: { body, _, _ in appliedFields = body })
        let result = await center.redeem(code: "GIFT")
        guard case .redeemed(let receipt) = result else { return XCTFail("The grant itself was confirmed") }
        XCTAssertEqual(receipt.granted?.reads, 10)
        XCTAssertNil(receipt.bonus)
        XCTAssertFalse(receipt.balanceVerified)
        XCTAssertEqual(appliedFields?.count, 0, "OPEN anon is excluded; the empty snapshot only invalidates older GETs")
    }

    func testRpcBonusCanBeConfirmedWhileQuotaReadIsUnavailable() async {
        let center = center(send: { _, _, _, _, _ in
            var body = self.redemption(bonus: self.credits(27, 4, 2))
            body["access"] = NSNull(); body["levels"] = NSNull()
            return .init(json: body, status: 200)
        })
        let result = await center.redeem(code: "GIFT")
        guard case .redeemed(let receipt) = result else { return XCTFail("Expected confirmed gift") }
        XCTAssertEqual(receipt.bonus?.reads, 27)
        XCTAssertTrue(receipt.balanceVerified, "This verifies gift balance only, not remaining plan reads")
    }

    func testMalformedGrantCountsNeverBecomeRoundedOrZeroCredits() async {
        for value: Any in [true, -1, 0.5, "10", 1_000_000_000, Double.infinity] {
            var applies = 0
            let center = center(send: { _, _, _, _, _ in
                .init(json: self.redemption(grant: self.credits(value)), status: 200)
            }, apply: { _, _, _ in applies += 1 })
            let result = await center.redeem(code: "GIFT")
            XCTAssertEqual(result, .failed(.invalidResponse), "Rejected malformed count: \(value)")
            XCTAssertEqual(applies, 0)
        }
        let missing = center(send: { _, _, _, _, _ in .init(json: ["result": "redeemed"], status: 200) })
        let missingResult = await missing.redeem(code: "GIFT")
        XCTAssertEqual(missingResult, .failed(.invalidResponse))
        let zero = center(send: { _, _, _, _, _ in .init(json: self.redemption(grant: self.credits(0)), status: 200) })
        let zeroResult = await zero.redeem(code: "GIFT")
        XCTAssertEqual(zeroResult, .failed(.invalidResponse))
    }

    func testMalformedBonusIsNotReportedAsZeroBalance() async {
        let center = center(send: { _, _, _, _, _ in
            .init(json: self.redemption(bonus: self.credits(true)), status: 200)
        })
        let result = await center.redeem(code: "GIFT")
        XCTAssertEqual(result, .failed(.invalidResponse))
    }

    func testMalformedQuotaDoesNotEraseConfirmedGrantOrEnterSharedCenters() async {
        var appliedFields: [String: Any]?
        let center = center(send: { _, _, _, _, _ in
            var body = self.redemption()
            body["access"] = self.access(bonus: 0.5)
            body["levels"] = self.levels(deep: true)
            return .init(json: body, status: 200)
        }, apply: { body, _, _ in appliedFields = body })
        let result = await center.redeem(code: "GIFT")
        guard case .redeemed(let receipt) = result else { return XCTFail("Valid grant survives an unavailable quota read") }
        XCTAssertEqual(receipt.granted?.reads, 10)
        XCTAssertEqual(appliedFields?.count, 0)
    }

    func testFailureResultsAndTransportErrorsApplyNoSnapshot() async {
        let failures: [(Int, String, CouponRedemptionFailure)] = [
            (400, "invalid_code", .invalidCode), (200, "expired", .expired), (200, "exhausted", .exhausted),
            (401, "account_required", .accountRequired), (429, "rate_limited", .rateLimited),
            (503, "redeemed", .unavailable), (200, "unexpected", .invalidResponse)
        ]
        for (status, serverResult, expected) in failures {
            var applies = 0
            let center = center(send: { _, _, _, _, _ in
                .init(json: self.redemption(result: serverResult), status: status)
            }, apply: { _, _, _ in applies += 1 })
            let result = await center.redeem(code: "GIFT")
            XCTAssertEqual(result, .failed(expected))
            XCTAssertEqual(applies, 0)
        }
        let offline = center(send: { _, _, _, _, _ in throw URLError(.notConnectedToInternet) })
        let offlineResult = await offline.redeem(code: "GIFT")
        XCTAssertEqual(offlineResult, .failed(.unavailable))
    }

    func testLostResponseThenAlreadyRedeemedNeverAddsCreditsTwice() async {
        var calls = 0
        var applies = 0
        let center = center(send: { _, _, _, _, _ in
            calls += 1
            if calls == 1 { throw URLError(.networkConnectionLost) }
            return .init(json: self.redemption(result: "already_redeemed", bonus: self.credits(10)), status: 200)
        }, apply: { _, _, _ in applies += 1 })
        let lost = await center.redeem(code: "GIFT")
        XCTAssertEqual(lost, .failed(.unavailable))
        XCTAssertEqual(calls, 1, "No automatic redemption retry after losing the response")
        XCTAssertEqual(applies, 0)
        let retry = await center.redeem(code: "GIFT")
        guard case .alreadyRedeemed(let receipt) = retry else { return XCTFail("The server owns idempotence") }
        XCTAssertNil(receipt.granted)
        XCTAssertEqual(receipt.bonus?.reads, 10)
        XCTAssertEqual(applies, 1)
    }

    func testSignInAndCodeValidationHappenBeforeAnyRequest() async {
        let identity = Identity(); identity.user = nil
        var calls = 0
        let center = center(identity, send: { _, _, _, _, _ in calls += 1; return .init(json: nil, status: 200) })
        let signedOut = await center.redeem(code: "GIFT")
        XCTAssertEqual(signedOut, .failed(.accountRequired))
        identity.switchTo("account-a")
        for code in ["", "abc", "not_valid", String(repeating: "A", count: 33)] {
            let result = await center.redeem(code: code)
            XCTAssertEqual(result, .failed(.invalidCode))
        }
        XCTAssertEqual(calls, 0)
    }

    func testSingleFlightRejectsRepeatedTapsWithoutAnotherRequest() async {
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        var calls = 0
        let center = center(send: { _, _, _, _, _ in calls += 1; return try await pending.wait() })
        let first = Task { await center.redeem(code: "GIFT") }
        await pending.waitForStart()
        XCTAssertTrue(center.isRedeeming)
        let duplicate = await center.redeem(code: "OTHER")
        XCTAssertNil(duplicate)
        XCTAssertEqual(calls, 1)
        pending.complete(.init(json: redemption(), status: 200))
        _ = await first.value
        XCTAssertFalse(center.isRedeeming)
    }

    func testAccountSwitchABACannotPublishTheFirstAccountsLateSuccess() async {
        let identity = Identity()
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        var applies = 0
        let center = center(identity, send: { _, _, _, _, _ in try await pending.wait() }, apply: { _, _, _ in applies += 1 })
        let first = Task { await center.redeem(code: "GIFT") }
        await pending.waitForStart()
        identity.switchTo("account-b"); center.accountChanged()
        identity.switchTo("account-a"); center.accountChanged()
        pending.complete(.init(json: redemption(), status: 200))
        let result = await first.value
        XCTAssertNil(result)
        XCTAssertNil(center.outcome)
        XCTAssertEqual(applies, 0)
    }

    func testOwnerChangeIsFencedEvenBeforeTheAccountNotificationRuns() async {
        let identity = Identity()
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        var applies = 0
        let center = center(identity, send: { _, _, _, _, _ in try await pending.wait() }, apply: { _, _, _ in applies += 1 })
        let first = Task { await center.redeem(code: "GIFT") }
        await pending.waitForStart()
        identity.switchTo("account-b")
        pending.complete(.init(json: redemption(), status: 200))
        let result = await first.value
        XCTAssertNil(result)
        XCTAssertNil(center.outcome)
        XCTAssertEqual(applies, 0)
    }

    func testCancelAndNewRedemptionCannotBeOverwrittenByIgnoredTransportCancellation() async {
        let old = Deferred<CouponRedemptionCenter.Reply>()
        var calls = 0
        var applies = 0
        let center = center(send: { _, _, _, _, _ in
            calls += 1
            if calls == 1 { return try await old.wait() }
            return .init(json: self.redemption(grant: self.credits(2), bonus: self.credits(2)), status: 200)
        }, apply: { _, _, _ in applies += 1 })
        let first = Task { await center.redeem(code: "FIRST") }
        await old.waitForStart()
        center.cancel()
        XCTAssertFalse(center.isRedeeming)
        let second = await center.redeem(code: "SECOND")
        old.complete(.init(json: redemption(), status: 200))
        let oldResult = await first.value
        XCTAssertNil(oldResult)
        XCTAssertEqual(center.outcome, second)
        XCTAssertEqual(applies, 1)
    }

    func testCancelledCallingTaskDiscardsSuccessFromNonCooperativeSender() async {
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        var applies = 0
        let center = center(send: { _, _, _, _, _ in try await pending.wait() }, apply: { _, _, _ in applies += 1 })
        let caller = Task { await center.redeem(code: "GIFT") }
        await pending.waitForStart()
        caller.cancel()
        pending.complete(.init(json: redemption(), status: 200))
        let result = await caller.value
        XCTAssertNil(result)
        XCTAssertEqual(applies, 0)
        XCTAssertFalse(center.isRedeeming)
        XCTAssertNil(center.outcome)
    }

    func testAccountChangeClearsAnAlreadyVisibleReceipt() async {
        let identity = Identity()
        let center = center(identity, send: { _, _, _, _, _ in .init(json: self.redemption(), status: 200) })
        _ = await center.redeem(code: "GIFT")
        XCTAssertNotNil(center.outcome)
        identity.switchTo(nil)
        center.accountChanged()
        XCTAssertNil(center.outcome)
    }

    func testConfirmedCouponInvalidatesSuspendedAccessGetAndPreservesStoreFields() async throws {
        let identity = Identity()
        let center = BobbyAccessCenter(observeAccount: false)
        center.currentUser = { identity.user }; center.currentGeneration = { identity.generation }
        center.auth = .none; center.clear()
        center.load = { _ in
            ["access": self.access(tier: "pro", bonus: 0), "subscription": ["provider": "apple", "status": "active"],
             "payments": ["apple": true, "revenuecat": true]]
        }
        let initial = await center.refresh()
        XCTAssertTrue(initial)
        let oldSubscription = center.subscription
        let pending = Deferred<[String: Any]?>()
        center.load = { _ in try await pending.wait() }
        let oldGet = Task { await center.refresh() }
        await pending.waitForStart()
        let couponAccess = try XCTUnwrap(BobbyReadAccess(json: access(tier: "pro", bonus: 10)))
        XCTAssertTrue(center.recordCouponAccess(couponAccess, userID: "account-a", generation: identity.generation))
        pending.complete(["access": access(tier: "pro", bonus: 0), "subscription": NSNull(), "payments": ["apple": false]])
        let staleApplied = await oldGet.value
        XCTAssertFalse(staleApplied)
        XCTAssertEqual(center.access?.bonus, 10)
        XCTAssertEqual(center.subscription, oldSubscription)
        XCTAssertEqual(center.applePayments, true)
    }

    func testCouponAccessRejectsWrongOwnerEpochAndAnonymousFallback() throws {
        let identity = Identity()
        let center = BobbyAccessCenter(observeAccount: false)
        center.currentUser = { identity.user }; center.currentGeneration = { identity.generation }; center.clear()
        let confirmed = try XCTUnwrap(BobbyReadAccess(json: access()))
        XCTAssertFalse(center.recordCouponAccess(confirmed, userID: "account-b", generation: identity.generation))
        XCTAssertFalse(center.recordCouponAccess(confirmed, userID: "account-a", generation: UUID()))
        let anonymous = try XCTUnwrap(BobbyReadAccess(json: access(tier: "anon")))
        XCTAssertFalse(center.recordCouponAccess(anonymous, userID: "account-a", generation: identity.generation))
        XCTAssertNil(center.access)
    }

    func testConfirmedGrantWithUnavailableQuotaInvalidatesBothOlderGets() async throws {
        let identity = Identity()
        let accessCenter = BobbyAccessCenter(observeAccount: false)
        accessCenter.currentUser = { identity.user }; accessCenter.currentGeneration = { identity.generation }
        accessCenter.auth = .none; accessCenter.clear()
        let previous = try XCTUnwrap(BobbyReadAccess(json: access(bonus: 3)))
        XCTAssertTrue(accessCenter.recordCouponAccess(previous, userID: "account-a", generation: identity.generation))
        let suite = "bobby.coupon.fallback.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let levelCenter = NucleoLevelCenter(defaults: defaults)
        levelCenter.currentUser = { identity.user }; levelCenter.currentGeneration = { identity.generation }
        levelCenter.auth = .none; levelCenter.accountChanged(force: true)
        XCTAssertTrue(levelCenter.applyCouponSnapshot(["access": access(bonus: 3), "levels": levels(deep: 2, max: 1)],
                                                       userID: "account-a", generation: identity.generation))
        let oldAccessReply = Deferred<[String: Any]?>()
        let oldLevelReply = Deferred<[String: Any]?>()
        accessCenter.load = { _ in try await oldAccessReply.wait() }
        levelCenter.load = { _ in try await oldLevelReply.wait() }
        let oldAccessGet = Task { await accessCenter.refresh() }
        let oldLevelGet = Task { await levelCenter.refresh() }
        await oldAccessReply.waitForStart(); await oldLevelReply.waitForStart()
        let coupon = center(identity, send: { _, _, _, _, _ in
            var body = self.redemption()
            body["access"] = ["tier": "anon", "used": NSNull(), "limit": NSNull(), "remaining": NSNull(), "bonus": 0, "paywall": false]
            body["levels"] = NSNull(); body["bonus"] = NSNull()
            return .init(json: body, status: 200)
        }, apply: { body, user, generation in
            accessCenter.recordCouponAccess(BobbyReadAccess(json: body["access"]), userID: user, generation: generation)
            levelCenter.applyCouponSnapshot(body, userID: user, generation: generation)
        })
        let result = await coupon.redeem(code: "GIFT")
        guard case .redeemed(let receipt) = result else { return XCTFail("The ten-read grant is confirmed") }
        XCTAssertEqual(receipt.granted?.reads, 10)
        XCTAssertFalse(receipt.balanceVerified)
        oldAccessReply.complete(["access": access(bonus: 0)])
        oldLevelReply.complete(["access": access(bonus: 0), "levels": levels()])
        let accessApplied = await oldAccessGet.value
        let levelsApplied = await oldLevelGet.value
        XCTAssertFalse(accessApplied); XCTAssertFalse(levelsApplied)
        XCTAssertEqual(accessCenter.access?.bonus, 3, "Do not replace the prior snapshot with an even older GET or invent a new balance")
        XCTAssertEqual(levelCenter.quickAccess?.bonus, 3)
        XCTAssertEqual(levelCenter.meters[.profundo]?.bonus, 2)
        XCTAssertEqual(levelCenter.meters[.maximo]?.bonus, 1)
    }


    func testRealProResponseKeepsNullPlanMeterAndConfirmedTenGiftedReads() async {
        var applied: [String: Any]?
        let center = center(send: { _, _, _, _, _ in
            var body = self.redemption(grant: self.credits(10), bonus: self.credits(10))
            body["access"] = ["tier": "pro", "used": NSNull(), "limit": NSNull(), "remaining": NSNull(),
                              "bonus": 10, "resetsAt": NSNull(), "paywall": false]
            var levelBody = self.levels(); levelBody["tier"] = "pro"; body["levels"] = levelBody
            return .init(json: body, status: 200)
        }, apply: { body, _, _ in applied = body })
        let result = await center.redeem(code: "PRO-GIFT")
        guard case .redeemed(let receipt) = result else { return XCTFail("Pro coupons still confirm their gift") }
        XCTAssertEqual(receipt.granted?.reads, 10)
        XCTAssertEqual(receipt.bonus?.reads, 10)
        let access = applied?["access"] as? [String: Any]
        XCTAssertEqual(access?["tier"] as? String, "pro")
        XCTAssertTrue(access?["used"] is NSNull)
        XCTAssertTrue(access?["limit"] is NSNull)
        XCTAssertTrue(access?["remaining"] is NSNull)
        XCTAssertEqual(access?["bonus"] as? Int, 10)
        XCTAssertNotNil(applied?["levels"])
    }

    func testUnknownUsedIsAcceptedOnlyForCoherentUnlimitedProMeter() async {
        for tier in ["free", "pro"] {
            var applied: [String: Any]?
            let center = center(send: { _, _, _, _, _ in
                var body = self.redemption()
                var access = self.access(tier: tier); access["used"] = NSNull(); access["limit"] = 10
                body["access"] = access; body["levels"] = NSNull()
                return .init(json: body, status: 200)
            }, apply: { body, _, _ in applied = body })
            _ = await center.redeem(code: "GIFT")
            XCTAssertNil(applied?["access"], "Null used with a finite limit is an unavailable quota read")
        }
    }

    func testSynchronousSnapshotSubscriberAccountChangeCannotPublishReceiptToNewOwner() async {
        let identity = Identity()
        let center = center(identity, send: { _, _, _, _, _ in .init(json: self.redemption(), status: 200) },
                            apply: { _, _, _ in identity.switchTo("account-b") })
        let result = await center.redeem(code: "GIFT")
        XCTAssertNil(result)
        XCTAssertNil(center.outcome)
        XCTAssertFalse(center.isRedeeming)
    }


    func testRealAlreadyRedeemedNullGrantAndBonusReadsAllThreeValidatedGiftBalances() async {
        for reads in [0, 12] {
            let center = center(send: { _, _, _, _, _ in
                var body = self.redemption(result: "already_redeemed")
                body["granted"] = NSNull(); body["bonus"] = NSNull()
                body["access"] = self.access(bonus: reads)
                body["levels"] = self.levels(deep: reads == 0 ? 0 : 3, max: reads == 0 ? 0 : 1)
                return .init(json: body, status: 200)
            })
            let result = await center.redeem(code: "USED")
            guard case .alreadyRedeemed(let receipt) = result else { return XCTFail("Do not celebrate an existing redemption") }
            XCTAssertNil(receipt.granted, "No newly granted gift is attributed to this request")
            XCTAssertEqual(receipt.bonus?.reads, reads)
            XCTAssertEqual(receipt.bonus?.profundo, reads == 0 ? 0 : 3)
            XCTAssertEqual(receipt.bonus?.maximo, reads == 0 ? 0 : 1)
            XCTAssertTrue(receipt.balanceVerified, "Zero is a confirmed server gift balance too")
        }
    }

    func testAlreadyRedeemedIncompleteQuotaCannotDeriveGiftBalance() async {
        let center = center(send: { _, _, _, _, _ in
            var body = self.redemption(result: "already_redeemed")
            body["granted"] = NSNull(); body["bonus"] = NSNull(); body["levels"] = NSNull()
            return .init(json: body, status: 200)
        })
        let result = await center.redeem(code: "USED")
        guard case .alreadyRedeemed(let receipt) = result else { return XCTFail("The prior redemption is still known") }
        XCTAssertNil(receipt.granted)
        XCTAssertNil(receipt.bonus)
        XCTAssertFalse(receipt.balanceVerified)
    }


    func testAccountChangeBeforeInnerRequestTaskStartsDoesNotInvokeSender() async {
        let identity = Identity()
        var calls = 0
        var didSwitch = false
        var center: CouponRedemptionCenter?
        center = CouponRedemptionCenter(auth: .none, currentUser: {
            if center?.isRedeeming == true, !didSwitch {
                didSwitch = true
                identity.switchTo("account-b")
            }
            return identity.user
        }, currentGeneration: { identity.generation }, observeAccount: false,
        send: { _, _, _, _, _ in calls += 1; return .init(json: self.redemption(), status: 200) },
        applySnapshot: { _, _, _ in XCTFail("A different account cannot receive this snapshot") })
        let result = await center?.redeem(code: "GIFT")
        XCTAssertNil(result)
        XCTAssertTrue(didSwitch, "The account changes at the task's dispatch boundary")
        XCTAssertEqual(calls, 0, "Checking the owner only after the sender would already mutate account B")
        XCTAssertNil(center?.outcome)
    }

    func testExpectedApiOwnerRejectsBeforeReadingABearer() async {
        actor AuthProbe {
            let owner = UUID()
            private var reads = 0
            func bearer() -> String? { reads += 1; return nil }
            func count() -> Int { reads }
        }
        let probe = AuthProbe()
        let auth = BobbyMeterAuth(bearer: { await probe.bearer() }, refresh: { _ in nil }, owner: { await probe.owner })
        do {
            // The mismatch must throw before a bearer is read or any transport is reached.
            _ = try await BobbyAccessAPI.send(BobbyAccessAPI.accessPath, method: "POST",
                                              body: ["action": "redeem-coupon", "code": "TEST-ONLY"],
                                              auth: auth, expectedOwner: UUID())
            XCTFail("Expected the captured owner fence to reject dispatch")
        } catch is CancellationError {} catch { XCTFail("Unexpected error: \(error)") }
        let reads = await probe.count()
        XCTAssertEqual(reads, 0)
    }


    func testUnlimitedProConsumeReplyWithoutBonusPreservesConfirmedGiftAndExplicitZeroClearsIt() throws {
        let identity = Identity()
        let center = BobbyAccessCenter(observeAccount: false)
        center.currentUser = { identity.user }; center.currentGeneration = { identity.generation }; center.clear()
        let coupon = try XCTUnwrap(BobbyReadAccess(json: ["tier": "pro", "used": NSNull(), "limit": NSNull(),
                                                         "remaining": NSNull(), "paywall": false, "bonus": 10]))
        XCTAssertTrue(coupon.bonusProvided)
        XCTAssertTrue(center.recordCouponAccess(coupon, userID: "account-a", generation: identity.generation))
        let consumed = try XCTUnwrap(BobbyReadAccess(json: ["tier": "pro", "used": NSNull(), "limit": NSNull(),
                                                           "remaining": NSNull(), "paywall": false]))
        XCTAssertFalse(consumed.bonusProvided)
        center.record(consumed)
        XCTAssertEqual(center.access?.bonus, 10, "Unlimited Pro Quick does not consume the gifted balance")
        let explicitZero = try XCTUnwrap(BobbyReadAccess(json: ["tier": "pro", "used": NSNull(), "limit": NSNull(),
                                                               "remaining": NSNull(), "paywall": false, "bonus": 0]))
        XCTAssertTrue(explicitZero.bonusProvided)
        center.record(explicitZero)
        XCTAssertEqual(center.access?.bonus, 0, "A server-provided zero must replace the old balance")
    }

    func testMissingProBonusCannotCarryAnotherAccountOrEpochsGift() throws {
        let identity = Identity()
        let center = BobbyAccessCenter(observeAccount: false)
        center.currentUser = { identity.user }; center.currentGeneration = { identity.generation }; center.clear()
        let coupon = try XCTUnwrap(BobbyReadAccess(json: access(tier: "pro", bonus: 10)))
        XCTAssertTrue(center.recordCouponAccess(coupon, userID: "account-a", generation: identity.generation))
        let consumed = try XCTUnwrap(BobbyReadAccess(json: ["tier": "pro", "used": NSNull(), "limit": NSNull(),
                                                           "remaining": NSNull(), "paywall": false]))
        identity.switchTo("account-a")
        center.record(consumed)
        XCTAssertEqual(center.access?.bonus, 0, "Returning to the same user in another epoch is not the same gift snapshot")
        XCTAssertFalse(center.access?.bonusProvided ?? true)
        XCTAssertTrue(center.recordCouponAccess(coupon, userID: "account-a", generation: identity.generation))
        identity.switchTo("account-b")
        center.record(consumed)
        XCTAssertEqual(center.access?.bonus, 0)
        XCTAssertFalse(center.access?.bonusProvided ?? true)
    }


    func testAccountIntentCapturedAtTapCannotRedeemForAnotherAccountBeforeOuterTaskStarts() async {
        let identity = Identity()
        var calls = 0
        var applies = 0
        let center = center(identity, send: { _, _, _, _, _ in
            calls += 1; return .init(json: self.redemption(), status: 200)
        }, apply: { _, _, _ in applies += 1 })
        let tappedUser = identity.user
        let tappedGeneration = identity.generation
        identity.switchTo("account-b")
        let result = await center.redeem(code: "GIFT", expectedUserID: tappedUser, expectedGeneration: tappedGeneration)
        XCTAssertNil(result)
        XCTAssertEqual(calls, 0, "The tap belonged to account A even if the outer UI task starts under B")
        XCTAssertEqual(applies, 0)
        XCTAssertNil(center.outcome)
        XCTAssertFalse(center.isRedeeming)
    }

    func testTapIntentRejectsABAEpochBeforeOuterTaskStarts() async {
        let identity = Identity()
        var calls = 0
        let center = center(identity, send: { _, _, _, _, _ in
            calls += 1; return .init(json: self.redemption(), status: 200)
        })
        let tappedUser = identity.user
        let tappedGeneration = identity.generation
        identity.switchTo("account-b")
        identity.switchTo("account-a")
        let result = await center.redeem(code: "GIFT", expectedUserID: tappedUser, expectedGeneration: tappedGeneration)
        XCTAssertNil(result)
        XCTAssertEqual(calls, 0, "Returning to the same user does not revive a prior tap")
        XCTAssertNil(center.outcome)
    }

    func testMatchingTapIntentStillRedeemsUsingItsCapturedAccountGeneration() async {
        let identity = Identity()
        var calls = 0
        let center = center(identity, send: { _, _, _, _, expectedGeneration in
            calls += 1; XCTAssertEqual(expectedGeneration, identity.generation)
            return .init(json: self.redemption(), status: 200)
        })
        let result = await center.redeem(code: "GIFT", expectedUserID: identity.user, expectedGeneration: identity.generation)
        guard case .redeemed = result else { return XCTFail("A current tap must remain usable") }
        XCTAssertEqual(calls, 1)
    }


    func testFreshBalanceGetRejectsMissingAccessEmptyMetersAndMismatchedTiers() async {
        var missingAccess: [String: Any] = ["levels": levels()]
        var emptyMeters = ["access": access(), "levels": ["tier": "free", "levels": ["profundo": [:], "maximo": [:]]]] as [String: Any]
        var missingMax = levels(); (missingMax["levels"] as? [String: Any]).map { var per = $0; per.removeValue(forKey: "maximo"); missingMax["levels"] = per }
        var cases: [[String: Any]] = [missingAccess, emptyMeters,
            ["access": access(), "levels": missingMax], ["access": access(), "levels": ["tier": "pro", "levels": levels()["levels"]!]]]
        var malformedAccess = access(); malformedAccess.removeValue(forKey: "bonus")
        cases.append(["access": malformedAccess, "levels": levels()])
        for body in cases {
            var applies = 0
            let center = center(send: { _, method, _, _, _ in
                XCTAssertEqual(method, "GET"); return .init(json: body, status: 200)
            }, apply: { _, _, _ in applies += 1 })
            let balance = await center.checkBalance()
            XCTAssertNil(balance, "HTTP 200 alone does not verify a complete gift balance")
            XCTAssertEqual(applies, 0)
            XCTAssertFalse(center.isCheckingBalance)
        }
    }

    func testFreshBalanceGetAcceptsExplicitSpentZerosWithoutPostOrRestore() async {
        let identity = Identity()
        var calls = 0
        var applies = 0
        let center = center(identity, send: { path, method, body, _, generation in
            calls += 1
            XCTAssertEqual(path, "api/bobby-access"); XCTAssertEqual(method, "GET")
            XCTAssertTrue(body.isEmpty, "The balance request sends no action, code or store synchronization")
            XCTAssertEqual(generation, identity.generation)
            return .init(json: ["access": self.access(bonus: 0), "levels": self.levels(deep: 0, max: 0)], status: 200)
        }, apply: { _, _, _ in applies += 1 })
        let balance = await center.checkBalance(expectedUserID: identity.user, expectedGeneration: identity.generation)
        XCTAssertEqual(balance?.reads, 0); XCTAssertEqual(balance?.profundo, 0); XCTAssertEqual(balance?.maximo, 0)
        XCTAssertEqual(calls, 1); XCTAssertEqual(applies, 1)
        XCTAssertNil(center.outcome, "Checking a balance never celebrates a new redemption")
    }

    func testFreshProBalanceGetAcceptsCoherentUnlimitedTripleNull() async {
        let center = center(send: { _, method, _, _, _ in
            XCTAssertEqual(method, "GET")
            var access = self.access(tier: "pro", bonus: 10); access["used"] = NSNull(); access["paywall"] = false
            var levels = self.levels(deep: 2, max: 1); levels["tier"] = "pro"
            return .init(json: ["access": access, "levels": levels], status: 200)
        })
        let balance = await center.checkBalance()
        XCTAssertEqual(balance?.reads, 10); XCTAssertEqual(balance?.profundo, 2); XCTAssertEqual(balance?.maximo, 1)
    }

    func testFreshBalanceCapturedOwnerAndMidRequestAccountChangesReject() async {
        let identity = Identity()
        let tappedUser = identity.user; let tappedGeneration = identity.generation
        var calls = 0
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        let center = center(identity, send: { _, _, _, _, _ in calls += 1; return try await pending.wait() })
        identity.switchTo("account-b")
        let staleTap = await center.checkBalance(expectedUserID: tappedUser, expectedGeneration: tappedGeneration)
        XCTAssertNil(staleTap); XCTAssertEqual(calls, 0)
        let request = Task { await center.checkBalance(expectedUserID: identity.user, expectedGeneration: identity.generation) }
        await pending.waitForStart()
        identity.switchTo("account-a"); center.accountChanged()
        pending.complete(.init(json: ["access": access(), "levels": levels()], status: 200))
        let balance = await request.value
        XCTAssertNil(balance); XCTAssertFalse(center.isCheckingBalance)
    }

    func testFreshBalanceCancellationDiscardsANonCooperativeGet() async {
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        var applies = 0
        let center = center(send: { _, _, _, _, _ in try await pending.wait() }, apply: { _, _, _ in applies += 1 })
        let request = Task { await center.checkBalance() }
        await pending.waitForStart()
        center.cancel()
        pending.complete(.init(json: ["access": access(), "levels": levels()], status: 200))
        let balance = await request.value
        XCTAssertNil(balance); XCTAssertEqual(applies, 0); XCTAssertFalse(center.isCheckingBalance)
    }

    func testFreshBalanceAndRedemptionShareSingleFlight() async {
        let pending = Deferred<CouponRedemptionCenter.Reply>()
        var calls = 0
        let center = center(send: { _, method, _, _, _ in calls += 1; XCTAssertEqual(method, "GET"); return try await pending.wait() })
        let first = Task { await center.checkBalance() }
        await pending.waitForStart()
        let duplicate = await center.checkBalance()
        let redemption = await center.redeem(code: "GIFT")
        XCTAssertNil(duplicate); XCTAssertNil(redemption); XCTAssertEqual(calls, 1)
        pending.complete(.init(json: ["access": access(), "levels": levels()], status: 200))
        _ = await first.value
        XCTAssertFalse(center.isCheckingBalance)
    }

}
