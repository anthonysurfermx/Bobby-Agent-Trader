import XCTest

final class OpeningLineUITests: XCTestCase {
    func testSpanishOpening() { exercise("es", prefix: "Veo fuerza en NVDA", action: "Ver lectura de") }
    func testEnglishOpening() { exercise("en", prefix: "I see strength in NVDA", action: "See the") }

    private func exercise(_ lang: String, prefix: String, action: String) {
        let app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", "companion-plain", "-nucleo-page", "app", "-qa-opening-line",
                               "-AppleLanguages", "(\(lang))", "-app.language", lang, "-AppleLocale", lang == "es" ? "es_MX" : "en_US",
                               "-agent.riskNoticeVersion", "6", "-companion.id", "momo",
                               "-companion.selected.v2.local", "momo", "-avatar.voiceMuted", "YES"]
        app.launch()
        let web = app.webViews.firstMatch
        let line = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
        XCTAssertTrue(line.waitForExistence(timeout: 30))
        guard line.exists else { return }
        XCTAssertTrue(line.label.contains("3"))
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "Bobby-opening-\(lang)"
        shot.lifetime = .keepAlways
        add(shot)
        line.tap()
        let confirm = web.buttons.matching(NSPredicate(format: "label BEGINSWITH[c] %@", action)).firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        guard confirm.exists else { return }
        confirm.tap()
        let result = web.buttons[lang == "es" ? "Ver análisis" : "Read analysis"]
        XCTAssertTrue(result.waitForExistence(timeout: 45))
        guard result.exists else { return }
        result.tap()
        XCTAssertTrue(web.buttons[lang == "es" ? "Volver a Bobby" : "Back to Bobby"].waitForExistence(timeout: 10))
    }
}
