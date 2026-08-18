// Bobby Pocket War Room. The primary object is not a chat transcript: it is a
// live market surface with a voice-driven orb, adversarial review and an honest
// proof boundary. Text is the desk log, not the product shell.
import SwiftUI

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
        case .resolving: return "LOCALIZANDO ACTIVO"
        case .alpha: return "ALPHA HUNTER"
        case .redTeam: return "RED TEAM"
        case .cio: return "CIO DECIDE"
        case .complete: return "VEREDICTO LISTO"
        case .error: return "ENLACE INCOMPLETO"
        }
    }

    var hint: String {
        switch self {
        case .idle: return "Toca la orbe y nombra un activo"
        case .resolving: return "Resolviendo ticker y venue"
        case .alpha: return "Buscando la oportunidad"
        case .redTeam: return "Atacando la tesis"
        case .cio: return "Cruzando riesgo y convicción"
        case .complete: return "Mercado, niveles y tesis sincronizados"
        case .error: return "Prueba con el nombre o ticker"
        }
    }
}

@MainActor
final class BobbyViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var input = ""
    @Published var thinking = false
    @Published var candles: [Candle] = []
    @Published var snapshot: MarketSnapshot?
    @Published var lastAnswer: BobbyAnswer?
    @Published var speakEnabled = true
    @Published var phase: DeskPhase = .idle

    let voice = NeuralVoice()
    let profile = AgentProfile()

    func bootGreetingIfNeeded() {
        guard messages.isEmpty else { return }
        messages.append(ChatMessage(fromBobby: true, text: profile.greeting))
    }

    func ask(_ preset: String? = nil) {
        let q = (preset ?? input).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !thinking else { return }
        input = ""
        voice.stop()
        messages.append(ChatMessage(fromBobby: false, text: q))
        thinking = true
        phase = .resolving
        lastAnswer = nil

        Task {
            defer { thinking = false }

            guard let asset = await BobbyAPI.resolveAsset(q) else {
                phase = .error
                messages.append(ChatMessage(fromBobby: true, text: "No pude resolver ese activo. Prueba con el nombre o ticker: bitcoin, NVDA, oro."))
                return
            }

            async let marketRequest = BobbyAPI.market(asset.symbol)
            async let candleRequest = BobbyAPI.candles(symbol: asset.symbol, isEquity: asset.isEquity)
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
            if answer.price == nil { answer.price = market.price }
            withAnimation(.spring(duration: 0.38)) {
                lastAnswer = answer
                phase = .cio
            }

            try? await Task.sleep(for: .milliseconds(360))
            phase = .complete
            let text = answer.summary
            messages.append(ChatMessage(fromBobby: true, text: text))
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if speakEnabled { voice.speak(text, voiceId: profile.voiceId) }
        }
    }
}

struct ContentView: View {
    @StateObject private var vm = BobbyViewModel()
    @StateObject private var speech = SpeechInput()
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            KineticBackground()
            if vm.profile.onboarded {
                mainScreen.transition(.opacity)
            } else {
                OnboardingView(profile: vm.profile, voice: vm.voice).transition(.opacity)
            }
        }
        .onAppear { vm.bootGreetingIfNeeded() }
        .onChange(of: vm.profile.onboarded) {
            vm.messages = []
            vm.bootGreetingIfNeeded()
        }
        .animation(.easeOut(duration: 0.35), value: vm.profile.onboarded)
    }

    private var mainScreen: some View {
        VStack(spacing: 0) {
            deskHeader
            ScrollView {
                LazyVStack(spacing: 12) {
                    liveConsole
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
            commandBar
        }
    }

    private var deskHeader: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(Theme.accent)
                .frame(width: 7, height: 7)
                .shadow(color: Theme.accent, radius: 8)
            Text("BOBBY // LIVE DESK")
                .font(.mono(12, .bold))
                .kerning(2.4)
                .foregroundStyle(Theme.text.opacity(0.80))
            Spacer()
            Text("READ ONLY")
                .font(.mono(9, .bold))
                .kerning(1.1)
                .foregroundStyle(Theme.up)
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .background(Capsule().fill(Theme.up.opacity(0.08)))
                .overlay(Capsule().stroke(Theme.up.opacity(0.22), lineWidth: 1))
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
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }

    private var liveConsole: some View {
        VStack(spacing: 4) {
            Button(action: toggleSpeech) {
                BobbyOrb(
                    size: 206,
                    thinking: vm.thinking,
                    speaking: vm.voice.speaking,
                    listening: speech.listening,
                    level: liveLevel
                )
                .frame(height: 208)
                .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(vm.thinking)

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
                    ForEach(["BTC", "NVDA", "ETH", "TSLA", "GOLD"], id: \.self) { ticker in
                        Button {
                            vm.ask(ticker)
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(ticker)
                                    .font(.mono(13, .bold))
                                    .foregroundStyle(Theme.text)
                                Text("ANALIZAR  →")
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
                        Text("1H // LIVE")
                            .font(.mono(9, .bold))
                            .foregroundStyle(Theme.muted)
                        if let change = snapshot.changePct {
                            Text(String(format: "%@%.2f%%", change >= 0 ? "+" : "", change))
                                .font(.mono(13, .bold))
                                .foregroundStyle(change >= 0 ? Theme.up : Theme.down)
                        }
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
                        ChartView(candles: vm.candles, answer: vm.lastAnswer)
                            .padding(.horizontal, 3)
                            .padding(.vertical, 8)
                    }
                }
                .frame(height: 222)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))

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
                deskChip(trend.uppercased(), trend == "alcista" ? Theme.up : trend == "bajista" ? Theme.down : Theme.muted)
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
                agentCard(name: "ALPHA", role: "busca", phase: .alpha, color: Theme.up)
                agentCard(name: "RED TEAM", role: "ataca", phase: .redTeam, color: Theme.down)
                agentCard(name: "CIO", role: "decide", phase: .cio, color: Theme.cio)
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
        guard let answer = vm.lastAnswer else { return vm.phase == phase ? "procesando…" : fallback }
        switch phase {
        case .alpha:
            return answer.trend.map { "tendencia \($0)" } ?? fallback
        case .redTeam:
            return answer.stop.map { "invalida \(BobbyAnswer.money($0))" }
                ?? answer.support.map { "soporte \(BobbyAnswer.money($0))" } ?? fallback
        case .cio:
            if let direction = answer.direction, let conviction = answer.convictionPct {
                return "\(direction) \(Int(conviction))%"
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
                    Text("Escenario técnico general · Bobby no ejecuta operaciones")
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
                    Text(message.fromBobby ? "BOBBY" : "TÚ")
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
                Text("PROOF ENGINE V2 // BASE SEPOLIA")
                    .font(.mono(9, .bold))
                    .kerning(1.1)
                    .foregroundStyle(Theme.accentSoft)
                Text("Infraestructura canary activa · esta consulta aún no genera receipt individual")
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

    private var commandBar: some View {
        HStack(spacing: 10) {
            TextField(speech.listening ? "Te escucho…" : "Pregunta por BTC, NVDA, oro…", text: $vm.input)
                .font(.rounded(14, .medium))
                .foregroundStyle(Theme.text)
                .focused($focused)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .onSubmit { vm.ask() }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(focused ? Theme.accent.opacity(0.50) : Theme.stroke, lineWidth: 1))

            Button {
                if vm.input.isEmpty && !vm.thinking { toggleSpeech() }
                else { speech.finish(); vm.ask() }
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
        if speech.listening { return "ESCUCHANDO" }
        if vm.voice.speaking { return "BOBBY HABLA" }
        return vm.phase.label
    }

    private var statusHint: String {
        if speech.listening { return "Habla normal · se envía cuando terminas" }
        if vm.voice.speaking { return "La orbe responde a la voz en tiempo real" }
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
        speech.toggle(
            onPartial: { vm.input = $0 },
            onFinal: { text in
                vm.input = text
                vm.ask()
            }
        )
    }
}
