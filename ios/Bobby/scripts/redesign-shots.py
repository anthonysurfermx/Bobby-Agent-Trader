#!/usr/bin/env python3
"""Create/reuse two evidence phones and export named XCUITest attachments, one phone at a time."""
import argparse
import datetime
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile

IOS = Path(__file__).resolve().parents[1]
ROOT = IOS.parents[1]
HARNESS = ROOT.parent / '_harness'
DEVICES = {
    'se': ('Bobby-Redesign-SE3', 'com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation', 'iphone-se3'),
    'pro': ('Bobby-Redesign-17Pro', 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro', 'iphone-17-pro'),
}
LOCALES = {'en':'en_US', 'es':'es_MX', 'fr':'fr_FR', 'pt':'pt_PT', 'it':'it_IT', 'de':'de_DE'}

def run(args, **kw):
    return subprocess.run([str(x) for x in args], check=True, text=True, **kw)

def data(args):
    return json.loads(run(args, stdout=subprocess.PIPE).stdout)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='Output root; captures go in <device>-<language> (with -plus1 when requested)')
    parser.add_argument('--language', choices=LOCALES, default='es')
    parser.add_argument('--device', choices=['se', 'pro', 'all'], default='all')
    parser.add_argument('--text-size', choices=['default', '+1'], default='default')
    parser.add_argument('--test', '--tests', dest='tests', action='append', help='UI test class or Class/method; repeat or comma-separate (default RedesignShots)')
    parser.add_argument('--cleanup', action='store_true', help='Delete only simulators created by this invocation')
    parser.add_argument('--derived-data', type=Path, default=HARNESS / 'ios/dd')
    parser.add_argument('--package-cache', type=Path, default=Path.home() / 'Library/Developer/Xcode/DerivedData/Bobby-ebrmosnbrttmoldliysreeksjobv/SourcePackages')
    args = parser.parse_args()
    tests = [t.strip() for group in (args.tests or ['RedesignShots']) for t in group.split(',') if t.strip()]
    if not tests or any('testLive' in t for t in tests):
        parser.error('Capture runs require offline tests; testLive selectors are refused')
    # A named class may contain live tests, so exclude every current live method even for arbitrary classes.
    skips = ['testLiveSpanishMemory', 'testLiveGermanMemory', 'testLiveSpanishAndGermanCompanion', 'testLiveTypedSpanishAnswers']
    args.output = args.output.expanduser().resolve()
    args.derived_data = args.derived_data.expanduser().resolve()
    args.package_cache = args.package_cache.expanduser().resolve()
    if not args.package_cache.is_dir(): parser.error('The reusable SourcePackages cache is missing')
    lock = HARNESS / 'ios/sim.lock'
    lock.parent.mkdir(parents=True, exist_ok=True)
    try: lock.mkdir()
    except FileExistsError: parser.error(f'Simulator is in use (lock: {lock}); do not run concurrently')
    created, phones, active = [], {}, None
    result = None
    try:
        inventory = data(['xcrun', 'simctl', 'list', 'devices', 'available', '-j'])['devices']
        booted = [d for devices in inventory.values() for d in devices if d['state'] == 'Booted']
        if booted:
            raise RuntimeError('Shut down the currently booted simulator before capturing: ' + ', '.join(d['name'] for d in booted))
        runtimes = data(['xcrun', 'simctl', 'list', 'runtimes', '-j'])['runtimes']
        available = [r for r in runtimes if r.get('isAvailable') and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-')]
        if not available: raise RuntimeError('No available iOS simulator runtime')
        runtime = max(available, key=lambda r: tuple(int(x) for x in r['version'].split('.')))['identifier']
        # Always prepare both named devices. Never reuse or delete a user's differently named phone.
        for key, (name, device_type, _) in DEVICES.items():
            matches = [d for d in inventory.get(runtime, []) if d['name'] == name and d.get('deviceTypeIdentifier') == device_type]
            if len(matches) > 1: raise RuntimeError(f'Ambiguous simulator name {name}')
            if matches: phones[key] = matches[0]['udid']
            else:
                udid = run(['xcrun', 'simctl', 'create', name, device_type, runtime], stdout=subprocess.PIPE).stdout.strip()
                phones[key] = udid; created.append(udid)
        selected = list(DEVICES) if args.device == 'all' else [args.device]
        product = args.derived_data / 'Build/Products'
        common = ['xcodebuild', '-project', IOS / 'Bobby.xcodeproj', '-scheme', 'Bobby', '-configuration', 'Debug',
                  '-derivedDataPath', args.derived_data, '-clonedSourcePackagesDirPath', args.package_cache,
                  '-disableAutomaticPackageResolution', '-skipPackageUpdates', '-parallel-testing-enabled', 'NO',
                  '-collect-test-diagnostics', 'never']
        args.output.mkdir(parents=True, exist_ok=True)
        sha = run(['git', '-C', ROOT, 'rev-parse', 'HEAD'], stdout=subprocess.PIPE).stdout.strip()
        dirty = run(['git', '-C', ROOT, 'status', '--porcelain'], stdout=subprocess.PIPE).stdout.strip()
        # Leave signing enabled: an unsigned simulator binary breaks the memory Keychain.
        with (args.output / 'build.log').open('w') as log:
            run(common + ['-destination', f'platform=iOS Simulator,id={phones[selected[0]]}', 'build-for-testing'], stdout=log, stderr=subprocess.STDOUT)
        plans = sorted(product.glob('Bobby_iphonesimulator*.xctestrun'), key=lambda p: p.stat().st_mtime, reverse=True)
        if not plans: raise RuntimeError('Build did not produce an xctestrun plan')
        # Keep the modified plan next to the products: __TESTROOT__ stays valid.
        with tempfile.NamedTemporaryFile(dir=product, prefix='redesign-', suffix='.xctestrun', delete=False) as f:
            plan = Path(f.name)
        try:
            config = plistlib.loads(plans[0].read_bytes())
            targets = [t for c in config.get('TestConfigurations', []) for t in c['TestTargets']] if 'TestConfigurations' in config else [v for v in config.values() if isinstance(v, dict) and 'BlueprintName' in v]
            for target in targets:
                target.setdefault('EnvironmentVariables', {})['REDESIGN_LANGUAGE'] = args.language
                target['TestLanguage'] = args.language
                target['TestRegion'] = LOCALES[args.language].split('_')[1]
            plan.write_bytes(plistlib.dumps(config))
            for key in selected:
                udid = phones[key]; active = udid
                folder = args.output / (DEVICES[key][2] + '-' + args.language + ('-plus1' if args.text_size == '+1' else ''))
                folder.mkdir(parents=True, exist_ok=True)
                if list(folder.glob('*.png')): raise RuntimeError(f'Refusing to mix captures with an existing run: {folder}')
                run(['xcrun', 'simctl', 'boot', udid])
                run(['xcrun', 'simctl', 'bootstatus', udid, '-b'])
                run(['xcrun', 'simctl', 'ui', udid, 'content_size', 'extra-large' if args.text_size == '+1' else 'large'])
                run(['xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3', '--batteryState', 'charged', '--batteryLevel', '100'])
                result = folder / 'result.xcresult'
                command = ['xcodebuild', '-xctestrun', plan, '-destination', f'platform=iOS Simulator,id={udid}',
                           '-derivedDataPath', args.derived_data, '-clonedSourcePackagesDirPath', args.package_cache,
                           '-disableAutomaticPackageResolution', '-skipPackageUpdates',
                           '-parallel-testing-enabled', 'NO', '-collect-test-diagnostics', 'never', '-resultBundlePath', result,
                           '-testLanguage', args.language, '-testRegion', LOCALES[args.language].split('_')[1]]
                command += ['-only-testing:' + (t if t.startswith('BobbyUITests/') else 'BobbyUITests/' + t) for t in tests]
                command += ['-skip-testing:BobbyUITests/CompanionBuild69UITests/' + t for t in skips]
                with (folder / 'test.log').open('w') as log:
                    outcome = subprocess.run([str(x) for x in command + ['test-without-building']], text=True, stdout=log, stderr=subprocess.STDOUT)
                if not result.is_dir(): raise RuntimeError(f'No result bundle; see {folder / "test.log"}')
                summary = data(['xcrun', 'xcresulttool', 'get', 'test-results', 'summary', '--path', result])
                (folder / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
                with tempfile.TemporaryDirectory(prefix='attachments-', dir=folder) as raw:
                    run(['xcrun', 'xcresulttool', 'export', 'attachments', '--path', result, '--output-path', raw])
                    manifest = json.loads((Path(raw) / 'manifest.json').read_text())
                    named = []
                    for test in manifest:
                        for item in test['attachments']:
                            filename = item['exportedFileName']
                            if not filename.lower().endswith('.png'): continue
                            name = item['suggestedHumanReadableName'].split('_0_')[0]
                            if name.startswith('redesign-'): name = name[len('redesign-'):]
                            else:
                                slug = re.sub(r'[^a-zA-Z0-9-]+', '-', name).strip('-').lower()
                                name = f'{len(named) + 1:02d}-{slug}'
                            if not re.match(r'^\d\d-', name): name = f'{len(named) + 1:02d}-{name}'
                            target = folder / (name.removesuffix('.png') + '.png')
                            if target.exists(): raise RuntimeError(f'Duplicate screenshot name: {target.name}')
                            shutil.copyfile(Path(raw) / filename, target)
                            named.append((target.name, test['testIdentifier']))
                    if not named: raise RuntimeError('No screenshot attachments exported')
                    (folder / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
                index = [f'# {DEVICES[key][0]} · {args.language} · {args.text_size}', '',
                         f'Captured: {datetime.datetime.now(datetime.timezone.utc).isoformat()}',
                         f'Source: `{sha}`' + (' plus working-tree changes' if dirty else ''),
                         f'Runtime: `{runtime}`; simulator: `{udid}`; locally signed Debug build; offline UI tests.',
                         f'Tests: {", ".join(tests)}. Exit code: {outcome.returncode}.',
                         f'Counts: {summary.get("passedTests", "unknown")} passed, {summary.get("failedTests", "unknown")} failed, {summary.get("skippedTests", "unknown")} skipped (summary.json).',
                         'Visual review: pending. See test.log for assertions; an exported screenshot alone is not a passing test.', '',
                         '| Screenshot | UI test |', '| --- | --- |']
                index += [f'| [{name}]({name}) | `{test}` |' for name, test in sorted(named)]
                (folder / 'index.md').write_text('\n'.join(index) + '\n')
                # Export first, then remove even a failed result bundle. Retain logs/manifest for review.
                shutil.rmtree(result); result = None
                run(['xcrun', 'simctl', 'shutdown', udid]); active = None
                print(f'Exported {len(named)} screenshots to {folder}', flush=True)
                if outcome.returncode: raise RuntimeError(f'UI tests failed; inspect {folder / "test.log"}')
        finally:
            plan.unlink(missing_ok=True)
    finally:
        if result and result.exists(): shutil.rmtree(result)
        if active: subprocess.run(['xcrun', 'simctl', 'shutdown', active], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if args.cleanup:
            for udid in created: subprocess.run(['xcrun', 'simctl', 'delete', udid], check=True)
        lock.rmdir()

if __name__ == '__main__':
    try: main()
    except (RuntimeError, subprocess.CalledProcessError) as e:
        print(f'redesign-shots: {e}', file=sys.stderr); sys.exit(1)
