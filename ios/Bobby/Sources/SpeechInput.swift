// Voice input — on-device speech recognition (es-MX). Tap the mic, talk,
// tap again (or pause) and the question sends itself. This plus Bobby's
// spoken answers closes the full voice loop with zero per-minute API cost;
// the OpenAI Realtime full-duplex desk stays as a premium upgrade path.
import Foundation
import Speech
import AVFoundation

@MainActor
final class SpeechInput: NSObject, ObservableObject {
    @Published var listening = false
    @Published var authorized = true

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "es-MX"))
        ?? SFSpeechRecognizer(locale: Locale(identifier: "es-ES"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var silenceTimer: Timer?
    private var latest = ""
    private var onFinal: ((String) -> Void)?

    func toggle(onPartial: @escaping (String) -> Void, onFinal: @escaping (String) -> Void) {
        listening ? finish() : start(onPartial: onPartial, onFinal: onFinal)
    }

    private func start(onPartial: @escaping (String) -> Void, onFinal: @escaping (String) -> Void) {
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            Task { @MainActor in
                guard let self else { return }
                guard status == .authorized else { self.authorized = false; return }
                AVAudioApplication.requestRecordPermission { granted in
                    Task { @MainActor in
                        guard granted else { self.authorized = false; return }
                        self.begin(onPartial: onPartial, onFinal: onFinal)
                    }
                }
            }
        }
    }

    private func begin(onPartial: @escaping (String) -> Void, onFinal: @escaping (String) -> Void) {
        guard let recognizer, recognizer.isAvailable else { authorized = false; return }
        self.onFinal = onFinal
        latest = ""

        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.record, mode: .measurement, options: .duckOthers)
        try? session.setActive(true, options: .notifyOthersOnDeactivation)

        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        request = req

        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.request?.append(buffer)
        }

        engine.prepare()
        guard (try? engine.start()) != nil else { authorized = false; return }
        listening = true

        task = recognizer.recognitionTask(with: req) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    self.latest = result.bestTranscription.formattedString
                    onPartial(self.latest)
                    self.armSilenceTimer()   // 1.6s of quiet = the user finished
                }
                if error != nil { self.finish() }
            }
        }
    }

    private func armSilenceTimer() {
        silenceTimer?.invalidate()
        silenceTimer = Timer.scheduledTimer(withTimeInterval: 1.6, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.finish() }
        }
    }

    func finish() {
        guard listening else { return }
        listening = false
        silenceTimer?.invalidate()
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [])
        let text = latest
        latest = ""
        if !text.isEmpty { onFinal?(text) }
    }
}
