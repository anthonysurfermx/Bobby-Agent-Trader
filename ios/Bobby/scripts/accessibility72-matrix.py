#!/usr/bin/env python3
"""Capture the offline 1.8 (72) matrix: six languages × SE/Max × default/AX5, 72 PNGs."""
import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

CAPTURE = Path(__file__).with_name('redesign-shots.py')
spec = importlib.util.spec_from_file_location('bobby_redesign_capture', CAPTURE)
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


def timestamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def save_summary(path, value):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New evidence folder; every run retains its log, summary and three named screenshots')
    parser.add_argument('--derived-data', type=Path, required=True, help='One external DerivedData directory, reused throughout the matrix')
    parser.add_argument('--package-cache', type=Path, help='Existing reusable SourcePackages cache (passed to redesign-shots.py)')
    parser.add_argument('--skip-build', action='store_true', help='Products already built in --derived-data; otherwise build only before the first run')
    parser.add_argument('--language', action='append', choices=capture.LOCALES, help='Limit to selected languages; repeat (default all six)')
    parser.add_argument('--device', action='append', choices=['se', 'max'], help='Limit to selected devices; repeat (default SE and Max)')
    parser.add_argument('--text-size', action='append', choices=['default', 'ax5'], help='Limit to selected sizes; repeat (default both)')
    parser.add_argument('--settle-system', type=int, choices=range(61), default=0, help='Seconds to settle system notifications after each boot')
    args = parser.parse_args()
    args.output = args.output.expanduser().resolve()
    args.derived_data = args.derived_data.expanduser().resolve()
    languages = list(dict.fromkeys(args.language or capture.LOCALES))
    devices = list(dict.fromkeys(args.device or ['se', 'max']))
    sizes = list(dict.fromkeys(args.text_size or ['default', 'ax5']))
    summary_path = args.output / 'matrix-summary.json'
    if summary_path.exists(): parser.error(f'Refusing to overwrite matrix evidence: {summary_path}')
    capture.check_disk([args.output, args.derived_data])
    args.output.mkdir(parents=True, exist_ok=True)
    summary = {'startedAt': timestamp(), 'finishedAt': None, 'status': 'running',
               'languages': languages, 'devices': devices, 'textSizes': sizes,
               'expectedRuns': len(languages) * len(devices) * len(sizes),
               'expectedScreenshots': 3 * len(languages) * len(devices) * len(sizes),
               'derivedData': str(args.derived_data), 'runs': [], 'visualReview': 'pending'}
    save_summary(summary_path, summary)
    build_done = args.skip_build
    try:
        # The capture driver owns its simulator lock, refuses any already booted phone, and
        # shuts each owned evidence phone down before returning. Never parallelize this loop.
        for device in devices:
            for language in languages:
                for size in sizes:
                    capture.check_disk([args.output, args.derived_data])
                    folder = args.output / (capture.DEVICES[device][2] + '-' + language + capture.TEXT_SIZES[size][2])
                    command = [sys.executable, str(CAPTURE), '--output', str(args.output),
                               '--derived-data', str(args.derived_data), '--device', device,
                               '--language', language, '--text-size', size, '--test', 'Accessibility72Shots',
                               '--settle-system', str(args.settle_system)]
                    if args.package_cache: command += ['--package-cache', str(args.package_cache.expanduser().resolve())]
                    if build_done: command.append('--skip-build')
                    entry = {'device': device, 'language': language, 'textSize': size,
                             'folder': str(folder.relative_to(args.output)), 'startedAt': timestamp(),
                             'command': command, 'status': 'running'}
                    summary['runs'].append(entry); save_summary(summary_path, summary)
                    print(f'[{len(summary["runs"])}/{summary["expectedRuns"]}] {device} {language} {size}', flush=True)
                    log_path = args.output / f'matrix-{device}-{language}-{size}.log'
                    with log_path.open('w') as log:
                        outcome = subprocess.run(command, text=True, stdout=log, stderr=subprocess.STDOUT)
                    entry.update({'finishedAt': timestamp(), 'exitCode': outcome.returncode,
                                  'driverLog': log_path.name})
                    run_summary = folder / 'summary.json'
                    if run_summary.is_file(): entry['tests'] = json.loads(run_summary.read_text())
                    receipt = folder / 'run.json'
                    if receipt.is_file(): entry['capture'] = json.loads(receipt.read_text())
                    entry['screenshots'] = sorted(path.name for path in folder.glob('*.png'))
                    counts = entry.get('tests', {})
                    passed = (outcome.returncode == 0 and counts.get('passedTests') == 3
                              and counts.get('failedTests') == 0 and counts.get('skippedTests') == 0
                              and len(entry['screenshots']) == 3)
                    entry['status'] = 'pass' if passed else 'failed'
                    save_summary(summary_path, summary)
                    if not passed:
                        raise RuntimeError(f'Matrix stopped at {device}/{language}/{size}; inspect {log_path}')
                    build_done = True
        summary['status'] = 'pass'
    except BaseException as error:
        summary['status'] = 'failed'; summary['error'] = str(error)
        raise
    finally:
        summary['finishedAt'] = timestamp()
        summary['exportedScreenshots'] = sum(len(run.get('screenshots', [])) for run in summary['runs'])
        save_summary(summary_path, summary)
    print(f'PASS: {len(summary["runs"])} runs, {summary["exportedScreenshots"]} screenshots; visual review pending. {summary_path}', flush=True)


if __name__ == '__main__':
    try: main()
    except (RuntimeError, subprocess.CalledProcessError) as error:
        print(f'accessibility72-matrix: {error}', file=sys.stderr); sys.exit(1)
