package xyz.bobbyprotocol.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

@Composable
internal fun TraderLandHelpDialog(copy: TraderLandHelpText, onDismiss: () -> Unit) {
    AlertDialog(
        modifier = Modifier.testTag("trader-land-help"),
        onDismissRequest = onDismiss,
        title = { Text(copy.title, Modifier.semantics { heading() }) },
        text = {
            Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                copy.steps.forEachIndexed { index, step ->
                    Row(Modifier.semantics(mergeDescendants = true) {}, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("${index + 1}.", color = MaterialTheme.colorScheme.primary)
                        Text(step, Modifier.weight(1f))
                    }
                }
                HorizontalDivider()
                Text(copy.controls, style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss, modifier = Modifier.heightIn(min = 48.dp).padding(horizontal = 4.dp).testTag("land-help-done")) { Text(copy.done) }
        },
    )
}
