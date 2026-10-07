package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `memory-theses` track: the person's theses, three active at most (ThesisListSheet.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun ThesisListSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("My theses", "Mis tesis"), "theses-close", onClose) {}
}
