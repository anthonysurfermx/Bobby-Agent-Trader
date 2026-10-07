package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import xyz.bobbyprotocol.android.ui.DarkSheetSystemBars
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes

/**
 * Which sheet a 1.8 route draws. Each screen lives in its own file, owned by one track; this map
 * and the sheet around every screen (surface, height, system bars, the dismiss guard) are the
 * foundation's.
 */
object V18Sheets {
    /** The screens that need the whole height (a keyboard, a pinned action). The others open at half height so the sphere stays visible above them. */
    private val TALL: Set<String> = setOf(V18Routes.THESIS_EDITOR, V18Routes.THESIS_REVIEW, "memory")

    /** The two 1.1.4 routes whose screen is the 1.8 one now (BobbySheet no longer has them). The page may still open both. */
    private val TAKEN_OVER: Set<String> = setOf("memory", "invite")

    /** True when this map draws `route`: every 1.8 screen, and the two routes it took over. */
    fun draws(route: String): Boolean = route in V18Routes.NATIVE_ONLY || route in TAKEN_OVER

    @OptIn(ExperimentalMaterial3Api::class)
    @Composable
    fun Sheet(route: String, host: V18Host, onClose: () -> Unit) {
        val guard = remember { QuietDismissGuard() }
        fun dismiss() { if (guard.canDismiss()) onClose() else guard.onBlocked() }
        val state = rememberModalBottomSheetState(skipPartiallyExpanded = route in TALL,
                                                  confirmValueChange = { target -> target != SheetValue.Hidden || guard.canDismiss() })
        ModalBottomSheet(onDismissRequest = { dismiss() }, sheetState = state, containerColor = QuietColors.surface, contentColor = QuietColors.cream) {
            DarkSheetSystemBars()
            CompositionLocalProvider(LocalQuietDismissGuard provides guard) {
                when (route) {
                    V18Routes.CREDITS -> CreditsSheet(host, onClose)
                    V18Routes.THESES -> ThesisListSheet(host, onClose)
                    V18Routes.THESIS_EDITOR -> ThesisEditorSheet(host, onClose)
                    V18Routes.THESIS_REVIEW -> ThesisReviewSheet(host, onClose)
                    V18Routes.MEMORY_CONSENT -> MemoryConsentSheet(host, onClose)
                    // The harness's switch and its "Your week" row sit under the theses, as on iOS.
                    V18Routes.REMINDERS -> RemindersSheet(host, onClose, followUps = { consentRequired -> FollowUpsRows(host, consentRequired) })
                    V18Routes.FOLLOW_UP -> FollowUpSheet(host, onClose)
                    "memory" -> MemorySheet(host, onClose)
                    "invite" -> InviteSheet(host, onClose)
                    else -> Unit
                }
            }
        }
    }
}
