import XCTest
@testable import Bobby

/// Account consent and OS permission are separate; no test uses APNs, Keychain or the network.
@MainActor
final class NewsPushTests: XCTestCase {
    private var user: String? = "a"
    private var generation = UUID()
    private var risk = true
    private var language = (language: "de", locale: "de-DE")
    private var status: PushPermission = .authorized
    private var trace: [String] = []
    private var calls: [(revision: Int, changes: [String: Any])] = []
    private var server: NewsPushSettings!

    override func setUp() async throws {
        user = "a"; generation = UUID(); risk = true; language = ("de", "de-DE")
        status = .authorized; trace = []; calls = []
        server = settings(revision: 0, enabled: false)
    }

    private func settings(revision: Int, enabled: Bool, language: String = "de", locale: String = "de-DE") -> NewsPushSettings {
        NewsPushSettings(revision: revision, newsEnabled: enabled, language: language, locale: locale,
                         consentVersion: enabled ? 1 : nil)
    }

    private func center() -> NewsPushCenter {
        let c = NewsPushCenter(observeAccount: false)
        c.auth = .none
        c.currentUser = { [unowned self] in self.user }
        c.currentGeneration = { [unowned self] in self.generation }
        c.riskAccepted = { [unowned self] in self.risk }
        c.appLanguage = { [unowned self] in self.language }
        c.load = { [unowned self] _ in self.trace.append("load"); return self.server }
        c.save = { [unowned self] _, revision, changes in
            self.trace.append("save")
            self.calls.append((revision, changes))
            let enabled = changes["newsEnabled"] as? Bool ?? self.server.newsEnabled
            let language = changes["language"] as? String ?? self.server.language
            let locale = changes["locale"] as? String ?? self.server.locale
            self.server = NewsPushSettings(revision: revision + 1, newsEnabled: enabled, language: language, locale: locale,
                                           consentVersion: changes["acceptedConsentVersion"] as? Int ?? self.server.consentVersion)
            return self.server
        }
        c.permissionStatus = { [unowned self] in self.trace.append("permission"); return self.status }
        c.requestPermission = { [unowned self] in self.trace.append("prompt"); return self.status }
        c.deliveryEnabled = { [unowned self] in self.trace.append("register") }
        return c
    }

    func testStartsOffAndSignedOutOrUnacceptedRiskDoesNothing() async {
        let c = center()
        XCTAssertFalse(c.isOn)
        user = nil
        let signedOutRefresh = await c.refresh(), signedOutEnable = await c.setEnabled(true)
        XCTAssertFalse(signedOutRefresh); XCTAssertFalse(signedOutEnable); XCTAssertTrue(trace.isEmpty)
        user = "a"; risk = false
        let rejectedRefresh = await c.refresh(), rejectedEnable = await c.setEnabled(true)
        XCTAssertFalse(rejectedRefresh); XCTAssertFalse(rejectedEnable); XCTAssertTrue(trace.isEmpty)
    }

    func testExplicitEnableSavesCurrentConsentAndLanguageBeforeOSPrompt() async throws {
        let c = center()
        status = .notDetermined
        c.requestPermission = { [unowned self] in self.trace.append("prompt"); return .authorized }
        let success = await c.setEnabled(true)
        XCTAssertTrue(success)
        XCTAssertEqual(trace, ["load", "save", "permission", "prompt", "register"])
        let call = try XCTUnwrap(calls.first)
        XCTAssertEqual(call.revision, 0)
        XCTAssertEqual(call.changes["newsEnabled"] as? Bool, true)
        XCTAssertEqual(call.changes["acceptedConsentVersion"] as? Int, 1)
        XCTAssertEqual(call.changes["language"] as? String, "de")
        XCTAssertEqual(call.changes["locale"] as? String, "de-DE")
        XCTAssertTrue(c.settings?.hasCurrentConsent == true)
    }

    func testServerFailureNeverPromptsOrRegisters() async {
        let c = center()
        status = .notDetermined
        c.save = { _, _, _ in throw BriefingsError.unavailable }
        let success = await c.setEnabled(true)
        XCTAssertFalse(success); XCTAssertFalse(c.isOn); XCTAssertNil(c.pendingEnabled)
        XCTAssertEqual(c.lastError, .unavailable)
        XCTAssertEqual(trace, ["load"])
    }

    func testDeniedOSPermissionKeepsExplicitConsentButCannotRegister() async {
        let c = center(); status = .denied
        let success = await c.setEnabled(true)
        XCTAssertTrue(success); XCTAssertTrue(c.isOn); XCTAssertTrue(c.deliveryBlocked)
        XCTAssertEqual(trace, ["load", "save", "permission"])
    }

    func testOptOutSavesOnlyOffAndNeverAsksOSOrRevokesWeeklyChoice() async throws {
        let c = center(); server = settings(revision: 8, enabled: true)
        _ = await c.refresh(); trace = []
        let success = await c.setEnabled(false)
        XCTAssertTrue(success); XCTAssertFalse(c.isOn)
        XCTAssertEqual(trace, ["save"])
        let call = try XCTUnwrap(calls.first)
        XCTAssertEqual(call.revision, 8); XCTAssertEqual(call.changes.count, 1)
        XCTAssertEqual(call.changes["newsEnabled"] as? Bool, false)
        XCTAssertNil(call.changes["weeklyEnabled"])
    }

    func testConflictRefetchesWithoutRepeatingConsentOrPrompt() async {
        let c = center(); var attempts = 0
        c.save = { [unowned self] _, _, _ in
            attempts += 1; self.server = self.settings(revision: 4, enabled: false)
            throw BriefingsError.conflict(revision: 4)
        }
        let success = await c.setEnabled(true)
        XCTAssertFalse(success); XCTAssertEqual(attempts, 1); XCTAssertEqual(c.settings?.revision, 4)
        XCTAssertEqual(trace, ["load", "load"])
        XCTAssertFalse(c.isOn); XCTAssertEqual(c.lastError, .conflict(revision: 4))
    }

    func testAccountSwitchDropsALateConsentReceiptAndCannotRegisterB() async {
        let c = center()
        c.save = { [unowned self, weak c] _, _, _ in
            self.user = "b"; self.generation = UUID(); c?.accountChanged()
            return self.settings(revision: 1, enabled: true)
        }
        let success = await c.setEnabled(true)
        XCTAssertFalse(success); XCTAssertNil(c.settings); XCTAssertNil(c.pendingEnabled)
        XCTAssertFalse(trace.contains("permission")); XCTAssertFalse(trace.contains("register"))
    }

    func testAccountSwitchDuringOSPromptCannotRegisterB() async {
        let c = center(); status = .notDetermined
        c.requestPermission = { [unowned self, weak c] in
            self.user = "b"; self.generation = UUID(); c?.accountChanged(); return .authorized
        }
        let success = await c.setEnabled(true)
        XCTAssertFalse(success); XCTAssertNil(c.settings); XCTAssertFalse(trace.contains("register"))
    }

    func testLogoutClearsAccountChoiceAndError() async {
        let c = center(); _ = await c.setEnabled(true)
        user = nil; generation = UUID(); c.accountChanged()
        XCTAssertNil(c.settings); XCTAssertFalse(c.isOn); XCTAssertNil(c.lastError)
        XCTAssertEqual(c.permission, .notDetermined)
    }

    func testLanguageChangePreservesOptInAndBrazilianLocale() async throws {
        let c = center(); _ = await c.setEnabled(true); calls = []; trace = []
        language = ("pt", "pt-BR")
        let success = await c.syncLanguage()
        XCTAssertTrue(success); XCTAssertTrue(c.isOn)
        let call = try XCTUnwrap(calls.first)
        XCTAssertEqual(call.changes["language"] as? String, "pt")
        XCTAssertEqual(call.changes["locale"] as? String, "pt-BR")
        XCTAssertNil(call.changes["newsEnabled"]); XCTAssertNil(call.changes["acceptedConsentVersion"])
        XCTAssertEqual(trace, ["save"])
    }

    func testForegroundReadNeverPromptsAndMissingConsentStaysOff() async {
        let c = center(); status = .notDetermined
        let off = await c.confirmedEnabled()
        XCTAssertFalse(off); XCTAssertEqual(trace, ["load"])
        server = settings(revision: 1, enabled: true); trace = []
        let on = await c.confirmedEnabled()
        XCTAssertTrue(on); XCTAssertEqual(trace, ["load"])
    }

    func testExplicitPermissionRecoveryReadsConsentFirstAndCannotReviveAnOptOut() async {
        let c = center(); server = settings(revision: 1, enabled: true); status = .notDetermined
        c.requestPermission = { [unowned self] in self.trace.append("prompt"); return .authorized }
        let allowed = await c.authorizeDelivery()
        XCTAssertTrue(allowed); XCTAssertEqual(trace, ["load", "permission", "prompt", "register"])
        server = settings(revision: 2, enabled: false); trace = []
        let optedOut = await c.authorizeDelivery()
        XCTAssertFalse(optedOut); XCTAssertEqual(trace, ["load"])
    }

    func testHTTPContractUsesQuotedRevisionAndMalformedDataIsFailure() async throws {
        var seen: [(String, String, [String: String])] = []
        let response: [String: Any] = ["revision": 3, "newsEnabled": true, "language": "pt", "locale": "pt-BR",
                                      "consentVersion": 1, "options": ["consentVersion": 1], "deliveryAvailable": true]
        let transport = BriefingsTransport(json: { path, method, _, headers, _ in
            seen.append((path, method, headers)); return BriefingsReply(json: response, status: 200, headers: [:])
        }, bytes: { _ in .unavailable })
        let api = NewsPushAPI(transport: transport, auth: .none)
        let loaded = try await api.settings(), saved = try await api.patch(revision: 2, changes: ["newsEnabled": true])
        XCTAssertEqual(loaded, saved); XCTAssertEqual(saved.locale, "pt-BR")
        XCTAssertEqual(seen[0].0, "api/push-news?op=settings"); XCTAssertEqual(seen[0].1, "GET")
        XCTAssertEqual(seen[1].1, "PATCH"); XCTAssertEqual(seen[1].2["If-Match"], "\"2\"")
        XCTAssertNil(NewsPushSettings(json: ["newsEnabled": false]))
        var wrongLocale = response; wrongLocale["locale"] = "de-DE"
        XCTAssertNil(NewsPushSettings(json: wrongLocale))
    }

    func testNewsPayloadIsValidatedAndConsumedOnceWithoutChangingLanguage() {
        let intent = NewsPushIntent(observeAccount: false), selection = L.selection
        XCTAssertTrue(intent.store(["newsCampaignId": "test-1234", "language": "pt-BR", "screen": "language"]))
        XCTAssertEqual(intent.take(), NewsPushTap(campaignId: "test-1234", language: "pt-BR"))
        XCTAssertNil(intent.take()); XCTAssertEqual(L.selection, selection)
        let malformed: [[AnyHashable: Any]] = [
            ["newsCampaignId": "../secrets", "language": "de", "screen": "language"],
            ["newsCampaignId": "valid-id", "language": "zz", "screen": "language"],
            ["newsCampaignId": "valid-id", "language": "fr", "screen": "https://example.com"],
            ["newsCampaignId": String(repeating: "a", count: 81), "language": "de", "screen": "language"],
            ["aps": ["newsCampaignId": "valid-id", "language": "de", "screen": "language"]]
        ]
        for payload in malformed { XCTAssertNil(NewsPushIntent.tap(from: payload)) }
        XCTAssertFalse(NucleoRoute.openable.contains("languageSettings"))
    }

    func testNewsConsentCopyExistsForEverySupportedLanguageAndBrazilianPortuguese() {
        for language in AppLanguage.allCases {
            for key in [NewsPushCopy.Key.title, .consent, .signedOut, .unavailable, .failed] {
                let text = NewsPushCopy.text(key, language: language.rawValue)
                XCTAssertFalse(text.isEmpty)
                if language != .en { XCTAssertNotEqual(text, NewsPushCopy.text(key, language: "en")) }
            }
        }
        XCTAssertNotEqual(NewsPushCopy.text(.consent, language: "pt", locale: "pt-BR"), NewsPushCopy.text(.consent, language: "pt", locale: "pt-PT"))
    }
}
