package xyz.bobbyprotocol.android.v18.harness

import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Text
import java.text.DecimalFormat
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

// The harness (1.8): the words. A follow-up is a moment in time, never a claim about the market:
// the lock screen says where it came from ("back to your question") and nothing else, and the
// number is read when the person opens it. Nothing here says Bobby watched, noticed or found
// anything, and nothing tells the person to do something.
// The same English and Spanish as ios/Bobby/Sources/V18/Harness/HarnessCopy.swift; French,
// Portuguese, Italian and German come from the catalog through `lookup`.
// HarnessSurfaceTest sweeps every pair of words written in this folder, in six languages, against
// the words Bobby never says.

/**
 * `locale` is the app's (`es-MX`, `de-DE`…), for the notation of a number. `lookup` is the app's
 * `text(English, Español)` before any value is filled in.
 */
class HarnessCopy(private val locale: () -> String, private val lookup: (String, String) -> String) {
    constructor(host: V18Host) : this({ host.locale }, { en, es -> host.text(en, es) })

    /** English and Spanish as written; the other four from the catalog; `{0}`, `{1}` filled last. */
    internal fun text(en: String, es: String, vararg args: Any?): String = V18Text.fill(lookup(en, es), *args)

    // The lock screen (written in the app's language when the follow-up is planned)

    /**
     * Provenance only: the asset and "back to your question". No figure, no direction, no day
     * count, no instruction. The week says what it holds and no number either.
     */
    fun body(followUp: HarnessFollowUp): String {
        val symbol = followUp.symbol ?: ""
        return when (followUp.step) {
            HarnessStep.ASSET -> text("{0}: back to your question.", "{0}: de vuelta a tu pregunta.", symbol)
            HarnessStep.SECTOR ->
                text("{0} today. {1} is part of it.", "{0} hoy. {1} es parte.", followUp.sector?.let { sectorTitle(it) } ?: "", symbol)
            HarnessStep.WEEK ->
                if (followUp.others <= 0) text("Your week with {0}.", "Tu semana con {0}.", symbol)
                else text("Your week: {0} and {1} more.", "Tu semana: {0} y {1} más.", symbol, followUp.others)
        }
    }

    /**
     * What a locked phone that hides sensitive content shows in place of the body (the notice's
     * public version): the same sentence without the asset. The ticker is never on a locked screen there.
     */
    fun publicBody(step: HarnessStep): String = when (step) {
        HarnessStep.ASSET, HarnessStep.SECTOR -> text("Back to your question.", "De vuelta a tu pregunta.")
        HarnessStep.WEEK -> text("Your week.", "Tu semana.")
    }

    /** The notice's one button: follow-ups off, without opening the app. */
    val stopAction: String get() = text("Stop", "Ya no")

    // The glass (46 characters for the line, 22 for the button, in every language)

    /**
     * The offer after a read. It says what the person is agreeing to: Bobby coming back to this
     * asset over the next days, not one message. Names the asset when the line still fits.
     */
    fun offerLine(symbol: String): String {
        val named = text("Shall I keep you posted on {0}?", "¿Te voy contando cómo sigue {0}?", symbol)
        return if (length(named) <= NucleoNudge.TEXT_LIMIT) named else text("Shall I keep you posted on this?", "¿Te voy contando cómo sigue?")
    }

    val offerButton: String get() = text("Yes, tell me", "Sí, cuéntame")

    /**
     * The move since they asked, with the number when the phone may say one: `pct` comes from
     * `move(then, now, isEquity)` and from nowhere else. The line is drawn like every other line of
     * the glass (one size, one ink): the same up and down, no colour, no arrow.
     */
    fun moveLine(symbol: String, pct: Double?, days: Int): String {
        val fallback = if (days <= 1) text("{0}, a day later", "{0}, un día después", symbol)
        else text("{0}, {1} days later", "{0}, {1} días después", symbol, days)
        if (pct == null || !pct.isFinite()) return fallback
        val line = if (abs(pct) < 0.05) text("{0} is where you left it", "{0} sigue donde lo dejaste", symbol)
        else text("{0} {1} since you asked", "{0} {1} desde que preguntaste", symbol, signed(pct))
        return if (length(line) <= NucleoNudge.TEXT_LIMIT) line else fallback
    }

    val moveButton: String get() = text("What changed?", "¿Qué cambió?")

    /**
     * The button of the same line when the next read would be refused: the person keeps the line,
     * which costs nothing, and Bobby asks nothing of them.
     */
    val moveSeen: String get() = text("Got it", "Entendido")

    // The questions Bobby is asked on the person's tap

    fun changedQuestion(symbol: String): String = text("What changed in {0} since I asked?", "¿Qué cambió en {0} desde que pregunté?", symbol)

    fun lookQuestion(symbol: String): String = text("How does {0} look today?", "¿Cómo se ve {0} hoy?", symbol)

    // The board (a sector, or the week)

    val weekTitle: String get() = text("Your week", "Tu semana")
    val sinceAsked: String get() = text("Since you asked", "Desde que preguntaste")
    val last24h: String get() = text("Last 24 hours", "Últimas 24 horas")
    val boardEmpty: String get() = text("Nothing to show yet.", "Nada que mostrar todavía.")
    val boardFoot: String get() = text("Tap one to ask Bobby.", "Toca uno para preguntarle a Bobby.")

    fun rowSpoken(symbol: String, name: String, change: String?): String = if (change == null) "$symbol, $name" else "$symbol, $name, $change"

    // The switch (Reminders)

    val switchLabel: String get() = text("Follow-ups", "Seguimiento")
    val switchDetail: String get() = text("Bobby comes back to what you asked.", "Bobby vuelve a lo que preguntaste.")

    /**
     * Under the switch when the phone lets Bobby notify and follow-ups themselves were switched
     * off in its settings ("Turn off notifications" on a follow-up): what stands in the way, and
     * the way there. Android only: an iPhone has no switch per kind of notification.
     */
    val offInSettings: String get() = text("Follow-ups are off in this phone's settings.", "El seguimiento está apagado en los ajustes de este teléfono.")
    val openSettings: String get() = text("Open Settings", "Abrir Configuración")

    // The sectors

    /** The sector's name in the app's language; an id nobody named is shown as it is. */
    fun sectorTitle(id: String): String = when (id) {
        "semis" -> text("Semiconductors", "Semiconductores")
        "bigtech" -> text("Big tech", "Grandes tecnológicas")
        "software" -> text("Software", "Software")
        "cryptostocks" -> text("Crypto stocks", "Acciones cripto")
        "ev" -> text("Electric vehicles", "Autos eléctricos")
        "health" -> text("Health care", "Salud")
        "majors" -> text("Bitcoin and Ethereum", "Bitcoin y Ethereum")
        "layer1" -> text("Layer 1 networks", "Redes de capa 1")
        "layer2" -> text("Layer 2 networks", "Redes de capa 2")
        "defi" -> text("DeFi", "DeFi")
        "memes" -> text("Memecoins", "Memecoins")
        "aicrypto" -> text("AI tokens", "Tokens de IA")
        "payments" -> text("Payment coins", "Monedas de pago")
        else -> id
    }

    // Numbers

    /** "+2.3%" / "-1.1%", one decimal at most, in the app's locale. */
    fun signed(pct: Double): String {
        val scaled = pct * 10
        val rounded = (if (scaled < 0) -floor(-scaled + 0.5) else floor(scaled + 0.5)) / 10
        // Never "-0%".
        val value = if (rounded == 0.0) 0.0 else rounded
        val format = NumberFormat.getPercentInstance(Locale.forLanguageTag(locale()))
        format.minimumFractionDigits = 0
        format.maximumFractionDigits = 1
        if (format !is DecimalFormat) return (if (value > 0) "+" else "") + format.format(value / 100)
        // The value already is a percentage.
        format.multiplier = 1
        if (value > 0) format.positivePrefix = "+" + format.positivePrefix
        return format.format(value)
    }

    // Dates (the Memory screen's sentences)

    private val language: String get() = Locale.forLanguageTag(locale()).language

    /**
     * "Oct 5" / "5 oct": the day and the abbreviated month, in the app's language and on the
     * phone's own calendar day. One fixed order per language (the app speaks six), and never a
     * full stop at the end: the sentence it goes into brings its own.
     */
    fun day(at: Long, zone: ZoneId): String {
        val pattern = when (language) {
            "es", "fr", "it" -> "d MMM"
            "pt" -> "d 'de' MMM"
            "de" -> "d. MMM"
            else -> "MMM d"
        }
        val said = DateTimeFormatter.ofPattern(pattern, Locale.forLanguageTag(locale())).format(Instant.ofEpochMilli(at).atZone(zone))
        return said.trimEnd('.')
    }

    /** "7:00 PM" in English, "19:00" in the other five. */
    fun hour(hour: Int): String {
        val time = LocalTime.of(minOf(maxOf(hour, 0), 23), 0)
        return if (language == "en") DateTimeFormatter.ofPattern("h:mm a", Locale.US).format(time) else DateTimeFormatter.ofPattern("HH:mm", Locale.ROOT).format(time)
    }

    private fun length(text: String): Int = text.codePointCount(0, text.length)

    companion object {
        const val NOTIFICATION_TITLE = "Bobby"

        /**
         * How far the price may be from the one at the question for the phone to say a number. The
         * line stays on the glass for up to `HarnessCenter.DUE_DAYS` (two weeks) after the question,
         * so each bound is for a fortnight, not for a day, and holds at every age.
         *  - A stock: more than 0.7 and less than 1.4 times the price at the question (-30% to +40%).
         *    The top of the band is twice its bottom, so a 2-for-1 split, or any larger one, forward
         *    or reverse, on top of ANY move the band itself would print lands outside it: 100 → 62 is
         *    2-for-1 and +24%, 0.62, no number. An earnings day (a quarter either way) is inside.
         *    What stays possible: a 3-for-2 split (0.67) with a rise of 5% or more on top reads as a
         *    fall of up to 30%. By size alone it cannot be told from one, and the phone has no list of
         *    corporate actions to ask.
         *  - Crypto has no splits. What goes wrong there is a ticker that now names another coin, a
         *    redenomination or a bad tick: 0.2 to 5 times (-80% to +400%) lets a small coin's wildest
         *    ordinary week through and stops those.
         * Outside the bound the phone says no number, never a corrected one. Both ends are exclusive.
         */
        const val STOCK_MOVE_ABOVE = 0.7
        const val STOCK_MOVE_BELOW = 1.4
        const val CRYPTO_MOVE_ABOVE = 0.2
        const val CRYPTO_MOVE_BELOW = 5.0

        /**
         * THE gate: the move between the price at the question and the price now, in percent. Null
         * when the phone has no business saying a number: a price is missing, zero, negative or not
         * a number, or the move is outside what this kind of asset does. The glass and the week's
         * board both ask here and nowhere else.
         */
        fun move(then: Double?, now: Double?, isEquity: Boolean): Double? {
            if (then == null || now == null || !then.isFinite() || !now.isFinite() || then <= 0 || now <= 0) return null
            val ratio = now / then
            val above = if (isEquity) STOCK_MOVE_ABOVE else CRYPTO_MOVE_ABOVE
            val below = if (isEquity) STOCK_MOVE_BELOW else CRYPTO_MOVE_BELOW
            if (!ratio.isFinite() || ratio <= above || ratio >= below) return null
            return (ratio - 1) * 100
        }
    }
}
