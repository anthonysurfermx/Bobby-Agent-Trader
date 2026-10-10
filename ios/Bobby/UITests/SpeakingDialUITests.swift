import XCTest

/// Real WebKit + native bridge, recorded market fixtures, muted voice. No model calls.
final class SpeakingDialUITests: XCTestCase {
    func testSpanishDialAndPersistence() { exercise("es") }
    func testEnglishDialAndPersistence() { exercise("en") }
    private func exercise(_ language: String) {
        continueAfterFailure = false
        let app = XCUIApplication()
        let base = ["-nucleo-fixtures", "default", "-nucleo-page", "app", "-AppleLanguages", "(\(language))", "-app.language", language, "-agent.riskNoticeVersion", "6", "-companion.id", "momo", "-companion.selected.v2.local", "momo", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        app.launchArguments = base + ["-qa-speaking-reset"]
        app.launch()
        let web = app.webViews.firstMatch
        let plain = named(web, language == "es" ? "Sencillo" : "Plain")
        XCTAssertTrue(plain.waitForExistence(timeout: 30), app.debugDescription)
        shot(app, "dial68-\(language)-plain")
        named(web, language == "es" ? "Con términos" : "With terms").tap()
        shot(app, "dial68-\(language)-terms")
        named(web, language == "es" ? "Técnico" : "Technical").tap()
        XCTAssertTrue(web.staticTexts[language == "es" ? "Sobrecomprado en 1H, bajo resistencia. Falta confirmación." : "Overbought on 1H, under resistance. No confirmation yet."].exists)
        shot(app, "dial68-\(language)-technical")
        web.buttons[language == "es" ? "Así está bien" : "That works"].tap()
        XCTAssertTrue(named(web, language == "es" ? "¿Qué quieres entender hoy?" : "What do you want to understand today?").waitForExistence(timeout: 10))
        app.terminate(); app.launchArguments = base; app.launch()
        XCTAssertTrue(web.waitForExistence(timeout: 30))
        let ask = web.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", language == "es" ? "Escribe una pregunta" : "Type a question", language == "es" ? "Pregúntale a Bobby, mantén para hablar" : "Ask Bobby, hold to talk")).firstMatch
        XCTAssertTrue(ask.waitForExistence(timeout: 20))
        XCTAssertFalse(named(web, language == "es" ? "Sencillo" : "Plain").exists)
        app.terminate()
    }
    private func named(_ web: XCUIElement, _ label: String) -> XCUIElement {
        web.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
    }
    private func shot(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
}
