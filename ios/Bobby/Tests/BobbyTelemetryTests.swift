import Foundation
import XCTest
@testable import Bobby

@MainActor
final class BobbyTelemetryTests: XCTestCase {
    private func drain(_ client: BobbyTelemetry) async {
        for _ in 0..<150 {
            if client.pendingCount == 0 { try? await Task.sleep(nanoseconds: 30_000_000); return }
            try? await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("bounded queue did not drain")
    }

    func testSchemaUsesExistingIdentityHeadersAndOnlyAllowedScalarFields() async {
        var packets: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { UUID(uuidString: "00000000-0000-4000-8000-000000000001")! }, automaticHeartbeat: false,
                                    version: "1.6", build: "54", transport: { body, _ in packets.append(body); return 202 })
        client.becameActive(); await drain(client)
        let packet = packets[0]
        XCTAssertEqual(packet.json["schemaVersion"] as? Int, 1)
        XCTAssertEqual(packet.event, .foreground)
        XCTAssertEqual(packet.version, "1.6"); XCTAssertEqual(packet.build, "54")
        XCTAssertNotNil(UUID(uuidString: packet.eventId)); XCTAssertNotNil(UUID(uuidString: packet.sessionId))
        XCTAssertNotNil(BobbyAccessAPI.date(packet.occurredAt))
        XCTAssertEqual(Set(packet.json.keys), ["schemaVersion", "eventId", "sessionId", "sequence", "event", "occurredAt", "version", "build"])
        XCTAssertEqual(BobbyAccessAPI.headers(bearer: nil)["x-bobby-device"], BobbyDevice.id)
        XCTAssertEqual(BobbyAccessAPI.headers(bearer: "test")["x-bobby-platform"], "ios")
        client.wentBackground(); await drain(client)
    }

    func testReceiptRequiresMatchingRequestAndBoundedOpaqueToken() {
        let id = UUID().uuidString.lowercased()
        XCTAssertNotNil(BobbyTelemetryReceipt(json: ["requestId": id, "receipt": "opaque.signed-token"], expectedRequestId: id))
        for json: [String: Any] in [["requestId": UUID().uuidString, "receipt": "token"], ["requestId": id, "receipt": ""],
                                    ["requestId": id, "receipt": String(repeating: "a", count: 1025)], ["requestId": id, "receipt": "private text"],
                                    ["requestId": id, "receipt": true]] {
            XCTAssertNil(BobbyTelemetryReceipt(json: json, expectedRequestId: id))
        }
        XCTAssertNil(BobbyTelemetry.shortTag("version with text"))
        XCTAssertNil(BobbyTelemetry.shortTag(String(repeating: "1", count: 33)))
        XCTAssertEqual(BobbyTelemetry.shortTag("1.6.0-beta+54"), "1.6.0-beta+54")
    }

    func testEpochsHaveDistinctSessionsAndMonotonicCapturedTimeAndSequence() async {
        let owner = UUID(); let clock = Date(timeIntervalSince1970: 1_800_000_000)
        var packets: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { owner }, now: { clock }, automaticHeartbeat: false, transport: { p, _ in packets.append(p); return 200 })
        client.becameActive(); client.heartbeat(); await drain(client)
        client.wentBackground(); await drain(client)
        client.becameActive(); await drain(client)
        XCTAssertEqual(packets.map(\.event), [.foreground, .heartbeat, .background, .foreground])
        XCTAssertEqual(packets.map(\.sequence), [1, 2, 3, 1])
        XCTAssertEqual(packets[0].sessionId, packets[2].sessionId)
        XCTAssertNotEqual(packets[2].sessionId, packets[3].sessionId)
        let dates = packets.compactMap { BobbyAccessAPI.date($0.occurredAt) }
        XCTAssertEqual(dates.count, 4)
        XCTAssertTrue(zip(dates, dates.dropFirst()).allSatisfy { $0.0 < $0.1 })
        client.wentBackground(); await drain(client)
    }

    func testInactiveDoesNotInventBackgroundAndPausesHeartbeats() async {
        let owner = UUID(); var packets: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { p, _ in packets.append(p); return 200 })
        client.becameActive(); await drain(client)
        let session = client.sessionId
        client.becameInactive(); client.heartbeat(); await drain(client)
        XCTAssertEqual(packets.map(\.event), [.foreground])
        client.becameActive(); client.heartbeat(); await drain(client)
        XCTAssertEqual(client.sessionId, session)
        XCTAssertEqual(packets.map(\.event), [.foreground, .foreground, .heartbeat])
        client.wentBackground(); await drain(client)
        client.heartbeat(); await drain(client)
        XCTAssertEqual(packets.last?.event, .background)
    }

    func testDecodeNeverClaimsPresentationAndRenderNeedsCurrentReceiptOnce() async throws {
        let owner = UUID(), id = UUID().uuidString.lowercased(); var packets: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { p, _ in packets.append(p); return 200 })
        client.becameActive(); client.readStarted(id); await drain(client)
        XCTAssertFalse(client.readRendered(id), "no authenticated server receipt")
        let receipt = try XCTUnwrap(BobbyTelemetryReceipt(json: ["requestId": id, "receipt": "signed"], expectedRequestId: id))
        client.readReceived(receipt); client.readReceived(receipt); await drain(client)
        XCTAssertEqual(packets.map(\.event), [.foreground, .readStarted, .readReceived], "network parsing is not presentation")
        XCTAssertTrue(client.readRendered(id)); XCTAssertFalse(client.readRendered(id)); await drain(client)
        XCTAssertEqual(packets.last?.event, .readRendered)
        XCTAssertEqual(packets.last?.receipt, "signed")
        client.wentBackground(); await drain(client)
        XCTAssertFalse(client.readRendered(id))
        client.becameActive(); await drain(client)
        client.readReceived(receipt); XCTAssertFalse(client.readRendered(id), "old-epoch receipt cannot revive")
        client.wentBackground(); await drain(client)
    }

    func testAccountChangeCancelsAndForgetsOldOwnerEvenWhenSameAccountSignsBackIn() async throws {
        var owner = UUID(); var packets: [(BobbyTelemetry.Payload, UUID)] = []
        let oldOwner = owner, id = UUID().uuidString.lowercased()
        let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { p, o in packets.append((p,o)); return 200 })
        client.becameActive(); client.readStarted(id); await drain(client)
        let oldSession = client.sessionId
        owner = UUID(); client.accountChanged(); await drain(client)
        let receipt = try XCTUnwrap(BobbyTelemetryReceipt(json: ["requestId": id, "receipt": "signed"], expectedRequestId: id))
        client.readReceived(receipt); XCTAssertFalse(client.readRendered(id)); await drain(client)
        XCTAssertNotEqual(oldSession, client.sessionId)
        XCTAssertEqual(packets.map { $0.0.event }, [.foreground, .readStarted, .foreground])
        XCTAssertEqual(packets[0].1, oldOwner); XCTAssertEqual(packets.last?.1, owner)
        client.wentBackground(); await drain(client)
    }

    func testReadRetriesKeepSameIdTimestampAndSequenceButLifecycleNeverRetries() async throws {
        let owner = UUID(), id = UUID().uuidString.lowercased(); var attempts: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { p, _ in attempts.append(p); return 503 })
        client.becameActive(); client.readStarted(id)
        try await Task.sleep(nanoseconds: 350_000_000)
        XCTAssertEqual(attempts.filter { $0.event == .foreground }.count, 1)
        let reads = attempts.filter { $0.event == .readStarted }
        XCTAssertEqual(reads.count, 2)
        XCTAssertEqual(reads.first?.eventId, reads.last?.eventId)
        XCTAssertEqual(reads.first?.occurredAt, reads.last?.occurredAt)
        XCTAssertEqual(reads.first?.sequence, reads.last?.sequence)
        client.wentBackground(); await drain(client)
        XCTAssertEqual(attempts.filter { $0.event == .background }.count, 1)
    }

    func testBackgroundAndAccountChangeStopInFlightRetries() async throws {
        for accountChange in [false, true] {
            var owner = UUID(); var attempted: [BobbyTelemetry.Payload] = []
            let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { p, _ in
                attempted.append(p)
                try await Task.sleep(nanoseconds: 100_000_000)
                return 503
            })
            client.becameActive(); try await Task.sleep(nanoseconds: 120_000_000)
            client.readStarted(UUID().uuidString.lowercased()); try await Task.sleep(nanoseconds: 10_000_000)
            if accountChange { owner = UUID(); client.accountChanged() } else { client.wentBackground() }
            try await Task.sleep(nanoseconds: 350_000_000)
            XCTAssertEqual(attempted.filter { $0.event == .readStarted }.count, 1)
            XCTAssertEqual(attempted.last?.event, accountChange ? .foreground : .background)
            client.wentBackground(); await drain(client)
        }
    }

    func testQueueIsBoundedAndDisabledFixturesNeverSend() async throws {
        let owner = UUID(); var sends = 0
        let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { _, _ in
            sends += 1; try await Task.sleep(nanoseconds: 1_000_000_000); return 200
        })
        client.becameActive()
        for _ in 0..<80 { client.readStarted(UUID().uuidString.lowercased()) }
        XCTAssertLessThanOrEqual(client.pendingCount, BobbyTelemetry.queueLimit)
        client.becameInactive(); try await Task.sleep(nanoseconds: 20_000_000)
        XCTAssertEqual(client.pendingCount, 0)
        let disabled = BobbyTelemetry(owner: { owner }, enabled: { false }, automaticHeartbeat: false, transport: { _, _ in sends += 1; return 200 })
        let previous = sends
        disabled.becameActive(); disabled.heartbeat(); disabled.webviewTerminated(); disabled.readStarted(UUID().uuidString)
        await drain(disabled)
        XCTAssertEqual(sends, previous); XCTAssertNil(disabled.sessionId)
    }

    func testExpiredQueuedHeartbeatDoesNotRevivePresence() async throws {
        let owner = UUID(); var clock = Date(); var sent: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { owner }, now: { clock }, automaticHeartbeat: false, transport: { p, _ in sent.append(p); return 200 })
        client.becameActive(); client.heartbeat(); clock = clock.addingTimeInterval(6)
        await drain(client)
        XCTAssertTrue(sent.isEmpty)
        client.wentBackground(); await drain(client)
        XCTAssertEqual(sent.map(\.event), [.background])
    }

    func testWebKitTerminationHasItsOwnEventAndNeverInventsCrash() async {
        let owner = UUID(); var sent: [BobbyTelemetry.Payload] = []
        let client = BobbyTelemetry(owner: { owner }, automaticHeartbeat: false, transport: { p, _ in sent.append(p); return 200 })
        client.becameActive(); client.webviewTerminated(); await drain(client)
        XCTAssertEqual(sent.last?.event.rawValue, "webview_terminated")
        XCTAssertFalse(sent.contains { $0.json.values.contains { ($0 as? String) == "crash" } })
        client.wentBackground(); await drain(client)
    }
}
