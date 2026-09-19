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

    // MARK: Horizon choice (Growth v1)

    private func anything(_ app: XCUIApplication, containing text: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }

    func testPickerAsksBeforeGrowingTheSeed() {
        let app = launch("picker")
        let day = app.buttons["harvest-horizon-24h"]
        let threeDays = app.buttons["harvest-horizon-3d"]
        let week = app.buttons["harvest-horizon-7d"]
        XCTAssertTrue(threeDays.waitForExistence(timeout: 10))
        // Planted at 24 h: that chip is the seed's own, only upward ones are open.
        XCTAssertTrue(day.isSelected)
        XCTAssertFalse(day.isEnabled)
        XCTAssertTrue(threeDays.isEnabled)
        XCTAssertTrue(week.isEnabled)
        // VoiceOver hears the footprint as words, never "2 multiplied by 1".
        XCTAssertTrue(threeDays.label.hasPrefix("3\u{00A0}days · building 2 by 1"), threeDays.label)
        XCTAssertTrue(threeDays.label.contains("Double Gate"), threeDays.label)
        XCTAssertTrue(week.label.contains("landmark 2 by 2"), week.label)
        XCTAssertFalse(app.buttons["harvest-horizon-confirm"].exists, "nothing is sent without a confirmation")

        threeDays.tap()
        let confirm = app.buttons["harvest-horizon-confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        // The contract's verb on every client; the horizon never wraps inside itself.
        XCTAssertEqual(confirm.label, "Extend to 3\u{00A0}days")
        XCTAssertTrue(anything(app, containing: "You can't shorten it later.").exists)
        XCTAssertEqual(app.buttons["harvest-horizon-cancel"].label, "Keep 24\u{00A0}h")
        XCTAssertEqual(threeDays.value as? String, "Waiting for confirmation", "the pending choice is spoken, not only dashed")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = "harvest-picker-confirm"
        shot.lifetime = .keepAlways
        add(shot)

        // Cancel keeps the seed as it is.
        app.buttons["harvest-horizon-cancel"].tap()
        XCTAssertTrue(confirm.waitForNonExistence(timeout: 5))
        XCTAssertTrue(day.isSelected)
    }

    func testConfirmedHorizonBecomesTheSeeds() {
        let app = launch("picker")
        let threeDays = app.buttons["harvest-horizon-3d"]
        XCTAssertTrue(threeDays.waitForExistence(timeout: 10))
        threeDays.tap()
        let confirm = app.buttons["harvest-horizon-confirm"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        // The fixture answers like the server: the seed now blooms into the building in 3 days.
        XCTAssertTrue(confirm.waitForNonExistence(timeout: 5))
        XCTAssertTrue(anything(app, containing: "review this thesis in 3\u{00A0}days").waitForExistence(timeout: 5))
        XCTAssertTrue(threeDays.isSelected)
        XCTAssertFalse(app.buttons["harvest-horizon-24h"].isEnabled, "a horizon cannot shrink")
        XCTAssertTrue(app.buttons["harvest-horizon-7d"].isEnabled)
    }

    func testGrownSeedsNameTheirHorizon() {
        var app = launch("seed-3d")
        XCTAssertTrue(app.buttons["harvest-horizon-3d"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["harvest-horizon-3d"].isSelected)
        XCTAssertFalse(app.buttons["harvest-horizon-24h"].isEnabled)
        XCTAssertTrue(app.buttons["harvest-horizon-7d"].isEnabled)
        XCTAssertTrue(anything(app, containing: "in 3\u{00A0}days").exists)
        app.terminate()

        app = launch("seed-7d")
        XCTAssertTrue(app.buttons["harvest-horizon-7d"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["harvest-horizon-7d"].isSelected)
        XCTAssertFalse(app.buttons["harvest-horizon-24h"].isEnabled)
        XCTAssertFalse(app.buttons["harvest-horizon-3d"].isEnabled)
        XCTAssertTrue(anything(app, containing: "in 7\u{00A0}days").exists)
    }

    func testNoTradeAndOlderServersShowNoPicker() {
        var app = launch("bloomed")
        XCTAssertTrue(app.buttons["harvest-primary"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["harvest-horizon-24h"].exists)
        app.terminate()
        // A seed from a server before Growth v1: planted at 24 h, nothing to choose.
        app = launch("seed")
        XCTAssertTrue(app.buttons["harvest-primary"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["harvest-horizon-3d"].exists)
        XCTAssertTrue(anything(app, containing: "in 24\u{00A0}h").exists)
    }

    func testAReviewThatOpenedLocksTheChoice() {
        // The server said extendable at grant time; the review opened since: nothing to send.
        let app = launch("review-open")
        let threeDays = app.buttons["harvest-horizon-3d"]
        XCTAssertTrue(threeDays.waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["harvest-horizon-24h"].isSelected)
        XCTAssertFalse(threeDays.isEnabled)
        XCTAssertFalse(app.buttons["harvest-horizon-7d"].isEnabled)
    }

    func testTheChoiceLocksWhenTheReviewOpensOnScreen() {
        // Its review opens 6 s after launch, with the confirm step up if the card was quick enough.
        let app = launch("picker-closing")
        let threeDays = app.buttons["harvest-horizon-3d"]
        XCTAssertTrue(threeDays.waitForExistence(timeout: 10))
        if threeDays.isEnabled { threeDays.tap() }
        let locked = expectation(for: NSPredicate(format: "isEnabled == false"), evaluatedWith: threeDays)
        wait(for: [locked], timeout: 15)
        XCTAssertFalse(app.buttons["harvest-horizon-7d"].isEnabled)
        XCTAssertFalse(app.buttons["harvest-horizon-confirm"].exists, "no confirmation for a horizon that is set")
    }

    func testChipCarriesItsBadge() {
        let app = launch("seed")
        let chip = app.buttons.matching(identifier: "desk-land").firstMatch
        XCTAssertTrue(chip.waitForExistence(timeout: 10))
        XCTAssertEqual(chip.label, "Trader Land")
        XCTAssertEqual(chip.value as? String, "2 waiting for you")
    }
}
