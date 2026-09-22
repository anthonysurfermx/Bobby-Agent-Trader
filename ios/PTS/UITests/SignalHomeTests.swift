import XCTest

final class SignalHomeTests: XCTestCase {
    private let app = XCUIApplication()
    private var card: XCUIElement { app.buttons["signal-card-coin-daniel-2026-09-18"] }
    private var astsCard: XCUIElement { app.buttons["signal-card-asts-daniel-2026-09-22"] }

    // ASTS (newest) leads the Opciones carousel; COIN is the second card.
    private func openCOIN() {
        if !card.isHittable, astsCard.exists { astsCard.swipeLeft() }
        XCTAssertTrue(card.waitForHittable(timeout: 3))
        card.tap()
    }

    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launchArguments = ["-AppleLanguages", "(es)", "-AppleLocale", "es_MX"]
    }

    func testHomeEvidenceEmptyCategoriesAndReturn() {
        app.launch()
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        XCTAssertTrue(card.label.contains("sin verificar"))
        XCTAssertTrue(card.label.contains("Fuente original disponible"))
        XCTAssertTrue(card.label.contains("Contrato sin documentar"))
        XCTAssertTrue(card.label.contains("2026"))
        XCTAssertTrue(app.buttons["home-signals"].isSelected)
        XCTAssertTrue(app.buttons["home-copilot"].isHittable)
        XCTAssertGreaterThanOrEqual(app.buttons["home-copilot"].frame.height, 44)
        capture("01-home-options")

        // Stocks holds the two ETF signals; Spot and Scalping stay empty.
        app.buttons["signal-category-stocks"].tap()
        let xly = app.buttons["signal-card-xly-daniel-2026-09-21"]
        XCTAssertTrue(xly.waitForExistence(timeout: 3))
        XCTAssertTrue(xly.label.contains("Contrato documentado"))
        XCTAssertTrue(app.buttons["signal-card-dram-daniel-2026-09-18"].exists)
        XCTAssertFalse(card.exists)
        capture("02-stocks-carousel")
        for category in ["spot", "scalping"] {
            let filter = app.buttons["signal-category-\(category)"]
            XCTAssertTrue(filter.label.contains("0 señales"))
            filter.tap()
            XCTAssertTrue(app.staticTexts["Sin señales registradas"].waitForExistence(timeout: 3))
            XCTAssertFalse(card.exists)
            XCTAssertTrue(filter.wait(for: \.isSelected, toEqual: true, timeout: 3))
            if category == "spot" { capture("02-empty-spot") }
        }

        app.buttons["signal-category-options"].tap()
        openCOIN()
        let back = app.buttons["signal-back"]
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["source-327"].exists)
        XCTAssertTrue(app.buttons["source-929"].exists)
        XCTAssertTrue(app.buttons["source-327"].isHittable)
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 3))
        XCTAssertLessThan(app.webViews.firstMatch.frame.minY, app.frame.height * 0.35)
        XCTAssertFalse(app.staticTexts["Segundo objetivo reportado"].exists)
        capture("03-signal-detail")
        app.buttons["signal-details"].tap()
        XCTAssertTrue(app.staticTexts["Contrato sin documentar"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Segundo objetivo reportado"].exists)
        capture("06-signal-evidence")
        app.buttons["Listo"].tap()
        app.buttons["source-video"].tap()
        XCTAssertTrue(app.buttons["video-moment-327"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["video-moment-929"].exists)
        app.buttons["Listo"].tap()
        back.tap()
        XCTAssertTrue(card.waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["signal-category-options"].isSelected)

        app.buttons["home-copilot"].tap()
        XCTAssertTrue(app.staticTexts["Hablemos de COIN"].waitForExistence(timeout: 5))
        app.buttons["Listo"].tap()
        XCTAssertTrue(app.buttons["signal-signals"].waitForExistence(timeout: 3))
        app.buttons["signal-signals"].tap()
        XCTAssertTrue(card.waitForExistence(timeout: 3))

        openCOIN()
        XCTAssertTrue(back.waitForExistence(timeout: 3))
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.45))
        let finish = app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.45))
        start.press(forDuration: 0.05, thenDragTo: finish)
        XCTAssertTrue(card.waitForExistence(timeout: 3), "Edge-back must restore the Home.")
        XCTAssertTrue(app.buttons["signal-category-options"].isSelected)
    }

    func testAccessibilityTextKeepsAllFiltersAndFullWidthCard() {
        app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"]
        app.launch()
        let options = app.buttons["signal-category-options"]
        XCTAssertTrue(options.waitForExistence(timeout: 10))
        let spot = app.buttons["signal-category-spot"]
        XCTAssertGreaterThan(spot.frame.minY, options.frame.minY)
        for category in ["options", "stocks", "spot", "scalping"] {
            let filter = app.buttons["signal-category-\(category)"]
            XCTAssertTrue(filter.isHittable)
            XCTAssertGreaterThanOrEqual(filter.frame.height, 44)
            XCTAssertLessThanOrEqual(filter.frame.maxX, app.frame.maxX)
        }
        capture("04-accessibility-home")
        XCTAssertTrue(app.buttons["home-signals"].isHittable)
        XCTAssertTrue(app.buttons["home-copilot"].isHittable)
        XCTAssertLessThanOrEqual(app.buttons["home-copilot"].frame.maxX, app.frame.maxX)
        XCTAssertTrue(card.exists)
        XCTAssertLessThanOrEqual(card.frame.maxX, app.frame.maxX)
        app.swipeUp()
        capture("05-accessibility-card")
        XCTAssertTrue(card.label.contains("sin verificar"))
    }

    func testLiveGreetsAnswersRejectsOtherTopicsAndExpires() {
        app.launchArguments += ["-PTSVoiceUITest"]
        app.launch()
        XCTAssertTrue(card.waitForExistence(timeout: 10))
        openCOIN()
        app.buttons["signal-learn"].tap()
        let answers = app.staticTexts.matching(identifier: "live-answer")
        let greeting = answers.matching(NSPredicate(format: "label CONTAINS[c] %@", "Hola")).firstMatch
        XCTAssertTrue(greeting.waitForExistence(timeout: 35), app.debugDescription)
        XCTAssertTrue(greeting.label.contains("COIN"))
        XCTAssertTrue(app.staticTexts["live-countdown"].exists)
        capture("07-live-greeting")

        app.buttons["¿Qué crees que pase con COIN?"].tap()
        let scenario = answers.matching(NSPredicate(format: "label CONTAINS[c] %@", "rango")).firstMatch
        XCTAssertTrue(scenario.waitForExistence(timeout: 40), app.debugDescription)
        capture("08-live-scenario")

        app.swipeUp()
        let input = app.descendants(matching: .any).matching(identifier: "ai-question").firstMatch
        XCTAssertTrue(input.waitForExistence(timeout: 5))
        input.tap()
        // Fresh simulators show the bilingual-keyboard introduction once.
        if app.buttons["Continue"].waitForExistence(timeout: 1) { app.buttons["Continue"].tap() }
        input.typeText("Hablemos de mi pareja y mi vida personal")
        app.buttons["ai-send"].tap()
        let redirect = answers.matching(NSPredicate(format: "label CONTAINS[c] %@", "solo hablamos de COIN")).firstMatch
        XCTAssertTrue(redirect.waitForExistence(timeout: 25), app.debugDescription)
        capture("09-live-redirect")

        // Exercise the actual three-minute cutoff, including socket/audio cleanup.
        let ended = app.staticTexts["Terminó tu sesión de 3 minutos"]
        XCTAssertTrue(ended.waitForExistence(timeout: 185), app.debugDescription)
        XCTAssertFalse(app.buttons["ai-send"].exists)
        XCTAssertFalse(app.staticTexts["live-countdown"].exists)
        capture("10-live-expired")
    }

    func testDeviceRendersSpeechThroughRealtimeAudioGraph() {
        app.launchArguments += ["-PTSLocalAudioQA"]
        app.launch()
        XCTAssertTrue(app.buttons["home-copilot"].waitForExistence(timeout: 10))
        app.buttons["home-copilot"].tap()
        let orbit = app.staticTexts["live-status"]
        XCTAssertTrue(orbit.waitForExistence(timeout: 10))
        let rendered = NSPredicate { _, _ in
            guard let value = orbit.value as? String,
                  let part = value.components(separatedBy: " ").first(where: { $0.hasPrefix("rendered=") }),
                  let frames = Int(part.replacingOccurrences(of: "rendered=", with: "")) else { return false }
            return frames >= 24_000
        }
        let audible = XCTNSPredicateExpectation(predicate: rendered, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [audible], timeout: 15), .completed, String(describing: orbit.value))
        capture("11-device-audio-output")
        app.buttons["Listo"].tap()
    }

    // XLY and DRAM open their own detail, chart levels and scoped Copiloto.
    func testETFSignalsOpenTheirOwnCopilot() {
        app.launchArguments += ["-PTSVoiceUITest"]
        app.launch()
        let cases = [("options", "asts-daniel-2026-09-22", "ASTS", "level-65", "Entrada 65.00"), ("stocks", "xly-daniel-2026-09-21", "XLY", "level-112", "Entrada 112.99"), ("stocks", "dram-daniel-2026-09-18", "DRAM", "level-59", "59.02")]
        for (category, id, symbol, level, chip) in cases {
            XCTAssertTrue(app.buttons["signal-category-\(category)"].waitForExistence(timeout: 10))
            app.buttons["signal-category-\(category)"].tap()
            let signalCard = app.buttons["signal-card-\(id)"]
            XCTAssertTrue(signalCard.waitForExistence(timeout: 5))
            if !signalCard.isHittable { app.swipeLeft() }
            signalCard.tap()
            XCTAssertTrue(app.buttons["signal-back"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.buttons[level].label.contains(chip), app.buttons[level].label)
            XCTAssertTrue(app.buttons["source-post"].exists)
            XCTAssertFalse(app.buttons["voice-play"].exists, "Only COIN has reviewed narration")
            XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 3))
            capture("12-\(symbol.lowercased())-detail")
            app.buttons["signal-details"].tap()
            XCTAssertTrue(app.staticTexts["Fuente original"].waitForExistence(timeout: 3))
            capture("13-\(symbol.lowercased())-details")
            app.buttons["Listo"].tap()

            app.buttons["signal-learn"].tap()
            XCTAssertTrue(app.staticTexts["Hablemos de \(symbol)"].waitForExistence(timeout: 5))
            let answers = app.staticTexts.matching(identifier: "live-answer")
            let greeting = answers.matching(NSPredicate(format: "label CONTAINS[c] %@", "Hola")).firstMatch
            XCTAssertTrue(greeting.waitForExistence(timeout: 35), app.debugDescription)
            XCTAssertTrue(greeting.label.contains(symbol))
            app.buttons["¿Qué crees que pase con \(symbol)?"].tap()
            let answer = answers.element(boundBy: 1)
            XCTAssertTrue(answer.waitForExistence(timeout: 40), app.debugDescription)
            XCTAssertFalse(answer.label.contains("Aquí solo hablamos"), answer.label)
            capture("14-\(symbol.lowercased())-copilot")
            app.buttons["live-end"].tap()
            app.buttons["Listo"].tap()
            app.buttons["signal-back"].tap()
        }
    }

    // Real shared backend: like with a name, comment, delete, save. The test
    // removes everything it wrote so the demo data stays clean.
    func testCommunityLikesCommentsAndSaves() {
        app.launch()
        XCTAssertTrue(astsCard.waitForExistence(timeout: 10))
        astsCard.tap()
        XCTAssertTrue(app.buttons["signal-back"].waitForExistence(timeout: 5))
        let like = app.buttons["community-like"]
        XCTAssertTrue(like.waitForExistence(timeout: 10))
        reveal(like)
        let likedBy = app.descendants(matching: .any).matching(identifier: "community-liked-by").firstMatch
        XCTAssertTrue(likedBy.waitForExistence(timeout: 10))
        if likedBy.label.contains("QA PTS") { like.tap() }    // leftover from an aborted run

        like.tap()
        if app.alerts.firstMatch.waitForExistence(timeout: 2) {
            app.alerts.textFields.firstMatch.typeText("QA PTS")
            app.alerts.buttons["Continuar"].tap()
        }
        let byMe = NSPredicate(format: "label CONTAINS %@", "QA PTS")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: byMe, object: likedBy)], timeout: 10), .completed, likedBy.label)
        capture("15-community-liked")

        let draft = app.textFields["community-draft"]
        reveal(draft)
        draft.tap()
        draft.typeText("Prueba automática PTS")
        app.buttons["community-send"].tap()
        let comment = app.descendants(matching: .any).matching(identifier: "community-comment").matching(NSPredicate(format: "label CONTAINS %@", "Prueba automática PTS")).firstMatch
        XCTAssertTrue(comment.waitForExistence(timeout: 10))
        capture("16-community-comment")
        app.buttons["community-delete"].firstMatch.tap()
        XCTAssertTrue(comment.waitForNonExistence(timeout: 10))

        let save = app.buttons["community-save"]
        app.swipeDown()
        reveal(save)
        save.tap()
        XCTAssertTrue(save.label.contains("Guardada"))
        reveal(like)
        like.tap()   // remove the test like
        let notByMe = NSPredicate(format: "NOT (label CONTAINS %@)", "QA PTS")
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: notByMe, object: likedBy)], timeout: 10), .completed, likedBy.label)

        app.buttons["signal-back"].tap()
        app.buttons["home-saved"].tap()
        XCTAssertTrue(astsCard.waitForExistence(timeout: 3))
        XCTAssertFalse(card.exists)
        capture("17-saved")
        astsCard.tap()
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        reveal(save)
        save.tap()   // unsave to leave the device clean
        XCTAssertTrue(save.label.contains("Guardar"))
    }

    // Live prices reach the cards and the detail follow-up; when Live voice
    // fails, the pre-rendered backup voice greets and answers instead.
    func testLiveMarketAndBackupVoice() {
        app.launchArguments += ["-PTSForceLiveFailure"]
        app.launch()
        XCTAssertTrue(astsCard.waitForExistence(timeout: 10))
        let tracking = app.descendants(matching: .any).matching(identifier: "signal-tracking").firstMatch
        XCTAssertTrue(tracking.waitForExistence(timeout: 20), "Live market data never reached the Home cards")
        capture("18-live-home")
        astsCard.tap()
        let followUp = app.descendants(matching: .any).matching(identifier: "signal-live-tracking").firstMatch
        XCTAssertTrue(followUp.waitForExistence(timeout: 10))
        reveal(followUp)
        capture("19-live-tracking")

        app.buttons["signal-learn"].tap()
        let answers = app.staticTexts.matching(identifier: "live-answer")
        let greeting = answers.matching(NSPredicate(format: "label CONTAINS %@", "Hola, ¿qué quieres saber sobre ASTS")).firstMatch
        XCTAssertTrue(greeting.waitForExistence(timeout: 10), app.debugDescription)
        XCTAssertFalse(app.staticTexts["live-error-detail"].exists, "Backup mode must not surface the Live error")
        app.buttons["¿Qué crees que pase con ASTS?"].tap()
        let answer = answers.matching(NSPredicate(format: "label CONTAINS %@", "73")).firstMatch
        XCTAssertTrue(answer.waitForExistence(timeout: 5), app.debugDescription)
        capture("20-backup-voice")
    }

    // The floating navigation bar covers the bottom of the scroll view; keep
    // targets above it so a tap never lands on "Señales".
    private func reveal(_ element: XCUIElement) {
        let bar = app.buttons["signal-signals"]
        for _ in 0..<6 {
            let limit = bar.exists ? bar.frame.minY - 16 : app.frame.maxY - 140
            if element.isHittable, element.frame.maxY < limit, element.frame.minY > 100 { return }
            if element.frame.maxY >= limit || !element.isHittable { app.swipeUp() } else { app.swipeDown() }
        }
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private extension XCUIElement {
    func waitForHittable(timeout: TimeInterval) -> Bool {
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == true AND hittable == true"), object: self)
        return XCTWaiter.wait(for: [expectation], timeout: timeout) == .completed
    }
}
