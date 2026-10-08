package xyz.bobbyprotocol.android.v18.theses

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.SavedThesis
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import xyz.bobbyprotocol.android.v18.ThesisReviewNotes
import xyz.bobbyprotocol.android.v18.ThesisRevision
import java.text.Normalizer
import java.time.ZoneOffset

/**
 * The words and the numbers of the thesis screens (ios/Bobby/Tests/ThesisCopyTests.swift):
 * arithmetic done on the phone and left out when a price is missing, the "not checked" list that
 * is always shown, the two verdict words, and a review question that names no time span in any of
 * the six languages. The six languages are the app's real catalogs.
 */
class ThesisCopyTest {
    private val words = CatalogWords()
    private val copy = ThesisCopy(words)
    /** 2026-10-07T12:00:00Z. */
    private val t0 = 1_791_374_400_000L
    private val day = 86_400_000L
    private val utc = ZoneOffset.UTC

    private fun thesis(id: String, revisions: List<ThesisRevision>, lastReviewedAt: Long? = null) = SavedThesis(
        id = id, symbol = "NVDA", name = "NVIDIA", isEquity = true, status = SavedThesis.Status.ACTIVE, horizon = null, hypothesis = "Why",
        worry = "", changeMind = "", createdAtMillis = t0, updatedAtMillis = t0, lastReviewedAtMillis = lastReviewedAt, sourceRequestId = null,
        revisions = revisions)

    private fun revision(id: String, at: Long, kind: ThesisRevision.Kind, price: Double? = null) = ThesisRevision(id, at, kind, price)

    // Then and now

    @Test fun theChangeIsArithmeticOnTheTwoPrices() {
        val up = ThesisThenNow(100.0, t0, 108.9, "2026-10-16T14:30:00Z")
        assertEquals(8.9, up.changePct!!, 1e-9)
        val down = ThesisThenNow(120.5, t0, 96.4, null)
        assertEquals(-20.0, down.changePct!!, 1e-9)
        val flat = ThesisThenNow(64_250.0, t0, 64_250.0, null)
        assertEquals(0.0, flat.changePct!!, 0.0)
        val small = ThesisThenNow(0.0004, t0, 0.0005, null)
        assertEquals(25.0, small.changePct!!, 1e-6)
        assertEquals(ThesisCopy.instant("2026-10-16T14:30:00Z"), up.asOfMillis)
        assertEquals(1_792_161_000_000L, up.asOfMillis)
        assertFalse(up.isEmpty)
    }

    @Test fun aMissingOrUnusablePriceMeansNoChangeIsShown() {
        assertNull(ThesisThenNow(null, t0, 108.9, null).changePct)
        assertNull(ThesisThenNow(100.0, t0, null, null).changePct)
        for (bad in listOf(0.0, -5.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            val then = ThesisThenNow(bad, t0, 100.0, null)
            assertNull("$bad is not a price", then.thenPrice)
            assertNull("a starting date without its price is not shown either", then.thenAtMillis)
            assertNull(then.changePct)
            val now = ThesisThenNow(100.0, t0, bad, null)
            assertNull(now.nowPrice)
            assertNull(now.changePct)
        }
        val nothing = ThesisThenNow(null, null, null, "")
        assertTrue("with neither price the block is left out", nothing.isEmpty)
        assertNull(nothing.asOf)
        assertNull("an unreadable date is not shown as one", ThesisThenNow(1.0, null, 2.0, "last Tuesday").asOfMillis)
    }

    @Test fun thenComesFromTheFirstDatedEntryOfTheThesis() {
        val written = thesis("t1", listOf(revision("r1", t0, ThesisRevision.Kind.CREATED, 120.5), revision("r2", t0 + day, ThesisRevision.Kind.REVIEWED, 130.0)))
        val numbers = ThesisThenNow(written, 132.55, null)
        assertEquals("where it started, not the last review", 120.5, numbers.thenPrice!!, 0.0)
        assertEquals(t0, numbers.thenAtMillis)
        assertEquals(10.0, numbers.changePct!!, 1e-9)
        val unpriced = thesis("t1", listOf(revision("r1", t0, ThesisRevision.Kind.CREATED)))
        assertNull("a thesis written from a read without a price has no change", ThesisThenNow(unpriced, 132.55, null).changePct)
    }

    @Test fun thenIsOnlyEverThePriceTheThesisWasWrittenAt() {
        // Written from a read without a price, then reviewed twice.
        val reviewed = thesis("t2", listOf(revision("r1", t0, ThesisRevision.Kind.CREATED), revision("r2", t0 + day, ThesisRevision.Kind.REVIEWED, 126.1),
                                           revision("r3", t0 + 8 * day, ThesisRevision.Kind.REVIEWED, 124.3)), lastReviewedAt = t0 + 8 * day)
        assertNull("a review's price is not where the thesis started", ThesisCopy.startingPoint(reviewed))
        val numbers = ThesisThenNow(reviewed, 131.2, "2026-10-16T14:30:00Z")
        assertNull(numbers.thenPrice)
        assertNull(numbers.thenAtMillis)
        assertNull(numbers.changePct)
        assertEquals("today's price is shown on its own", 131.2, numbers.nowPrice!!, 0.0)
        assertTrue(numbers.missingStart)
        assertEquals("Oct 7", copy.day(t0, t0, utc))
        assertEquals("the list shows the date and no 'started at'", "Since Oct 7", copy.sinceLine(reviewed, t0 + 9 * day, utc))
        assertFalse(ThesisThenNow(100.0, t0, null, null).missingStart)
        assertEquals("No starting price was saved with this thesis.", copy.noStartingPrice)
        val sentences = HashSet<String>()
        words.inEveryLanguage { sentences.add(copy.noStartingPrice) }
        assertEquals("said in each of the six languages", 6, sentences.size)
    }

    // Where the words go

    @Test fun bothScreensSayTheWordsGoToTheAIProvidersInSixLanguages() {
        val providers = mapOf("en" to "AI providers", "es" to "proveedores de IA", "fr" to "fournisseurs d’IA", "pt" to "fornecedores de IA",
                              "it" to "fornitori di IA", "de" to "KI-Anbieter")
        val saved = HashSet<String>()
        val sent = HashSet<String>()
        words.inEveryLanguage { language ->
            saved.add(copy.localOnly)
            sent.add(copy.sentToProviders)
            for (line in listOf(copy.localOnly, copy.sentToProviders)) {
                assertTrue("$language: names the AI providers, not only Bobby: $line", line.contains(providers.getValue(language)))
                assertTrue(language, line.contains("Bobby"))
                assertFalse("$language: this is not an iPhone: $line", line.contains("iPhone"))
            }
        }
        assertEquals("the line behind the detail button, in each language", 6, saved.size)
        assertEquals("the line above Review now, in each language", 6, sent.size)
        assertEquals("Saved on this phone only. When you ask for a review, your words are sent to Bobby and to the AI providers that write the review. They are not stored there.",
                     copy.localOnly)
        assertEquals("Your thesis text goes to Bobby’s AI providers. Only for this review.", copy.sentToProviders)
        words.language = "es"
        assertEquals("Se guarda solo en este teléfono. Cuando pides una revisión, tus palabras se envían a Bobby y a los proveedores de IA que escriben la revisión. No se guardan allí.",
                     copy.localOnly)
        assertEquals("Tu texto va a proveedores de IA de Bobby. Solo para esta revisión.", copy.sentToProviders)
        words.language = "de"
        assertEquals("Dein Text geht an Bobbys KI-Anbieter. Nur für diese Überprüfung.", copy.sentToProviders)
    }

    @Test fun italianNeverPutsAnArticleInFrontOfADayNumberAndThePersonWritesTheirOwnThesis() {
        words.language = "it"
        val price = "120,50"
        for (date in listOf("1 ott", "8 ott", "11 ott")) {
            assertEquals("Dal giorno $date", words.text("Since {0}", "Desde el {0}", date))
            assertEquals("Dal giorno $date · partita da 120,50", words.text("Since {0} · started at {1}", "Desde el {0} · empezó en {1}", date, price))
            assertEquals("Le analisi gratuite tornano il giorno $date.", words.text("Free reads come back on {0}.", "Las lecturas gratis vuelven el {0}.", date))
        }
        assertEquals("the person writes it; Bobby is not told to", "Scrivo la mia tesi", words.text("Write my thesis", "Escribir mi tesis"))
    }

    @Test fun numbersAreWrittenForPeople() {
        assertEquals("+8.9%", copy.percent(8.94))
        assertEquals("-3.1%", copy.percent(-3.06))
        assertEquals("a rounding crumb is not a move", "0%", copy.percent(0.04))
        assertEquals("0%", copy.percent(-0.04))
        assertEquals("+125%", copy.percent(125.0))
        assertEquals("120.50", copy.price(120.5))
        assertEquals("64,250.00", copy.price(64_250.0))
        assertEquals("0.000423", copy.price(0.000423))
        assertEquals("0.50", copy.price(0.5))
        words.language = "de"
        assertEquals("in the app's locale", "1.234,50", copy.price(1_234.5))
        assertEquals(8, ThesisCopy.days(t0, t0 + (8.9 * day).toLong()))
        assertEquals("never negative", 0, ThesisCopy.days(t0, t0 - day))
    }

    // Not checked

    @Test fun whatBobbyDidNotCheckIsAlwaysListed() {
        val all = listOf("news", "earnings", "filings", "fundamentals", "macro")
        assertEquals("a server that sends nothing: the whole fixed list", all, ThesisCopy.notCheckedCodes(null, true))
        assertEquals(all, ThesisCopy.notCheckedCodes(emptyList(), true))
        assertEquals("codes the app cannot word do not empty the list", all, ThesisCopy.notCheckedCodes(listOf("the moon", ""), true))
        assertEquals("the server's codes, in the app's order", listOf("news", "macro"), ThesisCopy.notCheckedCodes(listOf("macro", "news"), true))
        assertEquals(listOf("earnings"), ThesisCopy.notCheckedCodes(listOf("earnings", "earnings"), false))
        assertEquals(listOf("news", "fundamentals", "macro"), ThesisCopy.notCheckedCodes(null, false))
        assertEquals("every code the wire accepts has words here", ThesisReviewNotes.NOT_CHECKED_CODES, all.toSet())
        assertEquals(listOf("News", "Earnings reports", "Company filings", "Company fundamentals", "The wider economy"), copy.notCheckedWords(null, true))
        assertEquals(listOf("News", "Project fundamentals", "The wider economy"), copy.notCheckedWords(null, false))
        assertNull(copy.notCheckedWord("the moon", true))
        assertNull(copy.notCheckedShort("the moon", true))
    }

    @Test fun theNotCheckedListAndItsSentenceExistInSixLanguages() {
        val sentences = HashSet<String>()
        val scopes = HashSet<String>()
        words.inEveryLanguage { language ->
            for (equity in listOf(true, false)) {
                val listed = copy.notCheckedWords(null, equity)
                assertEquals(language, if (equity) 5 else 3, listed.size)
                assertEquals("$language: each gap has its own words", listed.size, listed.toSet().size)
                assertFalse(language, listed.any { it.isEmpty() })
                sentences.add(copy.priceOnlyLine(equity))
                // The scope line on a finished review names every category, never a shorter list.
                val scope = copy.scopeLine(ThesisCopy.notCheckedCodes(null, equity), equity)
                assertEquals("$language: $scope", if (equity) 5 else 3, scope.substringAfter(": ").split(" · ").size)
                scopes.add(scope)
            }
            sentences.add(copy.footer)
        }
        assertEquals("two price-only sentences and the footer, translated in each language", 18, sentences.size)
        assertEquals("the scope line in each language, for a company and for a project", 12, scopes.size)
        assertEquals("Bobby read price evidence only. This is not a view on the company itself.", copy.priceOnlyLine(true))
        assertEquals("Educational reading.", copy.footer)
        assertEquals("Price evidence only. Not checked: news · earnings · filings · fundamentals · economy",
                     copy.scopeLine(ThesisCopy.NOT_CHECKED_ORDER, true))
        assertEquals("Price evidence only. Not checked: news · project fundamentals · economy", copy.scopeLine(ThesisCopy.NOT_CHECKED_CRYPTO, false))
        assertEquals("Price evidence only.", copy.scopeLine(emptyList(), true))
    }

    // Verdict and horizon

    @Test fun aVerdictIsOnlyEverWaitOrReview() {
        assertEquals("Wait", copy.verdictWord("wait"))
        assertEquals("Review", copy.verdictWord("review"))
        for (other in listOf("buy", "sell", "long", "", "WAIT")) assertNull(other, copy.verdictWord(other))
        assertNull(copy.verdictWord(null))
        val all = HashSet<String>()
        words.inEveryLanguage {
            all.add(copy.verdictWord("wait") ?: "")
            all.add(copy.verdictWord("review") ?: "")
        }
        assertEquals("the same two words the read uses in each language",
                     setOf("Wait", "Review", "Espera", "Revisa", "Attendre", "Réexaminer", "Esperar", "Rever", "Aspetta", "Riesamina", "Abwarten", "Prüfen"), all)
    }

    @Test fun theFourHorizonsAreThePersonsChoicesInSixLanguages() {
        assertEquals(listOf("A few weeks", "A few months", "About a year", "Several years"), ThesisHorizon.entries.map { copy.horizon(it) })
        val labels = HashSet<String>()
        words.inEveryLanguage { ThesisHorizon.entries.forEach { labels.add(copy.horizon(it)) } }
        assertEquals(24, labels.size)
        assertEquals(listOf("Quick", "Deep", "Max"), listOf("rapido", "profundo", "maximo").map { copy.levelName(it) })
    }

    // The review question

    @Test fun theReviewQuestionNamesTheAssetAndNoTimeSpanInAnyLanguage() {
        // Words the desk reads a horizon out of (api/_lib/desk-debate.ts horizonOf), accents removed.
        val horizonWords = setOf("ano", "anos", "year", "years", "ans", "annee", "annees", "anno", "anni", "jahr", "jahre", "jahren", "meses", "months", "mesi",
                                 "monate", "monaten", "mes", "month", "monthly", "mensual", "mois", "mese", "mensile", "monat", "monats", "monatlich",
                                 "semanas", "weeks", "semaines", "settimane", "wochen", "trimestre", "quarter", "semana", "week", "semaine", "settimana",
                                 "woche", "semanal", "weekly", "settimanale", "wochentlich", "dias", "jours", "giorni", "tage", "hoy", "today", "hoje",
                                 "ahora", "agora", "maintenant", "oggi", "adesso", "ora", "heute", "jetzt", "hora", "horas", "hour", "hours", "heure",
                                 "heures", "stunde", "stunden", "intradia", "intraday", "an", "langfristig")
        val questions = HashSet<String>()
        words.inEveryLanguage { language ->
            val question = copy.reviewQuestion("NVDA")
            questions.add(question)
            assertTrue(language, question.contains("NVDA"))
            assertFalse(language, question.contains("{"))
            assertTrue("$language: the desk's question limit", question.length <= 1_200)
            val plain = Normalizer.normalize(question.lowercase(), Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "")
            val used = plain.split(Regex("[^\\p{L}]+")).filter { it.isNotEmpty() }.toSet()
            assertTrue("$language: ${used.intersect(horizonWords)} would be read as a horizon", used.intersect(horizonWords).isEmpty())
            for (phrase in listOf("largo plazo", "long term", "long-term", "longo prazo", "long terme", "lungo termine", "lungo periodo", "right now",
                                  "aujourd", "next days", "proximos dias", "plusieurs mois")) {
                assertFalse("$language: $phrase", plain.contains(phrase))
            }
        }
        assertEquals("one sentence per language", 6, questions.size)
        assertEquals("Review my thesis on NVDA: what does the latest evidence support, what does it challenge, and what is still unknown?",
                     copy.reviewQuestion("NVDA"))
    }

    // Lines the screens show

    @Test fun theLinesOfAThesisAreDatedAndNeverShowAPriceTheReadDidNotCarry() {
        val priced = thesis("t3", listOf(revision("r1", t0, ThesisRevision.Kind.CREATED, 120.5)))
        val unpriced = thesis("t4", listOf(revision("r1", t0, ThesisRevision.Kind.CREATED)))
        val now = t0 + 9 * day
        assertEquals("Since Oct 7 · started at 120.50", copy.sinceLine(priced, now, utc))
        assertEquals("no price, no number", "Since Oct 7", copy.sinceLine(unpriced, now, utc))
        assertEquals("Not reviewed yet", copy.reviewedLine(priced, now))
        assertEquals("Reviewed 5 days ago", copy.reviewedLine(priced.copy(lastReviewedAtMillis = now - 5 * day), now))
        assertEquals("Reviewed 1 day ago", copy.reviewedLine(priced.copy(lastReviewedAtMillis = now - day - 1), now))
        assertEquals("Reviewed today", copy.reviewedLine(priced.copy(lastReviewedAtMillis = now - 3_600_000L), now))
        assertEquals("NVDA · NVIDIA", ThesisCopy.title(priced))
        assertEquals("a name that only repeats the symbol is not shown twice", "NVDA", ThesisCopy.title("NVDA", "nvda"))
        assertEquals("BTC", ThesisCopy.title("BTC", ""))

        // A row of My theses: where its review stands, in plain ink.
        assertEquals("Not reviewed · Oct 7", copy.rowState(priced, now, utc))
        val reviewed = priced.copy(lastReviewedAtMillis = t0 + 2 * day,
                                   revisions = priced.revisions + ThesisRevision("r2", t0 + 2 * day, ThesisRevision.Kind.REVIEWED, 125.0, null, "review"))
        assertEquals("Review · Oct 9", copy.rowState(reviewed, now, utc))
        assertEquals("Oct 9 · 125.00 · Review", copy.pastLine(reviewed.revisions.last(), now, utc))
        assertEquals("a past review without a price shows none", "Oct 7", copy.pastLine(revision("r9", t0, ThesisRevision.Kind.REVIEWED), now, utc))
        assertEquals("another year says which", "Oct 7, 2026", copy.day(t0, t0 + 120 * day, utc))
        assertEquals("October 7", copy.longDay(t0, utc))
        words.language = "es"
        assertEquals("Sin revisar · 7 oct", copy.rowState(priced, now, utc).replace(".", ""))
        words.language = "de"
        assertTrue(copy.rowState(priced, now, utc), copy.rowState(priced, now, utc).startsWith("Nicht überprüft · 7. "))
    }
}
