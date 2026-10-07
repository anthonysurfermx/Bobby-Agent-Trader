package xyz.bobbyprotocol.android.data

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

class AccountFenceTest {
    @Test fun aColdRepositoryCannotReplaceTheNextOwnersSession() {
        val ownerA = AccountVersion("account-a", 4)
        val started = CountDownLatch(1)
        val replacement = CountDownLatch(1)
        val persisted = AtomicReference(ownerA)
        val writes = AtomicInteger(0)
        val failure = AtomicReference<Throwable?>()
        val refresh = thread {
            started.countDown()
            check(replacement.await(2, TimeUnit.SECONDS))
            runCatching {
                synchronized(AccountFence.lock) {
                    AccountFence.requireCurrent(ownerA, ownerA, persisted.get())
                    writes.incrementAndGet()
                }
            }.onFailure(failure::set)
        }
        assertTrue(started.await(2, TimeUnit.SECONDS))
        synchronized(AccountFence.lock) { persisted.set(AccountVersion("account-b", 5)) }
        replacement.countDown()
        refresh.join(2_000)
        assertFalse(refresh.isAlive)
        assertTrue(failure.get() is AccountChangedException)
        assertEquals(0, writes.get())
    }

    @Test fun aSameOwnerNewEpochStillCancelsAnOldRefreshOrDelete() {
        reject(AccountVersion("a", 3), AccountVersion("a", 3), AccountVersion("a", 4))
        reject(AccountVersion("a", 3), AccountVersion("a", 4), AccountVersion("a", 4))
    }

    @Test fun persistedLogoutOrMissingIdentityCannotBeResurrected() {
        reject(AccountVersion("a", 3), AccountVersion("a", 3), AccountVersion(null, 4))
        reject(AccountVersion("a", 3), AccountVersion("a", 3), AccountVersion(null, 3))
    }

    @Test fun credentialRotationKeepsTheSameAccountVersionAndGuestReadsRemainValid() {
        val owner = AccountVersion("a", 3)
        AccountFence.requireCurrent(owner, owner, owner)
        val guest = AccountVersion(null, 0)
        AccountFence.requireCurrent(guest, guest, guest)
    }

    private fun reject(expected: AccountVersion, memory: AccountVersion, persisted: AccountVersion) {
        try { AccountFence.requireCurrent(expected, memory, persisted); fail("A stale repository was accepted") }
        catch (_: AccountChangedException) { }
    }
}
