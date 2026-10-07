package xyz.bobbyprotocol.android.v18.reminders

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

// Thesis reminders (1.8): the date rules, a port of `ReminderSchedule` in
// ios/Bobby/Sources/V18/Reminders/ReminderCenter.swift. Pure: 18:00 local on the chosen day, never
// in the past, whole minutes. A moment is epoch milliseconds; the day it falls on is read in the
// person's own time zone.

/** The three one-tap choices; "Choose date" hands `schedule` a moment instead. */
enum class ReminderPreset(val raw: String) {
    THREE_DAYS("threeDays"), WEEK("week"), MONTH("month")
}

object ReminderSchedule {
    const val HOUR = 18

    /** A reminder closer than this is treated as already passed. */
    const val MINIMUM_LEAD_MS = 60_000L

    /**
     * A notice is never written (or written again) this close to its moment: whatever the phone
     * already holds under that id stays as it is for its last seconds.
     */
    const val HAND_OFF_MARGIN_MS = 5_000L

    private const val MINUTE_MS = 60_000L

    fun date(preset: ReminderPreset, nowMs: Long, zone: ZoneId): Long {
        val today = day(nowMs, zone)
        val chosen = when (preset) {
            ReminderPreset.THREE_DAYS -> today.plusDays(3)
            ReminderPreset.WEEK -> today.plusDays(7)
            // The calendar's own month: January 31 lands on the last day of February.
            ReminderPreset.MONTH -> today.plusMonths(1)
        }
        return evening(chosen, zone)
    }

    /** Where "Choose date" starts: tomorrow at 18:00. */
    fun defaultPick(nowMs: Long, zone: ZoneId): Long = evening(day(nowMs, zone).plusDays(1), zone)

    /**
     * The earliest and latest the picker offers. The earliest is a whole minute, so the time the
     * picker shows is the time that gets scheduled.
     */
    fun pickRange(nowMs: Long, zone: ZoneId): LongRange {
        val first = earliest(nowMs, zone)
        val last = at(nowMs, zone).plusYears(1).toInstant().toEpochMilli()
        return first..maxOf(first, last)
    }

    /** The first whole minute that is at least `MINIMUM_LEAD_MS` away. */
    fun earliest(nowMs: Long, zone: ZoneId): Long {
        val soonest = nowMs + MINIMUM_LEAD_MS
        val minute = wholeMinute(soonest, zone)
        return if (minute < soonest) minute + MINUTE_MS else minute
    }

    /**
     * A picked moment, to the minute and never in the past. A time still ahead but too close to
     * hand to the phone becomes the first minute that is far enough (the same day, not the next
     * one). A time that already passed is kept as a time of day and moved to today, or to tomorrow
     * when today's has passed too.
     */
    fun normalized(pickedMs: Long, nowMs: Long, zone: ZoneId): Long {
        val whole = wholeMinute(pickedMs, zone)
        val time = at(whole, zone).toLocalTime()
        val today = day(nowMs, zone)
        val sameTimeToday = today.atTime(time.hour, time.minute).atZone(zone).toInstant().toEpochMilli()
        for (moment in longArrayOf(whole, sameTimeToday)) {
            if (moment > nowMs) return if (moment - nowMs >= MINIMUM_LEAD_MS) moment else earliest(nowMs, zone)
        }
        return today.plusDays(1).atTime(time.hour, time.minute).atZone(zone).toInstant().toEpochMilli()
    }

    /** 18:00 on that day, on the wall clock of `zone`. */
    fun evening(day: LocalDate, zone: ZoneId): Long = day.atTime(HOUR, 0).atZone(zone).toInstant().toEpochMilli()

    /** The same time of day on another day (the day picker changed, the time stays). */
    fun onDay(ms: Long, day: LocalDate, zone: ZoneId): Long {
        val time = at(ms, zone).toLocalTime()
        return day.atTime(time.hour, time.minute).atZone(zone).toInstant().toEpochMilli()
    }

    /** The same day at another time (the time picker changed, the day stays). */
    fun atTime(ms: Long, hour: Int, minute: Int, zone: ZoneId): Long =
        day(ms, zone).atTime(hour.coerceIn(0, 23), minute.coerceIn(0, 59)).atZone(zone).toInstant().toEpochMilli()

    /** The calendar day a moment falls on in `zone`. */
    fun day(ms: Long, zone: ZoneId): LocalDate = at(ms, zone).toLocalDate()

    private fun at(ms: Long, zone: ZoneId): ZonedDateTime = Instant.ofEpochMilli(ms).atZone(zone)

    private fun wholeMinute(ms: Long, zone: ZoneId): Long = at(ms, zone).truncatedTo(ChronoUnit.MINUTES).toInstant().toEpochMilli()
}
