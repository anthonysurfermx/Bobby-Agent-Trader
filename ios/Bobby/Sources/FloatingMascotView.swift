// ============================================================
// FloatingMascotView — the onboarding stage. One companion, big
// and alive: framed by its own height so every model reads at the
// same size, hovering over a soft floor shadow with a slow sway
// (no tremble). The SCNView takes no touches: horizontal
// drags belong to the pager and taps arrive as `pulseToken` bumps.
// In the aura forge the sway becomes a 360° turntable and an X-ray
// scan materializes the companion head to toe (XRayScan, below).
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

    /// The locker's sliding window: parsed models outside it are dropped.
    /// Loads still in flight are left alone.
    static func keep(only names: Set<String>) { assets = assets.filter { names.contains($0.key) } }

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
    /// Set on the aura forge: the companion spins 360° and an X-ray scan
    /// sweeps it head to toe. Read once, when the model is built.
    var forge: ForgeScan? = nil
    /// Locked companion: the silver figurine (see MascotStatue).
    var statue = false
    var onReady: ((_ loaded: Bool) -> Void)? = nil

    struct ForgeScan {
        let tint: UIColor
        /// 1, 2, 3 at each quarter of the first sweep; 4 once the companion
        /// is fully materialized (also sent right away if there is nothing
        /// to scan). Main thread.
        let onProgress: (Int) -> Void
    }

    // Seeded with the current tap count: a stage rebuilt later (the locker's
    // sliding window) must not replay a tap from before it existed.
    func makeCoordinator() -> Coordinator { Coordinator(pulseToken: pulseToken) }

#if DEBUG
    /// SCNViews alive right now — the locker's UI test caps it at 3.
    static var liveViews = 0
#endif

    func makeUIView(context: Context) -> SCNView {
#if DEBUG
        Self.liveViews += 1
#endif
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
#if DEBUG
        liveViews -= 1
#endif
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

        init(pulseToken: Int) {
            lastPulseToken = pulseToken
            super.init()
        }
        private var pulseAt: Double = -10

        private var statue = false
        private var statueApplied = false
        private var model: SCNNode?    // the imported model, for the silver pass

        private var pivot: SCNNode?   // hover, sway
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

        // Aura forge. The scan lives on the render clock so the sweep, the
        // ring and the spin stay in lockstep.
        private var forge: ForgeScan?
        private var scan: XRayScan?
        private var spin: Double = 0
        private var milestone = 0

        func apply(_ owner: FloatingMascotView, to view: SCNView) {
            active = owner.active
            speaking = owner.speaking
            level = Double(owner.voiceLevel)
            reduceMotion = UIAccessibility.isReduceMotionEnabled
            forge = owner.forge
            statue = owner.statue
            if let model, statue != statueApplied {
                statueApplied = statue
                MascotStatue.apply(statue, to: model)
            }
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
                // No model, nothing to scan: the forge must never wait on it.
                if asset == nil { self.report(4) }
            }
        }

        /// Milestones go out once each, in order. `forge` is only touched on
        /// main — it holds a closure, and apply() replaces it on every update.
        private func report(_ step: Int) {
            guard step > milestone else { return }
            milestone = step
            DispatchQueue.main.async { [weak self] in self?.forge?.onProgress(step) }
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
            // A turntable shows every side, so frame the widest one.
            if forge != nil { modelWidth = max(modelWidth, hi.z - lo.z) }
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

            self.model = offset
            statueApplied = statue
            if statue { MascotStatue.apply(true, to: offset) }
            self.pivot = pivot
            self.body = body
            self.shadow = shadow
            self.cameraNode = cameraNode
            clock = 0
            lastTime = nil
            spin = 0
            scan = nil
            if let forge {
                scan = XRayScan(model: offset, in: scene.rootNode, height: height,
                                footprint: modelWidth, tint: forge.tint)
                if reduceMotion {
                    scan?.revealNow()
                    report(4)
                }
            }
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
                // Every frame, not just once: Reduce Motion can switch on in
                // the middle of an idle slice, which must not freeze on screen.
                if let scan {
                    if !scan.revealed { report(4) }
                    scan.revealNow()
                }
                pivot.position = SCNVector3Zero
                pivot.eulerAngles = SCNVector3Zero
                body.scale = SCNVector3(Float(scale), Float(scale), Float(scale))
                body.eulerAngles.x = 0
                return
            }

            let hover = sin(t * 2 * .pi / 2.8)          // −1…1, the float
            let lift = Float((hover + 1) / 2)            // 0 on the floor, 1 at the top
            if let scan {
                // Turntable: exactly one turn during the scan, so the companion
                // faces you the moment it materializes, then a slow idle spin.
                let settle = XRayScan.ease((t - XRayScan.revealAt) / 1.6)
                spin += dt * 2 * .pi / (XRayScan.revealAt + settle * (9 - XRayScan.revealAt))
                pivot.position = SCNVector3(0, Float(hover) * h * 0.03, 0)
                pivot.eulerAngles = SCNVector3(0, Float(spin), 0)
                if let step = scan.update(clock: t, lift: pivot.position.y) { report(step) }
            } else {
                // Float only: a slow hover and a slow sway. The fast tremble
                // read as the model vibrating, so it is gone.
                pivot.position = SCNVector3(0, Float(hover) * h * 0.035, 0)
                pivot.eulerAngles = SCNVector3(0, Float(sin(t * 2 * .pi / 7.0) * 0.30), 0)
            }
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

/// The aura forge's X-ray. A horizontal scan plane sweeps the companion head
/// to toe: the first pass materializes it out of an X-ray hologram, later
/// passes run a thin X-ray slice through it while it keeps turning. One
/// fragment modifier on every material, plus a glowing ring at the same height.
/// Created on main; updated on the render thread only.
final class XRayScan {
    static let startAt = 0.45        // lets the model fade in first
    static let sweep = 2.8           // the materializing pass
    static var revealAt: Double { startAt + sweep }
    static let loopEvery = 4.8       // then a quick slice, now and then
    static let loopSweep = 1.6

    private(set) var revealed = false
    private let materials: [SCNMaterial]
    private let ring: SCNNode
    private let height: Float

    init(model: SCNNode, in root: SCNNode, height: Float, footprint: Float, tint: UIColor) {
        self.height = height
        var found: [SCNMaterial] = []
        var seen = Set<ObjectIdentifier>()
        model.enumerateHierarchy { node, _ in
            for material in node.geometry?.materials ?? [] where seen.insert(ObjectIdentifier(material)).inserted {
                found.append(material)
            }
        }
        materials = found

        // Shading is linear; the tint arrives as sRGB.
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        tint.getRed(&r, green: &g, blue: &b, alpha: &a)
        let linear = SCNVector3(Float(pow(max(r, 0), 2.2)), Float(pow(max(g, 0), 2.2)), Float(pow(max(b, 0), 2.2)))
        for material in materials {
            var modifiers = material.shaderModifiers ?? [:]
            // GLTFKit2 may already put an alpha-cutoff discard here; keep it first.
            let existing = modifiers[.fragment] ?? ""
            modifiers[.fragment] = Self.header + existing + Self.body
            material.shaderModifiers = modifiers
            material.setValue(NSValue(scnVector3: linear), forKey: "u_tint")
            material.setValue(height, forKey: "u_height")
        }

        // Capped by height too: a long, deep model (KORA's tail) would push the
        // ring's front rim out of the top of the frame at the start of a sweep.
        let radius = CGFloat(min(footprint * 0.56, height * 0.42))
        let plane = SCNPlane(width: radius * 2, height: radius * 2)
        let disc = plane.firstMaterial ?? SCNMaterial()
        disc.diffuse.contents = Self.ringImage(tint)
        disc.lightingModel = .constant
        disc.blendMode = .add
        disc.writesToDepthBuffer = false
        disc.isDoubleSided = true
        plane.firstMaterial = disc
        ring = SCNNode(geometry: plane)
        ring.eulerAngles.x = -.pi / 2
        ring.renderingOrder = 10
        ring.opacity = 0
        root.addChildNode(ring)

        // Before the first frame: all X-ray, nothing scanned yet.
        set(scanY: height, band: 0, below: 1, glow: 0)
    }

    /// Advances the scan. Returns the first-pass milestone (1…4), if any.
    func update(clock t: Double, lift: Float) -> Int? {
        let top = height * 0.52 + lift
        let bottom = -height * 0.54 + lift
        if !revealed {
            let q = (t - Self.startAt) / Self.sweep
            // Half linear, half eased: a scanner, not a bounce.
            let p = Float(0.5 * min(max(q, 0), 1) + 0.5 * Self.ease(q))
            let y = top + (bottom - top) * p
            let fade = Float(min(1, max(0, q * 8)) * min(1, max(0, (1 - q) * 8)))
            set(scanY: y, band: 0, below: 1, glow: fade)
            place(ring: y, opacity: fade)
            if q >= 1 {
                revealed = true
                set(scanY: bottom, band: 0, below: 0, glow: 0)
                place(ring: bottom, opacity: 0)
                return 4
            }
            return q >= 0.25 ? min(3, Int(q * 4)) : nil
        }
        // Idle: rest right after the reveal, then a slice every few seconds.
        let phase = (t - Self.revealAt).truncatingRemainder(dividingBy: Self.loopEvery) - (Self.loopEvery - Self.loopSweep)
        guard phase >= 0 else {
            set(scanY: bottom, band: 0, below: 0, glow: 0)
            place(ring: bottom, opacity: 0)
            return nil
        }
        let q = phase / Self.loopSweep
        let envelope = Float(sin(.pi * q))
        let y = top + (bottom - top) * Float(Self.ease(q))
        set(scanY: y, band: height * 0.05 * envelope, below: 0, glow: envelope)
        place(ring: y, opacity: envelope * 0.85)
        return nil
    }

    /// Straight to the finished companion (Reduce Motion, or nothing to wait for).
    func revealNow() {
        revealed = true
        set(scanY: -height, band: 0, below: 0, glow: 0)
        ring.opacity = 0
    }

    static func ease(_ x: Double) -> Double {
        let c = min(max(x, 0), 1)
        return c * c * (3 - 2 * c)
    }

    private func set(scanY: Float, band: Float, below: Float, glow: Float) {
        for material in materials {
            material.setValue(scanY, forKey: "u_scanY")
            material.setValue(band, forKey: "u_band")
            material.setValue(below, forKey: "u_below")
            material.setValue(glow, forKey: "u_glow")
        }
    }

    private func place(ring y: Float, opacity: Float) {
        ring.position = SCNVector3(0, y, 0)
        ring.opacity = CGFloat(opacity)
    }

    // Metal. `_surface` is readable here and its geometry is in view space,
    // so the fragment goes back to world space to meet the horizontal plane.
    private static let header = """
    #pragma arguments
    float u_scanY;
    float u_band;
    float u_below;
    float u_glow;
    float u_height;
    float3 u_tint;
    #pragma body

    """

    private static let body = """

    {
        float3 xrWorld = (scn_frame.inverseViewTransform * float4(_surface.position, 1.0)).xyz;
        float xrD = xrWorld.y - u_scanY;
        float xrSoft = u_height * 0.004;
        float xrFacing = saturate(dot(normalize(_surface.normal), normalize(_surface.view)));
        float xrRim = pow(1.0 - xrFacing, 2.0);
        float xrLines = smoothstep(0.72, 1.0, 0.5 + 0.5 * sin(xrWorld.y / u_height * 260.0 + scn_frame.time * 5.0));
        float3 xrColor = u_tint * (0.025 + 1.6 * pow(xrRim, 1.4) + 0.16 * xrLines) + float3(0.9) * pow(xrRim, 6.0);
        float xrUnscanned = u_below * (1.0 - smoothstep(-xrSoft, xrSoft, xrD));
        float xrSlice = step(0.00001, u_band) * (1.0 - smoothstep(u_band, u_band + xrSoft * 3.0, abs(xrD)));
        float xrMask = max(xrUnscanned, xrSlice);
        _output.color.rgb = mix(_output.color.rgb, xrColor * _output.color.a, xrMask);
        float xrLine = exp(-abs(xrD) / (u_height * 0.008)) * u_glow;
        _output.color.rgb += (u_tint * 1.8 + float3(0.35)) * xrLine * _output.color.a;
    }
    """

    /// The scan plane seen edge-on: a faint tinted disc with a hot rim.
    private static func ringImage(_ tint: UIColor) -> UIImage {
        let side: CGFloat = 256
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { ctx in
            let colors = [
                tint.withAlphaComponent(0.0).cgColor,
                tint.withAlphaComponent(0.10).cgColor,
                tint.withAlphaComponent(0.28).cgColor,
                UIColor.white.withAlphaComponent(0.95).cgColor,
                tint.withAlphaComponent(0.55).cgColor,
                tint.withAlphaComponent(0.0).cgColor,
            ] as CFArray
            let stops: [CGFloat] = [0, 0.45, 0.84, 0.95, 0.975, 1]
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: stops) else { return }
            let c = CGPoint(x: side / 2, y: side / 2)
            ctx.cgContext.drawRadialGradient(gradient, startCenter: c, startRadius: 0, endCenter: c, endRadius: side / 2, options: [])
        }
    }
}
