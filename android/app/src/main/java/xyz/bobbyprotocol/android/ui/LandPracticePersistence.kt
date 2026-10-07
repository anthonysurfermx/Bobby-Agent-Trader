package xyz.bobbyprotocol.android.ui

import xyz.bobbyprotocol.android.data.AccountFence
import xyz.bobbyprotocol.android.data.AccountVersion

internal enum class PracticePersistenceError { OWNER_CHANGED, RISK_REQUIRED, NOT_LOADED, STALE_STATE, STORAGE_FAILED, INVALID_STATE }
internal sealed interface PracticePersistenceResult {
    data class Loaded(val state: LandPracticeState) : PracticePersistenceResult
    data class Committed(val state: LandPracticeState) : PracticePersistenceResult
    data class Rejected(val error: PracticePersistenceError) : PracticePersistenceResult
}

/** Guest persistence shares the repository's identity lock; no account layout or account key is accepted. */
internal class LandPracticePersistence(
    private val currentAccount: () -> AccountVersion,
    private val riskAccepted: () -> Boolean,
    private val read: (String) -> String?,
    private val write: (String, String) -> Boolean,
    private val lock: Any = AccountFence.lock,
) {
    private var loadedFor: AccountVersion? = null
    private var loadedState: LandPracticeState? = null
    private fun guard(expected: AccountVersion): PracticePersistenceError? {
        if (expected.userId != null || runCatching { currentAccount() }.getOrNull() != expected) return PracticePersistenceError.OWNER_CHANGED
        if (!runCatching(riskAccepted).getOrDefault(false)) return PracticePersistenceError.RISK_REQUIRED
        return null
    }
    fun load(expected: AccountVersion, catalog: Map<String, PracticeFootprint>, fixture: LandPracticeState): PracticePersistenceResult = synchronized(lock) {
        guard(expected)?.let { return@synchronized PracticePersistenceResult.Rejected(it) }
        if (loadedFor == expected && loadedState != null) return@synchronized PracticePersistenceResult.Loaded(loadedState!!)
        val saved = try { read(preferenceKey) } catch (_: Exception) {
            return@synchronized PracticePersistenceResult.Rejected(PracticePersistenceError.STORAGE_FAILED)
        }
        guard(expected)?.let { return@synchronized PracticePersistenceResult.Rejected(it) }
        val state = LandPractice.load(saved, catalog, fixture)
        guard(expected)?.let { return@synchronized PracticePersistenceResult.Rejected(it) }
        loadedFor = expected; loadedState = state
        PracticePersistenceResult.Loaded(state)
    }
    fun commit(
        expected: AccountVersion,
        previous: LandPracticeState,
        next: LandPracticeState,
        catalog: Map<String, PracticeFootprint>,
        onCommitted: (LandPracticeState) -> Unit = {},
    ): PracticePersistenceResult = synchronized(lock) {
        guard(expected)?.let { return@synchronized PracticePersistenceResult.Rejected(it) }
        if (loadedFor != expected || loadedState == null) return@synchronized PracticePersistenceResult.Rejected(PracticePersistenceError.NOT_LOADED)
        if (loadedState != previous) return@synchronized PracticePersistenceResult.Rejected(PracticePersistenceError.STALE_STATE)
        if (next.focusLevel !in 1..2 || next.history.size > 10 || next.placements.size > 60) return@synchronized PracticePersistenceResult.Rejected(PracticePersistenceError.INVALID_STATE)
        val encoded = LandPractice.encode(next)
        val clean = LandPractice.load(encoded, catalog, previous)
        if (clean.placements != next.placements || clean.focusLevel != next.focusLevel) return@synchronized PracticePersistenceResult.Rejected(PracticePersistenceError.INVALID_STATE)
        guard(expected)?.let { return@synchronized PracticePersistenceResult.Rejected(it) }
        val durable = try { write(preferenceKey, encoded) } catch (_: Exception) { false }
        guard(expected)?.let { return@synchronized PracticePersistenceResult.Rejected(it) }
        if (!durable) return@synchronized PracticePersistenceResult.Rejected(PracticePersistenceError.STORAGE_FAILED)
        loadedState = next
        // Root's UI application can run under the same identity fence, after durability is confirmed.
        onCommitted(next)
        PracticePersistenceResult.Committed(next)
    }
    companion object { const val preferenceKey = "practice-world.v1.guest" }
}
