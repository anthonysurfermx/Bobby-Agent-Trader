package xyz.bobbyprotocol.android.nucleo

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.ReadOrigin
import java.util.UUID

/**
 * The single-use tokens that carry a read on without the page naming an asset or a question again:
 * a confirmation, a retry, a level fallback, the question waiting behind a sign-in or the paywall,
 * and the question native starts (`ask.start`). A token is bound to the account moment and the
 * consent it was issued under and lives ten minutes. It also says who started the read, so a read
 * that is carried on is still the same person's question, or still Bobby's (`ReadOrigin`).
 */
internal class ReadTokens(
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val newId: () -> String = { UUID.randomUUID().toString() },
) {
    data class Entry(
        val asset: JSONObject, val question: String, val level: String, val epoch: Long, val consent: Long, val expiresAt: Long,
        /** Issued to a signed-out reader for the question that waits behind the sign-in: the only kind that follows them into the account. */
        val guestSignInRetry: Boolean, val persistLevel: Boolean, val origin: ReadOrigin,
    )

    private val entries = HashMap<String, Entry>()

    /** `guest`: nobody is signed in. `signInRetry`: this token is the question waiting behind the sign-in. */
    fun issue(asset: JSONObject, question: String, level: String, epoch: Long, consent: Long, guest: Boolean,
              signInRetry: Boolean = false, persist: Boolean = false, origin: ReadOrigin = ReadOrigin.PERSON): String {
        val now = clock()
        entries.entries.removeAll { it.value.expiresAt < now || it.value.epoch != epoch }
        val id = newId()
        entries[id] = Entry(asset, question, level, epoch, consent, now + NucleoPolicy.TOKEN_LIFETIME_MS, guest && signInRetry, persist, origin)
        return id
    }

    /** Used once: the token is gone whether or not it was still good. Null when it was never issued or was used already. */
    fun take(token: String): Entry? = entries.remove(token)

    /** Still good at `now` for this account moment and this consent. */
    fun good(entry: Entry, epoch: Long, consent: Long, now: Long = clock()): Boolean =
        entry.expiresAt > now && entry.epoch == epoch && entry.consent == consent

    /** The page has not asked with it yet, and it is still good. */
    fun waiting(token: String, epoch: Long, consent: Long): Boolean = entries[token]?.let { good(it, epoch, consent) } ?: false

    /**
     * A signed-out reader signed in. The question that waited behind the sign-in goes with them to
     * the account, with who started it; every other token stays behind.
     */
    fun signedIn(epoch: Long) {
        val now = clock()
        entries.entries.removeAll { !it.value.guestSignInRetry || it.value.expiresAt < now }
        for (key in entries.keys.toList()) entries[key] = entries.getValue(key).copy(epoch = epoch)
    }

    fun clear() = entries.clear()
}
