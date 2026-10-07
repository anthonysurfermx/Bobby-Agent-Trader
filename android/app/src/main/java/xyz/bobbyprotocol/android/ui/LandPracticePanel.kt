package xyz.bobbyprotocol.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import java.util.Locale

private enum class PracticeNotice { UPDATED, REMOVED, UNDONE, REVEALED, RESET, SAVE_FAILED }

/** Native guest-only controls. Every state change is accepted by LandPractice before reaching the caller. */
@Composable
internal fun LandPracticePanel(
    state: LandPracticeState,
    fixture: LandPracticeState,
    catalog: Map<String, PracticeFootprint>,
    draft: LandDraft?,
    point: Pair<Int, Int>?,
    rotation: Int,
    enabled: Boolean,
    language: String,
    onItemName: (String) -> String,
    onDraftChosen: (LandDraft) -> Unit,
    onRotation: (Int) -> Unit,
    onCancel: () -> Unit,
    onUpdate: (LandPracticeState) -> Boolean,
) {
    val copy = remember(language) { PracticePanelCopy.forLanguage(language) }
    val blueprints = remember(catalog) {
        catalog.entries.filter { (id, footprint) -> id != "aura_core" && footprint.columns in 1..4 && footprint.rows in 1..4 }.sortedBy { it.key }
    }
    var pickerOpen by remember { mutableStateOf(false) }
    var resetOpen by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<Pair<PracticeNotice?, LandPracticeError?>?>(null) }
    val selected = draft?.takeIf { it.action == "move" }?.let { selection -> state.placements.firstOrNull { it.uid == selection.id } }
    val draftKnown = draft != null && draft.action in setOf("place", "move") && catalog[draft.itemId] != null &&
        (draft.action != "move" || selected?.itemId == draft.itemId)
    val placementError = if (draftKnown && point != null) LandPractice.canPlace(
        state, draft.itemId, point.first, point.second, rotation, selected?.uid, catalog,
    ) else null
    val canConfirm = enabled && draftKnown && point != null && placementError == null

    fun apply(update: LandPracticeUpdate, success: PracticeNotice) {
        when (update) {
            is LandPracticeUpdate.Accepted -> {
                if (onUpdate(update.state)) {
                    onCancel()
                    feedback = success to null
                } else feedback = PracticeNotice.SAVE_FAILED to null
            }
            is LandPracticeUpdate.Rejected -> {
                feedback = null to update.error
            }
        }
    }

    Card(Modifier.fillMaxWidth().testTag("land-practice-panel")) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(copy.title, style = MaterialTheme.typography.titleMedium)
            Text(copy.disclaimer, modifier = Modifier.testTag("land-practice-disclaimer"), style = MaterialTheme.typography.bodySmall)
            Text("${copy.focus} ${state.focusLevel}/2 · ${state.placements.size} ${copy.placed}", style = MaterialTheme.typography.labelMedium)
            OutlinedButton(
                onClick = { feedback = null; pickerOpen = true }, enabled = enabled && blueprints.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-blueprints"),
            ) { Text("${copy.chooseBlueprint} (${blueprints.size})") }
            if (draft != null) {
                HorizontalDivider()
                Text(onItemName(draft.itemId), style = MaterialTheme.typography.titleSmall)
                val dimensions = catalog[draft.itemId]
                val turned = rotation == 90 || rotation == 270
                dimensions?.let {
                    Text("${if (turned) it.rows else it.columns} × ${if (turned) it.columns else it.rows} · $rotation°", style = MaterialTheme.typography.labelMedium)
                }
                Text(if (point == null) copy.chooseCell else copy.dragPiece, style = MaterialTheme.typography.bodySmall)
                placementError?.let { Text(copy.error(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
                OutlinedButton(
                    onClick = { feedback = null; onRotation((rotation + 90) % 360) }, enabled = enabled && draftKnown,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-rotate"),
                ) { Text(copy.rotate) }
                OutlinedButton(
                    onClick = {
                        val target = point
                        if (draftKnown && target != null && enabled) {
                            val update = if (draft.action == "move") LandPractice.move(state, draft.id, target.first, target.second, rotation, catalog)
                            else LandPractice.place(state, draft.itemId, target.first, target.second, rotation, catalog)
                            apply(update, PracticeNotice.UPDATED)
                        }
                    }, enabled = canConfirm,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-confirm"),
                ) { Text(copy.confirm) }
                if (selected != null) OutlinedButton(
                    onClick = { if (enabled) apply(LandPractice.store(state, selected.uid, catalog), PracticeNotice.REMOVED) }, enabled = enabled,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-remove"),
                ) { Text(copy.remove) }
                TextButton(
                    onClick = { feedback = null; onCancel() }, enabled = enabled,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-cancel"),
                ) { Text(copy.cancel) }
            }
            feedback?.let { (success, failure) ->
                val message = failure?.let(copy::error) ?: when (success) {
                    PracticeNotice.UPDATED -> copy.saved
                    PracticeNotice.REMOVED -> copy.removed
                    PracticeNotice.UNDONE -> copy.undone
                    PracticeNotice.REVEALED -> copy.revealed
                    PracticeNotice.RESET -> copy.resetDone
                    PracticeNotice.SAVE_FAILED -> copy.savingFailed
                    null -> ""
                }
                Text(message, modifier = Modifier.testTag("land-practice-feedback").semantics { liveRegion = LiveRegionMode.Polite },
                    color = if (failure != null || success == PracticeNotice.SAVE_FAILED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall)
            }
            HorizontalDivider()
            OutlinedButton(
                onClick = { if (enabled) apply(LandPractice.undo(state, catalog), PracticeNotice.UNDONE) }, enabled = enabled && state.history.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-undo"),
            ) { Text("${copy.undo} (${state.history.size}/10)") }
            OutlinedButton(
                onClick = { if (enabled) apply(LandPractice.reveal(state), PracticeNotice.REVEALED) }, enabled = enabled && state.focusLevel < 2,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-reveal"),
            ) { Text(copy.reveal) }
            TextButton(
                onClick = { resetOpen = true }, enabled = enabled,
                modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-reset"),
            ) { Text(copy.reset) }
        }
    }
    if (pickerOpen) AlertDialog(
        onDismissRequest = { pickerOpen = false }, title = { Text(copy.chooseBlueprint) },
        text = {
            Column(Modifier.fillMaxWidth().heightIn(max = 420.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(copy.disclaimer, style = MaterialTheme.typography.bodySmall)
                blueprints.forEach { (id, footprint) ->
                    OutlinedButton(
                        onClick = {
                            if (enabled) {
                                pickerOpen = false; feedback = null
                                onDraftChosen(LandDraft("place", id, id, footprint.columns, footprint.rows))
                            }
                        }, enabled = enabled,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp).testTag("land-practice-blueprint-$id"),
                    ) { Text("${onItemName(id)} · ${footprint.columns} × ${footprint.rows}") }
                }
            }
        }, confirmButton = { TextButton(onClick = { pickerOpen = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text(copy.close) } },
    )
    if (resetOpen) AlertDialog(
        onDismissRequest = { resetOpen = false }, title = { Text(copy.resetTitle) }, text = { Text(copy.resetBody) },
        confirmButton = { TextButton(
            onClick = { if (enabled) { resetOpen = false; apply(LandPractice.reset(state, fixture), PracticeNotice.RESET) } },
            enabled = enabled, modifier = Modifier.heightIn(min = 48.dp).testTag("land-practice-reset-confirm"),
        ) { Text(copy.reset) } },
        dismissButton = { TextButton(onClick = { resetOpen = false }, modifier = Modifier.heightIn(min = 48.dp)) { Text(copy.cancel) } },
    )
}

private data class PracticePanelCopy(
    val title: String,
    val disclaimer: String,
    val focus: String,
    val placed: String,
    val chooseBlueprint: String,
    val chooseCell: String,
    val dragPiece: String,
    val rotate: String,
    val confirm: String,
    val remove: String,
    val cancel: String,
    val close: String,
    val undo: String,
    val reveal: String,
    val reset: String,
    val resetTitle: String,
    val resetBody: String,
    val saved: String,
    val removed: String,
    val undone: String,
    val revealed: String,
    val resetDone: String,
    val errors: List<String>,
) {
    val savingFailed: String get() = errors[8]
    fun error(value: LandPracticeError): String = when (value) {
        LandPracticeError.UNKNOWN_ITEM -> errors[0]
        LandPracticeError.INVALID_ID -> errors[1]
        LandPracticeError.OUTSIDE_ISLAND -> errors[2]
        LandPracticeError.FOGGED -> errors[3]
        LandPracticeError.OCCUPIED -> errors[4]
        LandPracticeError.MISSING_PIECE -> errors[5]
        LandPracticeError.NO_UNDO -> errors[6]
        LandPracticeError.INVALID_STATE -> errors[7]
    }

    companion object {
        fun forLanguage(language: String): PracticePanelCopy = when (language.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')) {
            "es" -> PracticePanelCopy(
                "Práctica local", "Práctica local: no da XP, Aura ni piezas para tu cuenta. El diseño se guarda solo en este dispositivo.",
                "Enfoque", "piezas colocadas", "Elegir un plano", "Toca una casilla libre del mapa para colocar la pieza.", "Arrastra la pieza o su asa para moverla; después confirma.",
                "Rotar 90°", "Confirmar en la práctica", "Quitar de la práctica", "Cancelar", "Cerrar", "Deshacer", "Revelar toda la isla", "Restablecer práctica",
                "¿Restablecer la práctica?", "Volverás al diseño inicial y al primer anillo de enfoque. No cambia tu cuenta. Puedes deshacer esta acción.",
                "Diseño de práctica actualizado.", "Pieza quitada de la práctica.", "Último cambio deshecho.", "Isla de práctica revelada.", "Práctica restablecida.",
                listOf("Este plano no está disponible en la práctica.", "No se pudo identificar esta pieza local.", "La pieza debe caber dentro de la isla.", "Revela el siguiente anillo antes de usar esta casilla.", "Esa posición está ocupada por otra pieza o por el Núcleo.", "Esta pieza ya no está en la práctica.", "No hay cambios para deshacer.", "La práctica no es válida. Restablécela para continuar.", "No se pudo guardar la práctica. Inténtalo de nuevo."),
            )
            "fr" -> PracticePanelCopy(
                "Entraînement local", "Entraînement local : il ne donne ni XP, ni Aura, ni pièces pour ton compte. Le plan reste sur cet appareil.",
                "Focus", "pièces placées", "Choisir un plan", "Touche une case libre de la carte pour placer la pièce.", "Fais glisser la pièce ou sa poignée, puis confirme.",
                "Tourner de 90°", "Confirmer l’entraînement", "Retirer de l’entraînement", "Annuler", "Fermer", "Annuler le dernier changement", "Révéler toute l’île", "Réinitialiser l’entraînement",
                "Réinitialiser l’entraînement ?", "Tu retrouveras le plan initial et le premier anneau de focus. Ton compte ne change pas. Tu pourras annuler cette action.",
                "Plan d’entraînement mis à jour.", "Pièce retirée de l’entraînement.", "Dernier changement annulé.", "Île d’entraînement révélée.", "Entraînement réinitialisé.",
                listOf("Ce plan n’est pas disponible dans l’entraînement.", "Cette pièce locale n’a pas pu être identifiée.", "La pièce doit tenir dans l’île.", "Révèle l’anneau suivant avant d’utiliser cette case.", "Cette position est occupée par une pièce ou le Noyau.", "Cette pièce n’est plus dans l’entraînement.", "Aucun changement à annuler.", "L’entraînement n’est pas valide. Réinitialise-le pour continuer.", "Impossible d’enregistrer l’entraînement. Réessaie."),
            )
            "pt" -> PracticePanelCopy(
                "Prática local", "Prática local: não dá XP, Aura nem peças para a tua conta. O desenho fica apenas neste dispositivo.",
                "Foco", "peças colocadas", "Escolher um plano", "Toca numa casa livre do mapa para colocar a peça.", "Arrasta a peça ou a pega e depois confirma.",
                "Rodar 90°", "Confirmar na prática", "Retirar da prática", "Cancelar", "Fechar", "Desfazer", "Revelar toda a ilha", "Repor a prática",
                "Repor a prática?", "Voltas ao desenho inicial e ao primeiro anel de foco. A tua conta não muda. Podes desfazer esta ação.",
                "Desenho da prática atualizado.", "Peça retirada da prática.", "Última alteração desfeita.", "Ilha de prática revelada.", "Prática reposta.",
                listOf("Este plano não está disponível na prática.", "Não foi possível identificar esta peça local.", "A peça tem de caber dentro da ilha.", "Revela o anel seguinte antes de usar esta casa.", "Essa posição está ocupada por outra peça ou pelo Núcleo.", "Esta peça já não está na prática.", "Não há alterações para desfazer.", "A prática não é válida. Repõe-na para continuar.", "Não foi possível guardar a prática. Tenta novamente."),
            )
            "it" -> PracticePanelCopy(
                "Pratica locale", "La pratica locale non dà XP, Aura o pezzi al tuo account. Il progetto resta solo su questo dispositivo.",
                "Focus", "pezzi posizionati", "Scegli un progetto", "Tocca una casella libera sulla mappa per posizionare il pezzo.", "Trascina il pezzo o la maniglia, poi conferma.",
                "Ruota di 90°", "Conferma nella pratica", "Rimuovi dalla pratica", "Annulla", "Chiudi", "Annulla ultima modifica", "Rivela tutta l’isola", "Ripristina la pratica",
                "Ripristinare la pratica?", "Tornerai al progetto iniziale e al primo anello di focus. Il tuo account non cambia. Potrai annullare questa azione.",
                "Progetto di pratica aggiornato.", "Pezzo rimosso dalla pratica.", "Ultima modifica annullata.", "Isola di pratica rivelata.", "Pratica ripristinata.",
                listOf("Questo progetto non è disponibile nella pratica.", "Impossibile identificare questo pezzo locale.", "Il pezzo deve rientrare nell’isola.", "Rivela l’anello successivo prima di usare questa casella.", "Questa posizione è occupata da un pezzo o dal Nucleo.", "Questo pezzo non è più nella pratica.", "Non ci sono modifiche da annullare.", "La pratica non è valida. Ripristinala per continuare.", "Impossibile salvare la pratica. Riprova."),
            )
            "de" -> PracticePanelCopy(
                "Lokale Übung", "Die lokale Übung gibt deinem Konto keine XP, Aura oder Bauteile. Der Entwurf bleibt nur auf diesem Gerät.",
                "Fokus", "platzierte Bauteile", "Bauplan wählen", "Tippe auf ein freies Feld der Karte, um das Bauteil zu platzieren.", "Ziehe das Bauteil oder seinen Griff und bestätige dann.",
                "Um 90° drehen", "In der Übung bestätigen", "Aus der Übung entfernen", "Abbrechen", "Schließen", "Rückgängig", "Ganze Insel aufdecken", "Übung zurücksetzen",
                "Übung zurücksetzen?", "Du kehrst zum ursprünglichen Entwurf und ersten Fokusring zurück. Dein Konto bleibt unverändert. Du kannst dies rückgängig machen.",
                "Übungsentwurf aktualisiert.", "Bauteil aus der Übung entfernt.", "Letzte Änderung rückgängig gemacht.", "Übungsinsel aufgedeckt.", "Übung zurückgesetzt.",
                listOf("Dieser Bauplan ist in der Übung nicht verfügbar.", "Dieses lokale Bauteil konnte nicht erkannt werden.", "Das Bauteil muss auf die Insel passen.", "Decke den nächsten Ring auf, bevor du dieses Feld nutzt.", "Hier steht bereits ein Bauteil oder der Kern.", "Dieses Bauteil ist nicht mehr in der Übung.", "Keine Änderungen zum Rückgängigmachen.", "Die Übung ist ungültig. Setze sie zurück, um fortzufahren.", "Die Übung konnte nicht gespeichert werden. Versuche es erneut."),
            )
            else -> PracticePanelCopy(
                "Local practice", "Local practice gives your account no XP, Aura or pieces. This layout stays on this device.",
                "Focus", "pieces placed", "Choose a blueprint", "Tap a free map cell to place the piece.", "Drag the piece or its handle, then confirm.",
                "Rotate 90°", "Confirm in practice", "Remove from practice", "Cancel", "Close", "Undo", "Reveal the whole island", "Reset practice",
                "Reset local practice?", "Return to the starting layout and first focus ring. Your account stays unchanged. You can undo this action.",
                "Practice layout updated.", "Piece removed from practice.", "Last change undone.", "Practice island revealed.", "Practice reset.",
                listOf("This blueprint is unavailable in practice.", "This local piece could not be identified.", "The piece must fit inside the island.", "Reveal the next ring before using this cell.", "Another piece or the Core occupies this position.", "This piece is no longer in practice.", "There are no changes to undo.", "Practice is invalid. Reset it to continue.", "Practice could not be saved. Try again."),
            )
        }
    }
}

/** Shared labels for the guest map container, without account or transport dependencies. */
internal object LandPracticeCopy {
    fun text(key: String, language: String): String {
        val code = language.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')
        val copy = PracticePanelCopy.forLanguage(code)
        val extra = when (code) {
            "es" -> listOf("Ejemplo público", "Cargando la práctica local…", "No se pudo cargar la práctica local.")
            "fr" -> listOf("Exemple public", "Chargement de l’entraînement local…", "Impossible de charger l’entraînement local.")
            "pt" -> listOf("Exemplo público", "A carregar a prática local…", "Não foi possível carregar a prática local.")
            "it" -> listOf("Esempio pubblico", "Caricamento della pratica locale…", "Impossibile caricare la pratica locale.")
            "de" -> listOf("Öffentliches Beispiel", "Lokale Übung wird geladen…", "Die lokale Übung konnte nicht geladen werden.")
            else -> listOf("Public example", "Loading local practice…", "Local practice could not be loaded.")
        }
        return when (key) {
            "practice_title" -> copy.title
            "practice_disclaimer", "disclaimer" -> copy.disclaimer
            "saving_failed" -> copy.savingFailed
            "readOnly", "read_only" -> extra[0]
            "loading" -> extra[1]
            "error", "source_unavailable" -> extra[2]
            else -> copy.title
        }
    }
}
