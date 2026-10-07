package xyz.bobbyprotocol.android.v18.memory

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.MemoryReceipt
import xyz.bobbyprotocol.android.v18.MemoryReceipts
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeRead
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.theses.CatalogWords
import java.util.UUID

/**
 * Memory on the glass (ios/Bobby/Tests/Memory18NudgeTests.swift): the receipt is written from the
 * server's facts only (never from a count the app filled in) and fits the line in six languages;
 * the offer appears only to someone signed in, after a read, who has not answered the consent as
 * it reads today; nobody signed in hears nothing; a tap opens the right screen; ids are per
 * account, so one account's tap never silences another on the same phone; an offer closed without
 * an answer comes back once.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class Memory18NudgeTest {
    private val words = CatalogWords()
    private val line = MemoryReceiptLine(words)
    private val clock = 1_800_000_000_000L
    private val day = 86_400_000L

    private fun read(symbol: String = "NVDA", memory: MemoryReceipt? = null) = NudgeRead("r-$symbol", symbol, symbol, true, "wait", false, clock, memory)
    private fun moment(signedIn: Boolean = true, read: NudgeRead? = null) = NudgeMoment(signedIn, clock, read, if (read == null) 0 else 1)
    private fun state(user: String? = "a", captureOn: Boolean = false, decided: Boolean = false, offerOpens: Int = 0, offerOpenedAt: Long? = null,
                      erased: (Long, String) -> Boolean = { _, _ -> false }) =
        MemoryNudges.State(user, captureOn, decided, offerOpens, offerOpenedAt, erased = erased)
    private fun candidate(moment: NudgeMoment, state: MemoryNudges.State): NucleoNudge? = MemoryNudges.candidate(moment, state, words)
    private fun receipt(asks: Int, days: Int? = null, pct: Double? = null, recorded: Boolean = true) = MemoryReceipt(recorded, asks, days, pct)
    private fun wire(json: String): JSONObject = JSONObject(json)

    /** The account fragment the ids of "a" carry. */
    private val a: String get() = MemoryNudges.fragment("a")

    // The receipt's words

    @Test fun theReceiptIsWrittenFromTheFactsOnly() {
        fun said(receipt: MemoryReceipt, symbol: String = "NVDA"): String? = line.text(symbol, receipt)
        assertEquals("the server counted exactly one", "Saved: NVDA is now in memory", said(receipt(1)))
        assertNull("no count sent: the app does not write \"first time\" over a zero it filled in", said(receipt(0)))
        assertTrue(line.candidates("NVDA", receipt(0)).isEmpty())
        assertNull("nor anything else", said(receipt(0, 5, 4.2)))
        // The wire type refuses a recorded ask that came without its count: there is no receipt to word.
        assertNull(MemoryReceipts.fromJson(wire("""{"recorded":true}""")))
        assertNull(MemoryReceipts.fromJson(wire("""{"recorded":true,"asks":null}""")))
        assertEquals("NVDA: asked 5 days ago · up 4.2% since", said(receipt(3, 5, 4.2)))
        assertEquals("NVDA: asked 5 days ago · down 3.1% since", said(receipt(3, 5, -3.1)))
        assertEquals("NVDA: asked 1 day ago · up 4% since", said(receipt(2, 1, 4.0)))
        assertEquals("NVDA: asked 12 days ago · flat since", said(receipt(2, 12, 0.02)))
        assertEquals("no price move was sent, so none is claimed", "NVDA: asked less than a day ago", said(receipt(4, 0)))
        assertEquals("NVDA: asked 30 days ago", said(receipt(2, 30)))
        assertEquals("only the count is known", "NVDA: asked 3× so far", said(receipt(3)))
        assertEquals("a move without its date is not shown", "NVDA: asked 3× so far", said(receipt(3, null, 9.9)))
        assertNull(line.change(null))
        assertNull(line.change(Double.NaN))
        // A symbol too long for the verb and the move together keeps the move and drops the verb.
        assertEquals("ABCDEFGHIJKLMN: 5 days ago · up 4.2% since", said(receipt(3, 5, 4.2), "ABCDEFGHIJKLMN"))
    }

    /** The line says what happened ("asked", "preguntaste", "demandé"…) in every language, not only when. */
    @Test fun theReceiptKeepsItsVerbInEveryLanguageWhenItFits() {
        val verbs = mapOf("en" to "asked", "es" to "preguntaste", "fr" to "demandé", "pt" to "perguntaste", "it" to "chiesto", "de" to "gefragt")
        words.inEveryLanguage { language ->
            val verb = verbs.getValue(language)
            for (days in listOf(0, 1, 5, 30)) {
                val asked = line.whenAsked(days)
                assertTrue("$language: ${asked.asked}", asked.asked.contains(verb))
                assertFalse("$language: the short form is the fallback, ${asked.ago}", asked.ago.contains(verb))
                assertTrue(language, asked.ago.length < asked.asked.length)
                // With no price move the verb always fits for a symbol of up to eight characters.
                for (symbol in listOf("BTC", "NVDA", "PETR4.SA")) {
                    val text = line.text(symbol, receipt(2, days))
                    assertTrue("$language: $text", text?.contains(verb) == true)
                }
            }
            val moved = line.text("NVDA", receipt(2, 5, 4.2))
            assertTrue("$language: $moved", moved?.contains(verb) == true)
        }
        words.language = "de"
        assertEquals("Gespeichert: SAP.DE ist jetzt im Gedächtnis", line.text("SAP.DE", receipt(1)))
        assertEquals("SAP.DE: im Gedächtnis gespeichert", line.candidates("SAP.DE", receipt(1)).last())
    }

    @Test fun everyReceiptFitsTheGlassInSixLanguages() {
        val receipts = listOf(receipt(1), receipt(2, 0), receipt(2, 1), receipt(6, 5, 4.2), receipt(6, 5, -3.1), receipt(9, 90, 12.3), receipt(9, 90, -12.3),
                              receipt(9, 1, 0.0), receipt(9, 45, 0.04), receipt(9, 7, 250.0), receipt(3), receipt(120))
        // A crypto ticker, a US stock, regional listings from the catalogue, and the longest symbol the server accepts.
        val symbols = listOf("BTC", "NVDA", "BRK-B", "MC.PA", "PETR4.SA", "VALE3.SA", "ABCDEFGHIJKLMNOPQRST")
        words.inEveryLanguage { language ->
            for (symbol in symbols) {
                for (each in receipts) {
                    val text = line.text(symbol, each) ?: ""
                    assertTrue("$language: $text", text.length <= NucleoNudge.TEXT_LIMIT)
                    assertFalse(text.isEmpty())
                    assertFalse("$language: an unfilled placeholder in $text", text.contains("{"))
                    if (symbol.length <= 8) assertTrue("$language: $text names the asset", text.contains(symbol))
                }
            }
            // With a symbol of up to eight characters the price move is never dropped: where the verb
            // and the move do not fit together, the verb is what gives way.
            for (symbol in listOf("BTC", "NVDA", "PETR4.SA")) {
                for (pct in listOf(4.2, -3.1, 12.3, -12.3)) {
                    val moved = receipt(5, 90, pct)
                    val text = line.text(symbol, moved) ?: ""
                    val lines = line.candidates(symbol, moved)
                    assertTrue("$language $symbol $pct: $text", text == lines[0] || text == lines[1])
                    assertTrue("$language $symbol $pct: $text", text.contains(line.change(pct) ?: "?"))
                }
            }
            val offer = candidate(moment(read = read()), state())
            assertTrue(language, (offer?.text?.length ?: 99) <= NucleoNudge.TEXT_LIMIT)
            assertTrue(language, (offer?.cta?.length ?: 99) <= NucleoNudge.CTA_LIMIT)
            val kept = candidate(moment(read = read(memory = receipt(1))), state(captureOn = true, decided = true))
            assertTrue(language, (kept?.cta?.length ?: 99) <= NucleoNudge.CTA_LIMIT)
            assertFalse(kept?.cta.isNullOrEmpty())
        }
    }

    @Test fun thePercentageUsesTheLanguagesDecimalMark() {
        words.language = "de"
        assertEquals("4,2", line.percent(4.2))
        assertEquals("SAP.DE: vor 5 Tagen gefragt · seitdem −4,2 %", line.text("SAP.DE", receipt(2, 5, -4.25)))
        words.language = "fr"
        assertEquals("MC.PA : demandé il y a 5 jours · +4,2 % depuis", line.text("MC.PA", receipt(2, 5, 4.2)))
        words.language = "es"
        // Spanish follows the region (4.2 in Mexico, 4,2 in Spain): the mark is the locale's own.
        assertEquals("NVDA: preguntaste hace 5 días · subió ${line.percent(4.2)}%", line.text("NVDA", receipt(2, 5, 4.2)))
        assertTrue(listOf("4.2", "4,2").contains(line.percent(4.2)))
        words.language = "en"
        assertEquals("12", line.percent(12.0))
        assertEquals("no grouping mark to misread", "1234.6", line.percent(1234.56))
    }

    // When it speaks

    @Test fun theOfferNeedsAnAccountAReadAndNoAnswerYet() {
        val offer = candidate(moment(read = read()), state())
        assertEquals(NucleoNudge("memory.offer.v1.$a", "I can pick this up next time", "How it works"), offer)
        assertNull("no read yet: nothing to pick up", candidate(moment(read = null), state()))
        assertNull("memory needs an account", candidate(moment(signedIn = false, read = read()), state(user = null)))
        assertNull("the session says signed out", candidate(moment(signedIn = false, read = read()), state()))
        assertNull("no account on the phone", candidate(moment(read = read()), state(user = null)))
        assertNull("answered already (yes or no): it does not nag", candidate(moment(read = read()), state(decided = true)))
        assertNull("memory is already on", candidate(moment(read = read()), state(captureOn = true)))
        // The server said memory applied but nothing was recorded (paused): no receipt, and the offer still stands.
        val paused = read(memory = receipt(3, 2, recorded = false))
        assertEquals("memory.offer.v1.$a", candidate(moment(read = paused), state())?.id)
        assertNull(candidate(moment(read = paused), state(captureOn = true, decided = true)))
    }

    /** A receipt speaks only for `recorded == true` AND `asks >= 1`. */
    @Test fun aReceiptWithoutACountFromTheServerSaysNothing() {
        for (each in listOf(receipt(0), receipt(0, 3, 2.0), receipt(1, recorded = false), receipt(0, recorded = false))) {
            assertNull("no receipt, and memory is on so there is nothing to offer either",
                       candidate(moment(read = read(memory = each)), state(captureOn = true, decided = true)))
            assertEquals("it falls through to the offer rules, never to a made-up \"Saved\"", "memory.offer.v1.$a",
                         candidate(moment(read = read(memory = each)), state())?.id)
        }
        assertEquals("Saved: NVDA is now in memory", candidate(moment(read = read(memory = receipt(1))), state(captureOn = true, decided = true))?.text)
        // Straight from the wire, as the server would send a reply without its count.
        val fromWire = MemoryReceipts.fromJson(wire("""{"recorded":true}"""))
        assertNull(candidate(moment(read = read(memory = fromWire)), state(captureOn = true, decided = true)))
    }

    @Test fun theReceiptComesFirstAndIsPerAsset() {
        val kept = read("PETR4.SA", receipt(3, 5, 4.2))
        val nudge = candidate(moment(read = kept), state(captureOn = true, decided = true))
        assertEquals(NucleoNudge("memory.kept.$a.petr4sa", "PETR4.SA: asked 5 days ago · up 4.2% since", "See memory"), nudge)
        assertTrue(NucleoNudge.ID_PATTERN.matches(nudge?.id ?: ""))
        assertEquals("memory.kept.$a.brkb", MemoryNudges.receiptId("BRK-B", "a"))
        assertEquals("memory.kept.$a.gspc", MemoryNudges.receiptId("^GSPC", "a"))
        assertNull("an id the page could not send back is never made", MemoryNudges.receiptId("^=", "a"))
        assertNull("signed out: not even a receipt", candidate(moment(signedIn = false, read = kept), state(user = null)))
        assertEquals("memory", MemoryNudges.route(nudge?.id ?: ""))
        assertEquals(V18Routes.MEMORY_CONSENT, MemoryNudges.route("memory.offer.v1.$a"))
        assertEquals(V18Routes.MEMORY_CONSENT, MemoryNudges.route("memory.offer.v1.$a.2"))
        assertTrue("the receipt's route is one native code may present", V18Routes.ALL.contains(MemoryNudges.MEMORY_ROUTE))
    }

    /**
     * Every id this source can produce matches the bridge pattern (lowercase, 48 at most), whatever
     * the account id looks like (Supabase ids are UUIDs).
     */
    @Test fun everyIdTheSourceCanProduceMatchesTheBridgePattern() {
        val users = listOf("a", UUID.randomUUID().toString().uppercase(), UUID.randomUUID().toString(), "Someone@Example.COM", "ÁÉÍ-ñ", "X".repeat(200))
        val symbols = listOf("BTC", "NVDA", "BRK-B", "9988.HK", "^GSPC", "PETR4.SA", "ABCDEFGHIJKLMNOPQRST")
        fun assertValid(id: String?, note: String) {
            if (id == null) fail("no id: $note")
            assertTrue("$id ($note)", NucleoNudge.ID_PATTERN.matches(id!!))
            assertEquals(note, id.lowercase(), id)
        }
        for (user in users) {
            val fragment = MemoryNudges.fragment(user)
            assertEquals(8, fragment.length)
            assertTrue(fragment, Regex("^[0-9a-f]{8}$").matches(fragment))
            assertFalse("a hash, never a piece of the id itself", user.length >= 8 && fragment == user.take(8).lowercase())
            assertValid(MemoryNudges.offerId(user, now = clock), "offer")
            assertValid(MemoryNudges.offerId(user, opens = 1, openedAtMillis = clock - MemoryNudges.REOFFER_AFTER_MILLIS, now = clock), "second offer")
            assertValid(MemoryNudges.offerId(user, version = 12, opens = 1, openedAtMillis = 0L, now = clock), "a later consent version")
            for (symbol in symbols) assertValid(MemoryNudges.receiptId(symbol, user), "receipt $symbol")
            // Through the candidate, as the centre would get them.
            assertValid(candidate(moment(read = read()), state(user = user))?.id, "candidate offer")
            for (symbol in symbols) {
                val kept = read(symbol, receipt(2, 1))
                assertValid(candidate(moment(read = kept), state(user = user, captureOn = true, decided = true))?.id, "candidate receipt $symbol")
            }
        }
        assertEquals("the longest symbol the server accepts keeps all its letters", "memory.kept.$a.abcdefghijklmnopqrst",
                     MemoryNudges.receiptId("ABCDEFGHIJKLMNOPQRST", "a"))
    }

    /** The account fragment keeps one account's taps from silencing another account on the same phone. */
    @Test fun oneAccountsTapNeverSilencesAnotherOnTheSamePhone() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("a")
        var phone = state(user = "a")
        MemoryNudges.register(bench.host, words, { phone }, { _, _ -> })
        val b = MemoryNudges.fragment("b")
        assertNotEquals(a, b)

        // A opens the offer, then a receipt.
        bench.deliver()
        assertEquals("memory.offer.v1.$a", bench.host.currentNudge()?.id)
        assertEquals("done", bench.host.nudgeAct("memory.offer.v1.$a").getString("status"))
        bench.closeSheet()
        phone = state(user = "a", captureOn = true, decided = true)
        bench.clock += 20 * 60_000L
        bench.deliver(memory = wire("""{"recorded":true,"asks":1}"""))
        assertEquals("memory.kept.$a.nvda", bench.host.currentNudge()?.id)
        assertEquals("done", bench.host.nudgeAct("memory.kept.$a.nvda").getString("status"))
        bench.closeSheet()
        assertTrue(bench.nudges.isRetired("memory.kept.$a.nvda"))

        // B signs in on the same phone: B is offered memory, and B's NVDA receipt speaks.
        bench.changeAccount("b")
        phone = state(user = "b")
        bench.clock += 20 * 60_000L
        bench.deliver()
        assertEquals("A's tap did not retire B's offer", "memory.offer.v1.$b", bench.host.currentNudge()?.id)
        phone = state(user = "b", captureOn = true, decided = true)
        bench.deliver(memory = wire("""{"recorded":true,"asks":1}"""))
        assertEquals("nor B's receipt for the same asset", "memory.kept.$b.nvda", bench.host.currentNudge()?.id)
        assertFalse(bench.nudges.isRetired("memory.kept.$b.nvda"))
    }

    /**
     * "How it works" then closing the sheet is not an answer. The offer comes back once after a
     * rest, under a second id (the centre retired the first on the tap), and never a third time.
     */
    @Test fun anOfferClosedWithoutAnAnswerComesBackOnceAfterARest() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("a")
        val store = bench.store
        val log = MemoryOfferLog(store)
        fun live() = MemoryNudges.liveState("a", store, { false })
        MemoryNudges.register(bench.host, words, { live() }, { user, at -> log.noteOpened(user, at) })
        bench.deliver()
        val first = "memory.offer.v1.$a"
        assertEquals(first, bench.host.currentNudge()?.id)
        assertNull("seeing the offer is not opening it", log.entry("a"))
        val openedAt = bench.clock
        assertEquals("done", bench.host.nudgeAct(first).getString("status"))
        assertEquals(V18Routes.MEMORY_CONSENT, bench.shell.opened.last())
        assertEquals(MemoryOfferLog.Entry(1, openedAt), log.entry("a"))
        assertNull("the log is this account's", log.entry("b"))
        bench.closeSheet()   // closed: no answer recorded
        assertFalse(MemoryConsent(store).hasDecided("a"))

        bench.clock += 6 * day
        bench.deliver()
        assertNull("it rests first", bench.host.currentNudge())
        bench.clock += day + 60_000L
        bench.deliver()
        val second = "$first.2"
        assertEquals("no answer was given, so it asks once more", second, bench.host.currentNudge()?.id)
        assertEquals("done", bench.host.nudgeAct(second).getString("status"))
        assertEquals(2, log.entry("a")?.opens)
        bench.closeSheet()
        bench.clock += 60 * day
        bench.deliver()
        assertNull("twice is enough: Memory › Turn on remains", bench.host.currentNudge())

        // An answer ends it at any point: a decline after the first open means no return.
        log.clear("a")
        log.noteOpened("a", bench.clock - 30 * day)
        val now = NudgeMoment(true, bench.clock, NudgeRead("r", "NVDA", "NVDA", true, "wait", false, bench.clock), 1)
        assertEquals(second, candidate(now, live())?.id)
        MemoryConsent(store).set(false, "a", bench.clock)
        assertNull(candidate(now, live()))
        // Pure rule.
        assertEquals(first, MemoryNudges.offerId("a", now = clock))
        assertNull(MemoryNudges.offerId("a", opens = 1, openedAtMillis = clock - MemoryNudges.REOFFER_AFTER_MILLIS + 1, now = clock))
        assertNull(MemoryNudges.offerId("a", opens = 1, openedAtMillis = null, now = clock))
        assertEquals(second, MemoryNudges.offerId("a", opens = 1, openedAtMillis = clock - MemoryNudges.REOFFER_AFTER_MILLIS, now = clock))
        assertNull(MemoryNudges.offerId("a", opens = 2, openedAtMillis = 0L, now = clock))
    }

    @Test fun aReceiptIsWithdrawnOnceThePersonErasedWhatItNames() {
        val kept = read(memory = receipt(1))
        val erased = state(captureOn = true, decided = true) { at, symbol -> at == clock && symbol == "NVDA" }
        assertNull("\"Saved: NVDA is now in memory\" would no longer be true", candidate(moment(read = kept), erased))
        assertNotNull(candidate(moment(read = kept), state(captureOn = true, decided = true)))
    }

    // Through the centre and the host

    @Test fun theRegisteredSourceFollowsTheEtiquetteAndOpensItsScreens() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("a")
        var phone = state()
        val opened = ArrayList<Pair<String, Long>>()
        MemoryNudges.register(bench.host, words, { phone }, { user, at -> opened.add(user to at) })
        assertEquals(listOf("memory"), bench.nudges.sourceKeys)
        assertNull("before any read it is silent", bench.host.currentNudge())
        bench.deliver()
        assertNull(bench.nudges.current(bench.nudges.moment(false)))
        val offer = "memory.offer.v1.$a"
        assertEquals(offer, bench.host.currentNudge()?.id)

        val tappedAt = bench.clock
        assertEquals("done", bench.host.nudgeAct(offer).getString("status"))
        assertEquals("\"How it works\" opens the consent, which turns nothing on by itself", V18Routes.MEMORY_CONSENT, bench.shell.opened.last())
        assertTrue(bench.nudges.isRetired(offer))
        assertEquals("the open is noted for the account it was offered to", listOf("a" to tappedAt), opened)
        bench.closeSheet()

        // The person said yes. A reply that says "recorded" without a count is not a receipt.
        phone = state(captureOn = true, decided = true)
        bench.clock += 20 * 60_000L
        bench.deliver(symbol = "SOL", memory = wire("""{"recorded":true,"asks":0}"""))
        assertNull("a zero the app filled in says nothing on the glass", bench.host.currentNudge())
        bench.deliver(symbol = "SOL", memory = wire("""{"recorded":true,"asks":null}"""))
        assertNull(bench.host.currentNudge())
        assertEquals(0, bench.nudges.showings("memory.kept.$a.sol"))

        // The next read comes back with a real receipt.
        bench.deliver(symbol = "BTC", memory = wire("""{"recorded":true,"asks":1}"""))
        val kept = bench.host.currentNudge()
        assertEquals("memory.kept.$a.btc", kept?.id)
        assertEquals("Saved: BTC is now in memory", kept?.text)
        assertEquals("done", bench.host.nudgeAct("memory.kept.$a.btc").getString("status"))
        assertEquals("\"See memory\" opens what is kept", "memory", bench.shell.opened.last())
        assertEquals("a receipt is not an offer", 1, opened.size)
        bench.closeSheet()
        bench.clock += 20 * 60_000L
        assertNull("a receipt that was opened does not repeat for that asset", bench.host.currentNudge())
        bench.deliver(symbol = "ETH", memory = wire("""{"recorded":true,"asks":2,"lastAskedDaysAgo":3}"""))
        assertEquals("another asset has its own", "memory.kept.$a.eth", bench.host.currentNudge()?.id)
    }

    @Test fun whatTheAppRegistersSpeaksOnlyAfterAReadAndNeverTouchesTheNetwork() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("a")
        // The bench has no network: registering and asking for a candidate must work without one.
        MemoryNudges.register(bench.host)
        assertEquals(listOf("memory"), bench.nudges.sourceKeys)
        assertNull(bench.host.currentNudge())
        bench.deliver()
        assertEquals("memory.offer.v1.$a", bench.host.currentNudge()?.id)
        MemoryConsent(bench.store).set(false, "a", bench.clock)
        assertNull("a decline is read from the phone at every candidate", bench.host.currentNudge())
        bench.changeAccount(null)
        bench.deliver()
        assertNull("nobody signed in: nothing", bench.host.currentNudge())
    }

    // What the phone stored

    /** The live state for a signed-in account, from what this phone stored for that account only. */
    @Test fun theLiveStateReadsTheSwitchAndTheConsentOfThatAccount() = runTest {
        val bench = V18TestBench(backgroundScope)
        val store = bench.store
        val gateway = FakeMemoryGateway { bench.desk.owner }
        gateway.reply = { _, _, _ -> FakeMemoryGateway.ok() }
        fun live(user: String?, version: Int = MemoryConsent.CURRENT_VERSION) =
            MemoryNudges.liveState(user, store, { user != null && gateway.stored(user) }, version)
        fun offered(user: String?, version: Int = MemoryConsent.CURRENT_VERSION): String? = candidate(moment(read = read()), live(user, version))?.id
        // Nothing stored: undecided, capture off, so the offer shows.
        var s = live("a")
        assertEquals("a", s.user)
        assertFalse(s.captureOn)
        assertFalse(s.decided)
        assertEquals(0, s.offerOpens)
        assertEquals("memory.offer.v1.$a", offered("a"))

        // A decline record: decided, so no offer.
        MemoryConsent(store).set(false, "a", clock)
        s = live("a")
        assertTrue(s.decided)
        assertFalse(s.captureOn)
        assertNull("a decline is remembered", offered("a"))
        // Another account's records are not this account's: B is still offered.
        assertFalse(live("b").decided)
        assertEquals("memory.offer.v1." + MemoryNudges.fragment("b"), offered("b"))

        // "Remember" through the real model: the stored switch and an accepted record → capture on, no offer.
        bench.changeAccount("a")
        assertTrue(MemoryConsentModel(MemoryCenter(bench.host, gateway)).remember())
        s = live("a")
        assertTrue("the stored opt-in is read", s.captureOn)
        assertTrue(s.decided)
        assertNull("memory is on: nothing to offer", offered("a"))
        assertFalse("A's switch is not B's", live("b").captureOn)
        assertEquals("memory.offer.v1." + MemoryNudges.fragment("b"), offered("b"))

        // The switch without its record (the 1.1.4 switch) is not capture: the account is asked.
        MemoryConsent(store).clear("a")
        assertTrue(gateway.stored("a"))
        s = live("a")
        assertFalse("a switch nobody consented to under this text does not count", s.captureOn)
        assertFalse(s.decided)
        assertEquals("memory.offer.v1.$a", offered("a"))

        // A reworded consent (version 2): a yes to version 1 is neither capture nor a decision, and the offer has its own id.
        MemoryConsent(store).set(true, "a", clock)
        assertTrue(live("a").captureOn)
        s = live("a", 2)
        assertFalse(s.captureOn)
        assertFalse(s.decided)
        assertEquals("everyone is asked again, including those who said yes", "memory.offer.v2.$a", offered("a", 2))

        // The offer log is read too, per account and per version.
        MemoryOfferLog(store).noteOpened("b", clock)
        assertEquals(1, live("b").offerOpens)
        assertEquals(clock, live("b").offerOpenedAtMillis)
        assertEquals(0, live("a").offerOpens)
        assertEquals(0, live("b", 2).offerOpens)
        assertNull("opened a moment ago: resting", offered("b"))

        // Nobody signed in: silent, whatever is stored.
        assertNull(live(null).user)
        assertNull(offered(null))
        assertNull(candidate(moment(read = read(memory = receipt(1))), live(null)))
        assertEquals(60, NudgePriority.MEMORY)
        assertEquals("memory", MemoryNudges.KEY)
        // The offer log lives under the account's hash, per version.
        assertEquals(MemoryOfferLog.KEY_PREFIX + "v1." + MemoryConsent.digest("b"), MemoryOfferLog.key("b", 1))
        assertNull(MemoryOfferLog(MemoryKeyValueStore()).entry("b"))
    }
}
