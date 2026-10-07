package xyz.bobbyprotocol.android.ui

import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.util.UUID
import kotlin.math.abs
import kotlin.math.max

internal data class PracticeFootprint(val columns: Int, val rows: Int)
internal data class PracticePlacement(val uid: String, val itemId: String, val col: Int, val row: Int, val rotation: Int = 0)
internal data class PracticeSnapshot(val placements: List<PracticePlacement>, val focusLevel: Int)
internal data class LandPracticeState(
    val placements: List<PracticePlacement>,
    val focusLevel: Int = 1,
    val history: List<PracticeSnapshot> = emptyList(),
)
internal enum class LandPracticeError { UNKNOWN_ITEM, INVALID_ID, OUTSIDE_ISLAND, FOGGED, OCCUPIED, MISSING_PIECE, NO_UNDO, INVALID_STATE }
internal sealed interface LandPracticeUpdate {
    data class Accepted(val state: LandPracticeState) : LandPracticeUpdate
    data class Rejected(val error: LandPracticeError) : LandPracticeUpdate
}

/** Guest-only local practice rules. No account, inventory entitlement, XP, growth or transport exists here. */
internal object LandPractice {
    const val size = 8
    private val uidPattern = Regex("[A-Za-z0-9_-]{1,100}")
    private val coreCells = setOf(3 to 3, 4 to 3, 3 to 4, 4 to 4)
    private val turns = setOf(0, 90, 180, 270)

    private fun integer(value: Any?): Int? = when (value) {
        is Int -> value
        is Long -> value.takeIf { it in Int.MIN_VALUE.toLong()..Int.MAX_VALUE.toLong() }?.toInt()
        else -> null
    }
    private fun string(value: Any?): String? = (value as? String)?.takeIf { it.isNotBlank() }
    private val jsonNumber = Regex("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?")
    /** org.json accepts JavaScript-like syntax; persisted practice accepts only bounded JSON tokens. */
    private fun standardJson(raw: String): Boolean {
        var index = 0; var depth = 0; var previous = ' '
        while (index < raw.length) {
            val char = raw[index]
            if (char == ' ' || char == '\n' || char == '\r' || char == '\t') { index++; continue }
            when (char) {
                '"' -> {
                    index++; var ended = false
                    while (index < raw.length) {
                        val next = raw[index++]
                        if (next.code < 32) return false
                        if (next == '\\') { if (index >= raw.length) return false; index++ }
                        else if (next == '"') { ended = true; break }
                    }
                    if (!ended) return false
                    previous = 'S'
                }
                '{', '[' -> { depth++; if (depth > 8) return false; previous = char; index++ }
                '}', ']' -> { if (previous == ',') return false; depth--; if (depth < 0) return false; previous = char; index++ }
                ':' -> { if (previous != 'S') return false; previous = char; index++ }
                ',' -> { previous = char; index++ }
                else -> {
                    val start = index
                    while (index < raw.length && raw[index] !in " \n\r\t{}[]:,") index++
                    val token = raw.substring(start, index)
                    if (token !in setOf("true", "false", "null") && !jsonNumber.matches(token)) return false
                    previous = 'L'
                }
            }
        }
        return depth == 0
    }
    private fun json(raw: String): JSONObject? = runCatching {
        if (raw.toByteArray(Charsets.UTF_8).size > 65_536 || !standardJson(raw)) return null
        val tokenizer = JSONTokener(raw)
        val root = tokenizer.nextValue() as? JSONObject ?: return null
        if (tokenizer.nextClean() != '\u0000') return null
        root
    }.getOrNull()
    private fun cells(p: PracticePlacement, catalog: Map<String, PracticeFootprint>): Set<Pair<Int, Int>>? {
        val footprint = catalog[p.itemId]?.takeIf { p.itemId != "aura_core" && it.columns in 1..4 && it.rows in 1..4 } ?: return null
        if (p.rotation !in turns || p.col !in 0 until size || p.row !in 0 until size) return null
        val flip = p.rotation == 90 || p.rotation == 270
        val width = if (flip) footprint.rows else footprint.columns
        val height = if (flip) footprint.columns else footprint.rows
        if (p.col + width > size || p.row + height > size) return null
        return (p.col until p.col + width).flatMap { x -> (p.row until p.row + height).map { y -> x to y } }.toSet()
    }
    private fun decoded(row: JSONObject, fixture: Boolean): PracticePlacement? {
        val uid = string(row.opt("uid"))?.takeIf { uidPattern.matches(it) } ?: return null
        val item = string(row.opt("itemId")) ?: return null
        val col = integer(row.opt("col")) ?: return null
        val y = integer(row.opt("row")) ?: return null
        val rotation = if (fixture) when (val orientation = row.opt("orientation")) {
            null, JSONObject.NULL, "ne_sw" -> 0
            "nw_se" -> 90
            else -> return null
        } else integer(row.opt("rotation")) ?: return null
        return PracticePlacement(uid, item, col, y, rotation)
    }
    private fun sanitize(rows: JSONArray, catalog: Map<String, PracticeFootprint>, fixture: Boolean): List<PracticePlacement>? {
        if (rows.length() > 256) return null
        val ids = mutableSetOf<String>()
        val occupied = coreCells.toMutableSet()
        val clean = mutableListOf<PracticePlacement>()
        for (index in 0 until rows.length()) {
            val placement = rows.optJSONObject(index)?.let { decoded(it, fixture) }
            val area = placement?.let { cells(it, catalog) }
            val valid = placement != null && area != null && placement.uid !in ids && area.none { it in occupied }
            if (!valid) { if (fixture) return null else continue }
            placement!!; area!!
            clean += placement; ids += placement.uid; occupied += area
        }
        return clean.toList()
    }

    /** Bad bundled fixtures stay unavailable; they never manufacture a guest island. */
    fun decodeFixture(raw: String, catalog: Map<String, PracticeFootprint>): LandPracticeState? {
        val root = json(raw) ?: return null
        if (integer(root.opt("version")) != 1 || integer(root.opt("gridSize")) != size || integer(root.opt("focusLevel")) != 1) return null
        val core = root.optJSONObject("core") ?: return null
        if (string(core.opt("itemId")) != "aura_core" || integer(core.opt("col")) != 3 || integer(core.opt("row")) != 3) return null
        val rows = root.optJSONArray("placements") ?: return null
        if (rows.length() != 7) return null
        val placements = sanitize(rows, catalog, fixture = true) ?: return null
        return LandPracticeState(placements)
    }

    /** Saved entries are sanitized independently, as on iOS; malformed top-level data restores the fixture. */
    fun load(saved: String?, catalog: Map<String, PracticeFootprint>, fixture: LandPracticeState): LandPracticeState {
        val root = saved?.let(::json) ?: return fixture.copy(history = emptyList())
        if (integer(root.opt("version")) != 1) return fixture.copy(history = emptyList())
        val focus = integer(root.opt("focusLevel")) ?: return fixture.copy(history = emptyList())
        val rows = root.optJSONArray("placements") ?: return fixture.copy(history = emptyList())
        val placements = sanitize(rows, catalog, fixture = false) ?: return fixture.copy(history = emptyList())
        return LandPracticeState(placements, focus.coerceIn(1, 2))
    }
    fun encode(state: LandPracticeState): String = JSONObject().put("version", 1).put("focusLevel", state.focusLevel)
        .put("placements", JSONArray(state.placements.map { p -> JSONObject().put("uid", p.uid).put("itemId", p.itemId)
            .put("col", p.col).put("row", p.row).put("rotation", p.rotation) })).toString()
    fun land(): JSONObject = JSONObject().put("size", size).put("core", JSONObject().put("x", 3).put("y", 3).put("stage", 1))
    fun revealRadius(state: LandPracticeState): Float = state.focusLevel + 1.5f
    private fun clean(state: LandPracticeState, catalog: Map<String, PracticeFootprint>): Boolean {
        if (state.focusLevel !in 1..2 || state.placements.size > 60 || state.history.size > 10) return false
        val occupied = coreCells.toMutableSet(); val ids = mutableSetOf<String>()
        return state.placements.all { p ->
            val area = cells(p, catalog)
            val valid = uidPattern.matches(p.uid) && ids.add(p.uid) && area != null && area.none { it in occupied }
            if (valid) occupied += area!!
            valid
        }
    }
    fun canPlace(state: LandPracticeState, itemId: String, col: Int, row: Int, rotation: Int, movingUID: String? = null,
                 catalog: Map<String, PracticeFootprint>): LandPracticeError? {
        if (!clean(state, catalog)) return LandPracticeError.INVALID_STATE
        val footprint = catalog[itemId]
        if (itemId == "aura_core" || footprint == null || footprint.columns !in 1..4 || footprint.rows !in 1..4) return LandPracticeError.UNKNOWN_ITEM
        val placement = PracticePlacement("preview", itemId, col, row, rotation)
        val area = cells(placement, catalog) ?: return LandPracticeError.OUTSIDE_ISLAND
        if (area.any { max(abs(it.first - 3.5f), abs(it.second - 3.5f)) > revealRadius(state) }) return LandPracticeError.FOGGED
        val occupied = coreCells + state.placements.filter { it.uid != movingUID }.flatMap { cells(it, catalog).orEmpty() }
        return if (area.any { it in occupied }) LandPracticeError.OCCUPIED else null
    }
    private fun checkpoint(state: LandPracticeState): List<PracticeSnapshot> =
        (state.history + PracticeSnapshot(state.placements.toList(), state.focusLevel)).takeLast(10)
    fun place(state: LandPracticeState, itemId: String, col: Int, row: Int, rotation: Int,
              catalog: Map<String, PracticeFootprint>, uid: String = UUID.randomUUID().toString()): LandPracticeUpdate {
        if (!uidPattern.matches(uid) || state.placements.any { it.uid == uid }) return LandPracticeUpdate.Rejected(LandPracticeError.INVALID_ID)
        canPlace(state, itemId, col, row, rotation, catalog = catalog)?.let { return LandPracticeUpdate.Rejected(it) }
        return LandPracticeUpdate.Accepted(state.copy(placements = state.placements + PracticePlacement(uid, itemId, col, row, rotation), history = checkpoint(state)))
    }
    fun move(state: LandPracticeState, uid: String, col: Int, row: Int, rotation: Int,
             catalog: Map<String, PracticeFootprint>): LandPracticeUpdate {
        val existing = state.placements.firstOrNull { it.uid == uid } ?: return LandPracticeUpdate.Rejected(LandPracticeError.MISSING_PIECE)
        canPlace(state, existing.itemId, col, row, rotation, uid, catalog)?.let { return LandPracticeUpdate.Rejected(it) }
        val next = existing.copy(col = col, row = row, rotation = rotation)
        if (next == existing) return LandPracticeUpdate.Accepted(state)
        return LandPracticeUpdate.Accepted(state.copy(placements = state.placements.map { if (it.uid == uid) next else it }, history = checkpoint(state)))
    }
    fun store(state: LandPracticeState, uid: String, catalog: Map<String, PracticeFootprint>): LandPracticeUpdate {
        if (!clean(state, catalog)) return LandPracticeUpdate.Rejected(LandPracticeError.INVALID_STATE)
        if (state.placements.none { it.uid == uid }) return LandPracticeUpdate.Rejected(LandPracticeError.MISSING_PIECE)
        return LandPracticeUpdate.Accepted(state.copy(placements = state.placements.filterNot { it.uid == uid }, history = checkpoint(state)))
    }
    fun reveal(state: LandPracticeState): LandPracticeUpdate = if (state.focusLevel !in 1..2) LandPracticeUpdate.Rejected(LandPracticeError.INVALID_STATE)
        else LandPracticeUpdate.Accepted(if (state.focusLevel == 2) state else state.copy(focusLevel = 2, history = checkpoint(state)))
    fun reset(state: LandPracticeState, fixture: LandPracticeState): LandPracticeUpdate =
        LandPracticeUpdate.Accepted(fixture.copy(history = checkpoint(state)))
    fun undo(state: LandPracticeState, catalog: Map<String, PracticeFootprint>): LandPracticeUpdate {
        val previous = state.history.lastOrNull() ?: return LandPracticeUpdate.Rejected(LandPracticeError.NO_UNDO)
        val restored = LandPracticeState(previous.placements.toList(), previous.focusLevel, state.history.dropLast(1))
        return if (clean(restored, catalog)) LandPracticeUpdate.Accepted(restored) else LandPracticeUpdate.Rejected(LandPracticeError.INVALID_STATE)
    }
}
