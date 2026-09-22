import XCTest

final class CommunitySafetyUITests: XCTestCase {
    func testEnglishVisitorCanBlockAndUnblockCreator() { check(spanish: false) }
    func testSpanishVisitorCanBlockAndUnblockCreator() { check(spanish: true) }
    private func check(spanish: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-land-neighbors-fixture", "-community-safety-test-reset", "-AppleLanguages", spanish ? "(es)" : "(en)"]
        app.launch()
        XCTAssertTrue(app.buttons["land-archipelago"].waitForExistence(timeout: 15))
        app.buttons["land-archipelago"].tap()
        app.buttons["land-next-island"].tap()
        XCTAssertEqual(app.staticTexts["land-focused-island"].label, "Satoshi Nakamoto")
        app.buttons["land-next-island"].tap()
        XCTAssertEqual(app.staticTexts["land-focused-island"].label, "Harbor of Patience")
        app.buttons["land-community-safety"].tap()
        XCTAssertTrue(app.buttons["land-send-report"].waitForExistence(timeout: 5))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = spanish ? "community-safety-es" : "community-safety-en"; shot.lifetime = .keepAlways; add(shot)
        app.buttons["land-block-creator"].tap()
        XCTAssertTrue(app.buttons.matching(identifier: "land-confirm-block").matching(NSPredicate(format: "label == %@", spanish ? "Bloquear creador" : "Block creator")).firstMatch.waitForExistence(timeout: 5))
        app.buttons.matching(identifier: "land-confirm-block").matching(NSPredicate(format: "label == %@", spanish ? "Bloquear creador" : "Block creator")).firstMatch.tap()
        XCTAssertTrue(app.staticTexts["land-fixed-status"].waitForExistence(timeout: 5))
        app.buttons["land-archipelago"].tap()
        XCTAssertTrue(app.buttons["land-community-safety"].waitForExistence(timeout: 5))
        XCTAssertNotEqual(app.staticTexts["land-focused-island"].label, "Harbor of Patience")
        app.buttons["land-community-safety"].tap()
        XCTAssertTrue(app.buttons["land-unblock-qafixture0"].waitForExistence(timeout: 5))
        app.buttons["land-unblock-qafixture0"].tap()
        XCTAssertFalse(app.buttons["land-unblock-qafixture0"].exists)
    }
}
