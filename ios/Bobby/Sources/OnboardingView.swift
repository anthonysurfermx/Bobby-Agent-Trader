// Identity boot sequence. Onboarding introduces the same live object the user
// will talk to on the desk; it should feel like commissioning an agent, not
// filling out a consumer settings form.
import SwiftUI

struct OnboardingView: View {
    @ObservedObject var profile: AgentProfile
    @ObservedObject var voice: NeuralVoice
    @State private var step = 0
    @State private var name = ""
    @FocusState private var nameFocused: Bool

    var body: some View {
        ZStack {
            KineticBackground()
            VStack(spacing: 0) {
                bootHeader
                ScrollView {
                    Group {
                        switch step {
                        case 0: voiceStep
                        case 1: vibeStep
                        default: nameStep
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 18)
                }
                .scrollDismissesKeyboard(.interactively)
                continueButton
            }
        }
    }

    private var bootHeader: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(Theme.accent).frame(width: 7, height: 7).shadow(color: Theme.accent, radius: 7)
                    Text("BOBBY // IDENTITY BOOT")
                        .font(.mono(11, .bold))
                        .kerning(1.9)
                        .foregroundStyle(Theme.text.opacity(0.78))
                }
                Spacer()
                Text("0\(step + 1) / 03")
                    .font(.mono(10, .bold))
                    .foregroundStyle(Theme.accentSoft)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.cardSoft).frame(height: 2)
                    Capsule()
                        .fill(Theme.accent)
                        .frame(width: geometry.size.width * CGFloat(step + 1) / 3, height: 2)
                }
            }
            .frame(height: 2)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
        .padding(.bottom, 8)
    }

    private var voiceStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 146, speaking: voice.speaking, level: voice.speaking ? max(0.08, voice.level) : 0.08)
                .frame(height: 150)
            sectionEyebrow("VOICE MATRIX")
            Text("Elige la voz del desk")
                .font(.rounded(26, .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text("Cada voz se presenta en vivo. La orbe responde al audio.")
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
                                .foregroundStyle(profile.voiceId == agentVoice.rawValue ? Theme.up : Theme.accentSoft)
                                .frame(width: 34, height: 34)
                                .background(Circle().fill((profile.voiceId == agentVoice.rawValue ? Theme.up : Theme.accent).opacity(0.10)))
                                .overlay(Circle().stroke((profile.voiceId == agentVoice.rawValue ? Theme.up : Theme.accent).opacity(0.25), lineWidth: 1))
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(profile.voiceId == agentVoice.rawValue ? Theme.accent.opacity(0.65) : Theme.stroke, lineWidth: 1)
                        )
                    }
                }
            }
            .padding(.top, 4)
        }
    }

    private var vibeStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 124, speaking: voice.speaking, level: voice.speaking ? max(0.08, voice.level) : 0.08)
                .frame(height: 128)
            sectionEyebrow("VOICE DIRECTIVE")
            Text("¿Cómo te habla?")
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
                                    .foregroundStyle(profile.vibeId == vibe.rawValue ? Theme.accentSoft : Theme.text)
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
                        .background(profile.vibeId == vibe.rawValue ? Theme.accent.opacity(0.07) : Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(profile.vibeId == vibe.rawValue ? Theme.accent.opacity(0.55) : Theme.stroke, lineWidth: 1))
                    }
                }
            }
            .padding(.top, 5)
        }
    }

    private var nameStep: some View {
        VStack(spacing: 14) {
            BobbyOrb(size: 150, level: 0.10).frame(height: 154)
            sectionEyebrow("CALLSIGN")
            Text("Bautiza tu agente")
                .font(.rounded(27, .bold))
                .foregroundStyle(Theme.text)
            Text("Este nombre aparece en tu Live Desk.")
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
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(nameFocused ? Theme.accent.opacity(0.7) : Theme.stroke, lineWidth: 1))
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
            .foregroundStyle(Theme.accentSoft)
    }

    private var continueButton: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            if step < 2 {
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
                Text(step < 2 ? "CONTINUE" : "OPEN LIVE DESK")
                    .font(.mono(12, .bold))
                    .kerning(1.7)
                Spacer()
                Image(systemName: "arrow.right")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .frame(height: 52)
            .background(Theme.accent)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: Theme.accent.opacity(0.28), radius: 14, y: 4)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
        .background(.ultraThinMaterial.opacity(0.65))
        .overlay(alignment: .top) { Rectangle().fill(Theme.stroke).frame(height: 1) }
    }
}
