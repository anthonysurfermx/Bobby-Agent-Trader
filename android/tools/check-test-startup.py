"""Inspect the merged app and instrumentation manifests before the emulator starts."""
import sys
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

variant = sys.argv[1].lower()
android = '{http://schemas.android.com/apk/res/android}'
manifests = []
for name in ('merged_manifest', 'merged_manifests'):
    manifests.extend(Path('app/build/intermediates', name).rglob('AndroidManifest.xml'))
selected = [p for p in manifests if variant in p.parts or variant + 'AndroidTest' in p.parts]
assert any(variant + 'AndroidTest' in p.parts for p in selected), 'Missing merged instrumentation manifest'
assert any(variant in p.parts for p in selected), 'Missing merged app manifest'
for path in selected:
    manifest = ET.parse(path).getroot()
    names = {node.get(android + 'name') for node in manifest.iter('meta-data')}
    assert 'androidx.emoji2.text.EmojiCompatInitializer' not in names, f'Downloadable emoji startup in {path}'
    if variant in path.parts:
        assert 'androidx.work.WorkManagerInitializer' in names, f'Missing reminder startup in {path}'
    destination = Path('build/emulator/startup') / ('instrumentation' if variant + 'AndroidTest' in path.parts else 'app')
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, destination / 'AndroidManifest.xml')
    print(f'System emoji font startup verified: {path}')
