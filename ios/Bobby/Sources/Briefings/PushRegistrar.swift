// Bobby Pro market briefings — APNs registration and the app delegate (build 53).
// Contract: docs/product/pro-market-briefings-api-contracts.md §Devices and implementation spec D7/D9.
// Invariants:
//  - iOS permission is asked ONLY when the person enables a briefing or Bobby news, never at launch.
//  - `registerForRemoteNotifications` runs only after the risk notice is accepted (R11) and with an account.
//  - The binding lives in one Keychain record (service xyz.bobbyprotocol.bobby.push, this-device-only):
//    a stable installation UUID, the server's registration id + binding revision, the installation
//    credential (the proof; never logged, never sent anywhere but X-Bobby-Installation-Proof), its owner,
//    and a local SHA-256 of the token (the token itself is never persisted by the app).
//  - Every operation runs on one serial chain and carries the bearer of the account it was decided for:
//    an account switch can never make A's late answer bind B, nor B's bearer revoke A's binding.
//  - An Idempotency-Key is persisted with the pending operation and reused by every retry of the same
//    payload, so a lost answer replays the same receipt (the rotated credential included).
//  - A conflict on a first registration is final for that token/owner (state .unavailable, no loop).
//  - The APNs environment comes from the signed provisioning profile, never from DEBUG.
import Combine
import CryptoKit
import Foundation
import UIKit
import UserNotifications

/// The device binding as this phone knows it. Codable: stored as JSON in the Keychain.
struct PushRecord: Codable, Equatable {
    var installationId: String
    var registrationId: String?
    var bindingRevision: Int?
    var credential: String?
    var ownerUserId: String?
    /// SHA-256 hex of the APNs token (local change detection only).
    var tokenHash: String?
    var environment: String?
    /// The permission state last reported to the server.
    var permission: String?
    var lastSyncAt: Date?
    /// The operation not yet acknowledged by the server, with the Idempotency-Key its retries reuse.
    var pending: PushPendingOperation?

    init(installationId: String) { self.installationId = installationId }

    var hasBinding: Bool { registrationId != nil && bindingRevision != nil && credential != nil && ownerUserId != nil }

    /// Forget the server binding; the installation id stays (it identifies this install, not an account).
    mutating func dropBinding() {
        registrationId = nil; bindingRevision = nil; credential = nil; ownerUserId = nil
        tokenHash = nil; environment = nil; permission = nil; lastSyncAt = nil; pending = nil
    }

    /// The pending key when it was minted for exactly this operation, else a fresh one (now pending).
    mutating func idempotencyKey(kind: String, digest: String, fresh: () -> String) -> String {
        if let pending, pending.kind == kind, pending.digest == digest { return pending.idempotencyKey }
        let key = fresh()
        pending = PushPendingOperation(kind: kind, digest: digest, idempotencyKey: key)
        return key
    }
}

struct PushPendingOperation: Codable, Equatable {
    /// "register" | "rebind"
    var kind: String
    /// SHA-256 of the request payload: a changed payload gets a new key (the server would refuse a reuse).
    var digest: String
    var idempotencyKey: String
}

/// Byte storage for the record; production uses the Keychain, tests an in-memory box.
struct PushRecordStorage {
    let read: () -> Data?
    let write: (Data) -> Void

    static func keychain(service: String = PushRegistrar.keychainService) -> PushRecordStorage {
        PushRecordStorage(read: { Keychain.readData(service: service) }, write: { Keychain.writeData($0, service: service) })
    }

    static func memory() -> PushRecordStorage {
        final class Box { var data: Data? }
        let box = Box()
        return PushRecordStorage(read: { box.data }, write: { box.data = $0 })
    }

    func load() -> PushRecord? { read().flatMap { try? JSONDecoder().decode(PushRecord.self, from: $0) } }

    func save(_ record: PushRecord) {
        guard let data = try? JSONEncoder().encode(record) else { return }
        write(data)
    }
}

extension PushPermission {
    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .authorized: self = .authorized
        case .denied: self = .denied
        case .provisional: self = .provisional
        case .ephemeral: self = .ephemeral
        case .notDetermined: self = .notDetermined
        @unknown default: self = .notDetermined
        }
    }
}

@MainActor
final class PushRegistrar: ObservableObject {
    static let shared = PushRegistrar()
    nonisolated static let keychainService = "xyz.bobbyprotocol.bobby.push"
    /// A binding unchanged for this long is re-sent (keeps last-seen fresh, recovers a lost server row).
    nonisolated static let resyncInterval: TimeInterval = 24 * 3600

    enum State: Equatable {
        case idle, syncing, registered
        /// The server refused the binding (conflict, device limit): no automatic retry for this token/owner.
        case unavailable
        /// Offline or a server error: retried on the next token delivery / app activation.
        case failed
    }

    enum SyncAction: Equatable { case none, register, rebind }

    @Published private(set) var state: State = .idle
    @Published private(set) var permission: PushPermission = .notDetermined

    var api = BriefingsAPI()
    var storage: PushRecordStorage
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    /// The current account's bearer (`replacing` a refused one forces a refresh).
    var accessToken: (_ replacing: String?) async -> String? = { await AccountSession.shared.accessToken(replacing: $0) }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
    var authorizationStatus: () async -> PushPermission = {
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        return PushPermission(status)
    }
    var requestAuthorization: () async -> Bool = {
        (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    }
    /// The account's confirmed opt-in, including after a cold launch with no local binding.
    var weeklyEnabled: () async -> Bool = {
        let center = BriefingsCenter.shared
        if center.settings == nil { _ = await center.refresh() }
        return center.settings?.weeklyEnabled == true
    }
    /// Separate promotional consent: free and Pro accounts are equally eligible.
    var newsEnabled: () async -> Bool = { await NewsPushCenter.shared.confirmedEnabled() }
    var registerForRemote: () -> Void = { UIApplication.shared.registerForRemoteNotifications() }
    var environment: () -> String = { PushRegistrar.apnsEnvironment(profileText: PushRegistrar.embeddedProfileText()) }
    var appBuild: () -> Int = { Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "") ?? 0 }
    var now: () -> Date = { Date() }
    var newKey: () -> String = { UUID().uuidString.lowercased() }

    /// The APNs token of this launch (memory only; iOS hands it back on every registration).
    private(set) var tokenHex: String?
    private var chain: Task<Void, Never>?
    /// "owner|tokenHash|environment" of a first registration the server refused: never retried in a loop.
    private var refusedRegistration: String?
    private var started = false
    private var cancellables = Set<AnyCancellable>()

    init(storage: PushRecordStorage = .keychain()) {
        self.storage = storage
    }

    /// Called once from BobbyAppDelegate (never in the unit-test host).
    func start(account: AccountSession? = nil) {
        guard !started else { return }
        started = true
        observe(account ?? .shared)
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.appBecameActive() } }
            .store(in: &cancellables)
    }

    /// `$session` publishes on willSet: the outgoing session is still readable, so its bearer is captured
    /// synchronously here (no main-queue hop) before the next account's state exists.
    func observe(_ account: AccountSession) {
        account.$session
            .dropFirst()
            .sink { [weak self, weak account] next in
                MainActor.assumeIsolated { self?.accountWillChange(from: account?.session, to: next) }
            }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: account)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.accountDidChange() } }
            .store(in: &cancellables)
    }

    // MARK: permission

    func currentPermission() async -> PushPermission {
        let status = await authorizationStatus()
        permission = status
        return status
    }

    /// The OS prompt. Only from an explicit enable; a second call after a decision shows nothing.
    func requestPermission() async -> PushPermission {
        _ = await requestAuthorization()
        return await currentPermission()
    }

    // MARK: registration

    /// After an enable (or a sign-in that already had a binding): ask iOS for the token. R11 + account gated.
    func register() {
        guard riskAccepted(), let owner = currentUser() else { return }
        Task {
            let status = await currentPermission()
            guard status.allowsDelivery, riskAccepted(), currentUser() == owner else { return }
            registerForRemote()
        }
    }

    func didRegister(deviceToken: Data) {
        didRegister(tokenHex: deviceToken.map { String(format: "%02x", $0) }.joined())
    }

    func didRegister(tokenHex hex: String) {
        guard hex.count >= 32, hex.count <= 400, hex.allSatisfy(\.isHexDigit) else { return }
        tokenHex = hex.lowercased()
        enqueue { await $0.syncNow() }
    }

    func didFailToRegister() {
        state = .failed
    }

    /// Permission can change in Settings while the app is away. A previously failed first registration
    /// has no binding yet, so recover it only when the account still opted in and delivery is allowed.
    func appBecameActive() {
        guard riskAccepted(), let owner = currentUser() else { return }
        Task {
            let status = await currentPermission()
            guard riskAccepted(), currentUser() == owner else { return }
            let news = await newsEnabled()
            guard riskAccepted(), currentUser() == owner else { return }
            if storage.load()?.ownerUserId != owner {
                guard status.allowsDelivery else { return }
                let weekly = await weeklyEnabled()
                let optedIn = weekly || news
                guard optedIn, currentUser() == owner else { return }
            }
            registerForRemote()
        }
    }

    /// Waits for every queued operation (tests; nothing in the app needs to block on it).
    func settle() async {
        while let current = chain {
            await current.value
            if chain == current { return }
        }
    }

    // MARK: account changes

    func accountWillChange(from old: StoredSession?, to next: StoredSession?) {
        // A token refresh republishes the same account: nothing to do.
        guard let old, old.userId != next?.userId else { return }
        state = .idle
        refusedRegistration = nil
        let owner = old.userId
        let token = old.accessToken
        enqueue { await $0.revokeOutgoing(owner: owner, token: token) }
    }

    func accountDidChange() {
        guard riskAccepted(), currentUser() != nil else { return }
        // Only a device that was registering this launch, or still holds a binding, follows the new account.
        guard tokenHex != nil || storage.load()?.hasBinding == true else { return }
        // The new account must have its own confirmed choice before adopting this installation.
        let owner = currentUser()
        enqueue { registrar in
            let weekly = await registrar.weeklyEnabled(), news = await registrar.newsEnabled()
            guard owner != nil, registrar.currentUser() == owner, weekly || news else { return }
            if registrar.tokenHex != nil { await registrar.syncNow() } else { registrar.register() }
        }
    }

    /// Account deletion: the server cascade removed the binding; forget it locally only when it was that account's.
    static func forgetOwner(_ userId: String, storage: PushRecordStorage = .keychain()) {
        guard var record = storage.load(), record.ownerUserId == userId else { return }
        record.dropBinding()
        storage.save(record)
    }

    // MARK: decisions (pure)

    nonisolated static func decide(record: PushRecord, owner: String, tokenHash: String, permission: String,
                                   environment: String, now: Date) -> SyncAction {
        guard record.hasBinding else { return .register }
        if record.ownerUserId != owner || record.tokenHash != tokenHash || record.permission != permission
            || record.environment != environment { return .rebind }
        guard let last = record.lastSyncAt, last <= now, now.timeIntervalSince(last) < resyncInterval else { return .rebind }
        return .none
    }

    /// `aps-environment` of the embedded provisioning profile: development → sandbox; production, a
    /// profile without the key, or no profile at all (App Store builds carry none) → production.
    nonisolated static func apnsEnvironment(profileText: String?) -> String {
        guard let text = profileText,
              let range = text.range(of: #"<key>aps-environment</key>\s*<string>[A-Za-z]+</string>"#, options: .regularExpression)
        else { return "production" }
        return text[range].contains("<string>development</string>") ? "sandbox" : "production"
    }

    /// The CMS-wrapped plist as text (Latin-1 decodes any byte, so the XML part stays searchable).
    nonisolated static func embeddedProfileText(bundle: Bundle = .main) -> String? {
        guard let url = bundle.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else { return nil }
        return String(data: data, encoding: .isoLatin1)
    }

    nonisolated static func sha256(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    /// Foreground presentation: banner + list (the alert sound is the push's own), nothing when that
    /// briefing is already on screen.
    nonisolated static func presentation(briefId: String?, openBriefId: String?) -> UNNotificationPresentationOptions {
        if let briefId, briefId == openBriefId { return [] }
        return [.banner, .list]
    }

    // MARK: operations (serial)

    private func enqueue(_ operation: @escaping @MainActor (PushRegistrar) async -> Void) {
        let previous = chain
        chain = Task { [weak self] in
            await previous?.value
            guard let self else { return }
            await operation(self)
        }
    }

    private func loadRecord() -> PushRecord {
        if let record = storage.load() { return record }
        // The installation id is generated once and kept across accounts.
        let fresh = PushRecord(installationId: UUID().uuidString.lowercased())
        storage.save(fresh)
        return fresh
    }

    /// The bearer of `owner`, refreshed once on a 401 only while `owner` is still the account.
    private func auth(owner: String, bearer: String) -> BobbyMeterAuth {
        BobbyMeterAuth(bearer: { bearer },
                       refresh: { [weak self] stale in await self?.freshBearer(owner: owner, replacing: stale) },
                       owner: { nil })
    }

    private func freshBearer(owner: String, replacing stale: String) async -> String? {
        guard currentUser() == owner else { return nil }
        let token = await accessToken(stale)
        return currentUser() == owner ? token : nil
    }

    private func syncNow() async {
        guard riskAccepted(), let owner = currentUser(), let token = tokenHex else { return }
        let status = await currentPermission()
        guard currentUser() == owner, let bearer = await accessToken(nil), currentUser() == owner else { return }
        var record = loadRecord()
        if record.ownerUserId != owner {
            let weekly = await weeklyEnabled(), news = await newsEnabled()
            guard status.allowsDelivery, riskAccepted(), currentUser() == owner, weekly || news else { return }
        }
        let env = environment()
        let hash = Self.sha256(token)
        let device = BriefingDeviceRegistration(installationId: record.installationId, apnsToken: token,
                                                permissionState: status.serverValue, appBuild: appBuild(), apnsEnvironment: env)
        switch Self.decide(record: record, owner: owner, tokenHash: hash, permission: status.serverValue, environment: env, now: now()) {
        case .none:
            state = .registered
        case .register:
            await performRegister(device, owner: owner, hash: hash, auth: auth(owner: owner, bearer: bearer), record: &record)
        case .rebind:
            await performRebind(device, owner: owner, hash: hash, auth: auth(owner: owner, bearer: bearer), record: &record, retries: 1)
        }
    }

    private func performRegister(_ device: BriefingDeviceRegistration, owner: String, hash: String,
                                 auth: BobbyMeterAuth, record: inout PushRecord) async {
        let refusalKey = owner + "|" + hash + "|" + device.apnsEnvironment
        guard refusedRegistration != refusalKey else { state = .unavailable; return }
        let digest = Self.digest(["register", owner, device.installationId, device.apnsToken, device.permissionState,
                                  String(device.appBuild), device.apnsEnvironment])
        let key = record.idempotencyKey(kind: "register", digest: digest, fresh: newKey)
        storage.save(record)
        state = .syncing
        do {
            var client = api
            client.auth = auth
            let receipt = try await client.registerDevice(device, idempotencyKey: key)
            guard let credential = receipt.installationCredential else {
                record.pending = nil; storage.save(record); state = .failed; return
            }
            bind(&record, receipt: receipt, credential: credential, owner: owner, hash: hash, device: device)
        } catch let error as BriefingsError {
            switch error {
            case .unavailable, .signedOut:
                state = .failed     // the pending key stays: the retry replays this exact operation
            default:
                // conflict (another active binding), device limit, any definitive refusal.
                record.pending = nil
                storage.save(record)
                refusedRegistration = refusalKey
                state = .unavailable
            }
        } catch {
            state = .failed
        }
    }

    private func performRebind(_ device: BriefingDeviceRegistration, owner: String, hash: String,
                               auth: BobbyMeterAuth, record: inout PushRecord, retries: Int) async {
        guard let registrationId = record.registrationId, let revision = record.bindingRevision, let proof = record.credential else {
            return await performRegister(device, owner: owner, hash: hash, auth: auth, record: &record)
        }
        let digest = Self.digest(["rebind", owner, registrationId, String(revision), device.installationId, device.apnsToken,
                                  device.permissionState, String(device.appBuild), device.apnsEnvironment])
        let key = record.idempotencyKey(kind: "rebind", digest: digest, fresh: newKey)
        storage.save(record)
        state = .syncing
        do {
            var client = api
            client.auth = auth
            let receipt = try await client.rebindDevice(device, registrationId: registrationId, expectedBindingRevision: revision,
                                                        proof: proof, idempotencyKey: key)
            bind(&record, receipt: receipt, credential: receipt.installationCredential ?? proof, owner: owner, hash: hash, device: device)
        } catch let error as BriefingsError {
            switch error {
            case .unavailable, .signedOut:
                state = .failed
            case .notFound:
                // The proof no longer matches (revoked, purged, or rotated elsewhere): start over once.
                record.dropBinding()
                storage.save(record)
                await performRegister(device, owner: owner, hash: hash, auth: auth, record: &record)
            case .conflict(let current?) where retries > 0:
                record.bindingRevision = current
                record.pending = nil
                storage.save(record)
                await performRebind(device, owner: owner, hash: hash, auth: auth, record: &record, retries: retries - 1)
            default:
                record.pending = nil
                storage.save(record)
                state = .unavailable
            }
        } catch {
            state = .failed
        }
    }

    private func bind(_ record: inout PushRecord, receipt: BriefingDeviceReceipt, credential: String, owner: String,
                      hash: String, device: BriefingDeviceRegistration) {
        record.registrationId = receipt.registrationId
        record.bindingRevision = receipt.bindingRevision
        record.credential = credential
        record.ownerUserId = owner
        record.tokenHash = hash
        record.environment = device.apnsEnvironment
        record.permission = device.permissionState
        record.lastSyncAt = now()
        record.pending = nil
        storage.save(record)
        state = .registered
    }

    /// Best effort: the outgoing account's own bearer (captured before the switch) and its proof. Success
    /// forgets the binding (the next account registers fresh); a failure keeps it, so the next sign-in
    /// rebinds with the proof and the server cancels the old owner's unsent deliveries.
    private func revokeOutgoing(owner: String, token: String) async {
        var record = loadRecord()
        guard record.ownerUserId == owner, let registrationId = record.registrationId,
              let revision = record.bindingRevision, let proof = record.credential else { return }
        do {
            try await api.revokeDevice(registrationId: registrationId, expectedBindingRevision: revision, proof: proof,
                                       auth: .outgoing(token))
            record.dropBinding()
            storage.save(record)
        } catch BriefingsError.conflict(let current?) {
            record.bindingRevision = current
            storage.save(record)
        } catch {
            // Offline or refused: keep the proof for the rebind.
        }
    }

    private static func digest(_ parts: [String]) -> String { sha256(parts.joined(separator: "\u{1F}")) }
}

/// The UIKit delegate SwiftUI lacks: the notification center delegate and the APNs token callbacks.
final class BobbyAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Unit tests drive PushRegistrar with fakes; the host app never touches notifications.
        guard !BobbyApp.isUnitTestHost else { return true }
        // Set before launch finishes so a tap that launched the app is delivered to us.
        UNUserNotificationCenter.current().delegate = self
        _ = NewsPushCenter.shared
        PushRegistrar.shared.start()
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        PushRegistrar.shared.didRegister(deviceToken: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        PushRegistrar.shared.didFailToRegister()
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        let briefId = BriefingIntent.briefId(from: notification.request.content.userInfo)
        // 1.8: a thesis reminder the person set on this phone (a local notification, never a push).
        let reminder = ReminderIntent.tap(from: notification.request.content.userInfo)
        // 1.8: a follow-up the harness planned on this phone (V18/Harness).
        let followUp = HarnessTap.tap(from: notification.request.content.userInfo)
        Task { @MainActor in
            if let reminder { completionHandler(ReminderIntent.foregroundPresentation(reminder)); return }
            if let followUp { completionHandler(HarnessIntent.foregroundPresentation(followUp)); return }
            completionHandler(PushRegistrar.presentation(briefId: briefId, openBriefId: BriefingIntent.shared.openBriefId))
        }
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let tapped = response.actionIdentifier == UNNotificationDefaultActionIdentifier
        let briefId = BriefingIntent.briefId(from: response.notification.request.content.userInfo)
        let reminder = ReminderIntent.tap(from: response.notification.request.content.userInfo)
        let news = NewsPushIntent.tap(from: response.notification.request.content.userInfo)
        let followUp = HarnessTap.tap(from: response.notification.request.content.userInfo)
        Task { @MainActor in
            // Stored only: the experience drains it once the page, account and consent are ready.
            if tapped, let briefId { BriefingIntent.shared.store(briefId) }
            // 1.8: a tapped thesis reminder waits the same way (Reminders/ReminderIntent.swift).
            if tapped, let reminder { ReminderIntent.shared.store(reminder) }
            if tapped, news != nil { NewsPushIntent.shared.store(response.notification.request.content.userInfo) }
            // 1.8: so does a tapped follow-up (Harness/HarnessIntent.swift).
            if tapped, let followUp { HarnessIntent.shared.store(followUp) }
            completionHandler()
        }
    }
}
