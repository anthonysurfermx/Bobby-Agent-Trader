package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.V18Host

// The Monday briefing, as the reminders read it (the `BriefingOffer` of
// ios/Bobby/Sources/V18/Reminders/ReminderNudges.swift). On iOS the briefing centre already holds
// the account's settings; Android has no such centre, so this keeps the one answer the line on the
// glass and the row on the Reminders screen need. A candidate only ever reads what is held here:
// it never fetches.

/** What is known about the weekly briefing of the account using the phone. */
data class BriefingOffer(
    /** null until the server said (never read as Pro). */
    val eligiblePro: Boolean?,
    /** null until the account's settings are known. */
    val weeklyOn: Boolean?,
    /** The server has adopted the Monday schedule (otherwise the switch cannot be turned on). */
    val configured: Boolean,
    /** The switch is being saved right now. */
    val saving: Boolean = false,
) {
    /** Only for an account that may have it, has it off and could turn it on now. */
    val shouldOffer: Boolean get() = eligiblePro == true && weeklyOn == false && configured && !saving

    companion object {
        val UNKNOWN = BriefingOffer(eligiblePro = null, weeklyOn = null, configured = false)

        /**
         * From the answer of GET /api/briefing-settings. Only real JSON booleans count: a value the
         * server did not send stays unknown, and an unknown value never offers anything.
         */
        fun from(reply: JSONObject?): BriefingOffer {
            if (reply == null) return UNKNOWN
            val settings = reply.optJSONObject("settings") ?: reply
            val weekly = (settings.optJSONObject("schedules") ?: reply.optJSONObject("schedules"))?.optJSONObject("weekly")
            // An older server omits `configured`: a schedule with a next moment is configured.
            val next = weekly?.opt("nextAt")
            val configured = flag(weekly, "configured") ?: (next is String && next.isNotEmpty())
            return BriefingOffer(flag(settings, "eligiblePro") ?: flag(reply, "eligiblePro"), flag(settings, "weeklyEnabled"), configured)
        }

        private fun flag(json: JSONObject?, key: String): Boolean? = json?.opt(key) as? Boolean
    }
}

class BriefingOffers(private val host: V18Host) {
    /** The one request this makes: the account's briefing settings. Tests stand in for the network. */
    var load: suspend () -> JSONObject = { host.repository.briefingSettings() }

    private val held = MutableStateFlow(BriefingOffer.UNKNOWN)
    /** What was last read for the current reader, however long ago (the Reminders screen reads it again when it opens). */
    val state: StateFlow<BriefingOffer> get() = held

    private var loadedAt: Long? = null
    private var loading = false

    /** What the glass may speak from: only an answer read recently enough to still be true. */
    fun current(): BriefingOffer {
        val at = loadedAt ?: return BriefingOffer.UNKNOWN
        return if (host.now() - at <= TRUSTED_MS) held.value else BriefingOffer.UNKNOWN
    }

    /** True when nothing is held, or it was read long enough ago to read again. */
    val stale: Boolean get() = loadedAt.let { it == null || host.now() - it > REFRESH_AFTER_MS }

    /** Keeps an answer of GET /api/briefing-settings as what is known now. */
    fun hold(reply: JSONObject?) {
        held.value = BriefingOffer.from(reply)
        loadedAt = host.now()
    }

    /** Another reader, a withdrawn notice, or the person is on their way to change the setting: what was held is no longer known. */
    fun clear() {
        held.value = BriefingOffer.UNKNOWN
        loadedAt = null
    }

    /**
     * Reads the settings for the signed-in account, after the risk notice only. True when something
     * new is held for the reader who asked; a late answer for a previous reader is dropped.
     */
    suspend fun refresh(): Boolean {
        if (loading || !host.signedIn || !host.riskAccepted) return false
        val fence = host.fence()
        loading = true
        try {
            val reply = load()
            if (!fence.isCurrent) return false
            hold(reply)
            return true
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            return false
        } finally {
            loading = false
        }
    }

    companion object {
        /** The existing briefing settings sheet (a 1.1.4 route). */
        const val SETTINGS_ROUTE = "briefingSettings"
        /** The line on the glass is not spoken from an answer older than this. */
        const val TRUSTED_MS = 30 * 60_000L
        /** Coming back to the app reads the settings again after this long. */
        const val REFRESH_AFTER_MS = 5 * 60_000L
        private const val SERVICE = "reminders.briefing"

        fun of(host: V18Host): BriefingOffers = host.service(SERVICE) { BriefingOffers(host) }
    }
}
