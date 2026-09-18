import XCTest

/// The desk's harvest card and Trader Land chip stay addressable by identifier
/// (DEBUG `-qa-harvest` root): the card is a container, not a label that
/// overwrites its buttons' own identifiers.
final class DeskHarvestCardTests: XCTestCase {
    private func launch(_ state: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-qa-harvest", state, "-AppleLanguages", "(en)"]
        app.launch()
        return app
    }

    func testSignedOutCardKeepsItsButtonIdentifiers() {
        let app = launch("signedout")
        XCTAssertTrue(app.otherElements["desk-harvest"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["harvest-primary"].label, "Save progress")
        XCTAssertEqual(app.buttons["harvest-secondary"].label, "See Trader Land")
        XCTAssertEqual(app.buttons.matching(identifier: "desk-harvest").count, 0)
    }

    func testBloomedCardOffersBuildIt() {
        let app = launch("bloomed")
        let build = app.buttons["harvest-primary"]
        XCTAssertTrue(build.waitForExistence(timeout: 10))
        XCTAssertTrue(build.label.hasPrefix("Build it"), build.label)
        XCTAssertFalse(app.buttons["harvest-secondary"].exists)
    }

    func testCappedCardOpensTheIsland() {
        let app = launch("capped")
        let open = app.buttons["harvest-secondary"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        XCTAssertEqual(open.label, "Open my island")
        XCTAssertFalse(app.buttons["harvest-primary"].exists)
    }

    func testChipCarriesItsBadge() {
        let app = launch("seed")
        let chip = app.buttons.matching(identifier: "desk-land").firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        XCTAssertEqual(chip.label, "Trader Land")
        XCTAssertEqual(chip.value as? String, "2 waiting for you")
    }
}
