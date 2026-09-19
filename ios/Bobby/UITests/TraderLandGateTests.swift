import XCTest

final class TraderLandGateTests: XCTestCase {
    private func tapTile(_ app: XCUIApplication, col: Int, row: Int) {
        // The map's gesture surface receives physical taps above the tile buttons.
        app.buttons["land-tile-\(col)-\(row)"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertEqual(app.staticTexts["land-draft-coordinate"].label, "\(col + 1) / \(row + 1)")
    }

    func testPreviewMoveCancelCollisionUndoAndPersistence() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-AppleLanguages", "(en)"]
        app.launch()
        XCTAssertTrue(app.buttons["How to play"].waitForExistence(timeout: 10))
        app.buttons["How to play"].tap()
        // The practice island never grows and its core does not move: its help says so.
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "This practice island stays 8×8.")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "tap it to move it")).count, 0)
        app.buttons["Restore"].tap()
        let status = app.staticTexts["land-fixed-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, "FOCUS 1/2 · 8 PLACED")
        XCTAssertTrue(app.descendants(matching: .any)["path-path-a-connectors-SE"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["path-path-b-connectors-NW"].exists)

        app.buttons["blueprint-crypto_bay_data_dock"].tap()
        app.buttons["land-build-or-move"].tap()
        XCTAssertTrue(app.buttons["land-confirm"].isEnabled)
        app.buttons["Cancel placement"].tap()
        XCTAssertEqual(status.label, "FOCUS 1/2 · 8 PLACED")

        app.buttons["land-build-or-move"].tap()
        tapTile(app, col: 3, row: 3)
        XCTAssertFalse(app.buttons["land-confirm"].isEnabled)
        tapTile(app, col: 0, row: 0)
        XCTAssertFalse(app.buttons["land-confirm"].isEnabled)
        tapTile(app, col: 2, row: 6)
        app.buttons["land-confirm"].tap()
        XCTAssertEqual(status.label, "FOCUS 1/2 · 9 PLACED")

        app.buttons["land-build-or-move"].tap()
        tapTile(app, col: 2, row: 5)
        app.buttons["land-confirm"].tap()
        XCTAssertEqual(status.label, "FOCUS 1/2 · 9 PLACED")
        app.buttons["land-undo"].tap()
        XCTAssertEqual(status.label, "FOCUS 1/2 · 9 PLACED")

        app.terminate(); app.launch()
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertEqual(status.label, "FOCUS 1/2 · 9 PLACED")
        app.buttons["blueprint-crypto_bay_candle_tower"].tap()
        app.buttons["land-build-or-move"].tap()
        app.buttons["land-rotate"].tap()
        tapTile(app, col: 6, row: 6)
        XCTAssertFalse(app.buttons["land-confirm"].isEnabled)
        app.buttons["Cancel placement"].tap()
        app.buttons["How to play"].tap()
        app.buttons["Restore"].tap()
        XCTAssertEqual(status.label, "FOCUS 1/2 · 8 PLACED")
    }

    /// The account island from `-trader-land-account-fixture` (in memory, no network): a 10×10 island
    /// whose dormant Aura Core moves like a piece, and a seed whose horizon grows through the extend menu.
    func testAccountFixtureMovesTheCoreAndExtendsASeed() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-trader-land-account-fixture", "-AppleLanguages", "(en)"]
        app.launch()
        let status = app.staticTexts["land-fixed-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        XCTAssertEqual(status.label, "10×10 · 9/60 · CORE DORMANT")
        shot("account-fixture")

        // Tap the core: the Aura Core, with Move and neither Store nor Rotate.
        app.buttons["land-tile-6-2"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let move = app.buttons["land-build-or-move"]
        XCTAssertTrue(move.waitForExistence(timeout: 5))
        XCTAssertEqual(move.label, "Move")
        XCTAssertTrue(app.staticTexts["land-selection-detail"].label.hasPrefix("Dormant"))
        XCTAssertFalse(app.buttons["land-store"].exists)
        move.tap()
        XCTAssertTrue(app.buttons["land-confirm"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["land-rotate"].exists)
        // Onto the Double Gate: no room. Then a free corner.
        tapTile(app, col: 3, row: 3)
        XCTAssertFalse(app.buttons["land-confirm"].isEnabled)
        tapTile(app, col: 1, row: 1)
        XCTAssertTrue(app.buttons["land-confirm"].isEnabled)
        shot("core-draft")
        app.buttons["land-confirm"].tap()
        let notice = app.staticTexts["land-notice"]
        XCTAssertTrue(notice.waitForExistence(timeout: 5))
        XCTAssertEqual(notice.label, "Aura Core moved.")
        XCTAssertEqual(status.label, "10×10 · 9/60 · CORE DORMANT")
        // The core answers where it now stands, and its old spot is free ground.
        app.buttons["land-tile-2-2"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.staticTexts["land-selection-detail"].waitForExistence(timeout: 5))
        XCTAssertEqual(move.label, "Move")
        app.buttons["land-tile-7-3"].coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertFalse(app.staticTexts["land-selection-detail"].exists)

        // A 24 h seed can grow to 3 or 7 days; each option names the piece it would bloom into.
        let horizon = app.staticTexts["land-horizon-fx-seed-growing"]
        XCTAssertTrue(horizon.waitForExistence(timeout: 5))
        XCTAssertEqual(horizon.label, "24\u{00A0}h · common piece 1×1")
        let menu = app.buttons["land-extend-fx-seed-growing"]
        XCTAssertTrue(menu.waitForExistence(timeout: 5))
        menu.tap()
        let threeDays = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "3\u{00A0}days · building 2×1")).firstMatch
        XCTAssertTrue(threeDays.waitForExistence(timeout: 5))
        XCTAssertEqual(threeDays.label, "3\u{00A0}days · building 2×1 · Candle Tower")
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "7\u{00A0}days · landmark 2×2")).firstMatch.exists)
        shot("extend-menu")
        threeDays.tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 5))
        XCTAssertTrue(alert.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "You can't shorten it later")).firstMatch.exists)
        alert.buttons["Extend"].tap()
        XCTAssertTrue(notice.waitForExistence(timeout: 5))
        XCTAssertEqual(notice.label, "Seed extended to 3\u{00A0}days: it will bloom into Candle Tower.")
        XCTAssertEqual(horizon.label, "3\u{00A0}days · building 2×1")
        shot("seed-extended")

        // An account island's help tells how it grows and that its core moves.
        app.buttons["land-help"].tap()
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "tap it to move it")).firstMatch.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "This practice island stays 8×8.")).count, 0)
        app.buttons["Done"].tap()
    }

    private func shot(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// The archipelago opens from the header, the arrows fly between public
    /// islands (read-only visits) and "Back to my island" returns home.
    func testArchipelagoArrowsVisitNeighboursAndReturnHome() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-trader-land-gate", "-land-neighbors-fixture", "-AppleLanguages", "(en)"]
        app.launch()
        let status = app.staticTexts["land-fixed-status"]
        XCTAssertTrue(status.waitForExistence(timeout: 10))
        shot("practice-island")

        app.buttons["blueprint-crypto_bay_data_dock"].tap()
        app.buttons["land-build-or-move"].tap()
        XCTAssertTrue(app.buttons["land-confirm"].waitForExistence(timeout: 5))
        shot("placement-draft")
        app.buttons["Cancel placement"].tap()

        app.buttons["land-archipelago"].tap()
        let card = app.descendants(matching: .any)["land-archipelago-card"]
        XCTAssertTrue(card.waitForExistence(timeout: 5))
        XCTAssertFalse(status.exists)
        let focused = app.staticTexts["land-focused-island"]
        XCTAssertTrue(focused.waitForExistence(timeout: 5))
        XCTAssertEqual(focused.label, "Your practice island")
        sleep(1)
        shot("archipelago-fixture")

        app.buttons["land-next-island"].tap()
        XCTAssertEqual(focused.label, "Harbor of Patience")
        app.buttons["land-next-island"].tap()
        XCTAssertEqual(focused.label, "Quiet Reef")
        sleep(1)
        shot("visiting-neighbour")
        app.buttons["land-prev-island"].tap()
        XCTAssertEqual(focused.label, "Harbor of Patience")

        app.buttons["land-home-island"].tap()
        XCTAssertTrue(status.waitForExistence(timeout: 5))
        XCTAssertFalse(card.exists)
        XCTAssertTrue(status.label.hasPrefix("FOCUS "))
    }
}
