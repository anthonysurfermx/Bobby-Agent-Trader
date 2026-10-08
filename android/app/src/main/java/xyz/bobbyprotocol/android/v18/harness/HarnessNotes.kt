package xyz.bobbyprotocol.android.v18.harness

import java.time.ZoneId

// The harness (1.8): what the phone keeps for follow-ups, said in sentences. The Memory screen
// shows exactly this ("On this phone"), so nothing the planner reads about a person is hidden
// from them, and each asset's notes can be erased there. A port of
// ios/Bobby/Sources/V18/Harness/HarnessNotes.swift.
// Invariants:
//  - One computation. The sentences come from the ledger the planner plans from and from the same
//    `HarnessProfile.make` it calls: the screen cannot describe a profile the planner does not use.
//  - Nothing is left out by accident. Every kind of event the ledger can hold, every field an
//    event carries and every field of the profile goes through an exhaustive `when` below, and
//    HarnessSurfaceTest checks the two lists of fields against the classes themselves: a new one
//    fails until it has a sentence or is marked internal with the reason.
//  - A question the person asked is counted apart from a read whose question Bobby wrote: the
//    planner follows up the first and never the second, and the screen says which is which.
//  - What the glass keeps about the lines it drew ("NVDA +2.3% since you asked": how often,
//    whether it was tapped) is said here too and goes with "Erase notes"; it lasts as long as the ledger.
//  - Facts and what Bobby does, never what the person "is": "Asked 3 times, last on Oct 5.",
//    "Follow-ups arrive around 7:00 PM.". What the person said is said as theirs ("You saved a
//    read, to review in a week."). No sentence promises anything about a verdict.
//  - The header states a construction fact: these notes are not sent to the AI. What is read from
//    the ledger and leaves the phone is an asset's symbol, in two ways only: inside a question the
//    person sees and sends by their own tap (HarnessCopy.changedQuestion, lookQuestion), and, with
//    no tap, in the request for that asset's price that draws the number on the glass and on the
//    week's board (HarnessCenter.market: the quote endpoint, nothing else of the ledger).

/** The stored fields of an event, one case each (`raw` is the property's name in `HarnessEvent`). */
enum class HarnessEventField(val raw: String) {
    KIND("kind"), AT("at"), SYMBOL("symbol"), NAME("name"), IS_EQUITY("isEquity"), PRICE("price"), STEP("step"), SECTOR("sector"),
    REF("ref"), ORIGIN("origin"), THREAD("thread"), HORIZON("horizon"), HORIZON_HOURS("horizonHours"),
}

/** The fields of the profile, one case each (`raw` is the property's name in `HarnessProfile`). */
enum class HarnessProfileField(val raw: String) {
    INTEREST("interest"), HOUR("hour"), SENT("sent"), ANSWERED("answered"), IGNORED("ignored"),
}

data class HarnessNotes(
    /** Most recently asked about first. */
    val assets: List<Asset> = emptyList(),
    /** What Bobby does with the notes, and what is kept about no asset in particular. */
    val general: List<String> = emptyList(),
    val mode: HarnessMode = HarnessMode.UNDECIDED,
) {
    /** Whether something an event carries is said on the Memory screen, or why it is not. */
    sealed class Told {
        /** The sentence (or the place) that says it. */
        data class Said(val where: String) : Told()

        /** Internal, with the reason. */
        data class Kept(val why: String) : Told()
    }

    /** What is kept about one asset. */
    data class Asset(
        val symbol: String,
        /** What happened, then what the person said, then what Bobby will do. */
        val lines: List<String>,
        /**
         * False when all that is kept is the pointer to a thesis: the thesis is what the person
         * erases (My theses), and its pointer goes with it.
         */
        val erasable: Boolean,
    ) {
        /** One paragraph, for TalkBack. */
        val text: String get() = lines.joinToString(" ")
    }

    val isEmpty: Boolean get() = assets.isEmpty() && general.isEmpty()

    /** The whole section when nothing is kept: one quiet line. */
    fun quietLine(copy: HarnessCopy): String =
        if (mode == HarnessMode.OFF) copy.text("Follow-ups are off.", "El seguimiento está apagado.") else copy.text("No follow-up notes.", "Sin notas de seguimiento.")

    /** What one asset's notes hold while they are being read from the ledger. */
    private class Tally {
        /** Questions they asked in their own words, and the last of them. */
        var asks = 0
        var lastAsked: Long? = null
        /** Reads whose question Bobby wrote (a follow-up's button, a board row, a chip). */
        var started = 0
        /** The last read of either kind: the order of the rows. */
        var lastRead: Long? = null
        var named: HarnessHorizon? = null
        var saved = false
        var savedHours: Int? = null
        var thesis = false
        var thesisHorizon: HarnessHorizon? = null
        /** Something other than a thesis pointer is kept. */
        var own = false
    }

    companion object {
        /**
         * Every field of an event, decided. Exhaustive: a new field has no case here until someone
         * has said where the person reads it, or why they do not.
         */
        fun told(field: HarnessEventField): Told = when (field) {
            HarnessEventField.KIND -> Told.Said("each kind has its sentence or its count (the `when` in `make`)")
            HarnessEventField.AT -> Told.Said("the day of their last question, and the days Bobby comes back")
            HarnessEventField.SYMBOL -> Told.Said("the title of the asset's row")
            HarnessEventField.ORIGIN -> Told.Said("“N reads from questions Bobby wrote.”, apart from “Asked N times”")
            HarnessEventField.HORIZON -> Told.Said("“Your question was about …” and “Your thesis looks … ahead.”")
            HarnessEventField.HORIZON_HOURS -> Told.Said("“You saved a read, to review in …”")
            HarnessEventField.STEP -> Told.Said("“Follow-ups: N shown, N tapped, N answered.” counts every kind together")
            HarnessEventField.NAME -> Told.Kept("the asset's display name: it says nothing the symbol in the row's title does not")
            HarnessEventField.IS_EQUITY -> Told.Kept("stock or crypto: it only chooses which bound the number on the glass is held to")
            HarnessEventField.PRICE -> Told.Kept("the price at the question, kept to say how far the asset moved since; the move is shown on the glass, the price nowhere")
            HarnessEventField.SECTOR -> Told.Kept("which sector a sector follow-up was about; no chain that ships sends one")
            HarnessEventField.REF -> Told.Kept("which follow-up a tap or an answer belongs to, so neither is counted twice")
            HarnessEventField.THREAD -> Told.Kept("a second question of their own about the same read: it is one of “Asked N times”; the mark only makes that asset weigh more when the week picks the one it names")
        }

        /** At most 20 words in every language, and a fact about how the app is built, not a promise. */
        fun header(copy: HarnessCopy): String = copy.text(
            "Notes Bobby keeps on this phone to choose when to come back. They are not sent to the AI.",
            "Notas que Bobby guarda en este teléfono para elegir cuándo volver. No se envían a la IA.")

        fun eraseAll(copy: HarnessCopy): String = copy.text("Erase notes", "Borrar notas")
        fun eraseOne(copy: HarnessCopy): String = copy.text("Erase", "Borrar")
        fun eraseLabel(copy: HarnessCopy, symbol: String): String = copy.text("Erase the notes about {0}", "Borrar las notas de {0}", symbol)

        /** `drawn`: how many lines the glass still has a history for (HarnessCenter.linesKept). */
        fun make(whole: HarnessLedger, mode: HarnessMode, upcoming: List<HarnessFollowUp>, now: Long, zone: ZoneId, copy: HarnessCopy,
                 drawn: Int = 0, options: HarnessPlanner.Options = HarnessPlanner.Options()): HarnessNotes {
            val ledger = whole.upTo(now)
            val kept = LinkedHashMap<String, Tally>()
            var shown = 0
            var tapped = 0
            var answered = 0
            for (event in ledger.events) {
                fun asset(): Tally? = event.symbol?.let { symbol -> kept.getOrPut(symbol) { Tally() } }
                when (event.kind) {
                    HarnessEvent.Kind.ASK -> asset()?.let { notes ->
                        if (event.isQuestion) {
                            // What the planner follows up: the count, the day and the horizon are of these only.
                            notes.asks += 1
                            notes.lastAsked = event.at
                            // `UNSPECIFIED` is the absence of a horizon: there is nothing to say about it.
                            val horizon = event.horizon
                            if (horizon != null && horizon != HarnessHorizon.UNSPECIFIED) notes.named = horizon
                        } else {
                            notes.started += 1
                        }
                        notes.lastRead = event.at
                        notes.own = true
                    }
                    HarnessEvent.Kind.SAVED -> asset()?.let { notes ->
                        notes.saved = true
                        notes.savedHours = event.horizonHours
                        notes.own = true
                    }
                    HarnessEvent.Kind.THESIS -> asset()?.let { notes ->
                        notes.thesis = true
                        notes.thesisHorizon = event.horizon
                    }
                    // Internal: the tap that started one of the reads counted under `ASK` (the line on
                    // the glass, a board row, the question Bobby wrote). It only keeps the asset listed.
                    HarnessEvent.Kind.PICKED -> asset()?.let { notes -> notes.own = true }
                    HarnessEvent.Kind.SENT -> shown += 1
                    HarnessEvent.Kind.OPENED -> tapped += 1
                    HarnessEvent.Kind.RETURNED -> answered += 1
                    // Never kept: the ledger refuses it (HarnessLedger.note).
                    HarnessEvent.Kind.APP_OPEN -> Unit
                }
            }

            val order = kept.keys.sortedWith(compareByDescending<String> { kept[it]?.lastRead ?: Long.MIN_VALUE }.thenBy { it })
            val assets = ArrayList<Asset>()
            for (symbol in order) {
                val asset = kept[symbol] ?: continue
                val lines = ArrayList<String>()
                val last = asset.lastAsked
                if (last != null) {
                    val day = copy.day(last, zone)
                    lines.add(if (asset.asks <= 1) copy.text("Asked once, on {0}.", "Preguntaste una vez, el {0}.", day)
                              else copy.text("Asked {0} times, last on {1}.", "Preguntaste {0} veces, la última el {1}.", asset.asks, day))
                }
                if (asset.started == 1) {
                    lines.add(copy.text("One read from a question Bobby wrote.", "Una lectura desde una pregunta que escribió Bobby."))
                } else if (asset.started > 1) {
                    lines.add(copy.text("{0} reads from questions Bobby wrote.", "{0} lecturas desde preguntas que escribió Bobby.", asset.started))
                }
                val named = asset.named
                if (named != null) namedSentence(named, copy)?.let { lines.add(it) }
                if (asset.saved) lines.add(savedSentence(asset.savedHours, copy))
                if (asset.thesis) lines.add(thesisSentence(asset.thesisHorizon, copy))
                val next = upcoming.firstOrNull { it.step != HarnessStep.WEEK && it.symbol == symbol && it.fireAt > now }
                if (next != null) lines.add(copy.text("Bobby comes back on {0}.", "Bobby vuelve el {0}.", copy.day(next.fireAt, zone)))
                assets.add(Asset(symbol, lines, asset.own))
            }

            val general = ArrayList<String>()
            val week = upcoming.firstOrNull { it.step == HarnessStep.WEEK && it.fireAt > now }
            if (week != null) general.add(copy.text("Your week arrives on {0}.", "Tu semana llega el {0}.", copy.day(week.fireAt, zone)))
            val profile = HarnessProfile.make(ledger, now, zone)
            for (field in HarnessProfileField.entries) {
                when (field) {
                    // Internal: one weight per asset, computed from the events said above and from
                    // nothing else. It chooses which asset the week names, and that asset is listed.
                    HarnessProfileField.INTEREST -> Unit
                    HarnessProfileField.HOUR -> {
                        // Only once the planner really uses it (three answers), and as the planner uses it.
                        val learned = profile.hour
                        if (mode == HarnessMode.ON && learned != null) {
                            val hour = copy.hour(minOf(maxOf(learned, options.earliestHour), options.latestHour))
                            general.add(copy.text("Follow-ups arrive around {0}.", "El seguimiento llega hacia las {0}.", hour))
                        }
                    }
                    // Internal: thirty-day counts of the follow-ups shown and answered. The same events
                    // are said in full, over everything the ledger holds, in the count below.
                    HarnessProfileField.SENT, HarnessProfileField.ANSWERED -> Unit
                    HarnessProfileField.IGNORED -> if (mode == HarnessMode.ON) {
                        val streak = ledger.unansweredStreak(now)
                        val lastShown = streak.last
                        if (streak.count >= options.quietAfter && lastShown != null && now - lastShown < options.quietDays * HARNESS_DAY_MS) {
                            val day = copy.day(lastShown + options.quietDays * HARNESS_DAY_MS, zone)
                            general.add(copy.text("Quiet until {0}.", "En silencio hasta el {0}.", day))
                        } else if (HarnessStep.entries.any { it in options.chain && profile.rests(it) }) {
                            general.add(copy.text("Fewer follow-ups for now.", "Menos seguimiento por ahora."))
                        }
                    }
                }
            }
            if (shown + tapped + answered > 0) {
                general.add(copy.text("Follow-ups: {0} shown, {1} tapped, {2} answered.", "Seguimientos mostrados: {0}. Tocados: {1}. Respondidos: {2}.", shown, tapped, answered))
            }
            // Not in the ledger: the glass's own count of the lines it drew, one per asset and question.
            if (drawn > 0) {
                general.add(copy.text("“Since you asked” lines shown: {0}.", "Líneas “desde que preguntaste” mostradas: {0}.", drawn))
            }
            return HarnessNotes(assets, general, mode)
        }

        // What the person said

        /** The horizon the words of their question named (the desk reads it with fixed rules, no model). */
        private fun namedSentence(named: HarnessHorizon, copy: HarnessCopy): String? = when (named) {
            HarnessHorizon.INTRADAY -> copy.text("Your question was about today.", "Tu pregunta era sobre hoy.")
            HarnessHorizon.WEEK -> copy.text("Your question was about this week.", "Tu pregunta era sobre esta semana.")
            HarnessHorizon.MONTH -> copy.text("Your question was about this month.", "Tu pregunta era sobre este mes.")
            HarnessHorizon.LONG -> copy.text("Your question was about months or years.", "Tu pregunta era sobre meses o años.")
            HarnessHorizon.UNSPECIFIED -> null
        }

        /** The review they chose when they saved a read (24, 72 or 168 hours), when they were offered one. */
        private fun savedSentence(savedHours: Int?, copy: HarnessCopy): String = when (savedHours) {
            24 -> copy.text("You saved a read, to review in a day.", "Guardaste una lectura, para revisar en un día.")
            72 -> copy.text("You saved a read, to review in 3 days.", "Guardaste una lectura, para revisar en 3 días.")
            168 -> copy.text("You saved a read, to review in a week.", "Guardaste una lectura, para revisar en una semana.")
            else -> copy.text("You saved a read.", "Guardaste una lectura.")
        }

        /** A thesis they wrote and keep active, with the horizon they set on it (weeks, or longer). */
        private fun thesisSentence(horizon: HarnessHorizon?, copy: HarnessCopy): String = when (horizon) {
            HarnessHorizon.MONTH -> copy.text("Your thesis looks weeks ahead.", "Tu tesis mira a semanas.")
            HarnessHorizon.LONG -> copy.text("Your thesis looks months or more ahead.", "Tu tesis mira a meses o más.")
            else -> copy.text("You wrote a thesis about it.", "Escribiste una tesis sobre este activo.")
        }
    }
}
