package xyz.bobbyprotocol.android.data

import java.util.UUID

/** Opaque outgoing-account capability. It cannot reveal a bearer or make arbitrary requests. */
class AccountCleanup internal constructor(
    val ownerUserId: String,
    private val revoke: suspend (String, Long, String) -> Unit,
) {
    suspend fun revokePushDevice(registrationId: String, bindingRevision: Long, proof: String) {
        require(registrationId.matches(Regex("[0-9a-fA-F-]{36}")) && runCatching { UUID.fromString(registrationId) }.isSuccess)
        require(bindingRevision > 0 && proof.matches(Regex("[A-Za-z0-9_-]{43}")))
        revoke(registrationId, bindingRevision, proof)
    }
    override fun toString(): String = "AccountCleanup(redacted)"
}
