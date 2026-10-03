// One-way persona narration served by bobby-voice-free. Bundled previews and
// generated answers use the selected persona; localized on-device speech is the bounded fallback.
// Build 53 adds prepared playback (authenticated briefing audio fetched by the caller): one completion per
// request, keyed by the request's generation so an older completion can never end a newer request; stop()
// stays the universal cancel and answers a pending request with `.stopped` exactly once.
import Foundation
@preconcurrency import AVFoundation

/// How one prepared-audio request ended (playPrepared). Delivered exactly once per accepted request.
enum NarrationEnd: Equatable, Sendable {
    /// The audio played to its end.
    case finished
    /// stop() (or anything that calls it: mute, a new line, a new request) cancelled it.
    case stopped
    /// The audio could not be decoded or played on.
    case failed
}

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
    /// A prepared request is paused: `speaking` stays true (the line is not over, so nothing reads the pause
    /// as an end), `level` drops to 0 and the position is kept.
    @Published private(set) var isPaused = false
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

    /// Whose voice speaks: each companion's own (the default), or one feminine or masculine voice for all of them.
    enum VoiceGender: String, CaseIterable, Sendable {
        case companion, female, male

        /// The matching on-device voice gender; `.unspecified` keeps the fallback's usual choice.
        var deviceGender: AVSpeechSynthesisVoiceGender {
            switch self {
            case .companion: return .unspecified
            case .female: return .female
            case .male: return .male
            }
        }
    }
    static let genderPreferenceKey = "voice.gender"
    /// Read at use time, so every NeuralVoice follows the one device preference. Changing it stops the
    /// current line (it was made with the previous voice); the next line uses the new one.
    var voiceGender: VoiceGender {
        get { defaults.string(forKey: Self.genderPreferenceKey).flatMap(VoiceGender.init(rawValue:)) ?? .companion }
        set {
            guard newValue != voiceGender else { return }
            objectWillChange.send()
            defaults.set(newValue.rawValue, forKey: Self.genderPreferenceKey)
            stop()
        }
    }

    /// The `voice` a network request carries: the companion's persona, or the chosen gender in its place.
    private func requestVoice(_ companionVoice: String) -> String {
        let gender = voiceGender
        return gender == .companion ? companionVoice : gender.rawValue
    }

    private var player: AVAudioPlayer?
    private let fallback = AVSpeechSynthesizer()
    private var fallbackUtterance: AVSpeechUtterance?
    private var generation = 0
    private var meterTimer: Timer?
    private let session: URLSession
    /// The completion of the current prepared request, tagged with the generation it was accepted under.
    private var preparedFinish: (generation: Int, onFinish: (NarrationEnd) -> Void)?

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
            self.endFallback(.finished)
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
            self.endFallback(.stopped)
        }
    }

    private func endFallback(_ end: NarrationEnd) {
        fallbackUtterance = nil
        isPaused = false
        level = 0
        speaking = false
        if let pending = preparedFinish, pending.generation == generation {
            preparedFinish = nil
            pending.onFinish(end)
        }
    }

    /// Generated narration keeps the selected persona. New languages may use a matching
    /// on-device voice after the bounded network retry; existing EN/ES narration keeps its persona.
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
                    var body = ["text": text, "lang": L.ttsLang, "language": L.language, "locale": L.localeIdentifier, "voice": self.requestVoice(persona ?? voiceId)]
                    if let country = L.country { body["country"] = country }
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
            if ["en", "es"].contains(L.language) || !self.playOnDevice(text, language: L.language, requiresConsent: true) {
                self.speaking = false
                self.onFailure?()
            }
        }
    }

    /// A clip bundled with the app, rendered offline by the same
    /// /api/bobby-voice-free voice: it starts instantly and needs no network.
    /// A missing or unplayable clip falls back to the network voice for `fallbackText` only
    /// while the current external-processing consent permits it (checked centrally in speak).
    /// Languages with no recorded clips yet (fr, pt, it, de) therefore keep the companion's own persona
    /// once the notice is accepted; before consent no text leaves the phone and they use the device voice.
    /// The clips are recorded in the companion's own voice, so a chosen voice gender skips them in every
    /// language: `fallbackText` goes to the network voice, or before consent to the device voice of that gender.
    func speakClip(_ name: String, fallbackText: String, persona: String, vibe: String? = nil, playbackRate: Float = 1.0) {
        guard Self.avatarNarrationEnabled, !isMuted else { return }
        let companionVoice = voiceGender == .companion
        if companionVoice, name.hasSuffix("-" + L.language),
           let url = Bundle.main.url(forResource: name, withExtension: "mp3"),
           let data = try? Data(contentsOf: url) {
            stop()
            if play(data, playbackRate: playbackRate) { return }
        }
        if allowsExternalSpeech || (companionVoice && ["en", "es"].contains(L.language)) {
            // speak() checks consent itself and, for the new languages, ends on the device voice if the network fails.
            speak(fallbackText, voiceId: persona, persona: persona, vibe: vibe, essential: false, playbackRate: playbackRate)
            return
        }
        if !playOnDevice(fallbackText, language: L.language, requiresConsent: false) { onFailure?() }
    }

    /// Plays audio the caller already fetched (briefing narration). Mute and the external-processing consent
    /// are read now, at use time. Any current line or request is stopped first (its completion gets `.stopped`).
    /// Returns false — and never calls `onFinish` — when nothing started; otherwise `onFinish` runs exactly
    /// once: `.finished`, `.stopped` (stop(), mute, a newer line or request) or `.failed`.
    @discardableResult
    func playPrepared(_ data: Data, playbackRate: Float = 1.0, onFinish: @escaping (NarrationEnd) -> Void) -> Bool {
        guard Self.avatarNarrationEnabled, !isMuted, allowsExternalSpeech else { return false }
        stop()
        guard play(data, playbackRate: playbackRate) else { return false }
        preparedFinish = (generation, onFinish)
        return true
    }

    /// Speaks the locally stored Apple name on this device. No HTTP request or provider text is involved.
    @discardableResult
    func playLocalGreeting(_ text: String, language: String, onFinish: @escaping (NarrationEnd) -> Void) -> Bool {
        playOnDevice(text, language: language, requiresConsent: true, onFinish: onFinish)
    }

    /// Select only voices in the text's language; a missing voice must never use iOS's unrelated default.
    /// A chosen `gender` is preferred inside that language only; with no such voice installed the choice
    /// is exactly the one made without a preference.
    static func deviceVoice(language: String, gender: AVSpeechSynthesisVoiceGender = .unspecified) -> AVSpeechSynthesisVoice? {
        let base = language.split(separator: "-").first.map(String.init) ?? language
        guard AppLanguage(rawValue: base) != nil else { return nil }
        let preferred = language.contains("-") ? [language] : Locale.preferredLanguages
        let resolution = LanguageResolution.resolve(selection: base, preferredLanguages: preferred,
                                                    region: Locale.current.region?.identifier)
        let available = AVSpeechSynthesisVoice.speechVoices().filter(isStandardDeviceVoice)
        if gender != .unspecified {
            // Same order as below (exact locale, then the language's other regions; best quality first).
            for candidate in resolution.speechLocaleCandidates {
                let matches = available.filter {
                    $0.gender == gender && $0.language.caseInsensitiveCompare(candidate) == .orderedSame
                }
                for quality in [AVSpeechSynthesisVoiceQuality.premium, .enhanced] {
                    if let best = matches.first(where: { $0.quality == quality }) { return best }
                }
                if let stock = matches.first { return stock }
            }
        }
        // Exact locale first (language and region), then the language's other regions.
        for candidate in resolution.speechLocaleCandidates {
            let matches = available.filter { $0.language.caseInsensitiveCompare(candidate) == .orderedSame }
            // A downloaded premium or enhanced voice wins. Stock voices all tie on quality, so there the
            // system's own default for the locale is used instead of whichever the list happens to start with.
            for quality in [AVSpeechSynthesisVoiceQuality.premium, .enhanced] {
                if let best = matches.first(where: { $0.quality == quality }) { return best }
            }
            if let voice = AVSpeechSynthesisVoice(language: candidate), voice.language.lowercased().hasPrefix(base + "-"),
               isStandardDeviceVoice(voice) { return voice }
            if let stock = matches.first { return stock }
        }
        return nil
    }

    /// Novelty ("speech.synthesis.voice.*"), Eloquence and Personal Voice entries are never Bobby's fallback voice.
    static func isStandardDeviceVoice(_ voice: AVSpeechSynthesisVoice) -> Bool {
        let identifier = voice.identifier.lowercased()
        if identifier.contains("eloquence") || identifier.contains("speech.synthesis.voice.") { return false }
        return voice.voiceTraits.isDisjoint(with: [.isNoveltyVoice, .isPersonalVoice])
    }

    @discardableResult
    private func playOnDevice(_ text: String, language: String, requiresConsent: Bool,
                              onFinish: ((NarrationEnd) -> Void)? = nil) -> Bool {
        guard Self.avatarNarrationEnabled, !isMuted, !requiresConsent || allowsExternalSpeech,
              !text.isEmpty,
              let selectedVoice = Self.deviceVoice(language: language, gender: voiceGender.deviceGender) else { return false }
        stop()
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio)
        try? AVAudioSession.sharedInstance().setActive(true)
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = selectedVoice
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        fallbackUtterance = utterance
        engine = .device
        speaking = true
        if let onFinish { preparedFinish = (generation, onFinish) }
        fallback.speak(utterance)
        return true
    }

    /// Holds the current audio at its position. `speaking` is left true on purpose: page narration reads its
    /// end from the falling edge of `speaking`, and a pause is not an end.
    func pause() {
        if fallbackUtterance != nil, !isPaused {
            if fallback.pauseSpeaking(at: .immediate) { isPaused = true; level = 0 }
            return
        }
        guard let player, player.isPlaying, !isPaused else { return }
        player.pause()
        isPaused = true
        level = 0
        playback = (player.currentTime, player.duration)
    }

    /// Continues a paused request from where it stopped. Muting or withdrawn consent while paused stops it.
    func resume() {
        if fallbackUtterance != nil, isPaused {
            guard !isMuted, allowsExternalSpeech else { stop(); return }
            if fallback.continueSpeaking() { isPaused = false }
            return
        }
        guard let player, isPaused else { return }
        guard !isMuted, allowsExternalSpeech else { stop(); return }
        isPaused = false
        guard player.play() else { endPlayer(.failed); return }
        startMetering(player)
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
        let pending = preparedFinish
        preparedFinish = nil
        generation += 1
        isPaused = false
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
        // Last, after the state is idle: the owner may start its next request from inside the callback.
        pending?.onFinish(.stopped)
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.endPlayer(flag ? .finished : .failed)
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            guard self.player === player else { return }
            self.player?.stop()
            self.endPlayer(.failed)
        }
    }

    /// The current player is over on its own (not through stop()): idle, then answer its prepared request.
    private func endPlayer(_ end: NarrationEnd) {
        player = nil
        meterTimer?.invalidate()
        meterTimer = nil
        isPaused = false
        level = 0
        playback = nil
        speaking = false
        // Only the request accepted under the current generation; stop() already answered any older one.
        if let pending = preparedFinish, pending.generation == generation {
            preparedFinish = nil
            pending.onFinish(end)
        }
    }
}
