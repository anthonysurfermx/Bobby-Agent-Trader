import XCTest

/// Store compositions of exact build 71. Only the test runner is new.
final class Store71Shots: ConversationFixtureCase {
    func testFiveStoreScreens() {
        launch("companion", voice: true, home: "fresh", memory: "remember")
        ready(button("aria.talk")); Thread.sleep(forTimeInterval: 8)
        assertPillGlyphVisible(button("aria.talk")); shot("01-scene", delay: 0)
        ask(); answered(); ready(button("answer.readAll"))
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        shot("02-answer")
        let copy = labels["companion"] as! [String: String]
        let invite = web.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", copy["bobbyAsks"]!.components(separatedBy: "{question}")[0])).firstMatch
        ready(invite); invite.tap()
        ready(app.staticTexts["companion-consent-title"])
        ready(app.buttons["companion-consent-yes"]); ready(app.buttons["companion-consent-no"])
        shot("03-remember")
        app.terminate(); launch("companion", notes: true)
        openProfileFromGlass()
        let memory = app.buttons["account-memory"]
        for _ in 0..<6 where !memory.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(memory); memory.tap()
        ready(app.buttons["memory-educational-notes"]); app.buttons["memory-educational-notes"].tap()
        ready(app.staticTexts["companion-notes-title"])
        ready(app.staticTexts["companion-note-interest"]); ready(app.staticTexts["companion-note-barrier"])
        shot("04-notes")
        app.terminate(); launch("companion-plain")
        ask("Bitcoin"); ready(button("risk.notNow")); ready(confirmRead)
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        shot("05-market-read")
    }
}

final class Store71SceneRetake: ConversationFixtureCase {
    func testSettledFirstScene() {
        launch("companion", voice: true, home: "fresh", memory: "remember")
        ready(button("aria.talk")); Thread.sleep(forTimeInterval: 8)
        print("STORE71_TALK_FRAME=\(button("aria.talk").frame)")
        print("STORE71_APP_FRAME=\(app.windows.firstMatch.frame)")
        assertPillGlyphVisible(button("aria.talk"))
        shot("01-scene", delay: 0)
        assertPillGlyphVisible(button("aria.talk"))
    }
}
