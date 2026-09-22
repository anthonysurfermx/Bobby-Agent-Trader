import XCTest
@testable import Bobby

/// The community request is either empty or offline; no production transport is used.
private final class ShowcaseCommunityProtocol: URLProtocol {
    static var responseBody: Data?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let body = Self.responseBody else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}

/// Island geometry, the archipelago layout and the headline's next action.
final class TraderLandArchipelagoTests: XCTestCase {
    private func world(_ inventory: String) throws -> TraderLandWorld {
        let json = #"{"ok":true,"xp":40,"aura":8,"land":{"size":8,"theme":"night"},"placements":[],"inventory":["# + inventory + "]}"
        return try JSONDecoder().decode(TraderLandWorld.self, from: Data(json.utf8))
    }

    /// The manifest anchor (bottom vertex of the footprint) lands on the footprint's bottom vertex,
    /// on every island size and for both core stages.
    func testSpritesStandOnTheirFootprintBottomVertex() throws {
        for n in GateLayout.sizes {
            let layout = GateLayout(size: n)
            for (id, col, row, stage) in [("crypto_bay_data_dock", 2, 5, 1), ("thesis_citadel_double_gate", 1, 1, 1), ("crypto_bay_candle_tower", 4, 6, 1),
                                          ("aura_core", 3, 3, 1), ("aura_core", n - 2, 0, 0)] {
                let item = try XCTUnwrap(RuntimeBundle.items[id])
                let state = try XCTUnwrap(item.kind == "core" ? item.artState(stage == 0 ? "stage0" : "stage1") : item.artState)
                let geometry = try XCTUnwrap(LandSpriteGeometry(item: item, col: col, row: row, orientation: .neSW, layout: layout, coreStage: stage))
                let bottom = layout.iso(column: CGFloat(col + item.footprint.cols - 1), row: CGFloat(row + item.footprint.rows - 1))
                let anchorY = geometry.frame.minY + state.anchor[1] * geometry.frame.height
                let label = "\(id) @\(n) stage \(stage)"
                XCTAssertEqual(anchorY, bottom.y + layout.tileHeight / 2, accuracy: 0.01, label)
                XCTAssertEqual(geometry.depth, bottom.y + layout.tileHeight / 2, accuracy: 0.01, label)
                XCTAssertTrue(geometry.footprint.boundingRect.insetBy(dx: -1, dy: -1).contains(CGPoint(x: geometry.frame.midX, y: anchorY - 1)), label)
                XCTAssertLessThanOrEqual(geometry.frame.width, 360 * layout.unit + 0.001, label)
            }
        }
    }

    /// A dormant core draws its stage0 art at 72 % of the awake core's frame, standing on the same vertex.
    func testDormantCoreIsSmallerOnTheSameVertex() throws {
        let item = try XCTUnwrap(RuntimeBundle.items["aura_core"])
        for n in GateLayout.sizes {
            let layout = GateLayout(size: n)
            let awake = try XCTUnwrap(LandSpriteGeometry(item: item, col: 1, row: 1, orientation: nil, layout: layout, coreStage: 1))
            let dormant = try XCTUnwrap(LandSpriteGeometry(item: item, col: 1, row: 1, orientation: nil, layout: layout, coreStage: 0))
            XCTAssertEqual(dormant.depth, awake.depth, accuracy: 0.001)
            XCTAssertLessThan(dormant.frame.width, awake.frame.width)
            let stage0 = try XCTUnwrap(item.artState("stage0")), stage1 = try XCTUnwrap(item.artState("stage1"))
            let full = layout.spriteFrame(footprint: (2, 2), col: 1, row: 1, flip: false, anchor: stage0.anchor, contentBounds: stage0.contentBounds)
            XCTAssertEqual(dormant.frame.width, full.frame.width * GateLayout.dormantCoreScale, accuracy: 0.001)
            XCTAssertNotEqual(stage0.contentBounds, stage1.contentBounds)
        }
    }

    func testPathFilamentRunsOnTheSlabTopFace() throws {
        let item = try XCTUnwrap(RuntimeBundle.items["axiom_archive_path_straight"])
        let geometry = try XCTUnwrap(LandSpriteGeometry(item: item, col: 3, row: 2, orientation: .neSW, layout: .practice))
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

    /// A grown neighbour is drawn with its own N-scaled tiles and its own core (moved, dormant).
    func testSceneDrawsGrownIslandsWithTheirOwnCore() throws {
        let grown = PublicIsland(code: "grown12345", title: "Tall", size: 12, publishedAt: nil,
                                 placements: [.init(item_id: "crypto_bay_data_dock", x: 11, y: 11, rotation: 0),
                                              .init(item_id: "crypto_bay_candle_tower", x: 11, y: 0, rotation: 0),
                                              .init(item_id: "aura_core", x: 0, y: 0, rotation: 0)],
                                 stats: nil, core: .init(x: 8, y: 2, stage: 0))
        let scene = ArchipelagoScene(islands: [grown], showLots: false)
        let island = try XCTUnwrap(scene.islands.first)
        XCTAssertEqual(island.layout.size, 12)
        // The 2×1 tower at x 11 overflows a 12-wide island and the core never comes from placements.
        XCTAssertEqual(island.sprites.map(\.item.id).sorted(), ["aura_core", "crypto_bay_data_dock"])
        let core = try XCTUnwrap(island.sprites.first { $0.item.kind == "core" })
        XCTAssertEqual(core.state.contentBounds, RuntimeBundle.items["aura_core"]?.artState("stage0")?.contentBounds)
        let bottom = island.layout.iso(column: 9, row: 3)
        XCTAssertEqual(core.geometry.depth, bottom.y + island.layout.tileHeight / 2, accuracy: 0.01)
        XCTAssertEqual(island.freeCells.count, 144 - 1 - 4)
        XCTAssertFalse(island.freeCells.contains { $0 == (8, 2) || $0 == (9, 3) })
        // An older server sends no core: 3,3 awake.
        let old = ArchipelagoScene(islands: [PublicIsland(code: "old", title: nil, size: 8, publishedAt: nil, placements: [], stats: nil)], showLots: false)
        XCTAssertEqual(old.islands.first?.freeCells.count, 60)
        XCTAssertEqual(old.islands.first?.sprites.first?.state.contentBounds, RuntimeBundle.items["aura_core"]?.artState("stage1")?.contentBounds)
    }

    func testPermanentShowcaseIsBuiltAndClearlyIdentified() throws {
        let island = TraderLandShowcase.island
        XCTAssertEqual(island.title, "Satoshi Nakamoto")
        XCTAssertTrue(island.isShowcase)
        XCTAssertEqual(island.coreSpot.stage, 1)
        XCTAssertNil(island.publishedAt, "The sample must not pretend to be a recent user publication")
        XCTAssertEqual(LandIslandStatus.published(island), L.t("Bobby showcase island", "Isla de muestra de Bobby"))
        XCTAssertTrue(island.placements.contains { $0.item_id == "evidence_mines_mother_crystal" })
        XCTAssertTrue(island.placements.contains { $0.item_id == "thesis_citadel_double_gate" })
        XCTAssertEqual(island.placements.count, 10)
        var occupied = island.coreSpot.cells
        for placement in island.placements {
            let item = try XCTUnwrap(RuntimeBundle.items[TraderLandCatalog.artID(placement.item_id)])
            let cells = landCells(item, .init(uid: placement.item_id, itemId: item.id, col: placement.x, row: placement.y, orientation: placement.rotation == 90 ? .nwSE : .neSW))
            XCTAssertTrue(GateLayout(size: island.size).contains(cells))
            XCTAssertTrue(occupied.isDisjoint(with: cells), placement.item_id)
            occupied.formUnion(cells)
        }
    }

    func testShowcaseStaysFirstWithEmptyFullOrDuplicateCommunityResults() {
        let sample = TraderLandShowcase.island
        let community = (0..<30).map { PublicIsland(code: "user-\($0)", title: "Island \($0)", size: 8, publishedAt: nil, placements: [], stats: nil) }
        XCTAssertEqual(TraderLandShowcase.neighbors(among: [], excluding: nil), [sample])
        let merged = TraderLandShowcase.neighbors(among: community + [sample, sample], excluding: "user-0")
        XCTAssertEqual(merged.count, 24)
        XCTAssertEqual(merged.first, sample)
        XCTAssertEqual(merged.filter(\.isShowcase).count, 1)
        XCTAssertFalse(merged.contains { $0.code == "user-0" })
        XCTAssertEqual(merged[1].code, "user-1")
    }

    @MainActor func testOfflineAndEmptyCommunityKeepThePermanentIslandAvailable() async {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [ShowcaseCommunityProtocol.self]
        let transport = URLSession(configuration: config)
        defer { transport.invalidateAndCancel(); ShowcaseCommunityProtocol.responseBody = nil }
        let neighbors = TraderLandNeighbors(transport: transport)
        ShowcaseCommunityProtocol.responseBody = nil
        await neighbors.load(excluding: nil)
        XCTAssertTrue(neighbors.failed)
        XCTAssertTrue(neighbors.loaded)
        XCTAssertEqual(TraderLandShowcase.neighbors(among: neighbors.islands, excluding: nil), [TraderLandShowcase.island])
        ShowcaseCommunityProtocol.responseBody = Data(#"{"ok":true,"worlds":[]}"#.utf8)
        await neighbors.load(excluding: nil)
        XCTAssertFalse(neighbors.failed)
        XCTAssertEqual(TraderLandShowcase.neighbors(among: neighbors.islands, excluding: nil), [TraderLandShowcase.island])
    }

#if DEBUG
    func testFixtureIslandsAreValidAndDistinct() throws {
        let islands = ArchipelagoFixture.islands()
        XCTAssertEqual(islands.count, 5)
        XCTAssertEqual(Set(islands.map(\.code)).count, 5)
        XCTAssertEqual(islands.map(\.size), [8, 8, 10, 12, 16])
        XCTAssertTrue(islands.contains { $0.core?.stage == 0 })
        for island in islands {
            XCTAssertGreaterThanOrEqual(island.placements.count, 7, island.code)
            var cells = island.coreSpot.cells
            for placement in island.placements {
                let item = try XCTUnwrap(RuntimeBundle.items[TraderLandCatalog.artID(placement.item_id)])
                let footprint = landCells(item, LandPlacement(uid: "t", itemId: item.id, col: placement.x, row: placement.y, orientation: placement.rotation == 90 ? .nwSE : .neSW))
                for key in footprint {
                    let xy = key.split(separator: ":").compactMap { Int($0) }
                    XCTAssertTrue(GateLayout(size: island.size).contains(col: xy[0], row: xy[1]), "\(island.code) \(key)")
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
        XCTAssertEqual(LandIslandStatus.until(now.addingTimeInterval(47 * 3600), now: now), "47 h")
        XCTAssertEqual(LandIslandStatus.until(now.addingTimeInterval(167.5 * 3600), now: now), "7 d")
        XCTAssertNil(LandIslandStatus.until(now.addingTimeInterval(-60), now: now))
    }
}
