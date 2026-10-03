import AVFoundation
import XCTest
@testable import Bobby

private final class VoiceGenderProtocol: URLProtocol {
    static var handler: ((VoiceGenderProtocol) -> Void)?
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
                                       headerFields: ["Content-Type": "audio/mpeg", "X-TTS-Provider": "openai"])!
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

/// The "voice.gender" preference: the companion's own voice (default), feminine or masculine. It replaces
/// the persona in the narration request, skips the recorded clips and steers the device fallback.
/// Only transport is stubbed: tests cannot reach production.
final class VoiceGenderTests: XCTestCase {
    private var session: URLSession!
    private var defaults: UserDefaults!
    private var defaultsSuite: String!
    private var previousLanguage: String?

    override func setUp() {
        super.setUp()
        previousLanguage = UserDefaults.standard.string(forKey: L.preferenceKey)
        UserDefaults.standard.set("en", forKey: L.preferenceKey)
        defaultsSuite = "voice-gender-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: defaultsSuite)!
        defaults.set(RiskNotice.currentVersion, forKey: "agent.riskNoticeVersion")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [VoiceGenderProtocol.self]
        session = URLSession(configuration: config)
    }

    override func tearDown() {
        session.invalidateAndCancel()
        defaults.removePersistentDomain(forName: defaultsSuite)
        VoiceGenderProtocol.handler = nil
        if let previousLanguage { UserDefaults.standard.set(previousLanguage, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
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

    @MainActor func testDefaultIsTheCompanionsOwnVoiceAndTheChoicePersists() {
        XCTAssertEqual(NeuralVoice.genderPreferenceKey, "voice.gender")
        XCTAssertEqual(NeuralVoice.VoiceGender.allCases.map(\.rawValue), ["companion", "female", "male"])
        let voice = NeuralVoice(session: session, defaults: defaults)
        XCTAssertNil(defaults.string(forKey: "voice.gender"))
        XCTAssertEqual(voice.voiceGender, .companion)
        defaults.set("robot", forKey: "voice.gender")
        XCTAssertEqual(voice.voiceGender, .companion, "An unknown stored value keeps the companion's voice")
        voice.voiceGender = .female
        XCTAssertEqual(defaults.string(forKey: "voice.gender"), "female")
        XCTAssertEqual(NeuralVoice(session: session, defaults: defaults).voiceGender, .female,
                       "Every voice reads the one device preference")
        voice.voiceGender = .male
        XCTAssertEqual(defaults.string(forKey: "voice.gender"), "male")
        voice.voiceGender = .companion
        XCTAssertEqual(defaults.string(forKey: "voice.gender"), "companion")
    }

    @MainActor func testNarrationRequestCarriesTheChosenGenderInPlaceOfThePersona() async throws {
        let data = try clip()
        let line = "The setup needs confirmation before a decision."
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        for gender in ["female", "male"] {
            defaults.set(gender, forKey: "voice.gender")
            let request = expectation(description: "\(gender) narration request")
            VoiceGenderProtocol.handler = { stub in
                XCTAssertEqual(stub.request.url?.absoluteString, "https://bobbyprotocol.xyz/api/bobby-voice-free")
                XCTAssertEqual(stub.request.httpMethod, "POST")
                let body = try? stub.body()
                XCTAssertEqual(body?["voice"], gender, "The chosen voice replaces the companion's persona")
                // Every other field is the one the companion's own voice sends.
                XCTAssertEqual(body?["text"], line)
                XCTAssertEqual(body?["lang"], L.ttsLang)
                XCTAssertEqual(body?["language"], L.language)
                XCTAssertEqual(body?["locale"], L.localeIdentifier)
                XCTAssertEqual(body?["mode"], "persona")
                XCTAssertEqual(body?["vibe"], "analytical")
                request.fulfill()
                stub.respond(data)
            }
            voice.speak(line, voiceId: "coral", persona: "ash", vibe: "pro")
            await fulfillment(of: [request], timeout: 3)
            try await waitUntil { voice.speaking && voice.level > 0.06 }
            XCTAssertEqual(voice.engine, .neural)
            voice.stop()
        }
    }

    @MainActor func testCompanionModeKeepsThePersonaAndTheRecordedClip() async throws {
        defaults.set("companion", forKey: "voice.gender")
        let data = try clip()
        let request = expectation(description: "companion narration request")
        VoiceGenderProtocol.handler = { stub in
            XCTAssertEqual(try? stub.body()["voice"], "ash", "The avatar's identity wins over the profile default")
            request.fulfill()
            stub.respond(data)
        }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speak("Context for BTC", voiceId: "coral", persona: "ash")
        await fulfillment(of: [request], timeout: 3)
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        voice.stop()

        UserDefaults.standard.set("es", forKey: L.preferenceKey)
        VoiceGenderProtocol.handler = { _ in XCTFail("A bundled avatar clip must not make a network request") }
        voice.speakClip("select-orb-es", fallbackText: "Hola", persona: "ash")
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        XCTAssertEqual(voice.engine, .neural)
    }

    @MainActor func testAChosenGenderSkipsTheRecordedClipAndSpeaksItsTextThroughTheNetwork() async throws {
        UserDefaults.standard.set("es", forKey: L.preferenceKey)
        XCTAssertNotNil(Bundle.main.url(forResource: "select-orb-es", withExtension: "mp3"), "The clip is bundled; the choice skips it")
        let data = try clip()
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        for gender in [NeuralVoice.VoiceGender.female, .male] {
            voice.voiceGender = gender
            let request = expectation(description: "\(gender.rawValue) voice instead of the clip")
            VoiceGenderProtocol.handler = { stub in
                let body = try? stub.body()
                XCTAssertEqual(body?["voice"], gender.rawValue)
                XCTAssertEqual(body?["text"], "Hola")
                XCTAssertEqual(body?["mode"], "persona")
                request.fulfill()
                stub.respond(data)
            }
            voice.speakClip("select-orb-es", fallbackText: "Hola", persona: "ash")
            await fulfillment(of: [request], timeout: 3)
            try await waitUntil { voice.speaking && voice.level > 0.06 }
            voice.stop()
        }
    }

    @MainActor func testAChosenGenderBeforeConsentSendsNoTextAndUsesTheDeviceVoice() async throws {
        VoiceGenderProtocol.handler = { _ in XCTFail("No text leaves the phone before the notice is accepted") }
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        defaults.set("female", forKey: "voice.gender")
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        for language in AppLanguage.allCases.map(\.rawValue) {
            UserDefaults.standard.set(language, forKey: L.preferenceKey)
            voice.speakClip("select-orb-" + language, fallbackText: "Hola", persona: "ash")
            if NeuralVoice.deviceVoice(language: language) != nil {
                XCTAssertEqual(voice.engine, .device, language)
                XCTAssertTrue(voice.speaking, language)
            } else {
                XCTAssertFalse(voice.speaking, language)
            }
            voice.stop()
        }
        try await Task.sleep(for: .milliseconds(200))
    }

    @MainActor func testChangingTheVoiceStopsTheCurrentLineAndTheNextLineUsesIt() async throws {
        UserDefaults.standard.set("es", forKey: L.preferenceKey)
        VoiceGenderProtocol.handler = { _ in XCTFail("The companion's clip is bundled") }
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        voice.speakClip("select-orb-es", fallbackText: "Hola", persona: "ash")
        try await waitUntil { voice.speaking && voice.level > 0.06 }
        voice.voiceGender = .male
        XCTAssertFalse(voice.speaking, "Choosing a voice stops the line made with the previous one")
        XCTAssertEqual(voice.level, 0)

        // The same line again is requested with the new voice, never replayed from the companion's audio.
        let data = try clip()
        let request = expectation(description: "the next line uses the chosen voice")
        VoiceGenderProtocol.handler = { stub in
            XCTAssertEqual(try? stub.body()["voice"], "male")
            request.fulfill()
            stub.respond(data)
        }
        voice.speakClip("select-orb-es", fallbackText: "Hola", persona: "ash")
        await fulfillment(of: [request], timeout: 3)
        try await waitUntil { voice.speaking && voice.level > 0.06 }

        voice.voiceGender = .companion
        XCTAssertFalse(voice.speaking)
        VoiceGenderProtocol.handler = { _ in XCTFail("Back on the companion's voice the recorded clip plays") }
        voice.speakClip("select-orb-es", fallbackText: "Hola", persona: "ash")
        try await waitUntil { voice.speaking && voice.level > 0.06 }
    }

    /// Installed voices differ per device and simulator: a gendered voice of the language must win when
    /// there is one, and without one the choice must be the one made with no preference.
    @MainActor func testDeviceVoicePrefersTheChosenGenderInsideTheLanguageOrKeepsItsUsualChoice() {
        XCTAssertEqual(NeuralVoice.VoiceGender.companion.deviceGender, .unspecified)
        XCTAssertEqual(NeuralVoice.VoiceGender.female.deviceGender, .female)
        XCTAssertEqual(NeuralVoice.VoiceGender.male.deviceGender, .male)
        let standard = AVSpeechSynthesisVoice.speechVoices().filter { NeuralVoice.isStandardDeviceVoice($0) }
        for language in AppLanguage.allCases.map(\.rawValue) {
            let usual = NeuralVoice.deviceVoice(language: language)
            XCTAssertEqual(NeuralVoice.deviceVoice(language: language, gender: .unspecified)?.identifier, usual?.identifier, language)
            let locales = LanguageResolution.resolve(selection: language, preferredLanguages: Locale.preferredLanguages,
                                                     region: Locale.current.region?.identifier)
                .speechLocaleCandidates.map { $0.lowercased() }
            for gender in [AVSpeechSynthesisVoiceGender.female, .male] {
                let chosen = NeuralVoice.deviceVoice(language: language, gender: gender)
                if standard.contains(where: { $0.gender == gender && locales.contains($0.language.lowercased()) }) {
                    XCTAssertEqual(chosen?.gender, gender, language)
                    XCTAssertTrue(chosen.map { locales.contains($0.language.lowercased()) } ?? false, language)
                    XCTAssertTrue(chosen.map { NeuralVoice.isStandardDeviceVoice($0) } ?? false, language)
                } else {
                    XCTAssertEqual(chosen?.identifier, usual?.identifier, language)
                }
            }
        }
        XCTAssertNil(NeuralVoice.deviceVoice(language: "unsupported", gender: .female))
    }
}
