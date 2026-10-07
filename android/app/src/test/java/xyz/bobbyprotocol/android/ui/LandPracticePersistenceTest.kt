package xyz.bobbyprotocol.android.ui

import org.junit.Assert.*
import org.junit.Test
import xyz.bobbyprotocol.android.data.AccountVersion
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class LandPracticePersistenceTest {
    private val catalog = mapOf("dock" to PracticeFootprint(1, 1))
    private val fixture = LandPracticeState(emptyList(), 2)
    private val guest = AccountVersion(null, 3)
    private val next = LandPracticeState(listOf(PracticePlacement("one", "dock", 0, 0)), 2,
        listOf(PracticeSnapshot(fixture.placements, fixture.focusLevel)))
    private fun rejected(error: PracticePersistenceError, result: PracticePersistenceResult) = assertEquals(error, (result as PracticePersistenceResult.Rejected).error)

    @Test fun guestLoadUsesOnlyGuestKeyAndNeverWrites() {
        var writes = 0
        val adapter = LandPracticePersistence({ guest }, { true }, { assertEquals("practice-world.v1.guest", it); null }, { _, _ -> writes++; true })
        assertEquals(fixture, (adapter.load(guest, catalog, fixture) as PracticePersistenceResult.Loaded).state)
        assertEquals(0, writes)
    }
    @Test fun signedInOrStaleEpochCannotReadOrCommitPractice() {
        var reads = 0; var writes = 0; var account = guest
        val adapter = LandPracticePersistence({ account }, { true }, { reads++; null }, { _, _ -> writes++; true })
        account = AccountVersion("account-a", 4)
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.load(guest, catalog, fixture))
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.load(account, catalog, fixture))
        account = AccountVersion(null, 5)
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.commit(guest, fixture, next, catalog))
        assertEquals(0, reads); assertEquals(0, writes)
    }
    @Test fun riskConsentRequiredForBothReadAndWrite() {
        var risk = false; var reads = 0; var writes = 0
        val adapter = LandPracticePersistence({ guest }, { risk }, { reads++; null }, { _, _ -> writes++; true })
        rejected(PracticePersistenceError.RISK_REQUIRED, adapter.load(guest, catalog, fixture))
        risk = true; adapter.load(guest, catalog, fixture)
        risk = false; rejected(PracticePersistenceError.RISK_REQUIRED, adapter.commit(guest, fixture, next, catalog))
        assertEquals(1, reads); assertEquals(0, writes)
    }
    @Test fun changingOwnerDuringReadRejectsLoadedState() {
        var account = guest
        val adapter = LandPracticePersistence({ account }, { true }, { account = AccountVersion("account-a", 4); LandPractice.encode(next) }, { _, _ -> true })
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.load(guest, catalog, fixture))
        account = guest
        rejected(PracticePersistenceError.NOT_LOADED, adapter.commit(guest, fixture, next, catalog))
    }
    @Test fun successAppliesStateOnlyAfterDurableCommitAndAllowsRecreation() {
        var saved: String? = null; var applied = false
        val adapter = LandPracticePersistence({ guest }, { true }, { saved }, { key, value -> assertEquals(LandPracticePersistence.preferenceKey, key); saved = value; true })
        adapter.load(guest, catalog, fixture)
        val result = adapter.commit(guest, fixture, next, catalog) { assertNotNull(saved); applied = true }
        assertEquals(next, (result as PracticePersistenceResult.Committed).state); assertTrue(applied)
        val recreated = LandPracticePersistence({ guest }, { true }, { saved }, { _, _ -> true })
        val restored = (recreated.load(guest, catalog, fixture) as PracticePersistenceResult.Loaded).state
        assertEquals(next.placements, restored.placements); assertTrue(restored.history.isEmpty())
    }
    @Test fun failedOrThrowingWritesDoNotApplyOptimisticStateAndCanRetry() {
        var mode = 0; var applied = 0
        val adapter = LandPracticePersistence({ guest }, { true }, { null }, { _, _ -> when (mode) { 0 -> false; 1 -> throw IllegalStateException("Unavailable"); else -> true } })
        adapter.load(guest, catalog, fixture)
        repeat(2) { mode = it; rejected(PracticePersistenceError.STORAGE_FAILED, adapter.commit(guest, fixture, next, catalog) { applied++ }) }
        assertEquals(0, applied)
        mode = 2; assertTrue(adapter.commit(guest, fixture, next, catalog) { applied++ } is PracticePersistenceResult.Committed)
        assertEquals(1, applied)
    }
    @Test fun ownerSwitchDuringWriteNeverReturnsAcceptedOrAppliesTheUiState() {
        var account = guest; var applied = false
        val adapter = LandPracticePersistence({ account }, { true }, { null }, { _, _ -> account = AccountVersion("account-b", 4); true })
        adapter.load(guest, catalog, fixture)
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.commit(guest, fixture, next, catalog) { applied = true })
        assertFalse(applied)
    }
    @Test fun stalePreviousStateAndUnloadedStateNeverOverwriteSavedLayout() {
        var writes = 0
        val adapter = LandPracticePersistence({ guest }, { true }, { null }, { _, _ -> writes++; true })
        rejected(PracticePersistenceError.NOT_LOADED, adapter.commit(guest, fixture, next, catalog))
        adapter.load(guest, catalog, fixture); adapter.commit(guest, fixture, next, catalog)
        rejected(PracticePersistenceError.STALE_STATE, adapter.commit(guest, fixture, next, catalog))
        assertEquals(1, writes)
    }
    @Test fun invalidCandidateDoesNotPersistUnknownCoreOverlapOrBogusFocus() {
        var writes = 0
        val adapter = LandPracticePersistence({ guest }, { true }, { null }, { _, _ -> writes++; true })
        adapter.load(guest, catalog, fixture)
        for (bad in listOf(next.copy(focusLevel = 7), next.copy(placements = listOf(PracticePlacement("bad", "aura_core", 1, 1))),
            next.copy(placements = listOf(PracticePlacement("bad", "dock", 3, 3))), next.copy(placements = listOf(PracticePlacement("bad", "unknown", 1, 1))))) {
            rejected(PracticePersistenceError.INVALID_STATE, adapter.commit(guest, fixture, bad, catalog))
        }
        assertEquals(0, writes)
    }
    @Test fun preferenceReadFailureIsNotTreatedAsAnEmptySavedIsland() {
        val adapter = LandPracticePersistence({ guest }, { true }, { throw IllegalStateException("Unavailable") }, { _, _ -> true })
        rejected(PracticePersistenceError.STORAGE_FAILED, adapter.load(guest, catalog, fixture))
        rejected(PracticePersistenceError.NOT_LOADED, adapter.commit(guest, fixture, next, catalog))
    }
    @Test fun concurrentCommitsOnlyAcceptOneStateDerivedFromTheSameSnapshot() {
        var writes = 0
        val adapter = LandPracticePersistence({ guest }, { true }, { null }, { _, _ -> writes++; true })
        adapter.load(guest, catalog, fixture)
        val ready = CountDownLatch(2); val go = CountDownLatch(1); val pool = Executors.newFixedThreadPool(2)
        try {
            val results = (1..2).map { pool.submit(Callable { ready.countDown(); assertTrue(go.await(3, TimeUnit.SECONDS)); adapter.commit(guest, fixture, next, catalog) }) }
            assertTrue(ready.await(3, TimeUnit.SECONDS)); go.countDown()
            val actual = results.map { it.get(3, TimeUnit.SECONDS) }
            assertEquals(1, actual.count { it is PracticePersistenceResult.Committed })
            assertEquals(1, actual.count { it is PracticePersistenceResult.Rejected && it.error == PracticePersistenceError.STALE_STATE })
            assertEquals(1, writes)
        } finally { go.countDown(); pool.shutdownNow() }
    }
    @Test fun guestLayoutStaysLocalAcrossSignInAndReturnsOnlyUnderFreshGuestEpoch() {
        val saved = LandPractice.encode(next); var account = guest; var reads = 0
        val adapter = LandPracticePersistence({ account }, { true }, { reads++; saved }, { _, _ -> true })
        adapter.load(guest, catalog, fixture)
        account = AccountVersion("account-a", 4)
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.load(account, catalog, fixture))
        account = AccountVersion(null, 5)
        val fresh = (adapter.load(account, catalog, fixture) as PracticePersistenceResult.Loaded).state
        assertEquals(next.placements, fresh.placements); assertEquals(2, reads)
        rejected(PracticePersistenceError.OWNER_CHANGED, adapter.commit(guest, fresh, fixture, catalog))
    }
}
