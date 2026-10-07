package xyz.bobbyprotocol.android.push

import org.json.JSONObject
import java.util.UUID

class PushConfiguration(
    val enabled: Boolean = false,
    val projectId: String = "",
    val applicationId: String = "",
    val senderId: String = "",
    val apiKey: String = "",
    val packageName: String = "xyz.bobbyprotocol.bobby",
) {
    val configured: Boolean get() = enabled && packageName == "xyz.bobbyprotocol.bobby" &&
        projectId.matches(Regex("[a-z][a-z0-9-]{4,28}[a-z0-9]")) &&
        applicationId.matches(Regex("1:[0-9]+:android:[0-9a-fA-F]{16,64}")) &&
        senderId.matches(Regex("[0-9]{6,22}")) && apiKey.matches(Regex("AIza[A-Za-z0-9_-]{35}"))
    override fun toString(): String = "PushConfiguration(configured=$configured)"
}

data class PushEligibility(
    val ownerUserId: String?, val epoch: Long,
    val riskAccepted: Boolean, val notifyEnabled: Boolean, val permissionGranted: Boolean,
) {
    val eligible: Boolean get() = ownerUserId != null && riskAccepted && notifyEnabled && permissionGranted
    fun sameOwner(other: PushEligibility): Boolean = ownerUserId == other.ownerUserId && epoch == other.epoch
}

/** No bearer or installation proof is present in the received data-only payload. */
data class BriefingPush(
    val briefId: String, val registrationId: String, val bindingRevision: Long, val expiresAtSeconds: Long,
)

object PushPolicy {
    private val uuid = Regex("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
    private val fields = setOf("v", "kind", "briefId", "registrationId", "bindingRevision", "expiresAt")

    fun validUuid(value: String): Boolean = uuid.matches(value) && runCatching { UUID.fromString(value) }.isSuccess

    fun capability(json: JSONObject, configuration: PushConfiguration): Boolean {
        if (!configuration.configured || json.opt("registrationVersion") != 2) return false
        val fcm = json.optJSONObject("providers")?.optJSONObject("fcm") ?: return false
        val targets = fcm.optJSONArray("targets") ?: return false
        return fcm.opt("available") == true && fcm.opt("projectId") == configuration.projectId &&
            fcm.opt("packageName") == configuration.packageName && (0 until targets.length()).any { targets.opt(it) == "fid" }
    }

    fun serverOptIn(json: JSONObject): Boolean {
        val settings = json.optJSONObject("settings") ?: json
        return settings.opt("weeklyEnabled") == true && settings.opt("analysisConsentEnabled") == true &&
            settings.opt("analysisConsentVersion") == 1
    }

    fun parse(data: Map<String, String>, nowSeconds: Long): BriefingPush? {
        if (data.keys != fields || data["v"] != "1" || data["kind"] != "briefing") return null
        val brief = data["briefId"]?.takeIf(::validUuid) ?: return null
        val registration = data["registrationId"]?.takeIf(::validUuid) ?: return null
        val revision = data["bindingRevision"]?.toLongOrNull()?.takeIf { it > 0 } ?: return null
        val expiry = data["expiresAt"]?.toLongOrNull() ?: return null
        if (expiry <= nowSeconds || expiry - nowSeconds !in 1..604_800L) return null
        return BriefingPush(brief.lowercase(), registration.lowercase(), revision, expiry)
    }

    fun canPresent(push: BriefingPush, registrationId: String, revision: Long, bindingOwner: String,
                   bindingEpoch: Long, eligibility: PushEligibility, nowSeconds: Long): Boolean =
        eligibility.eligible && eligibility.ownerUserId == bindingOwner && eligibility.epoch == bindingEpoch &&
            push.registrationId == registrationId && push.bindingRevision == revision && push.expiresAtSeconds > nowSeconds

    fun validFid(value: String): Boolean = value.matches(Regex("[A-Za-z0-9_-]{1,256}"))
}
