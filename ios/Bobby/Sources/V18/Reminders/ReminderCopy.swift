// Thesis reminders (1.8): the words. A reminder is something the person set; nothing here says
// Bobby watched, noticed or found anything, and the lock-screen text never names an asset.
import Foundation

enum ReminderCopy {
    static let notificationTitle = "Bobby"

    /// The lock-screen line: fixed and generic, in the app's language when the reminder is written.
    static func notificationBody(language: String = L.language) -> String {
        let text: (Bool) -> String = { spanish in
            L.t("Your reminder to review a thesis.", "Tu recordatorio para revisar una tesis.", spanish: spanish)
        }
        switch language {
        case "es": return text(true)
        case "en": return text(false)
        default: return NativeTranslations.rows[text(false)]?[language] ?? text(false)
        }
    }

    static var title: String { L.t("Reminders", "Recordatorios") }

    static var intro: String {
        L.t("Your chosen date. Bobby does not monitor markets.", "Tú eliges la fecha. Bobby no vigila el mercado.")
    }

    static var empty: String {
        L.t("Write a thesis first.", "Escribe una tesis primero.")
    }

    static var denied: String {
        L.t("Bobby notifications are off.", "Las notificaciones de Bobby están apagadas.")
    }

    static var failed: String {
        L.t("Reminder not set.", "Recordatorio no guardado.")
    }

    static func preset(_ preset: ReminderPreset) -> String {
        switch preset {
        case .threeDays: return L.t("3 days", "3 días")
        case .week: return L.t("1 week", "1 semana")
        case .month: return L.t("1 month", "1 mes")
        }
    }

    static var pickDay: String { L.t("Choose date", "Elegir fecha") }
    static var setReminder: String { L.t("Set reminder", "Poner recordatorio") }
    static var confirmPick: String { L.t("Set", "Guardar") }
    static var dayAndTime: String { L.t("Day and time", "Día y hora") }
    static var change: String { L.t("Change", "Cambiar") }
    /// Leaves "Change" without changing anything.
    static var keepDay: String { L.t("Keep this day", "Dejar este día") }
    static var remove: String { L.t("Remove", "Quitar") }
    static var cancel: String { L.t("Cancel", "Cancelar") }
    static var close: String { L.t("Close", "Cerrar") }
    static var openSettings: String { L.t("Open Settings", "Abrir Configuración") }

    /// VoiceOver, and the announcement after a reminder is set.
    static func reminderOn(_ when: String) -> String { L.t("Reminder on \(when)", "Recordatorio el \(when)") }

    /// The profile's row that opens this screen (the lead places it in AccountSheet; see ReminderEntry.swift).
    static var profileRowDetail: String {
        L.t("Notes to yourself to review a thesis", "Notas para ti para revisar una tesis")
    }

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
