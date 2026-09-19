// Standalone contract tests. From ios/Bobby:
//   swiftc -parse-as-library scripts/TraderLandGeometryContract.swift Sources/TraderLandGeometry.swift -o <out> && <out>
// The island geometry must match src/lib/trader-land/geometry.ts (docs/trader-land/GROWTH-v1.md §4).
import CoreGraphics
import Foundation

func near(_ a: CGFloat, _ b: CGFloat, _ tolerance: CGFloat = 0.0001) -> Bool { abs(a - b) <= tolerance }

@main struct TraderLandGeometryContract {
    static func main() {
        // Drag on the 8×8 practice island: one cell = half a 92×46 tile.
        let cases: [(CGFloat, CGFloat, Int, Int)] = [(0,0,2,3),(46,23,3,3),(-46,23,2,4),(46,-23,2,2),(-46,-23,1,3),(0,46,3,4),(92,0,3,2)]
        for scale: CGFloat in [0.3, 0.7, 1, 1.5, 2.6] {
            for (dx, dy, col, row) in cases {
                let value = TraderLandGeometry.draggedPosition(col: 2, row: 3, translation: CGSize(width: dx * scale, height: dy * scale), scale: scale)
                precondition(value.col == col && value.row == row, "Drag geometry mismatch")
            }
        }
        let tiny = TraderLandGeometry.draggedPosition(col: 2, row: 3, translation: CGSize(width: 1, height: 1), scale: 1)
        precondition(tiny.col == 2 && tiny.row == 3)
        let lower = TraderLandGeometry.draggedPosition(col: 0, row: 0, translation: CGSize(width: -500, height: -500), scale: 1)
        precondition(lower.col == 0 && lower.row == 0)
        let upper = TraderLandGeometry.draggedPosition(col: 7, row: 7, translation: CGSize(width: 0, height: 500), scale: 1)
        precondition(upper.col == 7 && upper.row == 7)

        var checks = 38
        for n in GateLayout.sizes {
            let layout = GateLayout(size: n)
            // Tile = 92·8/N × 46·8/N; origin = (430, 391 − (N − 1)·tileH/2).
            precondition(near(layout.tileWidth, 92 * 8 / CGFloat(n)) && near(layout.tileHeight, 46 * 8 / CGFloat(n)), "Tile \(n)")
            precondition(near(layout.origin.x, 430) && near(layout.origin.y, 391 - CGFloat(n - 1) * layout.tileHeight / 2), "Origin \(n)")
            // Constant extent: the slab corners and the island centre never move.
            let slab = layout.diamond(col: 0, row: 0, cols: n, rows: n)
            for (corner, expected) in zip(slab, [GateLayout.slabTop, GateLayout.slabRight, GateLayout.slabBottom, GateLayout.slabLeft]) {
                precondition(near(corner.x, expected.x, 0.001) && near(corner.y, expected.y, 0.001), "Slab corner \(n)")
            }
            let centre = layout.iso(column: layout.middle, row: layout.middle)
            precondition(near(centre.x, 430) && near(centre.y, 391), "Island centre \(n)")
            // iso → cellAt round-trips every cell.
            for col in 0..<n {
                for row in 0..<n {
                    let cell = layout.cellAt(layout.iso(column: CGFloat(col), row: CGFloat(row)))
                    precondition(cell.col == col && cell.row == row, "cellAt \(n) \(col),\(row)")
                    checks += 1
                }
            }
            // Drag: one cell across on an N×N island is half of its own tile.
            let step = TraderLandGeometry.draggedPosition(col: 2, row: 3, translation: CGSize(width: layout.tileWidth / 2, height: layout.tileHeight / 2), scale: 1, size: n)
            precondition(step.col == 3 && step.row == 3, "Drag step \(n)")
            let edge = TraderLandGeometry.draggedPosition(col: n - 1, row: n - 1, translation: CGSize(width: 0, height: 5000), scale: 1, size: n)
            precondition(edge.col == n - 1 && edge.row == n - 1, "Drag clamp \(n)")
            // The art's anchor sits on the footprint's bottom vertex (2×2 core at the centre).
            let anchor: [CGFloat] = [0.499, 0.8901], bounds: [CGFloat] = [0.2402, 0.1484, 0.7583, 0.8901]
            let c = n / 2 - 1
            let frame = layout.spriteFrame(footprint: (2, 2), col: c, row: c, flip: false, anchor: anchor, contentBounds: bounds)
            let bottom = layout.iso(column: CGFloat(c + 1), row: CGFloat(c + 1))
            precondition(near(frame.frame.minY + anchor[1] * frame.frame.height, bottom.y + layout.tileHeight / 2, 0.01), "Sprite anchor \(n)")
            precondition(near(frame.depth, bottom.y + layout.tileHeight / 2, 0.01), "Sprite depth \(n)")
            precondition(frame.frame.width <= 360 * layout.unit + 0.001, "Sprite cap \(n)")
            let dormant = layout.spriteFrame(footprint: (2, 2), col: c, row: c, flip: false, anchor: anchor, contentBounds: bounds, scale: GateLayout.dormantCoreScale)
            precondition(near(dormant.frame.width, frame.frame.width * 0.72, 0.001) && near(dormant.depth, frame.depth), "Dormant core \(n)")
            // The core's motes keep their proportion to the core; the camera's home fits its limits.
            let base = GateLayout.practice.spriteFrame(footprint: (2, 2), col: 3, row: 3, flip: false, anchor: anchor, contentBounds: bounds)
            precondition(near(AuraCoreMotes.diameter(0, unit: layout.unit) / frame.frame.width, 5 / base.frame.width, 0.000001), "Mote size \(n)")
            precondition(near(AuraCoreMotes.glowRadius(unit: layout.unit) / frame.frame.width, 4 / base.frame.width, 0.000001), "Mote glow \(n)")
            precondition(layout.homeZoom <= layout.maxZoom && near(layout.maxZoom, 2.6 * CGFloat(n) / 8), "Zoom limits \(n)")
            checks += 13
        }
        // An 8×8 island (the practice one) pans ±70 % of the map at every zoom, as before Growth v1.
        let map = CGSize(width: 402, height: 500), fit: CGFloat = min(402.0 / 830.0, 500.0 / 640.0)
        for zoom: CGFloat in [0.22, 1, 2.6] {
            let slack = GateLayout.practice.panSlack(map: map, scale: fit * zoom)
            precondition(near(slack.width, 281.4) && near(slack.height, 350), "Practice pan @\(zoom)")
            checks += 1
        }
        let grownSlack = GateLayout(size: 16).panSlack(map: map, scale: fit * 5.2)
        precondition(near(grownSlack.width, 368 * fit * 5.2) && grownSlack.width > 281.4, "Grown pan")
        checks += 1
        precondition(GateLayout(size: 9).size == 8 && !GateLayout.supports(9), "Unsupported sizes fall back to 8")
        precondition(LandCore.cells(col: 3, row: 3) == ["3:3", "4:3", "3:4", "4:4"], "Core cells")
        print("PASS: \(checks) geometry cases — drag at five zoom levels, and at N = 8/10/12/16 tiles, slab, iso/cellAt round trips, drag steps, sprite anchoring, the dormant core, core motes, zoom and pan limits")
    }
}
