import SwiftUI
import UIKit
import CoreImage

private enum LandOrientation: String, Codable {
    case neSW = "ne_sw"
    case nwSE = "nw_se"
}

private enum LandPiece: String, CaseIterable, Codable {
    case path, rock, antenna, workshop, citadel

    var footprint: (columns: Int, rows: Int) {
        switch self {
        case .workshop: return (2, 1)
        case .citadel: return (2, 2)
        default: return (1, 1)
        }
    }

    var imagePath: String? {
        switch self {
        case .path: return nil
        case .rock: return "gate-A/evidence_mines_crystal_vein_rock/ne/bloom_albedo_1024.png"
        case .antenna: return "gate-A/risk_reef_dual_orbit_antenna/ne/bloom_albedo_1024.png"
        case .workshop: return "gate-A/evidence_mines_evidence_workshop/ne/bloom_albedo_1024.png"
        case .citadel: return "gate-A/thesis_citadel_three_gate_citadel/ne/bloom_albedo_1024.png"
        }
    }

    var layerDirectory: String? {
        switch self {
        case .path: return nil
        case .rock: return "gate-A/evidence_mines_crystal_vein_rock/ne"
        case .antenna: return "gate-A/risk_reef_dual_orbit_antenna/ne"
        case .workshop: return "gate-A/evidence_mines_evidence_workshop/ne"
        case .citadel: return "gate-A/thesis_citadel_three_gate_citadel/ne"
        }
    }

    var displayName: String { rawValue.capitalized }
}

private struct LandPlacement: Identifiable, Codable, Equatable {
    let id: String
    let piece: LandPiece
    let column: Int
    let row: Int
    var orientation: LandOrientation?
}

private let gateInitialPlacements: [LandPlacement] = [
    .init(id: "workshop", piece: .workshop, column: 1, row: 2),
    .init(id: "antenna", piece: .antenna, column: 5, row: 1),
    .init(id: "rock", piece: .rock, column: 1, row: 5),
    .init(id: "citadel", piece: .citadel, column: 5, row: 5),
    .init(id: "path-a", piece: .path, column: 3, row: 2, orientation: .neSW),
    .init(id: "path-b", piece: .path, column: 4, row: 3, orientation: .nwSE),
]

private enum GateLayout {
    static let grid = 8
    static let tileWidth: CGFloat = 92
    static let tileHeight: CGFloat = 46
    static let origin = CGPoint(x: 430, y: 76)
    static let canvas = CGSize(width: 860, height: 520)

    static func iso(column: CGFloat, row: CGFloat) -> CGPoint {
        CGPoint(
            x: origin.x + (column - row) * tileWidth / 2,
            y: origin.y + (column + row) * tileHeight / 2
        )
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

private struct ProceduralLandPath: View {
    let orientation: LandOrientation

    var body: some View {
        ZStack {
            Diamond()
                .fill(Color(red: 0.07, green: 0.10, blue: 0.13))
                .overlay(Diamond().stroke(Color(red: 0.15, green: 0.22, blue: 0.29), lineWidth: 2))
            Capsule()
                .fill(Color(red: 0.33, green: 1, blue: 0.75).opacity(0.2))
                .frame(width: orientation == .nwSE ? 76 : 34, height: orientation == .nwSE ? 13 : 38)
                .blur(radius: 5)
            Capsule()
                .fill(Color(red: 0.33, green: 1, blue: 0.75))
                .frame(width: orientation == .nwSE ? 76 : 4, height: orientation == .nwSE ? 4 : 38)
        }
        .frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
        .accessibilityLabel("Procedural path \(orientation.rawValue)")
    }
}

private struct GateBundleImage: View {
    let path: String

    var body: some View {
        Group {
            if let url = Bundle.main.resourceURL?.appendingPathComponent(path),
               let image = UIImage(contentsOfFile: url.path) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            } else {
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.red.opacity(0.3))
                    .overlay(Text("Missing asset").font(.caption2))
            }
        }
    }
}

private struct GateShadowImage: View {
    let path: String

    private var image: UIImage? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path),
              let input = CIImage(contentsOf: url),
              let filter = CIFilter(name: "CIMaskToAlpha") else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        guard let output = filter.outputImage,
              let cgImage = CIContext(options: nil).createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .renderingMode(.template)
                    .foregroundStyle(.black)
                    .scaledToFit()
            }
        }
    }
}

private struct GateGlowImage: View {
    let path: String

    private var image: UIImage? {
        guard let url = Bundle.main.resourceURL?.appendingPathComponent(path),
              let input = CIImage(contentsOf: url),
              let filter = CIFilter(name: "CIColorMatrix") else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(CIVector(x: 1, y: 0, z: 0, w: 0), forKey: "inputRVector")
        filter.setValue(CIVector(x: 0, y: 1, z: 0, w: 0), forKey: "inputGVector")
        filter.setValue(CIVector(x: 0, y: 0, z: 1, w: 0), forKey: "inputBVector")
        filter.setValue(CIVector(x: 0.2126, y: 0.7152, z: 0.0722, w: 0), forKey: "inputAVector")
        guard let output = filter.outputImage,
              let cgImage = CIContext(options: nil).createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    var body: some View {
        Group {
            if let image {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
            }
        }
    }
}

private struct LayeredGateBundleImage: View {
    let albedo: String
    let glow: String
    let shadow: String
    var showGlow = true

    var body: some View {
        ZStack {
            GateShadowImage(path: shadow)
                .opacity(0.55)
            GateBundleImage(path: albedo)
            if showGlow {
                GateGlowImage(path: glow)
                    .blendMode(.screen)
            }
        }
    }
}

private struct GateCanvas: View {
    let placements: [LandPlacement]
    let selectedPiece: LandPiece
    let orientation: LandOrientation
    let useSeed: Bool
    let place: (Int, Int) -> Void

    private var orderedPlacements: [LandPlacement] {
        placements.sorted {
            let left = GateLayout.iso(column: CGFloat($0.column), row: CGFloat($0.row)).y
            let right = GateLayout.iso(column: CGFloat($1.column), row: CGFloat($1.row)).y
            return left < right
        }
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            RadialGradient(
                colors: [Color(red: 0.07, green: 0.31, blue: 0.24).opacity(0.45), Color(red: 0.02, green: 0.03, blue: 0.05)],
                center: .center,
                startRadius: 12,
                endRadius: 390
            )

            ForEach(0..<(GateLayout.grid * GateLayout.grid), id: \.self) { index in
                let column = index % GateLayout.grid
                let row = index / GateLayout.grid
                let point = GateLayout.iso(column: CGFloat(column), row: CGFloat(row))
                let blocked = (3...4).contains(column) && (3...4).contains(row)
                Button { place(column, row) } label: {
                    Diamond()
                        .fill(blocked
                              ? Color(red: 0.17, green: 0.96, blue: 0.64).opacity(0.12)
                              : Color(red: 0.08, green: 0.16, blue: 0.19).opacity((column + row).isMultiple(of: 2) ? 0.82 : 0.68))
                }
                .buttonStyle(.plain)
                .frame(width: GateLayout.tileWidth, height: GateLayout.tileHeight)
                .position(point)
                .accessibilityIdentifier("land-tile-\(column)-\(row)")
            }

            ForEach(orderedPlacements) { placement in
                sprite(for: placement)
            }

            let corePoint = GateLayout.iso(column: 3.5, row: 3.5)
            LayeredGateBundleImage(
                albedo: "gate-A/aura_core/ne/stage1_albedo_1024.png",
                glow: "gate-A/aura_core/ne/stage1_glow_1024.png",
                shadow: "gate-A/aura_core/ne/shadow_1024.png"
            )
                .frame(width: 248, height: 248)
                .position(x: corePoint.x, y: corePoint.y - 72)
                .allowsHitTesting(false)
                .accessibilityLabel("Aura Core")
        }
        .frame(width: GateLayout.canvas.width, height: GateLayout.canvas.height)
        .clipped()
    }

    @ViewBuilder
    private func sprite(for placement: LandPlacement) -> some View {
        let footprint = placement.piece.footprint
        let anchor = GateLayout.iso(
            column: CGFloat(placement.column) + CGFloat(footprint.columns - 1) / 2,
            row: CGFloat(placement.row) + CGFloat(footprint.rows - 1) / 2
        )
        if placement.piece == .path {
            ProceduralLandPath(orientation: placement.orientation ?? .neSW)
                .position(anchor)
                .allowsHitTesting(false)
        } else if let path = placement.piece.imagePath,
                  let directory = placement.piece.layerDirectory {
            let resolvedPath = placement.piece == .rock && useSeed
                ? "gate-A/evidence_mines_crystal_vein_rock/ne/seed_albedo_1024.png"
                : path
            let size: CGFloat = placement.piece == .citadel ? 230 : (placement.piece == .workshop ? 190 : 132)
            LayeredGateBundleImage(
                albedo: resolvedPath,
                glow: "\(directory)/bloom_glow_1024.png",
                shadow: "\(directory)/shadow_1024.png",
                showGlow: !(placement.piece == .rock && useSeed)
            )
                .frame(width: size, height: size)
                .position(x: anchor.x, y: anchor.y - size * 0.29)
                .allowsHitTesting(false)
                .accessibilityLabel(placement.piece.displayName)
        }
    }
}

struct TraderLandGateHarnessView: View {
    private static let storageKey = "bobby.trader-land.gate-a.v1"

    @State private var placements: [LandPlacement] = Self.loadPlacements()
    @State private var history: [[LandPlacement]] = []
    @State private var selectedPiece: LandPiece = .path
    @State private var orientation: LandOrientation = .neSW
    @State private var useSeed = false
    @State private var notice = "Tap a free tile to place the selected blueprint."

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("TRADER LAND // GATE A")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .tracking(3)
                            .foregroundStyle(Color(red: 0.45, green: 1, blue: 0.78))
                        Text("One snapshot. Same rules everywhere.")
                            .font(.title2.bold())
                        Text("Native QA harness · no wallet, XP, API or production writes.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal, 18)

                    GateCanvas(
                        placements: placements,
                        selectedPiece: selectedPiece,
                        orientation: orientation,
                        useSeed: useSeed,
                        place: place
                    )
                    .scaleEffect(0.42, anchor: .topLeading)
                    .frame(
                        width: GateLayout.canvas.width * 0.42,
                        height: GateLayout.canvas.height * 0.42,
                        alignment: .topLeading
                    )
                    .frame(maxWidth: .infinity)
                    .background(Color.black)
                    .clipShape(RoundedRectangle(cornerRadius: 24))
                    .overlay(RoundedRectangle(cornerRadius: 24).stroke(Color.green.opacity(0.25)))
                    .padding(.horizontal, 12)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("BLUEPRINT INVENTORY")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .tracking(2)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(LandPiece.allCases, id: \.self) { piece in
                                    Button(piece.displayName) { selectedPiece = piece }
                                        .font(.caption.bold())
                                        .buttonStyle(.bordered)
                                        .tint(selectedPiece == piece ? .green : .gray)
                                }
                            }
                        }
                        HStack {
                            Button("Rotate · \(orientation.rawValue)") {
                                orientation = orientation == .neSW ? .nwSE : .neSW
                            }
                            Button(useSeed ? "Seed" : "Bloom") { useSeed.toggle() }
                            Button("Undo", action: undo)
                            Button("Restore", action: restore)
                        }
                        .font(.caption)
                        .buttonStyle(.bordered)
                        Text(notice)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(12)
                            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                        Text("8×8 · \(placements.count + 1) PLACED · USERDEFAULTS")
                            .font(.system(size: 9, design: .monospaced))
                            .tracking(1.5)
                            .foregroundStyle(.secondary)
                    }
                    .padding(18)
                }
                .padding(.vertical, 18)
            }
            .background(Color(red: 0.02, green: 0.03, blue: 0.04).ignoresSafeArea())
            .onChange(of: placements) { _, value in Self.save(value) }
        }
    }

    private var occupiedCells: Set<String> {
        Set(placements.flatMap { placement in
            let footprint = placement.piece.footprint
            return (0..<footprint.columns).flatMap { columnOffset in
                (0..<footprint.rows).map { rowOffset in
                    "\(placement.column + columnOffset):\(placement.row + rowOffset)"
                }
            }
        })
    }

    private func place(column: Int, row: Int) {
        let footprint = selectedPiece.footprint
        let cells = (0..<footprint.columns).flatMap { columnOffset in
            (0..<footprint.rows).map { rowOffset in
                (column + columnOffset, row + rowOffset)
            }
        }
        let overlapsCore = cells.contains { (3...4).contains($0.0) && (3...4).contains($0.1) }
        let outsideGrid = column + footprint.columns > GateLayout.grid || row + footprint.rows > GateLayout.grid
        let overlapsPiece = cells.contains { occupiedCells.contains("\($0.0):\($0.1)") }
        guard !overlapsCore && !outsideGrid && !overlapsPiece else {
            notice = "Invalid position · footprint overlaps another piece or the Aura Core."
            return
        }
        history.append(placements)
        if history.count > 10 { history.removeFirst() }
        placements.append(.init(
            id: "\(selectedPiece.rawValue)-\(UUID().uuidString)",
            piece: selectedPiece,
            column: column,
            row: row,
            orientation: selectedPiece == .path ? orientation : nil
        ))
        notice = "Placed · snapshot persisted locally."
    }

    private func undo() {
        guard let previous = history.popLast() else {
            notice = "Nothing to undo."
            return
        }
        placements = previous
        notice = "Placement undone and persisted."
    }

    private func restore() {
        history.append(placements)
        placements = gateInitialPlacements
        notice = "Gate snapshot restored."
    }

    private static func loadPlacements() -> [LandPlacement] {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let placements = try? JSONDecoder().decode([LandPlacement].self, from: data) else {
            return gateInitialPlacements
        }
        return placements
    }

    private static func save(_ placements: [LandPlacement]) {
        guard let data = try? JSONEncoder().encode(placements) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
