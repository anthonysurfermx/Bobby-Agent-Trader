// Every companion must render as its 3D model on iOS — on the desk stage and
// in the large preview. Live 1.1 shipped eight Draco GLBs that GLTFKit2 cannot
// decode, so the desk fell back to a placeholder; this matrix catches that.
// Uses the DEBUG `-qa-skin` fixture (GearSkinQAFixtureView), which flags a
// load failure as `qa-skin-failed`.
import XCTest

final class CompanionLoadTests: XCTestCase {
    /// One entry per GLB in Resources/Mascots.
    private let companions = [
        "orb", "byte", "kora", "zip", "glitch", "momo", "flux", "rook", "halo", "axiom",
        "iris", "keo", "mira", "nalu", "noor", "sol", "vega", "zuri",
    ]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    func testEveryCompanionModelLoads() throws {
        for companion in companions {
            let app = XCUIApplication()
            app.launchArguments = ["-qa-skin", "-qa-companion", companion, "-qa-item", "full",
                                   "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
            app.launch()
            let ready = app.staticTexts["qa-skin-ready"]
            let failed = app.staticTexts["qa-skin-failed"]
            let deadline = Date().addingTimeInterval(20)
            while Date() < deadline, !ready.exists, !failed.exists { usleep(200_000) }
            XCTAssertFalse(failed.exists, "\(companion): the 3D model failed to load")
            XCTAssertTrue(ready.exists, "\(companion): the 3D model never finished loading")
            app.terminate()
        }
    }
}
