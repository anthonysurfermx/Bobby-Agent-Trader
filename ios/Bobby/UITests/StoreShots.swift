// App Store screenshot rig. Drives the real app on a real backend and saves
// full-resolution screenshots as XCTest attachments; extract them from the
// .xcresult with `xcresulttool`. Run on an EN-language 6.9" simulator:
//   xcodebuild test -scheme Bobby -only-testing:BobbyUITests/StoreShots/test01_OnboardingAndCompanion ...
//   (seed discipline XP via PlistBuddy between test 01 and test 02)
import XCTest

final class StoreShots: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func tapLabeled(_ app: XCUIApplication, _ label: String) {
        if app.buttons[label].firstMatch.waitForExistence(timeout: 4) {
            app.buttons[label].firstMatch.tap()
        } else if app.staticTexts[label].firstMatch.waitForExistence(timeout: 4) {
            app.staticTexts[label].firstMatch.tap()
        } else {
            XCTFail("No element labeled \(label)")
        }
    }

    /// Fresh install → onboarding (aura, voice, vibe, name) → desk → SQUAD →
    /// pick a companion. Uninstall the app before running for a clean slate.
    func test01_OnboardingAndCompanion() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-store-shots"]
        app.launch()

        // 01 — aura forge
        let forge = app.staticTexts["FORGE AURA"]
        XCTAssertTrue(forge.waitForExistence(timeout: 12))
        sleep(2)
        shot("01-forge-aura")
        forge.press(forDuration: 1.9)

        // 02 — warm voice personas
        XCTAssertTrue(app.staticTexts["Give it a voice"].waitForExistence(timeout: 8))
        sleep(1)
        shot("02-voice-personas")
        tapLabeled(app, "NEXT")

        // 03 — vibe
        XCTAssertTrue(app.staticTexts["What is its vibe?"].waitForExistence(timeout: 8))
        sleep(1)
        shot("03-vibe")
        tapLabeled(app, "NEXT")

        // 04 — name + disclaimer, then open the desk
        XCTAssertTrue(app.staticTexts["Name it"].waitForExistence(timeout: 8))
        sleep(1)
        let nameField = app.textFields.firstMatch
        if nameField.waitForExistence(timeout: 4) {
            nameField.typeText("BOBBY")
        }
        shot("04-name")
        tapLabeled(app, "OPEN THE DESK")

        // 05 — fresh desk (aura portrait, no companion yet)
        sleep(6)
        shot("05-desk-fresh")

        // 06 — SQUAD gallery (give the 3D squad time to load)
        let portrait = app.buttons["squad-portrait"]
        XCTAssertTrue(portrait.waitForExistence(timeout: 8))
        portrait.tap()
        sleep(8)
        shot("06-squad")

        // Pick BYTE if its card is visible, else keep the focused one
        let byte = app.staticTexts["BYTE"].firstMatch
        if byte.waitForExistence(timeout: 3) {
            byte.tap()
            sleep(3)
        }
        shot("07-companion-detail")
        tapLabeled(app, "MAKE IT MY COMPANION")
        sleep(4)

        // 08 — back on the desk with the living companion
        let close = app.buttons["squad-close"]
        if close.waitForExistence(timeout: 4) { close.tap() }
        sleep(10)
        shot("08-desk-companion")
    }

    /// Ask a real question and capture verdict + (if XP was seeded just under
    /// a level boundary) the evolution overlay.
    func test02_VerdictAndEvolution() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-store-shots"]
        app.launch()

        let ask = app.textFields["ask-field"]
        XCTAssertTrue(ask.waitForExistence(timeout: 15))
        sleep(4)
        ask.tap()
        ask.typeText("bitcoin\n")

        // The desk answers with live data; evolution fires right after the award.
        let evolved = app.staticTexts["EVOLVED"]
        if evolved.waitForExistence(timeout: 90) {
            sleep(2)
            shot("10-evolution")
            tapLabeled(app, "CONTINUE")
            sleep(2)
        }
        shot("09-verdict")
    }
}
