package xyz.bobbyprotocol.android.ui.v18

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import xyz.bobbyprotocol.android.v18.V18Host
import xyz.bobbyprotocol.android.v18.credits.CreditsCenter
import xyz.bobbyprotocol.android.v18.credits.HostWords
import xyz.bobbyprotocol.android.v18.credits.Words
import xyz.bobbyprotocol.android.v18.invite.InviteCopy
import xyz.bobbyprotocol.android.v18.invite.InviteDesk
import xyz.bobbyprotocol.android.v18.invite.InviteLink
import xyz.bobbyprotocol.android.v18.invite.InviteNotice

// Owned by the `credits-invite` track: the 1.8 invitation screen. A port of NucleoInviteSheet
// (ios/Bobby/Sources/Nucleo/NucleoLevels.swift) and ios/Bobby/Sources/V18/Invite/InviteSheetSections.swift,
// in the reduced design (ios/Bobby/V18-DESIGN.md, "Invite"): who gets what in one line, the real
// progress, the person's own code (a tap copies it), one action, and a folded field for a friend's
// code. An invitation that is waiting, or was just answered, comes first.
// The route `invite` exists since 1.1.4; this screen draws it now.
/** True: V18Sheets draws this screen for the route `invite` instead of BobbySheet's 1.1.4 one. */
const val INVITE_SHEET_READY = true

@Composable
fun InviteSheet(host: V18Host, onClose: () -> Unit) {
    val desk = remember(host) { InviteDesk.of(host) }
    val credits = remember(host) { CreditsCenter.of(host) }
    val words = remember(host) { HostWords(host) }
    val invites = desk.center
    // Reading these is what redraws the screen when the invitation, the balances or the store change.
    val revision by desk.revision.collectAsStateWithLifecycle()
    val loadedRevision by credits.revision.collectAsStateWithLifecycle()
    val billing by host.billing.collectAsStateWithLifecycle()
    var showsDetails by rememberSaveable { mutableStateOf(false) }
    var copied by rememberSaveable { mutableStateOf(false) }

    val snapshot = remember(revision, loadedRevision, billing) { credits.snapshot() }
    val referral = snapshot.referral
    val pendingCode = remember(revision) { invites.pendingCode }
    val notice = remember(revision) { invites.notice }
    val claiming = remember(revision) { invites.isClaiming }
    val linkKnown = credits.loaded || credits.flow.loadFailed
    // Fixed when the sheet opens, so the section does not move while a code is being typed.
    val acceptFirst = rememberSaveable { pendingCode != null || notice != null }
    // The server's numbers for the reward sentence; null while the app does not have them.
    val reward = InviteCopy.rewardTerms(referral, snapshot.rewardDays, snapshot.maxFriends ?: 0)
    // The reward is promised only where Bobby Pro can be had in this build.
    val promises = snapshot.proPurchasable && reward != null && referral != null

    LaunchedEffect(credits) { credits.flow.refresh() }
    DisposableEffect(desk) { onDispose { desk.screenGone() } }

    if (showsDetails) {
        QuietSheet(host, host.text("Details", "Detalles"), "invite-details-close", { showsDetails = false }) {
            Column(Modifier.padding(top = 16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (reward != null) QuietNote(InviteCopy.reward(reward.days, reward.max, words), tag = "invite-reward")
                QuietNote(host.text("New accounts only, within their first week.", "Solo cuentas nuevas, durante su primera semana."))
            }
        }
    } else {
        val openDetails: () -> Unit = { showsDetails = true }
        QuietSheet(host,
                   if (acceptFirst && pendingCode != null) host.text("Invitation ready", "Invitación pendiente") else host.text("Invite a friend", "Invita a un amigo"),
                   "invite-close", onClose,
                   subtitle = if (promises && reward != null) InviteCopy.rewardShort(reward.days, words) else null,
                   onInfo = if (promises) openDetails else null) {
            if (acceptFirst) {
                Spacer(Modifier.height(16.dp))
                InviteAccept(host, desk, words, startsOpen = true, pendingCode = pendingCode, notice = notice, claiming = claiming)
                Box(Modifier.padding(top = 14.dp).fillMaxWidth().height(1.dp).background(QuietColors.hairline))
            }
            // Real progress, and only where the reward exists.
            if (promises && referral != null) {
                Spacer(Modifier.height(16.dp))
                InviteSlots(host, minOf(referral.accepted, referral.max), referral.max)
            }
            val link = referral?.shareUrl
            if (referral != null && link != null) {
                // The eight characters on their own: a friend who installs the app first can type them.
                val ownCode = InviteLink.normalized(referral.code)
                if (ownCode != null) {
                    Spacer(Modifier.height(10.dp))
                    InviteOwnCode(host, ownCode, copied) { copied = true }
                }
                Spacer(Modifier.height(10.dp))
                QuietPrimary(host.text("Share", "Compartir"), "invite-share-link") { host.share(InviteCopy.shareMessage(ownCode, words) + "\n" + link) }
            } else if (snapshot.signedIn) {
                QuietNote(if (linkKnown) host.text("Invite link unavailable.", "Link de invitación no disponible.") else host.text("Getting your link…", "Obteniendo tu link…"),
                          Modifier.padding(top = 16.dp))
            } else if (!acceptFirst) {
                QuietNote(host.text("Sign in for your link.", "Inicia sesión para tener tu link."), Modifier.padding(top = 16.dp))
            }
            if (!acceptFirst) {
                Spacer(Modifier.height(8.dp))
                InviteAccept(host, desk, words, startsOpen = false, pendingCode = pendingCode, notice = notice, claiming = claiming)
            }
        }
    }
}

/** Neutral slots and the count: what happened, not a decoration. */
@Composable
private fun InviteSlots(host: V18Host, filled: Int, total: Int) {
    val spoken = host.text("{0} of {1} friends", "{0} de {1} amigos", filled, total)
    Row(Modifier.fillMaxWidth().heightIn(min = 28.dp).clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        for (index in 0 until maxOf(1, total)) {
            if (index < filled) Box(Modifier.size(10.dp).background(QuietColors.cream, CircleShape))
            else Box(Modifier.size(10.dp).background(QuietColors.fill, CircleShape).border(1.dp, QuietColors.stroke, CircleShape))
        }
        Spacer(Modifier.weight(1f))
        Text("$filled/$total", color = QuietColors.muted, fontSize = 15.sp, style = LocalTextStyle.current.copy(fontFeatureSettings = "tnum"))
    }
}

/** The person's own eight characters, large. A tap copies them. */
@Composable
private fun InviteOwnCode(host: V18Host, code: String, copied: Boolean, onCopied: () -> Unit) {
    val spoken = host.text("Your invitation code", "Tu código de invitación") + ", " + code.toList().joinToString(" ")
    Row(Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .clickable(onClickLabel = host.text("Copy code", "Copiar código"), role = Role.Button) {
                host.copy(code)
                host.haptic("success")
                onCopied()
            }
            .testTag("invite-copy-code").clearAndSetSemantics { contentDescription = spoken },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(code, color = QuietColors.cream, fontSize = 26.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Monospace, letterSpacing = 3.sp, maxLines = 1)
        if (copied) Text(host.text("Copied", "Copiado"), color = QuietColors.muted, fontSize = 13.sp)
        else QuietGlyphMark(QuietGlyph.COPY, tint = QuietColors.dim)
    }
}

/**
 * "Have a code?": the code field, Apply, the result in words. Open from the start when an invitation
 * is waiting or was just answered; otherwise one quiet link unfolds the field.
 */
@Composable
private fun InviteAccept(host: V18Host, desk: InviteDesk, words: Words, startsOpen: Boolean, pendingCode: String?, notice: InviteNotice?, claiming: Boolean) {
    val invites = desk.center
    var code by rememberSaveable { mutableStateOf(pendingCode ?: "") }
    var open by rememberSaveable { mutableStateOf(false) }
    val signedIn = host.signedIn
    val riskAccepted = host.riskAccepted
    // The result in words. "Sign in…" is already the section's own line while signed out, and so is
    // the consent line while the risk notice is not accepted.
    val result = notice?.takeIf { it != InviteNotice.CONSENT_NEEDED && !(it == InviteNotice.SIGN_IN_NEEDED && !signedIn) }?.text(words)
    val apply: () -> Unit = {
        val typed = code
        if (!invites.isClaiming && typed.isNotEmpty()) host.scope.launch { invites.submit(typed) }
    }
    // An invitation link arrived while the sheet was open, or the code was settled. What the person
    // is typing is never replaced by a result line alone.
    LaunchedEffect(pendingCode) {
        if (pendingCode != null) {
            code = pendingCode
        } else if (invites.notice == InviteNotice.ACCEPTED) {
            code = ""
        }
    }

    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (!(startsOpen || open)) {
            QuietLink(host.text("Have a code?", "¿Tienes un código?"), "invite-have-code") { open = true }
        } else {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { typed -> code = InviteLink.tidy(typed) },
                    modifier = Modifier.weight(1f).testTag("invite-code-field"),
                    placeholder = { Text(host.text("Invitation code", "Código de invitación"), fontSize = 15.sp) },
                    singleLine = true,
                    textStyle = TextStyle(fontSize = 17.sp, fontWeight = FontWeight.Medium, fontFamily = FontFamily.Monospace),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { apply() }),
                    colors = quietFieldColors(),
                )
                QuietChip(if (claiming) host.text("Applying…", "Aplicando…") else host.text("Apply", "Aplicar"), "invite-apply",
                          enabled = !claiming && code.isNotEmpty(), onClick = apply)
            }
            if (result != null) {
                Text(result, Modifier.testTag("invite-result").semantics { liveRegion = LiveRegionMode.Polite }, color = QuietColors.cream, fontSize = 14.sp, lineHeight = 19.sp)
            }
            if (pendingCode != null) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    QuietNote(host.text("Saved on this phone.", "Guardada en este teléfono."), Modifier.weight(1f), tag = "invite-saved")
                    QuietLink(host.text("Remove", "Quitar"), "invite-forget") {
                        invites.forget()
                        code = ""
                    }
                }
            }
            if (!riskAccepted) {
                // Without the risk notice nothing is sent, with or without an account: a code typed
                // here is only kept on the phone, and this line says why nothing else happened.
                QuietNote(InviteNotice.CONSENT_NEEDED.text(words), tag = "invite-consent-needed")
            } else if (!signedIn) {
                QuietNote(InviteNotice.SIGN_IN_NEEDED.text(words), tag = "invite-sign-in-needed")
                QuietSignIn(host, "invite-sign-in") { provider -> desk.signIn(provider) }
            }
        }
    }
}
