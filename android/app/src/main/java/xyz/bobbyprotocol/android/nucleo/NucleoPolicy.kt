package xyz.bobbyprotocol.android.nucleo

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Shared native rules. A read cannot spend credits before data and consent pass preflight. */
object NucleoPolicy {
    const val QUESTION_LIMIT = 1200
    const val DAILY_AWARD_CAP = 3
    const val TOKEN_LIFETIME_MS = 10 * 60 * 1000L
    const val PENDING_READ_LIFETIME_MS = 30 * 60 * 1000L
    val levels = listOf(0, 50, 150, 400, 1000)

    fun questionLength(question: String): Int = question.codePointCount(0, question.length)
    fun level(xp: Int): Int = levels.indexOfLast { xp >= it }.coerceAtLeast(0) + 1
    fun number(value: Any?): Double? = when (value) {
        is Number -> value.toDouble().takeIf { it.isFinite() }
        is String -> value.trim().toDoubleOrNull()?.takeIf { it.isFinite() }
        else -> null
    }

    /** Same bounded cash listings the server resolves; never substitute an ADR or derivative. */
    fun supportsEquitySymbol(symbol: String): Boolean = symbol.matches(Regex("^[A-Z]{1,5}$")) ||
        symbol.length <= 20 && symbol.matches(Regex("^[A-Z0-9][A-Z0-9.-]{0,18}\\.(?:PA|LS|SA|MI|DE)$"))

    fun preflight(assetClass: String, symbol: String, timestamps: List<Long>, now: Long): String? {
        if (assetClass !in setOf("crypto", "equity")) return "asset_class"
        if (assetClass == "equity" && !supportsEquitySymbol(symbol)) return "symbol_format"
        val last = timestamps.maxOrNull() ?: return "thin_data"
        if (last > now + 5 * 60 * 1000) return "stale_data"
        if (assetClass == "crypto" && timestamps.size < 59) return "thin_data"
        val limit = if (assetClass == "equity") 5 * 86_400_000L else 3 * 3_600_000L
        return if (now - last > limit) "stale_data" else null
    }

    data class Counters(
        val xp: Int = 0, val streak: Int = 0, val lastDay: String? = null,
        val dailyAwards: Int = 0, val dailyAwardsDay: String? = null,
    )

    data class Award(val counters: Counters, val points: Int)

    /** Genuine local offline progress; authenticated reconciliation always replaces it with server counters. */
    /**
     * The review the person chose when saving a read, in hours: the one the page sent, when the
     * save kept it. A read whose verdict is to wait is saved with no review, and a save the page
     * sent no review with did not offer one: both say nothing about when they will look again
     * (iOS: `NucleoSession.chosenHorizon`).
     */
    fun chosenReview(sent: Boolean, wait: Boolean, hours: Int): Int? = if (sent && !wait) hours else null

    fun award(state: Counters, wait: Boolean, now: Long, offsetMinutes: Int): Award {
        val today = Instant.ofEpochMilli(now).atOffset(ZoneOffset.ofTotalSeconds(-offsetMinutes.coerceIn(-840, 840) * 60)).toLocalDate()
        val count = if (state.dailyAwardsDay == today.toString()) state.dailyAwards else 0
        if (count >= DAILY_AWARD_CAP) return Award(state, 0)
        val gap = state.lastDay?.let { runCatching { today.toEpochDay() - LocalDate.parse(it).toEpochDay() }.getOrNull() }
        val streak = when { gap == null -> 1; gap == 1L -> state.streak + 1; gap == 0L || gap == 2L -> state.streak; else -> 1 }
        val points = if (wait) 20 else 10
        return Award(Counters(state.xp + points, streak, today.toString(), count + 1, today.toString()), points)
    }
}
