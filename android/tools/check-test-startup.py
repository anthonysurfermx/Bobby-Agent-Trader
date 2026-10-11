"""Inspect the merged app and instrumentation manifests before the emulator starts."""
import sys
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

variant = sys.argv[1].lower()
android = '{http://schemas.android.com/apk/res/android}'
packages = {'xyz.bobbyprotocol.bobby': 'app', 'xyz.bobbyprotocol.bobby.test': 'instrumentation'}
selected = []
inventory = Path('build/emulator/startup')
inventory.mkdir(parents=True, exist_ok=True)
# AGP gives instrumentation a different output directory from the app. Inspect
# every textual build manifest and identify the final packages, not one AGP path.
for path in Path('app/build/intermediates').rglob('AndroidManifest.xml'):
    if not any(variant in part.lower() for part in path.parts):
        continue
    try:
        manifest = ET.parse(path).getroot()
    except ET.ParseError:
        continue  # Compiled binary manifests are also present among intermediates.
    kind = packages.get(manifest.get('package'))
    if kind:
        selected.append((path, manifest, kind))
(inventory / 'manifest-paths.txt').write_text('\n'.join(str(p) for p, _, _ in selected) + '\n')
assert {kind for _, _, kind in selected} == {'app', 'instrumentation'}, f'Missing package manifest: {selected}'
for path, manifest, kind in selected:
    names = {node.get(android + 'name') for node in manifest.iter('meta-data')}
    assert 'androidx.emoji2.text.EmojiCompatInitializer' not in names, f'Downloadable emoji startup in {path}'
    if kind == 'app':
        assert 'androidx.work.WorkManagerInitializer' in names, f'Missing reminder startup in {path}'
    else:
        assert not any(node.get(android + 'name') == 'androidx.startup.InitializationProvider' for node in manifest.iter('provider')), f'Shared startup class must not be a test-APK provider: {path}'
    destination = inventory / kind
    destination.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(path, destination / 'AndroidManifest.xml')
    print(f'System emoji font startup verified: {path}')
