// Thesis reminders (1.8): the words. A reminder is something the person set; nothing here says
// Bobby watched, noticed or found anything, and the lock-screen text never names an asset.
import Foundation

enum ReminderCopy {
    static let notificationTitle = "Bobby"

    /// The lock-screen line: fixed and generic, in the app's language when the reminder is written.
    static func notificationBody(language: String = L.language) -> String {
        let text: (Bool) -> String = { spanish in
            L.t("You asked me to remind you to review a thesis. This is your reminder, not a market alert.",
                "Me pediste que te recordara revisar una tesis. Este es tu recordatorio, no una alerta de mercado.", spanish: spanish)
        }
        switch language {
        case "es": return text(true)
        case "en": return text(false)
        default: return NativeTranslations.rows[text(false)]?[language] ?? text(false)
        }
    }

    static var title: String { L.t("Reminders", "Recordatorios") }

    static var intro: String {
        L.t("A reminder is a note to yourself: on the day you choose, Bobby reminds you to review a thesis. Bobby does not watch the market for you.",
            "Un recordatorio es una nota para ti: el día que elijas, Bobby te recuerda revisar una tesis. Bobby no vigila el mercado por ti.")
    }

    static var empty: String {
        L.t("Reminders are for theses you wrote. Write one after your next read.",
            "Los recordatorios son para las tesis que escribiste. Escribe una después de tu próxima lectura.")
    }

    static var denied: String {
        L.t("Notifications are off for Bobby in iOS Settings.", "Las notificaciones de Bobby están apagadas en la Configuración de iOS.")
    }

    static var failed: String {
        L.t("The reminder could not be set. Try again.", "No se pudo guardar el recordatorio. Inténtalo de nuevo.")
    }

    static func preset(_ preset: ReminderPreset) -> String {
        switch preset {
        case .threeDays: return L.t("In 3 days", "En 3 días")
        case .week: return L.t("In a week", "En una semana")
        case .month: return L.t("In a month", "En un mes")
        }
    }

    static var pickDay: String { L.t("Pick a day", "Elegir un día") }
    static var setReminder: String { L.t("Set a reminder", "Poner un recordatorio") }
    static var confirmPick: String { L.t("Remind me then", "Recuérdamelo ese día") }
    static var dayAndTime: String { L.t("Day and time", "Día y hora") }
    static var change: String { L.t("Change", "Cambiar") }
    static var remove: String { L.t("Remove", "Quitar") }
    static var cancel: String { L.t("Cancel", "Cancelar") }
    static var close: String { L.t("Close", "Cerrar") }
    static var openSettings: String { L.t("Open Settings", "Abrir Configuración") }

    /// VoiceOver, and the announcement after a reminder is set.
    static func reminderOn(_ when: String) -> String { L.t("Reminder on \(when)", "Recordatorio el \(when)") }

    static var briefingRow: String { L.t("Monday briefing", "Resumen del lunes") }
    static var briefingRowDetail: String {
        L.t("Included with Bobby Pro. It is off for now.", "Incluido con Bobby Pro. Por ahora está apagado.")
    }

    // The glass (ReminderNudges): 46 characters for the line, 22 for the button, in every language.
    static var offerLine: String { L.t("Want a reminder to review it?", "¿Quieres un recordatorio para revisarla?") }
    static var offerButton: String { L.t("Remind me", "Recuérdamelo") }
    static var briefingLine: String { L.t("Your Monday briefing is included", "Tu resumen del lunes está incluido") }
    static var briefingButton: String { L.t("Turn it on", "Actívalo") }

    /// "Fri 16 Oct, 18:00" in the app's language and the phone's clock style.
    static func when(_ date: Date, calendar: Calendar = .autoupdatingCurrent, locale: Locale = L.locale) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate("EEEdMMMjmm")
        return formatter.string(from: date)
    }
}
