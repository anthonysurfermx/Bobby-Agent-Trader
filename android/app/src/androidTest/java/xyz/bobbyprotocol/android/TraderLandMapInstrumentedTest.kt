package xyz.bobbyprotocol.android

import android.os.Build
import android.graphics.Bitmap
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pinch
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.ui.LandDraft
import xyz.bobbyprotocol.android.ui.LandJson
import xyz.bobbyprotocol.android.ui.LandMapIsland
import xyz.bobbyprotocol.android.ui.LandPiece
import xyz.bobbyprotocol.android.ui.LandPoint
import xyz.bobbyprotocol.android.ui.TraderLandCamera
import xyz.bobbyprotocol.android.ui.TraderLandMap
import xyz.bobbyprotocol.android.ui.TraderLandProjection
import java.util.concurrent.atomic.AtomicReference
import java.io.File

/**
 * Production Canvas in the empty AndroidX activity, using only the bundled public showcase.
 * No repository, account, consent, purchase, network, or server-write path is constructed.
 */
@RunWith(AndroidJUnit4::class)
class TraderLandMapInstrumentedTest {
    @get:Rule val compose = createComposeRule()
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("sdk_gphone") ||
            Build.HARDWARE in setOf("ranchu", "goldfish"))
    }

    @Test fun bundledPublicShowcaseLoadsAllArtworkAndRendersAnActualIsometricMap() {
        val fixture = fixture()
        val original = fixture.snapshot.toString()
        show(fixture)
        awaitArt()
        val image = pixels()
        exportCanvas("showcase.png")
        assertTrue("The production map must draw colored artwork, not coordinate dots", image.toSet().size > 512)
        val node = map().fetchSemanticsNode()
        assertTrue(node.size.width > 200 && node.size.height > 200)
        assertEquals(original, fixture.snapshot.toString())
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
    }

    @Test fun reducedMotionKeepsTheCompleteMapOnTheSameRestingFrame() {
        show(fixture(), reducedMotion = true)
        awaitArt()
        compose.mainClock.autoAdvance = false
        val first = pixels()
        compose.mainClock.advanceTimeBy(2_000)
        compose.waitForIdle()
        assertArrayEquals("Reduced motion must preserve the static core and scene", first, pixels())
    }

    @Test fun liveCoreChangesActualCanvasPixelsWhileTheCameraAndPublicLayoutStayStill() {
        compose.mainClock.autoAdvance = false
        val fixture = fixture()
        val original = fixture.snapshot.toString()
        show(fixture, reducedMotion = false)
        awaitArt()
        compose.mainClock.advanceTimeBy(64)
        compose.waitForIdle()
        val first = pixels()
        compose.mainClock.advanceTimeBy(1_800)
        compose.waitForIdle()
        val second = pixels()
        val changed = first.indices.count { first[it] != second[it] }
        assertTrue("Runtime core layers and orbit motes must visibly animate; changed=$changed", changed > 100)
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
        assertEquals(original, fixture.snapshot.toString())
    }

    @Test fun twelveAndSixteenCellIslandsStartAtCanonicalHomeZoomAndReturnThereAfterZooming() {
        var land by mutableStateOf(grownLand(12))
        val pieces = fixture().pieces
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(land, pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> }, reduceMotion = true)
            }
        } }
        awaitArt()
        compose.onNodeWithTag("land-zoom").assertTextEquals("125%")
        map().assertContentDescriptionEquals("Isometric island · 12 × 12 · ${pieces.size}")
        compose.runOnIdle { land = grownLand(16) }
        awaitArt()
        compose.onNodeWithTag("land-zoom").assertTextEquals("125%")
        map().assertContentDescriptionEquals("Isometric island · 16 × 16 · ${pieces.size}")
        // A real transform gesture moves the camera, and Home restores the grown-island zoom.
        map().performTouchInput { pinch(start0 = center + Offset(-50f, 0f), end0 = center + Offset(-90f, 0f),
            start1 = center + Offset(50f, 0f), end1 = center + Offset(90f, 0f), durationMillis = 240) }
        compose.waitForIdle()
        val changedZoom = zoomPercent()
        assertTrue("A pinch must change the production camera; actualZoom=$changedZoom%", changedZoom > 125)
        compose.onNodeWithTag("land-home").performClick()
        compose.onNodeWithTag("land-zoom").assertTextEquals("125%")
    }

    @Test fun rotatedTwoByOneDraftHandleUpdatesOnlyTheLocalDestinationAndPreservesPlacement() {
        val fixture = fixture()
        val piece = rotatedPiece()
        val original = fixture.snapshot.toString()
        val originalPiece = piece.copy()
        var destination by mutableStateOf(2 to 1)
        val callbacks = mutableListOf<Pair<Int, Int>>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, listOf(piece), LandDraft("move", piece.placementId, piece.itemId, 2, 1),
                    destination, 90, true, "en", { english, _ -> english }, { x, y ->
                        callbacks.add(x to y); destination = x to y
                    }, reduceMotion = true)
            }
        } }
        awaitArt()
        val node = map().fetchSemanticsNode()
        val scale = TraderLandCamera.home(node.size.width.toFloat(), node.size.height.toFloat(), 8).scale
        exportCanvas("lifted-draft.png")
        compose.onNodeWithTag("land-move-handle").performTouchInput {
            swipe(center, center + Offset(46f * scale, 23f * scale), durationMillis = 240)
        }
        compose.waitForIdle()
        assertTrue("The handle must invoke the local draft callback", callbacks.isNotEmpty())
        assertEquals(3 to 1, destination)
        assertEquals(originalPiece, piece)
        assertEquals(original, fixture.snapshot.toString())
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
    }

    @Test fun draggingFromTheSecondTileOfARotatedDraftPreservesTheOriginalGrabOffset() {
        val fixture = fixture()
        val piece = rotatedPiece()
        var destination by mutableStateOf(2 to 1)
        val callbacks = mutableListOf<Pair<Int, Int>>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, listOf(piece), LandDraft("move", piece.placementId, piece.itemId, 2, 1),
                    destination, 90, true, "en", { english, _ -> english }, { x, y ->
                        callbacks.add(x to y); destination = x to y
                    }, reduceMotion = true)
            }
        } }
        awaitArt()
        val node = map().fetchSemanticsNode()
        val camera = TraderLandCamera.home(node.size.width.toFloat(), node.size.height.toFloat(), 8)
        val secondTile = camera.project(TraderLandProjection(8).iso(2f, 2f))
        map().performTouchInput {
            val grab = Offset(secondTile.x, secondTile.y)
            swipe(grab, grab + Offset(46f * camera.scale, 23f * camera.scale), durationMillis = 240)
        }
        compose.waitForIdle()
        assertTrue("Touching the second tile must drag the selected draft", callbacks.isNotEmpty())
        assertEquals("The second tile is the grab point, not a new placement anchor", 3 to 1, destination)
        assertEquals(2, piece.x)
        assertEquals(1, piece.y)
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
    }

    @Test fun overviewNextNeighborAndHomeReuseOneCanvasWithOfflinePublicIslands() {
        val fixture = fixture()
        val islands = listOf(
            offlineIsland(fixture, "offline001", "Offline Reef One"),
            offlineIsland(fixture, "offline002", "Offline Reef Two"),
        )
        val focus = mutableListOf<String?>()
        var explored = 0
        val original = fixture.snapshot.toString()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    islands = islands, onFocus = { focus.add(it?.code) }, onExplore = { explored++ }, reduceMotion = true)
            }
        } }
        awaitArt()
        val canvasId = map().fetchSemanticsNode().id
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        assertEquals(1, explored)
        assertTrue("Overview must fit the neighboring islands", zoomPercent() in 22..50)
        exportCanvas("archipelago.png")
        compose.onNodeWithTag("land-next").performClick()
        compose.onNodeWithTag("land-focused-island").assertExists()
        compose.onNodeWithTag("land-zoom").assertTextEquals("90%")
        assertEquals("offline001", focus.last())
        compose.onNodeWithTag("land-next").performClick()
        assertEquals("offline002", focus.last())
        compose.onNodeWithTag("land-next").performClick()
        assertEquals("offline001", focus.last())
        compose.onNodeWithTag("land-home").performClick()
        compose.onNodeWithTag("land-focused-island").assertDoesNotExist()
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
        assertEquals(null, focus.last())
        assertEquals(canvasId, map().fetchSemanticsNode().id)
        assertEquals(1, compose.onAllNodesWithTag("land-map").fetchSemanticsNodes().size)
        assertEquals(original, fixture.snapshot.toString())
    }

    @Test fun externalNavigationVersionsRevisitTheSameTargetAndReturnHomeThroughHostButtons() {
        val fixture = fixture()
        val islands = listOf(offlineIsland(fixture, "offline001", "Offline Reef One"), offlineIsland(fixture, "offline002", "Offline Reef Two"))
        var navigationCode by mutableStateOf<String?>(null)
        var navigationId by mutableStateOf(0)
        val focus = mutableListOf<String?>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TextButton(onClick = { navigationCode = "offline002"; navigationId++ }, modifier = Modifier.testTag("qa-visit-request")) { Text("Offline target") }
                TextButton(onClick = { navigationCode = null; navigationId++ }, modifier = Modifier.testTag("qa-home-request")) { Text("Offline home") }
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    islands = islands, onFocus = { focus.add(it?.code) }, reduceMotion = true,
                    navigationCode = navigationCode, navigationId = navigationId)
            }
        } }
        awaitArt()
        compose.onNodeWithTag("qa-visit-request").performClick()
        compose.onNodeWithTag("land-zoom").assertTextEquals("90%")
        assertEquals("offline002", focus.last())
        // Map Home does not modify the host's old target: the second request changes only its version.
        compose.onNodeWithTag("land-home").performClick()
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
        compose.onNodeWithTag("qa-visit-request").performClick()
        compose.onNodeWithTag("land-zoom").assertTextEquals("90%")
        assertEquals("offline002", focus.last())
        compose.onNodeWithTag("qa-home-request").performClick()
        compose.onNodeWithTag("land-focused-island").assertDoesNotExist()
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
        assertEquals(null, focus.last())
    }

    @Test fun removingTheFocusedOfflineNeighborReturnsHomeWithoutAStaleCaption() {
        val fixture = fixture()
        var islands by mutableStateOf(listOf(offlineIsland(fixture, "offline001", "Offline Reef One"), offlineIsland(fixture, "offline002", "Offline Reef Two")))
        val focus = mutableListOf<String?>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TextButton(onClick = { islands = islands.filterNot { it.code == "offline001" } }, modifier = Modifier.testTag("qa-remove-neighbor")) { Text("Remove offline neighbor") }
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    islands = islands, onFocus = { focus.add(it?.code) }, reduceMotion = true)
            }
        } }
        awaitArt()
        val canvasId = map().fetchSemanticsNode().id
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.onNodeWithTag("land-next").performClick()
        assertEquals("offline001", focus.last())
        compose.onNodeWithTag("land-focused-island").assertExists()
        compose.onNodeWithTag("qa-remove-neighbor").performClick()
        compose.onNodeWithTag("land-focused-island").assertDoesNotExist()
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
        assertEquals(null, focus.last())
        assertEquals(canvasId, map().fetchSemanticsNode().id)
    }

    @Test fun offCenterPinchKeepsTheSameWorldPointUnderTheActualInjectedFingers() {
        val fixture = fixture()
        val observed = AtomicReference<TraderLandCamera>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    reduceMotion = true, onCameraChanged = { observed.set(it) })
            }
        } }
        awaitArt()
        val before = requireNotNull(observed.get())
        assertTrue(before.width > 0 && before.height > 0)
        val anchor = LandPoint(before.width * .7f, before.height * .3f)
        val world = before.unproject(anchor)
        map().performTouchInput {
            val fingers = Offset(anchor.x, anchor.y)
            pinch(start0 = fingers + Offset(-45f, 0f), end0 = fingers + Offset(-90f, 0f),
                start1 = fingers + Offset(45f, 0f), end1 = fingers + Offset(90f, 0f), durationMillis = 300)
        }
        compose.waitForIdle()
        val after = requireNotNull(observed.get())
        assertTrue("The injected pinch must zoom the production map; before=$before after=$after", after.zoom > before.zoom * 1.2f)
        val projected = after.project(world)
        assertEquals("The x anchor must remain under the off-center fingers", anchor.x, projected.x, 2f)
        assertEquals("The y anchor must remain under the off-center fingers", anchor.y, projected.y, 2f)
    }

    private data class Fixture(val snapshot: JSONObject, val land: JSONObject, val pieces: List<LandPiece>)

    private fun fixture(): Fixture {
        val snapshot = context.assets.open("traderland/showcase.json").bufferedReader().use { JSONObject(it.readText()) }
        return Fixture(snapshot, snapshot.getJSONObject("world"), LandJson.pieces(snapshot, public = true))
    }

    private fun offlineIsland(fixture: Fixture, code: String, title: String): LandMapIsland {
        val snapshot = JSONObject(fixture.snapshot.toString())
        val land = snapshot.getJSONObject("world").put("code", code).put("title", title)
        return LandMapIsland(code, title, land, fixture.pieces, snapshot)
    }

    private fun grownLand(size: Int): JSONObject = JSONObject(fixture().land.toString())
        .put("size", size).put("core", JSONObject().put("x", size / 2 - 1).put("y", size / 2 - 1).put("stage", 1))

    private fun rotatedPiece() = LandPiece("offline-placement", "offline-inventory", "crypto_bay_candle_tower", 2, 1, 90, 2, 1)

    private fun show(fixture: Fixture, reducedMotion: Boolean = true) {
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    reduceMotion = reducedMotion)
            }
        } }
    }

    private fun map() = compose.onNodeWithTag("land-map", useUnmergedTree = true)

    private fun awaitArt() {
        compose.waitUntil(20_000) {
            if (!compose.mainClock.autoAdvance) compose.mainClock.advanceTimeByFrame()
            runCatching {
                val config = map().fetchSemanticsNode().config
                config.contains(SemanticsProperties.StateDescription) && config[SemanticsProperties.StateDescription] == "art-ready"
            }.getOrDefault(false)
        }
        compose.waitForIdle()
    }

    private fun zoomPercent(): Int = compose.onNodeWithTag("land-zoom").fetchSemanticsNode()
        .config[SemanticsProperties.Text].single().text.removeSuffix("%").toInt()

    private fun exportCanvas(name: String) {
        require(name in setOf("showcase.png", "archipelago.png", "lifted-draft.png"))
        val directory = File(context.filesDir, "traderland-qa").also { check(it.mkdirs() || it.isDirectory) }
        File(directory, name).outputStream().use { output ->
            check(map().captureToImage().asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, output))
        }
    }

    private fun pixels(): IntArray {
        val bitmap = map().captureToImage().asAndroidBitmap()
        return IntArray(bitmap.width * bitmap.height).also {
            bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        }
    }
}
