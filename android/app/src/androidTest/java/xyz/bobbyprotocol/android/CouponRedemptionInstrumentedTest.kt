package xyz.bobbyprotocol.android

import android.os.Build
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.onRoot
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import xyz.bobbyprotocol.android.data.CouponCredits
import xyz.bobbyprotocol.android.data.CouponRedemptionReceipt
import xyz.bobbyprotocol.android.ui.CouponCelebration
import xyz.bobbyprotocol.android.ui.CouponSuccessPopup

/** Empty Compose activity and offline receipts: no account, coupon, store or server mutation. */
@RunWith(AndroidJUnit4::class)
class CouponRedemptionInstrumentedTest {
    @get:Rule val compose = createComposeRule()
    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.MODEL.contains("sdk_gphone") || Build.HARDWARE in setOf("ranchu", "goldfish"))
    }
    @Test fun confirmedGiftShowsActualCountsAndReturnAction() {
        var visible by mutableStateOf(true)
        val gift = CouponCredits(10, 2, 1)
        compose.setContent { MaterialTheme {
            if (visible) CouponSuccessPopup(CouponRedemptionReceipt(gift, gift), true, "es", { visible = false }, { visible = false })
        } }
        compose.onNodeWithText("Tienes 10 lecturas Rápido más").assertExists()
        compose.onNodeWithText("Lecturas Profundo: +2").assertExists()
        compose.onNodeWithText("Lecturas Máximo: +1").assertExists()
        compose.onNodeWithText("No necesitas restaurar compras.").assertExists()
        compose.onNodeWithTag("coupon-start-read").performClick()
        compose.onNodeWithTag("coupon-success").assertDoesNotExist()
    }
    @Test fun alreadyRedeemedWithSpentGiftDoesNotPromiseAnotherGrant() {
        compose.setContent { MaterialTheme {
            CouponSuccessPopup(CouponRedemptionReceipt(null, CouponCredits(0, 0, 0)), false, "es", {}, {})
        } }
        compose.onNodeWithText("Este código ya fue canjeado").assertExists()
        compose.onNodeWithText("Tienes 10 lecturas Rápido más").assertDoesNotExist()
        compose.onNodeWithText("Rápido: 0 · Profundo: 0 · Máximo: 0").assertExists()
        compose.onNodeWithText("Comprobar mi saldo").assertExists()
    }
    @Test fun confirmedGiftWithUnknownBalanceKeepsConfirmationAndPendingCopy() {
        compose.setContent { MaterialTheme {
            CouponSuccessPopup(CouponRedemptionReceipt(CouponCredits(27, 0, 0), null), true, "fr", {}, {})
        } }
        compose.onNodeWithText("Tu as 27 analyses Rapides de plus").assertExists()
        compose.onNodeWithText("Ton cadeau est confirmé. Le solde n’a pas encore pu être chargé.").assertExists()
        compose.onNodeWithText("Faire une analyse").assertExists()
    }
    @Test fun reducedMotionDecorationExposesNoDuplicateGiftAnnouncement() {
        compose.setContent { MaterialTheme { CouponCelebration(reduceMotion = true) } }
        compose.mainClock.autoAdvance = false
        val first = compose.onRoot().captureToImage().asAndroidBitmap()
        val firstPixels = IntArray(first.width * first.height)
        first.getPixels(firstPixels, 0, first.width, 0, 0, first.width, first.height)
        compose.mainClock.advanceTimeBy(2000)
        val second = compose.onRoot().captureToImage().asAndroidBitmap()
        val secondPixels = IntArray(second.width * second.height)
        second.getPixels(secondPixels, 0, second.width, 0, 0, second.width, second.height)
        assertTrue("The decoration must render actual artwork", firstPixels.toSet().size > 4)
        assertArrayEquals("Reduced motion must stay on the static resting frame", firstPixels, secondPixels)
    }
}
