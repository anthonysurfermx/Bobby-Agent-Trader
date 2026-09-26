// The Núcleo web view (Nucleo/ARCHITECTURE.md §2.1–2.2). Loads only the bundled pages
// in Nucleo/, never navigates anywhere else, keeps no website data, and delivers
// native events to the page with `callAsyncJavaScript` arguments (native never builds
// script strings, so nothing can be injected).
import SwiftUI
import UIKit
import WebKit

@MainActor
final class NucleoWebController: NSObject, WKNavigationDelegate, WKUIDelegate, NucleoEmitting {
    /// Bundle.main/Nucleo — the only directory the web view may load from.
    nonisolated static var nucleoDirectory: URL? { Bundle.main.url(forResource: "Nucleo", withExtension: nil) }

    /// High-rate events are coalesced (latest wins) to these minimum intervals.
    static let continuousIntervals: [String: CFTimeInterval] = ["speech.level": 1.0 / 30, "voice.level": 1.0 / 30, "voice.progress": 0.1]
    static let emitScript = "window.nucleoBridge && window.nucleoBridge.emit(name, payload); return true;"
    static let crossFadeSeconds: TimeInterval = 0.35
    static let overlayTimeoutSeconds: TimeInterval = 4

    let webView: WKWebView
    /// Hosts the web view plus the snapshot overlay of a cross-fade.
    let container = UIView()
    private(set) var page: NucleoPage = .app
    private var ready = false
    private var overlay: UIView?

    private struct Continuous {
        var pending: [String: Any]?
        var inFlight = false
        var scheduled = false
        var last: CFTimeInterval = 0
    }
    private var continuous: [String: Continuous] = [:]

    init(handler: WKScriptMessageHandlerWithReply) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.addScriptMessageHandler(handler, contentWorld: .page, name: "nucleo")
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false
#if DEBUG
        webView.isInspectable = true
#endif
        container.backgroundColor = .black
        webView.frame = container.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(webView)
    }

    // MARK: - Pages

    static func url(for page: NucleoPage) -> URL? {
        guard let dir = nucleoDirectory else { return nil }
        let file = dir.appendingPathComponent(page.file)
        guard let fragment = page.fragment else { return file }
        var parts = URLComponents(url: file, resolvingAgainstBaseURL: false)
        parts?.fragment = fragment
        return parts?.url ?? file
    }

    /// Loads a page. `crossFade` keeps a snapshot of the old page until the new one says hello.
    func load(_ page: NucleoPage, crossFade: Bool = false) {
        guard let dir = Self.nucleoDirectory, let url = Self.url(for: page) else { return }
        if crossFade, overlay == nil, let snapshot = webView.snapshotView(afterScreenUpdates: false) {
            snapshot.frame = container.bounds
            snapshot.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(snapshot)
            overlay = snapshot
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.overlayTimeoutSeconds) { [weak self] in self?.removeOverlay() }
        }
        self.page = page
        ready = false
        continuous.removeAll()
#if DEBUG
        print("[NucleoWeb] load \(page.file)\(page.fragment.map { "#" + $0 } ?? "")\(FileManager.default.fileExists(atPath: dir.appendingPathComponent(page.file).path) ? "" : " (MISSING: run Nucleo/build.py)")")
#endif
        webView.loadFileURL(url, allowingReadAccessTo: dir)
    }

    // MARK: - NucleoEmitting

    func pageReady() {
        ready = true
        removeOverlay()
    }

    private func removeOverlay() {
        guard let overlay else { return }
        self.overlay = nil
        UIView.animate(withDuration: Self.crossFadeSeconds, animations: { overlay.alpha = 0 }, completion: { _ in overlay.removeFromSuperview() })
    }

    /// Nothing is sent before the page's first `session` call. High-rate events keep only
    /// the latest value and never overlap a delivery of the same name still in flight.
    func emit(_ name: String, _ payload: [String: Any]) {
        guard ready else { return }
        guard let interval = Self.continuousIntervals[name] else {
            send(name, payload, completion: nil)
            return
        }
        continuous[name, default: Continuous()].pending = payload
        flush(name, interval: interval)
    }

    private func flush(_ name: String, interval: CFTimeInterval) {
        guard ready, var state = continuous[name], let payload = state.pending, !state.inFlight else { return }
        let wait = state.last + interval - CACurrentMediaTime()
        if wait > 0 {
            guard !state.scheduled else { return }
            state.scheduled = true
            continuous[name] = state
            DispatchQueue.main.asyncAfter(deadline: .now() + wait) { [weak self] in
                self?.continuous[name]?.scheduled = false
                self?.flush(name, interval: interval)
            }
            return
        }
        state.pending = nil
        state.inFlight = true
        state.last = CACurrentMediaTime()
        continuous[name] = state
        send(name, payload) { [weak self] in
            self?.continuous[name]?.inFlight = false
            self?.flush(name, interval: interval)
        }
    }

    private func send(_ name: String, _ payload: [String: Any], completion: (() -> Void)?) {
        webView.callAsyncJavaScript(Self.emitScript, arguments: ["name": name, "payload": payload], in: nil, in: .page) { _ in
            completion?()
        }
    }

    // MARK: - WKNavigationDelegate (§2.2.2): only the bundled Nucleo/ pages

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url, let dir = Self.nucleoDirectory,
              NucleoBridge.isInside(url, directory: dir) else {
#if DEBUG
            print("[NucleoWeb] blocked navigation to", navigationAction.request.url?.scheme ?? "-", navigationAction.request.url?.host ?? "")
#endif
            return .cancel
        }
        return .allow
    }

    /// The web content process died (memory pressure): reload the same page; it restores from `session().pendingRead`.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        load(page)
    }

    // MARK: - WKUIDelegate: no popups, ever

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        nil
    }

    // MARK: - Teardown

    func teardown() {
        ready = false
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.configuration.userContentController.removeAllScriptMessageHandlers()
        webView.removeFromSuperview()
    }
}

/// Hosts the controller's container in SwiftUI.
struct NucleoWebViewRepresentable: UIViewRepresentable {
    let controller: NucleoWebController

    func makeUIView(context: Context) -> UIView { controller.container }
    func updateUIView(_ uiView: UIView, context: Context) {}
}
