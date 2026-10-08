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
// For the same reason the phone says what it really did: `LocalNotifier.shownAt` answers when a
// notice was shown, and only then. A feature that counts what a person was shown asks there, never
// its own plan.

/** One planned line: what the phone shows, what a locked phone shows instead, and what a tap carries. */
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
    /**
     * What a locked phone that hides sensitive content shows in place of `body`: the same line
     * without whatever the person would not want read over their shoulder (a follow-up leaves the
     * asset out). Null: the phone shows its own "contents hidden" line.
     */
    val publicBody: String? = null,
    /**
     * One button on the notice, acted on without opening the app (a follow-up's "Stop"). The phone
     * hands `name` and the payload to the feature of `KIND`; it never starts an activity.
     */
    val action: Action? = null,
) {
    /** `name` is what the feature is told (`stop`); `label` is what the button says, in the app's language. */
    data class Action(val name: String, val label: String) {
        val isValid: Boolean get() = ACTION_PATTERN.matches(name) && label.isNotBlank() && label.length <= ACTION_LABEL_LIMIT
    }

    /**
     * The system may hold planned work back for hours while the phone is idle, and a phone that was
     * off runs what it missed when it comes back. A notice may therefore ask for:
     *  - allowed hours on the phone's own clock, from `fromHour`:00 to `untilHour`:00. Outside them
     *    it is not shown; it waits for the next allowed hour;
     *  - an expiry. Later than `expiresAfterMs` after its moment it is not shown at all;
     *  - room. Never on the same local day as, nor sooner than `apartMs` after, the last notice of
     *    its channel the phone really showed: a notice that ran late must not land beside the next
     *    one. It waits for the first allowed moment that is far enough (and expires like any other).
     * `ANY_TIME` asks for none of them.
     */
    data class Delivery(val fromHour: Int? = null, val untilHour: Int? = null, val expiresAfterMs: Long? = null, val apartMs: Long? = null) {
        /** Both hours or neither, a real span inside one day, and an expiry and a gap that are lengths of time. */
        val isValid: Boolean
            get() {
                val from = fromHour
                val until = untilHour
                val hours = (from == null && until == null) || (from != null && until != null && from in 0..22 && until in 1..23 && from < until)
                return hours && (expiresAfterMs == null || expiresAfterMs > 0) && (apartMs == null || apartMs > 0)
            }

        fun toJson(): JSONObject = JSONObject().also { json ->
            if (fromHour != null) json.put("from", fromHour)
            if (untilHour != null) json.put("until", untilHour)
            if (expiresAfterMs != null) json.put("expiresAfterMs", expiresAfterMs)
            if (apartMs != null) json.put("apartMs", apartMs)
        }

        companion object {
            /** Shown whenever the phone gets to it, however late: a thesis reminder, on the day the person chose. */
            val ANY_TIME = Delivery()

            /**
             * A follow-up: 09:00 to 21:00 on the phone's clock (the hours HarnessPlanner plans inside),
             * never more than a day late (past that the same line already waits on the glass), and
             * never on the day of another follow-up nor within 18 hours of it (the planner's own
             * "one a day, 18 hours apart", kept when the phone runs late).
             */
            val FOLLOW_UP = Delivery(fromHour = 9, untilHour = 21, expiresAfterMs = 24 * 3_600_000L, apartMs = 18 * 3_600_000L)

            fun of(channel: String): Delivery = if (channel == CHANNEL_FOLLOW_UPS) FOLLOW_UP else ANY_TIME

            /** What was stored with a planned notice; the channel's own when nothing usable was. */
            fun fromJson(json: JSONObject?, channel: String): Delivery {
                if (json == null) return of(channel)
                val parsed = Delivery((json.opt("from") as? Number)?.toInt(), (json.opt("until") as? Number)?.toInt(), (json.opt("expiresAfterMs") as? Number)?.toLong(),
                                      (json.opt("apartMs") as? Number)?.toLong())
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
        val ACTION_PATTERN = Regex("^[a-z][a-z0-9_.-]{0,31}$")
        const val ACTION_LABEL_LIMIT = 40

        /** A notice the phone can keep and hand back: a plain id, a known channel, something to say, a small payload. */
        fun valid(notice: LocalNotice): Boolean =
            ID_PATTERN.matches(notice.id) && notice.channel in CHANNELS && notice.title.isNotBlank() && notice.body.isNotBlank() &&
                notice.payload.size <= PAYLOAD_LIMIT && notice.payload.all { (key, value) -> key.isNotEmpty() && key.length <= 40 && value.length <= VALUE_LIMIT } &&
                notice.delivery.isValid && (notice.publicBody == null || notice.publicBody.isNotBlank()) && (notice.action == null || notice.action.isValid)
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

    /** `lastShownMs`: when the phone last really showed a notice of this one's channel (null: it never did, or does not know). */
    fun decide(notice: LocalNotice, nowMs: Long, zone: ZoneId, lastShownMs: Long? = null): Decision =
        decide(notice.fireAtEpochMs, notice.delivery, nowMs, zone, lastShownMs)

    fun decide(fireAtMs: Long, delivery: LocalNotice.Delivery, nowMs: Long, zone: ZoneId, lastShownMs: Long? = null): Decision {
        val expires = delivery.expiresAfterMs
        if (expires != null && nowMs - fireAtMs > expires) return Decision.Drop
        val from = delivery.fromHour
        val until = delivery.untilHour
        // Too close to the last one of its kind (it ran late, or this one did): it waits for the first
        // moment that is far enough and inside its hours, unless that would carry it past its expiry.
        val room = notBefore(delivery, lastShownMs, nowMs, zone)
        if (room != null) {
            val next = if (from != null && until != null && delivery.isValid) nextAllowed(room, from, until, zone) else room
            if (expires != null && next - fireAtMs > expires) return Decision.Drop
            return Decision.Wait(next)
        }
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

    /**
     * The first moment this notice may be shown given the last one of its channel, when that moment
     * is still ahead: the later of `apartMs` after it and the start of the next local day. Null when
     * nothing stands in the way (it asks for no room, nothing was shown, or enough time has passed).
     * A last showing dated after now (the clock was set back) says nothing.
     */
    private fun notBefore(delivery: LocalNotice.Delivery, lastShownMs: Long?, nowMs: Long, zone: ZoneId): Long? {
        val apart = delivery.apartMs ?: return null
        if (lastShownMs == null || apart <= 0 || lastShownMs > nowMs) return null
        val nextDay = Instant.ofEpochMilli(lastShownMs).atZone(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val earliest = maxOf(lastShownMs + apart, nextDay)
        return if (nowMs < earliest) earliest else null
    }

    /** `ms` itself when it is inside the allowed hours, else the next first allowed hour. */
    private fun nextAllowed(ms: Long, from: Int, until: Int, zone: ZoneId): Long {
        if (allowed(ms, from, until, zone)) return ms
        val today = hourOn(ms, from, 0, zone)
        return if (ms < today) today else hourOn(ms, from, 1, zone)
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
     * Where the person stands for one kind of notice (`LocalNotice.CHANNEL_…`). On Android a kind
     * can be switched off by itself in the system's settings ("Turn off notifications" on a notice)
     * while Bobby's notifications stay allowed: for that kind it is a no, and the feature that
     * plans it must treat it as one. A notifier that knows no such switch answers `status()`.
     */
    fun status(channel: String): Permission = status()

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

    /**
     * When the phone really showed the notice `id` that was planned for `fireAtEpochMs`: the moment
     * it went up on the notification shade, which on Android can be hours after the one it was
     * planned for. Null when it did not: it has not got to it yet, it is waiting for an allowed
     * hour, it dropped it as too late, it withheld it (another reader, notifications off, the app
     * in front), or its work never ran. Forgotten when the id is cancelled.
     */
    fun shownAt(id: String, fireAtEpochMs: Long): Long? = null
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
     * The same for one kind of notice. `channelOff`: the person switched that kind off in the
     * system's settings. Bobby may still post other kinds, and the system would silently discard
     * this one: it is a no, and only the settings can change it.
     */
    fun status(notificationsOn: Boolean, runtimeGranted: Boolean, asked: Boolean, channelOff: Boolean): LocalNotifier.Permission {
        val whole = status(notificationsOn, runtimeGranted, asked)
        return if (whole == LocalNotifier.Permission.ALLOWED && channelOff) LocalNotifier.Permission.DENIED else whole
    }

    /**
     * Whether the system's question can still change anything. Not once notifications are on, and
     * not while the permission is granted but notifications are off: then they were switched off
     * in the system's settings, and only the settings can switch them back on.
     */
    fun canAsk(notificationsOn: Boolean, runtimeGranted: Boolean): Boolean = !notificationsOn && !runtimeGranted
}
