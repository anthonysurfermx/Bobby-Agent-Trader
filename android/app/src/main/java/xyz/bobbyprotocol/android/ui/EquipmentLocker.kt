package xyz.bobbyprotocol.android.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.equipment.EquipmentCompanion
import xyz.bobbyprotocol.android.equipment.EquipmentItem
import xyz.bobbyprotocol.android.equipment.EquipmentLedger
import xyz.bobbyprotocol.android.equipment.EquipmentState
import xyz.bobbyprotocol.android.equipment.EquipmentStore
import xyz.bobbyprotocol.android.equipment.EquipmentStage
import xyz.bobbyprotocol.android.nucleo.NucleoSession

/** Earned catalogue and local outfit choices. It never substitutes the thesis ledger or island inventory. */
@Composable
fun EquipmentLocker(session: NucleoSession, repository: BobbyRepository, onError: (String) -> Unit) {
    val context = LocalContext.current
    val account by repository.session.collectAsStateWithLifecycle()
    val epoch by repository.epoch.collectAsStateWithLifecycle()
    val owner = account?.userId
    val equipment = remember(context) { EquipmentStore(context) }
    val catalog = remember(context) { EquipmentStore.catalog(context) }
    val scope = rememberCoroutineScope()
    val t: (String, String) -> String = { en, es -> session.text(en, es) }
    var xp by remember(epoch) { mutableIntStateOf(0) }
    var ownId by remember(epoch) { mutableStateOf<String?>(null) }
    var ready by remember(epoch) { mutableStateOf(false) }
    var disabled by remember(epoch) { mutableStateOf<Set<String>>(emptySet()) }
    var revision by remember(epoch) { mutableIntStateOf(0) }
    var syncing by remember(epoch) { mutableStateOf(false) }
    var selectedCompanion by remember(epoch) { mutableStateOf<String?>(null) }
    var focusedId by remember(epoch) { mutableStateOf<String?>(null) }
    var rosterRevision by remember(epoch) { mutableIntStateOf(0) }
    val roster = remember(session.language, epoch, rosterRevision) {
        val values = session.roster().getJSONArray("companions")
        (0 until values.length()).map { values.getJSONObject(it) }
    }
    val companions = roster.map { EquipmentCompanion(it.getString("id"), it.getString("label"), it.optInt("requiredLevel", 1)) }
    val order = EquipmentLedger.order(companions, ownId)
    val ownedIds = EquipmentLedger.ownedIds(catalog, companions, ownId, xp)
    // A getter fences the native session's cached XP before account observers have applied a new epoch.
    LaunchedEffect(epoch, owner) {
        ready = false
        try { equipment.bind(owner); disabled = equipment.unequippedIds() }
        catch (_: Exception) { onError(EquipmentCopy.saveFailed(session.language)); return@LaunchedEffect }
        var seeded = false
        while (isActive && repository.epoch.value == epoch) {
            if (session.ownerUserId == owner) {
                val snapshot = session.snapshot()
                xp = snapshot.optInt("xp").coerceAtLeast(0)
                ownId = session.companionId
                if (!seeded) {
                    try { equipment.seedSeen(EquipmentLedger.ownedIds(catalog, companions, ownId, xp)) }
                    catch (_: Exception) { onError(EquipmentCopy.saveFailed(session.language)); return@LaunchedEffect }
                    seeded = true
                    selectedCompanion = ownId ?: EquipmentLedger.order(companions, ownId).firstOrNull()?.id
                }
                ready = true
            }
            delay(500)
        }
    }
    if (!ready) { CircularProgressIndicator(Modifier.size(24.dp)); return }
    val current = order.firstOrNull { it.id == selectedCompanion } ?: order.firstOrNull() ?: return
    val currentIndex = order.indexOf(current)
    val items = catalog.filter { it.companionId == current.id }
    val reachable = EquipmentLedger.reachable(current, ownId, xp)
    val focused = items.firstOrNull { it.id == focusedId }
    val equippedItems = items.filter { EquipmentLedger.isEquipped(it.id, ownedIds, disabled) }
    var stageReady by remember(epoch, current.id) { mutableStateOf(false) }
    val next = EquipmentLedger.nextProgress(items, current, ownId, xp)
    val unseen = remember(epoch, ownedIds, revision) { equipment.unseen(ownedIds) }
    val currentRoster = roster.first { it.optString("id") == current.id }
    DisposableEffect(epoch, current.id, ownedIds) {
        onDispose {
            if (repository.epoch.value == epoch && repository.session.value?.userId == owner) {
                runCatching { equipment.markSeen(items.map(EquipmentItem::id).filter { it in ownedIds }.toSet()) }
            }
        }
    }
    fun choose(id: String) {
        if (repository.epoch.value != epoch || repository.session.value?.userId != owner) return
        try { equipment.markSeen(items.map(EquipmentItem::id).filter { it in ownedIds }.toSet()) }
        catch (_: Exception) { onError(EquipmentCopy.saveFailed(session.language)); return }
        selectedCompanion = id; focusedId = null; revision++
    }
    val localNotice = EquipmentCopy.local(session.language)
    Column(Modifier.fillMaxWidth().testTag("equipment-locker"), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(EquipmentCopy.title(session.language), style = MaterialTheme.typography.headlineSmall)
        Text("${ownedIds.size} / ${catalog.size} · $xp XP", color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge)
        Text(localNotice, style = MaterialTheme.typography.bodySmall, color = Color(0xFF9EA4AF))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { choose(order[currentIndex - 1].id) }, enabled = currentIndex > 0,
                modifier = Modifier.testTag("locker-prev")) { Text("‹ " + t("Previous friend", "Amigo anterior")) }
            TextButton(onClick = { choose(order[currentIndex + 1].id) }, enabled = currentIndex < order.lastIndex,
                modifier = Modifier.testTag("locker-next")) { Text(t("Next friend", "Siguiente amigo") + " ›") }
        }
        Box(Modifier.fillMaxWidth().height(205.dp), contentAlignment = Alignment.Center) {
            ApprovedArt("${current.id}_thumb.png", current.label, Modifier.size(192.dp).alpha(if (stageReady) 0f else 1f).background(Color(0xFF171B27), CircleShape),
                silver = !reachable, portrait = true)
            EquipmentStage(current.id, current.label, equippedItems, locked = !reachable,
                reducedMotion = session.snapshot().optBoolean("reducedMotion"),
                modifier = Modifier.fillMaxSize().alpha(if (stageReady) 1f else 0f), onReady = { stageReady = it })
            focused?.let { item ->
                ApprovedArt(item.art, t(item.nameEnglish, item.nameSpanish),
                    Modifier.align(Alignment.BottomEnd).size(86.dp).background(Color(0xDD10141D), CircleShape).padding(6.dp),
                    silver = item.id !in ownedIds)
            }
        }
        if (equippedItems.isNotEmpty()) {
            Text(t("Equipped on this companion", "Equipo de este compañero"), style = MaterialTheme.typography.labelLarge)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                equippedItems.forEach { item ->
                    Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                        ApprovedArt(item.art, t(item.nameEnglish, item.nameSpanish), Modifier.size(64.dp))
                        Text(t(item.nameEnglish, item.nameSpanish), style = MaterialTheme.typography.labelSmall)
                    }
                }
            }
        }
        Text(current.label, style = MaterialTheme.typography.headlineMedium)
        Text(currentRoster.optString("role"), style = MaterialTheme.typography.labelLarge, color = Color(0xFF9BA7CF))
        if (current.id == ownId) Text(EquipmentCopy.yours(session.language), color = MaterialTheme.colorScheme.primary)
        if (!reachable) Text(EquipmentCopy.requiresLevel(session.language, current.requiredLevel), color = Color(0xFFB2B7C5))
        Text(currentRoster.optString("selectLine"), style = MaterialTheme.typography.bodyMedium)
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items.forEach { item ->
                val state = EquipmentLedger.state(item, current, ownId, xp)
                val isOwned = state == EquipmentState.Owned
                val equipped = EquipmentLedger.isEquipped(item.id, ownedIds, disabled)
                val accent = if (item.isGolden) Color(0xFFF5C443) else MaterialTheme.colorScheme.primary
                Column(Modifier.weight(1f).clickable {
                    if (repository.epoch.value != epoch || repository.session.value?.userId != owner) return@clickable
                    focusedId = if (focusedId == item.id) null else item.id
                    if (item.id in ownedIds) runCatching { equipment.markSeen(setOf(item.id)) }
                        .onFailure { onError(EquipmentCopy.saveFailed(session.language)) }
                    revision++
                }
                    .testTag("locker-box-${item.id}").semantics {
                        contentDescription = t(item.nameEnglish, item.nameSpanish)
                        stateDescription = if (isOwned) { if (equipped) t("Equipped", "Equipado") else t("Stored", "Guardado") } else stateLabel(state, session)
                        selected = focusedId == item.id
                    }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(Modifier.fillMaxWidth().height(80.dp).background(if (item.isGolden && isOwned) accent.copy(alpha = .1f) else Color(0xFF151923), RoundedCornerShape(16.dp))
                        .border(if (focusedId == item.id) 2.dp else 1.dp, if (isOwned) accent.copy(alpha = .7f) else Color(0xFF333946), RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                        ApprovedArt(item.art, null, Modifier.size(65.dp), silver = !isOwned)
                        if (item.id in unseen) Text(t("NEW", if (item.isPet) "NUEVA" else "NUEVO"), Modifier.align(Alignment.TopEnd).padding(4.dp), style = MaterialTheme.typography.labelSmall, color = accent)
                    }
                    Text(when { item.isPet -> t("PET", "MASCOTA"); item.tier == 1 -> t("COMMON", "COMÚN"); item.tier == 2 -> t("RARE", "RARO"); else -> t("GOLDEN", "DORADO") },
                        style = MaterialTheme.typography.labelSmall, color = if (isOwned) accent else Color(0xFF9AA0AF))
                    Text(if (isOwned) { if (equipped) t("Equipped", "Equipado") else t("Stored", "Guardado") }
                        else if (state == EquipmentState.FirstRead) t("1ST READ", "1ª LECTURA") else "${item.unlockXP} XP", style = MaterialTheme.typography.labelSmall)
                    if (next?.first == item.id) LinearProgressIndicator(progress = { next.second }, modifier = Modifier.fillMaxWidth().height(3.dp))
                }
            }
        }
        focused?.let { item ->
            val state = EquipmentLedger.state(item, current, ownId, xp)
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF151923))) {
                Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(t(item.nameEnglish, item.nameSpanish), style = MaterialTheme.typography.titleLarge)
                    Text(t(item.loreEnglish, item.loreSpanish))
                    Text(stateLabel(state, session), color = MaterialTheme.colorScheme.primary)
                    if (state == EquipmentState.Owned) {
                        val equipped = EquipmentLedger.isEquipped(item.id, ownedIds, disabled)
                        Button(onClick = {
                            if (repository.epoch.value != epoch || repository.session.value?.userId != owner) {
                                onError(t("Your account changed. Refresh and try again.", "Tu cuenta cambió. Actualiza e intenta de nuevo.")); return@Button
                            }
                            try {
                                if (equipment.toggle(item.id, ownedIds)) { disabled = equipment.unequippedIds(); revision++ }
                            } catch (_: Exception) { onError(EquipmentCopy.saveFailed(session.language)) }
                        }, modifier = Modifier.fillMaxWidth().testTag("equipment-toggle-${item.id}")) {
                            Text(if (equipped) t("UNEQUIP", "QUITAR") else t("EQUIP", "EQUIPAR"))
                        }
                        Text(t("Stays in your collection. Your XP stays the same.", "Se queda en tu colección. Conservas tu XP."), style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            items(order, key = EquipmentCompanion::id) { companion ->
                val unlocked = EquipmentLedger.reachable(companion, ownId, xp)
                Column(Modifier.clickable { choose(companion.id) }.padding(4.dp).semantics { selected = companion.id == current.id }, horizontalAlignment = Alignment.CenterHorizontally) {
                    ApprovedArt("${companion.id}_thumb.png", companion.label, Modifier.size(48.dp)
                        .border(if (companion.id == current.id) 2.dp else 1.dp, if (companion.id == current.id) MaterialTheme.colorScheme.primary else Color(0xFF3C4250), CircleShape),
                        silver = !unlocked, portrait = true)
                    Text(companion.label, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
        HorizontalDivider()
        Text(EquipmentCopy.progressNotice(session.language), style = MaterialTheme.typography.bodySmall, color = Color(0xFF9EA4AF))
        if (account != null) OutlinedButton(onClick = {
            if (syncing) return@OutlinedButton
            scope.launch {
                syncing = true
                try {
                    val reply = session.syncProgress()
                    if (repository.epoch.value != epoch) return@launch
                    if (reply == null) onError(EquipmentCopy.syncFailed(session.language))
                    else { xp = session.snapshot().optInt("xp").coerceAtLeast(0); rosterRevision++ }
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (_: Exception) { if (repository.epoch.value == epoch) onError(EquipmentCopy.syncFailed(session.language)) }
                finally { if (repository.epoch.value == epoch) syncing = false }
            }
        }, enabled = !syncing && session.riskAccepted) {
            if (syncing) CircularProgressIndicator(Modifier.size(16.dp))
            else Text(t("Sync progress", "Sincronizar progreso"))
        }
    }
}

@Composable
fun EquipmentCompanionArt(companionId: String, label: String, modifier: Modifier = Modifier.size(64.dp), locked: Boolean = false) {
    ApprovedArt("${companionId}_thumb.png", label, modifier, silver = locked, portrait = true)
}

@Composable
private fun ApprovedArt(name: String, description: String?, modifier: Modifier, silver: Boolean = false, portrait: Boolean = false) {
    val context = LocalContext.current
    var image by remember(name) { mutableStateOf<androidx.compose.ui.graphics.ImageBitmap?>(null) }
    LaunchedEffect(name) {
        image = withContext(Dispatchers.IO) {
            runCatching {
                context.assets.open("equipment/$name").use { BitmapFactory.decodeStream(it) }?.asImageBitmap()
            }.getOrNull()
        }
    }
    val grayscale = remember { ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) }
    Box(modifier.then(if (portrait) Modifier.clip(CircleShape) else Modifier), contentAlignment = Alignment.Center) {
        image?.let { Image(it, description, Modifier.fillMaxSize(),
            contentScale = if (portrait) ContentScale.Crop else ContentScale.Fit, colorFilter = if (silver) grayscale else null) }
            ?: Text(description?.take(1) ?: "◇", color = Color(0xFFAAB4D5), style = MaterialTheme.typography.titleMedium)
    }
}

private fun stateLabel(state: EquipmentState, session: NucleoSession): String = when (state) {
    EquipmentState.Owned -> session.text("Yours", "Tuyo")
    EquipmentState.FirstRead -> EquipmentCopy.firstRead(session.language)
    is EquipmentState.NeedsXP -> EquipmentCopy.xpToGo(session.language, state.remaining)
    is EquipmentState.NeedsLevel -> EquipmentCopy.requiresLevel(session.language, state.level) + " · " + EquipmentCopy.xpToGo(session.language, state.remainingXP)
}

private object EquipmentCopy {
    private fun pick(language: String, en: String, es: String, fr: String, pt: String, it: String, de: String): String =
        when (language) { "es" -> es; "fr" -> fr; "pt" -> pt; "it" -> it; "de" -> de; else -> en }
    fun title(l: String) = pick(l, "Equipment locker", "Casillero de equipo", "Casier d'équipement", "Armário de equipamento", "Armadietto dell'equipaggiamento", "Ausrüstungsschrank")
    fun local(l: String) = pick(l, "Your outfit choices are saved on this device.", "Tu equipo se guarda en este dispositivo.", "Tes choix d'équipement sont enregistrés sur cet appareil.", "As tuas escolhas de equipamento ficam guardadas neste dispositivo.", "Le scelte dell'equipaggiamento sono salvate su questo dispositivo.", "Deine Ausrüstungsauswahl wird auf diesem Gerät gespeichert.")
    fun yours(l: String) = pick(l, "YOUR COMPANION", "TU COMPAÑERO", "TON COMPAGNON", "O TEU COMPANHEIRO", "IL TUO COMPAGNO", "DEIN BEGLEITER")
    fun requiresLevel(l: String, level: Int) = pick(l, "Requires level $level", "Necesitas nivel $level", "Niveau $level requis", "Requer nível $level", "Richiede livello $level", "Benötigt Stufe $level")
    fun firstRead(l: String) = pick(l, "Your first complete read unlocks this piece.", "Tu primera lectura completa desbloquea esta pieza.", "Ta première analyse complète débloque cette pièce.", "A tua primeira análise completa desbloqueia esta peça.", "La tua prima analisi completa sblocca questo pezzo.", "Deine erste vollständige Analyse schaltet dieses Stück frei.")
    fun xpToGo(l: String, xp: Int) = pick(l, "$xp XP to go", "Faltan $xp XP", "Encore $xp XP", "Faltam $xp XP", "Mancano $xp XP", "Noch $xp XP")
    fun progressNotice(l: String) = pick(l, "Earn pieces through discipline XP. Reading well and returning counts; trade volume does not.", "Gana piezas con XP de disciplina. Cuenta leer bien y volver; el volumen de operaciones no.", "Gagne des pièces avec l'XP de discipline. Les bonnes analyses et le retour comptent, pas le volume de transactions.", "Ganha peças com XP de disciplina. Conta analisar bem e voltar; o volume de operações não conta.", "Guadagna pezzi con XP di disciplina. Contano le buone analisi e il ritorno, non il volume degli scambi.", "Verdiene Stücke mit Disziplin-XP. Gute Analysen und Wiederkommen zählen, kein Handelsvolumen.")
    fun saveFailed(l: String) = pick(l, "Could not save the outfit. Try again.", "No se pudo guardar el equipo. Intenta de nuevo.", "Impossible d'enregistrer l'équipement. Réessaie.", "Não foi possível guardar o equipamento. Tenta novamente.", "Impossibile salvare l'equipaggiamento. Riprova.", "Die Ausrüstung konnte nicht gespeichert werden. Versuche es erneut.")
    fun syncFailed(l: String) = pick(l, "Progress could not sync. Your local outfit is still saved.", "No se pudo sincronizar el progreso. Tu equipo local sigue guardado.", "Le progrès n'a pas pu être synchronisé. Ton équipement local reste enregistré.", "Não foi possível sincronizar o progresso. O teu equipamento local continua guardado.", "Impossibile sincronizzare i progressi. L'equipaggiamento locale è ancora salvato.", "Der Fortschritt konnte nicht synchronisiert werden. Deine lokale Ausrüstung bleibt gespeichert.")
}
