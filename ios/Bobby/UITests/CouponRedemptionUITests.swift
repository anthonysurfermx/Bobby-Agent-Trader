import XCTest

final class CouponRedemptionUITests: XCTestCase {
    func testConfirmedGiftShowsActualCountsAndReturnAction() {
        let app = XCUIApplication()
        app.launchArguments = ["-qa-coupon", "-app.language", "es"]
        app.launch()
        XCTAssertTrue(app.buttons["coupon-start-read"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Tienes 10 lecturas Rápido más"].exists)
        XCTAssertTrue(app.staticTexts["Lecturas Profundo: +2"].exists)
        XCTAssertTrue(app.staticTexts["Lecturas Máximo: +1"].exists)
        XCTAssertTrue(app.staticTexts["No necesitas restaurar compras."].exists)
        app.buttons["coupon-start-read"].tap()
        XCTAssertTrue(app.staticTexts["coupon-returned-to-bobby"].waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons["coupon-start-read"].exists)
    }

    func testAlreadyRedeemedDoesNotPromiseAnotherGift() {
        let app = XCUIApplication()
        app.launchArguments = ["-qa-coupon", "-qa-coupon-already", "-app.language", "es"]
        app.launch()
        XCTAssertTrue(app.buttons["coupon-done"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.staticTexts["Este código ya fue canjeado"].exists)
        XCTAssertFalse(app.staticTexts["Tienes 10 lecturas Rápido más"].exists)
        XCTAssertTrue(app.staticTexts["Rápido: 10 · Profundo: 2 · Máximo: 1"].exists)
        app.buttons["coupon-done"].tap()
        XCTAssertFalse(app.buttons["coupon-done"].exists)
    }
}
