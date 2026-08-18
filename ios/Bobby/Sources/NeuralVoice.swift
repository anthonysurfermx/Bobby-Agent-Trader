// 2026 voice — Microsoft Edge NEURAL voices served by bobby-voice-free
// (free, no per-minute bill). The robotic AVSpeech stays only as an
// offline fallback.
import Foundation
import AVFoundation

@MainActor
final class NeuralVoice: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published var speaking = false

    private var player: AVAudioPlayer?
    private let fallback = AVSpeechSynthesizer()
    private var generation = 0

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
                self.player = p
                self.speaking = true
                p.play()
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

    func stop() {
        generation += 1
        player?.stop()
        player = nil
        fallback.stopSpeaking(at: .immediate)
        speaking = false
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.speaking = false }
    }
}
