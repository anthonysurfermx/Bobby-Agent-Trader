package xyz.bobbyprotocol.android.v18.notify

import org.json.JSONObject
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

// What the reminders and the follow-ups both use to show a line on the phone later, so neither
// invents its own. No Android classes here: the real one is platform/AndroidLocalNotifier.kt, and
// tests use MemoryLocalNotifier.
//
// Delivery on Android is inexact (WorkManager): the system may hold a notice back while the phone
// is idle. Copy must never promise a minute. Because of that a notice says what it asks of a late
// phone (`LocalNotice.Delivery`), and `NoticeTiming` decides what the worker does when it finally runs.

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
    /**
     * What it asks of a phone that runs late. The channel's own unless the notice says otherwise: a
     * follow-up keeps to the day's allowed hours and expires; a thesis reminder is shown however late.
     */
    val delivery: Delivery = Delivery.of(channel),
) {
    /**
     * The system may hold planned work back for hours while the phone is idle, and a phone that was
     * off runs what it missed when it comes back. A notice may therefore ask for:
     *  - allowed hours on the phone's own clock, from `fromHour`:00 to `untilHour`:00. Outside them
     *    it is not shown; it waits for the next allowed hour;
     *  - an expiry. Later than `expiresAfterMs` after its moment it is not shown at all.
     * `ANY_TIME` asks for neither.
     */
    data class Delivery(val fromHour: Int? = null, val untilHour: Int? = null, val expiresAfterMs: Long? = null) {
        /** Both hours or neither, a real span inside one day, and an expiry that is a length of time. */
        val isValid: Boolean
            get() {
                val from = fromHour
                val until = untilHour
                val hours = (from == null && until == null) || (from != null && until != null && from in 0..22 && until in 1..23 && from < until)
                return hours && (expiresAfterMs == null || expiresAfterMs > 0)
            }

        fun toJson(): JSONObject = JSONObject().also { json ->
            if (fromHour != null) json.put("from", fromHour)
            if (untilHour != null) json.put("until", untilHour)
            if (expiresAfterMs != null) json.put("expiresAfterMs", expiresAfterMs)
        }

        companion object {
            /** Shown whenever the phone gets to it, however late: a thesis reminder, on the day the person chose. */
            val ANY_TIME = Delivery()

            /**
             * A follow-up: 09:00 to 21:00 on the phone's clock (the hours HarnessPlanner plans inside)
             * and never more than a day late. Past that the same line already waits on the glass.
             */
            val FOLLOW_UP = Delivery(fromHour = 9, untilHour = 21, expiresAfterMs = 24 * 3_600_000L)

            fun of(channel: String): Delivery = if (channel == CHANNEL_FOLLOW_UPS) FOLLOW_UP else ANY_TIME

            /** What was stored with a planned notice; the channel's own when nothing usable was. */
            fun fromJson(json: JSONObject?, channel: String): Delivery {
                if (json == null) return of(channel)
                val parsed = Delivery((json.opt("from") as? Number)?.toInt(), (json.opt("until") as? Number)?.toInt(), (json.opt("expiresAfterMs") as? Number)?.toLong())
                return if (parsed.isValid) parsed else of(channel)
            }
        }
    }

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
                notice.payload.size <= PAYLOAD_LIMIT && notice.payload.all { (key, value) -> key.isNotEmpty() && key.length <= 40 && value.length <= VALUE_LIMIT } &&
                notice.delivery.isValid
    }
}

/**
 * What the phone does with a planned notice when its work finally runs. Pure: the clock and the
 * time zone are handed in, so every case is a unit test. The worker (platform/AndroidLocalNotifier.kt)
 * only carries the answer out.
 */
object NoticeTiming {
    /**
     * No phone runs work on the dot. A notice that runs within this long of its own moment is on
     * time, and one that is on time for a moment inside its allowed hours is shown even when the
     * clock has just passed their end: the last allowed moment (21:00 sharp) is itself a moment
     * follow-ups are planned for, for someone who asks late in the evening.
     */
    const val GRACE_MS = 15 * 60_000L

    sealed class Decision {
        /** Show it now. */
        data object Post : Decision()

        /** Not now: it stays pending and the phone asks again at this moment, the next allowed hour. */
        data class Wait(val untilEpochMs: Long) : Decision()

        /** Too late to be worth showing. It is no longer pending and nothing is shown. */
        data object Drop : Decision()
    }

    fun decide(notice: LocalNotice, nowMs: Long, zone: ZoneId): Decision = decide(notice.fireAtEpochMs, notice.delivery, nowMs, zone)

    fun decide(fireAtMs: Long, delivery: LocalNotice.Delivery, nowMs: Long, zone: ZoneId): Decision {
        val expires = delivery.expiresAfterMs
        if (expires != null && nowMs - fireAtMs > expires) return Decision.Drop
        val from = delivery.fromHour
        val until = delivery.untilHour
        if (from == null || until == null || !delivery.isValid) return Decision.Post
        if (allowed(nowMs, from, until, zone)) return Decision.Post
        // Outside the hours, but on time for a moment that was inside them.
        val late = nowMs - fireAtMs
        if (late >= 0 && late <= GRACE_MS && allowed(fireAtMs, from, until, zone)) return Decision.Post
        // Before the day's first allowed hour it waits for it; after the last, for tomorrow's.
        val today = hourOn(nowMs, from, 0, zone)
        val next = if (nowMs < today) today else hourOn(nowMs, from, 1, zone)
        // Waiting would carry it past its expiry: dropped now, so nothing stays listed that will never be shown.
        if (expires != null && next - fireAtMs > expires) return Decision.Drop
        return Decision.Wait(next)
    }

    /** From `from`:00 to `until`:00, both included, on the local day `ms` falls on. */
    private fun allowed(ms: Long, from: Int, until: Int, zone: ZoneId): Boolean = ms >= hourOn(ms, from, 0, zone) && ms <= hourOn(ms, until, 0, zone)

    /** `hour`:00 on the local day `ms` falls on, or `daysAhead` days after it. */
    private fun hourOn(ms: Long, hour: Int, daysAhead: Long, zone: ZoneId): Long =
        ZonedDateTime.of(Instant.ofEpochMilli(ms).atZone(zone).toLocalDate().plusDays(daysAhead), LocalTime.of(hour, 0), zone).toInstant().toEpochMilli()
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

/**
 * Where the person stands with Bobby's notifications, from what the phone can say. Pure, so the
 * rule is a unit test; platform/AndroidLocalNotifier.kt reads the three facts and asks here.
 *  - `notificationsOn`: the system lets Bobby post right now (the permission, and Bobby's
 *    notifications not switched off in the system).
 *  - `runtimeGranted`: the notification permission itself is granted. Always true before
 *    Android 13, where there is no question to ask.
 *  - `asked`: Bobby has put the system's question to the person once (the system shows it once).
 */
object NoticePermission {
    fun status(notificationsOn: Boolean, runtimeGranted: Boolean, asked: Boolean): LocalNotifier.Permission = when {
        notificationsOn -> LocalNotifier.Permission.ALLOWED
        !runtimeGranted && !asked -> LocalNotifier.Permission.NOT_DETERMINED
        else -> LocalNotifier.Permission.DENIED
    }

    /**
     * Whether the system's question can still change anything. Not once notifications are on, and
     * not while the permission is granted but notifications are off: then they were switched off
     * in the system's settings, and only the settings can switch them back on.
     */
    fun canAsk(notificationsOn: Boolean, runtimeGranted: Boolean): Boolean = !notificationsOn && !runtimeGranted
}
