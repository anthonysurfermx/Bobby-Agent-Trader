import SwiftUI
import Charts

struct SignalMarketSnapshot: Decodable {
    struct Candle: Decodable, Identifiable {
        let ts: Double
        let close: Double
        var id: Double { ts }
        var date: Date { Date(timeIntervalSince1970: ts / 1_000) }
    }
    let symbol: String
    let candles: [Candle]

    // Read the same historical snapshots as the full charts, once per app launch.
    private static let bundled: [String: SignalMarketSnapshot] = Dictionary(uniqueKeysWithValues: SignalListItem.curated.compactMap { item in
        guard let url = Bundle.main.url(forResource: SignalCase.forSignal(item).marketResource, withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode(SignalMarketSnapshot.self, from: data) else { return nil }
        let valid = decoded.candles.filter { $0.ts.isFinite && $0.close.isFinite && $0.close > 0 }
            .sorted { $0.ts < $1.ts }
        guard valid.count >= 2, decoded.symbol == item.symbol else { return nil }
        return (item.symbol, SignalMarketSnapshot(symbol: decoded.symbol, candles: Array(valid.suffix(21))))
    })

    static func forSymbol(_ symbol: String) -> SignalMarketSnapshot? { bundled[symbol] }

    static func dateLabel(_ date: Date, year: Bool = false) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = year ? "d MMM yyyy" : "d MMM"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    var accessibilitySummary: String {
        guard let last = candles.last else { return "" }
        return "Gráfico histórico del precio. Cierre del \(Self.dateLabel(last.date, year: true)): \(String(format: "%.2f", last.close)) dólares. No es precio en vivo."
    }
}

struct SignalMarketPreview: View {
    let snapshot: SignalMarketSnapshot
    var quote: SignalQuote? = nil
    @Environment(\.dynamicTypeSize) private var typeSize
    private var chartColor: Color { SignalBrand.chart(snapshot.symbol) }

    var body: some View {
        if let first = snapshot.candles.first, let last = snapshot.candles.last {
            let minimum = snapshot.candles.map(\.close).min() ?? 0
            let maximum = snapshot.candles.map(\.close).max() ?? 1
            let padding = max((maximum - minimum) * 0.12, 1)
            VStack(alignment: .leading, spacing: 10) {
                let layout = typeSize.isAccessibilitySize
                    ? AnyLayout(VStackLayout(alignment: .leading, spacing: 6))
                    : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 8))
                layout {
                    Text(quote?.price ?? last.close, format: .currency(code: "USD").locale(Locale(identifier: "en_US")))
                        .font(.title2.weight(.medium)).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.7)
                    if let change = quote?.changePct {
                        Text(String(format: "%+.2f %%", change * 100)).font(.caption.weight(.semibold)).monospacedDigit()
                            .foregroundStyle(change >= 0 ? Color.green : Color.red)
                    }
                    if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
                    if let quote, quote.isLive {
                        HStack(spacing: 5) {
                            Circle().fill(Color.green).frame(width: 7, height: 7)
                            Text("En vivo")
                        }.font(.caption).foregroundStyle(Theme.secondary)
                        .accessibilityLabel("En vivo, \(SignalTracking.timeLabel(quote.asOf)) de Nueva York")
                        .accessibilityIdentifier("signal-live-badge")
                    } else if let quote {
                        Text("Cierre \(SignalTracking.dayLabel(quote.asOf))").font(.caption).foregroundStyle(Theme.secondary)
                    } else {
                        Text("Cierre \(SignalMarketSnapshot.dateLabel(last.date, year: true))").font(.caption).foregroundStyle(Theme.secondary)
                    }
                }

                Chart {
                    ForEach(snapshot.candles) { candle in
                        AreaMark(x: .value("Fecha", candle.date), yStart: .value("Base", minimum - padding), yEnd: .value("Cierre", candle.close))
                            .foregroundStyle(LinearGradient(colors: [chartColor.opacity(0.25), chartColor.opacity(0.01)], startPoint: .top, endPoint: .bottom))
                        LineMark(x: .value("Fecha", candle.date), y: .value("Cierre", candle.close))
                            .foregroundStyle(chartColor).lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, lineJoin: .round))
                    }
                    PointMark(x: .value("Fecha", last.date), y: .value("Cierre", last.close))
                        .foregroundStyle(chartColor).symbolSize(28)
                }
                .chartXScale(domain: first.date...last.date, range: .plotDimension(padding: 4))
                .chartYScale(domain: (minimum - padding)...(maximum + padding))
                .chartXAxis(.hidden).chartYAxis(.hidden)
                .frame(height: 110)
                .accessibilityHidden(true)

            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(snapshot.accessibilitySummary)
        }
    }
}
