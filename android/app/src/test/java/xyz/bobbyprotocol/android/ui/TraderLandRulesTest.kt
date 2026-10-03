package xyz.bobbyprotocol.android.ui

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class TraderLandRulesTest {
    private val land = JSONObject("""{"size":8,"core":{"x":3,"y":3,"stage":1}}""")

    @Test fun rotatedFootprintCannotCrossTheEdgeOrCore() {
        val draft = LandDraft("place", "inventory", "building", 2, 1)
        assertTrue(LandJson.fits(land, emptyList(), draft, 7, 0, 90))
        assertFalse(LandJson.fits(land, emptyList(), draft, 7, 0, 0))
        assertFalse(LandJson.fits(land, emptyList(), draft, 2, 3, 0))
        assertFalse(LandJson.fits(land, emptyList(), draft, 0, 0, 45))
    }

    @Test fun movingPieceMayUseItsOwnCellsButNotAnotherPiece() {
        val placed = LandPiece("placement", "inventory", "building", 0, 0, 0, 2, 1)
        val other = LandPiece("other", "other_inventory", "tower", 2, 0, 0, 1, 1)
        val moving = LandDraft("move", placed.placementId, placed.itemId, placed.width, placed.height)
        assertTrue(LandJson.fits(land, listOf(placed, other), moving, 0, 0, 90))
        assertFalse(LandJson.fits(land, listOf(placed, other), moving, 1, 0, 0))
        assertFalse(LandJson.fits(land, listOf(placed, other), moving.copy(action = "place"), 0, 0, 0))
    }

    @Test fun coreMayMoveFromItsOwnSpotButCannotCoverPieces() {
        val core = LandDraft("move_core", "", "aura_core", 2, 2)
        assertTrue(LandJson.fits(land, emptyList(), core, 3, 3, 0))
        val placed = LandPiece("p", "i", "tower", 0, 0, 0, 1, 1)
        assertFalse(LandJson.fits(land, listOf(placed), core, 0, 0, 0))
        val grown = JSONObject("""{"size":16,"core":{"x":7,"y":7,"stage":1}}""")
        assertTrue(LandJson.fits(grown, emptyList(), core, 14, 14, 0))
        assertFalse(LandJson.fits(grown, emptyList(), core, 15, 14, 0))
    }

    @Test fun accountAndPublicFootprintsUseRealCatalogContracts() {
        val account = JSONObject("""{"ok":true,"land":{"size":10},"inventory":[{"id":"i","item_id":"building","item":{"id":"building","footprint":[2,1]}}],"placements":[{"id":"p","inventory_id":"i","x":1,"y":2,"rotation":90}]}""")
        LandJson.requireWorld(account)
        val privatePiece = LandJson.pieces(account).single()
        assertTrue(privatePiece.contains(1, 3))
        assertFalse(privatePiece.contains(2, 2))
        val public = JSONObject("""{"ok":true,"world":{"size":10,"placements":[{"item_id":"building","x":1,"y":2,"rotation":90}]},"catalog":[{"id":"building","footprint_w":2,"footprint_h":1}]}""")
        assertEquals(privatePiece.width, LandJson.pieces(public, public = true).single().width)
    }

    @Test fun seedExtensionOnlyUsesServerOfferedUpwardHorizons() {
        assertEquals(listOf(72, 168), LandJson.extensionOptions(JSONObject("""{"hours":24,"extendable":true,"extendTo":[168,24,72,999,72]}""")))
        assertEquals(listOf(168), LandJson.extensionOptions(JSONObject("""{"hours":72,"extendable":true,"extendTo":[72,168]}""")))
        assertTrue(LandJson.extensionOptions(JSONObject("""{"hours":24,"extendable":false,"extendTo":[72,168]}""")).isEmpty())
    }

    @Test fun blockedCreatorHasStableStrictCodeAndCorruptPrefsAreEmpty() {
        assertEquals("abc123def4", LandJson.shareCode(" ABC123DEF4 "))
        assertNull(LandJson.shareCode("../../private"))
        assertEquals(mapOf("abc123def4" to "Renamed island"), LandJson.blocked("""{"abc123def4":"Renamed island","showcase-satoshi":"Example","invalid":"No"}"""))
        assertTrue(LandJson.blocked("not JSON").isEmpty())
    }
}
