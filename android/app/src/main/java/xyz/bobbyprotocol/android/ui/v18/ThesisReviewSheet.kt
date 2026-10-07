package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.runtime.Composable
import xyz.bobbyprotocol.android.v18.V18Host

// Owned by the `memory-theses` track: one thesis read against today's price evidence; it reads `host.focus.takeThesisId()` (ThesisReviewSheet.swift).
// A placeholder until that screen lands: a title and the way out.
@Composable
fun ThesisReviewSheet(host: V18Host, onClose: () -> Unit) {
    QuietSheet(host, host.text("Review now", "Revisar ahora"), "thesis-review-close", onClose) {}
}
