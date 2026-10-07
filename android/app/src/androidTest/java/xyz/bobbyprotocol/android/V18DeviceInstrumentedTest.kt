package xyz.bobbyprotocol.android

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.service.notification.StatusBarNotification
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.core.content.ContextCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import androidx.webkit.WebViewFeature
import androidx.work.WorkInfo
import androidx.work.WorkManager
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.FixMethodOrder
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.MethodSorters
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.nucleo.NucleoStateStore
import xyz.bobbyprotocol.android.platform.LocalNotices
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.StageNetwork
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.V18Fixtures
import xyz.bobbyprotocol.android.v18.V18Process
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18Runtime
import xyz.bobbyprotocol.android.v18.V18Shots
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.reminders.PendingReminder
import xyz.bobbyprotocol.android.v18.reminders.ReminderCenter
import xyz.bobbyprotocol.android.v18.reminders.ReminderCopy
import xyz.bobbyprotocol.android.v18.reminders.ReminderEntry
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.util.regex.Pattern

/**
 * Bobby 1.8 in the real app on an emulator: MainActivity, its session, the bundled page and the
 * phone's own services (the permission question, WorkManager, the notification shade, a rotation).
 *
 * The reader is a guest who has finished onboarding and accepted the risk notice. That state is
 * written through the app's own store before the activity starts, not walked through the page: the
 * page draws a WebGL scene that a CI emulator renders in software, too slowly to drive by script
 * (MainActivityAcceptanceInstrumentedTest walks the onboarding itself). No account, no purchase, no
 * credentials.
 *
 * Nothing leaves the emulator: the phone is in airplane mode for every case, and the repository's
 * transport is the staged one (StageNetwork), which answers the balance from V18Fixtures and
 * refuses everything else. The phone's preferences are put back after each case.
 *
 * The cases run in name order: the system asks its notification question once per install, so the
 * case that waits for it comes before the ones that grant the permission from the shell.
 */
@RunWith(AndroidJUnit4::class)
@FixMethodOrder(MethodSorters.NAME_ASCENDING)
class V18DeviceInstrumentedTest {
    @get:Rule val compose = createEmptyComposeRule()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context get() = instrumentation.targetContext
    private val device: UiDevice get() = UiDevice.getInstance(instrumentation)
    private val notifications: NotificationManager get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private var scenario: ActivityScenario<MainActivity>? = null
    private lateinit var activity: MainActivity
    private val network = StageNetwork()
    private val backups = linkedMapOf<String, Map<String, *>>()
    private var offline = false
    private var rotated = false
    /** The intent the activity was started with (a tapped notice replaces it). */
    private var launchIntent: Intent? = null

    /** The 1.8 host of the activity on screen. */
    private val host: V18Runtime get() = checkNotNull(V18Process.runtime) { "MainActivity has no 1.8 host" }

    @Before fun setUp() {
        val emulator = Build.FINGERPRINT.startsWith("generic") || Build.FINGERPRINT.contains("emulator") ||
            Build.MODEL.contains("Emulator") || Build.MODEL.contains("sdk_gphone") || Build.HARDWARE in setOf("ranchu", "goldfish")
        assumeTrue("Only dedicated emulator test data may be altered", emulator)
        assumeTrue(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))
        assumeTrue("These cases are a guest's; a signed-in installation is left alone", BobbyRepository(context).session.value == null)
        // The activity starts past the risk notice and asks for the balance at once, before a test can
        // hand it the staged network: the phone is offline, so that first request goes nowhere.
        offline = true
        V18Shots.shell("cmd connectivity airplane-mode enable")
        assumeTrue("The emulator could not be taken offline", V18Shots.shell("settings get global airplane_mode_on").trim() == "1")
        for (name in PREFERENCES) {
            val preferences = context.getSharedPreferences(name, Context.MODE_PRIVATE)
            backups[name] = HashMap(preferences.all)
            assertTrue(preferences.edit().clear().commit())
        }
        V18Process.taps.clear()
        network.answer("GET", "/api/bobby-access", V18Fixtures.guest())
    }

    @After fun tearDown() {
        if (rotated) runCatching { device.setOrientationNatural(); device.unfreezeRotation() }
        if (offline) runCatching { V18Shots.shell("cmd connectivity airplane-mode disable") }
        // The scenario follows the activity only while its intent is the one it was started with, and a
        // tapped notice replaces it (`onNewIntent`): it is put back, or closing waits for an end it cannot see.
        runCatching { onMain { launchIntent?.let { started -> if (::activity.isInitialized) activity.intent = started } } }
        scenario?.close(); scenario = null
        runCatching { WorkManager.getInstance(context).cancelAllWorkByTag(LocalNotices.WORK_TAG).result.get(10, TimeUnit.SECONDS) }
        runCatching { notifications.cancelAll() }
        V18Process.taps.clear()
        backups.forEach { (name, values) ->
            val editor = context.getSharedPreferences(name, Context.MODE_PRIVATE).edit().clear()
            values.forEach { (key, value) -> editor.restore(key, value) }
            assertTrue(editor.commit())
        }
        backups.clear()
    }

    // ---- The profile and its 1.8 rows ----

    @Test fun case1_theProfileOpensCreditsItsDetailsAndCloses_inEnglish() = profileToCredits("en")

    @Test fun case1_theProfileOpensCreditsItsDetailsAndCloses_inSpanish() = profileToCredits("es")

    private fun profileToCredits(language: String) {
        launch(language)
        awaitTheGlass()
        assertTrue(onMain { host.present("account") })
        waitForSheet("account")
        compose.onNodeWithTag("account-profile").assertExists()
        // The four doors of 1.8, each a row of the profile.
        for (tag in listOf("account-credits", "account-theses", "account-reminders", "account-memory")) compose.onNodeWithTag(tag).assertExists()
        compose.onNodeWithTag("account-memory").performScrollTo()
        compose.waitUntil(20_000) { runCatching { compose.onNodeWithTag("account-credits").assertIsDisplayed() }.isSuccess }
        shot("profile-rows-$language")

        compose.onNodeWithTag("account-credits").performScrollTo().performClick()
        waitForSheet(V18Routes.CREDITS)
        await("credits-line-quick")
        shot("profile-credits-$language")

        compose.onNodeWithTag("credits-close-info", useUnmergedTree = true).performClick()
        await("credits-details")
        shot("profile-credits-details-$language")

        compose.onNodeWithTag("credits-details-close", useUnmergedTree = true).performClick()
        await("credits-line-quick")
        compose.onNodeWithTag("credits-close", useUnmergedTree = true).performClick()
        waitForNoSheet()
        assertFalse(activity.isFinishing)
        // The balance was read, and looking at it sent nothing else: no analysis, nothing that changes an account.
        assertTrue(network.paths("GET").contains("/api/bobby-access"))
        assertTrue("Unexpected requests: " + network.calls.map { it.method + " " + it.path },
                   network.calls.none { it.method != "GET" && it.path != "/api/bobby-asset-search" })
    }

    // ---- The system's notification question ----

    @Test fun case2_theNotificationQuestionComesOnlyAfterTheInAppYes() {
        assumeTrue("Before Android 13 there is no question to ask", Build.VERSION.SDK_INT >= 33)
        assumeTrue("The system asks once per install, and this install already answered", !notificationsGranted())
        launch("en")
        val thesis = writeThesis()
        assertEquals(LocalNotifier.Permission.NOT_DETERMINED, onMain { host.notifier.status() })

        // The way in from a thesis screen: Reminders opens on that thesis, its choices unfolded.
        onMain { ReminderEntry.open(host, thesis.id) }
        waitForSheet(V18Routes.REMINDERS)
        await("reminders-week-NVDA")
        // Opening the screen asks nothing of the system.
        assertNull("The system must not ask before the person sets a reminder", device.findObject(By.pkg(PERMISSION_WINDOW)))
        assertEquals(LocalNotifier.Permission.NOT_DETERMINED, onMain { host.notifier.status() })
        shot("reminders-before-the-question")

        compose.onNodeWithTag("reminders-week-NVDA", useUnmergedTree = true).performClick()
        // Now, and only now, the phone asks.
        assertTrue("The system's question did not appear", device.wait(Until.hasObject(By.pkg(PERMISSION_WINDOW)), 15_000))
        shot("notification-question")
        val allow = device.findObject(By.res(ALLOW_BUTTON)) ?: device.findObject(By.text(Pattern.compile("(?i)allow")))
        assertNotNull("The system's question has no Allow button", allow)
        allow.click()

        waitUntil { notificationsGranted() && onMain { host.notifier.status() } == LocalNotifier.Permission.ALLOWED }
        await("reminders-change-NVDA")
        shot("reminders-after-allow")
        // The phone holds it: listed as pending, with one piece of work queued for its day.
        val id = ReminderCenter.identifier(thesis.id)
        assertTrue(id in onMain { host.notifier.pendingIds() })
        val work = WorkManager.getInstance(context).getWorkInfosForUniqueWork(LocalNotices.workName(id)).get(10, TimeUnit.SECONDS)
        assertEquals(listOf(WorkInfo.State.ENQUEUED), work.map { it.state })
        assertTrue("A reminder for next week must not show today", notifications.activeNotifications.none { it.tag == id })
    }

    // ---- A notice that comes due ----

    @Test fun case3_aDueNoticeIsPostedAndItsTapOpensTheReview() {
        launch("es")
        allowNotifications()
        val thesis = writeThesis()
        // The reminder's own notice (the centre's plan), due in two seconds instead of on a later day.
        val notice = reminderNotice(thesis, owner = onMain { host.readerTag })
        assertTrue("The phone refused to plan the notice", onMain { host.notifier.schedule(notice) })

        val posted = awaitNotification(notice.id)
        assertEquals(LocalNotice.CHANNEL_THESIS_REMINDERS, posted.notification.channelId)
        assertEquals(ReminderCopy.NOTIFICATION_TITLE, posted.notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString())
        // Fixed and generic: no asset, no figure, none of the person's words.
        assertEquals("Tu recordatorio para revisar una tesis.", posted.notification.extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())
        assertEquals(Notification.VISIBILITY_PRIVATE, posted.notification.visibility)
        val channel = checkNotNull(notifications.getNotificationChannel(LocalNotice.CHANNEL_THESIS_REMINDERS))
        assertEquals("Recordatorios", channel.name.toString())
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, channel.importance)
        assertFalse("A shown notice is no longer pending", notice.id in onMain { host.notifier.pendingIds() })

        // A tap is honoured once the page is ready for it.
        awaitTheGlass()
        device.openNotification()
        val line = device.wait(Until.findObject(By.text("Tu recordatorio para revisar una tesis.")), 15_000)
        assertNotNull("The notice is not in the notification shade", line)
        shot("notice-in-the-shade")
        line.click()

        waitForSheet(V18Routes.THESIS_REVIEW)
        await("thesis-review-start")
        shot("notice-opens-the-review")
        assertTrue("A tapped notice leaves the shade", notifications.activeNotifications.none { it.tag == notice.id })
        assertTrue("Opening a review sends nothing by itself", network.paths("POST").none { it == "/api/desk-debate" })
    }

    @Test fun case4_aNoticeForAnotherReaderIsNotShownAndItsTapOpensNothing() {
        launch("en")
        allowNotifications()
        val thesis = writeThesis()
        val theirs = reminderNotice(thesis, owner = V18Reader.tag("another-reader"))
        assertTrue("The phone refused to plan the notice", onMain { host.notifier.schedule(theirs) })
        // The worker ran (the notice is no longer pending) and showed nothing to this reader.
        waitUntil(90_000) { theirs.id !in onMain { host.notifier.pendingIds() } }
        Thread.sleep(3_000)
        assertTrue("Another reader's notice was shown", notifications.activeNotifications.none { it.tag == theirs.id })

        // Its tap, had it been on the shade from before: stored, consumed, and nothing opens.
        awaitTheGlass()
        deliverTap(theirs)
        waitUntil(60_000) { onMain { V18Process.taps.tap } == null }
        Thread.sleep(1_500)
        assertNull("Another reader's notice opened a sheet", onMain { host.sheetRoute })

        // The same tap for the reader who is here opens the review: the silence above was the rule, not a dead path.
        deliverTap(reminderNotice(thesis, owner = onMain { host.readerTag }))
        waitForSheet(V18Routes.THESIS_REVIEW)
        await("thesis-review-start")
    }

    // ---- A rotation ----

    @Test fun case5_theAppSurvivesARotationWithASheetOpen() {
        launch("en")
        val thesis = writeThesis()
        onMain {
            host.focus.thesisId = thesis.id
            host.present(V18Routes.THESIS_EDITOR)
        }
        waitForSheet(V18Routes.THESIS_EDITOR)
        await("thesis-editor-save")
        val first = activity

        rotated = true
        device.setOrientationLeft()
        waitUntil(60_000) { resumed()?.let { it !== first } == true }
        adopt(checkNotNull(resumed()))
        assertFalse(activity.isFinishing)
        assertTrue("The rebuilt activity is on the app page, past the risk notice", onMain { host.riskAccepted })
        // What the person wrote is still in the book. The sheet itself does not come back: the
        // activity keeps its sheet in memory only, so a rotation returns to the glass.
        assertEquals(listOf(thesis.id), onMain { host.theses.active(host.owner).map { it.id } })
        assertNull(onMain { host.sheetRoute })

        // And the screens still open, sideways, over the page drawn again.
        awaitTheGlass()
        onMain { ReminderEntry.open(host, thesis.id) }
        waitForSheet(V18Routes.REMINDERS)
        await("reminders-thesis-NVDA")
        shot("rotation-reminders-sideways")

        val sideways = activity
        device.setOrientationNatural()
        waitUntil(60_000) { resumed()?.let { it !== sideways } == true }
        adopt(checkNotNull(resumed()))
        assertFalse(activity.isFinishing)
        assertEquals(listOf(thesis.id), onMain { host.theses.active(host.owner).map { it.id } })
    }

    // ---- The app ----

    /** Starts the real activity for a guest in `language` who has finished onboarding and accepted the risk notice. */
    private fun launch(language: String) {
        val assets = context.assets
        val notice = assets.open("nucleo/risk-notice.json").bufferedReader().use { JSONObject(it.readText()) }.getInt("version")
        val roster = assets.open("nucleo/roster.json").bufferedReader().use { JSONObject(it.readText()) }.getJSONArray("companions")
        val starter = (0 until roster.length()).map { roster.getJSONObject(it) }.first { it.optInt("requiredLevel", 1) <= 1 }.getString("id")
        NucleoStateStore(context).apply {
            this.language = language
            muted = true
            companionId = starter
            onboarded = true
            riskVersion = notice
        }
        // The store writes behind the caller: what the activity is about to read must be on disk.
        assertTrue(context.getSharedPreferences("bobby.nucleo", Context.MODE_PRIVATE).edit().commit())
        scenario = ActivityScenario.launch(MainActivity::class.java).also { launched -> launched.onActivity { actual -> adopt(actual) } }
        assertTrue("The guest is past the risk notice", onMain { host.riskAccepted })
        assertFalse(onMain { host.signedIn })
        assertEquals(language, onMain { host.language })
    }

    /** The activity on screen, its repository on the staged network. */
    private fun adopt(actual: MainActivity) {
        activity = actual
        if (launchIntent == null) launchIntent = Intent(actual.intent)
        val repository: BobbyRepository = field(actual, "repository")
        assertNull(repository.session.value)
        network.attach(repository)
    }

    /**
     * The app page asked for its session: the glass is drawn behind a sheet, and a tapped notice can
     * be honoured. Slow where the page's scene is drawn in software.
     */
    private fun awaitTheGlass() {
        waitUntil(180_000) { onMain { field<Boolean>(field<Any>(activity, "session"), "pageReady") } }
        Thread.sleep(2_000)
    }

    private fun resumed(): MainActivity? = onMain {
        ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED).filterIsInstance<MainActivity>().firstOrNull()
    }

    /** A thesis in the guest's own book on this phone, as the editor would save it. */
    private fun writeThesis(): SavedThesis = onMain {
        host.theses.create(ThesisDraft(symbol = "NVDA", name = "NVIDIA", isEquity = true, horizon = ThesisHorizon.MONTHS,
                                       hypothesis = "Data center demand keeps growing faster than supply, and margins are holding.",
                                       worry = "A slowdown in cloud spending.", price = 120.5, asOf = "2026-09-07T10:00:00Z", verdict = "wait"), host.owner)
    }

    /** The notice the reminder centre plans for a thesis, for `owner`, due in two seconds. */
    private fun reminderNotice(thesis: SavedThesis, owner: String): LocalNotice = onMain {
        ReminderCenter.plan(listOf(PendingReminder(thesis.id, thesis.symbol, System.currentTimeMillis() + 2_000)), ReminderCopy.of(host).notificationBody, owner).single()
    }

    /** What a tap on a shown notice delivers: the same intent `LocalNotices.post` gives the system. */
    private fun deliverTap(notice: LocalNotice) {
        val intent = Intent(context, MainActivity::class.java).setAction(LocalNotices.ACTION)
            .setData(Uri.parse("bobby-notice://v18/" + Uri.encode(notice.id)))
            .putExtra(LocalNotices.EXTRA, JSONObject(notice.payload as Map<*, *>).toString())
        onMain { activity.startActivity(intent) }
    }

    private fun notificationsGranted(): Boolean = Build.VERSION.SDK_INT < 33 ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    /** The answer a person gave on an earlier day, given here from the shell. */
    private fun allowNotifications() {
        if (!notificationsGranted()) V18Shots.shell("pm grant ${context.packageName} ${Manifest.permission.POST_NOTIFICATIONS}")
        waitUntil { notificationsGranted() && onMain { host.notifier.status() } == LocalNotifier.Permission.ALLOWED }
    }

    private fun awaitNotification(tag: String): StatusBarNotification {
        waitUntil(90_000) { notifications.activeNotifications.any { it.tag == tag } }
        return notifications.activeNotifications.first { it.tag == tag }
    }

    private fun waitForSheet(route: String) {
        waitUntil(120_000) { onMain { host.sheetRoute } == route }
        compose.waitUntil(20_000) { compose.onAllNodes(isDialog()).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun waitForNoSheet() {
        waitUntil { onMain { host.sheetRoute } == null }
        compose.waitUntil(20_000) { compose.onAllNodes(isDialog()).fetchSemanticsNodes().isEmpty() }
    }

    private fun await(tag: String) {
        compose.waitUntil(20_000) { compose.onAllNodesWithTag(tag, useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun shot(name: String) {
        compose.waitForIdle()
        // The frame that was just composed has to reach the display before it is captured, and the
        // page behind the sheet is drawn in software here.
        Thread.sleep(1_200)
        V18Shots.save(name)
    }

    private fun waitUntil(timeoutMillis: Long = 30_000, condition: () -> Boolean) {
        val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeoutMillis)
        while (System.nanoTime() < deadline) {
            compose.waitForIdle()
            if (condition()) return
            Thread.sleep(50)
        }
        fail("The app did not get there in time; sheet=" + runCatching { onMain { V18Process.runtime?.sheetRoute } }.getOrNull())
    }

    private fun <T> onMain(action: () -> T): T {
        val result = AtomicReference<Result<T>>()
        instrumentation.runOnMainSync { result.set(runCatching(action)) }
        return result.get().getOrThrow()
    }

    @Suppress("UNCHECKED_CAST")
    private fun <T> field(owner: Any, name: String): T = owner.javaClass.getDeclaredField(name).apply { isAccessible = true }.get(owner) as T

    @Suppress("UNCHECKED_CAST")
    private fun SharedPreferences.Editor.restore(key: String, value: Any?) {
        when (value) {
            is String -> putString(key, value); is Boolean -> putBoolean(key, value); is Int -> putInt(key, value)
            is Long -> putLong(key, value); is Float -> putFloat(key, value); is Set<*> -> putStringSet(key, value as Set<String>)
        }
    }

    private companion object {
        /** Everything 1.8 and the session keep on the phone: cleared before a case, put back after it. */
        val PREFERENCES = listOf("bobby.nucleo", "bobby_permissions", "bobby.v18", "bobby.v18.notices")
        /** The system's permission window (its package differs between Android builds). */
        val PERMISSION_WINDOW: Pattern = Pattern.compile(".*permissioncontroller.*")
        val ALLOW_BUTTON: Pattern = Pattern.compile(".*:id/permission_allow_button")
    }
}
