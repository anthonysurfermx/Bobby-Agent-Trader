import XCTest

/// Exercises the shipping Núcleo HTML and native privacy sheets. The offline URLProtocol
/// intercepts every HTTP(S) request; these tests neither sign in nor spend a desk quota.
final class NucleoPrivacyUITests: XCTestCase {
    private let app = XCUIApplication()
    private let firstStatement = "Allow AI processing of my questions."
    private let disclosureStart = "Bobby sends your question and market data to OpenAI or Anthropic"
    private let disclosureEnd = "You can withdraw AI consent here at any time."

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    override func tearDown() {
        app.terminate()
        super.tearDown()
    }

    /// Never pass -agent.onboarded: it launches the classic UI. A local starter skips the
    /// birth/picker animation without pretending that the full onboarding was completed.
    private func launch(page: String, riskVersion: Int? = nil, reset: Bool = false) {
        app.launchArguments = [
            "-nucleo-fixtures", "offline", "-nucleo-page", page,
            "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
            "-companion.id", "momo", "-companion.selected.v2.local", "momo",
            "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"
        ]
        if let riskVersion {
            app.launchArguments += ["-agent.riskNoticeVersion", String(riskVersion)]
        }
        if reset { app.launchArguments.append("-nucleo-reset-onboarding") }
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30), "Núcleo did not load")
        capture("nucleo-privacy-launch-\(page)-risk-\(riskVersion.map { String($0) } ?? "persisted")")
    }

    private var fullNotice: XCUIElement { app.webViews.buttons["Read the full notice"] }
    private var riskProfile: XCUIElement { app.webViews.buttons["Profile"] }
    private var homeProfile: XCUIElement {
        app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Account and progress")).firstMatch
    }
    private var disclosure: XCUIElement {
        app.webViews.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", disclosureStart)).firstMatch
    }
    // Animated captions are intentionally aria-hidden; the failure state's actionable chip
    // is exposed to AX. The screenshot records the accompanying offline explanation.
    private var failureRetry: XCUIElement { app.webViews.buttons["Try another question"] }

    private func waitUntilHittable(_ element: XCUIElement, timeout: TimeInterval = 20,
                                   file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Missing element: \(element)", file: file, line: line)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: timeout), .completed,
                       "Element stayed hidden or blocked: \(element)", file: file, line: line)
    }

    private func tapLocalQuestion() {
        let question = app.webViews.buttons.matching(
            NSPredicate(format: "label BEGINSWITH %@ AND label ENDSWITH %@", "How is ", " looking?")
        ).firstMatch
        waitUntilHittable(question)
        question.tap()
    }

    private func scrollTo(_ element: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(element.waitForExistence(timeout: 20), "Missing scroll target", file: file, line: line)
        let scroll = app.scrollViews.firstMatch
        XCTAssertTrue(scroll.exists, "Expected a native scroll view", file: file, line: line)
        for _ in 0..<7 {
            if element.isHittable { break }
            scroll.swipeUp()
        }
        waitUntilHittable(element, file: file, line: line)
    }

    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func withdrawalConfirmation() -> XCUIElement {
        let confirm = app.buttons["Withdraw consent"]
        waitUntilHittable(confirm)
        XCTAssertTrue(app.staticTexts["Stop AI processing?"].exists)
        let message = app.staticTexts.matching(NSPredicate(
            format: "label CONTAINS %@", "This does not delete your account or data already sent"
        )).firstMatch
        XCTAssertTrue(message.exists, "Withdrawal must explain that the account remains available")
        XCTAssertTrue(message.label.contains("use Profile to delete your account."))
        return confirm
    }

    private func cancelWithdrawal(_ confirm: XCUIElement) {
        let cancel = app.buttons["Cancel"]
        if cancel.exists && cancel.isHittable {
            cancel.tap()
        } else {
            // UIKit's popover presentation omits Cancel and exposes a dismiss region.
            // Choose an observed point in that region outside the popover itself.
            let dismiss = app.otherElements["PopoverDismissRegion"]
            XCTAssertTrue(dismiss.exists, "Expected the system popover dismissal surface")
            let popover = app.popovers.firstMatch
            XCTAssertTrue(popover.exists)
            let frame = dismiss.frame
            let offsets = [CGVector(dx: 0.05, dy: 0.12), CGVector(dx: 0.95, dy: 0.12),
                           CGVector(dx: 0.05, dy: 0.88), CGVector(dx: 0.95, dy: 0.88)]
            let outside = offsets.first { offset in
                let point = CGPoint(x: frame.minX + frame.width * offset.dx,
                                    y: frame.minY + frame.height * offset.dy)
                return frame.contains(point) && !popover.frame.contains(point)
            }
            guard let outside else { return XCTFail("No visible dismissal point outside the popover") }
            dismiss.coordinate(withNormalizedOffset: outside).tap()
        }
        let closed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: confirm)
        XCTAssertEqual(XCTWaiter.wait(for: [closed], timeout: 10), .completed,
                       "Cancelling must dismiss the confirmation without withdrawing consent")
    }

    func testOlderNoticeRequiresCompleteReadableDisclosureAndExplicitAgreement() {
        launch(page: "onboarding", riskVersion: 4, reset: true)
        tapLocalQuestion()
        waitUntilHittable(fullNotice)
        XCTAssertTrue(disclosure.waitForExistence(timeout: 20))
        XCTAssertTrue(disclosure.label.contains("OpenAI or Anthropic"))
        XCTAssertTrue(disclosure.label.contains("OpenAI or Microsoft for speech"))
        XCTAssertTrue(disclosure.label.contains("Dictation audio stays on your iPhone."))
        XCTAssertTrue(disclosure.label.hasSuffix(disclosureEnd), "The withdrawal sentence must not be truncated")

        // WebKit adds the ARIA role to the AX label ("...questions., region").
        let bodyRegion = app.webViews.otherElements.matching(
            NSPredicate(format: "label BEGINSWITH %@", firstStatement)
        ).firstMatch
        // ARIA regions are text containers, not controls. Their lack of an AX hit point
        // does not imply invisible copy; use on-screen geometry, and test real scrolling
        // only when the text overflows the region's viewport.
        XCTAssertTrue(bodyRegion.waitForExistence(timeout: 20), "The disclosure region must be exposed to AX")
        let viewport = bodyRegion.frame
        XCTAssertGreaterThan(viewport.width, 0)
        XCTAssertGreaterThan(viewport.height, 0)
        XCTAssertTrue(app.windows.firstMatch.frame.insetBy(dx: -2, dy: -2).contains(viewport),
                      "The disclosure viewport must be fully on screen")
        XCTAssertTrue(disclosure.frame.intersects(viewport), "The copy must be visibly inside its region")
        XCTAssertGreaterThanOrEqual(disclosure.frame.minX, viewport.minX - 2)
        XCTAssertLessThanOrEqual(disclosure.frame.maxX, viewport.maxX + 2)
        XCTAssertLessThanOrEqual(viewport.maxY, fullNotice.frame.minY + 2,
                                 "The notice link must remain below the disclosure")
        let originalY = disclosure.frame.minY
        let overflow = disclosure.frame.maxY - viewport.maxY
        if overflow > 2 {
            let start = bodyRegion.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85))
            let end = bodyRegion.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.15))
            start.press(forDuration: 0.05, thenDragTo: end)
            let requiredMovement = min(4, overflow / 2)
            let moved = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
                self.disclosure.exists && self.disclosure.frame.minY < originalY - requiredMovement
            }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [moved], timeout: 5), .completed,
                           "An overflowing disclosure must scroll independently")
            for _ in 0..<4 {
                if disclosure.frame.maxY <= viewport.maxY + 2 { break }
                start.press(forDuration: 0.05, thenDragTo: end)
            }
        } else {
            // System-font English fits this viewport. Require the whole text to be visibly
            // contained instead of requiring a scroll movement when there is no overflow.
            XCTAssertGreaterThanOrEqual(disclosure.frame.minY, viewport.minY - 2)
        }
        XCTAssertLessThanOrEqual(disclosure.frame.maxY, viewport.maxY + 2,
                                 "The final withdrawal sentence must fit or be reachable by scrolling")
        waitUntilHittable(fullNotice)
        capture("nucleo-risk-v5-disclosure-complete")

        let agree = app.webViews.buttons["I agree to the risk notice and AI processing"]
        waitUntilHittable(agree)
        agree.tap()
        XCTAssertTrue(fullNotice.isHittable, "A short tap must not accept AI processing")
        agree.press(forDuration: 1.8)
        waitUntilHittable(failureRetry, timeout: 30)
        XCTAssertFalse(fullNotice.isHittable, "The accepted notice should close")
        XCTAssertFalse(app.webViews.buttons["Open the risk notice"].isHittable,
                       "The failure must come after acceptance, not from a missing-consent refusal")

        // Remove the argument-domain v4 override: acceptance must persist v5 in the app domain.
        app.terminate()
        launch(page: "onboarding")
        tapLocalQuestion()
        waitUntilHittable(failureRetry, timeout: 30)
        XCTAssertFalse(fullNotice.isHittable, "An accepted current notice must not gate the next question")
        XCTAssertFalse(app.webViews.buttons["Open the risk notice"].isHittable,
                       "The persisted v5 consent was lost on relaunch")
        capture("nucleo-risk-v5-agreement-persisted")
    }

    func testWithdrawingConsentKeepsProfileAvailableAndPersistsAfterRelaunch() {
        launch(page: "app", riskVersion: 5, reset: true)
        waitUntilHittable(homeProfile)
        homeProfile.tap()
        let name = app.staticTexts["account-display-name"]
        XCTAssertTrue(name.waitForExistence(timeout: 20))
        let originalName = name.label

        let riskRow = app.buttons["account-risk"]
        scrollTo(riskRow)
        riskRow.tap()
        XCTAssertTrue(app.staticTexts["Read this once. It matters."].waitForExistence(timeout: 20))
        let first = app.buttons[firstStatement]
        XCTAssertTrue(first.exists, "The same AI notice must be accessible from Profile")
        let last = app.buttons["You can lose money. You decide."]
        scrollTo(last)
        capture("nucleo-profile-full-notice-bottom")

        let withdraw = app.buttons["risk-withdraw-consent"]
        waitUntilHittable(withdraw)
        withdraw.tap()
        let confirm = withdrawalConfirmation()
        capture("nucleo-ai-withdrawal-confirmation")
        cancelWithdrawal(confirm)
        waitUntilHittable(withdraw)
        withdraw.tap()
        withdrawalConfirmation().tap()

        // Also catches a stale native.sheet event leaving the web scene frozen after withdrawal.
        waitUntilHittable(homeProfile)
        homeProfile.tap()
        XCTAssertTrue(name.waitForExistence(timeout: 20))
        XCTAssertEqual(name.label, originalName, "Withdrawing AI consent must not reset the local companion")
        let privacy = app.descendants(matching: .any).matching(identifier: "account-privacy").firstMatch
        scrollTo(privacy)
        XCTAssertTrue(app.buttons["account-apple-sign-in"].exists,
                      "The guest account controls must remain available without AI consent")
        capture("nucleo-profile-after-ai-withdrawal")
        app.buttons["account-close"].tap()

        // This launch does not override riskVersion. A local question reaches RISK before any
        // analysis request. It covers persisted withdrawal and its Profile escape, not the
        // automatic onboardingRisk route of a previously completed onboarding or Apple login.
        app.terminate()
        launch(page: "onboarding")
        tapLocalQuestion()
        waitUntilHittable(fullNotice)
        waitUntilHittable(riskProfile)
        riskProfile.tap()
        XCTAssertTrue(name.waitForExistence(timeout: 20))
        XCTAssertEqual(name.label, originalName)
        scrollTo(privacy)
        capture("nucleo-risk-profile-without-ai-consent")
        app.buttons["account-close"].tap()
        waitUntilHittable(fullNotice)
        XCTAssertFalse(failureRetry.isHittable, "Opening Profile must not accept the notice or start an analysis")
    }
}
