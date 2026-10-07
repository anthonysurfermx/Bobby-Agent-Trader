package xyz.bobbyprotocol.android

import android.os.Build
import android.graphics.Bitmap
import java.io.File
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.test.performTextInput
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.util.concurrent.atomic.AtomicInteger
import xyz.bobbyprotocol.android.data.BobbyQuotaOwner
import xyz.bobbyprotocol.android.data.BobbyQuotaPolicy
import xyz.bobbyprotocol.android.data.BobbyQuotaStore
import xyz.bobbyprotocol.android.data.CouponRedemptionController
import xyz.bobbyprotocol.android.data.CouponReply
import xyz.bobbyprotocol.android.ui.CouponRedemptionContent
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertTextEquals
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import xyz.bobbyprotocol.android.ui.rememberCouponSystemReducedMotion
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

    /** The runner must explicitly pin the owned emulator before any temporary setting write. */
    @Test fun systemMotionChangeWhileOpenUpdatesPolicyAndNeverReplaysReceipt() {
        assertTrue("Only the isolated AOSP emulator may run this check", Build.HARDWARE in setOf("ranchu", "goldfish"))
        // The developer's parity emulator, or the one CI boots and throws away (.github/workflows/android-emulator.yml declares it).
        val owned = InstrumentationRegistry.getArguments().getString("bobbyOwnedEmulator")
        assertTrue("Only an emulator declared as Bobby's own may have its settings changed: $owned", owned in setOf("Bobby_Parity_API35/5556", "ci-throwaway"))
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        fun shell(command: String): String = ParcelFileDescriptor.AutoCloseInputStream(automation.executeShellCommand(command))
            .bufferedReader().use { it.readText().trim() }
        val original = shell("settings get global animator_duration_scale")
        assertTrue("The setting must be safely restorable", original == "null" || original.matches(Regex("[0-9]+(\\.[0-9]+)?")))
        fun pixels(tag: String): IntArray {
            val bitmap = compose.onNodeWithTag(tag).captureToImage().asAndroidBitmap()
            return IntArray(bitmap.width * bitmap.height).also { bitmap.getPixels(it, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height) }
        }
        try {
            shell("settings put global animator_duration_scale 1")
            compose.mainClock.autoAdvance = false
            var reference by mutableStateOf(true)
            var receiptGeneration by mutableStateOf(0)
            compose.setContent { MaterialTheme { Column {
                val still = rememberCouponSystemReducedMotion()
                Text(if (still) "still" else "moving", Modifier.testTag("coupon-system-motion-policy"))
                // The reference and active receipt share the exact same pixel origin.
                // Android gradient dithering can differ for two vertically separated Canvases.
                Box(Modifier.testTag("coupon-system-motion-art")) {
                    androidx.compose.runtime.key(receiptGeneration) { CouponCelebration(reduceMotion = reference) }
                }
            } } }
            compose.onNodeWithTag("coupon-system-motion-policy").assertTextEquals("moving")
            compose.mainClock.advanceTimeByFrame()
            val resting = pixels("coupon-system-motion-art")
            compose.runOnIdle { reference = false; receiptGeneration++ }
            compose.mainClock.advanceTimeBy(240)
            assertFalse("The active receipt must be in its initial animation", pixels("coupon-system-motion-art").contentEquals(resting))
            shell("settings put global animator_duration_scale 0")
            compose.waitUntil(timeoutMillis = 3000) {
                compose.mainClock.advanceTimeByFrame()
                runCatching { compose.onNodeWithTag("coupon-system-motion-policy").assertTextEquals("still") }.isSuccess
            }
            compose.mainClock.advanceTimeByFrame()
            assertArrayEquals("Changing the real setting must show the static resting frame", resting, pixels("coupon-system-motion-art"))
            shell("settings put global animator_duration_scale 1")
            compose.waitUntil(timeoutMillis = 3000) {
                compose.mainClock.advanceTimeByFrame()
                runCatching { compose.onNodeWithTag("coupon-system-motion-policy").assertTextEquals("moving") }.isSuccess
            }
            compose.mainClock.advanceTimeBy(240)
            assertArrayEquals("The confirmed receipt must not restart its celebration", resting, pixels("coupon-system-motion-art"))
        } finally {
            if (original == "null") shell("settings delete global animator_duration_scale")
            else shell("settings put global animator_duration_scale $original")
        }
    }


    @Test fun actualFormRedeemsIntoSharedQuotaAndReturnsWithoutStartingARead() {
        val fixture = OfflineCouponFlow(alreadyRedeemed = false)
        compose.setContent { MaterialTheme { OfflineCouponForm(fixture) } }
        compose.onNodeWithTag("coupon-code").performTextInput(" fake 99 ")
        compose.onNodeWithTag("coupon-redeem").performClick()
        compose.onNodeWithTag("coupon-success").assertExists()
        compose.onNodeWithText("Tienes 10 lecturas Rápido más").assertExists()
        compose.onNodeWithText("Lecturas Profundo: +3").assertExists()
        compose.onNodeWithText("Lecturas Máximo: +1").assertExists()
        compose.onNodeWithText("Rápido: 8 · Profundo: 2 · Máximo: 1").assertExists()
        val capture = compose.onNodeWithTag("coupon-success").captureToImage().asAndroidBitmap()
        val folder = File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "traderland-qa").apply { mkdirs() }
        File(folder, "coupon-confirmed.png").outputStream().use { capture.compress(Bitmap.CompressFormat.PNG, 100, it) }
        compose.onNodeWithTag("coupon-start-read").performClick()
        compose.onNodeWithTag("coupon-offline-core").assertExists()
        compose.onNodeWithTag("coupon-offline-shared-quota").assertTextEquals("8 / 2 / 1")
        compose.onNodeWithTag("coupon-success").assertDoesNotExist()
        assertEquals(1, fixture.posts.get())
        assertEquals(0, fixture.gets.get())
        assertEquals(1, fixture.quotaApplications.get())
        assertEquals("FAKE99", fixture.submittedCode)
    }

    @Test fun actualAlreadyRedeemedFormChecksFreshBalanceWithGetAndNoSecondPost() {
        val fixture = OfflineCouponFlow(alreadyRedeemed = true)
        compose.setContent { MaterialTheme { OfflineCouponForm(fixture) } }
        compose.onNodeWithTag("coupon-code").performTextInput(" fake 99 ")
        compose.onNodeWithTag("coupon-redeem").performClick()
        compose.onNodeWithText("Este código ya fue canjeado").assertExists()
        compose.onNodeWithText("Tienes 10 lecturas Rápido más").assertDoesNotExist()
        compose.onNodeWithText("Rápido: 0 · Profundo: 0 · Máximo: 0").assertExists()
        compose.onNodeWithTag("coupon-start-read").performClick()
        compose.onNodeWithTag("coupon-success").assertDoesNotExist()
        compose.onNodeWithTag("coupon-balance").assertExists()
        compose.onNodeWithText("Rápido: 5 · Profundo: 2 · Máximo: 1").assertExists()
        assertEquals(1, fixture.posts.get())
        assertEquals(1, fixture.gets.get())
        assertEquals(1, fixture.quotaApplications.get())
        assertEquals(5, fixture.store.state.value.access?.bonus)
        assertEquals(2, fixture.store.state.value.levels?.profundo?.bonus)
        assertEquals(1, fixture.store.state.value.levels?.maximo?.bonus)
    }

    /** All identity and quota state is in memory; no repository, preferences, auth or provider exists. */
    private class OfflineCouponFlow(alreadyRedeemed: Boolean) {
        private val owner = BobbyQuotaOwner("offline-fixture-owner", 1)
        val store = BobbyQuotaStore({ owner })
        val posts = AtomicInteger()
        val gets = AtomicInteger()
        val quotaApplications = AtomicInteger()
        var submittedCode: String? = null
        private fun credits(reads: Int, deep: Int, max: Int) = JSONObject().put("reads", reads).put("profundo", deep).put("maximo", max)
        private fun snapshot(reads: Int, deep: Int, max: Int): JSONObject {
            fun meter(bonus: Int) = JSONObject().put("used", 0).put("limit", 3).put("remaining", 3)
                .put("bonus", bonus).put("windowDays", 7).put("resetsAt", JSONObject.NULL)
            return JSONObject().put("access", JSONObject().put("tier", "free").put("used", 10).put("limit", 10)
                .put("remaining", 0).put("bonus", reads).put("paywall", true).put("resetsAt", JSONObject.NULL))
                .put("levels", JSONObject().put("tier", "free").put("levels", JSONObject()
                    .put("profundo", meter(deep)).put("maximo", meter(max))))
        }
        val controller = CouponRedemptionController(
            currentOwner = { owner },
            send = { captured, code ->
                check(captured == owner)
                posts.incrementAndGet(); submittedCode = code
                CouponReply(200, if (alreadyRedeemed) snapshot(0, 0, 0).put("result", "already_redeemed")
                    .put("granted", JSONObject.NULL).put("bonus", JSONObject.NULL)
                else snapshot(8, 2, 1).put("result", "redeemed").put("granted", credits(10, 3, 1)).put("bonus", credits(20, 8, 4)))
            },
            loadBalance = { captured ->
                check(captured == owner); gets.incrementAndGet()
                val ticket = store.beginRead()
                val snapshot = BobbyQuotaPolicy.snapshot(snapshot(5, 2, 1), accountOnly = true)
                check(store.applyRead(ticket, snapshot))
                snapshot
            },
            applySnapshot = { captured, snapshot -> quotaApplications.incrementAndGet(); store.applyCoupon(captured, snapshot) },
        )
        fun capturedOwner() = owner
    }

    @Composable
    private fun OfflineCouponForm(fixture: OfflineCouponFlow) {
        val state by fixture.controller.state.collectAsStateWithLifecycle()
        val quota by fixture.store.state.collectAsStateWithLifecycle()
        val scope = rememberCoroutineScope()
        var returned by remember { mutableStateOf(false) }
        DisposableEffect(fixture) { onDispose { fixture.controller.cancel() } }
        if (returned) Column {
            Text("Offline Núcleo", Modifier.testTag("coupon-offline-core"))
            Text("${quota.access?.bonus} / ${quota.levels?.profundo?.bonus} / ${quota.levels?.maximo?.bonus}", Modifier.testTag("coupon-offline-shared-quota"))
        }
        else CouponRedemptionContent(language = "es", state = state,
            onRedeem = { code -> val owner = fixture.capturedOwner(); scope.launch { fixture.controller.redeem(code, expectedOwner = owner) } },
            onCheckBalance = { val owner = fixture.capturedOwner(); scope.launch { fixture.controller.checkBalance(expectedOwner = owner) } },
            onDismissOutcome = fixture.controller::dismissOutcome,
            onRead = { returned = true })
    }

}
