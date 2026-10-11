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
assert manifest.attrib['package'] == 'xyz.bobbyprotocol.bobby'
assert manifest.attrib[android + 'versionName'] == '1.2.0'
assert manifest.attrib[android + 'versionCode'] == '10'
assert manifest.find('uses-sdk').attrib[android + 'targetSdkVersion'] == '36'
app = manifest.find('application')
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
result = {'file': bundle.name, 'sha256': hashlib.sha256(bundle.read_bytes()).hexdigest(),
          'bytes': bundle.stat().st_size, 'version': '1.2.0 (10)', 'targetSdk': 36,
          'unsigned': True, 'debuggable': False, 'cleartext': False, 'nativeLibraries': libraries}
print(json.dumps(result, indent=2))
Path('app/build/outputs/bundle/release/evidence.json').write_text(json.dumps(result, indent=2) + '\n')
