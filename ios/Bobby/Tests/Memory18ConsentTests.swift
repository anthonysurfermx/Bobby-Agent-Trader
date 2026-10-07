import Foundation
import XCTest
@testable import Bobby

/// Memory consent (1.8): the answer is a record per account and per device, a decline is
/// remembered, "Remember" turns memory on step by step and stops honestly when a step fails, and
/// the opt-in header leaves the phone only after "Remember" to the consent as it reads today (a
/// switch without that record, or a yes to an older wording, affirms nothing). The sheet says what
/// the server really sends to the AI provider. No request leaves the process: the
/// memory center's transport is an injected closure and the one wire-level test runs on a URL stub.
@MainActor
final class Memory18ConsentTests: XCTestCase {
    private var suiteName = ""
    private var defaults: UserDefaults!
    private var user: String? = "a"
    private var generation = UUID()
    private var calls: [(path: String, method: String, body: [String: Any]?)] = []
    private var clock = Date(timeIntervalSince1970: 1_800_000_000)
    private var previousLanguage: Any?

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "memory18.consent.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        user = "a"; generation = UUID(); calls = []
        clock = Date(timeIntervalSince1970: 1_800_000_000)
        previousLanguage = UserDefaults.standard.object(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        URLProtocol.registerClass(B34Stub.self)
        B34Stub.install(nil)
    }

    override func tearDown() async throws {
        B34Stub.install(nil)
        URLProtocol.unregisterClass(B34Stub.self)
        if let previousLanguage { UserDefaults.standard.set(previousLanguage, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    private func memoryJSON(enabled: Bool = true) -> [String: Any] {
        ["enabled": enabled, "prefs": [String: Any](), "assets": [Any](), "retentionDays": 90]
    }

    /// A center whose server answers what `reply` says for each call (method, body).
    private func center(reply: @escaping (String, [String: Any]?) throws -> (json: Any?, status: Int)) -> MemoryCenter {
        let c = MemoryCenter(observeAccount: false, defaults: defaults)
        c.currentUser = { [unowned self] in self.user }
        c.currentGeneration = { [unowned self] in self.generation }
        c.riskAccepted = { true }
        c.send = { [unowned self] path, method, body in
            self.calls.append((path, method, body))
            return try reply(method, body)
        }
        c.accountChanged(force: true)
        return c
    }

    private func model(_ center: MemoryCenter) -> MemoryConsentModel {
        // The model writes to the center's own store (this suite): the record its gate reads.
        let m = MemoryConsentModel(center: center)
        m.now = { [unowned self] in self.clock }
        return m
    }

    // MARK: The record

    func testTheRecordIsKeptPerAccountUnderAHashAndPerVersion() throws {
        let consent = MemoryConsent(defaults: defaults)
        XCTAssertNil(consent.record(user: "a"))
        XCTAssertFalse(consent.hasDecided(user: "a"))
        consent.set(accepted: true, user: "a", at: clock)
        XCTAssertEqual(consent.record(user: "a"), MemoryConsentRecord(version: MemoryConsent.currentVersion, decidedAt: clock, accepted: true))
        XCTAssertTrue(consent.hasDecided(user: "a"))
        XCTAssertTrue(consent.hasAccepted(user: "a"))
        XCTAssertNil(consent.record(user: "b"), "one account's answer is never another's")
        XCTAssertFalse(consent.hasDecided(user: "b"))
        let reworded = MemoryConsent(defaults: defaults, version: MemoryConsent.currentVersion + 1)
        XCTAssertEqual(reworded.record(user: "a")?.version, MemoryConsent.currentVersion, "the old answer is still readable")
        XCTAssertFalse(reworded.hasDecided(user: "a"), "a new consent version asks again")
        XCTAssertFalse(reworded.hasAccepted(user: "a"), "and a yes to the old wording is not a yes to the new one")
        XCTAssertEqual(MemoryConsent.currentVersion, 1)

        let key = MemoryConsent.key(user: "a")
        XCTAssertTrue(key.hasPrefix(MemoryConsent.keyPrefix))
        XCTAssertEqual(key.count, MemoryConsent.keyPrefix.count + 64, "the key is the SHA-256 of the user id")
        XCTAssertNotEqual(key, MemoryConsent.key(user: "b"))
        XCTAssertFalse(MemoryConsent.key(user: "someone@example.com").contains("someone"), "the user id itself is not in the key")
        XCTAssertNotNil(defaults.data(forKey: key))
        XCTAssertEqual(MemoryConsent(defaults: defaults).record(user: "a")?.accepted, true, "it survives a relaunch")
        consent.clear(user: "a")
        XCTAssertNil(consent.record(user: "a"))
    }

    func testADeclineIsRememberedAndTurnsNothingOn() async {
        let c = center { [unowned self] _, _ in (self.memoryJSON(), 200) }
        let m = model(c)
        m.decline()
        let consent = MemoryConsent(defaults: defaults)
        XCTAssertEqual(consent.record(user: "a"), MemoryConsentRecord(version: 1, decidedAt: clock, accepted: false))
        XCTAssertTrue(consent.hasDecided(user: "a"), "the offer does not come back")
        XCTAssertFalse(consent.hasAccepted(user: "a"))
        XCTAssertTrue(calls.isEmpty, "saying no sends nothing")
        XCTAssertFalse(c.nativeOptedIn)
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertEqual(m.phase, .asking)
        // Signing out and in as someone else: that person has not been asked.
        user = "b"; generation = UUID()
        m.accountChanged()
        XCTAssertFalse(consent.hasDecided(user: "b"))
    }

    func testADeclineAlsoLeavesAnEarlierOptInOff() async {
        let c = center { [unowned self] _, _ in (self.memoryJSON(), 200) }
        await c.refresh()
        XCTAssertTrue(c.setNativeCapture(true), "the 1.7 switch had been on")
        XCTAssertTrue(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        model(c).decline()
        XCTAssertFalse(c.nativeOptedIn, "no means this iPhone stays out of memory")
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
    }

    // MARK: "Remember"

    func testRememberReadsThenOptsInThenRecordsAndNeverBefore() async {
        let c = center { [unowned self] _, _ in (self.memoryJSON(), 200) }
        let m = model(c)
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation), "nothing is on before the answer")
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        let ok = await m.remember()
        XCTAssertTrue(ok)
        XCTAssertEqual(m.phase, .done)
        XCTAssertEqual(calls.map(\.method), ["GET"], "memory was already on for the account: one read, no write")
        XCTAssertTrue(c.nativeOptedIn)
        XCTAssertTrue(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertTrue(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "b", defaults: defaults))
        XCTAssertEqual(MemoryConsent(defaults: defaults).record(user: "a"),
                       MemoryConsentRecord(version: 1, decidedAt: clock, accepted: true))
        let again = await m.remember()
        XCTAssertFalse(again, "a second tap does nothing")
        XCTAssertEqual(calls.count, 1)
    }

    func testRememberResumesAPausedAccountMemoryFirst() async {
        var enabled = false
        let c = center { [unowned self] method, body in
            if method == "PATCH", body?["memoryEnabled"] as? Bool == true { enabled = true }
            return (self.memoryJSON(enabled: enabled), 200)
        }
        let m = model(c)
        let ok = await m.remember()
        XCTAssertTrue(ok)
        XCTAssertEqual(calls.map(\.method), ["GET", "PATCH"])
        XCTAssertEqual(calls.last?.body?["memoryEnabled"] as? Bool, true)
        XCTAssertEqual(calls.last?.body?.count, 1, "the write only resumes memory")
        XCTAssertTrue(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertTrue(MemoryConsent(defaults: defaults).hasAccepted(user: "a"))
    }

    func testRememberStopsAtTheFirstStepTheServerRefusesAndSaysSo() async {
        // 1. The read fails: no write, nothing on, nothing recorded.
        var c = center { _, _ in (["error": "down"], 503) }
        var m = model(c)
        var ok = await m.remember()
        XCTAssertFalse(ok)
        XCTAssertEqual(m.phase, .failed)
        XCTAssertEqual(calls.map(\.method), ["GET"])
        XCTAssertFalse(c.nativeOptedIn)
        XCTAssertNil(MemoryConsent(defaults: defaults).record(user: "a"), "a failure is not an answer")

        // 2. Memory is paused and the server refuses to resume it.
        calls = []
        c = center { [unowned self] method, _ in
            if method == "GET" { return (self.memoryJSON(enabled: false), 200) }
            return (["error": "no"], 403)
        }
        m = model(c)
        ok = await m.remember()
        XCTAssertFalse(ok)
        XCTAssertEqual(m.phase, .failed)
        XCTAssertEqual(calls.map(\.method), ["GET", "PATCH"])
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertNil(MemoryConsent(defaults: defaults).record(user: "a"))

        // 3. The server answers the resume but memory is still paused: still not on.
        calls = []
        c = center { [unowned self] _, _ in (self.memoryJSON(enabled: false), 200) }
        m = model(c)
        ok = await m.remember()
        XCTAssertFalse(ok)
        XCTAssertEqual(m.phase, .failed)
        XCTAssertFalse(c.nativeOptedIn)
        XCTAssertNil(MemoryConsent(defaults: defaults).record(user: "a"))

        // 4. The network is gone.
        calls = []
        c = center { _, _ in throw URLError(.notConnectedToInternet) }
        m = model(c)
        ok = await m.remember()
        XCTAssertFalse(ok)
        XCTAssertEqual(m.phase, .failed)
        XCTAssertFalse(c.nativeOptedIn)

        // The person may try again, and it works once the server does.
        calls = []
        c.send = { [unowned self] path, method, body in self.calls.append((path, method, body)); return (self.memoryJSON(), 200) }
        ok = await m.remember()
        XCTAssertTrue(ok)
        XCTAssertEqual(m.phase, .done)
        XCTAssertTrue(MemoryConsent(defaults: defaults).hasAccepted(user: "a"))
        XCTAssertEqual(MemoryConsentSheet.failedLine, "Could not enable memory.")
        XCTAssertEqual(MemoryConsentSheet.doneLine, "On from your next question.")
    }

    func testRememberWaitsForTheRiskNoticeAndAnAccount() async {
        let c = center { [unowned self] _, _ in (self.memoryJSON(), 200) }
        c.riskAccepted = { false }
        let m = model(c)
        var ok = await m.remember()
        XCTAssertFalse(ok)
        XCTAssertTrue(calls.isEmpty, "R11: no network before the risk notice")
        XCTAssertNil(MemoryConsent(defaults: defaults).record(user: "a"))
        c.riskAccepted = { true }
        user = nil; generation = UUID()
        m.accountChanged()
        XCTAssertFalse(m.signedIn)
        ok = await m.remember()
        XCTAssertFalse(ok)
        XCTAssertTrue(calls.isEmpty, "nobody signed in: nothing to turn on")
        m.decline()
        XCTAssertTrue(defaults.dictionaryRepresentation().keys.filter { $0.hasPrefix(MemoryConsent.keyPrefix) }.isEmpty,
                      "and nothing to record")
    }

    func testALateReplyAfterAnAccountSwitchTurnsNothingOnForAnyone() async {
        let started = expectation(description: "A's read is suspended")
        var pending: CheckedContinuation<(json: Any?, status: Int), Error>?
        let c = center { _, _ in ([String: Any](), 500) }
        c.send = { _, _, _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let m = model(c)
        let task = Task { await m.remember() }
        await fulfillment(of: [started], timeout: 3)
        XCTAssertEqual(m.phase, .working)
        let previous = generation
        user = "b"; generation = UUID()
        c.accountChanged()
        pending?.resume(returning: (memoryJSON(), 200))
        let ok = await task.value
        XCTAssertFalse(ok)
        XCTAssertEqual(m.phase, .asking, "B sees the question, not A's outcome")
        let consent = MemoryConsent(defaults: defaults)
        XCTAssertNil(consent.record(user: "a"))
        XCTAssertNil(consent.record(user: "b"))
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "b", defaults: defaults))
        XCTAssertFalse(c.allowsNativeCapture(user: "b", generation: generation))
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: previous))
    }

    // MARK: What the sheet says

    /// LEAD UPDATE 1: the consent says what the server's reader context really sends
    /// (api/_lib/user-memory.ts, readerContext): the first name, the asset's history, the preferences
    /// and the assets asked about most. It never denies the name, and never promises a deletion date.
    func testTheConsentSaysWhatIsKeptWhatIsSentForHowLongAndHowToUndoIt() {
        let full = MemoryExplanation.items(retentionDays: 90)
        XCTAssertEqual(full.map(\.id), ["keep", "sent", "howlong", "control"])
        let compact = MemoryExplanation.items(retentionDays: 90, compact: true)
        XCTAssertEqual(compact.map(\.id), ["keep", "sent", "howlong"], "the memory screen also says what reaches the AI provider")
        XCTAssertEqual(Array(full.prefix(3)), compact, "one explanation, the same words")

        XCTAssertEqual(full[0].label, "Kept by Bobby")
        XCTAssertEqual(full[0].text, "Asset · date · stated time frame · price that day")
        XCTAssertEqual(full[0].note, "Your question text is not kept.")
        XCTAssertEqual(full[1].label, "Sent to the AI that answers")
        XCTAssertEqual(full[1].text, "Your first name · how often and when you asked about this asset · the time frame you named · its price that day and the change since · your preferences · your most-asked assets")
        XCTAssertNil(full[2].label)
        XCTAssertEqual(full[2].text, "Unused after 90 days without a question.")
        XCTAssertEqual(MemoryExplanation.items(retentionDays: 30)[2].text, "Unused after 30 days without a question.",
                       "the retention is the server's number")
        XCTAssertEqual(full[3].text, "Edit or delete in Memory.")

        // An inventory, item by item: nothing is folded into "a summary".
        let sent = full[1].text
        XCTAssertEqual(sent.components(separatedBy: " · ").count, 6)
        for fact in ["first name", "how often and when", "time frame you named", "its price that day", "the change since", "preferences", "most-asked assets"] {
            XCTAssertTrue(sent.contains(fact), "the sent line names: \(fact)")
        }
        XCTAssertFalse(sent.lowercased().contains("summary"))
        for item in full {
            let text = [item.label, item.text, item.note].compactMap { $0 }.joined(separator: " ").lowercased()
            if item.id != "sent" { XCTAssertFalse(text.contains("name"), "\(item.id) must not speak about the name: only the sent line does") }
            XCTAssertFalse(text.contains("never"), "\(item.id): nothing is denied that the server sends")
            XCTAssertFalse(text.contains("deleted after") || text.contains("for 90 days"), "\(item.id): no retention worded as a deletion guarantee")
        }
        XCTAssertTrue(full[2].text.contains("Unused after"), "the end of use, not a deletion date")

        // The same structure in six languages: every row is translated, and the sent line names the first name.
        let firstName = ["en": "first name", "es": "nombre de pila", "fr": "prénom", "pt": "primeiro nome", "it": "il tuo nome", "de": "vorname"]
        let ai = ["en": "AI", "es": "IA", "fr": "IA", "pt": "IA", "it": "IA", "de": "KI"]
        let english = full
        for (language, word) in firstName {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            let items = MemoryExplanation.items(retentionDays: 90)
            XCTAssertEqual(items.map(\.id), ["keep", "sent", "howlong", "control"], language)
            XCTAssertTrue(items[1].text.lowercased().contains(word), "\(language): \(items[1].text)")
            XCTAssertTrue(items[1].label?.contains(ai[language] ?? "?") == true, "\(language): the label says who receives it: \(items[1].label ?? "")")
            XCTAssertEqual(items[1].text.components(separatedBy: " · ").count, 6, "\(language): six things are sent, each named")
            XCTAssertTrue(items[2].text.contains("90"), language)
            for item in items {
                XCTAssertFalse(item.text.contains("{"), "\(language): an unfilled placeholder in \(item.text)")
                if item.id != "sent" {
                    for word in firstName.values { XCTAssertFalse(item.text.lowercased().contains(word), "\(language) \(item.id): \(item.text)") }
                }
                if language != "en" {
                    XCTAssertNotEqual(item.text, english.first { $0.id == item.id }?.text, "\(language) \(item.id) is translated")
                    if item.label != nil {
                        XCTAssertNotEqual(item.label, english.first { $0.id == item.id }?.label, "\(language) \(item.id) label is translated")
                    }
                }
            }
        }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        XCTAssertTrue(MemoryView.deleteEverythingWarning.contains("the shortcuts on this iPhone and the theses you wrote here"))
        XCTAssertTrue(MemoryView.deleteEverythingWarning.hasSuffix("It cannot be undone."))
    }

    /// The memory screen says what the code does with what the phone keeps: a thesis's text does
    /// leave the phone inside a review (NucleoDesk.debate puts it in the desk request), and Forget
    /// removes a shortcut, not a thesis.
    func testTheMemoryScreenDoesNotOverstateWhatStaysOnThePhoneOrWhatForgetRemoves() {
        let note = MemoryView.onThisPhoneNote
        XCTAssertEqual(note, "Bobby keeps these on this iPhone, not on its servers. The text of a thesis is sent, with that question, only when you start a review: to Bobby and to the AI providers that write the answer.")
        XCTAssertFalse(note.lowercased().contains("never leave"))
        XCTAssertTrue(note.contains("AI providers"), "what reaches an AI provider is said where it happens")
        let deletion = MemoryView.onThisPhoneDeletionNote
        XCTAssertEqual(deletion, "Forget removes an asset's shortcut. Delete everything clears the shortcuts and the theses you wrote.")
        // What that sentence promises is what the code does: Memory18EraseTests covers both deletions end to end.
        for language in ["es", "fr", "pt", "it", "de"] {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            XCTAssertNotEqual(MemoryView.onThisPhoneNote, note, language)
            XCTAssertNotEqual(MemoryView.onThisPhoneDeletionNote, deletion, language)
        }
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
    }

    // MARK: The consent gates capture

    /// iOS 1.7 had a plain switch and no consent record. In 1.8 that switch alone affirms nothing:
    /// it is revoked when read, the header stops, and the account is asked through the sheet.
    func testASwitchWithoutAnAcceptedConsentIsRevokedAndTheAccountIsAskedAgain() async {
        let c = center { [unowned self] _, _ in (self.memoryJSON(), 200) }
        await c.refresh()
        XCTAssertTrue(c.setNativeCapture(true), "the state a 1.7 install left behind: the switch on, no record")
        XCTAssertNil(MemoryConsent(defaults: defaults).record(user: "a"))
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation), "the header is not sent")
        XCTAssertFalse(c.nativeOptedIn, "and the screen shows \"Turn on\", not a switch that is on")
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults), "the switch is revoked, not just ignored")

        // The same on a fresh launch: a new center over the stored switch.
        defaults.set(true, forKey: "agent.nativeMemoryOptIn.v1." + MemoryConsent.digest(user: "a"))
        XCTAssertTrue(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults), "this is the key the 1.7 switch wrote")
        let relaunched = MemoryCenter(observeAccount: false, defaults: defaults)
        relaunched.currentUser = { [unowned self] in self.user }
        relaunched.currentGeneration = { [unowned self] in self.generation }
        relaunched.riskAccepted = { true }
        relaunched.accountChanged(force: true)
        XCTAssertFalse(relaunched.nativeOptedIn)
        XCTAssertFalse(relaunched.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))

        // A declined record does not count either.
        defaults.set(true, forKey: "agent.nativeMemoryOptIn.v1." + MemoryConsent.digest(user: "a"))
        MemoryConsent(defaults: defaults).set(accepted: false, user: "a", at: clock)
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation))
        MemoryConsent(defaults: defaults).clear(user: "a")

        // The account is offered memory again on the glass, and "Remember" turns it on properly.
        let live = MemoryNudges.liveState(user: "a", defaults: defaults, erased: { _, _ in false })
        XCTAssertFalse(live.captureOn)
        XCTAssertFalse(live.decided)
        let read = NudgeRead(requestId: "r", symbol: "NVDA", name: "NVDA", isEquity: true, verdict: "wait", saved: false, at: clock)
        let moment = NudgeMoment(signedIn: true, now: clock, lastRead: read, readsThisLaunch: 1)
        XCTAssertEqual(MemoryNudges.candidate(moment, state: live)?.id, MemoryNudges.offerId(user: "a", now: clock))
        let ok = await model(c).remember()
        XCTAssertTrue(ok)
        XCTAssertTrue(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertTrue(c.nativeOptedIn)
        XCTAssertNil(MemoryNudges.candidate(moment, state: MemoryNudges.liveState(user: "a", defaults: defaults, erased: { _, _ in false })))
    }

    /// The consent text changed (version 2): an account that said yes to version 1 stops sending the
    /// header and is offered the new consent; saying yes to it turns capture back on.
    func testAcceptedVersionOneUnderVersionTwoSendsNoHeaderAndTheOfferReturns() async {
        let c = center { [unowned self] _, _ in (self.memoryJSON(), 200) }
        let accepted = await model(c).remember()
        XCTAssertTrue(accepted)
        XCTAssertTrue(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertEqual(MemoryConsent(defaults: defaults).record(user: "a")?.version, 1)
        let read = NudgeRead(requestId: "r", symbol: "NVDA", name: "NVDA", isEquity: true, verdict: "wait", saved: false, at: clock)
        let moment = NudgeMoment(signedIn: true, now: clock, lastRead: read, readsThisLaunch: 1)
        func live(_ version: Int) -> MemoryNudges.State { MemoryNudges.liveState(user: "a", defaults: defaults, version: version, erased: { _, _ in false }) }
        XCTAssertNil(MemoryNudges.candidate(moment, state: live(1)), "under version 1 it is on and answered")

        c.consentVersion = 2
        XCTAssertEqual(c.consent.version, 2)
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation), "the header is not sent under a consent the person never saw")
        XCTAssertFalse(c.nativeOptedIn)
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: "a", defaults: defaults))
        XCTAssertFalse(live(2).captureOn)
        XCTAssertFalse(live(2).decided)
        let offer = MemoryNudges.candidate(moment, state: live(2))
        XCTAssertEqual(offer?.id, "memory.offer.v2." + MemoryNudges.fragment(user: "a"), "the offer returns, under an id of its own")
        XCTAssertNotNil(offer?.id.range(of: NucleoNudge.idPattern, options: .regularExpression))
        // Going back to the old wording does not quietly restore what was revoked.
        c.consentVersion = 1
        XCTAssertFalse(c.allowsNativeCapture(user: "a", generation: generation))

        c.consentVersion = 2
        let again = await model(c).remember()
        XCTAssertTrue(again)
        XCTAssertEqual(MemoryConsent(defaults: defaults).record(user: "a")?.version, 2)
        XCTAssertTrue(c.allowsNativeCapture(user: "a", generation: generation))
        XCTAssertNil(MemoryNudges.candidate(moment, state: live(2)))

        // The memory screen's own read (it calls reloadLocal when it appears) applies the same gate.
        c.consentVersion = 3
        XCTAssertTrue(c.nativeOptedIn, "not yet re-read")
        c.reloadLocal()
        XCTAssertFalse(c.nativeOptedIn, "the screen shows \"Turn on\" as soon as it appears")
    }

    func testMemoryCopyAvoidsTheWordsBobbyNeverUses() {
        let banned = ["buy", "sell", "profit", "guaranteed", "returns", "advice", "signal", "alert", "watched", "monitored", "detected"]
        for key in NativeTranslations18.memory.keys {
            let words = key.lowercased().components(separatedBy: CharacterSet.letters.inverted)
            for word in banned { XCTAssertFalse(words.contains(word), "\"\(key)\" uses \"\(word)\"") }
            XCTAssertFalse(key.contains("!"), key)
        }
    }

    // MARK: On the wire

    /// The audit, end to end through `BobbyAPI.responseWithHeaders` and the real singletons: the
    /// header is absent before "Remember" (even when a caller tries to supply it), absent after
    /// "Not now", present after "Remember" on this account's own desk POST only, and gone at sign-out.
    func testTheOptInHeaderIsNeverSentBeforeRememberAndIsSentAfter() async throws {
        let account = AccountSession.shared
        let center = MemoryCenter.shared
        let previousSession = account.session
        let previousSend = center.send
        let previousRisk = center.riskAccepted
        let wireUser = "memory18-wire-user"
        let token = "memory18-wire-token"
        defer {
            if account.session?.userId == wireUser { _ = center.setNativeCapture(false) }
            center.consentVersion = MemoryConsent.currentVersion
            MemoryConsent().clear(user: wireUser)
            center.send = previousSend
            center.riskAccepted = previousRisk
            if let previousSession { account.accept(previousSession) } else { account.signOut() }
            center.accountChanged(force: true)
        }
        B34Stub.install { seen in seen.path == "/api/desk-debate" ? .json(200, "{}") : .json(503, "{}") }
        account.accept(StoredSession(accessToken: token, refreshToken: "memory18-wire-refresh",
                                     expiresAt: Date().addingTimeInterval(3_600), userId: wireUser))
        center.riskAccepted = { true }
        center.send = { [unowned self] _, _, _ in (self.memoryJSON(), 200) }
        center.accountChanged(force: true)
        _ = center.setNativeCapture(false)

        func deskHeader(bearer: String = token, path: String = "api/desk-debate", method: String = "POST") async throws -> String? {
            let before = B34Stub.requests.count
            _ = try await BobbyAPI.responseWithHeaders(path, method: method, body: method == "POST" ? ["symbol": "BTC"] : nil,
                                                       extraHeaders: ["Authorization": "Bearer \(bearer)", MemoryCenter.nativeOptInHeader: "1"])
            let sent = B34Stub.requests.dropFirst(before).first { $0.path == "/" + path }
            XCTAssertNotNil(sent, "the request reached the stub")
            return sent?.request.value(forHTTPHeaderField: MemoryCenter.nativeOptInHeader)
        }

        let m = MemoryConsentModel(center: center)
        var header = try await deskHeader()
        XCTAssertNil(header, "before any answer the header is not sent, even when a caller supplies it")
        // The switch as iOS 1.7 left it (on, with no consent record) affirms nothing in 1.8.
        await center.refresh()
        XCTAssertTrue(center.setNativeCapture(true))
        header = try await deskHeader()
        XCTAssertNil(header, "a switch without an accepted consent sends no opt-in")
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: wireUser), "and is revoked")
        m.decline()
        header = try await deskHeader()
        XCTAssertNil(header, "\"Not now\" sends no consent")
        let remembered = await m.remember()
        XCTAssertTrue(remembered)
        header = try await deskHeader()
        XCTAssertEqual(header, "1", "after \"Remember\" this account's desk question carries the opt-in")
        header = try await deskHeader(bearer: "someone-elses-token")
        XCTAssertNil(header, "a bearer that is not this account's never borrows the consent")
        header = try await deskHeader(path: "api/bobby-access")
        XCTAssertNil(header, "only the desk question carries it")
        header = try await deskHeader(method: "GET")
        XCTAssertNil(header, "and only a POST")
        _ = center.setNativeCapture(false)
        header = try await deskHeader()
        XCTAssertNil(header, "switching it off in Memory stops it at once")
        var again = await MemoryConsentModel(center: center).remember()
        XCTAssertTrue(again)
        header = try await deskHeader()
        XCTAssertEqual(header, "1")
        // The consent is reworded (version 2): the yes to version 1 no longer sends anything.
        center.consentVersion = MemoryConsent.currentVersion + 1
        header = try await deskHeader()
        XCTAssertNil(header, "accepted v1 under version 2: the header is not sent")
        center.consentVersion = MemoryConsent.currentVersion
        header = try await deskHeader()
        XCTAssertNil(header, "and it does not come back by itself")
        again = await MemoryConsentModel(center: center).remember()
        XCTAssertTrue(again)
        account.signOut()
        header = try await deskHeader()
        XCTAssertNil(header, "signed out: nothing is affirmed")
        XCTAssertTrue(MemoryCenter.storedNativeOptIn(user: wireUser), "the choice stays stored for that account only")
        account.accept(StoredSession(accessToken: token, refreshToken: "memory18-wire-refresh",
                                     expiresAt: Date().addingTimeInterval(3_600), userId: wireUser))
        _ = center.setNativeCapture(false)
        XCTAssertFalse(MemoryCenter.storedNativeOptIn(user: wireUser), "the test leaves no opt-in behind")
    }
}
