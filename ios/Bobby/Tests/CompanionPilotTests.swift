import XCTest
@testable import Bobby

@MainActor
final class CompanionPilotTests: XCTestCase {
    func testProbeRunsOnceAnd404IsOff() async {
        let p = CompanionPilot(); var calls = 0
        p.transport = { _, method, _ in calls += 1; XCTAssertEqual(method, "GET"); return (nil, 404) }
        _ = await p.probe(); _ = await p.probe()
        XCTAssertEqual(calls, 1)
        let result = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: "plain")
        XCTAssertNil(result); XCTAssertEqual(calls, 1)
    }
    func testRoutingKeepsSearchAndShortAssetQuestionsOut() {
        XCTAssertTrue(CompanionPilot.shouldRoute(question: "qué opinas de ethereun hoy", needsConfirmation: true, matchKind: "fuzzy"))
        XCTAssertFalse(CompanionPilot.shouldRoute(question: "ethereun", needsConfirmation: true, matchKind: "fuzzy"))
        XCTAssertFalse(CompanionPilot.shouldRoute(question: "qué opinas de ethereum hoy", needsConfirmation: false, matchKind: "exact"))
        XCTAssertFalse(CompanionPilot.shouldRoute(question: "qué opinas de ethereun hoy", needsConfirmation: true, matchKind: "proxy"))
        let firstRow: [String: Any] = ["resolved": NSNull(), "resolution": ["matchKind": "fuzzy"], "results": [["symbol": "ETH"]]]
        if case .unresolved = NucleoDeskIO.parseSearch(firstRow) {} else { XCTFail("pilot off retains today's resolution") }
        let guessed = NucleoDeskIO.parseSearch(["resolved": NSNull(), "resolution": ["matchKind": "fuzzy"],
            "results": [["symbol": "ETH", "assetClass": "crypto", "aliases": ["Ethereum"]]]], includesCandidates: true)
        if case let .resolved(asset, confirmation, kind, _) = guessed {
            XCTAssertEqual(asset.symbol, "ETH"); XCTAssertTrue(confirmation); XCTAssertEqual(kind, "fuzzy")
        } else { XCTFail("a search's first guess is carried as a candidate, never assumed") }
    }
    func testExplanationHasNoReadAndCandidateRequiresExactConfirmation() async {
        let p = CompanionPilot(); var posted: [String: Any]?
        p.transport = { _, method, body in
            if method == "GET" { return (["companion": ["context": false, "catalog": 1]], 405) }
            posted = body
            return (["version": 1, "kind": "explanation", "reply": ["text": "Explanation", "followUp": "How does bitcoin work?"], "nextAction": NSNull()], 200)
        }
        let r = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: "plain")
        XCTAssertEqual(r?["status"] as? String, "companion")
        XCTAssertNil(r?["asset"]); XCTAssertNil(r?["verdict"]); XCTAssertNil(posted?["context"])
        XCTAssertEqual(r?["followUp"] as? String, "How does bitcoin work?")
        let asset = NucleoAsset(symbol: "ETH", name: "Ethereum", isEquity: false, assetClass: "crypto")
        p.transport = { _, _, _ in (["version": 1, "kind": "desk_offer", "nextAction": ["symbol": "BTC", "requiresConfirmation": true]], 200) }
        let wrong = await p.turn(question: "qué opinas de ethereun hoy", requestId: UUID().uuidString, candidate: asset, speech: "plain")
        XCTAssertEqual(wrong?["status"] as? String, "companion_error")
        p.transport = { _, _, _ in (["version": 1, "kind": "desk_offer", "nextAction": ["symbol": "ETH", "requiresConfirmation": true]], 200) }
        let offered = await p.turn(question: "qué opinas de ethereun hoy", requestId: UUID().uuidString, candidate: asset, speech: "plain")
        XCTAssertEqual(offered?["status"] as? String, "companion_offer")
    }
    func testRevocationDiscardsPendingPersonalizedReply() async {
        let p = CompanionPilot(); var revision = UUID(); p.revision = { revision }
        p.transport = { _, method, _ in
            if method == "GET" { return (nil, 405) }
            revision = UUID()
            return (["version": 1, "kind": "explanation", "reply": ["text": "Old reply"], "personalized": true], 200)
        }
        let r = await p.turn(question: "What is investing?", requestId: UUID().uuidString, candidate: nil, speech: "plain")
        XCTAssertEqual(r?["status"] as? String, "cancelled")
    }
}
