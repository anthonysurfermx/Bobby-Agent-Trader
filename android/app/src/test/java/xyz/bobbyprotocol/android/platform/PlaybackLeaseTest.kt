package xyz.bobbyprotocol.android.platform

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import org.junit.Assert.*
import org.junit.Test
import java.nio.file.Files
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class PlaybackLeaseTest {
    @Test fun aPreparedCallbackFromAnOlderGenerationCannotStartTheNewAudio() {
        val old = PlaybackLease(1, "owner", 4, true)
        assertFalse(old.current(2, "owner", 4, false, true))
        assertTrue(PlaybackLease(2, "owner", 4, true).current(2, "owner", 4, false, true))
    }
    @Test fun accountSwitchOrRefreshInvalidatesPreparedAndCompletionCallbacks() {
        val lease = PlaybackLease(1, "owner-a", 4, true)
        assertFalse(lease.current(1, "owner-b", 4, false, true))
        assertFalse(lease.current(1, "owner-a", 5, false, true))
        assertFalse(lease.current(1, null, 4, false, true))
    }
    @Test fun generatedAudioDoesNotStartAfterMuteOrConsentWithdrawal() {
        val lease = PlaybackLease(1, null, 4, true)
        assertFalse(lease.current(1, null, 4, true, true))
        assertFalse(lease.current(1, null, 4, false, false))
        assertTrue(lease.current(1, null, 4, false, true))
    }
    @Test fun localPreviewNeedsNoExternalConsentButStillHonorsMuteAndIdentity() {
        val lease = PlaybackLease(1, null, 4, false)
        assertTrue(lease.current(1, null, 4, false, false))
        assertFalse(lease.current(1, null, 4, true, false))
        assertFalse(lease.current(1, "owner", 4, false, false))
        assertFalse(lease.current(2, null, 4, false, false))
    }
    @Test fun anUnpublishedFileIsDeletedWithoutDeletingANewerPublishedFile() {
        val dir = Files.createTempDirectory("bobby-audio-owner-test").toFile()
        try {
            val old = PendingAudioFile(); old.write(dir, byteArrayOf(1))
            val newer = PendingAudioFile(); newer.write(dir, byteArrayOf(2))
            val playing = newer.publish { true }
            old.close(); newer.close()
            assertTrue(playing.exists())
            assertArrayEquals(byteArrayOf(2), playing.readBytes())
            assertEquals(listOf(playing.name), dir.listFiles()!!.map { it.name })
        } finally { dir.deleteRecursively() }
    }
    @Test fun rejectingAFileAfterOwnershipChangesRetainsItOnlyUntilTheFinallyCleanup() {
        val dir = Files.createTempDirectory("bobby-audio-reject-test").toFile()
        try {
            val pending = PendingAudioFile(); pending.write(dir, byteArrayOf(1, 2))
            try { pending.publish { false }; fail("Rejected playback must not claim the file") }
            catch (_: IllegalStateException) { }
            assertEquals(1, dir.listFiles()!!.size)
            pending.close(); pending.close()
            assertTrue(dir.listFiles()!!.isEmpty())
        } finally { dir.deleteRecursively() }
    }
    @Test fun promptCancellationAtTheIOBoundaryCleansOnlyTheCancelledOperationsFile() = runBlocking {
        val dir = Files.createTempDirectory("bobby-audio-cancel-test").toFile()
        val wrote = CompletableDeferred<Unit>()
        val finishIO = CountDownLatch(1)
        try {
            val old = PendingAudioFile()
            val task = launch(Dispatchers.Unconfined) {
                try {
                    withContext(Dispatchers.Default) {
                        old.write(dir, byteArrayOf(1))
                        wrote.complete(Unit)
                        check(finishIO.await(5, TimeUnit.SECONDS))
                    }
                    old.publish { true }
                    fail("Cancellation must discard the IO result before publication")
                } finally { old.close() }
            }
            wrote.await()
            val newer = PendingAudioFile(); newer.write(dir, byteArrayOf(2))
            val current = newer.publish { true }
            task.cancel(); finishIO.countDown(); task.join()
            newer.close()
            assertTrue(current.exists())
            assertArrayEquals(byteArrayOf(2), current.readBytes())
            assertEquals(listOf(current.name), dir.listFiles()!!.map { it.name })
        } finally { finishIO.countDown(); dir.deleteRecursively() }
    }
}
