// First-party client observations. No prompts, symbols, account IDs, or authentication credentials enter the payload.
// RAM only: failed telemetry cannot delay a read or survive an account/foreground epoch change.
import Foundation

struct BobbyTelemetryReceipt: Sendable, Equatable {
    let requestId: String
    let receipt: String

    init?(json: Any?, expectedRequestId: String) {
        guard let value = json as? [String: Any], let id = value["requestId"] as? String,
              id == expectedRequestId, UUID(uuidString: id) != nil,
              let receipt = value["receipt"] as? String, !receipt.isEmpty, receipt.utf8.count <= 1024,
              !receipt.contains(where: { $0.isWhitespace || $0.isNewline }) else { return nil }
        requestId = id; self.receipt = receipt
    }
}

@MainActor
final class BobbyTelemetry {
    enum Event: String, Sendable {
        case foreground, heartbeat, background
        case readStarted = "read_started", readReceived = "read_received", readRendered = "read_rendered"
        case webviewTerminated = "webview_terminated"
    }
    struct Payload: Sendable {
        let eventId: String, sessionId: String, occurredAt: String
        let sequence: Int
        let event: Event
        let version: String?, build: String?, requestId: String?, receipt: String?
        var json: [String: Any] {
            var out: [String: Any] = ["schemaVersion": 1, "eventId": eventId, "sessionId": sessionId,
                                     "sequence": sequence, "event": event.rawValue, "occurredAt": occurredAt]
            if let version { out["version"] = version }
            if let build { out["build"] = build }
            if let requestId { out["requestId"] = requestId }
            if let receipt { out["receipt"] = receipt }
            return out
        }
    }
    typealias Transport = @MainActor (Payload, UUID) async throws -> Int
    static let queueLimit = 24
    static let readLimit = 8
    static let heartbeatSeconds: TimeInterval = 30
    static let shared = BobbyTelemetry(owner: { AccountSession.shared.generation }, enabled: {
#if DEBUG
        !BobbyApp.isUnitTestHost && !NucleoFixtures.isActive
#else
        true
#endif
    }, transport: { payload, owner in
        guard AccountSession.shared.generation == owner else { throw CancellationError() }
        try Task.checkCancellation()
        let reply = try await BobbyAccessAPI.send("api/client-telemetry", body: payload.json, auth: .account, timeout: 5)
        return reply.status
    })

    private struct Pending {
        let payload: Payload, owner: UUID, createdAt: Date
        let epoch: UUID
    }
    private struct Read {
        let owner: UUID, sessionId: String
        var receipt: String?
        var rendered = false
    }
    private let owner: () -> UUID
    private let enabled: () -> Bool
    private let transport: Transport
    private let now: () -> Date
    private let automaticHeartbeat: Bool
    private let version: String?, build: String?
    private var lastOwner: UUID
    private var epoch = UUID()
    private(set) var sessionId: String?
    private(set) var isActive = false
    private var sequence = 0
    private var lastMilliseconds: Int64 = 0
    private var queue: [Pending] = []
    private var reads: [String: Read] = [:]
    private var readOrder: [String] = []
    private var worker: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    var pendingCount: Int { queue.count }

    init(owner: @escaping () -> UUID, enabled: @escaping () -> Bool = { true },
         now: @escaping () -> Date = { Date() }, automaticHeartbeat: Bool = true,
         version: String? = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
         build: String? = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String,
         transport: @escaping Transport) {
        self.owner = owner; self.enabled = enabled; self.transport = transport; self.now = now
        self.automaticHeartbeat = automaticHeartbeat; self.version = Self.shortTag(version); self.build = Self.shortTag(build)
        lastOwner = owner()
    }

    deinit { worker?.cancel(); heartbeatTask?.cancel() }

    static func shortTag(_ value: String?) -> String? {
        guard let value, value.range(of: #"^[A-Za-z0-9._+-]{1,32}$"#, options: .regularExpression) != nil else { return nil }
        return value
    }

    func becameActive() {
        guard enabled() else { return }
        synchronizeOwner()
        guard !isActive else { return }
        isActive = true
        if sessionId == nil { beginSession() } else { enqueue(.foreground) }
        startHeartbeat()
    }

    /// A permission sheet/control center pauses observations, but does not invent a background transition.
    func becameInactive() {
        isActive = false
        heartbeatTask?.cancel(); heartbeatTask = nil
        discardPending()
    }

    func wentBackground() {
        heartbeatTask?.cancel(); heartbeatTask = nil
        isActive = false
        synchronizeOwner()
        guard enabled(), sessionId != nil else { return }
        discardPending()
        reads.removeAll(); readOrder.removeAll()
        enqueue(.background)
        sessionId = nil
    }

    func accountChanged() { synchronizeOwner() }

    func heartbeat() {
        guard enabled(), isActive else { return }
        synchronizeOwner()
        guard sessionId != nil else { return }
        // Keep one current heartbeat; neither a retry nor an older queue item can revive presence.
        queue.removeAll { $0.payload.event == .heartbeat }
        enqueue(.heartbeat)
    }

    func readStarted(_ requestId: String) {
        guard enabled(), isActive, UUID(uuidString: requestId) != nil else { return }
        synchronizeOwner()
        guard let sessionId, reads[requestId] == nil else { return }
        reads[requestId] = Read(owner: lastOwner, sessionId: sessionId)
        readOrder.append(requestId)
        if readOrder.count > Self.readLimit { reads.removeValue(forKey: readOrder.removeFirst()) }
        enqueue(.readStarted, requestId: requestId)
    }

    func readReceived(_ receipt: BobbyTelemetryReceipt) {
        guard currentRead(receipt.requestId), var read = reads[receipt.requestId], read.receipt == nil else { return }
        read.receipt = receipt.receipt; reads[receipt.requestId] = read
        enqueue(.readReceived, requestId: receipt.requestId, receipt: receipt.receipt)
    }

    /// Called only by the view's visible-frame acknowledgment, never by JSON decoding.
    @discardableResult
    func readRendered(_ requestId: String) -> Bool {
        guard currentRead(requestId), var read = reads[requestId], let receipt = read.receipt, !read.rendered else { return false }
        read.rendered = true; reads[requestId] = read
        enqueue(.readRendered, requestId: requestId, receipt: receipt)
        return true
    }

    func webviewTerminated() {
        guard enabled(), isActive else { return }
        synchronizeOwner()
        enqueue(.webviewTerminated)
    }

    private func currentRead(_ id: String) -> Bool {
        guard enabled(), isActive else { return false }
        synchronizeOwner()
        guard let read = reads[id] else { return false }
        return read.owner == lastOwner && read.sessionId == sessionId
    }

    private func synchronizeOwner() {
        let value = owner()
        guard value != lastOwner else { return }
        lastOwner = value
        discardPending()
        reads.removeAll(); readOrder.removeAll(); sessionId = nil
        if isActive { beginSession() }
    }

    private func beginSession() {
        discardPending()
        sessionId = UUID().uuidString.lowercased(); sequence = 0
        reads.removeAll(); readOrder.removeAll()
        enqueue(.foreground)
    }

    private func discardPending() {
        epoch = UUID()
        worker?.cancel(); worker = nil; queue.removeAll()
    }

    private func startHeartbeat() {
        guard automaticHeartbeat else { return }
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                do { try await Task.sleep(nanoseconds: UInt64(Self.heartbeatSeconds * 1_000_000_000)) }
                catch { return }
                self?.heartbeat()
            }
        }
    }

    private func enqueue(_ event: Event, requestId: String? = nil, receipt: String? = nil) {
        guard let sessionId else { return }
        let createdAt = now()
        lastMilliseconds = max(lastMilliseconds + 1, Int64(createdAt.timeIntervalSince1970 * 1000))
        let formatter = ISO8601DateFormatter(); formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        sequence += 1
        let payload = Payload(eventId: UUID().uuidString.lowercased(), sessionId: sessionId,
                              occurredAt: formatter.string(from: Date(timeIntervalSince1970: Double(lastMilliseconds) / 1000)),
                              sequence: sequence, event: event, version: version, build: build, requestId: requestId, receipt: receipt)
        if queue.count >= Self.queueLimit { queue.removeFirst() }
        queue.append(Pending(payload: payload, owner: lastOwner, createdAt: createdAt, epoch: epoch))
        pump()
    }

    private func pump() {
        guard worker == nil else { return }
        let runningEpoch = epoch
        worker = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled, self.epoch == runningEpoch, let item = self.queue.first {
                self.queue.removeFirst()
                let readEvent = [.readStarted, .readReceived, .readRendered].contains(item.payload.event)
                let maxAge: TimeInterval = readEvent ? 30 : 5
                guard self.enabled(), item.owner == self.owner(), item.epoch == self.epoch,
                      self.now().timeIntervalSince(item.createdAt) <= maxAge,
                      item.payload.event == .background || self.isActive else { continue }
                // Lifecycle observations are never retried. Read acknowledgments get one bounded retry,
                // with the exact same id, sequence and captured timestamp for server-side deduplication.
                for attempt in 0..<(readEvent ? 2 : 1) {
                    guard !Task.isCancelled, self.epoch == runningEpoch, item.owner == self.owner(),
                          self.isActive || item.payload.event == .background,
                          self.now().timeIntervalSince(item.createdAt) <= maxAge else { break }
                    let transport = self.transport
                    let status = await NucleoAsync.withTimeout(5) { (try? await transport(item.payload, item.owner)) ?? 0 } ?? 0
                    if (200..<300).contains(status) || (400..<500).contains(status) && status != 429 { break }
                    if attempt == 0 && readEvent {
                        do { try await Task.sleep(nanoseconds: 200_000_000) } catch { break }
                    }
                }
            }
            if self.epoch == runningEpoch { self.worker = nil }
        }
    }
}
