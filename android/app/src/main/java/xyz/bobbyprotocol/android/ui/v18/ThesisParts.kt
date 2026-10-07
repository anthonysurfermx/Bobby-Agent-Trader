package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.StateFlow
import xyz.bobbyprotocol.android.v18.V18Host

// The few pieces the thesis and memory screens share besides the 1.8 kit: how a screen follows a
// model that knows nothing of Compose, and the two small dialogs (a question asked once before
// something is thrown away, and the detail that used to be a paragraph on the face).

/**
 * A model that lives outside Compose, read so that the screen redraws when it changes. The models
 * of the thesis and memory screens raise a counter on every change; calling the function this
 * returns reads that counter where the model is used, which is what makes that part of the screen
 * follow it. Always reach the model through it: `val m = observedModel(model, model.changes)`, then
 * `m().phase`.
 */
@Composable
internal fun <M : Any> observedModel(model: M, changes: StateFlow<Int>): () -> M {
    val tick = changes.collectAsStateWithLifecycle()
    return remember(model, tick) {
        {
            tick.value
            model
        }
    }
}

/** One question with two answers, in the sheet's inks (a default dialog button is green in this theme). */
@Composable
internal fun ThesisConfirmDialog(title: String, confirm: String, cancel: String, tag: String, message: String? = null, onConfirm: () -> Unit, onCancel: () -> Unit) {
    val body: (@Composable () -> Unit)? = if (message == null) null else ({ Text(message, color = QuietColors.muted, fontSize = 14.sp, lineHeight = 20.sp) })
    AlertDialog(
        onDismissRequest = onCancel,
        confirmButton = {
            TextButton(onClick = onConfirm, modifier = Modifier.testTag("$tag-confirm"), colors = ButtonDefaults.textButtonColors(contentColor = QuietColors.cream)) {
                Text(confirm, fontSize = 15.sp)
            }
        },
        modifier = Modifier.testTag(tag),
        dismissButton = {
            TextButton(onClick = onCancel, modifier = Modifier.testTag("$tag-cancel"), colors = ButtonDefaults.textButtonColors(contentColor = QuietColors.muted)) {
                Text(cancel, fontSize = 15.sp)
            }
        },
        title = { Text(title, color = QuietColors.cream, fontSize = 18.sp, lineHeight = 24.sp) },
        text = body,
        containerColor = QuietColors.surface,
    )
}

/** What the sheet's detail button opens: one tap away, never on the face. */
@Composable
internal fun ThesisDetailsDialog(host: V18Host, tag: String, onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    AlertDialog(
        onDismissRequest = onClose,
        confirmButton = {
            TextButton(onClick = onClose, modifier = Modifier.testTag("$tag-close"), colors = ButtonDefaults.textButtonColors(contentColor = QuietColors.cream)) {
                Text(host.text("Close", "Cerrar"), fontSize = 15.sp)
            }
        },
        modifier = Modifier.testTag(tag),
        title = { Text(host.text("Details", "Detalles"), color = QuietColors.cream, fontSize = 18.sp, lineHeight = 24.sp) },
        text = { Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp), content = content) },
        containerColor = QuietColors.surface,
    )
}
