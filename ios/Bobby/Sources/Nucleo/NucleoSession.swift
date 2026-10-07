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

/// Native screens shown as sheets over the page. `openNative` opens every route but `paywall`,
/// which only the awaited `paywall` method presents (§8.4), and `briefing`, which only a drained
/// notification tap opens (build 53). The 1.8 screens (`credits`, `theses`, `memory`, `reminders`)
/// open from a nudge tap or the profile, never from a page call.
enum NucleoRoute: String, Identifiable, CaseIterable {
    case squad, locker, isla, account, riskNotice, paywall, levels, invite, briefing
    case credits, theses, thesisEditor, thesisReview, memory, memoryConsent, reminders, briefingSettings, followUp
    var id: String { rawValue }

    static let nativeOnly: Set<NucleoRoute> = [.paywall, .invite, .briefing, .credits, .theses, .thesisEditor, .thesisReview,
                                               .memory, .memoryConsent, .reminders, .briefingSettings, .followUp]
    static let openable: Set<String> = Set(allCases.filter { !nativeOnly.contains($0) }.map(\.rawValue))
}

/// What a briefing notification tap waits for before its report opens, read live at every drain.
/// Defaults read the session's real state; tests replace single pieces.
struct BriefingTapGate {
    var appActive: () -> Bool
    var signedIn: () -> Bool
    var deskBusy: () -> Bool
    var listening: () -> Bool
    /// The page's voice line (or any Bobby narration) is speaking.
    var narrating: () -> Bool
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
    let speech: NucleoSpeech
    let nucleoVoice: NucleoVoice
    let haptics = NucleoHaptics()
    private let defaults: UserDefaults

    weak var emitter: NucleoEmitting?
    /// Load another page (finishOnboarding cross-fades to the app).
    var onRoute: ((NucleoPage) -> Void)?

    @Published var sheet: NucleoRoute?
    @Published private(set) var classicRequested = false
    let notch = NucleoNotch()
    /// The briefing the `.briefing` sheet shows (set only when a tap is drained).
    @Published private(set) var selectedBriefId: String?
    /// Briefing notification taps (BobbyAppDelegate stores them; this session drains them once).
    let briefingIntent: BriefingIntent
    /// Thesis reminder taps (1.8), drained through the same gate (Reminders/ReminderIntent.swift).
    let reminderIntent: ReminderIntent
    /// Follow-up taps (1.8, V18/Harness), drained through the same gate.
    let harnessIntent: HarnessIntent
    /// The harness this session feeds and draws from. Nil in fixture mode and in the unit-test host
    /// (suites that test it pass their own).
    let harness: HarnessCenter?
    /// Whose thesis book a reminder tap is read against; tests stand in for the signed-in account.
    var reminderOwner: (() -> String?)?
    var briefingGate: BriefingTapGate!
    /// Pause between a sheet going away and the next one presenting (SwiftUI dismissal animation).
    var briefingSheetDelay: TimeInterval = 0.4

    private(set) var currentPage: String?
    private var cancellables = Set<AnyCancellable>()
    private var suggestionsCache: (at: Date, value: [String: Any])?
    private var vocabularyTask: Task<Void, Never>?
    private var bootSynced = false
    private var levelsRequested = false
    private var tornDown = false
    private var accountGeneration: UUID?
    private var accountUserID: String?
    private var consentGeneration = UUID()

    init(fixtures: Bool,
         profile: AgentProfile = AgentProfile(),
         companions: CompanionStore = CompanionStore(),
         voice: NeuralVoice? = nil,
         speech: NucleoSpeech? = nil,
         ledger: NucleoLedger = NucleoLedger(),
         defaults: UserDefaults = .standard,
         briefingIntent: BriefingIntent? = nil,
         reminderIntent: ReminderIntent? = nil,
         harnessIntent: HarnessIntent? = nil,
         harness: HarnessCenter? = nil) {
        self.fixtures = fixtures
        self.briefingIntent = briefingIntent ?? .shared
        self.reminderIntent = reminderIntent ?? .shared
        self.harnessIntent = harnessIntent ?? .shared
        self.harness = harness ?? (fixtures || BobbyApp.isUnitTestHost ? nil : .shared)
        self.profile = profile
        self.companions = companions
        let voice = voice ?? NeuralVoice()
        self.voice = voice
        self.speech = speech ?? NucleoSpeech(defaults: defaults)
        let speech = self.speech
        self.defaults = defaults
        desk = NucleoDesk(profile: profile, companions: companions, ledger: ledger, fixtures: fixtures)
        nucleoVoice = NucleoVoice(voice: voice)
        if fixtures {
            // Fixture mode is always the signed-out path: no ProgressSync, no island, no Apple, no bearer.
            desk.isSignedIn = { false }
            desk.userID = { nil }
            desk.meterAuth = .none
            NucleoLevelCenter.shared.auth = .none
        } else {
            NucleoLevelCenter.shared.auth = .account
        }
        let emit: (String, [String: Any]) -> Void = { [weak self] name, payload in self?.emit(name, payload) }
        desk.emit = emit
        desk.debateStarted = { [weak self] level in self?.notch.debating(level) }
        desk.askFinished = { [weak self] result in
            self?.notch.finished(result)
            self?.readDelivered(result)
        }
        desk.debateEvent = { [weak self] event in self?.notch.live(event) }
        // A Bobby-authored question was picked: the harness counts it (only while it may record), by asset.
        desk.nextQuestionPicked = { [weak self] symbol in self?.harness?.notePicked(symbol: symbol) }
        desk.sessionChanged = { [weak self] in self?.sessionChanged() }
        speech.emit = { [weak self] name, payload in
            self?.emit(name, payload)
            // The mic closed: a waiting briefing tap may open now.
            if name == "speech.state", payload["state"] as? String == "stopped" { self?.scheduleBriefingDrain() }
        }
        speech.willStart = { [weak self] in self?.nucleoVoice.stop() }
        speech.confirmAppleService = { [weak self] in await self?.confirmAppleSpeechService() ?? false }
        nucleoVoice.emit = emit
        briefingGate = BriefingTapGate(
            appActive: { UIApplication.shared.applicationState == .active },
            signedIn: { [weak self] in self?.signedIn ?? false },
            deskBusy: { [weak self] in self?.desk.isBusy ?? false },
            listening: { [weak self] in self?.speech.isListening ?? false },
            narrating: { [weak self] in (self?.nucleoVoice.isActive ?? false) || (self?.voice.speaking ?? false) })
        // Report screens narrate through this session's voice (process-wide factory). Fixture mode is signed
        // out, and the unit-test host keeps the silent default.
        if !fixtures, !BobbyApp.isUnitTestHost {
            BriefingPlaybackFactory.make = { [weak self] in self?.makeBriefingPlayback() ?? AnyBriefingPlayback(NoBriefingPlayback()) }
        }
        // 1.8: showings and taps of a nudge are counted for the account on screen (fixtures are signed out).
        if !BobbyApp.isUnitTestHost { NudgeCenter.shared.owner = fixtures ? nil : AccountSession.shared.session?.userId }
        // 1.8: the harness has a new line for the glass (a price arrived, a follow-up was opened).
        self.harness?.changed = { [weak self] in self?.sessionChanged() }
        observeStores()
        synchronizeAccountState()
    }

    var signedIn: Bool { !fixtures && AccountSession.shared.isSignedIn }
    var onboarded: Bool { profile.onboarded && companions.companionId != nil }
    var page: NucleoPage { NucleoPage.route(onboarded: profile.onboarded, companionId: companions.companionId, riskAccepted: profile.acceptedRiskNotice) }

    func emit(_ name: String, _ payload: [String: Any]) {
        guard !tornDown else { return }
        if name == "ask.stage" { notch.stage(payload) }
        emitter?.emit(name, payload)
    }

    // MARK: - Dispatch (§2.3)

    func dispatch(_ method: String, _ p: NucleoParams) async throws -> Any {
        guard !tornDown else { throw NucleoFault.internalError("torn down") }
        synchronizeAccountState()
        // Any page call may end what kept a briefing tap waiting (a read, the mic, a voice line).
        defer { scheduleBriefingDrain() }
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
        case "read.rendered":
            return try desk.readRendered(p)
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
            let saved = try await desk.saveThesis(p)
            if saved["status"] as? String == "saved", let requestId = try p.string("requestId", required: false) {
                NudgeCenter.shared.noteSaved(requestId: requestId)
                if let symbol = desk.readSummary(requestId: requestId)?.symbol {
                    harness?.noteSaved(symbol: symbol, horizonHours: Self.chosenHorizon(saved: saved, asked: try p.int("horizonHours", required: false)))
                }
                sessionChanged()
            }
            return saved
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
            let route = try p.string("route", oneOf: NucleoRoute.openable)!
            return ["opened": openNative(NucleoRoute(rawValue: route)!)]
        case "paywall":
            return await paywall()
        case "openClassic":
#if DEBUG
            DispatchQueue.main.async { [weak self] in self?.requestClassic() }
            return [String: Any]()
#else
            // Release has no way out of the Núcleo (App Review 2.3.1: no hidden features).
            throw NucleoFault.unknownMethod(method)
#endif
        case "finishOnboarding":
            return finishOnboarding()
        case "markHint":
            let key = try p.string("key", pattern: Self.hintPattern)!
            return ["count": markHint(key)]
        case "nudge.seen":
            let id = try p.string("id", pattern: NucleoNudge.idPattern)!
            let count = NudgeCenter.shared.seen(id)
            scheduleNudgeRefresh(for: id)
            return ["count": count, "active": NudgeCenter.shared.isCurrent(id) && NudgeCenter.shared.eligible(id, at: NudgeCenter.shared.now())]
        case "nudge.act":
            let id = try p.string("id", pattern: NucleoNudge.idPattern)!
            let status = await nudgeTapped(id)
            return ["status": status]
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
        synchronizeAccountState()
        let c = companions.companion
        let companion: Any = c.map { c -> Any in
            ["id": c.id, "webId": Self.webId(c.id), "label": c.label, "palette": Self.palette(webId: Self.webId(c.id)),
             "voicePersona": c.voicePersona]
        } ?? NSNull()
        return [
            "v": 1, "page": NucleoDeskIO.orNull(currentPage), "firstRun": !onboarded, "onboarded": onboarded,
            "language": L.ttsLang, "locale": L.localeIdentifier, "country": L.country ?? NSNull() as Any, "localHour": Calendar.current.component(.hour, from: Date()),
            "companion": companion, "xp": companions.disciplineXP, "level": companions.nucleoLevel,
            "streak": companions.disciplineStreak, "signedIn": signedIn,
            "riskAccepted": profile.acceptedRiskNotice, "riskVersion": RiskNotice.currentVersion,
            "muted": voice.isMuted, "reducedMotion": UIAccessibility.isReduceMotionEnabled,
            "mic": speech.permission().json, "hints": hints,
            "pendingRead": desk.pendingRead() ?? NSNull(), "fixtures": fixtures, "platform": "ios", "appVersion": appVersion,
            "analysisLevel": NucleoLevelCenter.shared.level.pageJSON,
            "nudge": currentNudge().map { $0.json as Any } ?? NSNull(),
        ]
    }

    // MARK: - The nudge (1.8)

    /// Nudges are off in fixture mode (store shots and UI suites read a fixed page) unless a test turns them on.
    var nudgesEnabled: Bool?

    /// One line and one button for the app page, or nil: after consent only, never under a sheet.
    func currentNudge() -> NucleoNudge? {
        guard glassIsFreeForANudge else { NudgeCenter.shared.withhold(); return nil }
        return NudgeCenter.shared.current(NudgeCenter.shared.moment(signedIn: signedIn))
    }

    private var glassIsFreeForANudge: Bool {
        (nudgesEnabled ?? !fixtures) && profile.acceptedRiskNotice && onboarded && currentPage == NucleoPage.app.name
            && sheet == nil && openSheet == nil && !speechPromptOpen
    }

    private var nudgeRefreshAt: Date?

    /// A nudge that just finished its round stays for its showing, then the page is told it is gone
    /// (otherwise a page that never hears another session change would keep drawing it).
    private func scheduleNudgeRefresh(for id: String) {
        guard let ends = NudgeCenter.shared.showingEnds(id), nudgeRefreshAt != ends else { return }
        nudgeRefreshAt = ends
        let delay = max(1, ends.timeIntervalSince(NudgeCenter.shared.now()) + 1)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, !self.tornDown, self.nudgeRefreshAt == ends else { return }
            self.nudgeRefreshAt = nil
            self.sessionChanged()
        }
    }

    /// The page forwarded a tap on the nudge chip: its source acts, then the page learns what is next.
    private func nudgeTapped(_ id: String) async -> String {
        // A late tap (a sheet came up, consent went away, the nudge was replaced) retires nothing and opens nothing.
        guard glassIsFreeForANudge, NudgeCenter.shared.isCurrent(id) else { return "gone" }
        nucleoVoice.stop()
        speech.cancel()
        let status = await NudgeCenter.shared.act(id, session: self)
        sessionChanged()
        return status
    }

    /// A delivered read: what the nudge sources may look at (symbol and verdict, never the question).
    private func readDelivered(_ result: [String: Any]) {
        guard result["status"] as? String == "ok", let requestId = result["requestId"] as? String,
              let asset = result["asset"] as? [String: Any], let symbol = asset["symbol"] as? String else { return }
        let agents = result["agents"] as? [String: Any]
        NudgeCenter.shared.noteRead(NudgeRead(requestId: requestId, symbol: symbol, name: asset["name"] as? String ?? symbol,
                                              isEquity: asset["isEquity"] as? Bool ?? false,
                                              verdict: agents?["verdict"] as? String ?? "wait", saved: false, at: Date(),
                                              memory: MemoryReceipt(json: result["memory"])))
        // 1.8: from the first question, the harness knows what to come back to (on this phone only). A read
        // Bobby started is told apart here: only the person's own question is followed up.
        let origin = desk.readOrigin(requestId: requestId) ?? .person
        harness?.noteAsk(symbol: symbol, name: asset["name"] as? String ?? symbol, isEquity: asset["isEquity"] as? Bool ?? false,
                         price: desk.readSummary(requestId: requestId)?.price, origin: origin == .followUp ? .followUp : nil,
                         thread: origin == .thread, horizon: HarnessHorizon(named: (result["sufficiency"] as? [String: Any])?["horizon"]))
        sessionChanged()
    }

    /// The review horizon the person chose on a save, for the harness: only when the page sent one and
    /// the desk kept it (a read Bobby said to wait on has none, and a save without a choice says nothing).
    static func chosenHorizon(saved: [String: Any], asked: Int?) -> Int? {
        guard let asked, (saved["thesis"] as? [String: Any])?["horizonHours"] as? Int == asked else { return nil }
        return asked
    }

    // MARK: - Reads native starts (1.8)

    /// Asks Bobby about an asset native already knows, on the glass: a follow-up's button, a row of a
    /// board. The page runs it exactly like a chip that carries a token. With a sheet open the sheet
    /// goes away first. False when the glass cannot take a question now.
    @discardableResult
    func startRead(symbol: String, name: String, isEquity: Bool, question: String) -> Bool {
        guard !tornDown, profile.acceptedRiskNotice, onboarded, currentPage == NucleoPage.app.name, !desk.isBusy, !speechPromptOpen else { return false }
        let asset = NucleoAsset(symbol: symbol, name: name, isEquity: isEquity, assetClass: isEquity ? "equity" : "crypto")
        if sheet != nil || openSheet != nil {
            readHandoff = (asset, question, accountGeneration)
            sheet = nil
            return true
        }
        emit("ask.start", ["token": desk.token(for: asset, question: question), "question": question])
        return true
    }

    private var readHandoff: (asset: NucleoAsset, question: String, generation: UUID?)?

    /// The sheet a read was started from is gone: the page hears about the read after it hears the sheet closed.
    private func continueReadHandoff() {
        guard let handoff = readHandoff else { return }
        readHandoff = nil
        guard !tornDown, handoff.generation == accountGeneration else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.tornDown, handoff.generation == self.accountGeneration, self.sheet == nil, self.openSheet == nil,
                  self.profile.acceptedRiskNotice, !self.desk.isBusy else { return }
            self.emit("ask.start", ["token": self.desk.token(for: handoff.asset, question: handoff.question), "question": handoff.question])
        }
    }

    func haptic(_ kind: String) { haptics.play(kind) }

    /// Opens a 1.8 native screen from a nudge or another sheet's action; false when something else is up.
    @discardableResult
    func present(_ route: NucleoRoute) -> Bool { openNative(route) }

    /// One sheet hands over to another (the profile's Credits row, a review that opens the editor):
    /// the open sheet goes away first, then the next one presents. With nothing open it presents at once.
    func switchSheet(to route: NucleoRoute) {
        guard sheet != nil || openSheet != nil else { _ = openNative(route); return }
        // The next sheet presents when this one has really gone (`sheetDismissed`), never on a timer,
        // and only for the account that asked.
        sheetHandoff = (route, accountGeneration)
        sheet = nil
    }

    private var sheetHandoff: (route: NucleoRoute, generation: UUID?)?

    private func continueSheetHandoff() {
        guard let handoff = sheetHandoff else { return }
        sheetHandoff = nil
        guard !tornDown, handoff.generation == accountGeneration else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self, !self.tornDown, handoff.generation == self.accountGeneration else { return }
            _ = self.openNative(handoff.route)
        }
    }

    /// The page's first call: it is ready for events.
    private func pageStarted(_ page: String?) -> [String: Any] {
        if let page { currentPage = page }
        emitter?.pageReady()
        bootOnce()
        // After this reply reaches the page: a tap stored at cold launch opens now (emit drops before here).
        scheduleBriefingDrain()
        return sessionJSON()
    }

    /// After consent only (R11): the dictation vocabulary, the account check and one sync.
    private func bootOnce() {
        guard profile.acceptedRiskNotice else { return }
        let consent = consentGeneration
        if vocabularyTask == nil {
            vocabularyTask = Task { [weak self] in
                let words = await BobbyAPI.dictationVocabulary()
                guard !Task.isCancelled, let self, self.profile.acceptedRiskNotice, self.consentGeneration == consent else { return }
                self.speech.vocabulary = words
            }
        }
        if !levelsRequested {
            levelsRequested = true
            Task { await NucleoLevelCenter.shared.refresh() }
        }
        guard !bootSynced, signedIn else { return }
        bootSynced = true
        Task { [weak self] in
            await AccountSession.shared.checkAppleCredential()
            guard let self, self.signedIn, self.profile.acceptedRiskNotice, self.consentGeneration == consent else { return }
            await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
            // 1.8: what the Monday-briefing line on the glass reads (the centre refuses before consent).
            if await BriefingsCenter.shared.refresh() { self.sessionChanged() }
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
        // Future briefings speak with this companion's voice (account-bound, revisioned; R11 first).
        if signedIn, profile.acceptedRiskNotice {
            Task { await BriefingsCenter.shared.mirrorCompanion(c.id) }
        }
        if signedIn, companions.profileNeedsSync {
            Task { [weak self] in
                guard let self else { return }
                await ProgressSync.shared.sync(store: self.companions, profile: self.profile)
            }
        }
        return sessionChanged()
    }

    // MARK: - Suggestions

    /// The quick-access row as the page gets it. `own` tells an asset the person asked about from a starter that
    /// only pads the row: a read Bobby started offers their own assets only (ARCHITECTURE.md §3.5).
    static func quickAccess(_ memory: DeskMemory, fallback: [String]) -> [[String: Any]] {
        let asked = Set(memory.watchlist.map(\.symbol))
        return memory.quickAccess(fallback: fallback).map { ["symbol": $0, "own": asked.contains($0)] }
    }

    func suggestions() async -> [String: Any] {
        let consent = consentGeneration
        let quick = Self.quickAccess(DeskMemory(), fallback: BobbyViewModel.defaultQuickAccess)
        // R11: before consent nothing reaches the network; the local row is all there is.
        guard profile.acceptedRiskNotice else { return ["quickAccess": quick, "movers": [Any]()] }
        if let cache = suggestionsCache, Date().timeIntervalSince(cache.at) < Self.suggestionsCacheSeconds {
            var value = cache.value
            value["quickAccess"] = quick
            return value
        }
        let movers = await BobbyAPI.topMovers(limit: 3).map { ["symbol": $0.symbol, "name": $0.name, "changePct": $0.changePct] as [String: Any] }
        guard profile.acceptedRiskNotice, consentGeneration == consent, !Task.isCancelled else {
            return ["quickAccess": quick, "movers": [Any]()]
        }
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

    /// Public pick lines: bundled EN/ES audio. A language without clips uses the companion's network
    /// voice once the risk notice is accepted, and on-device speech (no provider request) before that.
    func previewVoice(_ c: Companion) -> NucleoVoice.Status {
        let clip = "select-\(c.id)-\(L.ttsLang)"
        let needsBundledClip = ["en", "es"].contains(L.language)
        if !profile.acceptedRiskNotice, needsBundledClip, Bundle.main.url(forResource: clip, withExtension: "mp3") == nil { return .muted }
        return nucleoVoice.speakClip(id: "preview-\(c.id)", clip: clip, fallbackText: c.selectLine, persona: c.voicePersona)
    }

    // MARK: - Apple's speech service (dictation without a local model)

    /// The prompt below is on screen: no sheet may be presented under it.
    private var speechPromptOpen = false

    /// Only Apple's speech service can transcribe the app language on this phone. Asked before any
    /// audio is captured, in a native alert so nothing on the page can answer for the user: allow
    /// (NucleoSpeech stores it), or type instead (nothing is stored; a later hold asks again).
    private func confirmAppleSpeechService() async -> Bool {
        // Only when the alert can really appear: otherwise nothing is stored and the page offers typing.
        guard !tornDown, !speechPromptOpen, sheet == nil, openSheet == nil,
              let host = Self.topViewController(), host.viewIfLoaded?.window != nil,
              !host.isBeingPresented, !host.isBeingDismissed else { return false }
        nucleoVoice.stop()
        speechPromptOpen = true
        defer { speechPromptOpen = false }
        return await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            let alert = UIAlertController(
                title: L.t("Send your voice to Apple to dictate?", "¿Enviar tu voz a Apple para dictar?"),
                message: L.t("To dictate in this language, your voice is sent to Apple’s speech service to be transcribed. Bobby does not store the audio. You can type instead.",
                             "Para dictar en este idioma, tu voz se envía al servicio de voz de Apple para transcribirla. Bobby no guarda el audio. También puedes escribir."),
                preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: L.t("Type instead", "Prefiero escribir"), style: .cancel) { _ in done.resume(returning: false) })
            alert.addAction(UIAlertAction(title: L.t("Allow", "Permitir"), style: .default) { _ in done.resume(returning: true) })
            host.present(alert, animated: true)
        }
    }

    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        var top = scenes.flatMap(\.windows).first { $0.isKeyWindow }?.rootViewController
        while let next = top?.presentedViewController { top = next }
        return top
    }

    // MARK: - Risk notice

    func riskNotice() -> [String: Any] {
        ["version": RiskNotice.currentVersion,
         "statements": RiskNotice.statements().map { ["title": $0.title, "body": $0.body] }]
    }

    func acceptRisk(_ version: Int) -> [String: Any] {
        guard version == RiskNotice.currentVersion else { return ["accepted": false, "version": RiskNotice.currentVersion] }
        profile.riskNoticeVersion = RiskNotice.currentVersion
        // Consent given: purchases may now reach RevenueCat (§8.4).
        BobbyStore.shared.start()
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

    /// Withdraw AI permission without signing out: account management and deletion remain available.
    func revokeRiskNoticeConsent() {
        guard !tornDown else { return }
        consentGeneration = UUID()
        profile.riskNoticeVersion = 0
        AccountSession.shared.cancelPendingSignIn()
        desk.invalidatePending()
        notch.reset()
        speech.cancel()
        speech.revokeAppleServiceConsent()
        nucleoVoice.stop()
        vocabularyTask?.cancel()
        vocabularyTask = nil
        suggestionsCache = nil
        bootSynced = false
        levelsRequested = false
        NudgeCenter.shared.forgetMoment()
        sheetHandoff = nil
        readHandoff = nil
        NucleoLevelCenter.shared.accountChanged(force: true)
        paywallStatus = "cancelled"
        finishPaywall()
        inviteWantsPro = false
        inviteReason = nil
        // Close through the bridge too: otherwise the page keeps its sheet pause forever.
        sheetDismissed()
        emit("consent.withdrawn", [:])
        sessionChanged()
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
        let consent = consentGeneration
        let generation = AccountSession.shared.generation
        let flow = NucleoAppleSignIn()
        appleSignIn = flow
        let result = await flow.run()
        appleSignIn = nil
        let account = AccountSession.shared
        guard profile.acceptedRiskNotice, consentGeneration == consent, account.generation == generation else { return "unavailable" }
        await account.completeApple(result)
        guard profile.acceptedRiskNotice, consentGeneration == consent else { return "unavailable" }
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

    // MARK: - Bobby Pro (§8.4)

    private var paywallContinuation: CheckedContinuation<[String: Any], Never>?
    /// What the open paywall came to so far; the sheet sets it, closing the sheet reports it.
    private(set) var paywallStatus = "cancelled"
    static let paywallStatuses: Set<String> = ["subscribed", "cancelled", "pending", "failed"]

    /// Presents the paywall and answers when it closes: `{status, access}`. Only `subscribed` (the
    /// server verified the App Store transaction) means the page may re-ask its question.
    func paywall() async -> [String: Any] {
        guard profile.acceptedRiskNotice, sheet == nil, openSheet == nil, !speechPromptOpen, paywallContinuation == nil else {
            return ["status": "unavailable", "access": NSNull()]
        }
        nucleoVoice.stop()
        speech.cancel()
        paywallStatus = "cancelled"
        // A level refused for a free account (`upgrade_required`): invite a friend first.
        let route: NucleoRoute = desk.inviteGate != nil ? .invite : .paywall
        inviteReason = desk.inviteGate
        desk.inviteGate = nil
        return await withCheckedContinuation { continuation in
            paywallContinuation = continuation
            openSheet = route
            sheet = route
            emit("native.sheet", ["route": route.rawValue, "state": "open"])
        }
    }

    /// Why the invite sheet opened (the refusal's line); nil when opened from the profile.
    private(set) var inviteReason: String?
    /// The invite sheet's Bobby Pro card was tapped: the paywall follows once the invite sheet is gone.
    private var inviteWantsPro = false

    /// Bobby Pro can be bought in this build only when RevenueCat has the package and the server takes App Store payments.
    var proPurchasable: Bool { !fixtures && BobbyStore.shared.proPurchasable }

    func inviteChosePro() {
        inviteWantsPro = true
        sheet = nil
    }

#if DEBUG
    /// `-nucleo-paywall` (DEBUG): the Bobby Pro sheet over the page for design review; nothing awaits it.
    func presentPaywallForReview() {
        guard sheet == nil, openSheet == nil else { return }
        openSheet = .paywall
        sheet = .paywall
    }
#endif

    /// The sheet's own outcome (it closes itself after a purchase; a swipe keeps the last one).
    func paywallOutcome(_ status: String) {
        guard Self.paywallStatuses.contains(status) else { return }
        paywallStatus = status
    }

    private func finishPaywall() {
        guard let continuation = paywallContinuation else { return }
        paywallContinuation = nil
        let access: Any = BobbyAccessCenter.shared.access.map { $0.json as Any } ?? NSNull()
        continuation.resume(returning: ["status": paywallStatus, "access": access])
    }

    /// A Sign in with Apple finished inside a native sheet (the paywall): bind the progress, tell the page.
    func signedInFromSheet() async {
        guard signedIn else { return }
        await ProgressSync.shared.sync(store: companions, profile: profile)
        sessionChanged()
    }

    // MARK: - Native sheets

    private var openSheet: NucleoRoute?

    func openNative(_ route: NucleoRoute) -> Bool {
        guard sheet == nil, openSheet == nil, !speechPromptOpen else { return false }
        nucleoVoice.stop()
        speech.cancel()
        // A read refused for consent (§2.4 step 2) sends the app page here. The read-only notice
        // cannot be accepted, so the risk beat (onboarding#risk, R11) replaces the page instead;
        // its finishOnboarding cross-fades back to the app (§1.3).
        if route == .riskNotice, currentPage == NucleoPage.app.name, !profile.acceptedRiskNotice {
            let next = page
            DispatchQueue.main.async { [weak self] in self?.onRoute?(next) }
            return true
        }
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
        // One sheet handing over to another (1.8) goes first; a waiting notification tap opens after.
        continueSheetHandoff()
        continueReadHandoff()
        // A tap that arrived while this sheet was up opens once it is gone.
        scheduleBriefingDrain(after: briefingSheetDelay)
    }

    private func sheetClosed(_ route: NucleoRoute) {
        emit("native.sheet", ["route": route.rawValue, "state": "closed"])
        if route == .paywall { finishPaywall() }
        if route == .thesisReview { reminderIntent.markOpen(nil) }
        if route == .briefing {
            selectedBriefId = nil
            if briefingWantsPro {
                // The report's Bobby Pro offer: the paywall follows once the report is gone (nothing awaits it).
                briefingWantsPro = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
                    guard let self, !self.tornDown, self.sheet == nil, self.openSheet == nil, !self.speechPromptOpen, self.profile.acceptedRiskNotice else { return }
                    self.openSheet = .paywall
                    self.sheet = .paywall
                    self.emit("native.sheet", ["route": NucleoRoute.paywall.rawValue, "state": "open"])
                }
            }
        }
        if route == .invite {
            if inviteWantsPro, paywallContinuation != nil {
                inviteWantsPro = false
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in
                    guard let self, self.sheet == nil, self.openSheet == nil, !self.speechPromptOpen else { self?.finishPaywall(); return }
                    self.openSheet = .paywall
                    self.sheet = .paywall
                    self.emit("native.sheet", ["route": NucleoRoute.paywall.rawValue, "state": "open"])
                }
            } else {
                inviteWantsPro = false
                finishPaywall()
            }
        }
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
        scheduleBriefingDrain()
    }

    // MARK: - Briefing notification taps (build 53)

    /// A tap that arrived signed out: kept here (BriefingIntent clears on account change) until a sign-in.
    private var heldBriefId: String?
    private var briefingWantsPro = false
    private var briefingDrainScheduled = false

    /// The report's Bobby Pro offer was tapped: close the report, then the paywall.
    func briefingChosePro() {
        briefingWantsPro = true
        sheet = nil
    }

    /// Drains on the next main-queue turn (after the current bridge reply), or after `delay`.
    func scheduleBriefingDrain(after delay: TimeInterval = 0) {
        guard !tornDown else { return }
        if delay > 0 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.drainBriefingIntent()
                self?.drainReminderIntent()
                self?.drainHarnessIntent()
            }
            return
        }
        guard !briefingDrainScheduled else { return }
        briefingDrainScheduled = true
        DispatchQueue.main.async { [weak self] in
            self?.briefingDrainScheduled = false
            self?.drainBriefingIntent()
            self?.drainReminderIntent()
            self?.drainHarnessIntent()
        }
    }

    /// A report's narrator: the page's line stops before it starts; the mic or a running read refuses it.
    func makeBriefingPlayback() -> AnyBriefingPlayback {
        guard !tornDown else { return AnyBriefingPlayback(NoBriefingPlayback()) }
        return AnyBriefingPlayback(BriefingNarrator.live(
            voice: voice,
            stopPageVoice: { [weak self] in self?.nucleoVoice.stop() },
            micActive: { [weak self] in self?.speech.isListening ?? false },
            analysisBusy: { [weak self] in self?.desk.isBusy ?? false }))
    }

    /// Opens the tapped briefing when everything allows it; otherwise the tap keeps waiting. Consumed
    /// once: a later foreground never replays it. True when the report sheet opened.
    @discardableResult
    func drainBriefingIntent() -> Bool {
        guard !tornDown, let gate = briefingGate else { return false }
        // Signed out: keep the tap past the sign-in (the intent itself clears on account changes). It
        // never shows content: opening re-authorizes against whoever signs in.
        if !gate.signedIn() {
            if let id = briefingIntent.take() { heldBriefId = id }
            return false
        }
        guard briefingIntent.pending != nil || heldBriefId != nil else { return false }
        guard currentPage == NucleoPage.app.name,
              gate.appActive(),
              profile.acceptedRiskNotice, onboarded,
              sheet == nil, openSheet == nil, !speechPromptOpen,
              !gate.listening(), !gate.deskBusy(), !gate.narrating()
        else { return false }
        guard let id = briefingIntent.take() ?? heldBriefId else { return false }
        heldBriefId = nil
        // The same report is already on screen (a foreground push for it): nothing to open.
        if id == briefingIntent.openBriefId { return false }
        // The openNative pattern: the page's voice and the mic stop before a sheet covers the glass.
        nucleoVoice.stop()
        speech.cancel()
        selectedBriefId = id
        openSheet = .briefing
        sheet = .briefing
        emit("native.sheet", ["route": NucleoRoute.briefing.rawValue, "state": "open"])
        return true
    }

    // MARK: - Thesis reminder taps (1.8)

    /// Opens the review a tapped reminder asked for, behind the briefing tap's gate (page loaded, app
    /// active, consent, no sheet, mic closed, desk idle, nothing speaking) but with no account needed:
    /// reminders and theses live on this phone. Consumed once. True when a sheet opened.
    @discardableResult
    func drainReminderIntent() -> Bool {
        guard !tornDown, let gate = briefingGate, reminderIntent.pending != nil else { return false }
        guard currentPage == NucleoPage.app.name,
              gate.appActive(),
              profile.acceptedRiskNotice, onboarded,
              sheet == nil, openSheet == nil, !speechPromptOpen,
              !gate.listening(), !gate.deskBusy(), !gate.narrating(),
              let tap = reminderIntent.take()
        else { return false }
        // The book of whoever uses the phone now: their account's, or the local one when signed out.
        let owner = reminderOwner.map { $0() } ?? (signedIn ? AccountSession.shared.session?.userId : nil)
        switch ReminderIntent.destination(for: tap, active: ThesisBook(defaults: defaults).active(owner: owner)) {
        case .review(let thesisId):
            V18Focus.thesisId = thesisId
            guard openNative(.thesisReview) else { return false }
            reminderIntent.markOpen(thesisId)
        case .list:
            // The thesis no longer exists or is archived: the list, never an empty review.
            V18Focus.thesisId = nil
            guard openNative(.theses) else { return false }
        }
        return true
    }

    // MARK: - Follow-up taps (1.8)

    /// Honours a tapped follow-up behind the same gate as a reminder tap, with no account needed (the
    /// harness lives on this phone). The asset's follow-up lands on the glass: the harness writes
    /// the line and its button asks Bobby. A sector or a week opens its board. Consumed once.
    @discardableResult
    func drainHarnessIntent() -> Bool {
        guard !tornDown, let gate = briefingGate, harnessIntent.pending != nil, let harness else { return false }
        guard currentPage == NucleoPage.app.name,
              gate.appActive(),
              profile.acceptedRiskNotice, onboarded,
              sheet == nil, openSheet == nil, !speechPromptOpen,
              !gate.listening(), !gate.deskBusy(), !gate.narrating(),
              let tap = harnessIntent.take()
        else { return false }
        // A notification planned for another reader of this phone opens nothing.
        guard harness.accepts(tap) else { return false }
        Task { await harness.opened(tap) }
        guard tap.step != .asset else { return true }
        HarnessBoardFocus.pending = tap
        return openNative(.followUp)
    }

    /// The mic closes and the voice stops; an in-flight read keeps going.
    func appWentBackground() {
        speech.cancel()
        nucleoVoice.stop()
        emit("app.state", ["state": "background"])
    }

#if DEBUG
    /// DEBUG only: the hidden long press on the wordmark. Release never leaves the Núcleo.
    private func requestClassic() {
        guard !classicRequested else { return }
        classicRequested = true
    }
#endif

    /// Before the classic app appears: nothing of this session may keep writing.
    func teardown() {
        guard !tornDown else { return }
        heldBriefId = nil
        finishPaywall()
        speech.cancel()
        nucleoVoice.teardown()
        desk.teardown()
        notch.reset()
        vocabularyTask?.cancel()
        cancellables.removeAll()
        tornDown = true
        emitter = nil
        onRoute = nil
    }

    private func observeStores() {
        // Signing out detaches the counters from the account (as ContentView does).
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in
                guard let self, !self.fixtures else { return }
                self.synchronizeAccountState()
                self.sessionChanged()
                // A new account has its own level allowance.
                if self.profile.acceptedRiskNotice { Task { await NucleoLevelCenter.shared.refresh() } }
                // Signed out: no tap of the previous account may open later. Signed in: a tap held while
                // signed out opens now (re-authorized against this account).
                if self.signedIn { self.scheduleBriefingDrain() } else { self.heldBriefId = nil; self.briefingIntent.clear() }
            }
            .store(in: &cancellables)
        // A briefing notification was tapped (cold launch, warm, or while busy): try now; it waits otherwise.
        briefingIntent.$pending
            .compactMap { $0 }
            .sink { [weak self] _ in self?.scheduleBriefingDrain() }
            .store(in: &cancellables)
        // 1.8: a thesis reminder was tapped; it waits for the same moment.
        reminderIntent.$pending
            .compactMap { $0 }
            .sink { [weak self] _ in self?.scheduleBriefingDrain() }
            .store(in: &cancellables)
        // 1.8: a follow-up was tapped; it waits for the same moment.
        harnessIntent.$pending
            .compactMap { $0 }
            .sink { [weak self] _ in self?.scheduleBriefingDrain() }
            .store(in: &cancellables)
        // 1.8: an invitation was answered (accepted, already used, not new): the glass says so now.
        InviteLinkCenter.shared.$answer
            .map { $0 != nil }
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.sessionChanged() }
            .store(in: &cancellables)
        // Bobby stopped speaking: a waiting tap may open.
        voice.$speaking
            .removeDuplicates()
            .filter { !$0 }
            .dropFirst()
            .sink { [weak self] _ in self?.scheduleBriefingDrain(after: 0.05) }
            .store(in: &cancellables)
        // The level sheet changed the analysis level: the page's level pill follows.
        NucleoLevelCenter.shared.$level
            .removeDuplicates()
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] level in self?.emit("analysis.level", level.pageJSON) }
            .store(in: &cancellables)
        // A sync changed XP or streak (server wins): tell the page.
        Publishers.Merge(companions.$disciplineXP.map { _ in () }, companions.$disciplineStreak.map { _ in () })
            .dropFirst(2)
            .debounce(for: .milliseconds(150), scheduler: DispatchQueue.main)
            .sink { [weak self] in self?.sessionChanged() }
            .store(in: &cancellables)
    }

    /// Also runs before every bridge call, so a request cannot observe A's XP while B's first sync is offline.
    private func synchronizeAccountState() {
        guard !fixtures, !tornDown else { return }
        let account = AccountSession.shared
        guard accountGeneration != account.generation else { return }
        let wasAnonymous = accountUserID == nil
        accountGeneration = account.generation
        accountUserID = account.session?.userId
        desk.invalidatePending(preservingAnonymousSignInRetries: wasAnonymous && accountUserID != nil)
        notch.reset()
        speech.cancel()
        nucleoVoice.stop()
        if let userId = accountUserID { companions.bind(to: userId) } else { companions.unbind() }
        DeskMemory.setOwner(accountUserID, defaults: defaults)
        suggestionsCache = nil
        bootSynced = false
        NucleoLevelCenter.shared.accountChanged()
        BobbyAccessCenter.shared.accountChanged()
        NudgeCenter.shared.owner = accountUserID
        NudgeCenter.shared.forgetMoment()
        V18Focus.clear()
        sheetHandoff = nil
        readHandoff = nil
        emit("account.changed", ["wasSignedIn": !wasAnonymous, "signedIn": accountUserID != nil])
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
