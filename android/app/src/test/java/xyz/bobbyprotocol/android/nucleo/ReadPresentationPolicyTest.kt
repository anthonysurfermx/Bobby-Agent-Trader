package xyz.bobbyprotocol.android.nucleo

import org.junit.Assert.*
import org.junit.Test

class ReadPresentationPolicyTest {
    private val first = "4bf44c4e-03e7-4a14-9420-d29499171001"
    private val second = "4bf44c4e-03e7-4a14-9420-d29499171002"
    private val owner = ReadPresentationPolicy.Identity(4, 2, "owner-a")

    private fun ready(): ReadPresentationPolicy = ReadPresentationPolicy().apply { begin(first, owner) }
    private fun observe(policy: ReadPresentationPolicy, id: String = first,
                        identity: ReadPresentationPolicy.Identity = owner, latest: String? = first,
                        foreground: Boolean = true, busy: Boolean = false, consent: Boolean = true) =
        policy.observe(id, identity, latest, foreground, busy, consent)

    @Test fun eligibleLatestVisibleReadIsObservedOnce() {
        val policy = ready()
        assertTrue(observe(policy))
        assertFalse(observe(policy))
    }
    @Test fun startingAnotherReadRetiresThePreviousObservation() {
        val policy = ready()
        policy.begin(second, owner)
        assertFalse(observe(policy))
        assertTrue(observe(policy, id = second, latest = second))
    }
    @Test fun oldOwnerAccountEpochOrConsentEpochCannotAcknowledge() {
        for (identity in listOf(owner.copy(owner = "owner-b"), owner.copy(owner = null),
            owner.copy(accountEpoch = 5), owner.copy(consentEpoch = 3))) assertFalse(observe(ready(), identity = identity))
    }
    @Test fun hiddenOrBusyOrUnconsentedFramesRemainUnobserved() {
        val policy = ready()
        assertFalse(observe(policy, foreground = false))
        assertFalse(observe(policy, busy = true))
        assertFalse(observe(policy, consent = false))
        assertTrue(observe(policy))
    }
    @Test fun onlyTheLatestCompletedReadCanBeObserved() {
        assertFalse(observe(ready(), latest = null))
        assertFalse(observe(ready(), latest = second))
        assertFalse(observe(ready(), id = second))
    }
    @Test fun invalidOrTruncatedIdsCannotBeObserved() {
        for (value in listOf("", "1-1-1-1-1", first + "x", first + "\n", "4bf44c4e-03e7-0a14-9420-d29499171001")) {
            assertFalse(ReadPresentationPolicy.validRequestId(value))
            assertFalse(observe(ready(), id = value))
        }
    }
    @Test fun clearedObservationsDoNotSurviveCancellationOrBackgroundReset() {
        val policy = ready()
        policy.clear()
        assertFalse(observe(policy))
    }
    @Test fun guestAndSignedInIdentitiesHaveSeparateObservations() {
        val guest = owner.copy(owner = null)
        val policy = ReadPresentationPolicy().apply { begin(first, guest) }
        assertFalse(observe(policy))
        assertTrue(observe(policy, identity = guest))
    }
}
