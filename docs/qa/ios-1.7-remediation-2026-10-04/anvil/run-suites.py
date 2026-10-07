#!/usr/bin/env python3
"""Execute only the two isolated Anvil ABI suites against private local nodes."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time

ROOT = Path('/private/tmp/bobby-ios17-remediation-20261004/anvil')
CANDIDATE = Path('/Users/mrrobot/.codex/worktrees/bobby-android-parity-ios17/Bobby-Agent-Trader')
PRIMARY = Path('/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/GitHub/Bobby-Agent-Trader')
HEAD = 'a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2'
GIB = 1024 ** 3
MAX_BYTES = 250 * 1024 ** 2
NODE = shutil.which('node')


def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def owned_bytes():
    return sum(p.stat().st_size for p in ROOT.rglob('*') if p.is_file() and not p.is_symlink())


def save(result):
    (ROOT / 'result.json').write_text(json.dumps(result, indent=2) + '\n')


def prepare():
    assert subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=CANDIDATE, text=True).strip() == HEAD
    assert shutil.disk_usage(ROOT).free >= int(2.5 * GIB), 'Anvil not started: less than 2.5 GiB free'
    for directory in ['scripts', 'contracts/out', 'contracts/src', 'tmp']:
        (ROOT / directory).mkdir(parents=True, exist_ok=True)
    for name in ['api', 'node_modules']:
        link = ROOT / name
        if not link.exists(): link.symlink_to(CANDIDATE / name, target_is_directory=True)
        assert link.is_symlink() and link.resolve() == (CANDIDATE / name).resolve()
    files = []
    for suite in ['hardness', 'bounties']:
        relative = 'scripts/test-' + suite + '-abi-anvil.mts'
        original = CANDIDATE / relative
        runtime = ROOT / relative
        content = original.read_text()
        old = 'const PORT = 8545 + Math.floor(Math.random() * 1000);'
        assert content.count(old) == 1
        content = content.replace(old, "const PORT = Number(process.env.BOBBY_ANVIL_QA_PORT); // isolated QA-owned free port")
        runtime.write_text(content)
        files.append({'path': relative, 'sourceSHA256': sha(original), 'runtimeSHA256': sha(runtime),
                      'runtimeChange': 'Only port allocation; test assertions and backend imports unchanged'})
    for contract in ['HardnessRegistry', 'BobbyAdversarialBounties']:
        relative = Path('contracts/out') / (contract + '.sol') / (contract + '.json')
        artifact = PRIMARY / relative
        destination = ROOT / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(artifact, destination)
        source = CANDIDATE / 'contracts/src' / (contract + '.sol')
        shutil.copyfile(source, ROOT / 'contracts/src' / (contract + '.sol'))
        files.append({'path': str(relative), 'artifactOrigin': str(artifact), 'sha256': sha(destination),
                      'sourceContractSHA256': sha(source)})
    code = """import fs from 'node:fs';import{keccak256,toUtf8Bytes}from'ethers';
const result=[];for(const name of ['HardnessRegistry','BobbyAdversarialBounties']){
const a=JSON.parse(fs.readFileSync('contracts/out/'+name+'.sol/'+name+'.json','utf8'));
const m=typeof a.metadata==='string'?JSON.parse(a.metadata):a.metadata;
for(const [relative,entry]of Object.entries(m.sources)){
if(keccak256(toUtf8Bytes(fs.readFileSync('contracts/'+relative,'utf8')))!==entry.keccak256)throw Error('source mismatch');}
const t=fs.readFileSync('api/_lib/'+(name==='HardnessRegistry'?'hardness-registry.abi.ts':'adversarial-bounties.abi.ts'),'utf8');
if(JSON.stringify(JSON.parse(t.slice(t.indexOf('['),t.lastIndexOf(']')+1)))!==JSON.stringify(a.abi))throw Error('ABI mismatch');
result.push({contract:name,sourceKeccakMatches:true,generatedABIEqualsArtifact:true,compiler:m.compiler.version,optimizer:m.settings.optimizer,viaIR:m.settings.viaIR});}
console.log(JSON.stringify(result));"""
    provenance = json.loads(subprocess.check_output([NODE, '--input-type=module', '-e', code], cwd=ROOT, text=True))
    assert owned_bytes() <= MAX_BYTES
    return files, provenance


def run_suite(suite, result):
    assert shutil.disk_usage(ROOT).free >= int(2.5 * GIB), 'suite not started: free space below 2.5 GiB'
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1', 0))
        port = reservation.getsockname()[1]
    audit = ROOT / (suite + '-network.jsonl')
    assert not audit.exists(), 'preserve existing run; this suite already has evidence'
    log = ROOT / (suite + '.log')
    argv = [NODE, str(ROOT / 'node_modules/tsx/dist/cli.mjs'),
            str(ROOT / ('scripts/test-' + suite + '-abi-anvil.mts'))]
    env = {k: os.environ[k] for k in ['HOME'] if k in os.environ}
    env.update({'PATH': '/Users/mrrobot/.foundry/bin:/opt/homebrew/bin:/usr/bin:/bin',
                'TMPDIR': str(ROOT / 'tmp'), 'PROTOCOL_CHAIN': 'base',
                'NODE_OPTIONS': '--require ' + str(ROOT / 'network-guard.cjs'),
                'BOBBY_ANVIL_QA_PORT': str(port), 'BOBBY_ANVIL_QA_AUDIT': str(audit)})
    entry = {'suite': suite, 'startedAtUTC': utc(), 'argv': argv, 'cwd': str(ROOT),
             'port': port, 'portPreflight': 'bound successfully on127.0.0.1 before launch',
             'log': str(log), 'freeBeforeBytes': shutil.disk_usage(ROOT).free}
    result['suites'].append(entry); save(result)
    print('START ' + suite + ' port=' + str(port), flush=True)
    start = time.monotonic()
    with log.open('w') as stream:
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=stream,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        try:
            while process.poll() is None:
                free = shutil.disk_usage(ROOT).free
                entry['minimumObservedFreeBytes'] = min(entry.get('minimumObservedFreeBytes', free), free)
                reason = 'free space below2 GiB' if free < 2 * GIB else 'private footprint exceeded250 MiB' if owned_bytes() > MAX_BYTES else 'timeout180 seconds' if time.monotonic() - start > 180 else None
                if reason:
                    entry['stopReason'] = reason
                    os.killpg(process.pid, signal.SIGTERM)
                    try: process.wait(timeout=8)
                    except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait()
                    break
                time.sleep(0.25)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try: process.wait(timeout=8)
                except subprocess.TimeoutExpired: os.killpg(process.pid, signal.SIGKILL); process.wait()
    records = [json.loads(line) for line in audit.read_text().splitlines()] if audit.exists() else []
    spawned = [r for r in records if r['type'] == 'anvil-spawn']
    assert len(spawned) <= 1
    for child in spawned:
        # Only the exact child recorded by this suite can be terminated here.
        try:
            os.kill(child['childPid'], 0)
        except ProcessLookupError:
            continue
        exited = any(r['type'] == 'anvil-exit' and r['childPid'] == child['childPid'] for r in records)
        if not exited:
            os.kill(child['childPid'], signal.SIGTERM)
            entry['ownedAnvilCleanup'] = 'terminated exact recorded child after runner completion'
    with socket.socket() as verification:
        verification.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        verification.bind(('127.0.0.1', port))
    tcp = [r for r in records if r['type'] == 'tcp']
    assertion_records = [r['assertions'] for r in records if r['type'] == 'node-exit']
    text = log.read_text(errors='replace')
    entry.update({'endedAtUTC': utc(), 'elapsedSeconds': round(time.monotonic() - start, 2),
                  'exitCode': process.returncode, 'logSHA256': sha(log), 'auditSHA256': sha(audit) if audit.exists() else None,
                  'ownedAnvilProcesses': len(spawned), 'portAfterRun': 'free',
                  'tcpConnectCalls': len(tcp), 'blockedTcpConnectCalls': sum(not r['allowed'] for r in tcp),
                  'actualNetworkDestinations': sorted({str(r['host']) + ':' + str(r['port']) for r in tcp if r['allowed']}),
                  'assertionCalls': sum(r['calls'] for r in assertion_records),
                  'failedAssertionCalls': sum(r['failures'] for r in assertion_records),
                  'logicalOkSectionsFromLog': sum(line.startswith('ok  ') for line in text.splitlines()),
                  'successMarker': suite + ' ABI (anvil) tests passed' in text})
    entry['passed'] = process.returncode == 0 and entry['successMarker'] and len(spawned) == 1 and not entry['blockedTcpConnectCalls'] and not entry['failedAssertionCalls']
    save(result); print('DONE ' + suite + ': ' + json.dumps(entry), flush=True)
    return entry['passed']


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    files, provenance = prepare()
    result = {'startedAtUTC': utc(), 'candidate': str(CANDIDATE), 'sourceHead': HEAD,
              'workspace': str(ROOT), 'files': files, 'artifactProvenance': provenance,
              'anvilExecutable': '/Users/mrrobot/.foundry/bin/anvil', 'toolVersion': '1.5.1-stable',
              'environment': 'OnlyHOME plus explicit local PATH/TMPDIR/QA guard variables; no provider credentials',
              'minimumStartBytes': int(2.5 * GIB), 'stopBelowFreeBytes': 2 * GIB,
              'maximumPrivateFootprintBytes': MAX_BYTES, 'suites': []}
    save(result)
    try:
        for suite in ['hardness', 'bounties']:
            if not run_suite(suite, result): break
    except Exception as error:
        result['error'] = str(error)
    finally:
        result.update({'endedAtUTC': utc(), 'privateFootprintBytes': owned_bytes(),
                       'freeAfterBytes': shutil.disk_usage(ROOT).free,
                       'passed': len(result['suites']) == 2 and all(x.get('passed') for x in result['suites']) and not result.get('error')})
        save(result)
    print(json.dumps(result), flush=True)
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
