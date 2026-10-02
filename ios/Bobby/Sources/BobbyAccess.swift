// Metered reads (Nucleo/ARCHITECTURE.md §8). Anyone can try Bobby without an account; after
// the anonymous reads the server asks for Sign in with Apple, and after the weekly free reads
// it asks for Bobby Pro. The SERVER decides and counts; the app only says who is asking:
//   x-bobby-device    a random UUID v4 created once per install (Keychain, survives a reinstall)
//   x-bobby-platform  "ios"
//   Authorization     the Supabase bearer, only when signed in
// on every `voice-tool run_debate` call (the metered read), every `/api/bobby-access` call and the desk call.
// A server that predates metering answers without `access`: the app then behaves as before.
import Combine
import Foundation
import Security

/// The stable, random per-install id the server meters anonymous reads by. Never derived from
/// hardware, never the advertising identifier; a new install on a new phone gets a new one.
enum BobbyDevice {
    static let keychainService = "xyz.bobbyprotocol.bobby.device"
    static let defaultsKey = "bobby.deviceId"
    static let uuidV4Pattern = #"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"#

    private static let lock = NSLock()
    private static var cached: String?

    static var id: String {
        lock.lock(); defer { lock.unlock() }
        if let cached { return cached }
        if let stored = readKeychain() ?? UserDefaults.standard.string(forKey: defaultsKey), isUUIDv4(stored) {
            cached = stored
            return stored
        }
        // Foundation's UUID() is an RFC 4122 version 4 (random) UUID.
        let fresh = UUID().uuidString.lowercased()
        // The Keychain keeps it across a reinstall; UserDefaults only if the Keychain refuses.
        if !writeKeychain(fresh) { UserDefaults.standard.set(fresh, forKey: defaultsKey) }
        cached = fresh
        return fresh
    }

    static func isUUIDv4(_ s: String) -> Bool { s.range(of: uuidV4Pattern, options: .regularExpression) != nil }

    private static func readKeychain() -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func writeKeychain(_ value: String) -> Bool {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService] as CFDictionary)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService,
                                kSecValueData as String: Data(value.utf8),
                                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }
}

/// The server's word on this caller's reads: `{tier, used, limit, remaining, resetsAt, paywall}`.
struct BobbyReadAccess: Equatable, Sendable {
    static let tiers: Set<String> = ["anon", "free", "pro"]

    let tier: String
    let used: Int
    /// nil = no limit (Bobby Pro).
    let limit: Int?
    let remaining: Int?
    /// Gifted reads are separate from the plan balance and never confer Pro.
    let bonus: Int
    /// ISO-8601; nil = no reset (anonymous reads do not reset).
    let resetsAt: String?
    let paywall: Bool

    init(tier: String, used: Int, limit: Int?, remaining: Int?, resetsAt: String?, paywall: Bool, bonus: Int = 0) {
        self.bonus = max(0, bonus)
        self.tier = tier; self.used = used; self.limit = limit; self.remaining = remaining; self.resetsAt = resetsAt; self.paywall = paywall
    }

    /// Lenient: an unknown tier is no access object at all (a server we do not understand is a legacy server).
    init?(json: Any?) {
        guard let o = json as? [String: Any], let tier = o["tier"] as? String, Self.tiers.contains(tier) else { return nil }
        self.tier = tier
        used = Self.count(o["used"]) ?? 0
        limit = Self.count(o["limit"])
        remaining = Self.count(o["remaining"])
        bonus = Self.count(o["bonus"]) ?? 0
        resetsAt = (o["resetsAt"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        paywall = (o["paywall"] as? NSNumber).map { CFGetTypeID($0) == CFBooleanGetTypeID() && $0.boolValue } ?? false
    }

    /// A read count: a finite, non-negative JSON number (never a boolean).
    static func count(_ v: Any?) -> Int? {
        guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { return nil }
        let d = n.doubleValue
        guard d.isFinite, d >= 0, d < 1e9 else { return nil }
        return Int(d.rounded())
    }

    /// The bridge shape (fixtures/normalize.py `access`).
    var json: [String: Any] {
        ["tier": tier, "used": used, "limit": limit.map { $0 as Any } ?? NSNull(), "remaining": remaining.map { $0 as Any } ?? NSNull(),
         "resetsAt": resetsAt.map { $0 as Any } ?? NSNull(), "paywall": paywall, "bonus": bonus]
    }

    static func giftLabel(_ bonus: Int, spanish: Bool? = nil) -> String {
        L.t("\(bonus) gifted reads", "\(bonus) lecturas de regalo", spanish: spanish)
    }

    var isPro: Bool { tier == "pro" }

    var resetsDate: Date? { resetsAt.flatMap(BobbyAccessAPI.date) }
}

/// `{provider, status, currentPeriodEnd}` from `/api/bobby-access`.
struct BobbySubscription: Equatable, Sendable {
    let provider: String?
    let status: String?
    let currentPeriodEnd: String?

    init?(json: Any?) {
        guard let o = json as? [String: Any] else { return nil }
        provider = o["provider"] as? String
        status = o["status"] as? String
        currentPeriodEnd = o["currentPeriodEnd"] as? String
    }

    init(provider: String?, status: String?, currentPeriodEnd: String?) {
        self.provider = provider; self.status = status; self.currentPeriodEnd = currentPeriodEnd
    }

    var periodEnd: Date? { currentPeriodEnd.flatMap(BobbyAccessAPI.date) }
    /// Only an App Store subscription can be managed from the phone.
    var managedByApple: Bool { provider == nil || provider == "apple" }
    /// A live App Store subscription: Apple keeps billing it until it is cancelled in Settings,
    /// whatever happens to the Bobby account (the account deletion warning).
    var activeOnApple: Bool { provider == "apple" && ["active", "trialing"].contains(status ?? "") }
}

/// Where a metered request gets its bearer. Fixture mode and tests use `.none` (signed out).
struct BobbyMeterAuth: Sendable {
    var bearer: @Sendable () async -> String?
    /// A fresh token after the server refused `stale` (nil = none to be had).
    var refresh: @Sendable (_ stale: String) async -> String?
    /// Account epoch, including sign-out and signing back into the same account.
    var owner: @Sendable () async -> UUID? = { nil }

    static let account = BobbyMeterAuth(bearer: { await AccountSession.shared.accessToken() },
                                        refresh: { await AccountSession.shared.accessToken(replacing: $0) },
                                        owner: { await AccountSession.shared.generation })
    static let none = BobbyMeterAuth(bearer: { nil }, refresh: { _ in nil })
}

enum BobbyAccessAPI {
    static let deviceHeader = "x-bobby-device"
    static let platformHeader = "x-bobby-platform"
    static let platform = "ios"
    static let accessPath = "api/bobby-access"

    static func headers(bearer: String?) -> [String: String] {
        var h = [deviceHeader: BobbyDevice.id, platformHeader: platform]
        if let bearer { h["Authorization"] = "Bearer \(bearer)" }
        return h
    }

    /// A request with the access headers. A bearer can expire between being read and being
    /// checked: a 401 on a signed-in request forces one refresh and one retry, so only a caller
    /// the server still refuses comes back as 401. Transport errors are thrown.
    /// `extraHeaders` (briefings: If-Match, Idempotency-Key, installation proof) never replace the
    /// access headers: the bearer always comes from `auth`.
    static func send(_ path: String, method: String = "POST", body: [String: Any]? = nil,
                     auth: BobbyMeterAuth, timeout: TimeInterval? = nil,
                     extraHeaders: [String: String] = [:],
                     onEvent: (@Sendable ([String: Any]) -> Void)? = nil) async throws -> (json: Any?, status: Int, headers: [String: String]) {
        func headers(bearer: String?) -> [String: String] {
            Self.headers(bearer: bearer).merging(extraHeaders.filter { $0.key.caseInsensitiveCompare("Authorization") != .orderedSame }) { access, _ in access }
        }
        let owner = await auth.owner()
        let bearer = await auth.bearer()
        try Task.checkCancellation()
        guard await auth.owner() == owner else { throw CancellationError() }
        let first = try await BobbyAPI.responseWithHeaders(path, method: method, body: body, extraHeaders: headers(bearer: bearer), timeout: timeout, onEvent: onEvent)
        try Task.checkCancellation()
        guard await auth.owner() == owner else { throw CancellationError() }
        guard first.status == 401, let bearer else { return first }
        let fresh = await auth.refresh(bearer)
        try Task.checkCancellation()
        guard await auth.owner() == owner else { throw CancellationError() }
        guard let fresh, fresh != bearer else { return first }
        let retried = try await BobbyAPI.responseWithHeaders(path, method: method, body: body, extraHeaders: headers(bearer: fresh), timeout: timeout, onEvent: onEvent)
        try Task.checkCancellation()
        guard await auth.owner() == owner else { throw CancellationError() }
        return retried
    }

    /// "October 4" / "4 de octubre", in the app's language and the phone's time zone.
    static func day(_ date: Date, spanish: Bool? = nil, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = L.formatLocale(spanish: spanish)
        f.timeZone = timeZone
        f.setLocalizedDateFormatFromTemplate("MMMMd")
        return f.string(from: date)
    }

    static func date(_ iso: String) -> Date? {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: iso) { return d }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: iso)
    }
}

/// The latest access snapshot for the account sheet and the paywall, and the two
/// `/api/bobby-access` calls (read it; ask the server to re-read RevenueCat after a purchase).
@MainActor
final class BobbyAccessCenter: ObservableObject {
    static let shared = BobbyAccessCenter()

    @Published private(set) var access: BobbyReadAccess?
    @Published private(set) var subscription: BobbySubscription?
    /// Purchases require explicit Apple AND RevenueCat readiness; unknown is never permission to charge.
    @Published private(set) var applePayments: Bool?

    /// Whose snapshot this is (nil = signed out); a change of account clears it.
    private var owner: String?
    private var ownerGeneration: UUID?
    private var cancellables = Set<AnyCancellable>()
    var auth: BobbyMeterAuth = .account
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }

    init(observeAccount: Bool = true) {
        owner = currentUser()
        ownerGeneration = currentGeneration()
        guard observeAccount else { return }
        AccountSession.shared.$session
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.accountChanged() }
            .store(in: &cancellables)
    }

    func clear() {
        owner = currentUser()
        ownerGeneration = currentGeneration()
        access = nil
        subscription = nil
        applePayments = nil
    }

    func accountChanged() {
        if owner != currentUser() || ownerGeneration != currentGeneration() { clear() }
    }

    /// Every metered reply carries the caller's access: keep the newest one for this account.
    func record(_ access: BobbyReadAccess?) {
        guard let access else { return }
        accountChanged()
        self.access = access
    }

#if DEBUG
    /// `-qa-sales-open` (DEBUG only, for the App Review subscription screenshot): the access read is
    /// taken as "App Store sales open" without asking the server (a QA session has no real bearer).
    /// Compiled out of Release; BobbyAccessTests fails if the flag ever leaves an `#if DEBUG` block.
    nonisolated static var qaSalesOpen: Bool { ProcessInfo.processInfo.arguments.contains("-qa-sales-open") }
#endif

    /// GET /api/bobby-access. False when the server could not be read (legacy servers answer 404).
    @discardableResult
    func refresh() async -> Bool {
#if DEBUG
        if Self.qaSalesOpen { applePayments = true; return true }
#endif
        accountChanged()
        defer { accountChanged() }
        let started = currentUser()
        let generation = currentGeneration()
        guard let reply = try? await BobbyAccessAPI.send(BobbyAccessAPI.accessPath, method: "GET", auth: auth),
              (200..<300).contains(reply.status), let body = reply.json as? [String: Any],
              currentUser() == started, currentGeneration() == generation else {
            applePayments = false
            return false
        }
        apply(body)
        return true
    }

    private func apply(_ body: [String: Any]) {
        accountChanged()
        if let a = BobbyReadAccess(json: body["access"]) { access = a }
        if body.keys.contains("subscription") { subscription = BobbySubscription(json: body["subscription"]) }
        applePayments = Self.paymentsReady(body["payments"])
    }

    nonisolated static func paymentsReady(_ value: Any?) -> Bool {
        guard let payments = value as? [String: Any] else { return false }
        func enabled(_ key: String) -> Bool {
            guard let n = payments[key] as? NSNumber,
                  CFGetTypeID(n) == CFBooleanGetTypeID() else { return false }
            return n.boolValue
        }
        return enabled("apple") && enabled("revenuecat")
    }

    enum ServerSync: Equatable {
        /// The server re-read the account's RevenueCat entitlements and answered with its access.
        case accepted(BobbyReadAccess?)
        /// Nobody is signed in (or the account's session is over).
        case signedOut
        /// The server answered and refused (a definitive answer). Carries the machine `code` only:
        /// the server's English text is never shown (the app speaks its own localized copy).
        case rejected(code: String?)
        /// Offline, a timeout or a server error: RevenueCat's webhook still reaches the server.
        case unreachable
    }

    /// POST /api/bobby-access `{action:"revenuecat-sync"}` after a purchase or a restore: the server asks
    /// RevenueCat for this account's entitlements (app_user_id = the Supabase auth user id) and answers
    /// with the account's access. RevenueCat's webhooks keep it current after that.
    func syncRevenueCat() async -> ServerSync {
        accountChanged()
        defer { accountChanged() }
        let started = currentUser()
        let generation = currentGeneration()
        guard started != nil else { return .signedOut }
        let reply: (json: Any?, status: Int, headers: [String: String])
        do {
            reply = try await BobbyAccessAPI.send(BobbyAccessAPI.accessPath, method: "POST",
                                                  body: ["action": "revenuecat-sync"], auth: auth)
        } catch {
            return .unreachable
        }
        guard currentUser() == started, currentGeneration() == generation else { return .unreachable }
        let body = reply.json as? [String: Any]
        switch reply.status {
        case 200..<300:
            if let body { apply(body) }
            guard body?["ok"] as? Bool != false else { return .rejected(code: body?["code"] as? String) }
            return .accepted(BobbyReadAccess(json: body?["access"]))
        case 401:
            return .signedOut
        case 408, 429, 500...:
            return .unreachable
        default:
            return .rejected(code: body?["code"] as? String)
        }
    }
}
