package xyz.bobbyprotocol.android.ui

import java.text.BreakIterator
import java.util.Locale
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min

internal data class LandArchipelagoBounds(val x: Float, val y: Float, val width: Float, val height: Float) {
    val centerY: Float get() = y + height / 2f
}

/** The canonical iOS axial island lattice and camera geometry, without network or account state. */
internal object LandArchipelago {
    const val slotCount = 60
    const val firstRingCount = 6
    const val labelWorldY = 607f // 391 slab center + 184 half-height + 22 depth + 10 margin.
    const val ownIndex = -1
    const val minZoom = .22f
    const val seaZoom = .75f
    const val overviewThreshold = .6f
    const val visitZoom = .9f
    const val cardLift = 115f
    private const val spacing = 14f
    private val directions = listOf(1 to 0, 1 to -1, 0 to -1, -1 to 0, -1 to 1, 0 to 1)
    private val slots: List<Pair<Int, Int>> = buildList {
        for (ring in 1..4) {
            var q = -ring
            var r = ring
            val walk = buildList {
                for ((dq, dr) in directions) repeat(ring) {
                    add(q to r)
                    q += dq
                    r += dr
                }
            }
            addAll(walk.sortedBy { (a, b) ->
                var angle = atan2((a - b).toDouble(), 2.0 * (a + b)) + PI / 2.0
                if (angle < -1e-9) angle += 2 * PI
                if (angle >= 2 * PI - 1e-9) angle -= 2 * PI
                angle
            })
        }
    }

    /** Four rings, clockwise from straight up; indices beyond the lattice use its final slot. */
    fun offset(index: Int): LandPoint {
        require(index >= 0)
        val (q, r) = slots[min(index, slots.lastIndex)]
        return LandPoint((q + r) * 92f / 2f * spacing, (q - r) * 46f / 2f * spacing)
    }

    /** Only unoccupied ring-one slots become free lots, after the public read succeeded. */
    fun freeLots(islandCount: Int, showLots: Boolean): List<LandPoint> {
        require(islandCount >= 0)
        return if (showLots && islandCount < firstRingCount) (islandCount until firstRingCount).map(::offset) else emptyList()
    }

    /** Camera bounds include lots; visiting and hit testing continue to use only real islands. */
    fun sceneOffsets(islandOffsets: List<LandPoint>, showLots: Boolean): List<LandPoint> =
        islandOffsets + freeLots(islandOffsets.size, showLots)

    /** The native Canvas chip has the same 24-character budget as the canonical iOS label. */
    fun shortTitle(title: String): String {
        val characters = BreakIterator.getCharacterInstance(Locale.ROOT).apply { setText(title) }
        var count = 0
        var prefixEnd = 0
        var end = characters.first()
        while (end != BreakIterator.DONE) {
            if (count == 23) prefixEnd = end
            if (count > 24) return title.substring(0, prefixEnd) + "…"
            end = characters.next(); count++
        }
        return title
    }

    // Tall art above, the fixed slab below and the bottom label must fit together.
    val ringOneBounds = LandArchipelagoBounds(-1012f, -988f, 2024f, 1876f)

    /** Screen-space lift/margins are canonical points (dp), converted to Canvas pixels once. */
    fun targetPan(offset: LandPoint, camera: TraderLandCamera, lift: Float = cardLift, screenUnit: Float = 1f): LandPoint = LandPoint(
        -offset.x * camera.scale,
        -(offset.y + 391f - 335f) * camera.scale - lift * screenUnit,
    )

    fun overviewZoom(width: Float, height: Float, cameraFit: Float, screenUnit: Float = 1f, lift: Float = cardLift): Float {
        if (!width.isFinite() || !height.isFinite() || !cameraFit.isFinite() || cameraFit <= 0f || !screenUnit.isFinite() || screenUnit <= 0f || !lift.isFinite() || lift < 0f) return minZoom
        val wide = (width - 16f * screenUnit) / (ringOneBounds.width * cameraFit)
        val tall = (height - (2f * lift + 24f) * screenUnit) / (ringOneBounds.height * cameraFit)
        return min(.5f, max(minZoom, min(wide, tall)))
    }

    /** Null means the own island wins. Call while zoom > seaZoom to refocus a pinch. */
    fun nearestIsland(pan: LandPoint, camera: TraderLandCamera, offsets: List<LandPoint>, screenUnit: Float = 1f, lift: Float = cardLift): Int? {
        if (camera.scale <= 0f || !pan.x.isFinite() || !pan.y.isFinite()) return null
        fun distance(target: LandPoint): Float = abs(pan.x - target.x) / (736f * camera.scale) +
            abs(pan.y - target.y) / (368f * camera.scale)
        var best: Int? = null
        var closest = distance(LandPoint(0f, 0f))
        offsets.forEachIndexed { index, offset ->
            if (offset.x.isFinite() && offset.y.isFinite()) {
                val candidate = distance(targetPan(offset, camera, screenUnit = screenUnit, lift = lift))
                if (candidate < closest) { best = index; closest = candidate }
            }
        }
        return best
    }

    /** Returns a neighbor index, ownIndex for home, or null for open sea/free lots. */
    fun islandAt(worldPoint: LandPoint, offsets: List<LandPoint>): Int? {
        if (!worldPoint.x.isFinite() || !worldPoint.y.isFinite()) return null
        fun inside(offset: LandPoint): Boolean = abs(worldPoint.x - offset.x - 430f) / 410f +
            abs(worldPoint.y - offset.y - 370f) / 240f <= 1f
        offsets.forEachIndexed { index, offset -> if (inside(offset)) return index }
        return if (inside(LandPoint(0f, 0f))) ownIndex else null
    }

    /**
     * Sea bounds cover the actual scene and visible free lots. At close zoom they follow
     * the visited island; the own island keeps iOS's growth-aware drag slack.
     */
    fun clampPan(
        raw: LandPoint,
        camera: TraderLandCamera,
        offsets: List<LandPoint>,
        size: Int = camera.islandSize,
        focused: Int? = null,
        screenUnit: Float = 1f,
        lift: Float = cardLift,
    ): LandPoint {
        require(size in setOf(8, 10, 12, 16))
        val finiteOffsets = offsets.filter { it.x.isFinite() && it.y.isFinite() }
        val slackX = max(camera.width * .7f, if (size > 8) 368f * camera.scale else 0f)
        val slackY = max(camera.height * .7f, if (size > 8) 244f * camera.scale else 0f)
        var lowX = -slackX
        var highX = slackX
        var lowY = -slackY
        var highY = slackY
        if (camera.zoom <= seaZoom && finiteOffsets.isNotEmpty()) {
            val targets = listOf(LandPoint(0f, 0f)) + finiteOffsets.map { targetPan(it, camera, screenUnit = screenUnit, lift = lift) }
            lowX = targets.minOf { it.x } - camera.width * .5f
            highX = targets.maxOf { it.x } + camera.width * .5f
            lowY = targets.minOf { it.y } - camera.height * .5f
            highY = targets.maxOf { it.y } + camera.height * .5f
        } else if (focused != null && focused in offsets.indices) {
            val offset = offsets[focused]
            if (offset.x.isFinite() && offset.y.isFinite()) {
                val center = targetPan(offset, camera, screenUnit = screenUnit, lift = lift)
                lowX = center.x - slackX
                highX = center.x + slackX
                lowY = center.y - slackY
                highY = center.y + slackY
            }
        }
        return LandPoint(
            if (raw.x.isFinite()) raw.x.coerceIn(lowX, highX) else 0f.coerceIn(lowX, highX),
            if (raw.y.isFinite()) raw.y.coerceIn(lowY, highY) else 0f.coerceIn(lowY, highY),
        )
    }
}
