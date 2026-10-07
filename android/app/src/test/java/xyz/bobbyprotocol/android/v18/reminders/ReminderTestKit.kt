package xyz.bobbyprotocol.android.v18.reminders

import org.json.JSONObject
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime

// What the reminder suites share: a notifier that can refuse and that remembers what it was asked
// (the iOS FakeReminderNotifier), wall-clock helpers, and the app's real words in six languages.

/** The phone's notifier as the reminder tests see it: nothing here touches Android. */
class FakeReminderNotifier(var now: () -> Long) : LocalNotifier {
    var permission = LocalNotifier.Permission.NOT_DETERMINED
    /** What the person answers when the phone asks. */
    var grantsWhenAsked = true
    var addSucceeds = true
    /** Notices the phone refuses whatever `addSucceeds` says (by id). */
    var refusedIds: Set<String> = emptySet()
    /** The phone's scheduler fails outright instead of answering. */
    var scheduleThrows = false
    /** Runs while "the phone is asking" (an account switch, another tap, in the middle of the prompt). */
    var whileAsking: (suspend () -> Unit)? = null
    var permissionRequests = 0
        private set
    val added = ArrayList<LocalNotice>()
    val removed = ArrayList<String>()
    val requests = LinkedHashMap<String, LocalNotice>()

    override fun status(): LocalNotifier.Permission = permission

    override suspend fun requestPermission(): Boolean {
        permissionRequests += 1
        whileAsking?.invoke()
        permission = if (grantsWhenAsked) LocalNotifier.Permission.ALLOWED else LocalNotifier.Permission.DENIED
        return grantsWhenAsked
    }

    override fun schedule(notice: LocalNotice): Boolean {
        if (scheduleThrows) throw IllegalStateException("the scheduler is not available")
        if (permission != LocalNotifier.Permission.ALLOWED || !LocalNotice.valid(notice) || notice.fireAtEpochMs <= now()) return false
        if (!addSucceeds || notice.id in refusedIds) return false
        added.add(notice)
        requests[notice.id] = notice
        return true
    }

    override fun cancel(ids: Collection<String>) {
        removed.addAll(ids)
        for (id in ids) requests.remove(id)
    }

    override fun clearDelivered(ids: Collection<String>) {}

    override fun pendingIds(): Set<String> = requests.keys.toSet()

    /** The phone showed it (or lost it): it is no longer pending there. */
    fun deliver(id: String) {
        requests.remove(id)
    }

    /** A relaunch keeps what the phone holds and forgets what the app did. */
    fun forgetHistory() {
        added.clear()
        removed.clear()
    }
}

/** Moments on a wall clock. */
object Wall {
    fun at(zone: ZoneId, year: Int, month: Int, day: Int, hour: Int = 0, minute: Int = 0, second: Int = 0): Long =
        ZonedDateTime.of(year, month, day, hour, minute, second, 0, zone).toInstant().toEpochMilli()

    /** Year, month, day, hour, minute, second as that zone's clock reads them. */
    fun parts(ms: Long, zone: ZoneId): List<Int> {
        val t = Instant.ofEpochMilli(ms).atZone(zone)
        return listOf(t.year, t.monthValue, t.dayOfMonth, t.hour, t.minute, t.second)
    }
}

/** The app's own lookup (NucleoSession.text) over the two bundled catalogs, for one language. */
object TestWords {
    val languages = listOf("en", "es", "fr", "pt", "it", "de")
    private val androidCatalog = JSONObject(File("src/main/assets/nucleo/native-android-translations.json").readText())
    private val originalCatalog = JSONObject(File("src/main/assets/nucleo/native-translations.json").readText())

    fun of(language: String): (String, String) -> String = { en, es ->
        when (language) {
            "en" -> en
            "es" -> text(androidCatalog.optJSONObject(en), "es") ?: es
            else -> text(androidCatalog.optJSONObject(en), language) ?: text(originalCatalog.optJSONObject(en), language) ?: en
        }
    }

    /** The four translations the catalogs hold for an English line, by language; empty when it has no row. */
    fun translations(english: String): Map<String, String> =
        listOf("fr", "pt", "it", "de").mapNotNull { language ->
            (text(androidCatalog.optJSONObject(english), language) ?: text(originalCatalog.optJSONObject(english), language))?.let { language to it }
        }.toMap()

    private fun text(row: JSONObject?, key: String): String? = (row?.opt(key) as? String)?.takeIf { it.isNotEmpty() }
}
