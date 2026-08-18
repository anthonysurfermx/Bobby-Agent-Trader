// Bobby — one screen. Ask about any asset; get the answer, the chart and
// the levels. Fun by design: a living orb, playful thinking states,
// tappable suggestions — a compa with superpowers, not a bank form.
import SwiftUI

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    let fromBobby: Bool
    let text: String
}

@MainActor
final class BobbyViewModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var input = ""
    @Published var thinking = false
    @Published var thinkingPhrase = ""
    @Published var candles: [Candle] = []
    @Published var snapshot: MarketSnapshot?
    @Published var lastAnswer: BobbyAnswer?
    @Published var speakEnabled = true

    let voice = NeuralVoice()
    let profile = AgentProfile()

    private let thinkingPhrases = [
        "leyendo velas 🕯️",
        "interrogando al mercado…",
        "contando los ticks…",
        "revisando niveles clave…",
        "consultando a los agentes…",
    ]

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
        thinkingPhrase = thinkingPhrases.randomElement() ?? "analizando…"

        Task {
            defer { thinking = false }

            guard let asset = await BobbyAPI.resolveAsset(q) else {
                messages.append(ChatMessage(fromBobby: true, text: "Ese no lo tengo 🤔 — prueba con el nombre o ticker: \"bitcoin\", \"NVDA\", \"oro\"."))
                return
            }

            async let mkt = BobbyAPI.market(asset.symbol)
            async let ch = BobbyAPI.candles(symbol: asset.symbol, isEquity: asset.isEquity)
            async let ans = BobbyAPI.debate(asset.symbol)

            var snap = asset
            let m = await mkt
            snap.price = m.price
            snap.changePct = m.changePct
            withAnimation(.spring(duration: 0.45)) {
                snapshot = snap
                candles = []
            }

            let fetched = await ch
            withAnimation(.spring(duration: 0.45)) { candles = fetched }

            var answer = await ans
            if answer.price == nil { answer.price = m.price }
            lastAnswer = answer

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
            Theme.bg.ignoresSafeArea()
            if vm.profile.onboarded {
                mainScreen
                    .transition(.opacity)
            } else {
                OnboardingView(profile: vm.profile, voice: vm.voice)
                    .transition(.opacity)
            }
        }
        .onAppear { vm.bootGreetingIfNeeded() }
        .onChange(of: vm.profile.onboarded) {
            vm.messages = []
            vm.bootGreetingIfNeeded()
        }
    }

    private var mainScreen: some View {
        VStack(spacing: 0) {
            header
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 14) {
                        if vm.snapshot != nil { assetCard }
                        conversation
                        if vm.snapshot == nil && vm.messages.count <= 1 { suggestions }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
                }
                .scrollDismissesKeyboard(.interactively)
                .onChange(of: vm.messages) {
                    if let last = vm.messages.last {
                        withAnimation(.easeOut(duration: 0.3)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
            inputBar
        }
    }

    // ── header: the orb IS the brand ──
    private var header: some View {
        HStack(spacing: 6) {
            BobbyOrb(size: 34, thinking: vm.thinking, speaking: vm.voice.speaking)
                .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 1) {
                Text(vm.profile.name.uppercased())
                    .font(.mono(15, .bold))
                    .kerning(2)
                    .foregroundStyle(Theme.text)
                HStack(spacing: 4) {
                    Circle().fill(Theme.up).frame(width: 5, height: 5)
                    Text("prueba sus llamadas on-chain")
                        .font(.rounded(10))
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Button {
                vm.speakEnabled.toggle()
                if !vm.speakEnabled { vm.voice.stop() }
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            } label: {
                Image(systemName: vm.speakEnabled ? "speaker.wave.2.fill" : "speaker.slash.fill")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(vm.speakEnabled ? Theme.accent : Theme.muted)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Theme.card))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // ── asset card: price + chart + levels ──
    private var assetCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let s = vm.snapshot {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(s.symbol)
                            .font(.mono(13, .bold))
                            .foregroundStyle(Theme.muted)
                        if let p = s.price ?? vm.lastAnswer?.price {
                            Text(BobbyAnswer.money(p))
                                .font(.rounded(34, .bold))
                                .foregroundStyle(Theme.text)
                                .contentTransition(.numericText())
                        }
                    }
                    Spacer()
                    if let ch = s.changePct {
                        Text(String(format: "%@%.2f%%", ch >= 0 ? "+" : "", ch))
                            .font(.mono(13, .semibold))
                            .foregroundStyle(ch >= 0 ? Theme.up : Theme.down)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Capsule().fill((ch >= 0 ? Theme.up : Theme.down).opacity(0.12)))
                    }
                }

                if vm.candles.isEmpty {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Theme.cardSoft)
                        .frame(height: 180)
                        .overlay(ProgressView().tint(Theme.muted))
                } else {
                    ChartView(candles: vm.candles)
                        .frame(height: 180)
                }

                if let a = vm.lastAnswer {
                    HStack(spacing: 8) {
                        if let t = a.trend { chip(t == "alcista" ? "▲ \(t)" : t == "bajista" ? "▼ \(t)" : t, t == "alcista" ? Theme.up : t == "bajista" ? Theme.down : Theme.muted) }
                        if let r = a.rsi { chip("RSI \(Int(r))", Theme.muted) }
                        if let c = a.convictionPct, let d = a.direction {
                            chip("\(d.uppercased()) \(Int(c))%", d == "long" ? Theme.up : Theme.down)
                        }
                        Spacer()
                    }
                }
            }
        }
        .padding(16)
        .card()
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    private func chip(_ text: String, _ color: Color) -> some View {
        Text(text)
            .font(.mono(11, .semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(Capsule().fill(color.opacity(0.12)))
    }

    // ── conversation ──
    private var conversation: some View {
        VStack(spacing: 10) {
            ForEach(vm.messages) { msg in
                HStack {
                    if !msg.fromBobby { Spacer(minLength: 48) }
                    Text(msg.text)
                        .font(.rounded(15))
                        .foregroundStyle(Theme.text)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .fill(msg.fromBobby ? Theme.card : Theme.accent.opacity(0.9))
                        )
                    if msg.fromBobby { Spacer(minLength: 48) }
                }
                .id(msg.id)
            }
            if vm.thinking {
                HStack(spacing: 8) {
                    BobbyOrb(size: 20, thinking: true)
                        .frame(width: 28, height: 28)
                    Text(vm.thinkingPhrase)
                        .font(.rounded(13, .medium))
                        .foregroundStyle(Theme.muted)
                    Spacer()
                }
                .padding(.leading, 4)
                .transition(.opacity)
            }
        }
    }

    // ── empty-state: tap a suggestion, get magic ──
    private var suggestions: some View {
        VStack(spacing: 8) {
            Text("o prueba con…")
                .font(.rounded(12))
                .foregroundStyle(Theme.muted)
            FlowChips(items: ["¿cómo va bitcoin?", "NVDA hoy", "¿el oro rompe?", "solana en corto", "¿qué onda con TSLA?"]) { s in
                vm.ask(s)
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
        .padding(.top, 12)
    }

    // ── input: mic-first ──
    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField(speech.listening ? "Te escucho…" : "Pregúntame de cualquier activo…", text: $vm.input)
                .font(.rounded(15))
                .foregroundStyle(Theme.text)
                .focused($focused)
                .autocorrectionDisabled(true)          // "nvidia" must never become "Nidia"
                .textInputAutocapitalization(.never)
                .submitLabel(.send)
                .onSubmit { vm.ask() }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Capsule().fill(Theme.card))
                .overlay(
                    Capsule().stroke(
                        speech.listening ? Theme.accent : (focused ? Theme.accent.opacity(0.5) : Theme.stroke),
                        lineWidth: speech.listening ? 1.5 : 1
                    )
                )

            if vm.input.isEmpty && !vm.thinking {
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    vm.voice.stop()
                    speech.toggle(
                        onPartial: { vm.input = $0 },
                        onFinal: { text in
                            vm.input = text
                            vm.ask()
                        }
                    )
                } label: {
                    Image(systemName: speech.listening ? "waveform" : "mic.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(speech.listening ? Theme.down : Theme.accent))
                        .symbolEffect(.variableColor.iterative, options: .repeating, isActive: speech.listening)
                }
            } else {
                Button {
                    speech.finish()
                    vm.ask()
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(vm.input.isEmpty ? Theme.cardSoft : Theme.accent))
                }
                .disabled(vm.input.isEmpty || vm.thinking)
            }
        }
        .animation(.spring(duration: 0.25), value: vm.input.isEmpty)
        .animation(.spring(duration: 0.25), value: speech.listening)
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(Theme.bg)
    }
}

/// Simple wrapping chip row.
struct FlowChips: View {
    let items: [String]
    let action: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                ForEach(items.prefix(3), id: \.self) { chipButton($0) }
            }
            HStack(spacing: 8) {
                ForEach(items.dropFirst(3), id: \.self) { chipButton($0) }
            }
        }
    }

    private func chipButton(_ s: String) -> some View {
        Button { action(s) } label: {
            Text(s)
                .font(.rounded(13, .medium))
                .foregroundStyle(Theme.accent)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Capsule().fill(Theme.accent.opacity(0.10)))
                .overlay(Capsule().stroke(Theme.accent.opacity(0.25), lineWidth: 1))
        }
    }
}
