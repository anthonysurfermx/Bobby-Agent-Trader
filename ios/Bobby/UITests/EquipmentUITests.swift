import XCTest

/// Test-only XP is supplied by launch arguments; no account or server award is changed.
final class EquipmentUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }
    func testEnglishEquipmentChoices() { verify(spanish: false) }
    func testSpanishEquipmentChoices() { verify(spanish: true) }

    private func shot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways; add(attachment)
    }

    private func change(_ app: XCUIApplication, belt: String, item: String) {
        app.buttons[belt].tap()
        let toggle = app.buttons["equipment-toggle-\(item)"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        if !toggle.isHittable { app.swipeUp() }
        toggle.tap()
        XCTAssertTrue(toggle.waitForNonExistence(timeout: 5))
    }

    private func verify(spanish: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-store-shots", "-AppleLanguages", spanish ? "(es)" : "(en)", "-agent.riskNoticeVersion", "4", "-agent.onboarded", "YES", "-avatar.voiceMuted", "YES", "-companion.id", "momo", "-companion.disciplineXP", "500"]
        app.launch()
        let belt = "belt-tool-momo-2"
        let equipped = spanish ? "Equipado" : "Equipped"
        let stored = spanish ? "Guardado" : "Stored"
        XCTAssertTrue(app.buttons[belt].waitForExistence(timeout: 15))
        if app.buttons[belt].value as? String == stored { change(app, belt: belt, item: "momo-2") }
        XCTAssertEqual(app.buttons[belt].value as? String, equipped)
        shot(app, "momo-equipped-\(spanish ? "es" : "en")")
        app.buttons[belt].tap()
        let remove = app.buttons["equipment-toggle-momo-2"]
        XCTAssertTrue(remove.waitForExistence(timeout: 5))
        if !remove.isHittable { app.swipeUp() }
        XCTAssertTrue(remove.label.contains(spanish ? "QUITAR" : "UNEQUIP"))
        shot(app, "momo-equipment-control-\(spanish ? "es" : "en")")
        remove.tap()
        XCTAssertTrue(remove.waitForNonExistence(timeout: 5))
        XCTAssertEqual(app.buttons[belt].value as? String, stored)
        shot(app, "momo-without-binoculars-\(spanish ? "es" : "en")")
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons[belt].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons[belt].value as? String, stored)
        change(app, belt: belt, item: "momo-2")
        XCTAssertEqual(app.buttons[belt].value as? String, equipped)
        // The same option applies to pets, without changing their unlock state.
        let petBelt = "belt-pet-momo"
        if app.buttons[petBelt].value as? String == stored { change(app, belt: petBelt, item: "pet-momo") }
        change(app, belt: petBelt, item: "pet-momo")
        XCTAssertEqual(app.buttons[petBelt].value as? String, stored)
        change(app, belt: petBelt, item: "pet-momo")
        XCTAssertEqual(app.buttons[petBelt].value as? String, equipped)
        // The locker must change the same state as the belt.
        app.buttons["belt-plus"].tap()
        let tile = app.buttons["locker-box-momo-2"]
        XCTAssertTrue(tile.waitForExistence(timeout: 10))
        tile.tap()
        let lockerToggle = app.buttons["locker-see-worn"]
        XCTAssertTrue(lockerToggle.waitForExistence(timeout: 5))
        lockerToggle.tap()
        XCTAssertTrue(app.buttons[belt].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons[belt].value as? String, stored)
    }
}
