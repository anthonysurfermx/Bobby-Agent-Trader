package xyz.bobbyprotocol.android.v18.harness

import xyz.bobbyprotocol.android.v18.credits.LevelMeter
import xyz.bobbyprotocol.android.v18.credits.ReadAccess

// The harness (1.8): Bobby never invites someone into a wall. A read Bobby starts (the button of
// the line on the glass, a row of the board, the question Bobby wrote after a read, a chip that
// asks by itself) is offered and launched only when the phone knows the next read is answered,
// from the receipt the server sends with every reply (`access`: tier, used, limit, remaining,
// gifted reads, and whether a sign-in or a paywall stands behind the limit).
// A port of `HarnessWall` in ios/Bobby/Sources/V18/Harness/HarnessCenter.swift. Pure.
//
// On Android the wall behind the limit is the sign-in for a guest and, for a free account, the
// paywall (Bobby Pro through Google Play, where this build can sell it). The phone does not ask
// Google Play anything here: the server's `paywall` flag is the whole answer, as on iOS.
//
// A chip keeps the level the person saved, so the saved level's own allowance is asked too before
// a chip is offered (`levelOpen`). The iPhone has the same rule (HarnessWall.levelOpen in
// ios/Bobby/Sources/V18/Harness/HarnessCenter.swift).

object HarnessWall {
    /** The level a read Bobby started runs at, and the one whose meter the receipt counts. */
    const val QUICK = "rapido"

    /**
     * What is left of the plan's reads, when the receipt lets the phone tell: the server's own
     * count, else the limit less what was used. Null when neither is there (Android keeps a number
     * the server did not send as unknown, never as zero).
     */
    private fun left(access: ReadAccess, limit: Int): Int? = access.remaining ?: access.used?.let { maxOf(0, limit - it) }

    /**
     * True only when the phone knows the next Quick read is answered. Not knowing is a no: Bobby
     * does not offer what it might not be able to give.
     *  - Bobby Pro: always.
     *  - No limit in the receipt and not Pro: the server could not read the meter. Not known.
     *  - Reads left this week, or gifted reads: yes.
     *  - None left: only where nothing stands behind the limit (`paywall` false).
     */
    fun open(access: ReadAccess?): Boolean {
        if (access == null) return false
        if (access.isPro) return true
        val limit = access.limit ?: return false
        val left = left(access, limit)
        return (left != null && left > 0) || access.bonus > 0 || !access.paywall
    }

    /**
     * True only when the phone KNOWS the next read is refused: a receipt that says none is left,
     * no gifted read, and a sign-in or a paywall behind the limit. Not knowing is not closed: the
     * home keeps its chips on a first launch, without network, or when the server could not read
     * the meter (those are `open == false` and `closed == false`).
     */
    fun closed(access: ReadAccess?): Boolean {
        if (access == null || access.isPro) return false
        val limit = access.limit ?: return false
        val left = left(access, limit) ?: return false
        return left <= 0 && access.bonus <= 0 && access.paywall
    }

    /**
     * Whether a read at `level` is answered as far as that level's own allowance goes. A chip Bobby
     * wrote ("How is BTC looking?") runs at the level the person saved, and Deep and Max each have an
     * allowance apart from the general reads the receipt counts: with it used up the server refuses
     * the read before it looks at the general meter, and what stands there is the paywall for a
     * free account and the sign-in for a guest. True when the phone knows the read is answered,
     * false when it knows that wall is there, null when it cannot tell.
     *  - Quick: yes. Its meter is the receipt's, and `open` and `closed` answer for it.
     *  - Bobby Pro: yes. A level that ran out for the month is a notice with "Continue with Quick",
     *    not a sign-in or a paywall.
     *  - Deep or Max otherwise: what is left of the level (the plan's reads and gifted ones), less
     *    `spent`, the reads at that level answered since the phone last heard the meter.
     */
    fun levelOpen(level: String, access: ReadAccess?, meter: LevelMeter?, spent: Int = 0): Boolean? {
        if (level == QUICK) return true
        if (access != null && access.isPro) return true
        if (meter == null) return null
        val limit = meter.limit
        val used = meter.used
        val plan = meter.remaining ?: (if (limit != null && used != null) maxOf(0, limit - used) else null) ?: return null
        return plan + meter.bonus - spent > 0
    }

    /**
     * The receipt to go by, newest source first. One whose reset moment has passed says nothing
     * about the reads there are now: it is skipped, and with none left the phone asks again.
     */
    fun current(receipts: List<ReadAccess?>, now: Long): ReadAccess? =
        receipts.filterNotNull().firstOrNull { receipt -> receipt.resetsMillis?.let { it > now } ?: true }
}
