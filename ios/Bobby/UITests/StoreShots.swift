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

    /// Fresh install → companion-first onboarding (choose, vibe, pact) →
    /// desk with the chosen companion → SQUAD gallery. Uninstall the app
    /// before running for a clean slate.
    func test01_OnboardingAndCompanion() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-store-shots"]
        app.launch()

        // 01 — choose your companion (3D stage + roster)
        let cta = app.staticTexts["MAKE IT MY COMPANION"]
        XCTAssertTrue(cta.waitForExistence(timeout: 15))
        sleep(7)   // let the GLB stage settle
        shot("01-choose-companion")

        // Meet another one, come back to BYTE (its select line plays)
        let kora = app.buttons["KORA"].firstMatch
        if kora.waitForExistence(timeout: 3) {
            kora.tap()
            sleep(4)
            shot("02-companion-kora")
        }
        let byte = app.buttons["BYTE"].firstMatch
        if byte.waitForExistence(timeout: 3) {
            byte.tap()
            sleep(3)
        }
        tapLabeled(app, "MAKE IT MY COMPANION")

        // 03 — vibe, heard in the companion's own voice
        XCTAssertTrue(app.staticTexts["NEXT"].waitForExistence(timeout: 8))
        sleep(1)
        shot("03-vibe")
        tapLabeled(app, "NEXT")

        // 04 — the pact
        XCTAssertTrue(app.staticTexts["OPEN THE DESK"].waitForExistence(timeout: 8))
        sleep(1)
        shot("04-pact")
        tapLabeled(app, "OPEN THE DESK")

        // 05 — desk with the living companion (chosen in onboarding)
        sleep(10)
        shot("05-desk-companion")

        // 06 — SQUAD gallery
        let portrait = app.buttons["squad-portrait"]
        XCTAssertTrue(portrait.waitForExistence(timeout: 8))
        portrait.tap()
        sleep(8)
        shot("06-squad")
        let close = app.buttons["squad-close"]
        if close.waitForExistence(timeout: 4) { close.tap() }
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
