package xyz.bobbyprotocol.android.ui

import kotlin.math.abs
import org.junit.Assert.*
import org.junit.Test

class TraderLandArchipelagoTest {
    private fun point(expected: LandPoint, actual: LandPoint) {
        assertEquals(expected.x, actual.x, .001f)
        assertEquals(expected.y, actual.y, .001f)
    }

    @Test fun firstRingMatchesCanonicalClockwiseOffsetsFromTheTop() {
        val canonical = listOf(LandPoint(0f, -644f), LandPoint(644f, -322f), LandPoint(644f, 322f),
            LandPoint(0f, 644f), LandPoint(-644f, 322f), LandPoint(-644f, -322f))
        canonical.forEachIndexed { index, expected -> point(expected, LandArchipelago.offset(index)) }
        point(LandArchipelago.offset(59), LandArchipelago.offset(100))
    }

    @Test fun allFourRingsHaveDistinctNonoverlappingIslands() {
        val offsets = listOf(LandPoint(0f, 0f)) + (0 until LandArchipelago.slotCount).map(LandArchipelago::offset)
        assertEquals(61, offsets.toSet().size)
        offsets.indices.forEach { i -> (i + 1 until offsets.size).forEach { j ->
            val gap = abs(offsets[i].x - offsets[j].x) / 736f + abs(offsets[i].y - offsets[j].y) / 368f
            assertTrue("Islands $i and $j overlap", gap >= 1.5f)
        } }
    }

    @Test fun neighborFlightsCenterTheActualSlabAboveTheCardOnPhoneAndTablet() {
        for ((width, height) in listOf(400f to 600f, 900f to 720f)) {
            val camera = TraderLandCamera(width, height, LandArchipelago.visitZoom)
            for (index in 0 until 24) {
                val offset = LandArchipelago.offset(index)
                val pan = LandArchipelago.targetPan(offset, camera)
                val centered = camera.copy(panX = pan.x, panY = pan.y)
                point(LandPoint(width / 2f, height / 2f - 115f),
                    centered.project(LandPoint(offset.x + 430f, offset.y + 391f)))
            }
        }
    }

    @Test fun overviewUsesRoomAboveTheCardAndSafeZoomLimits() {
        val camera = TraderLandCamera(400f, 600f)
        val zoom = LandArchipelago.overviewZoom(camera.width, camera.height, camera.fit)
        val scale = camera.fit * zoom
        assertTrue(LandArchipelago.ringOneBounds.width * scale <= 384.001f)
        assertTrue(LandArchipelago.ringOneBounds.height * scale <= 346.001f)
        assertTrue(zoom in .22f.. .5f)
        assertEquals(.22f, LandArchipelago.overviewZoom(200f, 150f, .5f), 0f)
        assertEquals(.22f, LandArchipelago.overviewZoom(400f, 600f, 0f), 0f)
        assertEquals(.22f, LandArchipelago.overviewZoom(Float.NaN, 600f, .5f), 0f)
        assertEquals(-50f, LandArchipelago.ringOneBounds.centerY, 0f)
    }

    @Test fun hitTestingFindsActualNeighborsAndLeavesOpenSeaUntargeted() {
        val offsets = (0 until 24).map(LandArchipelago::offset)
        assertEquals(-1, LandArchipelago.islandAt(LandPoint(430f, 370f), offsets))
        offsets.forEachIndexed { index, offset ->
            assertEquals(index, LandArchipelago.islandAt(LandPoint(offset.x + 430f, offset.y + 370f), offsets))
            assertEquals(index, LandArchipelago.islandAt(LandPoint(offset.x + 839f, offset.y + 370f), offsets))
            assertNull(LandArchipelago.islandAt(LandPoint(offset.x + 841f, offset.y + 370f), offsets))
        }
        assertNull(LandArchipelago.islandAt(LandPoint(430f, -4000f), offsets))
        assertNull(LandArchipelago.islandAt(LandPoint(Float.NaN, 370f), offsets))
    }

    @Test fun refocusingPreservesHomeAndFindsEachNeighborAcrossZoomLevels() {
        val offsets = (0 until 24).map(LandArchipelago::offset)
        for (zoom in listOf(.9f, 1.4f, 2.6f)) {
            val camera = TraderLandCamera(400f, 600f, zoom)
            assertNull(LandArchipelago.nearestIsland(LandPoint(0f, 0f), camera, offsets))
            offsets.forEachIndexed { index, offset ->
                assertEquals(index, LandArchipelago.nearestIsland(LandArchipelago.targetPan(offset, camera), camera, offsets))
            }
        }
    }

    @Test fun seaPanBoundsKeepEveryVisibleIslandReachable() {
        val offsets = (0 until 24).map(LandArchipelago::offset)
        val camera = TraderLandCamera(400f, 600f, .35f)
        for (offset in offsets) {
            val target = LandArchipelago.targetPan(offset, camera)
            point(target, LandArchipelago.clampPan(target, camera, offsets))
        }
        val low = LandArchipelago.clampPan(LandPoint(-1e6f, -1e6f), camera, offsets)
        val high = LandArchipelago.clampPan(LandPoint(1e6f, 1e6f), camera, offsets)
        assertTrue(high.x - low.x > camera.width)
        assertTrue(high.y - low.y > camera.height)
    }

    @Test fun closePanBoundsFollowVisitedIslandAndGrowthSlack() {
        val offsets = (0 until 6).map(LandArchipelago::offset)
        for (size in listOf(8, 10, 12, 16)) {
            val camera = TraderLandCamera(400f, 600f, 2.6f * size / 8f, islandSize = size)
            val target = LandArchipelago.targetPan(offsets[4], camera)
            point(target, LandArchipelago.clampPan(target, camera, offsets, size, focused = 4))
            val upper = LandArchipelago.clampPan(LandPoint(1e6f, 1e6f), camera, offsets, size, focused = 4)
            assertEquals(camera.panLimitX, upper.x - target.x, .001f)
            assertEquals(camera.panLimitY, upper.y - target.y, .001f)
            point(camera.clampPan(1e6f, -1e6f), LandArchipelago.clampPan(LandPoint(1e6f, -1e6f), camera, offsets, size))
        }
    }

    @Test fun successfulPublicReadsFillOnlyTheUnoccupiedFirstRingSlots() {
        assertTrue(LandArchipelago.freeLots(0, showLots = false).isEmpty())
        assertEquals((0 until 6).map(LandArchipelago::offset), LandArchipelago.freeLots(0, showLots = true))
        assertEquals((2 until 6).map(LandArchipelago::offset), LandArchipelago.freeLots(2, showLots = true))
        assertTrue(LandArchipelago.freeLots(6, showLots = true).isEmpty())
        assertTrue(LandArchipelago.freeLots(60, showLots = true).isEmpty())
        assertTrue(LandArchipelago.freeLots(2, showLots = false).isEmpty())
    }

    @Test fun emptyPublicArchipelagoHasCanonicalSeaBoundsForAllSixFreeLots() {
        val camera = TraderLandCamera(400f, 600f, .75f)
        val scene = LandArchipelago.sceneOffsets(emptyList(), showLots = true)
        val low = LandArchipelago.clampPan(LandPoint(-1e6f, -1e6f), camera, scene)
        val high = LandArchipelago.clampPan(LandPoint(1e6f, 1e6f), camera, scene)
        // Literal first-ring extrema, derived from Swift's targets and half-viewport margin.
        val targets = listOf(LandPoint(0f, 0f)) + scene.map { LandArchipelago.targetPan(it, camera) }
        assertEquals(-644f * camera.scale - 200f, low.x, .001f)
        assertEquals(644f * camera.scale + 200f, high.x, .001f)
        assertEquals(-(644f + 56f) * camera.scale - 115f - 300f, low.y, .001f)
        assertEquals(-(-644f + 56f) * camera.scale - 115f + 300f, high.y, .001f)
        targets.forEach { point(it, LandArchipelago.clampPan(it, camera, scene)) }
        val ownOnly = LandArchipelago.clampPan(LandPoint(-1e6f, -1e6f), camera, emptyList())
        assertTrue("The empty ring must expand the old own-island bounds", low.x < ownOnly.x && low.y < ownOnly.y)
    }

    @Test fun freeLotsNeverBecomeVisitedOrClickableIslands() {
        val actual = (0 until 2).map(LandArchipelago::offset)
        val scene = LandArchipelago.sceneOffsets(actual, showLots = true)
        assertEquals(6, scene.size)
        assertEquals(actual, scene.take(2))
        for (lot in LandArchipelago.freeLots(actual.size, showLots = true)) {
            assertNull(LandArchipelago.islandAt(LandPoint(lot.x + 430f, lot.y + 391f), actual))
            val camera = TraderLandCamera(400f, 600f, .9f)
            val index = LandArchipelago.nearestIsland(LandArchipelago.targetPan(lot, camera), camera, actual)
            assertTrue(index == null || index in actual.indices)
            assertNull(LandArchipelago.nearestIsland(LandArchipelago.targetPan(lot, camera), camera, emptyList()))
        }
    }

    @Test fun canvasChipsUseTheCanonicalSlabMarginAndNeverSplitSurrogatePairs() {
        assertEquals(391f + 184f + 22f + 10f, LandArchipelago.labelWorldY, 0f)
        val exact = "abcdefghijklmnopqrstuvwx"
        assertEquals(exact, LandArchipelago.shortTitle(exact))
        assertEquals("abcdefghijklmnopqrstuvw…", LandArchipelago.shortTitle(exact + "y"))
        val emoji = "🌊".repeat(25)
        val shortened = LandArchipelago.shortTitle(emoji)
        assertEquals("🌊".repeat(23) + "…", shortened)
        assertEquals(24, shortened.codePointCount(0, shortened.length))
        val combined = "e\u0301"
        assertEquals(combined.repeat(24), LandArchipelago.shortTitle(combined.repeat(24)))
        assertEquals(combined.repeat(23) + "…", LandArchipelago.shortTitle(combined.repeat(25)))
    }

    @Test fun overviewAndVisitedCenterKeepTheSameLogicalFrameAtDensityOneAndThree() {
        val offsets = (0 until 6).map(LandArchipelago::offset)
        for ((width, height) in listOf(400f to 600f, 900f to 720f)) {
            val logical = TraderLandCamera(width, height)
            val logicalZoom = LandArchipelago.overviewZoom(width, height, logical.fit)
            val logicalOverview = logical.copy(zoom = logicalZoom)
            val logicalPan = LandArchipelago.targetPan(LandPoint(0f, -50f), logicalOverview)
            for (density in listOf(1f, 3f)) {
                val pixels = TraderLandCamera(width * density, height * density)
                val zoom = LandArchipelago.overviewZoom(pixels.width, pixels.height, pixels.fit, screenUnit = density)
                assertEquals("Overview zoom must be independent of pixel density", logicalZoom, zoom, .00001f)
                val pan = LandArchipelago.targetPan(LandPoint(0f, -50f), pixels.copy(zoom = zoom), screenUnit = density)
                point(logicalPan, LandPoint(pan.x / density, pan.y / density))
                val visited = pixels.copy(zoom = .9f)
                offsets.forEachIndexed { index, offset ->
                    val target = LandArchipelago.targetPan(offset, visited, screenUnit = density)
                    val screen = visited.copy(panX = target.x, panY = target.y).project(LandPoint(offset.x + 430f, offset.y + 391f))
                    point(LandPoint(width / 2f, height / 2f - 115f), LandPoint(screen.x / density, screen.y / density))
                    assertEquals(index, LandArchipelago.nearestIsland(target, visited, offsets, screenUnit = density))
                }
            }
        }
    }

    @Test fun sceneBoundsAndAnchoredTransformScaleTogetherAtDensityOneAndThree() {
        val offsets = LandArchipelago.sceneOffsets(listOf(LandArchipelago.offset(0)), showLots = true)
        val logical = TraderLandCamera(400f, 600f, .35f)
        for (density in listOf(1f, 3f)) {
            val pixels = TraderLandCamera(400f * density, 600f * density, logical.zoom)
            for (raw in listOf(LandPoint(-1e6f, -1e6f), LandPoint(1e6f, 1e6f), LandPoint(150f, -260f))) {
                val expected = LandArchipelago.clampPan(raw, logical, offsets)
                val actual = LandArchipelago.clampPan(LandPoint(raw.x * density, raw.y * density), pixels, offsets, screenUnit = density)
                point(expected, LandPoint(actual.x / density, actual.y / density))
            }
            val anchor = LandPoint(280f, 180f); val movement = LandPoint(12f, -8f)
            val before = pixels.copy(zoom = .9f)
            val world = before.unproject(LandPoint(anchor.x * density, anchor.y * density))
            val next = before.anchoredTransform(LandPoint(anchor.x * density, anchor.y * density),
                LandPoint(movement.x * density, movement.y * density), 1.35f, minZoom = .22f, boundPan = false)
            val expected = TraderLandCamera(400f, 600f, .9f).anchoredTransform(anchor, movement, 1.35f, minZoom = .22f, boundPan = false)
            assertEquals(expected.zoom, next.zoom, .00001f)
            point(LandPoint(expected.panX, expected.panY), LandPoint(next.panX / density, next.panY / density))
            val underFingers = next.project(world)
            point(LandPoint(anchor.x + movement.x, anchor.y + movement.y), LandPoint(underFingers.x / density, underFingers.y / density))
            val center = LandArchipelago.targetPan(offsets[0], next, screenUnit = density)
            val bounded = LandArchipelago.clampPan(center, next, offsets, focused = 0, screenUnit = density)
            point(center, bounded)
        }
    }

    @Test fun canvasWithoutFooterOverlayCentersAndFitsTheRingAtEveryDensity() {
        val offsets = (0 until 6).map(LandArchipelago::offset)
        val logical = TraderLandCamera(400f, 400f)
        val zoom = LandArchipelago.overviewZoom(logical.width, logical.height, logical.fit, lift = 0f)
        assertTrue("Removing the absent overlay must use the available Canvas", zoom > .35f)
        for (density in listOf(1f, 3f)) {
            val camera = TraderLandCamera(logical.width * density, logical.height * density)
            val actualZoom = LandArchipelago.overviewZoom(camera.width, camera.height, camera.fit, screenUnit = density, lift = 0f)
            assertEquals(zoom, actualZoom, .00001f)
            val overview = camera.copy(zoom = actualZoom)
            val target = LandArchipelago.targetPan(LandPoint(0f, LandArchipelago.ringOneBounds.centerY), overview, screenUnit = density, lift = 0f)
            val centered = overview.copy(panX = target.x, panY = target.y)
            val top = centered.project(LandPoint(430f, 391f + LandArchipelago.ringOneBounds.y))
            val bottom = centered.project(LandPoint(430f, 391f + LandArchipelago.ringOneBounds.y + LandArchipelago.ringOneBounds.height))
            assertTrue(top.y >= 12f * density - .001f)
            assertTrue(bottom.y <= camera.height - 12f * density + .001f)
            assertEquals(camera.height / 2f, (top.y + bottom.y) / 2f, .001f)
            val visited = camera.copy(zoom = .9f)
            offsets.forEachIndexed { index, offset ->
                val pan = LandArchipelago.targetPan(offset, visited, screenUnit = density, lift = 0f)
                val projected = visited.copy(panX = pan.x, panY = pan.y).project(LandPoint(offset.x + 430f, offset.y + 391f))
                point(LandPoint(camera.width / 2f, camera.height / 2f), projected)
                assertEquals(index, LandArchipelago.nearestIsland(pan, visited, offsets, screenUnit = density, lift = 0f))
                point(pan, LandArchipelago.clampPan(pan, visited, offsets, focused = index, screenUnit = density, lift = 0f))
            }
        }
    }

    @Test fun zeroLiftPanBoundsRemainDensityInvariantForSeaAndFocusedVisits() {
        val offsets = LandArchipelago.sceneOffsets(listOf(LandArchipelago.offset(0)), showLots = true)
        for (zoom in listOf(.35f, .9f)) {
            val logical = TraderLandCamera(400f, 400f, zoom)
            for (density in listOf(1f, 3f)) {
                val pixels = TraderLandCamera(400f * density, 400f * density, zoom)
                for (raw in listOf(LandPoint(-1e6f, -1e6f), LandPoint(1e6f, 1e6f), LandPoint(110f, -70f))) {
                    val expected = LandArchipelago.clampPan(raw, logical, offsets, focused = 0, lift = 0f)
                    val actual = LandArchipelago.clampPan(LandPoint(raw.x * density, raw.y * density), pixels, offsets, focused = 0, screenUnit = density, lift = 0f)
                    point(expected, LandPoint(actual.x / density, actual.y / density))
                }
            }
        }
    }

    @Test fun invalidDragCoordinatesDoNotEscapeSceneBounds() {
        val camera = TraderLandCamera(400f, 600f, .9f)
        val offsets = listOf(LandArchipelago.offset(0))
        val value = LandArchipelago.clampPan(LandPoint(Float.NaN, Float.POSITIVE_INFINITY), camera, offsets, focused = 0)
        assertTrue(value.x.isFinite() && value.y.isFinite())
        point(value, LandArchipelago.clampPan(value, camera, offsets, focused = 0))
        assertNull(LandArchipelago.nearestIsland(LandPoint(Float.NaN, 0f), camera, offsets))
    }
}
