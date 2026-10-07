package xyz.bobbyprotocol.android.nucleo

/** RAM-only client observation. It neither awards XP nor establishes server telemetry acceptance. */
class ReadPresentationPolicy {
    data class Identity(val accountEpoch: Long, val consentEpoch: Long, val owner: String?)
    private data class Pending(val requestId: String, val identity: Identity, var observed: Boolean = false)
    private var pending: Pending? = null

    fun begin(requestId: String, identity: Identity) {
        require(validRequestId(requestId))
        pending = Pending(requestId, identity)
    }

    fun observe(requestId: String, current: Identity, latestReadId: String?, foreground: Boolean,
                busy: Boolean, consentAccepted: Boolean): Boolean {
        val read = pending ?: return false
        if (!validRequestId(requestId) || requestId != read.requestId || latestReadId != requestId ||
            read.identity != current || !foreground || busy || !consentAccepted || read.observed) return false
        read.observed = true
        return true
    }

    fun clear() { pending = null }

    companion object {
        private val uuid = Regex("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", RegexOption.IGNORE_CASE)
        fun validRequestId(value: String): Boolean = uuid.matches(value)
    }
}
