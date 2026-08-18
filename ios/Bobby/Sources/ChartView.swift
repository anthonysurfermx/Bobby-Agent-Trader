// MarketCanvas for iOS. It deliberately mirrors the web desk: compact trading
// sessions, 100 OHLCV bars, EMA20/EMA50, structure lines, plan levels and an
// inspectable crosshair. Native Swift Charts keeps the surface fast and offline-
// friendly without creating a second market-data implementation.
import SwiftUI
import Charts

struct ChartView: View {
    let candles: [Candle]
    var answer: BobbyAnswer? = nil
    var timeframe: MarketTimeframe = .oneHour

    @State private var selectedIndex: Int?

    private let ema20Color = Color(red: 0.49, green: 0.65, blue: 1.0)
    private let ema50Color = Color(red: 0.77, green: 0.71, blue: 0.99)
    private let downBody = Color(red: 0.18, green: 0.18, blue: 0.23)

    var body: some View {
        VStack(spacing: 0) {
            inspectionBar
                .padding(.horizontal, 8)
                .padding(.bottom, 6)

            Chart {
                ForEach(Array(visibleCandles.enumerated()), id: \.element.id) { index, candle in
                    if candle.volume > 0 {
                        RectangleMark(
                            x: .value("bar", index),
                            yStart: .value("volume base", volumeBase),
                            yEnd: .value("volume", volumeHeight(candle.volume)),
                            width: .fixed(candleBodyWidth)
                        )
                        .foregroundStyle(
                            candle.close >= candle.open
                                ? Theme.accent.opacity(0.24)
                                : Color.white.opacity(0.10)
                        )
                    }

                    RuleMark(
                        x: .value("bar", index),
                        yStart: .value("low", candle.low),
                        yEnd: .value("high", candle.high)
                    )
                    .foregroundStyle(candle.close >= candle.open ? Theme.accentSoft : Color.white.opacity(0.30))
                    .lineStyle(StrokeStyle(lineWidth: 1))

                    RectangleMark(
                        x: .value("bar", index),
                        yStart: .value("open", candle.open),
                        yEnd: .value("close", candle.close),
                        width: .fixed(candleBodyWidth)
                    )
                    .foregroundStyle(candle.close >= candle.open ? Theme.accent : downBody)
                    .cornerRadius(0.8)
                }

                ForEach(ema20) { point in
                    LineMark(x: .value("bar", point.index), y: .value("EMA20", point.value))
                        .foregroundStyle(ema20Color)
                        .lineStyle(StrokeStyle(lineWidth: 1.35))
                        .interpolationMethod(.catmullRom)
                }

                ForEach(ema50) { point in
                    LineMark(x: .value("bar", point.index), y: .value("EMA50", point.value))
                        .foregroundStyle(ema50Color.opacity(0.82))
                        .lineStyle(StrokeStyle(lineWidth: 1.15))
                        .interpolationMethod(.catmullRom)
                }

                structureLines
                planLines

                if let last = visibleCandles.last {
                    RuleMark(y: .value("last", last.close))
                        .foregroundStyle(Theme.accent.opacity(0.72))
                        .lineStyle(StrokeStyle(lineWidth: 0.8, dash: [2, 3]))
                }

                if let selectedIndex, visibleCandles.indices.contains(selectedIndex) {
                    RuleMark(x: .value("selected", selectedIndex))
                        .foregroundStyle(Theme.accentSoft.opacity(0.55))
                        .lineStyle(StrokeStyle(lineWidth: 0.8, dash: [3, 3]))
                }
            }
            .chartXScale(domain: xDomain)
            .chartYScale(domain: yDomain)
            .chartScrollableAxes(.horizontal)
            .chartXVisibleDomain(length: min(46, max(2, visibleCandles.count)))
            .chartScrollPosition(initialX: max(0, visibleCandles.count - 46))
            .chartXSelection(value: $selectedIndex)
            .chartXAxis {
                AxisMarks(values: tickIndices) { value in
                    AxisGridLine().foregroundStyle(Theme.stroke.opacity(0.65))
                    if let index = value.as(Int.self), visibleCandles.indices.contains(index) {
                        AxisValueLabel {
                            Text(axisLabel(visibleCandles[index].time))
                                .font(.mono(8, .medium))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing, values: .automatic(desiredCount: 5)) { value in
                    AxisGridLine().foregroundStyle(Theme.stroke)
                    AxisValueLabel {
                        if let price = value.as(Double.self) {
                            Text(axisPrice(price))
                                .font(.mono(8, .medium))
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
            .chartPlotStyle { plot in
                plot
                    .background(Theme.panel.opacity(0.32))
                    .contentShape(Rectangle())
            }
        }
        .accessibilityLabel("Gráfica de velas \(timeframe.rawValue), con volumen, EMA 20 y EMA 50")
    }

    @ChartContentBuilder
    private var structureLines: some ChartContent {
        if let support = answer?.support {
            RuleMark(y: .value("support", support))
                .foregroundStyle(Color.white.opacity(0.25))
                .lineStyle(StrokeStyle(lineWidth: 0.8, dash: [2, 4]))
                .annotation(position: .top, alignment: .leading) {
                    lineLabel("S", support, Theme.muted)
                }
        }
        if let resistance = answer?.resistance {
            RuleMark(y: .value("resistance", resistance))
                .foregroundStyle(Color.white.opacity(0.25))
                .lineStyle(StrokeStyle(lineWidth: 0.8, dash: [2, 4]))
                .annotation(position: .bottom, alignment: .leading) {
                    lineLabel("R", resistance, Theme.muted)
                }
        }
    }

    @ChartContentBuilder
    private var planLines: some ChartContent {
        if let entry = answer?.entry {
            RuleMark(y: .value("entry", entry))
                .foregroundStyle(Theme.accentSoft.opacity(0.90))
                .lineStyle(StrokeStyle(lineWidth: 1.1, dash: [5, 4]))
                .annotation(position: .top, alignment: .trailing) {
                    lineLabel("ENTRY", entry, Theme.accentSoft)
                }
        }
        if let stop = answer?.stop {
            RuleMark(y: .value("stop", stop))
                .foregroundStyle(Theme.down.opacity(0.88))
                .lineStyle(StrokeStyle(lineWidth: 1.1, dash: [4, 4]))
                .annotation(position: .top, alignment: .trailing) {
                    lineLabel("STOP", stop, Theme.down)
                }
        }
        if let target = answer?.target {
            RuleMark(y: .value("target", target))
                .foregroundStyle(Theme.up.opacity(0.88))
                .lineStyle(StrokeStyle(lineWidth: 1.1, dash: [4, 4]))
                .annotation(position: .bottom, alignment: .trailing) {
                    lineLabel("TARGET", target, Theme.up)
                }
        }
    }

    private var inspectionBar: some View {
        let index = selectedIndex.flatMap { visibleCandles.indices.contains($0) ? $0 : nil }
        let candle = index.map { visibleCandles[$0] } ?? visibleCandles.last
        return HStack(spacing: 8) {
            if let candle {
                Text(formatTimestamp(candle.time))
                    .foregroundStyle(Theme.muted)
                metric("O", candle.open)
                metric("H", candle.high)
                metric("L", candle.low)
                metric("C", candle.close)
            }
            Spacer(minLength: 0)
            HStack(spacing: 6) {
                legendDot(ema20Color, "EMA20")
                legendDot(ema50Color, "EMA50")
            }
        }
        .font(.mono(7, .medium))
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }

    private func metric(_ label: String, _ value: Double) -> some View {
        HStack(spacing: 2) {
            Text(label).foregroundStyle(Theme.muted.opacity(0.72))
            Text(axisPrice(value)).foregroundStyle(Theme.text.opacity(0.72))
        }
    }

    private func legendDot(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 3) {
            Capsule().fill(color).frame(width: 9, height: 2)
            Text(label).foregroundStyle(Theme.muted)
        }
    }

    private func lineLabel(_ label: String, _ price: Double, _ color: Color) -> some View {
        Text("\(label) \(axisPrice(price))")
            .font(.mono(6.5, .bold))
            .foregroundStyle(color)
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(Theme.panel.opacity(0.92))
    }

    private var visibleCandles: [Candle] { Array(candles.suffix(100)) }

    private var candleBodyWidth: CGFloat {
        visibleCandles.count > 70 ? 4 : 5.5
    }

    private var xDomain: ClosedRange<Int> {
        0...max(1, visibleCandles.count - 1)
    }

    private var tickIndices: [Int] {
        let count = visibleCandles.count
        guard count > 1 else { return [0] }
        return Array(Set([0, count / 3, (count * 2) / 3, count - 1])).sorted()
    }

    private var rawPriceRange: (low: Double, high: Double) {
        guard let low = visibleCandles.map(\.low).min(),
              let high = visibleCandles.map(\.high).max(), high > low else { return (0, 1) }
        let nearbyLevels = [answer?.entry, answer?.stop, answer?.target, answer?.support, answer?.resistance]
            .compactMap { $0 }
            .filter { $0 > low * 0.75 && $0 < high * 1.25 }
        return (min(low, nearbyLevels.min() ?? low), max(high, nearbyLevels.max() ?? high))
    }

    private var yDomain: ClosedRange<Double> {
        let range = rawPriceRange
        let padding = max((range.high - range.low) * 0.10, 0.0001)
        return (range.low - padding)...(range.high + padding)
    }

    private var volumeBase: Double { yDomain.lowerBound }

    private func volumeHeight(_ volume: Double) -> Double {
        let maxVolume = max(visibleCandles.map(\.volume).max() ?? 1, 1)
        return volumeBase + (volume / maxVolume) * (yDomain.upperBound - yDomain.lowerBound) * 0.16
    }

    private var ema20: [AveragePoint] { averageSeries(period: 20) }
    private var ema50: [AveragePoint] { averageSeries(period: 50) }

    private func averageSeries(period: Int) -> [AveragePoint] {
        guard visibleCandles.count >= period else { return [] }
        let smoothing = 2.0 / Double(period + 1)
        var previous = visibleCandles.prefix(period).reduce(0) { $0 + $1.close } / Double(period)
        var points = [AveragePoint(index: period - 1, value: previous)]
        for index in period..<visibleCandles.count {
            previous = visibleCandles[index].close * smoothing + previous * (1 - smoothing)
            points.append(AveragePoint(index: index, value: previous))
        }
        return points
    }

    private func axisLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = timeframe == .oneDay || timeframe == .fourHours ? "d MMM" : "E HH"
        return formatter.string(from: date).uppercased()
    }

    private func formatTimestamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = "d MMM · HH:mm"
        return formatter.string(from: date).uppercased()
    }

    private func axisPrice(_ value: Double) -> String {
        if value >= 1_000 { return String(format: "%.0f", value) }
        if value >= 10 { return String(format: "%.2f", value) }
        if value >= 1 { return String(format: "%.3f", value) }
        return String(format: "%.4f", value)
    }
}

private struct AveragePoint: Identifiable {
    let index: Int
    let value: Double
    var id: Int { index }
}
