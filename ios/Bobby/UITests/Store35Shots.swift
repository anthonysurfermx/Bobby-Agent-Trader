import XCTest

/// Full-resolution App Store captures of the current app, without retouching.
/// Analysis uses the public backend; the island is the bundled showcase.
final class Store35Shots: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    func testEnglishScreenshots() { capture(spanish: false) }
    func testSpanishScreenshots() { capture(spanish: true) }
    private func shot(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name; image.lifetime = .keepAlways; add(image)
    }
    private func capture(spanish: Bool) {
        let suffix = spanish ? "es-MX" : "en-US"
        let app = XCUIApplication()
        app.launchArguments = ["-store-shots", "-AppleLanguages", spanish ? "(es)" : "(en)", "-agent.riskNoticeVersion", "4", "-agent.onboarded", "NO", "-avatar.voiceMuted", "YES"]
        app.launch()
        let next = app.buttons["onboarding-next"]
        XCTAssertTrue(next.waitForExistence(timeout: 20))
        sleep(2)
        shot(app, "store35-01-companion-\(suffix)")
        next.tap()
        let ready = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: next)
        wait(for: [ready], timeout: 20)
        next.tap()
        XCTAssertTrue(app.buttons["avatar-vibe-chill"].waitForExistence(timeout: 5))
        app.buttons["avatar-vibe-chill"].tap()
        shot(app, "store35-02-style-\(suffix)")
        next.tap()
        XCTAssertTrue(app.buttons["squad-portrait"].waitForExistence(timeout: 10))
        app.buttons["squad-portrait"].tap()
        XCTAssertTrue(app.staticTexts["squad-stage-ready"].waitForExistence(timeout: 20))
        shot(app, "store35-03-squad-\(suffix)")
        app.buttons["squad-close"].tap()
        let ask = app.textFields["ask-field"]
        XCTAssertTrue(ask.waitForExistence(timeout: 5))
        ask.tap()
        // A fresh simulator may present Apple's bilingual keyboard introduction.
        let keyboardIntro = app.buttons["Continue"].firstMatch
        if keyboardIntro.waitForExistence(timeout: 2) { keyboardIntro.tap() }
        ask.typeText(spanish ? "Que apoya y debilita el caso de Bitcoin?" : "What supports and weakens the case for Bitcoin?")
        app.buttons["ask-send"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[spanish ? "VEREDICTO LISTO" : "VERDICT READY"].waitForExistence(timeout: 55))
        let equip = app.buttons[spanish ? "EQUIPARLO" : "EQUIP IT"]
        if equip.waitForExistence(timeout: 3) { equip.tap() }
        let dismiss = app.buttons[spanish ? "Cerrar aviso de no operar" : "Dismiss no trade moment"]
        if dismiss.exists { dismiss.tap() }
        app.scrollViews.firstMatch.swipeUp()
        sleep(2)
        shot(app, "store35-04-analysis-\(suffix)")
        let verdict = app.staticTexts[spanish ? "DIRECTOR // VEREDICTO" : "CIO // VERDICT"]
        for _ in 0..<5 {
            if verdict.isHittable { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(verdict.isHittable)
        shot(app, "store35-06-verdict-\(suffix)")
        // Enter through the shipped desk control, also proving the UI responds
        // after scrolling the full translated answer.
        app.buttons["desk-land"].tap()
        XCTAssertTrue(app.buttons["land-archipelago"].waitForExistence(timeout: 15))
        app.buttons["land-archipelago"].tap()
        app.buttons["land-next-island"].tap()
        XCTAssertEqual(app.staticTexts["land-focused-island"].label, "Satoshi Nakamoto")
        shot(app, "store35-05-traderland-\(suffix)")
    }
}
