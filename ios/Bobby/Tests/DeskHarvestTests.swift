import XCTest
@testable import Bobby

/// The desk → Trader Land bridge: the thesis every award carries, and the
/// piece /api/progress says each award planted.
final class DeskHarvestTests: XCTestCase {
    // MARK: Thesis

    func testThesisKeepsAValidUppercasedSymbol() throws {
        let thesis = try XCTUnwrap(AwardThesis.make(symbol: "btc", isEquity: false, direction: "long", price: 64210.5, entry: 64000, stop: 62500, target: 67000))
        XCTAssertEqual(thesis.symbol, "BTC")
        XCTAssertEqual(thesis.direction, "long")
        XCTAssertEqual(thesis.price, 64210.5)
        XCTAssertEqual(thesis.target, 67000)
        XCTAssertNotNil(AwardThesis.make(symbol: "BRK.B", isEquity: true, direction: nil, price: nil, entry: nil, stop: nil, target: nil))
        XCTAssertNotNil(AwardThesis.make(symbol: "1INCH", isEquity: false, direction: nil, price: nil, entry: nil, stop: nil, target: nil))
    }

    func testThesisRejectsSymbolsTheServerWouldDrop() {
        for bad in ["", " ", "-BTC", ".ETH", "BTC/USD", "BTC USD", "ÉTH", "ABCDEFGHIJKLMNOPQRSTU"] {
            XCTAssertNil(AwardThesis.make(symbol: bad, isEquity: false, direction: "long", price: 1, entry: 1, stop: 1, target: 1), bad)
        }
        // 20 characters is the limit.
        XCTAssertNotNil(AwardThesis.make(symbol: "ABCDEFGHIJKLMNOPQRST", isEquity: false, direction: nil, price: nil, entry: nil, stop: nil, target: nil))
    }

    func testThesisLevelsKeepOnlyPositiveFiniteValues() throws {
        let thesis = try XCTUnwrap(AwardThesis.make(symbol: "NVDA", isEquity: true, direction: "short", price: -3, entry: .nan, stop: .infinity, target: 0))
        XCTAssertNil(thesis.price); XCTAssertNil(thesis.entry); XCTAssertNil(thesis.stop); XCTAssertNil(thesis.target)
        XCTAssertTrue(thesis.isEquity)
        let body = thesis.body
        XCTAssertTrue(JSONSerialization.isValidJSONObject(body))
        XCTAssertTrue(body["price"] is NSNull)
        XCTAssertEqual(body["direction"] as? String, "short")
        XCTAssertEqual(body["isEquity"] as? Bool, true)
    }

    func testThesisDirectionMapsToLongShortOrNone() {
        func dir(_ raw: String?) -> String? { AwardThesis.make(symbol: "ETH", isEquity: false, direction: raw, price: nil, entry: nil, stop: nil, target: nil)?.direction }
        XCTAssertEqual(dir("LONG"), "long")
        XCTAssertEqual(dir("short"), "short")
        XCTAssertEqual(dir("neutral"), "none")
        XCTAssertEqual(dir("no_trade"), "none")
        XCTAssertEqual(dir(nil), "none")
    }

    // MARK: Queue

    func testPendingAwardQueuedBeforeBuild31StillDecodes() throws {
        let old = #"[{"id":"a1","kind":"read_complete","at":"2026-09-17T10:00:00Z","tzOffsetMin":360}]"#
        let queue = try JSONDecoder().decode([PendingAward].self, from: Data(old.utf8))
        XCTAssertEqual(queue.first?.id, "a1")
        XCTAssertNil(queue.first?.thesis)
    }

    func testPendingAwardRoundTripsItsThesis() throws {
        let thesis = AwardThesis.make(symbol: "SOL", isEquity: false, direction: "long", price: 150, entry: nil, stop: 140, target: 170)
        let award = PendingAward(id: "a2", kind: "no_trade_respected", at: "2026-09-18T10:00:00Z", tzOffsetMin: 0, thesis: thesis)
        let decoded = try JSONDecoder().decode(PendingAward.self, from: JSONEncoder().encode(award))
        XCTAssertEqual(decoded, award)
        XCTAssertNil(decoded.thesis?.entry)
    }

    // MARK: Route grants

    private func outcomes(_ json: String) throws -> [String: AwardOutcome] {
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
        let results = try XCTUnwrap(object["results"] as? [[String: Any]])
        return Dictionary(uniqueKeysWithValues: AwardOutcome.parse(results: results).map { ($0.id, $0) })
    }

    /// A sample POST /api/progress answer covering every grant shape.
    private let sample = """
    {"ok":true,"progress":{"xp":160,"aura":14,"routeIndex":4},"legacyImported":0,
     "results":[
      {"id":"seed","awarded":10,"aura":2,"xpBefore":130,"xpAfter":140,"duplicate":false,
       "world":{"routeIndex":3,"item":{"id":"risk_reef_dual_orbit_antenna","world":"risk_reef","attribution":"Contradicción","kind":"decor",
                "name":{"en":"Dual Orbit Antenna","es":"Dual Orbit Antenna"},"footprint":[1,1]},
                "inventoryId":"inv-3","state":"seed","bloomedInventoryId":null,"routeComplete":false}},
      {"id":"bloom","awarded":20,"aura":6,"xpBefore":140,"xpAfter":160,"duplicate":false,
       "world":{"routeIndex":5,"item":{"id":"thesis_citadel_double_gate","world":"thesis_citadel","attribution":"Tesis","kind":"building",
                "name":{"en":"Double Gate","es":"Double Gate"},"footprint":[2,1]},
                "inventoryId":"inv-5","state":"bloomed","bloomedInventoryId":null,"routeComplete":false}},
      {"id":"capped","awarded":0,"aura":0,"xpBefore":160,"xpAfter":160,"duplicate":false},
      {"id":"dupe","awarded":0,"aura":0,"xpBefore":160,"xpAfter":160,"duplicate":true},
      {"id":"failed","awarded":10,"aura":2,"xpBefore":160,"xpAfter":170,"duplicate":false,"world":null},
      {"id":"done","awarded":10,"aura":2,"xpBefore":170,"xpAfter":180,"duplicate":false,
       "world":{"routeIndex":8,"item":null,"inventoryId":null,"state":null,"bloomedInventoryId":null,"routeComplete":true}}
     ]}
    """

    func testSeedGrantParses() throws {
        let seed = try XCTUnwrap(try outcomes(sample)["seed"])
        XCTAssertEqual(seed.awarded, 10)
        guard case let .planted(grant) = seed.grant else { return XCTFail("expected a planted grant") }
        XCTAssertEqual(grant.routeIndex, 3)
        XCTAssertEqual(grant.state, "seed")
        XCTAssertEqual(grant.inventoryId, "inv-3")
        XCTAssertEqual(grant.item?.id, "risk_reef_dual_orbit_antenna")
        XCTAssertEqual(grant.item?.nameEN, "Dual Orbit Antenna")
        XCTAssertEqual(grant.item?.footprint, [1, 1])
        XCTAssertFalse(grant.routeComplete)
        XCTAssertEqual(HarvestMoment.stage(for: seed), .seed(grant.item!))
    }

    func testBloomedGrantParses() throws {
        let bloom = try XCTUnwrap(try outcomes(sample)["bloom"])
        guard case let .planted(grant) = bloom.grant else { return XCTFail("expected a planted grant") }
        XCTAssertEqual(grant.state, "bloomed")
        XCTAssertEqual(grant.item?.footprint, [2, 1])
        XCTAssertEqual(HarvestMoment.stage(for: bloom), .bloomed(grant.item!))
    }

    func testMissingWorldIsTheDailyCap() throws {
        let capped = try XCTUnwrap(try outcomes(sample)["capped"])
        XCTAssertEqual(capped.grant, .notPlanted)
        XCTAssertEqual(capped.awarded, 0)
        XCTAssertEqual(HarvestMoment.stage(for: capped), .capped)
        // An event the server already counted is not a cap: its piece exists.
        let dupe = try XCTUnwrap(try outcomes(sample)["dupe"])
        XCTAssertTrue(dupe.duplicate)
        XCTAssertEqual(HarvestMoment.stage(for: dupe), .pending)
    }

    func testNullWorldIsAFailedGrant() throws {
        let failed = try XCTUnwrap(try outcomes(sample)["failed"])
        XCTAssertEqual(failed.grant, .failed)
        XCTAssertEqual(failed.awarded, 10)
        XCTAssertEqual(HarvestMoment.stage(for: failed), .pending)
    }

    func testRouteCompleteGrant() throws {
        let done = try XCTUnwrap(try outcomes(sample)["done"])
        guard case let .planted(grant) = done.grant else { return XCTFail("expected a planted grant") }
        XCTAssertTrue(grant.routeComplete)
        XCTAssertNil(grant.item)
        XCTAssertNil(grant.state)
        XCTAssertEqual(HarvestMoment.stage(for: done), .routeComplete)
    }

    func testOnlyUnsettledCardsWaitForTheServer() {
        func open(_ stage: HarvestMoment.Stage) -> Bool { HarvestMoment(eventID: "e", noTrade: false, thesis: nil, xp: 10, stage: stage).isOpen }
        XCTAssertTrue(open(.syncing)); XCTAssertTrue(open(.pending)); XCTAssertTrue(open(.signedOut(planted: true)))
        XCTAssertFalse(open(.signedOut(planted: false))); XCTAssertFalse(open(.capped)); XCTAssertFalse(open(.routeComplete))
    }
}
