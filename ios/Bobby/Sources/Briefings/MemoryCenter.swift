// Account memory on iPhone: see, correct, pause and delete what Bobby
// remembers about a signed-in Apple/Google account, through the existing /api/memory (api/memory.ts):
//   GET → {enabled, prefs:{horizon, experience, risk}, assets:[{symbol, asks, lastAskedAt, lastHorizon}], retentionDays}
//   PATCH {horizon?|experience?|risk?: enum|null, memoryEnabled?: bool} → same body
//   DELETE ?symbol=X → forget one asset; DELETE (no symbol) → forget everything. Both answer the same body.
// Invariants (the BriefingsCenter pattern):
//  - Only the native opt-in bit is kept on the phone, keyed by account; memory data stays on the server.
//  - 1.8: the bit alone affirms nothing. It counts only under this account's accepted record for the
//    consent as it reads today (`MemoryConsent`). A bit without that record (the 1.7 switch, or a yes
//    to an older wording) is revoked the moment it is read, so the opt-in header stops and the
//    person is asked again through the consent sheet.
//    The snapshot is cleared at once on an account change. Every answer is checked against the account
//    it was asked for (user id + generation + this center's epoch) and late answers are dropped.
//  - Writes are explicit corrections, one at a time, shown only after the server answers.
//  - "Delete everything" needs a confirmation: `requestForgetAll` only arms it; `confirmForgetAll` sends.
//  - 1.8: deletion is complete. "Forget" also takes the asset out of this phone's shortcut row, and
//    "Delete everything" also clears that row, the theses written on this phone and the notes the
//    phone keeps for follow-ups (V18/Harness), for this account only. The phone's part runs first and needs no network; `notice` says honestly whether the
//    server confirmed its part.
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

/// What this iPhone keeps for whoever is using it (the signed-in account, or the signed-out phone)
/// with no copy on Bobby's servers: the recent assets shown as shortcuts and how many theses the
/// person wrote here. A thesis's text does leave the phone inside a review the person starts.
struct LocalMemory: Equatable, Sendable {
    var shortcuts: [String] = []
    var theses = 0
}

/// How the last deletion ended. The phone's part is done before the server is asked.
enum MemoryNotice: Equatable, Sendable {
    /// Server memory, shortcuts and theses are gone.
    case erasedEverything
    /// The phone's part is gone; the server did not confirm its part.
    case erasedOnPhoneOnly
    /// The asset left this phone's shortcuts; the server did not confirm it forgot it.
    case forgotOnPhoneOnly(symbol: String)

    var message: String {
        switch self {
        case .erasedEverything:
            return L.t("Deleted: what Bobby's servers remembered, the shortcuts on this iPhone and the theses you wrote here, with Bobby's follow-up notes.",
                       "Borrado: lo que recordaban los servidores de Bobby, los accesos rápidos de este iPhone y las tesis que escribiste aquí, con las notas de seguimiento de Bobby.")
        case .erasedOnPhoneOnly:
            return L.t("Deleted on this iPhone. Bobby's servers did not confirm, so what they remember is still there. Try again.",
                       "Borrado en este iPhone. Los servidores de Bobby no confirmaron, así que lo que recuerdan sigue ahí. Inténtalo de nuevo.")
        case .forgotOnPhoneOnly(let symbol):
            return L.t("Forgotten on this iPhone. Bobby's servers did not confirm, so they still remember \(symbol). Try again.",
                       "Olvidado en este iPhone. Los servidores de Bobby no confirmaron, así que aún recuerdan \(symbol). Inténtalo de nuevo.")
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
    /// What this iPhone alone keeps for the account (1.8). Read from the phone; never from the server.
    @Published private(set) var local = LocalMemory()
    /// How the last "Forget" or "Delete everything" ended, until the next action or account change.
    @Published private(set) var notice: MemoryNotice?

    /// One HTTP call: (path with query, method, body) → (json, status). Tests replace it.
    var send: (_ path: String, _ method: String, _ body: [String: Any]?) async throws -> (json: Any?, status: Int) = { path, method, body in
        let reply = try await BobbyAccessAPI.send(path, method: method, body: body, auth: .account, timeout: 15)
        return (reply.json, reply.status)
    }
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
    var now: () -> Date = { Date() }
    /// The consent text this build shows. Tests raise it to stand for a reworded sheet.
    var consentVersion = MemoryConsent.currentVersion
    /// This center's consent store: the record the capture gate reads and the sheet writes.
    var consent: MemoryConsent { MemoryConsent(defaults: defaults, version: consentVersion) }

    private var owner: String?
    private var ownerGeneration: UUID?
    private var epoch = UUID()
    private var cancellables = Set<AnyCancellable>()
    private let defaults: UserDefaults
    /// When this account erased everything, or one asset, during this launch (`erased(since:symbol:)`).
    private var forgotAllAt: Date?
    private var forgotAt: [String: Date] = [:]

    init(observeAccount: Bool = true, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        owner = currentUser()
        ownerGeneration = currentGeneration()
        nativeOptedIn = owner.map { consentedOptIn($0) } ?? false
        local = readLocal()
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
        nativeOptedIn = owner.map { consentedOptIn($0) } ?? false
        snapshot = nil
        loading = false
        saving = false
        lastError = nil
        confirmingForgetAll = false
        notice = nil
        forgotAllAt = nil
        forgotAt = [:]
        local = readLocal()
    }

    private struct Ticket { let epoch: UUID; let user: String?; let generation: UUID }
    private func ticket() -> Ticket { Ticket(epoch: epoch, user: currentUser(), generation: currentGeneration()) }
    private func isCurrent(_ t: Ticket) -> Bool {
        !Task.isCancelled && t.epoch == epoch && t.user == currentUser() && t.generation == currentGeneration()
    }

    private var canCallServer: Bool { riskAccepted() && currentUser() != nil }

    private nonisolated static func nativeOptInKey(_ user: String) -> String {
        let digest = SHA256.hash(data: Data(user.utf8)).map { String(format: "%02x", $0) }.joined()
        return "agent.nativeMemoryOptIn.v1.\(digest)"
    }

    /// The stored switch of one account on this device, for code that only reads it (the nudge on the
    /// glass). Being on here does not send the header by itself: `allowsNativeCapture` decides that,
    /// and it also needs the account's accepted consent.
    nonisolated static func storedNativeOptIn(user: String, defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: nativeOptInKey(user))
    }

    /// The switch counts only under a yes to the consent as it reads today. A switch found without
    /// one is removed here: nothing keeps affirming an opt-in the person never gave to this text.
    private func consentedOptIn(_ user: String) -> Bool {
        let key = Self.nativeOptInKey(user)
        guard defaults.bool(forKey: key) else { return false }
        guard consent.hasAccepted(user: user) else {
            defaults.removeObject(forKey: key)
            return false
        }
        return true
    }

    /// Reads the switch and the consent again for the current account (a desk request is leaving, the
    /// memory screen appeared), so a stale or missing consent turns capture off before anything is sent.
    private func reconcileConsent() {
        let on = currentUser().map { consentedOptIn($0) } ?? false
        if on != nativeOptedIn { nativeOptedIn = on }
    }

    private func revokeNativeCapture() {
        nativeOptedIn = false
        if let user = currentUser() { defaults.removeObject(forKey: Self.nativeOptInKey(user)) }
    }

    /// Called only while constructing an authenticated desk POST. A late request from another account or
    /// generation cannot borrow this account's consent, and the switch without this account's accepted
    /// consent affirms nothing. The server still checks its own memory preference.
    func allowsNativeCapture(user: String, generation: UUID) -> Bool {
        accountChanged()
        reconcileConsent()
        return nativeOptedIn && riskAccepted() && owner == user && ownerGeneration == generation
            && currentUser() == user && currentGeneration() == generation
    }

    // MARK: reads

    @discardableResult
    func refresh() async -> Bool {
        accountChanged()
        reconcileConsent()
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

    /// Forget one remembered asset: first on this phone (its shortcut, no network needed), then on the
    /// server. True when the server confirmed; otherwise `notice` says its part is still there.
    @discardableResult
    func forget(_ symbol: String) async -> Bool {
        guard symbol.range(of: MemorySnapshot.symbolPattern, options: .regularExpression) != nil else { return false }
        accountChanged()
        guard let user = currentUser() else { lastError = .signedOut; return false }
        guard !saving else { return false }
        let generation = currentGeneration()
        notice = nil
        DeskMemory.forget(symbol: symbol, owner: user, defaults: defaults)
        forgotAt[symbol.uppercased()] = now()
        local = readLocal()
        let ok = await write("DELETE", Self.path + "?symbol=" + BriefingsAPI.queryValue(symbol), body: nil)
        guard currentUser() == user, currentGeneration() == generation else { return false }
        if !ok { notice = .forgotOnPhoneOnly(symbol: symbol) }
        return ok
    }

    /// Arms "Delete everything"; nothing is deleted until `confirmForgetAll`. It needs an account but
    /// not a loaded snapshot: the phone's part must be erasable while the server is unreachable.
    func requestForgetAll() {
        accountChanged()
        guard currentUser() != nil else { return }
        confirmingForgetAll = true
    }

    func cancelForgetAll() { confirmingForgetAll = false }

    /// The confirmed "Delete everything": this account's shortcuts, theses and follow-up notes on this
    /// phone, then every asset and preference on the server (a paused memory stays paused). True when
    /// the server confirmed.
    @discardableResult
    func confirmForgetAll() async -> Bool {
        accountChanged()
        guard confirmingForgetAll else { return false }
        confirmingForgetAll = false
        guard let user = currentUser(), !saving else { return false }
        let generation = currentGeneration()
        notice = nil
        DeskMemory.forgetWatchlist(owner: user, defaults: defaults)
        ThesisBook(defaults: defaults).deleteAll(owner: user)
        // 1.8: what the harness learned on this phone goes too, with the follow-ups it planned. A no
        // to follow-ups is not a note: it stays, so erasing never brings the offer back.
        HarnessStore(defaults: defaults).forgetNotes(owner: user)
        NotificationCenter.default.post(name: HarnessCenter.erased, object: nil)
        forgotAllAt = now()
        local = readLocal()
        let ok = await write("DELETE", Self.path, body: nil)
        guard currentUser() == user, currentGeneration() == generation else { return false }
        notice = ok ? .erasedEverything : .erasedOnPhoneOnly
        return ok
    }

    // MARK: this iPhone only (1.8)

    /// Reads the phone's own caches again (the screen appeared, a thesis was written elsewhere).
    func reloadLocal() {
        accountChanged()
        reconcileConsent()
        let fresh = readLocal()
        if fresh != local { local = fresh }
    }

    /// Clears the shortcut row of whoever is using this phone (the account, or the signed-out phone's
    /// own row). Nothing is sent anywhere, so it needs neither an account nor the network.
    func clearShortcuts() {
        accountChanged()
        DeskMemory.forgetWatchlist(owner: currentUser(), defaults: defaults)
        local = readLocal()
    }

    /// A receipt on the glass stops being true once the person erased what it names: true when this
    /// account erased everything, or this asset, at or after `date` during this launch.
    func erased(since date: Date, symbol: String) -> Bool {
        accountChanged()
        if let forgotAllAt, forgotAllAt >= date { return true }
        if let at = forgotAt[symbol.uppercased()], at >= date { return true }
        return false
    }

    /// Signed out, the phone still keeps a row and theses of its own (owner nil): they show too.
    private func readLocal() -> LocalMemory {
        let user = currentUser()
        return LocalMemory(shortcuts: DeskMemory.watchlist(owner: user, defaults: defaults).map(\.symbol),
                           theses: ThesisBook(defaults: defaults).all(owner: user).count)
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
