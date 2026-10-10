import XCTest

final class CompanionBuild69UITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }
    func testSpanishCompanionAndMemory() { exercise("es") }
    func testGermanCompanionAndMemory() { exercise("de") }
    func testLiveSpanishMemory() { exercise("es", live: true) }
    func testLiveGermanMemory() { exercise("de", live: true) }
    func testLiveSpanishAndGermanCompanion() {
        for language in ["es", "de"] {
            let app = launch(language, scenario: "live")
            ask(app, language == "es" ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
            let close = app.webViews.firstMatch.buttons[language == "es" ? "Cerrar" : "Schließen"]
            XCTAssertTrue(close.waitForExistence(timeout: 60), app.debugDescription)
            XCTAssertFalse(app.webViews.firstMatch.buttons[language == "es" ? "Intentar de nuevo" : "Erneut versuchen"].exists, app.debugDescription)
            if app.buttons["companion-consent-no"].exists { app.buttons["companion-consent-no"].tap() }
            visible(close, app, aboveMic: true)
            shot(app, "build69-\(language)-tier1-production-fixed")
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
    func testSpanishControlsFit() { controlsFit("es") }
    func testGermanControlsFit() { controlsFit("de") }
    func testTypedSpanishAnswers() { typedAnswers("es", live: false) }
    func testTypedGermanAnswers() { typedAnswers("de", live: false) }
    func testLiveTypedSpanishAnswers() { typedAnswers("es", live: true) }
    func testSpanishAnswerErrorKeepsOptions() {
        let app = launch("es", scenario: "companion-answer-error")
        ask(app, "¿Qué significa invertir?")
        XCTAssertTrue(app.buttons["companion-consent-yes"].waitForExistence(timeout: 20))
        app.buttons["companion-consent-yes"].tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons["Cripto"].waitForExistence(timeout: 10))
        answer(app, "Me interesa cripto", spanish: true)
        XCTAssertTrue(app.webViews.firstMatch.staticTexts["No pude anotarlo. Puedes elegir una de las opciones."].waitForExistence(timeout: 15))
        visible(app.webViews.firstMatch.buttons["Omitir"], app, aboveMic: true)
        shot(app, "build69-es-tier3-answer-error-fixed")
        app.webViews.firstMatch.buttons["Cripto"].tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons["No entiendo las palabras"].waitForExistence(timeout: 10))
        app.terminate()
    }
    func testFactCardFixture() {
        let app = launch("es", scenario: "companion-fact")
        ask(app, "¿Qué son los CETES?")
        XCTAssertTrue(app.buttons["companion-consent-no"].waitForExistence(timeout: 20))
        app.buttons["companion-consent-no"].tap()
        let card = app.webViews.firstMatch.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Fuente de ejemplo' AND label CONTAINS '2026'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10)); XCTAssertTrue(card.isHittable)
        visible(app.webViews.firstMatch.buttons["Cerrar"], app, aboveMic: true)
        shot(app, "build69-es-tier3-fact-fixture-fixed")
        app.terminate()
    }
    func testSpanishExerciseExplanation() { exerciseExplanation("es") }
    func testGermanExerciseExplanation() { exerciseExplanation("de") }
    private func exerciseExplanation(_ language: String) {
        let es = language == "es", app = launch(language, scenario: "companion-exercise")
        ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
        let pause = app.webViews.firstMatch.buttons[es ? "Pararía" : "Ich würde aufhören"]
        XCTAssertTrue(pause.waitForExistence(timeout: 20), app.debugDescription)
        visible(app.webViews.firstMatch.buttons[es ? "Omitir" : "Überspringen"], app, aboveMic: true)
        shot(app, "build69-\(language)-tier3-exercise-choice-fixed")
        pause.tap()
        let reply = app.webViews.firstMatch.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", es ? "Una caída significa" : "Ein Rückgang bedeutet")).firstMatch
        XCTAssertTrue(reply.waitForExistence(timeout: 20), app.debugDescription)
        visible(app.webViews.firstMatch.buttons[es ? "Cerrar" : "Schließen"], app, aboveMic: true)
        shot(app, "build69-\(language)-tier3-exercise-explanation-fixed")
        app.terminate()
    }
    private func typedAnswers(_ language: String, live: Bool) {
        let es = language == "es", suffix = live ? "-live" : "-fixture-fixed"
        let app = launch(language, scenario: live ? "live" : "companion")
        ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
        XCTAssertTrue(app.buttons["companion-consent-yes"].waitForExistence(timeout: 60))
        app.buttons["companion-consent-yes"].tap()
        let replies = es ? ["Me interesa cripto", live ? "No entiendo las palabras" : "???", "Lo necesitaría en unos tres años", "Una emergencia sí lo consumiría"] : ["Mich interessiert Krypto", "???", "In etwa drei Jahren", "Ja, bei einem Notfall bräuchte ich es"]
        let ready = es ? ["Cripto", "No entiendo las palabras", "En menos de 2 años", "Sí"] : ["Krypto", "Ich verstehe die Begriffe nicht", "In weniger als 2 Jahren", "Ja"]
        for index in 0..<replies.count {
            XCTAssertTrue(app.webViews.firstMatch.buttons[ready[index]].waitForExistence(timeout: 30), app.debugDescription)
            answer(app, replies[index], spanish: es)
            let next = index + 1 < ready.count ? ready[index+1] : (es ? "Cerrar" : "Schließen")
            XCTAssertTrue(app.webViews.firstMatch.buttons[next].waitForExistence(timeout: 60), app.debugDescription)
            shot(app, "build69-\(language)-tier3-noted-\(index+1)\(suffix)")
        }
        app.webViews.firstMatch.buttons[es ? "Cerrar" : "Schließen"].tap()
        let profile = app.webViews.firstMatch.buttons[es ? "Momo. Cuenta y progreso" : "Momo. Konto und Fortschritt"]
        XCTAssertTrue(profile.waitForExistence(timeout: 10)); profile.tap()
        // The return animation ignores profile taps until the home state has settled.
        if !app.buttons["account-memory"].waitForExistence(timeout: 2) { profile.tap() }
        XCTAssertTrue(app.buttons["account-memory"].waitForExistence(timeout: 10)); app.buttons["account-memory"].tap()
        XCTAssertTrue(app.buttons["memory-educational-notes"].waitForExistence(timeout: 10)); app.buttons["memory-educational-notes"].tap()
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForExistence(timeout: 10))
        if !live {
            let inferred = app.staticTexts[es ? "Bobby lo dedujo, por confirmar" : "Bobby hat es abgeleitet, noch zu bestätigen"]
            XCTAssertTrue(inferred.waitForExistence(timeout: 10), app.debugDescription)
        }
        shot(app, "build69-\(language)-tier3-noted-notes\(suffix)")
        reach(app.switches["companion-memory-toggle"], app, up: false); app.switches["companion-memory-toggle"].tap()
        app.terminate()
    }
    private func answer(_ app: XCUIApplication, _ text: String, spanish: Bool) {
        let mic = app.webViews.firstMatch.buttons.matching(NSPredicate(format: "label CONTAINS 'mantén para hablar' OR label CONTAINS 'zum Sprechen' OR label CONTAINS 'hold to talk'")).firstMatch
        XCTAssertTrue(mic.waitForExistence(timeout: 10)); mic.tap()
        let field = app.webViews.firstMatch.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText(text)
        let send = app.webViews.firstMatch.buttons[spanish ? "Enviar respuesta" : "Antwort senden"]
        XCTAssertTrue(send.waitForExistence(timeout: 10), app.debugDescription); send.tap()
    }
    private func controlsFit(_ language: String) {
        let es = language == "es"
        var app = launch(language, scenario: "companion-plain")
        ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
        let close = app.webViews.firstMatch.buttons[es ? "Cerrar" : "Schließen"]
        XCTAssertTrue(close.waitForExistence(timeout: 20))
        visible(close, app, aboveMic: true)
        let reply = app.webViews.firstMatch.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", es ? "Invertir significa" : "Investieren bedeutet")).firstMatch
        XCTAssertTrue(reply.isHittable, app.debugDescription)
        shot(app, "build69-\(language)-tier1-explanation-fixed")
        close.tap()
        app.terminate()
        app = launch(language, scenario: "companion")
        ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
        let yes = app.buttons["companion-consent-yes"], no = app.buttons["companion-consent-no"]
        XCTAssertTrue(yes.waitForExistence(timeout: 20))
        let title = app.staticTexts["companion-consent-title"]
        let expanded = NSPredicate { _, _ in title.frame.minY < app.frame.height * 0.3 }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: expanded, object: nil)], timeout: 10), .completed)
        visible(yes, app); visible(no, app); visible(app.descendants(matching: .any)["companion-consent-details"], app)
        XCTAssertEqual(yes.frame.width, no.frame.width, accuracy: 1)
        XCTAssertEqual(yes.frame.height, no.frame.height, accuracy: 1)
        shot(app, "build69-\(language)-tier2-consent-fixed")
        yes.tap()
        let options = [es ? "Cripto" : "Krypto", es ? "No entiendo las palabras" : "Ich verstehe die Begriffe nicht"]
        for label in options {
            let option = app.webViews.firstMatch.buttons[label]
            XCTAssertTrue(option.waitForExistence(timeout: 15))
            if label == options[0] {
                visible(app.webViews.firstMatch.buttons[es ? "Omitir" : "Überspringen"], app, aboveMic: true)
                shot(app, "build69-\(language)-tier2-interest-fixed")
            }
            if label == options[1] {
                visible(app.webViews.firstMatch.buttons[es ? "Omitir" : "Überspringen"], app, aboveMic: true)
                shot(app, "build69-\(language)-tier2-barrier-fixed")
            }
            option.tap()
        }
        let when = app.webViews.firstMatch.buttons[es ? "En menos de 2 años" : "In weniger als 2 Jahren"]
        XCTAssertTrue(when.waitForExistence(timeout: 15))
        for label in (es ? ["En menos de 2 años", "En 2 a 7 años", "En más de 7 años", "No sé", "Omitir"] : ["In weniger als 2 Jahren", "In 2 bis 7 Jahren", "In mehr als 7 Jahren", "Ich weiß es nicht", "Überspringen"]) {
            visible(app.webViews.firstMatch.buttons[label], app, aboveMic: true)
        }
        shot(app, "build69-\(language)-tier2-when-fixed")
        app.webViews.firstMatch.buttons[es ? "Omitir" : "Überspringen"].tap()
        app.terminate()
    }
    private func visible(_ element: XCUIElement, _ app: XCUIApplication, aboveMic: Bool = false) {
        XCTAssertTrue(element.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertTrue(element.isHittable, element.debugDescription)
        XCTAssertTrue(app.frame.contains(element.frame), "Clipped: \(element.debugDescription)")
        XCTAssertGreaterThanOrEqual(element.frame.height, 43)
        if aboveMic { XCTAssertLessThan(element.frame.maxY, app.frame.height * 742 / 844) }
    }
    private func launch(_ language: String, scenario: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "app", "-qa-companion",
            "-AppleLanguages", "(\(language))", "-app.language", language, "-agent.riskNoticeVersion", "6",
            "-companion.id", "momo", "-companion.selected.v2.local", "momo", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        if scenario == "companion-exercise" { app.launchArguments += ["-qa-companion-day3"] }
        if scenario == "live" {
            app.launchArguments.removeFirst(2)
            app.launchArguments += ["-qa-companion-live", "-qa-companion-memory-account", "companion-qa-" + UUID().uuidString]
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
    private func exercise(_ language: String, live: Bool = false) {
        let suffix = live ? "-live" : ""
        let spanish = language == "es"
        let question = spanish ? "¿Qué significa invertir?" : "Was bedeutet investieren?"
        let followUp = spanish ? "¿Cómo funciona una acción?" : "Wie funktioniert eine Aktie?"
        let close = spanish ? "Cerrar" : "Schließen"
        var app = XCUIApplication()
        if !live {
        app = launch(language, scenario: "companion-plain")
        ask(app, question)
        let next = app.webViews.firstMatch.buttons[followUp]
        XCTAssertTrue(next.waitForExistence(timeout: 20), app.debugDescription)
        shot(app, "build69-\(language)-tier1-explanation")
        next.tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons[followUp].waitForExistence(timeout: 20))
        shot(app, "build69-\(language)-tier1-follow-up")
        app.terminate()

        }
        app = launch(language, scenario: live ? "live" : "companion")
        ask(app, question)
        let accept = app.buttons["companion-consent-yes"]
        XCTAssertTrue(accept.waitForExistence(timeout: 60), app.debugDescription)
        shot(app, "build69-\(language)-tier2-consent\(suffix)")
        accept.tap()
        let crypto = app.webViews.firstMatch.buttons[spanish ? "Cripto" : "Krypto"]
        XCTAssertTrue(crypto.waitForExistence(timeout: 15), app.debugDescription)
        shot(app, "build69-\(language)-tier2-interest\(suffix)")
        crypto.tap()
        let words = app.webViews.firstMatch.buttons[spanish ? "No entiendo las palabras" : "Ich verstehe die Begriffe nicht"]
        XCTAssertTrue(words.waitForExistence(timeout: 10), app.debugDescription)
        shot(app, "build69-\(language)-tier2-barrier\(suffix)")
        words.tap()
        let when = app.webViews.firstMatch.buttons[spanish ? "En menos de 2 años" : "In weniger als 2 Jahren"]
        XCTAssertTrue(when.waitForExistence(timeout: 10), app.debugDescription)
        shot(app, "build69-\(language)-tier2-when\(suffix)")
        when.tap()
        let skip = app.webViews.firstMatch.buttons[spanish ? "Omitir" : "Überspringen"]
        XCTAssertTrue(skip.waitForExistence(timeout: 10))
        shot(app, "build69-\(language)-tier2-cushion\(suffix)")
        if live { app.webViews.firstMatch.buttons[spanish ? "Sí" : "Ja"].tap() } else { skip.tap() }
        if live {
            let done = app.webViews.firstMatch.buttons[close]
            XCTAssertTrue(done.waitForExistence(timeout: 10))
            visible(done, app, aboveMic: true)
            shot(app, "build69-\(language)-tier1-production-fixed")
            shot(app, "build69-\(language)-tier1-production-live")
            done.tap()
            ask(app, spanish ? "¿Qué significa invertir si necesito mi dinero pronto?" : "Was bedeutet investieren, wenn ich mein Geld bald brauche?")
            let mark = app.webViews.firstMatch.staticTexts[CompanionLabels.personalized(language)]
            XCTAssertTrue(mark.waitForExistence(timeout: 60), app.debugDescription)
        } else {
        XCTAssertTrue(app.webViews.firstMatch.buttons[followUp].waitForExistence(timeout: 10))
        app.webViews.firstMatch.buttons[followUp].tap()
        XCTAssertTrue(app.webViews.firstMatch.buttons[followUp].waitForExistence(timeout: 20))
        }
        shot(app, "build69-\(language)-tier2-personalized\(suffix)")
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
        shot(app, "build69-\(language)-tier2-notes\(suffix)")
        app.buttons["companion-correct-interest"].tap()
        let correction = app.buttons["companion-correct-option-companies"]
        XCTAssertTrue(correction.waitForExistence(timeout: 10))
        correction.tap()
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForExistence(timeout: 10))
        reach(app.buttons["companion-delete-interest"], app, up: true)
        shot(app, "build69-\(language)-tier2-corrected\(suffix)")
        app.buttons["companion-delete-interest"].tap()
        XCTAssertFalse(app.staticTexts["companion-note-interest"].exists)
        shot(app, "build69-\(language)-tier2-deleted\(suffix)")
        let toggle = app.switches["companion-memory-toggle"]
        reach(toggle, app, up: false)
        toggle.tap()
        XCTAssertFalse(app.staticTexts["companion-note-when"].exists)
        shot(app, "build69-\(language)-tier2-memory-off\(suffix)")
        app.terminate()
    }
    private func reach(_ element: XCUIElement, _ app: XCUIApplication, up: Bool) {
        for _ in 0..<5 where !element.isHittable {
            if up { app.scrollViews.firstMatch.swipeUp() } else { app.scrollViews.firstMatch.swipeDown() }
        }
        XCTAssertTrue(element.isHittable, app.debugDescription)
    }
    private func shot(_ app: XCUIApplication, _ name: String) {
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
}

private enum CompanionLabels {
    static func personalized(_ language: String) -> String {
        language == "es" ? "Usa tus apuntes" : "Nutzt deine Notizen"
    }
}
