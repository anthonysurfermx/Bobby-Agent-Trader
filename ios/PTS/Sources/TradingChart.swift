import SwiftUI
import WebKit

struct TradingChart: UIViewRepresentable {
    let signalCase: SignalCase
    var liveCandles: [LiveCandle]? = nil
    var selected: Double
    var onLevel: (Double) -> Void
    func makeCoordinator() -> Coordinator { Coordinator(self) }
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(context.coordinator, name: "ready")
        config.userContentController.add(context.coordinator, name: "level")
        let view = EdgeAwareChartWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.isScrollEnabled = false
        context.coordinator.web = view
        if let file = Bundle.main.url(forResource: "chart", withExtension: "html") { view.loadFileURL(file, allowingReadAccessTo: file.deletingLastPathComponent()) }
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        guard context.coordinator.ready else { return }
        if let live = liveCandles, let last = live.last {
            if context.coordinator.pushedLive == nil, let json = Coordinator.encode(live) {
                view.evaluateJavaScript("window.setCandles(\(json));", completionHandler: nil)
            } else if context.coordinator.pushedLive != last, let json = Coordinator.encode([last]) {
                view.evaluateJavaScript("window.updateLast(\(json.dropFirst().dropLast()));", completionHandler: nil)
            }
            context.coordinator.pushedLive = last
        }
        view.evaluateJavaScript("window.focusLevel(\(selected))", completionHandler: nil)
    }
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.configuration.userContentController.removeScriptMessageHandler(forName: "ready")
        view.configuration.userContentController.removeScriptMessageHandler(forName: "level")
    }
    final class Coordinator: NSObject, WKScriptMessageHandler {
        var parent: TradingChart
        weak var web: WKWebView?
        var ready = false
        var pushedLive: LiveCandle?
        init(_ parent: TradingChart) { self.parent = parent }

        static func encode(_ candles: [LiveCandle]) -> String? {
            let rows = candles.map { ["ts": $0.ts, "open": $0.open, "high": $0.high, "low": $0.low, "close": $0.close] }
            return (try? JSONSerialization.data(withJSONObject: rows)).flatMap { String(data: $0, encoding: .utf8) }
        }

        // The authors' chart colors, used only for roles they documented
        // (Jasiel draws the correction zone in blue).
        static func chartConfig(_ signalCase: SignalCase) -> [String: Any] {
            func color(_ role: String?) -> String? {
                guard let role else { return nil }
                if role == "Stop" { return "#F87171" }
                if role == "Corrección" { return "#60A5FA" }
                if role == "Entrada" { return "#C4B5FD" }
                if role == "BE" { return "#FACC15" }
                return role.hasPrefix("Obj") ? "#4ADE80" : nil
            }
            return [
                "levels": signalCase.levels.map { level -> [String: Any] in
                    var item: [String: Any] = ["price": level.price]
                    if let role = level.role { item["role"] = role }
                    if let tint = color(level.role) { item["color"] = tint }
                    return item
                },
                "bands": signalCase.bands.map { [$0.0, $0.1, $0.2] as [Any] },
                "floor": signalCase.priceRange.lowerBound,
                "ceiling": signalCase.priceRange.upperBound,
                "groupPrices": signalCase.priceRange.upperBound >= 10_000,
            ]
        }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "level", let number = message.body as? Double { parent.onLevel(number); return }
            if message.name == "ready", let url = Bundle.main.url(forResource: parent.signalCase.marketResource, withExtension: "json"), let data = try? Data(contentsOf: url), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let rows = obj["candles"], let encoded = try? JSONSerialization.data(withJSONObject: rows), let json = String(data: encoded, encoding: .utf8),
               let config = try? JSONSerialization.data(withJSONObject: Self.chartConfig(parent.signalCase)), let caseJSON = String(data: config, encoding: .utf8) {
                ready = true
                // Live candles when they already arrived, the bundled snapshot otherwise.
                let live = parent.liveCandles.flatMap { Self.encode($0) }
                pushedLive = live == nil ? nil : parent.liveCandles?.last
                web?.evaluateJavaScript("window.setCase(\(caseJSON));window.setCandles(\(live ?? json));window.focusLevel(\(parent.selected));", completionHandler: nil)
            }
        }
    }
}

private final class EdgeAwareChartWebView: WKWebView {
    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        // WebKit's chart touch handlers must leave the native back edge free.
        // Panning and level selection remain available throughout the chart.
        guard point.x >= 20 else { return nil }
        return super.hitTest(point, with: event)
    }
}
