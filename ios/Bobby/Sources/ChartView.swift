// Candlestick chart — native Swift Charts, no dependencies.
import SwiftUI
import Charts

struct ChartView: View {
    let candles: [Candle]

    var body: some View {
        Chart(candles) { c in
            // wick
            RuleMark(x: .value("t", c.time), yStart: .value("low", c.low), yEnd: .value("high", c.high))
                .foregroundStyle(c.close >= c.open ? Theme.up.opacity(0.6) : Theme.down.opacity(0.6))
                .lineStyle(StrokeStyle(lineWidth: 1))
            // body
            RectangleMark(
                x: .value("t", c.time),
                yStart: .value("open", c.open),
                yEnd: .value("close", c.close),
                width: .fixed(max(2, bodyWidth))
            )
            .foregroundStyle(c.close >= c.open ? Theme.up : Theme.down)
            .cornerRadius(1)
        }
        .chartYScale(domain: yDomain)
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Theme.stroke)
                AxisValueLabel(format: .dateTime.hour().day(), centered: true)
                    .foregroundStyle(Theme.muted)
                    .font(.mono(9))
            }
        }
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine().foregroundStyle(Theme.stroke)
                AxisValueLabel()
                    .foregroundStyle(Theme.muted)
                    .font(.mono(9))
            }
        }
    }

    private var bodyWidth: CGFloat {
        candles.count > 60 ? 2.5 : 4
    }

    private var yDomain: ClosedRange<Double> {
        guard let lo = candles.map(\.low).min(), let hi = candles.map(\.high).max(), hi > lo else {
            return 0...1
        }
        let pad = (hi - lo) * 0.08
        return (lo - pad)...(hi + pad)
    }
}
