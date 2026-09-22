@preconcurrency import AVFoundation
import Foundation
import UIKit

@MainActor
final class PTSRealtimeClient: ObservableObject {
    enum State: Equatable { case idle, connecting, listening, thinking, speaking, ended, error }
    // Distinct causes so the sheet never shows a generic failure for a
    // problem the presenter can fix (network, microphone, audio route).
    enum Failure: Equatable { case offline, microphone, audio, busy, timeout, server }
    struct Line: Identifiable {
        let id = UUID()
        let role: String
        let text: String
    }

    @Published private(set) var state: State = .idle
    @Published private(set) var transcript: [Line] = []
    @Published private(set) var error: String?
    @Published private(set) var failure: Failure?
    @Published private(set) var level: CGFloat = 0
    @Published private(set) var remainingSeconds = Int(PTSVoicePolicy.maximumDuration)
    @Published private(set) var renderedAudioFrames = 0
    private var receivedAudioFrames = 0
    private var outputPeak: Float = 0
    private var hasOutputTap = false

    var playbackDiagnostics: String {
        let session = AVAudioSession.sharedInstance()
        return "received=\(receivedAudioFrames) rendered=\(renderedAudioFrames) peak=\(outputPeak) running=\(audioEngine?.isRunning == true) route=\(session.currentRoute.outputs.map { $0.portType.rawValue }.joined(separator: ",")) volume=\(session.outputVolume)"
    }

    private let sessionEndpoint = URL(string: "https://bobbyprotocol.xyz/api/pts-realtime-session")!
    private let audioFormat = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)!
    private var socket: URLSessionWebSocketTask?
    private var socketSession: URLSession?
    private var receiveTask: Task<Void, Never>?
    private var timeoutTask: Task<Void, Never>?
    private var audioEngine: AVAudioEngine?
    private var playerNode: AVAudioPlayerNode?
    private var inputConverter: AVAudioConverter?
    private var deadline: Date?
    private var timer: Timer?
    private var generation = UUID()
    private var responseText = ""
    private var responseActive = false
    private var queuedQuestion: String?
    private var currentAudioItem: String?
    private var playedFrames: AVAudioFramePosition = 0
    private var receivedAudioItems: [String] = []
    private var playbackGeneration = UUID()
    private var scheduledBuffers = 0
    private var hasInputTap = false
    private var outputSilenceUntil = Date.distantPast
    private var audioObservers: [NSObjectProtocol] = []
    private var audioRestarts = 0
    private var currentResponseID: String?
    private var ignoredResponseIDs: Set<String> = []

    private let policy: PTSVoiceCase
    /// Current market facts appended to the reviewed policy at each connect.
    private let liveContext: (@MainActor () -> String?)?
    private var sessionInstructions = ""
    init(policy: PTSVoiceCase = .coin, liveContext: (@MainActor () -> String?)? = nil) {
        self.policy = policy
        self.liveContext = liveContext
        self.sessionInstructions = policy.instructions
    }

    var isActive: Bool { [.listening, .thinking, .speaking].contains(state) }
    var canSend: Bool { isActive }
    var countdown: String { String(format: "%d:%02d", remainingSeconds / 60, remainingSeconds % 60) }
    var statusText: String {
        switch state {
        case .idle: return "Conversar sobre COIN"
        case .connecting: return "Conectando voz…"
        case .listening: return "Te escucho"
        case .thinking: return "Revisando el análisis…"
        case .speaking: return "Copiloto hablando"
        case .ended: return remainingSeconds == 0 ? "Terminó tu sesión de 3 minutos" : "Conversación finalizada"
        case .error:
            switch failure {
            case .offline: return "Sin conexión"
            case .microphone: return "Micrófono desactivado"
            case .audio: return "Error de audio"
            case .busy: return "Voz en vivo ocupada"
            case .timeout, .server, nil: return "Voz en vivo no disponible"
            }
        }
    }

    func connect() async {
        guard [.idle, .error, .ended].contains(state) else { return }
        cleanup()
        let run = UUID(); generation = run
        error = nil; failure = nil; transcript = []; state = .connecting; audioRestarts = 0
        sessionInstructions = policy.instructions + (liveContext?().map { "\n" + $0 } ?? "")
        // A hands-off conversation must not let Auto-Lock background the app.
        UIApplication.shared.isIdleTimerDisabled = true
        remainingSeconds = Int(PTSVoicePolicy.maximumDuration)
        let permitted = await AVAudioApplication.requestRecordPermission()
        guard generation == run else { return }
        guard permitted else { fail("Activa el micrófono para PTS en Ajustes para conversar por voz.", .microphone); return }
        // Category and speaker changes re-route the hardware asynchronously and
        // stop a running engine (seen on device as route changes 3 and 4).
        // Settle the route now, while the session is being minted.
        do { try configureSession() } catch { fail(Self.message(for: .audio), .audio); return }
        #if DEBUG
        // Exercises the backup voice without spending or breaking Live.
        if ProcessInfo.processInfo.arguments.contains("-PTSForceLiveFailure") { fail(Self.message(for: .server), .server); return }
        #endif
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-PTSLocalAudioQA") {
            try? await Task.sleep(for: .milliseconds(600))
            guard generation == run else { return }
            do { try runLocalAudioProbe() } catch { fail(error.localizedDescription, .audio) }
            return
        }
        #endif
        // One budget covers minting, the socket and the session handshake, so
        // the presenter sees voice or a clear fallback within 15 seconds.
        timeoutTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(15))
            guard !Task.isCancelled, let self, self.generation == run, self.state == .connecting else { return }
            self.fail("La voz tardó demasiado en conectar. Reintenta o usa las respuestas revisadas.", .timeout)
        }
        do {
            var request = URLRequest(url: sessionEndpoint)
            request.httpMethod = "POST"
            request.timeoutInterval = 12
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["lang": "es", "voice": "marin"])
            let (data, response) = try await URLSession.shared.data(for: request)
            guard generation == run else { return }
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else {
                if status == 429 { fail("Se alcanzó el límite de sesiones de voz. Espera unos minutos; mientras tanto usa las respuestas revisadas.", .busy) }
                else { fail(Self.message(for: .server), .server) }
                return
            }
            let payload = try JSONDecoder().decode(SessionPayload.self, from: data)
            guard !payload.clientSecret.isEmpty else { fail(Self.message(for: .server), .server); return }
            var components = URLComponents(string: "wss://api.openai.com/v1/realtime")!
            components.queryItems = [URLQueryItem(name: "model", value: payload.model)]
            var socketRequest = URLRequest(url: components.url!)
            socketRequest.setValue("Bearer \(payload.clientSecret)", forHTTPHeaderField: "Authorization")
            // GA sessions use nested audio config and output_audio events, no beta header.
            let session = URLSession(configuration: .ephemeral)
            socketSession = session
            let task = session.webSocketTask(with: socketRequest)
            socket = task
            task.resume()
            receiveTask = Task { [weak self] in
                do {
                    while !Task.isCancelled {
                        let message = try await task.receive()
                        guard let self, self.generation == run else { return }
                        switch message {
                        case .string(let text): try await self.handle(text)
                        case .data(let data): try await self.handle(String(decoding: data, as: UTF8.self))
                        @unknown default: break
                        }
                    }
                } catch {
                    guard let self, self.generation == run, self.state != .idle, self.state != .ended else { return }
                    let kind = Self.failureKind(error)
                    self.fail(kind == .offline ? Self.message(for: .offline) : "Se cortó la conexión de voz. Reintenta o usa las respuestas revisadas.", kind == .offline ? .offline : .server)
                }
            }
        } catch {
            guard generation == run else { return }
            let kind = Self.failureKind(error)
            fail(Self.message(for: kind), kind)
        }
    }

    func stop() { generation = UUID(); cleanup(); state = .idle }
    func end() { generation = UUID(); cleanup(); state = .ended }

    func sendText(_ text: String) async {
        let question = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(800))
        guard !question.isEmpty, canSend, checkDeadline() else { return }
        let run = generation
        transcript.append(Line(role: "user", text: question))
        do {
            try await interrupt()
            try await send(["type": "conversation.item.create", "item": ["type": "message", "role": "user", "content": [["type": "input_text", "text": question]]]])
            try await answer(question)
        } catch {
            if generation == run { fail(Self.failureKind(error) == .offline ? Self.message(for: .offline) : "No se pudo enviar la pregunta. Reintenta la voz.", Self.failureKind(error) == .offline ? .offline : .server) }
        }
    }

    private func configure() async throws {
        try await send(["type": "session.update", "session": [
            "type": "realtime", "instructions": sessionInstructions,
            "output_modalities": ["audio"], "max_output_tokens": 1536, "tools": [],
            "audio": [
                "input": [
                    "format": ["type": "audio/pcm", "rate": 24000],
                    "transcription": ["model": "gpt-4o-mini-transcribe", "language": "es", "prompt": "COIN, Coinbase, Daniel Marín, rango lateral, ruptura, opciones."],
                    "turn_detection": ["type": "server_vad", "threshold": 0.5, "prefix_padding_ms": 300, "silence_duration_ms": 600, "create_response": false, "interrupt_response": true]
                ],
                "output": ["format": ["type": "audio/pcm", "rate": 24000], "voice": "marin"]
            ]
        ]])
    }

    private func handle(_ text: String) async throws {
        guard let data = text.data(using: .utf8), let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let type = event["type"] as? String else { return }
        switch type {
        case "session.created": try await configure()
        case "session.updated":
            guard state == .connecting else { return }
            timeoutTask?.cancel(); timeoutTask = nil
            do { try startAudio() } catch { fail(Self.message(for: .audio), .audio); return }
            deadline = Date().addingTimeInterval(PTSVoicePolicy.maximumDuration)
            timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
                MainActor.assumeIsolated { _ = self?.checkDeadline() }
            }
            state = .thinking
            try await requestResponse("Di exactamente: \(policy.greeting)")
        case "input_audio_buffer.speech_started":
            if responseActive, let id = currentResponseID { ignoredResponseIDs.insert(id) }
            try await truncatePlayback()
            stopPlayback()
            state = .listening
        case "input_audio_buffer.speech_stopped": state = .thinking
        case "conversation.item.input_audio_transcription.completed":
            guard let question = event["transcript"] as? String, !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, checkDeadline() else {
                // A cough or noise yields no words; go back to listening.
                if !responseActive, scheduledBuffers == 0, isActive { state = .listening }
                return
            }
            transcript.append(Line(role: "user", text: question))
            try await answer(question)
        case "conversation.item.input_audio_transcription.failed":
            try await requestResponse("Di solamente: No te entendí bien. ¿Puedes repetir tu pregunta sobre COIN?")
        case "response.created":
            responseActive = true; state = .thinking
            currentResponseID = (event["response"] as? [String: Any])?["id"] as? String
        case "response.output_audio.delta":
            guard checkDeadline(), !isIgnored(event) else { return }
            if let item = event["item_id"] as? String, let delta = event["delta"] as? String, let bytes = Data(base64Encoded: delta) {
                if !receivedAudioItems.contains(item) { receivedAudioItems.append(item) }
                play(bytes, item: item)
            }
        case "response.output_audio_transcript.delta":
            if !isIgnored(event) { responseText += event["delta"] as? String ?? "" }
        case "response.output_audio_transcript.done":
            guard !isIgnored(event) else { responseText = ""; return }
            let line = (event["transcript"] as? String ?? responseText).trimmingCharacters(in: .whitespacesAndNewlines)
            if !line.isEmpty { transcript.append(Line(role: "assistant", text: line)) }
            responseText = ""
        case "response.done":
            responseActive = false
            if let response = event["response"] as? [String: Any], response["status"] as? String == "failed" {
                fail("No se pudo generar la respuesta de voz. Reintenta o usa las respuestas revisadas.", .server); return
            }
            if let question = queuedQuestion {
                queuedQuestion = nil
                try await answer(question)
            } else if scheduledBuffers == 0 { state = .listening }
        case "error":
            let detail = event["error"] as? [String: Any]
            let code = detail?["code"] as? String
            // Barge-in housekeeping (cancel/truncate/delete) can race the server;
            // those rejections are harmless and must not end a live demo.
            if code == "response_cancel_not_active" { return }
            if let source = detail?["event_id"] as? String, source.hasPrefix("pts-cleanup-") { return }
            fail("No se pudo continuar la conversación de voz. Reintenta o usa las respuestas revisadas.", .server)
        default: break
        }
    }

    private func answer(_ question: String) async throws {
        guard checkDeadline() else { return }
        if responseActive { queuedQuestion = question; return }
        switch policy.route(question) {
        case .answer: try await requestResponse(policy.answerInstruction)
        case .judge: try await requestResponse(policy.judgeInstruction)
        case .redirect:
            // Do not let an out-of-scope request generate an automatic answer.
            try await requestResponse("No contestes la petición del usuario. Di exactamente: \(policy.redirect)")
        }
    }

    private func requestResponse(_ instruction: String) async throws {
        responseText = ""; responseActive = true; state = .thinking
        try await send(["type": "response.create", "response": ["output_modalities": ["audio"], "instructions": sessionInstructions + "\nPARA ESTA RESPUESTA: " + instruction]])
    }

    private func interrupt() async throws {
        if responseActive {
            // Deltas already in flight for the cancelled answer must not play.
            if let id = currentResponseID { ignoredResponseIDs.insert(id) }
            try await send(["type": "response.cancel", "event_id": cleanupEventID()])
        }
        try await truncatePlayback()
        stopPlayback()
    }

    private func truncatePlayback() async throws {
        if let item = currentAudioItem ?? receivedAudioItems.first, scheduledBuffers > 0 {
            try await send(["type": "conversation.item.truncate", "event_id": cleanupEventID(), "item_id": item, "content_index": 0, "audio_end_ms": Int(Double(playedFrames) / 24)])
            // One response may contain several audio items. Drop later items
            // that were generated but have never reached the speaker.
            if let index = receivedAudioItems.firstIndex(of: item) {
                for unheard in receivedAudioItems.dropFirst(index + 1) {
                    try await send(["type": "conversation.item.delete", "event_id": cleanupEventID(), "item_id": unheard])
                }
            }
        }
    }

    @discardableResult private func checkDeadline() -> Bool {
        guard let deadline else { return false }
        remainingSeconds = PTSVoicePolicy.remaining(until: deadline)
        if remainingSeconds == 0 { end(); return false }
        return true
    }

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setPreferredSampleRate(audioFormat.sampleRate)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)
        // `defaultToSpeaker` can be ignored when a previous voice session left
        // the route on the built-in receiver. Keep headset, car and AirPlay
        // routes intact, otherwise make the response audible on the loudspeaker.
        let personalRoutes: [AVAudioSession.Port] = [.bluetoothHFP, .bluetoothA2DP, .bluetoothLE, .headphones, .usbAudio, .carAudio, .airPlay]
        if !session.currentRoute.outputs.contains(where: { personalRoutes.contains($0.portType) }) {
            try session.overrideOutputAudioPort(.speaker)
        }
    }

    private func startAudio() throws {
        let engine = AVAudioEngine()
        audioEngine = engine
        let run = generation
        // Route and format changes stop the engine; restart it instead of
        // leaving a session that looks alive but is silent.
        audioObservers.append(NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.traceAudio("config-change engineRunning=\(engine.isRunning)")
                self?.restartAudio(run)
            }
        })
        #if DEBUG
        audioObservers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] note in
            let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 99
            MainActor.assumeIsolated { self?.traceAudio("route-change reason=\(reason)") }
        })
        #endif
        audioObservers.append(NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            MainActor.assumeIsolated {
                guard let self, self.generation == run, self.isActive else { return }
                self.fail("Una llamada u otra app tomó el audio. Reintenta la conversación.", .audio)
            }
        })
        let input = engine.inputNode
        #if !targetEnvironment(simulator)
        try input.setVoiceProcessingEnabled(true)
        #endif
        try installInputTap(on: engine, run: run)
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: audioFormat)
        playerNode = player
        receivedAudioFrames = 0; renderedAudioFrames = 0; outputPeak = 0
        installOutputTap(on: engine, run: run)
        engine.prepare()
        try engine.start()
        player.play()
        traceAudio("engine-start")
    }

    private func restartAudio(_ run: UUID) {
        // A route or format change (speaker override, voice processing,
        // AirPods) stops the engine. Restart the same graph in place: a new
        // engine would re-enable voice processing and trigger another change.
        guard generation == run, isActive, let engine = audioEngine, let player = playerNode, !engine.isRunning else { return }
        audioRestarts += 1
        guard audioRestarts <= 6 else { fail(Self.message(for: .audio), .audio); return }
        // Formats can change with the route: reconnect the player and reinstall
        // both taps before restarting, or scheduled speech never renders.
        if hasInputTap { engine.inputNode.removeTap(onBus: 0); hasInputTap = false }
        if hasOutputTap { engine.mainMixerNode.removeTap(onBus: 0); hasOutputTap = false }
        engine.disconnectNodeOutput(player)
        engine.connect(player, to: engine.mainMixerNode, format: audioFormat)
        do {
            try installInputTap(on: engine, run: run)
            installOutputTap(on: engine, run: run)
            engine.prepare()
            try engine.start()
            player.play()
            traceAudio("route-restart")
        } catch {
            traceAudio("route-restart-retry \(error.localizedDescription)")
            // The new route may still be settling; retry shortly (bounded above).
            Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(300))
                self?.restartAudio(run)
            }
        }
    }

    private func installOutputTap(on engine: AVAudioEngine, run: UUID) {
        engine.mainMixerNode.installTap(onBus: 0, bufferSize: 1024, format: nil) { [weak self] buffer, _ in
            guard let samples = buffer.floatChannelData?[0] else { return }
            var peak: Float = 0
            for index in 0..<Int(buffer.frameLength) { peak = max(peak, abs(samples[index])) }
            guard peak > 0.0001 else { return }
            let frames = Int(buffer.frameLength)
            Task { @MainActor in
                guard let self, self.generation == run else { return }
                let first = self.renderedAudioFrames == 0
                self.renderedAudioFrames += frames
                self.outputPeak = max(self.outputPeak, peak)
                if first { self.traceAudio("first-render") }
            }
        }
        hasOutputTap = true
    }

    private func installInputTap(on engine: AVAudioEngine, run: UUID) throws {
        let input = engine.inputNode
        let sourceFormat = input.outputFormat(forBus: 0)
        guard sourceFormat.sampleRate > 0, sourceFormat.channelCount > 0,
              let converter = AVAudioConverter(from: sourceFormat, to: audioFormat) else { throw failure("No se pudo activar el micrófono.") }
        inputConverter = converter
        input.installTap(onBus: 0, bufferSize: 2048, format: sourceFormat) { [weak self] buffer, _ in
            // The render thread reuses its buffer. Copy before crossing actors.
            guard let copy = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: buffer.frameLength) else { return }
            copy.frameLength = buffer.frameLength
            let source = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
            let destination = UnsafeMutableAudioBufferListPointer(copy.mutableAudioBufferList)
            for (a, b) in zip(source, destination) {
                if let src = a.mData, let dst = b.mData { memcpy(dst, src, Int(a.mDataByteSize)) }
            }
            Task { @MainActor in
                guard let self, self.generation == run else { return }
                await self.appendAudio(copy)
            }
        }
        hasInputTap = true
    }

    private func teardownAudio() {
        audioObservers.forEach(NotificationCenter.default.removeObserver); audioObservers = []
        if hasInputTap { audioEngine?.inputNode.removeTap(onBus: 0); hasInputTap = false }
        if hasOutputTap { audioEngine?.mainMixerNode.removeTap(onBus: 0); hasOutputTap = false }
        audioEngine?.stop(); audioEngine = nil; playerNode = nil; inputConverter = nil
    }

    private func appendAudio(_ buffer: AVAudioPCMBuffer) async {
        guard isActive, checkDeadline(), let converter = inputConverter else { return }
        #if DEBUG
        // The live UI test sends typed questions while exercising real output.
        // Keep ambient Mac speech out of that deterministic test conversation.
        if ProcessInfo.processInfo.arguments.contains("-PTSVoiceUITest") || ProcessInfo.processInfo.arguments.contains("-PTSLocalAudioQA") { return }
        #endif
        #if targetEnvironment(simulator)
        // Simulator audio lacks the device VoiceProcessingIO echo canceller.
        // Avoid feeding the Mac speaker output back into the simulated mic.
        guard !responseActive, scheduledBuffers == 0, Date() > outputSilenceUntil else { return }
        #endif
        let capacity = AVAudioFrameCount(ceil(Double(buffer.frameLength) * audioFormat.sampleRate / buffer.format.sampleRate)) + 1
        guard let converted = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: capacity) else { return }
        var supplied = false
        var conversionError: NSError?
        converter.convert(to: converted, error: &conversionError) { _, status in
            if supplied { status.pointee = .noDataNow; return nil }
            supplied = true; status.pointee = .haveData; return buffer
        }
        guard conversionError == nil, converted.frameLength > 0, let samples = converted.floatChannelData?[0] else { return }
        var pcm = [Int16](repeating: 0, count: Int(converted.frameLength))
        for i in pcm.indices { pcm[i] = Int16(max(-1, min(1, samples[i])) * 32767).littleEndian }
        let data = pcm.withUnsafeBytes { Data($0) }
        let run = generation
        do { try await send(["type": "input_audio_buffer.append", "audio": data.base64EncodedString()]) }
        catch {
            guard generation == run, isActive else { return }
            let kind = Self.failureKind(error)
            fail(kind == .offline ? Self.message(for: .offline) : "Se cortó la conexión de voz. Reintenta o usa las respuestas revisadas.", kind == .offline ? .offline : .server)
        }
    }

    private func play(_ data: Data, item: String) {
        guard let player = playerNode, data.count >= 2,
              let buffer = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: AVAudioFrameCount(data.count / 2)),
              let floats = buffer.floatChannelData?[0] else { return }
        let bytes = [UInt8](data)
        buffer.frameLength = AVAudioFrameCount(bytes.count / 2)
        var peak: Float = 0
        for i in 0..<Int(buffer.frameLength) {
            let sample = Int16(bitPattern: UInt16(bytes[i * 2]) | UInt16(bytes[i * 2 + 1]) << 8)
            floats[i] = Float(sample) / 32768
            peak = max(peak, abs(floats[i]))
        }
        state = .speaking; level = CGFloat(min(1, peak * 2))
        receivedAudioFrames += Int(buffer.frameLength)
        if scheduledBuffers == 0 { traceAudio("buffer-arrived") }
        scheduledBuffers += 1
        let run = playbackGeneration
        let frames = buffer.frameLength
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.playbackGeneration == run, self.isActive else { return }
                if self.currentAudioItem != item { self.currentAudioItem = item; self.playedFrames = 0 }
                self.playedFrames += AVAudioFramePosition(frames)
                self.scheduledBuffers = max(0, self.scheduledBuffers - 1)
                self.outputSilenceUntil = Date().addingTimeInterval(0.5)
                if self.scheduledBuffers == 0, !self.responseActive {
                    self.state = .listening; self.level = 0
                    self.traceAudio("playback-finished")
                }
            }
        }
        if !player.isPlaying { player.play() }
    }

    private func stopPlayback() {
        playbackGeneration = UUID(); playerNode?.stop()
        outputSilenceUntil = Date().addingTimeInterval(0.7)
        scheduledBuffers = 0; playedFrames = 0; currentAudioItem = nil; receivedAudioItems = []; responseText = ""; level = 0
    }

    private func cleanup() {
        timer?.invalidate(); timer = nil; deadline = nil
        timeoutTask?.cancel(); timeoutTask = nil
        receiveTask?.cancel(); receiveTask = nil
        stopPlayback()
        teardownAudio()
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil
        socketSession?.invalidateAndCancel(); socketSession = nil
        responseActive = false; queuedQuestion = nil; currentResponseID = nil; ignoredResponseIDs = []
        UIApplication.shared.isIdleTimerDisabled = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func fail(_ message: String, _ kind: Failure) {
        traceAudio("fail kind=\(kind) restarts=\(audioRestarts)")
        generation = UUID(); cleanup(); error = message; failure = kind; state = .error
    }

    private static func message(for kind: Failure) -> String {
        switch kind {
        case .offline: return "Sin conexión a internet. Revisa la red y reintenta; mientras tanto puedes usar las respuestas revisadas."
        case .microphone: return "Activa el micrófono para PTS en Ajustes para conversar por voz."
        case .audio: return "El audio del iPhone no respondió. Reintenta la conversación."
        case .busy: return "Se alcanzó el límite de sesiones de voz. Espera unos minutos; mientras tanto usa las respuestas revisadas."
        case .timeout: return "La voz tardó demasiado en conectar. Reintenta o usa las respuestas revisadas."
        case .server: return "No se pudo abrir la voz en vivo. Reintenta o usa las respuestas revisadas."
        }
    }

    private static func failureKind(_ error: Error) -> Failure {
        let error = error as NSError
        if error.domain == NSURLErrorDomain {
            if error.code == NSURLErrorTimedOut { return .timeout }
            let offline = [NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff, NSURLErrorCannotFindHost, NSURLErrorCannotConnectToHost, NSURLErrorDNSLookupFailed]
            if offline.contains(error.code) { return .offline }
        }
        if error.domain == NSPOSIXErrorDomain, [Int(ENETDOWN), Int(ENETUNREACH), Int(EHOSTUNREACH)].contains(error.code) { return .offline }
        return .server
    }

    private func isIgnored(_ event: [String: Any]) -> Bool {
        guard let id = event["response_id"] as? String else { return false }
        return ignoredResponseIDs.contains(id)
    }

    private var cleanupSequence = 0
    private func cleanupEventID() -> String { cleanupSequence += 1; return "pts-cleanup-\(cleanupSequence)" }
    private func traceAudio(_ event: String) {
        #if DEBUG
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-PTSLocalAudioQA") || args.contains("-PTSVoiceUITest") || args.contains("-PTSAudioTrace") {
            print("PTS_AUDIO \(event) state=\(state) \(playbackDiagnostics)")
        }
        #endif
    }

    #if DEBUG
    private func runLocalAudioProbe() throws {
        try startAudio()
        deadline = Date().addingTimeInterval(PTSVoicePolicy.maximumDuration)
        state = .thinking
        // Feed known bundled speech through the exact Realtime PCM playback path.
        // This isolates the device audio graph without a provider call or recording.
        guard let url = Bundle.main.url(forResource: "pts-v06-context-onyx", withExtension: "mp3") else { throw failure("Missing audio fixture") }
        let file = try AVAudioFile(forReading: url)
        let sourceFrames = AVAudioFrameCount(file.processingFormat.sampleRate * 5)
        guard let source = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: sourceFrames),
              let converter = AVAudioConverter(from: file.processingFormat, to: audioFormat),
              let converted = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: 120_000) else { throw failure("Audio fixture conversion failed") }
        try file.read(into: source, frameCount: sourceFrames)
        var supplied = false
        var error: NSError?
        converter.convert(to: converted, error: &error) { _, status in
            if supplied { status.pointee = .endOfStream; return nil }
            supplied = true; status.pointee = .haveData; return source
        }
        if let error { throw error }
        guard let samples = converted.floatChannelData?[0] else { throw failure("Audio fixture has no samples") }
        let pcm = (0..<Int(converted.frameLength)).map { Int16(max(-1, min(1, samples[$0])) * 32767).littleEndian }
        // Live speech first arrives about a second after the graph starts;
        // match that timing so a start-up route change is exercised too.
        let data = pcm.withUnsafeBytes { Data($0) }
        let run = generation
        Task { [weak self] in
            try? await Task.sleep(for: .seconds(1))
            guard let self, self.generation == run else { return }
            self.play(data, item: "local-audio-probe")
        }
    }
    #endif
    private func failure(_ message: String) -> NSError { NSError(domain: "PTSRealtime", code: 1, userInfo: [NSLocalizedDescriptionKey: message]) }
    private func send(_ object: [String: Any]) async throws {
        guard let socket else { throw failure("Canal Live no disponible") }
        let data = try JSONSerialization.data(withJSONObject: object)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }
    private struct SessionPayload: Decodable {
        let clientSecret: String
        let model: String
        enum CodingKeys: String, CodingKey { case clientSecret = "client_secret", model }
    }
}
