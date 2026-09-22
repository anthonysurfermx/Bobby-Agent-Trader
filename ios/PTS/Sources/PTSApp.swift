import SwiftUI

@main struct PTSApp: App {
    var body: some Scene {
        WindowGroup {
            PTSLaunchView()
                .preferredColorScheme(.dark)
                .environment(\.locale, Locale(identifier: "es_MX"))
        }
    }
}

struct SignalDesk: View {
    let signal: SignalListItem
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @StateObject private var voice = NeuralVoice()
    @StateObject private var tutor = SignalTutor()
    @StateObject private var live: PTSRealtimeClient
    @ObservedObject private var market = SignalLiveMarket.shared
    @State private var selected: Double
    @State private var original = false
    @State private var journey = false
    @State private var learn = false
    @State private var query = ""
    @State private var voiceChoice = "onyx"
    @State private var guided = false
    @State private var chapter = 0
    @State private var pendingQuestion: String?
    @StateObject private var backup = PTSBackupVoice()
    @State private var backupActive = false
    @State private var backupLines: [PTSRealtimeClient.Line] = []
    @State private var backupQueue: [String] = []
    private let chapterNames = ["El reporte", "Qué vigilar", "Cómo leerlo"]
    private let chapterClips = ["pts-guide-context", "pts-guide-risk", "pts-guide-targets"]
    private let signalCase: SignalCase

    init(signal: SignalListItem, opensCopilot: Bool = false) {
        self.signal = signal
        let signalCase = SignalCase.forSignal(signal)
        self.signalCase = signalCase
        _live = StateObject(wrappedValue: PTSRealtimeClient(policy: signalCase.voice, liveContext: { SignalLiveMarket.shared.copilotContext(for: signal) }))
        _selected = State(initialValue: signalCase.focusLevel)
        _learn = State(initialValue: opensCopilot)
    }
    private var selectedLevel: SignalLevel {
        signalCase.levels.first { $0.price == selected } ?? SignalLevel(price: selected, role: nil)
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    title.padding(.horizontal, 24)
                    chartPanel
                    sourcePreview.padding(.horizontal, 24)
                    levelSelector
                    insight.padding(.horizontal, 24)
                    if let quote = market.quotes[signal.symbol] {
                        SignalTrackingView(signal: signal, signalCase: signalCase, quote: quote).padding(.horizontal, 24)
                    }
                    SignalCommunityView(signal: signal).padding(.horizontal, 24)
                }.padding(.top, 8).padding(.bottom, 20)
            }
        }
        .background(Theme.bg)
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .background(SignalBackGesture().frame(width: 0, height: 0))
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityAction(.escape) { dismiss() }
        .sheet(isPresented: $journey) { SignalJourney() }
        .onChange(of: journey) { _, open in if open { guided = false; voice.stop() } }
        .sheet(isPresented: $original) { originalSheet }
        .sheet(isPresented: $learn) { tutorSheet }
        .onDisappear { guided = false; voice.stop(); live.stop() }
        .onChange(of: learn) { _, open in
            if open { guided = false; voice.stop() }
            else { live.stop(); voice.stop(); tutor.answer = ""; pendingQuestion = nil; backup.stop(); backupActive = false; backupLines = []; backupQueue = [] }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background {
                if live.isActive || live.state == .connecting { live.end() }
                guided = false; voice.stop()
            }
        }
        .onChange(of: voice.speaking) { _, speaking in
            guard guided, !speaking else { return }
            if chapter < 2 {
                chapter += 1
                playChapter()
            } else { guided = false }
        }
    }
    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Label("Señales", systemImage: "chevron.left")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.accent)
                    .frame(minHeight: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Volver a todas las señales")
            .accessibilityIdentifier("signal-back")
            Spacer()
            Button { original = true } label: {
                Text("Detalles").font(.subheadline).foregroundStyle(Theme.secondary).frame(minHeight: 44)
            }
            .accessibilityLabel("Detalles de la señal y publicación original")
            .accessibilityIdentifier("signal-details")
        }.padding(.horizontal, 24)
    }
    private var title: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 12) {
                SignalLogo(symbol: signal.symbol, size: 40)
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .firstTextBaseline, spacing: 10) { assetName }
                    VStack(alignment: .leading, spacing: 3) { assetName }
                }
                Spacer(minLength: 8)
                if signalCase.hasGuidedNarration { voiceControl }
            }
            Text("\(signal.author) · Publicado \(signal.shortPublicationDate)")
                .font(.footnote).foregroundStyle(Theme.secondary)
                .accessibilityLabel("\(signal.author). Publicado el \(signal.publicationDate).")
            if guided {
                Text("Voz IA · \(chapterNames[chapter]) · \(chapter + 1) de 3")
                    .font(.caption).foregroundStyle(Theme.accent)
            }
        }
    }
    @ViewBuilder private var assetName: some View {
        Text(signal.symbol).font(.largeTitle.weight(.medium)).tracking(-1.5)
        Text(signal.name).font(.subheadline).foregroundStyle(Theme.secondary)
    }
    private var chartPanel: some View {
        VStack(spacing: 10) {
            HStack {
                Text(market.quotes[signal.symbol].map { $0.isLive ? signalCase.chartCaption.replacingOccurrences(of: "histórico", with: "en vivo · \(SignalTracking.timeLabel($0.asOf)) NY") : signalCase.chartCaption.replacingOccurrences(of: "histórico", with: "cierre \(SignalTracking.dayLabel($0.asOf))") } ?? signalCase.chartCaption)
                Spacer()
            }.font(.caption).foregroundStyle(Theme.secondary).padding(.horizontal, 24)
            TradingChart(signalCase: signalCase, liveCandles: market.quotes[signal.symbol]?.daily, selected: selected) { value in
                withAnimation(.easeInOut(duration: 0.2)) { selected = value }
            }.frame(height: 360).accessibilityIdentifier("signal-chart")
        }
    }
    private var levelSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(signalCase.levels, id: \.self) { level in
                    let price = level.price
                    Button { withAnimation { selected = price } } label: {
                        Text(level.chipTitle).font(.system(size: 13, weight: .medium)).monospacedDigit()
                            .foregroundStyle(price == selected ? Theme.accentSoft : .gray).padding(.horizontal, 13).padding(.vertical, 10)
                            .background(price == selected ? Theme.accent.opacity(0.12) : .clear, in: Capsule())
                    }.buttonStyle(.plain).accessibilityIdentifier("level-\(Int(price))")
                }
            }.padding(.horizontal, 24)
        }
    }
    private var voiceControl: some View {
        Button {
            if voice.speaking || guided { guided = false; voice.stop() }
            else { chapter = 0; guided = true; playChapter() }
        } label: {
            ZStack {
                BobbyOrb(size: 44, speaking: voice.speaking, level: voice.level, tint: Theme.accent, tintSoft: Theme.accentSoft)
                Image(systemName: guided ? "stop.fill" : "play.fill")
                    .font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.bg)
            }.frame(width: 44, height: 44).contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(guided ? "Detener explicación IA" : "Escuchar explicación IA")
        .accessibilityIdentifier("voice-play")
        .contextMenu {
            Button("Voz firme") { guided = false; voice.stop(); voiceChoice = "onyx" }
            Button("Voz serena") { guided = false; voice.stop(); voiceChoice = "mellow" }
        }
    }
    private func playChapter() {
        guard let url = Bundle.main.url(forResource: "guided-narration", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let scripts = try? JSONDecoder().decode([String: String].self, from: data),
              let script = scripts[chapterClips[chapter]] else { guided = false; return }
        // Use the current sourced script, never the old bundled narration.
        if voiceChoice == "onyx" {
            let clip = chapterClips[chapter].replacingOccurrences(of: "pts-guide-", with: "pts-v06-") + "-onyx"
            voice.speakClip(clip, fallbackText: script, persona: voiceChoice, vibe: "pro")
        } else { voice.speak(script, voiceId: voiceChoice, vibe: "pro") }
    }
    private var insight: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                // Asked live after the greeting, or answered locally if Live fails.
                pendingQuestion = signalCase.levelQuestion(selectedLevel)
                learn = true
            } label: {
                HStack { Image(systemName: "sparkles"); Text(selectedLevel.role == nil ? "Entender el nivel \(String(format: "%.2f", selected))" : "Entender \(selectedLevel.chipTitle)"); Spacer(); Image(systemName: "arrow.up.right") }.font(.system(size: 13, weight: .medium)).foregroundStyle(Theme.accent).padding(.vertical, 10)
            }.accessibilityIdentifier("ask-ai")
        }
    }

    @ViewBuilder private var sourcePreview: some View {
        if signalCase.moments.isEmpty { memberSourcePreview } else { videoSourcePreview }
    }
    // Members-only posts have no public link; the original chart is in Details.
    private var memberSourcePreview: some View {
        Button { original = true } label: {
            Label("Publicación para miembros · \(signal.shortPublicationDate)", systemImage: "doc.richtext")
                .font(.subheadline).foregroundStyle(Theme.secondary).frame(minHeight: 44)
        }.buttonStyle(.plain).accessibilityIdentifier("source-post")
    }
    private var videoSourcePreview: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4)) : AnyLayout(HStackLayout(spacing: 16))
        return layout {
            Button { journey = true } label: {
                Label("YouTube", systemImage: "play.rectangle")
                    .font(.subheadline).foregroundStyle(Theme.secondary).frame(minHeight: 44)
            }.buttonStyle(.plain).accessibilityLabel("Fuente original en YouTube").accessibilityIdentifier("source-video")
            if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            HStack(spacing: 16) {
                Link("05:27 ↗", destination: SignalSource.firstMoment).frame(minHeight: 44).accessibilityIdentifier("source-327")
                Link("15:29 ↗", destination: SignalSource.secondMoment).frame(minHeight: 44).accessibilityIdentifier("source-929")
            }.font(.footnote.monospaced()).foregroundStyle(Theme.accentSoft)
        }
    }
    private var bottomBar: some View {
        PTSNavigationBar(symbol: signal.symbol, identifierPrefix: "signal") {
            dismiss()
        } onCopilot: {
            learn = true
        }
    }
    private var tutorSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(spacing: 10) {
                        PTSOrbit(speaking: live.state == .speaking || backup.speaking, level: backup.speaking ? 0.5 : live.level, active: live.isActive || live.state == .connecting || backupActive)
                            .accessibilityIdentifier("pts-orbit")
                        Text("Hablemos de \(signal.symbol)").font(.title2.weight(.medium))
                        HStack(spacing: 7) {
                            if live.state == .connecting { ProgressView().controlSize(.small).tint(Theme.accent) }
                            else { Image(systemName: backupActive ? (backup.speaking ? "speaker.wave.2.fill" : "hand.tap") : liveIcon).accessibilityHidden(true) }
                            Text(backupActive ? (backup.speaking ? "Copiloto hablando" : "Toca una pregunta o escríbela") : live.statusText)
                                .accessibilityIdentifier("live-status")
                                #if DEBUG
                                .accessibilityValue(live.playbackDiagnostics)
                                #endif
                        }
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(live.state == .error && !backupActive ? .orange : Theme.accent)
                        .animation(.easeInOut(duration: 0.2), value: live.state)
                        if live.state == .error, !backupActive, let message = live.error {
                            Text(message).font(.footnote).foregroundStyle(Theme.secondary)
                                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("live-error-detail")
                        }
                        if live.isActive {
                            Text(live.countdown).font(.subheadline.monospacedDigit()).foregroundStyle(Theme.secondary)
                                .accessibilityLabel("Tiempo restante: \(live.remainingSeconds) segundos")
                                .accessibilityIdentifier("live-countdown")
                            Button("Terminar conversación") { live.end() }
                                .font(.footnote).frame(minHeight: 44).accessibilityIdentifier("live-end")
                        } else if live.state == .error, !backupActive {
                            HStack(spacing: 10) {
                                liveAction("Reintentar voz", icon: "arrow.clockwise") { Task { await live.connect() } }
                                    .accessibilityIdentifier("live-retry")
                                if live.failure == .microphone, let settings = URL(string: UIApplication.openSettingsURLString) {
                                    liveAction("Abrir Ajustes", icon: "gear", prominent: false) { openURL(settings) }
                                        .accessibilityIdentifier("live-settings")
                                }
                            }
                        } else if live.state == .ended {
                            liveAction("Nueva conversación", icon: "mic.fill") { Task { await live.connect() } }
                                .accessibilityIdentifier("live-restart")
                        }
                    }.frame(maxWidth: .infinity)
                    Text(signalCase.sourceNote)
                        .font(.footnote).foregroundStyle(Theme.secondary)
                    ForEach(backupActive ? Array(backupLines.suffix(4)) : Array(live.transcript.suffix(4))) { line in
                        Text(line.text).font(.subheadline).lineSpacing(4)
                            .foregroundStyle(line.role == "assistant" ? .white : Theme.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier(line.role == "assistant" ? "live-answer" : "live-question")
                    }
                    if live.state != .ended {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(live.canSend ? "Pregunta con tu voz o toca un ejemplo" : "Ejemplos")
                                .font(.caption).foregroundStyle(Theme.secondary)
                            ForEach(signalCase.suggestions, id: \.self) { suggestion($0) }
                        }
                        if !tutor.answer.isEmpty, !backupActive, !live.isActive, live.state != .connecting {
                            // Local reviewed copy: never presented as the live voice.
                            Label("Respuesta revisada · sin voz en vivo", systemImage: "text.book.closed")
                                .font(.caption).foregroundStyle(Theme.accent)
                                .accessibilityIdentifier("ai-answer-label")
                            Text(tutor.answer).font(.subheadline).lineSpacing(4).accessibilityIdentifier("ai-answer")
                        }
                        HStack {
                            TextField("Pregunta sobre \(signal.symbol)…", text: $query, axis: .vertical)
                                .lineLimit(1...4).accessibilityIdentifier("ai-question")
                            Button {
                                let question = query; query = ""
                                Task { await askCopilot(question) }
                            } label: { Image(systemName: "arrow.up.circle.fill").font(.title).foregroundStyle(Theme.accent) }
                                .accessibilityLabel("Enviar pregunta").accessibilityIdentifier("ai-send")
                                .disabled(live.state == .connecting || query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }.padding(15).background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 16))
                    }
                }.padding(24)
            }.background(Theme.bg)
                .safeAreaInset(edge: .bottom) {
                    HStack(spacing: 20) {
                        Text("Voz IA").foregroundStyle(Theme.secondary)
                        if signalCase.moments.isEmpty {
                            Text("Fuente · publicación para miembros").foregroundStyle(Theme.secondary)
                        } else {
                            ForEach(Array(signalCase.moments.enumerated()), id: \.offset) { index, moment in
                                Link(index == 0 ? "Fuente · \(moment.label) ↗" : "\(moment.label) ↗", destination: moment.url)
                            }
                        }
                    }.font(.footnote).frame(maxWidth: .infinity, minHeight: 44)
                        .padding(.horizontal, 24).background(Theme.bg)
                }
                .navigationTitle("Copiloto PTS").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Listo") { learn = false } }
                .task { await live.connect() }
                .onChange(of: live.state) { _, state in
                    // Provider trouble (credits, outage, timeout, network) hands the
                    // conversation to the pre-rendered backup voice.
                    if state == .error, !backupActive, let failure = live.failure, [.busy, .server, .timeout, .offline].contains(failure) {
                        backupActive = true
                        backupLines = [PTSRealtimeClient.Line(role: "assistant", text: signalCase.voice.greeting)]
                        backup.speak(signalCase.voice.greeting)
                    }
                    guard let question = pendingQuestion else { return }
                    if state == .listening {
                        pendingQuestion = nil
                        Task { await live.sendText(question) }
                    } else if state == .error {
                        pendingQuestion = nil
                        Task { await askCopilot(question) }
                    }
                }
                .onChange(of: backup.speaking) { _, speaking in
                    // Answers asked during the greeting play right after it.
                    if !speaking, backupActive, !backupQueue.isEmpty { backup.speak(backupQueue.removeFirst()) }
                }
        }.tint(Theme.accent)
    }
    private func askCopilot(_ question: String) async {
        if live.canSend { await live.sendText(question) }
        else if live.state == .error || live.state == .idle {
            await tutor.ask(question, about: signalCase)
            guard backupActive, !tutor.answer.isEmpty else { return }
            backupLines.append(PTSRealtimeClient.Line(role: "user", text: question))
            backupLines.append(PTSRealtimeClient.Line(role: "assistant", text: tutor.answer))
            if backup.speaking { backupQueue = [tutor.answer] } else { backup.speak(tutor.answer) }
        }
    }
    private var liveIcon: String {
        switch live.state {
        case .idle, .connecting: return "antenna.radiowaves.left.and.right"
        case .listening: return "waveform"
        case .thinking: return "ellipsis.bubble"
        case .speaking: return "speaker.wave.2.fill"
        case .ended: return "checkmark.circle"
        case .error:
            switch live.failure {
            case .offline: return "wifi.slash"
            case .microphone: return "mic.slash"
            case .audio: return "speaker.slash"
            default: return "exclamationmark.triangle"
            }
        }
    }
    private func liveAction(_ title: String, icon: String, prominent: Bool = true, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold))
                .padding(.horizontal, 18).frame(minHeight: 44)
                .foregroundStyle(prominent ? Theme.bg : Theme.accentSoft)
                .background(prominent ? Theme.accent : Theme.accent.opacity(0.12), in: Capsule())
        }.buttonStyle(.plain)
    }
    private func suggestion(_ title: String) -> some View {
        Button { Task { await askCopilot(title) } } label: {
            Text(title).font(.subheadline).multilineTextAlignment(.leading)
                .padding(.horizontal, 14).padding(.vertical, 12).frame(minHeight: 44)
                .background(Theme.accent.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(Theme.accentSoft)
        }.disabled(live.state == .connecting)
    }
    private var originalSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(signal.symbol) · \(signal.name)").font(.title2.weight(.medium))
                        Text("\(signal.author) · Publicada \(signal.publicationDate)")
                            .font(.subheadline).foregroundStyle(Theme.secondary)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        (Text(signalCase.evidenceLabel).foregroundStyle(Theme.secondary)
                         + Text("sin\u{00A0}verificar").fontWeight(.semibold).foregroundStyle(.white))
                            .font(.footnote)
                        Text(signal.reportedVerdict).font(.title3)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text(signalCase.contractTitle).font(.headline)
                        Text(signalCase.contractDetail)
                            .font(.subheadline).foregroundStyle(Theme.secondary)
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        if signalCase.moments.isEmpty {
                            Text("Fuente original").font(.headline)
                            Text("Publicación de Daniel en el área de miembros de Pro Trading Skills, \(signal.publicationDate). No tiene enlace público; abajo está su gráfico original.")
                                .font(.subheadline).foregroundStyle(Theme.secondary)
                        } else {
                            Text("Fuente original disponible").font(.headline)
                            HStack(spacing: 20) {
                                ForEach(Array(signalCase.moments.enumerated()), id: \.offset) { index, moment in
                                    Link(index == 0 ? "YouTube · \(moment.label) ↗" : "\(moment.label) ↗", destination: moment.url)
                                }
                            }.font(.footnote).frame(minHeight: 44)
                        }
                    }
                    Divider()
                    Text("El gráfico original").font(.headline)
                    if let path = Bundle.main.path(forResource: signalCase.originalImage, ofType: "png"), let image = UIImage(contentsOfFile: path) { Image(uiImage: image).resizable().scaledToFit() }
                    Text(signalCase.levelsNote)
                        .font(.subheadline).foregroundStyle(Theme.secondary)
                    Text(signalCase.chartNote)
                        .font(.subheadline).foregroundStyle(Theme.secondary)
                    Text("Contenido educativo basado en publicaciones. No es recomendación ni orden de operar.")
                        .font(.footnote).foregroundStyle(Theme.secondary)
                }.padding(24)
            }.background(Theme.bg).navigationTitle("Detalles").navigationBarTitleDisplayMode(.inline).toolbar { Button("Listo") { original = false } }
        }.tint(Theme.accent)
    }
}
