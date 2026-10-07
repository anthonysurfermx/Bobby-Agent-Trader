package xyz.bobbyprotocol.android.v18.theses

import kotlinx.coroutines.flow.MutableStateFlow
import xyz.bobbyprotocol.android.v18.ReadSummary
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.ThesisHorizon

// Write or edit a thesis (1.8): the logic behind the editor, with nothing of Compose in it. A port
// of ios/Bobby/Sources/V18/Theses/ThesisEditorModel.swift. The fields live in memory until the
// person taps Save: a draft Bobby prefilled from a read is only a suggestion on screen, and
// closing the editor leaves the thesis book untouched.
class ThesisEditorModel(
    val source: Source,
    private val book: ThesisBook,
    private val owner: () -> String?,
    /** The account moment (`V18Host.accountEpoch`): a Save for an account that is gone writes nothing. */
    private val epoch: () -> Long,
    private val now: () -> Long = { System.currentTimeMillis() },
    private val events: ThesisEvents? = null,
) {
    /** What the editor was opened on. */
    sealed class Source {
        /** A new thesis, written from a read the person just had. */
        data class Read(val read: ReadSummary) : Source()
        /** A thesis that already exists. */
        data class Existing(val thesis: SavedThesis) : Source()
        /** Neither (the read is gone, or the thesis was deleted): there is nothing to write on. */
        data object Missing : Source()
    }

    /** Why a Save did not happen. Each has its own words and next step on screen. */
    sealed class Problem {
        data object EmptyHypothesis : Problem()
        /** One active thesis per asset: the screen offers to open the existing one. */
        data class AlreadyActive(val id: String) : Problem()
        /** Three are active: the screen lists them, each with Archive, and Save continues. */
        data object LimitReached : Problem()
        /** The thesis being edited is no longer in this account's book. */
        data object NotFound : Problem()
        /** The account changed while the editor was open: nothing is written into another account's book. */
        data object Stale : Problem()
    }

    sealed class Outcome {
        data class Created(val thesis: SavedThesis) : Outcome()
        data class Edited(val thesis: SavedThesis) : Outcome()
        data class Blocked(val problem: Problem) : Outcome()
    }

    private data class Words(val horizon: ThesisHorizon?, val hypothesis: String, val worry: String, val changeMind: String)

    /** Goes up on every change the screen should redraw for. */
    val changes = MutableStateFlow(0)

    private val openedEpoch: Long = epoch()
    /** What the fields held when the editor opened (Bobby's draft, the saved thesis, or nothing). */
    private val opened: Words = initial(source)
    private var isSaved = false

    /** The three texts were prefilled from Bobby's synthesis of the read (and say so on screen). */
    val draftedByBobby: Boolean = source is Source.Read &&
        !(opened.hypothesis.isEmpty() && opened.worry.isEmpty() && opened.changeMind.isEmpty())

    var problem: Problem? = null
        private set

    /** The active theses, for the limit state. */
    var active: List<SavedThesis> = emptyList()
        private set

    var horizon: ThesisHorizon? = opened.horizon
        set(value) {
            if (field == value) return
            field = value
            changed()
        }

    var hypothesis: String = opened.hypothesis
        set(value) {
            val next = cap(value)
            if (next == field) return
            field = next
            edited()
            changed()
        }

    var worry: String = opened.worry
        set(value) {
            val next = cap(value)
            if (next == field) return
            field = next
            edited()
            changed()
        }

    var changeMind: String = opened.changeMind
        set(value) {
            val next = cap(value)
            if (next == field) return
            field = next
            edited()
            changed()
        }

    init {
        // One thesis per asset: say so before the person writes a second one in vain.
        if (source is Source.Read) {
            val existing = book.activeThesis(source.read.symbol, owner())
            if (existing != null) problem = Problem.AlreadyActive(existing.id)
        }
    }

    // What the screen shows

    val symbol: String?
        get() = when (source) {
            is Source.Read -> source.read.symbol
            is Source.Existing -> source.thesis.symbol
            is Source.Missing -> null
        }

    val name: String?
        get() = when (source) {
            is Source.Read -> source.read.name
            is Source.Existing -> source.thesis.name
            is Source.Missing -> null
        }

    val isNew: Boolean get() = source is Source.Read

    /** The price a new thesis will start from (the read's), so the person sees what is kept with their words. */
    val startingPrice: Double?
        get() = (source as? Source.Read)?.read?.price?.takeIf { it.isFinite() && it > 0 }

    val canSave: Boolean get() = source !is Source.Missing && ThesisBook.clean(hypothesis).isNotEmpty()

    /**
     * The person changed something that is not saved yet: closing the editor now would lose it, so
     * the screen asks first. An untouched draft from Bobby is not the person's words and asks nothing.
     */
    val hasUnsavedWords: Boolean
        get() {
            if (source is Source.Missing || isSaved || problem == Problem.Stale || problem == Problem.NotFound) return false
            return Words(horizon, hypothesis, worry, changeMind) != opened
        }

    // Saving

    /** The only place a thesis is written. The words are exactly what the fields show. */
    fun save(): Outcome {
        if (epoch() != openedEpoch) return block(Problem.Stale)
        return try {
            when (source) {
                is Source.Missing -> block(Problem.NotFound)
                is Source.Existing -> {
                    val saved = book.edit(source.thesis.id, owner(), horizon, hypothesis, worry, changeMind, now())
                    problem = null
                    isSaved = true
                    changed()
                    Outcome.Edited(saved)
                }
                is Source.Read -> {
                    val read = source.read
                    val draft = ThesisDraft(
                        symbol = read.symbol, name = read.name, isEquity = read.isEquity, horizon = horizon, hypothesis = hypothesis,
                        worry = worry, changeMind = changeMind, sourceRequestId = read.requestId, price = startingPrice,
                        asOf = read.asOf.takeIf { it.isNotEmpty() }, verdict = read.verdict.takeIf { it == "wait" || it == "review" })
                    val saved = book.create(draft, owner(), now())
                    problem = null
                    active = emptyList()
                    isSaved = true
                    changed()
                    events?.postSaved(saved.id)
                    Outcome.Created(saved)
                }
            }
        } catch (error: ThesisBook.BookError) {
            when (error) {
                is ThesisBook.BookError.EmptyHypothesis -> block(Problem.EmptyHypothesis)
                is ThesisBook.BookError.AlreadyActive -> block(Problem.AlreadyActive(error.id))
                is ThesisBook.BookError.LimitReached -> {
                    active = book.active(owner())
                    block(Problem.LimitReached)
                }
                is ThesisBook.BookError.NotFound -> block(Problem.NotFound)
            }
        }
    }

    /** The limit state: the person archives one of the three, and the Save they asked for continues. */
    fun archiveAndSave(id: String): Outcome {
        if (epoch() != openedEpoch) return block(Problem.Stale)
        try {
            book.archive(id, owner(), now())
        } catch (_: ThesisBook.BookError) {
            // Gone already: the Save below says what is still in the way, if anything.
        }
        return save()
    }

    /** Back from the limit state to the words, with nothing archived and nothing saved. */
    fun backToWords() {
        if (problem != Problem.LimitReached) return
        problem = null
        active = emptyList()
        changed()
    }

    /** Typing again clears the inline message about an empty field. */
    private fun edited() {
        if (problem == Problem.EmptyHypothesis && ThesisBook.clean(hypothesis).isNotEmpty()) problem = null
    }

    private fun block(problem: Problem): Outcome {
        this.problem = problem
        changed()
        return Outcome.Blocked(problem)
    }

    private fun changed() {
        changes.value = changes.value + 1
    }

    companion object {
        /** The editor a route opens: a thesis handed over by id wins, then a read to draft from. */
        fun open(thesisId: String?, draftRequestId: String?, book: ThesisBook, owner: String?, readSummary: (String) -> ReadSummary?): Source {
            if (thesisId != null) return book.thesis(thesisId, owner)?.let { Source.Existing(it) } ?: Source.Missing
            if (draftRequestId != null) readSummary(draftRequestId)?.let { return Source.Read(it) }
            return Source.Missing
        }

        fun remaining(text: String): Int = ThesisBook.TEXT_LIMIT - text.codePointCount(0, text.length)

        /** A suggestion that fits the field: single-spaced, and cut at a word when it is longer than the limit. */
        fun fit(text: String?): String {
            val collapsed = (text ?: "").split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
            if (collapsed.codePointCount(0, collapsed.length) <= ThesisBook.TEXT_LIMIT) return collapsed
            val head = cap(collapsed)
            val space = head.lastIndexOf(' ')
            if (space < 0 || head.codePointCount(0, space) <= ThesisBook.TEXT_LIMIT / 2) return head
            return head.substring(0, space)
        }

        /** What a field may hold: the first 280 characters of what was typed. */
        private fun cap(text: String): String =
            if (text.codePointCount(0, text.length) <= ThesisBook.TEXT_LIMIT) text
            else text.substring(0, text.offsetByCodePoints(0, ThesisBook.TEXT_LIMIT))

        private fun initial(source: Source): Words = when (source) {
            is Source.Read -> Words(null, fit(source.read.why), fit(source.read.risk), fit(source.read.watch))
            is Source.Existing -> Words(source.thesis.horizon, source.thesis.hypothesis, source.thesis.worry, source.thesis.changeMind)
            is Source.Missing -> Words(null, "", "", "")
        }
    }
}
