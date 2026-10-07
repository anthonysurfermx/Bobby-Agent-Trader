package xyz.bobbyprotocol.android.v18.reminders

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield
import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.KeyValueStore
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import java.time.ZoneId
import java.util.Locale

// Thesis reminders (1.8), a port of ios/Bobby/Sources/V18/Reminders/ReminderCenter.swift. A reminder
// is a note the person leaves for themselves: "on that day, remind me to review this thesis". It is
// planned ON THIS PHONE as a local notice: no server, no push token, no account needed, and Bobby
// watches nothing in the meantime.
// Invariants:
//  - The notification permission is asked ONLY inside `schedule`, which only a reminder button
//    calls. Never at launch, never from a nudge, never from housekeeping.
//  - Nothing is planned before the risk notice is accepted, and withdrawing it cancels everything.
//    A notice that only has a newer version to read cancels nothing: it stops new reminders until
//    the person has read it.
//  - One pending reminder per thesis, each its own notice carrying its own thesis id, at the time
//    the person chose. Nothing is merged: two set for the same minute are two notices.
//  - The lock-screen text is fixed and generic. No asset, no figure, no thesis text ever reaches it.
//  - A reminder lives exactly as long as its thesis is active for the person using the phone: an
//    archived or deleted thesis, another account, a deleted account or a withdrawn consent cancel it.
//  - What is listed as pending is what the phone will deliver: a delivered reminder leaves the list.
//
// Where Android differs from iOS:
//  - Delivery is inexact. The foundation's notifier plans with WorkManager, and the system may hold
//    a notice back while the phone is idle. A reminder whose moment has passed but which the phone
//    still holds is therefore still to come: it stays listed and is never cancelled for being late.
//  - A notice also carries the reader it was planned for (`LocalNotice.OWNER`, a tag, never the
//    account id), because the phone may show it while the app is closed: another reader never sees it.
//  - Every call to the notifier is synchronous here, so the list and the phone change together.

/** A reminder the person set and that has not fired yet. */
data class PendingReminder(
    val thesisId: String,
    /** The asset's symbol, for the app's own list. It never leaves the phone. */
    val symbol: String,
    val fireAtMillis: Long,
)

class ReminderCenter(private val notifier: LocalNotifier, private val store: KeyValueStore) {
    sealed class Outcome {
        data class Scheduled(val fireAtMillis: Long) : Outcome()

        /** The phone does not let Bobby show notifications: nothing was planned. */
        data object Denied : Outcome()

        /** The risk notice is not accepted: nothing was asked and nothing was planned. */
        data object ConsentRequired : Outcome()

        /** The thesis is not one of this person's active theses. */
        data object UnknownThesis : Outcome()

        /** The account changed while the phone was asking, or the phone refused the notice. */
        data object Failed : Outcome()
    }

    /** What the screen draws from. */
    data class State(
        /** Reminders that have not fired, in the order they were set. */
        val pending: List<PendingReminder> = emptyList(),
        val status: LocalNotifier.Permission = LocalNotifier.Permission.NOT_DETERMINED,
        /** Theses whose reminder is being set right now (the phone may be asking for permission). */
        val scheduling: Set<String> = emptySet(),
    )

    private val current = MutableStateFlow(State(pending = load()))
    val state: StateFlow<State> get() = current

    val pending: List<PendingReminder> get() = current.value.pending
    val status: LocalNotifier.Permission get() = current.value.status
    val scheduling: Set<String> get() = current.value.scheduling

    var now: () -> Long = { System.currentTimeMillis() }
    /** The person's own time zone, read every time a day is chosen. */
    var zone: () -> ZoneId = { ZoneId.systemDefault() }
    /** The lock-screen line in the app's language when a notice is written. */
    var body: () -> String = { "Your reminder to review a thesis." }
    /** The risk notice as the person left it. Until a host says otherwise nothing is planned. */
    var consent: () -> RiskNotice = { RiskNotice.WITHDRAWN }
    var currentUser: () -> String? = { null }
    var currentEpoch: () -> Long = { 0L }
    /** The active theses of whoever uses the phone now (signed out is the local book). */
    var activeTheses: (String?) -> List<SavedThesis> = { emptyList() }
    /** Who a notice is planned for, as it may travel in a payload. */
    var readerTag: () -> String = { V18Reader.tag(currentUser()) }

    /** What this launch handed to the phone, so an unchanged notice is not written twice. */
    private val issued = HashMap<String, LocalNotice>()
    private var started = false

    // Reading

    fun reminder(thesisId: String): PendingReminder? = pending.firstOrNull { it.thesisId.equals(thesisId, ignoreCase = true) }

    fun hasReminder(thesisId: String): Boolean = reminder(thesisId) != null

    // The person's actions

    /** "1 week": the preset's day at 18:00. */
    suspend fun schedule(thesisId: String, symbol: String, preset: ReminderPreset): Outcome =
        schedule(thesisId, symbol, ReminderSchedule.date(preset, now(), zone()))

    /**
     * Sets (or moves) the reminder of one thesis. The ONLY place the phone is asked for permission,
     * and only when it never answered before.
     */
    suspend fun schedule(thesisId: String, symbol: String, atMillis: Long): Outcome {
        if (consent() != RiskNotice.ACCEPTED) return Outcome.ConsentRequired
        val user = currentUser()
        val epoch = currentEpoch()
        val thesis = activeThesis(thesisId, user) ?: return Outcome.UnknownThesis
        if (thesis.id in scheduling) return Outcome.Failed
        current.value = current.value.copy(scheduling = scheduling + thesis.id)
        try {
            var permission = notifier.status()
            if (permission == LocalNotifier.Permission.NOT_DETERMINED) {
                notifier.requestPermission()
                permission = notifier.status()
            }
            current.value = current.value.copy(status = permission)
            if (permission != LocalNotifier.Permission.ALLOWED) return Outcome.Denied
            // The phone may have asked for a while: the answer belongs to whoever tapped, with their
            // consent and their thesis still in place.
            if (currentUser() != user || currentEpoch() != epoch || consent() != RiskNotice.ACCEPTED || activeThesis(thesis.id, user) == null) {
                return Outcome.Failed
            }

            val clock = now()
            // The time the person chose, whatever the other theses have set.
            val fireAt = ReminderSchedule.normalized(atMillis, clock, zone())
            val previousIndex = pending.indexOfFirst { it.thesisId == thesis.id }
            val previous = if (previousIndex >= 0) pending[previousIndex] else null
            val held = notifier.pendingIds()
            val list = pending.filter { it.thesisId != thesis.id && stillToCome(it, clock, held) } +
                PendingReminder(thesis.id, symbol.uppercase(Locale.ROOT), fireAt)
            write(list)
            sync()
            if (!covered(thesis.id, fireAt)) {
                // The phone refused the notice: what the list says must be what the phone will deliver.
                // Only this thesis goes back to what it had; a reminder set for another one meanwhile stays.
                val restored = pending.filter { it.thesisId != thesis.id }.toMutableList()
                if (previous != null && previous.fireAtMillis > now()) restored.add(minOf(previousIndex, restored.size), previous)
                write(restored)
                sync()
                return Outcome.Failed
            }
            return Outcome.Scheduled(fireAt)
        } finally {
            current.value = current.value.copy(scheduling = scheduling - thesis.id)
        }
    }

    fun cancel(thesisId: String) {
        val list = pending.filterNot { it.thesisId.equals(thesisId, ignoreCase = true) }
        if (list.size == pending.size) return
        write(list)
        sync()
    }

    // Housekeeping (never asks for permission)

    /**
     * Called once when the app's screen is built: keeps the list true from then on. A thesis that
     * is archived or deleted loses its reminder; so does everything when another reader takes the
     * phone, when the account is deleted, when "Delete everything" runs or when the risk notice is
     * withdrawn. Coming back to the app reads what was delivered and what Settings changed.
     */
    fun start(host: V18Host) {
        if (started) return
        started = true
        host.theses.addListener { quietly { reconcile() } }
        // A turn later, after the session has finished moving to the new reader.
        host.onAccountChanged {
            host.scope.launch {
                yield()
                quietly { reconcile() }
            }
        }
        host.onConsentWithdrawn { quietly { reconcile() } }
        host.onAccountDeleted { quietly { reconcile() } }
        host.onEraseEverything { quietly { reconcile() } }
        host.onAppActive { quietly { refresh() } }
        // The app speaks another language: a reminder already handed to the phone is written again in it
        // (the line is the same for every thesis; only its language was fixed when it was planned).
        host.onLanguageChanged { quietly { refresh() } }
        host.scope.launch {
            yield()
            quietly { refresh() }
        }
    }

    /** Reads the permission (a local read, no prompt) and brings the list and the phone in line. */
    fun refresh() {
        val permission = notifier.status()
        if (permission != status) current.value = current.value.copy(status = permission)
        reconcile()
    }

    /** Drops every reminder that should no longer fire, then tells the phone. */
    fun reconcile() {
        prune()
        sync()
    }

    private fun prune() {
        // Only a withdrawal erases the list. A notice with a newer version to read (an app update)
        // withdrew nothing: the reminders the person set stay.
        val kept: List<PendingReminder> = if (consent() == RiskNotice.WITHDRAWN) emptyList() else {
            val clock = now()
            val active = activeTheses(currentUser()).map { it.id }.toSet()
            val held = notifier.pendingIds()
            pending.filter { stillToCome(it, clock, held) && it.thesisId in active }
        }
        if (kept != pending) write(kept)
    }

    /** Its moment is ahead, or it has passed and the phone is still holding the notice (it is late, not lost). */
    private fun stillToCome(entry: PendingReminder, clock: Long, held: Set<String>): Boolean =
        entry.fireAtMillis > clock || identifier(entry.thesisId) in held

    // The phone

    /** Brings the phone in line with the list: what left the list is cancelled, what is new or changed is written. */
    private fun sync() {
        val clock = now()
        // A moment that has passed is never handed to the phone.
        val wanted = plan(pending.filter { it.fireAtMillis > clock }, body(), readerTag())
        val listed = pending.map { identifier(it.thesisId) }.toSet()
        val existing = notifier.pendingIds().filter { it.startsWith(IDENTIFIER_PREFIX) }.toSet()
        val stale = existing - listed
        if (stale.isNotEmpty()) attempt { notifier.cancel(stale.sorted()) }
        issued.keys.retainAll(wanted.map { it.id }.toSet())
        // Without permission nothing is written; the list stays and the screen says why.
        if (notifier.status() != LocalNotifier.Permission.ALLOWED) return
        for (notice in wanted) {
            if (issued[notice.id] == notice && notice.id in existing) continue
            // About to fire: whatever the phone already holds under this id stays as it is.
            if (notice.fireAtEpochMs - now() < ReminderSchedule.HAND_OFF_MARGIN_MS) continue
            // A phone that fails to answer has not accepted it.
            val accepted = attempt { notifier.schedule(notice) } ?: false
            if (accepted) issued[notice.id] = notice else issued.remove(notice.id)
        }
    }

    /** The phone's answer, or null when it failed to answer at all: the list must stay what the phone will deliver. */
    private inline fun <T> attempt(block: () -> T): T? = try {
        block()
    } catch (_: Exception) {
        null
    }

    /** The phone accepted this thesis's notice, for that moment, during this launch. */
    private fun covered(thesisId: String, fireAt: Long): Boolean = issued[identifier(thesisId)]?.fireAtEpochMs == fireAt

    private fun activeThesis(thesisId: String, owner: String?): SavedThesis? =
        activeTheses(owner).firstOrNull { it.id.equals(thesisId, ignoreCase = true) }

    /** Reminders must never break the thesis write, the sign-in or the deletion that announced a change. */
    private inline fun quietly(block: () -> Unit) {
        try {
            block()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
        }
    }

    // Store

    private fun load(): List<PendingReminder> {
        val raw = store.getString(STORE_KEY) ?: return emptyList()
        val list = ArrayList<PendingReminder>()
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val row = array.optJSONObject(i) ?: continue
                val thesisId = text(row, "thesisId") ?: continue
                val symbol = text(row, "symbol") ?: continue
                val fireAt = (row.opt("fireAt") as? Number)?.toLong() ?: continue
                list.add(PendingReminder(thesisId, symbol, fireAt))
            }
        } catch (_: Exception) {
            return emptyList()
        }
        return list
    }

    private fun write(list: List<PendingReminder>) {
        current.value = current.value.copy(pending = list)
        if (list.isEmpty()) {
            store.remove(STORE_KEY)
            return
        }
        val array = JSONArray()
        for (entry in list) array.put(JSONObject().put("thesisId", entry.thesisId).put("symbol", entry.symbol).put("fireAt", entry.fireAtMillis))
        store.putString(STORE_KEY, array.toString())
    }

    companion object {
        /** One list for whoever uses the phone now: a change of reader empties it of the previous one's. */
        const val STORE_KEY = "v18.reminders.v1"
        const val KIND = "thesis-review"
        const val THESIS_ID = "thesisId"
        const val IDENTIFIER_PREFIX = "v18.thesis."
        private const val SERVICE = "reminders.center"

        fun identifier(thesisId: String): String = IDENTIFIER_PREFIX + thesisId

        /** The notices the list asks for: one per reminder, each under its own thesis id. */
        fun plan(pending: List<PendingReminder>, body: String, readerTag: String): List<LocalNotice> = pending.map { entry ->
            LocalNotice(
                id = identifier(entry.thesisId), title = ReminderCopy.NOTIFICATION_TITLE, body = body, fireAtEpochMs = entry.fireAtMillis,
                channel = LocalNotice.CHANNEL_THESIS_REMINDERS,
                payload = mapOf(LocalNotice.KIND to KIND, THESIS_ID to entry.thesisId, LocalNotice.OWNER to readerTag),
            )
        }

        /** The one centre of this host, reading the host's clock, reader, consent, theses and words. */
        fun of(host: V18Host): ReminderCenter = host.service(SERVICE) {
            ReminderCenter(host.notifier, host.store).also { center ->
                center.now = { host.now() }
                center.body = { ReminderCopy.of(host).notificationBody }
                center.consent = { host.riskNotice }
                center.currentUser = { host.owner }
                center.currentEpoch = { host.accountEpoch }
                center.activeTheses = { owner -> host.theses.active(owner) }
                center.readerTag = { host.readerTag }
                center.start(host)
            }
        }

        private fun text(json: JSONObject, key: String): String? = if (json.isNull(key)) null else (json.opt(key) as? String)?.takeIf { it.isNotEmpty() }
    }
}
