package xyz.bobbyprotocol.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import xyz.bobbyprotocol.android.BuildConfig
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

fun reportContentTitle(language: String): String = ReportContentCopy.text("title", language)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportContentSheet(session: NucleoSession, repository: BobbyRepository, onClose: () -> Unit) {
    val scope = rememberCoroutineScope()
    val transport = remember { PublicContentReportTransport() }
    var message by remember { mutableStateOf("") }
    var reason by remember { mutableStateOf("offensive") }
    var busy by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf(false) }
    var failed by remember { mutableStateOf(false) }
    fun copy(key: String) = ReportContentCopy.text(key, session.language)
    val consent = session.riskAccepted && repository.allowsExternalProcessing()

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = Color(0xFF0C0F13), contentColor = MaterialTheme.colorScheme.onSurface) {
        DarkSheetSystemBars()
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(copy("title"), style = MaterialTheme.typography.headlineSmall)
                TextButton(onClick = onClose) { Text(session.text("Close", "Cerrar")) }
            }
            Text(copy("notice"), style = MaterialTheme.typography.bodySmall)
            if (!consent) Text(session.text("Accept the risk notice before using Bobby.", "Acepta el aviso de riesgo antes de usar Bobby."))
            if (saved) {
                Text(copy("saved"), color = Color(0xFF80D9A8))
            } else {
                Text(copy("reason"), style = MaterialTheme.typography.titleMedium)
                ReportContentPolicy.reasons.forEach { value ->
                    Row(Modifier.fillMaxWidth()) {
                        RadioButton(selected = reason == value, onClick = { if (!busy) reason = value }, enabled = !busy)
                        TextButton(enabled = !busy, onClick = { reason = value }) { Text(copy(value)) }
                    }
                }
                OutlinedTextField(value = message, onValueChange = { if (it.length <= ReportContentPolicy.MAX_MESSAGE) { message = it; failed = false } },
                    label = { Text(copy("details")) }, modifier = Modifier.fillMaxWidth(), minLines = 3, maxLines = 8, enabled = !busy,
                    supportingText = { Text("${message.length}/${ReportContentPolicy.MAX_MESSAGE}") })
                if (failed) Text(copy("failed"), color = MaterialTheme.colorScheme.error)
                Button(enabled = consent && !busy && ReportContentPolicy.valid(message, reason), onClick = {
                    if (busy || !session.riskAccepted || !repository.allowsExternalProcessing()) return@Button
                    val payload = ReportContentPolicy.payload(message, reason, session.language, BuildConfig.VERSION_NAME)
                    busy = true; failed = false
                    scope.launch {
                        try {
                            val receipt = transport.send(payload)
                            if (!receipt) { failed = true } else { saved = true; message = "" }
                        } catch (cancelled: CancellationException) { throw cancelled }
                        catch (_: Exception) { failed = true }
                        finally { busy = false }
                    }
                }) { Text(copy(if (busy) "sending" else "send")) }
            }
        }
    }
}

/** Public feedback transport intentionally omits BobbyRepository's optional account bearer/device header. */
internal class PublicContentReportTransport {
    private val client = OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).callTimeout(20, TimeUnit.SECONDS).build()
    private val endpoint = BuildConfig.API_BASE_URL.trimEnd('/').toHttpUrl().also {
        require(it.isHttps && it.encodedPath == "/" && it.query == null && it.fragment == null && it.username.isEmpty() && it.password.isEmpty())
    }.resolve("api/feedback")!!

    internal fun request(payload: JSONObject): Request = Request.Builder().url(endpoint).header("Accept", "application/json")
            .header("Cache-Control", "no-store")
            .post(payload.toString().toRequestBody("application/json; charset=utf-8".toMediaType())).build()

    suspend fun send(payload: JSONObject): Boolean = suspendCancellableCoroutine { continuation ->
        val call = client.newCall(request(payload))
        continuation.invokeOnCancellation { call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) {
                if (continuation.isActive) continuation.resumeWithException(error)
            }
            override fun onResponse(call: Call, response: Response) {
                try {
                    val confirmed = response.use {
                        val source = it.body?.source()
                        val text = if (source != null && !source.request(8193)) source.readUtf8() else null
                        ReportContentPolicy.saved(it.code, text?.let { raw -> runCatching { JSONObject(raw) }.getOrNull() })
                    }
                    if (continuation.isActive) continuation.resume(confirmed)
                } catch (error: Exception) {
                    if (continuation.isActive) continuation.resumeWithException(error)
                }
            }
        })
    }
}

private object ReportContentCopy {
    private fun values(en: String, es: String, fr: String, pt: String, it: String, de: String) = listOf(en, es, fr, pt, it, de)
    private val copy = mapOf(
        "title" to values("Report AI content", "Reportar contenido de IA", "Signaler un contenu IA", "Reportar conteúdo de IA", "Segnala contenuti IA", "KI-Inhalt melden"),
        "notice" to values(
            "Sending shares only the text you write, the selected reason, language and app version with Bobby’s private support queue. It does not attach your questions, account or email. Support notifications may be sent through its email provider when configured. Do not include passwords or financial account details.",
            "Al enviar, solo compartes el texto que escribas, motivo, idioma y versión con la cola privada de soporte de Bobby. No adjunta tus preguntas, cuenta ni correo. Si está configurado, su proveedor de correo puede enviar avisos al equipo. No incluyas contraseñas ni datos de cuentas financieras.",
            "L’envoi partage uniquement votre texte, le motif, la langue et la version de l’app avec le support privé de Bobby. Vos questions, compte et e-mail ne sont pas joints. Un fournisseur e-mail peut notifier l’équipe s’il est configuré. N’incluez ni mots de passe ni coordonnées financières.",
            "O envio partilha apenas o texto que escrever, motivo, idioma e versão com o suporte privado do Bobby. Não anexa perguntas, conta ou e-mail. O fornecedor de e-mail pode avisar a equipa se estiver configurado. Não inclua palavras-passe nem dados de contas financeiras.",
            "L’invio condivide solo il testo scritto, il motivo, la lingua e la versione con l’assistenza privata di Bobby. Non allega domande, account o e-mail. Il fornitore e-mail può avvisare il team se configurato. Non includere password o dati di conti finanziari.",
            "Gesendet werden nur dein Text, der Grund, die Sprache und App-Version an Bobbys privaten Support. Fragen, Konto und E-Mail werden nicht angehängt. Ein eingerichteter E-Mail-Anbieter kann das Team benachrichtigen. Gib keine Passwörter oder Finanzkontodaten an."),
        "reason" to values("Reason", "Motivo", "Motif", "Motivo", "Motivo", "Grund"),
        "details" to values("Describe the content (3–2000 characters)", "Describe el contenido (3–2000 caracteres)", "Décrivez le contenu (3–2000 caractères)", "Descreva o conteúdo (3–2000 caracteres)", "Descrivi il contenuto (3–2000 caratteri)", "Beschreibe den Inhalt (3–2000 Zeichen)"),
        "offensive" to values("Offensive content or harassment", "Contenido ofensivo o acoso", "Contenu offensant ou harcèlement", "Conteúdo ofensivo ou assédio", "Contenuti offensivi o molestie", "Anstößiger Inhalt oder Belästigung"),
        "misleading" to values("Misleading or dangerous content", "Contenido engañoso o peligroso", "Contenu trompeur ou dangereux", "Conteúdo enganador ou perigoso", "Contenuti ingannevoli o pericolosi", "Irreführender oder gefährlicher Inhalt"),
        "other" to values("Other", "Otro", "Autre", "Outro", "Altro", "Anderes"),
        "send" to values("Send report", "Enviar reporte", "Envoyer le signalement", "Enviar reporte", "Invia segnalazione", "Meldung senden"),
        "sending" to values("Sending…", "Enviando…", "Envoi…", "A enviar…", "Invio…", "Wird gesendet…"),
        "saved" to values("Your report was saved privately for review.", "Tu reporte se guardó de forma privada para revisión.", "Votre signalement privé a été enregistré pour examen.", "O seu reporte foi guardado de forma privada para revisão.", "La segnalazione è stata salvata privatamente per la revisione.", "Deine Meldung wurde privat zur Prüfung gespeichert."),
        "failed" to values("We could not confirm your report was saved. Your text remains here; try again.", "No pudimos confirmar que se guardara. Tu texto sigue aquí; intenta de nuevo.", "L’enregistrement n’a pas été confirmé. Votre texte est conservé ici ; réessayez.", "Não foi possível confirmar o reporte. O texto continua aqui; tente novamente.", "Il salvataggio non è stato confermato. Il testo resta qui; riprova.", "Das Speichern wurde nicht bestätigt. Dein Text bleibt hier; versuche es erneut."),
    )
    fun text(key: String, language: String): String = copy.getValue(key)[listOf("en", "es", "fr", "pt", "it", "de").indexOf(language).coerceAtLeast(0)]
}
