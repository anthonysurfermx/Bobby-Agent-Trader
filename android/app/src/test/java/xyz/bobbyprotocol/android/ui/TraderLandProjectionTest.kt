package xyz.bobbyprotocol.android.ui

import org.junit.Assert.*
import org.junit.Test

class TraderLandProjectionTest {
    @Test fun everySlabExtremityCanReturnToTheViewportAtMaximumZoomForEveryGrowthSize() {
        for (size in listOf(8, 10, 12, 16)) {
            val centered = TraderLandCamera(400f, 335f, 2.6f * size / 8f)
            for (corner in TraderLandProjection.slab) {
                val screen = centered.project(corner)
                val pan = centered.clampPan(200f - screen.x, 167.5f - screen.y)
                val reached = centered.copy(panX = pan.x, panY = pan.y).project(corner)
                assertTrue("$size $corner x=${reached.x}", reached.x in 0f..400f)
                assertTrue("$size $corner y=${reached.y}", reached.y in 0f..335f)
            }
        }
    }

    @Test fun zoomingOutClampsAnOldPanAndFitCentersTheWholeCanvas() {
        val enlarged = TraderLandCamera(400f, 335f, 5.2f)
        assertTrue(enlarged.panLimitX > 800f)
        val small = TraderLandCamera(400f, 335f, .7f)
        // Signed float zero is geometrically identical; compare coordinates numerically.
        for (clamped in listOf(small.clampPan(enlarged.panLimitX, -enlarged.panLimitY), small.clampPan(Float.NaN, Float.POSITIVE_INFINITY))) {
            assertEquals(0f, clamped.x, 0f)
            assertEquals(0f, clamped.y, 0f)
        }
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
