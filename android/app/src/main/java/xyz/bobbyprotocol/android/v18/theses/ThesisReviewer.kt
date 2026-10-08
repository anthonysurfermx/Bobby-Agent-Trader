package xyz.bobbyprotocol.android.v18.theses

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.AccountChangedException
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.data.BobbyParsers
import xyz.bobbyprotocol.android.data.SessionUnavailableException
import xyz.bobbyprotocol.android.v18.DeskAnswer
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisContext
import xyz.bobbyprotocol.android.v18.ThesisReviewNotes
import xyz.bobbyprotocol.android.v18.ThesisRevision
import xyz.bobbyprotocol.android.v18.V18Host
import java.io.IOException

// Review a thesis (1.8): ONE metered desk read of today's price evidence against the person's
// own words. A port of ios/Bobby/Sources/V18/Theses/ThesisReviewer.swift. Invariants:
//  - Nothing is sent before the risk notice is accepted, and the thesis text leaves the phone only
//    inside this request, which the person starts with a tap.
//  - A review is recorded in the thesis book only when the desk delivered an answer. A refusal, a
//    failure or a cancel records nothing and says what happens next in plain words.
//  - The reply is dropped when the account or the book's owner changed while it was in flight.
//  - One review at a time; closing the screen cancels it.
// The desk reads price evidence only (candles, indicators; for crypto also funding and open
// interest). A server that ignores the thesis answers a normal read with no lists: the review is
// still recorded, with empty lists, and the screen labels them as unavailable.

/** What one review sends to the desk. */
data class ThesisReviewRequest(
    val symbol: String,
    val question: String,
    val isEquity: Boolean,
    /** `rapido` | `profundo` | `maximo`. */
    val level: String,
    val thesis: ThesisContext,
)

/** What a finished review shows. */
data class ThesisReviewResult(
    /** The thesis after the review was recorded. */
    val thesis: SavedThesis,
    /** `wait` | `review`. */
    val verdict: String,
    val headline: String?,
    val thenNow: ThesisThenNow,
    /** Null when the server did not sort the evidence against the thesis. */
    val notes: ThesisReviewNotes?,
    /** Always at least one code (the fixed list when the server sent none). */
    val notChecked: List<String>,
    val level: String,
)

/** How one desk request ended, as the reviewer needs to know it (the iOS `DebateOutcome`). */
sealed class DeskOutcome {
    class Ok(val answer: DeskAnswer) : DeskOutcome()
    /** The person, or an account change, stopped it. */
    data object Cancelled : DeskOutcome()
    /** 401 `signin_required` | 402 `subscription_required`, with the server's read meter when it sent one. */
    class Gated(val status: String, val access: JSONObject?) : DeskOutcome()
    /** 403 `signin_required` | `upgrade_required` | `level_exhausted`: this level is refused for this caller. */
    class LevelRefused(val code: String, val resetsAt: String?) : DeskOutcome()
    /** A soft budget pauses the premium levels; the hard budget pauses every level. */
    class BudgetPaused(val allLevels: Boolean) : DeskOutcome()
    data object Quota : DeskOutcome()
    data object TooLong : DeskOutcome()
    /** The server said the analysis failed, or refused before metering. */
    data object Failed : DeskOutcome()
    /** A timeout or a lost connection. */
    data object Network : DeskOutcome()
    data object BadResponse : DeskOutcome()

    companion object {
        val LEVEL_REFUSALS: Set<String> = setOf("signin_required", "upgrade_required", "level_exhausted")

        /** A reply by its status and body, exactly as iOS reads one (`NucleoDeskIO.parseDebate`). */
        fun of(status: Int, json: JSONObject?, code: String? = BobbyParsers.machineCode(json)): DeskOutcome {
            if (status == 401 || status == 402) {
                return Gated(if (status == 401) "signin_required" else "subscription_required", json?.optJSONObject("access"))
            }
            if (status == 429) return Quota
            if (status == 400 && code == "question_too_long") return TooLong
            if (status == 403 && code != null && code in LEVEL_REFUSALS) return LevelRefused(code, string(json?.optJSONObject("meter"), "resetsAt"))
            if (status == 503 && code == "budget_paused") {
                return BudgetPaused(json?.opt("quickAvailable") == false || string(json, "level") == "rapido")
            }
            if (status == 503 && (code == "analysis_failed" || code == "desk_unavailable")) return Failed
            if (status in 200..299 && json != null && BobbyParsers.validDeskAnswer(json)) return Ok(DeskAnswer(json))
            return BadResponse
        }

        /** What `BobbyRepository.streamDebate` threw. */
        fun of(error: Throwable): DeskOutcome = when (error) {
            is ApiException -> of(error.status, error.payload, error.code)
            is AccountChangedException -> Cancelled
            // No current session could be had, so nothing was sent.
            is SessionUnavailableException -> Failed
            is IOException -> Network
            else -> BadResponse
        }

        private fun string(json: JSONObject?, key: String): String? {
            if (json == null || json.isNull(key)) return null
            return (json.opt(key) as? String)?.takeIf { it.isNotEmpty() }
        }
    }
}

class ThesisReviewer(
    val thesisId: String?,
    private val env: Environment,
    /** Where `start` runs a review (the host's scope); null where every review is awaited by its caller. */
    private val scope: CoroutineScope? = null,
) {
    /** Why a review did not run or did not finish. Nothing was recorded in any of these. */
    sealed class Refusal {
        data object RiskNotice : Refusal()
        /** Deleted, or written in another account's book. */
        data object NotFound : Refusal()
        /** Written before signing in: it waits in the guest book until the person keeps it in this account (My theses). */
        data object WrittenSignedOut : Refusal()
        data object Archived : Refusal()
        /** 401, or a premium level refused for a guest (`level` is that level). */
        data class SignIn(val level: String?) : Refusal()
        /** 402: the weekly free reads are used. `resetsAtMillis` is when the server says they come back. */
        data class Subscription(val resetsAtMillis: Long?) : Refusal()
        /** 403 upgrade_required | level_exhausted: this level is used up for now. */
        data class LevelUsed(val level: String, val resetsAtMillis: Long?) : Refusal()
        /** The spend guard paused this level (`quickWorks`) or every level. */
        data class Paused(val level: String, val quickWorks: Boolean) : Refusal()
        data object Quota : Refusal()
        /** The server said the analysis failed (it refunds a failed analysis) or refused the request before metering. */
        data object Failed : Refusal()
        /** A timeout or a lost connection: the phone cannot know whether the read counted. */
        data object Uncertain : Refusal()
        /** An answer arrived and could not be read: it most likely counted. */
        data object Unreadable : Refusal()
    }

    sealed class Phase {
        data object Ready : Phase()
        data object Running : Phase()
        data class Done(val result: ThesisReviewResult) : Phase()
        data class Refused(val refusal: Refusal) : Phase()
    }

    /** Everything a review touches outside this class. Tests build one by hand; `live` binds it to the host. */
    class Environment(
        val book: ThesisBook,
        val words: HostWords,
        val owner: () -> String?,
        /** The account moment (`V18Host.accountEpoch`). */
        val epoch: () -> Long,
        val riskAccepted: () -> Boolean,
        /** The level the person picked. */
        val level: () -> String,
        val now: () -> Long = { System.currentTimeMillis() },
        /** The desk request (tests inject a stub; nothing else in this file touches the network). */
        val send: suspend (ThesisReviewRequest) -> DeskOutcome,
        /** The server sent its read meter with this reply: the credits the app shows should follow it. */
        val accessChanged: (JSONObject) -> Unit = {},
        /** A premium level was used or refused: its meter moved. */
        val meterChanged: (String) -> Unit = {},
        val events: ThesisEvents? = null,
    )

    /** Goes up on every change the screen should redraw for. */
    val changes = MutableStateFlow(0)

    var thesis: SavedThesis? = null
        private set
    var phase: Phase = Phase.Ready
        private set

    private val copy = ThesisCopy(env.words)
    private var run = 0
    private var job: Job? = null

    init {
        reload()
    }

    val isRunning: Boolean get() = phase == Phase.Running

    /** The level a tap on "Review now" would use. */
    val currentLevel: String get() = env.level()

    // The thesis on screen

    /** Reads the thesis again from the current owner's book and says so when it cannot be reviewed. */
    fun reload() {
        thesis = thesisId?.let { env.book.thesis(it, env.owner()) }
        // A review in flight, a finished one and a server's refusal stay on screen as they are.
        val current = phase
        val local = current == Phase.Ready || (current is Phase.Refused &&
            (current.refusal == Refusal.NotFound || current.refusal == Refusal.WrittenSignedOut ||
                current.refusal == Refusal.Archived || current.refusal == Refusal.RiskNotice))
        if (local) phase = precondition()?.let { Phase.Refused(it) } ?: Phase.Ready
        changed()
    }

    /** Another account (or none) now: an answer still in flight belongs to nobody on this screen. */
    fun accountChanged() {
        cancel()
        phase = Phase.Ready
        reload()
    }

    private fun precondition(): Refusal? {
        val current = thesis ?: return if (waitsInGuestBook()) Refusal.WrittenSignedOut else Refusal.NotFound
        if (current.status == SavedThesis.Status.ARCHIVED) return Refusal.Archived
        if (!env.riskAccepted()) return Refusal.RiskNotice
        return null
    }

    /**
     * The person signed in on this screen (or elsewhere) and the thesis is one they wrote before:
     * it is still in the guest book, and My theses asks whether to keep it in this account.
     */
    private fun waitsInGuestBook(): Boolean {
        val id = thesisId ?: return false
        val reader = env.owner() ?: return false
        if (env.book.thesis(id, null) == null) return false
        return env.book.pendingLocalCount(reader) > 0
    }

    // One review

    /** Starts a review and keeps its job, so closing the screen can cancel it. A second tap while one runs sends nothing. */
    fun start(level: String? = null) {
        val scope = scope ?: return
        if (isRunning || job != null) return
        val launched = scope.launch { review(level) }
        job = launched
        launched.invokeOnCompletion { if (job === launched) job = null }
    }

    /** `level` overrides the picked level for this one review ("Review with Quick"); the pick itself is not changed. */
    suspend fun review(level: String? = null) {
        if (isRunning) return
        reload()
        val refusal = precondition()
        if (refusal != null) {
            setPhase(Phase.Refused(refusal))
            return
        }
        val reviewed = thesis ?: return
        val useLevel = level ?: env.level()
        run += 1
        val token = run
        val epoch = env.epoch()
        val reader = env.owner()
        setPhase(Phase.Running)
        // The price the thesis was written at, or none: a later review's price is never sent as its origin.
        val words = ThesisContext(reviewed).copy(priceAtSave = ThesisCopy.startingPoint(reviewed)?.price)
        val request = ThesisReviewRequest(reviewed.symbol, copy.reviewQuestion(reviewed.symbol), reviewed.isEquity, useLevel, words)
        val outcome = env.send(request)
        // Cancelled, superseded, or the account changed while the desk worked: the reply is dropped.
        if (run != token) return
        if (env.epoch() != epoch || env.owner() != reader || !env.riskAccepted()) {
            phase = Phase.Ready
            reload()
            return
        }
        if (!currentCoroutineContext().isActive) {
            setPhase(Phase.Ready)
            return
        }
        setPhase(finish(outcome, reviewed, reader, useLevel))
    }

    /** Closing the screen or tapping Cancel: the reply, if one still comes, is ignored. */
    fun cancel() {
        run += 1
        val running = job
        job = null
        running?.cancel()
        if (isRunning) setPhase(Phase.Ready)
    }

    private fun finish(outcome: DeskOutcome, reviewed: SavedThesis, reader: String?, level: String): Phase = when (outcome) {
        is DeskOutcome.Ok -> {
            val answer = outcome.answer
            answer.access?.let { env.accessChanged(it) }
            if (isPremium(level)) env.meterChanged(level)
            val notes = answer.review
            val recorded = try {
                env.book.recordReview(reviewed.id, reader, answer.price, answer.asOf, answer.verdict, notes?.supports ?: emptyList(),
                                      notes?.challenges ?: emptyList(), notes?.unknowns ?: emptyList(), env.now())
            } catch (_: ThesisBook.BookError) {
                null
            }
            if (recorded == null) {
                // Deleted while the desk worked: there is no thesis to attach the review to.
                thesis = null
                Phase.Refused(Refusal.NotFound)
            } else {
                thesis = recorded
                Phase.Done(ThesisReviewResult(
                    thesis = recorded, verdict = answer.verdict, headline = answer.headline,
                    thenNow = ThesisThenNow(reviewed, answer.price, answer.asOf), notes = notes,
                    notChecked = ThesisCopy.notCheckedCodes(notes?.notChecked, reviewed.isEquity), level = level))
            }
        }
        is DeskOutcome.Cancelled -> Phase.Ready
        is DeskOutcome.Gated -> {
            outcome.access?.let { env.accessChanged(it) }
            if (outcome.status == "signin_required") Phase.Refused(Refusal.SignIn(null))
            else Phase.Refused(Refusal.Subscription(resets(outcome.access)))
        }
        is DeskOutcome.LevelRefused -> {
            env.meterChanged(level)
            if (outcome.code == "signin_required") Phase.Refused(Refusal.SignIn(level))
            else Phase.Refused(Refusal.LevelUsed(level, outcome.resetsAt?.let { ThesisCopy.instant(it) }))
        }
        is DeskOutcome.BudgetPaused -> Phase.Refused(Refusal.Paused(level, !outcome.allLevels && isPremium(level)))
        is DeskOutcome.Quota -> Phase.Refused(Refusal.Quota)
        is DeskOutcome.Failed, is DeskOutcome.TooLong -> Phase.Refused(Refusal.Failed)
        is DeskOutcome.Network -> Phase.Refused(Refusal.Uncertain)
        is DeskOutcome.BadResponse -> Phase.Refused(Refusal.Unreadable)
    }

    // After the review

    /**
     * What the person decided (`ThesisEvents.KEEP` | `EDIT` | `ARCHIVE`). `keep` and `archive` are
     * written to the book; `edit` hands over to the editor. False when the thesis is gone.
     */
    fun decide(decision: String): Boolean {
        val decided = thesis ?: return false
        val reader = env.owner()
        val gone = try {
            when (decision) {
                ThesisEvents.KEEP -> {
                    env.book.keep(decided.id, reader, env.now())
                    false
                }
                ThesisEvents.ARCHIVE -> {
                    env.book.archive(decided.id, reader, env.now())
                    false
                }
                else -> env.book.thesis(decided.id, reader) == null
            }
        } catch (_: ThesisBook.BookError) {
            true
        }
        if (gone) {
            thesis = null
            setPhase(Phase.Refused(Refusal.NotFound))
            return false
        }
        env.events?.postReviewed(decided.id, decision)
        return true
    }

    /** Past reviews, newest first; `excluding` leaves out the one the screen already shows in full. */
    fun pastReviews(excluding: ThesisRevision? = null): List<ThesisRevision> =
        (thesis?.revisions ?: emptyList()).filter { it.kind == ThesisRevision.Kind.REVIEWED && it.id != excluding?.id }.reversed()

    /** One of the three lists a past review kept on this phone. */
    data class StoredList(val kind: Kind, val items: List<String>) {
        enum class Kind { SUPPORTS, CHALLENGES, UNKNOWNS }
    }

    private fun setPhase(next: Phase) {
        phase = next
        changed()
    }

    private fun changed() {
        changes.value = changes.value + 1
    }

    companion object {
        const val QUICK = "rapido"

        fun isPremium(level: String): Boolean = level != QUICK

        /**
         * What a past review kept, so everything stored can be read again. Lists that held nothing
         * are left out; an empty result means the review kept no lists at all (the screen says so).
         */
        fun storedLists(revision: ThesisRevision): List<StoredList> = listOf(
            StoredList(StoredList.Kind.SUPPORTS, revision.supports), StoredList(StoredList.Kind.CHALLENGES, revision.challenges),
            StoredList(StoredList.Kind.UNKNOWNS, revision.unknowns)).filter { it.items.isNotEmpty() }

        private fun resets(access: JSONObject?): Long? {
            if (access == null || access.isNull("resetsAt")) return null
            return (access.opt("resetsAt") as? String)?.let { ThesisCopy.instant(it) }
        }

        /**
         * The app's real stores, through the host that owns the desk: its consent, its account
         * moment, its thesis book and the bearer its reads carry. `transport` is the request itself
         * (`BobbyRepository.streamDebate`); a test replaces it and looks at what it was handed.
         */
        fun live(
            host: V18Host,
            transport: suspend (JSONObject, ThesisContext) -> JSONObject = { body, thesis -> host.repository.streamDebate(body, thesis) { } },
        ): Environment {
            // The server counted a read, or refused one at a premium level: the balances the app shows
            // (reads left, the level meters) are read again. That request costs no read; the repository
            // does not guard it, so the consent is checked here. One at a time.
            var refreshing: Job? = null
            val refreshBalance = {
                if (refreshing?.isActive != true) {
                    val fence = host.fence()
                    refreshing = host.scope.launch {
                        if (!fence.isCurrent || !host.riskAccepted) return@launch
                        try {
                            host.repository.access()
                        } catch (cancelled: CancellationException) {
                            throw cancelled
                        } catch (_: Exception) {
                            // The balance stays as it was; the Credits screen reads it again when it opens.
                        }
                    }
                }
            }
            return Environment(
                book = host.theses,
                words = V18HostWords(host),
                owner = { host.owner },
                epoch = { host.accountEpoch },
                riskAccepted = { host.riskAccepted },
                level = { host.analysisLevel },
                now = { host.now() },
                send = { request ->
                    try {
                        DeskOutcome.of(200, transport(host.deskBody(request.symbol, request.question, request.isEquity, request.level), request.thesis))
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (error: Exception) {
                        DeskOutcome.of(error)
                    }
                },
                accessChanged = { refreshBalance() },
                meterChanged = { refreshBalance() },
                events = ThesisEvents.of(host),
            )
        }
    }
}

/**
 * One refusal as the screen says it: what happened, what was (not) used, and the next step.
 * `proPurchasable`: Bobby Pro can be bought in this build, from this store, right now (the Credits
 * snapshot's own gate). Where it cannot, Bobby Pro is not offered as the way forward.
 */
class ThesisRefusalCopy(refusal: ThesisReviewer.Refusal, words: HostWords, proPurchasable: Boolean) {
    enum class Action { SIGN_IN, PRO, QUICK, RETRY, CREDITS, MY_THESES }

    val text: String
    val detail: String?
    val actions: List<Action>

    init {
        val copy = ThesisCopy(words)
        var line = ""
        var more: String? = null
        var next: List<Action> = emptyList()
        when (refusal) {
            is ThesisReviewer.Refusal.RiskNotice ->
                line = words.text("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                                  "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores.")
            is ThesisReviewer.Refusal.NotFound -> {
                line = words.text("This thesis is not available in this account.", "Esta tesis no está disponible en esta cuenta.")
                next = listOf(Action.MY_THESES)
            }
            is ThesisReviewer.Refusal.WrittenSignedOut -> {
                line = words.text("You wrote this thesis before signing in.", "Escribiste esta tesis antes de iniciar sesión.")
                more = words.text("Open My theses to keep it in this account.", "Abre Mis tesis para conservarla en esta cuenta.")
                next = listOf(Action.MY_THESES)
            }
            is ThesisReviewer.Refusal.Archived -> {
                line = words.text("This thesis is archived. Reopen it to review it.", "Esta tesis está archivada. Reábrela para revisarla.")
                next = listOf(Action.MY_THESES)
            }
            is ThesisReviewer.Refusal.SignIn -> {
                val level = refusal.level
                if (level != null && level != ThesisReviewer.QUICK) {
                    line = words.text("{0} needs a free account, so this review did not run.",
                                      "{0} necesita tu cuenta gratis, así que esta revisión no corrió.", copy.levelName(level))
                    next = listOf(Action.SIGN_IN, Action.QUICK)
                } else {
                    line = words.text("You used the reads available without an account, so this review did not run.",
                                      "Ya usaste las lecturas disponibles sin cuenta, así que esta revisión no corrió.")
                    more = words.text("Sign in with a free account and review it again.", "Entra con tu cuenta gratis y vuelve a revisarla.")
                    next = listOf(Action.SIGN_IN)
                }
            }
            is ThesisReviewer.Refusal.Subscription -> {
                line = words.text("You used your free reads, so this review did not run.",
                                  "Ya usaste tus lecturas gratis, así que esta revisión no corrió.")
                more = refusal.resetsAtMillis?.let { words.text("Free reads come back on {0}.", "Las lecturas gratis vuelven el {0}.", copy.longDay(it)) }
                // Android only (on iPhone Bobby Pro can always be bought): a paywall whose one button is
                // switched off is not a next step. Credits is, with its invitation and its code.
                next = listOf(if (proPurchasable) Action.PRO else Action.CREDITS)
            }
            is ThesisReviewer.Refusal.LevelUsed -> {
                val name = copy.levelName(refusal.level)
                val day = refusal.resetsAtMillis?.let { copy.longDay(it) }
                line = if (day != null) words.text("Your {0} comes back on {1}.", "Tu {0} vuelve el {1}.", name, day)
                       else words.text("You used your {0} for now.", "Ya usaste tu {0} por ahora.", name)
                more = words.text("This review did not run.", "Esta revisión no corrió.")
                next = if (refusal.level == ThesisReviewer.QUICK) emptyList() else listOf(Action.QUICK)
            }
            is ThesisReviewer.Refusal.Paused -> {
                if (refusal.quickWorks) {
                    line = words.text("{0} is paused for today.", "{0} está en pausa por hoy.", copy.levelName(refusal.level))
                    more = words.text("Quick still works.", "Rápido sigue disponible.")
                    next = listOf(Action.QUICK)
                } else {
                    line = words.text("Analysis is paused for now.", "El análisis está en pausa por ahora.")
                    more = words.text("Please try again later.", "Inténtalo más tarde.")
                }
            }
            is ThesisReviewer.Refusal.Quota -> {
                line = words.text("Bobby reached today’s analysis limit, so this review did not run.",
                                  "Bobby llegó al límite de análisis de hoy, así que esta revisión no corrió.")
                more = words.text("Please try again later.", "Inténtalo más tarde.")
            }
            is ThesisReviewer.Refusal.Failed -> {
                line = words.text("The review did not finish. Nothing was used.", "La revisión no terminó. No se usó nada.")
                next = listOf(Action.RETRY)
            }
            is ThesisReviewer.Refusal.Uncertain -> {
                line = words.text("The review did not finish.", "La revisión no terminó.")
                more = words.text("It may not have counted; check your credits.", "Puede que no haya contado; revisa tus créditos.")
                next = listOf(Action.RETRY, Action.CREDITS)
            }
            is ThesisReviewer.Refusal.Unreadable -> {
                line = words.text("Bobby’s answer could not be read.", "No se pudo leer la respuesta de Bobby.")
                more = words.text("It may have used a read; check your credits.", "Puede que haya usado una lectura; revisa tus créditos.")
                next = listOf(Action.RETRY, Action.CREDITS)
            }
        }
        text = line
        detail = more
        actions = next
    }
}
