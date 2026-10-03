import Foundation
import XCTest
@testable import Bobby

/// One recorded device call: what was sent and under whose bearer.
private struct DeviceCall {
    let path: String
    let method: String
    let body: [String: Any]
    let headers: [String: String]
    let bearer: String?
}

/// The fake device endpoint. Answers come from `responder`, which may suspend.
@MainActor
private final class DeviceServer {
    var calls: [DeviceCall] = []
    var responder: (DeviceCall) async throws -> BriefingsReply = { _ in BriefingsReply(json: nil, status: 500, headers: [:]) }

    func handle(_ call: DeviceCall) async throws -> BriefingsReply {
        calls.append(call)
        return try await responder(call)
    }

    var transport: BriefingsTransport {
        BriefingsTransport(json: { [weak self] path, method, body, headers, auth in
            let bearer = await auth.bearer()
            guard let self else { throw URLError(.cancelled) }
            return try await self.handle(DeviceCall(path: path, method: method, body: body ?? [:], headers: headers, bearer: bearer))
        }, bytes: { _ in .unavailable })
    }

    static func receipt(_ registration: String, revision: Int, credential: String, status: Int = 201) -> BriefingsReply {
        BriefingsReply(json: ["registrationId": registration, "bindingRevision": revision, "installationCredential": credential],
                       status: status, headers: [:])
    }
}

/// Registration, rebind, revocation and environment rules. No APNs, no Keychain, no network.
@MainActor
final class PushRegistrarTests: XCTestCase {
    private let tokenA = String(repeating: "ab", count: 32)
    private let tokenB = String(repeating: "cd", count: 32)
    private let regA = "11111111-1111-4111-8111-111111111111"
    private let regB = "22222222-2222-4222-8222-222222222222"
    private var user: String? = "a"
    private var status: PushPermission = .authorized
    private var clock = Date(timeIntervalSince1970: 1_790_000_000)
    private var keys = 0
    private var weeklyOn = false
    private var server: DeviceServer!
    private var suite = ""
    private var defaults: UserDefaults!

    override func setUp() async throws {
        try await super.setUp()
        user = "a"; status = .authorized; keys = 0; weeklyOn = false
        clock = Date(timeIntervalSince1970: 1_790_000_000)
        server = DeviceServer()
        suite = "bobby.push.tests.\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() async throws {
        defaults.removePersistentDomain(forName: suite)
        try await super.tearDown()
    }

    private func registrar(storage: PushRecordStorage = .memory()) -> PushRegistrar {
        let r = PushRegistrar(storage: storage)
        r.api = BriefingsAPI(transport: server.transport, auth: .none)
        r.currentUser = { [unowned self] in self.user }
        r.accessToken = { [unowned self] _ in self.user.map { "token-\($0)" } }
        r.riskAccepted = { true }
        r.authorizationStatus = { [unowned self] in self.status }
        r.requestAuthorization = { true }
        r.weeklyEnabled = { [unowned self] in self.weeklyOn }
        r.registerForRemote = {}
        r.environment = { "sandbox" }
        r.appBuild = { 53 }
        r.now = { [unowned self] in self.clock }
        r.newKey = { [unowned self] in self.keys += 1; return "key-\(self.keys)" }
        return r
    }

    private func bound(owner: String = "a", token: String? = nil, permission: String = "authorized",
                       environment: String = "sandbox", syncedAgo: TimeInterval = 60) -> PushRecord {
        var record = PushRecord(installationId: "33333333-3333-4333-8333-333333333333")
        record.registrationId = regA
        record.bindingRevision = 1
        record.credential = "cred-a"
        record.ownerUserId = owner
        record.tokenHash = PushRegistrar.sha256(token ?? tokenA)
        record.permission = permission
        record.environment = environment
        record.lastSyncAt = clock.addingTimeInterval(-syncedAgo)
        return record
    }

    // MARK: decision table

    func testRegisterVersusRebindDecisionTable() {
        let hash = PushRegistrar.sha256(tokenA)
        func decide(_ record: PushRecord, owner: String = "a", token: String? = nil, permission: String = "authorized",
                    environment: String = "sandbox") -> PushRegistrar.SyncAction {
            PushRegistrar.decide(record: record, owner: owner, tokenHash: token.map(PushRegistrar.sha256) ?? hash,
                                 permission: permission, environment: environment, now: clock)
        }
        XCTAssertEqual(decide(PushRecord(installationId: "x")), .register, "no binding")
        var noProof = bound(); noProof.credential = nil
        XCTAssertEqual(decide(noProof), .register, "a binding without its proof cannot be rebound")
        XCTAssertEqual(decide(bound()), .none, "unchanged and fresh")
        XCTAssertEqual(decide(bound(), owner: "b"), .rebind, "owner changed")
        XCTAssertEqual(decide(bound(), token: tokenB), .rebind, "token rotated")
        XCTAssertEqual(decide(bound(), permission: "denied"), .rebind, "permission changed")
        XCTAssertEqual(decide(bound(), environment: "production"), .rebind, "environment changed")
        XCTAssertEqual(decide(bound(syncedAgo: 24 * 3600 + 1)), .rebind, "older than 24 h")
        XCTAssertEqual(decide(bound(syncedAgo: -600)), .rebind, "a sync stamped in the future is not trusted")
        var never = bound(); never.lastSyncAt = nil
        XCTAssertEqual(decide(never), .rebind)
    }

    // MARK: registration

    func testFirstRegistrationStoresTheBindingAndNotTheToken() async throws {
        let storage = PushRecordStorage.memory()
        let r = registrar(storage: storage)
        server.responder = { [regA] _ in DeviceServer.receipt(regA, revision: 1, credential: "cred-a") }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(server.calls.count, 1)
        let call = try XCTUnwrap(server.calls.first)
        XCTAssertEqual(call.method, "POST")
        XCTAssertEqual(call.path, BriefingsAPI.devicePath)
        XCTAssertEqual(call.bearer, "token-a")
        XCTAssertNil(call.body["registrationId"], "a first registration carries no binding")
        XCTAssertEqual(call.body["apnsToken"] as? String, tokenA)
        XCTAssertEqual(call.body["permissionState"] as? String, "authorized")
        XCTAssertEqual(call.body["apnsEnvironment"] as? String, "sandbox")
        XCTAssertEqual(call.body["appBuild"] as? Int, 53)
        XCTAssertEqual(call.headers[BriefingsAPI.idempotencyHeader], "key-1")
        XCTAssertNil(call.headers[BriefingsAPI.proofHeader])
        let record = try XCTUnwrap(storage.load())
        XCTAssertEqual(record.ownerUserId, "a")
        XCTAssertEqual(record.registrationId, regA)
        XCTAssertEqual(record.credential, "cred-a")
        XCTAssertEqual(record.tokenHash, PushRegistrar.sha256(tokenA))
        XCTAssertNil(record.pending)
        XCTAssertEqual(r.state, .registered)
        let raw = String(decoding: try XCTUnwrap(storage.read()), as: UTF8.self)
        XCTAssertFalse(raw.contains(tokenA), "the APNs token itself is never persisted")
        // The same token again: nothing changed, nothing is sent.
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(server.calls.count, 1)
        // The installation id is stable across operations.
        XCTAssertEqual(call.body["installationId"] as? String, record.installationId)
    }

    func testIdempotencyKeyIsReusedAfterAFailedUploadUntilItSucceeds() async throws {
        let storage = PushRecordStorage.memory()
        let r = registrar(storage: storage)
        server.responder = { _ in throw URLError(.notConnectedToInternet) }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(r.state, .failed)
        XCTAssertEqual(storage.load()?.pending?.idempotencyKey, "key-1")
        server.responder = { _ in BriefingsReply(json: ["code": "storage_unavailable"], status: 503, headers: [:]) }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        server.responder = { [regA] _ in DeviceServer.receipt(regA, revision: 1, credential: "cred-a") }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(server.calls.map { $0.headers[BriefingsAPI.idempotencyHeader] }, ["key-1", "key-1", "key-1"],
                       "every retry of the same operation replays the same key")
        XCTAssertNil(storage.load()?.pending, "the key is dropped once the server answered")
        XCTAssertEqual(r.state, .registered)
        // A changed payload is a different operation: a new key.
        status = .denied
        server.responder = { [regA] _ in DeviceServer.receipt(regA, revision: 2, credential: "cred-a2", status: 200) }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(server.calls.last?.headers[BriefingsAPI.idempotencyHeader], "key-2")
        XCTAssertEqual(server.calls.last?.body["permissionState"] as? String, "denied")
        XCTAssertEqual(server.calls.last?.headers[BriefingsAPI.proofHeader], "cred-a")
        XCTAssertEqual(storage.load()?.credential, "cred-a2", "the rebind rotates the credential")
    }

    func testConflictOnFirstRegistrationIsUnavailableAndNeverLoops() async {
        let r = registrar()
        server.responder = { _ in BriefingsReply(json: ["error": "Conflict", "code": "conflict"], status: 409, headers: [:]) }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(r.state, .unavailable)
        r.didRegister(tokenHex: tokenA)
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(server.calls.count, 1, "a refused first registration is not retried for the same token/owner")
        XCTAssertEqual(r.state, .unavailable)
    }

    func testLateAnswerForAIsRecordedForANeverForB() async throws {
        let storage = PushRecordStorage.memory()
        let r = registrar(storage: storage)
        let started = expectation(description: "A's registration is in flight")
        var pending: CheckedContinuation<BriefingsReply, Error>?
        server.responder = { _ in try await withCheckedThrowingContinuation { pending = $0; started.fulfill() } }
        r.didRegister(tokenHex: tokenA)
        await fulfillment(of: [started], timeout: 3)
        user = "b"
        pending?.resume(returning: DeviceServer.receipt(regA, revision: 1, credential: "cred-a"))
        await r.settle()
        XCTAssertEqual(server.calls.first?.bearer, "token-a")
        XCTAssertEqual(storage.load()?.ownerUserId, "a", "the binding belongs to the account that asked for it")
    }

    func testRebindThatNoLongerMatchesStartsOverOnce() async throws {
        let storage = PushRecordStorage.memory()
        storage.save(bound(syncedAgo: 25 * 3600))
        let r = registrar(storage: storage)
        server.responder = { [regB] call in
            call.body["registrationId"] == nil
                ? DeviceServer.receipt(regB, revision: 1, credential: "cred-new")
                : BriefingsReply(json: ["code": "not_found"], status: 404, headers: [:])
        }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(server.calls.count, 2)
        XCTAssertEqual(server.calls[0].body["registrationId"] as? String, regA)
        XCTAssertNil(server.calls[1].body["registrationId"])
        XCTAssertEqual(storage.load()?.registrationId, regB)
        XCTAssertEqual(storage.load()?.credential, "cred-new")
    }

    func testNothingRegistersBeforeTheRiskNoticeOrWithoutAnAccount() async {
        let r = registrar()
        var asked = 0
        r.registerForRemote = { asked += 1 }
        r.riskAccepted = { false }
        r.register()
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        r.riskAccepted = { true }
        user = nil
        r.register()
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        await Task.yield()
        XCTAssertEqual(asked, 0)
        XCTAssertTrue(server.calls.isEmpty)
    }

    func testMalformedTokensAreIgnored() async {
        let r = registrar()
        r.didRegister(tokenHex: "zz")
        r.didRegister(tokenHex: String(repeating: "g", count: 64))
        await r.settle()
        XCTAssertNil(r.tokenHex)
        XCTAssertTrue(server.calls.isEmpty)
        r.didRegister(deviceToken: Data([0xAB, 0x01, 0xFF] + Array(repeating: 0x10, count: 29)))
        XCTAssertEqual(r.tokenHex, "ab01ff" + String(repeating: "10", count: 29))
        await r.settle()
    }

    func testPermissionChangedInSettingsIsResyncedOnActive() async throws {
        let storage = PushRecordStorage.memory()
        storage.save(bound())
        let r = registrar(storage: storage)
        let asked = expectation(description: "iOS is asked for the token again")
        r.registerForRemote = { [unowned r, tokenA] in r.didRegister(tokenHex: tokenA); asked.fulfill() }
        server.responder = { [regA] _ in DeviceServer.receipt(regA, revision: 2, credential: "cred-a2", status: 200) }
        status = .denied
        r.appBecameActive()
        await fulfillment(of: [asked], timeout: 3)
        await r.settle()
        XCTAssertEqual(r.permission, .denied)
        XCTAssertEqual(server.calls.count, 1)
        XCTAssertEqual(server.calls[0].body["permissionState"] as? String, "denied")
        XCTAssertEqual(server.calls[0].body["expectedBindingRevision"] as? Int, 1)
        XCTAssertEqual(storage.load()?.permission, "denied")
        XCTAssertEqual(storage.load()?.bindingRevision, 2)
    }

    func testInitialRegistrationRecoversOnActiveOnlyForConfirmedOptIn() async throws {
        let r = registrar()
        let asked = expectation(description: "APNs registration retried after permission changes")
        asked.expectedFulfillmentCount = 1
        r.registerForRemote = { [unowned r, tokenA] in r.didRegister(tokenHex: tokenA); asked.fulfill() }
        server.responder = { [regA] _ in DeviceServer.receipt(regA, revision: 1, credential: "cred-a") }

        status = .denied
        weeklyOn = true
        r.appBecameActive()
        await Task.yield()
        XCTAssertTrue(server.calls.isEmpty, "denied permission cannot start an unbound registration")

        status = .authorized
        weeklyOn = false
        r.appBecameActive()
        await Task.yield()
        XCTAssertTrue(server.calls.isEmpty, "an opted-out account cannot silently register")

        weeklyOn = true
        r.appBecameActive()
        await fulfillment(of: [asked], timeout: 3)
        await r.settle()
        XCTAssertEqual(server.calls.count, 1)
        XCTAssertEqual(r.state, .registered)
    }

    // MARK: account changes

    private func stored(_ user: String) -> StoredSession {
        StoredSession(accessToken: "token-\(user)", refreshToken: "refresh-\(user)", expiresAt: Date().addingTimeInterval(3600),
                      userId: user, appleUserId: "apple-\(user)", provider: "apple")
    }

    private func account(_ user: String) -> AccountSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = []
        return AccountSession(initialSession: stored(user), usesKeychain: false, authTransport: URLSession(configuration: config),
                              defaults: defaults)
    }

    func testSignOutRevokesWithTheOutgoingTokenAndNeverTheNextAccounts() async throws {
        let storage = PushRecordStorage.memory()
        let session = account("a")
        let r = registrar(storage: storage)
        r.currentUser = { [weak session] in session?.session?.userId }
        r.accessToken = { [weak session] _ in session?.session?.accessToken }
        r.observe(session)
        server.responder = { [regA, regB] call in
            switch (call.method, call.bearer) {
            case ("DELETE", _): return BriefingsReply(json: nil, status: 204, headers: [:])
            case ("POST", "token-a"): return DeviceServer.receipt(regA, revision: 1, credential: "cred-a")
            default: return DeviceServer.receipt(regB, revision: 1, credential: "cred-b")
            }
        }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        XCTAssertEqual(storage.load()?.ownerUserId, "a")

        session.accept(stored("b"))
        await r.settle()

        let deletes = server.calls.filter { $0.method == "DELETE" }
        XCTAssertEqual(deletes.count, 1)
        XCTAssertEqual(deletes.first?.bearer, "token-a", "the revocation carries the outgoing account's bearer")
        XCTAssertEqual(deletes.first?.headers[BriefingsAPI.proofHeader], "cred-a")
        XCTAssertEqual(deletes.first?.body["registrationId"] as? String, regA)
        XCTAssertFalse(server.calls.contains { $0.method == "DELETE" && $0.bearer == "token-b" })
        let bCall = try XCTUnwrap(server.calls.last)
        XCTAssertEqual(bCall.method, "POST")
        XCTAssertEqual(bCall.bearer, "token-b")
        XCTAssertNil(bCall.body["registrationId"], "the revoked binding is gone: B registers fresh")
        XCTAssertEqual(storage.load()?.ownerUserId, "b")
        XCTAssertEqual(storage.load()?.credential, "cred-b")

        // Signing out entirely revokes B's binding with B's token, and nothing registers afterwards.
        session.signOut()
        await r.settle()
        XCTAssertEqual(server.calls.last?.method, "DELETE")
        XCTAssertEqual(server.calls.last?.bearer, "token-b")
        XCTAssertNil(storage.load()?.ownerUserId)
    }

    func testFailedRevocationKeepsTheProofSoTheNextAccountRebinds() async throws {
        let storage = PushRecordStorage.memory()
        let session = account("a")
        let r = registrar(storage: storage)
        r.currentUser = { [weak session] in session?.session?.userId }
        r.accessToken = { [weak session] _ in session?.session?.accessToken }
        r.observe(session)
        server.responder = { [regA] call in
            switch call.method {
            case "DELETE": throw URLError(.notConnectedToInternet)
            default:
                return call.body["registrationId"] == nil
                    ? DeviceServer.receipt(regA, revision: 1, credential: "cred-a")
                    : DeviceServer.receipt(regA, revision: 2, credential: "cred-b", status: 200)
            }
        }
        r.didRegister(tokenHex: tokenA)
        await r.settle()
        session.accept(stored("b"))
        await r.settle()
        let rebind = try XCTUnwrap(server.calls.last)
        XCTAssertEqual(rebind.bearer, "token-b")
        XCTAssertEqual(rebind.body["registrationId"] as? String, regA)
        XCTAssertEqual(rebind.body["expectedBindingRevision"] as? Int, 1)
        XCTAssertEqual(rebind.headers[BriefingsAPI.proofHeader], "cred-a")
        XCTAssertEqual(storage.load()?.ownerUserId, "b")
        XCTAssertEqual(storage.load()?.bindingRevision, 2)
        XCTAssertEqual(storage.load()?.credential, "cred-b")
    }

    func testATokenRefreshOfTheSameAccountRevokesNothing() async {
        let r = registrar()
        r.accountWillChange(from: stored("a"), to: stored("a"))
        r.accountWillChange(from: nil, to: stored("b"))
        await r.settle()
        XCTAssertTrue(server.calls.isEmpty)
    }

    func testKeychainRecordIsForgottenOnlyForItsOwner() {
        let storage = PushRecordStorage.memory()
        storage.save(bound(owner: "b"))
        PushRegistrar.forgetOwner("a", storage: storage)
        XCTAssertEqual(storage.load()?.ownerUserId, "b", "deleting A never touches B's binding")
        XCTAssertEqual(storage.load()?.credential, "cred-a")
        PushRegistrar.forgetOwner("b", storage: storage)
        let record = storage.load()
        XCTAssertNil(record?.ownerUserId)
        XCTAssertNil(record?.credential)
        XCTAssertNil(record?.registrationId)
        XCTAssertNil(record?.tokenHash)
        XCTAssertEqual(record?.installationId, "33333333-3333-4333-8333-333333333333", "the install id survives")
        XCTAssertEqual(PushRegistrar.keychainService, "xyz.bobbyprotocol.bobby.push")
    }

    // MARK: environment

    func testApnsEnvironmentComesFromTheProvisioningProfile() {
        let development = """
        \u{30}\u{82}garbage<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>
        \t<key>Entitlements</key>
        \t<dict>
        \t\t<key>aps-environment</key>
        \t\t<string>development</string>
        \t</dict></dict></plist>\u{A0}trailer
        """
        let production = "<dict><key>aps-environment</key>\n<string>production</string></dict>"
        XCTAssertEqual(PushRegistrar.apnsEnvironment(profileText: development), "sandbox")
        XCTAssertEqual(PushRegistrar.apnsEnvironment(profileText: production), "production")
        XCTAssertEqual(PushRegistrar.apnsEnvironment(profileText: nil), "production", "App Store builds embed no profile")
        XCTAssertEqual(PushRegistrar.apnsEnvironment(profileText: "<dict><key>get-task-allow</key><true/></dict>"), "production")
    }
}
