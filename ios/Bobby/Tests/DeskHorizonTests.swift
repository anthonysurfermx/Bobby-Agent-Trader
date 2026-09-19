import XCTest
@testable import Bobby

/// Growth v1 on the desk (docs/trader-land/GROWTH-v1.md §3–4): /api/progress names a
/// seed's horizon and the tier previews, and the harvest card extends it through one
/// standalone POST whose answer lands only on the card that asked.
final class DeskHorizonTests: XCTestCase {
    // MARK: /api/progress

    private func outcomes(_ json: String) throws -> [String: AwardOutcome] {
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        let results = try XCTUnwrap(object["results"] as? [[String: Any]])
        return Dictionary(uniqueKeysWithValues: AwardOutcome.parse(results: results).map { ($0.id, $0) })
    }

    private struct NotPlanted: Error {}

    private func grant(_ outcome: AwardOutcome?) throws -> RouteGrant {
        guard case let .planted(grant)? = outcome?.grant else { XCTFail("expected a planted grant"); throw NotPlanted() }
        return grant
    }

    private static func iso(_ s: String) -> Date { ISO8601DateFormatter().date(from: s)! }

    /// A Growth v1 answer: a read's 24 h seed with the choice, and a NO TRADE bloomed at once.
    private let growth = """
    {"ok":true,"progress":{"xp":160,"aura":14,"routeIndex":8},"legacyImported":0,
     "results":[
      {"id":"seed","awarded":10,"aura":2,"xpBefore":130,"xpAfter":140,"duplicate":false,
       "world":{"routeIndex":8,"item":{"id":"risk_reef_dual_orbit_antenna","world":"risk_reef","attribution":"Contradicción","kind":"decor",
                "name":{"en":"Dual Orbit Antenna","es":"Dual Orbit Antenna"},"footprint":[1,1]},
                "inventoryId":"inv-3","state":"seed","bloomedInventoryId":null,"routeComplete":false,
                "horizon":{"hours":24,"tier":"common","reviewAt":"2026-09-20T10:00:00.000Z","extendable":true,"extendTo":[72,168]},
                "tiers":{"common":{"id":"risk_reef_dual_orbit_antenna","world":"risk_reef","attribution":"Contradicción","kind":"decor","name":{"en":"Dual Orbit Antenna","es":"Dual Orbit Antenna"},"footprint":[1,1]},
                         "building":{"id":"thesis_citadel_double_gate","world":"thesis_citadel","attribution":"Tesis","kind":"building","name":{"en":"Double Gate","es":"Double Gate"},"footprint":[2,1]},
                         "landmark":{"id":"crypto_bay_waiting_lighthouse","world":"crypto_bay","attribution":"Bahía","kind":"landmark","name":{"en":"Waiting Lighthouse","es":"Waiting Lighthouse"},"footprint":[2,2]},
                         "mythic":{"id":"unknown_piece","footprint":[3,3]}}}},
      {"id":"bloom","awarded":20,"aura":6,"xpBefore":140,"xpAfter":160,"duplicate":false,
       "world":{"routeIndex":8,"item":{"id":"thesis_citadel_risk_shield","world":"thesis_citadel","attribution":"Tesis","kind":"decor",
                "name":{"en":"Risk Shield","es":"Risk Shield"},"footprint":[1,1]},
                "inventoryId":"inv-4","state":"bloomed","bloomedInventoryId":null,"routeComplete":false}}
     ]}
    """

    /// The same seed from a server before Growth v1 (build 31's contract).
    private let legacy = """
    {"ok":true,"progress":{"xp":140},"results":[
      {"id":"seed","awarded":10,"duplicate":false,
       "world":{"routeIndex":3,"item":{"id":"risk_reef_dual_orbit_antenna","world":"risk_reef","kind":"decor","name":{"en":"Dual Orbit Antenna"},"footprint":[1,1]},
                "inventoryId":"inv-3","state":"seed","bloomedInventoryId":null,"routeComplete":false}}
    ]}
    """

    func testGrowthSeedParsesItsHorizonAndTiers() throws {
        let seed = try XCTUnwrap(try outcomes(growth)["seed"])
        let grant = try grant(seed)
        XCTAssertEqual(grant.inventoryId, "inv-3")
        let horizon = try XCTUnwrap(grant.horizon)
        XCTAssertEqual(horizon.hours, .day)
        XCTAssertEqual(horizon.reviewAt, Self.iso("2026-09-20T10:00:00Z"))
        XCTAssertTrue(horizon.extendable)
        XCTAssertEqual(horizon.extendTo, [.threeDays, .week])
        XCTAssertEqual(horizon.options, [.threeDays, .week])
        // Three known tiers; an unknown one is skipped, never a crash.
        XCTAssertEqual(grant.tiers.count, 3)
        XCTAssertEqual(grant.tiers[.day]?.id, "risk_reef_dual_orbit_antenna")
        XCTAssertEqual(grant.tiers[.threeDays]?.id, "thesis_citadel_double_gate")
        XCTAssertEqual(grant.tiers[.threeDays]?.footprint, [2, 1])
        XCTAssertEqual(grant.tiers[.week]?.nameEN, "Waiting Lighthouse")
        XCTAssertEqual(grant.tiers[.week]?.footprint, [2, 2])
        // The stage mapping is unchanged by the new keys.
        XCTAssertEqual(HarvestMoment.stage(for: seed), .seed(grant.item!))
    }

    func testNoTradeGrantCarriesNoHorizon() throws {
        let bloom = try XCTUnwrap(try outcomes(growth)["bloom"])
        let grant = try grant(bloom)
        XCTAssertNil(grant.horizon)
        XCTAssertTrue(grant.tiers.isEmpty)
        XCTAssertEqual(HarvestMoment.stage(for: bloom), .bloomed(grant.item!))
    }

    func testPreGrowthSeedStillParsesWithoutTheNewKeys() throws {
        let seed = try XCTUnwrap(try outcomes(legacy)["seed"])
        let grant = try grant(seed)
        XCTAssertEqual(grant.routeIndex, 3)
        XCTAssertEqual(grant.inventoryId, "inv-3")
        XCTAssertNil(grant.horizon)
        XCTAssertTrue(grant.tiers.isEmpty)
        XCTAssertEqual(HarvestMoment.stage(for: seed), .seed(grant.item!))
        // Such a card plants at 24 h and offers no choice: the old server cannot extend.
        var moment = HarvestMoment(eventID: "seed", noTrade: false, thesis: nil, xp: 10, stage: HarvestMoment.stage(for: seed))
        moment.adopt(seed)
        XCTAssertEqual(moment.inventoryID, "inv-3")
        XCTAssertEqual(moment.span, .day)
        XCTAssertFalse(moment.offersHorizon)
        XCTAssertTrue(moment.extendOptions.isEmpty)
    }

    func testHorizonParsingEdges() {
        // No milliseconds, hours from the tier when the number is missing.
        let fromTier = RouteGrant.Horizon.parse(["tier": "building", "reviewAt": "2026-09-22T10:00:00Z", "extendable": true, "extendTo": [168]])
        XCTAssertEqual(fromTier?.hours, .threeDays)
        XCTAssertEqual(fromTier?.reviewAt, Self.iso("2026-09-22T10:00:00Z"))
        XCTAssertEqual(fromTier?.options, [.week])
        // Unknown hours and tier: no horizon at all.
        XCTAssertNil(RouteGrant.Horizon.parse(["hours": 48, "tier": "mythic"]))
        XCTAssertNil(RouteGrant.Horizon.parse(NSNull()))
        // Not extendable any more (review open): nothing to pick, whatever extendTo says.
        let closed = RouteGrant.Horizon.parse(["hours": 24, "reviewAt": "2026-09-20T10:00:00.000Z", "extendable": false, "extendTo": [72, 168]])
        XCTAssertEqual(closed?.extendTo, [.threeDays, .week])
        XCTAssertEqual(closed?.options, [])
        // Options stay upward only, even when the server lists a shorter one.
        let odd = RouteGrant.Horizon.parse(["hours": 72, "extendable": true, "extendTo": [24, 72, 168, 999]])
        XCTAssertNil(odd?.reviewAt)
        XCTAssertEqual(odd?.options, [.week])
    }

    // MARK: Harvest card state

    private func plantedSeed() throws -> HarvestMoment {
        let seed = try XCTUnwrap(try outcomes(growth)["seed"])
        var moment = HarvestMoment(eventID: "seed", noTrade: false, thesis: nil, xp: 10, stage: HarvestMoment.stage(for: seed))
        moment.adopt(seed)
        return moment
    }

    private let buildingPiece = RouteGrant.Piece(id: "thesis_citadel_double_gate", world: "thesis_citadel", kind: "building", nameEN: "Double Gate", footprint: [2, 1])

    private func grown(to h: LandHorizon, piece: RouteGrant.Piece) -> DeskSeedExtender.Extended {
        DeskSeedExtender.Extended(inventoryID: "inv-3", item: piece,
                                  horizon: RouteGrant.Horizon(hours: h, reviewAt: Self.iso("2026-09-22T10:00:00Z"), extendable: !h.upward.isEmpty, extendTo: h.upward))
    }

    func testSettleCopiesTheSeedsRowHorizonAndPreviews() throws {
        let moment = try plantedSeed()
        XCTAssertEqual(moment.inventoryID, "inv-3")
        XCTAssertEqual(moment.span, .day)
        XCTAssertEqual(moment.reviewAt, Self.iso("2026-09-20T10:00:00Z"))
        XCTAssertEqual(moment.tiers[.threeDays], buildingPiece)
        XCTAssertTrue(moment.offersHorizon)
        XCTAssertEqual(moment.extendOptions, [.threeDays, .week])
    }

    func testNoTradeCardNeverOffersTheChoice() throws {
        let bloom = try XCTUnwrap(try outcomes(growth)["bloom"])
        var moment = HarvestMoment(eventID: "bloom", noTrade: true, thesis: nil, xp: 20, stage: HarvestMoment.stage(for: bloom))
        moment.adopt(bloom)
        XCTAssertEqual(moment.inventoryID, "inv-4")
        XCTAssertFalse(moment.offersHorizon)
        XCTAssertNil(moment.startingExtend(to: .threeDays))
    }

    func testStartingAnExtendIsUpwardOnlyAndNeverTwice() throws {
        let moment = try plantedSeed()
        XCTAssertNil(moment.startingExtend(to: .day), "a horizon can only grow")
        let started = try XCTUnwrap(moment.startingExtend(to: .threeDays))
        XCTAssertEqual(started.extending, .threeDays)
        XCTAssertEqual(started.id, moment.id, "the same card, busy")
        XCTAssertNil(started.startingExtend(to: .week), "no double submit")
        XCTAssertNil(started.startingExtend(to: .threeDays), "no double submit")
        var unnamed = moment
        unnamed.inventoryID = nil
        XCTAssertNil(unnamed.startingExtend(to: .threeDays), "no row, nothing to extend")
    }

    func testSuccessfulExtendSwapsThePieceAndHorizon() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", result: .success(grown(to: .threeDays, piece: buildingPiece))))
        XCTAssertEqual(settled.id, started.id)
        XCTAssertEqual(settled.stage, .seed(buildingPiece))
        XCTAssertEqual(settled.span, .threeDays)
        XCTAssertEqual(settled.reviewAt, Self.iso("2026-09-22T10:00:00Z"))
        XCTAssertNil(settled.extending)
        XCTAssertNil(settled.extendError)
        XCTAssertEqual(settled.extendOptions, [.week])
        // Grown all the way: nothing left above.
        let week = try XCTUnwrap(settled.startingExtend(to: .week))
        let landmark = RouteGrant.Piece(id: "crypto_bay_waiting_lighthouse", world: "crypto_bay", kind: "landmark", nameEN: "Waiting Lighthouse", footprint: [2, 2])
        let top = try XCTUnwrap(HarvestMoment.settlingExtend(week, eventID: "seed", inventoryID: "inv-3", result: .success(grown(to: .week, piece: landmark))))
        XCTAssertEqual(top.span, .week)
        XCTAssertTrue(top.extendOptions.isEmpty)
        XCTAssertTrue(top.offersHorizon, "the choice still shows the seed's horizon")
    }

    func testStaleAnswersAreIgnored() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        let answer: Result<DeskSeedExtender.Extended, DeskSeedExtender.Failure> = .success(grown(to: .threeDays, piece: buildingPiece))
        // A new read replaced the card while the POST flew.
        let newer = HarvestMoment(eventID: "next-read", noTrade: false, thesis: nil, xp: 10, stage: .syncing)
        XCTAssertNil(HarvestMoment.settlingExtend(newer, eventID: "seed", inventoryID: "inv-3", result: answer))
        // The card was cleared (ask() nils it first).
        XCTAssertNil(HarvestMoment.settlingExtend(nil, eventID: "seed", inventoryID: "inv-3", result: answer))
        // Same event, another seed row: not this answer's card.
        var other = started
        other.inventoryID = "inv-9"
        XCTAssertNil(HarvestMoment.settlingExtend(other, eventID: "seed", inventoryID: "inv-3", result: answer))
        // A failure for a replaced card is dropped too.
        XCTAssertNil(HarvestMoment.settlingExtend(newer, eventID: "seed", inventoryID: "inv-3", result: .failure(.reviewOpen)))
    }

    func testRefusalsCloseTheChoiceButAnOutageLetsItRetry() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .week))
        for refusal in [DeskSeedExtender.Failure.reviewOpen, .bloomed, .gone, .notUpward] {
            let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", result: .failure(refusal)))
            XCTAssertNil(settled.extending)
            XCTAssertEqual(settled.extendError, refusal.message)
            XCTAssertTrue(settled.extendOptions.isEmpty, "\(refusal)")
            XCTAssertEqual(settled.span, .day, "the seed keeps its horizon")
            XCTAssertEqual(settled.stage, started.stage)
        }
        for outage in [DeskSeedExtender.Failure.unavailable, .signedOut] {
            let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", result: .failure(outage)))
            XCTAssertNotNil(settled.extendError)
            XCTAssertEqual(settled.extendOptions, [.threeDays, .week], "\(outage)")
            // Retrying clears the last error.
            XCTAssertNil(try XCTUnwrap(settled.startingExtend(to: .week)).extendError)
        }
    }

    // MARK: The extend request

    func testExtendRequestCarriesTheContract() throws {
        let request = try DeskSeedExtender.request(inventoryID: "inv-3", to: .threeDays, token: "tok")
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/api/trader-land")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Trader-Land-Client"), "2")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: Any])
        XCTAssertEqual(body["action"] as? String, "extend")
        XCTAssertEqual(body["inventoryId"] as? String, "inv-3")
        XCTAssertEqual(body["hours"] as? Int, 72)
        XCTAssertEqual(body.count, 3)
        let week = try JSONSerialization.jsonObject(with: try XCTUnwrap(DeskSeedExtender.request(inventoryID: "inv-3", to: .week, token: "tok").httpBody)) as? [String: Any]
        XCTAssertEqual(week?["hours"] as? Int, 168)
    }

    private func answer(_ status: Int, _ json: String) -> Result<DeskSeedExtender.Extended, DeskSeedExtender.Failure> {
        DeskSeedExtender.interpret(data: Data(json.utf8), status: status, inventoryID: "inv-3")
    }

    func testExtendAnswerParses() throws {
        let ok = answer(200, """
        {"ok":true,"extended":{"inventoryId":"inv-3",
          "item":{"id":"thesis_citadel_double_gate","world":"thesis_citadel","attribution":"Tesis","kind":"building","name":{"en":"Double Gate","es":"Double Gate"},"footprint":[2,1]},
          "horizon":{"hours":72,"tier":"building","reviewAt":"2026-09-22T10:00:00.000Z","extendable":true,"extendTo":[168]}},
         "land":{"size":8,"theme":"default"},"inventory":[],"placements":[],"xp":0,"aura":0}
        """)
        XCTAssertEqual(ok, .success(grown(to: .threeDays, piece: buildingPiece)))
    }

    func testExtendRefusalsMapToTheirReasons() {
        XCTAssertEqual(answer(404, #"{"error":"Not found"}"#), .failure(.gone))
        XCTAssertEqual(answer(409, #"{"error":"This seed already bloomed"}"#), .failure(.bloomed))
        XCTAssertEqual(answer(409, #"{"error":"Its review is already open","reviewAt":"2026-09-20T10:00:00.000Z"}"#), .failure(.reviewOpen))
        XCTAssertEqual(answer(400, #"{"error":"A horizon can only grow"}"#), .failure(.notUpward))
        XCTAssertEqual(answer(401, #"{"error":"Unauthorized"}"#), .failure(.signedOut))
        // Anything else changes nothing the desk knows of: retry is safe.
        XCTAssertEqual(answer(409, #"{"error":"The island changed. Reload and try again."}"#), .failure(.unavailable))
        XCTAssertEqual(answer(400, #"{"error":"Invalid action"}"#), .failure(.unavailable))
        XCTAssertEqual(answer(500, "oops"), .failure(.unavailable))
        // A 200 without `extended` (an older server) or naming another seed is not a success.
        XCTAssertEqual(answer(200, #"{"ok":true,"land":{"size":8,"theme":"default"}}"#), .failure(.unavailable))
        XCTAssertEqual(answer(200, #"{"ok":true,"extended":{"inventoryId":"inv-9","item":{"id":"x"},"horizon":{"hours":72}}}"#), .failure(.unavailable))
        XCTAssertEqual(answer(200, #"{"ok":false,"extended":{"inventoryId":"inv-3","item":{"id":"x"},"horizon":{"hours":72}}}"#), .failure(.unavailable))
    }
}
