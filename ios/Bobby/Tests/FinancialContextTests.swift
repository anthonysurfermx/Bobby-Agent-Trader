import Foundation
import XCTest
@testable import Bobby

final class FinancialContextImportTests: XCTestCase {
    private func imported(_ item: String) throws -> [FinancialContextItem] {
        try FinancialContextItem.importJSON(#"{"format":"bobby-context-v1","items":[\#(item)]}"#)
    }
    func testSelectedFactPreservesAmountCurrencyDateAndNoTranscript() throws {
        let rows = try imported(#"{"category":"goal","summary":"Emergency fund","amount":3000,"currency":"EUR","observedAt":"2024-02-29"}"#)
        XCTAssertEqual(rows.first?.amount, 3000)
        XCTAssertEqual(rows.first?.observedAt, "2024-02-29")
        XCTAssertEqual(Set(rows[0].body.keys), ["category", "summary", "amount", "currency", "observedAt"])
    }
    func testRejectsTranscriptsUnknownFieldsAndSensitivePaymentIdentifiers() {
        for item in [#"{"category":"goal","summary":"Build savings","transcript":"secret chat"}"#,
                     #"{"category":"goal","summary":"Card 4242424242424242"}"#,
                     #"{"category":"goal","summary":"Account DE89370400440532013000"}"#,
                     #"{"category":"goal","summary":"Bearer eyJabc.defghi.xyzabc"}"#,
                     #"{"category":"goal","summary":"First\nSecond"}"#,
                     #"{"category":"goal","summary":"a"}"#] {
            XCTAssertThrowsError(try imported(item))
        }
        XCTAssertThrowsError(try FinancialContextItem.importJSON(#"{"format":"bobby-context-v1","items":[],"history":[]}"#))
    }
    func testRejectsInvalidDatesAmountsAndMissingCurrency() {
        for item in [#"{"category":"transaction","summary":"Rent paid","observedAt":"2025-02-29"}"#,
                     #"{"category":"expense","summary":"Rent paid","amount":12}"#,
                     #"{"category":"expense","summary":"Rent paid","amount":true,"currency":"EUR"}"#,
                     #"{"category":"expense","summary":"Rent paid","amount":-1,"currency":"EUR"}"#,
                     #"{"category":"expense","summary":"Rent paid","amount":1000000000001,"currency":"EUR"}"#,
                     #"{"category":"expense","summary":"Rent paid","currency":"eur"}"#] {
            XCTAssertThrowsError(try imported(item))
        }
    }
    func testLimitsFactsAndInputBytesAndAcceptsMarkdownWrapper() throws {
        let fact = #"{"category":"preference","summary":"Keep savings liquid"}"#
        XCTAssertThrowsError(try FinancialContextItem.importJSON(#"{"format":"bobby-context-v1","items":[\#(Array(repeating: fact, count: 21).joined(separator: ","))]}"#))
        XCTAssertThrowsError(try FinancialContextItem.importJSON(String(repeating: "é", count: 9000)))
        XCTAssertEqual(try FinancialContextItem.importJSON("```json\n" + #"{"format":"bobby-context-v1","items":[\#(fact)]}"# + "\n```").count, 1)
    }
}

@MainActor
final class FinancialContextIsolationTests: XCTestCase {
    private let empty = Data(#"{"enabled":false,"financialMemoryEnabled":false,"accountMemoryEnabled":true,"items":[],"drafts":[],"recommendations":[]}"#.utf8)
    private func session(_ user: String) -> StoredSession {
        .init(accessToken: "test-\(user)", refreshToken: "refresh-\(user)", expiresAt: Date().addingTimeInterval(3600), userId: user)
    }
    func testAccountChangeClearsStateAndDropsLateResponse() async {
        let suite = "bobby.context.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let account = AccountSession(initialSession: session("a"), usesKeychain: false, defaults: defaults)
        let started = expectation(description: "request started")
        var continuation: CheckedContinuation<AuthorizedResponse, Never>?
        let center = FinancialContextCenter(account: account, send: { _ in
            await withCheckedContinuation { continuation = $0; started.fulfill() }
        })
        let task = Task { await center.request() }
        await fulfillment(of: [started], timeout: 2)
        account.accept(session("b"))
        XCTAssertNil(center.snapshot)
        XCTAssertFalse(center.busy)
        continuation?.resume(returning: .answered(empty, 200))
        let accepted = await task.value
        XCTAssertFalse(accepted)
        XCTAssertNil(center.snapshot)
        XCTAssertNil(center.error)
    }
    func testQueuedOutgoingMutationCannotStartForNextAccount() async {
        let suite = "bobby.context.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let account = AccountSession(initialSession: session("a"), usesKeychain: false, defaults: defaults)
        var sent = false
        let center = FinancialContextCenter(account: account, send: { _ in sent = true; return .answered(self.empty, 200) })
        account.accept(session("b"))
        let accepted = await center.request(method: "PATCH", body: ["enabled": true])
        XCTAssertFalse(accepted)
        XCTAssertFalse(sent)
    }
    func testUnavailableIsNotAnEmptyContextAndWritesCarryOnlyExplicitBody() async {
        let suite = "bobby.context.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let account = AccountSession(initialSession: session("a"), usesKeychain: false, defaults: defaults)
        let center = FinancialContextCenter(account: account, send: { request in
            XCTAssertEqual(request.httpMethod, "PATCH")
            let json = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            XCTAssertEqual(Set(json.keys), ["enabled"])
            return .unavailable
        })
        let saved = await center.request(method: "PATCH", body: ["enabled": true])
        XCTAssertFalse(saved)
        XCTAssertNil(center.snapshot)
        XCTAssertNotNil(center.error)
    }
}
