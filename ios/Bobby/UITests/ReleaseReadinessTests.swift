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

    /// The ordinary app path exposes exploration without a feature-enabling fixture flag.
    func testOrdinaryPracticeIslandCanZoomOutToTheArchipelago() {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-AppleLanguages", "(en)"]
        app.launch()
        XCTAssertTrue(app.buttons["land-archipelago"].waitForExistence(timeout: 10))
        for _ in 0..<4 { app.buttons["Zoom out"].tap() }
        XCTAssertTrue(app.descendants(matching: .any)["land-archipelago-card"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["land-share"].exists, "A guest cannot publish device-only practice progress")
        app.buttons["land-home-island"].tap()
        XCTAssertTrue(app.staticTexts["land-fixed-status"].waitForExistence(timeout: 5))
    }

    func testPracticeExplorationKeepsLocalProgressAndRequiresSignInToPublish() {
        verifyPracticeExploration(spanish: false)
    }

    func testSpanishPracticeExplorationKeepsLocalProgressAndRequiresSignInToPublish() {
        verifyPracticeExploration(spanish: true)
    }

    private func verifyPracticeExploration(spanish: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-land-neighbors-fixture", "-AppleLanguages", spanish ? "(es)" : "(en)"]
        app.launch()
        let status = app.staticTexts["land-fixed-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        let original = status.label
        for _ in 0..<4 { app.buttons[spanish ? "Alejar" : "Zoom out"].tap() }
        XCTAssertTrue(app.descendants(matching: .any)["land-archipelago-card"].waitForExistence(timeout: 5))
        let focused = app.staticTexts["land-focused-island"]
        XCTAssertEqual(focused.label, spanish ? "Tu isla de práctica" : "Your practice island")
        islandShot(app, spanish ? "archipelago-es" : "archipelago-en")
        app.buttons["land-next-island"].tap()
        XCTAssertEqual(focused.label, "Harbor of Patience")
        XCTAssertFalse(app.buttons["land-confirm"].exists)
        islandShot(app, spanish ? "visit-es" : "visit-en")
        app.buttons["land-publish-cta"].tap()
        XCTAssertTrue(app.staticTexts[spanish ? "Inicia sesión en la mesa para publicar. Tu isla de práctica se queda en este dispositivo." : "Sign in on the desk to publish. Your practice island stays on this device."].exists)
        XCTAssertFalse(app.buttons["land-publish"].exists)
        app.buttons["land-home-island"].tap()
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, original, "Exploring must not replace local progress")
    }

    func testAccountIslandCanSaveNamePublishShareAndBecomePrivate() {
        verifyIslandSharing(spanish: false)
    }

    func testSpanishAccountIslandCanSaveNamePublishShareAndBecomePrivate() {
        verifyIslandSharing(spanish: true)
    }

    /// Only the data is a fixture. Exploration and sharing use the same UI as Release.
    private func verifyIslandSharing(spanish: Bool) {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-trader-land-account-fixture", "-AppleLanguages", spanish ? "(es)" : "(en)"]
        app.launch()
        let status = app.staticTexts["land-fixed-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        let original = status.label
        let name = spanish ? "Puerto Calma" : "Quiet Harbor"
        let updated = spanish ? "Mi Archipiélago" : "My Archipelago"
        app.buttons["land-share"].tap()
        let field = app.textFields["land-island-name"]
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["land-share-link"].exists)
        field.tap(); field.typeText(name + "\n")
        tapIslandControl(app.buttons["land-save-name"], in: app)
        XCTAssertTrue(field.waitForNonExistence(timeout: 5))
        waitForIslandLabel(app.staticTexts["land-title"], name)

        app.buttons["land-share"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 5))
        XCTAssertEqual(field.value as? String, name)
        XCTAssertFalse(app.buttons["land-share-link"].exists, "Saving a private name must not publish")
        tapIslandControl(app.buttons["land-publish"], in: app)
        let link = app.buttons["land-share-link"]
        XCTAssertTrue(link.waitForExistence(timeout: 5))
        islandShot(app, spanish ? "share-island-es" : "share-island-en")
        field.tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: name.count) + updated + "\n")
        tapIslandControl(app.buttons["land-update-name"], in: app)
        XCTAssertTrue(link.exists, "Renaming a public island must not make it private")
        app.buttons["land-share-close"].tap()
        waitForIslandLabel(app.staticTexts["land-title"], updated)
        XCTAssertEqual(status.label, original, "Naming and publishing must preserve earned pieces")

        for _ in 0..<4 { app.buttons[spanish ? "Alejar" : "Zoom out"].tap() }
        let focused = app.staticTexts["land-focused-island"]
        XCTAssertTrue(focused.waitForExistence(timeout: 5))
        XCTAssertEqual(focused.label, updated)
        app.buttons["land-next-island"].tap()
        XCTAssertEqual(focused.label, "Harbor of Patience")
        app.buttons["land-home-island"].tap()
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, original)
        app.buttons["land-share"].tap()
        XCTAssertTrue(link.waitForExistence(timeout: 5))
        tapIslandControl(app.buttons["land-make-private"], in: app)
        XCTAssertTrue(link.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.buttons["land-publish"].exists)
        XCTAssertEqual(field.value as? String, updated)
        app.buttons["land-share-close"].tap()
        XCTAssertEqual(status.label, original)
        XCTAssertEqual(app.staticTexts["land-title"].label, updated)
    }

    private func tapIslandControl(_ element: XCUIElement, in app: XCUIApplication) {
        if !element.isHittable { app.swipeUp() }
        element.tap()
    }

    private func waitForIslandLabel(_ element: XCUIElement, _ label: String) {
        let match = expectation(for: NSPredicate(format: "label == %@", label), evaluatedWith: element)
        wait(for: [match], timeout: 5)
    }

    private func islandShot(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
