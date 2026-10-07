package xyz.bobbyprotocol.android.v18.notify

// What the reminders and the follow-ups both use to show a line on the phone later, so neither
// invents its own. No Android classes here: the real one is platform/AndroidLocalNotifier.kt, and
// tests use MemoryLocalNotifier.
//
// Delivery on Android is inexact (WorkManager): the system may hold a notice back while the phone
// is idle. Copy must never promise a minute.

/** One planned line: what the phone shows and what a tap carries. */
data class LocalNotice(
    /** Stable per thing planned (`v18.reminder.<thesisId>`, `v18.follow.<step>`): scheduling the same id again replaces it. */
    val id: String,
    val title: String,
    val body: String,
    val fireAtEpochMs: Long,
    /** `CHANNEL_THESIS_REMINDERS` or `CHANNEL_FOLLOW_UPS`. */
    val channel: String,
    /**
     * What the tap hands to `V18Host.onNotificationTap`. Strings only. `KIND` picks the handler.
     * With `OWNER` (the reader tag, `V18Host.readerTag`) the phone shows the notice only to that
     * reader, and a tap by anyone else opens nothing.
     */
    val payload: Map<String, String> = emptyMap(),
) {
    companion object {
        const val CHANNEL_THESIS_REMINDERS = "thesis-reminders"
        const val CHANNEL_FOLLOW_UPS = "follow-ups"
        val CHANNELS: Set<String> = setOf(CHANNEL_THESIS_REMINDERS, CHANNEL_FOLLOW_UPS)

        /** Payload key: which feature the notice belongs to (`thesis-review`, `follow-up`). */
        const val KIND = "kind"
        /** Payload key: the reader it was planned for. */
        const val OWNER = "owner"

        val ID_PATTERN = Regex("^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$")
        const val PAYLOAD_LIMIT = 16
        const val VALUE_LIMIT = 200

        /** A notice the phone can keep and hand back: a plain id, a known channel, something to say, a small payload. */
        fun valid(notice: LocalNotice): Boolean =
            ID_PATTERN.matches(notice.id) && notice.channel in CHANNELS && notice.title.isNotBlank() && notice.body.isNotBlank() &&
                notice.payload.size <= PAYLOAD_LIMIT && notice.payload.all { (key, value) -> key.isNotEmpty() && key.length <= 40 && value.length <= VALUE_LIMIT }
    }
}

interface LocalNotifier {
    enum class Permission {
        /** Never asked (Android 13 and later). */
        NOT_DETERMINED,
        /** The person said no, or switched Bobby's notifications off in the system. */
        DENIED,
        ALLOWED,
    }

    fun status(): Permission

    /**
     * Shows the system's question when it can still be asked. ONLY ever called from a person's own
     * tap on a button that sets a reminder or accepts follow-ups: never on launch, never on opening
     * a screen. True when notifications are allowed afterwards.
     */
    suspend fun requestPermission(): Boolean

    /**
     * Plans the notice, replacing a pending one with the same id. False when it was not planned:
     * notifications are not allowed, its moment has passed, or it is not a valid notice.
     */
    fun schedule(notice: LocalNotice): Boolean

    /** Pending notices with these ids will not be shown. */
    fun cancel(ids: Collection<String>)

    /** Takes already shown notices off the notification shade and the lock screen. */
    fun clearDelivered(ids: Collection<String>)

    /** What the phone will still deliver. */
    fun pendingIds(): Set<String>
}

/** The notifier for tests: nothing leaves memory, and time is whatever the test says it is. */
class MemoryLocalNotifier(var now: () -> Long = { System.currentTimeMillis() }) : LocalNotifier {
    var permission = LocalNotifier.Permission.NOT_DETERMINED
    /** What the person answers when asked. */
    var grantsWhenAsked = true
    /** How many times the system's question was shown. */
    var asked = 0
        private set
    private val pending = LinkedHashMap<String, LocalNotice>()
    /** Shown and not cleared, oldest first. */
    val delivered = ArrayList<LocalNotice>()

    val scheduled: List<LocalNotice> get() = pending.values.toList()
    fun notice(id: String): LocalNotice? = pending[id]

    override fun status(): LocalNotifier.Permission = permission

    override suspend fun requestPermission(): Boolean {
        if (permission == LocalNotifier.Permission.NOT_DETERMINED) {
            asked += 1
            permission = if (grantsWhenAsked) LocalNotifier.Permission.ALLOWED else LocalNotifier.Permission.DENIED
        }
        return permission == LocalNotifier.Permission.ALLOWED
    }

    override fun schedule(notice: LocalNotice): Boolean {
        if (permission != LocalNotifier.Permission.ALLOWED || !LocalNotice.valid(notice) || notice.fireAtEpochMs <= now()) return false
        pending[notice.id] = notice
        return true
    }

    override fun cancel(ids: Collection<String>) {
        for (id in ids) pending.remove(id)
    }

    override fun clearDelivered(ids: Collection<String>) {
        delivered.removeAll { it.id in ids }
    }

    override fun pendingIds(): Set<String> = pending.keys.toSet()

    /** Time passed: every notice due by now is shown (when still allowed) and is no longer pending. Returns what was shown. */
    fun deliverDue(): List<LocalNotice> {
        val due = pending.values.filter { it.fireAtEpochMs <= now() }.sortedBy { it.fireAtEpochMs }
        for (notice in due) pending.remove(notice.id)
        val shown = if (permission == LocalNotifier.Permission.ALLOWED) due else emptyList()
        delivered.addAll(shown)
        return shown
    }
}
