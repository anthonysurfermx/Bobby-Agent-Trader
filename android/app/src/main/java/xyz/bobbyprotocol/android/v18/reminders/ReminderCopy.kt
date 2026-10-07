package xyz.bobbyprotocol.android.v18.reminders

import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Text
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

// Thesis reminders (1.8): the words, a port of ios/Bobby/Sources/V18/Reminders/ReminderCopy.swift.
// A reminder is something the person set; nothing here says Bobby watched, noticed or found
// anything, and the lock-screen text never names an asset. The same English and Spanish as iOS;
// French, Portuguese, Italian and German come from the catalogs, keyed by the English string.
// Android plans a reminder with WorkManager, which may hold it back while the phone is idle: no
// line here promises the minute it arrives.

/** `t` is the app's two-language lookup (`V18Host.text` without values). */
class ReminderCopy(private val t: (String, String) -> String) {
    /** The lock-screen line: fixed and generic, in the app's language when the reminder is written. */
    val notificationBody: String get() = t("Your reminder to review a thesis.", "Tu recordatorio para revisar una tesis.")

    val title: String get() = t("Reminders", "Recordatorios")
    val intro: String get() = t("Your chosen date. Bobby does not monitor markets.", "Tú eliges la fecha. Bobby no vigila el mercado.")
    val empty: String get() = t("Write a thesis first.", "Escribe una tesis primero.")
    val denied: String get() = t("Bobby notifications are off.", "Las notificaciones de Bobby están apagadas.")
    val failed: String get() = t("Reminder not set.", "Recordatorio no guardado.")

    fun preset(preset: ReminderPreset): String = when (preset) {
        ReminderPreset.THREE_DAYS -> t("3 days", "3 días")
        ReminderPreset.WEEK -> t("1 week", "1 semana")
        ReminderPreset.MONTH -> t("1 month", "1 mes")
    }

    val pickDay: String get() = t("Choose date", "Elegir fecha")
    val setReminder: String get() = t("Set reminder", "Poner recordatorio")
    val confirmPick: String get() = t("Set", "Guardar")
    val dayAndTime: String get() = t("Day and time", "Día y hora")
    val change: String get() = t("Change", "Cambiar")
    /** Leaves "Change" without changing anything. */
    val keepDay: String get() = t("Keep this day", "Dejar este día")
    val remove: String get() = t("Remove", "Quitar")
    val cancel: String get() = t("Cancel", "Cancelar")
    val openSettings: String get() = t("Open Settings", "Abrir Configuración")
    val moreOptions: String get() = t("More options", "Más opciones")
    val riskRequired: String get() = t("Accept the risk notice first.", "Acepta primero el aviso de riesgo.")

    /** TalkBack, and the announcement after a reminder is set. */
    fun reminderOn(whenText: String): String = V18Text.fill(t("Reminder on {0}", "Recordatorio el {0}"), whenText)

    val briefingRow: String get() = t("Monday briefing", "Resumen del lunes")
    val briefingRowDetail: String get() = t("Included with Bobby Pro. It is off for now.", "Incluido con Bobby Pro. Por ahora está apagado.")

    // The glass (ReminderNudges): 46 characters for the line, 22 for the button, in every language.
    val offerLine: String get() = t("Want a reminder to review it?", "¿Quieres un recordatorio para revisarla?")
    val offerButton: String get() = t("Remind me", "Recuérdamelo")
    val briefingLine: String get() = t("Your Monday briefing is included", "Tu resumen del lunes está incluido")
    val briefingButton: String get() = t("Turn it on", "Actívalo")

    /** Every line a reminder can show or say, for the tests that read them all. */
    internal fun everyLine(): List<String> = listOf(
        notificationBody, title, intro, empty, denied, failed, preset(ReminderPreset.THREE_DAYS), preset(ReminderPreset.WEEK),
        preset(ReminderPreset.MONTH), pickDay, setReminder, confirmPick, dayAndTime, change, keepDay, remove, cancel, openSettings,
        moreOptions, riskRequired, reminderOn("{0}"), briefingRow, briefingRowDetail, offerLine, offerButton, briefingLine, briefingButton,
    )

    companion object {
        const val NOTIFICATION_TITLE = "Bobby"

        fun of(host: V18Host): ReminderCopy = ReminderCopy { en, es -> host.text(en, es) }
    }
}

/** How a reminder's moment is written. Pure: the screen hands over the phone's own patterns when it has them. */
object ReminderDates {
    /** "Fri 16 Oct, 18:00". */
    const val WHEN_PATTERN = "EEE d MMM, HH:mm"
    const val DAY_PATTERN = "EEE d MMM"
    const val TIME_PATTERN = "HH:mm"

    /** "Fri 16 Oct, 18:00" in the app's language; with the phone's pattern, in its clock style too. */
    fun whenText(ms: Long, zone: ZoneId, locale: Locale, pattern: String? = null): String = format(ms, zone, locale, pattern, WHEN_PATTERN)

    /** "Fri 16 Oct". */
    fun dayText(ms: Long, zone: ZoneId, locale: Locale, pattern: String? = null): String = format(ms, zone, locale, pattern, DAY_PATTERN)

    /** "18:00". */
    fun timeText(ms: Long, zone: ZoneId, locale: Locale, pattern: String? = null): String = format(ms, zone, locale, pattern, TIME_PATTERN)

    private fun format(ms: Long, zone: ZoneId, locale: Locale, pattern: String?, fallback: String): String {
        val moment = Instant.ofEpochMilli(ms)
        if (!pattern.isNullOrBlank()) {
            // A pattern the phone wrote with a letter this formatter does not know falls back to ours.
            try {
                return DateTimeFormatter.ofPattern(pattern, locale).withZone(zone).format(moment)
            } catch (_: Exception) {
            }
        }
        return DateTimeFormatter.ofPattern(fallback, locale).withZone(zone).format(moment)
    }
}
