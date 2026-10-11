"""Fail closed on the unsigned Play bundle's manifest, assets and ELF alignment."""
import hashlib
import json
import struct
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

bundle, bundletool = map(Path, sys.argv[1:3])
android = '{http://schemas.android.com/apk/res/android}'
manifest = ET.fromstring(subprocess.check_output([
    'java', '-jar', str(bundletool), 'dump', 'manifest', '--bundle=' + str(bundle)
]))
bundle_config = json.loads(subprocess.check_output([
    'java', '-jar', str(bundletool), 'dump', 'config', '--bundle=' + str(bundle)
]))
dimensions = bundle_config.get('optimizations', {}).get('splitsConfig', {}).get('splitDimension', [])
assert any(d.get('value') == 'LANGUAGE' and d.get('negate') is True for d in dimensions), 'Runtime language picker needs all language resources in the base APK'
native_config = bundle_config.get('optimizations', {}).get('uncompressNativeLibraries', {})
if native_config.get('enabled'):
    assert native_config.get('alignment') in ('PAGE_ALIGNMENT_16K', 'PAGE_ALIGNMENT_64K'), 'Play-generated APK libraries must be ZIP-aligned for 16 KB devices'
assert manifest.attrib['package'] == 'xyz.bobbyprotocol.bobby'
assert manifest.attrib[android + 'versionName'] == '1.2.0'
assert manifest.attrib[android + 'versionCode'] == '10'
assert manifest.find('uses-sdk').attrib[android + 'targetSdkVersion'] == '36'
app = manifest.find('application')
permissions = sorted(node.attrib[android + 'name'] for node in manifest.findall('uses-permission'))
for forbidden in ('ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'READ_CONTACTS', 'READ_MEDIA_AUDIO', 'READ_MEDIA_IMAGES', 'READ_MEDIA_VIDEO'):
    assert 'android.permission.' + forbidden not in permissions, forbidden
assert 'com.google.android.gms.permission.AD_ID' not in permissions, 'No advertising ID access'
assert not any('firebase' in node.attrib.get(android + 'name', '').lower() for node in app), 'FCM-off handoff must not contain Firebase components'
assert app.attrib.get(android + 'debuggable', 'false') == 'false'
assert app.attrib[android + 'usesCleartextTraffic'] == 'false'
assert app.attrib[android + 'allowBackup'] == 'false'
libraries = []
with zipfile.ZipFile(bundle) as archive:
    for name in archive.namelist():
        assert not (name.startswith('META-INF/') and name.upper().endswith(('.RSA', '.DSA', '.EC'))), 'Bundle must be unsigned'
        if '/assets/' in name:
            assert not any(x in name.lower() for x in ('fixture', '/tests/', 'dev-mock', 'contract.html')), name
        if name.endswith('.so'):
            elf = archive.read(name)
            assert elf[:4] == b'\x7fELF', name
            endian = '<' if elf[5] == 1 else '>'
            is64 = elf[4] == 2
            offset = struct.unpack_from(endian + ('Q' if is64 else 'I'), elf, 32 if is64 else 28)[0]
            entry_size, count = struct.unpack_from(endian + 'HH', elf, 54 if is64 else 42)
            for i in range(count):
                header = offset + i * entry_size
                kind = struct.unpack_from(endian + 'I', elf, header)[0]
                if kind == 1:
                    alignment = struct.unpack_from(endian + ('Q' if is64 else 'I'), elf, header + (48 if is64 else 28))[0]
                    assert alignment >= 16384, f'{name}: LOAD alignment {alignment}'
            libraries.append(name)
apk = Path('app/build/outputs/apk/release/app-release-unsigned.apk')
assert apk.is_file(), 'Same-build unsigned universal APK is required for phone handoff'
with zipfile.ZipFile(apk) as archive, apk.open('rb') as raw:
    for entry in archive.infolist():
        if entry.filename.endswith('.so') and entry.compress_type == zipfile.ZIP_STORED:
            raw.seek(entry.header_offset + 26)
            name_size, extra_size = struct.unpack('<HH', raw.read(4))
            data_offset = entry.header_offset + 30 + name_size + extra_size
            assert data_offset % 16384 == 0, f'{entry.filename}: APK ZIP offset {data_offset}'
result = {'file': bundle.name, 'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
          'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(),
          'bytes': bundle.stat().st_size, 'version': '1.2.0 (10)', 'targetSdk': 36,
          'package': manifest.attrib['package'], 'minSdk': int(manifest.find('uses-sdk').attrib[android + 'minSdkVersion']),
          'unsigned': True, 'debuggable': False, 'cleartext': False, 'allowBackup': False,
          'permissions': permissions, 'firebaseComponents': False, 'languageSplits': False,
          'bundleNativeAlignment': native_config.get('alignment'), 'apkUncompressedLibrariesZipAligned16K': True,
          'nativeLibraries': libraries,
          'universalApk': {'file': apk.name, 'bytes': apk.stat().st_size, 'sha256': hashlib.sha256(apk.read_bytes()).hexdigest()}}
print(json.dumps(result, indent=2))
Path('app/build/outputs/bundle/release/bundle-config.json').write_text(json.dumps(bundle_config, indent=2) + '\n')
Path('app/build/outputs/bundle/release/evidence.json').write_text(json.dumps(result, indent=2) + '\n')
