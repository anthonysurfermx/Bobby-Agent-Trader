package xyz.bobbyprotocol.android.v18

import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

// The thesis book (1.8), a port of ios/Bobby/Sources/V18/Theses/ThesisBook.swift. A thesis is what
// the PERSON wrote and approved about one asset: why they are looking at it, what worries them and
// what would change their mind. It is never inferred and never written by Bobby without the person
// seeing and saving the words.
//
// It lives on this phone only (per account, like the saved-reads ledger, and separate from it): no
// server copy, nothing to sync, erased with the account and with "Delete everything" in Memory.
// Its text leaves the phone only inside a review the person starts, as part of that question.
// Three active theses at most: a fourth asks to archive one first.

/** How long the person says they are looking at this. Their choice, never deduced from a question. */
enum class ThesisHorizon(val raw: String) {
    WEEKS("weeks"), MONTHS("months"), YEAR("year"), YEARS("years");

    companion object {
        fun of(raw: String?): ThesisHorizon? = entries.firstOrNull { it.raw == raw }
    }
}

/** One dated entry in a thesis's history. */
data class ThesisRevision(
    val id: String,
    val atMillis: Long,
    val kind: Kind,
    /** The market price Bobby's evidence carried at that moment, and when that evidence was dated. */
    val price: Double? = null,
    val asOf: String? = null,
    /** Bobby's verdict on the read behind this entry (`wait` | `review`); null for the person's own edits. */
    val verdict: String? = null,
    /** A review only: what the evidence supports, what it challenges, what could not be checked. */
    val supports: List<String> = emptyList(),
    val challenges: List<String> = emptyList(),
    val unknowns: List<String> = emptyList(),
) {
    enum class Kind(val raw: String) {
        CREATED("created"), EDITED("edited"), REVIEWED("reviewed"), KEPT("kept"), ARCHIVED("archived"), REACTIVATED("reactivated");

        companion object {
            fun of(raw: String?): Kind? = entries.firstOrNull { it.raw == raw }
        }
    }
}

data class SavedThesis(
    val id: String,
    val symbol: String,
    val name: String,
    val isEquity: Boolean,
    val status: Status,
    val horizon: ThesisHorizon?,
    /** Why I am looking at this. Required. */
    val hypothesis: String,
    /** What worries me. May be empty. */
    val worry: String,
    /** What would change my mind. May be empty. */
    val changeMind: String,
    val createdAtMillis: Long,
    val updatedAtMillis: Long,
    val lastReviewedAtMillis: Long?,
    /** The read it was written from, when there was one. */
    val sourceRequestId: String?,
    /** Oldest first. */
    val revisions: List<ThesisRevision>,
) {
    enum class Status(val raw: String) { ACTIVE("active"), ARCHIVED("archived") }

    /** Where the thesis started: a price and its moment. */
    data class StartingPoint(val price: Double, val atMillis: Long)

    /**
     * The price and date the thesis started from: only what was recorded when it was written. A
     * thesis written without a price has no starting point; a later review never becomes its origin.
     */
    val startingPoint: StartingPoint?
        get() {
            val created = revisions.firstOrNull() ?: return null
            val price = created.price ?: return null
            return if (created.kind == ThesisRevision.Kind.CREATED) StartingPoint(price, created.atMillis) else null
        }

    val lastReview: ThesisRevision? get() = revisions.lastOrNull { it.kind == ThesisRevision.Kind.REVIEWED }
}

/** What the editor hands over: the person's words, already seen and approved by them. */
data class ThesisDraft(
    val symbol: String,
    val name: String,
    val isEquity: Boolean,
    val horizon: ThesisHorizon?,
    val hypothesis: String,
    val worry: String = "",
    val changeMind: String = "",
    val sourceRequestId: String? = null,
    val price: Double? = null,
    val asOf: String? = null,
    val verdict: String? = null,
)

class ThesisBook(
    private val store: KeyValueStore,
    private val newId: () -> String = { UUID.randomUUID().toString().lowercase(Locale.ROOT) },
) {
    sealed class BookError(message: String) : Exception(message) {
        /** Three are active already: the caller offers to archive one. */
        object LimitReached : BookError("limit_reached")
        object EmptyHypothesis : BookError("empty_hypothesis")
        object NotFound : BookError("not_found")
        /** One active thesis per asset: the caller opens the existing one. */
        class AlreadyActive(val id: String) : BookError("already_active")
    }

    private val listeners = CopyOnWriteArrayList<(String) -> Unit>()

    /** Called after every change with the owner key that changed. Returns the way to stop listening. */
    fun addListener(listener: (String) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    // Reading

    /** Active first (most recently touched first), then archived. */
    fun all(owner: String?): List<SavedThesis> {
        val raw = store.getString(key(owner)) ?: return emptyList()
        val list = ArrayList<SavedThesis>()
        try {
            val array = JSONArray(raw)
            for (i in 0 until array.length()) {
                val thesis = array.optJSONObject(i)?.let { decode(it) } ?: continue
                list.add(thesis)
            }
        } catch (_: Exception) {
            return emptyList()
        }
        return list.sortedWith(compareBy<SavedThesis> { if (it.status == SavedThesis.Status.ACTIVE) 0 else 1 }.thenByDescending { it.updatedAtMillis })
    }

    fun active(owner: String?): List<SavedThesis> = all(owner).filter { it.status == SavedThesis.Status.ACTIVE }
    fun archived(owner: String?): List<SavedThesis> = all(owner).filter { it.status == SavedThesis.Status.ARCHIVED }
    fun thesis(id: String, owner: String?): SavedThesis? = all(owner).firstOrNull { it.id == id }
    fun activeThesis(symbol: String, owner: String?): SavedThesis? = active(owner).firstOrNull { it.symbol.equals(symbol, ignoreCase = true) }
    fun canAddActive(owner: String?): Boolean = active(owner).size < ACTIVE_LIMIT

    // Writing

    @Throws(BookError::class)
    fun create(draft: ThesisDraft, owner: String?, now: Long = System.currentTimeMillis()): SavedThesis {
        val hypothesis = clean(draft.hypothesis)
        if (hypothesis.isEmpty()) throw BookError.EmptyHypothesis
        activeThesis(draft.symbol, owner)?.let { throw BookError.AlreadyActive(it.id) }
        if (!canAddActive(owner)) throw BookError.LimitReached
        val thesis = SavedThesis(
            id = newId().lowercase(Locale.ROOT), symbol = draft.symbol.uppercase(Locale.ROOT), name = draft.name, isEquity = draft.isEquity,
            status = SavedThesis.Status.ACTIVE, horizon = draft.horizon, hypothesis = hypothesis, worry = clean(draft.worry),
            changeMind = clean(draft.changeMind), createdAtMillis = now, updatedAtMillis = now, lastReviewedAtMillis = null,
            sourceRequestId = draft.sourceRequestId,
            revisions = listOf(ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.CREATED, draft.price, draft.asOf, draft.verdict)),
        )
        write(all(owner) + thesis, owner)
        return thesis
    }

    /** The person changed their own words (or the horizon). An edit that changes nothing records nothing. */
    @Throws(BookError::class)
    fun edit(id: String, owner: String?, horizon: ThesisHorizon?, hypothesis: String, worry: String, changeMind: String,
             now: Long = System.currentTimeMillis()): SavedThesis {
        val cleaned = clean(hypothesis)
        if (cleaned.isEmpty()) throw BookError.EmptyHypothesis
        return mutate(id, owner) { thesis ->
            val next = thesis.copy(horizon = horizon, hypothesis = cleaned, worry = clean(worry), changeMind = clean(changeMind))
            if (next == thesis) thesis
            else next.copy(updatedAtMillis = now, revisions = appended(thesis.revisions, ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.EDITED)))
        }
    }

    /** A review the person ran: what Bobby's dated evidence supports, challenges and could not check. */
    @Throws(BookError::class)
    fun recordReview(id: String, owner: String?, price: Double?, asOf: String?, verdict: String?, supports: List<String>,
                     challenges: List<String>, unknowns: List<String>, now: Long = System.currentTimeMillis()): SavedThesis {
        fun trim(items: List<String>): List<String> = items.map { clean(it) }.filter { it.isNotEmpty() }.take(6)
        return mutate(id, owner) { thesis ->
            thesis.copy(lastReviewedAtMillis = now, updatedAtMillis = now,
                        revisions = appended(thesis.revisions, ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.REVIEWED, price, asOf, verdict,
                                                                              trim(supports), trim(challenges), trim(unknowns))))
        }
    }

    /** "I keep it as it is" after a review. */
    @Throws(BookError::class)
    fun keep(id: String, owner: String?, now: Long = System.currentTimeMillis()): SavedThesis = mutate(id, owner) { thesis ->
        thesis.copy(updatedAtMillis = now, revisions = appended(thesis.revisions, ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.KEPT)))
    }

    @Throws(BookError::class)
    fun archive(id: String, owner: String?, now: Long = System.currentTimeMillis()): SavedThesis {
        val archived = mutate(id, owner) { thesis ->
            if (thesis.status != SavedThesis.Status.ACTIVE) thesis
            else thesis.copy(status = SavedThesis.Status.ARCHIVED, updatedAtMillis = now,
                             revisions = appended(thesis.revisions, ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.ARCHIVED)))
        }
        // The oldest archived theses fall off; active ones never do.
        val list = all(owner)
        val old = list.filter { it.status == SavedThesis.Status.ARCHIVED }.drop(ARCHIVED_LIMIT).map { it.id }.toSet()
        if (old.isNotEmpty()) write(list.filter { it.id !in old }, owner)
        return archived
    }

    @Throws(BookError::class)
    fun reactivate(id: String, owner: String?, now: Long = System.currentTimeMillis()): SavedThesis {
        val current = thesis(id, owner) ?: throw BookError.NotFound
        if (current.status == SavedThesis.Status.ACTIVE) return current
        activeThesis(current.symbol, owner)?.let { throw BookError.AlreadyActive(it.id) }
        if (!canAddActive(owner)) throw BookError.LimitReached
        return mutate(id, owner) { thesis ->
            thesis.copy(status = SavedThesis.Status.ACTIVE, updatedAtMillis = now,
                        revisions = appended(thesis.revisions, ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.REACTIVATED)))
        }
    }

    fun delete(id: String, owner: String?) {
        val list = all(owner)
        val kept = list.filter { it.id != id }
        if (kept.size != list.size) write(kept, owner)
    }

    /** "Delete everything" in Memory: every thesis of this owner, on this phone. */
    fun deleteAll(owner: String?) {
        store.remove(key(owner))
        announce(owner)
    }

    // Theses written before signing in

    /** How many guest theses this account may still be offered (0 once it answered, either way). */
    fun pendingLocalCount(userId: String): Int = if (store.getString(adoptionKey(userId)) == null) all(null).size else 0

    /** "Not mine": the guest theses stay where they are and this account is not asked again. */
    fun declineLocal(userId: String) {
        store.putString(adoptionKey(userId), "declined")
        announce(userId)
    }

    /**
     * "Keep them": the guest theses move into this account, once. The account's own limits hold:
     * a moved thesis stays active only while there is room and no active thesis on the same asset;
     * otherwise it arrives archived. Returns how many moved.
     */
    fun adoptLocal(userId: String, now: Long = System.currentTimeMillis()): Int {
        if (store.getString(adoptionKey(userId)) != null) return 0
        val local = all(null)
        store.putString(adoptionKey(userId), "adopted")
        if (local.isEmpty()) return 0
        val mine = ArrayList(all(userId))
        for (thesis in local.sortedByDescending { it.updatedAtMillis }) {
            if (mine.any { it.id == thesis.id }) continue
            var moved = thesis
            if (thesis.status == SavedThesis.Status.ACTIVE) {
                val activeNow = mine.filter { it.status == SavedThesis.Status.ACTIVE }
                val clash = activeNow.any { it.symbol.equals(thesis.symbol, ignoreCase = true) }
                if (clash || activeNow.size >= ACTIVE_LIMIT) {
                    moved = thesis.copy(status = SavedThesis.Status.ARCHIVED, updatedAtMillis = now,
                                        revisions = appended(thesis.revisions, ThesisRevision(newId().lowercase(Locale.ROOT), now, ThesisRevision.Kind.ARCHIVED)))
                }
            }
            mine.add(moved)
        }
        write(mine, userId)
        store.remove(key(null))
        announce(null)
        return local.size
    }

    // Internals

    @Throws(BookError::class)
    private fun mutate(id: String, owner: String?, change: (SavedThesis) -> SavedThesis): SavedThesis {
        val list = all(owner)
        val index = list.indexOfFirst { it.id == id }
        if (index < 0) throw BookError.NotFound
        val before = list[index]
        val after = change(before)
        if (after != before) write(list.toMutableList().also { it[index] = after }, owner)
        return after
    }

    private fun write(list: List<SavedThesis>, owner: String?) {
        val array = JSONArray()
        for (thesis in list) array.put(encode(thesis))
        store.putString(key(owner), array.toString())
        announce(owner)
    }

    private fun announce(owner: String?) {
        val changed = key(owner)
        for (listener in listeners) listener(changed)
    }

    companion object {
        const val ACTIVE_LIMIT = 3
        const val ARCHIVED_LIMIT = 20
        const val TEXT_LIMIT = 280
        const val REVISION_LIMIT = 30

        /** `v18.theses.<owner>`; signed out is `local`. */
        fun key(owner: String?): String = "v18.theses." + (owner ?: "local")

        /** Where an account's one answer about the guest theses is remembered. */
        fun adoptionKey(userId: String): String = "v18.theses.adoption.$userId"

        /** Trimmed, single-spaced and capped: what is stored is what the person saw, never more. */
        fun clean(text: String): String {
            val collapsed = text.split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")
            if (collapsed.codePointCount(0, collapsed.length) <= TEXT_LIMIT) return collapsed
            return collapsed.substring(0, collapsed.offsetByCodePoints(0, TEXT_LIMIT))
        }

        /** Account deletion: only the deleted account's theses, and its answer about the guest theses. */
        fun forgetOwner(userId: String, store: KeyValueStore) {
            store.remove(key(userId))
            store.remove(adoptionKey(userId))
        }

        /** The first entry (where the thesis started) is always kept. */
        private fun appended(revisions: List<ThesisRevision>, revision: ThesisRevision): List<ThesisRevision> {
            val all = revisions + revision
            if (all.size <= REVISION_LIMIT) return all
            return listOf(all.first()) + all.takeLast(REVISION_LIMIT - 1)
        }

        private fun strings(array: JSONArray?): List<String> {
            if (array == null) return emptyList()
            val out = ArrayList<String>()
            for (i in 0 until array.length()) array.optString(i, "").takeIf { it.isNotEmpty() }?.let { out.add(it) }
            return out
        }

        private fun text(json: JSONObject, key: String): String? = if (json.isNull(key)) null else json.optString(key, "").takeIf { it.isNotEmpty() }
        private fun number(json: JSONObject, key: String): Double? =
            if (json.isNull(key)) null else json.optDouble(key, Double.NaN).takeIf { it.isFinite() }
        private fun millis(json: JSONObject, key: String): Long? = if (json.isNull(key)) null else json.optLong(key, -1L).takeIf { it >= 0L }

        private fun encode(revision: ThesisRevision): JSONObject = JSONObject()
            .put("id", revision.id).put("at", revision.atMillis).put("kind", revision.kind.raw)
            .put("price", revision.price ?: JSONObject.NULL).put("asOf", revision.asOf ?: JSONObject.NULL)
            .put("verdict", revision.verdict ?: JSONObject.NULL)
            .put("supports", JSONArray(revision.supports)).put("challenges", JSONArray(revision.challenges))
            .put("unknowns", JSONArray(revision.unknowns))

        private fun decodeRevision(json: JSONObject): ThesisRevision? {
            val kind = ThesisRevision.Kind.of(text(json, "kind")) ?: return null
            val id = text(json, "id") ?: return null
            val at = millis(json, "at") ?: return null
            return ThesisRevision(id, at, kind, number(json, "price"), text(json, "asOf"), text(json, "verdict"),
                                  strings(json.optJSONArray("supports")), strings(json.optJSONArray("challenges")), strings(json.optJSONArray("unknowns")))
        }

        private fun encode(thesis: SavedThesis): JSONObject {
            val revisions = JSONArray()
            for (revision in thesis.revisions) revisions.put(encode(revision))
            return JSONObject()
                .put("id", thesis.id).put("symbol", thesis.symbol).put("name", thesis.name).put("isEquity", thesis.isEquity)
                .put("status", thesis.status.raw).put("horizon", thesis.horizon?.raw ?: JSONObject.NULL)
                .put("hypothesis", thesis.hypothesis).put("worry", thesis.worry).put("changeMind", thesis.changeMind)
                .put("createdAt", thesis.createdAtMillis).put("updatedAt", thesis.updatedAtMillis)
                .put("lastReviewedAt", thesis.lastReviewedAtMillis ?: JSONObject.NULL)
                .put("sourceRequestId", thesis.sourceRequestId ?: JSONObject.NULL)
                .put("revisions", revisions)
        }

        private fun decode(json: JSONObject): SavedThesis? {
            val id = text(json, "id") ?: return null
            val symbol = text(json, "symbol") ?: return null
            val hypothesis = text(json, "hypothesis") ?: return null
            val created = millis(json, "createdAt") ?: return null
            val revisions = ArrayList<ThesisRevision>()
            val array = json.optJSONArray("revisions")
            if (array != null) for (i in 0 until array.length()) array.optJSONObject(i)?.let { decodeRevision(it) }?.let { revisions.add(it) }
            return SavedThesis(
                id = id, symbol = symbol, name = json.optString("name", symbol), isEquity = json.optBoolean("isEquity", false),
                status = if (text(json, "status") == SavedThesis.Status.ARCHIVED.raw) SavedThesis.Status.ARCHIVED else SavedThesis.Status.ACTIVE,
                horizon = ThesisHorizon.of(text(json, "horizon")), hypothesis = hypothesis, worry = json.optString("worry", ""),
                changeMind = json.optString("changeMind", ""), createdAtMillis = created, updatedAtMillis = millis(json, "updatedAt") ?: created,
                lastReviewedAtMillis = millis(json, "lastReviewedAt"), sourceRequestId = text(json, "sourceRequestId"), revisions = revisions,
            )
        }
    }
}
