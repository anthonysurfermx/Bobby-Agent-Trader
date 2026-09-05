// ============================================================
// MascotGalleryView — the Bobby Squad as a BOND, not a gallery.
// Pick one companion (4 available, 6 unlock with discipline),
// make it yours, watch it evolve. Interactions: drag orbits
// (auto-spin stops), pinch zooms, tap emotes, double-tap resets,
// long-press reveals the secret phrase. Selection = haptic +
// particle burst + the companion speaks its line.
// ============================================================

import SwiftUI
import SceneKit
import GLTFKit2
import Darwin.Mach

struct MascotPerformanceMetrics: Equatable {
    let assetName: String
    let loadMilliseconds: Int
    let assetBytes: Int64
    let appFootprintBytes: UInt64
    let footprintDeltaBytes: Int64
    let nodeCount: Int
    let geometryCount: Int
}

struct MascotGalleryView: View {
    @ObservedObject var store: CompanionStore
    var voice: NeuralVoice?
    var voiceId: String = AgentVoice.coral.rawValue

    @Environment(\.dismiss) private var dismiss
    @State private var selectedId: String
    @State private var stageLoading = false
    @State private var stageFailed = false
    @State private var secretPhrase: String?
    @State private var burst = 0            // particle burst trigger
    @State private var justChosen = false
    @State private var emoteEvent: CompanionEmoteEvent?
    @State private var performanceMetrics: MascotPerformanceMetrics?

    init(store: CompanionStore, voice: NeuralVoice? = nil, voiceId: String = AgentVoice.coral.rawValue) {
        self.store = store
        self.voice = voice
        self.voiceId = voiceId
        // Open on YOUR companion, not on a hardcoded default
        _selectedId = State(initialValue: store.companionId ?? bobbyCompanions[0].id)
    }

    private var selected: Companion {
        bobbyCompanions.first { $0.id == selectedId } ?? bobbyCompanions[0]
    }
    private var isActive: Bool { store.companionId == selected.id }
    private var isUnlocked: Bool { store.isUnlocked(selected) }

    private func megabytes<T: BinaryInteger>(_ bytes: T) -> String {
        String(format: "%.1f", Double(Int64(bytes)) / 1_048_576)
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                stage
                identityBlock
                    .padding(.top, 2)
#if DEBUG
                if let metrics = performanceMetrics, !ProcessInfo.processInfo.arguments.contains("-store-shots") {
                    Text("LOAD \(metrics.loadMilliseconds)MS · ASSET \(megabytes(metrics.assetBytes))MB · ΔMEM \(megabytes(metrics.footprintDeltaBytes))MB · \(metrics.geometryCount) GEO")
                        .font(.mono(6.5, .semibold))
                        .kerning(0.5)
                        .foregroundStyle(Theme.muted.opacity(0.55))
                        .lineLimit(1)
                        .padding(.horizontal, 16)
                }
#endif
                ctaButton
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                emoteDeck
                    .padding(.horizontal, 16)
                    .padding(.top, 10)
                squadRail
                    .padding(.top, 12)
                    .padding(.bottom, 16)
            }

            // Secret phrase (long-press easter egg)
            if let phrase = secretPhrase {
                VStack {
                    Spacer()
                    Text("\u{201C}\(phrase)\u{201D}")
                        .font(.mono(11, .semibold))
                        .foregroundStyle(selected.tintSoft)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.vertical, 14)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.cardSoft))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected.tint.opacity(0.4), lineWidth: 1))
                        .padding(.bottom, 220)
                        .transition(.scale(scale: 0.85).combined(with: .opacity))
                }
                .allowsHitTesting(false)
            }
        }
        .preferredColorScheme(.dark)
        .animation(.spring(duration: 0.35), value: secretPhrase != nil)
    }

    // MARK: header

    private var header: some View {
        HStack {
            Text("BOBBY SQUAD // 3D")
                .font(.mono(11, .bold))
                .kerning(2.0)
                .foregroundStyle(Theme.text.opacity(0.75))
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Theme.card))
            }
            .accessibilityIdentifier("squad-close")
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
    }

    // MARK: stage

    private var stage: some View {
        ZStack {
            MascotSceneView(
                assetName: selected.id,
                interactive: true,
                emoteEvent: emoteEvent,
                onLoading: { loading, failed in
                    stageLoading = loading
                    stageFailed = failed
                },
                onMetrics: { performanceMetrics = $0 },
                onSecretPhrase: {
                    secretPhrase = selected.secretPhrase
                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3.2) { secretPhrase = nil }
                }
            )
            .id(selected.id) // portal: fresh scene per companion
            .opacity(stageLoading ? 0 : 1)
            .scaleEffect(stageLoading ? 0.72 : 1)
            .animation(.spring(duration: 0.5, bounce: 0.35), value: stageLoading)
            .saturation(isUnlocked ? 1 : 0)
            .opacity(isUnlocked ? 1 : 0.6)

            if stageLoading && !stageFailed {
                ProgressView()
                    .tint(selected.tint)
                    .scaleEffect(1.3)
            }
            if stageFailed {
                VStack(spacing: 6) {
                    Image(systemName: "cube.transparent")
                        .font(.system(size: 34))
                        .foregroundStyle(Theme.muted)
                    Text(L.t("Could not load the model", "No se pudo cargar el modelo"))
                        .font(.mono(10, .regular))
                        .foregroundStyle(Theme.muted)
                }
            }

            if !isUnlocked {
                // Locked: you can still look — grey, behind a lock. That is the FOMO.
                VStack(spacing: 8) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(Theme.text.opacity(0.85))
                    Text(L.t("UNLOCKS AT LEVEL \(selected.requiredLevel)", "SE DESBLOQUEA EN NIVEL \(selected.requiredLevel)"))
                        .font(.mono(9, .bold))
                        .kerning(1.6)
                        .foregroundStyle(Theme.text.opacity(0.8))
                    Text(L.t("Discipline gets you there, never volume.", "La disciplina te lleva, nunca el volumen."))
                        .font(.rounded(11, .medium))
                        .foregroundStyle(Theme.muted)
                }
                .padding(18)
                .background(RoundedRectangle(cornerRadius: 16).fill(Theme.bg.opacity(0.6)))
                .overlay(RoundedRectangle(cornerRadius: 16).stroke(Theme.stroke, lineWidth: 1))
            }

            // Selection burst
            SelectionBurst(trigger: burst, tint: selected.tint)
                .allowsHitTesting(false)
        }
        .frame(maxHeight: .infinity)
    }

    // MARK: identity

    private var identityBlock: some View {
        VStack(spacing: 4) {
            HStack(spacing: 8) {
                Text(isActive ? selected.name(at: store.level.number) : selected.label)
                    .font(.mono(22, .black))
                    .kerning(3.0)
                    .foregroundStyle(selected.tint)
                if isActive {
                    Text("· \(store.level.name)")
                        .font(.mono(10, .bold))
                        .kerning(1.4)
                        .foregroundStyle(selected.tintSoft)
                }
            }
            Text(selected.role)
                .font(.mono(9, .semibold))
                .kerning(2.2)
                .foregroundStyle(Theme.muted)
            Text(selected.personality)
                .font(.mono(10, .regular))
                .foregroundStyle(Theme.text.opacity(0.55))
                .padding(.top, 2)

            if isActive {
                // Evolution bar — discipline XP, never volume or PnL
                VStack(spacing: 3) {
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.card)
                            Capsule()
                                .fill(selected.tint)
                                .frame(width: max(6, geo.size.width * store.levelProgress))
                        }
                    }
                    .frame(height: 5)
                    HStack {
                        Text("DISCIPLINE XP \(store.disciplineXP)")
                        Spacer()
                        if let next = store.nextLevel {
                            Text(L.t("NEXT: \(next.name) · \(next.minXP)", "SIG: \(next.name) · \(next.minXP)"))
                        } else {
                            Text(L.t("MAX LEVEL", "NIVEL MÁXIMO"))
                        }
                    }
                    .font(.mono(7.5, .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 52)
                .padding(.top, 8)
            } else {
                Text(L.t("Drag to spin · tap for a reaction · hold for a secret…", "Arrastra para girarlo · toca para su reacción · mantén presionado…"))
                    .font(.mono(8, .regular))
                    .foregroundStyle(Theme.muted.opacity(0.6))
                    .padding(.top, 8)
            }
        }
    }

    // MARK: CTA

    private var ctaButton: some View {
        Button {
            guard isUnlocked, !isActive else { return }
            store.companionId = selected.id
            burst += 1
            justChosen = true
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            // In its OWN voice persona — the whole point of choosing it
            voice?.speak(selected.selectLine, voiceId: voiceId, persona: selected.voicePersona, playbackRate: 1.12)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { justChosen = false }
        } label: {
            Text(isActive ? (justChosen ? L.t("✓ YOUR COMPANION NOW", "✓ AHORA ES TU COMPANION") : L.t("✓ YOUR COMPANION", "✓ TU COMPANION")) :
                 isUnlocked ? L.t("MAKE IT MY COMPANION", "HACER MI COMPANION") : L.t("🔒 LEVEL \(selected.requiredLevel) REQUIRED", "🔒 NIVEL \(selected.requiredLevel) REQUERIDO"))
                .font(.mono(12, .black))
                .kerning(2.0)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .foregroundStyle(isActive ? selected.tint : (isUnlocked ? Theme.bg : Theme.muted))
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(isActive ? AnyShapeStyle(selected.tint.opacity(0.14)) : (isUnlocked ? AnyShapeStyle(selected.tint) : AnyShapeStyle(Theme.card)))
                )
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selected.tint.opacity(isActive ? 0.5 : 0), lineWidth: 1))
        }
        .disabled(!isUnlocked || isActive)
        .animation(.spring(duration: 0.3), value: justChosen)
    }

    // MARK: earned emotes

    private var emoteDeck: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Text("EARNED EMOTES")
                    .font(.mono(8, .bold))
                    .kerning(1.4)
                    .foregroundStyle(Theme.muted)
                Spacer()
                Text("DISCIPLINE, NOT SPEND")
                    .font(.mono(7, .semibold))
                    .foregroundStyle(selected.tintSoft.opacity(0.62))
            }
            HStack(spacing: 7) {
                ForEach(CompanionEmote.allCases) { emote in
                    let unlocked = store.level.number >= emote.requiredLevel
                    Button {
                        guard unlocked else {
                            UINotificationFeedbackGenerator().notificationOccurred(.warning)
                            return
                        }
                        emoteEvent = CompanionEmoteEvent(emote: emote)
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    } label: {
                        VStack(spacing: 4) {
                            Image(systemName: unlocked ? emote.symbol : "lock.fill")
                                .font(.system(size: 12, weight: .bold))
                            Text(unlocked ? emote.label : "LVL \(emote.requiredLevel)")
                                .font(.mono(6.5, .bold))
                                .lineLimit(1)
                        }
                        .foregroundStyle(unlocked ? selected.tintSoft : Theme.muted.opacity(0.52))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(RoundedRectangle(cornerRadius: 9).fill(unlocked ? selected.tint.opacity(0.08) : Theme.card))
                        .overlay(RoundedRectangle(cornerRadius: 9).stroke(unlocked ? selected.tint.opacity(0.28) : Theme.stroke, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    // MARK: squad rail (portraits)

    private var squadRail: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(bobbyCompanions) { c in
                    let unlocked = store.isUnlocked(c)
                    Button {
                        UIImpactFeedbackGenerator(style: .light).impactOccurred()
                        selectedId = c.id
                    } label: {
                        VStack(spacing: 5) {
                            ZStack(alignment: .bottomTrailing) {
                                CompanionThumb(companion: c)
                                    .frame(width: 62, height: 62)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .saturation(unlocked ? 1 : 0)
                                    .opacity(unlocked ? 1 : 0.8)
                                    .overlay {
                                        if !unlocked {
                                            ZStack {
                                                RoundedRectangle(cornerRadius: 12).fill(Color.black.opacity(0.35))
                                                Image(systemName: "lock.fill")
                                                    .font(.system(size: 15, weight: .bold))
                                                    .foregroundStyle(Theme.text.opacity(0.9))
                                                    .padding(7)
                                                    .background(Circle().fill(Theme.bg.opacity(0.85)))
                                            }
                                        }
                                    }
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(selectedId == c.id ? c.tint : (store.companionId == c.id ? c.tint.opacity(0.5) : Theme.stroke),
                                                    lineWidth: selectedId == c.id ? 2 : 1)
                                    )
                                if store.companionId == c.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 14))
                                        .foregroundStyle(c.tint)
                                        .background(Circle().fill(Theme.bg))
                                        .offset(x: 4, y: 4)
                                }
                            }
                            Text(c.label)
                                .font(.mono(8.5, .bold))
                                .kerning(1.0)
                                .foregroundStyle(selectedId == c.id ? c.tint : Theme.text.opacity(0.5))
                            Text(unlocked ? c.role : L.t("LEVEL \(c.requiredLevel)", "NIVEL \(c.requiredLevel)"))
                                .font(.mono(6, .regular))
                                .kerning(0.6)
                                .foregroundStyle(Theme.muted.opacity(0.7))
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
        }
    }
}

// ---- Selection particle burst --------------------------------

private struct SelectionBurst: View {
    let trigger: Int
    let tint: Color
    @State private var animating = false

    var body: some View {
        ZStack {
            ForEach(0..<12, id: \.self) { i in
                Circle()
                    .fill(tint)
                    .frame(width: 6, height: 6)
                    .offset(y: animating ? -120 : 0)
                    .rotationEffect(.degrees(Double(i) / 12 * 360))
                    .opacity(animating ? 0 : 0.9)
                    .scaleEffect(animating ? 0.3 : 1)
            }
        }
        .onChange(of: trigger) {
            guard trigger > 0, !UIAccessibility.isReduceMotionEnabled else { return }
            animating = false
            withAnimation(.easeOut(duration: 0.7)) { animating = true }
        }
    }
}

// ---- SceneKit stage ------------------------------------------

struct MascotSceneView: UIViewRepresentable {
    let assetName: String
    var interactive: Bool = true
    /// True while the companion is talking — drives the puppet-talk motion
    /// (rhythmic nod + breathe pulse), scaled by `voiceLevel` when the
    /// player meters audio, procedural when it does not (AVSpeech fallback).
    var speaking: Bool = false
    var voiceLevel: CGFloat = 0
    var emoteEvent: CompanionEmoteEvent? = nil
    var onLoading: ((_ loading: Bool, _ failed: Bool) -> Void)? = nil
    var onMetrics: ((MascotPerformanceMetrics) -> Void)? = nil
    var onSecretPhrase: (() -> Void)? = nil
    /// Unlocked gear worn on the body (the Fortnite effect) and the pet at
    /// its feet. Attached to the model root so they turn with the companion.
    var gear: [CompanionTool] = []
    var pet: CompanionPet? = nil
    /// Tool id that was just equipped: it flies from the front onto its body
    /// slot with a pop. Bump `equipToken` to replay.
    var equipToolId: String? = nil
    var equipToken: Int = 0
    /// Bump to receive a rendered snapshot of the scene (share my skin).
    var snapshotToken: Int = 0
    var onSnapshot: ((UIImage) -> Void)? = nil
    /// Deterministic pose for the DEBUG attachment matrix: no spin, bob or hop.
    var staticPose = false

    func makeUIView(context: Context) -> SCNView {
        let view = SCNView()
        view.backgroundColor = .clear
        view.allowsCameraControl = interactive
        view.autoenablesDefaultLighting = true
        view.antialiasingMode = .multisampling2X
        context.coordinator.owner = self

        if interactive {
            let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onTap))
            tap.numberOfTapsRequired = 1
            let doubleTap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onDoubleTap))
            doubleTap.numberOfTapsRequired = 2
            tap.require(toFail: doubleTap)
            let press = UILongPressGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onLongPress))
            press.minimumPressDuration = 0.55
            let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.onPanStopSpin))
            pan.cancelsTouchesInView = false
            pan.delegate = context.coordinator
            [tap, doubleTap, press, pan].forEach { view.addGestureRecognizer($0) }
        }

        load(into: view, coordinator: context.coordinator)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        context.coordinator.owner = self
        context.coordinator.setTalking(speaking, level: voiceLevel)
        context.coordinator.applyGearIfNeeded(gear, pet: pet)
        if equipToken != context.coordinator.lastEquipToken {
            context.coordinator.lastEquipToken = equipToken
            if let equipToolId { context.coordinator.playEquip(toolId: equipToolId) }
        }
        if snapshotToken != context.coordinator.lastSnapshotToken {
            context.coordinator.lastSnapshotToken = snapshotToken
            if snapshotToken > 0 { onSnapshot?(view.snapshot()) }
        }
        if let event = emoteEvent, context.coordinator.lastEmoteId != event.id {
            context.coordinator.lastEmoteId = event.id
            context.coordinator.play(event.emote)
        }
        guard context.coordinator.currentAsset != assetName else { return }
        load(into: view, coordinator: context.coordinator)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    /// SwiftUI recreates this view per companion (`.id(selected.id)`) — tear
    /// the old scene down explicitly so stale display links, actions and
    /// GLTF callbacks never outlive their view.
    static func dismantleUIView(_ uiView: SCNView, coordinator: Coordinator) {
        coordinator.loadToken += 1        // stale loads return early
        coordinator.setTalking(false, level: 0)
        coordinator.modelRoot?.removeAllActions()
        uiView.scene = nil
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var owner: MascotSceneView?
        var currentAsset = ""
        var loadToken = 0
        weak var modelRoot: SCNNode?
        weak var view: SCNView?
        var initialCameraPosition = SCNVector3Zero
        var lastEmoteId: UUID?
        var modelRadius: Float = 1
        /// Half of the model's largest bounding-box dimension. Unlike the
        /// sphere radius, this is not inflated by tails/depth and matches web.
        var attachmentUnit: Float = 1
        var loadStartedAt: CFAbsoluteTime = 0
        var footprintBeforeLoad: UInt64 = 0
        weak var gearRoot: SCNNode?
        var appliedGearKey = ""
        var lastSnapshotToken = 0
        var lastEquipToken = 0

        /// The skin moment: the new piece appears big in front of the
        /// companion, flies to its slot, snaps with a squash-and-stretch pop,
        /// and the companion reacts. Fortnite energy, SceneKit budget.
        func playEquip(toolId: String) {
            guard let holder = gearRoot, let node = holder.childNode(withName: toolId, recursively: false), let body = modelRoot else { return }
            let r = CGFloat(attachmentUnit)
            let target = node.position
            let targetScale = node.scale
            node.removeAction(forKey: "equip")
            node.position = SCNVector3(0, Float(r * 0.35), Float(r * 1.5))
            node.scale = SCNVector3(2.4, 2.4, 2.4)
            node.opacity = 0
            let appear = SCNAction.group([.fadeIn(duration: 0.18), .scale(to: 2.0, duration: 0.18)])
            let fly = SCNAction.group([
                .move(to: target, duration: 0.42),
                .scale(to: CGFloat(targetScale.x), duration: 0.42),
            ])
            fly.timingMode = .easeInEaseOut
            let pop = SCNAction.sequence([
                .scale(to: CGFloat(targetScale.x) * 1.35, duration: 0.09),
                .scale(to: CGFloat(targetScale.x) * 0.92, duration: 0.09),
                .scale(to: CGFloat(targetScale.x), duration: 0.14),
            ])
            node.runAction(.sequence([appear, .wait(duration: 0.12), fly, pop]), forKey: "equip")
            // The companion feels it: a little squash when the piece lands.
            body.removeAction(forKey: "emote")
            let react = SCNAction.sequence([
                .wait(duration: 0.72),
                .scale(to: 1.08, duration: 0.09),
                .scale(to: 0.96, duration: 0.09),
                .scale(to: 1.0, duration: 0.16),
            ])
            react.timingMode = .easeInEaseOut
            body.runAction(react, forKey: "emote")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.72) {
                UIImpactFeedbackGenerator(style: .rigid).impactOccurred(intensity: 1)
            }
        }

        /// Worn gear + pet. Re-applied only when the set changes or the model reloads.
        func applyGearIfNeeded(_ tools: [CompanionTool], pet: CompanionPet?, force: Bool = false) {
            let key = tools.map { $0.id }.joined(separator: ",") + "|" + (pet?.id ?? "")
            guard force || key != appliedGearKey, let root = modelRoot else { return }
            appliedGearKey = key
            gearRoot?.removeFromParentNode()
            let holder = SCNNode()
            holder.name = "gear"
            let r = CGFloat(attachmentUnit)
            // Body anchors use half of the largest bounding-box dimension, the
            // same unit as web. Item overrides handle intentional two-handed
            // loadouts without weakening the companion/slot defaults.
            func anchor(_ tool: CompanionTool) -> (SCNVector3, CGFloat) {
                let defaults: [BodySlot: (CGFloat, CGFloat, CGFloat, CGFloat)] = [
                    .face: (0, 0.42, 0.80, 0.62), .headset: (0, 0.62, 0.70, 0.72),
                    .head: (0, 1.22, 0, 0.62), .hand: (0.80, -0.42, 0.50, 0.46),
                    .hip: (0.36, -0.12, 0.70, 0.36), .shoulder: (-0.60, 0.50, 0.42, 0.44),
                    .chest: (0, 0.12, 0.86, 0.44),
                ]
                let profiles: [String: [BodySlot: (CGFloat, CGFloat, CGFloat, CGFloat)]] = [
                    "orb": [.hand: (0.45,-0.18,0.76,0.34), .chest: (0,0.02,0.94,0.38), .head: (0,0.96,0.08,0.42)],
                    "byte": [.hip: (0.32,-0.18,0.76,0.30), .face: (0,0.45,0.92,0.62), .hand: (0.53,-0.42,0.68,0.34)],
                    "kora": [.headset: (0,0.58,0.64,0.68), .shoulder: (-0.22,0.14,0.78,0.28), .hand: (0.24,-0.46,0.80,0.30)],
                    "zip": [.hand: (0.38,-0.40,0.76,0.29), .shoulder: (-0.32,0.20,0.72,0.29), .head: (0,1.02,0.08,0.38)],
                    "glitch": [.hand: (0.62,-0.34,0.60,0.38), .chest: (0,0.05,0.92,0.36)],
                    "momo": [.hand: (0.58,-0.22,0.62,0.36), .face: (0,0.20,0.94,0.58), .head: (0,0.98,0.08,0.40)],
                    "flux": [.hand: (0.58,-0.30,0.62,0.34), .chest: (0,-0.02,0.92,0.36), .head: (0,1.10,0.08,0.38)],
                    "rook": [.chest: (0,0.18,0.94,0.36), .head: (0,1.06,0.08,0.38), .hand: (0.60,-0.48,0.58,0.36)],
                    "halo": [.chest: (0,0,0.94,0.40), .shoulder: (-0.66,0.10,0.56,0.34), .head: (0,0.96,0.08,0.40)],
                    "axiom": [.hand: (0.62,-0.28,0.62,0.34), .chest: (0,0.04,0.94,0.34), .head: (0,1.00,0.08,0.38)],
                ]
                let itemOverrides: [String: (CGFloat, CGFloat, CGFloat, CGFloat)] = [
                    // Glitch dual-wields: keep the hammer and blade visible on
                    // opposite hands in the full skin instead of stacking them.
                    "glitch-1": (0.36,-0.34,0.60,0.38),
                    "glitch-2": (-0.36,-0.34,0.60,0.38),
                ]
                let a = itemOverrides[tool.id]
                    ?? profiles[owner?.assetName ?? ""]?[tool.slot]
                    ?? defaults[tool.slot]
                    ?? defaults[.hand]!
                return (SCNVector3(Float(r * a.0), Float(r * a.1), Float(r * a.2)), r * a.3)
            }
            for tool in tools {
                let tint = tool.isGolden ? UIColor(red: 0.96, green: 0.77, blue: 0.26, alpha: 1) : UIColor(hue: 0.415, saturation: 0.7, brightness: 0.95, alpha: 1)
                // Cutout art (transparent PNG) when we have it; otherwise a small badge.
                let art = UIImage(named: tool.assetName)
                let image = art ?? Self.glyphImage(tool.symbol, tint: tint, symbolic: true)
                let (position, size) = anchor(tool)
                let plane = SCNPlane(width: size, height: size)
                plane.cornerRadius = art == nil ? size * 0.5 : 0
                plane.firstMaterial?.diffuse.contents = image
                plane.firstMaterial?.isDoubleSided = true
                plane.firstMaterial?.lightingModel = .constant
                plane.firstMaterial?.transparencyMode = .aOne
                plane.firstMaterial?.blendMode = .alpha
                plane.firstMaterial?.writesToDepthBuffer = false
                let node = SCNNode(geometry: plane)
                node.name = tool.id
                node.position = position
                node.renderingOrder = 10 + tool.tier
                // No billboard constraint: the plane inherits the GLB's
                // rotation and stays physically attached while the user spins.
                if tool.slot == .head && !(owner?.staticPose ?? false) {
                    // The golden piece hovers above the head with a slow bob.
                    let bob = SCNAction.sequence([
                        .moveBy(x: 0, y: r * 0.05, z: 0, duration: 1.3),
                        .moveBy(x: 0, y: -r * 0.05, z: 0, duration: 1.3),
                    ])
                    bob.timingMode = .easeInEaseOut
                    node.runAction(.repeatForever(bob))
                }
                if tool.isGolden {
                    let glow = SCNPlane(width: size * 1.7, height: size * 1.7)
                    glow.cornerRadius = size * 0.85
                    glow.firstMaterial?.diffuse.contents = Self.glowImage(tint)
                    glow.firstMaterial?.lightingModel = .constant
                    glow.firstMaterial?.transparencyMode = .aOne
                    glow.firstMaterial?.blendMode = .add
                    glow.firstMaterial?.writesToDepthBuffer = false
                    let g = SCNNode(geometry: glow)
                    g.position = SCNVector3(0, 0, -0.002)
                    g.renderingOrder = 9
                    node.addChildNode(g)
                }
                holder.addChildNode(node)
            }
            if let pet {
                let size = r * 0.70
                let plane = SCNPlane(width: size, height: size)
                plane.firstMaterial?.diffuse.contents = UIImage(named: pet.assetName) ?? Self.glyphImage(pet.emoji, tint: .white, symbolic: false)
                plane.firstMaterial?.isDoubleSided = true
                plane.firstMaterial?.lightingModel = .constant
                plane.firstMaterial?.transparencyMode = .aOne
                plane.firstMaterial?.blendMode = .alpha
                plane.firstMaterial?.writesToDepthBuffer = false
                let node = SCNNode(geometry: plane)
                node.position = SCNVector3(Float(-r * 0.72), Float(-r * 0.66), Float(r * 0.55))
                node.renderingOrder = 14
                let billboard = SCNBillboardConstraint()
                billboard.freeAxes = .Y
                node.constraints = [billboard]
                if owner?.staticPose == true {
                    // Snapshot fixture: keep the pet on its physical anchor.
                } else if pet.spins {
                    // The spinning panda: an in-plane twirl, forever.
                    node.runAction(.repeatForever(.rotateBy(x: 0, y: 0, z: 2 * .pi, duration: 2.2)))
                } else {
                    let hop = SCNAction.sequence([
                        .moveBy(x: 0, y: r * 0.06, z: 0, duration: 0.35),
                        .moveBy(x: 0, y: -r * 0.06, z: 0, duration: 0.35),
                        .wait(duration: 1.4),
                    ])
                    node.runAction(.repeatForever(hop))
                }
                holder.addChildNode(node)
            }
            root.addChildNode(holder)
            gearRoot = holder
        }

        /// Emoji / symbol rendered to a texture with a soft dark disc behind it.
        static func glyphImage(_ glyph: String, tint: UIColor, symbolic: Bool) -> UIImage {
            let side: CGFloat = 256
            return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { ctx in
                if symbolic {
                    UIColor.black.withAlphaComponent(0.72).setFill()
                    ctx.cgContext.fillEllipse(in: CGRect(x: 8, y: 8, width: side - 16, height: side - 16))
                    tint.withAlphaComponent(0.9).setStroke()
                    ctx.cgContext.setLineWidth(6)
                    ctx.cgContext.strokeEllipse(in: CGRect(x: 8, y: 8, width: side - 16, height: side - 16))
                }
                if symbolic, let symbol = UIImage(systemName: glyph)?.withTintColor(tint, renderingMode: .alwaysOriginal) {
                    let inset = side * 0.26
                    symbol.draw(in: CGRect(x: inset, y: inset, width: side - inset * 2, height: side - inset * 2))
                } else {
                    let attrs: [NSAttributedString.Key: Any] = [.font: UIFont.systemFont(ofSize: side * 0.7)]
                    let str = NSAttributedString(string: glyph, attributes: attrs)
                    let bounds = str.boundingRect(with: CGSize(width: side, height: side), options: .usesLineFragmentOrigin, context: nil)
                    str.draw(at: CGPoint(x: (side - bounds.width) / 2, y: (side - bounds.height) / 2))
                }
            }
        }

        static func glowImage(_ tint: UIColor) -> UIImage {
            let side: CGFloat = 256
            return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { ctx in
                let colors = [tint.withAlphaComponent(0.55).cgColor, tint.withAlphaComponent(0).cgColor] as CFArray
                if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                    ctx.cgContext.drawRadialGradient(gradient, startCenter: CGPoint(x: side / 2, y: side / 2), startRadius: 0, endCenter: CGPoint(x: side / 2, y: side / 2), endRadius: side / 2, options: [])
                }
            }
        }

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

        // Any drag = the user takes the camera → stop competing with auto-spin
        @objc func onPanStopSpin(_ g: UIPanGestureRecognizer) {
            if g.state == .began { modelRoot?.removeAction(forKey: "spin") }
        }

        // Tap = emote: quick squash-and-stretch + haptic
        @objc func onTap() {
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            play(.pulse)
        }

        func play(_ emote: CompanionEmote) {
            guard let node = modelRoot else { return }
            node.removeAction(forKey: "emote")
            let action: SCNAction
            switch emote {
            case .pulse:
                action = .sequence([
                    .scale(to: 1.1, duration: 0.09),
                    .scale(to: 0.94, duration: 0.09),
                    .scale(to: 1.0, duration: 0.16),
                ])
            case .orbit:
                action = .rotateBy(x: 0, y: 2 * .pi, z: 0, duration: 0.62)
            case .victory:
                action = .sequence([
                    .moveBy(x: 0, y: CGFloat(modelRadius * 0.18), z: 0, duration: 0.18),
                    .rotateBy(x: 0, y: .pi, z: 0, duration: 0.24),
                    .moveBy(x: 0, y: CGFloat(-modelRadius * 0.18), z: 0, duration: 0.22),
                ])
            case .shield:
                action = .sequence([
                    .fadeOpacity(to: 0.58, duration: 0.08),
                    .scale(to: 1.14, duration: 0.16),
                    .fadeOpacity(to: 1, duration: 0.12),
                    .scale(to: 1, duration: 0.2),
                ])
            case .legend:
                action = .group([
                    .sequence([
                        .scale(to: 1.16, duration: 0.18),
                        .scale(to: 1, duration: 0.28),
                    ]),
                    .rotateBy(x: 0, y: 4 * .pi, z: 0, duration: 0.75),
                ])
            }
            action.timingMode = .easeInEaseOut
            node.runAction(action, forKey: "emote")
        }

        // Double tap = back to the initial pose, spin resumes
        @objc func onDoubleTap() {
            guard let node = modelRoot else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            node.removeAction(forKey: "spin")
            node.runAction(.rotateTo(x: 0, y: 0, z: 0, duration: 0.35, usesShortestUnitArc: true)) { [weak self] in
                self?.startSpin()
            }
            if let cam = view?.pointOfView {
                SCNTransaction.begin()
                SCNTransaction.animationDuration = 0.35
                cam.position = initialCameraPosition
                cam.eulerAngles = SCNVector3Zero
                SCNTransaction.commit()
            }
        }

        @objc func onLongPress(_ g: UILongPressGestureRecognizer) {
            guard g.state == .began else { return }
            owner?.onSecretPhrase?()
        }

        // ---- puppet talk: the companion MOVES while it speaks ----
        private var talkLink: CADisplayLink?
        private var talking = false
        private var talkLevel: CGFloat = 0
        private var talkStart: CFTimeInterval = 0

        func setTalking(_ on: Bool, level: CGFloat) {
            talkLevel = level
            guard on != talking else { return }
            talking = on
            if on {
                talkStart = CACurrentMediaTime()
                let link = CADisplayLink(target: self, selector: #selector(talkTick))
                link.add(to: .main, forMode: .common)
                talkLink = link
            } else {
                talkLink?.invalidate()
                talkLink = nil
                guard let node = modelRoot else { return }
                SCNTransaction.begin()
                SCNTransaction.animationDuration = 0.3
                node.scale = SCNVector3(1, 1, 1)
                node.eulerAngles.x = 0
                SCNTransaction.commit()
            }
        }

        @objc private func talkTick() {
            guard let node = modelRoot else { return }
            if UIAccessibility.isReduceMotionEnabled {
                // Static presence instead of rhythm — still visibly "on"
                node.scale = SCNVector3(1.02, 1.02, 1.02)
                return
            }
            let t = CACurrentMediaTime() - talkStart
            // Metered level when the player provides one; procedural voice
            // rhythm otherwise, so it still talks on the AVSpeech fallback.
            let pulse = max(Double(talkLevel), 0.25 + 0.20 * abs(sin(t * 6.8)) + 0.12 * abs(sin(t * 11.3)))
            let s = Float(1 + pulse * 0.055)
            node.scale = SCNVector3(s, s, s)
            node.eulerAngles.x = Float(sin(t * 8.6) * 0.05 * (0.35 + pulse))
        }

        deinit { talkLink?.invalidate() }

        func startSpin() {
            // Accessibility: an ever-spinning model is exactly what Reduce
            // Motion asks us not to do.
            guard !UIAccessibility.isReduceMotionEnabled, owner?.staticPose != true else { return }
            modelRoot?.runAction(.repeatForever(.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: 14)), forKey: "spin")
        }
    }

    private func load(into view: SCNView, coordinator: Coordinator) {
        coordinator.currentAsset = assetName
        coordinator.loadToken += 1
        coordinator.view = view
        coordinator.loadStartedAt = CFAbsoluteTimeGetCurrent()
        coordinator.footprintBeforeLoad = Self.appFootprintBytes()
        let token = coordinator.loadToken
        onLoading?(true, false)

        let url = Bundle.main.url(forResource: assetName, withExtension: "glb")
            ?? Bundle.main.url(forResource: assetName, withExtension: "glb", subdirectory: "Mascots")
        guard let url else { onLoading?(false, true); return }

        GLTFAsset.load(with: url, options: [:]) { _, status, maybeAsset, _, _ in
            DispatchQueue.main.async {
                guard token == coordinator.loadToken else { return } // stale switch
                guard status == .complete, let asset = maybeAsset else {
                    self.onLoading?(false, true)
                    return
                }
                let source = GLTFSCNSceneSource(asset: asset)
                let scene = source.defaultScene ?? SCNScene()
                scene.background.contents = UIColor.clear

                let root = scene.rootNode
                let (minimum, maximum) = root.boundingBox
                let center = SCNVector3(
                    (minimum.x + maximum.x) / 2,
                    (minimum.y + maximum.y) / 2,
                    (minimum.z + maximum.z) / 2
                )
                let maxExtent = max(maximum.x - minimum.x, maximum.y - minimum.y, maximum.z - minimum.z)
                let (_, radius) = root.boundingSphere
                coordinator.modelRadius = max(radius, 0.001)
                coordinator.attachmentUnit = max(maxExtent / 2, 0.001)
                root.childNodes.forEach { node in
                    node.position.x -= center.x
                    node.position.y -= center.y
                    node.position.z -= center.z
                }

                let cameraNode = SCNNode()
                cameraNode.camera = SCNCamera()
                cameraNode.position = SCNVector3(0, radius * 0.15, max(radius, 0.001) * 2.6)
                scene.rootNode.addChildNode(cameraNode)

                view.scene = scene
                view.pointOfView = cameraNode
                coordinator.modelRoot = root
                coordinator.initialCameraPosition = cameraNode.position
                if let owner = coordinator.owner { coordinator.applyGearIfNeeded(owner.gear, pet: owner.pet, force: true) }
                coordinator.startSpin()
                var nodeCount = 1
                var geometryCount = root.geometry == nil ? 0 : 1
                root.enumerateChildNodes { node, _ in
                    nodeCount += 1
                    if node.geometry != nil { geometryCount += 1 }
                }
                let footprint = Self.appFootprintBytes()
                let assetBytes = ((try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? NSNumber)?.int64Value ?? 0
                let metrics = MascotPerformanceMetrics(
                    assetName: self.assetName,
                    loadMilliseconds: Int((CFAbsoluteTimeGetCurrent() - coordinator.loadStartedAt) * 1_000),
                    assetBytes: assetBytes,
                    appFootprintBytes: footprint,
                    footprintDeltaBytes: Int64(footprint) - Int64(coordinator.footprintBeforeLoad),
                    nodeCount: nodeCount,
                    geometryCount: geometryCount
                )
#if DEBUG
                print("[MascotMetrics] \(metrics.assetName) load=\(metrics.loadMilliseconds)ms asset=\(metrics.assetBytes)B footprint=\(metrics.appFootprintBytes)B delta=\(metrics.footprintDeltaBytes)B nodes=\(metrics.nodeCount) geo=\(metrics.geometryCount)")
#endif
                self.onMetrics?(metrics)
                self.onLoading?(false, false)
            }
        }
    }

    private static func appFootprintBytes() -> UInt64 {
        var info = task_vm_info_data_t()
        var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<natural_t>.size)
        let result = withUnsafeMutablePointer(to: &info) { pointer in
            pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
            }
        }
        return result == KERN_SUCCESS ? info.phys_footprint : 0
    }
}

#if DEBUG
/// Direct, backend-free fixture for the complete skin matrix. One launch
/// renders the exact desk and preview sizes side by side for the same loadout.
struct GearSkinQAFixtureView: View {
    private let companion: Companion
    private let caseId: String
    private let tools: [CompanionTool]
    private let pet: CompanionPet?
    @State private var deskReady = false
    @State private var previewReady = false
    @State private var failed = false

    init(arguments: [String] = ProcessInfo.processInfo.arguments) {
        func value(after flag: String) -> String? {
            guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
            return arguments[index + 1]
        }
        let companionId = value(after: "-qa-companion") ?? "orb"
        let requestedCase = value(after: "-qa-item") ?? "full"
        let selected = bobbyCompanions.first { $0.id == companionId } ?? bobbyCompanions[0]
        companion = selected
        caseId = requestedCase
        if requestedCase == "full" {
            tools = CompanionToolkit.tools(for: selected.id)
            pet = CompanionToolkit.pet(for: selected.id)
        } else if requestedCase == "pet" {
            tools = []
            pet = CompanionToolkit.pet(for: selected.id)
        } else {
            tools = CompanionToolkit.tools(for: selected.id).filter { $0.id == requestedCase }
            pet = nil
        }
    }

    var body: some View {
        VStack(spacing: 12) {
            Text("SKIN QA // \(companion.id.uppercased()) // \(caseId.uppercased())")
                .font(.mono(12, .bold)).kerning(1.4).foregroundStyle(companion.tintSoft)
                .padding(.top, 8)

            qaStage(label: "DESK · 206×208", width: 206, height: 208) { loading, didFail in
                if !loading { deskReady = !didFail }
                failed = failed || didFail
            }

            qaStage(label: "PREVIEW · 340 PT", width: nil, height: 340) { loading, didFail in
                if !loading { previewReady = !didFail }
                failed = failed || didFail
            }

            Text(failed ? "FAILED" : (deskReady && previewReady ? "READY" : "LOADING"))
                .font(.mono(11, .bold))
                .foregroundStyle(failed ? Theme.down : Theme.up)
                .accessibilityIdentifier(failed ? "qa-skin-failed" : (deskReady && previewReady ? "qa-skin-ready" : "qa-skin-loading"))
            Spacer(minLength: 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(KineticBackground())
        .preferredColorScheme(.dark)
    }

    private func qaStage(
        label: String,
        width: CGFloat?,
        height: CGFloat,
        onLoading: @escaping (Bool, Bool) -> Void
    ) -> some View {
        VStack(spacing: 4) {
            Text(label).font(.mono(9, .bold)).foregroundStyle(Theme.muted)
            MascotSceneView(
                assetName: companion.id,
                interactive: false,
                onLoading: onLoading,
                gear: tools,
                pet: pet,
                staticPose: true
            )
            .frame(width: width, height: height)
            .background(companion.tint.opacity(0.06))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(companion.tint.opacity(0.30), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .frame(maxWidth: .infinity)
    }
}
#endif

// ---- Evolution moment ----------------------------------------
// The payoff: discipline made the companion change form, name and tone.

struct EvolutionOverlay: View {
    let companion: Companion
    let level: CompanionLevel
    let onDismiss: () -> Void

    @State private var appeared = false

    var body: some View {
        ZStack {
            Color.black.opacity(0.88).ignoresSafeArea()
                .onTapGesture { onDismiss() }

            VStack(spacing: 18) {
                Text(L.t("EVOLVED", "EVOLUCIONÓ"))
                    .font(.mono(10, .black))
                    .kerning(4.0)
                    .foregroundStyle(companion.tintSoft)

                MascotSceneView(assetName: companion.id, interactive: false)
                    .frame(width: 240, height: 240)
                    .scaleEffect(appeared ? 1 : 0.5)
                    .shadow(color: companion.tint.opacity(0.6), radius: 40)

                VStack(spacing: 6) {
                    Text(companion.name(at: level.number))
                        .font(.mono(28, .black))
                        .kerning(3.0)
                        .foregroundStyle(companion.tint)
                        .shadow(color: companion.tint.opacity(0.7), radius: 14)
                    Text("LEVEL \(level.number) · \(level.name)")
                        .font(.mono(10, .bold))
                        .kerning(2.4)
                        .foregroundStyle(Theme.text.opacity(0.7))
                    Text(L.t("Earned with discipline, never with volume.",
                             "Ganado con disciplina, nunca con volumen."))
                        .font(.mono(9, .regular))
                        .foregroundStyle(Theme.muted)
                        .padding(.top, 4)
                }
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 14)

                Button(action: onDismiss) {
                    Text(L.t("CONTINUE", "SEGUIR"))
                        .font(.mono(11, .black))
                        .kerning(2.2)
                        .foregroundStyle(Theme.bg)
                        .padding(.horizontal, 34)
                        .padding(.vertical, 12)
                        .background(Capsule().fill(companion.tint))
                }
                .padding(.top, 6)
                .opacity(appeared ? 1 : 0)
            }
        }
        .onAppear {
            withAnimation(.spring(duration: 0.7, bounce: 0.4)) { appeared = true }
        }
    }
}
