package xyz.bobbyprotocol.android.v18.harness

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

object HarnessWall {
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
     * The receipt to go by, newest source first. One whose reset moment has passed says nothing
     * about the reads there are now: it is skipped, and with none left the phone asks again.
     */
    fun current(receipts: List<ReadAccess?>, now: Long): ReadAccess? =
        receipts.filterNotNull().firstOrNull { receipt -> receipt.resetsMillis?.let { it > now } ?: true }
}
