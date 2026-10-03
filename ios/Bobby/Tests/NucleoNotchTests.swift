import Foundation
import XCTest
@testable import Bobby

/// Native progress, driven only by actual desk stages and NDJSON provider responses.
@MainActor
final class NucleoNotchTests: XCTestCase {
    private var previousLanguage: String?
    override func setUp() {
        super.setUp()
        previousLanguage = UserDefaults.standard.string(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }
    override func tearDown() {
        if let previousLanguage { UserDefaults.standard.set(previousLanguage, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    func testRegionalPricesUseReceivedCurrencyAndSelectedLocale() {
        let notch = NucleoNotch()
        UserDefaults.standard.set("fr", forKey: L.preferenceKey)
        notch.stage(["stage": "resolving", "requestId": "fr"])
        notch.stage(["stage": "accepted", "requestId": "fr", "asset": ["symbol": "MC.PA", "currency": "EUR"]])
        notch.stage(["stage": "market", "requestId": "fr", "market": ["price": 650.5, "changePct": 1.3]])
        XCTAssertTrue(notch.current?.text.contains("€") == true)
        XCTAssertFalse(notch.current?.text.contains("$") == true)
        XCTAssertTrue(notch.current?.text.contains("+1,3") == true)
        notch.stage(["stage": "resolving", "requestId": "br"])
        notch.stage(["stage": "accepted", "requestId": "br", "asset": ["symbol": "PETR4.SA"]])
        notch.stage(["stage": "market", "requestId": "br", "market": ["price": 32.5, "currency": "BRL"]])
        XCTAssertTrue(notch.current?.text.contains("R$") == true)
        XCTAssertFalse(notch.current?.text.contains("€") == true)
    }
    private func start(_ notch: NucleoNotch, id: String = "read-a") {
        notch.stage(["stage": "resolving", "requestId": id])
        notch.stage(["stage": "accepted", "requestId": id, "asset": ["symbol": "BTC"]])
    }

    func testMarketAndCandlesShowOnlyReceivedEvidence() {
        let notch = NucleoNotch()
        start(notch)
        XCTAssertTrue(notch.visible)
        XCTAssertTrue(notch.current?.text.contains("BTC") == true)
        notch.stage(["stage": "market", "requestId": "read-a", "market": ["price": 62000.0, "changePct": -1.3]])
        XCTAssertTrue(notch.current?.text.contains("62,000") == true)
        XCTAssertTrue(notch.current?.text.contains("-1.3%") == true)
        notch.stage(["stage": "candles", "requestId": "read-a", "candles": [1, 2, 3]])
        XCTAssertTrue(notch.current?.text.contains("3") == true)
        let last = notch.current
        notch.stage(["stage": "market", "requestId": "read-a", "market": [:]])
        notch.stage(["stage": "candles", "requestId": "read-a", "candles": []])
        XCTAssertEqual(notch.current, last, "Missing market data must not invent a progress step")
    }

    func testLateStagesCannotEnterAnotherRead() {
        let notch = NucleoNotch()
        start(notch)
        notch.stage(["stage": "resolving", "requestId": "read-b"])
        XCTAssertNil(notch.previous, "A new read cannot display the old read's line")
        let current = notch.current
        notch.stage(["stage": "market", "requestId": "read-a", "market": ["price": 1.0]])
        XCTAssertEqual(notch.current, current)
    }

    func testLiveAgentsWaitForDebateThenKeepActualOrder() {
        let notch = NucleoNotch()
        start(notch)
        notch.live(["type": "agent", "role": "alpha", "text": "Observed support\nSecond line"])
        XCTAssertFalse(notch.current?.text.contains("Observed support") == true)
        notch.debating(.profundo)
        XCTAssertEqual(notch.current?.text, "Alpha Hunter · Observed support")
        notch.live(["type": "agent", "role": "red", "text": "Observed risk"])
        XCTAssertEqual(notch.previous?.text, "Red Team · Observed risk")
        XCTAssertTrue(notch.current?.text.contains("CIO") == true)
    }

    func testMaxWaitsForRealSecondRoundBeforeCIO() {
        let notch = NucleoNotch()
        start(notch)
        notch.debating(.maximo)
        notch.live(["type": "agent", "role": "red", "text": "Risk"])
        XCTAssertEqual(notch.current?.text, "Red Team · Risk")
        notch.live(["type": "agent", "role": "rebuttal", "text": "Response"])
        XCTAssertTrue(notch.previous?.text.contains("Response") == true)
        XCTAssertTrue(notch.current?.text.contains("CIO") == true)
    }

    func testCancellationClearsSynchronouslyAndRejectsLaterEvents() {
        let notch = NucleoNotch()
        start(notch)
        notch.finished(["status": "cancelled"])
        XCTAssertFalse(notch.visible)
        XCTAssertNil(notch.current)
        notch.live(["type": "agent", "role": "alpha", "text": "Late argument"])
        notch.stage(["stage": "accepted", "requestId": "read-a", "asset": ["symbol": "OLD"]])
        XCTAssertNil(notch.current)
    }

    func testResetDropsQueuedAgentsAndPriorCompletionTimer() async throws {
        let notch = NucleoNotch()
        start(notch)
        notch.live(["type": "agent", "role": "alpha", "text": "Old account"])
        notch.finished(["status": "ok", "agents": ["direction": "long"]])
        XCTAssertEqual(notch.mood, .done)
        notch.reset()
        start(notch, id: "read-b")
        notch.debating(.rapido)
        XCTAssertFalse(notch.current?.text.contains("Old account") == true)
        // The cancelled completion hide must not affect a newer read.
        try await Task.sleep(for: .milliseconds(30))
        XCTAssertTrue(notch.visible)
        XCTAssertEqual(notch.mood, .working)
    }

    func testGiftBalancesRemainSeparateFromPlanAndNeverConferPro() throws {
        let access = try XCTUnwrap(BobbyReadAccess(json: ["tier": "free", "used": 10, "limit": 10, "remaining": 0, "bonus": 3, "paywall": false]))
        XCTAssertEqual(access.remaining, 0)
        XCTAssertEqual(access.bonus, 3)
        XCTAssertEqual(access.json["bonus"] as? Int, 3)
        XCTAssertFalse(access.isPro)
        let row = try XCTUnwrap(ReadsRow.content(access: access, subscription: nil, signedIn: true, spanish: true))
        XCTAssertTrue(row.title.contains("3 lecturas de regalo"))
        XCTAssertFalse(row.pro)
        XCTAssertEqual(BobbyReadAccess(json: ["tier": "free", "bonus": true])?.bonus, 0)
        XCTAssertEqual(NucleoLevelMeter(json: ["bonus": -1])?.bonus, 0)
    }

    func testGiftAllowanceRemainsUsableWithZeroPremiumPlanLimit() throws {
        let suite = "nucleo.gifts.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let center = NucleoLevelCenter(defaults: defaults)
        center.apply([
            "access": ["tier": "free", "used": 10, "limit": 10, "remaining": 0, "bonus": 2],
            "levels": ["tier": "free", "levels": [
                "profundo": ["used": 2, "limit": 2, "remaining": 0, "bonus": 4, "windowDays": 7],
                "maximo": ["used": 0, "limit": 0, "remaining": 0, "bonus": 1]
            ]]
        ])
        XCTAssertTrue(center.allowance(.rapido)?.contains("2") == true)
        XCTAssertTrue(center.allowance(.profundo)?.contains("4") == true)
        XCTAssertEqual(center.allowance(.maximo), BobbyReadAccess.giftLabel(1))
        XCTAssertEqual(center.tier, "free")
        center.accountChanged(force: true)
        XCTAssertNil(center.meters[.profundo], "Gift balances cannot cross accounts")
    }

    func testSessionTeardownClearsNativeProgress() {
        let suite = "nucleo.notch.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let session = NucleoSession(fixtures: true, defaults: defaults)
        session.emit("ask.stage", ["stage": "resolving", "requestId": "read-a"])
        XCTAssertTrue(session.notch.visible)
        session.teardown()
        XCTAssertFalse(session.notch.visible)
        session.emit("ask.stage", ["stage": "resolving", "requestId": "late"])
        XCTAssertFalse(session.notch.visible)
    }
}

final class NucleoDeskStreamTests: XCTestCase {
    private final class Events: @unchecked Sendable {
        let lock = NSLock()
        var values: [[String: Any]] = []
        func append(_ value: [String: Any]) { lock.lock(); defer { lock.unlock() }; values.append(value) }
    }

    override func setUp() async throws {
        NucleoFixtures.deactivate()
        URLProtocol.registerClass(NotchStreamStub.self)
    }

    override func tearDown() async throws {
        URLProtocol.unregisterClass(NotchStreamStub.self)
        NotchStreamStub.reply = nil
    }

    func testNDJSONStepsAndFinalUseExistingAuthenticatedRequest() async throws {
        NotchStreamStub.reply = .init(status: 200, contentType: "application/x-ndjson; charset=utf-8", body: """
        {"type":"accepted"}
        {"type":"evidence","timeframes":["1H","4H"]}
        {"type":"agent","role":"alpha","text":"Support"}
        {"type":"agent","role":"red","text":"Risk"}
        {"type":"final","data":{"answer":"Complete","direction":"long"}}
        """)
        let events = Events()
        let reply = try await BobbyAPI.responseWithHeaders("api/desk-debate", method: "POST", body: ["symbol": "BTC"],
            extraHeaders: ["Authorization": "Bearer fixture-only", "Idempotency-Key": "fixture-key"], timeout: 175,
            onEvent: { events.append($0) })
        XCTAssertEqual(reply.status, 200)
        XCTAssertEqual((reply.json as? [String: Any])?["answer"] as? String, "Complete")
        XCTAssertEqual(events.values.compactMap { $0["type"] as? String }, ["accepted", "evidence", "agent", "agent"])
        let req = try XCTUnwrap(NotchStreamStub.lastRequest)
        XCTAssertTrue(req.value(forHTTPHeaderField: "Accept")?.contains("application/x-ndjson") == true)
        XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-only")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Idempotency-Key"), "fixture-key")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Cache-Control"), "no-store")
        XCTAssertEqual(req.timeoutInterval, 175)
    }

    func testPlainJSONGateKeepsStatusAndRetryAfterWithoutInventingEvents() async throws {
        NotchStreamStub.reply = .init(status: 429, contentType: "application/json", body: "{\"code\":\"quota_exhausted\"}")
        let events = Events()
        let reply = try await BobbyAPI.responseWithHeaders("api/desk-debate", onEvent: { events.append($0) })
        XCTAssertEqual(reply.status, 429)
        XCTAssertEqual(reply.headers["retry-after"], "60")
        XCTAssertEqual((reply.json as? [String: Any])?["code"] as? String, "quota_exhausted")
        XCTAssertTrue(events.values.isEmpty)
    }

    func testStreamProviderFailureKeepsRefundReceipt() async throws {
        NotchStreamStub.reply = .init(status: 200, contentType: "application/x-ndjson", body: "{\"type\":\"error\",\"error\":\"provider unavailable\",\"refunded\":true}")
        let reply = try await BobbyAPI.responseWithHeaders("api/desk-debate", onEvent: { _ in })
        XCTAssertEqual(reply.status, 503)
        XCTAssertEqual((reply.json as? [String: Any])?["code"] as? String, "analysis_failed")
        XCTAssertEqual((reply.json as? [String: Any])?["refunded"] as? Bool, true)
    }

    func testTruncatedStreamCannotBecomeReady() async {
        NotchStreamStub.reply = .init(status: 200, contentType: "application/x-ndjson", body: "{\"type\":\"agent\",\"role\":\"alpha\",\"text\":\"Support\"}")
        do {
            _ = try await BobbyAPI.responseWithHeaders("api/desk-debate", onEvent: { _ in })
            XCTFail("A completed report requires a final event")
        } catch { XCTAssertEqual((error as? URLError)?.code, .networkConnectionLost) }
    }
}

private final class NotchStreamStub: URLProtocol {
    struct Reply { var status: Int; var contentType: String; var body: String }
    static var reply: Reply?
    static var lastRequest: URLRequest?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.lastRequest = request
        guard let reply = Self.reply else { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)); return }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: nil,
            headerFields: ["Content-Type": reply.contentType, "Retry-After": "60"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(reply.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
