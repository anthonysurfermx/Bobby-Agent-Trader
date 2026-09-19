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
                "horizon":{"hours":24,"tier":"common","reviewAt":"2099-09-20T10:00:00.000Z","extendable":true,"extendTo":[72,168]},
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
        XCTAssertEqual(horizon.reviewAt, Self.iso("2099-09-20T10:00:00Z"))
        XCTAssertTrue(horizon.extendable)
        XCTAssertEqual(horizon.extendTo, [.threeDays, .week])
        XCTAssertEqual(horizon.options(), [.threeDays, .week])
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
        moment.adopt(seed, owner: "user-1")
        XCTAssertEqual(moment.inventoryID, "inv-3")
        XCTAssertEqual(moment.span, .day)
        XCTAssertFalse(moment.offersHorizon)
        XCTAssertTrue(moment.extendOptions().isEmpty)
    }

    func testHorizonParsingEdges() {
        // No milliseconds, hours from the tier when the number is missing.
        let fromTier = RouteGrant.Horizon.parse(["tier": "building", "reviewAt": "2099-09-22T10:00:00Z", "extendable": true, "extendTo": [168]])
        XCTAssertEqual(fromTier?.hours, .threeDays)
        XCTAssertEqual(fromTier?.reviewAt, Self.iso("2099-09-22T10:00:00Z"))
        XCTAssertEqual(fromTier?.options(), [.week])
        // Unknown hours and tier: no horizon at all.
        XCTAssertNil(RouteGrant.Horizon.parse(["hours": 48, "tier": "mythic"]))
        XCTAssertNil(RouteGrant.Horizon.parse(NSNull()))
        // Not extendable any more (review open): nothing to pick, whatever extendTo says.
        let closed = RouteGrant.Horizon.parse(["hours": 24, "reviewAt": "2099-09-20T10:00:00.000Z", "extendable": false, "extendTo": [72, 168]])
        XCTAssertEqual(closed?.extendTo, [.threeDays, .week])
        XCTAssertEqual(closed?.options(), [])
        // Options stay upward only, even when the server lists a shorter one.
        let odd = RouteGrant.Horizon.parse(["hours": 72, "extendable": true, "extendTo": [24, 72, 168, 999]])
        XCTAssertNil(odd?.reviewAt)
        XCTAssertEqual(odd?.options(), [.week])
    }

    // MARK: Harvest card state

    private func plantedSeed() throws -> HarvestMoment {
        let seed = try XCTUnwrap(try outcomes(growth)["seed"])
        var moment = HarvestMoment(eventID: "seed", noTrade: false, thesis: nil, xp: 10, stage: HarvestMoment.stage(for: seed))
        moment.adopt(seed, owner: "user-1")
        return moment
    }

    private let buildingPiece = RouteGrant.Piece(id: "thesis_citadel_double_gate", world: "thesis_citadel", kind: "building", nameEN: "Double Gate", footprint: [2, 1])

    private func grown(to h: LandHorizon, piece: RouteGrant.Piece) -> DeskSeedExtender.Extended {
        DeskSeedExtender.Extended(inventoryID: "inv-3", item: piece,
                                  horizon: RouteGrant.Horizon(hours: h, reviewAt: Self.iso("2099-09-22T10:00:00Z"), extendable: !h.upward.isEmpty, extendTo: h.upward))
    }

    func testSettleCopiesTheSeedsRowHorizonAndPreviews() throws {
        let moment = try plantedSeed()
        XCTAssertEqual(moment.inventoryID, "inv-3")
        XCTAssertEqual(moment.span, .day)
        XCTAssertEqual(moment.reviewAt, Self.iso("2099-09-20T10:00:00Z"))
        XCTAssertEqual(moment.tiers[.threeDays], buildingPiece)
        XCTAssertTrue(moment.offersHorizon)
        XCTAssertEqual(moment.extendOptions(), [.threeDays, .week])
    }

    func testNoTradeCardNeverOffersTheChoice() throws {
        let bloom = try XCTUnwrap(try outcomes(growth)["bloom"])
        var moment = HarvestMoment(eventID: "bloom", noTrade: true, thesis: nil, xp: 20, stage: HarvestMoment.stage(for: bloom))
        moment.adopt(bloom, owner: "user-1")
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
        let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays, result: .success(grown(to: .threeDays, piece: buildingPiece))))
        XCTAssertEqual(settled.id, started.id)
        XCTAssertEqual(settled.stage, .seed(buildingPiece))
        XCTAssertEqual(settled.span, .threeDays)
        XCTAssertEqual(settled.reviewAt, Self.iso("2099-09-22T10:00:00Z"))
        XCTAssertNil(settled.extending)
        XCTAssertNil(settled.extendError)
        XCTAssertEqual(settled.extendOptions(), [.week])
        // Grown all the way: nothing left above.
        let week = try XCTUnwrap(settled.startingExtend(to: .week))
        let landmark = RouteGrant.Piece(id: "crypto_bay_waiting_lighthouse", world: "crypto_bay", kind: "landmark", nameEN: "Waiting Lighthouse", footprint: [2, 2])
        let top = try XCTUnwrap(HarvestMoment.settlingExtend(week, eventID: "seed", inventoryID: "inv-3", target: .week, result: .success(grown(to: .week, piece: landmark))))
        XCTAssertEqual(top.span, .week)
        XCTAssertTrue(top.extendOptions().isEmpty)
        XCTAssertTrue(top.offersHorizon, "the choice still shows the seed's horizon")
    }

    func testStaleAnswersAreIgnored() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        let answer: Result<DeskSeedExtender.Extended, DeskSeedExtender.Failure> = .success(grown(to: .threeDays, piece: buildingPiece))
        // A new read replaced the card while the POST flew.
        let newer = HarvestMoment(eventID: "next-read", noTrade: false, thesis: nil, xp: 10, stage: .syncing)
        XCTAssertNil(HarvestMoment.settlingExtend(newer, eventID: "seed", inventoryID: "inv-3", target: .threeDays, result: answer))
        // The card was cleared (ask() nils it first).
        XCTAssertNil(HarvestMoment.settlingExtend(nil, eventID: "seed", inventoryID: "inv-3", target: .threeDays, result: answer))
        // Same event, another seed row: not this answer's card.
        var other = started
        other.inventoryID = "inv-9"
        XCTAssertNil(HarvestMoment.settlingExtend(other, eventID: "seed", inventoryID: "inv-3", target: .threeDays, result: answer))
        // A failure for a replaced card is dropped too.
        XCTAssertNil(HarvestMoment.settlingExtend(newer, eventID: "seed", inventoryID: "inv-3", target: .threeDays, result: .failure(.reviewOpen)))
    }

    func testRefusalsCloseTheChoiceButAnOutageLetsItRetry() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .week))
        // (A `notUpward` changes the horizon itself: testNotUpwardNeverKeepsTheShorterHorizon.)
        for refusal in [DeskSeedExtender.Failure.reviewOpen, .bloomed, .gone] {
            let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .week, result: .failure(refusal)))
            XCTAssertNil(settled.extending)
            XCTAssertEqual(settled.extendError, refusal.message)
            XCTAssertTrue(settled.extendOptions().isEmpty, "\(refusal)")
            XCTAssertEqual(settled.span, .day, "the seed keeps its horizon")
            XCTAssertEqual(settled.stage, started.stage)
        }
        for outage in [DeskSeedExtender.Failure.unavailable, .signedOut] {
            let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .week, result: .failure(outage)))
            XCTAssertNotNil(settled.extendError)
            XCTAssertEqual(settled.extendOptions(), [.threeDays, .week], "\(outage)")
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
          "horizon":{"hours":72,"tier":"building","reviewAt":"2099-09-22T10:00:00.000Z","extendable":true,"extendTo":[168]}},
         "land":{"size":8,"theme":"default"},"inventory":[],"placements":[],"xp":0,"aura":0}
        """)
        XCTAssertEqual(ok, .success(grown(to: .threeDays, piece: buildingPiece)))
    }

    func testExtendRefusalsMapToTheirReasons() {
        XCTAssertEqual(answer(404, #"{"error":"Not found"}"#), .failure(.gone))
        XCTAssertEqual(answer(409, #"{"error":"This seed already bloomed"}"#), .failure(.bloomed))
        XCTAssertEqual(answer(409, #"{"error":"Its review is already open","reviewAt":"2099-09-20T10:00:00.000Z"}"#), .failure(.reviewOpen))
        XCTAssertEqual(answer(400, #"{"error":"A horizon can only grow"}"#), .failure(.notUpward))
        XCTAssertEqual(answer(401, #"{"error":"Unauthorized"}"#), .failure(.signedOut))
        // Anything else changes nothing the desk knows of: retry is safe.
        XCTAssertEqual(answer(409, #"{"error":"The island changed. Reload before trying again."}"#), .failure(.unavailable))
        XCTAssertEqual(answer(400, #"{"error":"Invalid action"}"#), .failure(.unavailable))
        XCTAssertEqual(answer(500, "oops"), .failure(.unavailable))
        // A 200 without `extended` (an older server) or naming another seed is not a success.
        XCTAssertEqual(answer(200, #"{"ok":true,"land":{"size":8,"theme":"default"}}"#), .failure(.unavailable))
        XCTAssertEqual(answer(200, #"{"ok":true,"extended":{"inventoryId":"inv-9","item":{"id":"x"},"horizon":{"hours":72}}}"#), .failure(.unavailable))
        XCTAssertEqual(answer(200, #"{"ok":false,"extended":{"inventoryId":"inv-3","item":{"id":"x"},"horizon":{"hours":72}}}"#), .failure(.unavailable))
    }

    // MARK: The clock (§1: extend only while now < seeded_at + horizon)

    func testTheChoiceClosesOnceTheReviewOpens() throws {
        let opens = Self.iso("2099-09-20T10:00:00Z")
        let before = opens.addingTimeInterval(-1)
        let moment = try plantedSeed()
        XCTAssertEqual(moment.horizon?.options(at: before), [.threeDays, .week])
        // The server said `extendable` at grant time; the card must not trust it past `reviewAt`.
        XCTAssertEqual(moment.horizon?.options(at: opens), [])
        XCTAssertEqual(moment.extendOptions(at: opens), [])
        XCTAssertNotNil(moment.startingExtend(to: .threeDays, at: before))
        XCTAssertNil(moment.startingExtend(to: .threeDays, at: opens), "never sent to be refused with 409")
        // Back from the background: the card's own horizon closes, still showing the seed's.
        var open = moment
        XCTAssertFalse(open.closeHorizonIfReviewOpen(at: before))
        XCTAssertTrue(open.closeHorizonIfReviewOpen(at: opens))
        XCTAssertEqual(open.horizon?.extendable, false)
        XCTAssertEqual(open.span, .day)
        XCTAssertTrue(open.offersHorizon, "the seed's horizon stays on the card, locked")
        XCTAssertFalse(open.closeHorizonIfReviewOpen(at: opens), "once")
        // An extend on its way is left to its own answer.
        var busy = try XCTUnwrap(moment.startingExtend(to: .week, at: before))
        XCTAssertFalse(busy.closeHorizonIfReviewOpen(at: opens))
    }

    // MARK: Accounts

    func testTheChoiceBelongsToTheAccountThatPlantedIt() throws {
        var moment = try plantedSeed()
        XCTAssertEqual(moment.ownerID, "user-1")
        XCTAssertFalse(moment.forgetSeedRow(unlessOwnedBy: "user-1"), "a token refresh changes nothing")
        var signedOut = moment
        XCTAssertTrue(signedOut.forgetSeedRow(unlessOwnedBy: nil))
        XCTAssertFalse(signedOut.offersHorizon, "no picker signed out")
        XCTAssertNil(signedOut.startingExtend(to: .threeDays))
        XCTAssertEqual(signedOut.stage, moment.stage, "the card keeps its story")
        XCTAssertEqual(signedOut.span, .day)
        XCTAssertTrue(moment.forgetSeedRow(unlessOwnedBy: "user-2"), "another account never posts this row")
        XCTAssertNil(moment.inventoryID)
        // A card settled without an account (it signed out mid-sync) never offers the choice.
        let seed = try XCTUnwrap(try outcomes(growth)["seed"])
        var orphan = HarvestMoment(eventID: "seed", noTrade: false, thesis: nil, xp: 10, stage: HarvestMoment.stage(for: seed))
        orphan.adopt(seed, owner: nil)
        XCTAssertFalse(orphan.offersHorizon)
    }

    @MainActor
    func testSignOutAndAccountSwitchReleaseTheDesksSeed() throws {
        let vm = BobbyViewModel()
        vm.harvest = try plantedSeed()
        vm.accountChanged(to: "user-1")
        XCTAssertEqual(vm.harvest?.offersHorizon, true)
        vm.accountChanged(to: nil)
        XCTAssertEqual(vm.harvest?.offersHorizon, false)
        vm.harvest = try plantedSeed()
        vm.accountChanged(to: "user-2")
        XCTAssertNil(vm.harvest?.inventoryID)
    }

    // MARK: A lost or refused answer reads the seed again

    private func row(_ h: LandHorizon, piece: RouteGrant.Piece, extendable: Bool? = nil) -> DeskSeedExtender.Extended {
        let open = extendable ?? !h.upward.isEmpty
        return DeskSeedExtender.Extended(inventoryID: "inv-3", item: piece,
                                         horizon: RouteGrant.Horizon(hours: h, reviewAt: Self.iso("2099-09-22T10:00:00Z"), extendable: open, extendTo: open ? h.upward : []))
    }

    func testALostAnswerThatLandedSettlesAsGrown() throws {
        // The extend committed, its answer was lost (timeout, 5xx): the re-read shows 72 h.
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        for failure in [DeskSeedExtender.Failure.unavailable, .notUpward] {
            let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays,
                                                                     result: .failure(failure), truth: row(.threeDays, piece: buildingPiece)))
            XCTAssertEqual(settled.stage, .seed(buildingPiece), "\(failure)")
            XCTAssertEqual(settled.span, .threeDays)
            XCTAssertNil(settled.extendError, "it did what was asked")
            XCTAssertEqual(settled.extendOptions(), [.week], "the 7-day extend is still open")
            XCTAssertNil(settled.extending)
        }
    }

    func testARereadThatShowsNoChangeKeepsTheRetryOpen() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        let seedPiece = RouteGrant.Piece(id: "risk_reef_dual_orbit_antenna", world: "risk_reef", kind: "decor", nameEN: "Dual Orbit Antenna", footprint: [1, 1])
        let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays,
                                                                 result: .failure(.unavailable), truth: row(.day, piece: seedPiece)))
        XCTAssertEqual(settled.extendError, DeskSeedExtender.Failure.unavailable.message)
        XCTAssertEqual(settled.span, .day)
        XCTAssertEqual(settled.extendOptions(), [.threeDays, .week])
        // The review opened: the row says so, the error stays, the choice closes.
        let late = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays,
                                                              result: .failure(.reviewOpen), truth: row(.day, piece: seedPiece, extendable: false)))
        XCTAssertEqual(late.extendError, DeskSeedExtender.Failure.reviewOpen.message)
        XCTAssertTrue(late.extendOptions().isEmpty)
    }

    func testNotUpwardNeverKeepsTheShorterHorizon() throws {
        // Refused as "already that far" and the row could not be read: the card stops claiming 24 h.
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        let settled = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays,
                                                                 result: .failure(.notUpward)))
        XCTAssertEqual(settled.span, .threeDays)
        XCTAssertEqual(settled.stage, .seed(buildingPiece), "the server's own preview for that tier")
        XCTAssertEqual(settled.extendError, DeskSeedExtender.Failure.notUpward.message)
        XCTAssertTrue(settled.extendOptions().isEmpty)
    }

    private let world = """
    {"ok":true,"land":{"size":8,"theme":"default"},"xp":0,"aura":0,"placements":[],
     "inventory":[
      {"id":"inv-1","item_id":"crypto_bay_data_dock","state":"bloomed","source":"route","placed":true,"item":null,"horizon":null},
      {"id":"inv-3","item_id":"thesis_citadel_double_gate","state":"seed","source":"route","placed":false,
       "item":{"id":"thesis_citadel_double_gate","world":"thesis_citadel","attribution":"Tesis","kind":"building","footprint_w":2,"footprint_h":1,
               "name":{"en":"Double Gate","es":"Double Gate"},"route_index":null,"tier":"building","tier_index":1,"art_url":null},
       "horizon":{"hours":72,"tier":"building","reviewAt":"2099-09-22T10:00:00.000Z","extendable":true,"extendTo":[168]}},
      {"id":"inv-5","item_id":"gone_from_catalog","state":"seed","source":"route","placed":false,"item":null,
       "horizon":{"hours":168,"tier":"landmark","reviewAt":"2099-09-26T10:00:00.000Z","extendable":false,"extendTo":[]}}
     ]}
    """

    func testSeedRowReadsTheIslandsCatalogRow() throws {
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(world.utf8)) as? [String: Any])
        XCTAssertEqual(DeskSeedExtender.seedRow(in: json, inventoryID: "inv-3"), row(.threeDays, piece: buildingPiece))
        // A piece missing from the catalog keeps its id and its tier's footprint.
        let orphan = try XCTUnwrap(DeskSeedExtender.seedRow(in: json, inventoryID: "inv-5"))
        XCTAssertEqual(orphan.item.id, "gone_from_catalog")
        XCTAssertEqual(orphan.item.footprint, [2, 2])
        XCTAssertEqual(orphan.horizon.hours, .week)
        // Not a seed any more, or not there: no row.
        XCTAssertNil(DeskSeedExtender.seedRow(in: json, inventoryID: "inv-1"))
        XCTAssertNil(DeskSeedExtender.seedRow(in: json, inventoryID: "inv-9"))
    }

    func testAnExtendWhosePieceLeftTheCatalogStillSucceeds() {
        // `extended.item: null`: the extend committed; the world in the same answer names the row.
        let body = world.replacingOccurrences(of: #"{"ok":true,"#, with: #"{"ok":true,"extended":{"inventoryId":"inv-5","item":null,"horizon":{"hours":168,"tier":"landmark","reviewAt":"2099-09-26T10:00:00.000Z","extendable":false,"extendTo":[]}},"#)
        let result = DeskSeedExtender.interpret(data: Data(body.utf8), status: 200, inventoryID: "inv-5")
        guard case let .success(extended) = result else { return XCTFail("\(result)") }
        XCTAssertEqual(extended.item.id, "gone_from_catalog")
        XCTAssertEqual(extended.horizon.hours, .week)
    }

    // MARK: Copy

    func testHorizonCopyNeverBreaksAndReadsFootprintsAsWords() {
        XCTAssertEqual(LandHorizon.day.label, "24\u{00A0}h")
        XCTAssertFalse(HarvestCard.horizonLine(.threeDays).hasPrefix("3 "), "no breakable space inside the horizon")
        XCTAssertTrue(HarvestCard.horizonLine(.week).hasSuffix("2×2"))
        XCTAssertFalse(HarvestCard.spokenHorizonLine(.threeDays).contains("×"), "VoiceOver reads × as a multiplication")
        XCTAssertTrue(HarvestCard.spokenHorizonLine(.threeDays).hasSuffix(L.t("2 by 1", "2 por 1")))
        XCTAssertTrue(HarvestCard.confirmQuestion(.week).contains(L.t("can't shorten", "No se puede acortar")))
    }

    func testExtendAnnouncementNamesTheNewBloomOrTheReason() throws {
        let started = try XCTUnwrap(try plantedSeed().startingExtend(to: .threeDays))
        let grownCard = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays,
                                                                   result: .success(grown(to: .threeDays, piece: buildingPiece))))
        XCTAssertTrue(try XCTUnwrap(grownCard.extendAnnouncement).contains(buildingPiece.displayName))
        let refused = try XCTUnwrap(HarvestMoment.settlingExtend(started, eventID: "seed", inventoryID: "inv-3", target: .threeDays,
                                                                 result: .failure(.gone)))
        XCTAssertEqual(refused.extendAnnouncement, DeskSeedExtender.Failure.gone.message)
    }

    func testOnlyACardMidExtendOutlivesTheNextRead() throws {
        let moment = try plantedSeed()
        XCTAssertFalse(moment.holdsThroughNextRead)
        XCTAssertTrue(try XCTUnwrap(moment.startingExtend(to: .threeDays)).holdsThroughNextRead)
    }

    // MARK: The real path: BobbyViewModel.extendSeed → DeskSeedExtender → URLSession

    private func extender(user: @escaping @MainActor () -> String? = { "user-1" }, token: String? = "tok") -> DeskSeedExtender {
        DeskSeedExtender(transport: DeskLandStub.session, account: DeskAccount(userID: user, token: { token }))
    }

    private static let extendedAnswer = """
    {"ok":true,"extended":{"inventoryId":"inv-3",
      "item":{"id":"thesis_citadel_double_gate","world":"thesis_citadel","attribution":"Tesis","kind":"building","name":{"en":"Double Gate","es":"Double Gate"},"footprint":[2,1]},
      "horizon":{"hours":72,"tier":"building","reviewAt":"2099-09-22T10:00:00.000Z","extendable":true,"extendTo":[168]}},
     "land":{"size":8,"theme":"default"},"inventory":[],"placements":[],"xp":0,"aura":0}
    """

    @MainActor
    func testExtendSeedGrowsTheCardThroughTheRealPath() async throws {
        DeskLandStub.install { $0.httpMethod == "POST" ? (200, Self.extendedAnswer) : nil }
        let vm = BobbyViewModel()
        vm.harvest = try plantedSeed()
        let bump = vm.landBump
        let sent = await vm.extendSeed(to: .threeDays, extender: extender())
        XCTAssertTrue(sent)
        XCTAssertEqual(vm.harvest?.stage, .seed(buildingPiece))
        XCTAssertEqual(vm.harvest?.span, .threeDays)
        XCTAssertNil(vm.harvest?.extending)
        XCTAssertNil(vm.harvest?.extendError)
        XCTAssertEqual(vm.landBump, bump + 1)
        let requests = DeskLandStub.requests
        XCTAssertEqual(requests.count, 1, "a success needs no re-read")
        let post = try XCTUnwrap(requests.first)
        XCTAssertEqual(post.request.httpMethod, "POST")
        XCTAssertEqual(post.request.value(forHTTPHeaderField: "Authorization"), "Bearer tok")
        XCTAssertEqual(post.request.value(forHTTPHeaderField: "X-Trader-Land-Client"), "2")
        let body = try XCTUnwrap(JSONSerialization.jsonObject(with: try XCTUnwrap(post.body)) as? [String: Any])
        XCTAssertEqual(body["action"] as? String, "extend")
        XCTAssertEqual(body["inventoryId"] as? String, "inv-3")
        XCTAssertEqual(body["hours"] as? Int, 72)
    }

    @MainActor
    func testReviewOpenReadsTheSeedAgainAndLocksTheChoice() async throws {
        // The island still has the 24 h seed, its review open: nothing left to choose.
        let closedWorld = """
        {"ok":true,"land":{"size":8,"theme":"default"},"xp":0,"aura":0,"placements":[],
         "inventory":[{"id":"inv-3","item_id":"risk_reef_dual_orbit_antenna","state":"seed","source":"route","placed":false,
          "item":{"id":"risk_reef_dual_orbit_antenna","world":"risk_reef","attribution":"Contradicción","kind":"decor","footprint_w":1,"footprint_h":1,
                  "name":{"en":"Dual Orbit Antenna","es":"Dual Orbit Antenna"}},
          "horizon":{"hours":24,"tier":"common","reviewAt":"2099-09-20T10:00:00.000Z","extendable":false,"extendTo":[]}}]}
        """
        DeskLandStub.install { $0.httpMethod == "POST" ? (409, #"{"error":"Its review is already open","reviewAt":"2099-09-20T10:00:00.000Z"}"#) : (200, closedWorld) }
        let vm = BobbyViewModel()
        vm.harvest = try plantedSeed()
        let before = vm.harvest?.stage
        let sent = await vm.extendSeed(to: .week, extender: extender())
        XCTAssertTrue(sent)
        XCTAssertEqual(DeskLandStub.requests.map(\.request.httpMethod), ["POST", "GET"])
        XCTAssertEqual(vm.harvest?.extendError, DeskSeedExtender.Failure.reviewOpen.message)
        XCTAssertEqual(vm.harvest?.extendOptions(), [])
        XCTAssertEqual(vm.harvest?.span, .day)
        XCTAssertEqual(vm.harvest?.stage, before)
    }

    @MainActor
    func testALostAnswerThenARetryShowsTheSeedTheServerHas() async throws {
        // 24 h → 72 h committed, its answer lost; the retry of 72 h is refused as not upward.
        DeskLandStub.install { $0.httpMethod == "POST" ? (400, #"{"error":"A horizon can only grow"}"#) : (200, self.world) }
        let vm = BobbyViewModel()
        vm.harvest = try plantedSeed()
        await vm.extendSeed(to: .threeDays, extender: extender())
        XCTAssertEqual(vm.harvest?.stage, .seed(buildingPiece), "not the old common piece")
        XCTAssertEqual(vm.harvest?.span, .threeDays, "not the stale 24 h")
        XCTAssertNil(vm.harvest?.extendError)
        XCTAssertEqual(vm.harvest?.extendOptions(), [.week], "the 7-day extend stays offered")
    }

    @MainActor
    func testATimedOutExtendThatCommittedIsNotReportedAsFailed() async throws {
        // The POST never answers (nil = the network fails); the island already has 72 h.
        DeskLandStub.install { $0.httpMethod == "POST" ? nil : (200, self.world) }
        let vm = BobbyViewModel()
        vm.harvest = try plantedSeed()
        await vm.extendSeed(to: .threeDays, extender: extender())
        XCTAssertEqual(vm.harvest?.span, .threeDays)
        XCTAssertNil(vm.harvest?.extendError)
        // Both reads fail: nothing is known to have changed, the retry stays open.
        DeskLandStub.install { _ in nil }
        vm.harvest = try plantedSeed()
        await vm.extendSeed(to: .threeDays, extender: extender())
        XCTAssertEqual(vm.harvest?.extendError, DeskSeedExtender.Failure.unavailable.message)
        XCTAssertEqual(vm.harvest?.extendOptions(), [.threeDays, .week])
    }

    @MainActor
    func testACardReplacedMidFlightDropsTheAnswer() async throws {
        for reply in [(200, Self.extendedAnswer), (409, #"{"error":"Its review is already open"}"#)] {
            let hold = DispatchSemaphore(value: 0)
            let arrived = expectation(description: "extend sent")
            DeskLandStub.install(hold: hold, arrived: { arrived.fulfill() }) { _ in reply }
            let vm = BobbyViewModel()
            vm.harvest = try plantedSeed()
            let first = Task { await vm.extendSeed(to: .threeDays, extender: extender()) }
            await fulfillment(of: [arrived], timeout: 5)
            XCTAssertEqual(vm.harvest?.extending, .threeDays, "busy while it flies")
            // A new read's card lands while the POST is out.
            let newer = HarvestMoment(eventID: "next-read", noTrade: false, thesis: nil, xp: 10, stage: .syncing)
            vm.harvest = newer
            hold.signal()
            let sent = await first.value
            XCTAssertTrue(sent)
            XCTAssertEqual(vm.harvest, newer, "the answer never lands on another card")
            XCTAssertEqual(DeskLandStub.requests.count, 1, "no re-read for a card that is gone")
        }
    }

    @MainActor
    func testADoubleTapSendsOneExtend() async throws {
        let hold = DispatchSemaphore(value: 0)
        let arrived = expectation(description: "extend sent")
        DeskLandStub.install(hold: hold, arrived: { arrived.fulfill() }) { _ in (200, Self.extendedAnswer) }
        let vm = BobbyViewModel()
        vm.harvest = try plantedSeed()
        let first = Task { await vm.extendSeed(to: .threeDays, extender: extender()) }
        await fulfillment(of: [arrived], timeout: 5)
        let again = await vm.extendSeed(to: .threeDays, extender: extender())
        let other = await vm.extendSeed(to: .week, extender: extender())
        XCTAssertFalse(again)
        XCTAssertFalse(other)
        hold.signal()
        let sent = await first.value
        XCTAssertTrue(sent)
        XCTAssertEqual(DeskLandStub.requests.count, 1)
        XCTAssertEqual(vm.harvest?.span, .threeDays)
    }

    @MainActor
    func testAnOfflineTokenRefreshIsNotASignOut() async {
        DeskLandStub.install { _ in (200, Self.extendedAnswer) }
        // Still signed in, but the refresh failed offline: an outage to retry.
        let offline = await extender(token: nil).extend(inventoryID: "inv-3", to: .threeDays)
        XCTAssertEqual(offline, .failure(.unavailable))
        // Really signed out.
        let signedOut = await extender(user: { nil }).extend(inventoryID: "inv-3", to: .threeDays)
        XCTAssertEqual(signedOut, .failure(.signedOut))
        XCTAssertTrue(DeskLandStub.requests.isEmpty, "nothing is sent without a bearer")
    }

    @MainActor
    func testAnAccountSwitchMidFlightLandsNothing() async {
        let account = SwitchingAccount()
        DeskLandStub.install { _ in account.switchTo("user-2"); return (200, Self.extendedAnswer) }
        let result = await extender(user: { account.current }).extend(inventoryID: "inv-3", to: .threeDays)
        XCTAssertEqual(result, .failure(.signedOut))
    }

    // MARK: The chip and the account sheet

    @MainActor
    func testPulseCountsEveryPieceAndForgetsThemSignedOut() throws {
        let pulse = LandPulse()
        XCTAssertNil(pulse.pieces, "unknown until read")
        let decoded = try JSONDecoder().decode(TraderLandWorld.self, from: Data(world.utf8))
        pulse.apply(decoded)
        XCTAssertEqual(pulse.pieces, 3, "seeds, bloomed and built alike")
        XCTAssertEqual(pulse.readyToBuild, 0)
        pulse.apply(nil)
        XCTAssertNil(pulse.pieces)
    }
}

/// The signed-in user as the extender sees it, switched from the network thread.
private final class SwitchingAccount: @unchecked Sendable {
    private let lock = NSLock()
    private var user: String? = "user-1"
    var current: String? { lock.lock(); defer { lock.unlock() }; return user }
    func switchTo(_ next: String?) { lock.lock(); user = next; lock.unlock() }
}

/// Answers the desk's /api/trader-land requests in-process. `reply` sees each request; nil = the
/// network fails. With `hold`, the first answer waits until the test releases it.
final class DeskLandStub: URLProtocol {
    typealias Reply = (status: Int, body: String)
    struct Seen { let request: URLRequest; let body: Data? }

    private static let lock = NSLock()
    private static var reply: ((URLRequest) -> Reply?)?
    private static var seen: [Seen] = []
    private static var hold: DispatchSemaphore?
    private static var arrived: (() -> Void)?

    static func install(hold: DispatchSemaphore? = nil, arrived: (() -> Void)? = nil, _ reply: @escaping (URLRequest) -> Reply?) {
        lock.lock(); defer { lock.unlock() }
        self.reply = reply
        self.hold = hold
        self.arrived = arrived
        seen = []
    }

    static var requests: [Seen] { lock.lock(); defer { lock.unlock() }; return seen }

    static var session: URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [DeskLandStub.self]
        return URLSession(configuration: config)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let request = self.request
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read)
        Self.lock.lock()
        Self.seen.append(Seen(request: request, body: body))
        let reply = Self.reply, hold = Self.hold, arrived = Self.arrived
        Self.hold = nil
        Self.arrived = nil
        Self.lock.unlock()
        arrived?()
        DispatchQueue.global().async {
            hold?.wait()
            guard let answer = reply?(request) else {
                self.client?.urlProtocol(self, didFailWithError: URLError(.timedOut))
                return
            }
            let response = HTTPURLResponse(url: request.url!, statusCode: answer.status, httpVersion: "HTTP/1.1",
                                           headerFields: ["Content-Type": "application/json"])!
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: Data(answer.body.utf8))
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }

    private static func read(_ stream: InputStream) -> Data {
        var data = Data()
        stream.open()
        defer { stream.close() }
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let n = stream.read(&buffer, maxLength: buffer.count)
            guard n > 0 else { break }
            data.append(buffer, count: n)
        }
        return data
    }
}
