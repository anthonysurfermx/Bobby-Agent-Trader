import AVFoundation
import CoreImage
import SwiftUI
import UIKit

private enum LandOrientation: String, Codable { case neSW = "ne_sw", nwSE = "nw_se" }
private enum Connector: String, Codable, Hashable { case NE, SE, SW, NW }

private struct Footprint: Codable { let cols: Int; let rows: Int }
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
            if let url = Bundle.main.resourceURL?.appendingPathComponent(path), let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 8).fill(.red.opacity(0.35)).overlay(Text("Missing").font(.caption2))
            }
        }
    }
}

private struct LuminanceBundleImage: View {
    let path: String
    let glow: Bool

    private var image: UIImage? {
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
              let cgImage = CIContext(options: nil).createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
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
                .NE: CGPoint(x: size.width / 2, y: 2), .SE: CGPoint(x: size.width - 3, y: size.height / 2),
                .SW: CGPoint(x: size.width / 2, y: size.height - 2), .NW: CGPoint(x: 3, y: size.height / 2),
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
            RadialGradient(colors: [Color.green.opacity(0.2), Color(red: 0.02, green: 0.03, blue: 0.05)], center: .center, startRadius: 20, endRadius: 390)
            ForEach(0..<(fixture.gridSize * fixture.gridSize), id: \.self) { index in
                let col = index % fixture.gridSize, row = index / fixture.gridSize
                Button { place(col, row) } label: {
                    Diamond().fill(Color(red: 0.08, green: 0.16, blue: 0.19).opacity((col + row).isMultiple(of: 2) ? 0.82 : 0.68))
                }
                .buttonStyle(.plain).frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
                .position(GateLayout.iso(column: CGFloat(col), row: CGFloat(row)))
                .accessibilityIdentifier("land-tile-\(col)-\(row)")
            }
            ForEach(placements) { placement in
                if let item = items[placement.itemId] { sprite(item: item, placement: placement) }
            }
            if let core = items[fixture.core.itemId] {
                sprite(item: core, placement: .init(uid: "aura-core", itemId: core.id, col: fixture.core.col, row: fixture.core.row, orientation: nil))
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
            let center = GateLayout.iso(column: CGFloat(placement.col) + CGFloat(item.footprint.cols - 1) / 2,
                                        row: CGFloat(placement.row) + CGFloat(item.footprint.rows - 1) / 2)
            let visibleWidth = max(0.2, state.contentBounds[2] - state.contentBounds[0])
            let footprintWidth = GateLayout.tileWidth * CGFloat(item.footprint.cols + item.footprint.rows) / 2
            let size = min(360, footprintWidth * 0.9 / visibleWidth)
            Group {
                if item.kind == "core" { AnimatedAuraCore(item: item, seed: seed, pulse: corePulse) }
                else { LayeredManifestImage(item: item, seed: seed) }
            }
                .frame(width: size, height: size)
                .position(x: center.x, y: center.y + size * (0.5 - state.anchor[1]))
                .zIndex(100 + center.y).allowsHitTesting(false).accessibilityLabel(item.id)
            if item.kind == "path_pavement" {
                let active = connectors(for: placement)
                ProceduralFilament(connectors: active, dimmed: seed)
                    .position(center).zIndex(560 + center.y).allowsHitTesting(false)
                    .accessibilityIdentifier("path-\(placement.uid)-connectors-\(active.map(\.rawValue).sorted().joined(separator: "-"))")
            }
        }
    }
}

struct TraderLandGateHarnessView: View {
    private static let storageKey = "bobby.trader-land.runtime-v03"
    private let manifest = RuntimeBundle.manifest
    private let fixture = RuntimeBundle.fixture
    @State private var placements: [LandPlacement]
    @State private var focusLevel: Int
    @State private var selectedItemId: String
    @State private var orientation = LandOrientation.neSW
    @State private var seed = false
    @State private var history: [SavedWorld] = []
    @State private var notice = "Choose a blueprint, then tap a revealed tile."
    @State private var zoom: CGFloat = 0.42
    @State private var settledZoom: CGFloat = 0.42
    @State private var pan: CGSize = .zero
    @State private var settledPan: CGSize = .zero
    @State private var corePulse = 0
    @StateObject private var sound = LandSound()

    init() {
        let fixture = RuntimeBundle.fixture
        let saved = Self.load() ?? SavedWorld(placements: fixture.placements, focusLevel: fixture.focusLevel)
        _placements = State(initialValue: saved.placements)
        _focusLevel = State(initialValue: saved.focusLevel)
        _selectedItemId = State(initialValue: "crypto_bay_data_dock")
    }

    private var items: [String: ManifestItem] { Dictionary(uniqueKeysWithValues: manifest.items.map { ($0.id, $0) }) }
    private var selectedItem: ManifestItem? { items[selectedItemId] }
    private var occupied: Set<String> {
        var cells: Set<String> = ["3:3", "3:4", "4:3", "4:4"]
        for placement in placements where items[placement.itemId] != nil {
            let item = items[placement.itemId]!
            for x in 0..<item.footprint.cols { for y in 0..<item.footprint.rows { cells.insert("\(placement.col + x):\(placement.row + y)") } }
        }
        return cells
    }
    private func revealed(_ col: Int, _ row: Int) -> Bool {
        max(abs(CGFloat(col) - 3.5), abs(CGFloat(row) - 3.5)) <= CGFloat(focusLevel) + 1.5
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("TRADER LAND // RUNTIME V01").font(.system(size: 11, weight: .bold, design: .monospaced)).tracking(3).foregroundStyle(.mint)
                        Text("Discipline becomes a world.").font(.title2.bold())
                        Text("Shared fixture · no wallet, XP, API or production writes.").font(.caption).foregroundStyle(.secondary)
                        Text("FOCUS \(focusLevel)/2 · \(placements.count + 1) PLACED").font(.system(size: 9, design: .monospaced)).tracking(1.4).accessibilityIdentifier("land-world-status")
                    }.padding(.horizontal, 18)

                    GeometryReader { proxy in
                        ZStack(alignment: .topTrailing) {
                            GateCanvas(manifest: manifest, fixture: fixture, placements: placements, focusLevel: focusLevel, seed: seed, corePulse: corePulse, place: place)
                                .scaleEffect(zoom)
                                .offset(pan)
                            HStack(spacing: 4) {
                                Button { setZoom(zoom - 0.08) } label: { Image(systemName: "minus") }.accessibilityLabel("Zoom out")
                                Button("\(Int(zoom * 100))%", action: resetView).accessibilityLabel("Reset view")
                                Button { setZoom(zoom + 0.08) } label: { Image(systemName: "plus") }.accessibilityLabel("Zoom in")
                            }.font(.caption2).buttonStyle(.bordered).padding(8).zIndex(2_000)
                        }
                        .frame(width: proxy.size.width, height: 330)
                    }
                    .frame(height: 330).background(.black).clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(RoundedRectangle(cornerRadius: 24).stroke(.green.opacity(0.25))).padding(.horizontal, 12)
                    .simultaneousGesture(MagnifyGesture().onChanged { value in setZoom(settledZoom * value.magnification) }.onEnded { _ in settledZoom = zoom })
                    .simultaneousGesture(DragGesture().onChanged { value in pan = CGSize(width: settledPan.width + value.translation.width, height: settledPan.height + value.translation.height) }.onEnded { _ in settledPan = pan })

                    VStack(alignment: .leading, spacing: 10) {
                        Text("BLUEPRINTS · \(manifest.items.count - 1)").font(.system(size: 10, weight: .bold, design: .monospaced)).tracking(2).foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 7) {
                                ForEach(manifest.items.filter { $0.kind != "core" }) { item in
                                    Button(item.id.replacingOccurrences(of: "_", with: " ")) { selectedItemId = item.id; sound.play("placement_tick") }
                                        .font(.caption2.bold()).buttonStyle(.bordered).tint(selectedItemId == item.id ? .green : .gray)
                                        .accessibilityIdentifier("blueprint-\(item.id)")
                                }
                            }
                        }
                        HStack {
                            Button("Rotate · \(orientation.rawValue)") { orientation = orientation == .neSW ? .nwSE : .neSW }
                            Button(seed ? "Seed" : "Bloom") { sound.play(seed ? "bloom_complete" : "seed_reveal"); seed.toggle() }
                            Button("Undo", action: undo)
                            Button("Restore", action: restore)
                        }.font(.caption).buttonStyle(.bordered)
                        Button("Reveal next focus ring", action: reveal).buttonStyle(.borderedProminent).tint(.mint).foregroundStyle(.black)
                        HStack {
                            Button { sound.toggle() } label: { Label(sound.enabled ? "Sound on" : "Sound off", systemImage: sound.enabled ? "speaker.wave.2.fill" : "speaker.slash.fill") }
                                .accessibilityIdentifier("land-sound-toggle")
                            Button { corePulse += 1; sound.play(["orbit_whoosh_a", "orbit_whoosh_b", "orbit_whoosh_c"][corePulse % 3], volume: 0.35) } label: { Label("Pulse core", systemImage: "wave.3.right") }
                                .accessibilityIdentifier("land-core-pulse")
                        }.font(.caption).buttonStyle(.bordered)
                        Text(notice).font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).padding(12).background(.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                    }.padding(18)
                }.padding(.vertical, 18)
            }.background(Color(red: 0.02, green: 0.03, blue: 0.04).ignoresSafeArea())
                .onChange(of: placements) { _, _ in save() }.onChange(of: focusLevel) { _, _ in save() }
                .overlay(alignment: .topTrailing) {
                    Text("FOCUS \(focusLevel)/2 · \(placements.count + 1) PLACED")
                        .font(.system(size: 8, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 9).padding(.vertical, 6)
                        .background(.black.opacity(0.82), in: Capsule())
                        .padding(10)
                        .accessibilityIdentifier("land-fixed-status")
                }
        }
    }

    private func place(_ col: Int, _ row: Int) {
        guard let item = selectedItem else { return }
        let cells = (0..<item.footprint.cols).flatMap { x in (0..<item.footprint.rows).map { y in (col + x, row + y) } }
        let valid = col + item.footprint.cols <= fixture.gridSize && row + item.footprint.rows <= fixture.gridSize
            && cells.allSatisfy { revealed($0.0, $0.1) && !occupied.contains("\($0.0):\($0.1)") }
        guard valid else { sound.play("placement_invalid"); notice = "Blocked · reveal the tile or clear the full footprint."; return }
        checkpoint()
        placements.append(.init(uid: "\(item.id)-\(UUID().uuidString)", itemId: item.id, col: col, row: row, orientation: item.kind == "path_pavement" ? orientation : nil))
        sound.play("placement_confirm")
        notice = "Built · visual adjacency only."
    }
    private func checkpoint() { history.append(.init(placements: placements, focusLevel: focusLevel)); if history.count > 10 { history.removeFirst() } }
    private func undo() { guard let previous = history.popLast() else { notice = "Nothing to undo."; return }; placements = previous.placements; focusLevel = previous.focusLevel }
    private func restore() { checkpoint(); placements = fixture.placements; focusLevel = fixture.focusLevel; notice = "Canonical fixture restored." }
    private func reveal() { guard focusLevel < 2 else { sound.play("placement_invalid"); notice = "Full island revealed."; return }; checkpoint(); focusLevel = 2; sound.play("fog_reveal"); DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) { sound.play("five_attributes_chord") }; notice = "Focus expanded 6×6 → 8×8." }
    private func setZoom(_ value: CGFloat) { zoom = min(0.72, max(0.28, value)); settledZoom = zoom }
    private func resetView() { zoom = 0.42; settledZoom = zoom; pan = .zero; settledPan = .zero }
    private func save() { if let data = try? JSONEncoder().encode(SavedWorld(placements: placements, focusLevel: focusLevel)) { UserDefaults.standard.set(data, forKey: Self.storageKey) } }
    private static func load() -> SavedWorld? { guard let data = UserDefaults.standard.data(forKey: storageKey) else { return nil }; return try? JSONDecoder().decode(SavedWorld.self, from: data) }
}
