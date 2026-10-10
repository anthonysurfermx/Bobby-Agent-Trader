import XCTest
import Security
@testable import Bobby

@MainActor
final class CompanionContextTests: XCTestCase {
    private func store() -> CompanionContextStore {
        var data: Data?
        return CompanionContextStore(read: { data }, write: { data = $0; return true })
    }
    private let live = CompanionPilot.Capability(enabled: true, context: true, catalog: 1, notices: ["memory-1"])

    func testConsentCatalogAndWireAreGated() {
        let s = store()
        XCTAssertEqual(CompanionCatalog.questions.count, 8)
        for question in CompanionCatalog.questions {
            XCTAssertEqual(Set(question.text.keys), Set(["es", "en", "fr", "pt", "it", "de"]))
            for option in question.options { XCTAssertEqual(Set(option.label.keys), Set(question.text.keys)) }
        }
        XCTAssertNil(s.wire(capability: live))
        s.answer("interest", value: "crypto")
        XCTAssertTrue(s.state.notes.isEmpty)
        s.choose(false)
        XCTAssertTrue(s.decided); XCTAssertFalse(s.accepted)
        XCTAssertNotNil(s.state.decidedAt); XCTAssertEqual(s.state.notice, "memory-1")
        XCTAssertNil(s.wire(capability: live))
        s.choose(true); s.answered()
        XCTAssertTrue(s.accepted)
        XCTAssertEqual(s.next()?.id, "interest")
        s.answer("interest", value: "crypto")
        let wire = s.wire(capability: live)!
        XCTAssertEqual((wire["consent"] as? [String: Any])?["money"] as? Bool, true)
        let note = (wire["notes"] as! [[String: Any]])[0]
        XCTAssertEqual(Set(note.keys), Set(["field", "value", "source"]))
        XCTAssertEqual(note["value"] as? String, "crypto")
        var wrong = live; wrong.catalog = 2
        XCTAssertNil(s.wire(capability: wrong))
        wrong = live; wrong.context = false
        XCTAssertNil(s.wire(capability: wrong))
        wrong = live; wrong.notices = ["memory-2"]
        XCTAssertNil(s.wire(capability: wrong))
    }

    func testTapSkipCorrectionDeletionAndExpiry() {
        let s = store(); let now = Date()
        s.choose(true, now: now); s.answered(now: now)
        s.answer("interest", value: "crypto", now: now)
        XCTAssertEqual(s.next()?.id, "barrier")
        s.answer("barrier", value: nil, now: now)
        XCTAssertEqual(s.next()?.id, "when")
        s.answer("when", value: "under_2y", now: now)
        XCTAssertEqual(s.next()?.id, "cushion")
        s.answer("cushion", value: "would_need_it", now: now)
        XCTAssertNil(s.next())
        XCTAssertEqual(s.state.notes.first { $0.field == "when" }!.expiresAt.timeIntervalSince(now), 7 * 86400, accuracy: 1)
        XCTAssertEqual(s.state.notes.first { $0.field == "interest" }!.expiresAt.timeIntervalSince(now), 30 * 86400, accuracy: 1)
        let expiry = s.state.notes.first!.expiresAt
        s.answer("interest", value: "companies", source: "confirmed", now: now)
        XCTAssertEqual(s.state.notes.filter { $0.field == "interest" }.count, 1)
        XCTAssertEqual(s.state.notes.first { $0.field == "interest" }?.source, "confirmed")
        _ = s.wire(capability: live, now: now.addingTimeInterval(86400))
        XCTAssertEqual(s.state.notes.first { $0.field == "interest" }?.expiresAt, expiry)
        s.opened(now: now.addingTimeInterval(8 * 86400))
        XCTAssertEqual(s.state.notes.map(\.field), ["interest"])
        s.delete("interest"); XCTAssertTrue(s.state.notes.isEmpty)
        s.answer("interest", value: "crypto"); s.deleteAll(); XCTAssertTrue(s.state.notes.isEmpty)
        s.answer("interest", value: "crypto"); s.choose(false)
        XCTAssertTrue(s.state.notes.isEmpty); XCTAssertTrue(s.state.asked.isEmpty); XCTAssertNil(s.wire(capability: live))
    }

    func testReturnDaysAreVisitsAndOnlyAfterAnswering() {
        let s = store(); var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = cal.startOfDay(for: Date())
        s.choose(true, now: now, calendar: cal)
        XCTAssertNil(s.next())
        s.opened(now: now.addingTimeInterval(3600), calendar: cal); XCTAssertEqual(s.state.day, 1)
        s.opened(now: now.addingTimeInterval(10 * 86400), calendar: cal); XCTAssertEqual(s.state.day, 2)
        s.opened(now: now.addingTimeInterval(10 * 86400 + 120), calendar: cal); XCTAssertEqual(s.state.day, 2)
        XCTAssertNil(s.next())
    }

    func testPersistedChoiceSurvivesNewStoreAndFailureStoresNothing() {
        var bytes: Data?
        let s = CompanionContextStore(read: { bytes }, write: { bytes = $0; return true })
        s.choose(true); s.answered(); s.answer("interest", value: "companies")
        let restored = CompanionContextStore(read: { bytes }, write: { bytes = $0; return true })
        XCTAssertTrue(restored.accepted); XCTAssertEqual(restored.state.notes.first?.value, "companies")
        restored.choose(false)
        let declined = CompanionContextStore(read: { bytes }, write: { bytes = $0; return true })
        XCTAssertTrue(declined.decided); XCTAssertFalse(declined.accepted); XCTAssertTrue(declined.state.notes.isEmpty)
        let failed = CompanionContextStore(read: { nil }, write: { _ in false })
        failed.choose(true); XCTAssertFalse(failed.accepted); XCTAssertTrue(failed.storageError)
    }

    func testDeviceKeychainPersistsConsentAndMemoryOffDeletesNotes() {
        let account = "companion-test-" + UUID().uuidString
        defer {
            SecItemDelete([kSecClass: kSecClassGenericPassword,
                kSecAttrService: "xyz.bobbyprotocol.bobby.companion.context", kSecAttrAccount: account] as CFDictionary)
        }
        let first = CompanionContextStore(account: account)
        first.choose(true); first.answered(); first.answer("interest", value: "crypto")
        XCTAssertFalse(first.storageError)
        let relaunched = CompanionContextStore(account: account)
        XCTAssertTrue(relaunched.accepted)
        XCTAssertEqual(relaunched.state.notes.first?.value, "crypto")
        relaunched.choose(false)
        let disabled = CompanionContextStore(account: account)
        XCTAssertTrue(disabled.decided); XCTAssertFalse(disabled.accepted)
        XCTAssertTrue(disabled.state.notes.isEmpty)
    }
}
