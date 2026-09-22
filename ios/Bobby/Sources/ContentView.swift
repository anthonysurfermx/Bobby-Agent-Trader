// Bobby Pocket War Room. One direction: the human types, the desk resolves the
// asset, and the companion answers out loud over a live market surface with an
// adversarial review. No transcript, no microphone — the voice is the reply.
import SwiftUI
import Combine

enum DeskPhase: Int, CaseIterable {
    case idle = 0
    case resolving
    case alpha
    case redTeam
    case cio
    case complete
    case error
    /// The server declined the question on purpose (today's limit, a question too long):
    /// the link worked, so it never reads as an outage.
    case refused

    var label: String {
        switch self {
        // "LIVE" on every device: the owner asked for this exact word.
        case .idle: return "LIVE"
        case .resolving: return L.t("RESOLVING ASSET", "LOCALIZANDO ACTIVO")
        case .alpha: return L.t("REVIEWING EVIDENCE", "REVISANDO EVIDENCIA")
        case .redTeam: return L.t("RED TEAM", "CRÍTICO")
        case .cio: return L.t("CIO DECIDES", "EL DIRECTOR DECIDE")
        case .complete: return L.t("VERDICT READY", "VEREDICTO LISTO")
        case .error: return L.t("INCOMPLETE LINK", "ENLACE INCOMPLETO")
        case .refused: return L.t("NOT ANSWERED", "SIN RESPUESTA")
        }
    }

    /// The status pill: a refusal names its cause instead of the generic word.
    func label(refusal: DeskFailure?) -> String {
        guard self == .refused, let refusal else { return label }
        return refusal.status
    }

    /// Both carry a one-line hint under the status.
    var showsHint: Bool { self == .error || self == .refused }
}

struct NoTradeMoment: Identifiable, Equatable {
    let id = UUID()
    let symbol: String
    let reason: String
    /// What the award actually granted; the server's answer replaces the local one.
    var disciplineXP: Int
}

@MainActor
final class BobbyViewModel: ObservableObject {
    @Published var input = ""
    @Published var assetHits: [BobbyAPI.AssetHit] = []
    private var suggestTask: Task<Void, Never>?
    @Published var thinking = false
    @Published var candles: [Candle] = []
    @Published var candlesLoading = false
    private var confirmedQuestion: (symbol: String, question: String)?
    @Published var snapshot: MarketSnapshot?
    @Published var lastAnswer: BobbyAnswer?
    var speakEnabled: Bool {
        get { NeuralVoice.avatarNarrationEnabled && !voice.isMuted }
        set { voice.isMuted = !newValue }
    }
    @Published var phase: DeskPhase = .idle
    @Published var timeframe: MarketTimeframe = .oneHour
    @Published var noTradeMoment: NoTradeMoment? = nil
    /// What the last finished read did on the island (the harvest card).
    @Published var harvest: HarvestMoment?
    /// Bumps when a read planted a piece: the header's Trader Land chip pops.
    @Published var landBump = 0
    /// The one line under the status after a failure, worded by its cause.
    @Published var errorHint: String?
    /// Why the desk declined the last question (phase `.refused`).
    @Published var refusal: DeskFailure?
    /// "Did you mean…?" stays on screen next to its chip: with the speaker
    /// muted it would otherwise be a bare chip with no question and no
    /// proxy warning.
    @Published var confirmPrompt: String?

    let voice = NeuralVoice()
    /// A line that must not cut the companion off (the evolution call): it is
    /// spoken as soon as the voice is idle.
    var pendingLine: String?

    /// The desk speaks its opening line once per launch, and never over the
    /// answer to a question already asked.
    private var greeted = false
    private var asked = false
    let profile = AgentProfile()
    let companions = CompanionStore()
    private let memory = DeskMemory()
    static let defaultQuickAccess = ["BTC", "NVDA", "ETH", "TSLA", L.t("GOLD", "ORO")]
    /// Read through to the store: sign-out, deletion and sync change it there.
    var streak: Int { companions.disciplineStreak }
    @Published var quickAccess: [String] = BobbyViewModel.defaultQuickAccess

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Discipline streak, not an open-the-app streak: it only grows when
        // the user does something process-quality (see awardDiscipline).
        quickAccess = memory.quickAccess(fallback: Self.defaultQuickAccess)
        // Nested ObservableObject: forward the store's changes or the desk
        // never reacts to picking a companion (same pitfall as AgentProfile).
        companions.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        // Same for the voice: speaking/level drive the companion's talk motion
        voice.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        // And the profile: flipping onboarded must swap onboarding → desk.
        // The old wizard only re-rendered because a speak() fired alongside.
        profile.objectWillChange
            .sink { [weak self] _ in self?.objectWillChange.send() }
            .store(in: &cancellables)
        // Any sync that answers about the harvest's award settles the card —
        // including the one that runs after signing in from it.
        ProgressSync.shared.$outcomes
            .receive(on: DispatchQueue.main)
            .sink { [weak self] outcomes in
                guard let self, let id = self.harvest?.eventID, let outcome = outcomes[id] else { return }
                self.settleHarvest(eventID: id, outcome: outcome)
            }
            .store(in: &cancellables)
    }

    var voicePersona: String? { companions.companion?.voicePersona }

    func say(_ text: String) {
        voice.speak(text, voiceId: profile.voiceId, persona: voicePersona, vibe: profile.vibe.rawValue)
    }

    /// Greetings and flavor lines: the companion's voice or nothing — never
    /// the robotic system voice.
    func sayAmbient(_ text: String) {
        voice.speak(text, voiceId: profile.voiceId, persona: voicePersona, vibe: profile.vibe.rawValue, essential: false)
    }

    /// The desk opens hyped: the companion names what is actually moving right
    /// now, with the real 24h number, so the first feeling is "there is
    /// something happening today" — not a lobby.
    private func hypeGreeting(_ movers: [BobbyAPI.Mover]) -> String {
        func pct(_ m: BobbyAPI.Mover) -> String {
            let sign = m.changePct >= 0 ? "+" : "-"
            return "\(sign)\(String(format: "%.1f", abs(m.changePct)))%"
        }
        guard let first = movers.first else {
            return L.t("I'm in. Welcome to the desk — name an asset and we go.",
                       "Ya estoy dentro. Bienvenido a la mesa: nombra un activo y le entramos.")
        }
        let firstUp = first.changePct >= 0
        let tail: String = movers.dropFirst().first.map { " \($0.symbol) \(pct($0))." } ?? ""
        switch profile.vibe {
        case .chill:
            return firstUp
                ? L.t("Yo, we're live. \(first.symbol) is up \(pct(first)) in 24h.\(tail) Wanna take a look?",
                      "Ey, ya estamos en vivo. \(first.symbol) subió \(pct(first)) en 24 horas.\(tail) ¿Le echamos un ojo?")
                : L.t("Yo, we're live. \(first.symbol) dropped \(pct(first)) in 24h.\(tail) Wanna see if it's a chance?",
                      "Ey, ya estamos en vivo. \(first.symbol) cayó \(pct(first)) en 24 horas.\(tail) ¿Vemos si es oportunidad?")
        case .directo:
            return L.t("Desk open. Biggest move: \(first.symbol) \(pct(first)) in 24h.\(tail) Say the word.",
                       "Mesa abierta. Mayor movimiento: \(first.symbol) \(pct(first)) en 24 horas.\(tail) Tú dices.")
        case .pro:
            return L.t("Session open. Lead mover \(first.symbol) \(pct(first)) over 24h.\(tail) Pick one and I run the desk.",
                       "Sesión abierta. Líder del día: \(first.symbol) \(pct(first)) en 24 horas.\(tail) Elige uno y lo analizo.")
        }
    }

    /// The desk opens with one spoken line built on live movers: real numbers,
    /// in the companion's own voice, once per launch. Nothing is written — the
    /// screen stays clean — and a question already in flight wins.
    func bootGreetingIfNeeded() {
        guard !greeted else { return }
        greeted = true
        Task {
            let movers = await BobbyAPI.topMovers(limit: 2)
            guard !asked, speakEnabled else { return }
            sayAmbient(hypeGreeting(movers))
        }
    }

    /// Search-as-you-type over the full universe: quiet, debounced, and it
    /// never fires while a question is in flight.
    func updateSuggestions() {
        suggestTask?.cancel()
        let q = input.trimmingCharacters(in: .whitespaces)
        // Multi-word stays live: "taiwan semi…", "bitcoin cash" and "open ai"
        // suggest just like single tickers — the backend understands phrases.
        guard q.count >= 2, q.count <= 32 else {
            if !assetHits.isEmpty { assetHits = [] }
            confirmPrompt = nil
            return
        }
        suggestTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 220_000_000)
            guard !Task.isCancelled else { return }
            let hits = await BobbyAPI.searchAssets(q)
            guard !Task.isCancelled else { return }
            self.confirmPrompt = nil
            self.assetHits = hits
        }
    }

    func ask(_ preset: String? = nil) {
        suggestTask?.cancel()
        assetHits = []
        let q = (preset ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !thinking else { return }
        // Counted the way the server counts (Unicode code points), against the same limit.
        guard !DeskQuestion.isTooLong(q) else {
            // Shown like the server's own refusal: the hint only renders under a refusal or an error.
            refusal = .questionTooLong
            phase = .refused
            errorHint = DeskQuestion.tooLongMessage
            return
        }
        let originalQuestion = confirmedQuestion?.symbol == q ? confirmedQuestion!.question : q
        let accountGeneration = AccountSession.shared.generation
        confirmedQuestion = nil
        asked = true
        input = ""
        voice.stop()
        errorHint = nil
        refusal = nil
        confirmPrompt = nil
        pendingLine = nil
        thinking = true
        phase = .resolving
        lastAnswer = nil
        noTradeMoment = nil
        // A card whose extend is on its way stays until it answers (then the new read's card replaces it).
        if harvest?.holdsThroughNextRead != true { harvest = nil }

        Task {
            defer { thinking = false }

            guard let resolution = await BobbyAPI.resolveAsset(q) else {
                phase = .error
                errorHint = L.t("No match for “\(q)” · try the name or the ticker", "No encontré “\(q)” · prueba con el nombre o el símbolo")
                if speakEnabled { say(L.t("I could not find that asset. Try the name or the ticker.", "No encontré ese activo. Prueba con el nombre o el símbolo.")) }
                return
            }

            // Sacred rule: a fuzzy or proxy match never analyzes on its own.
            // Bobby asks once; the confirm chip re-asks with the exact ticker.
            if resolution.needsConfirmation {
                phase = .idle
                let sym = resolution.snapshot.symbol
                let display = resolution.confirmName == sym ? sym : "\(resolution.confirmName) (\(sym))"
                var text = L.t("Did you mean \(display)?", "¿Te refieres a \(display)?")
                if let note = resolution.proxyNote {
                    text += " " + L.t("Heads up: that listing is \(note).", "Ojo: ese listado es \(note).")
                }
                confirmPrompt = text
                confirmedQuestion = (sym, originalQuestion)
                text += " " + L.t("Tap it to confirm.", "Tócalo para confirmar.")
                if speakEnabled { say(text) }
                assetHits = [BobbyAPI.AssetHit(
                    symbol: sym,
                    name: resolution.confirmName,
                    assetClass: resolution.snapshot.isEquity ? "equity" : "crypto"
                )]
                return
            }
            let asset = resolution.snapshot
            if asset.isEquity && timeframe == .fourHours { timeframe = .oneHour }
            candlesLoading = true

            memory.recordQuery(symbol: asset.symbol, isEquity: asset.isEquity)
            quickAccess = memory.quickAccess(fallback: Self.defaultQuickAccess)

            async let marketRequest = BobbyAPI.market(asset.symbol)
            async let candleRequest = BobbyAPI.candles(
                symbol: asset.symbol,
                isEquity: asset.isEquity,
                timeframe: timeframe
            )
            async let debateRequest = BobbyAPI.debate(asset.symbol, question: originalQuestion, isEquity: asset.isEquity)

            var snap = asset
            let market = await marketRequest
            snap.price = market.price
            snap.changePct = market.changePct
            withAnimation(.spring(duration: 0.42)) {
                snapshot = snap
                candles = []
                phase = .alpha
            }

            let fetchedCandles = await candleRequest
            withAnimation(.easeOut(duration: 0.35)) {
                candles = fetchedCandles
                candlesLoading = false
            }

            var answer = await debateRequest
            withAnimation(.spring(duration: 0.38)) {
                lastAnswer = answer
                phase = .cio
            }

            // Backend hiccup: no data, no verdict → honest error, ZERO XP,
            // and definitely no "capital protected" theater. Decided on the
            // debate payload ALONE — a working quote must not rescue a
            // failed debate into a disciplined NO TRADE.
            if answer.isUnavailable {
                // The server's own refusals (today's limit, a question too long) say what they are:
                // retrying in a moment cannot fix either, and the link did not fail.
                refusal = answer.failure
                phase = answer.failure == nil ? .error : .refused
                let msg = answer.failure?.message
                    ?? L.t("The desk did not answer for \(answer.symbol). Try again in a moment.",
                           "La mesa no respondió por \(answer.symbol). Inténtalo de nuevo en un momento.")
                errorHint = msg
                if answer.failure == .questionTooLong, input.isEmpty { input = originalQuestion }
                if speakEnabled { say(msg) }
                return
            }
            // Only now back-fill the quote for display/speech.
            if answer.price == nil, let quote = market.price {
                answer.price = quote
                lastAnswer = answer
            }

            phase = .complete
            let text = answer.summary
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if speakEnabled { say(text) }
            // Signed in or out while it ran: the answer still shows, but its award belongs to the
            // account that asked, which is gone — no XP, no seed, no harvest card for this read.
            guard AccountSession.shared.generation == accountGeneration else { return }
            // A full review earns discipline. Respecting a fail-closed verdict
            // earns more because restraint is the behavior Bobby is teaching.
            // awardedXP is what the daily cap ACTUALLY granted — the UI shows
            // that number, never the intent.
            // The read rides along as the thesis its seed is reviewed against
            // in Trader Land (same snapshot as the web desk).
            let thesis = AwardThesis.make(symbol: asset.symbol, isEquity: asset.isEquity, direction: answer.direction,
                                          price: answer.price, entry: answer.entry, stop: answer.stop, target: answer.target)
            let award = companions.awardDisciplineEvent(answer.isNoTrade ? 20 : 10, kind: answer.isNoTrade ? "no_trade_respected" : "read_complete", thesis: thesis)
            let awardedXP = award.points
            beginHarvest(award, noTrade: answer.isNoTrade, thesis: thesis)
            if answer.isNoTrade {
                withAnimation(.spring(duration: 0.52, bounce: 0.24)) {
                    noTradeMoment = NoTradeMoment(
                        symbol: answer.symbol,
                        reason: answer.noTradeReason,
                        disciplineXP: awardedXP
                    )
                }
            }
        }
    }

    /// Shows what this read did on the island, then follows the server's answer.
    private func beginHarvest(_ award: CompanionStore.DisciplineAward, noTrade: Bool, thesis: AwardThesis?) {
        let signedIn = AccountSession.shared.isSignedIn
        let stage: HarvestMoment.Stage = !signedIn ? .signedOut(planted: award.eventID != nil)
            : award.eventID == nil ? .capped : .syncing
        withAnimation(.spring(duration: 0.52, bounce: 0.24)) {
            harvest = HarvestMoment(eventID: award.eventID, noTrade: noTrade, thesis: thesis, xp: award.points, stage: stage)
        }
        guard signedIn, let eventID = award.eventID else {
            Task { await ProgressSync.shared.sync(store: companions, profile: profile) }
            return
        }
        Task {
            let outcome = await ProgressSync.shared.outcome(for: eventID, store: companions, profile: profile)
            settleHarvest(eventID: eventID, outcome: outcome)
        }
    }

    /// Applies the server's answer to an open harvest card. nil = no answer:
    /// signed out while syncing, or the piece waits for the next sync.
    func settleHarvest(eventID: String, outcome: AwardOutcome?) {
        guard var moment = harvest, moment.eventID == eventID, moment.isOpen else { return }
        let next: HarvestMoment.Stage
        if let outcome {
            next = HarvestMoment.stage(for: outcome)
        } else if !AccountSession.shared.isSignedIn {
            // A 401 ended the session. Offline token refreshes keep it: those stay pending.
            next = .signedOut(planted: true)
        } else {
            next = .pending
        }
        // The seed's row, horizon and tier previews: what the horizon choice needs, for this account.
        if let outcome { moment.adopt(outcome, owner: AccountSession.shared.session?.userId) }
        // A duplicate was counted by an earlier round: the local number stands.
        if let outcome, !outcome.duplicate {
            moment.xp = outcome.awarded
            // Both cards show the server's number (a cap reached on another device reads 0).
            if moment.noTrade, var shield = noTradeMoment, shield.disciplineXP != outcome.awarded {
                shield.disciplineXP = outcome.awarded
                withAnimation(.easeOut(duration: 0.25)) { noTradeMoment = shield }
            }
        }
        let moved = next != moment.stage
        moment.stage = next
        guard moment != harvest else { return }
        withAnimation(.spring(duration: 0.45, bounce: 0.2)) { harvest = moment }
        guard moved else { return }
        switch next {
        case .seed, .bloomed:
            landBump += 1
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        default: break
        }
    }

    /// Extends the harvest card's seed to a longer horizon (docs/trader-land/GROWTH-v1.md §1):
    /// one POST, never twice at once, and its answer lands only on the card that asked —
    /// a new read may have replaced it meanwhile. A refusal or a lost answer reads the seed's
    /// row again, so the card never keeps a horizon the server no longer has. true = a request went out.
    @discardableResult
    func extendSeed(to target: LandHorizon, extender: DeskSeedExtender = DeskSeedExtender()) async -> Bool {
        guard let moment = harvest, let eventID = moment.eventID, let inventoryID = moment.inventoryID,
              let started = moment.startingExtend(to: target) else { return false }
        withAnimation(.easeOut(duration: 0.2)) { harvest = started }
        let result = await extender.extend(inventoryID: inventoryID, to: target)
        var truth: DeskSeedExtender.Extended?
        if case let .failure(failure) = result, failure.rereads,
           harvest?.eventID == eventID, harvest?.inventoryID == inventoryID {
            truth = await extender.seedRow(inventoryID: inventoryID)
        }
        guard let settled = HarvestMoment.settlingExtend(harvest, eventID: eventID, inventoryID: inventoryID, target: target,
                                                         result: result, truth: truth) else {
            // The card is gone (a newer read, another account): a success still pops the chip;
            // anything else is said once, since no card is left to show it.
            if case .success = result {
                landBump += 1
            } else {
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
                AccessibilityNotification.Announcement(DeskSeedExtender.droppedMessage).post()
            }
            return true
        }
        withAnimation(.spring(duration: 0.45, bounce: 0.2)) { harvest = settled }
        if settled.extendError == nil {
            landBump += 1
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } else {
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        }
        // The confirm button that had focus is gone either way: say what happened.
        if let line = settled.extendAnnouncement { AccessibilityNotification.Announcement(line).post() }
        return true
    }

    /// The seed's row belongs to the account that planted it: signed out, or into another
    /// account, the card keeps its story but no longer offers that seed's horizon.
    func accountChanged(to userID: String?) {
        guard var moment = harvest, moment.forgetSeedRow(unlessOwnedBy: userID) else { return }
        withAnimation(.easeOut(duration: 0.2)) { harvest = moment }
    }

    /// A card left open past its review shows its choice closed. The card's own clock does
    /// this while the desk is on screen; this catches a return from the background.
    func closeExpiredHorizon(now: Date = Date()) {
        guard var moment = harvest, moment.closeHorizonIfReviewOpen(at: now) else { return }
        harvest = moment
    }

    func selectTimeframe(_ next: MarketTimeframe, retry: Bool = false) {
        guard !thinking, retry || next != timeframe else { return }
        guard snapshot?.isEquity != true || next != .fourHours else { return }
        timeframe = next
        candles = []
        guard let snapshot else { return }
        candlesLoading = true

        Task {
            let rows = await BobbyAPI.candles(
                symbol: snapshot.symbol,
                isEquity: snapshot.isEquity,
                timeframe: next
            )
            guard self.timeframe == next, self.snapshot?.symbol == snapshot.symbol else { return }
            withAnimation(.easeOut(duration: 0.28)) { candles = rows; candlesLoading = false }
        }
    }
}

struct ContentView: View {
    @StateObject private var vm = BobbyViewModel()
    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var focused: Bool
    @State private var showSquad = false
    @State private var showBoard = false
    @State private var showRiskNotice = false
    @State private var showAccount = false
    @ObservedObject private var account = AccountSession.shared
    @State private var inspectedTool: CompanionTool?
    @State private var showCatalog = false
    /// The open Trader Land sheet and where it opens (a piece to build, the reviews, or nil).
    /// The focus rides in the item: a separate @State read only by the sheet's
    /// closure is stale on the first presentation after launch.
    @State private var landRequest: LandRequest?
    @StateObject private var pulse = LandPulse()
    @ObservedObject private var progressSync = ProgressSync.shared
    @State private var petDetail = false
    @State private var skinSnapshotToken = 0
    @State private var skinShot: UIImage?
    @State private var confirmDelete = false
    @State private var deleting = false
    @State private var accountError: String?
    @State private var accountDeleted = false
    @State private var equipToolId: String?
    @State private var equipToken = 0
    /// The desk never shows an empty hole: if the companion GLB fails to
    /// load, its own portrait stands in until the companion changes.
    @State private var deskModelFailed = false

    var body: some View {
        ZStack {
            KineticBackground()
            if !vm.profile.acceptedRiskNotice {
                // The risk notice is the first screen, every install: nothing in
                // Bobby is investment advice, and the human says so by hand.
                RiskNoticeView(profile: vm.profile).transition(.opacity)
            } else if vm.profile.onboarded {
                mainScreen.transition(.opacity)
            } else {
                CompanionOnboarding(profile: vm.profile, companions: vm.companions, voice: vm.voice).transition(.opacity)
            }

            // The evolution moment: name, tone and form change together
            if let evo = vm.companions.pendingEvolution, let comp = vm.companions.companion {
                EvolutionOverlay(companion: comp, level: evo) {
                    vm.companions.pendingEvolution = nil
                    // Spoken on dismiss, and never over the answer that earned it.
                    if vm.speakEnabled {
                        let evolvedName = comp.name(at: evo.number)
                        let line = L.t("I evolved. Call me \(evolvedName) now.\(levelTone(evo.number))",
                                       "Evolucioné. Ahora dime \(evolvedName).\(levelTone(evo.number))")
                        if vm.voice.speaking { vm.pendingLine = line } else { vm.say(line) }
                    }
                }
                .transition(.opacity)
                .zIndex(10)
            }
            // The loot moment: gear drops after the evolution card, one at a time.
            if vm.companions.pendingEvolution == nil,
               let drop = vm.companions.pendingToolUnlocks.first,
               let comp = vm.companions.companion {
                ToolUnlockOverlay(companion: comp, tool: drop) {
                    withAnimation(.easeOut(duration: 0.3)) { _ = vm.companions.pendingToolUnlocks.removeFirst() }
                    // Now it is worn: play the equip flight on the desk scene.
                    // Celebrated here, so the locker does not flag it NEW.
                    LockerSeen.mark([drop.id])
                    equipToolId = drop.id
                    equipToken += 1
                }
                .transition(.opacity)
                .zIndex(11)
            }
        }
        .onChange(of: vm.companions.pendingEvolution?.number) { _, newLevel in
            guard newLevel != nil else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
        .onChange(of: vm.profile.acceptedRiskNotice) { _, accepted in
            // A new risk-notice version gates an onboarded user: greet once it is accepted.
            if accepted && vm.profile.onboarded { vm.bootGreetingIfNeeded() }
        }
        .onAppear {
            if vm.profile.acceptedRiskNotice && vm.profile.onboarded { vm.bootGreetingIfNeeded() }
            Task { await ProgressSync.shared.sync(store: vm.companions, profile: vm.profile) }
            Task { await pulse.refresh() }
            // Cold launch too, not only a return from the background: a revocation made
            // while the app was closed ends the session before anything is synced to it.
            Task { await account.checkAppleCredential() }
        }
        // A round that acknowledged awards may have planted pieces; signing in
        // or out changes whose island the chip reads.
        .onChange(of: progressSync.acknowledgedRounds) { Task { await pulse.refresh() } }
        .onChange(of: account.isSignedIn) {
            if !account.isSignedIn { vm.companions.unbind() }
            Task { await pulse.refresh() }
        }
        // Signed out, or into another account: the harvest card's seed is not this desk's to extend.
        .onChange(of: account.session?.userId) { _, userID in vm.accountChanged(to: userID) }
        .onChange(of: scenePhase) { _, next in
            if next == .background { vm.voice.stop() }
            // Back from the background: a seed whose review opened meanwhile shows its choice closed.
            if next == .active { vm.closeExpiredHorizon(); Task { await account.checkAppleCredential() } }
        }
        .onDisappear { vm.voice.stop() }
        // A new companion must not finish the old one's sentence — unless the
        // pick came from SQUAD, which plays the new companion's line itself.
        .onChange(of: vm.companions.companionId) { _, _ in
            if !showSquad { vm.voice.stop() }
            if vm.companions.profileNeedsSync { Task { await ProgressSync.shared.sync(store: vm.companions, profile: vm.profile) } }
        }
        .onChange(of: vm.voice.speaking) { _, speaking in
            guard !speaking, let line = vm.pendingLine else { return }
            vm.pendingLine = nil
            if vm.speakEnabled { vm.say(line) }
        }
        .onChange(of: vm.input) { vm.updateSuggestions() }
        .sheet(isPresented: $showBoard) {
            AssetBoardView(vm: vm)
        }
        .sheet(item: $inspectedTool) { tool in
            ToolDetailSheet(companion: vm.companions.companion ?? bobbyCompanions[0], tool: tool, xp: vm.companions.disciplineXP)
                .presentationDetents([.medium])
                .presentationBackground(Theme.bg)
        }
        .sheet(isPresented: $showCatalog) {
            // The locker. SEE IT WORN closes it, then the piece flies onto the desk companion.
            SquadLockerSheet(store: vm.companions) { tool in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                    equipToolId = tool.id
                    equipToken += 1
                }
            }
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationBackground(Theme.bg)
        }
        .sheet(item: $landRequest, onDismiss: {
            // A thesis closed on the island earns XP: bring the desk up to date.
            Task {
                await ProgressSync.shared.sync(store: vm.companions, profile: vm.profile)
                await pulse.refresh()
            }
        }) { request in
            TraderLandGateHarnessView(focus: request.focus)
                .presentationDetents([.large])
                .presentationBackground(Theme.bg)
        }
        .sheet(isPresented: $petDetail) {
            PetDetailSheet(companion: vm.companions.companion ?? bobbyCompanions[0], xp: vm.companions.disciplineXP)
                .presentationDetents([.medium])
                .presentationBackground(Theme.bg)
        }
        .sheet(item: $skinShot) { card in
            if let comp = vm.companions.companion {
                SkinShareSheet(card: card, companion: comp, level: vm.companions.level,
                               gear: CompanionToolkit.wornGear(companionId: comp.id, xp: vm.companions.disciplineXP),
                               pet: CompanionToolkit.petUnlocked(companionId: comp.id, xp: vm.companions.disciplineXP) ? CompanionToolkit.pet(for: comp.id) : nil,
                               xp: vm.companions.disciplineXP)
            }
        }
        .sheet(isPresented: $showRiskNotice) {
            RiskNoticeView(profile: vm.profile, readOnly: true) { showRiskNotice = false }
        }
        .sheet(isPresented: $showAccount) {
            AccountSheet(store: vm.companions, profile: vm.profile, pieces: account.isSignedIn ? pulse.pieces : nil) { showAccount = false }
        }
        .sheet(isPresented: $showSquad) {
            // Muted means muted: the gallery's pick line stays silent too.
            MascotGalleryView(store: vm.companions, voice: vm.voice, voiceId: vm.profile.voiceId)
        }
        .onChange(of: vm.profile.onboarded) { _, onboarded in
            if onboarded { vm.bootGreetingIfNeeded() }
        }
        .confirmationDialog(L.t("Delete your Bobby account?", "¿Eliminar tu cuenta de Bobby?"),
                            isPresented: $confirmDelete, titleVisibility: .visible) {
            Button(L.t("Delete account permanently", "Eliminar cuenta para siempre"), role: .destructive) {
                guard !deleting else { return }
                deleting = true
                Task {
                    switch await account.deleteAccount(store: vm.companions) {
                    case .deleted:
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        accountDeleted = true
                    case .cancelled:
                        // Closing Apple's sheet is a choice, not an error.
                        break
                    case .failed:
                        accountError = account.lastError ?? L.t("Could not delete the account — try again", "No se pudo borrar la cuenta — inténtalo de nuevo")
                        account.lastError = nil
                    }
                    deleting = false
                }
            }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) {}
        } message: {
            Text(AccountDeletionCopy.confirmation)
        }
        .alert(L.t("Account", "Cuenta"), isPresented: Binding(get: { accountError != nil }, set: { if !$0 { accountError = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(accountError ?? "")
        }
        .alert(L.t("Account deleted", "Cuenta eliminada"), isPresented: $accountDeleted) {
            if account.manualAppleRevocationRequired {
                Button(AccountDeletionCopy.manageAppleButton) {
                    UIApplication.shared.open(account.manualRevocationURL)
                }
            }
            Button("OK", role: .cancel) {}
        } message: {
            Text(AccountDeletionCopy.deleted(manualAppleSteps: account.manualAppleRevocationRequired))
        }

        .animation(.easeOut(duration: 0.35), value: vm.profile.onboarded)
        .animation(.easeOut(duration: 0.35), value: vm.profile.acceptedRiskNotice)
    }

    private var mainScreen: some View {
        VStack(spacing: 0) {
            deskHeader
            ScrollView {
                // This bounded set of cards needs stable heights while scrolling.
                // Lazy height estimation can loop on long translated debate text.
                VStack(spacing: 12) {
                    // Your companion never leaves the stage; a NO TRADE lands under it.
                    liveConsole
                    if let moment = vm.noTradeMoment {
                        noTradeSignature(moment)
                        // A respected NO TRADE blooms its piece right away: say so under the shield.
                        if let harvest = vm.harvest, harvest.noTrade { harvestCard(harvest, showsXP: false) }
                    }
                    if vm.snapshot == nil && !vm.thinking { commandDeck }
                    if vm.snapshot != nil { marketSurface }
                    if vm.snapshot != nil || vm.thinking { debateRail }
                    if vm.lastAnswer != nil { verdictCard }
                    // A read's seed lands right after the verdict it will be reviewed against —
                    // and so does a NO TRADE's piece once its shield is closed: never a banner over the chart.
                    if let harvest = vm.harvest, !harvest.noTrade || vm.noTradeMoment == nil { harvestCard(harvest) }
                    // The board's only door (the menu item is gone): back under the read.
                    if vm.snapshot != nil && !vm.thinking { commandDeck }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            if !vm.assetHits.isEmpty {
                if let prompt = vm.confirmPrompt {
                    Text(prompt)
                        .font(.rounded(13, .semibold))
                        .foregroundStyle(Theme.text.opacity(0.85))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.top, 6)
                        .transition(.opacity)
                }
                assetSuggestions
            }
            commandBar
        }
    }

    private var deskHeader: some View {
        HStack(spacing: 10) {
            // Companion portrait + level — the bond lives top-left, opens SQUAD
            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                showSquad = true
            } label: {
                ZStack(alignment: .bottomTrailing) {
                    if let comp = vm.companions.companion {
                        CompanionThumb(companion: comp)
                            .frame(width: 34, height: 34)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(comp.tint.opacity(0.6), lineWidth: 1.5))
                        Text("\(vm.companions.level.number)")
                            .font(.mono(8, .black))
                            .foregroundStyle(Theme.bg)
                            .frame(width: 14, height: 14)
                            .background(Circle().fill(comp.tint))
                            .offset(x: 3, y: 3)
                    } else {
                        Circle()
                            .fill(vm.profile.auraTint.opacity(0.15))
                            .frame(width: 34, height: 34)
                            .overlay(Circle().stroke(vm.profile.auraTint.opacity(0.5), lineWidth: 1.5))
                            .overlay(
                                Image(systemName: "person.3.fill")
                                    .font(.system(size: 12))
                                    .foregroundStyle(vm.profile.auraTintSoft)
                            )
                    }
                }
            }
            .accessibilityIdentifier("squad-portrait")
            // One title: the companion's name. Level and rank live in SQUAD.
            Text(vm.companions.companion?.label ?? vm.profile.name.uppercased())
                .font(.mono(13, .bold))
                .kerning(2.6)
                .foregroundStyle(vm.companions.companion?.tintSoft ?? Theme.text.opacity(0.85))
                .lineLimit(1)
            Spacer()
            // Trader Land stays one tap away, with what waits there.
            LandChip(badge: account.isSignedIn ? pulse.badge : 0, bump: vm.landBump) {
                openLand(account.isSignedIn ? pulse.focus : nil, haptic: .light)
            }
            if NeuralVoice.avatarNarrationEnabled {
                AvatarVoiceToggle(voice: vm.voice)
            }
            // Progress, account and the custody promise live in the menu.
            Menu {
                Button {
                    openLand(nil)
                } label: {
                    Label("Trader Land", systemImage: "map")
                }
                Section {
                    Label(vm.streak >= 1 ? L.t("Discipline streak: \(vm.streak) day\(vm.streak == 1 ? "" : "s") 🔥", "Racha de disciplina: \(vm.streak) día\(vm.streak == 1 ? "" : "s") 🔥") : L.t("No streak yet — review an analysis", "Sin racha aún — revisa un análisis"),
                          systemImage: "flame")
                }
                Section {
                    // Reachable from every screen, not just first-run onboarding.
                    Button { shareSkin() } label: {
                        Label(L.t("Share my skin", "Compartir mi estilo"), systemImage: "square.and.arrow.up")
                    }
                    Button { showAccount = true } label: {
                        Label(account.isSignedIn ? L.t("Progress saved · account", "Progreso guardado · cuenta") : L.t("Save progress", "Guardar progreso"), systemImage: account.isSignedIn ? "checkmark.icloud" : "icloud")
                    }
                    Button { showRiskNotice = true } label: {
                        Label(L.t("Risk notice", "Aviso de riesgo"), systemImage: "exclamationmark.triangle")
                    }
                    Link(destination: URL(string: "https://bobbyprotocol.xyz/support")!) {
                        Label(L.t("Help and support", "Ayuda y soporte"), systemImage: "questionmark.circle")
                    }
                    Link(destination: URL(string: "https://bobbyprotocol.xyz/privacy")!) {
                        Label(L.t("Privacy Policy", "Aviso de privacidad"), systemImage: "hand.raised")
                    }
                }
                if account.isSignedIn {
                    Section {
                        Button {
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            account.signOut(store: vm.companions)
                        } label: {
                            Label(L.t("Sign out", "Cerrar sesión"), systemImage: "rectangle.portrait.and.arrow.right")
                        }
                        Button(role: .destructive) { confirmDelete = true } label: {
                            Label(deleting ? L.t("Deleting account…", "Eliminando cuenta…") : L.t("Delete account", "Eliminar cuenta"), systemImage: "trash")
                        }
                        .disabled(deleting)
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Theme.card))
                    .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var liveConsole: some View {
        VStack(spacing: 4) {
            // Tapping the companion opens the keyboard: you type, it answers out loud.
            Button(action: focusAsk) {
                Group {
                    if let comp = vm.companions.companion, !deskModelFailed {
                        // The chosen companion IS Bobby's face on the desk
                        MascotSceneView(
                            assetName: comp.id,
                            interactive: false,
                            speaking: vm.voice.speaking,
                            voiceLevel: vm.voice.level,
                            onLoading: { _, failed in
                                if failed { deskModelFailed = true }
                            },
                            // Worn gear and the pet ride on the body — the Fortnite effect.
                            // Pieces still waiting in the loot queue are not worn yet: they
                            // fly onto the body when the human taps EQUIP IT.
                            gear: CompanionToolkit.wornGear(companionId: comp.id, xp: vm.companions.disciplineXP)
                                .filter { tool in !vm.companions.pendingToolUnlocks.contains(where: { $0.id == tool.id }) },
                            pet: CompanionToolkit.petUnlocked(companionId: comp.id, xp: vm.companions.disciplineXP) ? CompanionToolkit.pet(for: comp.id) : nil,
                            equipToolId: equipToolId,
                            equipToken: equipToken,
                            snapshotToken: skinSnapshotToken,
                            onSnapshot: { shot in skinShot = shot },
                            // Hidden under the locker sheet: hold still, save the GPU.
                            paused: showCatalog
                        )
                            .allowsHitTesting(false)
                            .frame(width: 206, height: 208)
                            .shadow(color: comp.tint.opacity(0.35), radius: 26)
                    } else if let comp = vm.companions.companion {
                        // Still the chosen avatar, never the generic orb.
                        CompanionThumb(companion: comp)
                            .frame(width: 180, height: 180)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(comp.tint.opacity(0.5), lineWidth: 1.5))
                            .shadow(color: comp.tint.opacity(0.35), radius: 26)
                            .frame(height: 208)
                    } else {
                        BobbyOrb(
                            size: 206,
                            thinking: vm.thinking,
                            speaking: vm.voice.speaking,
                            level: liveLevel,
                            tint: vm.profile.auraTint,
                            tintSoft: vm.profile.auraTintSoft
                        )
                        .frame(height: 208)
                    }
                }
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(vm.thinking)
            .accessibilityLabel(vm.companions.companion?.label ?? vm.profile.name)
            .accessibilityHint(L.t("Opens the keyboard to ask", "Abre el teclado para preguntar"))
            .onChange(of: vm.companions.companionId) { deskModelFailed = false }

            HStack(spacing: 7) {
                Circle()
                    .fill(statusColor)
                    .frame(width: 6, height: 6)
                    .shadow(color: statusColor, radius: 6)
                Text(statusLabel)
                    .font(.mono(11, .bold))
                    .kerning(2.2)
                    .foregroundStyle(statusColor)
            }
            .contentTransition(.opacity)

            if vm.phase.showsHint, let hint = vm.errorHint {
                Text(hint)
                    .font(.mono(10, .medium))
                    .kerning(0.6)
                    .foregroundStyle(Theme.muted)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }

            // The gear belt: three slots that fill with discipline — first
            // read, then every 100 XP, the last one golden.
            if let comp = vm.companions.companion {
                ToolBelt(companion: comp, xp: vm.companions.disciplineXP, onTap: { tool in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    inspectedTool = tool
                }, onPet: {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    petDetail = true
                }, onPlus: {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    // Parse the first pages before the sheet slides up.
                    MascotAssetCache.preload(LockerLedger.order(ownId: vm.companions.companionId).prefix(3).map(\.id))
                    showCatalog = true
                }, onWorld: {
                    openLand(nil, haptic: .medium)
                })
                .padding(.top, 4)
            }
        }
        .padding(.top, 2)
        .padding(.bottom, 4)
    }

    private func noTradeSignature(_ moment: NoTradeMoment) -> some View {
        let halo = bobbyCompanions.first { $0.id == "halo" }!
        return VStack(spacing: 8) {
            HStack {
                Text(L.t("HALO // RISK GATE", "HALO // FILTRO DE RIESGO"))
                    .font(.mono(9, .bold))
                    .kerning(1.8)
                    .foregroundStyle(halo.tintSoft)
                Spacer()
                Button {
                    withAnimation(.easeOut(duration: 0.24)) { vm.noTradeMoment = nil }
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Theme.muted)
                        .frame(width: 28, height: 28)
                        .background(Circle().fill(Theme.cardSoft))
                }
                .accessibilityLabel(L.t("Dismiss no trade moment", "Cerrar aviso de no operar"))
            }

            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 54, weight: .bold))
                .foregroundStyle(halo.tintSoft.opacity(0.92))
                .shadow(color: halo.tint, radius: 18)
                .symbolEffect(.pulse, options: .repeating.speed(0.7))
                .frame(height: 76)

            Text(L.t("NO TRADE", "NO OPERAR"))
                .font(.mono(24, .black))
                .kerning(4)
                .foregroundStyle(halo.tintSoft)
            Text(L.t("No clear setup. Waiting is an option.", "Sin oportunidad clara. Esperar es una opción."))
                .font(.rounded(16, .bold))
                .foregroundStyle(Theme.text)
            Text(moment.reason)
                .font(.mono(9, .medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)

            HStack(spacing: 10) {
                // Show what the daily cap actually granted — never the intent
                Label(moment.disciplineXP > 0
                        ? L.t("+\(moment.disciplineXP) DISCIPLINE XP", "+\(moment.disciplineXP) XP DE DISCIPLINA")
                        : L.t("DAILY XP COMPLETE", "XP DIARIO COMPLETO"),
                      systemImage: moment.disciplineXP > 0 ? "sparkles" : "checkmark.circle")
                    .font(.mono(8.5, .bold))
                    .foregroundStyle(halo.tintSoft)
                Spacer()
                HStack(spacing: 6) {
                    Image(systemName: account.isSignedIn ? "checkmark.icloud.fill" : "seal.fill")
                    // Signed in, the award syncs to /api/progress; otherwise
                    // it lives only in this device's storage.
                    Text(account.isSignedIn ? L.t("SAVED TO YOUR ACCOUNT", "GUARDADO EN TU CUENTA")
                                            : L.t("SAVED ON THIS DEVICE", "GUARDADO EN ESTE TELÉFONO"))
                }
                .font(.mono(7.5, .bold))
                .foregroundStyle(Color(hue: 0.115, saturation: 0.52, brightness: 1))
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(Theme.panel.opacity(0.74))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(halo.tint.opacity(0.18), lineWidth: 1))
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [halo.tint.opacity(0.12), Theme.card, Color(hue: 0.115, saturation: 0.45, brightness: 0.18).opacity(0.35)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(halo.tint.opacity(0.32), lineWidth: 1))
        .transition(.scale(scale: 0.92).combined(with: .opacity))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(moment.disciplineXP > 0
            ? L.t("No trade for \(moment.symbol). Waiting is an option. Plus \(moment.disciplineXP) discipline XP.",
                  "No operar \(moment.symbol). Esperar es una opción. Más \(moment.disciplineXP) XP de disciplina.")
            : L.t("No trade for \(moment.symbol). Waiting is an option. Daily XP complete.",
                  "No operar \(moment.symbol). Esperar es una opción. XP diario completo."))
    }

    private func harvestCard(_ moment: HarvestMoment, showsXP: Bool = true) -> some View {
        HarvestCard(moment: moment, showsXP: showsXP, onOpen: { focus in openLand(focus) }, onSaveProgress: { showAccount = true },
                    onExtend: { horizon in
                        // The island changed: the chip reads it again once the answer is in.
                        Task { if await vm.extendSeed(to: horizon) { await pulse.refresh() } }
                    })
    }

    private func openLand(_ focus: TraderLandFocus?, haptic: UIImpactFeedbackGenerator.FeedbackStyle? = nil) {
        if let haptic { UIImpactFeedbackGenerator(style: haptic).impactOccurred() }
        landRequest = LandRequest(focus: focus)
    }

    private var commandDeck: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(L.t("QUICK ACCESS", "ACCESO RÁPIDO"))
                .font(.mono(9, .bold))
                .kerning(1.8)
                .foregroundStyle(Theme.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        showBoard = true
                    } label: {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(L.t("EXPLORE", "EXPLORA"))
                                .font(.mono(13, .bold))
                                .foregroundStyle(Theme.accentSoft)
                            Text(L.t("TOP MARKETS →", "VER MERCADOS →"))
                                .font(.mono(8, .bold))
                                .kerning(1)
                                .foregroundStyle(Theme.muted)
                        }
                        .frame(width: 92, alignment: .leading)
                        .padding(12)
                        .background(Theme.accent.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.accent.opacity(0.30), lineWidth: 1))
                    }
                    .accessibilityIdentifier("board-open")
                    ForEach(vm.quickAccess, id: \.self) { ticker in
                        Button {
                            vm.ask(ticker)
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(ticker)
                                    .font(.mono(13, .bold))
                                    .foregroundStyle(Theme.text)
                                Text(L.t("ANALYZE  →", "ANALIZAR  →"))
                                    .font(.mono(8, .bold))
                                    .kerning(1)
                                    .foregroundStyle(Theme.accentSoft)
                            }
                            .frame(width: 92, alignment: .leading)
                            .padding(12)
                            .background(Theme.card)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))
                        }
                    }
                }
            }
        }
        .padding(13)
        .card()
    }

    private var marketSurface: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let snapshot = vm.snapshot {
                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 7) {
                            Text(snapshot.symbol)
                                .font(.mono(15, .bold))
                                .foregroundStyle(Theme.text)
                            Text(snapshot.isEquity ? L.t("EQUITY", "ACCIÓN") : L.t("CRYPTO", "CRIPTO"))
                                .font(.mono(8, .bold))
                                .kerning(1.2)
                                .foregroundStyle(Theme.muted)
                        }
                        if let price = snapshot.price ?? vm.lastAnswer?.price {
                            Text(BobbyAnswer.money(price))
                                .font(.rounded(34, .bold))
                                .foregroundStyle(Theme.text)
                                .contentTransition(.numericText())
                        }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 6) {
                        Text("\(vm.timeframe.rawValue) // " + L.t("LIVE", "EN VIVO"))
                            .font(.mono(9, .bold))
                            .foregroundStyle(Theme.muted)
                        if let change = snapshot.changePct {
                            Text(String(format: "%@%.2f%%", change >= 0 ? "+" : "", change))
                                .font(.mono(13, .bold))
                                .foregroundStyle(change >= 0 ? Theme.up : Theme.down)
                        }
                    }
                }

                HStack(spacing: 5) {
                    ForEach(MarketTimeframe.available(isEquity: snapshot.isEquity)) { timeframe in
                        Button {
                            vm.selectTimeframe(timeframe)
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        } label: {
                            Text(timeframe.rawValue)
                                .font(.mono(9, .bold))
                                .foregroundStyle(vm.timeframe == timeframe ? Theme.bg : Theme.muted)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                                .background(
                                    RoundedRectangle(cornerRadius: 6)
                                        .fill(vm.timeframe == timeframe ? Theme.text : Theme.cardSoft)
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Theme.panel.opacity(0.84))
                    if vm.candles.isEmpty {
                        VStack(spacing: 9) {
                            if vm.candlesLoading { ProgressView().tint(Theme.accentSoft) }
                            Text(vm.candlesLoading ? L.t("SYNCING CANDLES", "SINCRONIZANDO VELAS") : L.t("CHART UNAVAILABLE", "GRÁFICO NO DISPONIBLE"))
                                .font(.mono(9, .bold))
                                .kerning(1.5)
                                .foregroundStyle(Theme.muted)
                            if !vm.candlesLoading {
                                Button(L.t("Retry", "Reintentar")) { vm.selectTimeframe(vm.timeframe, retry: true) }
                                    .disabled(vm.thinking)
                            }
                        }
                    } else {
                        ChartView(
                            candles: vm.candles,
                            answer: vm.timeframe == .oneHour ? vm.lastAnswer : nil,
                            timeframe: vm.timeframe
                        )
                            .padding(.horizontal, 3)
                            .padding(.vertical, 8)
                    }
                }
                .frame(height: 294)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))

                HStack {
                    Text(MarketSnapshot.sourceLabel(isEquity: snapshot.isEquity))
                    Spacer()
                    Text("\(vm.candles.count) OHLCV · \(vm.timeframe.rawValue)")
                }
                .font(.mono(7.5, .bold))
                .kerning(0.7)
                .foregroundStyle(Theme.muted.opacity(0.75))

                if let answer = vm.lastAnswer {
                    indicatorStrip(answer)
                    levelStrip(answer)
                }
            }
        }
        .padding(14)
        .background(Theme.card)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.accent.opacity(0.18), lineWidth: 1))
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    private func indicatorStrip(_ answer: BobbyAnswer) -> some View {
        HStack(spacing: 7) {
            if let trend = answer.trend {
                // Color decides on the raw server value; the label is localized.
                deskChip(BobbyAnswer.localizedTrend(trend).uppercased(),
                         trend == "alcista" ? Theme.up : trend == "bajista" ? Theme.down : Theme.muted)
            }
            if let rsi = answer.rsi { deskChip("RSI \(Int(rsi))", Theme.accentSoft) }
            if let conviction = answer.convictionPct { deskChip("CONV \(Int(conviction))%", Theme.cio) }
            Spacer(minLength: 0)
        }
    }

    private func levelStrip(_ answer: BobbyAnswer) -> some View {
        HStack(spacing: 0) {
            levelCell(L.t("ENTRY", "ENTRADA"), answer.entry, Theme.accentSoft)
            divider
            levelCell("STOP", answer.stop, Theme.down)
            divider
            levelCell(L.t("TARGET", "OBJETIVO"), answer.target, Theme.up)
        }
        .padding(.vertical, 8)
        .background(Theme.panel.opacity(0.74))
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }

    private func levelCell(_ label: String, _ value: Double?, _ color: Color) -> some View {
        VStack(spacing: 3) {
            Text(label).font(.mono(8, .bold)).kerning(1.3).foregroundStyle(Theme.muted)
            Text(value.map(BobbyAnswer.money) ?? "—")
                .font(.mono(11, .bold))
                .foregroundStyle(value == nil ? Theme.muted : color)
        }
        .frame(maxWidth: .infinity)
    }

    private var divider: some View {
        Rectangle().fill(Theme.stroke).frame(width: 1, height: 28)
    }

    private var debateRail: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(L.t("ADVERSARIAL DESK", "MESA DE DEBATE"))
                    .font(.mono(9, .bold))
                    .kerning(1.8)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text(vm.thinking ? L.t("LIVE", "EN VIVO") : L.t("COMPLETE", "COMPLETO"))
                    .font(.mono(9, .bold))
                    .foregroundStyle(vm.thinking ? Theme.accentSoft : Theme.up)
            }
            HStack(spacing: 7) {
                agentCard(name: L.t("ALPHA", "CAZADOR"), role: L.t("hunts", "busca"), phase: .alpha, color: Theme.up)
                agentCard(name: L.t("RED TEAM", "CRÍTICO"), role: L.t("attacks", "ataca"), phase: .redTeam, color: Theme.down)
                agentCard(name: L.t("CIO", "DIRECTOR"), role: L.t("decides", "decide"), phase: .cio, color: Theme.cio)
            }
            if let answer = vm.lastAnswer, let alpha = answer.alphaArgument, let red = answer.redArgument {
                Text(L.t("ALPHA", "CAZADOR")).font(.mono(10, .bold)).foregroundStyle(Theme.up)
                Text(alpha).font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
                Text(L.t("RED TEAM", "CRÍTICO")).font(.mono(10, .bold)).foregroundStyle(Theme.down)
                Text(red).font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
                if let label = answer.evidenceLabel {
                    Text(label).font(.mono(9, .medium)).foregroundStyle(Theme.muted)
                    Text(L.t("Analysis uses 1H candles; the chart interval can be changed separately.", "El análisis usa velas de 1H; puedes cambiar por separado el intervalo del gráfico."))
                        .font(.system(size: 11)).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(13)
        .card()
    }

    private func agentCard(name: String, role: String, phase: DeskPhase, color: Color) -> some View {
        let reached = vm.lastAnswer?.agentVerdict != nil
        let active = vm.thinking
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 5) {
                Circle()
                    .fill(reached ? color : Theme.muted.opacity(0.35))
                    .frame(width: 6, height: 6)
                    .shadow(color: active ? color : .clear, radius: 5)
                Spacer()
                Image(systemName: reached && !active ? "checkmark" : active ? "waveform" : "minus")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundStyle(reached ? color : Theme.muted.opacity(0.40))
                    .symbolEffect(.variableColor.iterative, options: .repeating, isActive: active)
            }
            Text(name)
                .font(.mono(9, .bold))
                .kerning(name == "RED TEAM" ? 0.2 : 0.8)
                .foregroundStyle(reached ? color : Theme.muted)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            Text(agentDetail(phase, fallback: role))
                .font(.mono(8, .medium))
                .foregroundStyle(Theme.muted)
                .lineLimit(2)
                .frame(minHeight: 20, alignment: .topLeading)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(active ? 0.09 : 0.025))
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .overlay(RoundedRectangle(cornerRadius: 9).stroke(color.opacity(active ? 0.42 : 0.12), lineWidth: 1))
    }

    private func agentDetail(_ phase: DeskPhase, fallback: String) -> String {
        guard let answer = vm.lastAnswer else {
            return vm.phase == phase ? L.t("processing…", "procesando…") : fallback
        }
        if answer.agentVerdict != nil { return L.t("review complete", "revisión completa") }
        switch phase {
        case .alpha:
            return answer.trend.map {
                let word = BobbyAnswer.localizedTrend($0)
                return L.t("trend \(word)", "tendencia \(word)")
            } ?? fallback
        case .redTeam:
            return answer.stop.map { L.t("invalidates \(BobbyAnswer.money($0))", "invalida \(BobbyAnswer.money($0))") }
                ?? answer.support.map { L.t("support \(BobbyAnswer.money($0))", "soporte \(BobbyAnswer.money($0))") }
                ?? fallback
        case .cio:
            if let direction = answer.direction, let conviction = answer.convictionPct {
                if direction == "long" || direction == "short" {
                    return L.t("\(direction) \(Int(conviction))%",
                               "\(direction == "long" ? "alcista" : "bajista") \(Int(conviction))%")
                }
                return L.t("no edge \(Int(conviction))%", "sin sesgo \(Int(conviction))%")
            }
            return fallback
        default: return fallback
        }
    }

    private var verdictCard: some View {
        Group {
            if let answer = vm.lastAnswer {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text(L.t("CIO // VERDICT", "DIRECTOR // VEREDICTO"))
                            .font(.mono(10, .bold))
                            .kerning(1.6)
                            .foregroundStyle(Theme.cio)
                        Spacer()
                        Text(L.t("REFERENCE ONLY", "SOLO REFERENCIA"))
                            .font(.mono(8, .bold))
                            .foregroundStyle(Theme.muted)
                    }
                    Text(answer.summary)
                        .font(.rounded(15, .semibold))
                        .foregroundStyle(Theme.text.opacity(0.90))
                        .lineSpacing(4)
                    Text(L.t("General technical context · Bobby never executes trades", "Escenario técnico general · Bobby no ejecuta operaciones"))
                        .font(.mono(8, .medium))
                        .foregroundStyle(Theme.muted)
                }
                .padding(14)
                .background(
                    LinearGradient(colors: [Theme.cio.opacity(0.10), Theme.card], startPoint: .topLeading, endPoint: .bottomTrailing)
                )
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.cio.opacity(0.22), lineWidth: 1))
            }
        }
    }

    /// Search-as-you-type: the universe answers while the user types.
    private var assetSuggestions: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.assetHits) { hit in
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        vm.input = ""
                        vm.ask(hit.symbol)
                    } label: {
                        HStack(spacing: 6) {
                            Text(hit.symbol)
                                .font(.mono(11, .bold))
                                .foregroundStyle(Theme.text)
                            if hit.name != hit.symbol {
                                Text(hit.name)
                                    .font(.rounded(11, .medium))
                                    .foregroundStyle(Theme.muted)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 11)
                        .padding(.vertical, 8)
                        .background(Theme.card)
                        .clipShape(Capsule())
                        .overlay(Capsule().stroke(Theme.accent.opacity(0.30), lineWidth: 1))
                    }
                }
            }
            .padding(.horizontal, 2)
        }
        .transition(.opacity)
    }

    /// Type only. The send button wakes up once there is something to send.
    private var commandBar: some View {
        let canSend = !vm.thinking && !vm.input.trimmingCharacters(in: .whitespaces).isEmpty
        return HStack(spacing: 10) {
            TextField(L.t("Type…", "Escribe…"), text: $vm.input)
                .font(.rounded(14, .medium))
                .foregroundStyle(Theme.text)
                .focused($focused)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .onSubmit { focused = false; vm.ask() }
                .accessibilityLabel(L.t("Ask your companion", "Pregúntale a tu amigo"))
                .accessibilityIdentifier("ask-field")
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(focused ? Theme.accent.opacity(0.50) : Theme.stroke, lineWidth: 1))

            Button {
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                focused = false
                vm.ask()
            } label: {
                Image(systemName: "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 10).fill(Theme.accent))
                    .shadow(color: Theme.accent.opacity(canSend ? 0.30 : 0), radius: 10)
                    .opacity(canSend ? 1 : 0.4)
            }
            .accessibilityLabel(L.t("Send", "Enviar"))
            .accessibilityIdentifier("ask-send")
            .disabled(!canSend)
        }
        .padding(.horizontal, 14)
        .padding(.top, 8)
        .padding(.bottom, 8)
        .background(.ultraThinMaterial.opacity(0.75))
        .overlay(alignment: .top) { Rectangle().fill(Theme.stroke).frame(height: 1) }
    }

    private func deskChip(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.mono(9, .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Capsule().fill(color.opacity(0.09)))
            .overlay(Capsule().stroke(color.opacity(0.18), lineWidth: 1))
    }

    private var liveLevel: CGFloat {
        if vm.voice.speaking { return max(0.08, vm.voice.level) }
        return vm.thinking ? 0.34 : 0.08
    }

    private var statusLabel: String {
        if vm.voice.speaking { return L.t("SPEAKING", "HABLANDO") }
        return vm.phase.label(refusal: vm.refusal)
    }

    private var statusColor: Color {
        if vm.voice.speaking { return Theme.accentSoft }
        switch vm.phase {
        case .redTeam, .error: return Theme.down
        case .cio, .refused: return Theme.cio
        case .complete: return Theme.up
        default: return Theme.accentSoft
        }
    }

    /// Share my skin: the live 3D pose when the model is on stage, the
    /// companion's portrait otherwise — the menu item must always answer.
    private func shareSkin() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        guard let comp = vm.companions.companion else { return }
        if deskModelFailed {
            if let portrait = UIImage(named: "\(comp.id)_thumb") { skinShot = portrait }
        } else {
            skinSnapshotToken += 1
        }
    }

    private func focusAsk() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        focused = true
    }

}


extension UIImage: @retroactive Identifiable {
    public var id: ObjectIdentifier { ObjectIdentifier(self) }
}
