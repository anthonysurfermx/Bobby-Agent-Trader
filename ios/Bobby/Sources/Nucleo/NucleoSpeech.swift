// Hold-to-ask speech for the Núcleo page (Nucleo/ARCHITECTURE.md §2.6, R8).
// Recognition runs ON DEVICE when the phone holds Apple's model for the app language;
// otherwise Apple's speech service transcribes it in that same language. It never falls
// back to another language, and Bobby never stores or uploads the audio itself. The
// microphone is live only between `speech.start` (pill down) and `speech.stop` (pill up),
// stops on its own after 60 s, on an audio interruption or a headset change, and when the
// app leaves the foreground. If nothing can recognize the language right now (no local
// model and no connection), the mic is `unavailable` and the page offers typing.
import AVFoundation
import Foundation
import Speech

@MainActor
protocol NucleoSpeechRecognizing {
    var locale: Locale { get }
    var supportsOnDeviceRecognition: Bool { get }
    var isAvailable: Bool { get }
    func startRecognition(with request: SFSpeechRecognitionRequest,
                          deliver: @escaping @Sendable (String?, Bool, Bool) -> Void) -> any NucleoSpeechTask
}

@MainActor
protocol NucleoSpeechTask { func cancel() }
extension SFSpeechRecognitionTask: NucleoSpeechTask {}

extension SFSpeechRecognizer: NucleoSpeechRecognizing {
    func startRecognition(with request: SFSpeechRecognitionRequest,
                          deliver: @escaping @Sendable (String?, Bool, Bool) -> Void) -> any NucleoSpeechTask {
        recognitionTask(with: request, resultHandler: NucleoSpeech.resultHandler(deliver))
    }
}

/// Owns only the audio hardware. The speech state machine and result policy stay in NucleoSpeech.
@MainActor
protocol NucleoSpeechCapturing {
    func open(request: SFSpeechAudioBufferRecognitionRequest, level: @escaping @Sendable (Float) -> Void) throws
    func close()
    func restore()
}

enum NucleoSpeechCaptureFault: Error, Equatable { case session, format, engine }

@MainActor
private final class AppleNucleoSpeechCapture: NucleoSpeechCapturing {
    private var engine: AVAudioEngine?

    func open(request: SFSpeechAudioBufferRecognitionRequest, level: @escaping @Sendable (Float) -> Void) throws {
        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers])
            try audio.setActive(true, options: [])
        } catch { throw NucleoSpeechCaptureFault.session }
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { throw NucleoSpeechCaptureFault.format }
        input.installTap(onBus: 0, bufferSize: 1024, format: format,
                         block: NucleoSpeech.tapBlock(request: request, level: level))
        self.engine = engine
        engine.prepare()
        do { try engine.start() } catch { throw NucleoSpeechCaptureFault.engine }
    }

    func close() {
        if let engine { engine.inputNode.removeTap(onBus: 0); engine.stop() }
        engine = nil
    }

    func restore() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
    }
}

@MainActor
final class NucleoSpeech {
    static let maxListeningSeconds: Double = 60
    static let finalWaitSeconds: Double = 1.5
    static let levelInterval: CFTimeInterval = 1.0 / 30.0

    var emit: (String, [String: Any]) -> Void = { _, _ in }
    /// Runs right before the mic opens (the voice must stop first).
    var willStart: () -> Void = {}
    /// Dictation vocabulary (asset names and tickers), set once per session.
    var vocabulary: [String] = []

    private var recognizer: (any NucleoSpeechRecognizing)?
    private var recognizerLocale: String?
    private var recognizerCandidates: [String] = []
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: (any NucleoSpeechTask)?
    private var listening = false
    private var awaitingFinal = false
    /// A definitive recognizer result may end audio before the held gesture is released.
    private var recognitionFinished = false
    private var activeLocaleIdentifier: String?
    private var latestText = ""
    private var session = 0
    private var autoStop: Task<Void, Never>?
    private var finalTimeout: Task<Void, Never>?
    private var lastLevelAt: CFTimeInterval = 0
    private var observers: [NSObjectProtocol] = []
    private let finalWait: Double
    private let capture: any NucleoSpeechCapturing
    private let sleep: @MainActor (Double) async throws -> Void
    private let permissionInputs: (() -> PermissionInputs)?
    private let supportedLocales: () -> Set<String>
    private let makeRecognizer: (String) -> (any NucleoSpeechRecognizing)?

    /// Authorization and recognizer capability may change independently (for example after an OS prompt).
    struct PermissionInputs {
        let mic: AVAudioApplication.recordPermission
        let speech: SFSpeechRecognizerAuthorizationStatus
        /// A recognizer for the app language can run now, on the device or through Apple's speech service.
        let available: Bool
        /// That recognizer holds the local model, so the audio stays on the phone.
        let onDevice: Bool
    }

    init(finalWait: Double? = nil,
         permissionInputs: (() -> PermissionInputs)? = nil,
         capture: (any NucleoSpeechCapturing)? = nil,
         sleep: @escaping @MainActor (Double) async throws -> Void = { seconds in
             try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
         },
         supportedLocales: @escaping () -> Set<String> = { Set(SFSpeechRecognizer.supportedLocales().map(\.identifier)) },
         makeRecognizer: @escaping (String) -> (any NucleoSpeechRecognizing)? = { SFSpeechRecognizer(locale: Locale(identifier: $0)) }) {
        self.finalWait = finalWait ?? Self.finalWaitSeconds
        self.permissionInputs = permissionInputs
        self.capture = capture ?? AppleNucleoSpeechCapture()
        self.sleep = sleep
        self.supportedLocales = supportedLocales
        self.makeRecognizer = makeRecognizer
    }

    var isListening: Bool { listening }

    // MARK: - Permission

    struct Permission: Equatable {
        let state: String
        let onDevice: Bool
        var json: [String: Any] { ["state": state, "onDevice": onDevice] }
    }

    /// Never prompts. `onDevice` is true only when the resolved recognizer holds the local model.
    func permission() -> Permission {
        let inputs: PermissionInputs
        if let permissionInputs {
            inputs = permissionInputs()
        } else {
            let recognizer = resolveRecognizer()
            inputs = PermissionInputs(
                mic: AVAudioApplication.shared.recordPermission,
                speech: SFSpeechRecognizer.authorizationStatus(),
                available: recognizer != nil,
                onDevice: recognizer?.supportsOnDeviceRecognition ?? false)
        }
        let authorization = Self.state(mic: inputs.mic, speech: inputs.speech)
        // A recognizer may not be ready before authorization. A hold must still offer the explicit
        // OS permission flow; only an authorized attempt needs a recognizer for the language, and
        // it is `unavailable` only when neither the phone nor Apple's speech service can run one.
        let state = authorization == "granted" && !inputs.available ? "unavailable" : authorization
        return Permission(state: state, onDevice: inputs.available && inputs.onDevice)
    }

    nonisolated static func state(mic: AVAudioApplication.recordPermission, speech: SFSpeechRecognizerAuthorizationStatus) -> String {
        if mic == .denied || speech == .denied { return "denied" }
        if speech == .restricted { return "restricted" }
        if mic == .undetermined || speech == .notDetermined { return "undetermined" }
        if mic == .granted && speech == .authorized { return "granted" }
        return "denied"
    }

    /// The two OS prompts, in order: microphone, then speech recognition.
    func requestPermission() async -> Permission {
        let current = permission()
        guard current.state == "undetermined" else { return current }
        if AVAudioApplication.shared.recordPermission == .undetermined {
            _ = await AVAudioApplication.requestRecordPermission()
        }
        if AVAudioApplication.shared.recordPermission == .granted, SFSpeechRecognizer.authorizationStatus() == .notDetermined {
            await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
                SFSpeechRecognizer.requestAuthorization { _ in done.resume() }
            }
        }
        return permission()
    }

    /// The selected app language only. The first candidate with the on-device model wins; when the
    /// phone has none, the first candidate Apple's speech service can transcribe right now is used.
    func resolveRecognizer(requireAvailable: Bool = false) -> (any NucleoSpeechRecognizing)? {
        let candidates = L.speechLocaleCandidates
        let supported = Set(supportedLocales().map(Self.localeKey))
        // An on-device recognizer is reused. A server-based one is re-resolved on every call (the
        // model may have been installed since), except while a capture still owns it.
        if let recognizer, let recognizerLocale,
           recognizerCandidates == candidates, candidates.contains(recognizerLocale),
           supported.contains(Self.localeKey(recognizerLocale)),
           Self.localeKey(recognizer.locale.identifier) == Self.localeKey(recognizerLocale),
           recognizer.supportsOnDeviceRecognition || listening || awaitingFinal,
           !requireAvailable || recognizer.isAvailable { return recognizer }
        var server: (id: String, recognizer: any NucleoSpeechRecognizing)?
        for id in candidates {
            // Apple's locale initializer can fall back to the keyboard's dictation language.
            // Do not instantiate unsupported locales or accept a different actual locale.
            guard supported.contains(Self.localeKey(id)),
                  let r = makeRecognizer(id),
                  Self.localeKey(r.locale.identifier) == Self.localeKey(id) else { continue }
            if r.supportsOnDeviceRecognition {
                guard !requireAvailable || r.isAvailable else { continue }
                recognizer = r
                recognizerLocale = id
                recognizerCandidates = candidates
                return r
            }
            // No local model for this candidate: Apple's speech service must be reachable now.
            if server == nil, r.isAvailable { server = (id, r) }
        }
        recognizer = server?.recognizer
        recognizerLocale = server?.id
        recognizerCandidates = candidates
        return server?.recognizer
    }

    nonisolated private static func localeKey(_ identifier: String) -> String {
        identifier.replacingOccurrences(of: "_", with: "-").lowercased()
    }

    /// The one request shape this app ever sends: partial results, punctuation, and on-device
    /// whenever the recognizer holds the local model (`onDevice` = its `supportsOnDeviceRecognition`).
    nonisolated static func makeRequest(contextualStrings: [String], onDevice: Bool = true) -> SFSpeechAudioBufferRecognitionRequest {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = onDevice
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        request.contextualStrings = contextualStrings
        return request
    }

    /// `clamp((20·log10(rms)+50)/45, 0, 1)`
    nonisolated static func level(rms: Float) -> Double {
        guard rms > 0, rms.isFinite else { return 0 }
        let db = 20 * log10(Double(rms))
        return min(1, max(0, (db + 50) / 45))
    }

    // MARK: - Start / stop

    enum StartStatus: String { case listening, needsPermission = "needs_permission", denied, unavailable, busy }

    func start() -> StartStatus {
        if listening || awaitingFinal { return .busy }
        let perm = permission()
        switch perm.state {
        case "granted": break
        case "undetermined": return .needsPermission
        case "unavailable": return .unavailable
        default: return .denied
        }
        guard let recognizer = resolveRecognizer(requireAvailable: true), recognizer.isAvailable else { return .unavailable }
        willStart()

        let request = Self.makeRequest(contextualStrings: vocabulary, onDevice: recognizer.supportsOnDeviceRecognition)
        activeLocaleIdentifier = L.localeIdentifier
        recognitionFinished = false
        session += 1
        let token = session
        do {
            try capture.open(request: request) { [weak self] rms in
                Task { @MainActor in self?.levelSample(rms, token: token) }
            }
        } catch {
            request.endAudio()
            closeMicrophone()
            activeLocaleIdentifier = nil
            restoreAudioSession()
            if error as? NucleoSpeechCaptureFault != .format {
                let message = error as? NucleoSpeechCaptureFault == .session ? "audio session" : "audio engine"
                emit("speech.error", ["code": "failed", "message": message])
            }
            return .unavailable
        }
        self.request = request
        latestText = ""
        listening = true
        awaitingFinal = false
        task = recognizer.startRecognition(with: request) { [weak self] text, isFinal, failed in
            Task { @MainActor in self?.recognized(text: text, isFinal: isFinal, failed: failed, token: token) }
        }
        observeInterruptions()
        emit("speech.state", ["state": "listening"])
        let sleep = self.sleep
        autoStop = Task { [weak self] in
            try? await sleep(Self.maxListeningSeconds)
            guard !Task.isCancelled, let self, self.listening, self.session == token else { return }
            // The listening bound closes audio; it never confirms a question while the finger is held.
            self.interrupted()
        }
        return .listening
    }

    enum StopStatus: String { case stopped, idle }

    /// Pill released. Unless `cancel`, `speech.final` follows within 1.5 s ("" = nothing heard).
    @discardableResult
    func stop(cancel: Bool) -> StopStatus {
        // A released pill is no longer listening, but recognition still owns a
        // pending final. Background/cancellation must invalidate that final too.
        if cancel {
            let active = listening || awaitingFinal
            session += 1
            listening = false
            latestText = ""
            autoStop?.cancel()
            autoStop = nil
            stopObserving()
            task?.cancel()
            request?.endAudio()
            closeMicrophone()
            finishRecognition()
            if active { emit("speech.state", ["state": "stopped"]) }
            return active ? .stopped : .idle
        }
        guard listening else { return .idle }
        listening = false
        autoStop?.cancel()
        autoStop = nil
        stopObserving()
        request?.endAudio()
        closeMicrophone()
        emit("speech.state", ["state": "stopped"])
        if recognitionFinished {
            awaitingFinal = true
            deliverFinal()
        } else {
            waitForFinal()
        }
        return .stopped
    }

    /// The microphone has closed; the recognizer gets a bounded finalization window.
    func waitForFinal() {
        finalTimeout?.cancel()
        awaitingFinal = true
        let token = session
        let sleep = self.sleep, wait = finalWait
        finalTimeout = Task { [weak self] in
            try? await sleep(wait)
            guard !Task.isCancelled, let self, self.session == token else { return }
            self.deliverFinal()
        }
    }

    /// Background, teardown: the mic closes now, no final.
    func cancel() { stop(cancel: true) }

    private func closeMicrophone() {
        capture.close()
    }

    private func finishRecognition() {
        finalTimeout?.cancel()
        finalTimeout = nil
        awaitingFinal = false
        recognitionFinished = false
        activeLocaleIdentifier = nil
        task = nil
        request = nil
        restoreAudioSession()
    }

    private func deliverFinal() {
        guard awaitingFinal else { return }
        guard matchesActiveLocale else { cancel(); return }
        let text = latestText.trimmingCharacters(in: .whitespacesAndNewlines)
        task?.cancel()
        finishRecognition()
        emit("speech.final", ["text": text])
    }

    /// Back to the voice's spoken-audio category; NeuralVoice.play activates it when Bobby speaks.
    private func restoreAudioSession() {
        capture.restore()
    }

    // MARK: - Callbacks (hop to the main actor)

    private func levelSample(_ rms: Float, token: Int) {
        guard listening, session == token, !recognitionFinished else { return }
        guard matchesActiveLocale else { cancel(); return }
        let now = CACurrentMediaTime()
        guard now - lastLevelAt >= Self.levelInterval else { return }
        lastLevelAt = now
        emit("speech.level", ["level": Self.level(rms: rms)])
    }

    private var matchesActiveLocale: Bool {
        activeLocaleIdentifier == nil || activeLocaleIdentifier == L.localeIdentifier
    }

    private func recognized(text: String?, isFinal: Bool, failed: Bool, token: Int) {
        guard session == token, listening || awaitingFinal else { return }
        guard matchesActiveLocale else { cancel(); return }
        // endAudio/cancel after a final may cause another callback. Preserve the settled text
        // and wait for the explicit release; a late callback must not erase or confirm it.
        guard !recognitionFinished else { return }
        if let text { latestText = text }
        if listening {
            if failed {
                // The recognizer gave up mid-hold (e.g. it lost the audio): tell the page, close the mic.
                listening = false
                autoStop?.cancel()
                stopObserving()
                closeMicrophone()
                task?.cancel()
                finishRecognition()
                emit("speech.state", ["state": "stopped"])
                emit("speech.error", ["code": "failed"])
                return
            }
            if let text, !text.isEmpty { emit("speech.partial", ["text": text]) }
            if isFinal {
                recognitionFinished = true
                request?.endAudio()
                closeMicrophone()
                task?.cancel()
                task = nil
                // Keep the logical hold active. A stopped event would make the page treat
                // this as a release; only stop(cancel:false) may emit the stored final.
            }
            return
        }
        // After release: the final result (or "no speech" error) settles it early.
        if awaitingFinal, isFinal || failed { deliverFinal() }
    }

    nonisolated fileprivate static func tapBlock(request: SFSpeechAudioBufferRecognitionRequest,
                                             level: @escaping @Sendable (Float) -> Void) -> AVAudioNodeTapBlock {
        { buffer, _ in
            request.append(buffer)
            guard let channel = buffer.floatChannelData?[0] else { return }
            let frames = Int(buffer.frameLength)
            guard frames > 0 else { return }
            var sum: Float = 0
            for i in 0..<frames { sum += channel[i] * channel[i] }
            level((sum / Float(frames)).squareRoot())
        }
    }

    nonisolated fileprivate static func resultHandler(_ deliver: @escaping @Sendable (String?, Bool, Bool) -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
        { result, error in
            deliver(result?.bestTranscription.formattedString, result?.isFinal ?? false, error != nil)
        }
    }

    // MARK: - Interruptions

    private func observeInterruptions() {
        stopObserving()
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let began = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(AVAudioSession.InterruptionType.init(rawValue:)) == .began
            guard began else { return }
            MainActor.assumeIsolated { self?.interrupted() }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            // Only a real device change counts (a headset in or out). Our own category switch
            // to play-and-record also posts a route change; that one is not an interruption.
            let reason = (note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt).flatMap(AVAudioSession.RouteChangeReason.init(rawValue:))
            guard reason == .newDeviceAvailable || reason == .oldDeviceUnavailable else { return }
            MainActor.assumeIsolated { self?.interrupted() }
        })
    }

    private func stopObserving() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
    }

    private func interrupted() {
        guard listening else { return }
        stop(cancel: true)
        emit("speech.error", ["code": "interrupted"])
    }
}
