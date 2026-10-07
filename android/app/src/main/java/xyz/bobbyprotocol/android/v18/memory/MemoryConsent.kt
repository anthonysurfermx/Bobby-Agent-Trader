package xyz.bobbyprotocol.android.v18.memory

import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import java.security.MessageDigest
import java.util.Locale

// The memory consent (1.8), a port of ios/Bobby/Sources/V18/Memory/MemoryConsent.swift: what the
// person answered when Bobby asked "Remember this?", and the steps that turn memory on when they
// say yes.
//
// The answer is a record per account and per phone: {version, decidedAt, accepted}. It lives in
// the `bobby.v18` store under the SHA-256 of the account id, so signing out never carries one
// account's answer to another and the id itself is never in a key. A decline is remembered so the
// offer does not nag; a new consent version asks again.
//
// The record gates capture. The transport adds the opt-in header to a desk question whenever this
// account's stored switch is on, so `MemoryCenter` keeps that switch truthful: it is on only under
// this account's "accepted" record for the consent as it reads today. A switch without that record
// (the 1.1.4 switch, or an answer to an older version of the text) is turned off the moment it is
// read, before any question leaves, and the person is asked again through the sheet.

data class MemoryConsentRecord(val version: Int, val decidedAtMillis: Long, val accepted: Boolean)

class MemoryConsent(
    private val store: KeyValueStore,
    /** The consent as it reads today. Tests pass a later one to stand for a reworded sheet. */
    val version: Int = CURRENT_VERSION,
) {
    /** The last answer this account gave on this phone, whatever its version. */
    fun record(user: String): MemoryConsentRecord? {
        val raw = store.getString(key(user)) ?: return null
        return try {
            val json = JSONObject(raw)
            val version = (json.opt("version") as? Number)?.toInt() ?: return null
            val decidedAt = (json.opt("decidedAt") as? Number)?.toLong() ?: return null
            val accepted = json.opt("accepted") as? Boolean ?: return null
            MemoryConsentRecord(version, decidedAt, accepted)
        } catch (_: Exception) {
            null
        }
    }

    /** True once the account answered the consent as it reads today (yes or no). */
    fun hasDecided(user: String): Boolean = record(user)?.version == version

    /** True only for a yes to the consent as it reads today. This is what capture is gated on. */
    fun hasAccepted(user: String): Boolean {
        val record = record(user) ?: return false
        return record.version == version && record.accepted
    }

    fun set(accepted: Boolean, user: String, atMillis: Long) {
        store.putString(key(user), JSONObject().put("version", version).put("decidedAt", atMillis).put("accepted", accepted).toString())
    }

    fun clear(user: String) {
        store.remove(key(user))
    }

    companion object {
        /** Bump when what the consent sheet says changes: everyone is asked again. */
        const val CURRENT_VERSION = 1
        const val KEY_PREFIX = "v18.memoryConsent."

        fun key(user: String): String = KEY_PREFIX + digest(user)

        /** The SHA-256 of the account id in lowercase hex: what every per-account memory key on this phone is built from. */
        fun digest(user: String): String {
            val bytes = MessageDigest.getInstance("SHA-256").digest(user.toByteArray(Charsets.UTF_8))
            val hex = StringBuilder()
            for (byte in bytes) hex.append(String.format(Locale.ROOT, "%02x", byte.toInt() and 0xff))
            return hex.toString()
        }
    }
}

/**
 * The consent sheet's two answers. Every step is fenced to the account that tapped: a reply that
 * arrives after the account changed turns nothing on and records nothing.
 */
class MemoryConsentModel(val center: MemoryCenter, private val now: () -> Long = { center.now() }) {
    enum class Phase {
        ASKING,
        WORKING,
        /** A step failed; nothing was turned on. The sheet says so and the person may try again. */
        FAILED,
        /** Memory is on for this account on this phone. */
        DONE,
    }

    /** Goes up on every change the screen should redraw for. */
    val changes = MutableStateFlow(0)

    var phase: Phase = Phase.ASKING
        private set

    /** The centre's own store and version: the record written here is the one its gate reads. */
    val consent: MemoryConsent get() = center.consent
    val signedIn: Boolean get() = center.currentUser() != null
    /** The server's own number when the memory screen already loaded it; its documented default otherwise. */
    val retentionDays: Int get() = center.snapshot?.retentionDays ?: 90

    /** The account under the sheet changed: whatever it showed belonged to the previous one. */
    fun accountChanged() {
        center.accountChanged()
        set(Phase.ASKING)
    }

    /**
     * "Remember", in order, stopping at the first step that fails:
     * read the account's memory, resume it if it is paused, opt this phone in, record the answer.
     */
    suspend fun remember(): Boolean {
        if (phase == Phase.WORKING || phase == Phase.DONE) return false
        val user = center.currentUser()
        if (user == null) {
            set(Phase.FAILED)
            return false
        }
        val epoch = center.currentEpoch()
        val sameAccount = { center.currentUser() == user && center.currentEpoch() == epoch }
        set(Phase.WORKING)
        if (!center.refresh() || !sameAccount()) return stop(sameAccount())
        if (center.snapshot?.enabled != true) {
            if (!center.setEnabled(true) || !sameAccount() || center.snapshot?.enabled != true) return stop(sameAccount())
        }
        if (!center.setNativeCapture(true) || !sameAccount()) return stop(sameAccount())
        consent.set(true, user, now())
        set(Phase.DONE)
        return true
    }

    /** "Not now": remembered so the offer does not come back, and this phone stays out of memory. */
    fun decline() {
        if (phase == Phase.WORKING) return
        val user = center.currentUser() ?: return
        center.setNativeCapture(false)
        consent.set(false, user, now())
    }

    private fun stop(sameAccount: Boolean): Boolean {
        // A different account is now under the sheet: it sees the question, not the other's failure.
        set(if (sameAccount) Phase.FAILED else Phase.ASKING)
        return false
    }

    private fun set(next: Phase) {
        phase = next
        changes.value = changes.value + 1
    }
}
