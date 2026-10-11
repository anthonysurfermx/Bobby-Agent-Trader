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
    func launch(_ scenario: String = "companion-plain", speech: String = "words", voice: Bool = false, permission: String = "granted", notes: Bool = false, voiceFails: Bool = false, level: String = "rapido", home: String = "fresh") {
        app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "app", "-qa-companion", "-qa-speech-fixture", speech, "-qa-speech-permission", permission,
            "-AppleLanguages", "(\(language))", "-app.language", language, "-AppleLocale", ["es":"es_MX", "de":"de_DE", "pt":"pt_PT", "it":"it_IT", "en":"en_US", "fr":"fr_FR"][language]!,
            "-agent.riskNoticeVersion", "6", "-companion.id", "momo", "-companion.selected.v2.local", "momo",
            "-avatar.voiceMuted", voice ? "NO" : "YES", "-nucleo.voiceMuteReset.v1", "YES", "-nucleo.analysisLevel", level]
        if home == "fresh" { app.launchArguments += ["-qa-home-fresh"] }
        if home == "reads" { app.launchArguments += ["-qa-home-reads"] }
        if home == "wall" { app.launchArguments += ["-qa-home-wall"] }
        if home == "nudge" { app.launchArguments += ["-qa-home-nudge"] }
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
    func shot(_ name: String, delay: Double = 1) {
        Thread.sleep(forTimeInterval: delay)
        let system=XCUIApplication(bundleIdentifier:"com.apple.springboard"),predicate=NSPredicate(format:"label CONTAINS[c] 'Apple Intel'")
        let height=app.windows.firstMatch.frame.height
        let candidates=system.descendants(matching:.any).matching(predicate).allElementsBoundByIndex + app.descendants(matching:.any).matching(predicate).allElementsBoundByIndex
        if let banner=candidates.first(where:{$0.frame.maxY > 0 && $0.frame.maxY < height * 0.4}) {
            let clear=XCTNSPredicateExpectation(predicate:NSPredicate { _,_ in !banner.exists || banner.frame.maxY <= 0 || banner.frame.minY >= height },object:nil)
            XCTAssertEqual(XCTWaiter.wait(for:[clear],timeout:15),.completed)
        }
        if let intro=app.buttons.matching(NSPredicate(format:"label == 'Continue'")).allElementsBoundByIndex.first(where:{$0.isHittable && $0.frame.minY > height * 0.7}) { intro.tap() }
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
    func backgroundAndReturn() {
        XCUIDevice.shared.press(.home)
        Thread.sleep(forTimeInterval:1)
        app.activate()
    }
    func listening() { button("aria.talk").tap(); ready(button("aria.sendSpoken")); Thread.sleep(forTimeInterval: 0.7) }
}

final class WithoutHelpUITests: ConversationFixtureCase {
    func testOutsideTapClosesKeyboardWithoutSendingOrLosingDraft() {
        launch(); let question = word("ex.1"); type(question)
        let field = web.textViews.firstMatch
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        shot("66-keyboard-editing")
        web.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)).tap()
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 5), .completed)
        XCTAssertEqual(field.value as? String, question)
        XCTAssertFalse(button("aria.closeAnswer").exists)
        shot("67-keyboard-outside-draft-kept")
        field.tap(); XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout:5))
        XCTAssertEqual(field.value as? String,question);shot("68-keyboard-reopened-draft")
        ready(button("type.send")); button("type.send").tap(); answered()
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
    func checkHomeExamples() {
        let size=app.windows.firstMatch.frame.size,scale=min(size.width/390,size.height/844),offset=(size.width-390*scale)/2
        let examples=web.buttons.allElementsBoundByIndex.filter { $0.isHittable && $0.frame.minY >= 630*scale && $0.frame.maxY < 710*scale }
        XCTAssertGreaterThan(examples.count,0);XCTAssertLessThanOrEqual(examples.count,3)
        physicalControls(examples)
        for c in examples { XCTAssertGreaterThanOrEqual(c.frame.minX,offset+19*scale);XCTAssertLessThanOrEqual(c.frame.maxX,offset+371*scale) }
    }
    func test86HomeNoReadsWholeExamples() {launch();checkHomeExamples();shot("86-home-no-reads-whole-examples")}
    func test87HomeReadsWholeExamples() {launch(home:"reads");checkHomeExamples();shot("87-home-with-reads-whole-examples")}
    func test88HomeNudgeWholeExamples() {launch(home:"nudge");checkHomeExamples();XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",nativeWord("ready"))).firstMatch.exists);shot("88-home-nudge-whole-examples")}
    func test99HomeExplanationsOff() {launch("companion-off");Thread.sleep(forTimeInterval:1);XCTAssertFalse(button("ex.1").isHittable);shot("99-home-explanations-off")}
    func test89HomeWallEducationStays() {
        launch(home:"wall");checkHomeExamples();XCTAssertTrue(button("ex.1").isHittable)
        let size=app.windows.firstMatch.frame.size,k=min(size.width/390,size.height/844)
        let row=web.buttons.allElementsBoundByIndex.filter { $0.isHittable && $0.frame.minY >= 630*k && $0.frame.maxY < 710*k }
        XCTAssertEqual(row.count,1,"At a known wall only education stays")
        shot("89-home-wall-examples")
    }
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
    func test53LongName() { launch("companion-confirm-long"); ask("VWRP"); ready(button("risk.notNow")); XCTAssertTrue(web.staticTexts["Vanguard Ftse All-world Ucits Etf (usd) Accumulating (VWRP)"].exists); shot("53-confirm-long-name") }
    func test54LongGist() { launch("companion-gist-long",voice:true); ask(); answered(); shot("54-long-gist") }
    func test55TypingOverAnswer() { launch(); ask(); answered(); type(); if app.windows.firstMatch.frame.width <= 375 { XCTAssertGreaterThanOrEqual(web.textViews.firstMatch.frame.height,43.5) }; shot("55-typing-over-answer") }
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

/// Six review captures for SPEC4.7.6. Does not exercise unapproved new consent actions.
final class ConsentPreviewShots: ConversationFixtureCase {
    func testConsentComposition() {
        app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", "default", "-nucleo-page", "onboarding", "-nucleo-reset-onboarding",
            "-qa-consent-preview", "-agent.riskNoticeVersion", "0",
            "-AppleLanguages", "(\(language))", "-app.language", language,
            "-AppleLocale", ["es":"es_MX", "de":"de_DE", "it":"it_IT"][language]!,
            "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]
        app.launch()
        let words = labels["onboarding"] as! [String:String]
        let laterQuery = web.buttons.matching(NSPredicate(format:"label == %@", words["risk.notNow"]!))
        XCTAssertTrue(laterQuery.firstMatch.waitForExistence(timeout:25))
        let later = laterQuery.allElementsBoundByIndex.last!, agree = web.buttons[words["risk.activate"]!]
        shot("70-consent-composition-preview")
        ready(later); ready(agree); physicalControls([later, agree], abovePill: false)
        ready(web.buttons[words["risk.notice"]!]); ready(web.buttons[words["risk.profile"]!])
    }
}

class FirstRunFixtureCase: ConversationFixtureCase {
    var firstWords: [String:String] { labels["onboarding"] as! [String:String] }
    func fresh(_ scenario: String = "companion-plain", speech: String = "words", stale: Bool = false, wait: Bool = true, permission: String = "granted") {
        app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "onboarding", "-nucleo-reset-onboarding", "-qa-speech-fixture", speech, "-qa-speech-permission", permission,
            "-agent.riskNoticeVersion", "0", "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES",
            "-AppleLanguages", "(\(language))", "-app.language", language,
            "-AppleLocale", ["es":"es_MX","de":"de_DE","en":"en_US","pt":"pt_PT"][language]!]
        if stale { app.launchArguments += ["-qa-stale-consent", "-companion.id", "momo", "-companion.selected.v2.local", "momo", "-agent.riskNoticeVersion", "5"] }
        app.launch(); if !stale && wait { ready(web.buttons[firstWords["aria.type"]!],timeout:10) }
    }
}

final class FirstRunShots: FirstRunFixtureCase {
    func testIntroCaptionNaturalFrames() {
        fresh(wait:false)
        for i in 0..<8 {
            let a=XCTAttachment(screenshot:app.screenshot());a.name="redesign-\(90+i)-natural-intro-frame";a.lifetime = .keepAlways;add(a)
            Thread.sleep(forTimeInterval:0.3)
        }
        ready(web.buttons[firstWords["aria.type"]!]);shot("98-intro-folded-ready")
    }
    func testReadyControlsAndWholeExamples() {
        fresh()
        let keyboard=web.buttons[firstWords["aria.type"]!], example=web.buttons[firstWords["ex.1"]!]
        ready(example); physicalControls([keyboard], abovePill:false); physicalControls([example])
        ready(web.buttons[firstWords["risk.profile"]!]); shot("71-first-run-ready-caption")
        Thread.sleep(forTimeInterval:3); ready(keyboard); shot("72-first-run-ready-title")
        example.tap(); ready(web.buttons[firstWords["risk.activate"]!]); shot("73-first-run-educational-consent")
    }
    func testEducationalFirstQuestionHandsOverToDailyAnswer() {
        fresh(); let example=web.buttons[firstWords["ex.1"]!]
        ready(example); example.tap(); let agree=web.buttons[firstWords["risk.activate"]!]
        ready(agree); agree.press(forDuration:1.8)
        answered(); XCTAssertFalse(web.buttons[firstWords["risk.notice"]!].isHittable)
        XCTAssertFalse(web.buttons[firstWords["chip.again"]!].isHittable)
        shot("74-first-run-educational-daily-answer")
    }

    func testConsentNotNowKeepsDraftAndTapNeverAccepts() {
        fresh(); ready(web.buttons[firstWords["ex.1"]!]); web.buttons[firstWords["ex.1"]!].tap()
        let agree=web.buttons[firstWords["risk.activate"]!],later=web.buttons[firstWords["risk.notNow"]!]
        ready(later); physicalControls([later,agree],abovePill:false); shot("76-consent-with-not-now")
        agree.tap(); XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["risk.holdHint"]!)).firstMatch.exists)
        XCTAssertTrue(later.isHittable); shot("77-consent-short-tap-hint",delay:0)
        later.tap(); ready(web.buttons[firstWords["type.send"]!])
        XCTAssertTrue(web.staticTexts[firstWords["ex.1"]!].exists)
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["risk.kept"]!)).firstMatch.exists); shot("78-declined-held-draft")
        web.buttons[firstWords["type.send"]!].tap(); ready(later)
        XCTAssertFalse(button("aria.closeAnswer").exists)
    }
    func testReconsentNotNowIsReadyWithoutQuestion() {
        fresh(stale:true); let later=web.buttons[firstWords["risk.notNow"]!]
        ready(later); shot("79-reconsent-beat"); later.tap()
        ready(web.buttons[firstWords["aria.type"]!]); ready(web.buttons[firstWords["risk.profile"]!])
        shot("80-reconsent-ready")
        let text=web.staticTexts.allElementsBoundByIndex.map { $0.label }.joined(separator:" ").components(separatedBy:.whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator:" ")
        XCTAssertTrue(text.contains(firstWords["risk.later"]!),text)
    }
    func testFirstRunListeningKeyboardKeepsHeardWords() {
        fresh(); let talk=web.buttons[firstWords["aria.talk"]!],keyboard=web.buttons[firstWords["aria.type"]!]
        ready(talk); talk.tap(); ready(web.buttons[firstWords["aria.sendSpoken"]!]); Thread.sleep(forTimeInterval:0.8)
        keyboard.tap(); ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,firstWords["ex.1"]!)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable); shot("81-first-run-heard-in-keyboard")
    }
    func testFirstRunBackgroundKeepsHeardDraft() {
        fresh(); ready(web.buttons[firstWords["aria.talk"]!]);web.buttons[firstWords["aria.talk"]!].tap()
        ready(web.buttons[firstWords["aria.sendSpoken"]!]);Thread.sleep(forTimeInterval:0.8);backgroundAndReturn()
        ready(web.buttons[firstWords["type.send"]!]);XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["cap.stopped"]!)).firstMatch.exists)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("82-first-run-background-held")
    }
    func testFirstRunHoldAppendsToHeldDraft() {
        fresh();let q=firstWords["ex.1"]!;web.buttons[q].tap();ready(web.buttons[firstWords["risk.notNow"]!])
        web.buttons[firstWords["risk.notNow"]!].tap();ready(web.buttons[firstWords["type.send"]!])
        web.buttons[firstWords["type.send"]!].press(forDuration:1.8)
        ready(web.buttons[firstWords["risk.notNow"]!]);web.buttons[firstWords["risk.notNow"]!].tap()
        ready(web.buttons[firstWords["aria.type"]!]);web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,q+" "+q)
        XCTAssertGreaterThanOrEqual(web.textViews.firstMatch.frame.height,app.windows.firstMatch.frame.width <= 375 ? 43.5 : 21.5)
        physicalControls([web.buttons[firstWords["type.send"]!]],abovePill:false)
        XCTAssertFalse(button("aria.closeAnswer").exists);shot("99-first-run-held-appended-words")
    }
    func testFirstRunOutsideKeyboardKeepsTypedDraft() {
        fresh();web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        web.textViews.firstMatch.typeText(firstWords["ex.1"]!)
        web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.3)).tap()
        ready(web.buttons[firstWords["type.send"]!]);XCTAssertTrue(web.staticTexts[firstWords["ex.1"]!].exists)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("99-first-run-outside-keyboard-held")
    }
    func testFirstRunAutomaticStopsNeverSend() {
        for (speech,caption) in [("minute","cap.minute"),("interruption","cap.stopped"),("silence","cap.stopped")] {
            fresh(speech:speech);ready(web.buttons[firstWords["aria.talk"]!]);web.buttons[firstWords["aria.talk"]!].tap()
            ready(web.buttons[firstWords["aria.sendSpoken"]!])
            XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords[caption]!)).firstMatch.waitForExistence(timeout:16))
            XCTAssertTrue(web.staticTexts[firstWords["ex.1"]!].exists)
            XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable)
            shot("99-first-run-held-\(speech)")
        }
        fresh(speech:"empty");ready(web.buttons[firstWords["aria.talk"]!]);web.buttons[firstWords["aria.talk"]!].tap()
        ready(web.buttons[firstWords["aria.sendSpoken"]!]);ready(web.buttons[firstWords["aria.talk"]!],timeout:16)
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["cap.empty"]!)).firstMatch.exists)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("99-first-run-empty-capture")
    }
    func testFirstRunKeyboardCancelsPermissionPrimer() {
        fresh(permission:"undetermined");web.buttons[firstWords["aria.talk"]!].tap();ready(web.buttons[firstWords["perm.go"]!])
        web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        web.textViews.firstMatch.typeText(firstWords["ex.1"]!)
        XCTAssertFalse(web.buttons[firstWords["aria.sendSpoken"]!].isHittable)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("99-first-run-permission-to-keyboard")
    }
    func testFirstRunBackgroundKeepsTypedDraft() {
        fresh();web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        web.textViews.firstMatch.typeText(firstWords["ex.1"]!);backgroundAndReturn();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,firstWords["ex.1"]!)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("99-first-run-typed-background")
    }
    func testHandoverPreparingThenFirstAnswerRecording() {
        fresh("companion-waiting"); ready(web.buttons[firstWords["ex.1"]!]);web.buttons[firstWords["ex.1"]!].tap()
        let agree=web.buttons[firstWords["risk.activate"]!];ready(agree);shot("83-handover-before-hold")
        agree.press(forDuration:1.3)
        XCTAssertTrue(web.staticTexts[word("status.preparing")].waitForExistence(timeout:1))
        // Rendering latency is measured in the recording, not XCTest query overhead.
        // Native also logs fixture handover→ask seconds without logging the question.
        XCTAssertTrue(web.staticTexts[firstWords["ex.1"]!].exists);shot("84-handover-preparing-no-idle")
        ready(button("aria.closeAnswer"),timeout:45);shot("85-handover-first-daily-answer")
    }

    func testAssetFirstQuestionHandsOverToConfirmation() {
        fresh()
        let asset=web.buttons.matching(NSPredicate(format:"label CONTAINS 'NVIDIA' OR label CONTAINS 'Bitcoin'")).firstMatch
        ready(asset); asset.tap(); let agree=web.buttons[firstWords["risk.activate"]!]
        ready(agree); agree.press(forDuration:1.8)
        ready(button("risk.notNow")); XCTAssertFalse(button("aria.closeAnswer").exists)
        shot("75-first-run-asset-daily-confirmation")
    }
}

final class FirstRunIntroGuarantees: FirstRunFixtureCase {
    func testEarlyExampleKeepsConsentThenHandsOverWithoutReadyTitle() {
        fresh("companion-waiting",wait:false);Thread.sleep(forTimeInterval:1.6)
        let size=app.windows.firstMatch.frame.size,k=min(size.width/390,size.height/844)
        app.coordinate(withNormalizedOffset:.zero).withOffset(CGVector(dx:(size.width-390*k)/2+90*k,dy:(size.height-844*k)/2+668*k)).tap()
        ready(web.buttons[firstWords["risk.activate"]!]);Thread.sleep(forTimeInterval:3)
        shot("99-early-example-consent-no-ready-title")
        let visible=web.staticTexts.allElementsBoundByIndex.filter { $0.isHittable }.map { $0.label }.joined(separator:" ").components(separatedBy:.whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator:" ")
        XCTAssertFalse(visible.contains(firstWords["ask.title"]!),visible)
        web.buttons[firstWords["risk.activate"]!].press(forDuration:1.3)
        XCTAssertTrue(web.staticTexts[word("status.preparing")].waitForExistence(timeout:1));shot("99-early-handover-preparing")
        ready(button("aria.closeAnswer"),timeout:45);shot("99-early-handover-first-answer")
    }
}

final class WholePlaceholderGuarantees: FirstRunFixtureCase {
    func testEmptyDailyAndFirstRunComposerKeepsWholePlaceholderWithoutSending() {
        launch();type();let field=web.textViews.firstMatch
        if app.windows.firstMatch.frame.width <= 375 { XCTAssertGreaterThanOrEqual(field.frame.height,43.5) }
        XCTAssertFalse(button("type.send").isEnabled);shot("99-empty-daily-whole-placeholder")
        fresh();web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        if app.windows.firstMatch.frame.width <= 375 { XCTAssertGreaterThanOrEqual(web.textViews.firstMatch.frame.height,43.5) }
        XCTAssertFalse(web.buttons[firstWords["type.send"]!].isEnabled);shot("99-empty-first-run-whole-placeholder")
    }
}

class FirstRunControlFixtureCase: FirstRunFixtureCase {
    func fieldMicrophone() -> XCUIElement? {
        let top=app.keyboards.firstMatch.frame.minY
        let m=web.buttons.matching(NSPredicate(format:"label == %@",firstWords["aria.talk"]!)).allElementsBoundByIndex.filter { $0.isHittable && $0.frame.maxY <= top }
        XCTAssertEqual(m.count,1,"One microphone in the visible field row");guard let mic=m.first else{return nil}
        physicalControls([mic],abovePill:false);return mic
    }
    func startFieldCapture(speech:String="words") {
        fresh(speech:speech);web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        web.textViews.firstMatch.typeText("Bitcoin");guard let mic=fieldMicrophone() else{return};mic.tap()
        ready(web.buttons[firstWords["aria.type"]!]);Thread.sleep(forTimeInterval:0.8)
    }
    func assertEmptyField() {
        web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        let value=web.textViews.firstMatch.value as? String ?? ""
        XCTAssertTrue(value.isEmpty || value==firstWords["type.placeholder"]!,value)
        XCTAssertFalse(web.buttons[firstWords["type.send"]!].isEnabled)
    }
}
final class FirstRunFieldMicGuarantees: FirstRunControlFixtureCase {
    func testFieldMicrophoneAppendsWithoutSubmittingAndCanReturnToTyping() {
        startFieldCapture();web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,"Bitcoin "+firstWords["ex.1"]!)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable)
        physicalControls([web.buttons[firstWords["type.send"]!]],abovePill:false);shot("99-first-run-field-microphone-appended")
    }
    func testFieldMicrophoneMinuteStopKeepsWholeDraftWithoutSending() {
        startFieldCapture(speech:"minute");ready(web.buttons[firstWords["type.send"]!])
        XCTAssertTrue(web.staticTexts["Bitcoin "+firstWords["ex.1"]!].exists)
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["cap.minute"]!)).firstMatch.exists)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("99-first-run-field-microphone-minute-held")
    }
}
final class FirstRunDiscardGuarantees: FirstRunControlFixtureCase {
    func testHeaderExitDiscardsHeardWordsAndDeclinedDraftWithoutSending() {
        startFieldCapture();let exit=web.buttons[firstWords["aria.discardSpoken"]!];ready(exit);physicalControls([exit],abovePill:false);shot("99-first-run-listening-exit")
        exit.tap();ready(web.buttons[firstWords["aria.type"]!]);assertEmptyField()
        fresh();web.buttons[firstWords["ex.1"]!].tap();ready(web.buttons[firstWords["risk.notNow"]!]);web.buttons[firstWords["risk.notNow"]!].tap()
        ready(exit);shot("99-first-run-held-exit");exit.tap();ready(web.buttons[firstWords["aria.type"]!]);assertEmptyField();shot("99-first-run-discarded-empty-field")
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable)
    }
}

final class FirstRunPrimerGuarantees: FirstRunFixtureCase {
    func testGrantedPrimerReturnsReadyWithoutStartingCapture() {
        fresh(permission:"undetermined");web.buttons[firstWords["aria.talk"]!].tap();ready(web.buttons[firstWords["perm.go"]!]);web.buttons[firstWords["perm.go"]!].tap()
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["cap.tapToTalk"]!)).firstMatch.waitForExistence(timeout:3))
        shot("99-first-run-granted-without-capture",delay:0)
        ready(web.buttons[firstWords["aria.talk"]!]);XCTAssertFalse(web.buttons[firstWords["aria.sendSpoken"]!].isHittable)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable)
    }
}

final class FirstRunHoldFieldGuarantees: FirstRunFixtureCase {
    func testHoldComposerRetainsTypedWordsWithoutFieldMicrophone() {
        fresh();web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        XCTAssertTrue(web.buttons.matching(NSPredicate(format:"label == %@",firstWords["aria.talk"]!)).allElementsBoundByIndex.filter { $0.isHittable }.isEmpty)
        web.textViews.firstMatch.typeText(firstWords["ex.1"]!)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,firstWords["ex.1"]!)
        physicalControls([web.buttons[firstWords["type.send"]!]],abovePill:false);shot("99-hold-first-run-field-no-microphone")
    }
}
