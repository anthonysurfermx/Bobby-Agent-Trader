import XCTest
@testable import Bobby

/// Growth v1 on the iOS island (docs/trader-land/GROWTH-v1.md): the new payload, the payload
/// build 31 reads, the N×N geometry and the new mutation bodies.
final class TraderLandGrowthTests: XCTestCase {
    /// Everything §3 adds, in one world.
    private let fullPayload = """
    {"ok":true,"xp":260,"aura":52,
     "land":{"size":10,"theme":"default","visibility":"public","share_code":"ab12cd","title":"Reef","published_at":"2026-09-19T10:00:00.000Z",
             "core":{"x":6,"y":2,"stage":0},"growth":{"occupied":22,"threshold":60,"nextSize":12}},
     "capabilities":{"move":true,"close":true,"extend":true,"moveCore":true,"grow":true},
     "inventory":[
       {"id":"s1","item_id":"evidence_mines_crystal_vein_rock","state":"seed","source":"route","placed":false,"seeded_at":"2026-09-19T08:00:00.000Z","bloomed_at":null,
        "item":{"id":"evidence_mines_crystal_vein_rock"},
        "review":{"thesis":{"symbol":"BTC","direction":"long","price":64250,"entry":null},"readAt":"2026-09-19T08:00:00.000Z","reviewAt":"2026-09-20T08:00:00.000Z","ready":false},
        "horizon":{"hours":24,"tier":"common","reviewAt":"2026-09-20T08:00:00.000Z","extendable":true,"extendTo":[72,168]}},
       {"id":"s2","item_id":"crypto_bay_candle_tower","state":"seed","source":"route","placed":false,
        "review":{"thesis":null,"reviewAt":"2026-09-22T08:00:00.000Z","ready":false},
        "horizon":{"hours":72,"tier":"building","reviewAt":"2026-09-22T08:00:00.000Z","extendable":true,"extendTo":[168]}},
       {"id":"b1","item_id":"crypto_bay_data_dock","state":"bloomed","source":"route","placed":true,
        "horizon":{"hours":24,"tier":"common","reviewAt":"2026-09-18T08:00:00.000Z","extendable":false,"extendTo":[]}}
     ],
     "placements":[{"id":"p1","inventory_id":"b1","x":2,"y":6,"rotation":0}],
     "tiers":[
       {"id":"common","hours":24,"footprint":[1,1],"length":15,"held":6,"next":{"id":"axiom_archive_aura_flower","world":"axiom_archive","attribution":"","kind":"decor","name":{"en":"Aura Flower","es":"Flor de Aura"},"footprint":[1,1]}},
       {"id":"building","hours":72,"footprint":[2,1],"length":5,"held":1,"next":{"id":"crypto_bay_candle_tower","world":"crypto_bay","attribution":"","kind":"building","name":{"en":"Candle Tower","es":"Torre de Velas"},"footprint":[2,1]}},
       {"id":"landmark","hours":168,"footprint":[2,2],"length":5,"held":0,"next":{"id":"crypto_bay_waiting_lighthouse","world":"crypto_bay","attribution":"","kind":"landmark","name":{"en":"Waiting Lighthouse"},"footprint":[2,2]}}
     ],
     "route":{"index":6,"total":15,"next":{"id":"axiom_archive_aura_flower","world":"axiom_archive"},"complete":false},
     "review":{"windowHours":24,"ready":0},
     "share":{"public":true,"code":"ab12cd","title":"Reef","publishedAt":"2026-09-19T10:00:00.000Z"},
     "grew":{"from":8,"to":10,"shift":1},
     "extended":{"inventoryId":"s2","item":{"id":"crypto_bay_candle_tower","world":"crypto_bay","kind":"building","name":{"en":"Candle Tower","es":"Torre de Velas"},"footprint":[2,1]},
                 "horizon":{"hours":72,"tier":"building","reviewAt":"2026-09-22T08:00:00.000Z","extendable":true,"extendTo":[168]}},
     "coreMoved":{"x":6,"y":2}}
    """

    /// What build 31 reads today (live server, before Growth v1): no core, growth, horizon or tiers.
    private let build31Payload = """
    {"ok":true,"xp":120,"aura":40,"land":{"size":8,"theme":"default"},
     "capabilities":{"move":true,"close":true},
     "share":{"public":false,"code":null,"title":null,"publishedAt":null},
     "season":{"id":"s1","name":{"en":"Season I","es":"Temporada I"},"total":6,"earned":0,"next":null,"complete":false},
     "route":{"index":3,"total":8,"next":{"id":"thesis_citadel_risk_shield","world":"thesis_citadel"},"complete":false},
     "review":{"windowHours":24,"ready":1},
     "inventory":[
       {"id":"i1","item_id":"crypto_bay_data_dock","state":"seed","source":"route","placed":false,"item":null,
        "review":{"thesis":{"symbol":"NVDA","direction":"long","price":181.2,"entry":null},"readAt":null,"reviewAt":"2026-09-11T10:00:00.000Z","ready":true}},
       {"id":"i2","item_id":"thesis_citadel_double_gate","state":"bloomed","source":"route","placed":true,"item":null}
     ],
     "placements":[{"id":"p1","inventory_id":"i2","x":1,"y":1,"rotation":90}]}
    """

    private func decode(_ json: String) throws -> TraderLandWorld {
        try JSONDecoder().decode(TraderLandWorld.self, from: Data(json.utf8))
    }

    func testDecodesTheFullGrowthPayload() throws {
        let world = try decode(fullPayload)
        XCTAssertEqual(world.land.size, 10)
        XCTAssertEqual(world.core, LandCore(col: 6, row: 2, stage: 0))
        XCTAssertTrue(world.core.dormant)
        XCTAssertEqual(world.land.growth?.occupied, 22)
        XCTAssertEqual(world.land.growth?.threshold, 60)
        XCTAssertEqual(world.land.growth?.nextSize, 12)
        XCTAssertEqual(world.capabilities?.extend, true)
        XCTAssertEqual(world.capabilities?.moveCore, true)
        XCTAssertEqual(world.capabilities?.grow, true)
        let seed = try XCTUnwrap(world.inventory.first)
        XCTAssertEqual(seed.horizon?.value, .day)
        XCTAssertEqual(seed.horizon?.tier, "common")
        XCTAssertEqual(seed.horizon?.options, [.threeDays, .week])
        XCTAssertEqual(world.inventory[1].horizon?.options, [.week])
        XCTAssertEqual(world.inventory[2].horizon?.options, [])
        XCTAssertEqual(world.tiers?.count, 3)
        XCTAssertEqual(world.tier(.threeDays)?.next?.id, "crypto_bay_candle_tower")
        XCTAssertEqual(world.tier(.week)?.next?.id, "crypto_bay_waiting_lighthouse")
        // A partial name never breaks the world; the piece keeps its id.
        XCTAssertNil(world.tier(.week)?.next?.name)
        XCTAssertEqual(world.tier(.day)?.held, 6)
        XCTAssertEqual(world.grew?.to, 10)
        XCTAssertEqual(world.grew?.shift, 1)
        XCTAssertEqual(world.extended?.item?.id, "crypto_bay_candle_tower")
        XCTAssertEqual(world.extended?.horizon?.hours, 72)
        XCTAssertEqual(world.coreMoved?.x, 6)
        XCTAssertEqual(LandIslandStatus.growthStatus(world), L.t("10×10 · 22/60 · CORE DORMANT", "10×10 · 22/60 · NÚCLEO DORMIDO"))
        XCTAssertEqual(LandIslandStatus.grewNotice(try XCTUnwrap(world.grew)), L.t("Your island grew to 10×10.", "Tu isla creció a 10×10."))
        let line = try XCTUnwrap(LandIslandStatus.tiersLine(world))
        XCTAssertTrue(line.contains(TraderLandCatalog.name("axiom_archive_aura_flower")), line)
        XCTAssertTrue(line.contains(TraderLandCatalog.name("crypto_bay_candle_tower")), line)
        XCTAssertTrue(line.contains(TraderLandCatalog.name("crypto_bay_waiting_lighthouse")), line)
    }

    func testBuild31PayloadStillDecodes() throws {
        let world = try decode(build31Payload)
        XCTAssertEqual(world.land.size, 8)
        XCTAssertNil(world.land.core); XCTAssertNil(world.land.growth)
        XCTAssertEqual(world.core, .practice, "An older server's core stands at 3,3, awake")
        XCTAssertNil(world.tiers); XCTAssertNil(world.grew); XCTAssertNil(world.extended); XCTAssertNil(world.coreMoved)
        XCTAssertNil(world.capabilities?.extend); XCTAssertNil(world.capabilities?.moveCore)
        XCTAssertNil(world.inventory[0].horizon)
        XCTAssertEqual(world.inventory[0].review?.ready, true)
        XCTAssertNil(LandIslandStatus.tiersLine(world))
        // Occupied falls back to the placements (a 2×1 gate) plus the 2×2 core.
        XCTAssertEqual(LandIslandStatus.occupied(world), 6)
        XCTAssertEqual(LandIslandStatus.growthStatus(world), L.t("8×8 · 6/39 · CORE AWAKE", "8×8 · 6/39 · NÚCLEO DESPIERTO"))
    }

    func testFullSizeIslandSaysSo() throws {
        let json = #"{"ok":true,"xp":0,"aura":0,"land":{"size":16,"theme":"default","core":{"x":7,"y":7,"stage":1},"growth":{"occupied":120,"threshold":null,"nextSize":null}},"inventory":[],"placements":[]}"#
        XCTAssertEqual(LandIslandStatus.growthStatus(try decode(json)), L.t("16×16 · FULL SIZE · CORE AWAKE", "16×16 · TAMAÑO MÁXIMO · NÚCLEO DESPIERTO"))
    }

    func testMutationBodies() {
        let extend = TraderLandMutation.extend(inventoryID: "s1", hours: 168).body
        XCTAssertEqual(extend.count, 3)
        XCTAssertEqual(extend["action"] as? String, "extend")
        XCTAssertEqual(extend["inventoryId"] as? String, "s1")
        XCTAssertEqual(extend["hours"] as? Int, 168)
        let moveCore = TraderLandMutation.moveCore(x: 4, y: 7).body
        XCTAssertEqual(moveCore.count, 3)
        XCTAssertEqual(moveCore["action"] as? String, "move_core")
        XCTAssertEqual(moveCore["x"] as? Int, 4)
        XCTAssertEqual(moveCore["y"] as? Int, 7)
        // Serialises to the exact JSON the API reads.
        let data = try? JSONSerialization.data(withJSONObject: moveCore, options: [.sortedKeys])
        XCTAssertEqual(data.flatMap { String(data: $0, encoding: .utf8) }, #"{"action":"move_core","x":4,"y":7}"#)
        XCTAssertEqual(TraderLandSync.clientHeader, "X-Trader-Land-Client")
        XCTAssertEqual(TraderLandSync.clientVersion, "2")
    }

    func testRefusalsReadAsPlainLanguage() {
        XCTAssertEqual(TraderLandSync.failure(status: 409, serverError: "Its review is already open"),
                       L.t("Its review is already open, so its horizon can no longer grow. Reload to review it.", "Su revisión ya está abierta, así que su horizonte ya no puede crecer. Recarga para revisarla."))
        XCTAssertEqual(TraderLandSync.failure(status: 409, serverError: "The island changed. Reload before trying again."),
                       L.t("The island changed. Reload before trying again.", "La isla cambió. Recarga antes de intentarlo de nuevo."))
        XCTAssertNotEqual(TraderLandSync.failure(status: 400, serverError: "A horizon can only grow"), TraderLandSync.failure(status: 500, serverError: nil))
    }

    /// iso ↔ cellAt round-trip for every cell, the slab never moves, and tiles shrink by 8/N.
    func testGeometryAtEverySize() {
        for n in [8, 10, 12, 16] {
            let layout = GateLayout(size: n)
            XCTAssertEqual(layout.size, n)
            XCTAssertEqual(layout.tileWidth, 92 * 8 / CGFloat(n), accuracy: 0.0001)
            XCTAssertEqual(layout.tileHeight, 46 * 8 / CGFloat(n), accuracy: 0.0001)
            XCTAssertEqual(layout.origin.y, 391 - CGFloat(n - 1) * layout.tileHeight / 2, accuracy: 0.0001)
            for col in 0..<n {
                for row in 0..<n {
                    let point = layout.iso(column: CGFloat(col), row: CGFloat(row))
                    let cell = layout.cellAt(point)
                    XCTAssertTrue(cell.col == col && cell.row == row, "\(n): \(col),\(row) → \(cell)")
                    // A tap anywhere well inside the tile's diamond maps to the same cell.
                    let nudged = layout.cellAt(CGPoint(x: point.x + layout.tileWidth * 0.2, y: point.y + layout.tileHeight * 0.1))
                    XCTAssertTrue(nudged.col == col && nudged.row == row, "\(n): nudged \(col),\(row)")
                }
            }
            let corners = layout.diamond(col: 0, row: 0, cols: n, rows: n)
            for (corner, expected) in zip(corners, [GateLayout.slabTop, GateLayout.slabRight, GateLayout.slabBottom, GateLayout.slabLeft]) {
                XCTAssertEqual(corner.x, expected.x, accuracy: 0.001, "\(n)")
                XCTAssertEqual(corner.y, expected.y, accuracy: 0.001, "\(n)")
            }
            XCTAssertEqual(LandPainter.footprint(layout, col: 0, row: 0, cols: n, rows: n).boundingRect.insetBy(dx: 0.01, dy: 0.01).width,
                           LandPainter.island.boundingRect.insetBy(dx: 0.01, dy: 0.01).width, accuracy: 0.01)
            let centre = layout.iso(column: layout.middle, row: layout.middle)
            XCTAssertEqual(centre.x, GateLayout.islandCenter.x, accuracy: 0.001)
            XCTAssertEqual(centre.y, GateLayout.islandCenter.y, accuracy: 0.001)
            // Fog rings centre on (N−1)/2; nil reveals everything.
            XCTAssertTrue(layout.revealed(col: 0, row: 0, radius: nil))
            XCTAssertFalse(layout.revealed(col: 0, row: 0, radius: 1.5))
            XCTAssertTrue(layout.revealed(col: n / 2, row: n / 2, radius: 0.5))
        }
        XCTAssertEqual(GateLayout(size: 14).size, 8)
        XCTAssertEqual(GateLayout.growth[8]?.threshold, 39)
        XCTAssertEqual(GateLayout.growth[10]?.threshold, 60)
        XCTAssertEqual(GateLayout.growth[12]?.threshold, 87)
        XCTAssertNil(GateLayout.growth[16])
    }

    func testDragStepsFollowTheIslandsTiles() {
        for n in GateLayout.sizes {
            let layout = GateLayout(size: n)
            for scale: CGFloat in [0.45, 1, 2.6] {
                let across = TraderLandGeometry.draggedPosition(col: 2, row: 3, translation: CGSize(width: layout.tileWidth / 2 * scale, height: layout.tileHeight / 2 * scale), scale: scale, size: n)
                XCTAssertTrue(across.col == 3 && across.row == 3, "\(n) @\(scale)")
                let down = TraderLandGeometry.draggedPosition(col: 2, row: 3, translation: CGSize(width: 0, height: layout.tileHeight * scale), scale: scale, size: n)
                XCTAssertTrue(down.col == 3 && down.row == 4, "\(n) @\(scale)")
            }
            let clamped = TraderLandGeometry.draggedPosition(col: 0, row: 0, translation: CGSize(width: 0, height: 10_000), scale: 1, size: n)
            XCTAssertTrue(clamped.col == n - 1 && clamped.row == n - 1)
        }
    }

    func testCoreCellsAndStages() {
        XCTAssertEqual(LandCore.practice.cells, ["3:3", "3:4", "4:3", "4:4"])
        XCTAssertEqual(LandCore(col: 6, row: 2, stage: 0).cells, ["6:2", "7:2", "6:3", "7:3"])
        XCTAssertEqual(LandCore(col: 6, row: 2, stage: 0).stateKey, "stage0")
        XCTAssertEqual(LandCore(col: 6, row: 2, stage: 0).scale, 0.72)
        XCTAssertEqual(LandCore.practice.stateKey, "stage1")
        XCTAssertEqual(LandCore.practice.scale, 1)
        XCTAssertEqual(PublicIsland(code: "x", title: nil, size: 10, publishedAt: nil, placements: [], stats: nil).coreSpot, .practice)
        XCTAssertEqual(PublicIsland(code: "x", title: nil, size: 10, publishedAt: nil, placements: [], stats: nil, core: .init(x: 1, y: 5, stage: 0)).coreSpot,
                       LandCore(col: 1, row: 5, stage: 0))
    }

    /// An account island draws and reserves no core until its world arrives (and none after a
    /// failed first load); the practice island always stands with the snapshot's 3,3 awake core.
    func testAccountIslandHasNoCoreUntilItsWorldArrives() throws {
        XCTAssertNil(LandCore.standing(accountIsland: true, world: nil))
        XCTAssertEqual(LandCore.standing(accountIsland: true, world: try decode(fullPayload)), LandCore(col: 6, row: 2, stage: 0))
        XCTAssertEqual(LandCore.standing(accountIsland: true, world: try decode(build31Payload)), .practice, "An older server's island: 3,3 awake")
        XCTAssertEqual(LandCore.standing(accountIsland: false, world: nil), .practice)
        XCTAssertEqual(LandCore.standing(accountIsland: false, world: try decode(fullPayload)), .practice, "The practice island never takes an account's core")
        XCTAssertEqual(RuntimeBundle.fixture.core.col, LandCore.practice.col)
        XCTAssertEqual(RuntimeBundle.fixture.core.row, LandCore.practice.row)
    }

    /// Camera limits (GROWTH-v1 §4): max zoom scales by N/8, 12×12 and 16×16 start closer, and every
    /// island's home fits the practice island's limits, so a reset to home is always in range.
    func testCameraLimitsPerSize() {
        XCTAssertEqual(GateLayout.practice.maxZoom, 2.6, accuracy: 0.0001)
        XCTAssertEqual(GateLayout.practice.homeZoom, 1)
        XCTAssertEqual(GateLayout(size: 10).maxZoom, 3.25, accuracy: 0.0001)
        XCTAssertEqual(GateLayout(size: 10).homeZoom, 1)
        XCTAssertEqual(GateLayout(size: 12).homeZoom, 1.25)
        XCTAssertEqual(GateLayout(size: 16).maxZoom, 5.2, accuracy: 0.0001)
        XCTAssertEqual(GateLayout(size: 16).homeZoom, 1.25)
        for n in GateLayout.sizes {
            XCTAssertLessThanOrEqual(GateLayout(size: n).homeZoom, GateLayout(size: n).maxZoom)
            XCTAssertLessThanOrEqual(GateLayout(size: n).homeZoom, GateLayout.practice.maxZoom)
        }
    }

    /// The practice island (and any 8×8) pans exactly as before Growth v1: ±70 % of the map at every
    /// zoom. Only a grown island loosens the limit, so its far corners can reach the screen.
    func testPracticeIslandKeepsItsPanLimits() {
        let map = CGSize(width: 402, height: 500)
        let fit = min(map.width / 830, map.height / 640)
        for zoom: CGFloat in [0.22, 0.9, 1, 2, GateLayout.practice.maxZoom] {
            let slack = GateLayout.practice.panSlack(map: map, scale: fit * zoom)
            XCTAssertEqual(slack.width, map.width * 0.7, accuracy: 0.0001, "@\(zoom)")
            XCTAssertEqual(slack.height, map.height * 0.7, accuracy: 0.0001, "@\(zoom)")
        }
        let grown = GateLayout(size: 16)
        let close = fit * grown.maxZoom
        XCTAssertEqual(grown.panSlack(map: map, scale: close).width, 368 * close, accuracy: 0.0001)
        XCTAssertEqual(grown.panSlack(map: map, scale: close).height, 244 * close, accuracy: 0.0001)
        XCTAssertGreaterThan(grown.panSlack(map: map, scale: close).width, map.width * 0.7)
        // At its home zoom a grown island is held as tightly as an 8×8.
        XCTAssertEqual(grown.panSlack(map: map, scale: fit * grown.homeZoom).width, map.width * 0.7, accuracy: 0.0001)
    }

    /// The awake core's orbit motes and their glow keep their 8×8 size (5 / 3 pt, 4 pt glow) and
    /// shrink with the core's art on a grown island: same proportion to the core at every size.
    func testCoreMotesScaleWithTheCore() throws {
        let item = try XCTUnwrap(RuntimeBundle.items[LandCore.itemID])
        XCTAssertEqual(AuraCoreMotes.diameter(0, unit: 1), 5)
        XCTAssertEqual(AuraCoreMotes.diameter(1, unit: 1), 3)
        XCTAssertEqual(AuraCoreMotes.glowRadius(unit: 1), 4)
        let practice = try XCTUnwrap(LandSpriteGeometry(item: item, col: 3, row: 3, orientation: nil, layout: .practice)).frame.width
        for n in GateLayout.sizes {
            let layout = GateLayout(size: n)
            let side = try XCTUnwrap(LandSpriteGeometry(item: item, col: 0, row: 0, orientation: nil, layout: layout)).frame.width
            for index in 0..<AuraCoreMotes.count {
                XCTAssertEqual(AuraCoreMotes.diameter(index, unit: layout.unit) / side, AuraCoreMotes.diameter(index, unit: 1) / practice, accuracy: 1e-9, "\(n)")
            }
            XCTAssertEqual(AuraCoreMotes.glowRadius(unit: layout.unit) / side, AuraCoreMotes.glowRadius(unit: 1) / practice, accuracy: 1e-9, "\(n)")
        }
    }

    /// Help step 4: only an account island grows and has a core to tap; the practice island says so.
    @MainActor func testHelpNeverPromisesThePracticeIslandAMovableCore() {
        let tap = L.t("tap it to move it", "tócalo para moverlo")
        let practice = TraderLandGateHarnessView.growthHelp(accountIsland: false)
        XCTAssertFalse(practice.contains(tap))
        XCTAssertTrue(practice.hasSuffix(L.t("This practice island stays 8×8.", "Esta isla de práctica se queda en 8×8.")))
        XCTAssertTrue(TraderLandGateHarnessView.growthHelp(accountIsland: true).contains(tap))
    }

    func testPublicIslandDecodesItsCore() throws {
        let json = #"{"ok":true,"worlds":[{"code":"abc","title":null,"size":12,"theme":"default","publishedAt":null,"placements":[],"stats":{"pieces":0,"districts":[]},"core":{"x":4,"y":4,"stage":1}},{"code":"old","title":"Old","size":8,"placements":[]}]}"#
        struct Gallery: Decodable { let worlds: [PublicIsland] }
        let worlds = try JSONDecoder().decode(Gallery.self, from: Data(json.utf8)).worlds
        XCTAssertEqual(worlds[0].core, .init(x: 4, y: 4, stage: 1))
        XCTAssertNil(worlds[1].core)
    }

    func testHorizonOptionLabels() {
        XCTAssertEqual(LandHorizon.threeDays.optionLabel, L.t("3\u{00A0}days · building 2×1", "3\u{00A0}días · edificio 2×1"))
        XCTAssertEqual(LandHorizon.week.optionLabel, L.t("7\u{00A0}days · landmark 2×2", "7\u{00A0}días · monumento 2×2"))
    }

#if DEBUG
    /// The `-trader-land-account-fixture` world and its in-memory rules.
    @MainActor func testAccountFixtureWorldAndRules() throws {
        let fixture = TraderLandAccountFixture()
        let world = fixture.world()
        XCTAssertEqual(world.land.size, 10)
        XCTAssertEqual(world.core, LandCore(col: 6, row: 2, stage: 0))
        XCTAssertEqual(world.capabilities?.moveCore, true)
        let growing = try XCTUnwrap(world.inventory.first { $0.id == "fx-seed-growing" })
        XCTAssertEqual(growing.horizon?.options, [.threeDays, .week])
        XCTAssertEqual(world.inventory.first { $0.id == "fx-seed-ready" }?.review?.ready, true)
        XCTAssertEqual(world.inventory.first { $0.id == "fx-seed-ready" }?.horizon?.options, [])
        XCTAssertEqual(world.tier(.day)?.next?.id, "axiom_archive_aura_flower")
        XCTAssertEqual(world.tier(.threeDays)?.next?.id, "crypto_bay_candle_tower")
        XCTAssertEqual(world.tier(.week)?.next?.id, "crypto_bay_waiting_lighthouse")
        XCTAssertEqual(world.land.growth?.occupied, 9)

        // Extending re-points the seed to the next building and frees its common slot.
        let extended = try fixture.apply(.extend(inventoryID: "fx-seed-growing", hours: 72)).get()
        let seed = try XCTUnwrap(extended.inventory.first { $0.id == "fx-seed-growing" })
        XCTAssertEqual(seed.item_id, "crypto_bay_candle_tower")
        XCTAssertEqual(seed.horizon?.hours, 72)
        XCTAssertEqual(seed.horizon?.options, [.week])
        XCTAssertEqual(extended.extended?.item?.id, "crypto_bay_candle_tower")
        XCTAssertEqual(extended.tier(.threeDays)?.next?.id, "evidence_mines_evidence_workshop")
        XCTAssertEqual(extended.tier(.day)?.next?.id, "axiom_archive_return_path")
        XCTAssertEqual(try? fixture.apply(.extend(inventoryID: "fx-seed-growing", hours: 72)).get().ok, nil, "A horizon only grows")
        XCTAssertEqual(try? fixture.apply(.extend(inventoryID: "fx-seed-ready", hours: 168)).get().ok, nil, "Its review is already open")

        // The core refuses a spot a piece holds, then moves to a free one.
        guard case let .failure(refusal) = fixture.apply(.moveCore(x: 3, y: 3)) else { return XCTFail("core onto the gate") }
        XCTAssertEqual(refusal.status, 409)
        guard case let .failure(outside) = fixture.apply(.moveCore(x: 9, y: 0)) else { return XCTFail("core off the island") }
        XCTAssertEqual(outside.status, 400)
        let moved = try fixture.apply(.moveCore(x: 0, y: 0)).get()
        XCTAssertEqual(moved.core, LandCore(col: 0, row: 0, stage: 0))
        XCTAssertEqual(moved.coreMoved?.x, 0)

        // A fifth piece wakes the core.
        let placed = try fixture.apply(.place(inventoryID: "fx-shield", x: 8, y: 8, rotation: 0)).get()
        XCTAssertEqual(placed.core.stage, 1)
        XCTAssertNil(placed.grew)
    }
#endif

    func testIslandWritesCarryTheSizeTheyWereDrawnOn() {
        let place = TraderLandMutation.place(inventoryID: "inv", x: 1, y: 2, rotation: 0).payload(drawnOn: 10)
        XCTAssertEqual(place["size"] as? Int, 10)
        XCTAssertEqual(TraderLandMutation.move(placementID: "p", x: 1, y: 2, rotation: 90).payload(drawnOn: 12)["size"] as? Int, 12)
        XCTAssertEqual(TraderLandMutation.moveCore(x: 0, y: 5).payload(drawnOn: 8)["size"] as? Int, 8)
        XCTAssertNil(TraderLandMutation.extend(inventoryID: "inv", hours: 72).payload(drawnOn: 8)["size"], "extend carries no island frame")
        XCTAssertNil(TraderLandMutation.remove(placementID: "p").payload(drawnOn: 8)["size"])
        XCTAssertNil(TraderLandMutation.place(inventoryID: "inv", x: 1, y: 2, rotation: 0).payload(drawnOn: nil)["size"], "no world yet: no size")
    }
}
