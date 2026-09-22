import XCTest
@testable import Bobby

private final class CommunityReportProtocol: URLProtocol {
    static var status = 200
    static var ok = true
    static var request: URLRequest?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.request = request
        let response = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data("{\"ok\":\(Self.ok)}".utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

@MainActor final class LandCommunitySafetyTests: XCTestCase {
    private func island(_ title: String = "Ocean") -> PublicIsland {
        .init(code: "abcdefghij", title: title, size: 8, publishedAt: nil, placements: [], stats: nil)
    }
    func testBlockingPersistsAcrossRelaunchAndRenameButCannotHideShowcase() {
        let name = "CommunitySafety-\(UUID())", defaults = UserDefaults(suiteName: name)!
        defer { defaults.removePersistentDomain(forName: name) }
        let safety = LandCommunitySafety(defaults: defaults)
        safety.block(island())
        XCTAssertFalse(safety.allows(island("Renamed creator")))
        let restored = LandCommunitySafety(defaults: defaults)
        XCTAssertFalse(restored.allows(island()))
        restored.block(TraderLandShowcase.island)
        XCTAssertTrue(restored.allows(TraderLandShowcase.island))
        restored.unblock("abcdefghij")
        XCTAssertTrue(LandCommunitySafety(defaults: defaults).allows(island()))
    }
    func testReportsRequireServerAcknowledgementAndDoNotSendAccountCredentials() async throws {
        let name = "CommunityReport-\(UUID())", defaults = UserDefaults(suiteName: name)!
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [CommunityReportProtocol.self]
        let session = URLSession(configuration: config)
        defer { session.invalidateAndCancel(); defaults.removePersistentDomain(forName: name) }
        let safety = LandCommunitySafety(defaults: defaults, transport: session)
        CommunityReportProtocol.status = 200; CommunityReportProtocol.ok = true
        try await safety.report(island(), reason: "spam", details: "Please review")
        let request = try XCTUnwrap(CommunityReportProtocol.request)
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(request.url?.path, "/api/trader-land-report")
        XCTAssertTrue(safety.blocked.isEmpty, "Reporting is separate from choosing to block")
        for (status, ok) in [(503, true), (200, false)] {
            CommunityReportProtocol.status = status; CommunityReportProtocol.ok = ok
            do { try await safety.report(island(), reason: "spam", details: ""); XCTFail("A failed report must not look submitted") }
            catch { XCTAssertNotNil(error) }
        }
    }
    func testPublicationRefusalsAreLocalizedAndRecoverable() {
        XCTAssertFalse(TraderLandSync.failure(status: 422, serverError: "Choose a respectful island name without links or contact details.").isEmpty)
        XCTAssertFalse(TraderLandSync.failure(status: 503, serverError: "Name review is temporarily unavailable. Try again.").isEmpty)
        XCTAssertFalse(TraderLandSync.failure(status: 403, serverError: "Publishing is restricted. Contact Bobby support.").isEmpty)
    }
}
