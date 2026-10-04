package xyz.bobbyprotocol.android.ui

import android.os.Build
import android.view.HapticFeedbackConstants
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import xyz.bobbyprotocol.android.data.CouponCredits
import xyz.bobbyprotocol.android.data.CouponRedemptionFailure
import xyz.bobbyprotocol.android.data.CouponRedemptionOutcome
import xyz.bobbyprotocol.android.data.CouponRedemptionReceipt
import xyz.bobbyprotocol.android.data.CouponRedemptionState
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import java.util.Locale

@Composable
fun CouponRedemptionContent(
    session: NucleoSession, state: CouponRedemptionState,
    onRedeem: (String) -> Unit, onCheckBalance: () -> Unit,
    onDismissOutcome: () -> Unit, onRead: () -> Unit,
) {
    CouponRedemptionContent(session.language, state, onRedeem, onCheckBalance, onDismissOutcome, onRead)
}

/** Production form with explicit copy context; tests use the same UI without an account repository. */
@Composable
internal fun CouponRedemptionContent(
    language: String, state: CouponRedemptionState,
    onRedeem: (String) -> Unit, onCheckBalance: () -> Unit,
    onDismissOutcome: () -> Unit, onRead: () -> Unit,
) {
    val text: (String) -> String = { CouponCopy.text(it, language = language) }
    var code by remember { mutableStateOf("") }
    val busy = state.isRedeeming || state.isCheckingBalance
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(text("intro"))
        OutlinedTextField(code, { code = it.take(512).uppercase(Locale.ROOT) },
            label = { Text(text("code")) }, singleLine = true,
            enabled = !busy, modifier = Modifier.fillMaxWidth().testTag("coupon-code"))
        Button(onClick = { onRedeem(code) }, enabled = !busy && code.isNotBlank(), modifier = Modifier.fillMaxWidth().testTag("coupon-redeem")) {
            if (state.isRedeeming) CircularProgressIndicator()
            Text(text(if (state.isRedeeming) "redeeming" else "redeem"))
        }
        (state.outcome as? CouponRedemptionOutcome.Failed)?.let {
            Text(text(when (it.reason) {
                CouponRedemptionFailure.ACCOUNT_REQUIRED -> "accountRequired"
                CouponRedemptionFailure.INVALID_CODE -> "invalidCode"
                CouponRedemptionFailure.EXPIRED -> "expired"
                CouponRedemptionFailure.EXHAUSTED -> "exhausted"
                CouponRedemptionFailure.RATE_LIMITED -> "rateLimited"
                CouponRedemptionFailure.UNAVAILABLE, CouponRedemptionFailure.INVALID_RESPONSE -> "unavailable"
            }), modifier = Modifier.testTag("coupon-error").semantics { liveRegion = LiveRegionMode.Polite })
        }
        if (state.balanceUnavailable) Text(text("balanceUnavailable"))
        state.checkedBalance?.let { CouponBalance(it, language) }
        TextButton(onClick = onCheckBalance, enabled = !busy, modifier = Modifier.testTag("coupon-check-balance")) { Text(text("checkBalance")) }
        Text(text("noRestore"), style = MaterialTheme.typography.bodySmall)
    }
    val outcome = state.outcome
    val receipt = when (outcome) {
        is CouponRedemptionOutcome.Redeemed -> outcome.receipt
        is CouponRedemptionOutcome.AlreadyRedeemed -> outcome.receipt
        else -> null
    }
    if (receipt != null) {
        val isNewGift = outcome is CouponRedemptionOutcome.Redeemed
        CouponSuccessPopup(receipt, isNewGift, language,
            onRead = { if (isNewGift) onRead() else { onDismissOutcome(); onCheckBalance() } },
            onDone = { code = ""; onDismissOutcome() })
    }
}

@Composable
private fun CouponBalance(bonus: CouponCredits, language: String) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.testTag("coupon-balance")) {
        Text(CouponCopy.text("balance", language = language), style = MaterialTheme.typography.titleSmall)
        Text(listOf(CouponCopy.text("quickBalance", bonus.reads, language),
            CouponCopy.text("deepBalance", bonus.profundo, language),
            CouponCopy.text("maxBalance", bonus.maximo, language)).joinToString(" · "))
    }
}

@Composable
fun CouponSuccessPopup(
    receipt: CouponRedemptionReceipt, isNewGift: Boolean, language: String,
    onRead: () -> Unit, onDone: () -> Unit,
) {
    val text: (String) -> String = { CouponCopy.text(it, language = language) }
    val title = text(if (isNewGift) "applied" else "already")
    val view = LocalView.current
    LaunchedEffect(receipt, isNewGift) {
        if (isNewGift) view.performHapticFeedback(if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.KEYBOARD_TAP)
        // The modal title and confirmed benefit are announced once. Decorative particles are hidden.
        val benefit = receipt.granted?.let { gift -> listOfNotNull(
            if (gift.reads > 0) CouponCopy.text(if (gift.reads == 1) "oneRead" else "manyReads", gift.reads, language) else null,
            if (gift.profundo > 0) CouponCopy.text("profundoAdded", gift.profundo, language) else null,
            if (gift.maximo > 0) CouponCopy.text("maximoAdded", gift.maximo, language) else null).joinToString(". ") }.orEmpty()
        @Suppress("DEPRECATION")
        view.announceForAccessibility(listOf(title, benefit, text(if (isNewGift) "next" else "alreadyNext")).filter(String::isNotBlank).joinToString(". "))
    }
    Dialog(onDismissRequest = onDone) {
        Surface(shape = RoundedCornerShape(28.dp), color = Color(0xFF08080C), contentColor = Color(0xFFF2EBDF),
            modifier = Modifier.testTag("coupon-success").semantics { paneTitle = title }) {
            Column(Modifier.verticalScroll(rememberScrollState()).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                CouponCelebration(reduceMotion = !isNewGift)
                Text(title, style = MaterialTheme.typography.headlineSmall, textAlign = TextAlign.Center,
                    modifier = Modifier.semantics { heading() })
                receipt.granted?.let { gift ->
                    if (gift.reads > 0) Text(CouponCopy.text(if (gift.reads == 1) "oneRead" else "manyReads", gift.reads, language),
                        color = Color(0xFFAC86EF), style = MaterialTheme.typography.titleLarge, textAlign = TextAlign.Center)
                    if (gift.profundo > 0) Text(CouponCopy.text("profundoAdded", gift.profundo, language))
                    if (gift.maximo > 0) Text(CouponCopy.text("maximoAdded", gift.maximo, language))
                }
                receipt.bonus?.let { CouponBalance(it, language) }
                    ?: if (isNewGift) Text(text("pending"), style = MaterialTheme.typography.bodyMedium) else Unit
                Text(text(if (isNewGift) "next" else "alreadyNext"), textAlign = TextAlign.Center)
                Text(text("noRestore"), style = MaterialTheme.typography.bodySmall, textAlign = TextAlign.Center)
                Button(onRead, Modifier.fillMaxWidth().testTag("coupon-start-read"),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFAC86EF), contentColor = Color(0xFF08080C))) {
                    Text(text(if (isNewGift) "read" else "checkBalance"))
                }
                TextButton(onDone, modifier = Modifier.testTag("coupon-done")) { Text(text("done"), color = Color(0xFFF2EBDF)) }
            }
        }
    }
}
