import Foundation
import XCTest
@testable import Bobby

/// Account-bound briefing settings: saved only after the server answers, 409 shows the server's value,
/// an account switch clears everything and rejects late answers, iOS permission stays separate.
@MainActor
final class BriefingsCenterTests: XCTestCase {
    private var user: String? = "a"
    private var generation = UUID()
    private var status: PushPermission = .authorized
    private var permissionRequests = 0
    private var deliveryEnables = 0
    private var saves: [(revision: Int, changes: [String: Any])] = []

    override func setUp() async throws {
        try await super.setUp()
        user = "a"; generation = UUID(); status = .authorized
        permissionRequests = 0; deliveryEnables = 0; saves = []
    }

    private func snapshot(revision: Int, opening: Bool = false, close: Bool = false, weekly: Bool = false,
                          language: String = "en", companion: String? = nil, eligible: Bool = true,
                          analysisConsent: Bool = false, audioConsent: Bool = false) -> BriefingSettingsSnapshot {
        let json: [String: Any] = [
            "revision": revision, "openingEnabled": opening, "closeEnabled": close, "weeklyEnabled": weekly,
            "language": language, "companionId": companion as Any, "assets": ["BTC", "NVDA"],
            "analysisConsentEnabled": analysisConsent, "analysisConsentVersion": analysisConsent ? 1 : NSNull(),
            "audioConsentEnabled": audioConsent, "audioConsentVersion": audioConsent ? 1 : NSNull(),
            "eligiblePro": eligible,
            "schedules": ["timezone": "America/New_York", "policyVersion": "proposed-v1",
                          "opening": ["configured": true, "localTime": "08:00", "nextAt": "2026-10-03T12:00:00.000Z"],
                          "close": ["configured": false, "delayMinutes": 15, "nextAt": NSNull()],
                          "weekly": ["configured": false, "weekday": "Sunday", "localTime": "18:00", "nextAt": NSNull()]],
            "options": ["assets": ["BTC", "ETH", "NVDA"], "companions": ["orb", "kora"], "consentVersions": ["analysis": 1, "audio": 1]],
        ]
        return BriefingSettingsSnapshot(json: json)!
    }

    private func center(initial: BriefingSettingsSnapshot? = nil) -> BriefingsCenter {
        let c = BriefingsCenter(observeAccount: false)
        c.auth = .none
        c.currentUser = { [unowned self] in self.user }
        c.currentGeneration = { [unowned self] in self.generation }
        c.riskAccepted = { true }
        c.appLanguage = { "en" }
        c.currentCompanion = { nil }
        c.permissionStatus = { [unowned self] in self.status }
        c.requestPermission = { [unowned self] in self.permissionRequests += 1; return self.status }
        c.deliveryEnabled = { [unowned self] in self.deliveryEnables += 1 }
        c.load = { _ in throw BriefingsError.unavailable }
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            throw BriefingsError.unavailable
        }
        c.accountChanged(force: true)
        if let initial { c.apply(initial) }
        return c
    }

    // MARK: account isolation

    func testAccountSwitchClearsAtOnceAndRejectsALateAnswerFromA() async {
        let c = center(initial: snapshot(revision: 2, opening: true))
        XCTAssertTrue(c.isOn(.morning))
        let started = expectation(description: "A's settings read is suspended")
        var pending: CheckedContinuation<BriefingSettingsSnapshot, Error>?
        c.load = { _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let result = Task { await c.refresh() }
        await fulfillment(of: [started], timeout: 3)
        user = "b"; generation = UUID()
        c.accountChanged()
        XCTAssertNil(c.settings)
        XCTAssertNil(c.eligiblePro)
        XCTAssertNil(c.options)
        XCTAssertFalse(c.isOn(.morning))
        pending?.resume(returning: snapshot(revision: 3, opening: true, weekly: true))
        let refreshed = await result.value
        XCTAssertFalse(refreshed)
        XCTAssertNil(c.settings, "A's answer never reaches B")
    }

    func testLatePatchAnswerFromAIsRejectedAfterTheSwitch() async {
        let c = center(initial: snapshot(revision: 1))
        let started = expectation(description: "A's PATCH is suspended")
        var pending: CheckedContinuation<BriefingSettingsSnapshot, Error>?
        c.save = { _, _, _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let result = Task { await c.setCadence(.morning, on: true) }
        await fulfillment(of: [started], timeout: 3)
        XCTAssertTrue(c.isSaving(.morning))
        user = "b"; generation = UUID()
        c.accountChanged()
        XCTAssertFalse(c.isSaving(.morning), "B never sees A's pending switch")
        pending?.resume(returning: snapshot(revision: 2, opening: true))
        let saved = await result.value
        XCTAssertFalse(saved)
        XCTAssertNil(c.settings)
        XCTAssertFalse(c.isOn(.morning))
        XCTAssertEqual(deliveryEnables, 0, "A's late answer does not register B's device")
    }

    func testSameUserSigningBackInIsANewEpoch() async {
        let c = center(initial: snapshot(revision: 4, close: true))
        generation = UUID()
        c.accountChanged()
        XCTAssertNil(c.settings)
    }

    // MARK: save after response

    func testSwitchIsSavedOnlyAfterTheServerAnswersAndRevertsOnFailure() async {
        let c = center(initial: snapshot(revision: 1))
        let started = expectation(description: "PATCH in flight")
        var pending: CheckedContinuation<BriefingSettingsSnapshot, Error>?
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return try await withCheckedThrowingContinuation { pending = $0; started.fulfill() }
        }
        let result = Task { await c.setCadence(.morning, on: true) }
        await fulfillment(of: [started], timeout: 3)
        XCTAssertTrue(c.isOn(.morning), "the switch shows the pending target")
        XCTAssertTrue(c.isSaving(.morning))
        XCTAssertEqual(c.settings?.openingEnabled, false, "nothing is persisted before the answer")
        let second = await c.setCadence(.morning, on: false)
        XCTAssertFalse(second, "one flip at a time per cadence")
        pending?.resume(throwing: BriefingsError.unavailable)
        let saved = await result.value
        XCTAssertFalse(saved)
        XCTAssertFalse(c.isOn(.morning), "reverted to the confirmed value")
        XCTAssertFalse(c.isSaving(.morning))
        XCTAssertEqual(c.lastError, .unavailable)
        XCTAssertEqual(saves.count, 1)
        XCTAssertEqual(saves[0].revision, 1)
        XCTAssertEqual(saves[0].changes["openingEnabled"] as? Bool, true)
        XCTAssertEqual(deliveryEnables, 0)

        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return self.snapshot(revision: 2, opening: true)
        }
        let enabled = await c.setCadence(.morning, on: true)
        XCTAssertTrue(enabled)
        XCTAssertTrue(c.isOn(.morning))
        XCTAssertEqual(c.settings?.revision, 2)
        XCTAssertNil(c.lastError)
        XCTAssertEqual(deliveryEnables, 1, "a confirmed enable with permission asks for the APNs token")
        XCTAssertEqual(permissionRequests, 0, "permission was already decided: no prompt")
    }

    func testFirstEnableMirrorsTheAppLanguageAndAllowedCompanion() async {
        let c = center(initial: snapshot(revision: 1, language: "en"))
        c.appLanguage = { "es" }
        c.currentCompanion = { "kora" }
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return self.snapshot(revision: revision + 1, opening: true, language: "es", companion: "kora")
        }
        _ = await c.setCadence(.morning, on: true)
        XCTAssertEqual(saves.last?.changes["language"] as? String, "es")
        XCTAssertEqual(saves.last?.changes["companionId"] as? String, "kora")
        // A second cadence is not a first enable: nothing else is mirrored.
        c.appLanguage = { "en" }
        _ = await c.setCadence(.close, on: true)
        XCTAssertNil(saves.last?.changes["language"])
        XCTAssertNil(saves.last?.changes["companionId"])
        XCTAssertEqual(saves.last?.revision, 2, "each PATCH carries the newest revision")
    }

    func testConcurrentPatchesRunInOrderWithTheNewestRevision() async {
        let c = center(initial: snapshot(revision: 7))
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            await Task.yield()
            let s = self.snapshot(revision: revision + 1)
            return s
        }
        async let one = c.setLanguage("es")
        async let two = c.setAssets(["BTC"])
        _ = await (one, two)
        XCTAssertEqual(saves.map(\.revision), [7, 8])
    }

    func testConflictRefetchesAndShowsTheServerValueWithoutResending() async {
        let c = center(initial: snapshot(revision: 3))
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            throw BriefingsError.conflict(revision: 5)
        }
        c.load = { [unowned self] _ in self.snapshot(revision: 5, close: true) }
        let saved = await c.setCadence(.morning, on: true)
        XCTAssertFalse(saved)
        XCTAssertEqual(saves.count, 1, "the change is not re-sent on its own")
        XCTAssertEqual(c.settings?.revision, 5)
        XCTAssertFalse(c.isOn(.morning))
        XCTAssertTrue(c.isOn(.close), "the other device's choice is shown")
        XCTAssertEqual(c.lastError, .conflict(revision: 5))
    }

    func testAnOlderAnswerNeverReplacesANewerRevision() {
        let c = center(initial: snapshot(revision: 6, weekly: true))
        c.apply(snapshot(revision: 5))
        XCTAssertEqual(c.settings?.revision, 6)
        XCTAssertTrue(c.isOn(.weekly))
    }

    // MARK: permission

    func testDeniedPermissionKeepsTheSelectionAndShowsBlocked() async {
        status = .notDetermined
        let c = center(initial: snapshot(revision: 1))
        c.requestPermission = { [unowned self] in self.permissionRequests += 1; self.status = .denied; return .denied }
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return self.snapshot(revision: 2, opening: true)
        }
        let saved = await c.setCadence(.morning, on: true)
        XCTAssertTrue(saved)
        XCTAssertEqual(permissionRequests, 1, "the OS is asked once, on the explicit enable")
        XCTAssertEqual(c.settings?.openingEnabled, true, "the account selection is saved anyway")
        XCTAssertEqual(c.permission, .denied)
        XCTAssertTrue(c.deliveryBlocked)
        XCTAssertEqual(deliveryEnables, 0, "no token request while iOS blocks notifications")
        XCTAssertEqual(BriefingsCenter.systemSettingsURL?.absoluteString, "app-settings:")
        // Disabling never prompts.
        c.save = { [unowned self] _, revision, _ in self.snapshot(revision: revision + 1) }
        _ = await c.setCadence(.morning, on: false)
        XCTAssertEqual(permissionRequests, 1)
        XCTAssertFalse(c.deliveryBlocked)
    }

    func testExpiredProStillAllowsDisabling() async {
        let c = center(initial: snapshot(revision: 9, opening: true, weekly: true, eligible: false))
        XCTAssertEqual(c.eligiblePro, false)
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return self.snapshot(revision: 10, weekly: true, eligible: false)
        }
        let saved = await c.setCadence(.morning, on: false)
        XCTAssertTrue(saved)
        XCTAssertFalse(c.isOn(.morning))
        XCTAssertTrue(c.isOn(.weekly))
        XCTAssertEqual(saves.first?.changes as? [String: Bool], ["openingEnabled": false])
        XCTAssertEqual(permissionRequests, 0)
    }

    func testNoNetworkBeforeTheRiskNoticeOrWithoutAnAccount() async {
        let c = center()
        var loads = 0
        c.load = { [unowned self] _ in loads += 1; return self.snapshot(revision: 1) }
        c.riskAccepted = { false }
        let early = await c.refresh()
        XCTAssertFalse(early)
        let flipped = await c.setCadence(.morning, on: true)
        XCTAssertFalse(flipped)
        c.riskAccepted = { true }
        user = nil
        c.accountChanged()
        let signedOut = await c.refresh()
        XCTAssertFalse(signedOut)
        XCTAssertEqual(loads, 0)
        XCTAssertTrue(saves.isEmpty)
        XCTAssertEqual(permissionRequests, 0)
    }

    // MARK: consents and companion

    func testConsentSendsTheCurrentServerVersion() async {
        let c = center(initial: snapshot(revision: 1))
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return self.snapshot(revision: revision + 1, audioConsent: true)
        }
        let audio = await c.setAudioConsent(true)
        XCTAssertTrue(audio)
        XCTAssertEqual(saves.last?.changes["audioConsentEnabled"] as? Bool, true)
        XCTAssertEqual(saves.last?.changes["acceptedAudioConsentVersion"] as? Int, 1)
        let analysis = await c.setAnalysisConsent(false)
        XCTAssertTrue(analysis)
        XCTAssertEqual(saves.last?.changes as? [String: Bool], ["analysisConsentEnabled": false])
        XCTAssertTrue(c.savingFields.isEmpty)
    }

    func testCompanionIsMirroredOnlyWhenItDiffers() async {
        let c = center(initial: snapshot(revision: 1, companion: "orb"))
        c.save = { [unowned self] _, revision, changes in
            self.saves.append((revision, changes))
            return self.snapshot(revision: revision + 1, companion: changes["companionId"] as? String)
        }
        let same = await c.mirrorCompanion("orb")
        let unknown = await c.mirrorCompanion("not-on-the-list")
        let changed = await c.mirrorCompanion("kora")
        XCTAssertFalse(same)
        XCTAssertFalse(unknown)
        XCTAssertTrue(changed)
        XCTAssertEqual(saves.count, 1)
        XCTAssertEqual(saves[0].changes as? [String: String], ["companionId": "kora"])
        XCTAssertEqual(c.settings?.companionId, "kora")
    }

    // MARK: inbox

    func testInboxPagesAndRejectsALateAnswerFromA() async {
        let c = center()
        let first: [String: Any] = ["items": [["id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301", "cadence": "morning",
                                                "scheduledAt": "2026-10-02T12:00:00Z", "contentVersion": 1, "quality": "full"],
                                               ["id": "bad", "cadence": "morning"]],
                                    "nextCursor": "c1", "latest": [["cadence": "morning", "state": "preparing"]]]
        c.loadInbox = { _, _, _ in BriefingInboxPage(json: first)! }
        let loaded = await c.refreshInbox()
        XCTAssertTrue(loaded)
        XCTAssertEqual(c.inbox.count, 1, "malformed items are dropped")
        XCTAssertEqual(c.nextCursor, "c1")
        XCTAssertEqual(c.latest.first?.state, .preparing)
        c.loadInbox = { _, _, _ in throw BriefingsError.subscriptionRequired }
        let more = await c.loadMoreInbox()
        XCTAssertFalse(more)
        XCTAssertEqual(c.inboxError, .subscriptionRequired)
        XCTAssertEqual(c.inbox.count, 1, "a failure is not an empty inbox")

        let started = expectation(description: "inbox read suspended")
        var pending: CheckedContinuation<BriefingInboxPage, Error>?
        c.loadInbox = { _, _, _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let result = Task { await c.refreshInbox() }
        await fulfillment(of: [started], timeout: 3)
        user = "b"; generation = UUID()
        c.accountChanged()
        XCTAssertTrue(c.inbox.isEmpty)
        pending?.resume(returning: BriefingInboxPage(json: first)!)
        let late = await result.value
        XCTAssertFalse(late)
        XCTAssertTrue(c.inbox.isEmpty)
    }

    // MARK: API mapping and models

    func testErrorMappingNeverCarriesServerText() {
        func map(_ status: Int, _ body: [String: Any]?) -> BriefingsError {
            BriefingsAPI.error(BriefingsReply(json: body, status: status, headers: [:]))
        }
        XCTAssertEqual(map(401, ["error": "Sign in", "code": "signin_required"]), .signedOut)
        XCTAssertEqual(map(403, ["code": "subscription_required"]), .subscriptionRequired)
        XCTAssertEqual(map(403, ["code": "consent_required"]), .consentRequired)
        XCTAssertEqual(map(404, ["code": "not_found"]), .notFound)
        XCTAssertEqual(map(409, ["code": "revision_conflict", "revision": 8]), .conflict(revision: 8))
        XCTAssertEqual(map(409, ["code": "revision_conflict", "bindingRevision": 3]), .conflict(revision: 3))
        XCTAssertEqual(map(409, ["code": "conflict"]), .conflict(revision: nil))
        XCTAssertEqual(map(409, ["code": "idempotency_mismatch"]), .rejected(code: "idempotency_mismatch"))
        XCTAssertEqual(map(428, ["code": "revision_required"]), .rejected(code: "revision_required"))
        XCTAssertEqual(map(429, nil), .unavailable)
        XCTAssertEqual(map(503, ["code": "feature_disabled"]), .unavailable)
        XCTAssertEqual(map(400, ["error": "English text", "code": "invalid_request"]), .rejected(code: "invalid_request"))
        for error in [BriefingsError.signedOut, .subscriptionRequired, .notFound, .conflict(revision: 1), .consentRequired, .unavailable, .rejected(code: "x")] {
            XCTAssertFalse(error.message.isEmpty)
            XCTAssertFalse(error.message.contains("English text"))
        }
    }

    func testPatchSendsIfMatchAndReadsTheETag() async throws {
        var seen: (path: String, method: String, headers: [String: String])?
        let transport = BriefingsTransport(json: { path, method, _, headers, _ in
            seen = (path, method, headers)
            return BriefingsReply(json: ["openingEnabled": true, "eligiblePro": true], status: 200, headers: ["etag": "W/\"12\""])
        }, bytes: { _ in .unavailable })
        let snapshot = try await BriefingsAPI(transport: transport, auth: .none).patchSettings(revision: 11, changes: ["openingEnabled": true])
        XCTAssertEqual(seen?.path, "api/briefing-settings")
        XCTAssertEqual(seen?.method, "PATCH")
        XCTAssertEqual(seen?.headers["If-Match"], "\"11\"")
        XCTAssertEqual(snapshot.settings.revision, 12)
        XCTAssertEqual(snapshot.eligiblePro, true)
        XCTAssertEqual(BriefingsAPI.etagRevision("\"4\""), 4)
        XCTAssertNil(BriefingsAPI.etagRevision("abc"))
    }

    func testTransportFailuresAndUnreadableBodiesAreUnavailableNotEmpty() async {
        let offline = BriefingsTransport(json: { _, _, _, _, _ in throw CancellationError() }, bytes: { _ in .unavailable })
        do {
            _ = try await BriefingsAPI(transport: offline, auth: .none).inbox()
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? BriefingsError, .unavailable)
        }
        let garbage = BriefingsTransport(json: { _, _, _, _, _ in BriefingsReply(json: ["nope": 1], status: 200, headers: [:]) },
                                         bytes: { _ in .unavailable })
        do {
            _ = try await BriefingsAPI(transport: garbage, auth: .none).inbox()
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? BriefingsError, .unavailable)
        }
    }

    func testInboxPathAndIdsAreValidatedAndEncoded() async {
        XCTAssertEqual(BriefingsAPI.inboxPath(cadence: .weekly, cursor: "a+b/c=", limit: 50),
                       "api/briefings?limit=20&cadence=weekly&cursor=a%2Bb%2Fc%3D")
        XCTAssertEqual(BriefingsAPI.inboxPath(cadence: nil, cursor: nil, limit: 0), "api/briefings?limit=1")
        var calls = 0
        let transport = BriefingsTransport(json: { _, _, _, _, _ in calls += 1; return BriefingsReply(json: nil, status: 500, headers: [:]) },
                                           bytes: { _ in calls += 1; return .unavailable })
        let api = BriefingsAPI(transport: transport, auth: .none)
        do { _ = try await api.report(id: "../briefing?id=x"); XCTFail() } catch { XCTAssertEqual(error as? BriefingsError, .notFound) }
        let audio = await api.audio(id: "not-a-uuid")
        XCTAssertEqual(audio, .notFound)
        XCTAssertEqual(calls, 0, "a malformed id never reaches the network")
    }

    func testVoiceRequestSendsNoTextAndParsesStates() async throws {
        var body: [String: Any] = [:]
        var headers: [String: String] = [:]
        let transport = BriefingsTransport(json: { _, _, b, h, _ in
            body = b ?? [:]; headers = h
            return BriefingsReply(json: ["state": "queued", "audioId": "9B2C1A7E-0D3F-4C55-8F1E-2A6B4C8D0E12", "retryAfterSeconds": 2],
                                  status: 202, headers: [:])
        }, bytes: { _ in .unavailable })
        let state = try await BriefingsAPI(transport: transport, auth: .none)
            .requestVoice(briefId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301", contentVersion: 1, segment: 0, voice: "coral",
                          language: "es", idempotencyKey: "k-1")
        XCTAssertEqual(state, BriefingVoiceState(state: .queued, audioId: "9b2c1a7e-0d3f-4c55-8f1e-2a6b4c8d0e12", retryAfterSeconds: 2))
        XCTAssertEqual(Set(body.keys), ["briefId", "contentVersion", "segmentIndex", "voice", "language"])
        XCTAssertEqual(headers[BriefingsAPI.idempotencyHeader], "k-1")
    }

    func testAudioOutcomes() {
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data([1, 2, 3]), 200)), .ready(Data([1, 2, 3])))
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data(#"{"state":"processing","retryAfterSeconds":3}"#.utf8), 202)), .pending(retryAfter: 3))
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data(), 202)), .pending(retryAfter: 2))
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data(), 404)), .notFound)
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data(), 403)), .forbidden)
        XCTAssertEqual(BriefingsAPI.audio(.signedOut), .forbidden)
        XCTAssertEqual(BriefingsAPI.audio(.unavailable), .unavailable)
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data(), 503)), .unavailable)
        XCTAssertEqual(BriefingsAPI.audio(.answered(Data(), 200)), .unavailable)
    }

    func testReportParsingIsLenientAndBounded() throws {
        let long = String(repeating: "a", count: 801)
        let json: [String: Any] = [
            "id": "3F2504E0-4F89-41D3-9A0C-0305E82C3301", "cadence": "morning", "contentVersion": 1,
            "periodStart": "2026-10-01T12:00:00Z", "periodEnd": "2026-10-02T12:00:00.000Z", "scheduledAt": "2026-10-02T12:00:00Z",
            "dataAsOf": "2026-10-02T11:58:00Z", "calendarVersion": "nyse-2026-2027-v1", "quality": "partial",
            "title": "T", "opening": "O",
            "sections": [["kind": "market", "title": "M", "body": "B", "asOf": "2026-10-02T11:58:00Z", "status": "live",
                          "facts": [["label": "BTC", "value": "$1"], ["label": "", "value": "x"]]],
                         ["kind": "asset", "symbol": "NVDA", "title": "N", "body": "B", "status": "closed", "explainer": "E"],
                         ["kind": "invented", "title": "X", "body": "Y"]],
            "narrationSegments": ["one", long, "three", "four", "five", "six"],
            "sources": [["name": "okx", "ok": true, "freshness": "live"]],
            "equitySession": ["date": "2026-10-02", "state": "pre_market", "earlyClose": false],
            "voice": "coral", "language": "es",
        ]
        let report = try XCTUnwrap(BriefingReport(json: json))
        XCTAssertEqual(report.id, "3f2504e0-4f89-41d3-9a0c-0305e82c3301")
        XCTAssertEqual(report.sections.map(\.kind), ["market", "asset"], "unknown section kinds are dropped")
        XCTAssertEqual(report.sections[0].facts, [BriefingFact(label: "BTC", value: "$1")])
        XCTAssertEqual(report.sections[1].symbol, "NVDA")
        XCTAssertEqual(report.sections[1].explainer, "E")
        XCTAssertEqual(report.narrationSegments, ["one", "three", "four", "five"], "over-long segments are dropped, at most four")
        XCTAssertEqual(report.equitySession?.state, "pre_market")
        XCTAssertNotNil(report.periodEnd)
        XCTAssertEqual(report.language, "es")
        XCTAssertNil(BriefingReport(json: ["id": "x", "cadence": "morning", "contentVersion": 1]))
        XCTAssertNil(BriefingReport(json: ["id": "3f2504e0-4f89-41d3-9a0c-0305e82c3301", "cadence": "hourly", "contentVersion": 1]))
    }

    func testSettingsParsingNeverReadsAMissingFieldAsPro() throws {
        let bare = try XCTUnwrap(BriefingSettingsSnapshot(json: ["revision": 0, "openingEnabled": 1, "language": "fr"]))
        XCTAssertNil(bare.eligiblePro)
        XCTAssertFalse(bare.settings.openingEnabled, "a number is not a boolean")
        XCTAssertEqual(bare.settings.language, "en")
        XCTAssertNil(BriefingSettingsSnapshot(json: ["openingEnabled": true]), "no revision, nothing safe to save against")
        let full = snapshot(revision: 3)
        XCTAssertEqual(full.schedules?.opening?.configured, true)
        XCTAssertEqual(full.schedules?.opening?.localTime, "08:00")
        XCTAssertNotNil(full.schedules?.opening?.nextAt)
        XCTAssertEqual(full.schedules?.close?.configured, false, "close/weekly stay 'schedule pending' until adopted")
        XCTAssertEqual(full.schedules?.weekly?.weekday, "Sunday")
        XCTAssertEqual(full.options?.companions, ["orb", "kora"])
        XCTAssertEqual(full.options?.audioConsentVersion, 1)
        let objects = BriefingOptions(json: ["companions": [["id": "orb", "voice": "ash"], "kora", 3]])
        XCTAssertEqual(objects?.companions, ["orb", "kora"])
    }
}
