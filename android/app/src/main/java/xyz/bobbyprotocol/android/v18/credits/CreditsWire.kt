package xyz.bobbyprotocol.android.v18.credits

import org.json.JSONObject
import xyz.bobbyprotocol.android.data.BobbyQuotaPolicy
import xyz.bobbyprotocol.android.v18.V18Host
import java.time.OffsetDateTime

// Credits (1.8): what GET /api/bobby-access says, read the way iOS reads it (BobbyAccess.swift,
// NucleoLevels.swift). Lenient on purpose: a field the server did not send is unknown, and an
// unknown number is never shown as zero. Pure: no network, no clock, no Android classes.

/**
 * Words for logic that runs without a screen: English and Spanish as written where they are said,
 * the other four languages from the catalog, `{0}` and `{1}` filled last. The app hands in the
 * host's own `text`; a test hands in two languages.
 */
interface Words {
    fun text(en: String, es: String, vararg args: Any?): String
}

class HostWords(private val host: V18Host) : Words {
    override fun text(en: String, es: String, vararg args: Any?): String = host.text(en, es, *args)
}

/** The three analysis levels, as the server names them. */
enum class CreditsLevel(val id: String) {
    RAPIDO("rapido"), PROFUNDO("profundo"), MAXIMO("maximo");

    /** The level as the level pill names it. */
    fun label(words: Words): String = when (this) {
        RAPIDO -> words.text("Quick", "Rápido")
        PROFUNDO -> words.text("Deep", "Profundo")
        MAXIMO -> words.text("Max", "Máximo")
    }
}

internal object CreditsJson {
    /** A text the server sent. A JSON null, another type or an empty string is no text. */
    fun text(json: JSONObject, key: String): String? = (json.opt(key) as? String)?.takeIf { it.isNotEmpty() }

    /** A read count: a whole, non-negative JSON number, never a boolean. */
    fun count(json: JSONObject, key: String): Int? = BobbyQuotaPolicy.count(json.opt(key))

    /** ISO-8601 with or without fractions of a second, `Z` or an offset: epoch milliseconds, or null. */
    fun millis(iso: String?): Long? {
        if (iso.isNullOrEmpty()) return null
        return try { OffsetDateTime.parse(iso).toInstant().toEpochMilli() } catch (_: Exception) { null }
    }
}

/** `access`: the Quick-read meter. */
data class ReadAccess(
    /** `anon` | `free` | `pro`. */
    val tier: String,
    val used: Int,
    /** null = no limit (Bobby Pro). */
    val limit: Int?,
    val remaining: Int?,
    /** ISO-8601; null = nothing comes back (a guest's reads do not). */
    val resetsAt: String?,
    val paywall: Boolean,
    /** Gifted reads: a balance of their own, never part of the plan's count. */
    val bonus: Int = 0,
) {
    val isPro: Boolean get() = tier == "pro"
    val resetsMillis: Long? get() = CreditsJson.millis(resetsAt)

    companion object {
        val TIERS: Set<String> = setOf("anon", "free", "pro")

        /** An unknown tier is no access object at all (a server this build does not understand). */
        fun fromJson(json: JSONObject?): ReadAccess? {
            if (json == null) return null
            val tier = (json.opt("tier") as? String)?.takeIf { it in TIERS } ?: return null
            return ReadAccess(
                tier = tier, used = CreditsJson.count(json, "used") ?: 0, limit = CreditsJson.count(json, "limit"),
                remaining = CreditsJson.count(json, "remaining"), resetsAt = CreditsJson.text(json, "resetsAt"),
                paywall = json.opt("paywall") == true, bonus = CreditsJson.count(json, "bonus") ?: 0,
            )
        }
    }
}

/** `{used, limit, remaining, bonus, windowDays, resetsAt}` for Deep or Max. */
data class LevelMeter(
    val used: Int,
    val limit: Int?,
    val remaining: Int?,
    val bonus: Int,
    val windowDays: Int?,
    val resetsAt: String?,
) {
    val resetsMillis: Long? get() = CreditsJson.millis(resetsAt)

    companion object {
        fun fromJson(json: JSONObject?): LevelMeter? {
            if (json == null) return null
            return LevelMeter(
                used = CreditsJson.count(json, "used") ?: 0, limit = CreditsJson.count(json, "limit"),
                remaining = CreditsJson.count(json, "remaining"), bonus = CreditsJson.count(json, "bonus") ?: 0,
                windowDays = CreditsJson.count(json, "windowDays"), resetsAt = CreditsJson.text(json, "resetsAt"),
            )
        }
    }
}

/** `referral`: the person's own invitation, how many friends joined, and any gifted Bobby Pro days. */
data class Referral(
    val code: String,
    val url: String,
    val accepted: Int,
    val max: Int,
    val rewardDays: Int?,
    val proUntil: String?,
    /** `referral` | `admin`: where gifted days came from. */
    val proSource: String?,
) {
    /** The link as it may be shared: only Bobby's own site. */
    val shareUrl: String? get() = url.takeIf { link -> SITES.any { link.startsWith(it) } }

    companion object {
        const val DEFAULT_FRIENDS = 5
        private val SITES = listOf("https://bobbyprotocol.xyz/", "https://www.bobbyprotocol.xyz/")

        fun fromJson(json: JSONObject?): Referral? {
            if (json == null) return null
            val code = CreditsJson.text(json, "code") ?: return null
            val url = CreditsJson.text(json, "url") ?: return null
            return Referral(
                code = code, url = url, accepted = CreditsJson.count(json, "accepted") ?: 0,
                max = CreditsJson.count(json, "max") ?: DEFAULT_FRIENDS, rewardDays = CreditsJson.count(json, "rewardDays"),
                proUntil = CreditsJson.text(json, "proUntil"), proSource = CreditsJson.text(json, "proSource"),
            )
        }
    }
}

/** `subscription`: `{provider, status, currentPeriodEnd}`. */
data class Subscription(
    /** `google` | `apple` | `stripe`. */
    val provider: String?,
    val status: String?,
    val currentPeriodEnd: String?,
) {
    val periodEndMillis: Long? get() = CreditsJson.millis(currentPeriodEnd)

    companion object {
        fun fromJson(json: JSONObject?): Subscription? {
            if (json == null) return null
            return Subscription(CreditsJson.text(json, "provider"), CreditsJson.text(json, "status"), CreditsJson.text(json, "currentPeriodEnd"))
        }
    }
}

/** Everything the Credits surfaces may look at, in one value. */
data class CreditsSnapshot(
    val access: ReadAccess? = null,
    val meters: Map<CreditsLevel, LevelMeter> = emptyMap(),
    val referral: Referral? = null,
    val subscription: Subscription? = null,
    /** Bobby Pro can be bought in this build, from this store: the gate for every Pro promise. */
    val proPurchasable: Boolean = false,
    val signedIn: Boolean = false,
    /** `plans.freeReadsPerWeek`: what a free account gets, for the guest's line. null = not known, or no cap. */
    val freeReadsPerWeek: Int? = null,
    /** `plans.referral`, before the account has a referral of its own. */
    val rewardDays: Int? = null,
    val maxFriends: Int? = null,
)

/** `plans`: the terms the server publishes, the same for everyone. Kept as the last reply said them. */
class CreditsPlans {
    var freeReadsPerWeek: Int? = null
        private set
    var rewardDays: Int? = null
        private set
    var maxFriends: Int = Referral.DEFAULT_FRIENDS
        private set

    /** `null` means there is no weekly cap right now; a reply without `plans` says nothing. */
    fun note(body: JSONObject?) {
        val plans = body?.optJSONObject("plans") ?: return
        freeReadsPerWeek = CreditsJson.count(plans, "freeReadsPerWeek")?.takeIf { it > 0 }
        val referral = plans.optJSONObject("referral") ?: return
        CreditsJson.count(referral, "rewardDays")?.let { rewardDays = it }
        CreditsJson.count(referral, "maxFriends")?.let { maxFriends = it }
    }
}

object CreditsWire {
    /** `levels.levels.{profundo, maximo}` of the reply; a level the server did not send is not in the map. */
    fun meters(body: JSONObject?): Map<CreditsLevel, LevelMeter> {
        val perLevel = body?.optJSONObject("levels")?.optJSONObject("levels") ?: return emptyMap()
        val out = LinkedHashMap<CreditsLevel, LevelMeter>()
        for (level in listOf(CreditsLevel.PROFUNDO, CreditsLevel.MAXIMO)) {
            LevelMeter.fromJson(perLevel.optJSONObject(level.id))?.let { out[level] = it }
        }
        return out
    }

    /** The server sells Bobby Pro through Google Play right now (the rule BillingPolicy applies before a purchase). */
    fun googleSalesReady(body: JSONObject?): Boolean {
        if (body == null) return false
        val payments = body.optJSONObject("payments") ?: return false
        return payments.opt("google") == true && payments.opt("revenuecat") == true && body.opt("purchaseReservationVersion") == 1
    }
}
