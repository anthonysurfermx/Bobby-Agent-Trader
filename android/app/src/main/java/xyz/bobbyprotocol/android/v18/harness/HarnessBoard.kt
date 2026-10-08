package xyz.bobbyprotocol.android.v18.harness

import java.time.ZoneId
import kotlin.math.abs

// The harness (1.8): where a sector or a week follow-up lands. One list: the assets, each with how
// far it moved, and a tap that asks Bobby about it. The numbers are read when the screen opens
// (one request per row, none of them a read); a row whose number could not be read shows none.
// Pure, so tests pin what the screen shows (ui/v18/FollowUpSheet.kt draws it). A port of
// `HarnessBoard` in ios/Bobby/Sources/V18/Harness/HarnessBoard.swift.

data class HarnessBoard(
    val kind: Kind,
    val title: String,
    /** What the numbers are measured over. */
    val basis: String,
    val rows: List<Row>,
) {
    sealed class Kind {
        data class Sector(val id: String) : Kind()
        data object Week : Kind()
    }

    data class Row(
        val symbol: String,
        val name: String,
        val isEquity: Boolean,
        /** Week rows: the price when they first asked this week. */
        val priceThen: Double? = null,
        /** Percent: the last 24 hours for a sector, since they asked for a week. Null until read. */
        val change: Double? = null,
    )

    /**
     * One row's number from a fresh price. A sector reads the day's change; a week compares with
     * the price at the question, and shows nothing when either price is missing.
     */
    fun change(row: Row, price: Double?, changePct: Double?): Double? {
        val value: Double? = when (kind) {
            is Kind.Sector -> changePct
            Kind.Week -> {
                val then = row.priceThen
                if (then != null && price != null && then > 0 && price > 0) (price / then - 1) * 100 else null
            }
        }
        return value?.takeIf { it.isFinite() && abs(it) < 1_000 }
    }

    /** The same board with that row's number. */
    fun withChange(symbol: String, change: Double?): HarnessBoard = copy(rows = rows.map { if (it.symbol == symbol) it.copy(change = change) else it })

    companion object {
        const val WEEK_ROWS = 6

        /** A sector, with the asset the person asked about first. */
        fun sector(sector: HarnessSector, around: String?, copy: HarnessCopy): HarnessBoard {
            val members = if (around != null) sector.board(around) else sector.members.take(5)
            return HarnessBoard(Kind.Sector(sector.id), copy.sectorTitle(sector.id), copy.last24h,
                                members.map { Row(it.symbol, it.name, sector.isEquity) })
        }

        /** The assets asked about in the last seven days, most recent first. */
        fun week(assets: List<HarnessAsset>, copy: HarnessCopy): HarnessBoard =
            HarnessBoard(Kind.Week, copy.weekTitle, copy.sinceAsked,
                         assets.take(WEEK_ROWS).map { Row(it.symbol, it.name, it.isEquity, priceThen = it.firstPrice) })

        /**
         * What a tap (or the Reminders row, with none) opens: its sector, else the week. A tapped
         * week follow-up opens the week it was planned for (HarnessPlanner.weekStart), however late
         * the tap: what the notification named is on the board.
         */
        fun make(tap: HarnessTap?, ledger: HarnessLedger, now: Long, copy: HarnessCopy, zone: ZoneId = ZoneId.systemDefault()): HarnessBoard {
            if (tap != null && tap.step == HarnessStep.SECTOR) {
                val found = tap.sector?.let { HarnessSectors.byId(it) }
                if (found != null) return sector(found, tap.symbol, copy)
            }
            val rolling = now - 7 * HARNESS_DAY_MS
            val planned = tap?.takeIf { it.step == HarnessStep.WEEK }?.stamp?.let { HarnessPlanner.weekStart(it, zone) }
            return week(ledger.assets(since = minOf(planned ?: rolling, rolling), now = now), copy)
        }
    }
}
