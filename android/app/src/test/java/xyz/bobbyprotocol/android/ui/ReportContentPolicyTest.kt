package xyz.bobbyprotocol.android.ui

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReportContentPolicyTest {
    @Test fun userTextAndKnownReasonAreRequired() {
        assertFalse(ReportContentPolicy.valid("  ", "offensive"))
        assertFalse(ReportContentPolicy.valid("ab", "offensive"))
        assertFalse(ReportContentPolicy.valid("abc", "unknown"))
        assertTrue(ReportContentPolicy.valid("  abc  ", "other"))
    }

    @Test fun messageMatchesServerLengthCeilingWithoutSplittingUnicode() {
        assertTrue(ReportContentPolicy.valid("x".repeat(2000), "misleading"))
        assertFalse(ReportContentPolicy.valid("x".repeat(2001), "misleading"))
        assertFalse(ReportContentPolicy.valid("😀😀", "other"))
        assertTrue(ReportContentPolicy.valid("😀😀😀", "other"))
        assertFalse(ReportContentPolicy.valid("😀".repeat(1001), "other"))
    }

    @Test fun payloadContainsOnlyExplicitTextAndApprovedMetadata() {
        val payload = ReportContentPolicy.payload("  I found offensive text.  ", "offensive", "es", "1.0.0")
        assertEquals(setOf("type", "page", "message", "context"), payload.keys().asSequence().toSet())
        assertEquals("I found offensive text.", payload.getString("message"))
        assertEquals("android:ai-content", payload.getString("page"))
        val context = payload.getJSONObject("context")
        assertEquals(setOf("kind", "reason", "language", "platform", "version"), context.keys().asSequence().toSet())
        assertEquals("ai_content_report", context.getString("kind"))
        assertFalse(payload.toString().contains("user_id"))
        assertFalse(payload.toString().contains("installation"))
        assertFalse(payload.toString().contains("email"))
        assertFalse(payload.toString().contains("question"))
    }

    @Test fun httpSuccessWithoutBothBooleanReceiptsNeverAcknowledgesSave() {
        assertFalse(ReportContentPolicy.saved(200, null))
        assertFalse(ReportContentPolicy.saved(200, JSONObject().put("ok", true)))
        assertFalse(ReportContentPolicy.saved(200, JSONObject().put("saved", true)))
        assertFalse(ReportContentPolicy.saved(200, JSONObject().put("ok", true).put("saved", false)))
        assertFalse(ReportContentPolicy.saved(200, JSONObject().put("ok", "true").put("saved", "true")))
    }

    @Test fun failureStatusCannotAcknowledgeSaveEvenWithTrueBody() {
        val receipt = JSONObject().put("ok", true).put("saved", true)
        assertFalse(ReportContentPolicy.saved(503, receipt))
        assertFalse(ReportContentPolicy.saved(429, receipt))
        assertFalse(ReportContentPolicy.saved(302, receipt))
        assertTrue(ReportContentPolicy.saved(200, receipt))
    }

    @Test fun publicTransportNeverAttachesAccountOrInstallationHeaders() {
        val request = PublicContentReportTransport().request(ReportContentPolicy.payload("Report text", "other", "en", "1.0.0"))
        assertEquals("/api/feedback", request.url.encodedPath)
        assertTrue(request.url.isHttps)
        assertNull(request.header("Authorization"))
        assertNull(request.header("x-bobby-device"))
        assertNull(request.header("x-bobby-memory-opt-in"))
        assertNull(request.header("Cookie"))
        assertEquals("POST", request.method)
    }
}
