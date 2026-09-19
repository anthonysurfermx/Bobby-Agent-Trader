import AuthenticationServices
import XCTest
@testable import Bobby

/// Build 34 (review of build 33): Apple-only sign-in in Release, the account client contract,
/// tokens that expire mid-operation, the server's length rule and quota codes, and no typed
/// question in a URL. Every request is answered in-process; nothing reaches production.
final class Build34Tests: XCTestCase {
    private let service = "xyz.bobbyprotocol.bobby.session"

    override func setUp() {
        super.setUp()
        Keychain.delete(service: service)
        B34Stub.install { _ in .fail }
        URLProtocol.registerClass(B34Stub.self)
    }

    override func tearDown() {
        URLProtocol.unregisterClass(B34Stub.self)
        B34Stub.install(nil)
        Keychain.delete(service: service)
        super.tearDown()
    }

    @MainActor private func signedIn(_ user: String = "b34-user", token: String = "tok-old",
                                     apple: String? = "001.apple", provider: String? = "apple") -> AccountSession {
        Keychain.write(StoredSession(accessToken: token, refreshToken: "ref-\(user)", expiresAt: Date().addingTimeInterval(3600),
                                     userId: user, appleUserId: apple, provider: provider), service: service)
        let account = AccountSession()
        XCTAssertEqual(account.session?.userId, user)
        return account
    }

    private static func refreshed(_ user: String, token: String) -> String {
        """
        {"access_token":"\(token)","refresh_token":"ref-2","expires_in":3600,
         "user":{"id":"\(user)","app_metadata":{"provider":"apple"},
                 "identities":[{"provider":"apple","id":"001.apple","identity_data":{"sub":"001.apple"}}]}}
        """
    }

    private static let progress = #"{"ok":true,"progress":{"xp":10,"streak":1,"aura":0,"routeIndex":0},"results":[]}"#

    // MARK: X is Debug-only

    func testXSignInIsCompiledIntoDebugBuildsAlone() {
        XCTAssertFalse(SignInMethods.offersX(debugBuild: false), "a Release build must never offer X")
        XCTAssertTrue(SignInMethods.offersX(debugBuild: true))
        // These tests run the Debug configuration: the flag follows the build, not a setting.
        XCTAssertTrue(SignInMethods.isDebugBuild)
        XCTAssertEqual(SignInMethods.offersX, SignInMethods.isDebugBuild)
    }

    @MainActor func testTextOnlyOnboardingSkipsTheVibeStep() {
        XCTAssertFalse(NeuralVoice.enabled)
        XCTAssertFalse(CompanionOnboarding.showsVibeStep(voiceEnabled: NeuralVoice.enabled))
        XCTAssertTrue(CompanionOnboarding.showsVibeStep(voiceEnabled: true))
    }

    // MARK: Account deletion — client 2 contract

    @MainActor func testDeletionSendsTheAccountClientHeaderAndShowsAppleManualSteps() async throws {
        let account = signedIn()
        B34Stub.install { seen in
            guard seen.path == "/api/account" else { return .fail }
            return seen.method == "GET"
                ? .json(200, #"{"appleAuthorizationRequired":false,"manualAppleRevocation":true}"#)
                : .json(200, #"{"ok":true,"appleRevocation":"manual","manualRevocationURL":"https://support.apple.com/en-us/102571"}"#)
        }
        let result = await account.deleteAccount()
        XCTAssertEqual(result, .deleted)
        let calls = B34Stub.requests.filter { $0.path == "/api/account" }
        XCTAssertEqual(calls.map(\.method), ["GET", "DELETE"])
        for call in calls {
            XCTAssertEqual(call.request.value(forHTTPHeaderField: "X-Bobby-Account-Client"), "2")
            XCTAssertEqual(call.request.value(forHTTPHeaderField: "Origin"), "https://bobbyprotocol.xyz")
            XCTAssertEqual(call.bearer, "Bearer tok-old")
        }
        XCTAssertNil(calls.last?.body.flatMap { $0.isEmpty ? nil : $0 }, "no Apple code was asked for")
        XCTAssertTrue(account.manualAppleRevocationRequired)
        XCTAssertEqual(account.manualRevocationURL.absoluteString, "https://support.apple.com/en-us/102571")
        XCTAssertNil(account.session)
        XCTAssertNil(Keychain.read(service: service))
        XCTAssertTrue(AccountDeletionCopy.deleted(manualAppleSteps: true).contains(AccountSession.manualRevocationSteps))
    }

    @MainActor func testCancellingAppleReauthorizationIsAQuietCancel() async {
        let account = signedIn()
        B34Stub.install { seen in
            seen.method == "GET" ? .json(200, #"{"appleAuthorizationRequired":true,"manualAppleRevocation":false}"#) : .json(500, "{}")
        }
        account.appleDeletionCode = { throw ASAuthorizationError(.canceled) }
        let result = await account.deleteAccount()
        XCTAssertEqual(result, .cancelled)
        XCTAssertNil(account.lastError, "closing Apple's sheet is not an error")
        XCTAssertFalse(B34Stub.requests.contains { $0.method == "DELETE" })
        XCTAssertNotNil(account.session, "nothing was deleted")
    }

    @MainActor func testAppleCodeTravelsInTheDeleteAndRevokedNeedsNoManualSteps() async throws {
        let account = signedIn()
        B34Stub.install { seen in
            seen.method == "GET" ? .json(200, #"{"appleAuthorizationRequired":true}"#) : .json(200, #"{"ok":true,"appleRevocation":"revoked"}"#)
        }
        account.appleDeletionCode = { "apple-code-1" }
        let result = await account.deleteAccount()
        XCTAssertEqual(result, .deleted)
        let delete = try XCTUnwrap(B34Stub.requests.first { $0.method == "DELETE" })
        XCTAssertEqual(delete.request.value(forHTTPHeaderField: "X-Bobby-Account-Client"), "2")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(delete.body)) as? [String: Any])
        XCTAssertEqual(body["appleAuthorizationCode"] as? String, "apple-code-1")
        XCTAssertFalse(account.manualAppleRevocationRequired)
    }

    @MainActor func testABackendBeforeTheCheckStillDeletesAndOnlyApplesPageIsOpened() async {
        let account = signedIn()
        // 405 on GET: the backend predates the check and never asks for Apple.
        B34Stub.install { seen in
            seen.method == "GET" ? .json(405, #"{"error":"Method not allowed"}"#)
                : .json(200, #"{"ok":true,"appleRevocation":"manual","manualRevocationURL":"https://evil.example/steal"}"#)
        }
        account.appleDeletionCode = { XCTFail("no Apple sheet for an old backend"); return "" }
        let result = await account.deleteAccount()
        XCTAssertEqual(result, .deleted)
        XCTAssertEqual(account.manualRevocationURL, AccountSession.defaultManualRevocationURL, "never a non-Apple link")
        XCTAssertTrue(account.manualAppleRevocationRequired)
    }

    @MainActor func testAServerThatStartsRequiringAppleIsAnsweredOnce() async throws {
        let account = signedIn()
        B34Stub.install { seen in
            if seen.method == "GET" { return .json(200, #"{"appleAuthorizationRequired":false}"#) }
            return seen.body?.isEmpty == false
                ? .json(200, #"{"ok":true,"appleRevocation":"revoked"}"#)
                : .json(409, #"{"error":"Confirm with Apple before deleting this account.","appleAuthorizationRequired":true}"#)
        }
        account.appleDeletionCode = { "apple-code-2" }
        let result = await account.deleteAccount()
        XCTAssertEqual(result, .deleted)
        XCTAssertEqual(B34Stub.requests.filter { $0.method == "DELETE" }.count, 2)
    }

    // MARK: Apple's manual steps, as Apple words them (support.apple.com/102571, Sep 2026)

    func testManualAppleStepsMatchApplesIPhoneStepsInBothLanguages() {
        let en = AccountSession.manualRevocationSteps(spanish: false)
        let es = AccountSession.manualRevocationSteps(spanish: true)
        XCTAssertEqual(en, "To finish, open Settings, tap your name, tap Sign in with Apple, choose Bobby and tap Delete.")
        XCTAssertEqual(es, "Para terminar, abre Configuración, toca tu nombre, toca Iniciar sesión con Apple, elige Bobby y toca Eliminar.")
        // Not the web path (Sign-In & Security), not the old button, not Spain's "Ajustes".
        for stale in ["Sign-In & Security", "Stop Using", "Inicio de sesión y seguridad", "Dejar de usar", "Ajustes"] {
            XCTAssertFalse(en.contains(stale) || es.contains(stale), stale)
        }
        XCTAssertEqual(AccountSession.manualRevocationSteps, L.t(en, es))
    }

    func testApplesPageOpensInTheLanguageOfTheSteps() {
        let server = "https://support.apple.com/en-us/102571"
        XCTAssertEqual(AccountSession.manualRevocationURL(from: server, spanish: false).absoluteString, server)
        XCTAssertEqual(AccountSession.manualRevocationURL(from: server, spanish: true).absoluteString, "https://support.apple.com/es-mx/102571")
        XCTAssertEqual(AccountSession.manualRevocationURL(from: "https://support.apple.com/es-es/102571?x=1", spanish: true).absoluteString,
                       "https://support.apple.com/es-mx/102571?x=1")
        XCTAssertEqual(AccountSession.manualRevocationURL(from: nil, spanish: true).absoluteString, "https://support.apple.com/es-mx/102571")
        XCTAssertEqual(AccountSession.manualRevocationURL(from: nil, spanish: false).absoluteString, server)
        XCTAssertEqual(AccountSession.manualRevocationURL(from: "https://evil.example/en-us/102571", spanish: true).absoluteString,
                       "https://support.apple.com/es-mx/102571", "never a non-Apple link, in either language")
        XCTAssertEqual(AccountSession.manualRevocationURL(from: "https://support.apple.com/102571", spanish: true).absoluteString,
                       "https://support.apple.com/102571", "no locale segment: Apple picks the language")
        XCTAssertEqual(AccountSession.defaultManualRevocationURL, AccountSession.defaultManualRevocationURL(spanish: L.isSpanish))
    }

    // MARK: Sign-in errors, worded once

    func testAppleSignInFailuresAreWordedNotRaw() {
        XCTAssertNil(AccountSession.appleSignInFailure(ASAuthorizationError(.canceled)), "closing Apple's sheet is not an error")
        let unavailable = AccountSession.appleSignInFailure(ASAuthorizationError(.unknown))
        XCTAssertEqual(unavailable, L.t("Sign in with Apple is not available right now — check that you are signed in to your Apple Account in Settings.",
                                        "Iniciar sesión con Apple no está disponible ahora — revisa que tengas sesión en tu cuenta de Apple en Configuración."))
        let retry = L.t("Sign in with Apple did not finish — try again.", "Iniciar sesión con Apple no terminó — inténtalo de nuevo.")
        XCTAssertEqual(AccountSession.appleSignInFailure(ASAuthorizationError(.failed)), retry)
        XCTAssertEqual(AccountSession.appleSignInFailure(ASAuthorizationError(.invalidResponse)), retry)
        XCTAssertEqual(AccountSession.appleSignInFailure(URLError(.timedOut)), retry)
        for code: ASAuthorizationError.Code in [.unknown, .failed, .invalidResponse, .notHandled, .notInteractive] {
            let text = AccountSession.appleSignInFailure(ASAuthorizationError(code)) ?? ""
            XCTAssertFalse(text.contains("AuthorizationError") || text.contains("\(code.rawValue)"), text)
        }
    }

    @MainActor func testASignInFailureIsStoredAsTheWordedCopy() async {
        let account = AccountSession()
        XCTAssertNil(account.session)
        await account.completeApple(.failure(ASAuthorizationError(.unknown)))
        XCTAssertEqual(account.lastError, AccountSession.appleSignInFailure(ASAuthorizationError(.unknown)))
        await account.completeApple(.failure(ASAuthorizationError(.canceled)))
        XCTAssertNil(account.lastError, "a cancel clears the line instead of keeping an old error")
    }

    // MARK: A token that expired mid-operation

    @MainActor func testA401RefreshesOnceAndRetries() async throws {
        let account = signedIn()
        B34Stub.install { seen in
            if seen.path == "/auth/v1/token" { return .json(200, Self.refreshed("b34-user", token: "tok-new")) }
            return seen.bearer == "Bearer tok-new" ? .json(200, #"{"ok":true}"#) : .json(401, #"{"error":"Unauthorized"}"#)
        }
        var probe = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/probe"))
        probe.httpMethod = "GET"
        let answer = try await account.send(probe)
        XCTAssertEqual(answer, .answered(Data(#"{"ok":true}"#.utf8), 200))
        XCTAssertEqual(B34Stub.requests.map(\.path), ["/api/probe", "/auth/v1/token", "/api/probe"])
        XCTAssertEqual(account.session?.accessToken, "tok-new", "the token was still inside its clock: the 401 forced the refresh")
    }

    @MainActor func testProgressSyncRetriesWithAFreshTokenInsteadOfSigningOut() async throws {
        let account = signedIn(apple: nil, provider: nil)
        let sync = ProgressSync(account: account)
        let store = CompanionStore(), profile = AgentProfile()
        defer { store.forgetAccount("b34-user"); store.unbind() }
        B34Stub.install { seen in
            if seen.path == "/auth/v1/token" { return .json(200, Self.refreshed("b34-user", token: "tok-new")) }
            return seen.bearer == "Bearer tok-new" ? .json(200, Self.progress) : .json(401, #"{"error":"Unauthorized"}"#)
        }
        await sync.sync(store: store, profile: profile)
        XCTAssertEqual(sync.status, .synced)
        XCTAssertTrue(account.isSignedIn, "a refresh token that still works keeps the session")
        XCTAssertEqual(account.session?.accessToken, "tok-new")
        XCTAssertEqual(store.ownerUserId, "b34-user")
        XCTAssertEqual(B34Stub.requests.map(\.path), ["/api/progress", "/auth/v1/token", "/api/progress"])
        // The refresh answer named the Apple identity of a session saved before build 33.
        XCTAssertEqual(account.session?.appleUserId, "001.apple")
        XCTAssertEqual(account.session?.provider, "apple")
    }

    @MainActor func testProgressSyncSignsOutOnlyWhenTheRefreshedTokenIsRefusedToo() async {
        let account = signedIn()
        let sync = ProgressSync(account: account)
        let store = CompanionStore(), profile = AgentProfile()
        defer { store.forgetAccount("b34-user"); store.unbind() }
        B34Stub.install { seen in
            seen.path == "/auth/v1/token" ? .json(200, Self.refreshed("b34-user", token: "tok-new")) : .json(401, #"{"error":"Unauthorized"}"#)
        }
        await sync.sync(store: store, profile: profile)
        XCTAssertEqual(sync.status, .unauthenticated)
        XCTAssertNil(account.session)
    }

    @MainActor func testAnOfflineRefreshAfterA401KeepsTheSession() async {
        let account = signedIn()
        let sync = ProgressSync(account: account)
        let store = CompanionStore(), profile = AgentProfile()
        defer { store.forgetAccount("b34-user"); store.unbind() }
        B34Stub.install { seen in seen.path == "/auth/v1/token" ? .fail : .json(401, #"{"error":"Unauthorized"}"#) }
        await sync.sync(store: store, profile: profile)
        XCTAssertEqual(sync.status, .error)
        XCTAssertNotNil(account.session, "an outage is not a sign-out")
    }

    @MainActor func testTheDesksExtendRetriesA401WithARefreshedToken() async throws {
        let answer = """
        {"ok":true,"extended":{"inventoryId":"inv-3",
          "item":{"id":"thesis_citadel_double_gate","world":"thesis_citadel","kind":"building","name":{"en":"Double Gate","es":"Double Gate"},"footprint":[2,1]},
          "horizon":{"hours":72,"tier":"building","reviewAt":"2099-09-22T10:00:00.000Z","extendable":true,"extendTo":[168]}},
         "land":{"size":8,"theme":"default"},"inventory":[],"placements":[],"xp":0,"aura":0}
        """
        DeskLandStub.install { $0.value(forHTTPHeaderField: "Authorization") == "Bearer tok-2" ? (200, answer) : (401, #"{"error":"Unauthorized"}"#) }
        let extender = DeskSeedExtender(transport: DeskLandStub.session,
                                        account: DeskAccount(userID: { "user-1" }, token: { "tok-1" }, refresh: { _ in "tok-2" }))
        let result = await extender.extend(inventoryID: "inv-3", to: .threeDays)
        guard case let .success(extended) = result else { return XCTFail("expected the retry to extend, got \(result)") }
        XCTAssertEqual(extended.horizon.hours, .threeDays)
        XCTAssertEqual(DeskLandStub.requests.map { $0.request.value(forHTTPHeaderField: "Authorization") }, ["Bearer tok-1", "Bearer tok-2"])
    }

    // MARK: Account B signs in while A's sync is in flight

    @MainActor func testASyncAskedForDuringAnotherAccountsRoundStillRuns() async throws {
        let account = signedIn("b34-a", token: "tok-a")
        let sync = ProgressSync(account: account)
        let store = CompanionStore(), profile = AgentProfile()
        defer { store.forgetAccount("b34-a"); store.forgetAccount("b34-b"); store.unbind() }
        let hold = DispatchSemaphore(value: 0)
        let arrived = expectation(description: "A's round is out")
        B34Stub.install { seen in
            if seen.bearer == "Bearer tok-a" { arrived.fulfill(); hold.wait() }
            return .json(200, Self.progress)
        }
        let first = Task { await sync.sync(store: store, profile: profile) }
        await fulfillment(of: [arrived], timeout: 5)
        account.signOut(store: store)
        account.accept(StoredSession(accessToken: "tok-b", refreshToken: "ref-b", expiresAt: Date().addingTimeInterval(3600), userId: "b34-b"))
        await sync.sync(store: store, profile: profile)   // A's sync is still in flight
        hold.signal()
        await first.value
        XCTAssertEqual(store.ownerUserId, "b34-b", "B's first sync ran once A's round came back")
        XCTAssertEqual(B34Stub.requests.compactMap(\.bearer), ["Bearer tok-a", "Bearer tok-b"])
        XCTAssertEqual(sync.status, .synced)
    }

    // MARK: Sessions saved before build 33

    @MainActor func testALegacySessionLearnsItsAppleIDFromAuth() async throws {
        let account = signedIn("legacy-user", token: "tok-legacy", apple: nil, provider: nil)
        B34Stub.install { seen in
            guard seen.path == "/auth/v1/user" else { return .fail }
            return .json(200, #"{"id":"legacy-user","app_metadata":{"provider":"apple","providers":["apple"]},"identities":[{"provider":"apple","id":"001.legacy","identity_data":{"sub":"001.legacy"}}]}"#)
        }
        await account.backfillIdentity()
        XCTAssertEqual(account.session?.appleUserId, "001.legacy")
        XCTAssertEqual(account.session?.provider, "apple")
        XCTAssertEqual(Keychain.read(service: service)?.appleUserId, "001.legacy", "kept for the next launch")
        let call = try XCTUnwrap(B34Stub.requests.first)
        XCTAssertEqual(call.bearer, "Bearer tok-legacy")
        XCTAssertEqual(call.request.value(forHTTPHeaderField: "apikey"), SupabaseConfig.anonKey)
    }

    @MainActor func testIdentityParsing() {
        let apple = AccountSession.identity(fromUser: ["id": "u", "app_metadata": ["provider": "apple"],
                                                       "identities": [["provider": "apple", "identity_data": ["sub": "001.x"]]]])
        XCTAssertEqual(apple.appleUserId, "001.x")
        XCTAssertEqual(apple.provider, "apple")
        let x = AccountSession.identity(fromUser: ["id": "u", "identities": [["provider": "twitter", "identity_data": ["sub": "42"]]]])
        XCTAssertNil(x.appleUserId, "an X identity is never read as Apple")
        XCTAssertEqual(x.provider, "twitter")
    }

    // MARK: The question, counted like the server counts it

    func testQuestionLengthCountsUnicodeCodePoints() {
        XCTAssertEqual(DeskQuestion.maxLength, 1200)
        XCTAssertFalse(DeskQuestion.isTooLong(String(repeating: "a", count: 1200)))
        XCTAssertTrue(DeskQuestion.isTooLong(String(repeating: "a", count: 1201)))
        // 700 emoji: 700 code points (1,400 UTF-16 units) — within the limit.
        XCTAssertEqual(DeskQuestion.length(String(repeating: "😀", count: 700)), 700)
        XCTAssertFalse(DeskQuestion.isTooLong(String(repeating: "😀", count: 700)))
        // One visible family emoji is five code points: 241 of them are 1,205, over the limit.
        let family = String(repeating: "👨‍👩‍👧", count: 241)
        XCTAssertEqual(family.count, 241)
        XCTAssertTrue(DeskQuestion.isTooLong(family))
        // Surrounding whitespace is trimmed first, as the server trims.
        XCTAssertFalse(DeskQuestion.isTooLong("  " + String(repeating: "a", count: 1200) + "\n"))
    }

    func testDeskRefusalsMapToTheirOwnMessages() {
        XCTAssertEqual(DeskFailure(status: 429, body: ["error": "The desk has reached its usage limit."]), .quota)
        XCTAssertEqual(DeskFailure(status: 400, body: ["error": "question_too_long"]), .questionTooLong)
        XCTAssertEqual(DeskFailure(status: 400, body: ["code": "question_too_long", "error": "Too long"]), .questionTooLong)
        XCTAssertNil(DeskFailure(status: 400, body: ["error": "Provide an asset and a question up to 1200 characters."]))
        XCTAssertNil(DeskFailure(status: 503, body: ["error": "The analysis could not finish."]))
        XCTAssertEqual(DeskFailure.quota.message, L.t("Bobby reached today's analysis limit. Try again tomorrow.",
                                                      "Bobby llegó al límite de análisis de hoy. Intenta mañana."))
        XCTAssertEqual(DeskFailure.questionTooLong.message, DeskQuestion.tooLongMessage)
    }

    // MARK: A refusal is not an outage

    func testARefusalNamesItsCauseInTheStatusPill() {
        XCTAssertEqual(DeskPhase.refused.label(refusal: .quota), L.t("LIMIT REACHED", "LÍMITE ALCANZADO"))
        XCTAssertEqual(DeskPhase.refused.label(refusal: .questionTooLong), L.t("QUESTION TOO LONG", "PREGUNTA MUY LARGA"))
        XCTAssertEqual(DeskPhase.error.label(refusal: nil), L.t("INCOMPLETE LINK", "ENLACE INCOMPLETO"), "an outage keeps its word")
        XCTAssertEqual(DeskPhase.error.label(refusal: .quota), DeskPhase.error.label, "only a refusal is relabelled")
        XCTAssertTrue(DeskPhase.refused.showsHint)
        XCTAssertTrue(DeskPhase.error.showsHint)
        XCTAssertFalse(DeskPhase.complete.showsHint)
    }

    @MainActor func testTheDesksDailyLimitShowsAsARefusalNotABrokenLink() async throws {
        let watchlist = UserDefaults.standard.data(forKey: "desk.watchlist")
        defer { UserDefaults.standard.set(watchlist, forKey: "desk.watchlist") }
        B34Stub.install { seen in
            switch seen.path {
            case "/api/bobby-asset-search":
                return .json(200, #"{"resolved":{"symbol":"BTC","assetClass":"crypto"},"resolution":{"needsConfirmation":false}}"#)
            case "/api/desk-debate":
                return .json(429, #"{"error":"Bobby reached today's analysis limit.","code":"daily_limit"}"#)
            default:
                return .json(200, "{}")
            }
        }
        let vm = BobbyViewModel()
        vm.ask("BTC")
        let deadline = Date().addingTimeInterval(10)
        while vm.thinking, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertFalse(vm.thinking)
        XCTAssertEqual(vm.phase, .refused)
        XCTAssertEqual(vm.refusal, .quota)
        XCTAssertEqual(vm.phase.label(refusal: vm.refusal), L.t("LIMIT REACHED", "LÍMITE ALCANZADO"))
        XCTAssertEqual(vm.errorHint, DeskFailure.quota.message)
        XCTAssertTrue(B34Stub.requests.contains { $0.path == "/api/desk-debate" })

        // An outage right after it is an outage again: the refusal does not stick.
        B34Stub.install { seen in
            seen.path == "/api/bobby-asset-search"
                ? .json(200, #"{"resolved":{"symbol":"BTC","assetClass":"crypto"},"resolution":{"needsConfirmation":false}}"#)
                : seen.path == "/api/desk-debate" ? .json(503, #"{"error":"The analysis could not finish."}"#) : .json(200, "{}")
        }
        vm.ask("BTC")
        while vm.thinking, Date() < deadline.addingTimeInterval(10) { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(vm.phase, .error)
        XCTAssertNil(vm.refusal)
        XCTAssertEqual(vm.phase.label(refusal: vm.refusal), L.t("INCOMPLETE LINK", "ENLACE INCOMPLETO"))
    }

    @MainActor func testATooLongQuestionIsRefusedOnThePhoneWithItsHintVisible() {
        let vm = BobbyViewModel()
        vm.input = String(repeating: "a", count: 1201)
        vm.ask()
        XCTAssertFalse(vm.thinking, "nothing was sent")
        XCTAssertEqual(vm.phase, .refused)
        XCTAssertEqual(vm.refusal, .questionTooLong)
        XCTAssertTrue(vm.phase.showsHint, "the hint renders under the status")
        XCTAssertEqual(vm.errorHint, DeskQuestion.tooLongMessage)
        XCTAssertEqual(vm.input.count, 1201, "the question stays to be shortened")
        XCTAssertTrue(B34Stub.requests.isEmpty)
    }

    // MARK: The Spanish desk

    func testTheChartsSourceLineFollowsTheLanguage() {
        XCTAssertEqual(MarketSnapshot.sourceLabel(isEquity: false, spanish: false), "CRYPTO · OKX")
        XCTAssertEqual(MarketSnapshot.sourceLabel(isEquity: false, spanish: true), "CRIPTO · OKX")
        XCTAssertEqual(MarketSnapshot.sourceLabel(isEquity: true, spanish: false), "EQUITIES · YAHOO")
        XCTAssertEqual(MarketSnapshot.sourceLabel(isEquity: true, spanish: true), "ACCIONES · YAHOO")
    }

    func testDebateCarriesTheServersRefusal() async {
        B34Stub.install { _ in .json(429, #"{"error":"The desk has reached its usage limit. Try again later.","code":"desk_quota"}"#) }
        let quota = await BobbyAPI.debate("BTC", question: "Where is support?")
        XCTAssertTrue(quota.isUnavailable)
        XCTAssertFalse(quota.isNoTrade, "a refusal is never a NO TRADE")
        XCTAssertEqual(quota.failure, .quota)
        B34Stub.install { _ in .json(400, #"{"error":"Your question is too long.","code":"question_too_long"}"#) }
        let tooLong = await BobbyAPI.debate("BTC", question: "Where is support?")
        XCTAssertEqual(tooLong.failure, .questionTooLong)
        B34Stub.install { _ in .json(503, #"{"error":"The analysis could not finish."}"#) }
        let outage = await BobbyAPI.debate("BTC", question: "Where is support?")
        XCTAssertTrue(outage.isUnavailable)
        XCTAssertNil(outage.failure)
    }

    // MARK: The typed question never rides in a URL

    func testAFailedAssetSearchIsNeverResentAsGET() async {
        B34Stub.install { _ in .json(503, #"{"error":"Catalog unavailable"}"#) }
        let question = "how is nvidia doing today vs the S&P 500?"
        let search = await BobbyAPI.assetSearch(question)
        XCTAssertNil(search)
        let resolved = await BobbyAPI.resolveAsset(question)
        XCTAssertNil(resolved)
        let calls = B34Stub.requests.filter { $0.path == "/api/bobby-asset-search" }
        XCTAssertFalse(calls.isEmpty)
        for call in calls {
            XCTAssertEqual(call.method, "POST")
            XCTAssertNil(call.request.url?.query, "no query string: \(call.request.url?.absoluteString ?? "")")
        }
        let first = calls.first.flatMap(\.body).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        XCTAssertEqual(first?["q"] as? String, question, "the question travels in the body")
    }
}

/// Answers the app's requests to bobbyprotocol.xyz and the Supabase Auth host in-process.
/// The handler runs off the main thread and may block (to hold a request in flight).
final class B34Stub: URLProtocol {
    struct Seen {
        let request: URLRequest
        let body: Data?
        var method: String { request.httpMethod ?? "GET" }
        var path: String { request.url?.path ?? "" }
        var bearer: String? { request.value(forHTTPHeaderField: "Authorization") }
    }
    enum Reply { case json(Int, String), fail }

    private static let lock = NSLock()
    private static var handler: ((Seen) -> Reply)?
    private static var seen: [Seen] = []

    static func install(_ handler: ((Seen) -> Reply)?) {
        lock.lock(); defer { lock.unlock() }
        self.handler = handler
        seen = []
    }

    static var requests: [Seen] { lock.lock(); defer { lock.unlock() }; return seen }

    override class func canInit(with request: URLRequest) -> Bool {
        ["qbvdqkknnuweatptjohi.supabase.co", "bobbyprotocol.xyz"].contains(request.url?.host ?? "")
    }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let request = self.request
        let seen = Seen(request: request, body: request.httpBody ?? request.httpBodyStream.map(Self.read))
        Self.lock.lock()
        Self.seen.append(seen)
        let handler = Self.handler
        Self.lock.unlock()
        DispatchQueue.global().async {
            guard case let .json(status, body)? = handler?(seen) else {
                self.client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
                return
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: Data(body.utf8))
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }

    private static func read(_ stream: InputStream) -> Data {
        var data = Data()
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            guard n > 0 else { break }
            data.append(buffer, count: n)
        }
        return data
    }
}
