import XCTest

/// T17: the preference opens from Bobby's chip; neither exit replays the answer.
final class SpeakingDialUITests: ConversationFixtureCase {
    override func setUpWithError() throws {
        try super.setUpWithError()
        throw XCTSkip("SPEC 5.10 deferred at the owner deadline; wake, invitation and Memory doors are disabled")
    }
    private var testLanguage: String?
    override var language: String { testLanguage ?? super.language }
    func testSpanishDialAndPersistence() { testLanguage="es";exercise() }
    func testEnglishDialAndPersistence() { testLanguage="en";exercise() }
    func testInvitationDialReturnsSameAnswerInMatrixLanguage() { exercise() }
    private func exercise() {
        let w=(labels["companion"] as! [String:String])
        launch("companion",memory:"dial");XCTAssertFalse(web.sliders.firstMatch.exists)
        ask();answered();let chip=web.buttons.matching(NSPredicate(format:"label BEGINSWITH %@",w["bobbyAsks"]!.components(separatedBy:"{question}")[0])).firstMatch
        ready(chip);chip.tap();let save=web.buttons[dialCopy("save")],leave=web.buttons[dialCopy("leave")]
        ready(save);ready(leave);physicalControls([save,leave],abovePill:false);shot("57-dial-from-chip")
        leave.tap();ready(button("aria.closeAnswer"));XCTAssertFalse(web.sliders.firstMatch.exists);shot("58-dial-left-same-answer")
        app.terminate();launch("companion",memory:"dial");ask();answered();ready(chip);chip.tap();ready(save)
        let value=dialOption();let range=web.sliders.firstMatch;ready(range);range.adjust(toNormalizedSliderPosition:1);XCTAssertEqual(range.value as? String,value);shot("59-dial-preview")
        save.tap();ready(button("aria.closeAnswer"));XCTAssertFalse(web.sliders.firstMatch.exists);shot("60-dial-saved-same-answer")
        app.terminate();launch("companion");XCTAssertFalse(web.sliders.firstMatch.exists);shot("61-dial-no-wake-after-save")
    }
    private func dialCopy(_ key:String)->String {
        let save=["en":"Save","es":"Guardar","fr":"Enregistrer","pt":"Guardar","it":"Salva","de":"Speichern"]
        let leave=["en":"Leave as is","es":"Dejar como está","fr":"Laisser tel quel","pt":"Deixar como está","it":"Lascia così","de":"So lassen"]
        return (key == "save" ? save : leave)[language]!
    }
    private func dialOption()->String { ["en":"Technical","es":"Técnico","fr":"Technique","pt":"Técnico","it":"Tecnico","de":"Technisch"][language]! }
}
