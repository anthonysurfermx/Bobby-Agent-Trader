// The native half of the Núcleo (Nucleo/ARCHITECTURE.md R13, §2.3). ONE session owns
// the profile, the companion store and the voice for as long as the Núcleo is on
// screen, so no second store can clobber the award queue. The page asks; this answers
// from the app's real stores (companion, XP, streak, theses, island, account) and never
// from anything the page claims.
import AuthenticationServices
import Combine
import SwiftUI
import UIKit

/// Where the page goes next (§1.3).
enum NucleoPage: Equatable {
    case app, onboarding, onboardingRisk, contract

    var file: String {
        switch self {
        case .app: return "app.html"
        case .onboarding, .onboardingRisk: return "onboarding.html"
        case .contract: return "contract.html"
        }
    }

    var fragment: String? { self == .onboardingRisk ? "risk" : nil }

    /// `session.page` / `<body data-page>`.
    var name: String {
        switch self {
        case .app: return "app"
        case .onboarding, .onboardingRisk: return "onboarding"
        case .contract: return "contract"
        }
    }

    /// Onboarding until a companion is chosen and the (current) risk notice accepted; then the app.
    static func route(onboarded: Bool, companionId: String?, riskAccepted: Bool) -> NucleoPage {
        if !onboarded || companionId == nil { return .onboarding }
        if !riskAccepted { return .onboardingRisk }
        return .app
    }
}

/// Native screens the page may open as sheets (`openNative`).
enum NucleoRoute: String, Identifiable, CaseIterable {
    case squad, locker, isla, account, riskNotice
    var id: String { rawValue }
}

/// Native → page events (the web controller in the app, a recorder in tests).
@MainActor
protocol NucleoEmitting: AnyObject {
    func emit(_ name: String, _ payload: [String: Any])
    /// The page made its first `session` call: events may flow.
    func pageReady()
}

@MainActor
final class NucleoSession: ObservableObject {
    static let hintsKey = "nucleo.hints"
    static let hintPattern = #"^[a-z][A-Za-z0-9_.-]{0,31}$"#
    static let suggestionsCacheSeconds: TimeInterval = 300

    let profile: AgentProfile
    let companions: CompanionStore
    let voice: NeuralVoice
    let fixtures: Bool
    let desk: NucleoDesk
    let speech = NucleoSpeech()
    let nucleoVoice: NucleoVoice
    let haptics = NucleoHaptics()
    private let defaults: UserDefaults

    weak var emitter: NucleoEmitting?
    /// Load another page (finishOnboarding cross-fades to the app).
    var onRoute: ((NucleoPage) -> Void)?

    @Published var sheet: NucleoRoute?
    @Published private(set) var classicRequested = false

    private(set) var currentPage: String?
    private var cancellables = Set<AnyCancellable>()
    private var suggestionsCache: (at: Date, value: [String: Any])?
    private var vocabularyTask: Task<Void, Never>?
    private var bootSynced = false
    private var tornDown = false

    init(fixtures: Bool,
         profile: AgentProfile = AgentProfile(),
         companions: CompanionStore = CompanionStore(),
         voice: NeuralVoice? = nil,
         ledger: NucleoLedger = NucleoLedger(),
         defaults: UserDefaults = .standard) {
        self.fixtures = fixtures
        self.profile = profile
        self.companions = companions
        let voice = voice ?? NeuralVoice()
        self.voice = voice
        self.defaults = defaults
        desk = NucleoDesk(profile: profile, companions: companions, ledger: ledger, fixtures: fixtures)
        nucleoVoice = NucleoVoice(voice: voice)
        if fixtures {
            // Fixture mode is always the signed-out path: no ProgressSync, no island, no Apple.
            desk.isSignedIn = { false }
            desk.userID = { nil }
        }
        let emit: (String, [String: Any]) -> Void = { [weak self] name, payload in self?.emit(name, payload) }
        desk.emit = emit
        desk.sessionChanged = { [weak self] in self?.sessionChanged() }
        speech.emit = emit
        speech.willStart = { [weak self] in self?.nucleoVoice.stop() }
        nucleoVoice.emit = emit
        observeStores()
    }

    var signedIn: Bool { !fixtures && AccountSession.shared.isSignedIn }
    var onboarded: Bool { profile.onboarded && companions.companionId != nil }
    var page: NucleoPage { NucleoPage.route(onboarded: profile.onboarded, companionId: companions.companionId, riskAccepted: profile.acceptedRiskNotice) }

    func emit(_ name: String, _ payload: [String: Any]) {
        guard !tornDown else { return }
        emitter?.emit(name, payload)
    }

    // MARK: - Dispatch (§2.3)

    func dispatch(_ method: String, _ p: NucleoParams) async throws -> Any {
        guard !tornDown else { throw NucleoFault.internalError("torn down") }
        switch method {
        case "session":
            let page = try p.string("page", required: false, oneOf: ["app", "onboarding", "contract"])
            return pageStarted(page)
        case "roster":
            return roster()
        case "suggestions":
            return await suggestions()
        case "ask":
            return try await desk.ask(p)
        case "cancel":
            return desk.cancel()
        case "speech.permission":
            return speech.permission().json
        case "speech.requestPermission":
            let result = await speech.requestPermission().json
            sessionChanged()
            return result
        case "speech.start":
            return ["status": speech.start().rawValue]
        case "speech.stop":
            let cancel = try p.bool("cancel", required: false) ?? false
            return ["status": speech.stop(cancel: cancel).rawValue]
        case "speak":
            let id = try p.string("id", pattern: NucleoVoice.idPattern)!
            let text = try p.string("text")!
            guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw NucleoFault.invalid("text is empty") }
            return ["status": speak(id: id, text: text).rawValue]
        case "previewVoice":
            let id = try p.string("companionId", maxLength: 32)!
            guard let companion = bobbyCompanions.first(where: { $0.id == id }) else { throw NucleoFault.invalid("unknown companion") }
            return ["status": previewVoice(companion).rawValue]
        case "stopSpeaking":
            nucleoVoice.stop()
            return [String: Any]()
        case "setMuted":
            let muted = try p.bool("muted")!
            if muted { nucleoVoice.stop() }
            voice.isMuted = muted
            return sessionChanged()
        case "haptic":
            let kind = try p.string("kind", oneOf: NucleoHaptics.kinds)!
            haptics.play(kind)
            return [String: Any]()
        case "saveThesis":
            return try await desk.saveThesis(p)
        case "island":
            return await desk.island()
        case "theses":
            return desk.theses()
        case "record":
            return desk.record()
        case "setCompanion":
            let id = try p.string("id", maxLength: 32)!
            return try setCompanion(id)
        case "riskNotice":
            return riskNotice()
        case "acceptRisk":
            let version = try p.int("version")!
            return acceptRisk(version)
        case "signIn":
            return ["status": await signIn()]
        case "openNative":
            let route = try p.string("route", oneOf: Set(NucleoRoute.allCases.map(\.rawValue)))!
            return ["opened": openNative(NucleoRoute(rawValue: route)!)]
        case "openClassic":
            DispatchQueue.main.async { [weak self] in self?.requestClassic() }
            return [String: Any]()
        case "finishOnboarding":
            return finishOnboarding()
        case "markHint":
            let key = try p.string("key", pattern: Self.hintPattern)!
            return ["count": markHint(key)]
        case "log":
            let level = try p.string("level", oneOf: ["info", "warn", "error"])!
            let message = try p.string("message", maxLength: 300)!
#if DEBUG
            print("[Nucleo page] \(level): \(message)")
#else
            _ = (level, message)
#endif
            return [String: Any]()
        default:
            throw NucleoFault.unknownMethod(method)
        }
    }

    // MARK: - Session

    private var appVersion: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(short) (\(build))"
    }

    private var hints: [String: Int] {
        (defaults.dictionary(forKey: Self.hintsKey) as? [String: Int]) ?? [:]
    }

    func sessionJSON() -> [String: Any] {
        let c = companions.companion
        let companion: Any = c.map { c -> Any in
            ["id": c.id, "webId": Self.webId(c.id), "label": c.label, "palette": Self.palette(webId: Self.webId(c.id)),
             "voicePersona": c.voicePersona]
        } ?? NSNull()
        return [
            "v": 1, "page": NucleoDeskIO.orNull(currentPage), "firstRun": !onboarded, "onboarded": onboarded,
            "language": L.ttsLang, "localHour": Calendar.current.component(.hour, from: Date()),
            "companion": companion, "xp": companions.disciplineXP, "level": companions.nucleoLevel,
            "streak": companions.disciplineStreak, "signedIn": signedIn,
            "riskAccepted": profile.acceptedRiskNotice, "riskVersion": RiskNotice.currentVersion,
            "muted": voice.isMuted, "reducedMotion": UIAccessibility.isReduceMotionEnabled,
            "mic": speech.permission().json, "hints": hints,
            "pendingRead": desk.pendingRead() ?? NSNull(), "fixtures": fixtures, "platform": "ios", "appVersion": appVersion,
        ]
    }

    /// The page's first call: it is ready for events.
    private func pageStarted(_ page: String?) -> [String: Any] {
        if let page { currentPage = page }
        emitter?.pageReady()
        bootOnce()
        return sessionJSON()
    }

    /// After consent only (R11): the dictation vocabulary, the account check and one sync.
    private func bootOnce() {
        guard profile.acceptedRiskNotice else { return }
        if vocabularyTask == nil {
            vocabularyTask = Task { [weak self] in
                let words = await BobbyAPI.dictationVocabulary()
                self?.speech.vocabulary = words
            }
        }
        guard !bootSynced, signedIn else { return }
        bootSynced = true
        Task { [weak self] in
            await AccountSession.shared.checkAppleCredential()
            guard let self, self.signedIn else { return }
            await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
        }
    }

    @discardableResult
    func sessionChanged() -> [String: Any] {
        let json = sessionJSON()
        emit("session.changed", json)
        return json
    }

    // MARK: - Companions

    static func webId(_ id: String) -> String { id == "orb" ? "bobby" : id }

    /// id → palette, from the generated `companions-meta.json` (art-free).
    static let palettes: [String: String] = {
        guard let url = Bundle.main.url(forResource: "Nucleo", withExtension: nil)?.appendingPathComponent("companions-meta.json"),
              let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let list = obj["companions"] as? [[String: Any]] else { return [:] }
        var out: [String: String] = [:]
        for c in list { if let id = c["id"] as? String, let palette = c["palette"] as? String { out[id] = palette } }
        return out
    }()

    static func palette(webId: String) -> String { palettes[webId] ?? "matrix" }

    func roster() -> [String: Any] {
        ["companions": bobbyCompanions.map { c -> [String: Any] in
            ["id": c.id, "webId": Self.webId(c.id), "label": c.label, "role": c.role, "selectLine": c.selectLine,
             "requiredLevel": c.requiredLevel, "voicePersona": c.voicePersona, "palette": Self.palette(webId: Self.webId(c.id)),
             "unlocked": companions.isUnlocked(c) || companions.companionId == c.id]
        }]
    }

    /// Exactly `CompanionOnboarding.commitCompanion`.
    func setCompanion(_ id: String) throws -> [String: Any] {
        guard let c = bobbyCompanions.first(where: { $0.id == id }), companions.isUnlocked(c) || companions.companionId == id
        else { throw NucleoFault.invalid("locked or unknown companion") }
        companions.companionId = c.id
        profile.voiceId = c.voicePersona
        profile.auraText = AuraForge.keyword(nearest: c.hue)
        if signedIn, companions.profileNeedsSync {
            Task { [weak self] in
                guard let self else { return }
                await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
            }
        }
        return sessionChanged()
    }

    // MARK: - Suggestions

    func suggestions() async -> [String: Any] {
        let quick = DeskMemory().quickAccess(fallback: BobbyViewModel.defaultQuickAccess).map { ["symbol": $0] }
        // R11: before consent nothing reaches the network; the local row is all there is.
        guard profile.acceptedRiskNotice else { return ["quickAccess": quick, "movers": [Any]()] }
        if let cache = suggestionsCache, Date().timeIntervalSince(cache.at) < Self.suggestionsCacheSeconds {
            var value = cache.value
            value["quickAccess"] = quick
            return value
        }
        let movers = await BobbyAPI.topMovers(limit: 3).map { ["symbol": $0.symbol, "name": $0.name, "changePct": $0.changePct] as [String: Any] }
        let value: [String: Any] = ["quickAccess": quick, "movers": movers]
        suggestionsCache = (Date(), value)
        return value
    }

    // MARK: - Voice

    func speak(id: String, text: String) -> NucleoVoice.Status {
        // R11: the network voice sends the text out for speech; before consent the page reads silently.
        guard profile.acceptedRiskNotice else { return .muted }
        return nucleoVoice.speak(id: id, text: text, voiceId: profile.voiceId, persona: companions.companion?.voicePersona, vibe: profile.vibeId)
    }

    /// The bundled pick line (`select-<id>-<en|es>`): free, instant, no network.
    func previewVoice(_ c: Companion) -> NucleoVoice.Status {
        let clip = "select-\(c.id)-\(L.ttsLang)"
        if !profile.acceptedRiskNotice, Bundle.main.url(forResource: clip, withExtension: "mp3") == nil { return .muted }
        return nucleoVoice.speakClip(id: "preview-\(c.id)", clip: clip, fallbackText: c.selectLine, persona: c.voicePersona)
    }

    // MARK: - Risk notice

    func riskNotice() -> [String: Any] {
        ["version": RiskNotice.currentVersion,
         "statements": RiskNotice.statements(spanish: L.isSpanish).map { ["title": $0.title, "body": $0.body] }]
    }

    func acceptRisk(_ version: Int) -> [String: Any] {
        guard version == RiskNotice.currentVersion else { return ["accepted": false, "version": RiskNotice.currentVersion] }
        profile.riskNoticeVersion = RiskNotice.currentVersion
        if signedIn {
            Task { [weak self] in
                guard let self else { return }
                await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
            }
        }
        bootOnce()
        sessionChanged()
        return ["accepted": true, "version": RiskNotice.currentVersion]
    }

    // MARK: - Onboarding

    func finishOnboarding() -> [String: Any] {
        var missing: [String] = []
        if companions.companionId == nil { missing.append("companion") }
        if !profile.acceptedRiskNotice { missing.append("risk") }
        guard missing.isEmpty else { return ["status": "incomplete", "missing": missing] }
        profile.onboarded = true
        if signedIn {
            Task { [weak self] in
                guard let self else { return }
                await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
            }
        }
        // Reply first, then cross-fade to the daily app.
        DispatchQueue.main.async { [weak self] in self?.onRoute?(.app) }
        return ["next": "app"]
    }

    func markHint(_ key: String) -> Int {
        var all = hints
        let count = (all[key] ?? 0) + 1
        all[key] = count
        defaults.set(all, forKey: Self.hintsKey)
        return count
    }

    // MARK: - Sign in with Apple

    private var appleSignIn: NucleoAppleSignIn?

    func signIn() async -> String {
        guard !fixtures, profile.acceptedRiskNotice, appleSignIn == nil else { return "unavailable" }
        if AccountSession.shared.isSignedIn { return "signedIn" }
        let flow = NucleoAppleSignIn()
        appleSignIn = flow
        let result = await flow.run()
        appleSignIn = nil
        let account = AccountSession.shared
        await account.completeApple(result)
        if account.isSignedIn {
            await ProgressSync.shared.sync(store: companions, profile: profile)
            sessionChanged()
            return "signedIn"
        }
        if case let .failure(error) = result, (error as? ASAuthorizationError)?.code == .canceled {
            account.lastError = nil
            return "cancelled"
        }
        return "failed"
    }

    // MARK: - Native sheets

    private var openSheet: NucleoRoute?

    func openNative(_ route: NucleoRoute) -> Bool {
        guard sheet == nil, openSheet == nil else { return false }
        nucleoVoice.stop()
        speech.cancel()
        openSheet = route
        sheet = route
        emit("native.sheet", ["route": route.rawValue, "state": "open"])
        return true
    }

    /// The sheet went away (swipe, close button, or its own dismiss).
    func sheetDismissed() {
        guard let route = openSheet else { return }
        openSheet = nil
        sheet = nil
        sheetClosed(route)
    }

    private func sheetClosed(_ route: NucleoRoute) {
        emit("native.sheet", ["route": route.rawValue, "state": "closed"])
        if route == .isla, signedIn {
            // A thesis closed on the island earns XP: bring the page up to date (as the classic desk does).
            Task { [weak self] in
                guard let self else { return }
                await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
                self.sessionChanged()
            }
        }
        sessionChanged()
    }

    // MARK: - Lifecycle

    func appBecameActive() {
        emit("app.state", ["state": "active"])
        if signedIn { Task { await AccountSession.shared.checkAppleCredential() } }
        sessionChanged()
    }

    /// The mic closes and the voice stops; an in-flight read keeps going.
    func appWentBackground() {
        speech.cancel()
        nucleoVoice.stop()
        emit("app.state", ["state": "background"])
    }

    private func requestClassic() {
        guard !classicRequested else { return }
        classicRequested = true
    }

    /// Before the classic app appears: nothing of this session may keep writing.
    func teardown() {
        guard !tornDown else { return }
        speech.cancel()
        nucleoVoice.teardown()
        desk.teardown()
        vocabularyTask?.cancel()
        cancellables.removeAll()
        tornDown = true
        emitter = nil
        onRoute = nil
    }

    private func observeStores() {
        // Signing out detaches the counters from the account (as ContentView does).
        AccountSession.shared.$session
            .map { $0?.userId }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] userId in
                guard let self, !self.fixtures else { return }
                if userId == nil { self.companions.unbind() }
                self.sessionChanged()
            }
            .store(in: &cancellables)
        // A sync changed XP or streak (server wins): tell the page.
        Publishers.Merge(companions.$disciplineXP.map { _ in () }, companions.$disciplineStreak.map { _ in () })
            .dropFirst(2)
            .debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)
            .sink { [weak self] in self?.sessionChanged() }
            .store(in: &cancellables)
    }
}

/// One Sign in with Apple sheet, with the app's nonce (`AccountSession.prepareAppleRequest`).
@MainActor
final class NucleoAppleSignIn: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var continuation: CheckedContinuation<Result<ASAuthorization, Error>, Never>?
    private var controller: ASAuthorizationController?

    func run() async -> Result<ASAuthorization, Error> {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        AccountSession.shared.prepareAppleRequest(request)
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        return await withCheckedContinuation { continuation in
            self.continuation = continuation
            controller.performRequests()
        }
    }

    private func finish(_ result: Result<ASAuthorization, Error>) {
        continuation?.resume(returning: result)
        continuation = nil
        controller = nil
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        MainActor.assumeIsolated { finish(.success(authorization)) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        MainActor.assumeIsolated { finish(.failure(error)) }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first.map { UIWindow(windowScene: $0) } ?? UIWindow()
        }
    }
}
