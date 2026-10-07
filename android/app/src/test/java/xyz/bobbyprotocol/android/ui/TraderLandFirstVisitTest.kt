package xyz.bobbyprotocol.android.ui

import org.junit.Assert.*
import org.junit.Test
import xyz.bobbyprotocol.android.data.AccountVersion
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class TraderLandFirstVisitTest {
    @Test fun firstVisibleVisitIsDurableAcrossControllerRecreation() {
        val state = mutableMapOf<String, Boolean>()
        val guest = AccountVersion(null, 0)
        fun controller() = TraderLandFirstVisit({ state[it] == true }, { state[it] = true; true }, { guest })
        assertTrue(controller().claim(guest, screenVisible = true, canPresent = true))
        assertFalse(controller().claim(guest, screenVisible = true, canPresent = true))
        assertEquals(1, state.size)
    }

    @Test fun guestAndEveryAccountKeepSeparateVisitsWithoutInheritingGuestState() {
        val state = mutableMapOf<String, Boolean>()
        var current = AccountVersion(null, 0)
        val firstVisit = TraderLandFirstVisit({ state[it] == true }, { state[it] = true; true }, { current })
        assertTrue(firstVisit.claim(current, true, true))
        current = AccountVersion("account-a", 1)
        assertTrue(firstVisit.claim(current, true, true))
        current = AccountVersion("account-b", 2)
        assertTrue(firstVisit.claim(current, true, true))
        current = AccountVersion(null, 3)
        assertFalse(firstVisit.claim(current, true, true))
        current = AccountVersion("account-a", 4)
        assertFalse(firstVisit.claim(current, true, true))
        assertEquals(3, state.size)
    }

    @Test fun offscreenAndOverlappingDialogsLeaveTheVisitUnspent() {
        val state = mutableMapOf<String, Boolean>()
        val owner = AccountVersion("account-a", 3)
        val firstVisit = TraderLandFirstVisit({ state[it] == true }, { state[it] = true; true }, { owner })
        assertFalse(firstVisit.claim(owner, screenVisible = false, canPresent = true))
        assertFalse(firstVisit.claim(owner, screenVisible = true, canPresent = false))
        assertTrue(state.isEmpty())
        assertTrue(firstVisit.claim(owner, screenVisible = true, canPresent = true))
    }

    @Test fun anAccountSwitchOrSameAccountNewEpochRejectsTheStaleVisit() {
        val state = mutableMapOf<String, Boolean>()
        val captured = AccountVersion("account-a", 3)
        var current = AccountVersion("account-b", 4)
        val firstVisit = TraderLandFirstVisit({ state[it] == true }, { state[it] = true; true }, { current })
        assertFalse(firstVisit.claim(captured, true, true))
        current = captured.copy(epoch = 5)
        assertFalse(firstVisit.claim(captured, true, true))
        assertTrue(state.isEmpty())
        assertTrue(firstVisit.claim(current, true, true))
    }

    @Test fun aFailedPersistenceWriteNeverConsumesTheVisit() {
        val state = mutableMapOf<String, Boolean>()
        val owner = AccountVersion(null, 0)
        var mode = 0
        val firstVisit = TraderLandFirstVisit({ state[it] == true }, {
            when (mode) { 0 -> false; 1 -> throw IllegalStateException("Storage unavailable"); else -> { state[it] = true; true } }
        }, { owner })
        assertFalse(firstVisit.claim(owner, true, true))
        mode = 1
        assertFalse(firstVisit.claim(owner, true, true))
        assertTrue(state.isEmpty())
        mode = 2
        assertTrue(firstVisit.claim(owner, true, true))
        assertFalse(firstVisit.claim(owner, true, true))
    }

    @Test fun accountPreferenceKeysAreBoundedAndCannotCollideWithTheGuestNamespace() {
        val guest = TraderLandFirstVisit.preferenceKey(null)
        val owners = listOf("guest", "local", "../guest", "account-a", "account-b")
        val keys = owners.map { TraderLandFirstVisit.preferenceKey(it) }
        assertEquals(keys.size, keys.toSet().size)
        keys.forEach { key ->
            assertNotEquals(guest, key)
            assertTrue(key.matches(Regex("first-visit\\.v1\\.account\\.[a-f0-9]{64}")))
        }
        assertEquals(keys[3], TraderLandFirstVisit.preferenceKey("account-a"))
    }

    @Test fun simultaneousControllersOnlyPersistAndClaimOneVisit() {
        val state = mutableMapOf<String, Boolean>()
        val owner = AccountVersion("account-a", 3)
        var writes = 0
        fun controller() = TraderLandFirstVisit({ state[it] == true }, { state[it] = true; writes++; true }, { owner })
        val ready = CountDownLatch(2)
        val go = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val claims = (1..2).map {
                pool.submit(Callable { ready.countDown(); assertTrue(go.await(5, TimeUnit.SECONDS)); controller().claim(owner, true, true) })
            }
            assertTrue(ready.await(5, TimeUnit.SECONDS))
            go.countDown()
            assertEquals(1, claims.count { it.get(5, TimeUnit.SECONDS) })
            assertEquals(1, writes)
        } finally { go.countDown(); pool.shutdownNow() }
    }
}
