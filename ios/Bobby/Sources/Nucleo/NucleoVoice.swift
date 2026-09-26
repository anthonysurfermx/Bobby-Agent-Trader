// Bobby's voice for the Núcleo page (Nucleo/ARCHITECTURE.md §2.5–2.6). A thin wrapper
// over the app's NeuralVoice: the page queues a line by id and gets voice.start /
// voice.level / voice.progress / voice.word / voice.end back. NeuralVoice keeps
// `speaking` false while the TTS request is in flight, so start and end are found on
// the edges of `speaking`, and a 10 s watchdog guarantees exactly one voice.end per id.
import Combine
import Foundation
import QuartzCore

@MainActor
final class NucleoVoice {
    static let maxLength = 800
    static let idPattern = #"^[A-Za-z0-9_.:-]{1,64}$"#
    static let watchdogSeconds: Double = 10

    let voice: NeuralVoice
    var emit: (String, [String: Any]) -> Void = { _, _ in }

    private struct Line {
        let id: String
        let text: String
        /// UTF-16 offset of each whitespace-separated word, in order (voice.word index).
        let wordStarts: [Int]
        var started = false
    }

    private var current: Line?
    private var watchdog: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()
    /// Device voice: the last word onset, driving a syllable envelope for voice.level
    /// (AVSpeechSynthesizer exposes no meter).
    private var wordOnset: (at: CFTimeInterval, length: Int)?
    private var envelopeTimer: Timer?

    init(voice: NeuralVoice) {
        self.voice = voice
        voice.$speaking.sink { [weak self] speaking in
            // @Published delivers in willSet: read the new value from the argument, and let
            // NeuralVoice finish its own bookkeeping before reacting.
            DispatchQueue.main.async { self?.speakingChanged(speaking) }
        }.store(in: &cancellables)
        voice.$level.sink { [weak self] level in self?.levelChanged(level) }.store(in: &cancellables)
        voice.$playback.sink { [weak self] playback in self?.playbackChanged(playback) }.store(in: &cancellables)
        voice.onDeviceWord = { [weak self] range in self?.deviceWord(range) }
    }

    var isActive: Bool { current != nil }

    enum Status: String { case queued, muted, tooLong = "too_long" }

    /// `speak{id,text}`: a new line stops the previous one (`voice.end{stopped}`).
    func speak(id: String, text: String, voiceId: String, persona: String?, vibe: String?) -> Status {
        guard text.count <= Self.maxLength else { return .tooLong }
        guard !voice.isMuted else { return .muted }
        begin(id: id, text: text)
        voice.speak(text, voiceId: voiceId, persona: persona, vibe: vibe, essential: true)
        return .queued
    }

    /// `previewVoice`: the companion's bundled pick line, free and instant.
    func speakClip(id: String, clip: String, fallbackText: String, persona: String) -> Status {
        guard !voice.isMuted else { return .muted }
        begin(id: id, text: fallbackText)
        voice.speakClip(clip, fallbackText: fallbackText, persona: persona)
        return .queued
    }

    /// Stops the current line (if any) and says so once.
    func stop(reason: String = "stopped") {
        let line = current
        finish(reason: reason)
        if line != nil || voice.speaking { voice.stop() }
    }

    func teardown() {
        stop()
        voice.onDeviceWord = nil
        cancellables.removeAll()
    }

    // MARK: - Edges

    private func begin(id: String, text: String) {
        if current != nil { finish(reason: "stopped") }
        current = Line(id: id, text: text, wordStarts: Self.wordStarts(text))
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.watchdogSeconds * 1_000_000_000))
            guard !Task.isCancelled, let self, let line = self.current, line.id == id, !line.started else { return }
            // Playback never started (network voice and fallback both failed): end it honestly.
            self.voice.stop()
            self.finish(reason: "failed")
        }
    }

    private func finish(reason: String) {
        watchdog?.cancel()
        watchdog = nil
        envelopeTimer?.invalidate()
        envelopeTimer = nil
        wordOnset = nil
        guard let line = current else { return }
        current = nil
        emit("voice.end", ["id": line.id, "reason": reason])
    }

    private func speakingChanged(_ speaking: Bool) {
        guard var line = current else { return }
        if speaking, !line.started {
            line.started = true
            current = line
            watchdog?.cancel()
            watchdog = nil
            let neural = voice.engine == .neural
            let duration: Any = neural ? (voice.playback.map { $0.duration as Any } ?? NSNull()) : NSNull()
            emit("voice.start", ["id": line.id, "durationSec": duration, "engine": neural ? "neural" : "device"])
            if !neural { startEnvelope() }
        } else if !speaking, line.started {
            finish(reason: "finished")
        }
    }

    private func levelChanged(_ level: CGFloat) {
        guard let line = current, line.started, voice.engine == .neural else { return }
        emit("voice.level", ["id": line.id, "level": Double(min(1, max(0, level)))])
    }

    private func playbackChanged(_ playback: (time: TimeInterval, duration: TimeInterval)?) {
        guard let line = current, line.started, voice.engine == .neural, let playback, playback.duration > 0 else { return }
        emit("voice.progress", ["id": line.id, "t": min(playback.time, playback.duration), "duration": playback.duration])
    }

    private func deviceWord(_ range: NSRange) {
        guard let line = current, line.started, voice.engine == .device else { return }
        let index = Self.wordIndex(line.wordStarts, location: range.location)
        emit("voice.word", ["id": line.id, "index": index])
        wordOnset = (CACurrentMediaTime(), range.length)
    }

    /// 30 Hz syllable envelope for the device voice: a rise and fall over each spoken word.
    private func startEnvelope() {
        envelopeTimer?.invalidate()
        envelopeTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let line = self.current, line.started else { return }
                var level = 0.06
                if let onset = self.wordOnset {
                    let span = min(0.6, max(0.12, 0.07 * Double(onset.length) + 0.06))
                    let t = CACurrentMediaTime() - onset.at
                    if t < span { level = 0.12 + 0.72 * sin(Double.pi * t / span) }
                }
                self.emit("voice.level", ["id": line.id, "level": min(1, max(0, level))])
            }
        }
    }

    // MARK: - Words

    /// UTF-16 start of every whitespace-separated word (the page splits the same text on /\s+/).
    nonisolated static func wordStarts(_ text: String) -> [Int] {
        var starts: [Int] = []
        var offset = 0
        var inWord = false
        for ch in text {
            if ch.isWhitespace {
                inWord = false
            } else if !inWord {
                starts.append(offset)
                inWord = true
            }
            offset += ch.utf16.count
        }
        return starts
    }

    /// The word containing (or last starting before) a UTF-16 location.
    nonisolated static func wordIndex(_ starts: [Int], location: Int) -> Int {
        var index = 0
        for (i, start) in starts.enumerated() where start <= location { index = i }
        return index
    }
}
