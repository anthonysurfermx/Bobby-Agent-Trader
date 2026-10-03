import UserNotifications
import XCTest
@testable import Bobby

/// The pending notification tap: validated, newest wins, consumed exactly once, never a replay.
@MainActor
final class BriefingIntentTests: XCTestCase {
    private let idA = "3F2504E0-4F89-41D3-9A0C-0305E82C3301"
    private let idB = "9b2c1a7e-0d3f-4c55-8f1e-2a6b4c8d0e12"

    func testMalformedTapsAreIgnored() {
        let intent = BriefingIntent(observeAccount: false)
        XCTAssertFalse(intent.store("not-a-uuid"))
        XCTAssertFalse(intent.store(nil))
        XCTAssertFalse(intent.store(42))
        XCTAssertFalse(intent.store(""))
        XCTAssertFalse(intent.store("3F2504E04F8941D39A0C0305E82C3301"))
        XCTAssertFalse(intent.store("3F2504E0-4F89-41D3-9A0C-0305E82C3301; drop"))
        XCTAssertNil(intent.pending)
        XCTAssertNil(intent.take())
    }

    func testTapIsStoredOnceAndConsumedOnce() {
        let intent = BriefingIntent(observeAccount: false)
        XCTAssertTrue(intent.store(idA))
        XCTAssertEqual(intent.pending, idA.lowercased())
        XCTAssertEqual(intent.take(), idA.lowercased())
        XCTAssertNil(intent.take(), "a tap is never replayed")
        XCTAssertNil(intent.pending)
    }

    func testNewestTapWinsAndMalformedDoesNotReplaceIt() {
        let intent = BriefingIntent(observeAccount: false)
        intent.store(idA)
        intent.store(idB)
        XCTAssertFalse(intent.store("garbage"))
        XCTAssertEqual(intent.take(), idB)
        XCTAssertNil(intent.take())
    }

    func testClearDropsThePendingTap() {
        let intent = BriefingIntent(observeAccount: false)
        intent.store(idA)
        intent.clear()
        XCTAssertNil(intent.take())
    }

    func testPayloadBriefIdIsReadOnlyFromTheTopLevelUUID() {
        XCTAssertEqual(BriefingIntent.briefId(from: ["briefId": idB, "aps": ["alert": ["title": "Bobby"]]]), idB)
        XCTAssertNil(BriefingIntent.briefId(from: ["briefId": "../../account"]))
        XCTAssertNil(BriefingIntent.briefId(from: ["aps": ["briefId": idB]]))
        XCTAssertNil(BriefingIntent.briefId(from: [:]))
    }

    func testForegroundPushIsHiddenOnlyForTheBriefingAlreadyOpen() {
        let intent = BriefingIntent(observeAccount: false)
        intent.markOpen(idA)
        XCTAssertEqual(intent.openBriefId, idA.lowercased())
        XCTAssertEqual(PushRegistrar.presentation(briefId: idA.lowercased(), openBriefId: intent.openBriefId), [])
        let other = PushRegistrar.presentation(briefId: idB, openBriefId: intent.openBriefId)
        XCTAssertEqual(other, [.banner, .list])
        XCTAssertFalse(other.contains(.sound), "the push carries its own sound")
        XCTAssertEqual(PushRegistrar.presentation(briefId: nil, openBriefId: nil), [.banner, .list])
        intent.markOpen(nil)
        XCTAssertNil(intent.openBriefId)
    }
}
