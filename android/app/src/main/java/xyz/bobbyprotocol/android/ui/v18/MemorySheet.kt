package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `memory-theses` track: the 1.8 Memory screen (ios/Bobby/Sources/Briefings/MemoryView.swift). The route `memory` exists since 1.1.4.
// A placeholder until that screen lands: a title and the way out.
/** False: BobbySheet keeps drawing `memory` as in 1.1.4. Make it true when the screen below is the real one; nothing else has to change. */
const val MEMORY_SHEET_READY = false

@Composable
fun MemorySheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Memory", "Memoria"), "memory-close", onClose) {}
}
