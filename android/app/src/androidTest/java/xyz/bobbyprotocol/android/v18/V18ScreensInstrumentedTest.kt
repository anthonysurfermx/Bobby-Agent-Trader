package xyz.bobbyprotocol.android.v18

import android.os.Build
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.ComposeTimeoutException
import androidx.compose.ui.test.assertContentDescriptionContains
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import xyz.bobbyprotocol.android.billing.BillingOfferingsStatus
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.v18.harness.Harness
import xyz.bobbyprotocol.android.v18.harness.HarnessCenter
import xyz.bobbyprotocol.android.v18.memory.MemoryCenter
import xyz.bobbyprotocol.android.v18.memory.MemoryConsentModel
import xyz.bobbyprotocol.android.v18.reminders.ReminderCenter
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Every 1.8 screen drawn on an emulator with a believable state, in English and in Spanish, and a
 * screenshot of each (`V18Shots`), so a person can look at what the JVM tests can only describe.
 * The screens, the sheet around them, the host and every model behind them are the app's own; the
 * account, the network's answers and the clock are staged (V18Stage, V18Fixtures). Each test also
 * asserts what must be on the screen for the picture to mean what its name says.
 */
@RunWith(Parameterized::class)
class V18ScreensInstrumentedTest(private val language: String) {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private var staged: V18Stage? = null
    /** The system's font size as it was, when a test changed it. */
    private var fontScaleBefore: String? = null
    /** Controls that answered to less than 48 dp in a picture of this test. */
    private val smallTargets = ArrayList<String>()

    @Before fun requireEmulator() {
        assumeTrue(Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") || Build.MODEL.contains("sdk_gphone") ||
                   Build.HARDWARE in setOf("ranchu", "goldfish"))
    }

    @After fun leaveTheStage() {
        val before = fontScaleBefore
        fontScaleBefore = null
        if (before != null) V18Shots.shell("settings put system font_scale " + (before.toFloatOrNull() ?: 1f))
        val made = staged
        staged = null
        if (made != null) {
            compose.runOnUiThread {
                made.bench.closeSheet()
                made.close()
            }
        }
        assertTrue("Controls a finger cannot reach with 48 dp: $smallTargets", smallTargets.isEmpty())
    }

    // ---- Credits ----

    @Test fun creditsOfAFreeAccountMidWeek() {
        val stage = open {
            network.answer("GET", ACCESS, V18Fixtures.freeAccount())
            bench.shell.billing.value = storeReady
        }
        present(stage, V18Routes.CREDITS, "credits-line-quick")
        compose.onNodeWithTag("credits-line-quick", useUnmergedTree = true).assertContentDescriptionContains("7", substring = true)
        compose.onNodeWithTag("credits-line-quick", useUnmergedTree = true).assertContentDescriptionContains("20", substring = true)
        for (tag in listOf("credits-line-deep", "credits-line-max", "credits-line-gifts", "credits-invite", "credits-coupon", "credits-restore")) assertShown(tag)
        assertAbsent("credits-unavailable")
        shot("credits-free")
        expandSheet()
        shot("credits-free-full")
        tap("credits-close-info")
        await("credits-details")
        shot("credits-free-details")
    }

    @Test fun creditsOfAGuest() {
        val stage = open(owner = null) {
            network.answer("GET", ACCESS, V18Fixtures.guest())
            bench.shell.billing.value = storeReady
        }
        present(stage, V18Routes.CREDITS, "credits-line-quick")
        compose.onNodeWithTag("credits-line-quick", useUnmergedTree = true).assertContentDescriptionContains("4", substring = true)
        assertShown("credits-free-account")
        assertShown("credits-sign-in-google")
        expandSheet()
        shot("credits-guest")
    }

    @Test fun creditsWhenTheBalanceIsUnknown() {
        // The staged network has no answer for the balance: the screen must say so and show no number.
        val stage = open { bench.shell.billing.value = storeReady }
        present(stage, V18Routes.CREDITS, "credits-unavailable")
        assertShown("credits-retry")
        for (tag in listOf("credits-line-quick", "credits-line-deep", "credits-line-max", "credits-line-gifts")) assertAbsent(tag)
        shot("credits-unknown")
    }

    // ---- Invite ----

    @Test fun inviteAsTheServerAnswersToday() {
        // Bobby Pro is not sold through Google Play yet, so no reward is promised: the code and the link only.
        val stage = open {
            network.answer("GET", ACCESS, V18Fixtures.freeAccount())
            bench.shell.billing.value = storeReady
        }
        present(stage, "invite", "invite-share-link")
        assertShown("invite-copy-code")
        assertShown("invite-have-code")
        assertAbsent("invite-close-info")
        shot("invite")
    }

    @Test fun inviteOnceGooglePlaySellsBobbyPro() {
        val stage = open {
            network.answer("GET", ACCESS, V18Fixtures.freeAccount(googlePlay = true))
            bench.shell.billing.value = storeReady
        }
        present(stage, "invite", "invite-share-link")
        assertShown("invite-close-info")
        expandSheet()
        shot("invite-reward")
    }

    // ---- Theses ----

    @Test fun myThesesWithTwoActiveAndOneArchived() {
        val stage = open { V18Fixtures.theses(this) }
        present(stage, V18Routes.THESES, "theses-review-NVDA")
        assertShown("theses-review-BTC")
        assertShown("theses-archived-toggle")
        assertAbsent("theses-archived-TSLA")
        shot("theses")
        tap("theses-archived-toggle")
        await("theses-archived-TSLA")
        expandSheet()
        shot("theses-archived")
    }

    @Test fun thesisEditorWithNothingWritten() {
        val stage = open()
        compose.runOnUiThread {
            stage.host.readDelivered(V18Fixtures.read(language, V18Fixtures.READ_AAPL, "AAPL", "Apple", true, 229.1, V18Stage.NOW, withSynthesis = false))
            stage.host.readSaved(V18Fixtures.READ_AAPL, "AAPL")
            stage.host.focus.draftRequestId = V18Fixtures.READ_AAPL
            stage.present(V18Routes.THESIS_EDITOR)
        }
        await("thesis-editor-save")
        assertShown("thesis-editor-why")
        assertShown("thesis-editor-scope")
        assertAbsent("thesis-editor-draft-note")
        shot("editor-empty")
    }

    @Test fun thesisEditorWithBobbysDraft() {
        val stage = open()
        compose.runOnUiThread {
            stage.host.readDelivered(V18Fixtures.read(language, V18Fixtures.READ_AAPL, "AAPL", "Apple", true, 229.1, V18Stage.NOW))
            stage.host.readSaved(V18Fixtures.READ_AAPL, "AAPL")
            stage.host.focus.draftRequestId = V18Fixtures.READ_AAPL
            stage.present(V18Routes.THESIS_EDITOR)
        }
        await("thesis-editor-save")
        // Words that are already there are never folded away: the two optional questions show.
        for (tag in listOf("thesis-editor-draft-note", "thesis-editor-worry", "thesis-editor-change-mind", "thesis-editor-horizon")) assertShown(tag)
        shot("editor-draft")
        // A long press on the words: the keyboard comes up, a word is selected, the handles show.
        compose.onNodeWithTag("thesis-editor-why", useUnmergedTree = true).performTouchInput { longClick(Offset(width * 0.3f, height * 0.3f)) }
        compose.waitForIdle()
        Thread.sleep(1_500)
        shot("editor-selecting")
    }

    @Test fun thesisReviewBeforeAndAfter() {
        val stage = reviewStage()
        shot("review-before")
        assertTrue("Nothing is sent before the person asks for the review", stage.network.paths("POST").none { it == DEBATE })
        tap("thesis-review-start")
        await("thesis-review-keep", 40_000)
        // What left the phone: one desk request, carrying the person's own words for this one review.
        val sent = stage.network.calls.filter { it.method == "POST" && it.path == DEBATE }
        assertEquals(1, sent.size)
        assertTrue(JSONObject(sent.single().body ?: "{}").optJSONObject("thesis")?.optString("hypothesis").orEmpty().isNotEmpty())
        for (tag in listOf("thesis-review-verdict", "thesis-review-headline", "thesis-review-then-now", "thesis-review-not-checked",
                           "thesis-review-supports", "thesis-review-challenges", "thesis-review-unknowns")) assertShown(tag)
        assertShown("thesis-review-keep")
        assertShown("thesis-review-footer")
        shot("review-after")
    }

    // ---- Memory ----

    @Test fun memoryWithThreeAssets() {
        val stage = open {
            memory.reply = { _, _, _ -> V18Fixtures.memory() }
            V18Fixtures.theses(this)
            desk.shortcuts = listOf("NVDA", "BTC", "AAPL")
        }
        // The person said yes to memory on this phone, through the consent, as the app requires.
        assertTrue(onStage(stage) { MemoryConsentModel(MemoryCenter.of(stage.host)).remember() })
        present(stage, "memory", "memory-enabled")
        await("memory-forget-NVDA")
        for (tag in listOf("memory-native-opt-in", "memory-forget-BTC", "memory-forget-AAPL", "memory-prefs", "memory-local", "memory-retention", "memory-forget-all")) assertShown(tag)
        shot("memory")
        for (tag in listOf("memory-prefs", "memory-local", "memory-retention")) tap(tag)
        await("memory-local-shortcuts")
        compose.onNodeWithTag("memory-forget-all", useUnmergedTree = true).performScrollTo()
        shot("memory-unfolded")

        // Nothing was asked about on this phone yet, so the follow-ups keep nothing and say nothing.
        assertAbsent("memory-local-follow-ups")
        // Three questions later (no yes to follow-ups was ever given): what the phone noted is listed with
        // the rest of what it keeps, and "Clear" removes it.
        compose.runOnUiThread { V18Fixtures.askedThisWeek(stage) }
        await("memory-local-follow-ups")
        assertTrue(compose.onAllNodes(hasTestTag("memory-local-follow-ups") and hasText("NVDA", substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        compose.onNodeWithTag("memory-clear-follow-ups", useUnmergedTree = true).performScrollTo()
        shot("memory-follow-ups-kept")
        tap("memory-clear-follow-ups")
        compose.waitUntil(10_000) { compose.onAllNodesWithTag("memory-local-follow-ups", useUnmergedTree = true).fetchSemanticsNodes().isEmpty() }
        assertTrue(compose.runOnUiThread<Boolean> { Harness.center(stage.host).ledger.isEmpty })
    }

    @Test fun memoryConsent() {
        val stage = open { memory.reply = { _, _, _ -> V18Fixtures.memory() } }
        val asked = stage.memory.calls.size
        present(stage, V18Routes.MEMORY_CONSENT, "memory-consent-close")
        shot("memory-consent")
        expandSheet()
        await("memory-consent-accept")
        assertShown("memory-consent-decline")
        assertShown("memory-consent-privacy")
        assertEquals("Opening the consent sends nothing", asked, stage.memory.calls.size)
        shot("memory-consent-full")
    }

    // ---- Reminders and follow-ups ----

    @Test fun remindersWithOneSetOneNotAndTheFollowUpRows() {
        val stage = weekStage()
        present(stage, V18Routes.REMINDERS, "reminders-follow-ups")
        for (tag in listOf("reminders-thesis-NVDA", "reminders-change-NVDA", "reminders-remove-NVDA", "reminders-thesis-BTC", "reminders-set-BTC", "reminders-week")) assertShown(tag)
        assertAbsent("reminders-set-NVDA")
        assertAbsent("reminders-risk-required")
        shot("reminders")
        tap("reminders-set-BTC")
        await("reminders-week-BTC")
        shot("reminders-choosing")
        // "Choose date": the day and the time, each a capsule that opens Material's own picker.
        tap("reminders-pick-BTC")
        await("reminders-date-BTC")
        expandSheet()
        shot("reminders-picking")
        tap("reminders-date-BTC")
        await("reminders-day-confirm")
        // Material's picker speaks the app's language, whatever the phone's (this emulator's is English).
        val month = if (language == "es") "octubre" else "October"
        assertTrue("The day picker does not say $month", compose.onAllNodes(hasText(month, substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty())
        shot("reminders-day-picker")
        tap("reminders-day-cancel")
        tap("reminders-time-BTC")
        await("reminders-time-confirm")
        shot("reminders-time-picker")
    }

    @Test fun followUpBoardOfTheWeek() {
        val stage = weekStage()
        compose.runOnUiThread {
            Harness.center(stage.host).focusBoard(null)
            stage.present(V18Routes.FOLLOW_UP)
        }
        await("follow-row-NVDA")
        // One price per row, none of them a read. A row whose price did not arrive shows no number.
        compose.waitUntil(20_000) {
            listOf("follow-row-NVDA", "follow-row-BTC").all { row ->
                compose.onAllNodes(hasTestTag(row) and hasContentDescription("%", substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
            }
        }
        assertShown("follow-row-AAPL")
        assertTrue(compose.onAllNodes(hasTestTag("follow-row-AAPL") and hasContentDescription("%", substring = true), useUnmergedTree = true).fetchSemanticsNodes().isEmpty())
        assertTrue("A board row reads a price, never an analysis", stage.network.paths("POST").none { it == DEBATE })
        shot("follow-up-board")
    }

    // ---- The two densest screens at the largest font size ----

    @Test fun thesisReviewAfterAtDoubleFontSize() {
        useSystemFontScale(2f)
        reviewStage()
        tap("thesis-review-start")
        await("thesis-review-keep", 40_000)
        shot("review-after-200")
        compose.onNodeWithTag("thesis-review-footer", useUnmergedTree = true).performScrollTo()
        shot("review-after-200-end")
    }

    @Test fun memoryConsentAtDoubleFontSize() {
        useSystemFontScale(2f)
        val stage = open { memory.reply = { _, _, _ -> V18Fixtures.memory() } }
        present(stage, V18Routes.MEMORY_CONSENT, "memory-consent-close")
        expandSheet()
        shot("memory-consent-200")
        // The two answers follow the last line: they are reached by scrolling, stacked at this size.
        compose.onNodeWithTag("memory-consent-accept", useUnmergedTree = true).performScrollTo()
        assertShown("memory-consent-decline")
        shot("memory-consent-200-end")
    }

    // ---- The stage ----

    /** A reader with the two theses, on the review of NVDA, before it starts. */
    private fun reviewStage(): V18Stage {
        lateinit var theses: V18Fixtures.Theses
        val stage = open {
            network.answer("GET", ACCESS, V18Fixtures.freeAccount())
            network.answer("POST", DEBATE) { V18Fixtures.review(language) }
            theses = V18Fixtures.theses(this)
        }
        compose.runOnUiThread {
            stage.host.focus.thesisId = theses.nvda.id
            stage.present(V18Routes.THESIS_REVIEW)
        }
        await("thesis-review-start")
        assertShown("thesis-review-providers")
        assertShown("thesis-review-excerpt")
        return stage
    }

    /** A reader who asked about three assets this week, said yes to follow-ups and set one reminder. */
    private fun weekStage(): V18Stage {
        lateinit var theses: V18Fixtures.Theses
        val stage = open {
            network.answer("GET", ACCESS, V18Fixtures.freeAccount())
            network.answer("POST", "/api/voice-tool") { call -> V18Fixtures.market(call) }
            theses = V18Fixtures.theses(this)
        }
        compose.runOnUiThread { V18Fixtures.askedThisWeek(stage) }
        assertEquals(HarnessCenter.Outcome.ON, onStage(stage) { Harness.center(stage.host).accept() })
        val friday = V18Stage.at(2026, 10, 16, 18)
        assertEquals(ReminderCenter.Outcome.Scheduled(friday), onStage(stage) { ReminderCenter.of(stage.host).schedule(theses.nvda.id, "NVDA", friday) })
        return stage
    }

    /**
     * Builds the reader and draws the screen. `prepare` runs before the features register on the
     * host (the network's answers, what the phone already holds).
     */
    private fun open(owner: String? = V18Stage.ACCOUNT, prepare: V18Stage.() -> Unit = {}): V18Stage {
        val made = compose.runOnUiThread {
            V18Stage(instrumentation.targetContext, language, owner).also {
                it.prepare()
                it.start()
            }
        }
        staged = made
        compose.setContent { StageScreen(made) }
        compose.waitForIdle()
        return made
    }

    /**
     * The system's own font size setting, as a person changes it in Settings: the activity is rebuilt
     * for it, and so is every sheet. Call it before the stage is opened; it is put back when the test ends.
     */
    private fun useSystemFontScale(scale: Float) {
        fontScaleBefore = V18Shots.shell("settings get system font_scale").trim()
        V18Shots.shell("settings put system font_scale $scale")
        compose.waitUntil(30_000) { compose.activity.resources.configuration.fontScale == scale }
        compose.waitForIdle()
    }

    /** Runs what a person's tap would start, on the host's own scope, and waits for its answer. */
    private fun <T> onStage(stage: V18Stage, block: suspend () -> T): T {
        val done = CompletableDeferred<T>()
        compose.runOnUiThread {
            stage.scope.launch {
                try { done.complete(block()) } catch (failure: Throwable) { done.completeExceptionally(failure) }
            }
        }
        return runBlocking { withTimeout(30_000) { done.await() } }
    }

    private fun present(stage: V18Stage, route: String, tag: String) {
        compose.runOnUiThread { stage.present(route) }
        await(tag)
        // The sheet is a window of its own: composed is not yet on the display. A row under the fold of
        // a half-height sheet never is, so this wait gives up quietly.
        runCatching {
            compose.waitUntil(5_000) { runCatching { compose.onNodeWithTag(tag, useUnmergedTree = true).assertIsDisplayed() }.isSuccess }
        }
    }

    private fun await(tag: String, timeoutMillis: Long = 20_000) {
        try {
            compose.waitUntil(timeoutMillis) { compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        } catch (late: ComposeTimeoutException) {
            // What was on the screen instead, for whoever reads the failure.
            runCatching { V18Shots.save("failed-waiting-for-" + tag.lowercase() + "-" + language) }
            throw late
        }
    }

    private fun assertShown(tag: String) {
        assertFalse("Expected $tag on the screen", compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isEmpty())
    }

    private fun assertAbsent(tag: String) {
        assertTrue("Expected no $tag on the screen", compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isEmpty())
    }

    /** What a tap does, asked of the control itself: a row below the fold of a half-height sheet is still reached. */
    private fun tap(tag: String) {
        compose.onNodeWithTag(tag, useUnmergedTree = true).performSemanticsAction(SemanticsActions.OnClick)
        compose.waitForIdle()
    }

    /** A routine sheet opens at half height; a pull upwards shows the rest of it. */
    private fun expandSheet() {
        val device = UiDevice.getInstance(instrumentation)
        device.swipe(device.displayWidth / 2, device.displayHeight * 3 / 5, device.displayWidth / 2, device.displayHeight / 8, 12)
        compose.waitForIdle()
    }

    private fun shot(name: String) {
        compose.waitForIdle()
        // The frame that was just composed has to reach the display before it is captured.
        Thread.sleep(700)
        V18Shots.save("$name-$language")
        measureTouchTargets("$name-$language")
    }

    /**
     * What a finger can reach of every control on the screen, measured: a control answers to 48 dp
     * in both directions, or the test fails when it ends (after its pictures are saved) and names it.
     * A control cut by the edge of the scroll is measured when it is in full view, in another picture.
     */
    private fun measureTouchTargets(picture: String) {
        val density = compose.density.density
        val controls = compose.onAllNodes(hasClickAction(), useUnmergedTree = true).fetchSemanticsNodes()
        var small = 0
        for (node in controls) {
            val drawn = node.boundsInRoot
            if (abs(drawn.width - node.size.width) > 1f || abs(drawn.height - node.size.height) > 1f) continue
            val touch = node.touchBoundsInRoot
            val width = touch.width / density
            val height = touch.height / density
            if (width >= 47.5f && height >= 47.5f) continue
            small += 1
            val label = node.config.getOrNull(SemanticsProperties.TestTag)
                ?: node.config.getOrNull(SemanticsProperties.ContentDescription)?.joinToString()
                ?: node.config.getOrNull(SemanticsProperties.Text)?.joinToString { it.text } ?: "unnamed"
            Log.w("V18Targets", "$picture: $label answers to ${width.roundToInt()}x${height.roundToInt()} dp")
            smallTargets.add("$label in $picture (${width.roundToInt()}x${height.roundToInt()} dp)")
        }
        Log.i("V18Targets", "$picture: ${controls.size} controls, $small under 48 dp")
    }

    private val storeReady = BillingState(configured = true, identityReady = true, offeringsStatus = BillingOfferingsStatus.READY, restoreAllowed = true)

    companion object {
        private const val ACCESS = "/api/bobby-access"
        private const val DEBATE = "/api/desk-debate"

        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun languages(): Collection<Array<Any>> = listOf(arrayOf<Any>("en"), arrayOf<Any>("es"))
    }
}
