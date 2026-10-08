package xyz.bobbyprotocol.android.v18.theses

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgePriority
import xyz.bobbyprotocol.android.v18.NudgeRead
import xyz.bobbyprotocol.android.v18.NudgeSource
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.V18Routes
import xyz.bobbyprotocol.android.v18.V18TestBench

/**
 * Theses on the glass (ios/Bobby/Tests/ThesisNudgeTests.swift): the two things Bobby may say,
 * read from the thesis book and the last read only, with ids the page can send back and lines
 * that fit the glass in six languages.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ThesisNudgeTest {
    private val book = ThesisBook(MemoryKeyValueStore())
    private val words = CatalogWords()
    /** 2026-10-07T12:00:00Z, a Wednesday of ISO week 41. */
    private val now = 1_791_374_400_000L
    private val day = 86_400_000L
    private val requestId = "0A1B2C3D-1111-4222-8333-444455556666"

    private fun moment(read: NudgeRead? = null, at: Long = now) = NudgeMoment(false, at, read, if (read == null) 0 else 1)

    private fun read(symbol: String = "NVDA", requestId: String = this.requestId, saved: Boolean = true, minutesAgo: Double = 1.0) =
        NudgeRead(requestId, symbol, symbol, true, "wait", saved, now - (minutesAgo * 60_000).toLong())

    private fun seed(symbol: String, daysAgo: Double, reviewedDaysAgo: Double? = null, owner: String? = null, into: ThesisBook = book,
                     from: Long = now): SavedThesis {
        val thesis = into.create(ThesisDraft(symbol = symbol, name = symbol, isEquity = true, horizon = null, hypothesis = "Why $symbol", price = 100.0),
                                 owner, from - (daysAgo * day).toLong())
        if (reviewedDaysAgo == null) return thesis
        return into.recordReview(thesis.id, owner, 101.0, null, "wait", emptyList(), emptyList(), emptyList(), from - (reviewedDaysAgo * day).toLong())
    }

    private fun candidate(moment: NudgeMoment, owner: String? = null): NucleoNudge? = ThesisNudges.candidate(moment, book, owner, words)

    private fun matchesBridgePattern(id: String?): Boolean = id != null && NucleoNudge.ID_PATTERN.matches(id)

    private fun head(thesis: SavedThesis): String = thesis.id.filter { it != '-' }.take(8)

    // a. Write down why

    @Test fun rightAfterSavingAReadOnAnAssetWithNoThesisBobbyOffersToWriteOne() {
        val nudge = candidate(moment(read()))
        assertEquals("the first eight of the request id, lowercased", "theses.write.0a1b2c3d", nudge?.id)
        assertEquals("Write down why, for next time", nudge?.text)
        assertEquals("Write my thesis", nudge?.cta)
        assertTrue(matchesBridgePattern(nudge?.id))
        assertEquals("the tap finds the whole request id", requestId, ThesisNudges.target("theses.write.0a1b2c3d"))
    }

    @Test fun nothingIsOfferedForAReadThatWasNotSavedOrIsNoLongerFresh() {
        assertNull(candidate(moment(read(saved = false))))
        assertNull(candidate(moment(null)))
        assertNull("hours later it is no longer 'right after'", candidate(moment(read(minutesAgo = 6 * 60 + 1.0))))
        assertNotNull(candidate(moment(read(minutesAgo = 5 * 60.0))))
        assertNull("a read dated after this moment is not this moment's read", candidate(moment(read(minutesAgo = -5.0))))
        assertNull("a request id that leaves no usable id is never served", candidate(moment(read(requestId = "----"))))
    }

    @Test fun anAssetThatAlreadyHasAnActiveThesisIsNotOfferedAnotherButAnArchivedOneIs() {
        val nvda = seed("NVDA", 2.0)
        assertNull("one thesis per asset, whatever the case of the symbol", candidate(moment(read("nvda"))))
        assertEquals("theses.write.0a1b2c3d", candidate(moment(read("BTC")))?.id)
        book.archive(nvda.id, null, now)
        assertNotNull(candidate(moment(read("NVDA"))))
        seed("NVDA", 1.0, owner = "u1")
        assertNotNull("another account's thesis is not this reader's", candidate(moment(read("NVDA"))))
        assertNull(candidate(moment(read("NVDA")), owner = "u1"))
    }

    @Test fun eachSavedReadGetsItsOwnOffer() {
        val first = candidate(moment(read(requestId = "aaaaaaaa-0000-4000-8000-000000000000")))
        val second = candidate(moment(read(requestId = "bbbbbbbb-0000-4000-8000-000000000000")))
        assertNotNull(first)
        assertNotEquals("a tapped offer is retired; the next saved read may offer again", first?.id, second?.id)
    }

    // b. Come back to it

    @Test fun aThesisAWeekOrMoreWithoutAReviewIsBroughtBack() {
        val thesis = seed("NVDA", 30.0, reviewedDaysAgo = 9.0)
        val nudge = candidate(moment())!!
        assertEquals("theses.due.${head(thesis)}.2026w41", nudge.id)
        assertTrue(matchesBridgePattern(nudge.id))
        assertEquals("Your NVDA thesis: 9 days since review", nudge.text)
        assertEquals("Review", nudge.cta)
        assertEquals(thesis.id, ThesisNudges.target(nudge.id))
    }

    @Test fun aThesisNeverReviewedCountsFromTheDayItWasWrittenAndSaysSo() {
        seed("BTC", 6.9)
        assertNull("not yet a week", candidate(moment()))
        seed("SAP.DE", 12.0)
        assertEquals("never 'since review' for a thesis that had none", "Your SAP.DE thesis: 12 days, not reviewed yet", candidate(moment())?.text)
    }

    @Test fun aThesisReviewedThisWeekIsLeftAlone() {
        seed("NVDA", 40.0, reviewedDaysAgo = 6.5)
        assertNull(candidate(moment()))
        assertNotNull("it comes due on the seventh day", candidate(moment(at = now + day)))
    }

    @Test fun theMostOverdueThesisSpeaksAndArchivedOnesNever() {
        seed("NVDA", 30.0, reviewedDaysAgo = 8.0)
        val oldest = seed("BTC", 21.0)
        val archived = seed("TSLA", 90.0)
        book.archive(archived.id, null, now - 80 * day)
        seed("AAPL", 50.0, owner = "u1")
        assertEquals(oldest.id, ThesisNudges.target(candidate(moment())!!.id))
        assertEquals("Your BTC thesis: 21 days, not reviewed yet", candidate(moment())?.text)
        assertEquals("each account hears only about its own book", "Your AAPL thesis: 50 days, not reviewed yet", candidate(moment(), owner = "u1")?.text)
        assertNull(candidate(moment(), owner = "u2"))
    }

    @Test fun theDueIdNamesTheWeekSoItCanComeBackAnotherWeek() {
        val thesis = seed("NVDA", 30.0)
        val thisWeek = candidate(moment())!!.id
        val sameWeek = candidate(moment(at = now + 2 * day))!!.id
        val nextWeek = candidate(moment(at = now + 7 * day))!!.id
        assertEquals("the same nudge all week: a tap retires it for the week", thisWeek, sameWeek)
        assertNotEquals(thisWeek, nextWeek)
        assertTrue(nextWeek.endsWith(".2026w42"))
        assertEquals("2027-01-01 belongs to ISO week 53 of 2026", "2026w53", ThesisNudges.isoWeek(1_798_761_600_000L))
        assertEquals(thisWeek, ThesisNudges.dueId(thesis.id, now))
        assertNull(ThesisNudges.dueId("", now))
        assertEquals("ids are lowercase whatever the book wrote", "theses.due.abc12345.2026w41", ThesisNudges.dueId("ABC1-2345-ZZ", now))
    }

    @Test fun writingComesBeforeReviewing() {
        seed("BTC", 20.0)
        assertEquals("the read the person just saved is the fresher thought", "theses.write.0a1b2c3d", candidate(moment(read("NVDA")))?.id)
        assertTrue("an asset that has its thesis goes straight to the review", candidate(moment(read("BTC")))?.id?.startsWith("theses.due.") == true)
    }

    // Through the centre and the host

    @Test fun theSourceSpeaksThroughTheCentreAtTheThesesPriority() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.clock = now
        ThesisNudges.register(bench.host)
        bench.nudges.register(NudgeSource("credits", NudgePriority.CREDITS, { NucleoNudge("credits.low", "2 reads left", "See") }, { }))
        assertEquals(listOf("theses", "credits"), bench.nudges.sourceKeys)
        assertEquals("with nothing to say about theses, the next source speaks", "credits.low", bench.host.currentNudge()?.id)
        seed("NVDA", 30.0, into = bench.host.theses)
        assertTrue(bench.host.currentNudge()?.id?.startsWith("theses.due.") == true)
        bench.deliver(requestId = requestId, symbol = "AAPL", name = "Apple")
        assertTrue("a read that is not saved is no reason to write", bench.host.currentNudge()?.id?.startsWith("theses.due.") == true)
        bench.host.readSaved(requestId, "AAPL")
        assertEquals("theses.write.0a1b2c3d", bench.host.currentNudge()?.id)
        assertEquals(70, NudgePriority.THESES)
        assertEquals("theses", ThesisNudges.KEY)
    }

    @Test fun aWriteOfferTheCentreWouldRefuseDoesNotStandInFrontOfAThesisThatIsDue() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.clock = now
        ThesisNudges.register(bench.host)
        val overdue = seed("NVDA", 12.0, reviewedDaysAgo = 12.0, into = bench.host.theses)
        bench.deliver(requestId = requestId, symbol = "AAPL", name = "Apple")
        bench.host.readSaved(requestId, "AAPL")

        val offer = bench.host.currentNudge()!!
        assertEquals("the fresh read speaks first", "theses.write.0a1b2c3d", offer.id)
        // The person taps it (the editor opens) and closes it: the offer is retired for good.
        assertEquals("done", bench.host.nudgeAct(offer.id).getString("status"))
        assertEquals(listOf(V18Routes.THESIS_EDITOR), bench.shell.opened)
        assertEquals("the editor opens on a draft from that read", requestId.lowercase(), bench.host.focus.draftRequestId?.lowercase())
        assertTrue(bench.nudges.isRetired(offer.id))
        bench.closeSheet()
        bench.host.focus.clear()

        bench.clock = now + 20 * 60_000L   // past the quiet quarter of an hour, still inside the six-hour window
        assertEquals("the read is still fresh", offer.id, ThesisNudges.write(bench.nudges.moment(false), bench.host.theses, null, words)?.id)
        val next = bench.host.currentNudge()
        assertNotNull("the retired offer must not silence the source", next)
        assertEquals(ThesisNudges.dueId(overdue.id, bench.clock), next?.id)
        assertEquals("Your NVDA thesis: 12 days since review", next?.text)

        // The same when the offer was only shown twice and is resting, on a host of its own.
        val resting = V18TestBench(backgroundScope)
        resting.clock = now
        ThesisNudges.register(resting.host)
        seed("NVDA", 12.0, reviewedDaysAgo = 12.0, into = resting.host.theses)
        resting.deliver(requestId = requestId, symbol = "AAPL", name = "Apple")
        resting.host.readSaved(requestId, "AAPL")
        assertEquals(offer.id, resting.host.currentNudge()?.id)
        assertEquals(1, resting.host.nudgeSeen(offer.id).getInt("count"))
        resting.clock = now + 11 * 60_000L
        assertEquals(offer.id, resting.host.currentNudge()?.id)
        assertEquals(2, resting.host.nudgeSeen(offer.id).getInt("count"))
        // The second showing keeps its time on the glass; after it, the offer rests.
        resting.clock += resting.nudges.policy.showingGapMillis + 1_000L
        assertFalse(resting.nudges.eligible(offer.id, resting.clock))
        assertTrue(resting.host.currentNudge()?.id?.startsWith("theses.due.") == true)

        // Without the centre's rule (the default), writing still comes first.
        assertEquals(offer.id, candidate(moment(read("AAPL")))?.id)
    }

    @Test fun aTapOnADueThesisOpensItsReviewAndATapOnAReadThatIsGoneOpensTheList() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.clock = now
        ThesisNudges.register(bench.host)
        val thesis = seed("NVDA", 30.0, into = bench.host.theses)
        val due = bench.host.currentNudge()!!
        assertEquals("done", bench.host.nudgeAct(due.id).getString("status"))
        assertEquals(listOf(V18Routes.THESIS_REVIEW), bench.shell.opened)
        assertEquals("the review opens on that thesis", thesis.id, bench.host.focus.thesisId)
        assertNull(bench.host.focus.draftRequestId)
        assertTrue(bench.nudges.isRetired(due.id))
        assertEquals("the nudge itself writes nothing", thesis, bench.host.theses.thesis(thesis.id, null))

        bench.closeSheet()
        bench.host.focus.clear()
        bench.clock = now + 3_600_000L
        // A saved read the host no longer holds (it was never delivered to this host).
        bench.nudges.noteRead(NudgeRead(requestId, "AAPL", "Apple", true, "wait", true, now + 3_500_000L))
        val write = bench.host.currentNudge()!!
        assertEquals("theses.write.0a1b2c3d", write.id)
        assertEquals("done", bench.host.nudgeAct(write.id).getString("status"))
        assertEquals("the host no longer holds that read: the list explains how to start", V18Routes.THESES, bench.shell.opened.last())
        assertNull("no stale hand-off is left behind", bench.host.focus.draftRequestId)
        assertNull(bench.host.focus.thesisId)
    }

    @Test fun aTapOnANudgeThisSourceNeverServedOpensTheList() = runTest {
        val bench = V18TestBench(backgroundScope)
        bench.host.focus.thesisId = "left-over"
        ThesisNudges.act(NucleoNudge("theses.due.unknown00.2026w01", "A line", "Review"), bench.host)
        assertEquals(listOf(V18Routes.THESES), bench.shell.opened)
        assertNull("an older hand-off is never inherited", bench.host.focus.thesisId)
    }

    // Copy limits in six languages

    @Test fun everyLineAndButtonFitsTheGlassInSixLanguages() {
        val symbols = listOf("X", "BTC", "NVDA", "SAP.DE", "PETR4.SA", "BRK.B", "W".repeat(20))
        words.inEveryLanguage { language ->
            val write = candidate(moment(read()))
            assertNotNull(language, write)
            assertTrue("$language: ${write?.text}", (write?.text?.length ?: 99) <= NucleoNudge.TEXT_LIMIT)
            assertTrue("$language: ${write?.cta}", (write?.cta?.length ?: 99) <= NucleoNudge.CTA_LIMIT)
            assertTrue(language, words.text("Review", "Revisar").length <= NucleoNudge.CTA_LIMIT)
            for (symbol in symbols) {
                for (days in listOf(7, 9, 30, 365, 9_999)) {
                    for (reviewed in listOf(true, false)) {
                        val text = ThesisNudges.dueText(symbol, days, reviewed, words)
                        assertTrue("$language: $text", text.length <= NucleoNudge.TEXT_LIMIT)
                        assertTrue("$language: $text", text.contains(days.toString()))
                        assertFalse("$language: an unfilled placeholder in $text", text.contains("{"))
                    }
                }
            }
            // The everyday case names the asset in every language.
            assertTrue(language, ThesisNudges.dueText("NVDA", 9, true, words).contains("NVDA"))
            assertTrue(language, ThesisNudges.dueText("SAP.DE", 14, false, words).contains("SAP.DE"))
        }
    }

    @Test fun theLineDropsTheAssetNameBeforeItWouldBeCut() {
        val long = "W".repeat(20)
        assertEquals("Your thesis: 120 days since review", ThesisNudges.dueText(long, 120, true, words))
        assertEquals("Your thesis: 120 days, not reviewed yet", ThesisNudges.dueText(long, 120, false, words))
    }
}
