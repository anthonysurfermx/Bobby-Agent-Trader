package xyz.bobbyprotocol.android

import android.os.Build
import android.graphics.Bitmap
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.click
import androidx.compose.ui.semantics.SemanticsActions
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
import xyz.bobbyprotocol.android.ui.LandMapSelection
import xyz.bobbyprotocol.android.ui.LandMapSelectedPlacement
import xyz.bobbyprotocol.android.ui.LandSelectionBar
import xyz.bobbyprotocol.android.ui.LandDraftCancelButton
import xyz.bobbyprotocol.android.ui.LAND_CORE_SELECTION_ID
import xyz.bobbyprotocol.android.ui.landSelectionAt
import xyz.bobbyprotocol.android.ui.LandDraft
import xyz.bobbyprotocol.android.ui.LandArchipelago
import xyz.bobbyprotocol.android.ui.LandMapIslandLabels
import xyz.bobbyprotocol.android.ui.LandMapFreeLots
import xyz.bobbyprotocol.android.ui.LandMapArchipelagoMode
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

    @Test fun sixFreeLotsRenderOnlyAfterAReadyReadAndRemainUntargetedOnTap() {
        val fixture = fixture()
        var ready by mutableStateOf(false)
        val focus = mutableListOf<String?>()
        val taps = mutableListOf<Pair<Int, Int>>()
        val observed = AtomicReference<TraderLandCamera>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, true, "en", { english, _ -> english },
                    { x, y -> taps.add(x to y) }, showLots = ready, ownTitle = "Offline Home",
                    onFocus = { focus.add(it?.code) }, onCameraChanged = { observed.set(it) }, reduceMotion = true)
            }
        } }
        awaitArt()
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        assertEquals(0, map().fetchSemanticsNode().config[LandMapFreeLots])
        val withoutLots = pixels()
        compose.runOnIdle { ready = true }
        compose.waitForIdle()
        assertEquals(6, map().fetchSemanticsNode().config[LandMapFreeLots])
        assertEquals(listOf("Offline Home"), map().fetchSemanticsNode().config[LandMapIslandLabels])
        val withLots = pixels()
        assertTrue("The actual Canvas must draw dashed lots and their labels", withoutLots.indices.count { withoutLots[it] != withLots[it] } > 100)
        exportCanvas("free-lots.png")
        val camera = requireNotNull(observed.get())
        val lot = LandArchipelago.offset(1)
        val center = camera.project(LandPoint(lot.x + 430f, lot.y + 391f))
        assertTrue(center.x in 0f..camera.width && center.y in 0f..camera.height)
        val beforeZoom = zoomPercent()
        map().performTouchInput { click(Offset(center.x, center.y)) }
        compose.waitForIdle()
        assertEquals(beforeZoom, zoomPercent())
        assertTrue("A free lot cannot invent a neighbor visit or edit callback", focus.isEmpty() && taps.isEmpty())
        // A failed/revoked public read removes lots; it does not claim an empty successful scene.
        compose.runOnIdle { ready = false }
        compose.waitForIdle()
        assertEquals(0, map().fetchSemanticsNode().config[LandMapFreeLots])
        assertArrayEquals(withoutLots, pixels())
    }

    @Test fun realIslandTitlesRenderInTheOverviewAndRealIslandTapsVisitTheCorrectSlot() {
        val fixture = fixture()
        val islands = listOf(offlineIsland(fixture, "offline001", "Offline Reef One"), offlineIsland(fixture, "offline002", "Offline Reef Two"))
        val focus = mutableListOf<String?>()
        val observed = AtomicReference<TraderLandCamera>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    islands = islands, ownTitle = "Offline Home", showLots = true, onFocus = { focus.add(it?.code) },
                    onCameraChanged = { observed.set(it) }, reduceMotion = true)
            }
        } }
        awaitArt()
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        assertEquals(listOf("Offline Home", "Offline Reef One", "Offline Reef Two"), map().fetchSemanticsNode().config[LandMapIslandLabels])
        assertEquals(4, map().fetchSemanticsNode().config[LandMapFreeLots])
        exportCanvas("archipelago-labels.png")
        val camera = requireNotNull(observed.get())
        val slot = LandArchipelago.offset(1)
        val center = camera.project(LandPoint(slot.x + 430f, slot.y + 391f))
        map().performTouchInput { click(Offset(center.x, center.y)) }
        compose.waitForIdle()
        assertEquals("offline002", focus.last())
        compose.onNodeWithTag("land-focused-island").assertExists()
        compose.onNodeWithTag("land-zoom").assertTextEquals("90%")
        assertTrue(map().fetchSemanticsNode().config[LandMapIslandLabels].isEmpty())
        assertEquals(4, map().fetchSemanticsNode().config[LandMapFreeLots])
    }

    @Test fun archipelagoToggleReturnsHomeAndRestoresTheSameEditableCanvas() {
        val fixture = fixture()
        val taps = mutableListOf<Pair<Int, Int>>()
        var atSea by mutableStateOf(false)
        val transitions = mutableListOf<Boolean>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, null, null, 0, !atSea, "en", { english, _ -> english },
                    { x, y -> taps.add(x to y) }, showLots = true, reduceMotion = true,
                    onArchipelagoModeChanged = { active -> atSea = active; transitions.add(active) })
                if (!atSea) Text("Offline editor", Modifier.testTag("qa-local-editor"))
            }
        } }
        awaitArt()
        val canvasId = map().fetchSemanticsNode().id
        compose.onNodeWithTag("qa-local-editor").assertExists()
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("qa-local-editor").assertDoesNotExist()
        assertTrue(map().fetchSemanticsNode().config[LandMapArchipelagoMode])
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("qa-local-editor").assertExists()
        compose.onNodeWithTag("land-zoom").assertTextEquals("100%")
        assertEquals(listOf(true, false), transitions)
        assertEquals(canvasId, map().fetchSemanticsNode().id)
        val actions = map().fetchSemanticsNode().config[SemanticsActions.CustomActions]
        assertEquals(64, actions.size)
        compose.runOnIdle { assertTrue(actions.first().action()) }
        assertEquals(listOf(0 to 0), taps)
    }

    @Test fun initialSharedLinkNavigationPreservesTheAlreadyResolvedExtraIsland() {
        val fixture = fixture()
        val resolved = offlineIsland(fixture, "offline777", "Offline Linked Island")
        var islands by mutableStateOf(listOf(resolved))
        var primaryLand by mutableStateOf(fixture.land)
        val transitions = mutableListOf<Boolean>()
        val focus = mutableListOf<String?>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(primaryLand, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    islands = islands, navigationCode = resolved.code, navigationId = 1, reduceMotion = true,
                    onFocus = { focus.add(it?.code) }, onArchipelagoModeChanged = { active ->
                        transitions.add(active)
                        // The real host clears its separately loaded shared-link island on return home.
                        if (!active) islands = emptyList()
                    })
            }
        } }
        awaitArt()
        compose.onNodeWithTag("land-zoom").assertTextEquals("90%")
        compose.onNodeWithTag("land-focused-island").assertExists()
        compose.onNodeWithText("Offline Linked Island").assertExists()
        assertEquals(listOf(resolved.code), islands.map { it.code })
        assertEquals(resolved.code, focus.last())
        assertEquals(listOf(true), transitions)
        assertTrue(map().fetchSemanticsNode().config[LandMapArchipelagoMode])
        // Resolving the own account layout after the linked visit must not erase that visit.
        // This is an offline size change, never a server growth write.
        compose.runOnIdle { primaryLand = grownLand(12) }
        awaitArt()
        compose.onNodeWithTag("land-zoom").assertTextEquals("90%")
        map().assertContentDescriptionEquals("Isometric island · 12 × 12 · ${fixture.pieces.size}")
        compose.onNodeWithText("Offline Linked Island").assertExists()
        assertEquals(resolved.code, focus.last())
        assertEquals(listOf(resolved.code), islands.map { it.code })
        assertEquals(listOf(true), transitions)
        compose.onNodeWithTag("land-home").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("land-zoom").assertTextEquals("125%")
        compose.onNodeWithTag("land-focused-island").assertDoesNotExist()
        assertTrue(islands.isEmpty())
        assertEquals(listOf(true, false), transitions)
    }

    @Test fun zoomingBackIntoTheOwnIslandLeavesOverviewAndReopensEditingWithoutHome() {
        val fixture = fixture()
        var atSea by mutableStateOf(false)
        var chosen by mutableStateOf<LandDraft?>(null)
        var destination by mutableStateOf<Pair<Int, Int>?>(null)
        val taps = mutableListOf<Pair<Int, Int>>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, fixture.pieces, chosen, destination, 0, !atSea, "en", { english, _ -> english },
                    { x, y -> taps.add(x to y); destination = x to y }, showLots = true, reduceMotion = true,
                    onArchipelagoModeChanged = { active -> atSea = active; if (active) { chosen = null; destination = null } })
                if (!atSea) Text("Offline editor", Modifier.testTag("qa-local-editor"))
            }
        } }
        awaitArt()
        compose.runOnIdle { chosen = LandDraft("move", "offline-draft", "crypto_bay_candle_tower", 2, 1); destination = 2 to 1 }
        compose.waitForIdle()
        compose.onNodeWithTag("land-move-handle").assertExists()
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("land-move-handle").assertDoesNotExist()
        assertEquals(null, chosen)
        repeat(6) { if (zoomPercent() < 60) compose.onNodeWithContentDescription("Zoom in").performClick() }
        compose.waitForIdle()
        assertTrue("The camera must have crossed the canonical overview threshold", zoomPercent() >= 60)
        assertEquals(false, map().fetchSemanticsNode().config[LandMapArchipelagoMode])
        compose.onNodeWithTag("qa-local-editor").assertExists()
        assertTrue(map().fetchSemanticsNode().config[LandMapIslandLabels].isEmpty())
        val actions = map().fetchSemanticsNode().config[SemanticsActions.CustomActions]
        compose.runOnIdle { assertTrue(actions.last().action()) }
        assertEquals(7 to 7, taps.last())
    }

    @Test fun growingTheOwnIslandPreservesTheActuallyPinchedAndPannedFrameUntilHome() {
        val fixture = fixture()
        var land by mutableStateOf(fixture.land)
        val observed = AtomicReference<TraderLandCamera>()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    onCameraChanged = { observed.set(it) }, reduceMotion = true)
            }
        } }
        awaitArt()
        val original = requireNotNull(observed.get())
        val anchor = Offset(original.width * .65f, original.height * .35f)
        map().performTouchInput {
            pinch(start0 = anchor + Offset(-45f, 0f), end0 = anchor + Offset(-80f, 0f),
                start1 = anchor + Offset(45f, 0f), end1 = anchor + Offset(80f, 0f), durationMillis = 240)
        }
        compose.waitForIdle()
        map().performTouchInput { swipe(center, center + Offset(55f, 25f), durationMillis = 240) }
        compose.waitForIdle()
        val before = requireNotNull(observed.get())
        assertTrue("Actual injected fingers must establish a non-Home zoom", before.zoom > original.zoom * 1.2f)
        assertTrue("Actual injected pan must move the frame", before.panX != 0f || before.panY != 0f)
        val anchoredWorld = before.unproject(LandPoint(anchor.x, anchor.y))
        compose.runOnIdle { land = grownLand(12) }
        awaitArt()
        val after = requireNotNull(observed.get())
        assertEquals(12, after.islandSize)
        assertEquals("Growth must preserve the user's own zoom", before.zoom, after.zoom, .0001f)
        assertEquals("Growth must preserve the user's own x pan", before.panX, after.panX, .01f)
        assertEquals("Growth must preserve the user's own y pan", before.panY, after.panY, .01f)
        val samePoint = after.project(anchoredWorld)
        assertEquals(anchor.x, samePoint.x, 1f)
        assertEquals(anchor.y, samePoint.y, 1f)
        compose.onNodeWithTag("land-home").performClick()
        compose.onNodeWithTag("land-zoom").assertTextEquals("125%")
        val home = requireNotNull(observed.get())
        assertEquals(0f, home.panX, .01f)
        assertEquals(0f, home.panY, .01f)
    }

    @Test fun firstTapSelectsARotatedPieceAndExplicitMoveCancelLeavesTheStoredOriginUntouched() {
        val fixture = fixture()
        val piece = rotatedPiece()
        val original = fixture.snapshot.toString()
        val host = showSelection(fixture, listOf(piece))
        awaitArt()
        val resting = pixels()
        // The second cell of the rotated 2x1 footprint must resolve to the same placement UID.
        touchCell(2, 2)
        compose.onNodeWithTag("land-build-or-move").assertIsEnabled()
        compose.onNodeWithTag("land-move-handle").assertDoesNotExist()
        assertEquals(piece.placementId, host.selected?.id)
        assertEquals(null, host.draft)
        assertEquals(piece.placementId, map().fetchSemanticsNode().config[LandMapSelectedPlacement])
        val selected = pixels()
        assertTrue("A selected fixed sprite and footprint must change actual Canvas pixels", resting.indices.count { resting[it] != selected[it] } > 50)
        compose.runOnIdle { host.moveAllowed = false }
        compose.onNodeWithTag("land-build-or-move").assertIsNotEnabled()
        compose.onNodeWithTag("land-build-or-move").performTouchInput { click(center) }
        compose.waitForIdle()
        assertEquals("A disabled move action must not lift the selected piece", null, host.draft)
        compose.runOnIdle { host.moveAllowed = true }
        compose.onNodeWithTag("land-build-or-move").performClick()
        compose.onNodeWithTag("land-move-handle").assertExists()
        assertEquals(2 to 1, host.point)
        assertEquals(90, host.rotation)
        assertEquals("move", host.draft?.action)
        compose.onNodeWithTag("land-draft-cancel").performClick()
        compose.onNodeWithTag("land-move-handle").assertDoesNotExist()
        compose.onNodeWithTag("land-build-or-move").assertIsEnabled()
        assertEquals(piece.placementId, host.selected?.id)
        assertEquals(null, host.draft)
        assertArrayEquals("Cancel restores the same fixed selected scene", selected, pixels())
        assertEquals(2, piece.x); assertEquals(1, piece.y)
        assertEquals(original, fixture.snapshot.toString())
        touchCell(0, 0)
        compose.onNodeWithTag("land-selection").assertDoesNotExist()
        assertEquals(null, host.selected)
        assertArrayEquals(resting, pixels())
    }

    @Test fun tappingCoreRequiresItsCapabilityAndMoveStartsAtTheActualCoreBeforeCancel() {
        val fixture = fixture()
        val core = LandJson.core(fixture.land)
        val host = showSelection(fixture, emptyList(), canSelectCore = false)
        awaitArt()
        touchCell(core.first, core.second)
        compose.onNodeWithTag("land-selection").assertDoesNotExist()
        assertEquals(null, host.selected)
        compose.runOnIdle { host.canSelectCore = true }
        touchCell(core.first + 1, core.second + 1)
        assertEquals(LAND_CORE_SELECTION_ID, host.selected?.id)
        assertEquals(null, host.draft)
        val fixed = pixels()
        compose.onNodeWithTag("land-build-or-move").performClick()
        compose.onNodeWithTag("land-move-handle").assertExists()
        assertEquals("move_core", host.draft?.action)
        assertEquals(core, host.point)
        compose.onNodeWithTag("land-draft-cancel").performClick()
        assertEquals(LAND_CORE_SELECTION_ID, host.selected?.id)
        assertEquals(null, host.draft)
        assertArrayEquals(fixed, pixels())
    }

    @Test fun readonlyOwnMapAndFocusedPublicIslandCannotSelectOrStartADraft() {
        val fixture = fixture()
        val piece = rotatedPiece()
        val host = showSelection(fixture, listOf(piece), editable = false,
            islands = listOf(offlineIsland(fixture, "offline001", "Offline Selection Reef"),
                offlineIsland(fixture, "offline002", "Offline Selection Bay")))
        awaitArt()
        touchCell(2, 2)
        assertEquals(0, host.tapCount)
        compose.onNodeWithTag("land-selection").assertDoesNotExist()
        compose.runOnIdle { host.editable = true }
        touchCell(2, 2)
        assertEquals(piece.placementId, host.selected?.id)
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("land-next").performClick()
        compose.onNodeWithTag("land-focused-island").assertExists()
        assertEquals(null, host.selected)
        val before = host.tapCount
        map().performTouchInput { click(center) }
        compose.waitForIdle()
        assertEquals("Public navigation must not deliver an editing tap", before, host.tapCount)
        assertEquals(null, host.draft)
        compose.onNodeWithTag("land-build-or-move").assertDoesNotExist()
        assertEquals("", map().fetchSemanticsNode().config[LandMapSelectedPlacement])
    }

    @Test fun overviewUsesTheActualCanvasHeightForSixPublicIslandsAndFreeLotsOnGrownHome() {
        val fixture = fixture()
        var land by mutableStateOf(fixture.land)
        var islands by mutableStateOf((1..6).map { offlineIsland(fixture, "offline00$it", "Offline Reef $it") })
        val observed = AtomicReference<TraderLandCamera>()
        compose.setContent { MaterialTheme {
            // captureToImage includes the parent behind the rounded Canvas corners.
            // Match the production dark surface so the art mask cannot count a white fixture parent.
            Column(Modifier.fillMaxWidth().background(Color(0xFF050609)).padding(12.dp)) {
                TraderLandMap(land, fixture.pieces, null, null, 0, false, "en", { english, _ -> english }, { _, _ -> },
                    islands = islands, showLots = true, ownTitle = "Offline Home", reduceMotion = true,
                    onCameraChanged = { observed.set(it) })
            }
        } }
        awaitArt()
        compose.onNodeWithTag("land-archipelago").performClick()
        compose.waitForIdle()
        val camera = requireNotNull(observed.get())
        assertEquals(7, map().fetchSemanticsNode().config[LandMapIslandLabels].size)
        assertEquals(0, map().fetchSemanticsNode().config[LandMapFreeLots])
        assertTrue("The absent Android footer overlay must not force minimum overview zoom", camera.zoom > .3f)
        exportCanvas("archipelago-layout-six.png")
        assertOverviewContentFitsTheCanvas()
        val worldTop = camera.project(LandPoint(430f, 391f + LandArchipelago.ringOneBounds.y))
        val worldBottom = camera.project(LandPoint(430f, 391f + LandArchipelago.ringOneBounds.y + LandArchipelago.ringOneBounds.height))
        assertEquals("The archipelago must be centered vertically in the actual Canvas", camera.height / 2f, (worldTop.y + worldBottom.y) / 2f, 1f)
        compose.runOnIdle { islands = islands.take(2) }
        awaitArt()
        assertEquals(3, map().fetchSemanticsNode().config[LandMapIslandLabels].size)
        assertEquals(4, map().fetchSemanticsNode().config[LandMapFreeLots])
        exportCanvas("archipelago-layout-lots.png")
        assertOverviewContentFitsTheCanvas()
        compose.runOnIdle { land = grownLand(12) }
        awaitArt()
        assertEquals(12, requireNotNull(observed.get()).islandSize)
        assertEquals(camera.zoom, requireNotNull(observed.get()).zoom, .00001f)
        exportCanvas("archipelago-layout-grown.png")
        assertOverviewContentFitsTheCanvas()
        compose.onNodeWithTag("land-next").performClick()
        compose.onNodeWithTag("land-focused-island").assertExists()
        val visited = requireNotNull(observed.get())
        val offset = LandArchipelago.offset(0)
        val slabCenter = visited.project(LandPoint(offset.x + 430f, offset.y + 391f))
        assertEquals("The native visit must use the same zero-lift camera as overview", visited.width / 2f, slabCenter.x, 1f)
        assertEquals("Controls outside the Canvas must not displace a visited slab", visited.height / 2f, slabCenter.y, 1f)
        compose.onNodeWithTag("land-focused-island").assertIsDisplayed()
        val mapBounds = map().fetchSemanticsNode().boundsInRoot
        val caption = compose.onNodeWithTag("land-focused-island").fetchSemanticsNode().boundsInRoot
        assertTrue("The small native visit caption must remain fully inside the Canvas", caption.left >= mapBounds.left &&
            caption.right <= mapBounds.right && caption.top >= mapBounds.top && caption.bottom <= mapBounds.bottom)
        val slabBottom = visited.project(LandPoint(offset.x + 430f, offset.y + 597f))
        assertTrue("The centered visited slab must leave room for its small overlay caption", slabBottom.y + mapBounds.top < caption.top)
    }

    private fun assertOverviewContentFitsTheCanvas() {
        val image = map().captureToImage().asAndroidBitmap()
        val colors = IntArray(image.width * image.height)
        image.getPixels(colors, 0, image.width, 0, 0, image.width, image.height)
        val occupiedRows = colors.indices.filter { index ->
            val color = colors[index]
            android.graphics.Color.alpha(color) > 0 &&
                (android.graphics.Color.red(color) > 18 || android.graphics.Color.green(color) > 18 || android.graphics.Color.blue(color) > 18)
        }.map { it / image.width }
        assertTrue("The actual Canvas must contain all artwork and lot outlines", occupiedRows.isNotEmpty())
        val first = occupiedRows.min(); val last = occupiedRows.max()
        assertTrue("No art may be cut at the top edge: rows=$first..$last, height=${image.height}", first > image.height * .02f)
        assertTrue("No art or label may be cut at the bottom edge: rows=$first..$last, height=${image.height}", last < image.height * .98f)
        assertTrue("The ring must use the available height instead of leaving most of the Canvas blank: rows=$first..$last, height=${image.height}", last - first > image.height * .6f)
    }

    private class SelectionHost(editable: Boolean, canSelectCore: Boolean) {
        var selected by mutableStateOf<LandMapSelection?>(null)
        var draft by mutableStateOf<LandDraft?>(null)
        var point by mutableStateOf<Pair<Int, Int>?>(null)
        var rotation by mutableStateOf(0)
        var moveAllowed by mutableStateOf(true)
        var editable by mutableStateOf(editable)
        var canSelectCore by mutableStateOf(canSelectCore)
        var tapCount = 0
    }

    private fun showSelection(fixture: Fixture, pieces: List<LandPiece>, editable: Boolean = true,
        canSelectCore: Boolean = true, islands: List<LandMapIsland> = emptyList()): SelectionHost {
        val host = SelectionHost(editable, canSelectCore)
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().padding(12.dp)) {
                TraderLandMap(fixture.land, pieces, host.draft, host.point, host.rotation, host.editable,
                    "en", { english, _ -> english }, { x, y ->
                        host.tapCount++
                        if (host.draft != null) host.point = x to y
                        else host.selected = landSelectionAt(fixture.land, pieces, x, y, host.canSelectCore)
                    }, reduceMotion = true, selectedID = host.selected?.id, islands = islands,
                    onFocus = { if (it != null) { host.selected = null; host.draft = null; host.point = null } })
                val selected = host.selected
                if (selected != null && host.draft == null) LandSelectionBar(selected.itemId, selected.core,
                    host.editable && host.moveAllowed && (!selected.core || host.canSelectCore), { english, _ -> english }, {
                        host.draft = selected.moveDraft(); host.point = selected.x to selected.y; host.rotation = selected.rotation
                    })
                if (host.draft != null) LandDraftCancelButton(true, { english, _ -> english }) {
                    host.draft = null; host.point = null
                }
            }
        } }
        return host
    }

    private fun touchCell(col: Int, row: Int) {
        val node = map().fetchSemanticsNode()
        val camera = TraderLandCamera.home(node.size.width.toFloat(), node.size.height.toFloat(), 8)
        val point = camera.project(TraderLandProjection(8).iso(col.toFloat(), row.toFloat()))
        map().performTouchInput { click(Offset(point.x, point.y)) }
        compose.waitForIdle()
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
        require(name in setOf("showcase.png", "archipelago.png", "lifted-draft.png", "free-lots.png", "archipelago-labels.png", "archipelago-layout-six.png", "archipelago-layout-lots.png", "archipelago-layout-grown.png"))
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
