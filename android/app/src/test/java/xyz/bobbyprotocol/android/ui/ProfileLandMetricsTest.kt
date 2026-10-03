package xyz.bobbyprotocol.android.ui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ProfileLandMetricsTest {
    @Test fun completeEmptyInventoryIsAConfirmedZeroPieces() {
        val result = ProfileLandMetrics.parse(world(JSONArray()).put("aura", 0))!!
        assertEquals(0, result.pieces)
        assertEquals(0, result.aura)
    }
    @Test fun seedsBloomedAndBuiltPiecesAllBelongToTheCountLikeTheCanonicalProfile() {
        val items = JSONArray().put(JSONObject().put("id", "seed-1").put("state", "seed"))
            .put(JSONObject().put("id", "piece-2").put("state", "bloomed"))
            .put(JSONObject().put("id", "piece-3").put("state", "bloomed").put("placed", true))
        assertEquals(3, ProfileLandMetrics.parse(world(items))!!.pieces)
        assertNull(ProfileLandMetrics.parse(world(items))!!.aura)
    }
    @Test fun partialErrorOrUnsupportedWorldNeverInventsMetrics() {
        assertNull(ProfileLandMetrics.parse(JSONObject().put("error", "unavailable")))
        assertNull(ProfileLandMetrics.parse(world(JSONArray()).put("ok", false)))
        assertNull(ProfileLandMetrics.parse(world(JSONArray()).removeInventory()))
        assertNull(ProfileLandMetrics.parse(world(JSONArray()).put("land", JSONObject().put("size", 100))))
    }
    @Test fun malformedInventoryIsNotPresentedAsEarnedPieces() {
        assertNull(ProfileLandMetrics.parse(world(JSONArray().put(JSONObject()))))
        assertNull(ProfileLandMetrics.parse(world(JSONArray().put("piece"))))
    }
    private fun world(items: JSONArray) = JSONObject().put("ok", true).put("land", JSONObject().put("size", 8)).put("inventory", items)
    private fun JSONObject.removeInventory(): JSONObject { remove("inventory"); return this }
}
