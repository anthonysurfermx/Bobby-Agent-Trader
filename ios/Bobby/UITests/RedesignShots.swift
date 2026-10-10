import XCTest

/// The shipping build-69 scenes, driven exclusively through the offline fixture transport.
/// Language is injected into the test runner by redesign-shots.sh, never by a live service.
final class RedesignShots: XCTestCase {
    private var app: XCUIApplication!
    private var language: String { ProcessInfo.processInfo.environment["REDESIGN_LANGUAGE"] ?? "es" }
    private lazy var labels: [String: Any] = {
        let url = Bundle(for: Self.self).url(forResource: "RedesignLabels", withExtension: "json")!
        let root = try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: [String: Any]]
        return root[language]!
    }()
    private func word(_ group: String, _ key: String) -> String { (labels[group] as! [String: String])[key]! }
    private var question: String {
        ["en": "What does investing mean?", "es": "¿Qué significa invertir?", "fr": "Que signifie investir ?",
         "pt": "O que significa investir?", "it": "Che cosa significa investire?", "de": "Was bedeutet investieren?"][language]!
    }

    override func setUp() { continueAfterFailure = false }
    override func tearDown() { app?.terminate(); super.tearDown() }

    private func launch(_ scenario: String = "companion-plain", firstRun: Bool = false, notes: Bool = false) {
        app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", firstRun ? "onboarding" : "app",
            "-qa-companion", "-AppleLanguages", "(\(language))", "-app.language", language,
            "-AppleLocale", ["en":"en_US", "es":"es_MX", "fr":"fr_FR", "pt":"pt_PT", "it":"it_IT", "de":"de_DE"][language]!,
            "-agent.riskNoticeVersion", firstRun ? "0" : "6", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        if firstRun { app.launchArguments += ["-nucleo-reset-onboarding"] }
        else { app.launchArguments += ["-companion.id", "momo", "-companion.selected.v2.local", "momo"] }
        if notes { app.launchArguments += ["-qa-redesign-notes"] }
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
    }

    private func ready(_ element: XCUIElement, timeout: TimeInterval = 20) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), app.debugDescription)
        let expectation = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [expectation], timeout: timeout), .completed, element.debugDescription)
    }
    private func scrollTo(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 20))
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.exists)
        for _ in 0..<7 {
            if element.isHittable { break }
            scroll.swipeUp()
        }
        ready(element)
    }
    private func type(_ text: String? = nil) {
        let web = app.webViews.firstMatch
        ready(pill); pill.tap()
        ready(web.textViews.firstMatch)
        web.textViews.firstMatch.tap()
        // Fresh simulator keyboards can cover the keys with Apple's QuickPath introduction.
        let intro = app.buttons.matching(NSPredicate(format: "label IN %@", ["Continue", "Continuar", "Weiter", "Continuer", "Continua"])).firstMatch
        if intro.waitForExistence(timeout: 2) {
            intro.tap()
            XCTAssertTrue(intro.waitForNonExistence(timeout: 5))
        }
        web.textViews.firstMatch.typeText(text ?? question)
    }
    private func ask() {
        type()
        let send = app.webViews.firstMatch.buttons[word("app", "type.send")]
        ready(send); send.tap()
    }
    private func answered() { ready(app.webViews.firstMatch.buttons[word("companion", "close")]) }
    private var pill: XCUIElement {
        app.webViews.firstMatch.buttons.matching(NSPredicate(format: "label IN %@", [word("app", "aria.pillType"), word("app", "aria.pill")])).firstMatch
    }
    private func shot(_ name: String) {
        // Let the existing motion settle; capture current behavior without freezing the product FSM.
        Thread.sleep(forTimeInterval: 1)
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "redesign-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func test01DailyIdle() {
        launch(); ready(pill)
        shot("01-daily-idle")
    }
    func test02Typing() {
        launch(); type(); ready(app.webViews.firstMatch.buttons[word("app", "type.send")])
        XCTAssertEqual(app.webViews.firstMatch.textViews.firstMatch.value as? String, question)
        shot("02-typing")
    }
    func test03WaitingGeneralQuestion() {
        launch("companion-waiting"); ask()
        ready(app.webViews.firstMatch.buttons[word("app", "aria.pillCancel")])
        XCTAssertFalse(app.webViews.firstMatch.buttons[word("companion", "close")].exists)
        shot("03-waiting-general-question")
    }
    func test04EducationalAnswer() {
        launch(); ask(); answered()
        XCTAssertFalse(app.buttons["companion-consent-yes"].exists)
        shot("04-educational-answer")
    }
    func test05MemoryConsent() {
        launch("companion"); ask(); ready(app.buttons["companion-consent-yes"])
        ready(app.buttons["companion-consent-no"])
        shot("05-memory-consent")
    }
    func test06QuestionFromBobby() {
        launch("companion"); ask(); ready(app.buttons["companion-consent-yes"])
        app.buttons["companion-consent-yes"].tap()
        ready(app.webViews.firstMatch.buttons[labels["crypto"] as! String])
        XCTAssertTrue(app.webViews.firstMatch.staticTexts[labels["interest"] as! String].exists)
        shot("06-question-from-bobby")
    }
    func test07AnswerWithNotes() {
        launch("companion", notes: true); ask(); answered()
        XCTAssertTrue(app.webViews.firstMatch.staticTexts[word("companion", "personalized")].waitForExistence(timeout: 10))
        shot("07-answer-with-notes")
    }
    func test08CompanionFailureRetry() {
        launch("companion-error"); ask()
        ready(app.webViews.firstMatch.buttons[word("companion", "retry")])
        shot("08-companion-failure-retry")
    }
    func test09NotesScreen() {
        launch("companion", notes: true)
        let profile = app.webViews.firstMatch.buttons[word("app", "aria.account").replacingOccurrences(of: "{name}", with: "Momo")]
        ready(profile); profile.tap()
        scrollTo(app.buttons["account-memory"]); app.buttons["account-memory"].tap()
        scrollTo(app.buttons["memory-educational-notes"]); app.buttons["memory-educational-notes"].tap()
        XCTAssertTrue(app.staticTexts["companion-notes-title"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["companion-note-interest"].exists)
        shot("09-notes-screen")
    }
    func test10AmbiguousAssetConfirmation() {
        launch("companion")
        type("Ethereun")
        let field = app.webViews.firstMatch.textViews.firstMatch
        XCTAssertEqual(field.value as? String, "Ethereun")
        app.webViews.firstMatch.buttons[word("app", "type.send")].tap()
        let confirm = app.webViews.firstMatch.buttons.matching(NSPredicate(format: "label CONTAINS 'ETH'")).firstMatch
        ready(confirm)
        shot("10-ambiguous-asset-confirmation")
    }
    private func firstRunReady() {
        launch("default", firstRun: true)
        let chip = app.webViews.firstMatch.buttons[word("onboarding", "chip.look").replacingOccurrences(of: "{sym}", with: "BTC")]
        ready(chip, timeout: 45)
    }
    func test11FirstRunReady() {
        firstRunReady()
        XCTAssertFalse(app.webViews.firstMatch.buttons[word("onboarding", "risk.notice")].isHittable)
        shot("11-first-run-ready")
    }
    func test12FirstRunConsentBeat() {
        firstRunReady()
        app.webViews.firstMatch.buttons[word("onboarding", "chip.look").replacingOccurrences(of: "{sym}", with: "BTC")].tap()
        ready(app.webViews.firstMatch.buttons[word("onboarding", "risk.notice")])
        ready(app.webViews.firstMatch.buttons[word("onboarding", "risk.activate")])
        shot("12-first-run-consent-beat")
    }
}
