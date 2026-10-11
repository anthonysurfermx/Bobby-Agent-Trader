import XCTest

class ConversationFixtureCase: XCTestCase {
    var app: XCUIApplication!
    var language: String { ProcessInfo.processInfo.environment["REDESIGN_LANGUAGE"] ?? "es" }
    lazy var labels: [String: Any] = {
        let url = Bundle(for: Self.self).url(forResource: "RedesignLabels", withExtension: "json")!
        return (try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: [String: Any]])[language]!
    }()
    func word(_ key: String) -> String { (labels["app"] as! [String: String])[key]! }
    func nativeWord(_ key: String) -> String { (labels["native"] as! [String:String])[key]! }
    var confirmRead: XCUIElement { web.buttons[nativeWord("read").replacingOccurrences(of:"{0}",with:"Bitcoin")] }
    var readOffer: XCUIElement { web.buttons.matching(NSPredicate(format:"label CONTAINS %@",nativeWord("read").replacingOccurrences(of:"{0}",with:"Bitcoin"))).firstMatch }
    var confirmLevel: XCUIElement { web.buttons[nativeWord("quick")] }
    var web: XCUIElement { app.webViews.firstMatch }
    func button(_ key: String) -> XCUIElement { web.buttons[word(key)] }
    override func setUp() { continueAfterFailure = false }
    override func tearDown() { app?.terminate(); super.tearDown() }
    func launch(_ scenario: String = "companion-plain", speech: String = "words", voice: Bool = false, permission: String = "granted", notes: Bool = false, voiceFails: Bool = false, level: String = "rapido") {
        app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "app", "-qa-companion", "-qa-speech-fixture", speech, "-qa-speech-permission", permission,
            "-AppleLanguages", "(\(language))", "-app.language", language, "-AppleLocale", ["es":"es_MX", "de":"de_DE", "pt":"pt_PT", "it":"it_IT", "en":"en_US", "fr":"fr_FR"][language]!,
            "-agent.riskNoticeVersion", "6", "-companion.id", "momo", "-companion.selected.v2.local", "momo",
            "-avatar.voiceMuted", voice ? "NO" : "YES", "-nucleo.voiceMuteReset.v1", "YES", "-nucleo.analysisLevel", level]
        if voice { app.launchArguments += ["-qa-voice-fixture", voiceFails ? "failure" : "success"] }
        if notes { app.launchArguments += ["-qa-redesign-notes"] }
        app.launch(); ready(button("aria.type"))
    }
    func ready(_ element: XCUIElement, timeout: Double = 25) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), app.debugDescription)
        let e = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [e], timeout: timeout), .completed, app.debugDescription)
    }
    func type(_ question: String? = nil) {
        ready(button("aria.type")); button("aria.type").tap(); ready(web.textViews.firstMatch)
        if question != nil { web.textViews.firstMatch.tap() }
        let intro = app.buttons.matching(NSPredicate(format:"label == 'Continue'")).allElementsBoundByIndex.first {
            $0.isHittable && $0.frame.minY > app.windows.firstMatch.frame.height * 0.7
        }
        if let intro { intro.tap() }
        if let question { web.textViews.firstMatch.typeText(question) }
    }
    func ask(_ question: String? = nil) { type(question ?? word("ex.1")); ready(button("type.send")); button("type.send").tap() }
    func answered() { ready(button("aria.closeAnswer")); XCTAssertFalse(app.buttons["companion-consent-yes"].exists); XCTAssertFalse(web.buttons["companion-answer"].exists) }
    func shot(_ name: String) {
        Thread.sleep(forTimeInterval: 1)
        let system=XCUIApplication(bundleIdentifier:"com.apple.springboard"),predicate=NSPredicate(format:"label CONTAINS[c] 'Apple Intel'")
        let height=app.windows.firstMatch.frame.height
        let candidates=system.descendants(matching:.any).matching(predicate).allElementsBoundByIndex + app.descendants(matching:.any).matching(predicate).allElementsBoundByIndex
        if let banner=candidates.first(where:{$0.frame.maxY > 0 && $0.frame.maxY < height * 0.4}) {
            let clear=XCTNSPredicateExpectation(predicate:NSPredicate { _,_ in !banner.exists || banner.frame.maxY <= 0 || banner.frame.minY >= height },object:nil)
            XCTAssertEqual(XCTWaiter.wait(for:[clear],timeout:15),.completed)
        }
        let a = XCTAttachment(screenshot: app.screenshot()); a.name = "redesign-" + name; a.lifetime = .keepAlways; add(a)
    }
    func physicalControls(_ controls: [XCUIElement], abovePill: Bool = true) {
        let size=app.windows.firstMatch.frame.size, scale=min(size.width/390,size.height/844)
        for c in controls {
            XCTAssertTrue(c.isHittable, c.debugDescription)
            XCTAssertGreaterThanOrEqual(c.frame.width,43.5,c.debugDescription); XCTAssertGreaterThanOrEqual(c.frame.height,43.5,c.debugDescription)
            if abovePill { XCTAssertLessThanOrEqual(c.frame.maxY,700 * scale + (size.height-844 * scale)/2 + 1,c.debugDescription) }
        }
    }
    func listening() { button("aria.talk").tap(); ready(button("aria.sendSpoken")); Thread.sleep(forTimeInterval: 0.7) }
}

final class WithoutHelpUITests: ConversationFixtureCase {
    func backgroundAndReturn() {
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval:1)
        app.activate()
    }
    func testComposerGrowsToFourLinesThenScrolls() {
        launch(); type("Bitcoin")
        let field=web.textViews.firstMatch, oneLine=field.frame.height
        field.typeText(String(repeating:" Ethereum",count:8))
        XCTAssertGreaterThan(field.frame.height,oneLine+15); shot("64-field-two-complete-lines")
        field.typeText(String(repeating:" NVIDIA Apple",count:8))
        let fourLines=field.frame.height
        field.typeText(String(repeating:" Solana ETF",count:8))
        XCTAssertEqual(field.frame.height,fourLines,accuracy:2)
        XCTAssertTrue((field.value as? String)?.contains("Solana") == true)
        XCTAssertFalse(button("aria.closeAnswer").exists); shot("65-field-four-lines-scroll")
    }
    func testBackgroundKeepsTypedDraft() {
        launch(); type(word("ex.1")); backgroundAndReturn(); ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,word("ex.1"))
        XCTAssertFalse(button("aria.closeAnswer").exists); shot("61-background-typed-draft")
    }
    func testBackgroundKeepsHeardDraftWithoutSending() {
        launch(); listening(); backgroundAndReturn(); ready(button("type.send"))
        XCTAssertTrue(web.staticTexts[word("cap.stopped")].exists)
        XCTAssertFalse(button("aria.closeAnswer").exists); type()
        XCTAssertEqual(web.textViews.firstMatch.value as? String,word("ex.1")); shot("62-background-heard-draft")
    }
    func testBackgroundKeepsFailureRetry() {
        launch("companion-retry"); ask(); ready(button("fail.retry")); backgroundAndReturn(); ready(button("fail.retry"))
        shot("63-background-failure-kept"); button("fail.retry").tap(); answered()
    }
    func testAskByVoice() {
        launch(); listening(); button("aria.sendSpoken").tap(); answered(); shot("21-without-help-voice")
    }
    func testSwitchToTypingKeepsWords() {
        launch(); listening(); type(); XCTAssertEqual(web.textViews.firstMatch.value as? String, word("ex.1")); shot("22-without-help-switch-to-type")
        ready(button("aria.talk")); button("aria.talk").tap(); ready(button("aria.sendSpoken")); Thread.sleep(forTimeInterval: 0.7)
        type(); XCTAssertEqual(web.textViews.firstMatch.value as? String, word("ex.1") + " " + word("ex.1")); shot("23-without-help-appended")
    }
    func testCorrectRecognisedAsset() {
        launch(); ask("Bitcoin"); ready(button("risk.notNow")); XCTAssertTrue(web.staticTexts["Bitcoin (BTC)"].exists)
        type(); XCTAssertEqual(web.textViews.firstMatch.value as? String,"Bitcoin")
        web.textViews.firstMatch.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count:7) + "Ethereum")
        button("type.send").tap(); ready(button("risk.notNow")); XCTAssertTrue(web.staticTexts["Ethereum (ETH)"].exists); shot("24-without-help-correct-asset")
    }
    func testCancelWaitKeepsQuestion() {
        launch("companion-waiting"); ask(); ready(button("aria.cancelQuestion")); button("aria.cancelQuestion").tap(); ready(button("type.send"))
        XCTAssertTrue(web.staticTexts[word("ex.1")].exists); shot("25-without-help-cancel")
        button("type.send").tap(); ready(button("aria.cancelQuestion")); shot("26-without-help-send-again")
    }
    func testRecoverFromFailureOneTap() {
        launch("companion-retry"); ask(); ready(button("fail.retry")); shot("27-without-help-failure")
        button("fail.retry").tap(); answered(); XCTAssertFalse(button("fail.retry").exists); shot("28-without-help-recovered")
    }
    func testReadCostShownBeforeSpending() {
        launch(); ask("Bitcoin"); ready(button("risk.notNow")); XCTAssertTrue(web.staticTexts[language == "de" ? "Nutzt 1 deiner 5 Analysen" : "Usa 1 de tus 5 lecturas"].exists, app.debugDescription)
        XCTAssertFalse(app.staticTexts["nucleo-notch"].exists); shot("29-without-help-cost")
    }
    func testFinishWithoutPersonalQuestions() {
        launch("companion"); ask(); answered(); button("aria.closeAnswer").tap(); ready(button("aria.type")); ask(); answered(); shot("30-without-help-no-personal-questions")
    }
}

final class ConversationShots: ConversationFixtureCase {
    func test01Rest() { launch(); shot("01-rest") }
    func test02Typing() { launch(); type(word("ex.1")); shot("02-typing") }
    func test03Listening() { launch(); listening(); shot("03-listening") }
    func test04HeldSilence() { launch(speech:"silence"); listening(); ready(button("type.send"),timeout:16); shot("04-held-silence") }
    func test05HeldMinute() { launch(speech:"minute"); listening(); ready(button("type.send")); shot("05-held-minute") }
    func test06HeldInterruption() { launch(speech:"interruption"); listening(); ready(button("type.send")); shot("06-held-interruption") }
    func test07HeldRoute() { launch(speech:"route"); listening(); ready(button("type.send")); shot("07-held-route") }
    func test08Preparing() { launch("companion-waiting"); ask(); ready(button("aria.cancelQuestion")); XCTAssertTrue(web.staticTexts[word("status.preparing")].exists); shot("08-preparing") }
    func test19AnswerPhrase() { launch(voice:true); ask(); answered(); ready(button("answer.readAll")); physicalControls([button("answer.readAll")]); shot("19-answer-phrase") }
    func test20ReadAll() { launch(voice:true); ask(); answered(); ready(button("answer.readAll")); button("answer.readAll").tap(); shot("20-read-all") }
    func test09AnswerReading() { launch(); ask(); answered(); shot("09-answer-reading") }
    func test10NoFollowUp() { launch("companion-no-followup"); ask(); answered(); Thread.sleep(forTimeInterval:2); shot("10-no-follow-up") }
    func test11Closing() { launch("companion-closing"); ask(); answered(); Thread.sleep(forTimeInterval:2); shot("11-closing") }
    func test12Failure() { launch("companion-error"); ask(); ready(button("fail.retry")); shot("12-failure") }
    func test13Limit() { launch("companion-limit"); ask(); answered(); XCTAssertFalse(button("fail.retry").exists); shot("13-limit") }
    func test14ExplanationsOff() { launch("companion-off"); ask(); answered(); XCTAssertTrue(web.staticTexts[word("fail.cantExplain")].exists); shot("14-explanations-off") }
    func test15Confirmation() { launch(); ask("Bitcoin"); ready(button("risk.notNow")); physicalControls([confirmRead,button("risk.notNow"),confirmLevel]); shot("15-confirmation") }
    func test16Correcting() { launch("companion-offer"); ask("Ethereun"); ready(button("risk.notNow")); type(); XCTAssertEqual(web.textViews.firstMatch.value as? String,"Ethereun"); shot("16-correcting") }
    func test17LongReading() { launch("companion-long"); ask(); answered(); web.swipeUp(); shot("17-long-reading") }
    func test18ProfileLevel() {
        launch(); web.buttons.matching(NSPredicate(format:"label CONTAINS 'Momo.'")).firstMatch.tap()
        let row = app.buttons["account-analysis-level"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        for _ in 0..<5 where !row.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(row); shot("18-profile-level")
        row.tap(); ready(app.buttons["nucleo.level.rapido"])
    }
    func test31Primer() { launch(permission:"undetermined"); button("aria.talk").tap(); ready(button("perm.cta")); shot("31-microphone-primer"); button("perm.cta").tap(); ready(button("aria.talk")); XCTAssertFalse(button("aria.sendSpoken").exists) }
    func test32Denied() { launch(permission:"denied"); button("aria.talk").tap(); ready(button("aria.type")); XCTAssertFalse(button("aria.sendSpoken").exists); shot("32-microphone-denied") }
    func test33Empty() { launch(speech:"empty"); listening(); ready(button("aria.talk")); XCTAssertTrue(web.staticTexts[word("cap.empty")].exists); shot("33-empty-capture") }
    func test34VoiceStopped() { launch(voice:true); ask(); answered(); ready(button("aria.pillStop")); button("aria.pillStop").tap(); ready(button("aria.talk")); XCTAssertTrue(button("answer.readAll").exists); shot("34-voice-stopped-answer-kept") }
    func test35VoiceFailed() { launch(voice:true,voiceFails:true); ask(); answered(); XCTAssertFalse(button("answer.readAll").exists); shot("35-voice-unavailable-reading") }
    func test36NoGist() { launch("companion-no-gist",voice:true); ask(); answered(); XCTAssertFalse(button("answer.readAll").exists); shot("36-no-gist-reading") }
    func test37WrongGist() { launch("companion-wrong-gist",voice:true); ask(); answered(); XCTAssertFalse(button("answer.readAll").exists); shot("37-nonprefix-gist-reading") }
    func test38Fact() { launch("companion-fact"); ask(); answered(); shot("38-fact-reading") }
    func test39Noted() { launch("companion",notes:true); ask(); answered(); shot("39-notes-mark-reading") }
    func test40ReadOffer() { launch(); ask(language == "es" ? "¿Qué es Bitcoin?" : language == "de" ? "Was ist Bitcoin?" : "What is Bitcoin?"); answered(); ready(readOffer); physicalControls([readOffer]); shot("40-read-offer-counted") }
    func test41LongConfirmation() { launch(); ask("Bitcoin"); ready(button("risk.notNow")); Thread.sleep(forTimeInterval:31); XCTAssertTrue(button("risk.notNow").exists); shot("41-confirmation-no-timeout") }
    func test42LevelSelection() { launch(); ask("Bitcoin"); ready(button("risk.notNow")); confirmLevel.tap(); ready(app.buttons["nucleo.level.rapido"]); shot("42-level-sheet") }
    func test43Paused() { launch("companion-paused"); ask(); answered(); XCTAssertFalse(button("fail.retry").exists); shot("43-paused") }
    func test44Offline() { launch("offline"); ask(); ready(button("fail.retry")); XCTAssertTrue(web.staticTexts[word("fail.offline")].exists); shot("44-offline") }
    func test45LimitToday() { launch("companion-limit-today"); ask(); answered(); shot("45-limit-today") }
    func test46LimitTomorrow() { launch("companion-limit-tomorrow"); ask(); answered(); shot("46-limit-tomorrow") }
    func test47LastRead() { launch("companion-confirm-last"); ask("Bitcoin"); ready(button("risk.notNow")); shot("47-confirm-last-read") }
    func test48UnknownCount() { launch("companion-confirm-unknown"); ask("Bitcoin"); ready(button("risk.notNow")); shot("48-confirm-count-unknown") }
    func test49Guest() { launch("companion-confirm-guest"); ask("Bitcoin"); ready(button("risk.notNow")); shot("49-confirm-guest") }
    func test50Deep() { launch("companion-confirm-deep",level:"profundo"); ask("Bitcoin"); ready(button("risk.notNow")); shot("50-confirm-deep") }
    func test51Max() { launch("companion-confirm-max",level:"maximo"); ask("Bitcoin"); ready(button("risk.notNow")); shot("51-confirm-max") }
    func test52ProDeep() { launch("companion-pro-deep",level:"profundo"); ask("Bitcoin"); ready(button("risk.notNow")); shot("52-confirm-pro-deep") }
    func test53LongName() { launch("companion-confirm-long"); ask("VWRP"); ready(button("risk.notNow")); XCTAssertTrue(web.staticTexts["Vanguard FTSE All-World UCITS ETF (USD) Accumulating (VWRP)"].exists); shot("53-confirm-long-name") }
    func test54LongGist() { launch("companion-gist-long",voice:true); ask(); answered(); shot("54-long-gist") }
    func test55TypingOverAnswer() { launch(); ask(); answered(); type(); shot("55-typing-over-answer") }
    func test56ListeningEmpty() { launch(speech:"empty"); button("aria.talk").tap(); ready(button("aria.sendSpoken")); shot("56-listening-empty") }
    func test57ProQuickWait() { launch("companion-pro"); ask("Bitcoin"); XCTAssertFalse(button("risk.notNow").exists); ready(button("aria.cancelQuestion")); shot("57-pro-quick-read-wait") }

    func test59UnknownProbeRecoversOnRetry() {
        launch("companion-probe-recovery"); ask(); ready(button("fail.retry"))
        XCTAssertTrue(web.staticTexts[word("fail.cantExplain")].exists); shot("59-probe-unknown-retry")
        button("fail.retry").tap(); answered(); shot("60-probe-recovered-answer")
    }
    func test58LevelRepricesWithoutRead() {
        launch(); ask("Bitcoin"); ready(button("risk.notNow")); confirmLevel.tap()
        ready(app.buttons["nucleo.level.profundo"]); app.buttons["nucleo.level.profundo"].tap()
        let sheetOption = app.buttons["nucleo.level.profundo"]
        ready(app.buttons["nucleo-level-close"]); app.buttons["nucleo-level-close"].tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format:"exists == false"), object:sheetOption)
        XCTAssertEqual(XCTWaiter.wait(for:[gone],timeout:10),.completed)
        ready(button("risk.notNow"))
        XCTAssertTrue(web.buttons[nativeWord("deep")].waitForExistence(timeout:10))
        XCTAssertFalse(button("aria.cancelQuestion").exists); shot("58-level-repriced-no-read")
    }

}

// Executed only in the hold build; the tap matrix excludes this class.
final class HoldConversationUITests: ConversationFixtureCase {
    func testShortTapTypesWithoutSending() {
        launch(); ready(button("aria.pill")); button("aria.pill").tap(); ready(web.textViews.firstMatch)
        XCTAssertFalse(button("aria.closeAnswer").exists); shot("51-hold-short-tap-types")
    }
    func testHoldingAndReleasingSendsRecognizedWords() {
        launch(); ready(button("aria.pill")); button("aria.pill").press(forDuration:1.2); answered()
        XCTAssertTrue(web.staticTexts[word("ex.1")].exists); shot("52-hold-release-answer")
    }
}
