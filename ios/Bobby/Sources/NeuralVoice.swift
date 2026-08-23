// 2026 voice — Microsoft Edge NEURAL voices served by bobby-voice-free
// (free, no per-minute bill). The robotic AVSpeech stays only as an
// offline fallback.
import Foundation
@preconcurrency import AVFoundation

@MainActor
final class NeuralVoice: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var speaking = false
    @Published var level: CGFloat = 0

    private var player: AVAudioPlayer?
    private let fallback = AVSpeechSynthesizer()
    private var generation = 0
    private var meterTimer: Timer?

    func speak(_ text: String, voiceId: String) {
        stop()
        generation += 1
        let gen = generation

        Task {
            do {
                var req = URLRequest(url: URL(string: "https://bobbyprotocol.xyz/api/bobby-voice-free")!)
                req.httpMethod = "POST"
                req.setValue("application/json", forHTTPHeaderField: "Content-Type")
                req.timeoutInterval = 30
                req.httpBody = try JSONSerialization.data(withJSONObject: [
                    "text": text, "lang": "es", "voice": "cio", "edgeVoice": voiceId,
                ])
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
                p.play()
                self.startMetering(p)
            } catch {
                if gen == self.generation { self.speakFallback(text) }
            }
        }
    }

    private func speakFallback(_ text: String) {
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "es-MX") ?? AVSpeechSynthesisVoice(language: "es-ES")
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
