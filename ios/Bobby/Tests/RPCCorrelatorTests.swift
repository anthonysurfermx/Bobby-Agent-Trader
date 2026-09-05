import XCTest
@testable import Bobby

/// BP-05: only THE request's response may complete it.
final class RPCCorrelatorTests: XCTestCase {
    private let pending = PendingRPC(id: "right(1701)", topic: "topic-A", chain: "eip155:8453", method: "personal_sign", account: "0xabc")

    func testNormalResponseIsAccepted() {
        XCTAssertEqual(RPCCorrelator.check(responseID: "right(1701)", responseTopic: "topic-A", responseChain: "eip155:8453", pending: pending), .accepted)
        // an SDK response that omits topic/chain is still accepted when the id matches
        XCTAssertEqual(RPCCorrelator.check(responseID: "right(1701)", responseTopic: nil, responseChain: nil, pending: pending), .accepted)
    }

    func testLateResponseToAnEarlierRequestCannotCompleteANewerOne() {
        XCTAssertEqual(RPCCorrelator.check(responseID: "right(1700)", responseTopic: "topic-A", responseChain: "eip155:8453", pending: pending),
                       .unrelated("id right(1700) is not the pending right(1701)"))
    }

    func testDuplicateAfterCompletionIsIgnored() {
        XCTAssertEqual(RPCCorrelator.check(responseID: "right(1701)", responseTopic: "topic-A", responseChain: "eip155:8453", pending: nil), .unrelated("no request pending"))
    }

    func testWrongTopicAndWrongChainAreIgnored() {
        XCTAssertEqual(RPCCorrelator.check(responseID: "right(1701)", responseTopic: "topic-B", responseChain: "eip155:8453", pending: pending), .unrelated("topic mismatch"))
        XCTAssertEqual(RPCCorrelator.check(responseID: "right(1701)", responseTopic: "topic-A", responseChain: "eip155:1", pending: pending), .unrelated("chain mismatch"))
    }

    func testResponseWithoutIdIsIgnored() {
        XCTAssertEqual(RPCCorrelator.check(responseID: nil, responseTopic: "topic-A", responseChain: "eip155:8453", pending: pending), .unrelated("response carries no id"))
    }

    func testResultShapeIsBoundToTheMethod() {
        let sig = "0x" + String(repeating: "a", count: 130)
        let hash = "0x" + String(repeating: "b", count: 64)
        XCTAssertTrue(RPCCorrelator.resultLooksValid(sig, method: "personal_sign"))
        XCTAssertFalse(RPCCorrelator.resultLooksValid(hash, method: "personal_sign"), "a tx hash cannot satisfy a signature request")
        XCTAssertTrue(RPCCorrelator.resultLooksValid(hash, method: "eth_sendTransaction"))
        XCTAssertFalse(RPCCorrelator.resultLooksValid(sig, method: "eth_sendTransaction"))
    }
}
