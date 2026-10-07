package xyz.bobbyprotocol.android.v18.credits

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench

/**
 * Credits on the glass (1.8). The cases of ios/Bobby/Tests/CreditsNudgesTests.swift: when each line
 * speaks, what its id is (so it can come back next week but not after every spent read), that one
 * account's gifts are never written under another, and that the copy fits the page in six languages.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class CreditsNudgesTest {
    /** Wednesday 7 October 2026, noon UTC: ISO week 41. */
    private val now = at("2026-10-07T12:00:00Z")
    private val day = 86_400_000L
    private val english = TwoWords()
    private val spanish = TwoWords(spanish = true)

    private fun moment(signedIn: Boolean = true, time: Long = now): NudgeMoment = NudgeMoment(signedIn, time, null, 0)

    private fun free(remaining: Int?, used: Int = 0, resetsAt: String? = "2026-10-09T12:00:00Z", paywall: Boolean = true, bonus: Int = 0): ReadAccess =
        ReadAccess("free", used, 10, remaining, resetsAt, paywall, bonus)

    private fun valid(nudge: NucleoNudge?): Boolean = nudge != null && NucleoNudge.ID_PATTERN.matches(nudge.id)

    // Running low

    @Test fun aFreeAccountWithTwoOrFewerReadsLeftIsToldOncePerWeek() {
        val two = CreditsNudges.low(moment(), free(remaining = 2), english)!!
        assertEquals("the id is this calendar week", "credits.low.2026-w41", two.id)
        assertEquals("2 reads left this week", two.text)
        assertEquals("See credits", two.cta)
        assertTrue(valid(two))
        assertEquals("Te quedan 2 lecturas esta semana", CreditsNudges.low(moment(), free(remaining = 2), spanish)?.text)
        assertEquals("Ver créditos", CreditsNudges.low(moment(), free(remaining = 2), spanish)?.cta)

        val one = CreditsNudges.low(moment(), free(remaining = 1), english)!!
        assertEquals("1 read left this week", one.text)
        assertEquals("the same week is the same nudge", two.id, one.id)
        assertEquals("Te queda 1 lectura esta semana", CreditsNudges.low(moment(), free(remaining = 1), spanish)?.text)

        val none = CreditsNudges.low(moment(), free(remaining = 0), english)!!
        assertEquals("No reads left this week", none.text)
        assertEquals("Sin lecturas esta semana", CreditsNudges.low(moment(), free(remaining = 0), spanish)?.text)

        val fallback = CreditsNudges.low(moment(), free(remaining = null, used = 9), english)!!
        assertEquals("remaining falls back to limit − used", "1 read left this week", fallback.text)

        val noReset = CreditsNudges.low(moment(), free(remaining = 2, resetsAt = null), english)!!
        assertEquals("without a reset moment the week still names it", two.id, noReset.id)
    }

    /**
     * The server's `resetsAt` is the oldest read in the last seven days plus seven days, so it
     * moves forward every time a read leaves the window. It must not make a new nudge each time.
     */
    @Test fun aResetMomentThatMovesDuringTheWeekIsStillTheSameNudge() {
        val monday = at("2026-10-05T09:00:00Z")
        val mondayLine = CreditsNudges.low(moment(time = monday), free(remaining = 1, resetsAt = "2026-10-06T08:00:00Z"), english)!!
        val tuesday = at("2026-10-06T09:00:00Z")
        val tuesdayLine = CreditsNudges.low(moment(time = tuesday), free(remaining = 2, resetsAt = "2026-10-07T08:00:00Z"), english)!!
        val sunday = at("2026-10-11T23:59:59Z")
        val sundayLine = CreditsNudges.low(moment(time = sunday), free(remaining = 0, resetsAt = "2026-10-13T08:00:00Z"), english)!!
        assertEquals("credits.low.2026-w41", mondayLine.id)
        assertEquals("one day later, another reset moment: the same nudge", mondayLine.id, tuesdayLine.id)
        assertEquals(mondayLine.id, sundayLine.id)

        // Retired on Monday, it stays retired on Tuesday.
        val center = NudgeCenter(MemoryKeyValueStore()) { monday }
        center.retire(mondayLine.id)
        assertFalse("a tap on Monday is not undone by Tuesday's reset moment", center.eligible(tuesdayLine.id, tuesday))

        val nextMonday = at("2026-10-12T00:00:00Z")
        val nextWeek = CreditsNudges.low(moment(time = nextMonday), free(remaining = 2, resetsAt = "2026-10-13T08:00:00Z"), english)!!
        assertEquals("another week is another nudge: it can come back", "credits.low.2026-w42", nextWeek.id)
        assertTrue(center.eligible(nextWeek.id, nextMonday))
    }

    @Test fun theWeekIsTheIsoWeekInUtcAndAlwaysAValidId() {
        assertEquals("2026-w41", CreditsNudges.week(now))
        assertEquals("the first days of January can belong to the old year's last week", "2026-w53", CreditsNudges.week(at("2027-01-01T12:00:00Z")))
        assertEquals("2027-w01", CreditsNudges.week(at("2027-01-04T00:00:00Z")))
        assertEquals("single digits are padded", "2026-w09", CreditsNudges.week(at("2026-03-01T23:59:59Z")))
        // Every week of three years, and every gifted total the server can send, is an id the page accepts.
        var start = at("2026-01-01T00:00:00Z")
        for (week in 0 until 160) {
            val id = CreditsNudges.LOW_PREFIX + CreditsNudges.week(start)
            assertTrue(id, NucleoNudge.ID_PATTERN.matches(id))
            start += 7 * day
        }
        for (total in listOf(1, 9, 10, 1300, 999_999_999)) {
            val ledger = CreditsGiftLedger().observe(total, "u1")
            assertTrue("$total", valid(CreditsNudges.gift(moment(), ledger, "u1", english)))
        }
    }

    @Test fun theLowLineStaysQuietWhenItWouldNotBeTrueOrUseful() {
        assertNull("three left is not low", CreditsNudges.low(moment(), free(remaining = 3), english))
        assertNull("signed out", CreditsNudges.low(moment(signedIn = false), free(remaining = 1), english))
        assertNull("no weekly cap, nothing runs out", CreditsNudges.low(moment(), free(remaining = 1, paywall = false), english))
        assertNull("gifted reads cover the next read", CreditsNudges.low(moment(), free(remaining = 0, bonus = 4), english))
        assertNull("nothing known", CreditsNudges.low(moment(), null, english))
        val pro = ReadAccess("pro", 40, null, null, null, true)
        assertNull(CreditsNudges.low(moment(), pro, english))
        val anon = ReadAccess("anon", 2, 3, 1, null, true)
        assertNull("a guest is asked to sign in by the page, not nudged about a week", CreditsNudges.low(moment(), anon, english))
        val noLimit = ReadAccess("free", 2, null, null, null, true)
        assertNull("an unknown limit is not zero left", CreditsNudges.low(moment(), noLimit, english))
    }

    /**
     * The app stayed in memory past the reset moment: at least one read is back on the server, and
     * the count this phone holds is from before. It is not repeated as if it were today's.
     */
    @Test fun numbersFromBeforeTheResetMomentAreNotRepeated() {
        val thursday = free(remaining = 0, used = 10, resetsAt = "2026-10-09T12:00:00Z")
        assertNotNull("still true a second before", CreditsNudges.low(moment(time = at("2026-10-09T11:59:59Z")), thursday, english))
        assertNull("the window moved on", CreditsNudges.low(moment(time = at("2026-10-09T12:00:00Z")), thursday, english))
        assertNull("and it stays quiet the day after", CreditsNudges.low(moment(time = at("2026-10-10T09:00:00Z")), thursday, english))
        assertNull(CreditsNudges.low(moment(), free(remaining = 2, resetsAt = "2026-10-01T00:00:00Z"), english))
    }

    // Gifted reads

    @Test fun aGiftIsAnnouncedWhenItArrivesAndNotAgainForEveryReadSpent() {
        var ledger = CreditsGiftLedger()
        assertNull(CreditsNudges.gift(moment(), ledger, "u1", english))
        ledger = ledger.observe(5, "u1")
        val arrived = CreditsNudges.gift(moment(), ledger, "u1", english)!!
        assertEquals("credits.gift.5", arrived.id)
        assertEquals("Bobby gave you 5 reads", arrived.text)
        assertEquals("See credits", arrived.cta)
        assertTrue(valid(arrived))
        assertEquals("Bobby te regaló 5 lecturas", CreditsNudges.gift(moment(), ledger, "u1", spanish)?.text)

        ledger = ledger.observe(4, "u1")
        val afterOne = CreditsNudges.gift(moment(), ledger, "u1", english)!!
        assertEquals("a spent read does not make a new nudge", "credits.gift.5", afterOne.id)
        assertEquals("the line says what was given, not what is left of it", "Bobby gave you 5 reads", afterOne.text)

        ledger = ledger.acknowledge()
        assertNull("shown on the Credits screen: nothing left to announce", CreditsNudges.gift(moment(), ledger, "u1", english))
        ledger = ledger.observe(4, "u1")
        ledger = ledger.observe(3, "u1")
        assertNull("spending is never news", CreditsNudges.gift(moment(), ledger, "u1", english))

        ledger = ledger.observe(13, "u1")
        val second = CreditsNudges.gift(moment(), ledger, "u1", english)!!
        assertEquals("a new gift is a new nudge", "credits.gift.13", second.id)
        assertEquals("ten arrived; the three the account already held were not given again", "Bobby gave you 10 reads", second.text)

        ledger = ledger.observe(0, "u1")
        assertNull("nothing left, nothing to say", CreditsNudges.gift(moment(), ledger, "u1", english))

        val single = CreditsGiftLedger().observe(1, "u1")
        assertEquals("Bobby gave you 1 read", CreditsNudges.gift(moment(), single, "u1", english)?.text)
        assertEquals("Bobby te regaló 1 lectura", CreditsNudges.gift(moment(), single, "u1", spanish)?.text)
    }

    @Test fun theLineSaysHowManyArrivedNotTheWholeBalance() {
        // Three gifted reads the person has already seen, then a code for five.
        var ledger = CreditsGiftLedger().observe(3, "u1").acknowledge().observe(8, "u1")
        val line = CreditsNudges.gift(moment(), ledger, "u1", english)!!
        assertEquals("Bobby gave you 5 reads", line.text)
        assertEquals("credits.gift.8", line.id)

        // Two gifts before the person looked: both are news, together.
        ledger = ledger.observe(10, "u1")
        val both = CreditsNudges.gift(moment(), ledger, "u1", english)!!
        assertEquals("Bobby gave you 7 reads", both.text)
        assertEquals("credits.gift.10", both.id)
    }

    @Test fun aReadTheServerHandsBackIsNotAGift() {
        var ledger = CreditsGiftLedger().observe(5, "u1").acknowledge()
        // A gifted read is spent, the read is refused, the server returns it.
        ledger = ledger.observe(4, "u1").observe(4, "u1").observe(5, "u1")
        assertNull("nothing new was given", CreditsNudges.gift(moment(), ledger, "u1", english))
        assertEquals(5, ledger.last)

        // The same while an earlier gift is still waiting to be shown: its number does not grow.
        val waiting = CreditsGiftLedger().observe(5, "u1").observe(4, "u1").observe(5, "u1")
        val line = CreditsNudges.gift(moment(), waiting, "u1", english)!!
        assertEquals("Bobby gave you 5 reads", line.text)
        assertEquals("credits.gift.5", line.id)

        // A rise of another size after a spent read is a gift.
        ledger = ledger.observe(4, "u1").observe(9, "u1")
        assertEquals("Bobby gave you 5 reads", CreditsNudges.gift(moment(), ledger, "u1", english)?.text)
    }

    @Test fun theGiftLineBelongsToOneAccount() {
        var ledger = CreditsGiftLedger().observe(5, "u1")
        assertNull("another account never hears about it", CreditsNudges.gift(moment(), ledger, "u2", english))
        assertNull(CreditsNudges.gift(moment(), ledger, null, english))
        assertNull("signed out", CreditsNudges.gift(moment(signedIn = false), ledger, "u1", english))

        ledger = ledger.acknowledge().observe(2, "u2")
        assertEquals("u2", ledger.owner)
        assertEquals("the first word about an account on this phone is news, whatever the previous account had", 2, ledger.announce)
        assertEquals(2, ledger.arrived)
        ledger = ledger.observe(0, "u3")
        assertEquals("an account with no gifts announces nothing", CreditsGiftLedger("u3", 0, null), ledger)
    }

    @Test fun theLedgerSurvivesARelaunchAndIsErasedWithItsAccount() {
        val store = MemoryKeyValueStore()
        val ledger = CreditsGiftLedger().observe(7, "u1").observe(6, "u1")
        ledger.save(store)
        assertEquals(ledger, CreditsGiftLedger.load(store))
        CreditsGiftLedger().save(store)
        assertNull("no owner, nothing kept", store.getString(CreditsGiftLedger.STORE_KEY))
        assertEquals(CreditsGiftLedger(), CreditsGiftLedger.load(store))

        // A ledger written before the arrival count existed still announces what it held.
        store.putString(CreditsGiftLedger.STORE_KEY, """{"owner":"u1","last":4,"announce":5}""")
        val older = CreditsGiftLedger.load(store)
        assertEquals(CreditsGiftLedger("u1", 4, 5, 5), older)
        assertEquals("Bobby gave you 5 reads", CreditsNudges.gift(moment(), older, "u1", english)?.text)

        // Whatever is not a ledger is no ledger.
        store.putString(CreditsGiftLedger.STORE_KEY, "not json")
        assertEquals(CreditsGiftLedger(), CreditsGiftLedger.load(store))
        store.putString(CreditsGiftLedger.STORE_KEY, """{"last":4,"announce":5}""")
        assertEquals("a count without the account it belongs to announces nothing", CreditsGiftLedger(), CreditsGiftLedger.load(store))
    }

    @Test fun theGiftedTotalAddsTheThreeLevels() {
        val access = ReadAccess("free", 0, 10, 10, null, true, 3)
        val meters = mapOf(CreditsLevel.PROFUNDO to LevelMeter(0, 3, null, 2, null, null), CreditsLevel.MAXIMO to LevelMeter(0, 1, null, 1, null, null))
        assertEquals(6, CreditsNudges.giftTotal(access, meters))
        assertEquals(0, CreditsNudges.giftTotal(null, emptyMap()))
    }

    // Whose gifts (the account fence)

    @Test fun theBookRecordsWhatTheAppHoldsUnderTheAccountThatIsSignedIn() {
        val store = MemoryKeyValueStore()
        val book = CreditsGiftBook(store)
        book.record(null, "a", 1)
        assertEquals("an app that has not read yet says nothing", CreditsGiftLedger(), book.ledger)

        val reading = GiftReading("a", 1, 6)
        book.record(reading, null, 1)
        assertEquals("nobody signed in, nothing kept", CreditsGiftLedger(), book.ledger)
        book.record(reading, "a", 1)
        assertEquals(CreditsGiftLedger("a", 6, 6, 6), book.ledger)
        assertEquals("kept for the next launch", book.ledger, CreditsGiftLedger.load(store))

        // The next launch reads it back and a spent read is not a new gift.
        val relaunched = CreditsGiftBook(store)
        assertEquals("nothing is read from the phone until the app starts the book", CreditsGiftLedger(), relaunched.ledger)
        relaunched.load()
        relaunched.record(GiftReading("a", 1, 5), "a", 1)
        assertEquals(6, relaunched.ledger.announce)
        assertEquals(5, relaunched.ledger.last)

        relaunched.acknowledge()
        assertNull("seen on the Credits screen, and remembered as seen", CreditsGiftLedger.load(store).announce)
    }

    @Test fun anotherAccountNeverInheritsThePreviousAccountsGiftedTotal() {
        val store = MemoryKeyValueStore()
        val book = CreditsGiftBook(store)
        val ofA = GiftReading("a", 1, 7)
        book.record(ofA, "a", 1)
        assertEquals("a", book.ledger.owner)
        assertEquals(7, book.ledger.last)

        // A signs out. What the app last read is still A's.
        book.accountChanged(null)
        assertEquals("nothing about A stays in memory", CreditsGiftLedger(), book.ledger)
        assertNull("or on the phone", store.getString(CreditsGiftLedger.STORE_KEY))
        book.record(ofA, null, 2)
        assertEquals(CreditsGiftLedger(), book.ledger)

        // B signs in on the same phone while the last reading is still A's seven gifted reads.
        book.accountChanged("b")
        book.record(ofA, "b", 3)
        book.record(ofA, "b", 3)
        assertEquals("A's total is never written under B", CreditsGiftLedger(), book.ledger)
        assertNull(store.getString(CreditsGiftLedger.STORE_KEY))
        assertNull("and B is not told Bobby gave it A's reads", CreditsNudges.gift(moment(), book.ledger, "b", english))
        // Nor a reading that carries B's name from an earlier moment of the session (a late reply).
        book.record(GiftReading("b", 2, 7), "b", 3)
        assertEquals(CreditsGiftLedger(), book.ledger)

        // The app reads B: an account with no gifts.
        book.record(GiftReading("b", 3, 0), "b", 3)
        assertEquals(CreditsGiftLedger("b", 0, null), book.ledger)
    }

    @Test fun theSameAccountSigningBackInKeepsWhatItWasAlreadyShown() {
        val store = MemoryKeyValueStore()
        val book = CreditsGiftBook(store)
        book.record(GiftReading("a", 1, 5), "a", 1)
        book.acknowledge()

        // The session is renewed for the same account: the ledger stays, the earlier reading waits.
        book.accountChanged("a")
        assertEquals(CreditsGiftLedger("a", 5, null), book.ledger)
        book.record(GiftReading("a", 1, 5), "a", 2)
        book.record(GiftReading("a", 2, 5), "a", 2)
        assertNull("the same five reads are not announced a second time", book.ledger.announce)

        // Deleting the account removes what the phone kept about its gifts, and only its own.
        book.forget("someone-else")
        assertEquals("a", book.ledger.owner)
        book.forget("a")
        assertEquals(CreditsGiftLedger(), book.ledger)
        assertNull(store.getString(CreditsGiftLedger.STORE_KEY))
    }

    @Test fun followingTheAppRecordsOnTheNextTurnAndNeverAcrossAnAccountChange() = runTest {
        val bench = newBench()
        bench.changeAccount("a")
        val backend = FakeCreditsBackend()
        val center = CreditsCenter.of(bench.host, backend)
        center.start()
        runCurrent()
        val epoch = bench.desk.accountEpoch
        backend.publish(FakeCreditsBackend.held("a", epoch, quick = 5, deep = 2))
        assertEquals("not while the reading is being applied", CreditsGiftLedger(), center.book.ledger)
        runCurrent()
        assertEquals(CreditsGiftLedger("a", 7, 7, 7), center.book.ledger)

        // A record is waiting (the app just published) when the account changes to B.
        backend.publish(FakeCreditsBackend.held("a", epoch, quick = 6, deep = 2))
        bench.changeAccount("b")
        runCurrent()
        assertEquals("the waiting record writes nothing of A's under B", CreditsGiftLedger(), center.book.ledger)

        // B's first reading: B's own gift is recorded.
        backend.publish(FakeCreditsBackend.held("b", bench.desk.accountEpoch, quick = 2))
        runCurrent()
        assertEquals(CreditsGiftLedger("b", 2, 2, 2), center.book.ledger)
    }

    // On the glass (the source the app registers)

    private class Registered(val bench: V18TestBench, val backend: FakeCreditsBackend, val center: CreditsCenter)

    private fun TestScope.newBench(): V18TestBench {
        val bench = V18TestBench(backgroundScope)
        bench.clock = now
        return bench
    }

    /** A free account with one Quick read left this week and five gifted Deep reads not shown yet. */
    private fun TestScope.registered(): Registered {
        val bench = newBench()
        bench.changeAccount("u1")
        val backend = FakeCreditsBackend()
        backend.held = FakeCreditsBackend.held("u1", bench.desk.accountEpoch, remaining = 1, deep = 5)
        val center = CreditsCenter.of(bench.host, backend)
        CreditsNudges.register(bench.host, center)
        bench.nudges.register(NudgeSource("theses", NudgePriority.THESES, { null }, { }))
        runCurrent()
        return Registered(bench, backend, center)
    }

    @Test fun theRegisteredSourceSpeaksLowFirstAndLetsTheGiftSpeakWhileItRests() = runTest {
        val set = registered()
        val glass = set.bench.nudges
        assertEquals("credits speaks after the theses", listOf("theses", CreditsNudges.KEY), glass.sourceKeys)
        assertNull("nothing for a signed-out reader", glass.current(glass.moment(false)))

        val low = glass.current(glass.moment(true))!!
        assertEquals("running low comes first", "credits.low.2026-w41", low.id)

        // Shown twice and not answered: it rests, and the gift is not kept waiting behind it.
        glass.seen(low.id)
        set.bench.clock += 700_000L
        glass.seen(low.id)
        assertTrue("the showing in progress is not pulled from under the reader", glass.eligible(low.id, set.bench.clock))
        set.bench.clock += glass.policy.showingGapMillis + 1
        assertFalse(glass.eligible(low.id, set.bench.clock))
        val gift = glass.current(glass.moment(true))!!
        assertEquals("credits.gift.5", gift.id)

        // The tap: the gift is acknowledged for good and the Credits screen opens.
        assertEquals("done", glass.act(gift.id))
        assertEquals(V18Routes.CREDITS, set.bench.shell.sheetRoute)
        assertTrue(glass.isRetired(gift.id))
        assertNull(set.center.book.ledger.announce)
        assertNull("and it stays acknowledged after a relaunch", CreditsGiftLedger.load(set.bench.store).announce)

        // Later, with the low line still resting and the gift acknowledged, the glass is quiet.
        set.bench.clock += 3_600_000L
        assertNull(glass.current(glass.moment(true)))
    }

    @Test fun aTapOnTheLowLineOpensCreditsRetiresItForTheWeekAndLeavesTheGiftToBeSaid() = runTest {
        val set = registered()
        val glass = set.bench.nudges
        val low = glass.current(glass.moment(true))!!
        assertTrue(low.id.startsWith(CreditsNudges.LOW_PREFIX))
        assertEquals("done", glass.act(low.id))
        assertEquals(V18Routes.CREDITS, set.bench.shell.sheetRoute)
        assertEquals("opening Credits from the low line is not the gift's tap", 5, set.center.book.ledger.announce)

        // The reset moment moves the next day; the retired line does not come back with it.
        set.bench.clock += day
        set.backend.held = FakeCreditsBackend.held("u1", set.bench.desk.accountEpoch, remaining = 2, deep = 5)
        val next = glass.current(glass.moment(true))!!
        assertEquals("the low line is retired for this week; the gift may speak", "credits.gift.5", next.id)

        // Another account on this phone hears neither.
        set.bench.closeSheet()
        set.bench.changeAccount("u2")
        runCurrent()
        assertNull(glass.current(glass.moment(true)))
        assertEquals("nothing about the previous account stays on the phone", CreditsGiftLedger(), CreditsGiftLedger.load(set.bench.store))
    }

    @Test fun registeringAddsTheSourceAndReadsNothingItDoesNotHave() = runTest {
        val bench = newBench()
        bench.changeAccount("u1")
        val backend = FakeCreditsBackend()
        CreditsNudges.register(bench.host, CreditsCenter.of(bench.host, backend))
        runCurrent()
        assertEquals(listOf(CreditsNudges.KEY), bench.nudges.sourceKeys)
        assertEquals("the server was asked once, after the notice", 1, backend.gets)
        // The request failed and nothing is held: with nothing known the source has nothing to say.
        assertNull(bench.nudges.current(bench.nudges.moment(true)))
        assertNull(bench.host.nudgeJson())
    }

    // The page's limits, in six languages

    @Test fun everyLineFitsThePageInSixLanguages() {
        // English key, Spanish text, the largest number the line can carry.
        val lines = listOf(
            Triple("{0} reads left this week", "Te quedan {0} lecturas esta semana", "2"),
            Triple("1 read left this week", "Te queda 1 lectura esta semana", ""),
            Triple("No reads left this week", "Sin lecturas esta semana", ""),
            // Gifts can reach four digits (an owner grant of 1000 reads plus 200 Deep and 100 Max).
            Triple("Bobby gave you {0} reads", "Bobby te regaló {0} lecturas", "1300"),
            Triple("Bobby gave you 1 read", "Bobby te regaló 1 lectura", ""))
        for ((key, es, sample) in lines) {
            val translations = V18Catalog.row(key)
            assertEquals(key, V18Catalog.LANGUAGES.toSet(), translations.keys)
            for (text in listOf(key, es) + translations.values) {
                val shown = text.replace("{0}", sample)
                assertTrue(shown, shown.length <= NucleoNudge.TEXT_LIMIT)
                assertFalse(shown, shown.contains("!"))
            }
        }
        val button = V18Catalog.row("See credits")
        assertEquals(V18Catalog.LANGUAGES.toSet(), button.keys)
        for (text in listOf("See credits", "Ver créditos") + button.values) assertTrue(text, text.length <= NucleoNudge.CTA_LIMIT)
        // The Spanish the code speaks is the Spanish measured above.
        assertEquals("Te quedan 2 lecturas esta semana", CreditsNudges.low(moment(), free(remaining = 2), spanish)?.text)
        assertEquals("Ver créditos", CreditsNudges.seeCredits(spanish))
    }

    @Test fun theFrenchAndGermanLinesSayWhatTheEnglishSays() {
        // "Plus d'analyses" reads as "more analyses": the opposite of none left.
        assertEquals("Plus aucune analyse cette semaine", V18Catalog.text("No reads left this week", "fr"))
        // "Bleiben erhalten, bis…" says the gifted reads are kept UNTIL the moment they become usable.
        for (key in listOf("Kept for when you are not on Bobby Pro.", "Kept for when Quick reads have a weekly limit.")) {
            val german = V18Catalog.text(key, "de") ?: ""
            assertFalse(german, german.contains(", bis "))
            assertTrue(german, german.startsWith("Aufgehoben für die Zeit, in der "))
        }
    }

    @Test fun theProfileRowsThatLeadHereAreInTheCatalogToo() {
        for (key in listOf("Credits", "What you have and how to get more", "My theses", "What you are looking at, and why", "Reminders", "Review reminders you set")) {
            assertEquals(key, V18Catalog.LANGUAGES.toSet(), V18Catalog.row(key).keys)
        }
        assertEquals("one entry point, lower than every other feature", 40, NudgePriority.CREDITS)
    }
}
