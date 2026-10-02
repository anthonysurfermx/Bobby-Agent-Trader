// Bobby Pro market briefings — account-bound client state (build 53).
// The NucleoLevelCenter pattern: a @MainActor singleton whose network calls are injectable closures, so
// tests can suspend an answer and switch account in the middle. Invariants:
//  - Nothing here is stored on the phone: the settings belong to the account (server, revisioned).
//  - A switch is persisted ONLY when the server answers: the UI shows the pending target meanwhile and
//    simply falls back to the confirmed value on failure (nothing to roll back locally).
//  - 409 refetches and shows the server's value; it never re-sends the change on its own.
//  - An account change clears everything at once, and every answer is checked against its account
//    (owner + generation + this center's epoch + the auth epoch) and against the newest revision seen.
//  - iOS permission is separate from the account selection: a denial still saves the switch and shows
//    "blocked" with the Settings link. The OS prompt appears only when the person enables a briefing.
//  - No network before the risk notice is accepted (R11) or without an account.
import Combine
import Foundation
import UIKit

@MainActor
final class BriefingsCenter: ObservableObject {
    static let shared = BriefingsCenter()

    @Published private(set) var settings: BriefingSettings?
    /// nil = not known yet (never read as Pro).
    @Published private(set) var eligiblePro: Bool?
    @Published private(set) var schedules: BriefingSchedules?
    @Published private(set) var options: BriefingOptions?
    @Published private(set) var loading = false
    /// Cadence switches flipped by the person that the server has not confirmed yet (the target value).
    @Published private(set) var pendingCadences: [BriefingCadence: Bool] = [:]
    /// Other settings fields being saved: "language", "companionId", "assets", "analysisConsent", "audioConsent".
    @Published private(set) var savingFields: Set<String> = []
    @Published private(set) var lastError: BriefingsError?
    /// iOS notification permission on this device (not an account setting).
    @Published private(set) var permission: PushPermission = .notDetermined
    @Published private(set) var inbox: [BriefingInboxItem] = []
    @Published private(set) var latest: [BriefingLatest] = []
    @Published private(set) var nextCursor: String?
    @Published private(set) var inboxLoaded = false
    @Published private(set) var inboxError: BriefingsError?

    var auth: BobbyMeterAuth = .account
    var currentUser: () -> String? = { AccountSession.shared.session?.userId }
    var currentGeneration: () -> UUID = { AccountSession.shared.generation }
    var riskAccepted: () -> Bool = { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion }
    /// The app's language ("en" | "es"), mirrored into the account on the first enable.
    var appLanguage: () -> String = { L.isSpanish ? "es" : "en" }
    /// The companion chosen on this phone (mirrored on the first enable when the server allows it).
    var currentCompanion: () -> String? = { UserDefaults.standard.string(forKey: "companion.id") }
    var load: (BobbyMeterAuth) async throws -> BriefingSettingsSnapshot = { auth in try await BriefingsAPI(auth: auth).settings() }
    var save: (BobbyMeterAuth, _ revision: Int, _ changes: [String: Any]) async throws -> BriefingSettingsSnapshot = { auth, revision, changes in
        try await BriefingsAPI(auth: auth).patchSettings(revision: revision, changes: changes)
    }
    var loadInbox: (BobbyMeterAuth, BriefingCadence?, String?) async throws -> BriefingInboxPage = { auth, cadence, cursor in
        try await BriefingsAPI(auth: auth).inbox(cadence: cadence, cursor: cursor)
    }
    var permissionStatus: () async -> PushPermission = { await PushRegistrar.shared.currentPermission() }
    var requestPermission: () async -> PushPermission = { await PushRegistrar.shared.requestPermission() }
    /// After a confirmed enable with delivery allowed: ask iOS for the APNs token.
    var deliveryEnabled: () -> Void = { PushRegistrar.shared.register() }

    private var owner: String?
    private var ownerGeneration: UUID?
    /// Bumped on every account change: an answer started under an older epoch is discarded.
    private var epoch = UUID()
    private var inboxRequest = UUID()
    private var patchChain: Task<Void, Never>?
    /// The companion the person picked last (applied on the first enable when settings were not loaded yet).
    private var desiredCompanion: String?
    private var cancellables = Set<AnyCancellable>()

    init(observeAccount: Bool = true) {
        owner = currentUser()
        ownerGeneration = currentGeneration()
        guard observeAccount else { return }
        // Posted after the new session is assigned, synchronously on the main actor: cleared at once.
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.accountChanged() } }
            .store(in: &cancellables)
        // Permission can change in Settings while the app is away (a local read: no network, no prompt).
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            .sink { [weak self] _ in Task { @MainActor in await self?.refreshPermission() } }
            .store(in: &cancellables)
    }

    // MARK: derived state

    /// What the switch shows: the pending target while saving, else the confirmed server value.
    func isOn(_ cadence: BriefingCadence) -> Bool { pendingCadences[cadence] ?? settings?.isOn(cadence) ?? false }
    func isSaving(_ cadence: BriefingCadence) -> Bool { pendingCadences[cadence] != nil }

    /// A briefing is selected for this account but iOS will not show it ("Notifications blocked in iOS").
    var deliveryBlocked: Bool { permission == .denied && (settings?.anyCadenceOn ?? false) }

    static var systemSettingsURL: URL? { URL(string: UIApplication.openSettingsURLString) }

    func openSystemSettings() {
        guard let url = Self.systemSettingsURL else { return }
        UIApplication.shared.open(url)
    }

    // MARK: account

    /// Clears everything immediately when the account (or its epoch) changed, including offline.
    func accountChanged(force: Bool = false) {
        guard force || owner != currentUser() || ownerGeneration != currentGeneration() else { return }
        owner = currentUser()
        ownerGeneration = currentGeneration()
        epoch = UUID()
        inboxRequest = UUID()
        patchChain = nil
        desiredCompanion = nil
        settings = nil
        eligiblePro = nil
        schedules = nil
        options = nil
        loading = false
        pendingCadences = [:]
        savingFields = []
        lastError = nil
        inbox = []
        latest = []
        nextCursor = nil
        inboxLoaded = false
        inboxError = nil
    }

    private struct Ticket {
        let epoch: UUID
        let owner: String?
        let generation: UUID
    }

    private func ticket() -> Ticket { Ticket(epoch: epoch, owner: currentUser(), generation: currentGeneration()) }

    private func isCurrent(_ t: Ticket) -> Bool {
        !Task.isCancelled && t.epoch == epoch && t.owner == currentUser() && t.generation == currentGeneration()
    }

    private var canCallServer: Bool { riskAccepted() && currentUser() != nil }

    // MARK: settings

    /// GET /api/briefing-settings. False when it could not be read for this account.
    @discardableResult
    func refresh() async -> Bool {
        accountChanged()
        defer { accountChanged() }
        guard canCallServer else { return false }
        let t = ticket()
        loading = true
        let authOwner = await auth.owner()
        do {
            let snapshot = try await load(auth)
            let endingAuthOwner = await auth.owner()
            guard isCurrent(t), authOwner == endingAuthOwner else { return false }
            loading = false
            apply(snapshot)
            return true
        } catch {
            guard isCurrent(t) else { return false }
            loading = false
            lastError = error as? BriefingsError ?? .unavailable
            return false
        }
    }

    func refreshPermission() async {
        let t = ticket()
        let status = await permissionStatus()
        guard t.epoch == epoch else { return }
        permission = status
    }

    /// Flip one cadence. Enabling asks iOS first when it never asked; a denial still saves the choice.
    @discardableResult
    func setCadence(_ cadence: BriefingCadence, on: Bool) async -> Bool {
        accountChanged()
        guard canCallServer else { lastError = .signedOut; return false }
        guard pendingCadences[cadence] == nil else { return false }
        let t = ticket()
        pendingCadences[cadence] = on
        lastError = nil
        if on {
            var status = await permissionStatus()
            guard isCurrent(t) else { return false }
            if status == .notDetermined {
                status = await requestPermission()
                guard isCurrent(t) else { return false }
            }
            permission = status
        }
        if settings == nil { await refresh() }
        guard isCurrent(t), let current = settings else {
            if isCurrent(t) { pendingCadences[cadence] = nil }
            return false
        }
        var changes: [String: Any] = [cadence.settingsKey: on]
        if on && !current.anyCadenceOn {
            // First enable: the report speaks the app's language and the phone's companion.
            let language = appLanguage()
            if BriefingSettings.languages.contains(language), language != current.language { changes["language"] = language }
            if let companion = desiredCompanion ?? currentCompanion(), companion != current.companionId, companionAllowed(companion) {
                changes["companionId"] = companion
            }
        }
        let result = await patch(changes, ticket: t)
        guard isCurrent(t) else { return false }
        pendingCadences[cadence] = nil
        guard case .success(let snapshot) = result else { return false }
        if on, snapshot.settings.isOn(cadence), permission.allowsDelivery { deliveryEnabled() }
        return true
    }

    /// Mirror the phone's companion into the account (called when the person picks one). Saved only when
    /// it differs; before the settings are loaded it is remembered for the first enable.
    @discardableResult
    func mirrorCompanion(_ id: String) async -> Bool {
        accountChanged()
        desiredCompanion = id
        guard canCallServer, let current = settings, current.companionId != id, companionAllowed(id) else { return false }
        return await update(field: "companionId", changes: ["companionId": id])
    }

    @discardableResult
    func setLanguage(_ language: String) async -> Bool {
        accountChanged()
        guard BriefingSettings.languages.contains(language), settings?.language != language else { return false }
        return await update(field: "language", changes: ["language": language])
    }

    @discardableResult
    func setAssets(_ assets: [String]) async -> Bool {
        accountChanged()
        return await update(field: "assets", changes: ["assets": assets])
    }

    /// AI analysis consent (memory may shape reports). Enabling sends the current server version.
    @discardableResult
    func setAnalysisConsent(_ on: Bool) async -> Bool { await setConsent("analysis", on: on) }

    /// Audio consent (narration audio is synthesized for this account's reports).
    @discardableResult
    func setAudioConsent(_ on: Bool) async -> Bool { await setConsent("audio", on: on) }

    private func setConsent(_ kind: String, on: Bool) async -> Bool {
        accountChanged()
        guard canCallServer else { lastError = .signedOut; return false }
        let t = ticket()
        if options == nil { await refresh() }
        guard isCurrent(t) else { return false }
        var changes: [String: Any] = ["\(kind)ConsentEnabled": on]
        if on {
            let version = kind == "analysis" ? options?.analysisConsentVersion : options?.audioConsentVersion
            guard let version else { lastError = .consentRequired; return false }
            changes[kind == "analysis" ? "acceptedAnalysisConsentVersion" : "acceptedAudioConsentVersion"] = version
        }
        return await update(field: "\(kind)Consent", changes: changes, ticket: t)
    }

    private func update(field: String, changes: [String: Any], ticket given: Ticket? = nil) async -> Bool {
        guard canCallServer else { lastError = .signedOut; return false }
        let t = given ?? ticket()
        savingFields.insert(field)
        let result = await patch(changes, ticket: t)
        guard isCurrent(t) else { return false }
        savingFields.remove(field)
        if case .success = result { return true }
        return false
    }

    private func companionAllowed(_ id: String) -> Bool {
        guard let allowed = options?.companions, !allowed.isEmpty else { return true }   // the server validates
        return allowed.contains(id)
    }

    /// PATCHes run one after another: each one reads the revision the previous answer produced.
    private func patch(_ changes: [String: Any], ticket t: Ticket) async -> Result<BriefingSettingsSnapshot, BriefingsError> {
        let previous = patchChain
        let work = Task { @MainActor [weak self] () -> Result<BriefingSettingsSnapshot, BriefingsError> in
            await previous?.value
            guard let self else { return .failure(.unavailable) }
            return await self.sendPatch(changes, ticket: t)
        }
        patchChain = Task { _ = await work.value }
        return await work.value
    }

    private func sendPatch(_ changes: [String: Any], ticket t: Ticket) async -> Result<BriefingSettingsSnapshot, BriefingsError> {
        guard isCurrent(t) else { return .failure(.unavailable) }
        if settings == nil { await refresh() }
        guard isCurrent(t), let revision = settings?.revision else { return .failure(lastError ?? .unavailable) }
        let authOwner = await auth.owner()
        do {
            let snapshot = try await save(auth, revision, changes)
            let endingAuthOwner = await auth.owner()
            guard isCurrent(t), authOwner == endingAuthOwner else { return .failure(.unavailable) }
            apply(snapshot)
            lastError = nil
            return .success(snapshot)
        } catch {
            guard isCurrent(t) else { return .failure(.unavailable) }
            let failure = error as? BriefingsError ?? .unavailable
            if case .conflict = failure {
                // Someone else saved first: show their value; the person decides again.
                await refresh()
                guard isCurrent(t) else { return .failure(.unavailable) }
            }
            lastError = failure
            return .failure(failure)
        }
    }

    /// Applies a server snapshot unless an answer with a newer revision is already shown.
    func apply(_ snapshot: BriefingSettingsSnapshot) {
        accountChanged()
        if let shown = settings, snapshot.settings.revision < shown.revision { return }
        settings = snapshot.settings
        eligiblePro = snapshot.eligiblePro
        if let schedules = snapshot.schedules { self.schedules = schedules }
        if let options = snapshot.options { self.options = options }
    }

    // MARK: inbox

    /// The newest ready reports (replaces the list). Pro is required; the error says when it is not.
    @discardableResult
    func refreshInbox(cadence: BriefingCadence? = nil) async -> Bool {
        await fetchInbox(cadence: cadence, cursor: nil)
    }

    /// The next page after `nextCursor`.
    @discardableResult
    func loadMoreInbox(cadence: BriefingCadence? = nil) async -> Bool {
        guard let cursor = nextCursor else { return false }
        return await fetchInbox(cadence: cadence, cursor: cursor)
    }

    private func fetchInbox(cadence: BriefingCadence?, cursor: String?) async -> Bool {
        accountChanged()
        defer { accountChanged() }
        guard canCallServer else { return false }
        let t = ticket()
        let request = UUID()
        inboxRequest = request
        let authOwner = await auth.owner()
        do {
            let page = try await loadInbox(auth, cadence, cursor)
            let endingAuthOwner = await auth.owner()
            guard isCurrent(t), request == inboxRequest, authOwner == endingAuthOwner else { return false }
            inbox = cursor == nil ? page.items : inbox + page.items.filter { item in !inbox.contains { $0.id == item.id } }
            latest = page.latest
            nextCursor = page.nextCursor
            inboxLoaded = true
            inboxError = nil
            return true
        } catch {
            guard isCurrent(t), request == inboxRequest else { return false }
            inboxError = error as? BriefingsError ?? .unavailable
            return false
        }
    }
}
