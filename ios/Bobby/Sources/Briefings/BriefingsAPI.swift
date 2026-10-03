// Bobby Pro market briefings — HTTP client (build 53).
// Paths and shapes: docs/product/pro-market-briefings-implementation.md §4 (vercel.json rewrites map the
// contract paths onto the api/briefings.ts router). Invariants:
//  - JSON calls go through BobbyAccessAPI.send: the bearer comes from BobbyMeterAuth, a 401 refreshes once and
//    retries once, and an account change mid-request throws (no late answer reaches the caller as success).
//  - Audio bytes go through AccountSession.send (same refresh + generation guard, raw Data body).
//  - Every failure maps to BriefingsError by status and machine `code`; the server's text is never surfaced.
//  - Ids are validated as UUIDs before any request; nothing personal is put in a URL except the opaque
//    report/audio id and the server's signed cursor.
//  - The transport is a struct of closures so tests drive every answer (no URLSession.shared in tests).
import Foundation

struct BriefingsReply {
    let json: Any?
    let status: Int
    /// Lowercased header names (BobbyAPI.responseWithHeaders).
    let headers: [String: String]
}

struct BriefingsTransport {
    /// One JSON call with the account bearer from `auth` plus `headers`.
    var json: (_ path: String, _ method: String, _ body: [String: Any]?, _ headers: [String: String],
               _ auth: BobbyMeterAuth) async throws -> BriefingsReply
    /// One authorized byte request (audio).
    var bytes: (_ request: URLRequest) async throws -> AuthorizedResponse

    static let live = BriefingsTransport(
        json: { path, method, body, headers, auth in
            let reply = try await BobbyAccessAPI.send(path, method: method, body: body, auth: auth,
                                                      timeout: BriefingsAPI.timeout, extraHeaders: headers)
            return BriefingsReply(json: reply.json, status: reply.status, headers: reply.headers)
        },
        bytes: { request in try await AccountSession.shared.send(request) })
}

extension BobbyMeterAuth {
    /// A fixed bearer with no refresh and no account epoch: the outgoing account's token at sign-out, so a
    /// late cleanup can never borrow the next account's bearer.
    static func outgoing(_ token: String) -> BobbyMeterAuth {
        BobbyMeterAuth(bearer: { token }, refresh: { _ in nil }, owner: { nil })
    }
}

/// The client-reported device facts for POST /api/briefing-device.
struct BriefingDeviceRegistration: Equatable, Sendable {
    let installationId: String
    let apnsToken: String
    let permissionState: String
    let appBuild: Int
    /// "production" | "sandbox", derived from the signed provisioning profile (never DEBUG).
    let apnsEnvironment: String

    var body: [String: Any] {
        ["installationId": installationId, "apnsToken": apnsToken, "permissionState": permissionState,
         "appBuild": appBuild, "apnsEnvironment": apnsEnvironment]
    }
}

struct BriefingsAPI {
    static let settingsPath = "api/briefing-settings"
    static let devicePath = "api/briefing-device"
    static let inboxPath = "api/briefings"
    static let reportPath = "api/briefing"
    static let voicePath = "api/briefing-voice"
    static let audioPath = "api/briefing-audio"
    static let proofHeader = "X-Bobby-Installation-Proof"
    static let idempotencyHeader = "Idempotency-Key"
    static let timeout: TimeInterval = 30
    static let inboxMax = 20

    var transport: BriefingsTransport = .live
    var auth: BobbyMeterAuth = .account

    // MARK: settings

    /// GET /api/briefing-settings (verified account; no Pro requirement).
    func settings() async throws -> BriefingSettingsSnapshot {
        let reply = try await call(Self.settingsPath, method: "GET")
        return try Self.snapshot(reply)
    }

    /// PATCH with `If-Match: "<revision>"`. A stale revision throws `.conflict(revision:)`.
    func patchSettings(revision: Int, changes: [String: Any]) async throws -> BriefingSettingsSnapshot {
        let reply = try await call(Self.settingsPath, method: "PATCH", body: changes, headers: ["If-Match": "\"\(revision)\""])
        return try Self.snapshot(reply)
    }

    // MARK: device

    /// First binding: `201 {registrationId, bindingRevision, installationCredential}`.
    func registerDevice(_ device: BriefingDeviceRegistration, idempotencyKey: String) async throws -> BriefingDeviceReceipt {
        let reply = try await call(Self.devicePath, method: "POST", body: device.body,
                                   headers: [Self.idempotencyHeader: idempotencyKey])
        return try Self.receipt(reply)
    }

    /// Token rotation / owner change: proof of the stored installation credential + binding revision CAS.
    func rebindDevice(_ device: BriefingDeviceRegistration, registrationId: String, expectedBindingRevision: Int,
                      proof: String, idempotencyKey: String) async throws -> BriefingDeviceReceipt {
        var body = device.body
        body["registrationId"] = registrationId
        body["expectedBindingRevision"] = expectedBindingRevision
        let reply = try await call(Self.devicePath, method: "POST", body: body,
                                   headers: [Self.idempotencyHeader: idempotencyKey, Self.proofHeader: proof])
        return try Self.receipt(reply)
    }

    /// Owner-scoped, idempotent revocation (`204`, also when already revoked or missing for this caller).
    /// `auth` overrides the account bearer: sign-out passes the outgoing account's token.
    func revokeDevice(registrationId: String, expectedBindingRevision: Int, proof: String, auth: BobbyMeterAuth? = nil) async throws {
        let reply = try await call(Self.devicePath, method: "DELETE",
                                   body: ["registrationId": registrationId, "expectedBindingRevision": expectedBindingRevision],
                                   headers: [Self.proofHeader: proof], auth: auth)
        guard (200..<300).contains(reply.status) else { throw Self.error(reply) }
    }

    // MARK: inbox and reports

    func inbox(cadence: BriefingCadence? = nil, cursor: String? = nil, limit: Int = BriefingsAPI.inboxMax) async throws -> BriefingInboxPage {
        let reply = try await call(Self.inboxPath(cadence: cadence, cursor: cursor, limit: limit), method: "GET")
        guard (200..<300).contains(reply.status) else { throw Self.error(reply) }
        // A body we cannot read is not an empty inbox.
        guard let page = BriefingInboxPage(json: reply.json) else { throw BriefingsError.unavailable }
        return page
    }

    static func inboxPath(cadence: BriefingCadence?, cursor: String?, limit: Int) -> String {
        var query = "limit=\(min(max(limit, 1), inboxMax))"
        if let cadence { query += "&cadence=" + cadence.rawValue }
        if let cursor, !cursor.isEmpty { query += "&cursor=" + queryValue(cursor) }
        return inboxPath + "?" + query
    }

    /// RFC 3986 unreserved characters only: `+`, `/`, `=` and `&` in an opaque cursor are always escaped
    /// (URLComponents leaves `+`, which a server decodes as a space).
    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    static func queryValue(_ value: String) -> String { value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "" }

    /// GET /api/briefing?id= — re-authorizes on every open (owner + current Pro).
    func report(id: String) async throws -> BriefingReport {
        guard let id = BriefingJSON.uuid(id) else { throw BriefingsError.notFound }
        let reply = try await call(Self.reportPath + "?id=" + id, method: "GET")
        guard (200..<300).contains(reply.status) else { throw Self.error(reply) }
        guard let report = BriefingReport(json: reply.json), report.id == id else { throw BriefingsError.unavailable }
        return report
    }

    // MARK: voice and audio

    /// POST /api/briefing-voice: the server loads the segment text from the owned report; the client sends
    /// no text, name, prompt or URL.
    func requestVoice(briefId: String, contentVersion: Int, segment: Int, voice: String, language: String,
                      idempotencyKey: String) async throws -> BriefingVoiceState {
        guard let briefId = BriefingJSON.uuid(briefId) else { throw BriefingsError.notFound }
        guard (0..<BriefingReport.maxSegments).contains(segment), contentVersion > 0 else { throw BriefingsError.rejected(code: "invalid_request") }
        let reply = try await call(Self.voicePath, method: "POST",
                                   body: ["briefId": briefId, "contentVersion": contentVersion, "segmentIndex": segment,
                                          "voice": voice, "language": language],
                                   headers: [Self.idempotencyHeader: idempotencyKey])
        guard (200..<300).contains(reply.status) else { throw Self.error(reply) }
        guard let state = BriefingVoiceState(json: reply.json) else { throw BriefingsError.unavailable }
        return state
    }

    /// GET /api/briefing-audio?id= — private authenticated serving; no public blob URL.
    func audio(id: String) async -> BriefingAudio {
        guard let id = BriefingJSON.uuid(id), let url = URL(string: BobbyAPI.base.absoluteString + "/" + Self.audioPath + "?id=" + id) else {
            return .notFound
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = Self.timeout
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("https://bobbyprotocol.xyz", forHTTPHeaderField: "Origin")
        request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
        request.setValue("audio/mpeg, application/json", forHTTPHeaderField: "Accept")
        guard let answer = try? await transport.bytes(request) else { return .unavailable }
        return Self.audio(answer)
    }

    static func audio(_ answer: AuthorizedResponse) -> BriefingAudio {
        switch answer {
        case .signedOut: return .forbidden
        case .unavailable: return .unavailable
        case let .answered(data, status):
            switch status {
            case 200: return data.isEmpty ? .unavailable : .ready(data)
            case 202:
                let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                let seconds = (body?["retryAfterSeconds"] as? NSNumber)?.doubleValue ?? 2
                return .pending(retryAfter: seconds.isFinite ? min(max(seconds, 1), 30) : 2)
            case 404: return .notFound
            case 401, 403: return .forbidden
            default: return .unavailable
            }
        }
    }

    // MARK: plumbing

    private func call(_ path: String, method: String, body: [String: Any]? = nil, headers: [String: String] = [:],
                      auth override: BobbyMeterAuth? = nil) async throws -> BriefingsReply {
        do {
            return try await transport.json(path, method, body, headers, override ?? auth)
        } catch let error as BriefingsError {
            throw error
        } catch {
            // Offline, a timeout, or the account changed while the request flew (CancellationError).
            throw BriefingsError.unavailable
        }
    }

    static func snapshot(_ reply: BriefingsReply) throws -> BriefingSettingsSnapshot {
        guard (200..<300).contains(reply.status) else { throw error(reply) }
        var json = reply.json as? [String: Any] ?? [:]
        // The revision lives in the body and in the ETag; either is enough.
        if BriefingJSON.int(json["revision"]) == nil, let etag = etagRevision(reply.headers["etag"]) { json["revision"] = etag }
        guard let snapshot = BriefingSettingsSnapshot(json: json) else { throw BriefingsError.unavailable }
        return snapshot
    }

    static func receipt(_ reply: BriefingsReply) throws -> BriefingDeviceReceipt {
        guard (200..<300).contains(reply.status) else { throw error(reply) }
        guard let receipt = BriefingDeviceReceipt(json: reply.json) else { throw BriefingsError.unavailable }
        return receipt
    }

    /// `"5"` or `W/"5"` → 5.
    static func etagRevision(_ raw: String?) -> Int? {
        guard var text = raw?.trimmingCharacters(in: .whitespaces) else { return nil }
        if text.hasPrefix("W/") { text.removeFirst(2) }
        return Int(text.trimmingCharacters(in: CharacterSet(charactersIn: "\"")))
    }

    /// Status + machine code → BriefingsError (contract §Common errors).
    static func error(_ reply: BriefingsReply) -> BriefingsError {
        let body = reply.json as? [String: Any]
        let code = body?["code"] as? String
        if code == "consent_required" { return .consentRequired }
        switch reply.status {
        case 401: return .signedOut
        case 403: return code == nil || code == "subscription_required" ? .subscriptionRequired : .rejected(code: code)
        case 404: return .notFound
        case 409:
            if code == "idempotency_mismatch" { return .rejected(code: code) }
            return .conflict(revision: BriefingJSON.int(body?["revision"]) ?? BriefingJSON.int(body?["bindingRevision"]))
        case 408, 429, 500...: return .unavailable
        default: return .rejected(code: code)
        }
    }
}
