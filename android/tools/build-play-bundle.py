#!/usr/bin/env python3
"""Build a Play bundle using ignored private upload credentials, without printing them."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

android = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--generate-key', action='store_true', help='Create a new local upload key only if none exists')
parser.add_argument('--key-only', action='store_true', help='Prepare or check the local key without running Gradle')
parser.add_argument('--with-apk', action='store_true', help='Also build a locally signed release APK for device validation')
parser.add_argument('--gradle', default=str(android / 'gradlew'), help='Gradle executable; defaults to the checked-in wrapper')
args = parser.parse_args()
private = android / '.signing'
keystore = private / 'upload.p12'
password_file = private / 'upload.password'
metadata_file = private / 'upload.json'
ignored = subprocess.run(['git', 'check-ignore', '--quiet', str(password_file)], cwd=android).returncode == 0
if not ignored:
    sys.exit('Refusing private signing setup: the credential directory must be ignored by Git.')
files = [keystore, password_file, metadata_file]
if args.generate_key and not any(path.exists() for path in files):
    private.mkdir(mode=0o700, exist_ok=True)
    private.chmod(0o700)
    descriptor = os.open(password_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        handle.write(secrets.token_urlsafe(36) + '\n')
    java_home = os.environ.get('JAVA_HOME')
    keytool = str(Path(java_home) / 'bin/keytool') if java_home else 'keytool'
    result = subprocess.run([keytool, '-genkeypair', '-storetype', 'PKCS12', '-keystore', str(keystore),
        '-alias', 'bobby-upload', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000',
        '-dname', 'CN=Bobby Android Upload', '-storepass:file', str(password_file),
        '-keypass:file', str(password_file), '-noprompt'], capture_output=True)
    if result.returncode:
        sys.exit('Upload-key generation failed. Private files were retained; no existing key was replaced.')
    keystore.chmod(0o600)
    descriptor = os.open(metadata_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w') as handle:
        json.dump({'keystore': 'upload.p12', 'alias': 'bobby-upload', 'store_type': 'PKCS12'}, handle)
        handle.write('\n')
if not all(path.is_file() for path in files):
    sys.exit('Private upload files are missing or incomplete. Use --generate-key only for a new app.')
metadata = json.loads(metadata_file.read_text())
if metadata.get('keystore') != keystore.name or metadata.get('alias') != 'bobby-upload':
    sys.exit('Unexpected private upload metadata; review the existing key without replacing it.')
password = password_file.read_text().strip()
if len(password) < 20:
    sys.exit('The private upload password does not meet the local generation policy.')
if args.key_only:
    print('Private upload key is ready locally. No build, upload or distribution performed.')
    sys.exit(0)
environment = os.environ.copy()
environment.update({'BOBBY_ANDROID_KEYSTORE': str(keystore), 'BOBBY_ANDROID_STORE_PASSWORD': password,
    'BOBBY_ANDROID_KEY_ALIAS': metadata['alias'], 'BOBBY_ANDROID_KEY_PASSWORD': password})
# Secrets are passed through the child environment, never command-line arguments or BuildConfig.
tasks = [':app:playBundle'] + ([':app:assembleRelease'] if args.with_apk else [])
result = subprocess.run([args.gradle, *tasks, '--no-daemon'], cwd=android, env=environment)
if result.returncode:
    sys.exit(result.returncode)
print('Signed local Play bundle generated. Back up all private .signing files before distribution.')
