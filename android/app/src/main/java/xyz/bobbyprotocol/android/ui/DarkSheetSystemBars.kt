package xyz.bobbyprotocol.android.ui

import android.graphics.Color
import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat

/** Apply after the dialog attaches: its platform theme can replace the constructor's bar flags. */
@Composable
internal fun DarkSheetSystemBars() {
    val view = LocalView.current
    DisposableEffect(view) {
        val update = Runnable {
            val window = (view.parent as? DialogWindowProvider)?.window ?: return@Runnable
            WindowCompat.getInsetsController(window, window.decorView).apply {
                isAppearanceLightStatusBars = false
                isAppearanceLightNavigationBars = false
            }
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.rgb(5, 5, 5)
            if (Build.VERSION.SDK_INT >= 29) {
                window.isStatusBarContrastEnforced = false
                window.isNavigationBarContrastEnforced = false
            }
        }
        view.post(update)
        onDispose { view.removeCallbacks(update) }
    }
}
