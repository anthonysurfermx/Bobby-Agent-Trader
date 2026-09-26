#!/usr/bin/env python3
"""Render six deterministic App Store concepts and their contact sheet with local Chrome."""

from pathlib import Path
import argparse
import os
import shutil
import signal
import struct
import subprocess
import tempfile
import time

HERE = Path(__file__).resolve().parent
CHROME = Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
SLIDE_SIZE = (1320, 2868)
CONTACT_SIZE = (1800, 2640)


def capture(page_uri: str, output: Path, size: tuple[int, int], label: str) -> Path:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    profile = Path(tempfile.mkdtemp(prefix=f'bobby-screen-{label}-'))
    command = [
        str(CHROME), '--headless=new', '--disable-gpu', '--disable-background-networking',
        '--disable-component-update', '--disable-sync', '--hide-scrollbars',
        '--no-first-run', '--no-default-browser-check', f'--user-data-dir={profile}',
        f'--window-size={size[0]},{size[1]}', '--force-device-scale-factor=1',
        '--virtual-time-budget=2000', f'--screenshot={output}',
        page_uri,
    ]
    process = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    try:
        deadline = time.monotonic() + 30
        last_size = -1
        stable = 0
        while time.monotonic() < deadline:
            byte_count = output.stat().st_size if output.exists() else 0
            stable = stable + 1 if byte_count > 100_000 and byte_count == last_size else 0
            if stable >= 3:
                break
            last_size = byte_count
            time.sleep(.25)
        else:
            raise RuntimeError(f'Chrome did not render {label}')
    finally:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=3)
        shutil.rmtree(profile, ignore_errors=True)

    with output.open('rb') as file:
        header = file.read(24)
    if header[:8] != b'\x89PNG\r\n\x1a\n' or struct.unpack('>II', header[16:24]) != size:
        raise RuntimeError(f'Unexpected dimensions for {output}')
    print(f'{label}: {output.name} ({output.stat().st_size:,} bytes)')
    return output


def render(slide: str) -> Path:
    page_uri = f'{(HERE / "index.html").as_uri()}?slide={slide}'
    return capture(page_uri, HERE / 'screenshots' / f'{slide}-nucleo-editorial.png', SLIDE_SIZE, slide)


def render_contact() -> Path:
    return capture((HERE / 'contact.html').as_uri(), HERE / 'contact-sheet.png', CONTACT_SIZE, 'contact')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--only', choices=[f'{number:02}' for number in range(1, 7)])
    group.add_argument('--contact', action='store_true')
    args = parser.parse_args()
    if not CHROME.exists():
        raise SystemExit(f'Chrome unavailable: {CHROME}')
    if args.contact:
        render_contact()
    elif args.only:
        render(args.only)
    else:
        for item in [f'{number:02}' for number in range(1, 7)]:
            render(item)
        render_contact()
