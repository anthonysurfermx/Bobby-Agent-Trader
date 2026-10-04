package xyz.bobbyprotocol.android.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.data.*
import java.util.UUID

/** Mounted with an account/epoch key; all review text and callbacks disappear on account changes. */
@Composable
internal fun FinancialContextContent(repository: BobbyRepository, owner: String, epoch: Long,
    t: (String, String) -> String, onShare: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var state by remember(owner, epoch) { mutableStateOf<JSONObject?>(null) }
    var connection by remember(owner, epoch) { mutableStateOf<FinancialChatGPTConnection?>(null) }
    var connectionError by remember(owner, epoch) { mutableStateOf<String?>(null) }
    var busy by remember(owner, epoch) { mutableStateOf(false) }
    var error by remember(owner, epoch) { mutableStateOf<String?>(null) }
    var input by remember(owner, epoch) { mutableStateOf("") }
    var review by remember(owner, epoch) { mutableStateOf<List<FinancialContextEdit>>(emptyList()) }
    var consent by remember(owner, epoch) { mutableStateOf(false) }
    var draftId by remember(owner, epoch) { mutableStateOf<String?>(null) }
    var editingId by remember(owner, epoch) { mutableStateOf<String?>(null) }
    var requestId by remember(owner, epoch) { mutableStateOf(UUID.randomUUID().toString()) }
    var deleteAll by remember(owner, epoch) { mutableStateOf(false) }
    var copied by remember(owner, epoch) { mutableStateOf(false) }
    fun current() = repository.session.value?.userId == owner && repository.epoch.value == epoch
    fun copy(text: String) {
        if (!current()) return
        (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Bobby", text))
    }
    suspend fun call(method: String = "GET", body: JSONObject? = null, query: String = ""): Boolean {
        if (busy || !current()) return false
        busy = true; error = null
        try {
            val result = repository.financialContext(owner, epoch, method, body, query)
            if (!current()) return false
            state = result
            return true
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) {
            if (current()) error = FinancialContextPolicy.errorMessage(failure, t)
            return false
        } finally { if (current()) busy = false }
    }
    suspend fun loadConnection(revoke: Boolean = false): Boolean {
        if (busy || !current()) return false
        busy = true; connectionError = null
        try {
            val result = repository.financialChatGPTConnection(owner, epoch, revoke)
            if (!current()) return false
            connection = result
            return true
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: Exception) {
            if (current()) connectionError = FinancialContextPolicy.errorMessage(failure, t)
            return false
        } finally { if (current()) busy = false }
    }
    fun startReview(items: List<FinancialContextItem>, draft: String? = null, edit: String? = null) {
        if (!current()) return
        review = items.map { FinancialContextEdit(it) }; draftId = draft; editingId = edit; consent = false; requestId = UUID.randomUUID().toString()
    }
    fun cancelReview() { review = emptyList(); consent = false; draftId = null; editingId = null }
    val invalid = t("Use Bobby JSON with 1–20 facts, one-line summaries up to 240 characters, and valid amounts, currencies and dates. Remove credentials and account/card numbers.", "Usa JSON de Bobby con 1–20 datos, resúmenes de una línea de hasta 240 caracteres e importes, monedas y fechas válidos. Elimina credenciales y números de cuentas o tarjetas.")
    LaunchedEffect(owner, epoch) { call(); loadConnection() }
    Column(Modifier.fillMaxWidth().testTag("financial-context"), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(t("Share only the financial facts you choose. Bobby cannot read your full ChatGPT history. Reported facts are dated and unverified; they are not verified bank movements or a suitability assessment.", "Comparte solo los datos financieros que elijas. Bobby no puede leer todo tu historial de ChatGPT. Los datos son declarados, fechados y no verificados; no son movimientos bancarios verificados ni una evaluación de idoneidad."))
        if (busy) CircularProgressIndicator(Modifier.size(24.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Text(t("ChatGPT connection", "Conexión con ChatGPT"), style = MaterialTheme.typography.titleMedium)
        connection?.let { connected ->
            Text(if (connected.connected) t("ChatGPT connected", "ChatGPT conectado") else t("ChatGPT is not connected", "ChatGPT no está conectado"), modifier = Modifier.testTag("financial-context-connection-status"))
            if (!connected.available) Text(t("The connector is currently unavailable. Existing connections can still be disconnected.", "El conector no está disponible por ahora. Puedes desconectar las conexiones existentes."), style = MaterialTheme.typography.bodySmall)
            if (connected.connected) {
                if ("bobby.context.read" in connected.scopes) Text(t("Permission to read your approved facts and saved recommendations.", "Permiso para leer tus datos aprobados y recomendaciones guardadas."), style = MaterialTheme.typography.bodySmall)
                if ("bobby.context.write" in connected.scopes) Text(t("Permission to prepare drafts for your review.", "Permiso para preparar borradores para que los revises."), style = MaterialTheme.typography.bodySmall)
                TextButton(onClick = { scope.launch { loadConnection(revoke = true) } }, enabled = !busy, modifier = Modifier.testTag("financial-context-disconnect")) {
                    Text(t("Disconnect ChatGPT", "Desconectar ChatGPT"), color = MaterialTheme.colorScheme.error)
                }
                Text(t("Disconnecting removes ChatGPT's access. Your saved facts remain until you delete them in Bobby.", "Al desconectar se elimina el acceso de ChatGPT. Tus datos guardados permanecen hasta que los borres en Bobby."), style = MaterialTheme.typography.bodySmall)
            }
        }
        TextButton(onClick = { scope.launch { loadConnection() } }, enabled = !busy, modifier = Modifier.testTag("financial-context-refresh-connection")) { Text(t("Refresh connection", "Actualizar conexión")) }
        connectionError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (state == null) OutlinedButton(onClick = { scope.launch { call() } }, enabled = !busy) { Text(t("Retry", "Reintentar")) }
        state?.let { snapshot ->
            val enabled = snapshot.getBoolean("enabled")
            val financialEnabled = snapshot.getBoolean("financialMemoryEnabled")
            val accountEnabled = snapshot.getBoolean("accountMemoryEnabled")
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(t("Use financial context", "Usar contexto financiero"), Modifier.weight(1f))
                Switch(financialEnabled, { value -> scope.launch { call("PATCH", JSONObject().put("enabled", value)) } }, enabled = !busy, modifier = Modifier.testTag("financial-context-enabled"))
            }
            Text(t("Enable this to remember facts you approve and newly delivered recommendations. It stays paused while account memory is paused.", "Actívalo para recordar los datos que apruebes y las recomendaciones nuevas. Se mantiene en pausa si la memoria de la cuenta está en pausa."), style = MaterialTheme.typography.bodySmall)
            if (!accountEnabled) Text(t("Account memory is paused. Resume it in Profile → Memory to use financial context. You can still turn financial context off here.", "La memoria de la cuenta está en pausa. Reanúdala en Perfil → Memoria para usar el contexto financiero. Puedes desactivar el contexto financiero aquí."), style = MaterialTheme.typography.bodySmall)
            Text(if (enabled) t("Shared across iOS, Android and web on this Bobby account.", "Compartido entre iOS, Android y web en esta cuenta de Bobby.")
                else t("Paused: no fact imports or ChatGPT sharing, and new recommendations are not saved.", "En pausa: no se importan ni comparten datos con ChatGPT y no se guardan recomendaciones nuevas."), style = MaterialTheme.typography.bodySmall)
            OutlinedButton(onClick = { copy(FinancialContextPolicy.exportPrompt); copied = true }, modifier = Modifier.testTag("financial-context-copy-prompt")) {
                Text(if (copied) t("Prompt copied", "Instrucción copiada") else t("1. Copy prompt for ChatGPT", "1. Copiar instrucción para ChatGPT"))
            }
            Text(t("Choose the facts in ChatGPT, then paste its JSON. Full chats, names, credentials and account/card numbers are never needed.", "Elige los datos en ChatGPT y pega su JSON. Nunca hacen falta chats completos, nombres, credenciales ni números de cuentas o tarjetas."), style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(input, { input = it }, label = { Text(t("Bobby JSON from ChatGPT", "JSON de Bobby desde ChatGPT")) }, minLines = 4, maxLines = 8, enabled = !busy,
                modifier = Modifier.fillMaxWidth().testTag("financial-context-json"))
            Button(onClick = {
                try { startReview(FinancialContextPolicy.parseImport(input)); input = ""; error = null }
                catch (_: Exception) { error = invalid }
            }, enabled = enabled && !busy, modifier = Modifier.testTag("financial-context-review")) { Text(t("2. Review pasted facts", "2. Revisar los datos pegados")) }
            if (review.isNotEmpty()) {
                Text(t("Review each fact", "Revisa cada dato"), style = MaterialTheme.typography.titleMedium)
                review.forEachIndexed { index, row ->
                    FinancialContextEditRow(row, t, !busy) { changed ->
                        review = review.mapIndexed { i, old -> if (i == index) changed else old }; consent = false; requestId = UUID.randomUUID().toString()
                    }
                }
                Row(Modifier.fillMaxWidth()) {
                    Checkbox(consent, { consent = it }, enabled = !busy, modifier = Modifier.testTag("financial-context-consent"))
                    Text(t("I approve these selected facts being saved to my Bobby account and shared when I ask the connected ChatGPT integration.", "Autorizo guardar estos datos seleccionados en mi cuenta de Bobby y compartirlos cuando lo solicite en la integración conectada de ChatGPT."), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                }
                Button(onClick = {
                    try {
                        val chosen = review.filter { it.selected }.map { it.item() }
                        require(chosen.isNotEmpty())
                        val edit = editingId
                        val body = if (edit == null) FinancialContextPolicy.importBody(chosen, consent, requestId, draftId)
                            else JSONObject().put("id", FinancialContextPolicy.uuid(edit)).put("item", chosen.first().json()).put("consent", consent)
                        scope.launch { if (call(if (edit == null) "POST" else "PATCH", body)) cancelReview() }
                    } catch (_: Exception) { error = invalid }
                }, enabled = enabled && !busy && consent && review.any { it.selected }, modifier = Modifier.testTag("financial-context-save")) { Text(t("3. Save approved facts", "3. Guardar los datos aprobados")) }
                TextButton(onClick = { cancelReview() }, enabled = !busy) { Text(t("Cancel review", "Cancelar revisión")) }
            }
            val drafts = snapshot.getJSONArray("drafts")
            if (drafts.length() > 0) Text(t("Pending from ChatGPT", "Pendientes desde ChatGPT"), style = MaterialTheme.typography.titleMedium)
            for (i in 0 until drafts.length()) {
                val draft = drafts.getJSONObject(i)
                Text("${draft.getJSONArray("items").length()} " + t("facts · expires ", "datos · caduca ") + draft.getString("expiresAt"), style = MaterialTheme.typography.bodySmall)
                Row {
                    TextButton(onClick = {
                        try { startReview(FinancialContextPolicy.parseItems(draft.getJSONArray("items")), FinancialContextPolicy.uuid(draft.getString("id"))) }
                        catch (_: Exception) { error = invalid }
                    }, enabled = enabled && !busy) { Text(t("Review draft", "Revisar borrador")) }
                    TextButton(onClick = { scope.launch {
                        val id = draft.getString("id")
                        if (call("DELETE", query = "draftId=$id") && draftId == id) cancelReview()
                    } }, enabled = !busy) { Text(t("Discard draft", "Descartar borrador"), color = MaterialTheme.colorScheme.error) }
                }
            }
            Text(t("Saved facts", "Datos guardados"), style = MaterialTheme.typography.titleMedium)
            Text(t("Kept until you delete them. Correct anything outdated. Transactions are user reported, never bank verified.", "Se conservan hasta que los borres. Corrige los datos desactualizados. Las transacciones son declaradas por ti, nunca verificadas por un banco."), style = MaterialTheme.typography.bodySmall)
            val items = snapshot.getJSONArray("items")
            if (items.length() == 0) Text(t("No saved facts yet.", "Aún no hay datos guardados."))
            for (i in 0 until items.length()) {
                val row = items.getJSONObject(i)
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(row.getString("summary"))
                    Text(listOfNotNull(row.getString("category"), row.optString("observedAt").takeIf { it.isNotBlank() },
                        row.opt("amount")?.takeUnless { it == JSONObject.NULL }?.let { "$it ${row.optString("currency")}" },
                        "ChatGPT · " + t("user reported", "declarado por ti"), row.getString("updatedAt")).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = {
                            try {
                                val fact = JSONObject()
                                listOf("category", "summary", "amount", "currency", "observedAt").forEach { field -> if (row.has(field) && !row.isNull(field)) fact.put(field, row.get(field)) }
                                startReview(listOf(FinancialContextPolicy.parseItem(fact)), edit = FinancialContextPolicy.uuid(row.getString("id")))
                            } catch (_: Exception) { error = invalid }
                        }, enabled = enabled && !busy) { Text(t("Correct", "Corregir")) }
                        TextButton(onClick = { scope.launch { call("DELETE", query = "id=${row.getString("id")}") } }, enabled = !busy) { Text(t("Delete", "Borrar"), color = MaterialTheme.colorScheme.error) }
                    }
                } }
            }
            Text(t("Your Bobby recommendations", "Tus recomendaciones de Bobby"), style = MaterialTheme.typography.titleMedium)
            Text(t("Saved for up to 90 days. Copy only the recommendation you choose into ChatGPT. Each recommendation shows the market data timestamp and when it was saved.", "Guardadas hasta 90 días. Copia en ChatGPT solo la recomendación que elijas. Cada recomendación muestra la fecha de los datos de mercado y cuándo se guardó."), style = MaterialTheme.typography.bodySmall)
            Text(t("To save new answers from this Android device, also enable Profile → Memory → Remember questions from this device.", "Para guardar respuestas nuevas de este Android, activa también Perfil → Memoria → Recordar preguntas de este dispositivo."), style = MaterialTheme.typography.bodySmall)
            val recommendations = snapshot.getJSONArray("recommendations")
            if (recommendations.length() == 0) Text(t("No saved recommendations yet. New account analyses appear while context is enabled.", "Aún no hay recomendaciones guardadas. Los análisis nuevos de la cuenta aparecen cuando el contexto está activo."))
            for (i in 0 until recommendations.length()) {
                val rec = recommendations.getJSONObject(i)
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(rec.getString("symbol") + " · " + t("Market data as of: ", "Datos de mercado al: ") + rec.getString("asOf"), style = MaterialTheme.typography.bodySmall)
                    Text(t("Saved: ", "Guardada: ") + rec.getString("createdAt"), style = MaterialTheme.typography.bodySmall)
                    Text(rec.getString("headline"))
                    Text(t("Why: ", "Motivo: ") + rec.getString("why"), style = MaterialTheme.typography.bodySmall)
                    Text(t("Risk: ", "Riesgo: ") + rec.getString("risk"), style = MaterialTheme.typography.bodySmall)
                    Text(t("Watch: ", "Vigila: ") + rec.getString("watch"), style = MaterialTheme.typography.bodySmall)
                    Text(rec.getString("verdict") + " · " + rec.getString("direction"), style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { copy(FinancialContextPolicy.recommendationText(rec)) }, enabled = enabled) { Text(t("Copy for ChatGPT", "Copiar para ChatGPT")) }
                        TextButton(onClick = { if (current()) onShare(FinancialContextPolicy.recommendationText(rec)) }, enabled = enabled) { Text(t("Share", "Compartir")) }
                    }
                } }
            }
            TextButton(onClick = { deleteAll = true }, enabled = !busy) { Text(t("Delete all context and recommendations", "Borrar todo el contexto y las recomendaciones"), color = MaterialTheme.colorScheme.error) }
        }
    }
    if (deleteAll) AlertDialog(onDismissRequest = { deleteAll = false }, title = { Text(t("Delete all financial context and recommendations?", "¿Borrar todo el contexto financiero y las recomendaciones?")) },
        confirmButton = { TextButton(onClick = { deleteAll = false; scope.launch { if (call("DELETE", query = "scope=all")) { cancelReview(); input = "" } } }) { Text(t("Delete everything", "Borrar todo")) } },
        dismissButton = { TextButton(onClick = { deleteAll = false }) { Text(t("Cancel", "Cancelar")) } })
}

private data class FinancialContextEdit(val category: String, val summary: String, val amount: String, val currency: String, val observedAt: String, val selected: Boolean = true) {
    constructor(item: FinancialContextItem): this(item.category, item.summary, item.amount?.toString().orEmpty(), item.currency.orEmpty(), item.observedAt.orEmpty())
    fun item(): FinancialContextItem = FinancialContextPolicy.parseItem(JSONObject().put("category", category).put("summary", summary).apply {
        if (amount.isNotEmpty()) put("amount", amount.toDouble()); if (currency.isNotEmpty()) put("currency", currency); if (observedAt.isNotEmpty()) put("observedAt", observedAt)
    })
}
@Composable private fun FinancialContextEditRow(row: FinancialContextEdit, t: (String, String) -> String, enabled: Boolean, onChange: (FinancialContextEdit) -> Unit) {
    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row { Checkbox(row.selected, { onChange(row.copy(selected = it)) }, enabled = enabled); Text(t("Include this fact", "Incluir este dato")) }
        var expanded by remember { mutableStateOf(false) }
        Box {
            OutlinedButton(onClick = { expanded = true }, enabled = enabled) { Text(t("Category", "Categoría") + ": " + row.category) }
            DropdownMenu(expanded, { expanded = false }) { FinancialContextPolicy.categories.forEach { category ->
                DropdownMenuItem(text = { Text(category) }, onClick = { onChange(row.copy(category = category)); expanded = false })
            } }
        }
        OutlinedTextField(row.summary, { onChange(row.copy(summary = it)) }, enabled = enabled, label = { Text(t("Summary", "Resumen")) }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(row.amount, { onChange(row.copy(amount = it)) }, enabled = enabled, label = { Text(t("Amount (optional)", "Importe (opcional)")) }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(row.currency, { onChange(row.copy(currency = it)) }, enabled = enabled, label = { Text(t("Currency (EUR, USD…)", "Moneda (EUR, USD…)")) }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(row.observedAt, { onChange(row.copy(observedAt = it)) }, enabled = enabled, label = { Text(t("Date YYYY-MM-DD (optional)", "Fecha AAAA-MM-DD (opcional)")) }, modifier = Modifier.fillMaxWidth())
    } }
}
