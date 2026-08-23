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

struct MascotGalleryView: View {
    @ObservedObject var store: CompanionStore
    var voice: NeuralVoice?
    var voiceId: String = AgentVoice.dalia.rawValue

    @Environment(\.dismiss) private var dismiss
    @State private var selectedId: String
    @State private var stageLoading = false
    @State private var stageFailed = false
    @State private var secretPhrase: String?
    @State private var burst = 0            // particle burst trigger
    @State private var justChosen = false

    init(store: CompanionStore, voice: NeuralVoice? = nil, voiceId: String = AgentVoice.dalia.rawValue) {
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

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                stage
                identityBlock
                    .padding(.top, 2)
                ctaButton
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
                onLoading: { loading, failed in
                    stageLoading = loading
                    stageFailed = failed
                },
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
            .opacity(isUnlocked ? 1 : 0.5)

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
                    Text("No se pudo cargar el modelo")
                        .font(.mono(10, .regular))
                        .foregroundStyle(Theme.muted)
                }
            }

            if !isUnlocked {
                VStack(spacing: 8) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(Theme.text.opacity(0.8))
                    Text("SE DESBLOQUEA EN NIVEL \(selected.requiredLevel)")
                        .font(.mono(9, .bold))
                        .kerning(1.6)
                        .foregroundStyle(Theme.muted)
                }
                .padding(18)
                .background(RoundedRectangle(cornerRadius: 16).fill(Theme.bg.opacity(0.55)))
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
                Text(selected.label)
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
                            Text("SIG: \(next.name) · \(next.minXP)")
                        } else {
                            Text("MÁXIMO NIVEL")
                        }
                    }
                    .font(.mono(7.5, .semibold))
                    .kerning(0.8)
                    .foregroundStyle(Theme.muted)
                }
                .padding(.horizontal, 52)
                .padding(.top, 8)
            } else {
                Text("Arrastra para girarlo · toca para su reacción · mantén presionado…")
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
            voice?.speak(selected.selectLine, voiceId: voiceId)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { justChosen = false }
        } label: {
            Text(isActive ? (justChosen ? "✓ AHORA ES TU COMPANION" : "✓ TU COMPANION") :
                 isUnlocked ? "HACER MI COMPANION" : "🔒 NIVEL \(selected.requiredLevel) REQUERIDO")
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
                                    .opacity(unlocked ? 1 : 0.45)
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
                                } else if !unlocked {
                                    Image(systemName: "lock.fill")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(Theme.text.opacity(0.7))
                                        .padding(4)
                                        .background(Circle().fill(Theme.bg.opacity(0.9)))
                                        .offset(x: 3, y: 3)
                                }
                            }
                            Text(c.label)
                                .font(.mono(8.5, .bold))
                                .kerning(1.0)
                                .foregroundStyle(selectedId == c.id ? c.tint : Theme.text.opacity(0.5))
                            Text(unlocked ? c.role : "NIVEL \(c.requiredLevel)")
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
            guard trigger > 0 else { return }
            animating = false
            withAnimation(.easeOut(duration: 0.7)) { animating = true }
        }
    }
}

// ---- SceneKit stage ------------------------------------------

struct MascotSceneView: UIViewRepresentable {
    let assetName: String
    var interactive: Bool = true
    var onLoading: ((_ loading: Bool, _ failed: Bool) -> Void)? = nil
    var onSecretPhrase: (() -> Void)? = nil

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
        guard context.coordinator.currentAsset != assetName else { return }
        load(into: view, coordinator: context.coordinator)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var owner: MascotSceneView?
        var currentAsset = ""
        var loadToken = 0
        weak var modelRoot: SCNNode?
        weak var view: SCNView?
        var initialCameraPosition = SCNVector3Zero

        func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

        // Any drag = the user takes the camera → stop competing with auto-spin
        @objc func onPanStopSpin(_ g: UIPanGestureRecognizer) {
            if g.state == .began { modelRoot?.removeAction(forKey: "spin") }
        }

        // Tap = emote: quick squash-and-stretch + haptic
        @objc func onTap() {
            guard let node = modelRoot else { return }
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            let squash = SCNAction.sequence([
                .scale(to: 1.1, duration: 0.09),
                .scale(to: 0.94, duration: 0.09),
                .scale(to: 1.0, duration: 0.16),
            ])
            squash.timingMode = .easeInEaseOut
            node.runAction(squash)
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

        func startSpin() {
            modelRoot?.runAction(.repeatForever(.rotateBy(x: 0, y: 2 * .pi, z: 0, duration: 14)), forKey: "spin")
        }
    }

    private func load(into view: SCNView, coordinator: Coordinator) {
        coordinator.currentAsset = assetName
        coordinator.loadToken += 1
        coordinator.view = view
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
                let (center, radius) = root.boundingSphere
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
                coordinator.startSpin()
                self.onLoading?(false, false)
            }
        }
    }
}
