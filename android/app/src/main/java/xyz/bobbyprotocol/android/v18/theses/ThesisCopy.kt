package xyz.bobbyprotocol.android.v18.theses

import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.ThesisRevision
import xyz.bobbyprotocol.android.v18.V18Host
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.NumberFormat
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.abs
import kotlin.math.floor

// Theses (1.8): the words and the numbers every thesis screen shares, a port of
// ios/Bobby/Sources/V18/Theses/ThesisCopy.swift. Words are the app's (Wait / Review, never an
// instruction); numbers are computed here, never by a model, and a value the app does not have is
// left out instead of shown as zero.

/**
 * What the thesis screens tell the rest of 1.8 (the iOS `ThesisEvents` notifications). One per
 * host: `ThesisEvents.of(host)`. Listeners run on the main thread.
 */
class ThesisEvents {
    private val saved = CopyOnWriteArrayList<(String) -> Unit>()
    private val reviewed = CopyOnWriteArrayList<(String, String) -> Unit>()

    /** The thesis the review screen is showing right now, or null: a reminder for it has nothing to announce. */
    var openThesisId: String? = null

    /** A NEW thesis was saved (its id). Returns the way to stop listening. */
    fun onSaved(listener: (String) -> Unit): () -> Unit {
        saved.add(listener)
        return { saved.remove(listener) }
    }

    /** The person decided what to do with a thesis after a review: its id, and `keep` | `edit` | `archive`. */
    fun onReviewed(listener: (String, String) -> Unit): () -> Unit {
        reviewed.add(listener)
        return { reviewed.remove(listener) }
    }

    fun postSaved(thesisId: String) {
        for (listener in saved) {
            try { listener(thesisId) } catch (_: Exception) { }
        }
    }

    fun postReviewed(thesisId: String, decision: String) {
        for (listener in reviewed) {
            try { listener(thesisId, decision) } catch (_: Exception) { }
        }
    }

    companion object {
        const val SERVICE = "theses.events"
        const val KEEP = "keep"
        const val EDIT = "edit"
        const val ARCHIVE = "archive"

        fun of(host: V18Host): ThesisEvents = host.service(SERVICE) { ThesisEvents() }
    }
}

/**
 * Where the thesis started and where the evidence stands now. The change is arithmetic on two
 * prices the app holds; when either is missing there is no change to show.
 */
class ThesisThenNow(thenPrice: Double?, thenAtMillis: Long?, nowPrice: Double?, asOf: String?) {
    val thenPrice: Double? = usable(thenPrice)
    /** A starting date without its price is not shown either. */
    val thenAtMillis: Long? = if (this.thenPrice == null) null else thenAtMillis
    val nowPrice: Double? = usable(nowPrice)
    /** ISO-8601, the date the evidence itself carries. */
    val asOf: String? = asOf?.takeIf { it.isNotEmpty() }

    /**
     * "Then" is the price the thesis was written at and nothing else: a thesis written from a read
     * without a price has no "then", and a later review's price is never borrowed as its origin.
     */
    constructor(thesis: SavedThesis, nowPrice: Double?, asOf: String?) :
        this(ThesisCopy.startingPoint(thesis)?.price, ThesisCopy.startingPoint(thesis)?.atMillis, nowPrice, asOf)

    /** Percent, positive when the price is higher now. Null unless both prices are real. */
    val changePct: Double?
        get() {
            val then = thenPrice ?: return null
            val now = nowPrice ?: return null
            val pct = (now - then) / then * 100
            return if (pct.isFinite()) pct else null
        }

    val asOfMillis: Long? get() = asOf?.let { ThesisCopy.instant(it) }
    val isEmpty: Boolean get() = thenPrice == null && nowPrice == null
    /** No price was kept when the thesis was written: the screen says so instead of showing a change. */
    val missingStart: Boolean get() = thenPrice == null

    override fun equals(other: Any?): Boolean = other is ThesisThenNow && other.thenPrice == thenPrice &&
        other.thenAtMillis == thenAtMillis && other.nowPrice == nowPrice && other.asOf == asOf

    override fun hashCode(): Int = listOf(thenPrice, thenAtMillis, nowPrice, asOf).hashCode()
    override fun toString(): String = "ThesisThenNow(then=$thenPrice at $thenAtMillis, now=$nowPrice asOf $asOf)"

    private companion object {
        fun usable(price: Double?): Double? = price?.takeIf { it.isFinite() && it > 0 }
    }
}

class ThesisCopy(private val words: HostWords) {
    private val locale: Locale get() = Locale.forLanguageTag(words.locale)

    // Verdict (the app's two words)

    fun verdictWord(verdict: String?): String? = when (verdict) {
        "review" -> words.text("Review", "Revisa")
        "wait" -> words.text("Wait", "Espera")
        else -> null
    }

    // Horizon (the person's pick)

    fun horizon(horizon: ThesisHorizon): String = when (horizon) {
        ThesisHorizon.WEEKS -> words.text("A few weeks", "Unas semanas")
        ThesisHorizon.MONTHS -> words.text("A few months", "Unos meses")
        ThesisHorizon.YEAR -> words.text("About a year", "Alrededor de un año")
        ThesisHorizon.YEARS -> words.text("Several years", "Varios años")
    }

    /** `rapido` | `profundo` | `maximo` as the app names its levels. */
    fun levelName(level: String): String = when (level) {
        "profundo" -> words.text("Deep", "Profundo")
        "maximo" -> words.text("Max", "Máximo")
        else -> words.text("Quick", "Rápido")
    }

    // The review question

    /**
     * The fixed sentence a review asks, in the app's language. It names no time span on purpose:
     * the desk reads a horizon out of words such as "today" or "weeks", and the horizon of a
     * thesis is the person's own pick, sent with the thesis.
     */
    fun reviewQuestion(symbol: String): String = words.text(
        "Review my thesis on {0}: what does the latest evidence support, what does it challenge, and what is still unknown?",
        "Revisa mi tesis sobre {0}: ¿qué respalda la evidencia más reciente, qué la cuestiona y qué sigue sin saberse?", symbol)

    // Not checked

    fun notCheckedWord(code: String, isEquity: Boolean): String? = when (code) {
        "news" -> words.text("News", "Noticias")
        "earnings" -> words.text("Earnings reports", "Reportes de resultados")
        "filings" -> words.text("Company filings", "Documentos regulatorios de la empresa")
        "fundamentals" -> if (isEquity) words.text("Company fundamentals", "Fundamentales de la empresa")
                          else words.text("Project fundamentals", "Fundamentales del proyecto")
        "macro" -> words.text("The wider economy", "La economía en general")
        else -> null
    }

    /** The same categories as one short word each, for the scope line on a finished review. */
    fun notCheckedShort(code: String, isEquity: Boolean): String? = when (code) {
        "news" -> words.text("news", "noticias")
        "earnings" -> words.text("earnings", "resultados")
        "filings" -> words.text("filings", "documentos regulatorios")
        "fundamentals" -> if (isEquity) words.text("fundamentals", "fundamentales") else words.text("project fundamentals", "fundamentales del proyecto")
        "macro" -> words.text("economy", "economía")
        else -> null
    }

    fun notCheckedWords(sent: List<String>?, isEquity: Boolean): List<String> =
        notCheckedCodes(sent, isEquity).mapNotNull { notCheckedWord(it, isEquity) }

    /** "Price evidence only. Not checked: news · earnings · …" with every category, never truncated. */
    fun scopeLine(notChecked: List<String>, isEquity: Boolean): String {
        val short = notChecked.mapNotNull { notCheckedShort(it, isEquity) }
        val only = words.text("Price evidence only.", "Solo evidencia de precio.")
        if (short.isEmpty()) return only
        return only + " " + words.text("Not checked", "No revisado") + ": " + short.joinToString(" · ")
    }

    fun priceOnlyLine(isEquity: Boolean): String =
        if (isEquity) words.text("Bobby read price evidence only. This is not a view on the company itself.",
                                 "Bobby leyó solo evidencia de precio. No es una opinión sobre la empresa en sí.")
        else words.text("Bobby read price evidence only. This is not a view on the project itself.",
                        "Bobby leyó solo evidencia de precio. No es una opinión sobre el proyecto en sí.")

    val footer: String get() = words.text("Educational reading.", "Lectura educativa.")

    // Where the words go (consent-relevant: the same words everywhere)

    /** Behind the editor's and the list's detail button. */
    val localOnly: String
        get() = words.text(
            "Saved on this phone only. When you ask for a review, your words are sent to Bobby and to the AI providers that write the review. They are not stored there.",
            "Se guarda solo en este teléfono. Cuando pides una revisión, tus palabras se envían a Bobby y a los proveedores de IA que escriben la revisión. No se guardan allí.")

    /** Directly above "Review now", pinned with it. */
    val sentToProviders: String
        get() = words.text("Your thesis text goes to Bobby’s AI providers. Only for this review.",
                           "Tu texto va a proveedores de IA de Bobby. Solo para esta revisión.")

    val noStartingPrice: String
        get() = words.text("No starting price was saved with this thesis.", "No se guardó un precio inicial con esta tesis.")

    // Numbers and dates

    /** A market price as the evidence carried it, in the app's locale. No currency: the desk does not say one. */
    fun price(value: Double): String {
        if (!value.isFinite()) return value.toString()
        val format = NumberFormat.getNumberInstance(locale)
        if (abs(value) >= 1) {
            format.minimumFractionDigits = 2
            format.maximumFractionDigits = 2
            return format.format(value)
        }
        // Below one: two to four significant digits, so a small price is not flattened to zero.
        var digits = BigDecimal(value).round(MathContext(4, RoundingMode.HALF_EVEN)).stripTrailingZeros()
        if (digits.scale() < 0) digits = digits.setScale(0)
        if (digits.precision() < 2) digits = digits.setScale(digits.scale() + 2 - digits.precision())
        format.minimumFractionDigits = digits.scale()
        format.maximumFractionDigits = digits.scale()
        return format.format(digits)
    }

    /** "+8.9%" / "-3.1%" / "0%", one decimal, in the app's locale. */
    fun percent(value: Double): String {
        if (!value.isFinite()) return ""
        val magnitude = floor(abs(value) * 10 + 0.5) / 10
        val rounded = if (magnitude == 0.0) 0.0 else if (value < 0) -magnitude else magnitude
        val format = NumberFormat.getPercentInstance(locale) as? DecimalFormat ?: return "$rounded%"
        format.multiplier = 1
        format.minimumFractionDigits = 0
        format.maximumFractionDigits = 1
        if (rounded > 0) format.positivePrefix = "+" + format.positivePrefix
        return format.format(rounded)
    }

    /** "Oct 7", with the year when it is not this year. */
    fun day(millis: Long, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
        val date = Instant.ofEpochMilli(millis).atZone(zone)
        val sameYear = date.year == Instant.ofEpochMilli(now).atZone(zone).year
        return DateTimeFormatter.ofPattern(dayPattern(sameYear, "MMM"), locale).format(date)
    }

    /** "October 20": the day a server says something comes back. */
    fun longDay(millis: Long, zone: ZoneId = ZoneId.systemDefault()): String =
        DateTimeFormatter.ofPattern(dayPattern(true, "MMMM"), locale).format(Instant.ofEpochMilli(millis).atZone(zone))

    /** "Oct 7, 2:30 PM" in the phone's time zone: the moment the evidence is dated. */
    fun moment(millis: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val date = Instant.ofEpochMilli(millis).atZone(zone)
        return DateTimeFormatter.ofPattern(dayPattern(true, "MMM"), locale).format(date) + ", " +
            DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(date)
    }

    /** Day and month in the order each of the six languages writes them. */
    private fun dayPattern(sameYear: Boolean, month: String): String = when (locale.language) {
        "en" -> if (sameYear) "$month d" else "$month d, yyyy"
        "de" -> if (sameYear) "d. $month" else "d. $month yyyy"
        "pt" -> if (sameYear) "d 'de' $month" else "d 'de' $month 'de' yyyy"
        else -> if (sameYear) "d $month" else "d $month yyyy"
    }

    /** "5 days ago", in whole days as everything else on these screens counts them. */
    fun ago(days: Int): String =
        if (days == 1) words.text("1 day ago", "hace 1 día") else words.text("{0} days ago", "hace {0} días", days)

    /** "Reviewed today" / "Reviewed 5 days ago" / "Not reviewed yet". */
    fun reviewedLine(thesis: SavedThesis, now: Long = System.currentTimeMillis()): String {
        val last = thesis.lastReviewedAtMillis ?: return words.text("Not reviewed yet", "Aún sin revisar")
        val days = days(last, now)
        if (days == 0) return words.text("Reviewed today", "Revisada hoy")
        return words.text("Reviewed {0}", "Revisada {0}", ago(days))
    }

    /** "Since Oct 7 · started at 120.50", or only the date when the read carried no price. */
    fun sinceLine(thesis: SavedThesis, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
        val since = day(thesis.createdAtMillis, now, zone)
        val start = startingPoint(thesis) ?: return words.text("Since {0}", "Desde el {0}", since)
        return words.text("Since {0} · started at {1}", "Desde el {0} · empezó en {1}", since, price(start.price))
    }

    /** A row of My theses: "Review · Sep 23" once reviewed (history, plain ink), "Not reviewed · Oct 4" before. */
    fun rowState(thesis: SavedThesis, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
        val last = thesis.lastReviewedAtMillis
        if (last != null) return listOfNotNull(verdictWord(thesis.lastReview?.verdict), day(last, now, zone)).joinToString(" · ")
        return words.text("Not reviewed", "Sin revisar") + " · " + day(thesis.createdAtMillis, now, zone)
    }

    /** The date, the price and the verdict of a past review, in plain ink (it is history, not today's reading). */
    fun pastLine(revision: ThesisRevision, now: Long = System.currentTimeMillis(), zone: ZoneId = ZoneId.systemDefault()): String {
        val parts = ArrayList<String>()
        parts.add(day(revision.atMillis, now, zone))
        revision.price?.takeIf { it.isFinite() && it > 0 }?.let { parts.add(price(it)) }
        verdictWord(revision.verdict)?.let { parts.add(it) }
        return parts.joinToString(" · ")
    }

    companion object {
        /** The kinds of evidence the desk cannot read, in a fixed order. */
        val NOT_CHECKED_ORDER: List<String> = listOf("news", "earnings", "filings", "fundamentals", "macro")
        /** What a crypto asset has none of is not listed as "not checked". */
        val NOT_CHECKED_CRYPTO: List<String> = listOf("news", "fundamentals", "macro")
        private const val DAY_MILLIS = 86_400_000L

        /**
         * The codes to show: the server's when it sent any it knows, otherwise the whole fixed list.
         * Never empty: the desk reads price evidence only, and the screen says so every time.
         */
        fun notCheckedCodes(sent: List<String>?, isEquity: Boolean): List<String> {
            val known = NOT_CHECKED_ORDER.filter { (sent ?: emptyList()).contains(it) }
            if (known.isNotEmpty()) return known
            return if (isEquity) NOT_CHECKED_ORDER else NOT_CHECKED_CRYPTO
        }

        /** "NVDA · NVIDIA", or only the symbol when the name adds nothing. */
        fun title(symbol: String, name: String): String =
            if (name.isEmpty() || name.equals(symbol, ignoreCase = true)) symbol else "$symbol · $name"

        fun title(thesis: SavedThesis): String = title(thesis.symbol, thesis.name)

        /**
         * The price and date a thesis was written at: its `created` entry and no other. A thesis
         * written from a read without a price has none, however many reviews followed.
         */
        fun startingPoint(thesis: SavedThesis): SavedThesis.StartingPoint? {
            val created = thesis.revisions.firstOrNull { it.kind == ThesisRevision.Kind.CREATED } ?: return null
            val price = created.price?.takeIf { it.isFinite() && it > 0 } ?: return null
            return SavedThesis.StartingPoint(price, created.atMillis)
        }

        /** Whole days between two moments (never negative). */
        fun days(fromMillis: Long, toMillis: Long): Int = maxOf(0L, Math.floorDiv(toMillis - fromMillis, DAY_MILLIS)).toInt()

        /** An ISO-8601 moment with a zone, in epoch milliseconds; null when it cannot be read as one. */
        fun instant(iso: String): Long? = try {
            OffsetDateTime.parse(iso).toInstant().toEpochMilli()
        } catch (_: Exception) {
            null
        }
    }
}
