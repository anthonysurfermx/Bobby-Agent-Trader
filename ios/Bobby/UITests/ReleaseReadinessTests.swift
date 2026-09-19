import XCTest

final class ReleaseReadinessTests: XCTestCase {
    func testAIConsentIsRequiredBeforeEnteringDesk() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-agent.riskNoticeVersion", "0", "-agent.onboarded", "YES"]
        app.launch()
        let consent = app.buttons["Allow AI processing of my questions."]
        XCTAssertTrue(consent.waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["ACKNOWLEDGE ALL FOUR"].isEnabled)
        consent.tap()
        app.buttons["Not investment advice."].tap()
        app.buttons["Bobby never touches your money."].tap()
        XCTAssertFalse(app.buttons["ACKNOWLEDGE ALL FOUR"].isEnabled)
        let risk = app.buttons["You can lose money. You decide."]
        if !risk.isHittable { app.swipeUp() }
        risk.tap()
        let enter = app.buttons["I UNDERSTAND. LET ME IN"]
        XCTAssertTrue(enter.isEnabled)
        enter.tap()
        XCTAssertTrue(consent.waitForNonExistence(timeout: 5))
    }

    /// The text-only release has no voice: onboarding never asks how the companion should talk.
    func testTextOnlyOnboardingHasNoVoiceStyleStep() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-agent.riskNoticeVersion", "3", "-agent.onboarded", "NO"]
        app.launch()
        let pick = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PICK '")).firstMatch
        XCTAssertTrue(pick.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["01 / 02"].exists, "two beats: choose, then the aura forge")
        pick.tap()
        XCTAssertTrue(app.staticTexts["02 / 02"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["NEXT"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'talk to you'")).firstMatch.exists)
    }

    func testOrdinaryIslandDoesNotExposePublicGallery() {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-AppleLanguages", "(en)"]
        app.launch()
        XCTAssertTrue(app.buttons["How to play"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["land-archipelago"].exists)
        XCTAssertFalse(app.buttons["land-publish-cta"].exists)
    }

    // MARK: The account island on the Release path (public worlds off)

    /// The account fixture with `-trader-land-release-island`: the same switches as a Release build,
    /// on an island published before public worlds were turned off (`-trader-land-fixture-public`).
    private func launchReleaseIsland() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-trader-land-account-fixture", "-trader-land-release-island",
                               "-trader-land-fixture-public", "-AppleLanguages", "(en)"]
        app.launch()
        XCTAssertTrue(app.staticTexts["land-fixed-status"].waitForExistence(timeout: 10))
        return app
    }

    private func openIslandSettings(_ app: XCUIApplication) {
        let settings = app.buttons["land-share"]
        XCTAssertEqual(settings.label, "Island settings", "never \"Share your island\" in Release")
        settings.tap()
        XCTAssertTrue(app.staticTexts["Saving keeps this island private."].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["Publish island"].exists)
        XCTAssertFalse(app.buttons["Update name"].exists)
        XCTAssertFalse(app.buttons["land-share-archipelago"].exists)
    }

    private func waitForLabel(_ element: XCUIElement, _ label: String) {
        let match = expectation(for: NSPredicate(format: "label == %@", label), evaluatedWith: element)
        wait(for: [match], timeout: 5)
    }

    /// No archipelago: zooming out stops at 70 % on your own island, and saving a name
    /// (`renamePrivate`) keeps a published island private.
    func testReleaseAccountIslandHasNoSeaAndSavingANameKeepsItPrivate() {
        let app = launchReleaseIsland()
        XCTAssertFalse(app.buttons["land-archipelago"].exists)
        let zoom = app.buttons["land-zoom"]
        XCTAssertEqual(zoom.value as? String, "100%")
        for _ in 0..<6 { app.buttons["Zoom out"].tap() }
        XCTAssertEqual(zoom.value as? String, "70%", "the Release minimum zoom")
        XCTAssertTrue(app.staticTexts["land-fixed-status"].exists, "still your island, not the sea")
        XCTAssertFalse(app.descendants(matching: .any)["land-archipelago-card"].exists)
        XCTAssertFalse(app.staticTexts["land-focused-island"].exists)

        openIslandSettings(app)
        XCTAssertTrue(app.buttons["Make private"].exists, "a published island can be taken back")
        let name = app.textFields["Island name"]
        name.tap()
        name.typeText("Quiet Harbor\n")
        app.buttons["Save name"].tap()
        XCTAssertTrue(app.staticTexts["Saving keeps this island private."].waitForNonExistence(timeout: 5))
        waitForLabel(app.staticTexts["land-title"], "Quiet Harbor")

        // Saving the name made it private: the sheet keeps the name and no longer offers Make private.
        openIslandSettings(app)
        XCTAssertEqual(app.textFields["Island name"].value as? String, "Quiet Harbor")
        XCTAssertFalse(app.buttons["Make private"].exists)
    }

    /// "Make private" in Island settings takes back an island published before public worlds were off.
    func testReleaseIslandSettingsMakeAPublishedIslandPrivate() {
        let app = launchReleaseIsland()
        openIslandSettings(app)
        let makePrivate = app.buttons["Make private"]
        XCTAssertTrue(makePrivate.exists)
        makePrivate.tap()
        XCTAssertTrue(makePrivate.waitForNonExistence(timeout: 5))
        // Drag the sheet away: the notice waits on the island underneath.
        let hint = app.staticTexts["Saving keeps this island private."]
        hint.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.99)))
        XCTAssertTrue(hint.waitForNonExistence(timeout: 5))
        let notice = app.staticTexts["land-notice"]
        XCTAssertTrue(notice.waitForExistence(timeout: 5))
        XCTAssertEqual(notice.label, "Your island is private again.")
        XCTAssertEqual(app.staticTexts["land-title"].label, "Trader Land", "no name was given")
    }
}
