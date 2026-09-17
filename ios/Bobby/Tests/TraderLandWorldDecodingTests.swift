import XCTest
@testable import Bobby

/// The iOS island decodes the same payload the web studio reads from /api/trader-land.
final class TraderLandWorldDecodingTests: XCTestCase {
    func testDecodesReviewSeasonShareAndClose() throws {
        let json = """
        {"ok":true,"xp":120,"aura":40,"land":{"size":8,"theme":"default"},
         "capabilities":{"move":true,"close":true},
         "share":{"public":true,"code":"ab12cd","title":"Reef","publishedAt":"2026-09-10T10:00:00Z"},
         "season":{"id":"s1","name":{"en":"Season I","es":"Temporada I"},"rule":{"en":"r","es":"r"},"total":6,"earned":2,"owned":["a","b"],"next":"c","complete":false},
         "inventory":[
           {"id":"i1","item_id":"reef_tower","state":"seed","source":"read","placed":false,"item":null,
            "review":{"thesis":{"symbol":"NVDA","isEquity":true,"direction":"long","price":181.2,"entry":null,"stop":170,"target":200},"readAt":null,"reviewAt":"2026-09-11T10:00:00.000Z","ready":true}},
           {"id":"i2","item_id":"lighthouse","state":"bloomed","source":"route","placed":true,"item":null}
         ],
         "placements":[{"id":"p1","inventory_id":"i2","x":3,"y":4,"rotation":90}],
         "closed":{"inventoryId":"i1","itemId":"reef_tower","outcome":"hit","symbol":"NVDA","direction":"long","referencePx":181.2,"closePx":200,"movePct":10.37,"xp":30,"aura":10,"executed":null,"season":{"piece":null,"progress":{}}}}
        """
        let world = try JSONDecoder().decode(TraderLandWorld.self, from: Data(json.utf8))
        XCTAssertEqual(world.capabilities?.close, true)
        XCTAssertEqual(world.share?.code, "ab12cd")
        XCTAssertEqual(world.season?.earned, 2)
        XCTAssertEqual(world.inventory.first?.review?.ready, true)
        XCTAssertEqual(world.inventory.first?.review?.thesis?.symbol, "NVDA")
        XCTAssertEqual(world.closed?.outcome, "hit")
        XCTAssertNil(world.closed?.season?.piece)
    }

    func testOlderPayloadWithoutNewFieldsStillDecodes() throws {
        let json = #"{"ok":true,"xp":0,"aura":0,"land":{"size":8,"theme":"default"},"inventory":[{"id":"i","item_id":"x","state":"bloomed","placed":false}],"placements":[]}"#
        let world = try JSONDecoder().decode(TraderLandWorld.self, from: Data(json.utf8))
        XCTAssertNil(world.season); XCTAssertNil(world.share); XCTAssertNil(world.inventory[0].review)
    }

    func testCloseBodyTagsTheIOSPlatform() {
        let body = TraderLandMutation.close(inventoryID: "i1").body
        XCTAssertEqual(body["action"] as? String, "close")
        XCTAssertEqual(body["platform"] as? String, "ios")
    }

    func testEveryCompanionHasThreeGearPieces() {
        for id in ["orb","byte","kora","zip","glitch","momo","flux","rook","halo","axiom","iris","sol","zuri","mira","nalu","vega","noor","keo"] {
            let tools = CompanionToolkit.tools(for: id)
            XCTAssertEqual(tools.map(\.tier), [1, 2, 3], id)
            XCTAssertTrue(tools.allSatisfy { UIImage(named: $0.assetName) != nil }, "\(id) gear art")
        }
    }
}
