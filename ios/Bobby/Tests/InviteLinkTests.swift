import Foundation
import XCTest
@testable import Bobby

/// Which URLs carry an invitation code (1.8). Pure parsing: nothing is stored and nothing is sent.
final class InviteLinkTests: XCTestCase {
    private func code(_ text: String) -> String? {
        // A string Foundation refuses to parse is not an invitation either.
        URL(string: text).flatMap(InviteLink.code(from:))
    }

    func testTheSharedLinkTheLegacyLinkAndTheAppSchemeCarryACode() {
        let accepted = [
            "https://bobbyprotocol.xyz/i/ABCD2345",
            "https://www.bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz/i/ABCD2345/",
            "https://bobbyprotocol.xyz/i/ABCD2345?utm_source=whatsapp&ref=ZZZZZZZZ",
            "https://bobbyprotocol.xyz/i/ABCD2345#top",
            "HTTPS://BobbyProtocol.XYZ/i/ABCD2345",
            "https://bobbyprotocol.xyz/desk?ref=ABCD2345&v=2",
            "https://bobbyprotocol.xyz/desk?v=2&ref=ABCD2345",
            "https://www.bobbyprotocol.xyz/desk?ref=ABCD2345",
            "https://bobbyprotocol.xyz/desk/?ref=ABCD2345",
            "bobbyprotocol://invite/ABCD2345",
            "bobbyprotocol://invite/ABCD2345/",
        ]
        for link in accepted { XCTAssertEqual(code(link), "ABCD2345", link) }
    }

    func testLowercaseIsAcceptedAndReturnedInCapitals() {
        XCTAssertEqual(code("https://bobbyprotocol.xyz/i/abcd2345"), "ABCD2345")
        XCTAssertEqual(code("https://bobbyprotocol.xyz/i/AbCd2345"), "ABCD2345")
        XCTAssertEqual(code("https://bobbyprotocol.xyz/desk?ref=wxyz6789&v=2"), "WXYZ6789")
        XCTAssertEqual(code("bobbyprotocol://invite/wxyz6789"), "WXYZ6789")
    }

    func testEveryLetterAndDigitOfTheServerAlphabetIsAccepted() {
        let alphabet = Array("ABCDEFGHJKLMNPQRSTUVWXYZ23456789")
        XCTAssertEqual(alphabet.count, 32)
        for start in stride(from: 0, to: alphabet.count, by: 8) {
            let chunk = String(alphabet[start..<start + 8])
            XCTAssertEqual(code("https://bobbyprotocol.xyz/i/\(chunk)"), chunk)
            XCTAssertNotNil(chunk.range(of: InviteLink.codePattern, options: .regularExpression))
        }
    }

    func testOtherHostsSchemesPortsAndCredentialsAreNotInvitations() {
        let refused = [
            "http://bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz.evil.com/i/ABCD2345",
            "https://evil.com/i/ABCD2345",
            "https://evilbobbyprotocol.xyz/i/ABCD2345",
            "https://app.bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz./i/ABCD2345",
            "https://bobbyprotocol.xyz@evil.com/i/ABCD2345",
            "https://evil.com@bobbyprotocol.xyz/i/ABCD2345",
            "https://user:pass@bobbyprotocol.xyz/i/ABCD2345",
            "https://bobbyprotocol.xyz:8443/i/ABCD2345",
            "https://evil.com/?next=https://bobbyprotocol.xyz/i/ABCD2345",
            "https://evil.com/desk?ref=ABCD2345",
            "ftp://bobbyprotocol.xyz/i/ABCD2345",
            "file:///i/ABCD2345",
            "bobby://invite/ABCD2345",
            "bobbyprotocol:invite/ABCD2345",
            "bobbyprotocol://invites/ABCD2345",
            "bobbyprotocol://bobbyprotocol.xyz/i/ABCD2345",
        ]
        for link in refused { XCTAssertNil(code(link), link) }
    }

    func testACodeIsExactlyEightCharactersOfTheAlphabet() {
        let refused = [
            "https://bobbyprotocol.xyz/i/ABCD234",      // seven
            "https://bobbyprotocol.xyz/i/ABCD23456",    // nine
            "https://bobbyprotocol.xyz/i/ABCDI345",     // I
            "https://bobbyprotocol.xyz/i/ABCDO345",     // O
            "https://bobbyprotocol.xyz/i/ABCD0345",     // zero
            "https://bobbyprotocol.xyz/i/ABCD1345",     // one
            "https://bobbyprotocol.xyz/i/abcdi345",
            "https://bobbyprotocol.xyz/i/ABCD-345",
            "https://bobbyprotocol.xyz/i/ABCD_345",
            "https://bobbyprotocol.xyz/i/",
            "https://bobbyprotocol.xyz/i",
            "https://bobbyprotocol.xyz/desk?ref=ABCD234",
            "https://bobbyprotocol.xyz/desk?ref=ABCD23456",
            "https://bobbyprotocol.xyz/desk?ref=ABCDO345",
            "https://bobbyprotocol.xyz/desk?ref=",
            "bobbyprotocol://invite/ABCD234",
            "bobbyprotocol://invite/ABCD23456",
            "bobbyprotocol://invite/ABCD0345",
        ]
        for link in refused { XCTAssertNil(code(link), link) }
        for raw in ["ABCD234", "ABCD23456", "ABCDI345", "ABCDO345", "ABCD0345", "ABCD1345", "ABCD2345\n", " ABCD234", "ÀBCD2345", ""] {
            XCTAssertNil(InviteLink.normalized(raw), raw)
        }
        XCTAssertEqual(InviteLink.normalized("abcd2345"), "ABCD2345")
    }

    func testPercentEncodingAndLookAlikeLettersAreNeverDecodedIntoACode() {
        let refused = [
            "https://bobbyprotocol.xyz/i/%41BCD2345",
            "https://bobbyprotocol.xyz/i/ABCD%32345",
            "https://bobbyprotocol.xyz/%69/ABCD2345",
            "https://bobbyprotocol.xyz/i%2FABCD2345",
            "https://bobbyprotocol.xyz/desk?ref=%41BCD2345",
            "https://bobbyprotocol.xyz/desk?%72ef=ABCD2345",
            "https://bobbyprotocol%2Exyz/i/ABCD2345",
            "bobbyprotocol://invite/%41BCD2345",
            "https://bobbyprotocol.xyz/i/ABCD234\u{212A}",   // the Kelvin sign folds to "k"
            "https://bobbyprotocol.xyz/i/\u{FF21}BCD2345",   // a full-width A
        ]
        for link in refused { XCTAssertNil(code(link), link) }
        XCTAssertNil(InviteLink.normalized("ABCD234\u{212A}"))
        XCTAssertNil(InviteLink.normalized("\u{FF21}BCD2345"))
    }

    func testOnlyTheInvitationPathsCount() {
        let refused = [
            "https://bobbyprotocol.xyz/",
            "https://bobbyprotocol.xyz/?ref=ABCD2345",
            "https://bobbyprotocol.xyz/desk",
            "https://bobbyprotocol.xyz/desk?reference=ABCD2345",
            "https://bobbyprotocol.xyz/desk/more?ref=ABCD2345",
            "https://bobbyprotocol.xyz/desks?ref=ABCD2345",
            "https://bobbyprotocol.xyz/signin?ref=ABCD2345",
            "https://bobbyprotocol.xyz/I/ABCD2345",
            "https://bobbyprotocol.xyz/i/ABCD2345/more",
            "https://bobbyprotocol.xyz/x/i/ABCD2345",
            "https://bobbyprotocol.xyz/invite/ABCD2345",
            "https://bobbyprotocol.xyz/i?ref=ABCD2345",
            "bobbyprotocol://invite",
            "bobbyprotocol://invite/",
            "bobbyprotocol://invite/ABCD2345/more",
            "bobbyprotocol://invite?code=ABCD2345",
            "bobbyprotocol://invite?ref=ABCD2345",
        ]
        for link in refused { XCTAssertNil(code(link), link) }
    }

    @MainActor
    func testTheSignInCallbackIsNeverAnInvitationAndStillSignsIn() throws {
        XCTAssertEqual(AccountSession.oauthCallback, "bobbyprotocol://auth-callback")
        XCTAssertEqual(URL(string: AccountSession.oauthCallback)?.scheme, InviteLink.appScheme, "both live on the app's one URL scheme")
        let payload = Data(#"{"sub":"account-a"}"#.utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        let callbacks = [
            "bobbyprotocol://auth-callback",
            "bobbyprotocol://auth-callback#access_token=x.\(payload).x&refresh_token=ref-a&expires_in=3600",
            "bobbyprotocol://auth-callback/ABCD2345",
            "bobbyprotocol://auth-callback?ref=ABCD2345",
            "bobbyprotocol://auth-callback?code=ABCD2345#access_token=ABCD2345",
            "bobbyprotocol://auth-callback/invite/ABCD2345",
        ]
        for callback in callbacks { XCTAssertNil(code(callback), callback) }
        // The same URL is still a session for sign-in, exactly as before.
        let url = try XCTUnwrap(URL(string: callbacks[1]))
        let session = try XCTUnwrap(AccountSession.session(fromCallback: url))
        XCTAssertEqual(session.userId, "account-a")
        XCTAssertEqual(session.accessToken, "x.\(payload).x")
        XCTAssertEqual(session.refreshToken, "ref-a")
        // And an invitation is not a session.
        XCTAssertNil(AccountSession.session(fromCallback: try XCTUnwrap(URL(string: "bobbyprotocol://invite/ABCD2345"))))
    }

    func testATypedOrPastedEntryBecomesACode() {
        XCTAssertEqual(InviteLink.code(fromEntry: "ABCD2345"), "ABCD2345")
        XCTAssertEqual(InviteLink.code(fromEntry: " abcd 2345 \n"), "ABCD2345")
        XCTAssertEqual(InviteLink.code(fromEntry: "https://bobbyprotocol.xyz/i/abcd2345"), "ABCD2345")
        XCTAssertEqual(InviteLink.code(fromEntry: "https://bobbyprotocol.xyz/desk?ref=ABCD2345&v=2"), "ABCD2345")
        XCTAssertEqual(InviteLink.code(fromEntry: "bobbyprotocol://invite/ABCD2345"), "ABCD2345")
        for raw in ["", "   ", "ABCD234", "ABCD23456", "ABCDI345", "hello", "https://evil.com/i/ABCD2345",
                    "bobbyprotocol://auth-callback#access_token=ABCD2345", String(repeating: "A", count: 600)] {
            XCTAssertNil(InviteLink.code(fromEntry: raw), raw)
        }
    }

    @MainActor
    func testTheFieldKeepsCapitalsAndEightCharactersAndTurnsAPastedLinkIntoItsCode() {
        XCTAssertEqual(InviteAcceptSection.tidy("abcd2345"), "ABCD2345")
        XCTAssertEqual(InviteAcceptSection.tidy("ab cd-23"), "ABCD23")
        XCTAssertEqual(InviteAcceptSection.tidy("abcd2345extra"), "ABCD2345")
        XCTAssertEqual(InviteAcceptSection.tidy("https://bobbyprotocol.xyz/i/wxyz6789"), "WXYZ6789")
        XCTAssertEqual(InviteAcceptSection.tidy(""), "")
    }
}
