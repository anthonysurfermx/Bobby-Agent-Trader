package xyz.bobbyprotocol.android.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import android.graphics.BitmapFactory
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import xyz.bobbyprotocol.android.billing.BillingState
import xyz.bobbyprotocol.android.billing.BillingStore
import xyz.bobbyprotocol.android.data.BobbyRepository
import xyz.bobbyprotocol.android.data.VoicePreference
import xyz.bobbyprotocol.android.equipment.*
import xyz.bobbyprotocol.android.nucleo.NucleoSession
import xyz.bobbyprotocol.android.nucleo.ProfileProgressPolicy
import xyz.bobbyprotocol.android.platform.AvatarShareSpec
import xyz.bobbyprotocol.android.platform.AvatarShareGear

internal object ProfilePalette {
    val background = Color(0xFF040306)
    val violet = Color(0xFFA795EF)
    val blue = Color(0xFF7886FA)
    val cyan = Color(0xFF80D9E8)
    val cream = Color(0xFFF2EDE4)
    val muted = Color(0xFFA39C91)
    val dim = Color(0xFF8A8378)
    val fill = cream.copy(alpha = .05f)
    val hairline = cream.copy(alpha = .07f)
}

/** Native profile presentation. Account operations remain callbacks owned by BobbySheet. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AccountProfile(
    session: NucleoSession, repository: BobbyRepository, billing: BillingStore, billingState: BillingState,
    busy: Boolean, onOpen: (String) -> Unit, onSignIn: (String) -> Unit,
    onExternal: (String) -> Unit, onShareAvatar: (AvatarShareSpec) -> Unit,
    onSync: () -> Unit, onDelete: () -> Unit, onSignOut: () -> Unit, onRestore: () -> Unit,
) {
    val context = LocalContext.current
    val account by repository.session.collectAsStateWithLifecycle()
    val epoch by repository.epoch.collectAsStateWithLifecycle()
    val owner = account?.userId
    val t: (String) -> String = { session.text(it) }
    var snapshot by remember(epoch, owner) { mutableStateOf(session.snapshot()) }
    var access by remember(epoch, owner) { mutableStateOf<JSONObject?>(null) }
    var landMetrics by remember(epoch, owner) { mutableStateOf<ProfileLandMetrics?>(null) }
    val equipment = remember(context) { EquipmentStore(context) }
    val catalog = remember(context) { EquipmentStore.catalog(context) }
    var disabled by remember(epoch, owner) { mutableStateOf<Set<String>>(emptySet()) }
    var equipmentReady by remember(epoch, owner) { mutableStateOf(false) }
    var languageMenu by remember { mutableStateOf(false) }
    var voiceMenu by remember { mutableStateOf(false) }
    val language = session.language
    val roster = remember(language, epoch) {
        session.roster().getJSONArray("companions").let { rows -> (0 until rows.length()).map { rows.getJSONObject(it) } }
    }
    fun current() = ProfileProgressPolicy.current(owner, epoch, repository.session.value?.userId, repository.epoch.value)
    LaunchedEffect(epoch, owner) {
        runCatching { equipment.bind(owner); disabled = equipment.unequippedIds() }.onSuccess { equipmentReady = true }
        while (isActive && current()) {
            if (session.ownerUserId == owner) snapshot = session.snapshot()
            delay(500)
        }
    }
    LaunchedEffect(epoch, owner, snapshot.optBoolean("riskAccepted")) {
        if (!snapshot.optBoolean("riskAccepted") || !current()) return@LaunchedEffect
        try {
            val result = repository.access()
            if (current() && session.riskAccepted) access = result.optJSONObject("access")
        } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { /* Unknown counts stay unknown. */ }
    }
    LaunchedEffect(epoch, owner, snapshot.optBoolean("riskAccepted")) {
        if (owner == null || !snapshot.optBoolean("riskAccepted") || !current()) return@LaunchedEffect
        try {
            val result = repository.requestForAccount(owner, epoch, "api/trader-land", headers = mapOf("X-Trader-Land-Client" to "2"))
            if (current() && session.riskAccepted) landMetrics = ProfileLandMetrics.parse(result)
        } catch (cancelled: CancellationException) { throw cancelled } catch (_: Exception) { /* No fixture or fallback count. */ }
    }
    val companion = roster.firstOrNull { it.optString("id") == session.companionId } ?: roster.first()
    val companionId = companion.getString("id")
    val level = snapshot.optJSONObject("level") ?: JSONObject()
    val xp = snapshot.optInt("xp").coerceAtLeast(0)
    val levelNumber = level.optInt("number", 1).coerceAtLeast(1)
    val displayName = companion.optJSONArray("evolutionNames")?.optString((levelNumber - 1).coerceAtMost(4))?.takeIf(String::isNotBlank)
        ?: companion.getString("label")
    val companions = roster.map { EquipmentCompanion(it.getString("id"), it.getString("label"), it.optInt("requiredLevel", 1)) }
    val owned = EquipmentLedger.ownedIds(catalog, companions, session.companionId, xp)
    val worn = if (equipmentReady) catalog.filter { it.companionId == companionId && EquipmentLedger.isEquipped(it.id, owned, disabled) } else emptyList()
    val confirmedPro = access?.optString("tier") == "pro" || billingState.isPro
    val aura = landMetrics?.aura ?: ProfileProgressPolicy.count(snapshot.opt("aura"))
    val privacy = { onExternal(BobbySupportLinks.url(BobbySupportLinks.Page.PRIVACY, session.language, session.locale, repository.country)) }
    val help = { onExternal(BobbySupportLinks.url(BobbySupportLinks.Page.SUPPORT, session.language, session.locale, repository.country)) }

    Column(Modifier.fillMaxWidth().testTag("account-profile"), verticalArrangement = Arrangement.spacedBy(0.dp)) {
        account?.displayName?.takeIf(String::isNotBlank)?.let {
            Text(t("Hi") + ", " + it, Modifier.fillMaxWidth().padding(top = 4.dp), color = ProfilePalette.muted, fontSize = 15.sp)
        }
        var stageReady by remember(epoch, companionId) { mutableStateOf(false) }
        Box(Modifier.fillMaxWidth().height(236.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(240.dp).background(Brush.radialGradient(listOf(ProfilePalette.violet.copy(alpha = .20f), ProfilePalette.blue.copy(alpha = .07f), Color.Transparent)), CircleShape))
            EquipmentCompanionArt(companionId, companion.optString("label"), Modifier.size(150.dp).alpha(if (stageReady) 0f else 1f))
            EquipmentStage(companionId, companion.optString("label"), worn, reducedMotion = snapshot.optBoolean("reducedMotion"),
                modifier = Modifier.fillMaxSize().alpha(if (stageReady) 1f else 0f), onReady = { stageReady = it })
        }
        Text(displayName.lowercase().replaceFirstChar(Char::titlecase), Modifier.align(Alignment.CenterHorizontally).testTag("account-display-name"), color = ProfilePalette.cream, fontSize = 32.sp, fontWeight = FontWeight.Light)
        Text(companion.optString("role"), Modifier.align(Alignment.CenterHorizontally).padding(top = 4.dp), color = ProfilePalette.muted, fontSize = 13.sp)
        Column(Modifier.fillMaxWidth().padding(top = 20.dp).testTag("account-level")) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Mono(t("Level") + " " + levelNumber + " · " + level.optString("name"), Modifier.weight(1f))
                val next = ProfileProgressPolicy.count(level.opt("nextMinXP"))
                Mono("$xp XP" + (next?.let { " / $it" } ?: ""))
            }
            Box(Modifier.fillMaxWidth().padding(top = 9.dp).height(3.dp).clip(CircleShape).background(ProfilePalette.cream.copy(alpha = .08f))) {
                Box(Modifier.fillMaxWidth((level.optDouble("progress").toFloat().takeIf { it.isFinite() } ?: 0f).coerceIn(0f, 1f)).fillMaxHeight()
                    .background(Brush.horizontalGradient(listOf(ProfilePalette.violet, ProfilePalette.cyan))))
            }
            Text(t("Earned with discipline, never volume."), Modifier.padding(top = 8.dp), color = ProfilePalette.dim, fontSize = 12.sp)
        }
        Row(Modifier.fillMaxWidth().padding(top = 22.dp).clip(RoundedCornerShape(16.dp)).background(ProfilePalette.violet.copy(alpha = .06f))
            .border(1.dp, ProfilePalette.violet.copy(alpha = .16f), RoundedCornerShape(16.dp)).padding(vertical = 12.dp).testTag("account-stats"), verticalAlignment = Alignment.CenterVertically) {
            ProfileStat(t("Streak"), snapshot.optInt("streak").toString(), Modifier.weight(1f))
            Box(Modifier.width(1.dp).height(26.dp).background(ProfilePalette.hairline))
            ProfileStat(t("Aura"), aura?.toString() ?: "—", Modifier.weight(1f))
            Box(Modifier.width(1.dp).height(26.dp).background(ProfilePalette.hairline))
            ProfileStat(t("Pieces"), landMetrics?.pieces?.toString() ?: "—", Modifier.weight(1f))
        }
        if (session.companionId != null) {
            Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.Center) {
                worn.forEach { item ->
                    Column(Modifier.weight(1f).clip(RoundedCornerShape(12.dp)).clickable { onOpen("locker") }.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        // The existing catalogue art is approved; ownership and outfit state decide visibility.
                        ProfileItemArt(item.art, t(if (item.isPet) "Pet" else "Gear"), Modifier.size(48.dp))
                        Text(t(if (item.isPet) "Pet" else "Gear"), color = ProfilePalette.dim, fontSize = 10.sp)
                    }
                }
                ProfileSmallButton("+", t("Locker")) { onOpen("locker") }
                ProfileSmallButton("◇", "Trader Land") { onOpen("isla") }
            }
        }
        ProfileSection(t("Your avatar"))
        ProfileRow(t("Your avatar") + (session.companionId?.let { " · " + companion.optString("label") } ?: ""),
            if (session.companionId == null) t("Choose who lives in your Bobby") else companion.optString("personality"), ProfileSymbol.AVATAR,
            trailing = t("Change"), tag = "account-avatar") { onOpen("squad") }
        if (session.companionId != null) ProfileRow(t("Share my avatar"), t("A card with your companion, level and gear"), ProfileSymbol.SHARE, tag = "account-share") {
            if (current()) onShareAvatar(AvatarShareSpec(companionId, displayName, level.optString("name"), levelNumber, xp, owned.size, catalog.size,
                worn.take(3).map { AvatarShareGear(it.art, session.text(it.nameEnglish, it.nameSpanish)) }))
        }
        ProfileRow(t("Gear"), "${owned.size} / ${catalog.size} · " + t("Earned"), ProfileSymbol.GEAR, tag = "account-gear") { onOpen("locker") }
        ProfileRow("Trader Land", t("Every read plants something"), ProfileSymbol.ISLAND, tag = "account-trader-land") { onOpen("isla") }

        ProfileSection(t("Account"))
        val remaining = ProfileProgressPolicy.count(access?.opt("remaining"))
        ProfileRow(if (confirmedPro) "Bobby Pro" else t("Reads left this week"), if (confirmedPro) t("Your account confirms Pro access") else remaining?.toString() ?: "—", ProfileSymbol.READS,
            trailing = if (confirmedPro && billing.managementUri() != null) t("Manage") else null, tag = "account-reads") {
            billing.managementUri()?.takeIf { confirmedPro }?.let { onExternal(it.toString()) } ?: onOpen("levels")
        }
        if (!confirmedPro) ProfileRow("Bobby Pro", t("Explore the plans available for your account"), ProfileSymbol.PRO, tag = "account-pro") { onOpen("paywall") }
        ProfileRow(t("Restore purchases"), t("Recover access confirmed by Google Play"), ProfileSymbol.SYNC,
            enabled = !busy && (account == null || billingState.canRestore), tag = "account-restore") { if (account == null) onOpen("paywall") else onRestore() }
        ProfileRow(t("Invite friends"), t("Share Bobby with someone you know"), ProfileSymbol.INVITE, tag = "account-invite") { onOpen("invite") }
        ProfileRow(t("Redeem a code"), t("Use a benefit confirmed by your account"), ProfileSymbol.GIFT) { onOpen("coupon") }
        ProfileRow(t("Market briefings"), t("Your reports and delivery settings"), ProfileSymbol.BRIEFING, tag = "account-briefings") { onOpen("briefings") }
        ProfileRow(t("Briefing settings"), t("Choose assets, language and scheduled consent"), ProfileSymbol.SETTINGS) { onOpen("briefingSettings") }
        HorizontalDivider(color = ProfilePalette.hairline)
        Row(Modifier.fillMaxWidth().padding(vertical = 12.dp).testTag("account-voice"), verticalAlignment = Alignment.CenterVertically) {
            ProfileIcon(ProfileSymbol.VOICE)
            Column(Modifier.weight(1f).padding(start = 12.dp, end = 8.dp)) {
                Text(t("Bobby's voice"), color = ProfilePalette.cream, fontSize = 15.sp)
                Text(t(if (snapshot.optBoolean("muted")) "Off · Bobby reads in silence" else "On · Bobby speaks his reads"), color = ProfilePalette.muted, fontSize = 12.sp)
            }
            Switch(checked = !snapshot.optBoolean("muted"), onCheckedChange = { session.setMuted(!it); snapshot = session.snapshot() }, enabled = !busy,
                colors = SwitchDefaults.colors(checkedThumbColor = ProfilePalette.cream, checkedTrackColor = ProfilePalette.violet))
        }
        Box {
            ProfileRow(t("Voice type"), voiceName(session.voicePreference, t), ProfileSymbol.VOICE, trailing = t("Change"), tag = "account-voice-type") { voiceMenu = true }
            DropdownMenu(voiceMenu, { voiceMenu = false }, containerColor = Color(0xFF0D0B15)) {
                VoicePreference.entries.forEach { choice -> DropdownMenuItem(text = { Text(voiceName(choice, t), color = ProfilePalette.cream) }, onClick = {
                    session.selectVoicePreference(choice.value); snapshot = session.snapshot(); voiceMenu = false
                }) }
            }
        }
        Box {
            val names = listOf("system" to t("Device language"), "en" to "English", "es" to "Español", "pt" to "Português", "fr" to "Français", "it" to "Italiano", "de" to "Deutsch")
            ProfileRow(t("Language"), names.firstOrNull { it.first == session.languageSelection }?.second ?: session.language, ProfileSymbol.LANGUAGE, trailing = t("Change"), tag = "account-language") { languageMenu = true }
            DropdownMenu(languageMenu, { languageMenu = false }, containerColor = Color(0xFF0D0B15)) {
                names.forEach { (value, label) -> DropdownMenuItem(text = { Text(label, color = ProfilePalette.cream) }, onClick = {
                    languageMenu = false; session.selectLanguage(value); snapshot = session.snapshot()
                }) }
            }
        }
        ProfileRow(t("Memory"), t("What Bobby remembers about your assets and preferences"), ProfileSymbol.MEMORY, tag = "account-memory") { onOpen("memory") }
        ProfileRow(t("Risk notice"), t("Review your AI and voice consent"), ProfileSymbol.RISK, tag = "account-risk") { onOpen("riskNotice") }
        ProfileRow(reportContentTitle(language), t("Tell us about an unsafe response"), ProfileSymbol.RISK) { onOpen("reportContent") }
        Spacer(Modifier.height(30.dp))
        HorizontalDivider(color = ProfilePalette.hairline)
        if (account != null) {
            val pending = snapshot.optInt("pendingAwards")
            val syncText = if (busy) t("Syncing…") else if (pending > 0) "$pending · " + t("Awards waiting to sync")
                else if (snapshot.isNull("syncedAt")) t("Not synced yet") else t("Synced")
            ProfileRow(when (account?.provider) { "google" -> t("Signed in with Google"); "apple" -> t("Signed in with Apple"); else -> t("Signed in") }, syncText, ProfileSymbol.SYNC,
                enabled = !busy && session.riskAccepted, tag = "account-sync") { onSync() }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = onSignOut, enabled = !busy, modifier = Modifier.testTag("account-sign-out")) { Text(t("Sign out"), color = ProfilePalette.muted, fontSize = 13.sp) }
                TextButton(onClick = onDelete, enabled = !busy, modifier = Modifier.testTag("account-delete")) { Text(t("Delete account"), color = Color(0xFFFF6B6B), fontSize = 13.sp) }
            }
        } else {
            Text(t("Sign in so your XP, streak, gear and island follow you"), Modifier.padding(top = 18.dp, bottom = 12.dp), color = ProfilePalette.muted, fontSize = 13.sp)
            ProfileAuthButton(t("Continue with Google"), repository.isAuthConfigured && !busy) { onSignIn("google") }
            Spacer(Modifier.height(8.dp))
            ProfileAuthButton(t("Continue with Apple"), repository.isAuthConfigured && !busy) { onSignIn("apple") }
            if (!repository.isAuthConfigured) Text(t("Sign-in is currently unavailable. Try again later."), Modifier.padding(top = 8.dp), color = ProfilePalette.dim, fontSize = 12.sp)
        }
        FlowRow(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.Center) {
            TextButton(onClick = privacy) { Text(t("Privacy policy"), color = ProfilePalette.dim, fontSize = 12.sp) }
            TextButton(onClick = help) { Text(t("Help and support"), color = ProfilePalette.dim, fontSize = 12.sp) }
        }
    }

}

internal data class ProfileLandMetrics(val aura: Int?, val pieces: Int) {
    companion object {
        fun parse(reply: JSONObject): ProfileLandMetrics? {
            if (!reply.optBoolean("ok") || reply.optJSONObject("land")?.optInt("size") !in setOf(8, 10, 12, 16)) return null
            val inventory = reply.optJSONArray("inventory") ?: return null
            if ((0 until inventory.length()).any { inventory.optJSONObject(it)?.optString("id").isNullOrBlank() }) return null
            return ProfileLandMetrics(ProfileProgressPolicy.count(reply.opt("aura")), inventory.length())
        }
    }
}

private fun voiceName(preference: VoicePreference, t: (String) -> String): String = t(when (preference) {
    VoicePreference.COMPANION -> "Companion's voice"; VoicePreference.FEMALE -> "Feminine"; VoicePreference.MALE -> "Masculine"
})
@Composable private fun Mono(text: String, modifier: Modifier = Modifier) { Text(text.uppercase(), modifier, color = ProfilePalette.dim, fontSize = 10.sp, fontFamily = FontFamily.Monospace, letterSpacing = 1.sp) }
@Composable private fun ProfileSection(label: String) { Mono(label, Modifier.fillMaxWidth().padding(top = 30.dp, bottom = 8.dp)) }
@Composable private fun ProfileStat(label: String, value: String, modifier: Modifier) {
    Column(modifier.semantics(mergeDescendants = true) {}, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = ProfilePalette.cream, fontSize = 17.sp, fontWeight = FontWeight.Medium)
        Mono(label, Modifier.padding(top = 4.dp))
    }
}
@Composable private fun ProfileSmallButton(label: String, description: String, action: () -> Unit) {
    Box(Modifier.padding(start = 6.dp).size(48.dp).clip(CircleShape).background(ProfilePalette.fill).clickable(onClick = action).semantics { contentDescription = description }, contentAlignment = Alignment.Center) {
        Text(label, color = ProfilePalette.muted, fontSize = 20.sp)
    }
}
@Composable private fun ProfileAuthButton(label: String, enabled: Boolean, action: () -> Unit) {
    Button(onClick = action, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = CircleShape,
        colors = ButtonDefaults.buttonColors(containerColor = ProfilePalette.cream, contentColor = ProfilePalette.background)) { Text(label) }
}
@Composable private fun ProfileRow(label: String, detail: String?, symbol: ProfileSymbol, enabled: Boolean = true,
    trailing: String? = null, tag: String = "", action: () -> Unit) {
    HorizontalDivider(color = ProfilePalette.hairline)
    Row(Modifier.fillMaxWidth().heightIn(min = 60.dp).clip(RoundedCornerShape(8.dp)).clickable(enabled = enabled, onClick = action)
        .alpha(if (enabled) 1f else .5f).padding(vertical = 12.dp, horizontal = 2.dp).testTag(tag).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.CenterVertically) {
        ProfileIcon(symbol)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, color = ProfilePalette.cream, fontSize = 15.sp)
            detail?.takeIf(String::isNotBlank)?.let { Text(it, color = ProfilePalette.dim, fontSize = 12.sp) }
        }
        trailing?.let { Text(it, color = ProfilePalette.muted, fontSize = 12.sp, modifier = Modifier.padding(end = 8.dp)) }
        Canvas(Modifier.size(12.dp)) { drawLine(ProfilePalette.dim, Offset(size.width*.3f,size.height*.2f),Offset(size.width*.7f,size.height*.5f),2f); drawLine(ProfilePalette.dim,Offset(size.width*.7f,size.height*.5f),Offset(size.width*.3f,size.height*.8f),2f) }
    }
}
private enum class ProfileSymbol { AVATAR, SHARE, GEAR, ISLAND, READS, PRO, SYNC, INVITE, GIFT, BRIEFING, SETTINGS, VOICE, LANGUAGE, MEMORY, RISK }
@Composable private fun ProfileIcon(symbol: ProfileSymbol) {
    Canvas(Modifier.size(32.dp).clip(RoundedCornerShape(10.dp)).background(ProfilePalette.fill)) {
        val stroke=Stroke(1.4.dp.toPx()); val ink=ProfilePalette.muted; val mid=Offset(size.width/2,size.height/2); val r=size.width*.22f
        fun line(x1:Float,y1:Float,x2:Float,y2:Float) = drawLine(ink,Offset(size.width*x1,size.height*y1),Offset(size.width*x2,size.height*y2),stroke.width)
        when(symbol) {
            ProfileSymbol.AVATAR, ProfileSymbol.INVITE -> { drawCircle(ink,r*.45f,Offset(mid.x,mid.y-r*.4f),style=stroke); drawArc(ink,180f,180f,false,Offset(mid.x-r,mid.y),Size(r*2,r*1.6f),style=stroke) }
            ProfileSymbol.LANGUAGE -> { drawCircle(ink,r,mid,style=stroke); drawOval(ink,Offset(mid.x-r*.45f,mid.y-r),Size(r*.9f,r*2),style=stroke); line(.28f,.5f,.72f,.5f) }
            ProfileSymbol.VOICE -> { val path=Path().apply { moveTo(size.width*.3f,size.height*.42f);lineTo(size.width*.42f,size.height*.42f);lineTo(size.width*.56f,size.height*.3f);lineTo(size.width*.56f,size.height*.7f);lineTo(size.width*.42f,size.height*.58f);lineTo(size.width*.3f,size.height*.58f);close() }; drawPath(path,ink,style=stroke); drawArc(ink,-60f,120f,false,Offset(mid.x,mid.y-r),Size(r*1.2f,r*2),style=stroke) }
            ProfileSymbol.SHARE -> { line(.5f,.64f,.5f,.27f);line(.5f,.27f,.37f,.4f);line(.5f,.27f,.63f,.4f);line(.28f,.55f,.28f,.73f);line(.28f,.73f,.72f,.73f);line(.72f,.73f,.72f,.55f) }
            ProfileSymbol.PRO -> { drawOval(ink,Offset(mid.x-r,mid.y-r*.45f),Size(r*1.2f,r*.9f),style=stroke);drawOval(ink,Offset(mid.x-r*.2f,mid.y-r*.45f),Size(r*1.2f,r*.9f),style=stroke) }
            ProfileSymbol.SYNC -> { drawArc(ink,-45f,285f,false,Offset(mid.x-r,mid.y-r),Size(r*2,r*2),style=stroke);line(.69f,.34f,.7f,.52f);line(.7f,.52f,.52f,.48f) }
            ProfileSymbol.RISK -> { val p=Path().apply { moveTo(mid.x,size.height*.25f);lineTo(size.width*.73f,size.height*.35f);lineTo(size.width*.68f,size.height*.62f);lineTo(mid.x,size.height*.77f);lineTo(size.width*.32f,size.height*.62f);lineTo(size.width*.27f,size.height*.35f);close() };drawPath(p,ink,style=stroke);line(.5f,.37f,.5f,.56f);drawCircle(ink,stroke.width*.7f,Offset(mid.x,size.height*.65f)) }
            ProfileSymbol.MEMORY -> { drawCircle(ink,r,mid,style=stroke);line(.5f,.28f,.5f,.72f);line(.37f,.36f,.44f,.45f);line(.63f,.36f,.56f,.45f);line(.37f,.62f,.44f,.55f);line(.63f,.62f,.56f,.55f) }
            ProfileSymbol.ISLAND -> { val p=Path().apply {moveTo(size.width*.27f,size.height*.45f);lineTo(mid.x,size.height*.3f);lineTo(size.width*.73f,size.height*.45f);lineTo(mid.x,size.height*.67f);close()};drawPath(p,ink,style=stroke);line(.27f,.58f,.5f,.78f);line(.5f,.78f,.73f,.58f) }
            ProfileSymbol.GEAR, ProfileSymbol.SETTINGS -> { for(x in listOf(.29f,.55f)) for(y in listOf(.29f,.55f)) drawRoundRect(ink,Offset(size.width*x,size.height*y),Size(size.width*.16f,size.height*.16f),style=stroke) }
            else -> { drawRoundRect(ink,Offset(size.width*.29f,size.height*.29f),Size(size.width*.42f,size.height*.42f),style=stroke);line(.37f,.44f,.63f,.44f);line(.37f,.57f,.58f,.57f) }
        }
    }
}

@Composable private fun ProfileItemArt(art: String, label: String, modifier: Modifier) {
    val context = LocalContext.current
    var bitmap by remember(art) { mutableStateOf<android.graphics.Bitmap?>(null) }
    LaunchedEffect(art) {
        if (!art.matches(Regex("(?:tool_[a-z]+_[123]|pet_[a-z]+)\\.png"))) return@LaunchedEffect
        bitmap = withContext(Dispatchers.IO) { runCatching { context.assets.open("equipment/$art").use { BitmapFactory.decodeStream(it) } }.getOrNull() }
    }
    bitmap?.let { Image(it.asImageBitmap(), label, modifier) } ?: Box(modifier.semantics { contentDescription = label })
}
