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

    func testFirstHoldOffersPermissionBeforeARecognizerIsReadyInEveryLanguage() {
        for language in AppLanguage.allCases {
            UserDefaults.standard.set(language.rawValue, forKey: L.preferenceKey)
            let speech = NucleoSpeech(permissionInputs: {
                .init(mic: .undetermined, speech: .notDetermined, available: false, onDevice: false)
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
            .init(mic: .granted, speech: .notDetermined, available: false, onDevice: false)
        })
        XCTAssertEqual(speech.permission().state, "undetermined")
        XCTAssertEqual(speech.start(), .needsPermission)
        XCTAssertFalse(speech.isListening)
    }

    func testDeniedAndRestrictedAuthorizationStayActionableWithoutARecognizer() {
        let denied = NucleoSpeech(permissionInputs: {
            .init(mic: .denied, speech: .authorized, available: false, onDevice: false)
        })
        XCTAssertEqual(denied.permission().state, "denied")
        XCTAssertEqual(denied.start(), .denied)
        let restricted = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .restricted, available: false, onDevice: false)
        })
        XCTAssertEqual(restricted.permission().state, "restricted")
        XCTAssertEqual(restricted.start(), .denied)
    }

    func testGrantedAuthorizationIsUnavailableOnlyWhenNothingCanRecognizeTheLanguage() {
        let speech = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .authorized, available: false, onDevice: false)
        })
        var audioStarts = 0
        speech.willStart = { audioStarts += 1 }
        XCTAssertEqual(speech.permission(), .init(state: "unavailable", onDevice: false))
        XCTAssertEqual(speech.start(), .unavailable)
        XCTAssertEqual(audioStarts, 0)
        XCTAssertFalse(speech.isListening)
        XCTAssertEqual(speech.stop(cancel: false), .idle)
    }

    func testGrantedAuthorizationWithoutALocalModelIsGrantedAndReportsOnDeviceTruthfully() {
        let server = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .authorized, available: true, onDevice: false)
        })
        XCTAssertEqual(server.permission(), .init(state: "granted", onDevice: false))
        let local = NucleoSpeech(permissionInputs: {
            .init(mic: .granted, speech: .authorized, available: true, onDevice: true)
        })
        XCTAssertEqual(local.permission(), .init(state: "granted", onDevice: true))
    }

    func testNextHoldRechecksPermissionAndCapabilityAfterAPrompt() {
        var inputs = NucleoSpeech.PermissionInputs(mic: .undetermined, speech: .notDetermined, available: false, onDevice: false)
        let speech = NucleoSpeech(permissionInputs: { inputs })
        XCTAssertEqual(speech.start(), .needsPermission)
        inputs = .init(mic: .granted, speech: .authorized, available: false, onDevice: false)
        XCTAssertEqual(speech.start(), .unavailable)
        inputs = .init(mic: .granted, speech: .authorized, available: true, onDevice: false)
        XCTAssertEqual(speech.permission(), .init(state: "granted", onDevice: false))
        inputs = .init(mic: .granted, speech: .authorized, available: true, onDevice: true)
        XCTAssertEqual(speech.permission(), .init(state: "granted", onDevice: true))
        // No real recognizer/audio is injected: only the preflight snapshot is exercised.
        speech.cancel()
    }

    func testASecondHoldDuringPendingFinalIsBusyAndCancelRestoresPreflight() {
        let speech = NucleoSpeech(finalWait: 5, permissionInputs: {
            .init(mic: .undetermined, speech: .notDetermined, available: false, onDevice: false)
        })
        speech.waitForFinal()
        XCTAssertEqual(speech.start(), .busy)
        speech.cancel()
        XCTAssertEqual(speech.start(), .needsPermission)
        XCTAssertFalse(speech.isListening)
    }

    func testReleasedThenCancelledButtonDoesNotSendAPendingTranscript() async throws {
        let speech = NucleoSpeech(finalWait: 0.02, permissionInputs: {
            .init(mic: .granted, speech: .authorized, available: false, onDevice: false)
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

    func testMissingOnDeviceModelUsesAppleSpeechServiceInTheSameLanguageNeverAnother() throws {
        UserDefaults.standard.set("it", forKey: L.preferenceKey)
        var attempted: [String] = []
        let speech = NucleoSpeech(supportedLocales: { ["it-IT", "es-MX", "en-US"] }, makeRecognizer: { id in
            attempted.append(id)
            return SpeechRecognizerProbe(locale: id, onDevice: false)
        })
        let recognizer = try XCTUnwrap(speech.resolveRecognizer())
        XCTAssertEqual(recognizer.locale.identifier, "it-IT")
        XCTAssertFalse(recognizer.supportsOnDeviceRecognition)
        XCTAssertEqual(try XCTUnwrap(speech.resolveRecognizer(requireAvailable: true)).locale.identifier, "it-IT")
        XCTAssertTrue(attempted.allSatisfy { $0 == "it-IT" }, "Spanish and English recognizers must never be created for Italian")
    }

    func testOnDeviceCandidateWinsOverAnEarlierServerOnlyCandidate() throws {
        UserDefaults.standard.set("de", forKey: L.preferenceKey)
        let speech = NucleoSpeech(supportedLocales: { ["de-DE", "de-AT", "de-CH"] }, makeRecognizer: { id in
            SpeechRecognizerProbe(locale: id, onDevice: id == "de-CH")
        })
        let recognizer = try XCTUnwrap(speech.resolveRecognizer())
        XCTAssertEqual(recognizer.locale.identifier, "de-CH")
        XCTAssertTrue(recognizer.supportsOnDeviceRecognition)
    }

    func testModelInstalledAfterAServerHoldIsPreferredOnTheNextHold() throws {
        UserDefaults.standard.set("fr", forKey: L.preferenceKey)
        var installed = false
        let speech = NucleoSpeech(supportedLocales: { ["fr-FR"] }, makeRecognizer: { id in
            SpeechRecognizerProbe(locale: id, onDevice: installed)
        })
        XCTAssertFalse(try XCTUnwrap(speech.resolveRecognizer()).supportsOnDeviceRecognition)
        installed = true
        XCTAssertTrue(try XCTUnwrap(speech.resolveRecognizer()).supportsOnDeviceRecognition)
    }

    func testNothingRecognizesTheLanguageWithoutAModelWhenAppleSpeechServiceIsUnreachable() {
        for language in AppLanguage.allCases {
            UserDefaults.standard.set(language.rawValue, forKey: L.preferenceKey)
            let speech = NucleoSpeech(supportedLocales: { Set(L.speechLocaleCandidates + ["es-MX", "en-US"]) }, makeRecognizer: { id in
                // Only the app language is offline; another language being reachable must not rescue it.
                let probe = SpeechRecognizerProbe(locale: id, onDevice: false)
                probe.isAvailable = !id.hasPrefix(language.rawValue + "-")
                return probe
            })
            XCTAssertNil(speech.resolveRecognizer(), language.rawValue)
            XCTAssertNil(speech.resolveRecognizer(requireAvailable: true), language.rawValue)
        }
    }

    func testNoRecognizerForTheLanguageIsUnavailable() {
        UserDefaults.standard.set("it", forKey: L.preferenceKey)
        let unsupported = NucleoSpeech(supportedLocales: { ["es-MX", "en-US"] }, makeRecognizer: { id in
            SpeechRecognizerProbe(locale: id)
        })
        XCTAssertNil(unsupported.resolveRecognizer())
        let missing = NucleoSpeech(supportedLocales: { ["it-IT"] }, makeRecognizer: { _ in nil })
        XCTAssertNil(missing.resolveRecognizer())
    }

    func testEveryLanguageRecognizesInItsOwnLanguageAndTheRequestFollowsTheRecognizer() {
        for language in AppLanguage.allCases {
            let resolution = LanguageResolution.resolve(selection: language.rawValue, preferredLanguages: [], region: nil)
            XCTAssertFalse(resolution.speechLocaleCandidates.isEmpty)
            XCTAssertTrue(resolution.speechLocaleCandidates.allSatisfy { $0.hasPrefix(language.rawValue + "-") })
            for onDevice in [true, false] {
                // Audio is pinned to the phone whenever the recognizer holds the local model.
                let request = NucleoSpeech.makeRequest(contextualStrings: ["BTC", "NVDA"], onDevice: onDevice)
                XCTAssertEqual(request.requiresOnDeviceRecognition, onDevice)
                XCTAssertTrue(request.shouldReportPartialResults)
                XCTAssertEqual(request.contextualStrings, ["BTC", "NVDA"])
            }
        }
    }

    func testRecognitionTriesTheDeviceRegionVariantFirstWithoutDuplicatesOrOtherLanguages() {
        let cases: [(String, [String], String?, [String])] = [
            ("fr", ["fr-CA", "en-US"], "CA", ["fr-CA", "fr-FR"]),
            ("fr", ["fr-BE"], "BE", ["fr-BE", "fr-FR", "fr-CA"]),
            ("fr", ["de-CH", "fr-CH"], "CH", ["fr-CH", "fr-FR", "fr-CA"]),
            ("fr", ["de-CH"], "CH", ["fr-CH", "fr-FR", "fr-CA"]),
            ("fr", ["fr-FR"], "FR", ["fr-FR", "fr-CA"]),
            ("de", ["de-AT"], "AT", ["de-AT", "de-DE", "de-CH"]),
            ("de", ["de_CH"], "CH", ["de-CH", "de-DE", "de-AT"]),
            ("it", ["it-CH"], "CH", ["it-CH", "it-IT"]),
            ("pt", ["pt-BR"], "BR", ["pt-BR", "pt-PT"]),
            ("pt", ["pt-PT"], "BR", ["pt-PT", "pt-BR"]),
            ("en", ["en-GB"], "GB", ["en-GB", "en-US"]),
            ("es", ["es-ES"], "ES", ["es-ES", "es-MX", "es-US"]),
            ("es", ["en-US", "es-US"], "US", ["es-US", "es-MX", "es-ES"]),
            ("it", ["en-US"], nil, ["it-IT"])
        ]
        for (language, preferred, region, expected) in cases {
            let resolution = LanguageResolution.resolve(selection: language, preferredLanguages: preferred, region: region)
            let candidates = resolution.recognitionLocaleCandidates(preferredLanguages: preferred)
            XCTAssertEqual(candidates, expected, "\(language) \(preferred)")
            XCTAssertEqual(Set(candidates).count, candidates.count)
            XCTAssertTrue(candidates.allSatisfy { $0.hasPrefix(language + "-") })
        }
    }

    func testRegionVariantAppleDoesNotRecognizeIsSkippedBeforeCreatingARecognizer() throws {
        // French chosen in Profile on a Spanish (Mexico) phone: "fr-MX" is not a recognizer locale.
        let resolution = LanguageResolution.resolve(selection: "fr", preferredLanguages: ["es-MX", "en-US"], region: "MX")
        XCTAssertEqual(resolution.recognitionLocaleCandidates(preferredLanguages: ["es-MX", "en-US"]), ["fr-MX", "fr-FR", "fr-CA"])
        UserDefaults.standard.set("fr", forKey: L.preferenceKey)
        var attempted: [String] = []
        let speech = NucleoSpeech(supportedLocales: { ["fr-FR", "fr-CA", "es-MX"] }, makeRecognizer: { id in
            attempted.append(id)
            return SpeechRecognizerProbe(locale: id, onDevice: false)
        })
        XCTAssertTrue(["fr-FR", "fr-CA"].contains(try XCTUnwrap(speech.resolveRecognizer()).locale.identifier))
        XCTAssertTrue(attempted.allSatisfy { ["fr-FR", "fr-CA"].contains($0) }, "Only French recognizers Apple lists may be created")
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
