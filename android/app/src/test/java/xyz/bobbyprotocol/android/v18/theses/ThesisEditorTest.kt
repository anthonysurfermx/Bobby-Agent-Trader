package xyz.bobbyprotocol.android.v18.theses

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.NudgeRead
import xyz.bobbyprotocol.android.v18.ReadSummary
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.ThesisRevision
import xyz.bobbyprotocol.android.v18.V18Focus
import xyz.bobbyprotocol.android.v18.V18TestBench

/**
 * Writing a thesis (ios/Bobby/Tests/ThesisEditorTests.swift). These pin what the editor promises:
 * Bobby's draft is only a suggestion on screen, nothing is stored until Save, the words saved are
 * the words shown, and every reason a Save cannot happen has its own state instead of a silent
 * failure.
 */
class ThesisEditorTest {
    private val store = MemoryKeyValueStore()
    private val book = ThesisBook(store)
    private val events = ThesisEvents()
    private val saved = ArrayList<String>()
    private var user: String? = "account-a"
    private var epoch = 1L
    private val t0 = 1_800_000_000_000L
    private val day = 86_400_000L

    init {
        events.onSaved { saved.add(it) }
    }

    private fun read(symbol: String = "NVDA", why: String? = "Price holds above its 50-day average.", risk: String? = "A close below support.",
                     watch: String? = "A move back under the average.", price: Double? = 120.5, verdict: String = "wait") = ReadSummary(
        requestId = "0a1b2c3d-1111-4222-8333-444455556666", symbol = symbol, name = if (symbol == "NVDA") "NVIDIA" else symbol, isEquity = true,
        verdict = verdict, price = price, asOf = "2026-10-07T12:00:00Z", headline = "A headline", why = why, risk = risk, watch = watch)

    private fun model(source: ThesisEditorModel.Source) = ThesisEditorModel(source, book, { user }, { epoch }, { t0 }, events)
    private fun draft(read: ReadSummary = read()) = model(ThesisEditorModel.Source.Read(read))
    private fun editor(thesis: SavedThesis) = model(ThesisEditorModel.Source.Existing(thesis))

    private fun seed(symbol: String, owner: String? = "account-a"): SavedThesis = book.create(
        ThesisDraft(symbol = symbol, name = symbol, isEquity = true, horizon = ThesisHorizon.MONTHS, hypothesis = "Why $symbol", worry = "Worry",
                    changeMind = "Change", price = 10.0, asOf = "2026-10-01T12:00:00Z", verdict = "wait"), owner, t0 - day)

    private fun created(outcome: ThesisEditorModel.Outcome): SavedThesis {
        if (outcome is ThesisEditorModel.Outcome.Created) return outcome.thesis
        fail("expected a new thesis, got $outcome")
        throw IllegalStateException()
    }

    private fun edited(outcome: ThesisEditorModel.Outcome): SavedThesis {
        if (outcome is ThesisEditorModel.Outcome.Edited) return outcome.thesis
        fail("expected an edit, got $outcome")
        throw IllegalStateException()
    }

    private fun blocked(problem: ThesisEditorModel.Problem) = ThesisEditorModel.Outcome.Blocked(problem)

    // The draft

    @Test fun bobbysDraftFillsTheThreeFieldsFromTheReadAndSaysItIsADraft() {
        val model = draft()
        assertEquals("Price holds above its 50-day average.", model.hypothesis)
        assertEquals("A close below support.", model.worry)
        assertEquals("A move back under the average.", model.changeMind)
        assertNull("the horizon is the person's pick and never guessed", model.horizon)
        assertTrue(model.draftedByBobby)
        assertTrue(model.isNew)
        assertEquals("NVDA", model.symbol)
        assertEquals("NVIDIA", model.name)
        assertEquals(120.5, model.startingPrice!!, 0.0)
    }

    @Test fun aReadWithoutASynthesisStartsEmptyAndClaimsNoDraft() {
        val model = draft(read(why = null, risk = null, watch = null))
        assertEquals(listOf("", "", ""), listOf(model.hypothesis, model.worry, model.changeMind))
        assertFalse(model.draftedByBobby)
        assertFalse(model.canSave)
    }

    @Test fun theDraftNeverSavesByItself() {
        val model = draft()
        model.hypothesis = "I rewrote this in my own words"
        model.worry = "Something else"
        model.horizon = ThesisHorizon.YEAR
        assertTrue("opening and typing writes nothing", book.all("account-a").isEmpty())
        assertNull(store.getString(ThesisBook.key("account-a")))
        assertNull(store.getString(ThesisBook.key(null)))
        assertTrue(saved.isEmpty())
    }

    @Test fun aLongSuggestionIsCutAtAWordAndNeverExceedsTheField() {
        val model = draft(read(why = "evidence ".repeat(60)))
        assertTrue(model.hypothesis.length <= ThesisBook.TEXT_LIMIT)
        assertTrue("cut between words, not inside one", model.hypothesis.endsWith("evidence"))
        assertEquals("two lines", ThesisEditorModel.fit("  two\n\nlines  "))
        assertEquals("", ThesisEditorModel.fit(null))
        assertEquals("one endless word is still capped", ThesisBook.TEXT_LIMIT, ThesisEditorModel.fit("x".repeat(400)).length)
    }

    @Test fun typingStopsAtTwoHundredAndEightyCharacters() {
        val model = draft(read(why = null, risk = null, watch = null))
        model.hypothesis = "a".repeat(300)
        model.worry = "b".repeat(281)
        model.changeMind = "c".repeat(280)
        assertEquals(280, model.hypothesis.length)
        assertEquals(280, model.worry.length)
        assertEquals(280, model.changeMind.length)
        assertEquals(0, ThesisEditorModel.remaining(model.hypothesis))
        assertEquals(277, ThesisEditorModel.remaining("abc"))
        model.hypothesis = "😀".repeat(300)
        assertEquals("an emoji is never cut in half", 280, model.hypothesis.codePointCount(0, model.hypothesis.length))
    }

    // Save

    @Test fun saveStoresTheWordsOnScreenWithTheReadsStartingPointAndTellsTheRemindersTrack() {
        val model = draft(read(verdict = "review"))
        model.hypothesis = "  My own   reason  "
        model.worry = ""
        model.horizon = ThesisHorizon.YEARS
        val thesis = created(model.save())
        assertEquals("My own reason", thesis.hypothesis)
        assertEquals("an emptied field stays empty: Bobby's suggestion is not kept behind the person's back", "", thesis.worry)
        assertEquals("A move back under the average.", thesis.changeMind)
        assertEquals(ThesisHorizon.YEARS, thesis.horizon)
        assertEquals("NVDA", thesis.symbol)
        assertEquals("NVIDIA", thesis.name)
        assertEquals("0a1b2c3d-1111-4222-8333-444455556666", thesis.sourceRequestId)
        assertEquals(120.5, thesis.startingPoint!!.price, 0.0)
        assertEquals("2026-10-07T12:00:00Z", thesis.revisions.first().asOf)
        assertEquals("review", thesis.revisions.first().verdict)
        assertEquals(t0, thesis.createdAtMillis)
        assertEquals(listOf(thesis.id), book.active("account-a").map { it.id })
        assertTrue("it is written into the current account's book only", book.all(null).isEmpty())
        assertEquals("the saved event carries the new thesis id, once", listOf(thesis.id), saved)
        assertNull(model.problem)
    }

    @Test fun aReadWithoutAPriceStartsAThesisWithoutOne() {
        val model = draft(read(price = null))
        assertNull(model.startingPrice)
        assertNull("no price is never stored as zero", created(model.save()).startingPoint)
        assertNull("nor a zero the server might send", draft(read("BTC", price = 0.0)).startingPrice)
    }

    @Test fun anEmptyWhyIsRefusedInlineAndTypingClearsTheMessage() {
        val model = draft()
        model.hypothesis = "   \n "
        assertEquals(blocked(ThesisEditorModel.Problem.EmptyHypothesis), model.save())
        assertEquals(ThesisEditorModel.Problem.EmptyHypothesis, model.problem)
        assertTrue(book.all("account-a").isEmpty())
        assertTrue(saved.isEmpty())
        model.hypothesis = "Now there is a reason"
        assertNull(model.problem)
        created(model.save())
    }

    @Test fun anAssetThatAlreadyHasAThesisSaysSoBeforeAnythingIsWritten() {
        val existing = seed("NVDA")
        val model = draft()
        assertEquals("the person learns it on opening, not after writing", ThesisEditorModel.Problem.AlreadyActive(existing.id), model.problem)
        assertEquals(blocked(ThesisEditorModel.Problem.AlreadyActive(existing.id)), model.save())
        assertEquals(1, book.all("account-a").size)
        assertTrue(saved.isEmpty())
    }

    @Test fun anotherAccountsThesisOnTheSameAssetIsNotInTheWay() {
        seed("NVDA", owner = "account-b")
        val model = draft()
        assertNull(model.problem)
        created(model.save())
        assertEquals(1, book.all("account-b").size)
    }

    @Test fun aFourthThesisListsTheThreeActiveOnesAndSaveContinuesAfterArchivingOne() {
        val three = listOf("BTC", "SAP.DE", "AAPL").map { seed(it) }
        val model = draft()
        assertEquals(blocked(ThesisEditorModel.Problem.LimitReached), model.save())
        assertEquals(setOf("BTC", "SAP.DE", "AAPL"), model.active.map { it.symbol }.toSet())
        assertTrue(saved.isEmpty())
        assertNull(book.activeThesis("NVDA", "account-a"))
        val thesis = created(model.archiveAndSave(three[1].id))
        assertEquals("NVDA", thesis.symbol)
        assertEquals(SavedThesis.Status.ARCHIVED, book.thesis(three[1].id, "account-a")?.status)
        assertEquals(ThesisBook.ACTIVE_LIMIT, book.active("account-a").size)
        assertEquals(listOf(thesis.id), saved)
        assertNull(model.problem)
        assertTrue(model.active.isEmpty())
    }

    @Test fun backFromTheLimitStateArchivesNothingAndKeepsTheWords() {
        listOf("BTC", "SAP.DE", "AAPL").forEach { seed(it) }
        val model = draft()
        model.hypothesis = "Words I do not want to lose"
        model.save()
        model.backToWords()
        assertNull(model.problem)
        assertEquals("Words I do not want to lose", model.hypothesis)
        assertEquals(3, book.active("account-a").size)
        assertTrue(book.archived("account-a").isEmpty())
    }

    // Editing

    @Test fun editingChangesThePersonsWordsAndIsNotANewThesis() {
        val thesis = seed("NVDA")
        val model = editor(thesis)
        assertFalse(model.isNew)
        assertFalse(model.draftedByBobby)
        assertNull("an edit never moves where the thesis started", model.startingPrice)
        assertEquals("Why NVDA", model.hypothesis)
        assertEquals(ThesisHorizon.MONTHS, model.horizon)
        model.hypothesis = "A better reason"
        model.horizon = null
        val changed = edited(model.save())
        assertEquals(thesis.id, changed.id)
        assertEquals("A better reason", changed.hypothesis)
        assertNull(changed.horizon)
        assertEquals(listOf(ThesisRevision.Kind.CREATED, ThesisRevision.Kind.EDITED), changed.revisions.map { it.kind })
        assertEquals(10.0, changed.startingPoint!!.price, 0.0)
        assertTrue("the saved event is for a new thesis only", saved.isEmpty())
    }

    @Test fun anEditThatChangesNothingRecordsNothing() {
        val same = edited(editor(seed("NVDA")).save())
        assertEquals(listOf(ThesisRevision.Kind.CREATED), same.revisions.map { it.kind })
    }

    @Test fun editingAThesisThatWasDeletedSaysItIsGone() {
        val thesis = seed("NVDA")
        val model = editor(thesis)
        book.delete(thesis.id, "account-a")
        assertEquals(blocked(ThesisEditorModel.Problem.NotFound), model.save())
        assertTrue(book.all("account-a").isEmpty())
    }

    @Test fun emptyingTheWhyOfAnExistingThesisIsRefused() {
        val thesis = seed("NVDA")
        val model = editor(thesis)
        model.hypothesis = " "
        assertEquals(blocked(ThesisEditorModel.Problem.EmptyHypothesis), model.save())
        assertEquals("Why NVDA", book.thesis(thesis.id, "account-a")?.hypothesis)
    }

    // Fences

    @Test fun nothingIsWrittenIntoAnotherAccountsBookWhenTheAccountChangedWhileWriting() {
        val model = draft()
        user = "account-b"
        epoch += 1
        assertEquals(blocked(ThesisEditorModel.Problem.Stale), model.save())
        assertTrue(book.all("account-a").isEmpty())
        assertTrue(book.all("account-b").isEmpty())
        listOf("BTC", "SAP.DE", "AAPL").forEach { seed(it, owner = "account-b") }
        val other = book.active("account-b").first()
        assertEquals(blocked(ThesisEditorModel.Problem.Stale), model.archiveAndSave(other.id))
        assertEquals("nor is anything archived there", 3, book.active("account-b").size)
        assertTrue(saved.isEmpty())
    }

    @Test fun withNothingToWriteOnThereIsNothingToSave() {
        val model = model(ThesisEditorModel.Source.Missing)
        assertFalse(model.canSave)
        assertNull(model.symbol)
        assertEquals(blocked(ThesisEditorModel.Problem.NotFound), model.save())
    }

    // What the route opens

    @Test fun aThesisHandedOverByIdWinsThenAReadAndOtherwiseThereIsNothingToWriteOn() {
        val thesis = seed("NVDA")
        val summary = read("AAPL")
        val lookup: (String) -> ReadSummary? = { if (it == summary.requestId) summary else null }
        assertEquals(ThesisEditorModel.Source.Existing(thesis), ThesisEditorModel.open(thesis.id, summary.requestId, book, "account-a", lookup))
        assertEquals(ThesisEditorModel.Source.Read(summary), ThesisEditorModel.open(null, summary.requestId, book, "account-a", lookup))
        assertEquals("another account's thesis cannot be opened", ThesisEditorModel.Source.Missing,
                     ThesisEditorModel.open(thesis.id, null, book, "account-b", lookup))
        assertEquals(ThesisEditorModel.Source.Missing, ThesisEditorModel.open(null, "gone", book, "account-a", lookup))
        assertEquals(ThesisEditorModel.Source.Missing, ThesisEditorModel.open(null, null, book, "account-a", lookup))
    }

    // Leaving with words that are not saved

    @Test fun wordsThatAreNotSavedAreNeverDroppedWithoutAsking() {
        // Bobby's untouched draft is not the person's words: closing asks nothing.
        val first = draft()
        assertFalse(first.hasUnsavedWords)
        first.hypothesis = "I rewrote this in my own words"
        assertTrue("the close button asks once and a pull on the sheet does not dismiss", first.hasUnsavedWords)
        first.hypothesis = "Price holds above its 50-day average."
        assertFalse("back to what the editor opened with: nothing would be lost", first.hasUnsavedWords)
        first.horizon = ThesisHorizon.YEAR
        assertTrue("the horizon is the person's pick too", first.hasUnsavedWords)
        first.horizon = null
        first.worry = ""
        assertTrue("clearing a suggestion is an edit", first.hasUnsavedWords)
        created(first.save())
        assertFalse("saved words are not at risk", first.hasUnsavedWords)

        // A blank editor: the first character typed is already something to lose.
        val blank = draft(read("AAPL", why = null, risk = null, watch = null))
        assertFalse(blank.hasUnsavedWords)
        blank.changeMind = "x"
        assertTrue(blank.hasUnsavedWords)

        // Editing an existing thesis.
        val existing = editor(seed("BTC"))
        assertFalse(existing.hasUnsavedWords)
        existing.worry = "A different worry"
        assertTrue(existing.hasUnsavedWords)
        edited(existing.save())
        assertFalse(existing.hasUnsavedWords)

        // The limit state still holds the words the person wrote.
        seed("TSLA")
        assertEquals(ThesisBook.ACTIVE_LIMIT, book.active("account-a").size)
        val fourth = draft(read("AMZN"))
        fourth.hypothesis = "My own reason"
        assertEquals(blocked(ThesisEditorModel.Problem.LimitReached), fourth.save())
        assertTrue(fourth.hasUnsavedWords)

        // With nothing to write on, or in another account, there is nothing to ask about.
        assertFalse(model(ThesisEditorModel.Source.Missing).hasUnsavedWords)
        val stale = draft(read("GOOG"))
        stale.hypothesis = "Words for the previous account"
        epoch += 1
        assertEquals(blocked(ThesisEditorModel.Problem.Stale), stale.save())
        assertFalse(stale.hasUnsavedWords)
    }

    @Test fun theScreenIsToldAboutEveryChangeItShouldRedrawFor() {
        val model = draft()
        val before = model.changes.value
        model.hypothesis = "Something else"
        assertTrue(model.changes.value > before)
        val typed = model.changes.value
        model.hypothesis = "Something else"
        assertEquals("typing the same words again changes nothing", typed, model.changes.value)
        model.save()
        assertTrue(model.changes.value > typed)
    }

    @Test fun theHandOffIsConsumedOnce() {
        val focus = V18Focus()
        focus.draftRequestId = "read-1"
        focus.thesisId = "thesis-1"
        assertEquals("thesis-1", focus.takeThesisId())
        assertNull(focus.takeThesisId())
        assertEquals("read-1", focus.takeDraftRequestId())
        assertNull(focus.takeDraftRequestId())
    }
}

/** My theses (ios/Bobby/Tests/ThesisEditorTests.swift, `ThesisListTests`): the list reads the book on this phone and nothing else. */
@OptIn(ExperimentalCoroutinesApi::class)
class ThesisListTest {
    private val store = MemoryKeyValueStore()
    private val book = ThesisBook(store)
    private val words = CatalogWords()
    private val now = 1_800_000_000_000L
    private val day = 86_400_000L

    private fun seed(symbol: String, daysAgo: Double, owner: String? = "u1"): SavedThesis = book.create(
        ThesisDraft(symbol = symbol, name = symbol, isEquity = true, horizon = null, hypothesis = "Why $symbol", price = 120.5),
        owner, now - (daysAgo * day).toLong())

    private fun model(highlight: String? = null, owner: String? = "u1", lastSavedRead: ReadSummary? = null) =
        ThesisListModel(book, words, { owner }, highlight, { lastSavedRead }, { now })

    // Another door into the editor

    @Test fun theListOffersToWriteFromTheLastSavedReadWhileItsAssetHasNoThesis() {
        val read = ReadSummary("0a1b2c3d-1111-4222-8333-444455556666", "NVDA", "NVIDIA", true, "wait", 120.5, "2026-10-07T12:00:00Z", null, "Why", null, null)
        val empty = model(lastSavedRead = read)
        assertTrue(empty.isEmpty)
        assertEquals("the empty list is a door too, not only the offer on the glass", read, empty.writable)
        assertNull("no saved read in this launch: nothing is offered", model().writable)

        seed("BTC", 2.0)
        assertEquals(read, model(lastSavedRead = read).writable)
        val nvda = seed("nvda", 1.0)
        val list = model(lastSavedRead = read)
        assertNull("one thesis per asset: the list shows that thesis instead", list.writable)
        list.archive(nvda.id)
        assertEquals("an archived thesis is not in the way", read, list.writable)
        seed("NVDA", 0.0, owner = "u2")
        assertEquals("another account's thesis is not this reader's", read, model(lastSavedRead = read).writable)
    }

    @Test fun theLastSavedReadIsTheOneOfThisLaunchThatTheHostStillHolds() = runTest {
        val bench = V18TestBench(backgroundScope)
        assertNull("no read in this launch", ThesisListModel.lastSavedRead(bench.host))
        bench.nudges.noteRead(NudgeRead("0A1B2C3D-1111-4222-8333-444455556666", "AAPL", "Apple", true, "wait", false, bench.clock))
        assertNull("a read that was not saved is not offered", ThesisListModel.lastSavedRead(bench.host))
        bench.nudges.noteSaved("0A1B2C3D-1111-4222-8333-444455556666")
        assertNull("saved, but the host no longer holds it: nothing to draft from", ThesisListModel.lastSavedRead(bench.host))
        bench.deliver(requestId = "r9", symbol = "MSFT", name = "Microsoft")
        assertNull("delivered and not saved yet", ThesisListModel.lastSavedRead(bench.host))
        bench.host.readSaved("r9", "MSFT")
        assertEquals("MSFT", ThesisListModel.lastSavedRead(bench.host)?.symbol)
        bench.changeAccount("someone-else")
        assertNull("another reader has no read of this launch", ThesisListModel.lastSavedRead(bench.host))
    }

    // Theses written before signing in

    @Test fun thesesWrittenBeforeSigningInAreKeptOnlyWhenThePersonSaysSo() {
        seed("NVDA", 4.0, owner = null)
        seed("BTC", 2.0, owner = null)
        assertEquals("signed out there is no account to ask for", 0, model(owner = null).guestCount)
        assertNull(model(owner = null).guestQuestion)
        assertEquals(0, model(owner = null).keepGuestTheses())

        val list = model(owner = "u1")
        assertTrue("nothing was moved by signing in", list.isEmpty)
        assertEquals(2, list.guestCount)
        assertEquals("You wrote 2 theses before signing in. Keep them in this account?", list.guestQuestion)
        assertEquals(2, list.keepGuestTheses())
        assertEquals("\"Keep them\" moves them into this account's book", setOf("NVDA", "BTC"), list.active.map { it.symbol }.toSet())
        assertEquals(0, list.guestCount)
        assertNull(list.guestQuestion)
        assertTrue(book.all(null).isEmpty())
    }

    @Test fun notMineLeavesThemInTheGuestBookAndDoesNotAskThisAccountAgain() {
        val local = seed("NVDA", 4.0, owner = null)
        val list = model(owner = "u1")
        assertEquals("You wrote 1 thesis before signing in. Keep it in this account?", list.guestQuestion)
        list.declineGuestTheses()
        assertEquals(0, list.guestCount)
        assertTrue("hidden from this account", list.isEmpty)
        assertEquals("still in the guest book, where signed out sees them", listOf(local.id), book.all(null).map { it.id })
        assertEquals("not asked again", 0, model(owner = "u1").guestCount)
        assertEquals(listOf(local.id), model(owner = null).active.map { it.id })
        assertEquals("the answer was this account's, not the phone's", 1, model(owner = "u2").guestCount)

        // An account that already has theses is asked too: what it keeps arrives within its own limits.
        seed("BTC", 1.0, owner = "u3")
        assertEquals(1, model(owner = "u3").guestCount)
        assertEquals("v18.theses.adoption.u1", ThesisBook.adoptionKey("u1"))
    }

    @Test fun theGuestRowFitsItsWordsInSixLanguages() {
        seed("NVDA", 4.0, owner = null)
        seed("BTC", 2.0, owner = null)
        val questions = HashSet<String>()
        val buttons = HashSet<String>()
        val faces = HashSet<String>()
        words.inEveryLanguage { language ->
            val question = model(owner = "u1").guestQuestion ?: ""
            assertTrue("$language: $question", question.contains("2"))
            assertFalse(language, question.contains("{"))
            questions.add(question)
            buttons.add(words.text("Keep them", "Conservarlas") + " / " + words.text("Not mine", "No son mías"))
            // The row as the screen shows it today: a count, a question and two answers of equal weight.
            val face = words.text("{0} guest theses", "{0} tesis sin cuenta", 2) + " " + words.text("Keep them in this account?", "¿Conservarlas en esta cuenta?")
            assertFalse(language, face.contains("{"))
            faces.add(face)
        }
        assertEquals(6, questions.size)
        assertEquals("both answers are worded in each language", 6, buttons.size)
        assertEquals(6, faces.size)
    }

    @Test fun activeThesesComeFirstWithACounterAndArchivedOnesApart() {
        val nvda = seed("NVDA", 9.0)
        seed("BTC", 2.0)
        val old = seed("TSLA", 30.0)
        book.archive(old.id, "u1", now - day)
        seed("AAPL", 1.0, owner = "u2")
        val list = model()
        assertEquals(setOf("NVDA", "BTC"), list.active.map { it.symbol }.toSet())
        assertEquals(listOf("TSLA"), list.archived.map { it.symbol })
        assertEquals("2 of 3 active", list.counter)
        assertFalse(list.isEmpty)
        assertTrue("nine days without a review", list.isOverdue(nvda))
        assertFalse(list.isOverdue(book.activeThesis("BTC", "u1")!!))
        assertTrue("signed out sees only the local book", model(owner = null).isEmpty)
    }

    @Test fun reopenRespectsTheLimitAndOneThesisPerAsset() {
        val tsla = seed("TSLA", 30.0)
        book.archive(tsla.id, "u1", now)
        listOf("NVDA", "BTC", "AAPL").forEach { seed(it, 3.0) }
        val list = model()
        assertFalse(list.reopen(tsla.id))
        assertEquals(ThesisListModel.Problem.LimitReached, list.problem)
        assertEquals("Three theses are active already. Archive one first.", list.problemText())
        assertEquals(SavedThesis.Status.ARCHIVED, book.thesis(tsla.id, "u1")?.status)

        val nvda = book.activeThesis("NVDA", "u1")!!
        list.archive(nvda.id)
        assertNull(list.problem)
        val again = seed("NVDA", 0.0)
        assertFalse("the asset already has an active thesis", list.reopen(nvda.id))
        assertEquals(ThesisListModel.Problem.AlreadyActive("NVDA"), list.problem)
        assertEquals("You already have a thesis on NVDA.", list.problemText())

        list.archive(again.id)
        assertTrue(list.reopen(tsla.id))
        assertNull(list.problem)
        assertEquals("the reopened thesis is the one marked", tsla.id, list.highlight)
        assertEquals(SavedThesis.Status.ACTIVE, book.thesis(tsla.id, "u1")?.status)
        assertEquals(3, list.active.size)
        assertFalse("a thesis that is gone cannot be reopened", list.reopen("no-such-thesis"))
        assertNull(list.problem)
    }

    @Test fun deleteRemovesItFromThisPhoneForGood() {
        val tsla = seed("TSLA", 30.0)
        book.archive(tsla.id, "u1", now)
        val list = model()
        list.delete(tsla.id)
        assertTrue(list.isEmpty)
        assertNull(book.thesis(tsla.id, "u1"))
    }

    @Test fun aReminderTapMarksItsThesisAndOpensTheArchivedSectionWhenItLivesThere() {
        val nvda = seed("NVDA", 9.0)
        val tsla = seed("TSLA", 30.0)
        book.archive(tsla.id, "u1", now)
        assertEquals(nvda.id, model(highlight = nvda.id).highlight)
        assertFalse(model(highlight = nvda.id).highlightIsArchived)
        assertTrue(model(highlight = tsla.id).highlightIsArchived)
        assertNull("a thesis that is gone is not marked", model(highlight = "deleted-long-ago").highlight)
        assertNull("nor one from another account", model(highlight = nvda.id, owner = "u2").highlight)
    }

    @Test fun theScreenIsToldWhenTheBookChangesUnderIt() {
        val list = model()
        val stop = book.addListener { list.reload() }
        val before = list.changes.value
        seed("NVDA", 1.0)
        assertTrue(list.changes.value > before)
        assertEquals(listOf("NVDA"), list.active.map { it.symbol })
        stop()
        seed("BTC", 1.0)
        assertEquals("no longer listening", listOf("NVDA"), list.active.map { it.symbol })
    }
}
