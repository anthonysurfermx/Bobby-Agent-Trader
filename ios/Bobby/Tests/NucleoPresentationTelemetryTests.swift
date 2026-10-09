import UIKit
import WebKit
import XCTest
@testable import Bobby

/// Executes the production acknowledgment function in real WKWebView animation frames.
/// The fixture response is already parsed; only the later visible DOM card can acknowledge it.
@MainActor
final class NucleoPresentationTelemetryTests: XCTestCase {
    private final class Recorder: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        let loaded: XCTestExpectation
        var messages: [[String: Any]] = []
        var presented: XCTestExpectation?
        init(loaded: XCTestExpectation) { self.loaded = loaded }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded.fulfill() }
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if let value = message.body as? [String: Any] { messages.append(value); presented?.fulfill() }
        }
    }

    func testActualFramesRequireVisibleCardAndDoNotExposeServerReceipt() async throws {
        let sourceURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Nucleo/src/app/55-read.js")
        let source = try String(contentsOf: sourceURL)
        let start = try XCTUnwrap(source.range(of: "function observePresentedRead(){"))
        let end = try XCTUnwrap(source.range(of: "/* the header's second line", range: start.upperBound..<source.endIndex))
        let observe = String(source[start.lowerBound..<end.lowerBound])
        let id = UUID().uuidString.lowercased()
        let loaded = expectation(description: "local page loaded")
        let recorder = Recorder(loaded: loaded)
        let config = WKWebViewConfiguration(); config.websiteDataStore = .nonPersistent()
        config.userContentController.add(recorder, name: "capture")
        let web = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        web.navigationDelegate = recorder
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let previousKey = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
        window.rootViewController = UIViewController(); window.rootViewController?.view.addSubview(web)
        window.makeKeyAndVisible()
        defer { web.stopLoading(); config.userContentController.removeAllScriptMessageHandlers(); window.isHidden = true; previousKey?.makeKey() }
        web.loadHTMLString("""
        <html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
        <div id="card" style="position:absolute;left:10px;top:200px;width:300px;height:100px;opacity:0">Fixture actual result</div>
        <script>
        var W=window,D=document,onScreen=true,SHEET=false,ST={name:'CARDS'};
        var READ={model:{},reply:{status:'ok'},requestId:'\(id)'};
        var A={cardsOn:true,viewOnly:false,rev:[{x:1}]},el={cards:[document.getElementById('card')]};
        function canRun(){return !D.hidden && onScreen && !SHEET;}
        function noop(){}
        function bcall(method,params){window.webkit.messageHandlers.capture.postMessage({method:method,params:params});return Promise.resolve({accepted:true});}
        \(observe)
        function frame(){observePresentedRead();requestAnimationFrame(frame);}requestAnimationFrame(frame);
        </script></body></html>
        """, baseURL: NucleoWebController.nucleoDirectory)
        await fulfillment(of: [loaded], timeout: 5)
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertTrue(recorder.messages.isEmpty, "parsed receipt/response alone cannot render")
        // A native sheet also prevents a visible card from reporting a presentation.
        _ = try await web.evaluateJavaScript("SHEET=true;el.cards[0].style.opacity='1';true")
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(recorder.messages.isEmpty)
        // A stored card can be visible beside a stale result object but never presents that result.
        _ = try await web.evaluateJavaScript("SHEET=false;ST.name='THESIS_VIEW';A.viewOnly=true;true")
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(recorder.messages.isEmpty, "stored explanation is no new result receipt")
        // The view-only flag independently protects a stored card while state transitions settle.
        _ = try await web.evaluateJavaScript("ST.name='CARDS';true")
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertTrue(recorder.messages.isEmpty, "view-only never acknowledges the retained request")
        let presented = expectation(description: "visible card after two real frames")
        recorder.presented = presented
        _ = try await web.evaluateJavaScript("A.viewOnly=false;true")
        await fulfillment(of: [presented], timeout: 5)
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(recorder.messages.count, 1)
        XCTAssertEqual(recorder.messages.first?["method"] as? String, "read.rendered")
        let params = try XCTUnwrap(recorder.messages.first?["params"] as? [String: Any])
        XCTAssertEqual(params["requestId"] as? String, id)
        XCTAssertEqual(Set(params.keys), ["requestId"], "receipt and read text stay native")
    }
}
