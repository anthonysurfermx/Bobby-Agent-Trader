package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.memory.MemoryCenter
import xyz.bobbyprotocol.android.v18.memory.MemoryConsentModel
import xyz.bobbyprotocol.android.v18.memory.MemoryCopy
import xyz.bobbyprotocol.android.v18.memory.MemoryError
import xyz.bobbyprotocol.android.v18.memory.MemoryExplanation
import xyz.bobbyprotocol.android.v18.memory.MemoryNotice
import xyz.bobbyprotocol.android.v18.memory.MemoryPref
import xyz.bobbyprotocol.android.v18.memory.MemorySnapshot
import xyz.bobbyprotocol.android.v18.memory.RememberedAsset
import xyz.bobbyprotocol.android.v18.theses.V18HostWords

// Owned by the `memory-theses` track: the 1.8 Memory screen (ios/Bobby/Sources/Briefings/MemoryView.swift).
// The route `memory` exists since 1.1.4; this screen draws it now.
//
// Profile › Memory: what Bobby remembers about the account, and what this phone keeps.
// ios/Bobby/V18-DESIGN.md, "Memory": two switches, the assets, and three rows that unfold
// (preferences, what this phone keeps, how it works). When this phone's questions are not in
// memory, "Turn on" opens the consent (one consent path: the same screen the offer on the glass
// opens). MemoryCenter owns account isolation and makes deletion complete (server, shortcuts,
// theses, and what the other 1.8 features keep). What the phone keeps is there for everyone, signed
// in or not, behind the same row, "On this phone": signed out the screen is one sentence and that row.
// (iOS draws that part unfolded for a signed-out reader, three paragraphs before the first note.)

@Composable
fun MemorySheet(host: V18Host, onClose: () -> Unit) {
    val center = remember(host) { MemoryCenter.of(host) }
    var showingConsent by remember { mutableStateOf(false) }
    if (showingConsent) {
        // The full explanation before anything is turned on. Closing it comes back to this screen.
        val model = remember(center) { MemoryConsentModel(center) }
        MemoryConsentScreen(host, model) {
            showingConsent = false
            center.reloadLocal()
        }
    } else {
        MemoryScreen(host, center, onClose) { showingConsent = true }
    }
}

@Composable
private fun MemoryScreen(host: V18Host, center: MemoryCenter, onClose: () -> Unit, onTurnOn: () -> Unit) {
    val words = remember(host) { V18HostWords(host) }
    val copy = remember(words) { MemoryCopy(words) }
    val c = observedModel(center, center.changes)
    var reader by remember { mutableIntStateOf(0) }
    // The first answer has not come yet: a wait is shown, not "unavailable".
    var asked by remember { mutableStateOf(false) }

    DisposableEffect(host, center) {
        // A thesis written or deleted elsewhere, or another reader: what the phone keeps is read again.
        val stopBook = host.theses.addListener { center.reloadLocal() }
        val stopAccount = host.onAccountChanged {
            center.accountChanged()
            reader += 1
        }
        onDispose {
            stopBook()
            stopAccount()
        }
    }
    LaunchedEffect(center, reader) {
        asked = false
        center.reloadLocal()
        // Nothing reaches the network before the risk notice is accepted; signed out there is nobody to ask about.
        if (host.riskAccepted && host.owner != null) center.refresh()
        asked = true
    }

    QuietSheet(host, host.text("Memory", "Memoria"), "memory-close", onClose) {
        val now = c()
        val snapshot = now.snapshot
        if (now.currentUser() == null) {
            QuietNote(copy.error(MemoryError.SIGNED_OUT), Modifier.padding(top = 10.dp, bottom = 6.dp), tag = "memory-signed-out")
            // Nobody signed in: the phone still keeps a shortcut row, theses and follow-up notes of its
            // own. No server call. One row that unfolds, as for an account: the face stays one line
            // and one row (V18-DESIGN.md gives Memory about twenty words), and everything is a tap away.
            QuietDisclosure(host, host.text("On this phone", "En este teléfono"), "memory-local") {
                OnThisPhone(host, copy, center, c, mentionsDeletion = false)
            }
        } else if (!host.riskAccepted) {
            QuietNote(copy.riskRequired, Modifier.padding(top = 10.dp, bottom = 6.dp), tag = "memory-risk-required")
            QuietDisclosure(host, host.text("On this phone", "En este teléfono"), "memory-local") {
                OnThisPhone(host, copy, center, c, mentionsDeletion = false)
            }
        } else if (snapshot != null) {
            Loaded(host, copy, center, c, snapshot, onTurnOn)
        } else if (now.loading || !asked) {
            Box(Modifier.fillMaxWidth().padding(top = 40.dp), contentAlignment = Alignment.Center) { QuietProgress() }
        } else {
            // The server did not answer. What this phone keeps can still be seen and deleted.
            Text(copy.error(now.lastError ?: MemoryError.UNAVAILABLE), Modifier.padding(top = 24.dp, bottom = 12.dp).testTag("memory-unavailable"),
                 color = QuietColors.cream, fontSize = 13.sp, lineHeight = 18.sp)
            QuietChip(host.text("Try again", "Reintentar"), "memory-retry") {
                host.scope.launch { center.refresh() }
            }
            Spacer(Modifier.height(16.dp))
            OnThisPhone(host, copy, center, c, mentionsDeletion = true)
            DeleteEverything(host, copy, center, c, showsError = false)
        }
    }

    if (c().confirmingForgetAll) {
        ThesisConfirmDialog(
            title = host.text("Erase every remembered asset and your preferences?", "¿Borrar todos los activos recordados y tus preferencias?"),
            confirm = host.text("Delete everything", "Borrar todo"), cancel = host.text("Cancel", "Cancelar"), tag = "memory-forget-all-confirm",
            // The confirmation says exactly what goes: the server's memory and what this phone keeps.
            message = copy.deleteEverythingWarning + " " + copy.deliveredBriefingsNote,
            onConfirm = {
                host.scope.launch { center.confirmForgetAll() }
                Unit
            },
            onCancel = { center.cancelForgetAll() })
    }
}

/** Two switches, the assets, and three rows that unfold. Nothing that used to be explained on the face is gone: it is one tap away. */
@Composable
private fun Loaded(host: V18Host, copy: MemoryCopy, center: MemoryCenter, c: () -> MemoryCenter, snapshot: MemorySnapshot, onTurnOn: () -> Unit) {
    val now = c()
    val words = remember(host) { V18HostWords(host) }
    QuietToggle(host, host.text("Use account memory", "Usar memoria de la cuenta"), "memory-enabled", checked = snapshot.enabled,
                detail = if (snapshot.enabled) null else copy.paused, saving = now.saving, enabled = !now.saving) { on ->
        host.scope.launch { center.setEnabled(on) }
    }
    if (now.nativeOptedIn) {
        // On only through the consent; switching it off here is immediate and needs no network.
        QuietToggle(host, host.text("Include questions from this phone", "Incluir preguntas de este teléfono"), "memory-native-opt-in", checked = true,
                    enabled = !now.saving) { on ->
            if (!on) center.setNativeCapture(false)
        }
    } else {
        // This phone's questions are not in memory: one line that says so and one button to the consent.
        Column(Modifier.fillMaxWidth().testTag("memory-off")) {
            Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                // "Not added to memory", not "not saved": the phone does keep the asset as a shortcut.
                Text(host.text("Questions from this phone are not added to account memory.", "Las preguntas de este teléfono no añaden memoria de cuenta."),
                     Modifier.weight(1f), color = QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp)
                QuietChip(host.text("Turn on", "Activar"), "memory-turn-on", enabled = !now.saving, onClick = onTurnOn)
            }
            Hairline()
        }
    }
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(host.text("Assets", "Activos"), color = QuietColors.cream, fontSize = 16.sp)
        Text(snapshot.assets.size.toString(), color = QuietColors.dim, fontSize = 14.sp)
    }
    if (snapshot.assets.isEmpty()) {
        QuietNote(host.text("No remembered assets.", "Sin activos recordados."), Modifier.padding(bottom = 12.dp))
    } else {
        for (asset in snapshot.assets) {
            key(asset.symbol) { AssetRow(host, copy, center, asset, now.saving) }
        }
    }
    Hairline()
    QuietDisclosure(host, host.text("Your preferences", "Tus preferencias"), "memory-prefs") {
        for (field in MemoryPref.entries) PrefPicker(host, copy, center, field, snapshot.value(field), c().saving)
    }
    QuietDisclosure(host, host.text("On this phone", "En este teléfono"), "memory-local") {
        OnThisPhone(host, copy, center, c, mentionsDeletion = true)
    }
    QuietDisclosure(host, host.text("How it works", "Cómo funciona"), "memory-retention") {
        MemoryExplanationRows(MemoryExplanation.items(words, snapshot.retentionDays, compact = true))
    }
    DeleteEverything(host, copy, center, c, showsError = true)
    if (now.notice == MemoryNotice.ErasedEverything && snapshot.enabled && now.nativeOptedIn) {
        QuietNote(host.text("Memory stays on. Your next question restarts it.", "La memoria sigue activa. Tu próxima pregunta la reinicia."),
                  Modifier.padding(top = 6.dp), tag = "memory-still-on")
    }
}

@Composable
private fun Hairline() {
    Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
}

@Composable
private fun AssetRow(host: V18Host, copy: MemoryCopy, center: MemoryCenter, asset: RememberedAsset, saving: Boolean) {
    Hairline()
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(asset.symbol, Modifier.widthIn(min = 56.dp), color = QuietColors.cream, fontSize = 13.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
        Text(copy.assetLine(asset, host.now()), Modifier.weight(1f), color = QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp)
        QuietLink(host.text("Forget", "Olvidar"), "memory-forget-" + asset.symbol, enabled = !saving) {
            host.scope.launch { center.forget(asset.symbol) }
        }
    }
}

/** One preference: "Not set" clears it (null on the server), any other chip sets it. One correction at a time. */
@Composable
private fun PrefPicker(host: V18Host, copy: MemoryCopy, center: MemoryCenter, field: MemoryPref, current: String?, saving: Boolean) {
    Column(Modifier.fillMaxWidth().padding(top = 18.dp).testTag("memory-pref-" + field.raw), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(copy.prefLabel(field).uppercase(), color = QuietColors.dim, fontSize = 10.5.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.2.sp)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            QuietChip(host.text("Not set", "Sin definir"), "memory-pref-" + field.raw + "-none", selected = current == null, enabled = !saving) {
                if (current != null) host.scope.launch { center.setPref(field, null) }
            }
            for (value in field.allowed) {
                QuietChip(copy.optionLabel(field, value), "memory-pref-" + field.raw + "-" + value, selected = current == value, enabled = !saving) {
                    if (current != value) host.scope.launch { center.setPref(field, value) }
                }
            }
        }
    }
}

/**
 * What the phone keeps with no copy on Bobby's servers: the shortcut row, the theses written
 * here (count only) and the notes Bobby keeps to plan follow-ups (ui/v18/FollowUpSheet.kt).
 * `mentionsDeletion` is false where Forget and Delete everything are not on screen.
 */
@Composable
private fun OnThisPhone(host: V18Host, copy: MemoryCopy, center: MemoryCenter, c: () -> MemoryCenter, mentionsDeletion: Boolean) {
    val local = c().local
    Text(if (mentionsDeletion) copy.onThisPhoneNote + " " + copy.onThisPhoneDeletionNote else copy.onThisPhoneNote,
         Modifier.padding(bottom = 8.dp).testTag("memory-local-note"), color = QuietColors.dim, fontSize = 12.sp, lineHeight = 17.sp)
    Hairline()
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(host.text("Recent assets shown as shortcuts", "Activos recientes que ves como accesos rápidos"), color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
            Text(if (local.shortcuts.isEmpty()) host.text("No shortcuts", "Sin accesos rápidos") else local.shortcuts.joinToString(" · "),
                 Modifier.testTag("memory-local-shortcuts"), color = QuietColors.cream, fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
        }
        if (local.shortcuts.isNotEmpty()) QuietLink(host.text("Clear", "Quitar"), "memory-clear-shortcuts") { center.clearShortcuts() }
    }
    Hairline()
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(host.text("Theses you wrote", "Tesis que escribiste"), Modifier.weight(1f), color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
        Text(if (local.theses == 0) host.text("No theses", "Sin tesis") else local.theses.toString(), Modifier.testTag("memory-local-theses"),
             color = QuietColors.cream, fontSize = 12.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
    }
    // What the phone keeps to plan follow-ups, in sentences, with the way to erase it (signed in or not).
    FollowUpNotes(host)
}

/** The one way to erase it all, asked once more before it runs, and how the last deletion ended. */
@Composable
private fun DeleteEverything(host: V18Host, copy: MemoryCopy, center: MemoryCenter, c: () -> MemoryCenter, showsError: Boolean) {
    val now = c()
    Spacer(Modifier.height(18.dp))
    QuietLink(host.text("Delete everything", "Borrar todo"), "memory-forget-all", enabled = !now.saving) { center.requestForgetAll() }
    val notice = now.notice
    val error = now.lastError
    if (notice != null) {
        Text(copy.notice(notice), Modifier.padding(top = 10.dp).testTag("memory-notice").semantics { liveRegion = LiveRegionMode.Polite },
             color = QuietColors.cream, fontSize = 13.sp, lineHeight = 18.sp)
    } else if (showsError && error != null) {
        Text(copy.error(error), Modifier.padding(top = 6.dp).testTag("memory-error"), color = QuietColors.cream, fontSize = 12.sp, lineHeight = 17.sp)
    }
}
