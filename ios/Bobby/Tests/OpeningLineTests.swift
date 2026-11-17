import XCTest
@testable import Bobby

final class OpeningLineTests: XCTestCase {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    func reference(_ price: Double? = 100, age: Double = 86_400) -> OpeningReference {
        OpeningReference("NVDA", "NVIDIA", true, at: now.addingTimeInterval(-age), price: price)
    }
    func bar(_ close: Double, age: Double = 1800) -> NucleoDeskIO.Bar {
        .init(t: Int((now.timeIntervalSince1970 - age) * 1000), o: close, h: close, l: close, c: close, v: 1)
    }
    func testLatestReadingReplacesOlderBasisEvenIfPriceMissing() {
        XCTAssertNil(OpeningReference.latest([reference(), reference(nil, age: 4000)], now: now))
        XCTAssertNil(OpeningReference.latest([reference(age: 900), reference()], now: now))
        XCTAssertNil(OpeningReference.latest([reference(age: 15 * 86_400)], now: now))
        XCTAssertNil(OpeningReference.latest([reference(.infinity)], now: now))
    }
    func testDirectionAndMeaningfulChange() throws {
        XCTAssertEqual(try XCTUnwrap(reference().move(bars: [bar(103.2)], now: now)), 3.2, accuracy: 0.001)
        XCTAssertEqual(try XCTUnwrap(reference().move(bars: [bar(96)], now: now)), -4, accuracy: 0.001)
        XCTAssertNil(reference().move(bars: [bar(100.2)], now: now))
    }
    func testRejectsMissingStaleFutureAndSplitQuotes() {
        for bars in [[], [bar(102, age: -60)], [bar(102, age: 86_400)], [bar(102, age: 6 * 86_400)], [bar(50)], [bar(.nan)]] {
            XCTAssertNil(reference().move(bars: bars, now: now))
        }
    }
}
