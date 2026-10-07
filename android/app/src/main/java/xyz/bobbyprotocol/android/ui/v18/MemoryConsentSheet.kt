package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.ui.BobbySupportLinks
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.memory.MemoryCenter
import xyz.bobbyprotocol.android.v18.memory.MemoryConsentModel
import xyz.bobbyprotocol.android.v18.memory.MemoryCopy
import xyz.bobbyprotocol.android.v18.memory.MemoryError
import xyz.bobbyprotocol.android.v18.memory.MemoryExplanation
import xyz.bobbyprotocol.android.v18.theses.V18HostWords

// The memory consent sheet (1.8), the screen of ios/Bobby/Sources/V18/Memory/MemoryConsentSheet.swift:
// the one place where memory is turned on for this phone's questions. It opens from the offer on
// the glass ("How it works") and from Memory › "Turn on".
//
// It is the consent, so it says everything before asking, and only what the code does: what is
// kept, what is sent to the AI provider when Bobby answers, for how long it is used, and how to
// undo it. Two buttons of equal weight, nothing pre-selected, and they follow the last line in the
// scroll: they are never pinned above something still unread.
// Closing the sheet is "not now" without recording anything; only the "Not now" button records a
// decline. Nothing reaches the network until "Remember" is tapped.
@Composable
fun MemoryConsentSheet(host: V18Host, onClose: () -> Unit) {
    val center = remember(host) { MemoryCenter.of(host) }
    val model = remember(center) { MemoryConsentModel(center) }
    MemoryConsentScreen(host, model, onClose)
}

/** How long the confirmation line stays before the sheet steps aside. */
private const val DONE_LINGER_MILLIS = 1_800L

/** The consent itself, on a model: the sheet above shows it, and so does Memory › "Turn on" in its own sheet. */
@Composable
internal fun MemoryConsentScreen(host: V18Host, model: MemoryConsentModel, onClose: () -> Unit) {
    val words = remember(host) { V18HostWords(host) }
    val m = observedModel(model, model.changes)
    DisposableEffect(host, model) {
        val stop = host.onAccountChanged { model.accountChanged() }
        onDispose { stop() }
    }
    val phase = m().phase
    LaunchedEffect(phase) {
        // One confirmation line, long enough to read, then the sheet steps aside. The wait ends
        // with the screen, so a sheet the person already closed is never closed twice.
        if (phase == MemoryConsentModel.Phase.DONE) {
            delay(DONE_LINGER_MILLIS)
            onClose()
        }
    }
    QuietSheet(host, host.text("Remember this?", "¿Lo recuerdo?"), "memory-consent-close", onClose) {
        MemoryExplanationRows(MemoryExplanation.items(words, m().retentionDays))
        QuietLink(host.text("Privacy Policy", "Política de privacidad"), "memory-consent-privacy") {
            host.openExternal(BobbySupportLinks.url(BobbySupportLinks.Page.PRIVACY, host.language, host.locale, host.repository.country))
        }
        val current = m().phase
        if (!m().signedIn) {
            QuietNote(MemoryCopy(words).error(MemoryError.SIGNED_OUT), Modifier.padding(top = 6.dp), tag = "memory-consent-signed-out")
        } else if (current == MemoryConsentModel.Phase.DONE) {
            Text(host.text("On from your next question.", "Activa desde tu próxima pregunta."),
                 Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 6.dp).testTag("memory-consent-done").semantics { liveRegion = LiveRegionMode.Polite },
                 color = QuietColors.cream, fontSize = 16.sp, lineHeight = 22.sp)
        } else {
            if (current == MemoryConsentModel.Phase.FAILED) {
                QuietNote(host.text("Could not enable memory.", "No se pudo activar la memoria."),
                          Modifier.padding(top = 6.dp).semantics { liveRegion = LiveRegionMode.Polite }, tag = "memory-consent-error")
            }
            // Side by side, or stacked at the large font sizes: the same button twice, neither of them the highlighted one.
            val answering = current != MemoryConsentModel.Phase.WORKING
            val decline = {
                model.decline()
                onClose()
            }
            val accept = {
                host.scope.launch { model.remember() }
                Unit
            }
            if (LocalDensity.current.fontScale >= 1.5f) {
                Column(Modifier.fillMaxWidth().padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuietChip(host.text("Not now", "Ahora no"), "memory-consent-decline", Modifier.fillMaxWidth(), enabled = answering, onClick = decline)
                    QuietChip(host.text("Remember", "Recordar"), "memory-consent-accept", Modifier.fillMaxWidth(), enabled = answering, onClick = accept)
                }
            } else {
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuietChip(host.text("Not now", "Ahora no"), "memory-consent-decline", Modifier.weight(1f), enabled = answering, onClick = decline)
                    QuietChip(host.text("Remember", "Recordar"), "memory-consent-accept", Modifier.weight(1f), enabled = answering, onClick = accept)
                }
            }
        }
    }
}

/**
 * What memory is: two inventories and the end of use, item by item. Nothing in them is collapsed,
 * replaced by a glyph, or summarised. The consent sheet shows all of it; Memory › "How it works"
 * shows the same words.
 */
@Composable
internal fun MemoryExplanationRows(items: List<MemoryExplanation.Item>) {
    Column(Modifier.fillMaxWidth()) {
        for (item in items) {
            Column(
                Modifier.fillMaxWidth().padding(top = if (item.label == null) 6.dp else 16.dp).testTag("memory-explain-" + item.id).semantics(mergeDescendants = true) {},
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                val label = item.label
                if (label != null) {
                    Text(label, color = QuietColors.dim, fontSize = 13.sp)
                    Text(item.text, color = QuietColors.cream, fontSize = 15.sp, lineHeight = 22.sp)
                    val note = item.note
                    if (note != null) Text(note, color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
                } else {
                    Text(item.text, color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
                }
            }
        }
    }
}
