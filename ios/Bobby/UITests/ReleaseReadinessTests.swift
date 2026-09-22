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

    /// Avatar narration restores the preview step without opening an interactive call.
    func testAvatarVoiceStyleReturnsToOnboarding() {
        verifyAvatarOnboarding(spanish: false)
    }

    func testSpanishAvatarVoiceStyleReturnsToOnboarding() {
        verifyAvatarOnboarding(spanish: true)
    }

    private func verifyAvatarOnboarding(spanish: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-avatar.voiceMuted", "NO", "-AppleLanguages", spanish ? "(es)" : "(en)", "-agent.riskNoticeVersion", "3", "-agent.onboarded", "NO"]
        app.launch()
        let next = app.buttons["onboarding-next"]
        XCTAssertTrue(next.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["01 / 03"].exists)
        next.tap()
        XCTAssertTrue(app.staticTexts["02 / 03"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[spanish ? "BOBBY // PREPARANDO AURA" : "BOBBY // PREPPING AURA"].exists)
        XCTAssertFalse(app.buttons["avatar-vibe-chill"].exists, "Styles belong after the machine")
        if app.staticTexts[spanish ? "ESCANEANDO…" : "SCANNING…"].exists { XCTAssertFalse(next.isEnabled) }
        let forge = XCTAttachment(screenshot: app.screenshot())
        forge.name = spanish ? "forge-es-2-of-3" : "forge-en-2-of-3"
        forge.lifetime = .keepAlways
        add(forge)
        let ready = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: next)
        wait(for: [ready], timeout: 15)
        next.tap()
        XCTAssertTrue(app.staticTexts["03 / 03"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[spanish ? "BOBBY // SU VIBRA" : "BOBBY // THEIR VIBE"].exists)
        for vibe in ["chill", "directo", "pro"] {
            let style = app.buttons["avatar-vibe-\(vibe)"]
            XCTAssertTrue(style.exists)
            style.tap()
            XCTAssertTrue(style.isSelected)
        }
        let styles = XCTAttachment(screenshot: app.screenshot())
        styles.name = spanish ? "styles-es-3-of-3" : "styles-en-3-of-3"
        styles.lifetime = .keepAlways
        add(styles)
        XCTAssertFalse(app.buttons["ChatGPT"].exists)
        XCTAssertFalse(app.buttons["Live"].exists)
        next.tap()
        XCTAssertTrue(app.buttons["avatar-voice-toggle"].waitForExistence(timeout: 10))
    }

    func testDeskCanMuteAndRestoreAvatarNarration() {
        verifyAvatarMute(spanish: false)
    }

    func testSpanishDeskCanMuteAndRestoreAvatarNarration() {
        verifyAvatarMute(spanish: true)
    }

    private func verifyAvatarMute(spanish: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-avatar.voiceMuted", "NO", "-AppleLanguages", spanish ? "(es)" : "(en)", "-agent.riskNoticeVersion", "3", "-agent.onboarded", "YES"]
        app.launch()
        let toggle = app.buttons["avatar-voice-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 15))
        XCTAssertEqual(toggle.label, spanish ? "Silenciar voz del avatar" : "Mute avatar voice")
        toggle.tap()
        XCTAssertEqual(toggle.label, spanish ? "Activar voz del avatar" : "Enable avatar voice")
        toggle.tap()
        XCTAssertEqual(toggle.label, spanish ? "Silenciar voz del avatar" : "Mute avatar voice")
        XCTAssertFalse(app.buttons["ChatGPT"].exists)
        XCTAssertFalse(app.buttons["Live"].exists)
    }

    func testSquadSelectionSpeaksAndChangingAvatarStopsThePreviousVoice() {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-agent.riskNoticeVersion", "3", "-agent.onboarded", "YES",
                               "-companion.id", "byte", "-companion.disciplineXP", "1000", "-avatar.voiceMuted", "NO"]
        app.launch()
        let portrait = app.buttons["squad-portrait"]
        XCTAssertTrue(portrait.waitForExistence(timeout: 15))
        portrait.tap()
        let kora = app.descendants(matching: .any)["squad-rail-kora"]
        XCTAssertTrue(kora.waitForExistence(timeout: 10))
        kora.tap()
        XCTAssertTrue(app.staticTexts["squad-stage-ready"].waitForExistence(timeout: 20))
        app.buttons["PICK KORA"].tap()
        let avatar = app.descendants(matching: .any)["squad-avatar"].firstMatch
        let speaking = expectation(for: NSPredicate(format: "value == 'Speaking'"), evaluatedWith: avatar)
        wait(for: [speaking], timeout: 5)
        app.descendants(matching: .any)["squad-rail-byte"].tap()
        let stopped = expectation(for: NSPredicate(format: "value == 'Ready'"), evaluatedWith: app.descendants(matching: .any)["squad-avatar"].firstMatch)
        wait(for: [stopped], timeout: 5)
    }

    func testMuteChoiceSurvivesOnboardingGalleryAndRelaunch() {
        verifyPersistentMute(spanish: false)
    }

    func testSpanishMuteChoiceSurvivesOnboardingGalleryAndRelaunch() {
        verifyPersistentMute(spanish: true)
    }

    private func verifyPersistentMute(spanish: Bool) {
        let app = XCUIApplication()
        let language = ["-AppleLanguages", spanish ? "(es)" : "(en)", "-agent.riskNoticeVersion", "3"]
        let muted = spanish ? "Activar voz del avatar" : "Enable avatar voice"
        let audible = spanish ? "Silenciar voz del avatar" : "Mute avatar voice"
        app.launchArguments = language + ["-agent.onboarded", "NO", "-avatar.voiceMuted", "NO"]
        app.launch()
        let toggle = app.buttons["avatar-voice-toggle"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 15))
        toggle.tap()
        XCTAssertEqual(toggle.label, muted)
        let next = app.buttons["onboarding-next"]
        next.tap()
        XCTAssertTrue(app.staticTexts["02 / 03"].waitForExistence(timeout: 5))
        let ready = expectation(for: NSPredicate(format: "isEnabled == true"), evaluatedWith: next)
        wait(for: [ready], timeout: 15)
        next.tap()
        XCTAssertTrue(app.staticTexts["03 / 03"].waitForExistence(timeout: 5))
        app.buttons["avatar-vibe-pro"].tap()
        XCTAssertEqual(toggle.label, muted, "Changing style cannot turn the voice back on")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = spanish ? "onboarding-muted-es" : "onboarding-muted-en"
        shot.lifetime = .keepAlways
        add(shot)
        next.tap()
        XCTAssertTrue(app.buttons["squad-portrait"].waitForExistence(timeout: 10))
        XCTAssertEqual(toggle.label, muted)
        app.terminate()

        // Remove the launch override: this must read the saved preference.
        app.launchArguments = language + ["-agent.onboarded", "YES"]
        app.launch()
        XCTAssertTrue(toggle.waitForExistence(timeout: 15))
        XCTAssertEqual(toggle.label, muted)
        app.buttons["squad-portrait"].tap()
        XCTAssertTrue(app.buttons["squad-close"].waitForExistence(timeout: 10))
        let galleryToggle = app.buttons["squad-voice-toggle"]
        XCTAssertEqual(galleryToggle.label, muted)
        galleryToggle.tap()
        XCTAssertEqual(galleryToggle.label, audible)
        app.buttons["squad-close"].tap()
        XCTAssertEqual(toggle.label, audible)
        app.terminate()
        app.launch()
        XCTAssertTrue(toggle.waitForExistence(timeout: 15))
        XCTAssertEqual(toggle.label, audible, "Enabling voice is remembered too")
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
