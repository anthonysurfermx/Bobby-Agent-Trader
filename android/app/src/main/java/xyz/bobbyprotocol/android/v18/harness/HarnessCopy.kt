package xyz.bobbyprotocol.android.v18.harness

import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Text
import java.text.DecimalFormat
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor

// The harness (1.8): the words. A follow-up is a moment in time, never a claim about the market:
// the lock screen says "a day later, see how it moved", and the number is read when the person
// opens it. Nothing here says Bobby watched, noticed or found anything.
// The same English and Spanish as ios/Bobby/Sources/V18/Harness/HarnessCopy.swift; French,
// Portuguese, Italian and German come from the catalog through `lookup`.

/**
 * `locale` is the app's (`es-MX`, `de-DE`…), for the notation of a number. `lookup` is the app's
 * `text(English, Español)` before any value is filled in.
 */
class HarnessCopy(private val locale: () -> String, private val lookup: (String, String) -> String) {
    constructor(host: V18Host) : this({ host.locale }, { en, es -> host.text(en, es) })

    private fun text(en: String, es: String, vararg args: Any?): String = V18Text.fill(lookup(en, es), *args)

    // The lock screen (written in the app's language when the follow-up is planned)

    fun body(followUp: HarnessFollowUp): String {
        val symbol = followUp.symbol ?: ""
        return when (followUp.step) {
            HarnessStep.ASSET ->
                if (followUp.days <= 1) text("{0}, a day later. See how it moved.", "{0}, un día después. Mira cómo se movió.", symbol)
                else text("{0}, {1} days later. See how it moved.", "{0}, {1} días después. Mira cómo se movió.", symbol, followUp.days)
            HarnessStep.SECTOR ->
                text("{0} today. {1} is part of it.", "{0} hoy. {1} es parte.", followUp.sector?.let { sectorTitle(it) } ?: "", symbol)
            HarnessStep.WEEK ->
                if (followUp.others <= 0) text("Your week with {0}.", "Tu semana con {0}.", symbol)
                else text("Your week: {0} and {1} more.", "Tu semana: {0} y {1} más.", symbol, followUp.others)
        }
    }

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

    /** The move since they asked, with the number when the phone has both prices. */
    fun moveLine(symbol: String, pct: Double?, days: Int): String {
        val fallback = if (days <= 1) text("{0}, a day later", "{0}, un día después", symbol)
        else text("{0}, {1} days later", "{0}, {1} días después", symbol, days)
        if (pct == null || !pct.isFinite()) return fallback
        val line = if (abs(pct) < 0.05) text("{0} is where you left it", "{0} sigue donde lo dejaste", symbol)
        else text("{0} {1} since you asked", "{0} {1} desde que preguntaste", symbol, signed(pct))
        return if (length(line) <= NucleoNudge.TEXT_LIMIT) line else fallback
    }

    val moveButton: String get() = text("What changed?", "¿Qué cambió?")

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

    private fun length(text: String): Int = text.codePointCount(0, text.length)

    companion object {
        const val NOTIFICATION_TITLE = "Bobby"
    }
}
