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
        XCTAssertEqual(proRow.title, "Bobby Pro")
        XCTAssertTrue(proRow.pro)
        XCTAssertTrue(proRow.manage, "an App Store subscription is managed from the phone")
        XCTAssertTrue(proRow.detail?.contains("renews") == true)
        let web = BobbySubscription(provider: "stripe", status: "active", currentPeriodEnd: nil)
        XCTAssertEqual(ReadsRow.content(access: pro, subscription: web, signedIn: true, spanish: false)?.manage, false)
        XCTAssertNil(ReadsRow.content(access: nil, subscription: nil, signedIn: true), "no server word, no line")
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
