import AVFoundation
import CoreImage
import SwiftUI
import UIKit

private enum LandOrientation: String, Codable { case neSW = "ne_sw", nwSE = "nw_se" }
private enum Connector: String, Codable, Hashable { case NE, SE, SW, NW }

private struct Footprint: Codable { let cols: Int; let rows: Int }
private func landFootprint(_ item: ManifestItem, _ orientation: LandOrientation?) -> Footprint {
    orientation == .nwSE ? Footprint(cols: item.footprint.rows, rows: item.footprint.cols) : item.footprint
}
private func landCells(_ item: ManifestItem, _ placement: LandPlacement) -> Set<String> {
    let size = landFootprint(item, placement.orientation)
    return Set((0..<size.cols).flatMap { x in (0..<size.rows).map { y in "\(placement.col + x):\(placement.row + y)" } })
}
/// Spanish display names for the bundled pieces and districts. The English
/// side is still derived from the id, so English copy is unchanged; an id
/// missing here falls back to that English name.
private let landNamesES: [String: String] = [
    "aura_core": "Núcleo de Aura",
    "crypto_bay_data_dock": "Muelle de Datos",
    "crypto_bay_water_walkway": "Pasarela de Agua",
    "crypto_bay_context_buoy": "Boya de Contexto",
    "crypto_bay_candle_tower": "Torre de Velas",
    "crypto_bay_waiting_lighthouse": "Faro de la Espera",
    "evidence_mines_crystal_vein_rock": "Roca con Veta de Cristal",
    "evidence_mines_open_tunnel": "Túnel Abierto",
    "evidence_mines_lantern_drone": "Dron Linterna",
    "evidence_mines_evidence_workshop": "Taller de Evidencia",
    "evidence_mines_mother_crystal": "Cristal Madre",
    "thesis_citadel_wall_slab": "Losa de Muralla",
    "thesis_citadel_fortified_ramp": "Rampa Fortificada",
    "thesis_citadel_risk_shield": "Escudo de Riesgo",
    "thesis_citadel_double_gate": "Puerta Doble",
    "thesis_citadel_three_gate_citadel": "Ciudadela de Tres Puertas",
    "risk_reef_reef_tile": "Loseta de Arrecife",
    "risk_reef_blue_sluice": "Compuerta Azul",
    "risk_reef_dual_orbit_antenna": "Antena de Doble Órbita",
    "risk_reef_red_team_observatory": "Observatorio del Crítico",
    "risk_reef_double_bridge": "Puente Doble",
    "axiom_archive_archive_ring_tile": "Loseta del Anillo",
    "axiom_archive_path_straight": "Camino Recto",
    "axiom_archive_return_path_curve": "Curva de Regreso",
    "axiom_archive_aura_flower": "Flor de Aura",
    "axiom_archive_lit_archive": "Archivo Iluminado",
    "axiom_archive_base_ring_seal": "Sello del Anillo Base",
]
private let districtNamesES: [String: String] = [
    "crypto_bay": "Bahía Cripto",
    "evidence_mines": "Minas de Evidencia",
    "thesis_citadel": "Ciudadela de Tesis",
    "risk_reef": "Arrecife de Riesgo",
    "axiom_archive": "Archivo de Axiomas",
]
private func landName(_ item: ManifestItem) -> String {
    let en = item.id.replacingOccurrences(of: item.district + "_", with: "").replacingOccurrences(of: "_", with: " ").capitalized
    return L.t(en, landNamesES[item.id] ?? en)
}
private func districtName(_ id: String) -> String {
    let en = id.replacingOccurrences(of: "_", with: " ").capitalized
    return L.t(en, districtNamesES[id] ?? en)
}
/// Server direction values ("long"/"short") in the reader's language; English keeps the raw value.
private func landDirection(_ raw: String) -> String {
    L.t(raw, raw == "long" ? "alcista" : raw == "short" ? "bajista" : raw)
}
private enum LandImageCache {
    static let images = NSCache<NSString, UIImage>()
    static let context = CIContext(options: nil)
    static func image(_ path: String) -> UIImage? {
        if let cached = images.object(forKey: path as NSString) { return cached }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path), let image = UIImage(contentsOfFile: url.path) else { return nil }
        images.setObject(image, forKey: path as NSString); return image
    }
}
private struct ArtVariant: Codable { let url: String; let w: Int; let h: Int; let method: String? }
private struct ArtState: Codable {
    let contentBounds: [CGFloat]
    let anchor: [CGFloat]
    let variants: [String: ArtVariant]
    let derivedSeed: ArtVariant?
    enum CodingKeys: String, CodingKey { case contentBounds, anchor, variants; case derivedSeed = "derived_seed" }
}
private struct ArtOrientation: Codable { let states: [String: ArtState] }
private struct CoreAnimationLayers: Codable {
    let layers: [String: ArtVariant]
    let sphereCentre: [CGFloat]
    let sphereRadius: CGFloat
    enum CodingKeys: String, CodingKey { case layers, sphereRadius = "sphere_radius", sphereCentre = "sphere_centre" }
}
private struct ManifestItem: Codable, Identifiable {
    let id: String
    let district: String
    let kind: String
    let footprint: Footprint
    let orientations: [String: ArtOrientation]
    let animationLayers: CoreAnimationLayers?

    enum CodingKeys: String, CodingKey {
        case id, district, kind, footprint, orientations
        case animationLayers = "animation_layers"
    }

    var artState: ArtState? {
        guard let orientation = orientations.values.first else { return nil }
        return orientation.states["stage1"] ?? orientation.states["bloom"] ?? orientation.states.values.first
    }
}
private struct AssetManifest: Codable { let items: [ManifestItem] }

private struct LandPlacement: Codable, Identifiable, Equatable {
    let uid: String
    let itemId: String
    let col: Int
    let row: Int
    let orientation: LandOrientation?
    var id: String { uid }
}
private struct CorePlacement: Codable { let itemId: String; let col: Int; let row: Int }
private struct WorldFixture: Codable {
    let version: Int
    let gridSize: Int
    let focusLevel: Int
    let core: CorePlacement
    let placements: [LandPlacement]
    let expectedPathConnectors: [String: [Connector]]
}
private struct SavedWorld: Codable { let placements: [LandPlacement]; let focusLevel: Int }

private enum RuntimeBundle {
    static let manifest: AssetManifest = decode(path: "gate-A/asset-manifest.json")
    static let fixture: WorldFixture = decode(path: "world-snapshot-v01.json")

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

private enum GateLayout {
    static let tileWidth: CGFloat = 92
    static let tileHeight: CGFloat = 46
    static let origin = CGPoint(x: 430, y: 230)
    static let canvas = CGSize(width: 860, height: 720)

    static func iso(column: CGFloat, row: CGFloat) -> CGPoint {
        CGPoint(x: origin.x + (column - row) * tileWidth / 2,
                y: origin.y + (column + row) * tileHeight / 2)
    }
}

private struct Diamond: Shape {
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
                RoundedRectangle(cornerRadius: 8).fill(.red.opacity(0.35)).overlay(Text(L.t("Missing", "Sin imagen")).font(.caption2))
            }
        }
    }
}

private struct LuminanceBundleImage: View {
    let path: String
    let glow: Bool

    private var image: UIImage? {
        let cacheKey = "\(path)-\(glow)" as NSString
        if let cached = LandImageCache.images.object(forKey: cacheKey) { return cached }
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path), let input = CIImage(contentsOf: url) else { return nil }
        let filterName = glow ? "CIColorMatrix" : "CIMaskToAlpha"
        guard let filter = CIFilter(name: filterName) else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        if glow {
            filter.setValue(CIVector(x: 1, y: 0, z: 0, w: 0), forKey: "inputRVector")
            filter.setValue(CIVector(x: 0, y: 1, z: 0, w: 0), forKey: "inputGVector")
            filter.setValue(CIVector(x: 0, y: 0, z: 1, w: 0), forKey: "inputBVector")
            filter.setValue(CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0), forKey: "inputAVector")
        }
        guard let output = filter.outputImage,
              let cgImage = LandImageCache.context.createCGImage(output, from: output.extent) else { return nil }
        let image = UIImage(cgImage: cgImage)
        LandImageCache.images.setObject(image, forKey: cacheKey)
        return image
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .renderingMode(glow ? .original : .template)
                    .foregroundStyle(glow ? .white : .black)
                    .scaledToFit()
                    .blendMode(glow ? .screen : .normal)
                    .opacity(glow ? 1 : 0.55)
            }
        }
    }
}

private struct LayeredManifestImage: View {
    let item: ManifestItem
    let seed: Bool

    var body: some View {
        if let state = item.artState,
           let bloom = state.variants["albedo_512"] ?? state.variants["albedo_1024"] {
            let albedo = seed ? (state.derivedSeed ?? bloom) : bloom
            ZStack {
                if let shadow = state.variants["shadow_1024"] {
                    LuminanceBundleImage(path: RuntimeBundle.bundlePath(shadow.url), glow: false)
                }
                GateBundleImage(path: RuntimeBundle.bundlePath(albedo.url))
                if !seed, let glow = state.variants["glow_1024"] {
                    LuminanceBundleImage(path: RuntimeBundle.bundlePath(glow.url), glow: true)
                }
            }
        }
    }
}

private struct AnimatedAuraCore: View {
    let item: ManifestItem
    let seed: Bool
    let pulse: Int
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floating = false
    @State private var orbiting = false

    var body: some View {
        if seed || item.animationLayers == nil {
            LayeredManifestImage(item: item, seed: seed)
        } else if let animation = item.animationLayers, let state = item.artState {
            ZStack {
                if let shadow = state.variants["shadow_1024"] { LuminanceBundleImage(path: RuntimeBundle.bundlePath(shadow.url), glow: false) }
                layer("body", animation)
                layer("ring_back", animation).scaleEffect(x: floating ? 1.014 : 0.986, y: floating ? 0.99 : 1.01, anchor: .init(x: 0.5, y: 0.3223)).opacity(floating ? 1 : 0.78)
                layer("sphere", animation).offset(y: reduceMotion ? 0 : (floating ? 7 : -7)).shadow(color: .mint.opacity(0.65), radius: 8)
                layer("ring_front", animation).scaleEffect(x: floating ? 0.99 : 1.01, y: floating ? 1.012 : 0.99, anchor: .init(x: 0.5, y: 0.3223))
                if let glow = state.variants["glow_1024"] { LuminanceBundleImage(path: RuntimeBundle.bundlePath(glow.url), glow: true) }
                ForEach(0..<7, id: \.self) { index in
                    Circle().fill(.mint.opacity(index.isMultiple(of: 3) ? 0.95 : 0.62))
                        .frame(width: index.isMultiple(of: 3) ? 5 : 3, height: index.isMultiple(of: 3) ? 5 : 3)
                        .shadow(color: .mint, radius: 4)
                        .offset(x: CGFloat(42 + index * 4))
                        .rotationEffect(.degrees((orbiting ? 360 : 0) + Double(index * 51)), anchor: .center)
                        .position(x: 0.498 * 360, y: 0.3223 * 360)
                }
            }
            .id(pulse)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 7).repeatForever(autoreverses: true)) { floating = true }
                withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) { orbiting = true }
            }
        }
    }

    @ViewBuilder private func layer(_ name: String, _ animation: CoreAnimationLayers) -> some View {
        if let variant = animation.layers[name] { GateBundleImage(path: RuntimeBundle.bundlePath(variant.url)) }
    }
}

private struct ProceduralFilament: View {
    let connectors: Set<Connector>
    let dimmed: Bool

    var body: some View {
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let points: [Connector: CGPoint] = [
                .NE: CGPoint(x: size.width * 0.75, y: size.height * 0.25), .SE: CGPoint(x: size.width * 0.75, y: size.height * 0.75),
                .SW: CGPoint(x: size.width * 0.25, y: size.height * 0.75), .NW: CGPoint(x: size.width * 0.25, y: size.height * 0.25),
            ]
            for connector in connectors {
                guard let end = points[connector] else { continue }
                var line = Path(); line.move(to: center); line.addLine(to: end)
                context.stroke(line, with: .color(Color(red: 0.38, green: 1, blue: 0.77).opacity(dimmed ? 0.15 : 0.95)), lineWidth: dimmed ? 2 : 4)
            }
            context.fill(Path(ellipseIn: CGRect(x: center.x - 4, y: center.y - 4, width: 8, height: 8)), with: .color(.mint.opacity(dimmed ? 0.15 : 1)))
        }
        .frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
    }
}

private struct GateCanvas: View {
    let manifest: AssetManifest
    let fixture: WorldFixture
    let placements: [LandPlacement]
    let focusLevel: Int
    let seed: Bool
    let corePulse: Int
    let draft: LandPlacement?
    let draftValid: Bool
    let selectedID: String?
    let place: (Int, Int) -> Void

    private var items: [String: ManifestItem] { Dictionary(uniqueKeysWithValues: manifest.items.map { ($0.id, $0) }) }
    private func revealed(_ col: Int, _ row: Int) -> Bool {
        max(abs(CGFloat(col) - 3.5), abs(CGFloat(row) - 3.5)) <= CGFloat(focusLevel) + 1.5
    }
    private func connectors(for placement: LandPlacement) -> Set<Connector> {
        let pathCells = Set(placements.filter { items[$0.itemId]?.kind == "path_pavement" }.map { "\($0.col):\($0.row)" })
        var result = Set<Connector>()
        if pathCells.contains("\(placement.col):\(placement.row - 1)") { result.insert(.NE) }
        if pathCells.contains("\(placement.col + 1):\(placement.row)") { result.insert(.SE) }
        if pathCells.contains("\(placement.col):\(placement.row + 1)") { result.insert(.SW) }
        if pathCells.contains("\(placement.col - 1):\(placement.row)") { result.insert(.NW) }
        if result.isEmpty { result = placement.orientation == .nwSE ? [.NW, .SE] : [.NE, .SW] }
        return result
    }

    var body: some View {
        ZStack(alignment: .topLeading) {

            ForEach(0..<(fixture.gridSize * fixture.gridSize), id: \.self) { index in
                let col = index % fixture.gridSize, row = index / fixture.gridSize
                Button { place(col, row) } label: {
                    Diamond().fill(Color(red: 0.08, green: 0.16, blue: 0.19).opacity((col + row).isMultiple(of: 2) ? 0.82 : 0.68))
                        .overlay(Diamond().stroke(Color.mint.opacity(draft == nil ? 0.12 : 0.36), lineWidth: draft == nil ? 0.8 : 1.4))
                }
                .buttonStyle(.plain).frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
                .position(GateLayout.iso(column: CGFloat(col), row: CGFloat(row)))
                .accessibilityLabel(L.t("Tile \(col + 1), \(row + 1)", "Casilla \(col + 1), \(row + 1)"))
                .accessibilityIdentifier("land-tile-\(col)-\(row)")
            }
            ForEach(placements.filter { $0.uid != draft?.uid }) { placement in
                if let item = items[placement.itemId] { sprite(item: item, placement: placement) }
            }
            if let core = items[fixture.core.itemId] {
                sprite(item: core, placement: .init(uid: "aura-core", itemId: core.id, col: fixture.core.col, row: fixture.core.row, orientation: nil))
            }
            if let draft, let item = items[draft.itemId] {
                sprite(item: item, placement: draft).opacity(0.78).zIndex(900)
                ForEach(Array(landCells(item, draft)).sorted(), id: \.self) { key in
                    let parts = key.split(separator: ":").compactMap { Int($0) }
                    if parts.count == 2 {
                        Diamond().fill(draftValid ? Color.mint.opacity(0.23) : Color.red.opacity(0.3))
                            .overlay(Diamond().stroke(draftValid ? Color.mint : Color.red, lineWidth: 2))
                            .frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
                            .position(GateLayout.iso(column: CGFloat(parts[0]), row: CGFloat(parts[1])))
                            .zIndex(950).allowsHitTesting(false)
                    }
                }
            }
            ForEach(0..<(fixture.gridSize * fixture.gridSize), id: \.self) { index in
                let col = index % fixture.gridSize, row = index / fixture.gridSize
                if !revealed(col, row) {
                    Diamond().fill(Color(red: 0.02, green: 0.05, blue: 0.08).opacity(0.78))
                        .frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
                        .position(GateLayout.iso(column: CGFloat(col), row: CGFloat(row))).zIndex(700)
                        .allowsHitTesting(false)
                }
            }
        }
        .frame(width: GateLayout.canvas.width, height: GateLayout.canvas.height).clipped()
    }

    @ViewBuilder private func sprite(item: ManifestItem, placement: LandPlacement) -> some View {
        if let state = item.artState {
            let footprint = landFootprint(item, placement.orientation)
            let center = GateLayout.iso(column: CGFloat(placement.col) + CGFloat(footprint.cols - 1) / 2,
                                        row: CGFloat(placement.row) + CGFloat(footprint.rows - 1) / 2)
            let visibleWidth = max(0.2, state.contentBounds[2] - state.contentBounds[0])
            let footprintWidth = GateLayout.tileWidth * CGFloat(item.footprint.cols + item.footprint.rows) / 2
            let size = min(360, footprintWidth * 0.9 / visibleWidth)
            Group {
                if item.kind == "core" { AnimatedAuraCore(item: item, seed: seed, pulse: corePulse) }
                else { LayeredManifestImage(item: item, seed: seed).scaleEffect(x: placement.orientation == .nwSE ? -1 : 1, y: 1) }
            }
                .frame(width: size, height: size)
                .shadow(color: selectedID == placement.uid ? Color.yellow.opacity(0.7) : .clear, radius: 8)
                .position(x: center.x, y: center.y + size * (0.5 - state.anchor[1]))
                .zIndex(100 + center.y).allowsHitTesting(false).accessibilityHidden(true)
            if item.kind == "path_pavement" {
                let active = connectors(for: placement)
                ProceduralFilament(connectors: active, dimmed: seed)
                    .position(center).zIndex(101 + center.y).allowsHitTesting(false)
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
    private let manifest = RuntimeBundle.manifest
    private let fixture = RuntimeBundle.fixture
    private let districts = ["crypto_bay", "evidence_mines", "thesis_citadel", "risk_reef", "axiom_archive"]
    private let mint = Color(red: 0.72, green: 0.96, blue: 0.78)
    private let ink = Color(red: 0.035, green: 0.085, blue: 0.065)
    @Environment(\.dismiss) private var dismiss
    @Environment(\.scenePhase) private var scenePhase
    @State private var placements: [LandPlacement]
    @State private var focusLevel: Int
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
    @ObservedObject private var account = AccountSession.shared
    @State private var remoteUndo: TraderLandMutation?
    @State private var shareOpen = false
    @State private var shareTitle = ""

    private var previewOnly: Bool {
#if DEBUG
        ProcessInfo.processInfo.arguments.contains("-trader-land-gate")
#else
        false
#endif
    }
    private var accountIsland: Bool { !previewOnly && account.isSignedIn }
    private var editsDisabled: Bool { accountIsland && (sync.busy || sync.world == nil || sync.error != nil) }
    private var canUndo: Bool { accountIsland ? remoteUndo != nil && !editsDisabled : !history.isEmpty }
    private func availableInventory(_ itemID: String) -> TraderLandWorld.Inventory? {
        sync.world?.inventory.first { $0.item_id == itemID && $0.state == "bloomed" && !$0.placed }
    }
    private func collectionState(_ item: ManifestItem) -> String {
        guard accountIsland else { return "\(item.footprint.cols) × \(item.footprint.rows)" }
        if availableInventory(item.id) != nil { return L.t("Ready to build", "Lista para construir") }
        if sync.world?.inventory.contains(where: { $0.item_id == item.id && $0.placed }) == true { return L.t("On your island", "En tu isla") }
        if sync.world?.inventory.contains(where: { $0.item_id == item.id && $0.state == "seed" }) == true { return L.t("Seed · growing", "Semilla · creciendo") }
        return L.t("Not earned yet", "Por desbloquear")
    }

    init() {
        let fixture = RuntimeBundle.fixture
        let saved = Self.load() ?? SavedWorld(placements: fixture.placements, focusLevel: fixture.focusLevel)
        var signedIn = AccountSession.shared.isSignedIn
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-trader-land-gate") { signedIn = false }
#endif
        _placements = State(initialValue: signedIn ? [] : saved.placements)
        _focusLevel = State(initialValue: signedIn ? 2 : saved.focusLevel)
    }

    private var items: [String: ManifestItem] { Dictionary(uniqueKeysWithValues: manifest.items.map { ($0.id, $0) }) }
    private var selectedItem: ManifestItem? { selectedItemId.flatMap { items[$0] } }
    private var occupied: Set<String> {
        var cells: Set<String> = ["3:3", "3:4", "4:3", "4:4"]
        for placement in placements where placement.uid != draft?.uid {
            if let item = items[placement.itemId] { cells.formUnion(landCells(item, placement)) }
        }
        return cells
    }
    private func revealed(_ col: Int, _ row: Int) -> Bool {
        max(abs(CGFloat(col) - 3.5), abs(CGFloat(row) - 3.5)) <= CGFloat(focusLevel) + 1.5
    }
    private var validDraft: Bool {
        guard let draft, let item = items[draft.itemId] else { return false }
        return landCells(item, draft).allSatisfy { key in
            let c = key.split(separator: ":").compactMap { Int($0) }
            return c.count == 2 && c[0] >= 0 && c[1] >= 0 && c[0] < 8 && c[1] < 8 && revealed(c[0], c[1]) && !occupied.contains(key)
        }
    }

    var body: some View {
        GeometryReader { root in
            VStack(spacing: 0) {
                header
                map.frame(maxWidth: .infinity, maxHeight: .infinity)
                collection(maxHeight: root.size.height * 0.39)
            }
            .background(ink.ignoresSafeArea()).foregroundStyle(Color(red: 0.9, green: 0.95, blue: 0.91))
            .onChange(of: scenePhase) { _, phase in if phase != .active { sound.stop() } }
            .onDisappear { sound.stop() }
            .onChange(of: handleDragging) { _, active in if !active { handleOrigin = nil } }
            .task(id: previewOnly ? "practice" : account.session?.userId ?? "guest") {
                sync.reset(); draft = nil; remoteUndo = nil; history = []; selectedItemId = nil; selectedPlacementId = nil; notice = ""
                if accountIsland {
                    placements = []; focusLevel = 2
                    await sync.load()
                } else {
                    let saved = Self.load() ?? SavedWorld(placements: fixture.placements, focusLevel: fixture.focusLevel)
                    placements = saved.placements; focusLevel = saved.focusLevel
                }
            }
            .onReceive(sync.$world) { world in
                guard accountIsland, let world else { return }
                placements = world.placements.compactMap { placement in
                    guard let inventory = world.inventory.first(where: { $0.id == placement.inventory_id }) else { return nil }
                    return LandPlacement(uid: placement.id, itemId: inventory.item_id, col: placement.x, row: placement.y, orientation: placement.rotation == 90 || placement.rotation == 270 ? .nwSE : .neSW)
                }
                focusLevel = 2
            }
            .sheet(isPresented: $help) { helpSheet.presentationDetents([.medium]).presentationDragIndicator(.visible) }
            .sheet(isPresented: $shareOpen) { shareSheet.presentationDetents([.medium, .large]).presentationDragIndicator(.visible) }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            icon("arrow.left", label: L.t("Back to desk", "Volver a la mesa")) { dismiss() }
            VStack(alignment: .leading, spacing: 3) {
                Text(L.t("BOBBY WORLD", "MUNDO BOBBY")).font(.system(size: 9, weight: .medium, design: .monospaced)).tracking(2).foregroundStyle(mint.opacity(0.6))
                Text("Trader Land").font(.system(size: 23, weight: .semibold, design: .rounded)).tracking(-1)
            }
            Spacer(minLength: 0)
            icon(sound.enabled ? "speaker.wave.2" : "speaker.slash", label: L.t("Toggle sound", "Activar o silenciar sonido")) { sound.toggle() }
                .accessibilityIdentifier("land-sound-toggle")
            if accountIsland {
                icon(sync.world?.share?.public == true ? "globe" : "square.and.arrow.up", label: L.t("Share your island", "Compartir tu isla")) {
                    shareTitle = sync.world?.share?.title ?? ""; shareOpen = true
                }.accessibilityIdentifier("land-share")
            }
            icon("questionmark.circle", label: L.t("How to play", "Cómo jugar")) { help = true }
        }.padding(.horizontal, 12).padding(.vertical, 10)
            .background(ink).overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.08)).frame(height: 1) }
    }

    private var map: some View {
        GeometryReader { proxy in
            let fit = min(proxy.size.width / 830, proxy.size.height / 640)
            let scale = fit * zoom
            ZStack {
                RadialGradient(colors: [Color(red: 0.13, green: 0.24, blue: 0.16), ink], center: .center, startRadius: 10, endRadius: 420)
                GateCanvas(manifest: manifest, fixture: fixture, placements: placements, focusLevel: focusLevel, seed: false, corePulse: 0, draft: draft, draftValid: validDraft, selectedID: selectedPlacementId, place: choose)
                    .scaleEffect(scale)
                    .position(x: proxy.size.width / 2 + pan.width, y: proxy.size.height / 2 + pan.height + 25 * scale)
                LandGestureSurface(
                    tapped: { point in let cell = cellAt(point, size: proxy.size, scale: scale); choose(cell.0, cell.1) },
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
                                let cell = TraderLandGeometry.draggedPosition(col: origin.col, row: origin.row, translation: translation, scale: scale)
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
                            zoom = min(2.6, max(0.7, pinchZoom * value))
                            pan = boundedPan(CGSize(width: point.x - proxy.size.width / 2 - pinchAnchor.x * zoom, height: point.y - proxy.size.height / 2 - pinchAnchor.y * zoom), size: proxy.size)
                        }
                    }
                ).accessibilityHidden(true)
                if let draft, let item = items[draft.itemId] {
                    let area = landFootprint(item, draft.orientation)
                    let center = GateLayout.iso(column: CGFloat(draft.col) + CGFloat(area.cols - 1) / 2, row: CGFloat(draft.row) + CGFloat(area.rows - 1) / 2)
                    Image(systemName: "arrow.up.and.down.and.arrow.left.and.right")
                        .font(.system(size: 18, weight: .semibold)).foregroundStyle(ink)
                        .frame(width: 44, height: 44).background(mint, in: Circle())
                        .overlay(Circle().stroke(.white.opacity(0.7))).shadow(color: .black.opacity(0.4), radius: 8, y: 3)
                        .contentShape(Circle())
                        .gesture(DragGesture(minimumDistance: 4, coordinateSpace: .named("land-map"))
                            .updating($handleDragging) { _, state, _ in state = true }
                            .onChanged { value in
                                guard !editsDisabled else { return }
                                if handleOrigin == nil { handleOrigin = self.draft }
                                if let origin = handleOrigin {
                                    let cell = TraderLandGeometry.draggedPosition(col: origin.col, row: origin.row, translation: value.translation, scale: scale)
                                    self.draft = LandPlacement(uid: origin.uid, itemId: origin.itemId, col: cell.col, row: cell.row, orientation: origin.orientation)
                                }
                            }
                            .onEnded { value in
                                if !editsDisabled, let origin = handleOrigin {
                                    let cell = TraderLandGeometry.draggedPosition(col: origin.col, row: origin.row, translation: value.translation, scale: scale)
                                    self.draft = LandPlacement(uid: origin.uid, itemId: origin.itemId, col: cell.col, row: cell.row, orientation: origin.orientation)
                                }
                                handleOrigin = nil
                            })
                        .position(x: proxy.size.width / 2 + pan.width + (center.x - 430) * scale, y: proxy.size.height / 2 + pan.height + (center.y - 335) * scale + 28)
                        .accessibilityHidden(true)
                }
                VStack {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(L.t("FIRST LIGHT · ISLAND 01", "PRIMERA LUZ · ISLA 01")).font(.system(size: 9, weight: .medium, design: .monospaced)).tracking(1.6).foregroundStyle(mint.opacity(0.55))
                            Text(draft == nil ? L.t("A little world. All yours.", "Un pequeño mundo. Muy tuyo.") : L.t("Find its place.", "Encuentra su lugar."))
                                .font(.system(size: 21, weight: .medium, design: .rounded)).tracking(-0.6)
                            Text(draft == nil ? L.t("Drag to explore. Pinch to zoom.", "Arrastra para explorar. Pellizca para acercar.") : L.t("Tap a tile or drag the piece, then confirm.", "Toca una casilla o arrastra la pieza y confirma."))
                                .font(.system(size: 12)).foregroundStyle(mint.opacity(0.6)).fixedSize(horizontal: false, vertical: true)
                        }.allowsHitTesting(false)
                        Spacer(minLength: 14)
                        cameraControls
                    }.padding(16)
                    Spacer()
                    if accountIsland {
                        HStack(spacing: 10) {
                            if sync.busy { ProgressView().tint(mint) }
                            Text(sync.error ?? (sync.busy ? L.t("Syncing your island…", "Sincronizando tu isla…") : L.t("Account island · \(sync.world?.xp ?? 0) XP", "Isla de tu cuenta · \(sync.world?.xp ?? 0) XP")))
                                .font(.system(size: 12)).fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 0)
                            Button { draft = nil; remoteUndo = nil; Task { await sync.load() } } label: { Image(systemName: "arrow.clockwise").frame(width: 44, height: 44) }
                                .disabled(sync.busy).accessibilityLabel(L.t("Reload island", "Recargar isla"))
                        }.foregroundStyle(sync.error == nil ? mint : .orange).padding(.horizontal, 16).background(ink.opacity(0.9))
                    }
                    if !notice.isEmpty { Text(notice).font(.system(size: 12)).foregroundStyle(mint).padding(10).background(ink.opacity(0.9), in: Capsule()).padding(.horizontal, 16).accessibilityIdentifier("land-notice") }
                    if draft != nil { placementControls.padding(12) }
                    else {
                        HStack {
                            Text(L.t("FOCUS \(focusLevel)/2 · \(placements.count + 1) PLACED", "ENFOQUE \(focusLevel)/2 · \(placements.count + 1) COLOCADAS"))
                                .font(.system(size: 10, weight: .medium, design: .monospaced)).foregroundStyle(mint.opacity(0.6))
                                .accessibilityIdentifier("land-fixed-status")
                            Spacer()
                            Button(action: undo) { Label(L.t("Undo", "Deshacer"), systemImage: "arrow.uturn.backward").font(.system(size: 13)).frame(minHeight: 44) }
                                .disabled(!canUndo).foregroundStyle(mint).opacity(canUndo ? 1 : 0.3).accessibilityIdentifier("land-undo")
                        }.padding(.horizontal, 20).padding(.bottom, 8)
                    }
                }
            }.coordinateSpace(name: "land-map").clipped()
        }
    }

    private var cameraControls: some View {
        VStack(spacing: 0) {
            icon("minus", label: L.t("Zoom out", "Alejar")) { zoom = max(0.7, zoom / 1.2) }
            Button { resetView() } label: { Text("\(Int(zoom * 100))%").font(.system(size: 11, design: .monospaced)).frame(width: 44, height: 30) }.accessibilityLabel(L.t("Reset view", "Restablecer vista"))
            icon("plus", label: L.t("Zoom in", "Acercar")) { zoom = min(2.6, zoom * 1.2) }
        }.background(ink.opacity(0.85), in: RoundedRectangle(cornerRadius: 13)).overlay(RoundedRectangle(cornerRadius: 13).stroke(mint.opacity(0.15)))
    }

    private var placementControls: some View {
        HStack(spacing: 6) {
            Image(systemName: validDraft ? "checkmark" : "xmark").font(.system(size: 13, weight: .semibold))
            VStack(alignment: .leading, spacing: 3) {
                Text(validDraft ? L.t("Ready to place", "Lista para colocar") : L.t("Needs more room", "Necesita espacio")).font(.system(size: 12, weight: .medium))
                if let draft { Text("\(draft.col + 1) / \(draft.row + 1)").font(.system(size: 10, design: .monospaced)).opacity(0.5).accessibilityIdentifier("land-draft-coordinate") }
            }.frame(maxWidth: .infinity, alignment: .leading)
            icon("xmark", label: L.t("Cancel placement", "Cancelar colocación")) { draft = nil; collectionOpen = true }
                .disabled(accountIsland && sync.busy)
            icon("arrow.clockwise", label: L.t("Rotate piece", "Girar pieza"), action: rotate).accessibilityIdentifier("land-rotate")
            Button(action: confirm) { Label(L.t("Place", "Colocar"), systemImage: "checkmark").font(.system(size: 13, weight: .semibold)).padding(.horizontal, 13).frame(height: 44).background(mint, in: RoundedRectangle(cornerRadius: 11)).foregroundStyle(ink) }
                .disabled(!validDraft || editsDisabled).opacity(validDraft && !editsDisabled ? 1 : 0.35).accessibilityIdentifier("land-confirm")
        }.foregroundStyle(validDraft ? mint : Color(red: 1, green: 0.72, blue: 0.75))
            .padding(9).background(ink.opacity(0.97), in: RoundedRectangle(cornerRadius: 17))
            .overlay(RoundedRectangle(cornerRadius: 17).stroke(mint.opacity(0.22)))
    }

    private func collection(maxHeight: CGFloat) -> some View {
        VStack(spacing: 0) {
            Button { collectionOpen.toggle() } label: {
                HStack {
                    Image(systemName: "square.3.layers.3d")
                    Text(L.t("Your collection", "Tu colección")).font(.system(size: 16, weight: .medium))
                    Text("\(accountIsland ? sync.world?.inventory.count ?? 0 : manifest.items.count - 1)").font(.system(size: 11, design: .monospaced)).padding(5).background(mint.opacity(0.1), in: RoundedRectangle(cornerRadius: 5))
                    Spacer()
                    Image(systemName: collectionOpen ? "chevron.down" : "chevron.up").font(.system(size: 13))
                }.frame(minHeight: 50).padding(.horizontal, 18)
            }.buttonStyle(.plain).accessibilityIdentifier("land-collection-toggle")
            if collectionOpen {
                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        if accountIsland { reviewSection }
                        HStack(spacing: 6) {
                            ForEach(Array(districts.enumerated()), id: \.element) { index, value in
                                Button { district = value; selectedItemId = nil; selectedPlacementId = nil } label: {
                                    Text("0\(index + 1) ·").font(.system(size: 12, weight: .medium, design: .monospaced)).frame(maxWidth: .infinity).frame(height: 36)
                                        .foregroundStyle(district == value ? mint : mint.opacity(0.4))
                                        .background(district == value ? mint.opacity(0.08) : ink.opacity(0.6), in: RoundedRectangle(cornerRadius: 9))
                                        .overlay(RoundedRectangle(cornerRadius: 9).stroke(district == value ? mint.opacity(0.8) : mint.opacity(0.12)))
                                }.buttonStyle(.plain).accessibilityIdentifier("land-district-\(value)")
                            }
                        }
                        Text(districtName(district)).font(.system(size: 14, weight: .medium))
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(manifest.items.filter { $0.district == district }) { item in
                                    Button { selectedItemId = item.id; selectedPlacementId = nil; sound.play("placement_tick") } label: {
                                        VStack(spacing: 3) {
                                            if let state = item.artState, let thumb = state.variants["thumb_256"] { GateBundleImage(path: RuntimeBundle.bundlePath(thumb.url)).frame(width: 84, height: 65) }
                                            Text(landName(item)).font(.system(size: 11, weight: .medium)).lineLimit(2).multilineTextAlignment(.center).frame(height: 29)
                                            Text(collectionState(item)).font(.system(size: 10, design: .monospaced)).foregroundStyle(mint.opacity(0.6)).lineLimit(2)
                                        }.frame(width: 94).padding(7).background(selectedItemId == item.id ? mint.opacity(0.1) : ink.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
                                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(selectedItemId == item.id ? Color.yellow.opacity(0.7) : mint.opacity(0.12)))
                                    }.buttonStyle(.plain).accessibilityIdentifier("blueprint-\(item.id)")
                                }
                            }
                        }
                        Text(accountIsland ? L.t("Earn seeds by completing readings. They bloom when you respect a no-trade decision or close a thesis.", "Gana semillas al completar lecturas. Florecen al respetar una decisión de no operar o cerrar una tesis.") : L.t("Practice island · saved on this device. Your earned collection stays separate.", "Isla de práctica · guardada en este dispositivo. Tu colección ganada se mantiene separada."))
                            .font(.system(size: 12)).foregroundStyle(mint.opacity(0.5)).fixedSize(horizontal: false, vertical: true)
                    }.padding(.horizontal, 16).padding(.bottom, 16)
                }.frame(maxHeight: maxHeight - 50 - (selectedItem == nil ? 0 : 80))
                if let item = selectedItem {
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(landName(item)).font(.system(size: 14, weight: .medium))
                            Text(selectedPlacementId == nil ? L.t("Blueprint", "Plano") : L.t("On your island", "En tu isla")).font(.system(size: 11)).foregroundStyle(mint.opacity(0.5))
                        }
                        Spacer(minLength: 0)
                        if selectedPlacementId != nil {
                            Button(L.t("Store", "Guardar"), action: store).font(.system(size: 12)).frame(minWidth: 44, minHeight: 44).disabled(editsDisabled).accessibilityIdentifier("land-store")
                        }
                        Button(action: startDraft) { Label(selectedPlacementId == nil ? L.t("Build", "Construir") : L.t("Move", "Mover"), systemImage: selectedPlacementId == nil ? "plus" : "arrow.up.and.down.and.arrow.left.and.right").font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(height: 44).background(mint, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(ink) }
                            .accessibilityIdentifier("land-build-or-move")
                            .disabled(editsDisabled || (accountIsland && selectedPlacementId == nil && availableInventory(item.id) == nil))
                    }.padding(12).background(ink.opacity(0.5), in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }.background(Color(red: 0.065, green: 0.12, blue: 0.095)).clipShape(UnevenRoundedRectangle(topLeadingRadius: 20, topTrailingRadius: 20))
            .disabled(accountIsland && sync.busy)
    }

    private var helpSheet: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(L.t("Make room for your ideas.", "Dale espacio a tus ideas.")).font(.title2.bold())
            Text(L.t("Choose a blueprint, tap Build, then pick a tile and confirm. Tap a built piece to move or store it. Drag the ground to explore and pinch to zoom.", "Elige un plano, toca Construir y selecciona una casilla antes de confirmar. Toca una pieza construida para moverla o guardarla. Arrastra el suelo para explorar y pellizca para acercar.")).font(.body).foregroundStyle(.secondary)
            if !accountIsland { HStack {
                Button(L.t("Reveal next focus ring", "Revelar el siguiente anillo"), action: reveal).disabled(focusLevel >= 2)
                Spacer()
                Button(L.t("Restore", "Restaurar"), action: restore)
            }.buttonStyle(.bordered).tint(mint) }
            Button(L.t("Done", "Listo")) { help = false }.buttonStyle(.borderedProminent).tint(mint).foregroundStyle(ink)
        }.padding(24).frame(maxHeight: .infinity).background(ink).preferredColorScheme(.dark)
    }

    private func icon(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol).font(.system(size: 17, weight: .regular)).frame(width: 44, height: 44) }.buttonStyle(.plain).accessibilityLabel(label)
    }
    private func boundedPan(_ value: CGSize, size: CGSize) -> CGSize {
        CGSize(width: min(size.width * 0.7, max(-size.width * 0.7, value.width)), height: min(size.height * 0.7, max(-size.height * 0.7, value.height)))
    }
    private func cellAt(_ point: CGPoint, size: CGSize, scale: CGFloat) -> (Int, Int) {
        let x = (point.x - size.width / 2 - pan.width) / scale + 430
        let y = (point.y - size.height / 2 - pan.height) / scale + 335
        let dx = (x - GateLayout.origin.x) / 46, dy = (y - GateLayout.origin.y) / 23
        return (Int(((dx + dy) / 2).rounded()), Int(((dy - dx) / 2).rounded()))
    }
    private func choose(_ col: Int, _ row: Int) {
        guard !editsDisabled, col >= 0, row >= 0, col < 8, row < 8 else { return }
        if let current = draft {
            draft = LandPlacement(uid: current.uid, itemId: current.itemId, col: col, row: row, orientation: current.orientation)
            return
        }
        let placement = placements.first { p in items[p.itemId].map { landCells($0, p).contains("\(col):\(row)") } ?? false }
        selectedPlacementId = placement?.uid; selectedItemId = placement?.itemId
        if let item = selectedItem { district = item.district; collectionOpen = true; sound.play("placement_tick") }
    }
    private func startDraft() {
        guard !editsDisabled, let item = selectedItem else { return }
        guard !accountIsland || selectedPlacementId != nil || availableInventory(item.id) != nil else { return }
        if let selectedPlacementId, let existing = placements.first(where: { $0.uid == selectedPlacementId }) { draft = existing }
        else {
            let candidates = (0..<64).map { (col: $0 % 8, row: $0 / 8) }.sorted { a, b in
                (a.col - 1) * (a.col - 1) + (a.row - 5) * (a.row - 5) < (b.col - 1) * (b.col - 1) + (b.row - 5) * (b.row - 5)
            }
            let cell = candidates.first { c in
                let area = LandPlacement(uid: "preview", itemId: item.id, col: c.col, row: c.row, orientation: .neSW)
                return c.col + item.footprint.cols <= 8 && c.row + item.footprint.rows <= 8 && landCells(item, area).allSatisfy { key in
                    let xy = key.split(separator: ":").compactMap { Int($0) }
                    return xy.count == 2 && revealed(xy[0], xy[1]) && !occupied.contains(key)
                }
            } ?? (col: 1, row: 5)
            draft = LandPlacement(uid: "\(item.id)-\(UUID().uuidString)", itemId: item.id, col: cell.col, row: cell.row, orientation: .neSW)
        }
        collectionOpen = false; notice = ""
    }
    private func rotate() {
        guard !editsDisabled, let current = draft else { return }
        draft = LandPlacement(uid: current.uid, itemId: current.itemId, col: current.col, row: current.row, orientation: current.orientation == .nwSE ? .neSW : .nwSE)
    }
    private func confirm() {
        guard !editsDisabled, validDraft, let current = draft else { return }
        if accountIsland {
            let rotation = current.orientation == .nwSE ? 90 : 0
            if let previous = sync.world?.placements.first(where: { $0.id == current.uid }) {
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
        guard !editsDisabled, let selectedPlacementId else { return }
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
    private static let worldsURL = site.appendingPathComponent("agentic-world/bobby/trader-land/worlds")
    private static func shareURL(_ code: String) -> URL { site.appendingPathComponent("trader-land/w/\(code)") }

    private var seeds: [TraderLandWorld.Inventory] {
        (sync.world?.inventory ?? []).filter { $0.state == "seed" && $0.review != nil }
            .sorted { ($0.review?.ready == true ? 0 : 1) < ($1.review?.ready == true ? 0 : 1) }
    }
    private var canClose: Bool { sync.world?.capabilities?.close == true && !editsDisabled && draft == nil }

    @ViewBuilder private var reviewSection: some View {
        if let season = sync.world?.season {
            HStack(spacing: 8) {
                Image(systemName: season.complete ? "checkmark.seal.fill" : "sparkles")
                Text(season.name.text).font(.system(size: 13, weight: .medium))
                Spacer(minLength: 0)
                Text("\(season.earned) / \(season.total)").font(.system(size: 12, design: .monospaced))
            }.foregroundStyle(mint).padding(10).background(mint.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .combine).accessibilityIdentifier("land-season")
        }
        if !seeds.isEmpty {
            Text(L.t("Theses to review", "Tesis por revisar")).font(.system(size: 14, weight: .medium))
            ForEach(seeds) { seed in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(itemName(seed.item_id)).font(.system(size: 13, weight: .medium))
                        Text(seedLine(seed.review!)).font(.system(size: 11)).foregroundStyle(mint.opacity(0.6)).fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    if seed.review?.ready == true {
                        Button { closeThesis(seed) } label: {
                            Text(L.t("Review", "Revisar")).font(.system(size: 13, weight: .semibold)).padding(.horizontal, 12).frame(height: 40)
                                .background(mint, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(ink)
                        }.disabled(!canClose).accessibilityIdentifier("land-review-\(seed.id)")
                    }
                }.padding(10).background(ink.opacity(0.7), in: RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private func itemName(_ itemID: String) -> String {
        manifest.items.first { $0.id == itemID }.map(landName) ?? itemID.replacingOccurrences(of: "_", with: " ").capitalized
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
        return VStack(alignment: .leading, spacing: 14) {
            Text(share?.public == true ? L.t("Your island is public.", "Tu isla es pública.") : L.t("Share your island.", "Comparte tu isla.")).font(.title2.bold())
            Text(L.t("A public island shows your pieces and districts to anyone with the link. Your XP, account and readings stay private.", "Una isla pública muestra tus piezas y distritos a quien tenga el enlace. Tu XP, cuenta y lecturas siguen siendo privadas."))
                .font(.subheadline).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            TextField(L.t("Island name (optional)", "Nombre de la isla (opcional)"), text: $shareTitle)
                .textFieldStyle(.roundedBorder).submitLabel(.done).onChange(of: shareTitle) { _, value in if value.count > 80 { shareTitle = String(value.prefix(80)) } }
            if share?.public == true, let code = share?.code {
                ShareLink(item: Self.shareURL(code)) { Label(L.t("Share link", "Compartir enlace"), systemImage: "square.and.arrow.up").frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(.borderedProminent).tint(mint).foregroundStyle(ink)
                HStack {
                    Button(L.t("Update name", "Actualizar nombre")) { publish() }.disabled(sync.busy)
                    Spacer()
                    Button(L.t("Make private", "Hacer privada"), role: .destructive) { unpublish() }.disabled(sync.busy)
                }.font(.system(size: 14)).frame(minHeight: 44)
            } else {
                Button { publish() } label: { Label(L.t("Publish island", "Publicar isla"), systemImage: "globe").frame(maxWidth: .infinity, minHeight: 44) }
                    .buttonStyle(.borderedProminent).tint(mint).foregroundStyle(ink).disabled(sync.busy || sync.world == nil)
            }
            Link(destination: Self.worldsURL) { Label(L.t("Visit other islands", "Visitar otras islas"), systemImage: "map").frame(maxWidth: .infinity, minHeight: 44) }
                .foregroundStyle(mint)
            if let error = sync.error { Text(error).font(.footnote).foregroundStyle(.orange) }
            Spacer(minLength: 0)
        }.padding(22).background(ink.ignoresSafeArea()).foregroundStyle(Color(red: 0.9, green: 0.95, blue: 0.91))
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
        Task {
            guard let result = await sync.mutate(action) else { return }
            remoteUndo = inverse
            if let addedInventoryID, let placed = result.placements.first(where: { $0.inventory_id == addedInventoryID }) {
                remoteUndo = .remove(placementID: placed.id)
            }
            draft = nil; selectedPlacementId = nil; selectedItemId = nil; collectionOpen = true
            notice = L.t("Island saved to your account.", "Isla guardada en tu cuenta.")
            sound.play("placement_confirm"); UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }
    private func restore() { guard !accountIsland else { return }; checkpoint(); placements = fixture.placements; focusLevel = fixture.focusLevel; draft = nil; selectedPlacementId = nil; selectedItemId = nil; save(); notice = L.t("Trader Land restored.", "Trader Land restaurado."); help = false }
    private func reveal() { guard !accountIsland, focusLevel < 2 else { return }; checkpoint(); focusLevel = 2; save(); sound.play("fog_reveal"); notice = L.t("Full island revealed.", "Isla completa revelada."); help = false }
    private func resetView() { zoom = 1; pan = .zero }
    private func save() { guard !accountIsland else { return }; if let data = try? JSONEncoder().encode(SavedWorld(placements: placements, focusLevel: focusLevel)) { UserDefaults.standard.set(data, forKey: Self.storageKey) } }
    private static func load() -> SavedWorld? {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let saved = try? JSONDecoder().decode(SavedWorld.self, from: data) else { return nil }
        let items = Dictionary(uniqueKeysWithValues: RuntimeBundle.manifest.items.map { ($0.id, $0) })
        var occupied: Set<String> = ["3:3", "3:4", "4:3", "4:4"]
        var ids = Set<String>()
        let clean = saved.placements.filter { placement in
            guard !ids.contains(placement.uid), let item = items[placement.itemId], item.kind != "core" else { return false }
            let cells = landCells(item, placement)
            guard cells.allSatisfy({ key in
                let xy = key.split(separator: ":").compactMap { Int($0) }
                return xy.count == 2 && xy[0] >= 0 && xy[1] >= 0 && xy[0] < 8 && xy[1] < 8 && !occupied.contains(key)
            }) else { return false }
            occupied.formUnion(cells); ids.insert(placement.uid); return true
        }
        return SavedWorld(placements: clean, focusLevel: min(2, max(1, saved.focusLevel)))
    }
}
