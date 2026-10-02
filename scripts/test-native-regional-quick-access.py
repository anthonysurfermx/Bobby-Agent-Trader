#!/usr/bin/env python3
"""Offline native regional defaults + actual Núcleo chip consumers. No Simulator or settings writes."""
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "ios/Bobby/Sources"
view = (SOURCES / "ContentView.swift").read_text()
match = re.search(r"static var defaultQuickAccess: \[String\] \{ ([^\n]+) \}", view)
assert match, "Native defaultQuickAccess must have a single authoritative expression"
# Inject only the current locale into the real computed-property expression. No app/OS preference changes.
expression = match[1].replace("L.resolution", "resolution")
expression = expression.replace('L.t("GOLD", "ORO")', '(resolution.language == .es ? "ORO" : "GOLD")')
assert "L." not in expression, "Unexpected runtime dependency in regional defaults"

swift = r'''
import Foundation
final class MemoryDefaults: UserDefaults {
    private var values: [String: Any] = [:]
    init() { super.init(suiteName: "Bobby.RegionalDefaults.Offline")! }
    override func object(forKey key: String) -> Any? { values[key] }
    override func set(_ value: Any?, forKey key: String) { values[key] = value }
    override func removeObject(forKey key: String) { values.removeValue(forKey: key) }
    override func string(forKey key: String) -> String? { values[key] as? String }
    override func data(forKey key: String) -> Data? { values[key] as? Data }
    override func bool(forKey key: String) -> Bool { values[key] as? Bool ?? false }
    override func integer(forKey key: String) -> Int { values[key] as? Int ?? 0 }
}
func appDefaults(_ resolution: LanguageResolution) -> [String] { return __EXPRESSION__ }
func require(_ condition: Bool, _ message: String) {
    if !condition { FileHandle.standardError.write(Data(("FAIL: " + message + "\n").utf8)); exit(1) }
}
let cases: [(String, [String], String?, [String])] = [
    ("fr", ["fr-FR"], "FR", ["MC.PA", "TTE.PA", "BTC"]),
    ("fr", ["en-US"], "PT", ["MC.PA", "TTE.PA", "BTC"]),
    ("pt", ["pt-PT"], "PT", ["EDP.LS", "GALP.LS", "BTC"]),
    ("pt", ["pt-BR"], "BR", ["PETR4.SA", "VALE3.SA", "BTC"]),
    ("pt", ["en-US"], "BR", ["PETR4.SA", "VALE3.SA", "BTC"]),
    ("pt", ["pt-PT"], "BR", ["EDP.LS", "GALP.LS", "BTC"]),
    ("pt", ["en-US"], nil, ["EDP.LS", "GALP.LS", "BTC"]),
    ("it", ["it-IT"], "IT", ["ENI.MI", "ENEL.MI", "BTC"]),
    ("de", ["de-DE"], "DE", ["SAP.DE", "SIE.DE", "BTC"]),
    ("en", ["en-GB"], "FR", ["BTC", "NVDA", "ETH", "TSLA", "GOLD"]),
    ("es", ["es-MX"], "DE", ["BTC", "NVDA", "ETH", "TSLA", "ORO"]),
    ("system", ["de-DE"], nil, ["SAP.DE", "SIE.DE", "BTC"])
]
var payload: [[String: Any]] = []
for (selection, preferred, country, expected) in cases {
    let resolution = LanguageResolution.resolve(selection: selection, preferredLanguages: preferred, region: country)
    let defaults = appDefaults(resolution)
    require(defaults == expected, "\(selection)/\(resolution.localeIdentifier): expected \(expected), got \(defaults)")
    let storage = MemoryDefaults(), memory = DeskMemory(defaults: storage)
    require(memory.quickAccess(fallback: defaults) == expected, "Empty history must expose regional defaults")
    let now = Date(timeIntervalSince1970: 1000)
    memory.recordQuery(symbol: "VOW3.DE", isEquity: true, now: now)
    memory.recordQuery(symbol: "SOL", isEquity: false, now: now.addingTimeInterval(1))
    let original = memory.watchlist
    let row = memory.quickAccess(fallback: defaults)
    require(Array(row.prefix(2)) == ["SOL", "VOW3.DE"], "Personal symbols must lead; no substitution")
    require(row.count <= 5 && Set(row).count == row.count, "Quick row must remain bounded and unique")
    require(memory.watchlist == original, "Default selection must not mutate stored symbols/counts/asset class/dates")
    let other = LanguageResolution.resolve(selection: "fr", preferredLanguages: [], region: nil)
    _ = memory.quickAccess(fallback: appDefaults(other))
    require(memory.watchlist == original, "Language changes must preserve personal history")
    for offset in 0..<5 { memory.recordQuery(symbol: "CUSTOM\(offset).PA", isEquity: true, now: now.addingTimeInterval(Double(offset + 2))) }
    require(memory.quickAccess(fallback: defaults) == memory.watchlist.prefix(5).map(\.symbol), "Five personal choices must not be replaced by regional seeds")
    payload.append(["language": resolution.language.rawValue, "locale": resolution.localeIdentifier,
                    "fresh": expected.map { ["symbol": $0] }, "personal": row.map { ["symbol": $0] }])
}
let memory = DeskMemory(defaults: MemoryDefaults())
memory.recordQuery(symbol: "MC.PA", isEquity: true)
require(memory.quickAccess(fallback: ["MC.PA", "TTE.PA", "BTC"]) == ["MC.PA", "TTE.PA", "BTC"], "Recent matching a default must not duplicate")
print(String(data: try JSONSerialization.data(withJSONObject: payload), encoding: .utf8)!)
'''.replace("__EXPRESSION__", expression)

with tempfile.TemporaryDirectory(prefix="bobby-regional-") as temp:
    temp = Path(temp)
    (temp / "main.swift").write_text(swift)
    # Compile the unchanged Foundation language resolver; the unrelated 1,049-row UI catalog is not part of this regression.
    localization = (SOURCES / "Localization.swift").read_text()
    (temp / "Resolution.swift").write_text(localization[:localization.index("/// Retains a stable catalog key")])
    subprocess.run(["xcrun", "swiftc", "-module-cache-path", str(temp / "cache"),
                    str(temp / "Resolution.swift"),
                    str(SOURCES / "DeskMemory.swift"), str(temp / "main.swift"), "-o", str(temp / "check")], check=True)
    result = subprocess.run([str(temp / "check")], text=True, capture_output=True)
    if result.returncode:
        raise SystemExit(result.stderr.strip() or f"Swift regression exited {result.returncode}")
    rows = json.loads(result.stdout)

session = (SOURCES / "Nucleo/NucleoSession.swift").read_text()
assert 'DeskMemory().quickAccess(fallback: BobbyViewModel.defaultQuickAccess)' in session, "Bridge must use the verified native defaults"
assert '"locale": L.localeIdentifier, "country": L.country' in session, "Bridge locale/country context must remain explicit"

node = r'''
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const root=process.argv[1], rows=JSON.parse(fs.readFileSync(0,'utf8'));
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
const modelContext={globalThis:{}};
vm.runInNewContext(read('ios/Bobby/Nucleo/src/shared/20-read-model.js'),modelContext);
const RM=modelContext.globalThis.NucleoReadModel;
const source=read('ios/Bobby/Nucleo/src/onboarding/60-fsm.js');
const start=source.indexOf('function suggestionChips(){'), end=source.indexOf('\nfunction setChips(',start);
assert.ok(start>=0&&end>start,'Use the actual onboarding consumer');
let checks=0;
for(const row of rows){
 for(const kind of ['fresh','personal']){
  const c={LANG:row.language,W:{sugg:{quickAccess:row[kind],movers:[]}}};
  vm.runInNewContext(read('ios/Bobby/Nucleo/src/onboarding/40-strings.js'),c);
  vm.runInNewContext(source.slice(start,end),c);
  const chips=JSON.parse(JSON.stringify(c.suggestionChips()));
  assert.equal(chips.length,3);
  for(let i=0;i<3;i++){
   const symbol=row[kind][i].symbol;
   assert.ok(chips[i].label.includes(symbol),`${row.locale} onboarding must retain ${symbol}`);
   assert.equal(chips[i].action.ask,chips[i].label);
  }
  const follow=JSON.parse(JSON.stringify(RM.followUps({symbol:'UNRELATED',requestId:'offline-read'},{quickAccess:row[kind],movers:[]},row.language)));
  assert.deepEqual(follow.slice(1).map(x=>x.action.symbol),row[kind].slice(0,2).map(x=>x.symbol));
  for(const chip of follow.slice(1))assert.ok(chip.action.question.includes(chip.action.symbol));
  checks++;
 }
}
console.log(`${rows.length} native locale/history cases and ${checks} real onboarding/follow-up cases passed; no network, Simulator, profile or OS settings writes.`);
'''
subprocess.run(["node", "-e", node, str(ROOT)], input=json.dumps(rows), text=True, check=True)
