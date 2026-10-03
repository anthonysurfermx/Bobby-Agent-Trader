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

    @Test fun invalidDragCoordinatesDoNotEscapeSceneBounds() {
        val camera = TraderLandCamera(400f, 600f, .9f)
        val offsets = listOf(LandArchipelago.offset(0))
        val value = LandArchipelago.clampPan(LandPoint(Float.NaN, Float.POSITIVE_INFINITY), camera, offsets, focused = 0)
        assertTrue(value.x.isFinite() && value.y.isFinite())
        point(value, LandArchipelago.clampPan(value, camera, offsets, focused = 0))
        assertNull(LandArchipelago.nearestIsland(LandPoint(Float.NaN, 0f), camera, offsets))
    }
}
