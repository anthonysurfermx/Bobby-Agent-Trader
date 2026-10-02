#!/usr/bin/env python3
"""Execute the actual pendingRead Swift method and actual JS boot consumer offline.
The harness supplies storage/profile shapes, not a replacement filtering implementation.
No app preferences, device, network, consent or saved history is changed.
"""
from pathlib import Path
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def function(source, marker):
    start = source.index(marker)
    opened = source.index("{", start)
    depth = 1
    index = opened + 1
    while depth:
        depth += (source[index] == "{") - (source[index] == "}")
        index += 1
    return source[start:index]


method = function((ROOT / "ios/Bobby/Sources/Nucleo/NucleoDesk.swift").read_text(), "func pendingRead(now:")
swift = r'''
import Foundation
enum L { static var ttsLang = "de"; static var localeIdentifier = "de-DE" }
struct Profile { var acceptedRiskNotice = true }
struct Read {
    let generation: UUID; var saved: [String: Any]?; let storedAt: Date; let result: [String: Any]
}
final class Desk {
    static let pendingReadWindow: TimeInterval = 1800
    var profile = Profile()
    var reads: [Read] = []
    let owner = UUID()
    func generation() -> UUID { owner }
    __METHOD__
}
func require(_ condition: Bool, _ label: String) {
    if !condition { FileHandle.standardError.write(Data(("FAIL: " + label + "\n").utf8)); exit(1) }
}
let now = Date()
let desk = Desk()
let french: [String: Any] = ["status": "ok", "requestId": "french-original", "language": "fr", "locale": "fr-FR", "text": "Les données sont incomplètes."]
desk.reads = [Read(generation: desk.owner, saved: nil, storedAt: now, result: french)]
require(desk.pendingRead(now: now) == nil, "French pending read must not restore after changing the app to German")
let variants = [("en", "en-US"), ("en", "en-GB"), ("en", "en-AU"), ("en", "en-CA"), ("en", "en-IE"),
                ("es", "es-MX"), ("es", "es-ES"), ("es", "es-US"), ("fr", "fr-FR"),
                ("pt", "pt-PT"), ("pt", "pt-BR"), ("it", "it-IT"), ("de", "de-DE")]
var payloads: [[String: Any]] = []
var checks = 1
for (language, locale) in variants {
    L.ttsLang = language; L.localeIdentifier = locale
    let original: [String: Any] = ["status": "ok", "requestId": "same-" + locale, "language": language, "locale": locale, "text": "Original provider answer"]
    desk.reads = [Read(generation: desk.owner, saved: nil, storedAt: now, result: original),
                  Read(generation: desk.owner, saved: nil, storedAt: now, result: ["status": "ok", "language": "ja", "locale": "ja-JP", "text": "Other language"])]
    let pending = desk.pendingRead(now: now)
    require(pending?["requestId"] as? String == original["requestId"] as? String, locale + " selects a same-language original read")
    require(pending?["text"] as? String == "Original provider answer", locale + " does not rewrite model output")
    require(desk.reads.count == 2, locale + " keeps original history")
    payloads.append(["locale": locale, "read": pending ?? NSNull()])
    desk.reads[0].saved = ["id": "saved-thesis"]
    require(desk.pendingRead(now: now) == nil, locale + " never restores a saved read")
    require(desk.reads[0].saved?["id"] as? String == "saved-thesis", locale + " retains saved history")
    checks += 5
}
L.ttsLang = "pt"; L.localeIdentifier = "pt-PT"
desk.reads = [Read(generation: desk.owner, saved: nil, storedAt: now, result: ["status": "ok", "language": "pt", "locale": "pt-BR"])]
require(desk.pendingRead(now: now) == nil, "Portuguese dialect change does not restore the other dialect")
for result: [String: Any] in [["status": "ok"], ["status": "ok", "language": "pt"], ["status": "ok", "locale": "pt-PT"]] {
    desk.reads = [Read(generation: desk.owner, saved: nil, storedAt: now, result: result)]
    require(desk.pendingRead(now: now) == nil, "Unknown legacy language cannot be guessed")
}
desk.reads = [Read(generation: UUID(), saved: nil, storedAt: now, result: ["language": "pt", "locale": "pt-PT"])]
require(desk.pendingRead(now: now) == nil, "Account isolation remains enforced")
desk.reads = [Read(generation: desk.owner, saved: nil, storedAt: now.addingTimeInterval(-1801), result: ["language": "pt", "locale": "pt-PT"])]
require(desk.pendingRead(now: now) == nil, "Expired reads stay unavailable")
desk.profile.acceptedRiskNotice = false
desk.reads = [Read(generation: desk.owner, saved: nil, storedAt: now, result: ["language": "pt", "locale": "pt-PT"])]
require(desk.pendingRead(now: now) == nil, "Consent gate remains enforced")
payloads.append(["locale": "de-DE", "read": NSNull()])
let output: [String: Any] = ["swiftChecks": checks + 7, "payloads": payloads]
print(String(data: try JSONSerialization.data(withJSONObject: output, options: [.sortedKeys]), encoding: .utf8)!)
'''.replace("__METHOD__", method)

consumer = function((ROOT / "ios/Bobby/Nucleo/src/app/99-boot.js").read_text(), "function start(){")
js = r'''
import assert from 'node:assert/strict';
import vm from 'node:vm';
let input = ''; for await (const chunk of process.stdin) input += chunk;
const data = JSON.parse(input); let checks = 0;
for (const item of data.payloads) {
  const context = { SES: {pendingRead:item.read}, OWNER_GEN:0, gen:0, started:false, buildFaces(){}, calls:[], go(name, payload){this.calls.push({name,payload});} };
  // The actual closure, supplied only its normal boot dependencies.
  context.go = (name,payload) => context.calls.push({name,payload});
  vm.runInNewContext(__CONSUMER__ + ';start();start();', context);
  assert.equal(context.calls.length,1, 'boot starts once');
  assert.equal(context.calls[0].name,item.read ? 'RESTORE' : 'WAKE',item.locale);
  if (item.read) assert.equal(context.calls[0].payload.read.requestId,item.read.requestId,'consumer keeps original identity');
  checks += item.read ? 3 : 2;
}
console.log(`${data.swiftChecks} actual Swift pending-read checks + ${checks} actual JS boot consumer checks passed (offline).`);
'''.replace("__CONSUMER__", json.dumps(consumer))
with tempfile.TemporaryDirectory(prefix="bobby-pending-locale-") as directory:
    path = Path(directory)
    (path / "main.swift").write_text(swift)
    subprocess.run(["swiftc", "-module-cache-path", str(path / "modules"), str(path / "main.swift"), "-o", str(path / "pending")], check=True)
    result = subprocess.run([str(path / "pending")], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(result.stderr)
    (path / "consumer.mjs").write_text(js)
    subprocess.run(["node", str(path / "consumer.mjs")], check=True, input=result.stdout, text=True)
