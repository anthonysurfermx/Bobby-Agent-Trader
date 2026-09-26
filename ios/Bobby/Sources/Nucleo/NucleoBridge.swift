// Núcleo bridge, protocol v1 (Nucleo/ARCHITECTURE.md §2). The ONLY door between the
// bundled page and the app: the page never touches the network, never names an asset
// and never mints XP. Every envelope is checked here (frame, origin, shape, types)
// before a method runs, and every reply is `{v:1, ok, result|error}`.
import Foundation
import WebKit

/// A protocol fault (`ok:false`). Domain outcomes (quota, unknown asset…) are results, not faults.
struct NucleoFault: Error, Equatable {
    let code: String
    let message: String

    static func invalid(_ message: String) -> NucleoFault { NucleoFault(code: "invalid_params", message: message) }
    static let busy = NucleoFault(code: "busy", message: "a read is already running")
    static let forbidden = NucleoFault(code: "forbidden", message: "untrusted frame")
    static func unknownMethod(_ method: String) -> NucleoFault { NucleoFault(code: "unknown_method", message: method) }
    static func internalError(_ message: String) -> NucleoFault { NucleoFault(code: "internal", message: message) }
}

/// Typed access to an envelope's `params`. JSON null counts as absent; unknown keys are ignored.
struct NucleoParams {
    let raw: [String: Any]

    init(_ raw: [String: Any]) { self.raw = raw }

    func has(_ key: String) -> Bool { value(key) != nil }

    func value(_ key: String) -> Any? {
        guard let v = raw[key], !(v is NSNull) else { return nil }
        return v
    }

    func string(_ key: String, required: Bool = true, maxLength: Int? = nil, pattern: String? = nil, oneOf: Set<String>? = nil) throws -> String? {
        guard let v = value(key) else {
            if required { throw NucleoFault.invalid("\(key) required") }
            return nil
        }
        guard let s = v as? String else { throw NucleoFault.invalid("\(key) must be a string") }
        if let maxLength, s.count > maxLength { throw NucleoFault.invalid("\(key) too long") }
        if let pattern, s.range(of: pattern, options: .regularExpression) == nil { throw NucleoFault.invalid("\(key) format") }
        if let oneOf, !oneOf.contains(s) { throw NucleoFault.invalid("\(key) not allowed") }
        return s
    }

    func bool(_ key: String, required: Bool = true) throws -> Bool? {
        guard let v = value(key) else {
            if required { throw NucleoFault.invalid("\(key) required") }
            return nil
        }
        guard let n = v as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { throw NucleoFault.invalid("\(key) must be a boolean") }
        return n.boolValue
    }

    func int(_ key: String, required: Bool = true, oneOf: Set<Int>? = nil) throws -> Int? {
        guard let v = value(key) else {
            if required { throw NucleoFault.invalid("\(key) required") }
            return nil
        }
        guard let n = v as? NSNumber, CFGetTypeID(n) != CFBooleanGetTypeID() else { throw NucleoFault.invalid("\(key) must be an integer") }
        let d = n.doubleValue
        guard d.isFinite, d == d.rounded(), abs(d) < 1e15 else { throw NucleoFault.invalid("\(key) must be an integer") }
        let i = Int(d)
        if let oneOf, !oneOf.contains(i) { throw NucleoFault.invalid("\(key) not allowed") }
        return i
    }
}

@MainActor
final class NucleoBridge: NSObject, WKScriptMessageHandlerWithReply {
    static let version = 1
    static let maxEnvelopeBytes = 64 * 1024
    static let methods: Set<String> = [
        "session", "roster", "suggestions", "ask", "cancel",
        "speech.permission", "speech.requestPermission", "speech.start", "speech.stop",
        "speak", "previewVoice", "stopSpeaking", "setMuted", "haptic",
        "saveThesis", "island", "theses", "record",
        "setCompanion", "riskNotice", "acceptRisk", "signIn",
        "openNative", "openClassic", "finishOnboarding", "markHint", "log",
    ]

    /// Strong: the session never holds the bridge (WebKit does, until teardown removes the handler).
    private let session: NucleoSession

    init(session: NucleoSession) {
        self.session = session
        super.init()
    }

    // MARK: WKScriptMessageHandlerWithReply

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        let trusted = Self.isTrusted(isMainFrame: message.frameInfo.isMainFrame,
                                     originProtocol: message.frameInfo.securityOrigin.protocol,
                                     pageURL: message.webView?.url,
                                     nucleoDirectory: NucleoWebController.nucleoDirectory)
        if !trusted {
            // Never the page's data: only where it came from.
            print("[NucleoBridge] forbidden message from", message.frameInfo.securityOrigin.protocol, message.webView?.url?.lastPathComponent ?? "-")
        }
        return await handle(body: message.body, trusted: trusted)
    }

    /// The whole request/response path, callable without a web view (unit tests).
    func handle(body: Any, trusted: Bool) async -> (Any?, String?) {
        guard let envelope = body as? [String: Any],
              JSONSerialization.isValidJSONObject(envelope),
              let data = try? JSONSerialization.data(withJSONObject: envelope),
              data.count <= Self.maxEnvelopeBytes,
              let v = envelope["v"] as? NSNumber, CFGetTypeID(v) != CFBooleanGetTypeID(), v.intValue == Self.version, v.doubleValue == 1,
              let method = envelope["method"] as? String
        else { return (nil, "bad_envelope") }
        guard trusted else { return (Self.reply(NucleoFault.forbidden), nil) }
        guard Self.methods.contains(method) else { return (Self.reply(NucleoFault.unknownMethod(method)), nil) }
        let rawParams: [String: Any]
        switch envelope["params"] {
        case nil, is NSNull: rawParams = [:]
        case let dict as [String: Any]: rawParams = dict
        default: return (Self.reply(NucleoFault.invalid("params must be an object")), nil)
        }
        do {
            let result = try await session.dispatch(method, NucleoParams(rawParams))
            return (["v": Self.version, "ok": true, "result": result], nil)
        } catch let fault as NucleoFault {
            return (Self.reply(fault), nil)
        } catch {
            return (Self.reply(NucleoFault.internalError(String(describing: type(of: error)))), nil)
        }
    }

    static func reply(_ fault: NucleoFault) -> [String: Any] {
        ["v": version, "ok": false, "error": ["code": fault.code, "message": fault.message]]
    }

    /// §2.2.1: main frame, file origin, and a page inside the bundle's Nucleo/ directory.
    nonisolated static func isTrusted(isMainFrame: Bool, originProtocol: String, pageURL: URL?, nucleoDirectory: URL?) -> Bool {
        guard isMainFrame, originProtocol == "file", let pageURL, let nucleoDirectory else { return false }
        return isInside(pageURL, directory: nucleoDirectory)
    }

    /// A file URL whose standardized path sits under `directory` (a sibling like `Nucleo2/` does not).
    nonisolated static func isInside(_ url: URL, directory: URL) -> Bool {
        guard url.isFileURL else { return false }
        let path = url.standardizedFileURL.resolvingSymlinksInPath().path
        let root = directory.standardizedFileURL.resolvingSymlinksInPath().path
        return path.hasPrefix(root.hasSuffix("/") ? root : root + "/")
    }
}
