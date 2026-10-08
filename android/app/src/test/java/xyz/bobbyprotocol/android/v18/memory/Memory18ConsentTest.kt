package xyz.bobbyprotocol.android.v18.memory

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.MemoryKeyValueStore
import xyz.bobbyprotocol.android.v18.MemoryReceipt
import xyz.bobbyprotocol.android.v18.NucleoNudge
import xyz.bobbyprotocol.android.v18.NudgeMoment
import xyz.bobbyprotocol.android.v18.NudgeRead
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.theses.CatalogWords
import java.io.IOException

/**
 * Memory consent (ios/Bobby/Tests/Memory18ConsentTests.swift): the answer is a record per account
 * and per phone, a decline is remembered, "Remember" turns memory on step by step and stops
 * honestly when a step fails, and the stored switch the transport reads is on only after
 * "Remember" to the consent as it reads today (a switch without that record, or a yes to an older
 * wording, affirms nothing). The sheet says what the server really sends to the AI provider. No
 * request leaves the process: the centre's gateway is a fake.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class Memory18ConsentTest {
    private val words = CatalogWords()

    /** A signed-in phone ("a"), a server that answers, and the centre over both. */
    private class Phone(scope: TestScope, user: String? = "a") {
        val bench = V18TestBench(scope.backgroundScope)
        val gateway = FakeMemoryGateway { bench.desk.owner }
        val clock: Long get() = bench.clock
        val consent: MemoryConsent get() = MemoryConsent(bench.store)

        init {
            bench.changeAccount(user)
            gateway.reply = { _, _, _ -> FakeMemoryGateway.ok() }
        }

        fun center(): MemoryCenter = MemoryCenter(bench.host, gateway)
        fun model(center: MemoryCenter): MemoryConsentModel = MemoryConsentModel(center)
    }

    // The record

    @Test fun theRecordIsKeptPerAccountUnderAHashAndPerVersion() {
        val store = MemoryKeyValueStore()
        val clock = 1_800_000_000_000L
        val consent = MemoryConsent(store)
        assertNull(consent.record("a"))
        assertFalse(consent.hasDecided("a"))
        consent.set(true, "a", clock)
        assertEquals(MemoryConsentRecord(MemoryConsent.CURRENT_VERSION, clock, true), consent.record("a"))
        assertTrue(consent.hasDecided("a"))
        assertTrue(consent.hasAccepted("a"))
        assertNull("one account's answer is never another's", consent.record("b"))
        assertFalse(consent.hasDecided("b"))
        val reworded = MemoryConsent(store, MemoryConsent.CURRENT_VERSION + 1)
        assertEquals("the old answer is still readable", MemoryConsent.CURRENT_VERSION, reworded.record("a")?.version)
        assertFalse("a new consent version asks again", reworded.hasDecided("a"))
        assertFalse("and a yes to the old wording is not a yes to the new one", reworded.hasAccepted("a"))
        assertEquals(1, MemoryConsent.CURRENT_VERSION)

        val key = MemoryConsent.key("a")
        assertTrue(key.startsWith(MemoryConsent.KEY_PREFIX))
        assertEquals("the key is the SHA-256 of the account id", MemoryConsent.KEY_PREFIX.length + 64, key.length)
        assertTrue("lowercase hex, as the repository names its own per-account entries", Regex("^[0-9a-f]{64}$").matches(MemoryConsent.digest("a")))
        assertEquals("the same account always has the same entry", MemoryConsent.digest("a"), MemoryConsent.digest("a"))
        assertNotEquals(key, MemoryConsent.key("b"))
        assertFalse("the account id itself is not in the key", MemoryConsent.key("someone@example.com").contains("someone"))
        assertTrue(store.getString(key) != null)
        assertEquals("it survives a relaunch", true, MemoryConsent(store).record("a")?.accepted)
        store.putString(MemoryConsent.key("c"), "not json")
        assertNull("a record that cannot be read is no answer", consent.record("c"))
        consent.clear("a")
        assertNull(consent.record("a"))
    }

    @Test fun aDeclineIsRememberedAndTurnsNothingOn() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        val model = phone.model(center)
        model.decline()
        assertEquals(MemoryConsentRecord(1, phone.clock, false), phone.consent.record("a"))
        assertTrue("the offer does not come back", phone.consent.hasDecided("a"))
        assertFalse(phone.consent.hasAccepted("a"))
        assertTrue("saying no sends nothing", phone.gateway.calls.isEmpty())
        assertFalse(center.nativeOptedIn)
        assertFalse(center.allowsNativeCapture())
        assertFalse(phone.gateway.stored("a"))
        assertEquals(MemoryConsentModel.Phase.ASKING, model.phase)
        // Signing out and in as someone else: that person has not been asked.
        phone.bench.changeAccount("b")
        model.accountChanged()
        assertFalse(phone.consent.hasDecided("b"))
    }

    @Test fun aDeclineAlsoLeavesAnEarlierOptInOff() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        assertTrue("the 1.1.4 switch had been on", center.setNativeCapture(true))
        assertTrue(phone.gateway.stored("a"))
        phone.model(center).decline()
        assertFalse("no means this phone stays out of memory", center.nativeOptedIn)
        assertFalse(phone.gateway.stored("a"))
    }

    // "Remember"

    @Test fun rememberReadsThenOptsInThenRecordsAndNeverBefore() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        val model = phone.model(center)
        assertFalse("nothing is on before the answer", center.allowsNativeCapture())
        assertFalse(phone.gateway.stored("a"))
        assertTrue(model.remember())
        assertEquals(MemoryConsentModel.Phase.DONE, model.phase)
        assertEquals("memory was already on for the account: one read, no write", listOf("GET"), phone.gateway.methods)
        assertTrue(center.nativeOptedIn)
        assertTrue(center.allowsNativeCapture())
        assertTrue(phone.gateway.stored("a"))
        assertFalse(phone.gateway.stored("b"))
        assertEquals(MemoryConsentRecord(1, phone.clock, true), phone.consent.record("a"))
        assertFalse("a second tap does nothing", model.remember())
        assertEquals(1, phone.gateway.calls.size)
    }

    @Test fun rememberResumesAPausedAccountMemoryFirst() = runTest {
        val phone = Phone(this)
        var enabled = false
        phone.gateway.reply = { _, method, body ->
            if (method == "PATCH" && body?.opt("memoryEnabled") == true) enabled = true
            FakeMemoryGateway.ok(enabled = enabled)
        }
        val center = phone.center()
        assertTrue(phone.model(center).remember())
        assertEquals(listOf("GET", "PATCH"), phone.gateway.methods)
        assertEquals(true, phone.gateway.calls.last().body?.opt("memoryEnabled"))
        assertEquals("the write only resumes memory", 1, phone.gateway.calls.last().body?.length())
        assertTrue(center.allowsNativeCapture())
        assertTrue(phone.consent.hasAccepted("a"))
    }

    @Test fun rememberStopsAtTheFirstStepTheServerRefusesAndSaysSo() = runTest {
        val phone = Phone(this)
        // 1. The read fails: no write, nothing on, nothing recorded.
        phone.gateway.reply = { _, _, _ -> MemoryReply(JSONObject().put("error", "down"), 503) }
        var center = phone.center()
        var model = phone.model(center)
        assertFalse(model.remember())
        assertEquals(MemoryConsentModel.Phase.FAILED, model.phase)
        assertEquals(listOf("GET"), phone.gateway.methods)
        assertFalse(center.nativeOptedIn)
        assertNull("a failure is not an answer", phone.consent.record("a"))

        // 2. Memory is paused and the server refuses to resume it.
        phone.gateway.calls.clear()
        phone.gateway.reply = { _, method, _ -> if (method == "GET") FakeMemoryGateway.ok(enabled = false) else MemoryReply(JSONObject().put("error", "no"), 403) }
        center = phone.center()
        model = phone.model(center)
        assertFalse(model.remember())
        assertEquals(MemoryConsentModel.Phase.FAILED, model.phase)
        assertEquals(listOf("GET", "PATCH"), phone.gateway.methods)
        assertFalse(center.allowsNativeCapture())
        assertNull(phone.consent.record("a"))

        // 3. The server answers the resume but memory is still paused: still not on.
        phone.gateway.calls.clear()
        phone.gateway.reply = { _, _, _ -> FakeMemoryGateway.ok(enabled = false) }
        center = phone.center()
        model = phone.model(center)
        assertFalse(model.remember())
        assertEquals(MemoryConsentModel.Phase.FAILED, model.phase)
        assertFalse(center.nativeOptedIn)
        assertNull(phone.consent.record("a"))

        // 4. The network is gone.
        phone.gateway.calls.clear()
        phone.gateway.reply = { _, _, _ -> throw IOException("offline") }
        center = phone.center()
        model = phone.model(center)
        assertFalse(model.remember())
        assertEquals(MemoryConsentModel.Phase.FAILED, model.phase)
        assertFalse(center.nativeOptedIn)
        assertFalse(phone.gateway.stored("a"))

        // The person may try again, and it works once the server does.
        phone.gateway.reply = { _, _, _ -> FakeMemoryGateway.ok() }
        assertTrue(model.remember())
        assertEquals(MemoryConsentModel.Phase.DONE, model.phase)
        assertTrue(phone.consent.hasAccepted("a"))
        assertTrue(phone.gateway.stored("a"))
    }

    @Test fun rememberWaitsForTheRiskNoticeAndAnAccount() = runTest {
        val phone = Phone(this)
        phone.bench.desk.riskNotice = RiskNotice.WITHDRAWN
        val center = phone.center()
        val model = phone.model(center)
        assertFalse(model.remember())
        assertTrue("no network before the risk notice", phone.gateway.calls.isEmpty())
        assertNull(phone.consent.record("a"))
        assertFalse(phone.gateway.stored("a"))
        phone.bench.desk.riskNotice = RiskNotice.OUTDATED
        assertFalse("nor under a notice the person has not read yet", model.remember())
        assertTrue(phone.gateway.calls.isEmpty())
        phone.bench.desk.riskNotice = RiskNotice.ACCEPTED
        phone.bench.changeAccount(null)
        model.accountChanged()
        assertFalse(model.signedIn)
        assertFalse(model.remember())
        assertTrue("nobody signed in: nothing to turn on", phone.gateway.calls.isEmpty())
        model.decline()
        assertNull("and nothing to record", phone.consent.record("a"))
        assertTrue(phone.gateway.bits.values.none { it })
    }

    @Test fun aLateReplyAfterAnAccountSwitchTurnsNothingOnForAnyone() = runTest {
        val phone = Phone(this)
        val pending = CompletableDeferred<MemoryReply>()
        phone.gateway.reply = { _, _, _ -> pending.await() }
        val center = phone.center()
        val model = phone.model(center)
        val answer = async { model.remember() }
        runCurrent()
        assertEquals(MemoryConsentModel.Phase.WORKING, model.phase)
        phone.bench.changeAccount("b")
        center.accountChanged()
        pending.complete(FakeMemoryGateway.ok())
        assertFalse(answer.await())
        assertEquals("B sees the question, not A's outcome", MemoryConsentModel.Phase.ASKING, model.phase)
        assertNull(phone.consent.record("a"))
        assertNull(phone.consent.record("b"))
        assertFalse(phone.gateway.stored("a"))
        assertFalse(phone.gateway.stored("b"))
        assertFalse(center.allowsNativeCapture())
        assertFalse(center.loading)
    }

    // What the sheet says

    /**
     * The consent says what the server's reader context really sends (api/_lib/user-memory.ts,
     * readerContext): the first name, the asset's history, the preferences and the assets asked
     * about most. It never denies the name, and never promises a deletion date.
     */
    @Test fun theConsentSaysWhatIsKeptWhatIsSentForHowLongAndHowToUndoIt() {
        val full = MemoryExplanation.items(words, 90)
        assertEquals(listOf("keep", "sent", "howlong", "control"), full.map { it.id })
        val compact = MemoryExplanation.items(words, 90, compact = true)
        assertEquals("the memory screen also says what reaches the AI provider", listOf("keep", "sent", "howlong"), compact.map { it.id })
        assertEquals("one explanation, the same words", full.take(3), compact)

        assertEquals("Kept by Bobby", full[0].label)
        assertEquals("Asset · date · stated time frame · price that day", full[0].text)
        assertEquals("Your question text is not kept.", full[0].note)
        assertEquals("Sent to the AI that answers", full[1].label)
        assertEquals("Your first name · how often and when you asked about this asset · the time frame you named · its price that day and the change since · your preferences · your most-asked assets",
                     full[1].text)
        assertNull(full[2].label)
        assertEquals("Unused after 90 days without a question.", full[2].text)
        assertEquals("the retention is the server's number", "Unused after 30 days without a question.", MemoryExplanation.items(words, 30)[2].text)
        assertEquals("Edit or delete in Memory.", full[3].text)

        // An inventory, item by item: nothing is folded into "a summary".
        val sent = full[1].text
        assertEquals(6, sent.split(" · ").size)
        for (fact in listOf("first name", "how often and when", "time frame you named", "its price that day", "the change since", "preferences", "most-asked assets")) {
            assertTrue("the sent line names: $fact", sent.contains(fact))
        }
        assertFalse(sent.lowercase().contains("summary"))
        for (item in full) {
            val text = listOfNotNull(item.label, item.text, item.note).joinToString(" ").lowercase()
            if (item.id != "sent") assertFalse("${item.id} must not speak about the name: only the sent line does", text.contains("name"))
            assertFalse("${item.id}: nothing is denied that the server sends", text.contains("never"))
            assertFalse("${item.id}: no retention worded as a deletion guarantee", text.contains("deleted after") || text.contains("for 90 days"))
        }
        assertTrue("the end of use, not a deletion date", full[2].text.contains("Unused after"))

        // The same structure in six languages: every row is translated, and the sent line names the first name.
        val firstName = mapOf("en" to "first name", "es" to "nombre de pila", "fr" to "prénom", "pt" to "primeiro nome", "it" to "il tuo nome", "de" to "vorname")
        val ai = mapOf("en" to "AI", "es" to "IA", "fr" to "IA", "pt" to "IA", "it" to "IA", "de" to "KI")
        words.inEveryLanguage { language ->
            val items = MemoryExplanation.items(words, 90)
            assertEquals(language, listOf("keep", "sent", "howlong", "control"), items.map { it.id })
            assertTrue("$language: ${items[1].text}", items[1].text.lowercase().contains(firstName.getValue(language)))
            assertTrue("$language: the label says who receives it: ${items[1].label}", items[1].label?.contains(ai.getValue(language)) == true)
            assertEquals("$language: six things are sent, each named", 6, items[1].text.split(" · ").size)
            assertTrue(language, items[2].text.contains("90"))
            for (item in items) {
                assertFalse("$language: an unfilled placeholder in ${item.text}", item.text.contains("{"))
                if (item.id != "sent") {
                    for (word in firstName.values) assertFalse("$language ${item.id}: ${item.text}", item.text.lowercase().contains(word))
                }
                if (language != "en") {
                    val english = full.first { it.id == item.id }
                    assertNotEquals("$language ${item.id} is translated", english.text, item.text)
                    if (item.label != null) assertNotEquals("$language ${item.id} label is translated", english.label, item.label)
                }
            }
        }
        val copy = MemoryCopy(words)
        assertTrue(copy.deleteEverythingWarning.contains("the shortcuts on this phone and the theses you wrote here"))
        assertTrue(copy.deleteEverythingWarning.endsWith("It cannot be undone."))
    }

    /**
     * The memory screen says what the code does with what the phone keeps: a thesis's text does
     * leave the phone inside a review, and Forget removes a shortcut, not a thesis.
     */
    @Test fun theMemoryScreenDoesNotOverstateWhatStaysOnThePhoneOrWhatForgetRemoves() {
        val copy = MemoryCopy(words)
        val note = copy.onThisPhoneNote
        assertEquals("Bobby keeps these on this phone, not on its servers. The text of a thesis is sent, with that question, only when you start a review: to Bobby and to the AI providers that write the answer.",
                     note)
        assertFalse(note.lowercase().contains("never leave"))
        assertTrue("what reaches an AI provider is said where it happens", note.contains("AI providers"))
        val deletion = copy.onThisPhoneDeletionNote
        assertEquals("Forget removes an asset's shortcut. Delete everything clears the shortcuts and the theses you wrote.", deletion)
        for (language in listOf("es", "fr", "pt", "it", "de")) {
            words.language = language
            assertNotEquals(language, note, copy.onThisPhoneNote)
            assertNotEquals(language, deletion, copy.onThisPhoneDeletionNote)
            for (line in listOf(copy.onThisPhoneNote, copy.deleteEverythingWarning, copy.paused, copy.error(MemoryError.SIGNED_OUT),
                                copy.notice(MemoryNotice.ErasedEverything), copy.notice(MemoryNotice.ErasedOnPhoneOnly),
                                copy.notice(MemoryNotice.ForgotOnPhoneOnly("NVDA")))) {
                assertFalse("$language: this is not an iPhone: $line", line.contains("iPhone") || line.contains("Apple"))
                assertFalse("$language: $line", line.contains("{"))
            }
        }
        words.language = "en"
    }

    // The consent gates capture

    /**
     * 1.1.4 had a plain switch and no consent record. In 1.8 that switch alone affirms nothing:
     * it is turned off when read, the header stops, and the account is asked through the sheet.
     */
    @Test fun aSwitchWithoutAnAcceptedConsentIsRevokedAndTheAccountIsAskedAgain() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        assertTrue("the state a 1.1.4 install left behind: the switch on, no record", center.setNativeCapture(true))
        assertNull(phone.consent.record("a"))
        assertFalse("the header is not sent", center.allowsNativeCapture())
        assertFalse("and the screen shows \"Turn on\", not a switch that is on", center.nativeOptedIn)
        assertFalse("the switch is revoked, not just ignored", phone.gateway.stored("a"))

        // The same on a fresh launch: a new centre over the stored switch.
        phone.gateway.bits["a"] = true
        val relaunched = phone.center()
        assertFalse(relaunched.nativeOptedIn)
        assertFalse("turned off the moment it was read, before any question could leave", phone.gateway.stored("a"))
        assertFalse(relaunched.allowsNativeCapture())

        // A declined record does not count either.
        phone.gateway.bits["a"] = true
        phone.consent.set(false, "a", phone.clock)
        assertFalse(center.allowsNativeCapture())
        assertFalse(phone.gateway.stored("a"))
        phone.consent.clear("a")

        // The account is offered memory again on the glass, and "Remember" turns it on properly.
        fun live() = MemoryNudges.liveState("a", phone.bench.store, { phone.gateway.stored("a") })
        assertFalse(live().captureOn)
        assertFalse(live().decided)
        val read = NudgeRead("r", "NVDA", "NVDA", true, "wait", false, phone.clock)
        val moment = NudgeMoment(true, phone.clock, read, 1)
        assertEquals(MemoryNudges.offerId("a", now = phone.clock), MemoryNudges.candidate(moment, live(), words)?.id)
        assertTrue(phone.model(center).remember())
        assertTrue(center.allowsNativeCapture())
        assertTrue(center.nativeOptedIn)
        assertNull(MemoryNudges.candidate(moment, live(), words))
    }

    /**
     * The consent text changed (version 2): an account that said yes to version 1 stops sending the
     * header and is offered the new consent; saying yes to it turns capture back on.
     */
    @Test fun acceptedVersionOneUnderVersionTwoSendsNoHeaderAndTheOfferReturns() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        assertTrue(phone.model(center).remember())
        assertTrue(center.allowsNativeCapture())
        assertEquals(1, phone.consent.record("a")?.version)
        val read = NudgeRead("r", "NVDA", "NVDA", true, "wait", false, phone.clock)
        val moment = NudgeMoment(true, phone.clock, read, 1)
        fun live(version: Int) = MemoryNudges.liveState("a", phone.bench.store, { phone.gateway.stored("a") }, version)
        assertNull("under version 1 it is on and answered", MemoryNudges.candidate(moment, live(1), words))

        center.consentVersion = 2
        assertEquals(2, center.consent.version)
        assertFalse("the header is not sent under a consent the person never saw", center.allowsNativeCapture())
        assertFalse(center.nativeOptedIn)
        assertFalse(phone.gateway.stored("a"))
        assertFalse(live(2).captureOn)
        assertFalse(live(2).decided)
        val offer = MemoryNudges.candidate(moment, live(2), words)
        assertEquals("the offer returns, under an id of its own", "memory.offer.v2." + MemoryNudges.fragment("a"), offer?.id)
        assertTrue(NucleoNudge.ID_PATTERN.matches(offer?.id ?: ""))
        // Going back to the old wording does not quietly restore what was revoked.
        center.consentVersion = 1
        assertFalse(center.allowsNativeCapture())

        center.consentVersion = 2
        assertTrue(phone.model(center).remember())
        assertEquals(2, MemoryConsent(phone.bench.store, 2).record("a")?.version)
        assertTrue(center.allowsNativeCapture())
        assertNull(MemoryNudges.candidate(moment, live(2), words))

        // The memory screen's own read (it calls reloadLocal when it appears) applies the same gate.
        center.consentVersion = 3
        assertTrue("not yet re-read", center.nativeOptedIn)
        center.reloadLocal()
        assertFalse("the screen shows \"Turn on\" as soon as it appears", center.nativeOptedIn)
        assertFalse(phone.gateway.stored("a"))
    }

    /**
     * What the transport reads, from the first launch to sign-out: the stored switch is never on
     * before "Remember", off after "Not now", on after "Remember" for this account only, off the
     * moment it is switched off in Memory, and nothing is affirmed signed out.
     */
    @Test fun theStoredSwitchIsNeverOnBeforeRememberAndIsOnAfter() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        val model = phone.model(center)
        assertFalse("before any answer nothing is affirmed", phone.gateway.nativeOptIn())
        // The switch as 1.1.4 left it (on, with no consent record) affirms nothing in 1.8.
        center.refresh()
        assertTrue(center.setNativeCapture(true))
        assertFalse(center.allowsNativeCapture())
        assertFalse("a switch without an accepted consent is turned off", phone.gateway.nativeOptIn())
        model.decline()
        assertFalse("\"Not now\" affirms nothing", phone.gateway.nativeOptIn())
        assertTrue(model.remember())
        assertTrue("after \"Remember\" this account's desk question carries the opt-in", phone.gateway.nativeOptIn())
        assertFalse("another account on this phone never borrows the consent", phone.gateway.stored("b"))
        assertTrue(center.setNativeCapture(false))
        assertFalse("switching it off in Memory stops it at once", phone.gateway.nativeOptIn())
        assertTrue(phone.model(center).remember())
        assertTrue(phone.gateway.nativeOptIn())
        // Pausing the account's memory turns this phone's switch off before the server is even asked.
        phone.gateway.reply = { _, _, _ -> throw IOException("offline") }
        assertFalse(center.setEnabled(false))
        assertFalse("an offline pause cannot leave the phone recording", phone.gateway.nativeOptIn())
        phone.gateway.reply = { _, _, _ -> FakeMemoryGateway.ok() }
        assertTrue(phone.model(center).remember())
        // A server that says memory is paused wins over the switch.
        phone.gateway.reply = { _, _, _ -> FakeMemoryGateway.ok(enabled = false) }
        assertTrue(center.refresh())
        assertFalse(phone.gateway.nativeOptIn())
        assertFalse(center.nativeOptedIn)
        phone.gateway.reply = { _, _, _ -> FakeMemoryGateway.ok() }
        assertTrue(phone.model(center).remember())
        // Withdrawing the risk notice: nothing may be affirmed, whatever is stored.
        phone.bench.desk.riskNotice = RiskNotice.WITHDRAWN
        assertFalse(center.allowsNativeCapture())
        phone.bench.desk.riskNotice = RiskNotice.ACCEPTED
        assertTrue(center.allowsNativeCapture())
        phone.bench.changeAccount(null)
        center.accountChanged()
        assertFalse("signed out: nothing is affirmed", phone.gateway.nativeOptIn())
        assertFalse(center.allowsNativeCapture())
        assertTrue("the choice stays stored for that account only", phone.gateway.stored("a"))
    }

    /**
     * The switch is stored by the repository for ITS account, and the session learns of an account
     * change a moment later. In that moment the centre reads nobody's switch as the reader's and
     * writes nobody's: one account is never affirmed, or switched off, with another's.
     */
    @Test fun whileTheRepositoryIsAheadOfTheSessionNobodysSwitchIsReadOrWritten() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        assertTrue(phone.model(center).remember())
        // B said yes on this phone too.
        phone.gateway.bits["b"] = true
        phone.consent.set(true, "b", phone.clock)
        // The repository already holds B's session; the session still reads A.
        phone.gateway.accountOverride = { "b" }
        assertFalse("A is not affirmed with B's switch", center.allowsNativeCapture())
        center.reloadLocal()
        assertTrue("and B's switch is not turned off for A's reasons", phone.gateway.stored("b"))
        assertTrue(phone.gateway.stored("a"))
        assertFalse("nothing is turned on for an account that is not the reader", center.setNativeCapture(true))
        center.setNativeCapture(false)
        assertTrue("nor switched off by A's hand", phone.gateway.stored("b"))
        // The session catches up: B is the reader, with B's own switch and consent.
        phone.gateway.accountOverride = null
        phone.bench.changeAccount("b")
        center.accountChanged()
        assertTrue(center.allowsNativeCapture())
        assertTrue("A's choice is still stored for A", phone.gateway.stored("a"))
    }

    @Test fun memoryCopyAvoidsTheWordsBobbyNeverUses() {
        val banned = setOf("buy", "sell", "profit", "guaranteed", "returns", "advice", "signal", "alert", "watched", "monitored", "detected")
        val copy = MemoryCopy(words)
        val line = MemoryReceiptLine(words)
        val said = ArrayList<String>()
        for (item in MemoryExplanation.items(words, 90)) said.addAll(listOfNotNull(item.label, item.text, item.note))
        for (error in MemoryError.entries) said.add(copy.error(error))
        for (notice in listOf(MemoryNotice.ErasedEverything, MemoryNotice.ErasedOnPhoneOnly, MemoryNotice.ForgotOnPhoneOnly("NVDA"))) said.add(copy.notice(notice))
        said.addAll(listOf(copy.riskRequired, copy.paused, copy.deleteEverythingWarning, copy.deliveredBriefingsNote, copy.onThisPhoneNote, copy.onThisPhoneDeletionNote))
        for (field in MemoryPref.entries) {
            said.add(copy.prefLabel(field))
            for (value in field.allowed) said.add(copy.optionLabel(field, value))
        }
        for (receipt in listOf(MemoryReceipt(true, 1), MemoryReceipt(true, 3, 5, 4.2), MemoryReceipt(true, 3, 0, -3.1), MemoryReceipt(true, 3, 1, 0.0), MemoryReceipt(true, 9))) {
            said.addAll(line.candidates("NVDA", receipt))
        }
        said.add(words.text("I can pick this up next time", "Puedo retomar esto la próxima vez"))
        said.add(words.text("How it works", "Cómo funciona"))
        said.add(words.text("See memory", "Ver memoria"))
        assertTrue(said.size > 40)
        for (sentence in said) {
            val used = sentence.lowercase().split(Regex("[^\\p{L}]+")).toSet()
            for (word in banned) assertFalse("\"$sentence\" uses \"$word\"", used.contains(word))
            assertFalse(sentence, sentence.contains("!"))
        }
    }
}
