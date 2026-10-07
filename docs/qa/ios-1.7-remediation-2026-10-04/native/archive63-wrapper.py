#!/usr/bin/env python3
"""Run one coordinated Release phase, preserving receipts and partial outputs."""
import argparse
import datetime
import xml.etree.ElementTree as ET
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import signal
import subprocess
import sys
import time

BASE = Path('/private/tmp/bobby-ios17-remediation-20261004')
SOURCE = Path('/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader')
CACHE = Path('/private/tmp/claude-501/-Users-mrrobot-Documents-GitHub-Bobby-Agent-Trader/e040cdf9-5bb4-4dd1-aeee-3d346213d559/scratchpad/lang-derived/SourcePackages')
PROFILE_ID = 'd3f3f625-1017-4983-b70f-fb0b8ae4e9ef'
PROFILE = Path('/Users/mrrobot/Library/Developer/Xcode/UserData/Provisioning Profiles') / (PROFILE_ID + '.mobileprovision')
CERTIFICATE = 'A485BF8AE5E66C9127F54E508C426C916B518C26'
TEAM = 'QZRTV6CMTT'
BUNDLE = 'xyz.bobbyprotocol.bobby'
UPLOAD_OPTIONS = BASE / 'ExportOptions-63-Upload.plist'
GIB = 1024 ** 3


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 ** 2), b''):
            digest.update(block)
    return digest.hexdigest()


def command(argv, cwd=None):
    return subprocess.run(argv, cwd=cwd, check=True, capture_output=True)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def upload_success_lines(log):
    """Recognize explicit Apple upload acceptance, not export/progress alone."""
    return [line.strip() for line in log.splitlines()
            if line.strip() == '** UPLOAD SUCCEEDED **'
            or re.search(r'\bSuccessfully uploaded\b', line)
            or re.search(r'\bProgress\s+100%:\s*Upload succeeded\.\s*$', line)]


def decode_profile(path):
    result = command(['/usr/bin/openssl', 'smime', '-verify', '-inform', 'DER',
                      '-in', str(path), '-noverify'])
    return plistlib.loads(result.stdout)


def require_profile(profile):
    entitlements = profile['Entitlements']
    assert profile['UUID'] == PROFILE_ID, 'unexpected profile UUID'
    assert profile['ExpirationDate'].replace(tzinfo=datetime.timezone.utc) > datetime.datetime.now(datetime.timezone.utc), 'profile expired'
    assert entitlements.get('application-identifier') == TEAM + '.' + BUNDLE
    assert entitlements.get('com.apple.developer.team-identifier') == TEAM
    assert entitlements.get('aps-environment') == 'production'
    assert entitlements.get('get-task-allow') is False
    assert entitlements.get('com.apple.developer.applesignin') == ['Default']
    assert entitlements.get('com.apple.security.application-groups') == ['group.' + BUNDLE]
    assert CERTIFICATE in [hashlib.sha1(c).hexdigest().upper() for c in profile['DeveloperCertificates']]


def source_manifest():
    scopes = ['ios/Bobby', 'public/land/v1/gate-A', 'public/land/v1/audio',
              'public/land/v1/world-snapshot-v01.json']
    names = command(['git', 'ls-files', '-z', '--', *scopes], SOURCE).stdout.decode().split('\0')
    names += ['ios/Bobby/Bobby.xcodeproj/project.pbxproj',
              'ios/Bobby/Bobby.xcodeproj/xcshareddata/xcschemes/Bobby.xcscheme']
    resolved = SOURCE / 'ios/Bobby/Bobby.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'
    if resolved.is_file():
        names.append(str(resolved.relative_to(SOURCE)))
    return [{'path': name, 'bytes': (SOURCE / name).stat().st_size,
             'sha256': sha(SOURCE / name)}
            for name in sorted(set(names)) if name and (SOURCE / name).is_file()]


def preflight(expected_head):
    head = command(['git', 'rev-parse', 'HEAD'], SOURCE).stdout.decode().strip()
    assert head == expected_head, 'HEAD differs from the coordinated candidate; provide the verified --expected-head'
    assert not command(['git', 'status', '--porcelain', '--untracked-files=no'], SOURCE).stdout, 'tracked source is dirty'
    pbx = (SOURCE / 'ios/Bobby/Bobby.xcodeproj/project.pbxproj').read_text()
    assert 'CURRENT_PROJECT_VERSION = 63;' in pbx and 'MARKETING_VERSION = 1.7;' in pbx
    assert 'APS_ENVIRONMENT = production;' in pbx
    options = plistlib.loads(UPLOAD_OPTIONS.read_bytes())
    assert options['destination'] == 'upload' and options['method'] == 'app-store-connect'
    assert options['signingStyle'] == 'manual' and options['teamID'] == TEAM
    assert options['signingCertificate'] == 'Apple Distribution'
    assert options['provisioningProfiles'][BUNDLE] == PROFILE_ID
    assert options['manageAppVersionAndBuildNumber'] is False
    profile = decode_profile(PROFILE)
    require_profile(profile)
    identities = command(['/usr/bin/security', 'find-identity', '-v', '-p', 'codesigning']).stdout.decode()
    assert CERTIFICATE in identities, 'distribution identity unavailable to this process'
    state = json.loads((CACHE / 'workspace-state.json').read_text())
    dependencies = []
    for item in state['object']['dependencies']:
        checkout = CACHE / 'checkouts' / item['subpath']
        revision = command(['git', 'rev-parse', 'HEAD'], checkout).stdout.decode().strip()
        expected = item['state']['checkoutState']
        assert revision == expected['revision'], 'package cache revision mismatch'
        dependencies.append({'identity': item['packageRef']['identity'], 'version': expected['version'], 'revision': revision})
    return {'checkedAtUTC': utc(), 'source': str(SOURCE), 'sourceHead': head,
            'version': '1.7', 'build': '63', 'bundle': BUNDLE, 'configuration': 'Release',
            'distributionIdentitySHA1': CERTIFICATE,
            'profile': {'path': str(PROFILE), 'sha256': sha(PROFILE), 'uuid': PROFILE_ID,
                        'expiresUTC': profile['ExpirationDate'].isoformat() + 'Z',
                        'cmsSignatureVerified': True, 'certificateChainVerifiedByThisCheck': False,
                        'entitlements': profile['Entitlements']},
            'uploadOptions': {'path': str(UPLOAD_OPTIONS), 'sha256': sha(UPLOAD_OPTIONS), 'values': options},
            'sourcePackages': {'path': str(CACHE), 'workspaceStateSHA256': sha(CACHE / 'workspace-state.json'),
                               'dependencies': dependencies}, 'sourceManifest': source_manifest(),
            'freeBytes': shutil.disk_usage(BASE).free,
            'remoteState': 'not checked by this local preflight'}


def approved_test_only_input(receipt, path):
    """Allow exactly the reviewed consent-precondition change in a UI-test-only target."""
    approved = json.loads(path.read_text())
    rel = 'ios/Bobby/UITests/StoreShots.swift'
    assert approved.get('approvedPath') == rel, 'only the explicitly reviewed StoreShots test delta is eligible'
    assert approved.get('archiveSourceHead') == receipt['sourceHead'], 'QA receipt source differs from archive'
    expected = next(item for item in receipt['sourceManifest'] if item['path'] == rel)
    assert approved.get('archivedSHA256') == expected['sha256'], 'QA receipt archived test hash mismatch'
    old = command(['git', 'show', receipt['sourceHead'] + ':' + rel], SOURCE).stdout
    assert hashlib.sha256(old).hexdigest() == expected['sha256'], 'archived test blob mismatch'
    before = 'app.launchArguments = ["-store-shots", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]'
    after = 'app.launchArguments = ["-store-shots", "-AppleLanguages", "(en)", "-AppleLocale", "en_US",\n                               "-agent.riskNoticeVersion", "6"]'
    original = old.decode()
    assert original.count(before) == 3, 'unexpected archived launch-precondition count'
    current = (SOURCE / rel).read_bytes()
    assert current.decode() == original.replace(before, after), 'UI test delta exceeds the three reviewed launch preconditions'
    current_hash = hashlib.sha256(current).hexdigest()
    assert current_hash == approved.get('currentTestOnlySHA256'), 'current test hash differs from the reviewed receipt'
    project = SOURCE / 'ios/Bobby/Bobby.xcodeproj/project.pbxproj'
    scheme = SOURCE / 'ios/Bobby/Bobby.xcodeproj/xcshareddata/xcschemes/Bobby.xcscheme'
    for file, key in [(project, 'sourceProjectSHA256'), (scheme, 'sourceSchemeSHA256')]:
        archived = next(item for item in receipt['sourceManifest'] if item['path'] == str(file.relative_to(SOURCE)))
        assert sha(file) == archived['sha256'] == approved.get(key), 'target membership/settings changed since archive'
    objects = json.loads(command(['/usr/bin/plutil', '-convert', 'json', '-o', '-', str(project)]).stdout)['objects']
    refs = [key for key, value in objects.items() if value.get('isa') == 'PBXFileReference' and value.get('path') == 'StoreShots.swift']
    assert len(refs) == 1, 'StoreShots file reference is ambiguous'
    build_files = [key for key, value in objects.items() if value.get('isa') == 'PBXBuildFile' and value.get('fileRef') == refs[0]]
    owners = []
    for target in objects.values():
        if target.get('isa') != 'PBXNativeTarget':
            continue
        for phase_id in target.get('buildPhases', []):
            phase = objects[phase_id]
            if phase.get('isa') == 'PBXSourcesBuildPhase' and set(build_files).intersection(phase.get('files', [])):
                owners.append((target['name'], target['productType']))
    assert owners == [('BobbyUITests', 'com.apple.product-type.bundle.ui-testing')], 'test file participates in a shipping target'
    root = ET.parse(scheme).getroot()
    archive_targets = [entry.find('BuildableReference').get('BlueprintName')
                       for entry in root.find('BuildAction/BuildActionEntries')
                       if entry.get('buildForArchiving') == 'YES']
    assert archive_targets == ['Bobby'] and root.find('ArchiveAction').get('buildConfiguration') == 'Release', 'archive target/configuration changed'
    return {'path': rel, 'archivedSHA256': expected['sha256'], 'currentTestOnlySHA256': current_hash,
            'receipt': str(path), 'receiptSHA256': sha(path),
            'membership': 'BobbyUITests only; excluded from Release archive target',
            'delta': 'Three riskNoticeVersion6 launch preconditions; all assertions preserved'}


def verify_source(receipt, qa_input_receipt=None):
    approved = approved_test_only_input(receipt, qa_input_receipt) if qa_input_receipt else None
    deltas = []
    for item in receipt['sourceManifest']:
        actual = sha(SOURCE / item['path'])
        if actual != item['sha256']:
            assert approved and item['path'] == approved['path'] and actual == approved['currentTestOnlySHA256'], 'build-input drift: ' + item['path']
            deltas.append(approved)
    assert sha(CACHE / 'workspace-state.json') == receipt['sourcePackages']['workspaceStateSHA256'], 'package-cache state drift'
    assert sha(UPLOAD_OPTIONS) == receipt['uploadOptions']['sha256'], 'upload-options drift'
    # Binding remains the archived product input hashes. A docs/test-only commit may advance HEAD.
    return {'archiveSourceHead': receipt['sourceHead'],
            'observedCurrentHead': command(['git', 'rev-parse', 'HEAD'], SOURCE).stdout.decode().strip(),
            'strictInputHashCount': len(receipt['sourceManifest']) - len(deltas),
            'approvedNonShippingDeltas': deltas,
            'productResourceProjectCacheHashes': 'all unchanged; no product exception permitted'}


def verify_archive(archive, receipt, qa_input_receipt=None):
    app = archive / 'Products/Applications/Bobby.app'
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    assert info['CFBundleIdentifier'] == BUNDLE
    assert info['CFBundleShortVersionString'] == '1.7' and info['CFBundleVersion'] == '63'
    key = info.get('REVENUECAT_IOS_API_KEY', '')
    assert key.startswith('appl_') and not key.startswith('test_'), 'Release App Store SDK key is required'
    command(['/usr/bin/codesign', '--verify', '--deep', '--strict', str(app)])
    entitlements = plistlib.loads(command(['/usr/bin/codesign', '-d', '--entitlements', ':-', str(app)]).stdout)
    for name in ['application-identifier', 'com.apple.developer.team-identifier', 'aps-environment',
                 'get-task-allow', 'com.apple.developer.applesignin', 'com.apple.security.application-groups']:
        assert entitlements.get(name) == receipt['profile']['entitlements'].get(name), 'signed entitlement mismatch: ' + name
    embedded = decode_profile(app / 'embedded.mobileprovision')
    require_profile(embedded)
    assert not (app / 'Nucleo/fixtures').exists() and not (app / 'Nucleo/contract.html').exists(), 'DEBUG resources packaged'
    resources = []
    for original in sorted((SOURCE / 'ios/Bobby/Resources/Nucleo').rglob('*')):
        if original.is_file():
            relative = original.relative_to(SOURCE / 'ios/Bobby/Resources/Nucleo')
            packaged = app / 'Nucleo' / relative
            assert packaged.is_file() and sha(packaged) == sha(original), 'packaged Nucleo resource drift: ' + str(relative)
            if original.suffix == '.html':
                page = packaged.read_text()
                # Release retains inert guards that read the absent fixtures; reject actual injection.
                assert not re.search(r'(?:\bwindow|\bW)\s*\.\s*NUCLEO_FIXTURES\s*=(?!=)', page), 'mock fixture data assignment packaged'
                assert 'shared/90-dev-mock-bridge.js' not in page, 'dev mock bridge implementation packaged'
                assert 'B.mock = {' not in page, 'dev mock bridge install packaged'
            resources.append({'path': str(Path('Nucleo') / relative), 'sha256': sha(packaged)})
    release_build_info = json.loads((app / 'Nucleo/build-info.json').read_text())
    assert release_build_info.get('release') is True, 'Nucleo bundle was not generated in Release mode'
    assert set(release_build_info.get('pages', [])) == {'app', 'onboarding'}, 'unexpected Release Nucleo page list'
    privacy = app / 'PrivacyInfo.xcprivacy'
    assert privacy.is_file() and sha(privacy) == sha(SOURCE / 'ios/Bobby/Sources/PrivacyInfo.xcprivacy')
    source_verification = verify_source(receipt, qa_input_receipt)
    archive_info = plistlib.loads((archive / 'Info.plist').read_bytes())
    return {'verifiedAtUTC': utc(), 'archive': str(archive), 'application': str(app),
            'sourceHead': receipt['sourceHead'], 'version': '1.7', 'build': '63',
            'sourceVerification': source_verification,
            'archiveInfoSHA256': sha(archive / 'Info.plist'), 'appInfoSHA256': sha(app / 'Info.plist'),
            'executableSHA256': sha(app / info['CFBundleExecutable']),
            'archiveApplicationProperties': archive_info.get('ApplicationProperties', {}),
            'entitlements': entitlements, 'embeddedProfileUUID': embedded['UUID'],
            'releaseRevenueCatKeyType': 'App Store public SDK key; value omitted',
            'privacyManifestSHA256': sha(privacy), 'nucleoResources': resources,
            'codesignVerification': 'passed', 'debugFixtureResources': 'absent',
            'devMockBridgeAndFixtureAssignments': 'absent; inert reads of undefined fixtures may remain',
            'nucleoReleaseBuildInfo': release_build_info,
            'result': 'local signed Release archive verified; remote processing unverified'}


def monitored_run(argv, output, minimum_start, stop_below, timeout):
    free = shutil.disk_usage(BASE).free
    assert free >= minimum_start, 'phase not started: free bytes %d < required %d' % (free, minimum_start)
    output.mkdir(parents=True, exist_ok=True)
    log = output / 'xcodebuild.log'
    result_path = output / 'phase-receipt.json'
    assert not result_path.exists() and not log.exists(), 'phase already has evidence; use a fresh --out for a new attempt'
    result = {'startedAtUTC': utc(), 'argv': argv, 'freeBeforeBytes': free,
              'minimumStartBytes': minimum_start, 'stopBelowBytes': stop_below,
              'minimumObservedFreeBytes': free, 'log': str(log), 'status': 'running'}
    write_json(result_path, result)
    started = time.monotonic()
    with log.open('w') as stream:
        process = subprocess.Popen(argv, cwd=SOURCE / 'ios/Bobby', stdout=stream,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            while process.poll() is None:
                free = shutil.disk_usage(BASE).free
                result['minimumObservedFreeBytes'] = min(result['minimumObservedFreeBytes'], free)
                if free < stop_below or time.monotonic() - started > timeout:
                    result['stopReason'] = 'free space below reserve' if free < stop_below else 'phase timeout'
                    os.killpg(process.pid, signal.SIGTERM)
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
                    break
                time.sleep(1)
        except BaseException:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            raise
        finally:
            result.update({'endedAtUTC': utc(), 'elapsedSeconds': round(time.monotonic() - started, 2),
                           'exitCode': process.poll(), 'freeAfterBytes': shutil.disk_usage(BASE).free,
                           'status': 'passed' if process.poll() == 0 else 'failed'})
            stream.flush()
            result['logSHA256'] = sha(log)
            write_json(result_path, result)
    assert result['exitCode'] == 0, 'xcodebuild phase failed; preserved log and receipt: ' + str(output)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=['dry-run', 'archive', 'verify', 'upload'])
    parser.add_argument('--expected-head', default='a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2')
    parser.add_argument('--out', type=Path, default=BASE / 'archive63')
    parser.add_argument('--derived-data', type=Path, default=BASE / 'archive63-derived')
    parser.add_argument('--qa-input-receipt', type=Path, help='Exact reviewed StoreShots test-only launch-precondition receipt; product input hashes stay strict')
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    archive = args.out / 'Bobby-1.7-63.xcarchive'
    preflight_path = args.out / 'preflight.json'
    archive_command = ['/usr/bin/xcrun', 'xcodebuild', '-project', 'Bobby.xcodeproj', '-scheme', 'Bobby',
                       '-configuration', 'Release', '-destination', 'generic/platform=iOS',
                       '-derivedDataPath', str(args.derived_data), '-archivePath', str(archive),
                       '-clonedSourcePackagesDirPath', str(CACHE), '-disableAutomaticPackageResolution',
                       '-skipPackageUpdates', '-jobs', '2',
                       'CODE_SIGN_STYLE=Manual', 'CODE_SIGN_IDENTITY=Apple Distribution',
                       'BOBBY_ARCHIVE_PROFILE_Bobby=' + PROFILE_ID,
                       'PROVISIONING_PROFILE_SPECIFIER=$(BOBBY_ARCHIVE_PROFILE_$(TARGET_NAME))',
                       'DEVELOPMENT_TEAM=' + TEAM,
                       'APS_ENVIRONMENT=production', 'MARKETING_VERSION=1.7', 'CURRENT_PROJECT_VERSION=63',
                       'COMPILER_INDEX_STORE_ENABLE=NO', 'archive']
    upload_command = ['/usr/bin/xcrun', 'xcodebuild', '-exportArchive', '-archivePath', str(archive),
                      '-exportPath', str(args.out / 'upload-export'), '-exportOptionsPlist', str(UPLOAD_OPTIONS)]
    if args.phase in ['dry-run', 'archive']:
        receipt = preflight(args.expected_head)
        write_json(args.out / ('dry-run-preflight.json' if args.phase == 'dry-run' else 'preflight.json'), receipt)
        if args.phase == 'dry-run':
            write_json(args.out / 'commands.json', {'archive': archive_command, 'upload': upload_command,
                       'archiveMinimumStartBytes': 4 * GIB, 'archiveStopBelowBytes': 2 * GIB,
                       'uploadMinimumStartBytes': 3 * GIB, 'uploadStopBelowBytes': 2 * GIB})
            print(json.dumps({'status': 'read-only preflight passed; no build or upload executed',
                              'sourceHead': receipt['sourceHead'], 'freeGiB': round(receipt['freeBytes'] / GIB, 2),
                              'out': str(args.out)}))
            return
        assert not archive.exists(), 'archive already exists; preserve it and use a fresh --out'
        monitored_run(archive_command, args.out / 'archive-phase', 4 * GIB, 2 * GIB, 3600)
    else:
        receipt = json.loads(preflight_path.read_text())
        assert receipt['sourceHead'] == args.expected_head, 'expected archive source does not match preserved preflight'
    if args.qa_input_receipt:
        approval = json.loads(args.qa_input_receipt.read_text())
        assert approval.get('archivePreflightSHA256') == sha(preflight_path), 'QA approval not bound to this archive preflight'
    verified = verify_archive(archive, receipt, args.qa_input_receipt)
    verification_name = 'archive-verification-with-qa-input-delta.json' if args.qa_input_receipt else 'archive-verification.json'
    write_json(args.out / verification_name, verified)
    if args.phase == 'upload':
        monitored_run(upload_command, args.out / 'upload-phase', 3 * GIB, 2 * GIB, 1800)
        log = (args.out / 'upload-phase/xcodebuild.log').read_text(errors='replace')
        success_lines = upload_success_lines(log)
        uploaded = bool(success_lines)
        write_json(args.out / 'upload-acceptance.json', {
            'recordedAtUTC': utc(), 'sourceHead': receipt['sourceHead'], 'version': '1.7', 'build': '63',
            'xcodebuildExitCode': 0, 'explicitUploadSuccessMarker': uploaded,
            'explicitUploadSuccessLines': success_lines,
            'result': 'upload accepted by xcodebuild' if uploaded else 'export exit0; explicit upload confirmation requires log review',
            'testFlightProcessing': 'not verified; requires separate remote build63 receipt',
            'installationAndPhysicalAcceptance': 'not verified'})
    print(json.dumps({'phase': args.phase, 'out': str(args.out), 'archiveVerification': 'passed'}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)
