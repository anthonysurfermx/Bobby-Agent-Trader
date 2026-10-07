package xyz.bobbyprotocol.android.platform

import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.content.FileProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Local artwork export only, on an emulator. No chooser, messaging, account or progress mutation. */
@RunWith(AndroidJUnit4::class)
class AvatarShareCardInstrumentedTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val spec = AvatarShareSpec("orb", "Orb", "Level", 1, 0, 0, 72, emptyList())

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("sdk_gphone") || Build.HARDWARE in setOf("ranchu", "goldfish"))
    }

    @Test fun approvedArtworkExportsAsAReadablePngThroughOnlyTheNarrowProviderPath() {
        val file = AvatarShareCard.create(context, spec)
        try {
            assertEquals(File(context.cacheDir, "avatar-share").canonicalPath, file.parentFile!!.canonicalPath)
            val bitmap = BitmapFactory.decodeFile(file.absolutePath)
            try { assertEquals(1080, bitmap.width); assertEquals(1440, bitmap.height) }
            finally { bitmap.recycle() }
            val uri = FileProvider.getUriForFile(context, context.packageName + ".avatar-share", file)
            assertEquals("content", uri.scheme)
            assertEquals(context.packageName + ".avatar-share", uri.authority)
            assertTrue(uri.path!!.startsWith("/avatar_cards/"))
            val copied = context.contentResolver.openInputStream(uri)!!.use { it.readBytes() }
            assertArrayEquals(file.readBytes(), copied)
            assertFalse(copied.isEmpty())
        } finally { file.delete() }
    }

    @Test fun invalidAssetPathsAndUnrelatedCacheFilesCannotBeShared() {
        for (invalid in listOf("../nucleo", "https://other.invalid", "orb/../../private", "")) {
            try { AvatarShareCard.create(context, spec.copy(companionId = invalid)); fail("Invalid artwork must be rejected") }
            catch (_: IllegalArgumentException) { }
        }
        try {
            FileProvider.getUriForFile(context, context.packageName + ".avatar-share", File(context.cacheDir, "unrelated-test-file"))
            fail("Provider must not expose the entire cache directory")
        } catch (_: IllegalArgumentException) { }
    }
}
