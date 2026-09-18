import SwiftUI
import UIKit

// MARK: Sprite geometry — shared by your island (SwiftUI views) and the archipelago (one Canvas).

/// Where a piece's art sits on an island, in island canvas units (`GateLayout`).
/// The manifest anchor is the bottom vertex of the footprint (the art pipeline
/// stores content-centre x and lowest-pixel y), so it lands on that vertex.
struct LandSpriteGeometry {
    /// Square art frame.
    let frame: CGRect
    /// Rotated pieces (nw_se) mirror the art.
    let flip: Bool
    /// Paint order: the footprint's bottom vertex y.
    let depth: CGFloat
    /// Footprint parallelogram, for the contact shadow, selection and the placement draft.
    let footprint: Path
    /// Path slabs only: the top face the filament runs on.
    let topFace: CGRect?

    init?(item: LandItem, col: Int, row: Int, orientation: LandOrientation?) {
        guard let state = item.artState, state.contentBounds.count == 4, state.anchor.count == 2 else { return nil }
        let area = landFootprint(item, orientation)
        let center = GateLayout.iso(column: CGFloat(col) + CGFloat(area.cols - 1) / 2, row: CGFloat(row) + CGFloat(area.rows - 1) / 2)
        let ground = center.y + GateLayout.tileHeight * CGFloat(area.cols + area.rows) / 4
        let bounds = state.contentBounds
        let visible = max(0.2, bounds[2] - bounds[0])
        let size = min(360, GateLayout.tileWidth * CGFloat(item.footprint.cols + item.footprint.rows) / 2 * 0.9 / visible)
        flip = orientation == .nwSE
        let midX = center.x + (flip ? -1 : 1) * size * (0.5 - state.anchor[0])
        let midY = ground + size * (0.5 - state.anchor[1])
        frame = CGRect(x: midX - size / 2, y: midY - size / 2, width: size, height: size)
        depth = ground
        footprint = LandPainter.footprint(col: col, row: row, cols: area.cols, rows: area.rows)
        if item.kind == "path_pavement" {
            let width = visible * size
            let contentMid = (bounds[0] + bounds[2]) / 2
            let x = flip ? frame.maxX - size * contentMid : frame.minX + size * contentMid
            topFace = CGRect(x: x - width / 2, y: frame.minY + bounds[1] * size, width: width, height: width / 2)
        } else {
            topFace = nil
        }
    }
}

// MARK: Painter — the island slab, grid, fog, shadows and filaments, drawn in island canvas units.

enum LandPainter {
    /// Uniform ground, a step above `Theme.bg` so the slab reads against the sea.
    static let ground = Color(red: 17 / 255, green: 19 / 255, blue: 25 / 255)
    static let sideLight = Color(red: 12 / 255, green: 14 / 255, blue: 19 / 255)
    static let sideDark = Color(red: 5 / 255, green: 6 / 255, blue: 8 / 255)
    /// Matches the mint baked into the art's glow; only filaments and core particles use it.
    static let artMint = Color(red: 0.38, green: 1, blue: 0.77)
    static let slabDepth: CGFloat = 22
    static let islandCenter = CGPoint(x: 430, y: 391)
    static let coreCells: Set<String> = ["3:3", "3:4", "4:3", "4:4"]

    static func footprint(col: Int, row: Int, cols: Int, rows: Int) -> Path {
        let hw = GateLayout.tileWidth / 2, hh = GateLayout.tileHeight / 2
        let top = GateLayout.iso(column: CGFloat(col), row: CGFloat(row))
        let right = GateLayout.iso(column: CGFloat(col + cols - 1), row: CGFloat(row))
        let bottom = GateLayout.iso(column: CGFloat(col + cols - 1), row: CGFloat(row + rows - 1))
        let left = GateLayout.iso(column: CGFloat(col), row: CGFloat(row + rows - 1))
        var path = Path()
        path.move(to: CGPoint(x: top.x, y: top.y - hh))
        path.addLine(to: CGPoint(x: right.x + hw, y: right.y))
        path.addLine(to: CGPoint(x: bottom.x, y: bottom.y + hh))
        path.addLine(to: CGPoint(x: left.x - hw, y: left.y))
        path.closeSubpath()
        return path
    }

    static let island = footprint(col: 0, row: 0, cols: 8, rows: 8)

    static func cells(_ list: [(Int, Int)]) -> Path {
        var path = Path()
        for (col, row) in list { path.addPath(footprint(col: col, row: row, cols: 1, rows: 1)) }
        return path
    }

    /// The island as a slab floating in the dark: two visible side faces under a uniform top.
    static func slab(_ ctx: GraphicsContext) {
        let left = CGPoint(x: 62, y: 391), bottom = CGPoint(x: 430, y: 575), right = CGPoint(x: 798, y: 391)
        let d = slabDepth
        var west = Path(); west.addLines([left, bottom, CGPoint(x: bottom.x, y: bottom.y + d), CGPoint(x: left.x, y: left.y + d)]); west.closeSubpath()
        var east = Path(); east.addLines([bottom, right, CGPoint(x: right.x, y: right.y + d), CGPoint(x: bottom.x, y: bottom.y + d)]); east.closeSubpath()
        ctx.fill(west, with: .linearGradient(Gradient(colors: [sideLight, sideDark]), startPoint: CGPoint(x: 246, y: 400), endPoint: CGPoint(x: 246, y: 597)))
        ctx.fill(east, with: .linearGradient(Gradient(colors: [sideDark.opacity(0.9), sideDark]), startPoint: CGPoint(x: 614, y: 400), endPoint: CGPoint(x: 614, y: 597)))
        ctx.fill(island, with: .color(ground))
    }

    /// One perimeter rim, plus a faint lower edge so the slab's thickness reads.
    static func rim(_ ctx: GraphicsContext, color: Color) {
        ctx.stroke(island, with: .color(color), lineWidth: 1)
        var base = Path()
        base.addLines([CGPoint(x: 62, y: 391 + slabDepth), CGPoint(x: 430, y: 575 + slabDepth), CGPoint(x: 798, y: 391 + slabDepth)])
        ctx.stroke(base, with: .color(.white.opacity(0.05)), lineWidth: 1)
    }

    /// Soft contact shadows from each piece's true footprint.
    static func shadows(_ ctx: GraphicsContext, _ footprints: [Path]) {
        guard !footprints.isEmpty else { return }
        ctx.drawLayer { layer in
            layer.addFilter(.blur(radius: 4))
            for path in footprints { layer.fill(shrunk(path), with: .color(.black.opacity(0.5))) }
        }
    }

    static func shrunk(_ path: Path, by factor: CGFloat = 0.84) -> Path {
        let box = path.boundingRect
        let transform = CGAffineTransform(translationX: box.midX, y: box.midY + 2).scaledBy(x: factor, y: factor).translatedBy(x: -box.midX, y: -box.midY)
        return path.applying(transform)
    }

    static func connectors(col: Int, row: Int, orientation: LandOrientation?, pathCells: Set<String>) -> Set<LandConnector> {
        var result = Set<LandConnector>()
        if pathCells.contains("\(col):\(row - 1)") { result.insert(.NE) }
        if pathCells.contains("\(col + 1):\(row)") { result.insert(.SE) }
        if pathCells.contains("\(col):\(row + 1)") { result.insert(.SW) }
        if pathCells.contains("\(col - 1):\(row)") { result.insert(.NW) }
        if result.isEmpty { result = orientation == .nwSE ? [.NW, .SE] : [.NE, .SW] }
        return result
    }

    /// The light running along a path slab, from the centre of its top face to the joined edges.
    static func filament(_ ctx: GraphicsContext, face: CGRect, connectors: Set<LandConnector>, dimmed: Bool) {
        let center = CGPoint(x: face.midX, y: face.midY)
        let ends: [LandConnector: CGPoint] = [
            .NE: CGPoint(x: face.minX + face.width * 0.75, y: face.minY + face.height * 0.25),
            .SE: CGPoint(x: face.minX + face.width * 0.75, y: face.minY + face.height * 0.75),
            .SW: CGPoint(x: face.minX + face.width * 0.25, y: face.minY + face.height * 0.75),
            .NW: CGPoint(x: face.minX + face.width * 0.25, y: face.minY + face.height * 0.25),
        ]
        for connector in connectors {
            guard let end = ends[connector] else { continue }
            var line = Path(); line.move(to: center); line.addLine(to: end)
            ctx.stroke(line, with: .color(artMint.opacity(dimmed ? 0.15 : 0.95)), style: StrokeStyle(lineWidth: dimmed ? 2 : 4, lineCap: .round))
        }
        ctx.fill(Path(ellipseIn: CGRect(x: center.x - 4, y: center.y - 4, width: 8, height: 8)), with: .color(artMint.opacity(dimmed ? 0.15 : 1)))
    }
}

// MARK: Archipelago layout — public islands around yours.

enum ArchipelagoLayout {
    /// Island origins sit on a coarse iso grid 14 tiles apart: 8-tile islands with a 6-tile sea between them.
    static let spacing: CGFloat = 14
    private static let directions = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]

    /// Axial hex slots around your island, ring by ring, clockwise from the top.
    /// The lattice is "pointy" on screen (neighbours above and below), which suits a portrait phone.
    static let slots: [(q: Int, r: Int)] = {
        var out: [(q: Int, r: Int)] = []
        for ring in 1...4 {
            var hex = (directions[4].0 * ring, directions[4].1 * ring)
            var walk: [(q: Int, r: Int)] = []
            for side in 0..<6 {
                for _ in 0..<ring { walk.append((hex.0, hex.1)); hex = (hex.0 + directions[side].0, hex.1 + directions[side].1) }
            }
            out += walk.sorted { angle($0) < angle($1) }
        }
        return out
    }()

    /// A slot's offset from your island, in island canvas units: axial q runs down-right, r up-right.
    static func offset(_ slot: Int) -> CGPoint {
        let hex = slots[min(slot, slots.count - 1)]
        return CGPoint(x: CGFloat(hex.q + hex.r) * GateLayout.tileWidth / 2 * spacing,
                       y: CGFloat(hex.q - hex.r) * GateLayout.tileHeight / 2 * spacing)
    }

    /// Ring 1 around the island centre, in canvas units (tall art above, slab and label below).
    static let ringOneBounds: CGRect = {
        let step = GateLayout.tileWidth / 2 * spacing
        return CGRect(x: -(step + 368), y: -(step + 184 + 160), width: 2 * (step + 368), height: 2 * step + 184 + 160 + 184 + 60)
    }()

    /// Screen angle clockwise from straight up.
    private static func angle(_ hex: (q: Int, r: Int)) -> Double {
        var value = atan2(Double(hex.q - hex.r), Double(2 * (hex.q + hex.r))) + .pi / 2
        if value < -1e-9 { value += 2 * .pi }
        if value >= 2 * .pi - 1e-9 { value -= 2 * .pi }
        return value
    }
}

/// Neighbour islands resolved to art once, so the Canvas only paints.
struct ArchipelagoScene {
    struct Sprite {
        let item: LandItem
        let geometry: LandSpriteGeometry
        let connectors: Set<LandConnector>?
    }
    struct Island {
        let info: PublicIsland
        let offset: CGPoint
        let sprites: [Sprite]
        let freeCells: [(Int, Int)]
    }

    let islands: [Island]
    /// Empty ring-1 slots, drawn as free lots — never as fake islands.
    let lots: [CGPoint]
    var offsets: [CGPoint] { islands.map(\.offset) + lots }

    /// Bundle paths of every albedo and glow pass the neighbours use, for warming the image cache.
    var artPaths: (albedos: [String], glows: [String]) {
        var albedos = Set<String>(), glows = Set<String>()
        for sprite in islands.flatMap(\.sprites) {
            guard let state = sprite.item.artState else { continue }
            if let albedo = state.variants["albedo_512"] ?? state.variants["albedo_1024"] { albedos.insert(RuntimeBundle.bundlePath(albedo.url)) }
            if let glow = state.variants["glow_1024"] { glows.insert(RuntimeBundle.bundlePath(glow.url)) }
        }
        return (albedos.sorted(), glows.sorted())
    }

    static let empty = ArchipelagoScene(islands: [], showLots: false)

    init(islands: [PublicIsland], showLots: Bool) {
        let list = Array(islands.prefix(ArchipelagoLayout.slots.count))
        self.islands = list.enumerated().map { index, island in Self.resolve(island, offset: ArchipelagoLayout.offset(index)) }
        lots = showLots && list.count < 6 ? (list.count..<6).map(ArchipelagoLayout.offset) : []
    }

    private static func resolve(_ island: PublicIsland, offset: CGPoint) -> Island {
        let items = RuntimeBundle.items
        let placed: [(LandItem, LandPlacement)] = island.placements.compactMap { p in
            guard let item = items[TraderLandCatalog.artID(p.item_id)], item.kind != "core",
                  (0..<8).contains(p.x), (0..<8).contains(p.y) else { return nil }
            let orientation: LandOrientation = p.rotation == 90 || p.rotation == 270 ? .nwSE : .neSW
            return (item, LandPlacement(uid: "\(p.x):\(p.y)", itemId: item.id, col: p.x, row: p.y, orientation: orientation))
        }
        let pathCells = Set(placed.filter { $0.0.kind == "path_pavement" }.map { "\($0.1.col):\($0.1.row)" })
        var occupied = LandPainter.coreCells
        var sprites: [Sprite] = placed.compactMap { item, placement in
            guard let geometry = LandSpriteGeometry(item: item, col: placement.col, row: placement.row, orientation: placement.orientation) else { return nil }
            occupied.formUnion(landCells(item, placement))
            let connectors = item.kind == "path_pavement"
                ? LandPainter.connectors(col: placement.col, row: placement.row, orientation: placement.orientation, pathCells: pathCells) : nil
            return Sprite(item: item, geometry: geometry, connectors: connectors)
        }
        let core = RuntimeBundle.fixture.core
        if let item = items[core.itemId], let geometry = LandSpriteGeometry(item: item, col: core.col, row: core.row, orientation: nil) {
            sprites.append(Sprite(item: item, geometry: geometry, connectors: nil))
        }
        let free = (0..<64).map { ($0 % 8, $0 / 8) }.filter { !occupied.contains("\($0.0):\($0.1)") }
        return Island(info: island, offset: offset, sprites: sprites.sorted { $0.geometry.depth < $1.geometry.depth }, freeCells: free)
    }
}

/// Every public island in one screen-sized Canvas, behind your own island.
/// Animatable so camera flights interpolate in step with your island's transform.
struct ArchipelagoLayer: View, Animatable {
    let scene: ArchipelagoScene
    var zoom: CGFloat
    var pan: CGSize
    /// 1 while a neighbour is being visited, 0 otherwise; animates with the camera so leaving a visit fades the sea out.
    var visiting: CGFloat
    let fit: CGFloat
    let visited: Int?
    let ownLabel: String
    let labels: Bool
    /// Bumped when the glow passes finish warming, so the Canvas redraws with them.
    let artVersion: Int

    var animatableData: AnimatablePair<AnimatablePair<CGFloat, CGFloat>, AnimatablePair<CGFloat, CGFloat>> {
        get { AnimatablePair(AnimatablePair(zoom, visiting), AnimatablePair(pan.width, pan.height)) }
        set {
            zoom = newValue.first.first; visiting = newValue.first.second
            pan = CGSize(width: newValue.second.first, height: newValue.second.second)
        }
    }

    /// Nothing above 75% zoom unless visiting; the sea fades in down to 70%, so no flight pops the neighbours in or out.
    private var alpha: CGFloat { max(visiting, min(1, max(0, (0.75 - zoom) / 0.05))) }

    /// Island content box around its canvas origin, including tall art and the slab.
    private static let islandBox = CGRect(x: 40, y: -110, width: 780, height: 740)

    var body: some View {
        Canvas { ctx, size in
            guard alpha > 0.01 else { return }
            ctx.opacity = alpha
            let scale = fit * zoom
            let origin = CGPoint(x: size.width / 2 + pan.width - GateLayout.viewCenter.x * scale,
                                 y: size.height / 2 + pan.height - GateLayout.viewCenter.y * scale)
            func screen(_ point: CGPoint) -> CGPoint { CGPoint(x: origin.x + point.x * scale, y: origin.y + point.y * scale) }
            let viewport = CGRect(origin: .zero, size: size).insetBy(dx: -24, dy: -24)
            var resolved: [String: GraphicsContext.ResolvedImage] = [:]
            func image(_ key: String, _ load: () -> UIImage?) -> GraphicsContext.ResolvedImage? {
                if let hit = resolved[key] { return hit }
                guard let ui = load() else { return nil }
                let value = ctx.resolve(Image(uiImage: ui)); resolved[key] = value; return value
            }

            for lot in scene.lots {
                let box = Self.islandBox.offsetBy(dx: lot.x, dy: lot.y)
                guard CGRect(origin: screen(box.origin), size: CGSize(width: box.width * scale, height: box.height * scale)).intersects(viewport) else { continue }
                let path = LandPainter.island.applying(CGAffineTransform(translationX: origin.x + lot.x * scale, y: origin.y + lot.y * scale).scaledBy(x: scale, y: scale))
                ctx.fill(path, with: .color(.white.opacity(0.012)))
                ctx.stroke(path, with: .color(.white.opacity(0.16)), style: StrokeStyle(lineWidth: 1, dash: [5, 5]))
                let center = screen(CGPoint(x: lot.x + LandPainter.islandCenter.x, y: lot.y + LandPainter.islandCenter.y))
                ctx.draw(Text(L.t("Free lot", "Lote libre")).font(.system(size: 11, weight: .medium, design: .monospaced)).foregroundColor(Theme.muted), at: center)
            }

            for (index, island) in scene.islands.enumerated() {
                let box = Self.islandBox.offsetBy(dx: island.offset.x, dy: island.offset.y)
                guard CGRect(origin: screen(box.origin), size: CGSize(width: box.width * scale, height: box.height * scale)).intersects(viewport) else { continue }
                var layer = ctx
                layer.translateBy(x: origin.x + island.offset.x * scale, y: origin.y + island.offset.y * scale)
                layer.scaleBy(x: scale, y: scale)
                LandPainter.slab(layer)
                layer.stroke(LandPainter.cells(island.freeCells), with: .color(.white.opacity(0.035)), lineWidth: 1)
                LandPainter.rim(layer, color: visited == index ? Theme.cio.opacity(0.6) : Theme.accentSoft.opacity(0.22))
                LandPainter.shadows(layer, island.sprites.map(\.geometry.footprint))
                for sprite in island.sprites {
                    guard let state = sprite.item.artState,
                          let albedo = state.variants["albedo_512"] ?? state.variants["albedo_1024"] else { continue }
                    let path = RuntimeBundle.bundlePath(albedo.url)
                    let rect = sprite.geometry.frame
                    var art = layer
                    if sprite.geometry.flip { art.translateBy(x: rect.midX, y: 0); art.scaleBy(x: -1, y: 1); art.translateBy(x: -rect.midX, y: 0) }
                    if let body = image(path, { LandImageCache.image(path) }) { art.draw(body, in: rect) }
                    // Cache only: building a glow here would stall the first frame; the albedo shows until it is warm.
                    if let glow = state.variants["glow_1024"] {
                        let glowPath = RuntimeBundle.bundlePath(glow.url)
                        if let light = image(glowPath + "#half", { LandImageCache.cachedGlow(glowPath, half: true) }) {
                            var screenBlend = art; screenBlend.blendMode = .screen; screenBlend.draw(light, in: rect)
                        }
                    }
                    if let face = sprite.geometry.topFace, let connectors = sprite.connectors {
                        LandPainter.filament(layer, face: face, connectors: connectors, dimmed: false)
                    }
                }
            }

            guard labels else { return }
            let labelY = LandPainter.islandCenter.y + 184 + LandPainter.slabDepth + 10
            func label(_ text: String, at point: CGPoint, color: Color, weight: Font.Weight) {
                guard viewport.contains(point) else { return }
                let short = text.count > 24 ? String(text.prefix(23)) + "…" : text
                let resolvedText = ctx.resolve(Text(short).font(.system(size: 11, weight: weight)).foregroundColor(color))
                let size = resolvedText.measure(in: CGSize(width: 220, height: 30))
                let box = CGRect(x: point.x - size.width / 2 - 8, y: point.y, width: size.width + 16, height: size.height + 6)
                ctx.fill(Path(roundedRect: box, cornerRadius: box.height / 2), with: .color(Theme.bg.opacity(0.78)))
                ctx.draw(resolvedText, at: CGPoint(x: point.x, y: point.y + 3), anchor: .top)
            }
            label(ownLabel, at: screen(CGPoint(x: LandPainter.islandCenter.x, y: labelY)), color: Theme.text, weight: .semibold)
            for (index, island) in scene.islands.enumerated() {
                label(LandIslandStatus.title(island.info), at: screen(CGPoint(x: island.offset.x + LandPainter.islandCenter.x, y: island.offset.y + labelY)),
                      color: visited == index ? Theme.cio : Theme.muted, weight: .medium)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

// MARK: Island status — what the island says you earned, and the one thing to do next.

enum LandIslandStatus {
    /// The single next action the island headline offers, by priority.
    enum NextAction: Equatable {
        case review(count: Int)
        case build(count: Int, first: String)
        case growing(count: Int, reviewAt: Date?)
        case read
    }

    static func nextAction(_ world: TraderLandWorld) -> NextAction {
        if world.reviewsReady > 0 { return .review(count: world.reviewsReady) }
        if let first = readyPieces(world).first {
            return .build(count: world.inventory.filter { $0.state == "bloomed" && !$0.placed }.count, first: first.id)
        }
        if world.seedsGrowing > 0 { return .growing(count: world.seedsGrowing, reviewAt: nextReviewAt(world)) }
        return .read
    }

    /// When the soonest growing seed's review opens, per this snapshot.
    static func nextReviewAt(_ world: TraderLandWorld) -> Date? {
        world.inventory.filter { $0.state == "seed" && $0.review?.ready != true }.compactMap { date($0.review?.reviewAt) }.min()
    }

    /// "Next on the route: Risk Shield · piece 4 of 8". `route.index` counts the pieces already granted,
    /// so the next one is the piece after them.
    static func routeLine(_ route: TraderLandWorld.Route) -> String {
        guard !route.complete, let next = route.next else { return L.t("Route complete · XP still counts", "Ruta completa · la XP sigue contando") }
        let name = TraderLandCatalog.name(next.id, district: next.world)
        let number = min(route.index + 1, route.total)
        return L.t("Next on the route: \(name) · piece \(number) of \(route.total)", "Siguiente en la ruta: \(name) · pieza \(number) de \(route.total)")
    }

    /// Bloomed pieces waiting in the collection, as manifest ids with how many of each.
    static func readyPieces(_ world: TraderLandWorld) -> [(id: String, count: Int)] {
        var order: [String] = []
        var counts: [String: Int] = [:]
        for entry in world.inventory where entry.state == "bloomed" && !entry.placed {
            let id = TraderLandCatalog.artID(entry.item_id)
            guard RuntimeBundle.items[id] != nil else { continue }
            if counts[id] == nil { order.append(id) }
            counts[id, default: 0] += 1
        }
        return order.map { ($0, counts[$0] ?? 1) }
    }

    /// Server timestamps: ISO 8601 with or without fractional seconds (Postgres sends six digits).
    static func date(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let value = formatter.date(from: raw) { return value }
        formatter.formatOptions = [.withInternetDateTime]
        let trimmed = raw.replacingOccurrences(of: #"\.\d+"#, with: "", options: .regularExpression)
        return formatter.date(from: trimmed)
    }

    /// "5 h" / "40 min" until a moment; nil once it has passed.
    static func until(_ date: Date?, now: Date = Date()) -> String? {
        guard let date, date > now else { return nil }
        let minutes = Int(ceil(date.timeIntervalSince(now) / 60))
        return minutes < 60 ? "\(max(1, minutes)) min" : "\(Int(ceil(Double(minutes) / 60))) h"
    }

    static func title(_ island: PublicIsland) -> String {
        let clean = island.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return clean.isEmpty ? L.t("Untitled island", "Isla sin nombre") : clean
    }

    /// "5 pieces · Crypto Bay, Risk Reef +1"
    static func summary(_ island: PublicIsland) -> String {
        let pieces = island.stats?.pieces ?? island.placements.count
        let count = pieces == 1 ? L.t("1 piece", "1 pieza") : L.t("\(pieces) pieces", "\(pieces) piezas")
        let districts = island.stats?.districts ?? []
        guard !districts.isEmpty else { return count }
        let names = districts.prefix(2).map(TraderLandCatalog.districtName).joined(separator: ", ")
        return "\(count) · \(names)\(districts.count > 2 ? " +\(districts.count - 2)" : "")"
    }

    static func published(_ island: PublicIsland, now: Date = Date()) -> String? {
        guard let date = date(island.publishedAt) else { return nil }
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Locale(identifier: L.isSpanish ? "es" : "en")
        let relative = formatter.localizedString(for: min(date, now), relativeTo: now)
        return L.t("Published \(relative)", "Publicada \(relative)")
    }
}

#if DEBUG
// MARK: QA fixture — `-land-neighbors-fixture` fills the archipelago with five islands (Debug builds only).

enum ArchipelagoFixture {
    static var enabled: Bool { ProcessInfo.processInfo.arguments.contains("-land-neighbors-fixture") }

    /// Five islands built from the bundled practice snapshot, each transformed and extended differently.
    static func islands(now: Date = Date()) -> [PublicIsland] {
        let titles: [String?] = ["Harbor of Patience", "Quiet Reef", nil, "Three Gates", "Night Ledger"]
        let extras: [[String]] = [
            ["crypto_bay_candle_tower", "crypto_bay_waiting_lighthouse", "crypto_bay_data_dock"],
            ["thesis_citadel_double_gate", "evidence_mines_mother_crystal", "evidence_mines_lantern_drone"],
            ["risk_reef_red_team_observatory", "risk_reef_reef_tile", "risk_reef_blue_sluice"],
            ["thesis_citadel_three_gate_citadel", "axiom_archive_lit_archive", "axiom_archive_return_path"],
            ["risk_reef_double_bridge", "evidence_mines_evidence_workshop", "axiom_archive_archive_ring_tile"],
        ]
        let formatter = ISO8601DateFormatter()
        return titles.indices.map { k in
            var occupied = LandPainter.coreCells
            var placements: [PublicIsland.Placement] = []
            func place(_ id: String, _ col: Int, _ row: Int, _ rotation: Int) -> Bool {
                guard let item = RuntimeBundle.items[TraderLandCatalog.artID(id)] else { return false }
                let cells = landCells(item, LandPlacement(uid: "fixture", itemId: item.id, col: col, row: row, orientation: rotation == 90 ? .nwSE : .neSW))
                guard cells.allSatisfy({ key in
                    let xy = key.split(separator: ":").compactMap { Int($0) }
                    return xy.count == 2 && (0..<8).contains(xy[0]) && (0..<8).contains(xy[1]) && !occupied.contains(key)
                }) else { return false }
                occupied.formUnion(cells)
                placements.append(.init(item_id: id, x: col, y: row, rotation: rotation))
                return true
            }
            for placement in RuntimeBundle.fixture.placements.dropFirst(k == 4 ? 2 : 0) {
                let rotation = placement.orientation == .nwSE ? 90 : 0
                switch k {
                case 1: _ = place(placement.itemId, placement.row, placement.col, 90 - rotation)
                case 2: _ = place(placement.itemId, 7 - placement.row, 7 - placement.col, 90 - rotation)
                case 3: _ = place(placement.itemId, 7 - placement.col, 7 - placement.row, rotation)
                default: _ = place(placement.itemId, placement.col, placement.row, rotation)
                }
            }
            for (n, id) in extras[k].enumerated() {
                let order = (0..<64).sorted { ($0 * 37 + k * 11 + n * 5) % 64 < ($1 * 37 + k * 11 + n * 5) % 64 }
                for cell in order where place(id, cell % 8, cell / 8, (k + n) % 2 == 0 ? 0 : 90) { break }
            }
            let districts = Set(placements.compactMap { RuntimeBundle.items[TraderLandCatalog.artID($0.item_id)]?.district }).sorted()
            return PublicIsland(code: "qafixture\(k)", title: titles[k], size: 8,
                                publishedAt: formatter.string(from: now.addingTimeInterval(-Double(k + 1) * 97_000)),
                                placements: placements, stats: .init(pieces: placements.count, districts: districts))
        }
    }
}
#endif
