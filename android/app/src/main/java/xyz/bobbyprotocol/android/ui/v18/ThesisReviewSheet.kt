package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisRevision
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.reminders.ReminderCopy
import xyz.bobbyprotocol.android.v18.reminders.ReminderEntry
import xyz.bobbyprotocol.android.v18.reminders.ReminderIntent
import xyz.bobbyprotocol.android.v18.theses.ThesisCopy
import xyz.bobbyprotocol.android.v18.theses.ThesisEvents
import xyz.bobbyprotocol.android.v18.theses.ThesisRefusalCopy
import xyz.bobbyprotocol.android.v18.theses.ThesisReviewResult
import xyz.bobbyprotocol.android.v18.theses.ThesisReviewer
import xyz.bobbyprotocol.android.v18.theses.ThesisThenNow
import xyz.bobbyprotocol.android.v18.theses.V18HostWords

// Review a thesis (1.8), the screen of ios/Bobby/Sources/V18/Theses/ThesisReviewSheet.swift.
// ios/Bobby/V18-DESIGN.md, "Review, before" and "Review, after": the person's words as a short
// excerpt, one button, and the line that says where the words go pinned directly above it and
// never folded away; afterwards a verdict word (the only colour), two prices, what was not
// checked (on the face, every time, in full), and three lists that unfold. Then the person
// decides: keep it, or edit or archive it from the menu. Closing records no decision.
// The route opens it through the host's focus (a thesis id).

/**
 * Wait / Review in the verdict's own colour (amber / green), exactly as a read shows it on the glass
 * (the page's `--cio` and `--alpha`). No new colour, and nothing else on these screens is coloured.
 */
private val VerdictReview = Color(0xFF3FE0B5)
private val VerdictWait = Color(0xFFF6B94E)

@Composable
fun ThesisReviewSheet(host: V18Host, onClose: () -> Unit) {
    val words = remember(host) { V18HostWords(host) }
    val copy = remember(words) { ThesisCopy(words) }
    val events = remember(host) { ThesisEvents.of(host) }
    val reminders = remember(host) { ReminderIntent.of(host) }
    // Evaluated once, when the sheet appears: the hand-off is consumed here and nowhere else.
    val reviewer = remember(host) { ThesisReviewer(host.focus.takeThesisId(), ThesisReviewer.live(host), host.scope) }
    val r = observedModel(reviewer, reviewer.changes)

    DisposableEffect(host, reviewer) {
        // A reminder for the thesis on screen has nothing to announce while it is open: the
        // reminders are told which thesis that is, and told again when the screen goes.
        events.openThesisId = reviewer.thesis?.id
        reminders.markOpen(reviewer.thesis?.id)
        // The book changed under the screen (theses written signed out follow the person into an account).
        val stopBook = host.theses.addListener { reviewer.reload() }
        val stopAccount = host.onAccountChanged { reviewer.accountChanged() }
        onDispose {
            // Closing the sheet cancels a review in flight; its reply, if one still comes, is ignored.
            reviewer.cancel()
            events.openThesisId = null
            reminders.markOpen(null)
            stopBook()
            stopAccount()
        }
    }

    fun edit(id: String) {
        host.focus.thesisId = id
        host.switchSheet(V18Routes.THESIS_EDITOR)
    }

    val phase = r().phase
    val thesis = r().thesis
    val done = phase is ThesisReviewer.Phase.Done
    val ready = phase == ThesisReviewer.Phase.Ready
    val title = when {
        thesis == null -> host.text("Thesis review", "Revisión de tesis")
        done -> thesis.symbol
        else -> host.text("Review {0}", "Revisar {0}", thesis.symbol)
    }
    // What a review costs, before it starts: the level it runs at and the one read it uses.
    val subtitle = if (ready && thesis != null) host.text("{0} · 1 read", "{0} · 1 lectura", copy.levelName(reviewer.currentLevel)) else null
    // Everything that is not the one main action: edit, archive, the reminder.
    val menu: (@Composable () -> Unit)? = if (thesis == null || !(done || ready)) null else ({
        val items = ArrayList<QuietMenuItem>()
        items.add(QuietMenuItem(host.text("Edit", "Editar"), "thesis-review-edit") {
            if (!done || reviewer.decide(ThesisEvents.EDIT)) edit(thesis.id)
        })
        if (done) {
            items.add(QuietMenuItem(host.text("Archive", "Archivar"), "thesis-review-archive") {
                if (reviewer.decide(ThesisEvents.ARCHIVE)) onClose()
            })
        }
        // The Reminders screen opens on this thesis, with its choices unfolded.
        items.add(QuietMenuItem(ReminderCopy.of(host).setReminder, "thesis-review-remind") { ReminderEntry.open(host, thesis.id) })
        QuietMenu(host.text("More options", "Más opciones"), "thesis-review-menu", items)
    })
    // Pinned under the scroll while the review has not started: where the person's words go,
    // directly above the button that sends them. Never below the fold, never behind a tap.
    val startBar: (@Composable ColumnScope.() -> Unit)? = if (!ready || thesis == null) null else ({
        QuietNote(copy.sentToProviders, tag = "thesis-review-providers")
        Spacer(Modifier.height(10.dp))
        QuietPrimary(host.text("Review now", "Revisar ahora"), "thesis-review-start") { reviewer.start() }
    })

    QuietSheet(host, title, "thesis-review-close", onClose, subtitle = subtitle, trailing = menu, bottom = startBar) {
        when (val current = r().phase) {
            is ThesisReviewer.Phase.Ready -> {
                val shown = r().thesis
                if (shown != null) Before(host, copy, shown, r)
            }
            is ThesisReviewer.Phase.Running -> During(host) { reviewer.cancel() }
            is ThesisReviewer.Phase.Done -> After(host, copy, current.result, r) {
                if (reviewer.decide(ThesisEvents.KEEP)) onClose()
            }
            is ThesisReviewer.Phase.Refused -> Refused(host, copy, ThesisRefusalCopy(current.refusal, words), reviewer)
        }
    }
}

// Before

@Composable
private fun Before(host: V18Host, copy: ThesisCopy, thesis: SavedThesis, r: () -> ThesisReviewer) {
    // The person's own words, never rewritten: two lines here, all of them one tap below.
    Text(thesis.hypothesis, Modifier.padding(top = 22.dp, bottom = 10.dp).testTag("thesis-review-excerpt"), color = QuietColors.cream, fontSize = 17.sp,
         lineHeight = 24.sp, maxLines = 2, overflow = TextOverflow.Ellipsis)
    QuietDisclosure(host, host.text("Your thesis", "Tu tesis"), "thesis-review-words") {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            WordsPart(null, thesis.hypothesis)
            if (thesis.worry.isNotEmpty()) WordsPart(host.text("What worries you?", "¿Qué te preocupa?"), thesis.worry)
            if (thesis.changeMind.isNotEmpty()) WordsPart(host.text("What changes your mind?", "¿Qué te haría cambiar?"), thesis.changeMind)
            val horizon = thesis.horizon
            if (horizon != null) WordsPart(host.text("Time frame", "Plazo"), copy.horizon(horizon))
            QuietNote(copy.reviewedLine(thesis, host.now()), tag = "thesis-review-last")
        }
    }
    History(host, copy, r().pastReviews())
}

@Composable
private fun WordsPart(label: String?, text: String) {
    Column(Modifier.fillMaxWidth().semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        if (label != null) Text(label, color = QuietColors.dim, fontSize = 13.sp)
        Text(text, color = QuietColors.cream, fontSize = 15.sp, lineHeight = 21.sp)
    }
}

// During

@Composable
private fun During(host: V18Host, onCancel: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(top = 56.dp).testTag("thesis-review-running"), horizontalAlignment = Alignment.CenterHorizontally,
           verticalArrangement = Arrangement.spacedBy(14.dp)) {
        QuietProgress()
        Text(host.text("Reading price evidence…", "Leyendo evidencia de precio…"), color = QuietColors.muted, fontSize = 15.sp, textAlign = TextAlign.Center)
        QuietChip(host.text("Cancel", "Cancelar"), "thesis-review-cancel", onClick = onCancel)
    }
}

// After

@Composable
private fun After(host: V18Host, copy: ThesisCopy, result: ThesisReviewResult, r: () -> ThesisReviewer, onKeep: () -> Unit) {
    val word = copy.verdictWord(result.verdict)
    if (word != null) {
        Text(word, Modifier.padding(top = 18.dp).testTag("thesis-review-verdict"), color = if (result.verdict == "review") VerdictReview else VerdictWait,
             fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
    }
    val headline = result.headline
    if (headline != null) {
        Text(headline, Modifier.padding(top = 6.dp).testTag("thesis-review-headline"), color = QuietColors.cream, fontSize = 16.sp, lineHeight = 22.sp)
    }
    Spacer(Modifier.height(20.dp))
    ThenAndNow(host, copy, result.thenNow)
    // What this review is, and what it did not look at: on the face, every time, in full.
    QuietNote(copy.scopeLine(result.notChecked, result.thesis.isEquity), Modifier.padding(top = 16.dp, bottom = 8.dp), tag = "thesis-review-not-checked")
    val notes = result.notes
    if (notes != null) {
        Evidence(host, host.text("Supports", "Respalda"), notes.supports, "thesis-review-supports")
        Evidence(host, host.text("Challenges", "Cuestiona"), notes.challenges, "thesis-review-challenges")
        Evidence(host, host.text("Unknown", "Sin resolver"), notes.unknowns, "thesis-review-unknowns")
    } else {
        QuietNote(host.text("Evidence lists unavailable.", "Listas de evidencia no disponibles."), Modifier.padding(vertical = 8.dp), tag = "thesis-review-lists-unavailable")
    }
    History(host, copy, r().pastReviews(result.thesis.lastReview))
    Spacer(Modifier.height(22.dp))
    QuietPrimary(host.text("Keep thesis", "Mantener tesis"), "thesis-review-keep", onClick = onKeep)
    Text(copy.footer, Modifier.fillMaxWidth().padding(top = 14.dp).testTag("thesis-review-footer"), color = QuietColors.dim, fontSize = 12.sp, textAlign = TextAlign.Center)
}

/**
 * Two neutral prices with their dates; the change is arithmetic on the phone and appears only
 * when the thesis has its own starting price.
 */
@Composable
private fun ThenAndNow(host: V18Host, copy: ThesisCopy, numbers: ThesisThenNow) {
    Column(Modifier.fillMaxWidth().testTag("thesis-review-then-now")) {
        val then = numbers.thenPrice
        if (then != null) {
            Figure(listOfNotNull(host.text("Then", "Antes"), numbers.thenAtMillis?.let { copy.day(it, host.now()) }).joinToString(" · "), copy.price(then), null)
        }
        val now = numbers.nowPrice
        if (now != null) {
            Figure(listOfNotNull(host.text("Evidence", "Evidencia"), numbers.asOfMillis?.let { copy.moment(it) }).joinToString(" · "), copy.price(now),
                   numbers.changePct?.let { copy.percent(it) })
        }
        if (numbers.missingStart) QuietNote(copy.noStartingPrice, Modifier.padding(top = 4.dp), tag = "thesis-review-no-start")
    }
}

@Composable
private fun Figure(label: String, value: String, change: String?) {
    val digits = LocalTextStyle.current.copy(fontFeatureSettings = "tnum")
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(label, Modifier.weight(1f), color = QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp)
        if (change != null) Text(change, color = QuietColors.muted, fontSize = 14.sp, style = digits)
        Text(value, color = QuietColors.cream, fontSize = 16.sp, fontWeight = FontWeight.Medium, style = digits)
    }
}

/** One of the three lists, folded, with its real count. An empty one says so when opened. */
@Composable
private fun Evidence(host: V18Host, title: String, items: List<String>, tag: String) {
    QuietDisclosure(host, title, tag, count = items.size) {
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (items.isEmpty()) QuietNote(host.text("None in this evidence.", "Nada en esta evidencia."))
            for (item in items) Text(item, color = QuietColors.cream, fontSize = 15.sp, lineHeight = 21.sp)
        }
    }
}

// Past reviews

@Composable
private fun History(host: V18Host, copy: ThesisCopy, past: List<ThesisRevision>) {
    if (past.isEmpty()) return
    // The past review whose stored lists are open.
    var open by remember { mutableStateOf<String?>(null) }
    QuietDisclosure(host, host.text("History", "Historial"), "thesis-review-history-toggle", count = past.size) {
        for (revision in past) {
            key(revision.id) {
                PastRow(host, copy, revision, open == revision.id) { open = if (open == revision.id) null else revision.id }
            }
        }
    }
}

/**
 * One past review: its date, price and verdict; a tap opens the three lists it kept, so
 * everything stored on this phone about a review can be read again.
 */
@Composable
private fun PastRow(host: V18Host, copy: ThesisCopy, revision: ThesisRevision, open: Boolean, onToggle: () -> Unit) {
    val folded = if (open) host.text("Expanded", "Abierto") else host.text("Collapsed", "Cerrado")
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Button, onClick = onToggle).testTag("thesis-review-past-" + revision.id)
            .semantics(mergeDescendants = true) { stateDescription = folded },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(copy.pastLine(revision, host.now()), Modifier.weight(1f), color = QuietColors.muted, fontSize = 14.sp, lineHeight = 19.sp,
             style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"))
        QuietGlyphMark(if (open) QuietGlyph.CHEVRON_UP else QuietGlyph.CHEVRON_DOWN, Modifier.size(10.dp), QuietColors.dim)
    }
    if (open) {
        val lists = ThesisReviewer.storedLists(revision)
        Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).testTag("thesis-review-past-lists"), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            if (lists.isEmpty()) QuietNote(host.text("No lists were kept for this review.", "No se guardaron listas de esta revisión."))
            for (list in lists) {
                val name = when (list.kind) {
                    ThesisReviewer.StoredList.Kind.SUPPORTS -> host.text("Supports", "Respalda")
                    ThesisReviewer.StoredList.Kind.CHALLENGES -> host.text("Challenges", "Cuestiona")
                    ThesisReviewer.StoredList.Kind.UNKNOWNS -> host.text("Unknown", "Sin resolver")
                }
                Text(name, Modifier.padding(top = 4.dp), color = QuietColors.dim, fontSize = 13.sp)
                for (item in list.items) Text(item, color = QuietColors.muted, fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
    }
}

// Refused

@Composable
private fun Refused(host: V18Host, copy: ThesisCopy, said: ThesisRefusalCopy, reviewer: ThesisReviewer) {
    Column(Modifier.fillMaxWidth().padding(top = 22.dp).testTag("thesis-review-refused").semantics(mergeDescendants = true) {},
           verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(said.text, color = QuietColors.cream, fontSize = 16.sp, lineHeight = 22.sp)
        val detail = said.detail
        if (detail != null) QuietNote(detail)
    }
    Column(Modifier.fillMaxWidth().padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        said.actions.forEachIndexed { index, action ->
            RefusalButton(host, copy, action, index == 0, reviewer)
        }
    }
}

@Composable
private fun RefusalButton(host: V18Host, copy: ThesisCopy, action: ThesisRefusalCopy.Action, prominent: Boolean, reviewer: ThesisReviewer) {
    when (action) {
        ThesisRefusalCopy.Action.SIGN_IN -> {
            // The same two doors as the profile. The sheet closes when the account arrives.
            Choice(host.text("Continue with Google", "Continuar con Google"), prominent, "thesis-review-signin-google") { host.signIn("google") }
            Choice(host.text("Continue with Apple", "Continuar con Apple"), false, "thesis-review-signin-apple") { host.signIn("apple") }
        }
        ThesisRefusalCopy.Action.PRO -> Choice(host.text("See Bobby Pro", "Ver Bobby Pro"), prominent, "thesis-review-pro") { host.switchSheet("paywall") }
        ThesisRefusalCopy.Action.QUICK -> Choice(host.text("Review with {0}", "Revisar con {0}", copy.levelName(ThesisReviewer.QUICK)), prominent, "thesis-review-quick") {
            reviewer.start(ThesisReviewer.QUICK)
        }
        ThesisRefusalCopy.Action.RETRY -> Choice(host.text("Try again", "Reintentar"), prominent, "thesis-review-retry") { reviewer.start() }
        ThesisRefusalCopy.Action.CREDITS -> Choice(host.text("See credits", "Ver créditos"), prominent, "thesis-review-credits") { host.switchSheet(V18Routes.CREDITS) }
        ThesisRefusalCopy.Action.MY_THESES -> Choice(host.text("My theses", "Mis tesis"), prominent, "thesis-review-list") { host.switchSheet(V18Routes.THESES) }
    }
}

@Composable
private fun Choice(title: String, prominent: Boolean, tag: String, onClick: () -> Unit) {
    if (prominent) QuietPrimary(title, tag, onClick = onClick) else QuietChip(title, tag, Modifier.fillMaxWidth(), onClick = onClick)
}
