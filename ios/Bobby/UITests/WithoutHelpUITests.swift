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
    var homeEducation: XCUIElement {
        web.buttons.matching(NSPredicate(format: "label IN %@", (1...6).map { word("ex.\($0)") })).firstMatch
    }

    override func setUp() { continueAfterFailure = false }
    override func tearDown() { app?.terminate(); super.tearDown() }
    func launch(_ scenario: String = "companion-plain", speech: String = "words", voice: Bool = false, permission: String = "granted", notes: Bool = false, voiceFails: Bool = false, level: String = "rapido", home: String = "fresh", memory: String? = nil, contentSize: String? = nil, memoryFailure: Bool = false, expiringNotes: Bool = false) {
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
        if let memory { app.launchArguments += ["-qa-memory-fixture",memory] }
        if let contentSize { app.launchArguments += ["-UIPreferredContentSizeCategoryName",contentSize] }
        if memoryFailure { app.launchArguments += ["-qa-memory-save-failure"] }
        if expiringNotes { app.launchArguments += ["-qa-note-expiry"] }
        app.launch(); ready(button("aria.type"))
    }
    func ready(_ element: XCUIElement, timeout: Double = 25) {
        if element.exists && element.elementType != .staticText && element.isHittable { return }
        XCTAssertTrue(element.waitForExistence(timeout:timeout),app.debugDescription)
        // Read-only text has no activation point in WebKit. Its existence establishes
        // the state; reviewed screenshots establish its visible composition.
        if element.elementType == .staticText { return }
        let e = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [e], timeout: timeout), .completed, app.debugDescription)
    }
    func openProfileFromGlass() {
        let avatar=web.buttons.matching(NSPredicate(format:"label BEGINSWITH 'Momo.'")).firstMatch
        ready(avatar)
        // WAKE and RETURNING expose the header before accepting its gesture; the longest
        // return is 1.7 seconds. Drive the settled scene, as the captured reviewer sees it.
        Thread.sleep(forTimeInterval:2)
        avatar.tap();ready(app.buttons["account-close"])
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
    func assertPillGlyphVisible(_ control: XCUIElement) {
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        let factor=CGFloat(image.width)/app.windows.firstMatch.frame.width
        let cx=Int(control.frame.midX*factor),cy=Int(control.frame.midY*factor),radius=Int(10*factor)
        var ink=0
        for y in stride(from:cy-radius,to:cy+radius,by:2) {
            for x in stride(from:cx-radius,to:cx+radius,by:2) {
                let i=y*image.bytesPerRow+x*4
                if min(bytes[i],min(bytes[i+1],bytes[i+2]))>150 { ink += 1 }
            }
        }
        XCTAssertGreaterThan(ink,20,"The pill must display its next-action glyph")
    }
    func assertNoCaptionBeside(_ control: XCUIElement) {
        // The rolling hint is aria-hidden, so its overlap cannot be caught in the AX tree.
        // This otherwise empty band beside the centered next-question control detects it.
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        let factor=CGFloat(image.width)/app.windows.firstMatch.frame.width,frame=control.frame
        let left=Int(max(12,frame.minX-85)*factor),right=Int((frame.minX-6)*factor)
        let top=Int(frame.minY*factor),bottom=Int(frame.maxY*factor)
        XCTAssertGreaterThan(right,left);var ink=0
        for y in stride(from:top,to:bottom,by:2) { for x in stride(from:left,to:right,by:2) {
            let i=y*image.bytesPerRow+x*4
            if min(bytes[i],min(bytes[i+1],bytes[i+2]))>90 { ink += 1 }
        } }
        XCTAssertLessThan(ink,15,"A saved-read caption must not cross the next-question footer")
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
        launch("companion", memory: "remember"); ask(); answered()
        ready(web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",((labels["companion"] as! [String:String])["bobbyAsks"]!).components(separatedBy:"{question}")[0])).firstMatch); shot("30a-due-chip-untouched")
        XCTAssertFalse(app.buttons["companion-consent-yes"].exists); XCTAssertFalse(web.buttons[labels["crypto"] as! String].exists)
        button("aria.closeAnswer").tap(); ready(button("aria.type")); ask(); answered()
        XCTAssertFalse(app.buttons["companion-consent-yes"].exists); shot("30-without-help-no-personal-questions")
    }
}

final class ConversationShots: ConversationFixtureCase {
    func checkHomeExamples() {
        // The keyboard door appears before WAKE finishes emitting the examples.
        // Wait for the actual education control, then inspect the settled row.
        ready(homeEducation)
        let size=app.windows.firstMatch.frame.size,scale=min(size.width/390,size.height/844),offset=(size.width-390*scale)/2
        let examples=web.buttons.allElementsBoundByIndex.filter { $0.isHittable && $0.frame.minY >= 630*scale && $0.frame.maxY < 710*scale }
        XCTAssertGreaterThan(examples.count,0);XCTAssertLessThanOrEqual(examples.count,3)
        physicalControls(examples)
        for c in examples { XCTAssertGreaterThanOrEqual(c.frame.minX,offset+19*scale);XCTAssertLessThanOrEqual(c.frame.maxX,offset+371*scale) }
    }
    func test86HomeNoReadsWholeExamples() {launch();checkHomeExamples();shot("86-home-no-reads-whole-examples")}
    func test87HomeReadsWholeExamples() {launch(home:"reads");checkHomeExamples();shot("87-home-with-reads-whole-examples")}
    func test88HomeNudgeWholeExamples() {launch(home:"nudge");checkHomeExamples();XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",nativeWord("ready"))).firstMatch.exists);shot("88-home-nudge-whole-examples")}
    func test99HomeExplanationsOff() {launch("companion-off");Thread.sleep(forTimeInterval:1);XCTAssertFalse(homeEducation.isHittable);shot("99-home-explanations-off")}
    func test89HomeWallEducationStays() {
        launch(home:"wall");checkHomeExamples();XCTAssertTrue(homeEducation.isHittable)
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
        launch();openProfileFromGlass()
        let row = app.buttons["account-analysis-level"]
        for _ in 0..<7 where !row.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(row); shot("18-profile-level")
        row.tap(); ready(app.buttons["nucleo.level.rapido"])
    }
    func test31Primer() { launch(permission:"undetermined"); button("aria.talk").tap(); ready(button("perm.cta")); shot("31-microphone-primer"); button("perm.cta").tap(); ready(button("aria.talk")); XCTAssertFalse(button("aria.sendSpoken").exists) }
    func test32Denied() { launch(permission:"denied"); button("aria.talk").tap(); ready(app.alerts.buttons.firstMatch); app.alerts.buttons.firstMatch.tap(); ready(button("aria.type")); XCTAssertFalse(button("aria.sendSpoken").exists); shot("32-microphone-denied") }
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
    var firstExample: XCUIElement {
        web.buttons.matching(NSPredicate(format: "label IN %@", (1...6).map { firstWords["ex.\($0)"]! })).firstMatch
    }
    func fresh(_ scenario: String = "companion-plain", speech: String = "words", stale: Bool = false, wait: Bool = true, permission: String = "granted", voice: Bool = false) {
        app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", scenario, "-nucleo-page", "onboarding", "-nucleo-reset-onboarding", "-qa-speech-fixture", speech, "-qa-speech-permission", permission,
            "-agent.riskNoticeVersion", "0", "-avatar.voiceMuted", voice ? "NO" : "YES", "-nucleo.voiceMuteReset.v1", "YES",
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
        let keyboard=web.buttons[firstWords["aria.type"]!], example=firstExample
        ready(example); physicalControls([keyboard], abovePill:false); physicalControls([example])
        ready(web.buttons[firstWords["risk.profile"]!]); shot("71-first-run-ready-caption")
        Thread.sleep(forTimeInterval:3); ready(keyboard); shot("72-first-run-ready-title")
        example.tap(); ready(web.buttons[firstWords["risk.activate"]!]); shot("73-first-run-educational-consent")
    }
    func testEducationalFirstQuestionHandsOverToDailyAnswer() {
        fresh(); let example=firstExample
        ready(example); example.tap(); let agree=web.buttons[firstWords["risk.activate"]!]
        ready(agree); agree.press(forDuration:1.8)
        answered(); XCTAssertFalse(web.buttons[firstWords["risk.notice"]!].isHittable)
        XCTAssertFalse(web.buttons[firstWords["chip.again"]!].isHittable)
        shot("74-first-run-educational-daily-answer")
    }

    func testConsentNotNowKeepsDraftAndTapNeverAccepts() {
        fresh(); let example=firstExample;ready(example);let question=example.label;example.tap()
        let agree=web.buttons[firstWords["risk.activate"]!],later=web.buttons[firstWords["risk.notNow"]!]
        ready(later); physicalControls([later,agree],abovePill:false); shot("76-consent-with-not-now")
        agree.tap(); XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["risk.holdHint"]!)).firstMatch.exists)
        XCTAssertTrue(later.isHittable); shot("77-consent-short-tap-hint",delay:0)
        later.tap(); ready(web.buttons[firstWords["type.send"]!])
        XCTAssertTrue(web.staticTexts[question].exists)
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
        fresh();let example=firstExample;ready(example);let q=example.label;example.tap();ready(web.buttons[firstWords["risk.notNow"]!])
        web.buttons[firstWords["risk.notNow"]!].tap();ready(web.buttons[firstWords["type.send"]!])
        web.buttons[firstWords["type.send"]!].press(forDuration:1.8)
        ready(web.buttons[firstWords["risk.notNow"]!]);web.buttons[firstWords["risk.notNow"]!].tap()
        ready(web.buttons[firstWords["aria.type"]!]);web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,q+" "+firstWords["ex.1"]!)
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
        XCTAssertFalse(web.staticTexts.matching(NSPredicate(format:"label ==[c] %@",firstWords["hint.type"]!)).firstMatch.isHittable)
        XCTAssertFalse(web.buttons[firstWords["risk.notNow"]!].isHittable);shot("99-first-run-typed-background")
    }
    func testHandoverPreparingThenFirstAnswerRecording() {
        fresh("companion-waiting");let example=firstExample;ready(example);let question=example.label;example.tap()
        let agree=web.buttons[firstWords["risk.activate"]!];ready(agree);shot("83-handover-before-hold")
        agree.press(forDuration:1.3)
        XCTAssertTrue(web.staticTexts[word("status.preparing")].waitForExistence(timeout:1))
        // Rendering latency is measured in the recording, not XCTest query overhead.
        XCTAssertTrue(web.staticTexts[question].exists);shot("84-handover-preparing-no-idle")
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
        fresh();ready(firstExample);firstExample.tap();ready(web.buttons[firstWords["risk.notNow"]!]);web.buttons[firstWords["risk.notNow"]!].tap()
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

final class MemoryInvitationShots: ConversationFixtureCase {
    func copy(_ key: String) -> String { (labels["companion"] as! [String:String])[key]! }
    var chip: XCUIElement { web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy("bobbyAsks").components(separatedBy:"{question}")[0])).firstMatch }
    func option(_ id: String, field: String) -> XCUIElement { let question=(labels["catalog"] as! [String:[String:Any]])[field]!;return web.buttons[(question["options"] as! [String:String])[id]!] }
    var noted: XCUIElement { web.buttons.matching(NSPredicate(format:"label CONTAINS %@ OR label BEGINSWITH %@",copy("noted").components(separatedBy:"{label}")[0],copy("understood").components(separatedBy:"{label}")[0])).firstMatch }
    var exitScene: XCUIElement { web.buttons[copy("notNow")] }
    func invite(_ kind: String = "remember", size: String? = nil, failure: Bool = false, scenario: String = "companion") {
        launch(scenario,speech:kind == "money" ? "memory" : "words",memory:kind,contentSize:size,memoryFailure:failure);ask();answered();ready(chip);physicalControls([chip]);
    }
    func openQuestion(_ kind: String = "question", size: String? = nil, scenario: String = "companion") {
        invite(kind,size:size,scenario:scenario);chip.tap();ready(exitScene)
        XCTAssertFalse(button("aria.closeAnswer").isHittable);physicalControls([exitScene]);
    }
    func test01RememberChip() { invite();shot("01-remember-chip") }
    func test02QuestionChip() { invite("question");shot("02-question-chip") }
    func test03DialChip() {
        launch("companion",memory:"dial");ask();answered()
        let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy("bobbyAsks").components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);XCTAssertFalse(web.sliders.firstMatch.exists);physicalControls([chip]);shot("03-dial-invitation")
    }

    func consent(_ size: String?, name: String) {
        invite(size:size);chip.tap();let yes=app.buttons["companion-consent-yes"],no=app.buttons["companion-consent-no"],details=app.buttons["companion-consent-details"]
        ready(yes);ready(no);ready(details);physicalControls([yes,no,details],abovePill:false)
        XCTAssertEqual(yes.frame.width,no.frame.width,accuracy:1);XCTAssertEqual(yes.frame.height,no.frame.height,accuracy:1)
        shot(name)
    }
    func test04ConsentDefault() { consent("UICTContentSizeCategoryL",name:"04-consent-default") }
    func test05ConsentPlusOne() { consent("UICTContentSizeCategoryXL",name:"05-consent-plus1") }
    func test06ConsentLargest() { consent("UICTContentSizeCategoryAccessibilityXXXL",name:"06-consent-largest") }
    func test07ConsentSaveFailsAndNotNowCloses() {
        invite(failure:true);chip.tap();ready(app.buttons["companion-consent-yes"]);XCTAssertFalse(app.staticTexts["companion-consent-error"].exists)
        app.buttons["companion-consent-yes"].tap();ready(app.staticTexts["companion-consent-error"]);shot("07-consent-save-failed")
        app.buttons["companion-consent-no"].tap();ready(button("aria.closeAnswer"));XCTAssertFalse(web.buttons[labels["crypto"] as! String].exists);shot("08-consent-failure-declined")
    }
    func test08SwipeConsentRecordsNothing() {
        invite();chip.tap();ready(app.buttons["companion-consent-no"])
        app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.15)).press(forDuration:0.1,thenDragTo:app.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.9)))
        ready(button("aria.closeAnswer"));XCTAssertFalse(option("crypto",field:"interest").exists);shot("09-consent-swiped-no-decision")
    }
    func test09YesOpensInterestThenBarrierAndNoted() {
        invite();chip.tap();ready(app.buttons["companion-consent-yes"]);app.buttons["companion-consent-yes"].tap();ready(exitScene)
        physicalControls([option("crypto",field:"interest"),exitScene]);shot("10-question-five-options")
        option("crypto",field:"interest").tap();ready(option("words",field:"barrier"));shot("11-question-barrier")
        option("words",field:"barrier").tap();ready(noted);physicalControls([noted]);shot("12-noted-two-notes")
        XCTAssertTrue(button("aria.closeAnswer").exists);XCTAssertFalse(exitScene.exists)
    }
    func test10MoneyNeverChains() { openQuestion("money");shot("13-money-question");let option=option("under_2y",field:"when");ready(option);option.tap();ready(noted);shot("14-noted-one-option");XCTAssertFalse(exitScene.exists) }
    func sphereVisible() {
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        var colors=0
        for y in stride(from:image.height*12/100,to:image.height*40/100,by:4) {
            for x in stride(from:image.width*30/100,to:image.width*65/100,by:4) {
                let i=y*image.bytesPerRow+x*4,a=Int(bytes[i]),g=Int(bytes[i+1]),b=Int(bytes[i+2])
                if min(a,b)>70 && max(a,b)-g>25 { colors += 1 }
            }
        }
        XCTAssertGreaterThan(colors,100,"The sphere must remain visibly colored after exploring options")
    }
    func test11BarrierDragDoesNotChoose() {
        openQuestion("barrier");let options=web.otherElements[copy("options")]
        let start=options.coordinate(withNormalizedOffset:CGVector(dx:0.85,dy:0.5)),end=options.coordinate(withNormalizedOffset:CGVector(dx:0.15,dy:0.5))
        start.press(forDuration:0.1,thenDragTo:end);sphereVisible();XCTAssertTrue(exitScene.exists);XCTAssertFalse(noted.exists);shot("15-long-label-row-scrolled")
    }
    func test12LargestList() {
        openQuestion("barrier",size:"UICTContentSizeCategoryAccessibilityXXXL");shot("16-options-list")
        let first=option("fear_of_loss",field:"barrier")
        for _ in 0..<2 {
            web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.65)).press(forDuration:0.1,thenDragTo:web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.35)))
        }
        ready(first);sphereVisible();physicalControls([first,exitScene]);shot("17-options-list-scrolled")
    }
    func typeAnswer(_ text: String) {
        web.buttons[copy("typeAnswer")].tap();ready(web.textViews.firstMatch);web.textViews.firstMatch.tap()
        if let intro=app.buttons.matching(NSPredicate(format:"label == 'Continue'")).allElementsBoundByIndex.first(where:{$0.isHittable && $0.frame.minY>app.windows.firstMatch.frame.height*0.7}) { intro.tap() }
        web.textViews.firstMatch.typeText(text);XCTAssertTrue(web.staticTexts[copy("ownWords")].exists)
    }
    var ownAnswer: String { ((labels["catalog"] as! [String:[String:Any]])["when"]!["options"] as! [String:String])["2_to_7y"]! }
    func test13TypedAnswerAndUnderstood() {
        openQuestion("money");typeAnswer(ownAnswer);shot("18-typed-answer-own-words")
        ready(web.buttons[copy("answerSend")]);web.buttons[copy("answerSend")].tap();ready(noted);XCTAssertTrue(noted.label.contains(copy("correct")));shot("19-understood-own-words")
    }
    func test14SpokenAnswer() {
        openQuestion("money");web.buttons[copy("speakAnswer")].tap();ready(button("aria.sendSpoken"));Thread.sleep(forTimeInterval:1)
        XCTAssertTrue(web.staticTexts[copy("ownWords")].exists);shot("20-spoken-answer-own-words");button("aria.sendSpoken").tap();ready(noted);shot("21-understood-spoken")
    }
    func test15AnswerErrorKeepsDraftAndOptions() {
        openQuestion("money",scenario:"companion-answer-error");typeAnswer(ownAnswer);web.buttons[copy("answerSend")].tap();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,ownAnswer);ready(web.staticTexts[copy("answerFailed")]);shot("22-answer-error-draft-kept")
    }
    func stopVisible(_ control: XCUIElement) {
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        let factor=CGFloat(image.width)/app.windows.firstMatch.frame.width
        let cx=Int(control.frame.midX*factor),cy=Int(control.frame.midY*factor),radius=Int(10*factor)
        var ink=0
        for y in stride(from:cy-radius,to:cy+radius,by:2) {
            for x in stride(from:cx-radius,to:cx+radius,by:2) {
                let i=y*image.bytesPerRow+x*4
                if min(bytes[i],min(bytes[i+1],bytes[i+2]))>150 { ink += 1 }
            }
        }
        XCTAssertGreaterThan(ink,20,"Cancel must show its light stop glyph inside the pill")
    }
    func test17SendingCancelKeepsDraftAndIgnoresLateAnswer() {
        openQuestion("money",scenario:"companion-answer-slow");typeAnswer(ownAnswer)
        web.buttons[copy("answerSend")].tap();ready(button("aria.cancelQuestion"));Thread.sleep(forTimeInterval:1);stopVisible(button("aria.cancelQuestion"));shot("25-answer-sending-stop",delay:0)
        button("aria.cancelQuestion").tap();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,ownAnswer)
        Thread.sleep(forTimeInterval:1);XCTAssertFalse(noted.exists);shot("26-answer-cancel-draft-kept")
    }
    func test16ExerciseFollowUpOnlyOnTap() { openQuestion("fall");shot("23-exercise-question");let option=option("pause",field:"fall");ready(option);option.tap();ready(web.buttons.matching(NSPredicate(format:"label CONTAINS %@",copy("exerciseFollowUp"))).firstMatch);shot("24-exercise-followup") }
}

final class MemoryNotesShots: ConversationFixtureCase {
    func copy(_ key:String)->String { (labels["companion"] as! [String:String])[key]! }
    func notes(_ seeded:Bool = true, scenario:String = "companion", ownerReset:Bool = false) {
        launch(scenario,notes:seeded, memory:ownerReset ? "owner-reset" : nil)
        openProfileFromGlass();let memory=app.buttons["account-memory"];for _ in 0..<6 where !memory.isHittable { app.scrollViews.firstMatch.swipeUp() };ready(memory);memory.tap()
        let door=app.buttons["memory-educational-notes"];ready(door);door.tap();ready(app.staticTexts["companion-notes-title"])
    }
    func row(_ field:String)->XCUIElement { app.buttons["companion-note-row-"+field] }
    func reach(_ element:XCUIElement) { for _ in 0..<6 where !element.isHittable { app.scrollViews.firstMatch.swipeUp() };ready(element) }
    func detail(_ field:String) { reach(row(field));row(field).tap();ready(app.staticTexts["companion-detail-value"]) }
    func test01NotesRowsAndSaidDetail() {
        notes();physicalControls([app.buttons["companion-notes-close"],app.switches["companion-memory-toggle"]],abovePill:false);reach(row("barrier"));physicalControls([row("interest"),row("barrier")],abovePill:false)
        XCTAssertFalse(app.buttons["companion-correct-interest"].exists);XCTAssertTrue(app.staticTexts[copy("toConfirm")].exists)
        shot("40-notes-said-inferred");detail("interest");XCTAssertFalse(app.buttons["companion-note-confirm"].exists)
        physicalControls([app.buttons["companion-correct-interest"],app.buttons["companion-delete-interest"]],abovePill:false);shot("41-detail-said")
    }
    func test02InferredOnlyExplicitPrimaryConfirms() {
        notes();detail("barrier");ready(app.buttons["companion-note-confirm"]);shot("42-detail-inferred")
        app.buttons["companion-detail-close"].tap();ready(row("barrier"));XCTAssertTrue(app.staticTexts[copy("toConfirm")].exists)
        detail("barrier");app.buttons["companion-note-confirm"].tap();XCTAssertTrue(app.buttons["companion-note-confirm"].waitForNonExistence(timeout:5))
        XCTAssertTrue(app.staticTexts["companion-detail-origin"].label.hasPrefix(copy("detail.confirmed").components(separatedBy:"{date}")[0]));shot("43-inference-confirmed")
    }
    func test03CorrectionChecksCurrentAndStoresConfirmed() {
        notes();detail("interest");app.buttons["companion-correct-interest"].tap();ready(app.buttons["companion-correct-option-crypto"])
        XCTAssertTrue(app.buttons["companion-correct-option-crypto"].isSelected);shot("44-correction-current-choice")
        let leave=app.buttons["companion-correction-leave"];reach(leave);physicalControls([leave],abovePill:false);shot("65-correction-lower-choices-and-leave")
        leave.tap();ready(app.buttons["companion-correct-interest"]);app.buttons["companion-correct-interest"].tap()
        reach(app.buttons["companion-correct-option-companies"]);app.buttons["companion-correct-option-companies"].tap()
        ready(app.buttons["companion-correct-interest"]);XCTAssertTrue(app.staticTexts["companion-detail-origin"].label.hasPrefix(copy("detail.confirmed").components(separatedBy:"{date}")[0]));shot("45-correction-confirmed")
    }
    func test04DeleteUndoReturnsExactNoteAndDeleteAllKeepsMemory() {
        notes();detail("interest");let origin=app.staticTexts["companion-detail-origin"].label
        app.buttons["companion-delete-interest"].tap();ready(app.buttons["companion-note-undo"]);XCTAssertFalse(row("interest").exists);shot("46-note-deleted-undo",delay:0)
        app.buttons["companion-note-undo"].tap();ready(row("interest"));detail("interest");XCTAssertEqual(app.staticTexts["companion-detail-origin"].label,origin)
        app.buttons["companion-detail-close"].tap();reach(app.buttons["companion-delete-all"]);app.buttons["companion-delete-all"].tap();ready(app.buttons["companion-delete-confirm"])
        physicalControls([app.buttons["companion-delete-confirm"],app.buttons["companion-delete-cancel"]],abovePill:false);shot("47-delete-all-confirm")
        app.buttons["companion-delete-confirm"].tap();ready(app.staticTexts["companion-notes-empty"]);XCTAssertEqual(app.switches["companion-memory-toggle"].value as? String,"1");shot("48-notes-empty")
    }
    func test05MemoryOffAndServerDisabled() {
        notes();let toggle=app.switches["companion-memory-toggle"];reach(toggle);toggle.tap();ready(app.buttons["companion-delete-confirm"]);shot("49-memory-off-confirm")
        app.buttons["companion-delete-confirm"].tap();ready(app.staticTexts["companion-notes-off"]);XCTAssertFalse(row("interest").exists);shot("50-notes-off")
        app.terminate();notes(false,scenario:"companion-mismatch");XCTAssertFalse(app.switches["companion-memory-toggle"].isEnabled);shot("51-notes-disabled")
    }
    func test06ReadingNotesLineOpensNotesAndNotedOpensDetail() {
        launch("companion",notes:true);ask();answered()
        let line=web.buttons[copy("notesLineName")];ready(line);physicalControls([line]);shot("52-answer-notes-line")
        line.tap();ready(app.staticTexts["companion-notes-title"]);shot("53-notes-from-answer")
        app.buttons["companion-notes-close"].tap();ready(button("aria.closeAnswer"))
        app.terminate();launch("companion",memory:"money");ask();answered()
        let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy("bobbyAsks").components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);chip.tap();let label=((labels["catalog"] as! [String:[String:Any]])["when"]!["options"] as! [String:String])["under_2y"]!
        ready(web.buttons[label]);web.buttons[label].tap()
        let noted=web.buttons.matching(NSPredicate(format:"label CONTAINS %@",copy("noted").components(separatedBy:"{label}")[0])).firstMatch
        ready(noted);noted.tap();ready(app.staticTexts["companion-detail-value"]);shot("54-detail-from-noted")
    }
    func test07UndoDiesOnBackground() {
        notes();detail("interest");app.buttons["companion-delete-interest"].tap();ready(app.buttons["companion-note-undo"])
        backgroundAndReturn();XCTAssertFalse(app.buttons["companion-note-undo"].exists);XCTAssertFalse(row("interest").exists);shot("55-undo-cleared-after-background")
    }
    func test08AccountChangeResetHasNoOldNotes() {
        notes(true,ownerReset:true);ready(app.staticTexts["companion-notes-off"]);XCTAssertFalse(row("interest").exists);XCTAssertFalse(row("barrier").exists);shot("56-account-change-reset")
    }
    func test09ClosingNotesCannotBringUndoIntoANewScreen() {
        notes();detail("interest");app.buttons["companion-delete-interest"].tap();ready(app.buttons["companion-note-undo"])
        let close=app.buttons["companion-notes-close"]
        for _ in 0..<6 where !close.isHittable { app.scrollViews.firstMatch.swipeDown() }
        ready(close);close.tap();ready(button("aria.type"))
        openProfileFromGlass();let memory=app.buttons["account-memory"]
        for _ in 0..<6 where !memory.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(memory);memory.tap();ready(app.buttons["memory-educational-notes"]);app.buttons["memory-educational-notes"].tap()
        ready(app.staticTexts["companion-notes-title"]);XCTAssertFalse(app.buttons["companion-note-undo"].exists);XCTAssertFalse(row("interest").exists)
        shot("62-closed-notes-reopened-without-undo")
    }
    func test10LastDeletedNoteShowsUndoBeforeTheEmptyState() {
        notes();detail("interest");app.buttons["companion-delete-interest"].tap();ready(app.buttons["companion-note-undo"])
        detail("barrier");app.buttons["companion-delete-barrier"].tap();let undo=app.buttons["companion-note-undo"];ready(undo)
        XCTAssertFalse(app.staticTexts["companion-notes-empty"].exists);shot("63-last-note-deleted-with-undo",delay:0)
        XCTAssertTrue(undo.waitForNonExistence(timeout:7));ready(app.staticTexts["companion-notes-empty"])
        shot("64-undo-expired-empty-state")
    }
}

/// Store compositions use the shipping views and offline fixture transport at native resolution.
final class StoreScreenShots: ConversationFixtureCase {
    func testFiveCurrentStoreCompositions() {
        launch("companion",voice:true,home:"fresh",memory:"remember")
        shot("01-rest")
        ask();answered();ready(button("answer.readAll"));shot("02-answer")
        app.terminate();launch("companion-plain");ask("Bitcoin")
        ready(button("risk.notNow"));shot("03-read-offer")
        app.terminate();launch("companion",memory:"barrier");ask();answered()
        let words=labels["companion"] as! [String:String]
        let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",words["bobbyAsks"]!.components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);chip.tap();ready(web.buttons[words["notNow"]!]);Thread.sleep(forTimeInterval:1);assertPillGlyphVisible(web.buttons[words["speakAnswer"]!]);shot("04-personal-question")
        app.terminate();launch("companion",notes:true)
        openProfileFromGlass()
        let memory=app.buttons["account-memory"]
        for _ in 0..<6 where !memory.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(memory);memory.tap();ready(app.buttons["memory-educational-notes"]);app.buttons["memory-educational-notes"].tap()
        ready(app.staticTexts["companion-notes-title"]);shot("05-notes")
    }
}

/// English fixture review of the bounded build; no purchase, account deletion or external link is submitted.
final class StoreFirstLaunchWalk: FirstRunFixtureCase {
    func testCleanEnglishETFQuestionNoticeAndReadAll() {
        XCTAssertEqual(language,"en")
        fresh("companion",voice:true);shot("01-review-clean-first-launch",delay:3)
        web.buttons[firstWords["aria.type"]!].tap();ready(web.textViews.firstMatch)
        web.textViews.firstMatch.tap();web.textViews.firstMatch.typeText("What is an ETF?")
        shot("02-review-typed-etf")
        web.buttons[firstWords["type.send"]!].tap();ready(web.buttons[firstWords["risk.activate"]!])
        shot("03-review-ai-disclosure")
        web.buttons[firstWords["risk.notice"]!].tap();ready(app.buttons["risk-close"])
        shot("04-review-full-risk-notice");app.buttons["risk-close"].tap()
        ready(web.buttons[firstWords["risk.activate"]!]);web.buttons[firstWords["risk.activate"]!].press(forDuration:1.8)
        answered();shot("05-review-first-answer")
        let readAll=button("answer.readAll")
        ready(readAll);readAll.tap();ready(button("aria.closeAnswer"))
        shot("06-review-read-all")
        button("aria.closeAnswer").tap();ask("What does investing mean?");answered();shot("07-review-second-question")
    }
}

final class StoreReviewerWalk: ConversationFixtureCase {
    func gone(_ element:XCUIElement) {
        let e=XCTNSPredicateExpectation(predicate:NSPredicate(format:"exists == false"),object:element)
        XCTAssertEqual(XCTWaiter.wait(for:[e],timeout:8),.completed,app.debugDescription)
    }
    func copy(_ key:String)->String { (labels["companion"] as! [String:String])[key]! }
    func reach(_ element:XCUIElement) {
        for _ in 0..<7 where !element.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(element)
    }
    func profile() {
        if app.buttons["account-close"].exists { return }
        openProfileFromGlass()
    }
    func notes() {
        profile();let memory=app.buttons["account-memory"];reach(memory);memory.tap()
        let door=app.buttons["memory-educational-notes"];reach(door);door.tap();ready(app.staticTexts["companion-notes-title"])
    }
    func testPersonalConsentOptionAndOwnWords() {
        launch("companion",memory:"remember");ask();answered()
        let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy("bobbyAsks").components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);shot("08-review-personal-chip");chip.tap()
        ready(app.buttons["companion-consent-details"]);shot("09-review-memory-disclosure-details")
        // Its exact six-language destination is pinned in CompanionNotesOwnershipTests; do not make a live request.
        app.buttons["companion-consent-yes"].tap()
        let catalog=labels["catalog"] as! [String:[String:Any]]
        let crypto=(catalog["interest"]!["options"] as! [String:String])["crypto"]!
        ready(web.buttons[crypto]);shot("10-review-question-options");web.buttons[crypto].tap()
        let words=(catalog["barrier"]!["options"] as! [String:String])["words"]!
        ready(web.buttons[words]);web.buttons[words].tap();ready(button("aria.closeAnswer"));shot("11-review-noted")
        app.terminate();launch("companion",memory:"money");ask();answered();ready(chip);chip.tap()
        let typeAnswer=web.buttons[copy("typeAnswer")];ready(typeAnswer);typeAnswer.tap();ready(web.textViews.firstMatch)
        web.textViews.firstMatch.tap();web.textViews.firstMatch.typeText("In two to seven years")
        shot("12-review-personal-own-words");web.buttons[copy("answerSend")].tap()
        ready(button("aria.closeAnswer"));shot("13-review-understood")
    }
    func testNotesDetailConfirmationCorrectionUndoDeletionAndMemoryOff() {
        launch("companion",notes:true);notes();shot("14-review-shipping-notes")
        let interest=app.buttons["companion-note-row-interest"],barrier=app.buttons["companion-note-row-barrier"]
        reach(barrier);barrier.tap();ready(app.buttons["companion-note-confirm"]);shot("48-review-note-inference")
        app.buttons["companion-note-confirm"].tap();XCTAssertTrue(app.buttons["companion-note-confirm"].waitForNonExistence(timeout:5))
        shot("49-review-note-confirmed");app.buttons["companion-detail-close"].tap();ready(interest);interest.tap()
        ready(app.buttons["companion-correct-interest"]);let origin=app.staticTexts["companion-detail-origin"].label
        XCTAssertFalse(app.buttons["companion-note-confirm"].exists);shot("50-review-note-said-detail")
        app.buttons["companion-correct-interest"].tap();ready(app.buttons["companion-correct-option-crypto"])
        XCTAssertTrue(app.buttons["companion-correct-option-crypto"].isSelected);shot("51-review-note-correction-choices")
        app.buttons["companion-correction-leave"].tap();ready(app.buttons["companion-delete-interest"])
        app.buttons["companion-delete-interest"].tap();let undo=app.buttons["companion-note-undo"];ready(undo)
        shot("16-review-note-deleted-undo",delay:0);undo.tap();ready(interest);interest.tap();ready(app.buttons["companion-correct-interest"])
        XCTAssertEqual(app.staticTexts["companion-detail-origin"].label,origin)
        app.buttons["companion-correct-interest"].tap();ready(app.buttons["companion-correct-option-companies"])
        app.buttons["companion-correct-option-companies"].tap();ready(app.buttons["companion-correct-interest"]);shot("15-review-corrected-note")
        app.buttons["companion-detail-close"].tap();let all=app.buttons["companion-delete-all"];reach(all);all.tap()
        ready(app.buttons["companion-delete-confirm"]);shot("17-review-delete-all-confirm");app.buttons["companion-delete-confirm"].tap()
        ready(app.staticTexts["companion-notes-empty"]);shot("18-review-notes-empty")
        let toggle=app.switches["companion-memory-toggle"];reach(toggle);toggle.tap();ready(app.buttons["companion-delete-confirm"])
        app.buttons["companion-delete-confirm"].tap();ready(app.staticTexts["companion-notes-off"]);shot("19-review-memory-off")
    }
    func testDialInvitationAndProfileDoorReturnSameAnswer() {
        launch("companion",memory:"dial");ask();answered()
        let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy("bobbyAsks").components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);XCTAssertFalse(web.sliders.firstMatch.exists);chip.tap()
        ready(web.buttons["Leave as is"]);web.buttons["Leave as is"].tap();ready(button("aria.closeAnswer"))
        profile();let dial=app.buttons["account-speaking"];reach(dial);dial.tap();ready(web.buttons["Save"])
        shot("20-review-dial-profile");web.buttons["Leave as is"].tap();ready(button("aria.closeAnswer"))
        profile();let memory=app.buttons["account-memory"];reach(memory);memory.tap();XCTAssertFalse(app.buttons["memory-speaking"].exists)
    }
    func testBitcoinOfferConfirmReadAndSave() {
        launch();ask("Analyze Bitcoin");ready(button("risk.notNow"));physicalControls([confirmRead,button("risk.notNow")])
        shot("21-review-bitcoin-cost");confirmRead.tap();ready(button("read.result"),timeout:45);button("read.result").tap()
        shot("22-review-bitcoin-read");let save=web.buttons.matching(NSPredicate(format:"label == %@",word("read.save"))).allElementsBoundByIndex.first { $0.isHittable }
        XCTAssertNotNil(save);save!.tap();ready(web.staticTexts[word("read.savedLocal")])
        let home=button("read.home");ready(home)
        XCTAssertFalse(web.staticTexts["YOU MIGHT WANT TO ASK"].exists)
        XCTAssertFalse(web.staticTexts.matching(NSPredicate(format:"label BEGINSWITH[c] 'Unlocked ·'")).firstMatch.exists)
        let nextQuestion=button("read.new");ready(nextQuestion);Thread.sleep(forTimeInterval:1)
        assertNoCaptionBeside(nextQuestion);shot("23-review-bitcoin-saved",delay:0)
        home.tap();ready(button("aria.type"))
    }
    func testSignedOutProfileCreditsRestoreAndProExit() {
        launch();profile();shot("24-review-profile-signed-out")
        let credits=app.buttons["account-credits"];reach(credits);credits.tap();ready(app.buttons["credits-close"])
        shot("25-review-credits");let restore=app.buttons["account-restore"];reach(restore);restore.tap();shot("26-review-restore-fixture")
        // Recorded guest access can be unknown: no fabricated balance or product price.
        app.buttons["credits-close"].tap();app.terminate();app.launchArguments += ["-nucleo-paywall"];app.launch();ready(app.buttons["paywall-close"])
        XCTAssertTrue(app.buttons["paywall-terms"].exists);XCTAssertTrue(app.buttons["paywall-privacy"].exists)
        XCTAssertTrue(app.buttons["paywall-restore"].exists);shot("27-review-pro-fixture-unavailable")
        app.buttons["paywall-close"].tap()
    }
    func testProfileThesesRemindersRiskAndAppleSheet() {
        launch();profile();let theses=app.buttons["account-theses"];reach(theses);theses.tap();ready(app.buttons["theses-close"])
        shot("28-review-theses");app.buttons["theses-close"].tap();gone(app.buttons["theses-close"]);profile()
        let reminders=app.buttons["account-reminders"];reach(reminders);reminders.tap();ready(app.buttons["reminders-close"])
        shot("29-review-reminders");app.buttons["reminders-close"].tap();gone(app.buttons["reminders-close"]);profile()
        let risk=app.buttons["account-risk"];reach(risk);risk.tap();ready(app.buttons["risk-close"])
        shot("30-review-risk");app.buttons["risk-close"].tap();gone(app.buttons["risk-close"]);profile()
        let apple=app.buttons["account-apple-sign-in"];reach(apple);apple.tap();Thread.sleep(forTimeInterval:2)
        shot("31-review-apple-system-sheet")
        let springboard=XCUIApplication(bundleIdentifier:"com.apple.springboard")
        if springboard.buttons["Cancel"].isHittable { springboard.buttons["Cancel"].tap() }
        else if app.buttons["Cancel"].isHittable { app.buttons["Cancel"].tap() }
    }
    func testSignedInDeleteDialogIsReachableWithoutSubmitting() {
        launch();app.terminate();app.launchArguments += ["-qa-nucleo-signed-in"];app.launch();ready(button("aria.type"));profile()
        let deletion=app.buttons["account-delete"];reach(deletion);shot("32-review-profile-signed-in")
        deletion.tap();ready(app.buttons["Delete account permanently"]);shot("33-review-delete-account-dialog")
        if app.buttons["Cancel"].isHittable { app.buttons["Cancel"].tap() }
        else { app.otherElements["PopoverDismissRegion"].coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.2)).tap() }
        gone(app.buttons["Delete account permanently"])
    }
}

final class StoreOSPermissionWalk: ConversationFixtureCase {
    func testActualOSDenialKeepsTypingAndExplainsPermission() throws {
        let state=ProcessInfo.processInfo.environment["REDESIGN_PERMISSION_STATE"] ?? "default"
        guard state != "default" else { throw XCTSkip("Requires the runner's actual simulator TCC denial") }
        launch();app.terminate()
        if let index=app.launchArguments.firstIndex(of:"-qa-speech-fixture") { app.launchArguments.removeSubrange(index...index+1) }
        if let index=app.launchArguments.firstIndex(of:"-qa-speech-permission") { app.launchArguments.removeSubrange(index...index+1) }
        app.launch();ready(button("aria.type"));button("aria.talk").tap()
        if state == "speech-denied" {
            let primer=button("perm.cta");ready(primer);primer.tap()
            let system=XCUIApplication(bundleIdentifier:"com.apple.springboard")
            let deny=system.buttons.matching(NSPredicate(format:"label IN %@",["Don’t Allow","Don't Allow"])).firstMatch
            XCTAssertTrue(deny.waitForExistence(timeout:12),system.debugDescription);deny.tap()
        }
        let settings=app.buttons["Open Settings"];ready(settings)
        XCTAssertTrue(app.staticTexts[word("hint.micOff")].exists)
        shot(state == "microphone-denied" ? "34-review-os-microphone-denied" : "35-review-os-speech-denied")
        settings.tap()
        let preferences=XCUIApplication(bundleIdentifier:"com.apple.Preferences")
        XCTAssertTrue(preferences.wait(for:.runningForeground,timeout:12),preferences.debugDescription)
        // The simulator may land at Settings root. This proves the OS route and return;
        // the app-specific permission page remains a physical-iPhone check.
        XCTAssertTrue(preferences.navigationBars.firstMatch.waitForExistence(timeout:12),preferences.debugDescription)
        let route=XCTAttachment(screenshot:XCUIScreen.main.screenshot());route.name="redesign-47-review-os-settings-route";route.lifetime = .keepAlways;add(route)
        app.activate();ready(button("aria.type"));XCTAssertFalse(button("aria.sendSpoken").exists)
        shot("48-review-return-from-settings")
        // Returning clears a transient page hint. A fresh explicit voice tap still explains
        // the real denial; declining Settings leaves the keyboard route available.
        button("aria.talk").tap();ready(app.buttons["Open Settings"])
        XCTAssertTrue(app.staticTexts[word("hint.micOff")].exists)
        app.buttons["Cancel"].tap();ready(button("aria.type"))
        ask("What is an ETF?");answered();shot("36-review-os-denied-typing-works")
    }
}

final class StoreAdditionalWalk: ConversationFixtureCase {
    func reach(_ element:XCUIElement) {
        for _ in 0..<7 where !element.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(element)
    }
    func profile() {
        openProfileFromGlass()
    }
    func testServerDisallowsMemoryWithoutBlockingExistingNotesDeletion() {
        launch("companion-plain",notes:true);ask();answered()
        let copy=labels["companion"] as! [String:String]
        XCTAssertFalse(web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy["bobbyAsks"]!.components(separatedBy:"{question}")[0])).firstMatch.exists)
        button("aria.closeAnswer").tap();profile()
        let memory=app.buttons["account-memory"];reach(memory);memory.tap()
        let door=app.buttons["memory-educational-notes"];reach(door);door.tap();ready(app.staticTexts["companion-notes-title"])
        XCTAssertFalse(app.buttons["companion-correct-interest"].exists)
        let row=app.buttons["companion-note-row-interest"];reach(row);shot("37-review-server-memory-off");row.tap()
        let deletion=app.buttons["companion-delete-interest"];ready(deletion);XCTAssertFalse(app.buttons["companion-correct-interest"].exists)
        deletion.tap();ready(app.buttons["companion-note-undo"]);XCTAssertFalse(row.exists);shot("38-review-server-off-delete-works",delay:0)
    }
    func testKnownGuestCreditsProDoorAndSignedInLegalRestoreExit() {
        launch("subscription_required");profile()
        let credits=app.buttons["account-credits"];reach(credits);credits.tap();ready(app.buttons["credits-close"])
        let pro=app.buttons["credits-pro"];reach(pro);shot("39-review-known-credits-pro-door");pro.tap();ready(app.buttons["paywall-close"])
        XCTAssertTrue(app.buttons["paywall-terms"].exists);XCTAssertTrue(app.buttons["paywall-privacy"].exists)
        shot("40-review-pro-from-credits");app.buttons["paywall-close"].tap()
        app.terminate();app.launchArguments += ["-qa-nucleo-signed-in","-nucleo-paywall"];app.launch();ready(app.buttons["paywall-close"])
        let restore=app.buttons["paywall-restore"];reach(restore);restore.tap()
        shot("41-review-pro-signed-in-restore-fixture")
        app.buttons["paywall-close"].tap();ready(button("aria.type"))
    }
    // Withdrawal uses the shipping Profile row, not a fixture flag.
    func testWithdrawAIConsentStopsQuestionsAndKeepsProfileAccessible() {
        launch();profile();let risk=app.buttons["account-risk"];reach(risk);risk.tap()
        let withdraw=app.buttons["risk-withdraw-consent"];reach(withdraw);shot("42-review-withdraw-ai-door")
        withdraw.tap();ready(app.buttons["Withdraw consent"]);shot("43-review-withdraw-ai-confirm")
        app.buttons["Withdraw consent"].tap();ready(button("aria.type"));shot("44-review-ai-withdrawn")
        ask("What is an ETF?")
        let openRisk=web.buttons["Open the risk notice"];ready(openRisk)
        XCTAssertTrue(web.staticTexts["Bobby reads nothing until you agree to it. Your question was not sent."].exists)
        shot("45-review-withdrawn-question-needs-consent");openRisk.tap()
        ready(web.buttons["I agree to the risk notice and AI processing"]);shot("49-review-withdrawn-full-notice")
        let profileAfter=web.buttons.matching(NSPredicate(format:"label == 'Profile' OR label BEGINSWITH 'Momo.'")).firstMatch
        ready(profileAfter);Thread.sleep(forTimeInterval:2);profileAfter.tap();ready(app.buttons["account-close"]);shot("46-review-profile-after-withdrawal")
    }
}
