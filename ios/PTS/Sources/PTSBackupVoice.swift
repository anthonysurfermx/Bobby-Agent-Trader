import AVFoundation
import CryptoKit

/// Backup voice for when OpenAI Realtime is unavailable (credits, outage,
/// network). Every reviewed phrase ships pre-rendered as `fb-<sha1>.mp3` with
/// the free Edge es-MX Dalia voice, so it plays without any provider; a
/// phrase without a clip falls back to the on-device Spanish voice.
@MainActor final class PTSBackupVoice: NSObject, ObservableObject, AVAudioPlayerDelegate, AVSpeechSynthesizerDelegate {
    @Published private(set) var speaking = false
    private var player: AVAudioPlayer?
    private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    static func clipName(for text: String) -> String {
        let digest = Insecure.SHA1.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
        return "fb-" + digest.prefix(12)
    }

    func speak(_ text: String) {
        stop()
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio)
        try? session.setActive(true)
        if let url = Bundle.main.url(forResource: Self.clipName(for: text), withExtension: "mp3"),
           let clip = try? AVAudioPlayer(contentsOf: url) {
            clip.delegate = self
            player = clip
            speaking = clip.play()
            if speaking { return }
        }
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "es-MX")
        speaking = true
        synthesizer.speak(utterance)
    }

    func stop() {
        player?.stop(); player = nil
        if synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .immediate) }
        speaking = false
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in self.speaking = false }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
}
