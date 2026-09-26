// Hold-to-ask speech for the Núcleo page (Nucleo/ARCHITECTURE.md §2.6, R8).
// Recognition is ON-DEVICE ONLY: audio never leaves the phone. The microphone is live
// only between `speech.start` (pill down) and `speech.stop` (pill up), stops on its own
// after 60 s, on an audio interruption or a headset change, and when the app leaves
// the foreground. If the locale cannot recognize on device, the mic is `unavailable`
// and the page offers typing.
import AVFoundation
import Foundation
import Speech

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

    private var recognizer: SFSpeechRecognizer?
    private var recognizerLocale: String?
    private var engine: AVAudioEngine?
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var listening = false
    private var awaitingFinal = false
    private var latestText = ""
    private var session = 0
    private var autoStop: Task<Void, Never>?
    private var finalTimeout: Task<Void, Never>?
    private var lastLevelAt: CFTimeInterval = 0
    private var observers: [NSObjectProtocol] = []

    var isListening: Bool { listening }

    // MARK: - Permission

    struct Permission: Equatable {
        let state: String
        let onDevice: Bool
        var json: [String: Any] { ["state": state, "onDevice": onDevice] }
    }

    /// Never prompts.
    func permission() -> Permission {
        guard let recognizer = resolveRecognizer() else { return Permission(state: "unavailable", onDevice: false) }
        guard recognizer.supportsOnDeviceRecognition else { return Permission(state: "unavailable", onDevice: false) }
        return Permission(state: Self.state(mic: AVAudioApplication.shared.recordPermission,
                                            speech: SFSpeechRecognizer.authorizationStatus()),
                          onDevice: true)
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

    /// es-MX on a Spanish phone, en-US otherwise; the first of those the device supports.
    private func resolveRecognizer() -> SFSpeechRecognizer? {
        let candidates = L.isSpanish ? ["es-MX", "es-US", "es-ES"] : ["en-US", "en-GB"]
        if let recognizer, let recognizerLocale, candidates.contains(recognizerLocale) { return recognizer }
        for id in candidates {
            if let r = SFSpeechRecognizer(locale: Locale(identifier: id)), r.supportsOnDeviceRecognition {
                recognizer = r
                recognizerLocale = id
                return r
            }
        }
        return nil
    }

    /// The one request shape this app ever sends: on-device only, partial results, punctuation.
    nonisolated static func makeRequest(contextualStrings: [String]) -> SFSpeechAudioBufferRecognitionRequest {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.requiresOnDeviceRecognition = true
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
        guard let recognizer, recognizer.isAvailable else { return .unavailable }
        willStart()

        let audio = AVAudioSession.sharedInstance()
        do {
            try audio.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers])
            try audio.setActive(true, options: [])
        } catch {
            restoreAudioSession()
            emit("speech.error", ["code": "failed", "message": "audio session"])
            return .unavailable
        }

        let request = Self.makeRequest(contextualStrings: vocabulary)
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            restoreAudioSession()
            return .unavailable
        }
        session += 1
        let token = session
        input.installTap(onBus: 0, bufferSize: 1024, format: format,
                         block: Self.tapBlock(request: request) { [weak self] rms in
            Task { @MainActor in self?.levelSample(rms, token: token) }
        })
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            restoreAudioSession()
            emit("speech.error", ["code": "failed", "message": "audio engine"])
            return .unavailable
        }
        self.engine = engine
        self.request = request
        latestText = ""
        listening = true
        awaitingFinal = false
        task = recognizer.recognitionTask(with: request, resultHandler: Self.resultHandler { [weak self] text, isFinal, failed in
            Task { @MainActor in self?.recognized(text: text, isFinal: isFinal, failed: failed, token: token) }
        })
        observeInterruptions()
        emit("speech.state", ["state": "listening"])
        autoStop = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.maxListeningSeconds * 1_000_000_000))
            guard !Task.isCancelled, let self, self.listening, self.session == token else { return }
            _ = self.stop(cancel: false)
        }
        return .listening
    }

    enum StopStatus: String { case stopped, idle }

    /// Pill released. Unless `cancel`, `speech.final` follows within 1.5 s ("" = nothing heard).
    @discardableResult
    func stop(cancel: Bool) -> StopStatus {
        guard listening else { return .idle }
        listening = false
        autoStop?.cancel()
        autoStop = nil
        stopObserving()
        request?.endAudio()
        closeMicrophone()
        emit("speech.state", ["state": "stopped"])
        if cancel {
            task?.cancel()
            finishRecognition()
            return .stopped
        }
        awaitingFinal = true
        let token = session
        finalTimeout = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.finalWaitSeconds * 1_000_000_000))
            guard !Task.isCancelled, let self, self.session == token else { return }
            self.deliverFinal()
        }
        return .stopped
    }

    /// Background, teardown: the mic closes now, no final.
    func cancel() { stop(cancel: true) }

    private func closeMicrophone() {
        if let engine {
            engine.inputNode.removeTap(onBus: 0)
            engine.stop()
        }
        engine = nil
    }

    private func finishRecognition() {
        finalTimeout?.cancel()
        finalTimeout = nil
        awaitingFinal = false
        task = nil
        request = nil
        restoreAudioSession()
    }

    private func deliverFinal() {
        guard awaitingFinal else { return }
        let text = latestText.trimmingCharacters(in: .whitespacesAndNewlines)
        task?.cancel()
        finishRecognition()
        emit("speech.final", ["text": text])
    }

    /// Back to the voice's spoken-audio category; NeuralVoice.play activates it when Bobby speaks.
    private func restoreAudioSession() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
    }

    // MARK: - Callbacks (hop to the main actor)

    private func levelSample(_ rms: Float, token: Int) {
        guard listening, session == token else { return }
        let now = CACurrentMediaTime()
        guard now - lastLevelAt >= Self.levelInterval else { return }
        lastLevelAt = now
        emit("speech.level", ["level": Self.level(rms: rms)])
    }

    private func recognized(text: String?, isFinal: Bool, failed: Bool, token: Int) {
        guard session == token else { return }
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
            return
        }
        // After release: the final result (or "no speech" error) settles it early.
        if awaitingFinal, isFinal || failed { deliverFinal() }
    }

    nonisolated private static func tapBlock(request: SFSpeechAudioBufferRecognitionRequest,
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

    nonisolated private static func resultHandler(_ deliver: @escaping @Sendable (String?, Bool, Bool) -> Void) -> (SFSpeechRecognitionResult?, Error?) -> Void {
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
