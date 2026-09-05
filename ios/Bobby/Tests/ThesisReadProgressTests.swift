import XCTest
@testable import Bobby

final class ThesisReadProgressTests: XCTestCase {
    private let origin = "bc64f970-8021-4602-877f-f49e51671c1c"

    func testServerOriginSurvivesOfflineQueueAndSyncSerialization() throws {
        let answer = BobbyAPI.decodeDebate(["thesis_read": ["id": origin], "market": ["price": 100]], symbol: "AAPL")
        let event = PendingAward(id: "event", kind: "read_complete", at: "2026-09-05T12:00:00Z", tzOffsetMin: 0, thesisReadId: answer.thesisReadId)
        let restored = try JSONDecoder().decode([PendingAward].self, from: JSONEncoder().encode([event]))
        let wire = try JSONSerialization.jsonObject(with: JSONSerialization.data(withJSONObject: restored.map(\.requestBody))) as! [[String: Any]]
        XCTAssertEqual(wire.first?["thesisReadId"] as? String, origin)
        XCTAssertEqual(restored, [event])
    }

    func testLegacyOfflineEventsRemainDecodableWithoutInventingOrigins() throws {
        let data = Data(#"[{"id":"old","kind":"read_complete","at":"2026-09-04T12:00:00Z","tzOffsetMin":0}]"#.utf8)
        let event = try XCTUnwrap(JSONDecoder().decode([PendingAward].self, from: data).first)
        XCTAssertNil(event.thesisReadId)
        XCTAssertNil(event.requestBody["thesisReadId"])
    }

    func testUnavailableAndMalformedProofNeverCreateOrigins() {
        for obj: [String: Any] in [
            ["error": "unavailable", "thesis_read": ["id": origin]],
            ["thesis_read": NSNull()],
            ["thesis_read": ["id": "invalid"]],
            ["thesis_read": ["id": 42]],
            [:]
        ] {
            XCTAssertNil(BobbyAPI.decodeDebate(obj, symbol: "AAPL").thesisReadId)
        }
    }
}
