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

    func testCatalogWhyIsLocalizedAndCarriedToThePageWithoutChangingQuestionCopy() throws {
        let old = UserDefaults.standard.string(forKey: L.preferenceKey)
        defer {
            if let old { UserDefaults.standard.set(old, forKey: L.preferenceKey) }
            else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        }
        for question in CompanionCatalog.questions {
            let why = try XCTUnwrap(question.why)
            XCTAssertEqual(Set(why.keys), Set(["en", "es", "fr", "pt", "it", "de"]))
            for language in why.keys {
                UserDefaults.standard.set(language, forKey: L.preferenceKey)
                XCTAssertFalse(try XCTUnwrap(why[language]).isEmpty)
                XCTAssertEqual(question.json["why"] as? String, why[language])
                XCTAssertEqual(question.json["text"] as? String, question.text[language])
            }
        }
    }

    func testBuild69CatalogWithoutWhyStillLoadsAndOmitsItOnTheWire() throws {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "Nucleo", withExtension: nil))
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url.appendingPathComponent("companion-questions.json"))) as? [String: Any])
        var questions = try XCTUnwrap(root["questions"] as? [[String: Any]])
        for index in questions.indices { questions[index].removeValue(forKey: "why") }
        root["questions"] = questions
        let old = try JSONDecoder().decode(CompanionCatalog.Catalog.self, from: JSONSerialization.data(withJSONObject: root))
        XCTAssertEqual(old.version, 1)
        XCTAssertEqual(old.questions.count, 8)
        for question in old.questions {
            XCTAssertNil(question.why)
            XCTAssertNil(question.json["why"])
            XCTAssertFalse(question.title.isEmpty)
        }
    }

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
        var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = Date(timeIntervalSince1970: 1_792_000_000), s = store()
        s.choose(true, now: now, calendar: calendar); s.answered(now: now, calendar: calendar)
        s.answer("interest", value: "crypto", now: now)
        XCTAssertEqual(s.next(afterAnswer: true, now: now, calendar: calendar)?.id, "barrier")
        XCTAssertTrue(s.restQuestion("barrier", now: now, calendar: calendar))
        XCTAssertFalse(s.state.asked.contains("barrier"), "5.6.4: first Not now rests rather than retires")
        XCTAssertNil(s.next(afterAnswer: true, now: now, calendar: calendar))
        XCTAssertEqual(s.next(now: now, calendar: calendar)?.id, "when")
        XCTAssertTrue(s.apply(["notes": [["field": "when", "value": "2_to_7y", "source": "said"]], "asked": ["when"]], for: "when", now: now))
        XCTAssertNil(s.next(preferred: "cushion", afterAnswer: true, now: now, calendar: calendar))
        XCTAssertEqual(s.next(now: now, calendar: calendar)?.id, "cushion")
        XCTAssertTrue(s.restQuestion("cushion", now: now, calendar: calendar))
        XCTAssertFalse(s.state.asked.contains("cushion"))
        XCTAssertNil(s.next(now: now, calendar: calendar))
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
        XCTAssertTrue(s.restQuestion("barrier", now: now))
        XCTAssertFalse(s.state.asked.contains("barrier"))
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

@MainActor
final class InvitationPacingTests: XCTestCase {
    private var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = TimeZone(secondsFromGMT: 0)!; return c }
    private let now = Date(timeIntervalSince1970: 1_792_000_000)
    private func pacing() -> CompanionPacing { CompanionPacing(defaults: UserDefaults(suiteName: "invitation-test-" + UUID().uuidString)!) }
    func testSecondEducationalAnswerAndOnlyOncePerLocalDay() {
        let p = pacing()
        XCTAssertTrue(p.delivered(now: now, calendar: calendar)); XCTAssertFalse(p.remembers(decided: false, now: now, calendar: calendar))
        XCTAssertTrue(p.delivered(now: now, calendar: calendar)); XCTAssertTrue(p.remembers(decided: false, now: now, calendar: calendar))
        p.shown("invite", now: now, calendar: calendar)
        XCTAssertFalse(p.remembers(decided: false, now: now, calendar: calendar))
        XCTAssertTrue(p.remembers(decided: false, now: now.addingTimeInterval(86400), calendar: calendar))
    }
    func testThreeUntappedInvitesRestSevenDaysAndThreeCyclesRetire() {
        let p = pacing(); _ = p.delivered(now: now); _ = p.delivered(now: now)
        var date = now
        for cycle in 0..<3 {
            for _ in 0..<3 { p.shown("invite", now: date, calendar: calendar); p.leftInvite(now: date, calendar: calendar); date = date.addingTimeInterval(86400) }
            XCTAssertEqual(p.state.cycles, cycle + 1)
            XCTAssertFalse(p.remembers(decided: false, now: date, calendar: calendar))
            date = date.addingTimeInterval(7*86400)
        }
        XCTAssertTrue(p.state.retired)
        XCTAssertFalse(p.remembers(decided: false, now: date, calendar: calendar))
    }
    func testTappingThirdInviteDoesNotCountAsUntapped() {
        let p = pacing()
        for _ in 0..<2 { p.shown("invite", now: now); p.leftInvite(now: now) }
        p.shown("invite", now: now); p.tapInvite(); p.leftInvite(now: now)
        XCTAssertEqual(p.state.cycles, 0); XCTAssertEqual(p.state.untapped, 2)
    }
    func testNotNowRestsThirtyDaysAndThirdDeclineRetires() {
        let p = pacing(); _ = p.delivered(now: now); _ = p.delivered(now: now)
        for n in 0..<3 {
            let date = now.addingTimeInterval(Double(n)*31*86400)
            p.declined(now: date, calendar: calendar)
            XCTAssertFalse(p.remembers(decided: false, now: date.addingTimeInterval(29*86400), calendar: calendar))
            if n<2 { XCTAssertTrue(p.remembers(decided: false, now: date.addingTimeInterval(30*86400), calendar: calendar)) }
        }
        XCTAssertTrue(p.state.retired)
    }
    func testTwoUntappedQuestionChipsStopTheDayAndTapRollsOneBack() throws {
        let p = pacing(), q = try XCTUnwrap(CompanionCatalog.question("interest"))
        p.shown("question", now: now, calendar: calendar); p.shown("question", now: now, calendar: calendar)
        XCTAssertFalse(p.permits(q, now: now, calendar: calendar))
        p.scene(q, now: now, calendar: calendar); XCTAssertTrue(p.permits(q, now: now, calendar: calendar))
        XCTAssertTrue(p.permits(q, now: now.addingTimeInterval(86400), calendar: calendar))
    }
    func testTwoScenesMoneyOncePerDayAndNoChipAfterANote() throws {
        let p = pacing(), q = try XCTUnwrap(CompanionCatalog.question("when")), interest = try XCTUnwrap(CompanionCatalog.question("interest"))
        p.scene(q, now: now, calendar: calendar)
        XCTAssertFalse(p.permits(q, now: now, calendar: calendar)); XCTAssertTrue(p.permits(interest, now: now, calendar: calendar))
        p.noted(); XCTAssertFalse(p.delivered(now: now, calendar: calendar)); XCTAssertTrue(p.delivered(now: now, calendar: calendar))
        p.scene(interest, now: now, calendar: calendar); XCTAssertFalse(p.permits(interest, now: now, calendar: calendar))
        XCTAssertTrue(p.permits(q, now: now.addingTimeInterval(86400), calendar: calendar))
    }
    func testUntappedMoneyQuestionIsNotOfferedAgainThatLocalDay() throws {
        let p = pacing(), q = try XCTUnwrap(CompanionCatalog.question("when"))
        p.shown(q, now: now, calendar: calendar)
        XCTAssertFalse(p.permits(q, now: now, calendar: calendar))
        XCTAssertTrue(p.permits(q, now: now.addingTimeInterval(86400), calendar: calendar))
    }
    func testAnAnswerToTheVisibleQuestionIsAcceptedAfterMidnight() throws {
        var bytes: Data?; let store = CompanionContextStore(read: { bytes }, write: { bytes = $0; return true })
        let evening = calendar.startOfDay(for: now).addingTimeInterval(86399)
        store.choose(true, now: evening, calendar: calendar); store.answered(now: evening, calendar: calendar)
        let question = try XCTUnwrap(store.next(now: evening, calendar: calendar))
        store.answer(question.id, value: question.options[0].id, now: evening.addingTimeInterval(2))
        XCTAssertEqual(store.state.notes.first?.field, question.id)
        XCTAssertEqual(store.state.notes.first?.createdAt, evening.addingTimeInterval(2))
    }
    func testDialIsOnceAndOnlyAfterMemoryIsResolvedOrResting() {
        let p = pacing(); XCTAssertFalse(p.dialDue(decided: false, now: now))
        p.declined(now: now, calendar: calendar); XCTAssertTrue(p.dialDue(decided: false, now: now))
        p.shown("dial", now: now); XCTAssertFalse(p.dialDue(decided: true, now: now))
    }
    func testPacingPersistsAndExplicitEraseNeverBringsInvitationBack() {
        let defaults = UserDefaults(suiteName: "invitation-test-" + UUID().uuidString)!
        let p = CompanionPacing(defaults: defaults); p.shown("dial", now: now); p.declined(now: now)
        let restored = CompanionPacing(defaults: defaults)
        XCTAssertTrue(restored.state.dialShown); XCTAssertEqual(restored.state.declines,1)
        restored.reset(retired: true); XCTAssertTrue(restored.state.retired)
    }
    func testBuild69RecordWithFourNotesLoadsIntactAndWireKeepsExactlyFiveKeys() throws {
        let old: [String:Any] = ["notice":"memory-1","accepted":true,"decidedAt":now.timeIntervalSinceReferenceDate,"day":1,"lastOpen":now.timeIntervalSinceReferenceDate,"answeredOn":now.timeIntervalSinceReferenceDate,"asked":["interest","barrier","when","cushion"],"notes":[["field":"interest","value":"crypto","source":"said"],["field":"barrier","value":"words","source":"said"],["field":"when","value":"under_2y","source":"said"],["field":"cushion","value":"would_need_it","source":"said"]].map { $0.merging(["createdAt":now.timeIntervalSinceReferenceDate,"expiresAt":now.addingTimeInterval(30*86400).timeIntervalSinceReferenceDate] as [String:Any]) { _,b in b } }]
        var bytes: Data? = try JSONSerialization.data(withJSONObject: old)
        let store = CompanionContextStore(read:{bytes},write:{bytes=$0;return true})
        XCTAssertTrue(store.accepted); XCTAssertEqual(store.state.notes.count,4); XCTAssertNil(store.state.rest)
        let wire=try XCTUnwrap(store.wire(capability:.init(enabled:true,context:true,catalog:1,notices:["memory-1"]),now:now))
        XCTAssertEqual(Set(wire.keys),Set(["version","consent","day","asked","notes"]))
    }
    func testRestSkipsUntilNextLocalDayAndSecondRestRetires() throws {
        var bytes:Data?;let store=CompanionContextStore(read:{bytes},write:{bytes=$0;return true})
        store.choose(true,now:now,calendar:calendar);store.answered(now:now,calendar:calendar)
        XCTAssertTrue(store.restQuestion("interest",now:now,calendar:calendar))
        XCTAssertEqual(store.next(now:now,calendar:calendar)?.id,"barrier")
        let tomorrow=calendar.date(byAdding:.day,value:1,to:calendar.startOfDay(for:now))!
        store.answered(now:tomorrow,calendar:calendar); XCTAssertEqual(store.next(now:tomorrow,calendar:calendar)?.id,"interest")
        XCTAssertTrue(store.restQuestion("interest",now:tomorrow,calendar:calendar));XCTAssertTrue(store.state.asked.contains("interest"))
        XCTAssertEqual(store.next(now:tomorrow,calendar:calendar)?.id,"barrier")
    }
    func testDeletedNoteRetiresButExpiredNoteBecomesAskable() {
        var bytes:Data?;let store=CompanionContextStore(read:{bytes},write:{bytes=$0;return true})
        store.choose(true,now:now,calendar:calendar);store.answered(now:now,calendar:calendar);store.answer("interest",value:"crypto",now:now)
        store.delete("interest");XCTAssertTrue(store.state.asked.contains("interest"))
        store.answer("barrier",value:CompanionCatalog.question("barrier")!.options[0].id,now:now)
        store.opened(now:now.addingTimeInterval(31*86400),calendar:calendar)
        XCTAssertFalse(store.state.asked.contains("barrier"));XCTAssertTrue(store.state.asked.contains("interest"))
    }
    func testUndecodableRecordCannotBeOverwrittenBeforeBackup() {
        var bytes:Data?=Data("broken legacy bytes".utf8)
        let store=CompanionContextStore(read:{bytes},write:{bytes=$0;return true})
        store.choose(true);XCTAssertFalse(store.accepted);XCTAssertEqual(bytes,Data("broken legacy bytes".utf8))
        let defaults=UserDefaults(suiteName:"corrupt-test-"+UUID().uuidString)!;defaults.set(true,forKey:"companion.context.install.v1")
        store.prepareInstall(defaults:defaults);store.choose(true)
        XCTAssertEqual(defaults.data(forKey:"companion.context.undecodable.v1"),Data("broken legacy bytes".utf8))
        XCTAssertTrue(store.accepted)
    }
    func testFailedDeclineClosesForTheLaunchAndKeepsWireEmpty() {
        let store=CompanionContextStore(read:{nil},write:{_ in false})
        store.choose(true);XCTAssertFalse(store.accepted);store.choose(false)
        XCTAssertTrue(store.decided);XCTAssertNil(store.wire(capability:.init(enabled:true,context:true,catalog:1,notices:["memory-1"])))
    }
}

@MainActor
final class CompanionNotesOwnershipTests: XCTestCase {
    private func seeded() -> CompanionContextStore {
        var data: Data?
        let store = CompanionContextStore(read: { data }, write: { data = $0; return true })
        store.choose(true); store.answered(); store.answer("interest", value: "crypto")
        return store
    }
    func testGuestToFirstSignInKeepsConsentAndEveryNoteAndStoresOnlyHash() {
        let store = seeded(); let before = store.state.notes
        XCTAssertFalse(store.bindOwner("first-account")); XCTAssertTrue(store.accepted); XCTAssertEqual(store.state.notes, before)
        XCTAssertEqual(store.state.ownerTag, SpeakingDial().tag("first-account")); XCTAssertNotEqual(store.state.ownerTag, "first-account")
        let wire = store.wire(capability:.init(enabled:true,context:true,catalog:1,notices:["memory-1"]))!
        XCTAssertEqual(Set(wire.keys),Set(["version","consent","day","asked","notes"]))
    }
    func testSignOutAndSameAccountReturnKeepConsentAndExpiry() {
        let store = seeded(); store.bindOwner("a"); let before = store.state
        XCTAssertFalse(store.bindOwner(nil)); XCTAssertFalse(store.bindOwner("a")); XCTAssertEqual(store.state, before)
    }
    func testDifferentAccountResetsBeforeContextCanTravelAndSurvivesRestart() {
        var data:Data?;let store=CompanionContextStore(read:{data},write:{data=$0;return true})
        store.choose(true);store.answered();store.answer("interest",value:"crypto");store.bindOwner("a")
        XCTAssertTrue(store.bindOwner("b"));XCTAssertFalse(store.accepted);XCTAssertFalse(store.decided);XCTAssertTrue(store.state.notes.isEmpty)
        XCTAssertNil(store.wire(capability:.init(enabled:true,context:true,catalog:1,notices:["memory-1"])))
        let restarted=CompanionContextStore(read:{data},write:{data=$0;return true})
        XCTAssertFalse(restarted.bindOwner("b"));XCTAssertTrue(restarted.state.notes.isEmpty);XCTAssertFalse(restarted.accepted)
    }
    func testFailedAccountResetCannotLeakOldNotes() {
        var data:Data?;var failing=false
        let store=CompanionContextStore(read:{data},write:{if failing{return false};data=$0;return true})
        store.choose(true);store.answered();store.answer("interest",value:"crypto");store.bindOwner("a");failing=true
        XCTAssertTrue(store.bindOwner("b"));XCTAssertFalse(store.accepted);XCTAssertTrue(store.state.notes.isEmpty);XCTAssertTrue(store.storageError)
        XCTAssertNil(store.wire(capability:.init(enabled:true,context:true,catalog:1,notices:["memory-1"])))
        failing=false;store.bindOwner("b");XCTAssertFalse(store.accepted);XCTAssertTrue(store.state.notes.isEmpty)
    }
    func testUndoRestoresExactSourceAndExpiryAndDeletedQuestionStaysRetired() {
        let store=seeded();let note=store.state.notes[0]
        XCTAssertTrue(store.delete("interest"));XCTAssertTrue(store.state.asked.contains("interest"));XCTAssertTrue(store.restore(note))
        XCTAssertEqual(store.state.notes,[note]);XCTAssertFalse(store.restore(note))
    }
    func testInferenceChangesOnlyThroughExplicitConfirmationOrCatalogCorrection() {
        let store=seeded();XCTAssertTrue(store.apply(["notes":[["field":"barrier","value":"words","source":"inferred"]],"asked":["barrier"]],for:"barrier"))
        let before=store.state.notes.first{$0.field=="barrier"}!
        store.opened();XCTAssertEqual(store.state.notes.first{$0.field=="barrier"}?.source,"inferred")
        XCTAssertTrue(store.confirm("barrier"));let after=store.state.notes.first{$0.field=="barrier"}!
        XCTAssertEqual(after.source,"confirmed");XCTAssertEqual(after.expiresAt,before.expiresAt);XCTAssertEqual(after.value,before.value)
        XCTAssertFalse(store.confirm("barrier"));XCTAssertTrue(store.correct("barrier",value:"unsure"));XCTAssertEqual(store.state.notes.first{$0.field=="barrier"}?.source,"confirmed")
        XCTAssertFalse(store.correct("barrier",value:"raw private words"))
        for q in CompanionCatalog.questions { for value in q.spoken { XCTAssertTrue(q.correctionValues.contains(value));XCTAssertNotNil(q.label(value)) } }
    }
    func testMoreDetailsHasExactLocalizedNotesURLInAllSixLanguages() {
        let before=UserDefaults.standard.string(forKey:L.preferenceKey)
        defer { if let before { UserDefaults.standard.set(before,forKey:L.preferenceKey) } else { UserDefaults.standard.removeObject(forKey:L.preferenceKey) } }
        for language in ["en","es","fr","pt","it","de"] {
            UserDefaults.standard.set(language,forKey:L.preferenceKey)
            XCTAssertEqual(CompanionCopy.privacyURL.absoluteString,"https://bobbyprotocol.xyz/privacy?lang=\(language)#notes")
        }
    }

}
