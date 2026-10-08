package xyz.bobbyprotocol.android.v18.harness

import org.json.JSONObject
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.temporal.ChronoUnit

// The harness (1.8): what comes next. A pure function of the ledger and the clock; a port of
// ios/Bobby/Sources/V18/Harness/HarnessPlanner.swift.
//
// After a question the person gets, at most:
//   1. the next day      how the asset they asked about moved
//   2. the day after     the sector that asset belongs to
//   3. the next Monday   their week
// and then silence. The list is always "what happens if they ignore everything": opening a
// follow-up (or coming back for it) writes an engagement into the ledger, the plan is computed
// again from that moment, and step 1 lands on the following day. A new question does the same.
//
// What it learns, all of it readable from the ledger (HarnessProfile):
//  - the hour: follow-ups are planned for the time of day the person asked, and once they have
//    answered a few, for the hour they answer;
//  - the asset: after an answered follow-up, the next one is about the asset that matters most to
//    them among the others they asked about;
//  - when to stop: three follow-ups in a row that nobody answered and Bobby says nothing for two
//    weeks, whatever is asked; a kind whose last two showings went unanswered rests; a sector is
//    not repeated within a week; never more than `maxPerWeek` follow-ups in seven days, never two
//    on the same day, never sooner than 18 hours after the last one.
// Nothing here says the market did anything: a follow-up is a moment in time, the numbers are
// read when the person opens it.
// On Android the phone delivers a planned notice at or after its moment, never exactly at it: the
// plan (and its tests) pin the planned moment.

/** One follow-up to hand to the phone. */
data class HarnessFollowUp(
    val step: HarnessStep,
    val fireAt: Long,
    /** `ASSET`: the asset. `SECTOR`: the asset whose sector it is. `WEEK`: the first asset named. */
    val symbol: String? = null,
    val name: String? = null,
    val isEquity: Boolean? = null,
    /** `SECTOR`: the sector's id (HarnessSectors). */
    val sector: String? = null,
    /** `ASSET`: whole days between the question and this follow-up. */
    val days: Int = 1,
    /** `WEEK`: how many other assets the week holds. */
    val others: Int = 0,
) {
    /** One pending notice per step. */
    val id: String get() = HarnessPlanner.IDENTIFIER_PREFIX + step.raw

    fun toJson(): JSONObject {
        val json = JSONObject().put("step", step.raw).put("fireAt", fireAt).put("days", days).put("others", others)
        if (symbol != null) json.put("symbol", symbol)
        if (name != null) json.put("name", name)
        if (isEquity != null) json.put("isEquity", isEquity)
        if (sector != null) json.put("sector", sector)
        return json
    }

    companion object {
        fun fromJson(json: JSONObject): HarnessFollowUp? {
            val step = HarnessStep.of(HarnessJson.text(json, "step")) ?: return null
            val fireAt = HarnessJson.long(json, "fireAt") ?: return null
            return HarnessFollowUp(step, fireAt, HarnessLedger.validSymbol(HarnessJson.text(json, "symbol")), HarnessJson.text(json, "name"),
                                   json.opt("isEquity") as? Boolean, HarnessJson.text(json, "sector"),
                                   HarnessJson.int(json, "days") ?: 1, HarnessJson.int(json, "others") ?: 0)
        }
    }
}

/** A follow-up as the phone keeps it between launches: `handed` once the phone accepted the notice. */
data class HarnessPlanned(val followUp: HarnessFollowUp, val handed: Boolean) {
    fun toJson(): JSONObject = JSONObject().put("followUp", followUp.toJson()).put("handed", handed)

    companion object {
        fun fromJson(json: JSONObject): HarnessPlanned? {
            val followUp = json.optJSONObject("followUp")?.let { HarnessFollowUp.fromJson(it) } ?: return null
            return HarnessPlanned(followUp, json.opt("handed") as? Boolean ?: false)
        }
    }
}

/** The follow-ups one question gets, in order, and how many of them at most. */
data class HarnessChain(val steps: List<HarnessStep>, val maxPerQuestion: Int) {
    companion object {
        /** The asset, then the week. */
        val ASSET_THEN_WEEK = HarnessChain(listOf(HarnessStep.ASSET, HarnessStep.WEEK), 2)
        /**
         * The asset, its sector the day after, then the week. The sector lands on a list of assets
         * the person did not ask about (HarnessBoard), which is why it does not ship.
         */
        val WITH_SECTOR = HarnessChain(listOf(HarnessStep.ASSET, HarnessStep.SECTOR, HarnessStep.WEEK), 3)

        /** THE OWNER'S CHOICE, in one line: `ASSET_THEN_WEEK` or `WITH_SECTOR`. Both are tested. */
        val SHIPPED: HarnessChain = ASSET_THEN_WEEK
    }
}

object HarnessPlanner {
    const val IDENTIFIER_PREFIX = "v18.follow."

    class Options(
        /** The steps a question gets, each at most once, in this order. */
        var chain: List<HarnessStep> = HarnessChain.SHIPPED.steps,
        /** Follow-ups one question gets at most, whatever the person does with them. */
        var maxPerQuestion: Int = HarnessChain.SHIPPED.maxPerQuestion,
        /** A paying account with the Monday briefing on already gets its week from the server. */
        var weeklyCovered: Boolean = false,
        /** Local hours follow-ups may be planned for. */
        var earliestHour: Int = 9,
        var latestHour: Int = 21,
        /** A follow-up is never planned sooner than this after what it follows. */
        var minimumGapMs: Long = 18 * HARNESS_HOUR_MS,
        /** The plan is only made while the last question or answer is this recent. */
        var anchorDays: Long = 14,
        /** A sector is not repeated within these days. */
        var sectorFreshDays: Long = 7,
        /** A week is not repeated within these days. */
        var weekFreshDays: Long = 6,
        /** Assets a week looks back for. */
        var weekWindowDays: Long = 7,
        var maxPerWeek: Int = 4,
        /**
         * This many follow-ups in a row that nobody answered, and Bobby says nothing for `quietDays`,
         * whatever is asked in the meantime.
         */
        var quietAfter: Int = 3,
        var quietDays: Long = 14,
        var sectorOf: (String) -> String? = { symbol -> HarnessSectors.of(symbol)?.id },
    ) {
        constructor(chain: HarnessChain, weeklyCovered: Boolean = false) : this(chain.steps, chain.maxPerQuestion, weeklyCovered)
    }

    /** A time of day, local. */
    data class TimeOfDay(val hour: Int, val minute: Int)

    /** The follow-ups still to come, earliest first. Empty when there is nothing to come back to. */
    fun plan(ledger: HarnessLedger, now: Long, zone: ZoneId, options: Options = Options()): List<HarnessFollowUp> {
        val anchor = ledger.anchor(now) ?: return emptyList()
        if (now - anchor.at > options.anchorDays * HARNESS_DAY_MS) return emptyList()
        val streak = ledger.unansweredStreak(now)
        val streakLast = streak.last
        if (streak.count >= options.quietAfter && streakLast != null && now - streakLast < options.quietDays * HARNESS_DAY_MS) return emptyList()
        val profile = HarnessProfile.make(ledger, now, zone)
        val sentSince = ledger.events(HarnessEvent.Kind.SENT, since = anchor.at)
        val done = sentSince.mapNotNull { it.step }.toSet()
        val known = ledger.assets(since = now - options.anchorDays * HARNESS_DAY_MS, now = now)
        val everSent = ledger.events(HarnessEvent.Kind.SENT)

        // Which asset this chain is about: the one just asked about; after an answered follow-up, the
        // one that matters most among the others (the same one again when it is the only one).
        val anchorSymbol = anchor.symbol
        val subject: HarnessAsset? = if (anchor.kind == HarnessEvent.Kind.ASK && anchorSymbol != null) {
            known.firstOrNull { it.symbol == anchorSymbol }
        } else {
            val others = known.filter { it.symbol != anchorSymbol }.map { it.symbol }
            val symbol = profile.favourite(others) ?: anchorSymbol ?: profile.favourite(known.map { it.symbol })
            known.firstOrNull { it.symbol == symbol }
        }
        // Once this chain's asset follow-up has gone out, its sector is that asset's.
        val followed = sentSince.lastOrNull { it.step == HarnessStep.ASSET }?.symbol
        val sectorSubject = (if (followed == null) null else known.firstOrNull { it.symbol == followed }) ?: subject
        val sectorId = sectorSubject?.let { options.sectorOf(it.symbol) }

        val time = timeOfDay(anchor, profile, zone, options)
        var day = firstDay(anchor.at, time, zone, options)
        val result = ArrayList<HarnessFollowUp>()
        var lastSlot: LocalDate? = null

        // 1. The asset, the next day.
        val assetWanted = subject != null && !profile.rests(HarnessStep.ASSET)
        if (HarnessStep.ASSET in done || assetWanted) {
            if (HarnessStep.ASSET !in done && subject != null) {
                val fireAt = moment(day, time, zone)
                val days = maxOf(1L, ChronoUnit.DAYS.between(localDate(subject.lastAskedAt, zone), localDate(fireAt, zone))).toInt()
                result.add(HarnessFollowUp(HarnessStep.ASSET, fireAt, subject.symbol, subject.name, subject.isEquity, days = days))
            }
            lastSlot = day
            day = day.plusDays(1)
        }

        // 2. Its sector, the day after.
        if (HarnessStep.SECTOR in done) {
            lastSlot = day
        } else if (sectorSubject != null && sectorId != null && !profile.rests(HarnessStep.SECTOR)) {
            val fireAt = moment(day, time, zone)
            val fresh = everSent.none { it.step == HarnessStep.SECTOR && it.sector == sectorId && fireAt - it.at < options.sectorFreshDays * HARNESS_DAY_MS }
            if (fresh) {
                result.add(HarnessFollowUp(HarnessStep.SECTOR, fireAt, sectorSubject.symbol, sectorSubject.name, sectorSubject.isEquity, sector = sectorId))
                lastSlot = day
            }
        }

        // 3. Their week, the Monday after.
        if (HarnessStep.WEEK !in done && !options.weeklyCovered && !profile.rests(HarnessStep.WEEK)) {
            val from = lastSlot ?: localDate(anchor.at, zone)
            val fireAt = moment(nextMonday(from), time, zone)
            val weekAssets = ledger.assets(since = now - options.weekWindowDays * HARNESS_DAY_MS, now = now)
            val repeated = everSent.any { it.step == HarnessStep.WEEK && fireAt - it.at < options.weekFreshDays * HARNESS_DAY_MS }
            val first = weekAssets.firstOrNull()
            if (first != null && !repeated) {
                result.add(HarnessFollowUp(HarnessStep.WEEK, fireAt, first.symbol, first.name, first.isEquity, others = weekAssets.size - 1))
            }
        }

        // Never in the past; never the same local day as, or sooner than `minimumGap` after, what the
        // person was really shown before (the clock, the time zone or the plan may have moved since);
        // never too many in a week.
        var previous = everSent.lastOrNull()?.at
        val kept = ArrayList<HarnessFollowUp>()
        for (candidate in result.sortedBy { it.fireAt }) {
            if (candidate.fireAt <= now) continue
            var fireAt = candidate.fireAt
            var tries = 0
            // An asset or a sector moves to the next day; the week stays a Monday.
            while (tooClose(fireAt, anchor.at, previous, zone, options) && tries < 8) {
                fireAt = Instant.ofEpochMilli(fireAt).atZone(zone).plusDays(if (candidate.step == HarnessStep.WEEK) 7 else 1).toInstant().toEpochMilli()
                tries += 1
            }
            if (tooClose(fireAt, anchor.at, previous, zone, options)) continue
            val weekBefore = fireAt - 7 * HARNESS_DAY_MS
            val shown = ledger.events(HarnessEvent.Kind.SENT, since = weekBefore).size + kept.count { it.fireAt > weekBefore }
            if (shown >= options.maxPerWeek) continue
            kept.add(if (fireAt != candidate.fireAt) candidate.copy(fireAt = fireAt) else candidate)
            previous = fireAt
        }
        return kept
    }

    private fun tooClose(date: Long, anchorAt: Long, previous: Long?, zone: ZoneId, options: Options): Boolean {
        if (date - anchorAt < options.minimumGapMs) return true
        if (previous == null) return false
        return date - previous < options.minimumGapMs || localDate(date, zone) == localDate(previous, zone)
    }

    // Dates

    fun localDate(at: Long, zone: ZoneId): LocalDate = Instant.ofEpochMilli(at).atZone(zone).toLocalDate()

    /**
     * The time of day follow-ups are planned for: the hour the person answers at once that is
     * known, otherwise the time of what the chain starts from, inside the allowed hours.
     */
    fun timeOfDay(anchor: HarnessEvent, profile: HarnessProfile, zone: ZoneId, options: Options): TimeOfDay {
        val learned = profile.hour
        if (learned != null) return TimeOfDay(minOf(maxOf(learned, options.earliestHour), options.latestHour), 0)
        val local = Instant.ofEpochMilli(anchor.at).atZone(zone)
        if (local.hour < options.earliestHour) return TimeOfDay(options.earliestHour, 0)
        if (local.hour >= options.latestHour) return TimeOfDay(options.latestHour, 0)
        return TimeOfDay(local.hour, local.minute)
    }

    /** The first day whose moment is at least `minimumGap` after `date`: the next day, or the one after. */
    fun firstDay(date: Long, time: TimeOfDay, zone: ZoneId, options: Options): LocalDate {
        val start = localDate(date, zone)
        for (offset in 1L..3L) {
            val day = start.plusDays(offset)
            if (moment(day, time, zone) - date >= options.minimumGapMs) return day
        }
        return start.plusDays(2)
    }

    /** That time on that day, where the phone is. A time a clock change skips lands just after it. */
    fun moment(day: LocalDate, time: TimeOfDay, zone: ZoneId): Long =
        ZonedDateTime.of(day, LocalTime.of(time.hour, time.minute), zone).toInstant().toEpochMilli()

    /** The first Monday strictly after `day`. */
    fun nextMonday(day: LocalDate): LocalDate {
        var candidate = day.plusDays(1)
        while (candidate.dayOfWeek != DayOfWeek.MONDAY) candidate = candidate.plusDays(1)
        return candidate
    }
}
