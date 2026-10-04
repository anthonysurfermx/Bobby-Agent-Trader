package xyz.bobbyprotocol.android

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.FixMethodOrder
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters
import xyz.bobbyprotocol.android.ui.LandSceneFootprint
import xyz.bobbyprotocol.android.ui.TraderLandProjection
import xyz.bobbyprotocol.android.ui.drawTraderLandGround
import xyz.bobbyprotocol.android.ui.warmTraderLandShadows
import java.io.File
import kotlin.math.roundToInt

/** Actual production ground painting, in an empty activity without accounts, assets or network. */
@RunWith(AndroidJUnit4::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class TraderLandSceneInstrumentedTest {
    @get:Rule val compose = createComposeRule()
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("sdk_gphone") ||
            Build.HARDWARE in setOf("ranchu", "goldfish"))
    }

    @Test fun ownIslandHaloAddsVioletLightAndPublicIslandCanSuppressIt() {
        var ambient by mutableStateOf(false)
        compose.setContent {
            Canvas(Modifier.fillMaxWidth().aspectRatio(860f / 720f).background(Color(0xFF040306)).testTag("scene-ground")) {
                scale(size.width / 860f, size.width / 860f, Offset.Zero) {
                    drawTraderLandGround(TraderLandProjection(8), emptyList(), ambient = ambient)
                }
            }
        }
        val without = bitmap()
        compose.runOnIdle { ambient = true }
        val with = bitmap()
        export("ground-violet-halo.png", with)
        // Above the slab, light is unobscured by the ground, art, grid or fog.
        val baseline = sample(without, 430f, 165f)
        val lit = sample(with, 430f, 165f)
        val red = AndroidColor.red(lit) - AndroidColor.red(baseline)
        val green = AndroidColor.green(lit) - AndroidColor.green(baseline)
        val blue = AndroidColor.blue(lit) - AndroidColor.blue(baseline)
        assertTrue("Ambient light must visibly contribute to the scene; delta=$red,$green,$blue", red >= 2 && blue >= 3)
        assertTrue("The canonical ambient halo is violet; delta=$red,$green,$blue", blue > red && red >= green && blue >= green + 2)
        compose.runOnIdle { ambient = false }
        assertArrayEquals("A public island suppresses its own halo without changing the slab", pixels(without), pixels(bitmap()))
    }

    @Test fun contactShadowHasASoftPenumbraWithoutADarkerOutlineRidge() {
        warmTraderLandShadows()
        compose.setContent {
            Canvas(Modifier.fillMaxWidth().aspectRatio(860f / 720f).background(Color(0xFF040306)).testTag("scene-ground")) {
                scale(size.width / 860f, size.width / 860f, Offset.Zero) {
                    drawTraderLandGround(TraderLandProjection(8), listOf(LandSceneFootprint(3, 3, 2, 2)), ambient = false)
                }
            }
        }
        val image = bitmap()
        export("ground-soft-contact.png", image)
        // The fixed 2×2 footprint has its top at y345; the shrunken shadow starts near y354.
        val outside = AndroidColor.red(sample(image, 430f, 338f))
        val edge = AndroidColor.red(sample(image, 430f, 354f))
        val center = AndroidColor.red(sample(image, 430f, 393f))
        assertTrue("Contact must be darker than the untouched ground; outside=$outside center=$center", outside >= center + 5)
        assertTrue("The boundary must blend between ground and contact; outside=$outside edge=$edge center=$center", edge >= center + 1 && edge <= outside - 1)
        val approach = listOf(349f, 352f, 355f, 358f, 361f).map { AndroidColor.red(sample(image, 430f, it)) }
        assertTrue("Shadow opacity must increase smoothly toward the piece; profile=$approach center=$center", approach.zipWithNext().all { (a, b) -> a >= b - 1 })
        assertTrue("The soft perimeter must not form a darker ridge than the contact center; profile=$approach center=$center", approach.all { it >= center - 1 })
    }

    @Test fun cachedFootprintPreparationPreservesTheCompleteRestingGround() {
        val start = SystemClock.elapsedRealtimeNanos()
        warmTraderLandShadows()
        val firstWarm = SystemClock.elapsedRealtimeNanos() - start
        compose.setContent {
            Canvas(Modifier.fillMaxWidth().aspectRatio(860f / 720f).background(Color(0xFF040306)).testTag("scene-ground")) {
                scale(size.width / 860f, size.width / 860f, Offset.Zero) {
                    drawTraderLandGround(TraderLandProjection(8), listOf(
                        LandSceneFootprint(1, 1), LandSceneFootprint(3, 1, 2, 1),
                        LandSceneFootprint(1, 3, 1, 2), LandSceneFootprint(4, 4, 2, 2)), ambient = false)
                }
            }
        }
        val before = pixels(bitmap())
        val repeatStart = SystemClock.elapsedRealtimeNanos()
        repeat(100) { warmTraderLandShadows() }
        val repeatedWarm = SystemClock.elapsedRealtimeNanos() - repeatStart
        Log.i("TraderLandShadowQA", "firstWarmNs=$firstWarm repeatedWarm100Ns=$repeatedWarm")
        compose.mainClock.advanceTimeBy(1_000)
        compose.waitForIdle()
        assertArrayEquals("Cache warm calls must preserve all four footprint shapes on a static Canvas", before, pixels(bitmap()))
    }

    private fun bitmap() = compose.onNodeWithTag("scene-ground").captureToImage().asAndroidBitmap()

    private fun sample(bitmap: Bitmap, x: Float, y: Float): Int {
        val scale = bitmap.width / 860f
        val px = (x * scale).roundToInt().coerceIn(1, bitmap.width - 2)
        val py = (y * scale).roundToInt().coerceIn(1, bitmap.height - 2)
        val patch = (-1..1).flatMap { dy -> (-1..1).map { dx -> bitmap.getPixel(px + dx, py + dy) } }
        return AndroidColor.rgb(patch.map(AndroidColor::red).sorted()[4], patch.map(AndroidColor::green).sorted()[4], patch.map(AndroidColor::blue).sorted()[4])
    }

    private fun pixels(bitmap: Bitmap) = IntArray(bitmap.width * bitmap.height).also {
        bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    }

    private fun export(name: String, bitmap: Bitmap) {
        val directory = File(context.filesDir, "traderland-qa").also { check(it.mkdirs() || it.isDirectory) }
        File(directory, name).outputStream().use { output -> check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output)) }
    }
}
