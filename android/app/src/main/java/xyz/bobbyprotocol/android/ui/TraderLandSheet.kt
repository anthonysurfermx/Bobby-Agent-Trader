package xyz.bobbyprotocol.android.ui

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.roundToInt
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.AccountChangedException
import xyz.bobbyprotocol.android.data.AccountVersion
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.TimeZone

/**
 * Content for the native island sheet; the caller owns its container/navigation.
 * Uses real /api/trader-land and /api/trader-land-public JSON, never a seeded account world.
 * Client v2 + observed size keep growth/move requests consistent with release54 iOS.
 * Older servers expose fewer capabilities; the extra controls follow those flags.
 * onExternalUrl receives only a canonical Bobby island/support URL. onClose is optional.
 */
@Composable
fun TraderLandSheet(
    session: NucleoSession,
    repository: BobbyRepository,
    onError: (String) -> Unit,
    onExternalUrl: (String) -> Unit,
    onClose: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val account by repository.session.collectAsStateWithLifecycle()
    val epoch by repository.epoch.collectAsStateWithLifecycle()
    val owner = account?.userId
    val lifecycleOwner = LocalLifecycleOwner.current
    val helpPreferences = remember(context) { context.applicationContext.getSharedPreferences("bobby.traderLandHelp", 0) }
    val firstVisit = remember(repository, helpPreferences) {
        TraderLandFirstVisit(
            wasShown = { key -> helpPreferences.getBoolean(key, false) },
            saveShown = { key -> helpPreferences.edit().putBoolean(key, true).commit() },
            currentAccount = { AccountVersion(repository.session.value?.userId, repository.epoch.value) },
        )
    }
    val helpOwner = remember(epoch, owner) { AccountVersion(owner, epoch) }
    val helpCopy = TraderLandHelpCopy.forLanguage(session.language, accountIsland = owner != null)
    var helpOpen by remember(epoch, owner) { mutableStateOf(false) }
    var screenVisible by remember(epoch, owner) { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val t: (String, String) -> String = { en, es -> session.text(en, es) }
    val preferences = remember(context) { context.getSharedPreferences("bobby_land_community", 0) }
    var blocked by remember { mutableStateOf(LandJson.blocked(preferences.getString("blocked", null))) }
    var world by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var neighbors by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var showcase by remember { mutableStateOf<JSONObject?>(null) }
    var visit by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var tab by remember(epoch, owner) { mutableStateOf("mine") }
    var busy by remember(epoch, owner) { mutableStateOf(false) }
    var mustReload by remember(epoch, owner) { mutableStateOf(false) }
    var error by remember(epoch, owner) { mutableStateOf<String?>(null) }
    var notice by remember(epoch, owner) { mutableStateOf<String?>(null) }
    var draft by remember(epoch, owner) { mutableStateOf<LandDraft?>(null) }
    var destination by remember(epoch, owner) { mutableStateOf<Pair<Int, Int>?>(null) }
    var rotation by remember(epoch, owner) { mutableIntStateOf(0) }
    var title by remember(epoch, owner) { mutableStateOf("") }
    var codeInput by remember(epoch, owner) { mutableStateOf("") }
    var publishConfirm by remember(epoch, owner) { mutableStateOf(false) }
    var publishRulesAccepted by remember(epoch, owner) { mutableStateOf(false) }
    var communityOpen by remember(epoch, owner) { mutableStateOf(false) }
    var reason by remember(epoch, owner) { mutableStateOf("offensive") }
    var details by remember(epoch, owner) { mutableStateOf("") }
    var reportSent by remember(epoch, owner, visit) { mutableStateOf(false) }
    val headers = remember { mapOf("X-Trader-Land-Client" to "2") }
    val communityRules = t("Use respectful names and layouts. Hate, harassment, threats, sexual or illegal content, scams, impersonation and false or manipulated personal information are prohibited. Do not publish contact details, wallet information or private financial data.", "Usa nombres y diseños respetuosos. Se prohíben el odio, acoso, amenazas, contenido sexual o ilegal, estafas, suplantación e información personal falsa o manipulada. No publiques datos de contacto, información de wallets ni datos financieros privados.")
    LaunchedEffect(context) {
        try { showcase = withContext(Dispatchers.IO) { context.assets.open("traderland/showcase.json").bufferedReader().use { JSONObject(it.readText()) } } }
        catch (_: Exception) { onError(t("The example island could not be loaded.", "No se pudo cargar la isla de ejemplo.")) }
    }
    fun current(requireAccount: Boolean = false) {
        if (repository.epoch.value != epoch || repository.session.value?.userId != owner) throw AccountChangedException()
        check(session.riskAccepted) { t("Accept the risk notice before opening Trader Land.", "Acepta el aviso de riesgo antes de abrir Trader Land.") }
        check(!requireAccount || owner != null) { t("Sign in to open your island.", "Inicia sesión para abrir tu isla.") }
    }
    fun canShowHelp(): Boolean = screenVisible && !publishConfirm && !communityOpen && session.riskAccepted &&
        repository.epoch.value == helpOwner.epoch && repository.session.value?.userId == helpOwner.userId &&
        lifecycleOwner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)
    fun openHelp(manual: Boolean) {
        if (!canShowHelp()) return
        // A manual visit also records the guide as seen, but remains available after that receipt.
        val first = firstVisit.claim(helpOwner, screenVisible, canPresent = !helpOpen)
        if (manual || first) helpOpen = true
    }
    fun failure(failed: Exception) {
        if (repository.epoch.value != epoch) return
        error = if (failed is ApiException) LandJson.string(failed.payload, "error")
            ?: LandJson.string(failed.payload, "message") ?: "${t("Request failed", "La solicitud falló")} (${failed.status})"
        else if (failed is IllegalStateException) failed.message
        else t("Connection interrupted. Reload to check the saved island before repeating the action.", "Conexión interrumpida. Recarga para comprobar la isla guardada antes de repetir la acción.")
        error?.let(onError)
    }
    suspend fun loadMine() {
        current(true)
        val answer = repository.request("api/trader-land", authenticated = true, headers = headers)
        current(true); LandJson.requireWorld(answer)
        world = answer; title = LandJson.string(answer.optJSONObject("share"), "title").orEmpty()
        draft = null; destination = null; mustReload = false
    }
    suspend fun loadNeighbors() {
        current()
        val answer = repository.request("api/trader-land-public", headers = headers)
        current(); check(answer.optBoolean("ok") && answer.optJSONArray("worlds") != null) { t("Islands are unavailable.", "Las islas no están disponibles.") }
        neighbors = answer
    }
    fun task(requireAccount: Boolean = false, action: suspend () -> Unit) {
        if (busy) return
        try { current(requireAccount) } catch (failed: Exception) { failure(failed); return }
        busy = true; error = null; notice = null
        scope.launch {
            try { action(); current(requireAccount) }
            catch (cancelled: CancellationException) { throw cancelled }
            catch (failed: Exception) { failure(failed) }
            finally { if (repository.epoch.value == epoch) busy = false }
        }
    }
    fun mutate(body: JSONObject) {
        task(true) {
            // A timeout may occur after the server saved the write. Require a read before another write.
            mustReload = true
            val answer = repository.request("api/trader-land", "POST", body, true, headers)
            current(true); LandJson.requireWorld(answer)
            world = answer; mustReload = false; draft = null; destination = null
            title = LandJson.string(answer.optJSONObject("share"), "title").orEmpty()
            val closed = answer.optJSONObject("closed")
            val grew = answer.optJSONObject("grew")
            notice = when {
                closed != null -> "${t("Thesis reviewed", "Tesis revisada")}: ${closed.optString("outcome")} · ${closed.optInt("xp")} XP · ${closed.optInt("aura")} Aura"
                grew != null -> "${t("Island grew", "La isla creció")} · ${grew.optInt("from")} → ${grew.optInt("to")}"
                else -> t("Saved", "Guardado")
            }
            if (closed != null) {
                val synced = session.syncProgress()
                current(true)
                if (synced == null) notice = notice + " · " + t("Reload progress to refresh XP.", "Recarga el progreso para actualizar XP.")
            }
        }
    }
    fun visitCode(raw: String) {
        val code = LandJson.shareCode(raw)
        if (code == null) { error = t("Enter the island's 10-character code.", "Escribe el código de 10 caracteres de la isla."); error?.let(onError); return }
        if (code in blocked) { error = t("This creator is blocked on this device. Unblock them in community safety.", "Este creador está bloqueado en este dispositivo. Desbloquéalo en seguridad de la comunidad."); return }
        task {
            val answer = repository.request("api/trader-land-public?code=$code", headers = headers)
            current()
            val island = answer.optJSONObject("world")
            check(answer.optBoolean("ok") && island != null && LandJson.shareCode(island.optString("code")) == code) { t("This island is unavailable.", "Esta isla no está disponible.") }
            LandJson.requirePublicWorld(island!!)
            visit = answer; tab = "neighbors"; reason = "offensive"; details = ""
        }
    }
    fun saveBlocked(values: Map<String, String>) {
        if (!preferences.edit().putString("blocked", JSONObject(values).toString()).commit()) {
            error = t("Could not save the blocked creators. Try again.", "No se pudieron guardar los creadores bloqueados. Intenta de nuevo."); error?.let(onError)
        } else blocked = values
    }
    LaunchedEffect(epoch, owner) {
        if (owner != null && session.riskAccepted) {
            busy = true
            try { loadMine() } catch (cancelled: CancellationException) { throw cancelled }
            catch (failed: Exception) { failure(failed) }
            finally { if (repository.epoch.value == epoch) busy = false }
        }
    }
    LaunchedEffect(epoch, owner, screenVisible) {
        if (!screenVisible) return@LaunchedEffect
        // Wait for the sheet to appear, alongside its read tasks. Another dialog leaves the visit unspent.
        delay(600)
        openHelp(manual = false)
    }
    val writable = !busy && !mustReload && session.riskAccepted && owner != null
    val visiting = visit?.optJSONObject("world")
    Column(Modifier.fillMaxWidth().testTag("trader-land").onGloballyPositioned { coordinates ->
        screenVisible = coordinates.isAttached && coordinates.size.width > 0 && coordinates.size.height > 0
    }, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Trader Land", style = MaterialTheme.typography.headlineSmall)
            onClose?.let { TextButton(onClick = it, modifier = Modifier.heightIn(min = 48.dp)) { Text(t("Done", "Listo")) } }
        }
        OutlinedButton(onClick = { openHelp(manual = true) }, enabled = !publishConfirm && !communityOpen,
            modifier = Modifier.heightIn(min = 48.dp).testTag("land-help")) { Text(helpCopy.action) }
        Text(t("Read, wait, review your thesis, then build with earned pieces.", "Lee, espera, revisa tu tesis y construye con las piezas ganadas."))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            LandButton(t("My island", "Mi isla"), !busy) { tab = "mine"; visit = null }
            LandButton(t("Neighbors", "Vecinos"), !busy) { tab = "neighbors"; visit = null; if (neighbors == null) task { loadNeighbors() } }
        }
        if (busy) CircularProgressIndicator(Modifier.size(24.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        notice?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        if (!session.riskAccepted) Text(t("Accept the risk notice before opening Trader Land.", "Acepta el aviso de riesgo antes de abrir Trader Land."))
        if (tab == "mine") {
            if (owner == null) Text(t("Sign in to open your island. Public islands are available in Neighbors.", "Inicia sesión para abrir tu isla. Puedes ver las islas públicas en Vecinos."))
            else {
                LandButton(t("Reload island", "Recargar isla"), !busy && session.riskAccepted) { task(true) { loadMine() } }
                if (mustReload) Text(t("Reload your saved island before another change.", "Recarga tu isla guardada antes de otro cambio."), color = MaterialTheme.colorScheme.error)
                world?.let { actual ->
                    val land = actual.getJSONObject("land")
                    val size = land.getInt("size")
                    val pieces = LandJson.pieces(actual)
                    val caps = actual.optJSONObject("capabilities")
                    Text("$size × $size · ${actual.optInt("xp")} XP · ${actual.optInt("aura")} Aura", style = MaterialTheme.typography.titleLarge)
                    land.optJSONObject("growth")?.let { growth ->
                        val next = growth.optInt("nextSize")
                        if (next > size) Text("${t("Growth", "Crecimiento")}: ${growth.optInt("occupied")} / ${growth.optInt("threshold")} · $next × $next")
                    }
                    LandMap(land, pieces, draft, destination, rotation, writable, session.language, t) { x, y ->
                        if (draft != null) destination = x to y
                        else pieces.firstOrNull { it.contains(x, y) }?.let { piece ->
                            if (caps?.optBoolean("move") == true) { draft = LandDraft("move", piece.placementId, piece.itemId, piece.width, piece.height); rotation = piece.rotation; destination = piece.x to piece.y }
                        }
                    }
                    if (caps?.optBoolean("moveCore") == true) LandButton(t("Move Aura Core", "Mover Núcleo de Aura"), writable) { draft = LandDraft("move_core", "", "aura_core", 2, 2); rotation = 0; destination = null }
                    draft?.let { chosen ->
                        Text(t("Choose a destination on the grid, then confirm.", "Elige el destino en la cuadrícula y confirma."))
                        if (chosen.action != "move_core") LandButton("${t("Rotate", "Girar")} · $rotation°", writable) { rotation = (rotation + 90) % 360 }
                        val fits = destination?.let { LandJson.fits(land, pieces, chosen, it.first, it.second, rotation) } ?: false
                        if (destination != null && !fits) Text(t("This footprint overlaps another piece, the core or the island edge.", "Esta pieza se superpone con otra, el núcleo o el borde de la isla."), color = MaterialTheme.colorScheme.error)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            LandButton(t("Confirm position", "Confirmar posición"), writable && fits) {
                                val point = destination ?: return@LandButton
                                val body = JSONObject().put("action", chosen.action).put("x", point.first).put("y", point.second).put("size", size)
                                if (chosen.action != "move_core") body.put("rotation", rotation).put(if (chosen.action == "place") "inventoryId" else "placementId", chosen.id)
                                mutate(body)
                            }
                            LandButton(t("Cancel", "Cancelar"), !busy) { draft = null; destination = null }
                        }
                    }
                    LandJson.objects(actual.optJSONArray("tiers")).forEach { tier ->
                        val next = tier.optJSONObject("next")
                        Text("${tier.optInt("hours")} h · ${t("Next piece", "Próxima pieza")}: ${LandJson.name(next, session.language)}", style = MaterialTheme.typography.bodySmall)
                    }
                    actual.optJSONObject("season")?.let { season ->
                        Text("${LandJson.localized(season.opt("name"), session.language)} · ${season.optInt("earned")} / ${season.optInt("total")}")
                    }
                    HorizontalDivider()
                    Text(t("Collection", "Colección"), style = MaterialTheme.typography.titleLarge)
                    val inventory = LandJson.objects(actual.optJSONArray("inventory"))
                    if (inventory.isEmpty()) Text(t("Your earned pieces will appear here. Complete a read and return to review its thesis.", "Aquí aparecerán tus piezas ganadas. Completa una lectura y vuelve para revisar su tesis."))
                    inventory.forEach { entry ->
                        val item = entry.optJSONObject("item") ?: LandJson.catalogItem(actual, entry.optString("item_id"))
                        val name = LandJson.name(item, session.language)
                        val id = entry.optString("id")
                        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                                LandArt(entry.optString("item_id"), name, Modifier.size(64.dp))
                                Text(name, style = MaterialTheme.typography.titleMedium)
                            }
                            if (entry.optString("state") == "seed") {
                                val review = entry.optJSONObject("review")
                                val horizon = entry.optJSONObject("horizon")
                                Text(if (review?.optBoolean("ready") == true) t("Ready to review", "Lista para revisar") else t("Growing", "Creciendo"))
                                LandJson.string(horizon, "reviewAt")?.let { Text(LandJson.date(it, session.language)) }
                                    ?: LandJson.string(review, "reviewAt")?.let { Text(LandJson.date(it, session.language)) }
                                review?.optJSONObject("thesis")?.let { thesis -> Text("${thesis.optString("symbol")} · ${thesis.optString("direction")}") }
                                if (review?.optBoolean("ready") == true && caps?.optBoolean("close") == true) LandButton(t("Review thesis", "Revisar tesis"), writable) {
                                    mutate(JSONObject().put("action", "close").put("inventoryId", id).put("platform", "android").put("tzOffsetMin", -TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 60000))
                                }
                                if (caps?.optBoolean("extend") == true && horizon?.optBoolean("extendable") == true) {
                                    LandJson.extensionOptions(horizon).forEach { hours ->
                                        val footprint = if (hours == 72) "2 × 1" else "2 × 2"
                                        LandButton("${t("Extend horizon", "Extender horizonte")} · ${hours / 24} ${t("days", "días")} · $footprint", writable) { mutate(JSONObject().put("action", "extend").put("inventoryId", id).put("hours", hours)) }
                                    }
                                }
                            } else if (entry.optString("state") == "bloomed") {
                                val placement = pieces.firstOrNull { it.inventoryId == id }
                                if (placement == null && !entry.optBoolean("placed")) LandButton(t("Build with this piece", "Construir con esta pieza"), writable) {
                                    val footprint = LandJson.footprint(item)
                                    draft = LandDraft("place", id, entry.optString("item_id"), footprint.first, footprint.second); rotation = 0; destination = null
                                } else if (placement != null) {
                                    Text("${t("Placed", "Colocada")} · ${placement.x + 1}, ${placement.y + 1} · ${placement.rotation}°")
                                    if (caps?.optBoolean("move") == true) LandButton(t("Move piece", "Mover pieza"), writable) { draft = LandDraft("move", placement.placementId, placement.itemId, placement.width, placement.height); destination = placement.x to placement.y; rotation = placement.rotation }
                                    LandButton(t("Return to collection", "Volver a la colección"), writable) { mutate(JSONObject().put("action", "remove").put("placementId", placement.placementId)) }
                                }
                            }
                        } }
                    }
                    HorizontalDivider()
                    val share = actual.optJSONObject("share")
                    OutlinedTextField(title, { title = it.take(40) }, label = { Text(t("Island name", "Nombre de la isla")) }, modifier = Modifier.fillMaxWidth(), enabled = writable, singleLine = true)
                    // rename_private arrived with the v2 growth capability. An older server must not silently ignore it.
                    if (caps?.optBoolean("grow") == true) LandButton(t("Save name privately", "Guardar nombre en privado"), writable) { mutate(JSONObject().put("action", "rename_private").put("title", title)) }
                    if (share?.optBoolean("public") == true) {
                        val code = LandJson.shareCode(share.optString("code"))
                        code?.let { Text(it); LandButton(t("Open public link", "Abrir enlace público"), !busy) { onExternalUrl("https://bobbyprotocol.xyz/trader-land?code=$it") } }
                        LandButton(t("Make private", "Hacer privada"), writable) { mutate(JSONObject().put("action", "unpublish")) }
                    } else LandButton(t("Publish island", "Publicar isla"), writable) { helpOpen = false; publishRulesAccepted = false; publishConfirm = true }
                    Text(t("Publishing shares your island name and layout. Your account identity is not included in the public island.", "Publicar comparte el nombre y la distribución de tu isla. La isla pública no incluye la identidad de tu cuenta."), style = MaterialTheme.typography.bodySmall)
                }
            }
        } else {
            if (visiting != null) {
                LandButton(t("Back to neighbors", "Volver a vecinos"), !busy) { visit = null }
                Text(LandJson.string(visiting, "title") ?: t("Shared island", "Isla compartida"), style = MaterialTheme.typography.titleLarge)
                val isExample = visiting.optString("code") == "showcase-satoshi"
                Text(if (isExample) t("Read-only app example. These pieces do not belong to your inventory.", "Ejemplo de la app para explorar. Estas piezas no pertenecen a tu inventario.")
                    else t("You are visiting a public island. Changes stay with its builder.", "Estás visitando una isla pública. Los cambios pertenecen a su creador."))
                val land = JSONObject().put("size", visiting.getInt("size")).put("core", visiting.optJSONObject("core"))
                LandMap(land, LandJson.pieces(visit!!, public = true), null, null, 0, false, session.language, t) { _, _ -> }
                visiting.optJSONObject("stats")?.let { Text("${it.optInt("pieces")} ${t("pieces", "piezas")}") }
                if (!isExample) LandButton(t("Report or block creator", "Reportar o bloquear creador"), !busy) { helpOpen = false; communityOpen = true }
            } else {
                LandButton(t("Reload neighbors", "Recargar vecinos"), !busy && session.riskAccepted) { task { loadNeighbors() } }
                OutlinedTextField(codeInput, { codeInput = it.take(10) }, label = { Text(t("Island code", "Código de la isla")) }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                LandButton(t("Visit island", "Visitar isla"), !busy && session.riskAccepted) { visitCode(codeInput) }
                showcase?.let { example ->
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Satoshi Nakamoto", style = MaterialTheme.typography.titleMedium)
                        Text(t("Read-only app example", "Ejemplo de la app para explorar"))
                        LandButton(t("Visit", "Visitar"), !busy) { visit = example; reason = "offensive"; details = "" }
                    } }
                }
                val ownCode = LandJson.string(world?.optJSONObject("share"), "code")
                val rows = LandJson.objects(neighbors?.optJSONArray("worlds")).filter { LandJson.shareCode(it.optString("code")) != null && it.optString("code") !in blocked && it.optString("code") != ownCode }
                if (neighbors != null && rows.isEmpty()) Text(t("No public neighbors are available right now.", "No hay vecinos públicos disponibles en este momento."))
                rows.forEach { island ->
                    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(LandJson.string(island, "title") ?: t("Shared island", "Isla compartida"), style = MaterialTheme.typography.titleMedium)
                        Text("${island.optInt("size")} × ${island.optInt("size")} · ${island.optJSONObject("stats")?.optInt("pieces") ?: 0} ${t("pieces", "piezas")}")
                        LandButton(t("Visit", "Visitar"), !busy && session.riskAccepted) { visitCode(island.optString("code")) }
                    } }
                }
            }
        }
        LandButton(t("Community safety", "Seguridad de la comunidad"), !busy) { helpOpen = false; communityOpen = true }
    }
    if (helpOpen && !publishConfirm && !communityOpen && epoch == helpOwner.epoch &&
        owner == helpOwner.userId && session.riskAccepted) {
        TraderLandHelpDialog(helpCopy) { helpOpen = false }
    }
    if (publishConfirm) AlertDialog(onDismissRequest = { publishConfirm = false; publishRulesAccepted = false }, title = { Text(t("Publish island", "Publicar isla")) },
        text = { Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(t("Share this name and layout with visitors? You can make it private again here.", "¿Compartir este nombre y diseño con visitantes? Aquí puedes volver a hacerla privada."))
            Text(communityRules)
            Row(Modifier.fillMaxWidth().heightIn(min = 48.dp).toggleable(value = publishRulesAccepted, enabled = writable, role = Role.Checkbox, onValueChange = { publishRulesAccepted = it }), verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = publishRulesAccepted, onCheckedChange = null, enabled = writable)
                Text(t("I accept these community rules before publishing.", "Acepto estas reglas de la comunidad antes de publicar."), Modifier.weight(1f))
            }
        } },
        confirmButton = { TextButton(onClick = {
            if (publishRulesAccepted && writable) {
                publishConfirm = false; publishRulesAccepted = false
                mutate(JSONObject().put("action", "publish").put("title", title))
            }
        }, enabled = writable && publishRulesAccepted) { Text(t("Accept rules and publish", "Aceptar reglas y publicar")) } },
        dismissButton = { TextButton(onClick = { publishConfirm = false; publishRulesAccepted = false }) { Text(t("Cancel", "Cancelar")) } })
    if (communityOpen) AlertDialog(onDismissRequest = { if (!busy) communityOpen = false }, title = { Text(t("Community safety", "Seguridad de la comunidad")) },
        text = { Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            visiting?.takeIf { it.optString("code") != "showcase-satoshi" }?.let { island ->
                Text(LandJson.string(island, "title") ?: island.optString("code"))
                listOf("offensive" to t("Offensive content", "Contenido ofensivo"), "harassment" to t("Harassment or threats", "Acoso o amenazas"), "spam" to t("Spam or scam", "Spam o estafa"), "other" to t("Other concern", "Otro problema")).forEach { (id, label) ->
                    LandButton((if (reason == id) "● " else "○ ") + label, !busy && !reportSent) { reason = id }
                }
                OutlinedTextField(details, { details = it.take(500) }, label = { Text(t("Details (optional; no personal information)", "Detalles (opcional; sin datos personales)")) }, modifier = Modifier.fillMaxWidth(), enabled = !busy && !reportSent)
                LandButton(if (reportSent) t("Report received", "Reporte recibido") else t("Send report", "Enviar reporte"), !busy && !reportSent && session.riskAccepted) {
                    task {
                        val code = LandJson.shareCode(island.optString("code")) ?: throw IllegalStateException(t("Invalid island code", "Código de isla inválido"))
                        val answer = repository.request("api/trader-land-report", "POST", JSONObject().put("code", code).put("installation", repository.installationId).put("reason", reason).put("details", details))
                        current(); check(answer.optBoolean("ok")) { t("Your report was not sent. Try again or contact support.", "No se envió el reporte. Inténtalo de nuevo o contacta a soporte.") }; reportSent = true
                    }
                }
                if (reportSent) Text(t("The report is in Bobby's review queue.", "El reporte está en la cola de revisión de Bobby."))
                error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Text(t("Blocking hides this creator on this device, even if the island is renamed. You can unblock them here.", "Bloquear oculta a este creador en este dispositivo, aunque cambie el nombre de la isla. Puedes desbloquearlo aquí."), style = MaterialTheme.typography.bodySmall)
                LandButton(t("Block creator", "Bloquear creador"), !busy) {
                    val code = LandJson.shareCode(island.optString("code")) ?: return@LandButton
                    saveBlocked(blocked + (code to (LandJson.string(island, "title") ?: code)))
                    if (code in blocked) { visit = null; communityOpen = false }
                }
            }
            HorizontalDivider()
            Text(t("Blocked creators on this device", "Creadores bloqueados en este dispositivo"))
            if (blocked.isEmpty()) Text(t("No blocked creators", "No hay creadores bloqueados"))
            blocked.toSortedMap().forEach { (code, name) ->
                Text(name)
                LandButton(t("Unblock", "Desbloquear"), !busy) { saveBlocked(blocked - code) }
            }
            Text(communityRules, style = MaterialTheme.typography.bodySmall)
            LandButton(t("Community rules and support", "Reglas de la comunidad y soporte")) { onExternalUrl(BobbySupportLinks.url(BobbySupportLinks.Page.SUPPORT, session.language, session.locale, repository.country)) }
        } }, confirmButton = { TextButton(onClick = { communityOpen = false }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) { Text(t("Done", "Listo")) } })
}

@Composable private fun LandButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) { Text(label) }
}

private data class LandMapSprite(val asset: String, val frame: LandSpriteFrame)

@Composable private fun LandMap(land: JSONObject, pieces: List<LandPiece>, draft: LandDraft?, point: Pair<Int, Int>?, rotation: Int, editable: Boolean, language: String, t: (String, String) -> String, tap: (Int, Int) -> Unit) {
    val context = LocalContext.current
    val gridSize = land.getInt("size")
    val geometry = remember(gridSize) { TraderLandProjection(gridSize) }
    val core = LandJson.core(land)
    val stage = land.optJSONObject("core")?.optInt("stage", 1) ?: 1
    val sprites = buildList {
        fun addSprite(id: String, x: Int, y: Int, w: Int, h: Int, turn: Int, coreStage: Int = 1) {
            val asset = TraderLandSpriteCatalog.asset(id, coreStage)
            val art = TraderLandSpriteCatalog.art[asset] ?: return
            add(LandMapSprite(asset, geometry.sprite(x, y, w, h, turn, art, id == "aura_core" && coreStage == 0)))
        }
        addSprite("aura_core", core.first, core.second, 2, 2, 0, stage)
        pieces.forEach { addSprite(it.itemId, it.x, it.y, it.width, it.height, it.rotation) }
    }.sortedBy { it.frame.depth }
    val assets = sprites.map { it.asset }.distinct().sorted()
    var images by remember(assets) { mutableStateOf<Map<String, ImageBitmap>>(emptyMap()) }
    LaunchedEffect(context, assets) {
        images = withContext(Dispatchers.IO) {
            assets.mapNotNull { asset ->
                val bitmap = landArtCache.get(asset) ?: runCatching {
                    context.assets.open("traderland/$asset").use { BitmapFactory.decodeStream(it)?.asImageBitmap() }
                }.getOrNull()?.also { landArtCache.put(asset, it) }
                bitmap?.let { asset to it }
            }.toMap()
        }
    }
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    var zoom by remember(gridSize) { mutableStateOf(1f) }
    var pan by remember(gridSize) { mutableStateOf(Offset.Zero) }
    val camera = TraderLandCamera(viewport.width.toFloat(), viewport.height.toFloat(), zoom, pan.x, pan.y)
    val currentTap by rememberUpdatedState(tap)
    val maxZoom = 2.6f * gridSize / 8f
    fun changeCamera(nextZoom: Float, nextPan: Offset = pan) {
        zoom = nextZoom.coerceIn(.7f, maxZoom)
        val bounds = TraderLandCamera(viewport.width.toFloat(), viewport.height.toFloat(), zoom)
        val clamped = bounds.clampPan(nextPan.x, nextPan.y)
        pan = Offset(clamped.x, clamped.y)
    }
    val mapDescription = when (language) {
        "es" -> "Isla isométrica"; "fr" -> "Île isométrique"; "pt" -> "Ilha isométrica"
        "it" -> "Isola isometrica"; "de" -> "Isometrische Insel"; else -> "Isometric island"
    }
    val zoomDescriptions = when (language) {
        "es" -> "Alejar" to "Acercar"; "fr" -> "Zoom arrière" to "Zoom avant"; "pt" -> "Afastar" to "Aproximar"
        "it" -> "Riduci zoom" to "Aumenta zoom"; "de" -> "Verkleinern" to "Vergrößern"; else -> "Zoom out" to "Zoom in"
    }
    val resetDescription = when (language) {
        "es" -> "Encuadrar isla"; "fr" -> "Recentrer l’île"; "pt" -> "Enquadrar a ilha"
        "it" -> "Inquadra l’isola"; "de" -> "Insel einpassen"; else -> "Fit island"
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(Modifier.fillMaxWidth().aspectRatio(860f / 720f)
            .clip(RoundedCornerShape(16.dp)).clipToBounds().background(Color(0xFF07151C))
            .testTag("land-map").onSizeChanged { viewport = it }
            .semantics {
                contentDescription = "$mapDescription · $gridSize × $gridSize · ${pieces.size}"
                if (editable) customActions = (0 until gridSize).flatMap { y -> (0 until gridSize).map { x ->
                    val occupant = if (x in core.first until core.first + 2 && y in core.second until core.second + 2) "Aura Core"
                        else pieces.firstOrNull { it.contains(x, y) }?.itemId.orEmpty()
                    CustomAccessibilityAction("${t("Cell", "Celda")} ${x + 1}, ${y + 1}" + if (occupant.isBlank()) "" else " · $occupant") { currentTap(x, y); true }
                } }
            }
            .pointerInput(geometry, editable, camera) {
                detectTapGestures(onTap = { screen ->
                    if (editable && camera.scale > 0) {
                        val world = camera.unproject(LandPoint(screen.x, screen.y))
                        geometry.cellAt(world.x, world.y)?.let { currentTap(it.first, it.second) }
                    }
                })
            }
            .pointerInput(gridSize, viewport) {
                detectTransformGestures { _, delta, factor, _ ->
                    if (factor.isFinite() && factor > 0f) changeCamera(zoom * factor, pan + delta)
                }
            }) {
            fun path(points: List<LandPoint>) = Path().apply {
                moveTo(points.first().x, points.first().y)
                points.drop(1).forEach { lineTo(it.x, it.y) }; close()
            }
            withTransform({ translate(camera.x, camera.y); scale(camera.scale, camera.scale, Offset.Zero) }) {
                val slab = TraderLandProjection.slab
                drawOval(Color(0xFF000A10), Offset(70f, 362f), Size(720f, 280f))
                for (edge in listOf(1 to 2, 2 to 3)) {
                    val a = slab[edge.first]; val b = slab[edge.second]
                    drawPath(path(listOf(a, b, b.copy(y = b.y + 22f), a.copy(y = a.y + 22f))), if (edge.first == 1) Color(0xFF19202D) else Color(0xFF242238))
                }
                drawPath(path(slab), Brush.verticalGradient(listOf(Color(0xFF203B3A), Color(0xFF151D30)), 207f, 575f))
                for (y in 0 until gridSize) for (x in 0 until gridSize) {
                    drawPath(path(geometry.diamond(x, y)), Color(0xFF385057).copy(alpha = .48f), style = Stroke(.8f))
                }
                // Occupied footprints remain legible while local art loads, including future catalog items.
                drawPath(path(geometry.diamond(core.first, core.second, 2, 2)), Color(0xFF745099).copy(alpha = .24f))
                pieces.forEach { piece ->
                    val footprint = LandJson.rotated(piece.width, piece.height, piece.rotation)
                    drawPath(path(geometry.diamond(piece.x, piece.y, footprint.first, footprint.second)), Color(0xFF408377).copy(alpha = .24f))
                }
                val footprint = draft?.let { LandJson.rotated(it.width, it.height, rotation) }
                if (point != null && draft != null && footprint != null) {
                    val fits = LandJson.fits(land, pieces, draft, point.first, point.second, rotation)
                    val highlight = if (fits) Color(0xFF76D9AA) else Color(0xFFE17883)
                    val outline = path(geometry.diamond(point.first, point.second, footprint.first, footprint.second))
                    drawPath(outline, highlight.copy(alpha = .28f)); drawPath(outline, highlight, style = Stroke(2f))
                }
                sprites.forEach { sprite ->
                    val frame = sprite.frame
                    val art = TraderLandSpriteCatalog.art.getValue(sprite.asset)
                    val shadowWidth = frame.side * (art.right - art.left) * .75f
                    drawOval(Color.Black.copy(alpha = .3f), Offset(frame.x + frame.side / 2 - shadowWidth / 2, frame.depth - shadowWidth / 7), Size(shadowWidth, shadowWidth / 5))
                    images[sprite.asset]?.let { image ->
                        val drawSprite = {
                            drawImage(image, dstOffset = IntOffset(frame.x.roundToInt(), frame.y.roundToInt()), dstSize = IntSize(frame.side.roundToInt().coerceAtLeast(1), frame.side.roundToInt().coerceAtLeast(1)))
                        }
                        if (frame.flip) scale(-1f, 1f, Offset(frame.x + frame.side / 2, frame.y + frame.side / 2)) { drawSprite() } else drawSprite()
                    }
                }
                drawPath(path(slab), Color(0xFF75A99B).copy(alpha = .5f), style = Stroke(1.5f))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { changeCamera(zoom / 1.3f) }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = zoomDescriptions.first }) { Text("−") }
            Text("${(zoom * 100).roundToInt()}%")
            TextButton(onClick = { changeCamera(zoom * 1.3f) }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = zoomDescriptions.second }) { Text("+") }
            TextButton(onClick = { zoom = 1f; pan = Offset.Zero }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = resetDescription }) { Text("↺") }
        }
        point?.let { Text("${t("Cell", "Celda")} ${it.first + 1}, ${it.second + 1}") }
    }
}

private val landArtCache = LruCache<String, ImageBitmap>(40)
@Composable private fun LandArt(id: String, description: String?, modifier: Modifier, stage: Int = 1) {
    val context = LocalContext.current
    val safe = if (id == "axiom_archive_return_path") "axiom_archive_return_path_curve" else id
    val asset = "$safe" + if (safe == "aura_core") "_stage${if (stage == 0) 0 else 1}.png" else "_bloom.png"
    var image by remember(asset) { mutableStateOf(landArtCache.get(asset)) }
    LaunchedEffect(asset) {
        if (image == null && safe.matches(Regex("[a-z0-9_]{1,100}"))) image = withContext(Dispatchers.IO) {
            runCatching { context.assets.open("traderland/$asset").use { BitmapFactory.decodeStream(it)?.asImageBitmap() } }.getOrNull()?.also { landArtCache.put(asset, it) }
        }
    }
    Box(modifier, contentAlignment = Alignment.Center) {
        image?.let { Image(it, description, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
            ?: Text("◇", color = MaterialTheme.colorScheme.primary)
    }
}

internal data class LandDraft(val action: String, val id: String, val itemId: String, val width: Int, val height: Int)
internal data class LandPiece(val placementId: String, val inventoryId: String, val itemId: String, val x: Int, val y: Int, val rotation: Int, val width: Int, val height: Int) {
    fun contains(col: Int, row: Int): Boolean = LandJson.rotated(width, height, rotation).let { col in x until x + it.first && row in y until y + it.second }
}

/** Pure JSON/geometry helpers shared by the actual UI and JVM tests. Server validation is authoritative. */
internal object LandJson {
    fun objects(array: JSONArray?): List<JSONObject> = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
    fun string(value: JSONObject?, key: String): String? = value?.opt(key)?.takeIf { it is String }?.toString()?.takeIf { it.isNotBlank() }
    fun shareCode(raw: String): String? = raw.trim().lowercase(Locale.ROOT).takeIf { it.matches(Regex("[a-z0-9]{10}")) }
    fun requireWorld(value: JSONObject) { check(value.optBoolean("ok") && value.optJSONObject("land")?.optInt("size") in setOf(8, 10, 12, 16)) { string(value, "error") ?: "This island version is not supported yet." } }
    fun requirePublicWorld(value: JSONObject) { check(value.optInt("size") in setOf(8, 10, 12, 16)) { "This island version is not supported yet." } }
    fun core(land: JSONObject): Pair<Int, Int> = land.optJSONObject("core")?.let { it.optInt("x", 3) to it.optInt("y", 3) } ?: (3 to 3)
    fun rotated(w: Int, h: Int, rotation: Int): Pair<Int, Int> = if (rotation == 90 || rotation == 270) h to w else w to h
    fun footprint(item: JSONObject?): Pair<Int, Int> = item?.optJSONArray("footprint")?.let { it.optInt(0, 1) to it.optInt(1, 1) }
        ?: ((item?.optInt("footprint_w", 1) ?: 1) to (item?.optInt("footprint_h", 1) ?: 1))
    fun catalogItem(answer: JSONObject, id: String): JSONObject? = objects(answer.optJSONArray("catalog")).firstOrNull { it.optString("id") == id }
    fun pieces(answer: JSONObject, public: Boolean = false): List<LandPiece> {
        val root = if (public) answer.optJSONObject("world") ?: answer else answer
        return objects(root.optJSONArray("placements")).mapNotNull { p ->
            val inventoryId = p.optString("inventory_id")
            val entry = objects(answer.optJSONArray("inventory")).firstOrNull { it.optString("id") == inventoryId }
            val itemId = if (public) p.optString("item_id") else entry?.optString("item_id").orEmpty()
            if (itemId.isBlank()) return@mapNotNull null
            val item = entry?.optJSONObject("item") ?: catalogItem(answer, itemId)
            val f = footprint(item)
            if (f.first !in 1..4 || f.second !in 1..4) return@mapNotNull null
            LandPiece(p.optString("id"), inventoryId, itemId, p.optInt("x"), p.optInt("y"), p.optInt("rotation"), f.first, f.second)
        }
    }
    fun fits(land: JSONObject, pieces: List<LandPiece>, chosen: LandDraft, x: Int, y: Int, rotation: Int): Boolean {
        val size = land.optInt("size")
        val f = rotated(chosen.width, chosen.height, rotation)
        if (size !in setOf(8, 10, 12, 16) || f.first !in 1..4 || f.second !in 1..4 || rotation !in setOf(0, 90, 180, 270) || x < 0 || y < 0 || x + f.first > size || y + f.second > size) return false
        val c = core(land)
        for (row in y until y + f.second) for (col in x until x + f.first) {
            if (chosen.action != "move_core" && col in c.first until c.first + 2 && row in c.second until c.second + 2) return false
            if (pieces.any { (chosen.action != "move" || it.placementId != chosen.id) && it.contains(col, row) }) return false
        }
        return true
    }
    fun extensionOptions(horizon: JSONObject): List<Int> = if (!horizon.optBoolean("extendable")) emptyList() else
        (0 until (horizon.optJSONArray("extendTo")?.length() ?: 0)).map { horizon.getJSONArray("extendTo").optInt(it) }.filter { it in setOf(72, 168) && it > horizon.optInt("hours") }.distinct().sorted()
    fun localized(value: Any?, language: String): String = when (value) { is String -> value; is JSONObject -> string(value, language) ?: string(value, "en").orEmpty(); else -> "" }
    fun name(item: JSONObject?, language: String): String = localized(item?.opt("name"), language).takeIf(String::isNotBlank)
        ?: string(item, "attribution") ?: string(item, "id")?.replace('_', ' ').orEmpty()
    fun date(value: String, language: String): String = runCatching { DateTimeFormatter.ofPattern("d MMM yyyy · HH:mm", Locale.forLanguageTag(language)).withZone(ZoneId.systemDefault()).format(Instant.parse(value)) }.getOrDefault(value)
    fun blocked(json: String?): Map<String, String> = runCatching {
        val value = JSONObject(json ?: "{}")
        value.keys().asSequence().filter { shareCode(it) == it }.associateWith { string(value, it)?.take(80) ?: it }
    }.getOrDefault(emptyMap())
}
