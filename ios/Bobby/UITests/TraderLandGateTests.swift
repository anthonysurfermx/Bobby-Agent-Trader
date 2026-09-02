import XCTest

final class TraderLandGateTests: XCTestCase {
    func testSharedFixtureFogConnectorsAndPersistence() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate"]
        app.launch()

        let restore = app.buttons["Restore"]
        XCTAssertTrue(restore.waitForExistence(timeout: 5))
        restore.tap()
        XCTAssertTrue(app.staticTexts["FOCUS 1/2 · 8 PLACED"].waitForExistence(timeout: 2))
        XCTAssertTrue(app.descendants(matching: .any)["path-path-a-connectors-SE"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["path-path-b-connectors-NW"].exists)

        app.buttons["land-tile-0-0"].tap()
        XCTAssertEqual(app.staticTexts["land-fixed-status"].label, "FOCUS 1/2 · 8 PLACED")

        app.buttons["Reveal next focus ring"].tap()
        XCTAssertEqual(app.staticTexts["land-fixed-status"].label, "FOCUS 2/2 · 8 PLACED")
        app.buttons["land-tile-0-0"].tap()
        XCTAssertEqual(app.staticTexts["land-fixed-status"].label, "FOCUS 2/2 · 9 PLACED")

        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["land-fixed-status"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["land-fixed-status"].label, "FOCUS 2/2 · 9 PLACED")

        app.buttons["blueprint-evidence_mines_evidence_workshop"].tap()
        app.buttons["land-tile-7-7"].tap()
        XCTAssertEqual(app.staticTexts["land-fixed-status"].label, "FOCUS 2/2 · 9 PLACED")

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Rotate'" )).firstMatch.tap()
        XCTAssertTrue(app.buttons["Rotate · nw_se"].waitForExistence(timeout: 2))

        restore.tap()
        XCTAssertEqual(app.staticTexts["land-fixed-status"].label, "FOCUS 1/2 · 8 PLACED")
    }
}
