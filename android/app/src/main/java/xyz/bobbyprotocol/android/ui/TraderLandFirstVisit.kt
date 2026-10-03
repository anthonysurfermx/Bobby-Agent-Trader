package xyz.bobbyprotocol.android.ui

import xyz.bobbyprotocol.android.data.AccountFence
import xyz.bobbyprotocol.android.data.AccountVersion
import java.security.MessageDigest

/** A local help receipt is separate from progress, consent and island ownership. */
internal class TraderLandFirstVisit(
    private val wasShown: (String) -> Boolean,
    private val saveShown: (String) -> Boolean,
    private val currentAccount: () -> AccountVersion,
) {
    fun claim(expected: AccountVersion, screenVisible: Boolean, canPresent: Boolean): Boolean = synchronized(AccountFence.lock) {
        if (!screenVisible || !canPresent || expected != currentAccount()) return@synchronized false
        val key = preferenceKey(expected.userId)
        if (runCatching { wasShown(key) }.getOrDefault(false)) return@synchronized false
        // A failed durable write leaves the visit available for a later attempt.
        runCatching { saveShown(key) }.getOrDefault(false)
    }

    companion object {
        fun preferenceKey(owner: String?): String {
            if (owner == null) return "first-visit.v1.guest"
            val digest = MessageDigest.getInstance("SHA-256").digest(owner.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }
            return "first-visit.v1.account.$digest"
        }
    }
}
