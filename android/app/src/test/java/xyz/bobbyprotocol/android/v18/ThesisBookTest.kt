package xyz.bobbyprotocol.android.v18

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** The thesis book's rules, the same as on iOS (ThesisBookTests.swift). */
class ThesisBookTest {
    private val store = MemoryKeyValueStore()
    private var next = 0
    private val book = ThesisBook(store) { "ID-%04d".format(next++) }
    private val t0 = 1_800_000_000_000L
    private val day = 86_400_000L

    private fun draft(symbol: String, why: String = "Why I am looking at $symbol", price: Double? = 100.0) =
        ThesisDraft(symbol = symbol, name = "$symbol Inc", isEquity = true, horizon = ThesisHorizon.MONTHS, hypothesis = why,
                    worry = "  A  pause in   spending ", changeMind = "", sourceRequestId = "req-$symbol", price = price,
                    asOf = "2026-10-07T12:00:00Z", verdict = "wait")

    private inline fun <reified E : ThesisBook.BookError> expect(block: () -> Unit): E {
        try {
            block()
        } catch (error: ThesisBook.BookError) {
            if (error is E) return error
            fail("unexpected error: $error")
        }
        fail("expected ${E::class.simpleName}")
        throw IllegalStateException()
    }

    @Test fun aThesisIsThePersonsWordsTrimmedAndCappedWithALowercaseId() {
        val long = "x".repeat(300)
        val thesis = book.create(draft("nvda", why = "  Demand   keeps\n growing  "), owner = null, now = t0)
        assertEquals("id-0000", thesis.id)
        assertEquals("NVDA", thesis.symbol)
        assertEquals("Demand keeps growing", thesis.hypothesis)
        assertEquals("A pause in spending", thesis.worry)
        assertEquals(SavedThesis.Status.ACTIVE, thesis.status)
        assertEquals(listOf(ThesisRevision.Kind.CREATED), thesis.revisions.map { it.kind })
        assertEquals(ThesisBook.TEXT_LIMIT, book.create(draft("btc", why = long), null, t0).hypothesis.length)
        assertEquals("an emoji is never cut in half", 280, ThesisBook.clean("😀".repeat(300)).codePointCount(0, ThesisBook.clean("😀".repeat(300)).length))
        expect<ThesisBook.BookError.EmptyHypothesis> { book.create(draft("eth", why = "   "), null, t0) }
        assertEquals(thesis, book.thesis(thesis.id, null))
    }

    @Test fun threeActiveAtMostAndOnePerAsset() {
        book.create(draft("NVDA"), "u1", t0)
        book.create(draft("BTC"), "u1", t0 + 1)
        val third = book.create(draft("SPY"), "u1", t0 + 2)
        val clash = expect<ThesisBook.BookError.AlreadyActive> { book.create(draft("spy"), "u1", t0 + 3) }
        assertEquals(third.id, clash.id)
        expect<ThesisBook.BookError.LimitReached> { book.create(draft("ETH"), "u1", t0 + 3) }
        assertFalse(book.canAddActive("u1"))
        assertTrue("another account has its own three", book.canAddActive("u2"))
        assertTrue(book.all("u2").isEmpty())

        book.archive(third.id, "u1", t0 + 4)
        assertEquals(listOf("BTC", "NVDA"), book.active("u1").map { it.symbol })
        val again = book.create(draft("SPY", why = "A second look"), "u1", t0 + 6)
        expect<ThesisBook.BookError.AlreadyActive> { book.reactivate(third.id, "u1", t0 + 7) }
        book.archive(again.id, "u1", t0 + 8)
        val eth = book.create(draft("ETH"), "u1", t0 + 9)
        expect<ThesisBook.BookError.LimitReached> { book.reactivate(third.id, "u1", t0 + 10) }
        book.archive(eth.id, "u1", t0 + 11)
        assertEquals(SavedThesis.Status.ACTIVE, book.reactivate(third.id, "u1", t0 + 12).status)
        assertEquals("an archived thesis that is already active again stays as it is", SavedThesis.Status.ACTIVE, book.reactivate(third.id, "u1", t0 + 13).status)
        expect<ThesisBook.BookError.NotFound> { book.keep("missing", "u1", t0) }
    }

    @Test fun whereAThesisStartedIsOnlyWhatWasRecordedWhenItWasWritten() {
        val priced = book.create(draft("NVDA", price = 120.5), null, t0)
        assertEquals(SavedThesis.StartingPoint(120.5, t0), priced.startingPoint)
        val bare = book.create(draft("BTC", price = null), null, t0)
        assertNull(bare.startingPoint)

        val reviewed = book.recordReview(bare.id, null, 64_250.0, "2026-10-09T12:00:00Z", "review",
                                         listOf(" Above its   average ", "", "b", "c", "d", "e", "f", "g"), listOf("Momentum cooled"), emptyList(), t0 + 2 * day)
        assertNull("a later review's price is never borrowed as the origin", reviewed.startingPoint)
        assertEquals(t0 + 2 * day, reviewed.lastReviewedAtMillis)
        val review = reviewed.lastReview
        assertNotNull(review)
        assertEquals(listOf("Above its average", "b", "c", "d", "e", "f"), review?.supports)
        assertEquals("review", review?.verdict)
        assertEquals(64_250.0, review?.price ?: 0.0, 0.0)
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.REVIEWED, ThesisRevision.Kind.KEPT),
                     book.keep(bare.id, null, t0 + 3 * day).revisions.map { it.kind })
    }

    @Test fun anEditThatChangesNothingRecordsNothingAndHistoryKeepsItsFirstEntry() {
        val thesis = book.create(draft("NVDA"), null, t0)
        val same = book.edit(thesis.id, null, ThesisHorizon.MONTHS, thesis.hypothesis, thesis.worry, thesis.changeMind, t0 + day)
        assertEquals(thesis, same)
        expect<ThesisBook.BookError.EmptyHypothesis> { book.edit(thesis.id, null, null, " ", "", "", t0 + day) }
        val edited = book.edit(thesis.id, null, ThesisHorizon.YEARS, "New words", "", "Two bad quarters", t0 + day)
        assertEquals(ThesisHorizon.YEARS, edited.horizon)
        assertEquals(t0 + day, edited.updatedAtMillis)
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.EDITED), edited.revisions.map { it.kind })

        var last = edited
        for (i in 1..40) last = book.keep(thesis.id, null, t0 + day + i)
        assertEquals(ThesisBook.REVISION_LIMIT, last.revisions.size)
        assertEquals("where it started is always kept", ThesisRevision.Kind.CREATED, last.revisions.first().kind)
        assertEquals(t0 + day + 40, last.revisions.last().atMillis)
    }

    @Test fun archivedThesesFallOffAfterTwentyAndDeletionIsPerOwner() {
        for (i in 0 until 23) {
            val thesis = book.create(draft("S$i"), "u1", t0 + i)
            book.archive(thesis.id, "u1", t0 + 100 + i)
        }
        val archived = book.archived("u1")
        assertEquals(ThesisBook.ARCHIVED_LIMIT, archived.size)
        assertEquals("the most recently archived first", "S22", archived.first().symbol)
        assertFalse("the oldest three fell off", archived.any { it.symbol == "S0" || it.symbol == "S2" })

        book.create(draft("NVDA"), "u2", t0)
        book.delete(archived.first().id, "u1")
        assertEquals(19, book.all("u1").size)
        book.deleteAll("u1")
        assertTrue(book.all("u1").isEmpty())
        assertEquals(1, book.all("u2").size)
        ThesisBook.forgetOwner("u2", store)
        assertTrue(book.all("u2").isEmpty())
    }

    @Test fun thesesWrittenBeforeSigningInAreOfferedOncePerAccountAndMoveWithinItsLimits() {
        val nvda = book.create(draft("NVDA"), null, t0)
        book.create(draft("BTC"), null, t0 + 1)
        assertEquals(2, book.pendingLocalCount("u1"))
        book.declineLocal("u1")
        assertEquals("\"Not mine\" is remembered", 0, book.pendingLocalCount("u1"))
        assertEquals("and cannot be undone by a later call", 0, book.adoptLocal("u1"))
        assertEquals(2, book.all(null).size)

        // u2 already holds three active theses, one of them on NVDA.
        book.create(draft("NVDA", why = "My own NVDA view"), "u2", t0 + 2)
        book.create(draft("SPY"), "u2", t0 + 3)
        book.create(draft("ETH"), "u2", t0 + 4)
        assertEquals("another account has its own answer to give", 2, book.pendingLocalCount("u2"))
        assertEquals(2, book.adoptLocal("u2", t0 + 5))
        assertTrue("they left the guest book", book.all(null).isEmpty())
        assertEquals(3, book.active("u2").size)
        val moved = book.archived("u2")
        assertEquals("no room and one clash: both arrive archived", setOf("NVDA", "BTC"), moved.map { it.symbol }.toSet())
        assertEquals(nvda.hypothesis, moved.first { it.symbol == "NVDA" }.hypothesis)
        assertEquals(ThesisRevision.Kind.ARCHIVED, moved.first().revisions.last().kind)
        assertEquals("an account is asked once", 0, book.pendingLocalCount("u2"))
        assertEquals(0, book.adoptLocal("u2"))

        ThesisBook.forgetOwner("u1", store)
        assertEquals("a deleted account's answer leaves with it", 0, book.pendingLocalCount("u1"))
    }

    @Test fun listenersHearEveryChangeWithTheOwnerThatChanged() {
        val heard = ArrayList<String>()
        val stop = book.addListener { heard.add(it) }
        val thesis = book.create(draft("NVDA"), "u1", t0)
        book.keep(thesis.id, "u1", t0 + 1)
        book.create(draft("BTC"), null, t0)
        assertEquals(listOf("v18.theses.u1", "v18.theses.u1", "v18.theses.local"), heard)
        stop()
        book.deleteAll("u1")
        assertEquals(3, heard.size)
        assertEquals("v18.theses.adoption.u1", ThesisBook.adoptionKey("u1"))
    }

    @Test fun whatIsStoredSurvivesANewBookOnTheSameStore() {
        val thesis = book.create(draft("NVDA", price = 120.5), "u1", t0)
        book.recordReview(thesis.id, "u1", 131.2, "2026-10-07T12:00:00Z", "review", listOf("a"), listOf("b"), listOf("c"), t0 + day)
        val reopened = ThesisBook(store).thesis(thesis.id, "u1")
        assertEquals(book.thesis(thesis.id, "u1"), reopened)
        assertEquals(ThesisHorizon.MONTHS, reopened?.horizon)
        assertEquals("req-NVDA", reopened?.sourceRequestId)
        assertEquals(listOf("c"), reopened?.lastReview?.unknowns)
        assertEquals(SavedThesis.StartingPoint(120.5, t0), reopened?.startingPoint)
    }
}
