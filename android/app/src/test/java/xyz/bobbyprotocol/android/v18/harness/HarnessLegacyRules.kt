package xyz.bobbyprotocol.android.v18.harness

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.TreeMap
import kotlin.math.pow

/**
 * The planner as Android 1.2.0 shipped it (a port of the first iPhone planner, commit 2eaa5f55),
 * copied rule for rule out of HarnessPlanner.kt and HarnessLedger.kt before they were rewritten, and
 * kept only as a yardstick: HarnessPlannerTest checks that the planner of today never plans more
 * than this one would have. In it a tap on a notification was an answer, any answer started the
 * chain again from the next day, the chain was asset → sector → week, and nothing the person said
 * about their horizon was read. Do not "fix" it: it is the past.
 * The iPhone keeps the same yardstick in ios/Bobby/Tests/HarnessLegacyRules.swift.
 */
internal object HarnessLegacyRules {
    class Profile(val interest: Map<String, Double>, val hour: Int?, val ignored: Map<HarnessStep, Int>) {
        fun rests(step: HarnessStep): Boolean = (ignored[step] ?: 0) >= 2

        fun favourite(symbols: List<String>): String? {
            var best: String? = null
            var bestScore = 0.0
            for (symbol in symbols) {
                val score = interest[symbol] ?: 0.0
                if (best == null || score > bestScore) {
                    best = symbol
                    bestScore = score
                }
            }
            return best
        }

        companion object {
            val WEIGHTS: Map<HarnessEvent.Kind, Double> = mapOf(
                HarnessEvent.Kind.ASK to 1.0, HarnessEvent.Kind.SAVED to 1.0, HarnessEvent.Kind.PICKED to 1.0,
                HarnessEvent.Kind.OPENED to 1.5, HarnessEvent.Kind.RETURNED to 0.5,
            )

            fun make(ledger: HarnessLedger, now: Long, zone: ZoneId): Profile {
                val interest = HashMap<String, Double>()
                val ignored = HashMap<HarnessStep, Int>()
                val hours = TreeMap<Int, Pair<Int, Long>>()
                val statsFrom = now - 30 * HARNESS_DAY_MS
                for (event in ledger.events) {
                    if (event.at > now) continue
                    val weight = WEIGHTS[event.kind]
                    val symbol = event.symbol
                    if (symbol != null && weight != null) {
                        val ageDays = (now - event.at) / HARNESS_DAY_MS.toDouble()
                        interest[symbol] = (interest[symbol] ?: 0.0) + weight * 0.5.pow(ageDays / 7.0)
                    }
                    val step = event.step
                    if (event.at < statsFrom || step == null) continue
                    if (event.kind == HarnessEvent.Kind.SENT) ignored[step] = (ignored[step] ?: 0) + 1
                    if (isEngagement(event)) {
                        ignored[step] = 0
                        val hour = Instant.ofEpochMilli(event.at).atZone(zone).hour
                        val seen = hours[hour]
                        hours[hour] = Pair((seen?.first ?: 0) + 1, maxOf(seen?.second ?: event.at, event.at))
                    }
                }
                val samples = hours.values.sumOf { it.first }
                val best = hours.entries.maxWithOrNull(compareBy<Map.Entry<Int, Pair<Int, Long>>>({ it.value.first }, { it.value.second }))
                return Profile(interest, if (samples >= 3) best?.key else null, ignored)
            }
        }
    }

    fun isEngagement(event: HarnessEvent): Boolean = event.kind == HarnessEvent.Kind.OPENED || event.kind == HarnessEvent.Kind.RETURNED

    fun unansweredStreak(ledger: HarnessLedger, before: Long): HarnessLedger.Streak {
        val lastAnswer = ledger.events.lastOrNull { it.at <= before && isEngagement(it) }?.at
        val shown = ledger.events.filter { it.kind == HarnessEvent.Kind.SENT && it.at <= before && (lastAnswer == null || it.at > lastAnswer) }
        return HarnessLedger.Streak(shown.size, shown.lastOrNull()?.at)
    }

    fun anchor(ledger: HarnessLedger, before: Long): HarnessEvent? =
        ledger.events.lastOrNull { it.at <= before && (it.kind == HarnessEvent.Kind.ASK || isEngagement(it)) }

    fun plan(ledger: HarnessLedger, now: Long, zone: ZoneId, weeklyCovered: Boolean = false,
             sectorOf: (String) -> String? = { symbol -> HarnessSectors.of(symbol)?.id }): List<HarnessFollowUp> {
        val minimumGapMs = 18 * HARNESS_HOUR_MS
        val anchorDays = 14L
        val sectorFreshDays = 7L
        val weekFreshDays = 6L
        val weekWindowDays = 7L
        val maxPerWeek = 4
        val quietAfter = 3
        val quietDays = 14L
        val anchor = anchor(ledger, now) ?: return emptyList()
        if (now - anchor.at > anchorDays * HARNESS_DAY_MS) return emptyList()
        val streak = unansweredStreak(ledger, now)
        val streakLast = streak.last
        if (streak.count >= quietAfter && streakLast != null && now - streakLast < quietDays * HARNESS_DAY_MS) return emptyList()
        val profile = Profile.make(ledger, now, zone)
        val sentSince = ledger.events(HarnessEvent.Kind.SENT, since = anchor.at)
        val done = sentSince.mapNotNull { it.step }.toSet()
        val known = ledger.assets(since = now - anchorDays * HARNESS_DAY_MS, now = now)
        val everSent = ledger.events(HarnessEvent.Kind.SENT)

        val anchorSymbol = anchor.symbol
        val subject: HarnessAsset? = if (anchor.kind == HarnessEvent.Kind.ASK && anchorSymbol != null) {
            known.firstOrNull { it.symbol == anchorSymbol }
        } else {
            val others = known.filter { it.symbol != anchorSymbol }.map { it.symbol }
            val symbol = profile.favourite(others) ?: anchorSymbol ?: profile.favourite(known.map { it.symbol })
            known.firstOrNull { it.symbol == symbol }
        }
        val followed = sentSince.lastOrNull { it.step == HarnessStep.ASSET }?.symbol
        val sectorSubject = (if (followed == null) null else known.firstOrNull { it.symbol == followed }) ?: subject
        val sectorId = sectorSubject?.let { sectorOf(it.symbol) }

        val time = timeOfDay(anchor, profile, zone)
        var day = firstDay(anchor.at, time, zone, minimumGapMs)
        val result = ArrayList<HarnessFollowUp>()
        var lastSlot: LocalDate? = null

        val assetWanted = subject != null && !profile.rests(HarnessStep.ASSET)
        if (HarnessStep.ASSET in done || assetWanted) {
            if (HarnessStep.ASSET !in done && subject != null) {
                val fireAt = HarnessPlanner.moment(day, time, zone)
                val days = maxOf(1L, ChronoUnit.DAYS.between(HarnessPlanner.localDate(subject.lastAskedAt, zone), HarnessPlanner.localDate(fireAt, zone))).toInt()
                result.add(HarnessFollowUp(HarnessStep.ASSET, fireAt, subject.symbol, subject.name, subject.isEquity, days = days))
            }
            lastSlot = day
            day = day.plusDays(1)
        }

        if (HarnessStep.SECTOR in done) {
            lastSlot = day
        } else if (sectorSubject != null && sectorId != null && !profile.rests(HarnessStep.SECTOR)) {
            val fireAt = HarnessPlanner.moment(day, time, zone)
            val fresh = everSent.none { it.step == HarnessStep.SECTOR && it.sector == sectorId && fireAt - it.at < sectorFreshDays * HARNESS_DAY_MS }
            if (fresh) {
                result.add(HarnessFollowUp(HarnessStep.SECTOR, fireAt, sectorSubject.symbol, sectorSubject.name, sectorSubject.isEquity, sector = sectorId))
                lastSlot = day
            }
        }

        if (HarnessStep.WEEK !in done && !weeklyCovered && !profile.rests(HarnessStep.WEEK)) {
            val from = lastSlot ?: HarnessPlanner.localDate(anchor.at, zone)
            val fireAt = HarnessPlanner.moment(HarnessPlanner.nextMonday(from), time, zone)
            val weekAssets = ledger.assets(since = now - weekWindowDays * HARNESS_DAY_MS, now = now)
            val repeated = everSent.any { it.step == HarnessStep.WEEK && fireAt - it.at < weekFreshDays * HARNESS_DAY_MS }
            val first = weekAssets.firstOrNull()
            if (first != null && !repeated) {
                result.add(HarnessFollowUp(HarnessStep.WEEK, fireAt, first.symbol, first.name, first.isEquity, others = weekAssets.size - 1))
            }
        }

        var previous = everSent.lastOrNull()?.at
        val kept = ArrayList<HarnessFollowUp>()
        for (candidate in result.sortedBy { it.fireAt }) {
            if (candidate.fireAt <= now) continue
            var fireAt = candidate.fireAt
            var tries = 0
            while (tooClose(fireAt, anchor.at, previous, zone, minimumGapMs) && tries < 8) {
                fireAt = Instant.ofEpochMilli(fireAt).atZone(zone).plusDays(if (candidate.step == HarnessStep.WEEK) 7 else 1).toInstant().toEpochMilli()
                tries += 1
            }
            if (tooClose(fireAt, anchor.at, previous, zone, minimumGapMs)) continue
            val weekBefore = fireAt - 7 * HARNESS_DAY_MS
            val shown = ledger.events(HarnessEvent.Kind.SENT, since = weekBefore).size + kept.count { it.fireAt > weekBefore }
            if (shown >= maxPerWeek) continue
            kept.add(if (fireAt != candidate.fireAt) candidate.copy(fireAt = fireAt) else candidate)
            previous = fireAt
        }
        return kept
    }

    private fun tooClose(date: Long, anchorAt: Long, previous: Long?, zone: ZoneId, minimumGapMs: Long): Boolean {
        if (date - anchorAt < minimumGapMs) return true
        if (previous == null) return false
        return date - previous < minimumGapMs || HarnessPlanner.localDate(date, zone) == HarnessPlanner.localDate(previous, zone)
    }

    private fun timeOfDay(anchor: HarnessEvent, profile: Profile, zone: ZoneId): HarnessPlanner.TimeOfDay {
        val learned = profile.hour
        if (learned != null) return HarnessPlanner.TimeOfDay(minOf(maxOf(learned, 9), 21), 0)
        val local = Instant.ofEpochMilli(anchor.at).atZone(zone)
        if (local.hour < 9) return HarnessPlanner.TimeOfDay(9, 0)
        if (local.hour >= 21) return HarnessPlanner.TimeOfDay(21, 0)
        return HarnessPlanner.TimeOfDay(local.hour, local.minute)
    }

    private fun firstDay(date: Long, time: HarnessPlanner.TimeOfDay, zone: ZoneId, minimumGapMs: Long): LocalDate {
        val start = HarnessPlanner.localDate(date, zone)
        for (offset in 1L..3L) {
            val day = start.plusDays(offset)
            if (HarnessPlanner.moment(day, time, zone) - date >= minimumGapMs) return day
        }
        return start.plusDays(2)
    }
}
