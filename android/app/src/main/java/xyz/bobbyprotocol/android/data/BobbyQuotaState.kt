package xyz.bobbyprotocol.android.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.time.Instant

/** Plan quota and gifted reads are separate; an unknown meter never becomes zero. */
data class ReadQuota(
    val tier: String,
    val used: Int?,
    val limit: Int?,
    val remaining: Int?,
    val bonus: Int,
    val resetsAt: String?,
    val paywall: Boolean,
)

data class QuotaMeter(
    val used: Int,
    val limit: Int,
    val remaining: Int,
    val bonus: Int,
    val windowDays: Int,
    val resetsAt: String?,
)

data class LevelQuota(val tier: String, val profundo: QuotaMeter, val maximo: QuotaMeter)
data class BobbyQuotaSnapshot(val access: ReadQuota? = null, val levels: LevelQuota? = null)
data class BobbyQuotaOwner(val userId: String?, val epoch: Long)
data class BobbyQuotaState(
    val owner: BobbyQuotaOwner? = null,
    val access: ReadQuota? = null,
    val levels: LevelQuota? = null,
)

/** Only literal whole JSON numbers authorize a displayed quota; never booleans or coercions. */
object BobbyQuotaPolicy {
    /** The guest Deep allowance is real; selecting a level still consumes only through the server. */
    fun canSelectPremium(tier: String?, meter: QuotaMeter?): Boolean =
        tier in setOf("anon", "free", "pro") && meter != null && meter.remaining.toLong() + meter.bonus > 0

    fun count(value: Any?): Int? {
        val number = (value as? Number)?.toDouble() ?: return null
        if (!number.isFinite() || number < 0 || number >= 1e9 || number % 1.0 != 0.0) return null
        return number.toInt()
    }

    /** Validate each partial field independently. Signed-in coupon reads reject OPEN/anon fallback. */
    fun snapshot(body: JSONObject, accountOnly: Boolean = false): BobbyQuotaSnapshot? {
        val access = body.optJSONObject("access")?.let { read(it, accountOnly) }
        var levels = body.optJSONObject("levels")?.let { levels(it, accountOnly) }
        if (access != null && levels != null && access.tier != levels.tier) levels = null
        return if (access == null && levels == null) null else BobbyQuotaSnapshot(access, levels)
    }

    private fun tier(value: Any?, accountOnly: Boolean): String? = (value as? String)?.takeIf {
        it in if (accountOnly) setOf("free", "pro") else setOf("anon", "free", "pro")
    }

    private fun nullableCount(body: JSONObject, field: String): Boolean =
        body.has(field) && (body.opt(field) == JSONObject.NULL || count(body.opt(field)) != null)

    private fun validReset(body: JSONObject): Boolean {
        val value = body.opt("resetsAt")
        return value == null || value == JSONObject.NULL || value is String &&
            runCatching { Instant.parse(value) }.isSuccess
    }

    private fun read(body: JSONObject, accountOnly: Boolean): ReadQuota? {
        val tier = tier(body.opt("tier"), accountOnly) ?: return null
        if (!listOf("used", "limit", "remaining").all { nullableCount(body, it) } || !validReset(body)) return null
        val used = count(body.opt("used"))
        val limit = count(body.opt("limit"))
        val remaining = count(body.opt("remaining"))
        // Unlimited Pro deliberately has no general read meter. A finite/null hybrid is unknown.
        if (accountOnly && used == null && !(tier == "pro" && limit == null && remaining == null)) return null
        val bonus = count(body.opt("bonus")) ?: return null
        val paywall = body.opt("paywall") as? Boolean ?: return null
        return ReadQuota(tier, used, limit, remaining, bonus, body.opt("resetsAt") as? String, paywall)
    }

    private fun levels(body: JSONObject, accountOnly: Boolean): LevelQuota? {
        val tier = tier(body.opt("tier"), accountOnly) ?: return null
        val perLevel = body.optJSONObject("levels") ?: return null
        val deep = perLevel.optJSONObject("profundo")?.let(::meter) ?: return null
        val max = perLevel.optJSONObject("maximo")?.let(::meter) ?: return null
        return LevelQuota(tier, deep, max)
    }

    private fun meter(body: JSONObject): QuotaMeter? {
        val used = count(body.opt("used")) ?: return null
        val limit = count(body.opt("limit")) ?: return null
        val remaining = count(body.opt("remaining")) ?: return null
        val bonus = count(body.opt("bonus")) ?: return null
        val days = count(body.opt("windowDays")) ?: return null
        if (!validReset(body)) return null
        return QuotaMeter(used, limit, remaining, bonus, days, body.opt("resetsAt") as? String)
    }
}

/** Every response is bound to its account epoch and a monotonically newer local request. */
class BobbyQuotaStore(
    private val currentOwner: () -> BobbyQuotaOwner,
    private val lock: Any = Any(),
) {
    data class ReadTicket internal constructor(val owner: BobbyQuotaOwner, internal val revision: Long)

    private var revision = 0L
    private val mutableState = MutableStateFlow(BobbyQuotaState(owner = currentOwner()))
    val state: StateFlow<BobbyQuotaState> = mutableState.asStateFlow()

    fun reset() = synchronized(lock) {
        revision++
        mutableState.value = BobbyQuotaState(owner = currentOwner())
    }

    fun beginRead(): ReadTicket = synchronized(lock) {
        val owner = bindOwner()
        revision++
        ReadTicket(owner, revision)
    }

    /** An unavailable latest GET keeps the previous snapshot; it cannot revive an older request. */
    fun applyRead(ticket: ReadTicket, snapshot: BobbyQuotaSnapshot?): Boolean = synchronized(lock) {
        val owner = bindOwner()
        if (ticket.owner != owner || ticket.revision != revision || snapshot == null) return@synchronized false
        merge(snapshot)
        true
    }

    /** Even a confirmed coupon with no quota snapshot invalidates every GET begun before it. */
    fun applyCoupon(owner: BobbyQuotaOwner, snapshot: BobbyQuotaSnapshot?): Boolean = synchronized(lock) {
        if (owner != bindOwner()) return@synchronized false
        revision++
        if (snapshot != null) merge(snapshot)
        true
    }

    private fun bindOwner(): BobbyQuotaOwner {
        val owner = currentOwner()
        if (mutableState.value.owner != owner) {
            revision++
            mutableState.value = BobbyQuotaState(owner = owner)
        }
        return owner
    }

    private fun merge(snapshot: BobbyQuotaSnapshot) {
        val previous = mutableState.value
        var access = snapshot.access ?: previous.access
        var levels = snapshot.levels ?: previous.levels
        if (access != null && levels != null && access.tier != levels.tier) {
            // A valid partial plan change must retire the other field's old plan allowance.
            if (snapshot.access != null) levels = null else access = null
        }
        mutableState.value = previous.copy(access = access, levels = levels)
    }
}
