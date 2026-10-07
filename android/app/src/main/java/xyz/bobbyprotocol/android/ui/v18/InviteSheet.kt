package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `credits-invite` track: the 1.8 invitation screen (NucleoInviteSheet and V18/Invite/InviteSheetSections.swift). The route `invite` exists since 1.1.4.
// A placeholder until that screen lands: a title and the way out.
/** False: BobbySheet keeps drawing `invite` as in 1.1.4. Make it true when the screen below is the real one; nothing else has to change. */
const val INVITE_SHEET_READY = false

@Composable
fun InviteSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Invite a friend", "Invita a un amigo"), "invite-close", onClose) {}
}
