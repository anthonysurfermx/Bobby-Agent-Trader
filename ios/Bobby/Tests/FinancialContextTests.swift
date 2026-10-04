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
    func testEditorAcceptsCompleteLocalizedAmountsAndPreservesExistingFacts() throws {
        let fact = FinancialContextItem(category: "expense", summary: "Rent payment", amount: 12.5, currency: "EUR")
        for (identifier, input) in [("en_US", "12.50"), ("es_ES", "12,50"), ("pt_PT", "12,50")] {
            var editor = FinancialContextEditor(fact, locale: Locale(identifier: identifier))
            XCTAssertEqual(try editor.item().amount, 12.5, identifier) // editing an existing fact keeps its value
            editor.amount = input
            XCTAssertEqual(try editor.item().amount, 12.5, identifier) // same serialization path used by Save
            editor.amount = "0"; XCTAssertEqual(try editor.item().amount, 0, identifier)
            editor.amount = "1000000000000"; XCTAssertEqual(try editor.item().amount, 1e12, identifier)
            let tiny = FinancialContextItem(category: "asset", summary: "Reported balance", amount: 1e-12, currency: "EUR")
            XCTAssertEqual(try FinancialContextEditor(tiny, locale: Locale(identifier: identifier)).item().amount, 1e-12, identifier)
        }
    }
    func testEditorRejectsAmbiguousGroupedPartialNegativeAndExcessAmounts() {
        let fact = FinancialContextItem(category: "expense", summary: "Rent payment", currency: "EUR")
        let cases: [(String, [String])] = [("en_US", ["-12.50", "1,234", "1,234.50", "12.50tail", "12.", "1e3", "NaN", "1000000000000.01"]),
            ("es_ES", ["-12,50", "1.234", "1.234,50", "12.50", "12,50tail", "12,", "12,,50", "1000000000000,01"]),
            ("pt_PT", ["-12,50", "1.234", "1.234,50", "12.50", "12,50tail", "1 234,50", "1000000000000,01"])]
        for (identifier, inputs) in cases {
            var editor = FinancialContextEditor(fact, locale: Locale(identifier: identifier))
            for input in inputs { editor.amount = input; XCTAssertThrowsError(try editor.item(), "\(identifier): \(input)") }
        }
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
    func testActualConflictResponsesKeepDistinctRecoveryMessages() async {
        let suite = "bobby.context.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let account = AccountSession(initialSession: session("a"), usesKeychain: false, defaults: defaults)
        let cases: [(String, FinancialContextError)] = [("draft_unavailable", .missingDraft), ("context_limit", .contextLimit),
            ("duplicate_context", .duplicateContext), ("request_conflict", .requestConflict), ("context_paused", .paused),
            ("item_unavailable", .missingItem), ("unknown_conflict", .unavailable)]
        for (code, expected) in cases {
            let center = FinancialContextCenter(account: account, send: { _ in
                .answered(try JSONSerialization.data(withJSONObject: ["code": code]), 409)
            })
            let saved = await center.request(method: "POST", body: ["action": "import"])
            XCTAssertFalse(saved, code)
            XCTAssertEqual(center.error, expected.message, code)
            XCTAssertNil(center.snapshot, code)
        }
    }
    func testConnectionCanBeReadAndExplicitlyRevokedWhileMemoryAndConnectorArePaused() async throws {
        let suite = "bobby.context.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let account = AccountSession(initialSession: session("a"), usesKeychain: false, defaults: defaults)
        var paths: [String] = []
        let center = FinancialContextCenter(account: account, send: { request in
            let path = request.url!.path + "?" + (request.url!.query ?? "")
            paths.append(path)
            XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://bobbyprotocol.xyz")
            if request.url!.path == "/api/financial-context" { return .answered(self.empty, 200) }
            if request.url!.query == "op=connection" {
                XCTAssertEqual(request.httpMethod, "GET"); XCTAssertNil(request.httpBody)
                return .answered(Data(#"{"connected":true,"scopes":["bobby.context.read"],"available":false}"#.utf8), 200)
            }
            XCTAssertEqual(path, "/api/chatgpt?op=revoke")
            XCTAssertEqual(request.httpMethod, "POST")
            let json = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
            XCTAssertTrue(json.isEmpty) // no bearer, grant or identity enters a control's body
            return .answered(Data(#"{"connected":false,"scopes":[],"available":false}"#.utf8), 200)
        })
        let loaded = await center.request(); XCTAssertTrue(loaded)
        let connected = await center.loadConnection(); XCTAssertTrue(connected)
        XCTAssertFalse(center.snapshot!.enabled); XCTAssertTrue(center.connection!.connected)
        let paused = await center.request(method: "PATCH", body: ["enabled": false]); XCTAssertTrue(paused)
        XCTAssertFalse(paths.contains("/api/chatgpt?op=revoke")) // pausing memory never disconnects a grant
        let revoked = await center.revokeConnection(); XCTAssertTrue(revoked)
        XCTAssertFalse(center.connection!.connected); XCTAssertTrue(center.connection!.scopes.isEmpty)
        XCTAssertNotNil(center.snapshot) // disconnecting does not erase context
    }
    func testLateConnectionReplyAndQueuedRevocationCannotReachReplacementAccount() async {
        let suite = "bobby.context.tests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let account = AccountSession(initialSession: session("a"), usesKeychain: false, defaults: defaults)
        let started = expectation(description: "connection request started")
        var continuation: CheckedContinuation<AuthorizedResponse, Never>?
        var sent = 0
        let center = FinancialContextCenter(account: account, send: { _ in
            sent += 1
            return await withCheckedContinuation { continuation = $0; started.fulfill() }
        })
        let task = Task { await center.loadConnection() }
        await fulfillment(of: [started], timeout: 2)
        account.accept(session("b"))
        continuation?.resume(returning: .answered(Data(#"{"connected":true,"scopes":["bobby.context.read"],"available":true}"#.utf8), 200))
        let loaded = await task.value; XCTAssertFalse(loaded)
        XCTAssertNil(center.connection); XCTAssertNil(center.connectionError)
        let revoked = await center.revokeConnection(); XCTAssertFalse(revoked)
        XCTAssertEqual(sent, 1)
    }
}
