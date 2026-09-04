import XCTest
@testable import Bobby

final class WalletSessionValidatorTests: XCTestCase {
    func testAcceptsOnlyThePinnedFreshSignInMessage() {
        let now = Date(timeIntervalSince1970: 1_788_540_000)
        let wallet = "0x1111111111111111111111111111111111111111"
        let message = [
            "bobbyprotocol.xyz wants you to sign in with your Ethereum account:",
            wallet,
            "",
            BobbyWalletSessionValidator.statement,
            "",
            "URI: https://bobbyprotocol.xyz",
            "Version: 1",
            "Chain ID: 8453",
            "Nonce: abcdefghijklmnop1234",
            "Issued At: \(iso(now))",
            "Expiration Time: \(iso(now.addingTimeInterval(600)))",
        ].joined(separator: "\n")

        XCTAssertNil(BobbyWalletSessionValidator.problem(message: message, wallet: wallet, now: now))
        XCTAssertNotNil(BobbyWalletSessionValidator.problem(message: message.replacingOccurrences(of: "Chain ID: 8453", with: "Chain ID: 1"), wallet: wallet, now: now))
        XCTAssertNotNil(BobbyWalletSessionValidator.problem(message: message.replacingOccurrences(of: wallet, with: "0x2222222222222222222222222222222222222222"), wallet: wallet, now: now))
        XCTAssertNotNil(BobbyWalletSessionValidator.problem(message: message.replacingOccurrences(of: BobbyWalletSessionValidator.statement, with: "Sign this transfer"), wallet: wallet, now: now))
    }

    func testSessionDecoderAcceptsServerFractionalSeconds() throws {
        let data = Data(#"{"token":"test-token","wallet":"0x1111111111111111111111111111111111111111","expiresAt":"2026-09-04T17:00:00.123Z"}"#.utf8)
        let session = try JSONDecoder.bobby.decode(BobbyWalletSession.self, from: data)

        XCTAssertEqual(session.wallet, "0x1111111111111111111111111111111111111111")
        XCTAssertEqual(session.expiresAt.timeIntervalSince1970, 1_788_541_200.123, accuracy: 0.001)
    }

    func testStoredSessionRoundTripsWithThePinnedDateFormat() throws {
        let original = BobbyWalletSession(
            token: "test-token",
            wallet: "0x1111111111111111111111111111111111111111",
            expiresAt: Date(timeIntervalSince1970: 1_788_541_200.123)
        )

        let encoded = try JSONEncoder.bobby.encode(original)
        let restored = try JSONDecoder.bobby.decode(BobbyWalletSession.self, from: encoded)

        XCTAssertEqual(restored, original)
    }

    private func iso(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }
}
