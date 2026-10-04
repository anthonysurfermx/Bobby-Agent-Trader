package xyz.bobbyprotocol.android.ui

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint as AndroidPaint
import android.graphics.Path as AndroidPath

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin

/** Rotated, ground-space footprint; one entry represents one piece, never one coordinate dot. */
internal data class LandSceneFootprint(val col: Int, val row: Int, val columns: Int = 1, val rows: Int = 1) {
    fun contains(x: Int, y: Int): Boolean = x in col until col + columns && y in row until row + rows
}

/** The caller keeps normal sprites depth-sorted and paints the lifted draft last. */
internal data class LandSceneSprite(
    val asset: String,
    val frame: LandSpriteFrame,
    val art: LandSpriteArt,
    val footprint: LandSceneFootprint,
    val coreStage: Int? = null,
    val lifted: Boolean = false,
    val selected: Boolean = false,
)

/** The approved stage-1 layer bytes, with the same square canvas and anchors as the albedo. */
internal data class LandCoreImages(
    val body: ImageBitmap,
    val ringBack: ImageBitmap,
    val sphere: ImageBitmap,
    val ringFront: ImageBitmap,
    val glow: ImageBitmap,
)

private val landGround = Color(0xFF111319)
private val landSideLight = Color(0xFF0C0E13)
private val landSideDark = Color(0xFF050608)
private val landFog = Color(0xFF040306)
private val landMint = Color(0xFF61FFC4)
private val landAmbient = Color(.655f, .584f, .937f, 1f)
private val landSelected = Color(.98f, .78f, .18f, 1f)
private val landPickupShadowFilter = ColorFilter.tint(Color.Black, BlendMode.SrcIn)
private val landSelectedShadowFilter = ColorFilter.tint(landSelected, BlendMode.SrcIn)
// Normalize the existing silhouette kernel to iOS selected-shadow opacity .45 in opaque regions.
private val landSelectedShadowWeights = floatArrayOf(.018f, .035f, .09f).map {
    1f - .55f.pow(it / .442f)
}.toFloatArray()
private val landPickupOffsets = listOf(
    Offset(-10f, 0f), Offset(10f, 0f), Offset(0f, -10f), Offset(0f, 10f),
    Offset(-6f, -6f), Offset(6f, -6f), Offset(-6f, 6f), Offset(6f, 6f),
    Offset(-4f, 0f), Offset(4f, 0f), Offset(0f, -4f), Offset(0f, 4f),
)
private val landRim = Color(0xFF80D9E8)
private const val landSlabDepth = 22f

// The manifest glow carrier is opaque RGB. iOS maps luminance to alpha before screen composition.
private val landGlowFilter = ColorFilter.colorMatrix(ColorMatrix(floatArrayOf(
    1f, 0f, 0f, 0f, 0f,
    0f, 1f, 0f, 0f, 0f,
    0f, 0f, 1f, 0f, 0f,
    .2126f, .7152f, .0722f, 0f, 0f,
)))

private fun landPolygon(points: List<LandPoint>): Path = Path().apply {
    if (points.isNotEmpty()) {
        moveTo(points.first().x, points.first().y)
        points.drop(1).forEach { lineTo(it.x, it.y) }
        close()
    }
}

/**
 * Canonical iOS LandPainter ground pass in the 860 x 720 island coordinate space.
 * A null radius reveals the full account island; practice fog uses rings around the grid centre.
 * Occupied cells have contact shadows but no grid lines through the art.
 */
internal fun DrawScope.drawTraderLandGround(
    projection: TraderLandProjection,
    occupied: List<LandSceneFootprint>,
    revealRadius: Float? = null,
    placing: Boolean = false,
    visited: Boolean = false,
    ambient: Boolean = true,
    publicIsland: Boolean = false,
    selected: LandSceneFootprint? = null,
) {
    val unit = 8f / projection.size
    val slab = TraderLandProjection.slab
    if (ambient) drawOval(
        Brush.radialGradient(listOf(landAmbient.copy(alpha = .06f), Color.Transparent), Offset(430f, 391f), 470f),
        topLeft = Offset(-40f, 61f), size = Size(940f, 660f),
    )
    val left = slab[3]
    val bottom = slab[2]
    val right = slab[1]
    drawPath(
        landPolygon(listOf(left, bottom, bottom.copy(y = bottom.y + landSlabDepth), left.copy(y = left.y + landSlabDepth))),
        Brush.linearGradient(listOf(landSideLight, landSideDark), Offset(246f, 400f), Offset(246f, 597f)),
    )
    drawPath(
        landPolygon(listOf(bottom, right, right.copy(y = right.y + landSlabDepth), bottom.copy(y = bottom.y + landSlabDepth))),
        Brush.linearGradient(listOf(landSideDark.copy(alpha = .9f), landSideDark), Offset(614f, 400f), Offset(614f, 597f)),
    )
    val island = landPolygon(slab)
    drawPath(island, landGround)
    val middle = (projection.size - 1) / 2f
    val radius = revealRadius?.takeIf { it.isFinite() }?.coerceAtLeast(0f)
    val fog = Path()
    val open = Path()
    for (row in 0 until projection.size) for (col in 0 until projection.size) {
        val cell = landPolygon(projection.diamond(col, row))
        val revealed = radius == null || max(abs(col - middle), abs(row - middle)) <= radius
        if (!revealed) fog.addPath(cell)
        else if (occupied.none { it.contains(col, row) }) open.addPath(cell)
    }
    drawPath(fog, landFog.copy(alpha = .9f))
    val gridAlpha = if (publicIsland) .035f else if (placing) .10f else .04f
    val gridStroke = if (publicIsland || placing) 1f else .8f
    drawPath(open, Color.White.copy(alpha = gridAlpha), style = Stroke(gridStroke * unit))
    drawTraderLandRim(visited)
    clipPath(island) {
        occupied.forEach { footprint ->
            drawLandFootprintShadow(projection.diamond(footprint.col, footprint.row, footprint.columns, footprint.rows), footprint.columns, footprint.rows, unit)
        }
    }
    selected?.let {
        drawPath(landPolygon(projection.diamond(it.col, it.row, it.columns, it.rows)),
            landSelected.copy(alpha = .90f), style = Stroke(2f * unit))
    }
}

private const val landShadowPadding = 16f
@Volatile private var landContactShadowCache: Map<Pair<Int, Int>, ImageBitmap> = emptyMap()
private val landShadowCacheLock = Any()

/**
 * Call from the artwork loader's IO dispatcher before publishing ArtReady. The four approved
 * footprint shapes use less than 0.25 MiB total; Canvas only reads the finished masks.
 * Software mask blur warms once, rather than allocating an offscreen layer every animation frame.
 */
internal fun warmTraderLandShadows() {
    if (landContactShadowCache.isNotEmpty()) return
    synchronized(landShadowCacheLock) {
        if (landContactShadowCache.isNotEmpty()) return
        val projection = TraderLandProjection(8)
        val masks = mutableMapOf<Pair<Int, Int>, ImageBitmap>()
        for (columns in 1..2) for (rows in 1..2) {
            val points = projection.diamond(0, 0, columns, rows)
            val minX = points.minOf { it.x }
            val maxX = points.maxOf { it.x }
            val minY = points.minOf { it.y }
            val maxY = points.maxOf { it.y }
            val width = ceil((maxX - minX) * .84f + 2f * landShadowPadding).toInt()
            val height = ceil((maxY - minY) * .84f + 2f * landShadowPadding).toInt()
            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val path = AndroidPath().apply {
                points.forEachIndexed { index, point ->
                    val x = (point.x - minX) * .84f + landShadowPadding
                    val y = (point.y - minY) * .84f + landShadowPadding
                    if (index == 0) moveTo(x, y) else lineTo(x, y)
                }
                close()
            }
            val paint = AndroidPaint(AndroidPaint.ANTI_ALIAS_FLAG).apply {
                color = android.graphics.Color.BLACK
                alpha = 128
                maskFilter = BlurMaskFilter(4f, BlurMaskFilter.Blur.NORMAL)
            }
            AndroidCanvas(bitmap).drawPath(path, paint)
            masks[columns to rows] = bitmap.asImageBitmap()
        }
        landContactShadowCache = masks.toMap()
    }
}

/** A soft contact shadow follows the real footprint instead of each sprite's square bitmap bounds. */
private fun DrawScope.drawLandFootprintShadow(points: List<LandPoint>, columns: Int, rows: Int, unit: Float) {
    val minX = points.minOf { it.x }
    val maxX = points.maxOf { it.x }
    val minY = points.minOf { it.y }
    val maxY = points.maxOf { it.y }
    val center = Offset((minX + maxX) / 2, (minY + maxY) / 2)
    val cached = landContactShadowCache[columns to rows]
    if (cached != null) {
        val x = center.x + (minX - center.x) * .84f - landShadowPadding * unit
        val y = center.y + (minY - center.y) * .84f + 2f - landShadowPadding * unit
        translate(left = x, top = y) {
            scale(unit, unit, Offset.Zero) {
                drawImage(cached, filterQuality = FilterQuality.Medium)
            }
        }
        return
    }
    val shadow = landPolygon(points.map { LandPoint(center.x + (it.x - center.x) * .84f, center.y + (it.y - center.y) * .84f + 2f) })
    // Future footprint shapes remain drawable while the four canonical masks warm off the UI thread.
    // Feathered contours keep the shadow soft on all supported Android GPUs, without offscreen blur layers.
    for (spread in 8 downTo 1) {
        val alpha = when (spread) { 8 -> .010f; 7 -> .012f; 6 -> .018f; 5 -> .024f; 4 -> .038f; 3 -> .05f; 2 -> .07f; else -> .09f }
        drawPath(shadow, Color.Black.copy(alpha = alpha), style = Stroke(spread * unit, join = StrokeJoin.Round))
    }
    drawPath(shadow, Color.Black.copy(alpha = .34f))
}

internal fun DrawScope.drawTraderLandRim(visited: Boolean = false) {
    val slab = TraderLandProjection.slab
    val tone = if (visited) landSelected.copy(alpha = .60f) else landRim.copy(alpha = .22f)
    drawPath(landPolygon(slab), tone, style = Stroke(1f))
    val base = Path().apply {
        moveTo(slab[3].x, slab[3].y + landSlabDepth)
        lineTo(slab[2].x, slab[2].y + landSlabDepth)
        lineTo(slab[1].x, slab[1].y + landSlabDepth)
    }
    drawPath(base, Color.White.copy(alpha = .05f), style = Stroke(1f))
}

/** World-space image drawing is density-independent; the camera transform supplies screen scaling. */
private fun DrawScope.drawLandImage(
    image: ImageBitmap,
    frame: LandSpriteFrame,
    alpha: Float = 1f,
    glow: Boolean = false,
    shadow: Boolean = false,
    selectedShadow: Boolean = false,
) {
    drawImage(
        image = image,
        dstOffset = IntOffset(frame.x.roundToInt(), frame.y.roundToInt()),
        dstSize = IntSize(frame.side.roundToInt().coerceAtLeast(1), frame.side.roundToInt().coerceAtLeast(1)),
        alpha = alpha,
        colorFilter = if (selectedShadow) landSelectedShadowFilter else if (shadow) landPickupShadowFilter else if (glow) landGlowFilter else null,
        blendMode = if (glow) BlendMode.Screen else BlendMode.SrcOver,
        filterQuality = FilterQuality.Medium,
    )
}

/**
 * iOS sprite order: albedo body, back ring, floating sphere, front ring, screen glow, seven orbit motes.
 * Dormant and seed cores remain static and use their matching flat art. Motion is owned by the caller;
 * reducedMotion fixes all layer transforms and motes, even when an advancing phase is supplied.
 */
internal fun DrawScope.drawTraderLandSprite(
    sprite: LandSceneSprite,
    albedo: ImageBitmap?,
    unit: Float = 1f,
    glow: ImageBitmap? = null,
    coreLayers: LandCoreImages? = null,
    phaseSeconds: Float = 0f,
    reducedMotion: Boolean = true,
    seed: Boolean = false,
) {
    val original = sprite.frame
    if (!original.side.isFinite() || original.side <= 0f || !original.x.isFinite() || !original.y.isFinite()) return
    val safeUnit = unit.takeIf { it.isFinite() && it > 0f } ?: 1f
    val lift = if (sprite.lifted) 6f * safeUnit else 0f
    val frame = original.copy(y = original.y - lift)
    val imagePass: DrawScope.() -> Unit = {
        if (albedo != null) {
            if (sprite.selected) drawLandSelectedShadow(albedo, frame, safeUnit, sprite.lifted)
            else if (sprite.lifted) drawLandLiftedShadow(albedo, frame, safeUnit)
        }
        if (sprite.coreStage == 1 && !seed && coreLayers != null) {
            drawLandCore(coreLayers, frame, safeUnit, phaseSeconds, reducedMotion)
        } else {
            albedo?.let { drawLandImage(it, frame) }
            if (!seed) glow?.let { drawLandImage(it, frame, glow = true) }
        }
    }
    if (frame.flip) scale(-1f, 1f, Offset(frame.x + frame.side / 2f, frame.y + frame.side / 2f)) { imagePass() }
    else imagePass()
}

/** Soft alpha-mask pickup shadow: the art lifts six units while its shadow remains on the ground. */
private fun DrawScope.drawLandLiftedShadow(image: ImageBitmap, frame: LandSpriteFrame, unit: Float) {
    val base = frame.copy(y = frame.y + 6f * unit)
    // A small fixed blur kernel avoids a per-frame offscreen bitmap allocation while retaining the silhouette.
    landPickupOffsets.forEachIndexed { index, offset ->
        drawLandImage(image, base.copy(x = base.x + offset.x * unit, y = base.y + offset.y * unit), alpha = if (index < 4) .018f else .035f, shadow = true)
    }
    drawLandImage(image, base, alpha = .09f, shadow = true)
}

/**
 * Selected CIO amber silhouette: radius six on a fixed piece, ten on a lifted draft, matching
 * iOS placement and opacity. The bounded 13-tap kernel remains an approximation to Swift blur;
 * it reuses the albedo mask and creates no per-piece texture or per-frame offscreen blur layer.
 */
private fun DrawScope.drawLandSelectedShadow(image: ImageBitmap, frame: LandSpriteFrame, unit: Float, lifted: Boolean) {
    val radiusScale = if (lifted) 1f else .6f
    val shadowY = if (lifted) 6f * unit else 0f
    landPickupOffsets.forEachIndexed { index, offset ->
        translate(left = offset.x * radiusScale * unit, top = shadowY + offset.y * radiusScale * unit) {
            drawLandImage(image, frame, alpha = landSelectedShadowWeights[if (index < 4) 0 else 1], selectedShadow = true)
        }
    }
    translate(top = shadowY) {
        drawLandImage(image, frame, alpha = landSelectedShadowWeights[2], selectedShadow = true)
    }
}

private fun DrawScope.drawLandCore(
    layers: LandCoreImages,
    frame: LandSpriteFrame,
    decoration: Float,
    phaseSeconds: Float,
    reducedMotion: Boolean,
) {
    val seconds = if (reducedMotion || !phaseSeconds.isFinite()) 0f else phaseSeconds.coerceAtLeast(0f)
    val floating = if (reducedMotion) -1f else -cos(seconds * PI.toFloat() / 7f)
    val artUnit = frame.side / 360f
    val pivot = Offset(frame.x + .5f * frame.side, frame.y + .3223f * frame.side)
    drawLandImage(layers.body, frame)
    scale(1f + .014f * floating, 1f - .01f * floating, pivot) {
        drawLandImage(layers.ringBack, frame, alpha = .89f + .11f * floating)
    }
    val sphereLift = if (reducedMotion) 0f else 7f * floating * artUnit
    val sphereCenter = pivot.copy(y = pivot.y + sphereLift)
    drawCircle(
        Brush.radialGradient(listOf(landMint.copy(alpha = .10f), Color.Transparent), sphereCenter, frame.side * .13f),
        radius = frame.side * .13f, center = sphereCenter,
    )
    translate(top = sphereLift) { drawLandImage(layers.sphere, frame) }
    scale(1f - .01f * floating, 1f + .011f * floating + .001f, pivot) { drawLandImage(layers.ringFront, frame) }
    drawLandImage(layers.glow, frame, glow = true)
    for (index in 0 until 7) {
        val angle = (seconds / 8f * 360f + index * 51f) * PI.toFloat() / 180f
        val distance = (42f + index * 4f) * artUnit
        val center = Offset(frame.x + .498f * frame.side + cos(angle) * distance, frame.y + .3223f * frame.side + sin(angle) * distance)
        val diameter = (if (index % 3 == 0) 5f else 3f) * decoration
        val glowRadius = 4f * decoration
        drawCircle(
            Brush.radialGradient(listOf(landMint.copy(alpha = .45f), Color.Transparent), center, diameter / 2f + glowRadius),
            radius = diameter / 2f + glowRadius, center = center,
        )
        drawCircle(landMint.copy(alpha = if (index % 3 == 0) .95f else .62f), radius = diameter / 2f, center = center)
    }
}

// Only the manifest's five path_pavement items get filaments. Other art must not acquire invented paths.
private val landPathTopBounds = mapOf(
    "crypto_bay_water_walkway_bloom.png" to .2886f,
    "evidence_mines_open_tunnel_bloom.png" to .2642f,
    "thesis_citadel_fortified_ramp_bloom.png" to .2324f,
    "risk_reef_blue_sluice_bloom.png" to .2056f,
    "axiom_archive_path_straight_bloom.png" to .2534f,
)

internal fun traderLandPathAsset(asset: String): Boolean = asset in landPathTopBounds

/** Connected light follows the top face's real content bounds; mirrored isolated slabs swap direction. */
internal fun DrawScope.drawTraderLandFilament(
    sprite: LandSceneSprite,
    pathCells: Set<Pair<Int, Int>>,
    unit: Float,
    dimmed: Boolean = false,
) {
    val topBound = landPathTopBounds[sprite.asset] ?: return
    val frame = sprite.frame
    val safeUnit = unit.takeIf { it.isFinite() && it > 0f } ?: 1f
    val lift = if (sprite.lifted) 6f * safeUnit else 0f
    val face = frame.face ?: run {
        val width = (sprite.art.right - sprite.art.left) * frame.side
        val contentMid = (sprite.art.left + sprite.art.right) / 2f
        val midX = if (frame.flip) frame.x + frame.side - frame.side * contentMid else frame.x + frame.side * contentMid
        LandSpriteFace(midX - width / 2f, frame.y + topBound * frame.side, width, width / 2f)
    }
    val center = Offset(face.x + face.width / 2f, face.y + face.height / 2f - lift)
    val quarterWidth = face.width / 4f
    val quarterHeight = face.height / 4f
    val col = sprite.footprint.col
    val row = sprite.footprint.row
    val endpoints = mutableListOf<Offset>()
    if ((col to (row - 1)) in pathCells) endpoints += Offset(center.x + quarterWidth, center.y - quarterHeight)
    if (((col + 1) to row) in pathCells) endpoints += Offset(center.x + quarterWidth, center.y + quarterHeight)
    if ((col to (row + 1)) in pathCells) endpoints += Offset(center.x - quarterWidth, center.y + quarterHeight)
    if (((col - 1) to row) in pathCells) endpoints += Offset(center.x - quarterWidth, center.y - quarterHeight)
    if (endpoints.isEmpty()) {
        if (frame.flip) {
            endpoints += Offset(center.x - quarterWidth, center.y - quarterHeight)
            endpoints += Offset(center.x + quarterWidth, center.y + quarterHeight)
        } else {
            endpoints += Offset(center.x + quarterWidth, center.y - quarterHeight)
            endpoints += Offset(center.x - quarterWidth, center.y + quarterHeight)
        }
    }
    val color = landMint.copy(alpha = if (dimmed) .15f else .95f)
    endpoints.forEach { end -> drawLine(color, center, end, strokeWidth = (if (dimmed) 2f else 4f) * safeUnit, cap = StrokeCap.Round) }
    drawCircle(landMint.copy(alpha = if (dimmed) .15f else 1f), radius = 4f * safeUnit, center = center)
}

/** The draft remains an actual footprint, with an explicit cross when server-compatible placement fails. */
internal fun DrawScope.drawTraderLandDraft(
    projection: TraderLandProjection,
    footprint: LandSceneFootprint,
    valid: Boolean,
) {
    val points = projection.diamond(footprint.col, footprint.row, footprint.columns, footprint.rows)
    val path = landPolygon(points)
    val unit = 8f / projection.size
    val tone = if (valid) Color(0xFFF2EDE4) else Color(0xFFFF6B6B)
    drawPath(path, tone.copy(alpha = if (valid) .08f else .2f))
    drawPath(path, tone.copy(alpha = if (valid) .85f else .95f), style = Stroke(1.5f * unit))
    if (!valid) {
        val center = Offset((points.minOf { it.x } + points.maxOf { it.x }) / 2f, (points.minOf { it.y } + points.maxOf { it.y }) / 2f)
        drawLine(tone, center - Offset(9f * unit, 5f * unit), center + Offset(9f * unit, 5f * unit), 2f * unit, StrokeCap.Round)
        drawLine(tone, center + Offset(-9f * unit, 5f * unit), center + Offset(9f * unit, -5f * unit), 2f * unit, StrokeCap.Round)
    }
}
