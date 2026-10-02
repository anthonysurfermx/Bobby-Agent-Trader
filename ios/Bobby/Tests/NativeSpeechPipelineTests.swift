import AVFoundation
import Foundation
import Speech
import XCTest
@testable import Bobby

@MainActor
final class NativeSpeechPipelineTests: XCTestCase {
    private var previousSelection: String?
    private var contexts: [SpeechPipelineContext] = []

    override func setUp() {
        super.setUp()
        previousSelection = UserDefaults.standard.string(forKey: L.preferenceKey)
    }

    override func tearDown() {
        for context in contexts { context.speech.cancel(); context.clock.drain() }
        contexts.removeAll()
        if let previousSelection { UserDefaults.standard.set(previousSelection, forKey: L.preferenceKey) }
        else { UserDefaults.standard.removeObject(forKey: L.preferenceKey) }
        super.tearDown()
    }

    private static let cases: [(String, String, String)] = [
        ("en", "en-US", "Why is NVIDIA’s price $123.45 — wait or act?"),
        ("es", "es-MX", "¿Qué pasó con NVIDIA? Cuesta 123,45 dólares."),
        ("fr", "fr-FR", "L’action à Paris coûte 1 234,56 € — pourquoi ?"),
        ("pt", "pt-PT", "A ação está a 123,45 €; é melhor aguardar?"),
        ("pt", "pt-BR", "A ação em São Paulo está a R$ 123,45 — por quê?"),
        ("it", "it-IT", "Perché l’azione è già a 123,45 €? Aspetterò."),
        ("de", "de-DE", "Überprüfe den Kurs: 1.234,56 € — heißt das Größe?")
    ]

    private func context(_ item: (String, String, String)) -> SpeechPipelineContext {
        UserDefaults.standard.set(item.0, forKey: L.preferenceKey)
        let context = SpeechPipelineContext(locale: item.1)
        contexts.append(context)
        return context
    }

    private func settle() async { for _ in 0..<12 { await Task.yield() } }

    func testPartialReleaseAndFinalPreserveEveryLanguageAndRegionExactly() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening, item.1)
            XCTAssertEqual(c.recognizer.locale.identifier, item.1)
            XCTAssertTrue(c.capture.request?.requiresOnDeviceRecognition == true)
            XCTAssertTrue(c.capture.request?.shouldReportPartialResults == true)
            c.recognizer.deliver(item.2, final: false)
            await settle()
            XCTAssertEqual(c.texts("speech.partial"), [item.2])
            XCTAssertEqual(c.speech.stop(cancel: false), .stopped)
            XCTAssertFalse(c.capture.opened)
            c.recognizer.deliver("  \n" + item.2 + "\n  ", final: true)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
            XCTAssertEqual(c.names, ["speech.state", "speech.partial", "speech.state", "speech.final"])
            XCTAssertEqual(c.states, ["listening", "stopped"])
            XCTAssertEqual(c.recognizer.tasks[0].cancelCount, 1)
            XCTAssertEqual(c.capture.restoreCount, 1)
        }
    }

    func testFinalWhileButtonIsStillHeldClosesCaptureWithoutSendingUntilExplicitRelease() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: true)
            await settle()
            XCTAssertTrue(c.speech.isListening, "The hold still owns confirmation: " + item.1)
            XCTAssertFalse(c.capture.opened, item.1)
            XCTAssertEqual(c.states, ["listening"], item.1)
            XCTAssertEqual(c.texts("speech.final"), [], item.1)
            // Closing audio can produce another callback/error; it must not erase the settled text.
            c.recognizer.deliver(nil, failed: true)
            c.recognizer.deliver(item.2 + " stale", final: true)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
            XCTAssertEqual(c.speech.stop(cancel: false), .stopped)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
            XCTAssertEqual(c.states, ["listening", "stopped"])
            c.recognizer.deliver("duplicate", final: true)
            XCTAssertEqual(c.speech.stop(cancel: false), .idle)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
        }
    }

    func testRevisedPartialsReplaceTheTranscriptRatherThanAppendingOrTruncating() async {
        for item in Self.cases {
            let c = context(item)
            let long = item.2 + " " + Array(repeating: item.2, count: 50).joined(separator: " ")
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver("NVDA 12", final: false)
            c.recognizer.deliver("NVDA 123,45", final: false)
            c.recognizer.deliver(long, final: false)
            await settle()
            c.speech.stop(cancel: false)
            c.recognizer.deliver(long, final: true)
            await settle()
            XCTAssertEqual(c.texts("speech.partial"), ["NVDA 12", "NVDA 123,45", long])
            XCTAssertEqual(c.texts("speech.final"), [long])
        }
    }

    func testFinalDeadlineUsesLatestPartialAndIgnoresLateDuplicateResult() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            await settle()
            c.recognizer.deliver(item.2, final: false)
            await settle()
            c.speech.stop(cancel: false)
            await settle()
            XCTAssertTrue(c.clock.waits.contains { $0.seconds == NucleoSpeech.finalWaitSeconds })
            c.clock.resume(seconds: NucleoSpeech.finalWaitSeconds)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
            c.recognizer.deliver("late different text", final: true)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
        }
    }

    func testSilentDeadlineDeliversOneEmptyFinalAndNeverInventsText() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.speech.stop(cancel: false)
            await settle()
            c.clock.resume(seconds: NucleoSpeech.finalWaitSeconds)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [""])
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [""])
        }
    }

    func testSixtySecondLimitClosesAudioWithoutAutomaticallySendingInEveryLanguage() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false)
            await settle()
            XCTAssertEqual(c.clock.waits.map(\.seconds), [60])
            c.clock.resume(seconds: 60)
            await settle()
            XCTAssertFalse(c.capture.opened)
            XCTAssertFalse(c.speech.isListening)
            XCTAssertEqual(c.texts("speech.final"), [])
            XCTAssertEqual(c.events.last?.1["code"] as? String, "interrupted")
            c.recognizer.deliver(item.2, final: true)
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
            XCTAssertEqual(c.speech.stop(cancel: false), .idle)
        }
    }

    func testCancelDuringHoldRejectsQueuedPartialsFinalsAndLevelsInEveryLanguage() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false) // callback queued before cancellation
            c.capture.level?(0.5)
            c.speech.cancel()
            c.recognizer.deliver(item.2, final: true)
            await settle()
            XCTAssertFalse(c.capture.opened)
            XCTAssertEqual(c.names, ["speech.state", "speech.state"])
            XCTAssertEqual(c.states, ["listening", "stopped"])
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
        }
    }

    func testCancelAfterReleaseInvalidatesPendingTimeoutAndFinalInEveryLanguage() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false)
            await settle()
            c.speech.stop(cancel: false)
            await settle()
            c.speech.cancel()
            c.recognizer.deliver(item.2, final: true)
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
            XCTAssertFalse(c.capture.opened)
        }
    }

    func testRetryRejectsPreviousTaskResultsAndOldStopTimer() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            await settle()
            c.speech.cancel()
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver("old private question", final: true, index: 0)
            c.recognizer.deliver(item.2, final: false, index: 1)
            await settle()
            c.clock.resume(seconds: 60) // first, cancelled start's deadline
            await settle()
            XCTAssertTrue(c.speech.isListening)
            XCTAssertEqual(c.texts("speech.partial"), [item.2])
            XCTAssertEqual(c.texts("speech.final"), [])
            c.speech.stop(cancel: false)
            c.recognizer.deliver(item.2, final: true, index: 1)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
        }
    }

    func testProviderErrorDuringHoldClosesCaptureWithoutSendingPartialText() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false)
            await settle()
            c.recognizer.deliver(nil, failed: true)
            await settle()
            XCTAssertFalse(c.speech.isListening)
            XCTAssertFalse(c.capture.opened)
            XCTAssertEqual(c.states, ["listening", "stopped"])
            XCTAssertEqual(c.events.filter { $0.0 == "speech.error" }.map { $0.1["code"] as? String }, ["failed"])
            XCTAssertEqual(c.texts("speech.final"), [])
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
        }
    }

    func testNoSpeechErrorAfterReleaseSettlesBoundedFinalOnce() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false)
            await settle()
            c.speech.stop(cancel: false)
            c.recognizer.deliver(nil, failed: true)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [item.2])
        }
    }

    func testAudioSessionFormatAndEngineFailuresNeverCreateARecognitionTaskAndCanRetry() async {
        for item in Self.cases {
            for fault in [NucleoSpeechCaptureFault.session, .format, .engine] {
                let c = context(item)
                c.capture.failure = fault
                XCTAssertEqual(c.speech.start(), .unavailable)
                XCTAssertFalse(c.speech.isListening)
                XCTAssertFalse(c.capture.opened)
                XCTAssertEqual(c.recognizer.tasks.count, 0)
                XCTAssertEqual(c.capture.closeCount, 1)
                XCTAssertEqual(c.capture.restoreCount, 1)
                c.capture.failure = nil
                XCTAssertEqual(c.speech.start(), .listening)
                c.recognizer.deliver(item.2, final: false)
                await settle()
                XCTAssertEqual(c.texts("speech.partial"), [item.2])
                c.speech.cancel()
            }
        }
    }

    func testAudioInterruptionAndDeviceRouteChangeCancelButCategoryChangesDoNot() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: nil,
                userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.categoryChange.rawValue])
            XCTAssertTrue(c.speech.isListening)
            NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
                userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
            XCTAssertFalse(c.capture.opened)
            c.recognizer.deliver(item.2, final: true)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
            XCTAssertEqual(c.events.last?.1["code"] as? String, "interrupted")
            XCTAssertEqual(c.speech.start(), .listening)
            NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: nil,
                userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue])
            XCTAssertFalse(c.capture.opened)
            c.recognizer.deliver(item.2, final: true, index: 1)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
        }
    }

    func testLanguageChangeBeforeQueuedResultRejectsPreviousLanguageText() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false)
            UserDefaults.standard.set(item.0 == "de" ? "it" : "de", forKey: L.preferenceKey)
            await settle()
            XCTAssertFalse(c.speech.isListening, item.1)
            XCTAssertFalse(c.capture.opened, item.1)
            XCTAssertEqual(c.texts("speech.partial"), [], item.1)
            c.recognizer.deliver(item.2, final: true)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
        }
    }

    func testLanguageChangeAfterReleaseRejectsPendingDeadlineText() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: false)
            await settle()
            c.speech.stop(cancel: false)
            await settle()
            UserDefaults.standard.set(item.0 == "de" ? "it" : "de", forKey: L.preferenceKey)
            c.clock.resume(seconds: NucleoSpeech.finalWaitSeconds)
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [], item.1)
            XCTAssertFalse(c.capture.opened)
        }
    }

    func testBackgroundThroughNativeSessionDiscardsHeldAndReleasedTranscriptsInEveryLanguage() async {
        for item in Self.cases {
            for released in [false, true] {
                let c = context(item)
                let name = "SpeechPipeline.background." + UUID().uuidString
                let defaults = UserDefaults(suiteName: name)!
                let session = NucleoSession(fixtures: true, speech: c.speech, defaults: defaults)
                let recorder = SpeechSessionRecorder(context: c)
                session.emitter = recorder
                XCTAssertEqual(c.speech.start(), .listening)
                c.recognizer.deliver(item.2, final: false)
                await settle()
                if released { c.speech.stop(cancel: false); await settle() }
                session.appWentBackground()
                c.recognizer.deliver(item.2, final: true)
                c.clock.drain()
                await settle()
                XCTAssertFalse(c.capture.opened)
                XCTAssertFalse(c.speech.isListening)
                XCTAssertEqual(c.texts("speech.final"), [])
                XCTAssertEqual(c.events.last(where: { $0.0 == "app.state" })?.1["state"] as? String, "background")
                session.teardown()
                defaults.removePersistentDomain(forName: name)
            }
        }
    }

    func testCancelAndBackgroundAfterSettledResultWhileHeldNeverConfirmIt() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.recognizer.deliver(item.2, final: true)
            await settle()
            c.speech.cancel()
            c.recognizer.deliver(item.2, final: true)
            c.clock.drain()
            await settle()
            XCTAssertEqual(c.texts("speech.final"), [])
            XCTAssertFalse(c.capture.opened)
            XCTAssertFalse(c.speech.isListening)
            XCTAssertEqual(c.speech.stop(cancel: false), .idle)
        }
    }

    func testLevelsAreFiniteBoundedAndIgnoredAfterReleaseOrCancellation() async {
        for item in Self.cases {
            let c = context(item)
            XCTAssertEqual(c.speech.start(), .listening)
            c.capture.level?(0.5)
            await settle()
            let levels = c.events.filter { $0.0 == "speech.level" }.compactMap { $0.1["level"] as? Double }
            XCTAssertEqual(levels.count, 1)
            XCTAssertTrue(levels.allSatisfy { $0.isFinite && $0 >= 0 && $0 <= 1 })
            c.speech.stop(cancel: false)
            c.capture.level?(1)
            await settle()
            XCTAssertEqual(c.events.filter { $0.0 == "speech.level" }.count, 1)
            c.speech.cancel()
            c.capture.level?(1)
            await settle()
            XCTAssertEqual(c.events.filter { $0.0 == "speech.level" }.count, 1)
        }
    }
}

@MainActor
private final class SpeechPipelineContext {
    let capture = SpeechCaptureProbe()
    let recognizer: PipelineRecognizerProbe
    let clock = SpeechManualClock()
    let speech: NucleoSpeech
    var events: [(String, [String: Any])] = []

    init(locale: String) {
        recognizer = PipelineRecognizerProbe(locale: locale)
        let recognizer = self.recognizer, capture = self.capture, clock = self.clock
        speech = NucleoSpeech(permissionInputs: { .init(mic: .granted, speech: .authorized, onDevice: true) },
            capture: capture, sleep: { try await clock.sleep($0) }, supportedLocales: { [locale] },
            makeRecognizer: { $0 == locale ? recognizer : nil })
        speech.vocabulary = ["BTC", "NVDA", "SAP.DE", "São Paulo"]
        speech.emit = { [weak self] name, payload in self?.events.append((name, payload)) }
    }

    var names: [String] { events.map(\.0) }
    var states: [String] { events.filter { $0.0 == "speech.state" }.compactMap { $0.1["state"] as? String } }
    func texts(_ name: String) -> [String] { events.filter { $0.0 == name }.compactMap { $0.1["text"] as? String } }
}

@MainActor
private final class SpeechCaptureProbe: NucleoSpeechCapturing {
    var request: SFSpeechAudioBufferRecognitionRequest?
    var level: (@Sendable (Float) -> Void)?
    var failure: NucleoSpeechCaptureFault?
    var opened = false
    var closeCount = 0
    var restoreCount = 0

    func open(request: SFSpeechAudioBufferRecognitionRequest, level: @escaping @Sendable (Float) -> Void) throws {
        self.request = request; self.level = level
        if let failure { throw failure }
        opened = true
    }
    func close() { closeCount += 1; opened = false }
    func restore() { restoreCount += 1 }
}

@MainActor
private final class PipelineRecognizerProbe: NucleoSpeechRecognizing {
    let locale: Locale
    let supportsOnDeviceRecognition = true
    let isAvailable = true
    var tasks: [PipelineTaskProbe] = []
    private var deliveries: [@Sendable (String?, Bool, Bool) -> Void] = []

    init(locale: String) { self.locale = Locale(identifier: locale) }
    func startRecognition(with request: SFSpeechRecognitionRequest,
                          deliver: @escaping @Sendable (String?, Bool, Bool) -> Void) -> any NucleoSpeechTask {
        let task = PipelineTaskProbe(); tasks.append(task); deliveries.append(deliver); return task
    }
    func deliver(_ text: String?, final: Bool = false, failed: Bool = false, index: Int? = nil) {
        deliveries[index ?? deliveries.count - 1](text, final, failed)
    }
}

@MainActor
private final class PipelineTaskProbe: NucleoSpeechTask {
    var cancelCount = 0
    func cancel() { cancelCount += 1 }
}

@MainActor
private final class SpeechManualClock {
    struct Wait { let seconds: Double; let continuation: CheckedContinuation<Void, Error> }
    var waits: [Wait] = []
    func sleep(_ seconds: Double) async throws {
        try await withCheckedThrowingContinuation { waits.append(.init(seconds: seconds, continuation: $0)) }
    }
    func resume(seconds: Double) {
        guard let i = waits.firstIndex(where: { $0.seconds == seconds }) else {
            XCTFail("No pending speech deadline for \(seconds) seconds"); return
        }
        waits.remove(at: i).continuation.resume()
    }
    func drain() {
        let pending = waits; waits.removeAll()
        for wait in pending { wait.continuation.resume(throwing: CancellationError()) }
    }
}

@MainActor
private final class SpeechSessionRecorder: NucleoEmitting {
    private let context: SpeechPipelineContext
    init(context: SpeechPipelineContext) { self.context = context }
    func emit(_ name: String, _ payload: [String: Any]) { context.events.append((name, payload)) }
    func pageReady() {}
}
