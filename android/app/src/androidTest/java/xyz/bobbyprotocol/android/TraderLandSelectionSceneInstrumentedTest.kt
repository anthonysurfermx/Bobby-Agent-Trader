package xyz.bobbyprotocol.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color as AndroidColor
import android.os.Build
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
import androidx.compose.ui.graphics.asImageBitmap
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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.ui.LandSceneFootprint
import xyz.bobbyprotocol.android.ui.LandSceneSprite
import xyz.bobbyprotocol.android.ui.TraderLandProjection
import xyz.bobbyprotocol.android.ui.TraderLandSpriteCatalog
import xyz.bobbyprotocol.android.ui.drawTraderLandGround
import xyz.bobbyprotocol.android.ui.drawTraderLandSprite
import xyz.bobbyprotocol.android.ui.warmTraderLandShadows
import java.io.File
import kotlin.math.roundToInt

/** Production drawing with the approved public albedo, without accounts or a repository. */
@RunWith(AndroidJUnit4::class)
class TraderLandSelectionSceneInstrumentedTest {
    @get:Rule val compose = createComposeRule()
    private val context = InstrumentationRegistry.getInstrumentation().targetContext

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("sdk_gphone") ||
            Build.HARDWARE in setOf("ranchu", "goldfish"))
    }

    @Test fun actualSelectedPieceGetsAnAmberFootprintAndAnAmberHaloAboveTheGround() {
        warmTraderLandShadows()
        val asset = "crypto_bay_context_buoy_bloom.png"
        val image = context.assets.open("traderland/$asset").use {
            requireNotNull(BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = 2 })).asImageBitmap()
        }
        val projection = TraderLandProjection(8)
        val footprint = LandSceneFootprint(3, 2)
        val art = requireNotNull(TraderLandSpriteCatalog.art[asset])
        val sprite = LandSceneSprite(asset, projection.sprite(3, 2, 1, 1, 0, art), art, footprint)
        var selected by mutableStateOf(false)
        compose.setContent {
            Canvas(Modifier.fillMaxWidth().aspectRatio(860f / 720f).background(Color(0xFF040306)).testTag("selection-scene")) {
                scale(size.width / 860f, size.width / 860f, Offset.Zero) {
                    drawTraderLandGround(projection, listOf(footprint), ambient = false, selected = if (selected) footprint else null)
                    drawTraderLandSprite(sprite.copy(selected = selected), image, reducedMotion = true)
                }
            }
        }
        val unselected = bitmap()
        compose.runOnIdle { selected = true }
        val selectedImage = bitmap()
        val factor = selectedImage.width / 860f
        // Above the footprint top y322, only the art silhouette can add selected light.
        var haloPixels = 0
        var footprintPixels = 0
        for (y in 0 until selectedImage.height) for (x in 0 until selectedImage.width) {
            val before = unselected.getPixel(x, y)
            val after = selectedImage.getPixel(x, y)
            val red = AndroidColor.red(after) - AndroidColor.red(before)
            val green = AndroidColor.green(after) - AndroidColor.green(before)
            val blue = AndroidColor.blue(after) - AndroidColor.blue(before)
            if (red >= 8 && green >= 6 && red >= blue + 6 && green >= blue + 4) {
                if (y < (312f * factor).roundToInt()) haloPixels++
                else footprintPixels++
            }
        }
        assertTrue("The approved piece silhouette must receive selected amber light above its ground footprint; pixels=$haloPixels", haloPixels > 20)
        assertTrue("The fixed footprint must visibly indicate selection in amber; pixels=$footprintPixels", footprintPixels > 30)
        val directory = File(context.filesDir, "traderland-qa").also { check(it.mkdirs() || it.isDirectory) }
        File(directory, "selected-piece.png").outputStream().use { output ->
            check(selectedImage.compress(Bitmap.CompressFormat.PNG, 100, output))
        }
        compose.runOnIdle { selected = false }
        assertArrayEquals("Deselecting must restore the original approved artwork and ground", pixels(unselected), pixels(bitmap()))
    }

    private fun bitmap() = compose.onNodeWithTag("selection-scene").captureToImage().asAndroidBitmap()
    private fun pixels(bitmap: Bitmap) = IntArray(bitmap.width * bitmap.height).also {
        bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    }
}
