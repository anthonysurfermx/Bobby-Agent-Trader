package xyz.bobbyprotocol.android.nucleo

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ProfileProgressPolicyTest {
    @Test fun missingAuraIsUnknownAndAConfirmedZeroIsRealZero() {
        assertNull(ProfileProgressPolicy.aura(JSONObject()))
        assertNull(ProfileProgressPolicy.aura(JSONObject().put("aura", JSONObject.NULL)))
        assertEquals(0, ProfileProgressPolicy.aura(JSONObject().put("aura", 0)))
        assertEquals(25, ProfileProgressPolicy.aura(JSONObject().put("aura", 25)))
    }
    @Test fun malformedMetricsNeverBecomeZeroOrOverflow() {
        listOf("12", -1, 0.5, Double.NaN, Double.POSITIVE_INFINITY, Int.MAX_VALUE.toLong() + 1, true).forEach {
            assertNull(ProfileProgressPolicy.count(it))
        }
    }
    @Test fun anOwnerSwitchRejectsTheOldRequestEvenAtTheSameEpoch() {
        assertFalse(ProfileProgressPolicy.current("account-a", 3, "account-b", 3))
        assertFalse(ProfileProgressPolicy.current("account-a", 3, null, 3))
        assertFalse(ProfileProgressPolicy.current(null, 3, "account-a", 3))
        assertTrue(ProfileProgressPolicy.current("account-a", 3, "account-a", 3))
    }
    @Test fun aLaterEpochRejectsOldRepliesFromTheSameAccountOrGuest() {
        assertFalse(ProfileProgressPolicy.current("account-a", 3, "account-a", 4))
        assertFalse(ProfileProgressPolicy.current(null, 3, null, 4))
        assertTrue(ProfileProgressPolicy.current(null, 4, null, 4))
    }
    @Test fun applyingServerMetricsKeepsUnrelatedThesisAndAwardState() {
        val state = JSONObject().put("xp", 40).put("pending", "actual-ledger").put("aura", 5)
        ProfileProgressPolicy.applyMetrics(state, JSONObject().put("aura", 9).put("updatedAt", "2026-10-03T17:00:00Z"))
        assertEquals(9, ProfileProgressPolicy.aura(state))
        assertEquals(40, state.getInt("xp"))
        assertEquals("actual-ledger", state.getString("pending"))
        assertEquals("2026-10-03T17:00:00Z", state.getString("syncedAt"))
    }
    @Test fun olderPartialServersKeepKnownAuraAndInvalidNewAuraBecomesUnknown() {
        val state = JSONObject().put("aura", 5)
        ProfileProgressPolicy.applyMetrics(state, JSONObject().put("xp", 40))
        assertEquals(5, ProfileProgressPolicy.aura(state))
        ProfileProgressPolicy.applyMetrics(state, JSONObject().put("aura", -2))
        assertNull(ProfileProgressPolicy.aura(state))
    }
}
