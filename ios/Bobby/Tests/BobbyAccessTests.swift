import Foundation
import XCTest
@testable import Bobby

/// Metered reads and Bobby Pro (Nucleo/ARCHITECTURE.md §8): the pure pieces.
final class BobbyAccessTests: XCTestCase {
    func testTheDeviceIdIsOneStableRandomUUIDv4() {
        let id = BobbyDevice.id
        XCTAssertTrue(BobbyDevice.isUUIDv4(id), id)
        XCTAssertEqual(id, id.lowercased())
        XCTAssertEqual(BobbyDevice.id, id, "generated once per install")
        XCTAssertFalse(BobbyDevice.isUUIDv4("00000000-0000-1000-8000-000000000000"), "only version 4")
    }

    func testTheAccessHeadersNameTheDeviceThePlatformAndTheBearerOnlyWhenSignedIn() {
        let anon = BobbyAccessAPI.headers(bearer: nil)
        XCTAssertEqual(anon["x-bobby-device"], BobbyDevice.id)
        XCTAssertEqual(anon["x-bobby-platform"], "ios")
        XCTAssertNil(anon["Authorization"])
        XCTAssertEqual(BobbyAccessAPI.headers(bearer: "tok")["Authorization"], "Bearer tok")
    }

    func testAccessParsingIsLenientAndNeverInvents() throws {
        let free = try XCTUnwrap(BobbyReadAccess(json: ["tier": "free", "used": 3, "limit": 10, "remaining": 7,
                                                        "resetsAt": "2026-10-03T12:00:00.000Z", "paywall": false]))
        XCTAssertEqual(free.remaining, 7)
        XCTAssertEqual(free.limit, 10)
        XCTAssertNotNil(free.resetsDate)
        XCTAssertEqual(free.json["resetsAt"] as? String, "2026-10-03T12:00:00.000Z")
        let pro = try XCTUnwrap(BobbyReadAccess(json: ["tier": "pro", "used": 40, "limit": NSNull(), "remaining": NSNull(), "resetsAt": NSNull(), "paywall": false]))
        XCTAssertTrue(pro.isPro)
        XCTAssertNil(pro.limit)
        XCTAssertTrue(pro.json["limit"] is NSNull)
        XCTAssertNil(BobbyReadAccess(json: ["tier": "vip", "used": 1]), "an unknown tier is a legacy server")
        XCTAssertNil(BobbyReadAccess(json: nil))
        let odd = try XCTUnwrap(BobbyReadAccess(json: ["tier": "anon", "used": true, "limit": -1, "remaining": "2", "resetsAt": "", "paywall": 1]))
        XCTAssertEqual(odd.used, 0, "a boolean is not a count")
        XCTAssertNil(odd.limit)
        XCTAssertNil(odd.remaining, "a string is not a count")
        XCTAssertNil(odd.resetsAt)
        XCTAssertFalse(odd.paywall, "only a JSON boolean")
    }

    func testTheRevenueCatKeyGuard() {
        XCTAssertNil(BobbyStore.usableKey(nil, debugBuild: true))
        XCTAssertNil(BobbyStore.usableKey("  ", debugBuild: true))
        XCTAssertNil(BobbyStore.usableKey("$(REVENUECAT_IOS_API_KEY)", debugBuild: true), "an unexpanded build setting is no key")
        XCTAssertEqual(BobbyStore.usableKey("test_abc", debugBuild: true), "test_abc")
        XCTAssertNil(BobbyStore.usableKey("test_abc", debugBuild: false), "a Test Store key never configures a Release build")
        XCTAssertEqual(BobbyStore.usableKey("appl_abc", debugBuild: false), "appl_abc")
        XCTAssertEqual(BobbyStore.proMonthlyID, "xyz.bobbyprotocol.bobby.pro.monthly")
        XCTAssertEqual(BobbyStore.entitlementID, "pro")
    }

    func testTheDebugKeyIsATestStoreKeyAndReleaseShipsWithout() {
        // The unit-test host is a Debug build: its Info.plist carries the Debug configuration's key.
        let key = Bundle.main.object(forInfoDictionaryKey: BobbyStore.apiKeyInfoKey) as? String
        XCTAssertNotNil(key, "REVENUECAT_IOS_API_KEY is wired into Info.plist")
        if let key, !key.isEmpty { XCTAssertTrue(key.hasPrefix("test_") || key.hasPrefix("appl_"), key) }
    }

    /// The screenshot override (`-qa-sales-open`) must never reach Release: every line that names it sits
    /// inside an `#if DEBUG` branch of the app's sources.
    func testTheSalesOpenOverrideIsDebugOnly() throws {
        let sources = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources")
        let files = try XCTUnwrap(FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil))
            .compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertFalse(files.isEmpty, "app sources not found at \(sources.path)")
        var seen = 0
        for file in files {
            var stack: [String] = []   // "debug" = inside `#if DEBUG`, "other" otherwise
            for (n, raw) in try String(contentsOf: file, encoding: .utf8).components(separatedBy: .newlines).enumerated() {
                let line = raw.trimmingCharacters(in: .whitespaces)
                if line.hasPrefix("#if ") { stack.append(line == "#if DEBUG" ? "debug" : "other"); continue }
                if line.hasPrefix("#elseif") || line.hasPrefix("#else") { if !stack.isEmpty { stack[stack.count - 1] = "other" }; continue }
                if line.hasPrefix("#endif") { _ = stack.popLast(); continue }
                guard raw.contains("-qa-sales-open") || raw.contains("qaSalesOpen") else { continue }
                seen += 1
                XCTAssertTrue(stack.contains("debug"), "\(file.lastPathComponent):\(n + 1) uses the sales-open override outside #if DEBUG")
            }
        }
        XCTAssertGreaterThan(seen, 0, "the override was not found: update this guard if it was removed")
#if DEBUG
        XCTAssertFalse(BobbyAccessCenter.qaSalesOpen, "the unit-test host never launches with -qa-sales-open")
#endif
    }

    func testPurchasesRequireBothServerFlags() {
        XCTAssertFalse(BobbyAccessCenter.paymentsReady(nil))
        XCTAssertFalse(BobbyAccessCenter.paymentsReady(["apple": true]))
        XCTAssertFalse(BobbyAccessCenter.paymentsReady(["apple": true, "revenuecat": false]))
        XCTAssertFalse(BobbyAccessCenter.paymentsReady(["apple": false, "revenuecat": true]))
        XCTAssertFalse(BobbyAccessCenter.paymentsReady(["apple": 1, "revenuecat": true]))
        XCTAssertTrue(BobbyAccessCenter.paymentsReady(["apple": true, "revenuecat": true]))
    }

    func testMissingOrFreeAccessCannotConfirmPro() {
        XCTAssertFalse(BobbyStore.serverConfirmedPro(.accepted(nil)))
        XCTAssertFalse(BobbyStore.serverConfirmedPro(.accepted(BobbyReadAccess(tier: "free", used: 0, limit: 10, remaining: 10, resetsAt: nil, paywall: true))))
        XCTAssertFalse(BobbyStore.serverConfirmedPro(.unreachable))
        XCTAssertTrue(BobbyStore.serverConfirmedPro(.accepted(BobbyReadAccess(tier: "pro", used: 0, limit: nil, remaining: nil, resetsAt: nil, paywall: false))))
    }

    func testFailedSubscriptionSyncCanRetryTheSameExpiry() throws {
        var state = BobbySubscriptionSyncState()
        let key = BobbySubscriptionSyncState.Key(userID: "account-a", generation: UUID(), expiry: nil)
        let first = try XCTUnwrap(state.begin(key))
        XCTAssertNil(state.begin(key), "deduplicate while in flight")
        state.finish(first, succeeded: false)
        XCTAssertNil(state.confirmed)
        let retry = try XCTUnwrap(state.begin(key), "a failed call must not suppress the next callback")
        state.finish(retry, succeeded: true)
        XCTAssertEqual(state.confirmed, key)
        XCTAssertNil(state.begin(key), "only confirmed success is deduplicated")
    }

    func testOldAccountAndExpiryCallbacksCannotOverwriteNewSync() throws {
        var state = BobbySubscriptionSyncState()
        let old = try XCTUnwrap(state.begin(.init(userID: "account-a", generation: UUID(), expiry: nil)))
        state.reset()
        let current = try XCTUnwrap(state.begin(.init(userID: "account-a", generation: UUID(), expiry: Date())))
        state.finish(old, succeeded: true)
        XCTAssertNil(state.confirmed)
        XCTAssertEqual(state.pending, current)
        state.finish(current, succeeded: true)
        XCTAssertEqual(state.confirmed, current.key)
        let renewal = try XCTUnwrap(state.begin(.init(userID: current.key.userID, generation: current.key.generation, expiry: Date(timeIntervalSinceNow: 3600))))
        state.finish(current, succeeded: true)
        XCTAssertEqual(state.pending, renewal)
    }

    func testThePeriodNames() {
        XCTAssertEqual(BobbyStore.periodName(value: 1, unit: .month, spanish: false), "month")
        XCTAssertEqual(BobbyStore.periodName(value: 1, unit: .month, spanish: true), "mes")
        XCTAssertEqual(BobbyStore.periodName(value: 3, unit: .month, spanish: false), "3 months")
        XCTAssertEqual(BobbyStore.periodName(value: 1, unit: .year, spanish: true), "año")
    }

    func testTheAccountSheetReadsLine() throws {
        let utc = TimeZone(identifier: "UTC")!
        XCTAssertEqual(BobbyAccessAPI.day(BobbyAccessAPI.date("2026-10-03T12:00:00.000Z")!, spanish: false, timeZone: utc), "October 3")
        XCTAssertEqual(BobbyAccessAPI.day(BobbyAccessAPI.date("2026-10-03T12:00:00Z")!, spanish: true, timeZone: utc), "3 de octubre")

        let free = BobbyReadAccess(tier: "free", used: 3, limit: 10, remaining: 7, resetsAt: "2026-10-03T12:00:00.000Z", paywall: false)
        let row = try XCTUnwrap(ReadsRow.content(access: free, subscription: nil, signedIn: true, spanish: false))
        XCTAssertEqual(row.title, "7 of 10 free reads left this week")
        XCTAssertTrue(row.detail?.hasPrefix("Resets October") == true, row.detail ?? "")
        XCTAssertFalse(row.manage)
        XCTAssertEqual(ReadsRow.content(access: free, subscription: nil, signedIn: true, spanish: true)?.title, "Te quedan 7 de 10 lecturas gratis esta semana")

        let anon = BobbyReadAccess(tier: "anon", used: 1, limit: 3, remaining: nil, resetsAt: nil, paywall: false)
        let anonRow = try XCTUnwrap(ReadsRow.content(access: anon, subscription: nil, signedIn: false, spanish: false))
        XCTAssertEqual(anonRow.title, "2 of 3 free reads left", "remaining falls back to limit − used")
        XCTAssertNotNil(anonRow.detail)

        let pro = BobbyReadAccess(tier: "pro", used: 12, limit: nil, remaining: nil, resetsAt: nil, paywall: false)
        let apple = BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z")
        let proRow = try XCTUnwrap(ReadsRow.content(access: pro, subscription: apple, signedIn: true, spanish: false))
        XCTAssertEqual(proRow.title, "Bobby Pro · Active")
        XCTAssertTrue(proRow.detail?.hasPrefix("Unlimited Quick reads (fair use) · 60 Deep and 10 Max every 30 days") == true, proRow.detail ?? "")
        XCTAssertEqual(ReadsRow.content(access: pro, subscription: apple, signedIn: true, spanish: true)?.title, "Bobby Pro · Activo")
        XCTAssertTrue(proRow.pro)
        XCTAssertTrue(proRow.manage, "an App Store subscription is managed from the phone")
        XCTAssertTrue(proRow.detail?.contains("renews") == true)
        let web = BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: nil)
        XCTAssertEqual(ReadsRow.content(access: pro, subscription: web, signedIn: true, spanish: false)?.manage, false)
        let giftedUntil = "2099-10-10T12:00:00Z"
        let gifted = try XCTUnwrap(ReadsRow.content(access: pro, subscription: nil, signedIn: true,
                                                   grantUntil: giftedUntil, grantSource: "admin", spanish: false))
        XCTAssertEqual(gifted.title, "Bobby Pro · Gifted")
        XCTAssertTrue(gifted.detail?.contains("gifted Pro until") == true)
        XCTAssertTrue(gifted.detail?.contains("2099") == true, "gift expiry includes the year")
        XCTAssertFalse(gifted.manage, "an admin gift has no App Store subscription to manage")
        let expiredApple = BobbySubscription(provider: "apple", status: "expired", currentPeriodEnd: "2020-01-01T00:00:00Z")
        XCTAssertEqual(ReadsRow.content(access: pro, subscription: expiredApple, signedIn: true,
                                        grantUntil: giftedUntil, grantSource: "admin", spanish: true)?.title,
                       "Bobby Pro · Regalado", "an expired paid row cannot hide the live grant")
        XCTAssertEqual(ReadsRow.content(access: pro, subscription: apple, signedIn: true,
                                        grantUntil: giftedUntil, grantSource: "admin", spanish: false)?.title,
                       "Bobby Pro · Active", "a live paid period retains its subscription controls")
        XCTAssertTrue(ReadsRow.content(access: pro, subscription: apple, signedIn: true,
                                       grantUntil: giftedUntil, grantSource: "admin", spanish: false)?.detail?.contains("gifted Pro until") == true,
                      "a gift scheduled after the paid period remains visible on the phone")
        XCTAssertEqual(NucleoReferral(json: ["code": "ABCDEFGH", "url": "https://bobbyprotocol.xyz/desk?ref=ABCDEFGH",
                                            "accepted": 0, "max": 5, "proUntil": giftedUntil, "proSource": "admin"])?.proSource, "admin")
        XCTAssertNil(ReadsRow.content(access: nil, subscription: nil, signedIn: true), "no server word, no line")
    }

    func testProProfileKeepsSubscriptionAndShowsAllGiftBalancesSeparately() throws {
        let access = try XCTUnwrap(BobbyReadAccess(json: ["tier": "pro", "used": 40, "bonus": 20,
                                                         "limit": NSNull(), "remaining": NSNull(), "paywall": false]))
        let meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try XCTUnwrap(NucleoLevelMeter(json: ["used": 60, "limit": 60, "remaining": 0, "bonus": 3])),
            .maximo: try XCTUnwrap(NucleoLevelMeter(json: ["used": 10, "limit": 10, "remaining": 0, "bonus": 1]))
        ]
        let subscription = BobbySubscription(provider: "apple", status: "active", currentPeriodEnd: "2026-10-27T12:00:00Z")
        let plan = try XCTUnwrap(ReadsRow.content(access: access, subscription: subscription, signedIn: true, spanish: true))
        XCTAssertEqual(plan.title, "Bobby Pro · Activo")
        XCTAssertTrue(plan.manage)
        XCTAssertFalse(plan.title.contains("20"), "Gifts do not become part of the subscription or its allowance")
        let gifts = try XCTUnwrap(GiftedReadsRow.content(access: access, meters: meters, spanish: true))
        XCTAssertEqual(gifts.title, "Lecturas de regalo")
        XCTAssertEqual(gifts.detail, "Rápido: 20 · Profundo: 3 · Máximo: 1")
        XCTAssertEqual(GiftedReadsRow.content(access: access, meters: meters, spanish: false)?.detail,
                       "Quick: 20 · Deep: 3 · Max: 1")
    }

    func testFreeProfileKeepsQuickGiftWithItsMeterAndShowsPremiumGiftsSeparately() throws {
        let access = BobbyReadAccess(tier: "free", used: 10, limit: 10, remaining: 0, resetsAt: nil, paywall: true, bonus: 20)
        let meters: [NucleoAnalysisLevel: NucleoLevelMeter] = [
            .profundo: try XCTUnwrap(NucleoLevelMeter(json: ["used": 3, "limit": 3, "bonus": 2])),
            .maximo: try XCTUnwrap(NucleoLevelMeter(json: ["used": 1, "limit": 1, "bonus": 0]))
        ]
        let plan = try XCTUnwrap(ReadsRow.content(access: access, subscription: nil, signedIn: true, spanish: true))
        XCTAssertTrue(plan.title.contains("0 de 10"))
        XCTAssertTrue(plan.title.contains("20 lecturas de regalo"))
        XCTAssertFalse(plan.pro, "A gift never confers paid Pro")
        XCTAssertEqual(GiftedReadsRow.content(access: access, meters: meters, spanish: true)?.detail, "Profundo: 2")
    }

    func testProfileGiftLineTracksFreshServerBalancesAndHidesEmptyOrUnknownAccounts() throws {
        let pro = BobbyReadAccess(tier: "pro", used: 0, limit: nil, remaining: nil, resetsAt: nil, paywall: false)
        let credited = try XCTUnwrap(NucleoLevelMeter(json: ["limit": 60, "remaining": 0, "bonus": 1]))
        let spent = try XCTUnwrap(NucleoLevelMeter(json: ["limit": 60, "remaining": 0, "bonus": 0]))
        XCTAssertEqual(GiftedReadsRow.content(access: pro, meters: [.profundo: credited], spanish: false)?.detail, "Deep: 1")
        XCTAssertNil(GiftedReadsRow.content(access: pro, meters: [.profundo: spent]))
        XCTAssertEqual(GiftedReadsRow.content(access: pro, meters: [.profundo: credited], spanish: false)?.detail,
                       "Deep: 1", "A refunded balance is displayed after the next server refresh")
        XCTAssertNil(GiftedReadsRow.content(access: nil, meters: [.profundo: credited]), "No gifts from a previous account")
        XCTAssertNil(GiftedReadsRow.content(access: pro, meters: [:]))
    }

    @MainActor func testLatePremiumGiftRefreshCannotPopulateTheNextAccountsProfile() async throws {
        let suite = "BobbyAccessTests.gifts.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let center = NucleoLevelCenter(defaults: defaults)
        var user: String? = "account-a"
        var epoch = UUID()
        center.currentUser = { user }
        center.currentGeneration = { epoch }
        center.auth = .none
        center.accountChanged(force: true)
        let oldBody: [String: Any] = ["levels": ["tier": "pro", "levels": ["profundo": ["limit": 60, "bonus": 99]]]]
        center.apply(oldBody)
        let nextAccess = BobbyReadAccess(tier: "pro", used: 0, limit: nil, remaining: nil, resetsAt: nil, paywall: false)
        XCTAssertEqual(GiftedReadsRow.content(access: nextAccess, meters: center.meters, spanish: false)?.detail, "Deep: 99")
        var pending: CheckedContinuation<[String: Any]?, Never>?
        let started = expectation(description: "Old account refresh suspended")
        center.load = { _ in await withCheckedContinuation { pending = $0; started.fulfill() } }
        let refresh = Task { await center.refresh() }
        await fulfillment(of: [started], timeout: 1)
        user = "account-b"; epoch = UUID()
        center.accountChanged()
        XCTAssertNil(GiftedReadsRow.content(access: nextAccess, meters: center.meters))
        pending?.resume(returning: oldBody)
        let applied = await refresh.value
        XCTAssertFalse(applied)
        XCTAssertNil(GiftedReadsRow.content(access: nextAccess, meters: center.meters), "A late A response cannot attach gifts to B")
        user = nil; epoch = UUID()
        center.accountChanged()
        XCTAssertTrue(center.meters.isEmpty)
    }

    func testTheMeteredReadMapping() {
        func label(_ o: NucleoDeskIO.PulseOutcome) -> String {
            switch o {
            case let .answered(p, a): return "answered:\(p == nil ? "nil" : "pulse"):\(a?.tier ?? "-")"
            case let .gated(status, _, a): return "\(status):\(a?.tier ?? "-")"
            case .unreachable: return "unreachable"
            }
        }
        let anon: [String: Any] = ["tier": "anon", "used": 3, "limit": 3, "remaining": 0, "resetsAt": NSNull(), "paywall": false]
        XCTAssertEqual(label(NucleoDeskIO.parsePulseReply(status: 401, json: ["error": "x", "code": "signin_required", "access": anon])), "signin_required:anon")
        XCTAssertEqual(label(NucleoDeskIO.parsePulseReply(status: 402, json: ["error": "x", "code": "subscription_required"])), "subscription_required:-")
        XCTAssertEqual(label(NucleoDeskIO.parsePulseReply(status: 402, json: nil)), "subscription_required:-", "the status is the contract")
        let pulse: [String: Any] = ["technical_pulse": ["signal": "neutral", "direction": "none"]]
        XCTAssertEqual(label(NucleoDeskIO.parsePulseReply(status: 200, json: pulse)), "answered:pulse:-", "a legacy server: no access")
        var metered = pulse
        metered["access"] = ["tier": "free", "used": 4, "limit": 10, "remaining": 6, "resetsAt": "2026-10-03T12:00:00Z", "paywall": false]
        XCTAssertEqual(label(NucleoDeskIO.parsePulseReply(status: 200, json: metered)), "answered:pulse:free")
        XCTAssertEqual(label(NucleoDeskIO.parsePulseReply(status: 500, json: nil)), "answered:nil:-", "a broken meter is today's null pulse")
    }
}
