// Local join between observed interests, a dated market observation and the next useful action.
// No I/O and no inferred investor profile. The account ledger and its timing stay on this phone.
import Foundation

struct HarnessQuote: Equatable, Sendable {
    let price: Double
    let provider: String
    let asOf: Date

    init?(market: NucleoDeskIO.Market) {
        guard let price = market.price, price.isFinite, price > 0,
              let provider = market.provider, !provider.isEmpty, provider.count <= 80,
              let raw = market.asOf else { return nil }
        let formatter = ISO8601DateFormatter()
        var date = formatter.date(from: raw)
        if date == nil {
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            date = formatter.date(from: raw)
        }
        guard let date else { return nil }
        self.price = price; self.provider = provider; self.asOf = date
    }

    init(price: Double, provider: String, asOf: Date) {
        self.price = price; self.provider = provider; self.asOf = asOf
    }
}

/// v1 describes why this subject, what is actually known, and the action that can follow.
/// A stored answer is deliberately distinct from a new observation: reopening costs no read.
struct HarnessOpportunity: Equatable {
    enum Kind: String { case savedRead, marketChange, review }
    static let version = 1
    let kind: Kind
    let symbol: String
    let basedOn: Date
    var quote: HarnessQuote?
    var expiresAt: Date?
    var savedReadID: String?

    static let equityQuoteAge: TimeInterval = 6 * 3_600
    static let cryptoQuoteAge: TimeInterval = 30 * 60

    static func make(asset: HarnessAsset, quote: HarnessQuote?, now: Date, savedReadID: String? = nil) -> HarnessOpportunity {
        if let savedReadID {
            return HarnessOpportunity(kind: .savedRead, symbol: asset.symbol, basedOn: asset.lastAskedAt, savedReadID: savedReadID)
        }
        let age = asset.isEquity ? equityQuoteAge : cryptoQuoteAge
        let current = quote.flatMap { value -> HarnessQuote? in
            guard value.price.isFinite, value.price > 0, !value.provider.isEmpty,
                  value.asOf >= asset.lastAskedAt, value.asOf <= now,
                  now.timeIntervalSince(value.asOf) <= age else { return nil }
            return value
        }
        let changed = HarnessCopy.move(from: asset.lastPrice, to: current?.price, isEquity: asset.isEquity)
        return HarnessOpportunity(kind: changed.map { abs($0) >= 0.05 } == true ? .marketChange : .review,
                                  symbol: asset.symbol, basedOn: asset.lastAskedAt, quote: current,
                                  expiresAt: current.map { $0.asOf.addingTimeInterval(age) })
    }

    /// The clock is only a review moment. A fresh source is required before claiming a change.
    var hasNewMarketEvidence: Bool { kind == .marketChange && quote != nil }

    func hasNewMarketEvidence(at now: Date) -> Bool {
        guard hasNewMarketEvidence, let quote, let expiresAt else { return false }
        return quote.asOf <= now && now < expiresAt
    }
}
