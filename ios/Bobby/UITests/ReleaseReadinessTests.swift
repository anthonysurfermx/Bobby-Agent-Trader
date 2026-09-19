import XCTest

final class ReleaseReadinessTests: XCTestCase {
    func testAIConsentIsRequiredBeforeEnteringDesk() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-agent.riskNoticeVersion", "0", "-agent.onboarded", "YES"]
        app.launch()
        let consent = app.buttons["Allow AI processing of my questions."]
        XCTAssertTrue(consent.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["ACKNOWLEDGE ALL FOUR"].isEnabled)
        consent.tap()
        app.buttons["Not investment advice."].tap()
        app.buttons["Bobby never touches your money."].tap()
        XCTAssertFalse(app.buttons["ACKNOWLEDGE ALL FOUR"].isEnabled)
        let risk = app.buttons["You can lose money. You decide."]
        if !risk.isHittable { app.swipeUp() }
        risk.tap()
        let enter = app.buttons["I UNDERSTAND. LET ME IN"]
        XCTAssertTrue(enter.isEnabled)
        enter.tap()
        XCTAssertTrue(consent.waitForNonExistence(timeout: 5))
    }

    func testOrdinaryIslandDoesNotExposePublicGallery() {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-AppleLanguages", "(en)"]
        app.launch()
        XCTAssertTrue(app.buttons["How to play"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["land-archipelago"].exists)
        XCTAssertFalse(app.buttons["land-publish-cta"].exists)
    }
}
