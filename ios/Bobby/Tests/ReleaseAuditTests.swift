import XCTest
import Foundation
import Speech
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
        let initial = StoredSession(accessToken: "audit-expired", refreshToken: "audit-refresh", expiresAt: Date(timeIntervalSince1970: 0), userId: "audit-user")
        let account = AccountSession(initialSession: initial, usesKeychain: false)
        XCTAssertNotNil(account.session, "The expired synthetic session must be installed without relying on host signing")
        return account
    }

    @MainActor func testVersionFourConsentRequiresAcknowledgingTheNewNotice() {
        let defaults = UserDefaults.standard
        let previous = defaults.object(forKey: "agent.riskNoticeVersion")
        defer {
            if let previous { defaults.set(previous, forKey: "agent.riskNoticeVersion") }
            else { defaults.removeObject(forKey: "agent.riskNoticeVersion") }
        }
        let profile = AgentProfile()
        // 5 is what build 60 stored: the dictation statement changed after it, so it must be asked again.
        XCTAssertGreaterThan(RiskNotice.currentVersion, 5)
        for stale in [4, 5, RiskNotice.currentVersion - 1] {
            profile.riskNoticeVersion = stale
            XCTAssertFalse(profile.acceptedRiskNotice, "stored \(stale)")
            XCTAssertFalse(BobbyStore.consented, "stored \(stale)")
            XCTAssertEqual(NucleoPage.route(onboarded: true, companionId: "byte", riskAccepted: profile.acceptedRiskNotice), .onboardingRisk, "stored \(stale)")
        }
        profile.riskNoticeVersion = RiskNotice.currentVersion
        XCTAssertTrue(profile.acceptedRiskNotice)
        XCTAssertTrue(BobbyStore.consented)
        XCTAssertEqual(NucleoPage.route(onboarded: true, companionId: "byte", riskAccepted: profile.acceptedRiskNotice), .app)
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
            XCTAssertEqual(request.request.value(forHTTPHeaderField: "x-bobby-platform"), "ios")
            XCTAssertNil(request.request.value(forHTTPHeaderField: MemoryCenter.nativeOptInHeader),
                         "a guest or account without native consent never affirms memory")
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

    /// Deliberately changed for the Núcleo (Nucleo/ARCHITECTURE.md §5, R8): the user may now ASK by
    /// voice (hold the pill). Both purpose strings must exist. Recognition stays on the phone whenever
    /// the recognizer holds the local model; only without one does Apple's speech service transcribe
    /// the same language, and the purpose string and risk notice say so.
    func testSpokenQuestionsDeclareMicrophoneAndSpeechAndRecognizeOnDeviceOnly() {
        let mic = Bundle.main.object(forInfoDictionaryKey: "NSMicrophoneUsageDescription") as? String
        let speech = Bundle.main.object(forInfoDictionaryKey: "NSSpeechRecognitionUsageDescription") as? String
        XCTAssertFalse((mic ?? "").trimmingCharacters(in: .whitespaces).isEmpty, "NSMicrophoneUsageDescription must explain hold-to-ask")
        XCTAssertFalse((speech ?? "").trimmingCharacters(in: .whitespaces).isEmpty, "NSSpeechRecognitionUsageDescription must explain dictation")
        XCTAssertFalse((speech ?? "").contains("never leaves"), "The purpose string must not promise on-device only (R8)")
        XCTAssertFalse(RiskNotice.statements(spanish: false)[0].body.contains("stays on your iPhone"), "The risk notice must not promise on-device only")
        XCTAssertFalse(NucleoSpeech.makeRequest(contextualStrings: [], onDevice: false).requiresOnDeviceRecognition)
        let request = NucleoSpeech.makeRequest(contextualStrings: ["NVDA", "Bitcoin"])
        XCTAssertTrue(request.requiresOnDeviceRecognition, "With the local model, audio must stay on the device (R8)")
        XCTAssertTrue(request.shouldReportPartialResults)
        XCTAssertTrue(request.addsPunctuation)
        XCTAssertEqual(request.contextualStrings, ["NVDA", "Bitcoin"])
    }

    func testTalkModePairsPurposeAndPrimerInAllSixLanguages() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let config = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("Nucleo/talk-mode.json"))) as! [String: Any]
        let copy = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("Nucleo/talk-copy.json"))) as! [String: [String: [String: String]]]
        let mode = try XCTUnwrap(config["TALK_MODE"] as? String)
        XCTAssertEqual(NucleoTalkMode.tap, mode == "tap")
        XCTAssertEqual(Bundle.main.infoDictionary?["NSMicrophoneUsageDescription"] as? String, copy["purpose"]?["en"]?[mode])
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            let purpose = try String(contentsOf: root.appendingPathComponent("Sources/\(language).lproj/InfoPlist.strings"), encoding: .utf8)
            XCTAssertTrue(purpose.contains(try XCTUnwrap(copy["purpose"]?[language]?[mode])), language)
            let primer = try XCTUnwrap(copy["primer"]?[language]?[mode])
            for page in ["app", "onboarding"] {
                let source = try String(contentsOf: root.appendingPathComponent("Nucleo/src/\(page)/40-strings.js"), encoding: .utf8)
                XCTAssertTrue(source.contains(primer), "\(language)/\(page)")
            }
        }
    }
}
