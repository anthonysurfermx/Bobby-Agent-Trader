#!/usr/bin/env python3
"""Collect local build evidence without reading private client/signing configuration."""
from pathlib import Path
from datetime import datetime, timezone
import argparse, hashlib, json, os, re, shutil, subprocess, xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--instrumentation-log', type=Path, action='append', help='Actual adb am instrument -w -r output; repeat for separate verified batches')
args = parser.parse_args()

root = Path(__file__).resolve().parents[2]
android = root / 'android'
results = list((android / 'app/build/test-results/testDebugUnitTest').glob('TEST-*.xml'))
units = {'status': 'not_run'}
if results:
    units = {key: sum(int(ET.parse(p).getroot().attrib[key]) for p in results)
             for key in ['tests', 'failures', 'errors', 'skipped']}
    units['status'] = 'passed' if units['tests'] and units['failures'] == units['errors'] == 0 else 'failed'
lint_path = android / 'app/build/reports/lint-results-debug.xml'
lint = {'status': 'not_run'}
if lint_path.exists():
    issues = list(ET.parse(lint_path).getroot())
    lint = {'errors': sum(i.attrib.get('severity') in ['Error', 'Fatal'] for i in issues),
            'warnings': sum(i.attrib.get('severity') == 'Warning' for i in issues)}
    lint['status'] = 'passed' if lint['errors'] == 0 else 'failed'
artifacts = {}
for kind, name in [('debug_apk', 'app/build/outputs/apk/debug/app-debug.apk'),
                   ('release_apk', 'app/build/outputs/apk/release/app-release.apk'),
                   ('release_aab', 'app/build/outputs/bundle/release/app-release.aab')]:
    path = android / name
    artifacts[kind] = {'status': 'not_built'} if not path.exists() else {
        'path': str(path.relative_to(root)), 'bytes': path.stat().st_size,
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'built_at': datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()}
bundle = android / 'app/build/outputs/bundle/release/app-release.aab'
java_home = os.environ.get('JAVA_HOME')
jarsigner = str(Path(java_home) / 'bin/jarsigner') if java_home else shutil.which('jarsigner')
if bundle.exists() and jarsigner:
    result = subprocess.run([jarsigner, '-J-Duser.language=en', '-verify', str(bundle)],
                            capture_output=True, text=True, timeout=30)
    report = result.stdout + result.stderr
    artifacts['release_aab']['signature'] = {
        'status': 'verified' if result.returncode == 0 and 'jar verified.' in report else 'not_verified',
        'scope': 'local upload signature; Play App Signing and distribution remain separate',
        'self_signed_upload_certificate': 'signer certificate is self-signed' in report,
        'verification_output_sha256': hashlib.sha256(report.encode()).hexdigest(),
    }
instrumentation = {'status': 'not_run'}
def read_instrumentation(log):
    raw = log.read_text()
    metadata_path = log.with_suffix('.metadata.json')
    metadata = json.loads(metadata_path.read_text()) if metadata_path.exists() else None
    fields, cases, expected = {}, [], None
    for line in raw.splitlines():
        field = re.match(r'^INSTRUMENTATION_STATUS: (class|test|numtests)=(.*)$', line)
        if field:
            fields[field[1]] = field[2]
            if field[1] == 'numtests':
                expected = int(field[2])
        code = re.match(r'^INSTRUMENTATION_STATUS_CODE: (-?\d+)$', line)
        if code and int(code[1]) in (0, -1, -2, -3, -4):
            cases.append({'class': fields.get('class'), 'test': fields.get('test'), 'code': int(code[1])})
    complete = expected is not None and len(cases) == expected and bool(re.search(r'^INSTRUMENTATION_CODE: -1$', raw, re.M))
    failures = sum(case['code'] in (-1, -2) for case in cases)
    skipped = sum(case['code'] in (-3, -4) for case in cases)
    return {
        'status': 'incomplete' if not complete else 'failed' if failures else 'passed',
        'scope': 'dedicated Android emulator; device/account/store flows remain separate',
        'expected': expected, 'tests': len(cases), 'passed': len(cases) - failures - skipped,
        'failures': failures, 'skipped': skipped, 'cases': cases,
        'log_sha256': hashlib.sha256(log.read_bytes()).hexdigest(),
        'build_binding': metadata,
    }
if args.instrumentation_log:
    batches = [read_instrumentation(log) for log in args.instrumentation_log]
    latest = {(case['class'], case['test']): case for batch in batches for case in batch['cases']}
    cases = list(latest.values())
    failures = sum(case['code'] in (-1, -2) for case in cases)
    skipped = sum(case['code'] in (-3, -4) for case in cases)
    instrumentation = {
        'status': 'incomplete' if any(batch['status'] == 'incomplete' for batch in batches) else 'failed' if failures else 'passed',
        'scope': 'dedicated Android emulator; latest result per distinct case across explicit batches',
        'tests': len(cases), 'passed': len(cases) - failures - skipped,
        'failures': failures, 'skipped': skipped, 'cases': cases,
        'total_executions': sum(batch['tests'] for batch in batches),
        'batches': [{key: value for key, value in batch.items() if key != 'cases'} for batch in batches],
    }
build_variants = {}
for variant in ('default', 'fcm'):
    variant_path = root / f'docs/android/evidence/{variant}-build.json'
    if variant_path.exists():
        build_variants[variant] = json.loads(variant_path.read_text())
        if artifacts['debug_apk'].get('sha256') == build_variants[variant].get('artifacts', {}).get('debug_apk'):
            artifacts['debug_apk']['fcm_enabled'] = build_variants[variant]['fcm_enabled']
evidence = {'collected_at': datetime.now(timezone.utc).isoformat(), 'scope': 'local build and emulator only',
            'unit_tests': units, 'lint': lint, 'artifacts': artifacts,
            'build_variants': build_variants,
            'instrumentation': instrumentation,
            'external_gates': {'physical_device_flows': 'not_verified', 'live_account_sync': 'not_verified',
                              'play_purchase_restore': 'not_verified', 'play_release': 'not_uploaded'}}
output = root / 'docs/android/evidence/local-build.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(evidence, indent=2) + '\n')
print(json.dumps({'unit_tests': units, 'lint': lint, 'instrumentation': {k: v for k, v in instrumentation.items() if k != 'cases'}, 'output': str(output)}))
