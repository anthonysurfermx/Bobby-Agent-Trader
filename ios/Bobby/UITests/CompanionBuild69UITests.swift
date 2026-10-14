import XCTest

final class CompanionBuild69UITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }
    func testSpanishCompanionAndMemory() {
        dailyMemory("es")
    }
    func testGermanCompanionAndMemory() {
        dailyMemory("de")
    }
    func testLiveSpanishMemory() { exercise("es", live: true) }
    func testLiveGermanMemory() { exercise("de", live: true) }
    func testLiveSpanishAndGermanCompanion() {
        for language in ["es", "de"] {
            let app = launch(language, scenario: "live")
            ask(app, language == "es" ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
            let close = app.webViews.firstMatch.buttons[language == "es" ? "Volver a Bobby" : "Zurück zu Bobby"]
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
        let retry = app.webViews.firstMatch.buttons["Reintentar"]
        for _ in 0..<3 {
            XCTAssertTrue(retry.waitForExistence(timeout: 20), app.debugDescription)
            retry.tap()
        }
        XCTAssertTrue(retry.waitForExistence(timeout: 20)); XCTAssertTrue(retry.isHittable)
        shot(app, "i1-es-repeatable-retry"); app.terminate()
    }
    func testSpanishControlsFit() {
        dailyControls("es")
    }
    func testGermanControlsFit() {
        dailyControls("de")
    }
    func testTypedSpanishAnswers() {
        dailyTyped("es")
    }
    func testTypedGermanAnswers() {
        dailyTyped("de")
    }
    func testLiveTypedSpanishAnswers() { typedAnswers("es", live: true) }
    func testSpanishAnswerErrorKeepsOptions() {
        // T12: I-1 has no personal-answer panel; the fixture cannot bring one back.
        let app = launch("es", scenario: "companion-answer-error")
        ask(app, "¿Qué significa invertir?"); dailyAnswer(app, es: true)
        XCTAssertFalse(app.webViews.firstMatch.buttons["Cripto"].exists)
        XCTAssertFalse(app.webViews.firstMatch.buttons["Omitir"].exists)
        shot(app,"i1-es-no-personal-options"); app.terminate()
    }
    func testFactCardFixture() {
        let app = launch("es", scenario: "companion-fact")
        ask(app, "¿Qué son los CETES?"); dailyAnswer(app, es: true)
        let card = app.webViews.firstMatch.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Fuente de ejemplo' AND label CONTAINS '2026'")).firstMatch
        XCTAssertTrue(card.waitForExistence(timeout: 10)); visible(card, app)
        shot(app,"i1-es-fact-reading"); app.terminate()
    }
    func testSpanishExerciseExplanation() {
        dailyExercise("es")
    }
    func testGermanExerciseExplanation() {
        dailyExercise("de")
    }
    // T11–T16: the answer is first; Profile memory remains an explicit path.
    private func dailyAnswer(_ app: XCUIApplication, es: Bool) {
        let x=app.webViews.firstMatch.buttons[es ? "Cerrar la respuesta" : "Antwort schließen"]
        XCTAssertTrue(x.waitForExistence(timeout:20),app.debugDescription)
        XCTAssertFalse(app.buttons["companion-consent-yes"].exists)
        XCTAssertFalse(app.webViews.firstMatch.buttons[es ? "Cripto" : "Krypto"].exists)
    }
    private func dailyMemory(_ language: String) {
        let es=language=="es", app=launch(language,scenario:"companion-plain")
        ask(app,es ? "¿Qué significa invertir?" : "Was bedeutet investieren?"); dailyAnswer(app,es:es)
        let follow=app.webViews.firstMatch.buttons.matching(NSPredicate(format:"label CONTAINS %@",es ? "¿Cómo funciona una acción?" : "Wie funktioniert eine Aktie?")).firstMatch
        XCTAssertTrue(follow.waitForExistence(timeout:10)); follow.tap(); dailyAnswer(app,es:es)
        shot(app,"i1-\(language)-follow-up"); app.terminate()
        dailyNotes(language)
    }
    private func dailyControls(_ language: String) {
        let es=language=="es", app=launch(language,scenario:"companion")
        ask(app,es ? "¿Qué significa invertir?" : "Was bedeutet investieren?"); dailyAnswer(app,es:es)
        visible(app.webViews.firstMatch.buttons[es ? "Cerrar la respuesta" : "Antwort schließen"],app)
        let profile=app.webViews.firstMatch.buttons[es ? "Momo. Cuenta y progreso" : "Momo. Konto und Fortschritt"]
        XCTAssertTrue(profile.isHittable); profile.tap()
        XCTAssertTrue(app.buttons["account-analysis-level"].waitForExistence(timeout:10)); for _ in 0..<4 where !app.buttons["account-analysis-level"].isHittable { app.swipeUp() }; visible(app.buttons["account-analysis-level"],app)
        shot(app,"i1-\(language)-profile-control-roles"); app.terminate()
    }
    private func dailyExercise(_ language: String) {
        let es=language=="es",app=launch(language,scenario:"companion-exercise")
        ask(app,es ? "¿Qué significa invertir?" : "Was bedeutet investieren?"); dailyAnswer(app,es:es)
        XCTAssertFalse(app.webViews.firstMatch.buttons[es ? "Pararía" : "Ich würde aufhören"].exists)
        shot(app,"i1-\(language)-no-personal-exercise"); app.terminate()
    }
    private func dailyTyped(_ language: String) {
        let es=language=="es",app=launch(language,scenario:"companion")
        for question in es ? ["¿Qué significa invertir?","Me interesa cripto","No entiendo las palabras"] : ["Was bedeutet investieren?","Mich interessiert Krypto","Ich verstehe die Begriffe nicht"] {
            ask(app,question); dailyAnswer(app,es:es)
        }
        shot(app,"i1-\(language)-typed-without-check-in"); app.terminate()
    }
    private func dailyNotes(_ language: String) {
        let es=language=="es",app=launch(language,scenario:"companion",seedNotes:true)
        ask(app,es ? "¿Qué significa invertir?" : "Was bedeutet investieren?"); dailyAnswer(app,es:es)
        openNotes(app,es:es)
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForExistence(timeout:10))
        app.buttons["companion-correct-interest"].tap()
        XCTAssertTrue(app.buttons["companion-correct-option-companies"].waitForExistence(timeout:10)); app.buttons["companion-correct-option-companies"].tap()
        let toggle=app.switches["companion-memory-toggle"]; toggle.tap()
        let confirm=app.buttons["companion-delete-confirm"],cancel=app.buttons["companion-delete-cancel"]
        XCTAssertTrue(confirm.waitForExistence(timeout:10)); visible(confirm,app); visible(cancel,app)
        XCTAssertEqual(confirm.frame.width,cancel.frame.width,accuracy:1); XCTAssertEqual(confirm.frame.height,cancel.frame.height,accuracy:1)
        cancel.tap(); XCTAssertTrue(app.staticTexts["companion-note-interest"].exists)
        reach(app.buttons["companion-delete-interest"],app,up:true); app.buttons["companion-delete-interest"].tap()
        XCTAssertFalse(app.staticTexts["companion-note-interest"].exists); XCTAssertFalse(confirm.exists)
        reach(toggle,app,up:false); toggle.tap(); XCTAssertTrue(confirm.waitForExistence(timeout:10)); confirm.tap()
        XCTAssertEqual(toggle.value as? String,"0")
        shot(app,"i1-\(language)-profile-correct-delete-memory"); app.terminate()
    }
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
        visible(app.webViews.firstMatch.buttons[es ? "Volver a Bobby" : "Zurück zu Bobby"], app, aboveMic: true)
        shot(app, "build69-\(language)-tier3-exercise-explanation-fixed")
        app.terminate()
    }
    func testSpanishDesignReviewC() {
        dailyNotes("es")
    }
    func testGermanDesignReviewC() {
        dailyNotes("de")
    }
    func testDecliningConsentAsksNothingMore() {
        let app = launch("es",scenario:"companion")
        ask(app,"¿Qué significa invertir?"); dailyAnswer(app,es:true)
        openNotes(app,es:true)
        let toggle=app.switches["companion-memory-toggle"]; XCTAssertTrue(toggle.waitForExistence(timeout:10)); toggle.tap()
        XCTAssertTrue(app.buttons["companion-consent-no"].waitForExistence(timeout:10)); app.buttons["companion-consent-no"].tap()
        XCTAssertEqual(toggle.value as? String,"0"); XCTAssertFalse(app.staticTexts["companion-note-interest"].exists)
        shot(app,"i1-es-profile-memory-declined"); app.terminate()
    }
    private func openNotes(_ app: XCUIApplication, es: Bool) {
        let close = app.webViews.firstMatch.buttons[es ? "Cerrar la respuesta" : "Antwort schließen"]
        XCTAssertTrue(close.waitForExistence(timeout: 10)); close.tap()
        let profile = app.webViews.firstMatch.buttons[es ? "Momo. Cuenta y progreso" : "Momo. Konto und Fortschritt"]
        XCTAssertTrue(profile.waitForExistence(timeout: 10)); profile.tap()
        if !app.buttons["account-memory"].waitForExistence(timeout: 2) { profile.tap() }
        XCTAssertTrue(app.buttons["account-memory"].waitForExistence(timeout: 10)); app.buttons["account-memory"].tap()
        XCTAssertTrue(app.buttons["memory-educational-notes"].waitForExistence(timeout: 10)); app.buttons["memory-educational-notes"].tap()
        XCTAssertTrue(app.staticTexts["companion-notes-title"].waitForExistence(timeout: 10))
    }
    private func designReviewC(_ language: String) {
        let es = language == "es", question = es ? "¿Qué significa invertir?" : "Was bedeutet investieren?"
        var app = launch(language, scenario: "companion")
        ask(app, question)
        XCTAssertTrue(app.buttons["companion-consent-yes"].waitForExistence(timeout: 20)); app.buttons["companion-consent-yes"].tap()
        let crypto = app.webViews.firstMatch.buttons[es ? "Cripto" : "Krypto"]
        XCTAssertTrue(crypto.waitForExistence(timeout: 15))
        visible(crypto, app); shot(app, "build69-\(language)-interest-c")
        // Ask a personal question while the check-in is pending: it must remain unasked.
        ask(app, question)
        XCTAssertTrue(crypto.waitForExistence(timeout: 20)); crypto.tap()
        let barrier = app.webViews.firstMatch.buttons[es ? "No entiendo las palabras" : "Ich verstehe die Begriffe nicht"]
        XCTAssertTrue(barrier.waitForExistence(timeout: 15)); visible(barrier, app)
        shot(app, "build69-\(language)-barrier-c")
        app.webViews.firstMatch.buttons[es ? "Omitir" : "Überspringen"].tap()
        let back = app.webViews.firstMatch.buttons[es ? "Volver a Bobby" : "Zurück zu Bobby"]
        XCTAssertTrue(back.waitForExistence(timeout: 10))
        let when = app.webViews.firstMatch.buttons[es ? "En menos de 2 años" : "In weniger als 2 Jahren"]
        XCTAssertFalse(when.exists)
        ask(app, question)
        XCTAssertTrue(when.waitForExistence(timeout: 20)); visible(when, app)
        shot(app, "build69-\(language)-money-after-reply-c")
        when.tap(); XCTAssertTrue(back.waitForExistence(timeout: 10))
        XCTAssertFalse(app.webViews.firstMatch.buttons[es ? "Sí" : "Ja"].exists)
        ask(app, question)
        XCTAssertTrue(app.webViews.firstMatch.buttons[es ? "Sí" : "Ja"].waitForExistence(timeout: 20))
        app.webViews.firstMatch.buttons[es ? "Omitir" : "Überspringen"].tap()
        XCTAssertTrue(back.waitForExistence(timeout: 10))
        openNotes(app, es: es)
        let toggle = app.switches["companion-memory-toggle"]
        toggle.tap()
        let confirm = app.buttons["companion-delete-confirm"], cancel = app.buttons["companion-delete-cancel"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); visible(confirm, app); visible(cancel, app)
        XCTAssertEqual(confirm.frame.width, cancel.frame.width, accuracy: 1)
        XCTAssertEqual(confirm.frame.height, cancel.frame.height, accuracy: 1)
        shot(app, "build69-\(language)-memory-off-confirm-c"); cancel.tap()
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForExistence(timeout: 10))
        reach(app.buttons["companion-delete-all"], app, up: true); app.buttons["companion-delete-all"].tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); visible(confirm, app); visible(cancel, app)
        XCTAssertEqual(confirm.frame.width, cancel.frame.width, accuracy: 1)
        XCTAssertEqual(confirm.frame.height, cancel.frame.height, accuracy: 1)
        shot(app, "build69-\(language)-delete-all-confirm-c"); cancel.tap()
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForExistence(timeout: 10))
        // Single-note deletion has no confirmation. Delete all preserves memory.
        reach(app.buttons["companion-delete-interest"], app, up: false); app.buttons["companion-delete-interest"].tap()
        XCTAssertFalse(app.staticTexts["companion-note-interest"].exists); XCTAssertFalse(confirm.exists)
        reach(app.buttons["companion-delete-all"], app, up: true); app.buttons["companion-delete-all"].tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        XCTAssertTrue(app.staticTexts[es ? "Aún no hay apuntes." : "Noch keine Notizen."].waitForExistence(timeout: 10))
        reach(toggle, app, up: false); XCTAssertEqual(toggle.value as? String, "1")
        app.terminate()
        // A typed-only catalog value must display its human label.
        app = launch(language, scenario: "companion-belief"); ask(app, question)
        XCTAssertTrue(app.webViews.firstMatch.buttons[es ? "Nada en especial" : "Nichts Besonderes"].waitForExistence(timeout: 20), app.debugDescription)
        answer(app, es ? "Los bancos se quedan con todo" : "Die Banken behalten alles", spanish: es)
        XCTAssertTrue(app.webViews.firstMatch.buttons[es ? "Volver a Bobby" : "Zurück zu Bobby"].waitForExistence(timeout: 20))
        openNotes(app, es: es)
        let note = app.staticTexts["companion-note-belief"]
        XCTAssertTrue(note.waitForExistence(timeout: 10)); XCTAssertEqual(note.label, es ? "Los bancos se quedan con todo" : "Die Banken behalten alles")
        shot(app, "build69-\(language)-typed-note-c")
        app.switches["companion-memory-toggle"].tap()
        XCTAssertTrue(confirm.waitForExistence(timeout: 10)); confirm.tap()
        XCTAssertTrue(app.staticTexts[es ? "Aún no hay apuntes." : "Noch keine Notizen."].waitForExistence(timeout: 10))
        XCTAssertEqual(app.switches["companion-memory-toggle"].value as? String, "0")
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
            if index == 1 || index == 2 { ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?") }
            let next = index + 1 < ready.count ? ready[index+1] : (es ? "Volver a Bobby" : "Zurück zu Bobby")
            XCTAssertTrue(app.webViews.firstMatch.buttons[next].waitForExistence(timeout: 60), app.debugDescription)
            shot(app, "build69-\(language)-tier3-noted-\(index+1)\(suffix)")
        }
        app.webViews.firstMatch.buttons[es ? "Volver a Bobby" : "Zurück zu Bobby"].tap()
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
        let answerButton = app.webViews.firstMatch.buttons[spanish ? "Responder esta pregunta" : "Diese Frage beantworten"]
        XCTAssertTrue(answerButton.waitForExistence(timeout: 10)); answerButton.tap()
        let field = app.webViews.firstMatch.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10)); field.tap(); field.typeText(text)
        let send = app.webViews.firstMatch.buttons[spanish ? "Enviar respuesta" : "Antwort senden"]
        XCTAssertTrue(send.waitForExistence(timeout: 10), app.debugDescription); send.tap()
    }
    private func controlsFit(_ language: String) {
        let es = language == "es"
        var app = launch(language, scenario: "companion-plain")
        ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
        let close = app.webViews.firstMatch.buttons[es ? "Volver a Bobby" : "Zurück zu Bobby"]
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
        ask(app, es ? "¿Qué significa invertir?" : "Was bedeutet investieren?")
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
    private func launch(_ language: String, scenario: String, seedNotes: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "app", "-qa-companion",
            "-AppleLanguages", "(\(language))", "-app.language", language, "-agent.riskNoticeVersion", "6",
            "-companion.id", "momo", "-companion.selected.v2.local", "momo", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        if scenario == "companion-belief" { app.launchArguments += ["-qa-companion-day4"] }
        if scenario == "companion-exercise" { app.launchArguments += ["-qa-companion-day3"] }
        if scenario == "live" {
            app.launchArguments.removeFirst(2)
            app.launchArguments += ["-qa-companion-live", "-qa-companion-memory-account", "companion-qa-" + UUID().uuidString]
        }
        if seedNotes { app.launchArguments += ["-qa-redesign-notes"] }
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        return app
    }
    private func ask(_ app: XCUIApplication, _ question: String) {
        let web = app.webViews.firstMatch
        let known = web.buttons.matching(NSPredicate(format: "label == 'Escribe una pregunta' OR label == 'Frage eingeben' OR label == 'Type a question' OR label == 'Escribir una pregunta' OR label == 'Frage tippen' OR label == 'Escribir' OR label == 'Schreiben' OR label == 'Type' OR label CONTAINS 'mantén para hablar' OR label CONTAINS 'zum Sprechen' OR label CONTAINS 'hold to talk'")).firstMatch
        XCTAssertTrue(known.waitForExistence(timeout: 15), app.debugDescription); known.tap()
        let field = web.textViews.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10), app.debugDescription)
        field.tap()
        let intro=app.buttons.matching(NSPredicate(format:"label == 'Continue'")).allElementsBoundByIndex.first { $0.isHittable && $0.frame.minY > app.frame.height * 0.7 }
        if let intro { intro.tap() }
        field.typeText(question)
        let send = web.buttons.matching(NSPredicate(format: "label == 'Enviar pregunta' OR label == 'Frage senden' OR label == 'Send question'")).firstMatch
        XCTAssertTrue(send.waitForExistence(timeout: 10), app.debugDescription)
        send.tap()
    }
    private func exercise(_ language: String, live: Bool = false) {
        let suffix = live ? "-live" : ""
        let spanish = language == "es"
        let question = spanish ? "¿Qué significa invertir?" : "Was bedeutet investieren?"
        let followUp = spanish ? "¿Cómo funciona una acción?" : "Wie funktioniert eine Aktie?"
        let close = spanish ? "Volver a Bobby" : "Zurück zu Bobby"
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
        ask(app, question)
        let when = app.webViews.firstMatch.buttons[spanish ? "En menos de 2 años" : "In weniger als 2 Jahren"]
        XCTAssertTrue(when.waitForExistence(timeout: 10), app.debugDescription)
        shot(app, "build69-\(language)-tier2-when\(suffix)")
        when.tap()
        ask(app, question)
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
        XCTAssertTrue(app.staticTexts["companion-note-interest"].waitForNonExistence(timeout: 10))
        shot(app, "build69-\(language)-tier2-deleted\(suffix)")
        let toggle = app.switches["companion-memory-toggle"]
        reach(toggle, app, up: false)
        toggle.tap()
        XCTAssertTrue(app.buttons["companion-delete-confirm"].waitForExistence(timeout: 10)); app.buttons["companion-delete-confirm"].tap()
        XCTAssertTrue(app.staticTexts["companion-note-when"].waitForNonExistence(timeout: 10))
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
