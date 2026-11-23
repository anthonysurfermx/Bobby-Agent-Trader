import Foundation

/// Two observations on the device. The only remote input is a dated, public chart bar.
struct OpeningReference: Equatable {
    let asset: NucleoAsset
    let at: Date
    let price: Double?

    init(_ symbol: String, _ name: String, _ equity: Bool, at: Date, price: Double?) {
        asset = NucleoAsset(symbol: symbol, name: name, isEquity: equity, assetClass: equity ? "equity" : "crypto")
        self.at = at
        self.price = price
    }

    static func latest(_ references: [Self], now: Date) -> Self? {
        var seen = Set<String>()
        for ref in references.sorted(by: { $0.at > $1.at }) {
            guard HarnessLedger.validSymbol(ref.asset.symbol) == ref.asset.symbol,
                  ref.at <= now, seen.insert(ref.asset.symbol).inserted else { continue }
            let age = now.timeIntervalSince(ref.at)
            guard age >= 3_600, age <= 14 * 86_400, let price = ref.price, price.isFinite, price > 0 else { continue }
            return ref
        }
        return nil
    }

    func move(bars: [NucleoDeskIO.Bar], now: Date) -> Double? {
        guard NucleoDeskIO.gate(bars, isEquity: asset.isEquity, now: now) == nil, let bar = bars.last else { return nil }
        let timestamp = Date(timeIntervalSince1970: Double(bar.t) / 1000)
        guard timestamp > at, timestamp <= now, bar.l > 0, bar.l <= bar.c, bar.c <= bar.h,
              let pct = HarnessCopy.move(from: price, to: bar.c, isEquity: asset.isEquity),
              abs(pct) >= 1 else { return nil }
        return pct
    }

    private var day: String {
        let formatter = DateFormatter()
        formatter.locale = L.locale
        formatter.setLocalizedDateFormatFromTemplate("MMMd")
        return formatter.string(from: at)
    }

    func question(_ pct: Double) -> String {
        let symbol = asset.symbol, change = HarnessCopy.signed(pct)
        return L.t("How do you read the move in \(symbol) (\(change) since \(day))?", "¿Cómo interpretas el movimiento de \(symbol) (\(change) desde el \(day))?")
    }

    func text(_ pct: Double) -> String {
        let symbol = asset.symbol, change = HarnessCopy.signed(pct)
        if pct > 0 {
            return L.t("I see strength in \(symbol) (\(change) since \(day)).", "Veo fuerza en \(symbol) (\(change) desde el \(day)).")
        }
        return L.t("I see weakness in \(symbol) (\(change) since \(day)).", "Veo debilidad en \(symbol) (\(change) desde el \(day)).")
    }
}
