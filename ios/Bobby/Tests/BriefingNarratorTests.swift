import AVFoundation
import XCTest
@testable import Bobby

/// Records what the narrator asks of the voice; completions are delivered by the test, like NeuralVoice
/// (stop() answers the pending request with `.stopped` once).
@MainActor
private final class RecordingOutput: BriefingAudioOutput {
    var isMuted = false
    var isPaused = false
    var accepts = true
    private(set) var played: [(data: Data, onFinish: (NarrationEnd) -> Void)] = []
    private(set) var greetings: [(text: String, language: String)] = []
    private(set) var stops = 0
    private(set) var pauses = 0
    private(set) var resumes = 0
    private var pending: ((NarrationEnd) -> Void)?

    func playLocalGreeting(_ text: String, language: String, onFinish: @escaping (NarrationEnd) -> Void) -> Bool {
        guard accepts, !isMuted else { return false }
        stop()
        greetings.append((text, language))
        pending = onFinish
        return true
    }

    func playPrepared(_ data: Data, playbackRate: Float, onFinish: @escaping (NarrationEnd) -> Void) -> Bool {
        guard accepts, !isMuted else { return false }
        stop()
        played.append((data, onFinish))
        pending = onFinish
        return true
    }

    func pause() { pauses += 1; isPaused = true }
    func resume() { resumes += 1; isPaused = false }

    func stop() {
        stops += 1
        isPaused = false
        let p = pending
        pending = nil
        p?(.stopped)
    }

    /// The current request ends on its own.
    func finishCurrent(_ end: NarrationEnd) {
        let p = pending
        pending = nil
        p?(end)
    }
}

@MainActor
final class BriefingNarratorTests: XCTestCase {
    static let briefId = "6f1c2b8e-4d3a-4f6b-9a1e-2c3d4e5f6a7b"
    static let otherBrief = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
    static func audioId(_ segment: Int) -> String { "00000000-0000-4000-8000-00000000000\(segment)" }

    private var output: RecordingOutput!
    private var user: String? = "user-a"
    private var generation = UUID()
    private var risk = true
    private var consent: Bool? = true
    private var loadedConsent: Bool? = true
    private var mic = false
    private var busy = false
    private var otherAudio = false
    private var active = true
    private var localName: String?
    private var pageStops = 0
    private var consentLoads = 0
    private var voiceCalls: [(brief: String, version: Int, segment: Int, voice: String, language: String, key: String)] = []
    private var audioCalls: [String] = []
    private var sleeps: [TimeInterval] = []
    /// Per segment: the voice answer (default ready) and the audio answers in order (default ready).
    private var voiceAnswer: (Int) throws -> BriefingVoiceState = { BriefingVoiceState(state: .ready, audioId: BriefingNarratorTests.audioId($0)) }
    private var audioAnswers: [String: [BriefingAudio]] = [:]
    /// Suspends the voice request of a segment until the test resumes it.
    private var voiceGate: [Int: CheckedContinuation<Void, Never>] = [:]
    private var gatedSegments: Set<Int> = []
    /// Deliberately ignores cancellation so late consent responses exercise the lifecycle fence.
    private var gateConsent = false
    private var consentGates: [CheckedContinuation<Bool?, Never>] = []

    override func setUp() async throws {
        output = RecordingOutput()
        user = "user-a"; generation = UUID(); risk = true; consent = true; loadedConsent = true
        mic = false; busy = false; otherAudio = false; active = true; pageStops = 0; consentLoads = 0
        localName = nil
        gateConsent = false; consentGates = []
        voiceCalls = []; audioCalls = []; sleeps = []; audioAnswers = [:]; voiceGate = [:]; gatedSegments = []
        voiceAnswer = { BriefingVoiceState(state: .ready, audioId: BriefingNarratorTests.audioId($0)) }
    }

    private static func clip(_ segment: Int) -> Data { Data("mp3-segment-\(segment)".utf8) }

    private func narrator() -> BriefingNarrator {
        let env = BriefingNarrator.Environment(
            requestVoice: { [unowned self] brief, version, segment, voice, language, key in
                self.voiceCalls.append((brief, version, segment, voice, language, key))
                if self.gatedSegments.contains(segment) {
                    await withCheckedContinuation { self.voiceGate[segment] = $0 }
                }
                return try self.voiceAnswer(segment)
            },
            audio: { [unowned self] id in
                self.audioCalls.append(id)
                if var queue = self.audioAnswers[id], !queue.isEmpty {
                    let next = queue.removeFirst()
                    self.audioAnswers[id] = queue
                    return next
                }
                let segment = Int(String(id.last!))!
                return .ready(Self.clip(segment))
            },
            currentUser: { [unowned self] in self.user },
            currentGeneration: { [unowned self] in self.generation },
            riskAccepted: { [unowned self] in self.risk },
            audioConsent: { [unowned self] in self.consent },
            loadAudioConsent: { [unowned self] in
                self.consentLoads += 1
                let loaded = self.gateConsent
                    ? await withCheckedContinuation { self.consentGates.append($0) }
                    : self.loadedConsent
                self.consent = loaded
                return loaded
            },
            micActive: { [unowned self] in self.mic },
            analysisBusy: { [unowned self] in self.busy },
            otherAudioPlaying: { [unowned self] in self.otherAudio },
            appActive: { [unowned self] in self.active },
            localGivenName: { [unowned self] in self.localName },
            stopPageVoice: { [unowned self] in self.pageStops += 1 },
            sleep: { [unowned self] seconds in self.sleeps.append(seconds); await Task.yield() })
        return BriefingNarrator(output: output, environment: env, observe: false)
    }

    private func report(_ id: String = BriefingNarratorTests.briefId, segments: Int = 3, voice: String? = "ash",
                        version: Int = 2, cadence: String = "morning") -> BriefingReport {
        var json: [String: Any] = ["id": id, "cadence": cadence, "contentVersion": version, "title": "Opening",
                                   "opening": "Good morning", "sections": [], "language": "es",
                                   "narrationSegments": (0..<segments).map { "Segment \($0) text, never sent." }]
        if let voice { json["voice"] = voice }
        return BriefingReport(json: json)!
    }

    private func waitUntil(_ what: String = "condition", timeout: TimeInterval = 2, _ predicate: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !predicate(), Date() < deadline { try await Task.sleep(nanoseconds: 5_000_000) }
        XCTAssertTrue(predicate(), "Timed out waiting for \(what)")
    }

    /// Lets queued main-actor work run (a negative check: nothing more should happen).
    private func settle() async throws { try await Task.sleep(nanoseconds: 60_000_000) }

    // MARK: - Order and completions

    func testWeeklyGreetingUsesOnlyDeviceAndPrecedesProviderAudio() async throws {
        localName = "Ana"
        let n = narrator()
        n.play(report: report(segments: 1, cadence: "weekly"))
        try await waitUntil("local greeting") { self.output.greetings.count == 1 }
        XCTAssertEqual(output.greetings.first?.text, "Hola, Ana. Este es tu resumen semanal.")
        XCTAssertEqual(output.greetings.first?.language, "es")
        XCTAssertTrue(voiceCalls.isEmpty, "The local name never reaches the voice API request")
        XCTAssertTrue(audioCalls.isEmpty)
        output.finishCurrent(.finished)
        try await waitUntil("prepared segment after greeting") { self.output.played.count == 1 }
        XCTAssertEqual(voiceCalls.count, 1)
        XCTAssertEqual(voiceCalls.first?.segment, 0)
        output.finishCurrent(.finished)
        try await waitUntil("finished") { n.phase == .finished }
    }

    func testWeeklyGreetingStopsOnAccountChangeAndDoesNotRequestAudio() async throws {
        localName = "Ana"
        let n = narrator()
        n.autoplay(report: report(segments: 1, cadence: "weekly"))
        try await waitUntil("local greeting") { self.output.greetings.count == 1 }
        generation = UUID()
        n.accountChanged()
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(audioCalls.isEmpty)
        XCTAssertEqual(n.phase, .idle)
    }

    func testUnknownAudioConsentNeverStartsLocalGreeting() async throws {
        localName = "Ana"
        consent = nil
        loadedConsent = nil
        let n = narrator()
        n.play(report: report(segments: 1, cadence: "weekly"))
        try await waitUntil("consent load") { self.consentLoads == 1 }
        try await settle()
        XCTAssertTrue(output.greetings.isEmpty)
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertEqual(n.phase, .idle)
    }

    func testSegmentsPlayInOrderAndAdvanceOnlyOnFinished() async throws {
        let n = narrator()
        XCTAssertEqual(n.state, .idle)
        n.play(report: report())
        XCTAssertEqual(pageStops, 1, "Page narration stops before a briefing takes the voice")
        try await waitUntil("segment 0") { output.played.count == 1 }
        XCTAssertEqual(output.played[0].data, Self.clip(0))
        XCTAssertEqual(n.state, .playing)
        XCTAssertEqual(n.currentSegment, 0)
        try await settle()
        XCTAssertEqual(output.played.count, 1, "Nothing advances while the segment plays")

        output.finishCurrent(.finished)
        try await waitUntil("segment 1") { output.played.count == 2 }
        XCTAssertEqual(output.played[1].data, Self.clip(1))
        XCTAssertEqual(n.currentSegment, 1)
        output.finishCurrent(.finished)
        try await waitUntil("segment 2") { output.played.count == 3 }
        XCTAssertEqual(output.played[2].data, Self.clip(2))
        output.finishCurrent(.finished)
        try await waitUntil("finished") { n.state == .finished }
        XCTAssertNil(n.currentSegment)

        // Only ids leave the phone: the report's frozen voice/language, never the text.
        XCTAssertEqual(voiceCalls.map(\.segment), [0, 1, 2])
        for call in voiceCalls {
            XCTAssertEqual(call.brief, Self.briefId)
            XCTAssertEqual(call.version, 2)
            XCTAssertEqual(call.voice, "ash")
            XCTAssertEqual(call.language, "es")
        }
        XCTAssertEqual(audioCalls, [Self.audioId(0), Self.audioId(1), Self.audioId(2)])
    }

    func testLateCompletionOfAnEarlierSegmentCannotAdvanceTheNext() async throws {
        let n = narrator()
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        output.finishCurrent(.finished)
        try await waitUntil { output.played.count == 2 }
        // Segment 0's completion fires again (late / duplicated): segment 1 keeps playing.
        output.played[0].onFinish(.finished)
        output.played[0].onFinish(.finished)
        try await settle()
        XCTAssertEqual(output.played.count, 2)
        XCTAssertEqual(n.currentSegment, 1)
        XCTAssertEqual(n.state, .playing)

        // A completion from an older run cannot touch a new run either.
        let oldRun = output.played[1].onFinish
        n.stop()
        n.play(report: report())
        try await waitUntil { output.played.count == 3 }
        oldRun(.finished)
        try await settle()
        XCTAssertEqual(output.played.count, 3)
        XCTAssertEqual(n.currentSegment, 0)
    }

    func testStoppedAndFailedNeverAdvance() async throws {
        let n = narrator()
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        output.finishCurrent(.failed)
        try await waitUntil { n.state == .failed }
        try await settle()
        XCTAssertEqual(output.played.count, 1)
        XCTAssertNil(n.currentSegment)

        n.play(report: report())
        try await waitUntil { output.played.count == 2 }
        // Something else stopped the voice (a page line, the mic): the queue ends, it does not advance.
        output.finishCurrent(.stopped)
        try await waitUntil { n.state == .idle }
        try await settle()
        XCTAssertEqual(output.played.count, 2)
    }

    func testVoiceFailureEndsInTheVisibleFailedStateWithoutPlaying() async throws {
        voiceAnswer = { _ in throw BriefingsError.unavailable }
        let n = narrator()
        n.play(report: report())
        try await waitUntil { n.state == .failed }
        XCTAssertTrue(output.played.isEmpty)
        XCTAssertTrue(audioCalls.isEmpty)
        // Muting afterwards does not hide the failure line: the text is still the briefing.
        XCTAssertEqual(n.state, .failed)

        // A player that cannot decode the audio fails the same way.
        voiceAnswer = { BriefingVoiceState(state: .ready, audioId: BriefingNarratorTests.audioId($0)) }
        output.accepts = false
        n.play(report: report())
        try await waitUntil { n.state == .failed && voiceCalls.count == 2 }
        XCTAssertTrue(output.played.isEmpty)
    }

    func testMissingAudioOrForbiddenAudioFails() async throws {
        audioAnswers[Self.audioId(0)] = [.forbidden]
        let n = narrator()
        n.play(report: report())
        try await waitUntil { n.state == .failed }
        XCTAssertTrue(output.played.isEmpty)
    }

    // MARK: - Polling

    func testPendingAudioIsPolledWithinBoundsThenFails() async throws {
        voiceAnswer = { BriefingVoiceState(state: .processing, audioId: BriefingNarratorTests.audioId($0), retryAfterSeconds: 3) }
        audioAnswers[Self.audioId(0)] = Array(repeating: .pending(retryAfter: 5), count: 20)
        let n = narrator()
        n.play(report: report())
        try await waitUntil { n.state == .failed }
        XCTAssertLessThanOrEqual(audioCalls.count, BriefingNarrator.maxAudioRequests)
        XCTAssertLessThanOrEqual(sleeps.reduce(0, +), BriefingNarrator.maxWaitSeconds)
        XCTAssertEqual(sleeps.first, 3, "The voice answer's retryAfterSeconds is honored before the first poll")
        XCTAssertTrue(output.played.isEmpty)
        XCTAssertEqual(voiceCalls.count, 1, "Polling reads the audio; it never re-posts the voice request")

        // Short waits are bounded by the request count instead.
        sleeps = []; audioCalls = []
        audioAnswers[Self.audioId(0)] = Array(repeating: .pending(retryAfter: 1), count: 20)
        n.play(report: report())
        try await waitUntil { n.state == .failed && audioCalls.count > 0 }
        try await settle()
        XCTAssertEqual(audioCalls.count, BriefingNarrator.maxAudioRequests)
    }

    func testPendingAudioThatBecomesReadyPlays() async throws {
        voiceAnswer = { BriefingVoiceState(state: .queued, audioId: BriefingNarratorTests.audioId($0)) }
        audioAnswers[Self.audioId(0)] = [.pending(retryAfter: 2), .pending(retryAfter: 2)]
        let n = narrator()
        n.play(report: report(segments: 1))
        try await waitUntil { output.played.count == 1 }
        XCTAssertEqual(audioCalls.count, 3)
        XCTAssertEqual(sleeps, [BriefingNarrator.defaultRetrySeconds, 2, 2])
    }

    // MARK: - Pause / resume

    func testPauseAndResumeKeepTheSegmentAndDoNotEndIt() async throws {
        let n = narrator()
        n.play(report: report(segments: 2))
        try await waitUntil { output.played.count == 1 }
        n.pause()
        XCTAssertEqual(n.state, .paused)
        XCTAssertEqual(output.pauses, 1)
        XCTAssertEqual(output.stops, 1, "Only the stop inside playPrepared: a pause is not a stop")
        try await settle()
        XCTAssertEqual(n.state, .paused)
        XCTAssertEqual(n.currentSegment, 0)
        n.resume()
        XCTAssertEqual(n.state, .playing)
        XCTAssertEqual(output.resumes, 1)
        XCTAssertEqual(output.played.count, 1, "Resume continues the same request; it does not replay")
        output.finishCurrent(.finished)
        try await waitUntil { output.played.count == 2 }
    }

    func testPauseWhilePreparingHoldsTheSegmentUntilResume() async throws {
        gatedSegments = [0]
        let n = narrator()
        n.play(report: report(segments: 1))
        try await waitUntil { voiceGate[0] != nil }
        n.pause()
        XCTAssertEqual(n.state, .paused)
        voiceGate.removeValue(forKey: 0)?.resume()
        try await waitUntil { audioCalls.count == 1 }
        try await settle()
        XCTAssertTrue(output.played.isEmpty, "Paused before it started: the loaded segment waits")
        XCTAssertEqual(n.state, .paused)
        n.resume()
        try await waitUntil { output.played.count == 1 }
        XCTAssertEqual(n.state, .playing)
    }

    // MARK: - Stop conditions

    func testBackgroundStopsTheNarration() async throws {
        let n = narrator()
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        let stops = output.stops
        n.appDidEnterBackground()
        XCTAssertEqual(output.stops, stops + 1)
        XCTAssertEqual(n.state, .idle)
        XCTAssertNil(n.currentSegment)
        try await settle()
        XCTAssertEqual(output.played.count, 1)
    }

    func testBackgroundNotificationIsObserved() async throws {
        let env = narrator().env
        let n = BriefingNarrator(output: output, environment: env, observe: true)
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        NotificationCenter.default.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        XCTAssertEqual(n.state, .idle)
    }

    func testAccountSwitchStopsDropsLateAnswersAndClearsTheCache() async throws {
        let n = narrator()
        n.play(report: report(segments: 1))
        try await waitUntil { output.played.count == 1 }
        output.finishCurrent(.finished)
        try await waitUntil { n.state == .finished }

        // Replay of the same report uses the in-memory cache.
        n.play(report: report(segments: 1))
        try await waitUntil { output.played.count == 2 }
        XCTAssertEqual(voiceCalls.count, 1)
        XCTAssertEqual(audioCalls.count, 1)
        output.finishCurrent(.finished)
        try await waitUntil { n.state == .finished }

        // A late answer of account A never plays for account B.
        gatedSegments = [0]
        n.accountChanged()
        n.play(report: report(segments: 1))
        try await waitUntil { voiceGate[0] != nil }
        XCTAssertEqual(voiceCalls.count, 2, "The cache went with the account change")
        user = "user-b"; generation = UUID()
        voiceGate.removeValue(forKey: 0)?.resume()
        try await settle()
        XCTAssertEqual(output.played.count, 2)
        XCTAssertEqual(audioCalls.count, 1)

        // Switching while playing stops the voice at once.
        gatedSegments = []
        n.play(report: report(segments: 1))
        try await waitUntil { output.played.count == 3 }
        let stops = output.stops
        n.accountChanged()
        XCTAssertEqual(output.stops, stops + 1)
        XCTAssertEqual(n.state, .idle)
    }

    func testMuteStopsAndHidesTheBar() async throws {
        let n = narrator()
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        let stops = output.stops
        output.isMuted = true
        n.muteChanged(true)
        XCTAssertEqual(output.stops, stops + 1)
        XCTAssertEqual(n.state, .unavailable)
        // Muted: play does nothing at all.
        n.play(report: report())
        try await settle()
        XCTAssertEqual(voiceCalls.count, 1)
        output.isMuted = false
        n.muteChanged(false)
        XCTAssertEqual(n.state, .idle)
    }

    func testConsentWithdrawalStops() async throws {
        let n = narrator()
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        consent = false
        n.consentChanged(false)
        XCTAssertEqual(n.state, .unavailable)
        try await settle()
        XCTAssertEqual(output.played.count, 1)

        // The risk notice withdrawn while a segment loads: it is never played.
        consent = true
        gatedSegments = [0]
        n.accountChanged()
        n.play(report: report())
        try await waitUntil { voiceGate[0] != nil }
        risk = false
        voiceGate.removeValue(forKey: 0)?.resume()
        try await waitUntil { n.state == .unavailable }
        XCTAssertEqual(output.played.count, 1)
        XCTAssertEqual(audioCalls.count, 1, "No request after the risk notice was withdrawn (R11)")
    }

    func testMicOrAnalysisRefusesToStartAndMicDuringLoadingStops() async throws {
        let n = narrator()
        mic = true
        n.play(report: report())
        busy = true; mic = false
        n.play(report: report())
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertEqual(pageStops, 0, "A refused start interrupts nothing")
        XCTAssertEqual(n.state, .idle)

        busy = false
        gatedSegments = [0]
        n.play(report: report())
        try await waitUntil { voiceGate[0] != nil }
        mic = true
        voiceGate.removeValue(forKey: 0)?.resume()
        try await waitUntil { n.state == .idle }
        XCTAssertTrue(output.played.isEmpty)
    }

    func testANewPlayReplacesTheRun() async throws {
        let n = narrator()
        n.play(report: report())
        try await waitUntil { output.played.count == 1 }
        output.finishCurrent(.finished)
        try await waitUntil { output.played.count == 2 }
        n.play(report: report(Self.otherBrief, segments: 1))
        try await waitUntil { output.played.count == 3 }
        XCTAssertEqual(n.currentSegment, 0)
        XCTAssertEqual(voiceCalls.last?.brief, Self.otherBrief)
    }

    // MARK: - Idempotency

    func testIdempotencyKeyIsStablePerSegmentAndAcrossRetries() async throws {
        let k = BriefingNarrator.idempotencyKey(briefId: Self.briefId, contentVersion: 2, segment: 0)
        XCTAssertEqual(k, BriefingNarrator.idempotencyKey(briefId: Self.briefId.uppercased(), contentVersion: 2, segment: 0))
        XCTAssertNotEqual(k, BriefingNarrator.idempotencyKey(briefId: Self.briefId, contentVersion: 2, segment: 1))
        XCTAssertNotEqual(k, BriefingNarrator.idempotencyKey(briefId: Self.briefId, contentVersion: 3, segment: 0))
        XCTAssertNotNil(k.range(of: #"^[A-Za-z0-9_-]{8,64}$"#, options: .regularExpression), "Server format")
        XCTAssertFalse(k.contains("Segment"))

        // A failed segment retried by the person is the same request on the server.
        voiceAnswer = { _ in throw BriefingsError.unavailable }
        let n = narrator()
        n.play(report: report())
        try await waitUntil { n.state == .failed }
        n.play(report: report())
        try await waitUntil { voiceCalls.count == 2 && n.state == .failed }
        XCTAssertEqual(voiceCalls[0].key, k)
        XCTAssertEqual(voiceCalls[1].key, k)
    }

    // MARK: - Autoplay

    func testAutoplayNeverRequestsWhenMutedOrOtherAudioOrNoConsent() async throws {
        let n = narrator()
        output.isMuted = true
        n.autoplay(report: report())
        output.isMuted = false
        otherAudio = true
        n.autoplay(report: report())
        otherAudio = false
        consent = false
        n.autoplay(report: report())
        consent = true
        risk = false
        n.autoplay(report: report())
        risk = true
        mic = true
        n.autoplay(report: report())
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertEqual(consentLoads, 0)
        XCTAssertEqual(pageStops, 0)
        XCTAssertTrue(output.played.isEmpty)
    }

    func testAutoplayStartsWithConsentAndLoadsUnknownConsentFirst() async throws {
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { output.played.count == 1 }
        XCTAssertEqual(consentLoads, 0)
        output.finishCurrent(.finished)
        try await waitUntil { n.state == .finished }

        let fresh = narrator()
        consent = nil; loadedConsent = false
        fresh.autoplay(report: report(segments: 1))
        try await waitUntil { consentLoads == 1 }
        try await settle()
        XCTAssertEqual(voiceCalls.count, 1, "No audio consent on the account: the button waits")

        consent = nil; loadedConsent = true
        fresh.autoplay(report: report(segments: 1))
        try await waitUntil { output.played.count == 2 }
        XCTAssertEqual(consentLoads, 2)
    }

    func testStopBeforeAutoplayConsentStartsMakesNoRequests() async throws {
        consent = nil
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        n.stop()
        try await settle()
        XCTAssertEqual(consentLoads, 0)
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(output.played.isEmpty)
    }

    func testClosingReportRejectsLateAutoplayConsent() async throws {
        consent = nil; gateConsent = true
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { consentGates.count == 1 }
        n.stop() // BriefingReportView.onDisappear uses this same cancellation.
        consentGates[0].resume(returning: true)
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(audioCalls.isEmpty)
        XCTAssertTrue(output.played.isEmpty)
        XCTAssertEqual(pageStops, 0)
    }

    func testAutoplayScheduledBeforeAnAccountEpochChangeNeverLoadsConsent() async throws {
        consent = nil
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        generation = UUID() // Even signing back into the same account creates a new epoch.
        try await settle()
        XCTAssertEqual(consentLoads, 0)
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(output.played.isEmpty)
    }

    func testLateConsentCannotStartAudioWhileTheAppIsInactive() async throws {
        consent = nil; gateConsent = true
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { consentGates.count == 1 }
        active = false // The request can return before the lifecycle notification is delivered.
        consentGates[0].resume(returning: true)
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(output.played.isEmpty)
        active = true
        n.stop()
    }

    func testBackgroundRejectsLateAutoplayEvenAfterReturningToForeground() async throws {
        consent = nil; gateConsent = true
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { consentGates.count == 1 }
        active = false
        n.appDidEnterBackground()
        active = true
        consentGates[0].resume(returning: true)
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(audioCalls.isEmpty)
        XCTAssertTrue(output.played.isEmpty)
    }

    func testAutoplayCannotStartForAReportLoadedInBackground() async throws {
        active = false; consent = nil
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await settle()
        XCTAssertEqual(consentLoads, 0)
        XCTAssertTrue(voiceCalls.isEmpty)
        active = true
        try await settle()
        XCTAssertTrue(output.played.isEmpty, "Returning to the foreground does not replay a consumed tap")
    }

    func testAccountSwitchRejectsLateAutoplayForThePreviousAccount() async throws {
        consent = nil; gateConsent = true
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { consentGates.count == 1 }
        user = "user-b"; generation = UUID()
        n.accountChanged()
        consentGates[0].resume(returning: true)
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty)
        XCTAssertTrue(audioCalls.isEmpty)
        XCTAssertTrue(output.played.isEmpty)
    }

    func testNewAutoplaySupersedesAConsentResponseFromThePreviousReport() async throws {
        consent = nil; gateConsent = true
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { consentGates.count == 1 }
        n.autoplay(report: report(Self.otherBrief, segments: 1))
        try await waitUntil { consentGates.count == 2 }
        consentGates[0].resume(returning: true)
        try await settle()
        XCTAssertTrue(voiceCalls.isEmpty, "The replaced report must not take the voice")
        consentGates[1].resume(returning: true)
        try await waitUntil { output.played.count == 1 }
        XCTAssertEqual(voiceCalls.map(\.brief), [Self.otherBrief])
        n.stop()
    }

    func testManualPlaySupersedesPendingAutoplay() async throws {
        consent = nil; gateConsent = true
        let n = narrator()
        n.autoplay(report: report(segments: 1))
        try await waitUntil { consentGates.count == 1 }
        consent = true
        n.play(report: report(Self.otherBrief, segments: 1))
        try await waitUntil { output.played.count == 1 }
        consentGates[0].resume(returning: true)
        try await settle()
        XCTAssertEqual(voiceCalls.map(\.brief), [Self.otherBrief])
        XCTAssertEqual(output.played.count, 1)
        n.stop()
    }

    func testNoVoiceOrNoSegmentsHidesTheBar() {
        let n = narrator()
        n.play(report: report(voice: nil))
        XCTAssertTrue(voiceCalls.isEmpty)
        n.play(report: report(segments: 0))
        XCTAssertTrue(voiceCalls.isEmpty)
        user = nil
        XCTAssertEqual(n.state, .unavailable)
    }
}

/// NeuralVoice's prepared playback with real MP3 decoding (the bundled select-orb-es clip); no network.
@MainActor
final class NeuralVoicePreparedTests: XCTestCase {
    private var defaults: UserDefaults!
    private var suite: String!
    private var session: URLSession!

    override func setUp() {
        super.setUp()
        suite = "neural-prepared-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite)!
        defaults.set(RiskNotice.currentVersion, forKey: "agent.riskNoticeVersion")
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [RefusingProtocol.self]
        session = URLSession(configuration: config)
    }

    override func tearDown() {
        session.invalidateAndCancel()
        defaults.removePersistentDomain(forName: suite)
        super.tearDown()
    }

    private final class RefusingProtocol: URLProtocol {
        override class func canInit(with request: URLRequest) -> Bool { true }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            XCTFail("Prepared playback must not make a network request")
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
        }
        override func stopLoading() {}
    }

    private func clip() throws -> Data {
        let url = try XCTUnwrap(Bundle.main.url(forResource: "select-orb-es", withExtension: "mp3"))
        return try Data(contentsOf: url)
    }

    private func waitUntil(timeout: TimeInterval = 5, _ predicate: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !predicate(), Date() < deadline { try await Task.sleep(nanoseconds: 20_000_000) }
        XCTAssertTrue(predicate(), "Audio did not reach the expected state")
    }

    func testStopDeliversStoppedExactlyOnce() async throws {
        let voice = NeuralVoice(session: session, defaults: defaults)
        var ends: [NarrationEnd] = []
        XCTAssertTrue(voice.playPrepared(try clip()) { ends.append($0) })
        try await waitUntil { voice.speaking }
        voice.stop()
        voice.stop()
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(ends, [.stopped])
        XCTAssertFalse(voice.speaking)
        XCTAssertFalse(voice.isPaused)
    }

    func testANewRequestStopsTheOlderOneAndItsLateEndIsNotDeliveredTwice() async throws {
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        var first: [NarrationEnd] = [], second: [NarrationEnd] = []
        XCTAssertTrue(voice.playPrepared(try clip()) { first.append($0) })
        XCTAssertTrue(voice.playPrepared(try clip()) { second.append($0) })
        XCTAssertEqual(first, [.stopped])
        XCTAssertTrue(second.isEmpty)
        // Page narration (speak/speakClip) and mute are stop() too.
        voice.isMuted = true
        XCTAssertEqual(second, [.stopped])
        XCTAssertEqual(first, [.stopped])
    }

    func testRefusedWhenMutedOrWithoutConsentAndNeverCallsBack() throws {
        let voice = NeuralVoice(session: session, defaults: defaults)
        var ends: [NarrationEnd] = []
        voice.isMuted = true
        XCTAssertFalse(voice.playPrepared(try clip()) { ends.append($0) })
        voice.isMuted = false
        defaults.set(0, forKey: "agent.riskNoticeVersion")
        XCTAssertFalse(voice.playPrepared(try clip()) { ends.append($0) })
        XCTAssertFalse(voice.playPrepared(Data("not audio".utf8)) { ends.append($0) })
        defaults.set(RiskNotice.currentVersion, forKey: "agent.riskNoticeVersion")
        XCTAssertFalse(voice.playPrepared(Data("not audio".utf8)) { ends.append($0) })
        XCTAssertTrue(ends.isEmpty)
        XCTAssertFalse(voice.speaking)
    }

    func testPauseKeepsPositionAndResumeFinishesOnce() async throws {
        let data = try clip()
        let duration = try AVAudioPlayer(data: data).duration
        let voice = NeuralVoice(session: session, defaults: defaults)
        defer { voice.stop() }
        var ends: [NarrationEnd] = []
        XCTAssertTrue(voice.playPrepared(data) { ends.append($0) })
        try await waitUntil { (voice.playback?.time ?? 0) > 0.3 }
        voice.pause()
        XCTAssertTrue(voice.isPaused)
        XCTAssertTrue(voice.speaking, "A pause is not an end: page narration reads ends from speaking edges")
        XCTAssertEqual(voice.level, 0)
        let held = try XCTUnwrap(voice.playback?.time)
        try await Task.sleep(nanoseconds: 600_000_000)
        XCTAssertEqual(try XCTUnwrap(voice.playback?.time), held, accuracy: 0.01)
        XCTAssertTrue(ends.isEmpty)

        voice.resume()
        XCTAssertFalse(voice.isPaused)
        try await waitUntil { (voice.playback?.time ?? 0) > held + 0.1 }
        try await waitUntil(timeout: duration + 2) { !ends.isEmpty }
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(ends, [.finished])
        XCTAssertFalse(voice.speaking)
        voice.stop()
        XCTAssertEqual(ends, [.finished], "stop() after the end delivers nothing more")
    }

    func testMuteWhilePausedStopsOnce() async throws {
        let voice = NeuralVoice(session: session, defaults: defaults)
        var ends: [NarrationEnd] = []
        XCTAssertTrue(voice.playPrepared(try clip()) { ends.append($0) })
        try await waitUntil { voice.speaking }
        voice.pause()
        voice.isMuted = true
        voice.resume()
        XCTAssertEqual(ends, [.stopped])
        XCTAssertFalse(voice.speaking)
        XCTAssertFalse(voice.isPaused)
    }
}
