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

    func testInstallResetRemovesConsentAndNotesButNormalLaunchKeepsThem() {
        let suite = "companion.install.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        var data: Data?
        let s = CompanionContextStore(read: { data }, write: { data = $0; return true })
        s.choose(true); s.answered(); s.answer("interest", value: "crypto")
        let old = data
        s.prepareInstall(defaults: defaults)
        XCTAssertFalse(s.decided); XCTAssertTrue(s.state.notes.isEmpty); XCTAssertNil(s.wire(capability: live))
        s.choose(true); s.answered(); s.answer("interest", value: "companies")
        s.prepareInstall(defaults: defaults)
        XCTAssertTrue(s.accepted); XCTAssertEqual(s.state.notes.first?.value, "companies")
        defaults.removePersistentDomain(forName: suite)
        data = old
        let reinstall = CompanionContextStore(read: { data }, write: { data = $0; return true })
        reinstall.prepareInstall(defaults: defaults)
        XCTAssertFalse(reinstall.decided); XCTAssertTrue(reinstall.state.notes.isEmpty)
        let reloaded = CompanionContextStore(read: { data }, write: { data = $0; return true })
        XCTAssertFalse(reloaded.decided); XCTAssertTrue(reloaded.state.notes.isEmpty)
        XCTAssertEqual(CompanionCopy.privacyURL.fragment, "notes")
    }
    func testFailedResetRevokesMemoryAndRetriesOnNextLaunch() {
        let suite = "companion.failed.install.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        var data: Data?, canRemove = false
        let s = CompanionContextStore(read: { data }, write: { data = $0; return true }, remove: { canRemove })
        s.choose(true); let revision = s.revision
        s.prepareInstall(defaults: defaults)
        XCTAssertFalse(s.accepted); XCTAssertTrue(s.storageError); XCTAssertNotEqual(s.revision, revision)
        XCTAssertFalse(defaults.bool(forKey: "companion.context.install.v1"))
        canRemove = true; s.prepareInstall(defaults: defaults)
        XCTAssertTrue(defaults.bool(forKey: "companion.context.install.v1")); XCTAssertFalse(s.storageError)
        canRemove = false; XCTAssertFalse(s.reset())
        XCTAssertFalse(defaults.bool(forKey: "companion.context.install.v1"), "a failed account/global erase retries before loading old notes next launch")
    }

    func testAdditiveCatalogLabelsUseTheServerWording() throws {
        var data = try XCTUnwrap(Bundle.main.url(forResource: "Nucleo", withExtension: nil))
        data.appendPathComponent("companion-questions.json")
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: data)) as? [String: Any])
        var questions = try XCTUnwrap(json["questions"] as? [[String: Any]])
        questions[0]["labels"] = ["gold": ["en": "Reviewed gold", "es": "Oro revisado", "de": "Geprüftes Gold"]]
        json["questions"] = questions
        let catalog = try JSONDecoder().decode(CompanionCatalog.Catalog.self, from: JSONSerialization.data(withJSONObject: json))
        let question = catalog.questions[0]
        let expected = ["en": "Reviewed gold", "es": "Oro revisado", "de": "Geprüftes Gold"][L.language] ?? "Reviewed gold"
        XCTAssertEqual(question.label("gold"), expected); XCTAssertFalse(question.needsConfirmation("gold"))
        if CompanionCatalog.bundled.questions[0].labels == nil {
            XCTAssertEqual(CompanionCatalog.questions[0].label("gold"), CompanionCatalog.questions[0].title)
            XCTAssertTrue(CompanionCatalog.questions[0].needsConfirmation("gold"))
        }
    }

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

    func testMoneyQuestionsWaitForRepliesAfterTapSkipOrTypedAnswer() {
        let s = store(); s.choose(true); s.answered()
        s.answer("interest", value: "crypto")
        XCTAssertEqual(s.next(afterAnswer: true)?.id, "barrier")
        s.answer("barrier", value: nil)
        XCTAssertNil(s.next(afterAnswer: true))
        XCTAssertEqual(s.next()?.id, "when")
        XCTAssertFalse(s.state.asked.contains("when"))
        XCTAssertTrue(s.apply(["notes": [["field": "when", "value": "2_to_7y", "source": "said"]], "asked": ["when"]], for: "when"))
        XCTAssertNil(s.next(preferred: "cushion", afterAnswer: true))
        XCTAssertEqual(s.next()?.id, "cushion")
        s.answer("cushion", value: nil)
        XCTAssertNil(s.next())
    }

    func testTypedFallKeepsExerciseProvenanceAndCatalogLabelsCoverEveryValue() {
        let s = store(), now = Date()
        s.choose(true, now: now.addingTimeInterval(-2 * 86400))
        s.opened(now: now.addingTimeInterval(-86400)); s.opened(now: now); s.answered()
        XCTAssertTrue(s.apply(["notes": [["field": "fall", "value": "pause", "source": "shown"]], "asked": ["fall"]], for: "fall"))
        XCTAssertEqual(s.state.notes.first?.source, "shown")
        for question in CompanionCatalog.questions {
            for value in question.spoken + ["unsure"] {
                XCTAssertFalse(question.needsConfirmation(value), question.id + ":" + value)
                XCTAssertNotEqual(question.label(value), question.title)
            }
        }
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
        XCTAssertTrue(disabled.reset())
        let erased = CompanionContextStore(account: account)
        XCTAssertFalse(erased.decided); XCTAssertTrue(erased.state.notes.isEmpty)
    }
    func testReaderPatchPersistsOnlyEnumsAndRejectsUnrelatedOrMalformedNotesAtomically() {
        let s = store(); let now = Date(); s.choose(true); s.answered()
        let patch: [String: Any] = ["notes": [["field": "interest", "value": "funds", "source": "said"]], "asked": ["interest"]]
        XCTAssertTrue(s.apply(patch, for: "interest", now: now))
        XCTAssertEqual(s.state.notes.first?.value, "funds")
        XCTAssertEqual(s.state.notes.first?.expiresAt.timeIntervalSince(now), 30 * 86400)
        XCTAssertFalse(CompanionCatalog.question("interest")!.label("funds")!.isEmpty)
        let saved = s.state
        for bad: [String: Any] in [
            ["notes": [["field": "interest", "value": "raw secret answer", "source": "said"]], "asked": ["interest"]],
            ["notes": [["field": "interest", "value": "crypto", "source": "said", "text": "raw answer"]], "asked": ["interest"]],
            ["notes": [["field": "when", "value": "under_2y", "source": "said"]], "asked": ["interest"]],
            ["notes": [["field": "interest", "value": "crypto", "source": "confirmed"]], "asked": ["interest"]],
            ["notes": [["field": "interest", "value": "crypto", "source": "said"]], "asked": ["barrier"]]
        ] { XCTAssertFalse(s.apply(bad, for: "interest")); XCTAssertEqual(s.state, saved) }
        XCTAssertTrue(s.apply(["notes": [["field": "barrier", "value": "unsure", "source": "inferred"]], "asked": ["barrier"]], for: "barrier", now: now))
        let inferred = s.state.notes.first { $0.field == "barrier" }!
        XCTAssertEqual(inferred.source, "inferred"); XCTAssertEqual(inferred.expiresAt.timeIntervalSince(now), 7 * 86400)
        XCTAssertEqual(s.next()?.id, "when")
        for question in CompanionCatalog.questions {
            XCTAssertTrue(question.accepts("unsure")); XCTAssertFalse(question.label("unsure")!.isEmpty)
            for value in question.spoken { XCTAssertFalse(question.label(value)!.isEmpty) }
        }
        s.choose(false); XCTAssertFalse(s.apply(patch, for: "interest")); XCTAssertNil(s.wire(capability: live))
    }

}
