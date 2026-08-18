// Identity boot sequence. Onboarding introduces the same live object the user
// will talk to on the desk; it should feel like commissioning an agent, not
// filling out a consumer settings form. Aura comes first — the user DESCRIBES
// it in their own words, the orb takes the color as they type, and the aura is
// FORGED by holding the button while the power builds up and detonates.
import SwiftUI

struct OnboardingView: View {
    @ObservedObject var profile: AgentProfile
    @ObservedObject var voice: NeuralVoice
    @State private var step = 0
    @State private var name = ""
    @FocusState private var nameFocused: Bool
    @FocusState private var auraFocused: Bool

    // Forge gesture state
    @State private var charging = false
    @State private var chargeStart: Date?
    @State private var exploding = false
    @State private var hapticTask: Task<Void, Never>?

    private let forgeDuration: Double = 1.4

    private var tint: Color { profile.auraTint }
    private var tintSoft: Color { profile.auraTintSoft }

    var body: some View {
        ZStack {
            KineticBackground()
            VStack(spacing: 0) {
                bootHeader
                ScrollView {
                    Group {
                        switch step {
                        case 0: auraStep
                        case 1: voiceStep
                        case 2: vibeStep
                        default: nameStep
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 18)
                }
                .scrollDismissesKeyboard(.interactively)
                if step == 0 { forgeButton } else { continueButton }
            }

            // The detonation: the forged aura floods the screen, then reveals
            // the already-retinted interface underneath.
            if exploding {
                Circle()
                    .fill(RadialGradient(colors: [.white, tintSoft, tint, tint.opacity(0)], center: .center, startRadius: 0, endRadius: 320))
                    .frame(width: 640, height: 640)
                    .scaleEffect(exploding ? 3.2 : 0.01)
                    .opacity(exploding ? 0 : 1)
                    .allowsHitTesting(false)
                    .ignoresSafeArea()
            }
        }
    }

    private var bootHeader: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(tint).frame(width: 7, height: 7).shadow(color: tint, radius: 7)
                    Text("BOBBY // IDENTITY BOOT")
                        .font(.mono(11, .bold))
                        .kerning(1.9)
                        .foregroundStyle(Theme.text.opacity(0.78))
                }
                Spacer()
                Text("0\(step + 1) / 04")
                    .font(.mono(10, .bold))
                    .foregroundStyle(tintSoft)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.cardSoft).frame(height: 2)
                    Capsule()
                        .fill(tint)
                        .frame(width: geometry.size.width * CGFloat(step + 1) / 4, height: 2)
                }
            }
            .frame(height: 2)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    // MARK: step 0 — describe + forge the aura

    private var auraStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 150, level: charging ? 0.9 : 0.14, tint: tint, tintSoft: tintSoft)
                .frame(height: 154)
                .animation(.easeOut(duration: 0.5), value: profile.auraText)
            sectionEyebrow("AURA CHECK")
            Text("Describe su aura")
                .font(.rounded(27, .bold))
                .foregroundStyle(Theme.text)
            Text("Con tus palabras. El orbe la va absorbiendo mientras escribes — cada aura sale única.")
                .font(.rounded(13, .medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)

            TextField("azul voltaje", text: $profile.auraText, axis: .vertical)
                .font(.rounded(17, .semibold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.text)
                .focused($auraFocused)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .lineLimit(1...2)
                .padding(.vertical, 14)
                .padding(.horizontal, 14)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(auraFocused ? tint.opacity(0.75) : tint.opacity(0.30), lineWidth: 1.2)
                )
                .shadow(color: tint.opacity(0.14), radius: 16, y: 4)
                .padding(.top, 4)

            // Inspiration sparks — tap to try an energy, then make it yours.
            FlowChips(items: AuraForge.sparks, tint: tint) { spark in
                profile.auraText = spark
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }

            // The aura as data: every energy maps to a trader archetype.
            HStack(spacing: 8) {
                Text(profile.auraArchetype.name)
                    .font(.mono(10, .bold))
                    .kerning(1.4)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(tint))
                Text(profile.auraArchetype.motto)
                    .font(.rounded(12, .medium))
                    .foregroundStyle(Theme.muted)
            }
            .padding(.top, 6)
            .animation(.easeOut(duration: 0.3), value: profile.auraText)

            Text("mantén presionado FORJAR para sellarla")
                .font(.mono(9, .medium))
                .kerning(1.1)
                .foregroundStyle(Theme.muted.opacity(0.8))
                .padding(.top, 2)
        }
    }

    /// Hold-to-forge: power builds with growing haptics, the button trembles,
    /// and at 100% the aura detonates and re-tints the whole interface.
    private var forgeButton: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            let progress: Double = {
                guard charging, let start = chargeStart else { return 0 }
                return min(1, timeline.date.timeIntervalSince(start) / forgeDuration)
            }()
            let jitter: CGFloat = charging ? CGFloat(sin(t * 42)) * (1.5 + CGFloat(progress) * 2.5) : 0

            ZStack(alignment: .leading) {
                // power fill
                GeometryReader { geo in
                    Rectangle()
                        .fill(tintSoft.opacity(0.55))
                        .frame(width: geo.size.width * progress)
                        .animation(.linear(duration: 0.05), value: progress)
                }
                HStack {
                    Text(charging ? "FORJANDO…" : "FORJAR AURA")
                        .font(.mono(12, .bold))
                        .kerning(1.7)
                    Spacer()
                    Image(systemName: charging ? "bolt.fill" : "hand.tap.fill")
                        .font(.system(size: 13, weight: .bold))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 18)
            }
            .frame(height: 52)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .scaleEffect(charging ? 1.03 + CGFloat(progress) * 0.05 : 1)
            .offset(x: jitter)
            .shadow(color: tint.opacity(0.30 + progress * 0.55), radius: 14 + progress * 26, y: 4)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial.opacity(0.65))
        .overlay(alignment: .top) { Rectangle().fill(Theme.stroke).frame(height: 1) }
        .onLongPressGesture(minimumDuration: forgeDuration, maximumDistance: 80) {
            forge()
        } onPressingChanged: { pressing in
            if pressing {
                auraFocused = false
                charging = true
                chargeStart = Date()
                startForgeHaptics()
            } else {
                charging = false
                chargeStart = nil
                hapticTask?.cancel()
            }
        }
    }

    private func startForgeHaptics() {
        hapticTask?.cancel()
        hapticTask = Task { @MainActor in
            let soft = UIImpactFeedbackGenerator(style: .soft)
            let heavy = UIImpactFeedbackGenerator(style: .heavy)
            let start = Date()
            while !Task.isCancelled && charging {
                let p = min(1, Date().timeIntervalSince(start) / forgeDuration)
                (p > 0.6 ? heavy : soft).impactOccurred(intensity: 0.35 + p * 0.65)
                try? await Task.sleep(nanoseconds: UInt64((0.14 - p * 0.09) * 1_000_000_000))
            }
        }
    }

    private func forge() {
        hapticTask?.cancel()
        charging = false
        chargeStart = nil
        if profile.auraText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            profile.auraText = "azul voltaje"
        }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        exploding = false
        withAnimation(.easeOut(duration: 0.85)) { exploding = true }
        withAnimation(.spring(duration: 0.5).delay(0.15)) { step = 1 }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 950_000_000)
            exploding = false
        }
    }

    // MARK: step 1 — voice

    private var voiceStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 146, speaking: voice.speaking, level: voice.speaking ? max(0.08, voice.level) : 0.08, tint: tint, tintSoft: tintSoft)
                .frame(height: 150)
            sectionEyebrow("VOICE MATRIX")
            Text("Ponle voz")
                .font(.rounded(26, .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text("Escúchalas en vivo — el orbe reacciona al audio.")
                .font(.rounded(13, .medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)

            VStack(spacing: 8) {
                ForEach(AgentVoice.allCases) { agentVoice in
                    Button {
                        profile.voiceId = agentVoice.rawValue
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        voice.speak("Hola, soy \(agentVoice.label). Estoy listo para abrir el desk y leer el mercado contigo.", voiceId: agentVoice.rawValue)
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(agentVoice.label.uppercased())
                                    .font(.mono(12, .bold))
                                    .kerning(1.2)
                                    .foregroundStyle(Theme.text)
                                Text(agentVoice.flavor.uppercased())
                                    .font(.mono(9, .medium))
                                    .foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            Image(systemName: profile.voiceId == agentVoice.rawValue ? "checkmark" : "play.fill")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(profile.voiceId == agentVoice.rawValue ? Theme.up : tintSoft)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill((profile.voiceId == agentVoice.rawValue ? Theme.up : tint).opacity(0.10)))
                                .overlay(Circle().stroke((profile.voiceId == agentVoice.rawValue ? Theme.up : tint).opacity(0.25), lineWidth: 1))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(profile.voiceId == agentVoice.rawValue ? tint.opacity(0.65) : Theme.stroke, lineWidth: 1)
                        )
                    }
                }
            }
            .padding(.top, 4)
        }
    }

    // MARK: step 2 — vibe

    private var vibeStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 124, speaking: voice.speaking, level: voice.speaking ? max(0.08, voice.level) : 0.08, tint: tint, tintSoft: tintSoft)
                .frame(height: 128)
            sectionEyebrow("VOICE DIRECTIVE")
            Text("¿Qué vibra trae?")
                .font(.rounded(27, .bold))
                .foregroundStyle(Theme.text)
            Text("La personalidad cambia el tono; los datos no cambian.")
                .font(.rounded(13, .medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)

            VStack(spacing: 8) {
                ForEach(AgentVibe.allCases) { vibe in
                    Button {
                        profile.vibeId = vibe.rawValue
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        voice.speak(vibe.sample, voiceId: profile.voiceId)
                    } label: {
                        VStack(alignment: .leading, spacing: 7) {
                            HStack {
                                Text(vibe.label.uppercased())
                                    .font(.mono(12, .bold))
                                    .kerning(1.2)
                                    .foregroundStyle(profile.vibeId == vibe.rawValue ? tintSoft : Theme.text)
                                Spacer()
                                Image(systemName: profile.vibeId == vibe.rawValue ? "checkmark.circle.fill" : "waveform.circle")
                                    .foregroundStyle(profile.vibeId == vibe.rawValue ? Theme.up : Theme.muted)
                            }
                            Text(vibe.desc)
                                .font(.rounded(13, .medium))
                                .foregroundStyle(Theme.muted)
                            Text("“\(vibe.sample)”")
                                .font(.rounded(12, .medium))
                                .foregroundStyle(Theme.text.opacity(0.72))
                                .lineLimit(2)
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(profile.vibeId == vibe.rawValue ? tint.opacity(0.07) : Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(profile.vibeId == vibe.rawValue ? tint.opacity(0.55) : Theme.stroke, lineWidth: 1))
                    }
                }
            }
            .padding(.top, 5)
        }
    }

    // MARK: step 3 — name

    private var nameStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 150, level: 0.10, tint: tint, tintSoft: tintSoft).frame(height: 154)
            sectionEyebrow("CALLSIGN")
            Text("Bautízalo")
                .font(.rounded(27, .bold))
                .foregroundStyle(Theme.text)
            Text("El nombre que verás en tu Live Desk.")
                .font(.rounded(13, .medium))
                .foregroundStyle(Theme.muted)

            TextField("BOBBY", text: $name)
                .font(.mono(22, .bold))
                .kerning(2)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.text)
                .focused($nameFocused)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.characters)
                .padding(.vertical, 15)
                .background(Theme.panel)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(nameFocused ? tint.opacity(0.7) : Theme.stroke, lineWidth: 1))
                .padding(.top, 6)
                .onAppear { nameFocused = true }

            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "checkmark.shield.fill")
                    .foregroundStyle(Theme.up)
                Text("Bobby analiza mercados con datos en vivo. No administra tu dinero, no ejecuta operaciones ni emite recomendaciones personalizadas. Tú decides y asumes el riesgo.")
                    .font(.mono(9, .medium))
                    .foregroundStyle(Theme.muted)
                    .lineSpacing(3)
                Spacer(minLength: 0)
            }
            .padding(13)
            .background(Theme.up.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.up.opacity(0.16), lineWidth: 1))
            .padding(.top, 5)
        }
    }

    private func sectionEyebrow(_ text: String) -> some View {
        Text(text)
            .font(.mono(10, .bold))
            .kerning(2.2)
            .foregroundStyle(tintSoft)
    }

    private var continueButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            if step < 3 {
                voice.stop()
                withAnimation(.spring(duration: 0.42)) { step += 1 }
            } else {
                let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { profile.name = trimmed }
                voice.speak(profile.greeting, voiceId: profile.voiceId)
                withAnimation(.spring(duration: 0.5)) { profile.onboarded = true }
            }
        } label: {
            HStack {
                Text(step < 3 ? "SIGUE" : "ABRIR EL DESK")
                    .font(.mono(12, .bold))
                    .kerning(1.7)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .frame(height: 52)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: tint.opacity(0.28), radius: 14, y: 4)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial.opacity(0.65))
        .overlay(alignment: .top) { Rectangle().fill(Theme.stroke).frame(height: 1) }
    }
}

/// Simple centered chip row that wraps — inspiration sparks for the aura.
private struct FlowChips: View {
    let items: [String]
    let tint: Color
    let action: (String) -> Void

    var body: some View {
        VStack(spacing: 8) {
            ForEach(rows(), id: \.self) { row in
                HStack(spacing: 8) {
                    ForEach(row, id: \.self) { item in
                        Button { action(item) } label: {
                            Text(item)
                                .font(.mono(10, .semibold))
                                .kerning(0.6)
                                .foregroundStyle(Theme.text.opacity(0.85))
                                .padding(.horizontal, 11)
                                .padding(.vertical, 7)
                                .background(Theme.card)
                                .clipShape(Capsule())
                                .overlay(Capsule().stroke(tint.opacity(0.28), lineWidth: 1))
                        }
                    }
                }
            }
        }
    }

    private func rows() -> [[String]] {
        var result: [[String]] = []
        var row: [String] = []
        var count = 0
        for item in items {
            count += item.count + 4
            row.append(item)
            if count > 40 { result.append(row); row = []; count = 0 }
        }
        if !row.isEmpty { result.append(row) }
        return result
    }
}
