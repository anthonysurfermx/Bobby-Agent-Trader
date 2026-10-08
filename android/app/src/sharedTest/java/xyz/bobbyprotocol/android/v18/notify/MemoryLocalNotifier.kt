package xyz.bobbyprotocol.android.v18.notify

import java.time.ZoneId

// In `src/sharedTest`: the JVM tests and the instrumented tests both compile it, and it ships in
// neither APK (it used to sit next to the interface in the app's own sources).

/** The notifier for tests: nothing leaves memory, and time is whatever the test says it is. */
class MemoryLocalNotifier(var now: () -> Long = { System.currentTimeMillis() }) : LocalNotifier {
    /**
     * The phone's time zone. With one set this is a phone that runs late: `deliverDue` asks
     * `NoticeTiming` what the phone's worker asks (allowed hours, expiry, room from the last one
     * shown), and a notice counts as shown only once `deliverDue` showed it, at the test's clock.
     * Without one it is a punctual phone: every due notice is shown, at its own moment.
     */
    var zone: ZoneId? = null
    var permission = LocalNotifier.Permission.NOT_DETERMINED
    /** What the person answers when asked. */
    var grantsWhenAsked = true
    /** Kinds of notice the person switched off in the phone's own settings, while Bobby's notifications stay allowed. */
    val channelsOff = HashSet<String>()
    /** How many times the system's question was shown. */
    var asked = 0
        private set
    private val pending = LinkedHashMap<String, LocalNotice>()
    /** Shown and not cleared, oldest first. */
    val delivered = ArrayList<LocalNotice>()

    /** What the phone really showed, per id: the notice (its planned moment, its channel) and the moment it went up. */
    private class Showing(val notice: LocalNotice, val at: Long)
    private val showings = HashMap<String, Showing>()

    val scheduled: List<LocalNotice> get() = pending.values.toList()
    fun notice(id: String): LocalNotice? = pending[id]

    override fun status(): LocalNotifier.Permission = permission

    override fun status(channel: String): LocalNotifier.Permission =
        if (permission == LocalNotifier.Permission.ALLOWED && channel in channelsOff) LocalNotifier.Permission.DENIED else permission

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
        for (id in ids) {
            pending.remove(id)
            showings.remove(id)
        }
    }

    override fun clearDelivered(ids: Collection<String>) {
        delivered.removeAll { it.id in ids }
    }

    override fun pendingIds(): Set<String> = pending.keys.toSet()

    /**
     * What the phone showed. A punctual phone (no `zone`) also showed, at its own moment, a notice
     * it still lists whose moment has passed: a test that only moves the clock need not call
     * `deliverDue` for the phone to have done its part.
     */
    override fun shownAt(id: String, fireAtEpochMs: Long): Long? {
        val showing = showings[id]
        if (showing != null && showing.notice.fireAtEpochMs == fireAtEpochMs) return showing.at
        if (zone != null) return null
        val listed = pending[id] ?: return null
        val on = permission == LocalNotifier.Permission.ALLOWED && listed.channel !in channelsOff
        return if (on && listed.fireAtEpochMs == fireAtEpochMs && fireAtEpochMs <= now()) fireAtEpochMs else null
    }

    /** The latest moment a notice of `channel` was shown, or null. */
    private fun lastShown(channel: String): Long? = showings.values.filter { it.notice.channel == channel }.maxOfOrNull { it.at }

    /**
     * Time passed: every notice due by now is shown (when still allowed) and is no longer pending.
     * With a `zone`, a notice outside its allowed hours or too close to the last one of its kind
     * stays pending, and an expired one is dropped unseen, as on the phone. Returns what was shown.
     */
    fun deliverDue(): List<LocalNotice> {
        val clock = now()
        val phone = zone
        val shown = ArrayList<LocalNotice>()
        for (notice in pending.values.filter { it.fireAtEpochMs <= clock }.sortedBy { it.fireAtEpochMs }) {
            when (if (phone == null) NoticeTiming.Decision.Post else NoticeTiming.decide(notice, clock, phone, lastShown(notice.channel))) {
                is NoticeTiming.Decision.Wait -> Unit
                NoticeTiming.Decision.Drop -> pending.remove(notice.id)
                NoticeTiming.Decision.Post -> {
                    pending.remove(notice.id)
                    if (permission == LocalNotifier.Permission.ALLOWED && notice.channel !in channelsOff) {
                        shown.add(notice)
                        showings[notice.id] = Showing(notice, if (phone == null) notice.fireAtEpochMs else clock)
                    }
                }
            }
        }
        delivered.addAll(shown)
        return shown
    }
}
