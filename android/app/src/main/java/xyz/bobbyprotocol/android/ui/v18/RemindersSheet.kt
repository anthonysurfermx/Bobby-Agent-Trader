package xyz.bobbyprotocol.android.ui.v18

import android.text.format.DateFormat
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TimeInput
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.notify.LocalNotifier
import xyz.bobbyprotocol.android.v18.reminders.BriefingOffers
import xyz.bobbyprotocol.android.v18.reminders.ReminderCenter
import xyz.bobbyprotocol.android.v18.reminders.ReminderCopy
import xyz.bobbyprotocol.android.v18.reminders.ReminderDates
import xyz.bobbyprotocol.android.v18.reminders.ReminderPreset
import xyz.bobbyprotocol.android.v18.reminders.ReminderSchedule
import xyz.bobbyprotocol.android.v18.reminders.RemindersModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.Locale

// Reminders (1.8): the screen, the Compose twin of ios/Bobby/Sources/V18/Reminders/RemindersSheet.swift
// and of the "Reminders" section of ios/Bobby/V18-DESIGN.md. One line of scope, then a row per
// active thesis: its date, or the way to set one. Only the row being set unfolds its four choices.
// Everything shown is something the person wrote or chose; the only thing this screen can make the
// phone do is show one generic line on the day they picked. The notification permission is asked
// when the person sets a reminder, never on opening.
// What it shows is decided by `RemindersModel` (pure, tested); this file only draws it.

/**
 * `followUps` is the ONE slot at the foot of the list that the harness track fills: its Follow-ups
 * switch and its "Your week" row. The sheet draws it when given, between the theses and the notes.
 */
@Composable
fun RemindersSheet(host: V18Host, onClose: () -> Unit, followUps: (@Composable () -> Unit)? = null) {
    val center = remember(host) { ReminderCenter.of(host) }
    val briefing = remember(host) { BriefingOffers.of(host) }
    val copy = remember(host, host.language) { ReminderCopy.of(host) }
    val state by center.state.collectAsState()
    val offer by briefing.state.collectAsState()
    var theses by remember(host) { mutableStateOf(host.theses.active(host.owner)) }
    // The thesis a nudge or a thesis screen named: consumed here, once.
    val focus = remember(host) { host.focus.takeThesisId() }

    DisposableEffect(host) {
        val reload = { theses = host.theses.active(host.owner) }
        val stopBook = host.theses.addListener { reload() }
        val stopAccount = host.onAccountChanged { reload() }
        onDispose {
            stopBook()
            stopAccount()
        }
    }
    // A local read of the permission and of what is still pending (no prompt), then the account's
    // briefing settings for the last row (signed in and after the risk notice only).
    LaunchedEffect(host) {
        runCatching { center.refresh() }
        briefing.refresh()
    }

    val model = RemindersModel.make(
        theses = theses, pending = state.pending, scheduling = state.scheduling, focus = focus, permission = state.status,
        showsBriefingRow = host.signedIn && offer.shouldOffer, riskAccepted = host.riskAccepted,
    )
    val face = remember(host) { RemindersFace(model.initiallyOpen) }
    val context = LocalContext.current
    val format = remember(host.locale, context) { ReminderFormat.of(center.zone(), Locale.forLanguageTag(host.locale), DateFormat.is24HourFormat(context)) }

    fun unfold(row: RemindersModel.Row) {
        face.failedId = null
        face.pickingId = null
        face.openId = row.id
    }

    /** Runs a reminder button. It outlives the sheet: the answer to the phone's question still counts when the sheet is gone. */
    fun perform(row: RemindersModel.Row, action: suspend () -> ReminderCenter.Outcome) {
        face.failedId = null
        host.scope.launch {
            val outcome = try {
                action()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                ReminderCenter.Outcome.Failed
            }
            when (outcome) {
                is ReminderCenter.Outcome.Scheduled -> {
                    face.openId = null
                    face.pickingId = null
                    face.justSetId = row.id
                    host.haptic("success")
                }
                // The foot of the screen says why and where to change it.
                ReminderCenter.Outcome.Denied -> {
                    face.pickingId = null
                }
                ReminderCenter.Outcome.ConsentRequired -> {
                    face.consentMissing = true
                }
                ReminderCenter.Outcome.UnknownThesis, ReminderCenter.Outcome.Failed -> {
                    face.failedId = row.id
                }
            }
        }
    }

    QuietSheet(host = host, title = copy.title, closeTag = "reminders-close", onClose = onClose, subtitle = copy.intro) {
        Column(Modifier.fillMaxWidth().padding(top = 12.dp)) {
            if (model.rows.isEmpty()) {
                Text(copy.empty, Modifier.padding(top = 8.dp).testTag("reminders-empty"), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 21.sp)
            } else {
                for (row in model.rows) key(row.id) {
                    ThesisRow(
                        row = row, step = row.step(face.openId, face.pickingId), copy = copy, format = format, picked = face.picked,
                        failed = face.failedId == row.id, justSet = face.justSetId == row.id,
                        onOpen = { unfold(row) },
                        onPreset = { preset -> perform(row) { center.schedule(row.id, row.symbol, preset) } },
                        onStartPicking = {
                            face.failedId = null
                            face.picked = ReminderSchedule.defaultPick(host.now(), center.zone())
                            face.pickingId = row.id
                        },
                        onPickDay = { face.dialog = PickerDialog.DAY },
                        onPickTime = { face.dialog = PickerDialog.TIME },
                        onConfirmPick = {
                            val at = face.picked
                            perform(row) { center.schedule(row.id, row.symbol, at) }
                        },
                        onCancelPick = { face.pickingId = null },
                        onKeep = {
                            face.failedId = null
                            face.pickingId = null
                            face.openId = null
                        },
                        onRemove = {
                            face.failedId = null
                            face.justSetId = null
                            runCatching { center.cancel(row.id) }
                        },
                    )
                }
            }
            // The slot the harness track fills: the Follow-ups switch and the "Your week" row.
            if (followUps != null) {
                Column(Modifier.fillMaxWidth().padding(top = if (model.rows.isEmpty()) 14.dp else 0.dp)) { followUps() }
            }
            if (!model.riskAccepted || face.consentMissing) {
                QuietNote(copy.riskRequired, Modifier.padding(top = 14.dp), tag = "reminders-risk-required")
            }
            if (model.permission == LocalNotifier.Permission.DENIED) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 10.dp).testTag("reminders-denied"),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    QuietNote(copy.denied, Modifier.weight(1f))
                    QuietLink(copy.openSettings, "reminders-open-settings") { host.openNotificationSettings() }
                }
            }
            if (model.showsBriefingRow) {
                Box(Modifier.padding(top = 8.dp)) {
                    QuietRow(
                        label = copy.briefingRow, tag = "reminders-briefing", chevron = true, hairline = false,
                        spoken = copy.briefingRow + ". " + copy.briefingRowDetail,
                    ) {
                        // The person is on their way to change it: what was held is no longer known.
                        briefing.clear()
                        host.switchSheet(BriefingOffers.SETTINGS_ROUTE)
                    }
                }
            }
        }
    }

    when (face.dialog) {
        PickerDialog.DAY -> DayDialog(
            copy = copy, zone = center.zone(), range = ReminderSchedule.pickRange(host.now(), center.zone()), pickedMs = face.picked,
            onPick = { day ->
                face.picked = ReminderSchedule.onDay(face.picked, day, center.zone())
                face.dialog = null
            },
            onCancel = { face.dialog = null },
        )
        PickerDialog.TIME -> TimeDialog(
            copy = copy, zone = center.zone(), pickedMs = face.picked,
            onPick = { hour, minute ->
                face.picked = ReminderSchedule.atTime(face.picked, hour, minute, center.zone())
                face.dialog = null
            },
            onCancel = { face.dialog = null },
        )
        null -> Unit
    }
}

private enum class PickerDialog { DAY, TIME }

/** What is unfolded on the screen right now. */
private class RemindersFace(initiallyOpen: String?) {
    /** The row showing its choices. */
    var openId by mutableStateOf(initiallyOpen)
    /** The row showing the day and the time. */
    var pickingId by mutableStateOf<String?>(null)
    var picked by mutableLongStateOf(0L)
    var failedId by mutableStateOf<String?>(null)
    var consentMissing by mutableStateOf(false)
    /** The row whose reminder was set a moment ago: TalkBack says its date. */
    var justSetId by mutableStateOf<String?>(null)
    var dialog by mutableStateOf<PickerDialog?>(null)
}

/** How a moment is written on this phone: the app's language, the phone's time zone and clock style. */
private class ReminderFormat(private val zone: ZoneId, private val locale: Locale, private val whenPattern: String?, private val dayPattern: String?, private val timePattern: String?) {
    fun whenText(ms: Long): String = ReminderDates.whenText(ms, zone, locale, whenPattern)
    fun day(ms: Long): String = ReminderDates.dayText(ms, zone, locale, dayPattern)
    fun time(ms: Long): String = ReminderDates.timeText(ms, zone, locale, timePattern)

    companion object {
        fun of(zone: ZoneId, locale: Locale, uses24Hour: Boolean): ReminderFormat {
            val clock = if (uses24Hour) "Hm" else "hma"
            return ReminderFormat(zone, locale, best(locale, "EEEdMMM$clock"), best(locale, "EEEdMMM"), best(locale, clock))
        }

        /** The phone's own pattern for these fields in that language; null leaves the built-in one. */
        private fun best(locale: Locale, skeleton: String): String? = try {
            DateFormat.getBestDateTimePattern(locale, skeleton)
        } catch (_: Exception) {
            null
        }
    }
}

// A thesis

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ThesisRow(
    row: RemindersModel.Row,
    step: RemindersModel.Row.Step,
    copy: ReminderCopy,
    format: ReminderFormat,
    picked: Long,
    failed: Boolean,
    justSet: Boolean,
    onOpen: () -> Unit,
    onPreset: (ReminderPreset) -> Unit,
    onStartPicking: () -> Unit,
    onPickDay: () -> Unit,
    onPickTime: () -> Unit,
    onConfirmPick: () -> Unit,
    onCancelPick: () -> Unit,
    onKeep: () -> Unit,
    onRemove: () -> Unit,
) {
    val fireAt = row.fireAtMillis
    Column(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(row.symbol, Modifier.testTag("reminders-thesis-${row.symbol}"), color = QuietColors.cream, fontSize = 17.sp)
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                when (step) {
                    RemindersModel.Row.Step.BUSY -> {
                        QuietProgress()
                    }
                    RemindersModel.Row.Step.SET -> {
                        QuietLink(copy.setReminder, "reminders-set-${row.symbol}", onClick = onOpen)
                    }
                    RemindersModel.Row.Step.PENDING -> {
                        // The date is the control: a tap changes it. Removing it is in the menu.
                        if (fireAt != null) {
                            Box(
                                Modifier.heightIn(min = 48.dp).clickable(onClickLabel = copy.change, role = Role.Button, onClick = onOpen)
                                    .testTag("reminders-change-${row.symbol}"),
                                contentAlignment = Alignment.CenterEnd,
                            ) { WhenLabel(format.whenText(fireAt), copy, QuietColors.cream, live = justSet) }
                        }
                    }
                    RemindersModel.Row.Step.CHOOSING, RemindersModel.Row.Step.PICKING -> {
                        // The reminder in place stays in view until a new day is confirmed.
                        if (fireAt != null) WhenLabel(format.whenText(fireAt), copy, QuietColors.muted)
                    }
                }
            }
            if (step == RemindersModel.Row.Step.PENDING) {
                Box(Modifier.offset(x = 7.dp)) {
                    QuietMenu(
                        label = copy.moreOptions + ", " + row.symbol, tag = "reminders-remove-${row.symbol}",
                        items = listOf(QuietMenuItem(copy.remove, "reminders-remove-item-${row.symbol}", onRemove)),
                    )
                }
            }
        }
        if (step == RemindersModel.Row.Step.CHOOSING) {
            // The three presets and "Choose date": one line when it fits, more when it does not.
            FlowRow(Modifier.fillMaxWidth().padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (preset in ReminderPreset.entries) {
                    QuietChip(copy.preset(preset), "reminders-${preset.raw}-${row.symbol}") { onPreset(preset) }
                }
                QuietChip(copy.pickDay, "reminders-pick-${row.symbol}", onClick = onStartPicking)
            }
            if (row.offersWayBack(step)) QuietLink(copy.keepDay, "reminders-keep-${row.symbol}", onClick = onKeep)
        }
        if (step == RemindersModel.Row.Step.PICKING) {
            // The day and the time, each a capsule that opens its picker, then the two answers.
            Column(Modifier.fillMaxWidth().padding(bottom = 10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                FlowRow(
                    Modifier.fillMaxWidth().semantics { contentDescription = copy.dayAndTime },
                    horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    QuietChip(format.day(picked), "reminders-date-${row.symbol}", onClick = onPickDay)
                    QuietChip(format.time(picked), "reminders-time-${row.symbol}", onClick = onPickTime)
                }
                FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    QuietChip(copy.confirmPick, "reminders-confirm-${row.symbol}", selected = true, onClick = onConfirmPick)
                    QuietChip(copy.cancel, "reminders-cancel-${row.symbol}", onClick = onCancelPick)
                }
            }
        }
        if (failed) {
            QuietNote(copy.failed, Modifier.padding(bottom = 8.dp).semantics { liveRegion = LiveRegionMode.Polite }, tag = "reminders-failed")
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
    }
}

/** A bell and the moment. TalkBack reads "Reminder on …", and says it by itself right after it was set. */
@Composable
private fun WhenLabel(text: String, copy: ReminderCopy, ink: Color, live: Boolean = false) {
    val spoken = copy.reminderOn(text)
    Row(
        Modifier.testTag("reminders-when").clearAndSetSemantics {
            contentDescription = spoken
            if (live) liveRegion = LiveRegionMode.Polite
        },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp),
    ) {
        QuietGlyphMark(QuietGlyph.BELL, Modifier.size(12.dp), QuietColors.dim)
        Text(text, color = ink, fontSize = 15.sp, lineHeight = 20.sp, style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"))
    }
}

// The pickers. Material's own, in the sheet's inks: nothing here is green.

@Composable
private fun QuietPickerTheme(content: @Composable () -> Unit) {
    val base = MaterialTheme.colorScheme
    val tint = QuietColors.violet.copy(alpha = .28f)
    val scheme = remember(base) {
        base.copy(
            primary = QuietColors.violet, onPrimary = QuietColors.background, primaryContainer = tint, onPrimaryContainer = QuietColors.cream,
            secondary = QuietColors.violet, onSecondary = QuietColors.background, secondaryContainer = tint, onSecondaryContainer = QuietColors.cream,
            tertiary = QuietColors.violet, onTertiary = QuietColors.background, tertiaryContainer = tint, onTertiaryContainer = QuietColors.cream,
            surface = QuietColors.surface, onSurface = QuietColors.cream, surfaceVariant = QuietColors.fill, onSurfaceVariant = QuietColors.muted,
            surfaceTint = QuietColors.surface, surfaceContainer = QuietColors.surface, surfaceContainerHigh = QuietColors.surface,
            surfaceContainerHighest = QuietColors.fill, outline = QuietColors.dim, outlineVariant = QuietColors.hairline,
            error = QuietColors.cream, onError = QuietColors.background,
        )
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

/** The days the picker offers: from the first one a reminder can still be set for, to a year ahead. */
@OptIn(ExperimentalMaterial3Api::class)
private class DaysBetween(private val first: LocalDate, private val last: LocalDate) : SelectableDates {
    override fun isSelectableDate(utcTimeMillis: Long): Boolean {
        val day = utcDay(utcTimeMillis)
        return !day.isBefore(first) && !day.isAfter(last)
    }

    override fun isSelectableYear(year: Int): Boolean = year in first.year..last.year
}

/** Material's date picker speaks in UTC midnights. */
private fun utcDay(utcMillis: Long): LocalDate = Instant.ofEpochMilli(utcMillis).atZone(ZoneOffset.UTC).toLocalDate()

private fun utcMidnight(day: LocalDate): Long = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DayDialog(copy: ReminderCopy, zone: ZoneId, range: LongRange, pickedMs: Long, onPick: (LocalDate) -> Unit, onCancel: () -> Unit) {
    val first = ReminderSchedule.day(range.first, zone)
    val last = ReminderSchedule.day(range.last, zone)
    val chosen = ReminderSchedule.day(pickedMs, zone)
    val start = if (chosen.isBefore(first)) first else if (chosen.isAfter(last)) last else chosen
    val state = rememberDatePickerState(
        initialSelectedDateMillis = utcMidnight(start),
        yearRange = first.year..last.year,
        selectableDates = remember(first, last) { DaysBetween(first, last) },
    )
    QuietPickerTheme {
        DatePickerDialog(
            onDismissRequest = onCancel,
            confirmButton = {
                QuietChip(copy.confirmPick, "reminders-day-confirm", selected = true) {
                    val selected = state.selectedDateMillis
                    if (selected != null) onPick(utcDay(selected)) else onCancel()
                }
            },
            dismissButton = { QuietChip(copy.cancel, "reminders-day-cancel", onClick = onCancel) },
        ) {
            DatePicker(state = state, title = null, showModeToggle = false)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun TimeDialog(copy: ReminderCopy, zone: ZoneId, pickedMs: Long, onPick: (Int, Int) -> Unit, onCancel: () -> Unit) {
    val time = remember(pickedMs, zone) { Instant.ofEpochMilli(pickedMs).atZone(zone).toLocalTime() }
    val state = rememberTimePickerState(initialHour = time.hour, initialMinute = time.minute)
    QuietPickerTheme {
        AlertDialog(
            onDismissRequest = onCancel,
            confirmButton = { QuietChip(copy.confirmPick, "reminders-time-confirm", selected = true) { onPick(state.hour, state.minute) } },
            dismissButton = { QuietChip(copy.cancel, "reminders-time-cancel", onClick = onCancel) },
            text = { TimeInput(state = state) },
        )
    }
}
