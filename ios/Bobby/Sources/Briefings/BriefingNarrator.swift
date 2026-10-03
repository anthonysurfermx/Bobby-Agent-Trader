// Bobby Pro market briefings — narration of one report (build 53), the real BriefingPlayback.
// Flow per segment, in order: POST /api/briefing-voice (ids only) → 200 ready | 202 → bounded polling of
// GET /api/briefing-audio → NeuralVoice.playPrepared → the next segment ONLY on `.finished` of this segment's
// own request. Invariants:
//  - Nothing personal leaves the phone: the voice request carries the report id, content version, segment
//    index and the report's frozen voice/language; never text or names. The Idempotency-Key is derived from
//    (briefId, contentVersion, segment) only, so a retry of the same segment is the same request.
//  - `.stopped` and `.failed` never advance. A late completion of an older segment (or an older run) is
//    ignored: each segment waits on its own token, and every await re-checks run + owner + generation.
//  - Polling is bounded (≤ 6 audio requests and ≤ 20 s of waiting per segment); then the narration ends in
//    `.failed` ("audio unavailable — the text is above"). The text never depends on audio.
//  - Stops on: app background, account change, mute, audio-consent or risk-notice withdrawal, the mic or an
//    analysis starting, the report closing (the view calls stop()), and a new play. Page narration is
//    stopped before a briefing starts (its single `voice.end{stopped}` is expected); an active mic or
//    analysis is never interrupted — play is refused instead.
//  - Autoplay (a notification tap) only when not muted, the risk notice is accepted, the account has audio
//    consent and no other app is playing audio; otherwise the play button waits. No request when muted.
//  - Fetched audio is cached in memory for the open report only (dropped on account change and with the
//    narrator itself when the report screen goes away).
import AVFoundation
import Combine
import CryptoKit
import Foundation
import UIKit

/// The audio sink the narrator drives. NeuralVoice in the app; a recorder in tests.
@MainActor
protocol BriefingAudioOutput: AnyObject {
    var isMuted: Bool { get }
    var isPaused: Bool { get }
    /// On-device synthesis only; the given name is never sent to the voice endpoint.
    func playLocalGreeting(_ text: String, language: String, onFinish: @escaping (NarrationEnd) -> Void) -> Bool
    func playPrepared(_ data: Data, playbackRate: Float, onFinish: @escaping (NarrationEnd) -> Void) -> Bool
    func pause()
    func resume()
    func stop()
}

extension NeuralVoice: BriefingAudioOutput {}

@MainActor
final class BriefingNarrator: BriefingPlayback {
    /// Everything outside the narrator, injectable (the NucleoLevelCenter pattern).
    @MainActor
    struct Environment {
        var requestVoice: (_ briefId: String, _ contentVersion: Int, _ segment: Int, _ voice: String,
                           _ language: String, _ idempotencyKey: String) async throws -> BriefingVoiceState
        var audio: (_ audioId: String) async -> BriefingAudio
        var currentUser: () -> String?
        var currentGeneration: () -> UUID
        var riskAccepted: () -> Bool
        /// The account's audio consent; nil = settings not loaded yet.
        var audioConsent: () -> Bool?
        /// Loads the account settings once when the consent is unknown (R11 and sign-in are checked inside).
        var loadAudioConsent: () async -> Bool?
        var micActive: () -> Bool
        var analysisBusy: () -> Bool
        /// Another app (music, a call, a podcast) is playing.
        var otherAudioPlaying: () -> Bool
        /// Re-read before starting audio: a report can finish loading after the app leaves the foreground.
        var appActive: () -> Bool = { true }
        /// Apple's given name is scoped to the signed-in Apple ID and read on this device at use time.
        var localGivenName: () -> String? = { nil }
        /// Stops the page's narration line before a briefing takes the voice.
        var stopPageVoice: () -> Void
        var sleep: (TimeInterval) async throws -> Void

        static func live(stopPageVoice: @escaping () -> Void, micActive: @escaping () -> Bool,
                         analysisBusy: @escaping () -> Bool) -> Environment {
            Environment(
                requestVoice: { id, version, segment, voice, language, key in
                    try await BriefingsAPI().requestVoice(briefId: id, contentVersion: version, segment: segment,
                                                          voice: voice, language: language, idempotencyKey: key)
                },
                audio: { await BriefingsAPI().audio(id: $0) },
                currentUser: { AccountSession.shared.session?.userId },
                currentGeneration: { AccountSession.shared.generation },
                riskAccepted: { UserDefaults.standard.integer(forKey: "agent.riskNoticeVersion") >= RiskNotice.currentVersion },
                audioConsent: { BriefingsCenter.shared.settings?.audioConsentEnabled },
                loadAudioConsent: {
                    _ = await BriefingsCenter.shared.refresh()
                    return BriefingsCenter.shared.settings?.audioConsentEnabled
                },
                micActive: micActive,
                analysisBusy: analysisBusy,
                otherAudioPlaying: { AVAudioSession.sharedInstance().isOtherAudioPlaying },
                appActive: { UIApplication.shared.applicationState == .active },
                localGivenName: { AppleGivenName.name(for: AccountSession.shared.session?.appleUserId) },
                stopPageVoice: stopPageVoice,
                sleep: { seconds in try await Task.sleep(nanoseconds: UInt64(max(0, seconds) * 1_000_000_000)) })
        }
    }

    /// Per segment: at most this many audio requests and this much waiting before giving up.
    static let maxAudioRequests = 6
    static let maxWaitSeconds: TimeInterval = 20
    static let defaultRetrySeconds: TimeInterval = 2

    @Published private(set) var phase: BriefingPlaybackState = .idle
    @Published private(set) var currentSegment: Int?

    /// What the view shows: idle/finished become `.unavailable` (bar hidden) while narration is not allowed;
    /// an active run and a failure stay visible.
    var state: BriefingPlaybackState {
        switch phase {
        case .preparing, .playing, .paused, .failed: return phase
        case .idle, .finished, .unavailable: return narrationAllowed ? phase : .unavailable
        }
    }

    let output: BriefingAudioOutput
    let env: Environment

    private struct Run {
        let id = UUID()
        let owner: String?
        let generation: UUID
    }

    /// One-shot resume of a suspended wait (segment playback or a pause before the segment started).
    private final class Waiter<T> {
        let token = UUID()
        private var resume: ((T) -> Void)?
        init(_ resume: @escaping (T) -> Void) { self.resume = resume }
        func finish(_ value: T) {
            guard let r = resume else { return }
            resume = nil
            r(value)
        }
    }

    private var run: Run?
    private var task: Task<Void, Never>?
    private var autoplayTask: Task<Void, Never>?
    private var autoplayGeneration = UUID()
    private var segmentWaiter: Waiter<NarrationEnd>?
    private var resumeWaiter: Waiter<Bool>?
    /// Audio of the open report: (briefId, contentVersion) → segment → mp3.
    private var cacheKey: String?
    private var cache: [Int: Data] = [:]
    private var cancellables = Set<AnyCancellable>()

    init(output: BriefingAudioOutput, environment: Environment, observe: Bool = true) {
        self.output = output
        self.env = environment
        guard observe else { return }
        // Posted synchronously after the new session is assigned: the old account's audio stops at once.
        NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.accountChanged() } }
            .store(in: &cancellables)
        NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)
            .sink { [weak self] _ in MainActor.assumeIsolated { self?.appDidEnterBackground() } }
            .store(in: &cancellables)
        BriefingsCenter.shared.$settings
            .dropFirst()
            .sink { [weak self] settings in
                // @Published delivers in willSet: read the new value from the argument.
                DispatchQueue.main.async { self?.consentChanged(settings?.audioConsentEnabled) }
            }
            .store(in: &cancellables)
        if let voice = output as? NeuralVoice {
            voice.$isMuted.dropFirst().removeDuplicates()
                .sink { [weak self] muted in self?.muteChanged(muted) }
                .store(in: &cancellables)
        }
    }

    /// The app's narrator over the Núcleo session's voice.
    static func live(voice: NeuralVoice, stopPageVoice: @escaping () -> Void, micActive: @escaping () -> Bool,
                     analysisBusy: @escaping () -> Bool) -> BriefingNarrator {
        BriefingNarrator(output: voice, environment: .live(stopPageVoice: stopPageVoice, micActive: micActive,
                                                           analysisBusy: analysisBusy))
    }

    // MARK: - Contract

    func play(report: BriefingReport) {
        cancelAutoplay()
        guard canNarrate(report) else { objectWillChange.send(); return }
        // Never interrupt the person talking to Bobby or a running analysis.
        guard !env.micActive(), !env.analysisBusy() else { return }
        start(report)
    }

    /// From a notification tap: only when nothing would surprise the person (sound off, no consent, other
    /// audio). Otherwise the play button waits. Muted means no request at all.
    func autoplay(report: BriefingReport) {
        cancelAutoplay()
        guard run == nil, canNarrate(report), !output.isMuted, env.riskAccepted(),
              !env.otherAudioPlaying(), !env.micActive(), !env.analysisBusy() else { return }
        if let consent = env.audioConsent() {
            if consent { start(report) }
            return
        }
        let owner = env.currentUser(), generation = env.currentGeneration(), autoplayEpoch = autoplayGeneration
        autoplayTask = Task { [weak self] in
            guard let self, !Task.isCancelled, self.autoplayGeneration == autoplayEpoch,
                  owner == self.env.currentUser(), generation == self.env.currentGeneration(),
                  self.canNarrate(report), !self.env.otherAudioPlaying(),
                  !self.env.micActive(), !self.env.analysisBusy() else { return }
            let consent = await self.env.loadAudioConsent()
            guard !Task.isCancelled, self.autoplayGeneration == autoplayEpoch,
                  consent == true, self.run == nil, owner == self.env.currentUser(), generation == self.env.currentGeneration(),
                  self.canNarrate(report), !self.output.isMuted, !self.env.otherAudioPlaying(),
                  !self.env.micActive(), !self.env.analysisBusy() else { return }
            self.autoplayTask = nil
            self.start(report)
        }
    }

    func pause() {
        guard run != nil else { return }
        switch phase {
        case .playing:
            output.pause()
            phase = .paused
        case .preparing:
            // The segment keeps loading; it starts only after resume.
            phase = .paused
        default: break
        }
    }

    func resume() {
        guard run != nil, phase == .paused else { return }
        guard narrationAllowed, !env.micActive() else { end(.idle); return }
        if let waiter = resumeWaiter {
            resumeWaiter = nil
            phase = .preparing
            waiter.finish(true)
        } else if segmentWaiter != nil {
            output.resume()
            phase = .playing
        } else {
            phase = .preparing
        }
    }

    /// Universal cancel: the stop button, the report closing, a lifecycle event. Keeps the report's cache.
    func stop() { end(.idle) }

    // MARK: - Lifecycle signals (wired in init; called directly by tests)

    func appDidEnterBackground() { end(.idle) }

    func accountChanged() {
        end(.idle)
        cacheKey = nil
        cache = [:]
    }

    func muteChanged(_ muted: Bool) {
        if muted { end(.idle) }
        objectWillChange.send()
    }

    /// The account's audio consent changed (nil when settings were cleared, e.g. an account change).
    func consentChanged(_ enabled: Bool?) {
        if enabled == false { end(.idle) }
        objectWillChange.send()
    }

    // MARK: - Idempotency

    /// Stable per (briefId, contentVersion, segment): retries of one segment are one request on the server.
    /// Server format: `^[A-Za-z0-9_-]{8,64}$`.
    nonisolated static func idempotencyKey(briefId: String, contentVersion: Int, segment: Int) -> String {
        let material = "bobby-briefing-voice|v1|\(briefId.lowercased())|\(contentVersion)|\(segment)"
        let digest = SHA256.hash(data: Data(material.utf8)).map { String(format: "%02x", $0) }.joined()
        return "bv1-" + digest.prefix(40)
    }

    // MARK: - Run

    private var narrationAllowed: Bool {
        env.appActive() && !output.isMuted && env.riskAccepted() && env.currentUser() != nil && env.audioConsent() != false
    }

    private func canNarrate(_ report: BriefingReport) -> Bool {
        narrationAllowed && report.voice != nil && !report.narrationSegments.isEmpty && report.contentVersion > 0
    }

    private func start(_ report: BriefingReport) {
        end(.idle)
        let key = "\(report.id)|\(report.contentVersion)"
        if cacheKey != key { cacheKey = key; cache = [:] }
        // The page's line ends (once, `stopped`) before the briefing takes the voice.
        env.stopPageVoice()
        let current = Run(owner: env.currentUser(), generation: env.currentGeneration())
        run = current
        phase = .preparing
        currentSegment = 0
        task = Task { [weak self] in await self?.perform(report, current) }
    }

    /// Cancels the run (if any): pending waits resume as stopped, the voice stops only if this run holds it.
    private func end(_ next: BriefingPlaybackState) {
        cancelAutoplay()
        let hadRun = run != nil
        run = nil
        task?.cancel()
        task = nil
        if let waiter = resumeWaiter {
            resumeWaiter = nil
            waiter.finish(false)
        }
        if let waiter = segmentWaiter {
            segmentWaiter = nil
            output.stop()
            waiter.finish(.stopped)
        }
        if hadRun || phase != next { phase = next }
        currentSegment = nil
    }

    /// Cancel both cooperative work and late answers from an operation that ignores cancellation.
    private func cancelAutoplay() {
        autoplayGeneration = UUID()
        autoplayTask?.cancel()
        autoplayTask = nil
    }

    private func isCurrent(_ r: Run) -> Bool {
        run?.id == r.id && !Task.isCancelled && env.currentUser() == r.owner && env.currentGeneration() == r.generation
    }

    private func perform(_ report: BriefingReport, _ r: Run) async {
        if env.audioConsent() == nil {
            let consent = await env.loadAudioConsent()
            guard isCurrent(r) else { return }
            guard consent == true else { end(.idle); return }
        }
        if report.cadence == .weekly, let name = env.localGivenName()?.trimmingCharacters(in: .whitespacesAndNewlines),
           !name.isEmpty, name.count <= 80 {
            guard isCurrent(r), narrationAllowed, !env.micActive(), !env.analysisBusy() else { end(.idle); return }
            let greeting = L.weeklyGreeting(name: name, language: report.language)
            currentSegment = nil
            phase = .playing
            let outcome = await playGreeting(greeting, language: report.language)
            guard isCurrent(r) else { return }
            switch outcome {
            case .finished: break
            case .stopped: end(.idle); return
            case .failed: end(.failed); return
            }
        }
        for index in report.narrationSegments.indices {
            guard isCurrent(r) else { return }
            currentSegment = index
            if phase != .paused { phase = .preparing }
            let fetched = await segmentAudio(report, index, r)
            guard isCurrent(r) else { return }
            let data: Data
            switch fetched {
            case .audio(let d): data = d
            case .failed: end(.failed); return
            case .notAllowed: end(.idle); return
            }
            if phase == .paused {
                guard await waitForResume(), isCurrent(r) else { return }
            }
            // Re-read at use time: mute, consent, the mic or an analysis may have changed during the fetch.
            guard narrationAllowed, !env.micActive(), !env.analysisBusy() else { end(.idle); return }
            phase = .playing
            let outcome = await playSegment(data)
            guard isCurrent(r) else { return }
            switch outcome {
            case .finished: continue
            case .stopped: end(.idle); return
            case .failed: end(.failed); return
            }
        }
        guard isCurrent(r) else { return }
        run = nil
        task = nil
        currentSegment = nil
        phase = .finished
    }

    private enum Fetched {
        case audio(Data)
        /// Gave up (refused, missing, still not ready within the bounds): the visible failure.
        case failed
        /// Mute, consent or the risk notice changed: stop quietly, no more requests.
        case notAllowed
    }

    /// Re-read before every request (R11 and consent at use time).
    private func mayRequest(_ r: Run) -> Bool { isCurrent(r) && narrationAllowed }

    /// The segment's mp3: the cache, else the voice request and bounded polling of its audio.
    private func segmentAudio(_ report: BriefingReport, _ index: Int, _ r: Run) async -> Fetched {
        if let cached = cache[index] { return .audio(cached) }
        guard let voice = report.voice else { return .failed }
        guard mayRequest(r) else { return .notAllowed }
        let key = Self.idempotencyKey(briefId: report.id, contentVersion: report.contentVersion, segment: index)
        let answer: BriefingVoiceState
        do {
            answer = try await env.requestVoice(report.id, report.contentVersion, index, voice, report.language, key)
        } catch {
            return .failed
        }
        guard answer.state != .failed else { return .failed }
        var waited: TimeInterval = 0
        if answer.state != .ready {
            let delay = answer.retryAfterSeconds ?? Self.defaultRetrySeconds
            guard waited + delay <= Self.maxWaitSeconds else { return .failed }
            guard await backoff(delay, r) else { return .notAllowed }
            waited += delay
        }
        var requests = 0
        while requests < Self.maxAudioRequests {
            guard mayRequest(r) else { return .notAllowed }
            requests += 1
            let audio = await env.audio(answer.audioId)
            switch audio {
            case .ready(let data):
                cache[index] = data
                return .audio(data)
            case .pending(let retryAfter):
                // No wait that could not be followed by another request.
                guard requests < Self.maxAudioRequests, waited + retryAfter <= Self.maxWaitSeconds else { return .failed }
                guard await backoff(retryAfter, r) else { return .notAllowed }
                waited += retryAfter
            case .notFound, .forbidden, .unavailable:
                return .failed
            }
        }
        return .failed
    }

    private func backoff(_ seconds: TimeInterval, _ r: Run) async -> Bool {
        do { try await env.sleep(seconds) } catch { return false }
        return isCurrent(r)
    }

    /// Plays one segment and waits for its own completion (exactly one value, whoever delivers it first).
    private func playSegment(_ data: Data) async -> NarrationEnd {
        await withCheckedContinuation { (continuation: CheckedContinuation<NarrationEnd, Never>) in
            let waiter = Waiter<NarrationEnd> { continuation.resume(returning: $0) }
            segmentWaiter = waiter
            let started = output.playPrepared(data, playbackRate: 1.0) { [weak self] end in
                // A completion of an older segment or run never ends this one.
                guard let self, self.segmentWaiter?.token == waiter.token else { return }
                self.segmentWaiter = nil
                waiter.finish(end)
            }
            if !started {
                if segmentWaiter?.token == waiter.token { segmentWaiter = nil }
                waiter.finish(.failed)
            }
        }
    }

    /// The local greeting uses the same token fencing, pause and stop path as prepared segments.
    private func playGreeting(_ text: String, language: String) async -> NarrationEnd {
        await withCheckedContinuation { (continuation: CheckedContinuation<NarrationEnd, Never>) in
            let waiter = Waiter<NarrationEnd> { continuation.resume(returning: $0) }
            segmentWaiter = waiter
            let started = output.playLocalGreeting(text, language: language) { [weak self] end in
                guard let self, self.segmentWaiter?.token == waiter.token else { return }
                self.segmentWaiter = nil
                waiter.finish(end)
            }
            if !started {
                if segmentWaiter?.token == waiter.token { segmentWaiter = nil }
                waiter.finish(.failed)
            }
        }
    }

    /// Paused before the segment started: wait for resume (true) or a stop (false).
    private func waitForResume() async -> Bool {
        await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            let waiter = Waiter<Bool> { continuation.resume(returning: $0) }
            resumeWaiter = waiter
        }
    }
}
