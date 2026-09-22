import XCTest
import Foundation
@testable import Bobby

private final class AuditAuthProtocol: URLProtocol {
    static var handler: ((AuditAuthProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool {
        ["qbvdqkknnuweatptjohi.supabase.co", "bobbyprotocol.xyz"].contains(request.url?.host ?? "")
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handler?(self) }
    override func stopLoading() {}
    func respond(status: Int, body: String) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Audit-only regression probes. No production requests or real credentials.
final class ReleaseAuditTests: XCTestCase {
    private let service = "xyz.bobbyprotocol.bobby.session"
    override func setUp() {
        super.setUp()
        URLProtocol.registerClass(AuditAuthProtocol.self)
        Keychain.delete(service: service)
    }
    override func tearDown() {
        AuditAuthProtocol.handler = nil
        URLProtocol.unregisterClass(AuditAuthProtocol.self)
        Keychain.delete(service: service)
        super.tearDown()
    }

    @MainActor private func expiredAccount() -> AccountSession {
        Keychain.write(StoredSession(accessToken: "audit-expired", refreshToken: "audit-refresh", expiresAt: Date(timeIntervalSince1970: 0), userId: "audit-user"), service: service)
        let account = AccountSession()
        XCTAssertNotNil(account.session, "Audit fixture must persist an expired synthetic session before testing")
        return account
    }

    @MainActor func testSignOutMustWinOverAnInflightRefresh() async {
        let account = expiredAccount()
        let started = expectation(description: "refresh request started")
        var pending: AuditAuthProtocol?
        AuditAuthProtocol.handler = { request in pending = request; started.fulfill() }
        let task = Task { await account.accessToken() }
        await fulfillment(of: [started], timeout: 3)
        account.signOut()
        pending?.respond(status: 200, body: "{\"access_token\":\"audit-new\",\"refresh_token\":\"audit-new-refresh\",\"expires_in\":3600,\"user\":{\"id\":\"audit-user\"}}")
        _ = await task.value
        XCTAssertNil(account.session, "A completed refresh must not sign a user back in after sign-out")
        XCTAssertNil(Keychain.read(service: service), "Sign-out must leave no persisted session")
    }

    @MainActor func testRefreshRateLimitMustPreserveSession() async {
        let account = expiredAccount()
        AuditAuthProtocol.handler = { $0.respond(status: 429, body: "{\"error_description\":\"rate limited\"}") }
        _ = await account.accessToken()
        XCTAssertNotNil(account.session, "HTTP 429 is temporary and does not revoke a refresh token")
    }

    @MainActor func testFirstSyncMustNotLeakAnotherAccountsCompanion() {
        let store = CompanionStore()
        store.companionId = "axiom"
        store.bind(to: "audit-account-A")
        store.unbind()
        store.bind(to: "audit-account-B")
        store.applyServer(ServerProgress(xp: 0, streak: 0, aura: 0, routeIndex: 0, lastDay: nil, dailyAwards: 0, dailyAwardsDay: nil, companionId: "byte"), acknowledged: [])
        XCTAssertEqual(store.companionId, "byte", "Restoring account B should use B's saved companion, not account A's")
        store.unbind()
    }

    func testEquitiesNeverOfferDailyCandlesAsFourHours() {
        XCTAssertFalse(MarketTimeframe.available(isEquity: true).contains(.fourHours))
        XCTAssertTrue(MarketTimeframe.available(isEquity: false).contains(.fourHours))
    }

    func testDebateRequiresAllThreeArgumentsAndPreservesQuestion() async {
        AuditAuthProtocol.handler = { request in
            XCTAssertEqual(request.request.url?.path, "/api/desk-debate")
            XCTAssertEqual(request.request.value(forHTTPHeaderField: "Origin"), "https://bobbyprotocol.xyz")
            request.respond(status: 200, body: "{\"market\":{\"price\":100},\"agents\":{\"alpha\":\"A conditional opportunity\",\"red\":\"It needs confirmation\",\"cio\":\"Wait for further evidence\",\"verdict\":\"wait\"}}")
        }
        let answer = await BobbyAPI.debate("BTC", question: "What could invalidate this trend?")
        XCTAssertFalse(answer.isUnavailable)
        XCTAssertTrue(answer.isNoTrade)
        XCTAssertEqual(answer.summary, "Wait for further evidence")
        AuditAuthProtocol.handler = { $0.respond(status: 200, body: "{\"market\":{\"price\":100},\"agents\":{\"alpha\":\"Only one answered\"}}") }
        let incomplete = await BobbyAPI.debate("BTC", question: "What could invalidate this trend?")
        XCTAssertTrue(incomplete.isUnavailable)
        XCTAssertFalse(incomplete.isNoTrade)
    }

    func testAvatarNarrationDoesNotRequestMicrophoneOrSpeechRecognition() {
        XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription"))
        XCTAssertNil(Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription"))
    }
}
