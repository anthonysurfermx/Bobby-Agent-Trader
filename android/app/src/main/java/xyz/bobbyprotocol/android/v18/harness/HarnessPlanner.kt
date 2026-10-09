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
// Follow-ups belong to an own question or a contextual yes to follow a Bobby-authored read. That anchor gets the steps of
// the chain, in order, and never more than `maxPerQuestion` of them whatever is answered:
//   1. the asset      how what they asked about moved, when they said they would look again
//   2. the week       the Monday after: the assets they asked about since the Monday before it
// and then silence, until they ask again. The list is always "what happens if they do nothing".
// A tap on a notification changes nothing here. A read Bobby started (the button of a follow-up,
// the question Bobby wrote after a read, a chip) starts no chain without that separate explicit choice.
//
// When the first one comes (`waitFor`), from what the person said, in this order:
//   a thesis they wrote about the asset   weeks → 7 days; months or longer → no asset follow-up
//   the review they chose on the save     72 hours → 3 days; 168 hours → 7 days
//   the horizon their question named      week → 3 days; month → 7 days; long → no asset follow-up
//   otherwise                             the next day
// A horizon only lengthens the wait: nothing ever arrives sooner than the next day. It times the
// first follow-up and nothing else: once a step was shown, what the person says later (a save, a
// thesis) cannot push what follows it further away than the day it was shown allows.
//
// What it learns, all of it readable from the ledger (HarnessProfile):
//  - the hour: follow-ups are planned for the time of day the person asked, and once they have
//    answered a few, for the hour they answer;
//  - when to stop: three follow-ups in a row that nobody answered and Bobby says nothing for two
//    weeks, whatever is asked, and the plan itself never holds what would be a fourth (it is what
//    arrives if they do nothing); a kind whose last two showings went unanswered rests; a sector is
//    not repeated within a week; never more than `maxPerWeek` follow-ups in seven days, never two
//    on the same day, never sooner than 18 hours after the last one.
// Nothing here says the market did anything: a follow-up is a moment in time, the numbers are
// read when the person opens it.
//
// Every rule above is a case in shared/harness/planner-golden.json, which the iPhone suite and
// HarnessGoldenTest both run.
// On Android the phone delivers a planned notice at or after its moment, never exactly at it: the
// plan (and its tests) pin the planned moment.

/** One follow-up to hand to the phone. */
data class HarnessFollowUp(
    val step: HarnessStep,
    val fireAt: Long,
    /** `ASSET`: the asset. `SECTOR`: the asset whose sector it is. `WEEK`: the asset the week names. */
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
        /** The plan is only made while the question is this recent. */
        var anchorDays: Long = 14,
        /** A sector is not repeated within these days. */
        var sectorFreshDays: Long = 7,
        /** A week is not repeated within these days. */
        var weekFreshDays: Long = 6,
        /** A week holds the assets asked about since the start of the day this many days before it. */
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

    /** How long a question waits for its first follow-up, and what said so. */
    data class Wait(
        /** Whole days after the question. Null: nothing about the asset, the week only. */
        val days: Int?,
        val source: Source,
    ) {
        enum class Source { THESIS, SAVED, NAMED, STANDARD }
    }

    /**
     * What the person said about when to look again, strongest first. A save left at 24 hours says
     * nothing (it is where the picker starts), so it never shortens what the question named.
     */
    fun waitFor(question: HarnessEvent, ledger: HarnessLedger, now: Long): Wait {
        val symbol = question.symbol ?: return Wait(1, Wait.Source.STANDARD)
        val thesis = ledger.events(HarnessEvent.Kind.THESIS).lastOrNull { it.symbol == symbol && it.at <= now }?.horizon
        if (thesis != null) return Wait(thesis.waitDays, Wait.Source.THESIS)
        val saved = ledger.events(HarnessEvent.Kind.SAVED)
            .lastOrNull { it.symbol == symbol && it.at >= question.followUpAnchorAt && it.at <= now && (it.horizonHours ?: 0) > 24 }?.horizonHours
        if (saved != null) return Wait(maxOf(1, saved / 24), Wait.Source.SAVED)
        // A horizon in Bobby's generated question is not a timeframe declared by the person.
        val named = question.horizon.takeIf { question.isQuestion }
        if (named != null) return Wait(named.waitDays, Wait.Source.NAMED)
        return Wait(1, Wait.Source.STANDARD)
    }

    /** The follow-ups still to come, earliest first. Empty when there is nothing to come back to. */
    fun plan(whole: HarnessLedger, now: Long, zone: ZoneId, options: Options = Options()): List<HarnessFollowUp> {
        val ledger = whole.upTo(now)
        val question = ledger.followUpAnchor(now) ?: return emptyList()
        val anchorAt = question.followUpAnchorAt
        val symbol = question.symbol ?: return emptyList()
        if (now - anchorAt > options.anchorDays * HARNESS_DAY_MS) return emptyList()
        val streak = ledger.unansweredStreak(now)
        val streakLast = streak.last
        if (streak.count >= options.quietAfter && streakLast != null && now - streakLast < options.quietDays * HARNESS_DAY_MS) return emptyList()
        // What this question already got. Answered or not, it counts.
        val sentSince = ledger.events(HarnessEvent.Kind.SENT, since = anchorAt)
        val room = options.maxPerQuestion - sentSince.size
        if (room <= 0) return emptyList()
        val known = ledger.followUpAssets(since = now - options.anchorDays * HARNESS_DAY_MS, now = now)
        val subject = known.firstOrNull { it.symbol == symbol } ?: return emptyList()
        val done = sentSince.mapNotNull { it.step }.toSet()
        val everSent = ledger.events(HarnessEvent.Kind.SENT)
        val profile = HarnessProfile.make(ledger, now, zone)
        val time = timeOfDay(question, profile, zone, options)
        val wait = waitFor(question, ledger, now)

        // The day the next asset or sector lands on. Null: the person is looking far ahead, and gets
        // neither. A step that is skipped leaves its day to the next one.
        var day: LocalDate? = wait.days?.let { firstDay(anchorAt, it, time, zone, options) }
        var lastSlot: LocalDate? = null
        val result = ArrayList<HarnessFollowUp>()
        val walked = HashSet<HarnessStep>()
        for (step in options.chain) {
            if (!walked.add(step)) continue
            when (step) {
                HarnessStep.ASSET, HarnessStep.SECTOR -> {
                    var slot = day ?: continue
                    if (step in done) {
                        // Already shown for this question. What follows is counted from the day it was
                        // shown whenever that is earlier than where the wait would put it today: what the
                        // person says after seeing it (a save "to review in a week", a thesis of weeks)
                        // times nothing any more, and never pushes the week past the question it belongs to.
                        val shown = sentSince.lastOrNull { it.step == step }
                        if (shown != null) {
                            val shownDay = localDate(shown.at, zone)
                            if (shownDay < slot) slot = shownDay
                        }
                    } else {
                        if (profile.rests(step)) continue
                        val fireAt = moment(slot, time, zone)
                        if (step == HarnessStep.ASSET) {
                            result.add(HarnessFollowUp(HarnessStep.ASSET, fireAt, subject.symbol, subject.name, subject.isEquity))
                        } else {
                            val sectorId = options.sectorOf(subject.symbol) ?: continue
                            val shownLately = everSent.any {
                                it.step == HarnessStep.SECTOR && it.sector == sectorId && fireAt - it.at < options.sectorFreshDays * HARNESS_DAY_MS
                            }
                            if (shownLately) continue
                            result.add(HarnessFollowUp(HarnessStep.SECTOR, fireAt, subject.symbol, subject.name, subject.isEquity, sector = sectorId))
                        }
                    }
                    lastSlot = slot
                    day = slot.plusDays(1)
                }
                HarnessStep.WEEK -> {
                    if (HarnessStep.WEEK in done || options.weeklyCovered || profile.rests(HarnessStep.WEEK)) continue
                    val monday = nextMonday(lastSlot ?: localDate(anchorAt, zone))
                    // Which assets it holds is decided below, once its Monday is final.
                    result.add(HarnessFollowUp(HarnessStep.WEEK, moment(monday, time, zone)))
                    lastSlot = monday
                }
            }
        }

        // Never in the past; never the same local day as, or sooner than `minimumGap` after, what the
        // person was really shown before (the clock, the time zone or the plan may have moved since);
        // never too many in a week, nor for one question; and never what would be one more unanswered
        // in a row than `quietAfter` inside the quiet that follows it. The plan is what arrives if they
        // do nothing, so each follow-up it keeps counts as unanswered for the ones behind it.
        var previous = everSent.lastOrNull()?.at
        var unanswered = streak.count
        var lastUnanswered = streak.last
        val kept = ArrayList<HarnessFollowUp>()
        for (candidate in result.sortedBy { it.fireAt }) {
            if (candidate.fireAt <= now) continue
            if (kept.size >= room) break
            var fireAt = candidate.fireAt
            var tries = 0
            // An asset or a sector moves to the next day; the week stays a Monday.
            while (tooClose(fireAt, anchorAt, previous, zone, options) && tries < 8) {
                fireAt = Instant.ofEpochMilli(fireAt).atZone(zone).plusDays(if (candidate.step == HarnessStep.WEEK) 7 else 1).toInstant().toEpochMilli()
                tries += 1
            }
            if (tooClose(fireAt, anchorAt, previous, zone, options)) continue
            val weekBefore = fireAt - 7 * HARNESS_DAY_MS
            val shown = ledger.events(HarnessEvent.Kind.SENT, since = weekBefore).size + kept.count { it.fireAt > weekBefore }
            if (shown >= options.maxPerWeek) continue
            val quietFrom = lastUnanswered
            if (unanswered >= options.quietAfter && quietFrom != null && fireAt - quietFrom < options.quietDays * HARNESS_DAY_MS) continue
            var followUp = HarnessFollowUp(candidate.step, fireAt, candidate.symbol, candidate.name, candidate.isEquity, candidate.sector)
            when (candidate.step) {
                HarnessStep.ASSET -> {
                    val days = ChronoUnit.DAYS.between(localDate(anchorAt, zone), localDate(fireAt, zone))
                    followUp = followUp.copy(days = maxOf(1L, days).toInt())
                }
                HarnessStep.SECTOR -> Unit
                HarnessStep.WEEK -> {
                    // A week is about what they asked since the Monday before it: an older question has
                    // none. It names the asset that matters most to them among those, the latest one on a tie.
                    val assets = ledger.followUpAssets(since = weekStart(fireAt, zone, options.weekWindowDays), now = now)
                    val repeated = everSent.any { it.step == HarnessStep.WEEK && fireAt - it.at < options.weekFreshDays * HARNESS_DAY_MS }
                    if (repeated) continue
                    val favourite = profile.favourite(assets.map { it.symbol }) ?: continue
                    val named = assets.firstOrNull { it.symbol == favourite } ?: continue
                    followUp = followUp.copy(symbol = named.symbol, name = named.name, isEquity = named.isEquity, others = assets.size - 1)
                }
            }
            kept.add(followUp)
            previous = fireAt
            unanswered += 1
            lastUnanswered = fireAt
        }
        return kept
    }

    private fun tooClose(date: Long, questionAt: Long, previous: Long?, zone: ZoneId, options: Options): Boolean {
        if (date - questionAt < options.minimumGapMs) return true
        if (previous == null) return false
        return date - previous < options.minimumGapMs || localDate(date, zone) == localDate(previous, zone)
    }

    // Dates

    fun localDate(at: Long, zone: ZoneId): LocalDate = Instant.ofEpochMilli(at).atZone(zone).toLocalDate()

    /**
     * The time of day follow-ups are planned for: the hour the person answers at once that is
     * known, otherwise the time of their question, inside the allowed hours.
     */
    fun timeOfDay(question: HarnessEvent, profile: HarnessProfile, zone: ZoneId, options: Options): TimeOfDay {
        val learned = profile.hour
        if (learned != null) return TimeOfDay(minOf(maxOf(learned, options.earliestHour), options.latestHour), 0)
        val local = Instant.ofEpochMilli(question.followUpAnchorAt).atZone(zone)
        if (local.hour < options.earliestHour) return TimeOfDay(options.earliestHour, 0)
        if (local.hour >= options.latestHour) return TimeOfDay(options.latestHour, 0)
        return TimeOfDay(local.hour, local.minute)
    }

    /**
     * The first day, `wait` days after `date` or later, whose moment is at least `minimumGap` after
     * it. Never the day of the question itself, whatever `wait` says.
     */
    fun firstDay(date: Long, wait: Int, time: TimeOfDay, zone: ZoneId, options: Options): LocalDate {
        val start = localDate(date, zone)
        val days = maxOf(1, wait).toLong()
        for (offset in days..(days + 2)) {
            val day = start.plusDays(offset)
            if (moment(day, time, zone) - date >= options.minimumGapMs) return day
        }
        return start.plusDays(days + 1)
    }

    /**
     * That time on that day, where the phone is: the hour on the clock, whatever the clock did the
     * night before. A time a clock change skips lands just after it.
     */
    fun moment(day: LocalDate, time: TimeOfDay, zone: ZoneId): Long =
        ZonedDateTime.of(day, LocalTime.of(time.hour, time.minute), zone).toInstant().toEpochMilli()

    /**
     * Where the week that arrives at `moment` begins: the start of the day `days` days before it.
     * The board a week follow-up opens reads the same window (HarnessBoard).
     */
    fun weekStart(moment: Long, zone: ZoneId, days: Long = Options().weekWindowDays): Long =
        localDate(moment, zone).minusDays(days).atStartOfDay(zone).toInstant().toEpochMilli()

    /** The first Monday strictly after `day`. */
    fun nextMonday(day: LocalDate): LocalDate {
        var candidate = day.plusDays(1)
        while (candidate.dayOfWeek != DayOfWeek.MONDAY) candidate = candidate.plusDays(1)
        return candidate
    }
}
