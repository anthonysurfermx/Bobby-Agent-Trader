package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.theses.ThesisCopy
import xyz.bobbyprotocol.android.v18.theses.ThesisEditorModel
import xyz.bobbyprotocol.android.v18.theses.ThesisEvents
import xyz.bobbyprotocol.android.v18.theses.V18HostWords

// Write or edit a thesis (1.8), the screen of ios/Bobby/Sources/V18/Theses/ThesisEditorSheet.swift.
// The person's own words about one asset: why they are looking at it, what worries them, what
// would change their mind, and for how long. Bobby may prefill a draft from a read, clearly
// labelled; nothing is stored until the person taps Save.
// ios/Bobby/V18-DESIGN.md, "Thesis editor": one question and one generous field; the two optional
// questions unfold; the time frame is one row; where it is kept is one line above Save.
// The route opens it through the host's focus: a thesis id (edit) or the request id of a read (draft).
@Composable
fun ThesisEditorSheet(host: V18Host, onClose: () -> Unit) {
    val copy = remember(host) { ThesisCopy(V18HostWords(host)) }
    // Evaluated once, when the sheet appears: the hand-off is consumed here and nowhere else.
    val model = remember(host) {
        ThesisEditorModel(
            source = ThesisEditorModel.open(host.focus.takeThesisId(), host.focus.takeDraftRequestId(), host.theses, host.owner) { host.readSummary(it) },
            book = host.theses, owner = { host.owner }, epoch = { host.accountEpoch }, now = { host.now() }, events = ThesisEvents.of(host))
    }
    val m = observedModel(model, model.changes)
    var asksToDiscard by remember { mutableStateOf(false) }
    var showsDetails by remember { mutableStateOf(false) }
    // Words that are already there are never folded away.
    var showsMore by remember { mutableStateOf(model.worry.isNotEmpty() || model.changeMind.isNotEmpty()) }
    // What the fields show is kept here and handed to the model on every keystroke, so typing never waits for it.
    var why by remember { mutableStateOf(model.hypothesis) }
    var worry by remember { mutableStateOf(model.worry) }
    var changeMind by remember { mutableStateOf(model.changeMind) }

    // Words that are not saved are never dropped without asking once: not by a pull on the sheet, not by Back.
    val guard = LocalQuietDismissGuard.current
    DisposableEffect(guard, model) {
        guard.canDismiss = { !model.hasUnsavedWords }
        guard.onBlocked = { asksToDiscard = true }
        onDispose {
            guard.canDismiss = { true }
            guard.onBlocked = {}
        }
    }
    // Another account (or none) now: these words were being written for the previous one.
    DisposableEffect(host) {
        val stop = host.onAccountChanged { onClose() }
        onDispose { stop() }
    }

    fun close() {
        if (model.hasUnsavedWords) asksToDiscard = true else onClose()
    }

    fun finish(outcome: ThesisEditorModel.Outcome) {
        if (outcome is ThesisEditorModel.Outcome.Created || outcome is ThesisEditorModel.Outcome.Edited) onClose()
    }

    val problem = m().problem
    val missing = model.source is ThesisEditorModel.Source.Missing
    val showsWords = !missing && (problem == null || problem == ThesisEditorModel.Problem.EmptyHypothesis)
    val base = if (model.isNew) host.text("Your thesis", "Tu tesis") else host.text("Edit thesis", "Editar tesis")
    val symbol = model.symbol
    val title = if (symbol == null) base else "$base · $symbol"
    val info: (() -> Unit)? = if (showsWords) ({ showsDetails = true }) else null
    val bottom: (@Composable ColumnScope.() -> Unit)? = if (!showsWords) null else ({
        QuietNote(host.text("Only on this phone.", "Solo en este teléfono."), tag = "thesis-editor-scope")
        Spacer(Modifier.height(10.dp))
        QuietPrimary(host.text("Save", "Guardar"), "thesis-editor-save") { finish(model.save()) }
    })

    QuietSheet(host, title, "thesis-editor-close", onClose = { close() }, onInfo = info, bottom = bottom) {
        val current = m().problem
        if (missing || current == ThesisEditorModel.Problem.NotFound) {
            EditorMessage(host, if (current == ThesisEditorModel.Problem.NotFound)
                              host.text("This thesis is unavailable in this account.", "Esta tesis no está disponible en esta cuenta.")
                          else host.text("Ask about an asset first.", "Pregunta por un activo primero."), "thesis-editor-missing", onClose)
        } else if (current == ThesisEditorModel.Problem.Stale) {
            EditorMessage(host, host.text("Account changed. Reopen your theses.", "Cuenta cambiada. Abre tus tesis de nuevo."), "thesis-editor-stale", onClose)
        } else if (current is ThesisEditorModel.Problem.AlreadyActive) {
            Text(host.text("You already have a thesis for {0}.", "Ya tienes una tesis de {0}.", symbol ?: ""),
                 Modifier.padding(top = 22.dp, bottom = 18.dp).testTag("thesis-editor-exists"), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 22.sp)
            QuietPrimary(host.text("Open it", "Ábrela"), "thesis-editor-open-existing") {
                host.focus.thesisId = current.id
                host.switchSheet(V18Routes.THESES)
            }
        } else if (current == ThesisEditorModel.Problem.LimitReached) {
            Text(host.text("3 active theses. Archive one first.", "3 tesis activas. Archiva una primero."),
                 Modifier.padding(top = 22.dp, bottom = 8.dp).testTag("thesis-editor-limit"), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 22.sp)
            for (thesis in m().active) {
                key(thesis.id) {
                    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text(thesis.symbol, Modifier.weight(1f), color = QuietColors.cream, fontSize = 16.sp)
                        QuietLink(host.text("Archive", "Archivar"), "thesis-editor-archive-" + thesis.symbol) { finish(model.archiveAndSave(thesis.id)) }
                    }
                    Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
                }
            }
            Spacer(Modifier.height(18.dp))
            QuietChip(host.text("Back to my words", "Volver a mis palabras"), "thesis-editor-back") { model.backToWords() }
        } else {
            if (model.draftedByBobby) {
                // Said before saving: these first words are Bobby's, and the person's to change.
                QuietNote(host.text("Bobby draft · editable", "Borrador de Bobby · editable"), Modifier.padding(top = 12.dp), tag = "thesis-editor-draft-note")
            }
            EditorField(host, host.text("Why this asset?", "¿Por qué este activo?"), why, "thesis-editor-why", 3, 10, 16.dp) {
                model.hypothesis = it
                why = model.hypothesis
            }
            if (current == ThesisEditorModel.Problem.EmptyHypothesis) {
                QuietNote(host.text("Write why this asset interests you.", "Escribe por qué te interesa este activo."), Modifier.padding(top = 6.dp), tag = "thesis-editor-empty")
            }
            val folded = if (showsMore) host.text("Expanded", "Abierto") else host.text("Collapsed", "Cerrado")
            Row(
                Modifier.fillMaxWidth().padding(top = 6.dp).heightIn(min = 48.dp).clickable(role = Role.Button) { showsMore = !showsMore }
                    .testTag("thesis-editor-more").semantics(mergeDescendants = true) { stateDescription = folded },
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(if (showsMore) host.text("Optional", "Opcional") else host.text("Add detail", "Añadir detalle"), color = QuietColors.muted, fontSize = 14.sp)
                QuietGlyphMark(if (showsMore) QuietGlyph.CHEVRON_UP else QuietGlyph.CHEVRON_DOWN, Modifier.size(10.dp), QuietColors.dim)
            }
            if (showsMore) {
                EditorField(host, host.text("What worries you?", "¿Qué te preocupa?"), worry, "thesis-editor-worry", 1, 8, 2.dp) {
                    model.worry = it
                    worry = model.worry
                }
                EditorField(host, host.text("What changes your mind?", "¿Qué te haría cambiar?"), changeMind, "thesis-editor-change-mind", 1, 8, 12.dp) {
                    model.changeMind = it
                    changeMind = model.changeMind
                }
            }
            HorizonRow(host, copy, m().horizon) { model.horizon = it }
        }
    }

    if (showsDetails) {
        ThesisDetailsDialog(host, "thesis-editor-details", onClose = { showsDetails = false }) {
            val price = model.startingPrice
            if (price != null) QuietRow(host.text("Starting price", "Precio inicial"), "thesis-editor-asset", value = copy.price(price), hairline = false)
            QuietNote(copy.localOnly, tag = "thesis-editor-local-only")
        }
    }
    if (asksToDiscard) {
        ThesisConfirmDialog(
            title = host.text("Discard your text?", "¿Descartar tu texto?"), confirm = host.text("Discard", "Descartar"),
            cancel = host.text("Keep writing", "Seguir escribiendo"), tag = "thesis-editor-discard",
            onConfirm = {
                asksToDiscard = false
                onClose()
            },
            onCancel = { asksToDiscard = false })
    }
}

/** One question and its field. The limit shows only when it is near, and only for the field being written. */
@Composable
private fun EditorField(host: V18Host, label: String, value: String, tag: String, minLines: Int, maxLines: Int, top: Dp, onChange: (String) -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(top = top), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(label, color = QuietColors.muted, fontSize = 14.sp)
        OutlinedTextField(
            value = value, onValueChange = onChange,
            modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused }.testTag(tag).semantics { contentDescription = label },
            textStyle = LocalTextStyle.current.copy(fontSize = 16.sp, lineHeight = 22.sp),
            placeholder = { Text(host.text("Your words", "Tus palabras"), fontSize = 16.sp) },
            minLines = minLines, maxLines = maxLines, shape = RoundedCornerShape(14.dp), colors = quietFieldColors())
        val count = value.codePointCount(0, value.length)
        if (focused && count > ThesisBook.TEXT_LIMIT - 80) {
            val spoken = host.text("{0} of {1} characters", "{0} de {1} caracteres", count, ThesisBook.TEXT_LIMIT)
            Text(count.toString() + "/" + ThesisBook.TEXT_LIMIT, Modifier.fillMaxWidth().semantics { contentDescription = spoken },
                 color = QuietColors.dim, fontSize = 11.sp, textAlign = TextAlign.End)
        }
    }
}

/** One row. No value is chosen for the person; picking the current one again clears it. */
@Composable
private fun HorizonRow(host: V18Host, copy: ThesisCopy, horizon: ThesisHorizon?, onPick: (ThesisHorizon?) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(Modifier.fillMaxWidth().padding(top = 8.dp)) {
        QuietRow(host.text("Time frame", "Plazo"), "thesis-editor-horizon", value = horizon?.let { copy.horizon(it) } ?: host.text("Not set", "Sin definir"),
                 chevron = true, hairline = false, onClick = { open = true })
        DropdownMenu(open, { open = false }, containerColor = QuietColors.surface) {
            for (option in ThesisHorizon.entries) {
                val picked = horizon == option
                val check: (@Composable () -> Unit)? = if (picked) ({ QuietGlyphMark(QuietGlyph.CHECK) }) else null
                DropdownMenuItem(
                    text = { Text(copy.horizon(option), color = QuietColors.cream, fontSize = 15.sp) },
                    onClick = {
                        open = false
                        onPick(if (picked) null else option)
                    },
                    modifier = Modifier.testTag("thesis-editor-horizon-" + option.raw), trailingIcon = check)
            }
            if (horizon != null) {
                DropdownMenuItem(
                    text = { Text(host.text("Not set", "Sin definir"), color = QuietColors.cream, fontSize = 15.sp) },
                    onClick = {
                        open = false
                        onPick(null)
                    },
                    modifier = Modifier.testTag("thesis-editor-horizon-none"))
            }
        }
    }
}

/** A state that is not the words: one line and the way out. */
@Composable
private fun EditorMessage(host: V18Host, text: String, tag: String, onClose: () -> Unit) {
    Text(text, Modifier.padding(top = 22.dp, bottom = 16.dp).testTag(tag), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 22.sp)
    QuietChip(host.text("Close", "Cerrar"), "thesis-editor-done", onClick = onClose)
}
