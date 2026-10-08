package xyz.bobbyprotocol.android.v18.theses

import kotlinx.coroutines.flow.MutableStateFlow
import xyz.bobbyprotocol.android.v18.ReadSummary
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisBook
import xyz.bobbyprotocol.android.v18.V18Host

// My theses (1.8), the model of ios/Bobby/Sources/V18/Theses/ThesisListSheet.swift. The active
// ones first (three at most); archived ones wait folded underneath and can be reopened or deleted.
// Two quiet rows may sit on top: theses written before signing in ("Keep them" / "Not mine"), and
// a way to write a thesis from the read the person last saved, so the offer on the glass is not
// the only door. Everything here is read from the thesis book on this phone; nothing touches the
// network.
class ThesisListModel(
    private val book: ThesisBook,
    private val words: HostWords,
    private val owner: () -> String?,
    highlight: String? = null,
    /** The read the person last saved, while the desk still holds it for this account. */
    private val lastSavedRead: () -> ReadSummary? = { null },
    private val now: () -> Long = { System.currentTimeMillis() },
) {
    /** Why a reopen did not happen. */
    sealed class Problem {
        data object LimitReached : Problem()
        data class AlreadyActive(val symbol: String) : Problem()
    }

    /** Goes up on every change the screen should redraw for. */
    val changes = MutableStateFlow(0)

    var active: List<SavedThesis> = emptyList()
        private set
    var archived: List<SavedThesis> = emptyList()
        private set
    var problem: Problem? = null
        private set
    /** The thesis a reminder or a row handed over: the list marks it. */
    var highlight: String? = highlight
        private set
    /** Theses written before signing in that this account has not answered for yet (0: no row). */
    var guestCount: Int = 0
        private set
    /** The read the person last saved, when the desk still holds it and its asset has no active thesis. */
    var writable: ReadSummary? = null
        private set

    init {
        reload()
    }

    val isEmpty: Boolean get() = active.isEmpty() && archived.isEmpty()

    val counter: String
        get() = words.text("{0} of {1} active", "{0} de {1} activas", active.size, ThesisBook.ACTIVE_LIMIT)

    fun reload() {
        val reader = owner()
        active = book.active(reader)
        archived = book.archived(reader)
        val marked = highlight
        if (marked != null && book.thesis(marked, reader) == null) highlight = null
        guestCount = if (reader == null) 0 else book.pendingLocalCount(reader)
        writable = lastSavedRead()?.takeIf { book.activeThesis(it.symbol, reader) == null }
        changed()
    }

    // Theses written before signing in

    /** "You wrote 2 theses before signing in. Keep them in this account?" */
    val guestQuestion: String?
        get() = when {
            guestCount <= 0 -> null
            guestCount == 1 -> words.text("You wrote 1 thesis before signing in. Keep it in this account?",
                                          "Escribiste 1 tesis antes de iniciar sesión. ¿La conservas en esta cuenta?")
            else -> words.text("You wrote {0} theses before signing in. Keep them in this account?",
                               "Escribiste {0} tesis antes de iniciar sesión. ¿Las conservas en esta cuenta?", guestCount)
        }

    /** "Keep them": the guest theses move into this account's book. Signed out there is no account to move them to. */
    fun keepGuestTheses(): Int {
        val reader = owner() ?: return 0
        val moved = book.adoptLocal(reader, now())
        reload()
        return moved
    }

    /** "Not mine": they stay in the guest book, and this account is not asked again. */
    fun declineGuestTheses() {
        val reader = owner() ?: return
        book.declineLocal(reader)
        reload()
    }

    /** The highlighted thesis sits in the folded section: the section opens for it. */
    val highlightIsArchived: Boolean get() = highlight?.let { id -> archived.any { it.id == id } } ?: false

    fun isOverdue(thesis: SavedThesis): Boolean =
        ThesisCopy.days(thesis.lastReviewedAtMillis ?: thesis.createdAtMillis, now()) >= ThesisNudges.DUE_AFTER_DAYS

    fun reopen(id: String): Boolean {
        val reader = owner()
        try {
            book.reactivate(id, reader, now())
            problem = null
            highlight = id
            reload()
            return true
        } catch (error: ThesisBook.BookError) {
            if (error is ThesisBook.BookError.LimitReached) {
                problem = Problem.LimitReached
            } else if (error is ThesisBook.BookError.AlreadyActive) {
                problem = Problem.AlreadyActive(book.thesis(error.id, reader)?.symbol ?: "")
            } else {
                problem = null
                reload()
            }
            changed()
            return false
        }
    }

    fun archive(id: String) {
        try {
            book.archive(id, owner(), now())
        } catch (_: ThesisBook.BookError) {
            // Gone already: the reload below shows what is there.
        }
        problem = null
        reload()
    }

    /** For good, from this phone. The screen asks once before calling this. */
    fun delete(id: String) {
        book.delete(id, owner())
        problem = null
        reload()
    }

    fun problemText(): String? = when (val current = problem) {
        is Problem.LimitReached -> words.text("Three theses are active already. Archive one first.", "Ya hay tres tesis activas. Archiva una primero.")
        is Problem.AlreadyActive -> words.text("You already have a thesis on {0}.", "Ya tienes una tesis sobre {0}.", current.symbol)
        null -> null
    }

    private fun changed() {
        changes.value = changes.value + 1
    }

    companion object {
        /** The read the person last saved in this launch, while the host still holds its summary for this account. */
        fun lastSavedRead(host: V18Host): ReadSummary? {
            val read = host.nudges.lastRead?.takeIf { it.saved } ?: return null
            return host.readSummary(read.requestId)
        }
    }
}
