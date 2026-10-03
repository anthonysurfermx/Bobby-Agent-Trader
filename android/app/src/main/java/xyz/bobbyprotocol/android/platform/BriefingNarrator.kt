package xyz.bobbyprotocol.android.platform

import android.content.Context
import android.media.MediaPlayer
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.BobbyRepository
import java.io.File
import java.util.UUID

/** Fetches only authenticated, owned report audio; never a public URL or user-supplied text. */
class BriefingNarrator(private val context: Context, private val repository: BobbyRepository, private val scope: CoroutineScope, private val muted: () -> Boolean = { false }) {
    private var job: Job? = null
    private var player: MediaPlayer? = null
    private var file: File? = null
    private var generation = 0L

    private fun current(lease: PlaybackLease): Boolean = lease.current(generation, repository.session.value?.userId,
        repository.epoch.value, muted(), repository.allowsExternalProcessing())

    fun play(report: JSONObject, onStatus: (String) -> Unit) {
        stop()
        val owner = repository.session.value?.userId ?: return
        val lease = PlaybackLease(generation, owner, repository.epoch.value, external = true)
        if (!current(lease)) { onStatus("unavailable"); return }
        val id = report.getString("id")
        val language = report.getString("language")
        val voice = report.getString("voice")
        val segments = report.optJSONArray("narrationSegments") ?: return
        require(segments.length() in 1..4)
        job = scope.launch(Dispatchers.Main.immediate) {
            try {
                if (current(lease)) onStatus("preparing")
                for (index in 0 until segments.length()) {
                    val key = UUID.randomUUID().toString()
                    var audioId: String? = null
                    repeat(20) {
                        if (audioId == null) {
                            check(current(lease))
                            val reply = repository.briefingVoice(id, report.getInt("contentVersion"), index, voice, language, key)
                            check(current(lease))
                            if (reply.optString("state") == "ready") audioId = reply.getString("audioId")
                            else { check(reply.optString("state") in setOf("queued", "processing")); delay((reply.optDouble("retryAfterSeconds", 2.0).coerceIn(1.0, 30.0) * 1000).toLong()) }
                        }
                    }
                    check(current(lease))
                    val bytes = repository.briefingAudio(audioId ?: error("Audio is not ready"))
                    check(current(lease))
                    // This reference belongs to this segment, even when cancellation drops withContext's return value.
                    val preparedFile = PendingAudioFile()
                    try {
                        withContext(Dispatchers.IO) {
                            preparedFile.write(context.cacheDir, bytes)
                        }
                        // Publish only on Main after the IO completion and every current ownership/consent check.
                        val readyFile = preparedFile.publish { current(lease) }
                        file = readyFile
                        val done = CompletableDeferred<Unit>()
                        val mp = MediaPlayer()
                        player = mp
                        mp.setDataSource(readyFile.absolutePath)
                        mp.setOnPreparedListener {
                            if (player === mp && current(lease)) { onStatus("playing"); it.start() }
                            else done.completeExceptionally(IllegalStateException("Narration stopped"))
                        }
                        mp.setOnCompletionListener {
                            if (player === mp && current(lease)) done.complete(Unit)
                            else done.completeExceptionally(IllegalStateException("Narration stopped"))
                        }
                        mp.setOnErrorListener { _, _, _ -> done.completeExceptionally(IllegalStateException("Audio unavailable")); true }
                        mp.prepareAsync()
                        done.await()
                        check(current(lease))
                    } finally {
                        // A cancelled old segment owns only its unpublished local file, never a newer player/file.
                        preparedFile.close()
                        release(lease.generation)
                    }
                }
                if (current(lease)) onStatus("finished")
            } catch (cancelled: kotlinx.coroutines.CancellationException) { throw cancelled }
            catch (_: Exception) { if (current(lease)) onStatus("failed") }
            finally { release(lease.generation) }
        }
    }
    private fun release(expectedGeneration: Long? = null) {
        if (expectedGeneration != null && expectedGeneration != generation) return
        player?.release(); player = null; file?.delete(); file = null
    }
    fun stop() { generation++; job?.cancel(); job = null; release() }
}
