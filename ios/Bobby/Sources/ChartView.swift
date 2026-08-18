// Candlestick chart — native Swift Charts, no dependencies.
import SwiftUI
import Charts

struct ChartView: View {
    let candles: [Candle]
    var answer: BobbyAnswer? = nil

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

            if let entry = answer?.entry {
                RuleMark(y: .value("entry", entry))
                    .foregroundStyle(Theme.accentSoft.opacity(0.85))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [5, 4]))
                    .annotation(position: .top, alignment: .trailing) {
                        levelLabel("ENTRY", entry, Theme.accentSoft)
                    }
            }
            if let stop = answer?.stop {
                RuleMark(y: .value("stop", stop))
                    .foregroundStyle(Theme.down.opacity(0.85))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .trailing) {
                        levelLabel("STOP", stop, Theme.down)
                    }
            }
            if let target = answer?.target {
                RuleMark(y: .value("target", target))
                    .foregroundStyle(Theme.up.opacity(0.85))
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 4]))
                    .annotation(position: .top, alignment: .trailing) {
                        levelLabel("TARGET", target, Theme.up)
                    }
            }
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

    private func levelLabel(_ label: String, _ price: Double, _ color: Color) -> some View {
        Text("\(label) \(BobbyAnswer.money(price))")
            .font(.mono(7, .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Theme.panel.opacity(0.88))
    }

    private var yDomain: ClosedRange<Double> {
        guard let lo = candles.map(\.low).min(), let hi = candles.map(\.high).max(), hi > lo else {
            return 0...1
        }
        let levels = [answer?.entry, answer?.stop, answer?.target].compactMap { $0 }
        let domainLo = min(lo, levels.min() ?? lo)
        let domainHi = max(hi, levels.max() ?? hi)
        let pad = max((domainHi - domainLo) * 0.08, 0.0001)
        return (domainLo - pad)...(domainHi + pad)
    }
}
