package xyz.bobbyprotocol.android.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import xyz.bobbyprotocol.android.billing.BillingRenewal
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingMessage
import xyz.bobbyprotocol.android.billing.BillingStore
import xyz.bobbyprotocol.android.data.ApiException
import xyz.bobbyprotocol.android.data.AccountDeletionPolicy
import xyz.bobbyprotocol.android.data.AccountDeletionRequirements
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.data.BriefingSettingsPolicy
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import xyz.bobbyprotocol.android.platform.BriefingReminders
import xyz.bobbyprotocol.android.platform.AvatarShareSpec
import xyz.bobbyprotocol.android.equipment.EquipmentStore
import xyz.bobbyprotocol.android.ui.EquipmentLocker
import xyz.bobbyprotocol.android.ui.EquipmentCompanionArt
import java.util.TimeZone

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BobbySheet(
    route: String, session: NucleoSession, repository: BobbyRepository, billing: BillingStore,
    onClose: () -> Unit, onOpen: (String) -> Unit, onSignIn: (String) -> Unit,
    onExternal: (String) -> Unit, onShare: (String) -> Unit, onShareAvatar: (AvatarShareSpec) -> Unit,
    narrationStatus: String?, onNarrate: (JSONObject) -> Unit, onStopNarration: () -> Unit,
    onReminders: (Boolean) -> Unit,
    onPurchase: (String) -> Unit, onRestore: () -> Unit,
) {
    val account by repository.session.collectAsStateWithLifecycle()
    val billingState by billing.state.collectAsStateWithLifecycle()
    val epoch by repository.epoch.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    var data by remember(route, epoch) { mutableStateOf<JSONObject?>(null) }
    var busy by remember(route, epoch) { mutableStateOf(false) }
    var error by remember(route, epoch) { mutableStateOf<String?>(null) }
    var confirmation by remember(route, epoch) { mutableStateOf<String?>(null) }
    var deletionRequirements by remember(route, epoch) { mutableStateOf<AccountDeletionRequirements?>(null) }
    // Deletion signs out and changes the epoch. Keep the manual Apple steps visible through that change.
    var manualAppleSteps by remember(route) { mutableStateOf(false) }
    var refresh by remember(route, epoch) { mutableIntStateOf(0) }
    var remindersRevision by remember { mutableIntStateOf(0) }
    val reminderPreferences = remember(context) { context.getSharedPreferences("bobby.briefingReminders", 0) }
    DisposableEffect(reminderPreferences) {
        val listener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> remindersRevision++ }
        reminderPreferences.registerOnSharedPreferenceChangeListener(listener)
        onDispose { reminderPreferences.unregisterOnSharedPreferenceChangeListener(listener) }
    }
    var selectedReport by remember(route, epoch) { mutableStateOf<JSONObject?>(null) }
    val t: (String, String) -> String = { en, es -> session.text(en, es) }
    fun task(action: suspend () -> Unit) {
        if (busy) return
        scope.launch {
            busy = true; error = null
            try { action() } catch (cancelled: CancellationException) { throw cancelled }
            catch (failure: Exception) {
                error = when ((failure as? ApiException)?.status) {
                    401 -> t("Sign in to continue.", "Inicia sesión para continuar.")
                    402 -> t("Bobby Pro is required for this feature.", "Necesitas Bobby Pro para esta función.")
                    409 -> t("Your account changed. Refresh and try again.", "Tu cuenta cambió. Actualiza e intenta de nuevo.")
                    else -> t("Could not load or save this information. Try again.", "No se pudo cargar o guardar la información. Intenta de nuevo.")
                }
            } finally { busy = false }
        }
    }

    LaunchedEffect(route, epoch, refresh) {
        error = null
        if (!session.riskAccepted && route !in setOf("riskNotice", "squad", "account", "briefingSettings")) return@LaunchedEffect
        busy = true
        try {
            data = when (route) {
                "squad" -> session.roster()
                "locker" -> null
                "riskNotice" -> session.riskNotice()
                "isla" -> null
                "levels", "invite", "coupon" -> repository.access()
                "memory" -> if (account != null) repository.memory() else null
                "briefings" -> if (account != null) repository.briefings() else null
                "briefingSettings" -> if (account != null) repository.briefingSettings() else null
                "paywall", "account" -> {
                    if (account != null && session.riskAccepted) { billing.identify(account, epoch); billing.loadOfferings() }
                    null
                }
                else -> null
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (_: Exception) { error = t("This information is unavailable. Try again.", "Esta información no está disponible. Intenta de nuevo.") }
        finally { busy = false }
    }

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = if (route == "account") ProfilePalette.background else Color(0xFF0C0F13), contentColor = MaterialTheme.colorScheme.onSurface) {
        DarkSheetSystemBars()
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                if (route == "account") Text(title(route, t).uppercase(), color = ProfilePalette.dim, style = MaterialTheme.typography.labelLarge.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace))
                else Text(title(route, t), style = MaterialTheme.typography.headlineMedium)
                TextButton(onClick = onClose) { Text(t("Close", "Cerrar")) }
            }
            if (busy) CircularProgressIndicator(Modifier.size(24.dp))
            error?.let {
                Text(it, color = MaterialTheme.colorScheme.error)
                OutlinedButton(onClick = { refresh++ }, enabled = !busy) { Text(t("Retry", "Reintentar")) }
            }
            if (!session.riskAccepted && route !in setOf("squad", "riskNotice", "account", "briefingSettings")) {
                Text(t("Accept the risk notice before using Bobby.", "Acepta el aviso de riesgo antes de usar Bobby."))
                Action(t("Risk notice", "Aviso de riesgo")) { onOpen("riskNotice") }
            } else when (route) {
                "account" -> AccountProfile(session, repository, billing, billingState, busy,
                    onOpen, onSignIn, onExternal, onShareAvatar,
                    onSync = { task { session.syncProgress() } },
                    onDelete = { task { deletionRequirements = repository.accountDeletionRequirements(); confirmation = "account" } },
                    onSignOut = { repository.signOut(); onClose() }, onRestore = onRestore)
                "paywall" -> {
                    Text(t("Your three-agent market desk.", "Tu mesa de análisis con tres agentes."), style = MaterialTheme.typography.titleLarge)
                    Text(t("Read every plan, period and introductory offer below before subscribing.", "Revisa el plan, el periodo y la oferta introductoria antes de suscribirte."))
                    if (account == null) Action(t("Sign in", "Iniciar sesión")) { onOpen("account") }
                    billingState.message?.let { Text(billingMessage(it, t), color = MaterialTheme.colorScheme.primary) }
                    if (billingState.purchasePending) billingState.purchaseAttemptId?.let { reference ->
                        Text(t("Include this payment reference when contacting Help.", "Incluye esta referencia de pago cuando contactes con Ayuda."), style = MaterialTheme.typography.bodySmall)
                        SelectionContainer { Text(reference, style = MaterialTheme.typography.bodySmall) }
                    }
                    if (billingState.packages.isEmpty() && !busy) Text(t("Plans are currently unavailable.", "Los planes no están disponibles en este momento."))
                    billingState.packages.forEach { plan ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(plan.title, style = MaterialTheme.typography.titleMedium)
                                Text("${plan.displayPrice} / ${period(plan.periodCount, plan.periodUnit, t)}")
                                plan.pricingPhases.forEach { phase -> Text("${phase.displayPrice} / ${period(phase.periodCount, phase.periodUnit, t)}${phase.cycles?.takeIf { it > 0 }?.let { " × $it" } ?: ""}", style = MaterialTheme.typography.bodySmall) }
                                when (plan.renewal) {
                                    BillingRenewal.AUTOMATIC -> Text(t("This plan renews automatically unless cancelled in Google Play.", "Este plan se renueva automáticamente salvo que lo canceles en Google Play."), style = MaterialTheme.typography.bodySmall)
                                    BillingRenewal.PREPAID -> Text(t("This prepaid plan does not renew automatically.", "Este plan de prepago no se renueva automáticamente."), style = MaterialTheme.typography.bodySmall)
                                    BillingRenewal.UNKNOWN -> Unit
                                }
                                Button(onClick = { onPurchase(plan.identifier) }, enabled = billingState.canPurchase) { Text(if (plan.renewal == BillingRenewal.PREPAID) t("Buy prepaid access", "Comprar acceso de prepago") else t("Subscribe", "Suscribirme")) }
                            }
                        }
                    }
                    OutlinedButton(onClick = onRestore, enabled = account != null && billingState.canRestore) { Text(t("Restore purchases", "Restaurar compras")) }
                    if (billingState.subscriptionProvider == "google" || billingState.subscriptionProvider == "apple") {
                        billing.managementUri()?.let { url -> Action(t("Manage subscription", "Administrar suscripción")) { onExternal(url.toString()) } }
                    }
                    Action(t("Help", "Ayuda")) { onExternal(BobbySupportLinks.url(BobbySupportLinks.Page.SUPPORT, session.language, session.locale, repository.country)) }
                    Text(t("Bobby confirms your access after purchase.", "Bobby confirma tu acceso después de la compra."), style = MaterialTheme.typography.bodySmall)
                    Action(t("Privacy policy", "Política de privacidad")) { onExternal(BobbySupportLinks.url(BobbySupportLinks.Page.PRIVACY, session.language, session.locale, repository.country)) }
                    Action(t("Google Play terms", "Términos de Google Play")) { onExternal("https://play.google.com/about/play-terms/") }
                }
                "squad" -> {
                    Action(t("Locker", "Equipamiento")) { onOpen("locker") }
                    objects(data?.optJSONArray("companions")).forEach { companion ->
                        Card(Modifier.fillMaxWidth().clickable(enabled = companion.optBoolean("unlocked")) { task { session.dispatch("setCompanion", JSONObject().put("id", companion.getString("id"))); onClose() } }) {
                            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                    EquipmentCompanionArt(companion.getString("id"), companion.optString("label"), Modifier.size(64.dp), !companion.optBoolean("unlocked"))
                                    Column { Text(companion.optString("label"), style = MaterialTheme.typography.titleMedium); Text(companion.optString("role")) }
                                }
                                Text(companion.optString("selectLine"))
                                if (!companion.optBoolean("unlocked")) Text("${t("Level", "Nivel")} ${companion.optInt("requiredLevel")}")
                            }
                        }
                    }
                }
                "locker" -> {
                    EquipmentLocker(session, repository) { error = it }
                }
                "riskNotice" -> {
                    objects(data?.optJSONArray("statements")).forEach { statement -> Text(statement.optString("title"), style = MaterialTheme.typography.titleMedium); Text(statement.optString("body")) }
                    if (session.riskAccepted) TextButton(onClick = { confirmation = "consent" }) { Text(t("Stop AI questions on this Android", "Detener preguntas de IA en este Android")) }
                    Text(t("This Android's question and voice consent is separate from your account's scheduled briefing consent. Manage scheduled analysis and audio in Briefing settings.", "El consentimiento de preguntas y voz de este Android es independiente del consentimiento de informes programados de tu cuenta. Administra el análisis y audio programados en Configuración de informes."))
                    if (account != null) Action(t("Briefing settings", "Configuración de informes")) { onOpen("briefingSettings") }
                }
                "memory" -> if (account == null) SignedOut(t, onOpen) else data?.let { snapshot ->
                    Toggle(t("Account memory", "Memoria de la cuenta"), snapshot.optBoolean("enabled"), !busy) { enabled -> task { data = repository.updateMemory(JSONObject().put("memoryEnabled", enabled)) } }
                    Toggle(t("Remember questions from this device", "Recordar preguntas de este dispositivo"), repository.nativeMemoryOptIn(), !busy && snapshot.optBoolean("enabled")) { repository.setNativeMemoryOptIn(it); refresh++ }
                    Text(t("This device only contributes questions when you enable it here.", "Este dispositivo sólo aporta preguntas cuando lo activas aquí."), style = MaterialTheme.typography.bodySmall)
                    val prefs = snapshot.optJSONObject("prefs") ?: JSONObject()
                    listOf("horizon" to listOf("intraday", "week", "month", "long"), "experience" to listOf("new", "some", "experienced"), "risk" to listOf("low", "medium", "high")).forEach { (field, options) ->
                        Text(memoryLabel(field, t), style = MaterialTheme.typography.titleMedium)
                        options.forEach { choice -> TextButton(onClick = { task { data = repository.updateMemory(JSONObject().put(field, choice)) } }, enabled = !busy) { Text((if (prefs.optString(field) == choice) "✓ " else "") + memoryLabel(choice, t)) } }
                        TextButton(onClick = { task { data = repository.updateMemory(JSONObject().put(field, JSONObject.NULL)) } }, enabled = !busy) { Text(t("Clear preference", "Borrar preferencia")) }
                    }
                    objects(snapshot.optJSONArray("assets")).forEach { item ->
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(item.optString("symbol"))
                            TextButton(onClick = { task { data = repository.forgetMemory(item.getString("symbol")) } }, enabled = !busy) { Text(t("Forget", "Olvidar")) }
                        }
                    }
                    TextButton(onClick = { confirmation = "memory" }, enabled = !busy) { Text(t("Delete all memory", "Eliminar toda la memoria"), color = MaterialTheme.colorScheme.error) }
                }
                "briefings" -> if (account == null) SignedOut(t, onOpen) else {
                    selectedReport?.let { report ->
                        Text(report.optString("title"), style = MaterialTheme.typography.titleLarge)
                        Text(report.optString("opening"))
                        objects(report.optJSONArray("sections")).forEach { section ->
                            Text(section.optString("title"), style = MaterialTheme.typography.titleMedium)
                            Text(section.optString("body"))
                            objects(section.optJSONArray("facts")).forEach { fact -> Text("${fact.optString("label")} · ${fact.optString("value")}", style = MaterialTheme.typography.bodySmall) }
                        }
                        objects(report.optJSONArray("sources")).forEach { source -> Text(source.optString("name"), style = MaterialTheme.typography.bodySmall) }
                        Text(report.optString("dataAsOf"), style = MaterialTheme.typography.bodySmall)
                        if (report.optJSONArray("narrationSegments")?.length()?.let { it > 0 } == true) {
                            Action(if (narrationStatus in setOf("preparing", "playing")) t("Stop audio", "Detener audio") else t("Listen", "Escuchar"), !session.muted) { if (narrationStatus in setOf("preparing", "playing")) onStopNarration() else onNarrate(report) }
                            if (session.muted) Text(t("Voice is off. Turn it on in your profile.", "La voz está apagada. Actívala en tu perfil."), style = MaterialTheme.typography.bodySmall)
                            if (narrationStatus == "failed") Text(t("Audio is unavailable. Your report is ready to read.", "El audio no está disponible. Puedes leer el informe."))
                        }
                        Action(t("Back to inbox", "Volver a la bandeja")) { onStopNarration(); selectedReport = null }
                    } ?: run {
                        val items = objects(data?.optJSONArray("items"))
                        if (items.isEmpty() && !busy) Text(t("No reports are ready yet.", "Todavía no hay informes disponibles."))
                        items.forEach { report -> Action("${report.optString("cadence")} · ${report.optString("scheduledAt")}", !busy) { task { selectedReport = repository.briefing(report.getString("id")) } } }
                        data?.optString("nextCursor")?.takeIf { it.isNotBlank() && it != "null" }?.let { cursor -> Action(t("Load more", "Cargar más"), !busy) { task { val next = repository.briefings(cursor = cursor); val all = JSONArray(); objects(data?.optJSONArray("items")).forEach { all.put(it) }; objects(next.optJSONArray("items")).forEach { all.put(it) }; data = next.put("items", all) } } }
                        Action(t("Briefing settings", "Configuración de informes")) { onOpen("briefingSettings") }
                    }
                }
                "briefingSettings" -> if (account == null) SignedOut(t, onOpen) else data?.let { response ->
                    val settings = response.optJSONObject("settings") ?: response
                    val options = settings.optJSONObject("options") ?: response.optJSONObject("options")
                    Toggle(t("Weekly briefing", "Informe semanal"), settings.optBoolean("weeklyEnabled"), !busy && (settings.optBoolean("weeklyEnabled") || (session.riskAccepted && settings.optBoolean("analysisConsentEnabled")))) { enabled -> task { if (enabled && !session.riskAccepted) throw ApiException(403, "consent_required"); data = repository.updateBriefingSettings(settings.getInt("revision"), JSONObject().put("weeklyEnabled", enabled)) } }
                    Text(t("Configure your briefing consent and selected assets before enabling delivery.", "Configura el consentimiento y los activos antes de activar la entrega."))
                    Toggle(t("Allow AI analysis for briefings", "Permitir análisis de IA para informes"), settings.optBoolean("analysisConsentEnabled"), !busy && (session.riskAccepted || settings.optBoolean("analysisConsentEnabled"))) { enabled -> task { data = repository.updateBriefingSettings(settings.getInt("revision"), BriefingSettingsPolicy.consentChange("analysis", enabled, options, session.riskAccepted)) } }
                    Toggle(t("Allow audio for briefings", "Permitir audio para informes"), settings.optBoolean("audioConsentEnabled"), !busy && (session.riskAccepted || settings.optBoolean("audioConsentEnabled"))) { enabled -> task { data = repository.updateBriefingSettings(settings.getInt("revision"), BriefingSettingsPolicy.consentChange("audio", enabled, options, session.riskAccepted)) } }
                    val notifyEnabled = remember(remindersRevision, account?.userId) { BriefingReminders.enabled(context, account?.userId) }
                    Toggle(t("Notify me when reports are ready", "Avisarme cuando haya informes disponibles"), notifyEnabled, !busy && (session.riskAccepted || notifyEnabled)) { enabled -> onReminders(enabled) }
                    Text(t("Android checks for ready reports in the background. Delivery time depends on your device settings.", "Android consulta los informes disponibles en segundo plano. La hora del aviso depende de la configuración del dispositivo."), style = MaterialTheme.typography.bodySmall)
                    var assets by remember(data) { mutableStateOf(strings(settings.optJSONArray("assets")).joinToString(", ")) }
                    val savedReportLanguage = settings.optString("language", "en").let { if (it == "pt-BR") "pt" else it }
                    var reportLanguage by remember(data) { mutableStateOf(savedReportLanguage) }
                    var reportLocale by remember(data) { mutableStateOf(BriefingSettingsPolicy.reportLocale(settings, savedReportLanguage)) }
                    Text(t("Report language", "Idioma del informe"), style = MaterialTheme.typography.titleMedium)
                    Text(when (session.language) {
                        "es" -> "Elige el idioma de los próximos informes. Este ajuste es independiente del idioma de la app."
                        "fr" -> "Choisissez la langue des prochains rapports. Ce réglage est indépendant de la langue de l’app."
                        "pt" -> "Escolhe o idioma dos próximos relatórios. Esta definição é independente do idioma da app."
                        "it" -> "Scegli la lingua dei prossimi rapporti. Questa impostazione è indipendente dalla lingua dell’app."
                        "de" -> "Wähle die Sprache künftiger Berichte. Diese Einstellung ist unabhängig von der App-Sprache."
                        else -> "Choose the language of future reports. This setting is separate from the app language."
                    }, style = MaterialTheme.typography.bodySmall)
                    listOf("en" to "English", "es" to "Español", "fr" to "Français", "pt" to "Português", "it" to "Italiano", "de" to "Deutsch").chunked(2).forEach { row ->
                        Row(Modifier.fillMaxWidth()) { row.forEach { (code, label) ->
                            TextButton(onClick = { reportLanguage = code; reportLocale = BriefingSettingsPolicy.reportLocale(settings, code) }, enabled = !busy, modifier = Modifier.weight(1f).height(48.dp)) {
                                Text((if (reportLanguage == code) "✓ " else "") + label)
                            }
                        } }
                    }
                    if (reportLanguage == "pt") Row(Modifier.fillMaxWidth()) {
                        listOf("pt-PT" to "Portugal", "pt-BR" to "Brasil").forEach { (code, label) ->
                            TextButton(onClick = { reportLocale = code }, enabled = !busy, modifier = Modifier.weight(1f).height(48.dp)) {
                                Text((if (reportLocale == code) "✓ " else "") + label)
                            }
                        }
                    }
                    OutlinedTextField(assets, { assets = it }, label = { Text(t("Assets (up to six, comma separated)", "Activos (máximo seis, separados por comas)")) }, modifier = Modifier.fillMaxWidth())
                    if (session.companionId != null) Text(t("Saving applies your current companion's voice to future reports.", "Guardar aplica la voz de tu compañero actual a futuros informes."), style = MaterialTheme.typography.bodySmall)
                    Action(t("Save", "Guardar"), !busy) { task { val values = assets.split(',').map { it.trim().uppercase(java.util.Locale.ROOT) }.filter(String::isNotBlank).distinct(); val current = JSONObject(settings.toString()).put("options", options ?: JSONObject()); data = repository.updateBriefingSettings(settings.getInt("revision"), BriefingSettingsPolicy.preferences(current, values, reportLanguage, session.companionId, reportLocale)) } }
                }
                "isla" -> TraderLandSheet(session, repository, { error = it }, onExternal)
                "coupon" -> if (account == null) SignedOut(t, onOpen) else {
                    var code by remember(epoch) { mutableStateOf("") }
                    var result by remember(epoch) { mutableStateOf<String?>(null) }
                    Text(t("Redeem a Bobby code for the benefits confirmed by your account.", "Canjea un código Bobby por los beneficios confirmados en tu cuenta."))
                    OutlinedTextField(code, { code = it.take(64).uppercase() }, label = { Text(t("Code", "Código")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    Action(t("Redeem", "Canjear"), !busy && code.isNotBlank()) { task {
                        val response = repository.request("api/bobby-access", "POST", JSONObject().put("action", "redeem-coupon").put("code", code.trim()), authenticated = true)
                        result = response.optString("result")
                        data = repository.access()
                    } }
                    result?.let { Text(benefitResult(it, t), color = MaterialTheme.colorScheme.primary) }
                }
                "levels" -> {
                    val levels = data?.optJSONObject("levels")
                    listOf("rapido" to t("Quick", "Rápido"), "profundo" to t("Deep", "Profundo"), "maximo" to t("Max", "Máximo")).forEach { (id, label) ->
                        val access = levels?.optJSONObject(id)
                        Text(label, style = MaterialTheme.typography.titleMedium)
                        access?.optInt("remaining")?.let { Text("${t("Available reads", "Lecturas disponibles")}: $it") }
                        Action(label, access?.optBoolean("allowed", id == "rapido") ?: (id == "rapido")) { session.selectAnalysisLevel(id); onClose() }
                    }
                    Action("Bobby Pro") { onOpen("paywall") }
                }
                "invite" -> {
                    val referral = data?.optJSONObject("referral")
                    val url = referral?.optString("url")?.takeIf { it.startsWith("https://bobbyprotocol.xyz/") }
                    if (url != null) {
                        Text("${referral.optInt("accepted")} / ${referral.optInt("max")} ${t("friends joined", "amigos se unieron")}")
                        Text("${referral.optInt("rewardDays")} ${t("days of Pro per eligible invitation", "días de Pro por invitación válida")}")
                        Action(t("Share invite", "Compartir invitación")) { onShare(url) }
                        objects(referral.optJSONArray("friends")).forEach { Text("${t("Joined", "Se unió")}: ${it.optString("joinedAt")}") }
                    } else Text(t("Invitations are currently unavailable.", "Las invitaciones no están disponibles en este momento."))
                    if (account == null) SignedOut(t, onOpen) else {
                        var code by remember(epoch) { mutableStateOf("") }
                        var result by remember(epoch) { mutableStateOf<String?>(null) }
                        OutlinedTextField(code, { code = it.take(8).uppercase() }, label = { Text(t("Friend's invitation code", "Código de invitación de un amigo")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        Action(t("Accept invitation", "Aceptar invitación"), !busy && code.matches(Regex("[A-HJ-NP-Z2-9]{8}"))) { task {
                            val response = repository.request("api/bobby-access", "POST", JSONObject().put("action", "referral-claim").put("code", code), authenticated = true)
                            result = response.optString("result")
                            data = repository.access()
                        } }
                        result?.let { Text(benefitResult(it, t), color = MaterialTheme.colorScheme.primary) }
                    }
                }
            }
        }
    }
    confirmation?.let { action ->
        AlertDialog(
            onDismissRequest = { if (!busy) confirmation = null },
            title = { Text(t("Confirm", "Confirmar")) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(when (action) {
                        "account" -> t("Delete your Bobby account and synced personal data? Public blockchain records and your store subscription may remain. Manage your subscription separately.", "¿Eliminar tu cuenta y datos personales sincronizados? Los registros públicos de blockchain y tu suscripción pueden permanecer. Administra la suscripción por separado.")
                        "memory" -> t("Delete all of Bobby's saved account memory?", "¿Eliminar toda la memoria de tu cuenta en Bobby?")
                        else -> t("Stop new questions and generated voice on this Android and return to the risk notice? Scheduled briefing analysis and audio have separate account consent. Turn those off in Briefing settings; this action does not change them.", "¿Detener preguntas nuevas y voz generada en este Android y volver al aviso de riesgo? El análisis y audio de informes programados tienen un consentimiento de cuenta separado. Desactívalos en Configuración de informes; esta acción no los modifica.")
                    })
                    if (action == "account" && deletionRequirements?.requiresManualAppleRevocation == true) {
                        Text(t("Apple sign-in access requires a separate manual step. After Bobby confirms deletion, follow Apple's instructions to stop using Sign in with Apple for Bobby.", "El acceso mediante Apple requiere un paso manual adicional. Cuando Bobby confirme la eliminación, sigue las instrucciones de Apple para dejar de usar Iniciar sesión con Apple para Bobby."))
                    }
                }
            },
            confirmButton = {
                TextButton(enabled = !busy, onClick = {
                    val ticket = deletionRequirements
                    confirmation = null
                    task {
                        when (action) {
                            "account" -> {
                                val request = ticket ?: throw ApiException(409, "account_confirmation_required")
                                val response = repository.deleteAccount(request)
                                session.forgetDeletedAccount(request.ownerUserId)
                                EquipmentStore(context).forget(request.ownerUserId)
                                BriefingReminders.forget(context, request.ownerUserId)
                                context.getSharedPreferences("bobby.traderLandHelp", 0).edit().remove(TraderLandFirstVisit.preferenceKey(request.ownerUserId)).apply()
                                if (response.optString("appleRevocation") == "manual") manualAppleSteps = true else onClose()
                            }
                            "memory" -> { data = repository.forgetAllMemory() }
                            else -> {
                                session.revokeRiskConsent()
                                repository.setNativeMemoryOptIn(false)
                                BriefingReminders.refresh(context, null)
                                onClose()
                            }
                        }
                    }
                }) { Text(t("Confirm", "Confirmar")) }
            },
            dismissButton = { TextButton(enabled = !busy, onClick = { confirmation = null }) { Text(t("Cancel", "Cancelar")) } },
        )
    }
    if (manualAppleSteps) {
        AlertDialog(
            onDismissRequest = { manualAppleSteps = false; onClose() },
            title = { Text(t("Account deleted", "Cuenta eliminada")) },
            text = { Text(t("Your Bobby account was deleted. To remove Bobby's access to your Apple account, open Apple's instructions, select Bobby in your Sign in with Apple settings, and stop using Sign in with Apple.", "Tu cuenta Bobby se eliminó. Para retirar el acceso de Bobby a tu cuenta Apple, abre las instrucciones de Apple, selecciona Bobby en la configuración de Iniciar sesión con Apple y deja de usar ese acceso.")) },
            confirmButton = { TextButton(onClick = { onExternal(AccountDeletionPolicy.APPLE_INSTRUCTIONS_URL) }) { Text(t("Apple instructions", "Instrucciones de Apple")) } },
            dismissButton = { TextButton(onClick = { manualAppleSteps = false; onClose() }) { Text(t("Done", "Listo")) } },
        )
    }
}

@Composable private fun Action(label: String, enabled: Boolean = true, action: () -> Unit) { OutlinedButton(onClick = action, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(label) } }
@Composable private fun Toggle(label: String, value: Boolean, enabled: Boolean, action: (Boolean) -> Unit) { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) { Text(label, Modifier.weight(1f).padding(end = 8.dp, top = 12.dp)); Switch(value, action, enabled = enabled) } }
@Composable private fun SignedOut(t: (String, String) -> String, onOpen: (String) -> Unit) { Text(t("Sign in to open this feature.", "Inicia sesión para abrir esta función.")); Action(t("Sign in", "Iniciar sesión")) { onOpen("account") } }
private fun objects(array: JSONArray?): List<JSONObject> = (0 until (array?.length() ?: 0)).mapNotNull { array?.optJSONObject(it) }
private fun strings(array: JSONArray?): List<String> = (0 until (array?.length() ?: 0)).mapNotNull { array?.optString(it)?.takeIf(String::isNotBlank) }
private fun title(route: String, t: (String, String) -> String): String = when (route) { "account" -> t("Profile", "Perfil"); "memory" -> t("Memory", "Memoria"); "briefings" -> t("Market briefings", "Informes de mercado"); "briefingSettings" -> t("Briefing settings", "Configuración de informes"); "squad" -> t("Squad", "Equipo"); "locker" -> t("Locker", "Equipamiento"); "isla" -> "Trader Land"; "riskNotice" -> t("Risk notice", "Aviso de riesgo"); "levels" -> t("Analysis level", "Nivel de análisis"); "invite" -> t("Invite a friend", "Invitar a un amigo"); "coupon" -> t("Redeem a code", "Canjear un código"); else -> "Bobby Pro" }
private fun period(count: Int?, unit: String?, t: (String, String) -> String): String = "${count ?: ""} " + when (unit) { "DAY" -> t("day", "día"); "WEEK" -> t("week", "semana"); "MONTH" -> t("month", "mes"); "YEAR" -> t("year", "año"); else -> t("period shown by your store", "periodo indicado por la tienda") }
private fun memoryLabel(value: String, t: (String, String) -> String): String = when (value) { "horizon" -> t("Time horizon", "Horizonte"); "experience" -> t("Experience", "Experiencia"); "risk" -> t("Risk tolerance", "Tolerancia al riesgo"); "intraday" -> t("Intraday", "Intradía"); "week" -> t("Week", "Semana"); "month" -> t("Month", "Mes"); "long" -> t("Long term", "Largo plazo"); "new" -> t("New", "Principiante"); "some" -> t("Some experience", "Algo de experiencia"); "experienced" -> t("Experienced", "Con experiencia"); "low" -> t("Low", "Baja"); "medium" -> t("Medium", "Media"); "high" -> t("High", "Alta"); else -> value }
private fun billingMessage(message: BillingMessage, t: (String, String) -> String): String = when (message) { BillingMessage.CONFIGURATION_MISSING, BillingMessage.GOOGLE_PAYMENTS_NOT_READY -> t("Google Play subscriptions are not available yet.", "Las suscripciones de Google Play aún no están disponibles."); BillingMessage.SIGN_IN_FIRST -> t("Sign in before subscribing.", "Inicia sesión antes de suscribirte."); BillingMessage.ALREADY_SUBSCRIBED -> t("Check your existing Pro access before starting another purchase.", "Revisa tu acceso Pro antes de iniciar otra compra."); BillingMessage.PURCHASE_PENDING, BillingMessage.SERVER_CONFIRMATION_PENDING -> t("Your purchase is awaiting confirmation.", "Tu compra está pendiente de confirmación."); BillingMessage.NOTHING_TO_RESTORE -> t("No purchases were found to restore.", "No se encontraron compras para restaurar."); BillingMessage.SUBSCRIBED -> t("Bobby Pro is active.", "Bobby Pro está activo."); else -> t("The purchase could not complete. Try again.", "No se pudo completar la compra. Intenta de nuevo.") }


private fun benefitResult(result: String, t: (String, String) -> String): String = when (result) {
    "claimed", "redeemed" -> t("Your account confirmed the benefit.", "Tu cuenta confirmó el beneficio.")
    "already_claimed", "already_redeemed" -> t("This account already redeemed a benefit from this code.", "Esta cuenta ya canjeó un beneficio con este código.")
    "self" -> t("Use an invitation from a different account.", "Usa una invitación de otra cuenta.")
    "not_new" -> t("This invitation is available to eligible new accounts.", "Esta invitación está disponible para cuentas nuevas que cumplan los requisitos.")
    "inviter_full", "exhausted" -> t("This code reached its redemption limit.", "Este código llegó al límite de canjes.")
    "expired" -> t("This code expired.", "Este código venció.")
    else -> t("This code did not grant a benefit. Check it and try again.", "Este código no concedió un beneficio. Revísalo e intenta de nuevo.")
}
