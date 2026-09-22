import AVFoundation
import CoreImage
import SwiftUI
import UIKit

enum LandOrientation: String, Codable { case neSW = "ne_sw", nwSE = "nw_se" }
enum LandConnector: String, Codable, Hashable { case NE, SE, SW, NW }

struct LandFootprint: Codable { let cols: Int; let rows: Int }
func landFootprint(_ item: LandItem, _ orientation: LandOrientation?) -> LandFootprint {
    orientation == .nwSE ? LandFootprint(cols: item.footprint.rows, rows: item.footprint.cols) : item.footprint
}
func landCells(_ item: LandItem, _ placement: LandPlacement) -> Set<String> {
    let size = landFootprint(item, placement.orientation)
    return Set((0..<size.cols).flatMap { x in (0..<size.rows).map { y in "\(placement.col + x):\(placement.row + y)" } })
}
private func landName(_ item: LandItem) -> String { TraderLandCatalog.name(item.id, district: item.district) }
private func districtName(_ id: String) -> String { TraderLandCatalog.districtName(id) }
/// Server direction values ("long"/"short") in the reader's language; English keeps the raw value.
private func landDirection(_ raw: String) -> String {
    L.t(raw, raw == "long" ? "alcista" : raw == "short" ? "bajista" : raw)
}
enum LandImageCache {
    static let images = NSCache<NSString, UIImage>()
    static let context = CIContext(options: nil)
    static func image(_ path: String) -> UIImage? {
        if let cached = images.object(forKey: path as NSString) { return cached }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path), let image = UIImage(contentsOfFile: url.path) else { return nil }
        images.setObject(image, forKey: path as NSString); return image
    }
    private static func glowKey(_ path: String, half: Bool) -> NSString { "\(path)-glow-\(half)" as NSString }
    /// A glow pass that is already built. Never builds one, so it is safe inside a Canvas.
    static func cachedGlow(_ path: String, half: Bool = false) -> UIImage? { images.object(forKey: glowKey(path, half: half)) }
    private static var warming: Task<Void, Never>?
    /// Decodes the albedos and builds the half-size glows off the main thread (about 30 ms per glow),
    /// so the archipelago Canvas only reads from the cache. Runs queue behind each other, so none repeats work.
    @MainActor static func warm(albedos: [String], glows: [String]) async {
        let previous = warming
        let task = Task.detached(priority: .userInitiated) {
            await previous?.value
            for path in albedos where images.object(forKey: path as NSString) == nil {
                guard let url = Bundle.main.resourceURL?.appendingPathComponent(path), let raw = UIImage(contentsOfFile: url.path) else { continue }
                images.setObject(raw.preparingForDisplay() ?? raw, forKey: path as NSString)
            }
            for path in glows { _ = glow(path, half: true) }
        }
        warming = task
        await task.value
    }
    /// The glow pass with luminance as alpha, for screen blending. `half` downsamples it for the archipelago.
    static func glow(_ path: String, half: Bool = false) -> UIImage? {
        let key = glowKey(path, half: half)
        if let cached = images.object(forKey: key) { return cached }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path), var input = CIImage(contentsOf: url),
              let filter = CIFilter(name: "CIColorMatrix") else { return nil }
        if half { input = input.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: 0.5, kCIInputAspectRatioKey: 1]) }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(CIVector(x: 1, y: 0, z: 0, w: 0), forKey: "inputRVector")
        filter.setValue(CIVector(x: 0, y: 1, z: 0, w: 0), forKey: "inputGVector")
        filter.setValue(CIVector(x: 0, y: 0, z: 1, w: 0), forKey: "inputBVector")
        filter.setValue(CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0), forKey: "inputAVector")
        guard let output = filter.outputImage, let cgImage = context.createCGImage(output, from: output.extent) else { return nil }
        let image = UIImage(cgImage: cgImage)
        images.setObject(image, forKey: key)
        return image
    }
}
struct LandArtVariant: Codable { let url: String; let w: Int; let h: Int; let method: String? }
struct LandArtState: Codable {
    let contentBounds: [CGFloat]
    let anchor: [CGFloat]
    let variants: [String: LandArtVariant]
    let derivedSeed: LandArtVariant?
    enum CodingKeys: String, CodingKey { case contentBounds, anchor, variants; case derivedSeed = "derived_seed" }
}
struct LandArtOrientation: Codable { let states: [String: LandArtState] }
struct LandCoreLayers: Codable {
    let layers: [String: LandArtVariant]
    let sphereCentre: [CGFloat]
    let sphereRadius: CGFloat
    enum CodingKeys: String, CodingKey { case layers, sphereRadius = "sphere_radius", sphereCentre = "sphere_centre" }
}
struct LandItem: Codable, Identifiable {
    let id: String
    let district: String
    let kind: String
    let footprint: LandFootprint
    let orientations: [String: LandArtOrientation]
    let animationLayers: LandCoreLayers?

    enum CodingKeys: String, CodingKey {
        case id, district, kind, footprint, orientations
        case animationLayers = "animation_layers"
    }

    var artState: LandArtState? {
        guard let orientation = orientations.values.first else { return nil }
        return orientation.states["stage1"] ?? orientation.states["bloom"] ?? orientation.states.values.first
    }

    /// A named art state ("stage0" of the Aura Core), or the default one when the item has no such state.
    func artState(_ key: String) -> LandArtState? {
        orientations.values.first?.states[key] ?? artState
    }
}
struct LandManifest: Codable { let items: [LandItem] }

struct LandPlacement: Codable, Identifiable, Equatable {
    let uid: String
    let itemId: String
    let col: Int
    let row: Int
    let orientation: LandOrientation?
    var id: String { uid }
}
struct LandCorePlacement: Codable { let itemId: String; let col: Int; let row: Int }
struct LandWorldFixture: Codable {
    let version: Int
    let gridSize: Int
    let focusLevel: Int
    let core: LandCorePlacement
    let placements: [LandPlacement]
    let expectedPathConnectors: [String: [LandConnector]]
}
private struct SavedWorld: Codable { let placements: [LandPlacement]; let focusLevel: Int }

enum RuntimeBundle {
    static let manifest: LandManifest = decode(path: "gate-A/asset-manifest.json")
    static let fixture: LandWorldFixture = decode(path: "world-snapshot-v01.json")
    static let items: [String: LandItem] = Dictionary(uniqueKeysWithValues: manifest.items.map { ($0.id, $0) })

    private static func decode<T: Decodable>(path: String) -> T {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path),
              let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(T.self, from: data) else {
            fatalError("Trader Land runtime resource missing or invalid: \(path)")
        }
        return value
    }

    static func bundlePath(_ manifestURL: String) -> String {
        manifestURL.replacingOccurrences(of: "/land/v1/", with: "")
    }
}

@MainActor private final class LandSound: ObservableObject {
    @Published private(set) var enabled = false
    private var loop: AVAudioPlayer?
    private var cues: [AVAudioPlayer] = []

    func toggle() {
        enabled.toggle()
        if enabled {
            play("land_enter_vrum", volume: 0.5)
            guard let url = Bundle.main.resourceURL?.appendingPathComponent("audio/aura_core_loop.m4a"), let player = try? AVAudioPlayer(contentsOf: url) else { return }
            player.numberOfLoops = -1; player.volume = 0.16; player.prepareToPlay(); player.play(); loop = player
        } else {
            loop?.stop(); loop = nil; cues.forEach { $0.stop() }; cues.removeAll()
        }
    }

    func stop() { loop?.stop(); loop = nil; cues.forEach { $0.stop() }; cues.removeAll(); enabled = false }

    func play(_ name: String, volume: Float = 0.48) {
        guard enabled, let url = Bundle.main.resourceURL?.appendingPathComponent("audio/\(name).m4a"), let player = try? AVAudioPlayer(contentsOf: url) else { return }
        cues.removeAll { !$0.isPlaying }; player.volume = volume; player.prepareToPlay(); player.play(); cues.append(player)
    }
}

private struct LandDiamond: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
        path.closeSubpath()
        return path
    }
}

private struct GateBundleImage: View {
    let path: String
    var body: some View {
        Group {
            if let image = LandImageCache.image(path) {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 8).fill(Theme.card).overlay(Text(L.t("Missing", "Sin imagen")).font(.caption2).foregroundStyle(Theme.muted))
            }
        }
    }
}

/// The art's light pass, screen-blended over the albedo.
private struct GlowBundleImage: View {
    let path: String
    var body: some View {
        if let image = LandImageCache.glow(path) {
            Image(uiImage: image).resizable().scaledToFit().blendMode(.screen)
        }
    }
}

private struct LayeredManifestImage: View {
    let item: LandItem
    let seed: Bool
    /// A named art state (the dormant core's "stage0"); nil draws the default one.
    var stateKey: String? = nil

    var body: some View {
        if let state = stateKey.map(item.artState) ?? item.artState,
           let bloom = state.variants["albedo_512"] ?? state.variants["albedo_1024"] {
            let albedo = seed ? (state.derivedSeed ?? bloom) : bloom
            ZStack {
                GateBundleImage(path: RuntimeBundle.bundlePath(albedo.url))
                if !seed, let glow = state.variants["glow_1024"] {
                    GlowBundleImage(path: RuntimeBundle.bundlePath(glow.url))
                }
            }
        }
    }
}

private struct AnimatedAuraCore: View {
    let item: LandItem
    let seed: Bool
    let pulse: Int
    /// 0 dormant: the stage0 art (albedo + glow), static. 1 awake: the stage1 layers, animated.
    let stage: Int
    /// Side of the art frame; the layers and particles are laid out in its units.
    let size: CGFloat
    /// 8/N of the island: the motes' diameters and glow shrink with a grown island's tiles.
    let decoration: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floating = false
    @State private var orbiting = false

    var body: some View {
        if stage == 0 {
            // The animation layers are cut from the stage1 albedo, so a dormant core never uses them.
            LayeredManifestImage(item: item, seed: seed, stateKey: "stage0")
        } else if seed || item.animationLayers == nil {
            LayeredManifestImage(item: item, seed: seed, stateKey: "stage1")
        } else if let animation = item.animationLayers, let state = item.artState("stage1") {
            let unit = size / 360
            ZStack {
                layer("body", animation)
                layer("ring_back", animation).scaleEffect(x: floating ? 1.014 : 0.986, y: floating ? 0.99 : 1.01, anchor: .init(x: 0.5, y: 0.3223)).opacity(floating ? 1 : 0.78)
                layer("sphere", animation).offset(y: reduceMotion ? 0 : (floating ? 7 : -7) * unit).shadow(color: LandPainter.artMint.opacity(0.55), radius: 8 * unit)
                layer("ring_front", animation).scaleEffect(x: floating ? 0.99 : 1.01, y: floating ? 1.012 : 0.99, anchor: .init(x: 0.5, y: 0.3223))
                if let glow = state.variants["glow_1024"] { GlowBundleImage(path: RuntimeBundle.bundlePath(glow.url)) }
                ForEach(0..<AuraCoreMotes.count, id: \.self) { index in
                    let diameter = AuraCoreMotes.diameter(index, unit: decoration)
                    Circle().fill(LandPainter.artMint.opacity(index.isMultiple(of: 3) ? 0.95 : 0.62))
                        .frame(width: diameter, height: diameter)
                        .shadow(color: LandPainter.artMint, radius: AuraCoreMotes.glowRadius(unit: decoration))
                        .offset(x: CGFloat(42 + index * 4) * unit)
                        .rotationEffect(.degrees((orbiting ? 360 : 0) + Double(index * 51)), anchor: .center)
                        .position(x: 0.498 * size, y: 0.3223 * size)
                }
            }
            .frame(width: size, height: size)
            .id(pulse)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) { floating = true }
                withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) { orbiting = true }
            }
        }
    }

    @ViewBuilder private func layer(_ name: String, _ animation: LandCoreLayers) -> some View {
        if let variant = animation.layers[name] { GateBundleImage(path: RuntimeBundle.bundlePath(variant.url)) }
    }
}

private struct ProceduralFilament: View {
    let connectors: Set<LandConnector>
    let dimmed: Bool
    let unit: CGFloat

    var body: some View {
        Canvas { context, size in
            LandPainter.filament(context, face: CGRect(origin: .zero, size: size), connectors: connectors, dimmed: dimmed, unit: unit)
        }
    }
}

/// Your island: one ground Canvas (slab, grid, fog, shadows, footprints) under the art.
/// Everything is laid out on the island's own N×N tiles (`layout`); the slab never changes size.
private struct GateCanvas: View {
    let layout: GateLayout
    /// nil while an account island's first world loads (or failed to): no core is drawn or reserved.
    let core: LandCore?
    let placements: [LandPlacement]
    /// Fog radius in rings around the grid centre; nil reveals the whole island.
    let revealRadius: CGFloat?
    let seed: Bool
    let corePulse: Int
    let draft: LandPlacement?
    let draftValid: Bool
    let selectedID: String?
    let place: (Int, Int) -> Void

    private var items: [String: LandItem] { RuntimeBundle.items }
    private func revealed(_ col: Int, _ row: Int) -> Bool { layout.revealed(col: col, row: row, radius: revealRadius) }
    private var pathCells: Set<String> {
        Set(placements.filter { items[$0.itemId]?.kind == "path_pavement" }.map { "\($0.col):\($0.row)" })
    }
    private var corePlacement: LandPlacement? {
        core.map { LandPlacement(uid: LandCore.uid, itemId: LandCore.itemID, col: $0.col, row: $0.row, orientation: nil) }
    }
    private var coreStage: Int { core?.stage ?? 1 }
    /// The core is the draft being moved: drawn lifted at the draft, not where it stands.
    private var coreLifted: Bool { draft?.uid == LandCore.uid }
    private func geometry(_ placement: LandPlacement) -> LandSpriteGeometry? {
        items[placement.itemId].flatMap {
            LandSpriteGeometry(item: $0, col: placement.col, row: placement.row, orientation: placement.orientation, layout: layout, coreStage: coreStage)
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            ground
            ForEach(0..<(layout.size * layout.size), id: \.self) { index in
                let col = index % layout.size, row = index / layout.size
                // Invisible targets: the map's gesture surface does the real hit mapping (cellAt);
                // these keep each tile addressable for VoiceOver and UI tests.
                Button { place(col, row) } label: { LandDiamond().fill(Color.white.opacity(0.001)) }
                    .buttonStyle(.plain).frame(width: layout.tileWidth, height: layout.tileHeight)
                    .position(layout.iso(column: CGFloat(col), row: CGFloat(row)))
                    .accessibilityLabel(L.t("Tile \(col + 1), \(row + 1)", "Casilla \(col + 1), \(row + 1)"))
                    .accessibilityIdentifier("land-tile-\(col)-\(row)")
            }
            ForEach(placements.filter { $0.uid != draft?.uid }) { placement in
                if let item = items[placement.itemId] { sprite(item: item, placement: placement) }
            }
            if !coreLifted, let corePlacement, let item = items[LandCore.itemID] { sprite(item: item, placement: corePlacement) }
            if let draft, let item = items[draft.itemId] { sprite(item: item, placement: draft, lifted: true) }
        }
        .frame(width: GateLayout.canvas.width, height: GateLayout.canvas.height)
    }

    /// Slab, fog, grid and contact shadows in one pass, always below every piece.
    private var ground: some View {
        let standing = placements.filter { $0.uid != draft?.uid }
        let fixed = standing + (coreLifted ? [] : [corePlacement].compactMap { $0 })
        var occupied = Set<String>()
        for placement in fixed { if let item = items[placement.itemId] { occupied.formUnion(landCells(item, placement)) } }
        let cells = (0..<(layout.size * layout.size)).map { ($0 % layout.size, $0 / layout.size) }
        let fog = cells.filter { !revealed($0.0, $0.1) }
        let open = cells.filter { revealed($0.0, $0.1) && !occupied.contains("\($0.0):\($0.1)") }
        let shadows = fixed.compactMap { geometry($0)?.footprint }
        let selected = fixed.first { $0.uid == selectedID }.flatMap(geometry)?.footprint
        let draftArea = draft.flatMap(geometry)?.footprint
        let placing = draft != nil
        let valid = draftValid
        let unit = layout.unit
        return Canvas { ctx, _ in
            ctx.fill(Path(ellipseIn: CGRect(x: 430 - 470, y: 391 - 330, width: 940, height: 660)),
                     with: .radialGradient(Gradient(colors: [Theme.accent.opacity(0.06), .clear]), center: LandPainter.islandCenter, startRadius: 0, endRadius: 470))
            LandPainter.slab(ctx)
            ctx.fill(LandPainter.cells(layout, fog), with: .color(Theme.bg.opacity(0.9)))
            ctx.stroke(LandPainter.cells(layout, open), with: .color(.white.opacity(placing ? 0.10 : 0.04)), lineWidth: (placing ? 1 : 0.8) * unit)
            LandPainter.rim(ctx, color: Theme.accentSoft.opacity(0.22))
            LandPainter.shadows(ctx, shadows, unit: unit)
            if let selected {
                ctx.stroke(selected, with: .color(Theme.cio.opacity(0.9)), lineWidth: 2 * unit)
            }
            if let draftArea {
                let tone = valid ? Theme.text : Theme.down
                ctx.fill(draftArea, with: .color(tone.opacity(valid ? 0.08 : 0.2)))
                ctx.stroke(draftArea, with: .color(tone.opacity(valid ? 0.85 : 0.95)), lineWidth: 1.5 * unit)
                if !valid {
                    let box = draftArea.boundingRect
                    let w = 9 * unit, h = 5 * unit
                    var cross = Path()
                    cross.move(to: CGPoint(x: box.midX - w, y: box.midY - h)); cross.addLine(to: CGPoint(x: box.midX + w, y: box.midY + h))
                    cross.move(to: CGPoint(x: box.midX + w, y: box.midY - h)); cross.addLine(to: CGPoint(x: box.midX - w, y: box.midY + h))
                    ctx.stroke(cross, with: .color(Theme.down), style: StrokeStyle(lineWidth: 2 * unit, lineCap: .round))
                }
            }
        }
        .frame(width: GateLayout.canvas.width, height: GateLayout.canvas.height)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    @ViewBuilder private func sprite(item: LandItem, placement: LandPlacement, lifted: Bool = false) -> some View {
        if let g = geometry(placement) {
            let lift: CGFloat = lifted ? 6 * layout.unit : 0
            Group {
                if item.kind == "core" { AnimatedAuraCore(item: item, seed: seed, pulse: corePulse, stage: coreStage, size: g.frame.width, decoration: layout.unit) }
                else { LayeredManifestImage(item: item, seed: seed).scaleEffect(x: g.flip ? -1 : 1, y: 1) }
            }
                .frame(width: g.frame.width, height: g.frame.height)
                .shadow(color: selectedID == placement.uid ? Theme.cio.opacity(0.45) : lifted ? .black.opacity(0.35) : .clear, radius: (lifted ? 10 : 6) * layout.unit, y: (lifted ? 6 : 0) * layout.unit)
                .position(x: g.frame.midX, y: g.frame.midY - lift)
                .zIndex(lifted ? 900 : 100 + g.depth).allowsHitTesting(false).accessibilityHidden(true)
            if let face = g.topFace {
                let active = LandPainter.connectors(col: placement.col, row: placement.row, orientation: placement.orientation, pathCells: pathCells)
                ProceduralFilament(connectors: active, dimmed: seed, unit: layout.unit)
                    .frame(width: face.width, height: face.height)
                    .position(x: face.midX, y: face.midY - lift).zIndex(lifted ? 901 : 101 + g.depth).allowsHitTesting(false)
                    .accessibilityIdentifier("path-\(placement.uid)-connectors-\(active.map(\.rawValue).sorted().joined(separator: "-"))")
            }
        }
    }
}

private struct LandGestureSurface: UIViewRepresentable {
    var tapped: (CGPoint) -> Void
    var dragged: (CGPoint, CGSize, UIGestureRecognizer.State) -> Void
    var magnified: (CGFloat, CGPoint, UIGestureRecognizer.State) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> UIView {
        let view = UIView(); view.backgroundColor = .clear; view.isMultipleTouchEnabled = true
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tap(_:)))
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pan(_:)))
        let pinch = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.pinch(_:)))
        pan.maximumNumberOfTouches = 1; pan.delegate = context.coordinator; pinch.delegate = context.coordinator
        tap.require(toFail: pan); tap.require(toFail: pinch)
        view.addGestureRecognizer(tap); view.addGestureRecognizer(pan); view.addGestureRecognizer(pinch)
        return view
    }
    func updateUIView(_ view: UIView, context: Context) { context.coordinator.parent = self }
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var parent: LandGestureSurface
        init(_ parent: LandGestureSurface) { self.parent = parent }
        @objc func tap(_ recognizer: UITapGestureRecognizer) { parent.tapped(recognizer.location(in: recognizer.view)) }
        @objc func pan(_ recognizer: UIPanGestureRecognizer) {
            let translation = recognizer.translation(in: recognizer.view), location = recognizer.location(in: recognizer.view)
            parent.dragged(CGPoint(x: location.x - translation.x, y: location.y - translation.y), CGSize(width: translation.x, height: translation.y), recognizer.state)
        }
        @objc func pinch(_ recognizer: UIPinchGestureRecognizer) { parent.magnified(recognizer.scale, recognizer.location(in: recognizer.view), recognizer.state) }
        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { false }
    }
}

struct TraderLandGateHarnessView: View {
    private static let storageKey = "bobby.trader-land.runtime-v03"
    /// Below this zoom the map is the archipelago, not your island.
    private static let archipelagoZoom: CGFloat = 0.6
    /// At or below this zoom the neighbours are drawn (the in-between band shows them at the edges).
    private static let seaZoom: CGFloat = 0.75
    private static let visitZoom: CGFloat = 0.9
    private static let minZoom: CGFloat = 0.22
    /// The practice island's core, from the bundled snapshot (3,3, awake).
    private static let practiceCore = LandCore(col: RuntimeBundle.fixture.core.col, row: RuntimeBundle.fixture.core.row, stage: 1)
    /// Archipelago framing centres islands in the space above the bottom card.
    private static let archipelagoLift: CGFloat = 115
    private let manifest = RuntimeBundle.manifest
    private let fixture = RuntimeBundle.fixture
    private let districts = TraderLandCatalog.districts
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var placements: [LandPlacement]
    @State private var focusLevel: Int
    /// The account island's size and core, from the last world (the practice island stays 8×8, core 3,3).
    /// An account island has no core until its first world arrives (`LandCore.standing`).
    @State private var landSize = 8
    @State private var core: LandCore?
    /// The seed row the desk asked to show (`TraderLandFocus.seed`).
    @State private var highlightedSeed: String?
    /// An extend option picked in a review row, waiting for its confirmation.
    @State private var extendChoice: ExtendChoice?
    @State private var selectedItemId: String?
    @State private var selectedPlacementId: String?
    @State private var draft: LandPlacement?
    @State private var history: [SavedWorld] = []
    @State private var notice = ""
    @State private var district = "crypto_bay"
    @State private var collectionOpen = true
    @State private var help = false
    @State private var zoom: CGFloat = 1
    @State private var pan: CGSize = .zero
    @State private var panOrigin: CGSize = .zero
    @State private var dragPiece = false
    @State private var dragOrigin: LandPlacement?
    @State private var handleOrigin: LandPlacement?
    @GestureState private var handleDragging = false
    @State private var pinchZoom: CGFloat = 1
    @State private var pinchAnchor = CGPoint.zero
    @StateObject private var sound = LandSound()
    @StateObject private var sync = TraderLandSync()
    @StateObject private var neighbors = TraderLandNeighbors()
    @StateObject private var communitySafety = LandCommunitySafety()
    @State private var communityOpen = false
    @ObservedObject private var account = AccountSession.shared
    @State private var remoteUndo: TraderLandMutation?
    @State private var shareOpen = false
    @State private var shareTitle = ""
    /// Index into `scene.islands` of the neighbour the camera is visiting (read-only).
    @State private var visited: Int?
    @State private var mapSize: CGSize = .zero
    @State private var scene = ArchipelagoScene.empty
    @State private var fixtureIslands: [PublicIsland]?
    @State private var collectionBeforeArchipelago: Bool?
    @State private var publishHint = false
    @State private var focusHandled = false
    @State private var scrollTarget: String?
    /// Bumped when the neighbours' glow passes are warm, so the sea redraws with them.
    @State private var artVersion = 0
    /// 1 while visiting a neighbour: keeps the sea at full strength there, and fades it with the camera on the way home.
    @State private var seaFocus: CGFloat = 0

    private var previewOnly: Bool {
#if DEBUG
        ProcessInfo.processInfo.arguments.contains("-trader-land-gate") && !accountFixture
#else
        false
#endif
    }
    /// `-trader-land-account-fixture` (with `-trader-land-gate`): the account island from an in-memory world.
    private var accountFixture: Bool {
#if DEBUG
        TraderLandAccountFixture.enabled
#else
        false
#endif
    }
    private var accountIsland: Bool { accountFixture || (!previewOnly && account.isSignedIn) }
    /// The island's tile geometry: grown account islands pack N×N smaller tiles into the same slab.
    private var layout: GateLayout { accountIsland ? GateLayout(size: landSize) : .practice }
    /// Account islands are fully revealed; the practice island keeps its focus rings.
    private var revealRadius: CGFloat? { accountIsland ? nil : CGFloat(focusLevel) + 1.5 }
    private var maxZoom: CGFloat { layout.maxZoom }
    private var homeZoom: CGFloat { layout.homeZoom }
    /// The server can move the core (capabilities.moveCore); never on the practice island.
    private var canMoveCore: Bool { accountIsland && sync.world?.capabilities?.moveCore == true }
    private var canExtend: Bool { accountIsland && sync.world?.capabilities?.extend == true && !editsDisabled && draft == nil }
    private var editsDisabled: Bool { accountIsland && (sync.busy || sync.world == nil || sync.error != nil) }
    private var canUndo: Bool { accountIsland ? remoteUndo != nil && !editsDisabled : !history.isEmpty }
    /// The same archipelago is available in development and distributed builds.
    /// Visiting another island never grants edit access to it.
    private var archipelagoMode: Bool { zoom < Self.archipelagoZoom || visited != nil }
    private var seaVisible: Bool { zoom <= Self.seaZoom || visited != nil }
    private var ownCode: String? { accountIsland ? sync.world?.share?.code : nil }
    /// The name its builder gave the island in the share sheet (kept while private too), if any.
    private var islandName: String? {
        guard accountIsland, let title = sync.world?.share?.title?.trimmingCharacters(in: .whitespacesAndNewlines), !title.isEmpty else { return nil }
        return title
    }
    private var ownIslandLabel: String {
        islandName ?? (accountIsland ? L.t("Your island", "Tu isla") : L.t("Your practice island", "Tu isla de práctica"))
    }
    private var ownPublic: Bool { accountIsland && sync.world?.share?.public == true }
    private var publicNeighbors: [PublicIsland] {
        return TraderLandShowcase.neighbors(among: fixtureIslands ?? neighbors.islands, excluding: ownCode).filter(communitySafety.allows)
    }
    private var neighborsReady: Bool { fixtureIslands != nil || neighbors.loaded }
    private func availableInventory(_ itemID: String) -> TraderLandWorld.Inventory? {
        sync.world?.inventory.first { TraderLandCatalog.artID($0.item_id) == itemID && $0.state == "bloomed" && !$0.placed }
    }
    private func owned(_ itemID: String, where test: (TraderLandWorld.Inventory) -> Bool) -> Bool {
        sync.world?.inventory.contains { TraderLandCatalog.artID($0.item_id) == itemID && test($0) } == true
    }
    private enum PieceState { case footprint, ready, placed, seed, locked }
    private func pieceState(_ item: LandItem) -> PieceState {
        guard accountIsland else { return .footprint }
        if availableInventory(item.id) != nil { return .ready }
        if owned(item.id, where: { $0.placed }) { return .placed }
        if owned(item.id, where: { $0.state == "seed" }) { return .seed }
        return .locked
    }
    private func collectionState(_ item: LandItem) -> String {
        switch pieceState(item) {
        case .footprint: return "\(item.footprint.cols) × \(item.footprint.rows)"
        case .ready: return L.t("Ready to build", "Lista para construir")
        case .placed: return L.t("On your island", "En tu isla")
        case .seed: return L.t("Seed · growing", "Semilla · creciendo")
        case .locked: return L.t("Not earned yet", "Por desbloquear")
        }
    }

    /// Where the desk asked the island to open (a piece to build, or the reviews).
    private let focus: TraderLandFocus?

    init(focus: TraderLandFocus? = nil) {
        self.focus = focus
        let fixture = RuntimeBundle.fixture
        let saved = Self.load() ?? SavedWorld(placements: fixture.placements, focusLevel: fixture.focusLevel)
        var signedIn = AccountSession.shared.isSignedIn
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-trader-land-gate") { signedIn = TraderLandAccountFixture.enabled }
#endif
        _placements = State(initialValue: signedIn ? [] : saved.placements)
        _focusLevel = State(initialValue: signedIn ? 2 : saved.focusLevel)
        _core = State(initialValue: LandCore.standing(accountIsland: signedIn, world: nil))
    }

    private var items: [String: LandItem] { RuntimeBundle.items }
    private var selectedItem: LandItem? { selectedItemId.flatMap { items[$0] } }
    /// The core's standing placement: a 2×2 that moves like a piece but is never stored or rotated.
    private var corePlacement: LandPlacement? {
        core.map { LandPlacement(uid: LandCore.uid, itemId: LandCore.itemID, col: $0.col, row: $0.row, orientation: nil) }
    }
    /// Cells taken by everything except the draft (the core included unless it is the draft).
    private var occupied: Set<String> {
        var cells = draft?.uid == LandCore.uid ? Set<String>() : core?.cells ?? []
        for placement in placements where placement.uid != draft?.uid {
            if let item = items[placement.itemId] { cells.formUnion(landCells(item, placement)) }
        }
        return cells
    }
    private func revealed(_ col: Int, _ row: Int) -> Bool { layout.revealed(col: col, row: row, radius: revealRadius) }
    private var validDraft: Bool {
        guard let draft, let item = items[draft.itemId] else { return false }
        return landCells(item, draft).allSatisfy { key in
            let c = key.split(separator: ":").compactMap { Int($0) }
            return c.count == 2 && layout.contains(col: c[0], row: c[1]) && revealed(c[0], c[1]) && !occupied.contains(key)
        }
    }

    var body: some View {
        GeometryReader { root in
            VStack(spacing: 0) {
                header
                map.frame(maxWidth: .infinity, maxHeight: .infinity)
                collection(maxHeight: root.size.height * 0.39)
            }
            .background(Theme.bg.ignoresSafeArea()).foregroundStyle(Theme.text)
            .onChange(of: scenePhase) { _, phase in
                if phase != .active { sound.stop() }
                else if let due = nextReviewAt, due <= Date() { Task { await reloadIsland() } }
            }
            .task(id: nextReviewAt) {
                // The headline counts down to a review from the last snapshot; reload once it opens.
                guard let due = nextReviewAt else { return }
                let wait = due.timeIntervalSinceNow + 2
                if wait > 0 { try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000)) }
                guard !Task.isCancelled else { return }
                await reloadIsland()
            }
            .onDisappear { sound.stop() }
            .onChange(of: handleDragging) { _, active in if !active { handleOrigin = nil } }
            .task(id: previewOnly ? "practice" : accountFixture ? "account-fixture" : account.session?.userId ?? "guest") {
                sync.reset(); draft = nil; remoteUndo = nil; history = []; selectedItemId = nil; selectedPlacementId = nil; notice = ""
                focusHandled = false; highlightedSeed = nil; landSize = 8; core = LandCore.standing(accountIsland: accountIsland, world: nil)
                // Another island opens at its home: a grown island's zoom can exceed this one's max zoom.
                zoom = homeZoom; pan = .zero; setVisited(nil)
                if accountIsland {
                    placements = []; focusLevel = 2
#if DEBUG
                    if accountFixture { sync.useFixture(TraderLandAccountFixture()); return }
#endif
                    await sync.load()
                } else {
                    let saved = Self.load() ?? SavedWorld(placements: fixture.placements, focusLevel: fixture.focusLevel)
                    placements = saved.placements; focusLevel = saved.focusLevel
                }
            }
            .task { rebuildScene(); await loadNeighbors() }
            .onReceive(sync.$world) { world in
                guard accountIsland, let world else { return }
                placements = world.placements.compactMap { placement in
                    guard let inventory = world.inventory.first(where: { $0.id == placement.inventory_id }) else { return nil }
                    return LandPlacement(uid: placement.id, itemId: TraderLandCatalog.artID(inventory.item_id), col: placement.x, row: placement.y, orientation: placement.rotation == 90 || placement.rotation == 270 ? .nwSE : .neSW)
                }
                focusLevel = 2
                adoptLand(size: GateLayout(size: world.land.size).size, core: world.core)
                applyFocus(world)
            }
            .onChange(of: publicNeighbors) { _, _ in rebuildScene() }
            .onChange(of: neighborsReady) { _, _ in rebuildScene() }
            .onChange(of: archipelagoMode) { _, active in
                withAnimation(.easeInOut(duration: 0.25)) { archipelagoChrome(active) }
            }
            .sheet(isPresented: $communityOpen) {
                LandCommunitySheet(island: visited.flatMap { scene.islands.indices.contains($0) ? scene.islands[$0].info : nil }, safety: communitySafety)
            }
            .sheet(isPresented: $help) {
                helpSheet.presentationDetents([.fraction(0.72), .large]).presentationDragIndicator(.visible).presentationBackground(Theme.bg)
            }
            .sheet(isPresented: $shareOpen) {
                shareSheet.presentationDetents([.medium, .large]).presentationDragIndicator(.visible).presentationBackground(Theme.bg)
            }
            .alert(extendChoice.map { L.t("Give this seed \($0.horizon.label)?", "¿Darle \($0.horizon.label) a esta semilla?") } ?? "",
                   isPresented: Binding(get: { extendChoice != nil }, set: { if !$0 { extendChoice = nil } }), presenting: extendChoice) { choice in
                Button(L.t("Extend", "Extender")) { extend(choice) }
                Button(L.t("Cancel", "Cancelar"), role: .cancel) {}
            } message: { choice in
                Text(extendMessage(choice))
            }
        }
    }

    private var header: some View {
        HStack(spacing: 4) {
            icon("arrow.left", label: L.t("Back to desk", "Volver a la mesa")) { dismiss() }
            VStack(alignment: .leading, spacing: 3) {
                // A named island leads with its own name; Trader Land moves up to the eyebrow.
                Text(islandName == nil ? L.t("BOBBY WORLD", "MUNDO BOBBY") : "TRADER LAND").font(.system(size: 9, weight: .medium, design: .monospaced)).tracking(2).foregroundStyle(Theme.muted)
                Text(islandName ?? "Trader Land").font(.system(size: 22, weight: .semibold, design: .rounded)).tracking(-0.8)
                    .lineLimit(1).minimumScaleFactor(0.75).accessibilityIdentifier("land-title")
            }.padding(.leading, 4)
            Spacer(minLength: 0)
            icon(sound.enabled ? "speaker.wave.2" : "speaker.slash", label: L.t("Toggle sound", "Activar o silenciar sonido")) { sound.toggle() }
                .accessibilityIdentifier("land-sound-toggle")
            icon("circle.hexagongrid", label: L.t("Archipelago", "Archipiélago"), active: archipelagoMode) {
                archipelagoMode ? goHome() : openArchipelago()
            }.accessibilityIdentifier("land-archipelago")
            if accountIsland {
                icon(ownPublic ? "globe" : "square.and.arrow.up", label: L.t("Share your island", "Compartir tu isla")) { openShare() }
                    .accessibilityIdentifier("land-share")
            }
            icon("questionmark.circle", label: L.t("How to play", "Cómo jugar")) { help = true }.accessibilityIdentifier("land-help")
        }.padding(.horizontal, 8).padding(.vertical, 8)
            .background(Theme.bg).overlay(alignment: .bottom) { Rectangle().fill(Theme.stroke).frame(height: 1) }
    }

    private static func fit(_ size: CGSize) -> CGFloat { max(0.05, min(size.width / 830, size.height / 640)) }

    private var map: some View {
        GeometryReader { proxy in
            let fit = Self.fit(proxy.size)
            let scale = fit * zoom
            ZStack {
                Theme.bg
                // Always mounted, so camera flights interpolate the sea both ways; it draws nothing
                // above 75% zoom unless a neighbour is being visited.
                ArchipelagoLayer(scene: scene, zoom: zoom, pan: pan, visiting: seaFocus, fit: fit, visited: visited,
                                 ownLabel: ownIslandLabel,
                                 labels: zoom < Self.archipelagoZoom, artVersion: artVersion)
                GateCanvas(layout: layout, core: core, placements: placements, revealRadius: revealRadius, seed: false, corePulse: 0,
                           draft: draft, draftValid: validDraft, selectedID: selectedPlacementId, place: choose)
                    .scaleEffect(scale)
                    .position(x: proxy.size.width / 2 + pan.width, y: proxy.size.height / 2 + pan.height + (GateLayout.canvas.height / 2 - GateLayout.viewCenter.y) * scale)
                LandGestureSurface(
                    tapped: { point in tap(point, size: proxy.size, scale: scale) },
                    dragged: { start, translation, state in
                        if state == .began {
                            panOrigin = pan
                            dragOrigin = draft
                            let cell = cellAt(start, size: proxy.size, scale: scale)
                            if let draft, let item = items[draft.itemId] { dragPiece = landCells(item, draft).contains("\(cell.0):\(cell.1)") }
                            else { dragPiece = false }
                        }
                        if state == .changed || state == .ended {
                            if dragPiece, let current = draft, let origin = dragOrigin {
                                guard !editsDisabled else { return }
                                let cell = TraderLandGeometry.draggedPosition(col: origin.col, row: origin.row, translation: translation, scale: scale, size: layout.size)
                                draft = LandPlacement(uid: current.uid, itemId: current.itemId, col: cell.col, row: cell.row, orientation: current.orientation)
                            } else { pan = boundedPan(CGSize(width: panOrigin.width + translation.width, height: panOrigin.height + translation.height), size: proxy.size) }
                        }
                        if state == .ended || state == .cancelled { dragOrigin = nil; dragPiece = false }
                    },
                    magnified: { value, point, state in
                        if state == .began {
                            pinchZoom = zoom
                            pinchAnchor = CGPoint(x: (point.x - proxy.size.width / 2 - pan.width) / zoom, y: (point.y - proxy.size.height / 2 - pan.height) / zoom)
                        }
                        if state == .changed || state == .ended {
                            zoom = min(maxZoom, max(draft == nil ? Self.minZoom : 0.7, pinchZoom * value))
                            let raw = CGSize(width: point.x - proxy.size.width / 2 - pinchAnchor.x * zoom, height: point.y - proxy.size.height / 2 - pinchAnchor.y * zoom)
                            refocus(pan: raw, size: proxy.size)
                            pan = boundedPan(raw, size: proxy.size)
                        }
                    }
                ).accessibilityHidden(true)
                if let draft, let item = items[draft.itemId], !archipelagoMode {
                    let area = landFootprint(item, draft.orientation)
                    let bottom = layout.iso(column: CGFloat(draft.col + area.cols - 1), row: CGFloat(draft.row + area.rows - 1))
                    moveHandle(scale: scale)
                        .position(x: proxy.size.width / 2 + pan.width + (bottom.x - GateLayout.viewCenter.x) * scale,
                                  y: proxy.size.height / 2 + pan.height + (bottom.y + layout.tileHeight / 2 - GateLayout.viewCenter.y) * scale + 30)
                }
                VStack(spacing: 0) {
                    HStack(alignment: .top) {
                        if !archipelagoMode { headline.fixedSize(horizontal: false, vertical: true).background { seaBackdrop } }
                        Spacer(minLength: 14)
                        cameraControls
                    }.padding(16)
                    Spacer()
                    if archipelagoMode { archipelagoCard } else { islandFooter }
                }
            }
            .coordinateSpace(name: "land-map").clipped()
            .onAppear { mapSize = proxy.size }
            .onChange(of: proxy.size) { _, size in mapSize = size }
        }
    }

    private func moveHandle(scale: CGFloat) -> some View {
        Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
            .font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
            .frame(width: 44, height: 44).background(Theme.accent, in: Circle())
            .overlay(Circle().stroke(.white.opacity(0.55))).shadow(color: .black.opacity(0.45), radius: 8, y: 3)
            .contentShape(Circle())
            .gesture(DragGesture(minimumDistance: 4, coordinateSpace: .named("land-map"))
                .updating($handleDragging) { _, state, _ in state = true }
                .onChanged { value in
                    guard !editsDisabled else { return }
                    if handleOrigin == nil { handleOrigin = self.draft }
                    if let origin = handleOrigin {
                        let cell = TraderLandGeometry.draggedPosition(col: origin.col, row: origin.row, translation: value.translation, scale: scale, size: layout.size)
                        self.draft = LandPlacement(uid: origin.uid, itemId: origin.itemId, col: cell.col, row: cell.row, orientation: origin.orientation)
                    }
                }
                .onEnded { value in
                    if !editsDisabled, let origin = handleOrigin {
                        let cell = TraderLandGeometry.draggedPosition(col: origin.col, row: origin.row, translation: value.translation, scale: scale, size: layout.size)
                        self.draft = LandPlacement(uid: origin.uid, itemId: origin.itemId, col: cell.col, row: cell.row, orientation: origin.orientation)
                    }
                    handleOrigin = nil
                })
            .accessibilityHidden(true)
    }

    // MARK: Headline — what you earned and the one thing to do next.

    private var headline: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(eyebrow).font(.system(size: 9, weight: .medium, design: .monospaced)).tracking(1.6).foregroundStyle(Theme.muted)
                .lineLimit(1).minimumScaleFactor(0.8).allowsHitTesting(false)
            if draft != nil {
                Text(draft?.uid == LandCore.uid ? L.t("Move the Aura Core.", "Mueve el Núcleo de Aura.") : L.t("Find its place.", "Encuentra su lugar."))
                    .font(.system(size: 20, weight: .medium, design: .rounded)).tracking(-0.5).allowsHitTesting(false)
                Text(L.t("Tap a tile or drag the piece, then confirm.", "Toca una casilla o arrastra la pieza y confirma."))
                    .font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).allowsHitTesting(false)
            } else if accountIsland {
                if let world = sync.world {
                    let action = LandIslandStatus.nextAction(world)
                    Button { perform(action) } label: {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(actionTitle(action)).font(.system(size: 19, weight: .medium, design: .rounded)).tracking(-0.4)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                            Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.accentSoft)
                        }.contentShape(Rectangle())
                    }.buttonStyle(.plain).accessibilityIdentifier("land-next-action")
                    if let route = LandIslandStatus.tiersLine(world) ?? world.route.map(LandIslandStatus.routeLine) {
                        Text(route).font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).allowsHitTesting(false)
                    }
                } else {
                    Text(sync.error == nil ? L.t("Syncing your island…", "Sincronizando tu isla…") : L.t("Your island is offline.", "Tu isla está sin conexión."))
                        .font(.system(size: 19, weight: .medium, design: .rounded)).allowsHitTesting(false)
                }
            } else {
                Text(L.t("What discipline builds.", "Lo que construye la disciplina.")).font(.system(size: 20, weight: .medium, design: .rounded)).tracking(-0.5).allowsHitTesting(false)
                Text(L.t("Sign in on the desk and every read plants a real piece.", "Inicia sesión en la mesa y cada lectura planta una pieza real."))
                    .font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true).allowsHitTesting(false)
            }
        }
    }

    private var eyebrow: String {
        guard accountIsland else { return L.t("PRACTICE ISLAND", "ISLA DE PRÁCTICA") }
        guard let world = sync.world else { return L.t("YOUR ISLAND", "TU ISLA") }
        return L.t("YOUR ISLAND · \(world.xp) XP · \(world.aura) AURA", "TU ISLA · \(world.xp) XP · \(world.aura) AURA")
    }

    private func actionTitle(_ action: LandIslandStatus.NextAction) -> String {
        switch action {
        case let .review(count):
            return count == 1 ? L.t("1 thesis ready to review", "1 tesis lista para revisar") : L.t("\(count) theses ready to review", "\(count) tesis listas para revisar")
        case let .build(count, _):
            return count == 1 ? L.t("1 piece ready to build", "1 pieza lista para construir") : L.t("\(count) pieces ready to build", "\(count) piezas listas para construir")
        case let .growing(count, reviewAt):
            let seeds = count == 1 ? L.t("1 seed growing", "1 semilla creciendo") : L.t("\(count) seeds growing", "\(count) semillas creciendo")
            guard let wait = LandIslandStatus.until(reviewAt) else { return "\(seeds) · \(L.t("review opens soon", "su revisión abre pronto"))" }
            return count == 1 ? "\(seeds) · \(L.t("review opens in \(wait)", "su revisión abre en \(wait)"))"
                : "\(seeds) · \(L.t("first review opens in \(wait)", "la primera revisión abre en \(wait)"))"
        case .read:
            return L.t("Your next piece comes from a read on the desk", "Tu próxima pieza sale de una lectura en la mesa")
        }
    }

    private func perform(_ action: LandIslandStatus.NextAction) {
        switch action {
        case .review, .growing: collectionOpen = true; scrollTarget = "land-reviews"
        case let .build(_, first): selectPiece(first)
        case .read: dismiss()
        }
    }

    /// Opens the collection on a piece so Build is one tap.
    private func selectPiece(_ id: String) {
        guard let item = items[id] else { return }
        district = item.district; selectedItemId = id; selectedPlacementId = nil; collectionOpen = true
        scrollTarget = "land-top"; sound.play("placement_tick")
    }

    /// The desk's hand-off: honoured once, when the account world first arrives.
    private func applyFocus(_ world: TraderLandWorld) {
        guard !focusHandled, let focus else { return }
        focusHandled = true
        switch focus {
        case let .build(itemID):
            // `sync.world` still holds the previous value here (Published emits on willSet).
            let id = TraderLandCatalog.artID(itemID)
            // Not ready any more (built on the web, say): show the ready row and let the player pick.
            if LandIslandStatus.readyPieces(world).contains(where: { $0.id == id }) { selectPiece(id) }
            else { collectionOpen = true; scrollTarget = "land-top" }
        case .review:
            collectionOpen = true; scrollTarget = "land-reviews"
        case let .seed(inventoryID):
            // The seed the desk just planted: its row, where the horizon can still grow.
            collectionOpen = true
            let known = world.inventory.contains { $0.id == inventoryID && $0.state == "seed" }
            highlightedSeed = known ? inventoryID : nil
            scrollTarget = known ? Self.seedAnchor(inventoryID) : "land-reviews"
        }
    }

    private static func seedAnchor(_ inventoryID: String) -> String { "land-seed-\(inventoryID)" }

    /// A world with another size or core invalidates everything that holds cells: a growth step
    /// shifted every placement and the core, so an open draft or a stored inverse move would land on
    /// the wrong cells. A camera resting at home follows the new home zoom.
    private func adoptLand(size: Int, core next: LandCore?) {
        guard size != landSize || next != core else { return }
        let atHome = zoom == homeZoom && pan == .zero && visited == nil
        landSize = size; core = next
        draft = nil; remoteUndo = nil
        if selectedPlacementId == LandCore.uid { selectedPlacementId = nil; selectedItemId = nil }
        if atHome && zoom != homeZoom { withAnimation(.easeInOut(duration: 0.3)) { zoom = homeZoom } }
    }

    /// When the soonest growing seed's review opens, per the last snapshot.
    private var nextReviewAt: Date? { accountIsland ? sync.world.flatMap(LandIslandStatus.nextReviewAt) : nil }

    /// Refreshes the account island unless the player is mid-edit.
    private func reloadIsland() async {
        guard accountIsland, draft == nil, !sync.busy else { return }
        await sync.load()
    }

    private var islandFooter: some View {
        VStack(spacing: 0) {
            if accountIsland && (sync.busy || sync.error != nil) {
                HStack(spacing: 10) {
                    if sync.busy { ProgressView().tint(Theme.accentSoft) }
                    Text(sync.error ?? L.t("Syncing your island…", "Sincronizando tu isla…"))
                        .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button { draft = nil; remoteUndo = nil; Task { await sync.load() } } label: { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }
                        .disabled(sync.busy).accessibilityLabel(L.t("Reload island", "Recargar isla"))
                }.foregroundStyle(sync.error == nil ? Theme.text : Theme.down).padding(.horizontal, 16)
                    .background(Theme.panel.opacity(0.92))
            }
            if !notice.isEmpty {
                Text(notice).font(.system(size: 12)).foregroundStyle(Theme.text).multilineTextAlignment(.center).padding(.horizontal, 14).padding(.vertical, 9)
                    .background(Theme.panel.opacity(0.94), in: Capsule()).overlay(Capsule().stroke(Theme.stroke))
                    .padding(.horizontal, 16).padding(.bottom, 6).accessibilityIdentifier("land-notice")
            }
            if draft != nil { placementControls.padding(12) }
            else {
                HStack {
                    Text(footerStatus)
                        .font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(Theme.muted)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .accessibilityIdentifier("land-fixed-status")
                    Spacer()
                    Button(action: undo) { Label(L.t("Undo", "Deshacer"), systemImage: "arrow.uturn.backward").font(.system(size: 13)).frame(minHeight: 44) }
                        .disabled(!canUndo).foregroundStyle(Theme.text).opacity(canUndo ? 1 : 0.3).accessibilityIdentifier("land-undo")
                }.background { seaBackdrop }.padding(.horizontal, 20).padding(.bottom, 4)
            }
        }
    }

    /// Account islands show their growth ("10×10 · 22/60 · CORE DORMANT"); the practice island its focus rings.
    private var footerStatus: String {
        if accountIsland, let world = sync.world { return LandIslandStatus.growthStatus(world) }
        return L.t("FOCUS \(focusLevel)/2 · \(placements.count + 1) PLACED", "ENFOQUE \(focusLevel)/2 · \(placements.count + 1) COLOCADAS")
    }

    /// Between the island and the archipelago the neighbours drift under your island's text; this keeps it legible.
    private var seaBackdrop: some View {
        RoundedRectangle(cornerRadius: 14).fill(Theme.bg.opacity(seaVisible ? 0.82 : 0)).padding(-8)
            .animation(.easeInOut(duration: 0.2), value: seaVisible).allowsHitTesting(false)
    }

    private var cameraControls: some View {
        VStack(spacing: 0) {
            icon("minus", label: L.t("Zoom out", "Alejar")) { zoomBy(1 / 1.2) }
            Button { goHome() } label: { Text("\(Int((zoom * 100).rounded()))%").font(.system(size: 11, design: .monospaced)).frame(width: 44, height: 30) }
                .buttonStyle(.plain).accessibilityLabel(L.t("Reset view", "Restablecer vista"))
                .accessibilityValue("\(Int((zoom * 100).rounded()))%").accessibilityIdentifier("land-zoom")
            icon("plus", label: L.t("Zoom in", "Acercar")) { zoomBy(1.2) }
        }.background(Theme.panel.opacity(0.85), in: RoundedRectangle(cornerRadius: 13)).overlay(RoundedRectangle(cornerRadius: 13).stroke(Theme.stroke))
    }

    private var placementControls: some View {
        HStack(spacing: 6) {
            Image(systemName: validDraft ? "checkmark" : "xmark").font(.system(size: 13, weight: .semibold))
            VStack(alignment: .leading, spacing: 3) {
                Text(validDraft ? L.t("Ready to place", "Lista para colocar") : L.t("Needs more room", "Necesita espacio")).font(.system(size: 12, weight: .medium))
                if let draft { Text("\(draft.col + 1) / \(draft.row + 1)").font(.system(size: 10, design: .monospaced)).opacity(0.55).accessibilityIdentifier("land-draft-coordinate") }
            }.frame(maxWidth: .infinity, alignment: .leading)
            icon("xmark", label: L.t("Cancel placement", "Cancelar colocación")) { draft = nil; collectionOpen = true }
                .disabled(accountIsland && sync.busy)
            if draft?.uid != LandCore.uid {
                icon("arrow.clockwise", label: L.t("Rotate piece", "Girar pieza"), action: rotate).accessibilityIdentifier("land-rotate")
            }
            Button(action: confirm) {
                Label(L.t("Place", "Colocar"), systemImage: "checkmark").font(.system(size: 13, weight: .semibold)).padding(.horizontal, 13).frame(height: 44)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 11)).foregroundStyle(.white)
            }
                .buttonStyle(.plain).disabled(!validDraft || editsDisabled).opacity(validDraft && !editsDisabled ? 1 : 0.35).accessibilityIdentifier("land-confirm")
        }.foregroundStyle(validDraft ? Theme.text : Theme.down)
            .padding(9).background(Theme.panel.opacity(0.97), in: RoundedRectangle(cornerRadius: 17))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(Theme.stroke))
    }

    // MARK: Collection

    private var readyPieces: [(id: String, count: Int)] {
        guard accountIsland, let world = sync.world else { return [] }
        return LandIslandStatus.readyPieces(world)
    }

    private func collection(maxHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            Button { collectionOpen.toggle() } label: {
                HStack {
                    Image(systemName: "square.3.layers.3d")
                    Text(L.t("Your collection", "Tu colección")).font(.system(size: 16, weight: .medium))
                    Text("\(accountIsland ? sync.world?.inventory.count ?? 0 : manifest.items.count - 1)").font(.system(size: 11, design: .monospaced)).padding(5).background(Theme.cardSoft, in: RoundedRectangle(cornerRadius: 5))
                    if !readyPieces.isEmpty {
                        Text(L.t("\(readyPieces.reduce(0) { $0 + $1.count }) to build", "\(readyPieces.reduce(0) { $0 + $1.count }) por construir"))
                            .font(.system(size: 11, weight: .medium)).foregroundStyle(Theme.accentSoft)
                    }
                    Spacer()
                    Image(systemName: collectionOpen ? "chevron.down" : "chevron.up").font(.system(size: 13))
                }.frame(minHeight: 50).padding(.horizontal, 18).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityIdentifier("land-collection-toggle")
            if collectionOpen {
                VStack(spacing: 0) {
                    ScrollViewReader { reader in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 12) {
                                Color.clear.frame(height: 0).id("land-top")
                                if accountIsland {
                                    readyRow
                                    VStack(alignment: .leading, spacing: 10) { reviewSection }.id("land-reviews")
                                }
                                districtTabs
                                piecesRow
                                Text(accountIsland ? L.t("One question = one seed. Patience decides the piece: 24 h blooms a 1×1, 3 days a 2×1 building, 7 days a 2×2 landmark.", "Una pregunta = una semilla. La paciencia decide la pieza: 24 h florece en 1×1, 3 días en un edificio 2×1, 7 días en un monumento 2×2.") : L.t("Practice island · saved on this device. Your earned collection stays separate.", "Isla de práctica · guardada en este dispositivo. Tu colección ganada se mantiene separada."))
                                    .font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                            }.padding(.horizontal, 16).padding(.bottom, 16)
                        }.frame(maxHeight: maxHeight - 50 - (selectedItem == nil ? 0 : 80))
                            .onChange(of: scrollTarget) { _, target in
                                guard let target else { return }
                                withAnimation(.easeInOut(duration: 0.3)) { reader.scrollTo(target, anchor: .top) }
                                scrollTarget = nil
                            }
                            .onAppear {
                                // Opening the panel and asking for a section happen in the same update.
                                guard let target = scrollTarget else { return }
                                DispatchQueue.main.async { reader.scrollTo(target, anchor: .top); scrollTarget = nil }
                            }
                    }
                    if let item = selectedItem { selectionBar(item) }
                }
                // Slides with the header when the panel grows or folds, so the two never overlap.
                .transition(.move(edge: .bottom))
            }
        }.background(Theme.panel).overlay(alignment: .top) { Rectangle().fill(Theme.stroke).frame(height: 1) }
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 20, topTrailingRadius: 20))
            .disabled(accountIsland && sync.busy)
    }

    @ViewBuilder private var readyRow: some View {
        let ready = readyPieces
        if !ready.isEmpty {
            Text(L.t("Ready to build", "Listas para construir")).font(.system(size: 14, weight: .medium))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(ready, id: \.id) { piece in
                        Button { selectPiece(piece.id) } label: {
                            HStack(spacing: 8) {
                                if let image = TraderLandArt.thumb(piece.id) { Image(uiImage: image).resizable().scaledToFit().frame(width: 44, height: 36) }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(TraderLandCatalog.name(piece.id)).font(.system(size: 12, weight: .medium)).lineLimit(1)
                                    Text(piece.count > 1 ? L.t("×\(piece.count) · Build", "×\(piece.count) · Construir") : L.t("Build", "Construir"))
                                        .font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.accentSoft)
                                }
                            }.padding(.horizontal, 10).padding(.vertical, 7)
                                .background(selectedItemId == piece.id ? Theme.cardSoft : Theme.card, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selectedItemId == piece.id ? Theme.cio.opacity(0.8) : Theme.accent.opacity(0.45)))
                        }.buttonStyle(.plain).accessibilityIdentifier("land-ready-\(piece.id)")
                    }
                }
            }
        }
    }

    private var districtTabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(districts, id: \.self) { value in
                    Button { district = value; selectedItemId = nil; selectedPlacementId = nil } label: {
                        Text(districtName(value)).font(.system(size: 12, weight: .medium)).lineLimit(1)
                            .padding(.horizontal, 12).frame(height: 34)
                            .foregroundStyle(district == value ? Theme.text : Theme.muted)
                            .background(district == value ? Theme.accent.opacity(0.16) : Theme.card, in: Capsule())
                            .overlay(Capsule().stroke(district == value ? Theme.accent.opacity(0.7) : Theme.stroke))
                    }.buttonStyle(.plain).accessibilityIdentifier("land-district-\(value)")
                }
            }
        }
    }

    private var piecesRow: some View {
        ScrollViewReader { reader in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(manifest.items.filter { $0.district == district }) { item in
                        let state = pieceState(item)
                        Button { selectedItemId = item.id; selectedPlacementId = nil; sound.play("placement_tick") } label: {
                            VStack(spacing: 3) {
                                if let art = item.artState, let thumb = art.variants["thumb_256"] {
                                    GateBundleImage(path: RuntimeBundle.bundlePath(thumb.url)).frame(width: 84, height: 65).opacity(state == .locked ? 0.4 : 1)
                                }
                                Text(landName(item)).font(.system(size: 11, weight: .medium)).lineLimit(2).multilineTextAlignment(.center).frame(height: 29)
                                Text(collectionState(item)).font(.system(size: 10, design: .monospaced)).lineLimit(2)
                                    .foregroundStyle(state == .ready ? Theme.accentSoft : state == .seed ? Theme.cio.opacity(0.85) : Theme.muted)
                            }.frame(width: 94).padding(7).background(selectedItemId == item.id ? Theme.cardSoft : Theme.card, in: RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(selectedItemId == item.id ? Theme.cio.opacity(0.85) : Theme.stroke))
                        }.buttonStyle(.plain).id(item.id).accessibilityIdentifier("blueprint-\(item.id)")
                    }
                }
            }
            .onChange(of: selectedItemId) { _, id in
                guard let id, items[id]?.district == district else { return }
                withAnimation(.easeInOut(duration: 0.3)) { reader.scrollTo(id, anchor: .center) }
            }
            .onAppear {
                guard let id = selectedItemId, items[id]?.district == district else { return }
                DispatchQueue.main.async { reader.scrollTo(id, anchor: .center) }
            }
        }
    }

    private func selectionBar(_ item: LandItem) -> some View {
        let isCore = selectedPlacementId == LandCore.uid
        return HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(landName(item)).font(.system(size: 14, weight: .medium))
                Text(isCore ? (core?.dormant == true ? L.t("Dormant · wakes when 5 pieces stand", "Dormido · despierta con 5 piezas") : L.t("Awake · the heart of your island", "Despierto · el corazón de tu isla"))
                     : selectedPlacementId == nil ? L.t("Blueprint", "Plano") : L.t("On your island", "En tu isla"))
                    .font(.system(size: 11)).foregroundStyle(Theme.muted).accessibilityIdentifier("land-selection-detail")
            }
            Spacer(minLength: 0)
            if selectedPlacementId != nil && !isCore {
                Button(L.t("Store", "Guardar"), action: store).font(.system(size: 12)).frame(minWidth: 44, minHeight: 44).disabled(editsDisabled).accessibilityIdentifier("land-store")
            }
            let blocked = editsDisabled || (accountIsland && selectedPlacementId == nil && availableInventory(item.id) == nil)
            Button(action: startDraft) {
                Label(selectedPlacementId == nil ? L.t("Build", "Construir") : L.t("Move", "Mover"), systemImage: selectedPlacementId == nil ? "plus" : "arrow.up.and.down.and.arrow.left.and.right")
                    .font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(height: 44)
                    .background(Theme.accent, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(.white)
            }
                .buttonStyle(.plain).accessibilityIdentifier("land-build-or-move")
                .disabled(blocked).opacity(blocked ? 0.35 : 1)
        }.padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 12)).padding(.horizontal, 12).padding(.bottom, 8)
    }

    private var helpSheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(L.t("How your island grows", "Cómo crece tu isla")).font(.title2.bold())
                helpStep(1, L.t("One question = one seed. Every completed read on the desk plants one, up to 3 a day.", "Una pregunta = una semilla. Cada lectura completa en la mesa planta una, hasta 3 al día."))
                helpStep(2, L.t("Patience decides the piece. A seed reviewed after 24 h blooms into a 1×1 piece; give it 3 days for a 2×1 building or 7 days for a 2×2 landmark. A horizon only grows, and only before its review opens.", "La paciencia decide la pieza. Una semilla revisada a las 24 h florece en una pieza 1×1; dale 3 días para un edificio 2×1 o 7 días para un monumento 2×2. Un horizonte solo crece, y solo antes de que abra su revisión."))
                helpStep(3, L.t("Whatever the market says, it blooms at its review — or right away when you respect a NO TRADE. Pieces repeat, so there is always a next one.", "Diga lo que diga el mercado, florece en su revisión, o al instante cuando respetas un NO OPERAR. Las piezas se repiten, así que siempre hay una siguiente."))
                helpStep(4, Self.growthHelp(accountIsland: accountIsland))
                helpStep(5, L.t("Build here, name your island and publish it when you want to join the archipelago. Visits never give XP.", "Construye aquí, ponle nombre a tu isla y publícala cuando quieras unirte al archipiélago. Las visitas nunca dan XP."))
                Text(L.t("Tap a built piece to move or store it. Drag to explore, zoom out to see other islands, or open the archipelago from the header.", "Toca una pieza construida para moverla o guardarla. Arrastra para explorar, aleja el zoom para ver otras islas o abre el archipiélago desde la cabecera."))
                    .font(.subheadline).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                if !accountIsland { HStack {
                    Button(L.t("Reveal next focus ring", "Revelar el siguiente anillo"), action: reveal).disabled(focusLevel >= 2)
                    Spacer()
                    Button(L.t("Restore", "Restaurar"), action: restore)
                }.buttonStyle(.bordered).tint(Theme.accentSoft) }
                Button { help = false } label: { Text(L.t("Done", "Listo")).frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(.borderedProminent).tint(Theme.accent).foregroundStyle(.white)
            }.padding(24)
        }.background(Theme.bg).foregroundStyle(Theme.text).preferredColorScheme(.dark)
    }

    /// Help step 4. Only an account island grows and has a core that moves; the practice island
    /// says so instead of promising a tap that does nothing (GROWTH-v1 §1.6).
    static func growthHelp(accountIsland: Bool) -> String {
        accountIsland
            ? L.t("Your island grows as you fill it: 8×8, then 10×10, 12×12 and 16×16. The Aura Core wakes once 5 pieces stand; tap it to move it.",
                  "Tu isla crece a medida que la llenas: 8×8, luego 10×10, 12×12 y 16×16. El Núcleo de Aura despierta cuando hay 5 piezas; tócalo para moverlo.")
            : L.t("Sign in and your own island grows as you fill it: 8×8, then 10×10, 12×12 and 16×16, and its Aura Core wakes once 5 pieces stand. This practice island stays 8×8.",
                  "Inicia sesión y tu propia isla crece a medida que la llenas: 8×8, luego 10×10, 12×12 y 16×16, y su Núcleo de Aura despierta cuando hay 5 piezas. Esta isla de práctica se queda en 8×8.")
    }

    private func helpStep(_ number: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(number)").font(.system(size: 13, weight: .semibold, design: .monospaced)).foregroundStyle(Theme.accentSoft)
                .frame(width: 28, height: 28).background(Theme.accent.opacity(0.14), in: Circle())
            Text(text).font(.body).fixedSize(horizontal: false, vertical: true)
        }
    }

    private func icon(_ symbol: String, label: String, active: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 17, weight: .regular)).frame(width: 44, height: 44)
                .foregroundStyle(active ? Theme.accentSoft : Theme.text)
        }.buttonStyle(.plain).accessibilityLabel(label)
    }

    // MARK: Camera — your island, the archipelago and the islands around it.

    /// Out at sea the collection folds away and your island's selection clears; back home it returns.
    private func archipelagoChrome(_ active: Bool) {
        if active {
            draft = nil; selectedItemId = nil; selectedPlacementId = nil; notice = ""
            if collectionBeforeArchipelago == nil { collectionBeforeArchipelago = collectionOpen }
            collectionOpen = false
        } else {
            publishHint = false
            if let open = collectionBeforeArchipelago { collectionOpen = open }
            collectionBeforeArchipelago = nil
        }
    }

    private func animateCamera(zoom target: CGFloat, pan offset: CGSize, visit: Int?) {
        withAnimation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.6, dampingFraction: 0.88)) {
            zoom = target; pan = offset; setVisited(visit)
        }
    }

    /// Arriving at a neighbour shows the sea at once; leaving fades it with whatever animation is running.
    private func setVisited(_ index: Int?) {
        if index != nil { withTransaction(Transaction(animation: nil)) { seaFocus = 1 } } else { seaFocus = 0 }
        visited = index
    }

    /// Pan that puts an island's centre (a slot offset from yours) in the middle of the space above the card.
    private func panTarget(_ offset: CGPoint, zoom target: CGFloat, size: CGSize? = nil) -> CGSize {
        let scale = Self.fit(size ?? mapSize) * target
        return CGSize(width: -(offset.x + LandPainter.islandCenter.x - GateLayout.viewCenter.x) * scale,
                      height: -(offset.y + LandPainter.islandCenter.y - GateLayout.viewCenter.y) * scale - Self.archipelagoLift)
    }

    /// The zoom that fits your island and the first ring around it above the card.
    private var overviewZoom: CGFloat {
        let fit = Self.fit(mapSize), ring = ArchipelagoLayout.ringOneBounds
        let wide = (mapSize.width - 16) / (ring.width * fit)
        let tall = (mapSize.height - 2 * Self.archipelagoLift - 24) / (ring.height * fit)
        return min(0.5, max(Self.minZoom, min(wide, tall)))
    }

    /// Folds the chrome away first, then frames the camera once the map has its final size.
    private func atSea(_ move: @escaping () -> Void) {
        guard !archipelagoMode else { move(); return }
        draft = nil
        withAnimation(.easeInOut(duration: 0.25)) { archipelagoChrome(true) }
        DispatchQueue.main.async(execute: move)
    }

    private func openArchipelago() {
        atSea {
            let zoom = overviewZoom, ring = ArchipelagoLayout.ringOneBounds
            animateCamera(zoom: zoom, pan: panTarget(CGPoint(x: 0, y: ring.midY), zoom: zoom), visit: nil)
            sound.play("fog_reveal", volume: 0.3)
        }
    }

    private func flyTo(_ index: Int) {
        guard scene.islands.indices.contains(index) else { return }
        atSea {
            animateCamera(zoom: Self.visitZoom, pan: panTarget(scene.islands[index].offset, zoom: Self.visitZoom), visit: index)
            sound.play("placement_tick")
        }
    }

    private func step(_ direction: Int) {
        let count = scene.islands.count
        guard count > 0 else { return }
        let next = visited.map { ($0 + direction + count) % count } ?? (direction > 0 ? 0 : count - 1)
        flyTo(next)
    }

    private func goHome() {
        animateCamera(zoom: homeZoom, pan: .zero, visit: nil)
        if !archipelagoMode { withAnimation(.easeInOut(duration: 0.25)) { archipelagoChrome(false) } }
    }

    private func zoomBy(_ factor: CGFloat) {
        let target = min(maxZoom, max(draft == nil ? Self.minZoom : 0.7, zoom * factor))
        let ratio = target / zoom
        withAnimation(.easeOut(duration: 0.25)) {
            zoom = target
            let scaled = CGSize(width: pan.width * ratio, height: pan.height * ratio)
            refocus(pan: scaled, size: mapSize)
            pan = boundedPan(scaled, size: mapSize)
        }
    }

    /// Close in on the sea and you are visiting whichever island sits nearest the centre.
    private func refocus(pan value: CGSize, size: CGSize) {
        guard zoom > Self.seaZoom, !scene.islands.isEmpty else { return }
        let scale = Self.fit(size) * zoom
        func distance(_ offset: CGPoint) -> CGFloat {
            let target = offset == .zero ? .zero : panTarget(offset, zoom: zoom, size: size)
            return abs(value.width - target.width) / (736 * scale) + abs(value.height - target.height) / (368 * scale)
        }
        var best: Int?, bestDistance = distance(.zero)
        for (index, island) in scene.islands.enumerated() where distance(island.offset) < bestDistance {
            best = index; bestDistance = distance(island.offset)
        }
        if best != visited { setVisited(best) }
    }

    private enum IslandHit { case own, neighbor(Int) }

    private func islandAt(_ point: CGPoint, size: CGSize, scale: CGFloat) -> IslandHit? {
        let world = CGPoint(x: (point.x - size.width / 2 - pan.width) / scale + GateLayout.viewCenter.x,
                            y: (point.y - size.height / 2 - pan.height) / scale + GateLayout.viewCenter.y)
        func inside(_ offset: CGPoint) -> Bool { abs(world.x - offset.x - 430) / 410 + abs(world.y - offset.y - 370) / 240 <= 1 }
        if let index = scene.islands.indices.first(where: { inside(scene.islands[$0].offset) }) { return .neighbor(index) }
        return inside(.zero) ? .own : nil
    }

    private func tap(_ point: CGPoint, size: CGSize, scale: CGFloat) {
        if seaVisible {
            switch islandAt(point, size: size, scale: scale) {
            case let .neighbor(index)?: if visited != index { flyTo(index) }; return
            case .own?: if archipelagoMode { goHome(); return }
            case nil: if archipelagoMode { return }
            }
        }
        let cell = cellAt(point, size: size, scale: scale)
        choose(cell.0, cell.1)
    }

    private func boundedPan(_ value: CGSize, size: CGSize) -> CGSize {
        func clamp(_ v: CGSize, _ low: CGSize, _ high: CGSize) -> CGSize {
            CGSize(width: min(high.width, max(low.width, v.width)), height: min(high.height, max(low.height, v.height)))
        }
        // An 8×8 island (always the practice one) keeps its old limits; a grown one lets its far edges into view.
        let slack = layout.panSlack(map: size, scale: Self.fit(size) * zoom)
        if zoom <= Self.seaZoom, !scene.offsets.isEmpty {
            let targets = [CGSize.zero] + scene.offsets.map { panTarget($0, zoom: zoom, size: size) }
            let xs = targets.map(\.width), ys = targets.map(\.height)
            return clamp(value, CGSize(width: xs.min()! - size.width * 0.5, height: ys.min()! - size.height * 0.5),
                         CGSize(width: xs.max()! + size.width * 0.5, height: ys.max()! + size.height * 0.5))
        }
        if let visited, scene.islands.indices.contains(visited) {
            let centre = panTarget(scene.islands[visited].offset, zoom: zoom, size: size)
            return clamp(value, CGSize(width: centre.width - slack.width, height: centre.height - slack.height),
                         CGSize(width: centre.width + slack.width, height: centre.height + slack.height))
        }
        return clamp(value, CGSize(width: -slack.width, height: -slack.height), slack)
    }

    private func cellAt(_ point: CGPoint, size: CGSize, scale: CGFloat) -> (Int, Int) {
        let x = (point.x - size.width / 2 - pan.width) / scale + GateLayout.viewCenter.x
        let y = (point.y - size.height / 2 - pan.height) / scale + GateLayout.viewCenter.y
        let cell = layout.cellAt(CGPoint(x: x, y: y))
        return (cell.col, cell.row)
    }

    // MARK: Archipelago data and card

    private func loadNeighbors() async {
#if DEBUG
        // The account fixture stays offline: its sea is the neighbours fixture too.
        if ArchipelagoFixture.enabled || accountFixture { fixtureIslands = ArchipelagoFixture.islands(); rebuildScene(); return }
#endif
        await neighbors.load(excluding: ownCode)
        rebuildScene()
    }

    private func rebuildScene() {
        let previous = visited.flatMap { scene.islands.indices.contains($0) ? scene.islands[$0].info.code : nil }
        scene = ArchipelagoScene(islands: publicNeighbors, showLots: neighborsReady && (fixtureIslands != nil || !neighbors.failed))
        setVisited(previous.flatMap { code in scene.islands.firstIndex { $0.info.code == code } })
        let art = scene.artPaths
        guard !art.glows.isEmpty || !art.albedos.isEmpty else { return }
        Task { await LandImageCache.warm(albedos: art.albedos, glows: art.glows); artVersion += 1 }
    }

    private var archipelagoCard: some View {
        let islands = scene.islands
        let current = visited.flatMap { islands.indices.contains($0) ? islands[$0].info : nil }
        let loadFailed = neighbors.failed && fixtureIslands == nil
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Text(archipelagoEyebrow).font(.system(size: 10, weight: .medium, design: .monospaced)).tracking(1.4).foregroundStyle(Theme.muted)
                    .lineLimit(1).minimumScaleFactor(0.8)
                Spacer(minLength: 0)
                Button { goHome() } label: {
                    Label(L.t("Back to my island", "Volver a mi isla"), systemImage: "house").font(.system(size: 12, weight: .medium))
                        .padding(.horizontal, 10).frame(height: 32).background(Theme.cardSoft, in: Capsule())
                }.buttonStyle(.plain).frame(minHeight: 44).accessibilityIdentifier("land-home-island")
            }
            if !neighborsReady {
                Text(L.t("Looking for public islands…", "Buscando islas públicas…")).font(.system(size: 14)).foregroundStyle(Theme.muted)
            } else if loadFailed {
                HStack(spacing: 10) {
                    Text(L.t("Community islands could not load. You can still visit Satoshi Nakamoto.", "No se pudieron cargar las islas de la comunidad. Puedes visitar Satoshi Nakamoto."))
                        .font(.system(size: 14)).fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Button(L.t("Retry", "Reintentar")) { Task { await loadNeighbors() } }
                        .font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.accentSoft).frame(minHeight: 44)
                }
            }
            if !islands.isEmpty {
                HStack(spacing: 6) {
                    arrow("chevron.left", label: L.t("Previous island", "Isla anterior"), id: "land-prev-island") { step(-1) }
                    VStack(alignment: .leading, spacing: 3) {
                        Text(current.map(LandIslandStatus.title) ?? ownIslandLabel)
                            .font(.system(size: 16, weight: .medium)).lineLimit(1).accessibilityIdentifier("land-focused-island")
                        Text(current.map(LandIslandStatus.summary) ?? L.t("Tap an island or use the arrows to visit.", "Toca una isla o usa las flechas para visitarla."))
                            .font(.system(size: 12)).foregroundStyle(Theme.muted).lineLimit(2)
                        if let current, let published = LandIslandStatus.published(current) {
                            Text("\(published) · \(L.t("visits give no XP", "las visitas no dan XP"))").font(.system(size: 11)).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.85)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    arrow("chevron.right", label: L.t("Next island", "Siguiente isla"), id: "land-next-island") { step(1) }
                }
            }
            Button { communityOpen = true } label: {
                Label(current != nil && current?.isShowcase != true ? L.t("Report or block creator", "Reportar o bloquear creador") : L.t("Community safety", "Seguridad de la comunidad"), systemImage: "hand.raised")
                    .font(.system(size: 12)).frame(maxWidth: .infinity, minHeight: 44)
            }.accessibilityIdentifier("land-community-safety")
            if ownPublic {
                Label(L.t("Your island is on the map.", "Tu isla está en el mapa."), systemImage: "globe").font(.system(size: 12)).foregroundStyle(Theme.accentSoft)
            } else if publishHint {
                Text(L.t("Sign in on the desk to publish. Your practice island stays on this device.", "Inicia sesión en la mesa para publicar. Tu isla de práctica se queda en este dispositivo."))
                    .font(.system(size: 12)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
            } else {
                Button { if accountIsland { openShare() } else { publishHint = true } } label: {
                    Label(L.t("Put your island on the map", "Pon tu isla en el mapa"), systemImage: "mappin.and.ellipse").font(.system(size: 13, weight: .semibold))
                        .frame(maxWidth: .infinity, minHeight: 44).background(Theme.accent, in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(.white)
                }.buttonStyle(.plain).disabled(accountIsland && sync.world == nil).accessibilityIdentifier("land-publish-cta")
            }
        }
        .padding(14)
        .background(Theme.panel.opacity(0.95), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(Theme.stroke))
        .padding(.horizontal, 12).padding(.bottom, 10)
        .accessibilityElement(children: .contain).accessibilityIdentifier("land-archipelago-card")
    }

    private var archipelagoEyebrow: String {
        let count = scene.islands.count
        guard neighborsReady, count > 0 else { return L.t("ARCHIPELAGO", "ARCHIPIÉLAGO") }
        return count == 1 ? L.t("ARCHIPELAGO · 1 PUBLIC ISLAND", "ARCHIPIÉLAGO · 1 ISLA PÚBLICA")
            : L.t("ARCHIPELAGO · \(count) PUBLIC ISLANDS", "ARCHIPIÉLAGO · \(count) ISLAS PÚBLICAS")
    }

    private func arrow(_ symbol: String, label: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol).font(.system(size: 15, weight: .semibold)).frame(width: 44, height: 44)
                .background(Theme.cardSoft, in: Circle())
        }.buttonStyle(.plain).accessibilityLabel(label).accessibilityIdentifier(id)
    }

    private func openShare() { shareTitle = sync.world?.share?.title ?? ""; shareOpen = true }

    // MARK: Editing your island

    private func choose(_ col: Int, _ row: Int) {
        guard !editsDisabled, !archipelagoMode, layout.contains(col: col, row: row) else { return }
        if let current = draft {
            draft = LandPlacement(uid: current.uid, itemId: current.itemId, col: col, row: row, orientation: current.orientation)
            return
        }
        // On an account island the Aura Core is selectable too, to move it.
        var standing = placements
        if canMoveCore, let corePlacement { standing.append(corePlacement) }
        let placement = standing.first { p in items[p.itemId].map { landCells($0, p).contains("\(col):\(row)") } ?? false }
        selectedPlacementId = placement?.uid; selectedItemId = placement?.itemId
        if let item = selectedItem {
            if item.kind != "core" { district = item.district }
            collectionOpen = true; sound.play("placement_tick")
        }
    }
    private func startDraft() {
        guard !editsDisabled, let item = selectedItem else { return }
        guard !accountIsland || selectedPlacementId != nil || availableInventory(item.id) != nil else { return }
        if archipelagoMode { collectionBeforeArchipelago = nil; goHome() }
        if selectedPlacementId == LandCore.uid {
            guard canMoveCore, let corePlacement else { return }
            draft = corePlacement
        } else if let selectedPlacementId, let existing = placements.first(where: { $0.uid == selectedPlacementId }) { draft = existing }
        else {
            // The first free spot nearest the lower-left (1,5 on an 8×8), scaled to the island's size.
            let n = layout.size, preferred = (col: n / 8, row: 5 * n / 8)
            let candidates = (0..<(n * n)).map { (col: $0 % n, row: $0 / n) }.sorted { a, b in
                (a.col - preferred.col) * (a.col - preferred.col) + (a.row - preferred.row) * (a.row - preferred.row)
                    < (b.col - preferred.col) * (b.col - preferred.col) + (b.row - preferred.row) * (b.row - preferred.row)
            }
            let cell = candidates.first { c in
                let area = LandPlacement(uid: "preview", itemId: item.id, col: c.col, row: c.row, orientation: .neSW)
                return landCells(item, area).allSatisfy { key in
                    let xy = key.split(separator: ":").compactMap { Int($0) }
                    return xy.count == 2 && layout.contains(col: xy[0], row: xy[1]) && revealed(xy[0], xy[1]) && !occupied.contains(key)
                }
            } ?? preferred
            draft = LandPlacement(uid: "\(item.id)-\(UUID().uuidString)", itemId: item.id, col: cell.col, row: cell.row, orientation: .neSW)
        }
        collectionOpen = false; notice = ""
    }
    private func rotate() {
        guard !editsDisabled, let current = draft, current.uid != LandCore.uid else { return }
        draft = LandPlacement(uid: current.uid, itemId: current.itemId, col: current.col, row: current.row, orientation: current.orientation == .nwSE ? .neSW : .nwSE)
    }
    private func confirm() {
        guard !editsDisabled, validDraft, let current = draft else { return }
        if accountIsland {
            let rotation = current.orientation == .nwSE ? 90 : 0
            if current.uid == LandCore.uid {
                // Same spot: nothing to save.
                if let core, current.col == core.col, current.row == core.row { draft = nil; collectionOpen = true; return }
                commitRemote(.moveCore(x: current.col, y: current.row), inverse: nil)
            } else if let previous = sync.world?.placements.first(where: { $0.id == current.uid }) {
                commitRemote(.move(placementID: previous.id, x: current.col, y: current.row, rotation: rotation), inverse: .move(placementID: previous.id, x: previous.x, y: previous.y, rotation: previous.rotation))
            } else if let inventory = availableInventory(current.itemId) {
                commitRemote(.place(inventoryID: inventory.id, x: current.col, y: current.row, rotation: rotation), inverse: nil, addedInventoryID: inventory.id)
            }
            return
        }
        checkpoint()
        placements.removeAll { $0.uid == current.uid }; placements.append(current)
        save()
        selectedPlacementId = current.uid; selectedItemId = current.itemId
        draft = nil; collectionOpen = true; sound.play("placement_confirm")
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        notice = L.t("Piece placed. Make it yours.", "Pieza colocada. Dale tu estilo.")
    }
    private func store() {
        guard !editsDisabled, let selectedPlacementId, selectedPlacementId != LandCore.uid else { return }
        if accountIsland {
            guard let previous = sync.world?.placements.first(where: { $0.id == selectedPlacementId }) else { return }
            commitRemote(.remove(placementID: previous.id), inverse: .place(inventoryID: previous.inventory_id, x: previous.x, y: previous.y, rotation: previous.rotation))
            return
        }
        checkpoint(); placements.removeAll { $0.uid == selectedPlacementId }; self.selectedPlacementId = nil
        save()
        notice = L.t("Returned to your collection.", "Devuelta a tu colección."); sound.play("placement_tick")
    }
    private func checkpoint() { history.append(.init(placements: placements, focusLevel: focusLevel)); if history.count > 10 { history.removeFirst() } }
    private func undo() {
        guard canUndo else { return }
        if accountIsland {
            if let remoteUndo { commitRemote(remoteUndo, inverse: nil) }
            return
        }
        guard let previous = history.popLast() else { return }
        placements = previous.placements; focusLevel = previous.focusLevel; selectedPlacementId = nil; save()
        notice = L.t("Last change undone.", "Último cambio deshecho.")
    }
    // MARK: Thesis review, season and shared islands — parity with the web studio.

    private static let site = URL(string: "https://bobbyprotocol.xyz")!
    // The web routes visitors under /agentic-world/bobby/trader-land/w/:code (App.tsx); /trader-land/w/ is a 404.
    private static func shareURL(_ code: String) -> URL { site.appendingPathComponent("agentic-world/bobby/trader-land/w/\(code)") }

    private var seeds: [TraderLandWorld.Inventory] {
        (sync.world?.inventory ?? []).filter { $0.state == "seed" && $0.review != nil }
            .sorted { ($0.review?.ready == true ? 0 : 1) < ($1.review?.ready == true ? 0 : 1) }
    }

    /// An extend option picked in a review row: the seed, its new horizon and the piece it will bloom into.
    private struct ExtendChoice: Identifiable {
        let inventoryID: String
        let horizon: LandHorizon
        let pieceName: String?
        var id: String { "\(inventoryID)-\(horizon.hours)" }
    }
    private var canClose: Bool { sync.world?.capabilities?.close == true && !editsDisabled && draft == nil }

    @ViewBuilder private var reviewSection: some View {
        if let season = sync.world?.season {
            HStack(spacing: 8) {
                Image(systemName: season.complete ? "checkmark.seal.fill" : "sparkles")
                Text(season.name.text).font(.system(size: 13, weight: .medium))
                Spacer(minLength: 0)
                Text("\(season.earned) / \(season.total)").font(.system(size: 12, design: .monospaced))
            }.foregroundStyle(Theme.cio).padding(10).background(Theme.cio.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .combine).accessibilityIdentifier("land-season")
        }
        if !seeds.isEmpty {
            Text(L.t("Theses to review", "Tesis por revisar")).font(.system(size: 14, weight: .medium))
            ForEach(seeds) { seed in
                let ready = seed.review?.ready == true
                let highlighted = highlightedSeed == seed.id
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(itemName(seed.item_id)).font(.system(size: 13, weight: .medium))
                        if let horizon = seed.horizon?.value {
                            Text(horizon.optionLabel).font(.system(size: 10, weight: .medium, design: .monospaced))
                                .foregroundStyle(horizon == .day ? Theme.muted : Theme.cio.opacity(0.9))
                                .accessibilityIdentifier("land-horizon-\(seed.id)")
                        }
                        Text(seedLine(seed.review!)).font(.system(size: 11)).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    if ready {
                        Button { closeThesis(seed) } label: {
                            Text(L.t("Review", "Revisar")).font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(height: 40)
                                .background(Theme.accent, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(.white)
                        }.buttonStyle(.plain).disabled(!canClose).opacity(canClose ? 1 : 0.4).accessibilityIdentifier("land-review-\(seed.id)")
                    } else if let options = seed.horizon?.options, !options.isEmpty, sync.world?.capabilities?.extend == true {
                        extendMenu(seed, options: options)
                    }
                }.padding(10).background(Theme.card, in: RoundedRectangle(cornerRadius: 12))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(highlighted ? Theme.accentSoft : ready ? Theme.cio.opacity(0.5) : Theme.stroke, lineWidth: highlighted ? 1.5 : 1))
                    .id(Self.seedAnchor(seed.id))
            }
        }
    }

    /// "Give it time": the horizons this seed can still grow to, each naming the piece it would bloom into.
    private func extendMenu(_ seed: TraderLandWorld.Inventory, options: [LandHorizon]) -> some View {
        Menu {
            ForEach(options) { horizon in
                let next = sync.world?.tier(horizon)?.next
                let name = next.map { TraderLandCatalog.name($0.id, district: $0.world) }
                Button {
                    extendChoice = ExtendChoice(inventoryID: seed.id, horizon: horizon, pieceName: name)
                } label: {
                    Text(name.map { "\(horizon.optionLabel) · \($0)" } ?? horizon.optionLabel)
                }.accessibilityIdentifier("land-extend-\(seed.id)-\(horizon.hours)")
            }
        } label: {
            Label(L.t("More time", "Más tiempo"), systemImage: "hourglass").font(.system(size: 12, weight: .semibold))
                .padding(.horizontal, 10).frame(height: 40)
                .background(Theme.cardSoft, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(Theme.text)
        }
        .disabled(!canExtend).opacity(canExtend ? 1 : 0.4)
        .accessibilityLabel(L.t("Give this seed more time", "Dale más tiempo a esta semilla"))
        .accessibilityIdentifier("land-extend-\(seed.id)")
    }

    private func extendMessage(_ choice: ExtendChoice) -> String {
        let piece = choice.pieceName.map { L.t("It will bloom into \($0), a \(choice.horizon.tierLabel.lowercased()) \(choice.horizon.footprintLabel).", "Florecerá en \($0), \(choice.horizon.tierLabel.lowercased()) \(choice.horizon.footprintLabel).") }
            ?? L.t("It will bloom into a \(choice.horizon.tierLabel.lowercased()) \(choice.horizon.footprintLabel).", "Florecerá en \(choice.horizon.tierLabel.lowercased()) \(choice.horizon.footprintLabel).")
        return "\(piece) \(L.t("Its review opens \(choice.horizon.label) after the read. You can't shorten it later.", "Su revisión abre \(choice.horizon.label) después de la lectura. No se puede acortar después."))"
    }

    private func extend(_ choice: ExtendChoice) {
        guard canExtend else { return }
        Task {
            guard let world = await sync.mutate(.extend(inventoryID: choice.inventoryID, hours: choice.horizon.hours)) else { return }
            let id = world.extended?.item?.id ?? world.inventory.first { $0.id == choice.inventoryID }?.item_id
            let name = id.map { itemName($0) } ?? choice.pieceName ?? choice.horizon.tierLabel
            notice = L.t("Seed extended to \(choice.horizon.label): it will bloom into \(name).", "Semilla extendida a \(choice.horizon.label): florecerá en \(name).")
            highlightedSeed = choice.inventoryID
            sound.play("placement_confirm"); UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    private func itemName(_ itemID: String) -> String {
        RuntimeBundle.items[TraderLandCatalog.artID(itemID)].map(landName) ?? itemID.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func seedLine(_ review: TraderLandWorld.SeedReview) -> String {
        var read = L.t("Read without a saved thesis", "Lectura sin tesis guardada")
        if let thesis = review.thesis {
            let bias = thesis.direction == "none" ? L.t("no edge", "sin sesgo") : landDirection(thesis.direction)
            let level = (thesis.entry ?? thesis.price).map { " @ \($0.formatted(.number.precision(.significantDigits(1...6))))" } ?? ""
            read = "\(thesis.symbol) \(bias)\(level)"
        }
        if review.ready { return "\(read) · \(L.t("Ready to review.", "Lista para revisar."))" }
        let date = ISO8601DateFormatter().date(from: review.reviewAt) ?? {
            let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: review.reviewAt)
        }()
        let when = date.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? review.reviewAt
        return "\(read) · \(L.t("Review from", "Revisable desde")) \(when)."
    }

    private func closeThesis(_ seed: TraderLandWorld.Inventory) {
        guard canClose, seed.review?.ready == true else { return }
        Task {
            guard let closed = await sync.mutate(.close(inventoryID: seed.id))?.closed else { return }
            let outcome = closed.outcome == "hit" ? L.t("target reached", "objetivo alcanzado")
                : closed.outcome == "invalidated" ? L.t("invalidation hit", "invalidación tocada")
                : L.t("window closed without touching a level", "venció sin tocar niveles")
            let move = closed.movePct.map { " (\($0 > 0 ? "+" : "")\($0.formatted(.number.precision(.fractionLength(0...2))))%)" } ?? ""
            let direction = closed.direction.flatMap { $0 == "none" ? nil : " \(landDirection($0))" } ?? ""
            let head = closed.symbol.map { "\($0)\(direction): \(outcome)\(move). " } ?? ""
            var text = "\(head)\(itemName(closed.itemId)) \(L.t("bloomed.", "floreció.")) +\(closed.xp) XP · +\(closed.aura) Aura."
            if let executed = closed.executed { text += " \(L.t("Execution bonus", "Bono de ejecución")) +\(executed.xp) XP · +\(executed.aura) Aura." }
            if let piece = closed.season?.piece { text += " \(L.t("Season piece", "Pieza de temporada")): \(itemName(piece.id))." }
            notice = text
            remoteUndo = nil
            sound.play("bloom_complete"); UINotificationFeedbackGenerator().notificationOccurred(.success)
        }
    }

    private var shareSheet: some View {
        let share = sync.world?.share
        return ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text(share?.public == true ? L.t("Your island is public.", "Tu isla es pública.") : L.t("Your island", "Tu isla")).font(.title2.bold())
                    Spacer()
                    Button { shareOpen = false } label: {
                        Image(systemName: "xmark").frame(width: 44, height: 44)
                    }.accessibilityLabel(L.t("Close island settings", "Cerrar ajustes de la isla"))
                        .accessibilityIdentifier("land-share-close")
                }
                Text(L.t("Publishing puts your island's name, pieces and districts in the public archipelago and gives you a link to share. Your XP, account and readings stay private.", "Publicar muestra el nombre, las piezas y los distritos de tu isla en el archipiélago público y te da un enlace para compartir. Tu XP, cuenta y lecturas siguen siendo privadas."))
                    .font(.subheadline).foregroundStyle(Theme.muted).fixedSize(horizontal: false, vertical: true)
                Text(L.t("By publishing, you allow OpenAI to check the island name for abusive content. Keep names respectful and omit personal information. Report or block creators from the archipelago.", "Al publicar, autorizas que OpenAI revise el nombre para detectar contenido abusivo. Usa nombres respetuosos y sin datos personales. Puedes reportar o bloquear creadores desde el archipiélago."))
                    .font(.footnote).foregroundStyle(Theme.muted)
                Link(L.t("Community rules and support", "Reglas de la comunidad y soporte"), destination: URL(string: "https://bobbyprotocol.xyz/support")!)
                TextField(L.t("Island name (optional)", "Nombre de la isla (opcional)"), text: $shareTitle)
                    .textFieldStyle(.roundedBorder).submitLabel(.done)
                    .accessibilityIdentifier("land-island-name")
                    .onChange(of: shareTitle) { _, value in sync.clearError(); if value.count > 80 { shareTitle = String(value.prefix(80)) } }
                if share?.public == true, let code = share?.code {
                    ShareLink(item: Self.shareURL(code)) { Label(L.t("Share link", "Compartir enlace"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.borderedProminent).tint(Theme.accent).foregroundStyle(.white)
                        .accessibilityIdentifier("land-share-link")
                    HStack {
                        Button(L.t("Update name", "Actualizar nombre")) { publish() }.disabled(sync.busy)
                            .accessibilityIdentifier("land-update-name")
                        Spacer()
                        Button(L.t("Make private", "Hacer privada"), role: .destructive) { unpublish() }.disabled(sync.busy)
                            .accessibilityIdentifier("land-make-private")
                    }.font(.system(size: 14)).frame(minHeight: 44)
                } else {
                    Button(L.t("Save name privately", "Guardar nombre en privado")) {
                        Task {
                            if await sync.mutate(.renamePrivate(title: shareTitle.trimmingCharacters(in: .whitespacesAndNewlines))) != nil { shareOpen = false }
                        }
                    }.frame(maxWidth: .infinity, minHeight: 44).disabled(sync.busy || sync.world == nil)
                        .accessibilityIdentifier("land-save-name")
                    Button { publish() } label: { Label(L.t("Publish island", "Publicar isla"), systemImage: "globe").frame(maxWidth: .infinity, minHeight: 44) }
                        .buttonStyle(.borderedProminent).tint(Theme.accent).foregroundStyle(.white).disabled(sync.busy || sync.world == nil)
                        .accessibilityIdentifier("land-publish")
                }
                Button {
                    shareOpen = false
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { openArchipelago() }
                } label: { Label(L.t("Explore the archipelago", "Explorar el archipiélago"), systemImage: "circle.hexagongrid").frame(maxWidth: .infinity, minHeight: 44) }
                    .foregroundStyle(Theme.accentSoft).accessibilityIdentifier("land-share-archipelago")
                if let error = sync.error { Text(error).font(.footnote).foregroundStyle(Theme.down) }
            }.padding(22)
        }.background(Theme.bg.ignoresSafeArea()).foregroundStyle(Theme.text).tint(Theme.accentSoft)
    }

    private func publish() {
        Task {
            guard let world = await sync.mutate(.publish(title: shareTitle.trimmingCharacters(in: .whitespacesAndNewlines))), world.share?.public == true else { return }
            notice = L.t("Your island is public. Share the link.", "Tu isla es pública. Comparte el enlace.")
            sound.play("placement_confirm")
        }
    }

    private func unpublish() {
        Task {
            guard await sync.mutate(.unpublish) != nil else { return }
            notice = L.t("Your island is private again.", "Tu isla vuelve a ser privada.")
        }
    }

    private func commitRemote(_ action: TraderLandMutation, inverse: TraderLandMutation?, addedInventoryID: String? = nil) {
        let before = sync.world.map { ($0.land.size, $0.core) }
        Task {
            guard let result = await sync.mutate(action) else { return }
            remoteUndo = inverse
            if let addedInventoryID, let placed = result.placements.first(where: { $0.inventory_id == addedInventoryID }) {
                remoteUndo = .remove(placementID: placed.id)
            }
            // A growth step shifted every cell (and a core move changes what is free): no stale inverse.
            if let before, before.0 != result.land.size || before.1 != result.core { remoteUndo = nil }
            draft = nil; selectedPlacementId = nil; selectedItemId = nil; collectionOpen = true
            if let grew = result.grew {
                notice = LandIslandStatus.grewNotice(grew)
                sound.play("fog_reveal"); UINotificationFeedbackGenerator().notificationOccurred(.success)
                return
            }
            notice = result.coreMoved != nil ? L.t("Aura Core moved.", "Núcleo de Aura movido.") : L.t("Island saved to your account.", "Isla guardada en tu cuenta.")
            sound.play("placement_confirm"); UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
    private func restore() { guard !accountIsland else { return }; checkpoint(); placements = fixture.placements; focusLevel = fixture.focusLevel; draft = nil; selectedPlacementId = nil; selectedItemId = nil; save(); notice = L.t("Trader Land restored.", "Trader Land restaurado."); help = false }
    private func reveal() { guard !accountIsland, focusLevel < 2 else { return }; checkpoint(); focusLevel = 2; save(); sound.play("fog_reveal"); notice = L.t("Full island revealed.", "Isla completa revelada."); help = false }
        private func save() { guard !accountIsland else { return }; if let data = try? JSONEncoder().encode(SavedWorld(placements: placements, focusLevel: focusLevel)) { UserDefaults.standard.set(data, forKey: Self.storageKey) } }
    private static func load() -> SavedWorld? {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let saved = try? JSONDecoder().decode(SavedWorld.self, from: data) else { return nil }
        let items = Dictionary(uniqueKeysWithValues: RuntimeBundle.manifest.items.map { ($0.id, $0) })
        var occupied = practiceCore.cells
        var ids = Set<String>()
        let clean = saved.placements.filter { placement in
            guard !ids.contains(placement.uid), let item = items[placement.itemId], item.kind != "core" else { return false }
            let cells = landCells(item, placement)
            guard cells.allSatisfy({ key in
                let xy = key.split(separator: ":").compactMap { Int($0) }
                return xy.count == 2 && GateLayout.practice.contains(col: xy[0], row: xy[1]) && !occupied.contains(key)
            }) else { return false }
            occupied.formUnion(cells); ids.insert(placement.uid); return true
        }
        return SavedWorld(placements: clean, focusLevel: min(2, max(1, saved.focusLevel)))
    }
}
