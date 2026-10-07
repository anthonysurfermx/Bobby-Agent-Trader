package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `harness` track: a sector or the week, a row asks Bobby (HarnessBoard.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun FollowUpSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Follow-ups", "Seguimiento"), "follow-up-close", onClose) {}
}
