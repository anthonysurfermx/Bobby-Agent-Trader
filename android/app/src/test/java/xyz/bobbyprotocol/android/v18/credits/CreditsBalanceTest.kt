package xyz.bobbyprotocol.android.v18.credits

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.credits.CreditsBalance.Line.Kind
import xyz.bobbyprotocol.android.v18.credits.CreditsProStatus.Plan
import java.time.ZoneOffset
import java.util.Locale

/**
 * Credits (1.8): one model of what a person has, from the server's word only. The cases of
 * ios/Bobby/Tests/CreditsBalanceTests.swift: every line the Credits screen can show, in English and
 * Spanish, and the promise that a number the server did not send is left out instead of shown as zero.
 * Where iOS says "an App Store plan", Android says "a Google Play plan"; a plan bought on an iPhone
 * is its own case here.
 */
class CreditsBalanceTest {
    /** Wednesday 7 October 2026, noon UTC. */
    private val now = at("2026-10-07T12:00:00Z")

    private fun copy(spanish: Boolean = false): CreditsCopy =
        CreditsCopy(TwoWords(spanish), now, if (spanish) Locale.forLanguageTag("es-MX") else Locale.US, ZoneOffset.UTC)

    private fun balance(snapshot: CreditsSnapshot, spanish: Boolean = false): CreditsBalance = CreditsBalance.make(snapshot, copy(spanish))

    private fun meter(json: String): LevelMeter = LevelMeter.fromJson(JSONObject(json))!!

    private fun referral(proUntil: String? = null, source: String? = null, rewardDays: Int? = 30, max: Int = 5): Referral {
        val json = JSONObject().put("code", "ABCDEFGH").put("url", "https://bobbyprotocol.xyz/desk?ref=ABCDEFGH&v=2").put("accepted", 1).put("max", max)
        if (rewardDays != null) json.put("rewardDays", rewardDays)
        if (proUntil != null) json.put("proUntil", proUntil)
        if (source != null) json.put("proSource", source)
        return Referral.fromJson(json)!!
    }

    private fun free(used: Int = 3, remaining: Int? = 7, resetsAt: String? = "2026-10-09T12:00:00Z", paywall: Boolean = true, bonus: Int = 0): ReadAccess =
        ReadAccess("free", used, 10, remaining, resetsAt, paywall, bonus)

    private val pro = ReadAccess("pro", 40, null, null, null, true)
    private val play = Subscription("google", "active", "2026-10-27T12:00:00Z")

    // Quick reads

    @Test fun aGuestSeesWhatIsLeftAndWhatAFreeAccountGives() {
        val anon = ReadAccess("anon", 1, 3, null, null, true)
        val guest = CreditsSnapshot(access = anon, signedIn = false, freeReadsPerWeek = 10)
        val en = balance(guest).line(Kind.QUICK)!!
        assertEquals("Quick reads", en.title)
        assertEquals("remaining falls back to limit − used; a guest's reads do not reset weekly", "2 of 3 left", en.value)
        assertEquals("Create your free account to get 10 every week", en.detail)
        val es = balance(guest, spanish = true).line(Kind.QUICK)!!
        assertEquals("Lecturas Rápidas", es.title)
        assertEquals("Te quedan 2 de 3", es.value)
        assertEquals("Crea tu cuenta gratis para tener 10 cada semana", es.detail)

        val unknownPlan = CreditsSnapshot(access = anon, signedIn = false)
        assertEquals("no number the server did not send", "Create your free account to keep reading", balance(unknownPlan).line(Kind.QUICK)?.detail)
        assertEquals("Crea tu cuenta gratis para seguir leyendo", balance(unknownPlan, spanish = true).line(Kind.QUICK)?.detail)
        assertNull("Bobby Pro belongs to an account: a guest has no line for it", balance(guest).line(Kind.PRO))
        assertEquals("2 of 3 reads", balance(guest).summary)
        assertEquals("2 de 3 lecturas", balance(guest, spanish = true).summary)
        assertEquals("the row's face is the fraction", "2/3", en.face)
        assertNull("a guest's reads do not come back on a day", en.faceNote)
    }

    @Test fun aFreeAccountSeesTheWeekAndTheDayItResets() {
        val snapshot = CreditsSnapshot(access = free(), signedIn = true)
        val en = balance(snapshot).line(Kind.QUICK)!!
        assertEquals("7 of 10 left this week", en.value)
        assertEquals("Next read back on Friday", en.detail)
        val es = balance(snapshot, spanish = true).line(Kind.QUICK)!!
        assertEquals("Te quedan 7 de 10 esta semana", es.value)
        assertEquals("La próxima vuelve el viernes", es.detail)
        assertEquals("Quick reads: 7 of 10 left this week. Next read back on Friday", en.spoken)
        assertEquals("7/10", en.face)
        assertEquals("the day the next read comes back, never \"resets\"", "+1 Fri", en.faceNote)
        assertEquals("Quick", en.label)
        assertEquals("Rápido", es.label)

        assertEquals("6 of 10 left this week", balance(CreditsSnapshot(access = free(used = 4, remaining = null), signedIn = true)).line(Kind.QUICK)?.value)
        assertEquals("Next read back today", balance(CreditsSnapshot(access = free(resetsAt = "2026-10-07T20:00:00Z"), signedIn = true)).line(Kind.QUICK)?.detail)
        assertEquals("La próxima vuelve hoy",
                     balance(CreditsSnapshot(access = free(resetsAt = "2026-10-07T20:00:00Z"), signedIn = true), spanish = true).line(Kind.QUICK)?.detail)
        assertEquals("a weekday a week away would read as today's", "Next read back October 14",
                     balance(CreditsSnapshot(access = free(resetsAt = "2026-10-14T11:00:00Z"), signedIn = true)).line(Kind.QUICK)?.detail)
        assertEquals("beyond the coming week the face names the date", "+1 Oct 14",
                     balance(CreditsSnapshot(access = free(resetsAt = "2026-10-14T11:00:00Z"), signedIn = true)).line(Kind.QUICK)?.faceNote)
        val untouched = balance(CreditsSnapshot(access = free(used = 0, remaining = 10, resetsAt = null), signedIn = true)).line(Kind.QUICK)
        assertNull(untouched?.detail)
        assertNull("the day shows only when the server gave one", untouched?.faceNote)
        val passed = balance(CreditsSnapshot(access = free(resetsAt = "2026-10-01T00:00:00Z"), signedIn = true)).line(Kind.QUICK)
        assertNull("a reset that already happened is not a date to wait for", passed?.detail)
        assertNull(passed?.faceNote)
    }

    @Test fun proAndAnAccountWithoutTheWeeklyCapReadUnlimited() {
        val open = CreditsSnapshot(access = free(paywall = false), signedIn = true)
        assertEquals("Unlimited", balance(open).line(Kind.QUICK)?.value)
        assertNull(balance(open).line(Kind.QUICK)?.detail)
        assertEquals("Ilimitadas", balance(open, spanish = true).line(Kind.QUICK)?.value)
        assertEquals("Unlimited reads", balance(open).summary)
        assertEquals("Lecturas ilimitadas", balance(open, spanish = true).summary)
        assertEquals("Unlimited", balance(open).line(Kind.QUICK)?.face)

        val paid = CreditsSnapshot(access = pro, subscription = play, signedIn = true)
        assertEquals("Unlimited", balance(paid).line(Kind.QUICK)?.value)
        assertEquals("With Bobby Pro, within fair use.", balance(paid).line(Kind.QUICK)?.detail)
        assertEquals("Con Bobby Pro, dentro del uso justo.", balance(paid, spanish = true).line(Kind.QUICK)?.detail)
        assertEquals("Unlimited · fair use", balance(paid).line(Kind.QUICK)?.face)
        assertEquals("Ilimitadas · uso justo", balance(paid, spanish = true).line(Kind.QUICK)?.face)
    }

    // Deep and Max

    @Test fun deepAndMaxShowWhatIsLeftInTheirOwnWindow() {
        val weekly = mapOf(
            CreditsLevel.PROFUNDO to meter("""{"used":1,"limit":3,"remaining":2,"windowDays":7,"resetsAt":"2026-10-11T09:00:00Z"}"""),
            CreditsLevel.MAXIMO to meter("""{"used":0,"limit":1,"windowDays":7}"""))
        val account = CreditsSnapshot(access = free(), meters = weekly, signedIn = true)
        val deep = balance(account).line(Kind.DEEP)!!
        assertEquals("Deep reads", deep.title)
        assertEquals("2 of 3 left this week", deep.value)
        assertEquals("Next read back on Sunday", deep.detail)
        assertEquals("2/3", deep.face)
        assertEquals("+1 Sun", deep.faceNote)
        val max = balance(account).line(Kind.MAX)!!
        assertEquals("Max reads", max.title)
        assertEquals("remaining falls back to limit − used", "1 of 1 left this week", max.value)
        assertNull(max.detail)
        assertEquals("Lecturas Profundas", balance(account, spanish = true).line(Kind.DEEP)?.title)
        assertEquals("Te quedan 2 de 3 esta semana", balance(account, spanish = true).line(Kind.DEEP)?.value)
        assertEquals("La próxima vuelve el domingo", balance(account, spanish = true).line(Kind.DEEP)?.detail)
        assertEquals("Lecturas Máximas", balance(account, spanish = true).line(Kind.MAX)?.title)

        val monthly = mapOf(
            CreditsLevel.PROFUNDO to meter("""{"used":12,"limit":60,"remaining":48,"windowDays":30,"resetsAt":"2026-10-25T09:00:00Z"}"""),
            CreditsLevel.MAXIMO to meter("""{"used":0,"limit":10,"remaining":10,"windowDays":30}"""))
        val paid = CreditsSnapshot(access = pro, meters = monthly, signedIn = true)
        assertEquals("48 of 60 left", balance(paid).line(Kind.DEEP)?.value)
        assertEquals("Every 30 days · next read back October 25", balance(paid).line(Kind.DEEP)?.detail)
        assertEquals("Every 30 days", balance(paid).line(Kind.MAX)?.detail)
        assertEquals("Te quedan 48 de 60", balance(paid, spanish = true).line(Kind.DEEP)?.value)
        assertEquals("Cada 30 días · la próxima vuelve el 25 de octubre", balance(paid, spanish = true).line(Kind.DEEP)?.detail)
        assertEquals("Cada 30 días", balance(paid, spanish = true).line(Kind.MAX)?.detail)
    }

    @Test fun aGuestWithoutMaxReadsIsToldWhereTheyAre() {
        val anon = ReadAccess("anon", 0, 3, 3, null, true)
        val meters = mapOf(
            CreditsLevel.PROFUNDO to meter("""{"used":0,"limit":1,"remaining":1,"windowDays":30}"""),
            CreditsLevel.MAXIMO to meter("""{"used":0,"limit":0,"remaining":0,"windowDays":30}"""))
        val guest = CreditsSnapshot(access = anon, meters = meters, signedIn = false)
        assertEquals("1 of 1 left", balance(guest).line(Kind.DEEP)?.value)
        assertEquals("never 0 of 0", "With your free account", balance(guest).line(Kind.MAX)?.value)
        assertEquals("Con tu cuenta gratis", balance(guest, spanish = true).line(Kind.MAX)?.value)
        val account = CreditsSnapshot(access = free(), meters = meters, signedIn = true)
        assertNull("an account whose plan has none simply has no line", balance(account).line(Kind.MAX))
    }

    // Unknown is not zero

    @Test fun whatTheServerDidNotSendIsLeftOut() {
        val nothing = balance(CreditsSnapshot(access = null, signedIn = true))
        assertTrue(nothing.lines.isEmpty())
        assertNull(nothing.summary)
        assertFalse(nothing.isKnown)
        assertEquals(0, nothing.giftTotal)
        assertFalse(nothing.manage)

        val noMeters = balance(CreditsSnapshot(access = free(), signedIn = true))
        assertEquals("Deep and Max were not loaded: no line, never 0", listOf(Kind.QUICK, Kind.PRO), noMeters.lines.map { it.kind })

        val limitless = meter("""{"used":2}""")
        val partial = balance(CreditsSnapshot(access = free(), meters = mapOf(CreditsLevel.PROFUNDO to limitless), signedIn = true))
        assertNull("a meter without its limit says nothing", partial.line(Kind.DEEP))

        val noLimit = ReadAccess("free", 2, null, null, null, true)
        val unknownQuick = balance(CreditsSnapshot(access = noLimit, signedIn = true))
        assertNull(unknownQuick.line(Kind.QUICK))
        assertNull(unknownQuick.summary)
        assertNull("no gift line for a balance of none", unknownQuick.line(Kind.GIFT_QUICK))
        assertNull("and no gifted row on the face", unknownQuick.giftFace)
    }

    @Test fun aBalanceTheServerLeftHalfSaidIsNotShownAsAFullAllowance() {
        // `limit` without `used` or `remaining`: the server's own shape sends `remaining: null`
        // whenever `used` is not a number. The phone does not work the balance out from a zero it made up.
        val half = ReadAccess.fromJson(JSONObject("""{"tier":"free","limit":20,"paywall":true}"""))!!
        assertNull(half.used)
        assertEquals(20, half.limit)
        val account = balance(CreditsSnapshot(access = half, signedIn = true))
        assertNull("no Quick line, never 20/20", account.line(Kind.QUICK))
        assertNull("and no number in the profile row", account.summary)
        assertEquals("Bobby Pro is still said: it does not depend on the meter", listOf(Kind.PRO), account.lines.map { it.kind })
        assertNull(CreditsBalance.readsLeft(null, 20, null))
        assertEquals("the server's own word comes first", 4, CreditsBalance.readsLeft(4, 20, 3))
        assertEquals("both numbers came from the server: the difference is theirs", 17, CreditsBalance.readsLeft(null, 20, 3))
        assertEquals("never below zero", 0, CreditsBalance.readsLeft(null, 20, 25))

        val guest = ReadAccess.fromJson(JSONObject("""{"tier":"anon","limit":6,"paywall":true}"""))!!
        assertNull(balance(CreditsSnapshot(access = guest, signedIn = false)).line(Kind.QUICK))

        // The same for Deep and Max.
        val meters = mapOf(CreditsLevel.PROFUNDO to meter("""{"limit":6,"windowDays":7}"""), CreditsLevel.MAXIMO to meter("""{"used":1,"limit":2,"windowDays":7}"""))
        assertNull(meters[CreditsLevel.PROFUNDO]?.used)
        val partial = balance(CreditsSnapshot(access = free(), meters = meters, signedIn = true))
        assertNull("a Deep meter without what was used says nothing, never 6/6", partial.line(Kind.DEEP))
        assertEquals("1/2", partial.line(Kind.MAX)?.face)
    }

    @Test fun aMeterIsCalledWeeklyOnlyWhenTheServerSaidItsWindowIsAWeek() {
        val unknownWindow = mapOf(CreditsLevel.PROFUNDO to meter("""{"used":10,"limit":60,"remaining":50,"resetsAt":"2026-10-25T09:00:00Z"}"""))
        val deep = balance(CreditsSnapshot(access = pro, meters = unknownWindow, signedIn = true)).line(Kind.DEEP)!!
        assertEquals("no window from the server, no \"this week\" from the phone", "50 of 60 left", deep.value)
        assertEquals("Next read back October 25", deep.detail)
        assertEquals("50/60", deep.face)
        assertEquals("Te quedan 50 de 60", balance(CreditsSnapshot(access = pro, meters = unknownWindow, signedIn = true), spanish = true).line(Kind.DEEP)?.value)
    }

    @Test fun theServersReplyIsReadLenientlyAndNeverCoerced() {
        assertNull("a tier this build does not know is no access at all", ReadAccess.fromJson(JSONObject("""{"tier":"gold","used":1,"limit":3}""")))
        assertNull(ReadAccess.fromJson(null))
        val access = ReadAccess.fromJson(JSONObject("""{"tier":"free","used":true,"limit":"10","remaining":null,"paywall":"yes","bonus":2.5,"resetsAt":""}"""))!!
        assertNull("a boolean is not a count, and an unknown count is not zero", access.used)
        assertNull("a text is not a count", access.limit)
        assertNull(access.remaining)
        assertFalse("only a literal true turns the weekly cap on", access.paywall)
        assertEquals("a fraction is not a balance", 0, access.bonus)
        assertNull("an empty date is no date", access.resetsAt)
        assertNull(access.resetsMillis)
        assertEquals(at("2026-10-09T12:00:00Z"), ReadAccess("free", 0, 10, 10, "2026-10-09T12:00:00.000Z", true).resetsMillis)
        assertNull("a date that is not a date is not a moment", ReadAccess("free", 0, 10, 10, "next friday", true).resetsMillis)

        assertNull(Referral.fromJson(JSONObject("""{"url":"https://bobbyprotocol.xyz/i/ABCD2345"}""")))
        assertNull(Referral.fromJson(JSONObject("""{"code":"ABCD2345","url":""}""")))
        val own = Referral.fromJson(JSONObject("""{"code":"ABCD2345","url":"https://bobbyprotocol.xyz/i/ABCD2345","accepted":2}"""))!!
        assertEquals(2, own.accepted)
        assertEquals(5, own.max)
        assertNull(own.rewardDays)
        assertEquals("https://bobbyprotocol.xyz/i/ABCD2345", own.shareUrl)
        assertNull("only Bobby's own site is shared", Referral("ABCD2345", "https://evil.example/i/ABCD2345", 0, 5, null, null, null).shareUrl)

        val body = JSONObject("""{"levels":{"tier":"free","levels":{"profundo":{"used":1,"limit":3,"bonus":2},"maximo":"soon"}},
            "payments":{"google":true,"revenuecat":true},"purchaseReservationVersion":1}""")
        assertEquals(setOf(CreditsLevel.PROFUNDO), CreditsWire.meters(body).keys)
        assertEquals(2, CreditsWire.meters(body)[CreditsLevel.PROFUNDO]?.bonus)
        assertTrue(CreditsWire.meters(null).isEmpty())
        assertTrue(CreditsWire.googleSalesReady(body))
        assertFalse("Google Play sales are closed unless the server says all of it", CreditsWire.googleSalesReady(JSONObject("""{"payments":{"apple":true,"revenuecat":true}}""")))
        assertFalse(CreditsWire.googleSalesReady(JSONObject("""{"payments":{"google":true,"revenuecat":true}}""")))
        assertFalse(CreditsWire.googleSalesReady(null))
    }

    // Gifted reads

    @Test fun giftedReadsShowPerLevelOnlyWhatExistsAndWhenTheyAreUsed() {
        val meters = mapOf(
            CreditsLevel.PROFUNDO to meter("""{"used":3,"limit":3,"remaining":0,"bonus":2,"windowDays":7}"""),
            CreditsLevel.MAXIMO to meter("""{"used":1,"limit":1,"remaining":0,"bonus":0,"windowDays":7}"""))
        val account = CreditsSnapshot(access = free(bonus = 3), meters = meters, signedIn = true)
        val en = balance(account)
        assertEquals(listOf(Kind.QUICK, Kind.DEEP, Kind.MAX, Kind.GIFT_QUICK, Kind.GIFT_DEEP, Kind.PRO), en.lines.map { it.kind })
        assertEquals("Gifted Quick reads", en.line(Kind.GIFT_QUICK)?.title)
        assertEquals("3", en.line(Kind.GIFT_QUICK)?.value)
        assertEquals("Used after your plan's reads run out.", en.line(Kind.GIFT_QUICK)?.detail)
        assertEquals("Gifted Deep reads", en.line(Kind.GIFT_DEEP)?.title)
        assertEquals("2", en.line(Kind.GIFT_DEEP)?.value)
        assertNull("a level with no gift has no line", en.line(Kind.GIFT_MAX))
        assertEquals(5, en.giftTotal)
        assertEquals("gifts never inflate the plan's count", "7 of 10 left this week", en.line(Kind.QUICK)?.value)
        assertEquals("7 of 10 reads · 5 gifted", en.summary)
        assertEquals("one row on the face, per level", "Quick 3 · Deep 2", en.giftFace)
        assertEquals("Gifted Quick reads: 3. Used after your plan's reads run out.. Gifted Deep reads: 2. Used after your plan's reads run out.", en.giftSpoken)
        val es = balance(account, spanish = true)
        assertEquals("Lecturas Rápidas de regalo", es.line(Kind.GIFT_QUICK)?.title)
        assertEquals("Se usan cuando se acaban las lecturas de tu plan.", es.line(Kind.GIFT_QUICK)?.detail)
        assertEquals("Lecturas Profundas de regalo", es.line(Kind.GIFT_DEEP)?.title)
        assertEquals("7 de 10 lecturas · 5 de regalo", es.summary)
        assertEquals("Rápido 3 · Profundo 2", es.giftFace)

        val one = balance(CreditsSnapshot(access = free(bonus = 1), signedIn = true))
        assertEquals("7 of 10 reads · 1 gifted", one.summary)
        assertNull("gifts are one row, omitted when confirmed empty", balance(CreditsSnapshot(access = free(), signedIn = true)).giftFace)
    }

    @Test fun aProAccountsGiftedQuickReadsAreKeptAndItsPremiumGiftsAreUsedAfterThePlan() {
        val access = ReadAccess("pro", 40, null, null, null, true, 20)
        val meters = mapOf(CreditsLevel.MAXIMO to meter("""{"used":10,"limit":10,"remaining":0,"bonus":1,"windowDays":30}"""))
        val paid = CreditsSnapshot(access = access, meters = meters, subscription = play, signedIn = true)
        assertEquals("Kept for when you are not on Bobby Pro.", balance(paid).line(Kind.GIFT_QUICK)?.detail)
        assertEquals("Se guardan para cuando no tengas Bobby Pro.", balance(paid, spanish = true).line(Kind.GIFT_QUICK)?.detail)
        assertEquals("Gifted Max reads", balance(paid).line(Kind.GIFT_MAX)?.title)
        assertEquals("Used after your plan's reads run out.", balance(paid).line(Kind.GIFT_MAX)?.detail)
        assertEquals("Bobby Pro active · 21 gifted", balance(paid).summary)
        assertEquals("Bobby Pro activo · 21 de regalo", balance(paid, spanish = true).summary)

        val open = CreditsSnapshot(access = free(paywall = false, bonus = 4), signedIn = true)
        assertEquals("Kept for when Quick reads have a weekly limit.", balance(open).line(Kind.GIFT_QUICK)?.detail)
    }

    // Bobby Pro

    @Test fun bobbyProSaysWhereItComesFromAndWhenItChanges() {
        val account = CreditsSnapshot(access = free(), signedIn = true)
        assertEquals("Not active", balance(account).line(Kind.PRO)?.value)
        assertEquals("No activo", balance(account, spanish = true).line(Kind.PRO)?.value)
        assertEquals("Not active", balance(account).line(Kind.PRO)?.face)
        assertFalse(balance(account).pro.isPro)
        assertTrue("no plan: Bobby Pro is offered", balance(account).pro.offersPro)

        val store = balance(CreditsSnapshot(access = pro, subscription = play, signedIn = true))
        assertEquals(Plan.GOOGLE_PLAY, store.pro.plan)
        assertEquals("Active · renews October 27", store.line(Kind.PRO)?.value)
        assertNull(store.line(Kind.PRO)?.detail)
        assertEquals("Active", store.line(Kind.PRO)?.face)
        assertEquals("the renewal date keeps its own glyph", "↻ Oct 27", store.line(Kind.PRO)?.faceNote)
        assertTrue("a Google Play plan is managed from the phone", store.manage)
        assertTrue(store.pro.pays)
        assertFalse(store.pro.offersPro)
        assertEquals("Bobby Pro active", store.summary)
        assertEquals("Activo · se renueva el 27 de octubre", balance(CreditsSnapshot(access = pro, subscription = play, signedIn = true), spanish = true).line(Kind.PRO)?.value)
        val unnamed = balance(CreditsSnapshot(access = pro, subscription = Subscription(null, "trialing", "2026-10-27T12:00:00Z"), signedIn = true))
        assertEquals("a plan whose store the server did not name is this phone's store's", Plan.GOOGLE_PLAY, unnamed.pro.plan)

        val card = balance(CreditsSnapshot(access = pro, subscription = Subscription("stripe", "active", null), signedIn = true))
        assertEquals(Plan.CARD, card.pro.plan)
        assertEquals("Active", card.line(Kind.PRO)?.value)
        assertEquals("Managed on the web.", card.line(Kind.PRO)?.detail)
        assertFalse(card.manage)
        assertTrue(card.pro.pays)
        assertFalse(card.pro.offersPro)
        val cardEs = balance(CreditsSnapshot(access = pro, subscription = Subscription("stripe", "active", null), signedIn = true), spanish = true)
        assertEquals("Activo", cardEs.line(Kind.PRO)?.value)
        assertEquals("Se administra en la web.", cardEs.line(Kind.PRO)?.detail)

        val ending = balance(CreditsSnapshot(access = pro, subscription = Subscription("google", "canceled", "2026-10-27T12:00:00Z"), signedIn = true))
        assertEquals("Active · ends October 27", ending.line(Kind.PRO)?.value)
        assertEquals("Active until Oct 27", ending.line(Kind.PRO)?.face)
        assertNull(ending.line(Kind.PRO)?.faceNote)
        assertEquals("Bobby Pro until Oct 27", ending.summary)

        val bare = balance(CreditsSnapshot(access = pro, signedIn = true))
        assertEquals("the server says Pro and the reason did not reach the app", Plan.ACTIVE, bare.pro.plan)
        assertEquals("Active", bare.line(Kind.PRO)?.value)
        assertFalse(bare.pro.pays)
        assertFalse("a Pro account is not offered Bobby Pro while its subscription has not been read", bare.pro.offersPro)
        assertFalse("and Manage waits for the word that it is a store's plan", bare.manage)
    }

    /** Android only: a plan paid on an iPhone is neither this phone's store's nor a card plan on the web. */
    @Test fun aPlanBoughtOnAnIPhoneIsNotCalledAWebPlanAndIsManagedInItsOwnStore() {
        val apple = balance(CreditsSnapshot(access = pro, subscription = Subscription("apple", "active", "2026-10-27T12:00:00Z"), signedIn = true))
        assertEquals(Plan.APP_STORE, apple.pro.plan)
        assertEquals("Active · renews October 27", apple.line(Kind.PRO)?.value)
        assertNull("never \"Managed on the web.\" for a plan Apple bills", apple.line(Kind.PRO)?.detail)
        assertTrue("its subscriptions page is the store's own", apple.manage)
        assertTrue(apple.pro.pays)
        assertFalse(apple.pro.offersPro)
    }

    @Test fun giftedProNamesItsSourceAndItsLastDay() {
        val invited = CreditsSnapshot(access = pro, referral = referral(proUntil = "2026-11-12T12:00:00Z", source = "referral"), signedIn = true)
        val en = balance(invited)
        assertEquals(Plan.GIFTED, en.pro.plan)
        assertEquals("Gifted until November 12", en.line(Kind.PRO)?.value)
        assertEquals("From your invitations.", en.line(Kind.PRO)?.detail)
        assertEquals("Gifted until Nov 12", en.line(Kind.PRO)?.face)
        assertFalse(en.manage)
        assertFalse(en.pro.pays)
        assertTrue("gifted days can still become a plan: the Bobby Pro offer stays", en.pro.offersPro)
        assertEquals("Bobby Pro until Nov 12", en.summary)
        val es = balance(invited, spanish = true)
        assertEquals("Regalado hasta el 12 de noviembre", es.line(Kind.PRO)?.value)
        assertEquals("Por tus invitaciones.", es.line(Kind.PRO)?.detail)
        assertTrue(es.summary ?: "", es.summary?.startsWith("Bobby Pro hasta el 12 nov") == true)
        assertTrue(es.line(Kind.PRO)?.face ?: "", es.line(Kind.PRO)?.face?.startsWith("De regalo hasta el 12 nov") == true)

        val fromBobby = balance(CreditsSnapshot(access = pro, referral = referral(proUntil = "2027-02-01T12:00:00Z", source = "admin"), signedIn = true))
        assertEquals("A gift from Bobby.", fromBobby.line(Kind.PRO)?.detail)
        assertTrue("a date in another year says its year", fromBobby.line(Kind.PRO)?.value?.contains("2027") == true)
        assertEquals("Un regalo de Bobby.",
                     balance(CreditsSnapshot(access = pro, referral = referral(proUntil = "2027-02-01T12:00:00Z", source = "admin"), signedIn = true), spanish = true).line(Kind.PRO)?.detail)

        val expired = Subscription("google", "expired", "2020-01-01T00:00:00Z")
        val afterPaid = balance(CreditsSnapshot(access = pro, referral = referral(proUntil = "2026-11-12T12:00:00Z", source = "admin"), subscription = expired, signedIn = true))
        assertEquals("an expired paid row cannot hide the live grant", Plan.GIFTED, afterPaid.pro.plan)

        val both = balance(CreditsSnapshot(access = pro, referral = referral(proUntil = "2026-11-30T12:00:00Z", source = "referral"), subscription = play, signedIn = true))
        assertEquals("a live paid period keeps its subscription controls", Plan.GOOGLE_PLAY, both.pro.plan)
        assertEquals("Active · renews October 27", both.line(Kind.PRO)?.value)
        assertEquals("gifted days waiting behind a paid period stay visible", "Your gifted days run until November 30.", both.line(Kind.PRO)?.detail)

        val lapsed = balance(CreditsSnapshot(access = pro, referral = referral(proUntil = "2026-10-01T00:00:00Z", source = "referral"), signedIn = true))
        assertEquals("a grant that already ended is not the reason", Plan.ACTIVE, lapsed.pro.plan)
        assertNull(lapsed.pro.giftUntil)
    }

    // Getting more

    @Test fun theInviteRowPromisesOnlyWhatTheServerAndTheBuildCanGive() {
        val closed = CreditsSnapshot(access = free(), referral = referral(), proPurchasable = false, signedIn = true)
        assertEquals("no Bobby Pro reward where Bobby Pro cannot be had", "Share Bobby with someone you know.", CreditsBalance.inviteDetail(closed, TwoWords()))
        val open = CreditsSnapshot(access = free(), referral = referral(rewardDays = 30, max = 5), proPurchasable = true, signedIn = true)
        assertEquals("You get 30 days of Bobby Pro for each friend who joins with your link, up to 5 friends.", CreditsBalance.inviteDetail(open, TwoWords()))
        assertEquals("Recibes 30 días de Bobby Pro por cada amigo que se una con tu link, hasta 5 amigos.", CreditsBalance.inviteDetail(open, TwoWords(spanish = true)))
        val plansOnly = CreditsSnapshot(access = free(), proPurchasable = true, signedIn = true, rewardDays = 14, maxFriends = 3)
        assertEquals("You get 14 days of Bobby Pro for each friend who joins with your link, up to 3 friends.", CreditsBalance.inviteDetail(plansOnly, TwoWords()))
        val daysOnly = CreditsSnapshot(access = free(), proPurchasable = true, signedIn = true, rewardDays = 30)
        assertEquals("30 days of Bobby Pro for each friend who joins", CreditsBalance.inviteDetail(daysOnly, TwoWords()))
        val unknown = CreditsSnapshot(access = free(), proPurchasable = true, signedIn = true)
        assertEquals("no invented number of days", "Bobby Pro for each friend who joins", CreditsBalance.inviteDetail(unknown, TwoWords()))
    }

    @Test fun theWeeklyPlanNumberComesOnlyFromTheServersPlans() {
        val plans = CreditsPlans()
        assertNull(plans.freeReadsPerWeek)
        plans.note(JSONObject("""{"plans":{"freeReadsPerWeek":10,"referral":{"rewardDays":14,"maxFriends":3}}}"""))
        assertEquals(10, plans.freeReadsPerWeek)
        assertEquals(14, plans.rewardDays)
        assertEquals(3, plans.maxFriends)
        plans.note(JSONObject("""{"access":{"tier":"free"}}"""))
        assertEquals("a reply without plans says nothing", 10, plans.freeReadsPerWeek)
        plans.note(null)
        assertEquals(10, plans.freeReadsPerWeek)
        plans.note(JSONObject("""{"plans":{"freeReadsPerWeek":null}}"""))
        assertNull("null means there is no weekly cap right now", plans.freeReadsPerWeek)
        assertEquals("the invite terms that reply did not repeat stay as they were said", 14, plans.rewardDays)
        plans.note(JSONObject("""{"plans":{"freeReadsPerWeek":10}}"""))
        plans.note(JSONObject("""{"plans":{"freeReadsPerWeek":true}}"""))
        assertNull("a boolean is not a count", plans.freeReadsPerWeek)
    }

    // Dates in the six languages the app speaks

    @Test fun aDateIsWrittenInTheOrderEachLanguageWritesIt() {
        val day = at("2026-10-27T12:00:00Z")
        val other = at("2027-02-01T12:00:00Z")
        fun dates(tag: String): CreditsCopy = CreditsCopy(TwoWords(), now, Locale.forLanguageTag(tag), ZoneOffset.UTC)
        assertEquals("October 27", dates("en-US").day(day))
        assertEquals("Oct 27", dates("en-US").short(day))
        assertEquals("February 1, 2027", dates("en-US").day(other))
        assertEquals("27 de octubre", dates("es-MX").day(day))
        assertEquals("1 de febrero de 2027", dates("es-MX").day(other))
        assertEquals("27 octobre", dates("fr-FR").day(day))
        assertEquals("27 ottobre", dates("it-IT").day(day))
        assertEquals("27. Oktober", dates("de-DE").day(day))
        assertEquals("27 de outubro", dates("pt-BR").day(day))
        for (tag in listOf("en-US", "es-MX", "fr-FR", "pt-PT", "it-IT", "de-DE")) {
            assertTrue(tag, dates(tag).short(day).contains("27"))
            assertTrue(tag, dates(tag).short(other).contains("2027"))
            assertTrue("the next read's day is short: $tag", (dates(tag).renewal(at("2026-10-09T12:00:00Z")) ?: "").startsWith("+1 "))
        }
        // The phone's own time zone decides which day it is.
        val tokyo = CreditsCopy(TwoWords(), now, Locale.US, java.time.ZoneId.of("Asia/Tokyo"))
        assertEquals("already tomorrow in Tokyo", "Next read back on Thursday", tokyo.resets(at("2026-10-07T16:00:00Z")))
        assertEquals("Next read back today", copy().resets(at("2026-10-07T16:00:00Z")))
    }

    // Six languages

    @Test fun everyCreditsLineHasFourTranslationsThatKeepTheirPlaceholders() {
        val said = listOf(
            "Credits", "Quick", "Deep", "Max", "Quick reads", "Deep reads", "Max reads", "Gifted Quick reads", "Gifted Deep reads", "Gifted Max reads",
            "Unlimited", "Unlimited · fair use", "With Bobby Pro, within fair use.", "{0} of {1} left this week", "{0} of {1} left",
            "Create your free account to get {0} every week", "Create your free account to keep reading", "Every {0} days",
            "Every {0} days · next read back {1}", "Next read back today", "Next read back on {0}", "Next read back {0}",
            "Used after your plan's reads run out.", "Kept for when you are not on Bobby Pro.", "Kept for when Quick reads have a weekly limit.",
            "Not active", "Active", "Active · renews {0}", "Active · ends {0}", "Active until {0}", "Gifted until {0}", "From your invitations.",
            "A gift from Bobby.", "Managed on the web.", "Your gifted days run until {0}.", "{0} of {1} reads", "Unlimited reads", "1 gifted", "{0} gifted",
            "Bobby Pro until {0}", "Bobby Pro active", "With your free account", "Gifted", "Free account: {0} Quick reads weekly.", "Balance unavailable.",
            "Invite", "Code", "Checking…", "1 credit = 1 read", "Share Bobby with someone you know.",
            "You get {0} days of Bobby Pro for each friend who joins with your link, up to {1} friends.",
            "{0} days of Bobby Pro for each friend who joins", "Bobby Pro for each friend who joins", "Restore purchases", "Manage subscription",
            "Try again", "Risk notice", "Details", "Continue with Google", "Continue with Apple",
            "Use this if you paid for Bobby Pro with your Google Play account on another phone or after reinstalling. Codes and gifts never need restoring.")
        for (key in said) {
            val translations = V18Catalog.row(key)
            assertEquals(key, V18Catalog.LANGUAGES.toSet(), translations.keys)
            for ((language, text) in translations) {
                assertEquals("$key [$language]", V18Catalog.placeholders(key), V18Catalog.placeholders(text))
                assertFalse("no exclamation marks: $key [$language]", text.contains("!"))
                assertFalse("Android never names an iPhone or its store here: $key [$language]", Regex("iPhone|App Store|Apple Account").containsMatchIn(text))
            }
        }
    }

    @Test fun theInviteLineSpeaksToThePersonInformallyInEveryLanguage() {
        // Bobby says tu, never vous. This row once came from the older catalog, where it was formal in
        // French and Portuguese; it is the line every Android account reads today under Credits › Details.
        val row = V18Catalog.row("Share Bobby with someone you know.")
        assertEquals("Partage Bobby avec une personne que tu connais.", row["fr"])
        assertEquals("Partilha o Bobby com alguém que conheces.", row["pt"])
        assertEquals("Condividi Bobby con qualcuno che conosci.", row["it"])
        assertEquals("Teile Bobby mit jemandem, den du kennst.", row["de"])
        assertFalse(Regex("\\b(vous|votre|vos)\\b", RegexOption.IGNORE_CASE).containsMatchIn(row["fr"] ?: "vous"))
    }
}
