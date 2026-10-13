import XCTest
import UIKit

/// Real native/WebKit UI with intercepted transport and a fixed calendar origin.
final class StabilityShots: ConversationFixtureCase {
    private func copy(_ key:String)->String {(labels["companion"] as! [String:String])[key]!}
    private func chip()->XCUIElement { web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",copy("bobbyAsks").components(separatedBy:"{question}")[0])).firstMatch }
    private func reach(_ element:XCUIElement) { for _ in 0..<8 where !element.isHittable {app.scrollViews.firstMatch.swipeUp()};ready(element) }
    private func error(_ key:String) {
        let text=web.staticTexts[word(key)];ready(text)
        XCTAssertEqual(text.label.components(separatedBy:". ").count,1)
        XCTAssertFalse(web.staticTexts["Internal Server Error"].exists)
    }
    private func draft() {
        button("aria.closeAnswer").tap();ready(button("type.send"));button("aria.type").tap();ready(web.textViews.firstMatch)
        XCTAssertEqual(web.textViews.firstMatch.value as? String,word("ex.1"))
    }
    func test01HTTP500KeepsTheDraftAndItsExplicitRetryRecovers() {
        launch("companion-http500");ask();ready(button("fail.retry"));error("fail.answer");shot("80-http500-one-sentence")
        draft();shot("81-http500-exact-draft");button("type.send").tap();answered();shot("82-http500-recovered")
    }
    func test02NoNetworkKeepsTheQuestion() {
        launch("offline");ask();ready(button("fail.retry"));error("fail.offline");shot("83-offline-one-sentence");draft();shot("84-offline-exact-draft")
    }
    func test03MalformedJSONKeepsTheQuestion() {
        launch("companion-malformed-json");ask();ready(button("fail.retry"));error("fail.answer");shot("85-malformed-json-one-sentence");draft()
    }
    func test04HTTP429KeepsTheSameLocalizedLimitAfterBackground() {
        launch("companion-http429");ask();let prefix=nativeWord("limitKnown").components(separatedBy:"{0}")[0]
        let line=web.staticTexts.matching(NSPredicate(format:"label BEGINSWITH %@",prefix)).firstMatch;ready(line)
        let before=line.label;XCTAssertFalse(before.contains(". "));shot("86-http429-one-sentence")
        backgroundAndReturn();ready(line);XCTAssertEqual(line.label,before);shot("87-http429-same-clock");draft()
    }
    func test05TwentySecondAnswerFinishesWithoutLosingTheQuestion() {
        launch("companion-slow20");ask();ready(button("aria.cancelQuestion"));shot("88-slow20-preparing")
        ready(button("aria.closeAnswer"),timeout:30);XCTAssertFalse(button("fail.retry").exists);shot("89-slow20-answer")
    }
    func test06NeverFinishingTransportEndsAtTheNativeDeadline() {
        launch("companion-never-finishes");ask();ready(button("aria.cancelQuestion"))
        ready(button("fail.retry"),timeout:55);error("fail.answer");XCTAssertFalse(button("aria.cancelQuestion").exists)
        shot("90-bounded-deadline-failure");draft();shot("91-deadline-exact-draft")
    }
    func test07BackgroundListeningPreservesWordsWithoutSending() {
        launch("companion");listening();backgroundAndReturn();ready(button("type.send"))
        XCTAssertFalse(button("aria.closeAnswer").exists);shot("92-background-listening-held")
        button("aria.type").tap();ready(web.textViews.firstMatch);XCTAssertEqual(web.textViews.firstMatch.value as? String,word("ex.1"))
    }
    func test08BackgroundSpeakingStopsAndDoesNotReplay() {
        launch("companion",voice:true);ask();answered();ready(button("aria.pillStop"));backgroundAndReturn()
        ready(button("aria.talk"));XCTAssertFalse(button("aria.pillStop").exists);ready(button("aria.closeAnswer"));shot("93-background-spoken-answer-kept")
    }
    func test09BackgroundConsentKeepsBothChoicesAndNoDecision() {
        launch("companion",memory:"remember");ask();answered();ready(chip());chip().tap();ready(app.buttons["companion-consent-yes"])
        backgroundAndReturn();let yes=app.buttons["companion-consent-yes"],no=app.buttons["companion-consent-no"]
        ready(yes);ready(no);physicalControls([yes,no],abovePill:false);shot("94-background-consent-undecided")
        no.tap();ready(button("aria.closeAnswer"));XCTAssertFalse(app.buttons["companion-consent-yes"].exists)
    }
    func test10VisibleInferredNoteExpiresWhileDetailIsOpen() {
        launch("companion",notes:true,expiringNotes:true);openProfileFromGlass()
        let memory=app.buttons["account-memory"];reach(memory);memory.tap();let notes=app.buttons["memory-educational-notes"];reach(notes);notes.tap()
        let value=app.staticTexts["companion-detail-value"];ready(value);ready(app.buttons["companion-note-confirm"]);shot("95-note-detail-before-expiry")
        XCTAssertTrue(value.waitForNonExistence(timeout:15));ready(app.buttons["companion-note-row-interest"])
        XCTAssertFalse(app.buttons["companion-note-row-barrier"].exists);XCTAssertFalse(app.buttons["companion-note-undo"].exists);shot("96-note-expired-without-reopen")
    }
    func test11LargestTypeAndVoiceOverNamesOnSceneConsentQuestionAndNotes() {
        let size="UICTContentSizeCategoryAccessibilityXXXL"
        launch("companion",contentSize:size)
        let sphere=web.descendants(matching:.any).matching(NSPredicate(format:"label == %@",word("aria.idle"))).firstMatch
        XCTAssertTrue(sphere.waitForExistence(timeout:20));physicalControls([button("aria.type"),button("aria.talk")],abovePill:false);shot("97-largest-scene-labels",delay:3)
        app.terminate();launch("companion",memory:"remember",contentSize:size);ask();answered();ready(chip());chip().tap()
        let consent=labels["consent"] as! [String];let yes=app.buttons["companion-consent-yes"],no=app.buttons["companion-consent-no"]
        ready(yes);ready(no);XCTAssertEqual(yes.label,consent[4]);XCTAssertEqual(no.label,consent[5]);physicalControls([yes,no],abovePill:false);shot("98-largest-consent-labels")
        app.terminate();launch("companion",memory:"barrier",contentSize:size);ask();answered();ready(chip());chip().tap()
        let q=(labels["catalog"] as! [String:[String:Any]])["barrier"]!,title=q["text"] as! String
        XCTAssertTrue(web.staticTexts.matching(NSPredicate(format:"label CONTAINS %@",title)).firstMatch.waitForExistence(timeout:20))
        for label in (q["options"] as! [String:String]).values {XCTAssertTrue(web.buttons[label].exists);XCTAssertFalse(web.buttons[label].label.isEmpty)}
        shot("99-largest-question-labels")
        app.terminate();launch("companion",notes:true,contentSize:size);openProfileFromGlass();let memory=app.buttons["account-memory"];reach(memory);memory.tap();let notes=app.buttons["memory-educational-notes"];reach(notes);notes.tap()
        ready(app.staticTexts["companion-notes-title"]);XCTAssertEqual(app.staticTexts["companion-notes-title"].label,copy("notesTitle"));shot("100-largest-notes-top-labels")
        let row=app.buttons["companion-note-row-barrier"];reach(row);XCTAssertFalse(row.label.isEmpty);physicalControls([row],abovePill:false);shot("101-largest-notes-row-labels")
    }
    private func assertConsentInkFits(_ button: XCUIElement) {
        // Check rendered glyphs, rather than estimating SwiftUI Text with UIKit font metrics.
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        let scale=CGFloat(image.width)/app.frame.width,rect=button.frame
        var first=image.height,last=0,count=0
        for y in Int(rect.minY*scale)..<min(image.height,Int(rect.maxY*scale)) {
            for x in Int(rect.minX*scale)..<min(image.width,Int(rect.maxX*scale)) {
                let i=y*image.bytesPerRow+x*4
                if min(bytes[i],bytes[i+1],bytes[i+2])>160 {first=min(first,y);last=max(last,y);count += 1}
            }
        }
        XCTAssertGreaterThan(count,100,"The consent label must be visibly drawn")
        XCTAssertGreaterThanOrEqual(CGFloat(first)/scale,rect.minY+10,"Text reaches the top of its control")
        XCTAssertLessThanOrEqual(CGFloat(last)/scale,rect.maxY-10,"Text reaches the bottom of its control")
    }
    func test12LargestConsentAnswersFitTheirLabelsAndKeepEqualDimensions() {
        launch("companion",memory:"remember",contentSize:"UICTContentSizeCategoryAccessibilityXXXL");ask();answered();ready(chip());chip().tap()
        let words=labels["consent"] as! [String],yes=app.buttons["companion-consent-yes"],no=app.buttons["companion-consent-no"]
        ready(yes);ready(no);shot("102-largest-consent-controls-fit",delay:2)
        XCTAssertEqual(yes.label,words[4]);XCTAssertEqual(no.label,words[5])
        assertConsentInkFits(yes);assertConsentInkFits(no)
        XCTAssertEqual(yes.frame.height,no.frame.height,accuracy:1);XCTAssertEqual(yes.frame.width,no.frame.width,accuracy:1)
        XCTAssertLessThanOrEqual(yes.frame.maxY,no.frame.minY)
    }
    func test13LargestMemoryLabelKeepsItsWordsWholeAboveTheSwitch() {
        launch("companion",notes:true,contentSize:"UICTContentSizeCategoryAccessibilityXXXL");openProfileFromGlass()
        let memory=app.buttons["account-memory"];reach(memory);memory.tap();let notes=app.buttons["memory-educational-notes"];reach(notes);notes.tap()
        let label=app.staticTexts[copy("memory")],toggle=app.switches["companion-memory-toggle"];ready(label);reach(toggle)
        let font=UIFontMetrics(forTextStyle:.body).scaledFont(for:UIFont.systemFont(ofSize:16),compatibleWith:UITraitCollection(preferredContentSizeCategory:.accessibilityExtraExtraExtraLarge))
        let widest=copy("memory").split(whereSeparator:{$0.isWhitespace}).map{(String($0) as NSString).size(withAttributes:[.font:font]).width}.max()!
        XCTAssertGreaterThanOrEqual(label.frame.width,widest-1);XCTAssertGreaterThanOrEqual(toggle.frame.minY,label.frame.maxY)
        shot("103-largest-memory-switch-stacked")
    }

    func test14LargestQuestionListScrollsEveryChoiceWithoutChoosing() {
        launch("companion",memory:"barrier",contentSize:"UICTContentSizeCategoryAccessibilityXXXL");ask();answered();ready(chip());chip().tap()
        let q=(labels["catalog"] as! [String:[String:Any]])["barrier"]!,choices=q["orderedOptions"] as! [[String:String]]
        let exit=web.buttons[copy("notNow")];ready(exit)
        for choice in choices {
            let option=web.buttons[choice["label"]!]
            for _ in 0..<10 where !option.isHittable || option.frame.maxY > exit.frame.minY {
                web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.58)).press(forDuration:0.1,
                    thenDragTo:web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.32)))
            }
            ready(option);physicalControls([option]);XCTAssertFalse(button("aria.closeAnswer").exists)
        }
        physicalControls([exit]);shot("104-largest-question-list-bottom")
        exit.tap();ready(button("aria.closeAnswer"));shot("105-largest-question-list-left-without-choice",delay:4)
    }

    func test15LargestAnswerReadingScrollKeepsTheSameAnswerAndWholeControls() {
        launch("companion",contentSize:"UICTContentSizeCategoryAccessibilityXXXL");ask();answered()
        let lead=web.staticTexts[labels["fixtureGist"] as! String];ready(lead)
        let before=lead.frame.minY;shot("106-largest-reading-top",delay:2)
        let first=readingInk(top:before)
        for _ in 0..<6 {
            web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:(before+45)/app.frame.height)).press(forDuration:0.1,
                thenDragTo:web.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:(before+8)/app.frame.height)))
        }
        shot("107-largest-reading-bottom",delay:2)
        XCTAssertNotEqual(first,readingInk(top:before),"Reading text must actually move when dragged")
        ready(button("aria.closeAnswer"));physicalControls([button("aria.type"),button("aria.talk")],abovePill:false)
    }
    private func readingInk(top:CGFloat)->[UInt8] {
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        let scale=CGFloat(image.width)/app.frame.width;var ink:[UInt8]=[]
        for y in Int((top+4)*scale)..<min(image.height,Int((top+57)*scale)) {
            for x in Int(45*scale)..<Int((app.frame.width-45)*scale) {
                let i=y*image.bytesPerRow+x*4;ink.append(min(bytes[i],bytes[i+1],bytes[i+2])>180 ? 1:0)
            }
        }
        XCTAssertGreaterThan(ink.filter{$0==1}.count,100);return ink
    }

    func test16LargestQuestionInkNeverTouchesTheHorizontalClippingEdge() {
        launch("companion",memory:"barrier",contentSize:"UICTContentSizeCategoryAccessibilityXXXL");ask();answered();ready(chip());chip().tap()
        let title=((labels["catalog"] as! [String:[String:Any]])["barrier"]!["text"] as! String)
        let question=web.staticTexts[title];ready(question);shot("108-largest-question-whole-words",delay:2)
        let image=app.screenshot().image.cgImage!,data=image.dataProvider!.data!,bytes=CFDataGetBytePtr(data)!
        let scale=CGFloat(image.width)/app.frame.width,rect=question.frame,exit=web.buttons[copy("notNow")]
        let stageScale=min(app.frame.width/390,app.frame.height/844),columnRight=(app.frame.width+350*stageScale)/2
        XCTAssertLessThanOrEqual(rect.maxX,columnRight+1,"The full word exceeds the specified column")
        var right=0,count=0
        for y in max(0,Int(rect.minY*scale))..<min(image.height,Int(min(rect.maxY,exit.frame.minY-4)*scale)) {
            for x in max(0,Int(rect.minX*scale))..<min(image.width,Int(rect.maxX*scale)) {
                let i=y*image.bytesPerRow+x*4
                if min(bytes[i],bytes[i+1],bytes[i+2])>180 {right=max(right,x);count += 1}
            }
        }
        XCTAssertGreaterThan(count,100)
        XCTAssertLessThanOrEqual(CGFloat(right)/scale,columnRight-2,"A word is cut at the reading column edge")
    }

}
