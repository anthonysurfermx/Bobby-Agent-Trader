import XCTest
@testable import Bobby

/// Island geometry, the archipelago layout and the headline's next action.
final class TraderLandArchipelagoTests: XCTestCase {
    private func world(_ inventory: String) throws -> TraderLandWorld {
        let json = #"{"ok":true,"xp":40,"aura":8,"land":{"size":8,"theme":"night"},"placements":[],"inventory":["# + inventory + "]}"
        return try JSONDecoder().decode(TraderLandWorld.self, from: Data(json.utf8))
    }

    /// The manifest anchor (bottom vertex of the footprint) lands on the footprint's bottom vertex.
    func testSpritesStandOnTheirFootprintBottomVertex() throws {
        for (id, col, row) in [("crypto_bay_data_dock", 2, 5), ("thesis_citadel_double_gate", 1, 1), ("crypto_bay_candle_tower", 4, 6), ("aura_core", 3, 3)] {
            let item = try XCTUnwrap(RuntimeBundle.items[id])
            let state = try XCTUnwrap(item.artState)
            let geometry = try XCTUnwrap(LandSpriteGeometry(item: item, col: col, row: row, orientation: .neSW))
            let bottom = GateLayout.iso(column: CGFloat(col + item.footprint.cols - 1), row: CGFloat(row + item.footprint.rows - 1))
            let anchorY = geometry.frame.minY + state.anchor[1] * geometry.frame.height
            XCTAssertEqual(anchorY, bottom.y + GateLayout.tileHeight / 2, accuracy: 0.01, id)
            XCTAssertEqual(geometry.depth, bottom.y + GateLayout.tileHeight / 2, accuracy: 0.01, id)
            XCTAssertTrue(geometry.footprint.boundingRect.insetBy(dx: -1, dy: -1).contains(CGPoint(x: geometry.frame.midX, y: anchorY - 1)), id)
        }
    }

    func testPathFilamentRunsOnTheSlabTopFace() throws {
        let item = try XCTUnwrap(RuntimeBundle.items["axiom_archive_path_straight"])
        let geometry = try XCTUnwrap(LandSpriteGeometry(item: item, col: 3, row: 2, orientation: .neSW))
        let face = try XCTUnwrap(geometry.topFace)
        XCTAssertLessThan(face.midY, geometry.depth)
        XCTAssertEqual(face.height, face.width / 2, accuracy: 0.01)
    }

    func testRingOneIsSixEvenlySpacedSlotsClockwiseFromTheTop() {
        let ring = (0..<6).map(ArchipelagoLayout.offset)
        XCTAssertEqual(ring[0].x, 0, accuracy: 0.01)
        XCTAssertLessThan(ring[0].y, 0)
        XCTAssertGreaterThan(ring[1].x, 0)
        let distances = ring.map { abs($0.x) / 736 + abs($0.y) / 368 }
        for distance in distances { XCTAssertEqual(distance, distances[0], accuracy: 0.001) }
    }

    func testArchipelagoIslandsNeverOverlap() {
        let slots = [CGPoint.zero] + (0..<24).map(ArchipelagoLayout.offset)
        XCTAssertEqual(Set(slots.map { "\(Int($0.x)):\(Int($0.y))" }).count, slots.count)
        for i in slots.indices {
            for j in slots.indices where j > i {
                // Two equal iso diamonds are disjoint when |dx|/width + |dy|/height ≥ 1.
                let gap = abs(slots[i].x - slots[j].x) / 736 + abs(slots[i].y - slots[j].y) / 368
                XCTAssertGreaterThanOrEqual(gap, 1.5, "\(i) vs \(j)")
            }
        }
    }

    func testSceneResolvesAliasesAndLeavesFreeLotsOnlyInRingOne() {
        let island = PublicIsland(code: "abcdefghij", title: nil, size: 8, publishedAt: "2026-09-10T02:31:12.123456+00:00",
                                  placements: [.init(item_id: "axiom_archive_return_path", x: 1, y: 1, rotation: 0),
                                               .init(item_id: "not_in_manifest", x: 2, y: 2, rotation: 0)],
                                  stats: .init(pieces: 2, districts: ["axiom_archive"]))
        let scene = ArchipelagoScene(islands: [island], showLots: true)
        XCTAssertEqual(scene.islands.count, 1)
        XCTAssertEqual(scene.lots.count, 5)
        let ids = scene.islands[0].sprites.map(\.item.id)
        XCTAssertTrue(ids.contains("axiom_archive_return_path_curve"))
        XCTAssertTrue(ids.contains("aura_core"))
        XCTAssertEqual(ids.count, 2)
        XCTAssertEqual(ArchipelagoScene(islands: [island], showLots: false).lots.count, 0)
    }

#if DEBUG
    func testFixtureIslandsAreValidAndDistinct() throws {
        let islands = ArchipelagoFixture.islands()
        XCTAssertEqual(islands.count, 5)
        XCTAssertEqual(Set(islands.map(\.code)).count, 5)
        for island in islands {
            XCTAssertGreaterThanOrEqual(island.placements.count, 7, island.code)
            var cells = LandPainter.coreCells
            for placement in island.placements {
                let item = try XCTUnwrap(RuntimeBundle.items[TraderLandCatalog.artID(placement.item_id)])
                let footprint = landCells(item, LandPlacement(uid: "t", itemId: item.id, col: placement.x, row: placement.y, orientation: placement.rotation == 90 ? .nwSE : .neSW))
                for key in footprint {
                    let xy = key.split(separator: ":").compactMap { Int($0) }
                    XCTAssertTrue((0..<8).contains(xy[0]) && (0..<8).contains(xy[1]), "\(island.code) \(key)")
                    XCTAssertFalse(cells.contains(key), "\(island.code) overlaps at \(key)")
                }
                cells.formUnion(footprint)
            }
        }
    }
#endif

    func testNextActionPriority() throws {
        let ready = #"{"id":"s1","item_id":"crypto_bay_data_dock","state":"seed","placed":false,"review":{"thesis":null,"reviewAt":"2026-09-18T10:00:00.000Z","ready":true}}"#
        let bloomed = #"{"id":"b1","item_id":"axiom_archive_return_path","state":"bloomed","placed":false}"#
        let growing = #"{"id":"g1","item_id":"risk_reef_dual_orbit_antenna","state":"seed","placed":false,"review":{"thesis":null,"reviewAt":"2099-01-01T00:00:00.000Z","ready":false}}"#
        XCTAssertEqual(LandIslandStatus.nextAction(try world([ready, bloomed, growing].joined(separator: ","))), .review(count: 1))
        XCTAssertEqual(LandIslandStatus.nextAction(try world([bloomed, growing].joined(separator: ","))), .build(count: 1, first: "axiom_archive_return_path_curve"))
        guard case let .growing(count, reviewAt) = LandIslandStatus.nextAction(try world(growing)) else { return XCTFail("expected growing") }
        XCTAssertEqual(count, 1)
        XCTAssertNotNil(reviewAt)
        XCTAssertEqual(LandIslandStatus.nextAction(try world("")), .read)
    }

    /// The server's `route.index` counts pieces already granted: index 3 means the next piece is the 4th.
    func testRouteLineNamesThePieceAfterTheGrantedOnes() throws {
        let json = #"{"ok":true,"xp":40,"aura":8,"land":{"size":8,"theme":"night"},"placements":[],"inventory":[],"route":{"index":3,"total":8,"next":{"id":"thesis_citadel_risk_shield","world":"thesis_citadel"},"complete":false}}"#
        let route = try XCTUnwrap(try JSONDecoder().decode(TraderLandWorld.self, from: Data(json.utf8)).route)
        let line = LandIslandStatus.routeLine(route)
        XCTAssertTrue(line.hasSuffix(L.t("piece 4 of 8", "pieza 4 de 8")), line)
        XCTAssertTrue(line.contains(TraderLandCatalog.name("thesis_citadel_risk_shield", district: "thesis_citadel")), line)
        let done = TraderLandWorld.Route(index: 8, total: 8, next: nil, complete: true)
        XCTAssertEqual(LandIslandStatus.routeLine(done), L.t("Route complete · XP still counts", "Ruta completa · la XP sigue contando"))
    }

    /// The island reloads itself when the soonest growing seed's review opens.
    func testNextReviewAtIsTheSoonestGrowingSeed() throws {
        let open = #"{"id":"s1","item_id":"crypto_bay_data_dock","state":"seed","placed":false,"review":{"thesis":null,"reviewAt":"2026-01-01T00:00:00.000Z","ready":true}}"#
        let later = #"{"id":"s2","item_id":"crypto_bay_data_dock","state":"seed","placed":false,"review":{"thesis":null,"reviewAt":"2099-01-02T00:00:00.000Z","ready":false}}"#
        let sooner = #"{"id":"s3","item_id":"crypto_bay_data_dock","state":"seed","placed":false,"review":{"thesis":null,"reviewAt":"2099-01-01T00:00:00.000Z","ready":false}}"#
        XCTAssertEqual(LandIslandStatus.nextReviewAt(try world([open, later, sooner].joined(separator: ","))), LandIslandStatus.date("2099-01-01T00:00:00.000Z"))
        XCTAssertNil(LandIslandStatus.nextReviewAt(try world(open)))
    }

    /// Warming builds the archipelago's half-size glows off the main thread; the Canvas only reads the cache.
    func testWarmingFillsTheGlowCache() async throws {
        let scene = ArchipelagoScene(islands: [PublicIsland(code: "warm", title: nil, size: 8, publishedAt: nil,
                                                            placements: [.init(item_id: "crypto_bay_data_dock", x: 1, y: 1, rotation: 0)], stats: nil)],
                                     showLots: false)
        let art = scene.artPaths
        XCTAssertFalse(art.glows.isEmpty)
        await LandImageCache.warm(albedos: art.albedos, glows: art.glows)
        for path in art.glows { XCTAssertNotNil(LandImageCache.cachedGlow(path, half: true), path) }
        for path in art.albedos { XCTAssertNotNil(LandImageCache.images.object(forKey: path as NSString), path) }
    }

    func testServerTimestampsAndCountdown() throws {
        XCTAssertNotNil(LandIslandStatus.date("2026-09-10T02:31:12.123456+00:00"))
        XCTAssertNotNil(LandIslandStatus.date("2026-09-19T12:00:00.000Z"))
        XCTAssertNotNil(LandIslandStatus.date("2026-09-19T12:00:00Z"))
        let now = Date()
        XCTAssertEqual(LandIslandStatus.until(now.addingTimeInterval(4.2 * 3600), now: now), "5 h")
        XCTAssertEqual(LandIslandStatus.until(now.addingTimeInterval(39 * 60 + 5), now: now), "40 min")
        XCTAssertNil(LandIslandStatus.until(now.addingTimeInterval(-60), now: now))
    }
}
