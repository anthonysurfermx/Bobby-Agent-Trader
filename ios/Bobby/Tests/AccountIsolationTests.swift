import AuthenticationServices
import Foundation
import XCTest
@testable import Bobby

private final class IsolationHTTP: URLProtocol {
    static var handler: ((IsolationHTTP) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() { Self.handler?(self) }
    override func stopLoading() {}

    func respond(_ status: Int, _ body: String) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                       headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Suspended requests use explicit continuations/expectations, never a real account, Keychain or sleep.
@MainActor
final class AccountIsolationTests: XCTestCase {
    private var suite = ""
    private var defaults: UserDefaults!
    private var transports: [URLSession] = []

    override func setUp() async throws {
        try await super.setUp()
        suite = "bobby.account.isolation.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() async throws {
        IsolationHTTP.handler = nil
        transports.forEach { $0.invalidateAndCancel() }
        transports = []
        defaults.removePersistentDomain(forName: suite)
        try await super.tearDown()
    }

    private func transport() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [IsolationHTTP.self]
        let session = URLSession(configuration: config)
        transports.append(session)
        return session
    }

    private func stored(_ user: String, expired: Bool = false, token: String? = nil) -> StoredSession {
        StoredSession(accessToken: token ?? "token-\(user)", refreshToken: "refresh-\(user)",
                      expiresAt: expired ? Date(timeIntervalSince1970: 0) : Date().addingTimeInterval(3600),
                      userId: user, appleUserId: "apple-\(user)", provider: "apple")
    }

    private func account(_ user: String = "a", expired: Bool = false) -> AccountSession {
        let account = AccountSession(initialSession: stored(user, expired: expired), usesKeychain: false,
                       authTransport: transport(), defaults: defaults)
        account.eraseCompanionNotes = {}
        return account
    }

    private func tokenReply(_ user: String, token: String = "late-token") -> String {
        #"{"access_token":"\#(token)","refresh_token":"new-refresh","expires_in":3600,"user":{"id":"\#(user)"}}"#
    }

    func testSuccessfulDeletionRemovesOnlyThatAccountsLocalTheses() async {
        let account = account()
        for owner in ["a", "b", "local"] {
            defaults.set(Data(owner.utf8), forKey: NucleoLedger.key(owner: owner == "local" ? nil : owner))
        }
        IsolationHTTP.handler = { request in
            request.respond(200, request.request.httpMethod == "GET"
                ? #"{"appleAuthorizationRequired":false}"# : #"{"ok":true}"#)
        }
        var erasedNotes = 0
        account.eraseCompanionNotes = { erasedNotes += 1 }
        let result = await account.deleteAccount()
        XCTAssertEqual(erasedNotes, 1)
        XCTAssertEqual(result, .deleted)
        XCTAssertNil(defaults.data(forKey: NucleoLedger.key(owner: "a")))
        XCTAssertEqual(defaults.data(forKey: NucleoLedger.key(owner: "b")), Data("b".utf8))
        XCTAssertEqual(defaults.data(forKey: NucleoLedger.key(owner: nil)), Data("local".utf8))
    }

    func testDeletionFailuresUseAppLanguageInsteadOfRawServerProse() async {
        let previous = UserDefaults.standard.object(forKey: L.preferenceKey)
        defer {
            if let previous { UserDefaults.standard.set(previous, forKey: L.preferenceKey) }
            else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        }
        for language in AppLanguage.allCases {
            UserDefaults.standard.set(language.rawValue, forKey: L.preferenceKey)
            for failingMethod in ["GET", "DELETE"] {
                let account = account()
                IsolationHTTP.handler = { request in
                    request.respond(request.request.httpMethod == failingMethod ? 503 : 200,
                                    request.request.httpMethod == failingMethod
                                      ? #"{"error":"UNTRUSTED ENGLISH PROVIDER ERROR"}"#
                                      : #"{"appleAuthorizationRequired":false}"#)
                }
                var erasedNotes = false
                account.eraseCompanionNotes = { erasedNotes = true }
                let result = await account.deleteAccount()
                XCTAssertFalse(erasedNotes)
                XCTAssertEqual(result, .failed)
                XCTAssertEqual(account.lastError, L.t("Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo"))
                XCTAssertFalse(account.lastError?.contains("UNTRUSTED") == true)
                XCTAssertEqual(account.session?.userId, "a", "A refusal does not delete the current account")
            }
        }
    }

    func testAppleExchangeFailureUsesAppLanguageWithoutProviderErrorSuffix() async {
        let previous = UserDefaults.standard.object(forKey: L.preferenceKey)
        defer {
            if let previous { UserDefaults.standard.set(previous, forKey: L.preferenceKey) }
            else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        }
        for language in AppLanguage.allCases {
            UserDefaults.standard.set(language.rawValue, forKey: L.preferenceKey)
            let account = account()
            account.prepareAppleRequest(ASAuthorizationAppleIDProvider().createRequest())
            IsolationHTTP.handler = { $0.respond(400, #"{"error_description":"UNTRUSTED ENGLISH PROVIDER ERROR"}"#) }
            await account.completeAppleExchange(idToken: "synthetic-apple-id-token", appleUserId: "apple-a", givenName: "Ana")
            XCTAssertEqual(account.lastError, L.t("Sign in with Apple did not finish — try again.", "Iniciar sesión con Apple no terminó — inténtalo de nuevo."))
            XCTAssertFalse(account.lastError?.contains("UNTRUSTED") == true)
            XCTAssertEqual(account.session?.userId, "a", "A failed exchange preserves the current account")
        }
    }

    func testRefreshCannotRestoreASignedOutSession() async {
        let account = account(expired: true)
        let started = expectation(description: "refresh is suspended")
        var pending: IsolationHTTP?
        IsolationHTTP.handler = { request in Task { @MainActor in pending = request; started.fulfill() } }
        let result = Task { await account.accessToken() }
        await fulfillment(of: [started], timeout: 3)
        account.signOut()
        pending?.respond(200, tokenReply("a"))
        let token = await result.value
        XCTAssertNil(token)
        XCTAssertNil(account.session)
    }

    func testRefreshCannotReplaceTheNextAccount() async {
        let account = account(expired: true)
        let started = expectation(description: "A refresh is suspended")
        var pending: IsolationHTTP?
        IsolationHTTP.handler = { request in Task { @MainActor in pending = request; started.fulfill() } }
        let result = Task { await account.accessToken() }
        await fulfillment(of: [started], timeout: 3)
        account.accept(stored("b"))
        pending?.respond(200, tokenReply("a"))
        let token = await result.value
        XCTAssertNil(token)
        XCTAssertEqual(account.session?.userId, "b")
        XCTAssertEqual(account.session?.accessToken, "token-b")
    }

    func testAppleCallbackPreparedBeforeAnAccountChangeDoesNotExchange() async {
        let account = account()
        account.prepareAppleRequest(ASAuthorizationAppleIDProvider().createRequest())
        account.accept(stored("b"))
        IsolationHTTP.handler = { _ in XCTFail("A's Apple callback must not start an exchange under B") }
        await account.completeAppleExchange(idToken: "synthetic-apple-id-token", appleUserId: "apple-a", givenName: "Ana")
        await account.completeApple(.failure(ASAuthorizationError(.unknown)))
        XCTAssertEqual(account.session?.userId, "b")
        XCTAssertNil(account.lastError)
    }

    func testLateAppleExchangeCannotReplaceBOrRememberAsName() async {
        let account = account()
        account.prepareAppleRequest(ASAuthorizationAppleIDProvider().createRequest())
        let started = expectation(description: "Apple exchange is suspended")
        var pending: IsolationHTTP?
        IsolationHTTP.handler = { request in Task { @MainActor in pending = request; started.fulfill() } }
        let result = Task {
            await account.completeAppleExchange(idToken: "synthetic-apple-id-token", appleUserId: "apple-a", givenName: "Ana")
        }
        await fulfillment(of: [started], timeout: 3)
        account.accept(stored("b"))
        AppleGivenName.remember("Bea", appleUserId: "apple-b", defaults: defaults)
        pending?.respond(200, tokenReply("a"))
        await result.value
        XCTAssertEqual(account.session?.userId, "b")
        XCTAssertEqual(AppleGivenName.name(for: "apple-b", defaults: defaults), "Bea")
        XCTAssertNil(AppleGivenName.name(for: "apple-a", defaults: defaults))
    }

    func testCancellingPendingAppleExchangeKeepsCurrentAccountAndRejectsItsLateAnswer() async {
        let account = account()
        account.prepareAppleRequest(ASAuthorizationAppleIDProvider().createRequest())
        let started = expectation(description: "Apple exchange is suspended")
        var pending: IsolationHTTP?
        IsolationHTTP.handler = { request in Task { @MainActor in pending = request; started.fulfill() } }
        let result = Task {
            await account.completeAppleExchange(idToken: "synthetic-apple-id-token", appleUserId: "apple-b", givenName: "Bea")
        }
        await fulfillment(of: [started], timeout: 3)
        account.cancelPendingSignIn()
        pending?.respond(200, tokenReply("b"))
        await result.value
        XCTAssertEqual(account.session?.userId, "a", "Withdrawing AI permission must not sign out account management")
    }

    func testLateOAuthCallbackCannotRestoreAAfterBSignsIn() async {
        let account = account()
        let started = expectation(description: "OAuth callback is suspended")
        var pending: CheckedContinuation<URL, Error>?
        account.oauthAuthorization = { _ in
            try await withCheckedThrowingContinuation { continuation in pending = continuation; started.fulfill() }
        }
        let result = Task { await account.signInWithOAuth(provider: "twitter") }
        await fulfillment(of: [started], timeout: 3)
        account.signOut()
        account.accept(stored("b"))
        let payload = Data(#"{"sub":"a"}"#.utf8).base64EncodedString()
            .replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        pending?.resume(returning: URL(string: "bobbyprotocol://auth-callback#access_token=x.\(payload).x&refresh_token=ref-a&expires_in=3600")!)
        await result.value
        XCTAssertEqual(account.session?.userId, "b")
        XCTAssertEqual(account.session?.provider, "apple")
    }

    func testAuthorized200IsUnavailableAfterAnAccountChange() async throws {
        let account = account()
        let started = expectation(description: "authorized request is suspended")
        var pending: IsolationHTTP?
        IsolationHTTP.handler = { request in Task { @MainActor in pending = request; started.fulfill() } }
        let result = Task { try await account.send(URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/probe")!)) }
        await fulfillment(of: [started], timeout: 3)
        account.accept(stored("b"))
        pending?.respond(200, #"{"private":"A"}"#)
        let response = try await result.value
        XCTAssertEqual(response, .unavailable)
        XCTAssertEqual(account.session?.userId, "b")
    }

    func testSecondAuthorizedAnswerIsUnavailableAfterAnAccountChange() async throws {
        let account = account()
        let started = expectation(description: "retried request is suspended")
        var pending: IsolationHTTP?
        var bearers: [String] = []
        IsolationHTTP.handler = { request in
            Task { @MainActor in
                if request.request.url?.path == "/auth/v1/token" {
                    request.respond(200, self.tokenReply("a", token: "refreshed-a"))
                } else if request.request.value(forHTTPHeaderField: "Authorization") == "Bearer token-a" {
                    bearers.append("token-a")
                    request.respond(401, "{}")
                } else {
                    bearers.append(request.request.value(forHTTPHeaderField: "Authorization") ?? "")
                    pending = request
                    started.fulfill()
                }
            }
        }
        let result = Task { try await account.send(URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/probe")!)) }
        await fulfillment(of: [started], timeout: 3)
        account.accept(stored("b"))
        pending?.respond(200, #"{"private":"A"}"#)
        let response = try await result.value
        XCTAssertEqual(response, .unavailable)
        XCTAssertEqual(bearers, ["token-a", "Bearer refreshed-a"])
        XCTAssertEqual(account.session?.userId, "b")
    }

    private func progressSwitch(status: Int) async {
        let account = account()
        let sync = ProgressSync(account: account)
        let store = CompanionStore(defaults: defaults)
        store.bind(to: "a")
        let event = store.awardDisciplineEvent(20, kind: "no_trade_respected").eventID!
        let started = expectation(description: "A progress is suspended")
        var pending: IsolationHTTP?
        IsolationHTTP.handler = { request in Task { @MainActor in
            if request.request.value(forHTTPHeaderField: "Authorization") == "Bearer token-a" {
                pending = request; started.fulfill()
            } else {
                XCTAssertEqual(request.request.value(forHTTPHeaderField: "Authorization"), "Bearer token-b")
                request.respond(200, #"{"progress":{"xp":7,"streak":1,"aura":0,"routeIndex":0},"results":[]}"#)
            }
        } }
        let profile = AgentProfile()
        let result = Task { await sync.sync(store: store, profile: profile) }
        await fulfillment(of: [started], timeout: 3)
        account.accept(stored("b"))
        store.bind(to: "b")
        XCTAssertEqual(store.disciplineXP, 0, "B must not show A's optimistic XP before its first response")
        await sync.sync(store: store, profile: profile)
        pending?.respond(status, #"{"progress":{"xp":999,"streak":99,"aura":99,"routeIndex":99},"results":[{"id":"\#(event)","awarded":20}]}"#)
        await result.value
        XCTAssertEqual(account.session?.userId, "b", "A's late 401 must not sign B out")
        XCTAssertEqual(store.ownerUserId, "b")
        XCTAssertEqual(store.disciplineXP, 7)
        XCTAssertEqual(store.disciplineStreak, 1)
        XCTAssertNil(sync.outcomes[event])
        XCTAssertTrue(store.pendingAwards.isEmpty)
        XCTAssertEqual(sync.status, .synced)
        let queue = defaults.data(forKey: "companion.pendingAwards.a")
        XCTAssertEqual(queue.flatMap { try? JSONDecoder().decode([PendingAward].self, from: $0) }?.map(\.id), [event])
    }

    func testLateProgress200DoesNotApplyAsXpOrOutcomesToB() async { await progressSwitch(status: 200) }
    func testLateProgress401DoesNotSignBOutOrRetryWithBsToken() async { await progressSwitch(status: 401) }

    func testLevelsAndInviteClearOfflineAndRejectALateProAnswer() async {
        var user: String? = "a"
        var generation = UUID()
        let center = NucleoLevelCenter(defaults: defaults)
        center.auth = .none
        center.currentUser = { user }
        center.currentGeneration = { generation }
        let body: [String: Any] = ["levels": ["tier": "pro", "levels": ["profundo": ["used": 1, "limit": 60, "remaining": 59]]],
                                   "referral": ["code": "invite-a", "url": "https://bobbyprotocol.xyz/invite/a", "accepted": 2]]
        center.apply(body)
        XCTAssertEqual(center.tier, "pro")
        let started = expectation(description: "A access response is suspended")
        var pending: CheckedContinuation<[String: Any]?, Error>?
        center.load = { _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        let result = Task { await center.refresh() }
        await fulfillment(of: [started], timeout: 3)
        user = "b"; generation = UUID()
        center.accountChanged()
        XCTAssertNil(center.tier)
        XCTAssertNil(center.referral)
        XCTAssertTrue(center.meters.isEmpty)
        XCTAssertFalse(center.loaded)
        pending?.resume(returning: body)
        let refreshed = await result.value
        XCTAssertFalse(refreshed)
        XCTAssertNil(center.referral)
        center.load = { _ in throw URLError(.notConnectedToInternet) }
        let offline = await center.refresh()
        XCTAssertFalse(offline)
        XCTAssertNil(center.tier)
    }

    func testWatchlistAndStreakFollowOwnerEvenForAnExistingMemoryInstance() {
        let memory = DeskMemory(defaults: defaults)
        DeskMemory.setOwner("a", defaults: defaults)
        memory.recordQuery(symbol: "NVDA", isEquity: true)
        memory.recordVisit()
        DeskMemory.setOwner("b", defaults: defaults)
        XCTAssertTrue(memory.watchlist.isEmpty)
        XCTAssertEqual(memory.streak, 0)
        memory.recordQuery(symbol: "BTC", isEquity: false)
        DeskMemory.setOwner("a", defaults: defaults)
        XCTAssertEqual(memory.watchlist.map(\.symbol), ["NVDA"])
        DeskMemory.setOwner("b", defaults: defaults)
        DeskMemory.forgetOwner("a", defaults: defaults)
        XCTAssertEqual(memory.watchlist.map(\.symbol), ["BTC"])
        DeskMemory.setOwner(nil, defaults: defaults)
        XCTAssertTrue(memory.watchlist.isEmpty)
    }

    func testLegacyHistoryMigratesToItsOldOwnerInsteadOfTheNewAccount() throws {
        defaults.set("a", forKey: "companion.ownerUserId")
        defaults.set(try JSONEncoder().encode([WatchedAsset(symbol: "NVDA", isEquity: true, lastAskedAt: Date(), count: 1)]),
                     forKey: "desk.watchlist")
        DeskMemory.setOwner("b", defaults: defaults)
        let memory = DeskMemory(defaults: defaults)
        XCTAssertTrue(memory.watchlist.isEmpty)
        DeskMemory.setOwner("a", defaults: defaults)
        XCTAssertEqual(memory.watchlist.map(\.symbol), ["NVDA"])
        XCTAssertNil(defaults.object(forKey: "desk.watchlist"))
    }

    func testLegacyHistoryWithoutAnOwnerDoesNotBecomeTheNextGuestsHistory() throws {
        defaults.set(try JSONEncoder().encode([WatchedAsset(symbol: "NVDA", isEquity: true, lastAskedAt: Date(), count: 1)]),
                     forKey: "desk.watchlist")
        DeskMemory.setOwner(nil, defaults: defaults)
        XCTAssertTrue(DeskMemory(defaults: defaults).watchlist.isEmpty)
        DeskMemory.setOwner("b", defaults: defaults)
        XCTAssertTrue(DeskMemory(defaults: defaults).watchlist.isEmpty)
    }

    func testSwitchClearsEvolutionDropsAndAccountAvatarBeforeTheFirstSync() {
        let store = CompanionStore(defaults: defaults)
        store.companionId = "orb"
        store.bind(to: "a")
        store.companionId = "axiom"
        store.awardDiscipline(60)
        XCTAssertNotNil(store.pendingEvolution)
        store.bind(to: "b")
        XCTAssertEqual(store.disciplineXP, 0)
        XCTAssertNil(store.pendingEvolution)
        XCTAssertTrue(store.pendingToolUnlocks.isEmpty)
        XCTAssertTrue(store.pendingAwards.isEmpty)
        XCTAssertEqual(store.companionId, "orb")
        store.unbind()
        store.bind(to: "a")
        XCTAssertEqual(store.companionId, "axiom")
        XCTAssertEqual(store.pendingAwards.count, 1, "A's unsynced awards stay queued only for A")
    }

    func testForgettingAnOldAppleOwnerDoesNotRemoveTheCurrentName() {
        AppleGivenName.remember("Bea", appleUserId: "apple-b", defaults: defaults)
        AppleGivenName.forget(owner: "apple-a", defaults: defaults)
        XCTAssertEqual(AppleGivenName.name(for: "apple-b", defaults: defaults), "Bea")
        AppleGivenName.forget(owner: "apple-b", defaults: defaults)
        XCTAssertNil(AppleGivenName.name(for: "apple-b", defaults: defaults))
    }
}
