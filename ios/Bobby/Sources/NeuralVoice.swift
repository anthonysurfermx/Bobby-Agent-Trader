// 2026 voice — Microsoft Edge NEURAL voices served by bobby-voice-free
// (free, no per-minute bill). The robotic AVSpeech stays only as an
// offline fallback.
import Foundation
@preconcurrency import AVFoundation

@MainActor
final class NeuralVoice: NSObject, ObservableObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    @Published var speaking = false
    @Published var level: CGFloat = 0

    private var player: AVAudioPlayer?
    private let fallback = AVSpeechSynthesizer()
    private var generation = 0
    private var meterTimer: Timer?

    override init() {
        super.init()
        // Without the delegate the AVSpeech fallback never flips `speaking`
        // back to false — the companion would mouth silence forever.
        fallback.delegate = self
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }

    /// `persona` is the companion's own voice (coral/ballad/sage/ash) and wins
    /// when present; `voiceId` is the persona picked in onboarding. No Edge
    /// hint anymore — a valid `edgeVoice` would force the legacy robotic-ish
    /// Edge chain server-side and silence the warm voices.
    func speak(_ text: String, voiceId: String, persona: String? = nil, vibe: String? = nil) {
        stop()
        generation += 1
        let gen = generation

        Task {
            do {
                var req = URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/bobby-voice-free")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.timeoutInterval = 30
                var body = [
                    "text": text,
                    "lang": L.ttsLang,
                    "voice": persona ?? voiceId,
                ]
                // The onboarding promise is that the selected vibe changes
                // how Bobby sounds, not only the preview sentence. The TTS
                // endpoint already supports this delivery hint; keep sending
                // it on every real answer after onboarding.
                if let serverVibe = Self.serverVibe(vibe) { body["vibe"] = serverVibe }
                req.httpBody = try JSONSerialization.data(withJSONObject: body)
                let (data, resp) = try await URLSession.shared.data(for: req)
                guard gen == self.generation,
                      (resp as? HTTPURLResponse)?.statusCode == 200, data.count > 500 else {
                    if gen == self.generation { self.speakFallback(text) }
                    return
                }
                try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
                try? AVAudioSession.sharedInstance().setActive(true)
                let p = try AVAudioPlayer(data: data)
                p.delegate = self
                p.isMeteringEnabled = true
                self.player = p
                self.speaking = true
                guard p.play() else {
                    self.player = nil
                    self.speaking = false
                    self.speakFallback(text)
                    return
                }
                self.startMetering(p)
            } catch {
                if gen == self.generation { self.speakFallback(text) }
            }
        }
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

    private func speakFallback(_ text: String) {
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: L.isSpanish ? "es-MX" : "en-US") ?? AVSpeechSynthesisVoice(language: "en-US")
        u.rate = 0.52
        speaking = true
        fallback.speak(u)
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
            }
        }
    }

    func stop() {
        generation += 1
        player?.stop()
        player = nil
        meterTimer?.invalidate()
        meterTimer = nil
        fallback.stopSpeaking(at: .immediate)
        speaking = false
        level = 0
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.meterTimer?.invalidate()
            self.meterTimer = nil
            self.level = 0
            self.speaking = false
        }
    }
}
