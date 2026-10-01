import XCTest

/// App Review captures for the Bobby Pro subscription (Debug build; nothing is ever bought):
///   · the profile's Bobby Pro and Restore Purchases rows, in the real Núcleo (live server, signed out);
///   · the Bobby Pro sheet in its purchasable state: price and period from the App Store through
///     RevenueCat's Test Store, the renewal terms, Subscribe, Restore Purchases and the legal links.
///     The QA profile (`-qa-profile signed-in`, an in-memory session) plus `-qa-sales-open` (DEBUG only:
///     App Store sales taken as open without asking the server) give the signed-in look.
/// `TEST_RUNNER_BOBBY_SHOTS_DIR=/path xcodebuild test … -only-testing:BobbyUITests/ProReviewShots`
/// also writes the PNGs there at the device's native resolution.
final class ProReviewShots: XCTestCase {
    private let app = XCUIApplication()
    private let common = ["-agent.riskNoticeVersion", "5", "-AppleLanguages", "(en)", "-AppleLocale", "en_US",
                          "-companion.id", "momo", "-companion.selected.v2.local", "momo",
                          "-avatar.voiceMuted", "YES", "-nucleo.voiceMuteReset.v1", "YES"]

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    override func tearDown() {
        app.terminate()
        super.tearDown()
    }

    func testProfileProRows() {
        app.launchArguments = ["-nucleo-page", "app"] + common
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30), "Núcleo did not load")
        let avatar = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Account and progress")).firstMatch
        hittable(avatar, timeout: 30)
        avatar.tap()
        scrollTo(app.buttons["account-restore"])
        hittable(app.buttons["account-pro"])
        Thread.sleep(forTimeInterval: 1)
        save("bobby-profile-pro-rows")
    }

    func testPaywallPurchasable() {
        app.launchArguments = ["-qa-profile", "signed-in", "-qa-pieces", "12", "-qa-sales-open"] + common
        app.launch()
        let pro = app.buttons["account-pro"]
        scrollTo(pro)
        pro.tap()
        XCTAssertTrue(app.staticTexts["paywall-price"].waitForExistence(timeout: 30), "The App Store price never loaded")
        let subscribe = app.buttons["paywall-subscribe"]
        XCTAssertTrue(subscribe.waitForExistence(timeout: 10))
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: subscribe)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 15), .completed, "Subscribe stayed disabled")
        XCTAssertFalse(app.descendants(matching: .any)["paywall-unavailable"].exists, "no unavailable line")
        XCTAssertTrue(app.buttons["paywall-restore"].exists)
        Thread.sleep(forTimeInterval: 2)
        save("bobby-paywall-review")
    }

    private func scrollTo(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 30), "Missing \(element)")
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<8 where !element.isHittable { scroll.swipeUp() }
        hittable(element)
    }

    private func hittable(_ element: XCUIElement, timeout: TimeInterval = 20) {
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "Missing \(element)")
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: timeout), .completed, "Not hittable: \(element)")
    }

    private func save(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["BOBBY_SHOTS_DIR"], !dir.isEmpty {
            try? shot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }
}
