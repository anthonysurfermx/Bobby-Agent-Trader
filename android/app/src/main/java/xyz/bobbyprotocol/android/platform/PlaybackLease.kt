package xyz.bobbyprotocol.android.platform

import java.io.File

/** Immutable ownership of one playback. Local previews do not need external-processing consent. */
internal data class PlaybackLease(val generation: Long, val owner: String?, val epoch: Long, val external: Boolean) {
    fun current(generation: Long, owner: String?, epoch: Long, muted: Boolean, processingAllowed: Boolean): Boolean =
        this.generation == generation && this.owner == owner && this.epoch == epoch && !muted && (!external || processingAllowed)
}

/** Owns only this IO operation's file until Main explicitly accepts it for playback. */
internal class PendingAudioFile {
    private var owned: File? = null
    fun write(directory: File, bytes: ByteArray) {
        check(owned == null)
        val local = File.createTempFile("bobby-briefing-", ".mp3", directory)
        owned = local
        local.writeBytes(bytes)
    }
    fun publish(current: () -> Boolean): File {
        check(current())
        val file = owned ?: error("Audio file is unavailable")
        owned = null
        return file
    }
    fun close() { owned?.delete(); owned = null }
}
