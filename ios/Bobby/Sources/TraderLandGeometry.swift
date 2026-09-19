import CoreGraphics
import Foundation

/// Island canvas geometry for an N×N island. Mirrors `landGeometry()` in
/// src/lib/trader-land/geometry.ts (docs/trader-land/GROWTH-v1.md §4): islands keep a
/// constant extent in "island canvas units" (the 860×720 canvas, slab corners
/// 62,391 · 430,207 · 798,391 · 430,575); a grown island packs more, smaller
/// tiles into that same slab: tile = 92·8/N × 46·8/N.
struct GateLayout: Equatable {
    /// Island sizes the server may send; anything else is not an island this build draws.
    static let sizes = [8, 10, 12, 16]
    /// Base tile of an 8×8 island.
    static let baseTile = CGSize(width: 92, height: 46)
    /// Centre of the island slab (iso(3.5, 3.5) of an 8×8), fixed for every size.
    static let islandCenter = CGPoint(x: 430, y: 391)
    /// Slab corners, identical for every size (constant extent).
    static let slabTop = CGPoint(x: 430, y: 207)
    static let slabRight = CGPoint(x: 798, y: 391)
    static let slabBottom = CGPoint(x: 430, y: 575)
    static let slabLeft = CGPoint(x: 62, y: 391)
    static let slabDepth: CGFloat = 22
    static let canvas = CGSize(width: 860, height: 720)
    /// The island canvas point shown at the centre of the map when the camera is at home.
    static let viewCenter = CGPoint(x: 430, y: 335)
    /// A dormant core (stage 0) is drawn at this fraction of its stage-1 size.
    static let dormantCoreScale: CGFloat = 0.72
    /// Growth steps: when occupied cells (pieces + the 2×2 core) reach `threshold`, the island becomes `next`.
    static let growth: [Int: (next: Int, threshold: Int)] = [8: (10, 39), 10: (12, 60), 12: (16, 87)]
    /// The practice island (signed out, `-trader-land-gate`) never grows.
    static let practice = GateLayout(size: 8)

    static func supports(_ size: Int) -> Bool { sizes.contains(size) }

    let size: Int
    let tileWidth: CGFloat
    let tileHeight: CGFloat
    let origin: CGPoint

    /// An unsupported size falls back to 8, like `landSize()` on the web.
    init(size raw: Int) {
        size = Self.supports(raw) ? raw : 8
        tileWidth = Self.baseTile.width * 8 / CGFloat(size)
        tileHeight = Self.baseTile.height * 8 / CGFloat(size)
        origin = CGPoint(x: Self.islandCenter.x, y: Self.islandCenter.y - CGFloat(size - 1) * tileHeight / 2)
    }

    /// Scale of fixed-size decorations (strokes, hit boxes) relative to an 8×8 tile.
    var unit: CGFloat { 8 / CGFloat(size) }
    /// Centre of the grid, in cells: the fog rings and the practice focus are centred here.
    var middle: CGFloat { CGFloat(size - 1) / 2 }

    /// Closest camera zoom on an 8×8 island.
    static let baseMaxZoom: CGFloat = 2.6
    /// Closest camera zoom: scaled by N/8 so a grown island's smaller tiles get as close.
    var maxZoom: CGFloat { Self.baseMaxZoom * CGFloat(size) / 8 }
    /// Home zoom: 12×12 and 16×16 islands start closer so their 1×1 tiles stay tappable.
    var homeZoom: CGFloat { size >= 12 ? 1.25 : 1 }

    /// How far the camera may pan from the island it looks at, in map points, at canvas `scale`
    /// (map fit × zoom). An 8×8 island keeps ±70 % of the map exactly as before Growth v1 (the
    /// practice island never changes); a grown island, whose max zoom scales by N/8, also lets its
    /// far corners (368 × 184 units from the centre, plus the art above the top one) come into view.
    func panSlack(map: CGSize, scale: CGFloat) -> CGSize {
        let base = CGSize(width: map.width * 0.7, height: map.height * 0.7)
        guard size > 8 else { return base }
        return CGSize(width: max(base.width, 368 * scale), height: max(base.height, (184 + 60) * scale))
    }

    /// Centre of cell (column, row) — fractional values allowed.
    func iso(column: CGFloat, row: CGFloat) -> CGPoint {
        CGPoint(x: origin.x + (column - row) * tileWidth / 2,
                y: origin.y + (column + row) * tileHeight / 2)
    }

    /// Inverse of `iso`: the cell under a canvas point (may be outside the island).
    /// floor(value + 0.5) intentionally matches JavaScript Math.round.
    func cellAt(_ point: CGPoint) -> (col: Int, row: Int) {
        let dx = (point.x - origin.x) / (tileWidth / 2), dy = (point.y - origin.y) / (tileHeight / 2)
        return (Int(floor((dx + dy) / 2 + 0.5)), Int(floor((dy - dx) / 2 + 0.5)))
    }

    func contains(col: Int, row: Int) -> Bool { col >= 0 && row >= 0 && col < size && row < size }

    /// Every cell of a "col:row" key set lies on the island.
    func contains(_ cells: Set<String>) -> Bool {
        cells.allSatisfy { key in
            let xy = key.split(separator: ":").compactMap { Int($0) }
            return xy.count == 2 && contains(col: xy[0], row: xy[1])
        }
    }

    /// Fog: a cell is revealed within `radius` rings of the grid centre; nil reveals everything (account islands).
    func revealed(col: Int, row: Int, radius: CGFloat?) -> Bool {
        guard let radius else { return true }
        return max(abs(CGFloat(col) - middle), abs(CGFloat(row) - middle)) <= radius
    }

    /// Corners (top, right, bottom, left) of a cols×rows footprint anchored at (col, row).
    func diamond(col: Int, row: Int, cols: Int, rows: Int) -> [CGPoint] {
        let hw = tileWidth / 2, hh = tileHeight / 2
        let top = iso(column: CGFloat(col), row: CGFloat(row))
        let right = iso(column: CGFloat(col + cols - 1), row: CGFloat(row))
        let bottom = iso(column: CGFloat(col + cols - 1), row: CGFloat(row + rows - 1))
        let left = iso(column: CGFloat(col), row: CGFloat(row + rows - 1))
        return [CGPoint(x: top.x, y: top.y - hh), CGPoint(x: right.x + hw, y: right.y),
                CGPoint(x: bottom.x, y: bottom.y + hh), CGPoint(x: left.x - hw, y: left.y)]
    }

    /// Where a piece's art goes (`spriteFrame()` on the web): the art's anchor (its contact
    /// point, normalized in the frame) sits on the footprint's BOTTOM vertex. `footprint` is
    /// the catalog footprint (unrotated); a flipped piece (nw_se) swaps cols/rows on the
    /// ground and mirrors the art. `scale` shrinks the art only (the dormant core).
    func spriteFrame(footprint: (cols: Int, rows: Int), col: Int, row: Int, flip: Bool,
                     anchor: [CGFloat], contentBounds: [CGFloat], path: Bool = false, scale: CGFloat = 1) -> LandSpriteFrame {
        let cols = flip ? footprint.rows : footprint.cols
        let rows = flip ? footprint.cols : footprint.rows
        let center = iso(column: CGFloat(col) + CGFloat(cols - 1) / 2, row: CGFloat(row) + CGFloat(rows - 1) / 2)
        let ground = center.y + tileHeight * CGFloat(cols + rows) / 4
        let visible = max(0.2, contentBounds[2] - contentBounds[0])
        let side = min(360 * unit, tileWidth * CGFloat(footprint.cols + footprint.rows) / 2 * 0.9 / visible) * scale
        let midX = center.x + (flip ? -1 : 1) * side * (0.5 - anchor[0])
        let midY = ground + side * (0.5 - anchor[1])
        let frame = CGRect(x: midX - side / 2, y: midY - side / 2, width: side, height: side)
        var face: CGRect?
        if path {
            let width = visible * side
            let contentMid = (contentBounds[0] + contentBounds[2]) / 2
            let x = flip ? frame.maxX - side * contentMid : frame.minX + side * contentMid
            face = CGRect(x: x - width / 2, y: frame.minY + contentBounds[1] * side, width: width, height: width / 2)
        }
        return LandSpriteFrame(frame: frame, depth: ground, flip: flip, face: face)
    }
}

/// A piece's square art frame, paint order and (path slabs only) the top face its filament runs on.
struct LandSpriteFrame: Equatable {
    let frame: CGRect
    /// Paint order: y of the footprint's bottom vertex.
    let depth: CGFloat
    let flip: Bool
    let face: CGRect?
}

/// The Aura Core's 2×2 spot on the land and its stage (GROWTH-v1 §1.5): dormant (0) until
/// five pieces stand on the island, then awake (1) for good.
struct LandCore: Equatable {
    /// Practice island, and any account island served by an older API: 3,3 and awake.
    static let practice = LandCore(col: 3, row: 3, stage: 1)
    static let uid = "aura-core"
    static let itemID = "aura_core"

    let col: Int
    let row: Int
    let stage: Int

    var dormant: Bool { stage == 0 }
    /// Manifest art state for this stage.
    var stateKey: String { dormant ? "stage0" : "stage1" }
    var scale: CGFloat { dormant ? GateLayout.dormantCoreScale : 1 }
    var cells: Set<String> { Self.cells(col: col, row: row) }

    static func cells(col: Int, row: Int) -> Set<String> {
        ["\(col):\(row)", "\(col + 1):\(row)", "\(col):\(row + 1)", "\(col + 1):\(row + 1)"]
    }
}

/// The awake Aura Core's runtime orbit motes. Their diameters and glow are fixed decorations drawn
/// for the 8×8 core, so a grown island scales them by 8/N (`GateLayout.unit`) with the core's art.
enum AuraCoreMotes {
    static let count = 7
    static func diameter(_ index: Int, unit: CGFloat) -> CGFloat { (index.isMultiple(of: 3) ? 5 : 3) * unit }
    static func glowRadius(unit: CGFloat) -> CGFloat { 4 * unit }
}

enum TraderLandGeometry {
    /// Preserve the point of the initial grab, including the second tile of a
    /// rotated piece. Translation is measured in stable viewport coordinates;
    /// one cell of an N×N island is half a tile of that island across and down.
    static func draggedPosition(col: Int, row: Int, translation: CGSize, scale: CGFloat, size: Int = 8) -> (col: Int, row: Int) {
        let layout = GateLayout(size: size)
        let safeScale = max(0.001, scale)
        let across = translation.width / (layout.tileWidth / 2 * safeScale)
        let down = translation.height / (layout.tileHeight / 2 * safeScale)
        // floor(value + 0.5) intentionally matches JavaScript Math.round.
        return (
            min(layout.size - 1, max(0, col + Int(floor((across + down) / 2 + 0.5)))),
            min(layout.size - 1, max(0, row + Int(floor((down - across) / 2 + 0.5))))
        )
    }
}
