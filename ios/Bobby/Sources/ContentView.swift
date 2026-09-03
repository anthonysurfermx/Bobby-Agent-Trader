// Bobby Pocket War Room. The primary object is not a chat transcript: it is a
// live market surface with a voice-driven orb, adversarial review and an honest
// proof boundary. Text is the desk log, not the product shell.
import SwiftUI
import Combine

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    let fromBobby: Bool
    let text: String
}

enum DeskPhase: Int, CaseIterable {
    case idle = 0
    case resolving
    case alpha
    case redTeam
    case cio
    case complete
    case error

    var label: String {
        switch self {
        case .idle: return "DESK ONLINE"
        case .resolving: return L.t("RESOLVING ASSET", "LOCALIZANDO ACTIVO")
        case .alpha: return "ALPHA HUNTER"
        case .redTeam: return "RED TEAM"
        case .cio: return L.t("CIO DECIDES", "CIO DECIDE")
        case .complete: return L.t("VERDICT READY", "VEREDICTO LISTO")
        case .error: return L.t("INCOMPLETE LINK", "ENLACE INCOMPLETO")
        }
    }

    var hint: String {
        switch self {
        case .idle: return L.t("Tap your companion and name an asset", "Toca a tu companion y nombra un activo")
        case .resolving: return L.t("Resolving ticker and venue", "Resolviendo ticker y venue")
        case .alpha: return L.t("Hunting the opportunity", "Buscando la oportunidad")
        case .redTeam: return L.t("Attacking the thesis", "Atacando la tesis")
        case .cio: return L.t("Weighing risk against conviction", "Cruzando riesgo y convicción")
        case .complete: return L.t("Market, levels and thesis in sync", "Mercado, niveles y tesis sincronizados")
        case .error: return L.t("Try the name or the ticker", "Prueba con el nombre o ticker")
        }
    }
}

struct NoTradeMoment: Identifiable, Equatable {
    let id = UUID()
    let symbol: String
    let reason: String
    let disciplineXP: Int
}

@MainActor
final class BobbyViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var input = ""
    @Published var assetHits: [BobbyAPI.AssetHit] = []
    private var suggestTask: Task<Void, Never>?
    @Published var thinking = false
    @Published var candles: [Candle] = []
    @Published var snapshot: MarketSnapshot?
    @Published var lastAnswer: BobbyAnswer?
    @Published var speakEnabled = true
    @Published var phase: DeskPhase = .idle
    @Published var timeframe: MarketTimeframe = .oneHour
    @Published var noTradeMoment: NoTradeMoment? = nil

    let voice = NeuralVoice()
    let profile = AgentProfile()
    let companions = CompanionStore()
    private let memory = DeskMemory()
    static let defaultQuickAccess = ["BTC", "NVDA", "ETH", "TSLA", "GOLD"]
    @Published var streak = 0
    @Published var quickAccess: [String] = BobbyViewModel.defaultQuickAccess

    private var cancellables = Set<AnyCancellable>()

    init() {
        // Discipline streak, not an open-the-app streak: it only grows when
        // the user does something process-quality (see awardDiscipline).
        streak = companions.disciplineStreak
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
    }

    /// The companion IS the identity: its evolved name and its own voice.
    /// Falls back to the onboarding profile when no companion is chosen.
    var displayName: String {
        companions.companion?.name(at: companions.level.number) ?? profile.name
    }
    var voicePersona: String? { companions.companion?.voicePersona }

    /// Greeting in the companion's own words (selectLine is first person and
    /// grammatical in both languages), with the tone its level earned.
    var companionGreeting: String {
        guard let comp = companions.companion else { return profile.greeting }
        return "\(displayName): \(comp.selectLine)" + levelTone(companions.level.number)
    }

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
        let name = displayName
        func pct(_ m: BobbyAPI.Mover) -> String {
            let sign = m.changePct >= 0 ? "+" : "-"
            return "\(sign)\(String(format: "%.1f", abs(m.changePct)))%"
        }
        guard let first = movers.first else {
            return L.t("\(name): I'm in. Welcome to the desk — name an asset and we go.",
                       "\(name): Ya estoy dentro. Bienvenido al desk: nombra un activo y le entramos.")
        }
        let firstUp = first.changePct >= 0
        let tail: String = movers.dropFirst().first.map { " \($0.symbol) \(pct($0))." } ?? ""
        switch profile.vibe {
        case .chill:
            return firstUp
                ? L.t("\(name): Yo, we're live. \(first.symbol) is up \(pct(first)) in 24h.\(tail) Wanna take a look?",
                      "\(name): Ey, ya estamos en vivo. \(first.symbol) subió \(pct(first)) en 24 horas.\(tail) ¿Le echamos un ojo?")
                : L.t("\(name): Yo, we're live. \(first.symbol) dropped \(pct(first)) in 24h.\(tail) Wanna see if it's a chance?",
                      "\(name): Ey, ya estamos en vivo. \(first.symbol) cayó \(pct(first)) en 24 horas.\(tail) ¿Vemos si es oportunidad?")
        case .directo:
            return L.t("\(name): Desk open. Biggest move: \(first.symbol) \(pct(first)) in 24h.\(tail) Say the word.",
                       "\(name): Desk abierto. Mayor movimiento: \(first.symbol) \(pct(first)) en 24 horas.\(tail) Tú dices.")
        case .pro:
            return L.t("\(name): Session open. Lead mover \(first.symbol) \(pct(first)) over 24h.\(tail) Pick one and I run the desk.",
                       "\(name): Sesión abierta. Líder del día: \(first.symbol) \(pct(first)) en 24 horas.\(tail) Elige uno y corro el desk.")
        }
    }

    func bootGreetingIfNeeded() {
        guard messages.isEmpty else { return }
        messages.append(ChatMessage(fromBobby: true, text: companionGreeting))

        // Live movers make the greeting: real numbers, spoken in the
        // companion's own voice, once. Replaces the static line as soon as
        // the tickers arrive (~300 ms) so the desk never opens flat.
        Task {
            let movers = await BobbyAPI.topMovers(limit: 2)
            guard messages.count == 1 else { return }
            let hype = hypeGreeting(movers)
            withAnimation(.spring(duration: 0.35)) { messages[0] = ChatMessage(fromBobby: true, text: hype) }
            if speakEnabled { sayAmbient(hype) }
        }

        // Memory v1 recap: if the user asked about something on a previous
        // day, follow up with its live daily move — real data or nothing.
        guard let recap = memory.recapAsset() else { return }
        Task {
            let market = await BobbyAPI.market(recap.symbol)
            let move: String
            if let change = market.changePct {
                move = L.t(" It is \(change >= 0 ? "up " : "down ")\(String(format: "%.1f", abs(change)))% today.", " Hoy va \(change >= 0 ? "+" : "-")\(String(format: "%.1f", abs(change)))%.")
            } else {
                move = ""
            }
            let text: String
            switch profile.vibe {
            case .chill: text = L.t("Last time you were watching \(recap.symbol).\(move) Want another look?", "La última vez andabas viendo \(recap.symbol).\(move) ¿Le damos otra vuelta?")
            case .directo: text = L.t("Your last query: \(recap.symbol).\(move) Should I run it again?", "Tu última consulta: \(recap.symbol).\(move) ¿Analizo de nuevo?")
            case .pro: text = L.t("Following up on \(recap.symbol):\(move.isEmpty ? " no intraday data." : move) Refresh the read?", "Seguimiento de \(recap.symbol):\(move.isEmpty ? " sin dato intradía." : move) ¿Actualizo la lectura?")
            }
            guard messages.count == 1 else { return }
            withAnimation(.spring(duration: 0.4)) {
                messages.append(ChatMessage(fromBobby: true, text: text))
            }
        }
    }

    /// Hands-free mode: true while the conversation is voice-driven — after
    /// Bobby finishes speaking an answer, the mic reopens on its own.
    @Published var handsFree = false

    /// Search-as-you-type over the full universe: quiet, debounced, and it
    /// never fires while a question is in flight.
    func updateSuggestions() {
        suggestTask?.cancel()
        let q = input.trimmingCharacters(in: .whitespaces)
        // Multi-word stays live: "taiwan semi…", "bitcoin cash" and "open ai"
        // suggest just like single tickers — the backend understands phrases.
        guard q.count >= 2, q.count <= 32 else {
            if !assetHits.isEmpty { assetHits = [] }
            return
        }
        suggestTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 220_000_000)
            guard !Task.isCancelled else { return }
            let hits = await BobbyAPI.searchAssets(q)
            guard !Task.isCancelled else { return }
            self.assetHits = hits
        }
    }

    func ask(_ preset: String? = nil, fromVoice: Bool = false) {
        suggestTask?.cancel()
        assetHits = []
        let q = (preset ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !thinking else { return }
        handsFree = fromVoice
        input = ""
        voice.stop()
        messages.append(ChatMessage(fromBobby: false, text: q))
        thinking = true
        phase = .resolving
        lastAnswer = nil
        noTradeMoment = nil

        Task {
            defer { thinking = false }

            guard let resolution = await BobbyAPI.resolveAsset(q) else {
                phase = .error
                messages.append(ChatMessage(fromBobby: true, text: L.t("I could not resolve that asset. Try a name or ticker: bitcoin, NVDA, gold.", "No pude resolver ese activo. Prueba con el nombre o ticker: bitcoin, NVDA, oro.")))
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
                text += " " + L.t("Tap the chip to confirm.", "Toca el chip para confirmar.")
                messages.append(ChatMessage(fromBobby: true, text: text))
                assetHits = [BobbyAPI.AssetHit(
                    symbol: sym,
                    name: resolution.confirmName,
                    assetClass: resolution.snapshot.isEquity ? "equity" : "crypto"
                )]
                return
            }
            let asset = resolution.snapshot

            memory.recordQuery(symbol: asset.symbol, isEquity: asset.isEquity)
            quickAccess = memory.quickAccess(fallback: Self.defaultQuickAccess)

            async let marketRequest = BobbyAPI.market(asset.symbol)
            async let candleRequest = BobbyAPI.candles(
                symbol: asset.symbol,
                isEquity: asset.isEquity,
                timeframe: timeframe
            )
            async let debateRequest = BobbyAPI.debate(asset.symbol)

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
                phase = .redTeam
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
                phase = .error
                let msg = L.t("The desk did not answer for \(answer.symbol). Try again in a moment.",
                              "El desk no respondió por \(answer.symbol). Inténtalo de nuevo en un momento.")
                messages.append(ChatMessage(fromBobby: true, text: msg))
                if speakEnabled { say(msg) }
                return
            }
            // Only now back-fill the quote for display/speech.
            if answer.price == nil, let quote = market.price {
                answer.price = quote
                lastAnswer = answer
            }

            try? await Task.sleep(for: .milliseconds(360))
            phase = .complete
            let text = answer.summary
            messages.append(ChatMessage(fromBobby: true, text: text))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if speakEnabled { say(text) }
            // A full review earns discipline. Respecting a fail-closed verdict
            // earns more because restraint is the behavior Bobby is teaching.
            // awardedXP is what the daily cap ACTUALLY granted — the UI shows
            // that number, never the intent.
            let awardedXP = companions.awardDiscipline(answer.isNoTrade ? 20 : 10, kind: answer.isNoTrade ? "no_trade_respected" : "read_complete")
            if awardedXP > 0 { streak = companions.disciplineStreak }
            Task { await ProgressSync.shared.sync(store: companions, profile: profile) }
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

    func selectTimeframe(_ next: MarketTimeframe) {
        guard next != timeframe else { return }
        timeframe = next
        candles = []
        guard let snapshot else { return }

        Task {
            let rows = await BobbyAPI.candles(
                symbol: snapshot.symbol,
                isEquity: snapshot.isEquity,
                timeframe: next
            )
            guard self.timeframe == next, self.snapshot?.symbol == snapshot.symbol else { return }
            withAnimation(.easeOut(duration: 0.28)) { candles = rows }
        }
    }
}

struct ContentView: View {
    @StateObject private var vm = BobbyViewModel()
    @StateObject private var speech = SpeechInput()
    @FocusState private var focused: Bool
    @State private var showAuraCard = false
    @State private var showSquad = false
    @State private var showBoard = false
    @State private var showRiskNotice = false
    @State private var showAccount = false
    @ObservedObject private var account = AccountSession.shared
    @State private var inspectedTool: CompanionTool?
    @State private var showCatalog = false
    @State private var showWorld = false
    @State private var petDetail = false
    @State private var skinSnapshotToken = 0
    @State private var skinCard: UIImage?
    @State private var equipToolId: String?
    @State private var equipToken = 0
    /// The desk never shows an empty hole: if the companion GLB fails to
    /// load, fall back to the orb until the companion changes.
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
                    equipToolId = drop.id
                    equipToken += 1
                }
                .transition(.opacity)
                .zIndex(11)
            }
        }
        .onChange(of: vm.companions.pendingEvolution?.number) { _, newLevel in
            guard let newLevel, let comp = vm.companions.companion else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            let evolvedName = comp.name(at: newLevel)
            vm.say(L.t("I evolved. Call me \(evolvedName) now.\(levelTone(newLevel))",
                       "Evolucioné. Ahora dime \(evolvedName).\(levelTone(newLevel))"))
        }
        .onAppear {
            if vm.profile.acceptedRiskNotice && vm.profile.onboarded { vm.bootGreetingIfNeeded() }
            Task { await ProgressSync.shared.sync(store: vm.companions, profile: vm.profile) }
        }
        .task { await SpeechInput.refreshVocabularyIfStale() }
        .onChange(of: vm.input) { vm.updateSuggestions() }
        // Hands-free loop: when a voice-driven answer finishes speaking, the
        // mic reopens on its own so the follow-up flows like a conversation.
        .onChange(of: vm.voice.speaking) { wasSpeaking, isSpeaking in
            guard wasSpeaking, !isSpeaking, vm.phase == .complete else { return }
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(420))
                relistenHandsFree()
            }
        }
        .sheet(isPresented: $showBoard) {
            AssetBoardView(vm: vm)
        }
        .sheet(item: $inspectedTool) { tool in
            ToolDetailSheet(companion: vm.companions.companion ?? bobbyCompanions[0], tool: tool, xp: vm.companions.disciplineXP)
                .presentationDetents([.medium])
                .presentationBackground(Theme.bg)
        }
        .sheet(isPresented: $showCatalog) {
            GearCatalogSheet(current: vm.companions.companion ?? bobbyCompanions[0], xp: vm.companions.disciplineXP, level: vm.companions.level.number)
                .presentationDetents([.large])
                .presentationBackground(Theme.bg)
        }
        .sheet(isPresented: $showWorld) {
            WorldMapSheet(xp: vm.companions.disciplineXP, level: vm.companions.level.number)
                .presentationDetents([.large])
                .presentationBackground(Theme.bg)
        }
        .sheet(isPresented: $petDetail) {
            PetDetailSheet(companion: vm.companions.companion ?? bobbyCompanions[0], xp: vm.companions.disciplineXP)
                .presentationDetents([.medium])
                .presentationBackground(Theme.bg)
        }
        .sheet(item: $skinCard) { card in
            ShareSheet(items: [card, L.t("My Bobby skin — earned with discipline, never volume. bobbyprotocol.xyz", "Mi skin de Bobby — ganada con disciplina, nunca volumen. bobbyprotocol.xyz")])
        }
        .sheet(isPresented: $showRiskNotice) {
            RiskNoticeView(profile: vm.profile, readOnly: true) { showRiskNotice = false }
        }
        .sheet(isPresented: $showAccount) {
            AccountSheet(store: vm.companions, profile: vm.profile) { showAccount = false }
        }
        .sheet(isPresented: $showSquad) {
            MascotGalleryView(store: vm.companions, voice: vm.voice, voiceId: vm.profile.voiceId)
        }
        .sheet(isPresented: $showAuraCard) {
            AuraCardSheet(data: AuraCardData(
                agentName: vm.profile.name,
                auraText: vm.profile.auraText,
                tint: vm.profile.auraTint,
                tintSoft: vm.profile.auraTintSoft,
                archetype: vm.profile.auraArchetype,
                streak: vm.streak,
                insight: vm.lastAnswer.flatMap { answer in
                    vm.snapshot.map { ($0.symbol, answer.summary) }
                }
            ), soundEnabled: vm.speakEnabled)
        }
        .onChange(of: vm.profile.onboarded) {
            vm.messages = []
            vm.bootGreetingIfNeeded()
        }
        .alert(item: $speech.issue) { issue in
            Alert(
                title: Text(L.t("Voice input unavailable", "Entrada de voz no disponible")),
                message: Text(issue.message),
                primaryButton: issue.canOpenSettings
                    ? .default(Text(L.t("Open Settings", "Abrir Ajustes"))) {
                        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                        UIApplication.shared.open(url)
                    }
                    : .default(Text(L.t("Try again", "Reintentar"))),
                secondaryButton: .cancel()
            )
        }
        .animation(.easeOut(duration: 0.35), value: vm.profile.onboarded)
        .animation(.easeOut(duration: 0.35), value: vm.profile.acceptedRiskNotice)
    }

    private var mainScreen: some View {
        VStack(spacing: 0) {
            deskHeader
            ScrollView {
                LazyVStack(spacing: 12) {
                    if let moment = vm.noTradeMoment {
                        noTradeSignature(moment)
                    } else {
                        liveConsole
                    }
                    if vm.snapshot == nil && !vm.thinking { commandDeck }
                    if vm.snapshot != nil { marketSurface }
                    if vm.snapshot != nil || vm.thinking { debateRail }
                    if vm.lastAnswer != nil { verdictCard }
                    deskLog
                    proofBoundary
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            if !vm.assetHits.isEmpty {
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
            VStack(alignment: .leading, spacing: 1) {
                Text("BOBBY // LIVE DESK")
                    .font(.mono(12, .bold))
                    .kerning(2.4)
                    .foregroundStyle(Theme.text.opacity(0.80))
                if let comp = vm.companions.companion {
                    Text("\(comp.name(at: vm.companions.level.number)) · \(vm.companions.level.name)")
                        .font(.mono(7.5, .semibold))
                        .kerning(1.2)
                        .foregroundStyle(comp.tintSoft.opacity(0.8))
                }
            }
            Spacer()
            Button {
                vm.speakEnabled.toggle()
                if !vm.speakEnabled { vm.voice.stop() }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                Image(systemName: vm.speakEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(vm.speakEnabled ? Theme.accentSoft : Theme.muted)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Theme.card))
                    .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
            }
            // Aura, streak and read-only live in the menu — the header breathes
            Menu {
                // The explore board must stay reachable after the first
                // analysis (commandDeck hides once a snapshot exists).
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showBoard = true
                } label: {
                    Label(L.t("Explore markets", "Explorar mercados"), systemImage: "square.grid.2x2")
                }
                Button {
                    showAuraCard = true
                } label: {
                    Label(L.t("My aura", "Mi aura"), systemImage: "sparkles")
                }
                Button {
                    showWorld = true
                } label: {
                    Label(L.t("Trader Land · soon", "Trader Land · pronto"), systemImage: "map")
                }
                Section {
                    Label(vm.streak >= 1 ? L.t("Discipline streak: \(vm.streak) day\(vm.streak == 1 ? "" : "s") 🔥", "Racha de disciplina: \(vm.streak) día\(vm.streak == 1 ? "" : "s") 🔥") : L.t("No streak yet — review an analysis", "Sin racha aún — revisa un análisis"),
                          systemImage: "flame")
                    Label(L.t("READ ONLY — Bobby never executes", "READ ONLY — Bobby no ejecuta"), systemImage: "lock.shield")
                }
                Section {
                    // Reachable from every screen, not just first-run onboarding.
                    Button { skinSnapshotToken += 1 } label: {
                        Label(L.t("Share my skin", "Compartir mi skin"), systemImage: "square.and.arrow.up")
                    }
                    Button { showAccount = true } label: {
                        Label(account.isSignedIn ? L.t("Progress saved · account", "Progreso guardado · cuenta") : L.t("Save progress", "Guardar progreso"), systemImage: account.isSignedIn ? "checkmark.icloud" : "icloud")
                    }
                    Button { showRiskNotice = true } label: {
                        Label(L.t("Risk notice", "Aviso de riesgo"), systemImage: "exclamationmark.triangle")
                    }
                    Link(destination: URL(string: "https://bobbyprotocol.xyz/privacy")!) {
                        Label(L.t("Privacy Policy", "Aviso de privacidad"), systemImage: "hand.raised")
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
            Button(action: toggleSpeech) {
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
                            onSnapshot: { shot in
                                skinCard = SkinCard.render(
                                    snapshot: shot, companion: comp, level: vm.companions.level,
                                    gear: CompanionToolkit.wornGear(companionId: comp.id, xp: vm.companions.disciplineXP),
                                    pet: CompanionToolkit.petUnlocked(companionId: comp.id, xp: vm.companions.disciplineXP) ? CompanionToolkit.pet(for: comp.id) : nil,
                                    xp: vm.companions.disciplineXP)
                            }
                        )
                            .allowsHitTesting(false)
                            .frame(width: 206, height: 208)
                            .shadow(color: comp.tint.opacity(0.35), radius: 26)
                    } else {
                        BobbyOrb(
                            size: 206,
                            thinking: vm.thinking,
                            speaking: vm.voice.speaking,
                            listening: speech.listening,
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

            Text(statusHint)
                .font(.mono(10, .medium))
                .kerning(0.6)
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .frame(minHeight: 18)

            // The gear belt: three slots that fill with discipline — first
            // read, then every 100 XP, the last one golden.
            if let comp = vm.companions.companion, !speech.listening {
                ToolBelt(companion: comp, xp: vm.companions.disciplineXP, onTap: { tool in
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    inspectedTool = tool
                }, onPet: {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    petDetail = true
                }, onPlus: {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showCatalog = true
                }, onWorld: {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    showWorld = true
                })
                .padding(.top, 4)
            }

            if speech.listening && !vm.input.isEmpty {
                Text("“\(vm.input)”")
                    .font(.rounded(16, .semibold))
                    .foregroundStyle(Theme.text)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 18)
                    .padding(.top, 5)
                    .transition(.opacity)
            }
        }
        .padding(.top, 2)
        .padding(.bottom, 4)
    }

    private func noTradeSignature(_ moment: NoTradeMoment) -> some View {
        let halo = bobbyCompanions.first { $0.id == "halo" }!
        return VStack(spacing: 8) {
            HStack {
                Text("HALO // RISK GATE")
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
                .accessibilityLabel("Dismiss no trade moment")
            }

            ZStack {
                Circle()
                    .fill(halo.tint.opacity(0.08))
                    .frame(width: 224, height: 224)
                    .overlay(Circle().stroke(halo.tint.opacity(0.28), lineWidth: 1))
                    .shadow(color: halo.tint.opacity(0.34), radius: 32)
                MascotSceneView(assetName: halo.id, interactive: false, emoteEvent: CompanionEmoteEvent(id: moment.id, emote: .shield))
                    .allowsHitTesting(false)
                    .frame(width: 206, height: 206)
                Image(systemName: "checkmark.shield.fill")
                    .font(.system(size: 42, weight: .bold))
                    .foregroundStyle(halo.tintSoft.opacity(0.92))
                    .offset(y: 72)
                    .shadow(color: halo.tint, radius: 14)
                    .symbolEffect(.pulse, options: .repeating.speed(0.7))
            }
            .frame(height: 224)

            Text("NO TRADE")
                .font(.mono(24, .black))
                .kerning(4)
                .foregroundStyle(halo.tintSoft)
            Text(L.t("No setup yet. Capital protected.", "Sin setup todavía. Capital protegido."))
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
                    Image(systemName: "seal.fill")
                    // Honest until the server/on-chain ledger exists: this
                    // record lives only in this device's storage.
                    Text(L.t("SAVED ON THIS DEVICE", "GUARDADO EN ESTE EQUIPO"))
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
        .accessibilityLabel("No trade for \(moment.symbol). Capital protected. Plus \(moment.disciplineXP) discipline XP.")
    }

    private var commandDeck: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("QUICK ACCESS")
                    .font(.mono(9, .bold))
                    .kerning(1.8)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text("VOICE OR TEXT")
                    .font(.mono(9, .medium))
                    .foregroundStyle(Theme.accentSoft.opacity(0.72))
            }
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
                            Text(L.t("TOP MARKETS →", "TOP MERCADOS →"))
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
                            Text(snapshot.isEquity ? "EQUITY" : "CRYPTO")
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
                        Text("\(vm.timeframe.rawValue) // LIVE")
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
                    ForEach(MarketTimeframe.allCases) { timeframe in
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
                            ProgressView().tint(Theme.accentSoft)
                            Text("SYNCING CANDLES")
                                .font(.mono(9, .bold))
                                .kerning(1.5)
                                .foregroundStyle(Theme.muted)
                        }
                    } else {
                        ChartView(
                            candles: vm.candles,
                            answer: vm.lastAnswer,
                            timeframe: vm.timeframe
                        )
                            .padding(.horizontal, 3)
                            .padding(.vertical, 8)
                    }
                }
                .frame(height: 294)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))

                HStack {
                    Text(snapshot.isEquity ? "YAHOO FINANCE · EQUITIES" : "OKX · CRYPTO MARKET")
                    Spacer()
                    Text("100 OHLCV · LIVE")
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
            levelCell("ENTRY", answer.entry, Theme.accentSoft)
            divider
            levelCell("STOP", answer.stop, Theme.down)
            divider
            levelCell("TARGET", answer.target, Theme.up)
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
                Text("ADVERSARIAL DESK")
                    .font(.mono(9, .bold))
                    .kerning(1.8)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text(vm.thinking ? "LIVE" : "COMPLETE")
                    .font(.mono(9, .bold))
                    .foregroundStyle(vm.thinking ? Theme.accentSoft : Theme.up)
            }
            HStack(spacing: 7) {
                agentCard(name: "ALPHA", role: L.t("hunts", "busca"), phase: .alpha, color: Theme.up)
                agentCard(name: "RED TEAM", role: L.t("attacks", "ataca"), phase: .redTeam, color: Theme.down)
                agentCard(name: "CIO", role: L.t("decides", "decide"), phase: .cio, color: Theme.cio)
            }
        }
        .padding(13)
        .card()
    }

    private func agentCard(name: String, role: String, phase: DeskPhase, color: Color) -> some View {
        let reached = vm.phase.rawValue >= phase.rawValue && vm.phase != .error
        let active = vm.phase == phase
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
                if direction == "long" || direction == "short" { return "\(direction) \(Int(conviction))%" }
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
                        Text("CIO // VERDICT")
                            .font(.mono(10, .bold))
                            .kerning(1.6)
                            .foregroundStyle(Theme.cio)
                        Spacer()
                        Text("REFERENCE ONLY")
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

    private var deskLog: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("DESK LOG")
                .font(.mono(9, .bold))
                .kerning(1.8)
                .foregroundStyle(Theme.muted)
                .padding(.bottom, 8)
            ForEach(vm.messages.suffix(3)) { message in
                HStack(alignment: .top, spacing: 10) {
                    Text(message.fromBobby ? "BOBBY" : L.t("YOU", "TÚ"))
                        .font(.mono(8, .bold))
                        .kerning(1)
                        .foregroundStyle(message.fromBobby ? Theme.accentSoft : Theme.muted)
                        .frame(width: 42, alignment: .leading)
                    Text(message.text)
                        .font(.rounded(13, .medium))
                        .foregroundStyle(Theme.text.opacity(message.fromBobby ? 0.78 : 0.58))
                        .lineLimit(message.fromBobby ? 4 : 2)
                    Spacer(minLength: 0)
                }
                .padding(.vertical, 9)
                .overlay(alignment: .bottom) { Rectangle().fill(Theme.stroke).frame(height: 1) }
            }
        }
        .padding(13)
        .card()
    }

    private var proofBoundary: some View {
        HStack(spacing: 11) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.accentSoft)
            VStack(alignment: .leading, spacing: 3) {
                Text("BOBBY LEARNS IN PUBLIC")
                    .font(.mono(9, .bold))
                    .kerning(1.1)
                    .foregroundStyle(Theme.accentSoft)
                Text(L.t("His calls are recorded on-chain and anyone can challenge them · this query does not mint an individual receipt yet", "Sus calls se graban on-chain y cualquiera puede retarlas · esta consulta aún no genera receipt individual"))
                    .font(.mono(8, .medium))
                    .foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .padding(13)
        .background(Theme.accent.opacity(0.045))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.accent.opacity(0.15), lineWidth: 1))
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

    private var commandBar: some View {
        HStack(spacing: 10) {
            TextField(speech.listening ? L.t("Listening…", "Te escucho…") : L.t("Ask about BTC, NVDA, gold…", "Pregunta por BTC, NVDA, oro…"), text: $vm.input)
                .font(.rounded(14, .medium))
                .foregroundStyle(Theme.text)
                .focused($focused)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .onSubmit { vm.ask() }
                .accessibilityIdentifier("ask-field")
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(focused ? Theme.accent.opacity(0.50) : Theme.stroke, lineWidth: 1))

            Button {
                if vm.input.isEmpty && !vm.thinking { toggleSpeech() }
                else { speech.finish(); vm.ask(fromVoice: true) }
            } label: {
                Image(systemName: vm.input.isEmpty ? (speech.listening ? "waveform" : "mic.fill") : "arrow.up")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 44, height: 44)
                    .background(RoundedRectangle(cornerRadius: 10).fill(speech.listening ? Theme.down : Theme.accent))
                    .shadow(color: (speech.listening ? Theme.down : Theme.accent).opacity(0.30), radius: 10)
                    .symbolEffect(.variableColor.iterative, options: .repeating, isActive: speech.listening)
            }
            .disabled(vm.thinking || (!vm.input.isEmpty && vm.input.trimmingCharacters(in: .whitespaces).isEmpty))
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
        if speech.listening { return speech.level }
        if vm.voice.speaking { return max(0.08, vm.voice.level) }
        return vm.thinking ? 0.34 : 0.08
    }

    private var statusLabel: String {
        if speech.listening { return L.t("LISTENING", "ESCUCHANDO") }
        if vm.voice.speaking { return L.t("SPEAKING", "BOBBY HABLA") }
        return vm.phase.label
    }

    private var statusHint: String {
        if speech.listening {
            return vm.handsFree
                ? L.t("Hands-free · say your next question", "Manos libres · di tu siguiente pregunta")
                : L.t("Speak normally · it sends when you stop", "Habla normal · se envía cuando terminas")
        }
        if vm.voice.speaking { return L.t("Your companion reacts to the voice in real time", "Tu companion reacciona a la voz en tiempo real") }
        return vm.phase.hint
    }

    private var statusColor: Color {
        if speech.listening { return Theme.up }
        if vm.voice.speaking { return Theme.accentSoft }
        switch vm.phase {
        case .redTeam, .error: return Theme.down
        case .cio: return Theme.cio
        case .complete: return Theme.up
        default: return Theme.accentSoft
        }
    }

    private func toggleSpeech() {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        vm.voice.stop()
        if speech.listening { vm.handsFree = false } // manual stop exits the loop
        speech.toggle(
            onPartial: { vm.input = $0 },
            onFinal: { text in
                vm.input = text
                vm.ask(fromVoice: true)
            }
        )
    }

    /// The hands-free re-arm: called when Bobby finishes speaking a verdict in
    /// a voice-driven conversation. Same capture pipeline as toggleSpeech,
    /// without the toggle semantics.
    private func relistenHandsFree() {
        guard vm.handsFree, vm.speakEnabled, !speech.listening, !vm.thinking else { return }
        speech.toggle(
            onPartial: { vm.input = $0 },
            onFinal: { text in
                vm.input = text
                vm.ask(fromVoice: true)
            }
        )
    }
}


extension UIImage: @retroactive Identifiable {
    public var id: ObjectIdentifier { ObjectIdentifier(self) }
}
