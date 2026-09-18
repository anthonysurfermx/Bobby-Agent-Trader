// Native WebRTC audio. Bobby owns the call and shared account quota server-side.
// No provider credential enters the app.
import Foundation
import AVFoundation
import Combine
import WebRTC

@MainActor
final class RealtimeVoice: ObservableObject {
    enum State { case idle, connecting, listening, thinking, speaking }
    @Published private(set) var state: State = .idle
    @Published private(set) var level: CGFloat = 0
    @Published private(set) var muted = true
    @Published private(set) var caption = ""
    @Published private(set) var error: String?
    @Published private(set) var needsSignIn = false
    @Published private(set) var remainingSeconds = 180
    var active: Bool { state != .idle }
    var speaking: Bool { state == .speaking }
    var listening: Bool { active && !muted && state != .connecting }
    var onTranscript: ((Bool, String) -> Void)?
    var onFallback: (() -> Void)?
    var onEvidence: ((String, [String: Any]) -> Void)?
    var onChart: ((String, String) -> Void)?
    private static let sharedFactory: RTCPeerConnectionFactory = {
        RTCInitializeSSL()
        return RTCPeerConnectionFactory()
    }()
    private let factory = RealtimeVoice.sharedFactory
    private var peer: RTCPeerConnection?
    private var channel: RTCDataChannel?
    private var microphone: RTCAudioTrack?
    private var delegate: VoiceRTCDelegate?
    private var lease: (id: String, accessToken: String)?
    private var connectTask: Task<Void, Never>?
    private var meterTask: Task<Void, Never>?
    private var watchdogTask: Task<Void, Never>?
    private var timeoutTask: Task<Void, Never>?
    private var toolTasks: [String: Task<Void, Never>] = [:]
    private var dispatched = Set<String>()
    private var callNames: [String: String] = [:]
    private var generation = UUID()
    private var audioObservers = Set<AnyCancellable>()
    private var responseActive = false
    private var responseOwed = false
    private var instructions = ""
    private var symbol = "BTC"
    private var timeframe = "1H"
    private var evidenceCache: [String: (Date, [String: Any])] = [:]

    init() {
        NotificationCenter.default.publisher(for: AVAudioSession.interruptionNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in self?.stop() }
            .store(in: &audioObservers)
    }

    static func screen(symbol: String, timeframe: String) -> (String, String) {
        let ticker = symbol.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let valid = ticker.range(of: "^[A-Z0-9][A-Z0-9.-]{0,14}$", options: .regularExpression) != nil
        return (valid ? ticker : "BTC", ["5m", "15m", "1H", "4H", "1D"].contains(timeframe) ? timeframe : "1H")
    }

    static func duration(_ value: Any?) -> Int {
        guard let seconds = value as? NSNumber, seconds.doubleValue.isFinite else { return 0 }
        return max(0, min(180, Int(max(0, min(180, seconds.doubleValue)).rounded(.down))))
    }

    func start(symbol: String, timeframe: String, voice: String?) {
        guard !active else { return }
        (self.symbol, self.timeframe) = Self.screen(symbol: symbol, timeframe: timeframe)
        generation = UUID()
        let token = generation
        state = .connecting; error = nil; caption = ""; needsSignIn = false
        connectTask = Task { [weak self] in
            guard let self else { return }
            do {
                guard let accessToken = await AccountSession.shared.accessToken() else { throw VoiceError.signIn }
                guard self.generation == token else { return }
                let granted = await AVAudioApplication.requestRecordPermission()
                guard self.generation == token else { return }
                guard granted else { throw VoiceError.microphone }
                self.armWatchdog()
                try self.configureAudio()
                let config = RTCConfiguration()
                config.sdpSemantics = .unifiedPlan
                let delegate = VoiceRTCDelegate()
                delegate.event = { [weak self] data in
                    Task { @MainActor [weak self] in
                        guard let self, self.generation == token,
                              let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
                        self.handle(event)
                    }
                }
                delegate.opened = { [weak self] in
                    Task { @MainActor [weak self] in
                        guard let self, self.generation == token else { return }
                        self.watchdogTask?.cancel(); self.watchdogTask = nil
                        self.state = .listening; self.muted = false; self.microphone?.isEnabled = true
                        self.updateScreen(symbol: self.symbol, timeframe: self.timeframe)
                        self.startMeter(token: token)
                    }
                }
                delegate.closed = { [weak self] in
                    Task { @MainActor [weak self] in
                        guard let self, self.generation == token else { return }
                        self.fail(self.remainingSeconds <= 1 ? .dailyLimit : .connection)
                    }
                }
                self.delegate = delegate
                let constraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
                guard let pc = self.factory.peerConnection(with: config, constraints: constraints, delegate: delegate) else { throw VoiceError.connection }
                self.peer = pc
                let track = self.factory.audioTrack(with: self.factory.audioSource(with: constraints), trackId: "bobby-mic")
                self.microphone = track
                pc.add(track, streamIds: ["bobby"])
                guard let channel = pc.dataChannel(forLabel: "oai-events", configuration: RTCDataChannelConfiguration()) else { throw VoiceError.connection }
                self.channel = channel; channel.delegate = delegate
                let offer: RTCSessionDescription = try await withCheckedThrowingContinuation { continuation in
                    pc.offer(for: RTCMediaConstraints(mandatoryConstraints: ["OfferToReceiveAudio": "true"], optionalConstraints: nil)) { offer, error in
                        if let offer { continuation.resume(returning: offer) }
                        else { continuation.resume(throwing: error ?? VoiceError.connection) }
                    }
                }
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    pc.setLocalDescription(offer) { error in
                        if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                    }
                }
                guard self.generation == token else { return }
                var body: [String: Any] = ["sdp": offer.sdp, "lang": L.ttsLang, "autoLanguage": true,
                                          "symbol": self.symbol, "timeframe": self.timeframe]
                if let voice { body["voice"] = voice }
                let (session, status) = try await Self.sessionRequest(body, accessToken: accessToken)
                if let id = session["lease_id"] as? String {
                    guard self.generation == token else { Self.closeLease(id, accessToken: accessToken); return }
                    self.lease = (id, accessToken)
                }
                guard self.generation == token else { return }
                guard status == 200, let sdp = session["sdp"] as? String else {
                    if status == 401 { throw VoiceError.signIn }
                    switch session["error"] as? String {
                    case "voice_daily_limit": throw VoiceError.dailyLimit
                    case "voice_busy": throw VoiceError.busy
                    case "voice_update_required": throw VoiceError.update
                    default: throw VoiceError.connection
                    }
                }
                self.instructions = session["instructions"] as? String ?? ""
                self.remainingSeconds = Self.duration(session["max_duration_seconds"])
                let deadline = Date().addingTimeInterval(Double(self.remainingSeconds))
                self.timeoutTask = Task { [weak self] in
                    while let self, self.generation == token, !Task.isCancelled {
                        self.remainingSeconds = max(0, Int(ceil(deadline.timeIntervalSinceNow)))
                        if self.remainingSeconds == 0 { self.fail(.dailyLimit); return }
                        try? await Task.sleep(for: .seconds(1))
                    }
                }
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    pc.setRemoteDescription(RTCSessionDescription(type: .answer, sdp: sdp)) { error in
                        if let error { continuation.resume(throwing: error) } else { continuation.resume() }
                    }
                }
            } catch {
                guard self.generation == token else { return }
                self.fail((error as? VoiceError) ?? .connection)
            }
        }
    }

    private func startMeter(token: UUID) {
        meterTask?.cancel()
        meterTask = Task { [weak self] in
            while let self, self.generation == token, !Task.isCancelled {
                self.peer?.statistics { [weak self] report in
                    Task { @MainActor [weak self] in
                        guard let self, self.generation == token else { return }
                        let kind = self.speaking ? "inbound-rtp" : "media-source"
                        let levels = report.statistics.values.filter { $0.type == kind }
                            .compactMap { ($0.values["audioLevel"] as? NSNumber)?.doubleValue }
                        self.level = self.speaking || self.listening ? CGFloat(min(1, (levels.max() ?? 0) * 3)) : 0
                    }
                }
                try? await Task.sleep(for: .milliseconds(150))
            }
        }
    }

    private func configureAudio() throws {
        let audio = RTCAudioSession.sharedInstance()
        audio.lockForConfiguration()
        defer { audio.unlockForConfiguration() }
        let config = RTCAudioSessionConfiguration.webRTC()
        config.categoryOptions = [.defaultToSpeaker, .allowBluetooth]
        try audio.setConfiguration(config, active: true)
    }

    private static func sessionRequest(_ body: [String: Any], accessToken: String) async throws -> ([String: Any], Int) {
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/realtime-session"))
        request.httpMethod = "POST"; request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return ((try JSONSerialization.jsonObject(with: data) as? [String: Any]) ?? [:], (response as? HTTPURLResponse)?.statusCode ?? 0)
    }
    private static func closeLease(_ id: String, accessToken: String) {
        Task { _ = try? await sessionRequest(["action": "stop", "lease_id": id], accessToken: accessToken) }
    }
    func dismissError() { error = nil }

    func stop() {
        generation = UUID()
        // Let a pending setup response finish so its lease can be released.
        connectTask = nil
        watchdogTask?.cancel(); watchdogTask = nil
        timeoutTask?.cancel(); timeoutTask = nil
        meterTask?.cancel(); meterTask = nil
        toolTasks.values.forEach { $0.cancel() }; toolTasks.removeAll()
        if let lease { Self.closeLease(lease.id, accessToken: lease.accessToken) }
        lease = nil
        channel?.delegate = nil; channel?.close(); channel = nil
        peer?.delegate = nil; peer?.close(); peer = nil
        microphone = nil; delegate = nil
        let audio = RTCAudioSession.sharedInstance()
        audio.lockForConfiguration()
        try? audio.setActive(false)
        audio.unlockForConfiguration()
        instructions = ""
        dispatched.removeAll(); callNames.removeAll(); evidenceCache.removeAll()
        responseActive = false; responseOwed = false
        state = .idle; muted = true; level = 0
    }
    private func armWatchdog() {
        watchdogTask?.cancel()
        let token = generation
        watchdogTask = Task { [weak self] in
            do { try await Task.sleep(for: .seconds(45)) } catch { return }
            guard let self, self.generation == token else { return }
            self.fail(.connection)
        }
    }

    func toggleMicrophone() {
        guard active, state != .connecting else { return }
        if !muted { muted = true; microphone?.isEnabled = false; return }
        if responseActive { send(["type": "response.cancel"]) }
        send(["type": "output_audio_buffer.clear"])
        send(["type": "input_audio_buffer.clear"])
        muted = false; microphone?.isEnabled = true; level = 0; state = .listening
    }
    func sendText(_ text: String) {
        guard active, state != .connecting, !responseActive, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        muted = true; microphone?.isEnabled = false
        armWatchdog()
        onTranscript?(false, text)
        send(["type": "conversation.item.create", "item": ["type": "message", "role": "user",
              "content": [["type": "input_text", "text": String(text.prefix(1500))]]]])
        requestResponse()
    }

    func updateScreen(symbol: String, timeframe: String) {
        (self.symbol, self.timeframe) = Self.screen(symbol: symbol, timeframe: timeframe)
        guard active, !instructions.isEmpty else { return }
        send(["type": "session.update", "session": ["type": "realtime", "instructions": screenInstructions]])
    }

    private var screenInstructions: String {
        let context = ["symbol": symbol, "timeframe": timeframe]
        let json = (try? JSONSerialization.data(withJSONObject: context)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
        return instructions + "\nCURRENT SCREEN (selection only, fetch tools for live facts): " + json
            + "\nNATIVE DISPLAY: the app renders the tool's canonical technical plan. UI tools cannot override its risk gate."
    }

    private func requestResponse() {
        if responseActive { responseOwed = true; return }
        responseActive = true
        send(["type": "response.create"])
    }

    private func send(_ event: [String: Any]) {
        guard let channel, channel.readyState == .open,
              let data = try? JSONSerialization.data(withJSONObject: event) else { return }
        guard channel.bufferedAmount < 262_144, channel.sendData(RTCDataBuffer(data: data, isBinary: false)) else { fail(.connection); return }
    }

    // Internal for deterministic event tests. No credentials or audio are logged.
    func handle(_ event: [String: Any]) {
        switch event["type"] as? String {
        case "session.created", "session.updated": break
        case "input_audio_buffer.speech_started": state = .listening
        case "input_audio_buffer.speech_stopped": state = .thinking; armWatchdog()
        case "response.created": responseActive = true; caption = ""
        case "output_audio_buffer.started":
            watchdogTask?.cancel(); watchdogTask = nil
            muted = true; microphone?.isEnabled = false; state = .speaking; level = 0.45
        case "output_audio_buffer.stopped", "output_audio_buffer.cleared":
            level = 0
            if active { state = .listening }
        case "response.output_audio_transcript.delta": caption += event["delta"] as? String ?? ""
        case "response.output_audio_transcript.done":
            if let text = event["transcript"] as? String { caption = text; onTranscript?(true, text) }
        case "conversation.item.input_audio_transcription.completed":
            if let text = event["transcript"] as? String, !text.isEmpty { onTranscript?(false, text) }
        case "response.output_item.added":
            if let item = event["item"] as? [String: Any], let id = item["call_id"] as? String, let name = item["name"] as? String { callNames[id] = name }
        case "response.function_call_arguments.done":
            if let id = event["call_id"] as? String, let name = event["name"] as? String ?? callNames[id] {
                dispatch(name: name, id: id, arguments: event["arguments"] as? String ?? "{}")
            }
        case "response.done":
            responseActive = false
            let response = event["response"] as? [String: Any] ?? [:]
            if response["status"] as? String == "failed" { fail(.connection); return }
            for item in response["output"] as? [[String: Any]] ?? [] where item["type"] as? String == "function_call" {
                if let name = item["name"] as? String, let id = item["call_id"] as? String {
                    dispatch(name: name, id: id, arguments: item["arguments"] as? String ?? "{}")
                }
            }
            if responseOwed { responseOwed = false; requestResponse() }
            if state != .speaking, active { state = .listening }
        case "error":
            let code = (event["error"] as? [String: Any])?["code"] as? String
            if code != "response_cancel_not_active" { fail(.connection) }
        default: break
        }
    }

    private func dispatch(name: String, id: String, arguments: String) {
        guard !dispatched.contains(id), let data = arguments.data(using: .utf8),
              let args = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        // A client guard against runaway tool loops; account quotas still belong on the server.
        guard dispatched.count < 48 else { fail(.limit); return }
        dispatched.insert(id)
        let token = generation
        toolTasks[id] = Task { [weak self] in
            guard let self else { return }
            let result: [String: Any]
            do { result = try await self.runTool(name, args: args, token: token) }
            catch { result = ["error": "tool_failed"] }
            guard self.generation == token, !Task.isCancelled else { return }
            if let json = try? JSONSerialization.data(withJSONObject: result), let output = String(data: json, encoding: .utf8) {
                self.send(["type": "conversation.item.create", "item": ["type": "function_call_output", "call_id": id, "output": output]])
                if self.responseActive { self.responseOwed = true } else { self.requestResponse() }
            }
            self.toolTasks[id] = nil
        }
    }

    private func runTool(_ name: String, args: [String: Any], token: UUID) async throws -> [String: Any] {
        if name == "set_chart" {
            let screen = Self.screen(symbol: args["symbol"] as? String ?? symbol, timeframe: args["timeframe"] as? String ?? timeframe)
            updateScreen(symbol: screen.0, timeframe: screen.1)
            onChart?(screen.0, screen.1)
            return ["ok": true, "symbol": screen.0, "timeframe": screen.1]
        }
        if ["draw_levels", "show_debate", "update_thesis"].contains(name) {
            return ["ok": true, "native_display": "The app renders the canonical technical evidence and risk plan from run_debate; model-authored levels do not override it."]
        }
        guard ["get_market", "run_debate", "get_protocol_stats"].contains(name) else {
            return ["error": "unsupported_tool", "note": "No trades are executed in voice. Use the desk's manual controls."]
        }
        var requestArgs = args
        let ticker = Self.screen(symbol: args["symbol"] as? String ?? symbol, timeframe: timeframe).0
        if name != "get_protocol_stats" { requestArgs["symbol"] = ticker }
        if name == "run_debate", ticker != symbol {
            updateScreen(symbol: ticker, timeframe: timeframe)
            onChart?(ticker, timeframe)
        }
        if name == "run_debate", let cached = evidenceCache[ticker], Date().timeIntervalSince(cached.0) < 30 {
            onEvidence?(ticker, cached.1)
            return cached.1
        }
        guard let output = try await BobbyAPI.json("api/voice-tool", method: "POST", body: ["tool": name, "args": requestArgs], allowedStatus: 200...299) as? [String: Any] else { throw VoiceError.connection }
        guard generation == token else { throw CancellationError() }
        if name == "run_debate", output["error"] == nil {
            if evidenceCache.count >= 8 { evidenceCache.removeAll() }
            evidenceCache[ticker] = (Date(), output)
            if ticker == symbol { onEvidence?(ticker, output) }
        }
        return output
    }

    private enum VoiceError: Error { case microphone, connection, limit, signIn, dailyLimit, busy, update }
    private func fail(_ reason: VoiceError) {
        stop()
        switch reason {
        case .microphone: error = L.t("Allow microphone access in Settings, then try again.", "Permite el micrófono en Ajustes e intenta de nuevo.")
        case .connection: error = L.t("Voice disconnected. Tap to retry.", "Voz desconectada. Toca para reintentar.")
        case .signIn:
            needsSignIn = true
            error = L.t("Sign in for your 3 daily minutes.", "Inicia sesión para usar tus 3 min diarios.")
        case .dailyLimit: error = L.t("Your 3 minutes are used for today. Come back tomorrow.", "Usaste tus 3 min de hoy. Vuelve mañana.")
        case .busy: error = L.t("A call is already open. Close it to continue.", "Ya tienes una llamada abierta. Ciérrala para continuar.")
        case .update: error = L.t("Update Bobby to use voice.", "Actualiza Bobby para usar la voz.")
        case .limit: error = L.t("Voice paused. Continue by text.", "Voz en pausa. Sigue por texto.")
        }
        switch reason {
        case .connection, .dailyLimit, .busy, .limit, .update:
            error = L.t("Live paused · free voice ready", "En vivo pausado · voz gratis lista")
            onFallback?()
        case .microphone, .signIn: break
        }
    }
}

// WebRTC callbacks arrive off the main actor; the owner validates the generation.
private final class VoiceRTCDelegate: NSObject, RTCPeerConnectionDelegate, RTCDataChannelDelegate {
    var event: ((Data) -> Void)?
    var opened: (() -> Void)?
    var closed: (() -> Void)?
    func dataChannelDidChangeState(_ dataChannel: RTCDataChannel) {
        if dataChannel.readyState == .open { opened?() }
        if dataChannel.readyState == .closed { closed?() }
    }
    func dataChannel(_ dataChannel: RTCDataChannel, didReceiveMessageWith buffer: RTCDataBuffer) { event?(buffer.data) }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        if newState == .failed || newState == .closed { closed?() }
    }
    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}
}
