import XCTest

final class TraderLandGateTests: XCTestCase {
    func testPlacementPersistenceCollisionAndRestore() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate"]
        app.launch()

        let restore = app.buttons["Restore"]
        XCTAssertTrue(restore.waitForExistence(timeout: 5))
        restore.tap()
        XCTAssertTrue(app.staticTexts["8×8 · 7 PLACED · USERDEFAULTS"].waitForExistence(timeout: 2))

        app.buttons["land-tile-0-0"].tap()
        XCTAssertTrue(app.staticTexts["8×8 · 8 PLACED · USERDEFAULTS"].waitForExistence(timeout: 2))

        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["8×8 · 8 PLACED · USERDEFAULTS"].waitForExistence(timeout: 5))

        app.buttons["Workshop"].tap()
        app.buttons["land-tile-7-7"].tap()
        XCTAssertTrue(app.staticTexts["Invalid position · footprint overlaps another piece or the Aura Core."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.staticTexts["8×8 · 8 PLACED · USERDEFAULTS"].exists)

        app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Rotate'" )).firstMatch.tap()
        XCTAssertTrue(app.buttons["Rotate · nw_se"].waitForExistence(timeout: 2))

        restore.tap()
        XCTAssertTrue(app.staticTexts["8×8 · 7 PLACED · USERDEFAULTS"].waitForExistence(timeout: 2))
    }
}
