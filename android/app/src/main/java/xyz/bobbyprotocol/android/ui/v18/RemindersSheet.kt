package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `reminders` track: a row per thesis with its date or the way to set one, and the slot the follow-ups switch fills (RemindersSheet.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun RemindersSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Reminders", "Recordatorios"), "reminders-close", onClose) {}
}
