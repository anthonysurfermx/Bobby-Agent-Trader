import XCTest

/// T17: the preference opens from Bobby's chip; neither exit replays the answer.
final class SpeakingDialUITests: ConversationFixtureCase {
    private var testLanguage: String?
    override var language: String { testLanguage ?? super.language }
    func testSpanishDialAndPersistence() { testLanguage="es";exercise() }
    func testEnglishDialAndPersistence() { testLanguage="en";exercise() }
    func testInvitationDialReturnsSameAnswerInMatrixLanguage() { exercise() }
    private func exercise() {
        let w=(labels["companion"] as! [String:String]),tag=testLanguage.map { "explicit-"+$0+"-" } ?? ""
        launch("companion",memory:"dial");XCTAssertFalse(web.sliders.firstMatch.exists)
        ask();answered();let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",w["bobbyAsks"]!.components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);chip.tap();let save=web.buttons[dialCopy("save")],leave=web.buttons[dialCopy("leave")]
        ready(save);ready(leave);physicalControls([save,leave],abovePill:false);shot("57-\(tag)dial-from-chip")
        leave.tap();ready(button("aria.closeAnswer"));XCTAssertFalse(web.sliders.firstMatch.exists);shot("58-\(tag)dial-left-same-answer")
        app.terminate();launch("companion",memory:"dial");ask();answered();ready(chip);chip.tap();ready(save)
        let value=dialOption();let range=web.sliders.firstMatch;ready(range);dragDialToTechnical(range);XCTAssertEqual(range.value as? String,value);shot("59-\(tag)dial-preview")
        save.tap();ready(button("aria.closeAnswer"));XCTAssertFalse(web.sliders.firstMatch.exists);shot("60-\(tag)dial-saved-same-answer")
        app.terminate();launch("companion");XCTAssertFalse(web.sliders.firstMatch.exists);shot("61-\(tag)dial-no-wake-after-save")
    }
    private func dragDialToTechnical(_ range: XCUIElement) {
        // WebKit omits scrubber endpoints. Start on the real thumb, including a persisted choice.
        if range.value as? String == dialOption() {
            range.coordinate(withNormalizedOffset:CGVector(dx:0.95,dy:0.5)).press(forDuration:0.1,
                thenDragTo:range.coordinate(withNormalizedOffset:CGVector(dx:0.05,dy:0.5)))
            XCTAssertNotEqual(range.value as? String,dialOption())
        }
        range.coordinate(withNormalizedOffset: CGVector(dx:0.05,dy:0.5)).press(forDuration:0.1,
            thenDragTo:range.coordinate(withNormalizedOffset:CGVector(dx:0.95,dy:0.5)))
    }
    private func profileDial(_ capture: String = "66-profile-speaking-row") {
        openProfileFromGlass();let row=app.buttons["account-speaking"]
        for _ in 0..<8 where !row.isHittable { app.scrollViews.firstMatch.swipeUp() };ready(row)
        XCTAssertTrue(row.label.contains(["en":"How Bobby talks to you","es":"Cómo te habla Bobby","fr":"Comment Bobby te parle","pt":"Como o Bobby fala contigo","it":"Come ti parla Bobby","de":"Wie Bobby mit dir spricht"][language]!))
        physicalControls([row],abovePill:false);shot(capture);row.tap();ready(web.buttons[dialCopy("save")])
    }
    func testProfilePreferencePersistsAndReturnsTheSameAnswer() {
        launch("companion");ask();answered();profileDial()
        let range=web.sliders.firstMatch;ready(range);dragDialToTechnical(range);XCTAssertEqual(range.value as? String,dialOption())
        web.buttons[dialCopy("save")].tap();ready(button("aria.closeAnswer"));shot("67-profile-dial-saved-answer")
        app.terminate();launch("companion");profileDial("70-profile-speaking-persisted");XCTAssertEqual(web.sliders.firstMatch.value as? String,dialOption())
        web.buttons[dialCopy("leave")].tap();ready(button("aria.type"));shot("68-profile-dial-kept-after-restart",delay:4)
    }
    func testProfileSpeakingRowFollowsLargestAccessibilityType() {
        launch("companion",contentSize:"UICTContentSizeCategoryAccessibilityXXXL");profileDial("69-profile-speaking-largest-type")
        web.buttons[dialCopy("leave")].tap();ready(button("aria.type"))
    }
    private func dialCopy(_ key:String)->String {
        let save=["en":"Save","es":"Guardar","fr":"Enregistrer","pt":"Guardar","it":"Salva","de":"Speichern"]
        let leave=["en":"Leave as is","es":"Dejar como está","fr":"Laisser tel quel","pt":"Deixar como está","it":"Lascia così","de":"So lassen"]
        return (key == "save" ? save : leave)[language]!
    }
    private func dialOption()->String { ["en":"Technical","es":"Técnico","fr":"Technique","pt":"Técnico","it":"Tecnico","de":"Technisch"][language]! }
}
