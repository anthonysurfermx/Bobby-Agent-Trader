package xyz.bobbyprotocol.android.platform

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.CancellationException
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.data.VoicePreference
import xyz.bobbyprotocol.android.data.VoicePreviewPolicy
import java.io.File
import java.util.Locale

/** Uses the explicit on-device recognizer only. Typing remains available on older devices. */
class AndroidVoice(
    private val activity: Activity,
    private val scope: CoroutineScope,
    private val repository: BobbyRepository,
    private val emit: (String, JSONObject) -> Unit,
    private val language: () -> String,
    private val muted: () -> Boolean,
    private val voicePersona: () -> String,
    private val voicePreference: () -> VoicePreference = { VoicePreference.COMPANION },
) {
    private var recognizer: SpeechRecognizer? = null
    private val dictation = DictationState()
    private var finalizationJob: Job? = null
    private var holdTimeoutJob: Job? = null
    private var acceptingSpeech = false
    private var speechEpoch = 0L
    private var player: MediaPlayer? = null
    private var audioFile: File? = null
    private var playbackJob: Job? = null
    private var progressJob: Job? = null
    private var speakingId: String? = null
    private var playbackGeneration = 0L
    private var deviceVoiceReady = false
    private val deviceVoice = TextToSpeech(activity) { status -> deviceVoiceReady = status == TextToSpeech.SUCCESS }

    fun permission(): JSONObject {
        val available = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)
        val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val asked = activity.getSharedPreferences("bobby_permissions", 0).getBoolean("microphoneAsked", false)
        return JSONObject().put("state", when {
            !available -> "unavailable"
            granted -> "granted"
            asked -> "denied"
            else -> "undetermined"
        }).put("onDevice", available)
    }

    fun markPermissionAsked() { activity.getSharedPreferences("bobby_permissions", 0).edit().putBoolean("microphoneAsked", true).apply() }

    fun start(): JSONObject {
        val state = permission().getString("state")
        if (state != "granted") return JSONObject().put("status", if (state == "undetermined") "needs_permission" else state)
        if (dictation.isActive) return JSONObject().put("status", "busy")
        if (Build.VERSION.SDK_INT < 31) return JSONObject().put("status", "unavailable")
        stopSpeaking()
        destroyRecognizer()
        speechEpoch = repository.epoch.value
        acceptingSpeech = true
        dictation.start()
        val current = SpeechRecognizer.createOnDeviceSpeechRecognizer(activity)
        recognizer = current
        current.setRecognitionListener(object : RecognitionListener {
            private fun current() = acceptingSpeech && speechEpoch == repository.epoch.value && recognizer === current
            override fun onReadyForSpeech(params: Bundle?) { if (current()) emit("speech.state", JSONObject().put("state", "listening")) }
            override fun onBeginningOfSpeech() = Unit
            override fun onRmsChanged(rmsdB: Float) { if (current()) emit("speech.level", JSONObject().put("level", ((rmsdB + 2) / 12).coerceIn(0f, 1f))) }
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = Unit
            override fun onError(error: Int) {
                if (!current() || dictation.isRecognitionFinished) return
                holdTimeoutJob?.cancel(); holdTimeoutJob = null
                dictation.cancel()
                finalizationJob?.cancel()
                acceptingSpeech = false
                val code = when (error) {
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "denied"
                    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "unavailable"
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_speech"
                    else -> "unavailable"
                }
                emit("speech.error", JSONObject().put("code", code))
                emit("speech.state", JSONObject().put("state", "stopped"))
            }
            override fun onResults(results: Bundle?) {
                if (!current()) return
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                dictation.result(text)?.let { finishDictation(it) }
            }
            override fun onPartialResults(partialResults: Bundle?) {
                if (!current() || dictation.isRecognitionFinished) return
                val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                dictation.partial(text)
                emit("speech.partial", JSONObject().put("text", text))
            }
            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.forLanguageTag(language()).toLanguageTag())
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        }
        runCatching { current.startListening(intent) }.onFailure {
            dictation.cancel()
            acceptingSpeech = false
            destroyRecognizer()
            return JSONObject().put("status", "unavailable")
        }
        holdTimeoutJob = scope.launch {
            delay(60_000)
            if (recognizer === current && speechEpoch == repository.epoch.value && dictation.isHolding) stop(cancel = true)
        }
        return JSONObject().put("status", "listening")
    }

    fun stop(cancel: Boolean = false): JSONObject {
        val wasActive = dictation.isActive
        holdTimeoutJob?.cancel(); holdTimeoutJob = null
        if (cancel) {
            finalizationJob?.cancel(); finalizationJob = null
            dictation.cancel()
            acceptingSpeech = false
            recognizer?.cancel()
            if (wasActive) emit("speech.error", JSONObject().put("code", "interrupted"))
            emit("speech.state", JSONObject().put("state", "stopped"))
        } else if (dictation.isHolding) {
            val completed = dictation.release()
            if (completed != null) finishDictation(completed) else {
                recognizer?.stopListening()
                val current = recognizer
                finalizationJob = scope.launch {
                    delay(1500)
                    if (recognizer === current && speechEpoch == repository.epoch.value) dictation.timeout()?.let { finishDictation(it) }
                }
            }
        }
        return JSONObject().put("status", if (wasActive) "stopped" else "idle")
    }

    private fun finishDictation(text: String) {
        finalizationJob?.cancel(); finalizationJob = null
        acceptingSpeech = false
        dictation.cancel()
        recognizer?.cancel()
        if (text.isNotBlank()) emit("speech.final", JSONObject().put("text", text))
        else emit("speech.error", JSONObject().put("code", "no_speech"))
        emit("speech.state", JSONObject().put("state", "stopped"))
    }

    fun speak(id: String, text: String): JSONObject {
        require(id.matches(Regex("[A-Za-z0-9_.:-]{1,64}")))
        require(text.isNotBlank())
        if (text.codePointCount(0, text.length) > 800) return JSONObject().put("status", "too_long")
        if (muted() || !repository.allowsExternalProcessing()) return JSONObject().put("status", "muted")
        stopSpeaking()
        val lease = capturePlayback(external = true)
        speakingId = id
        playbackJob = scope.launch {
            try {
                val bytes = repository.neuralVoice(text, voicePreference().requestVoice(voicePersona()), language())
                if (!currentPlayback(lease, id)) return@launch
                val file = File.createTempFile("bobby-voice-", ".mp3", activity.cacheDir)
                audioFile = file
                file.writeBytes(bytes)
                play(file, id, lease)
            } catch (failure: CancellationException) {
                throw failure
            } catch (failure: Exception) {
                if (currentPlayback(lease, id)) {
                    emit("voice.end", JSONObject().put("id", id).put("reason", "failed"))
                    speakingId = null
                    clearAudio()
                }
            }
        }
        return JSONObject().put("status", "queued")
    }

    fun preview(companionId: String, text: String): JSONObject {
        require(companionId.matches(Regex("[a-z0-9_-]{1,40}")))
        if (muted()) return JSONObject().put("status", "muted")
        stopSpeaking()
        val id = "preview-$companionId"
        val lease = capturePlayback(external = false)
        val lang = language().substringBefore('-')
        if (!voicePreference().usesBundledClip(lang)) return devicePreview(id, text)
        return try {
            activity.assets.openFd("voice/select-$companionId-$lang.mp3").use { descriptor ->
                val mp = MediaPlayer()
                player = mp
                speakingId = id
                mp.setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                configurePlayer(mp, id, lease)
                mp.prepareAsync()
            }
            JSONObject().put("status", "queued")
        } catch (failure: Exception) { JSONObject().put("status", "muted") }
    }

    private fun devicePreview(id: String, text: String): JSONObject {
        if (!deviceVoiceReady || text.isBlank()) return JSONObject().put("status", "muted")
        val locale = Locale.forLanguageTag(language())
        val available = deviceVoice.voices.orEmpty()
        val name = VoicePreviewPolicy.choose(available.map { VoicePreviewPolicy.Candidate(it.name, it.locale.toLanguageTag(), it.isNetworkConnectionRequired) }, locale.toLanguageTag(), voicePreference())
            ?: return JSONObject().put("status", "muted")
        val selected = available.first { it.name == name }
        deviceVoice.voice = selected
        val lease = capturePlayback(external = false)
        val utterance = "$id-${lease.generation}"
        deviceVoice.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { activity.runOnUiThread { if (utteranceId == utterance && currentPlayback(lease, id)) emit("voice.start", JSONObject().put("id", id).put("engine", "device")) } }
            override fun onDone(utteranceId: String?) { activity.runOnUiThread { if (utteranceId == utterance && currentPlayback(lease, id)) { speakingId = null; emit("voice.end", JSONObject().put("id", id).put("reason", "finished")) } } }
            @Deprecated("Framework callback")
            override fun onError(utteranceId: String?) { activity.runOnUiThread { if (utteranceId == utterance && currentPlayback(lease, id)) { speakingId = null; emit("voice.end", JSONObject().put("id", id).put("reason", "failed")) } } }
        })
        speakingId = id
        if (deviceVoice.speak(text, TextToSpeech.QUEUE_FLUSH, Bundle(), utterance) == TextToSpeech.ERROR) {
            speakingId = null
            return JSONObject().put("status", "muted")
        }
        return JSONObject().put("status", "queued")
    }

    private fun capturePlayback(external: Boolean) = PlaybackLease(playbackGeneration, repository.session.value?.userId, repository.epoch.value, external)
    private fun currentPlayback(lease: PlaybackLease, id: String): Boolean = speakingId == id && lease.current(playbackGeneration,
        repository.session.value?.userId, repository.epoch.value, muted(), repository.allowsExternalProcessing())

    private fun discardPlayer(mp: MediaPlayer, lease: PlaybackLease) {
        if (player === mp && lease.generation == playbackGeneration) {
            playbackGeneration++; playbackJob?.cancel(); playbackJob = null; speakingId = null; clearAudio()
        } else runCatching { mp.release() }
    }

    private fun play(file: File, id: String, lease: PlaybackLease) {
        val mp = MediaPlayer()
        player = mp
        mp.setDataSource(file.absolutePath)
        configurePlayer(mp, id, lease)
        mp.prepareAsync()
    }

    private fun configurePlayer(mp: MediaPlayer, id: String, lease: PlaybackLease) {
        mp.setOnPreparedListener {
            if (player !== mp || !currentPlayback(lease, id)) { discardPlayer(mp, lease); return@setOnPreparedListener }
            emit("voice.start", JSONObject().put("id", id).put("durationSec", mp.duration / 1000.0).put("engine", "neural"))
            mp.start()
            progressJob?.cancel()
            progressJob = scope.launch {
                while (player === mp && speakingId == id) {
                    if (!currentPlayback(lease, id)) { discardPlayer(mp, lease); break }
                    emit("voice.progress", JSONObject().put("id", id).put("t", mp.currentPosition / 1000.0).put("duration", mp.duration / 1000.0))
                    delay(100)
                }
            }
        }
        mp.setOnCompletionListener {
            if (player === mp && currentPlayback(lease, id)) {
                emit("voice.progress", JSONObject().put("id", id).put("t", mp.duration / 1000.0).put("duration", mp.duration / 1000.0))
                emit("voice.end", JSONObject().put("id", id).put("reason", "finished"))
                speakingId = null
                clearAudio()
            } else discardPlayer(mp, lease)
        }
        mp.setOnErrorListener { _, _, _ ->
            if (player === mp && currentPlayback(lease, id)) {
                emit("voice.end", JSONObject().put("id", id).put("reason", "failed"))
                speakingId = null
                clearAudio()
            } else discardPlayer(mp, lease)
            true
        }
    }

    fun stopSpeaking() {
        playbackGeneration++
        deviceVoice.stop()
        playbackJob?.cancel()
        playbackJob = null
        speakingId?.let { emit("voice.end", JSONObject().put("id", it).put("reason", "stopped")) }
        speakingId = null
        clearAudio()
    }

    private fun clearAudio() { progressJob?.cancel(); progressJob = null; player?.release(); player = null; audioFile?.delete(); audioFile = null }
    private fun destroyRecognizer() { holdTimeoutJob?.cancel(); holdTimeoutJob = null; finalizationJob?.cancel(); finalizationJob = null; recognizer?.destroy(); recognizer = null }
    fun background() { stop(true); destroyRecognizer(); stopSpeaking() }
    fun close() { background(); deviceVoice.shutdown() }
}
