package xyz.bobbyprotocol.android.v18.credits

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingOfferingsStatus
import xyz.bobbyprotocol.android.billing.BillingOutcome
import xyz.bobbyprotocol.android.data.BobbyQuotaState
import xyz.bobbyprotocol.android.data.QuotaMeter
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes

// Credits (1.8) as the app runs it on Android: what the server said about the reader who is here
// now, the restore steps, the gift ledger, and the hooks that keep them current. One per host
// (`CreditsCenter.of(host)`), shared by the Credits screen, the invite screen and the two nudge
// sources. On iOS this is the work of BobbyAccessCenter, NucleoLevelCenter and CreditsSheet.

/** What the app already holds about the meters, tagged with the reader it belongs to. */
data class HeldMeters(
    val owner: String?,
    val epoch: Long,
    val access: ReadAccess?,
    val meters: Map<CreditsLevel, LevelMeter>,
)

/** The little Credits needs from the network and from what the app has already read. */
interface CreditsBackend {
    /** GET /api/bobby-access for the reader who is here now, as the server sent it. Throws when it cannot be read. */
    suspend fun access(): JSONObject
    /** What the app holds now: every balance read and every redeemed code lands there. Null while nothing is bound. */
    fun held(): HeldMeters?
    /** Emits when what is held changes. */
    val changes: Flow<Unit>
}

/**
 * The app's own: the repository's request and its shared quota store. A host that has no
 * repository to give (a session without the network behind it) holds nothing and publishes nothing.
 */
class RepositoryCreditsBackend(private val host: V18Host) : CreditsBackend {
    override suspend fun access(): JSONObject = host.repository.access()

    override fun held(): HeldMeters? = try { convert(host.repository.quota.value) } catch (_: IllegalStateException) { null }

    override val changes: Flow<Unit>
        get() = try { host.repository.quota.map { } } catch (_: IllegalStateException) { emptyFlow() }

    private fun convert(state: BobbyQuotaState): HeldMeters? {
        val owner = state.owner ?: return null
        val quick = state.access?.let { ReadAccess(it.tier, it.used ?: 0, it.limit, it.remaining, it.resetsAt, it.paywall, it.bonus) }
        val meters = LinkedHashMap<CreditsLevel, LevelMeter>()
        state.levels?.let { levels ->
            meters[CreditsLevel.PROFUNDO] = meter(levels.profundo)
            meters[CreditsLevel.MAXIMO] = meter(levels.maximo)
        }
        return HeldMeters(owner.userId, owner.epoch, quick, meters)
    }

    private fun meter(from: QuotaMeter): LevelMeter = LevelMeter(from.used, from.limit, from.remaining, from.bonus, from.windowDays, from.resetsAt)
}

/**
 * Android only. MainActivity closes whatever sheet is open when a sign-in that started from it
 * completes (as it has since 1.1.4). On iOS the sheet stays and shows what the account has. This
 * brings the sheet back for the account that just arrived, once the first one has really gone.
 */
class SignInReturn(private val host: V18Host, private val route: String) {
    private var armed = false
    private var returning: Job? = null

    /** A sign-in was started here and its sheet is still owed to the person. */
    val isPending: Boolean get() = armed || returning?.isActive == true

    /** The person asked to sign in from this sheet. */
    fun arm() {
        armed = true
    }

    /** The sheet was closed before any account arrived: there is nothing to come back to. */
    fun disarm() {
        armed = false
        returning?.cancel()
        returning = null
    }

    /**
     * Call when the account changes. True when the person signed in from this sheet: `prepare` runs
     * first (a claim, a restore), then the sheet opens again as soon as nothing else is up.
     */
    fun accountChanged(prepare: suspend () -> Unit = {}): Boolean {
        if (!armed) return false
        armed = false
        if (!host.signedIn) return false
        val fence = host.fence()
        returning?.cancel()
        returning = host.scope.launch {
            prepare()
            var waited = 0L
            while (host.sheetRoute != null && waited < WAIT_LIMIT) {
                delay(STEP)
                waited += STEP
            }
            if (fence.isCurrent && host.sheetRoute == null) host.present(route)
        }
        return true
    }

    companion object {
        const val STEP = 250L
        /**
         * Past this the sheet is not brought back: whatever is open stays. The activity closes the
         * first sheet as soon as it has synced the account that arrived (a second or two).
         */
        const val WAIT_LIMIT = 20_000L
    }
}

class CreditsCenter(private val host: V18Host, private val backend: CreditsBackend) {
    val book = CreditsGiftBook(host.store)
    val plans = CreditsPlans()
    val back = SignInReturn(host, V18Routes.CREDITS)

    private val mutableRevision = MutableStateFlow(0)
    /** Changes whenever anything a screen draws from this centre may have changed. */
    val revision: StateFlow<Int> = mutableRevision.asStateFlow()

    /** The last reply this centre read, and whose it is. */
    private var body: JSONObject? = null
    private var bodyOwner: String? = null
    private var bodyEpoch = 0L
    private var bodyAt = 0L
    private var started = false
    private var restoreAfterSignIn = false
    private var refreshJob: Job? = null

    val flow = CreditsFlow(
        CreditsFlow.Environment(
            riskAccepted = { host.riskAccepted },
            signedIn = { host.signedIn },
            epoch = { host.accountEpoch },
            load = { load() },
            restore = { restore() },
        ),
        onChange = { changed() },
    )

    /** Once per host: what an earlier launch left, the hooks, and a first reading when the notice is accepted. */
    fun start() {
        if (started) return
        started = true
        book.load()
        host.onAccountChanged { accountChanged() }
        host.onAppActive { if (stale()) refreshSoon() }
        // Every read moves the meter: ask the server what is left now (the request counts as no read).
        host.onReadDelivered { refreshSoon() }
        host.onAccountDeleted { deleted -> book.forget(deleted) }
        host.scope.launch { backend.changes.collect { heldChanged() } }
        // Whatever the app already read before this centre existed counts too.
        record()
        refreshSoon()
    }

    // What the screens read

    /** A reply for the reader who is here now was read. */
    val loaded: Boolean get() = mine() != null

    /** Google Play purchases exist in this build (it carries the store's key): restore can restore, Bobby Pro can be sold. */
    val storeConfigured: Boolean get() = host.billing.value.offeringsStatus != BillingOfferingsStatus.NOT_CONFIGURED

    /**
     * A restore can restore: this build can ask Google Play, and the server, once it has spoken,
     * can confirm what the store says. Where it cannot, the row is not shown at all.
     */
    val restoreAvailable: Boolean
        get() {
            if (!storeConfigured) return false
            val reply = mine() ?: return true
            return CreditsWire.storeSyncReady(reply)
        }

    /** The freshest word on Quick reads for the reader who is here now, or null. */
    fun access(): ReadAccess? = heldNow()?.access ?: mine()?.let { ReadAccess.fromJson(it.optJSONObject("access")) }

    fun snapshot(): CreditsSnapshot {
        val reply = mine()
        val held = heldNow()
        val referral = Referral.fromJson(reply?.optJSONObject("referral"))
        return CreditsSnapshot(
            access = access(),
            meters = held?.meters?.takeIf { it.isNotEmpty() } ?: CreditsWire.meters(reply),
            referral = referral,
            subscription = Subscription.fromJson(reply?.optJSONObject("subscription")),
            proPurchasable = storeConfigured && CreditsWire.googleSalesReady(reply),
            signedIn = host.signedIn,
            freeReadsPerWeek = plans.freeReadsPerWeek,
            rewardDays = referral?.rewardDays ?: plans.rewardDays,
            maxFriends = plans.maxFriends,
        )
    }

    // What the screens ask for

    /** GET the balances. False when nothing was read and nothing is known. Never before the risk notice. */
    suspend fun load(): Boolean {
        if (!host.riskAccepted) return false
        val fence = host.fence()
        val owner = host.owner
        val epoch = host.accountEpoch
        val reply = try {
            backend.access()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        // An answer for a reader who has left is dropped.
        if (!fence.isCurrent) return false
        if (reply != null) {
            body = reply
            bodyOwner = owner
            bodyEpoch = epoch
            bodyAt = host.now()
            plans.note(reply)
            record()
            changed()
        }
        return reply != null || access() != null
    }

    /** Reads the balances in the background, and tells the page when a line on the glass may have changed. */
    fun refreshSoon() {
        if (!host.riskAccepted || refreshJob?.isActive == true) return
        refreshJob = host.scope.launch {
            val before = Pair(access(), book.ledger)
            load()
            if (Pair(access(), book.ledger) != before) host.sessionChanged()
        }
    }

    /** A sign-in asked for from the Credits screen; `thenRestore` when it was asked for from the restore row. */
    fun signIn(provider: String, thenRestore: Boolean) {
        // The account's answer is not sent to the server before the notice.
        if (!host.riskAccepted) return
        restoreAfterSignIn = thenRestore
        back.arm()
        host.signIn(provider)
    }

    /** The gifted balance is on screen: the glass has no reason to announce it again. */
    fun acknowledgeGifts() {
        if (host.riskAccepted && access() != null) book.acknowledge()
    }

    /** The Credits screen left the screen. */
    fun screenGone() {
        if (!host.signedIn) {
            // Closed before any account arrived: nothing waits for a sign-in any more.
            back.disarm()
            restoreAfterSignIn = false
        }
        if (!back.isPending) flow.dismissAnswer()
    }

    // Hooks

    private fun accountChanged() {
        flow.accountChanged()
        book.accountChanged(host.owner)
        // The last reply was about someone else.
        body = null
        val thenRestore = restoreAfterSignIn
        restoreAfterSignIn = false
        if (back.accountChanged()) {
            // The person signed in from Credits: read what the account has, and restore if that is why they signed in.
            host.scope.launch { flow.signIn(thenRestore) { } }
        } else {
            // A new account has its own allowance.
            refreshSoon()
        }
        record()
        changed()
    }

    private fun heldChanged() {
        val before = book.ledger
        record()
        changed()
        if (book.ledger != before) host.sessionChanged()
    }

    /** What the app holds now goes into the gift ledger, under the reader it was read for. */
    private fun record() {
        val held = backend.held() ?: return
        val quick = held.access ?: return
        book.record(GiftReading(held.owner, held.epoch, CreditsNudges.giftTotal(quick, held.meters)), host.owner, host.accountEpoch)
    }

    private fun mine(): JSONObject? = body?.takeIf { bodyOwner == host.owner && bodyEpoch == host.accountEpoch }

    private fun heldNow(): HeldMeters? = backend.held()?.takeIf { it.owner == host.owner && it.epoch == host.accountEpoch }

    private fun stale(): Boolean = mine() == null || host.now() - bodyAt >= FRESH_FOR

    /**
     * The store serves one request at a time, and it is busy for a moment right after a sign-in
     * (it is linking the account). Ask again for a while before giving that as the answer.
     */
    private suspend fun restore(): BillingOutcome {
        var outcome = host.restorePurchases()
        var tries = 0
        while (outcome == BillingOutcome.BUSY && tries < BUSY_TRIES) {
            delay(BUSY_WAIT)
            tries += 1
            outcome = host.restorePurchases()
        }
        return outcome
    }

    private fun changed() {
        mutableRevision.value += 1
    }

    companion object {
        const val SERVICE = "v18.credits"
        /** A reading older than this is read again when the app comes to the front. */
        const val FRESH_FOR = 900_000L
        const val BUSY_WAIT = 750L
        const val BUSY_TRIES = 16

        /** The centre of this host, with the app's own backend. */
        fun of(host: V18Host): CreditsCenter = host.service(SERVICE) { CreditsCenter(host, RepositoryCreditsBackend(host)) }

        /** A suite's own backend. The first call for a host decides which one it gets. */
        fun of(host: V18Host, backend: CreditsBackend): CreditsCenter = host.service(SERVICE) { CreditsCenter(host, backend) }
    }
}
