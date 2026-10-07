package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `credits-invite` track: what is left, gifted reads, Bobby Pro, codes, invitations and restore (ios/Bobby/Sources/V18/Credits/CreditsSheet.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun CreditsSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Credits", "Créditos"), "credits-close", onClose) {}
}
