import XCTest

final class CompanionBuild69UITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }
    func testSpanishCompanionAndMemory() { exercise("es") }
    func testGermanCompanionAndMemory() { exercise("de") }
    func testLiveSpanishAndGermanCompanion() {
        for language in ["es", "de"] {
            let app = launch(language, scenario: "live")
            ask(app, language == "es" ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
            let close = app.webViews.firstMatch.buttons[language == "es" ? "Cerrar" : "Schließen"]
            XCTAssertTrue(close.waitForExistence(timeout: 60), app.debugDescription)
            XCTAssertFalse(app.webViews.firstMatch.buttons[language == "es" ? "Intentar de nuevo" : "Erneut versuchen"].exists, app.debugDescription)
            if app.buttons["companion-consent-no"].exists { app.buttons["companion-consent-no"].tap() }
            shot(app, "build69-\(language)-tier1-production")
            print("[CompanionLive] language=\(language) reply UI: \(app.webViews.firstMatch.debugDescription)")
            app.terminate()
        }
    }
    func testSpanishCompanionRetryOnce() {
        let app = launch("es", scenario: "companion-error")
        ask(app, "¿Qué significa invertir?")
        let retry = app.webViews.firstMatch.buttons["Intentar de nuevo"]
        XCTAssertTrue(retry.waitForExistence(timeout: 20), app.debugDescription)
        retry.tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons["Cerrar"].waitForExistence(timeout: 20))
        XCTAssertFalse(retry.exists)
        shot(app, "build69-es-one-retry")
    }
    private func launch(_ language: String, scenario: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "app", "-qa-companion",
            "-AppleLanguages", "(\(language))", "-app.language", language, "-agent.riskNoticeVersion", "6",
            "-companion.id", "momo", "-companion.selected.v2.local", "momo", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        if scenario == "live" {
            app.launchArguments.removeFirst(2)
            app.launchArguments += ["-qa-companion-live"]
        }
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        return app
    }
    private func ask(_ app: XCUIApplication, _ question: String) {
        let web = app.webViews.firstMatch
        let known = web.buttons.matching(NSPredicate(format: "label == 'Escribe una pregunta' OR label == 'Frage eingeben' OR label == 'Type a question' OR label CONTAINS 'mantén para hablar' OR label CONTAINS 'zum Sprechen' OR label CONTAINS 'hold to talk'")).firstMatch
        XCTAssertTrue(known.waitForExistence(timeout: 15), app.debugDescription); known.tap()
        let field = web.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
        field.tap(); field.typeText(question)
        let send = web.buttons.matching(NSPredicate(format: "label == 'Enviar pregunta' OR label == 'Frage senden' OR label == 'Send question'")).firstMatch
        XCTAssertTrue(send.waitForExistence(timeout: 10), app.debugDescription)
        send.tap()
    }
    private func exercise(_ language: String) {
        let spanish = language == "es"
        let question = spanish ? "¿Qué significa invertir?" : "Was bedeutet investieren?"
        let followUp = spanish ? "¿Cómo funciona una acción?" : "Wie funktioniert eine Aktie?"
        let close = spanish ? "Cerrar" : "Schließen"
        var app = launch(language, scenario: "companion-plain")
        ask(app, question)
        let next = app.webViews.firstMatch.buttons[followUp]
        XCTAssertTrue(next.waitForExistence(timeout: 20), app.debugDescription)
        shot(app, "build69-\(language)-tier1-explanation")
        next.tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons[followUp].waitForExistence(timeout: 20))
        shot(app, "build69-\(language)-tier1-follow-up")
        app.terminate()

        app = launch(language, scenario: "companion")
        ask(app, question)
        let accept = app.buttons["companion-consent-yes"]
        XCTAssertTrue(accept.waitForExistence(timeout: 20), app.debugDescription)
        shot(app, "build69-\(language)-tier2-consent")
        accept.tap()
        let crypto = app.webViews.firstMatch.buttons[spanish ? "Cripto" : "Krypto"]
        XCTAssertTrue(crypto.waitForExistence(timeout: 15), app.debugDescription)
        shot(app, "build69-\(language)-tier2-interest")
        crypto.tap()
        let words = app.webViews.firstMatch.buttons[spanish ? "No entiendo las palabras" : "Ich verstehe die Begriffe nicht"]
        XCTAssertTrue(words.waitForExistence(timeout: 10), app.debugDescription)
        shot(app, "build69-\(language)-tier2-barrier")
        words.tap()
        let when = app.webViews.firstMatch.buttons[spanish ? "En menos de 2 años" : "In weniger als 2 Jahren"]
        XCTAssertTrue(when.waitForExistence(timeout: 10), app.debugDescription)
        shot(app, "build69-\(language)-tier2-when")
        when.tap()
        let skip = app.webViews.firstMatch.buttons[spanish ? "Omitir" : "Überspringen"]
        XCTAssertTrue(skip.waitForExistence(timeout: 10))
        shot(app, "build69-\(language)-tier2-cushion")
        skip.tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons[followUp].waitForExistence(timeout: 10))
        app.webViews.firstMatch.buttons[followUp].tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons[followUp].waitForExistence(timeout: 20))
        shot(app, "build69-\(language)-tier2-personalized")
        app.webViews.firstMatch.buttons[close].tap()
        let profile = app.webViews.firstMatch.buttons[spanish ? "Momo. Cuenta y progreso" : "Momo. Konto und Fortschritt"]
        XCTAssertTrue(profile.waitForExistence(timeout: 15), app.debugDescription)
        profile.tap()
        let memory = app.buttons["account-memory"]
        XCTAssertTrue(memory.waitForExistence(timeout: 10), app.debugDescription)
        memory.tap()
        let notes = app.buttons["memory-educational-notes"]
        XCTAssertTrue(notes.waitForExistence(timeout: 10), app.debugDescription)
        notes.tap()
        XCTAssertTrue(app.staticTexts["companion-notes-title"].waitForExistence(timeout: 10))
        shot(app, "build69-\(language)-tier2-notes")
        app.buttons["companion-correct-interest"].tap()
        let correction = app.buttons["companion-correct-option-companies"]
        XCTAssertTrue(correction.waitForExistence(timeout: 10))
        correction.tap()
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForExistence(timeout: 10))
        shot(app, "build69-\(language)-tier2-corrected")
        app.buttons["companion-delete-interest"].tap()
        XCTAssertFalse(app.staticTexts["companion-note-interest"].exists)
        let toggle = app.switches["companion-memory-toggle"]
        toggle.tap()
        XCTAssertFalse(app.staticTexts["companion-note-when"].exists)
        shot(app, "build69-\(language)-tier2-memory-off")
        app.terminate()
    }
    private func shot(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
}
