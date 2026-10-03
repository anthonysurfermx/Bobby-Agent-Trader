"""Local-only two-transaction regression for first subscription insert.
Run after test-android-compatibility.sql on its dedicated isolated fixture.
"""
import argparse
from pathlib import Path
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--socket', required=True, help='Absolute private Unix socket directory')
parser.add_argument('--port', default='55617')
parser.add_argument('--psql', default='psql')
args = parser.parse_args()
if not Path(args.socket).is_absolute() or not Path(args.socket).is_dir():
    raise SystemExit('Pass a private local Unix socket directory; no remote host is accepted')
base = [args.psql, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', args.socket, '-p', args.port,
        '-d', 'bobby_android_compatibility_test']
owner = '11111111-1111-4111-8111-000000000008'
# The SQL fixture leaves this identity unused. Its parent lock serializes both first INSERTs.
first = subprocess.Popen(base + ['-c', f"BEGIN; INSERT INTO bobby_subscriptions(identity_id,provider,status,current_period_end) VALUES('{owner}','google','active',now()+interval '30 days'); SELECT pg_sleep(1.5); COMMIT;"],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    # Wait for the real parent/row write to reach pg_sleep; do not assume launch order.
    for _ in range(30):
        ready = subprocess.run(base + ['-c', "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event='PgSleep'"],
                               capture_output=True, text=True, check=True)
        if ready.stdout.strip() == '1':
            break
        time.sleep(0.05)
    else:
        raise AssertionError('First fixture transaction did not reach its lock-held wait')
    second = subprocess.run(base + ['-c', f"INSERT INTO bobby_subscriptions(identity_id,provider,status,current_period_end) VALUES('{owner}','stripe','active',now()+interval '30 days') ON CONFLICT(identity_id) DO UPDATE SET provider=excluded.provider,status=excluded.status,current_period_end=excluded.current_period_end;"],
                            capture_output=True, text=True, timeout=10)
    first_out, first_err = first.communicate(timeout=10)
    assert first.returncode == 0, first_err
    assert second.returncode != 0 and 'subscription_provider_conflict' in second.stderr, second.stderr
    final = subprocess.run(base + ['-c', f"SELECT provider FROM bobby_subscriptions WHERE identity_id='{owner}'"], capture_output=True, text=True, check=True)
    assert final.stdout.strip() == 'google', final.stdout
    print('Android subscription concurrency: 2 checks passed (first-insert conflict; provider preserved)')
finally:
    if first.poll() is None:
        first.terminate()
        first.wait(timeout=10)
