package xyz.bobbyprotocol.android.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.stateDescription
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.isActive
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
    val practicePreferences = remember(context) { context.applicationContext.getSharedPreferences("bobby.traderLandPractice", 0) }
    val currentRiskAccepted by rememberUpdatedState(session.riskAccepted)
    val practicePersistence = remember(repository, practicePreferences) {
        LandPracticePersistence(
            currentAccount = { AccountVersion(repository.session.value?.userId, repository.epoch.value) },
            riskAccepted = { currentRiskAccepted },
            read = { key -> practicePreferences.getString(key, null) },
            write = { key, value -> practicePreferences.edit().putString(key, value).commit() },
        )
    }
    var practiceCatalogJson by remember(epoch, owner) { mutableStateOf<JSONArray?>(null) }
    var practiceCatalog by remember(epoch, owner) { mutableStateOf<Map<String, PracticeFootprint>>(emptyMap()) }
    var practiceFixture by remember(epoch, owner) { mutableStateOf<LandPracticeState?>(null) }
    var practiceState by remember(epoch, owner) { mutableStateOf<LandPracticeState?>(null) }
    var practiceFailed by remember(epoch, owner) { mutableStateOf(false) }
    LaunchedEffect(epoch, owner, session.riskAccepted) {
        if (owner != null || !session.riskAccepted) return@LaunchedEffect
        try {
            val bundled = withContext(Dispatchers.IO) {
                val catalog = context.assets.open("traderland/practice-catalog.json").bufferedReader().use { JSONArray(it.readText()) }
                val fixture = context.assets.open("traderland/practice-fixture.json").bufferedReader().use { it.readText() }
                catalog to fixture
            }
            val catalog = LandJson.objects(bundled.first).associate { it.getString("id") to PracticeFootprint(it.getInt("footprint_w"), it.getInt("footprint_h")) }
            val fixture = checkNotNull(LandPractice.decodeFixture(bundled.second, catalog))
            when (val result = practicePersistence.load(AccountVersion(owner, epoch), catalog, fixture)) {
                is PracticePersistenceResult.Loaded -> {
                    practiceCatalogJson = bundled.first; practiceCatalog = catalog
                    practiceFixture = fixture; practiceState = result.state
                }
                else -> practiceFailed = true
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) {
            if (repository.epoch.value == epoch && repository.session.value?.userId == owner) practiceFailed = true
        }
    }
    var world by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var neighbors by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var neighborsFailed by remember(epoch, owner) { mutableStateOf(false) }
    var showcase by remember { mutableStateOf<JSONObject?>(null) }
    var visit by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var tab by remember(epoch, owner) { mutableStateOf("mine") }
    var busy by remember(epoch, owner) { mutableStateOf(false) }
    var mustReload by remember(epoch, owner) { mutableStateOf(false) }
    var error by remember(epoch, owner) { mutableStateOf<String?>(null) }
    var notice by remember(epoch, owner) { mutableStateOf<String?>(null) }
    var selectedPlacementId by remember(epoch, owner) { mutableStateOf<String?>(null) }
    var draft by remember(epoch, owner) { mutableStateOf<LandDraft?>(null) }
    var destination by remember(epoch, owner) { mutableStateOf<Pair<Int, Int>?>(null) }
    var rotation by remember(epoch, owner) { mutableIntStateOf(0) }
    var title by remember(epoch, owner) { mutableStateOf("") }
    var codeInput by remember(epoch, owner) { mutableStateOf("") }
    var navigationCode by remember(epoch, owner) { mutableStateOf<String?>(null) }
    var navigationId by remember(epoch, owner) { mutableIntStateOf(0) }
    fun requestCamera(code: String?) { navigationCode = code; navigationId++ }
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
        draft = null; destination = null; selectedPlacementId = null; mustReload = false
    }
    suspend fun loadNeighbors() {
        current()
        try {
            val answer = repository.request("api/trader-land-public", headers = headers)
            current(); check(answer.optBoolean("ok") && answer.optJSONArray("worlds") != null) { t("Islands are unavailable.", "Las islas no están disponibles.") }
            neighbors = answer; neighborsFailed = false
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failed: Exception) { neighborsFailed = true; throw failed }
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
            world = answer; mustReload = false; draft = null; destination = null; selectedPlacementId = null
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
            selectedPlacementId = null; draft = null; destination = null; visit = answer; tab = "neighbors"; reason = "offensive"; details = ""; requestCamera(code)
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
    val practicing = owner == null && practiceState != null && practiceFixture != null
    val practiceWritable = practicing && !busy && session.riskAccepted && owner == null
    val primaryLand = remember(owner, world, showcase, practicing) {
        if (owner == null) { if (practicing) LandPractice.land() else null }
        else world?.optJSONObject("land") ?: showcase?.optJSONObject("world")?.let { JSONObject().put("size", it.getInt("size")).put("core", it.optJSONObject("core")) }
    }
    val primaryPieces = remember(owner, world, showcase, practiceState, practiceCatalog) {
        if (owner == null) practiceState?.placements.orEmpty().mapNotNull { placement -> practiceCatalog[placement.itemId]?.let { footprint ->
            LandPiece(placement.uid, "", placement.itemId, placement.col, placement.row, placement.rotation, footprint.columns, footprint.rows)
        } } else world?.let { LandJson.pieces(it) } ?: showcase?.let { LandJson.pieces(it, public = true) }.orEmpty()
    }
    val sceneIslands = remember(world, showcase, neighbors, blocked, visit, practicing) {
        val ownCode = LandJson.string(world?.optJSONObject("share"), "code")
        buildList {
            if (world != null || practicing) showcase?.let { add(it) }
            LandJson.objects(neighbors?.optJSONArray("worlds")).filter {
                LandJson.shareCode(it.optString("code")) != null && it.optString("code") !in blocked && it.optString("code") != ownCode && it.optInt("size") in setOf(8, 10, 12, 16)
            }.forEach { add(JSONObject().put("world", it).put("catalog", neighbors?.optJSONArray("catalog"))) }
            visit?.takeIf { it.optJSONObject("world")?.optString("code") != ownCode &&
                (world != null || practicing || it.optJSONObject("world")?.optString("code") != "showcase-satoshi") &&
                it.optJSONObject("world")?.optString("code") !in blocked }?.let { add(it) }
        }.mapNotNull { snapshot -> snapshot.optJSONObject("world")?.let { publicWorld ->
            LandMapIsland(publicWorld.optString("code"), LandJson.string(publicWorld, "title") ?: t("Shared island", "Isla compartida"),
                JSONObject().put("size", publicWorld.getInt("size")).put("core", publicWorld.optJSONObject("core")), LandJson.pieces(snapshot, public = true), snapshot)
        } }.distinctBy { it.code }.take(LandArchipelago.slotCount)
    }
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
            LandButton(t("My island", "Mi isla"), !busy) { tab = "mine"; visit = null; requestCamera(null) }
            LandButton(t("Neighbors", "Vecinos"), !busy) { tab = "neighbors"; visit = null; requestCamera("overview"); if (neighbors == null) task { loadNeighbors() } }
        }
        if (busy) CircularProgressIndicator(Modifier.size(24.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        notice?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        if (!session.riskAccepted) Text(t("Accept the risk notice before opening Trader Land.", "Acepta el aviso de riesgo antes de abrir Trader Land."))
        primaryLand?.let { land ->
            if (owner != null && world == null) Text(t("Read-only app example", "Ejemplo de la app para explorar"), style = MaterialTheme.typography.labelMedium)
            TraderLandMap(land, primaryPieces, if (tab == "mine") draft else null, if (tab == "mine") destination else null, rotation,
                ((writable && world != null) || practiceWritable) && tab == "mine", session.language, t,
                tap = { x, y ->
                    if (tab == "mine" && ((writable && world != null) || practiceWritable)) {
                        if (draft != null) destination = x to y
                        else selectedPlacementId = landSelectionAt(land, primaryPieces, x, y,
                            canSelectCore = world?.optJSONObject("capabilities")?.optBoolean("moveCore") == true)?.id
                    }
                }, islands = sceneIslands, mapIdentity = "island-$epoch-${owner ?: "guest"}",
                onFocus = { island ->
                    if (island == null) { visit = null; tab = "mine" }
                    else { draft = null; destination = null; selectedPlacementId = null; visit = island.snapshot; tab = "neighbors"; reason = "offensive"; details = "" }
                }, onExplore = { draft = null; destination = null; selectedPlacementId = null; visit = null; tab = "neighbors"; if (neighbors == null && !busy && session.riskAccepted) task { loadNeighbors() } },
                navigationCode = navigationCode?.takeUnless { it == LandJson.string(world?.optJSONObject("share"), "code") }, navigationId = navigationId,
                revealRadius = if (practicing) practiceState?.let(LandPractice::revealRadius) else null,
                draftValid = if (practicing && draft != null && destination != null) LandPractice.canPlace(practiceState!!, draft!!.itemId, destination!!.first, destination!!.second, rotation,
                    if (draft!!.action == "move") draft!!.id else null, practiceCatalog) == null else null,
                showLots = neighbors != null && !neighborsFailed,
                selectedID = landSelectionById(land, primaryPieces, selectedPlacementId, world?.optJSONObject("capabilities")?.optBoolean("moveCore") == true)?.id.takeIf { tab == "mine" },
                ownTitle = if (practicing) LandPracticeCopy.text("practice_title", session.language) else title.takeIf(String::isNotBlank) ?: t("My island", "Mi isla"),
                onArchipelagoModeChanged = { active ->
                    if (active) {
                        draft = null; destination = null; selectedPlacementId = null; tab = "neighbors"
                        if (neighbors == null && !busy && session.riskAccepted) task { loadNeighbors() }
                    } else { visit = null; tab = "mine" }
                })
        }
        if (tab == "mine") {
            val selected = primaryLand?.let { landSelectionById(it, primaryPieces, selectedPlacementId,
                canSelectCore = world?.optJSONObject("capabilities")?.optBoolean("moveCore") == true) }
            if (selected != null && draft == null) {
                val item = if (practicing) LandJson.objects(practiceCatalogJson).firstOrNull { it.optString("id") == selected.itemId }
                    else world?.let { LandJson.catalogItem(it, selected.itemId) }
                LandSelectionBar(LandJson.name(item, session.language).ifBlank { if (selected.core) LandSelectionCopy.text("core", session.language) else selected.itemId.replace('_', ' ') }, selected.core,
                    enabled = if (selected.core) writable && world?.optJSONObject("capabilities")?.optBoolean("moveCore") == true
                        else practiceWritable || (writable && world?.optJSONObject("capabilities")?.optBoolean("move") == true),
                    t = t, language = session.language, dormant = primaryLand?.optJSONObject("core")?.optInt("stage", 1) == 0, onMove = {
                        if (repository.epoch.value == epoch && repository.session.value?.userId == owner && session.riskAccepted &&
                            (practiceWritable || (writable && world?.optJSONObject("capabilities")?.optBoolean(if (selected.core) "moveCore" else "move") == true))) {
                            draft = selected.moveDraft(); destination = selected.x to selected.y; rotation = selected.rotation
                        }
                    })
            }
            if (owner == null) {
                val localState = practiceState; val fixture = practiceFixture
                if (localState != null && fixture != null) LandPracticePanel(localState, fixture, practiceCatalog, draft, destination, rotation,
                    enabled = practiceWritable, language = session.language,
                    onItemName = { id -> LandJson.name(LandJson.objects(practiceCatalogJson).firstOrNull { it.optString("id") == id }, session.language) },
                    onDraftChosen = { chosen -> if (practiceWritable) { selectedPlacementId = null; draft = chosen; destination = null; rotation = 0 } },
                    onRotation = { turn -> if (practiceWritable) rotation = turn },
                    onCancel = { draft = null; destination = null },
                    onUpdate = { next ->
                        when (val result = practicePersistence.commit(AccountVersion(owner, epoch), localState, next, practiceCatalog, onCommitted = { practiceState = it })) {
                            is PracticePersistenceResult.Committed -> { selectedPlacementId = null; true }
                            else -> false
                        }
                    })
                else Text(LandPracticeCopy.text(if (practiceFailed) "error" else "loading", session.language))
                Text(t("Sign in to open your island. Public islands are available in Neighbors.", "Inicia sesión para abrir tu isla. Puedes ver las islas públicas en Vecinos."))
            }
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
                    if (caps?.optBoolean("moveCore") == true) LandButton(t("Move Aura Core", "Mover Núcleo de Aura"), writable) { selectedPlacementId = LAND_CORE_SELECTION_ID; draft = LandDraft("move_core", "", "aura_core", 2, 2); rotation = 0; destination = LandJson.core(land) }
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
                            LandDraftCancelButton(!busy, t, language = session.language) { draft = null; destination = null }
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
                                    selectedPlacementId = null; draft = LandDraft("place", id, entry.optString("item_id"), footprint.first, footprint.second); rotation = 0; destination = null
                                } else if (placement != null) {
                                    Text("${t("Placed", "Colocada")} · ${placement.x + 1}, ${placement.y + 1} · ${placement.rotation}°")
                                    if (caps?.optBoolean("move") == true) LandButton(t("Move piece", "Mover pieza"), writable) { selectedPlacementId = placement.placementId; draft = LandDraft("move", placement.placementId, placement.itemId, placement.width, placement.height); destination = placement.x to placement.y; rotation = placement.rotation }
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
                        code?.let { Text(it); LandButton(t("Open public link", "Abrir enlace público"), !busy) { onExternalUrl("https://bobbyprotocol.xyz/agentic-world/bobby/trader-land/w/$it") } }
                        LandButton(t("Make private", "Hacer privada"), writable) { mutate(JSONObject().put("action", "unpublish")) }
                    } else LandButton(t("Publish island", "Publicar isla"), writable) { helpOpen = false; publishRulesAccepted = false; publishConfirm = true }
                    Text(t("Publishing shares your island name and layout. Your account identity is not included in the public island.", "Publicar comparte el nombre y la distribución de tu isla. La isla pública no incluye la identidad de tu cuenta."), style = MaterialTheme.typography.bodySmall)
                }
            }
        } else {
            if (visiting != null) {
                LandButton(t("Back to neighbors", "Volver a vecinos"), !busy) { visit = null; requestCamera("overview") }
                Text(LandJson.string(visiting, "title") ?: t("Shared island", "Isla compartida"), style = MaterialTheme.typography.titleLarge)
                val isExample = visiting.optString("code") == "showcase-satoshi"
                Text(if (isExample) t("Read-only app example. These pieces do not belong to your inventory.", "Ejemplo de la app para explorar. Estas piezas no pertenecen a tu inventario.")
                    else t("You are visiting a public island. Changes stay with its builder.", "Estás visitando una isla pública. Los cambios pertenecen a su creador."))
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
                        LandButton(t("Visit", "Visitar"), !busy) { visit = example; reason = "offensive"; details = ""; requestCamera(if (world == null && !practicing) null else "showcase-satoshi") }
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

internal const val LAND_CORE_SELECTION_ID = "aura-core"

internal data class LandMapSelection(val id: String, val itemId: String, val x: Int, val y: Int,
    val width: Int, val height: Int, val rotation: Int, val core: Boolean = false) {
    fun moveDraft() = LandDraft(if (core) "move_core" else "move", if (core) "" else id, itemId, width, height)
}

internal fun landSelectionById(land: JSONObject, pieces: List<LandPiece>, id: String?, canSelectCore: Boolean): LandMapSelection? {
    if (id == null) return null
    if (id == LAND_CORE_SELECTION_ID && canSelectCore) {
        val core = LandJson.core(land)
        return LandMapSelection(id, "aura_core", core.first, core.second, 2, 2, 0, core = true)
    }
    return pieces.firstOrNull { it.placementId == id }?.let {
        LandMapSelection(it.placementId, it.itemId, it.x, it.y, it.width, it.height, it.rotation)
    }
}

internal fun landSelectionAt(land: JSONObject, pieces: List<LandPiece>, x: Int, y: Int, canSelectCore: Boolean): LandMapSelection? {
    if (x !in 0 until land.getInt("size") || y !in 0 until land.getInt("size")) return null
    val piece = pieces.firstOrNull { it.contains(x, y) }
    if (piece != null) return landSelectionById(land, pieces, piece.placementId, canSelectCore)
    val core = LandJson.core(land)
    return if (canSelectCore && x in core.first until core.first + 2 && y in core.second until core.second + 2)
        landSelectionById(land, pieces, LAND_CORE_SELECTION_ID, true) else null
}

internal object LandSelectionCopy {
    fun text(key: String, language: String): String {
        val index = listOf("en", "es", "fr", "pt", "it", "de").indexOf(language.lowercase(Locale.ROOT).substringBefore('-').substringBefore('_')).coerceAtLeast(0)
        return when (key) {
            "move" -> listOf("Move", "Mover", "Déplacer", "Mover", "Sposta", "Verschieben")
            "cancel" -> listOf("Cancel", "Cancelar", "Annuler", "Cancelar", "Annulla", "Abbrechen")
            "core" -> listOf("Aura Core", "Núcleo de Aura", "Noyau d’Aura", "Núcleo de Aura", "Nucleo di Aura", "Aura-Kern")
            "dormant" -> listOf("Dormant · wakes when 5 pieces stand", "Dormido · despierta con 5 piezas", "En sommeil · s’éveille avec 5 pièces", "Adormecido · desperta com 5 peças", "Dormiente · si risveglia con 5 pezzi", "Ruhend · erwacht mit 5 Teilen")
            "awake" -> listOf("Awake · the heart of your island", "Despierto · el corazón de tu isla", "Éveillé · le cœur de ton île", "Desperto · o coração da tua ilha", "Sveglio · il cuore della tua isola", "Wach · das Herz deiner Insel")
            else -> listOf("On your island", "En tu isla", "Sur ton île", "Na tua ilha", "Sulla tua isola", "Auf deiner Insel")
        }[index]
    }
}

@Composable internal fun LandSelectionBar(name: String, core: Boolean, enabled: Boolean,
    t: (String, String) -> String, onMove: () -> Unit, language: String = "en", dormant: Boolean = false) {
    Card(Modifier.fillMaxWidth().testTag("land-selection")) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(name, style = MaterialTheme.typography.titleMedium)
            Text(LandSelectionCopy.text(if (core) { if (dormant) "dormant" else "awake" } else "placed", language),
                style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("land-selection-detail"))
            OutlinedButton(onClick = onMove, enabled = enabled,
                modifier = Modifier.heightIn(min = 48.dp).testTag("land-build-or-move")) { Text(if (language in setOf("en", "es")) t("Move", "Mover") else LandSelectionCopy.text("move", language)) }
        }
    }
}

@Composable internal fun LandDraftCancelButton(enabled: Boolean, t: (String, String) -> String, language: String = "en", onCancel: () -> Unit) {
    OutlinedButton(onClick = onCancel, enabled = enabled,
        modifier = Modifier.heightIn(min = 48.dp).testTag("land-draft-cancel")) { Text(if (language in setOf("en", "es")) t("Cancel", "Cancelar") else LandSelectionCopy.text("cancel", language)) }
}

internal data class LandMapIsland(
    val code: String,
    val title: String,
    val land: JSONObject,
    val pieces: List<LandPiece>,
    val snapshot: JSONObject,
)

private fun landSceneSprites(land: JSONObject, pieces: List<LandPiece>, draft: LandDraft? = null, point: Pair<Int, Int>? = null, rotation: Int = 0, selectedID: String? = null): List<LandSceneSprite> {
    val geometry = TraderLandProjection(land.getInt("size"))
    val core = LandJson.core(land)
    val stage = if (land.optJSONObject("core")?.optInt("stage", 1) == 0) 0 else 1
    fun sprite(id: String, col: Int, row: Int, width: Int, height: Int, turn: Int, coreStage: Int? = null, lifted: Boolean = false, uid: String? = null): LandSceneSprite? {
        val area = LandJson.rotated(width, height, turn)
        if (!lifted && (turn !in setOf(0, 90, 180, 270) || col < 0 || row < 0 || col + area.first > geometry.size || row + area.second > geometry.size)) return null
        val asset = TraderLandSpriteCatalog.asset(id, coreStage ?: 1)
        val art = TraderLandSpriteCatalog.art[asset] ?: return null
        return LandSceneSprite(asset, geometry.sprite(col, row, width, height, turn, art, id == "aura_core" && coreStage == 0, path = traderLandPathAsset(asset)),
            art, LandSceneFootprint(col, row, area.first, area.second), coreStage, lifted, selected = selectedID != null && uid == selectedID)
    }
    return buildList {
        if (draft?.action != "move_core" || point == null) sprite("aura_core", core.first, core.second, 2, 2, 0, stage, uid = LAND_CORE_SELECTION_ID)?.let(::add)
        pieces.filterNot { draft?.action == "move" && point != null && it.placementId == draft.id }.forEach {
            sprite(it.itemId, it.x, it.y, it.width, it.height, it.rotation, uid = it.placementId)?.let(::add)
        }
        if (draft != null && point != null) sprite(draft.itemId, point.first, point.second, draft.width, draft.height, rotation,
            if (draft.action == "move_core") stage else null, lifted = true, uid = if (draft.action == "move_core") LAND_CORE_SELECTION_ID else draft.id)?.let(::add)
    }.sortedBy { if (it.lifted) Float.MAX_VALUE else it.frame.depth }
}

// These describe actual Canvas content and camera mode without adding interactive overlays.
internal val LandMapIslandLabels = SemanticsPropertyKey<List<String>>("LandMapIslandLabels")
internal val LandMapFreeLots = SemanticsPropertyKey<Int>("LandMapFreeLots")
internal val LandMapSelectedPlacement = SemanticsPropertyKey<String>("LandMapSelectedPlacement")
internal val LandMapArchipelagoMode = SemanticsPropertyKey<Boolean>("LandMapArchipelagoMode")

/** Shared production map; offline instrumentation supplies only public, bundled layouts. */
@Composable internal fun TraderLandMap(
    land: JSONObject,
    pieces: List<LandPiece>,
    draft: LandDraft?,
    point: Pair<Int, Int>?,
    rotation: Int,
    editable: Boolean,
    language: String,
    t: (String, String) -> String,
    tap: (Int, Int) -> Unit,
    islands: List<LandMapIsland> = emptyList(),
    mapIdentity: String = "island",
    onFocus: (LandMapIsland?) -> Unit = {},
    onExplore: () -> Unit = {},
    reduceMotion: Boolean = false,
    navigationCode: String? = null,
    navigationId: Int = 0,
    revealRadius: Float? = null,
    onCameraChanged: (TraderLandCamera) -> Unit = {},
    draftValid: Boolean? = null,
    showLots: Boolean = false,
    ownTitle: String = t("My island", "Mi isla"),
    onArchipelagoModeChanged: (Boolean) -> Unit = {},
    selectedID: String? = null,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val gridSize = land.getInt("size")
    val geometry = remember(gridSize) { TraderLandProjection(gridSize) }
    val sprites = remember(land, pieces, draft, point, rotation, selectedID) { landSceneSprites(land, pieces, draft, point, rotation, selectedID) }
    val publicSprites = remember(islands) { islands.map { landSceneSprites(it.land, it.pieces) } }
    val offsets = remember(islands) { islands.indices.map(LandArchipelago::offset) }
    val lots = remember(islands.size, showLots) { LandArchipelago.freeLots(islands.size, showLots) }
    val sceneOffsets = remember(offsets, showLots) { LandArchipelago.sceneOffsets(offsets, showLots) }
    val density = androidx.compose.ui.platform.LocalDensity.current
    val pixelUnit = density.density
    // Android editing controls sit below this Canvas; no iOS footer overlay consumes map height.
    val mapCardLift = 0f
    val labelSize = 11f * density.density * density.fontScale
    val freeLotLabel = when (language) {
        "es" -> "Lote libre"; "fr" -> "Terrain libre"; "pt" -> "Lote livre"
        "it" -> "Lotto libero"; "de" -> "Freies Grundstück"; else -> "Free lot"
    }
    val assets = remember(sprites, publicSprites) {
        (sprites.map { it.asset } + publicSprites.flatten().map { it.asset } + (sprites + publicSprites.flatten()).mapNotNull { TraderLandSpriteCatalog.glow(it.asset) } + listOf("core-body.png", "core-ring-back.png", "core-sphere.png", "core-ring-front.png", "core-glow.png", "core-dormant-glow.png")).distinct().sorted()
    }
    var images by remember(context) { mutableStateOf<Map<String, ImageBitmap>>(emptyMap()) }
    LaunchedEffect(context, assets) {
        images = withContext(Dispatchers.IO) {
            warmTraderLandShadows()
            assets.mapNotNull { asset ->
                val bitmap = landArtCache.get(asset) ?: runCatching {
                    context.assets.open("traderland/$asset").use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = if (asset in TraderLandSpriteCatalog.art || asset.endsWith("_bloom_glow.png")) 2 else 1 })?.asImageBitmap() }
                }.getOrNull()?.also { landArtCache.put(asset, it) }
                bitmap?.let { asset to it }
            }.toMap()
        }
    }
    fun systemReducedMotion() = android.provider.Settings.Global.getFloat(context.contentResolver, android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    var systemStill by remember(context) { mutableStateOf(systemReducedMotion()) }
    androidx.compose.runtime.DisposableEffect(context, lifecycleOwner) {
        val observer = object : android.database.ContentObserver(android.os.Handler(android.os.Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { systemStill = systemReducedMotion() }
        }
        val listener = androidx.lifecycle.LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) systemStill = systemReducedMotion() }
        context.contentResolver.registerContentObserver(android.provider.Settings.Global.getUriFor(android.provider.Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        lifecycleOwner.lifecycle.addObserver(listener)
        onDispose { context.contentResolver.unregisterContentObserver(observer); lifecycleOwner.lifecycle.removeObserver(listener) }
    }
    val still = reduceMotion || systemStill
    val phase = remember { androidx.compose.runtime.mutableFloatStateOf(0f) }
    LaunchedEffect(still, lifecycleOwner) {
        if (!still) lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            var first = 0L
            while (kotlinx.coroutines.currentCoroutineContext().isActive) androidx.compose.animation.core.withInfiniteAnimationFrameNanos { now ->
                if (first == 0L) first = now
                phase.floatValue = ((now - first) / 1_000_000_000.0 % 56).toFloat()
            }
        }
    }
    var viewport by remember { mutableStateOf(IntSize.Zero) }
    var zoom by remember(mapIdentity) { mutableStateOf(geometry.homeZoom) }
    var pan by remember(mapIdentity) { mutableStateOf(Offset.Zero) }
    var focusedCode by remember(mapIdentity) { mutableStateOf<String?>(null) }
    val focused = islands.indexOfFirst { it.code == focusedCode }.takeIf { it >= 0 }
    val camera = TraderLandCamera(viewport.width.toFloat(), viewport.height.toFloat(), zoom, pan.x, pan.y, gridSize)
    val archipelagoMode = zoom < LandArchipelago.overviewThreshold || focused != null
    val currentModeChanged by rememberUpdatedState(onArchipelagoModeChanged)
    var previousArchipelagoMode by remember(mapIdentity) { mutableStateOf(archipelagoMode) }
    LaunchedEffect(archipelagoMode, mapIdentity) {
        // Initial home is not a return: the host may already have resolved a shared-link island.
        if (previousArchipelagoMode != archipelagoMode) {
            previousArchipelagoMode = archipelagoMode
            currentModeChanged(archipelagoMode)
        }
    }
    val visibleTitles = if (zoom < LandArchipelago.overviewThreshold) {
        (listOf(ownTitle to LandPoint(0f, 0f)) + islands.mapIndexed { index, island -> island.title to offsets[index] }).filter { (_, offset) ->
            val point = camera.project(LandPoint(offset.x + 430f, offset.y + LandArchipelago.labelWorldY))
            point.x >= -24 * pixelUnit && point.x <= camera.width + 24 * pixelUnit &&
                point.y >= -24 * pixelUnit && point.y <= camera.height + 24 * pixelUnit
        }.map { (title, _) -> LandArchipelago.shortTitle(title) }
    } else emptyList()
    androidx.compose.runtime.SideEffect { onCameraChanged(camera) }
    val currentCamera by rememberUpdatedState(camera)
    val currentTap by rememberUpdatedState(tap)
    val currentDraft by rememberUpdatedState(draft)
    val currentPoint by rememberUpdatedState(point)
    val currentEditable by rememberUpdatedState(editable)
    val currentRotation by rememberUpdatedState(rotation)
    val currentIslands by rememberUpdatedState(islands)
    val currentOffsets by rememberUpdatedState(offsets)
    val currentSceneOffsets by rememberUpdatedState(sceneOffsets)
    val currentFocus by rememberUpdatedState(onFocus)
    val scope = rememberCoroutineScope()
    var flight by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    var previousHomeZoom by remember(mapIdentity) { mutableStateOf(geometry.homeZoom) }
    LaunchedEffect(mapIdentity, gridSize) {
        // Canonical adoptLand: growth follows Home only while the own camera is resting there.
        val atHome = zoom == previousHomeZoom && pan == Offset.Zero && focusedCode == null
        previousHomeZoom = geometry.homeZoom
        if (atHome && zoom != geometry.homeZoom) { flight?.cancel(); zoom = geometry.homeZoom }
    }
    fun focus(index: Int?, force: Boolean = false) {
        val code = index?.let { currentIslands.getOrNull(it)?.code }
        if (focusedCode != code || force) { focusedCode = code; currentFocus(index?.let { currentIslands.getOrNull(it) }) }
    }
    fun applyCamera(next: TraderLandCamera) {
        val nextFocus = if (next.zoom > .75f) LandArchipelago.nearestIsland(LandPoint(next.panX, next.panY), next, currentOffsets, screenUnit = pixelUnit, lift = mapCardLift) else null
        if (next.zoom > .75f) focus(nextFocus)
        val bounded = LandArchipelago.clampPan(LandPoint(next.panX, next.panY), next, currentSceneOffsets, gridSize, if (next.zoom > .75f) nextFocus else null, screenUnit = pixelUnit, lift = mapCardLift)
        zoom = next.zoom; pan = Offset(bounded.x, bounded.y)
    }
    fun fly(targetZoom: Float, targetPan: LandPoint, index: Int?, forceFocus: Boolean = false) {
        flight?.cancel(); focus(index, forceFocus)
        val fromZoom = zoom; val fromPan = pan
        flight = scope.launch {
            if (still) { zoom = targetZoom; pan = Offset(targetPan.x, targetPan.y) }
            else androidx.compose.animation.core.animate(0f, 1f, animationSpec = androidx.compose.animation.core.tween(600,
                easing = androidx.compose.animation.core.FastOutSlowInEasing)) { amount, _ ->
                zoom = fromZoom + (targetZoom - fromZoom) * amount
                pan = Offset(fromPan.x + (targetPan.x - fromPan.x) * amount, fromPan.y + (targetPan.y - fromPan.y) * amount)
            }
        }
    }
    fun goHome() = fly(geometry.homeZoom, LandPoint(0f, 0f), null, forceFocus = true)
    fun visit(index: Int) {
        val target = currentCamera.copy(zoom = .9f)
        fly(.9f, LandArchipelago.targetPan(currentOffsets[index], target, screenUnit = pixelUnit, lift = mapCardLift), index)
    }
    fun overview() {
        val current = currentCamera
        val targetZoom = LandArchipelago.overviewZoom(viewport.width.toFloat(), viewport.height.toFloat(), current.fit, screenUnit = pixelUnit, lift = mapCardLift)
        val target = current.copy(zoom = targetZoom)
        fly(targetZoom, LandArchipelago.targetPan(LandPoint(0f, LandArchipelago.ringOneBounds.centerY), target, screenUnit = pixelUnit, lift = mapCardLift), null)
        onExplore()
    }
    androidx.compose.runtime.DisposableEffect(mapIdentity, gridSize) { onDispose { flight?.cancel() } }
    var handledNavigation by remember(mapIdentity) { mutableIntStateOf(-1) }
    LaunchedEffect(mapIdentity, gridSize, navigationId, islands.map { it.code }, viewport) {
        if (viewport == IntSize.Zero) return@LaunchedEffect
        if (navigationId > 0 && handledNavigation != navigationId) {
            when (navigationCode) {
                null -> { goHome(); handledNavigation = navigationId }
                "overview" -> { overview(); handledNavigation = navigationId }
                else -> islands.indexOfFirst { it.code == navigationCode }.takeIf { it >= 0 }?.let { visit(it); handledNavigation = navigationId }
            }
        } else if (focusedCode != null) {
            val index = islands.indexOfFirst { it.code == focusedCode }
            if (index < 0) goHome()
            else if (zoom > .75f) visit(index)
        }
    }
    val labels = when (language) {
        "es" -> listOf("Isla isométrica", "Alejar", "Acercar", "Volver a mi isla", "Archipiélago", "Anterior", "Siguiente", "Arrastra para mover la pieza")
        "fr" -> listOf("Île isométrique", "Zoom arrière", "Zoom avant", "Revenir à mon île", "Archipel", "Précédente", "Suivante", "Fais glisser pour déplacer la pièce")
        "pt" -> listOf("Ilha isométrica", "Afastar", "Aproximar", "Voltar à minha ilha", "Arquipélago", "Anterior", "Seguinte", "Arrasta para mover a peça")
        "it" -> listOf("Isola isometrica", "Riduci zoom", "Aumenta zoom", "Torna alla mia isola", "Arcipelago", "Precedente", "Successiva", "Trascina per spostare il pezzo")
        "de" -> listOf("Isometrische Insel", "Verkleinern", "Vergrößern", "Zurück zu meiner Insel", "Archipel", "Vorherige", "Nächste", "Ziehe, um das Teil zu bewegen")
        else -> listOf("Isometric island", "Zoom out", "Zoom in", "Back to my island", "Archipelago", "Previous", "Next", "Drag to move the piece")
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.fillMaxWidth().aspectRatio(830f / 820f).clip(RoundedCornerShape(20.dp)).background(Color(0xFF050609))) {
            Canvas(Modifier.fillMaxSize().clipToBounds().testTag("land-map").onSizeChanged { viewport = it }
                .semantics {
                    contentDescription = "${labels[0]} · $gridSize × $gridSize · ${pieces.size}"
                    stateDescription = if (assets.all { it in images }) "art-ready" else "art-loading"
                    this[LandMapIslandLabels] = visibleTitles
                    this[LandMapFreeLots] = if (zoom <= LandArchipelago.seaZoom || focused != null) lots.size else 0
                    this[LandMapArchipelagoMode] = archipelagoMode
                    this[LandMapSelectedPlacement] = if (focused == null && sprites.any { it.selected }) selectedID.orEmpty() else ""
                    if (editable && focused == null && zoom >= .6f) customActions = (0 until gridSize).flatMap { y -> (0 until gridSize).map { x ->
                        CustomAccessibilityAction("${t("Cell", "Celda")} ${x + 1}, ${y + 1}") { currentTap(x, y); true }
                    } }
                }
                .pointerInput(mapIdentity, gridSize, viewport) {
                    // One gesture owner: a separate tap detector consumes a second finger's
                    // down event before the transform detector can establish its pinch.
                    awaitEachGesture {
                        val first = awaitFirstDown(requireUnconsumed = false)
                        flight?.cancel()
                        val start = currentCamera
                        val startWorld = start.unproject(LandPoint(first.position.x, first.position.y))
                        val startCell = geometry.cellAt(startWorld.x, startWorld.y)
                        val chosen = currentDraft; val origin = currentPoint
                        val area = chosen?.let { LandJson.rotated(it.width, it.height, currentRotation) }
                        val moving = currentEditable && focusedCode == null && start.zoom >= LandArchipelago.overviewThreshold && chosen != null && origin != null && area != null && startCell != null &&
                            startCell.first in origin.first until origin.first + area.first && startCell.second in origin.second until origin.second + area.second
                        var total = Offset.Zero; var totalZoom = 1f; var active = false
                        var hadMultipleFingers = false; var canceled = false; var tapPoint = first.position
                        do {
                            val event = awaitPointerEvent()
                            if (event.changes.any { it.isConsumed }) { canceled = true; break }
                            if (event.changes.count { it.pressed } > 1) hadMultipleFingers = true
                            event.changes.firstOrNull { it.id == first.id }?.let { tapPoint = it.position }
                            val delta = event.calculatePan(); val factor = event.calculateZoom()
                            total += delta; totalZoom *= factor
                            if (!active && (total.getDistance() > viewConfiguration.touchSlop || kotlin.math.abs(1f - totalZoom) * viewport.width > viewConfiguration.touchSlop)) active = true
                            if (active) {
                                if (moving && !hadMultipleFingers && currentEditable && event.changes.count { it.pressed } == 1 && kotlin.math.abs(totalZoom - 1f) < .02f) {
                                    val cell = geometry.draggedPosition(origin.first, origin.second, LandPoint(total.x, total.y), start.scale)
                                    currentTap(cell.first, cell.second)
                                } else if (factor.isFinite() && factor > 0f) {
                                    val center = event.calculateCentroid(useCurrent = false)
                                    val next = currentCamera.copy(zoom = zoom, panX = pan.x, panY = pan.y).anchoredTransform(LandPoint(center.x, center.y), LandPoint(delta.x, delta.y), factor,
                                        minZoom = if (currentDraft == null) .22f else .7f, maxZoom = geometry.maxZoom, boundPan = false)
                                    applyCamera(next)
                                }
                                event.changes.forEach { it.consume() }
                            } else if (!event.changes.any { it.pressed }) {
                                event.changes.forEach { it.consume() }
                            }
                        } while (event.changes.any { it.pressed })
                        if (!active && !hadMultipleFingers && !canceled) {
                            val current = currentCamera
                            if (current.scale > 0) {
                                val worldPoint = current.unproject(LandPoint(tapPoint.x, tapPoint.y))
                                val island = LandArchipelago.islandAt(worldPoint, currentOffsets)
                                if (island != null && island >= 0 && (current.zoom <= .75f || focusedCode != null) && focusedCode != currentIslands[island].code) visit(island)
                                else if (island == -1 && (focusedCode != null || current.zoom < .6f)) goHome()
                                else if (island == -1 && currentEditable && focusedCode == null) geometry.cellAt(worldPoint.x, worldPoint.y)?.let { currentTap(it.first, it.second) }
                            }
                        }
                    }
                }) {
                val layers = listOf("core-body.png", "core-ring-back.png", "core-sphere.png", "core-ring-front.png", "core-glow.png").map { images[it] }
                val coreLayers = if (layers.all { it != null }) LandCoreImages(layers[0]!!, layers[1]!!, layers[2]!!, layers[3]!!, layers[4]!!) else null
                withTransform({ translate(camera.x, camera.y); scale(camera.scale, camera.scale, Offset.Zero) }) {
                    val seaAlpha = if (focused != null) 1f else ((.75f - zoom) / .05f).coerceIn(0f, 1f)
                    fun paintIsland(islandLand: JSONObject, scene: List<LandSceneSprite>, offset: LandPoint, alpha: Float, own: Boolean, visiting: Boolean = false) {
                        if (alpha <= 0f) return
                        val center = camera.project(LandPoint(offset.x + 430f, offset.y + 335f))
                        if (center.x + 460f * camera.scale < 0 || center.x - 460f * camera.scale > size.width || center.y + 440f * camera.scale < 0 || center.y - 440f * camera.scale > size.height) return
                        val projection = TraderLandProjection(islandLand.getInt("size"))
                        withTransform({ translate(offset.x, offset.y) }) {
                            if (alpha < 1f) drawIntoCanvas { it.saveLayer(Rect(-400f, -400f, 1260f, 1100f), Paint().apply { this.alpha = alpha }) }
                            val occupied = scene.filterNot { it.lifted }.map { it.footprint }
                            drawTraderLandGround(projection, occupied, revealRadius = if (own) revealRadius else null, placing = own && draft != null,
                                visited = visiting, ambient = own, publicIsland = !own, selected = scene.firstOrNull { it.selected && !it.lifted }?.footprint)
                            if (own && draft != null && point != null) {
                                val area = LandJson.rotated(draft.width, draft.height, rotation)
                                drawTraderLandDraft(projection, LandSceneFootprint(point.first, point.second, area.first, area.second), draftValid ?: LandJson.fits(land, pieces, draft, point.first, point.second, rotation))
                            }
                            val pathCells = scene.filter { traderLandPathAsset(it.asset) }.map { it.footprint.col to it.footprint.row }.toSet()
                            scene.forEach { sprite ->
                                drawTraderLandSprite(sprite, images[sprite.asset], projection.unit,
                                    glow = when (sprite.coreStage) { 0 -> images["core-dormant-glow.png"]; 1 -> images["core-glow.png"]; else -> TraderLandSpriteCatalog.glow(sprite.asset)?.let { images[it] } },
                                    coreLayers = if (own) coreLayers else null, phaseSeconds = phase.floatValue, reducedMotion = still || !own, seed = own && revealRadius != null && !sprite.lifted && sprite.coreStage == null &&
                                        (0 until sprite.footprint.columns).any { dx -> (0 until sprite.footprint.rows).any { dy -> kotlin.math.max(kotlin.math.abs(sprite.footprint.col + dx - 3.5f), kotlin.math.abs(sprite.footprint.row + dy - 3.5f)) > revealRadius } })
                                if ((sprite.footprint.col to sprite.footprint.row) in pathCells) drawTraderLandFilament(sprite, pathCells, projection.unit)
                            }
                            if (alpha < 1f) drawIntoCanvas { it.restore() }
                        }
                    }
                    islands.forEachIndexed { index, island -> paintIsland(island.land, publicSprites[index], offsets[index], seaAlpha, false, visiting = focused == index) }
                    paintIsland(land, sprites, LandPoint(0f, 0f), 1f, true)
                }
                val seaAlpha = if (focused != null) 1f else ((.75f - zoom) / .05f).coerceIn(0f, 1f)
                if (seaAlpha > .01f) {
                    // Lot outlines and type stay at screen size while the real island camera scales.
                    lots.forEach { offset ->
                        val path = Path().apply {
                            TraderLandProjection.slab.forEachIndexed { index, point ->
                                val screen = camera.project(LandPoint(point.x + offset.x, point.y + offset.y))
                                if (index == 0) moveTo(screen.x, screen.y) else lineTo(screen.x, screen.y)
                            }
                            close()
                        }
                        drawPath(path, Color.White.copy(alpha = .012f * seaAlpha))
                        drawPath(path, Color.White.copy(alpha = .16f * seaAlpha), style = Stroke(pixelUnit,
                            pathEffect = PathEffect.dashPathEffect(floatArrayOf(5f * pixelUnit, 5f * pixelUnit))))
                        val center = camera.project(LandPoint(offset.x + 430f, offset.y + 391f))
                        drawIntoCanvas { canvas ->
                            val ink = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                                color = android.graphics.Color.rgb(163, 156, 145); alpha = (255 * seaAlpha).roundToInt()
                                textSize = labelSize; typeface = android.graphics.Typeface.MONOSPACE; textAlign = android.graphics.Paint.Align.CENTER
                            }
                            canvas.nativeCanvas.drawText(freeLotLabel, center.x, center.y - (ink.ascent() + ink.descent()) / 2f, ink)
                        }
                    }
                    if (zoom < LandArchipelago.overviewThreshold) {
                        fun title(text: String, offset: LandPoint, own: Boolean, visiting: Boolean = false) {
                            val point = camera.project(LandPoint(offset.x + 430f, offset.y + LandArchipelago.labelWorldY))
                            if (point.x < -24 * pixelUnit || point.x > size.width + 24 * pixelUnit || point.y < -24 * pixelUnit || point.y > size.height + 24 * pixelUnit) return
                            val short = LandArchipelago.shortTitle(text)
                            drawIntoCanvas { canvas ->
                                val ink = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                                    color = if (visiting) android.graphics.Color.rgb(250, 199, 46) else if (own) android.graphics.Color.rgb(242, 237, 228) else android.graphics.Color.rgb(163, 156, 145)
                                    alpha = (255 * seaAlpha).roundToInt(); textSize = labelSize
                                    typeface = if (own) android.graphics.Typeface.DEFAULT_BOLD else android.graphics.Typeface.DEFAULT
                                    textAlign = android.graphics.Paint.Align.CENTER
                                }
                                val height = ink.descent() - ink.ascent()
                                val width = ink.measureText(short)
                                val plate = android.graphics.RectF(point.x - width / 2f - 8 * pixelUnit, point.y,
                                    point.x + width / 2f + 8 * pixelUnit, point.y + height + 6 * pixelUnit)
                                val background = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
                                    color = android.graphics.Color.rgb(4, 3, 6); alpha = (255 * .78f * seaAlpha).roundToInt()
                                }
                                canvas.nativeCanvas.drawRoundRect(plate, plate.height() / 2f, plate.height() / 2f, background)
                                canvas.nativeCanvas.drawText(short, point.x, point.y + 3 * pixelUnit - ink.ascent(), ink)
                            }
                        }
                        title(ownTitle, LandPoint(0f, 0f), own = true)
                        islands.forEachIndexed { index, island -> title(island.title, offsets[index], own = false, visiting = focused == index) }
                    }
                }
            }
            if (draft != null && point != null && editable && focused == null && zoom >= .6f) {
                val area = LandJson.rotated(draft.width, draft.height, rotation)
                val bottom = geometry.iso((point.first + area.first - 1).toFloat(), (point.second + area.second - 1).toFloat())
                val handle = camera.project(bottom.copy(y = bottom.y + geometry.tileH / 2f))
                val density = androidx.compose.ui.platform.LocalDensity.current.density
                Box(Modifier.offset { IntOffset((handle.x - 22 * density).roundToInt(), (handle.y + 12 * density).roundToInt()) }
                    .size(44.dp).background(Color(0xFF9576D6), androidx.compose.foundation.shape.CircleShape)
                    .testTag("land-move-handle").semantics { contentDescription = labels[7] }
                    .pointerInput(mapIdentity, draft.id, gridSize) {
                        var origin: Pair<Int, Int>? = null; var delta = Offset.Zero; var startScale = 1f
                        detectDragGestures(onDragStart = { origin = currentPoint; delta = Offset.Zero; startScale = currentCamera.scale },
                            onDragEnd = { origin = null }, onDragCancel = { origin = null }) { change, amount ->
                            change.consume(); delta += amount
                            if (currentEditable) origin?.let { val cell = geometry.draggedPosition(it.first, it.second, LandPoint(delta.x, delta.y), startScale); currentTap(cell.first, cell.second) }
                        }
                    }, contentAlignment = Alignment.Center) { Text("✥", color = Color.White, style = MaterialTheme.typography.titleLarge) }
            }
            if (focused != null) Card(Modifier.align(Alignment.BottomCenter).padding(12.dp).testTag("land-focused-island")) {
                Text(islands[focused].title, Modifier.padding(12.dp), style = MaterialTheme.typography.titleMedium)
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { flight?.cancel(); applyCamera(camera.anchoredTransform(LandPoint(viewport.width / 2f, viewport.height / 2f), LandPoint(0f, 0f), 1f / 1.3f, if (draft == null) .22f else .7f, geometry.maxZoom, false)) }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = labels[1] }) { Text("−") }
            Text("${(zoom * 100).roundToInt()}%", modifier = Modifier.testTag("land-zoom"))
            TextButton(onClick = { flight?.cancel(); applyCamera(camera.anchoredTransform(LandPoint(viewport.width / 2f, viewport.height / 2f), LandPoint(0f, 0f), 1.3f, if (draft == null) .22f else .7f, geometry.maxZoom, false)) }, modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = labels[2] }) { Text("+") }
            TextButton(onClick = { goHome() }, modifier = Modifier.heightIn(min = 48.dp).testTag("land-home").semantics { contentDescription = labels[3] }) { Text("⌂") }
            TextButton(onClick = { if (archipelagoMode) goHome() else overview() }, modifier = Modifier.heightIn(min = 48.dp).testTag("land-archipelago").semantics { contentDescription = labels[4] }) { Text("◈") }
        }
        if (islands.isNotEmpty() && (zoom < .6f || focused != null)) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(onClick = { visit(((focused ?: 0) - 1 + islands.size) % islands.size) }, modifier = Modifier.heightIn(min = 48.dp).testTag("land-previous")) { Text(labels[5]) }
            TextButton(onClick = { visit(((focused ?: -1) + 1) % islands.size) }, modifier = Modifier.heightIn(min = 48.dp).testTag("land-next")) { Text(labels[6]) }
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
            runCatching { context.assets.open("traderland/$asset").use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = if (asset in TraderLandSpriteCatalog.art || asset.endsWith("_bloom_glow.png")) 2 else 1 })?.asImageBitmap() } }.getOrNull()?.also { landArtCache.put(asset, it) }
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
