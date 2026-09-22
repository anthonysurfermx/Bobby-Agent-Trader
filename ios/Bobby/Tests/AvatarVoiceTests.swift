import AVFoundation
import XCTest
@testable import Bobby

private final class AvatarVoiceProtocol: URLProtocol {
    static var handler: ((AvatarVoiceProtocol) -> Void)?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        handler(self)
    }
    override func stopLoading() {}

    func respond(_ data: Data) {
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1",
                                       headerFields: ["Content-Type": "audio/mpeg"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    func body() throws -> [String: String] {
        var data = request.httpBody ?? Data()
        if data.isEmpty, let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                data.append(contentsOf: buffer.prefix(count))
            }
        }
        return try JSONDecoder().decode([String: String].self, from: data)
    }
}

/// The real AVAudioPlayer decodes and meters real bundled MP3 speech. Only
/// transport is stubbed: tests cannot create a paid session or reach production.
final class AvatarVoiceTests: XCTestCase {
    private var session: URLSession!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AvatarVoiceProtocol.self]
        session = URLSession(configuration: config)
    }

    override func tearDown() {
        session.invalidateAndCancel()
        AvatarVoiceProtocol.handler = nil
        super.tearDown()
    }

    private func clip() throws -> Data {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "select-orb-es", withExtension: "mp3"))
        return try Data(contentsOf: url)
    }

    @MainActor private func waitUntil(timeout: TimeInterval = 5, _ predicate: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !predicate(), Date() < deadline { try await Task.sleep(for: .milliseconds(40)) }
        XCTAssertTrue(predicate(), "Audio did not reach the expected playback state")
    }

    @MainActor func testBundledAvatarClipPlaysAudibleSamplesAndFinishesWithoutNetwork() async throws {
        AvatarVoiceProtocol.handler = { _ in XCTFail("A bundled avatar clip must not make a network request") }
        let voice = NeuralVoice(session: session)
        defer { voice.stop() }
        voice.speakClip("select-orb-es", fallbackText: "Hola", persona: "ash")
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        XCTAssertEqual(AVAudioSession.sharedInstance().category, .playback)
        XCTAssertEqual(AVAudioSession.sharedInstance().mode, .spokenAudio)
        let duration = try AVAudioPlayer(data: clip()).duration
        try await waitUntil(timeout: duration + 2) { !voice.speaking }
        XCTAssertEqual(voice.level, 0)
    }

    @MainActor func testNarratedVerdictUsesOnlyTTSAndPlaysTheReturnedMP3() async throws {
        let data = try clip()
        let request = expectation(description: "narration request")
        let line = "El escenario necesita confirmación antes de tomar una decisión."
        AvatarVoiceProtocol.handler = { stub in
            XCTAssertEqual(stub.request.url?.absoluteString, "https://bobbyprotocol.xyz/api/bobby-voice-free")
            XCTAssertEqual(stub.request.httpMethod, "POST")
            let body = try? stub.body()
            XCTAssertEqual(body?["text"], line)
            XCTAssertEqual(body?["voice"], "ash", "The avatar's identity wins over the profile default")
            XCTAssertEqual(body?["vibe"], "analytical")
            XCTAssertEqual(body?["mode"], "free", "Preserve the desk's existing free narration policy")
            XCTAssertNotNil(body?["lang"])
            request.fulfill()
            stub.respond(data)
        }
        let voice = NeuralVoice(session: session)
        defer { voice.stop() }
        voice.speak(line, voiceId: "coral", persona: "ash", vibe: "pro", free: true)
        await fulfillment(of: [request], timeout: 3)
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        voice.stop()
        XCTAssertFalse(voice.speaking)
        XCTAssertEqual(voice.level, 0)
    }

    @MainActor func testMissingClipFallsBackToNarrationWithoutOpeningALiveSession() async throws {
        let data = try clip()
        let request = expectation(description: "missing clip uses TTS")
        AvatarVoiceProtocol.handler = { stub in
            XCTAssertEqual(stub.request.url?.path, "/api/bobby-voice-free")
            XCTAssertEqual(try? stub.body()["voice"], "ash")
            request.fulfill()
            stub.respond(data)
        }
        let voice = NeuralVoice(session: session)
        defer { voice.stop() }
        voice.speakClip("missing-avatar-clip", fallbackText: "Hola", persona: "ash")
        await fulfillment(of: [request], timeout: 3)
        try await waitUntil { voice.speaking && voice.level > 0.06 }
    }

    @MainActor func testMuteDiscardsAnAudioResponseThatArrivesLate() async throws {
        let data = try clip()
        let request = expectation(description: "request before mute")
        var pending: AvatarVoiceProtocol?
        AvatarVoiceProtocol.handler = { stub in pending = stub; request.fulfill() }
        let voice = NeuralVoice(session: session)
        defer { voice.stop() }
        voice.speak("Hola", voiceId: "ash", essential: false)
        await fulfillment(of: [request], timeout: 3)
        voice.stop()
        try XCTUnwrap(pending).respond(data)
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertFalse(voice.speaking, "Muting must also invalidate pending narration")
        XCTAssertEqual(voice.level, 0)
    }
}
