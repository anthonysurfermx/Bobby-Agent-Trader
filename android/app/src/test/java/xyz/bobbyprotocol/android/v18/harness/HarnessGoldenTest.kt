package xyz.bobbyprotocol.android.v18.harness

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import xyz.bobbyprotocol.android.v18.ThesisHorizon
import java.io.File
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * The follow-up planner's contract for every platform: `shared/harness/planner-golden.json`, read
 * from the repository (never copied into the app), so the Android planner cannot drift from the
 * iPhone's. The iPhone suite runs the same file (ios/Bobby/Tests/HarnessGoldenTests.swift).
 *
 * The file:
 *   version     1
 *   defaults    the planner's options as the app runs them
 *   constants   what the cases rest on besides the options (waits per horizon, interest weights…)
 *   sectors     the sector of each symbol the cases use (null: none)
 *   cases[]     name, now, timeZone, options?, events[], expectedPlan[]
 * A case:
 *   now, at, ref, fireAt   ISO 8601 with an offset (an instant)
 *   timeZone               IANA name: the calendar the plan is made in
 *   options                only what differs from `defaults`, same keys
 *   events[]               kind, at, symbol?, name?, isEquity?, price?, step?, sector?, ref?, origin?,
 *                          thread?, horizon?, horizonHours?  — written into the ledger in file order
 *   expectedPlan[]         step, fireAt, symbol, and days (asset), sector (sector), others (week);
 *                          a field that is absent is not compared
 * The ledger is built exactly as the file says: each event goes through `HarnessLedger.note`, which
 * sorts by time, upper-cases a symbol, drops an event whose symbol is not one and every `appOpen`;
 * the planner ignores what is dated after `now`.
 */
class HarnessGoldenTest {
    private val file: JSONObject by lazy { JSONObject(HarnessGolden.file().readText()) }

    private fun keys(json: JSONObject): Set<String> = json.keys().asSequence().toSet()

    private fun objects(array: JSONArray): List<JSONObject> = (0 until array.length()).map { array.getJSONObject(it) }

    private fun strings(array: JSONArray): List<String> = (0 until array.length()).map { array.getString(it) }

    private fun text(json: JSONObject, key: String): String? = if (json.isNull(key)) null else json.get(key) as? String ?: error("$key: not text: ${json.get(key)}")

    private fun number(value: Any?, what: String): Number = value as? Number ?: error("$what: not a number: $value")

    private fun instant(json: JSONObject, key: String): Long {
        val raw = json.opt(key) as? String ?: error("$key: not an instant: ${json.opt(key)}")
        return OffsetDateTime.parse(raw).toInstant().toEpochMilli()
    }

    private fun event(raw: JSONObject): HarnessEvent {
        val unknown = keys(raw) - EVENT_KEYS
        check(unknown.isEmpty()) { "event has $unknown" }
        val kind = HarnessEvent.Kind.of(raw.optString("kind")) ?: error("event kind ${raw.opt("kind")}")
        val symbol = text(raw, "symbol")
        val step = if (raw.has("step")) HarnessStep.of(raw.optString("step")) ?: error("step ${raw.opt("step")}") else null
        val origin = if (raw.has("origin")) HarnessEvent.Origin.of(raw.optString("origin")) ?: error("origin ${raw.opt("origin")}") else null
        val horizon = if (raw.has("horizon")) HarnessHorizon.named(raw.opt("horizon")) ?: error("horizon ${raw.opt("horizon")}") else null
        return HarnessEvent(
            kind, instant(raw, "at"), symbol = symbol, name = text(raw, "name") ?: symbol, isEquity = raw.opt("isEquity") as? Boolean,
            price = if (raw.has("price")) number(raw.get("price"), "price").toDouble() else null, step = step, sector = text(raw, "sector"),
            ref = if (raw.has("ref")) instant(raw, "ref") else null, origin = origin, thread = raw.opt("thread") as? Boolean, horizon = horizon,
            horizonHours = if (raw.has("horizonHours")) number(raw.get("horizonHours"), "horizonHours").toInt() else null,
        )
    }

    private fun options(defaults: JSONObject, overrides: JSONObject?, sectors: JSONObject): HarnessPlanner.Options {
        val unknown = (overrides?.let { keys(it) } ?: emptySet()) - keys(defaults)
        check(unknown.isEmpty()) { "options has $unknown" }
        fun value(key: String): Any = if (overrides != null && overrides.has(key)) overrides.get(key) else defaults.get(key)
        fun int(key: String): Int = number(value(key), key).toInt()
        fun long(key: String): Long = number(value(key), key).toLong()
        val chain = strings(value("chain") as? JSONArray ?: error("chain")).map { HarnessStep.of(it) ?: error("chain step $it") }
        return HarnessPlanner.Options(
            chain = chain, maxPerQuestion = int("maxPerQuestion"), weeklyCovered = value("weeklyCovered") as? Boolean ?: error("weeklyCovered"),
            earliestHour = int("earliestHour"), latestHour = int("latestHour"), minimumGapMs = long("minimumGapHours") * HARNESS_HOUR_MS,
            anchorDays = long("anchorDays"), sectorFreshDays = long("sectorFreshDays"), weekFreshDays = long("weekFreshDays"),
            weekWindowDays = long("weekWindowDays"), maxPerWeek = int("maxPerWeek"), quietAfter = int("quietAfter"), quietDays = long("quietDays"),
            // The file's own table: the cases need no more of the app's sectors than they use.
            sectorOf = { symbol -> text(sectors, symbol) },
        )
    }

    private fun describe(plan: List<HarnessFollowUp>, zone: ZoneId): String = plan.joinToString("; ", "[", "]") { followUp ->
        val parts = ArrayList<String>()
        parts.add("${followUp.step.raw} ${DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(Instant.ofEpochMilli(followUp.fireAt).atZone(zone))} ${followUp.symbol ?: "-"}")
        if (followUp.step == HarnessStep.ASSET) parts.add("days ${followUp.days}")
        followUp.sector?.let { parts.add(it) }
        if (followUp.step == HarnessStep.WEEK) parts.add("others ${followUp.others}")
        parts.joinToString(" ")
    }

    /** What differs between a plan and what the case expects, or null when nothing does. */
    private fun difference(plan: List<HarnessFollowUp>, expected: List<JSONObject>): String? {
        if (plan.size != expected.size) return "${expected.size} expected"
        for ((index, pair) in plan.zip(expected).withIndex()) {
            val (followUp, want) = pair
            val unknown = keys(want) - PLAN_KEYS
            check(unknown.isEmpty()) { "expectedPlan has $unknown" }
            if (followUp.step.raw != want.optString("step")) return "follow-up ${index + 1} should be the ${want.optString("step")}"
            if (followUp.fireAt != instant(want, "fireAt")) return "follow-up ${index + 1} should arrive at ${want.optString("fireAt")}"
            if (followUp.symbol != text(want, "symbol")) return "follow-up ${index + 1} should name ${want.opt("symbol")}"
            if (want.has("days") && followUp.days != number(want.get("days"), "days").toInt()) return "follow-up ${index + 1} should say ${want.get("days")} days"
            if (want.has("sector") && followUp.sector != text(want, "sector")) return "follow-up ${index + 1} should be the sector ${want.opt("sector")}"
            if (want.has("others") && followUp.others != number(want.get("others"), "others").toInt()) return "follow-up ${index + 1} should count ${want.get("others")} others"
        }
        return null
    }

    // The cases

    @Test fun everyGoldenCasePlansAsWritten() {
        assertEquals("a new version is a new contract: read it before trusting this suite", 1, file.getInt("version"))
        val defaults = file.getJSONObject("defaults")
        val sectors = file.getJSONObject("sectors")
        val cases = objects(file.getJSONArray("cases"))
        assertTrue("the contract shrank: ${cases.size} cases", cases.size >= 95)
        val names = HashSet<String>()
        val failures = ArrayList<String>()
        for (raw in cases) {
            val name = raw.getString("name")
            assertTrue("two cases are called “$name”", names.add(name))
            assertEquals(name, emptySet<String>(), keys(raw) - CASE_KEYS)
            val zone = ZoneId.of(raw.getString("timeZone"))
            val now = instant(raw, "now")
            val ledger = HarnessLedger()
            for (item in objects(raw.getJSONArray("events"))) ledger.note(event(item))
            val plan = HarnessPlanner.plan(ledger, now, zone, options(defaults, raw.optJSONObject("options"), sectors))
            val wrong = difference(plan, objects(raw.getJSONArray("expectedPlan"))) ?: continue
            failures.add("“$name”: $wrong; planned ${describe(plan, zone)}")
        }
        assertTrue("${failures.size} of ${cases.size} golden cases do not plan as written:\n" + failures.joinToString("\n"), failures.isEmpty())
    }

    // What the cases rest on

    @Test fun theGoldenDefaultsAreTheOptionsTheAppRuns() {
        val defaults = file.getJSONObject("defaults")
        val options = HarnessPlanner.Options()
        assertEquals("the chain that ships", strings(defaults.getJSONArray("chain")), options.chain.map { it.raw })
        assertEquals(strings(defaults.getJSONArray("chain")), HarnessChain.SHIPPED.steps.map { it.raw })
        assertEquals(defaults.getInt("maxPerQuestion"), options.maxPerQuestion)
        assertEquals(defaults.getInt("maxPerQuestion"), HarnessChain.SHIPPED.maxPerQuestion)
        assertEquals(defaults.getBoolean("weeklyCovered"), options.weeklyCovered)
        assertEquals(defaults.getInt("earliestHour"), options.earliestHour)
        assertEquals(defaults.getInt("latestHour"), options.latestHour)
        assertEquals(defaults.getLong("minimumGapHours") * HARNESS_HOUR_MS, options.minimumGapMs)
        assertEquals(defaults.getLong("anchorDays"), options.anchorDays)
        assertEquals(defaults.getLong("sectorFreshDays"), options.sectorFreshDays)
        assertEquals(defaults.getLong("weekFreshDays"), options.weekFreshDays)
        assertEquals(defaults.getLong("weekWindowDays"), options.weekWindowDays)
        assertEquals(defaults.getInt("maxPerWeek"), options.maxPerWeek)
        assertEquals(defaults.getInt("quietAfter"), options.quietAfter)
        assertEquals(defaults.getLong("quietDays"), options.quietDays)
        assertEquals("an option the file does not name, or one the app does not have", 13, defaults.length())
    }

    @Test fun theGoldenConstantsAreTheOnesTheAppRuns() {
        val constants = file.getJSONObject("constants")
        val waits = constants.getJSONObject("waitDays")
        assertEquals("the desk's five horizons", HarnessHorizon.entries.map { it.raw }.toSet(), keys(waits))
        for (horizon in HarnessHorizon.entries) {
            assertEquals(horizon.raw, if (waits.isNull(horizon.raw)) null else waits.getInt(horizon.raw), horizon.waitDays)
        }
        // A save: the planner's own reading of each choice the page offers.
        val saves = constants.getJSONObject("saveWaitDays")
        val question = HarnessEvent(HarnessEvent.Kind.ASK, 1_800_000_000_000L, symbol = "NVDA")
        for (hours in HarnessLedger.SAVE_HORIZONS.sorted()) {
            val ledger = HarnessLedger()
            ledger.note(question)
            ledger.note(HarnessEvent(HarnessEvent.Kind.SAVED, question.at + 60_000L, symbol = "NVDA", horizonHours = hours))
            val wait = HarnessPlanner.waitFor(question, ledger, question.at + 120_000L)
            if (saves.has(hours.toString())) {
                assertEquals("$hours hours", HarnessPlanner.Wait(saves.getInt(hours.toString()), HarnessPlanner.Wait.Source.SAVED), wait)
            } else {
                assertEquals("$hours hours says nothing", HarnessPlanner.Wait(1, HarnessPlanner.Wait.Source.STANDARD), wait)
            }
        }
        assertEquals(setOf("72", "168"), keys(saves))
        val theses = constants.getJSONObject("thesisHorizon")
        assertEquals(ThesisHorizon.entries.map { it.raw }.toSet(), keys(theses))
        for (horizon in ThesisHorizon.entries) assertEquals(horizon.raw, theses.getString(horizon.raw), HarnessHorizon.ofThesis(horizon).raw)
        val weights = constants.getJSONObject("interestWeights")
        assertEquals(HarnessProfile.WEIGHTS.keys.map { it.raw }.toSet(), keys(weights))
        for ((kind, weight) in HarnessProfile.WEIGHTS) assertEquals(kind.raw, weights.getDouble(kind.raw), weight, 0.0)
        assertEquals(constants.getDouble("threadWeight"), HarnessProfile.THREAD_WEIGHT, 0.0)
        assertEquals(constants.getDouble("thesisWeight"), HarnessProfile.THESIS_WEIGHT, 0.0)
        assertEquals(constants.getDouble("interestHalfLifeDays"), HarnessProfile.HALF_LIFE_DAYS, 0.0)
        assertEquals(constants.getLong("statsDays"), HarnessProfile.STATS_DAYS)
        assertEquals(constants.getInt("ignoredLimit"), HarnessProfile.IGNORED_LIMIT)
        assertEquals(constants.getInt("hourSamples"), HarnessProfile.HOUR_SAMPLES)
        assertEquals(constants.getInt("retentionDays"), HarnessLedger.RETENTION_DAYS)
        assertEquals(constants.getInt("maxEvents"), HarnessLedger.MAX_EVENTS)
        assertEquals("a constant the file does not name, or one the app does not have", 12, constants.length())
    }

    @Test fun theGoldenSectorsAreTheAppsSectors() {
        val sectors = file.getJSONObject("sectors")
        for (symbol in keys(sectors)) assertEquals(symbol, text(sectors, symbol), HarnessSectors.of(symbol)?.id)
        // Every symbol a case plans a sector for is in the table.
        for (raw in objects(file.getJSONArray("cases"))) {
            for (item in objects(raw.getJSONArray("events"))) {
                val symbol = HarnessLedger.validSymbol(item.opt("symbol") as? String) ?: continue
                assertTrue("$symbol is used by “${raw.optString("name")}” and has no line in `sectors`", sectors.has(symbol))
            }
        }
    }

    /** The owner's two choices are both in the file: the chain that ships, and the one with the sector. */
    @Test fun bothChainsAreInTheContract() {
        val cases = objects(file.getJSONArray("cases"))
        fun chain(raw: JSONObject): List<String>? = raw.optJSONObject("options")?.optJSONArray("chain")?.let { strings(it) }
        val withSector = cases.filter { chain(it) == HarnessChain.WITH_SECTOR.steps.map { step -> step.raw } }
        assertTrue("${withSector.size} cases with the sector", withSector.size >= 10)
        for (raw in withSector) assertEquals(raw.optString("name"), HarnessChain.WITH_SECTOR.maxPerQuestion, raw.getJSONObject("options").optInt("maxPerQuestion", -1))
        val shipped = cases.filter { chain(it) == null }
        assertFalse("the chain that ships never plans a sector",
                    shipped.any { raw -> objects(raw.getJSONArray("expectedPlan")).any { it.optString("step") == "sector" } })
    }

    companion object {
        private val EVENT_KEYS = setOf("kind", "at", "symbol", "name", "isEquity", "price", "step", "sector", "ref", "origin", "thread", "horizon", "horizonHours")
        private val PLAN_KEYS = setOf("step", "fireAt", "symbol", "days", "sector", "others")
        private val CASE_KEYS = setOf("name", "now", "timeZone", "options", "events", "expectedPlan")
    }
}

/** Where the contract is: the repository's own file, found from wherever Gradle runs the tests. */
internal object HarnessGolden {
    const val PATH = "shared/harness/planner-golden.json"

    /**
     * Gradle runs unit tests from the module (`android/app`); the file is two folders up. Looked for
     * from the working directory upwards, and a suite that cannot find it fails: it is never skipped.
     */
    fun file(): File {
        val from = File("").absoluteFile
        var folder: File? = from
        while (folder != null) {
            val candidate = File(folder, PATH)
            if (candidate.isFile) return candidate
            folder = folder.parentFile
        }
        throw AssertionError("$PATH was not found in $from or any folder above it: the planner's contract did not run")
    }
}
