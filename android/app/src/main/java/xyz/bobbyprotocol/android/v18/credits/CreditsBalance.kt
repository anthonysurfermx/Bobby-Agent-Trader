package xyz.bobbyprotocol.android.v18.credits

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// Credits (1.8): ONE model of what a person has, built only from what the server said
// (`/api/bobby-access`: access, levels, referral, subscription). The Credits screen, its details
// and the restore answer all read it, so the same account is never described three ways. A port of
// ios/Bobby/Sources/V18/Credits/CreditsBalance.swift. Pure: no network, no clock of its own, no UI.
// A value the server did not send is left out; it is never shown as zero.
//
// What the server's numbers mean:
//   · Quick reads   guest 3 per install; a free account's weekly reads while the weekly cap is on;
//                   unlimited on Bobby Pro or while the cap is off.
//   · Deep / Max    the plan's allowance per window (7 days free, 30 days Pro), from the level meters.
//   · Gifted reads  a separate balance per level. Spent only after the plan's reads run out; a Pro
//                   account never spends gifted Quick reads.
//   · Bobby Pro     a Google Play plan, a plan bought on an iPhone, a card plan from the web, or
//                   gifted days (invitations or Bobby).

/** Why the account is on Bobby Pro, if it is. */
data class CreditsProStatus(
    val plan: Plan = Plan.NONE,
    /** The paid period's end, epoch milliseconds. */
    val periodEnd: Long? = null,
    /** False once the plan is cancelled and only runs to `periodEnd`. */
    val renews: Boolean = true,
    /** Gifted days that are still ahead (also set next to a paid plan: they start after it). */
    val giftUntil: Long? = null,
    val giftSource: GiftSource? = null,
) {
    enum class Plan {
        NONE,
        /** A Google Play subscription: managed from the phone, restorable. */
        GOOGLE_PLAY,
        /** Bought on an iPhone: Apple manages it. Android only: iOS calls this one its own store's plan. */
        APP_STORE,
        /** A card plan bought on the web. */
        CARD,
        /** Gifted days only (invitations, or a gift from Bobby). */
        GIFTED,
        /** The server says Pro and the reason did not reach the app. */
        ACTIVE,
    }

    enum class GiftSource { INVITATIONS, BOBBY }

    val isPro: Boolean get() = plan != Plan.NONE
    /** A plan the person pays for. */
    val pays: Boolean get() = plan == Plan.GOOGLE_PLAY || plan == Plan.APP_STORE || plan == Plan.CARD
    /**
     * The Bobby Pro offer has a place: the account has no plan, or only gifted days. An account the
     * server calls Pro is not offered it while the reason has not reached the app.
     */
    val offersPro: Boolean get() = plan == Plan.NONE || plan == Plan.GIFTED
    /** A store's own subscriptions page applies. */
    val managedInAStore: Boolean get() = plan == Plan.GOOGLE_PLAY || plan == Plan.APP_STORE

    companion object {
        fun make(snapshot: CreditsSnapshot, nowMillis: Long): CreditsProStatus {
            val access = snapshot.access
            if (access == null || !access.isPro) return CreditsProStatus()
            val subscription = snapshot.subscription
            val status = subscription?.status ?: ""
            val end = subscription?.periodEndMillis
            val live = status in setOf("active", "trialing") && (end == null || end > nowMillis)
            val ending = status in setOf("canceled", "cancelled") && end != null && end > nowMillis
            val source = when (snapshot.referral?.proSource) {
                "referral" -> GiftSource.INVITATIONS
                "admin" -> GiftSource.BOBBY
                else -> null
            }
            val grantEnd = CreditsJson.millis(snapshot.referral?.proUntil)
            val gift = if (source != null && grantEnd != null && grantEnd > nowMillis) grantEnd else null
            val giftSource = if (gift == null) null else source
            if (live || ending) {
                val plan = when (subscription?.provider) {
                    null, "google" -> Plan.GOOGLE_PLAY
                    "apple" -> Plan.APP_STORE
                    else -> Plan.CARD
                }
                return CreditsProStatus(plan, end, live, gift, giftSource)
            }
            return CreditsProStatus(if (gift != null) Plan.GIFTED else Plan.ACTIVE, null, true, gift, giftSource)
        }
    }
}

/** The sentences, with the clock, the language and the time zone they are written for. */
class CreditsCopy(
    val words: Words,
    val nowMillis: Long,
    val locale: Locale = Locale.US,
    val zone: ZoneId = ZoneId.systemDefault(),
) {
    fun title(level: CreditsLevel): String = when (level) {
        CreditsLevel.RAPIDO -> words.text("Quick reads", "Lecturas Rápidas")
        CreditsLevel.PROFUNDO -> words.text("Deep reads", "Lecturas Profundas")
        CreditsLevel.MAXIMO -> words.text("Max reads", "Lecturas Máximas")
    }

    fun label(level: CreditsLevel): String = level.label(words)

    /**
     * "+1 Sat" inside the coming week, "+1 Nov 2" beyond it: the day the next read comes back (the
     * oldest one leaves the rolling window). Null when there is nothing to wait for.
     */
    fun renewal(millis: Long?): String? {
        if (millis == null || millis <= nowMillis) return null
        val back = if (millis - nowMillis < 6 * DAY) format(millis, "EEE") else short(millis)
        return "+1 $back"
    }

    fun giftTitle(level: CreditsLevel): String = when (level) {
        CreditsLevel.RAPIDO -> words.text("Gifted Quick reads", "Lecturas Rápidas de regalo")
        CreditsLevel.PROFUNDO -> words.text("Gifted Deep reads", "Lecturas Profundas de regalo")
        CreditsLevel.MAXIMO -> words.text("Gifted Max reads", "Lecturas Máximas de regalo")
    }

    val afterPlan: String get() = words.text("Used after your plan's reads run out.", "Se usan cuando se acaban las lecturas de tu plan.")

    fun left(left: Int, limit: Int, weekly: Boolean): String =
        if (weekly) words.text("{0} of {1} left this week", "Te quedan {0} de {1} esta semana", left, limit)
        else words.text("{0} of {1} left", "Te quedan {0} de {1}", left, limit)

    /**
     * "Next read back on Friday" inside the coming week, the date beyond it; null when there is
     * nothing to wait for. The server's window rolls: on that day the oldest read comes back, not all of them.
     */
    fun resets(millis: Long?): String? {
        if (millis == null || millis <= nowMillis) return null
        if (date(millis) == date(nowMillis)) return words.text("Next read back today", "La próxima vuelve hoy")
        if (millis - nowMillis < 6 * DAY) return words.text("Next read back on {0}", "La próxima vuelve el {0}", format(millis, "EEEE"))
        return words.text("Next read back {0}", "La próxima vuelve el {0}", day(millis))
    }

    /** "Every 30 days · next read back November 2" for a window that is not a week. */
    fun window(days: Int?, backAt: Long?): String? {
        if (days == null || days <= 0) return resets(backAt)
        if (backAt == null || backAt <= nowMillis) return words.text("Every {0} days", "Cada {0} días", days)
        return words.text("Every {0} days · next read back {1}", "Cada {0} días · la próxima vuelve el {1}", days, day(backAt))
    }

    fun proValue(pro: CreditsProStatus): String = when (pro.plan) {
        CreditsProStatus.Plan.NONE -> words.text("Not active", "No activo")
        CreditsProStatus.Plan.GIFTED -> {
            val until = pro.giftUntil
            if (until == null) words.text("Active", "Activo") else words.text("Gifted until {0}", "Regalado hasta el {0}", day(until))
        }
        CreditsProStatus.Plan.GOOGLE_PLAY, CreditsProStatus.Plan.APP_STORE, CreditsProStatus.Plan.CARD, CreditsProStatus.Plan.ACTIVE -> {
            val end = pro.periodEnd
            if (end == null) words.text("Active", "Activo")
            else if (pro.renews) words.text("Active · renews {0}", "Activo · se renueva el {0}", day(end))
            else words.text("Active · ends {0}", "Activo · termina el {0}", day(end))
        }
    }

    /** The Bobby Pro row's face: a state, and the day it renews when the app knows it. */
    fun proFace(pro: CreditsProStatus): Pair<String, String?> = when (pro.plan) {
        CreditsProStatus.Plan.NONE -> Pair(words.text("Not active", "No activo"), null)
        CreditsProStatus.Plan.GIFTED -> {
            val until = pro.giftUntil
            if (until == null) Pair(words.text("Active", "Activo"), null)
            else Pair(words.text("Gifted until {0}", "De regalo hasta el {0}", short(until)), null)
        }
        CreditsProStatus.Plan.GOOGLE_PLAY, CreditsProStatus.Plan.APP_STORE, CreditsProStatus.Plan.CARD, CreditsProStatus.Plan.ACTIVE -> {
            val end = pro.periodEnd
            if (end == null) Pair(words.text("Active", "Activo"), null)
            else if (pro.renews) Pair(words.text("Active", "Activo"), "↻ " + short(end))
            else Pair(words.text("Active until {0}", "Activo hasta el {0}", short(end)), null)
        }
    }

    fun proDetail(pro: CreditsProStatus): String? {
        val parts = ArrayList<String>()
        if (pro.plan == CreditsProStatus.Plan.CARD) parts.add(words.text("Managed on the web.", "Se administra en la web."))
        val source = pro.giftSource
        val until = pro.giftUntil
        if (pro.plan == CreditsProStatus.Plan.GIFTED && source != null) {
            parts.add(if (source == CreditsProStatus.GiftSource.INVITATIONS) words.text("From your invitations.", "Por tus invitaciones.")
                      else words.text("A gift from Bobby.", "Un regalo de Bobby."))
        } else if (pro.isPro && until != null) {
            // Gifted days wait behind a paid period: they are not lost.
            parts.add(words.text("Your gifted days run until {0}.", "Tus días de regalo llegan hasta el {0}.", day(until)))
        }
        return if (parts.isEmpty()) null else parts.joinToString(" ")
    }

    /** "October 27", with the year when it is not this one. */
    fun day(millis: Long): String = format(millis, pattern(long = true, year = !sameYear(millis)))

    /** "Oct 27" for a row's face. */
    fun short(millis: Long): String = format(millis, pattern(long = false, year = !sameYear(millis)))

    private fun date(millis: Long): LocalDate = Instant.ofEpochMilli(millis).atZone(zone).toLocalDate()
    private fun sameYear(millis: Long): Boolean = date(millis).year == date(nowMillis).year
    private fun format(millis: Long, pattern: String): String =
        DateTimeFormatter.ofPattern(pattern, locale).format(Instant.ofEpochMilli(millis).atZone(zone))

    /** A month and a day in the order each language writes them (the six the app speaks). */
    private fun pattern(long: Boolean, year: Boolean): String = when (locale.language) {
        "es" -> if (long) (if (year) "d 'de' MMMM 'de' yyyy" else "d 'de' MMMM") else (if (year) "d MMM yyyy" else "d MMM")
        "pt" -> if (long) (if (year) "d 'de' MMMM 'de' yyyy" else "d 'de' MMMM") else (if (year) "d 'de' MMM 'de' yyyy" else "d 'de' MMM")
        "fr", "it" -> if (long) (if (year) "d MMMM yyyy" else "d MMMM") else (if (year) "d MMM yyyy" else "d MMM")
        "de" -> if (long) (if (year) "d. MMMM yyyy" else "d. MMMM") else (if (year) "d. MMM yyyy" else "d. MMM")
        else -> if (long) (if (year) "MMMM d, yyyy" else "MMMM d") else (if (year) "MMM d, yyyy" else "MMM d")
    }

    private companion object {
        const val DAY = 86_400_000L
    }
}

class CreditsBalance(
    /** Top to bottom: the plan's reads, the gifted reads, Bobby Pro. Empty until the server answered. */
    val lines: List<Line>,
    /** One line for a row ("7 of 10 reads · 3 gifted"); null until the server answered. */
    val summary: String?,
    val pro: CreditsProStatus,
    /** Gifted reads across the three levels. */
    val giftTotal: Int,
) {
    data class Line(
        val kind: Kind,
        val title: String,
        val value: String,
        val detail: String?,
        /** The row's face (V18-DESIGN.md): a short name, a number or a state, and when it comes back. */
        val label: String = "",
        val face: String = "",
        val faceNote: String? = null,
    ) {
        enum class Kind(val id: String) {
            QUICK("quick"), DEEP("deep"), MAX("max"), GIFT_QUICK("giftQuick"), GIFT_DEEP("giftDeep"), GIFT_MAX("giftMax"), PRO("pro")
        }

        val isGift: Boolean get() = kind == Kind.GIFT_QUICK || kind == Kind.GIFT_DEEP || kind == Kind.GIFT_MAX
        /** What TalkBack reads for the whole line, and what the details say. */
        val spoken: String get() = listOfNotNull("$title: $value", detail).joinToString(". ")
    }

    /** A store's own page applies: a Google Play or an App Store plan is active. */
    val manage: Boolean get() = pro.managedInAStore
    val isKnown: Boolean get() = lines.isNotEmpty()

    fun line(kind: Line.Kind): Line? = lines.firstOrNull { it.kind == kind }

    /** The gifted reads as one row's value ("Quick 3 · Deep 2"); null when there are none. */
    val giftFace: String?
        get() {
            val gifts = lines.filter { it.isGift }
            return if (gifts.isEmpty()) null else gifts.joinToString(" · ") { it.label + " " + it.face }
        }

    /** The same row for TalkBack: each gifted line in full. */
    val giftSpoken: String get() = lines.filter { it.isGift }.joinToString(". ") { it.spoken }

    companion object {
        fun make(snapshot: CreditsSnapshot, copy: CreditsCopy): CreditsBalance {
            val words = copy.words
            val pro = CreditsProStatus.make(snapshot, copy.nowMillis)
            val access = snapshot.access ?: return CreditsBalance(emptyList(), null, pro, 0)
            val lines = ArrayList<Line>()
            val summary = ArrayList<String>()

            // Quick reads.
            val unlimited = access.isPro || (access.tier == "free" && !access.paywall)
            val limit = access.limit
            if (unlimited) {
                val plain = words.text("Unlimited", "Ilimitadas")
                lines.add(Line(Line.Kind.QUICK, copy.title(CreditsLevel.RAPIDO), plain,
                               if (access.isPro) words.text("With Bobby Pro, within fair use.", "Con Bobby Pro, dentro del uso justo.") else null,
                               copy.label(CreditsLevel.RAPIDO),
                               if (access.isPro) words.text("Unlimited · fair use", "Ilimitadas · uso justo") else plain))
                if (!access.isPro) summary.add(words.text("Unlimited reads", "Lecturas ilimitadas"))
            } else if (limit != null) {
                val left = access.remaining ?: maxOf(0, limit - access.used)
                if (access.tier == "anon") {
                    val weekly = snapshot.freeReadsPerWeek
                    val detail = if (snapshot.signedIn) null
                        else if (weekly != null) words.text("Create your free account to get {0} every week", "Crea tu cuenta gratis para tener {0} cada semana", weekly)
                        else words.text("Create your free account to keep reading", "Crea tu cuenta gratis para seguir leyendo")
                    lines.add(Line(Line.Kind.QUICK, copy.title(CreditsLevel.RAPIDO), copy.left(left, limit, weekly = false), detail,
                                   copy.label(CreditsLevel.RAPIDO), "$left/$limit"))
                } else {
                    lines.add(Line(Line.Kind.QUICK, copy.title(CreditsLevel.RAPIDO), copy.left(left, limit, weekly = true), copy.resets(access.resetsMillis),
                                   copy.label(CreditsLevel.RAPIDO), "$left/$limit", copy.renewal(access.resetsMillis)))
                }
                summary.add(words.text("{0} of {1} reads", "{0} de {1} lecturas", left, limit))
            }

            // Deep and Max: the plan's allowance in its own window.
            for (level in listOf(CreditsLevel.PROFUNDO, CreditsLevel.MAXIMO)) {
                val meter = snapshot.meters[level] ?: continue
                val meterLimit = meter.limit ?: continue
                val kind = if (level == CreditsLevel.PROFUNDO) Line.Kind.DEEP else Line.Kind.MAX
                if (meterLimit == 0) {
                    // A guest has no Max reads: say where they are, never "0 of 0".
                    if (access.tier == "anon") {
                        val where = words.text("With your free account", "Con tu cuenta gratis")
                        lines.add(Line(kind, copy.title(level), where, null, copy.label(level), where))
                    }
                    continue
                }
                val left = meter.remaining ?: maxOf(0, meterLimit - meter.used)
                val weekly = (meter.windowDays ?: 7) == 7
                lines.add(Line(kind, copy.title(level), copy.left(left, meterLimit, weekly),
                               if (weekly) copy.resets(meter.resetsMillis) else copy.window(meter.windowDays, meter.resetsMillis),
                               copy.label(level), "$left/$meterLimit", copy.renewal(meter.resetsMillis)))
            }

            // Gifted reads: per level, only what exists.
            var gifts = 0
            if (access.bonus > 0) {
                gifts += access.bonus
                val used = if (access.isPro) words.text("Kept for when you are not on Bobby Pro.", "Se guardan para cuando no tengas Bobby Pro.")
                    else if (unlimited) words.text("Kept for when Quick reads have a weekly limit.", "Se guardan para cuando las lecturas Rápidas tengan límite semanal.")
                    else copy.afterPlan
                lines.add(Line(Line.Kind.GIFT_QUICK, copy.giftTitle(CreditsLevel.RAPIDO), access.bonus.toString(), used,
                               copy.label(CreditsLevel.RAPIDO), access.bonus.toString()))
            }
            for (level in listOf(CreditsLevel.PROFUNDO, CreditsLevel.MAXIMO)) {
                val bonus = snapshot.meters[level]?.bonus ?: continue
                if (bonus <= 0) continue
                gifts += bonus
                lines.add(Line(if (level == CreditsLevel.PROFUNDO) Line.Kind.GIFT_DEEP else Line.Kind.GIFT_MAX, copy.giftTitle(level), bonus.toString(),
                               copy.afterPlan, copy.label(level), bonus.toString()))
            }
            if (gifts > 0) summary.add(if (gifts == 1) words.text("1 gifted", "1 de regalo") else words.text("{0} gifted", "{0} de regalo", gifts))

            // Bobby Pro. A guest has no account for it to belong to, so the line waits for one.
            if (pro.isPro || access.tier == "free") {
                val face = copy.proFace(pro)
                lines.add(Line(Line.Kind.PRO, "Bobby Pro", copy.proValue(pro), copy.proDetail(pro), "Bobby Pro", face.first, face.second))
            }
            if (pro.isPro) {
                val until = if (pro.plan == CreditsProStatus.Plan.GIFTED) pro.giftUntil else if (pro.pays && !pro.renews) pro.periodEnd else null
                // The plan leads: "Bobby Pro active · 3 gifted".
                summary.add(0, if (until != null) words.text("Bobby Pro until {0}", "Bobby Pro hasta el {0}", copy.short(until))
                               else words.text("Bobby Pro active", "Bobby Pro activo"))
            }

            return CreditsBalance(lines, if (summary.isEmpty()) null else summary.joinToString(" · "), pro, gifts)
        }

        /**
         * "Invite friends": who gets what, from the server's own terms. The Bobby Pro reward is
         * promised only where Bobby Pro can be had in this build (as the invite sheet does).
         */
        fun inviteDetail(snapshot: CreditsSnapshot, words: Words): String {
            if (!snapshot.proPurchasable) return words.text("Share Bobby with someone you know.", "Comparte Bobby con alguien que conoces.")
            val days = snapshot.referral?.rewardDays ?: snapshot.rewardDays
            val friends = snapshot.referral?.max ?: snapshot.maxFriends
            if (days != null && friends != null && friends > 0) {
                return words.text("You get {0} days of Bobby Pro for each friend who joins with your link, up to {1} friends.",
                                  "Recibes {0} días de Bobby Pro por cada amigo que se una con tu link, hasta {1} amigos.", days, friends)
            }
            return if (days != null) words.text("{0} days of Bobby Pro for each friend who joins", "{0} días de Bobby Pro por cada amigo que se una", days)
                   else words.text("Bobby Pro for each friend who joins", "Bobby Pro por cada amigo que se una")
        }
    }
}
