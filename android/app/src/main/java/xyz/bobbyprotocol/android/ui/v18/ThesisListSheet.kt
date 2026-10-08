package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.theses.ThesisCopy
import xyz.bobbyprotocol.android.v18.theses.ThesisListModel
import xyz.bobbyprotocol.android.v18.theses.V18HostWords

// My theses (1.8), the screen of ios/Bobby/Sources/V18/Theses/ThesisListSheet.swift.
// ios/Bobby/V18-DESIGN.md, "My theses": a row is an asset and where its review stands. A tap opens
// the review (which sends nothing by itself); edit and archive are in the row's menu. Archived
// ones wait folded underneath. Two quiet rows may sit on top: theses written before signing in
// ("Keep them" / "Not mine"), and a way to write a thesis from the read the person last saved.
// Everything on this screen is read from the thesis book on this phone; nothing here touches the network.
@Composable
fun ThesisListSheet(host: V18Host, onClose: () -> Unit) {
    val words = remember(host) { V18HostWords(host) }
    val copy = remember(words) { ThesisCopy(words) }
    // Evaluated once, when the sheet appears: a reminder tap's thesis is consumed here.
    val model = remember(host) {
        ThesisListModel(host.theses, words, { host.owner }, host.focus.takeThesisId(), { ThesisListModel.lastSavedRead(host) }, { host.now() })
    }
    val m = observedModel(model, model.changes)
    var deleting by remember { mutableStateOf<SavedThesis?>(null) }
    var showsDetails by remember { mutableStateOf(false) }

    // The book changed (a save, a review, another screen) or the account did: read it again.
    DisposableEffect(host, model) {
        val stopBook = host.theses.addListener { model.reload() }
        val stopAccount = host.onAccountChanged { model.reload() }
        onDispose {
            stopBook()
            stopAccount()
        }
    }

    fun review(id: String) {
        host.focus.thesisId = id
        host.switchSheet(V18Routes.THESIS_REVIEW)
    }

    fun edit(id: String) {
        host.focus.thesisId = id
        host.switchSheet(V18Routes.THESIS_EDITOR)
    }

    QuietSheet(host, host.text("My theses", "Mis tesis"), "theses-close", onClose, onInfo = { showsDetails = true }) {
        val list = m()
        val now = host.now()
        Spacer(Modifier.height(14.dp))
        if (list.guestCount > 0) {
            GuestRow(host, list.guestCount, onKeep = { model.keepGuestTheses() }, onDecline = { model.declineGuestTheses() })
        } else if (list.isEmpty) {
            Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 10.dp).testTag("theses-empty"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(host.text("No theses yet.", "Aún no hay tesis."), color = QuietColors.cream, fontSize = 16.sp)
                QuietNote(host.text("Start with a saved read.", "Empieza con una lectura guardada."))
            }
        }
        // The read the person last saved has no thesis yet: the editor opens on a draft from it.
        val read = list.writable
        if (read != null) {
            val title = host.text("Write thesis", "Escribir tesis") + " · " + read.symbol
            val write = {
                host.focus.clear()
                host.focus.draftRequestId = read.requestId
                host.switchSheet(V18Routes.THESIS_EDITOR)
            }
            if (list.isEmpty) {
                Spacer(Modifier.height(8.dp))
                QuietPrimary(title, "theses-write", onClick = write)
                Spacer(Modifier.height(6.dp))
            } else {
                QuietLink(title, "theses-write", QuietGlyph.PLUS, onClick = write)
            }
        }
        for (thesis in list.active) {
            key(thesis.id) {
                val state = copy.rowState(thesis, now)
                ThesisRow(
                    symbol = thesis.symbol, state = state, marked = list.highlight == thesis.id, overdue = list.isOverdue(thesis),
                    spoken = host.text("Review {0}", "Revisar {0}", thesis.symbol) + ". " + state, tag = "theses-review-" + thesis.symbol,
                    onClick = { review(thesis.id) },
                ) {
                    QuietMenu(host.text("More options", "Más opciones") + ", " + thesis.symbol, "theses-menu-" + thesis.symbol, listOf(
                        QuietMenuItem(host.text("Edit", "Editar"), "theses-edit-" + thesis.symbol) { edit(thesis.id) },
                        QuietMenuItem(host.text("Archive", "Archivar"), "theses-archive-" + thesis.symbol) { model.archive(thesis.id) }))
                }
            }
        }
        if (list.archived.isNotEmpty()) {
            QuietDisclosure(host, host.text("Archived", "Archivadas"), "theses-archived-toggle", count = list.archived.size, initiallyOpen = list.highlightIsArchived) {
                val blocked = m().problemText()
                if (blocked != null) QuietNote(blocked, Modifier.padding(bottom = 6.dp), tag = "theses-reopen-problem")
                for (thesis in m().archived) {
                    key(thesis.id) {
                        Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("theses-archived-" + thesis.symbol), verticalAlignment = Alignment.CenterVertically) {
                            Text(thesis.symbol, Modifier.weight(1f), color = QuietColors.muted, fontSize = 16.sp)
                            Box(Modifier.offset(x = 7.dp)) {
                                QuietMenu(host.text("More options", "Más opciones") + ", " + thesis.symbol, "theses-menu-" + thesis.symbol, listOf(
                                    QuietMenuItem(host.text("Reopen", "Reabrir"), "theses-reopen-" + thesis.symbol) { model.reopen(thesis.id) },
                                    QuietMenuItem(host.text("Delete", "Eliminar"), "theses-delete-" + thesis.symbol) { deleting = thesis }))
                            }
                        }
                    }
                }
            }
        }
    }

    val doomed = deleting
    if (doomed != null) {
        ThesisConfirmDialog(
            title = host.text("Delete this thesis? It is removed from this phone for good.", "¿Eliminar esta tesis? Se borra de este teléfono para siempre."),
            confirm = host.text("Delete", "Eliminar"), cancel = host.text("Cancel", "Cancelar"), tag = "theses-delete-confirm",
            onConfirm = {
                model.delete(doomed.id)
                deleting = null
            },
            onCancel = { deleting = null })
    }
    if (showsDetails) {
        ThesisDetailsDialog(host, "theses-details", onClose = { showsDetails = false }) {
            QuietNote(copy.localOnly, tag = "theses-local-only")
        }
    }
}

/**
 * One active thesis: the asset on the left, where its review stands on the right (a past verdict
 * is history here: plain ink, never coloured), and its menu. The row itself opens the review.
 */
@Composable
private fun ThesisRow(symbol: String, state: String, marked: Boolean, overdue: Boolean, spoken: String, tag: String, onClick: () -> Unit, menu: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().testTag("theses-active-$symbol")) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Row(
                Modifier.weight(1f).heightIn(min = 56.dp).clickable(role = Role.Button, onClick = onClick).testTag(tag)
                    .clearAndSetSemantics {
                        contentDescription = spoken
                        role = Role.Button
                    },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(symbol, color = QuietColors.cream, fontSize = 17.sp, fontWeight = if (marked) FontWeight.Medium else FontWeight.Normal)
                Text(state, Modifier.weight(1f), color = if (overdue) QuietColors.cream else QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp, textAlign = TextAlign.End,
                     style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"))
            }
            // Under the sheet's close button: the header's glyphs reach 7 dp into the margin (iOS: trailing -7).
            Box(Modifier.offset(x = 7.dp)) { menu() }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
    }
}

/** Theses written before signing in: asked once, answered by the person. Two choices of equal weight. */
@Composable
private fun GuestRow(host: V18Host, count: Int, onKeep: () -> Unit, onDecline: () -> Unit) {
    val one = count == 1
    Column(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 14.dp).testTag("theses-guest"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(if (one) host.text("1 guest thesis", "1 tesis sin cuenta") else host.text("{0} guest theses", "{0} tesis sin cuenta", count),
             color = QuietColors.cream, fontSize = 16.sp)
        QuietNote(if (one) host.text("Keep it in this account?", "¿Conservarla en esta cuenta?") else host.text("Keep them in this account?", "¿Conservarlas en esta cuenta?"),
                  tag = "theses-guest-question")
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            QuietChip(if (one) host.text("Keep it", "Conservarla") else host.text("Keep them", "Conservarlas"), "theses-guest-keep", Modifier.weight(1f), onClick = onKeep)
            QuietChip(if (one) host.text("Not mine", "No es mía") else host.text("Not mine", "No son mías"), "theses-guest-decline", Modifier.weight(1f), onClick = onDecline)
        }
    }
}
