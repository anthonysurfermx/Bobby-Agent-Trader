package xyz.bobbyprotocol.android.v18.harness

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeRead
import xyz.bobbyprotocol.android.v18.ReadOrigin
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.V18Reader
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.credits.ReadAccess
import xyz.bobbyprotocol.android.v18.notify.LocalNotice

/**
 * The harness (1.8) on the glass and on the lock screen: the words, their limits in six
 * languages, the tapped payload, the board, and the app's side of a tap.
 * The cases of ios/Bobby/Tests/HarnessGlassTests.swift; the session cases run on the real host.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HarnessGlassTest {
    private val t0 = 1_800_000_000_000L
    private val day = 86_400_000L
    private val hour = 3_600_000L
    private val english = HarnessWords.copy("en")

    private fun inEveryLanguage(body: (String, HarnessCopy) -> Unit) {
        for (language in HarnessWords.languages) body(language, HarnessWords.copy(language))
    }

    // Words

    @Test fun theGlassLinesFitInEveryLanguage() {
        inEveryLanguage { language, copy ->
            for (symbol in listOf("BTC", "NVDA", "PETR4.SA", "INTESASANPAOLO.MI", "ABCDEFGHIJKLMNOPQRST")) {
                val offer = copy.offerLine(symbol)
                assertTrue("$language offer: $offer", offer.length <= NucleoNudge.TEXT_LIMIT)
                for (pct in listOf(null, 0.0, 2.34, -12.3, 104.9)) {
                    for (days in listOf(1, 3, 14)) {
                        val line = copy.moveLine(symbol, pct, days)
                        assertTrue("$language move: $line", line.length <= NucleoNudge.TEXT_LIMIT)
                        assertTrue(line.contains(symbol))
                    }
                }
            }
            assertTrue(language, copy.offerButton.length <= NucleoNudge.CTA_LIMIT)
            assertTrue(language, copy.moveButton.length <= NucleoNudge.CTA_LIMIT)
            assertTrue(language, copy.moveSeen.length <= NucleoNudge.CTA_LIMIT)
        }
    }

    @Test fun theOfferNamesTheAssetWhenItFits() {
        inEveryLanguage { language, copy ->
            assertTrue(language, copy.offerLine("NVDA").contains("NVDA"))
            // A symbol too long for the line gives the plain line, never a cut one.
            val long = copy.offerLine("ABCDEFGHIJKLMNOPQRST")
            assertTrue(language, long.length <= NucleoNudge.TEXT_LIMIT)
            assertTrue("$language: whole or absent", long.contains("ABCDEFGHIJKLMNOPQRST") || !long.contains("ABCDEF"))
        }
        assertEquals("Shall I keep you posted on this?", english.offerLine("ABCDEFGHIJKLMNOPQRST"))
    }

    @Test fun theMoveSaysWhatThePhoneRead() {
        assertEquals("NVDA +2.3% since you asked", english.moveLine("NVDA", 2.34, 1))
        assertEquals("NVDA -1.1% since you asked", english.moveLine("NVDA", -1.06, 1))
        assertEquals("NVDA is where you left it", english.moveLine("NVDA", 0.01, 1))
        assertEquals("no number the phone does not have", "NVDA, a day later", english.moveLine("NVDA", null, 1))
        assertEquals("NVDA, 3 days later", english.moveLine("NVDA", null, 3))
        assertEquals("a number that is not one is no number", "NVDA, a day later", english.moveLine("NVDA", Double.NaN, 1))
        val spanish = HarnessWords.copy("es")
        assertEquals("the number in the language's own notation", "NVDA ${spanish.signed(2.34)} desde que preguntaste", spanish.moveLine("NVDA", 2.34, 1))
        assertEquals("an ongoing follow-up, said as one", "¿Te voy contando cómo sigue NVDA?", spanish.offerLine("NVDA"))
    }

    @Test fun aNumberIsSignedRoundedAndNeverMinusZero() {
        assertEquals("+2.3%", english.signed(2.34))
        assertEquals("-1.1%", english.signed(-1.06))
        assertEquals("+104.9%", english.signed(104.9))
        assertEquals("+3%", english.signed(3.0))
        assertEquals("0%", english.signed(0.04))
        assertEquals("0%", english.signed(-0.04))
        inEveryLanguage { language, copy ->
            val up = copy.signed(2.34)
            val down = copy.signed(-12.3)
            assertTrue("$language: $up", up.startsWith("+") && up.contains("2") && up.contains("3") && up.contains("%"))
            assertTrue("$language: $down", !down.startsWith("+") && down.contains("12") && down.contains("%"))
        }
    }

    @Test fun theLockScreenIsWrittenInTheAppsLanguage() {
        val asset = HarnessFollowUp(HarnessStep.ASSET, t0, symbol = "NVDA", days = 1)
        val later = HarnessFollowUp(HarnessStep.ASSET, t0, symbol = "NVDA", days = 3)
        val sector = HarnessFollowUp(HarnessStep.SECTOR, t0, symbol = "NVDA", sector = "semis")
        val week = HarnessFollowUp(HarnessStep.WEEK, t0, symbol = "NVDA", others = 2)
        val alone = HarnessFollowUp(HarnessStep.WEEK, t0, symbol = "NVDA", others = 0)
        assertEquals("NVDA: back to your question.", english.body(asset))
        assertEquals("no day count on the lock screen", "NVDA: back to your question.", english.body(later))
        assertEquals("Semiconductors today. NVDA is part of it.", english.body(sector))
        assertEquals("Your week: NVDA and 2 more.", english.body(week))
        assertEquals("Your week with NVDA.", english.body(alone))
        val spanish = HarnessWords.copy("es")
        assertEquals("NVDA: de vuelta a tu pregunta.", spanish.body(asset))
        assertEquals("Semiconductores hoy. NVDA es parte.", spanish.body(sector))
        assertEquals("Tu semana: NVDA y 2 más.", spanish.body(week))
        val seen = HashSet<String>()
        inEveryLanguage { language, copy ->
            for (followUp in listOf(asset, later, sector, week, alone)) {
                val body = copy.body(followUp)
                assertTrue(language, body.contains("NVDA"))
                assertFalse("$language: a placeholder was left in $body", body.contains("{"))
            }
            seen.add(copy.body(asset))
        }
        assertEquals("six languages, six lines", HarnessWords.languages.size, seen.size)
    }

    /** Everything the harness can say, in the language of `copy`. */
    private fun everything(copy: HarnessCopy): List<String> = listOf(
        copy.offerLine("NVDA"), copy.offerLine("ABCDEFGHIJKLMNOPQRST"), copy.offerButton, copy.moveButton, copy.moveSeen, copy.stopAction,
        copy.publicBody(HarnessStep.ASSET), copy.publicBody(HarnessStep.WEEK), copy.switchLabel, copy.switchDetail,
        copy.weekTitle, copy.sinceAsked, copy.last24h, copy.boardFoot, copy.boardEmpty, copy.changedQuestion("NVDA"), copy.lookQuestion("NVDA"),
        copy.moveLine("NVDA", 3.0, 1), copy.moveLine("NVDA", 0.0, 1), copy.moveLine("NVDA", null, 1), copy.moveLine("NVDA", null, 2),
        copy.body(HarnessFollowUp(HarnessStep.ASSET, t0, symbol = "NVDA")),
        copy.body(HarnessFollowUp(HarnessStep.ASSET, t0, symbol = "NVDA", days = 4)),
        copy.body(HarnessFollowUp(HarnessStep.SECTOR, t0, symbol = "NVDA", sector = "semis")),
        copy.body(HarnessFollowUp(HarnessStep.WEEK, t0, symbol = "NVDA")),
        copy.body(HarnessFollowUp(HarnessStep.WEEK, t0, symbol = "NVDA", others = 1)),
    ) + HarnessSectors.all.map { copy.sectorTitle(it.id) }

    @Test fun nothingTheHarnessSaysPromisesOrWatches() {
        val forbidden = listOf("buy", "sell", "profit", "guarantee", "returns", "advice", "signal", "alert", "watch", "monitor", "detect",
                               "compra", "vende", "ganancia", "garantiz", "rendimiento", "consejo", "señal", "alerta", "vigil", "detect")
        val said = ArrayList<String>()
        inEveryLanguage { _, copy -> said.addAll(everything(copy)) }
        assertTrue(said.size > 150)
        for (line in said) {
            val lower = line.lowercase()
            for (word in forbidden) assertFalse("“$line” says “$word”", lower.contains(word))
            assertFalse(line, line.contains("!"))
        }
    }

    /** iOS checks its own table; here every English line the harness can say must have its row in the catalogs the app ships. */
    @Test fun everyHarnessStringHasItsFourTranslations() {
        val keys = LinkedHashMap<String, String>()
        everything(HarnessCopy({ "en-US" }) { en, es -> keys[en] = es; en })
        assertTrue("the harness says ${keys.size} things", keys.size >= 35)
        val placeholders = Regex("\\{\\d+\\}")
        for ((en, es) in keys) {
            assertEquals("es: $en", placeholders.findAll(en).map { it.value }.sorted().toList(), placeholders.findAll(es).map { it.value }.sorted().toList())
            for (language in listOf("fr", "pt", "it", "de")) {
                val row = HarnessWords.translated(language, en)
                assertNotNull("$language: $en", row)
                assertEquals("$language: $en", placeholders.findAll(en).map { it.value }.sorted().toList(), placeholders.findAll(row!!).map { it.value }.sorted().toList())
            }
        }
    }

    // Sectors

    @Test fun everySectorHasCompanyAndEachAssetOneSector() {
        val seen = HashMap<String, String>()
        for (sector in HarnessSectors.all) {
            assertTrue(sector.id, sector.members.size >= 2)
            assertNotEquals("${sector.id} has a name", sector.id, english.sectorTitle(sector.id))
            for (member in sector.members) {
                assertNotNull(member.symbol, HarnessLedger.validSymbol(member.symbol))
                assertNull("${member.symbol} is in ${seen[member.symbol]} and ${sector.id}", seen[member.symbol])
                seen[member.symbol] = sector.id
            }
        }
        assertEquals(13, HarnessSectors.all.size)
        assertEquals("semis", HarnessSectors.of("nvda")?.id)
        assertEquals("layer1", HarnessSectors.of("SOL")?.id)
        assertNull("an asset that is not listed has no sector: nothing is guessed", HarnessSectors.of("GME"))
        assertEquals("the asked asset first", "AMD", HarnessSectors.of("AMD")?.board("AMD")?.firstOrNull()?.symbol)
        assertEquals(5, HarnessSectors.of("AMD")?.board("AMD")?.size)
        assertEquals("an id nobody named is shown as it is", "made-up", english.sectorTitle("made-up"))
    }

    // The tapped payload

    private fun payload(step: String, symbol: String? = null, sector: String? = null, kind: String? = "follow-up", owner: String? = "local",
                        at: String? = t0.toString()): Map<String, String> {
        val info = LinkedHashMap<String, String>()
        info["step"] = step
        if (kind != null) info[LocalNotice.KIND] = kind
        if (symbol != null) info["symbol"] = symbol
        if (sector != null) info["sector"] = sector
        if (owner != null) info[LocalNotice.OWNER] = owner
        if (at != null) info["at"] = at
        return info
    }

    @Test fun onlyAFollowUpPayloadIsATap() {
        assertEquals(HarnessTap(HarnessStep.ASSET, "NVDA", null, owner = "local", stamp = t0), HarnessTap.from(payload("asset", symbol = "NVDA")))
        assertEquals(HarnessTap(HarnessStep.SECTOR, "NVDA", "semis", owner = "a1b2c3d4e5f60718", stamp = t0),
                     HarnessTap.from(payload("sector", symbol = "nvda", sector = "semis", owner = "a1b2c3d4e5f60718")))
        assertEquals(HarnessTap(HarnessStep.WEEK, null, null, owner = "local", stamp = t0), HarnessTap.from(payload("week")))
        assertNull(HarnessTap.from(payload("asset", symbol = "NVDA", kind = "thesis-review")))
        assertNull("no kind: not ours", HarnessTap.from(payload("asset", symbol = "NVDA", kind = null)))
        assertNull(HarnessTap.from(payload("price", symbol = "NVDA")))
        assertNull("an asset follow-up names its asset", HarnessTap.from(payload("asset")))
        assertNull(HarnessTap.from(payload("asset", symbol = "NVDA; drop")))
        assertNull(HarnessTap.from(payload("sector", symbol = "NVDA", sector = "made-up")))
        assertNull("it does not say whose it is", HarnessTap.from(payload("asset", symbol = "NVDA", owner = null)))
        assertNull(HarnessTap.from(payload("asset", symbol = "NVDA", owner = "")))
        assertNull(HarnessTap.from(payload("asset", symbol = "NVDA", owner = "x".repeat(33))))
        assertNull("it does not say when it was for", HarnessTap.from(payload("asset", symbol = "NVDA", at = null)))
        assertNull(HarnessTap.from(payload("asset", symbol = "NVDA", at = "soon")))
        assertNull(HarnessTap.from(payload("asset", symbol = "NVDA", at = "0")))
        assertNull("a reminder is never mistaken for a follow-up", HarnessTap.from(mapOf(LocalNotice.KIND to "thesis-review", "thesisId" to "abc")))
        // The tag is a digest: the same reader always gets the same one, and it never holds the account id.
        assertEquals("local", V18Reader.tag(null))
        assertEquals(V18Reader.tag("user-1"), V18Reader.tag("user-1"))
        assertNotEquals(V18Reader.tag("user-1"), V18Reader.tag("user-2"))
        assertEquals(16, V18Reader.tag("user-1").length)
        assertFalse(V18Reader.tag("user-1").contains("user"))
    }

    // The nudges

    @Test fun theOfferComesAfterAReadUntilThePersonDecides() {
        val read = NudgeRead("r1", "NVDA", "NVIDIA", true, "wait", false, t0)
        val fresh = NudgeMoment(false, t0 + 60_000L, read, 1)
        val offer = HarnessNudges.offer(fresh, HarnessMode.UNDECIDED, english)
        assertEquals("harness.offer.v1", offer?.id)
        assertEquals("Shall I keep you posted on NVDA?", offer?.text)
        assertEquals("Yes, tell me", offer?.cta)
        assertNull("they already said yes", HarnessNudges.offer(fresh, HarnessMode.ON, english))
        assertNull("they said no: never again", HarnessNudges.offer(fresh, HarnessMode.OFF, english))
        assertNull("no read yet", HarnessNudges.offer(NudgeMoment(false, t0, null, 0), HarnessMode.UNDECIDED, english))
        assertNull(HarnessNudges.offer(NudgeMoment(false, t0 + hour, read, 1), HarnessMode.UNDECIDED, english))
    }

    @Test fun theMoveHasAnIdPerAssetAndQuestionThatThePageAccepts() {
        val move = HarnessMove("PETR4.SA", "Petrobras", true, t0, 10.0, 11.0, 1)
        val nudge = HarnessNudges.nudge(move, english)
        assertEquals("harness.move.petr4.sa.20270115", nudge.id)
        assertTrue(NucleoNudge.ID_PATTERN.matches(nudge.id))
        assertEquals("PETR4.SA +10% since you asked", nudge.text)
        assertEquals("What changed?", nudge.cta)
        val longest = HarnessMove("ABCDEFGHIJKLMNOPQRS=", "x", true, t0, null, null, 1)
        assertTrue(NucleoNudge.ID_PATTERN.matches(HarnessNudges.moveId(longest)))
        val next = HarnessMove("PETR4.SA", "Petrobras", true, t0 + day, 10.0, 11.0, 1)
        assertNotEquals("a new question is a new line", nudge.id, HarnessNudges.moveId(next))
        assertNull("a move too large to be a move is no number", HarnessMove("X", "x", false, t0, 1.0, 20.0, 1).pct)
        assertNull(HarnessMove("X", "x", false, t0, 0.0, 20.0, 1).pct)
    }

    @Test fun comingBackSpeaksBeforeEverythingElseAndTheOfferBeforeTheOtherOffers() {
        assertTrue(NudgePriority.FOLLOW_UP > NudgePriority.INVITE)
        assertTrue(NudgePriority.INVITE > NudgePriority.FOLLOW_UP_OFFER)
        assertTrue(NudgePriority.FOLLOW_UP_OFFER > NudgePriority.THESES)
    }

    // The board

    @Test fun aSectorBoardStartsWithTheAssetAndReadsTheDay() {
        val board = HarnessBoard.make(HarnessTap(HarnessStep.SECTOR, "AMD", "semis"), HarnessLedger(), t0, english)
        assertEquals(HarnessBoard.Kind.Sector("semis"), board.kind)
        assertEquals("Semiconductors", board.title)
        assertEquals("Last 24 hours", board.basis)
        assertEquals(listOf("AMD", "NVDA", "TSM", "AVGO", "QCOM"), board.rows.map { it.symbol })
        val row = board.rows.first()
        assertEquals(1.2, board.change(row, 150.0, 1.2) ?: 0.0, 0.0001)
        assertNull("no number is shown for a row that could not be read", board.change(row, 150.0, null))
        assertEquals("a sector nobody named falls back to the week", HarnessBoard.Kind.Week,
                     HarnessBoard.make(HarnessTap(HarnessStep.SECTOR, "AMD", "made-up"), HarnessLedger(), t0, english).kind)
    }

    @Test fun theWeekBoardComparesWithThePriceAtTheQuestion() {
        val ledger = HarnessLedger()
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 - 9 * day, symbol = "OLD", name = "Old", isEquity = true, price = 1.0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 - 3 * day, symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 100.0))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 - 2 * day, symbol = "BTC", name = "Bitcoin", isEquity = false, price = null))
        ledger.note(HarnessEvent(HarnessEvent.Kind.ASK, t0 - day, symbol = "NVDA", name = "NVIDIA", isEquity = true, price = 120.0))
        var board = HarnessBoard.make(HarnessTap(HarnessStep.WEEK, "NVDA", null), ledger, t0, english)
        assertEquals(HarnessBoard.Kind.Week, board.kind)
        assertEquals("Your week", board.title)
        assertEquals("Since you asked", board.basis)
        assertEquals("the last seven days, latest first", listOf("NVDA", "BTC"), board.rows.map { it.symbol })
        val nvda = board.rows.first()
        assertEquals("since the first question of the week, not the day's change", 10.0, board.change(nvda, 110.0, -5.0) ?: 0.0, 0.001)
        assertNull("no price at the question: no number", board.change(board.rows[1], 60_000.0, 2.0))
        board = board.withChange("NVDA", 10.0)
        assertEquals(10.0, board.rows.first().change ?: 0.0, 0.0)
        assertNull("the other rows are untouched", board.rows[1].change)
        // With nothing asked this week the board is empty, never invented.
        assertEquals(emptyList<HarnessBoard.Row>(), HarnessBoard.make(null, HarnessLedger(), t0, english).rows)
        assertEquals("NVDA, NVIDIA, +10%", english.rowSpoken("NVDA", "NVIDIA", english.signed(10.0)))
        assertEquals("NVDA, NVIDIA", english.rowSpoken("NVDA", "NVIDIA", null))
    }

    // The app's side, on the real host

    private fun tapped(bench: V18TestBench, step: String, symbol: String?, sector: String? = null, owner: String = bench.host.readerTag): Map<String, String> =
        payload(step, symbol, sector, owner = owner, at = (bench.clock - hour).toString())

    @Test fun aTappedSectorOpensItsBoardAndATappedAssetStaysOnTheGlass() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        // A notice is only ever on the shade of someone who said yes; a tap is written only then.
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        bench.host.noteTap(tapped(bench, "asset", "NVDA"))
        runCurrent()
        assertNull("the asset's follow-up is a line on the glass, not a screen", bench.shell.sheetRoute)
        assertNull("consumed once", bench.taps.tap)
        assertEquals(listOf(HarnessStep.ASSET), center.ledger.events(HarnessEvent.Kind.OPENED).map { it.step })
        // A notification planned for another reader of this phone opens nothing and is still consumed.
        bench.host.noteTap(tapped(bench, "sector", "NVDA", "semis", owner = V18Reader.tag("someone-else")))
        runCurrent()
        assertNull(bench.shell.sheetRoute)
        assertNull(bench.taps.tap)
        assertEquals(1, center.ledger.events(HarnessEvent.Kind.OPENED).size)
        bench.host.noteTap(tapped(bench, "sector", "NVDA", "semis"))
        runCurrent()
        assertEquals(V18Routes.FOLLOW_UP, bench.shell.sheetRoute)
        assertEquals(HarnessTap(HarnessStep.SECTOR, "NVDA", "semis", owner = "local", stamp = bench.clock - hour), center.takeBoardFocus())
        assertNull("handed to the sheet once", center.takeBoardFocus())
        assertEquals(listOf(HarnessStep.ASSET, HarnessStep.SECTOR), center.ledger.events(HarnessEvent.Kind.OPENED).map { it.step })
    }

    @Test fun pickingTheQuestionBobbyWroteAfterAReadIsCountedForItsAssetWhileTheCentreMayRecord() = runTest {
        // The page shows the CIO's question as the first chip after a read; a tap is told to the host by
        // the session (the words are compared there and kept nowhere), and the centre counts it by asset.
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        bench.deliver(requestId = "r1", symbol = "NVDA")
        center.accept()
        bench.host.nextQuestionPicked("NVDA")
        val picked = center.ledger.events(HarnessEvent.Kind.PICKED)
        assertEquals(listOf<String?>("NVDA"), picked.map { it.symbol })
        assertNull("an asset and a moment: nothing else", picked.single().name)
        assertFalse("no question text in what the phone keeps", center.ledger.events.joinToString().contains("own words"))
        // Follow-ups turned off: nothing is kept, and the read itself is served as always.
        center.turnOff()
        bench.host.nextQuestionPicked("NVDA")
        assertTrue(center.ledger.events(HarnessEvent.Kind.PICKED).isEmpty())
    }

    @Test fun whoWroteTheWordsAndWhatTheQuestionNamedReachTheLedgerThroughTheHost() = runTest {
        // The session says who started each read (`ReadOrigin`) and the desk's reply says the horizon the
        // question named (`sufficiency.horizon`): both reach the ledger through the host's hook, and the
        // question's words never do.
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        fun read(id: String, symbol: String, horizon: String?): JSONObject {
            val read = bench.read(requestId = id, symbol = symbol, name = symbol)
            if (horizon != null) read.put("sufficiency", JSONObject().put("horizon", horizon))
            return read
        }
        fun asks() = center.ledger.events(HarnessEvent.Kind.ASK)
        // Before the yes a chip is kept the way a question is, and nothing of what it named is written.
        bench.host.readDelivered(read("r1", "NVDA", "long"), ReadOrigin.CHIP)
        assertEquals(listOf<HarnessEvent.Origin?>(null), asks().map { it.origin })
        assertEquals(listOf<HarnessHorizon?>(null), asks().map { it.horizon })
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertEquals("the yes writes what the read that prompted it named", listOf<HarnessHorizon?>(HarnessHorizon.LONG), asks().map { it.horizon })
        assertEquals("a question about years: the week only", listOf(HarnessStep.WEEK), center.upcoming.map { it.step })
        // With follow-ups on, each read is written with who started it.
        bench.clock += hour
        bench.host.readDelivered(read("r2", "TSLA", "week"), ReadOrigin.PERSON)
        bench.clock += hour
        bench.host.readDelivered(read("r3", "TSLA", "month"), ReadOrigin.THREAD)
        bench.clock += hour
        bench.host.readDelivered(read("r4", "AMD", "intraday"), ReadOrigin.FOLLOW_UP)
        bench.clock += hour
        bench.host.readDelivered(read("r5", "BTC", null), ReadOrigin.CHIP)
        val bobbys = HarnessEvent.Origin.FOLLOW_UP
        assertEquals(listOf<String?>("NVDA", "TSLA", "TSLA", "AMD", "BTC"), asks().map { it.symbol })
        assertEquals("a follow-up's button, a board row, the question after a read and a chip are Bobby's", listOf(null, null, null, bobbys, bobbys), asks().map { it.origin })
        assertEquals("their own second question about the read on screen", listOf(null, null, true, null, null), asks().map { it.thread })
        assertEquals(listOf(HarnessHorizon.LONG, HarnessHorizon.WEEK, HarnessHorizon.MONTH, HarnessHorizon.INTRADAY, null), asks().map { it.horizon })
        assertEquals("the chain belongs to the last question they asked in their own words", bench.clock - 2 * hour, center.ledger.question(bench.clock)?.at)
        assertEquals("TSLA", center.upcoming.firstOrNull()?.symbol)
        assertEquals("a question that named the month waits seven days", 7, center.upcoming.firstOrNull()?.days)
        // The review chosen on a save arrives with the save.
        bench.host.readSaved("r3", "TSLA", 168)
        assertEquals(listOf<Int?>(168), center.ledger.events(HarnessEvent.Kind.SAVED).map { it.horizonHours })
        assertFalse("never the question", bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, null))!!.contains("own words"))
    }

    @Test fun theThesisBookOfThisReaderIsWhatTheHarnessReads() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        fun pointers() = center.ledger.events(HarnessEvent.Kind.THESIS)
        val nvda = bench.host.theses.create(ThesisDraft("NVDA", "NVIDIA", true, ThesisHorizon.YEARS, "Data centres keep buying."), null, bench.clock - 6 * day)
        bench.host.theses.create(ThesisDraft("TSLA", "Tesla", true, null, "Storage grows."), null, bench.clock - 5 * day)
        bench.host.theses.create(ThesisDraft("BTC", "Bitcoin", false, ThesisHorizon.WEEKS, "Someone else's."), "u2", bench.clock - 5 * day)
        bench.deliver(symbol = "NVDA")
        assertTrue("undecided: no pointer is written", pointers().isEmpty())
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertEquals("this reader's active theses, and nobody else's", setOf<String?>("NVDA", "TSLA"), pointers().map { it.symbol }.toSet())
        assertEquals("years is long", HarnessHorizon.LONG, pointers().firstOrNull { it.symbol == "NVDA" }?.horizon)
        assertEquals("dated when the thesis was written", bench.clock - 6 * day, pointers().firstOrNull { it.symbol == "NVDA" }?.at)
        assertNull("no horizon was set on it", pointers().firstOrNull { it.symbol == "TSLA" }?.horizon)
        val stored = bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, null))!!
        assertFalse("a pointer: the words stay in the thesis book", stored.contains("Data centres"))
        assertFalse(stored.contains("Storage"))
        assertEquals("a thesis of years: nothing about the asset, the week only", listOf(HarnessStep.WEEK), center.upcoming.map { it.step })
        // Archived in the book: the centre hears it and plans again at once.
        bench.host.theses.archive(nvda.id, null, bench.clock)
        assertEquals(listOf<String?>("TSLA"), pointers().map { it.symbol })
        assertEquals("the question is followed up like any other", listOf(HarnessStep.ASSET, HarnessStep.WEEK), center.upcoming.map { it.step })
        // Another reader's thesis book changes nothing here.
        val before = bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, null))
        bench.host.theses.create(ThesisDraft("AMD", "AMD", true, ThesisHorizon.MONTHS, "Someone else's again."), "u2", bench.clock)
        assertEquals(before, bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, null)))
    }

    @Test fun aReadStartedFromABoardWaitsForItsSheetToClose() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        // The phone knows the next read is answered (a row asks nothing otherwise: HarnessSurfaceTest).
        center.access = { ReadAccess("free", 3, 20, 17, null, true) }
        runCurrent()
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        // From the glass: the page is told at once, with a token and the question native wrote.
        assertTrue(bench.host.startRead("NVDA", "NVIDIA", true, center.copy.changedQuestion("NVDA")))
        val first = bench.desk.events("ask.start").first()
        assertEquals("What changed in NVDA since I asked?", first.getString("question"))
        assertTrue(first.getString("token").isNotEmpty())
        // From a board row: the sheet goes first, then the page hears about the read.
        assertTrue(bench.host.present(V18Routes.FOLLOW_UP))
        assertTrue(Harness.pick(bench.host, HarnessBoard.Row("AMD", "AMD", true)))
        assertEquals("not while the sheet covers the glass", 1, bench.desk.events("ask.start").size)
        assertNull(bench.shell.sheetRoute)
        runCurrent()
        assertEquals("How does AMD look today?", bench.desk.events("ask.start").last().getString("question"))
        assertEquals("a row is acting on a follow-up", listOf<String?>("AMD"), center.ledger.events(HarnessEvent.Kind.PICKED).map { it.symbol })
        assertTrue("the page cannot open the board by itself", V18Routes.FOLLOW_UP in V18Routes.NATIVE_ONLY)
        assertFalse(V18Routes.FOLLOW_UP in V18Routes.PAGE_OPENABLE)
    }

    @Test fun theOfferOnTheGlassAsksThePhoneOnlyOnThePersonsYes() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        assertEquals(listOf("harness.move", "harness.offer"), bench.nudges.sourceKeys.filter { it.startsWith("harness") })
        assertNull("nothing to offer before a read", bench.host.nudgeJson())
        bench.deliver(symbol = "NVDA")
        assertEquals("from the first delivered read", listOf<String?>("NVDA"), center.ledger.events(HarnessEvent.Kind.ASK).map { it.symbol })
        assertEquals(120.5, center.ledger.events(HarnessEvent.Kind.ASK).first().price ?: 0.0, 0.0)
        assertFalse("never the question", bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, null))!!.contains("own words"))
        val nudge = bench.host.nudgeJson()!!
        assertEquals("harness.offer.v1", nudge.getString("id"))
        assertEquals("Shall I keep you posted on NVDA?", nudge.getString("text"))
        assertEquals("Yes, tell me", nudge.getString("cta"))
        assertEquals("drawing the offer asks nobody", 0, bench.notifier.asked)
        assertEquals("done", bench.host.nudgeAct("harness.offer.v1").getString("status"))
        assertEquals(1, bench.notifier.asked)
        assertEquals(HarnessMode.ON, center.mode)
        assertEquals("the asset, then the week: the chain that ships has no sector", setOf("v18.follow.asset", "v18.follow.week"), bench.notifier.pendingIds())
        assertEquals(bench.host.readerTag, bench.notifier.notice("v18.follow.asset")?.payload?.get(LocalNotice.OWNER))
        assertEquals(listOf("success"), bench.shell.haptics)
        assertNull("once answered it never comes back", bench.host.nudgeJson())
        bench.clock += hour
        bench.deliver(requestId = "r2", symbol = "TSLA")
        assertNull(bench.host.nudgeJson())
    }

    @Test fun comingBackTheNextDayPutsTheMoveOnTheGlassAndItsButtonAsksBobby() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        val quoted = ArrayList<String>()
        center.market = { symbol ->
            quoted.add(symbol)
            if (symbol == "NVDA") HarnessQuote(102.3, 0.4) else null
        }
        // The phone knows the next read is answered: the line's button may ask Bobby.
        center.access = { ReadAccess("free", 3, 20, 17, null, true) }
        runCurrent()
        bench.deliver(symbol = "NVDA", price = 100.0)
        bench.clock += 26 * hour
        val told = bench.desk.sessionChanges
        bench.host.appBecameActive()
        assertEquals("the page is not told from inside the app's own hook", told, bench.desk.sessionChanges)
        runCurrent()
        assertEquals("but once, right after it", told + 1, bench.desk.sessionChanges)
        assertEquals("one price, no read spent", listOf("NVDA"), quoted)
        val nudge = bench.host.nudgeJson()!!
        assertTrue(nudge.getString("id").startsWith("harness.move.nvda."))
        assertEquals("NVDA +2.3% since you asked", nudge.getString("text"))
        assertEquals("What changed?", nudge.getString("cta"))
        assertEquals("done", bench.host.nudgeAct(nudge.getString("id")).getString("status"))
        val asked = bench.desk.events("ask.start").single()
        assertEquals("What changed in NVDA since I asked?", asked.getString("question"))
        assertTrue("undecided: the tap itself is not written", center.ledger.events(HarnessEvent.Kind.PICKED).isEmpty())
        assertNull(center.move)
        assertTrue("no sheet: the glass answers", bench.shell.opened.isEmpty())
    }

    @Test fun anotherReaderNeverSeesTheLineOrTheFollowUps() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.changeAccount("u1")
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        center.market = { HarnessQuote(102.3, null) }
        runCurrent()
        bench.deliver(symbol = "NVDA", price = 100.0)
        assertEquals(HarnessCenter.Outcome.ON, center.accept())
        assertEquals(2, bench.notifier.pendingIds().size)
        bench.clock += 26 * hour
        bench.host.appBecameActive()
        runCurrent()
        assertEquals("NVDA", center.move?.symbol)
        bench.changeAccount("u2")
        runCurrent()
        assertEquals("u2", center.owner)
        assertNull(center.move)
        assertNull("the second reader's glass says nothing about the first reader's asset", bench.host.nudgeJson())
        assertTrue(bench.notifier.pendingIds().isEmpty())
        assertNull(bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, "u2")))
        assertNotNull("the first reader's ledger is still theirs", bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, "u1")))
    }

    @Test fun aFollowUpThatComesDueWhileTheAppIsInFrontStaysOffTheShade() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        bench.deliver(symbol = "NVDA", price = 100.0)
        center.accept()
        val due = bench.notifier.notice("v18.follow.asset")!!
        bench.clock = due.fireAtEpochMs + 60_000L
        bench.shell.active = false
        assertTrue("in the background the phone shows it", bench.host.allowsDueNotice(due.payload))
        assertTrue(center.ledger.events(HarnessEvent.Kind.SENT).isEmpty())
        bench.shell.active = true
        assertFalse("in front, the glass says it instead", bench.host.allowsDueNotice(due.payload))
        assertEquals(listOf(HarnessStep.ASSET), center.ledger.events(HarnessEvent.Kind.SENT).map { it.step })
        assertEquals("NVDA", center.move?.symbol)
        assertTrue("a notice that is not a follow-up is none of the harness's business",
                   bench.host.allowsDueNotice(mapOf(LocalNotice.KIND to HarnessCenter.KIND, "step" to "price")))
    }

    /** Android has no "language changed" hook: the next drawing of the glass notices, and the lines are written again after it. */
    @Test fun anotherLanguageRewritesTheLockScreenOnceTheGlassIsDrawnAgain() = runTest {
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        bench.deliver(symbol = "NVDA")
        center.accept()
        assertEquals("NVDA: back to your question.", bench.notifier.notice("v18.follow.asset")?.body)
        bench.desk.language = "es"
        bench.host.nudgeJson()
        assertEquals("drawing the glass only reads", "NVDA: back to your question.", bench.notifier.notice("v18.follow.asset")?.body)
        runCurrent()
        assertEquals("NVDA: de vuelta a tu pregunta.", bench.notifier.notice("v18.follow.asset")?.body)
        assertEquals(2, bench.notifier.pendingIds().size)
        assertFalse(center.wordsAreStale)
    }

    @Test fun nothingIsKeptBeforeTheRiskNoticeAndTheAppsHooksEraseWhatIs() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        HarnessNudges.register(bench.host)
        val center = Harness.center(bench.host)
        runCurrent()
        bench.deliver(symbol = "NVDA")
        assertTrue("nothing is recorded before the risk notice", center.ledger.isEmpty)
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        bench.deliver(symbol = "NVDA")
        bench.host.readSaved("r1", "NVDA")
        assertTrue("undecided: a save is not written", center.ledger.events(HarnessEvent.Kind.SAVED).isEmpty())
        center.accept()
        assertEquals("the yes writes the save of the read that prompted it", listOf<String?>("NVDA"), center.ledger.events(HarnessEvent.Kind.SAVED).map { it.symbol })
        assertEquals(2, bench.notifier.pendingIds().size)
        // Memory's "Delete everything".
        bench.host.eraseEverything()
        assertTrue(center.ledger.isEmpty)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertTrue(bench.notifier.pendingIds().isEmpty())
        assertNull(bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, null)))
        // A withdrawn risk notice.
        bench.deliver(requestId = "r2", symbol = "TSLA")
        center.accept()
        assertEquals(2, bench.notifier.pendingIds().size)
        bench.desk.riskNotice = RiskNotice.WITHDRAWN
        bench.host.consentWithdrawn()
        assertTrue(center.ledger.isEmpty)
        assertEquals(HarnessMode.UNDECIDED, center.mode)
        assertTrue(bench.notifier.pendingIds().isEmpty())
        // The account is deleted, then signed out.
        bench.desk.riskNotice = RiskNotice.ACCEPTED
        bench.changeAccount("u1")
        bench.deliver(requestId = "r3", symbol = "AAPL")
        center.accept()
        assertNotNull(bench.store.getString(HarnessStore.key(HarnessStore.PREFIX, "u1")))
        assertEquals(HarnessMode.ON.raw, bench.store.getString(HarnessStore.key(HarnessStore.MODE_PREFIX, "u1")))
        bench.host.accountDeleted("u1")
        bench.changeAccount(null)
        runCurrent()
        for (prefix in listOf(HarnessStore.PREFIX, HarnessStore.MODE_PREFIX, HarnessStore.PLAN_PREFIX)) {
            assertNull(prefix, bench.store.getString(HarnessStore.key(prefix, "u1")))
        }
        assertTrue(bench.notifier.pendingIds().isEmpty())
        assertTrue(center.ledger.isEmpty)
    }

    @Test fun turningFollowUpsOffTakesTheMoveLinesOutOfTheHistoryOfWhatTheGlassSaid() = runTest {
        // A move line's id carries the asset and the day it was asked about. Once the ledger is
        // erased, that history must not be what still names them.
        val bench = V18TestBench(backgroundScope)
        HarnessNudges.register(bench.host)
        runCurrent()
        val center = Harness.center(bench.host)
        bench.deliver(symbol = "NVDA")
        runCurrent()
        assertEquals(listOf("NVDA"), center.kept.value)
        bench.nudges.retire("harness.move.nvda.20261005")
        bench.nudges.retire(HarnessNudges.OFFER_ID)
        val key = NudgeCenter.storeKey(null)
        assertTrue((bench.store.getString(key) ?: "").contains("nvda"))

        center.turnOff()
        runCurrent()
        assertFalse("the asset and the day are gone from the history too", (bench.store.getString(key) ?: "").contains("nvda"))
        assertTrue("the answered offer names nothing and stays answered", bench.nudges.isRetired(HarnessNudges.OFFER_ID))
        assertTrue(center.kept.value.isEmpty())

        // The app speaking another language is heard at once, not the next time the glass draws.
        val spoken = V18TestBench(backgroundScope)
        spoken.notifier.permission = xyz.bobbyprotocol.android.v18.notify.LocalNotifier.Permission.ALLOWED
        HarnessNudges.register(spoken.host)
        runCurrent()
        val harness = Harness.center(spoken.host)
        spoken.deliver(symbol = "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, harness.accept())
        assertEquals("en", harness.wordsIn)
        spoken.desk.language = "es"
        assertTrue(harness.wordsAreStale)
        spoken.host.languageChanged()
        assertEquals("the lines the phone holds are written again in the new language", "es", harness.wordsIn)
        assertFalse(harness.wordsAreStale)
    }
}
