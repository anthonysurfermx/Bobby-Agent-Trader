// The Squad sheet itself (MascotGalleryView), not the desk fixture: every
// companion must load on its stage, and a locked one must stay on show as a
// silver figure with its unlock target. Live 1.1 showed "Could not load the
// model" for the wave 2 companions right here. Uses the DEBUG `-qa-squad`
// fixture; the level comes from `-companion.disciplineXP` (argument domain).
import XCTest

final class SquadGalleryTests: XCTestCase {
    private let companions = [
        "orb", "byte", "kora", "zip", "glitch", "momo", "flux", "rook", "halo", "axiom",
        "iris", "sol", "zuri", "mira", "nalu", "vega", "noor", "keo",
    ]

    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    private func launch(select id: String, xp: Int) -> XCUIApplication {
        let app = XCUIApplication()
        // companion.id is pinned too: a pick saved on this simulator would make
        // the selected companion "yours" and hide its lock.
        app.launchArguments = ["-qa-squad", "-qa-select", id, "-companion.disciplineXP", "\(xp)",
                               "-companion.id", "qa-none",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        return app
    }

    private func waitForStage(_ app: XCUIApplication) -> (ready: Bool, failed: Bool) {
        let ready = app.staticTexts["squad-stage-ready"]
        let failed = app.staticTexts["squad-stage-failed"]
        let deadline = Date().addingTimeInterval(20)
        while Date() < deadline, !ready.exists, !failed.exists { usleep(200_000) }
        return (ready.exists, failed.exists)
    }

    /// Level 2 (90 XP): the matrix covers unlocked and locked (silver) stages.
    func testEveryCompanionLoadsInTheSquad() throws {
        for companion in companions {
            let app = launch(select: companion, xp: 90)
            let state = waitForStage(app)
            XCTAssertFalse(state.failed, "\(companion): the Squad stage could not load the model")
            XCTAssertTrue(state.ready, "\(companion): the Squad stage never finished loading")
            app.terminate()
        }
    }

    func testLockedCompanionShowsItsUnlockTarget() throws {
        let app = launch(select: "vega", xp: 90)   // VEGA needs level 3 = 150 XP
        XCTAssertTrue(waitForStage(app).ready, "vega: locked figure never loaded")
        XCTAssertTrue(app.descendants(matching: .any)["squad-locked-chip"].exists, "locked companion has no level chip")
        let progress = app.descendants(matching: .any)["squad-unlock-progress"]
        XCTAssertTrue(progress.exists, "locked companion has no unlock progress")
        XCTAssertTrue(progress.label.contains("60"), "expected 60 XP to go, got: \(progress.label)")
        XCTAssertTrue(app.descendants(matching: .any)["squad-rail-vega"].exists)

        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = "squad-locked-vega"
        attachment.lifetime = .keepAlways
        add(attachment)
        app.terminate()
    }

    /// Sign-out resets XP to 0 but keeps your companion: it stays yours, in colour.
    func testActiveCompanionIsNeverShownLocked() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-qa-squad", "-qa-select", "vega", "-companion.disciplineXP", "0",
                               "-companion.id", "vega",
                               "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(waitForStage(app).ready, "vega: never loaded")
        XCTAssertFalse(app.descendants(matching: .any)["squad-locked-chip"].exists)
        app.terminate()
    }

    func testUnlockedCompanionHasNoLock() throws {
        let app = launch(select: "zuri", xp: 90)
        XCTAssertTrue(waitForStage(app).ready, "zuri: never loaded")
        XCTAssertFalse(app.descendants(matching: .any)["squad-locked-chip"].exists)
        XCTAssertFalse(app.descendants(matching: .any)["squad-unlock-progress"].exists)
        app.terminate()
    }
}
