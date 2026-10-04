package xyz.bobbyprotocol.android.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject
import java.util.Locale

/** Gifted uses never imply a paid subscription, and are never added to a cached balance. */
data class CouponCredits(val reads: Int, val profundo: Int, val maximo: Int) {
    val total: Long get() = reads.toLong() + profundo + maximo
}

data class CouponRedemptionReceipt(val granted: CouponCredits?, val bonus: CouponCredits?) {
    val balanceVerified: Boolean get() = bonus != null
}

enum class CouponRedemptionFailure {
    ACCOUNT_REQUIRED, INVALID_CODE, EXPIRED, EXHAUSTED, RATE_LIMITED, UNAVAILABLE, INVALID_RESPONSE
}

sealed interface CouponRedemptionOutcome {
    data class Redeemed(val receipt: CouponRedemptionReceipt) : CouponRedemptionOutcome
    data class AlreadyRedeemed(val receipt: CouponRedemptionReceipt) : CouponRedemptionOutcome
    data class Failed(val reason: CouponRedemptionFailure) : CouponRedemptionOutcome
}

data class CouponRedemptionState(
    val isRedeeming: Boolean = false,
    val isCheckingBalance: Boolean = false,
    val outcome: CouponRedemptionOutcome? = null,
    val checkedBalance: CouponCredits? = null,
    val balanceUnavailable: Boolean = false,
)

data class CouponReply(val status: Int, val json: JSONObject?)
data class ParsedCouponReply(val outcome: CouponRedemptionOutcome, val snapshot: BobbyQuotaSnapshot?)

object CouponRedemptionPolicy {
    fun normalizedCode(code: String): String? {
        if (code.toByteArray(Charsets.UTF_8).size > 512) return null
        return code.uppercase(Locale.ROOT).filterNot { it.isWhitespace() || Character.isSpaceChar(it) }
            .takeIf { it.matches(Regex("[A-Z0-9][A-Z0-9-]{3,31}")) }
    }

    fun credits(raw: Any?): CouponCredits? {
        val body = raw as? JSONObject ?: return null
        return CouponCredits(BobbyQuotaPolicy.count(body.opt("reads")) ?: return null,
            BobbyQuotaPolicy.count(body.opt("profundo")) ?: return null,
            BobbyQuotaPolicy.count(body.opt("maximo")) ?: return null)
    }

    fun balance(snapshot: BobbyQuotaSnapshot?): CouponCredits? {
        val access = snapshot?.access ?: return null
        val levels = snapshot.levels ?: return null
        if (access.tier != levels.tier) return null
        return CouponCredits(access.bonus, levels.profundo.bonus, levels.maximo.bonus)
    }

    fun parse(reply: CouponReply): ParsedCouponReply {
        val body = reply.json
        val result = body?.opt("result") as? String
        val failure = when {
            reply.status == 401 -> CouponRedemptionFailure.ACCOUNT_REQUIRED
            reply.status == 429 -> CouponRedemptionFailure.RATE_LIMITED
            reply.status in 500..599 -> CouponRedemptionFailure.UNAVAILABLE
            else -> result?.let(::failure) ?: CouponRedemptionFailure.INVALID_RESPONSE
        }
        if (reply.status !in 200..299 || body == null || result !in setOf("redeemed", "already_redeemed")) {
            return ParsedCouponReply(CouponRedemptionOutcome.Failed(failure), null)
        }
        val granted = if (result == "redeemed") credits(body.opt("granted")) else null
        if (result == "redeemed" && (granted?.total ?: 0) <= 0) {
            return ParsedCouponReply(CouponRedemptionOutcome.Failed(CouponRedemptionFailure.INVALID_RESPONSE), null)
        }
        val rawBonus = body.opt("bonus")
        val explicitBonus = credits(rawBonus)
        if (rawBonus != null && rawBonus != JSONObject.NULL && explicitBonus == null) {
            return ParsedCouponReply(CouponRedemptionOutcome.Failed(CouponRedemptionFailure.INVALID_RESPONSE), null)
        }
        val snapshot = BobbyQuotaPolicy.snapshot(body, accountOnly = true)
        // These quota reads follow the redemption RPC; a complete balance is the latest observation.
        val receipt = CouponRedemptionReceipt(granted, balance(snapshot) ?: explicitBonus)
        return ParsedCouponReply(if (result == "redeemed") CouponRedemptionOutcome.Redeemed(receipt)
            else CouponRedemptionOutcome.AlreadyRedeemed(receipt), snapshot)
    }

    private fun failure(result: String): CouponRedemptionFailure? = when (result) {
        "account_required" -> CouponRedemptionFailure.ACCOUNT_REQUIRED
        "invalid_code" -> CouponRedemptionFailure.INVALID_CODE
        "expired" -> CouponRedemptionFailure.EXPIRED
        "exhausted" -> CouponRedemptionFailure.EXHAUSTED
        "rate_limited" -> CouponRedemptionFailure.RATE_LIMITED
        else -> null
    }
}

/** Single-flight, account-bound operations. Checking a balance only issues GET; no store sync occurs. */
class CouponRedemptionController(
    private val currentOwner: () -> BobbyQuotaOwner,
    private val send: suspend (BobbyQuotaOwner, String) -> CouponReply,
    private val loadBalance: suspend (BobbyQuotaOwner) -> BobbyQuotaSnapshot?,
    private val applySnapshot: (BobbyQuotaOwner, BobbyQuotaSnapshot?) -> Boolean,
    private val lock: Any = Any(),
) {
    private val mutableState = MutableStateFlow(CouponRedemptionState())
    val state: StateFlow<CouponRedemptionState> = mutableState.asStateFlow()
    private var owner = currentOwner()
    private var revision = 0L
    private var request: Job? = null

    fun dismissOutcome() = synchronized(lock) {
        mutableState.value = state.value.copy(outcome = null)
    }

    fun cancel() = synchronized(lock) {
        revision++
        request?.cancel()
        request = null
        mutableState.value = CouponRedemptionState()
    }

    fun accountChanged() = synchronized(lock) {
        val next = currentOwner()
        if (next != owner) {
            cancel()
            owner = next
        }
    }

    suspend fun redeem(code: String, expectedOwner: BobbyQuotaOwner? = null): CouponRedemptionOutcome? {
        val job = currentCoroutineContext()[Job]
        currentCoroutineContext().ensureActive()
        val normalized = CouponRedemptionPolicy.normalizedCode(code)
        val ticket = synchronized(lock) {
            // The button captures its visible account before its coroutine can be scheduled.
            if (expectedOwner != null && expectedOwner != currentOwner()) return null
            accountChanged()
            if (state.value.isRedeeming || state.value.isCheckingBalance) return null
            if (owner.userId.isNullOrEmpty()) return finish(CouponRedemptionOutcome.Failed(CouponRedemptionFailure.ACCOUNT_REQUIRED))
            if (normalized == null) return finish(CouponRedemptionOutcome.Failed(CouponRedemptionFailure.INVALID_CODE))
            revision++
            request = job
            mutableState.value = CouponRedemptionState(isRedeeming = true)
            owner to revision
        }
        try {
            if (!synchronized(lock) { current(ticket) }) return null
            val reply = try { send(ticket.first, normalized!!) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: AccountChangedException) { return null }
            catch (api: ApiException) { CouponReply(api.status, api.payload) }
            catch (_: Exception) {
                return synchronized(lock) {
                    if (!current(ticket) || job?.isActive == false) null
                    else finish(CouponRedemptionOutcome.Failed(CouponRedemptionFailure.UNAVAILABLE))
                }
            }
            currentCoroutineContext().ensureActive()
            return synchronized(lock) {
                if (!current(ticket)) return@synchronized null
                val parsed = CouponRedemptionPolicy.parse(reply)
                if (parsed.outcome !is CouponRedemptionOutcome.Failed) {
                    val applied = try { applySnapshot(ticket.first, parsed.snapshot) }
                    catch (_: AccountChangedException) { false }
                    if (!applied) return@synchronized null
                }
                // A synchronous state subscriber can change identity while the replacement publishes.
                if (!current(ticket) || job?.isActive == false) return@synchronized null
                finish(parsed.outcome)
            }
        } finally {
            synchronized(lock) {
                if (revision == ticket.second) {
                    request = null
                    mutableState.value = state.value.copy(isRedeeming = false)
                }
            }
        }
    }

    suspend fun checkBalance(expectedOwner: BobbyQuotaOwner? = null) {
        val job = currentCoroutineContext()[Job]
        currentCoroutineContext().ensureActive()
        val ticket = synchronized(lock) {
            if (expectedOwner != null && expectedOwner != currentOwner()) return
            accountChanged()
            if (state.value.isRedeeming || state.value.isCheckingBalance) return
            if (owner.userId.isNullOrEmpty()) {
                finish(CouponRedemptionOutcome.Failed(CouponRedemptionFailure.ACCOUNT_REQUIRED))
                return
            }
            revision++
            request = job
            mutableState.value = state.value.copy(isCheckingBalance = true, checkedBalance = null, balanceUnavailable = false)
            owner to revision
        }
        try {
            val snapshot = try { loadBalance(ticket.first) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (_: AccountChangedException) { return }
            catch (_: Exception) { null }
            currentCoroutineContext().ensureActive()
            synchronized(lock) {
                if (current(ticket)) {
                    val balance = CouponRedemptionPolicy.balance(snapshot)
                    mutableState.value = state.value.copy(checkedBalance = balance, balanceUnavailable = balance == null)
                }
            }
        } finally {
            synchronized(lock) {
                if (revision == ticket.second) {
                    request = null
                    mutableState.value = state.value.copy(isCheckingBalance = false)
                }
            }
        }
    }

    private fun current(ticket: Pair<BobbyQuotaOwner, Long>) = currentOwner() == ticket.first && revision == ticket.second
    private fun finish(outcome: CouponRedemptionOutcome): CouponRedemptionOutcome {
        mutableState.value = state.value.copy(outcome = outcome)
        return outcome
    }
}
