import XCTest
@testable import Bobby

/// The island's help opens by itself on the first visit to the island on a device, and only then.
final class TraderLandFirstVisitTests: XCTestCase {
    private var suite = ""
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suite = "trader-land-first-visit-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suite)
        defaults = nil
        super.tearDown()
    }

    func testOnlyTheFirstVisitClaimsTheHelp() {
        XCTAssertTrue(TraderLandFirstVisit.claim(defaults: defaults, scripted: false))
        XCTAssertFalse(TraderLandFirstVisit.claim(defaults: defaults, scripted: false))
        XCTAssertFalse(TraderLandFirstVisit.claim(defaults: defaults, scripted: false))
        XCTAssertTrue(defaults.bool(forKey: TraderLandFirstVisit.key))
    }

    /// A UI-test or screenshot launch neither opens the help nor spends the device's first visit.
    func testAScriptedLaunchNeverClaimsAndLeavesTheFlagUnset() {
        XCTAssertFalse(TraderLandFirstVisit.claim(defaults: defaults, scripted: true))
        XCTAssertNil(defaults.object(forKey: TraderLandFirstVisit.key))
        XCTAssertTrue(TraderLandFirstVisit.claim(defaults: defaults, scripted: false))
    }

    /// Every launch mode the UI suites use to reach the island, alone or combined.
    func testUITestAndScreenshotLaunchesAreScripted() {
        for flag in ["-trader-land-gate", "-trader-land-account-fixture", "-land-neighbors-fixture", "-store-shots", "-nucleo-fixtures"] {
            XCTAssertTrue(TraderLandFirstVisit.scripted(["Bobby", flag, "-AppleLanguages", "(en)"]), flag)
        }
        XCTAssertTrue(TraderLandFirstVisit.scripted(["Bobby", "-trader-land-gate", "-land-neighbors-fixture", "-community-safety-test-reset"]))
        XCTAssertFalse(TraderLandFirstVisit.scripted(["Bobby"]))
        XCTAssertFalse(TraderLandFirstVisit.scripted(["Bobby", "-AppleLanguages", "(es)", "-AppleLocale", "es_MX"]))
    }
}
