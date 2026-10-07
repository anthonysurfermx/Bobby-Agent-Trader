package xyz.bobbyprotocol.android

import android.os.Build
import android.util.Xml
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import org.json.JSONArray
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.xmlpull.v1.XmlPullParser
import xyz.bobbyprotocol.android.data.AccountVersion
import xyz.bobbyprotocol.android.ui.LandPractice
import xyz.bobbyprotocol.android.ui.LandPracticePersistence
import xyz.bobbyprotocol.android.ui.LandPracticeState
import xyz.bobbyprotocol.android.ui.LandPracticeUpdate
import xyz.bobbyprotocol.android.ui.PracticeFootprint
import xyz.bobbyprotocol.android.ui.PracticePersistenceError
import xyz.bobbyprotocol.android.ui.PracticePersistenceResult

/** Real SharedPreferences and XML durability on the disposable emulator; no account or transport. */
@RunWith(AndroidJUnit4::class)
class LandPracticeStorageInstrumentedTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val preferenceName = "bobby.traderLandPractice.instrumented"
    private val preferences get() = context.getSharedPreferences(preferenceName, 0)
    private var account = AccountVersion(null, 0)
    private lateinit var catalog: Map<String, PracticeFootprint>
    private lateinit var fixture: LandPracticeState

    @Before fun setUp() {
        assumeTrue(Build.HARDWARE in setOf("ranchu", "goldfish"))
        assertTrue(preferences.edit().clear().commit())
        val rows = context.assets.open("traderland/practice-catalog.json").bufferedReader().use { JSONArray(it.readText()) }
        catalog = (0 until rows.length()).associate { index ->
            val row = rows.getJSONObject(index)
            row.getString("id") to PracticeFootprint(row.getInt("footprint_w"), row.getInt("footprint_h"))
        }
        val raw = context.assets.open("traderland/practice-fixture.json").bufferedReader().use { it.readText() }
        fixture = requireNotNull(LandPractice.decodeFixture(raw, catalog))
    }

    @After fun cleanOnlyTheTestPreferenceFile() {
        if (Build.HARDWARE in setOf("ranchu", "goldfish")) assertTrue(preferences.edit().clear().commit())
    }

    @Test fun confirmedLayoutIsOnDiskBeforeSuccessAndReloadsWithoutUndoHistory() {
        val store = persistence()
        assertEquals(fixture, loaded(store, account))
        val next = placed(fixture)
        var successAfterDurableWrite = false
        val result = store.commit(account, fixture, next, catalog) {
            successAfterDurableWrite = diskValue() == LandPractice.encode(next)
        }
        assertTrue(result is PracticePersistenceResult.Committed)
        assertTrue("Success may be announced only after the XML contains the exact saved layout", successAfterDurableWrite)
        val reloaded = loaded(persistence(), account)
        assertEquals(next.placements, reloaded.placements)
        assertEquals(next.focusLevel, reloaded.focusLevel)
        assertTrue("Undo belongs to this editing session", reloaded.history.isEmpty())
        assertEquals(setOf(LandPracticePersistence.preferenceKey), preferences.all.keys)
    }

    @Test fun accountTransitionsRejectStaleWritesAndRetainOnlyTheGuestLayout() {
        val oldGuest = account
        val store = persistence()
        loaded(store, oldGuest)
        val saved = placed(fixture)
        assertTrue(store.commit(oldGuest, fixture, saved, catalog) is PracticePersistenceResult.Committed)
        val encoded = diskValue()
        val reveal = (LandPractice.reveal(saved) as LandPracticeUpdate.Accepted).state
        account = AccountVersion("qa-account", 1)
        assertEquals(PracticePersistenceResult.Rejected(PracticePersistenceError.OWNER_CHANGED), store.commit(oldGuest, saved, reveal, catalog))
        assertEquals(PracticePersistenceResult.Rejected(PracticePersistenceError.OWNER_CHANGED), persistence().load(account, catalog, fixture))
        assertEquals(encoded, diskValue())
        account = AccountVersion(null, 2)
        assertEquals(PracticePersistenceResult.Rejected(PracticePersistenceError.OWNER_CHANGED), store.commit(oldGuest, saved, reveal, catalog))
        val returningGuest = loaded(persistence(), account)
        assertEquals(saved.placements, returningGuest.placements)
        assertEquals(1, returningGuest.focusLevel)
        assertEquals(encoded, diskValue())
    }

    @Test fun malformedStoredJsonFallsBackAndCanBeReplacedByAValidatedLayout() {
        assertTrue(preferences.edit().putString(LandPracticePersistence.preferenceKey, "{invalid-json}").commit())
        val store = persistence()
        val restored = loaded(store, account)
        assertEquals(fixture, restored)
        val next = placed(restored)
        var applied = false
        assertTrue(store.commit(account, restored, next, catalog) { applied = true } is PracticePersistenceResult.Committed)
        assertTrue(applied)
        assertEquals(LandPractice.encode(next), diskValue())
        assertFalse(loaded(persistence(), account).placements.isEmpty())
    }

    private fun persistence() = LandPracticePersistence(
        currentAccount = { account }, riskAccepted = { true },
        read = { key -> preferences.getString(key, null) },
        write = { key, value -> preferences.edit().putString(key, value).commit() },
    )

    private fun loaded(store: LandPracticePersistence, version: AccountVersion): LandPracticeState =
        (store.load(version, catalog, fixture) as PracticePersistenceResult.Loaded).state

    private fun placed(previous: LandPracticeState): LandPracticeState =
        (LandPractice.place(previous, "crypto_bay_data_dock", 1, 1, 0, catalog, "qa-durable-piece") as LandPracticeUpdate.Accepted).state

    private fun diskValue(): String? {
        val file = File(context.applicationInfo.dataDir, "shared_prefs/$preferenceName.xml")
        assertTrue("SharedPreferences.commit must write a real XML file", file.isFile)
        return file.inputStream().use { input ->
            val parser = Xml.newPullParser()
            parser.setInput(input, "UTF-8")
            while (parser.eventType != XmlPullParser.END_DOCUMENT) {
                if (parser.eventType == XmlPullParser.START_TAG && parser.name == "string" &&
                    parser.getAttributeValue(null, "name") == LandPracticePersistence.preferenceKey) return@use parser.nextText()
                parser.next()
            }
            null
        }
    }
}
