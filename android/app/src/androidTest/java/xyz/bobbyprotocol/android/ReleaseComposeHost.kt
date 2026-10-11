package xyz.bobbyprotocol.android

import android.view.ViewGroup
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.test.junit4.AndroidComposeTestRule
import androidx.test.core.app.ActivityScenario
import org.junit.rules.TestRule
import org.junit.runner.Description
import org.junit.runners.model.Statement
import xyz.bobbyprotocol.android.platform.NucleoWebView

/** Uses the shipped activity; no empty test activity or manifest is bundled in release. */
class ReleaseHostRule : TestRule {
    lateinit var scenario: ActivityScenario<MainActivity>
    override fun apply(base: Statement, description: Description): Statement = object : Statement() {
        override fun evaluate() {
            scenario = ActivityScenario.launch(MainActivity::class.java)
            try {
                // The first cold WebView can be composed after RESUMED. Wait for that app-owned
                // content before disposing it, so a late first frame cannot replace the stage.
                val field = MainActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
                var ready = false
                val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(60)
                while (!ready && System.nanoTime() < deadline) {
                    scenario.onActivity { ready = field.get(it) != null }
                    if (!ready) Thread.sleep(100)
                }
                check(ready) { "Shipping Activity did not create its WebView" }
                scenario.onActivity { activity ->
                    // The component tests supply their own content, with the page stopped first.
                    (field.get(activity) as? NucleoWebView)?.close()
                    field.set(activity, null)
                    val content = activity.findViewById<ViewGroup>(android.R.id.content)
                    for (index in 0 until content.childCount) (content.getChildAt(index) as? ComposeView)?.disposeComposition()
                    content.removeAllViews()
                }
                base.evaluate()
            } finally { scenario.close() }
        }
    }
}

fun createReleaseComposeRule(): AndroidComposeTestRule<ReleaseHostRule, MainActivity> =
    AndroidComposeTestRule(ReleaseHostRule()) { rule ->
        var activity: MainActivity? = null
        rule.scenario.onActivity { activity = it }
        checkNotNull(activity)
    }
