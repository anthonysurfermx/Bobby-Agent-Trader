// Companion-first onboarding. The user lands INSIDE the squad world from
// second one — same dark stage, same 3D companions, same tokens as the rest
// of the app. Choose your companion, forge its aura, then choose its voice
// style. Voice previews do not open a Live call.
import SwiftUI

struct CompanionOnboarding: View {
    @ObservedObject var profile: AgentProfile
    @ObservedObject var companions: CompanionStore
    @ObservedObject var voice: NeuralVoice
    @Environment(\.scenePhase) private var scenePhase

    private enum Step: Int { case choose, forge, vibe }
    @State private var step = Step.choose
    @State private var selected: Companion = bobbyCompanions.first(where: { $0.id != "orb" }) ?? bobbyCompanions[0]
    /// The carousel page. `selected` follows it once a swipe or tap lands.
    @State private var pageId: String = (bobbyCompanions.first(where: { $0.id != "orb" }) ?? bobbyCompanions[0]).id
    @State private var pulses: [String: Int] = [:]
    @State private var auraReady = false
    /// Quarters of the forge's first X-ray pass, 0…4.
    @State private var auraCharge = 0

    private var starters: [Companion] { bobbyCompanions.filter { $0.requiredLevel == 1 } }
    private var tint: Color { selected.tint }
    /// The vibe only changes how the companion sounds: without voice it is a choice with no effect.
    private var showsVibeStep: Bool { Self.showsVibeStep(voiceEnabled: NeuralVoice.avatarNarrationEnabled) }
    static func showsVibeStep(voiceEnabled: Bool) -> Bool { voiceEnabled }
    /// The forge is always second; the voice style is the final beat.
    private var beats: Int { showsVibeStep ? 3 : 2 }
    private var beat: Int { step.rawValue + 1 }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            // The companion's identity light bleeds into the stage
            RadialGradient(colors: [tint.opacity(0.16), .clear], center: .center, startRadius: 40, endRadius: 420)
                .ignoresSafeArea()
                .animation(.easeOut(duration: 0.6), value: selected.id)

            VStack(spacing: 0) {
                header

                // The companion IS the onboarding — always on stage. On the
                // second step it stands inside the aura forge.
                Group {
                    if step == .forge {
                        AuraForgeStage(tint: tint, charged: auraCharge, ready: auraReady) { forgeStage }
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                    } else {
                        stage
                    }
                }
                .frame(maxHeight: .infinity)

                if step != .forge {
                    Group {
                        if step == .choose { chooseStep } else if showsVibeStep { vibeStep }
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 6)
                }

                cta
            }
        }
        .task(id: step == .forge && scenePhase == .active) {
            // The scan reports its own finish; this only guarantees the CTA
            // can never stay locked if the model is slow or the render stalls.
            // It counts only while the app is on screen: the scan runs on the
            // render clock, which stops in the background.
            guard step == .forge, scenePhase == .active else {
                ForgeAudio.shared.stop()
                return
            }
            if !auraReady { ForgeAudio.shared.startHum() }
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { scanned(4) }
        }
        .onAppear { MascotAssetCache.preload(starters.map(\.id)) }
        .onDisappear {
            ForgeAudio.shared.stop()
            voice.stop()
            MascotAssetCache.purge()
        }
    }

    // MARK: stage

    @ViewBuilder
    private var stage: some View {
        if step == .choose {
            carousel
        } else {
            CompanionStagePage(companion: selected, active: true,
                               speaking: voice.speaking, voiceLevel: voice.level,
                               pulseToken: pulses[selected.id, default: 0])
                .contentShape(Rectangle())
                .onTapGesture { pulse(selected.id) }
        }
    }

    /// Swipe the companion itself. Every starter is the same size on stage
    /// and only the page on screen floats; its line plays once the swipe lands.
    private var carousel: some View {
        TabView(selection: $pageId) {
            ForEach(starters) { comp in
                let onStage = comp.id == pageId
                CompanionStagePage(companion: comp, active: onStage,
                                   speaking: onStage && voice.speaking,
                                   voiceLevel: onStage ? voice.level : 0,
                                   pulseToken: pulses[comp.id, default: 0])
                    .contentShape(Rectangle())
                    .onTapGesture { pulse(comp.id); previewSelection(comp) }
                    .tag(comp.id)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .overlay(alignment: .leading) { pageArrow(-1) }
        .overlay(alignment: .trailing) { pageArrow(1) }
        .onChange(of: pageId) { _, id in land(on: id) }
    }

    private func pageArrow(_ direction: Int) -> some View {
        let ids = starters.map(\.id)
        let target = (ids.firstIndex(of: pageId) ?? 0) + direction
        let exists = ids.indices.contains(target)
        return Button {
            guard ids.indices.contains(target) else { return }
            withAnimation(.spring(duration: 0.45)) { pageId = ids[target] }
        } label: {
            Image(systemName: direction < 0 ? "chevron.left" : "chevron.right")
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Theme.text.opacity(0.4))
                .frame(width: 44, height: 96)
                .contentShape(Rectangle())
        }
        .opacity(exists ? 1 : 0)
        .disabled(!exists)
        .accessibilityLabel(direction < 0 ? L.t("Previous friend", "Amigo anterior") : L.t("Next friend", "Siguiente amigo"))
    }

    private func land(on id: String) {
        guard let comp = starters.first(where: { $0.id == id }), comp.id != selected.id else { return }
        selected = comp
        UISelectionFeedbackGenerator().selectionChanged()
        previewSelection(comp)
    }

    private func previewSelection(_ companion: Companion) {
        voice.speakClip("select-\(companion.id)-\(L.ttsLang)", fallbackText: companion.selectLine,
                        persona: companion.voicePersona, playbackRate: 1.12)
    }

    private func pulse(_ id: String) {
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        pulses[id, default: 0] += 1
    }

    // MARK: step 2 — the aura forge

    /// The companion inside the forge: turning 360° while the X-ray scan
    /// materializes it. A tap still squashes it.
    private var forgeStage: some View {
        CompanionStagePage(companion: selected, active: true, speaking: false, voiceLevel: 0,
                           pulseToken: pulses[selected.id, default: 0],
                           forge: .init(tint: UIColor(tint), onProgress: scanned))
            .contentShape(Rectangle())
            .onTapGesture { pulse(selected.id) }
    }

    /// Each quarter of the first X-ray pass charges the platform with a soft
    /// tick; the last one maxes the aura out. Milestones only move forward.
    private func scanned(_ quarter: Int) {
        guard step == .forge, scenePhase == .active, quarter > auraCharge else { return }
        auraCharge = quarter
        guard quarter >= 4 else {
            ForgeAudio.shared.charge(quarter)
            UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.6)
            return
        }
        guard !auraReady else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        ForgeAudio.shared.auraMax()
        withAnimation(.spring(duration: 0.5, bounce: 0.35)) { auraReady = true }
    }

    // MARK: header

    private var header: some View {
        VStack(spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Circle().fill(tint).frame(width: 7, height: 7).shadow(color: tint, radius: 7)
                    Text(step == .forge ? L.t("BOBBY // PREPPING AURA", "BOBBY // PREPARANDO AURA")
                         : step == .vibe ? L.t("BOBBY // THEIR VIBE", "BOBBY // SU VIBRA")
                         : L.t("BOBBY // PICK YOUR FRIEND", "BOBBY // ELIGE A TU AMIGO"))
                        .font(.mono(11, .bold))
                        .kerning(1.9)
                        .foregroundStyle(Theme.text.opacity(0.78))
                }
                Spacer()
                Text("0\(beat) / 0\(beats)")
                    .font(.mono(10, .bold))
                    .foregroundStyle(selected.tintSoft)
            }
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.cardSoft).frame(height: 2)
                    Capsule()
                        .fill(tint)
                        .frame(width: geometry.size.width * CGFloat(beat) / CGFloat(beats), height: 2)
                }
            }
            .frame(height: 2)
        }
        .padding(.horizontal, 18)
        .padding(.top, 12)
    }

    // MARK: step 1 — choose the companion

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

            ScrollViewReader { strip in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(starters) { comp in
                        Button {
                            guard comp.id != pageId else { previewSelection(comp); return }
                            withAnimation(.spring(duration: 0.45)) { pageId = comp.id }
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
                        .id(comp.id)
                        .accessibilityLabel(comp.label)
                        .accessibilityAddTraits(comp.id == selected.id ? [.isSelected] : [])
                    }
                }
                .padding(.horizontal, 2)
            }
            .onChange(of: pageId) { _, id in
                withAnimation(.easeOut(duration: 0.3)) { strip.scrollTo(id, anchor: .center) }
            }
            }

            Text(L.t("Swipe to meet them. More friends unlock as you level up.",
                     "Desliza para conocerlos. Más amigos se desbloquean al subir de nivel."))
                .font(.mono(9, .medium))
                .kerning(0.6)
                .foregroundStyle(Theme.muted.opacity(0.8))
                .multilineTextAlignment(.center)
        }
    }

    // MARK: step 3 — its vibe, in the companion's own narrated voice

    private func previewVibe(_ vibe: AgentVibe) {
        voice.speakClip("vibe-\(vibe.rawValue)-\(selected.voicePersona)-\(L.ttsLang)", fallbackText: vibe.sample,
                        persona: selected.voicePersona, vibe: vibe.rawValue, playbackRate: 1.12)
    }

    private var vibeStep: some View {
        VStack(spacing: 10) {
            Text(L.t("How should \(selected.name(at: 1)) talk to you?", "¿Cómo quieres que te hable \(selected.name(at: 1))?"))
                .font(.rounded(20, .bold))
                .foregroundStyle(Theme.text)
                .multilineTextAlignment(.center)
            Text(L.t("Choose your companion’s style.",
                     "Elige el estilo de tu compañero."))
                .font(.rounded(12, .medium))
                .foregroundStyle(Theme.muted)

            VStack(spacing: 8) {
                ForEach(AgentVibe.allCases) { vibe in
                    Button {
                        profile.vibeId = vibe.rawValue
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        previewVibe(vibe)
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
                    .accessibilityIdentifier("avatar-vibe-\(vibe.rawValue)")
                    .accessibilityAddTraits(profile.vibeId == vibe.rawValue ? [.isSelected] : [])
                }
            }
        }
        .onAppear { previewVibe(profile.vibe) }
    }

    // MARK: CTA

    private var cta: some View {
        Button {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            switch step {
            case .choose:
                commitCompanion()
                voice.stop()
                withAnimation(.spring(duration: 0.42)) { step = .forge }
            case .forge:
                guard auraReady else { return }
                ForgeAudio.shared.stop()
                if showsVibeStep {
                    withAnimation(.spring(duration: 0.42)) { step = .vibe }
                } else {
                    finish()
                }
            case .vibe:
                // The payoff happens on the desk: one greeting, in the
                // companion's own voice, with today's real movers. Nothing is
                // spoken here so the two lines never overlap.
                finish()
            }
        } label: {
            HStack {
                Text(step == .choose
                     ? L.t("PICK \(selected.name(at: 1))", "ELEGIR A \(selected.name(at: 1))")
                     : step == .forge && !auraReady ? L.t("SCANNING…", "ESCANEANDO…")
                     : step == .forge && showsVibeStep ? L.t("NEXT", "SIGUE")
                     : L.t("DROP INTO THE DESK", "ENTRAR A LA MESA"))
                    .font(.mono(12, .bold))
                    .kerning(1.7)
                Spacer()
                Image(systemName: step == .choose ? "checkmark" : "arrow.right")
                    .font(.system(size: 13, weight: .bold))
            }
            .foregroundStyle(.black)
            .padding(.horizontal, 18)
            .frame(height: 52)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .shadow(color: tint.opacity(0.30), radius: 14, y: 4)
            .opacity(step == .forge && !auraReady ? 0.45 : 1)
            .animation(.easeOut(duration: 0.3), value: auraReady)
        }
        .disabled(step == .forge && !auraReady)
        .accessibilityIdentifier("onboarding-next")
        .padding(.horizontal, 18)
        .padding(.top, 8)
        .padding(.bottom, 10)
    }

    private func finish() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        ForgeAudio.shared.stop()
        voice.stop()
        withAnimation(.spring(duration: 0.5)) { profile.onboarded = true }
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

/// One companion on the onboarding stage: fades in once its model is built,
/// falls back to the portrait only if the GLB cannot load at all.
struct CompanionStagePage: View {
    let companion: Companion
    let active: Bool
    let speaking: Bool
    let voiceLevel: CGFloat
    let pulseToken: Int
    var forge: FloatingMascotView.ForgeScan? = nil
    /// Locked companion (the locker): the silver figurine, portrait included.
    var statue = false
    /// The locker never shows an empty stage: the portrait holds the spot
    /// until the model is in.
    var portraitUntilReady = false
    var onReady: ((Bool) -> Void)? = nil
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var ready = false
    @State private var failed = false

    var body: some View {
        ZStack {
            if failed || (portraitUntilReady && !ready) {
                CompanionPortrait(companion: companion, silver: statue, size: portraitUntilReady ? 180 : 220)
                    .transition(.opacity)
            }
            FloatingMascotView(assetName: companion.id, active: active, speaking: speaking,
                               voiceLevel: voiceLevel, pulseToken: pulseToken, forge: forge,
                               statue: statue) { loaded in
                withAnimation(.easeOut(duration: 0.3)) {
                    ready = loaded
                    failed = !loaded
                }
                onReady?(loaded)
            }
            .opacity(ready ? 1 : 0)
            .scaleEffect(ready || reduceMotion ? 1 : 0.94)
        }
        .accessibilityElement()
        .accessibilityLabel(companion.label)
    }
}
