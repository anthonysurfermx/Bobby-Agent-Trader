package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.credits.CreditsBalance
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.CreditsCopy
import xyz.bobbyprotocol.android.v18.credits.CreditsNudges
import xyz.bobbyprotocol.android.v18.credits.CreditsRestoreNotice
import xyz.bobbyprotocol.android.v18.credits.CreditsRestoreState
import xyz.bobbyprotocol.android.v18.credits.HostWords
import java.time.ZoneId
import java.util.Locale

// Credits (1.8), owned by the `credits-invite` track: the one place that says what you have, how to
// get more, and what "Restore" is for. A port of ios/Bobby/Sources/V18/Credits/CreditsSheet.swift,
// in the reduced design (ios/Bobby/V18-DESIGN.md, "Credits"): rows of state, two quiet doors,
// restore with its answer under it. The sentences that used to sit under every row are one tap
// away, behind ⓘ. It opens from a nudge tap and from the profile's Credits row.
// Nothing is fetched before the risk notice is accepted: CreditsFlow holds that rule and the
// restore steps. Android shows one sheet at a time, so the invitation, the code and Bobby Pro take
// this sheet's place instead of opening over it, and the details replace the face inside it.
@Composable
fun CreditsSheet(host: V18Host, onClose: () -> Unit) {
    val center = remember(host) { CreditsCenter.of(host) }
    val words = remember(host) { HostWords(host) }
    // Reading these two is what redraws the screen when the centre, its flow or the store changes.
    val revision by center.revision.collectAsStateWithLifecycle()
    val billing by host.billing.collectAsStateWithLifecycle()
    var showsDetails by rememberSaveable { mutableStateOf(false) }
    var showsOtherAccount by rememberSaveable { mutableStateOf(false) }

    val riskAccepted = host.riskAccepted
    val snapshot = remember(revision, billing, riskAccepted) { center.snapshot() }
    val balance = CreditsBalance.make(snapshot, CreditsCopy(words, host.now(), Locale.forLanguageTag(host.locale), ZoneId.systemDefault()))
    val giftTotal = CreditsNudges.giftTotal(snapshot.access, snapshot.meters)
    // Read here, where a new revision redraws: what is drawn below always follows the flow.
    val loading = center.flow.loading
    val loadFailed = center.flow.loadFailed
    val restoreState = center.flow.restore
    val restoreAvailable = center.restoreAvailable

    LaunchedEffect(center) { center.flow.refresh() }
    // The gifted balance is on screen: the glass has no reason to announce it again.
    LaunchedEffect(giftTotal, snapshot.access != null) { center.acknowledgeGifts() }
    DisposableEffect(center) { onDispose { center.screenGone() } }

    if (showsDetails) {
        CreditsDetails(host, balance, CreditsBalance.inviteDetail(snapshot, words), restoreAvailable) { showsDetails = false }
    } else {
        val openDetails: () -> Unit = { showsDetails = true }
        val openPro: () -> Unit = { host.switchSheet("paywall") }
        val restore: () -> Unit = { host.scope.launch { center.flow.tapRestore() } }
        QuietSheet(host, host.text("Credits", "Créditos"), "credits-close", onClose,
                   onInfo = if (riskAccepted && balance.isKnown) openDetails else null) {
            Spacer(Modifier.height(14.dp))

            // What you have
            if (!riskAccepted) {
                Column(Modifier.padding(bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuietNote(CreditsRestoreNotice.beforeRiskNotice(words), tag = "credits-risk-required")
                    QuietChip(host.text("Risk notice", "Aviso de riesgo"), "credits-risk-open") { host.switchSheet("riskNotice") }
                }
            } else if (balance.isKnown) {
                for (line in balance.lines.filter { !it.isGift && it.kind != CreditsBalance.Line.Kind.PRO }) {
                    QuietRow(line.label, "credits-line-" + line.kind.id, value = line.face, note = line.faceNote, spoken = line.spoken)
                }
                val gifts = balance.giftFace
                if (gifts != null) {
                    QuietRow(host.text("Gifted", "De regalo"), "credits-line-gifts", value = gifts, spoken = balance.giftSpoken)
                }
                val pro = balance.line(CreditsBalance.Line.Kind.PRO)
                if (pro != null) {
                    // The plan's state is the row; where there is something to offer, the row is the door.
                    QuietRow(pro.label, if (balance.pro.offersPro) "credits-pro" else "credits-line-pro", value = pro.face, note = pro.faceNote,
                             chevron = balance.pro.offersPro, spoken = pro.spoken, onClick = if (balance.pro.offersPro) openPro else null)
                } else if (balance.pro.offersPro) {
                    QuietRow("Bobby Pro", "credits-pro", chevron = true, onClick = openPro)
                }
                if (!snapshot.signedIn) {
                    val weekly = snapshot.freeReadsPerWeek
                    if (weekly != null) {
                        QuietNote(host.text("Free account: {0} Quick reads weekly.", "Cuenta gratis: {0} lecturas Rápidas semanales.", weekly),
                                  Modifier.padding(top = 14.dp), tag = "credits-free-account")
                    }
                    Spacer(Modifier.height(12.dp))
                    QuietSignIn(host, "credits-sign-in") { provider -> center.signIn(provider, thenRestore = false) }
                }
            } else if (loading) {
                Box(Modifier.fillMaxWidth().heightIn(min = 60.dp).testTag("credits-loading"), contentAlignment = Alignment.Center) { QuietProgress() }
            } else if (loadFailed) {
                Column(Modifier.padding(bottom = 8.dp).testTag("credits-unavailable"), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    QuietNote(host.text("Balance unavailable.", "Saldo no disponible."))
                    QuietChip(host.text("Try again", "Reintentar"), "credits-retry") { host.scope.launch { center.flow.refresh() } }
                }
            } else {
                // Nothing asked yet (the first read is about to start): keep the place, show no number.
                Spacer(Modifier.height(60.dp))
            }

            // Get more
            if (riskAccepted) {
                Row(Modifier.padding(top = 10.dp), horizontalArrangement = Arrangement.spacedBy(26.dp)) {
                    QuietLink(host.text("Invite", "Invitar"), "credits-invite") { host.switchSheet("invite") }
                    QuietLink(host.text("Code", "Código"), "credits-coupon") { host.switchSheet("coupon") }
                }
            }

            // Restore: only where it can restore (this build can ask Google Play and the server can confirm it).
            if (restoreAvailable) {
                val running = restoreState == CreditsRestoreState.Running
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    QuietLink(if (running) host.text("Checking…", "Comprobando…") else host.text("Restore purchases", "Restaurar compras"),
                              "credits-restore", enabled = !running && riskAccepted, onClick = restore)
                    if (running) QuietProgress()
                }
                val notice = if (riskAccepted) CreditsRestoreNotice.make(restoreState, balance.pro, words) else null
                if (notice != null) {
                    RestoreAnswer(host, notice, showsOtherAccount, onMore = { showsOtherAccount = !showsOtherAccount },
                                  onSignIn = { provider -> center.signIn(provider, thenRestore = true) }, onRetry = restore)
                }
            }

            val manageUrl = if (balance.manage) host.manageSubscriptionUrl() else null
            if (manageUrl != null) {
                QuietLink(host.text("Manage subscription", "Gestionar suscripción"), "credits-manage-subscription") { host.openExternal(manageUrl) }
            }
        }
    }
}

/** The answer to a restore: one line that stays under the row, brought into view and announced, with its next step. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun RestoreAnswer(host: V18Host, notice: CreditsRestoreNotice, showsOtherAccount: Boolean, onMore: () -> Unit,
                          onSignIn: (String) -> Unit, onRetry: () -> Unit) {
    val reveal = remember { BringIntoViewRequester() }
    // The answer lands under the row: never below the fold.
    LaunchedEffect(notice.text) { reveal.bringIntoView() }
    Column(Modifier.fillMaxWidth().padding(bottom = 6.dp).bringIntoViewRequester(reveal).testTag("credits-restore-notice"),
           verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(notice.text, Modifier.testTag("credits-restore-text").semantics { liveRegion = LiveRegionMode.Polite },
             color = QuietColors.cream, fontSize = 14.sp, lineHeight = 19.sp)
        val more = notice.more
        if (more != null) {
            QuietLink(more.title, "credits-restore-more", onClick = onMore)
            if (showsOtherAccount) QuietNote(more.text, tag = "credits-restore-more-text")
        }
        when (notice.action) {
            CreditsRestoreNotice.Action.SIGN_IN -> QuietSignIn(host, "credits-restore-sign-in", onSignIn)
            CreditsRestoreNotice.Action.TRY_AGAIN -> QuietChip(host.text("Try again", "Reintentar"), "credits-restore-retry", onClick = onRetry)
            null -> Unit
        }
    }
}

/** ⓘ: the sentences that used to sit under every row. */
@Composable
private fun CreditsDetails(host: V18Host, balance: CreditsBalance, invite: String, restoreExists: Boolean, onClose: () -> Unit) {
    QuietSheet(host, host.text("Details", "Detalles"), "credits-details-close", onClose) {
        Column(Modifier.padding(top = 16.dp).testTag("credits-details"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            QuietNote(host.text("1 credit = 1 read", "1 crédito = 1 lectura"))
            for (line in balance.lines) QuietNote(line.spoken)
            QuietNote(invite)
            if (restoreExists) {
                QuietNote(host.text("Use this if you paid for Bobby Pro with your Google Play account on another phone or after reinstalling. Codes and gifts never need restoring.",
                                    "Úsalo si pagaste Bobby Pro con tu cuenta de Google Play en otro teléfono o después de reinstalar. Los códigos y regalos nunca necesitan restaurarse."))
            }
        }
    }
}

/**
 * The two ways into an account on Android, for a 1.8 sheet (iOS has one, Apple's own button).
 * The first is a main action; the second weighs the same as any other choice.
 */
@Composable
internal fun QuietSignIn(host: V18Host, tag: String, onSignIn: (String) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        QuietPrimary(host.text("Continue with Google", "Continuar con Google"), "$tag-google") { onSignIn("google") }
        QuietChip(host.text("Continue with Apple", "Continuar con Apple"), "$tag-apple", Modifier.fillMaxWidth()) { onSignIn("apple") }
    }
}
