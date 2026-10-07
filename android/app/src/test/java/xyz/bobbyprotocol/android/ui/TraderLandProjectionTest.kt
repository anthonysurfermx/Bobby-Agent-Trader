package xyz.bobbyprotocol.android.ui

import org.junit.Assert.*
import org.junit.Test

class TraderLandProjectionTest {
    @Test fun everySlabExtremityCanReturnToTheViewportAtMaximumZoomForEveryGrowthSize() {
        for (size in listOf(8, 10, 12, 16)) {
            val centered = TraderLandCamera(400f, 335f, 2.6f * size / 8f, islandSize = size)
            for (corner in TraderLandProjection.slab) {
                val screen = centered.project(corner)
                val pan = centered.clampPan(200f - screen.x, 167.5f - screen.y)
                val reached = centered.copy(panX = pan.x, panY = pan.y).project(corner)
                assertTrue("$size $corner x=${reached.x}", reached.x in 0f..400f)
                assertTrue("$size $corner y=${reached.y}", reached.y in 0f..335f)
            }
        }
    }

    @Test fun zoomingOutRetainsCanonicalPanSlackInsteadOfErasingTheFingerAnchor() {
        val enlarged = TraderLandCamera(400f, 335f, 5.2f, islandSize = 16)
        assertTrue(enlarged.panLimitX > 800f)
        val small = enlarged.copy(zoom = .7f)
        val clamped = small.clampPan(enlarged.panLimitX, -enlarged.panLimitY)
        assertEquals(280f, clamped.x, .001f)
        assertEquals(-234.5f, clamped.y, .001f)
        val invalid = small.clampPan(Float.NaN, Float.POSITIVE_INFINITY)
        assertEquals(0f, invalid.x, 0f)
        assertEquals(0f, invalid.y, 0f)
    }

    @Test fun canonicalViewCenterAndFitMatchTheIOSCanvasOnPhoneTallAndWideViewports() {
        for ((width, height, expectedFit) in listOf(
            Triple(400f, 335f, 400f / 830f),
            Triple(402f, 500f, 402f / 830f),
            Triple(1600f, 720f, 720f / 640f),
        )) {
            val camera = TraderLandCamera(width, height, 1.7f, 31f, -42f)
            assertEquals(expectedFit, camera.fit, .00001f)
            val focus = camera.project(LandPoint(430f, 335f))
            assertEquals(width / 2f + 31f, focus.x, .001f)
            assertEquals(height / 2f - 42f, focus.y, .001f)
            // The slab center is 56 canvas points below the camera's view center.
            val slabCenter = camera.project(LandPoint(430f, 391f))
            assertEquals(56f * expectedFit * 1.7f, slabCenter.y - focus.y, .001f)
        }
    }

    @Test fun homeCameraUsesTheCanonicalLargeIslandZoomAndClearsOldPan() {
        for ((size, expectedZoom) in listOf(8 to 1f, 10 to 1f, 12 to 1.25f, 16 to 1.25f)) {
            val layout = TraderLandProjection(size)
            val camera = TraderLandCamera.home(402f, 500f, size)
            assertEquals(expectedZoom, layout.homeZoom, 0f)
            assertEquals(expectedZoom, camera.zoom, 0f)
            assertEquals(2.6f * size / 8f, layout.maxZoom, .00001f)
            assertEquals(8f / size, layout.unit, .00001f)
            assertEquals(size, camera.islandSize)
            assertEquals(0f, camera.panX, 0f)
            assertEquals(0f, camera.panY, 0f)
        }
    }

    @Test fun practicePanSlackIsSeventyPercentAtAllZoomLevelsAndGrownCornersRemainReachable() {
        for (zoom in listOf(.22f, 1f, 2.6f)) {
            val camera = TraderLandCamera(402f, 500f, zoom)
            assertEquals(281.4f, camera.panLimitX, .001f)
            assertEquals(350f, camera.panLimitY, .001f)
        }
        val grown = TraderLandCamera(402f, 500f, 5.2f, islandSize = 16)
        assertEquals(368f * 402f / 830f * 5.2f, grown.panLimitX, .001f)
        assertEquals(244f * 402f / 830f * 5.2f, grown.panLimitY, .001f)
        assertTrue(grown.panLimitX > 281.4f)
        assertTrue(grown.panLimitY > 350f)
    }

    @Test fun anOffCenterPinchKeepsTheSameWorldPointUnderStationaryFingers() {
        val camera = TraderLandCamera(400f, 335f, .7f)
        val fingers = LandPoint(50f, 45f)
        val world = camera.unproject(fingers)
        val transformed = camera.anchoredTransform(fingers, LandPoint(0f, 0f), 2f)
        assertEquals(1.4f, transformed.zoom, .00001f)
        assertEquals(150f, transformed.panX, .001f)
        assertEquals(122.5f, transformed.panY, .001f)
        assertPoint(fingers, transformed.project(world))
    }

    @Test fun simultaneousZoomAndPanKeepTheWorldPointUnderTheMovingCentroid() {
        val camera = TraderLandCamera(400f, 335f, 1.7f, 31f, -42f)
        val before = LandPoint(320f, 250f)
        val world = camera.unproject(before)
        val after = camera.anchoredTransform(before, LandPoint(9f, -8f), 1.2f)
        assertEquals(22.2f, after.panX, .001f)
        assertEquals(-74.9f, after.panY, .001f)
        assertPoint(LandPoint(329f, 242f), after.project(world))
    }

    @Test fun pinchUsesTheActualClampedZoomRatioAtBothLimitsWithoutAJump() {
        for ((camera, factor, limit) in listOf(
            Triple(TraderLandCamera(400f, 335f, 5.1f, 12f, -9f, 16), 100f, 5.2f),
            Triple(TraderLandCamera(400f, 335f, .8f, 12f, -9f, 16), .01f, .7f),
        )) {
            val fingers = LandPoint(195f, 165f)
            val world = camera.unproject(fingers)
            val transformed = camera.anchoredTransform(fingers, LandPoint(7f, -4f), factor)
            assertEquals(limit, transformed.zoom, .00001f)
            assertPoint(LandPoint(202f, 161f), transformed.project(world))
        }
    }

    @Test fun buttonZoomAroundTheViewportCenterScalesExistingPanAsIOSDoes() {
        val camera = TraderLandCamera(400f, 335f, 1f, 70f, -90f)
        val focus = LandPoint(200f, 167.5f)
        val world = camera.unproject(focus)
        val zoomed = camera.anchoredTransform(focus, LandPoint(0f, 0f), 1.3f)
        assertEquals(91f, zoomed.panX, .001f)
        assertEquals(-117f, zoomed.panY, .001f)
        assertPoint(focus, zoomed.project(world))
    }

    @Test fun sequentialPinchEventsPreserveTheirAnchorAtEveryGrowthSizeAndScreenDensity() {
        for (size in listOf(8, 10, 12, 16)) for ((width, height) in listOf(360f to 301f, 1080f to 904f, 1600f to 720f)) {
            var camera = TraderLandCamera.home(width, height, size)
            var centroid = LandPoint(width * .7f, height * .3f)
            val world = camera.unproject(centroid)
            val pan = LandPoint(width * .015f, height * -.01f)
            for (factor in listOf(1.2f, .8f, 1.4f, .75f)) {
                camera = camera.anchoredTransform(centroid, pan, factor)
                centroid = LandPoint(centroid.x + pan.x, centroid.y + pan.y)
                assertPoint(centroid, camera.project(world), .005f)
            }
        }
    }

    @Test fun theSeaCameraCanDeferBoundsWithoutLosingItsNeighborAnchor() {
        val camera = TraderLandCamera(400f, 335f, .4f, 900f, -700f, 16)
        val fingers = LandPoint(195f, 165f)
        val world = camera.unproject(fingers)
        val raw = camera.anchoredTransform(fingers, LandPoint(7f, -4f), 2f, minZoom = .22f, boundPan = false)
        assertTrue(raw.panX > raw.panLimitX)
        assertPoint(LandPoint(202f, 161f), raw.project(world))
        val bounded = camera.anchoredTransform(fingers, LandPoint(7f, -4f), 2f, minZoom = .22f)
        assertTrue(bounded.panX <= bounded.panLimitX)
        assertTrue(bounded.panY >= -bounded.panLimitY)
    }

    @Test fun reachingThePanBoundaryClampsOnlyAfterCalculatingTheAnchoredTransform() {
        val camera = TraderLandCamera(400f, 335f, 1f, 279f, 0f)
        val moved = camera.anchoredTransform(LandPoint(200f, 167.5f), LandPoint(20f, 0f), 1f)
        assertEquals(280f, moved.panX, .001f)
        assertEquals(0f, moved.panY, .001f)
        assertEquals(1f, moved.zoom, .001f)
    }

    @Test fun invalidGestureSamplesAndThePrelayoutViewportNeverCorruptTheCamera() {
        val camera = TraderLandCamera(400f, 335f)
        for (invalid in listOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
            assertEquals(camera, camera.anchoredTransform(LandPoint(invalid, 100f), LandPoint(0f, 0f), 1f))
            assertEquals(camera, camera.anchoredTransform(LandPoint(100f, invalid), LandPoint(0f, 0f), 1f))
            assertEquals(camera, camera.anchoredTransform(LandPoint(100f, 100f), LandPoint(invalid, 0f), 1f))
            assertEquals(camera, camera.anchoredTransform(LandPoint(100f, 100f), LandPoint(0f, invalid), 1f))
            assertEquals(camera, camera.anchoredTransform(LandPoint(100f, 100f), LandPoint(0f, 0f), invalid))
        }
        for (factor in listOf(0f, -1f)) assertEquals(camera, camera.anchoredTransform(LandPoint(100f, 100f), LandPoint(0f, 0f), factor))
        assertEquals(camera, camera.anchoredTransform(LandPoint(100f, 100f), LandPoint(0f, 0f), 1f, minZoom = 2f, maxZoom = 1f))
        val unmeasured = TraderLandCamera(0f, 0f)
        assertEquals(unmeasured, unmeasured.anchoredTransform(LandPoint(100f, 100f), LandPoint(0f, 0f), 1.3f))
    }

    private fun assertPoint(expected: LandPoint, actual: LandPoint, tolerance: Float = .002f) {
        assertEquals(expected.x, actual.x, tolerance)
        assertEquals(expected.y, actual.y, tolerance)
    }

    @Test fun dragTranslationMatchesCanonicalDiagonalStepsAtAllGrowthSizesAndZooms() {
        // Literal reference moves from iOS' geometry contract, normalized to one base tile.
        val moves = listOf(
            Triple(LandPoint(0f, 0f), 2, 3),
            Triple(LandPoint(46f, 23f), 3, 3),
            Triple(LandPoint(-46f, 23f), 2, 4),
            Triple(LandPoint(46f, -23f), 2, 2),
            Triple(LandPoint(-46f, -23f), 1, 3),
            Triple(LandPoint(0f, 46f), 3, 4),
            Triple(LandPoint(92f, 0f), 3, 2),
        )
        for (size in listOf(8, 10, 12, 16)) for (scale in listOf(.3f, .7f, 1f, 1.5f, 2.6f)) {
            val layout = TraderLandProjection(size)
            for ((move, expectedCol, expectedRow) in moves) {
                val delta = LandPoint(move.x * layout.unit * scale, move.y * layout.unit * scale)
                assertEquals(expectedCol to expectedRow, layout.draggedPosition(2, 3, delta, scale))
            }
        }
    }

    @Test fun dragPreservesTheOriginalAnchorAndUsesCanonicalHalfCellRounding() {
        val layout = TraderLandProjection(8)
        // Starting on a different tile of a piece must not snap its placement to that tile.
        assertEquals(2 to 3, layout.draggedPosition(2, 3, LandPoint(1f, 1f), 1f))
        assertEquals(3 to 3, layout.draggedPosition(2, 3, LandPoint(23f, 11.5f), 1f))
        assertEquals(2 to 3, layout.draggedPosition(2, 3, LandPoint(-23f, -11.5f), 1f))
        assertEquals(1 to 3, layout.draggedPosition(2, 3, LandPoint(-23.01f, -11.505f), 1f))
    }

    @Test fun dragClampsToEveryIslandEdgeAndRejectsInvalidSamplesWithoutMoving() {
        for (size in listOf(8, 10, 12, 16)) {
            val layout = TraderLandProjection(size)
            assertEquals(0 to 0, layout.draggedPosition(0, 0, LandPoint(-500f, -500f), 1f))
            assertEquals(size - 1 to size - 1, layout.draggedPosition(size - 1, size - 1, LandPoint(0f, 5000f), 1f))
            assertEquals(size - 1 to size - 1, layout.draggedPosition(2, 3, LandPoint(0f, Float.MAX_VALUE), .001f))
            for (invalid in listOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
                assertEquals(2 to 3, layout.draggedPosition(2, 3, LandPoint(invalid, 0f), 1f))
                assertEquals(2 to 3, layout.draggedPosition(2, 3, LandPoint(0f, invalid), 1f))
                assertEquals(2 to 3, layout.draggedPosition(2, 3, LandPoint(0f, 0f), invalid))
            }
        }
    }

    @Test fun pavementFacesFollowCanonicalContentBoundsWithoutChangingSpriteSizeOrGroundContact() {
        val layout = TraderLandProjection(8)
        // Asymmetric artwork exposes the mirrored content center, rather than a symmetric special case.
        val art = LandSpriteArt(.42f, .84f, .2f, .7f, .25f)
        for (turn in listOf(0, 90, 180, 270)) {
            val plain = layout.sprite(1, 2, 2, 1, turn, art)
            val pavement = layout.sprite(1, 2, 2, 1, turn, art, path = true)
            val face = requireNotNull(pavement.face)
            assertNull(plain.face)
            assertEquals(plain.copy(face = face), pavement)
            assertEquals(.5f * pavement.side, face.width, .001f)
            assertEquals(.25f * pavement.side, face.height, .001f)
            assertEquals(pavement.y + .25f * pavement.side, face.y, .001f)
            val expectedMid = pavement.x + pavement.side * if (turn == 90 || turn == 270) .55f else .45f
            assertEquals(expectedMid, face.x + face.width / 2f, .001f)
        }
    }

    @Test fun canonicalPavementTopBoundsComeFromTheExistingAssetManifest() {
        val expected = mapOf(
            "crypto_bay_water_walkway_bloom.png" to .2886f,
            "evidence_mines_open_tunnel_bloom.png" to .2642f,
            "thesis_citadel_fortified_ramp_bloom.png" to .2324f,
            "risk_reef_blue_sluice_bloom.png" to .2056f,
            "axiom_archive_path_straight_bloom.png" to .2534f,
        )
        for ((asset, top) in expected) assertEquals(top, TraderLandSpriteCatalog.art.getValue(asset).top, .00001f)
        TraderLandSpriteCatalog.art.values.forEach { assertTrue(it.top in 0f..it.anchorY) }
    }

    @Test fun invalidTransformCoordinatesNeverSelectTheFirstCell() {
        val grid = TraderLandProjection(8)
        for (value in listOf(Float.NaN, Float.POSITIVE_INFINITY, Float.NEGATIVE_INFINITY)) {
            assertNull(grid.cellAt(value, 300f)); assertNull(grid.cellAt(430f, value))
        }
    }

    @Test fun allGrowthSizesKeepCanonicalSlabExtentInsteadOfAnOverflowingGrid() {
        for (size in listOf(8, 10, 12, 16)) {
            val actual = TraderLandProjection(size).diamond(0, 0, size, size)
            TraderLandProjection.slab.zip(actual).forEach { (expected, point) ->
                assertEquals(expected.x, point.x, .001f); assertEquals(expected.y, point.y, .001f)
            }
        }
    }

    @Test fun everyCellCanBeSelectedAtItsRenderedCenterOnPhoneAndTabletAfterZoomAndPan() {
        for (size in listOf(8, 10, 12, 16)) for ((width, height) in listOf(360f to 301f, 1080f to 904f, 1600f to 720f)) {
            val grid = TraderLandProjection(size)
            val camera = TraderLandCamera(width, height, 1.7f, 31f, -42f)
            for (y in 0 until size) for (x in 0 until size) {
                val screen = camera.project(grid.iso(x.toFloat(), y.toFloat()))
                val world = camera.unproject(screen)
                assertEquals(x to y, grid.cellAt(world.x, world.y))
            }
        }
    }

    @Test fun outsideSlabNeverSelectsAnEdgeCellAndHalfCellTiesUseCanonicalFloor() {
        val grid = TraderLandProjection(8)
        val outside = grid.iso(-.51f, 2f)
        assertNull(grid.cellAt(outside.x, outside.y))
        val tie = grid.iso(.5f, 2f)
        assertEquals(1 to 2, grid.cellAt(tie.x, tie.y))
        assertNull(grid.cellAt(0f, 0f))
    }

    @Test fun rotationMirrorsArtAndMovesItsContactPointToTheSwappedFootprintBottom() {
        val grid = TraderLandProjection(8)
        val art = LandSpriteArt(.42f, .84f, .2f, .8f)
        for (turn in listOf(0, 90, 180, 270)) {
            val frame = grid.sprite(1, 2, 2, 1, turn, art)
            val flipped = turn == 90 || turn == 270
            assertEquals(flipped, frame.flip)
            val ground = grid.diamond(1, 2, if (flipped) 1 else 2, if (flipped) 2 else 1)[2]
            val center = grid.iso(if (flipped) 1f else 1.5f, if (flipped) 2.5f else 2f)
            assertEquals(center.x, frame.x + frame.side * if (flipped) 1 - art.anchorX else art.anchorX, .001f)
            assertEquals(ground.y, frame.y + frame.side * art.anchorY, .001f)
            assertEquals(ground.y, frame.depth, .001f)
        }
    }

    @Test fun dormantCoreKeepsItsGroundContactWhileReducingArtToCanonicalScale() {
        val grid = TraderLandProjection(8)
        val art = TraderLandSpriteCatalog.art.getValue("aura_core_stage0.png")
        val active = grid.sprite(3, 3, 2, 2, 0, art)
        val dormant = grid.sprite(3, 3, 2, 2, 0, art, dormant = true)
        assertEquals(active.side * .72f, dormant.side, .001f)
        assertEquals(active.depth, dormant.depth, .001f)
        assertEquals(437f, dormant.y + dormant.side * art.anchorY, .001f)
    }

    @Test fun coreAndTallSpritesHaveCanonicalAnchorsAndDepthOrdersTheirGroundContact() {
        assertEquals(.499f, TraderLandSpriteCatalog.art.getValue("aura_core_stage1.png").anchorX, .00001f)
        assertEquals(.8901f, TraderLandSpriteCatalog.art.getValue("aura_core_stage1.png").anchorY, .00001f)
        val art = TraderLandSpriteCatalog.art.getValue("crypto_bay_waiting_lighthouse_bloom.png")
        val grid = TraderLandProjection(8)
        val back = grid.sprite(0, 0, 2, 2, 0, art)
        val front = grid.sprite(4, 4, 2, 2, 0, art)
        assertTrue(front.depth > back.depth)
        assertTrue(back.y < grid.iso(0f, 0f).y)
    }

    @Test fun everyBundledStateHasMetadataAndTheHistoricalPathAliasUsesTheSameArt() {
        assertEquals(28, TraderLandSpriteCatalog.art.size)
        assertEquals("axiom_archive_return_path_curve_bloom.png", TraderLandSpriteCatalog.asset("axiom_archive_return_path"))
        assertEquals("aura_core_stage0.png", TraderLandSpriteCatalog.asset("aura_core", 0))
        TraderLandSpriteCatalog.art.values.forEach {
            assertTrue(it.anchorX in 0f..1f); assertTrue(it.anchorY in 0f..1f)
            assertTrue(it.left < it.right); assertTrue(it.right <= 1f)
        }
    }
}
