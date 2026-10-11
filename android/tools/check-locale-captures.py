"""Require a completed release journey and every listing-sized native capture."""
import os
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

language = os.environ['BOBBY_TEST_LOCALE']
root = Path('build/emulator')
cases = []
for report in (root / 'locale/results').rglob('TEST-*.xml'):
    cases.extend(ET.parse(report).getroot().iter('testcase'))
assert len(cases) == 1, f'{language}: expected one actual locale test, got {len(cases)}'
assert not any(case.find(tag) is not None for case in cases for tag in ('failure', 'error', 'skipped')), f'{language}: locale journey failed or skipped'
names = [
    '01-risk-notice', '02-risk-notice-end', '03-home', '03b-keyboard', '04-read',
    '04b-report-from-read', '05-profile-guest', '06-credits', '07-profile-account-controls',
    '08-memory-consent', '09-memory-consent-end', '10-memory', '11-memory-on-phone',
    '12-reminders', '13-invite', '14-report-content', '15-delete-confirmation', '16-account-deleted',
]
for name in names:
    path = root / 'shots' / f'locale-{language}-{name}.png'
    header = path.read_bytes()[:26]
    assert header[:8] == b'\x89PNG\r\n\x1a\n', path
    width, height = struct.unpack('>II', header[16:24])
    assert width >= 1080 and height >= 1920, f'{path}: {width}x{height}'
    assert max(width, height) <= 3840 and max(width, height) <= 2 * min(width, height), f'{path}: invalid Play dimensions'
    assert header[24] == 8 and header[25] == 2, f'{path}: Play needs 24-bit RGB PNG without alpha'
print(f'{language}: one passed release journey, {len(names)} native captures at listing resolution')
