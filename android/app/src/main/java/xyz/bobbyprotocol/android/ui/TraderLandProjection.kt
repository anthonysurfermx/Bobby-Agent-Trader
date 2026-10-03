package xyz.bobbyprotocol.android.ui

import kotlin.math.floor
import kotlin.math.min

internal data class LandPoint(val x: Float, val y: Float)
internal data class LandSpriteArt(val anchorX: Float, val anchorY: Float, val left: Float, val right: Float)
internal data class LandSpriteFrame(val x: Float, val y: Float, val side: Float, val depth: Float, val flip: Boolean)

/** Canonical iOS GateLayout / web geometry.ts, in the same 860 x 720 canvas. */
internal class TraderLandProjection(val size: Int) {
    init { require(size in setOf(8, 10, 12, 16)) }
    val tileW = 92f * 8f / size
    val tileH = 46f * 8f / size
    private val originY = 391f - (size - 1) * tileH / 2f
    fun iso(col: Float, row: Float) = LandPoint(430f + (col - row) * tileW / 2f, originY + (col + row) * tileH / 2f)
    fun cellAt(x: Float, y: Float): Pair<Int, Int>? {
        if (!x.isFinite() || !y.isFinite()) return null
        val dx = (x - 430f) / (tileW / 2f)
        val dy = (y - originY) / (tileH / 2f)
        val col = floor((dx + dy) / 2f + .5f).toInt()
        val row = floor((dy - dx) / 2f + .5f).toInt()
        return (col to row).takeIf { col in 0 until size && row in 0 until size }
    }
    fun diamond(col: Int, row: Int, cols: Int = 1, rows: Int = 1): List<LandPoint> {
        val top = iso(col.toFloat(), row.toFloat())
        val right = iso((col + cols - 1).toFloat(), row.toFloat())
        val bottom = iso((col + cols - 1).toFloat(), (row + rows - 1).toFloat())
        val left = iso(col.toFloat(), (row + rows - 1).toFloat())
        return listOf(top.copy(y = top.y - tileH / 2), right.copy(x = right.x + tileW / 2), bottom.copy(y = bottom.y + tileH / 2), left.copy(x = left.x - tileW / 2))
    }
    fun sprite(col: Int, row: Int, width: Int, height: Int, rotation: Int, art: LandSpriteArt, dormant: Boolean = false): LandSpriteFrame {
        val flip = rotation == 90 || rotation == 270
        val cols = if (flip) height else width
        val rows = if (flip) width else height
        val center = iso(col + (cols - 1) / 2f, row + (rows - 1) / 2f)
        val ground = center.y + tileH * (cols + rows) / 4f
        val side = min(360f * 8f / size, tileW * (width + height) / 2f * .9f / (art.right - art.left).coerceAtLeast(.2f)) * if (dormant) .72f else 1f
        val anchor = if (flip) 1f - art.anchorX else art.anchorX
        return LandSpriteFrame(center.x - side * anchor, ground - side * art.anchorY, side, ground, flip)
    }
    companion object {
        val slab = listOf(LandPoint(430f, 207f), LandPoint(798f, 391f), LandPoint(430f, 575f), LandPoint(62f, 391f))
    }
}

/** A single transform for painting and hit testing, independent of screen density. */
internal data class TraderLandCamera(val width: Float, val height: Float, val zoom: Float = 1f, val panX: Float = 0f, val panY: Float = 0f) {
    val scale = min(width / 860f, height / 720f) * zoom
    val x = width / 2f - 430f * scale + panX
    val y = height / 2f - 360f * scale + panY
    val panLimitX = ((860f * scale - width) / 2f).coerceAtLeast(0f)
    val panLimitY = ((720f * scale - height) / 2f).coerceAtLeast(0f)
    fun clampPan(rawX: Float, rawY: Float) = LandPoint(
        if (rawX.isFinite()) rawX.coerceIn(-panLimitX, panLimitX) else 0f,
        if (rawY.isFinite()) rawY.coerceIn(-panLimitY, panLimitY) else 0f,
    )
    fun project(point: LandPoint) = LandPoint(point.x * scale + x, point.y * scale + y)
    fun unproject(point: LandPoint) = LandPoint((point.x - x) / scale, (point.y - y) / scale)
}

/** Exact anchors/content bounds for the bundled URLs in public/land/v1/gate-A/asset-manifest.json.
 * Existing PNG bytes are unchanged. Art is placed once per footprint, never as coordinate dots.
 */
internal object TraderLandSpriteCatalog {
    fun asset(id: String, stage: Int = 1): String {
        val safe = if (id == "axiom_archive_return_path") "axiom_archive_return_path_curve" else id
        return safe + if (safe == "aura_core") "_stage${if (stage == 0) 0 else 1}.png" else "_bloom.png"
    }
    val art = mapOf(
        "aura_core_stage0.png" to LandSpriteArt(0.5005f, 0.8735f, 0.2637f, 0.7373f),
        "aura_core_stage1.png" to LandSpriteArt(0.499f, 0.8901f, 0.2402f, 0.7583f),
        "crypto_bay_data_dock_bloom.png" to LandSpriteArt(0.498f, 0.8149f, 0.1455f, 0.8511f),
        "crypto_bay_water_walkway_bloom.png" to LandSpriteArt(0.5005f, 0.7715f, 0.1587f, 0.8423f),
        "crypto_bay_context_buoy_bloom.png" to LandSpriteArt(0.4985f, 0.7314f, 0.3149f, 0.6826f),
        "crypto_bay_candle_tower_bloom.png" to LandSpriteArt(0.499f, 0.8242f, 0.2471f, 0.751f),
        "crypto_bay_waiting_lighthouse_bloom.png" to LandSpriteArt(0.5132f, 0.894f, 0.1509f, 0.8755f),
        "evidence_mines_crystal_vein_rock_bloom.png" to LandSpriteArt(0.4971f, 0.8008f, 0.2305f, 0.7642f),
        "evidence_mines_open_tunnel_bloom.png" to LandSpriteArt(0.4883f, 0.7163f, 0.2407f, 0.7358f),
        "evidence_mines_lantern_drone_bloom.png" to LandSpriteArt(0.499f, 0.6338f, 0.4004f, 0.5981f),
        "evidence_mines_evidence_workshop_bloom.png" to LandSpriteArt(0.499f, 0.8901f, 0.2402f, 0.7583f),
        "evidence_mines_mother_crystal_bloom.png" to LandSpriteArt(0.5049f, 0.8296f, 0.2485f, 0.7617f),
        "thesis_citadel_wall_slab_bloom.png" to LandSpriteArt(0.499f, 0.7314f, 0.2158f, 0.7822f),
        "thesis_citadel_fortified_ramp_bloom.png" to LandSpriteArt(0.4937f, 0.7554f, 0.2095f, 0.7783f),
        "thesis_citadel_risk_shield_bloom.png" to LandSpriteArt(0.499f, 0.7783f, 0.3862f, 0.6123f),
        "thesis_citadel_double_gate_bloom.png" to LandSpriteArt(0.4805f, 0.8306f, 0.1768f, 0.7842f),
        "thesis_citadel_three_gate_citadel_bloom.png" to LandSpriteArt(0.499f, 0.854f, 0.1221f, 0.876f),
        "risk_reef_reef_tile_bloom.png" to LandSpriteArt(0.499f, 0.7363f, 0.1382f, 0.8599f),
        "risk_reef_blue_sluice_bloom.png" to LandSpriteArt(0.499f, 0.7891f, 0.1973f, 0.8008f),
        "risk_reef_dual_orbit_antenna_bloom.png" to LandSpriteArt(0.4976f, 0.7251f, 0.3179f, 0.6772f),
        "risk_reef_red_team_observatory_bloom.png" to LandSpriteArt(0.4985f, 0.8784f, 0.1167f, 0.8804f),
        "risk_reef_double_bridge_bloom.png" to LandSpriteArt(0.5034f, 0.7573f, 0.1743f, 0.833f),
        "axiom_archive_archive_ring_tile_bloom.png" to LandSpriteArt(0.4985f, 0.7715f, 0.1328f, 0.8647f),
        "axiom_archive_path_straight_bloom.png" to LandSpriteArt(0.499f, 0.7847f, 0.1587f, 0.8398f),
        "axiom_archive_return_path_curve_bloom.png" to LandSpriteArt(0.499f, 0.7842f, 0.1582f, 0.8398f),
        "axiom_archive_aura_flower_bloom.png" to LandSpriteArt(0.4995f, 0.771f, 0.3394f, 0.6597f),
        "axiom_archive_lit_archive_bloom.png" to LandSpriteArt(0.5366f, 0.7095f, 0.3149f, 0.7588f),
        "axiom_archive_base_ring_seal_bloom.png" to LandSpriteArt(0.499f, 0.8076f, 0.1519f, 0.8462f),
    )
}
