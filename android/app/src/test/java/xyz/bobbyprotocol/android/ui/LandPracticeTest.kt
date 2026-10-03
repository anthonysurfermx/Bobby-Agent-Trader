package xyz.bobbyprotocol.android.ui

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File

class LandPracticeTest {
    private val catalog = JSONArray(File("src/main/assets/traderland/practice-catalog.json").readText()).let { rows ->
        (0 until rows.length()).associate { index -> rows.getJSONObject(index).let { it.getString("id") to PracticeFootprint(it.getInt("footprint_w"), it.getInt("footprint_h")) } }
    }
    private val fixture = LandPractice.decodeFixture(File("src/main/assets/traderland/practice-fixture.json").readText(), catalog)!!
    private fun accepted(value: LandPracticeUpdate): LandPracticeState = (value as LandPracticeUpdate.Accepted).state
    private fun rejected(error: LandPracticeError, value: LandPracticeUpdate) { assertEquals(error, (value as LandPracticeUpdate.Rejected).error) }
    private fun empty(focus: Int = 2) = LandPracticeState(emptyList(), focus)
    private fun saved(vararg placements: JSONObject, focus: Any = 1): String = JSONObject().put("version", 1).put("focusLevel", focus).put("placements", JSONArray(placements.toList())).toString()
    private fun p(uid: Any = "one", item: Any = "crypto_bay_data_dock", x: Any = 1, y: Any = 1, rotation: Any = 0): JSONObject =
        JSONObject().put("uid", uid).put("itemId", item).put("col", x).put("row", y).put("rotation", rotation)

    @Test fun canonicalFixtureHasSevenPiecesAndFixedAwakeCore() {
        assertEquals(7, fixture.placements.size)
        assertEquals(1, fixture.focusLevel)
        assertEquals(listOf("context-buoy", "risk-antenna", "evidence-rock", "aura-flower", "risk-shield", "path-a", "path-b"), fixture.placements.map { it.uid })
        assertEquals(PracticePlacement("path-a", "axiom_archive_path_straight", 3, 2), fixture.placements[5])
        assertEquals(8, LandPractice.land().getInt("size"))
        assertEquals(1, LandPractice.land().getJSONObject("core").getInt("stage"))
        assertEquals(3, LandPractice.land().getJSONObject("core").getInt("x"))
    }
    @Test fun repeatedBlueprintsDoNotAcquireAccountOrInventoryMeaning() {
        val one = accepted(LandPractice.place(empty(), "crypto_bay_data_dock", 0, 0, 0, catalog, "one"))
        val two = accepted(LandPractice.place(one, "crypto_bay_data_dock", 1, 0, 0, catalog, "two"))
        assertEquals(2, two.placements.size)
        assertEquals(2, two.history.size)
        val json = JSONObject(LandPractice.encode(two))
        assertEquals(setOf("version", "focusLevel", "placements"), json.keys().asSequence().toSet())
    }
    @Test fun collisionsIncludeCoreAndEveryRotatedFootprint() {
        rejected(LandPracticeError.OCCUPIED, LandPractice.place(empty(), "crypto_bay_candle_tower", 2, 3, 0, catalog))
        val tower = accepted(LandPractice.place(empty(), "crypto_bay_candle_tower", 0, 0, 90, catalog, "tower"))
        rejected(LandPracticeError.OCCUPIED, LandPractice.place(tower, "crypto_bay_data_dock", 0, 1, 0, catalog))
        assertNull(LandPractice.canPlace(tower, "crypto_bay_data_dock", 1, 0, 0, catalog = catalog))
    }
    @Test fun rotationSwapsBoundsAndInvalidTurnsCannotPlace() {
        assertNull(LandPractice.canPlace(empty(), "crypto_bay_candle_tower", 7, 0, 90, catalog = catalog))
        assertEquals(LandPracticeError.OUTSIDE_ISLAND, LandPractice.canPlace(empty(), "crypto_bay_candle_tower", 7, 0, 0, catalog = catalog))
        for (rotation in listOf(45, -90, 360)) rejected(LandPracticeError.OUTSIDE_ISLAND, LandPractice.place(empty(), "crypto_bay_data_dock", 1, 1, rotation, catalog))
        rejected(LandPracticeError.OUTSIDE_ISLAND, LandPractice.place(empty(), "crypto_bay_data_dock", Int.MAX_VALUE, 1, 0, catalog))
    }
    @Test fun initialFocusRejectsFogUntilExplicitRevealAndUndoRestoresIt() {
        val first = empty(1)
        rejected(LandPracticeError.FOGGED, LandPractice.place(first, "crypto_bay_data_dock", 0, 1, 0, catalog))
        val revealed = accepted(LandPractice.reveal(first))
        assertEquals(3.5f, LandPractice.revealRadius(revealed), 0f)
        assertNull(LandPractice.canPlace(revealed, "crypto_bay_data_dock", 0, 1, 0, catalog = catalog))
        assertEquals(first, accepted(LandPractice.undo(revealed, catalog)))
        assertSame(revealed, accepted(LandPractice.reveal(revealed)))
    }
    @Test fun movingReusesOwnCellsWithoutCoveringAnotherPiece() {
        val tower = accepted(LandPractice.place(empty(), "crypto_bay_candle_tower", 0, 0, 0, catalog, "tower"))
        val two = accepted(LandPractice.place(tower, "crypto_bay_data_dock", 2, 0, 0, catalog, "dock"))
        assertEquals(90, accepted(LandPractice.move(two, "tower", 0, 0, 90, catalog)).placements.first().rotation)
        rejected(LandPracticeError.OCCUPIED, LandPractice.move(two, "tower", 1, 0, 0, catalog))
        assertSame(two, accepted(LandPractice.move(two, "tower", 0, 0, 0, catalog)))
    }
    @Test fun storeUndoAndResetPreserveTheExactPreviousLocalLayout() {
        val stored = accepted(LandPractice.store(fixture, "path-a", catalog))
        assertEquals(6, stored.placements.size)
        assertEquals(fixture, accepted(LandPractice.undo(stored, catalog)))
        val reset = accepted(LandPractice.reset(stored, fixture))
        assertEquals(fixture.placements, reset.placements)
        assertEquals(stored, accepted(LandPractice.undo(reset, catalog)))
    }
    @Test fun undoHistoryRemainsBoundedAtTenAndNoopMoveDoesNotSpendHistory() {
        var state = accepted(LandPractice.place(empty(), "crypto_bay_data_dock", 0, 0, 0, catalog, "one"))
        repeat(25) { state = accepted(LandPractice.move(state, "one", if (it % 2 == 0) 1 else 0, 0, 0, catalog)) }
        assertEquals(10, state.history.size)
        repeat(10) { state = accepted(LandPractice.undo(state, catalog)) }
        rejected(LandPracticeError.NO_UNDO, LandPractice.undo(state, catalog))
    }
    @Test fun invalidItemCoreMissingAndDuplicateIdentifiersFailClosed() {
        rejected(LandPracticeError.UNKNOWN_ITEM, LandPractice.place(empty(), "aura_core", 1, 1, 0, catalog))
        rejected(LandPracticeError.UNKNOWN_ITEM, LandPractice.place(empty(), "unknown", 1, 1, 0, catalog))
        rejected(LandPracticeError.INVALID_ID, LandPractice.place(empty(), "crypto_bay_data_dock", 1, 1, 0, catalog, "../escape"))
        val one = accepted(LandPractice.place(empty(), "crypto_bay_data_dock", 1, 1, 0, catalog, "one"))
        rejected(LandPracticeError.INVALID_ID, LandPractice.place(one, "crypto_bay_data_dock", 2, 1, 0, catalog, "one"))
        rejected(LandPracticeError.MISSING_PIECE, LandPractice.move(one, "missing", 2, 1, 0, catalog))
        rejected(LandPracticeError.MISSING_PIECE, LandPractice.store(one, "missing", catalog))
    }
    @Test fun persistedStateRoundTripsButLocalHistoryDoesNotPersist() {
        val state = accepted(LandPractice.store(fixture, "path-a", catalog))
        val loaded = LandPractice.load(LandPractice.encode(state), catalog, fixture)
        assertEquals(state.placements, loaded.placements)
        assertEquals(state.focusLevel, loaded.focusLevel)
        assertTrue(loaded.history.isEmpty())
    }
    @Test fun malformedTopLevelAndIncorrectTypesRestoreTheApprovedFixture() {
        for (raw in listOf("{}", "no JSON", "[]", saved(focus = true), saved(focus = "2"), saved().replace("\"focusLevel\":1", "\"focusLevel\":2.0"), saved() + " trailing", " ".repeat(65_537), "{version:1,focusLevel:1,placements:[]}", "{\"version\":1,\"focusLevel\":1,\"placements\":[],}", "{\"version\":+1,\"focusLevel\":1,\"placements\":[]}", saved().replace("\"version\"", "'version'"), "[".repeat(9) + "0" + "]".repeat(9))) {
            assertEquals(fixture, LandPractice.load(raw, catalog, fixture))
        }
    }
    @Test fun sanitizedSavedEntriesDropUnknownCoreDuplicatesCollisionsAndBadNumbers() {
        val loaded = LandPractice.load(saved(p(), p(uid = "one", x = 2), p(uid = "bad", item = "unknown"), p(uid = "core", item = "aura_core"),
            p(uid = "overlap", x = 1), p(uid = "fixed", x = 3, y = 3), p(uid = "outside", x = 8), p(uid = "turn", rotation = 45),
            p(uid = "bool", x = true), p(uid = "number", x = 99), p(uid = "two", x = 2)).replace("\"col\":99", "\"col\":2.0"), catalog, fixture)
        assertEquals(listOf("one", "two"), loaded.placements.map { it.uid })
    }
    @Test fun savedFocusClampsAndValidEmptyPracticeDoesNotBecomeTheSample() {
        val empty = LandPractice.load(saved(focus = 9), catalog, fixture)
        assertTrue(empty.placements.isEmpty()); assertEquals(2, empty.focusLevel)
        assertEquals(1, LandPractice.load(saved(focus = -9), catalog, fixture).focusLevel)
    }
    @Test fun corruptBundledFixtureCannotManufacturePractice() {
        val raw = File("src/main/assets/traderland/practice-fixture.json").readText()
        assertNull(LandPractice.decodeFixture(raw.replace("\"gridSize\": 8", "\"gridSize\": 12"), catalog))
        assertNull(LandPractice.decodeFixture(raw.replace("\"col\": 3", "\"col\": true"), catalog))
        assertNull(LandPractice.decodeFixture(raw.replace("crypto_bay_context_buoy", "not_bundled"), catalog))
        assertNull(LandPractice.decodeFixture(raw + " trailing", catalog))
    }
    @Test fun invalidCallerStateCannotBypassOccupancyOrHistoryIntegrity() {
        val invalid = empty().copy(placements = listOf(PracticePlacement("bad", "unknown", 1, 1)))
        rejected(LandPracticeError.INVALID_STATE, LandPractice.place(invalid, "crypto_bay_data_dock", 2, 2, 0, catalog))
        val badHistory = empty().copy(history = listOf(PracticeSnapshot(invalid.placements, 2)))
        rejected(LandPracticeError.INVALID_STATE, LandPractice.undo(badHistory, catalog))
    }
}
