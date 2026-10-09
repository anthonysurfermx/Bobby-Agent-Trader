import Foundation
import XCTest
@testable import Bobby

final class HarnessOpportunityTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_791_440_000)

    private func asset(_ symbol: String = "AAPL", equity: Bool = true) -> HarnessAsset {
        HarnessAsset(symbol: symbol, name: symbol, isEquity: equity, firstAskedAt: now.addingTimeInterval(-86_400),
                     lastAskedAt: now.addingTimeInterval(-86_400), lastPrice: 100, firstPrice: 100, asks: 1)
    }

    func testFreshSourcedMovementIsGenericAndKeepsItsProvenance() {
        for symbol in ["AAPL", "MU", "PETR4.SA", "BTC"] {
            let quote = HarnessQuote(price: 103, provider: "fixture-provider", asOf: now.addingTimeInterval(-60))
            let value = HarnessOpportunity.make(asset: asset(symbol, equity: symbol != "BTC"), quote: quote, now: now)
            XCTAssertEqual(HarnessOpportunity.version, 1)
            XCTAssertEqual(value.symbol, symbol)
            XCTAssertTrue(value.hasNewMarketEvidence)
            XCTAssertEqual(value.quote, quote)
            XCTAssertGreaterThan(value.expiresAt!, now)
            XCTAssertTrue(value.hasNewMarketEvidence(at: now))
            XCTAssertFalse(value.hasNewMarketEvidence(at: value.expiresAt!), "source expiry is exclusive")
            XCTAssertFalse(value.hasNewMarketEvidence(at: value.expiresAt!.addingTimeInterval(1)), "an old card cannot promise current evidence")
        }
    }

    func testMissingStaleFutureOrUnchangedEvidenceOnlyOffersAReview() {
        let invalid: [HarnessQuote?] = [nil,
            HarnessQuote(price: 105, provider: "", asOf: now),
            HarnessQuote(price: .nan, provider: "fixture", asOf: now),
            HarnessQuote(price: 105, provider: "fixture", asOf: now.addingTimeInterval(1)),
            HarnessQuote(price: 105, provider: "fixture", asOf: now.addingTimeInterval(-7 * 3_600)),
            HarnessQuote(price: 100, provider: "fixture", asOf: now)]
        for quote in invalid {
            let value = HarnessOpportunity.make(asset: asset(), quote: quote, now: now)
            XCTAssertEqual(value.kind, .review)
            XCTAssertFalse(value.hasNewMarketEvidence)
        }
        XCTAssertNil(HarnessOpportunity.make(asset: asset(), quote: invalid[3], now: now).quote)
        let staleCrypto = HarnessQuote(price: 105, provider: "fixture", asOf: now.addingTimeInterval(-31 * 60))
        XCTAssertNil(HarnessOpportunity.make(asset: asset("BTC", equity: false), quote: staleCrypto, now: now).quote)
    }

    func testStoredReadIsSeparateFromFreshEvidenceAndNeverClaimsAChange() {
        let value = HarnessOpportunity.make(asset: asset(), quote: HarnessQuote(price: 120, provider: "fixture", asOf: now),
                                            now: now, savedReadID: "stored-read")
        XCTAssertEqual(value.kind, .savedRead)
        XCTAssertEqual(value.savedReadID, "stored-read")
        XCTAssertNil(value.quote)
        XCTAssertNil(value.expiresAt)
        XCTAssertFalse(value.hasNewMarketEvidence)
    }

    func testBadTicksAndSplitSizedChangesAreNotFreshInsights() {
        let value = HarnessOpportunity.make(asset: asset(), quote: HarnessQuote(price: 50, provider: "fixture", asOf: now), now: now)
        XCTAssertEqual(value.kind, .review)
        XCTAssertFalse(value.hasNewMarketEvidence)
    }

    func testRawMarketObservationRequiresSourceAndProviderTime() {
        XCTAssertNil(HarnessQuote(market: NucleoDeskIO.Market(price: 102, changePct: 2)))
        XCTAssertNil(HarnessQuote(market: NucleoDeskIO.Market(price: 102, changePct: 2, asOf: "invalid", provider: "fixture")))
        let good = HarnessQuote(market: NucleoDeskIO.Market(price: 102, changePct: 2, asOf: "2026-10-08T11:00:00.000Z", provider: "fixture"))
        XCTAssertNotNil(good)
        XCTAssertEqual(good?.provider, "fixture")
    }
}
