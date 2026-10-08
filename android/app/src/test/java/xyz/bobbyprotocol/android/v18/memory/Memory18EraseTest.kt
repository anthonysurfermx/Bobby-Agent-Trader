package xyz.bobbyprotocol.android.v18.memory

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.NudgeCenter
import xyz.bobbyprotocol.android.v18.RiskNotice
import xyz.bobbyprotocol.android.v18.ThesisDraft
import xyz.bobbyprotocol.android.v18.V18TestBench
import xyz.bobbyprotocol.android.v18.harness.Harness
import xyz.bobbyprotocol.android.v18.harness.HarnessCenter
import xyz.bobbyprotocol.android.v18.theses.CatalogWords
import java.io.IOException

/**
 * Deletion is complete (ios/Bobby/Tests/Memory18EraseTests.swift): "Forget" also takes the asset
 * out of this phone's shortcuts, and "Delete everything" also clears the shortcuts and the theses
 * written on this phone, for the account that asked and for nobody else. The phone's part never
 * depends on the network, and the screen is told honestly when the server did not confirm its part.
 *
 * The shortcut row itself is the session's (one row per account, tested with the host); here the
 * bench holds the row of whoever is reading.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class Memory18EraseTest {
    private val words = CatalogWords()
    private val copy = MemoryCopy(words)

    /** A phone with shortcuts for its reader and one thesis each for A, B and the signed-out phone. */
    private class Phone(scope: TestScope, user: String? = "a") {
        val bench = V18TestBench(scope.backgroundScope)
        val gateway = FakeMemoryGateway { bench.desk.owner }
        /** Who "Delete everything" told the other 1.8 features to erase. */
        val erased = ArrayList<String?>()

        init {
            for (owner in listOf("a", "b", null)) {
                bench.host.theses.create(ThesisDraft(symbol = "NVDA", name = "NVIDIA", isEquity = true, horizon = null, hypothesis = "Mine, " + (owner ?: "local")),
                                         owner, bench.clock)
            }
            bench.changeAccount(user)
            bench.desk.shortcuts = listOf("NVDA", "BTC")
            bench.host.onEraseEverything { erased.add(it) }
            online()
        }

        /** The server answers: a GET lists NVDA and BTC, a DELETE answers what is left. */
        fun online() {
            gateway.reply = { path, method, _ ->
                if (method != "DELETE") FakeMemoryGateway.ok(listOf("NVDA", "BTC"))
                else FakeMemoryGateway.ok(if (path.contains("symbol=")) listOf("BTC") else emptyList())
            }
        }

        fun offline() {
            gateway.reply = { _, _, _ -> throw IOException("offline") }
        }

        fun center(): MemoryCenter = MemoryCenter(bench.host, gateway)
        val shortcuts: List<String> get() = bench.desk.shortcuts
        fun theses(owner: String?): Int = bench.host.theses.all(owner).size
    }

    // Forget one

    @Test fun forgetAlsoTakesTheAssetOutOfThisAccountsShortcuts() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        assertEquals(LocalMemory(listOf("NVDA", "BTC"), 1), center.local)
        phone.gateway.calls.clear()
        assertTrue(center.forget("NVDA"))
        assertEquals(listOf("api/memory?symbol=NVDA"), phone.gateway.calls.map { it.path })
        assertEquals(listOf("DELETE"), phone.gateway.methods)
        assertEquals(listOf("BTC"), phone.shortcuts)
        assertEquals(listOf("BTC"), center.local.shortcuts)
        assertEquals("forgetting one asset does not touch the theses", 1, phone.theses("a"))
        assertEquals("another account's theses are its own", 1, phone.theses("b"))
        assertNull("the server confirmed: nothing to explain", center.notice)
        assertEquals(listOf("BTC"), center.snapshot?.assets?.map { it.symbol })
        assertTrue("nothing else was erased", phone.erased.isEmpty())
    }

    @Test fun forgetStillClearsThePhoneWhenTheServerDoesNotAnswerAndSaysSo() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        phone.offline()
        assertFalse(center.forget("NVDA"))
        assertEquals("the phone's part needs no network", listOf("BTC"), phone.shortcuts)
        assertEquals(MemoryNotice.ForgotOnPhoneOnly("NVDA"), center.notice)
        assertTrue(copy.notice(center.notice!!).contains("NVDA"))
        assertEquals("the list still shows what the server holds", listOf("NVDA", "BTC"), center.snapshot?.assets?.map { it.symbol })
        assertEquals(MemoryError.UNAVAILABLE, center.lastError)
        phone.gateway.calls.clear()
        assertFalse(center.forget("NVDA&symbol="))
        assertEquals("a malformed symbol deletes nothing anywhere", listOf("BTC"), phone.shortcuts)
        assertTrue(phone.gateway.calls.isEmpty())
        phone.online()
        assertTrue("a symbol the server accepts travels safely in the query", center.forget("^GSPC"))
        assertEquals("api/memory?symbol=%5EGSPC", phone.gateway.calls.last().path)
    }

    /**
     * "Forget" is the one button beside an asset on the face of the Memory screen. What the phone
     * keeps to come back to that asset goes with it: its follow-up notes and the follow-up that was coming.
     */
    @Test fun forgetAlsoErasesTheFollowUpNotesOfThatAssetAndTheFollowUpThatWasComing() = runTest {
        val phone = Phone(this)
        val harness = Harness.center(phone.bench.host)
        runCurrent()
        phone.bench.deliver(symbol = "NVDA")
        assertEquals(HarnessCenter.Outcome.ON, harness.accept())
        assertEquals(listOf("NVDA"), harness.notes.assets.map { it.symbol })
        assertEquals(setOf("v18.follow.asset", "v18.follow.week"), phone.bench.notifier.pendingIds())
        val center = phone.center()
        center.refresh()
        assertTrue(center.forget("NVDA"))
        runCurrent()
        assertTrue("nothing about NVDA is kept to plan from", harness.notes.assets.isEmpty())
        assertTrue(harness.ledger.isEmpty)
        assertTrue("and no notice about it arrives", phone.bench.notifier.pendingIds().isEmpty())
        // The server did not answer: the phone's part is done all the same.
        phone.bench.deliver(requestId = "r2", symbol = "BTC", name = "Bitcoin", isEquity = false)
        assertEquals(listOf("BTC"), harness.notes.assets.map { it.symbol })
        phone.offline()
        assertFalse(center.forget("BTC"))
        runCurrent()
        assertTrue(harness.notes.assets.isEmpty())
    }

    // Delete everything

    @Test fun deleteEverythingClearsServerShortcutsAndThesesForThisAccountOnly() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        phone.gateway.calls.clear()
        assertFalse(center.confirmForgetAll())
        assertEquals("nothing is deleted without the confirmation", listOf("NVDA", "BTC"), phone.shortcuts)
        assertEquals(1, phone.theses("a"))
        center.requestForgetAll()
        center.cancelForgetAll()
        assertEquals("asking and cancelling delete nothing", 1, phone.theses("a"))
        assertTrue(phone.gateway.calls.isEmpty())
        center.requestForgetAll()
        assertTrue(center.confirmForgetAll())
        assertEquals(listOf("DELETE"), phone.gateway.methods)
        assertEquals("a bare DELETE: the contract 1.1.4 already uses", "api/memory", phone.gateway.calls.first().path)
        assertTrue(phone.shortcuts.isEmpty())
        assertEquals(0, phone.theses("a"))
        assertEquals(LocalMemory(), center.local)
        assertEquals(MemoryNotice.ErasedEverything, center.notice)
        assertEquals(0, center.snapshot?.assets?.size)
        assertEquals("another account's theses stay", 1, phone.theses("b"))
        assertEquals("the signed-out phone's thesis stays", 1, phone.theses(null))
        assertEquals("the other 1.8 features erase what they keep for this reader, once", listOf<String?>("a"), phone.erased)
    }

    @Test fun deleteEverythingLeavesTheSwitchOnAndTheNextQuestionRestartsMemory() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        assertTrue(MemoryConsentModel(center).remember())
        center.requestForgetAll()
        assertTrue(center.confirmForgetAll())
        assertEquals(MemoryNotice.ErasedEverything, center.notice)
        assertTrue("memory stays on: the screen says the next question restarts it", center.nativeOptedIn)
        assertTrue(phone.gateway.stored("a"))
        assertTrue(center.snapshot?.enabled == true)
    }

    @Test fun deleteEverythingWorksOnThePhoneWhenTheServerIsUnreachableOrMemoryIsOff() = runTest {
        // The server never answered: there is no snapshot, and the phone's part is still erasable.
        val phone = Phone(this)
        phone.offline()
        var center = phone.center()
        assertFalse(center.refresh())
        assertNull(center.snapshot)
        assertEquals("what the phone keeps shows without the server", LocalMemory(listOf("NVDA", "BTC"), 1), center.local)
        center.requestForgetAll()
        assertTrue(center.confirmingForgetAll)
        assertFalse("the server did not confirm", center.confirmForgetAll())
        assertTrue(phone.shortcuts.isEmpty())
        assertEquals(0, phone.theses("a"))
        assertEquals("and the screen says the server part is still there", MemoryNotice.ErasedOnPhoneOnly, center.notice)
        assertEquals(1, phone.theses("b"))

        // Memory paused on the account and never turned on for this phone: deletion is still there.
        phone.bench.desk.shortcuts = listOf("ETH")
        phone.gateway.reply = { _, _, _ -> FakeMemoryGateway.ok(enabled = false) }
        center = phone.center()
        center.refresh()
        assertFalse(center.nativeOptedIn)
        assertEquals(false, center.snapshot?.enabled)
        center.requestForgetAll()
        assertTrue(center.confirmForgetAll())
        assertTrue(phone.shortcuts.isEmpty())
        assertEquals(MemoryNotice.ErasedEverything, center.notice)

        // Before the risk notice nothing reaches the network; the phone's part is still the person's to erase.
        phone.bench.desk.shortcuts = listOf("SOL")
        phone.gateway.calls.clear()
        phone.online()
        center = phone.center()
        phone.bench.desk.riskNotice = RiskNotice.WITHDRAWN
        center.requestForgetAll()
        assertFalse(center.confirmForgetAll())
        assertTrue("no call before the risk notice", phone.gateway.calls.isEmpty())
        assertTrue(phone.shortcuts.isEmpty())
        assertEquals(MemoryNotice.ErasedOnPhoneOnly, center.notice)
        phone.bench.desk.riskNotice = RiskNotice.ACCEPTED

        // Signed out: there is no account whose memory this could be.
        phone.bench.changeAccount(null)
        phone.bench.desk.shortcuts = listOf("NVDA", "BTC")
        center.accountChanged()
        center.requestForgetAll()
        assertFalse(center.confirmingForgetAll)
        assertEquals(listOf("NVDA", "BTC"), phone.shortcuts)
        assertEquals(1, phone.theses(null))
    }

    /**
     * A guest asks before having an account: the phone keeps their shortcuts and theses under its own
     * owner. The memory screen shows them and "Clear" removes the shortcuts, with no account and no call.
     */
    @Test fun signedOutThePhonesOwnShortcutsShowAndCanBeCleared() = runTest {
        val phone = Phone(this, user = null)
        val center = phone.center()
        assertEquals("what the phone keeps for a guest is visible", LocalMemory(listOf("NVDA", "BTC"), 1), center.local)
        center.reloadLocal()
        assertEquals(listOf("NVDA", "BTC"), center.local.shortcuts)
        center.clearShortcuts()
        assertTrue("the guest's row is gone", phone.shortcuts.isEmpty())
        assertEquals("the theses are not shortcuts", LocalMemory(emptyList(), 1), center.local)
        assertTrue("nothing is sent: there is no account and nothing to tell a server", phone.gateway.calls.isEmpty())
        assertEquals(1, phone.theses("a"))
        assertFalse(center.refresh())
        assertEquals(MemoryError.SIGNED_OUT, center.lastError)
        assertTrue(phone.gateway.calls.isEmpty())
        assertFalse("Forget is the account's: signed out it does nothing", center.forget("NVDA"))
        assertFalse(center.setEnabled(true))
        assertFalse(center.setNativeCapture(true))
        assertTrue(phone.gateway.calls.isEmpty())
        // Signing in shows that account's own, not the guest's.
        phone.bench.changeAccount("a")
        phone.bench.desk.shortcuts = listOf("ETH")
        center.accountChanged()
        assertEquals(LocalMemory(listOf("ETH"), 1), center.local)
        assertNull("the guest's error is not the account's", center.lastError)
    }

    @Test fun aLateDeleteReplyAfterAnAccountSwitchTouchesNothingOfTheNewAccount() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        val pending = CompletableDeferred<MemoryReply>()
        phone.gateway.reply = { _, _, _ -> pending.await() }
        center.requestForgetAll()
        val answer = async { center.confirmForgetAll() }
        runCurrent()
        assertTrue("A's phone part went first", phone.shortcuts.isEmpty())
        assertEquals(0, phone.theses("a"))
        phone.bench.changeAccount("b")
        phone.bench.desk.shortcuts = listOf("NVDA", "BTC")
        center.accountChanged()
        pending.complete(FakeMemoryGateway.ok())
        assertFalse(answer.await())
        assertNull("B is not told about A's deletion", center.notice)
        assertNull(center.snapshot)
        assertEquals(listOf("NVDA", "BTC"), phone.shortcuts)
        assertEquals(1, phone.theses("b"))
        assertEquals("the screen now shows B's own phone-side memory", LocalMemory(listOf("NVDA", "BTC"), 1), center.local)
        assertFalse(center.confirmingForgetAll)
        assertFalse(center.saving)
    }

    // The phone-only section and the receipt

    @Test fun clearingTheShortcutsSendsNothingAndKeepsTheTheses() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.clearShortcuts()
        assertTrue("the shortcuts are cleared on the phone, with no call from this screen", phone.gateway.calls.isEmpty())
        assertTrue(phone.shortcuts.isEmpty())
        assertEquals(LocalMemory(emptyList(), 1), center.local)
        // A thesis written elsewhere in the app shows after a reload.
        phone.bench.host.theses.create(ThesisDraft(symbol = "BTC", name = "Bitcoin", isEquity = false, horizon = null, hypothesis = "Another"), "a", phone.bench.clock)
        center.reloadLocal()
        assertEquals(2, center.local.theses)
    }

    @Test fun aReceiptStopsBeingTrueOnceItsAssetOrEverythingWasErased() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        val readAt = phone.bench.clock
        assertFalse(center.erased(readAt, "NVDA"))
        phone.bench.clock += 60_000L
        center.forget("BTC")
        assertTrue(center.erased(readAt, "btc"))
        assertFalse("only the asset that was forgotten", center.erased(readAt, "NVDA"))
        assertFalse("a later read speaks again", center.erased(phone.bench.clock + 60_000L, "BTC"))
        phone.bench.clock += 60_000L
        center.requestForgetAll()
        center.confirmForgetAll()
        assertTrue(center.erased(readAt, "NVDA"))
        assertFalse(center.erased(phone.bench.clock + 1, "NVDA"))
        phone.bench.changeAccount("b")
        assertFalse("B erased nothing", center.erased(readAt, "NVDA"))
    }

    @Test fun whatWasErasedIsStillKnownAfterTheScreenIsRebuilt() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        center.refresh()
        val readAt = phone.bench.clock
        phone.bench.clock += 60_000L
        center.forget("NVDA")
        // A rotation rebuilds the centre; the app (and its nudge centre) is the same one.
        val rebuilt = phone.center()
        assertTrue("a receipt for NVDA must still not speak", rebuilt.erased(readAt, "NVDA"))
        assertFalse(rebuilt.erased(readAt, "BTC"))
        // Another launch of the app knows nothing of it: it is never written to disk.
        assertFalse(Phone(this).center().erased(readAt, "NVDA"))
    }

    @Test fun theNoticesSayWhatHappenedInTheAppsOwnWords() {
        assertTrue(copy.notice(MemoryNotice.ErasedEverything).contains("the shortcuts on this phone and the theses you wrote here"))
        assertTrue(copy.notice(MemoryNotice.ErasedOnPhoneOnly).contains("did not confirm"))
        assertTrue(copy.notice(MemoryNotice.ForgotOnPhoneOnly("BRK.B")).contains("BRK.B"))
        assertEquals("Memory is unavailable right now.", copy.error(MemoryError.UNAVAILABLE))
        assertEquals("That did not save. Try again.", copy.error(MemoryError.REJECTED))
        assertEquals("Sign in so Bobby can remember your assets and preferences.", copy.error(MemoryError.SIGNED_OUT))
    }

    // What the server sent, as the screen reads it

    @Test fun theSnapshotKeepsOnlyWhatItCanReadAndNeverInventsACount() = runTest {
        val phone = Phone(this)
        val center = phone.center()
        phone.gateway.reply = { _, _, _ ->
            MemoryReply(FakeMemoryGateway.memory(listOf("NVDA", "not a symbol", "BRK.B")).put("prefs", org.json.JSONObject().put("horizon", "week").put("risk", "extreme"))
                .put("retentionDays", 30), 200)
        }
        assertTrue(center.refresh())
        val snapshot = center.snapshot!!
        assertEquals("a symbol the app cannot name is left out", listOf("NVDA", "BRK.B"), snapshot.assets.map { it.symbol })
        assertEquals(2, snapshot.assets.first().asks)
        assertNotNull(snapshot.assets.first().lastAskedAtMillis)
        assertEquals("week", snapshot.value(MemoryPref.HORIZON))
        assertNull("a value outside the server's own list is not a preference", snapshot.value(MemoryPref.RISK))
        assertNull(snapshot.value(MemoryPref.EXPERIENCE))
        assertEquals("the retention is the server's number", 30, snapshot.retentionDays)
        assertNull("a body without its switch is not a snapshot", MemorySnapshot.fromJson(org.json.JSONObject().put("assets", org.json.JSONArray())))
        // "2 times · 14 days ago": whole days, the same unit the server counts in.
        val asked = snapshot.assets.first().lastAskedAtMillis!!
        assertEquals("2 times · 14 days ago", copy.assetLine(snapshot.assets.first(), asked + 14 * 86_400_000L + 5_000L))
        assertEquals("1 time", copy.assetLine(RememberedAsset("BTC", 1, null, "unspecified"), asked))
        assertEquals("2 times · less than a day ago", copy.assetLine(snapshot.assets.first(), asked + 3_600_000L))

        // A preference is corrected one field at a time, and a value the server does not know is refused locally.
        phone.gateway.calls.clear()
        assertFalse(center.setPref(MemoryPref.HORIZON, "forever"))
        assertTrue(phone.gateway.calls.isEmpty())
        assertTrue(center.setPref(MemoryPref.HORIZON, null))
        assertEquals("PATCH", phone.gateway.calls.last().method)
        assertTrue("clearing a preference sends null", phone.gateway.calls.last().body!!.isNull("horizon"))
        assertEquals(1, phone.gateway.calls.last().body!!.length())
    }

    @Test fun accountDeletionRemovesTheConsentAndTheOfferLogOfThatAccountOnly() = runTest {
        val phone = Phone(this)
        MemoryNudges.register(phone.bench.host)
        val store = phone.bench.store
        MemoryConsent(store).set(true, "a", phone.bench.clock)
        MemoryConsent(store).set(false, "b", phone.bench.clock)
        MemoryOfferLog(store).noteOpened("a", phone.bench.clock)
        MemoryOfferLog(store).noteOpened("b", phone.bench.clock)
        phone.bench.host.accountDeleted("a")
        assertNull(MemoryConsent(store).record("a"))
        assertNull(MemoryOfferLog(store).entry("a"))
        assertNotNull("another account's answer stays", MemoryConsent(store).record("b"))
        assertNotNull(MemoryOfferLog(store).entry("b"))
        assertEquals("its theses went with it (the host), and nobody else's", 0, phone.theses("a"))
        assertEquals(1, phone.theses("b"))
    }

    @Test fun deleteEverythingAlsoTakesTheReceiptsOutOfTheHistoryOfWhatTheGlassSaid() = runTest {
        // A receipt's id carries the asset ("memory.kept.<account>.nvda"). The history of what the glass
        // said is kept for months so that "never again" holds: after "Delete everything" it must not be
        // the one place on the phone that still names what the person asked about.
        val phone = Phone(this)
        MemoryNudges.register(phone.bench.host)
        val nudges = phone.bench.nudges
        val receipt = MemoryNudges.receiptId("NVDA", "a")!!
        val offer = MemoryNudges.offerId("a", now = phone.bench.clock)!!
        nudges.retire(receipt)
        nudges.retire(offer)
        val key = NudgeCenter.storeKey("a")
        assertTrue((phone.bench.store.getString(key) ?: "").contains("nvda"))

        val center = phone.center()
        center.requestForgetAll()
        assertTrue(center.confirmForgetAll())
        assertFalse("no remembered asset is named in the nudge history", (phone.bench.store.getString(key) ?: "").contains("nvda"))
        assertFalse(nudges.isRetired(receipt))
        assertTrue("the answer to the offer names nothing and stays", nudges.isRetired(offer))
    }
}
