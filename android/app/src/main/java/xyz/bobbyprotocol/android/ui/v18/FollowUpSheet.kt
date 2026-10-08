package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
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
import xyz.bobbyprotocol.android.v18.harness.HarnessNotes
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier

// The harness (1.8): where a sector or a week follow-up lands (route `followUp`). One list: the
// assets, each with how far it moved, and a tap that asks Bobby about it. The numbers are read when
// the screen opens (one request per row, none of them a read); a row whose number could not be
// read, or should not be said, shows none. What it shows is `HarnessBoard` (pure, tested); this
// file only draws it. A row asks Bobby, which is a read: rows are only buttons when the phone
// knows the next read is answered (HarnessWall). At the wall the board is the same, with plain rows.
// The Compose twin of `HarnessBoardSheet` in ios/Bobby/Sources/V18/Harness/HarnessBoard.swift.
// Also here: the Follow-ups switch of the Reminders sheet, and the notes the Memory screen shows
// under "On this phone" (`HarnessNotes`, in sentences).

@Composable
fun FollowUpSheet(host: V18Host, onClose: () -> Unit) {
    val center = remember(host) { Harness.center(host) }
    var board by remember(host) { mutableStateOf<HarnessBoard?>(null) }
    // Whether a row may ask Bobby: read again when the server says how many reads are left, and with each number.
    var asks by remember(host) { mutableStateOf(center.readsOpen) }
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
        asks = center.readsOpen
        // Not awaited before the numbers: they do not wait for the receipt, and the rows redraw when it arrives.
        if (host.riskAccepted && center.access() == null) {
            launch {
                center.refreshAccess()
                asks = center.readsOpen
            }
        }
        center.readBoard(made) { symbol, change ->
            board = board?.withChange(symbol, change)
            asks = center.readsOpen
        }
    }
    val shown = board
    if (shown == null) {
        Spacer(Modifier.fillMaxWidth().height(1.dp))
    } else {
        FollowUpBoard(host, center.copy, shown, asks, onClose) { row -> Harness.pick(host, row) }
    }
}

/**
 * V18-DESIGN.md: a title, what the numbers are, rows of state. One tap per row.
 * `asks` is false when the next read would be refused: the board is the same, and no row invites a read.
 */
@Composable
private fun FollowUpBoard(host: V18Host, copy: HarnessCopy, board: HarnessBoard, asks: Boolean, onClose: () -> Unit, onPick: (HarnessBoard.Row) -> Unit) {
    QuietSheet(host, board.title, "follow-close", onClose, subtitle = if (board.rows.isEmpty()) null else board.basis) {
        Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            if (board.rows.isEmpty()) {
                Text(copy.boardEmpty, Modifier.padding(top = 8.dp).testTag("follow-empty"), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 21.sp)
            } else {
                board.rows.forEachIndexed { index, row ->
                    // A number the phone does not have, or should not say, is not shown. Numbers are the sheet's ink: a colour means a verdict only.
                    val change = row.change?.let { copy.signed(it) }
                    val pick: (() -> Unit)? = if (asks) ({ onPick(row) }) else null
                    QuietRow(label = row.symbol, tag = "follow-row-" + row.symbol, value = change, note = if (row.name == row.symbol) null else row.name,
                             chevron = asks, hairline = index < board.rows.size - 1, spoken = copy.rowSpoken(row.symbol, row.name, change), onClick = pick)
                }
                if (asks) QuietNote(copy.boardFoot, Modifier.padding(top = 14.dp), tag = "follow-foot")
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
    // The phone lets Bobby notify, and follow-ups themselves were switched off in its settings (a long
    // press on one, "Turn off notifications"): the switch says what stands in the way, with the way
    // there. When all of Bobby's notifications are off, the Reminders sheet already says so for every row.
    if (view.mode == HarnessMode.ON && view.permission == LocalNotifier.Permission.DENIED && host.notifier.status() == LocalNotifier.Permission.ALLOWED) {
        Column(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 4.dp).testTag("reminders-follow-ups-off-in-settings")) {
            QuietNote(center.copy.offInSettings)
            QuietLink(center.copy.openSettings, "reminders-follow-ups-settings") { host.openNotificationSettings() }
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
 * What the phone keeps to plan follow-ups, as `HarnessNotes` says it, for "On this phone" in Memory
 * (signed in or not): a header that states how the app is built, one block per asset with its own
 * Erase, what Bobby does with them, and one Erase for all of it. With nothing kept it is one quiet
 * line. The twin of `followUpNotes` in ios/Bobby/Sources/Briefings/MemoryView.swift.
 */
@Composable
fun FollowUpNotes(host: V18Host) {
    val center = remember(host) { Harness.center(host) }
    val revision by center.revision.collectAsState()
    val copy = center.copy
    val notes = remember(revision, host.language) { center.notes }
    Column(Modifier.fillMaxWidth().testTag("memory-notes")) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
        if (notes.isEmpty) {
            Box(Modifier.fillMaxWidth().heightIn(min = 52.dp), contentAlignment = Alignment.CenterStart) {
                QuietNote(notes.quietLine(copy), tag = "memory-notes-empty")
            }
        } else {
            Text(HarnessNotes.header(copy), Modifier.padding(top = 14.dp, bottom = 4.dp).testTag("memory-notes-header"),
                 color = QuietColors.dim, fontSize = 12.sp, lineHeight = 17.sp)
            for (asset in notes.assets) {
                key(asset.symbol) { FollowUpNote(host, center, copy, asset) }
            }
            if (notes.general.isNotEmpty()) {
                Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
                Column(Modifier.fillMaxWidth().padding(top = 10.dp, bottom = 2.dp).testTag("memory-notes-general")
                           .clearAndSetSemantics { contentDescription = notes.general.joinToString(" ") },
                       verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    for (line in notes.general) Text(line, color = QuietColors.dim, fontSize = 13.sp, lineHeight = 18.sp)
                }
            }
            QuietLink(HarnessNotes.eraseAll(copy), "memory-notes-erase") { center.forgetLedger() }
        }
    }
}

/**
 * One asset: its symbol and its Erase on one line, then one sentence per line, each short enough
 * to be read whole in every language. "Erase", not "Forget": Forget is the button of what Bobby's
 * servers remember, further up the same screen.
 */
@Composable
private fun FollowUpNote(host: V18Host, center: HarnessCenter, copy: HarnessCopy, asset: HarnessNotes.Asset) {
    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Row(Modifier.fillMaxWidth().heightIn(min = if (asset.erasable) 48.dp else 30.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(asset.symbol, Modifier.weight(1f), color = QuietColors.cream, fontSize = 13.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium)
            if (asset.erasable) {
                val spoken = HarnessNotes.eraseLabel(copy, asset.symbol)
                Box(Modifier.heightIn(min = 48.dp).widthIn(min = 48.dp)
                        .clickable(role = Role.Button) { host.scope.launch { center.forget(asset.symbol) } }
                        .testTag("memory-note-forget-" + asset.symbol)
                        .clearAndSetSemantics { contentDescription = spoken; role = Role.Button },
                    contentAlignment = Alignment.CenterEnd) {
                    Text(HarnessNotes.eraseOne(copy), color = QuietColors.muted, fontSize = 14.sp)
                }
            }
        }
        Column(Modifier.fillMaxWidth().testTag("memory-note-" + asset.symbol).clearAndSetSemantics { contentDescription = asset.symbol + ". " + asset.text },
               verticalArrangement = Arrangement.spacedBy(3.dp)) {
            for (line in asset.lines) Text(line, color = QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp)
        }
    }
}
