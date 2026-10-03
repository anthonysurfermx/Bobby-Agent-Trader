package xyz.bobbyprotocol.android.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class AccountDeletionPolicyTest {
    @Test fun bothAppleServerPathsRequireHonestManualInstructionsOnAndroid() {
        assertEquals("1", AccountDeletionPolicy.CLIENT_VERSION)
        assertTrue(requirements(true, false).requiresManualAppleRevocation)
        assertTrue(requirements(false, true).requiresManualAppleRevocation)
        assertFalse(requirements(false, false).requiresManualAppleRevocation)
    }

    @Test fun malformedRequirementsNeverSkipTheAppleWarning() {
        listOf(JSONObject(), JSONObject().put("appleAuthorizationRequired", "false").put("manualAppleRevocation", false),
            JSONObject().put("appleAuthorizationRequired", false).put("manualAppleRevocation", JSONObject.NULL)).forEach {
            assertThrows(ApiException::class.java) { AccountDeletionPolicy.requirements(it, "owner-a", 7) }
        }
    }

    @Test fun confirmationCannotMoveToAnotherAccountOrANewerSession() {
        val ticket = requirements(true, false)
        AccountDeletionPolicy.requireOwner(ticket, "owner-a", 7)
        listOf("owner-b" to 7L, "owner-a" to 8L, null to 7L).forEach { (owner, epoch) ->
            assertThrows(AccountChangedException::class.java) { AccountDeletionPolicy.requireOwner(ticket, owner, epoch) }
        }
    }

    @Test fun httpSuccessWithoutStrictOkCannotAuthorizeLocalLogout() {
        listOf(JSONObject(), JSONObject().put("ok", false), JSONObject().put("ok", "true"), JSONObject().put("ok", 1)).forEach {
            val error = assertThrows(ApiException::class.java) { AccountDeletionPolicy.confirmedResponse(it) }
            assertEquals("account_deletion_unconfirmed", error.code)
        }
    }

    @Test fun manualDeletionKeepsOnlyTheOfficialInstructionsUrl() {
        val source = JSONObject().put("ok", true).put("appleRevocation", "manual").put("manualRevocationURL", "https://evil.test/")
        val safe = AccountDeletionPolicy.confirmedResponse(source)
        assertEquals("https://support.apple.com/en-us/102571", safe.getString("manualRevocationURL"))
        assertEquals("manual", safe.getString("appleRevocation"))
        assertEquals("https://evil.test/", source.getString("manualRevocationURL"))
    }

    @Test fun nonAppleSuccessDoesNotOfferAnArbitraryResponseLink() {
        val safe = AccountDeletionPolicy.confirmedResponse(JSONObject().put("ok", true).put("appleRevocation", "not_applicable")
            .put("manualRevocationURL", "https://evil.test/"))
        assertEquals(true, safe.getBoolean("ok"))
        assertFalse(safe.has("manualRevocationURL"))
    }

    private fun requirements(automatic: Boolean, manual: Boolean) = AccountDeletionPolicy.requirements(
        JSONObject().put("appleAuthorizationRequired", automatic).put("manualAppleRevocation", manual), "owner-a", 7)
}
