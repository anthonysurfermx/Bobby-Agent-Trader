package xyz.bobbyprotocol.android.data

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.util.UUID

class FinancialContextPolicyTest {
    private fun imported(item: String) = FinancialContextPolicy.parseImport("{\"format\":\"bobby-context-v1\",\"items\":[$item]}")
    private fun rejected(action: () -> Unit) { try { action(); fail("Expected rejection") } catch (_: IllegalArgumentException) {} catch (_: IllegalStateException) {} catch (_: org.json.JSONException) {} catch (_: java.time.DateTimeException) {} }
    @Test fun selectedFactPreservesAmountCurrencyAndRealDate() {
        val item = imported("""{"category":"goal","summary":"Emergency fund","amount":3000,"currency":"EUR","observedAt":"2024-02-29"}""").single()
        assertEquals(3000.0, item.amount!!, 0.0); assertEquals("2024-02-29", item.observedAt)
        assertEquals(setOf("category", "summary", "amount", "currency", "observedAt"), item.json().keys().asSequence().toSet())
    }
    @Test fun rejectsTranscriptFieldsSecretsIdentifiersAndControlCharacters() {
        for (item in listOf("""{"category":"goal","summary":"Build savings","transcript":"private chat"}""",
            """{"category":"goal","summary":"Card 4242424242424242"}""", """{"category":"goal","summary":"Account DE89370400440532013000"}""",
            """{"category":"goal","summary":"Bearer eyJabc.defghi.xyzabc"}""", """{"category":"goal","summary":"first\nsecond"}""")) rejected { imported(item) }
        rejected { FinancialContextPolicy.parseImport("""{"format":"bobby-context-v1","items":[],"history":[]}""") }
    }
    @Test fun rejectsInvalidAmountsCurrenciesDatesAndCounts() {
        for (item in listOf("""{"category":"transaction","summary":"Rent paid","observedAt":"2025-02-29"}""",
            """{"category":"expense","summary":"Rent paid","amount":12}""", """{"category":"expense","summary":"Rent paid","amount":true,"currency":"EUR"}""",
            """{"category":"expense","summary":"Rent paid","amount":-1,"currency":"EUR"}""", """{"category":"expense","summary":"Rent paid","amount":1000000000001,"currency":"EUR"}""",
            """{"category":"expense","summary":"Rent paid","currency":"eur"}""")) rejected { imported(item) }
        val fact = """{"category":"preference","summary":"Keep savings liquid"}"""
        rejected { imported(List(21) { fact }.joinToString(",")) }
        rejected { FinancialContextPolicy.parseImport("é".repeat(9000)) }
        assertEquals(1, FinancialContextPolicy.parseImport("```json\n{\"format\":\"bobby-context-v1\",\"items\":[$fact]}\n```").size)
    }
    @Test fun saveRequiresConsentAndUsesStableRequestIdAndSelectedDraft() {
        val id = UUID.randomUUID().toString(); val draft = UUID.randomUUID().toString()
        val items = imported("""{"category":"goal","summary":"Emergency fund"}""")
        rejected { FinancialContextPolicy.importBody(items, false, id, draft) }
        rejected { FinancialContextPolicy.importBody(items, true, "invalid", draft) }
        val body = FinancialContextPolicy.importBody(items, true, id, draft)
        assertTrue(body.getBoolean("consent")); assertEquals(id, body.getString("requestId")); assertEquals(draft, body.getString("draftId"))
        assertEquals(setOf("action", "items", "consent", "requestId", "draftId"), body.keys().asSequence().toSet())
    }
    @Test fun missingOrMalformedStateIsNeverShownAsEmptyAndNoAuthInRecommendationExport() {
        rejected { FinancialContextPolicy.state(JSONObject()) }
        rejected { FinancialContextPolicy.state(JSONObject().put("enabled", "false")) }
        val rec = JSONObject().put("symbol", "BTC").put("asOf", "2026-10-04T10:00:00Z").put("createdAt", "2026-10-04T10:01:00Z").put("headline", "Wait for confirmation")
            .put("why", "Volatile").put("risk", "Drawdown").put("watch", "Volume").put("verdict", "wait").put("direction", "none").put("accessToken", "secret")
        val text = FinancialContextPolicy.recommendationText(rec)
        assertTrue(text.contains("2026-10-04T10:00:00Z")); assertFalse(text.contains("secret")); assertFalse(text.contains("accessToken"))
    }
    @Test fun actualApiConflictCodesGiveSpecificRecoveryMessagesInBothLanguages() {
        fun message(code: String, spanish: Boolean): String {
            val body = JSONObject().put("code", code)
            return FinancialContextPolicy.errorMessage(ApiException(409, BobbyParsers.machineCode(body), body)) { en, es -> if (spanish) es else en }
        }
        assertTrue(message("draft_unavailable", false).contains("draft expired"))
        assertTrue(message("draft_unavailable", true).contains("borrador caducó"))
        assertTrue(message("context_limit", false).contains("50 financial facts"))
        assertTrue(message("context_limit", true).contains("50 datos financieros"))
        assertTrue(message("duplicate_context", false).contains("another saved fact"))
        assertTrue(message("duplicate_context", true).contains("otro dato guardado"))
        assertTrue(message("request_conflict", false).contains("different facts"))
        assertTrue(message("request_conflict", true).contains("otros datos"))
        assertFalse(message("unknown_conflict", false).contains("draft"))
    }
    @Test fun connectionContractRemainsAvailableForRevokeWhenConnectorIsOffAndContainsNoBearer() {
        val json = JSONObject().put("connected", true).put("available", false)
            .put("scopes", org.json.JSONArray().put("bobby.context.read")).put("accessToken", "must-not-enter-controls")
        val state = FinancialContextPolicy.connection(json)
        assertTrue(state.connected); assertFalse(state.available); assertEquals(listOf("bobby.context.read"), state.scopes)
        assertFalse(state.toString().contains("must-not-enter-controls"))
        val revoked = FinancialContextPolicy.connection(JSONObject().put("connected", false).put("available", false).put("scopes", org.json.JSONArray()))
        assertFalse(revoked.connected); assertTrue(revoked.scopes.isEmpty())
        rejected { FinancialContextPolicy.connection(JSONObject().put("connected", "false").put("available", true).put("scopes", org.json.JSONArray())) }
        rejected { FinancialContextPolicy.connection(JSONObject().put("connected", true).put("available", true).put("scopes", org.json.JSONArray().put("arbitrary"))) }
    }
}
