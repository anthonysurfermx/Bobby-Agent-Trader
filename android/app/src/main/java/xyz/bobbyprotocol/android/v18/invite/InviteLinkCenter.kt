package xyz.bobbyprotocol.android.v18.invite

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import xyz.bobbyprotocol.android.v18.credits.Words

// Invitations (1.8): the invitation a friend sent waits on this phone until an account can accept it.
// A port of ios/Bobby/Sources/V18/Invite/InviteLinkCenter.swift.
//   receive(url)        an invitation link opened the app: its code is kept (device-level, 30 days)
//   submit(code)        the same, typed by hand in the invite sheet
//   claimIfPossible()   POST /api/bobby-access {action:"referral-claim", code}
//                       → {result, access, levels}; result is claimed | invalid_code | self |
//                         account_required | not_new | already_claimed | inviter_full | invalid_invitee
// Nothing is sent before the risk notice is accepted or without an account. A reply is applied only
// to the account that asked (the account moment is captured before the request). Only the friend
// who invited is rewarded by the server; nothing here promises the person accepting anything.
// A final answer is kept for the account that asked until the invite sheet has shown it (`answer`),
// so a link opened with an account still gets its answer in words (InviteNudges puts it on the glass).
// Main thread only. No Android classes: the store, the clock, the account and the request are handed in.

/** The invitation waiting on this phone. */
data class InvitePending(val code: String, /** When it arrived (a link) or was typed. */ val atMillis: Long)

/** A final answer nobody has read yet: which invitation, what the server said, and when. */
data class InviteAnswer(val code: String, val notice: InviteNotice, val atMillis: Long)

/** What the person is told, once, in words. `key` is how an answer is written to the store. */
enum class InviteNotice(val key: String) {
    ACCEPTED("accepted"), OWN_INVITATION("ownInvitation"), NOT_NEW("notNew"), ALREADY_CLAIMED("alreadyClaimed"),
    INVITER_FULL("inviterFull"), INVALID("invalid"), NOT_APPLIED("notApplied"),
    /** The code is kept: an account is needed, or the server could not be reached. */
    SIGN_IN_NEEDED("signInNeeded"), SAVED_FOR_LATER("savedForLater"),
    /** The code is kept: nothing is sent before the risk notice is accepted. */
    CONSENT_NEEDED("consentNeeded");

    fun text(words: Words): String = when (this) {
        ACCEPTED -> words.text("Invitation accepted. It counts for the friend who invited you.", "Invitación aceptada. Cuenta para el amigo que te invitó.")
        OWN_INVITATION -> words.text("That is your own invitation.", "Esa es tu propia invitación.")
        NOT_NEW -> words.text("Invitations work for new accounts, during their first week.",
                              "Las invitaciones funcionan para cuentas nuevas, durante su primera semana.")
        ALREADY_CLAIMED -> words.text("This account already accepted an invitation.", "Esta cuenta ya aceptó una invitación.")
        INVITER_FULL -> words.text("Your friend already invited all the friends allowed.", "Tu amigo ya invitó a todos los amigos permitidos.")
        INVALID -> words.text("That invitation code is not valid.", "Ese código de invitación no es válido.")
        NOT_APPLIED -> words.text("That invitation could not be applied.", "Esa invitación no se pudo aplicar.")
        SIGN_IN_NEEDED -> words.text("Sign in to accept an invitation.", "Entra con tu cuenta para aceptar una invitación.")
        SAVED_FOR_LATER -> words.text("Bobby could not check that code right now. It is saved and will be tried again.",
                                      "Bobby no pudo revisar ese código ahora. Quedó guardado y se intentará de nuevo.")
        // The same sentence the memory and briefing screens use.
        CONSENT_NEEDED -> words.text("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                     "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.")
    }

    companion object {
        /** The server's final answers (the only ones kept as an `InviteAnswer`). */
        val FINAL: Set<InviteNotice> = setOf(ACCEPTED, OWN_INVITATION, NOT_NEW, ALREADY_CLAIMED, INVITER_FULL, INVALID, NOT_APPLIED)

        fun of(key: String?): InviteNotice? = InviteNotice.entries.firstOrNull { it.key == key }
    }
}

/** How one attempt ended. */
sealed class InviteClaimStep {
    /** The server gave a final answer: the code is gone and the notice says why. */
    data class Settled(val notice: InviteNotice) : InviteClaimStep()
    /** The code stays and is tried again later. */
    data class Kept(val reason: Reason) : InviteClaimStep()
    /** The reply belonged to a previous account: ignored, the code stays. */
    object Dropped : InviteClaimStep()

    enum class Reason { ACCOUNT, UNREACHABLE }
}

/** What the server answered: its JSON object (null when it sent none) and the HTTP status. */
data class InviteReply(val json: JSONObject?, val status: Int)

class InviteLinkCenter(
    private val disk: KeyValueStore,
    private val scope: CoroutineScope,
    /** Epoch milliseconds. */
    var now: () -> Long,
    /** Nothing reaches the network before the risk notice is accepted. */
    var riskAccepted: () -> Boolean,
    private val currentUser: () -> String?,
    private val currentEpoch: () -> Long,
    /** One authenticated POST for `code`, as `user` at account moment `epoch`. Throws when the server could not be reached. */
    private val send: suspend (code: String, user: String, epoch: Long) -> InviteReply,
    /** After an accepted invitation: read the balances again. */
    private val afterClaim: suspend () -> Unit = {},
    /** Something a screen or the glass reads has changed. */
    private val onChange: () -> Unit = {},
) {
    var pending: InvitePending? = null
        private set
    var notice: InviteNotice? = null
        private set
    /** The last final answer, until the invite sheet has shown it (`acknowledgeNotice`). */
    var answer: InviteAnswer? = null
        private set
    var isClaiming: Boolean = false
        private set

    private var owner: String? = currentUser()
    private var ownerEpoch: Long = currentEpoch()
    private var retryNotBefore: Long? = null
    private var flight: Deferred<InviteClaimStep>? = null
    private var lastTrigger: Job? = null
    private var refreshTask: Job? = null

    init {
        pending = read(disk)
        purgeExpired()
        restoreAnswer()
    }

    // What the screens read

    /** The waiting invitation, or null once it is older than thirty days. */
    val waiting: InvitePending?
        get() {
            val kept = pending ?: return null
            return if (expired(kept)) null else kept
        }

    val pendingCode: String? get() = waiting?.code

    /** The answer the account that is here now has not read yet (never another account's, never an old one). */
    val unreadAnswer: InviteAnswer?
        get() {
            val kept = answer ?: return null
            val who = owner
            if (who.isNullOrEmpty() || who != currentUser() || ownerEpoch != currentEpoch() || expired(kept)) return null
            return kept
        }

    val isSignedIn: Boolean get() = !currentUser().isNullOrEmpty()

    // An invitation arrives

    /** An invitation link opened the app. False for every other URL (the sign-in callback included). */
    fun receive(url: String): Boolean {
        val code = InviteLink.code(url) ?: return false
        // The same link again while its answer is still waiting to be read by the account it was
        // given to: it is that invitation, already settled. Keeping it as a new one would throw the
        // answer away and ask the server a second time, and an accepted invitation would then be
        // reported as "not accepted" (the server answers `already_claimed` to the repeat).
        accountChanged()
        if (unreadAnswer?.code == code) return true
        keep(code)
        trigger()
        return true
    }

    /** A code typed in the invite sheet: kept like a link's, then tried. The result is published in `notice`. */
    suspend fun submit(raw: String): InviteNotice? {
        accountChanged()
        val code = InviteLink.codeFromEntry(raw)
        if (code == null) {
            say(InviteNotice.INVALID)
            return notice
        }
        keep(code)
        say(null)
        if (!riskAccepted()) {
            say(InviteNotice.CONSENT_NEEDED)
            return notice
        }
        val user = currentUser()
        if (user.isNullOrEmpty()) {
            say(InviteNotice.SIGN_IN_NEEDED)
            return notice
        }
        val epoch = currentEpoch()
        // An attempt for an older code may be in the air: let it land, then try this one.
        flight?.let { land(it) }
        val step = claimIfPossible()
        if (currentUser() != user || currentEpoch() != epoch) return null
        when (step) {
            is InviteClaimStep.Settled, InviteClaimStep.Dropped -> Unit
            is InviteClaimStep.Kept ->
                if (step.reason == InviteClaimStep.Reason.ACCOUNT) say(InviteNotice.SIGN_IN_NEEDED)
                else if (pendingCode == code) say(InviteNotice.SAVED_FOR_LATER)
            null -> if (pendingCode == code) say(InviteNotice.SAVED_FOR_LATER)
        }
        return notice
    }

    /** The person asked to accept the waiting invitation (after a sign-in they started for it). */
    suspend fun acceptPending(): InviteNotice? {
        flight?.let { land(it) }
        val code = pendingCode ?: return notice
        return submit(code)
    }

    /** The person removes the waiting invitation from this phone. */
    fun forget() {
        clearPending()
        say(null)
        clearAnswer()
    }

    /**
     * The result line was on screen: it is not repeated the next time the sheet opens, and the
     * answer kept for it is removed from the phone.
     */
    fun acknowledgeNotice() {
        if (isClaiming) return
        say(null)
        clearAnswer()
    }

    /** Account deletion: an answer kept for that account leaves the phone. The waiting code belongs to the phone and stays. */
    fun forgetAccount(user: String) {
        if (owner == user) {
            say(null)
            clearAnswer()
            return
        }
        val stored = try { disk.getString(ANSWER_KEY)?.let { JSONObject(it) } } catch (_: Exception) { null }
        if (stored != null && stored.opt("user") == user) disk.remove(ANSWER_KEY)
    }

    // Triggers

    /** A sign-in, a sign-out or another account. The waiting code belongs to the phone and stays. */
    fun accountDidChange() {
        accountChanged()
        trigger()
    }

    fun appBecameActive() {
        purgeExpired()
        trigger()
    }

    /**
     * A launch is a moment too: an invitation kept from an earlier run (the server could not be
     * reached, or the session was refused) is tried again without waiting for another event.
     */
    fun wake() {
        trigger()
    }

    /** Everything this centre started has finished (suites). */
    suspend fun idle() {
        while (true) {
            val triggered = lastTrigger
            if (triggered != null) {
                lastTrigger = null
                triggered.join()
                continue
            }
            val air = flight
            if (air != null) {
                land(air)
                continue
            }
            val refresh = refreshTask
            if (refresh != null) {
                refreshTask = null
                refresh.join()
                continue
            }
            return
        }
    }

    private fun trigger() {
        // Always on a later turn, as on iOS: whoever called goes on first.
        lastTrigger = scope.launch {
            yield()
            claimIfPossible()
        }
    }

    private fun accountChanged() {
        if (owner == currentUser() && ownerEpoch == currentEpoch()) return
        owner = currentUser()
        ownerEpoch = currentEpoch()
        // The result line and the answer behind it were the previous account's.
        say(null)
        clearAnswer()
        // So was the back-off: whoever is here now has not been refused anything yet.
        retryNotBefore = null
    }

    // The claim

    /**
     * Tries the waiting code when a code, the accepted risk notice and an account are all present.
     * One attempt at a time (a second caller waits for the one in the air), and none sooner than
     * `BACK_OFF` after an attempt that could not be settled. Null when nothing was sent.
     */
    suspend fun claimIfPossible(): InviteClaimStep? {
        flight?.let { return land(it) }
        purgeExpired()
        accountChanged()
        val code = pendingCode ?: return null
        if (!riskAccepted()) return null
        val user = currentUser()
        if (user.isNullOrEmpty()) return null
        val wait = retryNotBefore
        if (wait != null) {
            val left = wait - now()
            // A clock set back must not hold the code for longer than one back-off.
            if (left > 0 && left <= BACK_OFF) return null
        }
        val epoch = currentEpoch()
        // The consent is here now: the line that asked for it is out of date.
        if (notice == InviteNotice.CONSENT_NEEDED) say(null)
        // Lazy: the attempt is in `flight` before it runs, so it can clear it whenever it ends.
        val task = scope.async(start = CoroutineStart.LAZY) { attempt(code, user, epoch) }
        flight = task
        claiming(true)
        return land(task)
    }

    /** The answer of an attempt in the air. Null when it was cut short (the app closing). */
    private suspend fun land(task: Deferred<InviteClaimStep>): InviteClaimStep? {
        val step = try {
            task.await()
        } catch (error: Exception) {
            // Ours to pass on when it is this caller that was cancelled; otherwise the attempt died alone.
            if (error is CancellationException) currentCoroutineContext().ensureActive()
            null
        }
        if (flight === task && task.isCompleted) {
            flight = null
            claiming(false)
        }
        return step
    }

    private suspend fun attempt(code: String, user: String, epoch: Long): InviteClaimStep {
        val reply: InviteReply? = try {
            send(code, user, epoch)
        } catch (error: Exception) {
            if (error is CancellationException) currentCoroutineContext().ensureActive()
            null
        }
        flight = null
        claiming(false)
        // A reply for a previous account is dropped: the code stays for whoever is here now.
        if (currentUser() != user || currentEpoch() != epoch) {
            accountChanged()
            if (pendingCode != null) trigger()
            return InviteClaimStep.Dropped
        }
        val ruling: Verdict = if (reply == null) Verdict.Keep(InviteClaimStep.Reason.UNREACHABLE) else verdict(reply)
        return when (ruling) {
            is Verdict.Keep -> {
                retryNotBefore = now() + BACK_OFF
                InviteClaimStep.Kept(ruling.reason)
            }
            is Verdict.Settle -> {
                retryNotBefore = null
                val result = ruling.notice
                // A newer invitation arrived while this one was in the air: it gets its own answer,
                // unless this account has just accepted (an account accepts one invitation, ever).
                val superseded = pending?.code != code
                if (result == InviteNotice.ACCEPTED || !superseded) {
                    clearPending()
                    say(result)
                    keepAnswer(InviteAnswer(code, result, now()), user)
                } else {
                    trigger()
                }
                if (result == InviteNotice.ACCEPTED && riskAccepted()) refreshTask = scope.launch { afterClaim() }
                InviteClaimStep.Settled(result)
            }
        }
    }

    private sealed class Verdict {
        data class Settle(val notice: InviteNotice) : Verdict()
        data class Keep(val reason: InviteClaimStep.Reason) : Verdict()
    }

    /**
     * Only a JSON answer the server meant as final settles the code. A refused bearer, a failing
     * server, a captive portal's page or anything unreadable keeps it for a later attempt.
     */
    private fun verdict(reply: InviteReply): Verdict {
        if (reply.status == 401) return Verdict.Keep(InviteClaimStep.Reason.ACCOUNT)
        val result = reply.json?.opt("result") as? String
        if (reply.status in 200..299 && result != null) {
            if (result == "account_required") return Verdict.Keep(InviteClaimStep.Reason.ACCOUNT)
            return Verdict.Settle(RESULTS[result] ?: InviteNotice.NOT_APPLIED)
        }
        // The server refuses a malformed code with 400 before it looks anything up.
        if (reply.status == 400 && result == "invalid_code") return Verdict.Settle(InviteNotice.INVALID)
        return Verdict.Keep(InviteClaimStep.Reason.UNREACHABLE)
    }

    // Store

    private fun expired(kept: InvitePending): Boolean {
        val age = now() - kept.atMillis
        // A date far in the future is a broken clock or a broken record, not a fresh invitation.
        return age >= LIFETIME || age < -LIFETIME
    }

    private fun expired(kept: InviteAnswer): Boolean {
        val age = now() - kept.atMillis
        return age >= ANSWER_LIFETIME || age < -ANSWER_LIFETIME
    }

    private fun purgeExpired() {
        val waitingNow = pending
        if (waitingNow != null && expired(waitingNow)) clearPending()
        val answered = answer
        if (answered != null && expired(answered)) {
            // A week-old answer is not news any more: its line goes with it.
            if (notice == answered.notice) say(null)
            clearAnswer()
        }
    }

    /** Newest wins: a second invitation replaces the first, and its own result line follows. */
    private fun keep(code: String) {
        if (pending?.code != code) {
            say(null)
            clearAnswer()
        }
        val fresh = InvitePending(code, now())
        pending = fresh
        disk.putString(STORE_KEY, JSONObject().put("code", fresh.code).put("at", fresh.atMillis).toString())
        onChange()
    }

    private fun clearPending() {
        disk.remove(STORE_KEY)
        if (pending == null) return
        pending = null
        onChange()
    }

    // The answer nobody has read yet

    private fun keepAnswer(fresh: InviteAnswer, user: String) {
        answer = fresh
        disk.putString(ANSWER_KEY, JSONObject().put("code", fresh.code).put("result", fresh.notice.key).put("at", fresh.atMillis).put("user", user).toString())
        onChange()
    }

    private fun clearAnswer() {
        if (disk.getString(ANSWER_KEY) != null) disk.remove(ANSWER_KEY)
        if (answer == null) return
        answer = null
        onChange()
    }

    /**
     * A relaunch: the answer comes back only for the account it was given to, and with it the line
     * the invite sheet shows. Anything else (another account, nobody, a broken or old record) is removed.
     */
    private fun restoreAnswer() {
        val raw = disk.getString(ANSWER_KEY) ?: return
        val stored = try { JSONObject(raw) } catch (_: Exception) { null }
        val user = stored?.opt("user") as? String
        val code = (stored?.opt("code") as? String)?.let { InviteLink.normalized(it) }
        val result = InviteNotice.of(stored?.opt("result") as? String)?.takeIf { it in InviteNotice.FINAL }
        val at = moment(stored?.opt("at"))
        if (user.isNullOrEmpty() || user != owner || code == null || result == null || at == null) {
            disk.remove(ANSWER_KEY)
            return
        }
        val kept = InviteAnswer(code, result, at)
        if (expired(kept)) {
            disk.remove(ANSWER_KEY)
            return
        }
        answer = kept
        notice = result
    }

    private fun say(value: InviteNotice?) {
        if (notice == value) return
        notice = value
        onChange()
    }

    private fun claiming(value: Boolean) {
        if (isClaiming == value) return
        isClaiming = value
        onChange()
    }

    companion object {
        /** Device-level, not per account: `{code, at}`. */
        const val STORE_KEY = "v18.invite.pending"
        const val LIFETIME = 30L * 86_400_000L
        /** Per account: `{code, result, at, user}`. Removed once read, when the account leaves, or after a week. */
        const val ANSWER_KEY = "v18.invite.answer"
        const val ANSWER_LIFETIME = 7L * 86_400_000L
        /** After an attempt that could not be settled, the next one waits this long. */
        const val BACK_OFF = 60_000L

        private val RESULTS: Map<String, InviteNotice> = mapOf(
            "claimed" to InviteNotice.ACCEPTED, "self" to InviteNotice.OWN_INVITATION, "not_new" to InviteNotice.NOT_NEW,
            "already_claimed" to InviteNotice.ALREADY_CLAIMED, "inviter_full" to InviteNotice.INVITER_FULL,
            "invalid_code" to InviteNotice.INVALID, "invalid_invitee" to InviteNotice.INVALID,
        )

        private fun moment(value: Any?): Long? = (value as? Number)?.toDouble()?.takeIf { it.isFinite() }?.toLong()

        private fun read(disk: KeyValueStore): InvitePending? {
            val raw = disk.getString(STORE_KEY) ?: return null
            val stored = try { JSONObject(raw) } catch (_: Exception) { return null }
            val code = (stored.opt("code") as? String)?.let { InviteLink.normalized(it) } ?: return null
            val at = moment(stored.opt("at")) ?: return null
            return InvitePending(code, at)
        }
    }
}
