// "Configura tu Bobby" — 3 playful steps: voice, vibe, name. The voices
// introduce THEMSELVES out loud when tapped; the vibes show how they'd
// actually talk. Personalization is the product hook, so this moment has
// to feel like character creation, not a settings form.
import SwiftUI

struct OnboardingView: View {
    @ObservedObject var profile: AgentProfile
    @ObservedObject var voice: NeuralVoice
    @State private var step = 0
    @State private var name = ""
    @FocusState private var nameFocused: Bool

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                // progress dots
                HStack(spacing: 8) {
                    ForEach(0..<3, id: \.self) { i in
                        Capsule()
                            .fill(i <= step ? Theme.accent : Theme.cardSoft)
                            .frame(width: i == step ? 26 : 8, height: 8)
                    }
                }
                .animation(.spring(duration: 0.4), value: step)
                .padding(.top, 24)

                Spacer(minLength: 12)

                switch step {
                case 0: voiceStep
                case 1: vibeStep
                default: nameStep
                }

                Spacer(minLength: 12)

                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    if step < 2 {
                        withAnimation(.spring(duration: 0.45)) { step += 1 }
                    } else {
                        if !name.trimmingCharacters(in: .whitespaces).isEmpty {
                            profile.name = name.trimmingCharacters(in: .whitespaces)
                        }
                        voice.speak(profile.greeting, voiceId: profile.voiceId)
                        withAnimation(.spring(duration: 0.5)) { profile.onboarded = true }
                    }
                } label: {
                    Text(step < 2 ? "Siguiente" : "¡A darle!")
                        .font(.rounded(17, .bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Capsule().fill(Theme.accent))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 28)
            }
        }
    }

    // ── paso 1: la voz ──
    private var voiceStep: some View {
        VStack(spacing: 18) {
            BobbyOrb(size: 64, speaking: voice.speaking)
            Text("Elige su voz")
                .font(.rounded(28, .bold))
                .foregroundStyle(Theme.text)
            Text("Toca una y se presenta sola")
                .font(.rounded(15))
                .foregroundStyle(Theme.muted)

            VStack(spacing: 10) {
                ForEach(AgentVoice.allCases) { v in
                    Button {
                        profile.voiceId = v.rawValue
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        voice.speak("Hola, soy \(v.label). Así sueno yo — ¿te late para hablar de mercados?", voiceId: v.rawValue)
                    } label: {
                        HStack {
                            Text(v.label)
                                .font(.rounded(17, .semibold))
                                .foregroundStyle(Theme.text)
                            Text(v.flavor)
                                .font(.rounded(13))
                                .foregroundStyle(Theme.muted)
                            Spacer()
                            Image(systemName: profile.voiceId == v.rawValue ? "checkmark.circle.fill" : "play.circle")
                                .font(.system(size: 22))
                                .foregroundStyle(profile.voiceId == v.rawValue ? Theme.up : Theme.muted)
                        }
                        .padding(.horizontal, 18)
                        .padding(.vertical, 14)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(profile.voiceId == v.rawValue ? Theme.cardSoft : Theme.card)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(profile.voiceId == v.rawValue ? Theme.accent.opacity(0.6) : Theme.stroke, lineWidth: 1)
                        )
                    }
                }
            }
            .padding(.horizontal, 24)
        }
    }

    // ── paso 2: el vibe ──
    private var vibeStep: some View {
        VStack(spacing: 18) {
            Text("¿Cómo te habla?")
                .font(.rounded(28, .bold))
                .foregroundStyle(Theme.text)
            Text("Toca un estilo para escucharlo")
                .font(.rounded(15))
                .foregroundStyle(Theme.muted)

            VStack(spacing: 10) {
                ForEach(AgentVibe.allCases) { v in
                    Button {
                        profile.vibeId = v.rawValue
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        voice.speak(v.sample, voiceId: profile.voiceId)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text(v.label)
                                    .font(.rounded(17, .bold))
                                    .foregroundStyle(Theme.text)
                                Spacer()
                                if profile.vibeId == v.rawValue {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(Theme.up)
                                }
                            }
                            Text(v.desc)
                                .font(.rounded(13))
                                .foregroundStyle(Theme.muted)
                            Text("\u{201C}\(v.sample)\u{201D}")
                                .font(.rounded(13))
                                .italic()
                                .foregroundStyle(Theme.accent.opacity(0.9))
                                .padding(.top, 2)
                        }
                        .padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(profile.vibeId == v.rawValue ? Theme.cardSoft : Theme.card)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .stroke(profile.vibeId == v.rawValue ? Theme.accent.opacity(0.6) : Theme.stroke, lineWidth: 1)
                        )
                    }
                }
            }
            .padding(.horizontal, 24)
        }
    }

    // ── paso 3: el nombre ──
    private var nameStep: some View {
        VStack(spacing: 18) {
            BobbyOrb(size: 64)
            Text("Ponle nombre")
                .font(.rounded(28, .bold))
                .foregroundStyle(Theme.text)
            Text("Es TU agente — bautízalo")
                .font(.rounded(15))
                .foregroundStyle(Theme.muted)

            TextField("Bobby", text: $name)
                .font(.rounded(24, .bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.text)
                .focused($nameFocused)
                .autocorrectionDisabled(true)
                .padding(.vertical, 16)
                .background(RoundedRectangle(cornerRadius: 16).fill(Theme.card))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(nameFocused ? Theme.accent.opacity(0.6) : Theme.stroke, lineWidth: 1))
                .padding(.horizontal, 48)
                .onAppear { nameFocused = true }
        }
    }
}
