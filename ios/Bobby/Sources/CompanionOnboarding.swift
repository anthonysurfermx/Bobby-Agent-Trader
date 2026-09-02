// Companion-first onboarding. The user lands INSIDE the squad world from
// second one — same dark stage, same 3D companions, same tokens as the rest
// of the app. Three beats: choose your companion (it speaks when you pick
// it), choose its vibe (you hear it live), seal the pact (honesty as a
// product moment). No orb, no separate "blue app".
import SwiftUI

struct CompanionOnboarding: View {
    @ObservedObject var profile: AgentProfile
    @ObservedObject var companions: CompanionStore
    @ObservedObject var voice: NeuralVoice

    @State private var step = 0
    @State private var selected: Companion = bobbyCompanions.first(where: { $0.id != "orb" }) ?? bobbyCompanions[0]
    @State private var sceneLoading = false
    @State private var sceneFailed = false

    private var starters: [Companion] { bobbyCompanions.filter { $0.requiredLevel == 1 } }
    private var tint: Color { selected.tint }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            // The companion's identity light bleeds into the stage
            RadialGradient(colors: [tint.opacity(0.16), .clear], center: .center, startRadius: 40, endRadius: 420)
                .ignoresSafeArea()
                .animation(.easeOut(duration: 0.6), value: selected.id)

            VStack(spacing: 0) {
                header

                // The companion IS the onboarding — always on stage
                ZStack {
                    MascotSceneView(
                        assetName: selected.id,
                        interactive: true,
                        speaking: voice.speaking,
                        voiceLevel: voice.level,
                        onLoading: { loading, failed in
                            sceneLoading = loading
                            sceneFailed = failed
                        }
                    )
                    .id(selected.id)
                    if sceneLoading && !sceneFailed {
                        ProgressView().tint(tint)
                    }
                    if sceneFailed {
                        CompanionThumb(companion: selected)
                            .frame(width: 160, height: 160)
                            .clipShape(Circle())
                    }
                }
                .frame(maxHeight: .infinity)

                Group {
                    switch step {
                    case 0: chooseStep
                    case 1: vibeStep
                    default: pactStep
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 6)

                cta
            }
        }
    }

    // MARK: header

    private var header: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(tint).frame(width: 7, height: 7).shadow(color: tint, radius: 7)
                    Text(L.t("BOBBY // MEET YOUR SQUAD", "BOBBY // CONOCE AL SQUAD"))
                        .font(.mono(11, .bold))
                        .kerning(1.9)
                        .foregroundStyle(Theme.text.opacity(0.78))
                }
                Spacer()
                Text("0\(step + 1) / 03")
                    .font(.mono(10, .bold))
                    .foregroundStyle(selected.tintSoft)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.cardSoft).frame(height: 2)
                    Capsule()
                        .fill(tint)
                        .frame(width: geometry.size.width * CGFloat(step + 1) / 3, height: 2)
                }
            }
            .frame(height: 2)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
    }

    // MARK: step 0 — choose the companion

    private var chooseStep: some View {
        VStack(spacing: 10) {
            VStack(spacing: 3) {
                Text(selected.name(at: 1))
                    .font(.mono(26, .black))
                    .kerning(3)
                    .foregroundStyle(tint)
                Text(selected.role)
                    .font(.mono(10, .bold))
                    .kerning(1.6)
                    .foregroundStyle(Theme.muted)
                Text(selected.personality)
                    .font(.rounded(13, .medium))
                    .foregroundStyle(Theme.text.opacity(0.72))
            }
            .animation(.easeOut(duration: 0.25), value: selected.id)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(starters) { comp in
                        Button {
                            guard comp.id != selected.id else { return }
                            selected = comp
                            UIImpactFeedbackGenerator(style: .light).impactOccurred()
                            voice.speak(comp.selectLine, voiceId: comp.voicePersona, persona: comp.voicePersona)
                        } label: {
                            VStack(spacing: 5) {
                                CompanionThumb(companion: comp)
                                    .frame(width: 58, height: 58)
                                    .clipShape(RoundedRectangle(cornerRadius: 13))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 13)
                                            .stroke(comp.id == selected.id ? comp.tint : Theme.stroke, lineWidth: comp.id == selected.id ? 2 : 1)
                                    )
                                Text(comp.label)
                                    .font(.mono(8, .bold))
                                    .kerning(0.8)
                                    .foregroundStyle(comp.id == selected.id ? comp.tintSoft : Theme.muted)
                            }
                        }
                        .accessibilityLabel(comp.label)
                        .accessibilityAddTraits(comp.id == selected.id ? [.isSelected] : [])
                    }
                }
                .padding(.horizontal, 2)
            }

            Text(L.t("Tap one — it introduces itself. More of the squad unlocks as you level up.",
                     "Toca uno — se presenta solo. El resto del squad se desbloquea al subir de nivel."))
                .font(.mono(9, .medium))
                .kerning(0.6)
                .foregroundStyle(Theme.muted.opacity(0.8))
                .multilineTextAlignment(.center)
        }
    }

    // MARK: step 1 — its vibe (heard live, in the companion's own voice)

    private var vibeStep: some View {
        VStack(spacing: 10) {
            Text(L.t("How should \(selected.name(at: 1)) talk to you?", "¿Cómo quieres que te hable \(selected.name(at: 1))?"))
                .font(.rounded(20, .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(L.t("Tap to hear it. The tone changes; the data never does.",
                     "Toca para escucharlo. Cambia el tono; los datos no cambian."))
                .font(.rounded(12, .medium))
                .foregroundStyle(Theme.muted)

            VStack(spacing: 8) {
                ForEach(AgentVibe.allCases) { vibe in
                    Button {
                        profile.vibeId = vibe.rawValue
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        voice.speak(vibe.sample, voiceId: selected.voicePersona, persona: selected.voicePersona, vibe: vibe.rawValue)
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(vibe.label.uppercased())
                                    .font(.mono(11, .bold))
                                    .kerning(1.2)
                                    .foregroundStyle(profile.vibeId == vibe.rawValue ? tint : Theme.text)
                                Text(vibe.desc)
                                    .font(.rounded(12, .medium))
                                    .foregroundStyle(Theme.muted)
                                    .lineLimit(1)
                            }
                            Spacer()
                            Image(systemName: profile.vibeId == vibe.rawValue ? "checkmark.circle.fill" : "waveform.circle")
                                .foregroundStyle(profile.vibeId == vibe.rawValue ? Theme.up : Theme.muted)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 11)
                        .background(profile.vibeId == vibe.rawValue ? tint.opacity(0.07) : Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(profile.vibeId == vibe.rawValue ? tint.opacity(0.55) : Theme.stroke, lineWidth: 1))
                    }
                }
            }
        }
    }

    // MARK: step 2 — the pact (honesty as the closing moment)

    private var pactStep: some View {
        VStack(spacing: 10) {
            Text(L.t("The pact", "El pacto"))
                .font(.rounded(22, .bold))
                .foregroundStyle(Theme.text)
            VStack(alignment: .leading, spacing: 10) {
                pactLine("chart.line.uptrend.xyaxis", L.t("\(selected.name(at: 1)) analyzes markets with live data.", "\(selected.name(at: 1)) analiza mercados con datos en vivo."))
                pactLine("checkmark.shield.fill", L.t("It never touches your money and never executes trades.", "Nunca toca tu dinero y nunca ejecuta operaciones."))
                pactLine("hand.raised.fill", L.t("When there is no clean setup, it says NO TRADE — and that also counts.", "Cuando no hay setup limpio, dice NO TRADE — y eso también cuenta."))
                pactLine("sparkles", L.t("It evolves with your discipline, never with your volume.", "Evoluciona con tu disciplina, nunca con tu volumen."))
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.up.opacity(0.045))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.up.opacity(0.16), lineWidth: 1))
            Text(L.t("Analysis, not advice. You decide and you own the risk.",
                     "Análisis, no asesoría. Tú decides y asumes el riesgo."))
                .font(.mono(9, .medium))
                .kerning(0.8)
                .foregroundStyle(Theme.muted)
            Link(destination: URL(string: "https://bobbyprotocol.xyz/privacy")!) {
                Text(L.t("Privacy Policy", "Aviso de privacidad"))
                    .font(.mono(9, .medium))
                    .kerning(0.8)
                    .underline()
                    .foregroundStyle(Theme.muted)
            }
        }
    }

    private func pactLine(_ icon: String, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Theme.up)
                .frame(width: 18)
            Text(text)
                .font(.rounded(13, .medium))
                .foregroundStyle(Theme.text.opacity(0.82))
            Spacer(minLength: 0)
        }
    }

    // MARK: CTA

    private var cta: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            switch step {
            case 0:
                commitCompanion()
                withAnimation(.spring(duration: 0.42)) { step = 1 }
            case 1:
                voice.stop()
                withAnimation(.spring(duration: 0.42)) { step = 2 }
            default:
                // The payoff: the chosen companion opens the desk out loud,
                // in its own voice — the sound carries across the transition.
                voice.speak(
                    L.t("Desk online. Ask me about bitcoin, NVIDIA, gold — whatever you bring.",
                        "Desk en línea. Pregúntame por bitcoin, NVIDIA, oro — lo que traigas."),
                    voiceId: selected.voicePersona, persona: selected.voicePersona, vibe: profile.vibe.rawValue)
                withAnimation(.spring(duration: 0.5)) { profile.onboarded = true }
            }
        } label: {
            HStack {
                Text(step == 0
                     ? L.t("MAKE IT MY COMPANION", "HACER MI COMPANION")
                     : step == 1 ? L.t("NEXT", "SIGUE") : L.t("OPEN THE DESK", "ABRIR EL DESK"))
                    .font(.mono(12, .bold))
                    .kerning(1.7)
                Spacer()
                Image(systemName: step == 2 ? "arrow.right" : "checkmark")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundStyle(.black)
            .padding(.horizontal, 18)
            .frame(height: 52)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: tint.opacity(0.30), radius: 14, y: 4)
        }
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    /// Selection is the identity moment: the companion becomes the agent.
    /// Its persona becomes the default voice and its hue re-tints the legacy
    /// aura accents so the whole app lives in the same color world.
    private func commitCompanion() {
        companions.companionId = selected.id
        profile.voiceId = selected.voicePersona
        profile.auraText = AuraForge.keyword(nearest: selected.hue)
    }
}
