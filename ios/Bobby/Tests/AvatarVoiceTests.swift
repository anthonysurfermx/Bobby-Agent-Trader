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

    func respond(_ data: Data, status: Int = 200) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1",
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
    private var defaults: UserDefaults!
    private var defaultsSuite: String!

    override func setUp() {
        super.setUp()
        defaultsSuite = "avatar-voice-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuite)!
        // Every network-positive test explicitly uses current consent, independent of the test host.
        defaults.set(RiskNotice.currentVersion, forKey: "agent.riskNoticeVersion")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [AvatarVoiceProtocol.self]
        session = URLSession(configuration: config)
    }

    override func tearDown() {
        session.invalidateAndCancel()
        defaults.removePersistentDomain(forName: defaultsSuite)
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
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        AvatarVoiceProtocol.handler = { _ in XCTFail("A bundled avatar clip must not make a network request") }
        let voice = NeuralVoice(session: session, defaults: defaults)
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
            XCTAssertNil(body?["mode"], "Keep the persona voice instead of forcing the generic free voice")
            XCTAssertEqual(body?["lang"], L.ttsLang)
            request.fulfill()
            stub.respond(data)
        }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speak(line, voiceId: "coral", persona: "ash", vibe: "pro")
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
        let voice = NeuralVoice(session: session, defaults: defaults)
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
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speak("Hola", voiceId: "ash", essential: false)
        await fulfillment(of: [request], timeout: 3)
        voice.isMuted = true
        try XCTUnwrap(pending).respond(data)
        try await Task.sleep(for: .milliseconds(300))
        XCTAssertFalse(voice.speaking, "Muting must also invalidate pending narration")
        XCTAssertEqual(voice.level, 0)
    }

    /// Exercise every bundled selection and style through NeuralVoice's actual
    /// AVAudioPlayer and mouth meter, in both languages, with the network denied.
    @MainActor func testEveryAvatarAndStyleHasAudibleOfflineSpeechInBothLanguages() async throws {
        AvatarVoiceProtocol.handler = { _ in XCTFail("Every avatar/style must have bundled speech") }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        var clips: [String: String] = [:]
        for companion in bobbyCompanions {
            for lang in ["en", "es"] {
                clips["select-\(companion.id)-\(lang)"] = companion.voicePersona
                for vibe in AgentVibe.allCases {
                    clips["vibe-\(vibe.rawValue)-\(companion.voicePersona)-\(lang)"] = companion.voicePersona
                }
            }
        }
        XCTAssertEqual(bobbyCompanions.count, 18)
        XCTAssertEqual(clips.count, 108)
        for (name, persona) in clips.sorted(by: { $0.key < $1.key }) {
            XCTAssertNotNil(Bundle.main.url(forResource: name, withExtension: "mp3"), name)
            voice.speakClip(name, fallbackText: "Missing clip", persona: persona, playbackRate: 1.12)
            let deadline = Date().addingTimeInterval(3)
            while voice.level <= 0.06, Date() < deadline { try await Task.sleep(for: .milliseconds(40)) }
            XCTAssertTrue(voice.speaking && voice.level > 0.06, "Silent clip: \(name)")
            voice.stop()
        }
    }

    @MainActor func testEveryAvatarKeepsItsPersonaAndVibeInNarratedAnswers() async throws {
        let data = try clip()
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        for companion in bobbyCompanions {
            for vibe in AgentVibe.allCases {
                let request = expectation(description: "\(companion.id) / \(vibe.rawValue)")
                AvatarVoiceProtocol.handler = { stub in
                    let body = try? stub.body()
                    XCTAssertEqual(body?["voice"], companion.voicePersona)
                    XCTAssertEqual(body?["vibe"], NeuralVoice.serverVibe(vibe.rawValue))
                    XCTAssertEqual(body?["lang"], L.ttsLang)
                    XCTAssertNil(body?["mode"])
                    request.fulfill()
                    stub.respond(data)
                }
                voice.speak(companion.selectLine, voiceId: "coral", persona: companion.voicePersona, vibe: vibe.rawValue)
                await fulfillment(of: [request], timeout: 3)
                try await waitUntil { voice.speaking && voice.level > 0.06 }
                voice.stop()
            }
        }
    }

    @MainActor func testACompletedOldVoiceCannotStopTheNewAvatarsMouthAnimation() async throws {
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        let oldPlayer = try AVAudioPlayer(data: clip())
        voice.audioPlayerDidFinishPlaying(oldPlayer, successfully: true)
        voice.speechSynthesizer(AVSpeechSynthesizer(), didCancel: AVSpeechUtterance(string: "Old voice"))
        voice.speakClip("select-byte-en", fallbackText: "Hello", persona: "ballad")
        try await waitUntil { voice.speaking && voice.level > 0.06 }
    }
    @MainActor func testMutePersistsAndBlocksClipsAndNetworkUntilExplicitlyEnabled() async throws {
        AvatarVoiceProtocol.handler = { _ in XCTFail("Muted narration must not call TTS") }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speakClip("select-byte-es", fallbackText: "Hola", persona: "ballad")
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        voice.isMuted = true
        XCTAssertFalse(voice.speaking)
        XCTAssertEqual(voice.level, 0)
        XCTAssertTrue(defaults.bool(forKey: NeuralVoice.mutePreferenceKey))

        let relaunched = NeuralVoice(session: session, defaults: defaults)
        defer { relaunched.stop() }
        XCTAssertTrue(relaunched.isMuted)
        relaunched.speakClip("select-byte-en", fallbackText: "Hello", persona: "ballad")
        relaunched.speak("Hello", voiceId: "ballad")
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertFalse(relaunched.speaking)
        relaunched.isMuted = false
        relaunched.speakClip("select-byte-en", fallbackText: "Hello", persona: "ballad")
        try await waitUntil { relaunched.speaking && relaunched.level > 0.06 }
        XCTAssertFalse(defaults.bool(forKey: NeuralVoice.mutePreferenceKey))
    }

    @MainActor func testMissingOrStaleConsentBlocksExternalNarrationAndMissingClipFallback() async {
        let unexpected = expectation(description: "no external text without current consent")
        unexpected.isInverted = true
        AvatarVoiceProtocol.handler = { stub in unexpected.fulfill(); stub.respond(Data(), status: 503) }
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speak("Private question", voiceId: "ash")
        voice.speakClip("missing-avatar-clip", fallbackText: "Private question", persona: "ash")
        defaults.set(RiskNotice.currentVersion - 1, forKey: "agent.riskNoticeVersion")
        voice.speak("Still no current consent", voiceId: "ash")
        voice.speakClip("missing-avatar-clip", fallbackText: "Still no current consent", persona: "ash")
        await fulfillment(of: [unexpected], timeout: 0.3)
        XCTAssertFalse(voice.speaking)
        XCTAssertEqual(voice.level, 0)
    }

    @MainActor func testConsentIsReadDynamicallyAfterVoiceInitialization() async throws {
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        let requested = expectation(description: "current consent enables external narration")
        let data = try clip()
        AvatarVoiceProtocol.handler = { stub in requested.fulfill(); stub.respond(data) }
        defaults.set(RiskNotice.currentVersion, forKey: "agent.riskNoticeVersion")
        voice.speak("Explicitly accepted", voiceId: "ash", essential: false)
        await fulfillment(of: [requested], timeout: 3)
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        voice.stop()
        let unexpected = expectation(description: "same voice observes withdrawn consent")
        unexpected.isInverted = true
        AvatarVoiceProtocol.handler = { stub in unexpected.fulfill(); stub.respond(Data(), status: 503) }
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        voice.speak("Consent withdrawn", voiceId: "ash", essential: false)
        await fulfillment(of: [unexpected], timeout: 0.3)
        XCTAssertFalse(voice.speaking)
    }

    @MainActor func testWithdrawalDiscardsLateAudioAndDoesNotRetryALateFailure() async throws {
        let first = expectation(description: "request sent with consent")
        var pending: AvatarVoiceProtocol?
        AvatarVoiceProtocol.handler = { stub in pending = stub; first.fulfill() }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speak("Sent before withdrawal", voiceId: "ash", essential: false)
        await fulfillment(of: [first], timeout: 3)
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        let unexpected = expectation(description: "late failure never retries after withdrawal")
        unexpected.isInverted = true
        AvatarVoiceProtocol.handler = { stub in unexpected.fulfill(); stub.respond(Data(), status: 503) }
        try XCTUnwrap(pending).respond(Data(), status: 503)
        await fulfillment(of: [unexpected], timeout: 1.5)
        XCTAssertFalse(voice.speaking)
        XCTAssertEqual(voice.level, 0)

        // A successful response sent before withdrawal is discarded too.
        defaults.set(RiskNotice.currentVersion, forKey: "agent.riskNoticeVersion")
        let second = expectation(description: "another authorized request")
        pending = nil
        AvatarVoiceProtocol.handler = { stub in pending = stub; second.fulfill() }
        voice.speak("Authorized before withdrawal", voiceId: "ash", essential: false)
        await fulfillment(of: [second], timeout: 3)
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        try XCTUnwrap(pending).respond(clip())
        try await Task.sleep(for: .milliseconds(200))
        XCTAssertFalse(voice.speaking, "late external audio must not begin after withdrawal")
    }

    @MainActor private func verifyNoRetryAfterInvalidation(withdraw: Bool) async throws {
        let first = expectation(description: "first request enters retry delay")
        AvatarVoiceProtocol.handler = { stub in stub.respond(Data(), status: 503); first.fulfill() }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speak("Retrying preview", voiceId: "ash", essential: false)
        await fulfillment(of: [first], timeout: 3)
        // Let the real 1.2-second retry delay begin, then invalidate during that delay.
        try await Task.sleep(for: .milliseconds(100))
        let unexpected = expectation(description: "invalidated voice sends no second POST")
        unexpected.isInverted = true
        AvatarVoiceProtocol.handler = { stub in unexpected.fulfill(); stub.respond(Data(), status: 503) }
        if withdraw { defaults.set(0, forKey: "agent.riskNoticeVersion") }
        else { voice.stop() }
        await fulfillment(of: [unexpected], timeout: 1.5)
        XCTAssertFalse(voice.speaking)
        XCTAssertEqual(voice.level, 0)
    }

    @MainActor func testWithdrawalDuringRetryDelaySendsNoSecondRequest() async throws {
        try await verifyNoRetryAfterInvalidation(withdraw: true)
    }

    @MainActor func testStopDuringRetryDelaySendsNoSecondRequest() async throws {
        try await verifyNoRetryAfterInvalidation(withdraw: false)
    }

}
