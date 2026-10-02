import Foundation
import XCTest
@testable import Bobby

/// Build 53 briefing experience: notification-tap routing through the Núcleo (drained once, only when the
/// page, account, consent and every busy surface allow it), the settings screen's state mapping, the
/// memory screen's account isolation and confirmed delete, and the report screen's error mapping.
/// No request leaves the process: every network edge is an injected closure (or the Núcleo fixtures).
@MainActor
final class BriefingsExperienceTests: XCTestCase {
    private final class Recorder: NucleoEmitting {
        var events: [(name: String, payload: [String: Any])] = []
        func emit(_ name: String, _ payload: [String: Any]) { events.append((name, payload)) }
        func pageReady() {}
        func sheetStates(_ route: String) -> [String] {
            events.filter { $0.name == "native.sheet" && $0.payload["route"] as? String == route }
                .compactMap { $0.payload["state"] as? String }
        }
    }

    private static let profileKeys = ["agent.riskNoticeVersion", "agent.onboarded", "agent.voice", "agent.auraText"]
    private nonisolated static let briefA = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b"
    private nonisolated static let briefB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"

    private var suiteName = ""
    private var defaults: UserDefaults!
    private var saved: [String: Any] = [:]

    // The live gate, flipped by each test.
    private var active = true
    private var signedIn = true
    private var deskBusy = false
    private var listening = false
    private var narrating = false

    override func setUp() async throws {
        try await super.setUp()
        suiteName = "briefings.experience.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
        saved = [:]
        for key in Self.profileKeys { if let v = UserDefaults.standard.object(forKey: key) { saved[key] = v } }
        NucleoFixtures.activate(scenario: "default", timeScale: 0.01)
        active = true; signedIn = true; deskBusy = false; listening = false; narrating = false
    }

    override func tearDown() async throws {
        NucleoFixtures.deactivate()
        for key in Self.profileKeys {
            if let v = saved[key] { UserDefaults.standard.set(v, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
        }
        defaults.removePersistentDomain(forName: suiteName)
        try await super.tearDown()
    }

    // MARK: - Helpers

    private func make(riskAccepted: Bool = true, onboarded: Bool = true) -> (NucleoSession, NucleoBridge, Recorder, BriefingIntent) {
        let profile = AgentProfile()
        profile.riskNoticeVersion = riskAccepted ? RiskNotice.currentVersion : 0
        let intent = BriefingIntent(observeAccount: false)
        let session = NucleoSession(fixtures: true, profile: profile, companions: CompanionStore(defaults: defaults),
                                    ledger: NucleoLedger(defaults: defaults), defaults: defaults, briefingIntent: intent)
        profile.onboarded = onboarded
        session.companions.companionId = onboarded ? "orb" : nil
        session.briefingSheetDelay = 0
        session.briefingGate = BriefingTapGate(
            appActive: { [unowned self] in self.active },
            signedIn: { [unowned self] in self.signedIn },
            deskBusy: { [unowned self] in self.deskBusy },
            listening: { [unowned self] in self.listening },
            narrating: { [unowned self] in self.narrating })
        let recorder = Recorder()
        session.emitter = recorder
        return (session, NucleoBridge(session: session), recorder, intent)
    }

    private func call(_ bridge: NucleoBridge, _ method: String, _ params: [String: Any] = [:]) async {
        let (_, error) = await bridge.handle(body: ["v": 1, "method": method, "params": params], trusted: true)
        XCTAssertNil(error, "\(method) envelope refused")
    }

    /// Lets every scheduled `DispatchQueue.main.async` drain run.
    private func settle() async {
        for _ in 0..<4 { await withCheckedContinuation { c in DispatchQueue.main.async { c.resume() } } }
    }

    private func startApp(_ bridge: NucleoBridge) async {
        await call(bridge, "session", ["page": "app"])
        await settle()
    }

    private func assertOpened(_ session: NucleoSession, _ id: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual(session.sheet, .briefing, file: file, line: line)
        XCTAssertEqual(session.selectedBriefId, id, file: file, line: line)
    }

    private func assertClosed(_ session: NucleoSession, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertNil(session.sheet, file: file, line: line)
        XCTAssertNil(session.selectedBriefId, file: file, line: line)
    }

    // MARK: - Tap routing

    func testBriefingIsNeverOpenableFromThePage() {
        XCTAssertFalse(NucleoRoute.openable.contains(NucleoRoute.briefing.rawValue))
        XCTAssertFalse(NucleoRoute.openable.contains(NucleoRoute.paywall.rawValue))
        XCTAssertTrue(NucleoRoute.openable.contains(NucleoRoute.account.rawValue))
    }

    func testColdTapWaitsForPageStartedThenOpensOnce() async {
        let (session, bridge, recorder, intent) = make()
        XCTAssertTrue(intent.store(Self.briefA))
        await settle()
        assertClosed(session)
        XCTAssertEqual(intent.pending, Self.briefA, "before pageStarted the tap stays stored")
        session.appBecameActive()
        await settle()
        assertClosed(session)
        await startApp(bridge)
        assertOpened(session, Self.briefA)
        XCTAssertNil(intent.pending, "consumed")
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open"])
    }

    func testWarmIdleTapOpensRightAway() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        XCTAssertTrue(intent.store(Self.briefB))
        await settle()
        assertOpened(session, Self.briefB)
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open"])
    }

    func testBusyDeskDefersUntilAPageCallEnds() async {
        let (session, bridge, _, intent) = make()
        await startApp(bridge)
        deskBusy = true
        intent.store(Self.briefA)
        await settle()
        assertClosed(session)
        deskBusy = false
        await call(bridge, "cancel")
        await settle()
        assertOpened(session, Self.briefA)
    }

    func testOpenMicDefersUntilItStops() async {
        let (session, bridge, _, intent) = make()
        await startApp(bridge)
        listening = true
        intent.store(Self.briefA)
        session.appBecameActive()
        await settle()
        assertClosed(session)
        listening = false
        session.speech.emit("speech.state", ["state": "stopped"])
        await settle()
        assertOpened(session, Self.briefA)
    }

    func testNarrationDefersUntilIdle() async {
        let (session, bridge, _, intent) = make()
        await startApp(bridge)
        narrating = true
        intent.store(Self.briefA)
        await settle()
        assertClosed(session)
        narrating = false
        session.appBecameActive()
        await settle()
        assertOpened(session, Self.briefA)
    }

    func testOpenSheetDefersUntilItCloses() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        XCTAssertTrue(session.openNative(.account))
        intent.store(Self.briefA)
        await settle()
        XCTAssertEqual(session.sheet, .account)
        XCTAssertNil(session.selectedBriefId)
        session.sheetDismissed()
        await settle()
        assertOpened(session, Self.briefA)
        XCTAssertEqual(recorder.sheetStates("account"), ["open", "closed"])
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open"])
    }

    func testInactiveAppDefers() async {
        let (session, bridge, _, intent) = make()
        await startApp(bridge)
        active = false
        intent.store(Self.briefA)
        await settle()
        assertClosed(session)
        active = true
        session.appBecameActive()
        await settle()
        assertOpened(session, Self.briefA)
    }

    func testSignedOutTapNeverOpensButWaitsForTheSignIn() async {
        let (session, bridge, recorder, intent) = make()
        signedIn = false
        await startApp(bridge)
        intent.store(Self.briefA)
        await settle()
        assertClosed(session)
        XCTAssertNil(intent.pending, "held by the session: the intent clears itself on the sign-in")
        session.appBecameActive()
        await settle()
        assertClosed(session)
        XCTAssertTrue(recorder.sheetStates("briefing").isEmpty)
        signedIn = true
        session.appBecameActive()
        await settle()
        assertOpened(session, Self.briefA)
    }

    func testRiskNoticeAndOnboardingGateTheTap() async {
        let (session, bridge, _, intent) = make(riskAccepted: false)
        await startApp(bridge)
        intent.store(Self.briefA)
        await settle()
        assertClosed(session)
        XCTAssertEqual(intent.pending, Self.briefA, "R11: kept, not opened")

        let (other, otherBridge, _, otherIntent) = make(onboarded: false)
        await call(otherBridge, "session", ["page": "onboarding"])
        otherIntent.store(Self.briefB)
        await settle()
        assertClosed(other)
    }

    func testConsumedOnceNotReplayedOnLaterForegrounds() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        intent.store(Self.briefA)
        await settle()
        assertOpened(session, Self.briefA)
        session.sheetDismissed()
        await settle()
        assertClosed(session)
        session.appBecameActive()
        await startApp(bridge)
        session.appBecameActive()
        await settle()
        assertClosed(session)
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open", "closed"])
    }

    func testMalformedTapIsIgnored() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        XCTAssertFalse(intent.store("not-a-uuid"))
        XCTAssertFalse(intent.store(42))
        XCTAssertFalse(intent.store(nil))
        await settle()
        session.appBecameActive()
        await settle()
        assertClosed(session)
        XCTAssertTrue(recorder.sheetStates("briefing").isEmpty)
    }

    func testSheetLifecycleEmitsOpenAndClosedOnce() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        intent.store(Self.briefA)
        await settle()
        XCTAssertFalse(session.openNative(.squad), "one sheet at a time")
        XCTAssertFalse(session.drainBriefingIntent())
        session.sheetDismissed()
        session.sheetDismissed()
        await settle()
        assertClosed(session)
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open", "closed"])
    }

    func testTheReportAlreadyOnScreenIsNotOpenedAgain() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        intent.markOpen(Self.briefA)
        intent.store(Self.briefA)
        await settle()
        assertClosed(session)
        XCTAssertNil(intent.pending)
        XCTAssertTrue(recorder.sheetStates("briefing").isEmpty)
    }

    func testOpeningStopsTheMicAndTheVoiceFirst() async {
        let (session, bridge, _, intent) = make()
        await startApp(bridge)
        intent.store(Self.briefA)
        XCTAssertTrue(session.drainBriefingIntent())
        XCTAssertFalse(session.speech.isListening)
        XCTAssertFalse(session.nucleoVoice.isActive)
    }

    func testWithdrawingConsentClosesTheReportOnce() async {
        let (session, bridge, recorder, intent) = make()
        await startApp(bridge)
        intent.store(Self.briefA)
        await settle()
        assertOpened(session, Self.briefA)
        session.revokeRiskNoticeConsent()
        await settle()
        assertClosed(session)
        XCTAssertEqual(recorder.sheetStates("briefing"), ["open", "closed"])
        intent.store(Self.briefB)
        await settle()
        assertClosed(session)
    }

    // MARK: - Settings screen mapping

    private func schedules(close: Bool = false) -> BriefingSchedules {
        BriefingSchedules(json: [
            "timezone": "America/New_York",
            "opening": ["configured": true, "localTime": "08:00", "nextAt": "2026-10-05T12:00:00.000Z"],
            "close": ["configured": close, "delayMinutes": 15, "nextAt": close ? "2026-10-05T20:15:00.000Z" : NSNull()],
            "weekly": ["configured": false, "weekday": "Sunday", "localTime": "18:00", "nextAt": NSNull()],
        ])!
    }

    func testProAccountCanTurnAdoptedSchedulesOnOnly() {
        let p = BriefingSettingsPresentation.make(settings: BriefingSettings(revision: 1), eligiblePro: true,
                                                  schedules: schedules(), pending: [:], permission: .authorized)
        XCTAssertFalse(p.showsPro)
        XCTAssertFalse(p.blocked)
        XCTAssertEqual(p.rows.map(\.cadence), [.morning, .close, .weekly])
        XCTAssertEqual(p.rows.map(\.interactive), [true, false, false], "close/weekly are pending schedules")
        XCTAssertEqual(p.rows.map(\.configured), [true, false, false])
    }

    func testNonProCanOnlyTurnSwitchesOff() {
        let settings = BriefingSettings(revision: 3, openingEnabled: true, closeEnabled: false)
        let p = BriefingSettingsPresentation.make(settings: settings, eligiblePro: false,
                                                  schedules: schedules(close: true), pending: [:], permission: .authorized)
        XCTAssertTrue(p.showsPro)
        XCTAssertEqual(p.rows.map(\.isOn), [true, false, false])
        XCTAssertEqual(p.rows.map(\.interactive), [true, false, false], "on → can turn off; off → cannot turn on")
        let unknown = BriefingSettingsPresentation.make(settings: settings, eligiblePro: nil,
                                                        schedules: schedules(close: true), pending: [:], permission: .authorized)
        XCTAssertFalse(unknown.showsPro, "unknown is not a refusal")
        XCTAssertFalse(unknown.rows[1].interactive, "unknown is never read as Pro")
    }

    func testPendingSwitchShowsItsTargetAndLocks() {
        let p = BriefingSettingsPresentation.make(settings: BriefingSettings(revision: 1), eligiblePro: true,
                                                  schedules: schedules(), pending: [.morning: true], permission: .authorized)
        XCTAssertTrue(p.rows[0].isOn)
        XCTAssertTrue(p.rows[0].saving)
        XCTAssertFalse(p.rows[0].interactive)
        let off = BriefingSettingsPresentation.make(settings: BriefingSettings(revision: 1, openingEnabled: true), eligiblePro: true,
                                                    schedules: schedules(), pending: [.morning: false], permission: .authorized)
        XCTAssertFalse(off.rows[0].isOn)
    }

    func testBlockedOnlyWhenDeniedAndAConfirmedSwitchIsOn() {
        let on = BriefingSettings(revision: 1, openingEnabled: true)
        XCTAssertTrue(BriefingSettingsPresentation.make(settings: on, eligiblePro: true, schedules: schedules(),
                                                        pending: [:], permission: .denied).blocked)
        XCTAssertFalse(BriefingSettingsPresentation.make(settings: on, eligiblePro: true, schedules: schedules(),
                                                         pending: [:], permission: .authorized).blocked)
        XCTAssertFalse(BriefingSettingsPresentation.make(settings: BriefingSettings(revision: 1), eligiblePro: true,
                                                         schedules: schedules(), pending: [:], permission: .denied).blocked)
        XCTAssertFalse(BriefingSettingsPresentation.make(settings: nil, eligiblePro: nil, schedules: nil,
                                                         pending: [:], permission: .denied).blocked)
    }

    func testNothingIsInteractiveBeforeTheSettingsAreRead() {
        let p = BriefingSettingsPresentation.make(settings: nil, eligiblePro: nil, schedules: nil, pending: [:], permission: .authorized)
        XCTAssertTrue(p.rows.allSatisfy { !$0.interactive && !$0.isOn })
        XCTAssertFalse(p.showsPro)
    }

    func testScheduleCopyInNewYorkTimeWithTheLocalEquivalent() {
        let s = schedules(close: true)
        let ny = BriefingFormat.newYork
        let mexico = TimeZone(identifier: "America/Mexico_City")!
        let pending = BriefingFormat.schedule(.weekly, s.weekly, spanish: true, zone: ny)
        XCTAssertEqual(pending, "Horario en revisión")
        XCTAssertEqual(BriefingFormat.schedule(.weekly, nil, spanish: false, zone: ny), "Schedule pending")
        let morningNY = BriefingFormat.schedule(.morning, s.opening, spanish: false, zone: ny)
        XCTAssertEqual(morningNY, "Every day · 08:00 New York", "no 'your time' when the phone is in New York")
        let morningMX = BriefingFormat.schedule(.morning, s.opening, spanish: true, zone: mexico)
        XCTAssertTrue(morningMX.hasPrefix("Todos los días · 08:00 Nueva York · "))
        XCTAssertTrue(morningMX.hasSuffix("tu hora"))
        XCTAssertTrue(morningMX.contains("6:00"), morningMX)
        let close = BriefingFormat.schedule(.close, s.close, spanish: false, zone: ny)
        XCTAssertTrue(close.hasPrefix("15 min after the US close (New York) · next "), close)
    }

    func testRowSummaryAndLatestNotices() throws {
        XCTAssertEqual(BriefingCopy.summary(nil, spanish: false), "Bobby Pro")
        XCTAssertEqual(BriefingCopy.summary(BriefingSettings(revision: 1, openingEnabled: true, weeklyEnabled: true), spanish: true),
                       "Apertura de mercado · Semanal")
        let unavailable = try XCTUnwrap(BriefingLatest(json: ["cadence": "morning", "state": "unavailable"]))
        XCTAssertEqual(BriefingCopy.latestNotice(unavailable, spanish: false), "Today’s briefing isn’t available")
        let ready = try XCTUnwrap(BriefingLatest(json: ["cadence": "weekly", "state": "ready"]))
        XCTAssertNil(BriefingCopy.latestNotice(ready, spanish: false))
        XCTAssertEqual(BriefingCopy.quality("facts_only", spanish: false), "Facts only")
        XCTAssertNil(BriefingCopy.quality("full", spanish: false))
        let holiday = BriefingEquitySession(json: ["state": "closed_holiday"])
        XCTAssertEqual(BriefingCopy.equitySession(holiday, spanish: false), "US market closed (holiday)")
        XCTAssertNil(BriefingCopy.status("live", spanish: false), "live data needs no badge")
    }

    // MARK: - Memory screen

    private var memoryUser: String? = "a"
    private var memoryGeneration = UUID()
    private var memoryCalls: [(path: String, method: String, body: [String: Any]?)] = []

    private func memoryJSON(_ symbols: [String] = ["NVDA", "BTC"], enabled: Bool = true) -> [String: Any] {
        ["enabled": enabled, "prefs": ["horizon": "week", "experience": NSNull(), "risk": "bogus"],
         "assets": symbols.map { ["symbol": $0, "asks": 3, "lastAskedAt": "2026-10-01T12:00:00.000Z", "lastHorizon": "week"] },
         "retentionDays": 90]
    }

    private func memoryCenter() -> MemoryCenter {
        memoryUser = "a"; memoryGeneration = UUID(); memoryCalls = []
        let c = MemoryCenter(observeAccount: false)
        c.currentUser = { [unowned self] in self.memoryUser }
        c.currentGeneration = { [unowned self] in self.memoryGeneration }
        c.riskAccepted = { true }
        c.send = { [unowned self] path, method, body in
            self.memoryCalls.append((path, method, body))
            return (self.memoryJSON(), 200)
        }
        c.accountChanged(force: true)
        return c
    }

    func testMemorySnapshotParsesLeniently() throws {
        let s = try XCTUnwrap(MemorySnapshot(json: memoryJSON(["NVDA", "bad symbol!", "BRK.B"])))
        XCTAssertEqual(s.horizon, "week")
        XCTAssertNil(s.experience)
        XCTAssertNil(s.risk, "an unknown enum value is dropped, never guessed")
        XCTAssertEqual(s.assets.map(\.symbol), ["NVDA", "BRK.B"])
        XCTAssertEqual(s.retentionDays, 90)
        XCTAssertNil(MemorySnapshot(json: ["prefs": [:]]), "without `enabled` nothing is known")
    }

    func testMemoryAccountSwitchDropsTheLateAnswerFromA() async {
        let c = memoryCenter()
        let started = expectation(description: "A's read is suspended")
        var pending: CheckedContinuation<(json: Any?, status: Int), Error>?
        c.send = { _, _, _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let result = Task { await c.refresh() }
        await fulfillment(of: [started], timeout: 3)
        memoryUser = "b"; memoryGeneration = UUID()
        c.accountChanged()
        XCTAssertNil(c.snapshot)
        pending?.resume(returning: (memoryJSON(["SOL"]), 200))
        let ok = await result.value
        XCTAssertFalse(ok)
        XCTAssertNil(c.snapshot, "A's memory never reaches B")
        XCTAssertFalse(c.loading)
    }

    func testMemoryShownForAIsClearedAtOnceForB() async {
        let c = memoryCenter()
        let ok = await c.refresh()
        XCTAssertTrue(ok)
        XCTAssertEqual(c.snapshot?.assets.map(\.symbol), ["NVDA", "BTC"])
        memoryUser = "b"; memoryGeneration = UUID()
        c.accountChanged()
        XCTAssertNil(c.snapshot)
        memoryUser = nil
        c.accountChanged()
        let signedOut = await c.refresh()
        XCTAssertFalse(signedOut)
        XCTAssertEqual(c.lastError, .signedOut)
        XCTAssertEqual(memoryCalls.count, 1, "signed out: no call")
    }

    func testDeleteEverythingNeedsItsConfirmation() async {
        let c = memoryCenter()
        await c.refresh()
        memoryCalls = []
        let unarmed = await c.confirmForgetAll()
        XCTAssertFalse(unarmed, "nothing is deleted without the confirmation step")
        c.requestForgetAll()
        XCTAssertTrue(c.confirmingForgetAll)
        c.cancelForgetAll()
        XCTAssertFalse(c.confirmingForgetAll)
        XCTAssertTrue(memoryCalls.isEmpty, "asking and cancelling send nothing")
        c.requestForgetAll()
        let deleted = await c.confirmForgetAll()
        XCTAssertTrue(deleted)
        XCTAssertEqual(memoryCalls.map(\.method), ["DELETE"])
        XCTAssertEqual(memoryCalls.first?.path, "api/memory", "no symbol = everything")
        XCTAssertFalse(c.confirmingForgetAll)
    }

    func testMemoryCorrectionsSendOnlyAllowedValues() async {
        let c = memoryCenter()
        await c.refresh()
        memoryCalls = []
        let bogus = await c.setPref(.risk, "extreme")
        XCTAssertFalse(bogus)
        XCTAssertTrue(memoryCalls.isEmpty)
        await c.setPref(.horizon, nil)
        XCTAssertEqual(memoryCalls.last?.method, "PATCH")
        XCTAssertTrue(memoryCalls.last?.body?["horizon"] is NSNull, "nil clears the preference")
        await c.setEnabled(false)
        XCTAssertEqual(memoryCalls.last?.body?["memoryEnabled"] as? Bool, false)
        await c.forget("BRK.B")
        XCTAssertEqual(memoryCalls.last?.path, "api/memory?symbol=BRK.B")
        await c.forget("^GSPC")
        XCTAssertEqual(memoryCalls.last?.path, "api/memory?symbol=%5EGSPC")
        let injected = await c.forget("NVDA&symbol=")
        XCTAssertFalse(injected)
    }

    func testMemoryFailuresUseTheAppsCopy() async {
        let c = memoryCenter()
        c.send = { _, _, _ in (["error": "Server English text"], 503) }
        let ok = await c.refresh()
        XCTAssertFalse(ok)
        XCTAssertEqual(c.lastError, .unavailable)
        c.send = { _, _, _ in (["error": "Sign in"], 401) }
        await c.refresh()
        XCTAssertEqual(c.lastError, .signedOut)
    }

    func testMemoryWaitsForTheRiskNotice() async {
        let c = memoryCenter()
        c.riskAccepted = { false }
        let ok = await c.refresh()
        XCTAssertFalse(ok)
        XCTAssertTrue(memoryCalls.isEmpty, "R11: no network before consent")
    }

    // MARK: - Report screen

    private func report(_ id: String) -> BriefingReport {
        BriefingReport(json: ["id": id, "cadence": "morning", "contentVersion": 1, "title": "T", "opening": "O",
                              "sections": [], "narrationSegments": [], "language": "en"])!
    }

    private var reportUser: String? = "a"
    private var reportGeneration = UUID()

    private func reportModel(_ id: String = BriefingsExperienceTests.briefA) -> BriefingReportModel {
        reportUser = "a"; reportGeneration = UUID()
        let m = BriefingReportModel(briefId: id, observeAccount: false)
        m.currentUser = { [unowned self] in self.reportUser }
        m.currentGeneration = { [unowned self] in self.reportGeneration }
        m.riskAccepted = { true }
        return m
    }

    func testReportErrorMapping() {
        XCTAssertEqual(BriefingReportModel.phase(for: BriefingsError.notFound), .notFound)
        XCTAssertEqual(BriefingReportModel.phase(for: BriefingsError.subscriptionRequired), .subscriptionRequired)
        XCTAssertEqual(BriefingReportModel.phase(for: BriefingsError.signedOut), .signedOut)
        XCTAssertEqual(BriefingReportModel.phase(for: BriefingsError.rejected(code: "forbidden")), .notFound,
                       "a refusal never says more than 'not available'")
        XCTAssertEqual(BriefingReportModel.phase(for: BriefingsError.unavailable), .unavailable)
        XCTAssertEqual(BriefingReportModel.phase(for: URLError(.notConnectedToInternet)), .unavailable)
    }

    func testReportLoadsAndMapsNotFoundAndForbidden() async {
        let m = reportModel()
        m.fetch = { [unowned self] id in self.report(id) }
        await m.load()
        XCTAssertEqual(m.phase, .loaded(report(Self.briefA)))
        m.fetch = { _ in throw BriefingsError.notFound }
        await m.load()
        XCTAssertEqual(m.phase, .notFound)
        m.fetch = { _ in throw BriefingsError.subscriptionRequired }
        await m.load()
        XCTAssertEqual(m.phase, .subscriptionRequired)
        m.fetch = { [unowned self] _ in self.report(Self.briefB) }
        await m.load()
        XCTAssertEqual(m.phase, .unavailable, "a body for another id is never shown")
    }

    func testReportLateAnswerAfterAccountSwitchIsDropped() async {
        let m = reportModel()
        let started = expectation(description: "A's report read is suspended")
        var pending: CheckedContinuation<BriefingReport, Error>?
        m.fetch = { _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let load = Task { await m.load() }
        await fulfillment(of: [started], timeout: 3)
        reportUser = "b"; reportGeneration = UUID()
        pending?.resume(returning: report(Self.briefA))
        await load.value
        XCTAssertEqual(m.phase, .loading, "A's report never reaches B")
    }

    func testReportNeedsAnAccountAndTheRiskNotice() async {
        let m = reportModel()
        var fetches = 0
        m.fetch = { [unowned self] id in fetches += 1; return self.report(id) }
        reportUser = nil
        await m.load()
        XCTAssertEqual(m.phase, .signedOut)
        reportUser = "a"
        m.riskAccepted = { false }
        await m.load()
        XCTAssertEqual(m.phase, .unavailable)
        XCTAssertEqual(fetches, 0, "no network signed out or before consent")
    }

    func testPlaybackDefaultIsSilentAndHidden() {
        let playback = BriefingPlaybackFactory.make()
        XCTAssertEqual(playback.state, .unavailable)
        playback.play(report: report(Self.briefA))
        XCTAssertEqual(playback.state, .unavailable)
        XCTAssertNil(playback.currentSegment)
    }
}
