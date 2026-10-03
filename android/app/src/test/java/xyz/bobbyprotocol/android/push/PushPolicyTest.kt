package xyz.bobbyprotocol.android.push

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class PushPolicyTest {
    private val config = PushConfiguration(true, "test-project", "1:123456789:android:abcdef0123456789", "123456789", "AIza" + "x".repeat(35))
    private val registration = "11111111-1111-4111-8111-111111111111"
    private val brief = "22222222-2222-4222-8222-222222222222"
    private val eligible = PushEligibility("owner-a", 3, true, true, true)

    @Test fun missingConfigOrAnyUserGateDisablesRegistration() {
        assertFalse(PushConfiguration().configured)
        assertTrue(config.configured)
        assertFalse(PushConfiguration(true, config.projectId, config.applicationId, config.senderId, config.apiKey, "evil.app").configured)
        assertTrue(eligible.eligible)
        listOf(eligible.copy(ownerUserId = null), eligible.copy(riskAccepted = false),
            eligible.copy(notifyEnabled = false), eligible.copy(permissionGranted = false)).forEach { assertFalse(it.eligible) }
    }

    @Test fun onlyMatchingExplicitFidCapabilityCanInitializeTheSdk() {
        val reply = capability()
        assertTrue(PushPolicy.capability(reply, config))
        assertFalse(PushPolicy.capability(JSONObject(), config))
        reply.getJSONObject("providers").getJSONObject("fcm").put("available", "true")
        assertFalse(PushPolicy.capability(reply, config))
        assertFalse(PushPolicy.capability(capability("another-project"), config))
        val legacy = capability(); legacy.put("registrationVersion", 1)
        assertFalse(PushPolicy.capability(legacy, config))
    }

    @Test fun malformedExpiredOrPrivateDataPayloadsCannotShowNotifications() {
        assertNotNull(PushPolicy.parse(packet(), 1000))
        listOf(packet() + ("expiresAt" to "1000"), packet() + ("expiresAt" to "999999999999999999999"),
            packet() + ("bindingRevision" to "0"), packet() + ("briefId" to "fake-report"),
            packet() + ("body" to "Private report"), packet() + ("owner" to "owner-a")).forEach {
            assertNull(PushPolicy.parse(it, 1000))
        }
    }

    @Test fun oldOwnerRevisionEpochAndWithdrawalAreRejectedLocally() {
        val push = PushPolicy.parse(packet(), 1000)!!
        assertTrue(PushPolicy.canPresent(push, registration, 2, "owner-a", 3, eligible, 1000))
        listOf(eligible.copy(ownerUserId = "owner-b"), eligible.copy(epoch = 4), eligible.copy(ownerUserId = null),
            eligible.copy(riskAccepted = false), eligible.copy(notifyEnabled = false), eligible.copy(permissionGranted = false)).forEach {
            assertFalse(PushPolicy.canPresent(push, registration, 2, "owner-a", 3, it, 1000))
        }
        assertFalse(PushPolicy.canPresent(push, registration, 3, "owner-a", 3, eligible, 1000))
        assertFalse(PushPolicy.canPresent(push, registration, 2, "owner-a", 3, eligible, 2001))
    }

    @Test fun opaqueFidIsBoundedAndNeverAcceptedWithControls() {
        assertTrue(PushPolicy.validFid("c123456789ABCDEFGHIJKL"))
        listOf("", "x".repeat(257), "fid\nInjected", "white space").forEach { assertFalse(PushPolicy.validFid(it)) }
        assertFalse(config.toString().contains(config.apiKey))
    }

    @Test fun currentServerAnalysisConsentAndWeeklyOptInAreRequired() {
        val settings = JSONObject().put("weeklyEnabled", true).put("analysisConsentEnabled", true).put("analysisConsentVersion", 1)
        assertTrue(PushPolicy.serverOptIn(settings))
        assertTrue(PushPolicy.serverOptIn(JSONObject().put("settings", settings)))
        for (field in listOf("weeklyEnabled", "analysisConsentEnabled", "analysisConsentVersion")) {
            assertFalse(PushPolicy.serverOptIn(JSONObject(settings.toString()).put(field, "true")))
            assertFalse(PushPolicy.serverOptIn(JSONObject(settings.toString()).apply { remove(field) }))
        }
        assertFalse(PushPolicy.serverOptIn(JSONObject(settings.toString()).put("analysisConsentVersion", 0)))
    }

    private fun capability(project: String = config.projectId) = JSONObject().put("registrationVersion", 2).put("providers",
        JSONObject().put("fcm", JSONObject().put("available", true).put("projectId", project).put("packageName", config.packageName)
            .put("targets", JSONArray().put("fid"))))
    private fun packet() = mapOf("v" to "1", "kind" to "briefing", "briefId" to brief, "registrationId" to registration,
        "bindingRevision" to "2", "expiresAt" to "2000")
}
