package xyz.bobbyprotocol.android.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.util.UUID

/** Narrow user-selected facts only; never persist a transcript, bearer or financial fact locally. */
data class FinancialContextItem(val category: String, val summary: String, val amount: Double? = null,
                                val currency: String? = null, val observedAt: String? = null) {
    fun json(): JSONObject = JSONObject().put("category", category).put("summary", summary).apply {
        amount?.let { put("amount", it) }; currency?.let { put("currency", it) }; observedAt?.let { put("observedAt", it) }
    }
}
data class FinancialChatGPTConnection(val connected: Boolean, val scopes: List<String>, val available: Boolean)

object FinancialContextPolicy {
    val categories = listOf("goal", "income", "expense", "debt", "asset", "preference", "transaction")
    const val MAX_BYTES = 16_384
    const val exportPrompt = "Prepare only the financial facts I explicitly choose to share with Bobby from this conversation. Ask me which facts if I have not selected them. Do not access or reconstruct my full chat history. Do not include raw messages, names, account/card numbers, passwords, credentials, or anything unrelated to my chosen financial task. Do not infer facts or describe reported transactions as verified. Return only JSON, without markdown, in this format: {\"format\":\"bobby-context-v1\",\"items\":[{\"category\":\"goal\",\"summary\":\"Build an emergency fund\",\"amount\":3000,\"currency\":\"EUR\"}]}. Replace the example with my chosen facts. Include observedAt as YYYY-MM-DD only if I supplied the real date; never invent a date, and omit unknown amounts, currencies and dates. Allowed categories: goal, income, expense, debt, asset, preference, transaction. Each summary is one line, at most 240 characters; at most 20 items. Amounts are nonnegative numbers and require a three-letter uppercase currency. I will review and approve them in Bobby before saving."
    private val fields = setOf("category", "summary", "amount", "currency", "observedAt")
    private val sensitive = listOf(
        Regex("\\b(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+)\\b"),
        Regex("\\b[A-Z]{2}\\d{2}[A-Z0-9 ]{11,30}\\b", RegexOption.IGNORE_CASE),
        Regex("\\b(?:\\d[ -]?){13,19}\\b"), Regex("-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    )
    fun parseImport(text: String): List<FinancialContextItem> {
        require(text.toByteArray(Charsets.UTF_8).size <= MAX_BYTES)
        val clean = text.trim().replace(Regex("^```(?:json)?\\s*", RegexOption.IGNORE_CASE), "").replace(Regex("\\s*```$"), "")
        val root = JSONObject(clean)
        require(root.keys().asSequence().toSet() == setOf("format", "items") && root.opt("format") == "bobby-context-v1")
        return parseItems(root.getJSONArray("items"))
    }
    fun parseItems(items: JSONArray): List<FinancialContextItem> {
        require(items.length() in 1..20)
        return (0 until items.length()).map { parseItem(items.getJSONObject(it)) }
    }
    fun parseItem(row: JSONObject): FinancialContextItem {
        require(row.keys().asSequence().toSet().all { it in fields })
        val category = row.opt("category") as? String ?: error("invalid_category")
        require(category in categories)
        val summary = (row.opt("summary") as? String)?.trim() ?: error("invalid_summary")
        require(summary.length in 3..240 && summary.none { it.code in 0..31 || it.code == 127 } && sensitive.none { it.containsMatchIn(summary) })
        val amount = if (row.has("amount")) {
            val raw = row.opt("amount") as? Number ?: error("invalid_amount")
            raw.toDouble().also { require(it.isFinite() && it in 0.0..1e12) }
        } else null
        val currency = if (row.has("currency")) (row.opt("currency") as? String)?.also { require(Regex("^[A-Z]{3}$").matches(it)) }
            ?: error("invalid_currency") else null
        require(amount == null || currency != null)
        val date = if (row.has("observedAt")) (row.opt("observedAt") as? String)?.also {
            require(Regex("^\\d{4}-\\d{2}-\\d{2}$").matches(it) && LocalDate.parse(it).toString() == it)
        } ?: error("invalid_date") else null
        return FinancialContextItem(category, summary, amount, currency, date)
    }
    fun importBody(items: List<FinancialContextItem>, consent: Boolean, requestId: String, draftId: String?): JSONObject {
        require(consent); uuid(requestId); draftId?.let(::uuid)
        val checked = parseItems(JSONArray(items.map { it.json() }))
        return JSONObject().put("action", "import").put("items", JSONArray(checked.map { it.json() }))
            .put("consent", true).put("requestId", requestId).apply { draftId?.let { put("draftId", it) } }
    }
    fun uuid(value: String): String { require(UUID.fromString(value).toString().equals(value, ignoreCase = true)); return value }
    fun state(json: JSONObject): JSONObject {
        require(json.opt("enabled") is Boolean && json.opt("financialMemoryEnabled") is Boolean && json.opt("accountMemoryEnabled") is Boolean && json.optJSONArray("items") != null && json.optJSONArray("drafts") != null && json.optJSONArray("recommendations") != null)
        return json
    }
    fun connection(json: JSONObject): FinancialChatGPTConnection {
        require(json.opt("connected") is Boolean && json.opt("available") is Boolean)
        val scopes = json.getJSONArray("scopes")
        val checked = (0 until scopes.length()).map {
            val scope = scopes.get(it) as? String ?: error("invalid_connection_scope")
            require(scope in setOf("bobby.context.read", "bobby.context.write")); scope
        }
        return FinancialChatGPTConnection(json.getBoolean("connected"), checked.distinct(), json.getBoolean("available"))
    }
    fun errorMessage(failure: Exception, t: (String, String) -> String): String {
        val api = failure as? ApiException
        return when (if (api?.status == 401) "signin_required" else api?.code) {
            "context_paused" -> t("Context is paused. Resume it before saving.", "El contexto está en pausa. Reanúdalo antes de guardar.")
            "draft_unavailable" -> t("The draft expired or was deleted. Refresh and review again.", "El borrador caducó o se eliminó. Actualiza y revisa de nuevo.")
            "context_limit" -> t("Your account can store up to 50 financial facts. Delete a saved fact or select fewer facts before saving.", "Tu cuenta admite hasta 50 datos financieros. Borra un dato guardado o selecciona menos datos antes de guardar.")
            "duplicate_context" -> t("This correction matches another saved fact. Keep one copy or change the correction.", "Esta corrección coincide con otro dato guardado. Conserva una copia o cambia la corrección.")
            "request_conflict" -> t("This save attempt was already used for different facts. Review the selected facts again before saving.", "Este intento de guardado ya se usó para otros datos. Vuelve a revisar los datos seleccionados antes de guardar.")
            "item_unavailable" -> t("This saved fact was deleted. Refresh before correcting it.", "Este dato guardado se eliminó. Actualiza antes de corregirlo.")
            "invalid_context", "context_too_large" -> t("Use the exact Bobby JSON format with 1–20 facts, summaries up to 240 characters, and valid amounts, currencies and dates.", "Usa el formato JSON exacto de Bobby con 1–20 datos, resúmenes de hasta 240 caracteres e importes, monedas y fechas válidos.")
            "signin_required" -> t("Sign in to your Bobby account first.", "Primero inicia sesión en tu cuenta de Bobby.")
            else -> t("Context could not be loaded or saved. Try again.", "No se pudo cargar o guardar el contexto. Intenta de nuevo.")
        }
    }
    fun recommendationText(rec: JSONObject): String = listOf(
        "Bobby recommendation · ${rec.getString("symbol")}", "Market data as of: ${rec.getString("asOf")}", "Saved: ${rec.getString("createdAt")}", rec.getString("headline"),
        "Why: ${rec.getString("why")}", "Risk: ${rec.getString("risk")}", "Watch: ${rec.getString("watch")}",
        "Verdict: ${rec.getString("verdict")}", "Direction: ${rec.getString("direction")}",
        "This is a dated market analysis, not a verified financial statement. Discuss this recommendation with me.",
    ).joinToString("\n")
}

suspend fun BobbyRepository.financialContext(ownerUserId: String, ownerEpoch: Long, method: String = "GET", body: JSONObject? = null, query: String = ""): JSONObject {
    require(method in setOf("GET", "POST", "PATCH", "DELETE"))
    require(query.isEmpty() || query == "scope=all" || query.startsWith("id=") || query.startsWith("draftId="))
    if (query.isNotEmpty() && query != "scope=all") FinancialContextPolicy.uuid(query.substringAfter('='))
    return FinancialContextPolicy.state(requestForAccount(ownerUserId, ownerEpoch, "api/financial-context" + if (query.isEmpty()) "" else "?$query", method, body))
}

/** Explicit native connection management; financial pause never revokes a grant implicitly. */
suspend fun BobbyRepository.financialChatGPTConnection(ownerUserId: String, ownerEpoch: Long, revoke: Boolean = false): FinancialChatGPTConnection =
    FinancialContextPolicy.connection(requestForAccount(ownerUserId, ownerEpoch,
        if (revoke) "api/chatgpt?op=revoke" else "api/chatgpt?op=connection",
        if (revoke) "POST" else "GET", if (revoke) JSONObject() else null))
