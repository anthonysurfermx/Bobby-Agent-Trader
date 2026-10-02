import AVFoundation
import Speech
import XCTest
@testable import Bobby

@MainActor
final class NucleoSpeechButtonTests: XCTestCase {
    private var previousSelection: String?

    override func setUp() {
        super.setUp()
        previousSelection = UserDefaults.standard.string(forKey: L.preferenceKey)
    }

    override func tearDown() {
        if let previousSelection { UserDefaults.standard.set(previousSelection, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    func testFirstHoldOffersPermissionBeforeLocalCapabilityIsReadyInEveryLanguage() {
        for language in AppLanguage.allCases {
            UserDefaults.standard.set(language.rawValue, forKey: L.preferenceKey)
            let speech = NucleoSpeech(permissionInputs: {
                .init(mic: .undetermined, speech: .notDetermined, onDevice: false)
            })
            var audioStarts = 0
            speech.willStart = { audioStarts += 1 }
            XCTAssertEqual(speech.permission().state, "undetermined", language.rawValue)
            XCTAssertFalse(speech.permission().onDevice, language.rawValue)
            XCTAssertEqual(speech.start(), .needsPermission, language.rawValue)
            XCTAssertFalse(speech.isListening, language.rawValue)
            XCTAssertEqual(audioStarts, 0, "A hold before permission must not open audio")
            XCTAssertEqual(speech.stop(cancel: true), .idle)
        }
    }

    func testUnrequestedSpeechPermissionIsNotHiddenAfterMicrophoneWasGranted() {
        let speech = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .notDetermined, onDevice: false)
        })
        XCTAssertEqual(speech.permission().state, "undetermined")
        XCTAssertEqual(speech.start(), .needsPermission)
        XCTAssertFalse(speech.isListening)
    }

    func testDeniedAndRestrictedAuthorizationStayActionableWithoutALocalModel() {
        let denied = NucleoSpeech(permissionInputs: {
            .init(mic: .denied, speech: .authorized, onDevice: false)
        })
        XCTAssertEqual(denied.permission().state, "denied")
        XCTAssertEqual(denied.start(), .denied)
        let restricted = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .restricted, onDevice: false)
        })
        XCTAssertEqual(restricted.permission().state, "restricted")
        XCTAssertEqual(restricted.start(), .denied)
    }

    func testGrantedAuthorizationNeverStartsWithoutOnDeviceRecognition() {
        let speech = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .authorized, onDevice: false)
        })
        var audioStarts = 0
        speech.willStart = { audioStarts += 1 }
        XCTAssertEqual(speech.permission().state, "unavailable")
        XCTAssertEqual(speech.start(), .unavailable)
        XCTAssertEqual(audioStarts, 0)
        XCTAssertFalse(speech.isListening)
        XCTAssertEqual(speech.stop(cancel: false), .idle)
    }

    func testNextHoldRechecksPermissionAndCapabilityAfterAPrompt() {
        var inputs = NucleoSpeech.PermissionInputs(mic: .undetermined, speech: .notDetermined, onDevice: false)
        let speech = NucleoSpeech(permissionInputs: { inputs })
        XCTAssertEqual(speech.start(), .needsPermission)
        inputs = .init(mic: .granted, speech: .authorized, onDevice: false)
        XCTAssertEqual(speech.start(), .unavailable)
        inputs = .init(mic: .granted, speech: .authorized, onDevice: true)
        XCTAssertEqual(speech.permission(), .init(state: "granted", onDevice: true))
        // No real recognizer/audio is injected: only the preflight snapshot is exercised.
        speech.cancel()
    }

    func testASecondHoldDuringPendingFinalIsBusyAndCancelRestoresPreflight() {
        let speech = NucleoSpeech(finalWait: 5, permissionInputs: {
            .init(mic: .undetermined, speech: .notDetermined, onDevice: false)
        })
        speech.waitForFinal()
        XCTAssertEqual(speech.start(), .busy)
        speech.cancel()
        XCTAssertEqual(speech.start(), .needsPermission)
        XCTAssertFalse(speech.isListening)
    }

    func testReleasedThenCancelledButtonDoesNotSendAPendingTranscript() async throws {
        let speech = NucleoSpeech(finalWait: 0.02, permissionInputs: {
            .init(mic: .granted, speech: .authorized, onDevice: false)
        })
        var finals = 0
        speech.emit = { name, _ in if name == "speech.final" { finals += 1 } }
        speech.waitForFinal()
        speech.cancel()
        try await Task.sleep(nanoseconds: 80_000_000)
        XCTAssertEqual(finals, 0)
        XCTAssertFalse(speech.isListening)
    }

    func testKeyboardLocaleFallbackIsRejectedForEverySelectedLanguage() {
        for language in AppLanguage.allCases {
            UserDefaults.standard.set(language.rawValue, forKey: L.preferenceKey)
            let requested = L.speechLocaleCandidates
            let wrongLanguage = language == .es ? "en-US" : "es-MX"
            let speech = NucleoSpeech(supportedLocales: { Set(requested) }, makeRecognizer: { _ in
                SpeechRecognizerProbe(locale: wrongLanguage)
            })
            XCTAssertNil(speech.resolveRecognizer(), "Apple keyboard fallback must not change \(language.rawValue)")
        }
    }

    func testSupportedAndActualLocaleNormalizationDoesNotRejectMatchingAppleIdentifiers() throws {
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        let speech = NucleoSpeech(supportedLocales: { ["DE_de"] }, makeRecognizer: { id in
            XCTAssertEqual(id, "de-DE")
            return SpeechRecognizerProbe(locale: "de_DE")
        })
        XCTAssertEqual(try XCTUnwrap(speech.resolveRecognizer()).locale.identifier, "de_DE")
    }

    func testUnsupportedCandidateIsSkippedBeforeCreatingARecognizer() throws {
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        var attempted: [String] = []
        let speech = NucleoSpeech(supportedLocales: { ["de-AT"] }, makeRecognizer: { id in
            attempted.append(id)
            return SpeechRecognizerProbe(locale: id)
        })
        XCTAssertEqual(try XCTUnwrap(speech.resolveRecognizer()).locale.identifier, "de-AT")
        XCTAssertEqual(attempted, ["de-AT"], "Do not let Apple substitute a keyboard locale for unsupported de-DE")
    }

    func testNextHoldSkipsACachedRecognizerThatBecameUnavailable() throws {
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        let preferred = SpeechRecognizerProbe(locale: "de-DE")
        let alternative = SpeechRecognizerProbe(locale: "de-AT")
        let speech = NucleoSpeech(supportedLocales: { ["de-DE", "de-AT"] }, makeRecognizer: { id in
            id == "de-DE" ? preferred : (id == "de-AT" ? alternative : nil)
        })
        XCTAssertEqual(try XCTUnwrap(speech.resolveRecognizer()).locale.identifier, "de-DE")
        preferred.isAvailable = false
        XCTAssertEqual(try XCTUnwrap(speech.resolveRecognizer(requireAvailable: true)).locale.identifier, "de-AT")
        alternative.isAvailable = false
        XCTAssertNil(speech.resolveRecognizer(requireAvailable: true))
    }

    func testSameLanguageRegionalFallbackDoesNotOverrideTheRequestedLocale() {
        UserDefaults.standard.set("pt", forKey: L.preferenceKey)
        let requested = L.speechLocaleCandidates
        let speech = NucleoSpeech(supportedLocales: { Set(requested) }, makeRecognizer: { id in
            // Apple must return the candidate it was actually asked to recognize, even within Portuguese.
            SpeechRecognizerProbe(locale: id == "pt-PT" ? "pt-BR" : "pt-PT")
        })
        XCTAssertNil(speech.resolveRecognizer())
    }

    func testUnsupportedOnDeviceCapabilityNeverUsesCloudOrAnotherLanguage() {
        UserDefaults.standard.set("it", forKey: L.preferenceKey)
        var attempted: [String] = []
        let speech = NucleoSpeech(supportedLocales: { ["it-IT", "es-MX"] }, makeRecognizer: { id in
            attempted.append(id)
            return SpeechRecognizerProbe(locale: id, onDevice: false)
        })
        XCTAssertNil(speech.resolveRecognizer())
        XCTAssertEqual(attempted, ["it-IT"])
    }

    func testEveryLanguageKeepsTheAudioRequestOnDeviceAndInItsOwnLanguage() {
        for language in AppLanguage.allCases {
            let resolution = LanguageResolution.resolve(selection: language.rawValue, preferredLanguages: [], region: nil)
            XCTAssertFalse(resolution.speechLocaleCandidates.isEmpty)
            XCTAssertTrue(resolution.speechLocaleCandidates.allSatisfy { $0.hasPrefix(language.rawValue + "-") })
            let request = NucleoSpeech.makeRequest(contextualStrings: ["BTC", "NVDA"])
            XCTAssertTrue(request.requiresOnDeviceRecognition)
            XCTAssertTrue(request.shouldReportPartialResults)
            XCTAssertEqual(request.contextualStrings, ["BTC", "NVDA"])
        }
    }
}

/// The real selection policy runs against these capability snapshots; no audio engine or recognizer task is started.
@MainActor
private final class SpeechRecognizerProbe: NucleoSpeechRecognizing {
    let locale: Locale
    let supportsOnDeviceRecognition: Bool
    var isAvailable = true

    init(locale: String, onDevice: Bool = true) {
        self.locale = Locale(identifier: locale)
        supportsOnDeviceRecognition = onDevice
    }

    func startRecognition(with request: SFSpeechRecognitionRequest,
                          deliver: @escaping @Sendable (String?, Bool, Bool) -> Void) -> any NucleoSpeechTask {
        fatalError("Capability tests must never open a microphone or recognition task")
    }
}
