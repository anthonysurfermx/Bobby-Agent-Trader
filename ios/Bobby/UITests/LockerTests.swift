// The desk's "+" locker (SquadLockerSheet) through its DEBUG fixture:
// `-qa-locker -qa-locker-fresh -companion.id <id> -companion.disciplineXP <n>`.
// Screenshots are kept as attachments for review.
import XCTest

final class LockerTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = true
    }

    private func launch(xp: Int, own: String = "kora", fresh: Bool = true, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-qa-locker"] + (fresh ? ["-qa-locker-fresh"] : []) +
            ["-companion.id", own, "-companion.disciplineXP", "\(xp)",
             "-AppleLanguages", "(en)", "-AppleLocale", "en_US"] + extra
        app.launch()
        return app
    }

    private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id]
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func waitReady(_ app: XCUIApplication, _ id: String, timeout: TimeInterval = 8) -> Bool {
        let ready = element(app, "locker-stage-\(id)-ready")
        let failed = element(app, "locker-stage-\(id)-failed")
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline, !ready.exists, !failed.exists { usleep(200_000) }
        XCTAssertFalse(failed.exists, "\(id): the locker stage could not load the model")
        return ready.exists
    }

    func testOpensOnYourCompanionWithTheRealCount() {
        let app = launch(xp: 130)
        XCTAssertTrue(element(app, "locker-page-kora").waitForExistence(timeout: 8))
        XCTAssertTrue(element(app, "locker-own-chip").exists)
        XCTAssertEqual(element(app, "locker-counter").label, "24 of 72 earned")
        XCTAssertTrue(waitReady(app, "kora"))
        sleep(1)
        shot("locker-01-own-kora")
        app.terminate()
    }

    func testCounterAcrossTheLadder() {
        for (xp, owned) in [(0, 0), (150, 30), (200, 45), (1000, 72)] {
            let app = launch(xp: xp)
            XCTAssertTrue(element(app, "locker-counter").waitForExistence(timeout: 8))
            XCTAssertEqual(element(app, "locker-counter").label, "\(owned) of 72 earned", "at \(xp) XP")
            if xp == 1000 { sleep(2); shot("locker-02-max-level") }
            app.terminate()
        }
    }

    func testLockedCompanionShowsSilverAndItsPrice() {
        let app = launch(xp: 130)
        let strip = element(app, "locker-strip-vega")
        XCTAssertTrue(strip.waitForExistence(timeout: 8))
        // VEGA sits far right on the strip: scroll it into reach first.
        var swipes = 0
        let screenRight = app.windows.firstMatch.frame.maxX
        while strip.frame.maxX > screenRight - 8, swipes < 6 {
            app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.8, dy: 0.93))
                .press(forDuration: 0.05, thenDragTo: app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.93)))
            swipes += 1
        }
        strip.tap()
        let chip = element(app, "locker-lock-chip")
        XCTAssertTrue(chip.waitForExistence(timeout: 4))
        XCTAssertTrue(chip.label.contains("20"), "VEGA needs 20 more XP for level 3, got: \(chip.label)")
        XCTAssertTrue(element(app, "locker-box-vega-2").value as? String == "level 3 first, 20 XP to go")
        XCTAssertTrue(waitReady(app, "vega"))
        sleep(1)
        shot("locker-03-locked-vega")
        app.terminate()
    }

    func testTappingABoxShowsThePiece() {
        let app = launch(xp: 130)
        XCTAssertTrue(waitReady(app, "kora"))
        element(app, "locker-box-kora-2").tap()
        XCTAssertTrue(element(app, "locker-showcase").waitForExistence(timeout: 3))
        XCTAssertTrue(element(app, "locker-see-worn").exists, "your own owned gear can be seen worn")
        sleep(1)
        shot("locker-04-owned-piece")

        element(app, "locker-box-kora-3").tap()
        XCTAssertTrue(element(app, "locker-showcase").waitForExistence(timeout: 3))
        XCTAssertFalse(element(app, "locker-see-worn").exists, "a locked piece cannot be worn")
        usleep(300_000)
        shot("locker-05-locked-golden-colour-peek")
        sleep(2)
        shot("locker-06-locked-golden-silver")
        app.terminate()
    }

    func testSwipingTheWholeSquadKeepsThreeLiveModelsAtMost() {
        let app = launch(xp: 130)
        XCTAssertTrue(waitReady(app, "kora"))
        let order = ["kora", "orb", "byte", "zip", "iris", "sol", "zuri", "mira", "nalu", "keo",
                     "glitch", "momo", "flux", "rook", "vega", "halo", "noor", "axiom"]
        for id in order.dropFirst() {
            element(app, "locker-next").tap()
            XCTAssertTrue(waitReady(app, id, timeout: 6), "\(id) never loaded on its page")
            for n in 4...8 { XCTAssertFalse(element(app, "locker-live-\(n)").exists, "\(n) live SCNViews at \(id)") }
        }
        shot("locker-07-last-page-axiom")
        app.terminate()
    }

    func testANewDropIsFlagged() {
        // Seen = only KORA's first piece; KORA's second piece is owned at 130 XP, so it is new.
        let app = launch(xp: 130, fresh: false, extra: ["-locker.seen.v1", "kora-1"])
        let box = element(app, "locker-box-kora-2")
        XCTAssertTrue(box.waitForExistence(timeout: 8))
        XCTAssertEqual(box.value as? String, "new")
        XCTAssertTrue((element(app, "locker-strip-kora").value as? String ?? "").contains("new"))
        app.terminate()
    }
}
