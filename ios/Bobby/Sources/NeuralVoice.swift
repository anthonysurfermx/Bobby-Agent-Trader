// One-way persona narration served by bobby-voice-free. Bundled previews and
// generated answers use the same persona; failures never switch to Apple speech.
import Foundation
@preconcurrency import AVFoundation

@MainActor
final class NeuralVoice: NSObject, ObservableObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    // One-way avatar narration (clips and TTS), independent of conversational
    // Live/ChatGPT. This client has no microphone or Realtime session flow.
    static let avatarNarrationEnabled = true
    @Published var speaking = false
    @Published var level: CGFloat = 0
    /// Which voice is (or was last) playing: the network persona or the on-device fallback.
    enum Engine: Equatable { case neural, device }
    @Published private(set) var engine: Engine = .neural
    /// Position and length of the network voice's audio; nil for the device voice and when idle.
    @Published private(set) var playback: (time: TimeInterval, duration: TimeInterval)?
    /// Word boundaries of the device voice (`willSpeakRangeOfSpeechString`), in the spoken text.
    var onDeviceWord: ((NSRange) -> Void)?
    /// One device preference shared by onboarding, the desk and the gallery.
    /// Muting also invalidates requests that have not returned audio yet.
    @Published var isMuted: Bool {
        didSet {
            defaults.set(isMuted, forKey: Self.mutePreferenceKey)
            if isMuted { stop() }
        }
    }
    static let mutePreferenceKey = "avatar.voiceMuted"
    private let defaults: UserDefaults

    private var player: AVAudioPlayer?
    private let fallback = AVSpeechSynthesizer()
    private var fallbackUtterance: AVSpeechUtterance?
    private var generation = 0
    private var meterTimer: Timer?
    private let session: URLSession

    /// Read the current consent at use time: gallery voices can outlive the consent sheet.
    /// Bundled clips remain available without sending any text to an external provider.
    private var allowsExternalSpeech: Bool {
        defaults.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion
    }

    init(session: URLSession = .shared, defaults: UserDefaults = .standard) {
        self.session = session
        self.defaults = defaults
        self.isMuted = defaults.bool(forKey: Self.mutePreferenceKey)
        super.init()
        // Without the delegate the AVSpeech fallback never flips `speaking`
        // back to false — the companion would mouth silence forever.
        fallback.delegate = self
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.fallbackUtterance === utterance else { return }
            self.fallbackUtterance = nil
            self.level = 0
            self.speaking = false
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, willSpeakRangeOfSpeechString characterRange: NSRange, utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.fallbackUtterance === utterance else { return }
            self.onDeviceWord?(characterRange)
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in
            guard self.fallbackUtterance === utterance else { return }
            self.fallbackUtterance = nil
            self.level = 0
            self.speaking = false
        }
    }

    /// Generated narration keeps the selected companion identity. Network failures
    /// retry once and report failure; they never replace Bobby with a system voice.
    static let requestTimeoutSeconds: TimeInterval = 20
    static let maximumNarrationWaitSeconds: TimeInterval = requestTimeoutSeconds * 2 + 1.2
    var onFailure: (() -> Void)?
    private var narrationTask: Task<Void, Never>?

    func speak(_ text: String, voiceId: String, persona: String? = nil, vibe: String? = nil, essential: Bool = true, playbackRate: Float = 1.0, free: Bool = false) {
        guard Self.avatarNarrationEnabled, !isMuted, allowsExternalSpeech else { return }
        stop()
        let gen = generation
        narrationTask = Task {
            for attempt in 0..<2 {
                guard gen == self.generation, !self.isMuted, self.allowsExternalSpeech, !Task.isCancelled else { return }
                do {
                    var req = URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/bobby-voice-free")!)
                    req.httpMethod = "POST"
                    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    req.timeoutInterval = Self.requestTimeoutSeconds
                    var body = ["text": text, "lang": L.ttsLang, "voice": persona ?? voiceId]
                    body["mode"] = free ? "free" : "persona"
                    if let serverVibe = Self.serverVibe(vibe) { body["vibe"] = serverVibe }
                    req.httpBody = try JSONSerialization.data(withJSONObject: body)
                    let (data, response) = try await session.data(for: req)
                    guard gen == self.generation, !self.isMuted, self.allowsExternalSpeech, !Task.isCancelled else { return }
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    let mime = response.mimeType ?? ""
                    let provider = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "X-TTS-Provider")
                    let matchingProvider = free || provider == "openai"
                    if status == 200, matchingProvider, mime.hasPrefix("audio/"), data.count > 500,
                       self.play(data, playbackRate: playbackRate) { return }
                    // Invalid requests and throttling will not improve with an immediate retry.
                    if (400..<500).contains(status) { break }
                } catch {
                    guard gen == self.generation, !Task.isCancelled else { return }
                    // Transient transport errors get the same retry as failed HTTP responses.
                }
                if attempt == 0 {
                    do { try await Task.sleep(nanoseconds: 1_200_000_000) }
                    catch { return }
                }
            }
            guard gen == self.generation, !self.isMuted, self.allowsExternalSpeech, !Task.isCancelled else { return }
            self.speaking = false
            self.onFailure?()
        }
    }

    /// A clip bundled with the app, rendered offline by the same
    /// /api/bobby-voice-free voice: it starts instantly and needs no network.
    /// A missing or unplayable clip falls back to the network voice for `fallbackText` only
    /// while the current external-processing consent permits it (checked centrally in speak).
    func speakClip(_ name: String, fallbackText: String, persona: String, vibe: String? = nil, playbackRate: Float = 1.0) {
        guard Self.avatarNarrationEnabled, !isMuted else { return }
        guard let url = Bundle.main.url(forResource: name, withExtension: "mp3"),
              let data = try? Data(contentsOf: url) else {
            speak(fallbackText, voiceId: persona, persona: persona, vibe: vibe, essential: false, playbackRate: playbackRate)
            return
        }
        stop()
        if !play(data, playbackRate: playbackRate) {
            speak(fallbackText, voiceId: persona, persona: persona, vibe: vibe, essential: false, playbackRate: playbackRate)
        }
    }

    @discardableResult
    private func play(_ data: Data, playbackRate: Float) -> Bool {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        guard let p = try? AVAudioPlayer(data: data) else { return false }
        p.delegate = self
        p.isMeteringEnabled = true
        // Short character introductions need a little more momentum
        // than data-heavy analysis. Keep the default at 1× and let
        // onboarding/squad previews opt into the livelier cadence.
        p.enableRate = playbackRate != 1.0
        p.rate = min(1.25, max(0.85, playbackRate))
        player = p
        engine = .neural
        playback = (0, p.duration)
        speaking = true
        guard p.play() else {
            player = nil
            playback = nil
            speaking = false
            return false
        }
        startMetering(p)
        return true
    }

    /// The app's vibe ids (chill/directo/pro) are not the TTS endpoint's
    /// (direct/analytical/wise). Map them; unknown values are omitted so the
    /// server never rejects the request over a delivery hint.
    static func serverVibe(_ raw: String?) -> String? {
        switch raw?.lowercased() {
        case "chill": return "wise"
        case "directo": return "direct"
        case "pro": return "analytical"
        case "direct", "analytical", "wise": return raw?.lowercased()
        default: return nil
        }
    }

    private func startMetering(_ player: AVAudioPlayer) {
        meterTimer?.invalidate()
        // The timer fires on the main run loop; hop to the main actor explicitly
        // so mutating @Published level and touching the player are isolation-safe.
        meterTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 24.0, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let player = self.player, player.isPlaying else { return }
                player.updateMeters()
                let power = player.averagePower(forChannel: 0)
                self.level = min(1, max(0.04, CGFloat(pow(10, power / 20)) * 2.5))
                self.playback = (player.currentTime, player.duration)
            }
        }
    }

    func stop() {
        generation += 1
        narrationTask?.cancel()
        narrationTask = nil
        player?.stop()
        player = nil
        meterTimer?.invalidate()
        meterTimer = nil
        fallbackUtterance = nil
        fallback.stopSpeaking(at: .immediate)
        playback = nil
        speaking = false
        level = 0
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.player = nil
            self.meterTimer?.invalidate()
            self.meterTimer = nil
            self.level = 0
            self.playback = nil
            self.speaking = false
        }
    }
}
