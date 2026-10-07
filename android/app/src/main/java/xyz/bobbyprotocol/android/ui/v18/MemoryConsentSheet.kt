package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `memory-theses` track: the question in the conversation, with everything a person agrees to in front of them (MemoryConsentSheet.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun MemoryConsentSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Remember this?", "¿Lo recuerdo?"), "memory-consent-close", onClose) {}
}
