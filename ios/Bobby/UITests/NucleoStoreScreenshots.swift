import XCTest

/// Captures the shipping interface with recorded market responses, without real AI calls.
final class NucleoStoreScreenshots: XCTestCase {
    func testEnglishScreenshots() { capture(language: "en") }
    func testSpanishScreenshots() { capture(language: "es") }

    private func capture(language: String) {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", "default", "-nucleo-page", "app",
            "-AppleLanguages", "(\(language))", "-agent.riskNoticeVersion", "5",
            "-companion.id", "momo", "-companion.selected.v2.local", "momo",
            "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        let ask = app.webViews.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", language == "es" ? "Escribe una pregunta" : "Type a question", language == "es" ? "Pregúntale a Bobby, mantén para hablar" : "Ask Bobby, hold to talk")).firstMatch
        XCTAssertTrue(ask.waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 3)
        shot(app, "release47-home-\(language)")
        ask.tap()
        let field = app.webViews.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        field.tap()
        field.typeText(language == "es" ? "Que riesgos tiene Bitcoin?" : "What risks should I review for Bitcoin?")
        app.webViews.buttons[language == "es" ? "Enviar pregunta" : "Send question"].tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1)
        shot(app, "release47-debate-\(language)")
        let wait = app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", language == "es" ? "Esperar" : "Wait")).firstMatch
        XCTAssertTrue(wait.waitForExistence(timeout: 40))
        // Wait until the real result, rather than the animated transition, is available.
        let pill = ask
        XCTAssertTrue(pill.waitForExistence(timeout: 20))
        shot(app, "release47-verdict-\(language)")
        Thread.sleep(forTimeInterval: 8)
        let web = app.webViews.firstMatch
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.40)).press(forDuration: 0.1,
            thenDragTo: web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)))
        let heading = app.webViews.staticTexts[language == "es" ? "EL DEBATE" : "THE DEBATE"]
        XCTAssertTrue(heading.waitForExistence(timeout: 15))
        Thread.sleep(forTimeInterval: 1)
        shot(app, "release47-evidence-\(language)")
        app.terminate()
    }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
