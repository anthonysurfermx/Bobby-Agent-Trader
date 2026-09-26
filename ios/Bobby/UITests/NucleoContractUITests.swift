import XCTest

/// Acceptance A2 (Nucleo/ARCHITECTURE.md §6.2): the executable bridge contract, run by the app's
/// own native bridge in fixture mode. No request leaves the process and no desk quota is spent.
final class NucleoContractUITests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    /// The contract page's summary line once every row ran ("PASS · 13 passed · 0 failed · 1 skipped").
    private func runContract(_ extra: [String], name: String) -> String {
        let app = XCUIApplication()
        app.launchArguments = ["-nucleo-fixtures", "-nucleo-page", "contract", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] + extra
        app.launch()
        let summary = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'PASS ·' OR label BEGINSWITH 'FAIL ·'")).firstMatch
        XCTAssertTrue(summary.waitForExistence(timeout: 150), "the contract never finished")
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
        let label = summary.label
        if !label.hasPrefix("PASS") {
            // The failing rows, for the report.
            let rows = app.staticTexts.allElementsBoundByIndex.map(\.label).filter { !$0.isEmpty }
            add(XCTAttachment(string: rows.joined(separator: "\n")))
        }
        app.terminate()
        return label
    }

    func testContractPassesOnTheNativeBridge() {
        let label = runContract([], name: "nucleo-contract-native")
        XCTAssertTrue(label.hasPrefix("PASS"), label)
    }

    /// A fresh onboarding: the risk gate row runs (ask before acceptance never reaches the network).
    func testContractPassesAfterAnOnboardingReset() {
        let label = runContract(["-nucleo-reset-onboarding"], name: "nucleo-contract-native-reset")
        XCTAssertTrue(label.hasPrefix("PASS"), label)
        XCTAssertTrue(label.contains("0 skipped"), "the risk gate row must run after a reset: \(label)")
    }
}
