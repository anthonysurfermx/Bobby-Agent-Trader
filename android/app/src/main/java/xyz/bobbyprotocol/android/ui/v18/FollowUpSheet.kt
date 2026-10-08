package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.harness.Harness
import xyz.bobbyprotocol.android.v18.harness.HarnessBoard
import xyz.bobbyprotocol.android.v18.harness.HarnessCenter
import xyz.bobbyprotocol.android.v18.harness.HarnessCopy
import xyz.bobbyprotocol.android.v18.harness.HarnessMode

// The harness (1.8): where a sector or a week follow-up lands (route `followUp`). One list: the
// assets, each with how far it moved, and a tap that asks Bobby about it. The numbers are read when
// the screen opens (one request per row, none of them a read); a row whose number could not be
// read shows none. What it shows is `HarnessBoard` (pure, tested); this file only draws it.
// The Compose twin of `HarnessBoardSheet` in ios/Bobby/Sources/V18/Harness/HarnessBoard.swift.

@Composable
fun FollowUpSheet(host: V18Host, onClose: () -> Unit) {
    val center = remember(host) { Harness.center(host) }
    var board by remember(host) { mutableStateOf<HarnessBoard?>(null) }
    // Whose assets the board shows: it closes the moment someone else is using the phone.
    DisposableEffect(host) {
        val stop = host.onAccountChanged {
            // Another reader: what the previous one asked about is not theirs to see.
            board = HarnessBoard.week(emptyList(), center.copy)
            if (host.sheetRoute == V18Routes.FOLLOW_UP) host.closeSheet()
        }
        onDispose { stop() }
    }
    LaunchedEffect(host) {
        if (board != null) return@LaunchedEffect
        val made = HarnessBoard.make(center.takeBoardFocus(), center.ledger, host.now(), center.copy)
        board = made
        center.readBoard(made) { symbol, change -> board = board?.withChange(symbol, change) }
    }
    val shown = board
    if (shown == null) {
        Spacer(Modifier.fillMaxWidth().height(1.dp))
    } else {
        FollowUpBoard(host, center.copy, shown, onClose) { row -> Harness.pick(host, row) }
    }
}

/** V18-DESIGN.md: a title, what the numbers are, rows of state. One tap per row. */
@Composable
private fun FollowUpBoard(host: V18Host, copy: HarnessCopy, board: HarnessBoard, onClose: () -> Unit, onPick: (HarnessBoard.Row) -> Unit) {
    QuietSheet(host, board.title, "follow-close", onClose, subtitle = if (board.rows.isEmpty()) null else board.basis) {
        Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            if (board.rows.isEmpty()) {
                Text(copy.boardEmpty, Modifier.padding(top = 8.dp).testTag("follow-empty"), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 21.sp)
            } else {
                board.rows.forEachIndexed { index, row ->
                    // A number the phone does not have is not shown. Numbers are the sheet's ink: a colour means a verdict only.
                    val change = row.change?.let { copy.signed(it) }
                    QuietRow(label = row.symbol, tag = "follow-row-" + row.symbol, value = change, note = if (row.name == row.symbol) null else row.name,
                             chevron = true, hairline = index < board.rows.size - 1, spoken = copy.rowSpoken(row.symbol, row.name, change)) { onPick(row) }
                }
                QuietNote(copy.boardFoot, Modifier.padding(top = 14.dp), tag = "follow-foot")
            }
        }
    }
}

/**
 * The Follow-ups switch and, when the week has something in it, the row that opens it: the rows
 * the Reminders sheet shows under its theses (`RemindersContent` in RemindersSheet.swift).
 * `onConsentRequired` runs when the switch was turned on before the risk notice was accepted:
 * nothing was asked and nothing changed. The system's permission is asked only from this switch
 * (and from the offer on the glass), never by drawing it.
 */
@Composable
fun FollowUpsRows(host: V18Host, onConsentRequired: () -> Unit = {}) {
    val center = remember(host) { Harness.center(host) }
    val view by center.view.collectAsState()
    QuietToggle(host, center.copy.switchLabel, "reminders-follow-ups", checked = view.mode == HarnessMode.ON, detail = center.copy.switchDetail,
                saving = view.saving, enabled = !view.saving) { on ->
        if (on) {
            // On the host's scope: the system's question may outlive this sheet.
            host.scope.launch { if (center.accept() == HarnessCenter.Outcome.CONSENT_REQUIRED) onConsentRequired() }
        } else {
            center.turnOff()
        }
    }
    // Only while follow-ups are on, as iOS (`showsWeekRow && followUps == .on`).
    if (view.hasWeek && view.mode == HarnessMode.ON) {
        QuietRow(label = center.copy.weekTitle, tag = "reminders-week", chevron = true, hairline = true) {
            center.focusBoard(null)
            host.switchSheet(V18Routes.FOLLOW_UP)
        }
    }
}

/**
 * Android only: what the follow-ups keep on this phone, for "On this phone" in Memory. From the
 * first question Bobby notes the assets a person asked about (a symbol, a name, a price and when;
 * never the question), before any yes, so that it can offer to come back to them. The row says
 * which, and "Clear" removes them with whatever was planned from them, for whoever is using the
 * phone, signed in or not. The Follow-ups switch stays as it was. Nothing shows while nothing is kept.
 */
@Composable
fun FollowUpsKept(host: V18Host) {
    val center = remember(host) { Harness.center(host) }
    val kept by center.kept.collectAsState()
    if (kept.isEmpty()) return
    Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(host.text("Assets you asked about, kept for follow-ups", "Activos por los que preguntaste, guardados para el seguimiento"),
                 color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
            Text(kept.joinToString(" · "), Modifier.testTag("memory-local-follow-ups"), color = QuietColors.cream, fontSize = 12.sp,
                 fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
        }
        QuietLink(host.text("Clear", "Quitar"), "memory-clear-follow-ups") { center.forgetLedger() }
    }
}
