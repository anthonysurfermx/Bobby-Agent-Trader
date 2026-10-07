package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.selection.TextSelectionColors
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import xyz.bobbyprotocol.android.v18.V18Host

// The 1.8 kit: the few pieces every 1.8 sheet is made of, so that Credits, theses, memory,
// reminders and invitations read as one family next to the Núcleo. The Compose twin of
// ios/Bobby/Sources/V18/V18Kit.swift. One light title, rows of state, one main action, quiet
// links. No eyebrow labels, no cards, no paragraphs (ios/Bobby/V18-DESIGN.md).
// The app's inks only: nothing here is green, red or amber, which belong to a verdict word and to
// nothing else. A default Material button, switch, text button or progress ring is mint green in
// this app's theme: build with these parts, never with those.
// Sizes are sp, so text follows the system font size and wraps instead of shrinking; every target
// is at least 48 dp; every glyph has words for TalkBack.

/** The inks and surfaces of a 1.8 sheet (the profile's palette; no new colours). */
object QuietColors {
    /** The sheet behind every 1.8 screen (the iOS `nucleoSurface`). */
    val surface = Color(0xFF0D0B15)
    /** Ink on a cream control. */
    val background = Color(0xFF040306)
    val cream = Color(0xFFF2EDE4)
    val muted = Color(0xFFA39C91)
    val dim = Color(0xFF8A8378)
    val violet = Color(0xFFA795EF)
    val fill = cream.copy(alpha = .05f)
    val hairline = cream.copy(alpha = .07f)
    val stroke = violet.copy(alpha = .16f)
}

/** The few line glyphs the 1.8 screens use, drawn here (the app ships no icon library). */
enum class QuietGlyph { CLOSE, INFO, MORE, CHEVRON_RIGHT, CHEVRON_DOWN, CHEVRON_UP, COPY, BELL, CHECK, SHARE, PLUS }

/** The glyph alone, for a row or a label. It is decoration: the words next to it are what is read aloud. */
@Composable
fun QuietGlyphMark(glyph: QuietGlyph, modifier: Modifier = Modifier, tint: Color = QuietColors.muted) {
    Canvas(modifier.size(14.dp)) {
        val w = size.width
        val h = size.height
        val stroke = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round)
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) = drawLine(tint, Offset(w * x1, h * y1), Offset(w * x2, h * y2), stroke.width, StrokeCap.Round)
        when (glyph) {
            QuietGlyph.CLOSE -> { line(.2f, .2f, .8f, .8f); line(.8f, .2f, .2f, .8f) }
            QuietGlyph.INFO -> { drawCircle(tint, w * .09f, Offset(w * .5f, h * .2f)); line(.5f, .42f, .5f, .86f) }
            QuietGlyph.MORE -> { for (x in listOf(.16f, .5f, .84f)) drawCircle(tint, w * .09f, Offset(w * x, h * .5f)) }
            QuietGlyph.CHEVRON_RIGHT -> { line(.36f, .18f, .68f, .5f); line(.68f, .5f, .36f, .82f) }
            QuietGlyph.CHEVRON_DOWN -> { line(.18f, .36f, .5f, .68f); line(.5f, .68f, .82f, .36f) }
            QuietGlyph.CHEVRON_UP -> { line(.18f, .64f, .5f, .32f); line(.5f, .32f, .82f, .64f) }
            QuietGlyph.COPY -> {
                drawRoundRect(tint, Offset(w * .3f, h * .3f), Size(w * .56f, h * .56f), style = stroke)
                line(.14f, .66f, .14f, .14f); line(.14f, .14f, .66f, .14f)
            }
            QuietGlyph.BELL -> {
                drawArc(tint, 180f, 180f, false, Offset(w * .22f, h * .12f), Size(w * .56f, h * .56f), style = stroke)
                line(.22f, .4f, .22f, .68f); line(.78f, .4f, .78f, .68f); line(.12f, .68f, .88f, .68f)
                drawCircle(tint, w * .07f, Offset(w * .5f, h * .86f))
            }
            QuietGlyph.CHECK -> { line(.16f, .54f, .4f, .78f); line(.4f, .78f, .84f, .24f) }
            QuietGlyph.SHARE -> {
                line(.5f, .62f, .5f, .1f); line(.5f, .1f, .3f, .3f); line(.5f, .1f, .7f, .3f)
                line(.16f, .5f, .16f, .88f); line(.16f, .88f, .84f, .88f); line(.84f, .88f, .84f, .5f)
            }
            QuietGlyph.PLUS -> { line(.5f, .16f, .5f, .84f); line(.16f, .5f, .84f, .5f) }
        }
    }
}

/** A round glyph button inside a 48 dp target (close, details, more). `label` is what TalkBack says. */
@Composable
fun QuietGlyphButton(glyph: QuietGlyph, label: String, tag: String, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier.size(48.dp).clip(CircleShape).clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .alpha(if (enabled) 1f else .45f).testTag(tag).semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size(30.dp).background(QuietColors.fill, CircleShape), contentAlignment = Alignment.Center) { QuietGlyphMark(glyph, Modifier.size(12.dp)) }
    }
}

/** One entry of a `QuietMenu`. Every entry is plain ink, a destructive one too: a menu never uses a verdict colour. */
class QuietMenuItem(val title: String, val tag: String, val onClick: () -> Unit)

/** The "…" of a sheet or a row: a glyph button that unfolds a short list of actions. */
@Composable
fun QuietMenu(label: String, tag: String, items: List<QuietMenuItem>, glyph: QuietGlyph = QuietGlyph.MORE) {
    var open by remember { mutableStateOf(false) }
    Box {
        QuietGlyphButton(glyph, label, tag) { open = true }
        DropdownMenu(open, { open = false }, containerColor = QuietColors.surface) {
            for (item in items) {
                DropdownMenuItem(text = { Text(item.title, color = QuietColors.cream, fontSize = 15.sp) }, modifier = Modifier.testTag(item.tag),
                                 onClick = { open = false; item.onClick() })
            }
        }
    }
}

/**
 * Whether the sheet may be dismissed right now (swipe, back, tap outside). A screen with unsaved
 * words sets `canDismiss` and shows its own question in `onBlocked`. `V18Sheets` provides it.
 */
class QuietDismissGuard {
    var canDismiss: () -> Boolean = { true }
    var onBlocked: () -> Unit = {}
}

val LocalQuietDismissGuard = compositionLocalOf { QuietDismissGuard() }

/**
 * The frame of every 1.8 sheet: one title (and at most one supporting line), close on the right,
 * optionally details (ⓘ) and a menu (…) before it; the content scrolls; `bottom` stays pinned
 * (the main action and the line that must be read before it). Use `bottom` only on the sheets that
 * open at full height (the thesis editor and review): a half-height sheet would hide it.
 */
@Composable
fun QuietSheet(
    host: V18Host,
    title: String,
    closeTag: String,
    onClose: () -> Unit,
    subtitle: String? = null,
    /** ⓘ: the detail that used to be a paragraph on the face. */
    onInfo: (() -> Unit)? = null,
    /** Shown before the close button, usually a `QuietMenu`. */
    trailing: (@Composable () -> Unit)? = null,
    bottom: (@Composable ColumnScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(Modifier.fillMaxWidth().imePadding()) {
        Column(Modifier.weight(1f, fill = false).fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 17.dp, top = 6.dp, bottom = 28.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f).padding(top = 8.dp, end = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(title, Modifier.semantics { heading() }, color = QuietColors.cream, fontSize = 26.sp, lineHeight = 32.sp, fontWeight = FontWeight.Light)
                    if (subtitle != null) Text(subtitle, color = QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp)
                }
                if (onInfo != null) QuietGlyphButton(QuietGlyph.INFO, host.text("Details", "Detalles"), "$closeTag-info", onClick = onInfo)
                if (trailing != null) trailing()
                QuietGlyphButton(QuietGlyph.CLOSE, host.text("Close", "Cerrar"), closeTag, onClick = onClose)
            }
            Column(Modifier.fillMaxWidth().padding(end = 7.dp), content = content)
        }
        if (bottom != null) Column(Modifier.fillMaxWidth().padding(start = 24.dp, end = 24.dp, top = 10.dp, bottom = 12.dp), content = bottom)
    }
}

/**
 * One row of state: what it is on the left, its value on the right (digits line up), an optional
 * glyph before the label and a chevron when it leads somewhere. A hairline closes it.
 * `spoken` is what TalkBack reads instead of the glyphs and fractions on the face.
 */
@Composable
fun QuietRow(
    label: String,
    tag: String,
    value: String? = null,
    /** A second, dimmer value (a day, a date). */
    note: String? = null,
    glyph: QuietGlyph? = null,
    chevron: Boolean = false,
    hairline: Boolean = true,
    spoken: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val digits = LocalTextStyle.current.copy(fontFeatureSettings = "tnum")
    var face = Modifier.fillMaxWidth().testTag(tag)
    if (onClick != null) face = face.clickable(role = Role.Button, onClick = onClick)
    face = if (spoken != null) face.clearAndSetSemantics { contentDescription = spoken; if (onClick != null) role = Role.Button } else face.semantics(mergeDescendants = true) {}
    Column(face) {
        Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (glyph != null) Box(Modifier.width(20.dp), contentAlignment = Alignment.Center) { QuietGlyphMark(glyph) }
            Text(label, Modifier.weight(1f), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 21.sp)
            if (note != null) Text(note, color = QuietColors.dim, fontSize = 13.sp, style = digits)
            if (value != null) Text(value, Modifier.widthIn(max = 200.dp), color = QuietColors.muted, fontSize = 16.sp, lineHeight = 21.sp, textAlign = TextAlign.End, style = digits)
            if (chevron) QuietGlyphMark(QuietGlyph.CHEVRON_RIGHT, Modifier.size(11.dp), QuietColors.dim)
        }
        if (hairline) Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
    }
}

/** The one main action of a sheet: a cream capsule across the width. Three words at most. */
@Composable
fun QuietPrimary(title: String, tag: String, busy: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val live = enabled && !busy
    Row(
        Modifier.fillMaxWidth().heightIn(min = 50.dp).clip(CircleShape).background(QuietColors.cream).clickable(enabled = live, role = Role.Button, onClick = onClick)
            .alpha(if (enabled) 1f else .45f).padding(horizontal = 18.dp, vertical = 10.dp).testTag(tag),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(16.dp), color = QuietColors.background, strokeWidth = 2.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(title, color = QuietColors.background, fontSize = 15.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
    }
}

/** A quiet capsule: a second choice of equal weight (Not now / Remember), a preset, an option. */
@Composable
fun QuietChip(title: String, tag: String, modifier: Modifier = Modifier, selected: Boolean = false, enabled: Boolean = true, onClick: () -> Unit) {
    val shape = CircleShape
    var face = modifier.heightIn(min = 48.dp).clip(shape).background(if (selected) QuietColors.cream else QuietColors.fill, shape)
    if (!selected) face = face.border(1.dp, QuietColors.stroke, shape)
    Box(
        face.clickable(enabled = enabled, role = Role.Button, onClick = onClick).alpha(if (enabled) 1f else .45f)
            .padding(horizontal = 16.dp, vertical = 8.dp).testTag(tag).semantics { this.selected = selected },
        contentAlignment = Alignment.Center,
    ) {
        Text(title, color = if (selected) QuietColors.background else QuietColors.cream, fontSize = 14.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
    }
}

/** A plain text action, for everything that is not the main one. 48 dp tall, no background. */
@Composable
fun QuietLink(title: String, tag: String, glyph: QuietGlyph? = null, enabled: Boolean = true, onClick: () -> Unit) {
    Row(
        Modifier.heightIn(min = 48.dp).clickable(enabled = enabled, role = Role.Button, onClick = onClick).alpha(if (enabled) 1f else .45f).testTag(tag),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (glyph != null) QuietGlyphMark(glyph, Modifier.size(12.dp))
        Text(title, color = QuietColors.muted, fontSize = 14.sp)
    }
}

/** One muted line: a scope, a boundary, a result. Never a paragraph, never a card. */
@Composable
fun QuietNote(text: String, modifier: Modifier = Modifier, glyph: QuietGlyph? = null, tag: String? = null) {
    Row(
        (if (tag != null) modifier.testTag(tag) else modifier).semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top,
    ) {
        if (glyph != null) QuietGlyphMark(glyph, Modifier.padding(top = 3.dp).size(12.dp), QuietColors.dim)
        Text(text, color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
    }
}

/** A row that unfolds: a label and a count, closed by default. What is inside was text on the face before. */
@Composable
fun QuietDisclosure(host: V18Host, label: String, tag: String, count: Int? = null, initiallyOpen: Boolean = false, content: @Composable ColumnScope.() -> Unit) {
    var open by rememberSaveable(tag) { mutableStateOf(initiallyOpen) }
    val state = if (open) host.text("Expanded", "Abierto") else host.text("Collapsed", "Cerrado")
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).clickable(role = Role.Button) { open = !open }.testTag(tag).semantics(mergeDescendants = true) { stateDescription = state },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(label, color = QuietColors.cream, fontSize = 16.sp)
            if (count != null) Text(count.toString(), color = QuietColors.dim, fontSize = 14.sp, style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"))
            Spacer(Modifier.weight(1f))
            QuietGlyphMark(if (open) QuietGlyph.CHEVRON_UP else QuietGlyph.CHEVRON_DOWN, Modifier.size(11.dp), QuietColors.dim)
        }
        if (open) Column(Modifier.fillMaxWidth().padding(bottom = 12.dp), content = content)
        Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
    }
}

/**
 * A switch and what it switches. `detail` is for the one case where a state needs a sentence (a
 * paused memory says what paused means); otherwise the label is enough.
 */
@Composable
fun QuietToggle(host: V18Host, label: String, tag: String, checked: Boolean, detail: String? = null, saving: Boolean = false, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    val state = if (saving) host.text("Saving", "Guardando") else if (checked) host.text("On", "Activado") else host.text("Off", "Desactivado")
    Column(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth().heightIn(min = 52.dp).toggleable(value = checked, enabled = enabled && !saving, role = Role.Switch, onValueChange = onChange)
                .padding(vertical = 4.dp).testTag(tag).semantics(mergeDescendants = true) { stateDescription = state },
            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(label, color = QuietColors.cream, fontSize = 16.sp, lineHeight = 21.sp)
                if (detail != null) Text(detail, color = QuietColors.muted, fontSize = 13.sp, lineHeight = 18.sp)
            }
            if (saving) CircularProgressIndicator(Modifier.size(16.dp), color = QuietColors.muted, strokeWidth = 2.dp)
            // The row is the control; the switch only draws its state.
            Switch(checked = checked, onCheckedChange = null, enabled = enabled, colors = SwitchDefaults.colors(
                checkedThumbColor = QuietColors.cream, checkedTrackColor = QuietColors.violet, checkedBorderColor = QuietColors.violet,
                uncheckedThumbColor = QuietColors.muted, uncheckedTrackColor = QuietColors.fill, uncheckedBorderColor = QuietColors.stroke))
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(QuietColors.hairline))
    }
}

/** A small progress ring in the sheet's ink (the default one is green). */
@Composable
fun QuietProgress(modifier: Modifier = Modifier) {
    CircularProgressIndicator(modifier.size(18.dp), color = QuietColors.muted, strokeWidth = 2.dp)
}

/**
 * Colours for an `OutlinedTextField` on a 1.8 sheet: cream ink, a violet focus line, nothing green.
 * The selection and its handles are named too: Material's own take the theme's primary colour.
 */
@Composable
fun quietFieldColors(): TextFieldColors = OutlinedTextFieldDefaults.colors(
    focusedTextColor = QuietColors.cream, unfocusedTextColor = QuietColors.cream, cursorColor = QuietColors.violet,
    selectionColors = TextSelectionColors(handleColor = QuietColors.violet, backgroundColor = QuietColors.violet.copy(alpha = .4f)),
    focusedBorderColor = QuietColors.violet, unfocusedBorderColor = QuietColors.stroke,
    focusedLabelColor = QuietColors.muted, unfocusedLabelColor = QuietColors.dim,
    focusedPlaceholderColor = QuietColors.dim, unfocusedPlaceholderColor = QuietColors.dim,
    focusedContainerColor = Color.Transparent, unfocusedContainerColor = Color.Transparent,
)
