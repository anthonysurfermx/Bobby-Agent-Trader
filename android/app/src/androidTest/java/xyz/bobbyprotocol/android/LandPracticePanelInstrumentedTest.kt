package xyz.bobbyprotocol.android

import android.os.Build
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.ui.LandDraft
import xyz.bobbyprotocol.android.ui.LandPiece
import xyz.bobbyprotocol.android.ui.LandPractice
import xyz.bobbyprotocol.android.ui.LandPracticePanel
import xyz.bobbyprotocol.android.ui.LandPracticeState
import xyz.bobbyprotocol.android.ui.PracticeFootprint
import xyz.bobbyprotocol.android.ui.TraderLandCamera
import xyz.bobbyprotocol.android.ui.TraderLandMap
import xyz.bobbyprotocol.android.ui.TraderLandProjection

/** Bundled guest fixtures in the empty Compose activity; persistence is an in-memory callback. */
@RunWith(AndroidJUnit4::class)
class LandPracticePanelInstrumentedTest {
    @get:Rule val compose = createComposeRule()
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("sdk_gphone") ||
            Build.HARDWARE in setOf("ranchu", "goldfish"))
    }

    @Test fun allTwentySixBlueprintsStayGuestOnlyAndACanvasTapCommitsOneValidatedLocalPiece() {
        val bundle = bundle()
        var state by mutableStateOf(bundle.fixture)
        var draft by mutableStateOf<LandDraft?>(null)
        var point by mutableStateOf<Pair<Int, Int>?>(null)
        var rotation by mutableStateOf(0)
        var saved: String? = null
        val land = LandPractice.land()
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
                val pieces = state.placements.map { p ->
                    val footprint = bundle.catalog.getValue(p.itemId)
                    LandPiece(p.uid, p.uid, p.itemId, p.col, p.row, p.rotation, footprint.columns, footprint.rows)
                }
                TraderLandMap(land, pieces, draft, point, rotation, true, "en", { english, _ -> english },
                    { x, y -> point = x to y }, reduceMotion = true, revealRadius = LandPractice.revealRadius(state))
                LandPracticePanel(state, bundle.fixture, bundle.catalog, draft, point, rotation, true, "en", bundle::name,
                    onDraftChosen = { draft = it; point = null; rotation = 0 }, onRotation = { rotation = it },
                    onCancel = { draft = null; point = null }, onUpdate = { next -> saved = LandPractice.encode(next); state = next; true })
            }
        } }
        compose.onNodeWithTag("land-practice-blueprints").performScrollTo().performClick()
        val blueprint = SemanticsMatcher("A guest blueprint row") { node ->
            node.config.contains(SemanticsProperties.TestTag) && node.config[SemanticsProperties.TestTag].startsWith("land-practice-blueprint-")
        }
        assertEquals(26, compose.onAllNodes(blueprint).fetchSemanticsNodes().size)
        compose.onNodeWithTag("land-practice-blueprint-aura_core").assertDoesNotExist()
        compose.onNodeWithTag("land-practice-blueprint-crypto_bay_data_dock").performScrollTo().performClick()
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsNotEnabled()
        assertEquals(bundle.fixture.placements, state.placements)
        val map = compose.onNodeWithTag("land-map", useUnmergedTree = true)
        map.performScrollTo()
        compose.waitUntil(20_000) {
            val config = map.fetchSemanticsNode().config
            config.contains(SemanticsProperties.StateDescription) && config[SemanticsProperties.StateDescription] == "art-ready"
        }
        val node = map.fetchSemanticsNode()
        val camera = TraderLandCamera.home(node.size.width.toFloat(), node.size.height.toFloat(), 8)
        val freeCell = camera.project(TraderLandProjection(8).iso(1f, 1f))
        map.performTouchInput { click(Offset(freeCell.x, freeCell.y)) }
        compose.waitForIdle()
        assertEquals(1 to 1, point)
        assertEquals("A preview must not optimistically alter the local ledger", bundle.fixture.placements, state.placements)
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsEnabled().performClick()
        assertEquals(8, state.placements.size)
        assertEquals(1, state.history.size)
        assertEquals("crypto_bay_data_dock", state.placements.last().itemId)
        assertEquals(1, state.placements.last().col)
        assertEquals(1, state.placements.last().row)
        assertEquals(null, draft)
        assertNotNull(saved)
        val restored = LandPractice.load(saved, bundle.catalog, bundle.fixture)
        assertEquals(state.placements, restored.placements)
        assertEquals(state.focusLevel, restored.focusLevel)
        compose.onNodeWithTag("land-practice-feedback").performScrollTo().assertTextEquals("Practice layout updated.")
        assertEquals(7, bundle.fixture.placements.size)
    }

    @Test fun occupiedCoreAndFoggedCellsDisableConfirmationAndNeverInvokePersistence() {
        val bundle = bundle()
        val state = bundle.fixture
        val draft = LandDraft("place", "crypto_bay_data_dock", "crypto_bay_data_dock", 1, 1)
        var point by mutableStateOf(2 to 1)
        var attempts = 0
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
                LandPracticePanel(state, bundle.fixture, bundle.catalog, draft, point, 0, true, "en", bundle::name,
                    {}, {}, {}, { attempts++; true })
            }
        } }
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle { point = 3 to 3 }
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle { point = 0 to 0 }
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle { point = 8 to 1 }
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsNotEnabled()
        compose.runOnIdle { point = 1 to 1 }
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsEnabled()
        assertEquals(0, attempts)
        assertEquals(7, state.placements.size)
        assertTrue(state.history.isEmpty())
    }

    @Test fun revealUndoAndConfirmedResetUseTheSameUndoableLocalHistory() {
        val bundle = bundle()
        var state by mutableStateOf(bundle.fixture)
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
                LandPracticePanel(state, bundle.fixture, bundle.catalog, null, null, 0, true, "en", bundle::name,
                    {}, {}, {}, { next -> state = next; true })
            }
        } }
        compose.onNodeWithTag("land-practice-undo").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithTag("land-practice-reveal").performScrollTo().performClick()
        assertEquals(2, state.focusLevel)
        assertEquals(1, state.history.size)
        compose.onNodeWithTag("land-practice-reveal").performScrollTo().assertIsNotEnabled()
        compose.onNodeWithTag("land-practice-undo").performScrollTo().performClick()
        assertEquals(bundle.fixture, state)
        compose.onNodeWithTag("land-practice-reveal").performScrollTo().performClick()
        val revealed = state
        compose.onNodeWithTag("land-practice-reset").performScrollTo().performClick()
        assertEquals("Opening reset confirmation must not change the layout", revealed, state)
        compose.onNodeWithTag("land-practice-reset-confirm").performClick()
        assertEquals(1, state.focusLevel)
        assertEquals(bundle.fixture.placements, state.placements)
        compose.onNodeWithTag("land-practice-feedback").performScrollTo().assertTextEquals("Practice reset.")
        compose.onNodeWithTag("land-practice-undo").performScrollTo().performClick()
        assertEquals(revealed, state)
    }

    @Test fun aRejectedPersistenceCallbackKeepsTheDraftAndNeverAnnouncesSuccess() {
        val bundle = bundle()
        val state = bundle.fixture
        val draft = LandDraft("place", "crypto_bay_data_dock", "crypto_bay_data_dock", 1, 1)
        var attempts = 0
        var canceled = 0
        var attempted: LandPracticeState? = null
        compose.setContent { MaterialTheme {
            Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(12.dp)) {
                LandPracticePanel(state, bundle.fixture, bundle.catalog, draft, 1 to 1, 0, true, "en", bundle::name,
                    {}, {}, { canceled++ }, { next -> attempts++; attempted = next; false })
            }
        } }
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsEnabled().performClick()
        assertEquals(1, attempts)
        assertEquals(8, requireNotNull(attempted).placements.size)
        assertEquals(7, state.placements.size)
        assertTrue(state.history.isEmpty())
        assertEquals(0, canceled)
        compose.onNodeWithTag("land-practice-confirm").performScrollTo().assertIsEnabled()
        compose.onNodeWithTag("land-practice-feedback").performScrollTo().assertTextEquals("Practice could not be saved. Try again.")
        compose.onNodeWithText("Practice layout updated.").assertDoesNotExist()
    }

    private data class Bundle(val catalog: Map<String, PracticeFootprint>, val names: Map<String, String>, val fixture: LandPracticeState) {
        fun name(id: String) = names.getValue(id)
    }

    private fun bundle(): Bundle {
        val rows = context.assets.open("traderland/practice-catalog.json").bufferedReader().use { JSONArray(it.readText()) }
        val catalog = (0 until rows.length()).associate { index ->
            val item = rows.getJSONObject(index)
            item.getString("id") to PracticeFootprint(item.getInt("footprint_w"), item.getInt("footprint_h"))
        }
        val names = (0 until rows.length()).associate { index ->
            val item = rows.getJSONObject(index)
            item.getString("id") to item.getJSONObject("name").getString("en")
        }
        assertEquals(27, catalog.size)
        val raw = context.assets.open("traderland/practice-fixture.json").bufferedReader().use { it.readText() }
        return Bundle(catalog, names, requireNotNull(LandPractice.decodeFixture(raw, catalog)))
    }
}
