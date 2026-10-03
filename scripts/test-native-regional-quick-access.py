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
    ("fr", ["fr-FR"], "FR", ["BTC", "MC.PA", "NVDA", "OR.PA"]),
    ("fr", ["en-US"], "PT", ["BTC", "MC.PA", "NVDA", "OR.PA"]),
    ("pt", ["pt-PT"], "PT", ["BTC", "EDP.LS", "NVDA", "GALP.LS"]),
    ("pt", ["pt-BR"], "BR", ["BTC", "PETR4.SA", "NVDA", "VALE3.SA"]),
    ("pt", ["en-US"], "BR", ["BTC", "PETR4.SA", "NVDA", "VALE3.SA"]),
    ("pt", ["pt-PT"], "BR", ["BTC", "EDP.LS", "NVDA", "GALP.LS"]),
    ("pt", ["en-US"], nil, ["BTC", "EDP.LS", "NVDA", "GALP.LS"]),
    ("it", ["it-IT"], "IT", ["BTC", "ISP.MI", "NVDA", "ENEL.MI"]),
    ("de", ["de-DE"], "DE", ["BTC", "SAP.DE", "NVDA", "SIE.DE"]),
    ("en", ["en-GB"], "FR", ["BTC", "NVDA", "ETH", "TSLA", "GOLD"]),
    ("es", ["es-MX"], "DE", ["BTC", "NVDA", "ETH", "TSLA", "ORO"]),
    ("system", ["de-DE"], nil, ["BTC", "SAP.DE", "NVDA", "SIE.DE"])
]
var payload: [[String: Any]] = []
for (selection, preferred, country, expected) in cases {
    let resolution = LanguageResolution.resolve(selection: selection, preferredLanguages: preferred, region: country)
    let defaults = appDefaults(resolution)
    require(defaults == expected, "\(selection)/\(resolution.localeIdentifier): expected \(expected), got \(defaults)")
    let storage = MemoryDefaults(), memory = DeskMemory(defaults: storage)
    require(memory.quickAccess(fallback: defaults) == expected, "Empty history must expose regional defaults")
    let single = DeskMemory(defaults: MemoryDefaults())
    single.recordQuery(symbol: "SOL", isEquity: false)
    require(Array(single.quickAccess(fallback: defaults).prefix(3)) == ["SOL"] + expected.prefix(2), "One personal ask must keep BTC and the first default in the three chips")
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
                    "fresh": expected.map { ["symbol": $0] }, "personal": row.map { ["symbol": $0] },
                    "single": single.quickAccess(fallback: defaults).map { ["symbol": $0] }])
}
let memory = DeskMemory(defaults: MemoryDefaults())
memory.recordQuery(symbol: "MC.PA", isEquity: true)
require(memory.quickAccess(fallback: ["BTC", "MC.PA", "NVDA", "OR.PA"]) == ["MC.PA", "BTC", "NVDA", "OR.PA"], "Recent matching a default must not duplicate")
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
// The first run's own chips, from both Nucleo trees: the real suggestionChips, table included.
function onboardingChips(tree,language,quickAccess){
 const source=read(tree+'/src/onboarding/60-fsm.js'), start=source.indexOf('function suggestionChips(){'), end=source.indexOf('\nfunction setChips(',start);
 assert.ok(start>=0&&end>start,tree+': use the actual onboarding consumer');
 const c={LANG:language,W:{sugg:{quickAccess,movers:[]}}};
 vm.runInNewContext(read(tree+'/src/onboarding/40-strings.js'),c);
 vm.runInNewContext(source.slice(start,end),c);
 return JSON.parse(JSON.stringify(c.suggestionChips()));
}
// The server catalogue is the only source of local symbols and company names (src/lib/regional-stocks.ts).
const catalogue=new Map([...read('src/lib/regional-stocks.ts').matchAll(/\{ symbol: '([^']+)', name: (?:'([^']*)'|"([^"]*)")/g)].map(m=>[m[1],m[2]||m[3]]));
assert.equal(catalogue.size,10,'Read the ten catalogue rows');
const plain=s=>s.normalize('NFD').replace(/[^A-Za-z ]/g,'').toLowerCase();
// The app's own idle row, from both Nucleo trees: the real showIdleSuggestions, table included.
function idleChips(tree,language,quickAccess){
 const text=read(tree+'/src/app/55-read.js'), from=text.indexOf('function showIdleSuggestions(){'), to=text.indexOf('\nfunction receiveSuggestions(',from);
 assert.ok(from>=0&&to>from,tree+': use the actual idle chip consumer');
 let shown=null;
 const c={ST:{name:'IDLE'},SUGG:{quickAccess,movers:[]},LANG:language,RMOD:RM,chipsShow:list=>{shown=list;},chipsHide(){shown=[];}};
 vm.runInNewContext(text.slice(from,to)+'\nshowIdleSuggestions();',c);
 return JSON.parse(JSON.stringify(shown));
}
let checks=0;
for(const row of rows){
 for(const symbol of row.fresh.map(x=>x.symbol))if(symbol.includes('.'))assert.ok(catalogue.has(symbol),`${row.locale}: ${symbol} is not in the server catalogue`);
 for(const kind of ['fresh','personal','single']){
  // The chip reads as the company (LVMH, not MC.PA); the catalogue name starts with it.
  const named=(where,symbol,label)=>{
   if(catalogue.has(symbol)){
    assert.ok(!label.includes('.'),`${where} ${row.locale}: ${symbol} shows a raw exchange ticker`);
    assert.ok(label.length>0&&plain(catalogue.get(symbol)).startsWith(plain(label)),`${where}: ${label} is not the catalogue name of ${symbol}`);
   } else assert.equal(label,symbol==='NVDA'?'NVIDIA':symbol);
  };
  for(const tree of ['ios/Bobby/Nucleo','nucleo']){
   const chips=onboardingChips(tree,row.language,row[kind]);
   assert.equal(chips.length,3);
   for(let i=0;i<3;i++){
    const symbol=row[kind][i].symbol;
    assert.equal(chips[i].action.symbol,symbol,`${tree} ${row.locale} onboarding must retain ${symbol}`);
    assert.ok(chips[i].action.ask.includes(symbol),`${tree} ${row.locale} onboarding must send ${symbol}`);
    named(tree+' onboarding',symbol,chips[i].label);
   }
   const idle=idleChips(tree,row.language,row[kind]);
   assert.equal(idle.length,3);
   for(let i=0;i<3;i++){
    const symbol=row[kind][i].symbol, chip=idle[i];
    assert.equal(chip.action.symbol,symbol);
    assert.ok(chip.action.question.includes(symbol),`${tree} ${row.locale}: the chip must still send ${symbol}`);
    named(tree,symbol,chip.label);
   }
  }
  const follow=JSON.parse(JSON.stringify(RM.followUps({symbol:'UNRELATED',requestId:'offline-read'},{quickAccess:row[kind],movers:[]},row.language)));
  assert.deepEqual(follow.slice(1).map(x=>x.action.symbol),row[kind].slice(0,2).map(x=>x.symbol));
  for(const chip of follow.slice(1))assert.ok(chip.action.question.includes(chip.action.symbol));
  checks++;
 }
 if(row.fresh.some(x=>catalogue.has(x.symbol))){
  assert.equal(row.fresh[0].symbol,'BTC');
  assert.ok(catalogue.has(row.fresh[1].symbol),`${row.locale}: the local stock must follow BTC`);
  assert.deepEqual(row.single.slice(0,3).map(x=>x.symbol),['SOL','BTC',row.fresh[1].symbol],`${row.locale}: one personal ask must keep the local stock visible`);
 }
}
console.log(`${rows.length} native locale/history cases and ${checks} real onboarding/idle/follow-up cases passed; no network, Simulator, profile or OS settings writes.`);
'''
subprocess.run(["node", "-e", node, str(ROOT)], input=json.dumps(rows), text=True, check=True)
