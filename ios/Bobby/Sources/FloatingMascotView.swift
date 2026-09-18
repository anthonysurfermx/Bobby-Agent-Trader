// ============================================================
// FloatingMascotView — the onboarding stage. One companion, big
// and alive: framed by its own height so every model reads at the
// same size, hovering over a soft floor shadow with a slow sway
// and a faint tremble. The SCNView takes no touches: horizontal
// drags belong to the pager and taps arrive as `pulseToken` bumps.
// ============================================================

import SwiftUI
import SceneKit
import GLTFKit2

/// Parsed GLBs kept while onboarding runs, so a swipe never waits on disk
/// and parse. Each view still builds its own SCNScene from the shared asset.
/// Main thread only.
enum MascotAssetCache {
    private static var assets: [String: GLTFAsset] = [:]
    private static var pending: [String: [(GLTFAsset?) -> Void]] = [:]

    static func load(_ name: String, _ done: @escaping (GLTFAsset?) -> Void) {
        if let hit = assets[name] { done(hit); return }
        if pending[name] != nil { pending[name]?.append(done); return }
        guard let url = Bundle.main.url(forResource: name, withExtension: "glb")
                ?? Bundle.main.url(forResource: name, withExtension: "glb", subdirectory: "Mascots") else {
            done(nil)
            return
        }
        pending[name] = [done]
        GLTFAsset.load(with: url, options: [:]) { _, status, asset, _, _ in
            DispatchQueue.main.async {
                let loaded = status == .complete ? asset : nil
                if let loaded { assets[name] = loaded }
                (pending.removeValue(forKey: name) ?? []).forEach { $0(loaded) }
            }
        }
    }

    static func preload(_ names: [String]) { names.forEach { load($0) { _ in } } }

    /// Onboarding is over: the desk has its own loader.
    static func purge() { assets.removeAll() }
}

struct FloatingMascotView: UIViewRepresentable {
    let assetName: String
    /// Only the page on screen animates; the rest hold still and cost nothing.
    var active = true
    var speaking = false
    var voiceLevel: CGFloat = 0
    /// Bump to play a quick squash-and-stretch (a tap on the companion).
    var pulseToken = 0
    var onReady: ((_ loaded: Bool) -> Void)? = nil

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> SCNView {
        let view = LayoutReportingSCNView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        view.autoenablesDefaultLighting = true
        view.antialiasingMode = .multisampling4X
        view.delegate = context.coordinator
        let coordinator = context.coordinator
        view.onLayout = { [weak coordinator] size in coordinator?.frame(for: size) }
        coordinator.apply(self, to: view)
        coordinator.load(assetName, into: view, onReady: onReady)
        return view
    }

    func updateUIView(_ view: SCNView, context: Context) {
        let coordinator = context.coordinator
        coordinator.apply(self, to: view)
        if coordinator.assetName != assetName { coordinator.load(assetName, into: view, onReady: onReady) }
    }

    static func dismantleUIView(_ view: SCNView, coordinator: Coordinator) {
        coordinator.token += 1
        view.delegate = nil
        view.isPlaying = false
        view.scene = nil
    }

    final class LayoutReportingSCNView: SCNView {
        var onLayout: ((CGSize) -> Void)?
        override func layoutSubviews() {
            super.layoutSubviews()
            onLayout?(bounds.size)
        }
    }

    final class Coordinator: NSObject, SCNSceneRendererDelegate {
        var assetName = ""
        var token = 0

        // Written on main, read on the render thread. Plain values: a torn
        // read costs one frame of motion, never a crash.
        private var active = true
        private var speaking = false
        private var level: Double = 0
        private var reduceMotion = false
        private var lastPulseToken = 0
        private var pulseAt: Double = -10

        private var pivot: SCNNode?   // hover, sway, tremble
        private var body: SCNNode?    // breathing, talking, tap pulse
        private var shadow: SCNNode?
        private var cameraNode: SCNNode?
        private var modelHeight: Float = 1
        private var modelWidth: Float = 1
        private var viewSize: CGSize = .zero
        /// Advances only while active, so a page that comes back resumes its
        /// pose instead of jumping.
        private var clock: Double = 0
        private var lastTime: Double?

        func apply(_ owner: FloatingMascotView, to view: SCNView) {
            active = owner.active
            speaking = owner.speaking
            level = Double(owner.voiceLevel)
            reduceMotion = UIAccessibility.isReduceMotionEnabled
            view.isPlaying = owner.active
            view.rendersContinuously = owner.active
            if owner.pulseToken != lastPulseToken {
                lastPulseToken = owner.pulseToken
                pulseAt = clock
            }
        }

        func load(_ name: String, into view: SCNView, onReady: ((Bool) -> Void)?) {
            assetName = name
            token += 1
            let current = token
            MascotAssetCache.load(name) { [weak self, weak view] asset in
                guard let self, let view, current == self.token else { return }
                if let asset { self.build(asset, in: view) }
                // Never flip SwiftUI state inside makeUIView (cache hits are synchronous).
                DispatchQueue.main.async { onReady?(asset != nil) }
            }
        }

        private func build(_ asset: GLTFAsset, in view: SCNView) {
            let imported = GLTFSCNSceneSource(asset: asset).defaultScene ?? SCNScene()
            let scene = SCNScene()
            scene.background.contents = UIColor.clear

            // pivot → body → offset → model. The offset centres the model on
            // the origin so sway turns it in place and breathing scales from
            // its middle; the camera stays outside all of it.
            let offset = SCNNode()
            imported.rootNode.childNodes.forEach { offset.addChildNode($0) }
            let (lo, hi) = offset.boundingBox
            let height = max(hi.y - lo.y, 0.001)
            modelHeight = height
            modelWidth = max(hi.x - lo.x, 0.001)
            offset.position = SCNVector3(-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -(lo.z + hi.z) / 2)
            let body = SCNNode()
            body.addChildNode(offset)
            let pivot = SCNNode()
            pivot.addChildNode(body)
            scene.rootNode.addChildNode(pivot)

            let footprint = CGFloat(min(modelWidth, height * 0.8)) * 1.1
            let plane = SCNPlane(width: footprint, height: footprint)
            plane.firstMaterial?.diffuse.contents = Self.shadowImage
            plane.firstMaterial?.lightingModel = .constant
            plane.firstMaterial?.blendMode = .alpha
            plane.firstMaterial?.writesToDepthBuffer = false
            let shadow = SCNNode(geometry: plane)
            shadow.eulerAngles.x = -.pi / 2
            shadow.position = SCNVector3(0, -height / 2 - height * 0.05, 0)
            shadow.renderingOrder = -1
            scene.rootNode.addChildNode(shadow)

            let camera = SCNCamera()
            camera.fieldOfView = 28
            camera.projectionDirection = .vertical
            camera.zNear = Double(height) * 0.05
            camera.zFar = Double(height) * 60
            let cameraNode = SCNNode()
            cameraNode.camera = camera
            scene.rootNode.addChildNode(cameraNode)

            self.pivot = pivot
            self.body = body
            self.shadow = shadow
            self.cameraNode = cameraNode
            clock = 0
            lastTime = nil
            view.scene = scene
            view.pointOfView = cameraNode
            frame(for: view.bounds.size)
        }

        /// Same fill for every companion: the model's height (plus hover room)
        /// takes ~75% of the stage, unless its width would spill sideways.
        func frame(for size: CGSize) {
            if size.width > 1, size.height > 1 { viewSize = size }
            guard let cameraNode else { return }
            let aspect = viewSize.height > 1 ? Float(viewSize.width / viewSize.height) : 0.85
            let halfTan = tan(Float(14) * .pi / 180)
            let fitHeight = (modelHeight * 1.34 / 2) / halfTan
            let fitWidth = (modelWidth * 1.18 / 2) / (halfTan * aspect)
            let distance = max(fitHeight, fitWidth)
            cameraNode.position = SCNVector3(0, modelHeight * 0.10, distance)
            cameraNode.look(at: SCNVector3(0, -modelHeight * 0.03, 0))
        }

        func renderer(_ renderer: SCNSceneRenderer, updateAtTime time: TimeInterval) {
            let dt = lastTime.map { min(max(time - $0, 0), 1.0 / 20) } ?? 0
            lastTime = time
            guard active, let pivot, let body else { return }
            clock += dt
            let t = clock
            let h = modelHeight

            var scale = 1.0
            var nod = 0.0
            if speaking {
                // Metered level when the clip reports one; procedural rhythm otherwise.
                let beat = max(level, 0.25 + 0.20 * abs(sin(t * 6.8)) + 0.12 * abs(sin(t * 11.3)))
                scale += beat * 0.045
                nod = sin(t * 8.6) * 0.05 * (0.35 + beat)
            }
            let sincePulse = t - pulseAt
            if sincePulse >= 0, sincePulse < 0.7 { scale += exp(-sincePulse * 7) * sin(sincePulse * 26) * 0.09 }

            if reduceMotion {
                pivot.position = SCNVector3Zero
                pivot.eulerAngles = SCNVector3Zero
                body.scale = SCNVector3(Float(scale), Float(scale), Float(scale))
                body.eulerAngles.x = 0
                return
            }

            let hover = sin(t * 2 * .pi / 2.8)          // −1…1, the float
            let lift = Float((hover + 1) / 2)            // 0 on the floor, 1 at the top
            // The tremble: two fast, tiny, out-of-phase wobbles read as a hum
            // of energy rather than a shake.
            let tremble = (sin(t * 2 * .pi * 9.1) + 0.6 * sin(t * 2 * .pi * 13.7)) * 0.0045
            pivot.position = SCNVector3(Float(sin(t * 2 * .pi * 7.3)) * h * 0.0016, Float(hover) * h * 0.035, 0)
            pivot.eulerAngles = SCNVector3(0, Float(sin(t * 2 * .pi / 7.0) * 0.30), Float(tremble))
            scale += sin(t * 2 * .pi / 1.9) * 0.010      // breathing
            body.scale = SCNVector3(Float(scale), Float(scale), Float(scale))
            body.eulerAngles.x = Float(nod)
            shadow?.scale = SCNVector3(1 - lift * 0.18, 1 - lift * 0.18, 1)
            shadow?.opacity = CGFloat(0.95 - lift * 0.35)
        }

        /// Soft contact shadow: black at the centre, gone at the rim.
        static let shadowImage: UIImage = {
            let side: CGFloat = 128
            return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { ctx in
                let colors = [UIColor.black.withAlphaComponent(0.62).cgColor, UIColor.black.withAlphaComponent(0).cgColor] as CFArray
                if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0, 1]) {
                    let c = CGPoint(x: side / 2, y: side / 2)
                    ctx.cgContext.drawRadialGradient(gradient, startCenter: c, startRadius: 0, endCenter: c, endRadius: side / 2, options: [])
                }
            }
        }()
    }
}
