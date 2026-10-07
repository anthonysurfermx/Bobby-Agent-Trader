package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `memory-theses` track: write or edit one thesis; it reads `host.focus` for the read or the thesis it opens on (ThesisEditorSheet.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun ThesisEditorSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Your thesis", "Tu tesis"), "thesis-editor-close", onClose) {}
}
