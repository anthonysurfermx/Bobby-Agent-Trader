"""Run the four subscription contracts using actual extracted Swift source.
XCTest assertions are adapted to preconditions for this lightweight macOS runner.
This tests the pure rules, not the iOS app, SDK transport or UI. Isolated date/network
adapters only satisfy unrelated type dependencies when compiling on macOS.
"""
from pathlib import Path
import subprocess, tempfile
store=Path('ios/Bobby/Sources/BobbyStore.swift').read_text()
access=Path('ios/Bobby/Sources/BobbyAccess.swift').read_text()
tests=Path('ios/Bobby/Tests/BobbyAccessTests.swift').read_text()
def block(source, marker):
    start=source.index(marker)
    brace=source.index('{', start)
    depth=1; end=brace+1
    while depth:
        depth += (source[end]=='{')-(source[end]=='}'); end+=1
    return source[start:end]
methods=['testPurchasesRequireBothServerFlags','testMissingOrFreeAccessCannotConfirmPro','testFailedSubscriptionSyncCanRetryTheSameExpiry','testOldAccountAndExpiryCallbacksCannotOverwriteNewSync']
code='import Foundation\nimport CoreFoundation\n'
code+="""
func XCTAssertFalse(_ value: Bool, _ message: String = "") { precondition(!value, message) }
func XCTAssertTrue(_ value: Bool, _ message: String = "") { precondition(value, message) }
func XCTAssertNil<T>(_ value: T?, _ message: String = "") { precondition(value == nil, message) }
func XCTAssertEqual<T: Equatable>(_ a: T, _ b: T, _ message: String = "") { precondition(a == b, message) }
func XCTUnwrap<T>(_ value: T?, _ message: String = "") throws -> T { precondition(value != nil, message); return value! }
"""
code+=block(store,'struct BobbySubscriptionSyncState')+'\n'
code+=block(access,'struct BobbyReadAccess')+'\n'
code+='enum BobbyAccessAPI { static func date(_ text: String) -> Date? { nil } }\n'
code+='enum BobbyAccessCenter {\n'+block(access,'nonisolated static func paymentsReady')+'\n'+block(access,'enum ServerSync: Equatable')+'\n}\n'
code+='enum BobbyStore {\n'+block(store,'nonisolated static func serverConfirmedPro')+'\n}\n'
code+='struct SubscriptionCoreTests {\n'+'\n'.join(block(tests,'func '+name+'(') for name in methods)+'\n}\n'
code+='let tests = SubscriptionCoreTests()\n'
code+='\n'.join(('try ' if name in methods[2:] else '')+'tests.'+name+'(); print("PASS: '+name+'")' for name in methods)+'\n'
with tempfile.TemporaryDirectory(prefix='bobby-subscription-core-') as d:
    path=Path(d); (path/'main.swift').write_text(code)
    subprocess.run(['xcrun','swiftc','-module-cache-path',str(path/'cache'),str(path/'main.swift'),'-o',str(path/'tests')],check=True)
    run=subprocess.run([str(path/'tests')],capture_output=True,text=True)
    evidence=run.stdout+run.stderr
    Path('docs/audits/subscription-readiness-2026-09-30/swift-core-tests.txt').write_text(evidence)
    print(evidence);raise SystemExit(run.returncode)
