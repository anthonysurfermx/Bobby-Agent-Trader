package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgeRead
import xyz.bobbyprotocol.android.v18.ReadOrigin
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.credits.ReadAccess
import xyz.bobbyprotocol.android.v18.notify.LocalNotice
import xyz.bobbyprotocol.android.v18.notify.MemoryLocalNotifier
import xyz.bobbyprotocol.android.v18.notify.NoticeTiming
import java.io.File
import java.lang.reflect.Modifier
import java.time.ZonedDateTime

/**
 * The harness (1.8), what the person sees and what stays on the phone: what is written in each of
 * the three states, the number on the glass and when there is none, the lock screen, "Stop", the
 * wall Bobby never walks anyone into, the notes on the Memory screen, and a gate on every word.
 * The cases of ios/Bobby/Tests/HarnessSurfaceTests.swift; where iOS pins a notification category
 * or its delegate, these pin the notice the Android notifier is handed (see each note).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HarnessSurfaceTest {
    private val raw = OpenStore()
    private var clock = at(7, 16, 40)
    private val phone = HarnessPhone(MemoryLocalNotifier { clock })
    private var consent = RiskNotice.ACCEPTED
    private var user: String? = null
    private var epoch = 1L
    private var language = "en"
    private val prices = HashMap<String, Double>()
    private val quoted = ArrayList<String>()
    private var redraws = 0
    /** What the phone knows about the person's reads, and what the server would say if asked. */
    private var reads: ReadAccess? = free(5)
    private var serverSays: ReadAccess? = null
    private var asked = 0

    private val hour = 3_600_000L
    private val day = 86_400_000L

    /** October 2026, local time in Mexico City. The 7th is a Wednesday. */
    private fun at(day: Int, hour: Int, minute: Int = 0): Long = HarnessDays.at(day, hour, minute)

    private fun on(month: Int, day: Int, hour: Int, minute: Int = 0): Long =
        ZonedDateTime.of(2026, month, day, hour, minute, 0, 0, HarnessDays.mexico).toInstant().toEpochMilli()

    private fun free(left: Int, bonus: Int = 0, paywall: Boolean = true) = ReadAccess("free", 20 - left, 20, left, null, paywall, bonus)
    private fun guest(left: Int) = ReadAccess("anon", 6 - left, 6, left, null, true)
    private val pro = ReadAccess("pro", 40, null, null, null, false)
    /** What the server sends when it could not read the meter: a guest with no limit. */
    private val unread = ReadAccess("anon", 0, null, null, null, false)

    private fun receipt(access: ReadAccess): JSONObject = JSONObject().put("tier", access.tier).put("used", access.used ?: JSONObject.NULL)
        .put("limit", access.limit ?: JSONObject.NULL).put("remaining", access.remaining ?: JSONObject.NULL)
        .put("resetsAt", access.resetsAt ?: JSONObject.NULL).put("paywall", access.paywall).put("bonus", access.bonus)

    private fun make(load: Boolean = true): HarnessCenter {
        val center = HarnessCenter(phone, HarnessStore(raw), HarnessWords.copy { language })
        center.now = { clock }
        center.zone = { HarnessDays.mexico }
        center.consent = { consent }
        center.currentUser = { user }
        center.currentEpoch = { epoch }
        center.weeklyCovered = { false }
        center.language = { language }
        center.market = { symbol ->
            quoted.add(symbol)
            prices[symbol]?.let { HarnessQuote(it, null) }
        }
        center.access = { reads }
        center.refreshAccess = {
            asked += 1
            val answer = serverSays
            if (answer != null) reads = answer
        }
        center.changed = { redraws += 1 }
        // What the app wires: the history of the lines the glass drew, kept beside the ledger.
        center.forgetLines = { symbol, reader -> NudgeCenter.forget(listOf(HarnessNudges.movePrefix(symbol)), reader, raw) }
        center.linesKept = { reader -> NudgeCenter.count(HarnessNudges.movePrefix(), reader, raw) }
        center.pruneLines = { reader, before -> NudgeCenter.prune(HarnessNudges.movePrefix(), before, reader, raw) }
        if (load) center.load(user)
        return center
    }

    private fun ask(center: HarnessCenter, symbol: String, price: Double? = 100.0, equity: Boolean = true) {
        center.noteAsk(symbol, symbol, equity, price)
    }

    private fun events(center: HarnessCenter, kind: HarnessEvent.Kind): List<HarnessEvent> = center.ledger.events(kind)
    private fun pending(): Set<String> = phone.pendingIds()
    private fun notice(step: HarnessStep): LocalNotice? = phone.memory.notice(HarnessPlanner.IDENTIFIER_PREFIX + step.raw)
    private fun switchTo(next: String?) {
        user = next
        epoch += 1
    }

    private fun ledgerKey(owner: String? = user) = HarnessStore.key(HarnessStore.PREFIX, owner)
    private fun modeKey(owner: String? = user) = HarnessStore.key(HarnessStore.MODE_PREFIX, owner)
    private fun planKey(owner: String? = user) = HarnessStore.key(HarnessStore.PLAN_PREFIX, owner)

    /** The ledger as it sits in the phone's store: every event, with exactly the keys that were written. */
    private fun storedEvents(owner: String? = user): List<JSONObject> {
        val stored = raw.values[ledgerKey(owner)] ?: return emptyList()
        val array = JSONObject(stored).getJSONArray("events")
        return (0 until array.length()).map { array.getJSONObject(it) }
    }

    private fun keys(json: JSONObject): Set<String> = json.keys().asSequence().toSet()

    /** Every key the harness and the glass keep in the store. */
    private fun storedKeys(): List<String> = raw.values.keys.filter { it.startsWith("v18.harness.") || it.startsWith(NudgeCenter.STORE_PREFIX) }.sorted()

    /** The history the glass keeps of its lines, for the signed-out reader. */
    private fun lines(): NudgeCenter = NudgeCenter(raw) { clock }

    private fun inEveryLanguage(body: (String, HarnessCopy) -> Unit) {
        for (spoken in HarnessWords.languages) body(spoken, HarnessWords.copy(spoken))
    }

    private fun plain(text: String?): String? = text?.replace(' ', ' ')?.replace(' ', ' ')

    // C1: what the phone writes, state by state

    @Test fun undecidedThePhoneKeepsTheQuestionAndNothingElse() = runTest {
        val center = make()
        center.theses = { listOf(HarnessThesis("NVDA", HarnessHorizon.MONTH, at(1, 9))) }
        // Typed: their second question about a read, and it named the week.
        center.noteAsk("NVDA", "NVIDIA", true, 187.42, thread = true, horizon = HarnessHorizon.WEEK)
        clock = at(7, 16, 42)
        center.noteSaved("NVDA", 168)
        clock = at(7, 16, 43)
        center.notePicked("NVDA")
        // The question Bobby wrote after that read: a read Bobby started.
        clock = at(7, 16, 44)
        center.noteAsk("NVDA", "NVIDIA", true, 187.5, origin = HarnessEvent.Origin.FOLLOW_UP)
        // An asset picked on a chip, whose question named years: kept the way a question is.
        clock = at(7, 16, 50)
        center.noteAsk("BTC", "Bitcoin", false, 61_250.0, origin = HarnessEvent.Origin.FOLLOW_UP, chip = true, horizon = HarnessHorizon.LONG)
        clock = at(7, 17, 30)
        center.appActive()
        center.thesesChanged()

        val stored = storedEvents()
        assertEquals("one entry per read they asked for", listOf("NVDA", "BTC"), stored.map { it.getString("symbol") })
        for (event in stored) {
            assertEquals("ask", event.getString("kind"))
            assertEquals("the asset, its name, stock or crypto, its price, the moment: $event", setOf("kind", "at", "symbol", "name", "isEquity", "price"), keys(event))
        }
        assertEquals(at(7, 16, 40), stored[0].getLong("at"))
        assertEquals("NVIDIA", stored[0].getString("name"))
        assertEquals(true, stored[0].getBoolean("isEquity"))
        assertEquals(187.42, stored[0].getDouble("price"), 0.0)
        assertEquals(false, stored[1].getBoolean("isEquity"))
        val text = raw.values.getValue(ledgerKey())
        for (never in listOf("saved", "picked", "thesis", "appOpen", "sent", "opened", "returned", "origin", "thread", "horizon", "horizonHours", "step", "ref")) {
            assertFalse("undecided: no $never in $text", text.contains("\"$never\""))
        }
        assertEquals("no switch, no plan, nothing else of the harness", listOf(ledgerKey()), storedKeys())
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertTrue("nothing is handed to the phone", phone.written.isEmpty())
        assertEquals("and the system is never asked", 0, phone.memory.asked)
        assertEquals("what the Memory screen lists is what is stored, latest first", listOf("BTC", "NVDA"), center.notes.assets.map { it.symbol })
    }

    @Test fun undecidedTheGlassStillSaysHowItMovedAndThatWritesNothing() = runTest {
        val center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0)
        val before = HashMap(raw.values)
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        center.appActive()
        val move = center.moveOnGlass()
        assertNotNull(move)
        val line = HarnessNudges.nudge(move!!, center.copy, asks = center.readsOpen)
        assertEquals("NVDA +2.3% since you asked", line.text)
        assertEquals("What changed?", line.cta)
        assertEquals("one price read, and nothing of the ledger with it", listOf("NVDA"), quoted)
        assertEquals("the line reads the one thing kept and writes nothing", before, HashMap(raw.values))
    }

    @Test fun withFollowUpsOnThePhoneWritesWhatThePlannerReads() = runTest {
        val center = make()
        center.theses = { listOf(HarnessThesis("TSLA", HarnessHorizon.MONTH, at(1, 9))) }
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, horizon = HarnessHorizon.WEEK)
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        clock = at(7, 17, 0)
        center.noteAsk("NVDA", "NVIDIA", true, 100.5, thread = true)
        clock = at(7, 17, 1)
        center.noteSaved("NVDA", 72)
        clock = at(7, 17, 2)
        center.notePicked("NVDA")
        clock = at(7, 17, 3)
        center.noteAsk("NVDA", "NVIDIA", true, 100.6, origin = HarnessEvent.Origin.FOLLOW_UP)
        // The asset's follow-up is shown, tapped, and answered by a question about it.
        val due = center.upcoming.first { it.step == HarnessStep.ASSET }
        clock = due.fireAt + hour
        phone.memory.deliverDue()
        center.appActive()
        center.opened(HarnessTap(HarnessStep.ASSET, "NVDA", null, owner = "local", stamp = due.fireAt))
        clock += 5 * 60_000L
        center.noteAsk("NVDA", "NVIDIA", true, 101.0)

        val stored = storedEvents()
        fun of(kind: String) = stored.filter { it.getString("kind") == kind }
        assertEquals("every kind the planner reads", setOf("ask", "saved", "picked", "sent", "opened", "returned", "thesis"), stored.map { it.getString("kind") }.toSet())
        assertEquals("the horizon the question named, written by the yes", "week", of("ask").first().getString("horizon"))
        assertTrue("their own second question about a read", of("ask").any { it.optBoolean("thread") })
        assertTrue("who started a read", of("ask").any { it.optString("origin") == "followUp" })
        assertEquals("the review chosen on the save", 72, of("saved").single().getInt("horizonHours"))
        assertEquals("a pointer to the thesis, with its horizon and never its words", setOf("kind", "at", "symbol", "horizon"), keys(of("thesis").single()))
        assertEquals("TSLA", of("thesis").single().getString("symbol"))
        assertEquals("asset", of("sent").single().getString("step"))
        assertEquals(due.fireAt, of("sent").single().getLong("at"))
        assertEquals(due.fireAt, of("opened").single().getLong("ref"))
        assertEquals(due.fireAt, of("returned").single().getLong("ref"))
        assertEquals("the switch", "on", raw.values[modeKey()])
        assertTrue("and the plan", raw.values.containsKey(planKey()))
        assertTrue("two follow-ups at most", center.upcoming.size <= 2)
        val text = raw.values.getValue(ledgerKey())
        assertFalse("opening the app is never written", text.contains("appOpen"))
    }

    @Test fun offThePhoneWritesNothingAndWhatWasThereIsErased() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        // The glass drew a line about NVDA, and the offer was answered.
        val drawn = lines()
        drawn.retire("harness.move.nvda.20261007")
        drawn.retire(HarnessNudges.OFFER_ID)
        assertEquals(2, pending().size)
        clock = at(8, 17)
        phone.memory.deliverDue()
        assertEquals(1, phone.memory.delivered.size)

        center.turnOff()
        assertEquals(HarnessMode.OFF, center.mode)
        assertEquals("the no, and nothing about any asset", setOf(modeKey(), NudgeCenter.storeKey(null)), storedKeys().toSet())
        assertEquals("off", raw.values[modeKey()])
        assertFalse("the history of the lines goes too", raw.values.getValue(NudgeCenter.storeKey(null)).contains("nvda"))
        assertTrue("the answered offer names nothing and stays answered", drawn.isRetired(HarnessNudges.OFFER_ID))
        assertEquals("nothing is left for the phone to show", 0, pending().size)
        assertEquals("and what it showed is taken off the shade", 0, phone.memory.delivered.size)
        assertTrue(center.ledger.isEmpty)

        // Off means off: nothing a person does is written from here on.
        val before = HashMap(raw.values)
        clock = at(8, 18)
        center.noteAsk("TSLA", "Tesla", true, 300.0, horizon = HarnessHorizon.WEEK)
        center.noteSaved("TSLA", 72)
        center.notePicked("TSLA")
        center.noteAsk("BTC", "Bitcoin", false, 60_000.0, origin = HarnessEvent.Origin.FOLLOW_UP, chip = true)
        clock = at(9, 18)
        prices["TSLA"] = 310.0
        center.appActive()
        center.thesesChanged()
        assertEquals(before, HashMap(raw.values))
        assertNull("nothing to come back to, so no price is read", center.moveOnGlass())
        assertTrue(quoted.isEmpty())
        assertEquals("one quiet line on the Memory screen", "Follow-ups are off.", center.notes.quietLine(center.copy))
        assertTrue(center.notes.isEmpty)
    }

    // C2: the number can be wrong; then there is no number

    @Test fun aSplitARenamedTickerOrABadPriceShowsNoNumber() {
        fun stock(now: Double?, then: Double? = 100.0) = HarnessCopy.move(then, now, isEquity = true)
        fun crypto(now: Double?, then: Double? = 100.0) = HarnessCopy.move(then, now, isEquity = false)
        // A stock: more than 0.7 and less than 1.4 times the price at the question.
        assertEquals(2.3, stock(102.3) ?: 0.0, 0.001)
        assertEquals(-29.9, stock(70.1) ?: 0.0, 0.001)
        assertEquals(39.9, stock(139.9) ?: 0.0, 0.001)
        assertNull("the edge itself is outside", stock(70.0))
        assertNull(stock(140.0))
        assertNull("a 2-for-1 split", stock(50.0))
        assertNull("a reverse split", stock(1_000.0))
        assertNull("2-for-1 and +24%: a wider band printed -38%", stock(62.0))
        // Crypto: more than 0.2 and less than 5 times.
        assertEquals(399.0, crypto(499.0) ?: 0.0, 0.001)
        assertEquals(-79.0, crypto(21.0) ?: 0.0, 0.001)
        assertNull(crypto(20.0))
        assertNull(crypto(500.0))
        assertNull("a ticker that now names another coin", crypto(0.07))
        assertEquals("a small coin's wild week is said", 150.0, crypto(250.0) ?: 0.0, 0.001)
        assertNull("the same move is not one a stock makes", stock(250.0))
        // A price that is missing, zero, negative or not a number is no price.
        for (bad in listOf(null, 0.0, -5.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertNull("now = $bad", stock(bad))
            assertNull("then = $bad", stock(102.0, then = bad))
            assertNull(crypto(bad))
            assertNull(crypto(102.0, then = bad))
        }
        assertEquals("where it was is a number too", 0.0, stock(100.0) ?: 1.0, 0.0)
    }

    @Test fun aSplitTogetherWithAnyMoveThePhoneWouldPrintShowsNoNumber() {
        // The top of the stock band is twice its bottom: whatever the band would print for the real
        // move, the same move on top of a 2-for-1 split (or any larger one, either way) is outside it.
        var ratio = 0.701
        while (ratio < 1.399) {
            assertNotNull("$ratio is a move the phone prints", HarnessCopy.move(100.0, 100.0 * ratio, true))
            for (split in listOf(2.0, 3.0, 4.0, 10.0)) {
                assertNull("$ratio after a $split-for-1 split", HarnessCopy.move(100.0, 100.0 * ratio / split, true))
                assertNull("$ratio after a 1-for-$split split", HarnessCopy.move(100.0, 100.0 * ratio * split, true))
            }
            ratio += 0.001
        }
        assertEquals(HarnessCopy.STOCK_MOVE_BELOW, HarnessCopy.STOCK_MOVE_ABOVE * 2, 1e-12)
    }

    @Test fun outsideTheBoundTheGlassAndTheBoardSayNoNumber() = runTest {
        val center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0)
        clock = at(9, 17)
        prices["NVDA"] = 62.0
        center.appActive()
        val move = center.moveOnGlass()!!
        assertEquals(62.0, move.priceNow ?: 0.0, 0.0)
        assertNull("the phone read both prices and says no number", move.pct)
        assertEquals("the line without a number, never a corrected one", "NVDA, 2 days later", HarnessNudges.nudge(move, center.copy).text)
        // The week's board goes through the same gate.
        val board = HarnessBoard.make(null, center.ledger, clock, center.copy, HarnessDays.mexico)
        val row = board.rows.single()
        assertNull(board.change(row, 62.0, -38.0))
        assertEquals(10.0, board.change(row, 110.0, 0.0) ?: 0.0, 0.001)
        var shown: Double? = 1.0
        center.readBoard(board) { _, change -> shown = change }
        assertNull("the row shows no number", shown)
        // A sector reads the day's change as the market gives it.
        val sector = HarnessBoard.sector(HarnessSectors.all.first(), null, center.copy)
        assertEquals(-3.2, sector.change(sector.rows.first(), 62.0, -3.2) ?: 0.0, 0.0)
    }

    @Test fun theNumberIsSaidTheSameWayUpAndDown() {
        inEveryLanguage { spoken, copy ->
            val up = copy.moveLine("NVDA", 2.34, 1)
            val down = copy.moveLine("NVDA", -2.34, 1)
            // The same sentence around the number: only its sign differs.
            assertEquals(spoken, up.replace(copy.signed(2.34), "#"), down.replace(copy.signed(-2.34), "#"))
            for (line in listOf(up, down)) {
                for (mark in listOf("▲", "▼", "↑", "↓", "↗", "↘", "🟢", "🔴", "📈", "📉", "!")) assertFalse("$spoken: $line", line.contains(mark))
            }
            // The page draws a nudge as three strings: there is no field a colour could travel in.
            assertEquals(3, NucleoNudge("harness.move.nvda.20261007", up, copy.moveButton).toJson().length())
        }
    }

    // C3: the lock screen says where it came from and nothing else

    private val lockScreen = mapOf(
        "en" to listOf("NVDA: back to your question.", "Back to your question.", "Your week: NVDA and 2 more.", "Your week.", "Stop"),
        "es" to listOf("NVDA: de vuelta a tu pregunta.", "De vuelta a tu pregunta.", "Tu semana: NVDA y 2 más.", "Tu semana.", "Ya no"),
        "fr" to listOf("NVDA : on revient à ta question.", "On revient à ta question.", "Ta semaine : NVDA et 2 de plus.", "Ta semaine.", "Arrêter"),
        "pt" to listOf("NVDA: de volta à tua pergunta.", "De volta à tua pergunta.", "A tua semana: NVDA e mais 2.", "A tua semana.", "Parar"),
        "it" to listOf("NVDA: torniamo alla tua domanda.", "Torniamo alla tua domanda.", "La tua settimana: NVDA e altri 2.", "La tua settimana.", "Interrompi"),
        "de" to listOf("NVDA: zurück zu deiner Frage.", "Zurück zu deiner Frage.", "Deine Woche: NVDA und 2 weitere.", "Deine Woche.", "Stoppen"),
    )

    @Test fun theLockScreenSaysWhereItCameFromAndNothingElse() {
        val asset = HarnessFollowUp(HarnessStep.ASSET, at(8, 16, 40), symbol = "NVDA", days = 3)
        val week = HarnessFollowUp(HarnessStep.WEEK, at(12, 16, 40), symbol = "NVDA", others = 2)
        inEveryLanguage { spoken, copy ->
            val expected = lockScreen.getValue(spoken)
            assertEquals(spoken, expected, listOf(copy.body(asset), copy.publicBody(HarnessStep.ASSET), copy.body(week), copy.publicBody(HarnessStep.WEEK), copy.stopAction).map { plain(it) })
            // The asset and where it came from: no figure, no direction, no day count, no instruction.
            assertFalse("$spoken: ${copy.body(asset)}", copy.body(asset).any { it.isDigit() || it == '%' || it == '$' || it == '+' })
            assertEquals("$spoken: the only figure in a week is how many assets it holds", "2", copy.body(week).filter { it.isDigit() })
            for (step in HarnessStep.entries) {
                assertFalse("$spoken: the public version never names the asset", copy.publicBody(step).contains("NVDA"))
                assertFalse(copy.publicBody(step).any { it.isDigit() })
            }
        }
        assertEquals("Bobby", HarnessCopy.NOTIFICATION_TITLE)
    }

    /**
     * iOS files a follow-up under a category whose hidden-preview placeholder leaves the asset out.
     * On Android the notice the phone is handed carries a public version (what a locked phone that
     * hides sensitive content shows) and one button; platform/AndroidLocalNotifier.kt posts it as
     * `VISIBILITY_PRIVATE` with that public version (checked on an emulator: V18DeviceInstrumentedTest).
     */
    @Test fun aLockedPhoneThatHidesSensitiveContentNeverShowsTheAsset() = runTest {
        for (spoken in HarnessWords.languages) {
            language = spoken
            raw.values.clear()
            val center = make()
            clock = at(7, 16, 40)
            center.noteAsk("NVDA", "NVIDIA", true, 187.42)
            clock = at(7, 16, 41)
            center.noteAsk("BTC", "Bitcoin", false, 61_250.0)
            assertEquals(spoken, HarnessCenter.Outcome.ON, center.accept())
            val planned = phone.memory.scheduled
            assertEquals("$spoken: the asset, then the week", 2, planned.size)
            for (handed in planned) {
                val hidden = handed.publicBody
                assertNotNull("$spoken ${handed.id}: a public version", hidden)
                for (symbol in listOf("NVDA", "BTC", "NVIDIA", "Bitcoin")) assertFalse("$spoken: $hidden", hidden!!.contains(symbol))
                assertFalse("no price anywhere", (handed.body + hidden).contains("187") || (handed.body + hidden).contains("61"))
                assertEquals("Bobby", handed.title)
                assertEquals("$spoken: one button, Stop", LocalNotice.Action(HarnessCenter.STOP_ACTION, HarnessWords.copy(spoken).stopAction), handed.action)
                assertTrue("a notice the phone can keep and hand back", LocalNotice.valid(handed))
                // The delivery rule of the integration branch stands: 09:00 to 21:00, never more than a day late.
                assertEquals(LocalNotice.Delivery.FOLLOW_UP, handed.delivery)
                assertEquals(NoticeTiming.Decision.Drop, NoticeTiming.decide(handed, handed.fireAtEpochMs + 24 * hour + 1, HarnessDays.mexico))
            }
            assertTrue("$spoken: the body is where the asset is", planned.any { it.body.contains("BTC") })
            center.turnOff()
        }
        language = "en"
    }

    // C4: stopping is one tap

    private fun stopTap(planned: LocalNotice): HarnessTap = HarnessTap.from(planned.payload)!!

    /** iOS runs its notification action in the background; on Android the button is a broadcast, and this is what its receiver calls. */
    @Test fun stopOnTheNoticeTurnsFollowUpsOffTheWayTheSwitchDoes() = runTest {
        val center = make()
        ask(center, "NVDA")
        center.accept()
        lines().retire("harness.move.nvda.20261007")
        clock = at(8, 17)
        val shown = phone.memory.deliverDue().single()
        assertEquals("the one button the notice carries", HarnessCenter.STOP_ACTION, shown.action?.name)
        val asks = phone.memory.asked

        center.stop(stopTap(shown))
        assertEquals(HarnessMode.OFF, center.mode)
        assertEquals("off", raw.values[modeKey()])
        assertEquals("pending work cancelled", 0, pending().size)
        assertTrue("delivered notices cleared", phone.memory.delivered.isEmpty())
        assertTrue("ledger erased", center.ledger.isEmpty)
        assertEquals("nothing of the harness but the no", listOf(modeKey()), storedKeys())
        assertEquals("nothing is asked of the system", asks, phone.memory.asked)
        assertFalse(center.isOn)
        // The same as the switch: a centre that turns off the usual way ends in the same store.
        val afterStop = HashMap(raw.values)
        raw.values.clear()
        clock = at(7, 16, 40)
        val other = make()
        ask(other, "NVDA")
        other.accept()
        lines().retire("harness.move.nvda.20261007")
        clock = at(8, 17)
        phone.memory.deliverDue()
        other.turnOff()
        assertEquals(afterStop, HashMap(raw.values))
        // And it is never asked again by itself: only someone undecided is offered.
        val read = NudgeRead("r1", "NVDA", "NVIDIA", true, "wait", false, clock)
        assertNull(HarnessNudges.offer(NudgeMoment(false, clock, read, 1), other.mode, other.copy))
        assertNotNull(HarnessNudges.offer(NudgeMoment(false, clock, read, 1), HarnessMode.UNDECIDED, other.copy))
    }

    @Test fun stopWorksWhenThePhoneStartedTheAppForItAlone() = runTest {
        val first = make()
        ask(first, "NVDA")
        first.accept()
        clock = at(8, 17)
        val shown = phone.memory.deliverDue().single()
        // No activity: a centre built over what is on disk, with nothing loaded yet.
        user = null
        val alone = make(load = false)
        assertEquals("nothing loaded", HarnessMode.UNDECIDED, alone.mode)
        user = "someone"
        epoch += 1
        val wrong = make(load = false)
        wrong.stop(stopTap(shown))
        assertEquals("another reader's phone: nothing stops", "on", raw.values[modeKey(null)])
        assertEquals("the week is still to come", 1, pending().size)
        user = null
        alone.stop(stopTap(shown))
        assertEquals("off", raw.values[modeKey(null)])
        assertNull(raw.values[ledgerKey(null)])
        assertEquals(0, pending().size)
        assertTrue(phone.memory.delivered.isEmpty())
    }

    @Test fun onlyStopStopsAndOnlyForTheReaderItWasPlannedFor() = runTest {
        user = "u1"
        val center = make()
        ask(center, "NVDA")
        center.accept()
        val planned = notice(HarnessStep.ASSET)!!
        // A notice planned for another reader of this phone stops nothing.
        val theirs = HashMap(planned.payload)
        theirs[LocalNotice.OWNER] = "0123456789abcdef"
        center.stop(HarnessTap.from(theirs)!!)
        assertEquals(HarnessMode.ON, center.mode)
        // Nor does something that is not a notice this app planned.
        center.stop(HarnessTap(HarnessStep.ASSET, "NVDA", null))
        assertEquals(HarnessMode.ON, center.mode)
        assertEquals(2, pending().size)
        // A tap on the notice itself is not a stop.
        center.opened(stopTap(planned))
        assertEquals(HarnessMode.ON, center.mode)
        // Its own reader's Stop is.
        center.stop(stopTap(planned))
        assertEquals(HarnessMode.OFF, center.mode)
        assertEquals("off", raw.values[modeKey("u1")])
    }

    @Test fun aNoSurvivesASignInASignOutAndDeleteEverything() = runTest {
        // Signed out: asked, said yes, then Stop.
        val center = make()
        ask(center, "NVDA")
        center.accept()
        center.stop(stopTap(notice(HarnessStep.ASSET)!!))
        assertEquals(HarnessMode.OFF, center.mode)
        // The account they sign in to had notes of its own and had not decided.
        val theirs = HarnessLedger().also { it.note(HarnessEvent(HarnessEvent.Kind.ASK, at(5, 10), symbol = "TSLA", name = "Tesla", isEquity = true, price = 300.0)) }
        HarnessStore(raw).write(theirs, "u1")
        switchTo("u1")
        center.accountChanged()
        assertEquals("the no goes with them", HarnessMode.OFF, center.mode)
        assertEquals("off", raw.values[modeKey("u1")])
        assertTrue("and off keeps nothing", center.ledger.isEmpty)
        assertNull(raw.values[ledgerKey("u1")])
        assertEquals("it also stays on the phone", "off", raw.values[modeKey(null)])
        // Signed out again: still a no.
        switchTo(null)
        center.accountChanged()
        assertEquals(HarnessMode.OFF, center.mode)
        ask(center, "AMD")
        assertTrue(center.ledger.isEmpty)
        // The Memory screen's "Delete everything" erases the notes and the plan and keeps the no.
        center.erasedEverything(null)
        assertEquals(HarnessMode.OFF, center.mode)
        assertEquals("off", raw.values[modeKey(null)])
        switchTo("u1")
        center.accountChanged()
        center.erasedEverything("u1")
        assertEquals(HarnessMode.OFF, center.mode)
        assertEquals(listOf(modeKey(null), modeKey("u1")).sorted(), storedKeys())
        // A yes, on the other hand, goes with the notes: it is asked for again before anything is kept.
        raw.values.clear()
        switchTo(null)
        val again = make()
        ask(again, "NVDA")
        again.accept()
        again.erasedEverything(null)
        assertEquals(HarnessMode.UNDECIDED, again.mode)
        assertTrue(storedKeys().isEmpty())
        // Withdrawing the risk notice starts over: everything goes, the no included.
        again.turnOff()
        assertEquals("off", raw.values[modeKey(null)])
        consent = RiskNotice.WITHDRAWN
        again.consentChanged()
        assertEquals(HarnessMode.UNDECIDED, again.mode)
        assertTrue(storedKeys().isEmpty())
    }

    @Test fun anAccountThatSaidNoTakesNothingFromTheSignedOutReader() = runTest {
        HarnessStore(raw).write(HarnessMode.OFF, "u2")
        val center = make()
        ask(center, "NVDA")
        lines().retire("harness.move.nvda.20261007")
        switchTo("u2")
        center.accountChanged()
        assertEquals(HarnessMode.OFF, center.mode)
        assertTrue(center.ledger.isEmpty)
        assertEquals("what was asked signed out is dropped at sign-in, not merged, and no line names it", listOf(modeKey("u2")), storedKeys())
    }

    // C5: Bobby never invites someone into a wall

    @Test fun theNextReadIsKnownFromTheReceipt() {
        // Open: the phone KNOWS the next read is answered.
        assertTrue("Bobby Pro", HarnessWall.open(pro))
        assertTrue("reads left this week", HarnessWall.open(free(1)))
        assertTrue("a guest with reads left", HarnessWall.open(guest(2)))
        assertTrue("gifted reads", HarnessWall.open(free(0, bonus = 1)))
        assertTrue("nothing stands behind the limit", HarnessWall.open(free(0, paywall = false)))
        assertFalse("none left and the paywall behind it", HarnessWall.open(free(0)))
        assertFalse("none left and the sign-in behind it", HarnessWall.open(guest(0)))
        assertFalse("the server could not read the meter", HarnessWall.open(unread))
        assertFalse("not knowing is a no", HarnessWall.open(null))
        // Closed: the phone KNOWS the next read is refused. Not knowing is not closed.
        assertTrue(HarnessWall.closed(free(0)))
        assertTrue(HarnessWall.closed(guest(0)))
        assertFalse(HarnessWall.closed(free(0, bonus = 2)))
        assertFalse(HarnessWall.closed(free(0, paywall = false)))
        assertFalse(HarnessWall.closed(free(3)))
        assertFalse(HarnessWall.closed(pro))
        assertFalse("a first launch keeps its chips", HarnessWall.closed(null))
        assertFalse(HarnessWall.closed(unread))
        // Android keeps a count the server did not send as unknown, never as zero.
        val noCount = ReadAccess("free", null, 20, null, null, true)
        assertFalse(HarnessWall.open(noCount))
        assertFalse(HarnessWall.closed(noCount))
        assertTrue("used up, by the server's own count of what was used", HarnessWall.closed(ReadAccess("free", 20, 20, null, null, true)))
        assertTrue(HarnessWall.open(ReadAccess("free", 12, 20, null, null, true)))
        // A receipt whose reset moment has passed says nothing about the reads there are now.
        val spent = ReadAccess("free", 20, 20, 0, "2026-10-05T15:00:00Z", true)
        val now = at(7, 12)
        assertNull("it is skipped, and with none left the phone asks again", HarnessWall.current(listOf(spent), now))
        assertEquals("the next source is the one to go by", free(4), HarnessWall.current(listOf(spent, free(4)), now))
        assertEquals("newest first", free(2), HarnessWall.current(listOf(null, free(2), free(4)), now))
        val running = ReadAccess("free", 20, 20, 0, "2026-10-10T15:00:00Z", true)
        assertEquals(running, HarnessWall.current(listOf(running, free(4)), now))
    }

    @Test fun whenTheNextReadWouldBeRefusedTheLineStaysAndAsksNothing() = runTest {
        reads = free(0)
        val center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0)
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        center.appActive()
        val move = center.moveOnGlass()!!
        val line = HarnessNudges.nudge(move, center.copy, asks = center.readsOpen)
        assertEquals("the line costs nothing and stays", "NVDA +2.3% since you asked", line.text)
        assertEquals("its button asks nothing", "Got it", line.cta)
        assertEquals("the phone knew: the server was not asked", 0, asked)
        language = "es"
        assertEquals("Entendido", HarnessNudges.nudge(move, center.copy, asks = false).cta)
        language = "en"
        // A read comes back and the same line asks again.
        reads = free(3)
        assertEquals("What changed?", HarnessNudges.nudge(move, center.copy, asks = center.readsOpen).cta)
    }

    @Test fun notKnowingIsANoUntilThePhoneFindsOut() = runTest {
        reads = null
        serverSays = free(5)
        val center = make()
        center.noteAsk("NVDA", "NVIDIA", true, 100.0)
        clock = at(8, 17)
        prices["NVDA"] = 102.3
        val before = redraws
        center.appActive()
        assertEquals("it has a line to draw, so it asks the server, once", 1, asked)
        assertTrue(center.readsOpen)
        assertTrue("and the glass is told", redraws > before)
        assertEquals("What changed?", HarnessNudges.nudge(center.moveOnGlass()!!, center.copy, asks = center.readsOpen).cta)
        // Without a line to draw nothing is asked.
        clock = at(8, 17, 1)
        center.notePicked("NVDA")
        ask(center, "NVDA")
        reads = null
        center.appActive()
        assertEquals(1, asked)
        // The server cannot say: the line is still drawn, with the button that asks nothing.
        serverSays = null
        clock = at(9, 18)
        center.appActive()
        assertEquals(2, asked)
        assertEquals("Got it", HarnessNudges.nudge(center.moveOnGlass()!!, center.copy, asks = center.readsOpen).cta)
        // Nothing is asked before the risk notice.
        consent = RiskNotice.OUTDATED
        center.appActive()
        assertEquals(2, asked)
    }

    /**
     * No path a follow-up opens ends on a sign-in or a paywall sheet, through the second hop: the
     * line's button, a board row, and the row after the read Bobby started. On the real host, with
     * the receipts arriving the way the session hands them over (`offersOneTapAfterRead`, then the read).
     */
    @Test fun noFollowUpPathEndsOnASignInOrAPaywallSheet() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        center.market = { symbol -> HarnessQuote(if (symbol == "NVDA") 102.3 else 61_000.0, null) }
        runCurrent()

        /** A read is answered: the session asks the rule with the read's own receipt, then delivers it. True when its row may carry a question that asks by itself. */
        fun answered(id: String, symbol: String, access: ReadAccess, origin: ReadOrigin = ReadOrigin.PERSON): Boolean {
            val said = receipt(access)
            val offers = bench.host.offersOneTapAfterRead(said)
            val read = bench.read(requestId = id, symbol = symbol, name = symbol, isEquity = symbol == "NVDA", price = if (symbol == "NVDA") 100.0 else 60_000.0)
            bench.host.readDelivered(read.put("access", said), origin)
            return offers
        }

        assertTrue("before any receipt the home keeps its chips", bench.host.offersOneTapOnHome())
        assertTrue(answered("r1", "NVDA", free(2)))
        bench.clock += hour
        assertTrue(answered("r2", "BTC", free(1)))
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        bench.clock += 26 * hour
        bench.host.appBecameActive()
        runCurrent()

        // One read left: the line's button asks Bobby.
        var line = bench.host.nudgeJson()!!
        assertTrue(line.getString("id").startsWith("harness.move.btc."))
        assertEquals("What changed?", line.getString("cta"))
        assertEquals("done", bench.host.nudgeAct(line.getString("id")).getString("status"))
        assertEquals(1, bench.desk.events("ask.start").size)

        // The read Bobby started spends the last one. Second hop: its row hands back no question
        // that asks by itself, and the home loses its one-tap chips.
        bench.clock += 60_000L
        assertFalse(answered("r3", "BTC", free(0), ReadOrigin.FOLLOW_UP))
        assertFalse(bench.host.offersOneTapOnHome())
        assertFalse(center.readsOpen)

        // What is left on the glass asks nothing: the other asset's line, with "Got it".
        bench.clock += 20 * 60_000L
        bench.host.appBecameActive()
        runCurrent()
        line = bench.host.nudgeJson()!!
        assertTrue(line.getString("id").startsWith("harness.move.nvda."))
        assertEquals("Got it", line.getString("cta"))
        assertEquals("done", bench.host.nudgeAct(line.getString("id")).getString("status"))
        runCurrent()
        assertEquals("the tap launched nothing", 1, bench.desk.events("ask.start").size)

        // The week's board: its rows are plain, and a row that is tapped anyway launches nothing.
        center.focusBoard(null)
        assertTrue(bench.host.present(V18Routes.FOLLOW_UP))
        assertFalse(Harness.pick(bench.host, HarnessBoard.Row("NVDA", "NVDA", true)))
        runCurrent()
        assertEquals(1, bench.desk.events("ask.start").size)
        assertEquals("the board stays: nothing was launched behind it", V18Routes.FOLLOW_UP, bench.shell.sheetRoute)
        bench.closeSheet()
        runCurrent()

        // Nothing along the way opened a door to a wall.
        assertEquals(listOf(V18Routes.FOLLOW_UP), bench.shell.opened)
        assertTrue(bench.shell.signIns.isEmpty())
        // A guest at the limit has the sign-in behind it: the same holds.
        assertFalse(bench.host.offersOneTapAfterRead(receipt(guest(0))))
        assertFalse(bench.host.offersOneTapAfterRead(null))
        // The wall lifts when the server says so (Bobby Pro, a gifted read): the next read's row asks again.
        bench.clock += hour
        assertTrue(answered("r4", "ETH", pro))
        assertTrue(bench.host.offersOneTapOnHome())
        assertTrue(center.readsOpen)
    }

    // C6: what Bobby keeps is on the Memory screen, in sentences

    @Test fun theNotesHeaderStatesHowTheAppIsBuiltInTwentyWordsOrFewer() {
        assertEquals("Notes Bobby keeps on this phone to choose when to come back. They are not sent to the AI.", HarnessNotes.header(HarnessWords.copy("en")))
        assertEquals("Notas que Bobby guarda en este teléfono para elegir cuándo volver. No se envían a la IA.", HarnessNotes.header(HarnessWords.copy("es")))
        val seen = HashSet<String>()
        inEveryLanguage { spoken, copy ->
            val header = HarnessNotes.header(copy)
            val words = header.split(' ', ' ').filter { it.isNotEmpty() && it != ":" }
            assertTrue("$spoken: ${words.size} words: $header", words.size <= 20)
            assertFalse("$spoken: this is not an iPhone", header.contains("iPhone"))
            // A fact about how the app is built. Nothing about what a verdict will or will not do.
            for (promise in listOf("verdict", "veredict", "verdetto", "urteil", "never", "nunca", "jamais", "mai ", "niemals")) {
                assertFalse("$spoken: “$header” promises ($promise)", header.lowercase().contains(promise))
            }
            seen.add(header)
        }
        assertEquals(6, seen.size)
    }

    /** A ledger with every kind of note, on Wednesday 7 October 2026. */
    private fun sample(full: Boolean): Pair<HarnessLedger, List<HarnessFollowUp>> {
        val ledger = HarnessLedger()
        for (asked in listOf(1, 3, 5)) {
            ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(asked, 14, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 187.4213,
                                     horizon = if (asked == 5) HarnessHorizon.WEEK else null))
        }
        ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, at(5, 14, 12), symbol = "NVDA", horizonHours = 168))
        ledger.note(HarnessEvent(HarnessEvent.Kind.PICKED, at(5, 14, 13), symbol = "NVDA"))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(3, 9, 30), symbol = "BTC", name = "Bitcoin", isEquity = false, price = 61_234.5))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, on(9, 28, 18, 45), symbol = "TSLA", name = "Tesla", isEquity = true, price = 300.0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, on(9, 30, 18, 45), symbol = "TSLA", name = "Tesla", isEquity = true, price = 300.0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, on(9, 30, 18, 50), symbol = "TSLA", horizon = HarnessHorizon.MONTH))
        val upcoming = arrayListOf(HarnessFollowUp(HarnessStep.ASSET, at(12, 14, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, days = 7))
        if (full) {
            for ((month, shownOn) in listOf(9 to 29, 10 to 1, 10 to 4)) {
                val shown = on(month, shownOn, 19)
                ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, shown, symbol = "TSLA", step = HarnessStep.ASSET))
                ledger.note(HarnessEvent(HarnessEvent.Kind.OPENED, shown + 600_000L, symbol = "TSLA", step = HarnessStep.ASSET, ref = shown))
                ledger.note(HarnessEvent(HarnessEvent.Kind.RETURNED, shown + 900_000L, symbol = "TSLA", step = HarnessStep.ASSET, ref = shown))
            }
            upcoming.add(HarnessFollowUp(HarnessStep.WEEK, at(19, 14, 10), symbol = "NVDA", others = 1))
        }
        return Pair(ledger, upcoming)
    }

    private fun notes(sample: Pair<HarnessLedger, List<HarnessFollowUp>>, mode: HarnessMode = HarnessMode.ON, spoken: String = "en", drawn: Int = 0): HarnessNotes =
        HarnessNotes.make(sample.first, mode, sample.second, at(7, 12), HarnessDays.mexico, HarnessWords.copy(spoken), drawn)

    @Test fun theNotesSayWhatIsKeptInSentences() {
        val three = notes(sample(full = false))
        assertEquals("most recently asked about first", listOf("NVDA", "BTC", "TSLA"), three.assets.map { it.symbol })
        assertEquals(listOf("Asked 3 times, last on Oct 5.", "Your question was about this week.", "You saved a read, to review in a week.", "Bobby comes back on Oct 12."),
                     three.assets[0].lines)
        assertEquals(listOf("Asked once, on Oct 3."), three.assets[1].lines)
        assertEquals(listOf("Asked 2 times, last on Sep 30.", "Your thesis looks weeks ahead."), three.assets[2].lines)
        assertTrue(three.assets.all { it.erasable })
        assertTrue("nothing Bobby does that is worth a sentence yet", three.general.isEmpty())
        assertFalse(three.isEmpty)

        val spanish = notes(sample(full = false), spoken = "es")
        assertEquals(listOf("Preguntaste 3 veces, la última el 5 oct.", "Tu pregunta era sobre esta semana.", "Guardaste una lectura, para revisar en una semana.", "Bobby vuelve el 12 oct."),
                     spanish.assets[0].lines)
        assertEquals(listOf("Preguntaste una vez, el 3 oct."), spanish.assets[1].lines)
        assertTrue(spanish.assets[2].lines[0], spanish.assets[2].lines[0].startsWith("Preguntaste 2 veces, la última el 30 sep"))
        assertEquals("Tu tesis mira a semanas.", spanish.assets[2].lines[1])

        val full = notes(sample(full = true), drawn = 2)
        assertEquals(listOf("Your week arrives on Oct 19.", "Follow-ups arrive around 7:00 PM.", "Follow-ups: 3 shown, 3 tapped, 3 answered.", "“Since you asked” lines shown: 2."),
                     full.general)
        assertEquals(listOf("Tu semana llega el 19 oct.", "El seguimiento llega hacia las 19:00.", "Seguimientos: 3 mostrados, 3 tocados, 3 respondidos.", "Líneas “desde que preguntaste” mostradas: 2."),
                     notes(sample(full = true), spoken = "es", drawn = 2).general)
        assertEquals("one paragraph for TalkBack", "Asked once, on Oct 3.", full.assets[1].text)

        // In every language: a sentence per fact, no placeholder left, no price, and a day that never doubles the full stop.
        inEveryLanguage { spoken, _ ->
            val said = notes(sample(full = true), spoken = spoken, drawn = 2)
            val all = said.assets.flatMap { it.lines } + said.general
            assertEquals(spoken, 11, all.size)
            for (line in all) {
                assertFalse("$spoken: $line", line.contains("{") || line.contains("..") || line.contains("187") || line.contains("61"))
                assertTrue("$spoken: $line", line.endsWith("."))
            }
        }
        // Nothing kept: one quiet line, and which one says whether follow-ups are off.
        val nothing = HarnessNotes.make(HarnessLedger(), HarnessMode.UNDECIDED, emptyList(), at(7, 12), HarnessDays.mexico, HarnessWords.copy("en"))
        assertTrue(nothing.isEmpty)
        assertEquals("No follow-up notes.", nothing.quietLine(HarnessWords.copy("en")))
        assertEquals("Sin notas de seguimiento.", nothing.quietLine(HarnessWords.copy("es")))
        val off = nothing.copy(mode = HarnessMode.OFF)
        assertEquals("Follow-ups are off.", off.quietLine(HarnessWords.copy("en")))
        assertEquals("El seguimiento está apagado.", off.quietLine(HarnessWords.copy("es")))
        assertEquals("Erase", HarnessNotes.eraseOne(HarnessWords.copy("en")))
        assertEquals("Borrar", HarnessNotes.eraseOne(HarnessWords.copy("es")))
        assertEquals("Erase notes", HarnessNotes.eraseAll(HarnessWords.copy("en")))
        assertEquals("Borrar notas", HarnessNotes.eraseAll(HarnessWords.copy("es")))
        assertEquals("Erase the notes about NVDA", HarnessNotes.eraseLabel(HarnessWords.copy("en"), "NVDA"))
    }

    @Test fun theNotesCountTheirOwnQuestionsApartFromTheReadsBobbyStarted() {
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(2, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 100.0, horizon = HarnessHorizon.MONTH))
        // Bobby's own questions about it: a follow-up's button (whose question named today), a board row, a chip.
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(4, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 101.0,
                                 origin = HarnessEvent.Origin.FOLLOW_UP, horizon = HarnessHorizon.INTRADAY))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(5, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 102.0, origin = HarnessEvent.Origin.FOLLOW_UP))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(6, 10), symbol = "BTC", name = "Bitcoin", isEquity = false, price = 60_000.0, origin = HarnessEvent.Origin.FOLLOW_UP))
        val said = HarnessNotes.make(ledger, HarnessMode.ON, emptyList(), at(7, 12), HarnessDays.mexico, HarnessWords.copy("en"))
        assertEquals("the last read of either kind orders the rows", listOf("BTC", "NVDA"), said.assets.map { it.symbol })
        assertEquals("the day and the horizon said are those of their own question",
                     listOf("Asked once, on Oct 2.", "2 reads from questions Bobby wrote.", "Your question was about this month."), said.assets[1].lines)
        assertEquals("an asset they never asked about in their own words says so", listOf("One read from a question Bobby wrote."), said.assets[0].lines)
        assertTrue(said.assets.all { it.erasable })
        val spanish = HarnessNotes.make(ledger, HarnessMode.ON, emptyList(), at(7, 12), HarnessDays.mexico, HarnessWords.copy("es"))
        assertEquals(listOf("Una lectura desde una pregunta que escribió Bobby."), spanish.assets[0].lines)
        assertEquals("2 lecturas desde preguntas que escribió Bobby.", spanish.assets[1].lines[1])
    }

    @Test fun everyFieldOfAnEventAndOfTheProfileIsSaidOrMarkedInternalWithItsReason() {
        fun stored(type: Class<*>): Set<String> = type.declaredFields.filter { !Modifier.isStatic(it.modifiers) && !it.isSynthetic }.map { it.name }.toSet()
        // A field added to the event fails here until it has its case, and its case does not compile
        // until `HarnessNotes.told` says where the person reads it or why they do not.
        assertEquals(stored(HarnessEvent::class.java), HarnessEventField.entries.map { it.raw }.toSet())
        assertEquals(HarnessEventField.entries.size, HarnessEventField.entries.map { it.raw }.toSet().size)
        for (field in HarnessEventField.entries) {
            when (val told = HarnessNotes.told(field)) {
                is HarnessNotes.Told.Said -> assertTrue(field.raw, told.where.length > 10)
                is HarnessNotes.Told.Kept -> assertTrue(field.raw, told.why.length > 20)
            }
        }
        val internal = HarnessEventField.entries.filter { HarnessNotes.told(it) is HarnessNotes.Told.Kept }.map { it.raw }.toSet()
        assertEquals("what is kept and not said, each with its reason", setOf("name", "isEquity", "price", "sector", "ref", "thread"), internal)
        // The profile: every field has its branch in `HarnessNotes.make`.
        assertEquals(stored(HarnessProfile::class.java), HarnessProfileField.entries.map { it.raw }.toSet())
        // And everything an event can write to the store is one of those fields.
        val whole = HarnessEvent(HarnessEvent.Kind.ASK, 1L, "NVDA", "NVIDIA", true, 1.0, HarnessStep.ASSET, "semis", 1L, HarnessEvent.Origin.FOLLOW_UP, true, HarnessHorizon.WEEK, 72)
        assertEquals(HarnessEventField.entries.map { it.raw }.toSet(), keys(whole.toJson()))
        // Every kind of event has its place: the kinds are an exhaustive `when` in `make`, and each is counted here.
        assertEquals(8, HarnessEvent.Kind.entries.size)
    }

    @Test fun whatBobbyDoesIsSaidOnlyWhenThePlannerDoesIt() {
        val english = HarnessWords.copy("en")
        val now = at(7, 12)
        fun general(ledger: HarnessLedger, mode: HarnessMode = HarnessMode.ON) = HarnessNotes.make(ledger, mode, emptyList(), now, HarnessDays.mexico, english).general
        // The hour: only once the planner really uses it (three answers), and never before the yes.
        assertTrue(notes(sample(full = true)).general.contains("Follow-ups arrive around 7:00 PM."))
        assertFalse(notes(sample(full = true), mode = HarnessMode.UNDECIDED).general.any { it.contains("arrive around") })
        val two = HarnessLedger()
        for (shownOn in listOf(1, 4)) {
            two.note(HarnessEvent(HarnessEvent.Kind.SENT, at(shownOn, 19), symbol = "NVDA", step = HarnessStep.ASSET))
            two.note(HarnessEvent(HarnessEvent.Kind.RETURNED, at(shownOn, 19, 15), symbol = "NVDA", step = HarnessStep.ASSET, ref = at(shownOn, 19)))
        }
        assertEquals("two answers are not yet an hour", listOf("Follow-ups: 2 shown, 0 tapped, 2 answered."), general(two))
        // Three in a row that nobody answered: quiet for two weeks, and the screen says until when.
        val quiet = HarnessLedger()
        for (shownOn in listOf(2, 5, 6)) quiet.note(HarnessEvent(HarnessEvent.Kind.SENT, at(shownOn, 10), symbol = "NVDA", step = HarnessStep.ASSET))
        assertEquals(listOf("Quiet until Oct 20.", "Follow-ups: 3 shown, 0 tapped, 0 answered."), general(quiet))
        assertEquals("a tap is not an answer", listOf("Quiet until Oct 20.", "Follow-ups: 3 shown, 1 tapped, 0 answered."),
                     general(quiet.also { it.note(HarnessEvent(HarnessEvent.Kind.OPENED, at(6, 11), symbol = "NVDA", step = HarnessStep.ASSET, ref = at(6, 10))) }))
        assertEquals("before the yes Bobby does nothing, so it says nothing it does", listOf("Follow-ups: 3 shown, 1 tapped, 0 answered."), general(quiet, HarnessMode.UNDECIDED))
        // A kind whose last two went unanswered rests.
        val resting = HarnessLedger()
        for (shownOn in listOf(2, 6)) resting.note(HarnessEvent(HarnessEvent.Kind.SENT, at(shownOn, 10), symbol = "NVDA", step = HarnessStep.ASSET))
        assertEquals(listOf("Fewer follow-ups for now.", "Follow-ups: 2 shown, 0 tapped, 0 answered."), general(resting))
        assertEquals("Menos seguimiento por ahora.", HarnessNotes.make(resting, HarnessMode.ON, emptyList(), now, HarnessDays.mexico, HarnessWords.copy("es")).general.first())
        assertEquals("En silencio hasta el 20 oct.", HarnessNotes.make(quiet, HarnessMode.ON, emptyList(), now, HarnessDays.mexico, HarnessWords.copy("es")).general.first())
        // What is dated after now has not happened yet.
        val later = HarnessLedger().also { it.note(HarnessEvent(HarnessEvent.Kind.ASK, at(9, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 1.0)) }
        assertTrue(HarnessNotes.make(later, HarnessMode.ON, emptyList(), now, HarnessDays.mexico, english).isEmpty)
    }

    @Test fun theCentreSaysItsOwnNotesAndTheyFollowWhatThePersonDoes() = runTest {
        val center = make()
        val before = center.revision.value
        assertTrue(center.notes.isEmpty)
        assertEquals("No follow-up notes.", center.notes.quietLine(center.copy))
        ask(center, "NVDA")
        assertTrue("the Memory screen is told to draw again", center.revision.value > before)
        assertEquals(listOf(listOf("Asked once, on Oct 7.")), center.notes.assets.map { it.lines })
        center.accept()
        assertEquals(listOf("Asked once, on Oct 7.", "Bobby comes back on Oct 8."), center.notes.assets.single().lines)
        assertEquals(listOf("Your week arrives on Oct 12."), center.notes.general)
        center.turnOff()
        assertTrue(center.notes.isEmpty)
        assertEquals(HarnessMode.OFF, center.notes.mode)
    }

    @Test fun erasingOneAssetsNotesRemovesItsFollowUpAndNeverMakesBobbyLouder() = runTest {
        val center = make()
        ask(center, "TSLA")
        clock = at(7, 16, 45)
        center.noteAsk("NVDA", "NVIDIA", true, 100.0, horizon = HarnessHorizon.WEEK)
        center.accept()
        clock = at(7, 16, 50)
        center.noteSaved("NVDA", 24)
        val glass = lines()
        glass.retire("harness.move.nvda.20261007")
        glass.retire("harness.move.tsla.20261007")
        val due = center.upcoming.first { it.step == HarnessStep.ASSET }
        assertEquals("NVDA", due.symbol)
        // Its follow-up is shown and tapped; the week is still to come.
        clock = due.fireAt + hour
        phone.memory.deliverDue()
        center.appActive()
        center.opened(HarnessTap(HarnessStep.ASSET, "NVDA", null, owner = "local", stamp = due.fireAt))
        assertEquals(1, phone.memory.delivered.size)
        assertTrue(pending().isNotEmpty())
        assertEquals(setOf("NVDA", "TSLA"), center.notes.assets.map { it.symbol }.toSet())
        val redrawn = redraws

        center.forget("nvda")
        assertTrue("nothing asked, saved or tapped about it is left", center.ledger.events.none { it.symbol == "NVDA" })
        assertFalse(raw.values.getValue(ledgerKey()).contains("NVDA"))
        assertEquals("the other asset's notes are untouched", listOf("TSLA"), center.notes.assets.map { it.symbol })
        assertEquals("what was shown stays counted, without the asset", listOf<String?>(null), events(center, HarnessEvent.Kind.SENT).map { it.symbol })
        assertEquals(listOf<String?>(null), events(center, HarnessEvent.Kind.OPENED).map { it.symbol })
        assertEquals(1, center.ledger.unansweredStreak(clock).count)
        assertTrue(center.notes.general.contains("Follow-ups: 1 shown, 1 tapped, 0 answered."))
        assertTrue("the notice already shown may name it: it leaves the shade", phone.memory.delivered.isEmpty())
        assertTrue("no pending follow-up names it", phone.memory.scheduled.none { it.body.contains("NVDA") || it.payload[HarnessTap.SYMBOL] == "NVDA" })
        assertTrue(center.upcoming.none { it.symbol == "NVDA" })
        assertEquals("the glass's line about it goes, the other stays", 1, center.linesKept(null))
        assertTrue(glass.isRetired("harness.move.tsla.20261007"))
        assertFalse(raw.values.getValue(NudgeCenter.storeKey(null)).contains("nvda"))
        assertTrue("the glass is told", redraws > redrawn)
        // Never louder: the question before it gets what it had left, counted with what was shown since.
        assertTrue("TSLA's chain had two, and one was shown since: one at most is left", center.upcoming.size <= 1)
        assertEquals(HarnessMode.ON, center.mode)
        // Something that is not an asset erases nothing.
        val kept = HashMap(raw.values)
        center.forget("not a symbol")
        assertEquals(kept, HashMap(raw.values))
    }

    @Test fun aThesisIsErasedWhereItWasWrittenNotFromTheNotes() = runTest {
        val center = make()
        center.theses = { listOf(HarnessThesis("TSLA", HarnessHorizon.MONTH, at(1, 9))) }
        ask(center, "NVDA")
        center.accept()
        val thesis = center.notes.assets.single { it.symbol == "TSLA" }
        assertEquals(listOf("Your thesis looks weeks ahead."), thesis.lines)
        assertFalse("nothing but the pointer is kept: there is no Erase", thesis.erasable)
        center.forget("TSLA")
        assertEquals("the pointer goes with its thesis, in My theses", listOf<String?>("TSLA"), events(center, HarnessEvent.Kind.THESIS).map { it.symbol })
        // A thesis with no horizon set, and one that looks further ahead.
        center.theses = { listOf(HarnessThesis("TSLA", null, at(1, 9)), HarnessThesis("BTC", HarnessHorizon.LONG, at(2, 9))) }
        center.replan()
        assertEquals(listOf("You wrote a thesis about it."), center.notes.assets.single { it.symbol == "TSLA" }.lines)
        assertEquals(listOf("Your thesis looks months or more ahead."), center.notes.assets.single { it.symbol == "BTC" }.lines)
        language = "es"
        assertEquals(listOf("Escribiste una tesis sobre este activo."), center.notes.assets.single { it.symbol == "TSLA" }.lines)
        assertEquals(listOf("Tu tesis mira a meses o más."), center.notes.assets.single { it.symbol == "BTC" }.lines)
        language = "en"
    }

    @Test fun theLinesTheGlassDrewAreSaidErasedAndForgottenWithTheLedger() = runTest {
        val glass = lines()
        val t0 = clock
        glass.retire("harness.move.nvda.20261001")
        clock = t0 + day
        glass.retire("harness.move.btc.20261002")
        glass.retire(HarnessNudges.OFFER_ID)
        glass.retire("memory.kept.3fa85f64.nvda")
        // Counted for the reader they belong to, by prefix.
        assertEquals(2, NudgeCenter.count(HarnessNudges.movePrefix(), null, raw))
        assertEquals(1, NudgeCenter.count(HarnessNudges.movePrefix("NVDA"), null, raw))
        assertEquals(0, NudgeCenter.count(HarnessNudges.movePrefix(), "u1", raw))
        assertEquals(0, NudgeCenter.count("", null, raw))
        assertEquals("harness.move.", HarnessNudges.movePrefix())
        assertEquals("harness.move.brk-b.", HarnessNudges.movePrefix("BRK-B"))
        // Said on the Memory screen, with the question the line was about.
        val center = make()
        ask(center, "BTC", equity = false)
        assertEquals(2, center.linesKept(null))
        assertTrue(center.notes.general.contains("“Since you asked” lines shown: 2."))
        // Kept no longer than the ledger keeps the question: sixty days.
        NudgeCenter.prune(HarnessNudges.movePrefix(), t0 + 1, null, raw)
        assertEquals("the older one goes, retired or not", 1, NudgeCenter.count(HarnessNudges.movePrefix(), null, raw))
        clock = t0 + day + 61 * day
        center.appActive()
        assertEquals("opening the app lets go of what is older than the ledger keeps", 0, center.linesKept(null))
        assertTrue("another feature's lines are not the harness's to touch", glass.isRetired("memory.kept.3fa85f64.nvda"))
        assertTrue(glass.isRetired(HarnessNudges.OFFER_ID))
        // "Erase notes" takes them with the ledger, and keeps the switch.
        clock = at(7, 16, 40)
        glass.retire("harness.move.btc.20261007")
        ask(center, "BTC", equity = false)
        assertEquals(1, center.linesKept(null))
        center.forgetLedger()
        assertEquals(0, center.linesKept(null))
        assertTrue(center.ledger.isEmpty)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertTrue(center.notes.isEmpty)
        // A store that held nothing but those lines is removed, not left empty.
        val bare = OpenStore()
        NudgeCenter(bare) { clock }.retire("harness.move.eth.20261007")
        NudgeCenter.forget(listOf(HarnessNudges.movePrefix("ETH")), null, bare)
        assertTrue(bare.values.isEmpty())
    }

    @Test fun onlyTheSymbolLeavesThePhoneAndOnlyInAQuestionOrAPriceRequest() {
        // The harness folder reaches a server in two places and no other: the price of one asset
        // (the glass, a board row), and the balance of reads (which carries nothing of the ledger).
        val folder = File("src/main/java/xyz/bobbyprotocol/android/v18/harness")
        val reaches = ArrayList<String>()
        for (file in folder.listFiles { found -> found.name.endsWith(".kt") }!!.sortedBy { it.name }) {
            for (line in file.readLines()) {
                val code = line.substringBefore("//").trim()
                if (code.startsWith("*") || code.startsWith("/*")) continue
                if (code.contains("repository") || code.contains("streamDebate") || code.contains("okhttp") || code.contains("HttpURL") || code.contains(".load()")) {
                    reaches.add(file.name + ": " + code)
                }
            }
        }
        assertEquals(reaches.toString(), 2, reaches.size)
        assertTrue(reaches.toString(), reaches.any { it.startsWith("Harness.kt") && it.contains("host.repository.market(symbol)") })
        assertTrue(reaches.toString(), reaches.any { it.startsWith("Harness.kt") && it.contains("CreditsCenter.of(host).load()") })
        // The two questions a tap sends name the asset and nothing else the phone keeps.
        inEveryLanguage { spoken, copy ->
            for (question in listOf(copy.changedQuestion("NVDA"), copy.lookQuestion("NVDA"))) {
                assertTrue("$spoken: $question", question.contains("NVDA"))
                assertFalse("$spoken: $question", question.any { it.isDigit() })
            }
        }
    }

    // C7: a gate on words

    private val forbidden = mapOf(
        "en" to listOf("buy", "bought", "sell", "sold", "profit", "guarantee", "return", "advice", "advis", "signal", "alert",
                       "watch", "monitor", "notic", "detect", "track", "spott"),
        "es" to listOf("compr", "vend", "venta", "gananc", "garant", "rendimiento", "retorno", "consej", "asesor", "señal", "alert",
                       "vigil", "monitor", "notó", "notar", "noté", "advert", "detect", "observ", "rastre"),
        "fr" to listOf("achet", "achat", "vend", "vente", "profit", "bénéfice", "gain", "garanti", "rendement", "conseil", "signal", "alert",
                       "surveill", "détect", "remarqu", "observ", "repér", "constat"),
        "pt" to listOf("compr", "vend", "lucro", "ganho", "garant", "rendimento", "retorno", "conselh", "sinal", "alert",
                       "vigi", "monitor", "detet", "detect", "repar", "observ", "not"),
        "it" to listOf("compr", "acquist", "vend", "profitt", "guadagn", "garant", "rendiment", "ritorn", "consigli", "segnal", "allert", "allarm", "avvis",
                       "sorvegli", "monitor", "rilev", "notat", "osserv"),
        "de" to listOf("kauf", "verkauf", "gewinn", "profit", "garant", "rendite", "ertrag", "ratschlag", "beratung", "empfehl", "signal", "alarm", "warn", "alert",
                       "beobacht", "überwach", "bemerk", "entdeck", "erkann", "festgestell"),
    )

    /** Portuguese "not-" is a claim ("notou", "notei") except in the word for the notes themselves. */
    private val allowed = mapOf("pt" to listOf("notas", "nota"))

    private fun hits(line: String, spoken: String): List<String> {
        val words = line.lowercase().split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }
        val fine = allowed[spoken] ?: emptyList()
        return (forbidden[spoken] ?: emptyList()).filter { stem -> words.any { it.startsWith(stem) && it !in fine } }
    }

    /** What is wrong with a line the harness would say in `spoken`, or null. */
    private fun problem(line: String, spoken: String): String? = when {
        line.isBlank() -> "says nothing"
        hits(line, spoken).isNotEmpty() -> "says " + hits(line, spoken)
        line.contains("!") || line.contains("¡") -> "shouts"
        listOf("OKX", "OKB", "X Layer").any { line.contains(it) } -> "names another product"
        else -> null
    }

    /** Every pair of words written in the harness folder and on the screens that draw it: English and Spanish as the source has them. */
    private fun written(): List<Pair<String, String>> {
        val literal = Regex("\\btext\\(\\s*\"((?:[^\"\\\\]|\\\\.)*)\"\\s*,\\s*\"((?:[^\"\\\\]|\\\\.)*)\"")
        val folder = File("src/main/java/xyz/bobbyprotocol/android/v18/harness")
        val files = folder.listFiles { found -> found.name.endsWith(".kt") }!!.sortedBy { it.name } + File("src/main/java/xyz/bobbyprotocol/android/ui/v18/FollowUpSheet.kt")
        val pairs = ArrayList<Pair<String, String>>()
        for (file in files) {
            for (match in literal.findAll(file.readText())) {
                val en = match.groupValues[1]
                val es = match.groupValues[2]
                assertFalse("${file.name}: an escape this sweep does not read: $en / $es", en.contains("\\") || es.contains("\\"))
                pairs.add(Pair(en, es))
            }
        }
        return pairs
    }

    /** Everything the harness can say in one language, with its values filled in. */
    private fun everythingSaid(spoken: String): List<String> {
        val copy = HarnessWords.copy(spoken)
        val now = at(7, 12)
        val said = ArrayList<String>()
        // The lock screen, its public version and its button.
        for (followUp in listOf(HarnessFollowUp(HarnessStep.ASSET, now, symbol = "NVDA", days = 3), HarnessFollowUp(HarnessStep.SECTOR, now, symbol = "NVDA", sector = "semis"),
                                HarnessFollowUp(HarnessStep.WEEK, now, symbol = "NVDA", others = 2), HarnessFollowUp(HarnessStep.WEEK, now, symbol = "NVDA", others = 0))) {
            said.add(copy.body(followUp))
        }
        for (step in HarnessStep.entries) said.add(copy.publicBody(step))
        said.addAll(listOf(HarnessCopy.NOTIFICATION_TITLE, copy.stopAction))
        // The glass and the questions Bobby is asked on a tap.
        said.addAll(listOf(copy.offerLine("NVDA"), copy.offerLine("ABCDEFGHIJKLMNOPQRST"), copy.offerButton, copy.moveButton, copy.moveSeen))
        for (pct in listOf(null, 0.0, 3.2, -3.2)) for (days in listOf(1, 3)) said.add(copy.moveLine("NVDA", pct, days))
        said.addAll(listOf(copy.changedQuestion("NVDA"), copy.lookQuestion("NVDA")))
        // The board and the switch.
        said.addAll(listOf(copy.weekTitle, copy.sinceAsked, copy.last24h, copy.boardEmpty, copy.boardFoot, copy.switchLabel, copy.switchDetail))
        said.addAll(HarnessSectors.all.map { copy.sectorTitle(it.id) })
        // The Memory screen: the header, the quiet lines, the erase buttons and every sentence a ledger can produce.
        said.addAll(listOf(HarnessNotes.header(copy), HarnessNotes.eraseAll(copy), HarnessNotes.eraseOne(copy), HarnessNotes.eraseLabel(copy, "NVDA"),
                           HarnessNotes(mode = HarnessMode.OFF).quietLine(copy), HarnessNotes(mode = HarnessMode.UNDECIDED).quietLine(copy)))
        val ledgers = arrayListOf(sample(full = true), sample(full = false))
        val saves = listOf(24, 72, 168, null, null)
        val theses = listOf(HarnessHorizon.MONTH, HarnessHorizon.LONG, null, null, null)
        for ((index, horizon) in listOf(HarnessHorizon.INTRADAY, HarnessHorizon.WEEK, HarnessHorizon.MONTH, HarnessHorizon.LONG, HarnessHorizon.UNSPECIFIED).withIndex()) {
            val ledger = HarnessLedger()
            ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, at(1, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 100.0, horizon = horizon))
            ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, at(1, 11), symbol = "NVDA", horizonHours = saves[index]))
            ledger.note(HarnessEvent(HarnessEvent.Kind.THESIS, at(1, 12), symbol = "NVDA", horizon = theses[index]))
            // Two unanswered in a row rest a kind; three are a quiet fortnight.
            for (shownOn in (if (index == 0) listOf(2, 6) else if (index == 1) listOf(2, 5, 6) else emptyList())) {
                ledger.note(HarnessEvent(HarnessEvent.Kind.SENT, at(shownOn, 10), symbol = "NVDA", step = HarnessStep.ASSET))
            }
            ledgers.add(Pair(ledger, emptyList()))
        }
        // Reads whose question Bobby wrote, one and several, and the lines the glass drew.
        val started = HarnessLedger()
        started.note(HarnessEvent(HarnessEvent.Kind.ASK, at(2, 10), symbol = "BTC", name = "Bitcoin", isEquity = false, price = 100.0, origin = HarnessEvent.Origin.FOLLOW_UP))
        for (readOn in listOf(3, 4, 5)) {
            started.note(HarnessEvent(HarnessEvent.Kind.ASK, at(readOn, 10), symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 100.0, origin = HarnessEvent.Origin.FOLLOW_UP))
        }
        ledgers.add(Pair(started, emptyList()))
        val sentences = LinkedHashSet<String>()
        for ((ledger, upcoming) in ledgers) {
            val notes = HarnessNotes.make(ledger, HarnessMode.ON, upcoming, now, HarnessDays.mexico, copy, drawn = 4)
            sentences.addAll(notes.assets.flatMap { it.lines } + notes.general)
        }
        said.addAll(sentences)
        return said
    }

    @Test fun noHarnessStringSaysAForbiddenWordInAnyLanguage() {
        // 1. Every pair of words written in the source, whether or not a code path reaches it today:
        //    the lock screen and its public version, the glass, the buttons, the questions Bobby asks
        //    on a tap, the board, the switch, the notes on Memory, Stop, the sectors.
        val pairs = written()
        assertTrue("the sweep found ${pairs.size} strings", pairs.size >= 60)
        for (needle in listOf("{0}: back to your question.", "Back to your question.", "Your week.", "Stop", "Got it", "What changed?", "Yes, tell me",
                              "What changed in {0} since I asked?", "How does {0} look today?", "Your week", "Follow-ups", "Erase notes", "Asked once, on {0}.",
                              "Notes Bobby keeps on this phone to choose when to come back. They are not sent to the AI.", "Quiet until {0}.", "Semiconductors")) {
            assertTrue("the sweep never read “$needle”", pairs.any { it.first == needle })
        }
        val placeholders = Regex("\\{\\d+\\}")
        for ((en, es) in pairs) {
            assertNull("en: “$en”", problem(en, "en"))
            assertNull("es: “$es”", problem(HarnessWords.text("es", en, es), "es"))
            for (spoken in listOf("fr", "pt", "it", "de")) {
                val row = HarnessWords.translated(spoken, en)
                assertNotNull("$spoken has no row for “$en”", row)
                assertNull("$spoken: “$row”", problem(row!!, spoken))
                assertEquals("$spoken: $en", placeholders.findAll(en).map { it.value }.sorted().toList(), placeholders.findAll(row).map { it.value }.sorted().toList())
            }
        }
        // 2. Everything it can say with its values filled in: a day, an hour, a count, an asset.
        val perLanguage = HashMap<String, Int>()
        for (spoken in HarnessWords.languages) {
            val said = everythingSaid(spoken)
            perLanguage[spoken] = said.toSet().size
            for (line in said) {
                assertNull("$spoken: “$line”", problem(line, spoken))
                assertFalse("$spoken: a placeholder was left in “$line”", line.contains("{"))
            }
        }
        // Every sentence the notes can say was in the sweep.
        val english = everythingSaid("en")
        for (needle in listOf("Asked once", "Asked 3 times", "about today", "about this week", "about this month", "about months or years",
                              "You saved a read.", "review in a day", "review in 3 days", "review in a week", "You wrote a thesis", "weeks ahead",
                              "months or more ahead", "Bobby comes back on", "Your week arrives on", "Follow-ups arrive around", "Quiet until",
                              "Fewer follow-ups", "Follow-ups: 3 shown", "One read from a question Bobby wrote", "3 reads from questions Bobby wrote", "lines shown: 4",
                              "back to your question", "Back to your question.", "Your week.", "Stop", "Got it")) {
            assertTrue("the sweep never produced “$needle”", english.any { it.contains(needle) })
        }
        assertTrue("the sweep is long in every language: $perLanguage", (perLanguage.values.minOrNull() ?: 0) >= 55)

        // 3. The gate catches what it is there for: one planted line per language.
        assertEquals(listOf("buy", "alert", "notic"), hits("Bobby noticed NVDA: buy the alert.", "en"))
        assertEquals(listOf("compr", "señal", "detect"), hits("Bobby detectó una señal de compra.", "es"))
        assertEquals(listOf("signal", "remarqu"), hits("Bobby a remarqué un signal.", "fr"))
        assertEquals(listOf("sinal", "not"), hits("O Bobby notou um sinal.", "pt"))
        assertEquals(listOf("segnal", "rilev"), hits("Bobby ha rilevato un segnale.", "it"))
        assertEquals(listOf("signal", "bemerk"), hits("Bobby hat ein Signal bemerkt.", "de"))
        val planted = mapOf("en" to "Bobby watched NVDA for you.", "es" to "Bobby vigiló NVDA por ti.", "fr" to "Bobby a surveillé NVDA pour toi.",
                            "pt" to "O Bobby monitorizou a NVDA por ti.", "it" to "Bobby ha monitorato NVDA per te.", "de" to "Bobby hat NVDA für dich beobachtet.")
        for (spoken in HarnessWords.languages) {
            assertNotNull("$spoken: the gate let a planted claim through", problem(planted.getValue(spoken), spoken))
            assertNotNull(problem("NVDA!", spoken))
        }
        assertEquals(emptyList<String>(), hits("Notes Bobby keeps. Back to your question.", "en"))
        assertNull(problem("Notas que o Bobby guarda neste telemóvel.", "pt"))
    }
}
