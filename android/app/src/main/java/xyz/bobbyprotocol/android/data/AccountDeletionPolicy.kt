package xyz.bobbyprotocol.android.data

import org.json.JSONObject

/** A confirmation is bound to the account and generation that fetched its requirements. */
class AccountDeletionRequirements internal constructor(
    val ownerUserId: String,
    val epoch: Long,
    val requiresManualAppleRevocation: Boolean,
)

object AccountDeletionPolicy {
    // Android's Supabase PKCE callback contains a Supabase code, not an unconsumed Apple code.
    // Account client 1 is the server's explicit manual Apple-revocation contract.
    const val CLIENT_VERSION = "1"
    const val APPLE_INSTRUCTIONS_URL = "https://support.apple.com/en-us/102571"

    fun requirements(json: JSONObject, ownerUserId: String, epoch: Long): AccountDeletionRequirements {
        val automatic = json.opt("appleAuthorizationRequired") as? Boolean
            ?: throw ApiException(502, "invalid_account_requirements")
        val manual = json.opt("manualAppleRevocation") as? Boolean
            ?: throw ApiException(502, "invalid_account_requirements")
        return AccountDeletionRequirements(ownerUserId, epoch, automatic || manual)
    }

    fun requireOwner(requirements: AccountDeletionRequirements, userId: String?, epoch: Long) {
        if (requirements.ownerUserId != userId || requirements.epoch != epoch) throw AccountChangedException()
    }

    /** A successful HTTP status alone never confirms deletion. Ignore arbitrary response URLs. */
    fun confirmedResponse(json: JSONObject): JSONObject {
        if (json.opt("ok") != true) throw ApiException(502, "account_deletion_unconfirmed", json)
        val result = JSONObject(json.toString())
        if (result.optString("appleRevocation") == "manual") {
            result.put("manualRevocationURL", APPLE_INSTRUCTIONS_URL)
        } else {
            result.remove("manualRevocationURL")
        }
        return result
    }
}
