// Account memory on iPhone: see, correct, pause and delete what Bobby
// remembers about a signed-in Apple/Google account, through the existing /api/memory (api/memory.ts):
//   GET → {enabled, prefs:{horizon, experience, risk}, assets:[{symbol, asks, lastAskedAt, lastHorizon}], retentionDays}
//   PATCH {horizon?|experience?|risk?: enum|null, memoryEnabled?: bool} → same body
//   DELETE ?symbol=X → forget one asset; DELETE (no symbol) → forget everything. Both answer the same body.
// Invariants (the BriefingsCenter pattern):
//  - Only the native opt-in bit is kept on the phone, keyed by account; memory data stays on the server.
//    The snapshot is cleared at once on an account change. Every answer is checked against the account
//    it was asked for (user id + generation + this center's epoch) and late answers are dropped.
//  - Writes are explicit corrections, one at a time, shown only after the server answers.
//  - "Delete everything" needs a confirmation: `requestForgetAll` only arms it; `confirmForgetAll` sends.
//  - R11: no network before the risk notice is accepted; signed out = no calls.
//  - The server's text is never shown; failures map to the app's own copy.
import Combine
import CryptoKit
import Foundation

struct RememberedAsset: Equatable, Identifiable, Sendable {
    let symbol: String
    let asks: Int
    let lastAskedAt: Date?
    /// "intraday" | "week" | "month" | "long" | "unspecified"
    let lastHorizon: String
    var id: String { symbol }
}

/// GET/PATCH/DELETE /api/memory body, parsed leniently.
struct MemorySnapshot: Equatable, Sendable {
    static let horizons = ["intraday", "week", "month", "long"]
    static let experiences = ["new", "some", "experienced"]
    static let risks = ["low", "medium", "high"]
    static let symbolPattern = #"^[A-Z0-9.^=-]{1,20}$"#

    let enabled: Bool
    let horizon: String?
    let experience: String?
    let risk: String?
    let assets: [RememberedAsset]
    let retentionDays: Int

    init(enabled: Bool = true, horizon: String? = nil, experience: String? = nil, risk: String? = nil,
         assets: [RememberedAsset] = [], retentionDays: Int = 90) {
        self.enabled = enabled; self.horizon = horizon; self.experience = experience; self.risk = risk
        self.assets = assets; self.retentionDays = retentionDays
    }

    init?(json: Any?) {
        guard let o = json as? [String: Any], let enabled = BriefingJSON.bool(o["enabled"]) else { return nil }
        self.enabled = enabled
        let prefs = o["prefs"] as? [String: Any] ?? [:]
        horizon = (prefs["horizon"] as? String).flatMap { Self.horizons.contains($0) ? $0 : nil }
        experience = (prefs["experience"] as? String).flatMap { Self.experiences.contains($0) ? $0 : nil }
        risk = (prefs["risk"] as? String).flatMap { Self.risks.contains($0) ? $0 : nil }
        assets = (o["assets"] as? [Any] ?? []).compactMap { raw in
            guard let a = raw as? [String: Any], let symbol = a["symbol"] as? String,
                  symbol.range(of: Self.symbolPattern, options: .regularExpression) != nil else { return nil }
            return RememberedAsset(symbol: symbol, asks: BriefingJSON.int(a["asks"]) ?? 0,
                                   lastAskedAt: BriefingJSON.date(a["lastAskedAt"]),
                                   lastHorizon: BriefingJSON.string(a["lastHorizon"]) ?? "unspecified")
        }
        retentionDays = BriefingJSON.int(o["retentionDays"]).flatMap { $0 > 0 ? $0 : nil } ?? 90
    }

    func value(_ field: MemoryPref) -> String? {
        switch field {
        case .horizon: return horizon
        case .experience: return experience
        case .risk: return risk
        }
    }
}

enum MemoryPref: String, CaseIterable, Identifiable, Sendable {
    case horizon, experience, risk
    var id: String { rawValue }

    var allowed: [String] {
        switch self {
        case .horizon: return MemorySnapshot.horizons
        case .experience: return MemorySnapshot.experiences
        case .risk: return MemorySnapshot.risks
        }
    }
}

enum MemoryError: Error, Equatable, Sendable {
    case signedOut
    case unavailable
    case rejected

    var message: String {
        switch self {
        case .signedOut: return L.t("Sign in with Apple so Bobby can remember your assets and preferences.",
                                    "Inicia sesión con Apple para que Bobby recuerde tus activos y preferencias.")
        case .unavailable: return L.t("Memory is unavailable right now.", "La memoria no está disponible por ahora.")
        case .rejected: return L.t("That did not save. Try again.", "No se guardó. Inténtalo de nuevo.")
        }
    }
}

@MainActor
final class MemoryCenter: ObservableObject {
    static let shared = MemoryCenter()
    static let path = "api/memory"
    nonisolated static let nativeOptInHeader = "x-bobby-memory-opt-in"

    @Published private(set) var snapshot: MemorySnapshot?
    @Published private(set) var loading = false
    /// A write is in flight (one at a time).
    @Published private(set) var saving = false
    @Published private(set) var lastError: MemoryError?
    /// "Delete everything" was asked for and waits for its confirmation.
    @Published private(set) var confirmingForgetAll = false
    /// Separate from the server's shared web/account preference. Defaults off for every account on this device.
    @Published private(set) var nativeOptedIn = false

    /// One HTTP call: (path with query, method, body) → (json, status). Tests replace it.
    var send: (_ path: String, _ method: String, _ body: [String: Any]?) async throws -> (json: Any?, status: Int) = { path, method, body in
        let reply = try await BobbyAccessAPI.send(path, method: method, body: body, auth: .account, timeout: 15)
        return (reply.json, reply.status)
    }
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }

    private var owner: String?
    private var ownerGeneration: UUID?
    private var epoch = UUID()
    private var cancellables = Set<AnyCancellable>()
    private let defaults: UserDefaults

    init(observeAccount: Bool = true, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        owner = currentUser()
        ownerGeneration = currentGeneration()
        nativeOptedIn = owner.map { defaults.bool(forKey: Self.nativeOptInKey($0)) } ?? false
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.accountChanged() } }
            .store(in: &cancellables)
    }

    /// Clears everything when the account (or its epoch) changed.
    func accountChanged(force: Bool = false) {
        guard force || owner != currentUser() || ownerGeneration != currentGeneration() else { return }
        owner = currentUser()
        ownerGeneration = currentGeneration()
        epoch = UUID()
        nativeOptedIn = owner.map { defaults.bool(forKey: Self.nativeOptInKey($0)) } ?? false
        snapshot = nil
        loading = false
        saving = false
        lastError = nil
        confirmingForgetAll = false
    }

    private struct Ticket { let epoch: UUID; let user: String?; let generation: UUID }
    private func ticket() -> Ticket { Ticket(epoch: epoch, user: currentUser(), generation: currentGeneration()) }
    private func isCurrent(_ t: Ticket) -> Bool {
        !Task.isCancelled && t.epoch == epoch && t.user == currentUser() && t.generation == currentGeneration()
    }

    private var canCallServer: Bool { riskAccepted() && currentUser() != nil }

    private static func nativeOptInKey(_ user: String) -> String {
        let digest = SHA256.hash(data: Data(user.utf8)).map { String(format: "%02x", $0) }.joined()
        return "agent.nativeMemoryOptIn.v1.\(digest)"
    }

    private func revokeNativeCapture() {
        nativeOptedIn = false
        if let user = currentUser() { defaults.removeObject(forKey: Self.nativeOptInKey(user)) }
    }

    /// Called only while constructing an authenticated desk POST. A late request from another account or
    /// generation cannot borrow this account's consent. The server still checks its own memory preference.
    func allowsNativeCapture(user: String, generation: UUID) -> Bool {
        accountChanged()
        return nativeOptedIn && riskAccepted() && owner == user && ownerGeneration == generation
            && currentUser() == user && currentGeneration() == generation
    }

    // MARK: reads

    @discardableResult
    func refresh() async -> Bool {
        accountChanged()
        guard canCallServer else {
            if currentUser() == nil { lastError = .signedOut }
            return false
        }
        let t = ticket()
        loading = true
        let result = await call(Self.path, method: "GET", body: nil)
        guard isCurrent(t) else { return false }
        loading = false
        return absorb(result)
    }

    // MARK: corrections

    /// Pause (false) or resume (true) shared account memory. Revocation is local before the network call:
    /// an offline PATCH cannot leave the phone recording after the person switched it off.
    @discardableResult
    func setEnabled(_ on: Bool) async -> Bool {
        accountChanged()
        if !on { revokeNativeCapture() }
        return await write("PATCH", Self.path, body: ["memoryEnabled": on])
    }

    /// Opt iPhone asks in separately from web memory. Turning it off is immediate and needs no network.
    /// A server-side pause always wins; it also clears this local consent when observed on refresh.
    @discardableResult
    func setNativeCapture(_ on: Bool) -> Bool {
        accountChanged()
        if !on { revokeNativeCapture(); return true }
        guard canCallServer, !saving, snapshot?.enabled == true, let user = currentUser() else {
            if currentUser() == nil { lastError = .signedOut } else { lastError = .rejected }
            return false
        }
        defaults.set(true, forKey: Self.nativeOptInKey(user))
        nativeOptedIn = true
        lastError = nil
        return true
    }

    /// Set or clear (nil) one preference. Values outside the server's enums are refused locally.
    @discardableResult
    func setPref(_ field: MemoryPref, _ value: String?) async -> Bool {
        if let value, !field.allowed.contains(value) { return false }
        return await write("PATCH", Self.path, body: [field.rawValue: value ?? NSNull()])
    }

    /// Forget one remembered asset.
    @discardableResult
    func forget(_ symbol: String) async -> Bool {
        guard symbol.range(of: MemorySnapshot.symbolPattern, options: .regularExpression) != nil else { return false }
        return await write("DELETE", Self.path + "?symbol=" + BriefingsAPI.queryValue(symbol), body: nil)
    }

    /// Arms "Delete everything"; nothing leaves the phone until `confirmForgetAll`.
    func requestForgetAll() {
        guard snapshot != nil else { return }
        confirmingForgetAll = true
    }

    func cancelForgetAll() { confirmingForgetAll = false }

    /// The confirmed "Delete everything": every asset and preference (a paused memory stays paused).
    @discardableResult
    func confirmForgetAll() async -> Bool {
        guard confirmingForgetAll else { return false }
        confirmingForgetAll = false
        return await write("DELETE", Self.path, body: nil)
    }

    private func write(_ method: String, _ path: String, body: [String: Any]?) async -> Bool {
        accountChanged()
        guard canCallServer else {
            if currentUser() == nil { lastError = .signedOut }
            return false
        }
        guard !saving else { return false }
        let t = ticket()
        saving = true
        lastError = nil
        let result = await call(path, method: method, body: body)
        guard isCurrent(t) else { return false }
        saving = false
        return absorb(result)
    }

    // MARK: plumbing

    private func call(_ path: String, method: String, body: [String: Any]?) async -> Result<MemorySnapshot, MemoryError> {
        do {
            let reply = try await send(path, method, body)
            switch reply.status {
            case 200..<300:
                guard let snapshot = MemorySnapshot(json: reply.json) else { return .failure(.unavailable) }
                return .success(snapshot)
            case 401: return .failure(.signedOut)
            case 400, 403, 404, 405, 409, 413, 422: return .failure(.rejected)
            default: return .failure(.unavailable)
            }
        } catch {
            return .failure(.unavailable)
        }
    }

    private func absorb(_ result: Result<MemorySnapshot, MemoryError>) -> Bool {
        switch result {
        case .success(let s):
            snapshot = s
            if !s.enabled { revokeNativeCapture() }
            lastError = nil
            return true
        case .failure(let e):
            lastError = e
            return false
        }
    }
}
