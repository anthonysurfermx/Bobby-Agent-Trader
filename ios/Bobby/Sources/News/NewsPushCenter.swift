// Account-owned news consent, independent of Bobby Pro and the weekly briefing.
// Nothing is persisted locally: a confirmed server receipt is required before asking iOS for a token.
import Combine
import Foundation

struct NewsPushSettings: Equatable {
    let revision: Int
    let newsEnabled: Bool
    let language: String
    let locale: String
    let consentVersion: Int?
    let offeredConsentVersion: Int
    let deliveryAvailable: Bool

    init(revision: Int, newsEnabled: Bool, language: String, locale: String, consentVersion: Int?,
         offeredConsentVersion: Int = 1, deliveryAvailable: Bool = true) {
        self.revision = revision; self.newsEnabled = newsEnabled; self.language = language; self.locale = locale
        self.consentVersion = consentVersion; self.offeredConsentVersion = offeredConsentVersion
        self.deliveryAvailable = deliveryAvailable
    }

    init?(json: Any?) {
        guard let body = json as? [String: Any], let revision = BriefingJSON.int(body["revision"]), revision >= 0,
              let enabled = body["newsEnabled"] as? Bool, let language = body["language"] as? String,
              AppLanguage(rawValue: language) != nil, let locale = body["locale"] as? String,
              locale.split(separator: "-").first.map(String.init) == language,
              let options = body["options"] as? [String: Any], let version = BriefingJSON.int(options["consentVersion"]),
              version > 0, let available = body["deliveryAvailable"] as? Bool else { return nil }
        self.init(revision: revision, newsEnabled: enabled, language: language, locale: locale,
                  consentVersion: BriefingJSON.int(body["consentVersion"]), offeredConsentVersion: version,
                  deliveryAvailable: available)
    }

    var hasCurrentConsent: Bool { newsEnabled && consentVersion == NewsPushCenter.consentVersion }
}

struct NewsPushAPI {
    static let path = "api/push-news?op=settings"
    var transport: BriefingsTransport = .live
    var auth: BobbyMeterAuth = .account

    func settings() async throws -> NewsPushSettings { try await call(method: "GET") }

    func patch(revision: Int, changes: [String: Any]) async throws -> NewsPushSettings {
        try await call(method: "PATCH", body: changes, headers: ["If-Match": "\"\(revision)\""])
    }

    private func call(method: String, body: [String: Any]? = nil, headers: [String: String] = [:]) async throws -> NewsPushSettings {
        let reply: BriefingsReply
        do { reply = try await transport.json(Self.path, method, body, headers, auth) }
        catch { throw (error as? BriefingsError ?? .unavailable) }
        guard (200..<300).contains(reply.status) else { throw BriefingsAPI.error(reply) }
        guard let settings = NewsPushSettings(json: reply.json) else { throw BriefingsError.unavailable }
        return settings
    }
}

@MainActor
final class NewsPushCenter: ObservableObject {
    static let shared = NewsPushCenter()
    nonisolated static let consentVersion = 1
    @Published private(set) var settings: NewsPushSettings?
    @Published private(set) var loading = false
    @Published private(set) var pendingEnabled: Bool?
    @Published private(set) var lastError: BriefingsError?
    @Published private(set) var permission: PushPermission = .notDetermined

    var auth: BobbyMeterAuth = .account
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
    var appLanguage: () -> (language: String, locale: String) = { (L.language, L.localeIdentifier) }
    var load: (BobbyMeterAuth) async throws -> NewsPushSettings = { try await NewsPushAPI(auth: $0).settings() }
    var save: (BobbyMeterAuth, Int, [String: Any]) async throws -> NewsPushSettings = {
        try await NewsPushAPI(auth: $0).patch(revision: $1, changes: $2)
    }
    var permissionStatus: () async -> PushPermission = { await PushRegistrar.shared.currentPermission() }
    var requestPermission: () async -> PushPermission = { await PushRegistrar.shared.requestPermission() }
    var deliveryEnabled: () -> Void = { PushRegistrar.shared.register() }

    private var owner: String?
    private var generation: UUID?
    private var epoch = UUID()
    private var patchChain: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true) {
        owner = currentUser(); generation = currentGeneration()
        guard observeAccount else { return }
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.accountChanged() } }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: L.didChange)
            .sink { [weak self] _ in Task { @MainActor in _ = await self?.syncLanguage() } }
            .store(in: &cancellables)
    }

    var isOn: Bool { pendingEnabled ?? settings?.newsEnabled ?? false }
    var deliveryBlocked: Bool { permission == .denied && settings?.newsEnabled == true }
    private var canCallServer: Bool { riskAccepted() && currentUser() != nil }

    func accountChanged() {
        guard owner != currentUser() || generation != currentGeneration() else { return }
        owner = currentUser(); generation = currentGeneration(); epoch = UUID()
        settings = nil; loading = false; pendingEnabled = nil; lastError = nil
        permission = .notDetermined; patchChain = nil
    }

    private struct Ticket { let owner: String?; let generation: UUID; let epoch: UUID }
    private func ticket() -> Ticket { Ticket(owner: currentUser(), generation: currentGeneration(), epoch: epoch) }
    private func isCurrent(_ t: Ticket) -> Bool {
        !Task.isCancelled && t.owner == currentUser() && t.generation == currentGeneration() && t.epoch == epoch
    }

    @discardableResult
    func refresh() async -> Bool {
        accountChanged()
        guard canCallServer else { return false }
        let t = ticket(); loading = true
        let authOwner = await auth.owner()
        do {
            let value = try await load(auth)
            let endingOwner = await auth.owner()
            guard isCurrent(t), authOwner == endingOwner else { return false }
            loading = false; apply(value); lastError = nil
            return true
        } catch {
            guard isCurrent(t) else { return false }
            loading = false; lastError = error as? BriefingsError ?? .unavailable
            return false
        }
    }

    func refreshPermission() async {
        accountChanged()
        let t = ticket(), value = await permissionStatus()
        guard isCurrent(t) else { return }
        permission = value
    }

    /// The explicit switch saves consent first. OS permission is asked only after a successful opt-in.
    @discardableResult
    func setEnabled(_ on: Bool) async -> Bool {
        accountChanged()
        guard canCallServer else { lastError = .signedOut; return false }
        guard pendingEnabled == nil else { return false }
        let t = ticket(); pendingEnabled = on; lastError = nil
        let language = appLanguage()
        var changes: [String: Any] = ["newsEnabled": on]
        if on {
            changes["acceptedConsentVersion"] = Self.consentVersion
            changes["language"] = language.language; changes["locale"] = language.locale
        }
        let saved = await patch(changes, ticket: t)
        guard isCurrent(t) else { return false }
        pendingEnabled = nil
        guard saved else { return false }
        if on, settings?.hasCurrentConsent == true {
            return await authorizeDelivery(ticket: t)
        }
        return true
    }

    /// A separate explicit action can recover a saved opt-in whose first OS prompt was interrupted.
    @discardableResult
    func authorizeDelivery() async -> Bool {
        accountChanged()
        guard canCallServer else { return false }
        let t = ticket()
        guard await refresh(), isCurrent(t), settings?.hasCurrentConsent == true else { return false }
        return await authorizeDelivery(ticket: t)
    }

    private func authorizeDelivery(ticket t: Ticket) async -> Bool {
        var status = await permissionStatus()
        guard isCurrent(t), canCallServer, settings?.hasCurrentConsent == true else { return false }
        if status == .notDetermined {
            status = await requestPermission()
            guard isCurrent(t), canCallServer, settings?.hasCurrentConsent == true else { return false }
        }
        permission = status
        if status.allowsDelivery { deliveryEnabled() }
        return true
    }

    /// No permission prompt here: foreground and account changes only read confirmed consent.
    func confirmedEnabled() async -> Bool {
        accountChanged()
        guard await refresh(), canCallServer else { return false }
        _ = await syncLanguage()
        return settings?.hasCurrentConsent == true
    }

    @discardableResult
    func syncLanguage() async -> Bool {
        accountChanged()
        guard canCallServer else { return false }
        let t = ticket()
        if settings == nil { _ = await refresh() }
        // A person who has never chosen news keeps the server's default-off state.
        guard isCurrent(t), let current = settings, current.consentVersion != nil else { return false }
        let language = appLanguage()
        guard current.language != language.language || current.locale != language.locale else { return true }
        return await patch(["language": language.language, "locale": language.locale], ticket: t)
    }

    private func patch(_ changes: [String: Any], ticket t: Ticket) async -> Bool {
        let previous = patchChain
        let work = Task { @MainActor [weak self] () -> Bool in
            await previous?.value
            guard let self, self.isCurrent(t), self.canCallServer else { return false }
            if self.settings == nil { _ = await self.refresh() }
            guard self.isCurrent(t), let revision = self.settings?.revision else { return false }
            let authOwner = await self.auth.owner()
            do {
                let value = try await self.save(self.auth, revision, changes)
                let endingOwner = await self.auth.owner()
                guard self.isCurrent(t), authOwner == endingOwner else { return false }
                self.apply(value); self.lastError = nil
                return true
            } catch {
                guard self.isCurrent(t) else { return false }
                let failure = error as? BriefingsError ?? .unavailable
                if case .conflict = failure { _ = await self.refresh() }
                guard self.isCurrent(t) else { return false }
                self.lastError = failure
                return false
            }
        }
        patchChain = Task { _ = await work.value }
        return await work.value
    }

    private func apply(_ value: NewsPushSettings) {
        guard value.revision >= (settings?.revision ?? 0) else { return }
        settings = value
    }
}
