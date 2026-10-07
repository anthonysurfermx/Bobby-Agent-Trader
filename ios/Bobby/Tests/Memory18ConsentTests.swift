import Foundation
import XCTest
@testable import Bobby

/// Memory consent (1.8): the answer is a record per account and per device, a decline is
/// remembered, "Remember" turns memory on step by step and stops honestly when a step fails, and
/// the opt-in header leaves the phone only after "Remember". No request leaves the process: the
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
        let m = MemoryConsentModel(center: center, consent: MemoryConsent(defaults: defaults))
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
        XCTAssertFalse(consent.hasDecided(user: "a", version: MemoryConsent.currentVersion + 1), "a new consent version asks again")
        XCTAssertFalse(consent.hasAccepted(user: "a", version: MemoryConsent.currentVersion + 1))
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
        XCTAssertEqual(MemoryConsentSheet.failedLine, "I could not turn memory on. Try again.")
        XCTAssertEqual(MemoryConsentSheet.doneLine, "Done. From your next question on, I will remember.")
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

    func testTheConsentSaysAllFiveThingsAndTheScreenTheFirstThree() {
        let full = MemoryExplanation.items(retentionDays: 90)
        XCTAssertEqual(full.map(\.id), ["keep", "never", "where", "who", "control"])
        XCTAssertEqual(MemoryExplanation.items(retentionDays: 90, compact: true).map(\.id), ["keep", "never", "where"])
        XCTAssertTrue(full[2].text.contains("90 days"), "the retention is the server's number")
        XCTAssertTrue(MemoryExplanation.items(retentionDays: 30)[2].text.contains("30 days"))
        XCTAssertTrue(full[3].text.contains("AI provider"), "who receives it is named")
        XCTAssertTrue(MemoryView.deleteEverythingWarning.contains("the shortcuts on this iPhone and the theses you wrote here"))
        XCTAssertTrue(MemoryView.deleteEverythingWarning.hasSuffix("It cannot be undone."))
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

        let m = MemoryConsentModel(center: center, consent: MemoryConsent(defaults: defaults))
        var header = try await deskHeader()
        XCTAssertNil(header, "before any answer the header is not sent, even when a caller supplies it")
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
        let again = await MemoryConsentModel(center: center, consent: MemoryConsent(defaults: defaults)).remember()
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
