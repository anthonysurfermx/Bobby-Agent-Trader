package xyz.bobbyprotocol.android.v18.notify

import java.time.ZoneId

// In `src/sharedTest`: the JVM tests and the instrumented tests both compile it, and it ships in
// neither APK (it used to sit next to the interface in the app's own sources).

/** The notifier for tests: nothing leaves memory, and time is whatever the test says it is. */
class MemoryLocalNotifier(var now: () -> Long = { System.currentTimeMillis() }) : LocalNotifier {
    /**
     * The phone's time zone. With one set, `deliverDue` asks `NoticeTiming` what the phone's worker
     * asks (allowed hours, expiry); without one every due notice is shown, as a punctual phone would.
     */
    var zone: ZoneId? = null
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

    /**
     * Time passed: every notice due by now is shown (when still allowed) and is no longer pending.
     * With a `zone`, a notice outside its allowed hours stays pending and an expired one is dropped
     * unseen, as on the phone. Returns what was shown.
     */
    fun deliverDue(): List<LocalNotice> {
        val clock = now()
        val phone = zone
        val shown = ArrayList<LocalNotice>()
        for (notice in pending.values.filter { it.fireAtEpochMs <= clock }.sortedBy { it.fireAtEpochMs }) {
            when (if (phone == null) NoticeTiming.Decision.Post else NoticeTiming.decide(notice, clock, phone)) {
                is NoticeTiming.Decision.Wait -> Unit
                NoticeTiming.Decision.Drop -> pending.remove(notice.id)
                NoticeTiming.Decision.Post -> {
                    pending.remove(notice.id)
                    if (permission == LocalNotifier.Permission.ALLOWED) shown.add(notice)
                }
            }
        }
        delivered.addAll(shown)
        return shown
    }
}
