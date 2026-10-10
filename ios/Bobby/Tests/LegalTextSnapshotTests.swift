import XCTest
@testable import Bobby

/// Independent, approved baseline. Do not regenerate it when the implementation changes.
@MainActor
final class LegalTextSnapshotTests: XCTestCase {
    private struct Snapshot: Decodable {
        struct Statement: Decodable { let title: String; let body: String }
        let riskVersion: Int
        let memoryNotice: String
        let risk: [String: [Statement]]
        let consent: [String: [String]]
    }

    private func snapshot() throws -> Snapshot {
        let folder = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "Snapshots", withExtension: nil))
        let text = try String(contentsOf: folder.appendingPathComponent("legal-texts.jsonc"), encoding: .utf8)
        let json = text.split(separator: "\n", omittingEmptySubsequences: false).dropFirst().joined(separator: "\n")
        return try JSONDecoder().decode(Snapshot.self, from: Data(json.utf8))
    }

    private func inEachLanguage(_ check: (String) throws -> Void) rethrows {
        let old = UserDefaults.standard.string(forKey: L.preferenceKey)
        defer {
            if let old { UserDefaults.standard.set(old, forKey: L.preferenceKey) }
            else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        }
        for language in ["en", "es", "fr", "pt", "it", "de"] {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            try check(language)
        }
    }

    func testRiskNoticeVersionRequiresWrittenOwnerApprovalToChange() throws {
        XCTAssertEqual(RiskNotice.currentVersion, try snapshot().riskVersion)
    }

    func testAllFourRiskTitlesAndBodiesAreByteForByteUnchangedInSixLanguages() throws {
        let expected = try snapshot()
        try inEachLanguage { language in
            let statements = RiskNotice.statements()
            let baseline = try XCTUnwrap(expected.risk[language])
            XCTAssertEqual(statements.count, 4, language)
            XCTAssertEqual(baseline.count, 4, language)
            for (actual, approved) in zip(statements, baseline) {
                // Data equality also catches Unicode normalization and punctuation changes.
                XCTAssertEqual(Data(actual.title.utf8), Data(approved.title.utf8), language + " title")
                XCTAssertEqual(Data(actual.body.utf8), Data(approved.body.utf8), language + " body")
            }
        }
    }

    func testMemoryTitleParagraphsButtonsAndDetailsAreByteForByteUnchangedInSixLanguages() throws {
        let expected = try snapshot()
        try inEachLanguage { language in
            let baseline = try XCTUnwrap(expected.consent[language])
            XCTAssertEqual(baseline.count, 7, language)
            XCTAssertEqual(CompanionCopy.consent.count, 7, language)
            for (actual, approved) in zip(CompanionCopy.consent, baseline) {
                XCTAssertEqual(Data(actual.utf8), Data(approved.utf8), language)
            }
        }
    }

    func testAcceptedMemoryNoticeIDRequiresWrittenOwnerApprovalToChange() throws {
        let expected = try snapshot().memoryNotice
        XCTAssertEqual(Data(CompanionContextStore.notice.utf8), Data(expected.utf8))
        var bytes: Data?
        let store = CompanionContextStore(read: { bytes }, write: { bytes = $0; return true })
        store.choose(true)
        XCTAssertTrue(store.accepted)
        XCTAssertEqual(store.state.notice, expected)
        let restored = CompanionContextStore(read: { bytes }, write: { bytes = $0; return true })
        XCTAssertEqual(restored.state.notice, expected)
        XCTAssertTrue(restored.accepted)
    }
}
