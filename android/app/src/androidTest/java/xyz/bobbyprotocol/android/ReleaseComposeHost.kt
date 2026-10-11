package xyz.bobbyprotocol.android

import android.view.ViewGroup
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
                scenario.onActivity { activity ->
                    // The component tests supply their own content, with the page stopped first.
                    val field = MainActivity::class.java.getDeclaredField("web").apply { isAccessible = true }
                    (field.get(activity) as? NucleoWebView)?.close()
                    field.set(activity, null)
                    activity.findViewById<ViewGroup>(android.R.id.content).removeAllViews()
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
